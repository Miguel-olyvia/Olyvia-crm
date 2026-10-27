// O Painel de Negócios (27/10/2026): a previsão do que se vai fechar, a saúde do funil, os números do último mês contra o anterior,
// os insights (o que os números querem dizer, com a ação), o funil, as entradas por semana, as origens, as linhas, os comerciais,
// as perdas, o que aconteceu por último e os parados. Tocar num número, numa barra ou num insight filtra e passa para a Lista.
// Os números contam a subir, as barras crescem, as linhas desenham-se e o urgente pulsa; com "reduzir movimento" tudo aparece já feito.
// As contas estão em historicoNegocios.ts e insightsNegocios.ts; o movimento em painelNegocios.css.
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Clock, Lightbulb, Minus, Sparkles, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { FASES } from "./motor";
import { IconeFase } from "./pecas";
import { CaixaGrafico } from "./CaixaGrafico";
import { eurosTexto } from "./graficosTipos";
import {
  atividadeRecente, dataGanho, entradasPorSemana, funilH, motivosPerda, paradosH, porCampo, resumoH, type FiltrosH, type LinhaH,
} from "./historicoNegocios";
import { compararPeriodos, insights, previsao, saude, serieSemanal, type Comparado, type Insight, type Tom } from "./insightsNegocios";
import "./painelNegocios.css";

const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const negocios = (n: number): string => (n === 1 ? "1 negócio" : `${n} negócios`);
const haDias = (n: number | null): string => (n === null ? "" : n === 0 ? "hoje" : n === 1 ? "há 1 dia" : `há ${n} dias`);

/* ------------------------------------------------------------------ movimento */
/** Pode haver movimento? Não, com "reduzir movimento" ou sem matchMedia (os testes): aí tudo aparece já no sítio. */
function semMovimento(): boolean {
  try { return typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return true; }
}

/** Um número que sobe de 0 até ao alvo (e de um alvo para o seguinte, quando os filtros mudam). */
function useContador(alvo: number, ms = 1100): number {
  const [v, setV] = useState(() => (semMovimento() ? alvo : 0));
  const de = useRef(v);
  useEffect(() => {
    if (semMovimento()) { setV(alvo); de.current = alvo; return; }
    const ini = performance.now(), origem = de.current;
    let id = 0;
    const passo = (t: number): void => {
      const k = Math.min(1, (t - ini) / ms), e = 1 - Math.pow(1 - k, 3);
      const x = origem + (alvo - origem) * e;
      setV(x); de.current = x;
      if (k < 1) id = requestAnimationFrame(passo);
    };
    id = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(id);
  }, [alvo, ms]);
  return v;
}

/** Fica verdadeiro no desenho a seguir ao primeiro: as barras e os anéis partem de zero e crescem até ao valor. */
function useMontado(): boolean {
  const [m, setM] = useState(semMovimento);
  useEffect(() => { if (m) return; const id = requestAnimationFrame(() => setM(true)); return () => cancelAnimationFrame(id); }, [m]);
  return m;
}

function Numero({ valor, euros, pct, className }: { valor: number; euros?: boolean; pct?: boolean; className?: string }) {
  const v = useContador(valor);
  const t = euros ? eurosTexto(Math.round(v)) : pct ? `${Math.round(v)} %` : String(Math.round(v));
  // o leitor de ecrã lê o valor final, não os passos
  return <span className={cn("tabular-nums", className)}><span aria-hidden="true">{t}</span><span className="sr-only">{euros ? eurosTexto(Math.round(valor)) : pct ? `${valor} %` : valor}</span></span>;
}

/** Um bloco que entra a subir, com um atraso para entrarem uns a seguir aos outros. */
function Entra({ i = 0, className, children, as: Tag = "div", ...rest }: { i?: number; className?: string; children: ReactNode; as?: "div" | "section" | "li" } & Record<string, unknown>) {
  return <Tag className={cn("pn-subir", className)} style={{ animationDelay: `${Math.min(i, 12) * 70}ms` } as CSSProperties} {...rest}>{children}</Tag>;
}

/* ------------------------------------------------------------------ peças de gráfico */
/** Uma barra que cresce até `largura` (0 a 100). */
function Barra({ largura, destaque, className }: { largura: number; destaque?: boolean; className?: string }) {
  const m = useMontado();
  return (
    <span className={cn("block h-2.5 w-full overflow-hidden rounded-full bg-muted", className)} aria-hidden="true">
      <span className={cn("pn-barra block h-full rounded-full", destaque ? "bg-primary" : "bg-[hsl(220_10%_45%)]")} style={{ width: `${m ? Math.max(largura, largura > 0 ? 2 : 0) : 0}%` }} />
    </span>
  );
}

/** Uma linha fina de tendência (decorativa: o número está escrito ao lado). */
function Faisca({ pontos, className }: { pontos: readonly number[]; className?: string }) {
  const max = Math.max(1, ...pontos), n = pontos.length;
  if (n < 2) return null;
  const xy = pontos.map((p, i) => `${(i / (n - 1)) * 100},${28 - (p / max) * 24}`);
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={cn("h-8 w-full", className)} aria-hidden="true">
      <polygon points={`0,30 ${xy.join(" ")} 100,30`} className="pn-area fill-primary/10" />
      <polyline points={xy.join(" ")} pathLength={1} fill="none" vectorEffect="non-scaling-stroke" className="pn-traco stroke-primary" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Um anel de 0 a 100, com o número no meio. */
function Anel({ valor, rotulo, tam = 132 }: { valor: number; rotulo: string; tam?: number }) {
  const m = useMontado(), r = 52, c = 2 * Math.PI * r;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: tam, height: tam }}>
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-muted" />
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" strokeLinecap="round" className="pn-anel stroke-primary"
          strokeDasharray={c} strokeDashoffset={m ? c * (1 - Math.max(0, Math.min(100, valor)) / 100) : c} />
      </svg>
      <div className="text-center">
        <Numero valor={valor} className="block text-3xl font-semibold tracking-tight" />
        <span className="block text-xs uppercase tracking-wide text-muted-foreground">{rotulo}</span>
      </div>
    </div>
  );
}

/** A variação contra o período anterior: seta, texto e cor (bom ou mau conforme `inverso`). */
function Variacao({ c, inverso, dias }: { c: Comparado; inverso?: boolean; dias: number }) {
  const sobe = c.atual > c.antes, igual = c.atual === c.antes;
  const bom = igual ? null : inverso ? !sobe : sobe;
  const I = igual ? Minus : sobe ? ArrowUpRight : ArrowDownRight;
  const t = igual ? "igual" : c.delta === null ? "novo" : `${c.delta > 0 ? "+" : ""}${c.delta} %`;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-medium tabular-nums",
      bom === null ? "bg-muted text-muted-foreground" : bom ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200")}
      title={`${c.antes} nos ${dias} dias antes`}>
      <I className="h-3.5 w-3.5" aria-hidden="true" />{t}<span className="sr-only"> face aos {dias} dias antes ({c.antes})</span>
    </span>
  );
}

/** As entradas por semana: uma área que se desenha, com uma linha e uma dica ao passar o rato (ou com as setas do teclado). */
function AreaSemanas({ pontos }: { pontos: readonly { rotulo: string; n: number }[] }) {
  const [i, setI] = useState<number | null>(null), id = useId();
  const n = pontos.length, max = Math.max(1, ...pontos.map((p) => p.n));
  const x = (k: number): number => (n > 1 ? (k / (n - 1)) * 100 : 50), y = (v: number): number => 92 - (v / max) * 80;
  const linha = pontos.map((p, k) => `${x(k)},${y(p.n)}`).join(" ");
  const mover = (e: React.MouseEvent<HTMLDivElement>): void => {
    const r = e.currentTarget.getBoundingClientRect();
    setI(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
  };
  const teclas = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setI((v) => Math.max(0, Math.min(n - 1, (v ?? n - 1) + (e.key === "ArrowRight" ? 1 : -1))));
  };
  const total = pontos.reduce((a, p) => a + p.n, 0), topo = pontos.reduce((a, p) => (p.n > a.n ? p : a), pontos[0]);
  const p = i === null ? null : pontos[i];
  return (
    <div>
      <div role="img" tabIndex={0} aria-label={`${total} entradas em ${n} semanas; a semana com mais acabou a ${topo?.rotulo}, com ${topo?.n}. Setas para ver cada semana.`}
        aria-describedby={`${id}-dica`} onMouseMove={mover} onMouseLeave={() => setI(null)} onKeyDown={teclas} onBlur={() => setI(null)}
        className={cn("relative h-44 cursor-crosshair rounded-md", FOCO)}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2="100" y1={92 - g * 80} y2={92 - g * 80} className="stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="3 4" />)}
          <line x1="0" x2="100" y1="92" y2="92" className="stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <polygon points={`0,92 ${linha} 100,92`} className="pn-area fill-primary/15" />
          <polyline points={linha} pathLength={1} fill="none" className="pn-traco stroke-primary" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          {i !== null && <line x1={x(i)} x2={x(i)} y1="8" y2="92" className="stroke-foreground/40" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        </svg>
        {/* os pontos em HTML, para ficarem redondos com a área esticada */}
        {pontos.map((pt, k) => (
          <span key={k} aria-hidden="true" className={cn("absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary transition-transform",
            i === k ? "scale-150" : pt === topo && pt.n > 0 ? "scale-110" : "scale-0")} style={{ left: `${x(k)}%`, top: `${y(pt.n)}%` }} />
        ))}
        {p && i !== null && (
          <span className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-border bg-popover px-3 py-1.5 text-sm shadow-md"
            style={{ left: `${Math.min(88, Math.max(12, x(i)))}%`, top: `${y(p.n) - 4}%` }}>
            <span className="font-semibold tabular-nums">{p.n}</span> {p.n === 1 ? "entrada" : "entradas"} · semana até {p.rotulo}
          </span>
        )}
      </div>
      <p id={`${id}-dica`} className="mt-1 flex justify-between text-sm tabular-nums text-muted-foreground">
        <span>{pontos[0]?.rotulo}</span><span>{pontos[n - 1]?.rotulo} (hoje)</span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ insights */
const TOM: Record<Tom, { I: typeof AlertTriangle; caixa: string; icone: string; nome: string }> = {
  risco: { I: AlertTriangle, nome: "Urgente", caixa: "border-red-200 dark:border-red-900", icone: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  atencao: { I: Clock, nome: "Atenção", caixa: "border-amber-200 dark:border-amber-900", icone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  bom: { I: TrendingUp, nome: "Bom sinal", caixa: "border-emerald-200 dark:border-emerald-900", icone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  info: { I: Lightbulb, nome: "A saber", caixa: "border-border", icone: "bg-primary/10 text-primary" },
};

function CartaoInsight({ x, i, verNaLista }: { x: Insight; i: number; verNaLista: (p: Partial<FiltrosH>) => void }) {
  const t = TOM[x.tom];
  return (
    <Entra as="li" i={i + 4} className={cn("flex min-w-0 flex-col rounded-xl border bg-card p-4 transition-shadow hover:shadow-[var(--shadow-md)]", t.caixa)}>
      <div className="flex items-start gap-3">
        <span className={cn("relative grid h-9 w-9 shrink-0 place-items-center rounded-xl", t.icone, x.urgente && "pn-pulso")}>
          <t.I className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.nome}</span>
          <h4 className="text-[15px] font-semibold leading-snug">{x.titulo}</h4>
        </div>
        {x.numero && <span className="shrink-0 text-xl font-semibold tabular-nums tracking-tight">{x.numero}</span>}
      </div>
      <p className="mt-2 flex-1 text-[15px] leading-6 text-muted-foreground">{x.texto}</p>
      {x.acao && (
        <button type="button" onClick={() => verNaLista(x.acao!)} className={cn("group mt-3 inline-flex min-h-10 items-center gap-1 self-start rounded-md text-[15px] font-medium text-primary", FOCO)}>
          {x.acaoTexto ?? "Ver na lista"}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </button>
      )}
    </Entra>
  );
}

/* ------------------------------------------------------------------ o painel */
interface PainelProps { ls: LinhaH[]; hoje: Date; verNaLista: (p: Partial<FiltrosH>) => void; abrir: (id: number) => () => void }

export function PainelNegocios({ ls, hoje, verNaLista, abrir }: PainelProps) {
  const r = resumoH(ls, hoje), prev = previsao(ls), sd = saude(ls), cmp = compararPeriodos(ls, hoje, 30);
  const funil = funilH(ls), semanas = entradasPorSemana(ls, hoje, 12), ins = insights(ls, hoje, 6);
  const origens = porCampo(ls, "origem"), linhas = porCampo(ls, "linha", "euros"), comerciais = porCampo(ls.filter((l) => l.estado === "aberto"), "comercial", "euros");
  const motivos = motivosPerda(ls), atividade = atividadeRecente(ls, hoje, 8), parados = paradosH(ls, 6);
  const sEntradas = serieSemanal(ls, hoje, 8, (l) => l.entrada), sGanhos = serieSemanal(ls, hoje, 8, (l) => (l.estado === "ganho" || l.estado === "concluido" ? dataGanho(l.d, hoje) : null));
  const sValor = serieSemanal(ls, hoje, 8, (l) => (l.estado === "ganho" || l.estado === "concluido" ? dataGanho(l.d, hoje) : null), (l) => l.valor ?? 0);
  const sPerdidos = serieSemanal(ls, hoje, 8, (l) => (l.estado === "perdido" ? l.ultima : null));
  const hora = `${String(hoje.getHours()).padStart(2, "0")}:${String(hoje.getMinutes()).padStart(2, "0")}`;
  const maxParado = Math.max(1, ...parados.map((l) => l.parado ?? 0));
  const tabela = (cab: string[], ls2: (string | number)[][]) => (
    <table className="w-full text-[15px]"><thead><tr>{cab.map((c, i) => <th key={c} scope="col" className={cn("py-1 text-left font-semibold", i && "text-right")}>{c}</th>)}</tr></thead>
      <tbody>{ls2.map((l, i) => <tr key={i} className="border-t border-border">{l.map((x, j) => <td key={j} className={cn("py-1 tabular-nums", j && "text-right")}>{x}</td>)}</tr>)}</tbody></table>
  );

  if (!ls.length) return <p role="status" className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-[15px] text-muted-foreground">Nenhum negócio com estes filtros.</p>;

  return (
    <div className="mt-6 grid gap-5">
      {/* 1. A previsão e a saúde */}
      <section aria-label="Números dos negócios" className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Entra i={0} className="pn-brilho rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.07] via-card to-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[15px] font-semibold text-muted-foreground">Previsão de fecho</h3>
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <span className="relative flex h-2.5 w-2.5" aria-hidden="true"><span className="pn-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>
              Ao vivo · {hora}
            </span>
          </div>
          <Numero valor={Math.round(prev.total)} euros className="mt-2 block text-4xl font-semibold tracking-tight sm:text-5xl" />
          <p className="mt-1 text-[15px] leading-6 text-muted-foreground">
            <span className="font-medium text-foreground">{eurosTexto(Math.round(prev.ponderado))}</span> dos {eurosTexto(Math.round(prev.aberto))} em orçamentos feitos
            {prev.ponderadoEstimado > 0 && <> e <span className="font-medium text-foreground">cerca de {eurosTexto(Math.round(prev.ponderadoEstimado))}</span> dos {negocios(prev.semOrcamento)} ainda sem orçamento (ao valor médio ganho)</>}
            , cada um à taxa de fecho da fase em que está.
          </p>
          {/* a previsão repartida pelas fases: um tom da cor por fase, e o texto de cada uma por baixo */}
          {prev.total > 0 && (
            <>
              <div className="mt-5 flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                {prev.porFase.map((p) => <BarraFase key={p.fase} largura={(100 * p.ponderado) / prev.total} fase={p.fase} />)}
              </div>
              <ul className="mt-3 grid gap-x-5 gap-y-1.5 sm:grid-cols-2">
                {prev.porFase.map((p) => (
                  <li key={p.fase} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" style={{ opacity: OPAC[p.fase] }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{p.rotulo} <span className="text-muted-foreground">· {negocios(p.n)} · {p.prob} %{p.historica ? "" : "*"}</span></span>
                    <span className="tabular-nums font-medium">{p.estimado > 0 ? "≈ " : ""}{eurosTexto(Math.round(p.ponderado))}</span>
                  </li>
                ))}
              </ul>
              {prev.porFase.some((p) => !p.historica) && <p className="mt-2 text-sm text-muted-foreground">* taxa de exemplo: ainda há menos de 10 negócios decididos que passaram por esta fase. Com mais histórico, passa a ser a taxa real.</p>}
            </>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => verNaLista({ estado: "aberto" })}
              className={cn("group inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-[15px] font-medium text-primary-foreground transition-transform hover:-translate-y-0.5", FOCO)}>
              Ver os abertos na lista<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          </div>
        </Entra>

        <Entra i={1} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <h3 className="text-[15px] font-semibold text-muted-foreground">Saúde do funil</h3>
          <div className="mt-3 flex flex-wrap items-center gap-5">
            <Anel valor={sd.nota} rotulo="de 100" />
            <div className="min-w-0 flex-1">
              <p className={cn("text-lg font-semibold", sd.nota >= 70 ? "text-emerald-700 dark:text-emerald-300" : sd.nota >= 45 ? "text-amber-700 dark:text-amber-300" : "text-destructive")}>{sd.rotulo}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">60 % conversão, 40 % negócios sem estarem parados.</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div><dt className="text-muted-foreground">Conversão</dt><dd className="text-base font-semibold"><Numero valor={r.conversao ?? 0} pct /></dd></div>
                <div><dt className="text-muted-foreground">Ganhos · perdidos</dt><dd className="text-base font-semibold tabular-nums">{r.ganhos} · {r.perdidos}</dd></div>
                <div><dt className="text-muted-foreground">Valor médio ganho</dt><dd className="text-base font-semibold">{r.ticket === null ? "—" : <Numero valor={Math.round(r.ticket)} euros />}</dd></div>
                <div><dt className="text-muted-foreground">Da entrada ao contrato</dt><dd className="text-base font-semibold tabular-nums">{r.ciclo === null ? "—" : `${r.ciclo} dias`}</dd></div>
              </dl>
            </div>
          </div>
        </Entra>
      </section>

      {/* 2. Os últimos 30 dias contra os 30 antes */}
      <section aria-label={`Os últimos ${cmp.dias} dias`} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { rot: "Entradas", c: cmp.entradas, s: sEntradas, acao: { periodo: "30" } as Partial<FiltrosH>, ar: "Ver na lista as entradas dos últimos 30 dias" },
          { rot: "Ganhos", c: cmp.ganhos, s: sGanhos, acao: { estado: "ganho" } as Partial<FiltrosH>, ar: "Ver os ganhos na lista" },
          { rot: "Valor ganho", c: cmp.valorGanho, s: sValor, euros: true, acao: { estado: "ganho" } as Partial<FiltrosH>, ar: "Ver os ganhos na lista" },
          { rot: "Perdidos", c: cmp.perdidos, s: sPerdidos, inverso: true, acao: { estado: "perdido" } as Partial<FiltrosH>, ar: "Ver os perdidos na lista" },
        ].map((k, i) => (
          <Entra key={k.rot} i={i + 2}>
            <button type="button" onClick={() => verNaLista(k.acao)}
              className={cn("group block h-full w-full rounded-xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-[var(--shadow-md)]", FOCO)}>
              <span className="flex items-center justify-between gap-2">
                <span className="text-[15px] text-muted-foreground">{k.rot}</span>
                <Variacao c={k.c} inverso={k.inverso} dias={cmp.dias} />
              </span>
              <Numero valor={k.c.atual} euros={k.euros} className="mt-1 block text-2xl font-semibold tracking-tight" />
              <span className="block text-sm text-muted-foreground">nos últimos {cmp.dias} dias</span>
              <Faisca pontos={k.s} className="mt-2" />
              <span className="sr-only">. {k.ar}</span>
            </button>
          </Entra>
        ))}
      </section>

      {/* 3. O que os números dizem */}
      {ins.length > 0 && (
        <section aria-labelledby="ins-t">
          <h3 id="ins-t" className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />O que os números dizem</h3>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ins.map((x, i) => <CartaoInsight key={x.id} x={x} i={i} verNaLista={verNaLista} />)}
          </ul>
        </section>
      )}

      {/* 4. O funil e as entradas */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Entra i={6}>
          <CaixaGrafico titulo="Funil por fase" numero={`${funil[0].chegaram} entraram · ${funil[5].chegaram} chegaram à obra`}
            grafico={<FunilAfunilado funil={funil} verNaLista={verNaLista} />}
            tabela={tabela(["Fase", "Chegaram", "Passou", "Agora"], funil.map((e) => [e.rotulo, e.chegaram, e.passagem === null ? "—" : `${e.passagem} %`, e.agora]))} />
        </Entra>
        <Entra i={7}>
          <CaixaGrafico titulo="Entradas por semana" numero={`${semanas.reduce((a, s) => a + s.n, 0)} nas últimas 12 semanas`}
            vazio={semanas.some((s) => s.n) ? undefined : "Nenhuma entrada nas últimas 12 semanas."}
            grafico={<AreaSemanas pontos={semanas} />}
            tabela={tabela(["Semana até", "Entradas"], semanas.map((s) => [s.rotulo, s.n]))} />
        </Entra>
      </div>

      {/* 5. De onde vem, o que vale, de quem é e porque se perde */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Entra i={8}>
          <CaixaGrafico titulo="Por origem" numero={`${origens.length} origens · a pílula é a conversão`}
            grafico={
              <ul aria-label="Negócios por origem" className="grid gap-1">
                {origens.map((g, k) => (
                  <li key={g.id}>
                    <button type="button" onClick={() => verNaLista({ origem: g.id })} className={cn("block min-h-11 w-full rounded-md px-1 py-1.5 text-left hover:bg-muted/60", FOCO)}>
                      <span className="flex items-center gap-2 text-[15px]">
                        <span className="min-w-0 flex-1 truncate">{g.rotulo}</span>
                        {g.conversao !== null && (
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", g.conversao >= 50 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-muted text-muted-foreground")}>
                            converte {g.conversao} %
                          </span>
                        )}
                        <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">{g.n}</span>
                      </span>
                      <Barra largura={(100 * g.n) / (origens[0]?.n || 1)} destaque={k === 0} className="mt-1" />
                      <span className="sr-only">. Ver na lista os de {g.rotulo}</span>
                    </button>
                  </li>
                ))}
              </ul>}
            tabela={tabela(["Origem", "Negócios", "Ganhos", "Perdidos", "Conversão"], origens.map((g) => [g.rotulo, g.n, g.ganhos, g.perdidos, g.conversao === null ? "—" : `${g.conversao} %`]))} />
        </Entra>
        <Entra i={9}>
          <CaixaGrafico titulo="Valor por linha de serviço" numero={eurosTexto(Math.round(linhas.reduce((a, g) => a + g.euros, 0)))}
            grafico={<ListaBarras itens={linhas.map((g) => ({ id: g.id, rotulo: g.rotulo, texto: `${negocios(g.n)} · ${eurosTexto(Math.round(g.euros))}`, v: g.euros }))} aoEscolher={(v) => verNaLista({ linha: v })} />}
            tabela={tabela(["Linha", "Negócios", "Valor"], linhas.map((g) => [g.rotulo, g.n, eurosTexto(g.euros)]))} />
        </Entra>
        <Entra i={10}>
          <CaixaGrafico titulo="Em aberto por comercial" numero={eurosTexto(Math.round(comerciais.reduce((a, g) => a + g.euros, 0)))} vazio={comerciais.length ? undefined : "Nenhum negócio em aberto."}
            grafico={<ListaBarras itens={comerciais.map((g) => ({ id: g.id, rotulo: g.rotulo, texto: `${negocios(g.n)} · ${eurosTexto(Math.round(g.euros))}`, v: g.euros || g.n }))} aoEscolher={(v) => verNaLista({ comercial: v, estado: "aberto" })} />}
            tabela={tabela(["Comercial", "Abertos", "Valor"], comerciais.map((g) => [g.rotulo, g.n, eurosTexto(g.euros)]))} />
        </Entra>
        <Entra i={11}>
          <CaixaGrafico titulo="Porque se perdeu" numero={negocios(r.perdidos)} vazio={motivos.length ? undefined : "Nenhum negócio perdido com estes filtros."}
            grafico={<ListaBarras itens={motivos.map((m) => ({ id: m.motivo, rotulo: m.motivo, texto: String(m.n), v: m.n }))} />}
            tabela={tabela(["Motivo", "Negócios"], motivos.map((m) => [m.motivo, m.n]))} />
        </Entra>
      </div>

      {/* 6. Ao vivo e parados */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Entra as="section" i={12} aria-labelledby="ativ-t" className="rounded-xl border border-border bg-card p-4">
          <h3 id="ativ-t" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
            <span className="relative flex h-2.5 w-2.5" aria-hidden="true"><span className="pn-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" /></span>
            O que aconteceu por último
          </h3>
          <ol className="relative ml-1.5 mt-3 border-l border-border pl-5">
            {atividade.map((a, k) => (
              <li key={k} className="pn-subir relative pb-3 last:pb-0" style={{ animationDelay: `${600 + k * 60}ms` }}>
                <span className={cn("absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-card", a.k === "x" ? "bg-destructive" : a.k === "w" ? "bg-amber-500" : "bg-primary")} aria-hidden="true" />
                <button type="button" onClick={abrir(a.id)} className={cn("text-left text-[15px] font-semibold hover:underline", FOCO)}>{a.nome}</button>
                <span className="block text-[15px]">{a.t}</span>
                <span className="block text-sm tabular-nums text-muted-foreground">{a.q}</span>
              </li>
            ))}
          </ol>
        </Entra>
        <Entra as="section" i={13} aria-labelledby="par-t" className="rounded-xl border border-border bg-card p-4">
          <h3 id="par-t" className="text-[17px] font-semibold tracking-tight">Parados há mais tempo</h3>
          <p className="mt-0.5 text-[15px] text-muted-foreground">Abertos, pelo tempo desde o último acontecimento. A barra é o tempo parado.</p>
          {parados.length ? (
            <ul className="mt-3 divide-y divide-border">
              {parados.map((l) => (
                <li key={l.id}>
                  <button type="button" onClick={abrir(l.id)} className={cn("flex min-h-12 w-full items-center gap-3 py-2 text-left hover:bg-muted/40", FOCO)}>
                    <IconeFase fase={l.fase} tam="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-semibold">{l.nome}</span>
                        <span className={cn("shrink-0 text-sm tabular-nums", (l.parado ?? 0) >= 7 ? "font-semibold text-destructive" : "text-muted-foreground")}>{haDias(l.parado)}</span>
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">{FASES[l.fase]} · {l.ultimoTexto}</span>
                      <Barra largura={(100 * (l.parado ?? 0)) / maxParado} destaque={(l.parado ?? 0) >= 7} className="mt-1 h-1.5" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-[15px] text-muted-foreground">Nenhum negócio em aberto.</p>}
        </Entra>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ peças do painel */
/** O tom da cor de cada fase (uma só cor, mais forte quanto mais perto do fecho). */
const OPAC = [0.35, 0.5, 0.65, 0.8, 0.9, 1];

function BarraFase({ largura, fase }: { largura: number; fase: number }) {
  const m = useMontado();
  return <span className="pn-barra block h-full bg-primary first:rounded-l-full last:rounded-r-full" style={{ width: `${m ? largura : 0}%`, opacity: OPAC[fase] }} />;
}

/** Barras com o nome e o número em texto; a maior leva a cor. Com `aoEscolher`, cada linha filtra a Lista. */
function ListaBarras({ itens, aoEscolher }: { itens: { id: string; rotulo: string; texto: string; v: number }[]; aoEscolher?: (id: string) => void }) {
  const max = Math.max(1, ...itens.map((x) => x.v));
  return (
    <ul className="grid gap-1">
      {itens.map((x, k) => {
        const corpo = (
          <>
            <span className="flex items-baseline justify-between gap-3 text-[15px]"><span className="min-w-0 break-words">{x.rotulo}</span><span className="shrink-0 tabular-nums text-muted-foreground">{x.texto}</span></span>
            <Barra largura={(100 * x.v) / max} destaque={k === 0} className="mt-1" />
          </>
        );
        return (
          <li key={x.id}>
            {aoEscolher
              ? <button type="button" onClick={() => aoEscolher(x.id)} className={cn("block min-h-11 w-full rounded-md px-1 py-1.5 text-left hover:bg-muted/60", FOCO)}>{corpo}<span className="sr-only">. Ver na lista</span></button>
              : <div className="px-1 py-1.5">{corpo}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/** O funil afunilado: cada fase é uma barra centrada, da largura de quantos lá chegaram; entre fases, quantos ficaram.
 *  O maior aperto (de uma fase com 3 ou mais negócios) fica marcado. O texto fica fora da barra; cada fase filtra a Lista. */
function FunilAfunilado({ funil, verNaLista }: { funil: ReturnType<typeof funilH>; verNaLista: (p: Partial<FiltrosH>) => void }) {
  const m = useMontado(), base = funil[0]?.chegaram || 1;
  let pior = -1;
  funil.forEach((e, k) => { if (k > 0 && funil[k - 1].chegaram >= 3 && e.passagem !== null && e.passagem < 100 && (pior < 0 || e.passagem < (funil[pior].passagem ?? 100))) pior = k; });
  return (
    <ol aria-label="Funil por fase" className="grid">
      {funil.map((e, k) => (
        <li key={e.fase}>
          {k > 0 && (
            <p className={cn("flex items-center justify-center gap-1 py-0.5 text-xs tabular-nums", k === pior ? "font-semibold text-destructive" : "text-muted-foreground")}>
              <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
              {funil[k - 1].chegaram - e.chegaram} ficaram · passou {e.passagem} %{k === pior ? " · maior aperto" : ""}
            </p>
          )}
          <button type="button" onClick={() => verNaLista({ fase: String(e.fase) })}
            className={cn("group grid min-h-10 w-full grid-cols-[6.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 rounded-md px-1 text-left hover:bg-muted/50", FOCO)}>
            <span className="truncate text-sm font-medium">{e.rotulo}</span>
            <span className="relative block h-7" aria-hidden="true">
              <span className={cn("pn-barra absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-md bg-primary transition-[filter] group-hover:brightness-110", k === pior && "pn-pulso")}
                style={{ width: `${m ? Math.max(3, (100 * e.chegaram) / base) : 0}%`, opacity: OPAC[e.fase] }} />
            </span>
            <span className="text-right text-sm tabular-nums"><span className="font-semibold">{e.chegaram}</span>{e.agora ? <span className="block text-xs text-muted-foreground">{e.agora} agora</span> : null}</span>
            <span className="sr-only">. Ver na lista os que estão em {e.rotulo}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
