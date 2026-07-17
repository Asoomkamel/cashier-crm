"use client";

import React, { useEffect, useState } from "react";
import { useApp, useT } from "@/lib/store";
import { Card, PageTitle, Button, Input, Select, Modal, Table } from "@/components/ui";
import { Permissions, Role, StaffUser, uid } from "@/lib/types";
import { hashPin } from "@/lib/security";
import { downloadWorkbookXlsx, makeXlsxFileName } from "@/lib/xlsxExport";
import { importStatusMessage, importWorkbookToSystem } from "@/lib/xlsxPageActions";

function splitSpecialties(value: string): string[] {
  return value
    .split(/[،,]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function basePermissions(role: Role, extra?: Partial<Permissions>): Permissions {
  return {
    canManageInventory: role === "admin" || role === "supervisor",
    canManageUsers: role === "admin",
    canManageSettings: role === "admin",
    canManageTechnicians: role === "admin" || role === "supervisor",
    canInvoice: role === "admin" || role === "supervisor" || role === "pos",
    canAcceptTask: role === "technician",
    canCompleteTask: role === "technician",
    canCreateRequests: role === "admin" || role === "supervisor",
    canViewCRM: role === "admin" || role === "supervisor",
    canUpdateCustomerLocation: role === "admin" || role === "supervisor",
    canRecordPayments: role === "admin" || role === "supervisor",
    canManageReminders: role === "admin" || role === "supervisor",
    ...(extra || {}),
  };
}

const emptyForm = {
  id: "",
  name: "",
  phone: "",
  pin: "",
  role: "pos" as Role,
  specialtiesText: "",
  canUpdateCustomerLocation: false,
  canRecordPayments: false,
};

export default function UsersPage() {
  const { users, setUsers, settings } = useApp();
  const t = useT();
  const ar = settings.language === "ar";
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [excelStatus, setExcelStatus] = useState("");

  const exportUsersExcel = async () => {
    await downloadWorkbookXlsx(makeXlsxFileName("users"), { users });
  };

  const importUsersExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setExcelStatus(ar ? "جارٍ استيراد ملف Excel…" : "Importing Excel…");
      const result = await importWorkbookToSystem(file, "users", "merge");
      setExcelStatus(importStatusMessage(result, ar));
      if (!result.empty) setTimeout(() => window.location.reload(), 900);
    } catch (err: any) {
      setExcelStatus(`❌ ${err?.message || (ar ? "تعذر استيراد Excel." : "Could not import Excel.")}`);
    }
  };

  useEffect(() => {
    if (form.role !== "technician" && (form.canUpdateCustomerLocation || form.canRecordPayments || form.specialtiesText)) {
      setForm((current) => ({ ...current, canUpdateCustomerLocation: false, canRecordPayments: false, specialtiesText: "" }));
    }
  }, [form.role, form.canUpdateCustomerLocation, form.canRecordPayments, form.specialtiesText]);

  const resetForm = () => setForm(emptyForm);

  const openNew = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (user: StaffUser) => {
    setForm({
      id: user.id,
      name: user.name,
      phone: user.phone,
      pin: "",
      role: user.role,
      specialtiesText: (user.specialties || []).join("، "),
      canUpdateCustomerLocation: Boolean(user.permissions?.canUpdateCustomerLocation),
      canRecordPayments: Boolean(user.permissions?.canRecordPayments),
    });
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    resetForm();
  };

  const save = () => {
    if (!form.name.trim() || !form.phone.trim()) return;

    const technicianExtras = form.role === "technician"
      ? {
          canUpdateCustomerLocation: form.canUpdateCustomerLocation,
          canRecordPayments: form.canRecordPayments,
        }
      : undefined;

    const trimmedPhone = form.phone.trim();
    const existing = form.id ? users.find((u) => u.id === form.id) : undefined;
    // Blank PIN while editing means "keep the current one unchanged".
    // A brand-new user with no PIN typed falls back to a default the admin
    // should ask them to change on first login.
    const pin = form.pin.trim()
      ? hashPin(form.pin.trim(), trimmedPhone)
      : existing?.pin || hashPin("1234", trimmedPhone);

    const savedUser: StaffUser = {
      id: form.id || uid("user"),
      name: form.name.trim(),
      phone: trimmedPhone,
      pin,
      role: form.role,
      specialties: form.role === "technician" ? splitSpecialties(form.specialtiesText) : [],
      permissions: basePermissions(form.role, technicianExtras),
    };

    if (form.id) {
      setUsers(users.map((user) => (user.id === form.id ? savedUser : user)));
    } else {
      setUsers([...users, savedUser]);
    }
    closeModal();
  };

  const remove = (id: string) => {
    if (confirm(t("delete") + "?")) setUsers(users.filter((u) => u.id !== id));
  };

  const roleLabel = (r: Role) => ({
    admin: t("users_role_admin"),
    supervisor: t("users_role_supervisor"),
    technician: t("users_role_technician"),
    pos: t("users_role_pos"),
  }[r]);

  const addSpecialtyChip = (specialty: string) => {
    const current = splitSpecialties(form.specialtiesText);
    if (!current.includes(specialty)) {
      setForm({ ...form, specialtiesText: [...current, specialty].join("، ") });
    }
  };

  return (
    <div>
      <PageTitle title={t("users_title")} action={<div className="flex flex-wrap gap-2 no-print"><Button variant="secondary" onClick={exportUsersExcel}>{ar ? "تصدير Excel" : "Export Excel"}</Button><label className="cursor-pointer rounded-lg bg-slate-100 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200">{ar ? "استيراد Excel" : "Import Excel"}<input type="file" accept=".xlsx,.xls" className="hidden" onChange={importUsersExcel} /></label><Button onClick={openNew}>{t("users_new")}</Button></div>} />
      {excelStatus && <Card className="mb-3 text-sm text-slate-600">{excelStatus}</Card>}
      <Card>
        <Table headers={[t("name"), t("phone"), t("users_role"), t("users_pin"), ar ? "التخصصات" : "Specialties", t("actions")]}> 
          {users.map((u) => (
            <tr key={u.id} className="border-b border-slate-100">
              <td className="px-2 py-2">{u.name}</td>
              <td className="px-2 py-2">{u.phone}</td>
              <td className="px-2 py-2 capitalize">{roleLabel(u.role)}</td>
              <td className="px-2 py-2 tracking-widest text-slate-400">••••</td>
              <td className="px-2 py-2 text-xs text-slate-500">{u.role === "technician" ? (u.specialties || []).join("، ") || "—" : "—"}</td>
              <td className="px-2 py-2 text-right">
                <button className="mr-3 text-brand-600 hover:underline" onClick={() => openEdit(u)}>{t("edit")}</button>
                {u.role !== "admin" && <button className="text-red-600 hover:underline" onClick={() => remove(u.id)}>{t("delete")}</button>}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      <p className="mt-3 text-xs text-slate-400">{t("users_login_note")}</p>

      <Modal open={open} onClose={closeModal} title={form.id ? t("users_edit") : t("users_new")}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">{t("name")}</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("phone")}</label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("users_pin")}</label>
            <Input type="password" value={form.pin} placeholder={form.id ? (ar ? "اتركه فارغًا للإبقاء على الرمز الحالي" : "Leave blank to keep current PIN") : ""} onChange={(e) => setForm({ ...form, pin: e.target.value })} />
            <p className="mt-1 text-xs text-slate-400">{t("users_initial_pin_hint")}</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("users_role")}</label>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="admin">{t("users_role_admin")}</option>
              <option value="supervisor">{t("users_role_supervisor")}</option>
              <option value="technician">{t("users_role_technician")}</option>
              <option value="pos">{t("users_role_pos")}</option>
            </Select>
          </div>

          {form.role === "technician" && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div>
                <label className="mb-1 block text-sm font-medium">{ar ? "تخصصات الفني" : "Technician specialties"}</label>
                <Input
                  value={form.specialtiesText}
                  onChange={(e) => setForm({ ...form, specialtiesText: e.target.value })}
                  placeholder={ar ? "مثال: رذاذ، صيانة فلاتر، تركيب فلاتر" : "Example: spray, filter maintenance, filter installation"}
                />
                <div className="mt-2 flex flex-wrap gap-1">
                  {(settings.technicianSpecialties || []).map((specialty) => (
                    <button
                      key={specialty}
                      type="button"
                      onClick={() => addSpecialtyChip(specialty)}
                      className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200 hover:bg-brand-50"
                    >
                      + {specialty}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">{t("users_technician_extra_permissions")}</h3>
                <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.canUpdateCustomerLocation}
                    onChange={(e) => setForm({ ...form, canUpdateCustomerLocation: e.target.checked })}
                  />
                  {t("users_allow_update_customer_location")}
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.canRecordPayments}
                    onChange={(e) => setForm({ ...form, canRecordPayments: e.target.checked })}
                  />
                  {t("users_allow_record_customer_payments")}
                </label>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={closeModal}>{t("cancel")}</Button>
            <Button onClick={save}>{t("save")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
