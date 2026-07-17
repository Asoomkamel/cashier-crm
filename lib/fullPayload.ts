import { storage } from "./storage";

export function buildFullPayload() {
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
    customerPayments: storage.getCustomerPayments(),
    reminders: storage.getReminders(),
    techLocations: storage.getTechLocations(),
  };
}

export function buildEmptyPayload() {
  return {
    customers: [],
    catalog: [],
    orders: [],
    vendors: [],
    purchases: [],
    expenses: [],
    users: storage.getUsers(),
    urgentOrders: [],
    appointments: [],
    techInventory: [],
    techInventoryLogs: [],
    techFinancialLogs: [],
    customerPayments: [],
    reminders: [],
    techLocations: {},
    settings: storage.getSettings(),
  };
}
