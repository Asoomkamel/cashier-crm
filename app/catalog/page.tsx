"use client";

import React, { useMemo, useState } from "react";
import { useApp, useT } from "@/lib/store";
import { Card, PageTitle, Button, Input, Select, Modal, Table } from "@/components/ui";
import { CatalogItem, uid } from "@/lib/types";
import { openWhatsApp } from "@/lib/whatsapp";
import { downloadWorkbookXlsx, makeXlsxFileName } from "@/lib/xlsxExport";
import { importStatusMessage, importWorkbookToSystem } from "@/lib/xlsxPageActions";
import { recordAuditLog } from "@/lib/modules/audit/service";

const EMPTY: Partial<CatalogItem> = { name: "", type: "product", price: 0, costPrice: 0, tax: 15, stock: 0, category: "غير مصنف", unit: "قطعة" };

export default function CatalogPage() {
  const { catalog, setCatalog, settings, setSettings, vendors, activeUser } = useApp();
  const t = useT();
  const ar = settings.language === "ar";
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<CatalogItem>>(EMPTY);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [addSubId, setAddSubId] = useState("");
  const [addSubQty, setAddSubQty] = useState("1");
  const [excelStatus, setExcelStatus] = useState("");

  const productCategories = useMemo(() => {
    const configured = settings.productCategories?.length ? settings.productCategories : settings.categories || [];
    return Array.from(new Set([...configured, ...catalog.map((c) => c.category || "غير مصنف")].filter(Boolean)));
  }, [settings.productCategories, settings.categories, catalog]);

  const filtered = catalog.filter((c) => {
    const q = search.toLowerCase();
    const matchesSearch =
      (c.name || "").toLowerCase().includes(q) ||
      (c.sku || "").toLowerCase().includes(q) ||
      (c.barcode || "").toLowerCase().includes(q) ||
      (c.category || "").toLowerCase().includes(q);
    const matchesCategory = !categoryFilter || (c.category || "غير مصنف") === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const lowStockItems = useMemo(
    () => catalog.filter((c) => c.type === "product" && (c.stock ?? 0) <= (c.lowStockThreshold ?? 3)),
    [catalog]
  );

  const pretaxPrice = (price?: number, tax?: number) => {
    const p = price ?? 0;
    const tx = tax ?? 0;
    return p / (1 + tx / 100);
  };

  const openNew = () => { setEditing({ ...EMPTY, tax: settings.defaultTaxRate, category: productCategories[0] || "غير مصنف" }); setOpen(true); };
  const openEdit = (c: CatalogItem) => { setEditing(c); setOpen(true); };

  const save = () => {
    if (!editing.name || editing.price === undefined) return;
    if (editing.id) {
      const prev = catalog.find((c) => c.id === editing.id);
      if (prev && prev.price !== Number(editing.price)) {
        recordAuditLog({ user: activeUser, action: "catalog.price_change", details: `${editing.name}: ${prev.price} → ${editing.price}` });
      } else {
        recordAuditLog({ user: activeUser, action: "catalog.update", details: String(editing.name) });
      }
      setCatalog(catalog.map((c) => (c.id === editing.id ? { ...(c as CatalogItem), ...editing } as CatalogItem : c)));
    } else {
      const item: CatalogItem = {
        id: uid("item"),
        name: editing.name!,
        type: (editing.type as any) || "product",
        price: Number(editing.price) || 0,
        priceBeforeDiscount: editing.priceBeforeDiscount ? Number(editing.priceBeforeDiscount) : undefined,
        costPrice: Number(editing.costPrice) || 0,
        tax: Number(editing.tax) ?? settings.defaultTaxRate,
        stock: Number(editing.stock) || 0,
        lowStockThreshold: editing.lowStockThreshold !== undefined ? Number(editing.lowStockThreshold) : undefined,
        category: editing.category || productCategories[0] || "غير مصنف",
        sku: editing.sku,
        barcode: editing.barcode,
        vendorName: editing.vendorName,
        unit: editing.unit || undefined,
        isBundle: Boolean(editing.isBundle),
        subProducts: editing.isBundle ? editing.subProducts || [] : undefined,
      };
      recordAuditLog({ user: activeUser, action: "catalog.add", details: `${item.name} — ${item.price} — ${item.type}` });
      setCatalog([...catalog, item]);
    }
    setOpen(false);
  };

  const remove = (id: string) => {
    const item = catalog.find((c) => c.id === id);
    if (confirm(t("delete") + "?")) {
      recordAuditLog({ user: activeUser, action: "catalog.delete", details: item?.name || id });
      setCatalog(catalog.filter((c) => c.id !== id));
    }
  };

  const addSubProduct = () => {
    if (!addSubId) return;
    const qty = Number(addSubQty) || 1;
    setEditing((cur) => {
      const existing = cur.subProducts || [];
      if (existing.some((s) => s.id === addSubId)) return cur;
      return { ...cur, subProducts: [...existing, { id: addSubId, qty }] };
    });
    setAddSubId("");
    setAddSubQty("1");
  };

  const removeSubProduct = (id: string) => {
    setEditing((cur) => ({ ...cur, subProducts: (cur.subProducts || []).filter((s) => s.id !== id) }));
  };

  const addProductCategory = () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    const current = settings.productCategories?.length ? settings.productCategories : settings.categories || [];
    const exists = current.some((cat) => cat.trim().toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      setSettings({ ...settings, productCategories: [...current, trimmed] });
    }
    setEditing({ ...editing, category: trimmed });
    setNewCategory("");
  };

  const exportCatalogExcel = async () => {
    await downloadWorkbookXlsx(makeXlsxFileName("catalog"), { catalog: filtered });
  };

  const importCatalogExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setExcelStatus(ar ? "جارٍ استيراد ملف Excel…" : "Importing Excel…");
      const result = await importWorkbookToSystem(file, "catalog", "merge");
      setExcelStatus(importStatusMessage(result, ar));
      if (!result.empty) setTimeout(() => window.location.reload(), 900);
    } catch (err: any) {
      setExcelStatus(`❌ ${err?.message || (ar ? "تعذر استيراد Excel." : "Could not import Excel.")}`);
    }
  };

  const requestSupply = (item: CatalogItem) => {
    const vendor = vendors.find((v) => v.name === item.vendorName);
    if (!vendor?.phone) {
      alert(t("catalog_no_vendor_phone"));
      return;
    }
    const message = t("catalog_supply_message").replace("{item}", item.name).replace("{stock}", String(item.stock ?? 0));
    openWhatsApp(vendor.phone, message);
  };

  const printLowStock = () => window.print();

  return (
    <div>
      <PageTitle
        title={t("catalog_title")}
        action={
          <div className="flex gap-2 no-print">
            <Button variant="secondary" onClick={exportCatalogExcel}>{ar ? "تصدير Excel" : "Export Excel"}</Button>
            <label className="cursor-pointer rounded-lg bg-slate-100 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200">{ar ? "استيراد Excel" : "Import Excel"}<input type="file" accept=".xlsx,.xls" className="hidden" onChange={importCatalogExcel} /></label>
            <Button variant="secondary" onClick={printLowStock}>{t("catalog_print_low_stock")}</Button>
            <Button onClick={openNew}>{t("catalog_new")}</Button>
          </div>
        }
      />

      {excelStatus && <Card className="mb-3 text-sm text-slate-600">{excelStatus}</Card>}

      <Card>
        <div className="mb-3 flex flex-wrap gap-2">
          <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="max-w-[200px]">
            <option value="">{settings.language === "ar" ? "كل التصنيفات" : "All categories"}</option>
            {productCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </Select>
        </div>
        <Table headers={[t("name"), t("category"), t("catalog_sku"), ar ? "الوحدة" : "Unit", t("catalog_vendor"), t("type"), t("price"), `${t("tax")} %`, t("catalog_stock"), ""]}>
          {filtered.map((c) => (
            <tr key={c.id} className="border-b border-slate-100">
              <td className="px-2 py-2">{c.name}{c.isBundle && <span className="ms-1 text-xs text-brand-600">({t("catalog_bundle_badge")})</span>}</td>
              <td className="px-2 py-2 text-slate-500">{c.category || "غير مصنف"}</td>
              <td className="px-2 py-2 text-slate-500">{c.sku || "—"}</td>
              <td className="px-2 py-2 text-slate-500">{c.unit || "—"}</td>
              <td className="px-2 py-2 text-slate-500">{c.vendorName || "—"}</td>
              <td className="px-2 py-2 capitalize">{c.type === "product" ? t("catalog_product") : t("catalog_service")}</td>
              <td className="px-2 py-2">{c.price.toFixed(2)} {settings.currency}</td>
              <td className="px-2 py-2">{c.tax}%</td>
              <td className="px-2 py-2">
                {c.type === "product" ? (
                  <span className={(c.stock ?? 0) <= (c.lowStockThreshold ?? 3) ? "font-semibold text-red-600" : ""}>{c.stock ?? 0}</span>
                ) : "—"}
              </td>
              <td className="px-2 py-2 text-right whitespace-nowrap">
                <button className="mr-3 text-brand-600 hover:underline" onClick={() => openEdit(c)}>{t("edit")}</button>
                <button className="text-red-600 hover:underline" onClick={() => remove(c.id)}>{t("delete")}</button>
              </td>
            </tr>
          ))}
        </Table>
        {filtered.length === 0 && <p className="mt-3 text-sm text-slate-400">{t("catalog_no_items")}</p>}
      </Card>

      {/* Low stock report — visible on screen, and this is what prints via the button above */}
      {lowStockItems.length > 0 && (
        <Card className="mt-4">
          <h2 className="mb-2 font-semibold">{t("catalog_low_stock_report")}</h2>
          <Table headers={[t("name"), t("category"), t("catalog_vendor"), t("catalog_stock"), ""]}>
            {lowStockItems.map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="px-2 py-2">{c.name}</td>
                <td className="px-2 py-2 text-slate-500">{c.category || "غير مصنف"}</td>
                <td className="px-2 py-2 text-slate-500">{c.vendorName || "—"}</td>
                <td className="px-2 py-2 font-semibold text-red-600">{c.stock ?? 0}</td>
                <td className="px-2 py-2 text-right no-print">
                  <button className="text-green-600 hover:underline" onClick={() => requestSupply(c)}>{t("catalog_request_supply")}</button>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing.id ? t("edit") : t("catalog_new")}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">{t("name")}</label>
            <Input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("type")}</label>
              <Select value={editing.type || "product"} onChange={(e) => setEditing({ ...editing, type: e.target.value as any })}>
                <option value="product">{t("catalog_product")}</option>
                <option value="service">{t("catalog_service")}</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("category")}</label>
              <Select value={editing.category || ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                <option value="">{settings.language === "ar" ? "غير مصنف" : "Uncategorized"}</option>
                {productCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </Select>
              <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder={settings.language === "ar" ? "تصنيف جديد" : "New category"} />
                <Button variant="secondary" onClick={addProductCategory}>{settings.language === "ar" ? "+ تصنيف" : "+ Category"}</Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("catalog_sku")}</label>
              <Input value={editing.sku || ""} onChange={(e) => setEditing({ ...editing, sku: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("catalog_barcode")}</label>
              <Input value={editing.barcode || ""} onChange={(e) => setEditing({ ...editing, barcode: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">{settings.language === "ar" ? "وحدة القياس" : "Unit"}</label>
              <Input value={editing.unit || ""} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} placeholder={settings.language === "ar" ? "قطعة، علبة، خدمة" : "piece, box, service"} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("catalog_vendor")}</label>
              <Select value={editing.vendorName || ""} onChange={(e) => setEditing({ ...editing, vendorName: e.target.value })}>
                <option value="">—</option>
                {vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("catalog_price_before_discount")}</label>
              <Input type="number" value={editing.priceBeforeDiscount ?? ""} onChange={(e) => setEditing({ ...editing, priceBeforeDiscount: Number(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("price")}</label>
              <Input type="number" value={editing.price ?? 0} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("catalog_cost")}</label>
              <Input type="number" value={editing.costPrice ?? 0} onChange={(e) => setEditing({ ...editing, costPrice: Number(e.target.value) })} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("tax")} %</label>
              <Input type="number" value={editing.tax ?? 15} onChange={(e) => setEditing({ ...editing, tax: Number(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("catalog_pretax_price")}</label>
              <Input type="number" value={pretaxPrice(editing.price, editing.tax).toFixed(2)} readOnly className="bg-slate-50" />
            </div>
          </div>

          {editing.type === "product" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">{t("catalog_stock")}</label>
                <Input type="number" value={editing.stock ?? 0} onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t("catalog_low_stock_threshold")}</label>
                <Input type="number" value={editing.lowStockThreshold ?? 3} onChange={(e) => setEditing({ ...editing, lowStockThreshold: Number(e.target.value) })} />
              </div>
            </div>
          )}

          <div className="rounded border border-slate-200 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={Boolean(editing.isBundle)} onChange={(e) => setEditing({ ...editing, isBundle: e.target.checked })} />
              {t("catalog_is_bundle")}
            </label>

            {editing.isBundle && (
              <div className="mt-3">
                <div className="mb-2 grid grid-cols-3 gap-2">
                  <Select value={addSubId} onChange={(e) => setAddSubId(e.target.value)} className="col-span-2">
                    <option value="">{t("catalog_bundle_items")}…</option>
                    {catalog.filter((c) => c.id !== editing.id && !c.isBundle).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                  <Input type="number" min={1} value={addSubQty} onChange={(e) => setAddSubQty(e.target.value)} placeholder={t("qty")} />
                </div>
                <Button variant="secondary" onClick={addSubProduct}>{t("catalog_add_component")}</Button>

                <div className="mt-2 space-y-1 text-sm">
                  {(editing.subProducts || []).map((sub) => {
                    const subItem = catalog.find((c) => c.id === sub.id);
                    return (
                      <div key={sub.id} className="flex justify-between border-b border-slate-100 py-1">
                        <span>{subItem?.name || sub.id} × {sub.qty}</span>
                        <button className="text-red-500" onClick={() => removeSubProduct(sub.id)}>✕</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button onClick={save}>{t("save")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
