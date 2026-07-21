import { createClient } from "@supabase/supabase-js";

const env = (import.meta as any).env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || "";

const isValidHttpUrl = (str: string) => {
  try {
    return str.startsWith("http://") || str.startsWith("https://");
  } catch {
    return false;
  }
};

// Initialize Supabase client
export const supabase = (supabaseUrl && supabaseAnonKey && isValidHttpUrl(supabaseUrl))
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

// Log initialization status
if (!supabase) {
  console.warn(
    "Supabase credentials are not fully configured in environment variables. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
  );
} else {
  console.log("Supabase client initialized successfully.");
}

const apiBase = env.VITE_API_BASE_URL || "";

async function postJson(path: string, body: unknown) {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || "تعذر إكمال الطلب");
  }

  return data;
}

// Interfaces identical to our App requirements
export interface UserSession {
  id: string;
  email: string | null;
  name: string | null;
  role: "admin" | "employee";
}

/**
 * Handle Supabase Google Sign-In
 */
export const signInWithGoogle = async () => {
  if (!supabase) {
    throw new Error("لم يتم تكوين Supabase بشكل صحيح في متغيرات البيئة.");
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      }
    }
  });

  if (error) {
    console.error("Supabase Google Auth Error:", error);
    throw error;
  }
  return data;
};

/**
 * Handle Supabase Email password Sign-In (for Admin or Employees as requested in AuthScreen)
 */
export const signInWithEmail = async (email: string, pass: string) => {
  if (!supabase) {
    throw new Error("لم يتم تكوين Supabase بشكل صحيح في متغيرات البيئة.");
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: pass,
  });

  if (error) {
    console.error("Supabase Email Auth Error:", error);
    throw error;
  }
  return data.user;
};


/**
 * Send a Supabase email confirmation / magic login link.
 * The user will be signed in automatically after opening the link.
 */
export const sendEmailConfirmationLink = async (email: string) => {
  if (!supabase) {
    throw new Error("لم يتم تكوين Supabase بشكل صحيح في متغيرات البيئة.");
  }

  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: window.location.origin,
    },
  });

  if (error) {
    console.error("Supabase Email Link Auth Error:", error);
    throw error;
  }

  return data;
};

/**
 * Send an email OTP through the backend Authentica integration.
 */
export const sendAuthenticaEmailOtp = async (email: string) => {
  return postJson("/api/auth/email/send-otp", { email });
};

/**
 * Verify an email OTP through Authentica, then persist the returned Supabase session.
 */
export const verifyAuthenticaEmailOtp = async (email: string, otp: string) => {
  const data = await postJson("/api/auth/email/verify-otp", { email, otp });

  if (!data?.access_token || !data?.refresh_token) {
    throw new Error("لم يتم استلام جلسة الدخول من الخادم.");
  }

  await setSupabaseSession(data.access_token, data.refresh_token);
  return data.user;
};

/**
 * Handle Sign Out
 */
export const logout = async () => {
  if (supabase) {
    await supabase.auth.signOut();
  }
};

/**
 * Persist the Supabase session returned by the server after a successful
 * Authentica phone-OTP login so future cloud sync uses the right user.
 */
export const setSupabaseSession = async (
  accessToken: string,
  refreshToken: string
) => {
  if (!supabase) return;
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
};

/**
 * Get the currently signed-in user (or null) — handy for showing the active
 * cashier/WhatsApp identity on the dashboard.
 */
export const getCurrentUser = async () => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
};

/**
 * Load cloud data from Supabase structured tables
 */
export const loadCloudUserData = async (userId: string): Promise<any | null> => {
  if (!supabase) return null;
  try {
    const payload: any = {
      customers: [],
      catalog: [],
      orders: [],
      serviceOrders: [],
      urgentOrders: [],
      fastOrders: [],
      vendors: [],
      purchases: [],
      expenses: [],
      settings: null,
    };

    // 1. Load customers
    const { data: dbCustomers, error: errCust } = await supabase
      .from("customers")
      .select("*");
    if (!errCust && dbCustomers) {
      payload.customers = dbCustomers.map((c: any) => {
        try {
          if (c.notes && c.notes.startsWith("{")) {
            return JSON.parse(c.notes);
          }
        } catch {}
        return {
          id: c.id,
          name: c.name,
          phone: c.phone || "",
          type: c.type || "lead",
          createdAt: c.created_at ? new Date(c.created_at).getTime() : Date.now(),
        };
      });
    }

    // 2. Load catalog items
    const { data: dbCatalog, error: errCat } = await supabase
      .from("catalog_items")
      .select("*");
    if (!errCat && dbCatalog) {
      payload.catalog = dbCatalog.map((item: any) => {
        try {
          if (item.description && item.description.startsWith("{")) {
            return JSON.parse(item.description);
          }
        } catch {}
        return {
          id: item.id,
          name: item.name,
          price: Number(item.price || 0),
          costPrice: Number(item.cost_price || 0),
          type: item.type || "product",
          sku: item.sku || "",
          category: item.category || "",
          stock: Number(item.stock || 0),
          isBundle: false,
          tax: 15,
        };
      });
    }

    // 3. Load orders
    const { data: dbOrders, error: errOrd } = await supabase
      .from("orders")
      .select("*");
    if (!errOrd && dbOrders) {
      const allOrders: any[] = [];
      const serviceOrders: any[] = [];
      const urgentOrders: any[] = [];
      const fastOrders: any[] = [];

      dbOrders.forEach((o: any) => {
        let orderObj: any = null;
        try {
          if (o.notes && o.notes.startsWith("{")) {
            orderObj = JSON.parse(o.notes);
          }
        } catch {}

        if (!orderObj) {
          orderObj = {
            id: o.id,
            invoiceNumber: o.invoice_number,
            type: o.type === "quote" ? "quotation" : (o.type === "return_invoice" ? "return_invoice" : "tax_invoice"),
            customerId: o.customer_id,
            items: o.items || [],
            grandTotal: Number(o.grand_total || 0),
            totalBeforeTax: Number(o.total_before_tax || 0),
            totalTax: Number(o.total_tax || 0),
            totalDiscount: Number(o.total_discount || 0),
            status: o.status === "cancelled" ? "deleted" : (o.status === "returned" ? "returned" : "active"),
            date: o.date ? new Date(o.date).getTime() : Date.now(),
            paymentMethod: o.payment_method || "cash",
          };
        }

        // Separate service order or urgent/fast if stored inside types or notes
        if (o.type === "service_order") {
          serviceOrders.push(orderObj);
        } else if (orderObj.isUrgent) {
          urgentOrders.push(orderObj);
        } else if (orderObj.isFast) {
          fastOrders.push(orderObj);
        } else {
          allOrders.push(orderObj);
        }
      });

      payload.orders = allOrders;
      payload.serviceOrders = serviceOrders;
      payload.urgentOrders = urgentOrders;
      payload.fastOrders = fastOrders;
    }

    // 4. Load vendors
    const { data: dbVendors, error: errVend } = await supabase
      .from("vendors")
      .select("*");
    if (!errVend && dbVendors) {
      payload.vendors = dbVendors.map((v: any) => {
        try {
          if (v.notes && v.notes.startsWith("{")) {
            return JSON.parse(v.notes);
          }
        } catch {}
        return {
          id: v.id,
          name: v.name,
          phone: v.phone || "",
          address: v.address || "",
          createdAt: v.created_at ? new Date(v.created_at).getTime() : Date.now(),
        };
      });
    }

    // 5. Load purchases
    const { data: dbPurchases, error: errPurch } = await supabase
      .from("purchase_invoices")
      .select("*");
    if (!errPurch && dbPurchases) {
      payload.purchases = dbPurchases.map((p: any) => {
        try {
          if (p.notes && p.notes.startsWith("{")) {
            return JSON.parse(p.notes);
          }
        } catch {}
        return {
          id: p.id,
          vendorId: p.vendor_id,
          items: p.items || [],
          grandTotal: Number(p.total_amount || 0),
          paidAmount: Number(p.paid_amount || 0),
          date: p.date ? new Date(p.date).getTime() : Date.now(),
        };
      });
    }

    // 6. Load expenses
    const { data: dbExpenses, error: errExp } = await supabase
      .from("expenses")
      .select("*");
    if (!errExp && dbExpenses) {
      payload.expenses = dbExpenses.map((e: any) => {
        try {
          if (e.note && e.note.startsWith("{")) {
            return JSON.parse(e.note);
          }
        } catch {}
        return {
          id: e.id,
          category: e.category,
          amount: Number(e.amount || 0),
          description: e.note || "",
          date: e.date ? new Date(e.date).getTime() : Date.now(),
        };
      });
    }

    // 7. Load settings
    const { data: dbSettings, error: errSett } = await supabase
      .from("app_settings")
      .select("*")
      .maybeSingle();

    if (!errSett && dbSettings) {
      try {
        if (dbSettings.company_name && dbSettings.company_name.startsWith("{")) {
          payload.settings = JSON.parse(dbSettings.company_name);
        } else {
          payload.settings = {
            theme: dbSettings.theme || "dark",
            currency: dbSettings.currency || "ر.س",
            defaultTaxRate: Number(dbSettings.tax_rate || 15),
            companyHeader: {
              name: dbSettings.company_name || "",
              address: "",
              phone: "",
              taxNumber: "",
            }
          };
        }
      } catch {}
    }

    // If no tables have data yet, try reading from legacy fallback or return null
    if (
      payload.customers.length === 0 &&
      payload.catalog.length === 0 &&
      payload.orders.length === 0 &&
      !payload.settings
    ) {
      const { data: legacyData } = await supabase
        .from("user_data")
        .select("payload")
        .eq("id", userId)
        .maybeSingle();
      if (legacyData?.payload) {
        return typeof legacyData.payload === "string" ? JSON.parse(legacyData.payload) : legacyData.payload;
      }
      return null;
    }

    return payload;
  } catch (err) {
    console.error("Error loading structured relational cloud data:", err);
    return null;
  }
};

/**
 * Sync / Save user data payload to Supabase structured tables
 */
export const saveCloudUserData = async (userId: string, payload: any): Promise<boolean> => {
  if (!supabase) return false;
  try {
    // 1. Save Customers
    if (payload.customers && payload.customers.length > 0) {
      const customersRows = payload.customers.map((c: any) => ({
        id: c.id,
        type: c.type === "customer" ? "customer" : "lead",
        name: c.name || "بدون اسم",
        phone: c.phone || "",
        notes: JSON.stringify(c),
        total_purchases: c.reminderLevel || 0,
        updated_at: new Date().toISOString()
      }));
      await supabase.from("customers").upsert(customersRows, { onConflict: "id" });
    }

    // 2. Save Catalog Items
    if (payload.catalog && payload.catalog.length > 0) {
      const catalogRows = payload.catalog.map((item: any) => ({
        id: item.id,
        type: item.type === "service" ? "service" : "product",
        name: item.name || "بدون اسم",
        sku: item.sku || "",
        barcode: item.sku || "",
        category: item.category || "",
        price: Number(item.price || 0),
        cost_price: Number(item.costPrice || 0),
        stock: Number(item.stock || 0),
        description: JSON.stringify(item),
        updated_at: new Date().toISOString()
      }));
      await supabase.from("catalog_items").upsert(catalogRows, { onConflict: "id" });
    }

    // 3. Save Orders (Including standard orders, serviceOrders, urgentOrders, and fastOrders)
    const ordersRows: any[] = [];
    
    if (payload.orders) {
      payload.orders.forEach((o: any) => {
        ordersRows.push({
          id: o.id,
          invoice_number: o.invoiceNumber || null,
          type: o.type === "return_invoice" ? "return_invoice" : (o.type === "quotation" ? "quote" : "invoice"),
          customer_id: o.customerId || null,
          status: o.status === "deleted" ? "cancelled" : (o.status === "returned" ? "returned" : "completed"),
          items: o.items || [],
          total_before_tax: Number(o.totalBeforeTax || 0),
          total_tax: Number(o.totalTax || 0),
          total_discount: Number(o.totalDiscount || 0),
          grand_total: Number(o.grandTotal || 0),
          payment_method: o.paymentMethod || "cash",
          notes: JSON.stringify(o),
          date: o.date ? new Date(o.date).toISOString() : new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      });
    }

    if (payload.serviceOrders) {
      payload.serviceOrders.forEach((o: any) => {
        ordersRows.push({
          id: o.id,
          invoice_number: `SO-${o.requestNumber || Math.floor(Math.random() * 100000)}`,
          type: "service_order",
          customer_id: o.customerId || null,
          status: o.status === "canceled" ? "cancelled" : "completed",
          items: o.selectedProducts || [],
          total_before_tax: Number(o.expectedAmount || 0),
          grand_total: Number(o.expectedAmount || 0),
          payment_method: o.expectedPaymentMethod || "cash",
          notes: JSON.stringify(o),
          date: o.date ? new Date(o.date).toISOString() : new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      });
    }

    if (payload.urgentOrders) {
      payload.urgentOrders.forEach((o: any) => {
        ordersRows.push({
          id: o.id,
          invoice_number: o.invoiceNumber || null,
          type: "invoice",
          customer_id: o.customerId || null,
          status: "completed",
          items: o.items || [],
          grand_total: Number(o.grandTotal || 0),
          notes: JSON.stringify({ ...o, isUrgent: true }),
          date: o.date ? new Date(o.date).toISOString() : new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      });
    }

    if (payload.fastOrders) {
      payload.fastOrders.forEach((o: any) => {
        ordersRows.push({
          id: o.id,
          invoice_number: o.invoiceNumber || null,
          type: "invoice",
          customer_id: o.customerId || null,
          status: "completed",
          items: o.items || [],
          grand_total: Number(o.grandTotal || 0),
          notes: JSON.stringify({ ...o, isFast: true }),
          date: o.date ? new Date(o.date).toISOString() : new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      });
    }

    if (ordersRows.length > 0) {
      await supabase.from("orders").upsert(ordersRows, { onConflict: "id" });
    }

    // 4. Save Vendors
    if (payload.vendors && payload.vendors.length > 0) {
      const vendorsRows = payload.vendors.map((v: any) => ({
        id: v.id,
        name: v.name || "بدون اسم",
        phone: v.phone || "",
        address: v.address || "",
        notes: JSON.stringify(v),
      }));
      await supabase.from("vendors").upsert(vendorsRows, { onConflict: "id" });
    }

    // 5. Save Purchase Invoices (Purchases)
    if (payload.purchases && payload.purchases.length > 0) {
      const purchasesRows = payload.purchases.map((p: any) => ({
        id: p.id,
        invoice_number: p.referenceNumber || null,
        vendor_id: p.vendorId || null,
        items: p.items || [],
        total_amount: Number(p.grandTotal || 0),
        paid_amount: Number(p.paidAmount || 0),
        notes: JSON.stringify(p),
        date: p.date ? new Date(p.date).toISOString() : new Date().toISOString()
      }));
      await supabase.from("purchase_invoices").upsert(purchasesRows, { onConflict: "id" });
    }

    // 6. Save Expenses
    if (payload.expenses && payload.expenses.length > 0) {
      const expensesRows = payload.expenses.map((e: any) => ({
        id: e.id,
        category: e.category || "عام",
        amount: Number(e.amount || 0),
        note: JSON.stringify(e),
        date: e.date ? new Date(e.date).toISOString() : new Date().toISOString()
      }));
      await supabase.from("expenses").upsert(expensesRows, { onConflict: "id" });
    }

    // 7. Save Settings
    if (payload.settings) {
      const s = payload.settings;
      const settingsRow = {
        user_id: userId,
        company_name: JSON.stringify(s), // Pack everything safely to avoid data loss
        currency: s.currency || "ر.س",
        tax_rate: Number(s.defaultTaxRate || 15),
        theme: s.theme || "dark",
        updated_at: new Date().toISOString()
      };
      
      const { data: existingSettings } = await supabase
        .from("app_settings")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      const finalSettingsRow = existingSettings?.id
        ? { id: existingSettings.id, ...settingsRow }
        : { ...settingsRow };

      await supabase.from("app_settings").upsert(finalSettingsRow, { onConflict: "user_id" });
    }

    return true;
  } catch (err) {
    console.error("Error saving structured relational cloud data:", err);
    return false;
  }
};
