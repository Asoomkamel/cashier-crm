import { describe, it, expect } from "vitest";
import { getEffectivePermissions } from "@/lib/modules/permissions/permissions";
import type { StaffUser } from "@/lib/types";

const makeUser = (role: StaffUser["role"], overrides: Partial<StaffUser["permissions"]> = {}): StaffUser => ({
  id: "u1", name: "Test", phone: "0500000000",
  role, pin: "1234",
  permissions: overrides as StaffUser["permissions"],
  specialties: [],
});

describe("getEffectivePermissions — admin", () => {
  const perms = getEffectivePermissions(makeUser("admin"))!;
  it("can manage inventory",  () => expect(perms.canManageInventory).toBe(true));
  it("can manage users",      () => expect(perms.canManageUsers).toBe(true));
  it("can invoice",           () => expect(perms.canInvoice).toBe(true));
  it("can view CRM",          () => expect(perms.canViewCRM).toBe(true));
  it("can manage settings",   () => expect(perms.canManageSettings).toBe(true));
  it("can accept task",       () => expect(perms.canAcceptTask).toBe(true));
  it("can complete task",     () => expect(perms.canCompleteTask).toBe(true));
  it("can record payments",   () => expect(perms.canRecordPayments).toBe(true));
});

describe("getEffectivePermissions — supervisor", () => {
  const perms = getEffectivePermissions(makeUser("supervisor"))!;
  it("can invoice",            () => expect(perms.canInvoice).toBe(true));
  it("can view CRM",           () => expect(perms.canViewCRM).toBe(true));
  it("can manage inventory",   () => expect(perms.canManageInventory).toBe(true));
  it("cannot manage users",    () => expect(perms.canManageUsers).toBe(false));
  it("cannot manage settings", () => expect(perms.canManageSettings).toBe(false));
});

describe("getEffectivePermissions — technician", () => {
  const perms = getEffectivePermissions(makeUser("technician"))!;
  it("can accept task",                   () => expect(perms.canAcceptTask).toBe(true));
  it("can complete task",                 () => expect(perms.canCompleteTask).toBe(true));
  it("cannot invoice",                    () => expect(perms.canInvoice).toBe(false));
  it("cannot manage users",               () => expect(perms.canManageUsers).toBe(false));
  it("cannot view CRM",                   () => expect(perms.canViewCRM).toBe(false));
  it("cannot update location by default", () => expect(perms.canUpdateCustomerLocation).toBe(false));
  it("cannot manage inventory",           () => expect(perms.canManageInventory).toBe(false));
});

describe("getEffectivePermissions — pos", () => {
  const perms = getEffectivePermissions(makeUser("pos"))!;
  it("can invoice",              () => expect(perms.canInvoice).toBe(true));
  it("cannot manage inventory",  () => expect(perms.canManageInventory).toBe(false));
  it("cannot manage users",      () => expect(perms.canManageUsers).toBe(false));
  it("cannot manage settings",   () => expect(perms.canManageSettings).toBe(false));
  it("cannot view CRM",          () => expect(perms.canViewCRM).toBe(false));
});

describe("permission overrides", () => {
  it("technician with canInvoice override can invoice", () => {
    const perms = getEffectivePermissions(makeUser("technician", { canInvoice: true }))!;
    expect(perms.canInvoice).toBe(true);
  });

  it("pos with canViewCRM override can view CRM", () => {
    const perms = getEffectivePermissions(makeUser("pos", { canViewCRM: true }))!;
    expect(perms.canViewCRM).toBe(true);
  });

  it("technician with canUpdateLocation override can update", () => {
    const perms = getEffectivePermissions(makeUser("technician", { canUpdateCustomerLocation: true }))!;
    expect(perms.canUpdateCustomerLocation).toBe(true);
  });

  it("getEffectivePermissions returns null for null user", () => {
    expect(getEffectivePermissions(null)).toBeNull();
  });
});
