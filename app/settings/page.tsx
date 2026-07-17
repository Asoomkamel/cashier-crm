"use client";

import React, { useRef, useState } from "react";
import { useApp, useT } from "@/lib/store";
import { Card, PageTitle, Button, Input, Select, Textarea, Modal } from "@/components/ui";
import { storage } from "@/lib/storage";
import {
  DriveBackupFile,
  isGoogleDriveConfigured,
  requestDriveAccessToken,
  backupToDrive,
  restoreFromDrive,
  listDriveBackups,
} from "@/lib/googleDrive";
import { saveToSupabaseBackup, loadFromSupabaseBackup, formatSupabaseBackupMessage } from "@/lib/supabaseBackup";
import { applyBackupPayload } from "@/lib/backupPayload";
import { downloadWorkbookXlsx, makeXlsxFileName } from "@/lib/xlsxExport";
import { isExcelFile, readWorkbookImport } from "@/lib/xlsxImport";
import { buildEmptyPayload, buildFullPayload } from "@/lib/fullPayload";
import { PrintPosition, WhatsAppTemplateAudience, uid } from "@/lib/types";
import { recordAuditLog } from "@/lib/modules/audit/service";


function downloadJson(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function olderThan(date: number | undefined, cutoff: number) {
  return typeof date === "number" && date > 0 && date < cutoff;
}

function buildArchivePayload(months: number) {
  const safeMonths = Math.max(1, Number(months) || 12);
  const cutoff = Date.now() - safeMonths * 30 * 24 * 60 * 60 * 1000;
  return {
    exportedAt: new Date().toISOString(),
    cutoffDate: new Date(cutoff).toISOString(),
    archiveOlderThanMonths: safeMonths,
    data: {
      orders: storage.getOrders().filter((x) => olderThan(x.date, cutoff)),
      purchases: storage.getPurchases().filter((x) => olderThan(x.date, cutoff)),
      expenses: storage.getExpenses().filter((x) => olderThan(x.date, cutoff)),
      customerPayments: storage.getCustomerPayments().filter((x) => olderThan(x.date, cutoff)),
      urgentOrders: storage.getUrgentOrders().filter((x) => olderThan(x.date, cutoff)),
      appointments: storage.getAppointments().filter((x) => olderThan(x.date, cutoff)),
      techInventoryLogs: storage.getTechInventoryLogs().filter((x) => olderThan(x.date, cutoff)),
      techFinancialLogs: storage.getTechFinancialLogs().filter((x) => olderThan(x.date, cutoff)),
    },
  };
}

function removeOldRecords(months: number) {
  const cutoff = Date.now() - Math.max(1, Number(months) || 12) * 30 * 24 * 60 * 60 * 1000;
  storage.saveOrders(storage.getOrders().filter((x) => !olderThan(x.date, cutoff)));
  storage.savePurchases(storage.getPurchases().filter((x) => !olderThan(x.date, cutoff)));
  storage.saveExpenses(storage.getExpenses().filter((x) => !olderThan(x.date, cutoff)));
  storage.saveCustomerPayments(storage.getCustomerPayments().filter((x) => !olderThan(x.date, cutoff)));
  storage.saveUrgentOrders(storage.getUrgentOrders().filter((x) => !olderThan(x.date, cutoff)));
  storage.saveAppointments(storage.getAppointments().filter((x) => !olderThan(x.date, cutoff)));
  storage.saveTechInventoryLogs(storage.getTechInventoryLogs().filter((x) => !olderThan(x.date, cutoff)));
  storage.saveTechFinancialLogs(storage.getTechFinancialLogs().filter((x) => !olderThan(x.date, cutoff)));
}

function countArchiveRecords(payload: ReturnType<typeof buildArchivePayload>) {
  return Object.values(payload.data).reduce((sum, list) => sum + list.length, 0);
}

type SettingsTab = "company" | "operations" | "print" | "messages" | "security" | "backup" | "cloud" | "pwa";
type ListField = "branches" | "categories" | "productCategories" | "expenseCategories" | "technicianSpecialties";

export default function SettingsPage() {
  const { settings, setSettings, catalog, setCatalog, activeUser } = useApp();
  const t = useT();
  const ar = settings.language === "ar";
  const tx = {
    company: ar ? "بيانات المنشأة" : "Company",
    operations: ar ? "الفروع والتصنيفات" : "Branches & Categories",
    print: ar ? "الطباعة والفاتورة" : "Print & Invoice",
    messages: ar ? "قوالب الرسائل" : "Messages",
    security: ar ? "الأمان والقوائم" : "Security & Modules",
    backup: ar ? "النسخ والأرشفة" : "Backup & Archive",
    cloud: ar ? "السحابة و Google Drive" : "Cloud & Google Drive",
    pwa: ar ? "تطبيق الجوال" : "Mobile App",
    saved: ar ? "تم حفظ الإعدادات." : "Settings saved.",
    positionStart: ar ? "البداية" : "Start",
    positionCenter: ar ? "الوسط" : "Center",
    positionEnd: ar ? "النهاية" : "End",
  };

  const [local, setLocal] = useState(settings);
  const [activeTab, setActiveTab] = useState<SettingsTab>("company");
  const [newBranch, setNewBranch] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newProductCategory, setNewProductCategory] = useState("");
  const [newExpenseCategory, setNewExpenseCategory] = useState("");
  const [newSpecialty, setNewSpecialty] = useState("");
  const [newMaintenanceLabel, setNewMaintenanceLabel] = useState("");
  const [newMaintenanceMonths, setNewMaintenanceMonths] = useState("1");
  const [templateName, setTemplateName] = useState("");
  const [templateAudience, setTemplateAudience] = useState<WhatsAppTemplateAudience>("customer");
  const [templateBody, setTemplateBody] = useState("");
  const [driveStatus, setDriveStatus] = useState("");
  const [driveBackups, setDriveBackups] = useState<DriveBackupFile[]>([]);
  const [selectedDriveBackup, setSelectedDriveBackup] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [cloudStatus, setCloudStatus] = useState("");
  const [archiveStatus, setArchiveStatus] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Reset modal state ──────────────────────────────────────────────────────
  const [resetModal, setResetModal] = useState(false);
  const [resetStep, setResetStep] = useState<1 | 2>(1);
  const [resetCode, setResetCode] = useState("");
  const [resetPhrase, setResetPhrase] = useState("");
  const [resetError, setResetError] = useState("");
  const RESET_PHRASE = ar ? "حذف" : "RESET";

  const openResetModal = () => {
    setResetStep(1);
    setResetCode("");
    setResetPhrase("");
    setResetError("");
    setResetModal(true);
  };

  const handleResetStep1 = () => {
    const adminPwd = storage.getSettings().adminPassword || settings.adminPassword || "1234";
    if (resetCode !== adminPwd) {
      setResetError(ar ? "رمز المدير غير صحيح." : "Incorrect admin code.");
      return;
    }
    setResetError("");
    setResetStep(2);
  };

  const handleResetConfirm = async () => {
    if (resetPhrase !== RESET_PHRASE) {
      setResetError(ar ? `يجب كتابة "${RESET_PHRASE}" للتأكيد.` : `Type "${RESET_PHRASE}" to confirm.`);
      return;
    }
    setResetModal(false);
    setImportStatus(ar ? "جارٍ حذف البيانات من Supabase…" : "Clearing Supabase data…");
    recordAuditLog({ user: activeUser, action: "system.factory_reset", details: ar ? "إعادة ضبط المصنع" : "Factory reset performed" });
    try {
      await saveToSupabaseBackup(buildEmptyPayload());
    } catch {
      // Keep going — local reset still works if Supabase is offline
    }
    storage.resetAll();
    setImportStatus(ar ? "تم حذف كل البيانات. جارٍ إعادة التحميل…" : "All data cleared. Reloading…");
    setTimeout(() => window.location.reload(), 700);
  };

  // ── Import replace modal state ─────────────────────────────────────────────
  const [replaceModal, setReplaceModal] = useState(false);
  const [replaceCode, setReplaceCode] = useState("");
  const [replaceError, setReplaceError] = useState("");
  const [pendingReplaceFile, setPendingReplaceFile] = useState<File | null>(null);

  const handleReplaceConfirm = async () => {
    const adminPwd = storage.getSettings().adminPassword || settings.adminPassword || "1234";
    if (replaceCode !== adminPwd) {
      setReplaceError(ar ? "رمز المدير غير صحيح." : "Incorrect admin code.");
      return;
    }
    if (!pendingReplaceFile) return;
    setReplaceModal(false);
    setReplaceError("");
    // Now actually run the import
    try {
      setImportStatus(ar ? "جارٍ قراءة الملف…" : "Reading file…");
      let data: unknown;
      if (isExcelFile(pendingReplaceFile)) {
        const parsed = await readWorkbookImport(pendingReplaceFile);
        data = parsed.payload;
      } else {
        data = JSON.parse(await pendingReplaceFile.text());
      }
      const { imported, empty } = applyBackupPayload(data, "replace");
      if (empty) {
        setImportStatus(ar ? "تمت قراءة الملف لكن لم يتم العثور على بيانات متوافقة." : "File read, but no matching data found.");
      } else {
        setImportStatus(`${ar ? "تم الاستيراد" : "Imported"}: ${imported.join(", ")}. ${ar ? "جارٍ الحفظ في Supabase" : "Saving to Supabase"}…`);
        const cloudResult = await saveToSupabaseBackup(buildFullPayload());
        const cloudMessage = formatSupabaseBackupMessage(cloudResult, ar);
        setImportStatus(`${ar ? "تم الاستيراد محليًا" : "Imported locally"}: ${imported.join(", ")}. ${cloudMessage} ${ar ? "جارٍ إعادة التحميل" : "Reloading"}…`);
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch (err: any) {
      setImportStatus(`❌ ${err?.message || (ar ? "ملف غير صالح." : "Invalid file.")}`);
    } finally {
      setPendingReplaceFile(null);
    }
  };

  const save = () => {
    setSettings(local);
    recordAuditLog({ user: activeUser, action: "settings.update", details: ar ? "تم تحديث إعدادات النظام" : "System settings updated" });
    setSaveStatus(tx.saved);
    setTimeout(() => setSaveStatus(""), 2500);
  };

  const exportData = () => {
    recordAuditLog({ user: activeUser, action: "export.json", details: "JSON backup exported" });
    downloadJson("cashier-crm-backup.json", buildFullPayload());
  };
  const exportDataXlsx = async () => {
    setImportStatus(ar ? "جارٍ تجهيز ملف Excel…" : "Preparing Excel file…");
    try {
      await downloadWorkbookXlsx(makeXlsxFileName("cashier-crm-full-data"), buildFullPayload());
      setImportStatus(ar ? "تم تصدير كل البيانات بصيغة Excel XLSX." : "All data exported as an Excel XLSX workbook.");
    } catch (err: any) {
      setImportStatus(`❌ ${err?.message || (ar ? "تعذر تصدير ملف Excel." : "Could not export Excel file.")}`);
    }
  };

  const handleImportFile = (mode: "merge" | "replace") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    // Replace mode requires admin confirmation via modal
    if (mode === "replace") {
      setPendingReplaceFile(file);
      setReplaceCode("");
      setReplaceError("");
      setReplaceModal(true);
      return;
    }

    // Merge mode — run directly
    try {
      setImportStatus(ar ? "جارٍ قراءة الملف…" : "Reading file…");
      let data: unknown;
      if (isExcelFile(file)) {
        const parsed = await readWorkbookImport(file);
        data = parsed.payload;
      } else {
        data = JSON.parse(await file.text());
      }
      const { imported, empty } = applyBackupPayload(data, mode);
      if (empty) {
        setImportStatus(ar ? "تمت قراءة الملف لكن لم يتم العثور على بيانات متوافقة. تأكد أن الملف صادر من النظام." : "File read, but no matching data found. Make sure the file was exported from this system.");
      } else {
        recordAuditLog({ user: activeUser, action: isExcelFile(file) ? "import.excel" : "import.json", details: `${mode} — ${imported.join(", ")} — ${file.name}` });
        setImportStatus(`${ar ? "تم الاستيراد" : "Imported"}: ${imported.join(", ")}. ${ar ? "جارٍ الحفظ في Supabase" : "Saving to Supabase"}…`);
        const cloudResult = await saveToSupabaseBackup(buildFullPayload());
        const cloudMessage = formatSupabaseBackupMessage(cloudResult, ar);
        setImportStatus(`${ar ? "تم الاستيراد محليًا" : "Imported locally"}: ${imported.join(", ")}. ${cloudMessage} ${ar ? "جارٍ إعادة التحميل" : "Reloading"}…`);
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch (err: any) {
      setImportStatus(`❌ ${err?.message || (ar ? "ملف غير صالح." : "Invalid file.")}`);
    }
  };

  const factoryReset = () => openResetModal();

  const addUnique = (field: ListField, value: string, clear: () => void) => {
    const trimmed = value.trim();
    if (!trimmed || local[field].some((x) => x.trim().toLowerCase() === trimmed.toLowerCase())) return;
    setLocal({ ...local, [field]: [...local[field], trimmed] });
    clear();
  };

  const renameListItem = (field: ListField, oldValue: string) => {
    const nextValue = window.prompt(ar ? "اكتب الاسم الجديد" : "Enter the new name", oldValue)?.trim();
    if (!nextValue || nextValue === oldValue) return;
    if (local[field].some((x) => x.trim().toLowerCase() === nextValue.toLowerCase())) return;
    setLocal({ ...local, [field]: local[field].map((x) => (x === oldValue ? nextValue : x)) });
    if (field === "productCategories") {
      setCatalog(catalog.map((item) => item.category === oldValue ? { ...item, category: nextValue } : item));
    }
  };

  const removeListItem = (field: ListField, value: string) => {
    if (field === "productCategories" && catalog.some((item) => item.category === value)) {
      const ok = window.confirm(ar ? "هذا التصنيف مستخدم في منتجات. سيتم نقل المنتجات إلى غير مصنف. هل تريد المتابعة؟" : "This category is used by products. Products will be moved to Uncategorized. Continue?");
      if (!ok) return;
      setCatalog(catalog.map((item) => item.category === value ? { ...item, category: "غير مصنف" } : item));
    }
    setLocal({ ...local, [field]: local[field].filter((x) => x !== value) });
  };

  const addMaintenanceOption = () => {
    const label = newMaintenanceLabel.trim();
    const months = Math.max(1, Number(newMaintenanceMonths) || 1);
    if (!label) return;
    setLocal({
      ...local,
      maintenanceReminderOptions: [...(local.maintenanceReminderOptions || []), { label, months }],
    });
    setNewMaintenanceLabel("");
    setNewMaintenanceMonths("1");
  };

  const removeMaintenanceOption = (label: string, months: number) => {
    setLocal({
      ...local,
      maintenanceReminderOptions: (local.maintenanceReminderOptions || []).filter((x) => x.label !== label || x.months !== months),
    });
  };

  const addWhatsappTemplate = () => {
    const name = templateName.trim();
    const body = templateBody.trim();
    if (!name || !body) return;
    setLocal({
      ...local,
      whatsappTemplateLibrary: [
        ...(local.whatsappTemplateLibrary || []),
        { id: uid("watpl"), name, audience: templateAudience, body },
      ],
    });
    setTemplateName("");
    setTemplateBody("");
    setTemplateAudience("customer");
  };

  const removeWhatsappTemplate = (id: string) => {
    setLocal({ ...local, whatsappTemplateLibrary: (local.whatsappTemplateLibrary || []).filter((tpl) => tpl.id !== id) });
  };

  const setPrint = <K extends keyof typeof local.printSettings>(key: K, value: (typeof local.printSettings)[K]) => {
    setLocal({ ...local, printSettings: { ...local.printSettings, [key]: value } });
  };

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "company", label: tx.company },
    { id: "operations", label: tx.operations },
    { id: "print", label: tx.print },
    { id: "messages", label: tx.messages },
    { id: "security", label: tx.security },
    { id: "backup", label: tx.backup },
    { id: "cloud", label: tx.cloud },
    { id: "pwa", label: tx.pwa },
  ];

  const moduleList = [
    { href: "/pos", label: t("nav_pos") },
    { href: "/urgent-orders", label: t("nav_urgent") },
    { href: "/appointments", label: t("nav_appointments") },
    { href: "/crm", label: t("nav_crm") },
    { href: "/catalog", label: t("nav_catalog") },
    { href: "/purchases", label: t("nav_purchases") },
    { href: "/expenses", label: t("nav_expenses") },
    { href: "/reports", label: t("nav_reports") },
    { href: "/accounting", label: t("nav_accounting") },
    { href: "/audit-log", label: t("nav_audit_log") },
    { href: "/technician-inventory", label: t("nav_tech_inventory") },
  ];

  return (
    <div className="space-y-6">
      <PageTitle title={t("settings_title")} />

      <div className="no-print flex gap-2 overflow-x-auto rounded-xl border border-slate-100 bg-white p-2 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${activeTab === tab.id ? "bg-brand-600 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "company" && (
        <>
          <Card>
            <h2 className="mb-3 font-semibold">{t("settings_company_profile")}</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div><label className="mb-1 block text-sm font-medium">{t("settings_company_name")}</label><Input value={local.companyHeader.name} onChange={(e) => setLocal({ ...local, companyHeader: { ...local.companyHeader, name: e.target.value } })} /></div>
              <div><label className="mb-1 block text-sm font-medium">{t("phone")}</label><Input value={local.companyHeader.phone} onChange={(e) => setLocal({ ...local, companyHeader: { ...local.companyHeader, phone: e.target.value } })} /></div>
              <div><label className="mb-1 block text-sm font-medium">{t("settings_address")}</label><Input value={local.companyHeader.address} onChange={(e) => setLocal({ ...local, companyHeader: { ...local.companyHeader, address: e.target.value } })} /></div>
              <div><label className="mb-1 block text-sm font-medium">{t("settings_tax_number")}</label><Input value={local.companyHeader.taxNumber} onChange={(e) => setLocal({ ...local, companyHeader: { ...local.companyHeader, taxNumber: e.target.value } })} /></div>
              <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium">{ar ? "رابط الشعار" : "Logo URL"}</label><Input value={local.companyHeader.logoUrl || ""} onChange={(e) => setLocal({ ...local, companyHeader: { ...local.companyHeader, logoUrl: e.target.value } })} /></div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">{t("settings_financial_localization")}</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div><label className="mb-1 block text-sm font-medium">{t("settings_default_tax_rate")}</label><Input type="number" value={local.defaultTaxRate} onChange={(e) => setLocal({ ...local, defaultTaxRate: Number(e.target.value) })} /></div>
              <div><label className="mb-1 block text-sm font-medium">{t("settings_currency")}</label><Input value={local.currency} onChange={(e) => setLocal({ ...local, currency: e.target.value })} /></div>
              <div><label className="mb-1 block text-sm font-medium">{t("settings_language")}</label><Select value={local.language} onChange={(e) => setLocal({ ...local, language: e.target.value as any })}><option value="en">English</option><option value="ar">العربية</option></Select></div>
            </div>
          </Card>
        </>
      )}

      {activeTab === "operations" && (
        <>
          <Card>
            <h2 className="mb-3 font-semibold">{t("settings_invoice_numbering")}</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div><label className="mb-1 block text-sm font-medium">{t("settings_invoice_prefix")}</label><Input value={local.invoicePrefix} onChange={(e) => setLocal({ ...local, invoicePrefix: e.target.value })} /></div>
              <div><label className="mb-1 block text-sm font-medium">{t("settings_next_invoice_number")}</label><Input type="number" value={local.nextInvoiceNumber} onChange={(e) => setLocal({ ...local, nextInvoiceNumber: Number(e.target.value) })} /></div>
              <div><label className="mb-1 block text-sm font-medium">{ar ? "بادئة الطلب" : "Request prefix"}</label><Input value={local.requestPrefix} onChange={(e) => setLocal({ ...local, requestPrefix: e.target.value })} /></div>
              <div><label className="mb-1 block text-sm font-medium">{ar ? "رقم الطلب التالي" : "Next request number"}</label><Input type="number" value={local.nextRequestNumber} onChange={(e) => setLocal({ ...local, nextRequestNumber: Number(e.target.value) })} /></div>
            </div>
          </Card>

          {([
            ["branches", t("settings_branches"), newBranch, setNewBranch, t("settings_add_branch")],
            ["productCategories", ar ? "تصنيفات المنتجات" : "Product categories", newProductCategory, setNewProductCategory, ar ? "+ إضافة تصنيف منتج" : "+ Add product category"],
            ["categories", ar ? "تصنيفات عامة / قديمة" : "General / legacy categories", newCategory, setNewCategory, t("settings_add_category")],
            ["expenseCategories", ar ? "تصنيفات المصروفات" : "Expense categories", newExpenseCategory, setNewExpenseCategory, ar ? "إضافة تصنيف مصروف" : "Add expense category"],
          ] as const).map(([field, label, value, setValue, addLabel]) => (
            <Card key={field}>
              <h2 className="mb-3 font-semibold">{label}</h2>
              <div className="mb-3 flex flex-wrap gap-2">
                {local[field].map((x) => (
                  <span key={x} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm">
                    {x}
                    <button className="text-xs text-brand-600" onClick={() => renameListItem(field, x)}>{ar ? "تعديل" : "Edit"}</button>
                    <button className="text-red-500" onClick={() => removeListItem(field, x)}>✕</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2"><Input value={value} onChange={(e) => setValue(e.target.value)} className="max-w-xs" /><Button variant="secondary" onClick={() => addUnique(field, value, () => setValue(""))}>{addLabel}</Button></div>
            </Card>
          ))}

          <Card>
            <h2 className="mb-3 font-semibold">{ar ? "تخصصات الفنيين" : "Technician specialties"}</h2>
            <p className="mb-3 text-xs text-slate-500">{ar ? "تُستخدم هذه القائمة لاقتراح الفني المتخصص عند إنشاء الطلبات العاجلة وإضافة المستخدمين." : "Used to suggest the required specialist technician when creating urgent requests and staff users."}</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {(local.technicianSpecialties || []).map((x) => (
                <span key={x} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm">
                  {x}
                  <button className="text-xs text-brand-600" onClick={() => renameListItem("technicianSpecialties", x)}>{ar ? "تعديل" : "Edit"}</button>
                  <button className="text-red-500" onClick={() => removeListItem("technicianSpecialties", x)}>✕</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newSpecialty} onChange={(e) => setNewSpecialty(e.target.value)} placeholder={ar ? "مثال: صيانة فلاتر" : "Example: filter maintenance"} className="max-w-xs" />
              <Button variant="secondary" onClick={() => addUnique("technicianSpecialties", newSpecialty, () => setNewSpecialty(""))}>{ar ? "إضافة تخصص" : "Add specialty"}</Button>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">{ar ? "قوالب موعد الصيانة القادم" : "Next maintenance options"}</h2>
            <p className="mb-3 text-xs text-slate-500">{ar ? "تظهر هذه الخيارات للفني عند طباعة فاتورة من مهمة مكتملة، ويتم احتساب الموعد القادم تلقائيًا من تاريخ اليوم." : "These options appear when a technician prints an invoice from a completed task."}</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {(local.maintenanceReminderOptions || []).map((x) => (
                <span key={`${x.label}-${x.months}`} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm">
                  {x.label} ({x.months})
                  <button className="text-red-500" onClick={() => removeMaintenanceOption(x.label, x.months)}>✕</button>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Input value={newMaintenanceLabel} onChange={(e) => setNewMaintenanceLabel(e.target.value)} placeholder={ar ? "مثال: 3 أشهر" : "Example: 3 months"} className="max-w-xs" />
              <Input type="number" min={1} value={newMaintenanceMonths} onChange={(e) => setNewMaintenanceMonths(e.target.value)} placeholder={ar ? "عدد الأشهر" : "Months"} className="max-w-[140px]" />
              <Button variant="secondary" onClick={addMaintenanceOption}>{ar ? "إضافة خيار" : "Add option"}</Button>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">{ar ? "عمولات الفنيين" : "Technician commissions"}</h2>
            <p className="mb-3 text-xs text-slate-500">{ar ? "تُستخدم هذه النسب عند إنشاء فاتورة مرتبطة بفني أو تسويق فني." : "Used when an invoice is linked to technician work or technician marketing."}</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">{ar ? "نسبة إنجاز الطلب %" : "Completion commission %"}</label>
                <Input type="number" min={0} value={local.technicianCompletionCommissionPercent} onChange={(e) => setLocal({ ...local, technicianCompletionCommissionPercent: Number(e.target.value) })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{ar ? "نسبة التسويق %" : "Marketing commission %"}</label>
                <Input type="number" min={0} value={local.technicianMarketingCommissionPercent} onChange={(e) => setLocal({ ...local, technicianMarketingCommissionPercent: Number(e.target.value) })} />
              </div>
              <label className="mt-6 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={local.allowMainStockFallbackForTechnicianSales} onChange={(e) => setLocal({ ...local, allowMainStockFallbackForTechnicianSales: e.target.checked })} />
                {ar ? "السماح بالخصم من المستودع إذا لم تكفِ عهدة الفني" : "Allow main-stock fallback if technician stock is insufficient"}
              </label>
            </div>
          </Card>
        </>
      )}

      {activeTab === "print" && (
        <>
          <Card>
            <h2 className="mb-3 font-semibold">{ar ? "إعدادات الطباعة المتقدمة" : "Advanced print settings"}</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={local.printSettings.showLogo} onChange={(e) => setPrint("showLogo", e.target.checked)} />{ar ? "إظهار الشعار" : "Show logo"}</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={local.printSettings.showStamp} onChange={(e) => setPrint("showStamp", e.target.checked)} />{ar ? "إظهار الختم" : "Show stamp"}</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={local.printSettings.showCustomerSignature} onChange={(e) => setPrint("showCustomerSignature", e.target.checked)} />{ar ? "توقيع العميل" : "Customer signature"}</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={local.printSettings.showCompanySignature} onChange={(e) => setPrint("showCompanySignature", e.target.checked)} />{ar ? "توقيع الشركة" : "Company signature"}</label>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
              {(["logoPosition", "companyInfoPosition", "customerInfoPosition", "qrPosition"] as const).map((key) => (
                <div key={key}>
                  <label className="mb-1 block text-sm font-medium">{{ logoPosition: ar ? "موقع الشعار" : "Logo position", companyInfoPosition: ar ? "موقع بيانات الشركة" : "Company info position", customerInfoPosition: ar ? "موقع بيانات العميل" : "Customer info position", qrPosition: ar ? "موقع QR" : "QR position" }[key]}</label>
                  <Select value={local.printSettings[key]} onChange={(e) => setPrint(key, e.target.value as PrintPosition)}>
                    <option value="start">{tx.positionStart}</option><option value="center">{tx.positionCenter}</option><option value="end">{tx.positionEnd}</option>
                  </Select>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
              <div><label className="mb-1 block text-sm font-medium">{ar ? "حجم الشعار" : "Logo size"}</label><Input type="number" value={local.printSettings.logoSize} onChange={(e) => setPrint("logoSize", Number(e.target.value))} /></div>
              <div><label className="mb-1 block text-sm font-medium">{ar ? "حجم QR" : "QR size"}</label><Input type="number" value={local.printSettings.qrSize} onChange={(e) => setPrint("qrSize", Number(e.target.value))} /></div>
              <div><label className="mb-1 block text-sm font-medium">{ar ? "حجم الخط" : "Font size"}</label><Input type="number" value={local.printSettings.fontSize} onChange={(e) => setPrint("fontSize", Number(e.target.value))} /></div>
              <div><label className="mb-1 block text-sm font-medium">{ar ? "هامش الصفحة mm" : "Margin mm"}</label><Input type="number" value={local.printSettings.marginMm} onChange={(e) => setPrint("marginMm", Number(e.target.value))} /></div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div><label className="mb-1 block text-sm font-medium">{ar ? "رابط صورة الختم" : "Stamp image URL"}</label><Input value={local.printSettings.stampImageUrl || ""} onChange={(e) => setPrint("stampImageUrl", e.target.value)} /></div>
              <div><label className="mb-1 block text-sm font-medium">{ar ? "رابط توقيع الشركة" : "Company signature URL"}</label><Input value={local.printSettings.companySignatureUrl || ""} onChange={(e) => setPrint("companySignatureUrl", e.target.value)} /></div>
            </div>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">{ar ? "شروط الضمان وملاحظات الفاتورة" : "Warranty terms and invoice notes"}</h2>
            <Textarea rows={4} value={local.warrantyTerms} onChange={(e) => setLocal({ ...local, warrantyTerms: e.target.value })} />
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">{ar ? "قالب رسالة إرسال الفاتورة" : "Invoice WhatsApp message"}</h2>
            <p className="mb-2 text-xs text-slate-500">
              {ar ? "المتغيرات:" : "Placeholders:"} {"{اسم_العميل} {رقم_الفاتورة} {الإجمالي} {العملة} {موعد_الصيانة_القادم}"}
            </p>
            <Textarea rows={5} value={local.invoiceWhatsAppTemplate} onChange={(e) => setLocal({ ...local, invoiceWhatsAppTemplate: e.target.value })} />
          </Card>
        </>
      )}

      {activeTab === "messages" && (
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-semibold">{t("settings_whatsapp_templates")}</h2>
            <p className="mb-2 text-xs text-slate-500">{ar ? "المتغيرات المتاحة:" : "Available placeholders:"} {"{اسم_العميل} {رقم_العميل} {تفاصيل_الطلب} {المنتجات} {التاريخ} {المبلغ} {العملة} {اسم_الفني} {التخصص} {الملاحظات} {اسم_المسوق} {رقم_المسوق} {رقم_الطلب}"}</p>
            <div className="space-y-3">
              <div><label className="mb-1 block text-sm font-medium">{t("settings_customer_template")}</label><Textarea rows={3} value={local.whatsappTemplates.customer} onChange={(e) => setLocal({ ...local, whatsappTemplates: { ...local.whatsappTemplates, customer: e.target.value } })} /></div>
              <div><label className="mb-1 block text-sm font-medium">{t("settings_technician_template")}</label><Textarea rows={3} value={local.whatsappTemplates.technician} onChange={(e) => setLocal({ ...local, whatsappTemplates: { ...local.whatsappTemplates, technician: e.target.value } })} /></div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">{ar ? "قوالب واتساب جاهزة" : "Saved WhatsApp templates"}</h2>
            <p className="mb-3 text-xs text-slate-500">{ar ? "هذه القوالب ستظهر كاقتراحات عند إرسال واتساب للعميل أو الفني من الطلبات." : "These templates appear as suggestions when sending WhatsApp messages to customers or technicians from requests."}</p>
            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">{ar ? "اسم القالب" : "Template name"}</label>
                <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{ar ? "يُستخدم مع" : "Audience"}</label>
                <Select value={templateAudience} onChange={(e) => setTemplateAudience(e.target.value as WhatsAppTemplateAudience)}>
                  <option value="customer">{ar ? "العميل" : "Customer"}</option>
                  <option value="technician">{ar ? "الفني" : "Technician"}</option>
                  <option value="both">{ar ? "العميل والفني" : "Both"}</option>
                </Select>
              </div>
              <div className="flex items-end">
                <Button variant="secondary" onClick={addWhatsappTemplate}>{ar ? "إضافة القالب" : "Add template"}</Button>
              </div>
              <div className="md:col-span-3">
                <label className="mb-1 block text-sm font-medium">{ar ? "نص القالب" : "Template body"}</label>
                <Textarea rows={3} value={templateBody} onChange={(e) => setTemplateBody(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              {(local.whatsappTemplateLibrary || []).map((tpl) => (
                <div key={tpl.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">{tpl.name} <span className="text-xs font-normal text-slate-400">({tpl.audience})</span></div>
                    <button className="text-xs text-red-600 hover:underline" onClick={() => removeWhatsappTemplate(tpl.id)}>{t("delete")}</button>
                  </div>
                  <div className="whitespace-pre-wrap text-xs text-slate-600">{tpl.body}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {activeTab === "security" && (
        <>
          <Card>
            <h2 className="mb-3 font-semibold">{t("settings_security")}</h2>
            <label className="mb-1 block text-sm font-medium">{t("settings_admin_password")}</label>
            <Input value={local.adminPassword} onChange={(e) => setLocal({ ...local, adminPassword: e.target.value })} className="max-w-xs" />
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">{t("settings_hidden_modules")}</h2>
            <p className="mb-3 text-xs text-slate-400">{t("settings_hidden_modules_hint")}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {moduleList.map((mod) => (
                <label key={mod.href} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={(local.hiddenModules || []).includes(mod.href)} onChange={(e) => { const current = local.hiddenModules || []; setLocal({ ...local, hiddenModules: e.target.checked ? [...current, mod.href] : current.filter((h) => h !== mod.href) }); }} />
                  {mod.label}
                </label>
              ))}
            </div>
          </Card>
        </>
      )}

      {activeTab === "backup" && (
        <>
          <Card>
            <h2 className="mb-3 font-semibold">{t("settings_backup_reset")}</h2>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={exportData}>{t("settings_export")}</Button>
              <Button variant="secondary" onClick={exportDataXlsx}>{ar ? "تصدير كل البيانات Excel" : "Export all data XLSX"}</Button>
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>{t("settings_import")}</Button>
              <input ref={fileInputRef} type="file" accept="application/json,.json,.xlsx,.xls" className="hidden" onChange={handleImportFile("merge")} />
              <label className="cursor-pointer rounded-lg bg-slate-100 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200">{t("settings_import_replace")}<input type="file" accept="application/json,.json,.xlsx,.xls" className="hidden" onChange={handleImportFile("replace")} /></label>
              <Button variant="danger" onClick={factoryReset}>{t("settings_factory_reset")}</Button>
            </div>
            {importStatus && <p className="mt-2 text-sm text-slate-600">{importStatus}</p>}
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">{ar ? "الأرشفة" : "Archiving"}</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={local.archiveSettings.enabled} onChange={(e) => setLocal({ ...local, archiveSettings: { ...local.archiveSettings, enabled: e.target.checked } })} />{ar ? "تفعيل أدوات الأرشفة" : "Enable archive tools"}</label>
              <div><label className="mb-1 block text-sm font-medium">{ar ? "أرشفة أقدم من عدد أشهر" : "Archive older than months"}</label><Input type="number" value={local.archiveSettings.archiveOlderThanMonths} onChange={(e) => setLocal({ ...local, archiveSettings: { ...local.archiveSettings, archiveOlderThanMonths: Number(e.target.value) } })} /></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => { const payload = buildArchivePayload(local.archiveSettings.archiveOlderThanMonths); downloadJson(`cashier-crm-archive-${new Date().toISOString().slice(0,10)}.json`, payload); setArchiveStatus(`${ar ? "تم تصدير" : "Exported"} ${countArchiveRecords(payload)} ${ar ? "سجل" : "records"}.`); }}>{ar ? "تصدير الأرشيف" : "Export archive"}</Button>
              <Button variant="secondary" onClick={async () => { const payload = buildArchivePayload(local.archiveSettings.archiveOlderThanMonths); try { await downloadWorkbookXlsx(makeXlsxFileName("cashier-crm-archive"), payload.data as any); setArchiveStatus(`${ar ? "تم تصدير الأرشيف بصيغة Excel" : "Archive exported as Excel"}: ${countArchiveRecords(payload)} ${ar ? "سجل" : "records"}.`); } catch (err: any) { setArchiveStatus(`❌ ${err?.message || (ar ? "تعذر تصدير الأرشيف Excel." : "Could not export archive Excel.")}`); } }}>{ar ? "تصدير الأرشيف Excel" : "Export archive XLSX"}</Button>
              <Button variant="danger" onClick={() => { const payload = buildArchivePayload(local.archiveSettings.archiveOlderThanMonths); const count = countArchiveRecords(payload); if (!count) return setArchiveStatus(ar ? "لا توجد سجلات قديمة للأرشفة." : "No old records to archive."); const pass = prompt(ar ? "أدخل كلمة مرور المدير لتأكيد حذف السجلات القديمة بعد تصدير الأرشيف." : "Enter admin password to delete old records after exporting archive."); if (pass !== local.adminPassword) return setArchiveStatus(ar ? "كلمة المرور غير صحيحة." : "Incorrect admin password."); downloadJson(`cashier-crm-archive-before-clean-${new Date().toISOString().slice(0,10)}.json`, payload); removeOldRecords(local.archiveSettings.archiveOlderThanMonths); setArchiveStatus(`${ar ? "تم تصدير وحذف" : "Exported and removed"} ${count} ${ar ? "سجل قديم. جارٍ إعادة التحميل" : "old records. Reloading"}…`); setTimeout(() => window.location.reload(), 1000); }}>{ar ? "تنظيف السجلات القديمة" : "Clean old records"}</Button>
            </div>
            {archiveStatus && <p className="mt-2 text-sm text-slate-600">{archiveStatus}</p>}
          </Card>
        </>
      )}

      {activeTab === "cloud" && (
        <>
          <Card>
            <h2 className="mb-3 font-semibold">Supabase Cloud Backup</h2>
            <p className="mb-3 text-xs text-slate-500">{ar ? "يحفظ ويستعيد كامل البيانات من Supabase لمزامنة الأجهزة." : "Save/restore the full dataset in Supabase to sync devices."}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={async () => { setCloudStatus(ar ? "جارٍ الحفظ…" : "Saving…"); const result = await saveToSupabaseBackup(buildFullPayload()); setCloudStatus(formatSupabaseBackupMessage(result, ar)); }}>{ar ? "حفظ البيانات الحالية في Supabase" : "Save current data to Supabase"}</Button>
              <Button variant="secondary" onClick={async () => { setCloudStatus(ar ? "جارٍ التحميل…" : "Loading…"); const result = await loadFromSupabaseBackup(); if (result.ok && result.payload) { applyBackupPayload(result.payload, "replace"); setCloudStatus(`${result.message} ${ar ? "جارٍ إعادة التحميل" : "Reloading"}…`); setTimeout(() => window.location.reload(), 900); } else setCloudStatus(result.message); }}>Load data from Supabase</Button>
            </div>
            {cloudStatus && <p className="mt-2 text-sm text-slate-600">{cloudStatus}</p>}
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">{t("settings_gdrive")}</h2>
            {!isGoogleDriveConfigured ? (
              <p className="text-sm text-slate-500">Not configured. Set <code className="rounded bg-slate-100 px-1">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={local.backupSettings.saveDatedGoogleDriveCopies} onChange={(e) => setLocal({ ...local, backupSettings: { ...local.backupSettings, saveDatedGoogleDriveCopies: e.target.checked } })} />{ar ? "حفظ نسخة مؤرخة مع النسخة الثابتة" : "Save dated copy with fixed backup"}</label>
                  <div><label className="mb-1 block text-sm font-medium">{ar ? "تذكير النسخ التلقائي كل عدد أيام" : "Auto backup reminder days"}</label><Input type="number" value={local.backupSettings.googleDriveAutoBackupDays} onChange={(e) => setLocal({ ...local, backupSettings: { ...local.backupSettings, googleDriveAutoBackupDays: Number(e.target.value) } })} /></div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="secondary" onClick={async () => { try { setDriveStatus(ar ? "جارٍ الاتصال…" : "Connecting…"); const token = await requestDriveAccessToken(); await backupToDrive(token, buildFullPayload(), { datedCopy: local.backupSettings.saveDatedGoogleDriveCopies }); localStorage.setItem("cc_last_gdrive_backup_at", String(Date.now())); setDriveStatus(ar ? "تم حفظ النسخة في Google Drive." : "Backup saved to Google Drive."); } catch (err: any) { setDriveStatus(err?.message || "Backup failed."); } }}>{t("settings_gdrive_backup_now")}</Button>
                  <Button variant="secondary" onClick={async () => { try { setDriveStatus(ar ? "جارٍ تحميل القائمة…" : "Loading list…"); const token = await requestDriveAccessToken(); const files = await listDriveBackups(token); setDriveBackups(files); setSelectedDriveBackup(files[0]?.id || ""); setDriveStatus(files.length ? (ar ? "تم تحميل قائمة النسخ." : "Backup list loaded.") : (ar ? "لا توجد نسخ بعد." : "No backups found.")); } catch (err: any) { setDriveStatus(err?.message || "Listing failed."); } }}>{ar ? "عرض النسخ" : "List backups"}</Button>
                  <Button variant="secondary" onClick={async () => { try { setDriveStatus(ar ? "جارٍ الاستعادة…" : "Restoring…"); const token = await requestDriveAccessToken(); const data = await restoreFromDrive(token, selectedDriveBackup || undefined); const { imported, empty } = applyBackupPayload(data, "replace"); setDriveStatus(empty ? (ar ? "تمت الاستعادة لكن لم توجد بيانات متوافقة." : "Restored, but no matching data was found.") : `${ar ? "تمت الاستعادة" : "Restored"}: ${imported.join(", ")}. ${ar ? "جارٍ إعادة التحميل" : "Reloading"}…`); if (!empty) setTimeout(() => window.location.reload(), 1000); } catch (err: any) { setDriveStatus(err?.message || "Restore failed."); } }}>{t("settings_gdrive_restore")}</Button>
                </div>
                {driveBackups.length > 0 && <Select value={selectedDriveBackup} onChange={(e) => setSelectedDriveBackup(e.target.value)} className="max-w-xl">{driveBackups.map((f) => <option key={f.id} value={f.id}>{f.name} — {f.modifiedTime ? new Date(f.modifiedTime).toLocaleString() : ""}</option>)}</Select>}
                {driveStatus && <p className="text-sm text-slate-500">{driveStatus}</p>}
              </div>
            )}
          </Card>
        </>
      )}

      {activeTab === "pwa" && (
        <Card>
          <h2 className="mb-3 font-semibold">{tx.pwa}</h2>
          <p className="mb-3 text-sm text-slate-500">{ar ? "تم تجهيز manifest وزر تثبيت التطبيق. عند فتح النظام من متصفح يدعم PWA سيظهر زر تثبيت التطبيق تلقائيًا أسفل الشاشة." : "The manifest and install prompt are ready. On PWA-supported browsers, an install button appears automatically near the bottom of the screen."}</p>
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <div>manifest: <code>/manifest.json</code></div>
            <div>{ar ? "الأيقونة" : "Icon"}: <code>/icon.svg</code></div>
          </div>
        </Card>
      )}

      <div className="sticky bottom-0 z-20 flex items-center gap-3 rounded-xl border border-slate-100 bg-white/95 p-3 shadow-lg backdrop-blur no-print">
        <Button onClick={save}>{t("settings_save")}</Button>
        {saveStatus && <span className="text-sm text-green-700">{saveStatus}</span>}
      </div>

      {/* ── Reset Confirmation Modal ── */}
      <Modal
        open={resetModal}
        onClose={() => setResetModal(false)}
        title={ar ? "⚠️ إعادة ضبط المصنع" : "⚠️ Factory Reset"}
      >
        <div className="space-y-4">
          {resetStep === 1 && (
            <>
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {ar
                  ? "سيتم حذف جميع البيانات محليًا ومن Supabase بشكل نهائي ولا يمكن التراجع."
                  : "All data will be permanently deleted locally and from Supabase. This cannot be undone."}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {ar ? "أدخل رمز المدير للمتابعة" : "Enter admin code to continue"}
                </label>
                <Input
                  type="password"
                  value={resetCode}
                  onChange={(e) => { setResetCode(e.target.value); setResetError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleResetStep1()}
                  placeholder="••••"
                  autoFocus
                />
                {resetError && <p className="mt-1 text-xs text-red-500">{resetError}</p>}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setResetModal(false)}>{ar ? "إلغاء" : "Cancel"}</Button>
                <Button onClick={handleResetStep1}>
                  {ar ? "التالي" : "Next"}
                </Button>
              </div>
            </>
          )}

          {resetStep === 2 && (
            <>
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 font-medium">
                {ar
                  ? `للتأكيد النهائي، اكتب كلمة "${RESET_PHRASE}" في الحقل أدناه`
                  : `For final confirmation, type "${RESET_PHRASE}" below`}
              </div>
              <Input
                value={resetPhrase}
                onChange={(e) => { setResetPhrase(e.target.value); setResetError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleResetConfirm()}
                placeholder={RESET_PHRASE}
                autoFocus
                dir={ar ? "rtl" : "ltr"}
              />
              {resetError && <p className="mt-1 text-xs text-red-500">{resetError}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setResetModal(false)}>{ar ? "إلغاء" : "Cancel"}</Button>
                <Button
                  onClick={handleResetConfirm}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {ar ? "حذف كل البيانات نهائياً" : "Delete All Data"}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ── Import Replace Confirmation Modal ── */}
      <Modal
        open={replaceModal}
        onClose={() => { setReplaceModal(false); setPendingReplaceFile(null); }}
        title={ar ? "⚠️ استيراد بالاستبدال" : "⚠️ Import & Replace"}
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            {ar
              ? `سيتم استبدال جميع البيانات الحالية ببيانات الملف: "${pendingReplaceFile?.name}". أدخل رمز المدير للمتابعة.`
              : `All current data will be replaced with data from: "${pendingReplaceFile?.name}". Enter admin code to continue.`}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              {ar ? "رمز المدير" : "Admin code"}
            </label>
            <Input
              type="password"
              value={replaceCode}
              onChange={(e) => { setReplaceCode(e.target.value); setReplaceError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleReplaceConfirm()}
              placeholder="••••"
              autoFocus
            />
            {replaceError && <p className="mt-1 text-xs text-red-500">{replaceError}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setReplaceModal(false); setPendingReplaceFile(null); }}>
              {ar ? "إلغاء" : "Cancel"}
            </Button>
            <Button onClick={handleReplaceConfirm}>
              {ar ? "استيراد واستبدال" : "Import & Replace"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
