"use client";

import React, { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { Badge, Button, Card, Input, PageTitle, Select, Table } from "@/components/ui";
import {
  readLocalMovements,
  computeAllBalances,
  type StockMovement,
  type StockMovementType,
} from "@/lib/modules/inventory/stockService";
import { NORMALIZED_TABLES_READY } from "@/lib/featureFlags";

const MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  PURCHASE_IN:              "شراء (وارد)",
  SALE_OUT:                 "بيع (صادر)",
  RETURN_IN:                "مرتجع وارد",
  RETURN_OUT:               "مرتجع صادر",
  TECHNICIAN_TRANSFER_OUT:  "تحويل لفني",
  TECHNICIAN_TRANSFER_IN:   "تحويل من فني",
  TECHNICIAN_CONSUME:       "استهلاك فني",
  DAMAGE_OUT:               "تالف",
  LOSS_OUT:                 "مفقود",
  ADJUSTMENT:               "تسوية +",
  ADJUSTMENT_OUT:           "تسوية −",
};

const MOVEMENT_TONE: Record<StockMovementType, "green" | "red" | "amber" | "slate"> = {
  PURCHASE_IN:             "green",
  SALE_OUT:                "red",
  RETURN_IN:               "green",
  RETURN_OUT:              "red",
  TECHNICIAN_TRANSFER_OUT: "amber",
  TECHNICIAN_TRANSFER_IN:  "amber",
  TECHNICIAN_CONSUME:      "red",
  DAMAGE_OUT:              "red",
  LOSS_OUT:                "red",
  ADJUSTMENT:              "green",
  ADJUSTMENT_OUT:          "amber",
};

type ServerMovement = Record<string, unknown>;

export default function StockMovementsPage() {
  const { settings, catalog, activeUser } = useApp();
  const ar = settings.language === "ar";

  const [localMovements, setLocalMovements] = useState<StockMovement[]>([]);
  const [serverMovements, setServerMovements] = useState<ServerMovement[]>([]);
  const [serverMode, setServerMode] = useState(false);
  const [serverLoading, setServerLoading] = useState(false);
  const [filterType, setFilterType] = useState<StockMovementType | "all">("all");
  const [filterProduct, setFilterProduct] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    setLocalMovements(readLocalMovements());
  }, []);

  const fetchServerMovements = async () => {
    setServerLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set("date_from", fromDate);
      if (toDate)   params.set("date_to",   toDate);
      if (filterType !== "all") params.set("movement_type", filterType);

      const res = await fetch(`/api/stock-movements?${params}`);
      const data = await res.json();
      if (data.ok) setServerMovements(data.movements || []);
    } catch { /* offline */ } finally {
      setServerLoading(false);
    }
  };

  useEffect(() => {
    if (serverMode) fetchServerMovements();
    else setServerMovements([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMode, filterType, fromDate, toDate]);

  // Local balances from ledger
  const allBalances = computeAllBalances(localMovements);
  const catalogById = new Map(catalog.map(c => [c.id, c]));

  // Filter local movements
  const displayMovements = localMovements
    .filter(m => filterType === "all" || m.movementType === filterType)
    .filter(m => !filterProduct || m.productName.includes(filterProduct) || m.productId.includes(filterProduct))
    .filter(m => !fromDate || m.createdAt >= new Date(fromDate).getTime())
    .filter(m => !toDate   || m.createdAt <= new Date(toDate + "T23:59:59").getTime())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 200);

  const displayServerMovements = serverMovements
    .filter(m => filterType === "all" || m.movement_type === filterType)
    .filter(m => !filterProduct || String(m.product_name || "").includes(filterProduct))
    .slice(0, 200);

  const activeMovements = serverMode ? displayServerMovements : displayMovements;
  const isEmpty = activeMovements.length === 0;

  return (
    <div className="space-y-4">
      <PageTitle
        title={ar ? "سجل حركات المخزون" : "Stock Movements Ledger"}
        action={
          <div className="flex gap-2">
            {NORMALIZED_TABLES_READY && (
              <button
                onClick={() => setServerMode(v => !v)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  serverMode
                    ? "bg-brand-100 text-brand-700 border border-brand-300"
                    : "bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                {serverMode
                  ? (serverLoading ? "⏳ جارٍ التحميل…" : "🗄️ Supabase")
                  : "💾 محلي"}
              </button>
            )}
          </div>
        }
      />

      {/* Filters */}
      <Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{ar ? "نوع الحركة" : "Movement type"}</label>
            <Select value={filterType} onChange={e => setFilterType(e.target.value as StockMovementType | "all")}>
              <option value="all">{ar ? "الكل" : "All"}</option>
              {Object.entries(MOVEMENT_TYPE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{ar ? "المنتج" : "Product"}</label>
            <Input
              value={filterProduct}
              onChange={e => setFilterProduct(e.target.value)}
              placeholder={ar ? "بحث باسم المنتج" : "Search product"}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{ar ? "من تاريخ" : "From"}</label>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{ar ? "إلى تاريخ" : "To"}</label>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
        </div>
      </Card>

      {/* Local balances summary */}
      {!serverMode && Object.keys(allBalances).length > 0 && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            {ar ? "الأرصدة الحالية (محسوبة من الحركات)" : "Current Balances (from ledger)"}
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(allBalances).map(([productId, qty]) => {
              const cat = catalogById.get(productId);
              if (!cat) return null;
              return (
                <div key={productId} className="rounded-lg bg-slate-50 p-2 text-center">
                  <div className={`text-lg font-bold ${qty <= 0 ? "text-red-600" : "text-brand-700"}`}>{qty}</div>
                  <div className="text-xs text-slate-500 truncate">{cat.name}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Movements table */}
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">
            {ar ? `الحركات (${activeMovements.length})` : `Movements (${activeMovements.length})`}
          </h3>
          {serverMode && (
            <Badge tone="green">Supabase ✓</Badge>
          )}
        </div>

        {isEmpty ? (
          <p className="py-6 text-center text-sm text-slate-400">
            {ar ? "لا توجد حركات مسجّلة." : "No movements recorded."}
            {!serverMode && localMovements.length === 0 && (
              <span className="block mt-1 text-xs">
                {ar
                  ? "الحركات تُسجَّل محلياً عند تنفيذ عمليات المخزون."
                  : "Movements are recorded locally when stock operations are performed."}
              </span>
            )}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="px-2 py-1 text-start">{ar ? "التاريخ" : "Date"}</th>
                  <th className="px-2 py-1 text-start">{ar ? "المنتج" : "Product"}</th>
                  <th className="px-2 py-1 text-start">{ar ? "النوع" : "Type"}</th>
                  <th className="px-2 py-1 text-start">{ar ? "الكمية" : "Qty"}</th>
                  <th className="px-2 py-1 text-start">{ar ? "الفني" : "Tech"}</th>
                  <th className="px-2 py-1 text-start">{ar ? "المرجع" : "Ref"}</th>
                </tr>
              </thead>
              <tbody>
                {serverMode
                  ? displayServerMovements.map((m, i) => (
                    <tr key={String(m.id ?? i)} className="border-b border-slate-100">
                      <td className="px-2 py-1 text-xs text-slate-500">
                        {m.created_at ? new Date(String(m.created_at)).toLocaleDateString("ar-SA") : "—"}
                      </td>
                      <td className="px-2 py-1 font-medium">{String(m.product_id ?? "—")}</td>
                      <td className="px-2 py-1">
                        <Badge tone={MOVEMENT_TONE[String(m.movement_type) as StockMovementType] ?? "slate"}>
                          {MOVEMENT_TYPE_LABELS[String(m.movement_type) as StockMovementType] ?? String(m.movement_type)}
                        </Badge>
                      </td>
                      <td className="px-2 py-1 font-bold">{String(m.quantity ?? 0)}</td>
                      <td className="px-2 py-1 text-slate-500 text-xs">{String(m.technician_id ?? "—")}</td>
                      <td className="px-2 py-1 text-xs text-slate-400">{String(m.reference_type ?? "")} {String(m.reference_id ?? "").slice(0, 8)}</td>
                    </tr>
                  ))
                  : displayMovements.map((m) => (
                    <tr key={m.id} className="border-b border-slate-100">
                      <td className="px-2 py-1 text-xs text-slate-500">
                        {new Date(m.createdAt).toLocaleDateString("ar-SA")}
                      </td>
                      <td className="px-2 py-1 font-medium">{m.productName}</td>
                      <td className="px-2 py-1">
                        <Badge tone={MOVEMENT_TONE[m.movementType] ?? "slate"}>
                          {MOVEMENT_TYPE_LABELS[m.movementType] ?? m.movementType}
                        </Badge>
                      </td>
                      <td className="px-2 py-1 font-bold">{m.quantity}</td>
                      <td className="px-2 py-1 text-slate-500 text-xs">{m.technicianName ?? "—"}</td>
                      <td className="px-2 py-1 text-xs text-slate-400">{m.referenceType} {(m.invoiceId ?? m.referenceId ?? "").slice(0, 8)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
