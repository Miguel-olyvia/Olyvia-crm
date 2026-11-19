// 19/11 (auditoria): no fluxo do Estúdio a Visita só mostra o exterior, o interior e o Estúdio; o passo «Visitas» saiu da lista. Com a única
// visita cancelada, «Fechar o levantamento» ficava bloqueado e não havia onde marcar outra. Agora as visitas ficam no topo do passo Estúdio:
// remarcar, cancelar e marcar outra. Numa organização real, quem monta os passos (comVisitasDoCrm) põe aqui as visitas da agenda do CRM
// (VisitasDoCrm) por este contexto; sem ele, as do protótipo (VisitasLista).
import { createContext, useContext, type ReactNode } from "react";
import { CalendarClock, ChevronDown } from "lucide-react";
import { campoVisita, visitaFeita, visitas, type Negocio } from "./motor";
import { VisitasLista } from "./Visitas";
import type { Ctx } from "./pecas";

/** As visitas da agenda do CRM, para o bloco «Visitas» do passo Estúdio (null: as do protótipo). */
export const VisitasDoEstudioCtx = createContext<ReactNode | null>(null);

/** Há uma visita que conta (feita, ou marcada e não cancelada)? Sem nenhuma, o levantamento não fecha (motor, extrasVisita). */
export const temVisitaAtiva = (d: Negocio): boolean => visitaFeita(d) || visitas(d).some((n) => campoVisita(d, n, "estado") !== "Cancelada");

/** O resumo do bloco: a visita que conta (dia e hora) ou o que falta. */
export function resumoDasVisitas(d: Negocio): string {
  const ns = visitas(d);
  if (!ns.length) return "por marcar";
  if (!temVisitaAtiva(d)) return ns.length === 1 ? "a única visita foi cancelada" : "todas canceladas";
  const n = ns.find((x) => campoVisita(d, x, "estado") === "Marcada") ?? ns.find((x) => campoVisita(d, x, "estado") === "Feita") ?? ns[0];
  const data = campoVisita(d, n, "data"), m = /^\d{4}-(\d{2})-(\d{2})/.exec(data);
  return [`${ns.length} ${ns.length === 1 ? "visita" : "visitas"}`, m ? `${m[2]}/${m[1]}` : "", campoVisita(d, n, "hora"), campoVisita(d, n, "estado").toLowerCase()].filter(Boolean).join(" · ");
}

/** O bloco das visitas, dobrado como os do fecho; abre (e acende) quando falta uma visita que conte. */
export function VisitasNoEstudio({ ctx, d, falta }: { ctx: Ctx; d: Negocio; falta: number }) {
  const crm = useContext(VisitasDoEstudioCtx);
  return (
    <details className="group rounded-2xl border border-border bg-card p-4" open={!!falta || undefined} data-bloco="visitas">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <CalendarClock className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold">Visitas{falta ? <span className="ml-2 rounded-full bg-destructive/10 px-2 text-xs font-medium text-destructive">falta {falta}</span> : null}</span>
            <span className="block truncate text-sm text-muted-foreground">{resumoDasVisitas(d)}</span>
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-3 pt-4">
        {/* a lista do protótipo já diz que estão todas canceladas; a do CRM não */}
        {crm != null && !temVisitaAtiva(d) && <p role="alert" className="text-[15px] font-medium text-destructive">{visitas(d).length > 1 ? "Marque outra visita (todas foram canceladas)." : visitas(d).length ? "Marque outra visita (a única foi cancelada)." : "Marque a visita."}</p>}
        {crm ?? <VisitasLista ctx={ctx} d={d} simples />}
      </div>
    </details>
  );
}
