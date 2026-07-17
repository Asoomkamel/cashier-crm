import type { NextRequest } from "next/server";
import { createServiceRoleClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { canViewSensitiveHealth } from "@/lib/modules/security/serverGuards";

export const runtime = "nodejs";

const NORMALIZED_TABLES = [
  "organizations",
  "branches",
  "profiles",
  "customers",
  "products",
  "invoices",
  "invoice_items",
  "payments",
  "stock_movements",
  "work_orders",
  "audit_logs",
  "app_migration_runs",
  "technician_inventory",
  "technician_financial_transactions",
  "idempotency_keys",
];

const RLS_TABLES = [
  "organizations",
  "branches",
  "customers",
  "products",
  "invoices",
  "invoice_items",
  "payments",
  "stock_movements",
  "work_orders",
  "audit_logs",
  "technician_inventory",
  "technician_financial_transactions",
];

const EXTERNAL_ID_TABLES = [
  "branches",
  "profiles",
  "customers",
  "products",
  "invoices",
  "payments",
];

async function tableExists(
  admin: ReturnType<typeof createServiceRoleClient>,
  table: string
) {
  if (!admin) return false;
  const { data, error } = await admin.rpc("check_table_exists" as never, {
    p_table: table,
  } as never);
  if (!error && data !== null) return Boolean(data);
  // Fallback: try a direct query
  const { error: e2 } = await admin
    .from(table)
    .select("*", { count: "exact", head: true })
    .limit(0);
  return !e2;
}

async function rlsEnabled(
  admin: ReturnType<typeof createServiceRoleClient>,
  table: string
): Promise<boolean> {
  if (!admin) return false;
  // Use RPC to check RLS status — pg_tables may not be accessible via REST
  const { data, error } = await admin.rpc("check_rls_enabled" as never, {
    p_table: table,
  } as never);
  if (!error && data !== null) return Boolean(data);
  // Fallback: assume RLS is enabled if we already applied migrations
  return false;
}

async function checkoutRpcReady(
  admin: ReturnType<typeof createServiceRoleClient>
): Promise<boolean> {
  if (!admin) return false;
  const { data, error } = await admin.rpc("create_checkout_transaction", {
    p_command: { dryRun: true },
  });
  return !error && Boolean((data as Record<string, unknown>)?.ok);
}

async function columnReady(
  admin: ReturnType<typeof createServiceRoleClient>,
  table: string,
  column: string
) {
  if (!admin) return false;
  const { error } = await admin
    .from(table)
    .select(column, { head: true })
    .limit(1);
  return !error;
}

async function helperFnsReady(
  admin: ReturnType<typeof createServiceRoleClient>
): Promise<boolean> {
  if (!admin) return false;
  const { error } = await admin.rpc("is_admin_or_supervisor" as never);
  // Will error with "permission denied" if RLS function doesn't exist
  return !error || !String(error.message).includes("does not exist");
}

async function countRows(
  admin: ReturnType<typeof createServiceRoleClient>,
  table: string
): Promise<number> {
  if (!admin) return 0;
  const { count, error } = await admin
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) return 0;
  return count || 0;
}

export async function GET(req: NextRequest) {
  const isTrustedCaller = canViewSensitiveHealth(req);
  const admin = createServiceRoleClient();
  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!admin) {
    return Response.json({
      ok: false,
      supabaseConfigured: isSupabaseConfigured,
      serviceRoleConfigured: hasServiceRole,
      message: "Supabase server-side configuration is incomplete.",
    });
  }

  const [
    snapshotBackupReady,
    checkoutTransactionReady,
    rlsHelpersReady,
  ] = await Promise.all([
    tableExists(admin, "app_backups"),
    checkoutRpcReady(admin),
    helperFnsReady(admin),
  ]);

  const normalizedTables = Object.fromEntries(
    await Promise.all(
      NORMALIZED_TABLES.map(
        async (table) => [table, await tableExists(admin, table)] as const
      )
    )
  );

  const rlsStatus = Object.fromEntries(
    await Promise.all(
      RLS_TABLES.map(
        async (table) => [table, await rlsEnabled(admin, table)] as const
      )
    )
  );

  const externalIdColumnsReady = Object.fromEntries(
    await Promise.all(
      EXTERNAL_ID_TABLES.map(
        async (table) =>
          [table, await columnReady(admin, table, "external_id")] as const
      )
    )
  );

  const rowCounts: Record<string, number> = {};
  for (const table of [
    "customers",
    "products",
    "invoices",
    "stock_movements",
    "technician_inventory",
    "audit_logs",
    "app_migration_runs",
  ]) {
    if (normalizedTables[table]) {
      rowCounts[table] = await countRows(admin, table);
    }
  }

  const normalizedSeedReady =
    Object.values(externalIdColumnsReady).every(Boolean) &&
    Boolean(normalizedTables["app_migration_runs"]);

  const rlsReady = Object.values(rlsStatus).every(Boolean);

  const missingNormalizedTables = Object.entries(normalizedTables)
    .filter(([, exists]) => !exists)
    .map(([table]) => table);

  const recommendedMigrations: string[] = [];
  if (missingNormalizedTables.length > 0)
    recommendedMigrations.push("supabase/08_normalized_core_schema.sql");
  if (!checkoutTransactionReady)
    recommendedMigrations.push("supabase/13_enhanced_checkout_rpc.sql");
  if (!rlsReady || !rlsHelpersReady)
    recommendedMigrations.push("supabase/11_rls_policies.sql");
  if (missingNormalizedTables.includes("audit_logs"))
    recommendedMigrations.push("supabase/12_audit_triggers.sql");

  return Response.json({
    ok: snapshotBackupReady,
    supabaseConfigured: isSupabaseConfigured,
    serviceRoleConfigured: hasServiceRole,
    snapshotBackupReady,
    normalizedSchemaReady: missingNormalizedTables.length === 0,
    checkoutTransactionReady,
    normalizedSeedReady,
    rlsReady,
    rlsHelpersReady,
    externalIdColumnsReady,
    normalizedTables,
    rlsStatus,
    missingNormalizedTables,
    recommendedMigrations,
    rowCounts,
    // Environment / feature flag status
    envFlags: isTrustedCaller ? {
      serverActionSecretConfigured: Boolean(process.env.SERVER_ACTION_SECRET),
      adminActionCodeConfigured:    Boolean(process.env.ADMIN_ACTION_CODE),
      orgIdConfigured:              Boolean(process.env.NEXT_PUBLIC_ORG_ID),
      branchIdConfigured:           Boolean(process.env.NEXT_PUBLIC_BRANCH_ID),
      useServerCheckout:            process.env.NEXT_PUBLIC_USE_SERVER_CHECKOUT === "true",
      useSupabaseAuth:              process.env.NEXT_PUBLIC_USE_SUPABASE_AUTH === "true",
    } : { redacted: "Provide SERVER_ACTION_SECRET header to see env flags" },
  });
}
