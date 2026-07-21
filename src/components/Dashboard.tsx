/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Order, Customer, CatalogItem } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import {
  TrendingUp,
  Users,
  ShoppingBag,
  CreditCard,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  PackageCheck,
  ClipboardList,
  LayoutDashboard,
} from "lucide-react";

interface DashboardProps {
  orders: Order[];
  customers: Customer[];
  catalog?: CatalogItem[];
  purchases?: any[];
  expenses?: any[];
  urgentOrders?: any[];
  onNavigate?: (path: string) => void;
}

export default function Dashboard({
  orders,
  customers,
  catalog = [],
  purchases = [],
  expenses = [],
  urgentOrders = [],
  onNavigate,
}: DashboardProps) {
  const activeOrders = orders.filter(
    (o) => o.status === "active" && o.type === "tax_invoice",
  ); // Profits are only from actual sales not quotes

  // Sales by Date Trend
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayOrders = activeOrders.filter((o) => new Date(o.date) >= today);
  const yesterdayOrders = activeOrders.filter((o) => {
    const d = new Date(o.date);
    return d >= yesterday && d < today;
  });

  const todaySales = todayOrders.reduce((sum, o) => sum + o.grandTotal, 0);
  const yesterdaySales = yesterdayOrders.reduce(
    (sum, o) => sum + o.grandTotal,
    0,
  );
  const salesTrend =
    yesterdaySales === 0
      ? 100
      : ((todaySales - yesterdaySales) / yesterdaySales) * 100;
  const isSalesUp = salesTrend >= 0;

  const totalSalesInclusive = activeOrders.reduce(
    (sum, o) => sum + o.grandTotal,
    0,
  );
  const totalSalesExclusive = activeOrders.reduce(
    (sum, o) => sum + o.totalBeforeTax,
    0,
  );
  const totalTax = activeOrders.reduce((sum, o) => sum + o.totalTax, 0);
  const totalCost = activeOrders.reduce(
    (sum, o) => sum + (o.totalCost || 0),
    0,
  );
  const totalCommission = activeOrders.reduce(
    (sum, o) => sum + o.technicianCommission,
    0,
  );

  const totalExpenses = expenses.reduce(
    (sum, e) =>
      sum + (e.isTaxDeductible ? e.amount - (e.taxAmount || 0) : e.amount),
    0,
  );

  const totalPurchasesAmount = purchases.reduce((sum, p) => sum + p.total, 0);

  const netProfit =
    totalSalesExclusive - totalCost - totalCommission - totalExpenses;

  const financialData = [
    { name: "المبيعات", value: totalSalesExclusive, fill: "#22c55e" },
    { name: "المشتريات", value: totalPurchasesAmount, fill: "#3b82f6" },
    { name: "المصروفات", value: totalExpenses, fill: "#ef4444" },
    { name: "الأرباح", value: netProfit, fill: "#f59e0b" },
  ];

  const totalInventoryValue = catalog.reduce(
    (sum, item) => sum + item.costPrice * (item.stock || 0),
    0,
  );

  const leadsCount = customers.filter((c) => c.type === "lead").length;
  const customersCount = customers.filter((c) => c.type === "customer").length;

  const incompleteUrgentOrders = urgentOrders.filter(
    (o) => o.status !== "مكتمل",
  );
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const todayAppointments = urgentOrders.filter((o) => {
    const d = new Date(o.date);
    return d >= today && d < tomorrow;
  });

  const stats = [
    {
      title: "الطلبات غير المكتملة",
      value: incompleteUrgentOrders.length.toString(),
      icon: ClipboardList,
      color: "text-orange-400",
    },
    {
      title: "مواعيد اليوم",
      value: todayAppointments.length.toString(),
      icon: ClipboardList,
      color: "text-blue-400",
    },
    {
      title: "مبيعات اليوم",
      value: `${todaySales.toLocaleString()} ر.س`,
      icon: TrendingUp,
      color: "text-green-400",
      trend: `${Math.abs(salesTrend).toFixed(1)}%`,
      isUp: isSalesUp,
    },
    {
      title: "صافي الأرباح (الإجمالي)",
      value: `${netProfit.toLocaleString()} ر.س`,
      icon: Wallet,
      color: "text-blue-400",
    },
    {
      title: "إجمالي المصروفات",
      value: `${totalExpenses.toLocaleString()} ر.س`,
      icon: Wallet,
      color: "text-red-400",
    },
    {
      title: "قيمة المخزون الحالي",
      value: `${totalInventoryValue.toLocaleString()} ر.س`,
      icon: PackageCheck,
      color: "text-purple-400",
    },
    {
      title: "إجمالي المبيعات",
      value: `${totalSalesInclusive.toLocaleString()} ر.س`,
      icon: ShoppingBag,
      color: "text-orange-400",
    },
  ];

  const allActiveOrders = orders.filter((o) => o.status === "active");

  const customerPurchaseTotals = activeOrders.reduce(
    (acc, order) => {
      const customerId = order.customerId;
      if (!customerId) return acc;
      if (!acc[customerId]) {
        acc[customerId] = {
          name: order.customerName || "عميل غير معروف",
          total: 0,
        };
      }
      acc[customerId].total += order.grandTotal;
      return acc;
    },
    {} as Record<string, { name: string; total: number }>,
  );

  const topCustomersData = Object.values(customerPurchaseTotals)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map((item) => ({
      name:
        item.name.length > 15 ? item.name.substring(0, 15) + "..." : item.name,
      الإجمالي: item.total,
    }));

  // Sales by Type
  const pieData = [
    {
      name: "فواتير",
      value: allActiveOrders.filter((o) => o.type === "tax_invoice").length,
    },
    {
      name: "عروض أسعار",
      value: allActiveOrders.filter((o) => o.type === "quotation").length,
    },
  ];

  const COLORS = ["#3b82f6", "#f59e0b"];

  const quickLinks = [
    {
      id: "pos",
      label: "نقطة البيع والتسعير",
      icon: ShoppingBag,
      color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    },
    {
      id: "urgent_orders",
      label: "طلبات العمل والصيانة",
      icon: ClipboardList,
      color: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    },
    {
      id: "reports_all",
      label: "التقارير الشاملة",
      icon: LayoutDashboard,
      color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    },
    {
      id: "expenses",
      label: "تفاصيل المصروفات",
      icon: Wallet,
      color: "bg-red-500/10 text-red-400 border-red-500/20",
    },
  ];

  return (
    <div className="space-y-6">
      {onNavigate && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 w-full">
          {quickLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => onNavigate(link.id)}
              className={`flex items-center gap-3 p-4 rounded-xl border transition-all hover:scale-[1.02] active:scale-[0.98] ${link.color}`}
            >
              <link.icon className="h-6 w-6" />
              <span className="font-bold text-sm">{link.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
        {stats.map((s, idx) => (
          <Card
            key={idx}
            className="glass border-white/5 relative overflow-hidden group"
          >
            <CardContent className="p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className={`p-3 rounded-xl bg-white/5 ${s.color}`}>
                  <s.icon className="h-6 w-6" />
                </div>
                {s.trend && (
                  <div
                    className={`flex items-center gap-1 text-sm font-bold px-2 py-1 rounded-full ${s.isUp ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}
                  >
                    <span>{s.trend}</span>
                    {s.isUp ? (
                      <ArrowUpRight className="w-4 h-4" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4" />
                    )}
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm text-white/50">{s.title}</p>
                <p className="text-xl sm:text-2xl font-bold">{s.value}</p>
                {s.trend && (
                  <p className="text-xs text-white/40 mt-1">مقارنة بالأمس</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
        <Card className="glass border-white/5 min-w-0">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-400" /> إحصائيات العملاء
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[250px] flex flex-col justify-center gap-6">
            <div className="flex items-center justify-between bg-black/20 p-3 rounded-lg border border-white/5">
              <span className="text-white/70">عميل محتمل (Leads)</span>
              <span className="text-2xl font-bold text-blue-400">
                {leadsCount}
              </span>
            </div>
            <div className="flex items-center justify-between bg-black/20 p-3 rounded-lg border border-white/5">
              <span className="text-white/70">عميل فعلي (Customers)</span>
              <span className="text-2xl font-bold text-green-400">
                {customersCount}
              </span>
            </div>
            <Button
              variant="outline"
              className="w-full mt-2 border-white/10"
              onClick={() => onNavigate?.("crm")}
            >
              ربط بالعملاء
            </Button>
          </CardContent>
        </Card>

        <Card className="glass border-white/5 min-w-0">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Wallet className="h-4 w-4 text-orange-400" /> أرصدة الموردين
              معلقة الدفع
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[250px] overflow-auto pr-2">
            <div className="space-y-4 pt-2">
              {purchases
                .filter((p) => p.remainingAmount && p.remainingAmount > 0)
                .slice(0, 5)
                .map((p, idx) => (
                  <div
                    key={`${p.id}-${idx}`}
                    className="flex flex-col gap-1 border-b border-white/5 pb-2 last:border-0 hover:bg-white/5 p-2 rounded transition-colors"
                  >
                    <span className="text-sm truncate">{p.vendorName}</span>
                    <span
                      className="text-orange-400 font-bold text-sm"
                      dir="ltr"
                    >
                      {p.remainingAmount?.toLocaleString()} ر.س
                    </span>
                  </div>
                ))}
              {purchases.filter(
                (p) => p.remainingAmount && p.remainingAmount > 0,
              ).length === 0 && (
                <div className="text-center text-white/40 text-sm mt-10">
                  لا يوجد أرصدة معلقة للموردين
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-white/5 min-w-0">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-400" /> الملخص المالي
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[250px] pt-4 px-0 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={financialData}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#ffffff1a"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  stroke="#ffffff50"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: "#ffffff10" }}
                  contentStyle={{
                    background: "#1a1d24",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "#fff",
                  }}
                  itemStyle={{ color: "#fff" }}
                  formatter={(value: number) => [
                    `${value.toLocaleString()} ر.س`,
                    "المبلغ",
                  ]}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {financialData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 w-full">
        <Card className="glass border-white/5 min-w-0">
          <CardHeader>
            <CardTitle>أوامر لوحة التحكم (اختصارات)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div
                onClick={() => onNavigate?.("pos")}
                className="cursor-pointer p-3 bg-white/5 rounded-lg border border-white/10 flex justify-between items-center hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 text-blue-400 rounded">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <span>إصدار فاتورة جديدة</span>
                </div>
              </div>
              <div
                onClick={() => onNavigate?.("crm")}
                className="cursor-pointer p-3 bg-white/5 rounded-lg border border-white/10 flex justify-between items-center hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-500/20 text-green-400 rounded">
                    <Users className="w-4 h-4" />
                  </div>
                  <span>إضافة عميل جديد</span>
                </div>
              </div>
              <div
                onClick={() => onNavigate?.("appointments")}
                className="cursor-pointer p-3 bg-white/5 rounded-lg border border-white/10 flex justify-between items-center hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/20 text-purple-400 rounded">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <span>إنشاء طلب صيانة جديد</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-white/5 min-w-0">
          <CardHeader>
            <CardTitle>أحدث الفواتير المعلقة (شريط سريع)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activeOrders.slice(0, 5).map((o, idx) => (
                <div
                  key={`${o.id}-${idx}`}
                  className="p-3 bg-white/5 rounded-lg border border-white/10 flex justify-between items-center text-sm"
                >
                  <div className="truncate pl-2">
                    <p className="font-bold truncate">{o.customerName}</p>
                    <p className="text-white/50 text-xs">
                      {new Date(o.date).toLocaleDateString("ar-SA")}
                    </p>
                  </div>
                  <div className="text-left shrink-0">
                    <p className="text-green-400 font-bold whitespace-nowrap">
                      {o.grandTotal.toLocaleString()} ر.س
                    </p>
                    <p className="text-white/50 text-xs whitespace-nowrap">
                      {o.type === "tax_invoice"
                        ? "فاتورة ضريبية"
                        : o.type === "return_invoice"
                          ? "مرتجع مبيعات"
                          : "عرض سعر"}
                    </p>
                  </div>
                </div>
              ))}
              {activeOrders.length === 0 && (
                <p className="text-white/50 text-center py-4">
                  لا توجد فواتير حديثة
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 pb-6 w-full">
        <Card className="glass border-white/5 min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-400" /> أكثر 5 عملاء
              شراءً
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCustomersData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#ffffff1a"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  stroke="#ffffff50"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#ffffff50"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                  tickFormatter={(value) => `${value}`}
                />
                <Tooltip
                  cursor={{ fill: "#ffffff10" }}
                  contentStyle={{
                    background: "#1a1d24",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                  }}
                  itemStyle={{ color: "#10b981", fontWeight: "bold" }}
                />
                <Bar
                  dataKey="الإجمالي"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  barSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
