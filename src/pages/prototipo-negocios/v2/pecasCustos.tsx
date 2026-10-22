// Peças pequenas do Catálogo e custos da V2: campos que gravam ao sair, escolhas,
// contador, o ícone de cada alerta e o botão de retirar. Alvos de 44 px, texto a 15 px,
// cor só nos ícones.
import type { ReactNode } from "react";
import { CircleAlert, Clock, MessageSquareWarning, Minus, PackageX, Plus, Trash2, TriangleAlert, UserX, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { numero } from "../pecas";
import type { AlertaCat, IdAlerta } from "./custosModelo";

export const CAMPO = "h-11 rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";

/** Número que grava ao sair (ou com Enter). Aceita vírgula. */
export function NumeroCelula({ rotulo, v, onSet, w = "w-24", min = 0, id }: { rotulo: string; v: number; onSet: (n: number) => void; w?: string; min?: number; id?: string }) {
  return (
    <input id={id} key={v} type="text" inputMode="decimal" aria-label={rotulo} defaultValue={String(v).replace(".", ",")}
      className={cn(CAMPO, "text-right tabular-nums", w)}
      onBlur={(e) => { const n = numero(e.target.value); if (!isNaN(n) && n >= min && n !== v) onSet(n); else e.target.value = String(v).replace(".", ","); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );
}
/** Texto que grava ao sair (ou com Enter); vazio não grava. */
export function TextoCelula({ rotulo, v, onSet, w = "w-full" }: { rotulo: string; v: string; onSet: (s: string) => void; w?: string }) {
  return (
    <input key={v} type="text" aria-label={rotulo} defaultValue={v} className={cn(CAMPO, w)}
      onBlur={(e) => { const s = e.target.value.trim(); if (s && s !== v) onSet(s); else e.target.value = v; }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );
}
export function Escolha({ rotulo, v, opcoes, onSet, w = "w-full" }: { rotulo: string; v: string; opcoes: readonly (string | { v: string; t: string })[]; onSet: (s: string) => void; w?: string }) {
  return (
    <select aria-label={rotulo} value={v} onChange={(e) => onSet(e.target.value)} className={cn(CAMPO, "pr-8", w)}>
      {opcoes.map((o) => typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.v} value={o.v}>{o.t}</option>)}
    </select>
  );
}
export function Contador({ id, rotulo, v, onSet, un = "%", passo = 1, minimo = 0, maximo = 90 }: { id: string; rotulo: ReactNode; v: number; onSet: (n: number) => void; un?: string; passo?: number; minimo?: number; maximo?: number }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 py-2">
      <span className="text-[15px]" id={id}>{rotulo}</span>
      <div role="group" aria-labelledby={id} className="inline-flex items-center rounded-lg border border-input bg-card p-0.5">
        <button type="button" aria-label="Menos" disabled={v <= minimo} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted disabled:opacity-40" onClick={() => onSet(Math.max(minimo, v - passo))}><Minus className="h-4 w-4" aria-hidden="true" /></button>
        <output className="w-20 text-center text-[16px] font-medium tabular-nums">{String(v).replace(".", ",")}{un === "%" ? "%" : ` ${un}`}</output>
        <button type="button" aria-label="Mais" disabled={v >= maximo} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted disabled:opacity-40" onClick={() => onSet(Math.min(maximo, v + passo))}><Plus className="h-4 w-4" aria-hidden="true" /></button>
      </div>
    </div>
  );
}
export function Retirar({ rotulo, onClick, disabled }: { rotulo: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" aria-label={rotulo} title={rotulo} onClick={onClick} disabled={disabled}
      className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40">
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

/** O ícone de cada alerta (a cor fica só no ícone). */
export const ICONE_ALERTA: Record<IdAlerta, { I: LucideIcon; cor: string }> = {
  "sem-receita": { I: PackageX, cor: "text-warning" },
  "sem-custo-hora": { I: UserX, cor: "text-destructive" },
  "sem-tecnicos": { I: UserX, cor: "text-warning" },
  "subempreitada": { I: PackageX, cor: "text-warning" },
  "desatualizado": { I: Clock, cor: "text-warning" },
  "abaixo-custo": { I: CircleAlert, cor: "text-destructive" },
  "abaixo-minimo": { I: TriangleAlert, cor: "text-destructive" },
  "justificacao": { I: MessageSquareWarning, cor: "text-warning" },
};
export function IconeAlerta({ a, className }: { a: AlertaCat; className?: string }) {
  const { I, cor } = ICONE_ALERTA[a.id];
  return <I className={cn("h-5 w-5 shrink-0", cor, className)} aria-hidden="true" />;
}
/** Os alertas por extenso: ícone, título e explicação. */
export function ListaAlertas({ A }: { A: AlertaCat[] }) {
  if (!A.length) return null;
  return (
    <ul className="space-y-3" aria-label="Alertas">
      {A.map((a) => (
        <li key={a.id} className="flex items-start gap-3">
          <IconeAlerta a={a} className="mt-0.5" />
          <span><span className="block text-[15px] font-medium">{a.t}{a.k === "x" ? " · bloqueia" : ""}</span><span className="block text-[15px] text-muted-foreground">{a.d}</span></span>
        </li>
      ))}
    </ul>
  );
}
