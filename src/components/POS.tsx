/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect } from "react";
import {
  CatalogItem,
  Customer,
  Order,
  OrderItem,
  OrderType,
  AppSettings,
} from "../types";
import { t } from "../lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Tag,
  CheckCircle2,
  XCircle,
  FileText,
  UserPlus,
  LayoutGrid,
  List,
} from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { storage } from "../services/storage";
import { ResponsiveContainer, LineChart, Line, Tooltip } from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface POSProps {
  settings: AppSettings;
  catalog: CatalogItem[];
  customers: Customer[];
  onComplete: (order: Order) => void;
  onAddCustomer: (customer: Customer) => void;
  editingOrder?: Order | null;
  initialServiceOrder?: any;
  onClearInitialServiceOrder?: () => void;
  onCancelEdit?: () => void;
}

export default function POS({
  settings,
  catalog,
  customers,
  onComplete,
  onAddCustomer,
  editingOrder,
  initialServiceOrder,
  onClearInitialServiceOrder,
  onCancelEdit,
}: POSProps) {
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [orderType, setOrderType] = useState<OrderType>("tax_invoice");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [paidAmount, setPaidAmount] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  const [customPrices, setCustomPrices] = useState<Record<string, number>>({});
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [techCommissionType, setTechCommissionType] = useState<
    "percent" | "fixed" | "profit"
  >("percent");
  const [techCommission, setTechCommission] = useState("5");
  const [technicianName, setTechnicianName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [cartDiscount, setCartDiscount] = useState("0"); // Global discount
  const [supplyRequestItem, setSupplyRequestItem] =
    useState<CatalogItem | null>(null);
  const [supplyQty, setSupplyQty] = useState("");
  const [showItemHistory, setShowItemHistory] = useState<CatalogItem | null>(
    null,
  );

  useEffect(() => {
    if (editingOrder) {
      setCart(editingOrder.items);
      setSelectedCustomerId(editingOrder.customerId);
      setOrderType(editingOrder.type);
      setPaymentMethod(editingOrder.paymentMethod || "cash");
      setPaidAmount(
        editingOrder.paidAmount ? editingOrder.paidAmount.toString() : "",
      );
      if (editingOrder.technicianCommissionPct) {
        setTechCommissionType("percent");
        setTechCommission(editingOrder.technicianCommissionPct.toString());
      } else if (editingOrder.technicianCommission) {
        setTechCommissionType("fixed");
        setTechCommission(editingOrder.technicianCommission.toString());
      } else {
        setTechCommissionType("percent");
        setTechCommission("5");
      }
      setTechnicianName(editingOrder.technicianName || "");
      setBranchId(editingOrder.branchId || "");
      setOrderNotes(editingOrder.notes || "");
      setCartDiscount(
        editingOrder.totalDiscount
          ? editingOrder.totalDiscount.toString()
          : "0",
      );
    } else if (initialServiceOrder) {
      if (initialServiceOrder.selectedProducts) {
        setCart(
          initialServiceOrder.selectedProducts.map((p: any) => ({
            catalogId: p.id,
            name: p.name,
            price: p.price,
            qty: p.qty,
            tax: 0,
            discount: 0,
          })),
        );
      } else {
        setCart([]);
      }
      setSelectedCustomerId(initialServiceOrder.customerId || "");
      setOrderType("tax_invoice");
      setPaymentMethod(initialServiceOrder.expectedPaymentMethod || "cash");
      if (initialServiceOrder.expectedPaymentMethod !== "credit") {
        setPaidAmount(initialServiceOrder.expectedAmount || "");
      } else {
        setPaidAmount("0");
      }
      setTechnicianName(initialServiceOrder.technicianName || "");
      setOrderNotes(
        `تم الدفع عبر مهمة صيانة / تركيب برقم: ${initialServiceOrder.id}`,
      );
      setCartDiscount("0");
    } else {
      if ((settings as any).currentTechnician) {
        setTechnicianName((settings as any).currentTechnician);
      }
    }
  }, [editingOrder, initialServiceOrder, settings]);

  const itemHistoryData = useMemo(() => {
    if (!showItemHistory) return [];

    // We want to combine tech logs and order logs?
    // Actually, tech logs have everything if it's related to tech.
    // If it's a general sale without tech, it's just in orders.
    // So let's fetch both.

    const logsOut: any[] = [];

    // 1. Tech Logs
    const techLogs: any[] = storage.getTechInventoryLogs?.() || [];
    const itemTechLogs = techLogs.filter(
      (l: any) => l.catalogId === showItemHistory.id,
    );
    itemTechLogs.forEach((log) => {
      logsOut.push({
        id: `techlog_${log.id}`,
        date: log.date,
        type: log.type, // 'add', 'pull', 'transfer_in', 'transfer_out', 'sale'
        qty: log.qty,
        technician: log.technicianName,
        customerName: log.customerName || "",
        note: `عملية فني: ${log.type === "add" ? "صرف للفني" : log.type === "pull" ? "سحب من الفني" : log.type === "transfer_in" ? "تحويل وارد" : log.type === "transfer_out" ? "تحويل صادر" : "مبيعات الكاشير"}`,
      });
    });

    // 2. Direct Sales (Orders without tech or where it was deducted from main stock)
    // Actually it's simpler to just look at all orders for this item and add them if they aren't already captured?
    // We just show the orders.
    const ordersItem = (storage.getOrders?.() || []).filter((o) =>
      o.items.some((i) => i.catalogId === showItemHistory.id),
    );
    ordersItem.forEach((order) => {
      // Check if this order is already in tech logs (type === 'sale' with tech) to avoid duplicates
      // Actually it's easier to just show all orders, but distinguish them.
      const orderItem = order.items.find(
        (i) => i.catalogId === showItemHistory.id,
      );
      if (!orderItem) return;

      const isTechLogExists = itemTechLogs.some(
        (tl) => tl.type === "sale" && tl.date === order.date,
      );
      if (!isTechLogExists) {
        logsOut.push({
          id: `order_${order.id}`,
          date: order.date,
          type: "sale_main",
          qty: orderItem.qty,
          technician: order.technicianName || "المستودع الرئيسي",
          customerName: order.customerName || "",
          note: `مبيعات كاشير (دايركت)`,
        });
      }
    });

    return logsOut.sort((a, b) => b.date - a.date);
  }, [showItemHistory]);

  const supplySparklineData = useMemo(() => {
    if (!supplyRequestItem) return [];

    const days = 30;
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const dataMap: Record<string, number> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split("T")[0];
      dataMap[dateStr] = 0;
    }

    const orders = storage.getOrders ? storage.getOrders() : [];
    const cutoffDate = new Date(
      now.getTime() - (days - 1) * 24 * 60 * 60 * 1000,
    );

    orders.forEach((order) => {
      const orderDate = new Date(order.date);
      if (orderDate >= cutoffDate) {
        const dStr = orderDate.toISOString().split("T")[0];
        if (dataMap[dStr] !== undefined) {
          order.items?.forEach((item) => {
            if (item.catalogId === supplyRequestItem.id) {
              dataMap[dStr] += item.qty;
            }
          });
        }
      }
    });

    return Object.entries(dataMap).map(([date, qty]) => ({
      date: date.substring(8, 10) + "/" + date.substring(5, 7),
      qty,
    }));
  }, [supplyRequestItem]);

  const [quickFilter, setQuickFilter] = useState<
    "all" | "best_seller" | "low_stock"
  >("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const categories = useMemo(() => {
    const cats = new Set(catalog.map((i) => i.category).filter(Boolean));
    return ["all", ...Array.from(cats)];
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    let filtered = catalog;

    if (selectedCategory !== "all") {
      filtered = filtered.filter((i) => i.category === selectedCategory);
    }

    const salesCount: Record<string, number> = {};
    const allOrders = storage.getOrders ? storage.getOrders() : [];
    allOrders.forEach((o: any) => {
      o.items?.forEach((i: any) => {
        if (i.catalogId) {
          salesCount[i.catalogId] = (salesCount[i.catalogId] || 0) + i.qty;
        }
      });
    });

    if (quickFilter === "best_seller") {
      filtered = [...filtered]
        .filter((item) => (salesCount[item.id] || 0) > 0)
        .sort((a, b) => (salesCount[b.id] || 0) - (salesCount[a.id] || 0));
    } else if (quickFilter === "low_stock") {
      filtered = filtered.filter(
        (item) =>
          item.type === "product" &&
          typeof item.stock === "number" &&
          item.stock <= 5,
      );
    }

    const s = searchTerm.toLowerCase().trim();
    if (s) {
      filtered = filtered.filter(
        (item) =>
          item.name?.toLowerCase().includes(s) ||
          item.sku?.toLowerCase().includes(s) ||
          item.category?.toLowerCase().includes(s) ||
          item.vendor?.toLowerCase().includes(s),
      );
    }

    return filtered;
  }, [catalog, searchTerm, quickFilter, selectedCategory]);

  const totals = useMemo(() => {
    let beforeTax = 0;
    let taxAmount = 0;
    let itemsDiscount = 0;
    let itemsCost = 0;

    cart.forEach((item) => {
      // item.price is considered INCLUSIVE of tax
      const lineInclusiveAfterItemDiscount =
        (item.price - item.discount) * item.qty;
      const lineBase = lineInclusiveAfterItemDiscount / (1 + item.tax / 100);
      const lineTax = lineInclusiveAfterItemDiscount - lineBase;
      const lineCost = (item.costPrice || 0) * item.qty;

      beforeTax += lineBase;
      itemsDiscount += item.discount * item.qty;
      taxAmount += lineTax;
      itemsCost += lineCost;
    });

    const globalDiscountAmount = parseFloat(cartDiscount) || 0;

    // Distribute global discount over the total tax proportionally if we want, or just recalculate tax over (grandTotal - globalDiscount)
    // Actually, simple way in Saudi VAT if dealing with final inclusive totals:
    // Total inclusive before global discount:
    const totalInclusive = beforeTax + taxAmount;
    const finalInclusive = Math.max(0, totalInclusive - globalDiscountAmount);

    // Reverse calculate base and tax from final inclusive (assuming uniform tax, or taking weighted average, but typically POS uses the default tax rate for cart-level discounts)
    const effectiveTaxRate = settings.defaultTaxRate || 15;
    const finalBase = finalInclusive / (1 + effectiveTaxRate / 100);
    const finalTax = finalInclusive - finalBase;

    return {
      beforeTax: finalBase,
      taxAmount: finalTax,
      discount: itemsDiscount + globalDiscountAmount,
      totalCost: itemsCost,
      grandTotal: finalInclusive,
    };
  }, [cart, cartDiscount, settings.defaultTaxRate]);

  const addToCart = (item: CatalogItem) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.catalogId === item.id);
      const isCustomPriceSet = customPrices[item.id] !== undefined;
      const overridePrice = isCustomPriceSet
        ? customPrices[item.id]
        : item.price;

      if (existing) {
        return prev.map((i) =>
          i.catalogId === item.id
            ? {
                ...i,
                qty: i.qty + 1,
                price: isCustomPriceSet ? overridePrice : i.price,
                discount: isCustomPriceSet ? 0 : i.discount,
              }
            : i,
        );
      }
      const initialDiscount =
        !isCustomPriceSet &&
        item.priceBeforeDiscount &&
        item.priceBeforeDiscount > item.price
          ? item.priceBeforeDiscount - item.price
          : 0;
      const basePrice =
        !isCustomPriceSet &&
        item.priceBeforeDiscount &&
        item.priceBeforeDiscount > item.price
          ? item.priceBeforeDiscount
          : overridePrice;

      return [
        ...prev,
        {
          catalogId: item.id,
          name: item.name,
          price: basePrice,
          costPrice: item.costPrice,
          tax: item.tax || settings.defaultTaxRate || 15,
          qty: 1,
          discount: initialDiscount,
        },
      ];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.catalogId === id) {
          const newQty = Math.max(1, item.qty + delta);
          return { ...item, qty: newQty };
        }
        return item;
      }),
    );
  };

  const updatePrice = (id: string, newPrice: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.catalogId === id) {
          return { ...item, price: newPrice };
        }
        return item;
      }),
    );
  };

  const updateDiscount = (id: string, newDiscount: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.catalogId === id) {
          return { ...item, discount: newDiscount };
        }
        return item;
      }),
    );
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((i) => i.catalogId !== id));
  };

  const handleFinish = () => {
    if (cart.length === 0) return;
    setShowPayDialog(true);
  };

  const confirmPayment = () => {
    const customer = customers.find((c) => c.id === selectedCustomerId);

    if (customer && customer.type === "lead") {
      const updatedCustomer: Customer = { ...customer, type: "customer" };
      onAddCustomer(updatedCustomer);
    }

    let parsedPaidAmount = totals.grandTotal;
    if (paymentMethod === "partial") {
      parsedPaidAmount = parseFloat(paidAmount) || 0;
    } else if (paymentMethod === "postponed" || paymentMethod === "credit") {
      parsedPaidAmount = 0;
    }
    const remainingAmount = totals.grandTotal - parsedPaidAmount;

    const effectiveTaxRate = settings.defaultTaxRate || 15;
    const costWithTax = totals.totalCost * (1 + effectiveTaxRate / 100);
    const profit = totals.grandTotal - costWithTax;
    let absCommission = 0;
    let commPct = 0;
    const commValue = parseFloat(techCommission) || 0;

    if (techCommissionType === "percent") {
      commPct = commValue;
      absCommission = profit > 0 ? profit * (commPct / 100) : 0;
    } else if (techCommissionType === "profit") {
      absCommission = profit > 0 ? profit : 0;
    } else {
      absCommission = commValue;
    }

    const order: Order = {
      id: editingOrder
        ? editingOrder.id
        : Math.random().toString(36).substr(2, 9),
      customerId: selectedCustomerId || "walk-in",
      customerName: customer?.name || "عميل نقدي",
      paymentMethod: orderType === "quotation" ? "none" : paymentMethod,
      paidAmount: orderType === "quotation" ? 0 : parsedPaidAmount,
      remainingAmount:
        orderType === "quotation" ? totals.grandTotal : remainingAmount,
      items: cart,
      type: orderType,
      date: editingOrder ? editingOrder.date : Date.now(),
      technicianCommission: absCommission,
      technicianCommissionPct: commPct,
      technicianName,
      branchId:
        branchId ||
        (settings?.branches && settings.branches.length > 0
          ? settings.branches[0].id
          : ""),
      totalBeforeTax: totals.beforeTax,
      totalCost: totals.totalCost,
      totalTax: totals.taxAmount,
      totalDiscount: totals.discount,
      grandTotal: totals.grandTotal,
      status: editingOrder ? editingOrder.status : "active",
      notes: orderNotes,
    };
    onComplete(order);
    if (onCancelEdit) onCancelEdit();
    setCart([]);
    setSelectedCustomerId("");
    setCartDiscount("0");
    setTechCommission("0");
    setTechnicianName("");
    setOrderNotes("");
    setPaymentMethod("cash");
    setPaidAmount("");
    setShowPayDialog(false);
  };

  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [customerSelectOpen, setCustomerSelectOpen] = useState(false);
  const [showAddCustomerDialog, setShowAddCustomerDialog] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustCity, setNewCustCity] = useState("");
  const [newCustDistrict, setNewCustDistrict] = useState("");

  const filteredCustomers = useMemo(() => {
    const s = customerSearchTerm.toLowerCase().trim();
    if (!s) return customers;
    return customers.filter(
      (c) =>
        c.name?.toLowerCase().includes(s) || c.phone?.toLowerCase().includes(s),
    );
  }, [customers, customerSearchTerm]);

  return (
    <div className="flex flex-col lg:flex-row h-full gap-4 overflow-y-auto lg:overflow-hidden w-full px-0 sm:px-2 pb-20 lg:pb-0">
      {/* Right: Catalog Grid (First in RTL flex) */}
      <div className="flex-1 flex flex-col gap-4 order-2 lg:order-1 min-h-[420px] lg:min-h-0">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-3 h-4 w-4 text-white/40" />
            <Input
              className="pr-10 bg-white/5 border-white/10 h-12 text-center text-lg placeholder:text-right"
              placeholder="ابحث عن منتج بالاسم، الكود (SKU)، التصنيف، أو المورد..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            className="h-12 border-white/10 shrink-0 text-orange-400 hover:bg-orange-400/20 hover:text-orange-300 w-full sm:w-auto"
            onClick={() => {
              setCart((prev) => [
                ...prev,
                {
                  catalogId: "manual_" + Math.random().toString(),
                  name: "منتج/خدمة مخصصة",
                  price: 0,
                  costPrice: 0,
                  tax: settings.defaultTaxRate || 15,
                  qty: 1,
                  discount: 0,
                },
              ]);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> إضافة عنصر يدوي
          </Button>
        </div>

        <div
          className="flex items-center gap-2 mb-2 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "none" }}
        >
          {categories.map((cat, idx) => (
            <Button
              key={`${cat}-${idx}`}
              variant={selectedCategory === cat ? "secondary" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(cat)}
              className={
                selectedCategory === cat
                  ? "bg-purple-500 text-white hover:bg-purple-600 border-transparent whitespace-nowrap"
                  : "border-white/10 text-white/70 hover:bg-white/10 whitespace-nowrap"
              }
            >
              {cat === "all" ? "جميع التصنيفات" : cat}
            </Button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-white/5 pb-3">
          <div
            className="flex items-center gap-2 overflow-x-auto pb-1"
            style={{ scrollbarWidth: "none" }}
          >
            <Button
              variant={quickFilter === "all" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setQuickFilter("all")}
              className={`whitespace-nowrap ${
                quickFilter === "all"
                  ? "bg-white text-black hover:bg-white/90 font-bold"
                  : "border-white/10 text-white/70 hover:bg-white/10"
              }`}
            >
              الكل
            </Button>
            <Button
              variant={quickFilter === "best_seller" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setQuickFilter("best_seller")}
              className={`whitespace-nowrap ${
                quickFilter === "best_seller"
                  ? "bg-blue-500 text-white hover:bg-blue-600 border-transparent font-bold"
                  : "border-white/10 text-white/70 hover:bg-white/10"
              }`}
            >
              الأكثر مبيعاً
            </Button>
            <Button
              variant={quickFilter === "low_stock" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setQuickFilter("low_stock")}
              className={`whitespace-nowrap ${
                quickFilter === "low_stock"
                  ? "bg-red-500 text-white hover:bg-red-600 border-transparent font-bold"
                  : "border-white/10 text-white/70 hover:bg-white/10"
              }`}
            >
              ناقص المخزون
            </Button>
          </div>

          <div className="flex bg-[#18181b] p-1 rounded-lg border border-white/10 self-start sm:self-auto shrink-0 overflow-x-auto max-w-full">
            <Button
              variant={viewMode === "cards" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("cards")}
              className={`h-7 text-xs px-3 font-semibold ${
                viewMode === "cards"
                  ? "bg-white/10 text-white shadow-sm font-bold"
                  : "text-white/50 hover:text-white"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5 ml-1.5" />
              البطاقات
            </Button>
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("table")}
              className={`h-7 text-xs px-3 font-semibold ${
                viewMode === "table"
                  ? "bg-white/10 text-white shadow-sm font-bold"
                  : "text-white/50 hover:text-white"
              }`}
            >
              <List className="h-3.5 w-3.5 ml-1.5" />
              الجدول
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          {viewMode === "cards" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 pb-4 pr-0 sm:pr-3">
              {filteredCatalog.map((item, idx) => (
                <Card
                  key={`${item.id}-${idx}`}
                  className="group cursor-pointer hover:bg-white/[0.08] transition-all bg-white/5 border-white/10 overflow-hidden flex flex-row items-center p-3 h-28"
                  onClick={() => addToCart(item)}
                >
                  {item.image ? (
                    <div className="w-20 h-20 ml-3 rounded border border-white/10 overflow-hidden bg-white/5 flex-shrink-0">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-20 h-20 ml-3 rounded border border-white/10 flex items-center justify-center bg-white/5 flex-shrink-0 text-white/20 text-xs text-center">
                      بدون
                      <br />
                      صورة
                    </div>
                  )}
                  <div className="flex-1 flex flex-col justify-between h-full w-[calc(100%-6rem)] py-1">
                    <div className="flex justify-between items-start gap-1">
                      <div className="flex flex-wrap gap-1 mb-1">
                        {item.category && (
                          <Badge
                            variant="outline"
                            className="text-[9px] h-4 py-0 px-1 border-purple-500/30 text-purple-300 hover:bg-purple-500/20 cursor-pointer transition-colors z-10 relative"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCategory(item.category!);
                            }}
                          >
                            {item.category}
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className="text-[9px] h-4 py-0 px-1 text-white/70"
                        >
                          {item.type === "product" ? "منتج" : "خدمة"}
                        </Badge>
                      </div>
                      {item.isBundle && (
                        <Badge className="bg-orange-600 hover:bg-orange-600 text-[9px] h-4 py-0 px-1 whitespace-nowrap">
                          مجمع
                        </Badge>
                      )}
                    </div>
                    <div className="mb-auto">
                      <h3 className="font-bold group-hover:text-green-400 transition-colors line-clamp-2 leading-tight text-sm">
                        {item.name}
                      </h3>
                    </div>
                    <div className="flex justify-between items-end mt-1">
                      <div className="flex flex-col">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-bold text-green-400">
                              {customPrices[item.id] !== undefined
                                ? customPrices[item.id]
                                : item.price}{" "}
                              ر.س
                            </span>
                          </div>
                          {(item.priceBeforeDiscount ?? 0) > item.price && (
                            <span className="text-[10px] text-red-400 line-through -mt-1 ml-1">
                              {item.priceBeforeDiscount} ر.س
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-white/40 line-clamp-1">
                          {item.sku}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {item.type === "product" &&
                          item.stock !== undefined && (
                            <div
                              className={`text-[10px] ${item.stock < 5 ? "text-red-400 font-bold" : "text-white/50"}`}
                            >
                              المتوفر: {item.stock}
                            </div>
                          )}
                        {item.type === "product" &&
                          item.stock !== undefined &&
                          item.stock < 5 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-2 py-0 text-[9px] bg-blue-500/20 hover:bg-blue-500/40 text-blue-400 rounded"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSupplyRequestItem(item);
                              }}
                            >
                              طلب توريد
                            </Button>
                          )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="bg-black/10 rounded-xl border border-white/5 overflow-hidden sm:ml-3 pb-4">
              <div className="overflow-x-auto">
                <Table className="text-right border-none">
                  <TableHeader className="bg-white/5 border-b border-white/10">
                    <TableRow className="hover:bg-transparent border-white/5">
                      <TableHead className="w-16"></TableHead>
                      <TableHead className="text-right text-xs text-white/60">
                        الاسم
                      </TableHead>
                      <TableHead className="text-right text-xs text-white/60">
                        رقم الموديل (SKU)
                      </TableHead>
                      <TableHead className="text-right text-xs text-white/60">
                        التصنيف
                      </TableHead>
                      <TableHead className="text-right text-xs text-white/60">
                        النوع
                      </TableHead>
                      <TableHead className="text-right text-xs text-white/60">
                        المخزون المتوفر
                      </TableHead>
                      <TableHead className="text-right text-xs text-white/60">
                        السعر
                      </TableHead>
                      <TableHead className="text-center text-xs text-white/60 w-32">
                        الإجراء
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCatalog.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="text-center text-white/40 py-8"
                        >
                          لا توجد أصناف مطابقة للبحث الحالي.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredCatalog.map((item, idx) => (
                        <TableRow
                          key={`${item.id}-${idx}`}
                          className="border-white/5 hover:bg-white/[0.04] transition-colors cursor-pointer"
                          onClick={() => addToCart(item)}
                        >
                          <TableCell className="py-2.5">
                            {item.image ? (
                              <img
                                src={item.image}
                                alt={item.name}
                                className="w-10 h-10 object-cover rounded border border-white/10 bg-white/5"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded border border-white/10 flex items-center justify-center bg-white/5 text-white/20 text-[10px] text-center">
                                بدون صورة
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-bold text-sm py-2.5 text-white hover:text-green-400">
                            <div className="flex flex-col">
                              <span>{item.name}</span>
                              {item.isBundle && (
                                <span className="text-[10px] text-orange-400 bg-orange-400/10 px-1 py-0.5 rounded w-fit mt-1">
                                  منتج مجمع/حزمة
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-white/60 py-2.5">
                            {item.sku || "—"}
                          </TableCell>
                          <TableCell className="py-2.5">
                            {item.category ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] border-purple-500/30 text-purple-300 hover:bg-purple-500/20 cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCategory(item.category!);
                                }}
                              >
                                {item.category}
                              </Badge>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-xs py-2.5">
                            <Badge
                              variant="outline"
                              className="text-[10px] text-white/70"
                            >
                              {item.type === "product" ? "منتج" : "خدمة"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs py-2.5">
                            {item.type === "product" &&
                            item.stock !== undefined ? (
                              <span
                                className={
                                  item.stock < 5
                                    ? "text-red-400 font-bold"
                                    : "text-white/80"
                                }
                              >
                                {item.stock} وحدات
                              </span>
                            ) : (
                              <span className="text-white/40">خدمة مستمرة</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2.5">
                            <div className="flex flex-col text-right items-end">
                              <div className="flex items-center gap-1 justify-end">
                                <span className="text-sm font-bold text-green-400">
                                  {customPrices[item.id] !== undefined
                                    ? customPrices[item.id]
                                    : item.price}{" "}
                                  ر.س
                                </span>
                              </div>
                              {(item.priceBeforeDiscount ?? 0) > item.price && (
                                <span className="text-[10px] text-red-400 line-through mt-0.5">
                                  {item.priceBeforeDiscount} ر.س
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell
                            className="text-center py-2.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-center gap-1.5">
                              <Button
                                size="sm"
                                className="bg-purple-600 hover:bg-purple-500 h-8 px-3 text-xs shadow-md font-bold text-white"
                                onClick={() => addToCart(item)}
                              >
                                <Plus className="h-3 w-3 ml-1" />
                                إضافة
                              </Button>
                              {item.type === "product" &&
                                item.stock !== undefined &&
                                item.stock < 5 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-[10px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded border border-blue-500/20"
                                    onClick={() => {
                                      setSupplyRequestItem(item);
                                    }}
                                  >
                                    طلب توريد
                                  </Button>
                                )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Left: Cart & Summary (Second in RTL flex) */}
      <Card className="w-full lg:w-96 flex flex-col glass border-white/5 shrink-0 order-1 lg:order-2 h-[55dvh] min-h-[340px] lg:h-full lg:min-h-0 overflow-hidden">
        <CardContent className="p-3 sm:p-4 flex flex-col h-full gap-3 sm:gap-4 overflow-hidden min-h-0">
          <div className="flex items-center justify-between gap-2 mx-auto overflow-visible w-full mt-2">
            <Badge
              variant={orderType === "tax_invoice" ? "outline" : "outline"}
              className={`cursor-pointer px-2 py-0.5 flex-1 text-center justify-center font-bold text-sm h-10 ${orderType === "tax_invoice" ? "border-[#073832] text-white bg-[#073832]" : "border-white/10 text-white/50"}`}
              onClick={() => setOrderType("tax_invoice")}
            >
              فاتورة ضريبية
            </Badge>
            <Badge
              variant={orderType === "quotation" ? "outline" : "outline"}
              className={`cursor-pointer px-2 py-0.5 flex-1 text-center justify-center font-bold text-sm h-10 ${orderType === "quotation" ? "border-[#073832] text-white bg-[#073832]" : "border-white/10 text-white/50"}`}
              onClick={() => setOrderType("quotation")}
            >
              عرض سعر
            </Badge>
          </div>

          <div className="flex flex-col gap-2 relative mt-2">
            <Label>العميل (ابحث بالاسم أو الجوال)</Label>
            <div className="relative">
              <Input
                placeholder="رقم أو اسم العميل..."
                value={customerSearchTerm}
                onChange={(e) => {
                  setCustomerSearchTerm(e.target.value);
                  setCustomerSelectOpen(true);
                  if (e.target.value === "") setSelectedCustomerId("");
                }}
                onFocus={() => setCustomerSelectOpen(true)}
                className="bg-white/5 border-white/10 text-white"
              />
              {customerSelectOpen && customerSearchTerm && (
                <div className="absolute z-50 w-full mt-1 bg-[#1c2128] border border-white/10 rounded-md shadow-lg max-h-60 overflow-auto">
                  {filteredCustomers.length === 0 ? (
                    <div className="p-3 text-sm text-white text-center flex flex-col gap-2">
                      <span>لا يوجد عميل بهذا الاسم أو الرقم</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-500 text-white w-full"
                        onClick={() => {
                          const isPhone = /^[0-9]+$/.test(customerSearchTerm);
                          const newName = isPhone
                            ? "عميل جديد"
                            : customerSearchTerm;
                          const newPhone = isPhone ? customerSearchTerm : "";
                          setNewCustName(newName);
                          setNewCustPhone(newPhone);
                          setNewCustCity("");
                          setNewCustDistrict("");
                          setShowAddCustomerDialog(true);
                          setCustomerSelectOpen(false);
                        }}
                      >
                        <UserPlus className="h-4 w-4 ml-2" />
                        إضافة {customerSearchTerm} كعميل جديد
                      </Button>
                    </div>
                  ) : (
                    filteredCustomers.map((c, idx) => (
                      <div
                        key={`${c.id}-${idx}`}
                        className="p-2 cursor-pointer hover:bg-white/10 border-b border-white/5 last:border-0 flex flex-col"
                        onClick={() => {
                          setSelectedCustomerId(c.id);
                          setCustomerSearchTerm(`${c.name} - ${c.phone}`);
                          setCustomerSelectOpen(false);
                        }}
                      >
                        <span className="font-bold text-white">{c.name}</span>
                        <span className="text-xs text-white/70">
                          {c.phone} {c.taxNumber ? " (ضريبي)" : ""}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            {selectedCustomerId && (
              <p className="text-xs text-green-400">تم اختيار العميل بنجاح</p>
            )}
          </div>

          {cart.length > 0 && (
            <div className="flex justify-between items-center px-1 pb-1 border-b border-white/5">
              <span className="text-xs text-white/50 font-medium">المنتجات المختارة ({cart.length})</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-400 hover:text-red-300 hover:bg-red-400/10 h-7 text-xs font-semibold px-2"
                onClick={() => {
                  setCart([]);
                  if (onClearInitialServiceOrder)
                    onClearInitialServiceOrder();
                  if (onCancelEdit) onCancelEdit();
                }}
              >
                <Trash2 className="w-3.5 h-3.5 ml-1.5" />
                إفراغ السلة
              </Button>
            </div>
          )}

          <ScrollArea className="flex-1 overflow-auto min-h-0 mt-2">
            <div className="flex flex-col gap-2 pr-0 sm:pr-4 pt-1 pb-2">
              {cart.map((item, idx) => (
                <div
                  key={`${item.catalogId}-${idx}`}
                  className="bg-black/20 hover:bg-white/5 rounded-md p-1 px-2 border border-white/5 flex flex-col justify-center gap-1 relative transition-colors h-[64px] shrink-0 w-full"
                >
                  <div className="flex justify-between items-center gap-1.5 h-6">
                    <div className="flex-1 min-w-0">
                      <Input
                        value={item.name}
                        readOnly
                        className="h-5 w-full font-bold text-[12px] text-white/90 bg-transparent border-transparent hover:border-white/10 px-1 truncate focus-visible:ring-1"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-red-500 hover:text-red-400 hover:bg-red-500/20 shrink-0"
                      onClick={() => removeFromCart(item.catalogId)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between gap-1 h-6">
                    <div className="flex items-center gap-0.5 bg-black/40 rounded border border-white/5 shrink-0 h-[22px] px-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-white/70 hover:text-white"
                        onClick={() => updateQty(item.catalogId, -1)}
                      >
                        <Minus className="h-2.5 w-2.5" />
                      </Button>
                      <Input
                        type="number"
                        className="w-7 h-5 text-center font-bold text-[12px] px-0 bg-transparent border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus-visible:ring-0"
                        value={item.qty}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCart((prev) =>
                            prev.map((i) =>
                              i.catalogId === item.catalogId
                                ? {
                                    ...i,
                                    qty: (val === ""
                                      ? ""
                                      : parseInt(val) || 0) as any,
                                  }
                                : i,
                            ),
                          );
                        }}
                        onBlur={(e) => {
                          const val = parseInt(e.target.value);
                          if (isNaN(val) || val <= 0) {
                            setCart((prev) =>
                              prev.map((i) =>
                                i.catalogId === item.catalogId
                                  ? { ...i, qty: 1 }
                                  : i,
                              ),
                            );
                          }
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-white/70 hover:text-white"
                        onClick={() => updateQty(item.catalogId, 1)}
                      >
                        <Plus className="h-2.5 w-2.5" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5 text-[11px] text-white/50">
                        <span className="shrink-0">سعر</span>
                        <Input
                          type="number"
                          value={item.price || ""}
                          onChange={(e) => {
                            updatePrice(
                              item.catalogId,
                              parseFloat(e.target.value) || 0,
                            );
                          }}
                          className="h-4 w-10 px-0 py-0 text-[11px] font-bold bg-transparent border-b border-transparent hover:border-white/10 text-center text-white/75 focus-visible:ring-0"
                          dir="ltr"
                        />
                      </div>

                      <div className="flex items-center gap-0.5 text-[11px] text-green-300">
                        <span className="shrink-0 font-medium">صافي</span>
                        <Input
                          type="number"
                          value={Math.max(0, item.price - item.discount) || ""}
                          onChange={(e) => {
                            const finalPrice = parseFloat(e.target.value) || 0;
                            updateDiscount(
                              item.catalogId,
                              item.price - finalPrice,
                            );
                          }}
                          className="h-4 w-10 px-0 py-0 text-[11px] font-bold bg-transparent border-b border-transparent hover:border-white/10 text-center text-green-300 focus-visible:ring-0"
                          dir="ltr"
                        />
                      </div>

                      <div className="flex items-center border-r border-white/10 pr-2 pl-0.5 h-4 shrink-0">
                        <span
                          className="font-black text-[12px] text-green-400 font-sans"
                          dir="ltr"
                        >
                          {((item.price - item.discount) * item.qty).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {cart.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-white/20">
                  <ShoppingCart className="h-12 w-12 mb-2" />
                  <p>السلة فارغة</p>
                </div>
              )}
            </div>
          </ScrollArea>

          <Card className="bg-black/60 border border-white/10 shrink-0 mt-auto h-[182px] flex flex-col justify-between p-3 rounded-xl shadow-2xl relative z-10">
            <div className="grid grid-cols-3 gap-1 text-center border-b border-white/5 pb-1.5">
              <div className="flex flex-col gap-0.5 justify-center items-center">
                <span className="text-[11px] text-white/50">{t("total", settings)}</span>
                <span className="text-[13px] text-white font-medium font-sans">{totals.beforeTax.toFixed(2)} ر.س</span>
              </div>
              <div className="flex flex-col gap-0.5 justify-center items-center border-x border-white/5">
                <span className="text-[11px] text-red-300/80">{t("discount", settings)}</span>
                <span className="text-[13px] text-red-400 font-medium font-sans">-{totals.discount.toFixed(2)} ر.س</span>
              </div>
              <div className="flex flex-col gap-0.5 justify-center items-center">
                <span className="text-[11px] text-white/50">{t("tax", settings)}</span>
                <span className="text-[13px] text-white font-medium font-sans">
                  {totals.taxAmount > 0 ? `${totals.taxAmount.toFixed(2)} ر.س` : "0.00 ر.س"}
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center flex-row-reverse h-7 -my-1">
              <Input
                type="number"
                value={cartDiscount}
                onChange={(e) => setCartDiscount(e.target.value)}
                className="w-16 bg-white/5 border-white/10 text-right h-6 px-1.5 text-xs text-white font-semibold focus-visible:ring-1"
              />
              <span className="text-orange-300 text-[11px] font-medium">
                خصم إضافي (على الإجمالي)
              </span>
            </div>

            <div className="border-t border-white/10 pt-1 flex justify-between font-bold text-sm text-white flex-row-reverse items-center">
              <span className="text-green-400 text-base font-sans font-bold">
                {totals.grandTotal.toFixed(2)} ر.س
              </span>
              <span>{t("grand_total", settings)}</span>
            </div>

            <Button
              className="w-full bg-green-600 hover:bg-green-500 text-white h-9 text-xs font-bold shadow-lg shadow-green-900/10 active:scale-[0.98] transition-transform flex items-center justify-center gap-1.5 rounded-lg"
              disabled={cart.length === 0}
              onClick={handleFinish}
            >
              <CheckCircle2 className="h-4 w-4" />
              {t("pay", settings)}
            </Button>
          </Card>
        </CardContent>
      </Card>

      {/* Pay Dialog */}
      <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <DialogContent className="glass border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>{t("pay_dialog_title", settings)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-between p-4 bg-white/5 rounded-lg">
              <span>{t("grand_total", settings)}:</span>
              <span className="text-2xl font-bold text-green-400">
                {totals.grandTotal.toFixed(2)} ر.س
              </span>
            </div>
            {orderType === "tax_invoice" && (
              <div className="space-y-2">
                <Label className="text-white">
                  {t("payment_method", settings)}
                </Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "cash", label: t("cash", settings) },
                    { id: "network", label: t("card", settings) },
                    { id: "transfer", label: t("transfer", settings) },
                    { id: "partial", label: t("partial", settings) },
                    { id: "postponed", label: t("postponed", settings) },
                    { id: "tabby", label: t("tabby", settings) },
                    { id: "tamara", label: t("tamara", settings) },
                  ].map((pm) => (
                    <Button
                      key={pm.id}
                      variant="outline"
                      className={`h-10 border-white/10 ${paymentMethod === pm.id ? "bg-green-600/20 border-green-500 text-green-400" : "bg-white/5 text-white/70 hover:bg-white/10"}`}
                      onClick={() => setPaymentMethod(pm.id)}
                    >
                      {pm.label}
                    </Button>
                  ))}
                </div>
                {paymentMethod === "partial" && (
                  <div className="mt-4 p-4 border border-white/10 rounded-lg space-y-4 bg-white/5">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 space-y-2">
                        <Label>المبلغ المدفوع (مقدم)</Label>
                        <Input
                          type="number"
                          value={paidAmount}
                          onChange={(e) => setPaidAmount(e.target.value)}
                          className="bg-black/20 border-white/10"
                        />
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label>المتبقي (آجل)</Label>
                        <div className="h-10 px-3 py-2 bg-black/40 border border-white/10 rounded-md text-orange-400 font-bold">
                          {Math.max(
                            0,
                            totals.grandTotal - (parseFloat(paidAmount) || 0),
                          ).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-white">ملاحظات الفاتورة (كاملة)</Label>
              <textarea
                rows={3}
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-md p-2 text-white placeholder-white/30"
                placeholder="اكتب ملاحظاتك هنا لتظهر للعميل في الفاتورة..."
              />
            </div>
            {settings?.branches && settings.branches.length > 0 && (
              <div className="space-y-2">
                <Label className="text-white">الفرع (نقطة البيع)</Label>
                <Select
                  value={branchId || settings.branches[0].id}
                  onValueChange={setBranchId}
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue placeholder="اختر الفرع..." />
                  </SelectTrigger>
                  <SelectContent>
                    {settings.branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {(() => {
              const allTechnicians = [
                ...(settings.users?.filter((u) => u.role === "technician") ||
                  []),
                ...(settings.technicians?.map((t) =>
                  typeof t === "string" ? { name: t } : t,
                ) || []),
              ];
              const uniqueTechs = Array.from(
                new Map(allTechnicians.map((t) => [t.name, t])).values(),
              );

              if (uniqueTechs.length > 0) {
                return (
                  <div className="space-y-2">
                    <Label className="text-white">
                      تخصيص فني (لتقارير المبيعات)
                    </Label>
                    <Select
                      value={technicianName}
                      onValueChange={setTechnicianName}
                      disabled={!!(settings as any).currentTechnician}
                    >
                      <SelectTrigger className="bg-white/5 border-white/10 text-white">
                        <SelectValue placeholder="اختر الفني..." />
                      </SelectTrigger>
                      <SelectContent>
                        {uniqueTechs.map((t: any) => {
                          const tName = typeof t === "string" ? t : t.name;
                          return (
                            <SelectItem key={tName} value={tName}>
                              {tName}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }
              return null;
            })()}
            <div className="space-y-2">
              <Label className="text-white">عمولة الفني</Label>
              <div className="flex gap-2">
                <Select
                  value={techCommissionType}
                  onValueChange={(val) =>
                    setTechCommissionType(val as "percent" | "fixed" | "profit")
                  }
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="profit">كامل الربح</SelectItem>
                    <SelectItem value="percent">نسبة مئوية (%)</SelectItem>
                    <SelectItem value="fixed">مبلغ ثابت</SelectItem>
                  </SelectContent>
                </Select>
                {techCommissionType !== "profit" && (
                  <Input
                    type="number"
                    value={techCommission}
                    onChange={(e) => setTechCommission(e.target.value)}
                    className="bg-white/5 border-white/10 text-white flex-1"
                    placeholder={
                      techCommissionType === "percent"
                        ? "مثال: 5"
                        : "المبلغ بالريال"
                    }
                  />
                )}
              </div>
              <p className="text-[10px] text-white/50">
                {techCommissionType === "profit"
                  ? "* ملاحظة: العمولة ستكون كامل الربح (البيع بعد الضريبة - التكلفة بعد الضريبة)."
                  : techCommissionType === "percent"
                    ? "* ملاحظة: العائد المادي للعمولة يحسب تلقائياً من (البيع بعد الضريبة - التكلفة بعد الضريبة)."
                    : "* ملاحظة: سيتم إضافة هذا المبلغ كعمولة ثابتة للفني."}
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowPayDialog(false)}
              className="border-white/10"
            >
              {t("cancel", settings)}
            </Button>
            <Button
              onClick={confirmPayment}
              className="bg-green-600 hover:bg-green-500"
            >
              {t("confirm_payment", settings)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supply Request Dialog */}
      <Dialog
        open={!!supplyRequestItem}
        onOpenChange={() => setSupplyRequestItem(null)}
      >
        <DialogContent className="glass border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>طلب توريد منتج</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm">المنتج</label>
              <Input
                value={supplyRequestItem?.name || ""}
                readOnly
                className="bg-white/5 border-white/10 text-white/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm">الكمية المطلوبة</label>
              <Input
                type="number"
                value={supplyQty}
                onChange={(e) => setSupplyQty(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
                placeholder="أدخل الكمية"
              />
            </div>
            {supplySparklineData.length > 0 && (
              <div className="pt-2">
                <label className="text-xs text-white/50 mb-2 block">
                  استهلاك الـ 30 يوم الماضية (
                  {supplySparklineData.reduce((acc, curr) => acc + curr.qty, 0)}{" "}
                  وحدة)
                </label>
                <div className="h-[80px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={supplySparklineData}>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#18181b",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "8px",
                        }}
                        itemStyle={{ color: "#60a5fa" }}
                        labelStyle={{ color: "#a1a1aa" }}
                        labelFormatter={(label) => `التاريخ: ${label}`}
                        formatter={(value) => [`${value} وحده`, "الاستهلاك"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="qty"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setSupplyRequestItem(null)}
              className="border-white/10 text-white hover:bg-white/5"
            >
              إلغاء
            </Button>
            <Button
              onClick={() => {
                if (!supplyQty || !supplyRequestItem) return;

                const vendorName = supplyRequestItem.vendor || "المورد";
                const text = `مرحباً ${vendorName}،\nنحتاج إلى طلب المنتجات التالية:\n\n- ${supplyRequestItem.name}\n- الكمية: ${supplyQty}\n\nالرجاء إفادتنا بالسعر والتوفر. شكراً لك.`;

                const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
                window.open(url, "_blank");
                setSupplyRequestItem(null);
                setSupplyQty("");
              }}
              className="bg-green-600 hover:bg-green-500 text-white"
            >
              إرسال الطلب (واتساب)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!showItemHistory}
        onOpenChange={(open) => !open && setShowItemHistory(null)}
      >
        <DialogContent className="glass border-white/10 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg">
              سجل حركة الصنف: {showItemHistory?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <ScrollArea className="h-[400px] w-full rounded-md border border-white/10 bg-black/20 p-2">
              <div className="space-y-2">
                {itemHistoryData.length === 0 ? (
                  <div className="text-center text-white/50 py-10">
                    لا توجد أي حركات مسجلة لهذا الصنف.
                  </div>
                ) : (
                  itemHistoryData.map((log: any) => (
                    <div
                      key={log.id}
                      className="flex justify-between items-center p-3 rounded-lg bg-white/5 border border-white/5 text-sm"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="font-semibold">{log.note}</div>
                        <div className="text-xs text-white/70">
                          {log.technician && (
                            <span className="ml-2">
                              الجهة/الفني: {log.technician}
                            </span>
                          )}
                          {log.customerName && (
                            <span className="text-blue-300">
                              العميل: {log.customerName}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-white/50">
                          {new Date(log.date).toLocaleString("ar-SA")}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Badge
                          variant="outline"
                          className={
                            log.type === "add"
                              ? "bg-blue-900/20 text-blue-400 border-blue-500/30"
                              : log.type === "sale" || log.type === "sale_main"
                                ? "bg-purple-900/20 text-purple-400 border-purple-500/30"
                                : log.type === "transfer_in"
                                  ? "bg-teal-900/20 text-teal-400 border-teal-500/30"
                                  : log.type === "transfer_out"
                                    ? "bg-red-900/20 text-red-400 border-red-500/30"
                                    : "bg-orange-900/20 text-orange-400 border-orange-500/30"
                          }
                        >
                          {log.type === "add"
                            ? "منصرف"
                            : log.type === "sale" || log.type === "sale_main"
                              ? "مباع"
                              : log.type === "transfer_in"
                                ? "وارد"
                                : log.type === "transfer_out"
                                  ? "صادر"
                                  : "مسحوب"}
                        </Badge>
                        <span className="font-bold font-mono text-lg">
                          {log.qty} وحدة
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowItemHistory(null)}
              className="border-white/10"
            >
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showAddCustomerDialog}
        onOpenChange={setShowAddCustomerDialog}
      >
        <DialogContent className="glass border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة عميل جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>الاسم</Label>
              <Input
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                className="bg-black/20 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label>رقم الجوال</Label>
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
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddCustomerDialog(false)}
              className="text-white border-white/10"
            >
              إلغاء
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => {
                if (
                  !newCustName ||
                  !newCustPhone ||
                  !newCustCity ||
                  !newCustDistrict
                ) {
                  toast.error("يرجى تعبئة الاسم، الجوال، المدينة، والحي");
                  return;
                }
                const newCustomer: Customer = {
                  id: Math.random().toString(36).substr(2, 9),
                  name: newCustName,
                  phone: newCustPhone,
                  type: "customer",
                  createdAt: Date.now(),
                  locations: [
                    {
                      id: Math.random().toString(36).substr(2, 9),
                      address: newCustDistrict,
                      district: newCustDistrict,
                      type: "تم الإضافة من نقطة البيع",
                      city: newCustCity,
                    },
                  ],
                };
                onAddCustomer(newCustomer);
                setSelectedCustomerId(newCustomer.id);
                setCustomerSearchTerm(
                  `${newCustomer.name} - ${newCustomer.phone}`,
                );
                toast.success("تمت إضافة العميل بنجاح واختياره");
                setShowAddCustomerDialog(false);
              }}
            >
              تأكيد وحفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
