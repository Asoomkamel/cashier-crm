/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from "react";
import { Customer, ServiceOrder, AppSettings, CatalogItem } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Calendar,
  Plus,
  Search,
  Trash2,
  CheckCircle,
  Clock,
  UserPlus,
  MessageCircle,
  MessageSquare,
  ClipboardList,
  User,
  MapPin,
  Check,
  CalendarDays,
  X,
  HelpCircle,
  Share2,
  Download,
  Printer,
} from "lucide-react";
import * as xlsx from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { format, differenceInDays } from "date-fns";
import { arSA } from "date-fns/locale";
import { storage } from "../services/storage";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { generateWhatsAppMessage } from "../utils/whatsapp";
import { PasswordDialog } from "./PasswordDialog";
import CreateRequestForm from "./CreateRequestForm";

interface AppointmentsProps {
  settings: AppSettings;
  orders: ServiceOrder[];
  salesOrders?: any[];
  customers: Customer[];
  catalog?: CatalogItem[];
  onSave: (order: ServiceOrder) => void;
  onUpdateStatus: (id: string, status: ServiceOrder["status"]) => void;
  onDelete: (id: string) => void;
  onAddCustomer: (customer: Customer) => void;
  onSaveOrder?: (order: any) => void;
  setSettings?: React.Dispatch<React.SetStateAction<AppSettings>>;
  onMoveToAppointments?: (order: ServiceOrder) => void;
  onNavigateToPOS?: (order: ServiceOrder) => void;
  onPrintOrder?: (order: ServiceOrder) => void;
  adminPassword?: string;
}

import { APIProvider, Map, AdvancedMarker, Pin } from "@vis.gl/react-google-maps";

const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';

export default function UrgentOrders({
  settings,
  setSettings,
  orders,
  salesOrders = [],
  customers,
  catalog = [],
  onSave,
  onUpdateStatus,
  onDelete,
  onAddCustomer,
  onSaveOrder,
  onMoveToAppointments,
  onNavigateToPOS,
  onPrintOrder,
  adminPassword,
}: AppointmentsProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [targetDeleteId, setTargetDeleteId] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [activeWhatsappOrder, setActiveWhatsappOrder] =
    useState<ServiceOrder | null>(null);
  const [activeShareOrder, setActiveShareOrder] = useState<ServiceOrder | null>(
    null,
  );
  const [activeTechOrder, setActiveTechOrder] = useState<ServiceOrder | null>(
    null,
  );
  const [completingOrder, setCompletingOrder] = useState<ServiceOrder | null>(
    null,
  );
  const [extendingOrder, setExtendingOrder] = useState<ServiceOrder | null>(
    null,
  );
  const [infoOrder, setInfoOrder] = useState<ServiceOrder | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "incomplete">(
    "incomplete",
  );
  const [reminderMonths, setReminderMonths] = useState<number>(0);
  const [generateInvoice, setGenerateInvoice] = useState<boolean>(false);

  // Form State
  const [selectedCustId, setSelectedCustId] = useState("");
  const [selectedLocId, setSelectedLocId] = useState("");
  const [requestType, setRequestType] = useState("جديد");
  const [productInterest, setProductInterest] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [expectedPaymentMethod, setExpectedPaymentMethod] = useState("cash");
  const [expectedAmount, setExpectedAmount] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<
    { id: string; name: string }[]
  >([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [customDate, setCustomDate] = useState("");
  const [timeHour, setTimeHour] = useState<number>(1);
  const [timeAmPm, setTimeAmPm] = useState<"AM" | "PM">("PM");
  const [technicianName, setTechnicianName] = useState("");

  const handleExportOrders = () => {
    try {
      const exportData = orders.map((o) => ({
        "رقم الطلب": o.id,
        "العميل": o.customerName,
        "تاريخ الإنشاء": new Date(o.createdAt || o.date).toLocaleDateString("ar-SA"),
        "حالة الطلب":
          o.status === "completed"
            ? "مكتمل"
            : o.status === "in_progress"
            ? "جاري العمل"
            : o.status === "pending"
            ? "معلق"
            : o.status === "started"
            ? "بدأ العمل"
            : o.status === "canceled"
            ? "ملغي"
            : "حالة أخرى",
        "الخدمة / الطلب": o.requestType || o.issue,
        "المنتجات المقترحة": (o.selectedProducts || []).map((p) => p.name).join(" + "),
        "طريقة الدفع المتوقعة": o.expectedPaymentMethod === "cash" ? "كاش" : o.expectedPaymentMethod === "bank_transfer" ? "تحويل" : o.expectedPaymentMethod === "network" ? "شبكة" : "آجل",
        "المبلغ المتوقع": o.expectedAmount || "0",
        "الملاحظات": o.additionalNotes || "",
        "الفني": o.technicianName || "غير محدد",
      }));

      const ws = xlsx.utils.json_to_sheet(exportData);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "الطلبات والمواعيد");
      xlsx.writeFile(wb, `الطلبات_${new Date().toISOString().split("T")[0]}.xlsx`);
      toast.success("تم تصدير الطلبات بنجاح");
    } catch (error) {
      toast.error("حدث خطأ أثناء التصدير");
    }
  };

  const sortedCatalog = useMemo(() => {
    const counts: Record<string, number> = {};
    salesOrders.forEach((o) => {
      o.items?.forEach((it: any) => {
        if (it?.catalogId) {
          counts[it.catalogId] = (counts[it.catalogId] || 0) + (it.qty || 1);
        }
      });
    });
    return [...(catalog || [])]
      .filter((c) => c.type === "product" || c.isBundle)
      .sort((a, b) => {
        const ca = counts[a.id] || 0;
        const cb = counts[b.id] || 0;
        return cb - ca; // descending, most sold at the top
      });
  }, [catalog, salesOrders]);

  // Inline Add Customer
  const [showInlineAddCustomer, setShowInlineAddCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustCity, setNewCustCity] = useState("");
  const [newCustDistrict, setNewCustDistrict] = useState("");
  const [newCustMapLink, setNewCustMapLink] = useState("");

  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [customerSelectOpen, setCustomerSelectOpen] = useState(false);
  const [editingCustId, setEditingCustId] = useState<string | null>(null);
  const [actualTechnician, setActualTechnician] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");

  useEffect(() => {
    if (completingOrder) {
      setActualTechnician(completingOrder.technicianName || "");
    }
  }, [completingOrder]);

  // Dynamically compute the 7 consecutive days starting from today
  const nextSevenDays = useMemo(() => {
    const days = [];
    const arabicDays = [
      "الأحد",
      "الإثنين",
      "الثلاثاء",
      "الأربعاء",
      "الخميس",
      "الجمعة",
      "السبت",
    ];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const isToday = i === 0;
      const dayNum = d.getDate();
      const dayName = arabicDays[d.getDay()];
      // Format as: "الجمعة 22"
      const label = `${dayNum} ${dayName}${isToday ? " (اليوم)" : ""}`;
      days.push({
        date: d,
        label,
        dateString: d.toISOString().split("T")[0],
      });
    }
    return days;
  }, []); // Re-calculated on mount, ensuring today is always the first option

  useEffect(() => {
    if (newCustPhone.length >= 8) {
      const existing = customers.find((c) => c.phone === newCustPhone);
      if (existing && editingCustId !== existing.id) {
        toast.info("تم العثور على العميل، تم جلب بياناته تلقائياً.");
        setEditingCustId(existing.id);
        setNewCustName(existing.name);
        setNewCustCity(
          existing.locations?.[0]?.city ||
            existing.locations?.[0]?.address ||
            "",
        );
        setNewCustMapLink(existing.locations?.[0]?.mapLink || "");
      } else if (!existing && editingCustId !== null) {
        setEditingCustId(null);
      }
    }
  }, [newCustPhone, customers, editingCustId]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(
      (c) =>
        c.name.includes(customerSearchTerm) ||
        c.phone.includes(customerSearchTerm),
    );
  }, [customers, customerSearchTerm]);

  const customer = customers.find((c) => c.id === selectedCustId);

  const confirmDelete = () => {
    if (adminPassword && passwordInput === adminPassword) {
      if (targetDeleteId) {
        onDelete(targetDeleteId);
        toast.success("تم حذف الطلب بنجاح");
      }
      setShowDeleteDialog(false);
      setPasswordInput("");
      setTargetDeleteId(null);
    } else {
      toast.error("كلمة المرور غير صحيحة");
    }
  };

  // Filter existing active requests
  const filteredRequests = useMemo(() => {
    return orders
      .filter((o) => {
        if (filterStatus === "incomplete") {
          if (o.status === "completed" || o.status === "canceled") return false;
        }

        const c = customers.find((cust) => cust.id === o.customerId);
        const phoneMatch = c ? c.phone.includes(searchTerm) : false;

        return (
          (o.customerName || "").includes(searchTerm) ||
          (o.issue && o.issue.includes(searchTerm)) ||
          phoneMatch
        );
      })
      .sort((a, b) => {
        const timeA = a.createdAt || a.date;
        const timeB = b.createdAt || b.date;
        if (sortOrder === "newest") return timeB - timeA;
        if (sortOrder === "oldest") return timeA - timeB;
        if (sortOrder === "dateAsc") return (a.date || 0) - (b.date || 0);
        if (sortOrder === "dateDesc") return (b.date || 0) - (a.date || 0);
        return timeB - timeA;
      });
  }, [orders, searchTerm, customers, filterStatus, sortOrder]);

  const handleCreateRequest = () => {
    let finalCustId = selectedCustId;
    let finalCustName = customer?.name || "";
    let finalLocId = selectedLocId;

    if (showInlineAddCustomer) {
      if (!newCustPhone) {
        toast.error("يرجى إدخال رقم جوال العميل.");
        return;
      }
      const safeName = newCustName || "عميل بدون اسم";
      const existingCust = customers.find((c) => c.phone === newCustPhone);

      if (existingCust) {
        finalCustId = existingCust.id;
        finalCustName = safeName;

        const locMatch = existingCust.locations.find(
          (l) =>
            l.city === newCustCity &&
            l.district === newCustDistrict &&
            l.mapLink === newCustMapLink,
        );

        if (locMatch) {
          finalLocId = locMatch.id;
        } else {
          const newLocId = Math.random().toString(36).substr(2, 9);
          finalLocId = newLocId;
          const updatedCustomer = {
            ...existingCust,
            name: safeName !== "عميل بدون اسم" ? safeName : existingCust.name,
            locations: [
              ...existingCust.locations,
              {
                id: newLocId,
                address: newCustDistrict || "لا يوجد عنوان",
                district: newCustDistrict || undefined,
                type: `موقع إضافي (${existingCust.locations.length + 1})`,
                city: newCustCity,
                mapLink: newCustMapLink,
              },
            ],
          };
          onAddCustomer(updatedCustomer);
        }
      } else {
        const newCustomer: Customer = {
          id: Math.random().toString(36).substr(2, 9),
          name: safeName,
          phone: newCustPhone,
          type: "lead",
          createdAt: Date.now(),
          locations: [
            {
              id: Math.random().toString(36).substr(2, 9),
              address: newCustDistrict || "لا يوجد عنوان",
              district: newCustDistrict || undefined,
              type: "تم إضافته للطلب",
              city: newCustCity,
              mapLink: newCustMapLink,
            },
          ],
        };
        onAddCustomer(newCustomer);
        finalCustId = newCustomer.id;
        finalCustName = safeName;
        finalLocId = newCustomer.locations[0].id;
      }
    }

    if (!finalCustId) {
      toast.error("يرجى اختيار العميل أو إضافة عميل جديد أولاً.");
      return;
    }

    // Build the request date from 7 consecutive days or custom date
    let rawDateObj = new Date();
    if (customDate) {
      rawDateObj = new Date(customDate);
    } else if (nextSevenDays[selectedDayIndex]) {
      rawDateObj = new Date(nextSevenDays[selectedDayIndex].date);
    }

    // Mix in the chosen time
    let h24 = timeHour;
    if (timeAmPm === "PM" && h24 !== 12) h24 += 12;
    if (timeAmPm === "AM" && h24 === 12) h24 = 0;
    rawDateObj.setHours(h24, 0, 0, 0);

    const computedIssue = `${requestType} - ${productInterest}`;

    const nextNum = settings.nextRequestNumber ?? 1;
    const prefix = settings.requestPrefix || "REQ-";
    const finalId = `${prefix}${nextNum}`;

    const newRequestOrder: ServiceOrder = {
      id: finalId,
      requestNumber: nextNum,
      customerId: finalCustId,
      customerName: finalCustName,
      locationId: finalLocId,
      technicianName: technicianName || undefined,
      issue: computedIssue,
      requestType,
      productInterest,
      additionalNotes,
      date: rawDateObj.getTime(),
      status: "pending",
      expectedPaymentMethod,
      expectedAmount: parseFloat(expectedAmount) || 0,
      selectedProducts,
    };

    onSave(newRequestOrder);

    // Sales Invoice creation has been removed per user request (انشاء فاتوره الاختياري)

    // Increment the nextRequestNumber in Settings
    if (setSettings) {
      setSettings((prev) => ({
        ...prev,
        nextRequestNumber: nextNum + 1,
      }));
    }

    toast.success(
      `تم تأكيد وحفظ الطلب بنجاح برقم لـ الفني والعميل: ${finalId}`,
    );

    // Immediately open the Send to Technician dialog for this new request!
    setActiveTechOrder(newRequestOrder);

    // Reset Form fields
    setSelectedCustId("");
    setSelectedLocId("");
    setRequestType("جديد");
    setProductInterest("");
    setAdditionalNotes("");
    setTechnicianName("");
    setExpectedPaymentMethod("cash");
    setExpectedAmount("");
    setSelectedProducts([]);
    setTimeHour(1);
    setTimeAmPm("PM");
    setShowInlineAddCustomer(false);
    setNewCustName("");
    setNewCustPhone("");
    setNewCustCity("");
    setNewCustMapLink("");
    setCustomerSearchTerm("");
    setSelectedDayIndex(0);
    setCustomDate("");
  };

  return (
    <div className="space-y-6 w-full max-w-full mx-auto animation-fade-in pb-12 text-white px-2">
      {/* Top Header Section */}
      <div className="flex justify-between items-center bg-white/5 p-4 rounded-xl border border-white/10">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-orange-400" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              إدارة طلبات العميل
            </h1>
            <p className="text-xs text-white/50">
              قم بإنشاء وتأكيد طلبات الصيانة والتركيب، ونقلها فوراً للفنيين
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: Left is Form, Right is Active Requests List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* RIGHT COLUMN: Create New Request Form */}
        <div className="lg:col-span-4 h-[calc(100vh-150px)]">
          <Card className="glass border-white/5 shadow-xl bg-black/40 h-full flex flex-col">
            <CardHeader className="bg-black/20 border-b border-white/5 py-4 shrink-0">
              <CardTitle className="text-md flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Plus className="h-5 w-5 text-orange-400" />
                  إنشاء طلب جديد
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] bg-orange-600/10 text-orange-400 border-orange-500/20"
                >
                  نموذج الإنشاء
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 flex-1 overflow-y-auto">
              <CreateRequestForm
                customers={customers}
                onAddCustomer={onAddCustomer}
                orders={salesOrders}
                urgentOrders={orders}
                settings={settings}
                setSettings={setSettings!}
                catalog={catalog}
                onSaveUrgentOrder={onSave}
                onSaveSalesOrder={onSaveOrder}
                onSuccess={() => {}}
              />
            </CardContent>
          </Card>
        </div>

        {/* LEFT COLUMN: Active Requests List */}
        <div className="lg:col-span-8 h-[calc(100vh-150px)]">
          <Card className="glass border-white/5 shadow-xl bg-black/30 flex flex-col h-full pt-1.5 pb-2">
            <CardHeader className="bg-black/10 border-b border-white/5 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <CardTitle className="text-md flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-orange-400" />
                قائمة طلبات العملاء النشطة ({filteredRequests.length})
              </CardTitle>

              <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                <div className="flex bg-black/40 p-1 rounded-md border border-white/10">
                  <Button
                    variant={filterStatus === "all" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setFilterStatus("all")}
                    className={cn(
                      "h-7 text-[10px] px-3",
                      filterStatus === "all"
                        ? "bg-white/10 text-white"
                        : "text-white/50",
                    )}
                  >
                    الكل
                  </Button>
                  <Button
                    variant={
                      filterStatus === "incomplete" ? "secondary" : "ghost"
                    }
                    size="sm"
                    onClick={() => setFilterStatus("incomplete")}
                    className={cn(
                      "h-7 text-[10px] px-3",
                      filterStatus === "incomplete"
                        ? "bg-orange-500/20 text-orange-400"
                        : "text-white/50",
                    )}
                  >
                    الغير مكتملة
                  </Button>
                </div>
                <Select value={sortOrder} onValueChange={setSortOrder}>
                  <SelectTrigger className="bg-black/30 border-white/10 text-xs text-white h-9 w-[130px]">
                    <SelectValue placeholder="ترتيب حسب" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">الأحدث إضافة</SelectItem>
                    <SelectItem value="oldest">الأقدم إضافة</SelectItem>
                    <SelectItem value="dateAsc">التاريخ (الأقرب)</SelectItem>
                    <SelectItem value="dateDesc">التاريخ (الأبعد)</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative w-full sm:w-60">
                  <Search className="absolute right-3 top-2.5 h-4 w-4 text-white/30" />
                  <Input
                    placeholder="ابحث بالاسم أو الهاتف..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-black/30 border-white/10 text-xs pr-9 pl-3 h-9 text-right"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportOrders}
                  className="h-9 bg-white/5 border-white/10 hover:bg-white/10 text-xs gap-1"
                >
                  <Download className="h-4 w-4" />
                  تصدير الإكسل
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-0 flex-1 overflow-auto">
              {filteredRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center p-12 text-white/40 h-full">
                  <CalendarDays className="h-12 w-12 text-white/10 mb-2" />
                  <p className="text-sm font-semibold">
                    لا توجد طلبات جارية نشطة
                  </p>
                  <p className="text-xs text-white/30 mt-1">
                    يرجى ملء النموذج الجانبي لإدخال طلب جديد
                  </p>
                </div>
              ) : (
                <Table className="text-right border-none">
                  <TableHeader className="bg-black/20 border-b border-white/5">
                    <TableRow className="hover:bg-transparent border-white/5">
                      <TableHead className="text-right text-xs text-white/50 w-[120px]">
                        تاريخ الموعد
                      </TableHead>
                      <TableHead className="text-right text-xs text-white/50">
                        العميل والجوال
                      </TableHead>
                      <TableHead className="text-right text-xs text-white/50">
                        تفاصيل الطلب والمنتج
                      </TableHead>
                      <TableHead className="text-right text-xs text-white/50">
                        حالة الطلب
                      </TableHead>
                      <TableHead className="text-right text-xs text-white/50">
                        الفني المسؤول
                      </TableHead>
                      <TableHead className="text-right text-xs text-white/50 w-[100px]">
                        مبلغ الطلب
                      </TableHead>
                      <TableHead className="text-left text-xs text-white/50 pl-4 w-[140px]">
                        إجراءات
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRequests.map((order, idx) => {
                      // Work out day countdown
                      const diffDays = differenceInDays(
                        new Date(order.date),
                        new Date(),
                      );
                      const maintainDate = new Date(order.date);
                      const dayName = new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(maintainDate);
                      const dateStr = format(maintainDate, "yyyy/MM/dd");
                      const dateDetails = `(${dayName} ${dateStr})`;

                      const diffHours = (maintainDate.getTime() - new Date().getTime()) / (1000 * 60 * 60);

                      let dayLabel = "";
                      let dayColor = "text-white/40";
                      let rowClass = "border-white/5 hover:bg-white/[0.02]";

                      if (diffHours >= 0 && diffHours <= 2) {
                        rowClass = "bg-yellow-600/30 hover:bg-yellow-600/40 border-yellow-500/50";
                        dayLabel = `خلال ${Math.floor(diffHours)} ساعة ${dateDetails}`;
                        dayColor = "text-yellow-400 font-bold animate-pulse";
                      } else if (diffDays < 0) {
                        dayLabel = `متأخر بـ ${Math.abs(diffDays)} يوم ${dateDetails}`;
                        dayColor = "text-red-400 font-bold";
                      } else if (diffDays === 0) {
                        dayLabel = `اليوم ${dateDetails}`;
                        dayColor = "text-yellow-400 font-bold";
                      } else {
                        dayLabel = `بعد ${diffDays} يوم ${dateDetails}`;
                        dayColor = "text-orange-400";
                      }

                      return (
                        <TableRow
                          key={`${order.id}-${idx}`}
                          className={rowClass}
                        >
                          {/* Date and Time Column */}
                          <TableCell className="text-xs font-mono">
                            <span className="block text-white font-medium">
                              {format(order.date, "yyyy/MM/dd")}
                            </span>
                            <span className="block text-[10px] text-white/40 flex items-center gap-1 justify-end">
                              <Clock className="h-2.5 w-2.5" />
                              {format(order.date, "hh:mm a", { locale: arSA })}
                            </span>

                            {/* LATE CUSTOMER / OVERDUE BADGE */}
                            {order.date < Date.now() && (
                              <span className="block text-[10px] mt-1 text-center bg-red-600/20 text-red-400 border border-red-500/30 px-1 py-0.5 rounded font-bold animate-pulse">
                                ⚠️ عميل متأخر
                              </span>
                            )}

                            {/* LESS THAN 2 HOURS WARNING */}
                            {(() => {
                              const left = order.date - Date.now();
                              const isLessTwoHours =
                                left > 0 && left <= 2 * 60 * 60 * 1000;
                              if (isLessTwoHours) {
                                return (
                                  <span className="block text-[9px] mt-1 text-center bg-red-500 text-white font-bold px-1 py-0.5 rounded animate-bounce">
                                    🚨 متبقي أقل من ساعتين!
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </TableCell>

                          {/* Customer Identification with Order No */}
                          <TableCell className="text-xs font-bold text-blue-400">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1">
                                <span className="text-white hover:text-blue-300 transition-colors font-medium">
                                  {order.customerName}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="font-mono text-[9px] bg-white/5 border-white/10 text-white/70 py-0 px-1"
                                >
                                  {order.id}
                                </Badge>
                              </div>
                              {(() => {
                                const matchedCust = customers.find(
                                  (c) => c.id === order.customerId,
                                );
                                return matchedCust ? (
                                  <span className="text-[10px] text-white/40 font-mono font-normal">
                                    {matchedCust.phone}
                                  </span>
                                ) : null;
                              })()}
                            </div>
                          </TableCell>

                          {/* Application Details */}
                          <TableCell className="text-xs max-w-[180px] break-words">
                            <span className="block text-orange-400 font-medium">
                              {order.requestType || "طلب صيانة"}
                            </span>
                            <span
                              className="block text-white/60 text-[10px] line-clamp-1"
                              title={order.productInterest || order.issue}
                            >
                              {order.productInterest || order.issue}
                            </span>
                            {order.selectedProducts && order.selectedProducts.length > 0 && (
                              <span
                                className="block text-blue-300/80 text-[10px] font-semibold mt-1"
                                title={order.selectedProducts.map(p => p.name).join(", ")}
                              >
                                المنتجات: {order.selectedProducts.map(p => p.name).join(", ")}
                              </span>
                            )}
                          </TableCell>

                          {/* Order Status */}
                          <TableCell className="text-xs">
                            <Select
                              value={order.status}
                              onValueChange={(val: any) =>
                                onUpdateStatus(order.id, val)
                              }
                            >
                              <SelectTrigger className="h-6 text-[10px] bg-white/5 border-white/10 text-white min-w-[90px]">
                                <SelectValue placeholder="الحالة" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">
                                  قيد الانتظار
                                </SelectItem>
                                <SelectItem value="started">
                                  تم البدء
                                </SelectItem>
                                <SelectItem value="in_progress">
                                  جاري التنفيذ
                                </SelectItem>
                                <SelectItem value="completed">مكتمل</SelectItem>
                                <SelectItem value="canceled">ملغى</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>

                          {/* Assigned Technician */}
                          <TableCell className="text-xs">
                            {order.technicianName ? (
                              <Badge
                                variant="outline"
                                className="bg-blue-600/10 text-blue-400 border-blue-500/20 text-[10px]"
                              >
                                {order.technicianName}
                              </Badge>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-[10px] border-orange-500/20 text-orange-400 hover:bg-orange-500/10 px-1.5"
                                onClick={() => setActiveTechOrder(order)}
                              >
                                + تعيين الفني
                              </Button>
                            )}
                          </TableCell>

                          {/* Expected Amount */}
                          <TableCell className="text-xs font-bold text-green-400 pointer-events-none">
                            {order.expectedPaymentMethod === "credit" ? "آجل" : order.expectedPaymentMethod === "not_agreed" ? "لم يتفق" : `${order.expectedAmount || 0} ر.س`}
                          </TableCell>

                          {/* Quick trigger actions */}
                          <TableCell className="pl-4">
                            <div className="flex gap-1.5 justify-end items-center">
                              {/* SHARE/MESSAGE BUTTON */}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 border-emerald-600/30 text-emerald-400 hover:bg-emerald-600/10"
                                onClick={() => setActiveShareOrder(order)}
                                title="خيارات المراسلة (واتساب / تعيين الفني)"
                              >
                                <Share2 className="h-3.5 w-3.5 mx-1" /> مراسلة
                              </Button>

                              {/* INFO BUTTON */}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 border-indigo-600/30 text-indigo-400 hover:bg-indigo-600/10"
                                onClick={() => setInfoOrder(order)}
                                title="تفاصيل الطلب"
                              >
                                <HelpCircle className="h-3.5 w-3.5" />
                              </Button>

                              {/* EXTEND TIME BUTTON */}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 border-indigo-600/30 text-indigo-400 hover:bg-indigo-600/10"
                                onClick={() => setExtendingOrder(order)}
                                title="تمديد وقت الطلب"
                              >
                                <Clock className="h-3.5 w-3.5" />
                              </Button>

                              {/* PRINT BUTTON */}
                              {onPrintOrder && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 border-white/10 text-white/70 hover:bg-white/10 hover:text-white mr-auto"
                                  onClick={() => onPrintOrder(order)}
                                  title="طباعة"
                                >
                                  <Printer className="h-4 w-4" />
                                </Button>
                              )}

                              {/* DELETE BUTTON */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-500 hover:bg-red-600/20 mr-auto"
                                onClick={() => {
                                  setTargetDeleteId(order.id);
                                  setShowDeleteDialog(true);
                                }}
                                title="حذف"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>

                              {/* CHECKMARK: COMPLETE AND SEND TO MAINTENANCE APPOINTMENTS */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-green-400 hover:text-green-300 hover:bg-green-600/20 rounded-md border border-green-500/20"
                                onClick={() => {
                                  setCompletingOrder(order);
                                  setReminderMonths(0); // reset to no reminder
                                }}
                                title="إنجاز الموعد وإنشاء فاتورة"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 2. CHOOSE REMINDER / MOVE TO MAINTENANCE APPOINTMENTS MODAL */}
      <Dialog
        open={!!completingOrder}
        onOpenChange={(open) => !open && setCompletingOrder(null)}
      >
        <DialogContent className="glass border-white/10 text-white sm:max-w-lg bg-[#14181f]/95 shadow-2xl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              إنجاز الطلب وجدولة التذكير القادم
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4 text-right">
            <p className="text-xs text-white/70">
              يرجى تحديد وقت جدولة التذكير بالصيانة القادمة للعميل. سيتنقل هذا
              الموعد فورياً إلى{" "}
              <strong className="text-orange-400">
                مواعيد الصيانة الدورية
              </strong>
              .
            </p>

            {/* REMINDER OPTIONS LIST */}
            <Label className="text-xs text-white/50 block">
              حدد مدة التذكير القادم (تاريخ الموعد الجديد):
            </Label>
            <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 gap-2">
              {[
                { val: 0, label: "بدون تذكير" },
                { val: 1, label: "بعد شهر" },
                { val: 2, label: "بعد شهرين" },
                { val: 3, label: "بعد 3 أشهر" },
                { val: 4, label: "بعد 4 أشهر" },
                { val: 5, label: "بعد 5 أشهر" },
                { val: 6, label: "بعد 6 أشهر" },
                { val: 7, label: "بعد 7 أشهر" },
                { val: 8, label: "بعد 8 أشهر" },
                { val: 9, label: "بعد 9 أشهر" },
                { val: 10, label: "بعد 10 أشهر" },
                { val: 12, label: "بعد سنة كاملة" },
              ].map((opt) => (
                <Button
                  key={opt.val}
                  type="button"
                  variant={reminderMonths === opt.val ? "default" : "outline"}
                  onClick={() => setReminderMonths(opt.val)}
                  className={cn(
                    "h-10 text-xs text-center justify-center font-medium transition-all rounded-md px-1",
                    reminderMonths === opt.val
                      ? "bg-green-600 text-white hover:bg-green-500 border-green-600 shadow-md"
                      : "bg-white/5 text-white/70 border-white/5 hover:bg-white/10",
                  )}
                >
                  {opt.label}
                </Button>
              ))}
            </div>

            {reminderMonths > 0 && (
              <div className="bg-green-950/20 text-green-400/80 p-3 rounded-lg border border-green-500/10 text-xs">
                سيُجدول الموعد القادم بتاريخ:{" "}
                <strong>
                  {format(
                    new Date(
                      new Date().setMonth(
                        new Date().getMonth() + reminderMonths,
                      ),
                    ),
                    "dd MMMM yyyy",
                    { locale: arSA },
                  )}
                </strong>
              </div>
            )}

            {/* CHOOSE TECHNICIAN WHO ACTUALLY WENT */}
            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10 text-right">
              <Label className="text-white font-bold text-xs">
                من هو الفني الذي راح؟ (ضروري) *
              </Label>
              <Select
                value={actualTechnician}
                onValueChange={setActualTechnician}
              >
                <SelectTrigger className="bg-black/20 border-white/10 text-xs text-white h-10 w-full">
                  <SelectValue placeholder="اختر الفني الذي ذهب..." />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1d24] border-white/10 text-white">
                  {(settings.technicians || []).map((t: any) => {
                    const name = typeof t === "string" ? t : t.name;
                    return (
                      <SelectItem
                        key={name}
                        value={name}
                        className="text-xs text-white"
                      >
                        {name}
                      </SelectItem>
                    );
                  })}
                  {(!settings.technicians ||
                    settings.technicians.length === 0) && (
                    <SelectItem value="none" disabled className="text-xs">
                      يرجى إضافة فنيين من الإعدادات
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-white/50">
                سيتم حفظ هذا الفني كمنفذ عملي للخدمة وسينتقل معه لجدول الصيانة.
              </p>
            </div>

            {/* OPTIONAL: Create Invoice */}
            <div className="flex items-center gap-2 mt-4 bg-indigo-950/20 p-3 rounded-lg border border-indigo-500/20">
              <input
                type="checkbox"
                id="generateInvoice"
                checked={generateInvoice}
                onChange={(e) => setGenerateInvoice(e.target.checked)}
                className="w-4 h-4 rounded appearance-none border border-white/20 checked:bg-indigo-500 checked:border-indigo-500 relative before:content-[''] checked:before:absolute checked:before:left-[4px] checked:before:top-[1px] checked:before:w-[5px] checked:before:h-[9px] checked:before:border-r-2 checked:before:border-b-2 checked:before:border-white checked:before:rotate-45"
              />
              <Label htmlFor="generateInvoice" className="text-white text-xs cursor-pointer">
                إنشاء فاتورة مبيعات لهذا الطلب (التوجه للكاشير)
              </Label>
            </div>
          </div>
          <DialogFooter className="flex flex-row-reverse gap-2 justify-end mt-4 border-t border-white/5 pt-4">
            <Button
              onClick={() => {
                if (completingOrder) {
                  if (!actualTechnician) {
                    toast.error("يرجى تحديد الفني الذي راح للطلب قبل الحفظ.");
                    return;
                  }

                  const updatedOrder: ServiceOrder = {
                    ...completingOrder,
                    status: "completed" as const,
                    technicianName: actualTechnician,
                  };

                  if (reminderMonths > 0) {
                    const nextDate = new Date();
                    nextDate.setMonth(nextDate.getMonth() + reminderMonths);
                    updatedOrder.nextMaintenanceDate = nextDate.getTime();
                  } else {
                    updatedOrder.nextMaintenanceDate = undefined;
                  }

                  // Fire callback if assigned
                  if (onMoveToAppointments) {
                    onMoveToAppointments(updatedOrder);
                    toast.success(
                      "تم تأكيد إنجاز الطلب ونقله إلى مواعيد الصيانة الدورية بنجاح!",
                    );
                  } else {
                    onSave(updatedOrder);
                    toast.success("تم تأكيد إنجاز الطلب بنجاح.");
                  }
                  
                  if (generateInvoice && onNavigateToPOS) {
                    onNavigateToPOS(updatedOrder);
                  }
                  setCompletingOrder(null);
                }
              }}
              className="bg-green-600 hover:bg-green-500 text-white font-medium"
            >
              تأكيد وحفظ
            </Button>
            <Button
              variant="outline"
              className="border-white/10 text-white/70 hover:text-white"
              onClick={() => setCompletingOrder(null)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2.5 EXTEND TIME / EDIT TIME DIALOG */}
      <Dialog
        open={!!extendingOrder}
        onOpenChange={(open) => !open && setExtendingOrder(null)}
      >
        <DialogContent className="glass border-white/10 text-white sm:max-w-md bg-[#14181f]/95 shadow-2xl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Clock className="h-5 w-5 text-indigo-400" />
              تعديل / تمديد وقت الطلب
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-6">
            <div className="space-y-2">
              <Label className="text-white/70">تاريخ ووقت الطلب الحالي:</Label>
              <Input
                type="datetime-local"
                className="bg-white/5 border-white/10 text-white"
                value={
                  extendingOrder?.date
                    ? new Date(extendingOrder.date - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
                    : ""
                }
                onChange={(e) => {
                  if (extendingOrder && e.target.value) {
                    const localDate = new Date(e.target.value);
                    setExtendingOrder({ ...extendingOrder, date: localDate.getTime() });
                  }
                }}
              />
            </div>
            <div className="space-y-4">
              <p className="text-sm text-white/70">
                أو إضافة وقت للوقت المحدد:
              </p>
              <div className="grid grid-cols-2 xs:grid-cols-3 gap-2">
                {[
                  { label: "ساعة", ms: 3600000 },
                  { label: "ساعتين", ms: 2 * 3600000 },
                  { label: "3 ساعات", ms: 3 * 3600000 },
                  { label: "يوم", ms: 24 * 3600000 },
                  { label: "يومين", ms: 48 * 3600000 },
                  { label: "3 أيام", ms: 72 * 3600000 },
                  { label: "أسبوع", ms: 7 * 24 * 3600000 },
                  { label: "أسبوعين", ms: 14 * 24 * 3600000 },
                  { label: "شهر", ms: 30 * 24 * 3600000 },
                ].map((opt) => (
                  <Button
                    key={opt.label}
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (extendingOrder) {
                        const newDate = extendingOrder.date + opt.ms;
                        setExtendingOrder({ ...extendingOrder, date: newDate });
                      }
                    }}
                    className="bg-white/5 text-white/70 border-white/5 hover:bg-indigo-600/20 hover:text-indigo-300"
                  >
                    + {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="default"
              className="bg-indigo-600 hover:bg-indigo-500 text-white"
              onClick={() => {
                if (extendingOrder) {
                  onSave(extendingOrder);
                  toast.success(`تم حفظ الوقت الجديد للطلب`);
                  setExtendingOrder(null);
                }
              }}
            >
              حفظ
            </Button>
            <Button
              variant="outline"
              className="border-white/10 text-white/70 hover:text-white"
              onClick={() => setExtendingOrder(null)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2.6 INFO DIALOG */}
      <Dialog
        open={!!activeShareOrder}
        onOpenChange={(open) => !open && setActiveShareOrder(null)}
      >
        <DialogContent className="glass border-white/10 text-white sm:max-w-md bg-[#14181f]/95 shadow-2xl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Share2 className="h-5 w-5 text-emerald-400" />
              خيارات المراسلة والمشاركة
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-4">
            <Button
              className="w-full justify-start items-center h-12 bg-green-600/10 hover:bg-green-600/20 text-green-400 border border-green-500/20"
              onClick={() => {
                 const order = activeShareOrder;
                 if (!order) return;
                 const matchedCust = customers.find((c) => c.id === order.customerId);
                 const phoneNum = matchedCust?.phone || "";
                 const cleanPhone = phoneNum.replace(/^0/, "966").replace(/\D/g, "");
                 
                 const defaultCustomerTemplate = `مرحباً أ. {اسم العميل}\nنود تذكيركم بموعد طلبكم رقم ({رقم الطلب})\nالمقرر في: {موعد الزياره}\nنوع الطلب: {الخدمه}\n\nنسعد بخدمتكم دائماً في أي وقت.`;
                 const template = settings.whatsappTemplateCustomer || defaultCustomerTemplate;
                 const reminderText = generateWhatsAppMessage(template, order, matchedCust);

                 const waUrl = cleanPhone ? `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(reminderText)}` : "";

                 if (waUrl) {
                   window.open(waUrl, "_blank");
                 } else {
                   toast.error("رقم جوال العميل غير صحيح لإرسال واتساب.");
                 }
                 setActiveShareOrder(null);
              }}
            >
              <MessageSquare className="h-4 w-4 ml-2" /> مراسلة العميل عبر الواتساب
            </Button>
            
            <Button
              className="w-full justify-start items-center h-12 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20"
              onClick={() => {
                const order = activeShareOrder;
                if (!order) return;
                
                if (!order.technicianName) {
                   // Open tech assignment dialog
                   setActiveTechOrder(order);
                   setActiveShareOrder(null);
                   return;
                }
                
                // If technician assigned, prepare message
                const matchedCust = customers.find((c) => c.id === order.customerId);
                const techObject = (settings.technicians || []).find((t: any) => {
                  const tName = typeof t === "string" ? t : t.name;
                  return tName === order.technicianName;
                });
                const techPhone = techObject && typeof techObject !== "string" ? techObject.phone : "";
                const cleanTechPhone = techPhone ? techPhone.replace(/^0/, "966").replace(/\D/g, "") : "";

                const defaultTechTemplate = `مرحباً ${order.technicianName}\nتذكير بمهمة طلب رقم ({رقم الطلب})\nاسم العميل: {اسم العميل}\nجوال العميل: {جوال العميل}\nالموقع: {موقع العميل}\nالخريطة: {الموقع الجغرافي}\nالتوقيت: {موعد الزياره}\nالخدمة: {الخدمه}\nملاحظات: {ملاحضه}`;
                const template = settings.whatsappTemplateTechnician || defaultTechTemplate;
                const techText = generateWhatsAppMessage(template, order, matchedCust);

                const waTechUrl = cleanTechPhone ? `whatsapp://send?phone=${cleanTechPhone}&text=${encodeURIComponent(techText)}` : "";
                
                if (waTechUrl) {
                  window.open(waTechUrl, "_blank");
                } else {
                  toast.info("يرجى تعيين فني برقم جوال أولاً لإرسال التذكير.");
                  setActiveTechOrder(order); // fallback to open tech dialog
                }
                setActiveShareOrder(null);
              }}
            >
              {activeShareOrder?.technicianName ? (
                <><MessageCircle className="h-4 w-4 ml-2" /> تذكير الفني بكامل تفاصيل الطلب</>
              ) : (
                <><UserPlus className="h-4 w-4 ml-2" /> إرسال للمهام وتعيين فني</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 2.7 INFO DIALOG */}
      <Dialog
        open={!!infoOrder}
        onOpenChange={(open) => !open && setInfoOrder(null)}
      >
        <DialogContent className="glass border-white/10 text-white sm:max-w-md bg-[#14181f]/95 shadow-2xl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-indigo-400" />
              تفاصيل الطلب: {infoOrder?.id || ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                <span className="block text-white/50 text-xs mb-1">العميل:</span>
                <span className="font-semibold">{infoOrder?.customerName}</span>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                <span className="block text-white/50 text-xs mb-1">اسم الفني:</span>
                <span className="font-semibold">{infoOrder?.technicianName || "غير محدد"}</span>
                {infoOrder?.technicianName && (
                  <div className="mt-2">
                    {(() => {
                      const locations = storage.getTechLocations ? storage.getTechLocations() : {};
                      const techLoc = locations[infoOrder.technicianName];
                      if (techLoc && (Date.now() - techLoc.lastUpdate < 3600000)) {
                        return (
                          <div className="mt-2 space-y-2">
                            <Button size="sm" variant="outline" className="w-full text-xs h-8 bg-blue-500/10 text-blue-400 border-blue-500/20" onClick={() => window.open(`https://maps.google.com/?q=${techLoc.lat},${techLoc.lng}`, "_blank")}>
                              <MapPin className="h-3 w-3 mr-1 ml-1" /> فتح في تطبيق الخرائط
                            </Button>
                            {API_KEY && (
                              <div className="w-full h-32 rounded-lg overflow-hidden border border-white/10 mt-2">
                                <APIProvider apiKey={API_KEY} version="weekly">
                                  <Map
                                    defaultCenter={techLoc}
                                    defaultZoom={15}
                                    mapId="DEMO_MAP_ID_2"
                                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                                    style={{ width: '100%', height: '100%' }}
                                  >
                                    <AdvancedMarker position={techLoc}>
                                      <Pin background="#22c55e" glyphColor="#fff" />
                                    </AdvancedMarker>
                                  </Map>
                                </APIProvider>
                              </div>
                            )}
                          </div>
                        )
                      }
                      return <span className="text-[10px] text-white/40">لا يوجد موقع متاح حالياً للفني</span>;
                    })()}
                  </div>
                )}
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/10 col-span-2">
                <span className="block text-white/50 text-xs mb-1">نوع الطلب (المشكلة/التفاصيل):</span>
                <span className="font-semibold whitespace-pre-wrap">{infoOrder?.issue}</span>
              </div>
              
              {infoOrder?.activityLogs && infoOrder.activityLogs.length > 0 && (
                <div className="bg-white/5 p-3 rounded-lg border border-white/10 col-span-2">
                  <span className="block text-white/50 text-xs mb-2">سجل النشاط و التواصل:</span>
                  <div className="space-y-2">
                    {infoOrder.activityLogs.map((log: any, i: number) => (
                      <div key={i} className="flex gap-2 text-sm border-l-2 border-orange-500/50 pl-2">
                        <span className="text-white/40 text-xs shrink-0" dir="ltr">{new Date(log.date).toLocaleString('ar-SA')}</span>
                        <span className="text-white/90">{log.text}</span>
                      </div>
                    ))}
                  </div>
                  {infoOrder.contactStatus && (
                    <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border bg-black/20">
                      <span className="text-white/50">حالة التواصل الحالية:</span>
                      <span className={infoOrder.contactStatus === 'success' ? 'text-green-400' : 'text-yellow-400'}>
                        {infoOrder.contactStatus === 'success' ? 'تم الرد' : 'محاولة - لم يرد'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {infoOrder?.additionalNotes && (
                 <div className="bg-white/5 p-3 rounded-lg border border-white/10 col-span-2">
                  <span className="block text-white/50 text-xs mb-1">ملاحظات إضافية:</span>
                  <span className="font-semibold whitespace-pre-wrap">{infoOrder?.additionalNotes}</span>
                </div>
              )}
              <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                <span className="block text-white/50 text-xs mb-1">المبلغ المتوقع:</span>
                <span className="font-bold text-green-400">
                  {infoOrder?.expectedPaymentMethod === "credit" ? "آجل" : infoOrder?.expectedPaymentMethod === "not_agreed" ? "لم يتم الاتفاق" : `${infoOrder?.expectedAmount || 0} ر.س`}
                </span>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                <span className="block text-white/50 text-xs mb-1">طريقة الدفع:</span>
                <span className="font-semibold">
                  {infoOrder?.expectedPaymentMethod === "cash" ? "نقد" :
                   infoOrder?.expectedPaymentMethod === "network" ? "شبكة" :
                   infoOrder?.expectedPaymentMethod === "transfer" ? "تحويل" :
                   infoOrder?.expectedPaymentMethod === "credit" ? "آجل (مديونية)" :
                   infoOrder?.expectedPaymentMethod === "not_agreed" ? "لم يتم الاتفاق بعد" : "غير محدد"}
                </span>
              </div>
              {infoOrder?.selectedProducts && infoOrder.selectedProducts.length > 0 && (
                <div className="bg-white/5 p-3 rounded-lg border border-white/10 col-span-2">
                  <span className="block text-white/50 text-xs mb-1">المنتجات المرتبطة:</span>
                  <ul className="list-disc list-inside">
                    {infoOrder.selectedProducts.map((p, i) => (
                      <li key={i} className="text-white/80">{p.name || p.id}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 3. SEND TO TECHNICIAN DIALOG */}
      <Dialog
        open={!!activeTechOrder}
        onOpenChange={(open) => !open && setActiveTechOrder(null)}
      >
        <DialogContent className="glass border-white/10 text-white sm:max-w-md bg-[#14181f]/95 shadow-2xl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-orange-400" />
              إرسال للفني وتعيين المهمة فوراً
            </DialogTitle>
          </DialogHeader>

          <div className="py-2 text-right">
            <div className="bg-orange-500/10 border border-orange-500/20 p-3 rounded-lg mb-4 text-xs space-y-1">
              <span className="font-bold text-orange-400 block mb-1">
                تفاصيل طلب الصيانة:
              </span>
              <p className="text-white/80">
                <strong>العميل:</strong> {activeTechOrder?.customerName}
              </p>
              <p className="text-white/80">
                <strong>رقم الطلب:</strong> {activeTechOrder?.id}
              </p>
              <p className="text-white/80">
                <strong>نوع ووصف المكون:</strong> {activeTechOrder?.issue}
              </p>
            </div>

            <Label className="text-xs text-white/50 block mb-2">
              اختر الفني لربط وإرسال هذا الطلب إليه:
            </Label>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {(() => {
                const allTechnicians = [
                  ...(settings.users?.filter(u => u.role === "technician") || []),
                  ...(settings.technicians?.map(t => typeof t === "string" ? {name: t} : t) || [])
                ];

                const uniqueTechs = Array.from(new globalThis.Map(allTechnicians.map(t => [t.name, t])).values());
                
                if (uniqueTechs.length === 0) {
                  return (
                    <div className="text-center text-white/50 py-4 text-xs">
                      <p>لا يوجد فنيين مسجلين حالياً.</p>
                      <p className="text-white/30 text-[11px] mt-1">
                        يمكنك إضافة مستخدمين بصلاحية فني من الإعدادات.
                      </p>
                    </div>
                  );
                }

                // Compute match scores
                const techList = uniqueTechs.map((tech: any) => {
                  let score = 0;
                  const matchReasons: string[] = [];
                  
                  if (activeTechOrder) {
                    const orderText = `${activeTechOrder.issue} ${activeTechOrder.requestType} ${activeTechOrder.productInterest} ${activeTechOrder.selectedProducts?.map(p => p.name).join(' ')}`.toLowerCase();
                    
                    if (tech.specializations && tech.specializations.length > 0) {
                      for (const spec of tech.specializations) {
                        if (orderText.includes(spec.toLowerCase())) {
                          score += 2;
                          matchReasons.push(`تخصص ${spec}`);
                        }
                      }
                    }
                    
                    if (tech.assignedProducts && tech.assignedProducts.length > 0) {
                      for (const prod of tech.assignedProducts) {
                         if (orderText.includes(prod.toLowerCase())) {
                           score += 3;
                           matchReasons.push(`منتج ${prod}`);
                         }
                      }
                    }
                  }
                  
                  return { ...tech, __score: score, __reasons: matchReasons };
                }).sort((a: any, b: any) => b.__score - a.__score);

                return techList.map((tech: any) => {
                  const tName = typeof tech === "string" ? tech : tech.name;
                  const tPhone = typeof tech === "string" ? "" : tech.phone;

                  return (
                    <Button
                      key={tName}
                      variant="outline"
                      className={`w-full justify-between items-center h-auto py-3 bg-white/5 hover:bg-white/10 transition-colors text-right flex-wrap gap-2 ${tech.__score > 0 ? "border-green-500/50 bg-green-900/10" : "border-white/10"}`}
                      onClick={async () => {
                        if (activeTechOrder) {
                          const customerInfo = customers.find(
                            (c) => c.id === activeTechOrder.customerId,
                          );
                          const loc =
                            customerInfo && activeTechOrder.locationId
                              ? customerInfo.locations.find(
                                  (l) => l.id === activeTechOrder.locationId,
                                )
                              : null;
                          const mapLinkStr = loc?.mapLink || "";
                          const addressStr = loc
                            ? `${loc.address} ${loc.city || ""}`.trim()
                            : "";
                          const finalMap = mapLinkStr || addressStr || "—";

                          const phoneStr = (tPhone || "")
                            .replace(/^0/, "966")
                            .replace(/\D/g, "");

                          const typeStr =
                            activeTechOrder.requestType || "صيانة";
                          const detailsStr =
                            activeTechOrder.productInterest || "";
                          const serviceStr = detailsStr
                            ? `${typeStr} - ${detailsStr}`
                            : typeStr;
                          const notesStr =
                            activeTechOrder.additionalNotes || "—";

                          const paymentMethodAr =
                            {
                              cash: "نقد",
                              network: "شبكة",
                              transfer: "تحويل",
                              credit: "آجل",
                              not_agreed: "لم يتم الاتفاق بعد"
                            }[
                              activeTechOrder.expectedPaymentMethod || "cash"
                            ] || "غير محدد";

                          const paymentStr =
                            activeTechOrder.expectedPaymentMethod === "credit" || activeTechOrder.expectedPaymentMethod === "not_agreed"
                              ? paymentMethodAr
                              : `${paymentMethodAr} (${activeTechOrder.expectedAmount || 0} ر.س)`;

                          const productsStr =
                            activeTechOrder.selectedProducts
                              ?.map((p) => `- ${p.name}`)
                              .join("\n") || "";
                          const finalServiceStr =
                            activeTechOrder.requestType === "جديد" &&
                            productsStr
                              ? `${typeStr}\nالمنتجات:\n${productsStr}`
                              : serviceStr;

                          let fallbackMsg = `🔧 *طلب عمل جديد*\n━━━━━━━━━━━━━━━\n#️⃣ رقم الطلب: ${activeTechOrder.id || ""}\n👤 العميل: ${activeTechOrder.customerName || ""}\n📱 الجوال: ${customerInfo?.phone || ""}\n📍 الموقع: ${addressStr}\n🛠️ الخدمة: ${finalServiceStr}\n💳 الدفع: ${paymentStr}\n🗺️ الموقع الجغرافي: ${finalMap}\n📝 ملاحظات: ${notesStr}\n━━━━━━━━━━━━━━━\nيرجى التواصل مع العميل والتأكيد ✅`;

                          if (settings.whatsappTemplateTechnician) {
                            fallbackMsg = settings.whatsappTemplateTechnician
                              .replace(/{رقم الطلب}/g, activeTechOrder.id || "")
                              .replace(
                                /{اسم العميل}/g,
                                activeTechOrder.customerName || "",
                              )
                              .replace(
                                /{جوال العميل}/g,
                                customerInfo?.phone || "",
                              )
                              .replace(/{موقع العميل}/g, addressStr)
                              .replace(
                                /{موعد الزياره}/g,
                                format(
                                  new Date(activeTechOrder.date),
                                  "dd/MM/yyyy - hh:mm a",
                                ),
                              )
                              .replace(/{الخدمه}/g, finalServiceStr)
                              .replace(/{طريقه الدفع}/g, paymentStr)
                              .replace(/{الموقع الجغرافي}/g, finalMap)
                              .replace(/{ملاحضه}/g, notesStr);
                          }
                          const url = `whatsapp://send?phone=${phoneStr}&text=${encodeURIComponent(fallbackMsg)}`;

                          // Save technician assignment instantly
                          onSave({ ...activeTechOrder, technicianName: tName });
                          toast.success(
                            `تم ربط الطلب بالفني [${tName}] بنجاح!`,
                          );

                          // Launch WhatsApp if phone is loaded
                          if (phoneStr) {
                            window.location.href = url;
                          } else {
                            toast.info(
                              `تم ربط المهمة بالفني ${tName}، ولكن تعذر إرسال الواتساب لعدم وجود هاتف مسجل له.`,
                            );
                          }
                          setActiveTechOrder(null);
                        }
                      }}
                    >
                      <div className="flex flex-col items-start gap-1">
                        <div className="flex gap-2 items-center">
                          <span className="font-bold text-orange-400 text-sm">
                            {tName}
                          </span>
                          {tech.__score > 0 && (
                            <span className="bg-green-500/20 text-green-400 text-[9px] px-1.5 py-0.5 rounded border border-green-500/30">
                              مرشح ({tech.__score})
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-white/50 font-mono">
                          {tPhone || "بدون هاتف مسجل"}
                        </span>
                        {tech.__reasons && tech.__reasons.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {tech.__reasons.map((r: string, i: number) => (
                              <span key={i} className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <MessageCircle className="h-5 w-5 text-green-400 shrink-0" />
                    </Button>
                  );
                });
              })()}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <PasswordDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        adminPassword={settings.adminPassword}
        onUpdateAdminPassword={
          setSettings
            ? (newPass) => setSettings({ ...settings, adminPassword: newPass })
            : undefined
        }
        onSuccess={() => {
          if (targetDeleteId) onDelete(targetDeleteId);
          setTargetDeleteId(null);
          toast.success("تم الحذف بنجاح");
        }}
        title="تأكيد الحذف"
        description="يرجى إدخال كلمة مرور الحماية لتأكيد حذف هذا الطلب."
      />
    </div>
  );
}
