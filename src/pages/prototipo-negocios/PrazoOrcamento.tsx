// O prazo previsto no orçamento (13/10/2026): um Gantt sem técnicos (ganttOrcamento.ts). Cada tarefa numa linha,
// com a barra no seu dia; toca-se para ver o custo (mão de obra, equipamento, consumíveis) e mudar os dias.
// Mudar os dias muda as horas e o custo (e a margem lá em cima); o preço ao cliente fica.
import { useState } from "react";
import { AlertTriangle, CalendarDays, ChevronDown, Minus, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { eur, nfmt, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { iconeOficio } from "./LinhasOrcamento";
import { HORAS_DIA, TAREFA_DEMOLICAO, diasDeHoras, diasPrevistos, prazoProposta, tarefasPrevistas } from "./ganttOrcamento";

const dias = (n: number) => `${nfmt(n)} ${n === 1 ? "dia" : "dias"}`;

export function PrazoOrcamento({ ctx, d }: { ctx: Pick<Ctx, "S" | "A" | "run">; d: Negocio }) {
  const { S, A, run } = ctx;
  const fechado = !!d.orc!.enviada, direcao = S.role === "direcao";
  const [aberta, setAberta] = useState<string | null>(null);
  const T = tarefasPrevistas(d, S);
  if (!T.length) return null;
  const total = diasPrevistos(T), escala = Math.max(1, Math.ceil(total));
  const passo = Math.ceil(escala / 10); // no máximo ~10 marcas na régua
  const pos = (x: number) => `${(x / escala) * 100}%`;
  const delta = T.reduce((a, t) => a + t.delta, 0);
  const naProposta = Number(d.f.prazo_exec) || 0, doGantt = prazoProposta(T), segue = !!d.sug?.prazo_exec;

  return (
    <section aria-labelledby={`prazo-${d.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={`prazo-${d.id}`} className="flex items-center gap-2 text-base font-semibold"><CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Prazo previsto</h3>
        <span className="text-sm text-muted-foreground">{dias(total)} úteis · sem técnicos · toque numa tarefa para ver o custo</span>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        Na proposta: <b className="font-semibold text-foreground tabular-nums">{naProposta ? `${naProposta} dias úteis` : "a definir"}</b>
        {naProposta === doGantt ? (segue ? <span>(do prazo previsto)</span> : null) : !fechado && (
          <button type="button" onClick={() => run(() => A.usarPrazoPrevisto(d.id))} className="inline-flex min-h-9 items-center font-medium text-primary underline-offset-4 hover:underline">
            Usar {doGantt} dias na proposta
          </button>
        )}
      </p>
      {delta !== 0 && (
        <p className="mt-1 text-sm text-warning">Os dias mudados à mão {delta > 0 ? "somam" : "tiram"} {eur(Math.abs(delta))} € ao custo do orçamento. O preço ao cliente não muda.</p>
      )}
      <div className="mt-2 rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]">
        {/* a régua dos dias: com as mesmas colunas das linhas, para os dias ficarem por cima das barras */}
        <div className="flex h-7 items-end gap-3 border-b border-border px-3 sm:px-4" aria-hidden="true">
          <span className="w-9 shrink-0" />
          <span className="relative h-full flex-1">
            {Array.from({ length: escala }, (_, k) => k).filter((k) => k % passo === 0).map((k) => (
              <span key={k} className="absolute bottom-1 border-l border-border pl-1 text-xs tabular-nums text-muted-foreground" style={{ left: pos(k) }}><span className="hidden sm:inline">dia </span>{k + 1}</span>
            ))}
          </span>
          <span className="w-24 shrink-0" /><span className="w-4 shrink-0" />
        </div>
        <ul className="divide-y divide-border" aria-label="Tarefas previstas">
          {T.map((t) => {
            const Ic = iconeOficio(t.perfil), aqui = aberta === t.chave;
            const dem = t.chave === TAREFA_DEMOLICAO, veCusto = !dem || direcao; // o custo da demolição só a Direção o vê
            const poucas = t.h < t.hOrc - 1e-9;
            return (
              <li key={t.chave} className="px-3 py-2.5 sm:px-4">
                <button type="button" onClick={() => setAberta(aqui ? null : t.chave)} aria-expanded={aqui}
                  className="flex w-full items-center gap-3 rounded-lg text-left hover:bg-muted/40">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden="true"><Ic className="h-[18px] w-[18px]" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2 text-[15px] font-medium">
                      {t.nome}
                      <span className="text-sm font-normal tabular-nums text-muted-foreground">{dias(t.dias)} · {nfmt(t.h)} h</span>
                      {t.manual && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">mudado</span>}
                    </span>
                    {/* a barra no seu dia */}
                    <span className="relative mt-1.5 block h-2.5 rounded-full bg-muted" aria-hidden="true">
                      <span className={cn("absolute top-0 h-full rounded-full", t.manual ? "bg-warning" : "bg-primary/60")} style={{ left: pos(t.inicio), width: pos(t.dias) }} />
                    </span>
                    <span className="sr-only">Do dia {nfmt(t.inicio + 1)}, durante {dias(t.dias)}.</span>
                  </span>
                  <span className="w-24 shrink-0 text-right">
                    {veCusto && <span className="block text-[15px] font-semibold tabular-nums">{eur(t.custo.total)} €</span>}
                    {veCusto && t.delta !== 0 && <span className={cn("block text-xs tabular-nums", t.delta > 0 ? "text-destructive" : "text-success")}>{t.delta > 0 ? "+" : "−"}{eur(Math.abs(t.delta))} €</span>}
                  </span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", aqui && "rotate-180")} aria-hidden="true" />
                </button>

                {aqui && (
                  <div className="mt-3 grid gap-4 rounded-xl border border-border bg-background p-4 sm:ml-12 animate-in fade-in-0">
                    <div className="grid gap-2">
                      <span className="text-sm font-medium" id={`dur-${d.id}-${t.chave}`}>Duração</span>
                      <div className="flex flex-wrap items-center gap-3">
                        <div role="group" aria-labelledby={`dur-${d.id}-${t.chave}`} className="inline-flex items-center rounded-lg border border-input bg-card p-0.5">
                          <button type="button" aria-label="Menos meio dia" disabled={fechado || t.dias <= 0.5} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted disabled:opacity-40"
                            onClick={() => run(() => A.prazoTarefa(d.id, t.chave, t.dias - 0.5))}><Minus className="h-4 w-4" /></button>
                          <output className="w-20 text-center text-[17px] font-medium tabular-nums">{dias(t.dias)}</output>
                          <button type="button" aria-label="Mais meio dia" disabled={fechado} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted disabled:opacity-40"
                            onClick={() => run(() => A.prazoTarefa(d.id, t.chave, t.dias + 0.5))}><Plus className="h-4 w-4" /></button>
                        </div>
                        {t.manual && !fechado && (
                          <button type="button" onClick={() => run(() => A.prazoTarefa(d.id, t.chave, null))} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary">
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Repor ({dias(diasDeHoras(t.hOrc))}, das horas)
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        O orçamento conta {nfmt(t.hOrc)} h ({t.perfil.toLowerCase()}), a {HORAS_DIA} h por dia.
                        {t.manual && ` Com ${dias(t.dias)} contam ${nfmt(t.h)} h.`}
                      </p>
                      {poucas && (
                        <p className="flex items-start gap-2 text-sm text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Menos horas do que o orçamento conta: ou vai mais gente, ou o prazo não chega.</p>
                      )}
                    </div>
                    {veCusto ? (
                      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-4">
                        <div><dt className="text-sm text-muted-foreground">Mão de obra</dt><dd className="tabular-nums">{eur(t.custo.mo)} €<span className="block text-xs text-muted-foreground">{nfmt(t.h)} h × {eur(t.custoHora)} €</span></dd></div>
                        {!dem && <div><dt className="text-sm text-muted-foreground">Equipamento</dt><dd className="tabular-nums">{eur(t.custo.eq)} €</dd></div>}
                        <div><dt className="text-sm text-muted-foreground">Consumíveis</dt><dd className="tabular-nums">{eur(t.custo.cons)} €</dd></div>
                        {Math.abs(t.custo.outros) >= 0.01 && <div><dt className="text-sm text-muted-foreground">{dem ? "Deposição, proteção e meio" : "Outros"}</dt><dd className="tabular-nums">{eur(t.custo.outros)} €</dd></div>}
                        <div><dt className="text-sm text-muted-foreground">Custo da tarefa</dt><dd className="font-semibold tabular-nums">{eur(t.custo.total)} €
                          {t.delta !== 0 && <span className="block text-xs font-normal text-muted-foreground">no orçamento: {eur(t.custoOrc)} €</span>}</dd></div>
                      </dl>
                    ) : (
                      <p className="text-sm text-muted-foreground">O custo da demolição e entulho só a Direção o vê.</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
