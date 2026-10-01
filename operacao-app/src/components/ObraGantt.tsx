import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cx } from "./ui";
import { AlertTriangle, ChevronRight, User } from "./icons";
import { ObraPega } from "./ObraIcones";
import {
  formatarMinutos,
  moverIntervalo,
  redimensionarIntervalo,
  type EstadoTarefaObra,
  type Intervalo,
} from "../domain/obras";
import {
  deltaDeArrasto,
  montarGantt,
  rotuloDia,
  type FaseGantt,
  type TarefaGantt,
} from "../domain/obras-gantt";

/**
 * O mapa de atividades da obra.
 *
 * Linhas: fases (recolhíveis) e as suas tarefas. Colunas: dias úteis. A barra
 * é o planeado; por dentro, a parte preenchida é o tempo real gasto contra o
 * previsto, com a cor do alerta. A linha vertical é hoje.
 *
 * Para quem planeia: arrastar a barra muda as datas; a pega da direita estica
 * ou encolhe. O arrasto mostra-se de imediato e só grava ao largar — e quem
 * decide é a base, que devolve os choques de agenda.
 */

const LARGURA_DIA = 44;
const ALTURA_LINHA = 40;
const LARGURA_NOMES = 280;

const COR_ESTADO: Record<EstadoTarefaObra, string> = {
  por_fazer: "bg-slate-200 ring-slate-300",
  em_curso: "bg-brand-100 ring-brand-light",
  feita: "bg-emerald-100 ring-emerald-300",
  validada: "bg-emerald-200 ring-emerald-400",
  rejeitada: "bg-red-100 ring-red-300",
};

const COR_GASTO = {
  ok: "bg-brand/70",
  aviso: "bg-amber-500/80",
  excedido: "bg-red-500/80",
} as const;

interface Arrasto {
  id: string;
  modo: "mover" | "esticar";
  x0: number;
  original: Intervalo;
  delta: number;
}

export default function ObraGantt({
  fases,
  tarefas,
  hoje,
  podeEditar,
  nomes,
  comConflito,
  selecionada,
  aoSelecionar,
  aoMudarDatas,
}: {
  fases: readonly FaseGantt[];
  tarefas: readonly TarefaGantt[];
  hoje: string;
  podeEditar: boolean;
  /** utilizador_id → nome, para as iniciais nas barras. */
  nomes: ReadonlyMap<string, string>;
  /** Tarefas com choque de agenda. */
  comConflito: ReadonlySet<string>;
  selecionada: string | null;
  aoSelecionar: (tarefaId: string) => void;
  aoMudarDatas: (tarefaId: string, intervalo: Intervalo) => void;
}) {
  const [recolhidas, setRecolhidas] = useState<Set<string>>(new Set());
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const moveu = useRef(false);

  const layout = useMemo(
    () => montarGantt({ fases, tarefas, hoje, recolhidas }),
    [fases, tarefas, hoje, recolhidas]
  );

  const largura = layout.dias.length * LARGURA_DIA;

  const alternar = (faseId: string) =>
    setRecolhidas((s) => {
      const n = new Set(s);
      if (n.has(faseId)) n.delete(faseId);
      else n.add(faseId);
      return n;
    });

  const comecar = (e: ReactPointerEvent, t: TarefaGantt, modo: Arrasto["modo"]) => {
    if (!podeEditar || !t.inicio) return;
    if (t.estado === "feita" || t.estado === "validada") return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    moveu.current = false;
    setArrasto({
      id: t.id,
      modo,
      x0: e.clientX,
      original: { inicio: t.inicio, fim: t.fim ?? t.inicio },
      delta: 0,
    });
  };

  const mover = (e: ReactPointerEvent) => {
    if (!arrasto) return;
    const delta = deltaDeArrasto(e.clientX - arrasto.x0, LARGURA_DIA);
    if (delta !== arrasto.delta) {
      moveu.current = true;
      setArrasto({ ...arrasto, delta });
    }
  };

  const largar = () => {
    if (!arrasto) return;
    const { id, modo, original, delta } = arrasto;
    setArrasto(null);
    if (delta === 0) return;
    const novo = modo === "mover" ? moverIntervalo(original, delta) : redimensionarIntervalo(original, delta);
    if (novo.inicio !== original.inicio || novo.fim !== original.fim) aoMudarDatas(id, novo);
  };

  // A barra durante o arrasto: deslocada em colunas, sem esperar pela base.
  const barraVisivel = (id: string, col: number, span: number) => {
    if (!arrasto || arrasto.id !== id || arrasto.delta === 0) return { col, span };
    if (arrasto.modo === "mover") return { col: col + arrasto.delta, span };
    return { col, span: Math.max(1, span + arrasto.delta) };
  };

  const iniciais = (id: string) => {
    const n = (nomes.get(id) ?? "?").trim().split(/\s+/);
    return ((n[0]?.[0] ?? "") + (n[1]?.[0] ?? "")).toUpperCase() || "?";
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
      <div className="flex">
        {/* ── Coluna dos nomes ── */}
        <div className="shrink-0 border-r border-slate-200" style={{ width: LARGURA_NOMES }}>
          <div className="flex h-[52px] items-end border-b border-slate-200 bg-slate-50/80 px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Fase / tarefa
          </div>
          {layout.linhas.map((l) =>
            l.tipo === "fase" ? (
              <button
                key={`f-${l.fase.id}`}
                type="button"
                onClick={() => alternar(l.fase.id)}
                className="flex w-full items-center gap-1.5 border-b border-slate-100 bg-slate-50/60 px-2 text-left hover:bg-slate-100"
                style={{ height: ALTURA_LINHA }}
                aria-expanded={!l.recolhida}
              >
                <ChevronRight
                  width={14}
                  height={14}
                  className={cx("shrink-0 text-slate-400 transition-transform", !l.recolhida && "rotate-90")}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                  {l.fase.ordem}. {l.fase.nome}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular text-slate-500" title="Soma do previsto das tarefas">
                  {formatarMinutos(l.totais.minutosPrevistos)}
                </span>
              </button>
            ) : (
              <button
                key={`t-${l.tarefa.id}`}
                type="button"
                onClick={() => aoSelecionar(l.tarefa.id)}
                className={cx(
                  "flex w-full items-center gap-1.5 border-b border-slate-100 pl-7 pr-2 text-left transition-colors hover:bg-brand-50/40",
                  selecionada === l.tarefa.id && "bg-brand-50/70"
                )}
                style={{ height: ALTURA_LINHA }}
              >
                {comConflito.has(l.tarefa.id) && (
                  <AlertTriangle width={13} height={13} className="shrink-0 text-amber-600" aria-label="Choque de agenda" />
                )}
                <span
                  className={cx(
                    "min-w-0 flex-1 truncate text-[13px]",
                    l.tarefa.estado === "validada" ? "text-slate-400" : "text-slate-700",
                    l.emAtraso && "text-red-700"
                  )}
                  title={l.tarefa.nome}
                >
                  {l.tarefa.nome}
                </span>
                <span
                  className={cx(
                    "shrink-0 font-mono text-[11px] tabular",
                    l.nivel === "excedido" ? "text-red-600" : l.nivel === "aviso" ? "text-amber-700" : "text-slate-400"
                  )}
                  title="Real / previsto"
                >
                  {l.tarefa.minutosReais > 0 ? `${Math.round(l.tarefa.minutosReais)}/` : ""}
                  {l.tarefa.minutosPrevistos}m
                </span>
              </button>
            )
          )}
        </div>

        {/* ── A grelha dos dias ── */}
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div
            className="relative"
            style={{ width: largura }}
            onPointerMove={mover}
            onPointerUp={largar}
            onPointerCancel={() => setArrasto(null)}
          >
            {/* Cabeçalho: semanas e dias */}
            <div className="flex h-[22px] border-b border-slate-100 bg-slate-50/80">
              {layout.semanas.map((s) => (
                <div
                  key={s.col}
                  className="truncate border-r border-slate-200 px-1.5 text-[10px] leading-[22px] text-slate-500"
                  style={{ width: s.span * LARGURA_DIA }}
                >
                  {s.rotulo}
                </div>
              ))}
            </div>
            <div className="flex h-[30px] border-b border-slate-200 bg-slate-50/80">
              {layout.dias.map((d, i) => {
                const r = rotuloDia(d);
                return (
                  <div
                    key={d}
                    title={d}
                    className={cx(
                      "flex flex-col items-center justify-center border-r border-slate-100 text-[10px] leading-tight",
                      i === layout.colHoje ? "bg-brand-50 font-semibold text-brand-800" : "text-slate-500"
                    )}
                    style={{ width: LARGURA_DIA }}
                  >
                    <span className="text-[12px] tabular">{r.dia}</span>
                    <span className="text-[9px] uppercase">{r.semana.slice(0, 3)}</span>
                  </div>
                );
              })}
            </div>

            {/* Linhas */}
            {layout.linhas.map((l) => {
              const chave = l.tipo === "fase" ? `f-${l.fase.id}` : `t-${l.tarefa.id}`;
              const b = l.barra;
              return (
                <div
                  key={chave}
                  className={cx("relative border-b border-slate-100", l.tipo === "fase" && "bg-slate-50/60")}
                  style={{
                    height: ALTURA_LINHA,
                    backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${LARGURA_DIA - 1}px, rgb(241 245 249) ${LARGURA_DIA - 1}px, rgb(241 245 249) ${LARGURA_DIA}px)`,
                  }}
                >
                  {b && l.tipo === "fase" && (
                    <div
                      className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-slate-700/80"
                      style={{ left: b.col * LARGURA_DIA + 4, width: b.span * LARGURA_DIA - 8 }}
                      title={`${l.fase.nome}: ${formatarMinutos(l.totais.minutosPrevistos)} previstos · ${formatarMinutos(l.totais.minutosReais)} reais · ${l.totais.progresso}% feito`}
                    >
                      <div
                        className="h-full rounded-full bg-emerald-400"
                        style={{ width: `${l.totais.progresso}%` }}
                      />
                    </div>
                  )}
                  {b && l.tipo === "tarefa" && (() => {
                    const v = barraVisivel(l.tarefa.id, b.col, b.span);
                    const t = l.tarefa;
                    const arrastavel = podeEditar && t.estado !== "feita" && t.estado !== "validada";
                    const aArrastar = arrasto?.id === t.id;
                    return (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (!moveu.current) aoSelecionar(t.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") aoSelecionar(t.id);
                        }}
                        onPointerDown={(e) => comecar(e, t, "mover")}
                        className={cx(
                          "group absolute top-1.5 flex h-7 items-center overflow-hidden rounded-md ring-1 ring-inset",
                          COR_ESTADO[t.estado],
                          arrastavel ? "cursor-grab touch-none" : "cursor-pointer",
                          aArrastar && "z-10 cursor-grabbing shadow-elevated",
                          selecionada === t.id && "outline outline-2 outline-brand",
                          l.emAtraso && "ring-red-400"
                        )}
                        style={{ left: v.col * LARGURA_DIA + 2, width: v.span * LARGURA_DIA - 4 }}
                        title={`${t.nome} — ${formatarMinutos(t.minutosReais)} de ${formatarMinutos(t.minutosPrevistos)}`}
                      >
                        {/* O real, por dentro do planeado */}
                        <div
                          className={cx("absolute inset-y-0 left-0", COR_GASTO[l.nivel])}
                          style={{ width: `${Math.min(1, l.gasto) * 100}%` }}
                        />
                        {t.aCorrer > 0 && (
                          <span className="relative ml-1 h-2 w-2 shrink-0 animate-pulse rounded-full bg-white ring-2 ring-brand" />
                        )}
                        <span className="relative ml-1 flex min-w-0 items-center gap-0.5">
                          {t.pessoas.slice(0, 3).map((p) => (
                            <span
                              key={p}
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/90 text-[9px] font-semibold text-slate-700 ring-1 ring-slate-300"
                              title={nomes.get(p) ?? ""}
                            >
                              {iniciais(p)}
                            </span>
                          ))}
                          {t.pessoas.length === 0 && (
                            <User width={12} height={12} className="text-slate-400" aria-label="Sem ninguém atribuído" />
                          )}
                        </span>
                        {arrastavel && (
                          <span
                            onPointerDown={(e) => comecar(e, t, "esticar")}
                            className="absolute inset-y-0 right-0 flex w-3 cursor-ew-resize items-center justify-center bg-black/5 opacity-0 transition-opacity group-hover:opacity-100"
                            aria-label="Esticar"
                          >
                            <ObraPega width={10} height={10} />
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}

            {/* Hoje */}
            {layout.colHoje != null && (
              <div
                className="pointer-events-none absolute bottom-0 top-[22px] w-0.5 bg-brand/70"
                style={{ left: layout.colHoje * LARGURA_DIA + LARGURA_DIA / 2 }}
                aria-label="Hoje"
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 bg-slate-50/60 px-3 py-2 text-[11px] text-slate-500">
        <Legenda cor="bg-slate-200" rotulo="Por fazer" />
        <Legenda cor="bg-brand-100" rotulo="Em curso" />
        <Legenda cor="bg-emerald-100" rotulo="Feita" />
        <Legenda cor="bg-emerald-200" rotulo="Validada" />
        <Legenda cor="bg-red-100" rotulo="Rejeitada" />
        <span className="text-slate-300">|</span>
        <Legenda cor="bg-brand/70" rotulo="Real < 80 %" />
        <Legenda cor="bg-amber-500/80" rotulo="≥ 80 %" />
        <Legenda cor="bg-red-500/80" rotulo="Excedido" />
        {podeEditar && <span className="ml-auto">Arrasta para mudar as datas · pega à direita para esticar</span>}
      </div>
    </div>
  );
}

function Legenda({ cor, rotulo }: { cor: string; rotulo: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx("h-2.5 w-4 rounded-sm", cor)} />
      {rotulo}
    </span>
  );
}
