import { storage } from "@/lib/storage";

export function buildAppDataPayload(deviceId?: string) {
  return {
    customers: storage.getCustomers(),
    catalog: storage.getCatalog(),
    orders: storage.getOrders(),
    vendors: storage.getVendors(),
    purchases: storage.getPurchases(),
    expenses: storage.getExpenses(),
    settings: storage.getSettings(),
    users: storage.getUsers(),
    urgentOrders: storage.getUrgentOrders(),
    appointments: storage.getAppointments(),
    techInventory: storage.getTechInventory(),
    techInventoryLogs: storage.getTechInventoryLogs(),
    techFinancialLogs: storage.getTechFinancialLogs(),
    techLocations: storage.getTechLocations(),
    customerPayments: storage.getCustomerPayments(),
    reminders: storage.getReminders(),
    _device: deviceId,
    _savedAt: new Date().toISOString(),
  };
}
