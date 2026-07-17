"use client";

import React, { useState } from "react";
import { useApp, useT } from "@/lib/store";
import { Card, PageTitle, Button, Input, SuggestInput, Select, Modal, Table } from "@/components/ui";
import { downloadWorkbookXlsx, makeXlsxFileName } from "@/lib/xlsxExport";
import { importStatusMessage, importWorkbookToSystem } from "@/lib/xlsxPageActions";
import { Expense, uid } from "@/lib/types";

export default function ExpensesPage() {
  const { expenses, setExpenses, settings } = useApp();
  const t = useT();
  const ar = settings.language === "ar";
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(settings.expenseCategories[0] || "Other");
  const [description, setDescription] = useState("");
  const [excelStatus, setExcelStatus] = useState("");

  const exportExpensesExcel = async () => {
    await downloadWorkbookXlsx(makeXlsxFileName("expenses"), { expenses });
  };

  const importExpensesExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setExcelStatus(ar ? "جارٍ استيراد ملف Excel…" : "Importing Excel…");
      const result = await importWorkbookToSystem(file, "expenses", "merge");
      setExcelStatus(importStatusMessage(result, ar));
      if (!result.empty) setTimeout(() => window.location.reload(), 900);
    } catch (err: any) {
      setExcelStatus(`❌ ${err?.message || (ar ? "تعذر استيراد Excel." : "Could not import Excel.")}`);
    }
  };

  const save = () => {
    if (!amount) return;
    const e: Expense = { id: uid("exp"), amount: Number(amount), category, description, date: Date.now() };
    setExpenses([...expenses, e]);
    setAmount(""); setDescription(""); setOpen(false);
  };

  const remove = (id: string) => setExpenses(expenses.filter((e) => e.id !== id));

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <PageTitle title={t("expenses_title")} action={<div className="flex flex-wrap gap-2 no-print"><Button variant="secondary" onClick={exportExpensesExcel}>{ar ? "تصدير Excel" : "Export Excel"}</Button><label className="cursor-pointer rounded-lg bg-slate-100 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200">{ar ? "استيراد Excel" : "Import Excel"}<input type="file" accept=".xlsx,.xls" className="hidden" onChange={importExpensesExcel} /></label><Button onClick={() => setOpen(true)}>{t("expenses_new")}</Button></div>} />
      {excelStatus && <Card className="mb-3 text-sm text-slate-600">{excelStatus}</Card>}
      <Card>
        <p className="mb-3 text-sm text-slate-500">{t("expenses_total_recorded")}: <span className="font-semibold text-slate-800">{total.toFixed(2)} {settings.currency}</span></p>
        <Table headers={[t("date"), t("category"), t("expenses_description"), t("amount"), ""]}>
          {expenses.slice().reverse().map((e) => (
            <tr key={e.id} className="border-b border-slate-100">
              <td className="px-2 py-2">{new Date(e.date).toLocaleDateString()}</td>
              <td className="px-2 py-2">{e.category}</td>
              <td className="px-2 py-2">{e.description}</td>
              <td className="px-2 py-2">{e.amount.toFixed(2)} {settings.currency}</td>
              <td className="px-2 py-2 text-right"><button className="text-red-600 hover:underline" onClick={() => remove(e.id)}>{t("delete")}</button></td>
            </tr>
          ))}
        </Table>
        {expenses.length === 0 && <p className="mt-3 text-sm text-slate-400">{t("expenses_no_expenses")}</p>}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={t("expenses_new_title")}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">{t("amount")}</label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("category")}</label>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {settings.expenseCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("expenses_description")}</label>
            <SuggestInput category="expenseDescription" value={description} onChange={(e) => setDescription(e.target.value)} />
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
