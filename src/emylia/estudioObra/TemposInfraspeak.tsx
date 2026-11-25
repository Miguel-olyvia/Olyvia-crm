// 25/11 (Rúben: «garantir que os tempos, os serviços e as microtarefas das obras estejam perfeitos a partir dos dados do Infraspeak»).
// No Plano do Estúdio da obra: por tarefa, as horas do plano e as que as microtarefas somam (as horas previstas das tarefas reais da Mudelar
// no Infraspeak, ou as da ficha do serviço). O gestor usa as do Infraspeak tarefa a tarefa (A.ajustarTarefa: as datas seguem). Sem «usar
// em todas»: as horas do Infraspeak são de uma obra-tipo e não crescem com a quantidade; decide-se uma a uma. Só nas tarefas que ainda se mexem; com a obra em curso, mais horas pedem «Porquê?» (quem paga), como sempre.
import { useState } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { nfmt, r2, type Negocio } from "../motor";
import type { Ctx } from "../pecas";
import { esperaDasMicro, microtarefasDe } from "../microtarefas";
import { FASES_OBRA } from "../fasesObra";
import { nomeCurtoTarefa } from "./planoVivo";
import { ordemDasTarefas } from "../ordemPlano";

export interface TempoTarefa { ti: number; plano: number; infraspeak: number; n: number; /** dias de espera */ espera: number }

/** As tarefas cujas microtarefas trazem horas (todas), com a soma; pela ordem da lista. */
export function temposDoInfraspeak(d: Negocio, S: Ctx["S"]): TempoTarefa[] {
  const p = d.obra.plano;
  if (!p) return [];
  return ordemDasTarefas(p).flatMap((ti) => {
    const t = p.tasks[ti], r = microtarefasDe(t, S, p);
    if (r.origem === "instrucoes" || r.origem === "catalogo" || !r.L.length || r.L.some((m) => m.h == null && m.dias == null)) return [];
    return [{ ti, plano: t.h, infraspeak: r2(r.L.reduce((a, m) => a + (m.h ?? 0), 0)), n: r.L.length, espera: esperaDasMicro(t, S, p) }];
  });
}
const difere = (x: TempoTarefa) => Math.abs(x.infraspeak - x.plano) >= 0.25;

export function TemposInfraspeak({ ctx, d, podeMexer, mudar }: { ctx: Ctx; d: Negocio; podeMexer: (ti: number) => boolean; mudar: (ti: number, fn: () => void) => void }) {
  const { S } = ctx;
  const [aberto, setAberto] = useState(false);
  const p = d.obra.plano!;
  const L = temposDoInfraspeak(d, S);
  if (!L.length) return null;
  const vivo = p.estado === "em curso";
  const porUsar = L.filter((x) => difere(x) && podeMexer(x.ti));
  const tPlano = r2(L.reduce((a, x) => a + x.plano, 0)), tInf = r2(L.reduce((a, x) => a + x.infraspeak, 0));
  return (
    <section aria-labelledby="tempos-inf" className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="tempos-inf" className="flex items-center gap-2 text-[15px] font-semibold"><Clock className="h-4 w-4 text-primary" aria-hidden="true" />Tempos pelo Infraspeak</h2>
          <p className="text-sm text-muted-foreground">
            {L.length} {L.length === 1 ? "tarefa" : "tarefas"} com horas nas microtarefas: <b className="tabular-nums">{nfmt(tPlano)} h</b> no plano, <b className="tabular-nums">{nfmt(tInf)} h</b> pelo Infraspeak.
            {porUsar.length ? ` ${porUsar.length} ${porUsar.length === 1 ? "difere" : "diferem"}.` : " Batem certo."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" className="min-h-10" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>{aberto ? "Esconder" : "Ver tarefa a tarefa"}</Button>
        </div>
      </div>
      {aberto && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Tarefa</th><th className="px-3 py-2 text-right font-medium">Plano</th><th className="px-3 py-2 text-right font-medium">Infraspeak</th>
              <th className="px-3 py-2 text-right font-medium">Diferença</th><th className="px-3 py-2"><span className="sr-only">Usar</span></th>
            </tr></thead>
            <tbody>
              {L.map((x) => {
                const t = p.tasks[x.ti], dif = r2(x.infraspeak - x.plano), mexe = podeMexer(x.ti);
                return (
                  <tr key={x.ti} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2"><span className="font-medium" title={t.nome}>{nomeCurtoTarefa(t.nome)}</span><span className="block text-xs text-muted-foreground">Fase {t.fase ?? 1} · {FASES_OBRA[(t.fase ?? 1) - 1]?.curto} · {x.n} microtarefas</span></td>
                    <td className="px-3 py-2 text-right tabular-nums">{nfmt(x.plano)} h</td>
                    <td className="px-3 py-2 text-right tabular-nums">{nfmt(x.infraspeak)} h{x.espera > 0 && <span className="block text-xs text-muted-foreground">+ {x.espera} {x.espera === 1 ? "dia" : "dias"} de espera</span>}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", difere(x) ? (dif > 0 ? "text-amber-800 dark:text-amber-300" : "text-primary") : "text-muted-foreground")}>{difere(x) ? `${dif > 0 ? "+" : "−"}${nfmt(Math.abs(dif))} h` : "igual"}</td>
                    <td className="px-3 py-2 text-right">{difere(x) && mexe && (
                      <Button type="button" variant="ghost" size="sm" className="min-h-9" onClick={() => mudar(x.ti, () => ctx.A.ajustarTarefa(d.id, x.ti, { h: x.infraspeak }))}>Usar {nfmt(x.infraspeak)} h</Button>
                    )}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">Regra: uma tarefa nunca tem menos horas do que as microtarefas somam, nem menos dias do que esse trabalho mais os dias de espera (secagens); sobe sozinha nas que não começaram. As horas do Infraspeak são as previstas para uma obra-tipo da Mudelar; as do plano vêm do orçamento (as horas do serviço × a quantidade). Usar muda os dias da tarefa e as datas das que vêm a seguir.{vivo ? " Com a obra em curso, mais horas pedem «Porquê?»." : ""}</p>
        </div>
      )}
    </section>
  );
}
