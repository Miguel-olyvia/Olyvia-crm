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
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, GripVertical, Minus, Plus, RotateCcw, Wallet, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LINHAS, eur, nfmt, pct, r2, type Negocio, type SvcId } from "./motor";
import type { Ctx } from "./pecas";
import { iconeOficio } from "./LinhasOrcamento";
import { HORAS_DIA, TAREFA_DEMOLICAO, diasDeHoras, ordemDoPlano, prazoProposta, type TarefaPrevista } from "./ganttOrcamento";
import {
  COR_FASE, PAGAMENTO_FASES, PAGAMENTO_MEDIDA, curvaCusto, dataCurta, deIso, diaDaPrestacao, diaSemana, diasDaObra, feriadosSaltados, iniciosRapidos, isoDia, nomeMes, planoObra,
  prestacoes, valoresPrestacoes, recebidoAte, sugerirPorFases, tesouraria, type FasePlano, type Plano, type Prestacao,
} from "./planoObra";
import { totais } from "./DocsCliente";
import { PrestacoesMedida } from "./PrestacoesMedida";
import { Contagem, useReduzir, vibrar } from "./movimento";
import { useLargura } from "./largura";
import { SEM_VER_CUSTOS, podeVerCustos } from "./permissoes";
import { nomeCurtoTarefa } from "./obraOps";
import { materiaisDaReceita, passosDaTarefa, planoEmDatas, type PlanoDatas, type TarefaDatas } from "./planoDaVisita";
import { EquipaDaObra, TrocarTecnico } from "./EquipaDaObra";
import { camposDasEscolhas, chaveTarefa, escolhasDoNegocio, type EscolhasEquipa } from "./preparacaoObra";

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
  // 9/11: uma tarefa nova (de onde se carregou no «+»: a fase e a tarefa a seguir à qual entra), a que se arrasta e onde vai cair, e a
  // que se vai tirar (confirma-se na própria linha)
  const [novaTarefa, setNovaTarefa] = useState<{ fase?: number; depois?: string } | null>(null);
  const [arrastaT, setArrastaT] = useState<string | null>(null);
  const [cai, setCai] = useState<{ chave: string | null; fase: number; depois: boolean } | null>(null);
  const [tirarT, setTirarT] = useState<string | null>(null);
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
  // 9/11 (Rúben: «o dono da obra precisa do máximo detalhe»): o plano com os técnicos e as datas (o mesmo que a obra vai ter)
  const PD = useMemo(() => planoEmDatas(d, S, isoDia(inicio)), [d, S, isoDia(inicio), d.orc, d.f.plano_tecnicos, d.f.plano_equipa, d.f.plano_equipas]); // eslint-disable-line react-hooks/exhaustive-deps
  const daTarefa = (t: TarefaPrevista) => PD.tarefas.find((x) => x.chave === chaveTarefa({ nome: t.nome, fase: t.fase }));
  // 9/11: mover uma tarefa (para antes ou depois de outra, ou para o fim de uma fase) e tirá-la do plano e do orçamento
  const { ordem: ordemMao, fase: faseMao } = ordemDoPlano(d.f);
  const mexida = Object.keys(ordemMao).length > 0 || Object.keys(faseMao).length > 0;
  const mover = (chave: string, fase: number, alvo: string | null, depois: boolean) => {
    if (fechado) return;
    const listas: Record<number, string[]> = Object.fromEntries(P.fases.map((f) => [f.n, f.tarefas.map((x) => x.chave)]));
    for (const k of Object.keys(listas)) listas[Number(k)] = listas[Number(k)].filter((c) => c !== chave);
    const L = listas[fase] ?? [];
    const i = alvo ? L.indexOf(alvo) : -1;
    L.splice(i < 0 ? L.length : i + (depois ? 1 : 0), 0, chave);
    listas[fase] = L;
    const atual = P.tarefas.find((x) => x.chave === chave);
    const fases = { ...faseMao };
    if (!atual || atual.fase !== fase) fases[chave] = fase;
    const novas = { ...ordemMao };
    for (const f of new Set([fase, atual?.fase ?? fase])) novas[f] = listas[f] ?? [];
    run(() => { A.campo(d.id, "plano_ordem", JSON.stringify(novas)); A.campo(d.id, "plano_fase", JSON.stringify(fases)); });
  };
  const largar = () => {
    if (arrastaT && cai) mover(arrastaT, cai.fase, cai.chave, cai.depois);
    setArrastaT(null); setCai(null);
  };
  const tirar = (t: TarefaPrevista) => run(() => {
    const sid = (t.svc ?? t.chave) as SvcId, v = d.visita;
    if ((v.extra[sid] || 0) > 0) A.extra(d.id, sid, 0);
    if (LINHAS[d.linha].map.some(([x]) => x === sid) && !v.off.includes(sid)) A.servico(d.id, sid);
    for (const p of v.prod ?? []) if (p.svc === sid && !p.semSvc) A.produtoSemServico(d.id, p.id, true);
    A.refazerOrcamento(d.id);
    setTirarT(null);
  });
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
  // 5/11: sem quotes.view_costs (a base manda os custos a null) não há custo nem margem nas fases, nas tarefas, nem a curva do custo
  const ver = podeVerCustos();
  const veCustoFase = (f: FasePlano) => ver && (direcao || !temDem(f)); // o custo da demolição só a Direção o vê

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
        <p className="-mt-3 flex items-start gap-2 text-sm text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Os dias mudados à mão {delta > 0 ? "somam" : "tiram"} {ver ? `${eur0(Math.abs(delta))} ` : ""}ao custo. O preço ao cliente não muda.</p>
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

      {/* 9/11 (Rúben: «a equipa deve ser a secção anterior a esta»): a equipa da obra, as agendas, os alertas e as sugestões */}
      <EquipaNoOrcamento ctx={ctx} d={d} fechado={fechado} PD={PD} />

      {/* ------------------------------------------------ o Gantt e a curva (a mesma grelha de dias) */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[15px] font-medium">Tarefas por dia <span className="font-normal text-muted-foreground">· {P.tarefas.length} tarefas · {nomeMes(calendario[0])}{nomeMes(calendario[0]) !== nomeMes(fimData) ? ` a ${nomeMes(fimData)}` : ""}</span></p>
          <div className="flex flex-wrap items-center gap-2">
            {!fechado && (
              <button type="button" aria-expanded={!!novaTarefa} onClick={() => setNovaTarefa((x) => (x ? null : {}))}
                className="inline-flex min-h-9 items-center gap-1 rounded-full border border-primary/40 px-3 text-sm font-medium text-primary hover:bg-primary/[0.06]">
                <Plus className="h-4 w-4" aria-hidden="true" />Adicionar tarefa
              </button>
            )}
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
        {mexida && !fechado && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">A ordem das tarefas foi mudada à mão: numa fase reorganizada, fazem-se uma a seguir à outra.
            <button type="button" className="min-h-9 rounded-full px-2 font-medium text-primary hover:bg-primary/[0.06]" onClick={() => run(() => { A.campo(d.id, "plano_ordem", ""); A.campo(d.id, "plano_fase", ""); })}>Repor a ordem</button></p>
        )}
        {novaTarefa && !fechado && <AdicionarTarefa ctx={ctx} d={d} fase={novaTarefa.fase} fechar={() => setNovaTarefa(null)}
          juntada={(sid) => { if (novaTarefa.fase) mover(sid, novaTarefa.fase, novaTarefa.depois ?? null, true); }} />}
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
                  <li key={"f" + f.n} className={cn("transition-opacity", tabela && "flex h-9 items-center border-t border-border/60 bg-muted", apagadaF && "opacity-40", arrastaT && cai?.chave === null && cai.fase === f.n && "ring-2 ring-inset ring-primary")}
                    onDragOver={(e) => { if (!arrastaT) return; e.preventDefault(); setCai({ chave: null, fase: f.n, depois: true }); }} onDrop={(e) => { e.preventDefault(); largar(); }}>
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
                    const dem = t.chave === TAREFA_DEMOLICAO, veCusto = ver && (!dem || direcao);
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
                          aqui && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-card", !aqui && daTarefa(t) && (daTarefa(t)!.ocupado || !daTarefa(t)!.tec) && "ring-2 ring-destructive ring-offset-1 ring-offset-card", t.manual && "bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(255_255_255/0.35)_6px_8px)]")}
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
                        <DetalheTarefa t={t} d={d} ctx={ctx} fechado={fechado} direcao={direcao} inicio={dataCurta(calendario[Math.floor(t.inicio)])} PD={PD} td={daTarefa(t)}
                          mover={fechado ? undefined : (passo) => {
                            const L = f.tarefas.map((x) => x.chave), k = L.indexOf(t.chave);
                            if (passo === "subir" && k > 0) mover(t.chave, f.n, L[k - 1], false);
                            else if (passo === "descer" && k < L.length - 1) mover(t.chave, f.n, L[k + 1], true);
                            else if (typeof passo === "number") mover(t.chave, passo, null, true);
                          }} />
                      </div>
                    );
                    return tabela ? (
                      <li key={t.chave} className={cn("relative transition-opacity", apagada && "opacity-30", arrastaT === t.chave && "opacity-40")}
                        onDragOver={(e) => { if (!arrastaT || arrastaT === t.chave) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setCai({ chave: t.chave, fase: t.fase, depois: e.clientY > r.top + 16 }); }}
                        onDrop={(e) => { e.preventDefault(); largar(); }}>
                        {cai?.chave === t.chave && arrastaT && <span aria-hidden="true" className={cn("pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-primary", cai.depois ? "bottom-0" : "top-0")} />}
                        <div className="flex h-8 items-center">
                          {/* o nome curto, os dias e o custo numa coluna fixa (o nome inteiro no title); a barra na mesma linha */}
                          <div className="group/linha sticky left-0 z-10 flex h-full shrink-0 items-center bg-card" style={{ width: LW + PAD }}
                            draggable={!fechado} onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.chave); setArrastaT(t.chave); }} onDragEnd={() => { setArrastaT(null); setCai(null); }}>
                          {!fechado && <GripVertical className="ml-3 h-4 w-4 shrink-0 cursor-grab text-muted-foreground/60" aria-hidden="true" />}
                          <button type="button" onClick={() => setAberta(aqui ? null : t.chave)} aria-expanded={aqui}
                            title={`${t.nome} · ${dias(t.dias)}${veCusto ? ` · ${eur0(t.custo.total)}` : ""}`}
                            className={cn("flex h-full min-w-0 flex-1 items-center gap-2 pr-1 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary", fechado ? "pl-9" : "pl-2", aqui && "text-primary")}>
                            <Ic className="h-3.5 w-3.5 shrink-0" style={{ color: COR_FASE[t.fase] }} aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate text-sm">{nomeCurtoTarefa(t.nome)}</span>
                            {/* só os dias: o custo está no detalhe (toque na tarefa) e na dica */}
                            <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">{dias(t.dias)}{t.manual && " · mudado"}</span>
                            {daTarefa(t) && <IdTecnico td={daTarefa(t)!} />}
                          </button>
                          {!fechado && <>
                            <button type="button" title="Juntar uma tarefa a seguir a esta" aria-label={`Juntar uma tarefa a seguir a ${t.nome}`} onClick={() => setNovaTarefa({ fase: t.fase, depois: t.chave })}
                              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-primary hover:bg-primary/10"><Plus className="h-4 w-4" /></button>
                            <button type="button" title={dem ? "A demolição tira-se no orçamento" : "Tirar esta tarefa"} aria-label={`Tirar ${t.nome}`} disabled={dem} onClick={() => setTirarT(t.chave)}
                              className="mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"><Minus className="h-4 w-4" /></button>
                          </>}
                          </div>
                          <div className="relative h-full shrink-0" style={{ width: gradeW }}>{barra}</div>
                        </div>
                        {tirarT === t.chave && <ConfirmarTirar t={t} largura={Math.min(largura - 2 * PAD, LW + gradeW)} sim={() => tirar(t)} nao={() => setTirarT(null)} />}
                        {detalhe}
                      </li>
                    ) : (
                      <li key={t.chave} className={cn("py-1.5 transition-opacity", apagada && "opacity-30")}>
                        {/* o nome, os dias e o custo por cima da barra (parados ao deslizar a grelha): nunca cortados */}
                        <button type="button" onClick={() => setAberta(aqui ? null : t.chave)} aria-expanded={aqui}
                          className={cn("sticky left-4 flex min-h-8 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-primary", aqui && "text-primary")}
                          style={{ width: linhaW }}>
                          <Ic className="h-4 w-4 shrink-0" style={{ color: COR_FASE[t.fase] }} aria-hidden="true" />
                          <span className="min-w-0 flex-1 text-[15px] font-medium leading-snug">{t.nome}{daTarefa(t) && <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs font-normal text-muted-foreground"><IdTecnico td={daTarefa(t)!} />{daTarefa(t)!.oficio}</span>}</span>
                          <span className="shrink-0 whitespace-nowrap text-sm tabular-nums text-muted-foreground">{custoTxt}</span>
                        </button>
                        {!fechado && (
                          <span className="sticky left-4 flex gap-1" style={{ width: linhaW }}>
                            <button type="button" aria-label={`Juntar uma tarefa a seguir a ${t.nome}`} onClick={() => setNovaTarefa({ fase: t.fase, depois: t.chave })} className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-sm text-primary hover:bg-primary/10"><Plus className="h-4 w-4" />Tarefa</button>
                            {!dem && <button type="button" aria-label={`Tirar ${t.nome}`} onClick={() => setTirarT(t.chave)} className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Minus className="h-4 w-4" />Tirar</button>}
                          </span>
                        )}
                        {tirarT === t.chave && <ConfirmarTirar t={t} largura={linhaW} sim={() => tirar(t)} nao={() => setTirarT(null)} />}
                        <div className="relative h-8" style={{ width: gradeW }}>{barra}</div>
                        {/* o detalhe abre por baixo da própria tarefa */}
                        {detalhe}
                      </li>
                    );
                  }) : []),
                ];
              })}
            </ul>

            {/* a curva do custo acumulado, alinhada com os dias (5/11: só com quotes.view_costs) */}
            {ver && <div style={tabela ? { paddingLeft: LW + PAD } : undefined}>
              <CurvaCusto P={P} prest={prestAtual} linhaW={linhaW} colW={colW} gradeW={gradeW} calendario={calendario} faseOn={faseOn} />
            </div>}
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
function DetalheTarefa({ t, d, ctx, fechado, direcao, inicio, PD, td, mover }: {
  t: TarefaPrevista; d: Negocio; ctx: Pick<Ctx, "S" | "A" | "run">; fechado: boolean; direcao: boolean; inicio: string;
  PD: PlanoDatas; td?: TarefaDatas;
  /** 9/11: mover a tarefa sem arrastar (no telemóvel): subir, descer, ou para outra fase. */
  mover?: (passo: "subir" | "descer" | number) => void;
}) {
  const { A, run, S } = ctx;
  // 9/11 (Rúben: «o que faz nos pontos elétricos?»): o que o técnico faz (os passos da receita) e os materiais, com a medida da linha
  const sid = t.chave === TAREFA_DEMOLICAO ? undefined : (t.svc ?? t.chave);
  const linha = sid ? d.orc?.linhas.find((x) => x.t === "svc" && x.sid === sid) : undefined;
  const qLinha = linha && linha.t === "svc" ? linha.q : 0, sv = sid ? S.svc[sid] : undefined;
  const passos = passosDaTarefa(S, sid, qLinha, t.perfil, !!t.svc);
  const mats = sid && qLinha > 0 ? materiaisDaReceita(S, sid, t.svc && sv && sv.h > 0 ? t.hOrc / sv.h : qLinha) : [];
  const dem = t.chave === TAREFA_DEMOLICAO, ver = podeVerCustos(), veCusto = ver && (!dem || direcao), poucas = t.h < t.hOrc - 1e-9;
  return (
    <div className="grid gap-4 rounded-2xl border border-border bg-card p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 sm:p-5" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-semibold">{t.nome}</p>
        <p className="text-sm text-muted-foreground">Fase {t.fase} · começa {inicio}</p>
      </div>
      {mover && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Mover:</span>
          <button type="button" className="min-h-9 rounded-full border border-input px-3 hover:bg-muted" onClick={() => mover("subir")}>↑ Antes</button>
          <button type="button" className="min-h-9 rounded-full border border-input px-3 hover:bg-muted" onClick={() => mover("descer")}>↓ Depois</button>
          <label className="inline-flex items-center gap-2">Fase
            <select value={t.fase} onChange={(e) => mover(Number(e.target.value))} className="h-9 rounded-lg border border-input bg-background px-2">
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span className="text-xs text-muted-foreground">No computador, arraste a tarefa pela pega ⋮⋮.</span>
        </div>
      )}
      {td && (
        <div className="grid gap-3 rounded-xl bg-muted/50 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_20rem] sm:items-end">
          <p><b className="font-medium">{td.tecNome}</b> · {td.oficio}{td.ocupado ? <span className="text-amber-800 dark:text-amber-300"> · {td.ocupado}</span> : null}
            <span className="block text-muted-foreground">{td.dur > 1 ? `De ${dataCurta(td.inicio)} a ${dataCurta(td.fim)}` : dataCurta(td.inicio)} · {nfmt(td.h)} h{td.qtd ? ` · ${nfmt(td.qtd.q)} ${td.qtd.un}` : ""}</span></p>
          {!fechado && <TrocarTecnico t={td} P={PD} S={ctx.S} negocio={d.id} escolhas={escolhasDoNegocio(d.f)}
            mudar={(e) => ctx.run(() => { for (const [k, v] of camposDasEscolhas(e)) ctx.A.campo(d.id, k, v); })} />}
        </div>
      )}
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
      {(passos.length > 0 || mats.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {passos.length > 0 && (
            <div className="text-sm">
              <p className="font-medium">O que o técnico faz{sv && qLinha > 0 ? ` (${nfmt(qLinha)} ${sv.un})` : ""}</p>
              <ol className="mt-1 space-y-1">
                {passos.map((x, k) => (
                  <li key={k} className="flex justify-between gap-3 rounded-lg bg-muted/50 px-3 py-1.5">
                    <span className="min-w-0">{k + 1}. {x.n}<span className="text-muted-foreground"> · {x.oficio}</span></span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{nfmt(x.h)} h</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {mats.length > 0 && (
            <div className="text-sm">
              <p className="font-medium">Materiais e consumíveis</p>
              <ul className="mt-1 space-y-1">
                {mats.map((m) => (
                  <li key={m.n} className="flex justify-between gap-3 rounded-lg bg-muted/50 px-3 py-1.5">
                    <span className="min-w-0">{m.n}</span>
                    <span className="shrink-0 text-right tabular-nums text-muted-foreground">{nfmt(m.q)} {m.un}{sv && <span className="block text-xs">{nfmt(m.porUn)} {m.un}/{sv.un}</span>}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted-foreground sm:col-span-2">Vêm da receita do serviço no Catálogo e custos: mudá-la lá muda as horas, os materiais e o plano.</p>
        </div>
      )}
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
      ) : <p className="text-sm text-muted-foreground">{ver ? "O custo da demolição e entulho só a Direção o vê." : SEM_VER_CUSTOS}</p>}
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

/** 9/11: a equipa da obra no orçamento (o mesmo plano que a obra vai ter): quem faz cada tarefa, as agendas, os alertas e as sugestões. */
function EquipaNoOrcamento({ ctx, d, fechado, PD }: { ctx: Pick<Ctx, "S" | "A" | "run">; d: Negocio; fechado: boolean; PD: PlanoDatas }) {
  const { S, A, run } = ctx;
  const escolhas = escolhasDoNegocio(d.f);
  const mudar = fechado ? undefined : (e: EscolhasEquipa) => run(() => { for (const [k, v] of camposDasEscolhas(e)) A.campo(d.id, k, v); });
  if (!PD.tarefas.length) return null;
  return (
    <section aria-label="A equipa da obra" className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h3 className="text-[17px] font-semibold tracking-tight">A equipa da obra</h3>
        <p className="text-sm text-muted-foreground">Quem faz cada tarefa, nos dias do plano. A obra começa com esta equipa; as Operações ainda a podem acertar.</p>
      </div>
      <EquipaDaObra P={PD} S={S} negocio={d.id} escolhas={escolhas} mudar={mudar} calcular={(iso) => planoEmDatas(d, S, iso)}
        mudarInicio={fechado ? undefined : (iso) => run(() => A.inicioObra(d.id, iso))} />
      <details className="group rounded-xl border border-border">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-medium">
          Trocar o técnico de cada tarefa
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
      <ul className="divide-y divide-border border-t border-border">
        {PD.tarefas.map((t) => (
          <li key={t.chave} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_20rem] sm:items-center">
            <span className="min-w-0 text-[15px]"><b className="font-medium">{t.nome}</b>
              <span className="block text-sm text-muted-foreground">{dataCurta(t.inicio)}{t.dur > 1 ? ` a ${dataCurta(t.fim)}` : ""} · {t.oficio}{t.ocupado ? ` · ${t.tecNome} ${t.ocupado}` : ""}</span>
            </span>
            {mudar ? <TrocarTecnico t={t} P={PD} S={S} negocio={d.id} escolhas={escolhas} mudar={mudar} /> : <span className="text-sm">{t.tecNome}</span>}
          </li>
        ))}
      </ul>
      </details>
    </section>
  );
}

/**
 * 9/11 (Rúben: «permitir adicionar tarefas»): uma tarefa nova no plano é um serviço do Catálogo com a quantidade. Entra nas necessidades
 * (A.extra) e o orçamento refaz-se (A.refazerOrcamento): a tarefa aparece na sua fase, com o ofício, as horas e os materiais da receita,
 * o técnico livre e o preço no orçamento. Um serviço que já está no orçamento soma a quantidade.
 */
function AdicionarTarefa({ ctx, d, fechar, fase, juntada }: { ctx: Pick<Ctx, "S" | "A" | "run">; d: Negocio; fechar: () => void; fase?: number; juntada?: (sid: string) => void }) {
  const { S, A, run } = ctx;
  const [procura, setProcura] = useState("");
  const [sid, setSid] = useState<string | null>(null);
  const [q, setQ] = useState("1");
  const limpo = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const todos = useMemo(() => Object.entries(S.svc).map(([id, s]) => ({ id, n: s.n, un: s.un, preco: s.preco, h: s.h, perfil: s.perfil }))
    .sort((a, b) => a.n.localeCompare(b.n, "pt")), [S.svc]);
  const termo = limpo(procura.trim());
  const lista = termo.length < 2 ? [] : todos.filter((x) => limpo(x.n).includes(termo)).slice(0, 8);
  const sv = sid ? S.svc[sid] : undefined;
  const n = Number(q.replace(",", "."));
  const passos = sid && n > 0 ? passosDaTarefa(S, sid, n, "", false) : [];
  const ja = sid ? d.visita.extra[sid] || 0 : 0;
  const juntar = () => {
    if (!sid || !(n > 0)) return;
    run(() => { A.extra(d.id, sid, r2(ja + n)); A.refazerOrcamento(d.id); });
    juntada?.(sid);
    fechar();
  };
  return (
    <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/[0.03] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-semibold">Adicionar uma tarefa{fase ? ` na fase ${fase}` : ""}</p>
        <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted" aria-label="Fechar" onClick={fechar}><X className="h-4 w-4" /></button>
      </div>
      {!sv ? <>
        <label className="grid gap-1.5 text-sm font-medium">O serviço do Catálogo
          <input type="search" autoFocus value={procura} onChange={(e) => setProcura(e.target.value)} placeholder="Ex.: pintura, ponto de luz, remoção"
            className="h-11 rounded-lg border border-input bg-background px-3 text-[15px]" />
        </label>
        {lista.length > 0 && (
          <ul className="space-y-1">
            {lista.map((x) => (
              <li key={x.id}>
                <button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-[15px] hover:bg-accent"
                  onClick={() => { setSid(x.id); setQ("1"); }}>
                  <span className="min-w-0"><span className="block truncate">{x.n}</span><span className="block text-xs text-muted-foreground">{x.perfil} · {nfmt(x.h)} h/{x.un}</span></span>
                  <span className="shrink-0 text-sm text-muted-foreground">{eur(x.preco)} €/{x.un}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {termo.length >= 2 && !lista.length && <p className="text-sm text-muted-foreground">Nenhum serviço do Catálogo com esse nome.</p>}
      </> : <>
        <p className="text-[15px]"><b className="font-medium">{sv.n}</b> <span className="text-muted-foreground">· {sv.perfil} · {eur(sv.preco)} €/{sv.un}</span>
          <button type="button" className="ml-2 text-sm font-medium text-primary" onClick={() => setSid(null)}>Outro serviço</button></p>
        <label className="grid max-w-[12rem] gap-1 text-sm font-medium">Quantidade ({sv.un})
          <input type="number" min={0} step={0.5} value={q} onChange={(e) => setQ(e.target.value)} className="h-11 rounded-lg border border-input bg-background px-3 text-[15px]" />
        </label>
        {n > 0 && (
          <p className="text-sm text-muted-foreground">{nfmt(r2(sv.h * n))} h ({dias(diasDeHoras(sv.h * n))}) · {eur(r2(sv.preco * n))} € sem IVA no orçamento{ja ? ` · já tinha ${nfmt(ja)} ${sv.un}: fica com ${nfmt(r2(ja + n))}` : ""}</p>
        )}
        {passos.length > 0 && (
          <ol className="space-y-1 text-sm">
            {passos.map((x, k) => <li key={k} className="flex justify-between gap-3 rounded-lg bg-muted/50 px-3 py-1.5"><span>{k + 1}. {x.n} · {x.oficio}</span><span className="tabular-nums text-muted-foreground">{nfmt(x.h)} h</span></li>)}
          </ol>
        )}
        <button type="button" disabled={!(n > 0)} onClick={juntar}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-[15px] font-medium text-primary-foreground disabled:opacity-50">
          <Plus className="h-4 w-4" aria-hidden="true" />Juntar ao plano e ao orçamento
        </button>
      </>}
    </div>
  );
}

/** 9/11: tirar uma tarefa confirma-se na própria linha (sai do plano e do orçamento). */
function ConfirmarTirar({ t, largura, sim, nao }: { t: TarefaPrevista; largura: number; sim: () => void; nao: () => void }) {
  return (
    <div className="sticky left-4 my-1 flex flex-wrap items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-2 text-sm" style={{ width: largura }} role="alert">
      <span className="min-w-0 flex-1">Tirar «{t.nome}» do plano e do orçamento?</span>
      <button type="button" className="min-h-9 rounded-full bg-destructive px-3 font-medium text-destructive-foreground" onClick={sim}>Tirar</button>
      <button type="button" className="min-h-9 rounded-full border border-input px-3" onClick={nao}>Cancelar</button>
    </div>
  );
}

/** 9/11 (Rúben: «identificadores nas tasks quando não tem técnicos disponíveis para estas datas»): quem faz a tarefa; a vermelho, com ⚠,
 *  quando o técnico está ocupado nesses dias ou não há ninguém do ofício. */
function IdTecnico({ td }: { td: TarefaDatas }) {
  const mal = !td.tec || !!td.ocupado;
  return (
    <span title={mal ? (td.tec ? `${td.tecNome} está ${td.ocupado} nestes dias` : `Sem ninguém de ${td.oficio} no RH`) : `${td.tecNome} · ${td.oficio}`}
      className={cn("inline-flex max-w-[7rem] shrink-0 items-center gap-1 truncate rounded-full px-1.5 text-xs font-medium",
        mal ? "bg-destructive/10 text-destructive" : "text-foreground")}>
      {mal && <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />}
      <span className="truncate">{td.tec ? td.tecNome.split(" ")[0] : "Sem técnico"}</span>
    </span>
  );
}
