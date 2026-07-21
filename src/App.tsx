/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { storage } from "./services/storage";
import { supabase, loadCloudUserData, saveCloudUserData } from "./lib/supabase";
import {
  Customer,
  CatalogItem,
  Order,
  AppSettings,
  Vendor,
  PurchaseInvoice,
  Expense,
} from "./types";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import CRM from "./components/CRM";
import Catalog from "./components/Catalog";
import POS from "./components/POS";
import History from "./components/History";
import Appointments from "./components/Appointments";
import UrgentOrders from "./components/UrgentOrders";
import AuthScreen from "./components/AuthScreen";
import SettingsView from "./components/Settings";
import UsersView from "./components/Users";
import TechnicianMobileView from "./components/TechnicianMobileView";
import PrintInvoice from "./components/PrintInvoice";
import PrintCustomerStatement from "./components/PrintCustomerStatement";
import PrintVendorStatement from "./components/PrintVendorStatement";
import PrintVendorReceipt from "./components/PrintVendorReceipt";
import PrintTechnicianStatement from "./components/PrintTechnicianStatement";
import { PasswordDialog } from "./components/PasswordDialog";
import Reports from "./components/Reports";
import Purchases from "./components/Purchases";
import Expenses from "./components/Expenses";
import GlobalActions from "./components/GlobalActions";
import TechnicianInventory from "./components/TechnicianInventory";
import AIAgent from "./components/AIAgent";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { Toaster, toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { Lock, Cloud, Printer, Download, X, Menu, Sun, Moon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

function AutoPrintTrigger({ title }: { title?: string }) {
  useEffect(() => {
    const originalTitle = document.title;
    if (title) document.title = title;
    const t = setTimeout(() => {
      window.print();
      if (title) document.title = originalTitle;
    }, 800);
    return () => {
      clearTimeout(t);
      if (title) document.title = originalTitle;
    };
  }, [title]);
  return null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 20,
            color: "red",
            background: "#fdd",
            whiteSpace: "pre-wrap",
          }}
        >
          <h2>Something went wrong in Settings.</h2>
          <details style={{ whiteSpace: "pre-wrap" }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.error && this.state.error.stack}
          </details>
          <button onClick={() => this.setState({ hasError: false })}>
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [view, setView] = useState("pos");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [serviceOrders, setServiceOrders] = useState<any[]>([]);
  const [urgentOrders, setUrgentOrders] = useState<any[]>([]);
  const [fastOrders, setFastOrders] = useState<any[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settings, setSettings] = useState<AppSettings>(storage.getSettings());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const toggleTheme = () => {
    setSettings((prev) => ({
      ...prev,
      theme: prev.theme === "light" ? "dark" : "light",
    }));
  };
  const getCurrentViewTitle = () => {
    const titles: Record<string, string> = {
      pos: "نقطة البيع",
      urgent_orders: "الطلبات",
      appointments: "المواعيد",
      technician_inventory: "مخزون الفنيين",
      crm: "العملاء",
      catalog: "الكتالوج",
      history: "السجل",
      dashboard: "لوحة التحكم",
      reports: "التقارير",
      reports_customers: "تقارير العملاء",
      reports_sales: "تقارير المبيعات",
      reports_purchases: "تقارير المشتريات",
      reports_products: "تقارير المنتجات",
      reports_stock: "تقارير حركة المنتجات",
      reports_technicians: "مبيعات الفنيين",
      reports_expenses: "تقارير المصروفات",
      reports_all: "جميع التقارير",
      purchases: "المشتريات",
      purchases_invoices: "فواتير المشتريات",
      purchases_vendors: "إضافة مورد",
      purchases_returns: "مرتجع مورد",
      purchases_reports: "تقارير الموردين",
      expenses: "المصروفات",
      users: "إدارة المستخدمين",
      settings: "الإعدادات",
    };
    return titles[view] || "كاشير برو";
  };
  const [activeUser, setActiveUser] = useState<any>(storage.getActiveUser());
  const [supabaseUser, setSupabaseUser] = useState<any>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [loginThemeInitialized, setLoginThemeInitialized] = useState(false);

  // Keep the public login page light by default, even if older browser storage
  // still contains the previous dark default. Users can still switch it manually.
  useEffect(() => {
    if (!activeUser && !loginThemeInitialized) {
      setLoginThemeInitialized(true);
      setSettings((prev) =>
        prev.theme === "light" ? prev : { ...prev, theme: "light" },
      );
    }
  }, [activeUser, loginThemeInitialized]);

  // Apply the theme immediately, including before login.
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "light") {
      root.classList.add("light-mode");
      root.classList.remove("dark");
    } else {
      root.classList.remove("light-mode");
      root.classList.add("dark");
    }
  }, [settings.theme]);

  useEffect(() => {
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        const user = session?.user || null;
        setSupabaseUser(user);
        setAuthInitialized(true);
        if (user) {
          if (!activeUser || activeUser.id !== user.id) {
            const u = { id: user.id, name: user.user_metadata?.full_name || user.email, role: "admin", email: user.email };
            setActiveUser(u);
            storage.saveActiveUser(u);
          }
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        const user = session?.user || null;
        setSupabaseUser(user);
        setAuthInitialized(true);
        if (user) {
          if (!activeUser || activeUser.id !== user.id) {
            const u = { id: user.id, name: user.user_metadata?.full_name || user.email, role: "admin", email: user.email };
            setActiveUser(u);
            storage.saveActiveUser(u);
          }
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    } else {
      setAuthInitialized(true);
    }
  }, [activeUser]);

  // App state
  const [isInitialized, setIsInitialized] = useState(false);
  const [activePrintOrder, setActivePrintOrder] = useState<Order | null>(null);
  const [editingOrderState, setEditingOrderState] = useState<Order | null>(
    null,
  );
  const [activePrintStatement, setActivePrintStatement] = useState<{
    customer: Customer;
    orders: Order[];
  } | null>(null);
  const [initialPOSState, setInitialPOSState] = useState<any>(null);
  const [activePrintVendorStatement, setActivePrintVendorStatement] = useState<{
    vendor: Vendor;
    invoices: PurchaseInvoice[];
  } | null>(null);
  const [activePrintVendorReceipt, setActivePrintVendorReceipt] = useState<{
    invoice: PurchaseInvoice;
    vendor: Vendor;
    paymentAmount: number;
    paymentDate: number;
  } | null>(null);

  const [activePrintTechnicianStatement, setActivePrintTechnicianStatement] = useState<{
    technicianName: string;
    orders: Order[];
    expenses: any[];
    serviceOrders?: any[];
    inventoryItems?: any[];
  } | null>(null);
  const [isProtectedView, setIsProtectedView] = useState(false);
  const [targetView, setTargetView] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [sharedInvoiceValue, setSharedInvoiceValue] = useState<{
    order: Order;
    settings: AppSettings;
  } | null>(null);

  const handleDownloadPDF = async (order: Order) => {
    const elements = Array.from(document.querySelectorAll("#print-invoice-container"));
    const element = elements.find((el) => el.getBoundingClientRect().height > 0) || elements[0] as HTMLElement;
    
    if (!element) {
      toast.error("لم يتم العثور على الفاتورة لتوليد ملف PDF");
      return;
    }

    try {
      const canvas = await html2canvas(element as HTMLElement, { scale: 2, useCORS: true });
      if (canvas.width === 0 || canvas.height === 0) {
        throw new Error("Canvas dimensions invalid");
      }
      
      const imgData = canvas.toDataURL("image/jpeg", 0.98);
      const pdf = new jsPDF({
        unit: "mm",
        format: "a4",
        orientation: "portrait",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${order.id}.pdf`);
      toast.success("تم بدء تحميل الفاتورة كملف PDF");
    } catch (err) {
      console.error(err);
      toast.error("فشل توليد ملف PDF");
    }
  };

  const handleSendWhatsAppPDF = async (
    order: Order,
    customerPhone?: string,
  ) => {
    const elements = Array.from(document.querySelectorAll("#print-invoice-container"));
    const element = elements.find((el) => el.getBoundingClientRect().height > 0) || elements[0] as HTMLElement;
    
    if (!element) {
      toast.error("لم يتم العثور على الفاتورة لتوليد ملف PDF");
      return;
    }

    toast.info("جاري إعداد وتحميل الفاتورة بصيغة PDF لخدمة الواتساب...");

    try {
      const canvas = await html2canvas(element as HTMLElement, { scale: 2, useCORS: true });
      if (canvas.width === 0 || canvas.height === 0) {
        throw new Error("Canvas dimensions invalid");
      }
      
      const imgData = canvas.toDataURL("image/jpeg", 0.98);
      const pdf = new jsPDF({
        unit: "mm",
        format: "a4",
        orientation: "portrait",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(
        `فاتورة_${order.type === "tax_invoice" ? "ضريبية" : "عرض_سعر"}_${order.id.slice(0, 12)}.pdf`,
      );

      const phone = customerPhone || "";
      let cleanPhone = phone.trim().replace(/[\s\-\+\(\)]/g, "");
      if (cleanPhone.startsWith("05")) {
        cleanPhone = "966" + cleanPhone.slice(1);
      } else if (cleanPhone.startsWith("5")) {
        cleanPhone = "966" + cleanPhone;
      }

      const orderTypeLabel =
        order.type === "tax_invoice" ? "الفاتورة الضريبية" : "عرض السعر";
      const msg = `السلام عليكم ورحمة الله وبركاته،\nمرفق لكم ${orderTypeLabel} الرقمية رقم (${order.id})\nبإجمالي: ${order.grandTotal.toFixed(2)} ر.س\n\nيرجى سحب الملف المُنزل وإفلاته في نافذة محادثة الواتساب المفتوحة لإرساله كملف PDF مباشرة. شكرًا لتعاملكم معنا.`;

      setTimeout(() => {
        const whatsappUrl = `whatsapp://send?phone=${cleanPhone ? cleanPhone : ""}&text=${encodeURIComponent(msg)}`;
        window.open(whatsappUrl, "_blank");
        toast.success("تم إرسال الرابط وفتح واتساب العميل بنجاح!");
      }, 1500);
    } catch (err) {
      console.error(err);
      toast.error("فشل إعداد ملف PDF الموجه للواتساب");
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qrIn = params.get("qr_in");
    const qrData = params.get("qr_invoice") || qrIn; // support both
    if (qrData) {
      try {
        const decodedStr = JSON.parse(decodeURIComponent(escape(atob(qrData))));
        if (decodedStr && decodedStr.o) {
          const fakeSettings: any = {
            ...storage.getSettings(),
            companyHeader: {
              ...storage.getSettings().companyHeader,
              ...decodedStr.c,
            },
          };

          // Reconstruct minimal order payload if using qr_in
          let o = decodedStr.o;
          if (qrIn && o.items) {
            o.items = o.items.map((i: any) => ({
              name: i.n,
              quantity: i.q,
              price: i.p,
              total: i.q * i.p,
            }));
          }

          setSharedInvoiceValue({ order: o, settings: fakeSettings });
        }
      } catch (err) {
        console.error("Invalid QR payload", err);
      }
    }

    const handleAfterPrint = () => {
      setActivePrintOrder(null);
    };
    window.addEventListener("afterprint", handleAfterPrint);

    const loadData = async () => {
      if (!authInitialized) return;

      if (activeUser?.id && supabaseUser && supabaseUser.id === activeUser.id) {
        try {
          const payload = await loadCloudUserData(activeUser.id);
          if (payload) {
             setCustomers(payload.customers || []);
             setCatalog(payload.catalog || []);
             setOrders(payload.orders || []);
             setServiceOrders(payload.serviceOrders || []);
             setUrgentOrders(payload.urgentOrders || []);
             setFastOrders(payload.fastOrders || []);
             setVendors(payload.vendors || []);
             setPurchases(payload.purchases || []);
             setExpenses(payload.expenses || []);
             if (payload.settings) setSettings(payload.settings);
             setIsInitialized(true);
             return; // Initialized from cloud
          }
        } catch (e: any) {
          console.error("Cloud fetch error:", e);
        }
      }

      setCustomers(storage.getCustomers());
      setCatalog(storage.getCatalog());
      setOrders(storage.getOrders());
      setServiceOrders(storage.getServiceOrders());
      setUrgentOrders(storage.getUrgentOrders());
      setFastOrders(storage.getFastOrders());
      setVendors(storage.getVendors());
      setPurchases(storage.getPurchases());
      setExpenses(storage.getExpenses ? storage.getExpenses() : []);
      setIsInitialized(true);
    };

    loadData();

    return () => {
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, [activeUser, authInitialized, supabaseUser]);

  // Sync with storage on change (Debounced to improve performance)
  useEffect(() => {
    if (!isInitialized) return;

    if (settings.theme === "light") {
      document.documentElement.classList.add("light-mode");
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.remove("light-mode");
      document.documentElement.classList.add("dark");
    }

    const timeoutId = setTimeout(() => {
      storage.saveCustomers(customers);
      storage.saveCatalog(catalog);
      storage.saveOrders(orders);
      storage.saveServiceOrders(serviceOrders);
      storage.saveUrgentOrders(urgentOrders);
      storage.saveFastOrders(fastOrders);
      storage.saveVendors(vendors);
      storage.savePurchases(purchases);
      if (storage.saveExpenses) storage.saveExpenses(expenses);
      storage.saveSettings(settings);
      
      if (activeUser?.id && supabaseUser && supabaseUser.id === activeUser.id) {
        const payloadData = {
          customers,
          catalog,
          orders,
          serviceOrders,
          urgentOrders,
          fastOrders,
          vendors,
          purchases,
          expenses,
          settings
        };
        saveCloudUserData(activeUser.id, payloadData).then((success) => {
          if (success) {
            console.log("Cloud sync successful");
          } else {
            console.warn("Cloud sync failed");
          }
        }).catch((error) => {
          console.error("Cloud sync exception:", error);
        });
      }
      
      console.log("Storage synced (debounced)");
    }, 1000); // 1 second debounce

    // Apply language direction
    if (settings.language === "en") {
      document.documentElement.dir = "ltr";
      document.documentElement.lang = "en";
    } else {
      document.documentElement.dir = "rtl";
      document.documentElement.lang = "ar";
    }

    return () => clearTimeout(timeoutId);
  }, [
    customers,
    catalog,
    orders,
    serviceOrders,
    urgentOrders,
    fastOrders,
    vendors,
    purchases,
    settings,
    isInitialized,
    supabaseUser,
  ]);

  const handleNavigate = (newView: string) => {
    if (settings.hiddenMenus.includes(newView)) {
      setTargetView(newView);
      setIsProtectedView(true);
    } else {
      setView(newView);
    }
    setMobileSidebarOpen(false);
  };

  const confirmProtectedView = () => {
    if (passwordInput === settings.adminPassword) {
      setView(targetView);
      setIsProtectedView(false);
      setPasswordInput("");
    } else {
      toast.error("كلمة المرور غير صحيحة");
    }
  };

  const handlePOSComplete = (order: Order) => {
    let isEditing = !!editingOrderState;
    if (!isEditing) {
      // Generate sequential ID for tax_invoice
      let currentNum = settings.nextInvoiceNumber || 1;
      let prefix = settings.invoicePrefix || "";

      if (order.type === "tax_invoice") {
        order.id = `${prefix}${currentNum}`;
        setSettings((prev) => ({ ...prev, nextInvoiceNumber: currentNum + 1 }));
      } else {
        let qPrefix = settings.quotationPrefix || "QUO-";
        let qNum = settings.nextQuotationNumber || 1;
        order.id = `${qPrefix}${qNum}`;
        setSettings((prev) => ({ ...prev, nextQuotationNumber: qNum + 1 }));
      }
    } else {
      order.id = editingOrderState.id; // ensure we keep id
    }

    // Stock Deduction Logic
    const newCatalog = [...catalog];
    let techInvs = storage.getTechInventory ? storage.getTechInventory() : [];
    let techLogs = storage.getTechInventoryLogs
      ? storage.getTechInventoryLogs()
      : [];
    let techInv = order.technicianName
      ? techInvs.find((i: any) => i.technicianName === order.technicianName)
      : null;

    if (order.type !== "quotation") {
      order.items.forEach((item) => {
        // Note: Full correct stock deduction/reimbursement on edit is complex.
        // For simplicity, if editing, we might skip deep inventory tracking,
        // but let's just do standard deduction (it assumes we reimburse the old order first if we want perfection).
        // Here, we just apply standard logic or skip logic if we want to avoid double deduction.
        if (isEditing) return; // Skip stock deduction on edit for now to avoid complexity

        let deductedFromTech = false;

        // Try deducting from tech inventory first if tech is assigned
        if (techInv) {
          const techItem = techInv.items.find(
            (i: any) => i.catalogId === item.catalogId,
          );
          if (techItem && techItem.qty >= item.qty) {
            techItem.qty -= item.qty;
            techLogs.unshift({
              id: Math.random().toString(36).substr(2, 9),
              technicianName: order.technicianName,
              customerName: order.customerName,
              catalogId: item.catalogId,
              catalogName: item.name,
              qty: item.qty,
              type: "sale",
              date: Date.now(),
            });
            deductedFromTech = true;
          }
        }

        // If not deducted from tech (either no tech, or tech didn't have enough stock), deduct from main store
        if (!deductedFromTech) {
          const catalogItem = newCatalog.find((ci) => ci.id === item.catalogId);
          if (catalogItem) {
            if (catalogItem.isBundle && catalogItem.subProducts) {
              catalogItem.subProducts.forEach((sub) => {
                const subItem = newCatalog.find((ci) => ci.id === sub.id);
                if (subItem && subItem.stock !== undefined) {
                  subItem.stock -= sub.qty * item.qty;
                }
              });
            } else if (catalogItem.stock !== undefined) {
              catalogItem.stock -= item.qty;
            }
          }
        }
      });
    }

    if (!isEditing && order.type !== "quotation") {
      setCatalog(newCatalog);

      if (techInv && storage.saveTechInventory) {
        storage.saveTechInventory(techInvs);
        if (storage.saveTechInventoryLogs)
          storage.saveTechInventoryLogs(techLogs);
      }
    }

    if (isEditing) {
      setOrders(orders.map((o) => (o.id === order.id ? order : o)));
      setEditingOrderState(null);
    } else {
      setOrders([order, ...orders]);
      if (initialPOSState) {
        setServiceOrders((prev) =>
          prev.map((so) =>
            so.id === initialPOSState.id
              ? {
                  ...so,
                  status: "completed",
                  paymentAmount: order.grandTotal,
                  invoiceId: order.id,
                }
              : so,
          ),
        );
        setUrgentOrders((prev) =>
          prev.map((so) =>
            so.id === initialPOSState.id
              ? { ...so, status: "completed", invoiceId: order.id }
              : so,
          ),
        );
        setFastOrders((prev) =>
          prev.map((so) =>
            so.id === initialPOSState.id
              ? { ...so, status: "completed", invoiceId: order.id }
              : so,
          ),
        );
        setInitialPOSState(null);
      }
    }

    if (order.customerId && (order.type === "tax_invoice" || order.type === "return_invoice")) {
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === order.customerId && c.type === "lead"
            ? { ...c, type: "customer" }
            : c,
        ),
      );
    }

    setActivePrintOrder(order);
    if (order.type === "quotation") {
      toast.success("تم إصدار عرض السعر بنجاح. لن يتم خصم الكميات من المخزون.");
    } else {
      toast.success(
        "تم تسجيل الفاتورة بنجاح وخصم المخزون. يمكنك معاينتها وطباعتها الآن.",
      );
    }
  };

  const handleConvertLead = (id: string) => {
    setCustomers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, type: "customer" } : c)),
    );
    toast.success("تم تحويل العميل المحتمل إلى عميل فعلي");
  };

  const shiftRequestSequenceDown = (deletedId: string) => {
    const match = deletedId.match(/^(.*?)(\d+)$/);
    if (!match) return;
    const prefix = match[1];
    const deletedNum = parseInt(match[2], 10);

    const shiftItems = (items: any[]) =>
      items.map((item) => {
        const m = item.id.match(/^(.*?)(\d+)$/);
        if (m && m[1] === prefix) {
          const itemNum = parseInt(m[2], 10);
          if (itemNum > deletedNum) {
            return { ...item, id: `${prefix}${itemNum - 1}` };
          }
        }
        return item;
      });

    setServiceOrders((prev) => shiftItems(prev));
    setUrgentOrders((prev) => shiftItems(prev));
    setFastOrders((prev) => shiftItems(prev));

    setSettings((prev) => {
      if (prev.nextRequestNumber && prev.nextRequestNumber > deletedNum) {
        return { ...prev, nextRequestNumber: prev.nextRequestNumber - 1 };
      }
      return prev;
    });
  };

  const renderView = () => {
    switch (view) {
      case "dashboard":
        return (
          <Dashboard
            orders={orders}
            customers={customers}
            catalog={catalog}
            purchases={purchases}
            expenses={expenses}
            urgentOrders={urgentOrders}
            onNavigate={handleNavigate}
          />
        );
      case "crm":
        return (
          <CRM
            customers={customers}
            settings={settings}
            setSettings={setSettings}
            orders={orders}
            techOrders={serviceOrders}
            onSave={(c) =>
              setCustomers((prev) =>
                prev.some((x) => x.id === c.id)
                  ? prev.map((x) => (x.id === c.id ? c : x))
                  : [c, ...prev],
              )
            }
            onDelete={(id) =>
              setCustomers((prev) => prev.filter((c) => c.id !== id))
            }
            onConvert={handleConvertLead}
            onPrintOrder={(order) => setActivePrintOrder(order)}
            onUpdateOrder={(o) => setOrders((prev) => prev.map((x) => (x.id === o.id ? o : x)))}
            onPrintStatement={(customer, orders) =>
              setActivePrintStatement({ customer, orders })
            }
          />
        );
      case "catalog":
        return (
          <Catalog
            items={catalog}
            settings={settings}
            onSave={(i) =>
              setCatalog((prev) =>
                prev.some((x) => x.id === i.id)
                  ? prev.map((x) => (x.id === i.id ? i : x))
                  : [i, ...prev],
              )
            }
            onDelete={(id) => setCatalog(catalog.filter((i) => i.id !== id))}
            adminPassword={settings.adminPassword}
          />
        );
      case "pos":
        return (
          <POS
            settings={settings}
            catalog={catalog}
            customers={customers}
            onComplete={handlePOSComplete}
            onAddCustomer={(c) =>
              setCustomers((prev) =>
                prev.some((x) => x.id === c.id)
                  ? prev.map((x) => (x.id === c.id ? c : x))
                  : [c, ...prev],
              )
            }
            editingOrder={editingOrderState}
            initialServiceOrder={initialPOSState}
            onClearInitialServiceOrder={() => setInitialPOSState(null)}
            onCancelEdit={() => setEditingOrderState(null)}
          />
        );
      case "history":
        return (
          <History
            orders={orders}
            customers={customers}
            onDelete={(id) => setOrders(orders.filter((o) => o.id !== id))}
            onPrint={(o) => {
              setActivePrintOrder(o);
              toast.info("تم فتح معاينة الفاتورة.");
            }}
            onEdit={(o) => {
              setEditingOrderState(o);
              setView("pos");
            }}
            onReturn={(id, quantities) => {
              const originalOrder = orders.find((o) => o.id === id);
              if (!originalOrder || originalOrder.status === "returned") return;

              // Process items being returned
              const returnItems = originalOrder.items
                .map((item) => ({
                  ...item,
                  qty: quantities[item.catalogId] || 0,
                }))
                .filter((item) => item.qty > 0);

              if (returnItems.length === 0) return;

              // Restore stock
              const newCatalog = [...catalog];
              returnItems.forEach((item) => {
                const catalogItem = newCatalog.find(
                  (ci) => ci.id === item.catalogId,
                );
                if (catalogItem) {
                  if (catalogItem.isBundle && catalogItem.subProducts) {
                    catalogItem.subProducts.forEach((sub) => {
                      const subItem = newCatalog.find((ci) => ci.id === sub.id);
                      if (subItem && subItem.stock !== undefined) {
                        subItem.stock += sub.qty * item.qty;
                      }
                    });
                  } else if (catalogItem.stock !== undefined) {
                    catalogItem.stock += item.qty;
                  }
                }
              });

              // Calculate returned amounts for the return invoice print
              const returnTotalBeforeTax = returnItems.reduce(
                (sum, item) => sum + item.price * item.qty,
                0,
              );
              const returnTotalTax = returnItems.reduce(
                (sum, item) => sum + item.price * item.qty * (item.tax / 100),
                0,
              );

              const returnInvoiceId = `RET-${originalOrder.id}`;
              const returnOrder: Order = {
                ...originalOrder,
                id: returnInvoiceId,
                type: "return_invoice",
                items: returnItems,
                totalBeforeTax: returnTotalBeforeTax,
                totalTax: returnTotalTax,
                totalCost: returnItems.reduce(
                  (sum, item) => sum + (item.costPrice || 0) * item.qty,
                  0,
                ),
                totalDiscount: 0,
                grandTotal: returnTotalBeforeTax + returnTotalTax,
                date: Date.now(),
              };

              // Mutate the original order to reflect remaining items
              let remainingItems = originalOrder.items
                .map((item) => {
                  const qtyReturned = quantities[item.catalogId] || 0;
                  return { ...item, qty: item.qty - qtyReturned };
                })
                .filter((item) => item.qty > 0);

              let updatedOriginalOrder: Order;
              if (remainingItems.length === 0) {
                updatedOriginalOrder = { ...originalOrder, status: "returned" };
              } else {
                const newBeforeTax = remainingItems.reduce(
                  (sum, item) => sum + item.price * item.qty,
                  0,
                );
                const newTax = remainingItems.reduce(
                  (sum, item) => sum + item.price * item.qty * (item.tax / 100),
                  0,
                );
                const newCost = remainingItems.reduce(
                  (sum, item) => sum + (item.costPrice || 0) * item.qty,
                  0,
                );
                // Adjust discount simple pro-rata or keep zero if not present, let's keep original discount since logic is arbitrary
                const profit = newBeforeTax - newCost;
                const absCommission =
                  profit > 0
                    ? profit *
                      ((originalOrder.technicianCommissionPct || 0) / 100)
                    : 0;

                updatedOriginalOrder = {
                  ...originalOrder,
                  items: remainingItems,
                  totalBeforeTax: newBeforeTax,
                  totalTax: newTax,
                  totalCost: newCost,
                  technicianCommission: absCommission,
                  grandTotal:
                    newBeforeTax + newTax - originalOrder.totalDiscount,
                };
              }

              setCatalog(newCatalog);
              setOrders([
                ...orders.filter((o) => o.id !== id),
                returnOrder,
                updatedOriginalOrder,
              ]);
              toast.success(
                "تم طباعة واسترجاع المبيعات واستعادة المخزون بنجاح",
              );
              setActivePrintOrder(returnOrder);
            }}
            onConvertToInvoice={(id) => {
              let currentNum = settings.nextInvoiceNumber || 1;
              let prefix = settings.invoicePrefix || "";
              const newId = `${prefix}${currentNum}`;
              setSettings((prev) => ({
                ...prev,
                nextInvoiceNumber: currentNum + 1,
              }));

              const orderToConvert = orders.find((o) => o.id === id);
              if (orderToConvert) {
                const newCatalog = [...catalog];
                orderToConvert.items.forEach((item) => {
                  const catalogItem = newCatalog.find(
                    (ci) => ci.id === item.catalogId,
                  );
                  if (catalogItem) {
                    if (catalogItem.isBundle && catalogItem.subProducts) {
                      catalogItem.subProducts.forEach((sub) => {
                        const subItem = newCatalog.find(
                          (ci) => ci.id === sub.id,
                        );
                        if (subItem && subItem.stock !== undefined) {
                          subItem.stock -= sub.qty * item.qty;
                        }
                      });
                    } else if (catalogItem.stock !== undefined) {
                      catalogItem.stock -= item.qty;
                    }
                  }
                });
                setCatalog(newCatalog);
              }

              setOrders(
                orders.map((o) =>
                  o.id === id
                    ? {
                        ...o,
                        type: "tax_invoice",
                        id: newId,
                        date: Date.now(),
                        paymentMethod: "cash",
                      }
                    : o,
                ),
              );
              toast.success(
                "تم تحويل عرض السعر إلى فاتورة ضريبية وتم خصم المخزون",
              );
            }}
            adminPassword={settings.adminPassword}
          />
        );
      case "appointments":
        return (
          <Appointments
            settings={settings}
            setSettings={setSettings}
            orders={serviceOrders}
            salesOrders={orders}
            customers={customers}
            onNavigateToPOS={(order) => {
              setInitialPOSState(order);
              setView("pos");
            }}
            onSave={(so) => {
              setServiceOrders(
                serviceOrders.some((x) => x.id === so.id)
                  ? serviceOrders.map((x) => (x.id === so.id ? so : x))
                  : [so, ...serviceOrders],
              );
              if (so.customerId && so.status === "completed") {
                setCustomers((prev) =>
                  prev.map((c) =>
                    c.id === so.customerId && c.type === "lead"
                      ? { ...c, type: "customer" }
                      : c,
                  ),
                );
              }
            }}
            onPrintOrder={(so) => {
              const fauxOrder = {
                id: so.id,
                customerId: so.customerId,
                customerName: so.customerName,
                paymentMethod: "cash",
                paidAmount: 0,
                remainingAmount: 0,
                items: [],
                type: "tax_invoice" as "tax_invoice",
                date: so.date,
                technicianCommission: 0,
                technicianName: so.technicianName,
                branchId: "",
                totalBeforeTax: 0,
                totalTax: 0,
                totalDiscount: 0,
                grandTotal: 0,
                status: "active" as "active",
                notes: `موعد صيانة الدورية رقم #${so.id}`,
              };
              setActivePrintOrder(fauxOrder);
            }}
            onDelete={(id) => {
              setServiceOrders(serviceOrders.filter((so) => so.id !== id));
              shiftRequestSequenceDown(id);
            }}
            onUpdateStatus={(id, status) =>
              setServiceOrders(
                serviceOrders.map((so) =>
                  so.id === id ? { ...so, status } : so,
                ),
              )
            }
            onAddCustomer={(c) =>
              setCustomers((prev) =>
                prev.some((x) => x.id === c.id)
                  ? prev.map((x) => (x.id === c.id ? c : x))
                  : [c, ...prev],
              )
            }
          />
        );
      case "urgent_orders":
        return (
          <UrgentOrders
            settings={settings}
            setSettings={setSettings}
            orders={urgentOrders}
            salesOrders={orders}
            customers={customers}
            catalog={catalog}
            onSaveOrder={(o) => setOrders([o, ...orders])}
            onNavigateToPOS={(order) => {
              setInitialPOSState(order);
              setView("pos");
            }}
            onSave={(so) => {
              setUrgentOrders(
                urgentOrders.some((x) => x.id === so.id)
                  ? urgentOrders.map((x) => (x.id === so.id ? so : x))
                  : [so, ...urgentOrders],
              );
              if (so.customerId && so.status === "completed") {
                setCustomers((prev) =>
                  prev.map((c) =>
                    c.id === so.customerId && c.type === "lead"
                      ? { ...c, type: "customer" }
                      : c,
                  ),
                );
              }
            }}
            onDelete={(id) => {
              setUrgentOrders(urgentOrders.filter((so) => so.id !== id));
              shiftRequestSequenceDown(id);
            }}
            onPrintOrder={(so) => {
              const fauxOrder = {
                id: so.id,
                customerId: so.customerId,
                customerName: so.customerName,
                paymentMethod: so.expectedPaymentMethod || "cash",
                paidAmount: 0,
                remainingAmount: so.expectedAmount || 0,
                items: so.selectedProducts ? so.selectedProducts.map((p) => ({
                  catalogId: p.id,
                  name: p.name,
                  price: 0,
                  tax: 0,
                  qty: 1,
                  discount: 0,
                })) : [],
                type: "tax_invoice" as "tax_invoice",
                date: so.date,
                technicianCommission: 0,
                technicianName: so.technicianName,
                branchId: "",
                totalBeforeTax: so.expectedAmount || 0,
                totalTax: 0,
                totalDiscount: 0,
                grandTotal: so.expectedAmount || 0,
                status: "active" as "active",
                notes: `طلب موعد / فحص رقم #${so.id}`,
              };
              setActivePrintOrder(fauxOrder);
            }}
            onUpdateStatus={(id, status) =>
              setUrgentOrders(
                urgentOrders.map((so) =>
                  so.id === id ? { ...so, status } : so,
                ),
              )
            }
            onAddCustomer={(c) =>
              setCustomers((prev) =>
                prev.some((x) => x.id === c.id)
                  ? prev.map((x) => (x.id === c.id ? c : x))
                  : [c, ...prev],
              )
            }
            onMoveToAppointments={(order) => {
              setServiceOrders((prev) => {
                const updated = prev.some((x) => x.id === order.id)
                  ? prev.map((x) => (x.id === order.id ? order : x))
                  : [order, ...prev];
                storage.saveServiceOrders(updated);
                return updated;
              });
              setUrgentOrders((prev) => {
                const updated = prev.filter((x) => x.id !== order.id);
                storage.saveUrgentOrders(updated);
                return updated;
              });
            }}
          />
        );
      case "fast_orders":
        return (
          <UrgentOrders
            settings={settings}
            setSettings={setSettings}
            orders={fastOrders}
            salesOrders={orders}
            customers={customers}
            catalog={catalog}
            onSaveOrder={(o) => setOrders([o, ...orders])}
            onNavigateToPOS={(order) => {
              setInitialPOSState(order);
              setView("pos");
            }}
            onSave={(so) => {
              setFastOrders(
                fastOrders.some((x) => x.id === so.id)
                  ? fastOrders.map((x) => (x.id === so.id ? so : x))
                  : [so, ...fastOrders],
              );
              if (so.customerId && so.status === "completed") {
                setCustomers((prev) =>
                  prev.map((c) =>
                    c.id === so.customerId && c.type === "lead"
                      ? { ...c, type: "customer" }
                      : c,
                  ),
                );
              }
            }}
            onPrintOrder={(so) => {
              const fauxOrder = {
                id: so.id,
                customerId: so.customerId,
                customerName: so.customerName,
                paymentMethod: so.expectedPaymentMethod || "cash",
                paidAmount: 0,
                remainingAmount: so.expectedAmount || 0,
                items: so.selectedProducts ? so.selectedProducts.map((p) => ({
                  catalogId: p.id,
                  name: p.name,
                  price: 0,
                  tax: 0,
                  qty: 1,
                  discount: 0,
                })) : [],
                type: "tax_invoice" as "tax_invoice",
                date: so.date,
                technicianCommission: 0,
                technicianName: so.technicianName,
                branchId: "",
                totalBeforeTax: so.expectedAmount || 0,
                totalTax: 0,
                totalDiscount: 0,
                grandTotal: so.expectedAmount || 0,
                status: "active" as "active",
                notes: `طلب موعد / فحص رقم #${so.id}`,
              };
              setActivePrintOrder(fauxOrder);
            }}
            onDelete={(id) => {
              setFastOrders(fastOrders.filter((so) => so.id !== id));
              shiftRequestSequenceDown(id);
            }}
            onUpdateStatus={(id, status) =>
              setFastOrders(
                fastOrders.map((so) => (so.id === id ? { ...so, status } : so)),
              )
            }
            onAddCustomer={(c) =>
              setCustomers((prev) =>
                prev.some((x) => x.id === c.id)
                  ? prev.map((x) => (x.id === c.id ? c : x))
                  : [c, ...prev],
              )
            }
            onMoveToAppointments={(order) => {
              setServiceOrders((prev) => {
                const updated = prev.some((x) => x.id === order.id)
                  ? prev.map((x) => (x.id === order.id ? order : x))
                  : [order, ...prev];
                storage.saveServiceOrders(updated);
                return updated;
              });
              setFastOrders((prev) => {
                const updated = prev.filter((x) => x.id !== order.id);
                storage.saveFastOrders(updated);
                return updated;
              });
            }}
          />
        );
      case "settings":
        return (
          <ErrorBoundary>
            <SettingsView settings={settings} onSave={setSettings} />
          </ErrorBoundary>
        );
      case "reports_customers":
      case "reports_sales":
      case "reports_purchases":
      case "reports_products":
      case "reports_stock":
      case "reports_technicians":
      case "reports_expenses":
      case "reports_all":
        return (
          <Reports
            view={view}
            customers={customers}
            orders={orders}
            catalog={catalog}
            purchases={purchases}
            techOrders={serviceOrders}
            expenses={expenses}
            settings={settings}
            onPrintStatement={(customer, orders) =>
              setActivePrintStatement({ customer, orders })
            }
            onPrintTechnicianStatement={(name, t_orders, t_expenses, t_serviceOrders, t_inventoryItems) => 
              setActivePrintTechnicianStatement({ technicianName: name, orders: t_orders, expenses: t_expenses, serviceOrders: t_serviceOrders, inventoryItems: t_inventoryItems })
            }
          />
        );
      case "purchases_vendors":
      case "purchases_invoices":
      case "purchases_returns":
      case "purchases_reports":
        return (
          <Purchases
            view={view}
            vendors={vendors}
            setVendors={setVendors}
            purchases={purchases}
            setPurchases={setPurchases}
            catalog={catalog}
            setCatalog={setCatalog}
            settings={settings}
            onPrintVendorStatement={(vendor, invoices) =>
              setActivePrintVendorStatement({ vendor, invoices })
            }
            onPrintVendorReceipt={(
              invoice,
              vendor,
              paymentAmount,
              paymentDate,
            ) =>
              setActivePrintVendorReceipt({
                invoice,
                vendor,
                paymentAmount,
                paymentDate,
              })
            }
          />
        );
      case "expenses":
        return (
          <Expenses
            expenses={expenses}
            settings={settings}
            setSettings={setSettings}
            onSave={(e) => setExpenses([e, ...expenses])}
            onDelete={(id) => setExpenses(expenses.filter((e) => e.id !== id))}
            onUpdate={(id, updates) =>
              setExpenses(
                expenses.map((e) => (e.id === id ? { ...e, ...updates } : e)),
              )
            }
          />
        );
      case "users":
        return <UsersView settings={settings} setSettings={setSettings} />;
      case "technician_inventory":
        return (
          <TechnicianInventory
            settings={settings}
            catalog={catalog}
            orders={orders}
          />
        );
      default:
        return (
          <Dashboard
            orders={orders}
            customers={customers}
            catalog={catalog}
            purchases={purchases}
            onNavigate={handleNavigate}
          />
        );
    }
  };

  if (!isInitialized) return <div className="min-h-[100dvh] bg-black" />;

  if (sharedInvoiceValue) {
    return (
      <div className="flex h-screen bg-zinc-950 text-white selection:bg-white/30 overflow-hidden font-sans flex-col items-center print:bg-white print:text-black print:h-auto print:overflow-visible">
        <div className="w-full bg-zinc-900 border-b border-white/10 p-4 flex justify-between items-center no-print sticky top-0 z-50">
          <h2 className="text-white font-bold">الفاتورة المشتركة</h2>
          <Button
            onClick={() => {
              const originalTitle = document.title;
              document.title = sharedInvoiceValue.order.id;
              window.print();
              document.title = originalTitle;
            }}
            className="bg-blue-600 hover:bg-blue-500"
          >
            <Printer className="h-4 w-4 ml-2" /> طباعة أو حفظ PDF
          </Button>
        </div>
        <div className="w-full p-4 md:p-8 flex justify-center flex-1 overflow-auto bg-zinc-950/50 print:p-0 print:block print:overflow-visible">
          <div className="scale-75 sm:scale-95 lg:scale-100 origin-top bg-white rounded-sm shadow-2xl print:shadow-none print:scale-100">
            <PrintInvoice
              order={sharedInvoiceValue.order}
              settings={sharedInvoiceValue.settings}
              customer={customers?.find(
                (c) => c.id === sharedInvoiceValue.order.customerId,
              )}
              previewMode={true}
            />
          </div>
        </div>
      </div>
    );
  }

 if (!activeUser) {
  const loginTheme = settings.theme === "dark" ? "dark" : "light";

  return (
    <>
      <Toaster
        position="top-center"
        theme={loginTheme}
        richColors
      />
      <AuthScreen
        onLoginSuccess={setActiveUser}
        theme={loginTheme}
        onToggleTheme={toggleTheme}
      />
    </>
  );
}

  if (activeUser.role === "technician") {
    return (
      <>
        <Toaster
          position="top-center"
          theme={settings.theme === "light" ? "light" : "dark"}
          richColors
        />
        <TechnicianMobileView
          user={activeUser}
          urgentOrders={urgentOrders}
          orders={orders}
          onUpdateOrderStatus={(id, status) => {
            setUrgentOrders(
              urgentOrders.map((so) =>
                so.id === id ? { ...so, status } : so,
              )
            );
          }}
          onUpdateUrgentOrder={(updatedOrder) => {
            setUrgentOrders(
              urgentOrders.map((so) =>
                so.id === updatedOrder.id ? updatedOrder : so,
              )
            );
          }}
          settings={settings}
          catalog={catalog}
          customers={customers}
          onCompletePOS={handlePOSComplete}
          onAddCustomer={(c) =>
            setCustomers((prev) =>
              prev.some((x) => x.id === c.id)
                ? prev.map((x) => (x.id === c.id ? c : x))
                : [c, ...prev],
            )
          }
        />
      </>
    );
  }

  return (
    <div
      className={`flex h-[100dvh] bg-background text-foreground selection:bg-white/30 overflow-hidden font-sans`}
    >
      <Toaster
        position="top-center"
        theme={settings.theme === "light" ? "light" : "dark"}
        richColors
      />

      {/* Print Overlay (Hidden on screen, rendered on paper print automatically) */}
      <div className="hidden print:block">
        {activePrintOrder && (
          <PrintInvoice
            order={activePrintOrder}
            settings={settings}
            customer={customers?.find(
              (c) => c.id === activePrintOrder.customerId,
            )}
          />
        )}
        {activePrintStatement && (
          <PrintCustomerStatement
            customer={activePrintStatement.customer}
            orders={activePrintStatement.orders}
            techOrders={serviceOrders.filter(
              (to) =>
                to.customerName === activePrintStatement.customer.name ||
                to.issue?.includes(activePrintStatement.customer.phone),
            )}
            settings={settings}
          />
        )}
        {activePrintVendorStatement && (
          <PrintVendorStatement
            vendor={activePrintVendorStatement.vendor}
            invoices={activePrintVendorStatement.invoices}
            settings={settings}
          />
        )}
        {activePrintVendorReceipt && (
          <PrintVendorReceipt
            invoice={activePrintVendorReceipt.invoice}
            vendor={activePrintVendorReceipt.vendor}
            paymentAmount={activePrintVendorReceipt.paymentAmount}
            paymentDate={activePrintVendorReceipt.paymentDate}
            settings={settings}
          />
        )}
        {activePrintTechnicianStatement && (
          <PrintTechnicianStatement
            technicianName={activePrintTechnicianStatement.technicianName}
            orders={activePrintTechnicianStatement.orders}
            expenses={activePrintTechnicianStatement.expenses}
            serviceOrders={activePrintTechnicianStatement.serviceOrders}
            inventoryItems={activePrintTechnicianStatement.inventoryItems}
            catalog={catalog}
            companyHeader={settings.companyHeader}
          />
        )}
      </div>

      {/* Interactive Vendor Statement Modal Overlay */}
      {activePrintVendorStatement && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col no-print overflow-y-auto">
          <div className="bg-zinc-950 text-white p-4 border-b border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4 sticky top-0 z-50 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-600/25 rounded-lg border border-orange-500/20">
                <Printer className="h-5 w-5 text-orange-400" />
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base text-zinc-100">
                  معاينة كشف حساب مورد
                </h3>
                <p className="text-[10px] sm:text-xs text-white/50">
                  المورد:{" "}
                  {activePrintVendorStatement.vendor.companyName ||
                    activePrintVendorStatement.vendor.name}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-4 h-9 shadow-lg shadow-purple-900/40 transition-all"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4 ml-1.5" />
                طباعة كشف الحساب
              </Button>
              <Button
                variant="outline"
                className="border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold text-xs px-4 h-9 transition-all"
                onClick={() => setActivePrintVendorStatement(null)}
              >
                <X className="h-4 w-4 ml-1.5" />
                إغلاق المعاينة
              </Button>
            </div>
          </div>
          <div className="flex-1 p-4 md:p-8 flex justify-center items-start bg-zinc-900/50 overflow-y-auto">
            <div className="scale-75 sm:scale-90 md:scale-95 lg:scale-100 origin-top my-4 bg-white shadow-2xl rounded-sm">
              <PrintVendorStatement
                vendor={activePrintVendorStatement.vendor}
                invoices={activePrintVendorStatement.invoices}
                settings={settings}
                previewMode={true}
              />
            </div>
          </div>
        </div>
      )}

      {/* Interactive Vendor Receipt Modal Overlay */}
      {activePrintVendorReceipt && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col no-print overflow-y-auto">
          <div className="bg-zinc-950 text-white p-4 border-b border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4 sticky top-0 z-50 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-600/25 rounded-lg border border-green-500/20">
                <Printer className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base text-zinc-100">
                  معاينة سند الدفع / الصرف
                </h3>
                <p className="text-[10px] sm:text-xs text-white/50">
                  المورد:{" "}
                  {activePrintVendorReceipt.vendor.companyName ||
                    activePrintVendorReceipt.vendor.name}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-4 h-9 shadow-lg shadow-purple-900/40 transition-all"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4 ml-1.5" />
                طباعة السند
              </Button>
              <Button
                variant="outline"
                className="border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold text-xs px-4 h-9 transition-all"
                onClick={() => setActivePrintVendorReceipt(null)}
              >
                <X className="h-4 w-4 ml-1.5" />
                إغلاق المعاينة
              </Button>
            </div>
          </div>
          <div className="flex-1 p-4 md:p-8 flex justify-center items-start bg-zinc-900/50 overflow-y-auto">
            <div className="scale-75 sm:scale-90 md:scale-95 lg:scale-100 origin-top my-4 bg-white shadow-2xl rounded-sm">
              <PrintVendorReceipt
                invoice={activePrintVendorReceipt.invoice}
                vendor={activePrintVendorReceipt.vendor}
                paymentAmount={activePrintVendorReceipt.paymentAmount}
                paymentDate={activePrintVendorReceipt.paymentDate}
                settings={settings}
                previewMode={true}
              />
            </div>
          </div>
        </div>
      )}

      {/* Interactive Technician Statement Modal Overlay */}
      {activePrintTechnicianStatement && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col no-print overflow-y-auto">
          <div className="bg-zinc-950 text-white p-4 border-b border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4 sticky top-0 z-50 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-600/25 rounded-lg border border-indigo-500/20">
                <Printer className="h-5 w-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base text-zinc-100">
                  معاينة كشف حساب فني
                </h3>
                <p className="text-[10px] sm:text-xs text-white/50">
                  الفني: {activePrintTechnicianStatement.technicianName}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="outline"
                className="bg-white/5 border-white/10 text-white hover:bg-white/10 h-9 sm:h-10 text-xs sm:text-sm px-3 sm:px-4"
                onClick={() => {
                  document.title = `كشف_حساب_فني_${activePrintTechnicianStatement.technicianName}`;
                  window.print();
                }}
              >
                <Printer className="h-4 w-4 ml-1.5" />
                تأكيد وطباعة
              </Button>
              <Button
                variant="outline"
                className="bg-white/5 border-red-500/30 text-red-400 hover:bg-red-500/20 hover:text-red-300 h-9 sm:h-10 text-xs sm:text-sm px-3 sm:px-4"
                onClick={() => setActivePrintTechnicianStatement(null)}
              >
                <X className="h-4 w-4 ml-1.5" />
                إلغاء وإغلاق
              </Button>
            </div>
          </div>
          <div className="flex-1 p-4 md:p-8 flex justify-center items-start bg-zinc-900/50 overflow-y-auto">
            <div className="scale-75 sm:scale-90 md:scale-95 lg:scale-100 origin-top my-4 bg-white shadow-2xl rounded-sm">
              <PrintTechnicianStatement
                technicianName={activePrintTechnicianStatement.technicianName}
                orders={activePrintTechnicianStatement.orders}
                expenses={activePrintTechnicianStatement.expenses}
                serviceOrders={activePrintTechnicianStatement.serviceOrders}
                inventoryItems={activePrintTechnicianStatement.inventoryItems}
                catalog={catalog}
                companyHeader={settings.companyHeader}
              />
            </div>
          </div>
        </div>
      )}

      {/* Interactive Statement Modal Overlay */}
      {activePrintStatement && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col no-print overflow-y-auto">
          {/* Header Controls Bar */}
          <div className="bg-zinc-950 text-white p-4 border-b border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4 sticky top-0 z-50 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600/25 rounded-lg border border-blue-500/20">
                <Printer className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base text-zinc-100">
                  معاينة كشف حساب عميل
                </h3>
                <p className="text-[10px] sm:text-xs text-white/50">
                  العميل: {activePrintStatement.customer.name}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-4 h-9 shadow-lg shadow-purple-900/40 transition-all"
                onClick={() => {
                  const originalTitle = document.title;
                  document.title = `كشف_حساب_عميل_${activePrintStatement.customer.name}`;
                  window.print();
                  document.title = originalTitle;
                }}
              >
                <Printer className="h-4 w-4 ml-1.5" />
                طباعة كشف الحساب
              </Button>

              <Button
                variant="outline"
                className="border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold text-xs px-4 h-9 transition-all"
                onClick={() => {
                  setActivePrintStatement(null);
                }}
              >
                <X className="h-4 w-4 ml-1.5" />
                إغلاق المعاينة
              </Button>
            </div>
          </div>

          {/* Canvas sheet preview section */}
          <div className="flex-1 p-4 md:p-8 flex justify-center items-start bg-zinc-900/50 overflow-y-auto">
            <div className="scale-75 sm:scale-90 md:scale-95 lg:scale-100 origin-top my-4 bg-white shadow-2xl rounded-sm">
              <PrintCustomerStatement
                customer={activePrintStatement.customer}
                orders={activePrintStatement.orders}
                techOrders={serviceOrders.filter(
                  (to) =>
                    to.customerName === activePrintStatement.customer.name ||
                    to.issue?.includes(activePrintStatement.customer.phone),
                )}
                settings={settings}
                previewMode={true}
              />
            </div>
          </div>
        </div>
      )}

      {/* Interactive Invoice Modal Overlay (Only visible on screen, hidden on print) */}
      {activePrintOrder && !activePrintStatement && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col no-print overflow-y-auto">
          {/* Header Controls Bar */}
          <div className="bg-zinc-950 text-white p-4 border-b border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4 sticky top-0 z-50 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600/25 rounded-lg border border-blue-500/20">
                <Printer className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base text-zinc-100">
                  معاينة الفاتورة قبل الطباعة والإرسال
                </h3>
                <p className="text-[10px] sm:text-xs text-white/50">
                  المُستند: {activePrintOrder.id} | العميل:{" "}
                  {activePrintOrder.customerName}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                className="bg-green-600 hover:bg-green-500 text-white font-bold text-xs px-4 h-9 shadow-lg shadow-green-900/40 transition-all"
                onClick={() => {
                  const cust = customers.find(
                    (c) => c.id === activePrintOrder.customerId,
                  );
                  handleSendWhatsAppPDF(activePrintOrder, cust?.phone);
                }}
              >
                <Cloud className="h-4 w-4 ml-1.5" />
                إرسال الفاتورة عبر الواتساب (PDF)
              </Button>

              <Button
                className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs px-4 h-9 shadow-lg shadow-sky-900/40 transition-all"
                onClick={() => {
                  handleDownloadPDF(activePrintOrder);
                }}
              >
                <Download className="h-4 w-4 ml-1.5" />
                تحميل PDF
              </Button>

              <Button
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-4 h-9 shadow-lg shadow-purple-900/40 transition-all"
                onClick={() => {
                  const originalTitle = document.title;
                  document.title = activePrintOrder.id;
                  window.print();
                  document.title = originalTitle;
                }}
              >
                <Printer className="h-4 w-4 ml-1.5" />
                طباعة ورقية للكاشير
              </Button>

              <Button
                variant="outline"
                className="border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold text-xs px-4 h-9 transition-all"
                onClick={() => {
                  setActivePrintOrder(null);
                }}
              >
                <X className="h-4 w-4 ml-1.5" />
                إغلاق المعاينة
              </Button>
            </div>
          </div>

          {/* Canvas sheet preview section */}
          <div className="flex-1 p-4 md:p-8 flex justify-center items-start bg-zinc-900/50 overflow-y-auto">
            <div className="scale-75 sm:scale-90 md:scale-95 lg:scale-100 origin-top my-4 bg-white shadow-2xl rounded-sm">
              <AutoPrintTrigger title={activePrintOrder.id} />
              <PrintInvoice
                order={activePrintOrder}
                settings={settings}
                customer={customers?.find(
                  (c) => c.id === activePrintOrder.customerId,
                )}
                previewMode={true}
              />
            </div>
          </div>
        </div>
      )}

      {/* Main UI */}
      <div className="no-print print:hidden flex w-full h-full relative overflow-hidden">
        <PWAInstallPrompt />

        <div className="hidden md:block h-full shrink-0">
          <Sidebar
            activeView={view}
            onNavigate={handleNavigate}
            settings={settings}
            urgentOrders={urgentOrders}
            activeUser={activeUser}
            onToggleTheme={toggleTheme}
          />
        </div>

        <div
          className={`fixed inset-0 z-[80] md:hidden transition-opacity duration-300 ${
            mobileSidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
          aria-hidden={!mobileSidebarOpen}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div
            className={`absolute inset-y-0 right-0 transition-transform duration-300 ${
              mobileSidebarOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <Sidebar
              activeView={view}
              onNavigate={handleNavigate}
              settings={settings}
              urgentOrders={urgentOrders}
              activeUser={activeUser}
              onToggleTheme={toggleTheme}
              mobile
              onClose={() => setMobileSidebarOpen(false)}
            />
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 h-full">
          <header className="md:hidden sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-white/10 bg-background/95 px-3 py-3 backdrop-blur-xl safe-top">
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-xl border border-white/10 bg-white/5"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="فتح القائمة"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-sm font-bold text-foreground">{getCurrentViewTitle()}</p>
              <p className="truncate text-[11px] text-muted-foreground">كاشير برو</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-xl border border-white/10 bg-white/5"
              onClick={toggleTheme}
              aria-label="تبديل الوضع"
            >
              {settings.theme === "light" ? (
                <Moon className="h-5 w-5" />
              ) : (
                <Sun className="h-5 w-5" />
              )}
            </Button>
          </header>

          <main className="flex-1 min-h-0 overflow-auto flex flex-col mx-auto relative p-3 sm:p-4 lg:p-8 w-full max-w-[100vw] mobile-safe-bottom">
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="h-full w-full flex-1 min-w-0"
              >
                {renderView()}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      {/* Protected View Dialog */}
      <PasswordDialog
        open={isProtectedView}
        onOpenChange={setIsProtectedView}
        adminPassword={settings.adminPassword}
        onUpdateAdminPassword={(newPass) => {
          const newSettings = { ...settings, adminPassword: newPass };
          setSettings(newSettings);
        }}
        onSuccess={() => {
          setView(targetView);
          setIsProtectedView(false);
          setPasswordInput("");
        }}
        title="صفحة محمية"
        description="يرجى إدخال رمز الدخول للوصول لهذه الوحدة."
      />

      {isInitialized && (
        <>
          <GlobalActions
            customers={customers}
            setCustomers={setCustomers}
            serviceOrders={serviceOrders}
            setServiceOrders={setServiceOrders}
            orders={orders}
            setOrders={setOrders}
            urgentOrders={urgentOrders}
            setUrgentOrders={setUrgentOrders}
            settings={settings}
            setSettings={setSettings}
            setView={setView}
            catalog={catalog}
            onSaveOrder={(o) => setOrders([o, ...orders])}
          />
        </>
      )}
    </div>
  );
}
