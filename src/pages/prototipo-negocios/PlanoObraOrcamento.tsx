// O plano da obra no orçamento (14/10/2026; substitui o "Prazo previsto" de 13/10). Pedido do Ruben: o orçamento
// "dinâmico, interativo, com Gantt com as fases e custos e a previsão de duração, bonito mas útil".
// · Em cima: a duração em dias úteis, as datas (o início escolhe-se num toque) e o prazo da proposta.
// · As fases da obra (1–4), cada uma com os dias, o preço e a margem; tocar numa fase realça as suas tarefas.
// · O Gantt em datas reais (só dias úteis): arrastar a ponta de uma barra (ou ← → no teclado) muda os dias da tarefa,
//   e o custo, a margem e as datas mudam ao vivo. O preço ao cliente não muda.
// · A curva do custo acumulado, com o preço ao cliente como referência: vê-se quando sai o dinheiro e o lucro no fim.
// Cores: uma rampa do acento, da fase 1 (clara) à 4 (escura); o texto nunca vai em cima das barras (contraste).
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CalendarDays, CheckCircle2, Minus, Plus, RotateCcw, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { eur, nfmt, pct, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { iconeOficio } from "./LinhasOrcamento";
import { HORAS_DIA, TAREFA_DEMOLICAO, diasDeHoras, prazoProposta, type TarefaPrevista } from "./ganttOrcamento";
import {
  COR_FASE, PAGAMENTO_FASES, curvaCusto, dataCurta, deIso, diaDaPrestacao, diaSemana, diasDaObra, feriadosSaltados, iniciosRapidos, isoDia, nomeMes, planoObra,
  prestacoes, recebidoAte, sugerirPorFases, tesouraria, type FasePlano, type Plano, type Prestacao,
} from "./planoObra";
import { totais } from "./DocsCliente";
import { Contagem, MOLA, useReduzir, vibrar } from "./movimento";

export { COR_FASE } from "./planoObra";
const dias = (n: number) => `${nfmt(n)} ${n === 1 ? "dia" : "dias"}`;
const eur0 = (n: number) => `${eur(n)} €`;

export function PlanoObra({ ctx, d }: { ctx: Pick<Ctx, "S" | "A" | "run">; d: Negocio }) {
  const { S, A, run } = ctx;
  const o = d.orc!, fechado = !!o.enviada, direcao = S.role === "direcao";
  const reduzir = useReduzir();
  const P = planoObra(d, S);
  const equipa = o.equipa ?? 1;
  const alternativa = planoObra(d, S, equipa === 1 ? 2 : 1); // para mostrar quantos dias se ganham (ou perdem)
  const [faseOn, setFaseOn] = useState<number | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [arrasto, setArrasto] = useState<string | null>(null);
  const [outra, setOutra] = useState(false);

  // a largura disponível: as colunas dos dias enchem-na (com um mínimo; abaixo dele a grelha desliza)
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(800);
  useEffect(() => {
    const el = caixa.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setLargura(el.clientWidth));
    ro.observe(el);
    setLargura(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const rapidos = useMemo(() => iniciosRapidos(new Date()), []);
  const inicio = o.inicioObra ? deIso(o.inicioObra) : rapidos[0].data;
  const nDias = Math.max(1, Math.ceil(P.dias - 1e-9));
  const calendario = useMemo(() => diasDaObra(inicio, nDias + 1), [isoDia(inicio), nDias]); // eslint-disable-line react-hooks/exhaustive-deps
  const saltados = feriadosSaltados(calendario.slice(0, nDias));
  const fimData = calendario[nDias - 1];
  if (!P.tarefas.length) return null;

  const estreito = largura < 640;
  const rotuloW = estreito ? 128 : 216;
  const folga = 104; // à direita da grelha: o custo ao lado da última barra
  const colW = Math.max(estreito ? 52 : 56, (largura - rotuloW - folga) / nDias);
  const gradeW = colW * nDias;
  const X = (dia: number) => dia * colW;

  const naProposta = Number(d.f.prazo_exec) || 0, doGantt = prazoProposta(P.tarefas);
  const delta = P.tarefas.reduce((a, t) => a + t.delta, 0);
  const temDem = (f: FasePlano) => f.tarefas.some((t) => t.chave === TAREFA_DEMOLICAO);
  const veCustoFase = (f: FasePlano) => direcao || !temDem(f); // o custo da demolição só a Direção o vê

  /* ---------------------------------------------- arrastar a ponta da barra (meio dia de cada vez) */
  const arrastar = (t: TarefaPrevista) => (e: RPointerEvent<HTMLElement>) => {
    if (fechado || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, d0 = t.dias;
    let atual = d0;
    setArrasto(t.chave);
    const mover = (ev: PointerEvent) => {
      const nd = Math.max(0.5, Math.round((d0 + (ev.clientX - x0) / colW) * 2) / 2);
      if (nd !== atual) { atual = nd; vibrar(5, reduzir); run(() => A.prazoTarefa(d.id, t.chave, nd)); }
    };
    const largar = () => { setArrasto(null); window.removeEventListener("pointermove", mover); window.removeEventListener("pointerup", largar); window.removeEventListener("pointercancel", largar); };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", largar);
    window.addEventListener("pointercancel", largar);
  };
  const teclas = (t: TarefaPrevista) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAberta(aberta === t.chave ? null : t.chave); return; }
    if (fechado) return;
    const passo = e.key === "ArrowRight" || e.key === "ArrowUp" ? 0.5 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -0.5 : 0;
    if (!passo) return;
    e.preventDefault();
    if (t.dias + passo >= 0.5) run(() => A.prazoTarefa(d.id, t.chave, t.dias + passo));
  };

  const tarefaAberta = P.tarefas.find((t) => t.chave === aberta) ?? null;
  const sugerido = sugerirPorFases(P);
  const prestAtual = d.f.pagamento === PAGAMENTO_FASES ? (o.pagFases?.length ? o.pagFases : sugerido) : prestacoes(d.f.pagamento);

  return (
    <section aria-labelledby={`plano-${d.id}`} className="space-y-4">
      {/* ------------------------------------------------ cabeçalho: duração, datas e início */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h3 id={`plano-${d.id}`} className="flex items-center gap-2 text-base font-semibold"><CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Plano da obra</h3>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <Contagem valor={P.dias} fmt={(n) => nfmt(Math.round(n * 2) / 2)} className="text-3xl font-semibold tracking-tight tabular-nums" />
            <span className="text-[15px] text-muted-foreground">{P.dias === 1 ? "dia útil" : "dias úteis"}</span>
          </p>
          <p className="text-[15px] text-foreground">
            {dataCurta(calendario[0])} <span aria-hidden="true" className="text-muted-foreground">→</span><span className="sr-only"> até </span> {dataCurta(fimData)}
          </p>
          {saltados.length > 0 && (
            <p className="text-sm text-muted-foreground">Sem contar {saltados.map((s) => `${s.data.getDate()} ${nomeMes(s.data)} (${s.nome})`).join(", ")}.</p>
          )}
        </div>
        <div className="grid gap-1.5">
          <span id={`ini-${d.id}`} className="text-sm text-muted-foreground">Começa</span>
          <div role="group" aria-labelledby={`ini-${d.id}`} className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible">
            {rapidos.map((r) => {
              const on = !outra && isoDia(inicio) === isoDia(r.data);
              return (
                <button key={r.k} type="button" aria-pressed={on} onClick={() => { setOutra(false); run(() => A.inicioObra(d.id, r.k === "seg" ? null : isoDia(r.data))); }}
                  className={cn("min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-[15px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40")}>
                  {r.nome}<span className={cn("ml-1.5 text-sm", on ? "text-primary-foreground/90" : "text-muted-foreground")}>{r.data.getDate()} {nomeMes(r.data)}</span>
                </button>
              );
            })}
            {outra ? (
              <input type="date" aria-label="Data de início" value={isoDia(inicio)} autoFocus
                onChange={(e) => e.target.value && run(() => A.inicioObra(d.id, e.target.value))}
                className="min-h-11 rounded-full border border-primary bg-card px-4 text-[15px]" />
            ) : (
              <button type="button" onClick={() => setOutra(true)} className="min-h-11 shrink-0 whitespace-nowrap rounded-full px-3 text-[15px] font-medium text-primary hover:underline">Outra data</button>
            )}
          </div>
        </div>
      </div>

      <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        Na proposta: <b className="font-semibold text-foreground tabular-nums">{naProposta ? `${naProposta} dias úteis` : "a definir"}</b>
        {naProposta !== doGantt && !fechado && (
          <button type="button" onClick={() => run(() => A.usarPrazoPrevisto(d.id))} className="inline-flex min-h-9 items-center font-medium text-primary underline-offset-4 hover:underline">
            Usar {doGantt} dias na proposta
          </button>
        )}
      </p>
      {delta !== 0 && (
        <p className="text-sm text-warning">Os dias mudados à mão {delta > 0 ? "somam" : "tiram"} {eur0(Math.abs(delta))} ao custo. O preço ao cliente não muda.</p>
      )}

      {/* o reforço: mais gente por ofício, menos dias, as mesmas horas */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span id={`eq-${d.id}`} className="text-sm text-muted-foreground">Equipa por ofício</span>
        <div role="group" aria-labelledby={`eq-${d.id}`} className="inline-flex rounded-full border border-input bg-card p-0.5">
          {[1, 2].map((n) => {
            const on = equipa === n, outroP = n === equipa ? P : alternativa;
            const ganho = n !== equipa ? P.dias - outroP.dias : 0;
            return (
              <button key={n} type="button" aria-pressed={on} disabled={fechado} onClick={() => run(() => A.equipaObra(d.id, n))}
                className={cn("min-h-10 rounded-full px-4 text-[15px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60",
                  on ? "bg-foreground font-medium text-background" : "text-foreground hover:bg-muted")}>
                {n === 1 ? "1 pessoa" : "2 pessoas"}
                {ganho !== 0 && <span className={cn("ml-1.5 text-sm tabular-nums", ganho > 0 ? "text-success" : "text-muted-foreground")}>{ganho > 0 ? "−" : "+"}{dias(Math.abs(ganho))}</span>}
              </button>
            );
          })}
        </div>
        <span className="text-sm text-muted-foreground">as mesmas horas: o custo não muda</span>
      </div>

      {/* ------------------------------------------------ as fases */}
      <div role="group" aria-label="Fases da obra" className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:overflow-visible" style={{ gridTemplateColumns: `repeat(${P.fases.length}, minmax(0, 1fr))` }}>
        {P.fases.map((f) => {
          const on = faseOn === f.n, dur = f.fim - f.inicio;
          return (
            <button key={f.n} type="button" aria-pressed={on} onClick={() => setFaseOn(on ? null : f.n)}
              className={cn("relative min-w-[172px] snap-start overflow-hidden rounded-xl border bg-card p-3 pt-4 text-left outline-none transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                on ? "border-primary shadow-[0_6px_20px_-12px_hsl(var(--primary)/0.7)]" : "border-border hover:border-foreground/30",
                faseOn != null && !on && "opacity-60")}>
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5" style={{ background: COR_FASE[f.n] }} />
              <span className="flex items-baseline gap-2">
                <span className="text-sm font-semibold tabular-nums text-muted-foreground">Fase {f.n}</span>
                <span className="ml-auto text-sm tabular-nums text-muted-foreground">{dur > 0 ? dias(dur) : "sem dias"}</span>
              </span>
              <span className="mt-0.5 block text-[15px] font-semibold leading-snug">{f.curto}</span>
              {dur > 0 && <span className="block text-sm text-muted-foreground">{dataCurta(calendario[Math.floor(f.inicio)])}</span>}
              <span className="mt-2 block whitespace-nowrap text-lg font-semibold tabular-nums">{eur0(f.preco)}</span>
              {veCustoFase(f) && (
                <span className="block text-sm tabular-nums text-muted-foreground">
                  {f.preco > 0 && <><span className={cn(f.margem < S.cfg.min / 100 && "font-semibold text-destructive")}>margem {pct(f.margem)}</span> · </>}custo {eur0(f.custo)}
                  {f.custoMat > 0 && <span className="block">dos quais materiais {eur0(f.custoMat)}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ------------------------------------------------ o Gantt e a curva (a mesma grelha de dias) */}
      <div ref={caixa} className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]">
        <div style={{ width: rotuloW + gradeW + folga }} className="relative">
          {/* os dias (só os úteis) */}
          <div className="sticky top-0 z-10 flex border-b border-border bg-card" aria-hidden="true">
            <div className="sticky left-0 z-10 shrink-0 bg-card" style={{ width: rotuloW }} />
            <div className="relative h-12" style={{ width: gradeW }}>
              {calendario.slice(0, nDias).map((dt, k) => {
                const mudaMes = k === 0 || dt.getMonth() !== calendario[k - 1].getMonth();
                return (
                  <div key={k} className="absolute bottom-0 top-0 border-l border-border/70 pl-1.5 pt-1" style={{ left: X(k), width: colW }}>
                    <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{mudaMes ? nomeMes(dt) : " "}</span>
                    <span className="block text-sm tabular-nums text-foreground"><span className="text-muted-foreground">{diaSemana(dt)}</span> {dt.getDate()}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* as faixas das fases, por trás das linhas */}
          <div className="pointer-events-none absolute bottom-0 top-12" style={{ left: rotuloW, width: gradeW }} aria-hidden="true">
            {P.fases.filter((f) => f.fim > f.inicio).map((f) => (
              <div key={f.n} className="absolute bottom-0 top-0 transition-opacity" style={{ left: X(f.inicio), width: X(f.fim - f.inicio), background: COR_FASE[f.n], opacity: faseOn == null ? 0.05 : faseOn === f.n ? 0.1 : 0.02 }} />
            ))}
          </div>

          <ul aria-label="Tarefas da obra" className="relative py-1">
            {P.fases.flatMap((f) => f.tarefas).map((t, i) => {
              const Ic = iconeOficio(t.perfil), apagada = faseOn != null && faseOn !== t.fase, aqui = aberta === t.chave;
              const dem = t.chave === TAREFA_DEMOLICAO, veCusto = !dem || direcao;
              const largo = X(t.dias);
              return (
                <li key={t.chave} className={cn("flex items-center transition-opacity", apagada && "opacity-30")} style={{ height: 52 }}>
                  <button type="button" onClick={() => setAberta(aqui ? null : t.chave)} aria-expanded={aqui}
                    className={cn("sticky left-0 z-[5] flex h-full shrink-0 items-center gap-2 bg-card pl-3 pr-2 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary", aqui && "bg-muted/60")}
                    style={{ width: rotuloW }}>
                    <span className="hidden h-8 w-8 shrink-0 place-items-center rounded-lg sm:grid" style={{ background: `${COR_FASE[t.fase]}1f`, color: COR_FASE[t.fase] }} aria-hidden="true"><Ic className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium leading-tight" title={t.nome}>{t.nome}</span>
                      <span className="block truncate whitespace-nowrap text-sm tabular-nums text-muted-foreground">{dias(t.dias)}{t.manual && " · mudado"}</span>
                    </span>
                  </button>
                  <div className="relative h-full" style={{ width: gradeW }}>
                    <motion.div
                      role="slider" tabIndex={0} aria-label={`Dias de ${t.nome}`} aria-valuemin={0.5} aria-valuenow={t.dias}
                      aria-valuetext={`${dias(t.dias)}, de ${dataCurta(calendario[Math.floor(t.inicio)])}`} aria-readonly={fechado || undefined}
                      onKeyDown={teclas(t)} onClick={() => setAberta(aqui ? null : t.chave)}
                      initial={reduzir ? false : { opacity: 0, scaleX: 0.2 }}
                      animate={{ opacity: 1, scaleX: 1, left: X(t.inicio) + 2, width: Math.max(10, largo - 4) }}
                      transition={reduzir ? { duration: 0 } : { ...MOLA, delay: arrasto ? 0 : Math.min(i, 12) * 0.03 }}
                      className={cn("absolute h-7 origin-left cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                        aqui && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-card", t.manual && "bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(255_255_255/0.35)_6px_8px)]")}
                      style={{ background: COR_FASE[t.fase], top: 12 }}>
                      {!fechado && (
                        <span onPointerDown={arrastar(t)} aria-hidden="true" title="Arraste para mudar os dias"
                          className={cn("absolute -right-2 top-1/2 flex h-10 w-5 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center", arrasto === t.chave && "scale-110")}>
                          <span className="h-5 w-1.5 rounded-full bg-card shadow-[0_0_0_1.5px_rgba(0,0,0,0.25)]" />
                        </span>
                      )}
                    </motion.div>
                    {/* o texto ao lado da barra (nunca por cima: contraste) */}
                    <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-sm tabular-nums text-muted-foreground transition-[left]"
                      style={{ left: X(t.inicio) + largo + 12 }}>
                      {veCusto ? eur0(t.custo.total) : ""}
                      {veCusto && t.delta !== 0 && <span className={t.delta > 0 ? "text-destructive" : "text-success"}> {t.delta > 0 ? "+" : "−"}{eur(Math.abs(t.delta))}</span>}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* a curva do custo acumulado, alinhada com os dias */}
          <CurvaCusto P={P} prest={prestAtual} rotuloW={rotuloW} colW={colW} gradeW={gradeW} calendario={calendario} faseOn={faseOn} />
        </div>
      </div>

      <Pagamentos P={P} d={d} ctx={ctx} calendario={calendario} fechado={fechado} prest={prestAtual} sugerido={sugerido} />

      {!fechado && <p className="text-sm text-muted-foreground">Arraste a ponta de uma barra<span className="hidden sm:inline"> (ou use ← → com ela focada)</span> para mudar os dias; toque na tarefa para ver o custo.</p>}

      {/* ------------------------------------------------ o detalhe da tarefa escolhida */}
      {tarefaAberta && <DetalheTarefa t={tarefaAberta} d={d} ctx={ctx} fechado={fechado} direcao={direcao} inicio={dataCurta(calendario[Math.floor(tarefaAberta.inicio)])} />}
    </section>
  );
}

/* ================================================================== a curva */
function CurvaCusto({ P, prest, rotuloW, colW, gradeW, calendario, faseOn }: {
  P: Plano; prest: Prestacao[]; rotuloW: number; colW: number; gradeW: number; calendario: Date[]; faseOn: number | null;
}) {
  const C = curvaCusto(P);
  const [mira, setMira] = useState<number | null>(null);
  const H = 132, topo = 18, base = H - 22;
  const max = Math.max(P.preco, P.custo, 1);
  const Y = (v: number) => base - (v / max) * (base - topo);
  const X = (x: number) => Math.min(gradeW, x * colW);
  const linha = C.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.c).toFixed(1)}`).join(" ");
  const area = `${linha} L${X(C[C.length - 1].x).toFixed(1)},${base} L0,${base} Z`;
  const ponto = mira != null ? C[mira] : null;
  // o recebido (em degraus) e os troços a descoberto (gasto acima do recebido)
  const TS = tesouraria(P, prest);
  const fimX = C[C.length - 1].x;
  const marcos = [...new Set([0, ...prest.map((t) => diaDaPrestacao(P, t))])].sort((a, b) => a - b);
  let degraus = "";
  marcos.forEach((x, i) => { const r = recebidoAte(P, prest, x); degraus += i === 0 ? `M0,${Y(r).toFixed(1)}` : ` H${X(x).toFixed(1)} V${Y(r).toFixed(1)}`; });
  degraus += ` H${X(fimX).toFixed(1)}`;
  const recFim = recebidoAte(P, prest, fimX);
  const lucro = P.preco - P.custo;
  const mover = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / colW;
    setMira(Math.max(0, Math.min(C.length - 1, Math.round(x * 2))));
  };
  const diaTxt = (x: number) => { const k = Math.min(calendario.length - 1, Math.floor(x)); return x >= P.dias - 1e-9 ? `fim (${dataCurta(calendario[Math.max(0, Math.ceil(P.dias) - 1)])})` : dataCurta(calendario[k]); };
  return (
    <div className="flex border-t border-border">
      <div className="sticky left-0 z-[5] shrink-0 bg-card px-3 pt-3" style={{ width: rotuloW }}>
        <p className="text-[15px] font-medium leading-tight">Custo acumulado</p>
        <p className="hidden text-sm text-muted-foreground sm:block">quando sai o dinheiro</p>
        <p className="mt-2 text-sm tabular-nums"><span className="block text-muted-foreground">lucro previsto</span><b className="font-semibold">{eur(lucro)} €</b></p>
      </div>
      <div className="relative" style={{ width: gradeW }}>
        <svg width={gradeW} height={H} role="img" aria-label={`Custo acumulado: chega a ${eur(P.custo)} € no fim; o preço ao cliente é ${eur(P.preco)} €.`}
          onPointerMove={mover} onPointerLeave={() => setMira(null)} className="block touch-pan-x overflow-visible">
          {/* as fronteiras das fases */}
          {P.fases.filter((f) => f.fim > f.inicio).map((f) => (
            <g key={f.n} opacity={faseOn == null || faseOn === f.n ? 1 : 0.35}>
              <rect x={X(f.inicio)} y={base + 6} width={Math.max(2, X(f.fim) - X(f.inicio) - 2)} height={4} rx={2} fill={COR_FASE[f.n]} />
            </g>
          ))}
          {/* o preço ao cliente (referência) */}
          <line x1={0} x2={gradeW} y1={Y(P.preco)} y2={Y(P.preco)} stroke="hsl(var(--foreground))" strokeOpacity={0.35} strokeDasharray="4 4" strokeWidth={1} />
          <text x={gradeW - 6} y={Y(P.preco) - 5} textAnchor="end" className="fill-muted-foreground text-[12px] tabular-nums">preço {eur(P.preco)} €</text>
          <line x1={0} x2={gradeW} y1={base} y2={base} stroke="hsl(var(--border))" strokeWidth={1} />
          <path d={area} fill="hsl(var(--primary))" fillOpacity={0.1} />
          {TS.pontos.slice(0, -1).map((p, i) => { const q = TS.pontos[i + 1]; return p.saldo < -0.5 && q.x > p.x ? <rect key={i} x={X(p.x)} width={Math.max(1, X(q.x) - X(p.x))} y={Y(p.gasto)} height={Math.max(0, Y(p.recebido) - Y(p.gasto))} fill="hsl(var(--destructive))" fillOpacity={0.14} /> : null; })}
          <path d={degraus} fill="none" stroke="hsl(var(--foreground))" strokeOpacity={0.7} strokeWidth={2} strokeLinejoin="round" />
          <text x={X(fimX) + 8} y={Y(recFim) - 6} className="fill-muted-foreground text-[12px] tabular-nums">recebido</text>
          <path d={linha} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinejoin="round" />
          <circle cx={X(C[C.length - 1].x)} cy={Y(C[C.length - 1].c)} r={4} fill="hsl(var(--primary))" stroke="hsl(var(--card))" strokeWidth={2} />
          <text x={X(C[C.length - 1].x) + 8} y={Y(C[C.length - 1].c) + 4} className="fill-foreground text-[12px] font-semibold tabular-nums">custo {eur(P.custo)} €</text>
          {ponto && (
            <g>
              <line x1={X(ponto.x)} x2={X(ponto.x)} y1={topo - 6} y2={base} stroke="hsl(var(--foreground))" strokeOpacity={0.45} strokeWidth={1} />
              <circle cx={X(ponto.x)} cy={Y(ponto.c)} r={4.5} fill="hsl(var(--primary))" stroke="hsl(var(--card))" strokeWidth={2} />
            </g>
          )}
        </svg>
        {ponto && (
          <div className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm shadow-[var(--shadow-md)]"
            style={{ left: Math.min(Math.max(X(ponto.x), 90), gradeW - 90) }}>
            <span className="block text-muted-foreground">{diaTxt(ponto.x)}</span>
            <span className="block font-semibold tabular-nums">{eur(ponto.c)} € gastos</span>
            <span className="block tabular-nums text-muted-foreground">{eur(recebidoAte(P, prest, ponto.x))} € recebidos</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================== o detalhe de uma tarefa */
function DetalheTarefa({ t, d, ctx, fechado, direcao, inicio }: {
  t: TarefaPrevista; d: Negocio; ctx: Pick<Ctx, "A" | "run">; fechado: boolean; direcao: boolean; inicio: string;
}) {
  const { A, run } = ctx;
  const dem = t.chave === TAREFA_DEMOLICAO, veCusto = !dem || direcao, poucas = t.h < t.hOrc - 1e-9;
  return (
    <div className="grid gap-4 rounded-2xl border border-border bg-card p-4 animate-in fade-in-0 sm:p-5" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-semibold">{t.nome}</p>
        <p className="text-sm text-muted-foreground">Fase {t.fase} · começa {inicio}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Duração" className="inline-flex items-center rounded-lg border border-input bg-background p-0.5">
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
        O orçamento conta {nfmt(t.hOrc)} h ({t.perfil.toLowerCase()}), a {HORAS_DIA} h por dia.{t.manual && ` Com ${dias(t.dias)} contam ${nfmt(t.h)} h.`}
      </p>
      {poucas && <p className="flex items-start gap-2 text-sm text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Menos horas do que o orçamento conta: ou vai mais gente, ou o prazo não chega.</p>}
      {veCusto ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-4">
          <div><dt className="text-sm text-muted-foreground">Mão de obra</dt><dd className="tabular-nums">{eur0(t.custo.mo)}<span className="block text-xs text-muted-foreground">{nfmt(t.h)} h × {eur(t.custoHora)} €</span></dd></div>
          {!dem && <div><dt className="text-sm text-muted-foreground">Equipamento</dt><dd className="tabular-nums">{eur0(t.custo.eq)}</dd></div>}
          <div><dt className="text-sm text-muted-foreground">Consumíveis</dt><dd className="tabular-nums">{eur0(t.custo.cons)}</dd></div>
          {Math.abs(t.custo.outros) >= 0.01 && <div><dt className="text-sm text-muted-foreground">{dem ? "Deposição, proteção e meio" : "Outros"}</dt><dd className="tabular-nums">{eur0(t.custo.outros)}</dd></div>}
          <div><dt className="text-sm text-muted-foreground">Custo da tarefa</dt><dd className="font-semibold tabular-nums">{eur0(t.custo.total)}
            {t.delta !== 0 && <span className="block text-xs font-normal text-muted-foreground">no orçamento: {eur0(t.custoOrc)}</span>}</dd></div>
        </dl>
      ) : <p className="text-sm text-muted-foreground">O custo da demolição e entulho só a Direção o vê.</p>}
    </div>
  );
}

/* ================================================================== os pagamentos e a tesouraria */
const OPCOES_PAG = ["100% na adjudicação", "50% + 50% no fim", "30% + 40% + 30%", PAGAMENTO_FASES];
function Pagamentos({ P, d, ctx, calendario, fechado, prest, sugerido }: {
  P: Plano; d: Negocio; ctx: Pick<Ctx, "S" | "A" | "run">; calendario: Date[]; fechado: boolean; prest: Prestacao[]; sugerido: Prestacao[];
}) {
  const { S, A, run } = ctx;
  const o = d.orc!, atual = d.f.pagamento || "50% + 50% no fim";
  const comIva = totais(d, S).total;
  const TS = tesouraria(P, prest);
  const desatualizado = atual === PAGAMENTO_FASES && !!o.pagFases?.length && JSON.stringify(o.pagFases) !== JSON.stringify(sugerido);
  const quando = (t: Prestacao) => {
    if (t.fase === 0) return "antes de começar";
    const x = diaDaPrestacao(P, t);
    return dataCurta(calendario[Math.max(0, Math.ceil(x - 1e-9) - 1)]);
  };
  const diaTxt = (x: number) => dataCurta(calendario[Math.min(calendario.length - 1, Math.max(0, Math.floor(x)))]);
  return (
    <section aria-labelledby={`pag-${d.id}`} className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 id={`pag-${d.id}`} className="flex items-center gap-2 text-[15px] font-semibold"><Wallet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Pagamentos e tesouraria</h4>
        <span className="text-sm text-muted-foreground">a tesouraria conta sem IVA</span>
      </div>
      <div role="group" aria-label="Condições de pagamento" className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {OPCOES_PAG.map((k) => {
          const pr = k === PAGAMENTO_FASES ? (atual === k && o.pagFases?.length ? o.pagFases : sugerido) : prestacoes(k);
          const t = tesouraria(P, pr), on = atual === k;
          return (
            <button key={k} type="button" aria-pressed={on} disabled={fechado}
              onClick={() => run(() => A.pagamentoPlano(d.id, k, k === PAGAMENTO_FASES ? sugerido : undefined))}
              className={cn("relative min-h-16 rounded-xl border p-3 text-left outline-none transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-70",
                on ? "border-primary shadow-[0_6px_20px_-12px_hsl(var(--primary)/0.7)]" : "border-border hover:border-foreground/30")}>
              <span className="block text-[15px] font-medium">{k}{k === PAGAMENTO_FASES && <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">sugerido</span>}</span>
              {t.descoberto ? (
                <span className="mt-1 flex items-center gap-1 text-sm text-warning"><AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />a descoberto até {eur0(-t.pior.saldo)}</span>
              ) : (
                <span className="mt-1 flex items-center gap-1 text-sm text-success"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />sempre coberta</span>
              )}
            </button>
          );
        })}
      </div>
      <ol className="mt-4 divide-y divide-border" aria-label="Prestações">
        {prest.map((t, i) => (
          <li key={i} className="flex items-baseline justify-between gap-x-4 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">{t.l}</span>
              <span className="block text-sm text-muted-foreground">{quando(t)}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block whitespace-nowrap text-[15px] font-semibold tabular-nums">{eur0(comIva * t.p)}</span>
              <span className="block text-sm tabular-nums text-muted-foreground">{Math.round(t.p * 100)}% · com IVA</span>
            </span>
          </li>
        ))}
      </ol>
      <p className={cn("mt-2 flex items-start gap-2 text-[15px]", TS.descoberto ? "text-warning" : "text-success")} aria-live="polite">
        {TS.descoberto ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
        <span>
          {TS.descoberto
            ? <>A obra fica a descoberto: no pior momento ({diaTxt(TS.pior.x)}) já se gastou mais {eur0(-TS.pior.saldo)} do que se recebeu.{atual !== PAGAMENTO_FASES && " “Por fases” resolve isto."}</>
            : <>Com estas condições, o que se recebe cobre sempre o que se gasta (folga mínima de {eur0(TS.pior.saldo)}).</>}
        </span>
      </p>
      {desatualizado && !fechado && (
        <button type="button" onClick={() => run(() => A.pagamentoPlano(d.id, PAGAMENTO_FASES, sugerido))} className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />O plano mudou: recalcular as prestações por fases
        </button>
      )}
    </section>
  );
}
