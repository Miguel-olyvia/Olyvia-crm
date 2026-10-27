// Um cartão de métrica dos dashboards: o nome, o número grande e, se houver, uma linha pequena. Com `aoClicar` é um botão (aplica o filtro e muda de vista);
// sem ele é só informação. Texto de 15 px no mínimo; números alinhados (tabular-nums); o alvo tem pelo menos 44 px.
import { cn } from "@/lib/utils";

interface KpiProps {
  rotulo: string;
  valor: string;
  nota?: string;
  /** O que o botão faz, só para leitores de ecrã (por exemplo "Filtrar por Lisboa: 10 pessoas"). */
  acaoRotulo?: string;
  aoClicar?: () => void;
}

const BASE = "block min-h-11 w-full rounded-xl border border-border bg-card p-4 text-left";
const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export function Kpi({ rotulo, valor, nota, acaoRotulo, aoClicar }: KpiProps) {
  const corpo = (
    <>
      <span className="block text-[15px] text-muted-foreground">{rotulo}</span>
      <span className="mt-1 block text-2xl font-semibold leading-tight tracking-tight tabular-nums text-foreground">{valor}</span>
      {nota && <span className="mt-1 block text-[15px] leading-5 text-muted-foreground">{nota}</span>}
    </>
  );
  if (!aoClicar) return <div className={BASE}>{corpo}</div>;
  return (
    <button type="button" onClick={aoClicar} className={cn(BASE, "cursor-pointer transition-colors duration-150 hover:border-foreground motion-reduce:transition-none", FOCO)}>
      {corpo}
      {acaoRotulo && <span className="sr-only">. {acaoRotulo}</span>}
    </button>
  );
}

/** A grelha dos cartões: uma coluna no telemóvel, e as que couberem (cada uma com 11 rem no mínimo) no resto. */
export function GrelhaKpi({ children, nome }: { children: React.ReactNode; nome: string }) {
  return <section aria-label={nome} className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">{children}</section>;
}
