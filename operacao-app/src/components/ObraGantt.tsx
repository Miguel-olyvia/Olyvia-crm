import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cx } from "./ui";
import { AlertTriangle, ChevronRight, Clock, User } from "./icons";
import { ObraPega } from "./ObraIcones";
import {
  formatarMinutos,
  moverIntervalo,
  redimensionarIntervalo,
  type EstadoTarefaObra,
  type Intervalo,
} from "../domain/obras";
import {
  ESCALAS_GANTT,
  LARGURA_NOMES_MAX,
  LARGURA_NOMES_MIN,
  LARGURA_NOMES_PADRAO,
  avisosDeDependencia,
  cabecalhoGantt,
  criaCiclo,
  deltaDeArrasto,
  dependenciasDe,
  setasDependencia,
  tarefaNaPosicao,
  textoAvisoDependencia,
  ehEscalaGantt,
  geometriaBarra,
  juntasDeFimDeSemana,
  larguraAjustadaAosNomes,
  limitarLarguraNomes,
  montarGantt,
  pxPorDia,
  resumoAtrasos,
  segmentoAlemDoOriginal,
  textoAtraso,
  textoResumoAtrasos,
  xDeColuna,
  xHoje,
  type EscalaGantt,
  type FaseGantt,
  type TarefaGantt,
} from "../domain/obras-gantt";

export type { AtrasoGantt, TarefaGantt } from "../domain/obras-gantt";

/**
 * O mapa de atividades da obra.
 *
 * Linhas: fases (recolhíveis) e as suas tarefas. Colunas: dias úteis, vistos
 * ao dia, à semana ou ao mês (só muda a largura de cada dia e o cabeçalho). A
 * barra é o planeado; por dentro, a parte preenchida é o tempo real gasto
 * contra o previsto, com a cor do alerta. A linha vertical é hoje; as juntas
 * sombreadas são os fins de semana.
 *
 * Para quem planeia: arrastar a barra muda as datas; a pega da direita estica
 * ou encolhe — sempre ao dia, em qualquer escala. O arrasto mostra-se de
 * imediato e só grava ao largar — e quem decide é a base, que devolve os
 * choques de agenda.
 *
 * A coluna dos nomes alarga-se pela pega do lado direito (duplo clique ajusta
 * ao nome mais comprido). Largura e escala ficam guardadas neste browser.
 */

const ALTURA_LINHA = 40;
const CHAVE_ESCALA = "operacao-app-gantt-escala";
const CHAVE_LARGURA = "operacao-app-gantt-largura-nomes";

function lerGuardado(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function guardar(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* sem armazenamento (modo privado, bloqueado): fica só nesta sessão */
  }
}

function escalaGuardada(): EscalaGantt {
  const v = lerGuardado(CHAVE_ESCALA);
  return ehEscalaGantt(v) ? v : "dia";
}

function larguraGuardada(): number {
  const v = Number(lerGuardado(CHAVE_LARGURA));
  return v > 0 ? limitarLarguraNomes(v) : LARGURA_NOMES_PADRAO;
}

/** Quanto ocupa um texto sem cortes (Range mede o texto inteiro, mesmo truncado). */
function larguraNatural(el: HTMLElement): number {
  try {
    const r = document.createRange();
    r.selectNodeContents(el);
    if (typeof r.getBoundingClientRect === "function") {
      const w = r.getBoundingClientRect().width;
      if (w > 0) return w;
    }
  } catch {
    /* sem Range: usa o scrollWidth */
  }
  return el.scrollWidth;
}

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

/** Ligar tarefas: do fim da barra `de` até onde está o dedo/rato (px nas linhas). */
interface Ligacao {
  de: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Altura do cabeçalho da grelha (as duas filas). As linhas começam aqui. */
const ALTURA_CABECALHO = 52;

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
  aoLigar,
  aoClicarAtraso,
}: {
  fases: readonly FaseGantt[];
  /** Cada tarefa pode trazer `dependencias` (ids); sem isso, vale o `dependeDe` antigo. */
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
  /**
   * Ligar duas tarefas: `tarefaId` passa a depender de `dependeDeId`. Sem esta
   * prop não aparece a pega de ligar.
   */
  aoLigar?: (tarefaId: string, dependeDeId: string) => void;
  /** Clicar na marca de atraso de uma tarefa (p.ex. abrir o histórico de atrasos). */
  aoClicarAtraso?: (tarefaId: string) => void;
}) {
  const [recolhidas, setRecolhidas] = useState<Set<string>>(new Set());
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const moveu = useRef(false);
  const [ligacao, setLigacao] = useState<Ligacao | null>(null);
  const [avisoLigacao, setAvisoLigacao] = useState<string | null>(null);
  const conteudoRef = useRef<HTMLDivElement>(null);
  const idSvg = useId().replace(/:/g, "");
  const [escala, setEscala] = useState<EscalaGantt>(escalaGuardada);
  const [larguraNomes, setLarguraNomes] = useState<number>(larguraGuardada);
  const [aRedimensionar, setARedimensionar] = useState(false);
  const redim = useRef<{ x0: number; w0: number } | null>(null);
  const colNomesRef = useRef<HTMLDivElement>(null);
  const grelhaRef = useRef<HTMLDivElement>(null);

  const ppd = pxPorDia(escala);

  const layout = useMemo(
    () => montarGantt({ fases, tarefas, hoje, recolhidas, escala }),
    [fases, tarefas, hoje, recolhidas, escala]
  );
  const cabecalho = useMemo(() => cabecalhoGantt(layout.dias, escala, hoje), [layout.dias, escala, hoje]);
  const juntas = useMemo(() => (escala === "mes" ? [] : juntasDeFimDeSemana(layout.dias)), [layout.dias, escala]);
  const posHoje = xHoje(layout.dias, hoje, ppd);
  const resumo = useMemo(() => resumoAtrasos(tarefas), [tarefas]);

  const largura = layout.dias.length * ppd;
  // Folga entre barras: cabe na junta do fim de semana sem a tapar.
  const folga = escala === "dia" ? 2 : 1;
  const larguraJunta = escala === "dia" ? 4 : 2;

  const escolherEscala = (e: EscalaGantt) => {
    setEscala(e);
    guardar(CHAVE_ESCALA, e);
  };

  // Ao abrir e ao mudar de escala, hoje fica à vista (a um terço da largura).
  const posHojeRef = useRef(posHoje);
  posHojeRef.current = posHoje;
  useEffect(() => {
    const el = grelhaRef.current;
    const x = posHojeRef.current;
    if (!el || x == null) return;
    el.scrollLeft = Math.max(0, x - el.clientWidth / 3);
  }, [escala]);

  /* ── Coluna dos nomes: alargar, ajustar, lembrar ── */
  useEffect(() => {
    if (!aRedimensionar) guardar(CHAVE_LARGURA, String(larguraNomes));
  }, [larguraNomes, aRedimensionar]);

  const comecarRedim = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    redim.current = { x0: e.clientX, w0: larguraNomes };
    setARedimensionar(true);
  };
  const moverRedim = (e: ReactPointerEvent) => {
    if (!redim.current) return;
    setLarguraNomes(limitarLarguraNomes(redim.current.w0 + e.clientX - redim.current.x0));
  };
  const largarRedim = () => {
    redim.current = null;
    setARedimensionar(false);
  };
  const ajustarAosNomes = () => {
    const col = colNomesRef.current;
    if (!col) return;
    const medidas = Array.from(col.querySelectorAll<HTMLElement>("[data-gantt-nome]")).map((el) => ({
      ocupado: el.getBoundingClientRect().width,
      natural: larguraNatural(el),
    }));
    setLarguraNomes(larguraAjustadaAosNomes(larguraNomes, medidas));
  };
  const teclaRedim = (e: ReactKeyboardEvent) => {
    const passo = e.shiftKey ? 64 : 16;
    if (e.key === "ArrowLeft") setLarguraNomes((w) => limitarLarguraNomes(w - passo));
    else if (e.key === "ArrowRight") setLarguraNomes((w) => limitarLarguraNomes(w + passo));
    else if (e.key === "Enter") ajustarAosNomes();
    else return;
    e.preventDefault();
  };

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
    const delta = deltaDeArrasto(e.clientX - arrasto.x0, ppd);
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

  /* ── Dependências: setas, aviso ao arrastar, ligar ── */

  // As datas para onde a barra está a ser arrastada (ainda por gravar).
  const intervaloPrevisto =
    arrasto && arrasto.delta !== 0
      ? arrasto.modo === "mover"
        ? moverIntervalo(arrasto.original, arrasto.delta)
        : redimensionarIntervalo(arrasto.original, arrasto.delta)
      : null;
  const avisos = arrasto && intervaloPrevisto ? avisosDeDependencia(tarefas, arrasto.id, intervaloPrevisto) : [];
  const textoAviso = textoAvisoDependencia(avisos);

  const linhaArrastada =
    arrasto && intervaloPrevisto
      ? layout.linhas.find((l) => l.tipo === "tarefa" && l.tarefa.id === arrasto.id)
      : undefined;
  const setas = setasDependencia({
    linhas: layout.linhas,
    ppd,
    alturaLinha: ALTURA_LINHA,
    folga,
    ajuste:
      arrasto && intervaloPrevisto && linhaArrastada?.barra
        ? {
            id: arrasto.id,
            barra: barraVisivel(arrasto.id, linhaArrastada.barra.col, linhaArrastada.barra.span),
            intervalo: intervaloPrevisto,
          }
        : null,
  });

  const podeLigar = podeEditar && !!aoLigar;

  /** Píxeis do ponteiro relativos ao topo das linhas da grelha. */
  const noConteudo = (e: ReactPointerEvent) => {
    const r = conteudoRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) - ALTURA_CABECALHO };
  };

  const comecarLigacao = (e: ReactPointerEvent, de: string, x1: number, y1: number) => {
    if (!podeLigar) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setAvisoLigacao(null);
    setLigacao({ de, x1, y1, x2: x1, y2: y1 });
  };
  const moverLigacao = (e: ReactPointerEvent) => {
    if (!ligacao) return;
    const p = noConteudo(e);
    setLigacao({ ...ligacao, x2: p.x, y2: p.y });
  };
  const largarLigacao = (e: ReactPointerEvent) => {
    if (!ligacao) return;
    const { de } = ligacao;
    setLigacao(null);
    const alvo = tarefaNaPosicao(layout.linhas, noConteudo(e).y, ALTURA_LINHA);
    if (!alvo || alvo === de || !aoLigar) return;
    const filha = tarefas.find((t) => t.id === alvo);
    if (filha && dependenciasDe(filha).includes(de)) return;
    if (criaCiclo(tarefas, alvo, de)) {
      setAvisoLigacao("Não dá para ligar: as tarefas ficariam à espera uma da outra.");
      return;
    }
    aoLigar(alvo, de);
  };

  const iniciais = (id: string) => {
    const n = (nomes.get(id) ?? "?").trim().split(/\s+/);
    return ((n[0]?.[0] ?? "") + (n[1]?.[0] ?? "")).toUpperCase() || "?";
  };

  return (
    <div
      className={cx(
        "overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card",
        aRedimensionar && "cursor-col-resize select-none"
      )}
    >
      {/* ── Resumo de atrasos (só com plano original ou atrasos registados) ── */}
      {resumo && (
        <div
          data-gantt-resumo
          className={cx(
            "flex items-center gap-1.5 border-b px-3 py-1.5 text-[12px]",
            resumo.porAvisar > 0
              ? "border-red-100 bg-red-50/70 text-red-800"
              : resumo.atrasadas > 0 || resumo.diasUteis > 0
                ? "border-amber-100 bg-amber-50/70 text-amber-800"
                : "border-slate-100 bg-slate-50/60 text-slate-600"
          )}
        >
          <Clock width={13} height={13} className="shrink-0" aria-hidden />
          <span className="min-w-0 truncate" title={textoResumoAtrasos(resumo)}>
            {textoResumoAtrasos(resumo)}
          </span>
        </div>
      )}

      {/* ── Escala ── */}
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        {/* Avisos de dependência (não impedem nada) */}
        <div role="status" aria-live="polite" className="min-w-0 flex-1 text-[12px]">
          {textoAviso ? (
            <span className="inline-flex items-center gap-1.5 text-amber-700">
              <AlertTriangle width={13} height={13} className="shrink-0" />
              <span className="truncate" title={textoAviso}>{textoAviso}</span>
            </span>
          ) : ligacao ? (
            <span className="text-slate-500">Larga sobre a tarefa que só pode começar depois desta</span>
          ) : avisoLigacao ? (
            <span className="text-amber-700">{avisoLigacao}</span>
          ) : null}
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Ver ao</span>
        <div role="group" aria-label="Escala do mapa" className="flex gap-1 rounded-lg bg-slate-100 p-1 text-xs">
          {ESCALAS_GANTT.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => escolherEscala(s.id)}
              aria-pressed={escala === s.id}
              className={cx(
                "rounded-md px-3 py-1 transition-colors",
                escala === s.id ? "bg-white font-medium text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {s.rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="flex">
        {/* ── Coluna dos nomes ── */}
        <div
          ref={colNomesRef}
          className="relative z-20 shrink-0 border-r border-slate-200 bg-white"
          style={{ width: larguraNomes }}
        >
          <div className="flex h-[52px] items-end border-b border-slate-200 bg-slate-50/80 px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Fase / tarefa
          </div>
          {/* Pega para alargar a coluna (rato e toque); duplo clique ajusta ao nome mais comprido. */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Largura da coluna dos nomes"
            aria-valuenow={larguraNomes}
            aria-valuemin={LARGURA_NOMES_MIN}
            aria-valuemax={LARGURA_NOMES_MAX}
            tabIndex={0}
            title="Arrastar para alargar · duplo clique para ver os nomes inteiros"
            onPointerDown={comecarRedim}
            onPointerMove={moverRedim}
            onPointerUp={largarRedim}
            onPointerCancel={largarRedim}
            onDoubleClick={ajustarAosNomes}
            onKeyDown={teclaRedim}
            className="group absolute inset-y-0 -right-1.5 z-30 w-3 cursor-col-resize touch-none outline-none"
          >
            <span
              className={cx(
                "absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors",
                aRedimensionar ? "bg-brand" : "bg-transparent group-hover:bg-brand/50 group-focus-visible:bg-brand"
              )}
            />
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
                <span
                  data-gantt-nome
                  className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800"
                  title={`${l.fase.ordem}. ${l.fase.nome}`}
                >
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
                  data-gantt-nome
                  className={cx(
                    "min-w-0 flex-1 truncate text-[13px]",
                    l.tarefa.estado === "validada" ? "text-slate-400" : "text-slate-700",
                    l.emAtraso && "text-red-700"
                  )}
                  title={l.tarefa.nome}
                >
                  {l.tarefa.nome}
                </span>
                {l.tarefa.atrasadaInicio && (
                  <span
                    data-nao-iniciada
                    className="shrink-0 rounded bg-red-100 px-1 text-[10px] font-medium leading-4 text-red-700 ring-1 ring-inset ring-red-200"
                    title="Devia ter começado e ainda não começou"
                  >
                    não iniciada
                  </span>
                )}
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
        <div ref={grelhaRef} className="min-w-0 flex-1 overflow-x-auto">
          <div
            ref={conteudoRef}
            className="relative"
            style={{ width: largura }}
            data-escala={escala}
            onPointerMove={mover}
            onPointerUp={largar}
            onPointerCancel={() => setArrasto(null)}
          >
            {/* Cabeçalho: semanas / anos por cima; dias / meses por baixo */}
            <div className="flex h-[22px] border-b border-slate-100 bg-slate-50/80">
              {cabecalho.topo.map((s) => (
                <div
                  key={s.col}
                  title={s.titulo}
                  className={cx(
                    "shrink-0 truncate border-r border-slate-200 px-1.5 text-[10px] leading-[22px]",
                    s.hoje && escala === "semana" ? "font-semibold text-brand-800" : "text-slate-500"
                  )}
                  style={{ width: s.span * ppd }}
                >
                  {s.rotulo}
                </div>
              ))}
            </div>
            <div className="flex h-[30px] border-b border-slate-200 bg-slate-50/80">
              {cabecalho.base.map((c) => (
                <div
                  key={c.col}
                  title={c.titulo}
                  className={cx(
                    "flex shrink-0 flex-col items-center justify-center overflow-hidden border-r leading-tight",
                    escala === "mes" ? "border-slate-200 px-1 text-[11px]" : "border-slate-100 text-[10px]",
                    c.hoje ? "bg-brand-50 font-semibold text-brand-800" : "text-slate-500"
                  )}
                  style={{ width: c.span * ppd }}
                >
                  <span className={cx("max-w-full truncate tabular", escala === "dia" && "text-[12px]")}>{c.rotulo}</span>
                  {c.sub && (
                    <span className={cx("uppercase", escala === "dia" ? "text-[9px]" : "text-[8px]")}>{c.sub}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Grelha: linhas verticais por coluna do cabeçalho e juntas sombreadas dos fins de semana */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[52px]" aria-hidden>
              {cabecalho.base.slice(1).map((c) => (
                <div
                  key={`b-${c.col}`}
                  className={cx("absolute inset-y-0 w-px", escala === "mes" ? "bg-slate-200" : "bg-slate-100")}
                  style={{ left: xDeColuna(c.col, ppd) - 1 }}
                />
              ))}
              {escala === "semana" &&
                cabecalho.topo.slice(1).map((s) => (
                  <div
                    key={`t-${s.col}`}
                    className="absolute inset-y-0 w-px bg-slate-200"
                    style={{ left: xDeColuna(s.col, ppd) - 1 }}
                  />
                ))}
              {juntas.map((col) => (
                <div
                  key={`fds-${col}`}
                  data-fim-de-semana
                  className="absolute inset-y-0 bg-slate-200/80"
                  style={{ left: xDeColuna(col, ppd) - larguraJunta / 2, width: larguraJunta }}
                  title="Fim de semana"
                />
              ))}
            </div>

            {/* Linhas */}
            {layout.linhas.map((l, i) => {
              const chave = l.tipo === "fase" ? `f-${l.fase.id}` : `t-${l.tarefa.id}`;
              const b = l.barra;
              return (
                <div
                  key={chave}
                  className={cx("group/linha relative border-b border-slate-100", l.tipo === "fase" && "bg-slate-50/60")}
                  style={{ height: ALTURA_LINHA }}
                >
                  {b && l.tipo === "fase" && (
                    <div
                      className="absolute top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-full bg-slate-700/80"
                      style={geometriaBarra(b, ppd, folga * 2, 4)}
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
                    const g = geometriaBarra(v, ppd, folga);
                    const bo = l.barraOriginal;
                    const gOriginal = bo ? geometriaBarra(bo, ppd, folga, 4) : null;
                    // Durante o arrasto o plano ainda não mudou: não pinta o "além do original".
                    const alem =
                      t.fimOriginal && !aArrastar
                        ? segmentoAlemDoOriginal({ dias: layout.dias, barra: v, fimOriginal: t.fimOriginal, ppd, folga })
                        : null;
                    const porAvisar = !!t.atraso && !t.atraso.clienteAvisado;
                    const txtAtraso = textoAtraso(t);
                    const xMarca = g.left + g.width + 2;
                    const larguraMarca = t.atraso ? (t.atraso.n > 1 ? 30 : 18) : 0;
                    return (
                      <>
                      {gOriginal && bo && (
                        // O plano original: contorno tracejado, fino, por baixo da barra atual.
                        <div
                          data-plano-original
                          aria-hidden
                          className="pointer-events-none absolute h-1 rounded-sm border border-dashed border-slate-400 bg-slate-100/70"
                          style={{ left: gOriginal.left, width: gOriginal.width, top: ALTURA_LINHA - 6 }}
                          title={`Plano original: ${t.inicioOriginal ?? t.inicio} a ${t.fimOriginal ?? t.fim}`}
                        />
                      )}
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
                          aArrastar && avisos.length > 0 && "ring-2 ring-amber-500",
                          selecionada === t.id && "outline outline-2 outline-brand",
                          l.emAtraso && "ring-red-400",
                          t.atrasadaInicio && "ring-2 ring-red-500"
                        )}
                        style={g}
                        data-tarefa-id={t.id}
                        data-nao-iniciada={t.atrasadaInicio || undefined}
                        title={[
                          `${t.nome} — ${formatarMinutos(t.minutosReais)} de ${formatarMinutos(t.minutosPrevistos)}`,
                          t.atrasadaInicio ? "Não iniciada a tempo" : null,
                          txtAtraso,
                        ]
                          .filter(Boolean)
                          .join("\n")}
                      >
                        {/* O real, por dentro do planeado */}
                        <div
                          className={cx("absolute inset-y-0 left-0", COR_GASTO[l.nivel])}
                          style={{ width: `${Math.min(1, l.gasto) * 100}%` }}
                        />
                        {/* O que vai além do fim original: às riscas (vermelho se o cliente não foi avisado) */}
                        {alem && (
                          <div
                            data-alem-original={porAvisar ? "por-avisar" : "avisado"}
                            aria-hidden
                            className="pointer-events-none absolute inset-y-0"
                            style={{
                              left: alem.left - g.left,
                              width: alem.width,
                              backgroundImage: `repeating-linear-gradient(135deg, ${
                                porAvisar ? "rgba(220,38,38,.55)" : "rgba(217,119,6,.5)"
                              } 0 4px, transparent 4px 8px)`,
                              boxShadow: `inset 2px 0 0 ${porAvisar ? "#dc2626" : "#d97706"}`,
                            }}
                          />
                        )}
                        {/* Não iniciada a tempo: o início da barra pulsa a vermelho */}
                        {t.atrasadaInicio && (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-y-0 left-0 w-1.5 animate-pulse bg-red-500"
                          />
                        )}
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
                            className={cx(
                              "absolute inset-y-0 right-0 flex cursor-ew-resize items-center justify-center bg-black/5 opacity-0 transition-opacity group-hover:opacity-100",
                              escala === "mes" ? "w-2" : "w-3"
                            )}
                            aria-label="Esticar"
                          >
                            <ObraPega width={10} height={10} />
                          </span>
                        )}
                      </div>
                      {t.atraso && txtAtraso && (
                        // Marca de atraso, logo a seguir ao fim da barra.
                        <button
                          type="button"
                          data-marca-atraso={t.id}
                          title={txtAtraso}
                          aria-label={txtAtraso}
                          aria-disabled={!aoClicarAtraso || undefined}
                          tabIndex={aoClicarAtraso ? 0 : -1}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            aoClicarAtraso?.(t.id);
                          }}
                          className={cx(
                            "absolute top-1/2 z-10 flex h-4 -translate-y-1/2 items-center gap-0.5 rounded-full px-0.5 text-[9px] font-semibold leading-none ring-1",
                            porAvisar
                              ? "bg-red-50 text-red-700 ring-red-300"
                              : "bg-amber-50 text-amber-700 ring-amber-300",
                            aoClicarAtraso ? "cursor-pointer hover:brightness-95" : "cursor-default"
                          )}
                          style={{ left: xMarca }}
                        >
                          <Clock width={11} height={11} aria-hidden />
                          {t.atraso.n > 1 && <span className="tabular pr-0.5">{t.atraso.n}</span>}
                        </button>
                      )}
                      {podeLigar && !aArrastar && (
                        // Pega de ligar: arrastar do fim desta barra para a tarefa que depende dela.
                        <span
                          role="button"
                          aria-label={`Ligar ${t.nome} a uma tarefa que depende dela`}
                          title="Arrasta para a tarefa que só pode começar depois desta"
                          onPointerDown={(e) =>
                            comecarLigacao(e, t.id, g.left + g.width, i * ALTURA_LINHA + ALTURA_LINHA / 2)
                          }
                          onPointerMove={moverLigacao}
                          onPointerUp={largarLigacao}
                          onPointerCancel={() => setLigacao(null)}
                          className={cx(
                            "absolute top-1/2 z-10 h-3 w-3 -translate-y-1/2 cursor-crosshair touch-none rounded-full bg-white ring-2 ring-brand transition-opacity",
                            ligacao?.de === t.id
                              ? "opacity-100"
                              : "opacity-0 group-hover/linha:opacity-100 [@media(hover:none)]:opacity-60"
                          )}
                          style={{ left: xMarca + larguraMarca }}
                        />
                      )}
                      </>
                    );
                  })()}
                </div>
              );
            })}

            {/* Dependências: do fim da tarefa-mãe ao início da que depende dela */}
            {(setas.length > 0 || ligacao) && (
              <svg
                className="pointer-events-none absolute left-0 overflow-visible"
                style={{ top: ALTURA_CABECALHO }}
                width={largura}
                height={layout.linhas.length * ALTURA_LINHA}
                aria-hidden
              >
                <defs>
                  <marker id={`${idSvg}-ok`} viewBox="0 0 6 6" refX="6" refY="3" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M0,0 L6,3 L0,6 z" fill="#64748b" />
                  </marker>
                  <marker id={`${idSvg}-mal`} viewBox="0 0 6 6" refX="6" refY="3" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M0,0 L6,3 L0,6 z" fill="#dc2626" />
                  </marker>
                </defs>
                {setas.map((s) => (
                  <path
                    key={`${s.de}>${s.para}`}
                    d={s.caminho}
                    data-seta={`${s.de}>${s.para}`}
                    data-violada={s.violada || undefined}
                    fill="none"
                    stroke={s.violada ? "#dc2626" : "#64748b"}
                    strokeWidth={s.violada ? 1.5 : 1}
                    strokeOpacity={s.violada ? 1 : 0.7}
                    markerEnd={`url(#${idSvg}-${s.violada ? "mal" : "ok"})`}
                  />
                ))}
                {ligacao && (
                  <line
                    x1={ligacao.x1}
                    y1={ligacao.y1}
                    x2={ligacao.x2}
                    y2={ligacao.y2}
                    stroke="currentColor"
                    className="text-brand"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    markerEnd={`url(#${idSvg}-ok)`}
                  />
                )}
              </svg>
            )}

            {/* Hoje */}
            {posHoje != null && (
              <div
                className="pointer-events-none absolute bottom-0 top-[22px] w-0.5 -translate-x-1/2 bg-brand/70"
                style={{ left: posHoje }}
                aria-label="Hoje"
                title="Hoje"
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
        <span className="text-slate-300">|</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-px w-4 bg-slate-500" />
          Depende de
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-red-600" />
          Começa antes de a anterior acabar
        </span>
        {resumo && (
          <>
            <span className="text-slate-300">|</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-4 rounded-sm border border-dashed border-slate-400 bg-slate-100" />
              Plano original
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-4 rounded-sm"
                style={{ backgroundImage: "repeating-linear-gradient(135deg, rgba(217,119,6,.6) 0 3px, transparent 3px 6px)" }}
              />
              Além do plano (cliente avisado)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-4 rounded-sm"
                style={{ backgroundImage: "repeating-linear-gradient(135deg, rgba(220,38,38,.6) 0 3px, transparent 3px 6px)" }}
              />
              Cliente por avisar
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock width={11} height={11} className="text-amber-600" aria-hidden />
              Atraso registado
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded-sm bg-slate-200 ring-2 ring-inset ring-red-500" />
              Não iniciada a tempo
            </span>
          </>
        )}
        {podeEditar && (
          <span className="ml-auto">
            Arrasta para mudar as datas · pega à direita para esticar
            {podeLigar && " · bolinha no fim para ligar a outra tarefa"}
          </span>
        )}
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
