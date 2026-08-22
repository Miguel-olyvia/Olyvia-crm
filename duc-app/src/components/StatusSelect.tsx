import { useEffect, useRef, useState } from "react";
import { Check } from "./icons";
import { cx } from "./ui";
import type { DucStatus } from "../lib/types";

interface StatusDef {
  key: DucStatus;
  label: string;
  pill: string;
  dot: string;
}

const STATUSES: StatusDef[] = [
  { key: "draft", label: "Rascunho", pill: "bg-slate-100 text-slate-700 ring-slate-200", dot: "bg-slate-400" },
  { key: "in_progress", label: "Em curso", pill: "bg-amber-100 text-amber-700 ring-amber-200", dot: "bg-amber-500" },
  { key: "delivered", label: "Entregue", pill: "bg-blue-100 text-blue-700 ring-blue-200", dot: "bg-blue-500" },
  { key: "closed", label: "Fechado", pill: "bg-emerald-100 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
];

export function StatusSelect({
  value,
  onChange,
}: {
  value: DucStatus;
  onChange: (v: DucStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = STATUSES.find((s) => s.key === value) ?? STATUSES[0];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cx(
          "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition-shadow hover:shadow-sm",
          current.pill
        )}
      >
        <span className={cx("h-2 w-2 rounded-full", current.dot)} />
        {current.label}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-elevated animate-in-pop">
          {STATUSES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                onChange(s.key);
                setOpen(false);
              }}
              className={cx(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-slate-50",
                s.key === value ? "font-medium text-slate-900" : "text-slate-600"
              )}
            >
              <span className={cx("h-2 w-2 rounded-full", s.dot)} />
              {s.label}
              {s.key === value && <Check width={15} height={15} className="ml-auto text-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
