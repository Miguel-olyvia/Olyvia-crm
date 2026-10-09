// Peças comuns do protótipo de Negócios.
import type { ReactNode } from "react";
import { Euro, FileSignature, Hammer, Phone, Ruler, Target, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Estado, acoes } from "./motor";

export interface Ctx {
  S: Estado;
  A: ReturnType<typeof acoes>;
  run: (fn: () => void) => void;
  go: (fn: () => void) => () => void;
  q: string;
  setQ?: (v: string) => void;
  repor: () => void;
}

/* ------------------------------------------------------------------ peças */
export function Btn({ children, onClick, cls = "", disabled }: { children: ReactNode; onClick?: () => void; cls?: string; disabled?: boolean }) {
  return <button className={"btn " + cls} onClick={onClick} disabled={disabled}>{children}</button>;
}

// Campo que grava ao sair (ou com Enter), como o "change" do protótipo.
export function Campo({ id, value, onCommit, readOnly, placeholder, className, type, ariaLabel, min, step }: {
  id: string; value: string | number; onCommit: (v: string) => void; readOnly?: boolean; placeholder?: string; className?: string; type?: string; ariaLabel?: string; min?: string; step?: string;
}) {
  return (
    <input
      key={id + ":" + value}
      id={id} defaultValue={value} readOnly={readOnly} placeholder={placeholder} className={className} type={type} aria-label={ariaLabel} min={min} step={step}
      onBlur={(e) => { if (!readOnly && e.target.value !== String(value)) onCommit(e.target.value); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );
}
export const numero = (v: string) => parseFloat(String(v).replace(",", "."));

export function Banner({ A, go, texto }: { A: Ctx["A"]; go: Ctx["go"]; texto: string }) {
  return (
    <div className="banner">
      <b>Como experimentar:</b> abra a <button className="link" onClick={go(() => A.abrir(1043))}>Ana Martins</button> {texto}
    </div>
  );
}

/** Seis segmentos finos: em que fase está o negócio, de relance. */
export function Progresso({ fase, className = "" }: { fase: number; className?: string }) {
  return (
    <span className={"flex gap-1 " + className} role="img" aria-label={`Fase ${fase + 1} de 6`}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={"h-1 flex-1 rounded-full " + (i < fase ? "bg-primary" : i === fase ? "bg-primary/40" : "bg-border")} />
      ))}
    </span>
  );
}

// Os botões de "próximo passo" chamam a ação pelo nome.
export function fazer(A: Ctx["A"], act: string, id: number) {
  const f = (A as unknown as Record<string, (id: number) => void>)[act];
  if (f) f(id);
}

/* A cor de cada fase: só nos ícones, nunca no texto, para ajudar a reconhecer de relance. */
export const FASE_ICONE: LucideIcon[] = [Target, Phone, Ruler, FileSignature, Euro, Hammer];
export const FASE_COR = [
  "bg-sky-100 text-sky-700", "bg-teal-100 text-teal-700", "bg-amber-100 text-amber-800",
  "bg-violet-100 text-violet-700", "bg-emerald-100 text-emerald-700", "bg-orange-100 text-orange-700",
];
export function IconeFase({ fase, tam = "md", className }: { fase: number; tam?: "sm" | "md" | "lg"; className?: string }) {
  const I = FASE_ICONE[fase];
  const t = { sm: "h-7 w-7 rounded-lg [&_svg]:h-4 [&_svg]:w-4", md: "h-10 w-10 rounded-xl [&_svg]:h-5 [&_svg]:w-5", lg: "h-14 w-14 rounded-2xl [&_svg]:h-7 [&_svg]:w-7" }[tam];
  return <span className={cn("grid shrink-0 place-items-center", t, FASE_COR[fase], className)} aria-hidden="true"><I /></span>;
}

/** Um ícone num quadrado de cor suave (para blocos e secções). */
export function Chip({ icone: I, cor, className }: { icone: LucideIcon; cor: string; className?: string }) {
  return <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl [&_svg]:h-[18px] [&_svg]:w-[18px]", cor, className)} aria-hidden="true"><I /></span>;
}
