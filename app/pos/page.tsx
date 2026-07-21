"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useApp, useT } from "@/lib/store";
import {
  Card,
  PageTitle,
  Button,
  Input,
  Select,
  SearchableSelect,
  Modal,
  Table,
} from "@/components/ui";
import {
  OrderItem,
  Order,
  OrderType,
  PaymentMethod,
  CommissionType,
  uid,
  getLocationMapUrl,
  getLocationLabel,
} from "@/lib/types";
import InvoicePrint from "@/components/InvoicePrint";
import { openGoogleMaps, openWhatsApp } from "@/lib/whatsapp";
import { IconMapPin } from "@/components/icons";
import SalesHistoryPanel from "@/components/SalesHistoryPanel";
import { createCheckoutTransaction } from "@/lib/modules/pos/checkoutService";
import { submitServerCheckoutTransaction } from "@/lib/modules/pos/serverCheckoutClient";
import { recordAuditLog } from "@/lib/modules/audit/service";
import { mutationQueue } from "@/lib/modules/sync/mutationQueue";
import { enqueueIndexedDbMutation } from "@/lib/modules/offline/indexedDbQueue";
import { USE_SERVER_CHECKOUT, generateIdempotencyKey, ORG_ID, BRANCH_ID } from "@/lib/featureFlags";

type ViewMode = "cards" | "table";
type StockFilter = "all" | "low_stock";
type POSTab = "checkout" | "history";

export default function POSPage() {
  const {
    catalog,
    setCatalog,
    customers,
    setCustomers,
    orders,
    setOrders,
    settings,
    setSettings,
    users,
    urgentOrders,
    appointments,
    techInventory,
    setTechInventory,
    techInventoryLogs,
    setTechInventoryLogs,
    techFinancialLogs,
    setTechFinancialLogs,
    activeUser,
  } = useApp();
  const t = useT();

  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [orderType, setOrderType] = useState<OrderType>("tax_invoice");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paidAmount, setPaidAmount] = useState("");
  const [branchName, setBranchName] = useState(settings.branches?.[0] || "");
  const [cartDiscount, setCartDiscount] = useState("0");
  const [technicianName, setTechnicianName] = useState("");
  const [requiredSpecialty, setRequiredSpecialty] = useState("");
  const [scheduledMaintenanceDate, setScheduledMaintenanceDate] = useState("");
  const [commissionType, setCommissionType] =
    useState<CommissionType>("percentage");
  const [commissionValue, setCommissionValue] = useState(
    String(settings.technicianCompletionCommissionPercent ?? 5),
  );
  const [referralName, setReferralName] = useState("");
  const [referralPhone, setReferralPhone] = useState("");
  const [referralCommission, setReferralCommission] = useState("0");
  const [notes, setNotes] = useState("");
  const [invoiceCompanyName, setInvoiceCompanyName] = useState("");
  const [invoiceTaxNumber, setInvoiceTaxNumber] = useState("");
  const [invoiceContactPhone, setInvoiceContactPhone] = useState("");
  const [invoiceAddress, setInvoiceAddress] = useState("");
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [posTab, setPosTab] = useState<POSTab>("checkout");

  // Location add modal (shown after invoice for customers without a location)
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationCustomerId, setLocationCustomerId] = useState("");
  const [locationMapsUrl, setLocationMapsUrl] = useState("");
  const [locationCity, setLocationCity] = useState("");
  const [locationDistrict, setLocationDistrict] = useState("");
  const canUpdateLocation =
    Boolean(activeUser?.permissions?.canUpdateCustomerLocation) ||
    activeUser?.role === "admin";

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId),
    [customers, customerId],
  );

  useEffect(() => {
    if (!selectedCustomer) {
      setInvoiceCompanyName("");
      setInvoiceTaxNumber("");
      setInvoiceContactPhone("");
      setInvoiceAddress("");
      return;
    }

    setInvoiceCompanyName(selectedCustomer.companyName || selectedCustomer.name || "");
    setInvoiceTaxNumber(selectedCustomer.taxNumber || "");
    setInvoiceContactPhone(selectedCustomer.phone || "");
    setInvoiceAddress(selectedCustomer.locations?.[0]?.address || "");
  }, [selectedCustomer]);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");

  const technicians = users.filter((u) => u.role === "technician");
  const matchedTechnicians = useMemo(() => {
    if (!requiredSpecialty) return technicians;
    return technicians.filter((tech) =>
      (tech.specialties || []).includes(requiredSpecialty),
    );
  }, [technicians, requiredSpecialty]);
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...(settings.productCategories || settings.categories || []),
            ...catalog.map((c) => c.category || "غير مصنف"),
          ].filter(Boolean),
        ),
      ) as string[],
    [catalog, settings.productCategories, settings.categories],
  );

  const marketerContacts = useMemo(() => {
    const map = new Map<string, string>();
    const add = (name?: string, phone?: string) => {
      const cleanName = (name || "").trim();
      if (!cleanName) return;
      if (!map.has(cleanName) || phone)
        map.set(cleanName, (phone || map.get(cleanName) || "").trim());
    };
    technicians.forEach((tech) => add(tech.name, tech.phone));
    orders.forEach((order) => add(order.referralName, order.referralPhone));
    urgentOrders.forEach((order) =>
      add(order.marketerName, order.marketerPhone),
    );
    appointments.forEach((order) =>
      add(order.marketerName, order.marketerPhone),
    );
    return Array.from(map.entries()).map(([name, phone]) => ({ name, phone }));
  }, [technicians, orders, urgentOrders, appointments]);

  const updateReferralName = (name: string) => {
    setReferralName(name);
    const match = marketerContacts.find(
      (m) => m.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (match?.phone) setReferralPhone(match.phone);
  };

  const useTechnicianAsMarketer = () => {
    const tech = technicians.find((u) => u.name === technicianName);
    if (!tech) return;
    setReferralName(tech.name);
    setReferralPhone(tech.phone);
  };

  const filteredCatalog = useMemo(() => {
    const q = search.toLowerCase();
    return catalog.filter((c) => {
      const matchesSearch =
        !q ||
        (c.name || "").toLowerCase().includes(q) ||
        (c.sku || "").toLowerCase().includes(q) ||
        (c.category || "").toLowerCase().includes(q) ||
        (c.vendorName || "").toLowerCase().includes(q);
      const matchesStock =
        stockFilter === "all" ||
        (c.type === "product" && (c.stock ?? 0) <= (c.lowStockThreshold ?? 3));
      const matchesCategory = !categoryFilter || c.category === categoryFilter;
      return matchesSearch && matchesStock && matchesCategory;
    });
  }, [catalog, search, stockFilter, categoryFilter]);

  const addToCart = (catalogId: string) => {
    const item = catalog.find((c) => c.id === catalogId);
    if (!item) return;
    setCart((prev) => {
      const existing = prev.find((p) => p.catalogId === catalogId);
      if (existing)
        return prev.map((p) =>
          p.catalogId === catalogId ? { ...p, qty: p.qty + 1 } : p,
        );
      return [
        ...prev,
        {
          catalogId,
          name: item.name,
          price: item.price,
          priceBeforeDiscount: item.priceBeforeDiscount,
          tax: item.tax,
          qty: 1,
          discount: 0,
        },
      ];
    });
  };

  const addManualItem = () => {
    const price = Number(manualPrice);
    if (!manualName.trim() || !price) return;
    setCart((prev) => [
      ...prev,
      {
        catalogId: uid("manual"),
        name: manualName.trim(),
        price,
        tax: settings.defaultTaxRate,
        qty: 1,
        discount: 0,
        isManualItem: true,
      },
    ]);
    setManualName("");
    setManualPrice("");
    setManualOpen(false);
  };

  const updateQty = (catalogId: string, qty: number) =>
    setCart((prev) =>
      prev.map((p) =>
        p.catalogId === catalogId ? { ...p, qty: Math.max(1, qty) } : p,
      ),
    );
  const updateDiscount = (catalogId: string, discount: number) =>
    setCart((prev) =>
      prev.map((p) =>
        p.catalogId === catalogId
          ? { ...p, discount: Math.max(0, discount) }
          : p,
      ),
    );
  const updatePrice = (catalogId: string, price: number) =>
    setCart((prev) =>
      prev.map((p) =>
        p.catalogId === catalogId ? { ...p, price: Math.max(0, price) } : p,
      ),
    );
  const removeFromCart = (catalogId: string) =>
    setCart((prev) => prev.filter((p) => p.catalogId !== catalogId));

  const totals = useMemo(() => {
    const subtotalGross = cart.reduce((s, it) => s + it.price * it.qty, 0);
    const lineDiscounts = cart.reduce((s, it) => s + it.discount, 0);
    const cartDiscountAmount = Number(cartDiscount) || 0;
    const totalDiscount = lineDiscounts + cartDiscountAmount;
    const totalTax = cart.reduce((s, it) => {
      const lineGross = it.price * it.qty;
      const net = lineGross / (1 + it.tax / 100);
      return s + (lineGross - net);
    }, 0);
    const totalBeforeTax = subtotalGross - totalTax - totalDiscount;
    const grandTotal = subtotalGross - totalDiscount;

    const estimatedProfit = cart.reduce((s, it) => {
      const catalogItem = catalog.find((c) => c.id === it.catalogId);
      const cost = catalogItem?.costPrice ?? 0;
      return s + (it.price - cost) * it.qty - it.discount;
    }, 0);

    return {
      totalBeforeTax,
      totalTax,
      totalDiscount,
      grandTotal,
      estimatedProfit,
    };
  }, [cart, cartDiscount, catalog]);

  const computedCommission = useMemo(() => {
    if (!technicianName) return 0;
    if (commissionType === "percentage")
      return (totals.grandTotal * (Number(commissionValue) || 0)) / 100;
    if (commissionType === "fixed") return Number(commissionValue) || 0;
    return Math.max(0, totals.estimatedProfit);
  }, [technicianName, commissionType, commissionValue, totals]);

  const computedMarketingCommission = useMemo(() => {
    if (!referralName.trim()) return 0;
    const marketerIsTechnician = technicians.some(
      (tech) =>
        tech.name.trim().toLowerCase() === referralName.trim().toLowerCase(),
    );
    if (!marketerIsTechnician) return Number(referralCommission) || 0;
    return (
      (totals.grandTotal *
        (settings.technicianMarketingCommissionPercent ?? 25)) /
      100
    );
  }, [
    referralName,
    referralCommission,
    technicians,
    totals.grandTotal,
    settings.technicianMarketingCommissionPercent,
  ]);

  const runCheckout = async () => {
    // ── Server-side checkout (feature flag) ───────────────────────────────
    if (USE_SERVER_CHECKOUT && ORG_ID) {
      const idempotencyKey = generateIdempotencyKey("checkout");
      const tech = technicians.find((u) => u.name === technicianName);

      // Calculate totals the same way local checkout does
      const cartDiscount_ = Number(cartDiscount) || 0;
      const totalTax_ = cart.reduce((s, it) => {
        const lineSubtotal = it.price * it.qty - (it.discount || 0);
        return s + lineSubtotal * ((it.tax || 0) / 100);
      }, 0);
      const subtotalGross = cart.reduce((s, it) => s + it.price * it.qty - (it.discount || 0), 0);
      const totalDiscount_ = cartDiscount_ + cart.reduce((s, it) => s + (it.discount || 0), 0);
      const totalBeforeTax_ = subtotalGross - totalTax_ - cartDiscount_;
      const grandTotal_ = subtotalGross - cartDiscount_;
      const paidAmt = (paymentMethod === "cash" || paymentMethod === "card" || paymentMethod === "transfer")
        ? (Number(paidAmount) || grandTotal_)
        : (Number(paidAmount) || 0);
      const remaining_ = Math.max(0, grandTotal_ - paidAmt);

      const serverResult = await submitServerCheckoutTransaction({
        organizationId:       ORG_ID,
        branchId:             BRANCH_ID,
        idempotencyKey,
        invoiceNumber:        `INV-${settings.nextInvoiceNumber ?? Date.now()}`,
        customerId:           selectedCustomer?.id,
        customerName:         selectedCustomer?.name || t("pos_walkin"),
        invoiceType:          (orderType || "tax_invoice") as import("@/lib/types").OrderType,
        paymentMethod:        (paymentMethod || "cash") as import("@/lib/types").PaymentMethod,
        paidAmount:           paidAmt,
        remainingAmount:      remaining_,
        totalBeforeTax:       totalBeforeTax_,
        totalTax:             totalTax_,
        totalDiscount:        totalDiscount_,
        grandTotal:           grandTotal_,
        technicianId:         tech?.id,
        technicianName:       technicianName || undefined,
        technicianCommission: computedCommission,
        marketingCommission:  computedMarketingCommission,
        useTechnicianStock:   Boolean(technicianName && settings.allowMainStockFallbackForTechnicianSales === false),
        items: cart.map((item) => {
          const catItem = catalog.find(c => c.id === item.catalogId);
          return {
            catalogId:   item.catalogId,
            productId:   item.catalogId,
            itemName:    item.name,
            quantity:    item.qty,
            unitPrice:   item.price,
            unitCost:    catItem?.costPrice || 0,
            discount:    item.discount || 0,
            taxRate:     item.tax || 0,
            lineTotal:   item.price * item.qty - (item.discount || 0),
          };
        }),
      });

      if (!serverResult.ok) {
        const msg = serverResult.error || (settings.language === "ar"
          ? "فشل الحفظ على الخادم. لم تُنشأ الفاتورة."
          : "Server checkout failed. Invoice was not created.");
        alert(msg);
        recordAuditLog({ user: activeUser, action: "invoice.create.server.failed", details: msg });
        return; // No silent fallback — no local invoice created
      }

      recordAuditLog({
        user:    activeUser,
        action:  "invoice.create.server",
        details: `${serverResult.invoiceNumber} - ${selectedCustomer?.name || t("pos_walkin")} - ${grandTotal_.toFixed(2)} ${settings.currency}`,
      });
      setSettings({ ...settings, nextInvoiceNumber: (settings.nextInvoiceNumber ?? 1) + 1 });
      setConfirmOpen(false);
      setCart([]); setPaidAmount(""); setCartDiscount("0"); setTechnicianName("");
      setRequiredSpecialty(""); setNotes(""); setInvoiceCompanyName(""); setInvoiceTaxNumber("");
      alert(settings.language === "ar"
        ? `✅ تم إنشاء الفاتورة ${serverResult.invoiceNumber} — الإجمالي: ${grandTotal_.toFixed(2)} ${settings.currency}`
        : `✅ Invoice ${serverResult.invoiceNumber} created — Total: ${grandTotal_.toFixed(2)} ${settings.currency}`);
      return;
    }

    // ── Local checkout (default) ──────────────────────────────────────────
    const result = createCheckoutTransaction(
      {
        cart,
        customer: selectedCustomer,
        orderType,
        paymentMethod,
        paidAmountInput: paidAmount,
        branchName,
        cartDiscountInput: cartDiscount,
        technicianName,
        requiredSpecialty,
        scheduledMaintenanceDateInput: scheduledMaintenanceDate,
        commissionType,
        referralName,
        referralPhone,
        notes,
        invoiceCompanyName,
        invoiceTaxNumber,
        invoiceContactPhone,
        invoiceAddress,
        computedCommission,
        computedMarketingCommission,
        walkInLabel: t("pos_walkin"),
        activeUser,
      },
      {
        catalog,
        techInventory,
        techInventoryLogs,
        settings,
        technicians,
      }
    );

    if (!result.ok) {
      alert(settings.language === "ar" ? result.messageAr : result.messageEn);
      return;
    }

    setOrders([...orders, result.order]);
    setSettings({
      ...settings,
      nextInvoiceNumber: result.nextInvoiceNumber,
    });
    setCatalog(result.nextCatalog);
    if (result.newTechInventoryLogs.length > 0) {
      setTechInventory(result.nextTechInventory);
      setTechInventoryLogs([...techInventoryLogs, ...result.newTechInventoryLogs]);
    }
    if (result.newTechFinancialLogs.length > 0) {
      setTechFinancialLogs([...techFinancialLogs, ...result.newTechFinancialLogs]);
    }

    recordAuditLog({
      user: activeUser,
      action: "invoice.create.local",
      details: `${result.order.invoiceNumber} - ${result.order.customerName} - ${result.order.grandTotal.toFixed(2)} ${settings.currency}`,
    });

    const queuedMutation = mutationQueue.enqueue("invoice.create.local", {
      orderId: result.order.id,
      invoiceNumber: result.order.invoiceNumber,
      grandTotal: result.order.grandTotal,
      createdAt: result.order.date,
    });
    enqueueIndexedDbMutation(queuedMutation).catch(() => {
      // IndexedDB is an enhancement for offline sync. localStorage queue remains the fallback.
    });

    setLastOrder(result.order);
    setCart([]);
    setPaidAmount("");
    setCartDiscount("0");
    setTechnicianName("");
    setRequiredSpecialty("");
    setScheduledMaintenanceDate("");
    setCommissionValue(String(settings.technicianCompletionCommissionPercent ?? 5));
    setReferralName("");
    setReferralPhone("");
    setReferralCommission("0");
    setNotes("");
    setInvoiceCompanyName("");
    setInvoiceTaxNumber("");
    setInvoiceContactPhone("");
    setInvoiceAddress("");
    setConfirmOpen(false);

    if (
      selectedCustomer &&
      canUpdateLocation &&
      (selectedCustomer.locations || []).length === 0
    ) {
      setLocationCustomerId(selectedCustomer.id);
      setLocationMapsUrl("");
      setLocationCity("");
      setLocationDistrict("");
      setLocationModalOpen(true);
    }
  };

  const saveCustomerLocation = () => {
    if (!locationCustomerId) return;
    const newLoc = {
      id: uid("loc"),
      address: [locationCity, locationDistrict].filter(Boolean).join("، "),
      type: "pos_added",
      label: locationCity || undefined,
      googleMapsUrl: locationMapsUrl || undefined,
      mapLink: locationMapsUrl || undefined,
      city: locationCity || undefined,
      district: locationDistrict || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setCustomers(
      customers.map((c) =>
        c.id === locationCustomerId
          ? { ...c, locations: [...(c.locations || []), newLoc] }
          : c,
      ),
    );
    setLocationModalOpen(false);
  };

  const printInvoice = () => window.print();

  const invoiceWhatsAppMessage = (order: Order) => {
    const locale = settings.language === "ar" ? "ar-SA" : "en-US";
    const nextMaintenance = order.nextMaintenanceDate || order.scheduledMaintenanceDate;
    const nextMaintenanceLine = nextMaintenance ? `موعد الزيارة القادم: ${new Date(nextMaintenance).toLocaleDateString(locale)}` : "";
    const fallback = "مرحبًا {اسم_العميل}\nتم إصدار فاتورتكم رقم {رقم_الفاتورة}\nالإجمالي: {الإجمالي} {العملة}\n{موعد_الصيانة_القادم}\nشكرًا لكم.";
    return (settings.invoiceWhatsAppTemplate || fallback)
      .replaceAll("{اسم_العميل}", order.customerName || "")
      .replaceAll("{رقم_الفاتورة}", order.invoiceNumber || "")
      .replaceAll("{الإجمالي}", order.grandTotal.toFixed(2))
      .replaceAll("{العملة}", settings.currency)
      .replaceAll("{موعد_الصيانة_القادم}", nextMaintenanceLine)
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  const sendInvoiceWhatsApp = (order: Order) => {
    const customer = customers.find((c) => c.id === order.customerId);
    const phone = order.invoiceContactPhone || customer?.phone || "";
    if (!phone) {
      alert(
        settings.language === "ar"
          ? "لا يوجد رقم جوال للعميل."
          : "Customer phone is missing.",
      );
      return;
    }
    openWhatsApp(phone, invoiceWhatsAppMessage(order));
  };

  const printAndSendInvoice = (order: Order) => {
    window.print();
    sendInvoiceWhatsApp(order);
  };

  return (
    <div>
      <PageTitle title={t("pos_title")} />

      <div className="no-print mb-4 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setPosTab("checkout")}
          className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
            posTab === "checkout"
              ? "bg-brand-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          {settings.language === "ar" ? "نقطة البيع" : "Point of Sale"}
        </button>
        <button
          type="button"
          onClick={() => setPosTab("history")}
          className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
            posTab === "history"
              ? "bg-brand-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          {settings.language === "ar" ? "سجل المبيعات" : "Sales history"}
        </button>
      </div>

      {posTab === "checkout" ? (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input
              placeholder={t("pos_search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-[180px] flex-1"
            />
            <div className="flex overflow-hidden rounded border border-slate-300">
              <button
                onClick={() => setViewMode("cards")}
                className={`px-3 py-2 text-xs ${viewMode === "cards" ? "bg-brand-600 text-white" : "bg-white"}`}
              >
                {t("pos_view_cards")}
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`px-3 py-2 text-xs ${viewMode === "table" ? "bg-brand-600 text-white" : "bg-white"}`}
              >
                {t("pos_view_table")}
              </button>
            </div>
            <Button variant="secondary" onClick={() => setManualOpen(true)}>
              {t("pos_manual_item")}
            </Button>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setStockFilter("all")}
              className={`rounded-full px-3 py-1 text-xs ${stockFilter === "all" ? "bg-brand-600 text-white" : "bg-slate-100"}`}
            >
              {t("pos_filter_all")}
            </button>
            <button
              onClick={() => setStockFilter("low_stock")}
              className={`rounded-full px-3 py-1 text-xs ${stockFilter === "low_stock" ? "bg-brand-600 text-white" : "bg-slate-100"}`}
            >
              {t("pos_filter_low_stock")}
            </button>
            {categories.length > 0 && (
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="max-w-[160px] text-xs"
              >
                <option value="">
                  {t("pos_filter_category")}: {t("pos_filter_all")}
                </option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </div>

          {viewMode === "cards" ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {filteredCatalog.map((item) => (
                <button
                  key={item.id}
                  onClick={() => addToCart(item.id)}
                  className="rounded border border-slate-200 p-3 text-left hover:border-brand-500 hover:bg-brand-50"
                >
                  <div className="text-sm font-medium">{item.name}</div>
                  <div className="text-xs text-slate-500">
                    {item.price.toFixed(2)} {settings.currency}
                  </div>
                  {item.type === "product" &&
                    (item.stock ?? 0) <= (item.lowStockThreshold ?? 3) && (
                      <div className="mt-1 text-[10px] font-medium text-amber-600">
                        {t("pos_filter_low_stock")}: {item.stock ?? 0}
                      </div>
                    )}
                </button>
              ))}
              {filteredCatalog.length === 0 && (
                <p className="col-span-full text-sm text-slate-400">
                  {t("pos_no_catalog")}
                </p>
              )}
            </div>
          ) : (
            <Table
              headers={[
                t("name"),
                t("category"),
                t("price"),
                t("catalog_stock"),
              ]}
            >
              {filteredCatalog.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                  onClick={() => addToCart(item.id)}
                >
                  <td className="px-2 py-2">{item.name}</td>
                  <td className="px-2 py-2 text-slate-500">
                    {item.category || "—"}
                  </td>
                  <td className="px-2 py-2">{item.price.toFixed(2)}</td>
                  <td className="px-2 py-2">
                    {item.type === "product" ? (item.stock ?? 0) : "—"}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">{t("pos_cart_title")}</h2>
          <div className="mb-3 max-h-64 space-y-2 overflow-y-auto">
            {cart.map((it) => (
              <div
                key={it.catalogId}
                className="rounded border border-slate-100 p-2 text-sm"
              >
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex-1 truncate font-medium">{it.name}</div>
                  <button
                    onClick={() => removeFromCart(it.catalogId)}
                    className="ms-2 text-red-500"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <label className="text-slate-400">{t("qty")}</label>
                  <input
                    type="number"
                    min={1}
                    value={it.qty}
                    onChange={(e) =>
                      updateQty(it.catalogId, Number(e.target.value))
                    }
                    className="w-14 rounded border border-slate-300 p-1 text-center"
                  />
                  <label className="text-slate-400">{t("price")}</label>
                  <input
                    type="number"
                    min={0}
                    value={it.price}
                    onChange={(e) =>
                      updatePrice(it.catalogId, Number(e.target.value))
                    }
                    className="w-20 rounded border border-slate-300 p-1 text-center"
                    title={t("pos_edit_price")}
                  />
                  <label className="ms-2 text-slate-400">{t("discount")}</label>
                  <input
                    type="number"
                    min={0}
                    value={it.discount || ""}
                    placeholder="0"
                    onChange={(e) =>
                      updateDiscount(it.catalogId, Number(e.target.value))
                    }
                    className="w-16 rounded border border-slate-300 p-1 text-center"
                  />
                </div>
              </div>
            ))}
            {cart.length === 0 && (
              <p className="text-sm text-slate-400">{t("pos_cart_empty")}</p>
            )}
          </div>

          <label className="mb-1 block text-xs font-medium">
            {t("customer")}
          </label>
          <div className="mb-3">
            <SearchableSelect
              options={customers.map((c) => ({
                id: c.id,
                label: c.name,
                sublabel: c.phone,
              }))}
              value={customerId}
              onChange={setCustomerId}
              emptyLabel={t("pos_walkin")}
              placeholder={t("pos_customer_search_placeholder")}
              searchHint={t("pos_customer_search_hint")}
              noResultsLabel={t("pos_customer_search_no_results")}
              minQueryLength={1}
            />
          </div>

          <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium">
                {t("pos_order_type")}
              </label>
              <Select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as OrderType)}
              >
                <option value="tax_invoice">{t("pos_tax_invoice")}</option>
                <option value="quotation">{t("pos_quotation")}</option>
                <option value="return_invoice">
                  {t("pos_return_invoice")}
                </option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                {t("pos_branch")}
              </label>
              <Select
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
              >
                {(settings.branches?.length
                  ? settings.branches
                  : ["Main Branch"]
                ).map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium">
              {t("pos_cart_discount")}
            </label>
            <Input
              type="number"
              value={cartDiscount}
              onChange={(e) => setCartDiscount(e.target.value)}
            />
          </div>

          <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            {t("pos_completion_details_hint")}
          </p>

          <div className="mb-4 space-y-1 border-t border-slate-200 pt-2 text-sm">
            <div className="flex justify-between">
              <span>{t("subtotal")}</span>
              <span>{totals.totalBeforeTax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>{t("tax")}</span>
              <span>{totals.totalTax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>{t("discount")}</span>
              <span>-{totals.totalDiscount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-bold">
              <span>{t("total")}</span>
              <span>
                {totals.grandTotal.toFixed(2)} {settings.currency}
              </span>
            </div>
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium">
              {t("pos_payment")}
            </label>
            <Select
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(e.target.value as PaymentMethod)
              }
            >
              <option value="cash">{t("pos_cash")}</option>
              <option value="card">{t("pos_card")}</option>
              <option value="transfer">{t("pos_transfer")}</option>
              <option value="partial">{t("pos_partial")}</option>
              <option value="credit">{t("pos_credit")}</option>
              <option value="tabby">Tabby</option>
              <option value="tamara">Tamara</option>
            </Select>
          </div>
          {(paymentMethod === "partial" || paymentMethod === "credit") &&
            orderType !== "quotation" && (
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium">
                  {t("pos_paid_amount")}
                </label>
                <Input
                  type="number"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                />
              </div>
            )}

          <Button className="w-full" onClick={() => setConfirmOpen(true)}>
            {orderType === "quotation"
              ? t("pos_create_quotation")
              : t("pos_complete_sale")}
          </Button>
        </Card>
      </div>

      {lastOrder && (
        <div className="mt-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 no-print">
            <h2 className="font-semibold">
              {t("pos_last_invoice")} — {lastOrder.invoiceNumber}
            </h2>
            <div className="flex items-center gap-2">
              {/* Show add-location button if customer has no location */}
              {lastOrder.customerId &&
                canUpdateLocation &&
                (() => {
                  const c = customers.find(
                    (c) => c.id === lastOrder.customerId,
                  );
                  const loc = c?.locations?.[0];
                  const mapUrl = loc ? getLocationMapUrl(loc) : "";
                  return mapUrl ? (
                    <button
                      onClick={() => openGoogleMaps(mapUrl)}
                      title={getLocationLabel(loc) || t("crm_open_maps")}
                      className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-100"
                    >
                      <IconMapPin className="h-4 w-4" />
                      <span className="text-xs">{getLocationLabel(loc)}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setLocationCustomerId(lastOrder.customerId!);
                        setLocationMapsUrl("");
                        setLocationCity("");
                        setLocationDistrict("");
                        setLocationModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-dashed border-blue-300 bg-blue-50 px-3 py-1.5 text-sm text-blue-500 hover:bg-blue-100"
                    >
                      <IconMapPin className="h-4 w-4" />
                      <span className="text-xs">{t("crm_add_location")}</span>
                    </button>
                  );
                })()}
              <Button variant="secondary" onClick={printInvoice}>
                {t("pos_print")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => sendInvoiceWhatsApp(lastOrder)}
              >
                {settings.language === "ar" ? "إرسال واتساب" : "Send WhatsApp"}
              </Button>
              <Button onClick={() => printAndSendInvoice(lastOrder)}>
                {settings.language === "ar" ? "طباعة وإرسال" : "Print & send"}
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <InvoicePrint
              order={lastOrder}
              settings={settings}
              customer={customers.find((c) => c.id === lastOrder.customerId)}
            />
          </div>
        </div>
      )}

        </>
      ) : (
        <SalesHistoryPanel />
      )}

      {/* Location add modal (shown after checkout for customers with no location) */}
      <Modal
        open={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
        title={t("crm_add_location")}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            {settings.language === "ar"
              ? "أضف موقع العميل — سيتم حفظه للمرات القادمة."
              : "Add the customer's location — saved for future visits."}
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium">
              {t("crm_map_link")}
            </label>
            <Input
              value={locationMapsUrl}
              onChange={(e) => setLocationMapsUrl(e.target.value)}
              placeholder="https://maps.google.com/..."
              dir="ltr"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t("crm_city")}
              </label>
              <Input
                value={locationCity}
                onChange={(e) => setLocationCity(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t("crm_district")}
              </label>
              <Input
                value={locationDistrict}
                onChange={(e) => setLocationDistrict(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => setLocationModalOpen(false)}
            >
              {t("cancel")}
            </Button>
            <Button onClick={saveCustomerLocation}>{t("save")}</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title={t("pos_manual_item")}
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">
              {t("pos_manual_item_name")}
            </label>
            <Input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              {t("pos_manual_item_price")}
            </label>
            <Input
              type="number"
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setManualOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={addManualItem}>{t("pos_add")}</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("pos_confirm_title")}
      >
        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <div className="flex justify-between">
              <span>{t("customer")}</span>
              <span>
                {customers.find((c) => c.id === customerId)?.name ||
                  t("pos_walkin")}
              </span>
            </div>
            <div className="flex justify-between">
              <span>{t("pos_order_type")}</span>
              <span>
                {t(
                  orderType === "quotation"
                    ? "pos_quotation"
                    : orderType === "return_invoice"
                      ? "pos_return_invoice"
                      : "pos_tax_invoice",
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span>{t("pos_payment")}</span>
              <span>{paymentMethod}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
              <span>{t("total")}</span>
              <span>
                {totals.grandTotal.toFixed(2)} {settings.currency}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-100 p-3">
            <div className="mb-2 text-sm font-semibold">
              {settings.language === "ar" ? "بيانات تظهر في الفاتورة" : "Invoice display details"}
            </div>
            {!selectedCustomer && !invoiceTaxNumber.trim() ? (
              <p className="text-xs text-slate-500">
                {settings.language === "ar"
                  ? "فاتورة بدون عميل: ستظهر طريقة الدفع فقط في بيانات العميل."
                  : "Walk-in invoice: only the payment method will be shown in the customer block."}
              </p>
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium">
                  {settings.language === "ar" ? "الرقم الضريبي" : "Tax number"}
                </label>
                <Input value={invoiceTaxNumber} onChange={(e) => setInvoiceTaxNumber(e.target.value)} />
              </div>
              {invoiceTaxNumber.trim() ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium">
                      {settings.language === "ar" ? "اسم الشركة/المؤسسة" : "Company / establishment name"}
                    </label>
                    <Input value={invoiceCompanyName} onChange={(e) => setInvoiceCompanyName(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">
                      {settings.language === "ar" ? "رقم التواصل / رقم العميل" : "Contact / customer number"}
                    </label>
                    <Input value={invoiceContactPhone} onChange={(e) => setInvoiceContactPhone(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">
                      {settings.language === "ar" ? "العنوان" : "Address"}
                    </label>
                    <Input value={invoiceAddress} onChange={(e) => setInvoiceAddress(e.target.value)} />
                  </div>
                </>
              ) : selectedCustomer ? (
                <div>
                  <label className="mb-1 block text-xs font-medium">
                    {settings.language === "ar" ? "رقم التواصل / رقم العميل" : "Contact / customer number"}
                  </label>
                  <Input value={invoiceContactPhone} onChange={(e) => setInvoiceContactPhone(e.target.value)} />
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium">
                {t("pos_required_specialty")}
              </label>
              <Select
                value={requiredSpecialty}
                onChange={(e) => {
                  setRequiredSpecialty(e.target.value);
                  setTechnicianName("");
                }}
              >
                <option value="">{t("none")}</option>
                {(settings.technicianSpecialties || []).map((specialty) => (
                  <option key={specialty} value={specialty}>
                    {specialty}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                {t("pos_technician_optional")}
              </label>
              <Select
                value={technicianName}
                onChange={(e) => setTechnicianName(e.target.value)}
              >
                <option value="">{t("none")}</option>
                {matchedTechnicians.map((tech) => (
                  <option key={tech.id} value={tech.name}>
                    {tech.name}
                  </option>
                ))}
              </Select>
              {requiredSpecialty && matchedTechnicians.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  {t("pos_no_matching_technician")}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium">
              {t("pos_schedule_maintenance")}
            </label>
            <Input
              type="datetime-local"
              value={scheduledMaintenanceDate}
              onChange={(e) => setScheduledMaintenanceDate(e.target.value)}
              dir={settings.language === "ar" ? "rtl" : "ltr"}
            />
          </div>

          {technicianName && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium">
                  {t("pos_commission_type")}
                </label>
                <Select
                  value={commissionType}
                  onChange={(e) =>
                    setCommissionType(e.target.value as CommissionType)
                  }
                >
                  <option value="percentage">
                    {t("pos_commission_percentage")}
                  </option>
                  <option value="fixed">{t("pos_commission_fixed")}</option>
                  <option value="full_profit">
                    {t("pos_commission_full_profit")}
                  </option>
                </Select>
              </div>
              {commissionType !== "full_profit" && (
                <div>
                  <label className="mb-1 block text-xs font-medium">
                    {commissionType === "percentage"
                      ? t("pos_commission_pct")
                      : t("pos_commission_amount")}
                  </label>
                  <Input
                    type="number"
                    value={commissionValue}
                    onChange={(e) => setCommissionValue(e.target.value)}
                  />
                </div>
              )}
              <p className="text-xs text-slate-400 sm:col-span-2">
                {t("pos_commission_amount")}: {computedCommission.toFixed(2)}{" "}
                {settings.currency}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium">
                {t("pos_marketer_name")}
              </label>
              <Input
                list="pos-marketer-names"
                value={referralName}
                onChange={(e) => updateReferralName(e.target.value)}
              />
              <datalist id="pos-marketer-names">
                {marketerContacts.map((m) => (
                  <option
                    key={`${m.name}-${m.phone}`}
                    value={m.name}
                    label={m.phone ? `${m.name} - ${m.phone}` : m.name}
                  />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                {t("pos_marketer_phone")}
              </label>
              <Input
                value={referralPhone}
                onChange={(e) => setReferralPhone(e.target.value)}
                placeholder="05xxxxxxxx"
              />
            </div>
            {technicianName && (
              <button
                type="button"
                onClick={useTechnicianAsMarketer}
                className="text-start text-xs text-brand-600 hover:underline sm:col-span-2"
              >
                {t("pos_use_technician_as_marketer")}
              </button>
            )}
            {referralName && (
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium">
                  {t("pos_referral_commission")}
                </label>
                <Input
                  type="number"
                  value={referralCommission}
                  onChange={(e) => setReferralCommission(e.target.value)}
                />
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium">
              {t("notes")}
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                orderType === "quotation"
                  ? t("pos_quotation_notes_placeholder")
                  : t("pos_completion_notes_placeholder")
              }
            />
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={runCheckout}>{t("pos_confirm_and_pay")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
