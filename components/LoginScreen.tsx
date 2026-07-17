"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { useApp, useT } from "@/lib/store";
import { USE_SUPABASE_AUTH } from "@/lib/featureFlags";
import { applyBackupPayload } from "@/lib/backupPayload";
import { storage } from "@/lib/storage";

type Step = "phone" | "ownerPassword" | "pin" | "supabase_otp";

export default function LoginScreen() {
  const { login, loginWithVerifiedPhone, getLoginLockoutMinutes } = useApp();
  const t = useT();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [otp, setOtp] = useState("");         // Supabase OTP
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const resetToPhone = () => {
    setStep("phone");
    setError("");
    setPin("");
    setPassword("");
    setOtp("");
  };

  // Load data from Supabase backup if localStorage is empty (new device)
  const ensureDataLoaded = async () => {
    const hasUsers = storage.getUsers().length > 1;
    if (hasUsers) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/backup/load");
      const data = await res.json();
      if (data?.payload) applyBackupPayload(data.payload, "replace");
    } catch { /* offline */ } finally {
      setSyncing(false);
    }
  };

  const submitPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setError("");
    setLoading(true);

    // Always try to load data for new devices first
    await ensureDataLoaded();

    // Supabase Auth path (when NEXT_PUBLIC_USE_SUPABASE_AUTH=true)
    if (USE_SUPABASE_AUTH) {
      try {
        const res = await fetch("/api/auth/phone/send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        });
        const data = await res.json();
        if (res.ok && data.ok !== false) {
          setStep("supabase_otp");
        } else {
          // Fall back to local PIN if Supabase OTP fails
          setStep("pin");
        }
      } catch {
        setStep("pin");
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/check-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      setStep(data.ownerMode ? "ownerPassword" : "pin");
    } catch {
      // If the check itself fails for any reason, fall back to normal PIN
      // login rather than blocking the person from signing in at all.
      setStep("pin");
    } finally {
      setLoading(false);
    }
  };

  const submitOwnerPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/owner-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Incorrect password.");
        return;
      }
      loginWithVerifiedPhone(phone, true);
    } catch {
      setError("Network error while verifying the password.");
    } finally {
      setLoading(false);
    }
  };

  const submitPin = async (e: React.FormEvent) => {
    e.preventDefault();
    const lockedMinutes = getLoginLockoutMinutes(phone.trim());
    if (lockedMinutes > 0) {
      setError(`تم قفل الدخول مؤقتًا. حاول مرة أخرى بعد ${lockedMinutes} دقيقة.`);
      return;
    }
    let ok = login(phone.trim(), pin);

    // If local login fails — try loading from cloud and retry once
    if (!ok) {
      setSyncing(true);
      try {
        const res = await fetch("/api/backup/load");
        const data = await res.json();
        if (data?.payload) {
          applyBackupPayload(data.payload, "replace");
          ok = login(phone.trim(), pin);
        }
      } catch { /* offline */ } finally {
        setSyncing(false);
      }
    }

    if (!ok) {
      const nowLocked = getLoginLockoutMinutes(phone.trim());
      setError(nowLocked > 0
        ? `تم قفل الدخول مؤقتًا. حاول مرة أخرى بعد ${nowLocked} دقيقة.`
        : t("login_error"));
    }
  };

  // Supabase Auth OTP verification
  const submitOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/phone/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "رمز التحقق غير صحيح.");
        return;
      }
      loginWithVerifiedPhone(phone, true);
    } catch {
      setError("خطأ في الشبكة أثناء التحقق.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-gradient p-4">
      <div className="pointer-events-none absolute -top-24 -start-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -end-24 h-72 w-72 rounded-full bg-brand-900/30 blur-3xl" />

      <div className="relative w-full max-w-sm rounded-2xl bg-white/95 p-8 shadow-2xl backdrop-blur">
        <div className="mb-5 flex flex-col items-center">
          <Image src="/logo.png" alt="Peurma" width={96} height={96} priority className="mb-2" />
          <h1 className="text-center text-lg font-bold tracking-wide text-brand-800">{t("login_title")}</h1>
        </div>

        {step === "phone" && (
          <form onSubmit={submitPhone}>
            <p className="mb-6 text-center text-sm text-slate-500">{t("login_subtitle")}</p>
            {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-600">{error}</p>}
            <label className="mb-1 block text-sm font-medium text-slate-700">{t("login_phone")}</label>
            <input
              className="mb-6 w-full rounded-lg border border-slate-300 p-2.5 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05xxxxxxxx"
              autoFocus
            />
            <button disabled={loading} className="w-full rounded-lg bg-gradient-to-r from-brand-400 to-brand-700 py-2.5 font-semibold text-white shadow-md shadow-brand-700/20 transition hover:opacity-95 disabled:opacity-50">
              {loading ? "…" : t("login_continue")}
            </button>
          </form>
        )}

        {step === "ownerPassword" && (
          <form onSubmit={submitOwnerPassword}>
            <p className="mb-6 text-center text-sm text-slate-500">{t("login_owner_subtitle")}</p>
            {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-600">{error}</p>}
            <label className="mb-1 block text-sm font-medium text-slate-700">{t("login_owner_password")}</label>
            <input
              type="password"
              className="mb-6 w-full rounded-lg border border-slate-300 p-2.5 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            <button disabled={loading} className="mb-2 w-full rounded-lg bg-gradient-to-r from-brand-400 to-brand-700 py-2.5 font-semibold text-white shadow-md shadow-brand-700/20 transition hover:opacity-95 disabled:opacity-50">
              {loading ? "…" : t("login_signin")}
            </button>
            <button type="button" onClick={resetToPhone} className="w-full rounded-lg bg-slate-100 py-2 text-sm text-slate-600 hover:bg-slate-200">
              {t("login_back")}
            </button>
          </form>
        )}

        {/* Supabase Auth OTP step */}
        {step === "supabase_otp" && (
          <form onSubmit={submitOtp}>
            <p className="mb-4 text-center text-sm text-slate-500">
              {`تم إرسال رمز التحقق إلى ${phone}`}
            </p>
            {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-600">{error}</p>}
            <label className="mb-1 block text-sm font-medium text-slate-700">رمز التحقق (OTP)</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              className="mb-6 w-full rounded-lg border border-slate-300 p-2.5 text-center text-xl font-bold tracking-widest outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
              autoFocus
              required
              dir="ltr"
            />
            <button
              type="submit"
              disabled={loading}
              className="mb-2 w-full rounded-lg bg-gradient-to-r from-brand-400 to-brand-700 py-2.5 font-semibold text-white shadow-md disabled:opacity-50"
            >
              {loading ? "…" : "تأكيد الدخول"}
            </button>
            <button type="button" onClick={resetToPhone} className="w-full rounded-lg bg-slate-100 py-2 text-sm text-slate-600 hover:bg-slate-200">
              {t("login_back")}
            </button>
          </form>
        )}

        {/* Syncing indicator (loading cloud data) */}
        {syncing && (
          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-400">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
            جارٍ تحميل البيانات…
          </div>
        )}

        {step === "pin" && (
          <form onSubmit={submitPin}>
            {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-600">{error}</p>}
            <label className="mb-1 block text-sm font-medium text-slate-700">{t("login_phone")}</label>
            <input
              className="mb-4 w-full rounded-lg border border-slate-300 p-2.5 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <label className="mb-1 block text-sm font-medium text-slate-700">{t("login_pin")}</label>
            <input
              type="password"
              className="mb-6 w-full rounded-lg border border-slate-300 p-2.5 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoFocus
            />
            <button className="mb-2 w-full rounded-lg bg-gradient-to-r from-brand-400 to-brand-700 py-2.5 font-semibold text-white shadow-md shadow-brand-700/20 transition hover:opacity-95">
              {t("login_signin")}
            </button>
            <button type="button" onClick={resetToPhone} className="w-full rounded-lg bg-slate-100 py-2 text-sm text-slate-600 hover:bg-slate-200">
              {t("login_back")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
