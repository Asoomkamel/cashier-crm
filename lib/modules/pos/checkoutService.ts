import {
  AppSettings,
  CatalogItem,
  Customer,
  Order,
  OrderItem,
  OrderType,
  PaymentMethod,
  CommissionType,
  StaffUser,
  TechFinancialLog,
  TechInventoryItem,
  TechInventoryLog,
  uid,
} from "@/lib/types";

export interface CheckoutCommand {
  cart: OrderItem[];
  customer?: Customer;
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  paidAmountInput: string;
  branchName: string;
  cartDiscountInput: string;
  technicianName: string;
  requiredSpecialty: string;
  scheduledMaintenanceDateInput: string;
  commissionType: CommissionType;
  referralName: string;
  referralPhone: string;
  notes: string;
  invoiceCompanyName: string;
  invoiceTaxNumber: string;
  invoiceContactPhone: string;
  invoiceAddress: string;
  computedCommission: number;
  computedMarketingCommission: number;
  walkInLabel: string;
  activeUser?: StaffUser | null;
  now?: number;
}

export interface CheckoutContext {
  catalog: CatalogItem[];
  techInventory: TechInventoryItem[];
  techInventoryLogs: TechInventoryLog[];
  settings: AppSettings;
  technicians: StaffUser[];
}

export interface CheckoutSuccess {
  ok: true;
  order: Order;
  nextCatalog: CatalogItem[];
  nextTechInventory: TechInventoryItem[];
  newTechInventoryLogs: TechInventoryLog[];
  newTechFinancialLogs: TechFinancialLog[];
  nextInvoiceNumber: number;
}

export interface CheckoutFailure {
  ok: false;
  messageAr: string;
  messageEn: string;
}

export type CheckoutResult = CheckoutSuccess | CheckoutFailure;

function calculateTotalsForCheckout(cart: OrderItem[], cartDiscountInput: string) {
  const subtotalGross = cart.reduce((s, it) => s + it.price * it.qty, 0);
  const lineDiscounts = cart.reduce((s, it) => s + it.discount, 0);
  const cartDiscountAmount = Number(cartDiscountInput) || 0;
  const totalDiscount = lineDiscounts + cartDiscountAmount;
  const totalTax = cart.reduce((s, it) => {
    const lineGross = it.price * it.qty;
    const net = lineGross / (1 + it.tax / 100);
    return s + (lineGross - net);
  }, 0);
  const totalBeforeTax = subtotalGross - totalTax - totalDiscount;
  const grandTotal = subtotalGross - totalDiscount;

  return { totalBeforeTax, totalTax, totalDiscount, grandTotal };
}

function localizeFailure(messageAr: string, messageEn: string): CheckoutFailure {
  return { ok: false, messageAr, messageEn };
}

export function createCheckoutTransaction(command: CheckoutCommand, context: CheckoutContext): CheckoutResult {
  const { catalog, techInventory, settings, technicians } = context;
  const now = command.now || Date.now();
  const cart = Array.isArray(command.cart) ? command.cart : [];

  if (cart.length === 0) {
    return localizeFailure("السلة فارغة.", "Cart is empty.");
  }

  const taxNumberForInvoice = command.invoiceTaxNumber.trim();
  const hasBusinessTaxNumber = Boolean(taxNumberForInvoice);
  if (
    hasBusinessTaxNumber &&
    (!command.invoiceCompanyName.trim() || !command.invoiceContactPhone.trim() || !command.invoiceAddress.trim())
  ) {
    return localizeFailure(
      "عند إدخال رقم ضريبي يجب إدخال اسم الشركة/المؤسسة ورقم التواصل والعنوان.",
      "When a tax number is entered, company name, contact number, and address are required."
    );
  }

  const totals = calculateTotalsForCheckout(cart, command.cartDiscountInput);
  const paid =
    command.orderType === "quotation"
      ? 0
      : command.paymentMethod === "partial" || command.paymentMethod === "credit"
        ? Number(command.paidAmountInput) || 0
        : totals.grandTotal;

  const invoiceNumber = `${settings.invoicePrefix}${settings.nextInvoiceNumber}`;
  const selectedTechnician = technicians.find((tech) => tech.name === command.technicianName);
  const marketerTech = technicians.find(
    (tech) => tech.name.trim().toLowerCase() === command.referralName.trim().toLowerCase()
  );

  if (selectedTechnician && command.orderType !== "quotation" && command.orderType !== "return_invoice") {
    for (const line of cart) {
      if (line.isManualItem) continue;
      const catalogItem = catalog.find((item) => item.id === line.catalogId);
      if (!catalogItem || catalogItem.type !== "product") continue;
      const techItem = techInventory.find(
        (item) =>
          (item.technicianId === selectedTechnician.id || item.technicianName === selectedTechnician.name) &&
          item.catalogId === line.catalogId
      );
      const techQty = techItem?.qty || 0;
      const mainQty = catalogItem.stock || 0;
      const available = settings.allowMainStockFallbackForTechnicianSales ? techQty + mainQty : techQty;
      if (available < line.qty) {
        return localizeFailure(
          `الكمية غير كافية للفني من ${catalogItem.name}. المتوفر مع الفني: ${techQty}${settings.allowMainStockFallbackForTechnicianSales ? `، المستودع: ${mainQty}` : ""}.`,
          `Insufficient technician stock for ${catalogItem.name}. Technician: ${techQty}${settings.allowMainStockFallbackForTechnicianSales ? `, main stock: ${mainQty}` : ""}.`
        );
      }
    }
  }

  const order: Order = {
    id: uid("order"),
    invoiceNumber,
    customerId: command.customer?.id,
    customerName: command.customer?.name || command.walkInLabel,
    type: command.orderType,
    items: cart,
    paymentMethod: command.paymentMethod,
    paidAmount: paid,
    remainingAmount: command.orderType === "quotation" ? 0 : Math.max(0, totals.grandTotal - paid),
    totalBeforeTax: totals.totalBeforeTax,
    totalTax: totals.totalTax,
    totalDiscount: totals.totalDiscount,
    cartDiscount: Number(command.cartDiscountInput) || 0,
    grandTotal: totals.grandTotal,
    branchName: command.branchName || undefined,
    invoiceCustomerName: command.customer ? command.customer.name : undefined,
    invoiceCompanyName: hasBusinessTaxNumber ? command.invoiceCompanyName.trim() : undefined,
    invoiceTaxNumber: taxNumberForInvoice || undefined,
    invoiceContactPhone: command.customer
      ? command.invoiceContactPhone.trim() || command.customer.phone
      : command.invoiceContactPhone.trim() || undefined,
    invoiceAddress: hasBusinessTaxNumber ? command.invoiceAddress.trim() : undefined,
    technicianName: command.technicianName || undefined,
    technicianCommission: command.technicianName ? command.computedCommission : undefined,
    technicianCommissionType: command.technicianName ? command.commissionType : undefined,
    requiredSpecialty: command.requiredSpecialty || undefined,
    scheduledMaintenanceDate: command.scheduledMaintenanceDateInput
      ? new Date(command.scheduledMaintenanceDateInput).getTime()
      : undefined,
    referralName: command.referralName.trim() || undefined,
    referralPhone: command.referralPhone.trim() || undefined,
    referralCommission: command.referralName.trim() ? command.computedMarketingCommission : undefined,
    notes: command.notes.trim() || undefined,
    inventoryMovements: [],
    marketingCommission: command.computedMarketingCommission || undefined,
    status: "active",
    date: now,
  };

  let nextCatalog = catalog;
  let nextTechInventory = techInventory;
  const newTechInventoryLogs: TechInventoryLog[] = [];
  const inventoryMovements: NonNullable<Order["inventoryMovements"]> = [];

  const applyStockMove = (catalogId: string, qty: number, sign: 1 | -1) => {
    const item = nextCatalog.find((c) => c.id === catalogId);
    if (!item || item.type !== "product") return;

    if (item.isBundle && item.subProducts?.length) {
      item.subProducts.forEach((sub) => applyStockMove(sub.id, qty * sub.qty, sign));
      return;
    }

    if (sign === 1) {
      nextCatalog = nextCatalog.map((c) => (c.id === item.id ? { ...c, stock: (c.stock ?? 0) + qty } : c));
      inventoryMovements.push({ catalogId: item.id, source: "main", qty });
      return;
    }

    const techItem = selectedTechnician
      ? nextTechInventory.find(
          (i) =>
            (i.technicianId === selectedTechnician.id || i.technicianName === selectedTechnician.name) &&
            i.catalogId === catalogId
        )
      : undefined;

    if (techItem && techItem.qty >= qty) {
      nextTechInventory = nextTechInventory.map((i) =>
        i.id === techItem.id ? { ...i, qty: i.qty - qty, updatedAt: now } : i
      );
      newTechInventoryLogs.push({
        id: uid("tlog"),
        technicianId: selectedTechnician?.id,
        technicianName: selectedTechnician?.name || command.technicianName,
        catalogId: item.id,
        itemName: item.name,
        type: "sale",
        qty,
        beforeQty: techItem.qty,
        afterQty: techItem.qty - qty,
        orderId: order.id,
        invoiceNumber,
        customerId: order.customerId,
        customerName: order.customerName,
        performedByUserId: command.activeUser?.id,
        performedByName: command.activeUser?.name,
        date: now,
      });
      inventoryMovements.push({
        catalogId: item.id,
        source: "technician",
        technicianId: selectedTechnician?.id,
        technicianName: selectedTechnician?.name || command.technicianName,
        qty,
      });
      return;
    }

    if (techItem && techItem.qty > 0 && settings.allowMainStockFallbackForTechnicianSales) {
      const techQty = techItem.qty;
      const remaining = qty - techQty;
      nextTechInventory = nextTechInventory.map((i) => (i.id === techItem.id ? { ...i, qty: 0, updatedAt: now } : i));
      nextCatalog = nextCatalog.map((c) =>
        c.id === item.id ? { ...c, stock: Math.max(0, (c.stock ?? 0) - remaining) } : c
      );
      newTechInventoryLogs.push({
        id: uid("tlog"),
        technicianId: selectedTechnician?.id,
        technicianName: selectedTechnician?.name || command.technicianName,
        catalogId: item.id,
        itemName: item.name,
        type: "sale",
        qty: techQty,
        beforeQty: techItem.qty,
        afterQty: 0,
        orderId: order.id,
        invoiceNumber,
        customerId: order.customerId,
        customerName: order.customerName,
        performedByUserId: command.activeUser?.id,
        performedByName: command.activeUser?.name,
        notes: settings.language === "ar" ? "تم خصم الباقي من المستودع" : "Remaining quantity deducted from main stock",
        date: now,
      });
      inventoryMovements.push({
        catalogId: item.id,
        source: "technician",
        technicianId: selectedTechnician?.id,
        technicianName: selectedTechnician?.name || command.technicianName,
        qty: techQty,
      });
      inventoryMovements.push({ catalogId: item.id, source: "main", qty: remaining });
      return;
    }

    nextCatalog = nextCatalog.map((c) =>
      c.id === item.id ? { ...c, stock: Math.max(0, (c.stock ?? 0) - qty) } : c
    );
    inventoryMovements.push({ catalogId: item.id, source: "main", qty });
  };

  if (command.orderType !== "quotation") {
    cart.forEach((line) => {
      if (line.isManualItem) return;
      applyStockMove(line.catalogId, line.qty, command.orderType === "return_invoice" ? 1 : -1);
    });
  }

  const orderWithInventory: Order = {
    ...order,
    inventoryMovements,
    inventorySource:
      inventoryMovements.some((m) => m.source === "technician") && inventoryMovements.some((m) => m.source === "main")
        ? "mixed"
        : inventoryMovements.some((m) => m.source === "technician")
          ? "technician"
          : "main",
  };

  const newFinancialLogs: TechFinancialLog[] = [];
  if (selectedTechnician && command.orderType !== "quotation") {
    if ((command.paymentMethod === "cash" || command.paymentMethod === "partial") && paid > 0) {
      newFinancialLogs.push({
        id: uid("tfin"),
        technicianId: selectedTechnician.id,
        technicianName: selectedTechnician.name,
        type: "cash_collection",
        amount: paid,
        method: "cash",
        orderId: order.id,
        invoiceNumber,
        customerId: order.customerId,
        customerName: order.customerName,
        performedByUserId: command.activeUser?.id,
        performedByName: command.activeUser?.name,
        notes: settings.language === "ar" ? "كاش مستلم من العميل" : "Cash collected from customer",
        date: now,
      });
    }
    if (command.computedCommission > 0) {
      newFinancialLogs.push({
        id: uid("tfin"),
        technicianId: selectedTechnician.id,
        technicianName: selectedTechnician.name,
        type: "completion_commission",
        amount: command.computedCommission,
        orderId: order.id,
        invoiceNumber,
        customerId: order.customerId,
        customerName: order.customerName,
        performedByUserId: command.activeUser?.id,
        performedByName: command.activeUser?.name,
        notes: `${settings.technicianCompletionCommissionPercent ?? 5}%`,
        date: now,
      });
    }
  }

  if (marketerTech && command.computedMarketingCommission > 0 && command.orderType !== "quotation") {
    newFinancialLogs.push({
      id: uid("tfin"),
      technicianId: marketerTech.id,
      technicianName: marketerTech.name,
      type: "marketing_commission",
      amount: command.computedMarketingCommission,
      orderId: order.id,
      invoiceNumber,
      customerId: order.customerId,
      customerName: order.customerName,
      performedByUserId: command.activeUser?.id,
      performedByName: command.activeUser?.name,
      notes: `${settings.technicianMarketingCommissionPercent ?? 25}%`,
      date: now,
    });
  }

  return {
    ok: true,
    order: orderWithInventory,
    nextCatalog,
    nextTechInventory,
    newTechInventoryLogs,
    newTechFinancialLogs: newFinancialLogs,
    nextInvoiceNumber: settings.nextInvoiceNumber + 1,
  };
}
