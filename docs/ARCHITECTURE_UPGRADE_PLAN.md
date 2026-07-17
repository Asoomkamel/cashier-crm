# Architecture Upgrade Plan — Master Document

## Vision

Transform Cashier CRM from a local-first JSON-snapshot app into a
Modular Monolith with Supabase PostgreSQL as source of truth,
Row Level Security, server-side atomic transactions, and
IndexedDB offline cache — without rewriting the app.

## Phase History

### Phase 1 — Foundation (Done)
- app_backups + Supabase Realtime + PWA

### Phase 2 — Module Extraction (Done)
- reminders, invoices, inventory, sync, appData modules

### Phase 3 — Transaction Foundation (Done)
- checkoutService, serverCheckoutClient, audit, permissions

### Phase 4 — Normalized Schema + Seed (Done)
- supabase/08-10, normalizedSeed, system-health, accounting page

### Phase 5 — RLS + Auth + Enhanced Modules (Done)
- supabase/11 RLS policies + helper functions
- supabase/12 audit triggers
- supabase/13 enhanced checkout RPC with stock + commissions
- auth/service.ts — auth bridge (local → Supabase)
- customers/service.ts — customer logic
- workOrders/service.ts — work order FSM
- technicianInventory/service.ts — tech inventory operations
- reports/service.ts — report computation layer
- Enhanced mutation queue (status: pending/syncing/synced/failed)
- Health API updated with RLS + new table checks

## Phase 6 — Server-side Reports + Supabase Auth (Planned)
- Flip NEXT_PUBLIC_USE_SUPABASE_AUTH=true
- Read reports from PostgreSQL
- Work orders in normalized table

## Phase 7 — IndexedDB + Service Worker (Planned)
- IndexedDB replaces localStorage for operational data
- Sync worker replays mutation queue on reconnect

## Phase 8 — Full Source of Truth (Planned)
- All reads from PostgreSQL (localStorage as cache only)
- Conflict resolution with version numbers

## Feature Flags
- NEXT_PUBLIC_USE_SUPABASE_AUTH=false (default: local PIN)
- NEXT_PUBLIC_USE_SERVER_CHECKOUT=false (default: local checkout)
