import { useEffect, useRef, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import { Check, CheckCircle, Clock, FileText, Upload } from "./icons";
import { ConfirmDialog, cx } from "./ui";
import type { DucStatus } from "../lib/types";

interface StatusDef {
  key: DucStatus;
  label: string;
  pill: string;
  dot: string;
  /** Fundo + cor do círculo do icon. */
  chip: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const STATUSES: StatusDef[] = [
  { key: "draft", label: "Rascunho", pill: "bg-slate-100 text-slate-700 ring-slate-200", dot: "bg-slate-400", chip: "bg-slate-100 text-slate-600", Icon: FileText },
  { key: "in_progress", label: "Em curso", pill: "bg-amber-100 text-amber-700 ring-amber-200", dot: "bg-amber-500", chip: "bg-amber-100 text-amber-600", Icon: Clock },
  { key: "delivered", label: "Entregue", pill: "bg-blue-100 text-blue-700 ring-blue-200", dot: "bg-blue-500", chip: "bg-blue-100 text-blue-600", Icon: Upload },
  { key: "closed", label: "Fechado", pill: "bg-emerald-100 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-600", Icon: CheckCircle },
];

export function StatusSelect({
  value,
  onChange,
}: {
  value: DucStatus;
  onChange: (v: DucStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  // Estado escolhido a aguardar confirmação (mudar o estado é uma ação com peso).
  const [pending, setPending] = useState<StatusDef | null>(null);
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
          "inline-flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-3 text-sm font-medium ring-1 ring-inset transition-shadow hover:shadow-sm",
          current.pill
        )}
      >
        <span className={cx("inline-flex h-6 w-6 items-center justify-center rounded-md", current.chip)}>
          <current.Icon width={14} height={14} />
        </span>
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
                setOpen(false);
                // Só pede confirmação se for mesmo uma mudança.
                if (s.key !== value) setPending(s);
              }}
              className={cx(
                "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-slate-50",
                s.key === value ? "font-medium text-slate-900" : "text-slate-600"
              )}
            >
              <span className={cx("inline-flex h-7 w-7 items-center justify-center rounded-lg", s.chip)}>
                <s.Icon width={15} height={15} />
              </span>
              {s.label}
              {s.key === value && <Check width={15} height={15} className="ml-auto text-brand" />}
            </button>
          ))}
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title="Mudar o estado do DUC"
          tone="brand"
          confirmLabel={
            <>
              <pending.Icon width={15} height={15} /> Mudar para {pending.label}
            </>
          }
          icon={<pending.Icon width={18} height={18} />}
          message={
            <>
              Tens a certeza que queres mudar o estado de{" "}
              <span className="font-medium text-slate-800">{current.label}</span> para{" "}
              <span className="font-medium text-slate-800">{pending.label}</span>?
            </>
          }
          onCancel={() => setPending(null)}
          onConfirm={() => {
            onChange(pending.key);
            setPending(null);
          }}
        />
      )}
    </div>
  );
}
