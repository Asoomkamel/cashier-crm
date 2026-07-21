"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useApp, useT } from "@/lib/store";
import { Card, PageTitle, Button, Input, Select, Textarea, Modal, Table, Badge } from "@/components/ui";
import {
  CatalogItem,
  Customer,
  ExpectedPaymentMethod,
  Location,
  RequestType,
  ServiceOrder,
  ServiceOrderItem,
  ServiceOrderStatus,
  StaffUser,
  uid,
} from "@/lib/types";
import { renderWhatsAppTemplate, openWhatsApp, openGoogleMaps } from "@/lib/whatsapp";
import { IconWhatsApp, IconWhatsAppTechnician, IconMapPin } from "@/components/icons";
import { exportToCSV } from "@/lib/csv";
import { downloadWorkbookXlsx, makeXlsxFileName } from "@/lib/xlsxExport";
import { readWorkbookImport } from "@/lib/xlsxImport";
import { applyBackupPayload } from "@/lib/backupPayload";
import { saveToSupabaseBackup } from "@/lib/supabaseBackup";
import { buildFullPayload } from "@/lib/fullPayload";
import { NORMALIZED_TABLES_READY } from "@/lib/featureFlags";
import { confirmWithAdminPassword } from "@/lib/security";
import {
  SERVICE_ORDER_STATUSES,
  fromDateTimeLocal,
  hasExecutionAppointment,
  requestTypeLabel as getRequestTypeLabel,
  serviceOrderStatusLabel,
  serviceOrderStatusTone,
  toDateTimeLocal,
} from "@/lib/serviceOrderLabels";

type Step = 1 | 2 | 3 | 4 | 5;
type OrderView = "urgent" | "completed";
type TemplateTarget = { order: ServiceOrder; to: "customer" | "technician" } | null;

interface NewCustomerForm {
  name: string;
  phone: string;
  city: string;
  district: string;
  mapUrl: string;
  notes: string;
}

interface UrgentForm {
  customerId: string;
  customerName: string;
  customerPhone: string;
  locationId: string;
  newLocation: { city: string; district: string; mapUrl: string };
  addingNewCustomer: boolean;
  newCustomer: NewCustomerForm;
  requestType: RequestType | "";
  issue: string;
  serviceDescription: string;
  selectedItemId: string;
  selectedItemQty: string;
  itemSearch: string;
  requestedItems: ServiceOrderItem[];
  newProductName: string;
  newProductBarcode: string;
  newProductPrice: string;
  showQuickProduct: boolean;
  expectedAmount: string;
  expectedPaymentMethod: ExpectedPaymentMethod | "";
  expectedPaidAmount: string;
  scheduledDay: string;
  scheduledPeriod: "morning" | "evening" | "";
  scheduledHour: string;
  useCustomDate: boolean;
  requiredSpecialties: string[];
  assignedTechnicianIds: string[];
  marketerName: string;
  marketerPhone: string;
  notes: string;
}

const EMPTY_CUSTOMER: NewCustomerForm = { name: "", phone: "", city: "", district: "", mapUrl: "", notes: "" };

const EMPTY: UrgentForm = {
  customerId: "",
  customerName: "",
  customerPhone: "",
  locationId: "",
  newLocation: { city: "", district: "", mapUrl: "" },
  addingNewCustomer: false,
  newCustomer: EMPTY_CUSTOMER,
  requestType: "",
  issue: "",
  serviceDescription: "",
  selectedItemId: "",
  selectedItemQty: "1",
  itemSearch: "",
  requestedItems: [],
  newProductName: "",
  newProductBarcode: "",
  newProductPrice: "",
  showQuickProduct: false,
  expectedAmount: "",
  expectedPaymentMethod: "",
  expectedPaidAmount: "",
  scheduledDay: "",
  scheduledPeriod: "",
  scheduledHour: "",
  useCustomDate: false,
  requiredSpecialties: [],
  assignedTechnicianIds: [],
  marketerName: "",
  marketerPhone: "",
  notes: "",
};

function next7Days(): { label: string; value: string }[] {
  return Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const value = d.toISOString().slice(0, 10);
    const label = i === 0 ? "اليوم" : i === 1 ? "غداً" : d.toLocaleDateString("ar-SA", { weekday: "long", month: "short", day: "numeric" });
    return { label, value };
  });
}

function buildTimestamp(day: string, period: string, hour: string): number {
  if (!day) return Date.now();
  const base = new Date(day);
  if (hour) {
    const [h, m] = hour.split(":").map(Number);
    base.setHours(Number.isFinite(h) ? h : period === "evening" ? 16 : 9, Number.isFinite(m) ? m : 0, 0, 0);
  } else {
    base.setHours(period === "evening" ? 16 : 9, 0, 0, 0);
  }
  return base.getTime();
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function getRequiredSpecialties(order: ServiceOrder): string[] {
  if (Array.isArray(order.requiredSpecialties) && order.requiredSpecialties.length > 0) return order.requiredSpecialties.filter(Boolean);
  return order.requiredSpecialty ? [order.requiredSpecialty] : [];
}

function technicianHasAllSpecialties(tech: StaffUser, required: string[]): boolean {
  if (required.length === 0) return false;
  const owned = new Set((tech.specialties || []).map(normalize));
  return required.every((specialty) => owned.has(normalize(specialty)));
}

function isEligibleForTechnician(order: ServiceOrder, tech?: StaffUser | null): boolean {
  if (!tech || tech.role !== "technician") return false;
  if (order.status !== "pending") return false;
  if ((order.rejectedByTechnicianIds || []).includes(tech.id)) return false;
  if (order.acceptedByTechnicianId && order.acceptedByTechnicianId !== tech.id) return false;

  const assignedIds = order.assignedTechnicianIds || (order.technicianId ? [order.technicianId] : []);
  const assignedNames = order.assignedTechnicianNames || (order.technicianName ? [order.technicianName] : []);
  if (assignedIds.length > 0 || assignedNames.length > 0) {
    return assignedIds.includes(tech.id) || assignedNames.includes(tech.name);
  }

  return technicianHasAllSpecialties(tech, getRequiredSpecialties(order));
}

function SectionHeader({ step, label, total = 5 }: { step: number; label: string; total?: number }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{step}</div>
      <h3 className="font-semibold text-slate-800">{label}</h3>
      <div className="ms-auto text-xs text-slate-400">{step}/{total}</div>
    </div>
  );
}

export default function UrgentOrdersPage() {
  const { urgentOrders, setUrgentOrders, appointments, customers, setCustomers, users, catalog, setCatalog, settings, setSettings, activeUser } = useApp();
  const t = useT();
  const ar = settings.language === "ar";
  const canAdminRequests = activeUser?.role === "admin" || activeUser?.role === "supervisor";
  const isTechnician = activeUser?.role === "technician";
  const technicians = users.filter((u) => u.role === "technician");
  const days7 = next7Days();

  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [form, setForm] = useState<UrgentForm>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [templateTarget, setTemplateTarget] = useState<TemplateTarget>(null);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [excelImportStatus, setExcelImportStatus] = useState("");
  const [rescheduling, setRescheduling] = useState<ServiceOrder | null>(null);
  const [newDate, setNewDate] = useState("");
  const [nextVisitOrder, setNextVisitOrder] = useState<ServiceOrder | null>(null);
  const [nextVisitDate, setNextVisitDate] = useState("");
  const [priceSuggestion, setPriceSuggestion] = useState<number | null>(null);
  const [orderView, setOrderView] = useState<OrderView>("urgent");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1" && canAdminRequests) {
      setOpen(true);
      setCurrentStep(1);
      params.delete("new");
      window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`);
    }
  }, [canAdminRequests]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncViewFromHash = () => {
      setOrderView(window.location.hash === "#completed" ? "completed" : "urgent");
    };

    syncViewFromHash();
    window.addEventListener("hashchange", syncViewFromHash);
    return () => window.removeEventListener("hashchange", syncViewFromHash);
  }, []);

  const changeOrderView = (view: OrderView) => {
    setOrderView(view);
    if (typeof window !== "undefined") {
      const hash = view === "completed" ? "#completed" : "#urgent";
      window.history.replaceState({}, "", `${window.location.pathname}${hash}`);
    }
  };

  const selectedCustomer = customers.find((c) => c.id === form.customerId);
  const customerLocations = selectedCustomer?.locations || [];

  const set = (patch: Partial<UrgentForm>) => setForm((prev) => ({ ...prev, ...patch }));
  const clearError = (key: string) => setErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });

  const allItems = catalog.filter((c) => c.type === "product" || c.type === "service");
  const filteredItems = allItems.filter((item) => {
    const q = form.itemSearch.trim().toLowerCase();
    if (!q) return true;
    return (item.name || "").toLowerCase().includes(q) || (item.barcode || "").toLowerCase().includes(q) || (item.sku || "").toLowerCase().includes(q);
  }).slice(0, 50);

  const matchingTechnicians = technicians.filter((tech) => technicianHasAllSpecialties(tech, form.requiredSpecialties));
  const otherTechnicians = technicians.filter((tech) => !matchingTechnicians.some((match) => match.id === tech.id));

  const customerResults = useMemo(() => {
    if (!customerSearch.trim()) return [];
    const q = customerSearch.toLowerCase();
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)).slice(0, 8);
  }, [customers, customerSearch]);

  const visibleOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return urgentOrders.filter((order) => {
      const matchesView = orderView === "completed"
        ? order.status === "completed"
        : order.status !== "completed";
      if (!matchesView) return false;

      if (isTechnician) {
        if (orderView === "completed") {
          const belongsToTechnician =
            order.acceptedByTechnicianId === activeUser?.id ||
            order.technicianId === activeUser?.id ||
            order.acceptedByTechnicianName === activeUser?.name ||
            order.technicianName === activeUser?.name;
          if (!belongsToTechnician) return false;
        } else if (!isEligibleForTechnician(order, activeUser)) {
          return false;
        }
      }

      if (!q) return true;
      return (
        (order.customerName || "").toLowerCase().includes(q) ||
        (order.customerPhone || "").includes(search) ||
        (order.issue || "").toLowerCase().includes(q) ||
        (order.technicianName || "").toLowerCase().includes(q) ||
        getRequiredSpecialties(order).join(" ").toLowerCase().includes(q)
      );
    });
  }, [urgentOrders, orderView, search, activeUser, isTechnician]);

  const statusLabel = (status: ServiceOrderStatus) => serviceOrderStatusLabel(status, ar ? "ar" : "en");
  const requestTypeLabel = (type?: RequestType | "") => getRequestTypeLabel(type, ar ? "ar" : "en");
  const urgentCount = urgentOrders.filter((order) => order.status !== "completed").length;
  const completedCount = urgentOrders.filter((order) => order.status === "completed").length;

  const selectCustomer = (customer: Customer) => {
    set({ customerId: customer.id, customerName: customer.name, customerPhone: customer.phone, locationId: "", addingNewCustomer: false });
    setCustomerSearch("");
  };

  const toggleSpecialty = (specialty: string) => {
    set({
      requiredSpecialties: form.requiredSpecialties.includes(specialty)
        ? form.requiredSpecialties.filter((item) => item !== specialty)
        : [...form.requiredSpecialties, specialty],
    });
  };

  const toggleAssignedTechnician = (id: string) => {
    set({
      assignedTechnicianIds: form.assignedTechnicianIds.includes(id)
        ? form.assignedTechnicianIds.filter((item) => item !== id)
        : [...form.assignedTechnicianIds, id],
    });
  };

  const syncItemsTotal = (items: ServiceOrderItem[]) => {
    const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    set({ requestedItems: items, expectedAmount: total > 0 ? total.toFixed(2) : form.expectedAmount });
  };

  const addItem = () => {
    const catalogItem = allItems.find((item) => item.id === form.selectedItemId);
    if (!catalogItem) return;
    const qty = Math.max(1, Number(form.selectedItemQty) || 1);
    const existing = form.requestedItems.find((item) => item.catalogId === catalogItem.id);
    const next = existing
      ? form.requestedItems.map((item) => item.catalogId === catalogItem.id ? { ...item, qty: item.qty + qty } : item)
      : [...form.requestedItems, { catalogId: catalogItem.id, name: catalogItem.name, qty, price: catalogItem.price }];
    set({ selectedItemId: "", selectedItemQty: "1" });
    syncItemsTotal(next);
  };

  const addNewProductToRequest = () => {
    const name = form.newProductName.trim();
    const price = Number(form.newProductPrice) || 0;
    if (!name || price <= 0) return;
    const item: CatalogItem = {
      id: uid("cat"),
      name,
      type: "product",
      price,
      tax: settings.defaultTaxRate,
      barcode: form.newProductBarcode.trim() || undefined,
      stock: 0,
      lowStockThreshold: 0,
    };
    setCatalog([...catalog, item]);
    syncItemsTotal([...form.requestedItems, { catalogId: item.id, name: item.name, qty: Math.max(1, Number(form.selectedItemQty) || 1), price: item.price }]);
    set({ newProductName: "", newProductBarcode: "", newProductPrice: "", selectedItemQty: "1", itemSearch: "", showQuickProduct: false });
  };

  const removeItem = (id: string) => syncItemsTotal(form.requestedItems.filter((item) => item.catalogId !== id));
  const updateItemPrice = (id: string, price: number) => syncItemsTotal(form.requestedItems.map((item) => item.catalogId === id ? { ...item, price: Math.max(0, price) } : item));
  const updateItemQty = (id: string, qty: number) => syncItemsTotal(form.requestedItems.map((item) => item.catalogId === id ? { ...item, qty: Math.max(1, qty) } : item));

  const checkPriceSuggestion = (text: string) => {
    if (!text.trim() || form.requestedItems.length > 0) { setPriceSuggestion(null); return; }
    const previous = [...urgentOrders].reverse().find((order) =>
      [order.issue, order.serviceDescription].filter(Boolean).some((value) => normalize(value || "") === normalize(text)) && order.expectedAmount
    );
    setPriceSuggestion(previous?.expectedAmount ?? null);
  };

  const validateStep = (step: Step): boolean => {
    const nextErrors: Partial<Record<string, string>> = {};
    const required = ar ? "مطلوب" : "Required";
    if (step === 1) {
      if (!form.addingNewCustomer && !form.customerId && !form.customerPhone) nextErrors.customer = required;
      if (form.addingNewCustomer) {
        if (!form.newCustomer.name.trim()) nextErrors.newName = required;
        if (!form.newCustomer.phone.trim()) nextErrors.newPhone = required;
      }
    }
    if (step === 2 && !form.requestType) nextErrors.requestType = required;
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const nextStep = () => {
    if (!validateStep(currentStep)) return;
    setCurrentStep((step) => Math.min(5, step + 1) as Step);
  };
  const prevStep = () => setCurrentStep((step) => Math.max(1, step - 1) as Step);

  const closeModal = () => {
    setOpen(false);
    setCurrentStep(1);
    setForm(EMPTY);
    setErrors({});
    setCustomerSearch("");
    setPriceSuggestion(null);
  };

  const create = () => {
    if (!canAdminRequests || !validateStep(currentStep)) return;

    let finalCustomerId = form.customerId;
    let finalCustomerName = form.customerName;
    let finalCustomerPhone = form.customerPhone;
    let finalLocationId = form.locationId;
    let finalLocationLabel = "";
    let finalLocation: Location | undefined;
    let nextCustomers = customers;

    if (form.addingNewCustomer && form.newCustomer.phone.trim()) {
      const existing = customers.find((customer) => customer.phone === form.newCustomer.phone.trim());
      if (existing) {
        finalCustomerId = existing.id;
        finalCustomerName = existing.name;
        finalCustomerPhone = existing.phone;
      } else {
        const location: Location = {
          id: uid("loc"),
          address: [form.newCustomer.city, form.newCustomer.district].filter(Boolean).join("، "),
          type: "home",
          city: form.newCustomer.city || undefined,
          district: form.newCustomer.district || undefined,
          googleMapsUrl: form.newCustomer.mapUrl || undefined,
          mapLink: form.newCustomer.mapUrl || undefined,
          notes: form.newCustomer.notes || undefined,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        const customer: Customer = {
          id: uid("cust"),
          name: form.newCustomer.name.trim(),
          phone: form.newCustomer.phone.trim(),
          type: "customer",
          locations: location.address || location.googleMapsUrl ? [location] : [],
          createdAt: Date.now(),
        };
        nextCustomers = [...customers, customer];
        setCustomers(nextCustomers);
        finalCustomerId = customer.id;
        finalCustomerName = customer.name;
        finalCustomerPhone = customer.phone;
        finalLocation = customer.locations[0];
        finalLocationId = finalLocation?.id || "";
        finalLocationLabel = finalLocation?.address || "";
      }
    }

    const currentCustomer = nextCustomers.find((customer) => customer.id === finalCustomerId);
    if (!form.addingNewCustomer && form.locationId === "__new__" && currentCustomer) {
      const location: Location = {
        id: uid("loc"),
        address: [form.newLocation.city, form.newLocation.district].filter(Boolean).join("، "),
        type: "home",
        city: form.newLocation.city || undefined,
        district: form.newLocation.district || undefined,
        googleMapsUrl: form.newLocation.mapUrl || undefined,
        mapLink: form.newLocation.mapUrl || undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      nextCustomers = nextCustomers.map((customer) => customer.id === currentCustomer.id ? { ...customer, locations: [...(customer.locations || []), location] } : customer);
      setCustomers(nextCustomers);
      finalLocation = location;
      finalLocationId = location.id;
      finalLocationLabel = location.address;
    } else if (form.locationId && form.locationId !== "__new__") {
      finalLocation = customerLocations.find((location) => location.id === form.locationId);
      finalLocationLabel = finalLocation ? [finalLocation.city, finalLocation.district, finalLocation.address].filter(Boolean).join(" - ") : "";
    }

    const assignedTechnicians = technicians.filter((tech) => form.assignedTechnicianIds.includes(tech.id));
    const fallbackIssue = form.issue.trim() || form.serviceDescription.trim() || requestTypeLabel(form.requestType) || (ar ? "طلب خدمة" : "Service request");

    const order: ServiceOrder = {
      id: uid("urg"),
      requestNumber: settings.nextRequestNumber,
      customerId: finalCustomerId || undefined,
      customerName: finalCustomerName,
      customerPhone: finalCustomerPhone,
      locationId: finalLocationId || undefined,
      locationLabel: finalLocationLabel || undefined,
      customerGoogleMapsUrl: finalLocation?.googleMapsUrl || finalLocation?.mapLink || undefined,
      customerAddress: finalLocation?.address || undefined,
      customerCity: finalLocation?.city || undefined,
      customerDistrict: finalLocation?.district || undefined,
      requestType: (form.requestType as RequestType) || undefined,
      issue: fallbackIssue,
      serviceDescription: form.serviceDescription || undefined,
      requestedItems: form.requestedItems,
      expectedPaymentMethod: (form.expectedPaymentMethod as ExpectedPaymentMethod) || undefined,
      expectedAmount: form.expectedAmount ? Number(form.expectedAmount) : undefined,
      expectedPaidAmount: form.expectedPaidAmount ? Number(form.expectedPaidAmount) : undefined,
      scheduledPeriod: (form.scheduledPeriod as "morning" | "evening") || undefined,
      scheduledHour: form.scheduledHour || undefined,
      requiredSpecialty: form.requiredSpecialties[0] || undefined,
      requiredSpecialties: form.requiredSpecialties,
      assignedTechnicianIds: assignedTechnicians.map((tech) => tech.id),
      assignedTechnicianNames: assignedTechnicians.map((tech) => tech.name),
      technicianId: assignedTechnicians.length === 1 ? assignedTechnicians[0].id : undefined,
      technicianName: assignedTechnicians.length === 1 ? assignedTechnicians[0].name : undefined,
      rejectedByTechnicianIds: [],
      marketerName: form.marketerName || undefined,
      marketerPhone: form.marketerPhone || undefined,
      notes: form.notes || undefined,
      status: "pending",
      date: form.scheduledDay ? buildTimestamp(form.scheduledDay, form.scheduledPeriod, form.scheduledHour) : 0,
      visitScheduled: Boolean(form.scheduledDay),
      activityLogs: [{
        date: Date.now(),
        text: form.scheduledDay
          ? (ar ? "تم إنشاء الطلب وتحديد موعد تنفيذ الطلب" : "Request created with an execution appointment")
          : (ar ? "تم إنشاء الطلب بدون موعد تنفيذ" : "Request created without an execution appointment"),
      }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setUrgentOrders([...urgentOrders, order]);
    setSettings({ ...settings, nextRequestNumber: settings.nextRequestNumber + 1 });
    closeModal();
  };

  const acceptOrder = (order: ServiceOrder) => {
    if (!activeUser || activeUser.role !== "technician") return;
    setUrgentOrders(urgentOrders.map((item) => item.id === order.id ? {
      ...item,
      status: "started",
      technicianId: activeUser.id,
      technicianName: activeUser.name,
      acceptedByTechnicianId: activeUser.id,
      acceptedByTechnicianName: activeUser.name,
      acceptedAt: Date.now(),
      assignedTechnicianIds: [activeUser.id],
      assignedTechnicianNames: [activeUser.name],
      updatedAt: Date.now(),
      activityLogs: [...(item.activityLogs || []), { date: Date.now(), text: ar ? `تم قبول الطلب بواسطة ${activeUser.name}` : `Accepted by ${activeUser.name}` }],
    } : item));
  };

  const rejectOrder = (order: ServiceOrder) => {
    if (!activeUser || activeUser.role !== "technician") return;
    setUrgentOrders(urgentOrders.map((item) => item.id === order.id ? {
      ...item,
      rejectedByTechnicianIds: Array.from(new Set([...(item.rejectedByTechnicianIds || []), activeUser.id])),
      updatedAt: Date.now(),
      activityLogs: [...(item.activityLogs || []), { date: Date.now(), text: ar ? `تم رفض الطلب بواسطة ${activeUser.name}` : `Rejected by ${activeUser.name}` }],
    } : item));
  };

  const updateStatus = (id: string, status: ServiceOrderStatus) => {
    if (!canAdminRequests) return;
    setUrgentOrders(urgentOrders.map((order) => order.id === id ? {
      ...order,
      status,
      completedAt: status === "completed" ? order.completedAt || Date.now() : undefined,
      updatedAt: Date.now(),
      activityLogs: [...(order.activityLogs || []), { date: Date.now(), text: ar ? `تغيرت الحالة إلى ${statusLabel(status)}` : `Status → ${statusLabel(status)}` }],
    } : order));
  };

  const assignTech = (order: ServiceOrder, techId: string) => {
    if (!canAdminRequests) return;
    const tech = technicians.find((item) => item.id === techId);
    setUrgentOrders(urgentOrders.map((item) => item.id === order.id ? {
      ...item,
      technicianId: tech?.id,
      technicianName: tech?.name,
      assignedTechnicianIds: tech ? [tech.id] : [],
      assignedTechnicianNames: tech ? [tech.name] : [],
      updatedAt: Date.now(),
      activityLogs: [...(item.activityLogs || []), { date: Date.now(), text: ar ? `إسناد إلى ${tech?.name || "غير معين"}` : `Assigned to ${tech?.name || "unassigned"}` }],
    } : item));
  };

  const remove = (id: string) => {
    if (!canAdminRequests || !confirmWithAdminPassword(settings.adminPassword, "deleting this urgent order", activeUser ? { name: activeUser.name, role: activeUser.role } : undefined)) return;
    setUrgentOrders(urgentOrders.filter((order) => order.id !== id));
  };

  const saveReschedule = () => {
    if (!rescheduling || !newDate || !canAdminRequests) return;
    const date = new Date(newDate).getTime();
    setUrgentOrders(urgentOrders.map((order) => order.id === rescheduling.id ? {
      ...order,
      date,
      visitScheduled: true,
      updatedAt: Date.now(),
      activityLogs: [...(order.activityLogs || []), { date: Date.now(), text: ar ? `إعادة جدولة تنفيذ الطلب: ${new Date(date).toLocaleString("ar-SA")}` : `Order execution rescheduled: ${new Date(date).toLocaleString()}` }],
    } : order));
    setRescheduling(null);
    setNewDate("");
  };

  const saveNextVisit = () => {
    if (!nextVisitOrder || !nextVisitDate || !canAdminRequests) return;

    const timestamp = fromDateTimeLocal(nextVisitDate);
    if (!timestamp || timestamp <= Date.now()) {
      window.alert(ar ? "موعد الزيارة يجب أن يكون وقتاً مستقبلياً." : "The maintenance visit must be scheduled in the future.");
      return;
    }

    setUrgentOrders(urgentOrders.map((order) => order.id === nextVisitOrder.id ? {
      ...order,
      nextMaintenanceDate: timestamp,
      updatedAt: Date.now(),
      activityLogs: [
        ...(order.activityLogs || []),
        {
          date: Date.now(),
          text: ar
            ? `تم تحديد موعد الزيارة القادمة: ${new Date(timestamp).toLocaleString("ar-SA")}`
            : `Next maintenance visit scheduled: ${new Date(timestamp).toLocaleString()}`,
        },
      ],
    } : order));

    setNextVisitOrder(null);
    setNextVisitDate("");
  };

  const openTemplateChooser = (order: ServiceOrder, to: "customer" | "technician") => {
    setTemplateTarget({ order, to });
    setSelectedTemplate(to === "customer" ? settings.whatsappTemplates.customer : settings.whatsappTemplates.technician);
  };

  const availableTemplates = useMemo(() => {
    if (!templateTarget) return [];
    const defaultTemplate = {
      id: "default",
      name: templateTarget.to === "customer" ? (ar ? "القالب الافتراضي للعميل" : "Default customer") : (ar ? "القالب الافتراضي للفني" : "Default technician"),
      body: templateTarget.to === "customer" ? settings.whatsappTemplates.customer : settings.whatsappTemplates.technician,
    };
    return [defaultTemplate, ...(settings.whatsappTemplateLibrary || []).filter((tpl) => tpl.audience === templateTarget.to || tpl.audience === "both")];
  }, [templateTarget, settings, ar]);

  const sendTemplate = () => {
    if (!templateTarget) return;
    const order = templateTarget.order;
    const customer = customers.find((c) => c.id === order.customerId);
    const body = renderWhatsAppTemplate(selectedTemplate || availableTemplates[0]?.body || "", order, settings, customer);
    const tech = technicians.find((item) => item.id === order.technicianId || item.name === order.technicianName || order.acceptedByTechnicianId === item.id);
    openWhatsApp(templateTarget.to === "customer" ? order.customerPhone : tech?.phone || "", body);
    setTemplateTarget(null);
  };

  const exportRows = () => visibleOrders.map((order) => ({
    id: order.id,
    requestNumber: order.requestNumber,
    customerId: order.customerId || "",
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    requestType: order.requestType || "",
    issue: order.issue,
    requestedItems: order.requestedItems || [],
    requiredSpecialties: getRequiredSpecialties(order),
    technicianId: order.technicianId || "",
    technicianName: order.acceptedByTechnicianName || order.technicianName || (order.assignedTechnicianNames || []).join(" | "),
    status: order.status,
    statusArabic: serviceOrderStatusLabel(order.status, "ar"),
    date: hasExecutionAppointment(order) ? order.date : "",
    nextMaintenanceDate: order.nextMaintenanceDate || "",
    expectedAmount: order.expectedAmount || "",
    notes: order.notes || "",
  }));

  const exportCSV = () => exportToCSV("current-orders.csv", exportRows().map((order) => ({
    RequestNumber: order.requestNumber,
    Customer: order.customerName,
    Phone: order.customerPhone,
    Type: requestTypeLabel((order.requestType || "") as RequestType | ""),
    Issue: order.issue,
    Specialties: (order.requiredSpecialties || []).join(" | "),
    Technician: order.technicianName,
    Status: ar ? order.statusArabic : statusLabel(order.status as ServiceOrderStatus),
    ExecutionDate: order.date ? new Date(Number(order.date)).toLocaleString(ar ? "ar-SA" : "en-US") : (ar ? "بدون موعد تنفيذ" : "No execution date"),
    NextVisitDate: order.nextMaintenanceDate ? new Date(Number(order.nextMaintenanceDate)).toLocaleString(ar ? "ar-SA" : "en-US") : (ar ? "بدون موعد زيارة قادمة" : "No future visit"),
    Amount: order.expectedAmount || "",
  })));

  const exportXlsx = async () => {
    await downloadWorkbookXlsx(makeXlsxFileName("current-orders"), { urgentOrders: exportRows() });
  };

  const importXlsx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setExcelImportStatus(ar ? "جارٍ استيراد ملف Excel…" : "Importing Excel…");
      const parsed = await readWorkbookImport(file, "urgentOrders");
      const { imported, empty } = applyBackupPayload(parsed.payload, "merge");
      if (empty) {
        setExcelImportStatus(ar ? "لم يتم العثور على طلبات حالية متوافقة في الملف." : "No compatible current orders were found in the file.");
        return;
      }
      const cloud = await saveToSupabaseBackup(buildFullPayload());
      setExcelImportStatus(`${ar ? "تم الاستيراد" : "Imported"}: ${imported.join(", ")}. ${cloud.message} ${ar ? "جارٍ إعادة التحميل" : "Reloading"}…`);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err: any) {
      setExcelImportStatus(`❌ ${err?.message || (ar ? "تعذر استيراد Excel." : "Could not import Excel.")}`);
    } finally {
      e.target.value = "";
    }
  };

  const stepTitles = [
    ar ? "العميل والموقع" : "Customer & location",
    ar ? "نوع الطلب والمنتجات" : "Request & items",
    ar ? "التسعير والدفع" : "Pricing & payment",
    ar ? "موعد تنفيذ الطلب والفني" : "Order execution & technician",
    ar ? "المسوق والملاحظات" : "Marketer & notes",
  ];

  const [syncingToServer, setSyncingToServer] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  const syncToServer = async () => {
    if (!NORMALIZED_TABLES_READY) return;
    setSyncingToServer(true);
    setSyncMessage("");
    try {
      const res = await fetch("/api/work-orders/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urgentOrders, appointments }),
      });
      const data = await res.json();
      setSyncMessage(data.ok
        ? `✅ تم مزامنة ${data.synced} طلب مع Supabase`
        : `❌ ${data.error || "فشل التزامن"}`);
    } catch {
      setSyncMessage("❌ خطأ في الشبكة");
    } finally {
      setSyncingToServer(false);
      setTimeout(() => setSyncMessage(""), 4000);
    }
  };

  return (
    <div>
      <PageTitle
        title={ar ? "نظام الطلبات" : "Order System"}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={exportCSV}>{t("urgent_export_csv")}</Button>
            <Button variant="secondary" onClick={exportXlsx}>{ar ? "تصدير Excel" : "Export XLSX"}</Button>
            {NORMALIZED_TABLES_READY && (
              <Button variant="secondary" onClick={syncToServer} disabled={syncingToServer}>
                {syncingToServer ? "…" : "🗄️ " + (ar ? "مزامنة Supabase" : "Sync to Supabase")}
              </Button>
            )}
            {canAdminRequests && (
              <label className="cursor-pointer rounded-lg bg-slate-100 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200">
                {ar ? "استيراد Excel" : "Import XLSX"}
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={importXlsx} />
              </label>
            )}
            {canAdminRequests && orderView === "urgent" && <Button onClick={() => { setOpen(true); setCurrentStep(1); }}>{ar ? "+ طلب جديد" : "+ New request"}</Button>}
          </div>
        }
      />

      <Card className="mb-4 p-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => changeOrderView("urgent")}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${orderView === "urgent" ? "bg-brand-600 text-white shadow" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {ar ? "الطلبات الحالية" : "Current orders"} ({urgentCount})
          </button>
          <button
            type="button"
            onClick={() => changeOrderView("completed")}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${orderView === "completed" ? "bg-green-600 text-white shadow" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {ar ? "طلبات مكتملة" : "Completed orders"} ({completedCount})
          </button>
        </div>
      </Card>

      {syncMessage && (
        <div className={`mx-3 mb-3 rounded-lg px-3 py-2 text-sm ${syncMessage.startsWith("✅") ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {syncMessage}
        </div>
      )}

      {excelImportStatus && <Card className="mb-4 text-sm text-slate-600">{excelImportStatus}</Card>}

      {isTechnician && orderView === "urgent" && (
        <Card className="mb-4 border border-amber-200 bg-amber-50 text-sm text-amber-800">
          {ar ? "هذه القائمة تعرض الطلبات المؤهلة لك فقط. بعد القبول تنتقل المهمة إلى صفحة مهامي وتختفي من هنا." : "This list shows eligible requests only. Accepted requests move to My Tasks."}
        </Card>
      )}

      <Card>
        <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3 max-w-sm" />
        <Table headers={["#", t("customer"), ar ? "النوع / التفاصيل" : "Type / details", ar ? "المنتجات" : "Items", ar ? "التخصصات / الفني" : "Specialties / technician", t("status"), orderView === "completed" ? (ar ? "التنفيذ / الزيارة القادمة" : "Execution / next visit") : (ar ? "موعد تنفيذ الطلب" : "Order execution"), ""]}>
          {visibleOrders.slice().reverse().map((order) => {
            const required = getRequiredSpecialties(order);
            const missingExecutionTime = orderView === "urgent" && !hasExecutionAppointment(order);
            const missingFutureVisit = orderView === "completed" && !order.nextMaintenanceDate;
            const needsAttention = missingExecutionTime || missingFutureVisit;

            return (
              <tr
                key={order.id}
                className={`border-b align-top ${needsAttention ? "border-red-200 bg-red-50" : "border-slate-100"}`}
              >
                <td className="px-2 py-2 text-xs font-medium text-slate-500">{order.requestNumber}</td>
                <td className="px-2 py-2">
                  <div className="font-medium">{order.customerName}</div>
                  <div className="text-xs text-slate-400">{order.customerPhone}</div>
                  {order.locationLabel && <div className="mt-0.5 text-xs text-slate-400">📍 {order.locationLabel}</div>}
                </td>
                <td className="max-w-xs px-2 py-2">
                  {order.requestType && <div className="mb-0.5 text-xs font-medium text-brand-600">{requestTypeLabel(order.requestType)}</div>}
                  <div className="text-sm">{order.issue}</div>
                  {order.notes && <div className="mt-1 text-xs text-slate-400">{order.notes}</div>}
                </td>
                <td className="px-2 py-2 text-xs">
                  {(order.requestedItems || []).length > 0
                    ? (order.requestedItems || []).map((item) => <div key={item.catalogId}>{item.name} × {item.qty}</div>)
                    : "—"}
                </td>
                <td className="px-2 py-2">
                  <div className="mb-1 flex flex-wrap gap-1">
                    {required.length > 0 ? required.map((specialty) => <Badge key={specialty} tone="slate">{specialty}</Badge>) : <span className="text-xs text-slate-400">—</span>}
                  </div>
                  {canAdminRequests ? (
                    <Select value={order.technicianId || ""} onChange={(e) => assignTech(order, e.target.value)} className="text-xs">
                      <option value="">{t("unassigned")}</option>
                      {technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}{tech.specialties?.length ? ` — ${tech.specialties.join("، ")}` : ""}</option>)}
                    </Select>
                  ) : (
                    <div className="text-sm text-slate-700">{order.acceptedByTechnicianName || order.technicianName || (order.assignedTechnicianNames || []).join("، ") || t("unassigned")}</div>
                  )}
                  {canAdminRequests && order.acceptedByTechnicianName && <div className="mt-1 text-xs text-green-700">{ar ? "تم قبولها بواسطة" : "Accepted by"}: {order.acceptedByTechnicianName}</div>}
                </td>
                <td className="px-2 py-2">
                  {canAdminRequests && (
                    <Select value={order.status} onChange={(e) => updateStatus(order.id, e.target.value as ServiceOrderStatus)} className="mb-1 text-xs">
                      {SERVICE_ORDER_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                    </Select>
                  )}
                  <Badge tone={serviceOrderStatusTone(order.status)}>{statusLabel(order.status)}</Badge>
                </td>
                <td className="px-2 py-2 text-xs">
                  <div className="space-y-1.5">
                    <div>
                      <div className="font-medium text-slate-600">{ar ? "موعد تنفيذ الطلب" : "Order execution"}</div>
                      {hasExecutionAppointment(order) ? (
                        <>
                          <div>{new Date(order.date).toLocaleDateString(ar ? "ar-SA" : "en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
                          {order.scheduledPeriod && <div className="text-slate-400">{order.scheduledPeriod === "morning" ? (ar ? "صباحاً" : "AM") : (ar ? "مساءً" : "PM")} {order.scheduledHour || ""}</div>}
                        </>
                      ) : (
                        <Badge tone="red">{ar ? "بدون موعد تنفيذ" : "No execution date"}</Badge>
                      )}
                    </div>

                    {order.completedAt && (
                      <div className="border-t border-slate-200 pt-1">
                        <span className="font-medium text-slate-600">{ar ? "تم تنفيذ الطلب" : "Completed"}: </span>
                        {new Date(order.completedAt).toLocaleString(ar ? "ar-SA" : "en-US")}
                      </div>
                    )}

                    {(orderView === "completed" || order.nextMaintenanceDate) && (
                      <div className="border-t border-slate-200 pt-1">
                        <div className="font-medium text-brand-700">{ar ? "موعد الزيارة القادمة" : "Next maintenance visit"}</div>
                        {order.nextMaintenanceDate ? (
                          <div>{new Date(order.nextMaintenanceDate).toLocaleString(ar ? "ar-SA" : "en-US")}</div>
                        ) : (
                          <Badge tone="red">{ar ? "بدون موعد زيارة قادمة" : "No future visit"}</Badge>
                        )}
                      </div>
                    )}
                  </div>
                  {order.expectedAmount !== undefined && <div className="mt-2 font-medium text-green-700">{order.expectedAmount.toFixed(2)} {settings.currency}</div>}
                </td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {order.customerGoogleMapsUrl ? (
                      <button onClick={() => openGoogleMaps(order.customerGoogleMapsUrl!)} title={ar ? "فتح الموقع" : "Open Maps"} className="rounded-lg bg-blue-50 p-1.5 text-blue-600 hover:bg-blue-100">
                        <IconMapPin className="h-4 w-4" />
                      </button>
                    ) : (
                      <button disabled title={ar ? "لا يوجد موقع" : "No location"} className="cursor-not-allowed rounded-lg bg-slate-50 p-1.5 text-slate-300">
                        <IconMapPin className="h-4 w-4" />
                      </button>
                    )}
                    <button onClick={() => openTemplateChooser(order, "customer")} title={ar ? "واتساب العميل" : "WhatsApp Customer"} className="rounded-lg bg-green-50 p-1.5 text-green-600 hover:bg-green-100">
                      <IconWhatsApp className="h-4 w-4" />
                    </button>
                    {canAdminRequests && (order.technicianName || order.acceptedByTechnicianName) && (
                      <button onClick={() => openTemplateChooser(order, "technician")} title={ar ? "واتساب الفني — صيانة" : "WhatsApp Technician — Maintenance"} className="rounded-lg bg-emerald-50 p-1.5 text-emerald-800 hover:bg-emerald-100">
                        <IconWhatsAppTechnician className="h-4 w-4" />
                      </button>
                    )}
                    {isTechnician && (
                      <button onClick={() => acceptOrder(order)} title={ar ? "قبول" : "Accept"} className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600 text-white hover:bg-green-700">✓</button>
                    )}
                    {canAdminRequests && orderView === "urgent" && (
                      <button className="px-1 text-xs text-brand-600 hover:underline" onClick={() => { setRescheduling(order); setNewDate(toDateTimeLocal(hasExecutionAppointment(order) ? order.date : undefined)); }}>
                        {t("urgent_reschedule")}
                      </button>
                    )}
                    {canAdminRequests && orderView === "completed" && (
                      <button
                        className={`px-1 text-xs hover:underline ${order.nextMaintenanceDate ? "text-brand-600" : "font-semibold text-red-600"}`}
                        onClick={() => {
                          setNextVisitOrder(order);
                          setNextVisitDate(toDateTimeLocal(order.nextMaintenanceDate));
                        }}
                      >
                        {order.nextMaintenanceDate
                          ? (ar ? "تعديل موعد الزيارة" : "Edit next visit")
                          : (ar ? "حدد موعد الزيارة" : "Set next visit")}
                      </button>
                    )}
                    {canAdminRequests && <button className="px-1 text-xs text-red-600 hover:underline" onClick={() => remove(order.id)}>{t("delete")}</button>}
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
        {visibleOrders.length === 0 && (
          <p className="mt-3 text-center text-sm text-slate-400">
            {orderView === "completed"
              ? (ar ? "لا توجد طلبات مكتملة بعد." : "No completed orders yet.")
              : (ar ? "لا توجد طلبات حالية مطابقة." : "No matching current orders.")}
          </p>
        )}
      </Card>

      <Modal open={open} onClose={closeModal} title={`${t("urgent_new_title")} — ${stepTitles[currentStep - 1]}`}>
        <div className="mb-5 flex gap-1">
          {[1, 2, 3, 4, 5].map((step) => <div key={step} className={`h-1.5 flex-1 rounded-full ${step <= currentStep ? "bg-brand-500" : "bg-slate-200"}`} />)}
        </div>

        {currentStep === 1 && (
          <div className="space-y-4">
            <SectionHeader step={1} label={stepTitles[0]} />
            {!form.addingNewCustomer ? (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium">{ar ? "بحث عن عميل" : "Search customer"}</label>
                  <Input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder={ar ? "اسم العميل أو رقم الجوال" : "Name or phone"} />
                  {customerResults.length > 0 && (
                    <div className="mt-1 rounded-lg border border-slate-200 bg-white shadow-sm">
                      {customerResults.map((customer) => (
                        <button key={customer.id} onClick={() => selectCustomer(customer)} className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-sm hover:bg-brand-50 last:border-0">
                          <span className="font-medium">{customer.name}</span>
                          <span className="text-slate-400">{customer.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {form.customerId && (
                  <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2">
                    <div className="flex-1"><div className="font-medium text-brand-800">{form.customerName}</div><div className="text-xs text-brand-600">{form.customerPhone}</div></div>
                    <button onClick={() => set({ customerId: "", customerName: "", customerPhone: "", locationId: "" })} className="text-xs text-slate-400 hover:text-red-500">✕</button>
                  </div>
                )}
                {errors.customer && <p className="text-xs text-red-500">{errors.customer}</p>}
                {form.customerId && (
                  <div>
                    <label className="mb-1 block text-sm font-medium">{ar ? "موقع العميل" : "Customer location"}</label>
                    <Select value={form.locationId} onChange={(e) => set({ locationId: e.target.value })}>
                      <option value="">{ar ? "بدون موقع محدد" : "No specific location"}</option>
                      {customerLocations.map((location) => <option key={location.id} value={location.id}>{[location.city, location.district, location.address].filter(Boolean).join(" - ") || location.label || location.id}</option>)}
                      <option value="__new__">{ar ? "+ إضافة موقع جديد" : "+ Add new location"}</option>
                    </Select>
                    {form.locationId === "__new__" && <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3"><Input value={form.newLocation.city} onChange={(e) => set({ newLocation: { ...form.newLocation, city: e.target.value } })} placeholder={ar ? "المدينة" : "City"} /><Input value={form.newLocation.district} onChange={(e) => set({ newLocation: { ...form.newLocation, district: e.target.value } })} placeholder={ar ? "الحي" : "District"} /><Input value={form.newLocation.mapUrl} onChange={(e) => set({ newLocation: { ...form.newLocation, mapUrl: e.target.value } })} placeholder="Google Maps URL" dir="ltr" /></div>}
                  </div>
                )}
                <Button variant="secondary" onClick={() => set({ addingNewCustomer: true })}>{ar ? "+ إضافة عميل جديد" : "+ Add new customer"}</Button>
              </>
            ) : (
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between"><h4 className="font-medium">{ar ? "عميل جديد" : "New customer"}</h4><button className="text-xs text-slate-400" onClick={() => set({ addingNewCustomer: false, newCustomer: EMPTY_CUSTOMER })}>✕</button></div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><Input value={form.newCustomer.name} onChange={(e) => set({ newCustomer: { ...form.newCustomer, name: e.target.value } })} placeholder={t("name")} /><Input value={form.newCustomer.phone} onChange={(e) => set({ newCustomer: { ...form.newCustomer, phone: e.target.value } })} placeholder={t("phone")} /></div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><Input value={form.newCustomer.city} onChange={(e) => set({ newCustomer: { ...form.newCustomer, city: e.target.value } })} placeholder={ar ? "المدينة" : "City"} /><Input value={form.newCustomer.district} onChange={(e) => set({ newCustomer: { ...form.newCustomer, district: e.target.value } })} placeholder={ar ? "الحي" : "District"} /><Input value={form.newCustomer.mapUrl} onChange={(e) => set({ newCustomer: { ...form.newCustomer, mapUrl: e.target.value } })} placeholder="Google Maps URL" dir="ltr" /></div>
                {(errors.newName || errors.newPhone) && <p className="text-xs text-red-500">{ar ? "اسم العميل ورقم الهاتف مطلوبان" : "Name and phone are required"}</p>}
              </div>
            )}
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-4">
            <SectionHeader step={2} label={stepTitles[1]} />
            <div>
              <label className="mb-2 block text-sm font-medium">{ar ? "نوع الطلب" : "Request type"}</label>
              <div className="grid grid-cols-2 gap-2">
                {(["new_installation", "maintenance", "inspection", "urgent_visit"] as RequestType[]).map((type) => <button key={type} onClick={() => { set({ requestType: type }); clearError("requestType"); }} className={`rounded-lg border-2 px-3 py-2 text-sm ${form.requestType === type ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600"}`}>{requestTypeLabel(type)}</button>)}
              </div>
              {errors.requestType && <p className="mt-1 text-xs text-red-500">{errors.requestType}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{ar ? "تفاصيل الطلب / المشكلة (اختياري)" : "Issue details (optional)"}</label>
              <Input value={form.issue} onChange={(e) => set({ issue: e.target.value })} onBlur={() => checkPriceSuggestion(form.issue)} placeholder={ar ? "ملخص قصير للطلب" : "Short request summary"} />
            </div>
            {form.requestType && form.requestType !== "new_installation" && (
              <div>
                <label className="mb-1 block text-sm font-medium">{ar ? "وصف الخدمة المطلوبة" : "Service description"}</label>
                <Textarea rows={3} value={form.serviceDescription} onChange={(e) => set({ serviceDescription: e.target.value })} onBlur={() => checkPriceSuggestion(form.serviceDescription)} placeholder={ar ? "صف الخدمة إذا احتجت..." : "Describe the service if needed..."} />
                {priceSuggestion && <button onClick={() => { set({ expectedAmount: String(priceSuggestion) }); setPriceSuggestion(null); }} className="mt-1 text-xs text-brand-600 hover:underline">{ar ? "اقتراح سعر سابق" : "Suggested previous price"}: {priceSuggestion.toFixed(2)} {settings.currency}</button>}
              </div>
            )}
            {form.requestType && (
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <label className="mb-2 block text-sm font-medium">{form.requestType === "new_installation" ? (ar ? "المنتجات المطلوبة" : "Required products") : (ar ? "منتجات/قطع اختيارية" : "Optional items")}</label>
                <div className="space-y-2">
                  <Input value={form.itemSearch} onChange={(e) => set({ itemSearch: e.target.value })} placeholder={ar ? "ابحث باسم المنتج أو الباركود أو SKU" : "Search by name, barcode, or SKU"} />
                  <div className="grid grid-cols-[1fr_80px_auto] gap-2">
                    <Select value={form.selectedItemId} onChange={(e) => {
                      const item = allItems.find((catalogItem) => catalogItem.id === e.target.value);
                      set({ selectedItemId: e.target.value, itemSearch: item?.name || form.itemSearch });
                    }}><option value="">{ar ? "اختر منتجاً أو خدمة" : "Select item"}</option>{filteredItems.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.price.toFixed(2)} {settings.currency}{item.barcode ? ` — ${item.barcode}` : ""}</option>)}</Select>
                    <Input type="number" min={1} value={form.selectedItemQty} onChange={(e) => set({ selectedItemQty: e.target.value })} />
                    <Button variant="secondary" onClick={addItem}>{ar ? "إضافة" : "Add"}</Button>
                  </div>
                  <div className="flex justify-start">
                    <button onClick={() => set({ showQuickProduct: !form.showQuickProduct })} className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-brand-500 text-lg font-bold text-brand-600 hover:bg-brand-50" title={ar ? "إضافة منتج جديد سريع" : "Quick add new product"}>+</button>
                  </div>
                  {form.showQuickProduct && <div className="rounded-lg border border-dashed border-slate-300 bg-white p-2"><div className="mb-2 text-xs font-medium text-slate-500">{ar ? "إضافة منتج جديد سريع" : "Quick add new product"}</div><div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_120px_auto]"><Input value={form.newProductName} onChange={(e) => set({ newProductName: e.target.value })} placeholder={ar ? "اسم المنتج" : "Product name"} /><Input value={form.newProductBarcode} onChange={(e) => set({ newProductBarcode: e.target.value })} placeholder={ar ? "الباركود" : "Barcode"} /><Input type="number" min={0} value={form.newProductPrice} onChange={(e) => set({ newProductPrice: e.target.value })} placeholder={ar ? "سعر البيع" : "Sale price"} /><Button variant="secondary" onClick={addNewProductToRequest}>{ar ? "حفظ" : "Save"}</Button></div></div>}
                </div>
                {form.requestedItems.length > 0 && <div className="mt-2 space-y-1">{form.requestedItems.map((item) => <div key={item.catalogId} className="grid grid-cols-[1fr_80px_100px_auto] items-center gap-2 rounded bg-white px-2 py-1 text-sm"><span>{item.name}</span><Input type="number" min={1} value={item.qty} onChange={(e) => updateItemQty(item.catalogId, Number(e.target.value))} /><Input type="number" min={0} value={item.price} onChange={(e) => updateItemPrice(item.catalogId, Number(e.target.value))} /><button className="text-xs text-red-500" onClick={() => removeItem(item.catalogId)}>✕</button></div>)}</div>}
              </div>
            )}
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-4">
            <SectionHeader step={3} label={stepTitles[2]} />
            <div><label className="mb-1 block text-sm font-medium">{ar ? "المبلغ المتوقع" : "Expected amount"}</label><Input type="number" min={0} value={form.expectedAmount} onChange={(e) => set({ expectedAmount: e.target.value })} placeholder="0.00" /></div>
            <div>
              <label className="mb-2 block text-sm font-medium">{ar ? "طريقة الدفع المتوقعة" : "Expected payment"}</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {([ ["cash", ar ? "نقداً" : "Cash"], ["card", ar ? "شبكة" : "Card"], ["transfer", ar ? "تحويل" : "Transfer"], ["credit", ar ? "آجل" : "Credit"], ["partial", ar ? "دفع جزئي" : "Partial"], ["not_agreed", ar ? "لم يتم الاتفاق" : "Not agreed"] ] as [ExpectedPaymentMethod, string][]).map(([value, label]) => <button key={value} onClick={() => set({ expectedPaymentMethod: value })} className={`rounded-lg border-2 px-3 py-2 text-sm ${form.expectedPaymentMethod === value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600"}`}>{label}</button>)}
              </div>
            </div>
            {form.expectedPaymentMethod === "partial" && <div><label className="mb-1 block text-sm font-medium">{ar ? "المدفوع مقدماً" : "Paid upfront"}</label><Input type="number" min={0} value={form.expectedPaidAmount} onChange={(e) => set({ expectedPaidAmount: e.target.value })} /></div>}
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-4">
            <SectionHeader step={4} label={stepTitles[3]} />
            <div>
              <label className="mb-2 block text-sm font-medium">{ar ? "موعد تنفيذ الطلب" : "Order execution date"}</label>
              {!form.useCustomDate ? <div className="flex flex-wrap gap-1.5">{days7.map((day) => <button key={day.value} onClick={() => set({ scheduledDay: day.value })} className={`rounded-lg border-2 px-3 py-1.5 text-sm ${form.scheduledDay === day.value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600"}`}>{day.label}</button>)}<button onClick={() => set({ useCustomDate: true, scheduledDay: "" })} className="rounded-lg border-2 border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-500">{ar ? "تاريخ مخصص" : "Custom date"}</button></div> : <div className="flex items-center gap-2"><Input type="date" value={form.scheduledDay} onChange={(e) => set({ scheduledDay: e.target.value })} /><button onClick={() => set({ useCustomDate: false, scheduledDay: "" })} className="text-xs text-slate-400">✕</button></div>}
            </div>
            <div className="grid grid-cols-2 gap-3"><div><label className="mb-1 block text-sm font-medium">{ar ? "الفترة" : "Period"}</label><div className="flex gap-2">{(["morning", "evening"] as const).map((period) => <button key={period} onClick={() => set({ scheduledPeriod: period })} className={`flex-1 rounded-lg border-2 py-2 text-sm ${form.scheduledPeriod === period ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600"}`}>{period === "morning" ? (ar ? "صباحاً" : "AM") : (ar ? "مساءً" : "PM")}</button>)}</div></div><div><label className="mb-1 block text-sm font-medium">{ar ? "الساعة" : "Hour"}</label><Input type="time" value={form.scheduledHour} onChange={(e) => set({ scheduledHour: e.target.value })} /></div></div>
            <div>
              <label className="mb-2 block text-sm font-medium">{ar ? "التخصصات المطلوبة" : "Required specialties"}</label>
              <div className="flex flex-wrap gap-2">{(settings.technicianSpecialties || []).map((specialty) => <label key={specialty} className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${form.requiredSpecialties.includes(specialty) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white"}`}><input type="checkbox" checked={form.requiredSpecialties.includes(specialty)} onChange={() => toggleSpecialty(specialty)} />{specialty}</label>)}</div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">{ar ? "تعيين فني / فنيين (اختياري)" : "Assign technician(s) optional"}</label>
              {form.requiredSpecialties.length > 0 && matchingTechnicians.length === 0 && <p className="mb-2 text-xs text-amber-600">{ar ? "لا يوجد فني يملك كل التخصصات المحددة. يمكن تعيين أكثر من فني يدويًا." : "No single technician has all selected specialties. You can assign multiple technicians manually."}</p>}
              <div className="space-y-1 rounded-lg border border-slate-200 p-2">{[...matchingTechnicians, ...otherTechnicians].map((tech) => <label key={tech.id} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50"><span><input type="checkbox" className="me-2" checked={form.assignedTechnicianIds.includes(tech.id)} onChange={() => toggleAssignedTechnician(tech.id)} />{tech.name}</span><span className="text-xs text-slate-400">{(tech.specialties || []).join("، ")}</span></label>)}</div>
            </div>
          </div>
        )}

        {currentStep === 5 && (
          <div className="space-y-4">
            <SectionHeader step={5} label={stepTitles[4]} />
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3"><label className="mb-2 block text-sm font-medium">{ar ? "المسوّق" : "Marketer"}</label><div className="grid grid-cols-2 gap-2"><Input placeholder={ar ? "اسم المسوّق" : "Marketer name"} value={form.marketerName} onChange={(e) => set({ marketerName: e.target.value })} /><Input placeholder={ar ? "رقم المسوّق" : "Marketer phone"} value={form.marketerPhone} onChange={(e) => set({ marketerPhone: e.target.value })} /></div></div>
            <div><label className="mb-1 block text-sm font-medium">{t("notes")}</label><Textarea rows={4} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder={ar ? "أي ملاحظات إضافية..." : "Any additional notes..."} /></div>
            <div className="space-y-1 rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm"><div className="mb-2 font-semibold text-brand-800">{ar ? "ملخص الطلب" : "Order summary"}</div><div>{t("customer")}: {form.addingNewCustomer ? form.newCustomer.name : form.customerName}</div><div>{ar ? "النوع" : "Type"}: {requestTypeLabel(form.requestType)}</div><div>{ar ? "التخصصات" : "Specialties"}: {form.requiredSpecialties.join("، ") || "—"}</div><div>{ar ? "الفنيون" : "Technicians"}: {technicians.filter((tech) => form.assignedTechnicianIds.includes(tech.id)).map((tech) => tech.name).join("، ") || (ar ? "سيتم الاختيار حسب التخصص" : "Auto by specialty")}</div>{form.expectedAmount && <div>{ar ? "المبلغ" : "Amount"}: {form.expectedAmount} {settings.currency}</div>}</div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4"><Button variant="secondary" onClick={currentStep === 1 ? closeModal : prevStep}>{currentStep === 1 ? t("cancel") : (ar ? "السابق" : "Previous")}</Button>{currentStep < 5 ? <Button onClick={nextStep}>{ar ? "التالي" : "Next"}</Button> : <Button onClick={create}>{ar ? "تأكيد وإنشاء الطلب" : "Confirm and create"}</Button>}</div>
      </Modal>

      <Modal open={!!templateTarget} onClose={() => setTemplateTarget(null)} title={ar ? "اختيار قالب واتساب" : "WhatsApp template"}>
        {templateTarget && <div className="space-y-3"><Select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}>{availableTemplates.map((template) => <option key={template.id} value={template.body}>{template.name}</option>)}</Select><Textarea rows={6} value={selectedTemplate} onChange={(e) => canAdminRequests && setSelectedTemplate(e.target.value)} readOnly={!canAdminRequests} className={!canAdminRequests ? "bg-slate-50 text-slate-500" : ""} /><div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{renderWhatsAppTemplate(selectedTemplate || availableTemplates[0]?.body || "", templateTarget.order, settings, customers.find((customer) => customer.id === templateTarget.order.customerId))}</div><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setTemplateTarget(null)}>{t("cancel")}</Button><Button onClick={sendTemplate}>{ar ? "فتح واتساب" : "Open WhatsApp"}</Button></div></div>}
      </Modal>

      <Modal
        open={!!nextVisitOrder}
        onClose={() => {
          setNextVisitOrder(null);
          setNextVisitDate("");
        }}
        title={ar ? "موعد الزيارة القادمة للصيانة" : "Next maintenance visit"}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {ar
              ? "هذا الموعد هو زيارة صيانة مستقبلية بعد إكمال الطلب، وليس وقت تنفيذ الطلب الحالي."
              : "This is a future maintenance visit after the order is completed, not the current order execution time."}
          </p>
          <Input
            dir={ar ? "rtl" : "ltr"}
            type="datetime-local"
            min={toDateTimeLocal(Date.now() + 60_000)}
            value={nextVisitDate}
            onChange={(e) => setNextVisitDate(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setNextVisitOrder(null); setNextVisitDate(""); }}>{t("cancel")}</Button>
            <Button onClick={saveNextVisit}>{t("save")}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!rescheduling} onClose={() => setRescheduling(null)} title={t("urgent_reschedule_title")}>
        <div className="space-y-3"><Input dir={ar ? "rtl" : "ltr"} type="datetime-local" value={newDate} onChange={(e) => setNewDate(e.target.value)} /><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setRescheduling(null)}>{t("cancel")}</Button><Button onClick={saveReschedule}>{t("save")}</Button></div></div>
      </Modal>
    </div>
  );
}
