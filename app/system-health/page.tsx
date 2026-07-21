"use client";

import React, { useEffect, useState } from "react";
import { Badge, Button, Card, Input, PageTitle } from "@/components/ui";
import { useApp } from "@/lib/store";
import { mutationQueue } from "@/lib/modules/sync/mutationQueue";
import { pendingSyncCount } from "@/lib/modules/sync/syncWorker";
import { idbCache, migrateLocalStorageToIdb } from "@/lib/modules/offline/idbCache";
import { storage } from "@/lib/storage";
import { USE_IDB_CACHE } from "@/lib/featureFlags";

type EnvFlags = {
  serverActionSecretConfigured?: boolean;
  adminActionCodeConfigured?: boolean;
  orgIdConfigured?: boolean;
  branchIdConfigured?: boolean;
  useServerCheckout?: boolean;
  useSupabaseAuth?: boolean;
  redacted?: string;
};

type HealthResponse = {
  ok?: boolean;
  supabaseConfigured?: boolean;
  serviceRoleConfigured?: boolean;
  snapshotBackupReady?: boolean;
  normalizedSchemaReady?: boolean;
  checkoutTransactionReady?: boolean;
  rlsReady?: boolean;
  rlsHelpersReady?: boolean;
  normalizedTables?: Record<string, boolean>;
  missingNormalizedTables?: string[];
  recommendedMigrations?: string[];
  rowCounts?: Record<string, number>;
  envFlags?: EnvFlags;
  message?: string;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="text-slate-600">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function StatusBadge({ value, yes = "✓ جاهز", no = "✗ غير جاهز" }: { value?: boolean; yes?: string; no?: string }) {
  return <Badge tone={value ? "green" : "red"}>{value ? yes : no}</Badge>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="mb-3 font-semibold text-slate-700 text-sm">{title}</h2>
      {children}
    </Card>
  );
}

export default function SystemHealthPage() {
  const { settings, urgentOrders, appointments, customers, catalog, orders,
    techInventory, expenses, users, reminders } = useApp();
  const ar = settings.language === "ar";

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [adminCode, setAdminCode] = useState("");
  const [migrationStatus, setMigrationStatus] = useState("");
  const [migrationRunning, setMigrationRunning] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  // IndexedDB migration state
  const [idbAvailable, setIdbAvailable] = useState<boolean | null>(null);
  const [idbMigrationStatus, setIdbMigrationStatus] = useState("");
  const [idbMigrating, setIdbMigrating] = useState(false);

  // Live data counts from localStorage
  const localCounts = {
    [ar ? "العملاء" : "Customers"]:          customers.length,
    [ar ? "المنتجات" : "Products"]:          catalog.length,
    [ar ? "الفواتير" : "Invoices"]:          orders.filter(o => o.status !== "deleted").length,
    [ar ? "الطلبات الحالية" : "Current orders"]: urgentOrders.length,
    [ar ? "المواعيد" : "Appointments"]:      appointments.length,
    [ar ? "مخزون الفنيين" : "Tech inventory"]: techInventory.length,
    [ar ? "المصروفات" : "Expenses"]:         expenses.length,
    [ar ? "الموظفون" : "Staff"]:             users.length,
    [ar ? "التذكيرات" : "Reminders"]:        reminders?.length || 0,
  };

  useEffect(() => {
    idbCache.isAvailable().then(setIdbAvailable);
  }, []);

  useEffect(() => {
    const update = () => {
      setPendingCount(pendingSyncCount());
      const q = mutationQueue.list();
      setFailedCount(q.filter(m => m.status === "failed").length);
    };
    update();
    const t = setInterval(update, 5000);
    return () => clearInterval(t);
  }, []);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/system/health");
      setHealth(await res.json());
    } catch {
      setHealth({ ok: false, message: ar ? "تعذّر الاتصال بـ API" : "Could not reach health API" });
    } finally {
      setLoading(false);
    }
  };

  const runIdbMigration = async () => {
    setIdbMigrating(true);
    setIdbMigrationStatus(ar ? "جارٍ نقل البيانات…" : "Migrating data to IndexedDB…");
    try {
      // Map localStorage keys to IndexedDB store names
      const keyMap: Record<string, import("@/lib/modules/offline/idbCache").IdbStoreName> = {
        "cc_customers":          "customers",
        "cc_catalog":            "catalog",
        "cc_orders":             "orders",
        "cc_vendors":            "vendors",
        "cc_purchases":          "purchases",
        "cc_expenses":           "expenses",
        "cc_urgent_orders":      "urgentOrders",
        "cc_appointments":       "appointments",
        "cc_tech_inventory":     "techInventory",
        "cc_tech_inventory_logs":"techInventoryLogs",
        "cc_tech_financial_logs":"techFinancialLogs",
        "cc_customer_payments":  "customerPayments",
        "cc_tech_locations":     "techLocations",
        "cc_system_reminders":   "reminders",
        "cc_audit_log":          "auditLog",
        "cc_users":              "users",
      };
      const { migrated, skipped } = await migrateLocalStorageToIdb(keyMap);
      setIdbMigrationStatus(
        `✅ ${ar ? "تم النقل" : "Migrated"}: ${migrated.length} ${ar ? "مفتاح" : "keys"} — ` +
        `${ar ? "تم تجاوز" : "Skipped"}: ${skipped.length}.\n` +
        `${ar ? "المفاتيح المنقولة" : "Migrated"}: ${migrated.join(", ")}`
      );
    } catch (e: unknown) {
      setIdbMigrationStatus(`❌ ${e instanceof Error ? e.message : "Error"}`);
    } finally {
      setIdbMigrating(false);
    }
  };

  const runMigration = async (dryRun: boolean) => {
    setMigrationRunning(true);
    setMigrationStatus(ar ? "جارٍ تحليل البيانات…" : "Analysing data…");
    try {
      const res = await fetch("/api/migration/normalized", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun, adminCode }),
      });
      const data = await res.json();
      if (data.ok || dryRun) {
        const s = data.summary || data;
        setMigrationStatus(
          dryRun
            ? `${ar ? "معاينة:" : "Preview:"} ${JSON.stringify(s, null, 2)}`
            : `✅ ${ar ? "تم الترحيل:" : "Migrated:"} ${JSON.stringify(s, null, 2)}`
        );
      } else {
        setMigrationStatus(`❌ ${data.error || "Failed"}`);
      }
    } catch (e: unknown) {
      setMigrationStatus(`❌ ${e instanceof Error ? e.message : "Network error"}`);
    } finally {
      setMigrationRunning(false);
    }
  };

  const clearSynced = () => {
    mutationQueue.removeSynced();
    const q = mutationQueue.list();
    setPendingCount(q.filter(m => m.status === "pending").length);
    setFailedCount(q.filter(m => m.status === "failed").length);
  };

  return (
    <div className="space-y-4">
      <PageTitle title={ar ? "صحة النظام" : "System Health"} />

      {/* Local Data */}
      <Section title={ar ? "البيانات المحلية (localStorage)" : "Local Data (localStorage)"}>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {Object.entries(localCounts).map(([k, v]) => (
            <div key={k} className="rounded-lg bg-slate-50 p-2 text-center">
              <div className="text-lg font-bold text-brand-700">{v}</div>
              <div className="text-xs text-slate-500">{k}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Mutation Queue */}
      <Section title={ar ? "طابور التزامن (Offline Queue)" : "Sync Queue"}>
        <Row label={ar ? "عمليات معلّقة" : "Pending"}>
          <Badge tone={pendingCount > 0 ? "amber" : "green"}>{pendingCount}</Badge>
        </Row>
        <Row label={ar ? "عمليات فاشلة" : "Failed"}>
          <Badge tone={failedCount > 0 ? "red" : "green"}>{failedCount}</Badge>
        </Row>
        {(pendingCount + failedCount > 0) && (
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={clearSynced}>
              {ar ? "مسح المُزامنة" : "Clear synced"}
            </Button>
          </div>
        )}
      </Section>

      {/* Supabase Health Check */}
      <Section title={ar ? "حالة Supabase" : "Supabase Status"}>
        <div className="mb-3 flex justify-end">
          <Button onClick={fetchHealth} disabled={loading}>
            {loading ? "…" : ar ? "فحص الحالة" : "Check Status"}
          </Button>
        </div>

        {health ? (
          <div>
            <Row label="Supabase configured"><StatusBadge value={health.supabaseConfigured} /></Row>
            <Row label="Service role key"><StatusBadge value={health.serviceRoleConfigured} /></Row>
            <Row label="app_backups snapshot"><StatusBadge value={health.snapshotBackupReady} /></Row>
            <Row label="Normalized schema (all tables)"><StatusBadge value={health.normalizedSchemaReady} /></Row>
            <Row label="RLS policies"><StatusBadge value={health.rlsReady} /></Row>
            <Row label="RLS helper functions"><StatusBadge value={health.rlsHelpersReady} /></Row>
            <Row label="Checkout transaction RPC"><StatusBadge value={health.checkoutTransactionReady} /></Row>

            {health.envFlags && !health.envFlags.redacted && (
              <div className="mt-3 space-y-0.5">
                <p className="text-xs font-medium text-slate-500 mb-1">Environment / Feature Flags</p>
                <Row label="SERVER_ACTION_SECRET"><StatusBadge value={health.envFlags.serverActionSecretConfigured} yes="مضبوط" no="غير مضبوط" /></Row>
                <Row label="ADMIN_ACTION_CODE"><StatusBadge value={health.envFlags.adminActionCodeConfigured} yes="مضبوط" no="غير مضبوط" /></Row>
                <Row label="NEXT_PUBLIC_ORG_ID"><StatusBadge value={health.envFlags.orgIdConfigured} yes="مضبوط" no="غير مضبوط" /></Row>
                <Row label="NEXT_PUBLIC_BRANCH_ID"><StatusBadge value={health.envFlags.branchIdConfigured} yes="مضبوط" no="غير مضبوط" /></Row>
                <Row label="USE_SERVER_CHECKOUT"><StatusBadge value={health.envFlags.useServerCheckout} yes="مفعّل" no="معطّل (محلي)" /></Row>
                <Row label="USE_SUPABASE_AUTH"><StatusBadge value={health.envFlags.useSupabaseAuth} yes="مفعّل" no="معطّل (محلي)" /></Row>
              </div>
            )}

            {health.rowCounts && Object.keys(health.rowCounts).length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-slate-500 mb-2">{ar ? "السجلات في Supabase PostgreSQL" : "Rows in Supabase PostgreSQL"}</p>
                <div className="grid grid-cols-3 gap-1 sm:grid-cols-5">
                  {Object.entries(health.rowCounts).map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-green-50 p-2 text-center">
                      <div className="text-lg font-bold text-green-700">{v}</div>
                      <div className="text-xs text-slate-500">{k}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {health.missingNormalizedTables && health.missingNormalizedTables.length > 0 && (
              <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-medium mb-1">{ar ? "جداول ناقصة — شغّل:" : "Missing tables — run:"}</p>
                <ul className="list-disc ps-4 space-y-0.5">
                  {health.missingNormalizedTables.map(t => <li key={t} className="font-mono text-xs">{t}</li>)}
                </ul>
              </div>
            )}

            {health.recommendedMigrations && health.recommendedMigrations.length > 0 && (
              <div className="mt-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                <p className="font-medium mb-1">{ar ? "Migrations موصى بها:" : "Recommended migrations:"}</p>
                {health.recommendedMigrations.map(m => (
                  <div key={m} className="font-mono text-xs">{m}</div>
                ))}
              </div>
            )}

            {health.envFlags?.redacted && (
              <p className="mt-2 text-xs text-slate-400">{health.envFlags.redacted}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400">{ar ? "اضغط «فحص الحالة» للبدء." : "Click Check Status to begin."}</p>
        )}
      </Section>

      {/* Migration Wizard */}
      <Section title={ar ? "معالج الترحيل إلى PostgreSQL" : "PostgreSQL Migration Wizard"}>
        <p className="mb-3 text-xs text-slate-500">
          {ar
            ? "ينقل البيانات من localStorage إلى جداول PostgreSQL. العملية idempotent — آمنة للإعادة."
            : "Transfers data from localStorage to normalized PostgreSQL tables. Idempotent — safe to rerun."}
        </p>
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            {ar ? "رمز المدير (ADMIN_ACTION_CODE)" : "Admin code (ADMIN_ACTION_CODE)"}
          </label>
          <Input
            type="password"
            value={adminCode}
            onChange={e => setAdminCode(e.target.value)}
            placeholder="••••"
            className="max-w-xs"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => runMigration(true)} disabled={migrationRunning}>
            {ar ? "معاينة (Preview)" : "Preview"}
          </Button>
          <Button onClick={() => runMigration(false)} disabled={migrationRunning}>
            {migrationRunning ? "…" : ar ? "تشغيل الترحيل" : "Run Migration"}
          </Button>
        </div>
        {migrationStatus && (
          <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700 overflow-auto max-h-60">
            {migrationStatus}
          </pre>
        )}
      </Section>

      {/* IndexedDB Cache Migration */}
      <Section title={ar ? "نقل البيانات إلى IndexedDB (Phase 8)" : "IndexedDB Cache Migration (Phase 8)"}>
        <p className="mb-3 text-xs text-slate-500">
          {ar
            ? "ينقل البيانات التشغيلية من localStorage إلى IndexedDB لأداء أفضل وتخزين أكبر. localStorage يبقى للإعدادات فقط."
            : "Moves operational data from localStorage to IndexedDB for better performance. localStorage stays for settings only."}
        </p>
        <Row label={ar ? "IndexedDB متاح في هذا المتصفح" : "IndexedDB available"}>
          {idbAvailable === null
            ? <Badge tone="amber">جارٍ الفحص…</Badge>
            : <StatusBadge value={idbAvailable ?? false} yes="متاح ✓" no="غير متاح ✗" />}
        </Row>
        <Row label={ar ? "وضع IDB Cache مفعّل" : "IDB Cache mode"}>
          <StatusBadge value={USE_IDB_CACHE} yes="مفعّل (NEXT_PUBLIC_USE_IDB_CACHE=true)" no="معطّل (localStorage)" />
        </Row>
        {idbAvailable && (
          <div className="mt-3 flex gap-2">
            <Button onClick={runIdbMigration} disabled={idbMigrating}>
              {idbMigrating ? "…" : ar ? "نقل البيانات إلى IndexedDB" : "Migrate to IndexedDB"}
            </Button>
          </div>
        )}
        {idbMigrationStatus && (
          <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700 overflow-auto max-h-40">
            {idbMigrationStatus}
          </pre>
        )}
        {!USE_IDB_CACHE && idbMigrationStatus.startsWith("✅") && (
          <div className="mt-2 rounded-lg bg-green-50 p-3 text-xs text-green-800">
            {ar
              ? "تم النقل بنجاح! أضف NEXT_PUBLIC_USE_IDB_CACHE=true في .env.local ثم أعد النشر لتفعيل IDB Cache."
              : "Migration done! Add NEXT_PUBLIC_USE_IDB_CACHE=true to .env.local and redeploy to activate."}
          </div>
        )}
      </Section>

      <Section title={ar ? "خارطة المراحل" : "Phase Roadmap"}>
        {[
          { done: true,  label: "Phase 1–4: Local-first + Realtime + Modules + Schema" },
          { done: true,  label: "Phase 5: RLS + Permissions + Checkout RPC + Audit Triggers" },
          { done: true,  label: "Phase 6: Full data migration (73 customers, 51 invoices, 47 work orders)" },
          { done: true,  label: "Phase 7: Fixed server checkout + API security guards + reports API" },
          { done: true,  label: "Phase 8 ← (current): IndexedDB cache + Reports server mode + Auth OTP bridge" },
          { done: false, label: "Phase 9: Supabase Auth OTP fully replacing local PIN (NEXT_PUBLIC_USE_SUPABASE_AUTH=true)" },
          { done: false, label: "Phase 10: Full PostgreSQL source of truth — localStorage/IDB as cache only" },
          { done: false, label: "Phase 11: Automated test suite (vitest) + multi-branch support" },
        ].map((p, i) => (
          <div key={i} className="flex items-start gap-3 border-b border-slate-100 py-2 last:border-0">
            <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full ${p.done ? "bg-green-500" : "bg-slate-200"}`} />
            <p className="text-sm text-slate-700">{p.label}</p>
          </div>
        ))}
      </Section>
    </div>
  );
}
