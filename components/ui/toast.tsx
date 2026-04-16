"use client";

import * as React from "react";
import { Check, AlertCircle, X } from "lucide-react";

type ToastVariant = "success" | "error";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4000;

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToasterInternal toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToasterInternal({
  toasts,
  onDismiss
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
    >
      {toasts.map((t) => {
        const isError = t.variant === "error";
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur-sm transition-all animate-in slide-in-from-bottom-2 ${
              isError
                ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
            }`}
          >
            {isError ? (
              <AlertCircle className="h-4 w-4 shrink-0" />
            ) : (
              <Check className="h-4 w-4 shrink-0" />
            )}
            <span>{t.message}</span>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => onDismiss(t.id)}
              className="ml-2 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Standalone Toaster for use outside the provider tree (SSR-safe no-op). */
export function Toaster() {
  return <div role="status" aria-live="polite" />;
}
