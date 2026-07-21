import React, { useState, useMemo } from "react";
import {
  Customer,
  CatalogItem,
  AppSettings,
  Vendor,
  PurchaseInvoice,
  PurchaseInvoiceItem,
} from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UserCog,
  FileText,
  Undo2,
  Plus,
  Trash2,
  Search,
  ArrowRightLeft,
  PackageCheck,
  Coins,
  TrendingUp,
  TrendingDown,
  Scale,
  Receipt,
  Printer,
  Check,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PurchasesProps {
  view: string;
  vendors: Vendor[];
  setVendors: (vendors: Vendor[]) => void;
  purchases: PurchaseInvoice[];
  setPurchases: (purchases: PurchaseInvoice[]) => void;
  catalog: CatalogItem[];
  setCatalog: (catalog: CatalogItem[]) => void;
  settings: AppSettings;
  onPrintVendorStatement?: (
    vendor: Vendor,
    invoices: PurchaseInvoice[],
  ) => void;
  onPrintVendorReceipt?: (
    invoice: PurchaseInvoice,
    vendor: Vendor,
    amount: number,
    date: number,
  ) => void;
}

export default function Purchases({
  view,
  vendors,
  setVendors,
  purchases,
  setPurchases,
  catalog,
  setCatalog,
  settings,
  onPrintVendorStatement,
  onPrintVendorReceipt,
}: PurchasesProps) {
  // -- VENDORS --
  const [searchTermVendor, setSearchTermVendor] = useState("");
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [newVendor, setNewVendor] = useState<Partial<Vendor>>({});

  const [paymentDialogInvoice, setPaymentDialogInvoice] =
    useState<PurchaseInvoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");

  const filteredVendors = vendors.filter((v) => {
    const s = searchTermVendor.toLowerCase();
    return (
      v.name.toLowerCase().includes(s) ||
      v.phone.includes(searchTermVendor) ||
      (v.companyName && v.companyName.toLowerCase().includes(s))
    );
  });

  const handleSaveVendor = () => {
    if (!newVendor.name || !newVendor.phone) {
      toast.error("الرجاء إدخال اسم ورقم جوال المورد");
      return;
    }
    const vendor: Vendor = {
      id: Math.random().toString(36).substr(2, 9),
      name: newVendor.name,
      phone: newVendor.phone,
      taxNumber: newVendor.taxNumber,
      companyName: newVendor.companyName,
      address: newVendor.address,
      createdAt: Date.now(),
    };
    setVendors([vendor, ...vendors]);
    setShowAddVendor(false);
    setNewVendor({});
    toast.success("تمت إضافة المورد بنجاح");
  };

  const handleProcessPayment = () => {
    if (!paymentDialogInvoice) return;
    const amt = parseFloat(paymentAmount);
    if (!amt || isNaN(amt) || amt <= 0) {
      toast.error("مبلغ غير صحيح");
      return;
    }
    if (amt > (paymentDialogInvoice.remainingAmount || 0)) {
      toast.error("المبلغ المدفوع أكبر من المتبقي");
      return;
    }
    // Update invoice
    const updatedInvoice: PurchaseInvoice = {
      ...paymentDialogInvoice,
      paidAmount: (paymentDialogInvoice.paidAmount || 0) + amt,
      remainingAmount: (paymentDialogInvoice.remainingAmount || 0) - amt,
      paymentMethod: ((paymentDialogInvoice.paidAmount || 0) + amt ===
      paymentDialogInvoice.grandTotal
        ? "cash"
        : "partial") as "cash" | "partial",
    };

    setPurchases(
      purchases.map((p) => (p.id === updatedInvoice.id ? updatedInvoice : p)),
    );
    toast.success("تم الدفع بنجاح");

    // Print receipt
    const vendor = vendors.find((v) => v.id === updatedInvoice.vendorId);
    if (vendor && onPrintVendorReceipt) {
      onPrintVendorReceipt(updatedInvoice, vendor, amt, Date.now());
    }

    setPaymentDialogInvoice(null);
    setPaymentAmount("");
  };

  // -- INVOICES (PURCHASE & RETURN) --
  const isReturn = view === "purchases_returns";
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [vendorId, setVendorId] = useState<string>("");
  const [invoiceItems, setInvoiceItems] = useState<PurchaseInvoiceItem[]>([]);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "transfer" | "partial"
  >("cash");
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [catSearch, setCatSearch] = useState("");
  const [chartMetric, setChartMetric] = useState<
    "gross" | "net" | "returns" | "count"
  >("gross");

  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProduct, setNewProduct] = useState<Partial<CatalogItem>>({
    type: "product",
    tax: settings?.defaultTaxRate ?? 15,
  });

  const handleSaveProduct = () => {
    if (!newProduct.name) {
      toast.error("الرجاء إدخال اسم المنتج");
      return;
    }
    const item: CatalogItem = {
      id: Math.random().toString(36).substr(2, 9),
      name: newProduct.name,
      type: newProduct.type as "product" | "service",
      price: newProduct.price || 0,
      costPrice: newProduct.costPrice || 0,
      tax: newProduct.tax ?? settings?.defaultTaxRate ?? 15,
      sku: newProduct.sku,
      category: newProduct.category,
      vendor: newProduct.vendor,
      stock: 0,
      isBundle: false,
    };

    setCatalog([...catalog, item]);
    addItemToInvoice(item);
    setShowAddProduct(false);
    setNewProduct({
      type: "product",
      tax: settings?.defaultTaxRate ?? 15,
    });
    setCatSearch("");
    toast.success("تمت إضافة المنتج بنجاح وإدراجه في الفاتورة");
  };

  const filteredCatalog = catalog.filter((c) => {
    const s = catSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(s) ||
      (c.sku && c.sku.toLowerCase().includes(s)) ||
      (c.category && c.category.toLowerCase().includes(s)) ||
      (c.vendor && c.vendor.toLowerCase().includes(s))
    );
  });

  const addItemToInvoice = (item: CatalogItem) => {
    setInvoiceItems((prev) => {
      const exists = prev.find((i) => i.catalogId === item.id);
      if (exists) {
        return prev.map((i) =>
          i.catalogId === item.id ? { ...i, qty: i.qty + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          catalogId: item.id,
          name: item.name,
          costPrice: item.costPrice || 0,
          qty: 1,
          tax: item.tax ?? settings.defaultTaxRate ?? 15,
        },
      ];
    });
  };

  const updateInvoiceItem = (
    catalogId: string,
    field: keyof PurchaseInvoiceItem,
    value: number,
  ) => {
    setInvoiceItems((prev) =>
      prev.map((i) =>
        i.catalogId === catalogId ? { ...i, [field]: value } : i,
      ),
    );
  };

  const removeInvoiceItem = (catalogId: string) => {
    setInvoiceItems((prev) => prev.filter((i) => i.catalogId !== catalogId));
  };

  const totals = useMemo(() => {
    return invoiceItems.reduce(
      (acc, item) => {
        const totalItemCost = item.costPrice * item.qty;
        const totalItemTax = totalItemCost * (item.tax / 100);
        return {
          beforeTax: acc.beforeTax + totalItemCost,
          tax: acc.tax + totalItemTax,
          grandTotal: acc.grandTotal + totalItemCost + totalItemTax,
        };
      },
      { beforeTax: 0, tax: 0, grandTotal: 0 },
    );
  }, [invoiceItems]);

  const handleCompleteInvoice = () => {
    if (!vendorId) {
      toast.error("الرجاء اختيار المورد");
      return;
    }
    if (invoiceItems.length === 0) {
      toast.error("الفاتورة فارغة");
      return;
    }

    const vendor = vendors.find((v) => v.id === vendorId);

    const invoice: PurchaseInvoice = {
      id: Math.random().toString(36).substr(2, 9),
      vendorId: vendorId,
      vendorName: vendor?.name || "",
      items: invoiceItems,
      date: Date.now(),
      totalBeforeTax: totals.beforeTax,
      totalTax: totals.tax,
      grandTotal: totals.grandTotal,
      type: isReturn ? "return" : "purchase",
      referenceNumber,
      notes,
      paymentMethod,
      paidAmount: paymentMethod === "partial" ? paidAmount : totals.grandTotal,
      remainingAmount:
        paymentMethod === "partial" ? totals.grandTotal - paidAmount : 0,
    };

    setPurchases([invoice, ...purchases]);

    // Update catalog stock and cost prices
    const newCatalog = catalog.map((c) => {
      const invItem = invoiceItems.find((i) => i.catalogId === c.id);
      if (invItem) {
        let newStock = c.stock || 0;
        let newCost = c.costPrice;

        if (isReturn) {
          newStock -= invItem.qty;
          // usually dont recalculate cost price on returns, or could be complex.
        } else {
          newStock += invItem.qty;
          // simple moving average for cost price if buying new
          // newCost = ((c.stock * c.costPrice) + (invItem.qty * invItem.costPrice)) / newStock
          if (c.stock && c.costPrice && newStock > 0) {
            newCost =
              (c.stock * c.costPrice + invItem.qty * invItem.costPrice) /
              newStock;
          } else {
            newCost = invItem.costPrice;
          }
        }
        return { ...c, stock: newStock, costPrice: newCost };
      }
      return c;
    });

    setCatalog(newCatalog);

    toast.success(
      isReturn
        ? "تم الحفظ كمرتجع مشتريات بنجاح"
        : "تم إضافة سند المشتريات بنجاح",
    );
    setShowInvoiceForm(false);
    setInvoiceItems([]);
    setReferenceNumber("");
    setNotes("");
    setPaymentMethod("cash");
    setPaidAmount(0);
  };

  // -- REPORTS --
  const renderReports = () => {
    const COLORS = [
      "#3b82f6",
      "#10b981",
      "#f59e0b",
      "#ef4444",
      "#8b5cf6",
      "#ec4899",
      "#14b8a6",
      "#f97316",
    ];

    // Top Vendors by Spend
    const vendorSpendMap: Record<string, number> = {};
    purchases.forEach((p) => {
      const amount = p.type === "purchase" ? p.grandTotal : -p.grandTotal;
      vendorSpendMap[p.vendorName] =
        (vendorSpendMap[p.vendorName] || 0) + amount;
    });

    const vendorSpendChart = Object.entries(vendorSpendMap)
      .filter(([_, amount]) => amount > 0)
      .map(([name, amount]) => ({ name, value: amount }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // Monthly Spend & return analysis (last 6 months)
    const monthlyMap: Record<
      string,
      { gross: number; returns: number; net: number; count: number }
    > = {};
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }).reverse();

    months.forEach((m) => {
      monthlyMap[m] = { gross: 0, returns: 0, net: 0, count: 0 };
    });

    purchases.forEach((p) => {
      const d = new Date(p.date);
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (monthlyMap[m] !== undefined) {
        if (p.type === "purchase") {
          monthlyMap[m].gross += p.grandTotal;
          monthlyMap[m].net += p.grandTotal;
          monthlyMap[m].count += 1;
        } else {
          monthlyMap[m].returns += p.grandTotal;
          monthlyMap[m].net -= p.grandTotal;
        }
      }
    });

    const monthlyChartData = months.map((m) => {
      const [year, month] = m.split("-");
      return {
        name: `${month}/${year}`,
        gross: Math.max(0, monthlyMap[m].gross),
        returns: Math.max(0, monthlyMap[m].returns),
        net: monthlyMap[m].net,
        count: monthlyMap[m].count,
      };
    });

    // Calculate aggregated stats
    let totalGross = 0;
    let totalReturns = 0;
    let totalNet = 0;
    let totalInvoices = 0;

    months.forEach((m) => {
      totalGross += monthlyMap[m].gross;
      totalReturns += monthlyMap[m].returns;
      totalNet += monthlyMap[m].net;
      totalInvoices += monthlyMap[m].count;
    });

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white/5 p-4 rounded-xl border border-white/10 mb-2">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-orange-400" /> لوحة المشتريات
            والتقارير التفاعلية
          </h2>
          <span className="text-xs bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 px-3 py-1.5 rounded-full font-bold border border-orange-500/20">
            آخر 6 أشهر
          </span>
        </div>

        {/* Interactive KPI metrics dashboard header */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            onClick={() => setChartMetric("gross")}
            className={cn(
              "p-4 rounded-xl border text-right transition-all duration-300 relative group overflow-hidden focus:outline-none cursor-pointer",
              chartMetric === "gross"
                ? "bg-blue-600/10 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10",
            )}
          >
            <div className="flex justify-between items-start">
              <div>
                <span className="text-white/50 text-[10px] sm:text-xs font-bold block mb-1">
                  إجمالي المشتريات (Gross)
                </span>
                <span className="text-lg sm:text-xl font-bold font-mono text-blue-400 block sm:inline">
                  {totalGross.toLocaleString()}{" "}
                  <span className="text-xs">ر.س</span>
                </span>
                <span className="text-[9px] text-white/30 block mt-1 underline">
                  اضغط لعزل بالمخطط الخطي
                </span>
              </div>
              <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg group-hover:scale-110 transition-transform">
                <Coins className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400" />
              </div>
            </div>
            <div className="absolute bottom-0 right-0 left-0 h-[2px] bg-blue-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-right duration-300" />
          </button>

          <button
            onClick={() => setChartMetric("net")}
            className={cn(
              "p-4 rounded-xl border text-right transition-all duration-300 relative group overflow-hidden focus:outline-none cursor-pointer",
              chartMetric === "net"
                ? "bg-emerald-600/10 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10",
            )}
          >
            <div className="flex justify-between items-start">
              <div>
                <span className="text-white/50 text-[10px] sm:text-xs font-bold block mb-1">
                  صافي تكاليف الشراء (Net)
                </span>
                <span className="text-lg sm:text-xl font-bold font-mono text-emerald-400 block sm:inline">
                  {totalNet.toLocaleString()}{" "}
                  <span className="text-xs">ر.س</span>
                </span>
                <span className="text-[9px] text-white/30 block mt-1 underline">
                  اضغط لعزل بالمخطط الخطي
                </span>
              </div>
              <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg group-hover:scale-110 transition-transform">
                <Scale className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-400" />
              </div>
            </div>
            <div className="absolute bottom-0 right-0 left-0 h-[2px] bg-emerald-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-right duration-300" />
          </button>

          <button
            onClick={() => setChartMetric("returns")}
            className={cn(
              "p-4 rounded-xl border text-right transition-all duration-300 relative group overflow-hidden focus:outline-none cursor-pointer",
              chartMetric === "returns"
                ? "bg-red-600/10 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.15)]"
                : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10",
            )}
          >
            <div className="flex justify-between items-start">
              <div>
                <span className="text-white/50 text-[10px] sm:text-xs font-bold block mb-1">
                  إجمالي المرتجعات
                </span>
                <span className="text-lg sm:text-xl font-bold font-mono text-red-400 block sm:inline">
                  {totalReturns.toLocaleString()}{" "}
                  <span className="text-xs">ر.س</span>
                </span>
                <span className="text-[9px] text-white/30 block mt-1 underline">
                  اضغط لعزل بالمخطط الخطي
                </span>
              </div>
              <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-lg group-hover:scale-110 transition-transform">
                <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5 text-red-400" />
              </div>
            </div>
            <div className="absolute bottom-0 right-0 left-0 h-[2px] bg-red-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-right duration-300" />
          </button>

          <button
            onClick={() => setChartMetric("count")}
            className={cn(
              "p-4 rounded-xl border text-right transition-all duration-300 relative group overflow-hidden focus:outline-none cursor-pointer",
              chartMetric === "count"
                ? "bg-purple-600/10 border-purple-500/50 shadow-[0_0_15px_rgba(139,92,246,0.15)]"
                : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10",
            )}
          >
            <div className="flex justify-between items-start">
              <div>
                <span className="text-white/50 text-[10px] sm:text-xs font-bold block mb-1">
                  عدد فواتير الشراء
                </span>
                <span className="text-lg sm:text-xl font-bold font-mono text-purple-400 block sm:inline">
                  {totalInvoices} <span className="text-xs">فواتير</span>
                </span>
                <span className="text-[9px] text-white/30 block mt-1 underline">
                  اضغط لعزل بالمخطط الخطي
                </span>
              </div>
              <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg group-hover:scale-110 transition-transform">
                <Receipt className="h-4 w-4 sm:h-5 sm:w-5 text-purple-400" />
              </div>
            </div>
            <div className="absolute bottom-0 right-0 left-0 h-[2px] bg-purple-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-right duration-300" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="glass border-white/5">
            <CardHeader className="bg-white/5 border-b border-white/5 pb-4 flex flex-row justify-between items-center flex-wrap gap-2">
              <div>
                <CardTitle className="text-sm font-bold text-white/90">
                  حجم وتكاليف المشتريات الشهرية (مخطط خطي)
                </CardTitle>
              </div>
              <div className="text-[11px] bg-white/5 px-2 py-1 rounded border border-white/5 text-white/60">
                المؤشر المحدد:{" "}
                <span
                  className={cn(
                    "font-bold",
                    chartMetric === "gross" && "text-blue-400",
                    chartMetric === "net" && "text-emerald-400",
                    chartMetric === "returns" && "text-red-400",
                    chartMetric === "count" && "text-purple-400",
                  )}
                >
                  {chartMetric === "gross" && "إجمالي المشتريات"}
                  {chartMetric === "net" && "صافي تكاليف الشراء"}
                  {chartMetric === "returns" && "المرتجعات"}
                  {chartMetric === "count" && "عدد الفواتير"}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={monthlyChartData}
                    margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#ffffff1a"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="name"
                      stroke="#ffffff80"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      dy={10}
                    />
                    <YAxis
                      stroke="#ffffff80"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `${value.toLocaleString()}`}
                      dx={-10}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1c2128",
                        border: "1px solid #ffffff1a",
                        borderRadius: "8px",
                        textAlign: "right",
                      }}
                      formatter={(value: any, name: string) => {
                        const formatted =
                          typeof value === "number"
                            ? value.toLocaleString()
                            : value;
                        if (name === "عدد فواتير الشراء")
                          return [`${formatted} فاتورة`, name];
                        return [`${formatted} ر.س`, name];
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      iconType="plainline"
                      wrapperStyle={{
                        fontSize: "11px",
                        paddingBottom: "10px",
                        direction: "rtl",
                      }}
                    />

                    <Line
                      type="monotone"
                      dataKey="gross"
                      name="إجمالي المشتريات"
                      stroke="#3b82f6"
                      strokeWidth={chartMetric === "gross" ? 4 : 1.5}
                      strokeOpacity={chartMetric === "gross" ? 1 : 0.3}
                      dot={{ r: chartMetric === "gross" ? 5 : 2 }}
                      activeDot={{ r: 7 }}
                    />

                    <Line
                      type="monotone"
                      dataKey="net"
                      name="صافي تكاليف الشراء"
                      stroke="#10b981"
                      strokeWidth={chartMetric === "net" ? 4 : 1.5}
                      strokeOpacity={chartMetric === "net" ? 1 : 0.3}
                      dot={{ r: chartMetric === "net" ? 5 : 2 }}
                      activeDot={{ r: 7 }}
                    />

                    <Line
                      type="monotone"
                      dataKey="returns"
                      name="إجمالي المرتجعات"
                      stroke="#ef4444"
                      strokeWidth={chartMetric === "returns" ? 4 : 1.5}
                      strokeOpacity={chartMetric === "returns" ? 1 : 0.3}
                      dot={{ r: chartMetric === "returns" ? 5 : 2 }}
                      activeDot={{ r: 7 }}
                    />

                    <Line
                      type="monotone"
                      dataKey="count"
                      name="عدد فواتير الشراء"
                      stroke="#c084fc"
                      strokeWidth={chartMetric === "count" ? 4 : 1.5}
                      strokeOpacity={chartMetric === "count" ? 1 : 0.3}
                      dot={{ r: chartMetric === "count" ? 5 : 2 }}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="glass border-white/5">
            <CardHeader className="bg-white/5 border-b border-white/5 pb-4">
              <CardTitle className="text-sm font-bold text-white/90">
                حجم المشتريات حسب المورد
              </CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center items-center h-80 pt-4">
              {vendorSpendChart.length > 0 ? (
                <div className="h-full w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={vendorSpendChart}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {vendorSpendChart.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1c2128",
                          border: "1px solid #ffffff1a",
                          borderRadius: "8px",
                        }}
                        formatter={(value: number) => [
                          `${value.toLocaleString()} ر.س`,
                          "",
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap justify-center gap-4 mt-2">
                    {vendorSpendChart.map((entry, index) => (
                      <div
                        key={entry.name}
                        className="flex items-center gap-2 text-xs text-white/70"
                      >
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{
                            backgroundColor: COLORS[index % COLORS.length],
                          }}
                        />
                        {entry.name}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-white/50 text-sm">
                  لا توجد بيانات للموردين
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="glass border-white/5 overflow-hidden">
          <CardHeader className="bg-white/5 border-b border-white/5 pb-4">
            <CardTitle className="text-sm font-bold">
              ملخص سندات المشتريات (والمرتجعات)
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="text-right whitespace-nowrap">
                    التاريخ
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    المورد
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    النوع
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    المنتجات
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    رقم المرجع
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    الإجمالي
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-white/50"
                    >
                      لا توجد فواتير بعد
                    </TableCell>
                  </TableRow>
                )}
                {purchases.map((p, idx) => (
                  <TableRow
                    key={`${p.id}-${idx}`}
                    className="border-white/5 hover:bg-white/5"
                  >
                    <TableCell>
                      {new Date(p.date).toLocaleDateString("ar-EG")}
                    </TableCell>
                    <TableCell>{p.vendorName}</TableCell>
                    <TableCell>
                      {p.type === "purchase" ? (
                        <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded-full text-xs">
                          مشتريات
                        </span>
                      ) : (
                        <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded-full text-xs">
                          مرتجع
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      className="max-w-[200px] truncate"
                      title={p.items
                        .map((i) => `${i.name} (x${i.qty})`)
                        .join(", ")}
                    >
                      {p.items.map((i) => `${i.name} (x${i.qty})`).join("، ")}
                    </TableCell>
                    <TableCell>{p.referenceNumber || "—"}</TableCell>
                    <TableCell className="font-bold">
                      {p.grandTotal.toLocaleString()} ر.س
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="glass border-white/5 overflow-hidden">
          <CardHeader className="bg-white/5 border-b border-white/5 pb-4">
            <CardTitle className="text-sm font-bold text-white/90">
              الأرصدة المستحقة للموردين (الدفع الجزئي)
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 text-white/70 hover:bg-transparent">
                  <TableHead className="text-right">المورد</TableHead>
                  <TableHead className="text-right">الرقم المرجعي</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">المبلغ الإجمالي</TableHead>
                  <TableHead className="text-right">المدفوع</TableHead>
                  <TableHead className="text-right">المتبقي</TableHead>
                  <TableHead className="text-right">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases
                  .filter((p) => p.remainingAmount && p.remainingAmount > 0)
                  .map((p, idx) => (
                    <TableRow
                      key={`${p.id}-${idx}`}
                      className="border-white/5 hover:bg-white/5"
                    >
                      <TableCell>{p.vendorName}</TableCell>
                      <TableCell>{p.referenceNumber || "-"}</TableCell>
                      <TableCell>
                        {new Date(p.date).toLocaleDateString("ar-SA")}
                      </TableCell>
                      <TableCell className="font-bold">
                        {p.grandTotal.toLocaleString()} ر.س
                      </TableCell>
                      <TableCell className="text-green-400">
                        {p.paidAmount?.toLocaleString()} ر.س
                      </TableCell>
                      <TableCell className="text-orange-400 font-bold">
                        {p.remainingAmount?.toLocaleString()} ر.س
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-500 text-white h-7 px-3"
                          onClick={() => {
                            setPaymentDialogInvoice(p);
                            setPaymentAmount(
                              p.remainingAmount?.toString() || "",
                            );
                          }}
                        >
                          دفع / طباعة
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                {purchases.filter(
                  (p) => p.remainingAmount && p.remainingAmount > 0,
                ).length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-white/50 py-8 hover:bg-transparent"
                    >
                      لا توجد أرصدة مستحقة الدفع
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Payment Dialog */}
        <Dialog
          open={!!paymentDialogInvoice}
          onOpenChange={(open) => !open && setPaymentDialogInvoice(null)}
        >
          <DialogContent className="glass border-white/10 sm:max-w-md text-white">
            <DialogHeader>
              <DialogTitle>دفع دفعة لمورد (سند صرف)</DialogTitle>
              <div className="text-sm text-white/70">
                سداد للفاتورة المرجعية:{" "}
                {paymentDialogInvoice?.referenceNumber ||
                  paymentDialogInvoice?.id}
              </div>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex justify-between p-3 bg-white/5 rounded">
                <span>المبلغ المتبقي:</span>
                <span className="font-bold text-orange-400">
                  {paymentDialogInvoice?.remainingAmount?.toLocaleString()} ريال
                </span>
              </div>
              <div className="space-y-2">
                <Label>المبلغ المراد دفعه</Label>
                <Input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="bg-black/20 border-white/10 text-xl font-bold font-mono text-center"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setPaymentDialogInvoice(null)}
                className="border-white/10"
              >
                إلغاء
              </Button>
              <Button
                onClick={handleProcessPayment}
                className="bg-green-600 hover:bg-green-500 text-white gap-2"
              >
                <Check className="w-4 h-4" />
                توثيق الدفعة وطباعة السند
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  if (view === "purchases_reports") {
    return (
      <div className="max-w-6xl mx-auto animation-fade-in pb-12">
        {renderReports()}
      </div>
    );
  }

  if (view === "purchases_vendors") {
    return (
      <div className="max-w-6xl mx-auto animation-fade-in pb-12 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white/5 p-4 rounded-xl border border-white/10">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCog className="h-6 w-6 text-orange-400" /> إدارة الموردين
          </h1>
          <Button
            onClick={() => setShowAddVendor(true)}
            className="bg-orange-600 hover:bg-orange-500 text-white gap-2"
          >
            <Plus className="h-4 w-4" /> إضافة مورد جديد
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute right-3 top-2.5 h-5 w-5 text-white/40" />
          <Input
            placeholder="ابحث بالاسم، الشركة، أو الرقم..."
            className="pr-10 bg-black/20 border-white/10"
            value={searchTermVendor}
            onChange={(e) => setSearchTermVendor(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVendors.map((v, idx) => (
            <Card
              key={`${v.id}-${idx}`}
              className="glass border-white/10 relative overflow-hidden group"
            >
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-lg">{v.name}</h3>
                    {v.companyName && (
                      <p className="text-sm text-white/60 mb-2">
                        {v.companyName}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/10 hover:bg-white/10 text-white/70 h-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onPrintVendorStatement) {
                        const vendorInvoices = purchases.filter(
                          (p) => p.vendorId === v.id,
                        );
                        onPrintVendorStatement(v, vendorInvoices);
                      }
                    }}
                  >
                    <Printer className="h-4 w-4 ml-2" />
                    كشف حساب
                  </Button>
                </div>
                <div className="space-y-1 mt-2 text-sm text-white/70">
                  <p>الجوال: {v.phone}</p>
                  {v.taxNumber && <p>الرقم الضريبي: {v.taxNumber}</p>}
                  {v.address && <p>العنوان: {v.address}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredVendors.length === 0 && (
            <div className="col-span-1 md:col-span-2 lg:col-span-3 text-center p-12 text-white/50">
              لا يوجود موردين.
            </div>
          )}
        </div>

        <Dialog open={showAddVendor} onOpenChange={setShowAddVendor}>
          <DialogContent className="glass border-white/10 sm:max-w-md text-white">
            <DialogHeader>
              <DialogTitle>إضافة مورد جديد</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label>اسم المورد *</Label>
                <Input
                  value={newVendor.name || ""}
                  onChange={(e) =>
                    setNewVendor({ ...newVendor, name: e.target.value })
                  }
                  className="bg-black/20 border-white/10"
                  placeholder="اسم المورد أو الشركة"
                />
              </div>
              <div className="space-y-2">
                <Label>رقم الجوال *</Label>
                <Input
                  value={newVendor.phone || ""}
                  onChange={(e) =>
                    setNewVendor({ ...newVendor, phone: e.target.value })
                  }
                  className="bg-black/20 border-white/10"
                  placeholder="05xxxxxxxx"
                />
              </div>
              <div className="space-y-2">
                <Label>اسم الشركة (اختياري)</Label>
                <Input
                  value={newVendor.companyName || ""}
                  onChange={(e) =>
                    setNewVendor({ ...newVendor, companyName: e.target.value })
                  }
                  className="bg-black/20 border-white/10"
                  placeholder="اسم الشركة"
                />
              </div>
              <div className="space-y-2">
                <Label>الرقم الضريبي (اختياري)</Label>
                <Input
                  value={newVendor.taxNumber || ""}
                  onChange={(e) =>
                    setNewVendor({ ...newVendor, taxNumber: e.target.value })
                  }
                  className="bg-black/20 border-white/10"
                  placeholder="الرقم الضريبي"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>العنوان (اختياري)</Label>
                <Input
                  value={newVendor.address || ""}
                  onChange={(e) =>
                    setNewVendor({ ...newVendor, address: e.target.value })
                  }
                  className="bg-black/20 border-white/10"
                  placeholder="العنوان الوطني او الشارع"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                className="border-white/10"
                onClick={() => setShowAddVendor(false)}
              >
                إلغاء
              </Button>
              <Button
                className="bg-orange-600 hover:bg-orange-500 text-white"
                onClick={handleSaveVendor}
              >
                حفظ المورد
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Purchases & Returns View
  if (!isReturn && !showInvoiceForm) {
    const regularPurchases = purchases.filter((p) => p.type === "purchase");
    return (
      <div className="max-w-6xl mx-auto animation-fade-in pb-12 flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white/5 p-4 rounded-xl border border-white/10">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-400" /> فواتير (سندات)
            المشتريات
          </h1>
          <Button
            onClick={() => setShowInvoiceForm(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
          >
            <Plus className="h-4 w-4" /> إضافة فاتورة
          </Button>
        </div>

        <Card className="glass border-white/5 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="text-right whitespace-nowrap">
                    التاريخ
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    المورد
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    المنتجات
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    رقم المرجع
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    الإجمالي
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    إجراء
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regularPurchases.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center py-8 text-white/50"
                    >
                      لا توجد فواتير مشتريات بعد
                    </TableCell>
                  </TableRow>
                )}
                {regularPurchases.map((p, idx) => (
                  <TableRow
                    key={`${p.id}-${idx}`}
                    className="border-white/5 hover:bg-white/5"
                  >
                    <TableCell>
                      {new Date(p.date).toLocaleDateString("ar-EG")}
                    </TableCell>
                    <TableCell>{p.vendorName}</TableCell>
                    <TableCell>
                      {p.items.map((i) => `${i.name} (x${i.qty})`).join("، ")}
                    </TableCell>
                    <TableCell>{p.referenceNumber || "-"}</TableCell>
                    <TableCell className="font-bold text-green-400">
                      {p.grandTotal.toLocaleString()} ريال
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {p.remainingAmount && p.remainingAmount > 0 ? (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-500 text-white h-7 px-2 text-xs gap-1"
                            onClick={() => {
                              setPaymentDialogInvoice(p);
                              setPaymentAmount(
                                p.remainingAmount?.toString() || "",
                              );
                            }}
                          >
                            دفع (متبقي {p.remainingAmount.toLocaleString()})
                          </Button>
                        ) : p.paymentMethod === "partial" ? (
                          <span className="inline-flex items-center text-xs text-green-400 border border-green-400/20 bg-green-400/10 px-2 py-1 rounded">
                            مسددة بالكامل
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto animation-fade-in pb-12 flex flex-col gap-6">
      {/* Invoice Meta Panel */}
      <div className="bg-white/5 p-6 rounded-xl border border-white/10">
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            {isReturn ? (
              <Undo2 className="h-6 w-6 text-red-400" />
            ) : (
              <FileText className="h-6 w-6 text-blue-400" />
            )}
            {isReturn
              ? "إضافة مرتجع مشتريات (لمورد)"
              : "إضافة سند مشتريات جديد"}
          </h2>
          {!isReturn && (
            <Button variant="ghost" onClick={() => setShowInvoiceForm(false)}>
              إلغاء والعودة
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label className="text-sm font-bold">المورد *</Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Select value={vendorId} onValueChange={setVendorId}>
                  <SelectTrigger className="bg-black/20 border-white/10 w-full h-10">
                    <SelectValue placeholder="اختر المورد..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((v, idx) => (
                      <SelectItem key={`${v.id}-${idx}`} value={v.id}>
                        {v.name} {v.companyName ? `(${v.companyName})` : ""}
                      </SelectItem>
                    ))}
                    {vendors.length === 0 && (
                      <SelectItem value="none" disabled>
                        لا يوجد موردين
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="secondary"
                className="bg-white/10 hover:bg-white/20 h-10 px-3"
                onClick={() => setShowAddVendor(true)}
                title="إضافة مورد"
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-bold">
              رقم المرجع (رقم سند المورد)
            </Label>
            <Input
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              className="bg-black/20 border-white/10 h-10"
              placeholder="مثال: INV-9921"
            />
          </div>
        </div>
      </div>

      {/* Catalog Search & Add Panel */}
      <div className="bg-white/5 p-6 rounded-xl border border-white/10 space-y-4">
        <div className="flex justify-between items-center mb-2">
          <Label className="text-sm font-bold">
            البحث عن منتجات لإضافتها للسند
          </Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-blue-400 hover:text-blue-300 hover:bg-blue-400/10"
            onClick={() => setShowAddProduct(true)}
          >
            <Plus className="h-4 w-4 ml-1" /> إضافة منتج جديد للكتالوج
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute right-3 top-3.5 h-5 w-5 text-white/40" />
          <Input
            placeholder="ابحث عن منتج بالاسم، الرمز (SKU)، التصنيف، أو المورد..."
            className="pr-10 bg-black/20 border-white/10 h-12 text-lg focus-visible:ring-1 focus-visible:ring-blue-500/50"
            value={catSearch}
            onChange={(e) => setCatSearch(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
          {filteredCatalog.length === 0 && (
            <div className="col-span-full text-center py-6 text-white/50 bg-black/20 rounded-xl border border-white/5">
              لم يتم العثور على منتجات مطابقة.
            </div>
          )}
          {filteredCatalog.map((item, idx) => (
            <Card
              key={`${item.id}-${idx}`}
              className="glass hover:bg-white/10 border-white/5 cursor-pointer transition-colors"
              onClick={() => {
                addItemToInvoice(item);
                setCatSearch("");
              }}
            >
              <CardContent className="p-4 flex flex-col justify-between h-full space-y-4">
                <div>
                  <h3 className="font-bold">{item.name}</h3>
                  <p className="text-xs text-white/50 mt-1">
                    {item.type === "product" ? "منتج" : "خدمة"}
                  </p>
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-sm text-white/70">
                    مخزون: {item.stock || 0}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="bg-white/20 hover:bg-white/30 h-7 text-xs"
                  >
                    <Plus className="h-3 w-3 ml-1" /> إضافة
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Invoice Table Panel */}
      <div className="bg-white/5 rounded-xl border border-white/10 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-white/5 bg-black/20">
          <h3 className="font-bold text-lg">تفاصيل السند</h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-right">المنتج / الخدمة</TableHead>
                <TableHead className="text-right w-24">الكمية</TableHead>
                <TableHead className="text-right w-32">سعر التكلفة</TableHead>
                <TableHead className="text-right w-24">الضريبة %</TableHead>
                <TableHead className="text-right w-32">الإجمالي</TableHead>
                <TableHead className="w-12 text-center">إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoiceItems.map((item, idx) => (
                <TableRow
                  key={`${item.catalogId}-${idx}`}
                  className="border-white/5 hover:bg-white/5"
                >
                  <TableCell className="font-medium align-middle">
                    {item.name}
                  </TableCell>
                  <TableCell className="align-middle">
                    <Input
                      type="number"
                      min="1"
                      value={item.qty || ""}
                      onChange={(e) =>
                        updateInvoiceItem(
                          item.catalogId,
                          "qty",
                          parseInt(e.target.value) || 0,
                        )
                      }
                      className="bg-black/40 border-white/10 h-9 text-center"
                    />
                  </TableCell>
                  <TableCell className="align-middle">
                    <Input
                      type="number"
                      min="0"
                      value={item.costPrice || ""}
                      onChange={(e) =>
                        updateInvoiceItem(
                          item.catalogId,
                          "costPrice",
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      className="bg-black/40 border-white/10 h-9 text-center"
                    />
                  </TableCell>
                  <TableCell className="align-middle">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={item.tax || ""}
                      onChange={(e) =>
                        updateInvoiceItem(
                          item.catalogId,
                          "tax",
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      className="bg-black/40 border-white/10 h-9 text-center"
                    />
                  </TableCell>
                  <TableCell className="font-bold align-middle">
                    {(
                      item.costPrice *
                      item.qty *
                      (1 + item.tax / 100)
                    ).toLocaleString()}{" "}
                    ر.س
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeInvoiceItem(item.catalogId)}
                      className="h-8 w-8 text-white/50 hover:text-red-400 hover:bg-red-400/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {invoiceItems.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-white/50 py-16"
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <PackageCheck className="h-8 w-8 text-white/20" />
                      <p>لم يتم إضافة منتجات للسند</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Totals & Submit */}
        <div className="p-6 bg-black/40 border-t border-white/5">
          <div className="flex flex-col md:flex-row gap-8 justify-between">
            <div className="flex-1 space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-bold">
                  طريقة الدفع (للمورد)
                </Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(v: "cash" | "transfer" | "partial") =>
                    setPaymentMethod(v)
                  }
                >
                  <SelectTrigger className="bg-white/5 border-white/10 w-full md:w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transfer">تحويل بنكي</SelectItem>
                    <SelectItem value="cash">نقداً (كاش)</SelectItem>
                    <SelectItem value="partial">دفع جزئي (آجل)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paymentMethod === "partial" && (
                <div className="space-y-2">
                  <Label className="text-sm font-bold">المبلغ المدفوع</Label>
                  <Input
                    type="number"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(Number(e.target.value))}
                    className="bg-white/5 border-white/10 w-full md:w-64"
                  />
                  <div className="text-sm text-yellow-400 mt-1 font-mono">
                    المبلغ المتبقي:{" "}
                    {(totals.grandTotal - paidAmount).toLocaleString()} ر.س
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-sm font-bold">
                  ملاحظات السند (اختياري)
                </Label>
                <Input
                  placeholder="أضف أي ملاحظات إضافية هنا..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="bg-white/5 border-white/10 h-10 w-full"
                />
              </div>
            </div>

            <div className="w-full md:w-80 space-y-3 bg-white/5 p-4 rounded-xl border border-white/10">
              <div className="flex justify-between text-white/70 text-sm">
                <span>الإجمالي قبل الضريبة:</span>
                <span className="font-mono">
                  {totals.beforeTax.toLocaleString()} ر.س
                </span>
              </div>
              <div className="flex justify-between text-white/70 text-sm">
                <span>إجمالي الضريبة المضافة:</span>
                <span className="font-mono">
                  {totals.tax.toLocaleString()} ر.س
                </span>
              </div>
              <div className="border-t border-white/10 pt-3 flex justify-between text-xl font-bold">
                <span>الإجمالي النهائي:</span>
                <span
                  className={cn(
                    "font-mono",
                    isReturn ? "text-red-400" : "text-blue-400",
                  )}
                >
                  {totals.grandTotal.toLocaleString()} ر.س
                </span>
              </div>

              <Button
                onClick={handleCompleteInvoice}
                className={cn(
                  "w-full h-12 text-lg font-bold text-white mt-4 transition-all",
                  isReturn
                    ? "bg-red-600 hover:bg-red-500"
                    : "bg-blue-600 hover:bg-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.3)]",
                )}
                disabled={invoiceItems.length === 0}
              >
                {isReturn ? "تأكيد مرتجع المشتريات" : "تأكيد سند المشتريات"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showAddVendor} onOpenChange={setShowAddVendor}>
        <DialogContent className="glass border-white/10 sm:max-w-md text-white rounded-xl">
          <DialogHeader>
            <DialogTitle>إضافة مورد جديد</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>اسم المورد *</Label>
              <Input
                value={newVendor.name || ""}
                onChange={(e) =>
                  setNewVendor({ ...newVendor, name: e.target.value })
                }
                className="bg-black/20 border-white/10"
                placeholder="اسم المورد أو الشركة"
              />
            </div>
            <div className="space-y-2">
              <Label>رقم الجوال *</Label>
              <Input
                value={newVendor.phone || ""}
                onChange={(e) =>
                  setNewVendor({ ...newVendor, phone: e.target.value })
                }
                className="bg-black/20 border-white/10"
                placeholder="05xxxxxxxx"
              />
            </div>
            <div className="space-y-2">
              <Label>اسم الشركة (اختياري)</Label>
              <Input
                value={newVendor.companyName || ""}
                onChange={(e) =>
                  setNewVendor({ ...newVendor, companyName: e.target.value })
                }
                className="bg-black/20 border-white/10"
                placeholder="اسم الشركة"
              />
            </div>
            <div className="space-y-2">
              <Label>الرقم الضريبي (اختياري)</Label>
              <Input
                value={newVendor.taxNumber || ""}
                onChange={(e) =>
                  setNewVendor({ ...newVendor, taxNumber: e.target.value })
                }
                className="bg-black/20 border-white/10"
                placeholder="الرقم الضريبي"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>العنوان (اختياري)</Label>
              <Input
                value={newVendor.address || ""}
                onChange={(e) =>
                  setNewVendor({ ...newVendor, address: e.target.value })
                }
                className="bg-black/20 border-white/10"
                placeholder="العنوان الوطني أو الشارع"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-white/10 hover:bg-white/5"
              onClick={() => setShowAddVendor(false)}
            >
              إلغاء
            </Button>
            <Button
              className="bg-orange-600 hover:bg-orange-500 text-white"
              onClick={handleSaveVendor}
            >
              حفظ المورد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={showAddProduct} onOpenChange={setShowAddProduct}>
        <DialogContent className="glass border-white/10 sm:max-w-md text-white rounded-xl">
          <DialogHeader>
            <DialogTitle>إضافة منتج جديد للكتالوج</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-2 md:col-span-2">
              <Label>اسم المنتج *</Label>
              <Input
                value={newProduct.name || ""}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, name: e.target.value })
                }
                className="bg-black/20 border-white/10"
                placeholder="اسم المنتج أو الخدمة"
              />
            </div>
            <div className="space-y-2">
              <Label>النوع</Label>
              <Select
                value={newProduct.type || "product"}
                onValueChange={(v) =>
                  setNewProduct({ ...newProduct, type: v as any })
                }
              >
                <SelectTrigger className="bg-black/20 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">منتج مملمس</SelectItem>
                  <SelectItem value="service">خدمة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الرمز (SKU)</Label>
              <Input
                value={newProduct.sku || ""}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, sku: e.target.value })
                }
                className="bg-black/20 border-white/10"
                placeholder="مثال: PRD-001"
              />
            </div>
            <div className="space-y-2">
              <Label>التصنيف / الفئة</Label>
              <Input
                value={newProduct.category || ""}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, category: e.target.value })
                }
                className="bg-black/20 border-white/10"
                placeholder="مثال: إلكترونيات"
              />
            </div>
            <div className="space-y-2">
              <Label>المورد / الشركة</Label>
              <Input
                value={newProduct.vendor || ""}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, vendor: e.target.value })
                }
                className="bg-black/20 border-white/10"
                placeholder="مثال: مورد عام"
              />
            </div>
            <div className="space-y-2">
              <Label>سعر التكلفة (للوحدة)</Label>
              <Input
                type="number"
                value={newProduct.costPrice || ""}
                onChange={(e) =>
                  setNewProduct({
                    ...newProduct,
                    costPrice: parseFloat(e.target.value) || 0,
                  })
                }
                className="bg-black/20 border-white/10"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>سعر البيع (للوحدة)</Label>
              <Input
                type="number"
                value={newProduct.price || ""}
                onChange={(e) =>
                  setNewProduct({
                    ...newProduct,
                    price: parseFloat(e.target.value) || 0,
                  })
                }
                className="bg-black/20 border-white/10"
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-white/10 hover:bg-white/5"
              onClick={() => setShowAddProduct(false)}
            >
              إلغاء
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-500 text-white"
              onClick={handleSaveProduct}
            >
              حفظ وإضافة للسند
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
