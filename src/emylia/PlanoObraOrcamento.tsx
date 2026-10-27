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
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, Minus, Plus, RotateCcw, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { eur, nfmt, pct, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { iconeOficio } from "./LinhasOrcamento";
import { HORAS_DIA, TAREFA_DEMOLICAO, diasDeHoras, prazoProposta, type TarefaPrevista } from "./ganttOrcamento";
import {
  COR_FASE, PAGAMENTO_FASES, PAGAMENTO_MEDIDA, curvaCusto, dataCurta, deIso, diaDaPrestacao, diaSemana, diasDaObra, feriadosSaltados, iniciosRapidos, isoDia, nomeMes, planoObra,
  prestacoes, valoresPrestacoes, recebidoAte, sugerirPorFases, tesouraria, type FasePlano, type Plano, type Prestacao,
} from "./planoObra";
import { totais } from "./DocsCliente";
import { PrestacoesMedida } from "./PrestacoesMedida";
import { Contagem, useReduzir, vibrar } from "./movimento";
import { useLargura } from "./largura";
import { nomeCurtoTarefa } from "./obraOps";

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
  // 27/10: as fases do Gantt abrem e fecham (com muitas tarefas começam fechadas: vê-se a obra toda em 4 linhas); no computador,
  // a escala em semanas (a obra cabe na largura) ou em dias (uma coluna por dia, rola-se para o lado)
  const [abertas, setAbertas] = useState<Record<number, boolean>>({});
  // 27/10: sem escolha, a escala é "semanas" sempre que os dias a 36 px não cabem (nada de rolar para o lado por omissão)
  const [escolha, setEscala] = useState<"semanas" | "dias" | null>(null);

  // a largura disponível: as colunas dos dias enchem-na (com um mínimo; abaixo dele a grelha desliza)
  const [caixa, largura] = useLargura<HTMLDivElement>(800);

  const rapidos = useMemo(() => iniciosRapidos(new Date()), []);
  const inicio = o.inicioObra ? deIso(o.inicioObra) : rapidos[0].data;
  const nDias = Math.max(1, Math.ceil(P.dias - 1e-9));
  const calendario = useMemo(() => diasDaObra(inicio, nDias + 1), [isoDia(inicio), nDias]); // eslint-disable-line react-hooks/exhaustive-deps
  const saltados = feriadosSaltados(calendario.slice(0, nDias));
  const fimData = calendario[nDias - 1];
  if (!P.tarefas.length) return null;

  // 15/10: no telemóvel, uma coluna só: o nome de cada tarefa numa linha por cima da sua barra (nunca cortado), e a grelha dos dias
  // usa a largura toda (abaixo do mínimo, desliza). 27/10: no computador (tabela), o nome numa coluna fixa à esquerda e a barra na
  // mesma linha: uma tarefa por linha. Em semanas, a obra cabe na largura; em dias, uma coluna de 36 px por dia.
  const tabela = largura >= 720;
  const PAD = 16;
  const LW = tabela ? Math.round(Math.min(400, Math.max(240, largura * 0.34))) : 0;
  const visivel = Math.max(240, largura - 2 * PAD - LW);
  const escala = escolha ?? (36 * nDias > visivel ? "semanas" : "dias");
  const colW = tabela ? Math.max(escala === "semanas" ? 4 : 36, visivel / nDias) : Math.max(48, visivel / nDias);
  const gradeW = colW * nDias;
  const X = (dia: number) => dia * colW;
  const linhaW = Math.min(visivel, gradeW); // a linha do nome fica parada ao deslizar a grelha
  const muitas = P.tarefas.length > 20;
  const aberta_ = (n: number) => abertas[n] ?? (!muitas || faseOn === n);
  const todasAbertas = P.fases.every((f) => aberta_(f.n));
  // em semanas, a data só nas segundas-feiras (e no 1.º dia), sem se encavalitarem
  const rotulos: number[] = [];
  if (tabela && escala === "semanas") {
    let ult = -Infinity;
    calendario.slice(0, nDias).forEach((dt, k) => { if ((k === 0 || dt.getDay() === 1) && X(k) - ult >= 52) { rotulos.push(k); ult = X(k); } });
  }
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
  const verFase = (n: number, on: boolean) => setAbertas((x) => ({ ...x, [n]: on }));
  const teclas = (t: TarefaPrevista) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAberta(aberta === t.chave ? null : t.chave); return; }
    if (fechado) return;
    const passo = e.key === "ArrowRight" || e.key === "ArrowUp" ? 0.5 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -0.5 : 0;
    if (!passo) return;
    e.preventDefault();
    if (t.dias + passo >= 0.5) run(() => A.prazoTarefa(d.id, t.chave, t.dias + passo));
  };

  const sugerido = sugerirPorFases(P);
  const prestAtual = d.f.pagamento === PAGAMENTO_FASES ? (o.pagFases?.length ? o.pagFases : sugerido) : prestacoes(d.f.pagamento, o.pagFases);

  return (
    <section aria-labelledby={`plano-${d.id}`} className="space-y-6">
      {/* ------------------------------------------------ cabeçalho: a duração e as datas */}
      <div>
        <h3 id={`plano-${d.id}`} className="flex items-center gap-2 text-[17px] font-semibold tracking-tight"><CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Plano da obra</h3>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
          <Contagem valor={P.dias} fmt={(n) => nfmt(Math.round(n * 2) / 2)} className="text-3xl font-semibold tracking-tight tabular-nums" />
          <span className="text-[15px] text-muted-foreground">{P.dias === 1 ? "dia útil" : "dias úteis"}</span>
          <span className="text-[15px] text-foreground">
            · {dataCurta(calendario[0])} <span aria-hidden="true" className="text-muted-foreground">→</span><span className="sr-only"> até </span> {dataCurta(fimData)}
          </span>
        </p>
        {saltados.length > 0 && (
          <p className="text-sm text-muted-foreground">Sem contar {saltados.map((s) => `${s.data.getDate()} ${nomeMes(s.data)} (${s.nome})`).join(", ")}.</p>
        )}
      </div>

      {/* ------------------------------------------------ o início, num toque */}
      <div className="space-y-2">
        <p id={`ini-${d.id}`} className="text-[15px] font-medium">Começa</p>
        <div role="group" aria-labelledby={`ini-${d.id}`} className="flex flex-wrap gap-2">
          {rapidos.map((r) => {
            const on = !outra && isoDia(inicio) === isoDia(r.data);
            return (
              <button key={r.k} type="button" aria-pressed={on} onClick={() => { setOutra(false); run(() => A.inicioObra(d.id, r.k === "seg" ? null : isoDia(r.data))); }}
                className={cn("min-h-11 whitespace-nowrap rounded-full border px-4 text-[15px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  on ? "border-primary bg-primary/10 font-medium text-primary" : "border-input bg-card hover:border-foreground/40")}>
                {r.nome}<span className={cn("ml-1.5 text-sm font-normal", on ? "text-primary/80" : "text-muted-foreground")}>{r.data.getDate()} {nomeMes(r.data)}</span>
              </button>
            );
          })}
          {outra ? (
            <input type="date" aria-label="Data de início" value={isoDia(inicio)} autoFocus
              onChange={(e) => e.target.value && run(() => A.inicioObra(d.id, e.target.value))}
              className="min-h-11 rounded-full border border-primary bg-card px-4 text-[15px]" />
          ) : (
            <button type="button" onClick={() => setOutra(true)} className="min-h-11 whitespace-nowrap rounded-full px-3 text-[15px] font-medium text-primary hover:underline">Outra data</button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------ o prazo na proposta e o reforço da equipa: uma linha cada, com a sua escolha */}
      <dl className="divide-y divide-border border-y border-border">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
          <dt className="text-[15px]">Prazo na proposta</dt>
          <dd className="flex flex-wrap items-center gap-x-3 text-[15px]">
            <b className="font-semibold tabular-nums">{naProposta ? `${naProposta} dias úteis` : "a definir"}</b>
            {naProposta !== doGantt && !fechado && (
              <button type="button" onClick={() => run(() => A.usarPrazoPrevisto(d.id))} className="inline-flex min-h-9 items-center font-medium text-primary underline-offset-4 hover:underline">
                Usar {doGantt} dias na proposta
              </button>
            )}
          </dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
          <dt className="text-[15px]">Equipa por ofício</dt>
          <dd>
            <div role="group" aria-label="Equipa por ofício" className="inline-flex rounded-full border border-input bg-card p-0.5">
              {[1, 2].map((n) => {
                const on = equipa === n, outroP = n === equipa ? P : alternativa;
                const ganho = n !== equipa ? P.dias - outroP.dias : 0;
                return (
                  <button key={n} type="button" aria-pressed={on} disabled={fechado} onClick={() => run(() => A.equipaObra(d.id, n))}
                    className={cn("min-h-10 whitespace-nowrap rounded-full px-4 text-[15px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60",
                      on ? "bg-foreground font-medium text-background" : "text-foreground hover:bg-muted")}>
                    {n === 1 ? "1 pessoa" : "2 pessoas"}
                    {ganho !== 0 && <span className={cn("ml-1.5 text-sm tabular-nums", ganho > 0 ? "text-success" : "text-muted-foreground")}>{ganho > 0 ? "−" : "+"}{dias(Math.abs(ganho))}</span>}
                  </button>
                );
              })}
            </div>
          </dd>
        </div>
      </dl>
      {delta !== 0 && (
        <p className="-mt-3 flex items-start gap-2 text-sm text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Os dias mudados à mão {delta > 0 ? "somam" : "tiram"} {eur0(Math.abs(delta))} ao custo. O preço ao cliente não muda.</p>
      )}

      {/* ------------------------------------------------ as fases: uma lista; o nome inteiro à esquerda, os números à direita */}
      <div className="space-y-2">
        <p className="text-[15px] font-medium">Fases</p>
        <div role="group" aria-label="Fases da obra" className="divide-y divide-border rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]">
          {P.fases.map((f) => {
            const on = faseOn === f.n, dur = f.fim - f.inicio, baixa = f.preco > 0 && f.margem < S.cfg.min / 100;
            return (
              <button key={f.n} type="button" aria-pressed={on} onClick={() => { setFaseOn(on ? null : f.n); if (!on) verFase(f.n, true); }}
                className={cn("flex w-full items-start gap-3 px-4 py-3 text-left outline-none transition-[background-color,opacity] first:rounded-t-2xl last:rounded-b-2xl focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                  on ? "bg-primary/[0.06]" : "hover:bg-muted/50", faseOn != null && !on && "opacity-50")}>
                <span aria-hidden="true" className="mt-1 h-4 w-1.5 shrink-0 rounded-full" style={{ background: COR_FASE[f.n] }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium leading-snug"><span className="text-muted-foreground">{f.n} ·</span> {f.curto}</span>
                  <span className="block text-sm text-muted-foreground">
                    {dur > 0 ? `${dataCurta(calendario[Math.floor(f.inicio)])} · ${dias(dur)}` : "sem dias"}
                    {veCustoFase(f) && <> · custo {eur0(f.custo)}{f.custoMat > 0 && <> (materiais {eur0(f.custoMat)})</>}</>}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block whitespace-nowrap text-[15px] font-semibold tabular-nums">{eur0(f.preco)}</span>
                  {veCustoFase(f) && f.preco > 0 && (
                    <span className={cn("flex items-center justify-end gap-1 whitespace-nowrap text-sm tabular-nums", baixa ? "font-medium text-destructive" : "text-muted-foreground")}>
                      {baixa && <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}margem {pct(f.margem)}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------ o Gantt e a curva (a mesma grelha de dias) */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[15px] font-medium">Tarefas por dia <span className="font-normal text-muted-foreground">· {P.tarefas.length} tarefas · {nomeMes(calendario[0])}{nomeMes(calendario[0]) !== nomeMes(fimData) ? ` a ${nomeMes(fimData)}` : ""}</span></p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setAbertas(Object.fromEntries(P.fases.map((f) => [f.n, !todasAbertas])))}
              className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-sm font-medium text-primary hover:bg-primary/[0.06]">
              <ChevronDown className={cn("h-4 w-4 transition-transform", todasAbertas && "rotate-180")} aria-hidden="true" />{todasAbertas ? "Fechar as fases" : "Abrir as fases"}
            </button>
            {tabela && (
              <div role="group" aria-label="Escala" className="inline-flex rounded-full border border-input bg-card p-0.5">
                {(["semanas", "dias"] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={escala === k} onClick={() => setEscala(k)}
                    className={cn("min-h-8 rounded-full px-3 text-sm transition-colors", escala === k ? "bg-foreground font-medium text-background" : "hover:bg-muted")}>
                    {k === "semanas" ? "Semanas" : "Dias"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div ref={caixa} className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]">
          <div style={tabela ? { width: LW + PAD + gradeW + PAD } : { width: gradeW + 2 * PAD, paddingLeft: PAD, paddingRight: PAD }} className="relative">
            {/* os dias (só os úteis); em semanas, a data das segundas-feiras */}
            <div className="flex h-11 border-b border-border" aria-hidden="true">
              {tabela && <div className="sticky left-0 z-20 flex shrink-0 items-end bg-card pb-1.5 pl-4 text-xs font-medium text-muted-foreground" style={{ width: LW + PAD }}>Tarefa</div>}
              <div className="relative shrink-0" style={{ width: gradeW }}>
                {tabela && escala === "semanas"
                  ? rotulos.map((k) => {
                    const dt = calendario[k];
                    return (
                      <div key={k} className="absolute bottom-0 top-0 whitespace-nowrap pl-1 pt-1" style={{ left: X(k) }}>
                        <span className="block text-[11px] leading-4 text-muted-foreground">{diaSemana(dt)}</span>
                        <span className="block text-sm font-medium tabular-nums leading-5 text-foreground">{dt.getDate()} {nomeMes(dt)}</span>
                      </div>
                    );
                  })
                  : calendario.slice(0, nDias).map((dt, k) => {
                    const mudaMes = k === 0 || dt.getMonth() !== calendario[k - 1].getMonth();
                    return (
                      // duas linhas curtas, centradas na coluna: o dia da semana (ou o mês, quando muda) e o número
                      <div key={k} className="absolute bottom-0 top-0 pt-1 text-center" style={{ left: X(k), width: colW }}>
                        <span className={cn("block text-[11px] leading-4", mudaMes && k > 0 ? "font-semibold uppercase text-foreground" : "text-muted-foreground")}>{mudaMes && k > 0 ? nomeMes(dt) : diaSemana(dt)}</span>
                        <span className="block text-sm font-medium tabular-nums leading-5 text-foreground">{dt.getDate()}</span>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* as linhas dos dias (em semanas, só as segundas) e as faixas das fases, por trás das barras */}
            <div className="pointer-events-none absolute bottom-0 top-11" style={{ left: tabela ? LW + PAD : PAD, width: gradeW }} aria-hidden="true">
              {calendario.slice(1, nDias).map((dt, k) => (tabela && escala === "semanas" && dt.getDay() !== 1 ? null
                : <div key={k} className="absolute bottom-0 top-0 border-l border-border/50" style={{ left: X(k + 1) }} />))}
              {P.fases.filter((f) => f.fim > f.inicio).map((f) => (
                <div key={f.n} className="absolute bottom-0 top-0 transition-opacity" style={{ left: X(f.inicio), width: X(f.fim - f.inicio), background: COR_FASE[f.n], opacity: faseOn == null ? 0.05 : faseOn === f.n ? 0.1 : 0.02 }} />
              ))}
            </div>

            <ul aria-label="Tarefas da obra" className={cn("relative", tabela ? "pb-2" : "py-2")}>
              {P.fases.map((f) => {
                const abre = aberta_(f.n), apagadaF = faseOn != null && faseOn !== f.n;
                const cab = (
                  <button type="button" aria-expanded={abre} onClick={() => verFase(f.n, !abre)}
                    className={cn("flex items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                      tabela ? "sticky left-0 z-10 h-full shrink-0 bg-muted pl-4 pr-3" : "sticky left-4 min-h-10 rounded-md")}
                    style={{ width: tabela ? LW + PAD : linhaW }}>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", !abre && "-rotate-90")} aria-hidden="true" />
                    <span aria-hidden="true" className="h-3 w-1.5 shrink-0 rounded-full" style={{ background: COR_FASE[f.n] }} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{f.n} · {f.curto}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{f.tarefas.length} · {dias(f.fim - f.inicio)}</span>
                  </button>
                );
                return [
                  <li key={"f" + f.n} className={cn("transition-opacity", tabela && "flex h-9 items-center border-t border-border/60 bg-muted", apagadaF && "opacity-40")}>
                    {cab}
                    {/* a fase fechada: uma barra só, do início ao fim dela */}
                    {tabela && (
                      <div className="relative h-full shrink-0" style={{ width: gradeW }} aria-hidden="true">
                        {f.fim > f.inicio && <div className="absolute top-3 h-3 rounded-full" style={{ left: X(f.inicio), width: Math.max(6, X(f.fim - f.inicio)), background: COR_FASE[f.n], opacity: abre ? 0.35 : 0.8 }} />}
                      </div>
                    )}
                  </li>,
                  ...(abre ? f.tarefas.map((t, i) => {
                    const Ic = iconeOficio(t.perfil), apagada = faseOn != null && faseOn !== t.fase, aqui = aberta === t.chave;
                    const dem = t.chave === TAREFA_DEMOLICAO, veCusto = !dem || direcao;
                    const barra = (
                      <motion.div
                        role="slider" tabIndex={0} aria-label={`Dias de ${t.nome}`} aria-valuemin={0.5} aria-valuenow={t.dias}
                        aria-valuetext={`${dias(t.dias)}, de ${dataCurta(calendario[Math.floor(t.inicio)])}`} aria-readonly={fechado || undefined}
                        onKeyDown={teclas(t)} onClick={() => setAberta(aqui ? null : t.chave)}
                        initial={reduzir ? false : { opacity: 0 }}
                        animate={{ opacity: 1, left: X(t.inicio) + 1, width: Math.max(6, X(t.dias) - 2) }}
                        transition={reduzir ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
                        className={cn("absolute origin-left cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                          tabela ? "top-1.5 h-5" : "top-1 h-6",
                          aqui && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-card", t.manual && "bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(255_255_255/0.35)_6px_8px)]")}
                        style={{ background: COR_FASE[t.fase] }}>
                        {/* a pega de arrastar só numa barra com tamanho para ela (em semanas, meio dia tem 3 ou 4 px: muda-se em Dias ou com ← →) */}
                        {!fechado && X(t.dias) >= 16 && (
                          <span onPointerDown={arrastar(t)} aria-hidden="true" title="Arraste para mudar os dias"
                            className={cn("absolute -right-2 top-1/2 flex h-10 w-5 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center", arrasto === t.chave && "scale-110")}>
                            <span className="h-5 w-1.5 rounded-full bg-card shadow-[0_0_0_1.5px_rgba(0,0,0,0.25)]" />
                          </span>
                        )}
                      </motion.div>
                    );
                    const custoTxt = <>{dias(t.dias)}{t.manual && " · mudado"}{veCusto && <> · {eur0(t.custo.total)}</>}
                      {veCusto && t.delta !== 0 && <span className={t.delta > 0 ? "text-destructive" : "text-success"}> {t.delta > 0 ? "+" : "−"}{eur(Math.abs(t.delta))}</span>}</>;
                    const detalhe = aqui && (
                      <div className="sticky left-4 mt-2 pb-2" style={{ width: tabela ? Math.min(largura - 2 * PAD, LW + gradeW) : linhaW }}>
                        <DetalheTarefa t={t} d={d} ctx={ctx} fechado={fechado} direcao={direcao} inicio={dataCurta(calendario[Math.floor(t.inicio)])} />
                      </div>
                    );
                    return tabela ? (
                      <li key={t.chave} className={cn("transition-opacity", apagada && "opacity-30")}>
                        <div className="flex h-8 items-center">
                          {/* o nome curto, os dias e o custo numa coluna fixa (o nome inteiro no title); a barra na mesma linha */}
                          <button type="button" onClick={() => setAberta(aqui ? null : t.chave)} aria-expanded={aqui}
                            title={`${t.nome} · ${dias(t.dias)}${veCusto ? ` · ${eur0(t.custo.total)}` : ""}`}
                            className={cn("sticky left-0 z-10 flex h-full shrink-0 items-center gap-2 bg-card pl-9 pr-3 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary", aqui && "text-primary")}
                            style={{ width: LW + PAD }}>
                            <Ic className="h-3.5 w-3.5 shrink-0" style={{ color: COR_FASE[t.fase] }} aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate text-sm">{nomeCurtoTarefa(t.nome)}</span>
                            {/* só os dias: o custo está no detalhe (toque na tarefa) e na dica */}
                            <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">{dias(t.dias)}{t.manual && " · mudado"}</span>
                          </button>
                          <div className="relative h-full shrink-0" style={{ width: gradeW }}>{barra}</div>
                        </div>
                        {detalhe}
                      </li>
                    ) : (
                      <li key={t.chave} className={cn("py-1.5 transition-opacity", apagada && "opacity-30")}>
                        {/* o nome, os dias e o custo por cima da barra (parados ao deslizar a grelha): nunca cortados */}
                        <button type="button" onClick={() => setAberta(aqui ? null : t.chave)} aria-expanded={aqui}
                          className={cn("sticky left-4 flex min-h-8 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-primary", aqui && "text-primary")}
                          style={{ width: linhaW }}>
                          <Ic className="h-4 w-4 shrink-0" style={{ color: COR_FASE[t.fase] }} aria-hidden="true" />
                          <span className="min-w-0 flex-1 text-[15px] font-medium leading-snug">{t.nome}</span>
                          <span className="shrink-0 whitespace-nowrap text-sm tabular-nums text-muted-foreground">{custoTxt}</span>
                        </button>
                        <div className="relative h-8" style={{ width: gradeW }}>{barra}</div>
                        {/* o detalhe abre por baixo da própria tarefa */}
                        {detalhe}
                      </li>
                    );
                  }) : []),
                ];
              })}
            </ul>

            {/* a curva do custo acumulado, alinhada com os dias */}
            <div style={tabela ? { paddingLeft: LW + PAD } : undefined}>
              <CurvaCusto P={P} prest={prestAtual} linhaW={linhaW} colW={colW} gradeW={gradeW} calendario={calendario} faseOn={faseOn} />
            </div>
          </div>
        </div>
      </div>

      <Pagamentos P={P} d={d} ctx={ctx} calendario={calendario} fechado={fechado} prest={prestAtual} sugerido={sugerido} />
    </section>
  );
}

/* ================================================================== a curva */
function CurvaCusto({ P, prest, linhaW, colW, gradeW, calendario, faseOn }: {
  P: Plano; prest: Prestacao[]; linhaW: number; colW: number; gradeW: number; calendario: Date[]; faseOn: number | null;
}) {
  const C = curvaCusto(P);
  const [mira, setMira] = useState<number | null>(null);
  const H = 120, topo = 8, base = H - 18;
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
  const mover = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / colW;
    setMira(Math.max(0, Math.min(C.length - 1, Math.round(x * 2))));
  };
  const diaTxt = (x: number) => { const k = Math.min(calendario.length - 1, Math.floor(x)); return x >= P.dias - 1e-9 ? `fim (${dataCurta(calendario[Math.max(0, Math.ceil(P.dias) - 1)])})` : dataCurta(calendario[k]); };
  return (
    <div className="border-t border-border pb-3 pt-3">
      {/* o título e a legenda por cima do gráfico (parados ao deslizar): nada de texto solto dentro do gráfico */}
      <div className="sticky left-4 mb-2" style={{ width: linhaW }}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <p className="text-[15px] font-medium">Custo acumulado <span className="font-normal text-muted-foreground">· quando sai o dinheiro</span></p>
        </div>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums text-muted-foreground" aria-hidden="true">
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-primary" />custo</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-foreground/70" />recebido</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-foreground/50" />preço {eur(P.preco)} €</span>
        </p>
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
          <line x1={0} x2={gradeW} y1={base} y2={base} stroke="hsl(var(--border))" strokeWidth={1} />
          <path d={area} fill="hsl(var(--primary))" fillOpacity={0.1} />
          {TS.pontos.slice(0, -1).map((p, i) => { const q = TS.pontos[i + 1]; return p.saldo < -0.5 && q.x > p.x ? <rect key={i} x={X(p.x)} width={Math.max(1, X(q.x) - X(p.x))} y={Y(p.gasto)} height={Math.max(0, Y(p.recebido) - Y(p.gasto))} fill="hsl(var(--destructive))" fillOpacity={0.14} /> : null; })}
          <path d={degraus} fill="none" stroke="hsl(var(--foreground))" strokeOpacity={0.7} strokeWidth={2} strokeLinejoin="round" />
          <path d={linha} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinejoin="round" />
          <circle cx={X(C[C.length - 1].x)} cy={Y(C[C.length - 1].c)} r={4} fill="hsl(var(--primary))" stroke="hsl(var(--card))" strokeWidth={2} />
          {ponto && (
            <g>
              <line x1={X(ponto.x)} x2={X(ponto.x)} y1={topo - 6} y2={base} stroke="hsl(var(--foreground))" strokeOpacity={0.45} strokeWidth={1} />
              <circle cx={X(ponto.x)} cy={Y(ponto.c)} r={4.5} fill="hsl(var(--primary))" stroke="hsl(var(--card))" strokeWidth={2} />
            </g>
          )}
        </svg>
        {ponto && (
          <div className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm shadow-[var(--shadow-md)]"
            style={{ left: Math.min(Math.max(X(ponto.x), 80), gradeW - 80) }}>
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
    <div className="grid gap-4 rounded-2xl border border-border bg-card p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 sm:p-5" aria-live="polite">
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
const OPCOES_PAG = ["100% na adjudicação", "50% + 50% no fim", "30% + 40% + 30%", PAGAMENTO_FASES, PAGAMENTO_MEDIDA];
function Pagamentos({ P, d, ctx, calendario, fechado, prest, sugerido }: {
  P: Plano; d: Negocio; ctx: Pick<Ctx, "S" | "A" | "run">; calendario: Date[]; fechado: boolean; prest: Prestacao[]; sugerido: Prestacao[];
}) {
  const { S, A, run } = ctx;
  const o = d.orc!, atual = d.f.pagamento || "50% + 50% no fim";
  const comIva = totais(d, S).total;
  const desatualizado = atual === PAGAMENTO_FASES && !!o.pagFases?.length && JSON.stringify(o.pagFases) !== JSON.stringify(sugerido);
  const quando = (t: Prestacao) => {
    if (t.fase === 0) return "antes de começar";
    const x = diaDaPrestacao(P, t);
    return dataCurta(calendario[Math.max(0, Math.ceil(x - 1e-9) - 1)]);
  };
  const diaTxt = (x: number) => dataCurta(calendario[Math.min(calendario.length - 1, Math.max(0, Math.floor(x)))]);
  return (
    <section aria-labelledby={`pag-${d.id}`} className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-5">
      <h4 id={`pag-${d.id}`} className="flex items-center gap-2 text-[15px] font-semibold"><Wallet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Pagamentos e tesouraria</h4>
      {/* as condições: uma lista de escolha (a opção à esquerda, se a obra fica coberta por baixo); cabe numa coluna estreita */}
      <div role="group" aria-label="Condições de pagamento" className="mt-3 divide-y divide-border rounded-xl border border-border">
        {OPCOES_PAG.map((k) => {
          const pr = k === PAGAMENTO_FASES ? (atual === k && o.pagFases?.length ? o.pagFases : sugerido)
            : k === PAGAMENTO_MEDIDA ? (atual === k && o.pagFases?.length ? o.pagFases : prest) : prestacoes(k);
          const t = tesouraria(P, pr), on = atual === k;
          return (
            <button key={k} type="button" aria-pressed={on} disabled={fechado}
              onClick={() => run(() => { if (k !== atual) A.pagamentoPlano(d.id, k, k === PAGAMENTO_FASES ? sugerido : k === PAGAMENTO_MEDIDA ? prest.map((x) => ({ ...x })) : undefined); })}
              className={cn("flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors first:rounded-t-xl last:rounded-b-xl focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-70",
                on ? "bg-primary/[0.06]" : "hover:bg-muted/50")}>
              <span aria-hidden="true" className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", on ? "border-primary" : "border-input")}>
                {on && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 text-[15px] font-medium">{k}{k === PAGAMENTO_FASES && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">sugerido</span>}</span>
                {t.descoberto ? (
                  <span className="flex items-center gap-1 text-sm text-warning"><AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />a descoberto até {eur0(-t.pior.saldo)}{on && ` (${diaTxt(t.pior.x)})`}</span>
                ) : (
                  <span className="flex items-center gap-1 text-sm text-success"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />sempre coberta</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {atual === PAGAMENTO_MEDIDA && !fechado && <PrestacoesMedida key={JSON.stringify(o.pagFases ?? [])} ctx={ctx} d={d} prest={prest} />}
      <p className="mt-4 text-sm text-muted-foreground">Valores com IVA</p>
      <ol className="mt-1 divide-y divide-border" aria-label="Prestações">
        {prest.map((t, i, L) => (
          <li key={i} className="flex items-baseline justify-between gap-x-4 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">{t.l}</span>
              <span className="block text-sm text-muted-foreground">{quando(t)}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block whitespace-nowrap text-[15px] font-semibold tabular-nums">{eur0(valoresPrestacoes(comIva, L)[i])}</span>
              <span className="block text-sm tabular-nums text-muted-foreground">{nfmt(Math.round(t.p * 1000) / 10)}%</span>
            </span>
          </li>
        ))}
      </ol>
      {/* 27/10: o selo da opção escolhida já diz se a obra fica coberta (e, a descoberto, quando): sem frase a repetir */}
      {desatualizado && !fechado && (
        <button type="button" onClick={() => run(() => A.pagamentoPlano(d.id, PAGAMENTO_FASES, sugerido))} className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />O plano mudou: recalcular as prestações por fases
        </button>
      )}
    </section>
  );
}
