"use client";

import React from "react";
import { Button } from "@/components/ui";
import { useApp } from "@/lib/store";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function PWAInstallPrompt() {
  const { settings } = useApp();
  const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  const ar = settings.language === "ar";

  return (
    <div className="fixed bottom-4 start-4 z-40 max-w-xs rounded-xl border border-brand-200 bg-white p-3 text-sm shadow-xl no-print">
      <div className="mb-2 font-semibold text-slate-800">{ar ? "تثبيت التطبيق" : "Install app"}</div>
      <p className="mb-3 text-xs text-slate-500">
        {ar ? "يمكن تثبيت النظام على الجهاز كأنه تطبيق." : "Install the system on this device like a native app."}
      </p>
      <div className="flex gap-2">
        <Button
          onClick={async () => {
            await deferredPrompt.prompt();
            await deferredPrompt.userChoice.catch(() => null);
            setDeferredPrompt(null);
          }}
        >
          {ar ? "تثبيت" : "Install"}
        </Button>
        <Button variant="secondary" onClick={() => setDismissed(true)}>
          {ar ? "لاحقًا" : "Later"}
        </Button>
      </div>
    </div>
  );
}
