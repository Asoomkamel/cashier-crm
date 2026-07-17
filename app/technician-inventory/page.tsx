"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useApp, useT } from "@/lib/store";
import { Badge, Button, Card, Input, Modal, PageTitle, Select, Table, Textarea } from "@/components/ui";
import { CatalogItem, StaffUser, TechFinancialLog, TechInventoryItem, TechInventoryLog, uid } from "@/lib/types";
import { inventoryItemValue, itemUnitCostWithTax, techFinancialSummary } from "@/lib/technicianHelpers";
import { downloadWorkbookXlsx, makeXlsxFileName } from "@/lib/xlsxExport";
import { readWorkbookImport } from "@/lib/xlsxImport";
import { applyBackupPayload } from "@/lib/backupPayload";
import { saveToSupabaseBackup } from "@/lib/supabaseBackup";
import { buildFullPayload } from "@/lib/fullPayload";
import { NORMALIZED_TABLES_READY } from "@/lib/featureFlags";

type MoveMode = "add" | "pull" | "transfer";
type FinanceMode = "cash_collection" | "settlement" | "withdrawal" | "expense";
type SortKey = "name" | "qty" | "value" | "mainStock";

const PAGE_SIZE = 10;

function formatDate(ts: number, ar: boolean) {
  return new Date(ts).toLocaleString(ar ? "ar-SA" : "en-US");
}

function sameTech(item: { technicianId?: string; technicianName?: string }, tech?: StaffUser | null) {
  if (!tech) return false;
  return item.technicianId === tech.id || (!item.technicianId && item.technicianName === tech.name) || item.technicianName === tech.name;
}

function logTone(type: string): "slate" | "green" | "amber" | "red" | "blue" {
  if (["add", "transfer_in", "return", "cash_collection", "completion_commission", "marketing_commission"].includes(type)) return "green";
  if (["pull", "transfer_out", "settlement", "withdrawal"].includes(type)) return "amber";
  if (["damage", "lost", "expense"].includes(type)) return "red";
  if (type === "sale") return "blue";
  return "slate";
}

function movementSign(type: TechInventoryLog["type"]) {
  if (["add", "transfer_in", "return"].includes(type)) return 1;
  if (["pull", "sale", "damage", "lost", "transfer_out"].includes(type)) return -1;
  return 0;
}

export default function TechnicianInventoryPage() {
  const {
    activeUser,
    users,
    catalog,
    setCatalog,
    orders,
    settings,
    techInventory,
    setTechInventory,
    techInventoryLogs,
    setTechInventoryLogs,
    techFinancialLogs,
    setTechFinancialLogs,
  } = useApp();
  const t = useT();
  const ar = settings.language === "ar";
  const currency = settings.currency;
  const canManage = activeUser?.role === "admin" || activeUser?.role === "supervisor" || Boolean(activeUser?.permissions?.canManageTechnicians || activeUser?.permissions?.canManageInventory);

  const technicians = useMemo(() => users.filter((u) => u.role === "technician"), [users]);
  const [selectedTechId, setSelectedTechId] = useState("");
  const selectedTech = technicians.find((u) => u.id === selectedTechId) || null;

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [page, setPage] = useState(1);
  const [printMode, setPrintMode] = useState<"none" | "single" | "all">("none");

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [assignCatalogId, setAssignCatalogId] = useState("");

  const [moveOpen, setMoveOpen] = useState<{ item: TechInventoryItem; mode: MoveMode } | null>(null);
  const [moveQty, setMoveQty] = useState("");
  const [moveReason, setMoveReason] = useState("return");
  const [moveReference, setMoveReference] = useState("");
  const [moveNotes, setMoveNotes] = useState("");
  const [transferTargetId, setTransferTargetId] = useState("");

  const [financeOpen, setFinanceOpen] = useState<FinanceMode | null>(null);
  const [financeAmount, setFinanceAmount] = useState("");
  const [financeCategory, setFinanceCategory] = useState(settings.expenseCategories?.[0] || "");
  const [financeCustomCategory, setFinanceCustomCategory] = useState("");
  const [financeMethod, setFinanceMethod] = useState("cash");
  const [financeReference, setFinanceReference] = useState("");
  const [financeNotes, setFinanceNotes] = useState("");
  const [message, setMessage] = useState("");
  const [excelStatus, setExcelStatus] = useState("");

  const exportTechnicianInventoryExcel = async () => {
    const selectedOnly = selectedTech
      ? {
          techInventory: techInventory.filter((item) => sameTech(item, selectedTech)),
          techInventoryLogs: techInventoryLogs.filter((log) => sameTech(log, selectedTech)),
          techFinancialLogs: techFinancialLogs.filter((log) => sameTech(log, selectedTech)),
        }
      : { techInventory, techInventoryLogs, techFinancialLogs };
    await downloadWorkbookXlsx(makeXlsxFileName(selectedTech ? `technician-inventory-${selectedTech.name}` : "technician-inventory"), selectedOnly);
  };

  const importTechnicianInventoryExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setExcelStatus(ar ? "جارٍ استيراد ملف Excel…" : "Importing Excel…");
      const parsed = await readWorkbookImport(file, "techInventory");
      const { imported, empty } = applyBackupPayload(parsed.payload, "merge");
      if (!empty) await saveToSupabaseBackup(buildFullPayload());
      setExcelStatus(empty ? (ar ? "لم يتم العثور على بيانات متوافقة." : "No compatible data found.") : (ar ? `تم الاستيراد: ${imported.join(", ")}. جارٍ إعادة التحميل…` : `Imported: ${imported.join(", ")}. Reloading…`));
      if (!empty) setTimeout(() => window.location.reload(), 900);
    } catch (err: any) {
      setExcelStatus(`❌ ${err?.message || (ar ? "تعذر استيراد Excel." : "Could not import Excel.")}`);
    }
  };

  useEffect(() => {
    if (!selectedTechId && technicians.length > 0) setSelectedTechId(technicians[0].id);
  }, [selectedTechId, technicians]);

  useEffect(() => {
    if (printMode !== "none") {
      const timer = setTimeout(() => {
        window.print();
        setPrintMode("none");
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [printMode]);

  const techItems = useMemo(() => {
    if (!selectedTech) return [];
    return techInventory.filter((item) => sameTech(item, selectedTech));
  }, [techInventory, selectedTech]);

  const itemRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = techItems.map((item) => {
      const catalogItem = catalog.find((c) => c.id === item.catalogId);
      const value = inventoryItemValue(item, catalog);
      return {
        item,
        catalogItem,
        name: item.itemName || catalogItem?.name || "—",
        sku: item.sku || catalogItem?.sku || "—",
        unit: item.unit || (catalogItem?.type === "product" ? (ar ? "قطعة" : "pcs") : (ar ? "خدمة" : "service")),
        mainStock: catalogItem?.type === "product" ? Number(catalogItem.stock || 0) : 0,
        value,
      };
    }).filter((row) => !q || row.name.toLowerCase().includes(q) || row.sku.toLowerCase().includes(q));

    rows.sort((a, b) => {
      if (sortKey === "qty") return b.item.qty - a.item.qty;
      if (sortKey === "value") return b.value - a.value;
      if (sortKey === "mainStock") return b.mainStock - a.mainStock;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [techItems, catalog, search, sortKey, ar]);

  const totalPages = Math.max(1, Math.ceil(itemRows.length / PAGE_SIZE));
  const visibleRows = itemRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selectedFinancialLogs = useMemo(() => {
    if (!selectedTech) return [];
    return techFinancialLogs.filter((log) => sameTech(log, selectedTech));
  }, [techFinancialLogs, selectedTech]);

  const selectedInventoryLogs = useMemo(() => {
    if (!selectedTech) return [];
    return techInventoryLogs.filter((log) => sameTech(log, selectedTech));
  }, [techInventoryLogs, selectedTech]);

  const financial = useMemo(() => techFinancialSummary(selectedFinancialLogs), [selectedFinancialLogs]);
  const stockValue = useMemo(() => techItems.reduce((sum, item) => sum + inventoryItemValue(item, catalog), 0), [techItems, catalog]);

  const selectedOrders = useMemo(() => {
    if (!selectedTech) return [];
    return orders.filter((order) => order.status === "active" && order.type !== "quotation" && order.technicianName === selectedTech.name);
  }, [orders, selectedTech]);

  const salesTotal = selectedOrders.reduce((sum, order) => sum + (order.type === "return_invoice" ? -order.grandTotal : order.grandTotal), 0);
  const fallbackCompletionCommission = selectedFinancialLogs.some((log) => log.type === "completion_commission")
    ? 0
    : selectedOrders.reduce((sum, order) => sum + Number(order.technicianCommission || 0), 0);
  const completionCommission = financial.completionCommission + fallbackCompletionCommission;
  const marketingCommission = financial.marketingCommission;

  const allTechSummary = useMemo(() => {
    return technicians.map((tech) => {
      const items = techInventory.filter((item) => sameTech(item, tech));
      const value = items.reduce((sum, item) => sum + inventoryItemValue(item, catalog), 0);
      const logs = techFinancialLogs.filter((log) => sameTech(log, tech));
      const money = techFinancialSummary(logs);
      return { tech, value, cashDebt: money.cashDebt, completion: money.completionCommission, marketing: money.marketingCommission };
    });
  }, [technicians, techInventory, techFinancialLogs, catalog]);

  const totalCustodyValue = allTechSummary.reduce((sum, row) => sum + row.value, 0);

  const last7Days = useMemo(() => {
    const current = totalCustodyValue;
    const days = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - idx));
      d.setHours(23, 59, 59, 999);
      return d.getTime();
    });
    return days.map((end) => {
      const afterDelta = techInventoryLogs
        .filter((log) => log.date > end)
        .reduce((sum, log) => {
          const catalogItem = catalog.find((c) => c.id === log.catalogId || c.name === log.itemName);
          return sum + movementSign(log.type) * log.qty * itemUnitCostWithTax(catalogItem);
        }, 0);
      return { date: end, value: Math.max(0, current - afterDelta) };
    });
  }, [catalog, techInventoryLogs, totalCustodyValue]);

  const maxChart = Math.max(1, ...last7Days.map((d) => d.value));

  const assignableCatalog = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    const assignedIds = new Set(techItems.map((item) => item.catalogId));
    return catalog
      .filter((item) => item.type === "product")
      .filter((item) => !q || item.name.toLowerCase().includes(q) || (item.sku || "").toLowerCase().includes(q) || (item.barcode || "").toLowerCase().includes(q))
      .slice(0, 60)
      .map((item) => ({ item, assigned: assignedIds.has(item.id) }));
  }, [assignSearch, catalog, techItems]);

  const resetMove = () => {
    setMoveOpen(null);
    setMoveQty("");
    setMoveReason("return");
    setMoveReference("");
    setMoveNotes("");
    setTransferTargetId("");
  };

  const showMessage = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 3500);
  };

  const addInventoryLog = (log: Omit<TechInventoryLog, "id" | "date">) => ({ id: uid("tlog"), date: Date.now(), ...log });
  const addFinancialLog = (log: Omit<TechFinancialLog, "id" | "date">) => ({ id: uid("tfin"), date: Date.now(), ...log });

  const assignItem = () => {
    if (!selectedTech || !assignCatalogId) return;
    const cat = catalog.find((item) => item.id === assignCatalogId);
    if (!cat || cat.type !== "product") return;
    if (techItems.some((item) => item.catalogId === cat.id)) {
      showMessage(ar ? "الصنف موجود مسبقًا في عهدة الفني." : "Item is already assigned.");
      return;
    }
    const nextItem: TechInventoryItem = {
      id: uid("tinv"),
      technicianId: selectedTech.id,
      technicianName: selectedTech.name,
      catalogId: cat.id,
      itemName: cat.name,
      sku: cat.sku || undefined,
      unit: ar ? "قطعة" : "pcs",
      qty: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setTechInventory([...techInventory, nextItem]);
    setTechInventoryLogs([...techInventoryLogs, addInventoryLog({ technicianId: selectedTech.id, technicianName: selectedTech.name, catalogId: cat.id, itemName: cat.name, type: "assign", qty: 0, performedByUserId: activeUser?.id, performedByName: activeUser?.name, notes: ar ? "إدراج صنف في عهدة الفني بكمية صفر" : "Assigned item with zero quantity" })]);
    setAssignOpen(false);
    setAssignCatalogId("");
    setAssignSearch("");
    showMessage(ar ? "تم إدراج الصنف في عهدة الفني." : "Item assigned to technician.");
  };

  const applyMove = () => {
    if (!moveOpen || !selectedTech) return;
    const qty = Math.floor(Number(moveQty));
    if (!Number.isFinite(qty) || qty <= 0) return showMessage(ar ? "أدخل كمية صحيحة موجبة." : "Enter a valid positive quantity.");

    const sourceItem = techInventory.find((item) => item.id === moveOpen.item.id);
    if (!sourceItem) return;
    const catalogItem = catalog.find((item) => item.id === sourceItem.catalogId);
    if (!catalogItem) return;
    const nowUser = { performedByUserId: activeUser?.id, performedByName: activeUser?.name };

    if (moveOpen.mode === "add") {
      const mainStock = Number(catalogItem.stock || 0);
      if (qty > mainStock) return showMessage(ar ? `لا توجد كمية كافية في المستودع. المتاح: ${mainStock}` : `Not enough main stock. Available: ${mainStock}`);
      const nextCatalog = catalog.map((item) => item.id === catalogItem.id ? { ...item, stock: mainStock - qty } : item);
      const nextInventory = techInventory.map((item) => item.id === sourceItem.id ? { ...item, qty: item.qty + qty, updatedAt: Date.now() } : item);
      setCatalog(nextCatalog);
      setTechInventory(nextInventory);
      setTechInventoryLogs([...techInventoryLogs, addInventoryLog({ technicianId: selectedTech.id, technicianName: selectedTech.name, catalogId: catalogItem.id, itemName: catalogItem.name, type: "add", qty, beforeQty: sourceItem.qty, afterQty: sourceItem.qty + qty, reference: moveReference || undefined, notes: moveNotes || undefined, ...nowUser })]);
      resetMove();
      showMessage(ar ? "تم صرف الكمية للفني." : "Stock issued to technician.");
      return;
    }

    if (qty > sourceItem.qty) return showMessage(ar ? "الكمية غير متوفرة لدى الفني." : "Not enough stock with this technician.");

    if (moveOpen.mode === "pull") {
      const returnToMain = moveReason === "return";
      const typeMap: Record<string, TechInventoryLog["type"]> = { return: "return", sale: "sale", damage: "damage", lost: "lost", adjustment: "adjustment", custom: "pull" };
      const nextInventory = techInventory.map((item) => item.id === sourceItem.id ? { ...item, qty: item.qty - qty, updatedAt: Date.now() } : item);
      const nextCatalog = returnToMain ? catalog.map((item) => item.id === catalogItem.id ? { ...item, stock: Number(item.stock || 0) + qty } : item) : catalog;
      setCatalog(nextCatalog);
      setTechInventory(nextInventory);
      setTechInventoryLogs([...techInventoryLogs, addInventoryLog({ technicianId: selectedTech.id, technicianName: selectedTech.name, catalogId: catalogItem.id, itemName: catalogItem.name, type: typeMap[moveReason] || "pull", qty, beforeQty: sourceItem.qty, afterQty: sourceItem.qty - qty, reference: moveReference || undefined, notes: moveNotes || moveReason, ...nowUser })]);
      resetMove();
      showMessage(ar ? "تم تسجيل السحب من عهدة الفني." : "Stock pulled from technician.");
      return;
    }

    if (moveOpen.mode === "transfer") {
      const target = technicians.find((tech) => tech.id === transferTargetId);
      if (!target) return showMessage(ar ? "اختر الفني المستلم." : "Select receiving technician.");
      if (target.id === selectedTech.id) return showMessage(ar ? "لا يمكن التحويل لنفس الفني." : "Cannot transfer to the same technician.");
      const transferId = uid("trf");
      let nextInventory = techInventory.map((item) => item.id === sourceItem.id ? { ...item, qty: item.qty - qty, updatedAt: Date.now() } : item);
      const targetExisting = nextInventory.find((item) => sameTech(item, target) && item.catalogId === sourceItem.catalogId);
      if (targetExisting) {
        nextInventory = nextInventory.map((item) => item.id === targetExisting.id ? { ...item, qty: item.qty + qty, updatedAt: Date.now() } : item);
      } else {
        nextInventory = [...nextInventory, { id: uid("tinv"), technicianId: target.id, technicianName: target.name, catalogId: sourceItem.catalogId, itemName: sourceItem.itemName, sku: sourceItem.sku || catalogItem.sku, unit: sourceItem.unit, qty, createdAt: Date.now(), updatedAt: Date.now() }];
      }
      setTechInventory(nextInventory);
      setTechInventoryLogs([
        ...techInventoryLogs,
        addInventoryLog({ technicianId: selectedTech.id, technicianName: selectedTech.name, catalogId: catalogItem.id, itemName: catalogItem.name, type: "transfer_out", qty, beforeQty: sourceItem.qty, afterQty: sourceItem.qty - qty, counterpartTechnicianId: target.id, counterpartTechnician: target.name, transferId, reference: moveReference || undefined, notes: moveNotes || undefined, ...nowUser }),
        addInventoryLog({ technicianId: target.id, technicianName: target.name, catalogId: catalogItem.id, itemName: catalogItem.name, type: "transfer_in", qty, counterpartTechnicianId: selectedTech.id, counterpartTechnician: selectedTech.name, transferId, reference: moveReference || undefined, notes: moveNotes || undefined, ...nowUser }),
      ]);
      resetMove();
      showMessage(ar ? "تم تحويل الصنف بين الفنيين." : "Stock transferred.");
    }
  };

  const recordFinance = () => {
    if (!selectedTech || !financeOpen) return;
    const amount = Number(financeAmount);
    if (!Number.isFinite(amount) || amount <= 0) return showMessage(ar ? "أدخل مبلغًا صحيحًا." : "Enter a valid amount.");
    const category = financeOpen === "expense" ? (financeCustomCategory.trim() || financeCategory || (ar ? "مصروف عام" : "General expense")) : undefined;
    setTechFinancialLogs([...techFinancialLogs, addFinancialLog({ technicianId: selectedTech.id, technicianName: selectedTech.name, type: financeOpen, amount, category, method: financeMethod as TechFinancialLog["method"], reference: financeReference || undefined, notes: financeNotes || undefined, performedByUserId: activeUser?.id, performedByName: activeUser?.name })]);
    setFinanceOpen(null);
    setFinanceAmount("");
    setFinanceReference("");
    setFinanceNotes("");
    setFinanceCustomCategory("");
    showMessage(ar ? "تم حفظ الحركة المالية." : "Financial transaction saved.");
  };

  const unifiedLogs = useMemo(() => {
    const inv = selectedInventoryLogs.map((log) => ({ id: log.id, date: log.date, type: log.type, desc: log.itemName, qty: log.qty, amount: undefined as number | undefined, notes: log.notes, by: log.performedByName, ref: log.reference || log.invoiceNumber, other: log.counterpartTechnician }));
    const fin = selectedFinancialLogs.map((log) => ({ id: log.id, date: log.date, type: log.type, desc: log.category || log.customerName || log.notes || "—", qty: undefined as number | undefined, amount: log.amount, notes: log.notes, by: log.performedByName, ref: log.reference || log.invoiceNumber, other: undefined as string | undefined }));
    return [...inv, ...fin].sort((a, b) => b.date - a.date).slice(0, 80);
  }, [selectedInventoryLogs, selectedFinancialLogs]);

  if (!canManage) {
    return <Card className="text-sm text-red-600">{ar ? "لا تملك صلاحية عرض مخزون الفنيين." : "You do not have permission to view technician inventory."}</Card>;
  }

  const [syncingToServer, setSyncingToServer] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const syncTechInventory = async () => {
    if (!NORMALIZED_TABLES_READY) return;
    setSyncingToServer(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/tech-inventory/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ techInventory, techInventoryLogs }),
      });
      const data = await res.json();
      setSyncMsg(data.ok
        ? `✅ تم مزامنة ${data.synced} صنف مع Supabase`
        : `❌ ${data.error || "فشل التزامن"}`);
    } catch {
      setSyncMsg("❌ خطأ في الشبكة");
    } finally {
      setSyncingToServer(false);
      setTimeout(() => setSyncMsg(""), 4000);
    }
  };

  return (
    <div className="space-y-4">
      <PageTitle
        title={ar ? "مخزون الفنيين" : "Technician Inventory"}
        action={
          <div className="flex flex-wrap gap-2 no-print">
            {NORMALIZED_TABLES_READY && (
              <Button variant="secondary" onClick={syncTechInventory} disabled={syncingToServer}>
                {syncingToServer ? "…" : "🗄️ " + (ar ? "مزامنة Supabase" : "Sync to Supabase")}
              </Button>
            )}
            <Button variant="secondary" onClick={exportTechnicianInventoryExcel}>{ar ? "تصدير Excel" : "Export Excel"}</Button>
            <label className="cursor-pointer rounded-lg bg-slate-100 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200">{ar ? "استيراد Excel" : "Import Excel"}<input type="file" accept=".xlsx,.xls" className="hidden" onChange={importTechnicianInventoryExcel} /></label>
            <Button variant="secondary" onClick={() => setPrintMode("all")}>{ar ? "طباعة التقرير الشامل" : "Print all"}</Button>
            {selectedTech && <Button variant="secondary" onClick={() => setPrintMode("single")}>{ar ? "طباعة عهدة الفني" : "Print technician"}</Button>}
          </div>
        }
      />
      {syncMsg && (
        <div className={`rounded-lg px-3 py-2 text-sm ${syncMsg.startsWith("✅") ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {syncMsg}
        </div>
      )}

      {message && <Card className="border border-emerald-200 bg-emerald-50 text-sm text-emerald-700">{message}</Card>}
      {excelStatus && <Card className="text-sm text-slate-600">{excelStatus}</Card>}

      <Card>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-800">{ar ? "اختيار الفني" : "Select technician"}</h2>
            <p className="text-xs text-slate-400">{ar ? "اختر الفني لعرض العهدة والحركات والمحفظة." : "Choose a technician to view custody, wallet, and movements."}</p>
          </div>
          <Select value={selectedTechId} onChange={(e) => { setSelectedTechId(e.target.value); setPage(1); }} className="max-w-xs">
            <option value="">{ar ? "اختر الفني" : "Select technician"}</option>
            {technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
          </Select>
        </div>
        {technicians.length === 0 && <p className="text-sm text-slate-400">{ar ? "لا يوجد فنيون مسجلون." : "No technicians are registered."}</p>}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500">{ar ? "إجمالي قيمة عهدة جميع الفنيين" : "Total custody value"}</div>
              <div className="mt-1 text-2xl font-bold text-brand-700">{totalCustodyValue.toFixed(2)} {currency}</div>
            </div>
            <Badge tone="blue">{technicians.length} {ar ? "فني" : "techs"}</Badge>
          </div>
          <div className="mt-4 flex h-32 items-end gap-2 rounded-lg bg-slate-50 p-3">
            {last7Days.map((point) => (
              <div key={point.date} className="group flex flex-1 flex-col items-center gap-1">
                <div title={`${new Date(point.date).toLocaleDateString(ar ? "ar-SA" : "en-US")} — ${point.value.toFixed(2)} ${currency}`} className="w-full rounded-t bg-brand-500 transition hover:bg-brand-700" style={{ height: `${Math.max(6, (point.value / maxChart) * 100)}%` }} />
                <span className="text-[10px] text-slate-400">{new Date(point.date).toLocaleDateString(ar ? "ar-SA" : "en-US", { weekday: "short" })}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold text-slate-800">{ar ? "ملخص سريع" : "Quick summary"}</h2>
          <div className="space-y-2 text-sm">
            {allTechSummary.slice(0, 5).map((row) => (
              <div key={row.tech.id} className="flex justify-between border-b border-slate-100 pb-1">
                <span>{row.tech.name}</span>
                <span className="font-medium">{row.value.toFixed(2)} {currency}</span>
              </div>
            ))}
            {allTechSummary.length === 0 && <p className="text-slate-400">{ar ? "لا توجد بيانات." : "No data."}</p>}
          </div>
        </Card>
      </div>

      {!selectedTech ? (
        <Card className="py-12 text-center text-sm text-slate-400">{ar ? "اختر فنيًا من القائمة لعرض التفاصيل." : "Select a technician to view details."}</Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <div className="text-xs text-slate-500">{ar ? "قيمة البضاعة مع الفني" : "Custody value"}</div>
              <div className="mt-1 text-xl font-bold text-brand-700">{stockValue.toFixed(2)} {currency}</div>
              <Button className="mt-3" onClick={() => setAssignOpen(true)}>{ar ? "إدراج صنف جديد" : "Assign item"}</Button>
            </Card>
            <Card>
              <div className="text-xs text-slate-500">{ar ? "إجمالي مبيعات الفني" : "Technician sales"}</div>
              <div className="mt-1 text-xl font-bold text-slate-800">{salesTotal.toFixed(2)} {currency}</div>
              <p className="mt-1 text-xs text-slate-400">{selectedOrders.length} {ar ? "فاتورة فعلية" : "real invoices"}</p>
            </Card>
            <Card>
              <div className="text-xs text-slate-500">{ar ? "مديونية الكاش لدى الفني" : "Cash owed by technician"}</div>
              <div className={`mt-1 text-xl font-bold ${financial.cashDebt > 0 ? "text-amber-700" : "text-emerald-700"}`}>{financial.cashDebt.toFixed(2)} {currency}</div>
              <div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setFinanceOpen("cash_collection")}>{ar ? "إضافة كاش" : "Cash"}</Button><Button variant="secondary" onClick={() => setFinanceOpen("settlement")}>{ar ? "تسديد" : "Settle"}</Button><Button variant="secondary" onClick={() => setFinanceOpen("withdrawal")}>{ar ? "سحب" : "Withdraw"}</Button></div>
            </Card>
            <Card>
              <div className="text-xs text-slate-500">{ar ? "المصروفات والعمولات" : "Expenses & commissions"}</div>
              <div className="mt-1 text-sm text-slate-600">{ar ? "مصروفات" : "Expenses"}: <b>{financial.expenses.toFixed(2)} {currency}</b></div>
              <div className="text-sm text-slate-600">{ar ? "إنجاز" : "Completion"}: <b>{completionCommission.toFixed(2)} {currency}</b></div>
              <div className="text-sm text-slate-600">{ar ? "تسويق" : "Marketing"}: <b>{marketingCommission.toFixed(2)} {currency}</b></div>
              <Button className="mt-3" variant="secondary" onClick={() => setFinanceOpen("expense")}>{ar ? "إضافة مصروف" : "Add expense"}</Button>
            </Card>
          </div>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-800">{ar ? "جدول عهدة الفني" : "Technician custody table"}</h2>
              <div className="flex flex-wrap gap-2">
                <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={ar ? "بحث بالاسم أو SKU" : "Search name or SKU"} className="max-w-xs" />
                <Select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="max-w-[180px]"><option value="name">{ar ? "ترتيب بالاسم" : "Sort by name"}</option><option value="qty">{ar ? "الكمية" : "Qty"}</option><option value="value">{ar ? "القيمة" : "Value"}</option><option value="mainStock">{ar ? "رصيد المستودع" : "Main stock"}</option></Select>
              </div>
            </div>

            <div className="hidden md:block">
              <Table headers={[ar ? "الصنف" : "Item", "SKU", ar ? "رصيد المستودع" : "Main stock", ar ? "كمية الفني" : "Tech qty", ar ? "الوحدة" : "Unit", ar ? "القيمة" : "Value", ar ? "الحالة" : "Status", ""]}>
                {visibleRows.map((row) => (
                  <tr key={row.item.id} className="border-b border-slate-100">
                    <td className="px-2 py-2 font-medium">{row.name}</td><td className="px-2 py-2 text-slate-500">{row.sku}</td><td className="px-2 py-2">{row.mainStock}</td><td className="px-2 py-2">{row.item.qty}</td><td className="px-2 py-2">{row.unit}</td><td className="px-2 py-2">{row.value.toFixed(2)} {currency}</td><td className="px-2 py-2"><Badge tone={row.item.qty <= 0 ? "slate" : row.item.qty <= 2 ? "amber" : "green"}>{row.item.qty <= 0 ? (ar ? "صفر" : "Zero") : row.item.qty <= 2 ? (ar ? "منخفض" : "Low") : (ar ? "جيد" : "Good")}</Badge></td>
                    <td className="px-2 py-2"><div className="flex flex-wrap gap-1"><Button variant="secondary" onClick={() => setMoveOpen({ item: row.item, mode: "add" })}>{ar ? "صرف" : "Issue"}</Button><Button variant="secondary" onClick={() => setMoveOpen({ item: row.item, mode: "pull" })}>{ar ? "سحب" : "Pull"}</Button><Button variant="secondary" onClick={() => setMoveOpen({ item: row.item, mode: "transfer" })}>{ar ? "تحويل" : "Transfer"}</Button></div></td>
                  </tr>
                ))}
              </Table>
            </div>
            <div className="space-y-3 md:hidden">
              {visibleRows.map((row) => <div key={row.item.id} className="rounded-lg border border-slate-100 p-3 text-sm"><div className="font-semibold">{row.name}</div><div className="text-xs text-slate-400">SKU: {row.sku}</div><div className="mt-2 grid grid-cols-2 gap-2"><div>{ar ? "كمية الفني" : "Tech qty"}: <b>{row.item.qty}</b></div><div>{ar ? "المستودع" : "Main"}: <b>{row.mainStock}</b></div><div>{ar ? "القيمة" : "Value"}: <b>{row.value.toFixed(2)} {currency}</b></div><div><Badge tone={row.item.qty <= 0 ? "slate" : row.item.qty <= 2 ? "amber" : "green"}>{row.item.qty <= 0 ? "0" : row.item.qty <= 2 ? (ar ? "منخفض" : "Low") : (ar ? "جيد" : "Good")}</Badge></div></div><div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setMoveOpen({ item: row.item, mode: "add" })}>{ar ? "صرف" : "Issue"}</Button><Button variant="secondary" onClick={() => setMoveOpen({ item: row.item, mode: "pull" })}>{ar ? "سحب" : "Pull"}</Button><Button variant="secondary" onClick={() => setMoveOpen({ item: row.item, mode: "transfer" })}>{ar ? "تحويل" : "Transfer"}</Button></div></div>)}
            </div>
            {itemRows.length === 0 && <p className="mt-3 text-sm text-slate-400">{ar ? "لا توجد أصناف في عهدة هذا الفني." : "No items for this technician."}</p>}
            {itemRows.length > PAGE_SIZE && <div className="mt-3 flex items-center justify-end gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{ar ? "السابق" : "Prev"}</Button><span className="text-sm text-slate-500">{page} / {totalPages}</span><Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>{ar ? "التالي" : "Next"}</Button></div>}
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold text-slate-800">{ar ? "سجل الحركات الموحد" : "Unified movement log"}</h2>
            <div className="space-y-2 text-sm">
              {unifiedLogs.map((log) => <div key={log.id} className="grid grid-cols-1 gap-1 rounded-lg border border-slate-100 p-2 md:grid-cols-[auto_1fr_auto] md:items-center"><Badge tone={logTone(log.type)}>{log.type}</Badge><div><div className="font-medium">{log.desc}</div><div className="text-xs text-slate-400">{formatDate(log.date, ar)} {log.other ? ` · ${log.other}` : ""} {log.by ? ` · ${log.by}` : ""} {log.ref ? ` · ${log.ref}` : ""}</div>{log.notes && <div className="text-xs text-slate-500">{log.notes}</div>}</div><div className="font-semibold">{log.qty !== undefined ? `× ${log.qty}` : `${(log.amount || 0).toFixed(2)} ${currency}`}</div></div>)}
              {unifiedLogs.length === 0 && <p className="text-slate-400">{ar ? "لا توجد حركات." : "No movements."}</p>}
            </div>
          </Card>
        </>
      )}

      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title={ar ? "إدراج صنف إلى عهدة الفني" : "Assign item to technician"}>
        <div className="space-y-3">
          <Input value={assignSearch} onChange={(e) => setAssignSearch(e.target.value)} placeholder={ar ? "بحث باسم الصنف أو SKU أو الباركود" : "Search name, SKU, barcode"} />
          <Select value={assignCatalogId} onChange={(e) => setAssignCatalogId(e.target.value)}>
            <option value="">{ar ? "اختر صنفًا" : "Select item"}</option>
            {assignableCatalog.map(({ item, assigned }) => <option key={item.id} value={item.id} disabled={assigned}>{item.name} {item.sku ? `- ${item.sku}` : ""} · {ar ? "رصيد" : "Stock"}: {item.stock || 0}{assigned ? ` · ${ar ? "مدرج مسبقًا" : "Already assigned"}` : ""}</option>)}
          </Select>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setAssignOpen(false)}>{t("cancel")}</Button><Button onClick={assignItem}>{t("add")}</Button></div>
        </div>
      </Modal>

      <Modal open={!!moveOpen} onClose={resetMove} title={moveOpen ? `${moveOpen.mode === "add" ? (ar ? "صرف كمية" : "Issue stock") : moveOpen.mode === "pull" ? (ar ? "سحب كمية" : "Pull stock") : (ar ? "تحويل كمية" : "Transfer stock")} — ${moveOpen.item.itemName}` : ""}>
        <div className="space-y-3">
          <Input type="number" min={1} value={moveQty} onChange={(e) => setMoveQty(e.target.value)} placeholder={ar ? "الكمية" : "Quantity"} />
          {moveOpen?.mode === "pull" && <Select value={moveReason} onChange={(e) => setMoveReason(e.target.value)}><option value="return">{ar ? "مرتجع إلى المستودع" : "Return to warehouse"}</option><option value="sale">{ar ? "بيع" : "Sale"}</option><option value="damage">{ar ? "تالف" : "Damaged"}</option><option value="lost">{ar ? "فقد" : "Lost"}</option><option value="adjustment">{ar ? "تسوية جرد" : "Inventory adjustment"}</option><option value="custom">{ar ? "سبب مخصص" : "Custom reason"}</option></Select>}
          {moveOpen?.mode === "transfer" && <Select value={transferTargetId} onChange={(e) => setTransferTargetId(e.target.value)}><option value="">{ar ? "اختر الفني المستلم" : "Receiving technician"}</option>{technicians.filter((tech) => tech.id !== selectedTech?.id).map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}</Select>}
          <Input value={moveReference} onChange={(e) => setMoveReference(e.target.value)} placeholder={ar ? "رقم مرجعي اختياري" : "Optional reference"} />
          <Textarea rows={3} value={moveNotes} onChange={(e) => setMoveNotes(e.target.value)} placeholder={ar ? "ملاحظات" : "Notes"} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={resetMove}>{t("cancel")}</Button><Button onClick={applyMove}>{t("save")}</Button></div>
        </div>
      </Modal>

      <Modal open={!!financeOpen} onClose={() => setFinanceOpen(null)} title={ar ? "حركة مالية للفني" : "Technician financial transaction"}>
        <div className="space-y-3">
          <Input type="number" min={1} value={financeAmount} onChange={(e) => setFinanceAmount(e.target.value)} placeholder={ar ? "المبلغ" : "Amount"} />
          {financeOpen === "expense" && <><Select value={financeCategory} onChange={(e) => setFinanceCategory(e.target.value)}>{[...(settings.expenseCategories || []), "بنزين", "وجبات", "مشتريات", "صيانة سيارة", "مخالفات"].filter(Boolean).map((cat) => <option key={cat} value={cat}>{cat}</option>)}</Select><Input value={financeCustomCategory} onChange={(e) => setFinanceCustomCategory(e.target.value)} placeholder={ar ? "تصنيف مخصص اختياري" : "Optional custom category"} /></>}
          <Select value={financeMethod} onChange={(e) => setFinanceMethod(e.target.value)}><option value="cash">{ar ? "كاش" : "Cash"}</option><option value="card">{ar ? "شبكة" : "Card"}</option><option value="transfer">{ar ? "تحويل" : "Transfer"}</option></Select>
          <Input value={financeReference} onChange={(e) => setFinanceReference(e.target.value)} placeholder={ar ? "رقم مرجعي" : "Reference"} />
          <Textarea rows={3} value={financeNotes} onChange={(e) => setFinanceNotes(e.target.value)} placeholder={ar ? "ملاحظات" : "Notes"} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setFinanceOpen(null)}>{t("cancel")}</Button><Button onClick={recordFinance}>{t("save")}</Button></div>
        </div>
      </Modal>

      {printMode === "single" && selectedTech && <div className="hidden print:block print-root"><h1 className="text-xl font-bold">{settings.companyHeader.name}</h1><h2 className="mt-2 text-lg font-bold">{ar ? "تقرير عهدة الفني" : "Technician custody report"} — {selectedTech.name}</h2><p className="text-sm">{formatDate(Date.now(), ar)}</p><table className="mt-4 w-full text-sm"><thead><tr className="border-b"><th>{ar ? "الصنف" : "Item"}</th><th>SKU</th><th>{ar ? "الكمية" : "Qty"}</th><th>{ar ? "تكلفة الوحدة شاملة الضريبة" : "Unit cost incl. tax"}</th><th>{ar ? "الإجمالي" : "Total"}</th></tr></thead><tbody>{techItems.filter((i) => i.qty > 0).map((item) => { const cat = catalog.find((c) => c.id === item.catalogId); const unit = itemUnitCostWithTax(cat); return <tr key={item.id}><td>{item.itemName}</td><td>{item.sku || cat?.sku || "—"}</td><td>{item.qty}</td><td>{unit.toFixed(2)}</td><td>{(unit * item.qty).toFixed(2)}</td></tr>; })}</tbody></table><p className="mt-3 font-bold">{ar ? "الإجمالي" : "Total"}: {stockValue.toFixed(2)} {currency}</p><div className="mt-10 grid grid-cols-2 gap-10"><div className="border-t pt-2">{ar ? "توقيع المستلم" : "Receiver signature"}</div><div className="border-t pt-2">{ar ? "توقيع مسؤول المستودع" : "Warehouse signature"}</div></div></div>}
      {printMode === "all" && <div className="hidden print:block print-root"><h1 className="text-xl font-bold">{settings.companyHeader.name}</h1><h2 className="mt-2 text-lg font-bold">{ar ? "التقرير الشامل لعهد الفنيين" : "All technicians custody report"}</h2>{allTechSummary.map((row) => <section key={row.tech.id} className="break-inside-avoid pt-6"><h3 className="font-bold">{row.tech.name} — {row.value.toFixed(2)} {currency}</h3><table className="mt-2 w-full text-sm"><thead><tr className="border-b"><th>{ar ? "الصنف" : "Item"}</th><th>{ar ? "الكمية" : "Qty"}</th><th>{ar ? "الإجمالي" : "Total"}</th></tr></thead><tbody>{techInventory.filter((i) => sameTech(i, row.tech) && i.qty > 0).map((item) => <tr key={item.id}><td>{item.itemName}</td><td>{item.qty}</td><td>{inventoryItemValue(item, catalog).toFixed(2)}</td></tr>)}</tbody></table></section>)}</div>}
    </div>
  );
}
