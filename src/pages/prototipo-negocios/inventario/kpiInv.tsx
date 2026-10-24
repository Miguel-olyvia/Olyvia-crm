// O cartão de métrica do Inventário, com as classes do mockup (função kpi()): rótulo, valor grande a cor do tom, nota. Com `aoClicar` é um botão que filtra.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface KpiProps { rotulo: string; valor: string; nota?: string; tom?: "ok" | "warn" | "bad" | "info"; acaoRotulo?: string; aoClicar?: () => void; fonte?: string }

export function Kpi({ rotulo, valor, nota, tom, acaoRotulo, aoClicar, fonte }: KpiProps) {
  const corpo = (
    <>
      <span className="kl">{rotulo}</span><span className="kv">{valor}</span>{nota ? <span className="kh">{nota}</span> : null}
      {fonte ? <span className="src" title="Fonte de dados">{fonte}</span> : null}
      {acaoRotulo ? <span className="sr">. {acaoRotulo}</span> : null}
    </>
  );
  const cls = cn("kpi", tom && `k-${tom}`);
  return aoClicar ? <button type="button" className={cls} onClick={aoClicar}>{corpo}</button> : <div className={cls}>{corpo}</div>;
}

/** A grelha dos cartões (classe .kpis do mockup). */
export const Kpis = ({ children }: { children: ReactNode }) => <div className="kpis">{children}</div>;
