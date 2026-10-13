// Pílulas de filtro com contagem (.chips/.chip/.cnt do mockup).
//
// API:
//   <FilterPills ariaLabel="Estado" value={status} onChange={setStatus}
//     options={[{ value: "all", label: "Todas", count: 12 }, { value: "pending", label: "Pendente", count: 3 }]} />
//   Opção: { value, label, count?, hint?, isNew?, disabled?, pressed?, onSelect? }
//     count null/undefined = sem número (ex.: a carregar); 0 mostra "0".
//     pressed/onSelect substituem a regra value===valor/onChange — para pílulas
//     que são um interruptor à parte (ex.: "Prontas a expedir" nas ECs).
//   <FilterPill pressed onClick count>…</FilterPill> — uma pílula avulsa.
// Cada pílula é um botão com aria-pressed; o grupo tem role="group".
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FilterPillProps {
  pressed: boolean;
  onClick: () => void;
  count?: number | null;
  /** Texto do title (o porquê/explicação do filtro). */
  hint?: string;
  /** Distintivo "Novo" do mockup. */
  isNew?: boolean;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

export function FilterPill({ pressed, onClick, count, hint, isNew, disabled, children, className }: FilterPillProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      title={hint}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-[5px] text-[13px] font-[550] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        pressed ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground",
        className,
      )}
    >
      {children}
      {isNew ? (
        <span
          className={cn(
            "rounded-md px-1.5 text-[10.5px] font-bold",
            pressed ? "bg-primary-foreground/20 text-primary-foreground" : "bg-accent/10 text-accent",
          )}
        >
          Novo
        </span>
      ) : null}
      {count != null ? <span className="text-[11.5px] tabular-nums opacity-80">{count}</span> : null}
    </button>
  );
}

export interface FilterPillOption<V extends string = string> {
  value: V;
  label: ReactNode;
  count?: number | null;
  hint?: string;
  isNew?: boolean;
  disabled?: boolean;
  /** Estado próprio (interruptor à parte); por omissão value === valor do grupo. */
  pressed?: boolean;
  /** Ação própria; por omissão onChange(value). */
  onSelect?: () => void;
}

interface FilterPillsProps<V extends string> {
  options: readonly FilterPillOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Nome do grupo para leitores de ecrã (ex.: "Estado"). */
  ariaLabel: string;
  className?: string;
}

export function FilterPills<V extends string>({ options, value, onChange, ariaLabel, className }: FilterPillsProps<V>) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => (
        <FilterPill
          key={o.value}
          pressed={o.pressed ?? o.value === value}
          onClick={o.onSelect ?? (() => onChange(o.value))}
          count={o.count}
          hint={o.hint}
          isNew={o.isNew}
          disabled={o.disabled}
        >
          {o.label}
        </FilterPill>
      ))}
    </div>
  );
}
