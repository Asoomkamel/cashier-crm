"use client";

import React, { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { Button, Card, Input, PageTitle, Select, Table, Badge } from "@/components/ui";
import { exportToCSV } from "@/lib/csv";
import { downloadWorkbookXlsx, makeXlsxFileName } from "@/lib/xlsxExport";
import {
  CHART_OF_ACCOUNTS,
  buildJournal,
  buildTrialBalance,
  buildIncomeStatement,
  filterJournalByDateRange,
  buildSupplierAging,
} from "@/lib/accounting";

type Tab = "overview" | "journal" | "trial_balance" | "chart_of_accounts" | "supplier_aging";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "قائمة الدخل" },
  { key: "journal", label: "دفتر اليومية" },
  { key: "trial_balance", label: "ميزان المراجعة" },
  { key: "supplier_aging", label: "أعمار ديون الموردين" },
  { key: "chart_of_accounts", label: "دليل الحسابات" },
];

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function endOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export default function AccountingPage() {
  const { orders, purchases, expenses, customerPayments, settings, activeUser } = useApp();
  const [tab, setTab] = useState<Tab>("overview");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const isAdmin = activeUser?.role === "admin";
  const canView = isAdmin || !!activeUser?.permissions?.canManageSettings;

  const fullJournal = useMemo(
    () => buildJournal(orders, purchases, expenses, customerPayments),
    [orders, purchases, expenses, customerPayments]
  );

  const journal = useMemo(() => {
    const from = fromDate ? startOfDay(new Date(fromDate).getTime()) : undefined;
    const to = toDate ? endOfDay(new Date(toDate).getTime()) : undefined;
    return filterJournalByDateRange(fullJournal, from, to);
  }, [fullJournal, fromDate, toDate]);

  const trialBalance = useMemo(() => buildTrialBalance(journal), [journal]);
  const income = useMemo(() => buildIncomeStatement(journal), [journal]);
  const supplierAging = useMemo(() => buildSupplierAging(purchases), [purchases]);

  const totalDebit = trialBalance.reduce((s, r) => s + r.debit, 0);
  const totalCredit = trialBalance.reduce((s, r) => s + r.credit, 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const accountName = (code: string) => {
    const a = CHART_OF_ACCOUNTS.find((x) => x.code === code);
    return a ? `${a.code} — ${a.nameAr}` : code;
  };

  const accountingWorkbookPayload = () => ({
    journal: journal.flatMap((entry) => entry.lines.map((line) => ({
      date: entry.date,
      dateText: new Date(entry.date).toLocaleDateString("ar-SA"),
      ref: entry.ref,
      memo: entry.memo,
      account: accountName(line.account),
      debit: line.debit || "",
      credit: line.credit || "",
    }))),
    trialBalance: trialBalance.map((row) => ({
      account: `${row.account.code} — ${row.account.nameAr}`,
      type: row.account.type,
      debit: row.debit,
      credit: row.credit,
      balance: row.balance,
    })),
    incomeStatement: [
      { label: "إيرادات المبيعات", value: income.revenue },
      { label: "مردودات المبيعات", value: -income.salesReturns },
      { label: "صافي الإيرادات", value: income.netRevenue },
      { label: "تكلفة البضاعة المباعة", value: -income.cogs },
      { label: "مجمل الربح", value: income.grossProfit },
      { label: "المصروفات التشغيلية", value: -income.operatingExpenses },
      { label: "صافي الربح", value: income.netProfit },
    ],
    supplierAging: supplierAging.map((row) => ({
      vendorName: row.vendorName,
      current: row.current,
      days31to60: row.days31to60,
      days61to90: row.days61to90,
      over90: row.over90,
      total: row.total,
    })),
    chartOfAccounts: CHART_OF_ACCOUNTS.map((account) => ({ code: account.code, name: account.nameAr, type: account.type })),
  });

  const exportAccountingExcel = async () => {
    await downloadWorkbookXlsx(makeXlsxFileName("accounting"), accountingWorkbookPayload());
  };

  const exportJournalCSV = () => {
    const rows: Record<string, any>[] = [];
    journal.forEach((e) => {
      e.lines.forEach((l) => {
        rows.push({
          التاريخ: new Date(e.date).toLocaleDateString("ar-SA"),
          المرجع: e.ref,
          البيان: e.memo,
          الحساب: accountName(l.account),
          مدين: l.debit || "",
          دائن: l.credit || "",
        });
      });
    });
    exportToCSV(`journal_${Date.now()}.csv`, rows);
  };

  if (!canView) {
    return (
      <div>
        <PageTitle title="المحاسبة" />
        <Card>
          <p className="text-sm text-slate-500">هذه الصفحة متاحة للمدير أو من لديه صلاحية إدارة الإعدادات فقط.</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageTitle
        title="المحاسبة"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-auto" />
            <span className="text-slate-400">→</span>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-auto" />
            {(fromDate || toDate) && (
              <Button variant="secondary" onClick={() => { setFromDate(""); setToDate(""); }}>مسح</Button>
            )}
            <Button variant="secondary" onClick={exportAccountingExcel}>تصدير Excel</Button>
          </div>
        }
      />

      <p className="mb-4 text-xs text-slate-400">
        محاسبة مبسّطة مُشتقة تلقائيًا من فواتير البيع والشراء والمصروفات ودفعات العملاء — لا تحتاج إدخال يدوي، وتُحدَّث لحظيًا مع كل عملية جديدة.
      </p>

      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === tb.key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <h2 className="mb-3 font-semibold text-slate-800">قائمة الدخل (P&amp;L)</h2>
            <dl className="space-y-2 text-sm">
              <Row label="إيرادات المبيعات" value={income.revenue} />
              <Row label="مردودات المبيعات" value={-income.salesReturns} negative />
              <Row label="صافي الإيرادات" value={income.netRevenue} bold />
              <Row label="تكلفة البضاعة المباعة" value={-income.cogs} negative />
              <Row label="مجمل الربح" value={income.grossProfit} bold />
              <Row label="المصروفات التشغيلية" value={-income.operatingExpenses} negative />
              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
                <span className="font-bold text-slate-800">صافي الربح</span>
                <span className={`text-lg font-extrabold ${income.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {income.netProfit.toFixed(2)} {settings.currency}
                </span>
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold text-slate-800">صحة القيود</h2>
            <div className="flex items-center gap-2 text-sm">
              <span>إجمالي المدين: <b>{totalDebit.toFixed(2)}</b></span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <span>إجمالي الدائن: <b>{totalCredit.toFixed(2)}</b></span>
            </div>
            <div className="mt-3">
              {isBalanced
                ? <Badge tone="green">ميزان المراجعة متوازن ✓</Badge>
                : <Badge tone="red">غير متوازن — فرق {Math.abs(totalDebit - totalCredit).toFixed(2)}</Badge>}
            </div>
            <p className="mt-4 text-xs text-slate-400">
              ملاحظة: هذه محاسبة مبسّطة لأغراض المتابعة الداخلية (ليست بديلاً عن محاسب معتمد أو نظامًا مُعتمدًا لتقديم الإقرارات الضريبية الرسمية).
            </p>
          </Card>
        </div>
      )}

      {tab === "journal" && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">دفتر اليومية ({journal.length} قيد)</h2>
            <Button variant="secondary" onClick={exportJournalCSV}>تصدير CSV</Button>
          </div>
          <Table headers={["التاريخ", "المرجع", "البيان", "الحساب", "مدين", "دائن"]}>
            {journal.flatMap((e) =>
              e.lines.map((l, i) => (
                <tr key={`${e.id}_${i}`} className="border-b border-slate-50">
                  {i === 0 ? (
                    <>
                      <td className="px-2 py-1.5 align-top" rowSpan={e.lines.length}>{new Date(e.date).toLocaleDateString("ar-SA")}</td>
                      <td className="px-2 py-1.5 align-top" rowSpan={e.lines.length}>{e.ref}</td>
                      <td className="px-2 py-1.5 align-top" rowSpan={e.lines.length}>{e.memo}</td>
                    </>
                  ) : null}
                  <td className="px-2 py-1.5">{accountName(l.account)}</td>
                  <td className="px-2 py-1.5">{l.debit ? l.debit.toFixed(2) : ""}</td>
                  <td className="px-2 py-1.5">{l.credit ? l.credit.toFixed(2) : ""}</td>
                </tr>
              ))
            )}
          </Table>
          {journal.length === 0 && <p className="py-4 text-center text-sm text-slate-400">لا توجد قيود في هذه الفترة.</p>}
        </Card>
      )}

      {tab === "trial_balance" && (
        <Card>
          <h2 className="mb-3 font-semibold text-slate-800">ميزان المراجعة</h2>
          <Table headers={["الحساب", "النوع", "مدين", "دائن", "الرصيد"]}>
            {trialBalance.map((r) => (
              <tr key={r.account.code} className="border-b border-slate-50">
                <td className="px-2 py-1.5">{r.account.code} — {r.account.nameAr}</td>
                <td className="px-2 py-1.5 text-xs text-slate-400">{r.account.type}</td>
                <td className="px-2 py-1.5">{r.debit ? r.debit.toFixed(2) : "-"}</td>
                <td className="px-2 py-1.5">{r.credit ? r.credit.toFixed(2) : "-"}</td>
                <td className="px-2 py-1.5 font-medium">{r.balance.toFixed(2)}</td>
              </tr>
            ))}
          </Table>
          <div className="mt-3 flex justify-end gap-6 border-t border-slate-200 pt-2 text-sm font-semibold">
            <span>الإجمالي المدين: {totalDebit.toFixed(2)}</span>
            <span>الإجمالي الدائن: {totalCredit.toFixed(2)}</span>
          </div>
        </Card>
      )}

      {tab === "supplier_aging" && (
        <Card>
          <h2 className="mb-3 font-semibold text-slate-800">أعمار ديون الموردين (Accounts Payable Aging)</h2>
          <p className="mb-3 text-xs text-slate-400">يعتمد على فواتير الشراء غير المسددة بالكامل، مقارنةً بتاريخ اليوم.</p>
          <Table headers={["المورد", "0-30 يوم", "31-60 يوم", "61-90 يوم", "أكثر من 90 يوم", "الإجمالي المستحق"]}>
            {supplierAging.map((r) => (
              <tr key={r.vendorName} className="border-b border-slate-50">
                <td className="px-2 py-1.5 font-medium">{r.vendorName}</td>
                <td className="px-2 py-1.5">{r.current ? r.current.toFixed(2) : "-"}</td>
                <td className="px-2 py-1.5 text-amber-600">{r.days31to60 ? r.days31to60.toFixed(2) : "-"}</td>
                <td className="px-2 py-1.5 text-orange-600">{r.days61to90 ? r.days61to90.toFixed(2) : "-"}</td>
                <td className="px-2 py-1.5 font-semibold text-red-600">{r.over90 ? r.over90.toFixed(2) : "-"}</td>
                <td className="px-2 py-1.5 font-bold">{r.total.toFixed(2)}</td>
              </tr>
            ))}
          </Table>
          {supplierAging.length === 0 && <p className="py-4 text-center text-sm text-slate-400">لا توجد مستحقات موردين قائمة حاليًا. 🎉</p>}
          {supplierAging.some((r) => r.over90 > 0) && (
            <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              ⚠️ يوجد مبالغ مستحقة لموردين منذ أكثر من 90 يومًا — يُنصح بالتواصل معهم أو تسويتها قريبًا لتفادي مشاكل الائتمان.
            </div>
          )}
        </Card>
      )}

      {tab === "chart_of_accounts" && (
        <Card>
          <h2 className="mb-3 font-semibold text-slate-800">دليل الحسابات</h2>
          <Table headers={["الرمز", "الاسم بالعربي", "Name (EN)", "النوع"]}>
            {CHART_OF_ACCOUNTS.map((a) => (
              <tr key={a.code} className="border-b border-slate-50">
                <td className="px-2 py-1.5">{a.code}</td>
                <td className="px-2 py-1.5">{a.nameAr}</td>
                <td className="px-2 py-1.5 text-slate-500">{a.nameEn}</td>
                <td className="px-2 py-1.5 text-xs text-slate-400">{a.type}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value, bold, negative }: { label: string; value: number; bold?: boolean; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? "font-semibold text-slate-800" : "text-slate-500"}>{label}</span>
      <span className={`${bold ? "font-bold" : ""} ${negative ? "text-red-500" : "text-slate-700"}`}>
        {value.toFixed(2)}
      </span>
    </div>
  );
}
