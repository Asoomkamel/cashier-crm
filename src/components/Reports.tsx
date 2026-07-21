import { useState, useEffect } from "react";
import {
  Customer,
  Order,
  CatalogItem,
  PurchaseInvoice,
  AppSettings,
} from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";
import {
  FileBarChart2,
  Users,
  ShoppingBag,
  Truck,
  PackageCheck,
  List,
  TrendingUp,
  TrendingDown,
  Info,
  Printer,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ReportsProps {
  view: string;
  customers: Customer[];
  orders: Order[];
  catalog: CatalogItem[];
  purchases?: PurchaseInvoice[];
  techOrders?: any[];
  expenses?: any[];
  settings: AppSettings;
  onPrintTechnicianStatement?: (name: string, orders: Order[], expenses: any[], serviceOrders?: any[], inventoryItems?: any[]) => void;
  onPrintStatement?: (customer: Customer, orders: Order[]) => void;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

const reportTypes = [
  { id: "reports_all", label: "جميع التقارير" },
  { id: "reports_sales", label: "المبيعات والإيرادات" },
  { id: "reports_expenses", label: "المصروفات" },
  { id: "reports_technicians", label: "الفنيين والصيانة" },
  { id: "reports_customers", label: "العملاء" },
  { id: "reports_purchases", label: "المشتريات" },
  { id: "reports_products", label: "مبيعات المنتجات" },
  { id: "reports_stock", label: "حركة المنتجات" },
];

export default function Reports({
  view,
  customers,
  orders,
  catalog,
  purchases = [],
  techOrders = [],
  expenses = [],
  settings,
  onPrintTechnicianStatement,
  onPrintStatement,
}: ReportsProps) {
  const [activeTab, setActiveTab] = useState(view);

  // Sync prop changes
  useEffect(() => {
    setActiveTab(view);
  }, [view]);

  const [startDate, setStartDate] = useState<string>(() => {
    const now = new Date();
    // Default to the first day of the current month for a cleaner month-to-date look
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return firstDay.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [activePreset, setActivePreset] = useState<string>("month");

  // Independent Expense Filters
  const [expenseStartDate, setExpenseStartDate] = useState<string>(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return firstDay.toISOString().split("T")[0];
  });
  const [expenseEndDate, setExpenseEndDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [expenseCategoryFilter, setExpenseCategoryFilter] =
    useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");

  const [selectedCustomerReport, setSelectedCustomerReport] =
    useState<Customer | null>(null);

  const getDayLimits = () => {
    const start = startDate ? new Date(startDate) : null;
    if (start) start.setHours(0, 0, 0, 0);
    const end = endDate ? new Date(endDate) : null;
    if (end) end.setHours(23, 59, 59, 999);
    return { start, end };
  };

  const getExpenseLimits = () => {
    const start = expenseStartDate ? new Date(expenseStartDate) : null;
    if (start) start.setHours(0, 0, 0, 0);
    const end = expenseEndDate ? new Date(expenseEndDate) : null;
    if (end) end.setHours(23, 59, 59, 999);
    return { start, end };
  };

  const { start: filterStart, end: filterEnd } = getDayLimits();
  const { start: expenseFilterStart, end: expenseFilterEnd } =
    getExpenseLimits();

  const filteredOrders = orders.filter((o) => {
    if (branchFilter !== "all" && o.branchId !== branchFilter) return false;
    if (!o.date) return false;
    const orderDate = new Date(o.date);
    if (filterStart && orderDate < filterStart) return false;
    if (filterEnd && orderDate > filterEnd) return false;
    return true;
  });

  const filteredPurchases = purchases
    .filter((p) => {
      if (!p.date) return false;
      const purchaseDate = new Date(p.date);
      if (filterStart && purchaseDate < filterStart) return false;
      if (filterEnd && purchaseDate > filterEnd) return false;
      return true;
    })
    .sort((a, b) => b.date - a.date);

  const filteredTechOrders = techOrders.filter((to) => {
    if (!to.createdAt && !to.date) return false;
    const date = new Date(to.createdAt || to.date);
    if (filterStart && date < filterStart) return false;
    if (filterEnd && date > filterEnd) return false;
    return true;
  });

  const filteredExpensesGlobal = expenses.filter((e) => {
    const d = new Date(e.date);
    return (!filterStart || d >= filterStart) && (!filterEnd || d <= filterEnd);
  });

  // Filter customers by createdAt if we want to restrict them,
  // but usually we want to see ALL customers who had activity, or were created.
  // We'll filter customers who were either created in this period, OR had an order in this period.
  const filteredCustomers = customers.filter((c) => {
    const cDate = new Date(c.createdAt || 0);
    const createdInPeriod =
      (!filterStart || cDate >= filterStart) &&
      (!filterEnd || cDate <= filterEnd);
    const hasOrderInPeriod = filteredOrders.some((o) => o.customerId === c.id);
    const hasTechOrderInPeriod = filteredTechOrders.some(
      (to) =>
        to.customerId === c.id || (c.phone && to.issue?.includes(c.phone)),
    );
    return createdInPeriod || hasOrderInPeriod || hasTechOrderInPeriod;
  });

  const activeSales = filteredOrders.filter(
    (o) => o.status === "active" && o.type === "tax_invoice",
  );

  const renderCustomersReport = () => {
    const leads = filteredCustomers.filter((c) => c.type === "lead").length;
    const actualCustomers = filteredCustomers.filter(
      (c) => c.type === "customer",
    ).length;
    const data = [
      { name: "عملاء فعليين", value: actualCustomers },
      { name: "عملاء محتملين", value: leads },
    ];

    const customerStats = filteredCustomers
      .map((c) => {
        const cOrders = activeSales.filter((o) => o.customerId === c.id);
        const totalSpent = cOrders.reduce((sum, o) => sum + o.grandTotal, 0);
        const latestOrder = cOrders.sort((a, b) => b.date - a.date)[0];
        return {
          ...c,
          ordersCount: cOrders.length,
          totalSpent,
          lastSalesperson: latestOrder?.technicianName || "غير محدد",
          lastInteractionDate: latestOrder
            ? new Date(latestOrder.date).toLocaleDateString("ar-SA")
            : "لا يوجد",
        };
      })
      .sort((a, b) => b.totalSpent - a.totalSpent);

    const cityMap: Record<string, number> = {};
    filteredCustomers.forEach((c) => {
      const city = c.locations?.[0]?.city || "لا يوجد عنوان / غير محدد";
      cityMap[city] = (cityMap[city] || 0) + 1;
    });
    const cityData = Object.entries(cityMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-blue-400" /> تقارير العملاء
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="glass border-white/5">
            <CardHeader>
              <CardTitle className="text-sm">توزيع العملاء</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    dataKey="value"
                  >
                    <Cell fill="#10b981" />
                    <Cell fill="#f59e0b" />
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1c2128",
                      border: "1px solid #ffffff1a",
                      borderRadius: "8px",
                    }}
                    itemStyle={{ color: "#fff" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 text-xs mt-2">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />{" "}
                  فعليين: {actualCustomers}
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-amber-500" /> محتملين:{" "}
                  {leads}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass border-white/5">
            <CardHeader>
              <CardTitle className="text-sm">
                توزيع العملاء الجغرافي (المدن)
              </CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={cityData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#ffffff1a"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    stroke="#ffffff50"
                    tick={{ fill: "#ffffff50", fontSize: 12 }}
                  />
                  <YAxis
                    stroke="#ffffff50"
                    tick={{ fill: "#ffffff50", fontSize: 12 }}
                  />
                  <Tooltip
                    wrapperStyle={{ outline: "none" }}
                    contentStyle={{
                      backgroundColor: "#1c2128",
                      border: "1px solid #ffffff1a",
                      borderRadius: "8px",
                      color: "#fff",
                    }}
                    cursor={{ fill: "#ffffff0a" }}
                  />
                  <Bar
                    dataKey="count"
                    name="عدد العملاء"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card className="glass border-white/5 overflow-hidden mt-6">
          <CardHeader className="bg-white/5 border-b border-white/5 pb-4">
            <CardTitle className="text-sm font-bold">
              تفاعل العملاء والفواتير
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto max-h-96">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent sticky top-0 bg-[#0c101b]">
                  <TableHead className="text-right whitespace-nowrap">
                    اسم العميل
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    النوع
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    عدد الفواتير
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    إجمالي المدفوعات
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    المندوب / الفني الأخير
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    آخر تفاعل
                  </TableHead>
                  <TableHead className="text-left whitespace-nowrap">
                    الإجراءات
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customerStats.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-white/50 py-4"
                    >
                      لا يوجد عملاء.
                    </TableCell>
                  </TableRow>
                )}
                {customerStats.map((c) => (
                  <TableRow
                    key={c.id}
                    className="border-white/5 hover:bg-white/5"
                  >
                    <TableCell className="font-medium text-white">
                      {c.name}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          c.type === "customer"
                            ? "text-emerald-400 border-emerald-400/20"
                            : "text-amber-400 border-amber-400/20"
                        }
                      >
                        {c.type === "customer" ? "فعلي" : "محتمل"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-blue-400 font-bold">
                      {c.ordersCount}
                    </TableCell>
                    <TableCell className="text-emerald-400 font-bold">
                      {c.totalSpent.toLocaleString()} ر.س
                    </TableCell>
                    <TableCell className="text-white/70">
                      {c.lastSalesperson}
                    </TableCell>
                    <TableCell className="text-white/50 text-xs">
                      {c.lastInteractionDate}
                    </TableCell>
                    <TableCell className="text-left">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/20"
                        title="تفاصيل تقرير العميل"
                        onClick={() => setSelectedCustomerReport(c)}
                      >
                        <Info className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Full Customer Report Dialog */}
        <Dialog
          open={!!selectedCustomerReport}
          onOpenChange={(open) => !open && setSelectedCustomerReport(null)}
        >
          <DialogContent className="glass border-white/10 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex justify-between items-center w-full mt-2">
                <DialogTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5 text-cyan-400" />
                  تقرير العميل: {selectedCustomerReport?.name}
                </DialogTitle>
                {onPrintStatement && selectedCustomerReport && (
                  <Button
                    onClick={() => {
                      const customerOrders = filteredOrders.filter(
                        (o) =>
                          o.customerName === selectedCustomerReport.name ||
                          o.customerId === selectedCustomerReport.id,
                      );
                      onPrintStatement(selectedCustomerReport, customerOrders);
                    }}
                    className="bg-blue-600 hover:bg-blue-500 text-white gap-2 ml-4 md:ml-0"
                    size="sm"
                  >
                    <Printer className="w-4 h-4" />
                    طباعة التقرير / كشف حساب
                  </Button>
                )}
              </div>
            </DialogHeader>
            {selectedCustomerReport &&
              (() => {
                const customerOrders = filteredOrders.filter(
                  (o) =>
                    o.customerName === selectedCustomerReport.name ||
                    o.customerId === selectedCustomerReport.id,
                );
                const customerTechOrders = filteredTechOrders.filter(
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
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                        <p className="text-white/50 text-sm">عدد الفواتير</p>
                        <p className="text-2xl font-bold">{totalOrders}</p>
                      </div>
                      <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                        <p className="text-white/50 text-sm">تاريخ آخر طلب</p>
                        <p className="text-xl font-bold mt-1">
                          {lastOrderDate}
                        </p>
                      </div>
                      <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                        <p className="text-white/50 text-sm">
                          عدد طلبات الصيانة
                        </p>
                        <p className="text-2xl font-bold">
                          {customerTechOrders.length}
                        </p>
                      </div>
                      <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                        <p className="text-white/50 text-sm">
                          إجمالي المشتريات
                        </p>
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
                          المنتجات المطلوبة سابقاً
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
                                className="bg-white/5 p-3 rounded-lg border border-white/10 flex justify-between items-center text-sm"
                              >
                                <div>
                                  <p className="font-semibold text-white/90">
                                    {to.issue}
                                  </p>
                                  <p className="text-white/50">
                                    {new Date(to.createdAt).toLocaleDateString(
                                      "ar-SA",
                                    )}
                                  </p>
                                </div>
                                <div className="text-left">
                                  <Badge className="bg-indigo-600">
                                    الفني: {to.technicianName || "غير محدد"}
                                  </Badge>
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
                                <span>
                                  رقم الفاتورة: {o.id.substring(0, 8)}
                                </span>
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
      </div>
    );
  };

  const renderSalesReport = () => {
    let rawTotalSales = 0;
    let totalProfit = 0;
    let taxes = 0;
    let installmentFees = 0;

    // Breakdown
    const paymentBreakdown = {
      cash: 0,
      network: 0,
      partial: 0,
      tabby: 0,
      tamara: 0,
      transfer: 0,
      postponed: 0,
    };

    const categorySalesMap: Record<string, number> = {};

    activeSales.forEach((o) => {
      const pm = o.paymentMethod || "cash";

      const salesValue =
        pm === "partial" && o.paidAmount !== undefined
          ? o.paidAmount
          : o.grandTotal;

      if (pm === "tabby" || pm === "tamara") {
        const fee = o.grandTotal * 0.07 * 1.15;
        installmentFees += fee;
        //@ts-ignore
        paymentBreakdown[pm] = (paymentBreakdown[pm] || 0) + o.grandTotal;
      } else {
        //@ts-ignore
        paymentBreakdown[pm] = (paymentBreakdown[pm] || 0) + salesValue;
      }

      rawTotalSales += o.grandTotal;
      const taxRate = settings.defaultTaxRate || 15;
      const costWithTax = (o.totalCost || 0) * (1 + taxRate / 100);
      totalProfit += o.grandTotal - costWithTax;
      taxes += o.totalTax;

      // Calculate category sales
      o.items?.forEach((item: any) => {
        const catalogItem = catalog.find((c) => c.id === item.catalogId);
        const categoryName = catalogItem?.category || "غير مصنف";
        const itemTotal = item.price * item.qty - item.discount * item.qty;
        categorySalesMap[categoryName] =
          (categorySalesMap[categoryName] || 0) + itemTotal;
      });
    });

    const categorySalesData = Object.entries(categorySalesMap)
      .map(([name, value]) => ({ name, value }))
      .filter((c) => c.value > 0)
      .sort((a, b) => b.value - a.value);

    const COLORS = [
      "#3b82f6",
      "#10b981",
      "#f59e0b",
      "#ef4444",
      "#8b5cf6",
      "#ec4899",
      "#14b8a6",
      "#6366f1",
    ];

    const filteredExpenses = expenses.filter((e) => {
      const d = new Date(e.date);
      return (
        (!filterStart || d >= filterStart) && (!filterEnd || d <= filterEnd)
      );
    });

    const totalFilteredExpenses = filteredExpenses.reduce(
      (sum, e) =>
        sum + (e.isTaxDeductible ? e.amount - (e.taxAmount || 0) : e.amount),
      0,
    );

    const netProfitAfterFees =
      totalProfit - installmentFees - totalFilteredExpenses;
    const netRevenue = rawTotalSales - installmentFees;

    // Generate daily data for line chart
    const dailyDataMap = new Map<
      string,
      { date: string; formattedDate: string; sales: number; profit: number }
    >();

    let start = filterStart;
    if (!start) {
      const minDate =
        activeSales.length > 0
          ? Math.min(...activeSales.map((o) => o.date))
          : Date.now();
      start = new Date(minDate);
      start.setHours(0, 0, 0, 0);
    }
    let end = filterEnd;
    if (!end) {
      end = new Date();
      end.setHours(23, 59, 59, 999);
    }

    const temp = new Date(start);
    const limit = new Date(end);

    let iter = 0;
    while (temp <= limit && iter < 366) {
      const dateStr = temp.toISOString().split("T")[0];
      const dayNum = temp.getDate();
      const monthNum = temp.getMonth() + 1;
      const label = `${dayNum}/${monthNum}`;
      dailyDataMap.set(dateStr, {
        date: dateStr,
        formattedDate: label,
        sales: 0,
        profit: 0,
      });
      temp.setDate(temp.getDate() + 1);
      iter++;
    }

    activeSales.forEach((order) => {
      const d = new Date(order.date);
      const dateStr = d.toISOString().split("T")[0];
      const existing = dailyDataMap.get(dateStr);
      if (existing) {
        let dailySale = order.grandTotal;
        const pm = order.paymentMethod;
        if (pm === "tabby" || pm === "tamara") {
          dailySale -= order.grandTotal * 0.07 * 1.15;
        }
        existing.sales += dailySale;
        const taxRate = settings.defaultTaxRate || 15;
        const costWithTax = (order.totalCost || 0) * (1 + taxRate / 100);
        existing.profit +=
          order.grandTotal -
          costWithTax -
          (pm === "tabby" || pm === "tamara"
            ? order.grandTotal * 0.07 * 1.15
            : 0);
      }
    });

    const chartData = Array.from(dailyDataMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    // Find trend (last day vs previous day)
    const len = chartData.length;
    const todaySales = len > 0 ? chartData[len - 1]?.sales : 0;
    const yesterdaySales = len > 1 ? chartData[len - 2]?.sales : 0;
    const trend = todaySales >= yesterdaySales ? "up" : "down";

    return (
      <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
        <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
          <ShoppingBag className="h-5 w-5 text-green-400" /> تقارير المبيعات
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="glass border-white/5 p-4 rounded-xl flex flex-col justify-center">
            <div className="text-sm text-white/50 mb-1">المبيعات الإجمالية</div>
            <div className="flex items-end gap-2">
              <div className="text-2xl font-bold text-white">
                {rawTotalSales.toLocaleString()}{" "}
                <span className="text-sm font-normal text-white/40">ر.س</span>
              </div>
            </div>
          </Card>
          <Card className="glass border-white/5 p-4 rounded-xl flex flex-col justify-center">
            <div className="text-sm text-white/50 mb-1">
              صافي الإيرادات (بعد رسوم تابي/تمارا)
            </div>
            <div className="text-2xl font-bold text-green-400">
              {netRevenue.toLocaleString()}{" "}
              <span className="text-sm font-normal text-white/40">ر.س</span>
            </div>
          </Card>
          <Card className="glass border-white/5 p-4 rounded-xl flex flex-col justify-center">
            <div className="text-sm text-white/50 mb-1">صافي الأرباح</div>
            <div className="text-2xl font-bold text-blue-400">
              {netProfitAfterFees.toLocaleString()}{" "}
              <span className="text-sm font-normal text-white/40">ر.س</span>
            </div>
          </Card>
          <Card className="glass border-white/5 p-4 rounded-xl flex flex-col justify-center">
            <div className="text-sm text-white/50 mb-1">
              المصروفات التشغيلية
            </div>
            <div className="text-2xl font-bold text-red-400">
              {totalFilteredExpenses.toLocaleString()}{" "}
              <span className="text-sm font-normal text-white/40">ر.س</span>
            </div>
          </Card>
          <Card className="glass border-white/5 p-4 rounded-xl flex flex-col justify-center">
            <div className="text-sm text-white/50 mb-1">الضرائب (للدفع)</div>
            <div className="text-2xl font-bold text-orange-400">
              {taxes.toLocaleString()}{" "}
              <span className="text-sm font-normal text-white/40">ر.س</span>
            </div>
          </Card>
        </div>

        <Card className="glass border-white/5">
          <CardHeader>
            <CardTitle className="text-sm font-normal text-white/70">
              المبيعات والإيرادات حسب طريقة الدفع
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-7 gap-4">
              <div className="bg-white/5 px-3 py-4 rounded-lg flex flex-col justify-center items-center text-center min-h-[110px] h-full break-words">
                <div className="text-xs text-white/50 mb-2">كاش</div>
                <div className="font-bold text-sm md:text-base">
                  {paymentBreakdown.cash?.toLocaleString() || 0} ر.س
                </div>
              </div>
              <div className="bg-white/5 px-3 py-4 rounded-lg flex flex-col justify-center items-center text-center min-h-[110px] h-full break-words">
                <div className="text-xs text-white/50 mb-2">شبكة</div>
                <div className="font-bold text-sm md:text-base">
                  {paymentBreakdown.network?.toLocaleString() || 0} ر.س
                </div>
              </div>
              <div className="bg-white/5 px-3 py-4 rounded-lg flex flex-col justify-center items-center text-center min-h-[110px] h-full break-words">
                <div className="text-xs text-white/50 mb-2">تحويل بنكي</div>
                <div className="font-bold text-sm md:text-base">
                  {paymentBreakdown.transfer?.toLocaleString() || 0} ر.س
                </div>
              </div>
              <div className="bg-white/5 px-3 py-4 rounded-lg flex flex-col justify-center items-center text-center min-h-[110px] h-full break-words">
                <div className="text-xs text-white/50 mb-2 leading-tight">
                  دفع جزئي
                  <br />
                  (مقدم)
                </div>
                <div className="font-bold text-sm md:text-base">
                  {paymentBreakdown.partial?.toLocaleString() || 0} ر.س
                </div>
              </div>
              <div className="bg-white/5 px-3 py-4 rounded-lg flex flex-col justify-center items-center text-center min-h-[110px] h-full break-words">
                <div className="text-xs text-white/50 mb-2">تأجل (آجل)</div>
                <div className="font-bold text-sm md:text-base">
                  {paymentBreakdown.postponed?.toLocaleString() || 0} ر.س
                </div>
              </div>
              <div className="bg-white/5 px-3 py-4 rounded-lg border border-red-500/20 flex flex-col justify-center items-center text-center min-h-[110px] h-full break-words">
                <div className="text-xs text-white/50 mb-2">تابي</div>
                <div className="font-bold text-sm md:text-base text-orange-200">
                  {paymentBreakdown.tabby?.toLocaleString() || 0} ر.س
                </div>
              </div>
              <div className="bg-white/5 px-3 py-4 rounded-lg border border-red-500/20 flex flex-col justify-center items-center text-center min-h-[110px] h-full break-words">
                <div className="text-xs text-white/50 mb-2">تمارا</div>
                <div className="font-bold text-sm md:text-base text-orange-200">
                  {paymentBreakdown.tamara?.toLocaleString() || 0} ر.س
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-white/5">
          <CardHeader>
            <CardTitle className="text-sm font-normal text-white/70">
              أداء المبيعات (خلال الشهر الحالي)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#ffffff1a"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="formattedDate"
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
                    tickFormatter={(val) => `${val.toLocaleString()}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1c2128",
                      border: "1px solid #ffffff1a",
                      borderRadius: "8px",
                    }}
                    cursor={{ stroke: "#ffffff1a", strokeWidth: 2 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    name="المبيعات"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorSales)"
                    activeDot={{
                      r: 6,
                      fill: "#3b82f6",
                      stroke: "#fff",
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-white/5">
          <CardHeader>
            <CardTitle className="text-sm font-normal text-white/70">
              توزيع المبيعات بناءً على فئة المنتج (Category)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {categorySalesData.length > 0 ? (
              <div className="h-80 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categorySalesData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={110}
                      paddingAngle={2}
                      dataKey="value"
                      labelLine={false}
                      label={({ name, percent }) =>
                        `${name} (${(percent * 100).toFixed(0)}%)`
                      }
                    >
                      {categorySalesData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [
                        `${value.toLocaleString()} ر.س`,
                        "المبيعات",
                      ]}
                      contentStyle={{
                        backgroundColor: "#1c2128",
                        border: "1px solid #ffffff1a",
                        borderRadius: "8px",
                      }}
                      itemStyle={{ color: "#fff" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-white/40 text-sm">
                لا توجد بيانات متاحة
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-white/5 overflow-hidden">
          <CardHeader className="bg-white/5 border-b border-white/5 pb-4">
            <CardTitle className="text-sm font-bold">
              تفاصيل مبيعات الأيام (الشهر الحالي)
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="text-right whitespace-nowrap">
                    اليوم
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    المبيعات
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    الأرباح
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    مؤشر
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chartData
                  .filter(
                    (d) =>
                      d.sales > 0 ||
                      d.date === new Date().toISOString().split("T")[0],
                  )
                  .map((day, idx) => {
                    const prevSales = idx > 0 ? chartData[idx - 1].sales : 0;
                    const isUp = day.sales >= prevSales;
                    return (
                      <TableRow
                        key={day.date}
                        className="border-white/5 hover:bg-white/5"
                      >
                        <TableCell className="font-mono text-sm">
                          {day.date}
                        </TableCell>
                        <TableCell className="text-blue-400 font-bold">
                          {day.sales.toLocaleString()} ر.س
                        </TableCell>
                        <TableCell className="text-emerald-400">
                          {day.profit.toLocaleString()} ر.س
                        </TableCell>
                        <TableCell>
                          {isUp ? (
                            <div className="flex items-center gap-1 text-xs text-green-400">
                              <TrendingUp className="h-3 w-3" /> +({" "}
                              {Math.abs(day.sales - prevSales).toLocaleString()}{" "}
                              )
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-xs text-red-400">
                              <TrendingDown className="h-3 w-3" /> -({" "}
                              {Math.abs(day.sales - prevSales).toLocaleString()}{" "}
                              )
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    );
  };

  const renderPurchasesReport = () => {
    // We infer purchases from stock * costPrice
    const totalInventoryValue = catalog.reduce(
      (sum, item) => sum + item.costPrice * (item.stock || 0),
      0,
    );

    const activePurchases = filteredPurchases;

    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
          <Truck className="h-5 w-5 text-orange-400" /> تقارير المشتريات
          والمخزون
        </h2>
        <Card className="glass border-white/5 p-4 max-w-sm">
          <div className="text-sm text-white/50">
            إجمالي قيمة المخزون (بالتكلفة)
          </div>
          <div className="text-2xl font-bold text-orange-400">
            {totalInventoryValue.toLocaleString()} ر.س
          </div>
        </Card>

        <Card className="glass border-white/5 overflow-hidden">
          <CardHeader className="bg-white/5 border-b border-white/5 pb-4">
            <CardTitle className="text-sm font-bold">
              فواتير المشتريات (والمرتجعات)
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto max-h-96">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent sticky top-0 bg-[#0c101b]">
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
                    الإجمالي
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activePurchases.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-white/50 py-4"
                    >
                      لا توجد مشتريات في هذه الفترة.
                    </TableCell>
                  </TableRow>
                )}
                {activePurchases.map((p) => (
                  <TableRow
                    key={p.id}
                    className="border-white/5 hover:bg-white/5"
                  >
                    <TableCell className="text-white">
                      {new Date(p.date).toLocaleDateString("ar-EG")}
                    </TableCell>
                    <TableCell className="font-medium text-white">
                      {p.vendorName}
                    </TableCell>
                    <TableCell>
                      {p.type === "purchase" ? (
                        <Badge
                          variant="outline"
                          className="text-emerald-400 border-emerald-400/20"
                        >
                          مشتريات
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-rose-400 border-rose-400/20"
                        >
                          مرتجع
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-blue-400 font-bold">
                      {p.grandTotal.toLocaleString()} ر.س
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    );
  };

  const renderProductsReport = () => {
    const topProducts = activeSales
      .flatMap((o) => o.items)
      .reduce(
        (acc, item) => {
          const exist = acc.find((i) => i.name === item.name);
          if (exist) {
            exist.qty += item.qty;
          } else {
            acc.push({ name: item.name, qty: item.qty });
          }
          return acc;
        },
        [] as { name: string; qty: number }[],
      )
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
          <PackageCheck className="h-5 w-5 text-purple-400" /> تقارير المنتجات
        </h2>
        <Card className="glass border-white/5">
          <CardHeader>
            <CardTitle className="text-sm">أكثر المنتجات مبيعاً</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff1a" />
                <XAxis
                  dataKey="name"
                  stroke="#ffffff80"
                  fontSize={12}
                  tickFormatter={(val) => val.slice(0, 10)}
                />
                <YAxis stroke="#ffffff80" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1c2128",
                    border: "1px solid #ffffff1a",
                  }}
                  cursor={{ fill: "#ffffff0a" }}
                />
                <Bar dataKey="qty" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderStockReport = () => {
    const lowStock = catalog.filter((c) => (c.stock || 0) <= 5);
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
          <FileBarChart2 className="h-5 w-5 text-red-400" /> تقارير حركة
          المنتجات (نواقص المخزون)
        </h2>
        <Card className="glass border-white/5 p-4">
          <h3 className="font-bold mb-4">المنتجات منخفضة المخزون (5 أو أقل)</h3>
          <div className="space-y-2">
            {lowStock.length === 0 && (
              <p className="text-sm text-white/50">
                المخزون بوضع جيد ولا توجد نواقص.
              </p>
            )}
            {lowStock.map((p) => (
              <div
                key={p.id}
                className="flex justify-between p-2 rounded bg-white/5 text-sm"
              >
                <span>{p.name}</span>
                <span className="text-red-400 font-bold">{p.stock} حبة</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  };

  const renderTechnicianSalesReport = () => {
    const techSales = activeSales.reduce(
      (acc, order) => {
        if (order.technicianName) {
          const exist = acc.find((t) => t.name === order.technicianName);
          const taxRate = settings.defaultTaxRate || 15;
          const costWithTax = (order.totalCost || 0) * (1 + taxRate / 100);
          const profit = order.grandTotal - costWithTax;
          if (exist) {
            exist.salesCount += 1;
            exist.revenue += order.grandTotal;
            exist.profit += profit > 0 ? profit : 0;
            exist.commission += order.technicianCommission || 0;
          } else {
            acc.push({
              name: order.technicianName,
              salesCount: 1,
              operationsCount: 0,
              revenue: order.grandTotal,
              profit: profit > 0 ? profit : 0,
              commission: order.technicianCommission || 0,
              expenses: 0,
            });
          }
        }
        return acc;
      },
      [] as {
        name: string;
        salesCount: number;
        operationsCount: number;
        revenue: number;
        profit: number;
        commission: number;
        expenses: number;
      }[],
    );

    filteredTechOrders.forEach((to) => {
      if (to.technicianName) {
        const exist = techSales.find((t) => t.name === to.technicianName);
        if (exist) {
          exist.operationsCount += 1;
        } else {
          techSales.push({
            name: to.technicianName,
            salesCount: 0,
            operationsCount: 1,
            revenue: 0,
            profit: 0,
            commission: 0,
            expenses: 0,
          });
        }
      }
    });

    // Add expenses to each technician
    filteredExpensesGlobal.forEach((exp) => {
      if (exp.technicianName) {
        const exist = techSales.find((t) => t.name === exp.technicianName);
        if (exist) {
          exist.expenses += exp.amount;
        } else {
          techSales.push({
            name: exp.technicianName,
            salesCount: 0,
            operationsCount: 0,
            revenue: 0,
            profit: 0,
            commission: 0,
            expenses: exp.amount,
          });
        }
      }
    });

    techSales.sort((a, b) => b.revenue - a.revenue);

    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-indigo-400" /> مبيعات الفنيين
        </h2>
        <Card className="glass border-white/5 overflow-hidden">
          <CardHeader className="bg-white/5 border-b border-white/5 pb-4">
            <CardTitle className="text-sm font-bold">
              تقرير أداء الفنيين في المبيعات
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="text-right whitespace-nowrap">
                    اسم الفني
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    عدد المبيعات
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    العمليات (الصيانة)
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    إجمالي الإيرادات
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    المكسب
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    إجمالي العمولة
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    صافي الأرباح
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    المصروفات
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    صافي الفني
                  </TableHead>
                  <TableHead className="text-center whitespace-nowrap">
                    الإجراءات
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {techSales.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center text-white/50 py-4"
                    >
                      لا توجد مبيعات مسندة لفنيين في هذه الفترة.
                    </TableCell>
                  </TableRow>
                )}
                {techSales.map((tech) => (
                  <TableRow
                    key={tech.name}
                    className="border-white/5 hover:bg-white/5"
                  >
                    <TableCell className="font-medium text-white">
                      {tech.name}
                    </TableCell>
                    <TableCell className="text-blue-400 font-bold">
                      {tech.salesCount}
                    </TableCell>
                    <TableCell className="text-purple-400 font-bold">
                      {tech.operationsCount}
                    </TableCell>
                    <TableCell className="text-emerald-400 font-bold">
                      {tech.revenue.toLocaleString()} ر.س
                    </TableCell>
                    <TableCell className="text-blue-300 font-bold">
                      {tech.profit.toLocaleString()} ر.س
                    </TableCell>
                    <TableCell className="text-orange-400 font-bold">
                      {tech.commission.toLocaleString()} ر.س
                    </TableCell>
                    <TableCell className="text-green-400 font-bold">
                      {(tech.profit - tech.commission).toLocaleString()} ر.س
                    </TableCell>
                    <TableCell className="text-red-400 font-bold">
                      {tech.expenses.toLocaleString()} ر.س
                    </TableCell>
                    <TableCell className="text-amber-400 font-bold">
                      {(tech.commission - tech.expenses).toLocaleString()} ر.س
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-indigo-600/20 hover:bg-indigo-600 border-indigo-500/50 text-indigo-300 hover:text-white h-7 px-2 text-xs"
                        onClick={() => {
                          if (onPrintTechnicianStatement) {
                            const t_orders = activeSales.filter(o => o.technicianName === tech.name);
                            const t_expenses = filteredExpensesGlobal.filter(e => e.technicianName === tech.name);
                            const t_serviceOrders = filteredTechOrders.filter(to => to.technicianName === tech.name);
                            const techInventories = JSON.parse(localStorage.getItem("pos_tech_inventory") || "[]");
                            const t_inv = techInventories.find((i: any) => i.technicianName === tech.name);
                            const t_inventoryItems = t_inv ? t_inv.items : [];
                            onPrintTechnicianStatement(tech.name, t_orders, t_expenses, t_serviceOrders, t_inventoryItems);
                          }
                        }}
                      >
                        طباعة كشف
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    );
  };

  const renderExpensesReport = () => {
    // Independent filtering for Expenses Report
    const localFilteredExpenses = expenses.filter((e) => {
      const d = new Date(e.date);
      if (expenseFilterStart && d < expenseFilterStart) return false;
      if (expenseFilterEnd && d > expenseFilterEnd) return false;
      if (
        expenseCategoryFilter !== "all" &&
        e.category !== expenseCategoryFilter
      )
        return false;
      return true;
    });

    const uniqueCategories = Array.from(
      new Set(expenses.map((e) => e.category)),
    );

    // Calculate effective amount for each expense
    const getEffectiveAmount = (e: any): number =>
      Number(e.isTaxDeductible ? e.amount - (e.taxAmount || 0) : e.amount);

    // Group expenses by category
    const categoryTotals = localFilteredExpenses.reduce(
      (acc, exp) => {
        acc[exp.category] = (acc[exp.category] || 0) + getEffectiveAmount(exp);
        return acc;
      },
      {} as Record<string, number>,
    );

    const chartData: { name: string; value: number }[] = Object.entries(
      categoryTotals,
    )
      .map(([name, value]) => ({
        name,
        value: value as number,
      }))
      .sort((a, b) => b.value - a.value);

    // External vs Technician
    const externalExpensesTotal = localFilteredExpenses
      .filter((e) => !e.technicianName || e.technicianName === "none")
      .reduce((sum, e) => sum + getEffectiveAmount(e), 0);

    const techExpensesTotals = localFilteredExpenses
      .filter((e) => e.technicianName && e.technicianName !== "none")
      .reduce(
        (acc, exp) => {
          acc[exp.technicianName!] =
            (acc[exp.technicianName!] || 0) + getEffectiveAmount(exp);
          return acc;
        },
        {} as Record<string, number>,
      );

    const techChartData: { name: string; value: number }[] = Object.entries(
      techExpensesTotals,
    )
      .map(([name, value]) => ({ name, value: value as number }))
      .sort((a, b) => b.value - a.value);

    return (
      <div className="space-y-6 flex flex-col pt-2">
        {/* Independent Filters */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col md:flex-row gap-4 mb-4">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-white/50 block">من تاريخ</label>
            <Input
              type="date"
              value={expenseStartDate}
              onChange={(e) => setExpenseStartDate(e.target.value)}
              className="bg-black/20 border-white/10 w-full"
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs text-white/50 block">إلى تاريخ</label>
            <Input
              type="date"
              value={expenseEndDate}
              onChange={(e) => setExpenseEndDate(e.target.value)}
              className="bg-black/20 border-white/10 w-full"
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs text-white/50 block">التصنيف</label>
            <select
              value={expenseCategoryFilter}
              onChange={(e) => setExpenseCategoryFilter(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-md p-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">جميع التصنيفات</option>
              {uniqueCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col justify-between bg-white/5 p-4 rounded-xl border border-white/10">
            <div>
              <h3 className="text-white font-bold mb-1">إجمالي المصروفات</h3>
              <p className="text-white/50 text-sm">كافة المصروفات للفترة</p>
            </div>
            <div
              className="text-3xl font-bold text-red-500 mt-4 text-left"
              dir="ltr"
            >
              {chartData
                .reduce((sum, item) => sum + item.value, 0)
                .toLocaleString()}{" "}
              ر.س
            </div>
          </div>

          <div className="flex flex-col justify-between bg-white/5 p-4 rounded-xl border border-white/10">
            <div>
              <h3 className="text-white font-bold mb-1">مصروفات فنيين</h3>
              <p className="text-white/50 text-sm">المصروفات المسندة للفنيين</p>
            </div>
            <div
              className="text-3xl font-bold text-orange-400 mt-4 text-left"
              dir="ltr"
            >
              {techChartData
                .reduce((sum, item) => sum + item.value, 0)
                .toLocaleString()}{" "}
              ر.س
            </div>
          </div>

          <div className="flex flex-col justify-between bg-white/5 p-4 rounded-xl border border-white/10">
            <div>
              <h3 className="text-white font-bold mb-1">مصروفات خارجية</h3>
              <p className="text-white/50 text-sm">
                المصروفات العامة والإدارية
              </p>
            </div>
            <div
              className="text-3xl font-bold text-yellow-400 mt-4 text-left"
              dir="ltr"
            >
              {externalExpensesTotal.toLocaleString()} ر.س
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <Card className="glass border-white/10 p-6 flex flex-col justify-center">
            <h3 className="text-lg font-bold mb-4">
              توزيع المصروفات حسب التصنيف
            </h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    fill="#ef4444"
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                  >
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      border: "none",
                      borderRadius: "8px",
                      color: "#fff",
                    }}
                    itemStyle={{ color: "#fff" }}
                    formatter={(value: number) => [
                      `${value.toLocaleString()} ر.س`,
                      "المبلغ",
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="space-y-6 flex flex-col">
            <Card className="glass border-white/10 p-6 overflow-x-auto flex-1">
              <h3 className="text-lg font-bold mb-4">تفصيل مصروفات الفنيين</h3>
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-white/5">
                    <TableHead className="text-right">الفني</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {techChartData.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={2}
                        className="text-center text-white/50"
                      >
                        لا توجد مصروفات
                      </TableCell>
                    </TableRow>
                  ) : (
                    techChartData.map((item, i) => (
                      <TableRow
                        key={i}
                        className="border-white/10 hover:bg-white/5"
                      >
                        <TableCell className="font-medium text-white/90">
                          {item.name}
                        </TableCell>
                        <TableCell className="text-orange-400 font-bold">
                          {item.value.toLocaleString()} ر.س
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>

            <Card className="glass border-white/10 p-6 overflow-x-auto flex-1">
              <h3 className="text-lg font-bold mb-4">
                تفصيل مصروفات التصنيفات (حسب الفئة)
              </h3>
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-white/5">
                    <TableHead className="text-right">التصنيف</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chartData.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={2}
                        className="text-center text-white/50"
                      >
                        لا توجد مسجلات
                      </TableCell>
                    </TableRow>
                  ) : (
                    chartData.map((item, i) => (
                      <TableRow
                        key={i}
                        className="border-white/10 hover:bg-white/5"
                      >
                        <TableCell className="font-medium text-white/90">
                          {item.name}
                        </TableCell>
                        <TableCell className="text-red-400 font-bold">
                          {item.value.toLocaleString()} ر.س
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </div>
        </div>
      </div>
    );
  };

  const renderAll = () => (
    <div className="space-y-10">
      {renderSalesReport()}
      {renderExpensesReport()}
      {renderTechnicianSalesReport()}
      {renderCustomersReport()}
      {renderPurchasesReport()}
      {renderProductsReport()}
      {renderStockReport()}
    </div>
  );

  const handlePresetChange = (period: string) => {
    setActivePreset(period);
    const now = new Date();
    if (period === "all") {
      setStartDate("");
      setEndDate(now.toISOString().split("T")[0]);
    } else if (period === "today") {
      const todayStr = now.toISOString().split("T")[0];
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (period === "week") {
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 7);
      setStartDate(weekAgo.toISOString().split("T")[0]);
      setEndDate(now.toISOString().split("T")[0]);
    } else if (period === "month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(firstDay.toISOString().split("T")[0]);
      setEndDate(now.toISOString().split("T")[0]);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animation-fade-in pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/10">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <List className="h-6 w-6 text-blue-400" />
          التقارير
        </h1>

        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="hidden md:flex bg-indigo-600/20 hover:bg-indigo-600 border-indigo-500/50 text-indigo-300 hover:text-white"
          >
            <Printer className="w-4 h-4 ml-2" />
            طباعة التقارير
          </Button>

          {settings?.branches && settings.branches.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/50">الفرع:</span>
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger className="w-[140px] h-9 bg-black/20 border-white/10 text-xs">
                  <SelectValue placeholder="الفرع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الفروع</SelectItem>
                  {settings.branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {/* Quick Presets */}
          <div className="flex gap-1 bg-black/20 p-1 rounded-lg border border-white/5">
            {["all", "today", "week", "month"].map((period) => (
              <button
                key={period}
                onClick={() => handlePresetChange(period)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  activePreset === period
                    ? "bg-blue-600 text-white shadow"
                    : "text-white/60 hover:text-white hover:bg-white/5",
                )}
              >
                {period === "all" && "الكل"}
                {period === "today" && "اليوم"}
                {period === "week" && "هذا الأسبوع"}
                {period === "month" && "هذا الشهر"}
              </button>
            ))}
          </div>

          {/* Date Range Inputs */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-white/50 whitespace-nowrap">
                من تاريخ:
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setActivePreset("custom");
                }}
                className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500 h-9"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-white/50 whitespace-nowrap">
                إلى تاريخ:
              </span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setActivePreset("custom");
                }}
                className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500 h-9"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Internal Navigation Tabs */}
      <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-thin scrollbar-thumb-white/10">
        {reportTypes.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === tab.id
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-transparent",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="pt-4">
        {activeTab === "reports_customers" && renderCustomersReport()}
        {activeTab === "reports_sales" && renderSalesReport()}
        {activeTab === "reports_purchases" && renderPurchasesReport()}
        {activeTab === "reports_products" && renderProductsReport()}
        {activeTab === "reports_stock" && renderStockReport()}
        {activeTab === "reports_technicians" && renderTechnicianSalesReport()}
        {activeTab === "reports_expenses" && renderExpensesReport()}
        {activeTab === "reports_all" && renderAll()}
      </div>
    </div>
  );
}
