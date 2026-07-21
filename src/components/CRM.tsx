/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import * as xlsx from "xlsx";
import {
  Customer,
  CustomerType,
  Location as CustLocation,
  AppSettings,
  Order,
} from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  UserPlus,
  Phone,
  MapPin,
  Search,
  ArrowRightCircle,
  MessageCircle,
  Navigation,
  Edit,
  Info,
  Bell,
  Printer,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PasswordDialog } from "./PasswordDialog";

const REMINDER_INTERVALS = [
  1 * 24 * 60 * 60 * 1000,
  2 * 24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  14 * 24 * 60 * 60 * 1000,
  21 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
];

function isCustomerReminderDue(customer: Customer): boolean {
  if (customer.type !== "lead") return false;
  if (customer.nextReminderDate) {
    return Date.now() >= customer.nextReminderDate;
  }
  const elapsed = Date.now() - customer.createdAt;
  let dueLevel = -1;
  for (let i = REMINDER_INTERVALS.length - 1; i >= 0; i--) {
    if (elapsed >= REMINDER_INTERVALS[i]) {
      dueLevel = i;
      break;
    }
  }
  return dueLevel > (customer.reminderLevel ?? -1) && dueLevel >= 0;
}

interface CRMProps {
  customers: Customer[];
  settings: AppSettings;
  orders?: Order[];
  techOrders?: any[];
  onSave: (customer: Customer) => void;
  onDelete: (id: string) => void;
  onConvert: (id: string) => void;
  onPrintOrder?: (order: Order) => void;
  onUpdateOrder?: (order: Order) => void;
  onPrintStatement?: (customer: Customer, orders: Order[]) => void;
  setSettings?: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export default function CRM({
  customers,
  settings,
  orders = [],
  techOrders = [],
  onSave,
  onDelete,
  onConvert,
  onPrintOrder,
  onUpdateOrder,
  onPrintStatement,
  setSettings,
}: CRMProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [activeWhatsappCustomer, setActiveWhatsappCustomer] =
    useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(
    null,
  );
  const [selectedCustomerReport, setSelectedCustomerReport] =
    useState<Customer | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [paymentInput, setPaymentInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mainFilter, setMainFilter] = useState<
    "all" | "customer" | "lead" | "city"
  >("all");
  const [selectedCity, setSelectedCity] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportTemplate = () => {
    const ws = xlsx.utils.json_to_sheet([
      {
        الاسم: "محمد عبدالله",
        الجوال: "0550000000",
        النوع: "محتمل", // "محتمل" أو "عميل"
        الاهتمامات: "فلتر مياه",
        المدينة: "الرياض",
        العنوان: "حي الملز",
        اسم_الشركة: "",
        الرقم_الضريبي: "",
      },
    ]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "العملاء");
    xlsx.writeFile(wb, "قالب_استيراد_العملاء.xlsx");
  };

  const handleExportCustomers = () => {
    try {
      const exportData = customers.map((c) => ({
        "الاسم": c.name,
        "الجوال": c.phone,
        "النوع": c.type === "customer" ? "عميل" : "محتمل",
        "الاهتمامات": c.interests?.join("، ") || "",
        "المدينة": c.locations && c.locations.length > 0 ? c.locations[0].city : "",
        "العنوان": c.address || "",
        "اسم الشركة": c.companyName || "",
        "الرقم الضريبي": c.taxNumber || "",
        "تاريخ الإضافة": new Date(c.createdAt || Date.now()).toLocaleDateString("ar-SA")
      }));
      const ws = xlsx.utils.json_to_sheet(exportData);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "العملاء");
      xlsx.writeFile(wb, `العملاء_${new Date().toISOString().split("T")[0]}.xlsx`);
      toast.success("تم التصدير بنجاح");
    } catch (error) {
      toast.error("فشل التصدير");
    }
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = xlsx.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = xlsx.utils.sheet_to_json(ws);

        let count = 0;
        data.forEach((row: any) => {
          if (!row["الاسم"] && !row["الجوال"]) return;

          const typeStr = String(row["النوع"] || "محتمل").trim();
          const type =
            typeStr === "حالي" || typeStr === "عميل" ? "customer" : "lead";
          const interests = row["الاهتمامات"]
            ? String(row["الاهتمامات"])
                .split("،")
                .map((s) => s.trim())
            : [];

          const newCust: Customer = {
            id: Math.random().toString(36).substr(2, 9),
            name: row["الاسم"] ? String(row["الاسم"]) : "بدون اسم",
            phone: row["الجوال"] ? String(row["الجوال"]) : "",
            type,
            interests,
            companyName: row["اسم_الشركة"] || "",
            taxNumber: row["الرقم_الضريبي"] ? String(row["الرقم_الضريبي"]) : "",
            createdAt: Date.now(),
            locations: [
              {
                id: Math.random().toString(36).substr(2, 9),
                city: row["المدينة"] || "الرياض",
                address: row["العنوان"] || "",
                type: "عام",
              },
            ],
          };
          onSave(newCust);
          count++;
        });
        toast.success(`تم استيراد ${count} عميل بنجاح!`);
      } catch (err) {
        toast.error("حدث خطأ أثناء قراءة الملف");
        console.error(err);
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // New Customer Form
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newType, setNewType] = useState<CustomerType>("lead");
  const [newTaxNumber, setNewTaxNumber] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newMainAddress, setNewMainAddress] = useState("");
  const [newInterests, setNewInterests] = useState<string[]>([]);
  const [newLocations, setNewLocations] = useState<CustLocation[]>([
    { id: "1", address: "", district: "", type: "منزل", city: "الرياض" },
  ]);

  const baseInterests =
    settings.savedInterests && settings.savedInterests.length > 0
      ? settings.savedInterests
      : ["تركيب أعداد", "تركيب جهاز تحلية", "تركيب صيانة", "تغيير فلاتر"];

  const PREDEFINED_INTERESTS = Array.from(
    new Set([...baseInterests, ...newInterests]),
  );

  const filtered = customers.filter((c) => {
    const s = searchTerm.toLowerCase();
    return (
      c.name.toLowerCase().includes(s) ||
      c.phone.includes(searchTerm) ||
      (c.companyName && c.companyName.toLowerCase().includes(s))
    );
  });

  const uniqueCities = Array.from(
    new Set(
      customers
        .flatMap((c) => (c.locations || []).map((l) => l.city?.trim()))
        .filter((city): city is string => !!city),
    ),
  );

  const finalFiltered = filtered
    .filter((c) => {
      if (mainFilter === "customer" && c.type !== "customer") return false;
      if (mainFilter === "lead" && c.type !== "lead") return false;
      if (mainFilter === "city") {
        if (!selectedCity) return true;
        return c.locations.some((l) => l.city?.trim() === selectedCity);
      }
      return true;
    })
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: finalFiltered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140,
    overscan: 5,
  });

  const handleAddLocation = () => {
    setNewLocations([
      ...newLocations,
      {
        id: Math.random().toString(),
        address: "",
        district: "",
        type: "عمل",
        city: "الرياض",
      },
    ]);
  };

  const handleEdit = (customer: Customer) => {
    setEditingId(customer.id);
    setNewName(customer.name);
    setNewPhone(customer.phone);
    setNewType(customer.type);
    setNewTaxNumber(customer.taxNumber || "");
    setNewCompanyName(customer.companyName || "");
    setNewMainAddress(customer.address || "");
    setNewInterests(customer.interests || []);
    setNewLocations(
      customer.locations.length
        ? [...customer.locations]
        : [{ id: "1", address: "", type: "منزل", city: "الرياض" }],
    );
    setShowAddDialog(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setNewName("");
    setNewPhone("");
    setNewType("lead");
    setNewTaxNumber("");
    setNewCompanyName("");
    setNewMainAddress("");
    setNewInterests([]);
    setNewLocations([{ id: "1", address: "", type: "منزل", city: "الرياض" }]);
  };

  useEffect(() => {
    if (!editingId && newPhone.length >= 8) {
      const existing = customers.find((c) => c.phone === newPhone);
      if (existing) {
        toast.info("تم العثور على العميل، تم جلب بياناته تلقائياً.");
        setEditingId(existing.id);
        setNewName(existing.name);
        setNewType(existing.type);
        setNewTaxNumber(existing.taxNumber || "");
        setNewCompanyName(existing.companyName || "");
        setNewMainAddress(existing.address || "");
        setNewInterests(existing.interests || []);
        setNewLocations(
          existing.locations.length
            ? [...existing.locations]
            : [{ id: "1", address: "", district: "", type: "منزل", city: "الرياض" }],
        );
      }
    }
  }, [newPhone, editingId, customers]);

  const handleSave = () => {
    if (!newPhone) return;

    // Validate that at least one location has both city and address if customer
    if (newType === "customer") {
      const validLocations = newLocations.filter(
        (l) =>
          l.city &&
          l.city.trim() !== "" &&
          l.district &&
          l.district.trim() !== "",
      );
      if (validLocations.length === 0) {
        toast.error("يرجى تعبئة المدينة والحي للموقع على الأقل");
        return;
      }
    }

    const safeName = newName || "عميل بدون اسم";
    const customer: Customer = {
      id: editingId || newPhone,
      name: safeName,
      phone: newPhone,
      type: newType,
      taxNumber: newTaxNumber,
      companyName: newCompanyName,
      address: newMainAddress,
      interests: newInterests,
      locations: newLocations.filter((l) => l.address || l.district || l.mapLink || l.city),
      createdAt: editingId
        ? customers.find((c) => c.id === editingId)?.createdAt || Date.now()
        : Date.now(),
    };
    onSave(customer);
    resetForm();
    setShowAddDialog(false);
  };

  const handleToggleInterest = (interest: string) => {
    if (newInterests.includes(interest)) {
      setNewInterests(newInterests.filter((i) => i !== interest));
    } else {
      setNewInterests([...newInterests, interest]);
    }
  };

  return (
    <div className="space-y-4 h-full min-h-0 flex flex-col">
      {/* 4 Equal-sized filter options */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
        <button
          onClick={() => {
            setMainFilter("all");
            setSelectedCity("");
          }}
          className={`h-12 flex items-center justify-center rounded-xl text-sm font-bold transition-all border ${
            mainFilter === "all"
              ? "bg-white text-black border-white shadow-lg"
              : "bg-black/30 text-white/70 border-white/5 hover:bg-black/50 hover:text-white"
          }`}
        >
          الكل ({customers.length})
        </button>

        <button
          onClick={() => {
            setMainFilter("customer");
            setSelectedCity("");
          }}
          className={`h-12 flex items-center justify-center rounded-xl text-sm font-bold transition-all border ${
            mainFilter === "customer"
              ? "bg-white text-black border-white shadow-lg"
              : "bg-black/30 text-white/70 border-white/5 hover:bg-black/50 hover:text-white"
          }`}
        >
          العملاء الفعليون (
          {customers.filter((c) => c.type === "customer").length})
        </button>

        <button
          onClick={() => {
            setMainFilter("lead");
            setSelectedCity("");
          }}
          className={`h-12 flex items-center justify-center rounded-xl text-sm font-bold transition-all border ${
            mainFilter === "lead"
              ? "bg-white text-black border-white shadow-lg"
              : "bg-black/30 text-white/70 border-white/5 hover:bg-black/50 hover:text-white"
          }`}
        >
          العملاء المحتملون ({customers.filter((c) => c.type === "lead").length}
          )
        </button>

        <button
          onClick={() => {
            setMainFilter("city");
            if (uniqueCities.length > 0 && !selectedCity) {
              setSelectedCity(uniqueCities[0]);
            }
          }}
          className={`h-12 flex items-center justify-center rounded-xl text-sm font-bold transition-all border ${
            mainFilter === "city"
              ? "bg-white text-black border-white shadow-lg"
              : "bg-black/30 text-white/70 border-white/5 hover:bg-black/50 hover:text-white"
          }`}
        >
          المدينة ({uniqueCities.length})
        </button>
      </div>

      {/* Sub-filtering by cities if city is active */}
      {mainFilter === "city" && uniqueCities.length > 0 && (
        <div className="flex flex-wrap gap-2 w-full p-3 bg-white/5 rounded-xl border border-white/5 transition-all">
          {uniqueCities.map((city) => {
            const cityCustCount = customers.filter((c) =>
              c.locations.some((l) => l.city?.trim() === city),
            ).length;
            return (
              <button
                key={city}
                onClick={() => setSelectedCity(city)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                  selectedCity === city
                    ? "bg-white text-black border-white shadow-sm"
                    : "bg-black/20 text-white/60 border-white/5 hover:bg-black/40 hover:text-white"
                }`}
              >
                {city} ({cityCustCount})
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-col sm:flex-row flex-wrap justify-between items-stretch sm:items-center gap-2 bg-white/5 p-2 rounded-xl border border-white/5 min-h-[50px]">
        <div className="flex items-center gap-2 sm:gap-4 flex-1 w-full sm:max-w-xl">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-white/40" />
            <Input
              placeholder="ابحث بالاسم أو الرقم..."
              className="pr-10 bg-black/20 border-white/10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept=".xlsx, .xls"
            className="hidden"
            ref={fileInputRef}
            onChange={handleImportExcel}
          />
          <Button
            variant="outline"
            className="bg-green-600/20 border-green-500/30 text-green-400 hover:bg-green-600/30"
            onClick={() => fileInputRef.current?.click()}
          >
            استيراد من إكسل
          </Button>
          <Button
            variant="outline"
            onClick={handleExportTemplate}
            className="bg-white/5 border-white/10 hover:bg-white/10"
          >
            تحميل نموذج إكسل
          </Button>
          <Button
            variant="outline"
            onClick={handleExportCustomers}
            className="bg-white/5 border-white/10 hover:bg-white/10"
          >
            تصدير العملاء
          </Button>
          <Dialog
            open={showAddDialog}
            onOpenChange={(open) => {
              setShowAddDialog(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button
                className="bg-blue-600 hover:bg-blue-500"
                onClick={resetForm}
              >
                <UserPlus className="ml-2 h-4 w-4" />
                إضافة جديد
              </Button>
            </DialogTrigger>
            <DialogContent className="glass border-white/10 text-white max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingId
                    ? "تعديل بيانات العميل"
                    : "إضافة عميل / محتمل جديد"}
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
                <div className="space-y-2">
                  <Label>الاسم</Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="bg-white/5 border-white/10"
                  />
                </div>
                <div className="space-y-2">
                  <Label>رقم الجوال</Label>
                  <Input
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="bg-white/5 border-white/10"
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>النوع</Label>
                  <div className="flex gap-4">
                    <Button
                      variant={newType === "lead" ? "default" : "outline"}
                      onClick={() => setNewType("lead")}
                      className="flex-1"
                    >
                      محتمل
                    </Button>
                    <Button
                      variant={newType === "customer" ? "default" : "outline"}
                      onClick={() => setNewType("customer")}
                      className="flex-1"
                    >
                      عميل فعلي
                    </Button>
                  </div>
                </div>
                {newType === "customer" && (
                  <div className="col-span-2 space-y-3 mt-2 p-3 bg-white/5 rounded-lg border border-white/10">
                    <Label className="text-white/70">
                      بيانات الفاتورة الضريبية (اختياري)
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                      <div className="space-y-2">
                        <Label>اسم الشركة / المنشأة</Label>
                        <Input
                          value={newCompanyName}
                          onChange={(e) => setNewCompanyName(e.target.value)}
                          className="bg-black/20 border-white/10"
                          placeholder="مثال: شركة التقنية للتجارة"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>الرقم الضريبي</Label>
                        <Input
                          value={newTaxNumber}
                          onChange={(e) => setNewTaxNumber(e.target.value)}
                          className="bg-black/20 border-white/10"
                          placeholder="الرقم المكون من 15 خانة"
                        />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label>العنوان الوطني (للفاتورة)</Label>
                        <Input
                          value={newMainAddress}
                          onChange={(e) => setNewMainAddress(e.target.value)}
                          className="bg-black/20 border-white/10"
                          placeholder="الشارع، الحي، المدينة، الرمز البريدي"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="col-span-2 space-y-3 p-3 bg-white/5 rounded-lg border border-white/10">
                  <Label className="text-white/70">
                    الاهتمامات
                  </Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {PREDEFINED_INTERESTS.map((interest) => (
                      <Badge
                        key={interest}
                        variant={
                          newInterests.includes(interest)
                            ? "default"
                            : "outline"
                        }
                        className={`cursor-pointer ${newInterests.includes(interest) ? "bg-blue-600" : "text-white/50 border-white/10"}`}
                        onClick={() => handleToggleInterest(interest)}
                      >
                        {interest}
                      </Badge>
                    ))}
                    {newInterests
                      .filter((i) => !PREDEFINED_INTERESTS.includes(i))
                      .map((interest) => (
                        <Badge
                          key={interest}
                          onClick={() => handleToggleInterest(interest)}
                          className="cursor-pointer bg-blue-600"
                        >
                          {interest}
                        </Badge>
                      ))}
                    <div className="flex-1 min-w-[200px]">
                      <Input
                        placeholder="اهتمام جديد... (اضغط Enter)"
                        className="bg-white/5 border-white/10 h-6 text-xs text-white placeholder-white/30"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const val = e.currentTarget.value.trim();
                            if (val && !newInterests.includes(val)) {
                              setNewInterests([...newInterests, val]);
                            }
                            e.currentTarget.value = "";
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>

                {newType === "customer" && (
                  <div className="col-span-2 space-y-3">
                    <Label>العناوين / المواقع</Label>
                    <datalist id="cities-list">
                      {uniqueCities.map((city) => (
                        <option key={city} value={city} />
                      ))}
                      <option value="الرياض" />
                    </datalist>
                    {newLocations.map((loc, idx) => (
                      <div
                        key={loc.id}
                        className="flex gap-2 mb-2 flex-wrap sm:flex-nowrap"
                      >
                        <Input
                          placeholder="المدينة"
                          className="w-full sm:w-28 bg-white/5 border-white/10"
                          list="cities-list"
                          value={loc.city || "الرياض"}
                          onChange={(e) => {
                            const copy = [...newLocations];
                            copy[idx].city = e.target.value;
                            setNewLocations(copy);
                          }}
                        />
                        <Input
                          placeholder="الحي"
                          className="w-full sm:w-32 bg-white/5 border-white/10"
                          value={loc.district || ""}
                          onChange={(e) => {
                            const copy = [...newLocations];
                            copy[idx].district = e.target.value;
                            setNewLocations(copy);
                          }}
                        />
                        <Input
                          placeholder="العنوان (الشارع/المبنى)"
                          className="flex-1 bg-white/5 border-white/10"
                          value={loc.address || ""}
                          onChange={(e) => {
                            const copy = [...newLocations];
                            copy[idx].address = e.target.value;
                            setNewLocations(copy);
                          }}
                        />
                        <Input
                          placeholder="رابط خرائط جوجل"
                          className="flex-1 bg-white/5 border-white/10 text-left"
                          dir="ltr"
                          value={loc.mapLink || ""}
                          onChange={(e) => {
                            const copy = [...newLocations];
                            copy[idx].mapLink = e.target.value;
                            setNewLocations(copy);
                          }}
                        />
                        <Input
                          placeholder="نوع الموقع"
                          className="w-full sm:w-24 bg-white/5 border-white/10"
                          value={loc.type}
                          onChange={(e) => {
                            const copy = [...newLocations];
                            copy[idx].type = e.target.value;
                            setNewLocations(copy);
                          }}
                        />
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAddLocation}
                      className="w-full border-dashed"
                    >
                      <Plus className="ml-1 h-3 w-3" /> إضافة موقع آخر
                    </Button>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowAddDialog(false)}
                >
                  إلغاء
                </Button>
                <Button
                  onClick={handleSave}
                  className="bg-blue-600 hover:bg-blue-500"
                >
                  حفظ البيانات
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div
        ref={parentRef}
        className="flex-1 overflow-auto bg-white/5 rounded-xl border border-white/5 relative"
      >
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-black/80 backdrop-blur-md">
            <TableRow className="hover:bg-transparent border-white/10">
              <TableHead className="text-right">الاسم</TableHead>
              <TableHead className="text-right">الجوال</TableHead>
              <TableHead className="text-right">النوع</TableHead>
              <TableHead className="text-right">العناوين</TableHead>
              <TableHead className="text-right">
                الاهتمامات / نوع الطلب
              </TableHead>
              <TableHead className="text-left">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {finalFiltered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-white/50">
                  لا يوجد عملاء يعرضون، قم بإضافة عملاء جدد.
                </td>
              </tr>
            )}

            {(() => {
              const virtualItems = rowVirtualizer.getVirtualItems();
              const paddingTop =
                virtualItems.length > 0 ? virtualItems[0].start : 0;
              const paddingBottom =
                virtualItems.length > 0
                  ? rowVirtualizer.getTotalSize() -
                    virtualItems[virtualItems.length - 1].end
                  : 0;

              return (
                <>
                  {paddingTop > 0 && (
                    <tr>
                      <td style={{ height: paddingTop }} />
                    </tr>
                  )}
                  {virtualItems.map((virtualRow) => {
                    const c = finalFiltered[virtualRow.index];
                    const customerOrders = orders.filter(
                      (o) => o.customerId === c.id,
                    );
                    const totalRemaining = customerOrders.reduce(
                      (sum, o) => sum + (o.remainingAmount || 0),
                      0,
                    );
                    return (
                      <TableRow
                        key={`${c?.id || virtualRow.key}-${virtualRow.index}`}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        className="border-white/5 hover:bg-white/[0.02]"
                      >
                        <TableCell className="font-medium">
                          <div>{c.name}</div>
                          {totalRemaining > 0 && (
                            <div className="text-xs text-orange-400 mt-1 font-bold">
                              متبقي (آجل): {totalRemaining.toLocaleString()} ر.س
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-white/60">
                            <Phone className="h-3 w-3" />
                            {c.phone}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              c.type === "customer" ? "default" : "outline"
                            }
                            className={`w-fit ${c.type === "customer" ? "bg-green-600" : ""}`}
                          >
                            {c.type === "customer" ? "عميل فعلي" : "محتمل"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(c.locations || []).map((l, index) => (
                              <Badge
                                key={`${l.id}-${index}`}
                                variant="secondary"
                                className="bg-white/5 font-normal flex items-center gap-1 hover:bg-white/10 transition-colors"
                              >
                                <MapPin className="h-3 w-3" />
                                {l.type}: {l.address}
                                {l.mapLink && (
                                  <a
                                    href={l.mapLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ml-1 text-blue-400 hover:text-blue-300"
                                  >
                                    <Navigation className="h-3 w-3 inline" />
                                  </a>
                                )}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          {c.interests && c.interests.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {(c.interests || []).map((i, index) => (
                                <span
                                  key={`${i}-${index}`}
                                  className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded"
                                >
                                  {i}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-white/30 text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2 justify-end items-center">
                            {(() => {
                              const isReminderDue = isCustomerReminderDue(c);
                              return (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className={`h-8 transition-all ${
                                    isReminderDue
                                      ? "border-green-400 bg-green-500/20 text-white animate-pulse shadow-[0_0_10px_rgba(74,222,128,0.6)]"
                                      : "border-green-600/30 text-green-400 hover:bg-green-600/20"
                                  }`}
                                  onClick={() => {
                                    setActiveWhatsappCustomer(c);
                                  }}
                                  title={
                                    isReminderDue
                                      ? "تذكير مستحق!"
                                      : "مراسلة العميل"
                                  }
                                >
                                  {isReminderDue && (
                                    <Bell className="ml-1 h-3 w-3 inline" />
                                  )}
                                  <MessageCircle
                                    className={`${isReminderDue ? "" : "ml-1"} h-3 w-3 inline`}
                                  />
                                  {isReminderDue ? "تذكير" : "واتساب"}
                                </Button>
                              );
                            })()}
                            {c.type === "lead" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 border-blue-600/30 text-blue-400 hover:bg-blue-600/20"
                                onClick={() => onConvert(c.id)}
                              >
                                <ArrowRightCircle className="ml-1 h-3 w-3" />{" "}
                                تحويل لعميل
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 border-cyan-600/30 text-cyan-500 hover:bg-cyan-600/20"
                              onClick={() => setSelectedCustomerReport(c)}
                              title="تقرير العميل"
                            >
                              <Info className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 border-yellow-600/30 text-yellow-500 hover:bg-yellow-600/20"
                              onClick={() => handleEdit(c)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 border-red-600/30 text-red-500 hover:bg-red-600/20"
                              onClick={() => {
                                setDeletingCustomer(c);
                              }}
                              title="حذف العميل"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {paddingBottom > 0 && (
                    <tr>
                      <td style={{ height: paddingBottom }} />
                    </tr>
                  )}
                </>
              );
            })()}
          </TableBody>
        </Table>
      </div>

      {/* WhatsApp Templates Dialog */}
      <Dialog
        open={!!activeWhatsappCustomer}
        onOpenChange={(open) => !open && setActiveWhatsappCustomer(null)}
      >
        <DialogContent className="glass border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>
              إرسال رسالة واتساب للعميل: {activeWhatsappCustomer?.name}
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
                    if (activeWhatsappCustomer) {
                      const msg = template.content.replace(
                        /\[الاسم\]/g,
                        activeWhatsappCustomer.name,
                      );
                      const phoneStr = activeWhatsappCustomer.phone
                        .replace(/^0/, "966")
                        .replace(/\D/g, ""); // rough international format assuming SA
                      const url = `whatsapp://send?phone=${phoneStr}&text=${encodeURIComponent(msg)}`;
                      window.location.href = url;
                      setActiveWhatsappCustomer(null);
                    }
                  }}
                >
                  <div className="flex flex-col text-right w-full">
                    <span className="font-bold text-green-400 mb-1">
                      {template.name}
                    </span>
                    <span className="text-xs text-white/70 line-clamp-2">
                      {template.content.replace(
                        /\[الاسم\]/g,
                        activeWhatsappCustomer?.name || "",
                      )}
                    </span>
                  </div>
                </Button>
              ))
            )}

            <div className="pt-4 mt-4 border-t border-white/10 space-y-2">
              {activeWhatsappCustomer?.interests &&
                activeWhatsappCustomer.interests.length > 0 && (
                  <Button
                    variant="outline"
                    className="w-full justify-center bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border-blue-500/30"
                    onClick={() => {
                      if (activeWhatsappCustomer) {
                        const interestsStr =
                          activeWhatsappCustomer.interests?.join(" و ") || "";
                        const msg = `مرحباً ${activeWhatsappCustomer.name}، لاحظنا اهتمامكم بـ (${interestsStr}). هل يمكننا مساعدتك في أي استفسار أو حجز موعد؟`;
                        const phoneStr = activeWhatsappCustomer.phone
                          .replace(/^0/, "966")
                          .replace(/\D/g, "");
                        const url = `whatsapp://send?phone=${phoneStr}&text=${encodeURIComponent(msg)}`;
                        window.location.href = url;
                        setActiveWhatsappCustomer(null);
                      }
                    }}
                  >
                    إرسال تذكير بالاهتمامات (
                    {activeWhatsappCustomer.interests.join("، ")})
                  </Button>
                )}

              <Label className="block mt-2">رسالة حرة</Label>
              <Button
                variant="outline"
                className="w-full justify-center bg-white/5 hover:bg-white/10 border-white/10 mb-4"
                onClick={() => {
                  if (activeWhatsappCustomer) {
                    const phoneStr = activeWhatsappCustomer.phone
                      .replace(/^0/, "966")
                      .replace(/\D/g, "");
                    const url = `whatsapp://send?phone=${phoneStr}`;
                    window.location.href = url;
                    setActiveWhatsappCustomer(null);
                  }
                }}
              >
                فتح المحادثة بدون قالب
              </Button>

              {activeWhatsappCustomer?.type === "lead" && (
                <div className="pt-4 mt-6 border-t border-white/10">
                  <Label className="block mb-3 text-orange-400 font-bold text-center">
                    تمديد التذكير القادم (سأذكرك لسؤاله إذا أراد أم لا)
                  </Label>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {[
                      { label: "يوم", days: 1 },
                      { label: "يومين", days: 2 },
                      { label: "3 أيام", days: 3 },
                      { label: "أسبوع", days: 7 },
                      { label: "أسبوعين", days: 14 },
                      { label: "شهر", days: 30 },
                    ].map((ext) => (
                      <Button
                        key={ext.days}
                        size="sm"
                        variant="outline"
                        className="bg-black/40 border-orange-500/30 text-orange-400 hover:bg-orange-500/20"
                        onClick={() => {
                          if (activeWhatsappCustomer) {
                            const newDate =
                              Date.now() + ext.days * 24 * 60 * 60 * 1000;
                            onSave({
                              ...activeWhatsappCustomer,
                              nextReminderDate: newDate,
                              reminderLevel: 99, // mark automated sequence as bypassed
                            });
                            toast.success(
                              `تم تأجيل تذكير ${activeWhatsappCustomer.name} بمقدار ${ext.label}`,
                            );
                            setActiveWhatsappCustomer(null);
                          }
                        }}
                      >
                        {ext.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Full Customer Report Dialog */}
      <Dialog
        open={!!selectedCustomerReport}
        onOpenChange={(open) => !open && setSelectedCustomerReport(null)}
      >
        <DialogContent className="glass border-white/10 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-cyan-400" />
              تقرير العميل: {selectedCustomerReport?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedCustomerReport &&
            (() => {
              const customerOrders = orders.filter(
                (o) =>
                  o.customerName === selectedCustomerReport.name ||
                  o.customerId === selectedCustomerReport.id,
              );
              const customerTechOrders = techOrders.filter(
                (to) =>
                  to.customerName === selectedCustomerReport.name ||
                  (selectedCustomerReport.phone &&
                    to.issue?.includes(selectedCustomerReport.phone)),
              );

              const totalOrders = customerOrders.length;
              const lastOrderDate =
                customerOrders.length > 0
                  ? new Date(
                      Math.max(...customerOrders.map((o) => o.date || 0)),
                    ).toLocaleDateString("ar-SA")
                  : "لا يوجد";

              const orderedItems = [
                ...new Set(
                  customerOrders.flatMap((o) => o.items.map((i) => i.name)),
                ),
              ];

              return (
                <div className="space-y-6 pt-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">موجز الأداء</h3>
                    {onPrintStatement && (
                      <Button
                        onClick={() =>
                          onPrintStatement(
                            selectedCustomerReport,
                            customerOrders,
                          )
                        }
                        className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
                      >
                        <Printer className="h-4 w-4" />
                        طباعة كشف حساب
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                      <p className="text-white/50 text-sm">عدد الفواتير</p>
                      <p className="text-2xl font-bold">{totalOrders}</p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                      <p className="text-white/50 text-sm">تاريخ آخر طلب</p>
                      <p className="text-xl font-bold mt-1">{lastOrderDate}</p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                      <p className="text-white/50 text-sm">عدد طلبات الصيانة</p>
                      <p className="text-2xl font-bold">
                        {customerTechOrders.length}
                      </p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                      <p className="text-white/50 text-sm">إجمالي الفواتير</p>
                      <p className="text-xl font-bold mt-1 text-green-400">
                        {customerOrders
                          .reduce((sum, o) => sum + (o.grandTotal || 0), 0)
                          .toLocaleString()}{" "}
                        <span className="text-sm">ريال</span>
                      </p>
                    </div>
                  </div>

                  {orderedItems.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2 text-cyan-200">
                        المنتجات والخدمات المطلوبة سابقاً
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {orderedItems.map((item, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="border-cyan-600/30 text-cyan-100 bg-cyan-900/20"
                          >
                            {item}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {customerOrders.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2 text-cyan-200">
                        سجل الفواتير
                      </h3>
                      <div className="space-y-3">
                        {customerOrders
                          .sort((a, b) => b.date - a.date)
                          .map((order, idx) => (
                            <div
                              key={`${order.id}-${idx}`}
                              className="bg-white/5 p-4 rounded-lg border border-white/10 flex flex-col md:flex-row justify-between md:items-center gap-4"
                            >
                              <div>
                                <p className="font-bold text-lg mb-1">
                                  رقم الفاتورة: {order.id}
                                </p>
                                <p className="text-white/70 text-sm mb-1">
                                  {new Date(order.date).toLocaleString("ar-SA")}
                                </p>
                                <p className="text-white/50 text-xs">
                                  الأصناف:{" "}
                                  {order.items
                                    .map((i) => `${i.name} (x${i.qty})`)
                                    .join("، ")}
                                </p>
                              </div>
                              <div className="flex flex-col gap-2 items-end">
                                <div className="text-left font-bold text-green-400 text-lg">
                                  {order.grandTotal.toLocaleString()} ر.س
                                </div>
                                {(order.remainingAmount || 0) > 0 && (
                                  <div className="text-left text-orange-400 font-bold text-sm bg-orange-400/10 px-2 py-1 rounded">
                                    المتبقي: {order.remainingAmount?.toLocaleString()} ر.س
                                  </div>
                                )}
                                <div className="flex gap-2 mt-2">
                                  {(order.remainingAmount || 0) > 0 && (
                                    <Button
                                      variant="default"
                                      onClick={() => {
                                        setPaymentOrder(order);
                                        setPaymentInput(order.remainingAmount?.toString() || "");
                                      }}
                                      className="bg-green-600 hover:bg-green-500 text-white h-8 text-xs"
                                    >
                                      سداد دفعة
                                    </Button>
                                  )}
                                  {onPrintOrder && (
                                    <Button
                                      variant="outline"
                                      onClick={() => onPrintOrder(order)}
                                      className="border-white/10 hover:bg-white/10 h-8 text-xs"
                                    >
                                      <Printer className="h-3 w-3 mr-1" /> طباعة
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {customerTechOrders.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2 text-cyan-200">
                        سجل طلبات الصيانة والفنيين
                      </h3>
                      <div className="space-y-2">
                        {customerTechOrders
                          .sort((a, b) => b.createdAt - a.createdAt)
                          .map((to, idx) => (
                            <div
                              key={`${to.id}-${idx}`}
                              className="bg-white/5 p-3 rounded-lg border border-white/10 flex justify-between items-start text-sm"
                            >
                              <div>
                                <p className="font-bold text-lg mb-1">رقم الطلب: {to.id}</p>
                                <p className="font-semibold text-white/90">
                                  {to.requestType} - {to.issue}
                                </p>
                                {to.selectedProducts && to.selectedProducts.length > 0 && (
                                  <p className="text-white/70 text-xs mt-1">
                                    المنتجات: {to.selectedProducts.map((p) => `${p.name} ${Object.hasOwn(p, 'qty') && p.qty! > 1 ? `(x${p.qty})` : ''}`).join("، ")}
                                  </p>
                                )}
                                <p className="text-white/50 mt-1">
                                  {new Date(to.createdAt).toLocaleDateString(
                                    "ar-SA",
                                  )}
                                </p>
                              </div>
                              <div className="text-left flex flex-col items-end gap-2">
                                <Badge className="bg-indigo-600">
                                  الفني: {to.technicianName || "غير محدد"}
                                </Badge>
                                {(to.expectedPaymentMethod || to.expectedAmount) && (
                                  <p className="text-xs text-white/60">
                                    طريقة الدفع: {to.expectedPaymentMethod} - المبلغ: {to.expectedAmount} ريال
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {customerOrders.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2 text-cyan-200">
                        آخر الفواتير
                      </h3>
                      <div className="space-y-2">
                        {customerOrders
                          .sort((a, b) => (b.date || 0) - (a.date || 0))
                          .slice(0, 5)
                          .map((o, idx) => (
                            <div
                              key={`${o.id}-${idx}`}
                              className="bg-white/5 p-3 rounded-lg border border-white/10 flex justify-between text-sm"
                            >
                              <span>رقم الفاتورة: {o.id.substring(0, 8)}</span>
                              <span className="text-green-400">
                                {(o.grandTotal || 0).toLocaleString()} ريال
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>
      {/* Delete Confirmation Dialog */}
      <PasswordDialog
        open={!!deletingCustomer}
        onOpenChange={(val) => {
          if (!val) setDeletingCustomer(null);
        }}
        adminPassword={settings.adminPassword}
        onUpdateAdminPassword={
          setSettings
            ? (newPass) => setSettings({ ...settings, adminPassword: newPass })
            : undefined
        }
        onSuccess={() => {
          if (deletingCustomer) onDelete(deletingCustomer.id);
          setDeletingCustomer(null);
          toast.success("تم الحذف بنجاح");
        }}
        title="تأكيد حذف العميل"
        description={`هل أنت متأكد من رغبتك في حذف العميل ${deletingCustomer?.name}؟ هذا الإجراء لا يمكن التراجع عنه.`}
      />

      <Dialog open={!!paymentOrder} onOpenChange={(val) => !val && setPaymentOrder(null)}>
        <DialogContent className="glass border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>سداد متبقي الفاتورة #{paymentOrder?.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-between text-lg">
              <span>المتبقي:</span>
              <span className="font-bold text-orange-400">
                {paymentOrder?.remainingAmount?.toLocaleString()} ر.س
              </span>
            </div>
            <div className="space-y-2">
              <Label>المبلغ المراد سداده</Label>
              <Input
                type="number"
                value={paymentInput}
                onChange={(e) => setPaymentInput(e.target.value)}
                className="bg-black/20 border-white/10 text-lg"
              />
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <Button
                variant="outline"
                className="border-white/10"
                onClick={() => setPaymentOrder(null)}
              >
                إلغاء
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-500 text-white"
                onClick={() => {
                  if (!paymentOrder || !onUpdateOrder) return;
                  const payment = parseFloat(paymentInput) || 0;
                  const currentRemaining = paymentOrder.remainingAmount || 0;
                  if (payment <= 0) {
                    toast.error("يرجى إدخال مبلغ صحيح");
                    return;
                  }
                  if (payment > currentRemaining) {
                    toast.error("المبلغ أكبر من المتبقي!");
                    return;
                  }
                  const newRemaining = currentRemaining - payment;
                  // Append to order's payment history if you want, but updating remainingAmount is enough for now
                  const updatedOrder = {
                    ...paymentOrder,
                    remainingAmount: newRemaining,
                    paidAmount: (paymentOrder.paidAmount || 0) + payment,
                  };
                  if (newRemaining <= 0.01) {
                    updatedOrder.paymentMethod = "cash"; // or paid
                    updatedOrder.remainingAmount = 0;
                  }
                  onUpdateOrder(updatedOrder);
                  toast.success(`تم سداد ${payment} ر.س بنجاح!`);
                  setPaymentOrder(null);
                }}
              >
                تأكيد السداد
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
