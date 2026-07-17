"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp, useT } from "@/lib/store";
import { Button, Input, Select, Textarea, Modal } from "@/components/ui";
import { ServiceOrder, uid } from "@/lib/types";
import { openWhatsApp } from "@/lib/whatsapp";

type Panel = "closed" | "menu" | "request" | "whatsapp";

export default function GlobalActions() {
  const { customers, urgentOrders, setUrgentOrders, settings, setSettings, users, activeUser } = useApp();
  const t = useT();
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("closed");

  // Quick urgent request
  const [reqPhone, setReqPhone] = useState("");
  const [reqName, setReqName] = useState("");
  const [reqIssue, setReqIssue] = useState("");
  const [reqTechnician, setReqTechnician] = useState("");
  const [reqStatus, setReqStatus] = useState("");

  // WhatsApp
  const [waPhone, setWaPhone] = useState("");
  const [waMessage, setWaMessage] = useState("");
  const [waImproving, setWaImproving] = useState(false);
  const [waError, setWaError] = useState("");

  const technicians = users.filter((u) => u.role === "technician");
  const isTechnician = activeUser?.role === "technician";
  const canCreateRequests = activeUser?.role === "admin" || activeUser?.role === "supervisor";
  const canUseQuickWhatsApp = !isTechnician;

  const lookupByPhone = (phone: string) => {
    setReqPhone(phone);
    const match = customers.find((c) => c.phone === phone);
    if (match) setReqName(match.name);
  };

  const createRequest = () => {
    if (!reqPhone || !reqIssue) return;
    const match = customers.find((c) => c.phone === reqPhone);
    const order: ServiceOrder = {
      id: uid("urg"),
      requestNumber: settings.nextRequestNumber,
      customerId: match?.id,
      customerName: reqName || match?.name || "Unknown",
      customerPhone: reqPhone,
      technicianName: reqTechnician || undefined,
      issue: reqIssue,
      status: "pending",
      date: Date.now(),
      activityLogs: [{ date: Date.now(), text: "Created via Global Quick Actions" }],
      createdAt: Date.now(),
    };
    setUrgentOrders([...urgentOrders, order]);
    setSettings({ ...settings, nextRequestNumber: settings.nextRequestNumber + 1 });
    setReqStatus(t("global_request_created"));
    setReqPhone(""); setReqName(""); setReqIssue(""); setReqTechnician("");
    setTimeout(() => { setReqStatus(""); setPanel("closed"); }, 1200);
  };

  const improveWithAI = async () => {
    if (!waMessage.trim()) return;
    setWaImproving(true);
    setWaError("");
    try {
      const res = await fetch("/api/format-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "enhance_text", rawText: waMessage }),
      });
      const data = await res.json();
      if (data.error) {
        setWaError(t("global_ai_unavailable"));
      } else if (data.message) {
        setWaMessage(data.message);
      }
    } catch {
      setWaError(t("global_ai_unavailable"));
    } finally {
      setWaImproving(false);
    }
  };

  const sendWhatsApp = () => {
    if (!waPhone || !waMessage.trim()) return;
    openWhatsApp(waPhone, waMessage);
    setPanel("closed");
    setWaPhone(""); setWaMessage("");
  };

  if (isTechnician) return null;

  return (
    <>
      <button
        onClick={() => setPanel(panel === "closed" ? "menu" : "closed")}
        className="fixed bottom-5 start-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-2xl text-white shadow-lg hover:bg-emerald-700"
        aria-label="Quick Actions"
      >
        {panel === "closed" ? "+" : "✕"}
      </button>

      {panel === "menu" && (
        <div className="fixed bottom-24 start-5 z-40 w-56 rounded-lg bg-white p-2 shadow-2xl">
          {canCreateRequests && (
            <button onClick={() => { setPanel("closed"); router.push("/urgent-orders?new=1"); }} className="block w-full rounded px-3 py-2 text-start text-sm hover:bg-slate-50">
              {t("global_new_request")}
            </button>
          )}
          {canUseQuickWhatsApp && (
            <button onClick={() => setPanel("whatsapp")} className="block w-full rounded px-3 py-2 text-start text-sm hover:bg-slate-50">
              {t("global_send_whatsapp")}
            </button>
          )}
        </div>
      )}

      <Modal open={panel === "request"} onClose={() => setPanel("closed")} title={t("global_new_request")}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">{t("phone")}</label>
            <Input value={reqPhone} onChange={(e) => lookupByPhone(e.target.value)} placeholder="05xxxxxxxx" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("name")}</label>
            <Input value={reqName} onChange={(e) => setReqName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("urgent_issue")}</label>
            <Textarea rows={3} value={reqIssue} onChange={(e) => setReqIssue(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("pos_technician_optional")}</label>
            <Select value={reqTechnician} onChange={(e) => setReqTechnician(e.target.value)}>
              <option value="">{t("none")}</option>
              {technicians.map((tc) => <option key={tc.id} value={tc.name}>{tc.name}</option>)}
            </Select>
          </div>
          {reqStatus && <p className="text-sm text-emerald-700">{reqStatus}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setPanel("closed")}>{t("cancel")}</Button>
            <Button onClick={createRequest}>{t("urgent_create")}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={panel === "whatsapp"} onClose={() => setPanel("closed")} title={t("global_send_whatsapp")}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">{t("phone")}</label>
            <Input value={waPhone} onChange={(e) => setWaPhone(e.target.value)} placeholder="05xxxxxxxx" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("global_message_text")}</label>
            <Textarea rows={4} value={waMessage} onChange={(e) => setWaMessage(e.target.value)} />
          </div>
          {waError && <p className="text-xs text-amber-600">{waError}</p>}
          <div className="flex justify-between gap-2 pt-2">
            <Button variant="secondary" onClick={improveWithAI} disabled={waImproving}>
              {waImproving ? "…" : t("global_improve_ai")}
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setPanel("closed")}>{t("cancel")}</Button>
              <Button onClick={sendWhatsApp}>{t("global_send")}</Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
