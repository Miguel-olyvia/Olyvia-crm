// 12/11 (Rúben: «a plataforma deve sugerir no fim da fase da visita»). No fecho da visita (o passo «Fechar» do Estúdio e o plano da obra da
// visita), a Olyvia procura sozinha os próximos dias de início em que todos os técnicos da obra estão livres (a mesma agenda do plano:
// preparacaoObra.cargaDosTecnicos, em horas, só obras aprovadas ou em curso, mais as férias do RH) e mostra-os com quem vem e quando a
// obra fica pronta. O comercial escolhe um num toque (muda o dia de início do plano, que passa ao orçamento ao fechar a visita).
import { useMemo, useRef } from "react";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { dataCurta, diasDaObra, isoDia, proximoUtil } from "./planoObra";
import type { PlanoDatas } from "./planoDaVisita";

export interface DataSugerida { iso: string; P: PlanoDatas }

/** Os próximos `n` dias de início (a partir de amanhã, `semanas` semanas de dias úteis) em que nenhuma tarefa fica com o técnico ocupado. */
export function datasComTodosLivres(calcular: (iso: string) => PlanoDatas, opts: { n?: number; semanas?: number; hoje?: Date } = {}): DataSugerida[] {
  const hoje = opts.hoje ?? new Date(), n = opts.n ?? 3;
  const out: DataSugerida[] = [];
  const amanha = proximoUtil(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1));
  for (const d of diasDaObra(amanha, (opts.semanas ?? 10) * 5)) {
    const iso = isoDia(d), P = calcular(iso);
    if (!P.tarefas.length) break;
    if (P.tarefas.some((t) => t.ocupado)) continue;
    out.push({ iso, P });
    if (out.length >= n) break;
  }
  return out;
}

export function SugestaoDatasObra({ P, inicio, calcular, mudarInicio }: { P: PlanoDatas; inicio: string; calcular: (iso: string) => PlanoDatas; mudarInicio: (iso: string) => void }) {
  // a conta só se refaz quando a obra muda (as tarefas, as horas, quem foi escolhido à mão), não a cada desenho nem quando o dia muda
  const ref = useRef(calcular);
  ref.current = calcular;
  const assinatura = P.tarefas.map((t) => `${t.chave}|${t.h}|${t.dur}|${t.aMao ? t.tec : ""}`).join(";") + `#${P.equipas.map((e) => e.id).join(",")}`;
  const L = useMemo(() => (P.tarefas.length ? datasComTodosLivres((iso) => ref.current(iso)) : []), [assinatura]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!P.tarefas.length) return null;
  const ocupadas = P.tarefas.filter((t) => t.ocupado).length;
  return (
    <section aria-label="Datas possíveis para a obra" className="space-y-2 rounded-xl border border-primary/30 bg-primary/[0.04] p-4">
      <p className="flex items-center gap-2 text-[15px] font-semibold"><Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />A Olyvia sugere: dias com a equipa livre</p>
      {ocupadas > 0 && <p className="text-sm text-amber-800 dark:text-amber-300">No dia escolhido, {ocupadas} {ocupadas === 1 ? "tarefa fica" : "tarefas ficam"} com o técnico ocupado. A proposta só sai com todos livres.</p>}
      {L.length ? (
        <ul className="grid gap-2 sm:grid-cols-3">
          {L.map(({ iso, P: Q }, k) => {
            const on = iso === inicio;
            const quem = Q.equipa.map((x) => x.n.split(" ")[0]);
            return (
              <li key={iso}>
                <button type="button" aria-pressed={on} onClick={() => mudarInicio(iso)}
                  className={cn("flex min-h-11 w-full flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors",
                    on ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-input bg-card hover:border-primary/50")}>
                  <span className="flex w-full items-center justify-between gap-2 text-[15px] font-semibold">
                    Começar a {Q.inicio ? dataCurta(Q.inicio) : iso}
                    {on ? <Check className="h-4 w-4 text-primary" aria-label="Escolhido" /> : k === 0 ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">A mais cedo</span> : null}
                  </span>
                  <span className="text-sm text-muted-foreground">{Q.dias} {Q.dias === 1 ? "dia útil" : "dias úteis"}{Q.fim ? ` · pronta a ${dataCurta(Q.fim)}` : ""}</span>
                  <span className="text-sm">{quem.length ? quem.join(", ") : "Sem técnicos do RH"}{Q.porAtribuir ? <span className="text-muted-foreground"> · {Q.porAtribuir} por atribuir</span> : null}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-muted-foreground">Nas próximas 10 semanas não há um dia em que fiquem todos livres: troque o técnico das tarefas ocupadas.</p>}
    </section>
  );
}
