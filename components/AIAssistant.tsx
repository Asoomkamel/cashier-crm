"use client";

import React, { useRef, useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { runAssistantCommand } from "@/lib/assistant";
import { Customer, CatalogItem, ServiceOrder, uid } from "@/lib/types";
import { serviceOrderStatusLabel } from "@/lib/serviceOrderLabels";

interface Message {
  role: "user" | "assistant";
  text: string;
}

export default function AIAssistant() {
  const {
    customers, setCustomers, catalog, setCatalog, orders, urgentOrders, setUrgentOrders, appointments, setAppointments, settings,
  } = useApp();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: 'Hi! I can create customers/products/urgent orders or answer quick questions. Type "help" to see commands.' },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  const send = async () => {
    if (!input.trim()) return;
    const userText = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userText }]);

    const localContext = { customers, catalog, orders, urgentOrders, settings };
    let result = runAssistantCommand(userText, localContext);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText,
          context: { customerCount: customers.length, catalogCount: catalog.length, currency: settings.currency },
        }),
      });
      const data = await res.json();
      if (data.available && data.reply) {
        result = { reply: data.reply, action: data.action || { type: "none" } };
      }
      // if data.available is false, we already have the local fallback result.
    } catch {
      // network/server error — keep the local fallback result.
    }

    const action = result.action;

    switch (action.type) {
      case "add_customer": {
        const c: Customer = {
          id: uid("cust"), name: action.name, phone: action.phone,
          type: "lead", locations: [], createdAt: Date.now(),
        };
        setCustomers([...customers, c]);
        break;
      }
      case "add_product": {
        const p: CatalogItem = {
          id: uid("item"), name: action.name, type: "product",
          price: action.price, tax: settings.defaultTaxRate, stock: 0,
        };
        setCatalog([...catalog, p]);
        break;
      }
      case "add_urgent_order": {
        const match = customers.find((c) => c.phone === action.phone);
        const o: ServiceOrder = {
          id: uid("urg"), requestNumber: settings.nextRequestNumber,
          customerId: match?.id, customerName: match?.name || "Unknown",
          customerPhone: action.phone, issue: action.issue,
          status: "pending", date: 0, visitScheduled: false,
          activityLogs: [{ date: Date.now(), text: settings.language === "ar" ? "تم إنشاء الطلب بواسطة المساعد بدون موعد زيارة" : "Created by AI Assistant without a visit appointment" }],
          createdAt: Date.now(),
        };
        setUrgentOrders([...urgentOrders, o]);
        break;
      }
      case "update_order_status": {
        const validStatuses = ["pending", "started", "in_progress", "completed", "canceled"];
        const status = validStatuses.includes(action.status) ? (action.status as ServiceOrder["status"]) : "pending";
        const entry = {
          date: Date.now(),
          text: settings.language === "ar"
            ? `تم تغيير الحالة إلى ${serviceOrderStatusLabel(status, "ar")} بواسطة المساعد`
            : `Status changed to ${serviceOrderStatusLabel(status, "en")} via AI Assistant`,
        };
        if (urgentOrders.some((o) => o.requestNumber === action.requestNumber)) {
          setUrgentOrders(urgentOrders.map((o) => (o.requestNumber === action.requestNumber ? { ...o, status, activityLogs: [...o.activityLogs, entry] } : o)));
        } else if (appointments.some((o) => o.requestNumber === action.requestNumber)) {
          setAppointments(appointments.map((o) => (o.requestNumber === action.requestNumber ? { ...o, status, activityLogs: [...o.activityLogs, entry] } : o)));
        }
        break;
      }
      default:
        break;
    }

    setMessages((prev) => [...prev, { role: "assistant", text: result.reply }]);
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 end-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-2xl text-white shadow-lg hover:bg-brand-700"
        aria-label="AI Assistant"
      >
        {open ? "✕" : "🤖"}
      </button>

      {open && (
        <div className="fixed bottom-24 end-5 z-40 flex h-96 w-80 max-w-[calc(100vw-2.5rem)] flex-col rounded-lg bg-white shadow-2xl">
          <div className="rounded-t-lg bg-brand-900 px-4 py-3 text-sm font-semibold text-white">AI Assistant</div>
          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
            {messages.map((m, i) => (
              <div key={i} className={`whitespace-pre-line rounded px-3 py-2 ${m.role === "user" ? "ml-auto bg-brand-600 text-white" : "bg-slate-100 text-slate-800"} max-w-[85%]`}>
                {m.text}
              </div>
            ))}
          </div>
          <div className="flex gap-2 border-t border-slate-200 p-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Type a command…"
              className="flex-1 rounded border border-slate-300 p-2 text-sm"
            />
            <button onClick={send} className="rounded bg-brand-600 px-3 text-sm text-white hover:bg-brand-700">Send</button>
          </div>
        </div>
      )}
    </>
  );
}
