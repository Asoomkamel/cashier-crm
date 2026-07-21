/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from "react";
import { Customer, ServiceOrder, AppSettings } from "../types";
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
  Edit,
  Plus,
  Search,
  Trash2,
  CheckCircle,
  Clock,
  UserPlus,
  MessageCircle,
  Bell,
  AlertTriangle,
  HelpCircle,
  Share2,
  MessageSquare,
  Printer,
  Download,
} from "lucide-react";
import * as xlsx from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
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
import { generateWhatsAppMessage } from "../utils/whatsapp";
import { PasswordDialog } from "./PasswordDialog";

interface AppointmentsProps {
  settings: AppSettings;
  orders: ServiceOrder[];
  salesOrders?: any[]; // using any for Order to avoid importing if not already there, actually I can just import Order
  customers: Customer[];
  onSave: (order: ServiceOrder) => void;
  onUpdateStatus: (
    id: string,
    status: "pending" | "completed" | "canceled",
  ) => void;
  onDelete: (id: string) => void;
  onAddCustomer: (customer: Customer) => void;
  setSettings?: React.Dispatch<React.SetStateAction<AppSettings>>;
  onNavigateToPOS?: (order: ServiceOrder) => void;
  onPrintOrder?: (order: ServiceOrder) => void;
  adminPassword?: string;
}

export default function Appointments({
  settings,
  setSettings,
  orders,
  salesOrders = [],
  customers,
  onSave,
  onUpdateStatus,
  onDelete,
  onAddCustomer,
  onNavigateToPOS,
  onPrintOrder,
  adminPassword,
}: AppointmentsProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [targetDeleteId, setTargetDeleteId] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [editingOrderData, setEditingOrderData] = useState<ServiceOrder | null>(
    null,
  );
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
  const [extendingDays, setExtendingDays] = useState<number>(0);
  const [extendingDateStr, setExtendingDateStr] = useState<string>("");
  const [reminderMonths, setReminderMonths] = useState<number>(0);
  const [completingNextDate, setCompletingNextDate] = useState<string>("");

  // Form State
  const [selectedCustId, setSelectedCustId] = useState("");
  const [selectedLocId, setSelectedLocId] = useState("");
  const [issue, setIssue] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [nextMaintenanceDate, setNextMaintenanceDate] = useState("");
  const [technicianName, setTechnicianName] = useState("");

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

  const handleExportOrders = () => {
    try {
      const exportData = orders.map((o) => ({
        "رقم الموعد": o.id,
        "العميل": o.customerName,
        "تاريخ الموعد": format(o.date, "yyyy/MM/dd hh:mm a", { locale: arSA }),
        "حالة الموعد":
          o.status === "completed"
            ? "مكتمل"
            : o.status === "canceled"
            ? "ملغى"
            : "قادم",
        "المشكلة / الخدمة": o.issue,
        "الفني": o.technicianName || "غير محدد",
      }));

      const ws = xlsx.utils.json_to_sheet(exportData);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "مواعيد الصيانة");
      xlsx.writeFile(wb, `مواعيد_${new Date().toISOString().split("T")[0]}.xlsx`);
      toast.success("تم تصدير المواعيد بنجاح");
    } catch (error) {
      toast.error("حدث خطأ أثناء التصدير");
    }
  };

  useEffect(() => {
    if (newCustPhone.length >= 8) {
      const existing = customers.find((c) => c.phone === newCustPhone);
      if (existing && editingCustId !== existing.id) {
        toast.info("تم العثور على العميل، تم جلب بياناته.");
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

  const filtered = useMemo(() => {
    const list = orders.filter((o) => {
      // Exclude completed orders that have no next maintenance date (i.e. "without reminder")
      if (o.status === "completed" && !o.nextMaintenanceDate) {
        return false;
      }

      const c = customers.find((cust) => cust.id === o.customerId);
      const phoneMatch = c ? c.phone.includes(searchTerm) : false;
      return (
        (o.customerName || "").includes(searchTerm) ||
        (o.issue && o.issue.includes(searchTerm)) ||
        phoneMatch
      );
    });

    return list.sort((a, b) => {
      // If one doesn't have a next maintenance date, it goes to the bottom
      if (!a.nextMaintenanceDate && !b.nextMaintenanceDate) return 0;
      if (!a.nextMaintenanceDate) return 1;
      if (!b.nextMaintenanceDate) return -1;

      // Sort by closest first (whether overdue or upcoming)
      // Since overdue means smaller timestamp, sorting ascending will put oldest/overdue first.
      return a.nextMaintenanceDate - b.nextMaintenanceDate;
    });
  }, [orders, searchTerm]);

  const confirmDelete = () => {
    if (adminPassword && passwordInput === adminPassword) {
      if (targetDeleteId) {
        onDelete(targetDeleteId);
        toast.success("تم حذف الموعد بنجاح");
      }
      setShowDeleteDialog(false);
      setPasswordInput("");
      setTargetDeleteId(null);
    } else {
      toast.error("كلمة المرور غير صحيحة");
    }
  };

  const handleSave = () => {
    let finalCustId = selectedCustId;
    let finalCustName = customer?.name || "";
    let finalLocId = selectedLocId;

    if (showInlineAddCustomer) {
      if (!newCustName || !newCustPhone || !newCustCity || !newCustDistrict) {
        toast.error("يرجى تعبئة الاسم، الجوال، المدينة، والحي");
        return;
      }
      const existingCust = customers.find((c) => c.phone === newCustPhone);

      if (existingCust) {
        finalCustId = existingCust.id;
        finalCustName = newCustName;

        const locMatch = existingCust.locations.find(
          (l) =>
            l.city === newCustCity &&
            l.district === newCustDistrict &&
            l.mapLink === newCustMapLink,
        );

        if (locMatch) {
          finalLocId = locMatch.id;
          if (existingCust.type === "lead") {
            const updatedCustomer: Customer = {
              ...existingCust,
              type: "customer",
            };
            onAddCustomer(updatedCustomer);
          }
        } else {
          const newLocId = Math.random().toString(36).substr(2, 9);
          finalLocId = newLocId;
          const updatedCustomer: Customer = {
            ...existingCust,
            name: newCustName,
            type: "customer", // Convert to customer
            locations: [
              ...existingCust.locations,
              {
                id: newLocId,
                address: newCustDistrict,
                district: newCustDistrict,
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
          name: newCustName,
          phone: newCustPhone,
          type: "customer", // Directly create as customer since invoice/appointment is active
          createdAt: Date.now(),
          locations: [
            {
              id: Math.random().toString(36).substr(2, 9),
              address: newCustDistrict,
              district: newCustDistrict,
              type: "تم إضافته للموعد",
              city: newCustCity,
              mapLink: newCustMapLink,
            },
          ],
        };
        onAddCustomer(newCustomer);
        finalCustId = newCustomer.id;
        finalCustName = newCustName;
        finalLocId = newCustomer.locations[0].id;
      }
    } else {
      // Existing customer selected
      const existingCust = customers.find((c) => c.id === finalCustId);
      if (existingCust && existingCust.type === "lead") {
        const updatedCustomer: Customer = { ...existingCust, type: "customer" };
        onAddCustomer(updatedCustomer);
      }
    }

    if (!finalCustId || !issue) return;

    const order: ServiceOrder = {
      ...(editingOrderData || {}),
      id: editingOrderData?.id || Math.random().toString(36).substr(2, 9),
      customerId: finalCustId,
      customerName: finalCustName,
      locationId: finalLocId,
      technicianName,
      issue,
      date: new Date(date).getTime(),
      nextMaintenanceDate: nextMaintenanceDate
        ? new Date(nextMaintenanceDate).getTime()
        : undefined,
      status: "pending",
    };

    if (
      issue &&
      setSettings &&
      (!settings.savedInterests || !settings.savedInterests.includes(issue))
    ) {
      const updatedInterests = [...(settings.savedInterests || []), issue];
      setSettings((prev) => {
        const newSettings = { ...prev, savedInterests: updatedInterests };
        storage.saveSettings(newSettings);
        return newSettings;
      });
    }

    const isNewAssignment = !!technicianName && (!editingOrderData || editingOrderData.technicianName !== technicianName);
    onSave(order);

    if (isNewAssignment) {
      const techObject = (settings.technicians || []).find((t: any) => {
        const tName = typeof t === "string" ? t : t.name;
        return tName === technicianName;
      });
      const techPhone = techObject && typeof techObject !== "string" ? techObject.phone : "";
      const cleanTechPhone = techPhone ? techPhone.replace(/^0/, "966").replace(/\D/g, "") : "";
      
      if (cleanTechPhone) {
        const defaultTechTemplate = `مرحباً ${technicianName}\nتذكير بمهمة موعد رقم ({رقم الطلب})\nاسم العميل: {اسم العميل}\nجوال العميل: {جوال العميل}\nالموقع: {موقع العميل}\nالخريطة: {الموقع الجغرافي}\nالتوقيت: {موعد الزياره}\nالخدمة: {الخدمه}\nملاحظات: {ملاحضه}`;
        const template = settings.whatsappTemplateTechnician || defaultTechTemplate;
        const matchedCust = customers.find(c => c.id === finalCustId);
        const techText = generateWhatsAppMessage(template, order, matchedCust);
        const url = `whatsapp://send?phone=${cleanTechPhone}&text=${encodeURIComponent(techText)}`;
        window.open(url, "_blank");
      }
    }

    setSelectedCustId("");
    setSelectedLocId("");
    setIssue("");
    setTechnicianName("");
    setNextMaintenanceDate("");
    setShowInlineAddCustomer(false);
    setNewCustName("");
    setNewCustPhone("");
    setNewCustCity("");
    setNewCustMapLink("");
    setCustomerSearchTerm("");
    setEditingOrderData(null);
    setShowAddDialog(false);
  };

  return (
    <div className="space-y-4 h-[calc(100vh-120px)] flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white/5 p-4 rounded-xl border border-white/5">
        <div className="flex items-center gap-4 flex-1 max-w-3xl">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-white/40" />
            <Input
              placeholder="ابحث بالاسم، المشكلة، أو رقم الجوال..."
              className="pr-10 bg-black/20 border-white/10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportOrders}
            className="h-9 bg-white/5 border-white/10 hover:bg-white/10 text-xs gap-1 hidden sm:flex"
          >
            <Download className="h-4 w-4" />
            تصدير الإكسل
          </Button>
        </div>
        <Dialog
          open={showAddDialog}
          onOpenChange={(val) => {
            setShowAddDialog(val);
            if (!val) setEditingOrderData(null);
          }}
        >
          <DialogTrigger asChild>
            <Button className="bg-orange-600 hover:bg-orange-500">
              <Plus className="ml-2 h-4 w-4" />
              حجز موعد جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="glass border-white/10 text-white max-w-3xl">
            <DialogHeader>
              <DialogTitle>إنشاء طلب صيانة / حجز موعد</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto px-1">
              {!showInlineAddCustomer ? (
                <div className="space-y-2 relative">
                  <div className="flex justify-between items-center">
                    <Label>العميل (ابحث بالاسم أو الجوال)</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-blue-400"
                      onClick={() => setShowInlineAddCustomer(true)}
                    >
                      + إضافة عميل جديد
                    </Button>
                  </div>
                  <div className="relative">
                    <Input
                      placeholder="رقم أو اسم العميل..."
                      value={customerSearchTerm}
                      onChange={(e) => {
                        setCustomerSearchTerm(e.target.value);
                        setCustomerSelectOpen(true);
                        if (e.target.value === "") setSelectedCustId("");
                      }}
                      onFocus={() => setCustomerSelectOpen(true)}
                      className="bg-white/5 border-white/10"
                    />
                    {customerSelectOpen && customerSearchTerm && (
                      <div className="absolute z-50 w-full mt-1 bg-[#1c2128] border border-white/10 rounded-md shadow-lg max-h-60 overflow-auto">
                        {filteredCustomers.length === 0 ? (
                          <div className="p-2 text-sm text-white/50 text-center">
                            لا يوجد عميل بهذا الاسم أو الرقم.
                            <Button
                              variant="link"
                              className="text-blue-400 px-1"
                              onClick={() => setShowInlineAddCustomer(true)}
                            >
                              أضف كعميل جديد
                            </Button>
                          </div>
                        ) : (
                          filteredCustomers.map((c) => (
                            <div
                              key={c.id}
                              className="p-2 cursor-pointer hover:bg-white/10 border-b border-white/5 last:border-0 flex flex-col"
                              onClick={() => {
                                setSelectedCustId(c.id);
                                setCustomerSearchTerm(`${c.name} - ${c.phone}`);
                                setCustomerSelectOpen(false);
                              }}
                            >
                              <span className="font-bold">{c.name}</span>
                              <span className="text-xs text-white/50">
                                {c.phone}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {!showInlineAddCustomer && customer
                    ? (() => {
                        const prevAppointments = orders.filter(
                          (o) => o.customerId === customer.id,
                        );
                        const prevSales = salesOrders.filter(
                          (o) =>
                            o.customerId === customer.id &&
                            o.type === "tax_invoice",
                        );
                        return (
                          <div className="bg-black/20 p-3 rounded-lg border border-white/5 space-y-2 mt-3 animation-fade-in">
                            <p className="text-xs text-blue-400 font-bold">
                              نشاط العميل السابق:
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="bg-white/5 p-2 rounded">
                                <span className="text-white/50 block">
                                  مواعيد سابقة
                                </span>
                                <span className="font-bold text-orange-400">
                                  {prevAppointments.length} مواعيد
                                </span>
                              </div>
                              <div className="bg-white/5 p-2 rounded">
                                <span className="text-white/50 block">
                                  فواتير مبيعات
                                </span>
                                <span className="font-bold text-green-400">
                                  {prevSales.length} فواتير
                                </span>
                              </div>
                            </div>
                            {prevAppointments.length > 0 && (
                              <div className="bg-white/5 p-2 rounded">
                                <span className="text-white/50 block mb-1">
                                  اهتمامات / طلبات سابقة
                                </span>
                                <div className="flex flex-wrap gap-1">
                                  {Array.from(
                                    new Set(
                                      prevAppointments.map((o) => o.issue),
                                    ),
                                  )
                                    .slice(0, 3)
                                    .map((issue) => (
                                      <Badge
                                        key={issue}
                                        variant="outline"
                                        className="text-[10px] bg-black/20 border-white/10 text-white/70"
                                      >
                                        {issue}
                                      </Badge>
                                    ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    : null}
                </div>
              ) : (
                <div className="space-y-4 bg-white/5 p-4 rounded-lg border border-white/10">
                  <div className="flex justify-between items-center">
                    <Label className="text-blue-400 font-bold">
                      إضافة عميل جديد
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-red-400"
                      onClick={() => setShowInlineAddCustomer(false)}
                    >
                      إلغاء الإضافة
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>الاسم</Label>
                      <Input
                        value={newCustName}
                        onChange={(e) => setNewCustName(e.target.value)}
                        className="bg-black/20 border-white/10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>الجوال</Label>
                      <Input
                        value={newCustPhone}
                        onChange={(e) => setNewCustPhone(e.target.value)}
                        className="bg-black/20 border-white/10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>المدينة</Label>
                      <Input
                        value={newCustCity}
                        onChange={(e) => setNewCustCity(e.target.value)}
                        className="bg-black/20 border-white/10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>الحي</Label>
                      <Input
                        value={newCustDistrict}
                        onChange={(e) => setNewCustDistrict(e.target.value)}
                        className="bg-black/20 border-white/10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>رابط الموقع (خرائط جوجل)</Label>
                      <Input
                        value={newCustMapLink}
                        onChange={(e) => setNewCustMapLink(e.target.value)}
                        className="bg-black/20 border-white/10"
                      />
                    </div>
                  </div>
                </div>
              )}

              {!showInlineAddCustomer &&
                customer &&
                customer.locations &&
                customer.locations.length > 0 && (
                  <div className="space-y-2">
                    <Label>الموقع / العنوان</Label>
                    <Select
                      value={selectedLocId}
                      onValueChange={setSelectedLocId}
                    >
                      <SelectTrigger className="bg-white/5 border-white/10">
                        <SelectValue placeholder="اختر الموقع..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(customer.locations || []).map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.type}: {l.address}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>وصف المشكلة / الطلب</Label>
                  <Input
                    list="appointments-interests-ds"
                    value={issue}
                    onChange={(e) => setIssue(e.target.value)}
                    placeholder="مثلاً: صيانة تكييف، فحص تمديدات..."
                    className="bg-white/5 border-white/10"
                  />
                  <datalist id="appointments-interests-ds">
                    {settings.savedInterests?.map((interest) => (
                      <option key={interest} value={interest} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <Label>تخصيص فني (اختياري)</Label>
                  <Select
                    value={technicianName}
                    onValueChange={setTechnicianName}
                  >
                    <SelectTrigger className="bg-white/5 border-white/10">
                      <SelectValue placeholder="اختر الفني..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(settings.technicians || []).map((t: any) => {
                        const name = typeof t === "string" ? t : t.name;
                        return (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        );
                      })}
                      {(!settings.technicians ||
                        settings.technicians.length === 0) && (
                        <SelectItem value="none" disabled>
                          قم بإضافة فنيين من الإعدادات
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 flex flex-col justify-end">
                  <Label>تاريخ الصيانة الدورية (يوم وساعة الزيارة)</Label>
                  <Input
                    type="date"
                    value={date.includes("T") ? date.split("T")[0] : date}
                    onChange={(e) =>
                      setDate(
                        e.target.value +
                          "T" +
                          (date.includes("T") ? date.split("T")[1] : "12:00"),
                      )
                    }
                    className="bg-white/5 border-white/10"
                  />
                  <Input
                    type="time"
                    value={(date.includes("T")
                      ? date.split("T")[1]
                      : "12:00"
                    ).substring(0, 5)}
                    onChange={(e) =>
                      setDate(
                        (date.includes("T") ? date.split("T")[0] : date) +
                          "T" +
                          e.target.value,
                      )
                    }
                    className="bg-white/5 border-white/10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-orange-400">
                    تاريخ الموعد (مجدول الأشهر القادمة)
                  </Label>
                  <Select
                    onValueChange={(v) => {
                      if (v === "0") {
                        setNextMaintenanceDate("");
                      } else {
                        const d = new Date(date);
                        d.setMonth(d.getMonth() + parseInt(v));
                        setNextMaintenanceDate(format(d, "yyyy-MM-dd"));
                      }
                    }}
                  >
                    <SelectTrigger className="bg-white/5 border-white/10">
                      <SelectValue placeholder="اختر من قوائم الأشهر..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">بدون تذكير</SelectItem>
                      <SelectItem value="1">شهر واحد</SelectItem>
                      <SelectItem value="2">شهرين</SelectItem>
                      <SelectItem value="3">ثلاثة أشهر</SelectItem>
                      <SelectItem value="4">أربعة أشهر</SelectItem>
                      <SelectItem value="5">خمسة أشهر</SelectItem>
                      <SelectItem value="6">ستة أشهر</SelectItem>
                      <SelectItem value="7">سبعة أشهر</SelectItem>
                      <SelectItem value="8">ثمانية أشهر</SelectItem>
                      <SelectItem value="9">تسعة أشهر</SelectItem>
                      <SelectItem value="10">عشرة أشهر</SelectItem>
                      <SelectItem value="11">أحد عشر شهر</SelectItem>
                      <SelectItem value="12">سنة كاملة</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    value={nextMaintenanceDate}
                    onChange={(e) => setNextMaintenanceDate(e.target.value)}
                    className="bg-white/5 border-white/10"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddDialog(false);
                  setEditingOrderData(null);
                }}
              >
                إلغاء
              </Button>
              <Button
                onClick={handleSave}
                className="bg-orange-600 hover:bg-orange-500"
              >
                حفظ الموعد
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 min-h-0 overflow-auto bg-white/5 rounded-xl border border-white/5 mt-4">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-white/10">
              <TableHead className="text-right">تاريخ الطلب</TableHead>
              <TableHead className="text-right">العميل</TableHead>
              <TableHead className="text-right">المشكلة</TableHead>
              <TableHead className="text-right">الفني</TableHead>
              <TableHead className="text-right">الصيانة القادمة</TableHead>
              <TableHead className="text-right">نوع الحالة</TableHead>
              <TableHead className="text-right">مبلغ الطلب</TableHead>
              <TableHead className="text-left">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((order, idx) => {
              let countdownText = "غير محدد";
              let rowClass = "border-white/5 hover:bg-white/[0.02]";
              let statusBadgeClass =
                order.status === "completed"
                  ? "bg-primary/20 text-primary border-primary/50"
                  : "bg-blue-600/20 text-blue-400 border-blue-500/50";
              let countdownColor = "text-white/50";

              let diff: number | undefined = undefined;
              let dateDetails = "";
              if (order.nextMaintenanceDate || order.date) {
                const maintainDate = new Date(order.nextMaintenanceDate || order.date);
                diff = differenceInDays(maintainDate, new Date());
                const diffHours = (maintainDate.getTime() - new Date().getTime()) / (1000 * 60 * 60);
                const dayName = new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(maintainDate);
                const dateStr = format(maintainDate, "yyyy/MM/dd");
                dateDetails = `(${dayName} ${dateStr})`;
                
                if (diffHours >= 0 && diffHours <= 2) {
                  countdownText = `خلال ${Math.floor(diffHours)} ساعة ${dateDetails}`;
                  countdownColor = "text-yellow-400 font-bold animate-pulse";
                  rowClass = "bg-yellow-600/30 hover:bg-yellow-600/40 border-yellow-500/50";
                  statusBadgeClass = "bg-yellow-600/50 text-yellow-100 border-yellow-500/50";
                } else if (diff < 0) {
                  countdownText = `تجاوز الموعد بـ ${Math.abs(diff)} يوم ${dateDetails}`;
                  countdownColor = "text-red-400 font-bold";
                  rowClass =
                    "bg-red-900/40 hover:bg-red-900/50 border-red-500/50";
                  statusBadgeClass =
                    "bg-red-900/50 text-red-100 border-red-500/50";
                } else if (diff === 0) {
                  countdownText = `اليوم ${dateDetails}`;
                  countdownColor = "text-amber-400 font-bold";
                  rowClass =
                    "bg-amber-900/40 hover:bg-amber-900/50 border-amber-500/50";
                  statusBadgeClass =
                    "bg-amber-900/50 text-amber-100 border-amber-500/50";
                } else if (diff <= 7) {
                  countdownText = `متبقي ${diff} يوم ${dateDetails}`;
                  countdownColor = "text-amber-300 font-bold";
                  rowClass =
                    "bg-amber-800/30 hover:bg-amber-800/40 border-amber-500/30";
                  statusBadgeClass =
                    "bg-amber-800/50 text-amber-200 border-amber-500/50";
                } else if (diff <= 14) {
                  countdownText = `متبقي ${diff} يوم ${dateDetails}`;
                  countdownColor = "text-yellow-400 font-bold";
                  rowClass =
                    "bg-yellow-900/30 hover:bg-yellow-900/40 border-yellow-500/30";
                  statusBadgeClass =
                    "bg-yellow-900/50 text-yellow-200 border-yellow-500/50";
                } else if (diff <= 30) {
                  countdownText = `متبقي ${diff} يوم ${dateDetails}`;
                  countdownColor = "text-orange-400 font-bold";
                  rowClass =
                    "bg-orange-900/20 hover:bg-orange-900/30 border-orange-500/20";
                  statusBadgeClass =
                    "bg-orange-900/50 text-orange-200 border-orange-500/50";
                } else {
                  countdownText = `متبقي ${diff} يوم ${dateDetails}`;
                  countdownColor = "text-green-400 font-bold";
                  rowClass = "border-white/5 hover:bg-white/[0.02]";
                }
              }

              return (
                <TableRow key={`${order.id}-${idx}`} className={rowClass}>
                  <TableCell className="text-white/80">
                    {format(order.date, "yyyy/MM/dd hh:mm a", { locale: arSA })}
                  </TableCell>
                  <TableCell className="font-medium text-blue-400">
                    {order.customerName}
                  </TableCell>
                  <TableCell
                    className="max-w-[200px]"
                    title={order.productInterest || order.issue}
                  >
                    <span className="block truncate">
                      {order.issue}
                    </span>
                    {order.selectedProducts && order.selectedProducts.length > 0 && (
                      <span
                        className="block text-blue-300/80 text-[10px] font-semibold mt-1 truncate"
                        title={order.selectedProducts.map(p => p.name).join(", ")}
                      >
                        المنتجات: {order.selectedProducts.map(p => p.name).join(", ")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-white/70">
                    {order.technicianName || "—"}
                  </TableCell>
                  <TableCell className={countdownColor}>
                    <div className="flex items-center gap-1">
                      {diff !== undefined && diff < 0 && (
                        <AlertTriangle className="h-4 w-4 animate-pulse inline" />
                      )}
                      {diff !== undefined && diff >= 0 && diff <= 30 && (
                        <Bell className="h-4 w-4 inline" />
                      )}
                      {countdownText}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusBadgeClass}>
                      {order.status === "completed"
                        ? "تم التنفيذ"
                        : order.status === "pending"
                          ? "بانتظار الفني"
                          : "ملغي"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-bold text-green-400">
                    {order.expectedPaymentMethod === "credit" ? "آجل" : order.expectedPaymentMethod === "not_agreed" ? "لم يتفق" : `${order.expectedAmount || 0} ر.س`}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2 justify-end">
                      {onPrintOrder && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-white/70 hover:bg-white/10 hover:text-white mr-auto"
                          onClick={() => onPrintOrder(order)}
                          title="طباعة"
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:bg-red-600/20"
                        onClick={() => {
                          setTargetDeleteId(order.id);
                          setShowDeleteDialog(true);
                        }}
                        title="حذف"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 border-emerald-600/30 text-emerald-400 hover:bg-emerald-600/20"
                        onClick={() => setActiveShareOrder(order)}
                        title="خيارات المراسلة (واتساب / تعيين الفني)"
                      >
                        <Share2 className="ml-1 h-3 w-3" /> مراسلة
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-indigo-400 hover:bg-indigo-600/20"
                        onClick={() => setInfoOrder(order)}
                        title="تفاصيل الطلب"
                      >
                        <HelpCircle className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-blue-400 hover:bg-blue-600/20"
                        onClick={() => {
                          setExtendingOrder(order);
                          setExtendingDays(0);
                          const initialDate = order.nextMaintenanceDate
                            ? new Date(order.nextMaintenanceDate)
                            : new Date(order.date);
                          setExtendingDateStr(
                            format(initialDate, "yyyy-MM-dd'T'HH:mm"),
                          );
                        }}
                        title="تمديد الموعد"
                      >
                        <Calendar className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-yellow-400 hover:bg-yellow-600/20"
                        onClick={() => {
                          setEditingOrderData(order);
                          setSelectedCustId(order.customerId);
                          setSelectedLocId(order.locationId || "");
                          setIssue(order.issue);
                          setDate(
                            format(new Date(order.date), "yyyy-MM-dd'T'HH:mm"),
                          );
                          setNextMaintenanceDate(
                            order.nextMaintenanceDate
                              ? format(
                                  new Date(order.nextMaintenanceDate),
                                  "yyyy-MM-dd",
                                )
                              : "",
                          );
                          setTechnicianName(order.technicianName || "");
                          setShowAddDialog(true);
                        }}
                        title="تعديل الطلب"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {order.status === "pending" && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-green-400 hover:bg-green-600/20"
                            onClick={() => {
                              setCompletingOrder(order);
                              setReminderMonths(0);
                              setCompletingNextDate("");
                            }}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* WhatsApp Templates Dialog */}
      <Dialog
        open={!!activeWhatsappOrder}
        onOpenChange={(open) => !open && setActiveWhatsappOrder(null)}
      >
        <DialogContent className="glass border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>
              إرسال رسالة واتساب: {activeWhatsappOrder?.customerName}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-2">
            {!settings.whatsappTemplates ||
            settings.whatsappTemplates.length === 0 ? (
              <div className="text-center text-white/50 py-4">
                <p>لا توجد قوالب رسائل محفوظة.</p>
                <p className="text-sm">يمكنك إنشاؤها من قسم الإعدادات.</p>
              </div>
            ) : (
              settings.whatsappTemplates.map((template) => (
                <Button
                  key={template.id}
                  variant="outline"
                  className="w-full justify-start text-right whitespace-normal h-auto py-3 bg-white/5 hover:bg-white/10 border-white/10"
                  onClick={() => {
                    if (activeWhatsappOrder) {
                      const customerInfo = customers.find(
                        (c) => c.id === activeWhatsappOrder.customerId,
                      );
                      if (customerInfo) {
                        const mDateFormated =
                          activeWhatsappOrder.nextMaintenanceDate
                            ? format(
                                activeWhatsappOrder.nextMaintenanceDate,
                                "EEEE، d MMMM yyyy",
                                { locale: arSA },
                              )
                            : format(
                                activeWhatsappOrder.date,
                                "EEEE، d MMMM yyyy",
                                { locale: arSA },
                              );

                        let msg = template.content.replace(
                          /\[الاسم\]/g,
                          activeWhatsappOrder.customerName,
                        );
                        msg = msg.replace(/\[تاريخ_الموعد\]/g, mDateFormated);

                        const phoneStr = customerInfo.phone
                          .replace(/^0/, "966")
                          .replace(/\D/g, "");
                        const url = `whatsapp://send?phone=${phoneStr}&text=${encodeURIComponent(msg)}`;
                        window.location.href = url;
                        setActiveWhatsappOrder(null);
                      }
                    }
                  }}
                >
                  <div className="flex flex-col text-right w-full">
                    <span className="font-bold text-green-400 mb-1">
                      {template.name}
                    </span>
                    <span className="text-xs text-white/70 line-clamp-2">
                      {activeWhatsappOrder
                        ? template.content
                            .replace(
                              /\[الاسم\]/g,
                              activeWhatsappOrder.customerName,
                            )
                            .replace(
                              /\[تاريخ_الموعد\]/g,
                              activeWhatsappOrder.nextMaintenanceDate
                                ? format(
                                    activeWhatsappOrder.nextMaintenanceDate,
                                    "EEEE، d MMMM yyyy",
                                    { locale: arSA },
                                  )
                                : "",
                            )
                        : template.content}
                    </span>
                  </div>
                </Button>
              ))
            )}

            <div className="pt-4 mt-4 border-t border-white/10">
              <Label>رسالة حرة</Label>
              <Button
                variant="outline"
                className="w-full justify-center bg-white/5 hover:bg-white/10 border-white/10 mt-2"
                onClick={() => {
                  if (activeWhatsappOrder) {
                    const customerInfo = customers.find(
                      (c) => c.id === activeWhatsappOrder.customerId,
                    );
                    if (customerInfo) {
                      const phoneStr = customerInfo.phone
                        .replace(/^0/, "966")
                        .replace(/\D/g, "");
                      const url = `whatsapp://send?phone=${phoneStr}`;
                      window.location.href = url;
                      setActiveWhatsappOrder(null);
                    }
                  }
                }}
              >
                فتح المحادثة بدون قالب
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* SHARE/MESSAGE DIALOG */}
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
                 // Open the whatsapp templates dialog specific to this order!
                 // In Appointments.tsx, doing this triggers the existing WhatsApp dialog
                 setActiveWhatsappOrder(order);
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

                const defaultTechTemplate = `مرحباً ${order.technicianName}\nتذكير بمهمة موعد رقم ({رقم الطلب})\nاسم العميل: {اسم العميل}\nجوال العميل: {جوال العميل}\nالموقع: {موقع العميل}\nالخريطة: {الموقع الجغرافي}\nالتوقيت: {موعد الزياره}\nالخدمة: {الخدمه}\nملاحظات: {ملاحضه}`;
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

      {/* INFO DIALOG */}
      <Dialog
        open={!!infoOrder}
        onOpenChange={(open) => !open && setInfoOrder(null)}
      >
        <DialogContent className="glass border-white/10 text-white sm:max-w-md bg-[#14181f]/95 shadow-2xl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-indigo-400" />
              تفاصيل الموعد: {infoOrder?.id || ""}
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
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/10 col-span-2">
                <span className="block text-white/50 text-xs mb-1">نوع الموعد/المشكلة:</span>
                <span className="font-semibold whitespace-pre-wrap">{infoOrder?.issue}</span>
              </div>
              {infoOrder?.additionalNotes && (
                <div className="bg-white/5 p-3 rounded-lg border border-white/10 col-span-2">
                  <span className="block text-white/50 text-xs mb-1">ملاحظات إضافية:</span>
                  <span className="font-semibold whitespace-pre-wrap">{infoOrder?.additionalNotes}</span>
                </div>
              )}
              <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                <span className="block text-white/50 text-xs mb-1">تاريخ الموعد:</span>
                <span className="font-semibold" dir="ltr">
                  {infoOrder ? format(new Date(infoOrder.nextMaintenanceDate || infoOrder.date), "yyyy/MM/dd hh:mm a", { locale: arSA }) : ""}
                </span>
              </div>
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

      {/* Extend Order Dialog */}
      <Dialog
        open={!!extendingOrder}
        onOpenChange={(open) => !open && setExtendingOrder(null)}
      >
        <DialogContent className="glass border-white/10 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تمديد الموعد</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="mb-4 text-sm text-white/70">
              انقر لإضافة مدة إلى الموعد (يمكنك النقر أكثر من مرة):
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { type: "hour", val: 1, label: "+ ساعة" },
                { type: "hour", val: 2, label: "+ ساعتين" },
                { type: "hour", val: 3, label: "+ 3 ساعات" },
                { type: "hour", val: 6, label: "+ 6 ساعات" },
                { type: "day", val: 1, label: "+ يوم" },
                { type: "day", val: 2, label: "+ يومين" },
                { type: "day", val: 3, label: "+ 3 أيام" },
                { type: "day", val: 7, label: "+ أسبوع" },
              ].map((opt, i) => (
                <Button
                  key={i}
                  variant="outline"
                  onClick={() => {
                    const current = new Date();
                    if (opt.type === "hour") {
                      current.setHours(current.getHours() + opt.val);
                    } else if (opt.type === "month") {
                      current.setMonth(current.getMonth() + opt.val);
                    } else {
                      current.setDate(current.getDate() + opt.val);
                    }
                    setExtendingDateStr(format(current, "yyyy-MM-dd'T'HH:mm"));
                  }}
                  className="h-auto py-2 bg-black/20 text-white/70 border-white/10 hover:bg-white/10 hover:text-white"
                >
                  {opt.label}
                </Button>
              ))}
            </div>

            <div className="mt-4">
              <Label className="text-xs text-white/50 mb-1 block">
                تاريخ الموعد بعد التمديد:
              </Label>
              <Input
                type="datetime-local"
                value={extendingDateStr}
                onChange={(e) => setExtendingDateStr(e.target.value)}
                className="bg-white/5 border-white/10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-white/10"
              onClick={() => setExtendingOrder(null)}
            >
              إلغاء
            </Button>
            <Button
              onClick={() => {
                if (extendingOrder) {
                  const updatedOrder = { ...extendingOrder };
                  if (extendingDateStr) {
                    updatedOrder.nextMaintenanceDate = new Date(
                      extendingDateStr,
                    ).getTime();
                  }
                  onSave(updatedOrder);
                  setExtendingOrder(null);
                  toast.success("تم تمديد الموعد بنجاح");
                }
              }}
              className="bg-blue-600 hover:bg-blue-500"
            >
              حفظ التعديل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Order Dialog */}
      <Dialog
        open={!!completingOrder}
        onOpenChange={(open) => !open && setCompletingOrder(null)}
      >
        <DialogContent className="glass border-white/10 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تأكيد التنفيذ وجدول الصيانة القادمة</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-white/70">
              سيتم تغيير حالة الطلب إلى "تم التنفيذ". متى ترغب بالتذكير للصيانة
              القادمة؟
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { val: 0, label: "بدون تذكير" },
                { val: 1, label: "شهر واحد" },
                { val: 2, label: "شهرين" },
                { val: 3, label: "ثلاثة أشهر" },
                { val: 4, label: "أربعة أشهر" },
                { val: 5, label: "خمسة أشهر" },
                { val: 6, label: "ستة أشهر" },
                { val: 7, label: "سبعة أشهر" },
                { val: 8, label: "ثمانية أشهر" },
                { val: 9, label: "تسعة أشهر" },
                { val: 10, label: "عشرة أشهر" },
                { val: 11, label: "١١ شهر" },
                { val: 12, label: "سنة كاملة" },
              ].map((opt) => (
                <Button
                  key={opt.val}
                  variant={reminderMonths === opt.val ? "default" : "outline"}
                  onClick={() => {
                    setReminderMonths(opt.val);
                    if (opt.val === 0) {
                      setCompletingNextDate("");
                    } else {
                      const nextDate = new Date();
                      nextDate.setMonth(nextDate.getMonth() + opt.val);
                      setCompletingNextDate(format(nextDate, "yyyy-MM-dd"));
                    }
                  }}
                  className={`h-auto py-2 ${reminderMonths === opt.val ? "bg-blue-600 border-blue-600" : "bg-black/20 text-white/70 border-white/10 hover:bg-white/10"}`}
                >
                  {opt.label}
                </Button>
              ))}
            </div>

            <div className="mt-4">
              <Label className="text-xs text-white/50 mb-1 block">
                أو أدخل التاريخ يدوياً:
              </Label>
              <Input
                type="date"
                value={completingNextDate}
                onChange={(e) => {
                  setCompletingNextDate(e.target.value);
                  setReminderMonths(-1);
                }}
                className="bg-white/5 border-white/10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-white/10"
              onClick={() => setCompletingOrder(null)}
            >
              إلغاء
            </Button>
            <Button
              onClick={() => {
                if (completingOrder) {
                  const updatedOrder = {
                    ...completingOrder,
                    status: "completed" as const,
                  };

                  if (completingNextDate) {
                    updatedOrder.nextMaintenanceDate = new Date(
                      completingNextDate,
                    ).getTime();
                  } else {
                    updatedOrder.nextMaintenanceDate = undefined;
                  }

                  onSave(updatedOrder);
                  toast.success("تم إنجاز الموعد بنجاح.");
                  if (onNavigateToPOS) {
                    onNavigateToPOS(updatedOrder);
                  }
                  setCompletingOrder(null);
                }
              }}
              className="bg-green-600 hover:bg-green-500"
            >
              تأكيد وحفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send to Technician Dialog */}
      <Dialog
        open={!!activeTechOrder}
        onOpenChange={(open) => !open && setActiveTechOrder(null)}
      >
        <DialogContent className="glass border-white/10 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إرسال طلب الصيانة للفني</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-2 max-h-[60vh] overflow-y-auto">
            {!settings.technicians || settings.technicians.length === 0 ? (
              <div className="text-center text-white/50 py-4">
                <p>لا يوجد فنيين مسجلين.</p>
                <p className="text-sm">يمكنك إضافة الفنيين من الإعدادات.</p>
              </div>
            ) : (
              settings.technicians.map((tech: any) => {
                const tName = typeof tech === "string" ? tech : tech.name;
                const tPhone = typeof tech === "string" ? "" : tech.phone;

                return (
                  <Button
                    key={tName}
                    variant="outline"
                    className="w-full justify-between items-center h-auto py-3 bg-white/5 hover:bg-white/10 border-white/10"
                    onClick={async () => {
                      if (activeTechOrder) {
                        const customerInfo = customers.find(
                          (c) => c.id === activeTechOrder.customerId,
                        );
                        let locStr = "";
                        if (customerInfo && activeTechOrder.locationId) {
                          const loc = customerInfo.locations.find(
                            (l) => l.id === activeTechOrder.locationId,
                          );
                          if (loc) {
                            locStr = `\nموقع العميل: ${loc.address} ${loc.city || ""}`;
                            if (loc.mapLink) locStr += ` - ${loc.mapLink}`;
                          }
                        }

                        const phoneStr = (tPhone || "")
                          .replace(/^0/, "966")
                          .replace(/\D/g, "");
                        if (!phoneStr) {
                          alert("لم يتم تسجيل رقم جوال لهذا الفني.");
                          return;
                        }

                        const defaultTechTemplate = `مرحباً ${tName}\nتذكير بمهمة موعد رقم ({رقم الطلب})\nاسم العميل: {اسم العميل}\nجوال العميل: {جوال العميل}\nالموقع: {موقع العميل}\nالخريطة: {الموقع الجغرافي}\nالتوقيت: {موعد الزياره}\nالخدمة: {الخدمه}\nملاحظات: {ملاحضه}`;
                        const template = settings.whatsappTemplateTechnician || defaultTechTemplate;
                        const techText = generateWhatsAppMessage(template, activeTechOrder, customerInfo);
                        
                        const url = `whatsapp://send?phone=${phoneStr}&text=${encodeURIComponent(techText)}`;
                        window.location.href = url;

                        // Save technician assignment
                        onSave({ ...activeTechOrder, technicianName: tName });
                        setActiveTechOrder(null);
                      }
                    }}
                  >
                    <div className="flex flex-col items-start gap-1">
                      <span className="font-bold text-orange-400">{tName}</span>
                      <span className="text-xs text-white/50">
                        {tPhone || "بدون رقم"}
                      </span>
                    </div>
                    <MessageCircle className="h-5 w-5 text-gray-400" />
                  </Button>
                );
              })
            )}
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
        description="يرجى إدخال كلمة مرور الحماية لتأكيد حذف هذا الموعد."
      />
    </div>
  );
}
