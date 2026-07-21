import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

// Load .env.local for local development (and .env as fallback)
dotenv.config({ path: ".env.local" });
dotenv.config();

type AdminClient = SupabaseClient<any, "public", any>;

type SettingRow = {
  key: string;
  value: string | null;
};

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing`);
  }
  return value;
}

function createAdminClient(): AdminClient {
  const url =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Supabase URL or SERVICE_ROLE_KEY is missing");
  }

  return createSupabaseClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }) as AdminClient;
}

function getAuthenticaApiKey() {
  // Strip whitespace, BOM, non-ASCII, and any char not valid in base64
  const encoded = getRequiredEnv("AUTHENTICA_API_KEY_BASE64")
    .trim()
    .replace(/[^\x20-\x7E]/g, "")   // remove non-printable / non-ASCII
    .replace(/[^A-Za-z0-9+/=]/g, ""); // keep only valid base64 chars
  if (!encoded) throw new Error("AUTHENTICA_API_KEY_BASE64 is empty after sanitization");
  return Buffer.from(encoded, "base64").toString("utf8");
}

function normalizeSaudiPhone(rawPhone: string) {
  if (!rawPhone) return null;
  const cleaned = String(rawPhone).replace(/\D/g, "");

  // Already in +9665XXXXXXXX format (12 digits: 9665 + 8)
  if (cleaned.startsWith("9665") && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  // Saudi local format 05XXXXXXXX (10 digits)
  if (cleaned.startsWith("05") && cleaned.length === 10) {
    return `+966${cleaned.slice(1)}`;
  }
  // Saudi without leading 0: 5XXXXXXXX (9 digits)
  if (cleaned.startsWith("5") && cleaned.length === 9) {
    return `+966${cleaned}`;
  }

  return null;
}

function getClientIp(req: express.Request) {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    (req.headers["x-real-ip"] as string) ||
    req.ip ||
    "unknown"
  );
}

function getAuthenticaError(data: unknown) {
  if (!data || typeof data !== "object") {
    return "تعذر إرسال رمز التحقق. حاول مرة أخرى.";
  }
  const record = data as { message?: string; errors?: { message?: string }[] };
  return (
    record.errors?.[0]?.message ||
    record.message ||
    "تعذر إرسال رمز التحقق. حاول مرة أخرى."
  );
}

function isOtpVerified(data: unknown) {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  return (
    record.status === true ||
    record.verified === true ||
    record.success === true ||
    record.status === "verified" ||
    record.status === "success"
  );
}

function placeholderEmailFromPhone(phone: string) {
  return `${phone.replace(/\D/g, "")}@phone.authentica.local`;
}

function normalizeEmail(rawEmail: string) {
  const email = String(rawEmail || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }
  return email;
}

async function findAuthUserByEmail(supabaseAdmin: AdminClient, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const perPage = 1000;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(error.message);
    }

    const user = data.users.find(
      (u) => (u.email || "").trim().toLowerCase() === normalizedEmail
    );

    if (user) return user;
    if (data.users.length < perPage) return null;
  }

  return null;
}

function getAuthenticaEmailMethod() {
  return process.env.AUTHENTICA_EMAIL_METHOD || "email";
}

function makeTemporaryPassword() {
  return `Auth-${randomUUID()}-${Date.now()}!`;
}

async function getSettingMap(supabaseAdmin: AdminClient) {
  try {
    const { data, error } = await supabaseAdmin
      .from("settings")
      .select("key, value")
      .in("key", [
        "admin_otp_bypass_enabled",
        "admin_otp_bypass_phone",
        "admin_otp_bypass_code",
      ]);

    if (error || !data) {
      return {
        admin_otp_bypass_enabled: "false",
        admin_otp_bypass_phone: "",
        admin_otp_bypass_code: "",
      };
    }
    const rows = data as SettingRow[];
    return rows.reduce<Record<string, string>>((acc, row) => {
      acc[row.key] = row.value ?? "";
      return acc;
    }, {});
  } catch {
    return {
      admin_otp_bypass_enabled: "false",
      admin_otp_bypass_phone: "",
      admin_otp_bypass_code: "",
    };
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "2mb" }));

  // ===========================================================================
  // API: AI Agent (existing Gemini agent)
  // ===========================================================================
  app.post("/api/agent", async (req, res) => {
    try {
      const { message, history, context } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey)
        return res.status(500).json({ error: "Gemini API key is not configured" });
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { "User-Agent": "aistudio-build" } },
      });

      const tools = [
        {
          functionDeclarations: [
            {
              name: "addOrder",
              description: "Create a new order for a customer. Use this when the user asks to create an order.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  customerName: { type: Type.STRING, description: "Name of the customer" },
                  phone: { type: Type.STRING, description: "Phone number" },
                  interest: { type: Type.STRING, description: "What the customer wants or order details" },
                },
                required: ["customerName", "interest"],
              },
            },
            {
              name: "updateOrder",
              description: "Update the status of an existing order or service order.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  orderId: { type: Type.STRING, description: "ID of the order to update" },
                  status: { type: Type.STRING, description: "New status of the order (e.g. pending, completed, processing)" },
                },
                required: ["orderId", "status"],
              },
            },
            {
              name: "addProduct",
              description: "Add a new product to the catalog.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Product name" },
                  price: { type: Type.NUMBER, description: "Product price" },
                  category: { type: Type.STRING, description: "Product category" },
                },
                required: ["name", "price"],
              },
            },
            {
              name: "prepareWhatsApp",
              description: "Prepare and open WhatsApp message for an order or a technician.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  phone: { type: Type.STRING, description: "Phone number of the recipient" },
                  message: { type: Type.STRING, description: "The message to send" },
                },
                required: ["phone", "message"],
              },
            },
            {
              name: "updateSettings",
              description: "Update the application settings, e.g. toggle notification sounds.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  notificationSound: { type: Type.BOOLEAN, description: "Enable or disable notification sound" },
                  companyName: { type: Type.STRING, description: "Company name" },
                },
              },
            },
            {
              name: "playSound",
              description: "Play a notification sound or alert in the user's interface.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, description: "Type of sound (success, error, notification)" },
                },
                required: ["type"],
              },
            },
            {
              name: "addCustomer",
              description: "Add a new customer to the system.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Customer name" },
                  phone: { type: Type.STRING, description: "Customer phone number" },
                  carBrand: { type: Type.STRING, description: "Customer car brand (optional)" },
                  carModel: { type: Type.STRING, description: "Customer car model (optional)" },
                  plateNumber: { type: Type.STRING, description: "Customer plate number (optional)" },
                },
                required: ["name"],
              },
            },
          ],
        },
      ];

      const promptContext = `أنت مساعد ذكي مدمج في نظام إدارة أعمال. معلومات النظام الحالية:
${JSON.stringify(context, null, 2)}
يمكنك الإجابة على الأسئلة أو اتخاذ إجراءات مثل إنشاء طلب، وتعديل حالة الطلبات، وإضافة منتج، وإضافة عميل، وتجهيز رسائل واتساب، وتعديل إعدادات النظام، وتشغيل أصوات تنبيهية للمستخدم.
المحادثة السابقة:
${(history || [])
        .map((m: any) => `${m.role === "user" ? "المستخدم" : "أنت"}: ${m.text}`)
        .join("\n")}
طلب المستخدم الحالي:
${message}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: promptContext,
        config: {
          tools,
          systemInstruction: "أنت مساعد ذكي ولطيف باللغة العربية. قدم إجابات مباشرة ومفيدة.",
          thinkingConfig: { thinkingLevel: "HIGH" as any },
        },
      });

      if (response.functionCalls && response.functionCalls.length > 0) {
        return res.json({ functionCalls: response.functionCalls });
      }
      res.json({ message: response.text });
    } catch (error: any) {
      console.error("AI Agent Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===========================================================================
  // API: Format WhatsApp message via Gemini (existing)
  // ===========================================================================
  app.post("/api/format-message", async (req, res) => {
    try {
      const { purpose, data, rawText } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Gemini API key is not configured" });

      const ai = new GoogleGenAI({ apiKey });
      let prompt = `قم بصياغة رسالة واتساب احترافية ومنظمة ومرتبة باللغة العربية.\n`;
      if (purpose === "technician") {
        prompt += `الرسالة موجهة إلى الفني / المندوب.
المعلومات المتوفرة:
${JSON.stringify(data, null, 2)}

الرجاء كتابة الرسالة مع مراعاة التالي:
1. ابدأ بـ "مرحباً [اسم الفني]، لديك طلب..." بحيث تحدد نوع الطلب (جهاز جديد، صيانة، الخ) بناءً على اهتمام العميل (issue).
2. قم بتسمية اهتمام العميل في نص الرسالة بـ "نوع الطلب".
3. استخدم تنسيق احترافي وجذاب مع الأيقونات التعبيرية (emojis) المناسبة والجمل الواضحة.`;
      } else if (purpose === "enhance_text") {
        prompt += `المطلوب: تحسين وتنسيق النص التالي ليكون رسالة واتساب احترافية ومنسقة ومناسبة للعملاء أو زملاء العمل، مع إضافة أيقونات تعبيرية مناسبة وتصحيح أي أخطاء لغوية.\nالنص الأصلي:\n"${rawText}"`;
      } else {
        prompt += `المعلومات:\n${JSON.stringify(data, null, 2)}\nالرجاء تنسيق هذه المعلومات في رسالة واتساب احترافية.`;
      }
      prompt += `\n\nملاحظة هامة: قم بإعطاء الرسالة النهائية فقط بدون أي مقدمات أو شروحات.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      res.json({ message: response.text });
    } catch (error: any) {
      console.error("Error formatting message:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===========================================================================
  // API: Authentica Email OTP - Send
  // ===========================================================================
  app.post("/api/auth/email/send-otp", async (req, res) => {
    try {
      const normalizedEmail = normalizeEmail(String(req.body?.email ?? ""));

      if (!normalizedEmail) {
        return res.status(400).json({
          error: "يرجى إدخال بريد إلكتروني صحيح.",
        });
      }

      const supabaseAdmin = createAdminClient();
      const ipAddress = getClientIp(req);

      // Rate-limit: max 3 sends / 10 min per email
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count, error: countError } = await supabaseAdmin
        .from("otp_attempts")
        .select("*", { count: "exact", head: true })
        .eq("phone", normalizedEmail)
        .gte("created_at", tenMinutesAgo);

      if (countError) {
        return res.status(500).json({
          error: countError.message || "تعذر التحقق من محاولات الإرسال",
        });
      }

      if ((count ?? 0) >= 3) {
        return res.status(429).json({
          error: "تم إرسال رموز كثيرة لهذا البريد. حاول مرة أخرى بعد 10 دقائق.",
        });
      }

      const apiKey = getAuthenticaApiKey();
      const sendUrl =
        process.env.AUTHENTICA_EMAIL_SEND_OTP_URL ||
        process.env.AUTHENTICA_SEND_OTP_URL ||
        "https://api.authentica.sa/api/v2/send-otp";

      const authenticaRes = await fetch(sendUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Authorization": apiKey,
        },
        body: JSON.stringify({
          method: getAuthenticaEmailMethod(),
          email: normalizedEmail,
        }),
      });

      const data = await authenticaRes.json().catch(() => ({}));

      await supabaseAdmin.from("otp_attempts").insert({
        phone: normalizedEmail,
        purpose: "login",
        provider: "authentica",
        success: authenticaRes.ok,
        ip_address: ipAddress,
      });

      if (!authenticaRes.ok) {
        console.error("Authentica email send status:", authenticaRes.status, authenticaRes.statusText);
        console.error("Authentica email send response:", JSON.stringify(data, null, 2));
        return res.status(500).json({ error: getAuthenticaError(data) });
      }

      return res.json({
        success: true,
        email: normalizedEmail,
        message:
          typeof data === "object" &&
          data !== null &&
          "message" in data &&
          typeof (data as any).message === "string"
            ? (data as any).message
            : "OTP sent successfully",
      });
    } catch (error: any) {
      console.error("Email Send-OTP error:", error);
      console.error("Email Send-OTP cause:", error?.cause);
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "حدث خطأ أثناء إرسال رمز التحقق إلى البريد",
      });
    }
  });

  // ===========================================================================
  // API: Authentica Email OTP - Verify + auto sign-in
  // ===========================================================================
  app.post("/api/auth/email/verify-otp", async (req, res) => {
    try {
      const normalizedEmail = normalizeEmail(String(req.body?.email ?? ""));
      const otpCode = String(req.body?.otp ?? "").trim();
      const fullName = String(req.body?.fullName ?? "").trim();
      const ipAddress = getClientIp(req);

      if (!normalizedEmail) {
        return res.status(400).json({ error: "يرجى إدخال بريد إلكتروني صحيح." });
      }
      if (!/^\d{4,8}$/.test(otpCode)) {
        return res.status(400).json({ error: "رمز التحقق غير صحيح" });
      }

      const supabaseUrl =
        process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey =
        process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !anonKey) {
        return res.status(500).json({ error: "Supabase public credentials missing" });
      }

      const apiKey = getAuthenticaApiKey();
      const verifyUrl =
        process.env.AUTHENTICA_EMAIL_VERIFY_OTP_URL ||
        process.env.AUTHENTICA_VERIFY_OTP_URL ||
        "https://api.authentica.sa/api/v2/verify-otp";

      const verifyRes = await fetch(verifyUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Authorization": apiKey,
        },
        body: JSON.stringify({
          method: getAuthenticaEmailMethod(),
          email: normalizedEmail,
          otp: otpCode,
        }),
      });

      const verifyData = await verifyRes.json().catch(() => ({}));
      const ok = verifyRes.ok && isOtpVerified(verifyData);

      const supabaseAdmin = createAdminClient();

      await supabaseAdmin.from("otp_attempts").insert({
        phone: normalizedEmail,
        purpose: "login_verify",
        provider: "authentica",
        success: ok,
        ip_address: ipAddress,
      });

      if (!ok) {
        console.error("Authentica email verify status:", verifyRes.status, verifyRes.statusText);
        console.error("Authentica email verify response:", JSON.stringify(verifyData, null, 2));
        const record = verifyData as {
          message?: string;
          errors?: { message?: string }[];
        };
        return res.status(401).json({
          error:
            record.errors?.[0]?.message ||
            record.message ||
            "رمز التحقق غير صحيح أو منتهي",
        });
      }

      const tempPassword = makeTemporaryPassword();
      let authUser = await findAuthUserByEmail(supabaseAdmin, normalizedEmail);
      let userId = authUser?.id;

      if (userId) {
        const { error: updateUserError } =
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: tempPassword,
            email_confirm: true,
            user_metadata: {
              ...(authUser?.user_metadata ?? {}),
              full_name: fullName || authUser?.user_metadata?.full_name || normalizedEmail,
              verified_via: "authentica_email",
            },
          });

        if (updateUserError) throw new Error(updateUserError.message);
      } else {
        const { data: newUserData, error: createUserError } =
          await supabaseAdmin.auth.admin.createUser({
            email: normalizedEmail,
            password: tempPassword,
            email_confirm: true,
            user_metadata: {
              full_name: fullName || normalizedEmail,
              verified_via: "authentica_email",
            },
          });

        if (createUserError || !newUserData.user) {
          throw new Error(createUserError?.message || "تعذر إنشاء حساب لهذا البريد");
        }

        authUser = newUserData.user;
        userId = newUserData.user.id;
      }

      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", userId)
        .maybeSingle();

      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: userId,
        full_name:
          fullName ||
          existingProfile?.full_name ||
          authUser?.user_metadata?.full_name ||
          normalizedEmail,
        auth_provider: "authentica",
        role: existingProfile?.role || "customer",
        updated_at: new Date().toISOString(),
      });

      if (profileError) throw new Error(profileError.message);

      const signInClient = createSupabaseClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: sessionData, error: signInError } =
        await signInClient.auth.signInWithPassword({
          email: normalizedEmail,
          password: tempPassword,
        });

      if (signInError || !sessionData.session) {
        throw new Error(signInError?.message || "فشل إنشاء جلسة الدخول");
      }

      return res.json({
        success: true,
        user: sessionData.user,
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
      });
    } catch (error: any) {
      console.error("Email Verify-OTP error:", error);
      console.error("Email Verify-OTP cause:", error?.cause);
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "حدث خطأ أثناء التحقق من رمز البريد",
      });
    }
  });

  // ===========================================================================
  // API: Authentica WhatsApp OTP - Send
  // ===========================================================================
  app.post("/api/auth/phone/send-otp", async (req, res) => {
    try {
      const { phone } = req.body;
      const normalizedPhone = normalizeSaudiPhone(String(phone ?? ""));

      if (!normalizedPhone) {
        return res.status(400).json({
          error: "رقم الجوال غير صحيح. استخدم رقم سعودي مثل 05xxxxxxxx",
        });
      }

      const supabaseAdmin = createAdminClient();
      const ipAddress = getClientIp(req);
      const settings = await getSettingMap(supabaseAdmin);

      // Admin OTP bypass: skip real SMS send and pre-approve
      const bypassEnabled = settings.admin_otp_bypass_enabled === "true";
      const bypassPhone = normalizeSaudiPhone(settings.admin_otp_bypass_phone || "");
      if (bypassEnabled && bypassPhone && normalizedPhone === bypassPhone) {
        await supabaseAdmin.from("otp_attempts").insert({
          phone: normalizedPhone,
          purpose: "admin_bypass",
          provider: "admin_code",
          success: true,
          ip_address: ipAddress,
        });
        return res.json({
          success: true,
          phone: normalizedPhone,
          bypass: true,
          message: "Admin bypass enabled",
        });
      }

      // Rate-limit: max 3 sends / 10 min per phone
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count, error: countError } = await supabaseAdmin
        .from("otp_attempts")
        .select("*", { count: "exact", head: true })
        .eq("phone", normalizedPhone)
        .gte("created_at", tenMinutesAgo);

      if (countError) {
        return res
          .status(500)
          .json({ error: countError.message || "تعذر التحقق من محاولات الإرسال" });
      }
      if ((count ?? 0) >= 3) {
        return res.status(429).json({
          error: "تم إرسال رموز كثيرة لهذا الرقم. حاول مرة أخرى بعد 10 دقائق.",
        });
      }

      // Call Authentica WhatsApp OTP API
      const apiKey = getAuthenticaApiKey();
      const sendUrl =
        process.env.AUTHENTICA_SEND_OTP_URL ||
        "https://api.authentica.sa/api/v2/send-otp";

      const authenticaRes = await fetch(sendUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Authorization": apiKey,
        },
        body: JSON.stringify({
          method: "whatsapp",
          phone: normalizedPhone,
        }),
      });

      const data = await authenticaRes.json().catch(() => ({}));

      await supabaseAdmin.from("otp_attempts").insert({
        phone: normalizedPhone,
        purpose: "login",
        provider: "authentica",
        success: authenticaRes.ok,
        ip_address: ipAddress,
      });

      if (!authenticaRes.ok) {
        return res.status(500).json({ error: getAuthenticaError(data) });
      }

      return res.json({
        success: true,
        phone: normalizedPhone,
        bypass: false,
        message:
          typeof data === "object" &&
          data !== null &&
          "message" in data &&
          typeof (data as any).message === "string"
            ? (data as any).message
            : "OTP sent successfully",
      });
    } catch (error: any) {
      console.error("Send-OTP error:", error);
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "حدث خطأ أثناء إرسال رمز التحقق",
      });
    }
  });

  // ===========================================================================
  // API: Authentica WhatsApp OTP - Verify + auto sign-in
  // ===========================================================================
  app.post("/api/auth/phone/verify-otp", async (req, res) => {
    try {
      const { phone, otp, fullName } = req.body;
      const normalizedPhone = normalizeSaudiPhone(String(phone ?? ""));
      const otpCode = String(otp ?? "").trim();
      const ipAddress = getClientIp(req);

      if (!normalizedPhone) {
        return res.status(400).json({ error: "رقم الجوال غير صحيح" });
      }
      if (!otpCode) {
        return res.status(400).json({ error: "رمز التحقق مطلوب" });
      }

      const supabaseUrl =
        process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey =
        process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !anonKey) {
        return res.status(500).json({ error: "Supabase public credentials missing" });
      }

      const supabaseAdmin = createAdminClient();
      const settings = await getSettingMap(supabaseAdmin);

      const bypassEnabled = settings.admin_otp_bypass_enabled === "true";
      const bypassPhone = normalizeSaudiPhone(settings.admin_otp_bypass_phone || "");
      const bypassCode = settings.admin_otp_bypass_code || "";
      const isAdminBypassPhone =
        bypassEnabled && bypassPhone && normalizedPhone === bypassPhone;

      // Validate either via Authentica OR via static admin bypass code
      if (isAdminBypassPhone) {
        if (!bypassCode || otpCode !== bypassCode) {
          await supabaseAdmin.from("otp_attempts").insert({
            phone: normalizedPhone,
            purpose: "admin_bypass_verify",
            provider: "admin_code",
            success: false,
            ip_address: ipAddress,
          });
          return res.status(401).json({ error: "رمز دخول المدير غير صحيح" });
        }
        await supabaseAdmin.from("otp_attempts").insert({
          phone: normalizedPhone,
          purpose: "admin_bypass_verify",
          provider: "admin_code",
          success: true,
          ip_address: ipAddress,
        });
      } else {
        if (!/^\d{4,6}$/.test(otpCode)) {
          return res.status(400).json({ error: "رمز التحقق غير صحيح" });
        }

        const apiKey = getAuthenticaApiKey();
        const verifyUrl =
          process.env.AUTHENTICA_VERIFY_OTP_URL ||
          "https://api.authentica.sa/api/v2/verify-otp";

        const verifyRes = await fetch(verifyUrl, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Authorization": apiKey,
          },
          body: JSON.stringify({ phone: normalizedPhone, otp: otpCode }),
        });

        const verifyData = await verifyRes.json().catch(() => ({}));
        const ok = verifyRes.ok && isOtpVerified(verifyData);

        await supabaseAdmin.from("otp_attempts").insert({
          phone: normalizedPhone,
          purpose: "login_verify",
          provider: "authentica",
          success: ok,
          ip_address: ipAddress,
        });

        if (!ok) {
          const record = verifyData as {
            message?: string;
            errors?: { message?: string }[];
          };
          return res.status(401).json({
            error:
              record.errors?.[0]?.message ||
              record.message ||
              "رمز التحقق غير صحيح أو منتهي",
          });
        }
      }

      // Provision or update the Supabase auth user that backs this phone
      const tempPassword = makeTemporaryPassword();

      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, role")
        .eq("phone", normalizedPhone)
        .maybeSingle();

      let userId = existingProfile?.id as string | undefined;
      let userEmail = "";

      if (userId) {
        const { data: authUserData, error: getUserError } =
          await supabaseAdmin.auth.admin.getUserById(userId);
        if (getUserError || !authUserData.user?.email) {
          throw new Error(getUserError?.message || "تعذر تحميل حساب المستخدم");
        }
        userEmail = authUserData.user.email;
        const { error: updateUserError } =
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: tempPassword,
            phone: normalizedPhone,
            phone_confirm: true,
            user_metadata: {
              ...(authUserData.user.user_metadata ?? {}),
              phone: normalizedPhone,
              full_name: fullName || existingProfile?.full_name || normalizedPhone,
              verified_via: "authentica",
            },
          });
        if (updateUserError) throw new Error(updateUserError.message);
      } else {
        userEmail = placeholderEmailFromPhone(normalizedPhone);
        const { data: newUserData, error: createUserError } =
          await supabaseAdmin.auth.admin.createUser({
            email: userEmail,
            password: tempPassword,
            phone: normalizedPhone,
            email_confirm: true,
            phone_confirm: true,
            user_metadata: {
              phone: normalizedPhone,
              full_name: fullName || normalizedPhone,
              verified_via: "authentica",
            },
          });
        if (createUserError || !newUserData.user) {
          throw new Error(
            createUserError?.message || "تعذر إنشاء حساب جديد لهذا الرقم"
          );
        }
        userId = newUserData.user.id;
        const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
          id: userId,
          full_name: fullName || normalizedPhone,
          phone: normalizedPhone,
          phone_verified: true,
          phone_verified_at: new Date().toISOString(),
          auth_provider: "authentica",
          role: "customer",
        });
        if (profileError) throw new Error(profileError.message);
      }

      const { error: updateProfileError } = await supabaseAdmin
        .from("profiles")
        .update({
          phone: normalizedPhone,
          phone_verified: true,
          phone_verified_at: new Date().toISOString(),
          auth_provider: "authentica",
          ...(fullName ? { full_name: fullName } : {}),
        })
        .eq("id", userId);
      if (updateProfileError) throw new Error(updateProfileError.message);

      // Sign the user in via anon-key client and return the session tokens
      const signInClient = createSupabaseClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: sessionData, error: signInError } =
        await signInClient.auth.signInWithPassword({
          email: userEmail,
          password: tempPassword,
        });
      if (signInError || !sessionData.session) {
        throw new Error(signInError?.message || "فشل إنشاء جلسة الدخول");
      }

      return res.json({
        success: true,
        bypass: Boolean(isAdminBypassPhone),
        user: sessionData.user,
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
      });
    } catch (error: any) {
      console.error("Verify-OTP error:", error);
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "حدث خطأ أثناء التحقق من الرمز",
      });
    }
  });

  // ===========================================================================
  // API: Authentica session - exchange tokens for the current Supabase session
  // (lets the browser persist the session locally)
  // ===========================================================================
  app.post("/api/auth/phone/session", async (req, res) => {
    try {
      const { access_token, refresh_token } = req.body;
      if (!access_token || !refresh_token) {
        return res.status(400).json({ error: "Missing tokens" });
      }
      const supabaseUrl =
        process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey =
        process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !anonKey) {
        return res.status(500).json({ error: "Supabase public credentials missing" });
      }
      const client = createSupabaseClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.auth.setSession({
        access_token,
        refresh_token,
      });
      if (error || !data.session) {
        return res.status(401).json({ error: error?.message || "Invalid session" });
      }
      return res.json({ success: true, user: data.user });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ===========================================================================
  // API: Health check
  // ===========================================================================
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  // ===========================================================================
  // Vite middleware (dev) OR static dist (prod)
  // ===========================================================================
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`   • AI Agent: POST /api/agent`);
    console.log(`   • Email OTP send:     POST /api/auth/email/send-otp`);
    console.log(`   • Email OTP verify:   POST /api/auth/email/verify-otp`);
    console.log(`   • Health check: GET  /api/health`);
  });
}

startServer().catch((err) => {
  console.error("❌ Server failed to start:", err);
  process.exit(1);
});


