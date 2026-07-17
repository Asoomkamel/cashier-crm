"use client";

import React, { useMemo, useState } from "react";
import { useApp, useT } from "@/lib/store";
import { Card, PageTitle, Button, Input, SuggestInput, Select, Modal, Table } from "@/components/ui";
import { Customer, CustomerPayment, Location, uid, getLocationMapUrl, getLocationLabel } from "@/lib/types";
import { confirmWithAdminPassword } from "@/lib/security";
import { openGoogleMaps, openWhatsApp } from "@/lib/whatsapp";
import { IconMapPin } from "@/components/icons";
import { downloadWorkbookXlsx, makeXlsxFileName } from "@/lib/xlsxExport";
import { importStatusMessage, importWorkbookToSystem } from "@/lib/xlsxPageActions";
import { NORMALIZED_TABLES_READY } from "@/lib/featureFlags";

const EMPTY: Partial<Customer> = { name: "", phone: "", type: "lead", companyName: "", taxNumber: "", locations: [] };

type StatementPeriod = "all" | "today" | "thisWeek" | "thisMonth" | "week" | "month" | "3m" | "6m" | "thisYear" | "year" | "custom";
type StatementType = "all" | "invoices" | "payments" | "service" | "credit";

type LocationDraft = {
  label: string;
  address: string;
  city: string;
  district: string;
  mapLink: string;     // legacy
  googleMapsUrl: string; // preferred
  notes: string;
  type: string;
};

function firstLocation(customer?: Partial<Customer>): LocationDraft {
  const loc = customer?.locations?.[0];
  return {
    label: loc?.label || "",
    address: loc?.address || "",
    city: loc?.city || "",
    district: loc?.district || "",
    mapLink: loc?.mapLink || loc?.googleMapsUrl || "",
    googleMapsUrl: loc?.googleMapsUrl || loc?.mapLink || "",
    notes: loc?.notes || "",
    type: loc?.type || "main",
  };
}

function isValidMapsUrl(url: string): boolean {
  if (!url) return true; // empty is ok
  try {
    const u = new URL(url);
    return ["maps.google.com", "www.google.com", "maps.app.goo.gl", "goo.gl"].some((h) => u.hostname.endsWith(h));
  } catch { return false; }
}

function mergePrimaryLocation(customer: Customer, draft: LocationDraft): Customer {
  const existing = customer.locations?.[0];
  const hasAnyValue = [draft.address, draft.city, draft.district, draft.googleMapsUrl, draft.mapLink, draft.label].some((v) => String(v || "").trim());
  const nextLocation: Location | undefined = hasAnyValue
    ? {
        id: existing?.id || uid("loc"),
        label: draft.label.trim() || undefined,
        address: draft.address.trim(),
        city: draft.city.trim() || undefined,
        district: draft.district.trim() || undefined,
        googleMapsUrl: draft.googleMapsUrl.trim() || draft.mapLink.trim() || undefined,
        mapLink: draft.mapLink.trim() || draft.googleMapsUrl.trim() || undefined,
        notes: draft.notes.trim() || undefined,
        type: draft.type || "main",
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
      }
    : undefined;

  return {
    ...customer,
    locations: nextLocation
      ? [nextLocation, ...(customer.locations || []).slice(1)]
      : (customer.locations || []).slice(1),
  };
}

export default function CRMPage() {
  const {
    customers, setCustomers, settings, activeUser,
    orders, setOrders, customerPayments, setCustomerPayments, urgentOrders, appointments,
  } = useApp();
  const t = useT();
  const ar = settings.language === "ar";
  const [open, setOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Customer>>(EMPTY);
  const [locationDraft, setLocationDraft] = useState<LocationDraft>(firstLocation(EMPTY));
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [serverBalances, setServerBalances] = useState<Record<string, number> | null>(null);
  const [serverBalancesLoading, setServerBalancesLoading] = useState(false);

  // Fetch customer balances from Supabase (customer_balances view)
  const fetchServerBalances = async () => {
    if (!NORMALIZED_TABLES_READY) return;
    setServerBalancesLoading(true);
    try {
      const res = await fetch("/api/reports/customers");
      const data = await res.json();
      if (data.ok && Array.isArray(data.customers)) {
        const map: Record<string, number> = {};
        (data.customers as Record<string, unknown>[]).forEach(c => {
          if (c.customer_name) map[String(c.customer_name)] = Number(c.outstanding ?? 0);
        });
        setServerBalances(map);
      }
    } catch { /* offline */ } finally {
      setServerBalancesLoading(false);
    }
  };
  const [detailsCustomer, setDetailsCustomer] = useState<Customer | null>(null);
  const [statementPeriod, setStatementPeriod] = useState<StatementPeriod>("all");
  const [statementType, setStatementType] = useState<StatementType>("all");
  const [statementFrom, setStatementFrom] = useState("");
  const [statementTo, setStatementTo] = useState("");
  const [excelStatus, setExcelStatus] = useState("");

  const isTechnician = activeUser?.role === "technician";
  const canUpdateCustomerLocation = Boolean(activeUser?.permissions?.canUpdateCustomerLocation);
  const canRecordPayments = Boolean(activeUser?.permissions?.canRecordPayments);
  const canFullEdit = !isTechnician;
  const canOpenCustomerEditor = canFullEdit || canUpdateCustomerLocation;

  const filtered = customers.filter((c) => {
    const matchesSearch =
      (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.phone || "").includes(search) ||
      (c.locations || []).some((loc) =>
        `${loc.address || ""} ${loc.city || ""} ${loc.district || ""}`.toLowerCase().includes(search.toLowerCase())
      );
    const matchesType = !typeFilter || c.type === typeFilter;
    const matchesCity = !cityFilter || (c.locations || []).some((loc) => loc.city === cityFilter);
    return matchesSearch && matchesType && matchesCity;
  });

  const cities = useMemo(
    () => Array.from(new Set(customers.flatMap((c) => (c.locations || []).map((l) => l.city).filter(Boolean)))) as string[],
    [customers]
  );

  const balances = useMemo(() => {
    const byCustomer = new Map<string, number>();
    orders.forEach((order) => {
      if (!order.customerId || order.status !== "active" || order.type === "quotation") return;
      byCustomer.set(order.customerId, (byCustomer.get(order.customerId) || 0) + Math.max(0, order.remainingAmount || 0));
    });
    return byCustomer;
  }, [orders]);

  const openNew = () => {
    if (!canFullEdit) return;
    setEditing(EMPTY);
    setLocationDraft(firstLocation(EMPTY));
    setOpen(true);
  };

  const openEdit = (c: Customer) => {
    if (!canOpenCustomerEditor) return;
    setEditing(c);
    setLocationDraft(firstLocation(c));
    setOpen(true);
  };

  const save = () => {
    if (editing.id) {
      const existing = customers.find((c) => c.id === editing.id);
      if (!existing) return;

      if (isTechnician) {
        if (!canUpdateCustomerLocation) return;
        setCustomers(customers.map((c) => (c.id === editing.id ? mergePrimaryLocation(c, locationDraft) : c)));
      } else {
        if (!editing.name || !editing.phone) return;
        const mergedCustomer = mergePrimaryLocation({ ...(existing as Customer), ...editing } as Customer, locationDraft);
        setCustomers(customers.map((c) => (c.id === editing.id ? mergedCustomer : c)));
      }
    } else {
      if (!canFullEdit || !editing.name || !editing.phone) return;
      const newCustomer: Customer = mergePrimaryLocation(
        {
          id: uid("cust"),
          name: editing.name!,
          phone: editing.phone!,
          type: (editing.type as any) || "lead",
          locations: [],
          companyName: editing.companyName,
          taxNumber: editing.taxNumber,
          createdAt: Date.now(),
        },
        locationDraft
      );
      setCustomers([...customers, newCustomer]);
    }
    setOpen(false);
  };

  const remove = (id: string) => {
    if (isTechnician) return;
    if (!confirmWithAdminPassword(settings.adminPassword, "deleting this customer", activeUser ? { name: activeUser.name, role: activeUser.role } : undefined)) return;
    setCustomers(customers.filter((c) => c.id !== id));
  };

  const convertToCustomer = (id: string) => {
    setCustomers(customers.map((c) => (c.id === id ? { ...c, type: "customer" } : c)));
  };

  const statementRange = () => {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    if (statementPeriod === "all") return { from: 0, to: Number.MAX_SAFE_INTEGER };
    if (statementPeriod === "custom") {
      const from = statementFrom ? new Date(statementFrom).getTime() : 0;
      const to = statementTo ? new Date(`${statementTo}T23:59:59`).getTime() : Number.MAX_SAFE_INTEGER;
      return { from, to };
    }

    const start = new Date(now);
    if (statementPeriod === "today") start.setHours(0, 0, 0, 0);
    if (statementPeriod === "thisWeek") start.setDate(now.getDate() - now.getDay());
    if (statementPeriod === "thisMonth") start.setDate(1);
    if (statementPeriod === "week") start.setDate(now.getDate() - 7);
    if (statementPeriod === "month") start.setMonth(now.getMonth() - 1);
    if (statementPeriod === "3m") start.setMonth(now.getMonth() - 3);
    if (statementPeriod === "6m") start.setMonth(now.getMonth() - 6);
    if (statementPeriod === "thisYear") start.setMonth(0, 1);
    if (statementPeriod === "year") start.setFullYear(now.getFullYear() - 1);
    start.setHours(0, 0, 0, 0);
    return { from: start.getTime(), to: end.getTime() };
  };

  const inStatementRange = (date: number) => {
    const range = statementRange();
    return date >= range.from && date <= range.to;
  };

  const customerOrders = (customerId: string) =>
    orders.filter((o) => o.customerId === customerId && o.status === "active").sort((a, b) => b.date - a.date);

  const filteredCustomerOrders = (customerId: string) =>
    customerOrders(customerId).filter((o) => {
      const typeOk = statementType === "all" || statementType === "invoices" || (statementType === "credit" && (o.remainingAmount || 0) > 0);
      return typeOk && inStatementRange(o.date);
    });

  const filteredCustomerPayments = (customerId: string) =>
    (statementType === "all" || statementType === "payments")
      ? customerPayments.filter((payment) => payment.customerId === customerId && inStatementRange(payment.date)).sort((a, b) => b.date - a.date)
      : [];

  const filteredCustomerServices = (customerId: string) =>
    (statementType === "all" || statementType === "service")
      ? [...urgentOrders, ...appointments].filter((task) => task.customerId === customerId && inStatementRange(task.date)).sort((a, b) => b.date - a.date)
      : [];

  const openPayment = (customer: Customer) => {
    if (!canRecordPayments) return;
    setPaymentCustomer(customer);
    setPaymentAmount("");
    setPaymentNotes("");
    setPaymentOpen(true);
  };

  const savePayment = () => {
    if (!paymentCustomer) return;
    const amount = Number(paymentAmount);
    const balance = balances.get(paymentCustomer.id) || 0;
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (amount > balance) {
      alert(t("crm_payment_over_balance"));
      return;
    }

    let remainingToApply = amount;
    const nextOrders = orders.map((order) => {
      if (remainingToApply <= 0 || order.customerId !== paymentCustomer.id || order.status !== "active" || order.type === "quotation") return order;
      const orderRemaining = Math.max(0, order.remainingAmount || 0);
      if (orderRemaining <= 0) return order;
      const applied = Math.min(orderRemaining, remainingToApply);
      remainingToApply -= applied;
      return {
        ...order,
        paidAmount: (order.paidAmount || 0) + applied,
        remainingAmount: Math.max(0, orderRemaining - applied),
      };
    });

    const payment: CustomerPayment = {
      id: uid("pay"),
      customerId: paymentCustomer.id,
      customerName: paymentCustomer.name,
      customerPhone: paymentCustomer.phone,
      amount,
      method: "cash",
      notes: paymentNotes.trim() || undefined,
      recordedByUserId: activeUser?.id,
      recordedByName: activeUser?.name,
      date: Date.now(),
    };

    setOrders(nextOrders);
    setCustomerPayments([...customerPayments, payment]);
    setPaymentOpen(false);
  };

  const exportCustomersExcel = async () => {
    await downloadWorkbookXlsx(makeXlsxFileName("customers"), { customers: filtered });
  };

  const exportCustomerStatementExcel = async (customer: Customer) => {
    await downloadWorkbookXlsx(makeXlsxFileName(`customer-statement-${customer.name}`), {
      customers: [customer],
      orders: filteredCustomerOrders(customer.id),
      customerPayments: filteredCustomerPayments(customer.id),
      appointments: filteredCustomerServices(customer.id),
    });
  };

  const importCustomersExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setExcelStatus(ar ? "جارٍ استيراد ملف Excel…" : "Importing Excel…");
      const result = await importWorkbookToSystem(file, "customers", "merge");
      setExcelStatus(importStatusMessage(result, ar));
      if (!result.empty) setTimeout(() => window.location.reload(), 900);
    } catch (err: any) {
      setExcelStatus(`❌ ${err?.message || (ar ? "تعذر استيراد Excel." : "Could not import Excel.")}`);
    }
  };

  return (
    <div>
      <PageTitle title={t("crm_title")} action={<div className="flex flex-wrap gap-2 no-print">
        {NORMALIZED_TABLES_READY && (
          <Button
            variant="secondary"
            onClick={fetchServerBalances}
            disabled={serverBalancesLoading}
          >
            {serverBalancesLoading ? "…" : (serverBalances ? "✅ أرصدة Supabase" : "🗄️ جلب الأرصدة")}
          </Button>
        )}
        {canFullEdit && <>
          <Button variant="secondary" onClick={exportCustomersExcel}>{ar ? "تصدير Excel" : "Export Excel"}</Button>
          <label className="cursor-pointer rounded-lg bg-slate-100 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200">{ar ? "استيراد Excel" : "Import Excel"}<input type="file" accept=".xlsx,.xls" className="hidden" onChange={importCustomersExcel} /></label>
          <Button onClick={openNew}>{t("crm_new")}</Button>
        </>}
      </div>} />
      {excelStatus && <Card className="mb-3 text-sm text-slate-600">{excelStatus}</Card>}
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm flex-1" />
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="max-w-[140px]">
            <option value="">{t("crm_filter_type")}: {t("pos_filter_all")}</option>
            <option value="lead">{t("crm_type_lead")}</option>
            <option value="customer">{t("crm_type_customer")}</option>
          </Select>
          {cities.length > 0 && (
            <Select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} className="max-w-[140px]">
              <option value="">{t("crm_filter_city")}: {t("pos_filter_all")}</option>
              {cities.map((city) => <option key={city} value={city}>{city}</option>)}
            </Select>
          )}
        </div>
        <Table headers={[t("name"), t("phone"), t("type"), t("crm_company"), t("crm_location"), ar ? "الرصيد" : "Balance", t("actions")]}> 
          {filtered.map((c) => {
            const location = c.locations?.[0];
            const localBalance = balances.get(c.id) || 0;
            const serverBal = serverBalances ? (serverBalances[c.name] ?? null) : null;
            const balance = serverBal !== null ? serverBal : localBalance;
            const hasServerData = serverBal !== null;
            return (
              <tr key={c.id} className="border-b border-slate-100 align-top">
                <td className="px-2 py-2">{c.name}</td>
                <td className="px-2 py-2">{c.phone}</td>
                <td className="px-2 py-2 capitalize">{c.type === "lead" ? t("crm_type_lead") : t("crm_type_customer")}</td>
                <td className="px-2 py-2">{c.companyName || "—"}</td>
                <td className="px-2 py-2 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <span>{location ? getLocationLabel(location) : "—"}</span>
                    {location && getLocationMapUrl(location) && (
                      <button
                        onClick={() => openGoogleMaps(getLocationMapUrl(location))}
                        title={t("crm_open_maps")}
                        className="rounded bg-blue-50 p-1 text-blue-500 hover:bg-blue-100"
                      >
                        <IconMapPin className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {c.locations.length > 1 && (
                      <span className="text-slate-400">+{c.locations.length - 1}</span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2 text-end">
                  {balance > 0 ? (
                    <span className={`text-sm font-semibold ${hasServerData ? "text-brand-700" : "text-red-600"}`}>
                      {balance.toFixed(2)} {settings.currency}
                      {hasServerData && <span className="ms-1 text-xs opacity-60">🗄️</span>}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <button className="mr-3 text-slate-600 hover:underline" onClick={() => setDetailsCustomer(c)}>{t("crm_view_details")}</button>
                  {canOpenCustomerEditor && <button className="mr-3 text-brand-600 hover:underline" onClick={() => openEdit(c)}>{isTechnician ? t("crm_update_location") : t("edit")}</button>}
                  {canFullEdit && c.type === "lead" && <button className="mr-3 text-emerald-700 hover:underline" onClick={() => convertToCustomer(c.id)}>{t("crm_convert_to_customer")}</button>}
                  {canRecordPayments && balance > 0 && <button className="mr-3 text-green-700 hover:underline" onClick={() => openPayment(c)}>{t("crm_record_payment")}</button>}
                  {!isTechnician && <button className="text-red-600 hover:underline" onClick={() => remove(c.id)}>{t("delete")}</button>}
                </td>
              </tr>
            );
          })}
        </Table>
        {filtered.length === 0 && <p className="mt-3 text-sm text-slate-400">{t("crm_no_customers")}</p>}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editing.id ? t("crm_edit_title") : t("crm_new_title")}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">{t("name")}</label>
            <SuggestInput disabled={!canFullEdit} category="customerName" value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("phone")}</label>
            <SuggestInput disabled={!canFullEdit} category="customerPhone" value={editing.phone || ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("type")}</label>
            <Select disabled={!canFullEdit} value={editing.type || "lead"} onChange={(e) => setEditing({ ...editing, type: e.target.value as any })}>
              <option value="lead">{t("crm_type_lead")}</option>
              <option value="customer">{t("crm_type_customer")}</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("crm_company_optional")}</label>
            <SuggestInput disabled={!canFullEdit} category="companyName" value={editing.companyName || ""} onChange={(e) => setEditing({ ...editing, companyName: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("crm_tax_number")}</label>
            <Input disabled={!canFullEdit} value={editing.taxNumber || ""} onChange={(e) => setEditing({ ...editing, taxNumber: e.target.value })} />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">{t("crm_location")}</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">{t("crm_location_label")}</label>
                <Input value={locationDraft.label || ""} onChange={(e) => setLocationDraft({ ...locationDraft, label: e.target.value })} placeholder={ar ? "مثال: المنزل، المكتب" : "e.g. Home, Office"} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t("crm_city")}</label>
                <Input value={locationDraft.city || ""} onChange={(e) => setLocationDraft({ ...locationDraft, city: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t("crm_district")}</label>
                <Input value={locationDraft.district || ""} onChange={(e) => setLocationDraft({ ...locationDraft, district: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t("settings_address")}</label>
                <Input value={locationDraft.address || ""} onChange={(e) => setLocationDraft({ ...locationDraft, address: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium">{t("crm_map_link")}</label>
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    value={locationDraft.googleMapsUrl || ""}
                    onChange={(e) => setLocationDraft({ ...locationDraft, googleMapsUrl: e.target.value, mapLink: e.target.value })}
                    placeholder="https://maps.google.com/..."
                    dir="ltr"
                  />
                  {locationDraft.googleMapsUrl && (
                    <button
                      type="button"
                      onClick={() => openGoogleMaps(locationDraft.googleMapsUrl)}
                      title={t("crm_open_maps")}
                      className="rounded-lg bg-blue-50 p-2 text-blue-600 hover:bg-blue-100"
                    >
                      <IconMapPin className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {locationDraft.googleMapsUrl && !isValidMapsUrl(locationDraft.googleMapsUrl) && (
                  <p className="mt-1 text-xs text-amber-600">{t("crm_maps_url_invalid")}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button onClick={save}>{t("save")}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={paymentOpen} onClose={() => setPaymentOpen(false)} title={t("crm_record_payment")}>
        <div className="space-y-3">
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            {paymentCustomer?.name} — {t("crm_current_balance")}: {(paymentCustomer ? balances.get(paymentCustomer.id) || 0 : 0).toFixed(2)} {settings.currency}
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("amount")}</label>
            <Input type="number" min={0} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("notes")}</label>
            <Input value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setPaymentOpen(false)}>{t("cancel")}</Button>
            <Button onClick={savePayment}>{t("save")}</Button>
          </div>
        </div>
      </Modal>
      <Modal open={!!detailsCustomer} onClose={() => setDetailsCustomer(null)} title={t("crm_details_title")}>
        {detailsCustomer && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="font-medium">{detailsCustomer.name}</div>
              <div className="text-slate-500">{detailsCustomer.phone}</div>
              <div className="mt-1">{t("crm_current_balance")}: <span className="font-semibold">{(balances.get(detailsCustomer.id) || 0).toFixed(2)} {settings.currency}</span></div>
            </div>


            <Card className="bg-white/70">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">{ar ? "فلترة كشف الحساب" : "Statement filter"}</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <Select value={statementPeriod} onChange={(e) => setStatementPeriod(e.target.value as StatementPeriod)}>
                  <option value="all">{ar ? "الكل" : "All"}</option>
                  <option value="today">{ar ? "اليوم" : "Today"}</option>
                  <option value="thisWeek">{ar ? "هذا الأسبوع" : "This week"}</option>
                  <option value="thisMonth">{ar ? "هذا الشهر" : "This month"}</option>
                  <option value="week">{ar ? "آخر أسبوع" : "Last week"}</option>
                  <option value="month">{ar ? "آخر شهر" : "Last month"}</option>
                  <option value="3m">{ar ? "آخر 3 أشهر" : "Last 3 months"}</option>
                  <option value="6m">{ar ? "آخر 6 أشهر" : "Last 6 months"}</option>
                  <option value="thisYear">{ar ? "هذه السنة" : "This year"}</option>
                  <option value="year">{ar ? "آخر سنة" : "Last year"}</option>
                  <option value="custom">{ar ? "تاريخ مخصص" : "Custom"}</option>
                </Select>
                <Select value={statementType} onChange={(e) => setStatementType(e.target.value as StatementType)}>
                  <option value="all">{ar ? "كل العمليات" : "All activities"}</option>
                  <option value="invoices">{ar ? "فواتير" : "Invoices"}</option>
                  <option value="payments">{ar ? "دفعات" : "Payments"}</option>
                  <option value="service">{ar ? "طلبات صيانة" : "Service requests"}</option>
                  <option value="credit">{ar ? "مبالغ آجلة" : "Credit balances"}</option>
                </Select>
                {statementPeriod === "custom" && (
                  <>
                    <Input type="date" value={statementFrom} onChange={(e) => setStatementFrom(e.target.value)} />
                    <Input type="date" value={statementTo} onChange={(e) => setStatementTo(e.target.value)} />
                  </>
                )}
              </div>
            </Card>

            <h3 className="text-sm font-semibold text-slate-700">{t("crm_order_history")}</h3>
            <div className="max-h-64 overflow-y-auto">
              <Table headers={[t("history_invoice"), t("date"), t("total"), t("purchases_remaining")]}>
                {filteredCustomerOrders(detailsCustomer.id).map((o) => (
                  <tr key={o.id} className="border-b border-slate-100">
                    <td className="px-2 py-2">{o.invoiceNumber}</td>
                    <td className="px-2 py-2 text-xs">{new Date(o.date).toLocaleDateString()}</td>
                    <td className="px-2 py-2">{o.grandTotal.toFixed(2)}</td>
                    <td className="px-2 py-2">{(o.remainingAmount || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </Table>
              {filteredCustomerOrders(detailsCustomer.id).length === 0 && <p className="py-2 text-sm text-slate-400">{t("crm_no_orders")}</p>}
            </div>

            <h3 className="text-sm font-semibold text-slate-700">{ar ? "الدفعات" : "Payments"}</h3>
            <div className="max-h-40 overflow-y-auto">
              <Table headers={[t("date"), t("amount"), t("notes")]}>
                {filteredCustomerPayments(detailsCustomer.id).map((payment) => (
                  <tr key={payment.id} className="border-b border-slate-100">
                    <td className="px-2 py-2 text-xs">{new Date(payment.date).toLocaleDateString()}</td>
                    <td className="px-2 py-2">{payment.amount.toFixed(2)}</td>
                    <td className="px-2 py-2 text-xs text-slate-500">{payment.notes || "—"}</td>
                  </tr>
                ))}
              </Table>
              {filteredCustomerPayments(detailsCustomer.id).length === 0 && <p className="py-2 text-sm text-slate-400">{ar ? "لا توجد دفعات في الفترة المحددة." : "No payments in this period."}</p>}
            </div>

            <h3 className="text-sm font-semibold text-slate-700">{ar ? "طلبات الصيانة" : "Service requests"}</h3>
            <div className="max-h-40 overflow-y-auto">
              <Table headers={[ar ? "رقم الطلب" : "Request", t("date"), ar ? "الحالة" : "Status", ar ? "الفني" : "Technician"]}>
                {filteredCustomerServices(detailsCustomer.id).map((task) => (
                  <tr key={task.id} className="border-b border-slate-100">
                    <td className="px-2 py-2">{task.requestNumber}</td>
                    <td className="px-2 py-2 text-xs">{new Date(task.date).toLocaleDateString()}</td>
                    <td className="px-2 py-2 text-xs">{task.status}</td>
                    <td className="px-2 py-2 text-xs text-slate-500">{task.technicianName || task.acceptedByTechnicianName || "—"}</td>
                  </tr>
                ))}
              </Table>
              {filteredCustomerServices(detailsCustomer.id).length === 0 && <p className="py-2 text-sm text-slate-400">{ar ? "لا توجد طلبات صيانة في الفترة المحددة." : "No service requests in this period."}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => exportCustomerStatementExcel(detailsCustomer)}>{ar ? "تصدير الكشف Excel" : "Export statement Excel"}</Button>
              <Button variant="secondary" onClick={() => window.print()}>{t("crm_print_statement")}</Button>
              <Button onClick={() => setDetailsCustomer(null)}>{t("close")}</Button>
            </div>

            {/* Print-only statement view */}
            <div className="hidden print:block print-root">
              <h2 className="text-lg font-bold">{t("crm_statement_title")} — {detailsCustomer.name}</h2>
              <p className="text-sm">{detailsCustomer.phone}</p>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-300 text-left">
                    <th className="py-1">{t("history_invoice")}</th>
                    <th className="py-1">{t("date")}</th>
                    <th className="py-1">{t("total")}</th>
                    <th className="py-1">{t("purchases_remaining")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomerOrders(detailsCustomer.id).map((o) => (
                    <tr key={o.id}>
                      <td className="py-1">{o.invoiceNumber}</td>
                      <td className="py-1">{new Date(o.date).toLocaleDateString()}</td>
                      <td className="py-1">{o.grandTotal.toFixed(2)}</td>
                      <td className="py-1">{(o.remainingAmount || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3 className="mt-4 font-bold">{ar ? "الدفعات" : "Payments"}</h3>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-300 text-left">
                    <th className="py-1">{t("date")}</th>
                    <th className="py-1">{t("amount")}</th>
                    <th className="py-1">{t("notes")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomerPayments(detailsCustomer.id).map((payment) => (
                    <tr key={payment.id}>
                      <td className="py-1">{new Date(payment.date).toLocaleDateString()}</td>
                      <td className="py-1">{payment.amount.toFixed(2)}</td>
                      <td className="py-1">{payment.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3 className="mt-4 font-bold">{ar ? "طلبات الصيانة" : "Service requests"}</h3>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-300 text-left">
                    <th className="py-1">{ar ? "رقم الطلب" : "Request"}</th>
                    <th className="py-1">{t("date")}</th>
                    <th className="py-1">{ar ? "الحالة" : "Status"}</th>
                    <th className="py-1">{ar ? "الفني" : "Technician"}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomerServices(detailsCustomer.id).map((task) => (
                    <tr key={task.id}>
                      <td className="py-1">{task.requestNumber}</td>
                      <td className="py-1">{new Date(task.date).toLocaleDateString()}</td>
                      <td className="py-1">{task.status}</td>
                      <td className="py-1">{task.technicianName || task.acceptedByTechnicianName || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 font-bold">{t("crm_current_balance")}: {(balances.get(detailsCustomer.id) || 0).toFixed(2)} {settings.currency}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
