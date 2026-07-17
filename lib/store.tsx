"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { storage } from "./storage";
import { translate, TranslationKey } from "./i18n";
import { applyBackupPayload, isLocalDataFresh } from "./backupPayload";
import { supabase } from "./supabaseClient";
import { buildAppDataPayload } from "./modules/appData/payload";
import { hashPin, isPinHashed, verifyPin, getLockoutRemainingMinutes, recordFailedLogin, clearFailedLogins } from "./security";
import {
  AppSettings, Customer, CatalogItem, Order, Vendor, PurchaseInvoice, Expense, StaffUser, ServiceOrder,
  TechInventoryItem, TechInventoryLog, TechFinancialLog, TechLocation, CustomerPayment, SystemReminder, DEFAULT_SETTINGS, uid,
} from "./types";

interface AppState {
  ready: boolean;
  activeUser: StaffUser | null;
  activeBranch: string;
  customers: Customer[];
  catalog: CatalogItem[];
  orders: Order[];
  vendors: Vendor[];
  purchases: PurchaseInvoice[];
  expenses: Expense[];
  settings: AppSettings;
  users: StaffUser[];
  urgentOrders: ServiceOrder[];
  appointments: ServiceOrder[];
  techInventory: TechInventoryItem[];
  techInventoryLogs: TechInventoryLog[];
  techFinancialLogs: TechFinancialLog[];
  techLocations: Record<string, TechLocation>;
  customerPayments: CustomerPayment[];
  reminders: SystemReminder[];
  cloudSyncMessage: string;
  isSyncing: boolean;

  login: (phone: string, pin: string) => boolean;
  getLoginLockoutMinutes: (phone: string) => number;
  loginWithVerifiedPhone: (phone: string, createAsAdminIfMissing: boolean) => boolean;
  logout: () => void;
  updateActiveUser: (user: StaffUser) => void;
  changeOwnPin: (currentPin: string, newPin: string) => { ok: boolean; messageKey: TranslationKey };

  setCustomers: (v: Customer[]) => void;
  setCatalog: (v: CatalogItem[]) => void;
  setOrders: (v: Order[]) => void;
  setVendors: (v: Vendor[]) => void;
  setPurchases: (v: PurchaseInvoice[]) => void;
  setExpenses: (v: Expense[]) => void;
  setSettings: (v: AppSettings) => void;
  setUsers: (v: StaffUser[]) => void;
  setUrgentOrders: (v: ServiceOrder[]) => void;
  setAppointments: (v: ServiceOrder[]) => void;
  setTechInventory: (v: TechInventoryItem[]) => void;
  setTechInventoryLogs: (v: TechInventoryLog[]) => void;
  setTechFinancialLogs: (v: TechFinancialLog[]) => void;
  setTechLocations: (v: Record<string, TechLocation>) => void;
  setCustomerPayments: (v: CustomerPayment[]) => void;
  setReminders: (v: SystemReminder[]) => void;
  saveTechLocation: (techName: string, loc: { lat: number; lng: number }) => void;
  setActiveBranch: (branch: string) => void;
}

const AppContext = createContext<AppState | null>(null);

// ─── معرّف فريد لهذا الجهاز / نافذة المتصفح ──────────────────────────────
// نستخدمه لتجاهل التغييرات التي أرسلناها نحن أنفسنا عبر Realtime
const DEVICE_ID = typeof crypto !== "undefined"
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeUser, setActiveUser] = useState<StaffUser | null>(null);
  const [activeBranch, setActiveBranchState] = useState<string>("");
  const [customers, setCustomersState] = useState<Customer[]>([]);
  const [catalog, setCatalogState] = useState<CatalogItem[]>([]);
  const [orders, setOrdersState] = useState<Order[]>([]);
  const [vendors, setVendorsState] = useState<Vendor[]>([]);
  const [purchases, setPurchasesState] = useState<PurchaseInvoice[]>([]);
  const [expenses, setExpensesState] = useState<Expense[]>([]);
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [users, setUsersState] = useState<StaffUser[]>([]);
  const [urgentOrders, setUrgentOrdersState] = useState<ServiceOrder[]>([]);
  const [appointments, setAppointmentsState] = useState<ServiceOrder[]>([]);
  const [techInventory, setTechInventoryState] = useState<TechInventoryItem[]>([]);
  const [techInventoryLogs, setTechInventoryLogsState] = useState<TechInventoryLog[]>([]);
  const [techFinancialLogs, setTechFinancialLogsState] = useState<TechFinancialLog[]>([]);
  const [techLocations, setTechLocationsState] = useState<Record<string, TechLocation>>({});
  const [customerPayments, setCustomerPaymentsState] = useState<CustomerPayment[]>([]);
  const [reminders, setRemindersState] = useState<SystemReminder[]>([]);
  const [cloudSyncMessage, setCloudSyncMessage] = useState("");

  // ─── Refs داخلية ──────────────────────────────────────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isApplyingRemoteRef = useRef(false); // منع حلقة لا نهائية

  // ─── تحميل كل البيانات من localStorage إلى React state ──────────────────
  const reloadAllFromStorage = useCallback(() => {
    setCustomersState(storage.getCustomers());
    setCatalogState(storage.getCatalog());
    setOrdersState(storage.getOrders());
    setVendorsState(storage.getVendors());
    setPurchasesState(storage.getPurchases());
    setExpensesState(storage.getExpenses());
    setSettingsState(storage.getSettings());
    setUsersState(storage.getUsers());
    setUrgentOrdersState(storage.getUrgentOrders());
    setAppointmentsState(storage.getAppointments());
    setTechInventoryState(storage.getTechInventory());
    setTechInventoryLogsState(storage.getTechInventoryLogs());
    setTechFinancialLogsState(storage.getTechFinancialLogs());
    setTechLocationsState(storage.getTechLocations());
    setCustomerPaymentsState(storage.getCustomerPayments());
    setRemindersState(storage.getReminders());
  }, []);

  // ─── بناء payload كامل من localStorage ───────────────────────────────────
  const buildPayload = useCallback(() => buildAppDataPayload(DEVICE_ID), []);

  // ─── حفظ فوري إلى Supabase عبر /api/backup/save ─────────────────────────
  const pushToCloud = useCallback(async (payload: object) => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/backup/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setCloudSyncMessage("✓ محفوظ في السحابة");
        setTimeout(() => setCloudSyncMessage(""), 2500);
      } else {
        const data = await res.json().catch(() => ({}));
        console.warn("Cloud save failed:", res.status, data?.error || "");
        if (res.status === 501 || data?.configured === false) {
          setCloudSyncMessage("ℹ محفوظ محليًا فقط");
        } else if (data?.setupRequired) {
          setCloudSyncMessage("⚠ محفوظ محليًا فقط: إعداد Supabase ناقص");
        } else {
          setCloudSyncMessage("⚠ محفوظ محليًا فقط: تعذر الحفظ السحابي");
        }
        setTimeout(() => setCloudSyncMessage(""), 5000);
      }
    } catch (e) {
      console.warn("Cloud save error:", e);
      setCloudSyncMessage("ℹ محفوظ محليًا فقط");
      setTimeout(() => setCloudSyncMessage(""), 5000);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // ─── جدولة حفظ مؤجّل (debounced 800ms) ──────────────────────────────────
  // نجمع التغييرات المتسارعة (مثل الكتابة السريعة) ونرسل دفعة واحدة
  const scheduleCloudSync = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (!isApplyingRemoteRef.current) {
        pushToCloud(buildPayload());
      }
    }, 800);
  }, [buildPayload, pushToCloud]);

  // ─── تطبيق payload قادم من Realtime (جهاز آخر) ──────────────────────────
  const applyRemotePayload = useCallback((payload: any) => {
    if (!payload) return;
    // تجاهل التغييرات التي أرسلناها نحن
    if (payload._device === DEVICE_ID) return;

    isApplyingRemoteRef.current = true;
    try {
      applyBackupPayload(payload, "replace");
      reloadAllFromStorage();
      setCloudSyncMessage("🔄 تم التحديث من جهاز آخر");
      setTimeout(() => setCloudSyncMessage(""), 3000);
    } finally {
      isApplyingRemoteRef.current = false;
    }
  }, [reloadAllFromStorage]);

  // ─── التهيئة الأولى + Realtime subscription ──────────────────────────────
  useEffect(() => {
    // Phase 9: If IDB cache is enabled, try reading from IndexedDB first
    // then fall through to localStorage for missing data
    const initFromIdb = async () => {
      if (typeof window === "undefined") return;

      const { USE_IDB_CACHE: useIdb } = await import("@/lib/featureFlags");
      if (!useIdb) {
        reloadAllFromStorage();
        return;
      }

      // Lazy import to avoid SSR issues
      const { idbCache } = await import("@/lib/modules/offline/idbCache");

      const [
        idbCustomers, idbCatalog, idbOrders, idbVendors, idbPurchases,
        idbExpenses, idbUsers, idbUrgentOrders, idbAppointments,
        idbTechInventory, idbTechInventoryLogs, idbTechFinancialLogs,
        idbTechLocations, idbCustomerPayments, idbReminders,
      ] = await Promise.all([
        idbCache.get<Customer[]>("customers"),
        idbCache.get<CatalogItem[]>("catalog"),
        idbCache.get<Order[]>("orders"),
        idbCache.get<Vendor[]>("vendors"),
        idbCache.get<PurchaseInvoice[]>("purchases"),
        idbCache.get<Expense[]>("expenses"),
        idbCache.get<StaffUser[]>("users"),
        idbCache.get<ServiceOrder[]>("urgentOrders"),
        idbCache.get<ServiceOrder[]>("appointments"),
        idbCache.get<TechInventoryItem[]>("techInventory"),
        idbCache.get<TechInventoryLog[]>("techInventoryLogs"),
        idbCache.get<TechFinancialLog[]>("techFinancialLogs"),
        idbCache.get<Record<string, TechLocation>>("techLocations"),
        idbCache.get<CustomerPayment[]>("customerPayments"),
        idbCache.get<SystemReminder[]>("reminders"),
      ]);

      // Use IDB data if available, fall back to localStorage
      setCustomersState(idbCustomers     ?? storage.getCustomers());
      setCatalogState(idbCatalog         ?? storage.getCatalog());
      setOrdersState(idbOrders           ?? storage.getOrders());
      setVendorsState(idbVendors         ?? storage.getVendors());
      setPurchasesState(idbPurchases     ?? storage.getPurchases());
      setExpensesState(idbExpenses       ?? storage.getExpenses());
      setUsersState(idbUsers             ?? storage.getUsers());
      setUrgentOrdersState(idbUrgentOrders  ?? storage.getUrgentOrders());
      setAppointmentsState(idbAppointments  ?? storage.getAppointments());
      setTechInventoryState(idbTechInventory       ?? storage.getTechInventory());
      setTechInventoryLogsState(idbTechInventoryLogs ?? storage.getTechInventoryLogs());
      setTechFinancialLogsState(idbTechFinancialLogs ?? storage.getTechFinancialLogs());
      setTechLocationsState(idbTechLocations         ?? storage.getTechLocations());
      setCustomerPaymentsState(idbCustomerPayments   ?? storage.getCustomerPayments());
      setRemindersState(idbReminders                 ?? storage.getReminders());
      // Settings always from localStorage (language, theme, etc.)
      setSettingsState(storage.getSettings());
    };

    initFromIdb().catch(() => reloadAllFromStorage());

    const SESSION_MAX_HOURS = 12;
    const restoredUser = storage.getActiveUser();
    if (restoredUser) {
      const startedAtRaw = typeof window !== "undefined" ? window.localStorage.getItem("cc_session_started_at") : null;
      const startedAt = startedAtRaw ? Number(startedAtRaw) : Date.now();
      const elapsedHours = (Date.now() - startedAt) / (1000 * 60 * 60);
      if (elapsedHours > SESSION_MAX_HOURS) {
        storage.saveActiveUser(null);
        if (typeof window !== "undefined") window.localStorage.removeItem("cc_session_started_at");
      } else {
        if (typeof window !== "undefined" && !startedAtRaw) window.localStorage.setItem("cc_session_started_at", String(Date.now()));
        setActiveUser(restoredUser);
      }
    }

    // Restore active branch selection
    if (typeof window !== "undefined") {
      const savedBranch = window.localStorage.getItem("cc_active_branch");
      if (savedBranch) setActiveBranchState(savedBranch);
    }
    setReady(true);

    // 1) تحميل أحدث نسخة من السحابة عند أول تشغيل
    const freshDevice = isLocalDataFresh();
    fetch("/api/backup/load")
      .then((r) => r.json())
      .then((data) => {
        if (data?.payload) {
          const mode = freshDevice ? "replace" : "merge";
          const { imported, empty } = applyBackupPayload(data.payload, mode);
          if (!empty) {
            reloadAllFromStorage();
            setCloudSyncMessage(`✓ تم التزامن: ${imported.length} قسم`);
            setTimeout(() => setCloudSyncMessage(""), 4000);
          }
        }
      })
      .catch(() => {/* offline أو غير مضبوط — لا شيء */});

    // 2) Supabase Realtime — استمع لأي تغيير في جدول app_backups
    if (!supabase) return; // Supabase غير مضبوط

    const channel = supabase
      .channel("app_backups_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",          // INSERT أو UPDATE
          schema: "public",
          table: "app_backups",
          filter: "id=eq.default",
        },
        (event: any) => {
          // new.payload يحتوي البيانات الجديدة مباشرة من Postgres
          const incomingPayload = event.new?.payload;
          if (incomingPayload) {
            applyRemotePayload(incomingPayload);
          }
        }
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          console.log("✅ Realtime: متصل بـ app_backups");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("⚠ Realtime: انقطع الاتصال —", status);
        }
      });

    return () => {
      supabase?.removeChannel(channel);
    };
  }, [reloadAllFromStorage, applyRemotePayload]);

  // ─── IDB write-through helper (non-blocking) ──────────────────────────────
  const idbWrite = useCallback((store: string, v: unknown) => {
    if (typeof window === "undefined") return;
    import("@/lib/featureFlags").then(({ USE_IDB_CACHE: useIdb }) => {
      if (!useIdb) return;
      import("@/lib/modules/offline/idbCache").then(({ idbCache }) => {
        idbCache.set(store as import("@/lib/modules/offline/idbCache").IdbStoreName, v).catch(() => {});
      });
    });
  }, []);

  // ─── Setters — يحفظ محلياً + IDB + يرفع للسحابة ─────────────────────────
  const setCustomers = useCallback((v: Customer[]) => {
    setCustomersState(v); storage.saveCustomers(v); idbWrite("customers", v); scheduleCloudSync();
  }, [scheduleCloudSync, idbWrite]);

  const setCatalog = useCallback((v: CatalogItem[]) => {
    setCatalogState(v); storage.saveCatalog(v); idbWrite("catalog", v); scheduleCloudSync();
  }, [scheduleCloudSync, idbWrite]);

  const setOrders = useCallback((v: Order[]) => {
    setOrdersState(v); storage.saveOrders(v); idbWrite("orders", v); scheduleCloudSync();
  }, [scheduleCloudSync, idbWrite]);

  const setVendors = useCallback((v: Vendor[]) => {
    setVendorsState(v); storage.saveVendors(v); idbWrite("vendors", v); scheduleCloudSync();
  }, [scheduleCloudSync, idbWrite]);

  const setPurchases = useCallback((v: PurchaseInvoice[]) => {
    setPurchasesState(v); storage.savePurchases(v); idbWrite("purchases", v); scheduleCloudSync();
  }, [scheduleCloudSync, idbWrite]);

  const setExpenses = useCallback((v: Expense[]) => {
    setExpensesState(v); storage.saveExpenses(v); idbWrite("expenses", v); scheduleCloudSync();
  }, [scheduleCloudSync, idbWrite]);

  const setSettings = useCallback((v: AppSettings) => {
    setSettingsState(v); storage.saveSettings(v); scheduleCloudSync(); // Settings: localStorage only
  }, [scheduleCloudSync]);

  const setUsers = useCallback((v: StaffUser[]) => {
    setUsersState(v); storage.saveUsers(v); idbWrite("users", v); scheduleCloudSync();
  }, [scheduleCloudSync, idbWrite]);

  const setUrgentOrders = useCallback((v: ServiceOrder[]) => {
    setUrgentOrdersState(v); storage.saveUrgentOrders(v); idbWrite("urgentOrders", v); scheduleCloudSync();
  }, [scheduleCloudSync, idbWrite]);

  const setAppointments = useCallback((v: ServiceOrder[]) => {
    setAppointmentsState(v); storage.saveAppointments(v); idbWrite("appointments", v); scheduleCloudSync();
  }, [scheduleCloudSync, idbWrite]);

  const setTechInventory = useCallback((v: TechInventoryItem[]) => {
    setTechInventoryState(v); storage.saveTechInventory(v); idbWrite("techInventory", v); scheduleCloudSync();
  }, [scheduleCloudSync, idbWrite]);

  const setTechInventoryLogs = useCallback((v: TechInventoryLog[]) => {
    setTechInventoryLogsState(v); storage.saveTechInventoryLogs(v); idbWrite("techInventoryLogs", v); scheduleCloudSync();
  }, [scheduleCloudSync, idbWrite]);

  const setTechFinancialLogs = useCallback((v: TechFinancialLog[]) => {
    setTechFinancialLogsState(v); storage.saveTechFinancialLogs(v); idbWrite("techFinancialLogs", v); scheduleCloudSync();
  }, [scheduleCloudSync, idbWrite]);

  const setTechLocations = useCallback((v: Record<string, TechLocation>) => {
    setTechLocationsState(v); storage.saveTechLocations(v); scheduleCloudSync();
  }, [scheduleCloudSync]);

  const setCustomerPayments = useCallback((v: CustomerPayment[]) => {
    setCustomerPaymentsState(v); storage.saveCustomerPayments(v); scheduleCloudSync();
  }, [scheduleCloudSync]);

  const setReminders = useCallback((v: SystemReminder[]) => {
    setRemindersState(v); storage.saveReminders(v); scheduleCloudSync();
  }, [scheduleCloudSync]);

  const saveTechLocation = useCallback((techName: string, loc: { lat: number; lng: number }) => {
    storage.saveTechLocation(techName, loc);
    setTechLocationsState(storage.getTechLocations());
    scheduleCloudSync();
  }, [scheduleCloudSync]);

  // ─── Auth helpers ─────────────────────────────────────────────────────────
  const login = useCallback((phone: string, pin: string) => {
    if (getLockoutRemainingMinutes(phone) > 0) return false;

    const list = storage.getUsers();
    const found = list.find((u) => u.phone === phone);
    if (!found || !verifyPin(pin, found.pin, phone)) {
      recordFailedLogin(phone);
      storage.addAuditLog({ userName: found?.name || phone, userRole: found?.role || "unknown", action: "login_failed", details: phone });
      return false;
    }

    clearFailedLogins(phone);

    // Transparently upgrade legacy plain-text PINs to a hashed value the
    // first time this user successfully logs in after this update.
    let userToUse = found;
    if (!isPinHashed(found.pin)) {
      userToUse = { ...found, pin: hashPin(pin, phone) };
      const nextUsers = list.map((u) => (u.id === found.id ? userToUse! : u));
      storage.saveUsers(nextUsers);
      setUsersState(nextUsers);
    }

    setActiveUser(userToUse);
    storage.saveActiveUser(userToUse);
    if (typeof window !== "undefined") window.localStorage.setItem("cc_session_started_at", String(Date.now()));
    storage.addAuditLog({ userName: userToUse.name, userRole: userToUse.role, action: "login", details: userToUse.phone });
    return true;
  }, []);

  /** Minutes remaining before a locked-out phone number can try again (0 = not locked). Exposed for the login screen to show a clear message. */
  const getLoginLockoutMinutes = useCallback((phone: string) => getLockoutRemainingMinutes(phone), []);

  const loginWithVerifiedPhone = useCallback((phone: string, createAsAdminIfMissing: boolean) => {
    const list = storage.getUsers();
    let found = list.find((u) => u.phone === phone);

    if (!found && createAsAdminIfMissing) {
      found = {
        id: uid("user"),
        name: "Owner",
        phone,
        pin: "",
        role: "admin",
        permissions: {
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
      };
      storage.saveUsers([...list, found]);
      setUsersState([...list, found]);
    }

    if (!found) return false;
    setActiveUser(found);
    storage.saveActiveUser(found);
    if (typeof window !== "undefined") window.localStorage.setItem("cc_session_started_at", String(Date.now()));
    storage.addAuditLog({ userName: found.name, userRole: found.role, action: "login", details: found.phone });
    return true;
  }, []);

  const updateActiveUser = useCallback((user: StaffUser) => {
    setActiveUser(user);
    storage.saveActiveUser(user);
  }, []);

  const changeOwnPin = useCallback((currentPin: string, newPin: string): { ok: boolean; messageKey: TranslationKey } => {
    if (!activeUser) return { ok: false, messageKey: "profile_pin_wrong" };

    const trimmedCurrent = currentPin.trim();
    const trimmedNew = newPin.trim();
    const latestUsers = storage.getUsers();
    const latestUser =
      latestUsers.find((user) => user.id === activeUser.id) ||
      latestUsers.find((user) => user.phone === activeUser.phone) ||
      activeUser;

    const savedPin = latestUser.pin || activeUser.pin || "";
    if (!verifyPin(trimmedCurrent, savedPin, activeUser.phone)) return { ok: false, messageKey: "profile_pin_wrong" };
    if (!trimmedNew || trimmedNew.length < 4) return { ok: false, messageKey: "profile_pin_short" };

    const updatedUser: StaffUser = { ...latestUser, pin: hashPin(trimmedNew, activeUser.phone) };
    const existsInList = latestUsers.some((u) => u.id === updatedUser.id || u.phone === updatedUser.phone);
    const nextUsers = existsInList
      ? latestUsers.map((u) => (u.id === updatedUser.id || u.phone === updatedUser.phone ? updatedUser : u))
      : [...latestUsers, updatedUser];

    setUsersState(nextUsers);
    storage.saveUsers(nextUsers);
    setActiveUser(updatedUser);
    storage.saveActiveUser(updatedUser);

    return { ok: true, messageKey: "profile_pin_updated" };
  }, [activeUser]);

  const logout = useCallback(() => {
    setActiveUser(null);
    storage.saveActiveUser(null);
    if (typeof window !== "undefined") window.localStorage.removeItem("cc_session_started_at");
  }, []);

  const setActiveBranch = useCallback((branch: string) => {
    setActiveBranchState(branch);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("cc_active_branch", branch);
    }
  }, []);

  // ─── Context value ────────────────────────────────────────────────────────
  const value: AppState = {
    ready, activeUser, activeBranch, customers, catalog, orders, vendors, purchases, expenses,
    settings, users, urgentOrders, appointments, techInventory, techInventoryLogs,
    techFinancialLogs, techLocations, customerPayments, reminders, cloudSyncMessage, isSyncing,
    login, getLoginLockoutMinutes, loginWithVerifiedPhone, logout, updateActiveUser, changeOwnPin,
    setCustomers, setCatalog, setOrders, setVendors, setPurchases, setExpenses,
    setSettings, setUsers, setUrgentOrders, setAppointments, setTechInventory,
    setTechInventoryLogs, setTechFinancialLogs, setTechLocations, setCustomerPayments, setReminders,
    saveTechLocation, setActiveBranch,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function useT() {
  const { settings } = useApp();
  return (key: TranslationKey) => translate(key, settings.language);
}
