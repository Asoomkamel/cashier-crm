"use client";

import React, { useMemo, useState } from "react";
import { useApp, useT } from "@/lib/store";
import { Card, PageTitle, Button, Input, SuggestInput, Select, Modal, Table, Badge } from "@/components/ui";
import { Vendor, PurchaseInvoice, PurchaseItem, uid } from "@/lib/types";
import { downloadWorkbookXlsx, makeXlsxFileName } from "@/lib/xlsxExport";
import { readWorkbookImport } from "@/lib/xlsxImport";
import { applyBackupPayload } from "@/lib/backupPayload";
import { saveToSupabaseBackup } from "@/lib/supabaseBackup";
import { buildFullPayload } from "@/lib/fullPayload";

export default function PurchasesPage() {
  const { vendors, setVendors, purchases, setPurchases, catalog, setCatalog, settings } = useApp();
  const t = useT();
  const ar = settings.language === "ar";

  // ---- Vendors ----
  const [vendorOpen, setVendorOpen] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [vendorAddress, setVendorAddress] = useState("");
  const [vendorTaxNumber, setVendorTaxNumber] = useState("");
  const [statementVendor, setStatementVendor] = useState<Vendor | null>(null);
  const [lastReceipt, setLastReceipt] = useState<{ invoice: PurchaseInvoice; amount: number } | null>(null);
  const [excelStatus, setExcelStatus] = useState("");

  const exportPurchasesExcel = async () => {
    await downloadWorkbookXlsx(makeXlsxFileName("purchases-vendors"), { vendors, purchases });
  };

  const exportVendorStatementExcel = async (vendor: Vendor) => {
    const vendorPurchases = purchases.filter((purchase) => purchase.vendorId === vendor.id);
    await downloadWorkbookXlsx(makeXlsxFileName(`vendor-statement-${vendor.name}`), { vendors: [vendor], purchases: vendorPurchases });
  };

  const importPurchasesExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setExcelStatus(ar ? "جارٍ استيراد ملف Excel…" : "Importing Excel…");
      const parsed = await readWorkbookImport(file, "purchases");
      const { imported, empty } = applyBackupPayload(parsed.payload, "merge");
      if (!empty) await saveToSupabaseBackup(buildFullPayload());
      setExcelStatus(empty ? (ar ? "لم يتم العثور على بيانات متوافقة." : "No compatible data found.") : (ar ? `تم الاستيراد: ${imported.join(", ")}. جارٍ إعادة التحميل…` : `Imported: ${imported.join(", ")}. Reloading…`));
      if (!empty) setTimeout(() => window.location.reload(), 900);
    } catch (err: any) {
      setExcelStatus(`❌ ${err?.message || (ar ? "تعذر استيراد Excel." : "Could not import Excel.")}`);
    }
  };

  const saveVendor = () => {
    if (!vendorName || !vendorPhone) return;
    setVendors([...vendors, { id: uid("vendor"), name: vendorName, phone: vendorPhone, address: vendorAddress || undefined, taxNumber: vendorTaxNumber || undefined, createdAt: Date.now() }]);
    setVendorName(""); setVendorPhone(""); setVendorAddress(""); setVendorTaxNumber(""); setVendorOpen(false);
  };
  const removeVendor = (id: string) => setVendors(vendors.filter((v) => v.id !== id));

  // ---- Purchase / Return invoice entry ----
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceType, setInvoiceType] = useState<"purchase" | "return">("purchase");
  const [vendorId, setVendorId] = useState("");
  const [cart, setCart] = useState<PurchaseItem[]>([]);
  const [pickCatalogId, setPickCatalogId] = useState("");
  const [pickQty, setPickQty] = useState("1");
  const [pickCost, setPickCost] = useState("");
  const [pickSalePrice, setPickSalePrice] = useState("");
  const [newProductName, setNewProductName] = useState("");
  const [newProductBarcode, setNewProductBarcode] = useState("");
  const [newProductSalePrice, setNewProductSalePrice] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer" | "partial">("cash");
  const [paidAmount, setPaidAmount] = useState("");

  // ---- Vendor payment ----
  const [payingInvoice, setPayingInvoice] = useState<PurchaseInvoice | null>(null);
  const [payAmount, setPayAmount] = useState("");

  const totals = useMemo(() => {
    const totalTax = cart.reduce((s, it) => s + it.costPrice * it.qty * (it.tax / 100), 0);
    const totalBeforeTax = cart.reduce((s, it) => s + it.costPrice * it.qty, 0);
    const grandTotal = totalBeforeTax + totalTax;
    return { totalBeforeTax, totalTax, grandTotal };
  }, [cart]);

  const selectCatalogItem = (id: string) => {
    setPickCatalogId(id);
    const item = catalog.find((c) => c.id === id);
    if (!item) {
      setPickCost("");
      setPickSalePrice("");
      return;
    }
    setPickCost(item.costPrice !== undefined ? String(item.costPrice) : "");
    setPickSalePrice(item.price !== undefined ? String(item.price) : "");
  };

  const addQuickProduct = () => {
    const name = newProductName.trim();
    if (!name) return;
    const salePrice = Number(newProductSalePrice || pickSalePrice) || 0;
    const costPrice = Number(pickCost) || 0;
    const product = {
      id: uid("cat"),
      name,
      type: "product" as const,
      price: salePrice,
      costPrice,
      tax: settings.defaultTaxRate,
      barcode: newProductBarcode.trim() || undefined,
      stock: 0,
      lowStockThreshold: 0,
    };
    setCatalog([...catalog, product]);
    setPickCatalogId(product.id);
    setPickSalePrice(String(salePrice));
    if (!pickCost && costPrice) setPickCost(String(costPrice));
    setNewProductName("");
    setNewProductBarcode("");
    setNewProductSalePrice("");
  };

  const addLine = () => {
    const item = catalog.find((c) => c.id === pickCatalogId);
    if (!item) return;
    const qty = Number(pickQty) || 1;
    const cost = Number(pickCost) || item.costPrice || 0;
    const salePrice = Number(pickSalePrice) || item.price || 0;
    setCart((prev) => {
      const existing = prev.find((p) => p.catalogId === item.id);
      if (existing) {
        return prev.map((p) => (p.catalogId === item.id ? { ...p, qty: p.qty + qty, costPrice: cost, salePrice, barcode: item.barcode } : p));
      }
      return [...prev, { catalogId: item.id, name: item.name, costPrice: cost, salePrice, barcode: item.barcode, qty, tax: item.tax }];
    });
    setPickCatalogId(""); setPickQty("1"); setPickCost(""); setPickSalePrice("");
  };

  const removeLine = (catalogId: string) => setCart((prev) => prev.filter((p) => p.catalogId !== catalogId));

  const saveInvoice = () => {
    if (!vendorId || cart.length === 0) return;
    const vendor = vendors.find((v) => v.id === vendorId);
    if (!vendor) return;
    const paid = paymentMethod === "partial" ? Number(paidAmount) || 0 : totals.grandTotal;

    const invoice: PurchaseInvoice = {
      id: uid("pinv"),
      vendorId: vendor.id,
      vendorName: vendor.name,
      referenceNumber: referenceNumber.trim() || undefined,
      items: cart,
      totalBeforeTax: totals.totalBeforeTax,
      totalTax: totals.totalTax,
      grandTotal: totals.grandTotal,
      paidAmount: paid,
      remainingAmount: Math.max(0, totals.grandTotal - paid),
      type: invoiceType,
      date: Date.now(),
    };
    setPurchases([...purchases, invoice]);

    // Update stock and cost price: purchases increase stock, returns decrease it.
    const sign = invoiceType === "purchase" ? 1 : -1;
    setCatalog(
      catalog.map((item) => {
        const line = cart.find((c) => c.catalogId === item.id);
        if (!line) return item;
        const newStock = Math.max(0, (item.stock ?? 0) + sign * line.qty);
        return {
          ...item,
          stock: newStock,
          costPrice: invoiceType === "purchase" ? line.costPrice : item.costPrice,
          price: line.salePrice !== undefined ? line.salePrice : item.price,
          barcode: line.barcode || item.barcode,
        };
      })
    );

    setCart([]); setVendorId(""); setPaidAmount(""); setReferenceNumber(""); setPickCatalogId(""); setPickCost(""); setPickSalePrice(""); setInvoiceOpen(false);
  };

  const recordPayment = () => {
    if (!payingInvoice) return;
    const amt = Number(payAmount);
    if (!amt || amt <= 0) return;
    if (amt > payingInvoice.remainingAmount) { alert("Payment exceeds the remaining balance."); return; }
    setPurchases(
      purchases.map((p) =>
        p.id === payingInvoice.id
          ? { ...p, paidAmount: p.paidAmount + amt, remainingAmount: p.remainingAmount - amt }
          : p
      )
    );
    setLastReceipt({ invoice: payingInvoice, amount: amt });
    setPayingInvoice(null);
    setPayAmount("");
  };

  return (
    <div>
      <PageTitle
        title={t("purchases_title")}
        action={
          <div className="flex flex-wrap gap-2 no-print">
            <Button variant="secondary" onClick={exportPurchasesExcel}>{ar ? "تصدير Excel" : "Export Excel"}</Button>
            <label className="cursor-pointer rounded-lg bg-slate-100 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200">{ar ? "استيراد Excel" : "Import Excel"}<input type="file" accept=".xlsx,.xls" className="hidden" onChange={importPurchasesExcel} /></label>
            <Button variant="secondary" onClick={() => setVendorOpen(true)}>{t("purchases_new_vendor")}</Button>
            <Button onClick={() => setInvoiceOpen(true)}>{t("purchases_new_invoice")}</Button>
          </div>
        }
      />

      {excelStatus && <Card className="mb-3 text-sm text-slate-600">{excelStatus}</Card>}

      <Card className="mb-4">
        <h2 className="mb-2 font-semibold">{t("purchases_vendors")}</h2>
        <Table headers={[t("name"), t("phone"), ""]}>
          {vendors.map((v) => (
            <tr key={v.id} className="border-b border-slate-100">
              <td className="px-2 py-2">{v.name}</td>
              <td className="px-2 py-2">{v.phone}</td>
              <td className="px-2 py-2 text-right whitespace-nowrap">
                <button className="mr-3 text-brand-600 hover:underline" onClick={() => setStatementVendor(v)}>{t("purchases_view_statement")}</button>
                <button className="text-red-600 hover:underline" onClick={() => removeVendor(v.id)}>{t("delete")}</button>
              </td>
            </tr>
          ))}
        </Table>
        {vendors.length === 0 && <p className="mt-2 text-sm text-slate-400">{t("purchases_no_vendors")}</p>}
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">{t("purchases_invoices")}</h2>
        <Table headers={[t("purchases_vendor"), t("type"), t("total"), t("purchases_paid"), t("purchases_remaining"), t("date"), ""]}>
          {purchases.slice().reverse().map((p) => (
            <tr key={p.id} className="border-b border-slate-100">
              <td className="px-2 py-2">{p.vendorName}</td>
              <td className="px-2 py-2"><Badge tone={p.type === "purchase" ? "blue" : "amber"}>{p.type === "purchase" ? t("purchases_purchase") : t("purchases_return")}</Badge></td>
              <td className="px-2 py-2">{p.grandTotal.toFixed(2)} {settings.currency}</td>
              <td className="px-2 py-2">{p.paidAmount.toFixed(2)}</td>
              <td className="px-2 py-2">{p.remainingAmount.toFixed(2)}</td>
              <td className="px-2 py-2 text-xs">{new Date(p.date).toLocaleDateString()}</td>
              <td className="px-2 py-2 text-right">
                {p.remainingAmount > 0 && (
                  <button className="text-brand-600 hover:underline" onClick={() => { setPayingInvoice(p); setPayAmount(""); }}>{t("purchases_record_payment")}</button>
                )}
              </td>
            </tr>
          ))}
        </Table>
        {purchases.length === 0 && <p className="mt-2 text-sm text-slate-400">{t("purchases_no_invoices")}</p>}
      </Card>

      <Modal open={vendorOpen} onClose={() => setVendorOpen(false)} title={t("purchases_new_vendor")}>
        <div className="space-y-3">
          <div><label className="mb-1 block text-sm font-medium">{t("name")}</label><SuggestInput category="vendorName" value={vendorName} onChange={(e) => setVendorName(e.target.value)} /></div>
          <div><label className="mb-1 block text-sm font-medium">{t("phone")}</label><SuggestInput category="vendorPhone" value={vendorPhone} onChange={(e) => setVendorPhone(e.target.value)} /></div>
          <div><label className="mb-1 block text-sm font-medium">{t("purchases_vendor_address")}</label><Input value={vendorAddress} onChange={(e) => setVendorAddress(e.target.value)} /></div>
          <div><label className="mb-1 block text-sm font-medium">{t("purchases_vendor_tax_number")}</label><Input value={vendorTaxNumber} onChange={(e) => setVendorTaxNumber(e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setVendorOpen(false)}>{t("cancel")}</Button>
            <Button onClick={saveVendor}>{t("save")}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={invoiceOpen} onClose={() => setInvoiceOpen(false)} title={t("purchases_new_invoice")}>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("purchases_vendor")}</label>
              <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">{t("purchases_select_vendor")}</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("type")}</label>
              <Select value={invoiceType} onChange={(e) => setInvoiceType(e.target.value as any)}>
                <option value="purchase">{t("purchases_purchase")}</option>
                <option value="return">{t("purchases_return")}</option>
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t("purchases_reference_number")}</label>
            <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
          </div>

          <div className="rounded border border-slate-200 p-3">
            <div className="mb-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-sm font-medium text-slate-700">{t("purchases_add_quick_product")}</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <Input placeholder={t("purchases_product_name")} value={newProductName} onChange={(e) => setNewProductName(e.target.value)} />
                <Input placeholder={t("catalog_barcode")} value={newProductBarcode} onChange={(e) => setNewProductBarcode(e.target.value)} />
                <Input type="number" placeholder={t("purchases_sale_price")} value={newProductSalePrice} onChange={(e) => setNewProductSalePrice(e.target.value)} />
                <Button variant="secondary" onClick={addQuickProduct}>{t("add")}</Button>
              </div>
            </div>

            <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Select value={pickCatalogId} onChange={(e) => selectCatalogItem(e.target.value)} className="col-span-2">
                <option value="">{t("catalog_product")}…</option>
                {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}{c.barcode ? ` — ${c.barcode}` : ""}</option>)}
              </Select>
              <Input type="number" placeholder={t("qty")} value={pickQty} onChange={(e) => setPickQty(e.target.value)} />
              <Input type="number" placeholder={t("purchases_purchase_cost")} value={pickCost} onChange={(e) => setPickCost(e.target.value)} />
              <Input type="number" placeholder={t("purchases_sale_price")} value={pickSalePrice} onChange={(e) => setPickSalePrice(e.target.value)} />
            </div>
            <Button variant="secondary" onClick={addLine}>{t("add")}</Button>

            <div className="mt-3 space-y-1 text-sm">
              {cart.map((it) => (
                <div key={it.catalogId} className="flex justify-between border-b border-slate-100 py-1">
                  <span>{it.name} × {it.qty} @ {it.costPrice.toFixed(2)} <span className="text-xs text-slate-400">({t("purchases_sale_price")}: {(it.salePrice ?? 0).toFixed(2)})</span></span>
                  <span>
                    {(it.costPrice * it.qty).toFixed(2)}
                    <button className="ml-2 text-red-500" onClick={() => removeLine(it.catalogId)}>✕</button>
                  </span>
                </div>
              ))}
              {cart.length === 0 && <p className="text-slate-400">{t("purchases_no_invoices")}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("pos_payment")}</label>
              <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)}>
                <option value="cash">{t("pos_cash")}</option>
                <option value="transfer">{t("pos_transfer")}</option>
                <option value="partial">{t("pos_partial")}</option>
              </Select>
            </div>
            {paymentMethod === "partial" && (
              <div>
                <label className="mb-1 block text-sm font-medium">{t("pos_paid_amount")}</label>
                <Input type="number" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
              </div>
            )}
          </div>

          <div className="space-y-1 border-t border-slate-200 pt-2 text-sm">
            <div className="flex justify-between"><span>{t("subtotal")}</span><span>{totals.totalBeforeTax.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>{t("tax")}</span><span>{totals.totalTax.toFixed(2)}</span></div>
            <div className="flex justify-between text-base font-bold"><span>{t("total")}</span><span>{totals.grandTotal.toFixed(2)} {settings.currency}</span></div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setInvoiceOpen(false)}>{t("cancel")}</Button>
            <Button onClick={saveInvoice}>{t("save")}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!payingInvoice} onClose={() => setPayingInvoice(null)} title={t("purchases_record_payment")}>
        <div className="space-y-3">
          {payingInvoice && <p className="text-sm text-slate-500">Remaining balance: {payingInvoice.remainingAmount.toFixed(2)} {settings.currency}</p>}
          <Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder={t("amount")} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setPayingInvoice(null)}>{t("cancel")}</Button>
            <Button onClick={recordPayment}>{t("save")}</Button>
          </div>
        </div>
      </Modal>
      <Modal open={!!statementVendor} onClose={() => setStatementVendor(null)} title={t("purchases_statement_title")}>
        {statementVendor && (
          <div className="space-y-3 print-root">
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="font-medium">{statementVendor.name}</div>
              <div className="text-slate-500">{statementVendor.phone}</div>
              {statementVendor.address && <div className="text-slate-500">{statementVendor.address}</div>}
              {statementVendor.taxNumber && <div className="text-slate-500">{t("purchases_vendor_tax_number")}: {statementVendor.taxNumber}</div>}
            </div>
            {(() => {
              const vendorPurchases = purchases.filter((p) => p.vendorId === statementVendor.id).sort((a, b) => b.date - a.date);
              const balance = vendorPurchases.reduce((s, p) => s + (p.type === "purchase" ? p.remainingAmount : -p.remainingAmount), 0);
              return (
                <>
                  <Table headers={[t("date"), t("type"), t("total"), t("purchases_paid"), t("purchases_remaining")]}>
                    {vendorPurchases.map((p) => (
                      <tr key={p.id} className="border-b border-slate-100">
                        <td className="px-2 py-2 text-xs">{new Date(p.date).toLocaleDateString()}</td>
                        <td className="px-2 py-2">{p.type === "purchase" ? t("purchases_purchase") : t("purchases_return")}</td>
                        <td className="px-2 py-2">{p.grandTotal.toFixed(2)}</td>
                        <td className="px-2 py-2">{p.paidAmount.toFixed(2)}</td>
                        <td className="px-2 py-2">{p.remainingAmount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </Table>
                  <p className="font-semibold">{t("purchases_balance")}: {balance.toFixed(2)} {settings.currency}</p>
                </>
              );
            })()}
            <div className="flex justify-end gap-2 pt-2 no-print">
              <Button variant="secondary" onClick={() => exportVendorStatementExcel(statementVendor)}>{ar ? "تصدير الكشف Excel" : "Export statement Excel"}</Button>
              <Button variant="secondary" onClick={() => window.print()}>{t("reports_print")}</Button>
              <Button onClick={() => setStatementVendor(null)}>{t("close")}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!lastReceipt} onClose={() => setLastReceipt(null)} title={t("purchases_receipt_title")}>
        {lastReceipt && (
          <div className="space-y-2 text-sm print-root">
            <div className="flex justify-between"><span>{t("catalog_vendor")}</span><span>{lastReceipt.invoice.vendorName}</span></div>
            <div className="flex justify-between"><span>{t("date")}</span><span>{new Date().toLocaleString()}</span></div>
            <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-2"><span>{t("amount")}</span><span>{lastReceipt.amount.toFixed(2)} {settings.currency}</span></div>
            <div className="flex justify-end gap-2 pt-3 no-print">
              <Button variant="secondary" onClick={() => window.print()}>{t("purchases_print_receipt")}</Button>
              <Button onClick={() => setLastReceipt(null)}>{t("close")}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
