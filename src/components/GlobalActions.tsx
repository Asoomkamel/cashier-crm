import React, { useState } from "react";
import { Customer, ServiceOrder, Order, AppSettings, CatalogItem } from "../types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  MessageCircle,
  Plus,
  Send,
  Copy,
  PenSquare,
  ShoppingBag,
  ClipboardList,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { storage } from "../services/storage";
import { t } from "../lib/i18n";
import { format } from "date-fns";
import { arSA } from "date-fns/locale";
import { generateWhatsAppMessage } from "../utils/whatsapp";
import CreateRequestForm from "./CreateRequestForm";

interface GlobalActionsProps {
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  serviceOrders: ServiceOrder[];
  setServiceOrders: React.Dispatch<React.SetStateAction<ServiceOrder[]>>;
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  urgentOrders: any[];
  setUrgentOrders: React.Dispatch<React.SetStateAction<any[]>>;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  setView?: (view: string) => void;
  catalog?: CatalogItem[];
  onSaveOrder?: (order: Order) => void;
}

export default function GlobalActions({
  customers,
  setCustomers,
  serviceOrders,
  setServiceOrders,
  orders,
  setOrders,
  urgentOrders,
  setUrgentOrders,
  settings,
  setSettings,
  setView,
  catalog = [],
  onSaveOrder,
}: GlobalActionsProps) {
  const [showMenu, setShowMenu] = useState(false);

  // Quick Order State
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderType, setOrderType] = useState<"urgent" | "new">("urgent");

  const [showInlineAddCustomer, setShowInlineAddCustomer] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [customerSelectOpen, setCustomerSelectOpen] = useState(false);
  const [selectedCustId, setSelectedCustId] = useState("");
  const [selectedLocId, setSelectedLocId] = useState("");
  const [issue, setIssue] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [nextMaintenanceDate, setNextMaintenanceDate] = useState("");
  const [technicianName, setTechnicianName] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustCity, setNewCustCity] = useState("");
  const [newCustMapLink, setNewCustMapLink] = useState("");

  const [editingCustId, setEditingCustId] = useState<string | null>(null);

  // WhatsApp State
  const [showWaModal, setShowWaModal] = useState(false);
  const [waPhone, setWaPhone] = useState("");
  const [waMessage, setWaMessage] = useState("");

  React.useEffect(() => {
    if (newCustPhone && newCustPhone.length >= 8) {
      const existing = customers.find((c) => c.phone === newCustPhone);
      if (existing && editingCustId !== existing.id) {
        setEditingCustId(existing.id);
        setNewCustName(existing.name);
        setNewCustCity(
          existing.locations?.[0]?.address ||
            existing.locations?.[0]?.city ||
            "",
        );
        setNewCustMapLink(existing.locations?.[0]?.mapLink || "");
        toast.info("تم العثور على العميل، تم جلب بياناته تلقائياً.");
      } else if (!existing && editingCustId !== null) {
        setEditingCustId(null);
      }
    }
  }, [newCustPhone, customers, editingCustId]);

  const filteredCustomers = React.useMemo(() => {
    return customers.filter(
      (c) =>
        c.name.includes(customerSearchTerm) ||
        c.phone.includes(customerSearchTerm),
    );
  }, [customers, customerSearchTerm]);

  const customer = customers.find((c) => c.id === selectedCustId);

  const handleQuickOrder = () => {
    let finalCustId = selectedCustId;
    let finalCustName = customer?.name || "";
    let finalLocId = selectedLocId;

    if (showInlineAddCustomer) {
      if (!newCustName || !newCustPhone) {
        toast.error("الرجاء إدخال الاسم ورقم الجوال");
        return;
      }
      const existingCust = customers.find((c) => c.phone === newCustPhone);

      if (existingCust) {
        finalCustId = existingCust.id;
        finalCustName = newCustName;

        const locMatch = (existingCust.locations || []).find(
          (l) =>
            (l.address === newCustCity || l.city === newCustCity) &&
            l.mapLink === newCustMapLink,
        );

        if (locMatch) {
          finalLocId = locMatch.id;
        } else {
          const newLocId = Math.random().toString(36).substr(2, 9);
          finalLocId = newLocId;
          const updatedCustomer = {
            ...existingCust,
            name: newCustName,
            locations: [
              ...(existingCust.locations || []),
              {
                id: newLocId,
                address: newCustCity || "لا يوجد عنوان",
                type: `موقع إضافي (${(existingCust.locations || []).length + 1})`,
                city: newCustCity,
                mapLink: newCustMapLink,
              },
            ],
          };
          setCustomers((prev) => {
            const newCustomersList = prev.map((c) =>
              c.id === existingCust.id ? updatedCustomer : c,
            );
            storage.saveCustomers(newCustomersList);
            return newCustomersList;
          });
        }
      } else {
        const newCustomer: Customer = {
          id: Math.random().toString(36).substr(2, 9),
          name: newCustName,
          phone: newCustPhone,
          type: "lead",
          createdAt: Date.now(),
          interests: [],
          locations: [
            {
              id: Math.random().toString(36).substr(2, 9),
              address: newCustCity || "محلي",
              type: "تم إضافته لطلب سريع",
              city: newCustCity,
              mapLink: newCustMapLink,
            },
          ],
        };
        setCustomers((prev) => {
          const newCustomersList = [newCustomer, ...prev];
          storage.saveCustomers(newCustomersList);
          return newCustomersList;
        });
        finalCustId = newCustomer.id;
        finalCustName = newCustName;
        finalLocId = newCustomer.locations[0].id;
      }
    }

    if (!finalCustId || !issue) {
      toast.error("الرجاء اختيار عميل أو الاضافة واسم الطلب/الخدمة");
      return;
    }

    const assignedRequestType = orderType === "urgent" ? "صيانة" : "جديد";

    const newOrder: ServiceOrder = {
      id: `ORD-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      customerId: finalCustId,
      customerName: finalCustName,
      locationId: finalLocId,
      issue: issue,
      requestType: assignedRequestType,
      productInterest: issue,
      date: new Date(date).getTime(),
      status: "pending",
      technicianName: technicianName !== "none" ? technicianName : undefined,
      additionalNotes: additionalNotes,
      nextMaintenanceDate: nextMaintenanceDate
        ? new Date(nextMaintenanceDate).getTime()
        : undefined,
      createdAt: Date.now(),
    };

    const updatedUrgentOrders = [newOrder, ...urgentOrders];
    setUrgentOrders(updatedUrgentOrders);
    storage.saveUrgentOrders(updatedUrgentOrders);

    if (technicianName && technicianName !== "none") {
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
        const techText = generateWhatsAppMessage(template, newOrder, matchedCust);
        const url = `whatsapp://send?phone=${cleanTechPhone}&text=${encodeURIComponent(techText)}`;
        window.open(url, "_blank");
      }
    }

    toast.success("تم إنشاء الطلب بنجاح وتم تحويله لقائمة الطلبات (الطلبات)!");
    if (setView) setView("urgent_orders");

    if (
      issue &&
      (!settings.savedInterests || !settings.savedInterests.includes(issue))
    ) {
      const updatedInterests = [...(settings.savedInterests || []), issue];
      const newSettings = { ...settings, savedInterests: updatedInterests };
      setSettings(newSettings);
      storage.saveSettings(newSettings);
    }

    // Reset Form
    setSelectedCustId("");
    setSelectedLocId("");
    setIssue("");
    setDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setNextMaintenanceDate("");
    setTechnicianName("");
    setAdditionalNotes("");
    setShowInlineAddCustomer(false);
    setNewCustName("");
    setNewCustPhone("");
    setNewCustCity("");
    setNewCustMapLink("");
    setCustomerSearchTerm("");
    setShowOrderModal(false);
    setShowMenu(false);
  };

  const handleSendWa = () => {
    if (!waPhone) {
      toast.error("الرجاء إدخال رقم الجوال");
      return;
    }
    const cleanPhone = waPhone.replace(/\D/g, "");
    const finalPhone = cleanPhone.startsWith("0")
      ? "966" + cleanPhone.substring(1)
      : cleanPhone;

    const url = `whatsapp://send?phone=${finalPhone}&text=${encodeURIComponent(waMessage)}`;
    window.open(url, "_blank");
    setShowWaModal(false);
    setShowMenu(false);
  };

  const insertTemplate = (templateContent: string) => {
    setWaMessage(templateContent);
  };

  return (
    <>
      <div className="fixed bottom-4 left-4 sm:bottom-6 sm:left-6 z-50 flex flex-col-reverse items-start gap-4">
        {/* Main Action Button */}
        <Button
          onClick={() => setShowMenu(!showMenu)}
          className={cn(
            "h-14 w-14 rounded-full shadow-2xl transition-all duration-300",
            showMenu
              ? "bg-red-500 hover:bg-red-600 rotate-45"
              : "bg-blue-600 hover:bg-blue-700",
          )}
        >
          <Plus className="h-6 w-6 text-white" />
        </Button>

        {/* Action Menu (WhatsApp, Quick Order) */}
        {showMenu && (
          <div className="flex flex-col items-start gap-3 mb-2 animate-in slide-in-from-bottom-2 fade-in duration-200">
            <Button
              size="lg"
              className="rounded-full shadow-lg gap-2 bg-green-500 hover:bg-green-600 text-white pl-4 pr-5 h-12"
              onClick={() => setShowWaModal(true)}
            >
              <MessageCircle className="h-5 w-5" />
              {settings.language === "en" ? "WhatsApp Message" : "رسالة واتساب"}
            </Button>

            <Button
              size="lg"
              className="rounded-full shadow-lg gap-2 bg-orange-500 hover:bg-orange-600 text-white pl-4 pr-5 h-12"
              onClick={() => {
                setOrderType("urgent");
                setShowOrderModal(true);
              }}
            >
              <ClipboardList className="h-5 w-5" />
              {t("quick_order", settings)}
            </Button>
          </div>
        )}
      </div>

      {/* Quick Order Dialog */}
      <Dialog open={showOrderModal} onOpenChange={setShowOrderModal}>
        <DialogContent className="glass border-white/10 sm:max-w-4xl text-white bg-[#14181f]/95 shadow-2xl p-0 overflow-hidden flex flex-col max-h-[90vh] md:max-h-[85vh]">
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 border-b border-white/5 p-4 sm:p-6 bg-black/20 shrink-0">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Plus className="h-5 w-5 text-orange-500" />
              إنشاء طلب جديد
            </h2>
            <Button
              variant="outline"
              className="text-orange-500 border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20 px-4 py-1 h-auto text-sm"
              onClick={() => {
                setShowOrderModal(false);
                if (setView) setView("urgent_orders");
              }}
            >
              قائمة الطلبات
            </Button>
          </div>
          
          <div className="p-4 sm:p-6 flex-1 overflow-y-auto w-full">
            <CreateRequestForm
              customers={customers}
              setCustomers={setCustomers}
              orders={orders}
              urgentOrders={urgentOrders}
              setUrgentOrders={setUrgentOrders}
              settings={settings}
              setSettings={setSettings}
              catalog={catalog}
              onSaveUrgentOrder={(newOrder) => {
                const updatedUrgentOrders = [newOrder, ...urgentOrders];
                setUrgentOrders(updatedUrgentOrders);
                storage.saveUrgentOrders(updatedUrgentOrders);
              }}
              onSaveSalesOrder={onSaveOrder}
              onSuccess={() => {
                if (setView) setView("urgent_orders");
                setShowOrderModal(false);
                setShowMenu(false);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Dialog */}
      <Dialog open={showWaModal} onOpenChange={setShowWaModal}>
        <DialogContent className="glass border-white/10 sm:max-w-md text-white">
          <DialogHeader>
            <DialogTitle>إرسال رسالة واتساب</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>رقم الجوال</Label>
              <Input
                value={waPhone}
                onChange={(e) => setWaPhone(e.target.value)}
                className="bg-black/20 border-white/10 text-left dir-ltr"
                placeholder="05XXXXXXXX"
              />
            </div>

            {settings.whatsappTemplates &&
              settings.whatsappTemplates.length > 0 && (
                <div className="space-y-2">
                  <Label>نماذج جاهزة</Label>
                  <div className="flex flex-wrap gap-2">
                    {settings.whatsappTemplates.map((t) => (
                      <Button
                        key={t.id}
                        variant="outline"
                        size="sm"
                        onClick={() => insertTemplate(t.content)}
                        className="border-white/10 hover:bg-white/5"
                      >
                        {t.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>نص الرسالة</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (!waMessage) return;
                    const prev = waMessage;
                    setWaMessage("جاري التنسيق الذكي...");
                    try {
                      const res = await fetch("/api/format-message", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          purpose: "enhance_text",
                          rawText: prev,
                        }),
                      });
                      const data = await res.json();
                      if (data.message) {
                        setWaMessage(data.message);
                        toast.success("تم تنسيق النص بنجاح");
                      } else {
                        setWaMessage(prev);
                        toast.error("حدث خطأ أثناء التنسيق");
                      }
                    } catch (e) {
                      setWaMessage(prev);
                      toast.error("فشل الاتصال بالذكاء الاصطناعي");
                    }
                  }}
                  className="h-7 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 p-1"
                >
                  ✨ تنسيق ذكي (AI)
                </Button>
              </div>
              <Textarea
                value={waMessage}
                onChange={(e) => setWaMessage(e.target.value)}
                className="bg-black/20 border-white/10 min-h-[120px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-white/10"
              onClick={() => setShowWaModal(false)}
            >
              إلغاء
            </Button>
            <Button
              onClick={handleSendWa}
              className="bg-green-600 hover:bg-green-500 gap-2"
            >
              <Send className="h-4 w-4" />
              إرسال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
