import { Permissions, Role, StaffUser } from "@/lib/types";

export type PermissionKey = keyof Permissions;

const ROLE_DEFAULT_PERMISSIONS: Record<Role, Partial<Permissions>> = {
  admin: {
    canManageInventory: true,
    canManageUsers: true,
    canManageSettings: true,
    canManageTechnicians: true,
    canInvoice: true,
    canAcceptTask: true,
    canCompleteTask: true,
    canCreateRequests: true,
    canViewCRM: true,
    canUpdateCustomerLocation: true,
    canRecordPayments: true,
    canManageReminders: true,
  },
  supervisor: {
    canManageInventory: true,
    canManageUsers: false,
    canManageSettings: false,
    canManageTechnicians: true,
    canInvoice: true,
    canAcceptTask: true,
    canCompleteTask: true,
    canCreateRequests: true,
    canViewCRM: true,
    canUpdateCustomerLocation: true,
    canRecordPayments: true,
    canManageReminders: true,
  },
  technician: {
    canManageInventory: false,
    canManageUsers: false,
    canManageSettings: false,
    canManageTechnicians: false,
    canInvoice: false,
    canAcceptTask: true,
    canCompleteTask: true,
    canCreateRequests: false,
    canViewCRM: false,
    canUpdateCustomerLocation: false,
    canRecordPayments: false,
    canManageReminders: false,
  },
  pos: {
    canManageInventory: false,
    canManageUsers: false,
    canManageSettings: false,
    canManageTechnicians: false,
    canInvoice: true,
    canAcceptTask: false,
    canCompleteTask: false,
    canCreateRequests: false,
    canViewCRM: false,
    canUpdateCustomerLocation: false,
    canRecordPayments: false,
    canManageReminders: false,
  },
};

export function getEffectivePermissions(user?: StaffUser | null): Permissions | null {
  if (!user) return null;
  return {
    ...(ROLE_DEFAULT_PERMISSIONS[user.role] as Permissions),
    ...user.permissions,
  };
}

export function hasPermission(user: StaffUser | null | undefined, permission: PermissionKey): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  const permissions = getEffectivePermissions(user);
  return Boolean(permissions?.[permission]);
}

export function canAccessAdminArea(user: StaffUser | null | undefined): boolean {
  return Boolean(
    user &&
      (user.role === "admin" ||
        hasPermission(user, "canManageSettings") ||
        hasPermission(user, "canManageUsers") ||
        hasPermission(user, "canManageTechnicians"))
  );
}
