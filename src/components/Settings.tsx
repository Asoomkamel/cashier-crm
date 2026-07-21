/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { AppSettings, Order } from "../types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Save,
  Download,
  Upload,
  Shield,
  EyeOff,
  Building2,
  Link2,
  MessageCircle,
  Plus,
  Users,
  Eye,
  Cloud,
  Lock,
  Loader2,
  CheckCircle,
  Trash2,
  Package,
} from "lucide-react";
import { storage } from "../services/storage";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import PrintInvoice from "./PrintInvoice";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UsersView from "./Users";
import { PasswordDialog } from "./PasswordDialog";
import {
  initGoogleAuth,
  setGoogleClientId,
  signInWithGoogle,
  logoutGoogle,
  findBackupFile,
  uploadBackupToGoogleDrive,
  downloadBackupFromGoogleDrive,
  listBackupFiles,
} from "../services/googleDrive";

interface SettingsProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

export default function Settings({ settings, onSave }: SettingsProps) {
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [menuToRestore, setMenuToRestore] = useState<string | null>(null);
  const [passwordAttempt, setPasswordAttempt] = useState("");

  const [deleteDataDialogOpen, setDeleteDataDialogOpen] = useState(false);
  const [deleteDataPasswordAttempt, setDeleteDataPasswordAttempt] =
    useState("");

  const [googleUser, setGoogleUser] = useState<any>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [cloudBackupFile, setCloudBackupFile] = useState<any>(null);

  // Restore dialog state
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [availableBackups, setAvailableBackups] = useState<
    { id: string; name: string; modifiedTime: string }[]
  >([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);

  React.useEffect(() => {
    if (settings.googleClientId) {
      setGoogleClientId(settings.googleClientId);
    }
    const unsub = initGoogleAuth(async (user, token) => {
      setGoogleUser(user);
      setGoogleToken(token);
      try {
        const file = await findBackupFile(token);
        if (file) {
          setCloudBackupFile(file);
        }
      } catch (err) {
        console.error(err);
      }
    });
    return () => unsub();
  }, []);

  // Automatic 14 days checking logic on token load
  React.useEffect(() => {
    if (googleToken && googleUser) {
      const lastTimeStr = settings.googleBackupSettings?.lastBackupTime;
      const lastTime = lastTimeStr ? new Date(lastTimeStr).getTime() : 0;
      const now = Date.now();
      const twoWeeks = 14 * 24 * 60 * 60 * 1000;

      if (now - lastTime >= twoWeeks) {
        console.log("Triggering bi-weekly automatic background backup...");
        const todayStr = new Date().toISOString().split("T")[0];
        // Automatically save/update Primary file & Bi-weekly historical copy
        triggerGoogleBackup(
          googleToken,
          `Kaisher Pro - ${todayStr}.json`,
          true,
        );
        triggerGoogleBackup(googleToken, "Kaisher Pro.json", true);
      }
    }
  }, [googleToken, googleUser]);

  const handleGoogleSignIn = async () => {
    try {
      setIsSyncing(true);
      const res = await signInWithGoogle();
      if (res) {
        setGoogleUser(res.user);
        setGoogleToken(res.accessToken);
        toast.success(`تم ربط الحساب بنجاح: ${res.user.email}`);

        // Immediately take a backup of the account:
        await triggerGoogleBackup(res.accessToken, "Kaisher Pro.json");
      }
    } catch (err: any) {
      if (err?.code === "auth/network-request-failed") {
        toast.error(
          "فشل الاتصال: يرجى فتح التطبيق في نافذة/علامة تبويب جديدة (عبر رابط Development App)، أو التحقق من إعدادات المتصفح/مانع الإعلانات حيث يتم حظر النوافذ المنبثقة.",
        );
      } else if (err?.code === "auth/unauthorized-domain") {
        toast.error(
          "النطاق غير مصرح به. يرجى الذهاب إلى إعدادات مشروع Firebase (Authentication -> Settings -> Authorized Domains) وإضافة النطاق الحالي للتطبيق (ais-dev-...run.app و ais-pre-...run.app)",
          { duration: 10000 },
        );
      } else {
        toast.error("فشل ربط حساب Google Drive: " + err.message);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await logoutGoogle();
      setGoogleUser(null);
      setGoogleToken(null);
      setCloudBackupFile(null);
      toast.success("تم تسجيل الخروج وفصل حساب Google Drive");
    } catch (err: any) {
      toast.error("فشل تسجيل الخروج");
    }
  };

  const triggerGoogleBackup = async (
    tokenToCheck?: string,
    fileName: string = "Kaisher Pro.json",
    isSilent: boolean = false,
  ) => {
    const activeToken = tokenToCheck || googleToken;
    if (!activeToken) {
      if (!isSilent) toast.error("يرجى ربط حساب Google أولاً");
      return;
    }
    try {
      if (!isSilent) setIsSyncing(true);
      const backupData = {
        customers: storage.getCustomers(),
        catalog: storage.getCatalog(),
        orders: storage.getOrders(),
        settings: storage.getSettings(),
        serviceOrders: storage.getServiceOrders(),
        urgentOrders: storage.getUrgentOrders(),
        fastOrders: storage.getFastOrders ? storage.getFastOrders() : [],
        vendors: storage.getVendors(),
        purchases: storage.getPurchases(),
        expenses: storage.getExpenses ? storage.getExpenses() : [],
        users: storage.getUsers(),
        techInventory: storage.getTechInventory?.() || [],
        techInventoryLogs: storage.getTechInventoryLogs?.() || [],
        techFinancialLogs: storage.getTechFinancialLogs?.() || [],
        timestamp: new Date().toISOString(),
      };

      const resFile = await uploadBackupToGoogleDrive(
        activeToken,
        backupData,
        fileName,
      );
      setCloudBackupFile(resFile);

      const updatedSettings = {
        ...formData,
        googleBackupSettings: {
          enabled: true,
          lastBackupTime: resFile.modifiedTime,
        },
      };
      setFormData(updatedSettings);
      onSave(updatedSettings);

      if (!isSilent) {
        toast.success(`تم حفظ نسخة احتياطية سحابية بنجاح باسم "${fileName}"!`);
      }
    } catch (err: any) {
      console.error(err);
      if (!isSilent) {
        toast.error(
          "فشل رفع النسخة الاحتياطية إلى Google Drive: " + err.message,
        );
      }
    } finally {
      if (!isSilent) setIsSyncing(false);
    }
  };

  const handleOpenRestoreDialog = async () => {
    if (!googleToken) {
      toast.error("يرجى ربط حساب Google أولاً");
      return;
    }
    try {
      setRestoreDialogOpen(true);
      setIsLoadingBackups(true);
      const files = await listBackupFiles(googleToken);
      setAvailableBackups(files);
    } catch (err: any) {
      console.error(err);
      toast.error("فشل قراءة الملفات من Google Drive : " + err.message);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const handleSelectBackup = async (file: {
    id: string;
    name: string;
    modifiedTime: string;
  }) => {
    if (!googleToken) return;
    try {
      const confirmRestore = window.confirm(
        `هل أنت متأكد من استعادة النسخة الاحتياطية "${file.name}" المنتقاة والمأخوذة في تاريخ: ${new Date(file.modifiedTime).toLocaleString("ar")}\nستحل هذه النسخة محل جميع البيانات الحالية في النظام!`,
      );
      if (!confirmRestore) return;

      setIsSyncing(true);
      const backup = await downloadBackupFromGoogleDrive(googleToken, file.id);

      if (backup.customers) storage.saveCustomers(backup.customers);
      if (backup.catalog) storage.saveCatalog(backup.catalog);
      if (backup.orders) storage.saveOrders(backup.orders);
      if (backup.settings) storage.saveSettings(backup.settings);
      if (backup.serviceOrders) storage.saveServiceOrders(backup.serviceOrders);
      if (backup.urgentOrders) storage.saveUrgentOrders(backup.urgentOrders);
      if (backup.fastOrders && storage.saveFastOrders) storage.saveFastOrders(backup.fastOrders);
      if (backup.vendors) storage.saveVendors(backup.vendors);
      if (backup.purchases) storage.savePurchases(backup.purchases);
      if (backup.expenses && storage.saveExpenses) storage.saveExpenses(backup.expenses);
      if (backup.users) storage.saveUsers(backup.users);
      if (backup.techInventory && storage.saveTechInventory)
        storage.saveTechInventory(backup.techInventory);
      if (backup.techInventoryLogs && storage.saveTechInventoryLogs)
        storage.saveTechInventoryLogs(backup.techInventoryLogs);
      if (backup.techFinancialLogs && storage.saveTechFinancialLogs)
        storage.saveTechFinancialLogs(backup.techFinancialLogs);

      toast.success(
        "تمت استعادة النسخة الاحتياطية بنجاح، وتم استرجاع كافة البيانات والمعلومات إلى النظام!",
      );
      setRestoreDialogOpen(false);
      setTimeout(() => window.location.reload(), 2000);
    } catch (err: any) {
      console.error(err);
      toast.error("فشل استعادة النسخة الاحتياطية من السحابة: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const [formData, setFormData] = useState<AppSettings>({
    ...settings,
    companyHeader: settings.companyHeader || {
      name: "",
      address: "",
      phone: "",
      taxNumber: "",
    },
    hiddenMenus: settings.hiddenMenus || [],
    whatsappTemplates: settings.whatsappTemplates || [],
    invoiceOffsets: settings.invoiceOffsets || {},
    footerSignatures: settings.footerSignatures || { client: "", company: "" },
  });

  const [viewTechStock, setViewTechStock] = useState<any>(null);
  const [viewTechPermissions, setViewTechPermissions] = useState<any>(null);
  const [showFactoryResetAuth, setShowFactoryResetAuth] = useState(false);

  const handleSave = () => {
    onSave(formData);
    toast.success("تم حفظ الإعدادات بنجاح");
  };

  const handleAddTemplate = () => {
    const templates = formData.whatsappTemplates || [];
    const newTemplates = [
      ...templates,
      { id: Math.random().toString(), name: "", content: "" },
    ];
    const newSettings = { ...formData, whatsappTemplates: newTemplates };
    setFormData(newSettings);
    onSave(newSettings);
  };

  const updateTemplate = (
    id: string,
    field: "name" | "content",
    value: string,
  ) => {
    const templates = formData.whatsappTemplates || [];
    const newTemplates = templates.map((t) =>
      t.id === id ? { ...t, [field]: value } : t,
    );
    const newSettings = { ...formData, whatsappTemplates: newTemplates };
    setFormData(newSettings);
    onSave(newSettings);
  };

  const deleteTemplate = (id: string) => {
    const templates = formData.whatsappTemplates || [];
    const newTemplates = templates.filter((t) => t.id !== id);
    const newSettings = { ...formData, whatsappTemplates: newTemplates };
    setFormData(newSettings);
    onSave(newSettings);
  };

  const exportToJson = () => {
    const backup = {
      customers: storage.getCustomers(),
      catalog: storage.getCatalog(),
      orders: storage.getOrders(),
      settings: storage.getSettings(),
      serviceOrders: storage.getServiceOrders(),
      vendors: storage.getVendors(),
      purchases: storage.getPurchases(),
      urgentOrders: storage.getUrgentOrders(),
      fastOrders: storage.getFastOrders ? storage.getFastOrders() : [],
      expenses: storage.getExpenses ? storage.getExpenses() : [],
      users: storage.getUsers(),
      techInventory: storage.getTechInventory?.() || [],
      techInventoryLogs: storage.getTechInventoryLogs?.() || [],
      techFinancialLogs: storage.getTechFinancialLogs?.() || [],
      timestamp: new Date().toISOString(),
    };

    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(backup));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute(
      "download",
      `Full_Backup_${backup.timestamp.split("T")[0]}.json`,
    );
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    toast.success("تم تصدير النسخة الاحتياطية بنجاح");
  };

  const importFromJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const backupStr = evt.target?.result as string;
        const backup = JSON.parse(backupStr);

        if (backup.customers) storage.saveCustomers(backup.customers);
        if (backup.catalog) storage.saveCatalog(backup.catalog);
        if (backup.orders) storage.saveOrders(backup.orders);
        if (backup.settings) storage.saveSettings(backup.settings);
        if (backup.serviceOrders)
          storage.saveServiceOrders(backup.serviceOrders);
        if (backup.vendors) storage.saveVendors(backup.vendors);
        if (backup.purchases) storage.savePurchases(backup.purchases);
        if (backup.urgentOrders) storage.saveUrgentOrders(backup.urgentOrders);
        if (backup.fastOrders && storage.saveFastOrders) storage.saveFastOrders(backup.fastOrders);
        if (backup.expenses && storage.saveExpenses) storage.saveExpenses(backup.expenses);
        if (backup.users) storage.saveUsers(backup.users);
        if (backup.techInventory && storage.saveTechInventory)
          storage.saveTechInventory(backup.techInventory);
        if (backup.techInventoryLogs && storage.saveTechInventoryLogs)
          storage.saveTechInventoryLogs(backup.techInventoryLogs);
        if (backup.techFinancialLogs && storage.saveTechFinancialLogs)
          storage.saveTechFinancialLogs(backup.techFinancialLogs);

        toast.success(
          "تمت استعادة النسخة الشاملة بنجاح، سيتم إعادة التحميل...",
        );
        setTimeout(() => window.location.reload(), 1500);
      } catch (err) {
        toast.error("خطأ في قراءة ملف النسخة الاحتياطية الشاملة");
      }
    };
    reader.readAsText(file);
  };

  const exportToExcel = () => {
    const customers = storage.getCustomers();
    const catalog = storage.getCatalog();
    const orders = storage.getOrders();
    const serviceOrders = storage.getServiceOrders();
    const urgentOrders = storage.getUrgentOrders();
    const techInventory = storage.getTechInventory?.() || [];
    const techInventoryLogs = storage.getTechInventoryLogs?.() || [];

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(customers),
      "Customers",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(catalog),
      "Catalog",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(orders),
      "Orders",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(serviceOrders),
      "Appointments",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(urgentOrders),
      "UrgentOrders",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(techInventory),
      "TechInventory",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(techInventoryLogs),
      "TechInventoryLogs",
    );

    XLSX.writeFile(
      wb,
      `POS_Backup_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
    toast.success("تم تصدير نسخة احتياطية Excel شاملة المواعيد والأصناف");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });

        const custSheet = wb.Sheets["Customers"];
        const catSheet = wb.Sheets["Catalog"];
        const ordSheet = wb.Sheets["Orders"];
        const srvSheet = wb.Sheets["Appointments"];
        const urgSheet = wb.Sheets["UrgentOrders"];
        const techInvSheet = wb.Sheets["TechInventory"];
        const techLogsSheet = wb.Sheets["TechInventoryLogs"];

        if (custSheet)
          storage.saveCustomers(XLSX.utils.sheet_to_json(custSheet));
        if (catSheet) storage.saveCatalog(XLSX.utils.sheet_to_json(catSheet));
        if (ordSheet) storage.saveOrders(XLSX.utils.sheet_to_json(ordSheet));
        if (srvSheet)
          storage.saveServiceOrders(XLSX.utils.sheet_to_json(srvSheet));
        if (urgSheet)
          storage.saveUrgentOrders(XLSX.utils.sheet_to_json(urgSheet));
        if (techInvSheet && storage.saveTechInventory)
          storage.saveTechInventory(XLSX.utils.sheet_to_json(techInvSheet));
        if (techLogsSheet && storage.saveTechInventoryLogs)
          storage.saveTechInventoryLogs(
            XLSX.utils.sheet_to_json(techLogsSheet),
          );

        toast.success(
          "تمت استعادة البيانات بنجاح (المواعيد والأصناف والعملاء والفنيين)، سيتم إعادة التحميل...",
        );
        setTimeout(() => window.location.reload(), 1500);
      } catch (err) {
        toast.error("خطأ في قراءة ملف النسخة الاحتياطية Excel");
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="pb-10 space-y-6" dir="rtl">
      <Tabs defaultValue="facility" className="w-full">
        <TabsList className="mb-6 bg-white/5 border border-white/10 flex flex-wrap h-auto gap-2 p-1 justify-start">
          <TabsTrigger value="facility">بيانات المنشأة</TabsTrigger>
          <TabsTrigger value="users">المستخدمين والفروع</TabsTrigger>
          <TabsTrigger value="templates">قوالب الرسائل</TabsTrigger>
          <TabsTrigger value="printing">إعدادات الطباعة</TabsTrigger>
          <TabsTrigger value="security">الأمان والنسخ الاحتياطي</TabsTrigger>
        </TabsList>

        <TabsContent value="facility" className="space-y-6">
          <Card className="glass border-white/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-400" />
            بيانات المنشأة وترويسة الفاتورة
          </CardTitle>
          <CardDescription>
            هذه البيانات تظهر في أعلى الفواتير وعروض الأسعار المطبوعة. مرتبة
            بشكل متناسق ومتساوي.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {/* الشعار */}
            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10 col-span-1 md:col-span-2">
              <Label className="text-white font-medium text-xs">
                شعار المنشأة (اختياري)
              </Label>
              <div className="flex items-center gap-4 h-10 mt-1">
                {formData.companyHeader.logoUrl && (
                  <img
                    src={formData.companyHeader.logoUrl}
                    alt="Logo"
                    className="max-h-10 rounded border border-white/10"
                  />
                )}
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        setFormData({
                          ...formData,
                          companyHeader: {
                            ...formData.companyHeader,
                            logoUrl: evt.target?.result as string,
                          },
                        });
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="bg-black/20 border-white/10 text-xs h-9 flex items-center"
                />
                {formData.companyHeader.logoUrl && (
                  <Button
                    variant="ghost"
                    className="text-red-400 p-2 text-xs"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        companyHeader: {
                          ...formData.companyHeader,
                          logoUrl: "",
                        },
                      })
                    }
                  >
                    إزالة
                  </Button>
                )}
              </div>
            </div>

            {/* اسم المنشأة */}
            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10">
              <Label className="text-white font-medium text-xs">
                اسم الشركة / المنشأة
              </Label>
              <Input
                value={formData.companyHeader.name}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    companyHeader: {
                      ...formData.companyHeader,
                      name: e.target.value,
                    },
                  })
                }
                className="bg-black/20 border-white/10 h-10 text-sm"
              />
            </div>

            {/* العنوان */}
            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10">
              <Label className="text-white font-medium text-xs">
                العنوان بالتفصيل
              </Label>
              <Input
                value={formData.companyHeader.address}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    companyHeader: {
                      ...formData.companyHeader,
                      address: e.target.value,
                    },
                  })
                }
                className="bg-black/20 border-white/10 h-10 text-sm"
              />
            </div>

            {/* الهاتف */}
            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10">
              <Label className="text-white font-medium text-xs">
                رقم التواصل
              </Label>
              <Input
                value={formData.companyHeader.phone}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    companyHeader: {
                      ...formData.companyHeader,
                      phone: e.target.value,
                    },
                  })
                }
                className="bg-black/20 border-white/10 h-10 text-sm"
              />
            </div>

            {/* الرقم الضريبي */}
            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10">
              <Label className="text-white font-medium text-xs">
                الرقم الضريبي للمنشأة
              </Label>
              <Input
                value={formData.companyHeader.taxNumber}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    companyHeader: {
                      ...formData.companyHeader,
                      taxNumber: e.target.value,
                    },
                  })
                }
                className="bg-black/20 border-white/10 h-10 text-sm"
              />
            </div>

            {/* Language */}
            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10">
              <Label className="text-white font-medium text-xs">
                لغة النظام (Language)
              </Label>
              <select
                value={formData.language || "ar"}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    language: e.target.value as "ar" | "en",
                  })
                }
                className="w-full bg-black/20 border-white/10 h-10 text-sm rounded-md text-white"
              >
                <option value="ar" className="bg-zinc-900 text-white">
                  العربية
                </option>
                <option value="en" className="bg-zinc-900 text-white">
                  English
                </option>
              </select>
            </div>
          </div>

          <div className="mt-4 space-y-4 bg-white/5 p-4 rounded-lg border border-white/10">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-sm">إدارة الفروع (نقاط البيع)</h3>
              <Button
                size="sm"
                variant="outline"
                className="bg-black/20 border-white/10 text-xs h-7 px-2"
                onClick={() => {
                  const newBranch = {
                    id: Math.random().toString(36).substr(2, 9),
                    name: "فرع جديد",
                  };
                  setFormData({
                    ...formData,
                    branches: [...(formData.branches || []), newBranch],
                  });
                }}
              >
                <Plus className="h-3 w-3 ml-1" />
                إضافة فرع
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {(formData.branches || []).map((branch, idx) => (
                <div key={branch.id} className="flex gap-2">
                  <Input
                    value={branch.name}
                    onChange={(e) => {
                      const newBranches = [...(formData.branches || [])];
                      newBranches[idx].name = e.target.value;
                      setFormData({ ...formData, branches: newBranches });
                    }}
                    className="bg-black/20 border-white/10 text-sm h-9 flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-300 hover:bg-red-400/10 px-2 h-9"
                    onClick={() => {
                      const newBranches = [...(formData.branches || [])];
                      newBranches.splice(idx, 1);
                      setFormData({ ...formData, branches: newBranches });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {(!formData.branches || formData.branches.length === 0) && (
                <div className="text-center text-white/40 col-span-full py-4 text-xs bg-black/20 rounded border border-dashed border-white/10">
                  لا يوجد فروع مضافة.
                </div>
              )}
            </div>

            {/* ----- التصنيفات ----- */}
            <div className="border-t border-white/10 my-6"></div>
            <div className="flex items-center justify-between mt-4 mb-2">
              <div>
                <Label className="text-white text-sm font-bold flex items-center gap-1.5">
                  التصنيفات
                </Label>
                <p className="text-[10px] sm:text-xs text-white/50">
                  إدارة التصنيفات المتاحة للمنتجات و الخدمات
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-white/10 bg-white/5 hover:bg-white/10 text-xs h-7"
                onClick={() => {
                  setFormData({
                    ...formData,
                    categories: [...(formData.categories || []), "تصنيف جديد"],
                  });
                }}
              >
                <Plus className="h-3 w-3 ml-1" />
                إضافة تصنيف
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mb-6">
              {(formData.categories || []).map((category, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    value={category}
                    onChange={(e) => {
                      const newCategories = [...(formData.categories || [])];
                      newCategories[idx] = e.target.value;
                      setFormData({ ...formData, categories: newCategories });
                    }}
                    className="bg-black/20 border-white/10 text-sm h-9 flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-300 hover:bg-red-400/10 px-2 h-9"
                    onClick={() => {
                      const newCategories = [...(formData.categories || [])];
                      newCategories.splice(idx, 1);
                      setFormData({ ...formData, categories: newCategories });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {(!formData.categories || formData.categories.length === 0) && (
                <div className="text-center text-white/40 col-span-full py-4 text-xs bg-black/20 rounded border border-dashed border-white/10">
                  لا يوجد تصنيفات مضافة.
                </div>
              )}
            </div>

            {/* نسبة الضريبة الافتراضية */}
            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10">
              <Label className="text-white font-medium text-xs">
                نسبة الضريبة الافتراضية (%)
              </Label>
              <Input
                type="number"
                value={formData.defaultTaxRate || 15}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    defaultTaxRate: parseFloat(e.target.value) || 0,
                  })
                }
                className="bg-black/20 border-white/10 h-10 text-sm"
              />
            </div>

            {/* خيار إظهار التواقيع والختم */}
            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10 flex flex-col justify-center">
              <div className="flex items-center gap-2 h-10 mt-2">
                <input
                  type="checkbox"
                  id="show-signatures"
                  checked={formData.showSignatures !== false}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      showSignatures: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded border-white/15 text-purple-600 focus:ring-purple-600 bg-black/20"
                />
                <Label
                  htmlFor="show-signatures"
                  className="cursor-pointer text-white text-xs font-medium"
                >
                  إظهار التواقيع والختم في الفاتورة
                </Label>
              </div>
            </div>

            {/* بادئة رقم الفاتورة */}
            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10">
              <Label className="text-white font-medium text-xs">
                بادئة رقم الفاتورة
              </Label>
              <Input
                value={formData.invoicePrefix || ""}
                onChange={(e) =>
                  setFormData({ ...formData, invoicePrefix: e.target.value })
                }
                className="bg-black/20 border-white/10 h-10 text-sm placeholder:text-white/20"
                placeholder="مثال: INV-"
              />
            </div>

            {/* رقم الفاتورة القادمة */}
            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10">
              <Label className="text-white font-medium text-xs">
                رقم الفاتورة القادمة (البداية التصاعدية)
              </Label>
              <Input
                type="number"
                value={formData.nextInvoiceNumber || 1}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    nextInvoiceNumber: parseInt(e.target.value) || 1,
                  })
                }
                className="bg-black/20 border-white/10 text-left dir-ltr h-10 text-sm"
                placeholder="مثال: 1000"
              />
            </div>

            {/* بادئة أرقام الطلبات ورقم البداية */}
            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10">
              <Label className="text-white font-medium text-xs">
                بادئة أرقام الطلبات والفنيين (Prefix)
              </Label>
              <Input
                value={formData.requestPrefix || "REQ-"}
                onChange={(e) =>
                  setFormData({ ...formData, requestPrefix: e.target.value })
                }
                className="bg-black/20 border-white/10 h-10 text-sm placeholder:text-white/20"
                placeholder="مثال: REQ-"
              />
            </div>

            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10">
              <Label className="text-white font-medium text-xs">
                رقم الطلب القادم (البداية)
              </Label>
              <Input
                type="number"
                value={formData.nextRequestNumber ?? 1}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    nextRequestNumber: parseInt(e.target.value) ?? 1,
                  })
                }
                className="bg-black/20 border-white/10 text-left dir-ltr h-10 text-sm"
                placeholder="مثال: 1"
              />
            </div>

            {/* بادئة أرقام عروض الأسعار ورقم البداية */}
            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10">
              <Label className="text-white font-medium text-xs">
                بادئة عروض الأسعار (Prefix)
              </Label>
              <Input
                value={formData.quotationPrefix || "QUO-"}
                onChange={(e) =>
                  setFormData({ ...formData, quotationPrefix: e.target.value })
                }
                className="bg-black/20 border-white/10 h-10 text-sm placeholder:text-white/20"
                placeholder="مثال: QUO-"
              />
            </div>

            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10">
              <Label className="text-white font-medium text-xs">
                رقم عرض السعر القادم (البداية)
              </Label>
              <Input
                type="number"
                value={formData.nextQuotationNumber ?? 1}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    nextQuotationNumber: parseInt(e.target.value) ?? 1,
                  })
                }
                className="bg-black/20 border-white/10 text-left dir-ltr h-10 text-sm"
                placeholder="مثال: 1"
              />
            </div>

            {/* نص توقيع العميل */}
            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10">
              <Label className="text-white font-medium text-xs">
                نص توقيع العميل (الأسفل)
              </Label>
              <Input
                value={
                  formData.footerSignatures?.client ||
                  "توقيع العميل: ......................"
                }
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    footerSignatures: {
                      ...(formData.footerSignatures || {
                        client: "",
                        company: "",
                      }),
                      client: e.target.value,
                    },
                  })
                }
                className="bg-black/20 border-white/10 h-10 text-sm"
              />
            </div>

            {/* نص ختم الشركة */}
            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10">
              <Label className="text-white font-medium text-xs">
                نص ختم الشركة (الأسفل)
              </Label>
              <Input
                value={
                  formData.footerSignatures?.company ||
                  "ختم الشركة: ......................"
                }
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    footerSignatures: {
                      ...(formData.footerSignatures || {
                        client: "",
                        company: "",
                      }),
                      company: e.target.value,
                    },
                  })
                }
                className="bg-black/20 border-white/10 h-10 text-sm"
              />
            </div>

            {/* شروط الضمان */}
            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10 col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4">
              <Label className="text-white font-medium text-xs">
                شروط الضمان وسياسة الاسترجاع (أسفل الفاتورة)
              </Label>
              <Textarea
                value={formData.warrantyTerms}
                onChange={(e) =>
                  setFormData({ ...formData, warrantyTerms: e.target.value })
                }
                className="bg-black/20 border-white/10 h-24 text-sm resize-y"
              />
            </div>

            {/* قوالب رسائل الواتساب */}
            <div className="space-y-4 bg-white/5 p-4 rounded-lg border border-orange-500/20 col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4 mt-4">
              <div>
                <h3 className="text-orange-400 font-bold text-sm mb-1">
                  قوالب رسائل الواتساب
                </h3>
                <p className="text-xs text-white/50 mb-3">
                  اضغط على أي متغير لإضافته للرسالة مباشرة
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {[
                    "{رقم الطلب}",
                    "{اسم العميل}",
                    "{جوال العميل}",
                    "{موقع العميل}",
                    "{موعد الزياره}",
                    "{الخدمه}",
                    "{طريقه الدفع}",
                    "{مبلغ الطلبيه}",
                    "{الموقع الجغرافي}",
                    "{ملاحضه}",
                  ].map((variable) => (
                    <Button
                      key={variable}
                      onMouseDown={(e) => e.preventDefault()}
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs bg-white/5 border-white/10 hover:bg-orange-500/20 hover:text-orange-400"
                      onClick={() => {
                        const activeEl =
                          document.activeElement as HTMLTextAreaElement;
                        if (activeEl && activeEl.tagName === "TEXTAREA") {
                          const id = activeEl.id;
                          // Add variable at cursor position if possible
                          const startPos = activeEl.selectionStart || 0;
                          const endPos = activeEl.selectionEnd || 0;
                          const fieldName = id as keyof AppSettings;

                          if (
                            id === "whatsappTemplateTechnician" ||
                            id === "whatsappTemplateCustomer"
                          ) {
                            const currentVal =
                              (formData[fieldName] as string) || "";
                            const newVal =
                              currentVal.substring(0, startPos) +
                              variable +
                              currentVal.substring(endPos);
                            setFormData({ ...formData, [fieldName]: newVal });

                            // Restore focus and cursor position after state updates
                            setTimeout(() => {
                              activeEl.focus();
                              activeEl.selectionStart =
                                startPos + variable.length;
                              activeEl.selectionEnd =
                                startPos + variable.length;
                            }, 0);
                          }
                        } else {
                          // Default to Customer message at the end
                          setFormData({
                            ...formData,
                            whatsappTemplateCustomer:
                              (formData.whatsappTemplateCustomer || "") +
                              variable,
                          });
                        }
                      }}
                    >
                      {variable}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-white font-medium text-xs">
                  صيغة رسالة إرسال الطلب للفني
                </Label>
                <Textarea
                  id="whatsappTemplateTechnician"
                  value={formData.whatsappTemplateTechnician || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      whatsappTemplateTechnician: e.target.value,
                    })
                  }
                  placeholder="🔧 *طلب عمل جديد*&#10;━━━━━━━━━━━━━━━..."
                  className="bg-black/20 border-white/10 h-40 text-sm resize-y"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white font-medium text-xs">
                  صيغة رسالة التواصل مع العميل (اختياري)
                </Label>
                <Textarea
                  id="whatsappTemplateCustomer"
                  value={formData.whatsappTemplateCustomer || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      whatsappTemplateCustomer: e.target.value,
                    })
                  }
                  placeholder="أهلاً {اسم العميل}..."
                  className="bg-black/20 border-white/10 h-32 text-sm resize-y"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="printing" className="space-y-6">
      <Card className="glass border-white/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-indigo-400" />
            تحريك وتنسيق عناصر الفاتورة (A4)
            <Button
              variant="outline"
              size="sm"
              className="mr-auto border-indigo-500 text-indigo-400 hover:bg-indigo-500/20"
              onClick={() => {
                const el = document.getElementById("invoice-preview-container");
                if (el) el.classList.toggle("hidden");
              }}
            >
              <Eye className="h-4 w-4 ml-2" /> إظهار/إخفاء المعاينة
            </Button>
          </CardTitle>
          <CardDescription>
            التحكم في زحزحة عناصر الفاتورة يمين/يسار أو أعلى/أسفل وقت الطباعة
            (بالبكسل).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            id="invoice-preview-container"
            className="hidden mb-6 w-full overflow-hidden bg-black/40 py-8 rounded-xl border border-white/10 flex justify-center"
          >
            <div className="flex justify-center w-full transform origin-top md:scale-[0.8] lg:scale-[0.9]">
              <PrintInvoice
                settings={formData}
                previewMode={true}
                customer={{
                  id: "cust_1",
                  name: "محمد أحمد",
                  phone: "0555555555",
                  type: "customer",
                  locations: [],
                  createdAt: Date.now(),
                  taxNumber: "300000000000003",
                  companyName: "مؤسسة الأفق",
                }}
                order={{
                  id: "INV123456789",
                  customerId: "cust_1",
                  customerName: "محمد أحمد",
                  paymentMethod: "network",
                  items: [
                    {
                      catalogId: "1",
                      name: "خدمة تأسيس تكييف",
                      price: 1500,
                      tax: 15,
                      qty: 1,
                      discount: 0,
                    },
                    {
                      catalogId: "2",
                      name: "أداة تنظيف فلاتر",
                      price: 200,
                      tax: 15,
                      qty: 2,
                      discount: 0,
                    },
                  ],
                  type: "tax_invoice",
                  date: Date.now(),
                  technicianCommission: 0,
                  totalBeforeTax: 1652.17,
                  totalTax: 247.83,
                  totalDiscount: 0,
                  grandTotal: 1900,
                  status: "active",
                  notes: "",
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10 lg:col-span-2 md:col-span-2">
              <h4 className="font-bold text-sm text-center mb-2">
                الهوامش والخطوط
              </h4>
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">هامش أعلى</Label>
                  <Input
                    type="number"
                    value={formData.invoiceOffsets?.marginTop ?? 0}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        invoiceOffsets: {
                          ...formData.invoiceOffsets,
                          marginTop: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                    className="h-8 text-sm bg-black/20 px-1"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">هامش أسفل</Label>
                  <Input
                    type="number"
                    value={formData.invoiceOffsets?.marginBottom ?? 0}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        invoiceOffsets: {
                          ...formData.invoiceOffsets,
                          marginBottom: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                    className="h-8 text-sm bg-black/20 px-1"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">هامش يمين</Label>
                  <Input
                    type="number"
                    value={formData.invoiceOffsets?.marginRight ?? 0}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        invoiceOffsets: {
                          ...formData.invoiceOffsets,
                          marginRight: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                    className="h-8 text-sm bg-black/20 px-1"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">هامش يسار</Label>
                  <Input
                    type="number"
                    value={formData.invoiceOffsets?.marginLeft ?? 0}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        invoiceOffsets: {
                          ...formData.invoiceOffsets,
                          marginLeft: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                    className="h-8 text-sm bg-black/20 px-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">حجم الخط الأساسي</Label>
                  <Input
                    type="number"
                    value={formData.invoiceOffsets?.fontSizeBase ?? 12}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        invoiceOffsets: {
                          ...formData.invoiceOffsets,
                          fontSizeBase: parseInt(e.target.value) || 12,
                        },
                      })
                    }
                    className="h-8 text-sm bg-black/20 px-1"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">حجم خط العناوين</Label>
                  <Input
                    type="number"
                    value={formData.invoiceOffsets?.fontSizeHeader ?? 16}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        invoiceOffsets: {
                          ...formData.invoiceOffsets,
                          fontSizeHeader: parseInt(e.target.value) || 16,
                        },
                      })
                    }
                    className="h-8 text-sm bg-black/20 px-1"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10">
              <h4 className="font-bold text-sm text-center mb-2">
                معلومات المؤسسة (يمين)
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">يمين/يسار (X)</Label>
                  <Input
                    type="number"
                    value={formData.invoiceOffsets?.companyX || 0}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        invoiceOffsets: {
                          ...formData.invoiceOffsets,
                          companyX: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                    className="h-8 text-sm bg-black/20"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">أعلى/أسفل (Y)</Label>
                  <Input
                    type="number"
                    value={formData.invoiceOffsets?.companyY || 0}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        invoiceOffsets: {
                          ...formData.invoiceOffsets,
                          companyY: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                    className="h-8 text-sm bg-black/20"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10">
              <h4 className="font-bold text-sm text-center mb-2">
                الشعار (الوسط)
              </h4>
              <div className="grid grid-cols-3 gap-1">
                <div className="space-y-1">
                  <Label className="text-[10px]">يمين/يسار</Label>
                  <Input
                    type="number"
                    value={formData.invoiceOffsets?.logoX || 0}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        invoiceOffsets: {
                          ...formData.invoiceOffsets,
                          logoX: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                    className="h-8 text-xs bg-black/20 px-1"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">أعلى/أسفل</Label>
                  <Input
                    type="number"
                    value={formData.invoiceOffsets?.logoY || 0}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        invoiceOffsets: {
                          ...formData.invoiceOffsets,
                          logoY: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                    className="h-8 text-xs bg-black/20 px-1"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">الحجم</Label>
                  <Input
                    type="number"
                    value={formData.invoiceOffsets?.logoSize || 100}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        invoiceOffsets: {
                          ...formData.invoiceOffsets,
                          logoSize: parseInt(e.target.value) || 100,
                        },
                      })
                    }
                    className="h-8 text-xs bg-black/20 px-1"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10">
              <h4 className="font-bold text-sm text-center mb-2">
                معلومات العميل (يسار)
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">يمين/يسار (X)</Label>
                  <Input
                    type="number"
                    value={formData.invoiceOffsets?.customerX || 0}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        invoiceOffsets: {
                          ...formData.invoiceOffsets,
                          customerX: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                    className="h-8 text-sm bg-black/20"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">أعلى/أسفل (Y)</Label>
                  <Input
                    type="number"
                    value={formData.invoiceOffsets?.customerY || 0}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        invoiceOffsets: {
                          ...formData.invoiceOffsets,
                          customerY: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                    className="h-8 text-sm bg-black/20"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10">
              <h4 className="font-bold text-sm text-center mb-2">
                الباركود (QR Code)
              </h4>
              <div className="grid grid-cols-3 gap-1">
                <div className="space-y-1">
                  <Label className="text-[10px]">يمين/يسار</Label>
                  <Input
                    type="number"
                    value={formData.invoiceOffsets?.qrX || 0}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        invoiceOffsets: {
                          ...formData.invoiceOffsets,
                          qrX: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                    className="h-8 text-xs bg-black/20 px-1"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">أعلى/أسفل</Label>
                  <Input
                    type="number"
                    value={formData.invoiceOffsets?.qrY || 0}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        invoiceOffsets: {
                          ...formData.invoiceOffsets,
                          qrY: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                    className="h-8 text-xs bg-black/20 px-1"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">الحجم</Label>
                  <Input
                    type="number"
                    value={formData.invoiceOffsets?.qrSize || 100}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        invoiceOffsets: {
                          ...formData.invoiceOffsets,
                          qrSize: parseInt(e.target.value) || 100,
                        },
                      })
                    }
                    className="h-8 text-xs bg-black/20 px-1"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2 bg-white/5 p-3 rounded-lg border border-white/10">
              <h4 className="font-bold text-sm text-center mb-2">
                التوقيعات (أسفل)
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">يمين/يسار (X)</Label>
                  <Input
                    type="number"
                    value={formData.invoiceOffsets?.footerX || 0}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        invoiceOffsets: {
                          ...formData.invoiceOffsets,
                          footerX: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                    className="h-8 text-sm bg-black/20"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">أعلى/أسفل (Y)</Label>
                  <Input
                    type="number"
                    value={formData.invoiceOffsets?.footerY || 0}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        invoiceOffsets: {
                          ...formData.invoiceOffsets,
                          footerY: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                    className="h-8 text-sm bg-black/20"
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="security" className="space-y-6">
      <Card className="glass border-white/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-red-400" />
            الأمان والوصول وإعدادات المظهر
          </CardTitle>
          <CardDescription>
            التحكم في كلمة المرور، مظهر التطبيق (داكن/فاتح)، وحماية القوائم
            السرية بكلمة المرور.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* كلمة مرور المسؤول */}
            <div className="space-y-2 bg-white/5 p-4 rounded-lg border border-white/10 flex flex-col justify-between">
              <div>
                <Label className="text-white font-medium text-xs">
                  كلمة مرور المسؤول (Admin Password)
                </Label>
                <p className="text-[10px] text-white/45 mt-0.5">
                  مطلوبة لتأكيد عمليات الحذف أو استعراض البيانات الحساسة.
                </p>
              </div>
              <Input
                type="password"
                value={formData.adminPassword}
                onChange={(e) =>
                  setFormData({ ...formData, adminPassword: e.target.value })
                }
                className="bg-black/20 border-white/10 h-10 text-sm mt-2"
              />
            </div>

            {/* إعدادات المظهر */}
            <div className="space-y-2 bg-white/5 p-4 rounded-lg border border-white/10 flex flex-col justify-between">
              <div>
                <Label className="text-white font-medium text-xs">
                  مظهر واجهة النظام (Theme)
                </Label>
                <p className="text-[10px] text-white/45 mt-0.5">
                  اختر نمط الألوان المفضل لديك والملائم لشاشتك.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Button
                  variant={formData.theme === "dark" ? "default" : "outline"}
                  className={`h-10 text-xs font-bold transition-all border ${
                    formData.theme === "dark"
                      ? "bg-blue-600 text-white border-blue-600 shadow"
                      : "bg-transparent border-white/10 text-white/75 hover:bg-white/5"
                  }`}
                  onClick={() => setFormData({ ...formData, theme: "dark" })}
                >
                  أسود (داكن)
                </Button>
                <Button
                  variant={formData.theme === "light" ? "default" : "outline"}
                  className={`h-10 text-xs font-bold transition-all border ${
                    formData.theme === "light"
                      ? "bg-blue-600 text-white border-blue-600 shadow"
                      : "bg-transparent border-white/10 text-white/75 hover:bg-white/5"
                  }`}
                  style={formData.theme === "light" ? { color: "#ffffff" } : {}}
                  onClick={() => setFormData({ ...formData, theme: "light" })}
                >
                  أبيض (فاتح)
                </Button>
              </div>
            </div>

            {/* إخفاء القوائم */}
            <div className="space-y-2 bg-white/5 p-4 rounded-lg border border-white/10 col-span-1 md:col-span-2">
              <Label className="text-white font-bold text-xs flex items-center gap-1">
                <EyeOff className="h-4 w-4 text-orange-400" /> إخفاء القوائم
                وتشفير الوصول (حماية بكلمة مرور)
              </Label>
              <p className="text-[10px] text-white/50 mb-3">
                القوائم المحددة أدناه لا يمكن فتحها في المبيعات أو الكاشير إلا
                بإدخال رمز المسؤول الموثق.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { id: "dashboard", label: "لوحة التحكم" },
                  { id: "pos", label: "نقاط البيع" },
                  { id: "urgent_orders", label: "الطلبات" },
                  { id: "crm", label: "إدارة العملاء" },
                  { id: "appointments", label: "مواعيد وطلبات" },
                  { id: "purchases", label: "المشتريات" },
                  { id: "reports", label: "التقارير" },
                  { id: "catalog", label: "الكتالوج" },
                  { id: "history", label: "السجل" },
                ].map((menu) => (
                  <div
                    key={menu.id}
                    className="flex items-center space-x-2 space-x-reverse bg-black/30 p-2.5 rounded border border-white/5 hover:border-white/10 transition-colors"
                  >
                    <input
                      type="checkbox"
                      id={`hide-menu-${menu.id}`}
                      checked={formData.hiddenMenus.includes(menu.id)}
                      onChange={(e) => {
                        if (!e.target.checked) {
                          setMenuToRestore(menu.id);
                          setPasswordAttempt("");
                          setPasswordDialogOpen(true);
                        } else {
                          const hidden = [...formData.hiddenMenus, menu.id];
                          const newSettings = {
                            ...formData,
                            hiddenMenus: hidden,
                          };
                          setFormData(newSettings);
                          onSave(newSettings);
                        }
                      }}
                      className="h-4 w-4 rounded border-white/15 text-blue-600 focus:ring-blue-600 bg-black/20 cursor-pointer"
                    />
                    <Label
                      htmlFor={`hide-menu-${menu.id}`}
                      className="text-xs text-white/80 cursor-pointer select-none"
                    >
                      {menu.label}
                    </Label>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-orange-400 mt-2">
                * احذر: إذا قمت بإخفاء قائمة لا يمكنك إعادتها إلا برمز المرور
                الصحيح، كما أن قائمة "الإعدادات" غير قابلة للإخفاء.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass border-white/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-indigo-400" />
            النسخ الاحتياطي واستيراد/تصدير البيانات
          </CardTitle>
          <CardDescription>
            تصدير واستيراد البيانات الشاملة أو التلقائية لحماية سجلات الشركة
            والفواتير من الفقدان.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* النسخ الاحتياطي JSON */}
            <div className="space-y-2 bg-white/5 p-4 rounded-lg border border-white/10 flex flex-col justify-between">
              <div>
                <Label className="text-white font-medium text-xs">
                  النسخ الاحتياطي الشامل (JSON)
                </Label>
                <p className="text-[10px] text-white/45 mt-0.5">
                  تصدير كامل لقاعدة بيانات التطبيق أو استعادتها.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Button
                  onClick={exportToJson}
                  className="bg-blue-600 hover:bg-blue-500 text-xs font-bold h-10"
                >
                  <Download className="ml-1 h-3.5 w-3.5" /> تحميل نسخة
                </Button>
                <div className="relative">
                  <Input
                    type="file"
                    className="hidden"
                    id="import-json"
                    accept=".json"
                    onChange={importFromJson}
                  />
                  <Button
                    variant="outline"
                    className="w-full border-blue-600/30 text-blue-400 hover:bg-blue-600/20 text-xs font-bold h-10"
                    onClick={() =>
                      document.getElementById("import-json")?.click()
                    }
                  >
                    <Upload className="ml-1 h-3.5 w-3.5" /> استعادة
                  </Button>
                </div>
              </div>
            </div>

            {/* تصدير Excel */}
            <div className="space-y-2 bg-white/5 p-4 rounded-lg border border-white/10 flex flex-col justify-between">
              <div>
                <Label className="text-white font-medium text-xs">
                  تصدير واستعادة الجداول (Excel)
                </Label>
                <p className="text-[10px] text-white/45 mt-0.5">
                  استيراد المنتجات والعملاء بواسطة جداول إكسل.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Button
                  onClick={exportToExcel}
                  className="bg-green-600 hover:bg-green-500 text-xs font-bold h-10"
                >
                  <Download className="ml-1 h-3.5 w-3.5" /> تصدير Excel
                </Button>
                <div className="relative">
                  <Input
                    type="file"
                    className="hidden"
                    id="import-excel"
                    accept=".xlsx"
                    onChange={handleImport}
                  />
                  <Button
                    variant="outline"
                    className="w-full border-white/10 hover:bg-white/5 text-xs font-bold h-10"
                    onClick={() =>
                      document.getElementById("import-excel")?.click()
                    }
                  >
                    <Upload className="ml-1 h-3.5 w-3.5" /> استعادة Excel
                  </Button>
                </div>
              </div>
            </div>

            {/* النسخ الاحتياطي السحابي Google Drive */}
            <div className="space-y-2 bg-white/5 p-4 rounded-lg border border-white/10 flex flex-col justify-between col-span-1 md:col-span-2 lg:col-span-1">
              <div>
                <Label className="text-white font-medium text-xs flex items-center gap-1.5">
                  <Cloud className="h-4 w-4 text-orange-400" />
                  النسخ الاحتياطي السحابي (Google Drive)
                </Label>
                <p className="text-[10px] text-white/45 mt-0.5">
                  حفظ سجلاتك ومواعيدك تلقائياً (كل أسبوعين) أو يدوياً على مساحتك
                  الشخصية في Google Drive لاستعادتها بأي وقت.
                </p>
              </div>

              {googleUser ? (
                <div className="space-y-3 mt-3">
                  <div className="bg-black/30 p-2.5 rounded border border-white/5 flex flex-col gap-1">
                    <span className="text-[10px] text-white/40 font-medium">
                      الحساب المتصل:
                    </span>
                    <span className="text-xs text-blue-400 font-bold truncate">
                      {googleUser.email}
                    </span>
                    {cloudBackupFile && (
                      <div className="flex flex-col gap-0.5 mt-1 border-t border-white/5 pt-1">
                        <span className="text-[9px] text-white/40">
                          آخر نسخة سحابية من النظام:
                        </span>
                        <span className="text-[10px] text-green-400 font-bold font-mono">
                          {new Date(
                            cloudBackupFile.modifiedTime,
                          ).toLocaleString("ar")}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      onClick={() => triggerGoogleBackup()}
                      disabled={isSyncing}
                      className="bg-indigo-600 hover:bg-indigo-500 text-xs font-bold h-10 w-full"
                    >
                      {isSyncing ? (
                        <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Cloud className="ml-1 h-3.5 w-3.5" />
                      )}
                      نسخ احتياطي الآن
                    </Button>

                    {cloudBackupFile && (
                      <Button
                        variant="outline"
                        onClick={handleOpenRestoreDialog}
                        disabled={isSyncing}
                        className="border-green-600/30 text-green-400 hover:bg-green-600/20 text-xs font-bold h-10 w-full"
                      >
                        {isSyncing ? (
                          <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Upload className="ml-1 h-3.5 w-3.5" />
                        )}
                        استعادة من Google Drive
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      onClick={handleGoogleSignOut}
                      className="text-[10px] text-red-400 hover:text-red-300 hover:bg-red-950/20 h-8 mt-1"
                    >
                      فصل حساب Google
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-col items-center gap-3">
                  <button
                    onClick={handleGoogleSignIn}
                    disabled={isSyncing}
                    className="flex items-center justify-center gap-2 bg-white text-gray-800 hover:bg-gray-100 font-bold py-2.5 px-4 rounded-lg shadow-md transition-all text-xs w-full cursor-pointer disabled:opacity-50"
                  >
                    {isSyncing ? (
                      <Loader2 className="h-4 w-4 animate-spin text-gray-600" />
                    ) : (
                      <svg
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 48 48"
                        className="h-4 w-4"
                      >
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        ></path>
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        ></path>
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        ></path>
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        ></path>
                      </svg>
                    )}
                    <span>ربط حساب Google Drive</span>
                  </button>
                  <div className="text-[9px] text-yellow-400 mt-1 text-center font-bold">
                    أثناء المرحلة التطويرية: إذا ظهر لك خطأ "النطاق غير مصرح به
                    Error 400" يرجى إضافة هذا الدومين:
                    <br />
                    <span className="font-mono text-white select-all">
                      {" "}
                      ais-dev-wne3om3wze57f2udjjak7m-166478769110.europe-west1.run.app{" "}
                    </span>
                    <br />
                    في إعدادات أمان (Firebase Authentication - Settings -
                    Authorized domains)
                  </div>
                  <p className="text-[9px] text-white/30 text-center">
                    * سيتم أخذ نسخة احتياطية فورية فور ربط وحفظ الحساب.
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="templates" className="space-y-6">
      <Card className="glass border-white/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-400" />
            قوالب رسائل واتساب
          </CardTitle>
          <CardDescription>
            إنشاء قوالب جاهزة للتواصل السريع مع العملاء (استخدم [الاسم] لاسم
            العميل، و [تاريخ_الموعد] لتاريخ الصيانة).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(formData.whatsappTemplates || []).map((template) => (
              <div
                key={template.id}
                className="bg-white/5 p-4 rounded border border-white/10 space-y-3 relative"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 left-2 h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                  onClick={() => deleteTemplate(template.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <div>
                  <Label>اسم القالب</Label>
                  <Input
                    value={template.name}
                    onChange={(e) =>
                      updateTemplate(template.id, "name", e.target.value)
                    }
                    className="bg-black/20 border-white/10 mt-1"
                  />
                </div>
                <div>
                  <Label>نص الرسالة</Label>
                  <Textarea
                    value={template.content}
                    onChange={(e) =>
                      updateTemplate(template.id, "content", e.target.value)
                    }
                    className="bg-black/20 border-white/10 h-24 mt-1"
                  />
                </div>
              </div>
            ))}
            <div
              className="bg-white/[0.02] border-2 border-dashed border-white/10 rounded flex flex-col items-center justify-center text-white/40 hover:text-white/60 hover:bg-white/5 cursor-pointer transition-all min-h-[200px]"
              onClick={handleAddTemplate}
            >
              <Plus className="h-8 w-8 mb-2" />
              <span>إضافة قالب جديد</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass border-white/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-pink-400" />
            إدارة اهتمامات العملاء الأساسية
          </CardTitle>
          <CardDescription>
            أضف الاهتمامات التي תظهر عند إضافة عميل محتمل ليسهل تصفيتها.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-2">
              <Input
                placeholder="أدخل اسم الاهتمام (مثلاً: تركيب كاميرات)..."
                id="new-interest-name"
                className="bg-white/5 border-white/10 flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const nameEl = document.getElementById(
                      "new-interest-name",
                    ) as HTMLInputElement;
                    const name = nameEl?.value.trim();
                    if (name) {
                      setFormData({
                        ...formData,
                        savedInterests: [
                          ...(formData.savedInterests || [
                            "تركيب أعداد",
                            "تركيب جهاز تحلية",
                            "تركيب صيانة",
                            "تغيير فلاتر",
                          ]),
                          name,
                        ],
                      });
                      nameEl.value = "";
                    }
                  }
                }}
              />
              <Button
                onClick={() => {
                  const nameEl = document.getElementById(
                    "new-interest-name",
                  ) as HTMLInputElement;
                  const name = nameEl?.value.trim();
                  if (name) {
                    setFormData({
                      ...formData,
                      savedInterests: [
                        ...(formData.savedInterests || [
                          "تركيب أعداد",
                          "تركيب جهاز تحلية",
                          "تركيب صيانة",
                          "تغيير فلاتر",
                        ]),
                        name,
                      ],
                    });
                    nameEl.value = "";
                  }
                }}
                className="bg-pink-600 hover:bg-pink-500 text-white"
              >
                <Plus className="h-4 w-4 ml-2" />
                إضافة اهتمام
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                formData.savedInterests || [
                  "تركيب أعداد",
                  "تركيب جهاز تحلية",
                  "تركيب صيانة",
                  "تغيير فلاتر",
                ]
              ).map((interest, idx) => (
                <div
                  key={idx}
                  className="bg-white/10 px-3 py-1.5 rounded-lg flex items-center justify-between text-sm gap-2"
                >
                  <span className="font-bold">{interest}</span>
                  <button
                    onClick={() => {
                      setFormData({
                        ...formData,
                        savedInterests: (
                          formData.savedInterests || [
                            "تركيب أعداد",
                            "تركيب جهاز تحلية",
                            "تركيب صيانة",
                            "تغيير فلاتر",
                          ]
                        ).filter((i) => i !== interest),
                      });
                    }}
                    className="text-white/50 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="users" className="space-y-6">
        <UsersView settings={settings} setSettings={onSave} />

      <Card className="glass border-white/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-yellow-400" />
            إدارة الفنيين (النظام القديم)
          </CardTitle>
          <CardDescription>
            أضف أسماء الفنيين لإسناد الطلبات ومتابعة التقييمات والعمولات.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <div className="flex flex-col md:flex-row gap-2">
                <Input
                  placeholder="أدخل اسم الفني..."
                  id="new-technician-name"
                  className="bg-white/5 border-white/10 flex-1"
                />
                <Input
                  placeholder="أدخل رقم جوال الفني..."
                  id="new-technician-phone"
                  className="bg-white/5 border-white/10 flex-1"
                />
              </div>
              <div className="flex flex-col md:flex-row gap-2">
                <Input
                  placeholder="اسم المستخدم للدخول..."
                  id="new-technician-username"
                  className="bg-white/5 border-white/10 flex-1"
                />
                <Input
                  placeholder="كلمة المرور..."
                  id="new-technician-password"
                  className="bg-white/5 border-white/10 flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const nameEl = document.getElementById("new-technician-name") as HTMLInputElement;
                      const phoneEl = document.getElementById("new-technician-phone") as HTMLInputElement;
                      const userEl = document.getElementById("new-technician-username") as HTMLInputElement;
                      const passEl = document.getElementById("new-technician-password") as HTMLInputElement;
                      
                      const name = nameEl?.value.trim();
                      const phone = phoneEl?.value.trim();
                      const username = userEl?.value.trim();
                      const password = passEl?.value.trim();
                      
                      if (name && phone && username && password) {
                        const newTech: any = {
                          id: Math.random().toString(36).substr(2, 9),
                          name,
                          phone,
                          username,
                          password,
                          permissions: {
                            canLogin: true,
                            canAcceptTask: true,
                            canCompleteTask: true,
                            canInvoice: true
                          }
                        };
                        setFormData({
                          ...formData,
                          technicians: [...(formData.technicians || []), newTech],
                        });
                        nameEl.value = "";
                        phoneEl.value = "";
                        userEl.value = "";
                        passEl.value = "";
                      } else {
                        toast.error("الرجاء إدخال اسم، رقم، اسم مستخدم وكلمة مرور للفني");
                      }
                    }
                  }}
                />
                <Button
                  onClick={() => {
                      const nameEl = document.getElementById("new-technician-name") as HTMLInputElement;
                      const phoneEl = document.getElementById("new-technician-phone") as HTMLInputElement;
                      const userEl = document.getElementById("new-technician-username") as HTMLInputElement;
                      const passEl = document.getElementById("new-technician-password") as HTMLInputElement;
                      
                      const name = nameEl?.value.trim();
                      const phone = phoneEl?.value.trim();
                      const username = userEl?.value.trim();
                      const password = passEl?.value.trim();
                      
                    if (name && phone && username && password) {
                      const newTech: any = {
                        id: Math.random().toString(36).substr(2, 9),
                        name,
                        phone,
                        username,
                        password,
                        permissions: {
                          canLogin: true,
                          canAcceptTask: true,
                          canCompleteTask: true,
                          canInvoice: true
                        }
                      };
                      setFormData({
                        ...formData,
                        technicians: [...(formData.technicians || []), newTech],
                      });
                      nameEl.value = "";
                      phoneEl.value = "";
                      userEl.value = "";
                      passEl.value = "";
                    } else {
                      toast.error("الرجاء إدخال بيانات الفني كاملة");
                    }
                  }}
                  className="bg-yellow-600 hover:bg-yellow-500 text-white shrink-0"
                >
                  <Plus className="h-4 w-4 ml-2" />
                  إضافة فني
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(formData.technicians || []).map((tech: any, idx) => {
                const tName = typeof tech === "string" ? tech : tech.name;
                const tPhone = typeof tech === "string" ? "" : tech.phone;
                const tBalance = typeof tech === "string" ? 0 : (tech.balance || 0);
                return (
                  <div
                    key={typeof tech === "string" ? tName : tech.id}
                    className="bg-white/10 p-3 rounded-lg flex items-center justify-between text-sm"
                  >
                    <div>
                      <div className="font-bold">{tName}</div>
                      {tPhone && (
                        <div className="text-white/50 text-xs">{tPhone}</div>
                      )}
                      {tBalance > 0 && (
                        <div className="text-green-400 text-xs mt-1 font-bold">رصيد العهدة: {tBalance} ر.س</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setViewTechPermissions(typeof tech === "string" ? tech : tech.id)}
                        className="text-white/50 hover:text-green-400 p-2"
                        title="الصلاحيات"
                      >
                        <Shield className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setViewTechStock(tName)}
                        className="text-white/50 hover:text-blue-400 p-2"
                        title="عرض المخزون"
                      >
                        <Package className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setFormData({
                            ...formData,
                            technicians: (formData.technicians || []).filter(
                              (t) => t !== tech,
                            ),
                          });
                        }}
                        className="text-white/50 hover:text-red-400 p-2"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {(!formData.technicians || formData.technicians.length === 0) && (
                <p className="text-sm text-white/40 col-span-2">
                  لا يوجد فنيين حالياً
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      </TabsContent>
      </Tabs>

      <div className="w-full flex justify-between items-center bg-white/5 border border-white/10 rounded-xl p-4">
        <div>
          <h3 className="font-bold text-red-400">
            تهيئة النظام (إعادة ضبط المصنع)
          </h3>
          <p className="text-xs text-white/50">
            سيتم مسح جميع البيانات والإعدادات نهائياً
          </p>
        </div>
        <Button
          onClick={() => setShowFactoryResetAuth(true)}
          className="bg-red-900/50 hover:bg-red-600 text-white border border-red-500/20"
        >
          حذف جميع الإعدادات والبيانات
        </Button>
      </div>

      <div className="w-full flex justify-end">
        <Button
          onClick={handleSave}
          className="bg-purple-600 hover:bg-purple-500 w-full md:w-auto px-10 h-12 text-lg"
        >
          <Save className="ml-2 h-5 w-5" /> حفظ كافة التعديلات
        </Button>
      </div>

      <PasswordDialog
        open={showFactoryResetAuth}
        onOpenChange={setShowFactoryResetAuth}
        adminPassword={settings.adminPassword}
        isFactoryReset={true}
        onSuccess={() => {
          localStorage.clear();
          window.location.reload();
        }}
        title="تأكيد حذف البيانات نهائياً"
        description="الرجاء إدخال كلمة مرور المسؤول لتأكيد حذف جميع البيانات"
      />

      <Dialog
        open={!!viewTechStock}
        onOpenChange={() => setViewTechStock(null)}
      >
        <DialogContent className="glass border-white/10 text-white max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-xl text-blue-400">
              بضاعة الفني: {viewTechStock}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto rounded-lg border border-white/5 bg-black/20 p-4 mt-4 space-y-2">
            {(() => {
              const invs = storage.getTechInventory
                ? storage.getTechInventory()
                : [];
              const cats = storage.getCatalog ? storage.getCatalog() : [];
              const techInv = invs.find(
                (i: any) => i.technicianName === viewTechStock,
              );
              const items = techInv ? techInv.items : [];

              if (items.length === 0) {
                return (
                  <div className="text-center text-white/50 py-8">
                    لا يوجد بضاعة في عهدة الفني
                  </div>
                );
              }

              return items.map((item: any) => {
                const cItem = cats.find((c: any) => c.id === item.catalogId);
                return (
                  <div
                    key={item.catalogId}
                    className="flex justify-between items-center p-3 bg-white/5 border border-white/10 rounded-lg"
                  >
                    <span className="font-bold">
                      {cItem ? cItem.name : "صنف غير معروف"}
                    </span>
                    <span
                      className={
                        item.qty > 0
                          ? "text-green-400 font-bold"
                          : "text-red-400 font-bold"
                      }
                    >
                      {item.qty} {cItem?.type === "product" ? "حبة" : "خدمة"}
                    </span>
                  </div>
                );
              });
            })()}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setViewTechStock(null)}
              className="border-white/10 mt-4"
            >
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!viewTechPermissions}
        onOpenChange={() => setViewTechPermissions(null)}
      >
        <DialogContent className="glass border-white/10 text-white max-w-sm overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-xl text-green-400">
              صلاحيات الفني
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 rounded-lg border border-white/5 bg-black/20 p-4 mt-4 space-y-4">
            {(() => {
              const tech = formData.technicians?.find((t) => typeof t === "object" && t.id === viewTechPermissions);
              if (!tech) return <p>لم يتم العثور على الفني</p>;
              
              const permissions = tech.permissions || {
                canLogin: true, canAcceptTask: true, canCompleteTask: true, canInvoice: true
              };

              const togglePerm = (key: string) => {
                const newTechs = formData.technicians?.map(t => {
                  if (typeof t === "object" && t.id === viewTechPermissions) {
                    return { ...t, permissions: { ...permissions, [key]: !permissions[key as keyof typeof permissions] } };
                  }
                  return t;
                });
                setFormData({ ...formData, technicians: newTechs });
              };

              return (
                <div className="space-y-3 font-semibold text-sm">
                  <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-white/5 rounded transition-colors">
                    <input type="checkbox" checked={permissions.canLogin !== false} onChange={() => togglePerm('canLogin')} className="w-4 h-4 accent-green-500 rounded border-white/20" />
                    <span>تسجيل الدخول للنظام</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-white/5 rounded transition-colors">
                    <input type="checkbox" checked={permissions.canAcceptTask !== false} onChange={() => togglePerm('canAcceptTask')} className="w-4 h-4 accent-green-500 rounded border-white/20" />
                    <span>رؤية واستلام المهام</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-white/5 rounded transition-colors">
                    <input type="checkbox" checked={permissions.canCompleteTask !== false} onChange={() => togglePerm('canCompleteTask')} className="w-4 h-4 accent-green-500 rounded border-white/20" />
                    <span>إتمام المهام</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-white/5 rounded transition-colors">
                    <input type="checkbox" checked={permissions.canInvoice !== false} onChange={() => togglePerm('canInvoice')} className="w-4 h-4 accent-green-500 rounded border-white/20" />
                    <span>إنشاء فواتير حرة</span>
                  </label>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setViewTechPermissions(null)}
              className="border-white/10 mt-4"
            >
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="glass border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>استعادة القائمة</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <p className="text-sm text-white/70">
              لاستعادة هذه القائمة يرجى كتابة رمز المرور الخاص بك:
            </p>
            <Input
              type="password"
              value={passwordAttempt}
              onChange={(e) => setPasswordAttempt(e.target.value)}
              className="bg-white/5 border-white/10"
              autoFocus
            />
          </div>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="border-white/10"
              onClick={() => setPasswordDialogOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-500 text-white"
              onClick={() => {
                if (passwordAttempt === settings.adminPassword) {
                  const hidden = formData.hiddenMenus.filter(
                    (m) => m !== menuToRestore,
                  );
                  const newSettings = { ...formData, hiddenMenus: hidden };
                  setFormData(newSettings);
                  onSave(newSettings);
                  setPasswordDialogOpen(false);
                  setMenuToRestore(null);
                  setPasswordAttempt("");
                } else {
                  toast.error("رمز المرور خاطئ!");
                }
              }}
            >
              تأكيد واستعادة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteDataDialogOpen}
        onOpenChange={setDeleteDataDialogOpen}
      >
        <DialogContent className="glass border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-400">
              مسح جميع البيانات
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <p className="text-sm text-white/70">
              يرجى كتابة رمز المرور الخاص بك لتأكيد مسح كافة البيانات بشكل
              نهائي:
            </p>
            <Input
              type="password"
              value={deleteDataPasswordAttempt}
              onChange={(e) => setDeleteDataPasswordAttempt(e.target.value)}
              className="bg-white/5 border-white/10 text-white focus:border-red-500"
              autoFocus
            />
          </div>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="border-white/10"
              onClick={() => {
                setDeleteDataDialogOpen(false);
                setDeleteDataPasswordAttempt("");
              }}
            >
              إلغاء
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (deleteDataPasswordAttempt === "Glal@123123") {
                  localStorage.clear();
                  toast.success("تم مسح جميع البيانات بنجاح");
                  setDeleteDataDialogOpen(false);
                  setTimeout(() => window.location.reload(), 1500);
                } else {
                  toast.error("رمز المرور خاطئ!");
                }
              }}
            >
              تأكيد المسح النهائي
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* حوار استعادة النسخ الاحتياطية من Google Drive */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent className="glass border-white/10 text-white max-w-lg w-[95vw] rounded-xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right text-base font-bold text-white border-b border-white/5 pb-2">
              <Cloud className="h-5 w-5 text-orange-400" />
              استعادة النسخة الاحتياطية من Google Drive
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <p className="text-[11px] text-white/60 text-right leading-relaxed">
              تم العثور على النسخ الاحتياطية التالية الخاصة بنظام كاشير برو
              (Kaisher Pro) في حسابك. يرجى اختيار النسخة التي تود استعادتها:
            </p>

            {isLoadingBackups ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-orange-400 animate-spin" />
                <span className="text-xs text-white/50">
                  جاري فحص وتنزيل قائمة النسخ السحابية...
                </span>
              </div>
            ) : availableBackups.length === 0 ? (
              <div className="text-center py-8 text-white/40 text-xs text-right">
                لم يتم العثور على أي ملفات احتياطية باسم "Kaisher Pro" في مساحتك
                السحابية. يمكنك تجربة أخذ نسخة يدوية أولاً.
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {availableBackups.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all gap-4"
                  >
                    <div className="flex flex-col text-right gap-1 min-w-0 flex-1">
                      <span
                        className="text-xs font-bold text-white truncate"
                        dir="ltr"
                      >
                        {file.name.replace(".json", "")}
                      </span>
                      <span className="text-[10px] text-white/40">
                        تاريخ التعديل:{" "}
                        {new Date(file.modifiedTime).toLocaleString("ar")}
                      </span>
                    </div>

                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-500 text-white font-bold text-xs h-8 px-3 shrink-0 cursor-pointer"
                      onClick={() => handleSelectBackup(file)}
                    >
                      استعادة النسخة
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="mt-2 border-t border-white/5 pt-3 flex justify-end gap-2">
            <Button
              variant="outline"
              className="border-white/10 hover:bg-white/5 text-xs h-9 px-4 text-white cursor-pointer"
              onClick={() => setRestoreDialogOpen(false)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
