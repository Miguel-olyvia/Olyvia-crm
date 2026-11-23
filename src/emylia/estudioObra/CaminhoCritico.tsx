// 23/11 (Rúben: «onde diz caminho crítico, a lista deve ser refeita, muito mais bonita, corrida, com as fases bem identificadas e
// icons»). O caminho crítico como uma linha do tempo pelas fases da obra: cada fase com o seu ícone e a sua cor, por ordem, e por baixo
// as tarefas sem folga, com o ícone do ofício, o nome curto e a data alinhada. Não é um erro: nada de vermelho.
import type { LucideIcon } from "lucide-react";
import { AppWindow, Armchair, Bath, BrickWall, Check, DoorOpen, Droplets, Grid3x3, Hammer, Lightbulb, PaintRoller, Plug, Route, ShowerHead, Sparkles, Square, Toilet, Wrench, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { COR_FASE, FASES_OBRA, type FaseObra } from "../fasesObra";
import type { Plano, Tarefa } from "../motor";
import { estadoVivo, nomeCurtoTarefa } from "./planoVivo";

/** O ícone de cada fase da obra (o mesmo da proposta). */
export const ICONE_DA_FASE: Record<number, LucideIcon> = { 1: Hammer, 2: Plug, 3: Grid3x3, 4: Armchair };

/** O ícone do trabalho de uma tarefa, pelo nome. */
export function iconeDaTarefa(nome: string): LucideIcon {
  const t = nomeCurtoTarefa(nome).toLowerCase();
  if (/demol|remo[çc][ãa]o|entulho/.test(t)) return Hammer;
  if (/canaliz|torneira|v[áa]lvula|esgoto|[áa]gua/.test(t)) return Droplets;
  if (/eletric|tomada|interruptor|quadro/.test(t)) return Zap;
  if (/aplique|led|ilumina|luz|candeeiro/.test(t)) return Lightbulb;
  if (/reboc|regulariz|estuque|parede/.test(t)) return BrickWall;
  if (/revest|paviment|ladrilh|azulej|cer[âa]mic(o|a) m/.test(t)) return Grid3x3;
  if (/base de duche|coluna de duche|duche|resguardo/.test(t)) return ShowerHead;
  if (/sanita|bid[ée]/.test(t)) return Toilet;
  if (/lavat|lou[çc]a|banheira/.test(t)) return Bath;
  if (/espelho/.test(t)) return Square;
  if (/porta/.test(t)) return DoorOpen;
  if (/janela/.test(t)) return AppWindow;
  if (/m[óo]ve|mobili|montagem|arm[áa]rio/.test(t)) return Armchair;
  if (/pint|teto/.test(t)) return PaintRoller;
  if (/limpeza|apoio/.test(t)) return Sparkles;
  return Wrench;
}

export interface FaseCritica { n: FaseObra; nome: string; tarefas: { ti: number; t: Tarefa }[] }
/** As tarefas do caminho crítico agrupadas pela fase da obra, as fases por ordem e as tarefas pelo dia. */
export function caminhoPorFase(p: Plano, critico: ReadonlySet<number>): FaseCritica[] {
  const crit = [...critico].map((ti) => ({ ti, t: p.tasks[ti] })).filter((x) => x.t).sort((a, b) => a.t.dia - b.t.dia || a.ti - b.ti);
  return FASES_OBRA.map((f) => ({ n: f.n, nome: f.curto, tarefas: crit.filter((x) => ((x.t.fase ?? 1) as FaseObra) === f.n) })).filter((f) => f.tarefas.length);
}

export function CaminhoCritico({ p, critico, quando, abrir }: { p: Plano; critico: ReadonlySet<number>; quando: (k: number) => string; abrir: (ti: number) => void }) {
  const fases = caminhoPorFase(p, critico);
  const curta = (k: number) => quando(k).replace(/^\w+, /, ""); // «30 nov» (sem o dia da semana)
  return (
    <section aria-label="Caminho crítico" className="space-y-3 border-t border-border pt-4 lg:col-span-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Route className="h-4 w-4 text-primary" aria-hidden="true" />Caminho crítico</h3>
          <p className="text-xs text-muted-foreground">Não há nada de errado nestas tarefas: não têm folga. Se uma atrasar, a obra acaba mais tarde.</p>
        </div>
        {fases.length > 0 && <p className="text-xs tabular-nums text-muted-foreground">{((n) => `${n} ${n === 1 ? "tarefa" : "tarefas"}`)(fases.reduce((s, f) => s + f.tarefas.length, 0))} · de {quando(fases[0].tarefas[0].t.dia)} a {quando(Math.max(...fases.flatMap((f) => f.tarefas.map((x) => x.t.dia + x.t.dur - 1))))}</p>}
      </div>
      {!fases.length ? <p className="text-sm text-muted-foreground">Todas as tarefas por fazer têm folga.</p> : (
        <ol className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
          {fases.map((f) => {
            const Ic = ICONE_DA_FASE[f.n] ?? Wrench, cor = COR_FASE[f.n];
            const ini = f.tarefas[0].t.dia, fim = Math.max(...f.tarefas.map((x) => x.t.dia + x.t.dur - 1));
            return (
              <li key={f.n} className="min-w-0">
                {/* a fase: o ícone na cor dela, o nome e as datas */}
                <div className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white shadow-sm" style={{ background: cor }}><Ic className="h-[18px] w-[18px]" /></span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: cor }}>Fase {f.n}</p>
                    <p className="truncate text-sm font-semibold leading-tight">{f.nome}</p>
                  </div>
                  <p className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{ini === fim ? curta(ini) : `${curta(ini)} – ${curta(fim)}`}</p>
                </div>
                {/* as tarefas: a linha da fase corre por baixo do ícone */}
                <ul className="ml-[17px] mt-2 space-y-0.5 border-l-2 pl-3" style={{ borderColor: `color-mix(in srgb, ${cor} 35%, transparent)` }}>
                  {f.tarefas.map(({ ti, t }) => {
                    const T = iconeDaTarefa(t.nome), v = estadoVivo(t, p), feita = v === "feita" || v === "validada";
                    return (
                      <li key={ti}>
                        <button type="button" onClick={() => abrir(ti)} title={t.nome}
                          className="group flex min-h-9 w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-md" style={{ background: `color-mix(in srgb, ${cor} 12%, transparent)`, color: cor }}>
                            {feita ? <Check className="h-4 w-4" /> : <T className="h-4 w-4" />}
                          </span>
                          <span className={cn("min-w-0 flex-1 truncate text-sm", feita && "text-muted-foreground line-through")}>{nomeCurtoTarefa(t.nome)}</span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground group-hover:text-foreground">{quando(t.dia)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
