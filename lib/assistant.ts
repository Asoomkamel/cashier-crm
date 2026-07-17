import { Customer, CatalogItem, ServiceOrder, Order, AppSettings } from "./types";

export interface AssistantContext {
  customers: Customer[];
  catalog: CatalogItem[];
  orders: Order[];
  urgentOrders: ServiceOrder[];
  settings: AppSettings;
}

export type AssistantAction =
  | { type: "add_customer"; name: string; phone: string }
  | { type: "add_product"; name: string; price: number }
  | { type: "add_urgent_order"; phone: string; issue: string }
  | { type: "update_order_status"; requestNumber: number; status: string }
  | { type: "none" };

export interface AssistantResult {
  reply: string;
  action: AssistantAction;
}

/**
 * Local, dependency-free command interpreter for the AI Assistant widget.
 * This runs entirely in the browser — no API key needed — and covers the
 * same function-calling surface described in the spec (create order/
 * customer/product, answer questions about live data).
 *
 * To upgrade to a real LLM (Gemini/OpenAI/Claude): replace the body of
 * `runAssistantCommand` with a fetch() to a server route (e.g. /api/agent)
 * that forwards the message + a JSON summary of `ctx` to your provider of
 * choice, and returns the same { reply, action } shape. Everything that
 * calls this function (components/AIAssistant.tsx) stays the same.
 */
export function runAssistantCommand(input: string, ctx: AssistantContext): AssistantResult {
  const text = input.trim();
  const lower = text.toLowerCase();

  // --- add customer: "add customer Ahmed 0501234567" ---
  let m = lower.match(/^add customer (.+?)[, ]+(\d{6,})$/);
  if (m) {
    return {
      reply: `Adding customer "${m[1].trim()}" with phone ${m[2]}…`,
      action: { type: "add_customer", name: m[1].trim(), phone: m[2] },
    };
  }

  // --- add product: "add product Oil Filter price 50" or "add product Oil Filter 50" ---
  m = lower.match(/^add product (.+?)(?: price)? (\d+(?:\.\d+)?)$/);
  if (m) {
    return {
      reply: `Adding product "${m[1].trim()}" at ${m[2]} ${ctx.settings.currency}…`,
      action: { type: "add_product", name: m[1].trim(), price: Number(m[2]) },
    };
  }

  // --- create urgent order: "urgent order 0501234567: AC not cooling" ---
  m = text.match(/urgent order (?:for )?(\d{6,})[:\-]?\s*(.+)$/i);
  if (m) {
    return {
      reply: `Creating an urgent order for ${m[1]}…`,
      action: { type: "add_urgent_order", phone: m[1], issue: m[2].trim() },
    };
  }

  // --- update order status: "mark order 5001 as completed" / "set request #5002 to started" ---
  m = lower.match(/(?:mark|set)\s+(?:order|request)\s*#?(\d+)\s+(?:as|to)\s+(pending|started|in progress|completed|canceled)/);
  if (m) {
    const status = m[2].replace(" ", "_");
    return {
      reply: `Updating request #${m[1]} to ${status}…`,
      action: { type: "update_order_status", requestNumber: Number(m[1]), status },
    };
  }

  // --- informational queries ---
  if (lower.includes("total sales") || lower.includes("how much") && lower.includes("sales")) {
    const total = ctx.orders.filter((o) => o.status === "active").reduce((s, o) => s + o.grandTotal, 0);
    return { reply: `Total sales so far: ${total.toFixed(2)} ${ctx.settings.currency}.`, action: { type: "none" } };
  }

  if (lower.includes("today")) {
    const todayStr = new Date().toDateString();
    const total = ctx.orders
      .filter((o) => o.status === "active" && new Date(o.date).toDateString() === todayStr)
      .reduce((s, o) => s + o.grandTotal, 0);
    return { reply: `Today's sales: ${total.toFixed(2)} ${ctx.settings.currency}.`, action: { type: "none" } };
  }

  if (lower.includes("how many customers") || lower.includes("customer count")) {
    return { reply: `You currently have ${ctx.customers.length} customers.`, action: { type: "none" } };
  }

  if (lower.includes("low stock") || lower.includes("out of stock")) {
    const low = ctx.catalog.filter((c) => c.type === "product" && (c.stock ?? 0) <= 3);
    if (low.length === 0) return { reply: "No items are currently low on stock.", action: { type: "none" } };
    return { reply: `Low stock items: ${low.map((i) => `${i.name} (${i.stock ?? 0})`).join(", ")}.`, action: { type: "none" } };
  }

  if (lower.includes("pending urgent") || lower.includes("open urgent")) {
    const pending = ctx.urgentOrders.filter((o) => o.status === "pending");
    if (pending.length === 0) return { reply: "No pending urgent orders right now.", action: { type: "none" } };
    return { reply: `Pending urgent orders: ${pending.map((o) => `${o.customerName} (#${o.requestNumber})`).join(", ")}.`, action: { type: "none" } };
  }

  if (lower === "help" || lower.includes("what can you do")) {
    return {
      reply:
        "I can help with:\n" +
        '• "add customer <name> <phone>"\n' +
        '• "add product <name> <price>"\n' +
        '• "urgent order <phone>: <issue>"\n' +
        '• "mark order <#> as <status>"\n' +
        '• "total sales" / "today sales"\n' +
        '• "how many customers"\n' +
        '• "low stock"\n' +
        '• "pending urgent orders"',
      action: { type: "none" },
    };
  }

  return {
    reply: "I didn't recognize that command. Type \"help\" to see what I can do.",
    action: { type: "none" },
  };
}
