"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { Button, Card, Input, PageTitle, Select, Table, Badge } from "@/components/ui";
import { storage } from "@/lib/storage";
import { exportToCSV } from "@/lib/csv";
import { downloadWorkbookXlsx, makeXlsxFileName } from "@/lib/xlsxExport";
import { AuditLogEntry } from "@/lib/types";

const ACTION_LABELS: Record<string, string> = {
  login: "تسجيل دخول",
  admin_confirmed_action: "إجراء بصلاحية مدير",
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] || action;
}

function actionTone(action: string): "green" | "amber" | "slate" {
  if (action === "login") return "green";
  if (action === "admin_confirmed_action") return "amber";
  return "slate";
}

export default function AuditLogPage() {
  const { activeUser } = useApp();
  const [log, setLog] = useState<AuditLogEntry[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setLog(storage.getAuditLog());
  }, []);

  const isAdmin = activeUser?.role === "admin";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...log].sort((a, b) => b.date - a.date);
    if (!q) return sorted;
    return sorted.filter(
      (e) =>
        e.userName.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        (e.details || "").toLowerCase().includes(q)
    );
  }, [log, query]);

  const auditRows = () => filtered.map((e) => ({
    date: e.date,
    dateText: new Date(e.date).toLocaleString("ar-SA"),
    userName: e.userName,
    userRole: e.userRole,
    action: actionLabel(e.action),
    details: e.details || "",
  }));

  const exportExcel = async () => {
    await downloadWorkbookXlsx(makeXlsxFileName("audit-log"), { auditLogs: auditRows() });
  };

  const exportCSV = () => {
    exportToCSV(
      `audit_log_${Date.now()}.csv`,
      filtered.map((e) => ({
        التاريخ: new Date(e.date).toLocaleString("ar-SA"),
        المستخدم: e.userName,
        الدور: e.userRole,
        الإجراء: actionLabel(e.action),
        التفاصيل: e.details || "",
      }))
    );
  };

  if (!isAdmin) {
    return (
      <div>
        <PageTitle title="سجل التدقيق" />
        <Card>
          <p className="text-sm text-slate-500">هذه الصفحة متاحة للمدير فقط.</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageTitle
        title="سجل التدقيق"
        action={
          <div className="flex items-center gap-2">
            <Input placeholder="بحث بالاسم أو الإجراء…" value={query} onChange={(e) => setQuery(e.target.value)} className="w-56" />
            <Button variant="secondary" onClick={exportExcel}>تصدير Excel</Button>
            <Button variant="secondary" onClick={exportCSV}>تصدير CSV</Button>
          </div>
        }
      />
      <p className="mb-4 text-xs text-slate-400">
        يسجل هذا السجل تلقائيًا كل عمليات تسجيل الدخول وأي إجراء حساس تمت الموافقة عليه بكلمة مرور المدير (مثل الحذف)، لأغراض المتابعة والمساءلة. يُحفظ آخر 500 حدث محليًا على هذا الجهاز.
      </p>
      <Card>
        <Table headers={["التاريخ والوقت", "المستخدم", "الدور", "الإجراء", "التفاصيل"]}>
          {filtered.map((e) => (
            <tr key={e.id} className="border-b border-slate-50">
              <td className="whitespace-nowrap px-2 py-1.5 text-slate-500">{new Date(e.date).toLocaleString("ar-SA")}</td>
              <td className="px-2 py-1.5 font-medium">{e.userName}</td>
              <td className="px-2 py-1.5 text-xs capitalize text-slate-400">{e.userRole}</td>
              <td className="px-2 py-1.5"><Badge tone={actionTone(e.action)}>{actionLabel(e.action)}</Badge></td>
              <td className="px-2 py-1.5 text-slate-500">{e.details || "-"}</td>
            </tr>
          ))}
        </Table>
        {filtered.length === 0 && <p className="py-4 text-center text-sm text-slate-400">لا توجد أحداث مسجّلة بعد.</p>}
      </Card>
    </div>
  );
}
