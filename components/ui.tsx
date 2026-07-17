"use client";

import React from "react";
import { getSuggestions, addSuggestion } from "@/lib/suggestions";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-100 bg-white p-4 shadow-sm ${className}`}>{children}</div>;
}

export function PageTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
        <span className="h-6 w-1 rounded-full bg-gradient-to-b from-brand-400 to-brand-700" />
        {title}
      </h1>
      {action}
    </div>
  );
}

export function Button({
  children, onClick, variant = "primary", type = "button", className = "", disabled = false,
}: {
  children: React.ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "danger"; type?: "button" | "submit"; className?: string; disabled?: boolean;
}) {
  const styles = {
    primary: "bg-gradient-to-r from-brand-500 to-brand-700 hover:opacity-90 text-white shadow-sm shadow-brand-700/20",
    secondary: "bg-slate-100 hover:bg-slate-200 text-slate-700",
    danger: "bg-red-600 hover:bg-red-700 text-white",
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}>
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full rounded border border-slate-300 p-2 text-sm ${props.className || ""}`} />;
}

/**
 * Like Input, but remembers whatever value the user types (per `category`)
 * and offers previous entries as suggestions via the browser's native
 * autocomplete dropdown — so names/phones/places typed once don't need to
 * be retyped on later forms. Uses a plain HTML <datalist>, so it works
 * with zero extra JS and degrades to a normal text input everywhere.
 */
export function SuggestInput({
  category, onBlur, className = "", ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { category: string }) {
  const [options, setOptions] = React.useState<string[]>([]);
  const listId = `suggest-${category}`;

  React.useEffect(() => {
    setOptions(getSuggestions(category));
  }, [category]);

  const handleBlur: React.FocusEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value.trim();
    if (value) addSuggestion(category, value);
    onBlur?.(e);
  };

  return (
    <>
      <input
        {...props}
        list={listId}
        onBlur={handleBlur}
        className={`w-full rounded border border-slate-300 p-2 text-sm ${className}`}
      />
      <datalist id={listId}>
        {options.map((opt) => <option key={opt} value={opt} />)}
      </datalist>
    </>
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`w-full rounded border border-slate-300 p-2 text-sm ${props.className || ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`w-full rounded border border-slate-300 p-2 text-sm ${props.className || ""}`} />;
}

export function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "green" | "amber" | "red" | "blue" }) {
  const styles = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-green-100 text-green-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>{children}</span>;
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            {headers.map((h) => (
              <th key={h} className="whitespace-nowrap px-2 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function normalizeSearchValue(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/\s+/g, " ");
}

function normalizePhoneSearchValue(value: unknown): string {
  return normalizeSearchValue(value).replace(/[^\d]/g, "");
}

/**
 * Searchable dropdown for long lists. It intentionally does not render all
 * records on focus; it shows the empty/walk-in option first, then filters
 * only after the user starts typing.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  emptyLabel,
  placeholder,
  minQueryLength = 1,
  searchHint,
  noResultsLabel,
  maxResults = 30,
}: {
  options: { id: string; label: string; sublabel?: string }[];
  value: string;
  onChange: (id: string) => void;
  emptyLabel: string;
  placeholder?: string;
  minQueryLength?: number;
  searchHint?: string;
  noResultsLabel?: string;
  maxResults?: number;
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const selected = options.find((option) => option.id === value);

  React.useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const normalizedQuery = normalizeSearchValue(query);
  const normalizedPhoneQuery = normalizePhoneSearchValue(query);
  const canSearch = normalizedQuery.length >= minQueryLength || normalizedPhoneQuery.length >= minQueryLength;

  const filtered = canSearch
    ? options
        .filter((option) => {
          const label = normalizeSearchValue(option.label);
          const sublabel = normalizeSearchValue(option.sublabel);
          const phone = normalizePhoneSearchValue(option.sublabel);

          return (
            label.includes(normalizedQuery) ||
            sublabel.includes(normalizedQuery) ||
            Boolean(normalizedPhoneQuery && phone.includes(normalizedPhoneQuery))
          );
        })
        .slice(0, maxResults)
    : [];

  const displayValue = open
    ? query
    : selected
    ? `${selected.label}${selected.sublabel ? ` (${selected.sublabel})` : ""}`
    : "";

  return (
    <div ref={wrapperRef} className="relative">
      <input
        className="w-full rounded border border-slate-300 p-2 text-sm"
        value={displayValue}
        placeholder={placeholder || emptyLabel}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
      />

      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
              setQuery("");
            }}
            className="block w-full border-b border-slate-100 px-3 py-2 text-start text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            {emptyLabel}
          </button>

          {!canSearch && (
            <div className="px-3 py-2 text-sm text-slate-400">
              {searchHint || "اكتب للبحث"}
            </div>
          )}

          {canSearch &&
            filtered.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                  setQuery("");
                }}
                className="block w-full px-3 py-2 text-start text-sm hover:bg-slate-50"
              >
                {option.label} {option.sublabel && <span className="text-slate-400">({option.sublabel})</span>}
              </button>
            ))}

          {canSearch && filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-400">
              {noResultsLabel || "لا توجد نتائج مطابقة"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
