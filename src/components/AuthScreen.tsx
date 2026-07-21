import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Mail,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  KeyRound,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { sendAuthenticaEmailOtp, verifyAuthenticaEmailOtp } from "../lib/supabase";

interface AuthScreenProps {
  onLoginSuccess: (user: any) => void;
}

// ─── tiny inline CSS reset so the page is ALWAYS light ──────────────────────
const ALWAYS_LIGHT: React.CSSProperties = {
  colorScheme: "light",
};

export default function AuthScreen({ onLoginSuccess }: AuthScreenProps) {
  const [email, setEmail]           = useState("");
  const [otp, setOtp]               = useState("");
  const [isSending, setIsSending]   = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [otpSent, setOtpSent]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const normalizedEmail = email.trim().toLowerCase();

  // ── send OTP ────────────────────────────────────────────────────────────────
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setError("يرجى إدخال بريد إلكتروني صحيح.");
      return;
    }

    setIsSending(true);
    try {
      await sendAuthenticaEmailOtp(normalizedEmail);
      setOtpSent(true);
      setOtp("");
      toast.success("تم إرسال رمز التحقق إلى بريدك الإلكتروني.");
    } catch (err: any) {
      const msg = err?.message || "تعذر إرسال رمز التحقق إلى البريد.";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsSending(false);
    }
  };

  // ── verify OTP ──────────────────────────────────────────────────────────────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanOtp = otp.trim();
    if (!/^\d{4,8}$/.test(cleanOtp)) {
      setError("يرجى إدخال رمز التحقق (4 – 8 أرقام).");
      return;
    }

    setIsVerifying(true);
    try {
      const user = await verifyAuthenticaEmailOtp(normalizedEmail, cleanOtp);
      const appUser = {
        id:    user.id,
        name:  user.user_metadata?.full_name || user.email || normalizedEmail,
        role:  "admin",
        email: user.email || normalizedEmail,
      };
      onLoginSuccess(appUser);
      toast.success("تم تسجيل الدخول بنجاح.");
    } catch (err: any) {
      const msg = err?.message || "رمز التحقق غير صحيح أو منتهي.";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  // ── resend (no form event) ──────────────────────────────────────────────────
  const handleResend = async () => {
    setError(null);
    setIsSending(true);
    try {
      await sendAuthenticaEmailOtp(normalizedEmail);
      toast.success("تم إعادة إرسال رمز التحقق.");
    } catch (err: any) {
      const msg = err?.message || "تعذر إعادة الإرسال.";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsSending(false);
    }
  };

  // ── shared input focus handlers ─────────────────────────────────────────────
  const onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.border     = "1.5px solid #10b981";
    e.currentTarget.style.background = "#ffffff";
    e.currentTarget.style.boxShadow  = "0 0 0 3px rgba(16,185,129,0.12)";
  };
  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.border     = "1.5px solid #e2e8f0";
    e.currentTarget.style.background = "#f8fafc";
    e.currentTarget.style.boxShadow  = "none";
  };

  return (
    // ── root: force light regardless of <html class="dark"> ──────────────────
    <div
      style={{
        ...ALWAYS_LIGHT,
        minHeight: "100dvh",
        background: "linear-gradient(135deg, #eef7f3 0%, #f7fbff 55%, #edf5ff 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        position: "relative",
        overflow: "hidden",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
      }}
      dir="rtl"
    >
      {/* ── decorative blobs ───────────────────────────────────────────────── */}
      <span
        aria-hidden
        style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
        }}
      >
        <span style={{
          position: "absolute", top: "-10%", left: "-10%",
          width: "45%", height: "45%", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(16,185,129,0.14) 0%, transparent 70%)",
          filter: "blur(70px)",
        }} />
        <span style={{
          position: "absolute", bottom: "-10%", right: "-10%",
          width: "45%", height: "45%", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(59,130,246,0.10) 0%, transparent 70%)",
          filter: "blur(70px)",
        }} />
      </span>

      {/* ── card ────────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: "relative", zIndex: 1,
          width: "100%", maxWidth: "440px",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "20px",
          padding: "2rem 2rem 1.75rem",
          boxShadow:
            "0 1px 3px rgba(0,0,0,0.04), 0 16px 48px -8px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.9)",
          color: "#0f172a",
        }}
      >
        {/* ── logo + heading ─────────────────────────────────────────────── */}
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <div style={{ display: "inline-flex", marginBottom: "1rem" }}>
            <img
              src="/icon.svg"
              alt="شعار التطبيق"
              style={{
                width: 80, height: 80, objectFit: "contain",
                filter: "drop-shadow(0 4px 10px rgba(16,185,129,0.22))",
              }}
            />
          </div>

          {/* secure badge */}
          <div style={{ marginBottom: "0.85rem" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "5px 12px", borderRadius: "999px",
              background: "rgba(16,185,129,0.08)",
              border: "1px solid rgba(16,185,129,0.22)",
              color: "#059669", fontSize: "12px", fontWeight: 600,
            }}>
              <ShieldCheck size={13} />
              تسجيل دخول موحد وآمن
            </span>
          </div>

          <h1 style={{
            margin: "0 0 0.5rem", fontSize: "clamp(1.3rem,4vw,1.65rem)",
            fontWeight: 800, letterSpacing: "-0.02em", color: "#0f172a",
          }}>
            تسجيل الدخول
          </h1>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "#64748b", lineHeight: 1.65 }}>
            أدخل بريدك الإلكتروني لاستقبال رمز تحقق فوري عبر{" "}
            <a
              href="https://authentica.sa/ar/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#059669", fontWeight: 600, textDecoration: "none" }}
            >
              Authentica
            </a>
            .
          </p>
        </div>

        {/* ── divider ────────────────────────────────────────────────────────*/}
        <div style={{
          height: 1,
          background: "linear-gradient(to right, transparent, #e2e8f0, transparent)",
          marginBottom: "1.5rem",
        }} />

        {/* ── inline error banner ─────────────────────────────────────────── */}
        {error && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: "8px",
            padding: "12px 14px", marginBottom: "1rem",
            background: "#fff1f2", border: "1px solid #fecdd3",
            borderRadius: "12px", color: "#be123c", fontSize: "13px",
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        {/* ══════════════ STEP 1 – email entry ══════════════════════════════ */}
        {!otpSent ? (
          <form onSubmit={handleSendOtp} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
            <div>
              <Label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: 600, color: "#374151" }}>
                البريد الإلكتروني
              </Label>
              <div style={{ position: "relative" }}>
                <Mail
                  size={18}
                  style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", color: "#10b981", pointerEvents: "none" }}
                />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  dir="ltr"
                  autoComplete="email"
                  onFocus={onFocus}
                  onBlur={onBlur}
                  style={{
                    height: "48px", paddingRight: "40px",
                    background: "#f8fafc", border: "1.5px solid #e2e8f0",
                    borderRadius: "12px", color: "#0f172a",
                    fontSize: "15px", transition: "all 0.18s",
                  }}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isSending}
              style={{
                height: "48px", borderRadius: "12px",
                background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                color: "#fff", fontSize: "14px", fontWeight: 700,
                border: "none", cursor: isSending ? "not-allowed" : "pointer",
                boxShadow: "0 4px 14px rgba(16,185,129,0.32)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                transition: "box-shadow 0.18s, transform 0.18s",
              }}
              onMouseEnter={(e) => { if (!isSending) { (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 20px rgba(16,185,129,0.44)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; } }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 14px rgba(16,185,129,0.32)"; (e.currentTarget as HTMLElement).style.transform = ""; }}
            >
              {isSending
                ? <><RefreshCw size={17} className="animate-spin" /> جاري الإرسال…</>
                : <><Mail size={17} /> إرسال رمز التحقق</>}
            </Button>
          </form>

        /* ══════════════ STEP 2 – OTP entry ══════════════════════════════════ */
        ) : (
          <form onSubmit={handleVerifyOtp} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>

            {/* sent-to indicator */}
            <div style={{
              textAlign: "center", padding: "14px 16px",
              background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.18)",
              borderRadius: "12px",
            }}>
              <CheckCircle2 size={32} style={{ color: "#10b981", margin: "0 auto 6px" }} />
              <p style={{ margin: "0 0 4px", fontSize: "13px", color: "#475569" }}>
                تم إرسال رمز التحقق إلى:
              </p>
              <p style={{ margin: 0, fontSize: "13px", fontWeight: 700, color: "#059669", direction: "ltr" }}>
                {normalizedEmail}
              </p>
            </div>

            {/* OTP input */}
            <div>
              <Label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: 600, color: "#374151" }}>
                رمز التحقق
              </Label>
              <div style={{ position: "relative" }}>
                <KeyRound
                  size={18}
                  style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", color: "#10b981", pointerEvents: "none" }}
                />
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="• • • • • •"
                  required
                  dir="ltr"
                  autoComplete="one-time-code"
                  autoFocus
                  onFocus={onFocus}
                  onBlur={onBlur}
                  style={{
                    height: "52px", paddingRight: "40px",
                    background: "#f8fafc", border: "1.5px solid #e2e8f0",
                    borderRadius: "12px", color: "#0f172a",
                    fontSize: "24px", fontWeight: 800,
                    letterSpacing: "0.35em", textAlign: "center",
                    transition: "all 0.18s",
                  }}
                />
              </div>
            </div>

            {/* confirm button */}
            <Button
              type="submit"
              disabled={isVerifying}
              style={{
                height: "48px", borderRadius: "12px",
                background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                color: "#fff", fontSize: "14px", fontWeight: 700,
                border: "none", cursor: isVerifying ? "not-allowed" : "pointer",
                boxShadow: "0 4px 14px rgba(16,185,129,0.32)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                transition: "box-shadow 0.18s, transform 0.18s",
              }}
              onMouseEnter={(e) => { if (!isVerifying) { (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 20px rgba(16,185,129,0.44)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; } }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 14px rgba(16,185,129,0.32)"; (e.currentTarget as HTMLElement).style.transform = ""; }}
            >
              {isVerifying
                ? <><RefreshCw size={17} className="animate-spin" /> جاري التحقق…</>
                : <><ShieldCheck size={17} /> تأكيد الدخول</>}
            </Button>

            {/* secondary actions */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {/* back */}
              <button
                type="button"
                onClick={() => { setOtpSent(false); setOtp(""); setError(null); }}
                disabled={isSending || isVerifying}
                style={{
                  height: "40px", borderRadius: "10px",
                  background: "transparent", border: "1px solid #e2e8f0",
                  color: "#64748b", fontSize: "13px", fontWeight: 600,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                  transition: "background 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#f1f5f9"; (e.currentTarget as HTMLElement).style.color = "#0f172a"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#64748b"; }}
              >
                <ArrowRight size={14} />
                تغيير البريد
              </button>

              {/* resend */}
              <button
                type="button"
                onClick={handleResend}
                disabled={isSending || isVerifying}
                style={{
                  height: "40px", borderRadius: "10px",
                  background: "transparent", border: "1px solid #e2e8f0",
                  color: "#64748b", fontSize: "13px", fontWeight: 600,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                  transition: "background 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#f1f5f9"; (e.currentTarget as HTMLElement).style.color = "#0f172a"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#64748b"; }}
              >
                {isSending ? <RefreshCw size={14} className="animate-spin" /> : <Mail size={14} />}
                إعادة الإرسال
              </button>
            </div>
          </form>
        )}

        {/* ── footer note ─────────────────────────────────────────────────── */}
        <div style={{
          marginTop: "1.5rem", padding: "12px 14px", borderRadius: "12px",
          background: "#f8fafc", border: "1px solid #e2e8f0",
          fontSize: "12px", color: "#94a3b8", lineHeight: 1.7,
        }}>
          الدخول يتم فقط عبر رمز تحقق يُرسل إلى البريد الإلكتروني من خلال{" "}
          <a
            href="https://authentica.sa/ar/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#10b981", fontWeight: 600, textDecoration: "none" }}
          >
            Authentica
          </a>
          . لا توجد كلمة مرور.
        </div>

        <p style={{ textAlign: "center", fontSize: "11px", color: "#cbd5e1", marginTop: "1rem", marginBottom: 0 }}>
          Powered by{" "}
          <a href="https://authentica.sa/ar/" target="_blank" rel="noopener noreferrer" style={{ color: "#10b981", textDecoration: "none" }}>
            Authentica
          </a>{" "}
          · Secure OTP Login
        </p>
      </div>
    </div>
  );
}
