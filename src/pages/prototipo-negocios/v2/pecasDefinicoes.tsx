// As peças comuns das Definições da V2 (secção com "?", subtítulo com âncora, escolhas em chips, passo
// de mais/menos, interruptor e chip). Saíram do DefinicoesV2.tsx para as secções novas as usarem.
import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { AjudaBotao, AjudaTexto, ComAjuda } from "./Ajuda";

export const CARTAO = "divide-y divide-border rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]";
export const LINHA = "flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5";
export const INP = "h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
export const BTN = "h-11 px-4 text-[15px]";

export function Secao({ id, titulo, ajuda, children }: { id: string; titulo: string; ajuda: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-t`} className="mt-14">
      <ComAjuda titulo={titulo}>
        <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
          <h2 id={id} tabIndex={-1} className="scroll-mt-6 text-xl font-semibold outline-none"><span id={`${id}-t`}>{titulo}</span></h2>
          <AjudaBotao />
        </div>
        <AjudaTexto>{ajuda}</AjudaTexto>
      </ComAjuda>
      {children}
    </section>
  );
}

export function Sub({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <div className="mt-6">
      <h3 id={id} tabIndex={-1} className="mb-2 scroll-mt-6 text-base font-semibold outline-none">{titulo}</h3>
      {children}
    </div>
  );
}

export function Escolhas({ rot, op, v, onSet }: { rot: string; op: string[]; v: string; onSet: (v: string) => void }) {
  return (
    <div role="group" aria-label={rot} className={LINHA}>
      <span className="w-32 shrink-0 text-[15px] font-medium">{rot}</span>
      <span className="flex flex-1 flex-wrap gap-2">
        {op.map((o) => (
          <button key={o} type="button" aria-pressed={v === o} onClick={() => v !== o && onSet(o)}
            className={cn("inline-flex min-h-11 items-center rounded-full border px-4 text-[15px]", v === o ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-muted")}>{o}</button>
        ))}
      </span>
    </div>
  );
}

export function Passo({ rot, v, un, onSet, passo = 1, max, min = 0, mostrar }: { rot: string; v: number; un: string; onSet: (n: number) => void; passo?: number; max: number; min?: number; mostrar?: (n: number) => string }) {
  return (
    <div role="group" aria-label={rot} className={cn(LINHA, "justify-between")}>
      <span className="text-[15px] font-medium">{rot}</span>
      <span className="inline-flex items-center rounded-lg border border-input bg-card p-0.5">
        <button type="button" aria-label={`Menos · ${rot}`} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted" onClick={() => onSet(Math.max(min, v - passo))}><Minus className="h-4 w-4" /></button>
        <output className="min-w-16 px-1 text-center text-[16px] font-medium tabular-nums">{mostrar ? mostrar(v) : un === "€" ? `${v} €` : `${v}${un}`}</output>
        <button type="button" aria-label={`Mais · ${rot}`} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted" onClick={() => onSet(Math.min(max, v + passo))}><Plus className="h-4 w-4" /></button>
      </span>
    </div>
  );
}

export function Interruptor({ on, onClick, titulo, texto }: { on: boolean; onClick: () => void; titulo: string; texto: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick} className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left">
      <span><span className="block text-[15px] font-medium">{titulo}</span><span className="block text-[15px] text-muted-foreground">{texto}</span></span>
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-input")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cn("inline-flex min-h-11 items-center rounded-full border px-4 text-[15px]", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-muted")}>{children}</button>
  );
}
