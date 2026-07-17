import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/lib/store";
import Shell from "@/components/Shell";
import ErrorBoundary from "@/components/ErrorBoundary";

export const metadata: Metadata = {
  title: "Peurma | Cashier CRM",
  description: "Peurma — Water desalination point-of-sale & CRM system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900">
        {/* Service Worker registration */}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js')
                .then(function(reg) {
                  reg.addEventListener('updatefound', function() {
                    var newWorker = reg.installing;
                    if (newWorker) {
                      newWorker.addEventListener('statechange', function() {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                          newWorker.postMessage({ type: 'SKIP_WAITING' });
                        }
                      });
                    }
                  });
                })
                .catch(function(err) { console.warn('SW registration failed:', err); });
            });
          }
        `}} />
        <ErrorBoundary>
          <AppProvider>
            <Shell>{children}</Shell>
          </AppProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
