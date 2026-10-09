// Peças comuns do protótipo de Negócios.
import type { ReactNode } from "react";
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

// Os botões de "próximo passo" chamam a ação pelo nome.
export function fazer(A: Ctx["A"], act: string, id: number) {
  const f = (A as unknown as Record<string, (id: number) => void>)[act];
  if (f) f(id);
}
