import React, { useState, useMemo, useEffect } from "react";
import { Customer, ServiceOrder, Order, AppSettings, CatalogItem } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, User, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CreateRequestFormProps {
  customers: Customer[];
  setCustomers?: React.Dispatch<React.SetStateAction<Customer[]>>;
  onAddCustomer?: (customer: Customer) => void;
  orders: Order[];
  setOrders?: React.Dispatch<React.SetStateAction<Order[]>>;
  urgentOrders: any[];
  setUrgentOrders?: React.Dispatch<React.SetStateAction<any[]>>;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  catalog: CatalogItem[];
  onSaveUrgentOrder: (order: ServiceOrder) => void;
  onSaveSalesOrder?: (order: Order) => void;
  onSuccess?: () => void;
}

export default function CreateRequestForm({
  customers,
  setCustomers,
  onAddCustomer,
  orders,
  urgentOrders,
  settings,
  setSettings,
  catalog,
  onSaveUrgentOrder,
  onSaveSalesOrder,
  onSuccess,
}: CreateRequestFormProps) {
  // State from UrgentOrders
  const [showInlineAddCustomer, setShowInlineAddCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustCity, setNewCustCity] = useState("");
  const [newCustDistrict, setNewCustDistrict] = useState("");
  const [newCustMapLink, setNewCustMapLink] = useState("");
  const [editingCustId, setEditingCustId] = useState<string | null>(null);

  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [customerSelectOpen, setCustomerSelectOpen] = useState(false);
  const [selectedCustId, setSelectedCustId] = useState("");
  const [selectedLocId, setSelectedLocId] = useState("");

  const [requestType, setRequestType] = useState("جديد");
  const [productInterest, setProductInterest] = useState("");
  const [expectedPaymentMethod, setExpectedPaymentMethod] = useState("cash");
  const [expectedAmount, setExpectedAmount] = useState("");
  const [expectedPaidAmount, setExpectedPaidAmount] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<(CatalogItem & { qty?: number })[]>([]);

  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [customDate, setCustomDate] = useState("");
  const [timeHour, setTimeHour] = useState(1);
  const [timeAmPm, setTimeAmPm] = useState("PM");
  const [technicianName, setTechnicianName] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  const nextSevenDays = useMemo(() => {
    const days = [];
    const arabicDays = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const isToday = i === 0;
      const dayNum = d.getDate();
      const dayName = arabicDays[d.getDay()];
      const label = `${dayNum} ${dayName}${isToday ? " (اليوم)" : ""}`;
      days.push({
        date: d,
        label,
        dateString: d.toISOString().split("T")[0],
      });
    }
    return days;
  }, []);

  useEffect(() => {
    if (newCustPhone.length >= 8) {
      const existing = customers.find((c) => c.phone === newCustPhone);
      if (existing && editingCustId !== existing.id) {
        toast.info("تم العثور على العميل، تم جلب بياناته تلقائياً.");
        setEditingCustId(existing.id);
        setNewCustName(existing.name);
        setNewCustCity(existing.locations?.[0]?.city || existing.locations?.[0]?.address || "");
        setNewCustMapLink(existing.locations?.[0]?.mapLink || "");
      } else if (!existing && editingCustId !== null) {
        setEditingCustId(null);
      }
    }
  }, [newCustPhone, customers, editingCustId]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(
      (c) => c.name.includes(customerSearchTerm) || c.phone.includes(customerSearchTerm)
    );
  }, [customers, customerSearchTerm]);

  const customer = customers.find((c) => c.id === selectedCustId);

  const calculateTotalProductsPrice = () => {
    return selectedProducts.reduce((sum, p) => sum + (p.price || 0) * (p.qty || 1), 0);
  };

  const handleCreateRequest = () => {
    let finalCustId = selectedCustId;
    let finalCustName = customer?.name || "";
    let finalLocId = selectedLocId;

    if (showInlineAddCustomer) {
      if (!newCustName || !newCustPhone || !newCustCity || !newCustDistrict) {
        toast.error("يرجى تعبئة الاسم، الجوال، المدينة، والحي للعميل الجديد");
        return;
      }
      const existingCust = customers.find((c) => c.phone === newCustPhone);

      if (existingCust) {
        finalCustId = existingCust.id;
        finalCustName = newCustName;
        const newLocId = Math.random().toString(36).substr(2, 9);
        finalLocId = newLocId;
        const updatedCustomer = {
          ...existingCust,
          name: newCustName,
          locations: [
            ...(existingCust.locations || []),
            {
              id: newLocId,
              address: newCustDistrict || newCustCity || "لا يوجد عنوان",
              type: `موقع إضافي ${(existingCust.locations || []).length + 1}`,
              district: newCustDistrict,
              city: newCustCity,
              mapLink: newCustMapLink,
            },
          ],
        };
        if (setCustomers) {
          setCustomers((prev) => prev.map((c) => (c.id === existingCust.id ? updatedCustomer : c)));
        } else if (onAddCustomer) {
          onAddCustomer(updatedCustomer);
        }
      } else {
        const newCustId = Math.random().toString(36).substr(2, 9);
        finalCustId = newCustId;
        finalCustName = newCustName;
        const newLocId = Math.random().toString(36).substr(2, 9);
        finalLocId = newLocId;

        const newCustomer: Customer = {
          id: newCustId,
          name: newCustName,
          phone: newCustPhone,
          locations: [
            {
              id: newLocId,
              address: newCustDistrict || newCustCity || "لا يوجد عنوان",
              type: "الرئيسي",
              district: newCustDistrict,
              city: newCustCity,
              mapLink: newCustMapLink,
            },
          ],
          type: "lead",
          createdAt: Date.now(),
        };
        
        if (setCustomers) {
          setCustomers((prev) => [newCustomer, ...prev]);
        } else if (onAddCustomer) {
          onAddCustomer(newCustomer);
        }
      }
    }

    if (!finalCustId) {
      toast.error("الرجاء تحديد العميل أو إضافة عميل جديد لإتمام الطلب");
      return;
    }

    if (requestType === "جديد" && selectedProducts.length === 0) {
      toast.error("الرجاء اختيار منتج واحد على الأقل للطلب الجديد");
      return;
    }
    if (requestType !== "جديد" && !productInterest) {
      toast.error("الرجاء إدخال وصف الصيانة أو الخدمة المطلوبة");
      return;
    }

    let rawDateObj: Date;
    if (customDate) {
      rawDateObj = new Date(customDate);
    } else {
      rawDateObj = new Date(nextSevenDays[selectedDayIndex].date);
    }
    
    // Set Time
    let hr24 = timeHour;
    if (timeAmPm === "PM" && hr24 !== 12) hr24 += 12;
    if (timeAmPm === "AM" && hr24 === 12) hr24 = 0;
    rawDateObj.setHours(hr24, 0, 0, 0);

    const timeString = `${timeHour}:00 ${timeAmPm === "AM" ? "صباحاً" : "مساءً"}`;

    const computedIssue = `${requestType} - ${productInterest}`;

    let nextNum = settings.nextRequestNumber || 1;
    let reqPrefix = settings.requestPrefix || "";
    const finalId = `${reqPrefix}${nextNum}`;

    const newRequestOrder: ServiceOrder = {
      id: finalId,
      customerId: finalCustId,
      customerName: finalCustName,
      locationId: finalLocId,
      issue: computedIssue,
      requestType,
      productInterest: requestType === "جديد" ? selectedProducts.map(p => `${p.name} ${Object.hasOwn(p, 'qty') && p.qty! > 1 ? `(x${p.qty})` : ''}`).join(", ") : productInterest,
      date: rawDateObj.getTime(),
      status: "pending",
      technicianName: technicianName !== "none" && technicianName ? technicianName : undefined,
      additionalNotes: `التوقيت: ${timeString}\n${additionalNotes}`,
      expectedPaymentMethod: expectedPaymentMethod,
      expectedAmount: parseFloat(expectedAmount) || calculateTotalProductsPrice(),
      selectedProducts: selectedProducts,
      createdAt: Date.now(),
    };

    onSaveUrgentOrder(newRequestOrder);

    // Sales Invoice creation has been removed per user request (انشاء فاتوره الاختياري)

    setSettings((prev) => ({
      ...prev,
      nextRequestNumber: nextNum + 1,
    }));

    toast.success(`تم تأكيد وحفظ الطلب بنجاح برقم: ${finalId}`);

    if (onSuccess) onSuccess();

    // Reset Form
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
    <div className="space-y-6 w-full text-white bg-transparent p-1">
      {/* Customer Selector / Creator */}
      {!showInlineAddCustomer ? (
        <div className="space-y-2 relative">
          <div className="flex justify-between items-center text-xs">
            <Label className="text-white/70">اسم العميل ورقم جواله</Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-blue-400 hover:text-blue-300 hover:bg-white/5 p-0"
              onClick={() => setShowInlineAddCustomer(true)}
            >
              + إضافة عميل جديد
            </Button>
          </div>
          <div className="relative">
            <User className="absolute right-3 top-2.5 h-4 w-4 text-white/40" />
            <Input
              placeholder="ابحث برقم أو إسم العميل..."
              value={customerSearchTerm}
              onChange={(e) => {
                setCustomerSearchTerm(e.target.value);
                setCustomerSelectOpen(true);
                if (e.target.value === "") {
                  setSelectedCustId("");
                  setSelectedLocId("");
                }
              }}
              onFocus={() => setCustomerSelectOpen(true)}
              className="bg-white/5 border-white/10 pr-10 text-right text-sm"
            />

            {customerSelectOpen && customerSearchTerm && (
              <div className="absolute z-50 w-full mt-1 bg-[#1a1d24] border border-white/10 rounded-lg shadow-2xl max-h-60 overflow-auto">
                {filteredCustomers.length === 0 ? (
                  <div className="p-3 text-sm text-white/50 text-center">
                    لا يوجد عميل بهذا الاسم أو الرقم.
                    <Button variant="link" className="text-blue-400 px-1 text-xs" onClick={() => setShowInlineAddCustomer(true)}>
                      أضف كعميل جديد
                    </Button>
                  </div>
                ) : (
                  filteredCustomers.map((c) => (
                    <div
                      key={c.id}
                      className="p-3 cursor-pointer hover:bg-white/10 border-b border-white/5 last:border-0 flex flex-col gap-1 transition-colors text-right"
                      onClick={() => {
                        setSelectedCustId(c.id);
                        if (c.locations && c.locations.length > 0) {
                          setSelectedLocId(c.locations[0].id);
                        }
                        setCustomerSearchTerm(`${c.name} (${c.phone})`);
                        setCustomerSelectOpen(false);
                      }}
                    >
                      <span className="font-bold text-sm text-white">{c.name}</span>
                      <span className="text-xs text-white/50">{c.phone}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {customer && (
            <div className="bg-white/5 p-3 rounded-lg border border-white/5 space-y-2 mt-2 animation-fade-in text-xs">
              <p className="font-bold text-blue-400 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
                نشاطات العميل السابقة:
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-black/20 p-2 rounded border border-white/5">
                  <span className="text-white/40 block">مواعيد مسجلة</span>
                  <span className="font-bold text-orange-400">
                    {orders.filter((o) => o.customerId === customer.id).length} مواعيد
                  </span>
                </div>
                <div className="bg-black/20 p-2 rounded border border-white/5">
                  <span className="text-white/40 block">طلبات سريعة</span>
                  <span className="font-bold text-green-400">
                    {urgentOrders.filter((o) => o.customerId === customer.id).length} طلبات
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 bg-white/5 p-4 rounded-xl border border-white/10 animation-fade-in text-right">
          <div className="flex justify-between items-center border-b border-white/5 pb-3">
            <Label className="text-blue-400 font-bold text-sm flex items-center gap-2">
              <Plus className="h-4 w-4" />
              إضافة عميل جديد
            </Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-red-400 hover:text-red-300 hover:bg-white/5 p-0"
              onClick={() => setShowInlineAddCustomer(false)}
            >
              إلغاء الإضافة
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 max-md:col-span-1">
              <Label className="text-xs text-white/70">الاسم واللقب</Label>
              <Input value={newCustName} onChange={(e) => setNewCustName(e.target.value)} className="bg-black/20 border-white/10 text-xs" />
            </div>
            <div className="space-y-1.5 max-md:col-span-1">
              <Label className="text-xs text-white/70">رقم الجوال</Label>
              <Input
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value)}
                className="bg-black/20 border-white/10 text-xs text-left"
                dir="ltr"
                placeholder="05XXXXXXXX"
              />
            </div>
            <div className="space-y-1.5 max-md:col-span-1">
              <Label className="text-xs text-white/70">المدينة</Label>
              <Input value={newCustCity} onChange={(e) => setNewCustCity(e.target.value)} className="bg-black/20 border-white/10 text-xs" />
            </div>
            <div className="space-y-1.5 max-md:col-span-1">
              <Label className="text-xs text-white/70">الحي</Label>
              <Input value={newCustDistrict} onChange={(e) => setNewCustDistrict(e.target.value)} className="bg-black/20 border-white/10 text-xs" />
            </div>
            <div className="space-y-1.5 max-md:col-span-1 md:col-span-2">
              <Label className="text-xs text-white/70">رابط قوقل ماب (اختياري)</Label>
              <Input value={newCustMapLink} onChange={(e) => setNewCustMapLink(e.target.value)} className="bg-black/20 border-white/10 text-xs text-left" dir="ltr" />
            </div>
          </div>
        </div>
      )}

      {!showInlineAddCustomer && customer && customer.locations && customer.locations.length > 0 && (
        <div className="space-y-1.5 text-right animation-fade-in">
          <Label className="text-xs text-white/70">الموقع / العنوان</Label>
          <Select value={selectedLocId} onValueChange={setSelectedLocId}>
            <SelectTrigger className="bg-white/5 border-white/10 text-xs">
              <SelectValue placeholder="اختر الموقع..." />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d24] border-white/10 text-white">
              {(customer.locations || []).map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.type}: {l.address} - {l.city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <hr className="border-white/5" />

      {/* Request Type and Client Interest */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-right">
        <div className="space-y-1.5">
          <Label className="text-xs text-white/70">نوع الطلب</Label>
          <Select value={requestType} onValueChange={setRequestType}>
            <SelectTrigger className="bg-white/5 border-white/10 text-xs text-orange-400 font-bold">
              <SelectValue placeholder="نوع الخدمة..." />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d24] border-white/10 text-white">
              <SelectItem value="جديد">تركيب جديد</SelectItem>
              <SelectItem value="صيانة">صيانة دورية</SelectItem>
              <SelectItem value="فحص">فحص وحل مشكلة</SelectItem>
              <SelectItem value="زيارة عاجلة">زيارة عاجلة</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-white/70">
            {requestType === "جديد" ? "اختر المنتجات" : "الخدمة المطلوبة"}
          </Label>
          {requestType === "جديد" ? (
            <Select
              onValueChange={(val) => {
                const prod = catalog.find((c) => c.id === val);
                if (prod) {
                  const existing = selectedProducts.find((p) => p.id === prod.id);
                  if (existing) {
                    setSelectedProducts(selectedProducts.map((p) => p.id === prod.id ? { ...p, qty: (p.qty || 1) + 1 } : p));
                  } else {
                    setSelectedProducts([...selectedProducts, { ...prod, qty: 1 }]);
                  }
                }
              }}
              value=""
            >
              <SelectTrigger className="bg-white/5 border-white/10 text-xs">
                <SelectValue placeholder="أضف منتج..." />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1d24] border-white/10 text-white">
                {(catalog || []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} - {item.price} ريال
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <>
              <Input
                list="saved-interests-ds-urgent"
                value={productInterest}
                onChange={(e) => setProductInterest(e.target.value)}
                placeholder="مثال: صيانة, تغيير فلاتر..."
                className="bg-white/5 border-white/10 text-xs"
              />
              <datalist id="saved-interests-ds-urgent">
                {settings.savedInterests?.map((i) => (
                  <option key={i} value={i} />
                ))}
              </datalist>
            </>
          )}
        </div>
      </div>

      {requestType === "جديد" && selectedProducts.length > 0 && (
        <div className="bg-black/20 p-2 text-right rounded-lg border border-white/5 space-y-2">
          <Label className="text-xs text-white/70 px-1">المنتجات المختارة:</Label>
          {selectedProducts.map((p) => (
            <div key={p.id} className="flex justify-between items-center text-xs bg-white/5 px-2 py-1.5 rounded">
              <span className="flex items-center gap-2">
                <span>{p.name}</span>
                {(p.qty || 1) > 1 && (
                  <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">x{p.qty}</span>
                )}
              </span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 bg-black/40 rounded px-1">
                  <button
                    type="button"
                    className="p-1 hover:text-white text-white/50"
                    onClick={() => {
                      if ((p.qty || 1) > 1) {
                        setSelectedProducts(selectedProducts.map(sp => sp.id === p.id ? { ...sp, qty: (sp.qty || 1) - 1 } : sp));
                      } else {
                        setSelectedProducts(selectedProducts.filter(sp => sp.id !== p.id));
                      }
                    }}
                  >
                    -
                  </button>
                  <span className="w-4 text-center text-[10px]">{p.qty || 1}</span>
                  <button
                    type="button"
                    className="p-1 hover:text-white text-white/50"
                    onClick={() => setSelectedProducts(selectedProducts.map(sp => sp.id === p.id ? { ...sp, qty: (sp.qty || 1) + 1 } : sp))}
                  >
                    +
                  </button>
                </div>
                <span className="font-bold text-green-400">{(p.price || 0) * (p.qty || 1)} ر.س</span>
                <button
                  type="button"
                  onClick={() => setSelectedProducts(selectedProducts.filter((sp) => sp.id !== p.id))}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          <div className="flex justify-between items-center px-1 pt-1 border-t border-white/5 mt-1">
            <span className="text-xs text-white/70">الإجمالي المبدئي للمنتجات:</span>
            <span className="text-xs font-bold">{calculateTotalProductsPrice()} ريال</span>
          </div>
        </div>
      )}

      {/* Payment Information */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-right bg-white/5 p-3 rounded-xl border border-white/5 mt-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-white/70">طريقة الدفع المتوقعة</Label>
          <Select value={expectedPaymentMethod} onValueChange={setExpectedPaymentMethod}>
            <SelectTrigger className="bg-white/5 border-white/10 text-xs">
              <SelectValue placeholder="طريقة الدفع..." />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d24] border-white/10 text-white">
              <SelectItem value="cash">كاش / نقدي</SelectItem>
              <SelectItem value="card">شبكة / بطاقة</SelectItem>
              <SelectItem value="transfer">تحويل بنكي</SelectItem>
              <SelectItem value="credit">آجل / دين</SelectItem>
              <SelectItem value="partial">دفع جزئي</SelectItem>
              <SelectItem value="not_agreed">لم يتم الاتفاق بعد</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 flex gap-2 w-full">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs text-white/70">المبلغ الإجمالي</Label>
            <Input
              type="number"
              placeholder="المبلغ الإجمالي"
              value={expectedAmount}
              onChange={(e) => setExpectedAmount(e.target.value)}
              disabled={expectedPaymentMethod === "credit" || expectedPaymentMethod === "not_agreed"}
              className="bg-white/5 border-white/10 text-xs text-center disabled:opacity-50"
            />
          </div>
          {expectedPaymentMethod === "partial" && (
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-white/70">المدفوع (مقدم)</Label>
              <Input
                type="number"
                placeholder="المدفوع"
                value={expectedPaidAmount}
                onChange={(e) => setExpectedPaidAmount(e.target.value)}
                className="bg-white/5 border-white/10 text-xs text-center border-orange-500/50"
              />
            </div>
          )}
        </div>
      </div>

      {/* Date selection System: 7 consecutive days starting from today */}
      <div className="space-y-2 text-right mt-4">
        <Label className="text-xs text-white/80 font-bold flex items-center justify-between">
          <span>تاريخ الخدمة (7 أيام متتالية)</span>
          <span className="text-[10px] text-orange-400 font-normal hidden sm:inline">اليوم الأول هو اليوم الحالي</span>
        </Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1.5 p-1.5 bg-black/20 rounded-lg border border-white/5 dir-rtl">
          {nextSevenDays.map((day, idx) => {
            const isSelected = selectedDayIndex === idx && !customDate;
            return (
              <Button
                key={idx}
                type="button"
                variant={isSelected ? "default" : "outline"}
                onClick={() => {
                  setSelectedDayIndex(idx);
                  setCustomDate("");
                }}
                className={cn(
                  "h-12 text-xs flex flex-col justify-center items-center font-medium border-white/5 rounded-md px-1",
                  isSelected ? "bg-orange-600 text-white hover:bg-orange-500 shadow-md" : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <span className="text-[9px] leading-tight block">{day.label.split(" ")[1]}</span>
                <span className="font-bold text-xs">{day.label.split(" ")[0]}</span>
              </Button>
            );
          })}
        </div>
      </div>

      {/* Time Selection and Assigned Technician */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-right pt-2 border-t border-white/5 mt-4">
        <div className="space-y-2 col-span-1 border border-white/5 p-3 rounded-xl bg-black/20">
          <Label className="text-xs text-white/70 flex items-center gap-1 justify-end font-bold mb-2">
            <Clock className="h-3 w-3 text-white/50" />
            توقيت الزيارة
          </Label>
          <div className="flex bg-white/5 p-1 rounded-lg border border-white/10 mb-2 gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setTimeAmPm("AM");
              }}
              className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${timeAmPm === "AM" ? "bg-orange-500 text-white font-bold" : "text-white/60 hover:bg-white/10"}`}
            >
              صباحاً (AM)
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setTimeAmPm("PM");
              }}
              className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${timeAmPm === "PM" ? "bg-orange-500 text-white font-bold" : "text-white/60 hover:bg-white/10"}`}
            >
              مساءً (PM)
            </button>
          </div>
          <div className="grid grid-cols-6 gap-1.5" dir="ltr">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => (
              <button
                key={h}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setTimeHour(h);
                }}
                className={`text-xs py-1.5 rounded-md border text-center transition-colors ${timeHour === h ? "bg-orange-500/20 border-orange-500 text-orange-400 font-bold" : "bg-white/5 border-white/5 text-white/70 hover:bg-white/10"}`}
              >
                {h}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-white/70">تخصيص فني (تأسيس فوري)</Label>
          <Select value={technicianName} onValueChange={setTechnicianName}>
            <SelectTrigger className="bg-white/5 border-white/10 text-xs">
              <SelectValue placeholder="اختر الفني لتكليفه..." />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1d24] border-white/10 text-white">
              {(() => {
                const allTechnicians = [
                  ...(settings.users?.filter(u => u.role === "technician") || []),
                  ...(settings.technicians?.map(t => typeof t === "string" ? {name: t} : t) || [])
                ];
                const uniqueTechs = Array.from(new Map(allTechnicians.map(t => [t.name, t])).values());

                if (uniqueTechs.length === 0) {
                  return (
                    <SelectItem value="none" disabled>
                      قم بإضافة فنيين من الإعدادات
                    </SelectItem>
                  );
                }

                return uniqueTechs.map((t: any) => {
                  const name = t.name;
                  return (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  );
                });
              })()}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Additional Notes */}
      <div className="space-y-1.5 text-right mt-4">
        <Label className="text-xs text-white/70">ملاحظات العمل الإضافية / المتبقي</Label>
        <Textarea
          value={additionalNotes}
          onChange={(e) => setAdditionalNotes(e.target.value)}
          placeholder="ملاحظات حول وقت الحضور أو متطلبات إضافية للعميل..."
          className="bg-white/5 border-white/10 text-xs resize-none min-h-[60px]"
          rows={2}
        />
      </div>

      <div className="pt-2 mt-4 border-t border-white/5 pb-2">
        <Button
          onClick={handleCreateRequest}
          type="button"
          className="bg-orange-600 hover:bg-orange-500 h-10 w-full font-bold text-sm text-white shadow-lg transition-transform hover:scale-[1.01]"
        >
          <Plus className="mr-2 h-4 w-4" />
          تأكيد وإنشاء الطلب
        </Button>
      </div>
    </div>
  );
}
