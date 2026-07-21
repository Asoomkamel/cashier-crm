import React, { useState, useMemo } from "react";
import { CatalogItem, AppSettings, Order } from "../types";
import { storage } from "../services/storage";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Wrench,
  Plus,
  Minus,
  History,
  Search,
  ArrowLeftRight,
  DollarSign,
  Wallet,
  AlertTriangle,
  Printer,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";

interface TechnicianInventoryProps {
  settings: AppSettings;
  catalog: CatalogItem[];
  orders: Order[];
}

export default function TechnicianInventory({
  settings,
  catalog,
  orders,
}: TechnicianInventoryProps) {
  const [inventories, setInventories] = useState<any[]>(
    () => storage.getTechInventory?.() || [],
  );
  const [logs, setLogs] = useState<any[]>(
    () => storage.getTechInventoryLogs?.() || [],
  );
  const [financialLogs, setFinancialLogs] = useState<any[]>(() =>
    storage.getTechFinancialLogs ? storage.getTechFinancialLogs() : [],
  );

  const [selectedTech, setSelectedTech] = useState<string>("");
  const [actionDialog, setActionDialog] = useState<{
    isOpen: boolean;
    type: "add" | "pull" | "transfer";
    catalogId: string;
    itemName: string;
  } | null>(null);
  const [qtyInput, setQtyInput] = useState("");
  const [targetTech, setTargetTech] = useState<string>("");

  const [newItemDialog, setNewItemDialog] = useState(false);
  const [searchItem, setSearchItem] = useState("");
  const [printMode, setPrintMode] = useState<"all" | "single">("all");

  const techOptions = settings.technicians || [];

  const totalInventoryValue = useMemo(() => {
    let total = 0;
    inventories.forEach((inv) => {
      inv.items.forEach((item: any) => {
        if (item.qty > 0) {
          const catItem = catalog.find((c) => c.id === item.catalogId);
          if (catItem) {
            const baseCost = catItem.costPrice || 0;
            const taxAmount =
              baseCost * ((catItem.tax ?? settings?.defaultTaxRate ?? 0) / 100);
            total += item.qty * (baseCost + taxAmount);
          }
        }
      });
    });
    return total;
  }, [inventories, catalog]);

  const currentInventory = useMemo(() => {
    if (!selectedTech) return [];
    const inv = inventories.find((i) => i.technicianName === selectedTech);
    return inv ? inv.items : [];
  }, [inventories, selectedTech]);

  const techStats = useMemo(() => {
    if (!selectedTech)
      return {
        goodsValue: 0,
        totalSales: 0,
        totalExpenses: 0,
        cashCollected: 0,
        balance: 0,
      };

    // 1. Goods Value
    let goodsValue = 0;
    const inv = inventories.find((i) => i.technicianName === selectedTech);
    if (inv) {
      inv.items.forEach((item: any) => {
        if (item.qty > 0) {
          const catItem = catalog.find((c) => c.id === item.catalogId);
          if (catItem) {
            const baseCost = catItem.costPrice || 0;
            const taxAmount =
              baseCost * ((catItem.tax ?? settings?.defaultTaxRate ?? 0) / 100);
            goodsValue += item.qty * (baseCost + taxAmount);
          }
        }
      });
    }

    // 2. Sales Value
    const techOrders = orders.filter(
      (o) => o.technicianName === selectedTech && o.status === "active",
    );
    const totalSales = techOrders.reduce(
      (sum, o) => sum + (o.grandTotal || 0),
      0,
    );
    const cashCollected = techOrders
      .filter((o) => o.paymentMethod === "cash")
      .reduce((sum, o) => sum + (o.paidAmount || 0), 0);

    // 3. Expenses & Financials
    const techFinLogs = financialLogs.filter(
      (log) => log.technicianName === selectedTech,
    );
    const deposits = techFinLogs
      .filter((L) => L.type === "deposit")
      .reduce((sum, L) => sum + (L.amount || 0), 0);
    const withdrawals = techFinLogs
      .filter((L) => L.type === "withdrawal")
      .reduce((sum, L) => sum + (L.amount || 0), 0);
    const totalExpenses = techFinLogs
      .filter((L) => L.type === "expense")
      .reduce((sum, L) => sum + (L.amount || 0), 0);

    // Assuming tech balance = cash they collected + what we gave them as withdrawal - what they gave us (deposit) - their expenses from the cash
    const balance = cashCollected + withdrawals - deposits - totalExpenses;

    return { goodsValue, totalSales, totalExpenses, cashCollected, balance, deposits, withdrawals };
  }, [selectedTech, inventories, catalog, orders, financialLogs]);

  const [finDialog, setFinDialog] = useState<{
    isOpen: boolean;
    type: "deposit" | "withdrawal" | "expense";
  } | null>(null);
  const [finAmount, setFinAmount] = useState("");
  const [finNote, setFinNote] = useState("");

  const handleFinancialAction = () => {
    if (!finDialog || !selectedTech) return;
    const amount = parseFloat(finAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("المبلغ غير صحيح");
      return;
    }

    const newLog = {
      id: Math.random().toString(36).substr(2, 9),
      technicianName: selectedTech,
      amount,
      type: finDialog.type,
      note: finNote,
      date: Date.now(),
    };

    const newLogs = [newLog, ...financialLogs];
    setFinancialLogs(newLogs);
    if (storage.saveTechFinancialLogs) storage.saveTechFinancialLogs(newLogs);

    toast.success("تم تسجيل العملية المالية بنجاح");
    setFinDialog(null);
    setFinAmount("");
    setFinNote("");
  };

  const saveInventory = (newInvs: any[], newLogs: any[]) => {
    setInventories(newInvs);
    setLogs(newLogs);
    if (storage.saveTechInventory) storage.saveTechInventory(newInvs);
    if (storage.saveTechInventoryLogs) storage.saveTechInventoryLogs(newLogs);
  };

  const handleAction = () => {
    if (!actionDialog || !selectedTech) return;
    const qty = parseFloat(qtyInput);
    if (isNaN(qty) || qty <= 0) {
      toast.error("الكمية غير صحيحة");
      return;
    }

    if (actionDialog.type === "transfer" && !targetTech) {
      toast.error("الرجاء اختيار الفني المحول إليه");
      return;
    }
    if (actionDialog.type === "transfer" && targetTech === selectedTech) {
      toast.error("لا يمكن التحويل لنفس الفني");
      return;
    }

    let newInvs = [...inventories];
    let techInv = newInvs.find((i) => i.technicianName === selectedTech);

    if (!techInv) {
      techInv = { technicianName: selectedTech, items: [] };
      newInvs.push(techInv);
    }

    let item = techInv.items.find(
      (i: any) => i.catalogId === actionDialog.catalogId,
    );
    if (!item) {
      if (actionDialog.type === "pull" || actionDialog.type === "transfer") {
        toast.error("رصيد الفني غير كافٍ");
        return;
      }
      item = { catalogId: actionDialog.catalogId, qty: 0 };
      techInv.items.push(item);
    }

    if (actionDialog.type === "pull" || actionDialog.type === "transfer") {
      if (item.qty < qty) {
        toast.error("رصيد الفني غير كافٍ لهذا العمل");
        return;
      }
      item.qty -= qty;
    } else {
      item.qty += qty;
    }

    let logsToAdd = [];

    // Create source log
    logsToAdd.push({
      id: Math.random().toString(36).substr(2, 9),
      technicianName: selectedTech,
      catalogId: actionDialog.catalogId,
      catalogName: actionDialog.itemName,
      qty,
      type:
        actionDialog.type === "transfer" ? "transfer_out" : actionDialog.type,
      date: Date.now(),
    });

    if (actionDialog.type === "transfer") {
      let targetInv = newInvs.find((i) => i.technicianName === targetTech);
      if (!targetInv) {
        targetInv = { technicianName: targetTech, items: [] };
        newInvs.push(targetInv);
      }
      let targetItem = targetInv.items.find(
        (i: any) => i.catalogId === actionDialog.catalogId,
      );
      if (!targetItem) {
        targetItem = { catalogId: actionDialog.catalogId, qty: 0 };
        targetInv.items.push(targetItem);
      }
      targetItem.qty += qty;

      logsToAdd.push({
        id: Math.random().toString(36).substr(2, 9),
        technicianName: targetTech,
        catalogId: actionDialog.catalogId,
        catalogName: actionDialog.itemName,
        qty,
        type: "transfer_in",
        date: Date.now(),
      });
    }

    saveInventory(newInvs, [...logsToAdd, ...logs]);
    toast.success(
      actionDialog.type === "add"
        ? "تمت إضافة الكمية للفني"
        : actionDialog.type === "pull"
          ? "تم سحب الكمية من الفني"
          : "تم تحويل الكمية للفني الآخر",
    );

    setActionDialog(null);
    setQtyInput("");
    setTargetTech("");
  };

  const handleAddNewItem = (cItem: CatalogItem) => {
    let newInvs = [...inventories];
    let techInv = newInvs.find((i) => i.technicianName === selectedTech);

    if (!techInv) {
      techInv = { technicianName: selectedTech, items: [] };
      newInvs.push(techInv);
    }

    let item = techInv.items.find((i: any) => i.catalogId === cItem.id);
    if (item) {
      toast.info("الصنف موجود مسبقاً لدى الفني");
      return;
    }

    techInv.items.push({ catalogId: cItem.id, qty: 0 });
    saveInventory(newInvs, logs);
    toast.success("تم إضافة الصنف إلى قائمة الفني");
    setNewItemDialog(false);
  };

  const filteredCatalog = catalog.filter(
    (c) =>
      c.name.toLowerCase().includes(searchItem.toLowerCase()) ||
      c.sku?.toLowerCase().includes(searchItem.toLowerCase()),
  );

  const trendData = useMemo(() => {
    const days = 7;
    const now = new Date();
    now.setHours(23, 59, 59, 999);

    const sortedLogs = [...logs].sort((a, b) => b.date - a.date);
    let currentValue = totalInventoryValue;
    const data = [];
    let currentLogIdx = 0;

    for (let i = 0; i < days; i++) {
      const endOfDay = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);

      while (
        currentLogIdx < sortedLogs.length &&
        sortedLogs[currentLogIdx].date > endOfDay.getTime()
      ) {
        const log = sortedLogs[currentLogIdx];
        const catItem = catalog.find((c) => c.id === log.catalogId);
        const cost = catItem?.costPrice || 0;
        const logValue = log.qty * cost;

        switch (log.type) {
          case "add":
          case "transfer_in":
            currentValue -= logValue;
            break;
          case "pull":
          case "sale":
          case "transfer_out":
            currentValue += logValue;
            break;
        }
        currentLogIdx++;
      }

      const dateStr = endOfDay.toLocaleDateString("ar-SA", {
        month: "short",
        day: "numeric",
      });
      data.unshift({
        date: dateStr,
        value: Math.max(0, currentValue),
      });
    }

    return data;
  }, [totalInventoryValue, logs, catalog]);

  const combinedHistory = useMemo(() => {
    if (!selectedTech) return [];
    const techLogs = logs.filter((l) => l.technicianName === selectedTech);
    const techFinancials = financialLogs.filter(
      (f) => f.technicianName === selectedTech,
    );

    const all = [
      ...techLogs.map((l) => ({
        id: `inv_${l.id}`,
        date: l.date,
        isFin: false,
        data: l,
      })),
      ...techFinancials.map((f) => ({
        id: `fin_${f.id}`,
        date: f.date,
        isFin: true,
        data: f,
      })),
    ];

    return all.sort((a, b) => b.date - a.date);
  }, [logs, financialLogs, selectedTech]);

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      {/* Print Only Report */}
      <div className="hidden print:block rtl bg-white text-black p-8 absolute inset-0 min-h-screen">
        <h1 className="text-3xl font-bold mb-2 text-center text-black print:text-black">
          {printMode === "single" && selectedTech
            ? `تقرير عهدة الفني: ${selectedTech}`
            : "تقرير عهدة الفنيين الشامل"}
        </h1>
        <p className="text-center text-gray-500 mb-8 border-b pb-4">
          تاريخ الطباعة: {new Date().toLocaleString("ar-SA")}
        </p>

        {inventories
          .filter(
            (inv: any) =>
              printMode === "all" || inv.technicianName === selectedTech,
          )
          .map((inv: any) => {
            let techValue = 0;
            const validItems = (inv.items || [])
              .filter((item: any) => item.qty > 0)
              .map((item: any) => {
                const catItem = catalog.find((c) => c.id === item.catalogId);
                const itemName = catItem ? catItem.name : "صنف محذوف";

                let baseCost = 0;
                let taxAmount = 0;
                if (catItem) {
                  baseCost = catItem.costPrice || 0;
                  taxAmount =
                    baseCost *
                    ((catItem.tax ?? settings?.defaultTaxRate ?? 0) / 100);
                }
                const itemTotal = item.qty * (baseCost + taxAmount);
                techValue += itemTotal;
                return {
                  ...item,
                  name: itemName,
                  cost: baseCost + taxAmount,
                  total: itemTotal,
                };
              });

            if (validItems.length === 0) return null;

            return (
              <div
                key={inv.technicianName}
                className="mb-10 page-break-inside-avoid"
              >
                <div className="flex justify-between items-end border-b-2 border-black pb-2 mb-4">
                  <h2 className="text-2xl font-bold">
                    الفني: {inv.technicianName}
                  </h2>
                  <h3 className="font-bold">
                    إجمالي العهدة: {techValue.toFixed(2)} ريال
                  </h3>
                </div>
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="bg-gray-100 print:bg-gray-100">
                      <th className="p-2 border border-gray-300">الصنف</th>
                      <th className="p-2 border border-gray-300 text-center w-24">
                        الكمية
                      </th>
                      <th className="p-2 border border-gray-300 w-32">
                        تكلفة الوحدة
                      </th>
                      <th className="p-2 border border-gray-300 w-32">
                        الإجمالي
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {validItems.map((item: any, idx: number) => (
                      <tr key={idx}>
                        <td className="p-2 border border-gray-300">
                          {item.name}
                        </td>
                        <td className="p-2 border border-gray-300 text-center font-bold">
                          {item.qty}
                        </td>
                        <td className="p-2 border border-gray-300">
                          {item.cost.toFixed(2)}
                        </td>
                        <td className="p-2 border border-gray-300 font-bold">
                          {item.total.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}

        {inventories.length === 0 && (
          <p className="text-center font-bold text-gray-500">
            لا يوجد عهد مسجلة لأي فني.
          </p>
        )}
      </div>
      {/* Screen Only Content */}
      <div className="print:hidden space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wrench className="h-6 w-6 text-blue-500" />
            مخزون الفنيين
          </h1>

          <div className="flex w-full sm:w-auto gap-2">
            {selectedTech && (
              <Button
                variant="outline"
                onClick={() => {
                  setPrintMode("single");
                  setTimeout(() => window.print(), 100);
                }}
                className="border-white/10 bg-white/5 hover:bg-white/10 print:hidden shrink-0"
              >
                <Printer className="h-4 w-4 ml-2" />
                طباعة عهدة الفني
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setPrintMode("all");
                setTimeout(() => window.print(), 100);
              }}
              className="border-white/10 bg-white/5 hover:bg-white/10 print:hidden shrink-0"
            >
              <Printer className="h-4 w-4 ml-2" />
              طباعة التقرير الشامل
            </Button>
            <div className="w-full sm:w-72">
              <Select value={selectedTech} onValueChange={setSelectedTech}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="اختر الفني لعرض مخزونه..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10 text-white">
                  {techOptions.length === 0 && (
                    <SelectItem value="none" disabled>
                      لا يوجد فنيين مسجلين
                    </SelectItem>
                  )}
                  {techOptions.map((t) => (
                    <SelectItem key={t.id} value={t.name}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 mb-6">
          <Card className="glass border-white/5 bg-blue-900/10 relative overflow-hidden">
            <CardHeader className="py-4 relative z-10">
              <CardTitle className="text-sm font-medium text-blue-400 flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                إجمالي قيمة البضاعة العهدة لدى جميع الفنيين
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10 pb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-6">
              <div className="text-3xl font-bold text-white">
                {totalInventoryValue.toLocaleString()}{" "}
                <span className="text-lg text-white/50">ريال</span>
              </div>
              <div className="w-full md:w-[60%] h-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient
                        id="colorValue"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#3b82f6"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#3b82f6"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#18181b",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "8px",
                      }}
                      itemStyle={{ color: "#60a5fa" }}
                      labelStyle={{ color: "#a1a1aa" }}
                      formatter={(value: number) => [
                        `${value.toLocaleString()} ريال`,
                        "إجمالي العهد",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorValue)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {!selectedTech ? (
          <Card className="glass border-white/5 p-12 flex flex-col items-center justify-center text-center">
            <Wrench className="h-16 w-16 text-white/20 mb-4" />
            <h2 className="text-xl font-bold text-white/80 mb-2">اختر الفني</h2>
            <p className="text-white/50 max-w-md">
              يرجى اختيار أحد الفنيين من القائمة العلوية لعرض المخزون والعهد
              التابعة له وتحديث أرصدته.
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="glass border-white/5 border-l-4 border-l-blue-500">
                <CardContent className="p-4 flex flex-col justify-between h-full bg-blue-900/10 gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-blue-400">
                      إجمالي قيمة البضاعة
                    </h2>
                    <p className="text-xs text-white/50 mt-1">
                      شاملة الضريبة للعهدة الحالية مع الفني
                    </p>
                    <p className="text-2xl font-bold text-white mt-2">
                      {techStats.goodsValue.toFixed(2)}{" "}
                      <span className="text-sm text-white/50">ريال</span>
                    </p>
                  </div>
                  <Button
                    onClick={() => setNewItemDialog(true)}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 w-full mt-auto"
                  >
                    <Plus className="h-4 w-4 ml-2" /> إدراج صنف للفني
                  </Button>
                </CardContent>
              </Card>

              <Card className="glass border-white/5 border-l-4 border-l-emerald-500">
                <CardContent className="p-4 flex flex-col justify-between h-full bg-emerald-900/10 gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-emerald-400">
                      إجمالي المبيعات الفني
                    </h2>
                    <p className="text-xs text-white/50 mt-1">
                      شاملة الضريبة لجميع الفواتير
                    </p>
                    <p className="text-2xl font-bold text-white mt-2">
                      {techStats.totalSales.toFixed(2)}{" "}
                      <span className="text-sm text-white/50">ريال</span>
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass border-white/5 border-l-4 border-l-cyan-500">
                <CardContent className="p-4 flex flex-col justify-between h-full bg-cyan-900/10 gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-cyan-400">
                      السحب والإيداع
                    </h2>
                    <p className="text-xs text-white/50 mt-1">
                      المبالغ التي تم سحبها أو إيداعها يدوياً
                    </p>
                    <div className="mt-0 mb-[15px] flex justify-between items-center bg-black/20 p-2 rounded">
                      <div className="flex flex-col">
                        <span className="text-xs text-white/50">إيداع (تسديد)</span>
                        <span className="text-lg font-bold text-emerald-400">{techStats.deposits.toFixed(2)}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-xs text-white/50">سحب (سلفة)</span>
                        <span className="text-lg font-bold text-orange-400">{techStats.withdrawals.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 w-full mt-auto">
                    <Button
                      size="sm"
                      onClick={() =>
                        setFinDialog({ isOpen: true, type: "deposit" })
                      }
                      className="bg-emerald-600 hover:bg-emerald-700 w-full"
                    >
                      <Plus className="h-3 w-3 ml-1" /> إيداع
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        setFinDialog({ isOpen: true, type: "withdrawal" })
                      }
                      className="bg-orange-600 hover:bg-orange-700 w-full"
                    >
                      <Minus className="h-3 w-3 ml-1" /> سحب
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass border-white/5 border-l-4 border-l-purple-500">
                <CardContent className="p-4 flex flex-col justify-between h-full bg-purple-900/10 gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-purple-400">
                      المصروفات التشغيلية
                    </h2>
                    <p className="text-xs text-white/50 mt-1">
                      مثل: بنزين، مشتريات (يمكنك إضافتها)
                    </p>
                    <p className="text-2xl font-bold text-white mt-2">
                      {techStats.totalExpenses.toFixed(2)} <span className="text-sm text-purple-400">ريال</span>
                    </p>
                  </div>
                  <div className="flex w-full mt-auto">
                    <Button
                      size="sm"
                      onClick={() =>
                        setFinDialog({ isOpen: true, type: "expense" })
                      }
                      className="bg-purple-600 hover:bg-purple-700 w-full"
                    >
                      <Plus className="h-4 w-4 ml-1" /> إضافة مصروف
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="glass border-white/5 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5 bg-white/5">
                    <TableHead className="text-right">
                      رقم الصنف / المادة
                    </TableHead>
                    <TableHead className="text-right">
                      الرصيد المتوفر للعهدة
                    </TableHead>
                    <TableHead className="text-center">
                      إجراءات (مبيعات / صرف)
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentInventory.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-center text-white/50 py-8"
                      >
                        لا يوجد أصناف في عهدة هذا الفني.
                      </TableCell>
                    </TableRow>
                  )}
                  {currentInventory.map((item: any) => {
                    const catItem = catalog.find(
                      (c) => c.id === item.catalogId,
                    );
                    if (!catItem) return null;

                    return (
                      <TableRow key={item.catalogId} className="border-white/5">
                        <TableCell className="font-medium">
                          {catItem.name}
                          <div className="text-xs text-white/40 mt-1">
                            الرصيد الرئيسي في الكتالوج: {catItem.stock}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              item.qty > 0
                                ? "border-green-500/50 text-green-400"
                                : "border-red-500/50 text-red-400"
                            }
                          >
                            {item.qty}{" "}
                            {catItem.type === "product" ? "حبة" : "خدمة"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center space-x-reverse space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-blue-500/30 hover:bg-blue-900/30 text-blue-400"
                            onClick={() =>
                              setActionDialog({
                                isOpen: true,
                                type: "add",
                                catalogId: item.catalogId,
                                itemName: catItem.name,
                              })
                            }
                          >
                            <Plus className="h-4 w-4 ml-1" /> إضافة (صرف للفني)
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-orange-500/30 hover:bg-orange-900/30 text-orange-400"
                            onClick={() =>
                              setActionDialog({
                                isOpen: true,
                                type: "pull",
                                catalogId: item.catalogId,
                                itemName: catItem.name,
                              })
                            }
                          >
                            <Minus className="h-4 w-4 ml-1" /> سحب (مرتجع /
                            مبيعات)
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-green-500/30 hover:bg-green-900/30 text-green-400"
                            onClick={() =>
                              setActionDialog({
                                isOpen: true,
                                type: "transfer",
                                catalogId: item.catalogId,
                                itemName: catItem.name,
                              })
                            }
                          >
                            <ArrowLeftRight className="h-4 w-4 ml-1" /> تحويل
                            لفني آخر
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>

            <Card className="glass border-white/5">
              <CardHeader>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <History className="h-4 w-4" /> سجل حركات الفني الشامل
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {combinedHistory.map((item) => {
                    if (item.isFin) {
                      const log = item.data;
                      return (
                        <div
                          key={item.id}
                          className="flex justify-between items-center p-3 rounded-lg bg-white/5 border border-white/5 text-sm"
                        >
                          <div className="flex flex-col gap-1">
                            <div className="font-semibold">
                              {log.type === "expense"
                                ? "تسجيل مصروف"
                                : log.type === "deposit"
                                  ? "تسديد للشركة"
                                  : "صرف من الشركة"}
                            </div>
                            {log.note && (
                              <div className="text-xs text-white/70">
                                ملاحظة: {log.note}
                              </div>
                            )}
                            <div className="text-xs text-white/50">
                              {new Date(log.date).toLocaleString("ar-SA")}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge
                              variant="outline"
                              className={
                                log.type === "expense"
                                  ? "bg-orange-900/20 text-orange-400 border-orange-500/30"
                                  : log.type === "deposit"
                                    ? "bg-emerald-900/20 text-emerald-400 border-emerald-500/30"
                                    : "bg-blue-900/20 text-blue-400 border-blue-500/30"
                              }
                            >
                              مالية
                            </Badge>
                            <span className="font-bold font-mono">
                              {log.amount.toFixed(2)} ريال
                            </span>
                          </div>
                        </div>
                      );
                    } else {
                      const log = item.data;
                      return (
                        <div
                          key={item.id}
                          className="flex justify-between items-center p-3 rounded-lg bg-white/5 border border-white/5 text-sm"
                        >
                          <div className="flex flex-col gap-1">
                            <div className="font-semibold">
                              {log.catalogName}
                            </div>
                            {log.customerName && (
                              <div className="text-xs text-blue-300">
                                العميل: {log.customerName}
                              </div>
                            )}
                            <div className="text-xs text-white/50">
                              {new Date(log.date).toLocaleString("ar-SA")}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge
                              variant="outline"
                              className={
                                log.type === "add"
                                  ? "bg-blue-900/20 text-blue-400 border-blue-500/30"
                                  : log.type === "sale"
                                    ? "bg-purple-900/20 text-purple-400 border-purple-500/30"
                                    : log.type === "transfer_in"
                                      ? "bg-teal-900/20 text-teal-400 border-teal-500/30"
                                      : log.type === "transfer_out"
                                        ? "bg-red-900/20 text-red-400 border-red-500/30"
                                        : "bg-orange-900/20 text-orange-400 border-orange-500/30"
                              }
                            >
                              {log.type === "add"
                                ? "صرف للفني"
                                : log.type === "sale"
                                  ? "مبيعات الكاشير"
                                  : log.type === "transfer_in"
                                    ? "تحويل وارد"
                                    : log.type === "transfer_out"
                                      ? "تحويل صادر"
                                      : "سحب من الفني"}
                            </Badge>
                            <span className="font-bold font-mono">
                              {log.qty} وحدة
                            </span>
                          </div>
                        </div>
                      );
                    }
                  })}
                  {combinedHistory.length === 0 && (
                    <div className="text-white/50 text-sm text-center py-4">
                      لا توجد حركات مسجلة لهذا الفني
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Action Dialog */}
        <Dialog
          open={!!actionDialog}
          onOpenChange={(open) => !open && setActionDialog(null)}
        >
          <DialogContent className="glass border-white/10 text-white max-w-sm">
            <DialogHeader>
              <DialogTitle>
                {actionDialog?.type === "add"
                  ? "صرف كمية للفني"
                  : actionDialog?.type === "pull"
                    ? "سحب كمية من الفني"
                    : "تحويل المادة لفني آخر"}
              </DialogTitle>
              <CardDescription className="text-white/60">
                الصنف: {actionDialog?.itemName}
              </CardDescription>
            </DialogHeader>
            <div className="py-2 space-y-4">
              <div>
                <label className="text-xs text-white/70 mb-2 block">
                  الكمية (العدد)
                </label>
                <Input
                  type="number"
                  min="0.1"
                  step="any"
                  value={qtyInput}
                  onChange={(e) => setQtyInput(e.target.value)}
                  className="bg-white/5 border-white/10 text-white"
                  autoFocus
                />
                {actionDialog?.type === "pull" && (
                  <p className="text-xs text-orange-400/80 mt-2">
                    ملاحظة: السحب يعني (خصم من العهدة إما لمبيعات الفني أو
                    إرجاعه للمستودع).
                  </p>
                )}
              </div>

              {actionDialog?.type === "transfer" && (
                <div>
                  <label className="text-xs text-white/70 mb-2 block">
                    تحويل إلى الفني
                  </label>
                  <Select value={targetTech} onValueChange={setTargetTech}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="اختر الفني المحول إليه" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-white/10 text-white">
                      {techOptions
                        .filter((t: any) => t.name !== selectedTech)
                        .map((t: any) => (
                          <SelectItem key={t.id} value={t.name}>
                            {t.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setActionDialog(null)}
                className="border-white/10"
              >
                إلغاء
              </Button>
              <Button
                onClick={handleAction}
                className={
                  actionDialog?.type === "add"
                    ? "bg-blue-600 hover:bg-blue-500"
                    : actionDialog?.type === "pull"
                      ? "bg-orange-600 hover:bg-orange-500"
                      : "bg-green-600 hover:bg-green-500"
                }
              >
                تأكيد{" "}
                {actionDialog?.type === "add"
                  ? "الصرف"
                  : actionDialog?.type === "pull"
                    ? "السحب"
                    : "التحويل"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Select Item Dialog */}
        <Dialog open={newItemDialog} onOpenChange={setNewItemDialog}>
          <DialogContent className="glass border-white/10 text-white max-w-md max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>إدراج صنف إلى قائمة الفني</DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-2 mb-4 bg-white/5 rounded-lg border border-white/10 px-3 py-2">
              <Search className="h-4 w-4 text-white/50" />
              <Input
                className="bg-transparent border-0 h-8 focus-visible:ring-0 text-white p-0"
                placeholder="ابحث في الكتالوج بإسم الصنف..."
                value={searchItem}
                onChange={(e) => setSearchItem(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 border-t border-white/10 pt-4">
              {filteredCatalog.length === 0 && (
                <div className="text-center text-white/50 py-4 text-sm">
                  لا توجد أصناف مطابقة
                </div>
              )}
              {filteredCatalog.slice(0, 50).map((cItem) => {
                const alreadyHas = currentInventory.some(
                  (i: any) => i.catalogId === cItem.id,
                );
                return (
                  <div
                    key={cItem.id}
                    className="flex justify-between items-center p-3 rounded-lg bg-white/5 border border-white/5 text-sm hover:bg-white/10 transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-white/90">
                        {cItem.name}
                      </div>
                      <div className="text-xs text-white/50">
                        المتوفر بالكتالوج: {cItem.stock}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={alreadyHas ? "secondary" : "default"}
                      disabled={alreadyHas}
                      onClick={() => handleAddNewItem(cItem)}
                      className={
                        alreadyHas
                          ? "opacity-50"
                          : "bg-blue-600 hover:bg-blue-500"
                      }
                    >
                      {alreadyHas ? "مدرج مسبقاً" : "إضافة للعهد"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>

        {/* Financial Action Dialog */}
        <Dialog
          open={!!finDialog}
          onOpenChange={(open) => !open && setFinDialog(null)}
        >
          <DialogContent className="glass border-white/10 text-white max-w-md">
            <DialogHeader>
              <DialogTitle>
                {finDialog?.type === "deposit"
                  ? "سداد مبلغ للشركة (من الفني)"
                  : finDialog?.type === "expense"
                    ? "تسجيل مصروف للفني"
                    : "صرف مبلغ للفني (من الشركة)"}
              </DialogTitle>
              <CardDescription className="text-white/60">
                الفني المختار: {selectedTech}
              </CardDescription>
            </DialogHeader>
            <div className="py-2 space-y-4">
              <div>
                <label className="text-xs text-white/70 mb-2 block">
                  المبلغ (ريال)
                </label>
                <Input
                  type="number"
                  min="1"
                  step="any"
                  value={finAmount}
                  onChange={(e) => setFinAmount(e.target.value)}
                  className="bg-white/5 border-white/10 text-white"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-white/70 mb-2 block">
                  {finDialog?.type === "expense"
                    ? "تفاصيل المصروف المشترك (اختر من القائمة أو اكتب جديد)"
                    : "ملاحظات العملية (اختياري)"}
                </label>
                {finDialog?.type === "expense" ? (
                  <div className="space-y-2">
                    <div className="flex gap-2 flex-wrap">
                      {["بنزين", "وجبات", "مشتريات", "صيانة سيارة", "مخالفات"].map(cat => (
                        <Badge 
                          key={cat} 
                          variant="outline" 
                          className={`cursor-pointer hover:bg-white/10 ${finNote === cat ? "bg-purple-600/50 border-purple-400" : ""}`}
                          onClick={() => setFinNote(cat)}
                        >
                          {cat}
                        </Badge>
                      ))}
                    </div>
                    <Input
                      value={finNote}
                      onChange={(e) => setFinNote(e.target.value)}
                      className="bg-white/5 border-white/10 text-white"
                      placeholder="أو اكتب تفاصيل أخرى هنا..."
                    />
                  </div>
                ) : (
                  <Input
                    value={finNote}
                    onChange={(e) => setFinNote(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                    placeholder="مثال: تسديد فواتير اليوم..."
                  />
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setFinDialog(null)}
                className="border-white/10"
              >
                إلغاء
              </Button>
              <Button
                onClick={handleFinancialAction}
                className={
                  finDialog?.type === "deposit"
                    ? "bg-green-600 hover:bg-green-500"
                    : finDialog?.type === "expense"
                      ? "bg-orange-600 hover:bg-orange-500"
                      : "bg-blue-600 hover:bg-blue-500"
                }
              >
                تأكيد{" "}
                {finDialog?.type === "deposit"
                  ? "السداد"
                  : finDialog?.type === "expense"
                    ? "المصروف"
                    : "الصرف"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>{" "}
      {/* End Screen Only Content */}
    </div>
  );
}
