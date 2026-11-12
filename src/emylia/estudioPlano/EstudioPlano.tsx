// 9/11 (Rúben: «precisamos de criar um estúdio, mas para a validação do plano da obra, todo bonito e animado e super completo»). O Estúdio
// do plano: as Operações validam e ajustam o plano da obra num ecrã só, por cima do negócio (as mudanças vão pelas ações do motor e gravam
// como os outros passos).
// 10/11 (Rúben): o alerta «noutra obra» diz qual, com a ligação ao Estúdio dela; a tarefa aberta tem a lista do que se pode fazer; «Nova
// tarefa»; a vista em Gantt ao lado da por técnico; e «A obra»: as fotografias da visita e o que se respondeu antes.
// 11/11 (Rúben: «tornar tudo muito mais bonito, dinâmico e interativo, não ter cards sem interação, fluido, para parecer WOW ao cliente»):
//  · em cima, «A obra no tempo»: as datas que viram ao mexer, os dias úteis, a equipa e as fases. Tocar numa pessoa ou numa fase destaca as
//    tarefas dela no calendário (as outras esbatem-se);
//  · o impacto no orçamento passa a ser um botão no cabeçalho, que abre o detalhe;
//  · o calendário: aproximar e afastar; a coluna do dia por baixo do rato; ao arrastar, o contorno de onde estava, as datas novas ao lado do
//    dedo e o aviso se o técnico não está livre nesses dias; passar por cima de uma barra mostra a tarefa; num dia vazio de um técnico, «+»
//    cria a tarefa nesse dia e com essa pessoa;
//  · cada mudança pode desfazer-se («Desfazer», em baixo); aprovar o plano tem festa;
//  · a tarefa aberta: «Quando» com o início e os dias à mão, e a semana em quadrados (tocar num dia muda o início).
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { usePainelUrl } from "../usarParamUrl";
import { AnimatePresence, motion } from "framer-motion";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle, ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, CalendarRange, Check, ChevronLeft, ChevronRight, Equal, FolderOpen, Hammer,
  Lightbulb, Minus, Package, Plus, RotateCcw, Ruler, Sparkles, Trash2, TrendingDown, TrendingUp, Users, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TECS, impactoDasMedidas, impactoDoPlano, medidasRetificadas, nfmt, tot, type Negocio, type Tarefa } from "../motor";
import type { Ctx } from "../pecas";
import { NaFrente } from "../NaFrente";
import { COR_FASE, FASES_OBRA } from "../fasesObra";
import { dataCurta, diasDaObra, isoDia } from "../planoObra";
import { blocosForaDaObra, inicioDoPlano, motivoOcupado, obraQueOcupa, obrasDosTecnicos, ocupacaoDosTecnicos, planoComAgendaDeHoje, retificacaoAceite, tecnicosDoOficio } from "../preparacaoObra";
import { NovaTarefa } from "../PlanoInterativo";
import { pelaPermissao, podeNeg } from "../permissoes";
import { InfoDoNegocio } from "./InfoDoNegocio";
import { EscolherQuem } from "./EscolherQuem";
import { ImpactoNoOrcamento, linhasDoImpacto, textoEur, type LinhaImpacto } from "./ImpactoNoOrcamento";
import { materiaisDaTarefa } from "../tarefasValidador";
import { diferencas } from "../ajustesPlano";
import { passosDaTarefa } from "../planoDaVisita";
import { ausenteNoRh } from "../equipa/tecnicos";
import { Brilho, Contagem, MOLA, VistoDesenho, useReduzir } from "../movimento";

const SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const nomeTec = (id: string | null) => TECS.find((x) => x.id === id)?.n ?? "Por atribuir";
const primeiro = (n: string) => n.split(" ")[0];
const iniciais = (id: string | null) => (id ? nomeTec(id).split(" ").map((x) => x[0]).slice(0, 2).join("") : "?");
const ZOOM = [36, 48, 64, 84] as const; // px por dia útil
const ROTULO = 224; // a coluna dos nomes (w-56)
const diasTxt = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

type Foco = { k: "fase"; n: number } | { k: "tec"; id: string | null } | null;
type Retrato = { dia: number; dur: number; h: number; tec: string | null }[];
type Arrasto = { ti: number; tipo: "mover" | "durar"; dx: number; x: number; y: number };

export function EstudioPlano({ ctx, d, fechar }: { ctx: Ctx; d: Negocio; fechar: () => void }) {
  const { S, A, run } = ctx;
  const reduzir = useReduzir();
  const p = d.obra.plano;
  // o painel da direita: a tarefa aberta, a tarefa nova (com o dia e a pessoa, se veio do «+») ou «A obra» (o que se sabe da visita)
  const [painel, setPainel] = useState<{ k: "tarefa"; ti: number } | { k: "nova"; inicial?: { dia: number; tec: string | null } } | { k: "info" } | null>(null);
  const sel = painel?.k === "tarefa" ? painel.ti : null;
  const setSel = (ti: number | null) => setPainel(ti == null ? null : { k: "tarefa", ti });
  const [vista, setVista] = useState<"tecnicos" | "gantt">("tecnicos");
  const [outra, setOutra] = useState<Negocio | null>(null); // a outra obra, aberta no Estúdio dela
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const toque = useRef<{ x: number; ti: number; tipo: "mover" | "durar" } | null>(null);
  const [foco, setFoco] = useState<Foco>(null);
  const [zoom, setZoom] = useState(2);
  const col = ZOOM[zoom];
  const [dica, setDica] = useState<{ ti: number; x: number; y: number } | null>(null);
  const [sob, setSob] = useState<{ k: number; tec?: string | null } | null>(null); // o dia (e a linha) por baixo do rato
  const [verImpacto, setVerImpacto] = useState(false);
  const [desfazer, setDesfazer] = useState<{ snap: Retrato; ti: number; n: number } | null>(null);
  const [realce, setRealce] = useState<number | null>(null); // a barra do alerta por baixo do rato
  const secCal = useRef<HTMLElement>(null);
  const grelha = useRef<HTMLDivElement>(null);
  const secAlertas = useRef<HTMLElement>(null);
  const barras = useRef<(HTMLButtonElement | null)[]>([]);

  const inicio = p ? inicioDoPlano(p) ?? new Date() : new Date();
  const fim = p ? Math.max(1, ...p.tasks.map((t) => t.dia + t.dur)) : 1;
  const dias = useMemo(() => diasDaObra(inicio, fim + 5), [isoDia(inicio), fim]); // eslint-disable-line react-hooks/exhaustive-deps
  const ocup = useMemo(() => ocupacaoDosTecnicos(S, d.id), [S, d.id, S.deals]); // eslint-disable-line react-hooks/exhaustive-deps
  const obrasOcup = useMemo(() => obrasDosTecnicos(S, d.id), [S, d.id, S.deals]); // eslint-disable-line react-hooks/exhaustive-deps
  // 12/11: o plano por aprovar que nasceu com a agenda antiga (empurrado semanas): o refeito com a agenda de hoje, se ficar mais curto
  const comAgenda = useMemo(() => (d.obra.plano?.estado === "por aprovar" ? planoComAgendaDeHoje(d, S) : null),
    [d.obra.plano, d.obra.plano?.tasks.length, S.deals]); // eslint-disable-line react-hooks/exhaustive-deps
  // 11/11: o que as medidas do local mudam no orçamento (refaz o orçamento numa cópia: só quando as medidas mudam, não a cada arrasto)
  const impMedidas = useMemo(() => (d.orc && !d.orc.vendaDireta && d.f.retif_aceite ? impactoDasMedidas(d, S, medidasRetificadas(d)) : null),
    [d.f.retif_aceite, d.orc]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!desfazer) return; const t = setTimeout(() => setDesfazer(null), 7000); return () => clearTimeout(t); }, [desfazer?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return null;
  const editavel = p.estado === "por aprovar" || p.estado === "aprovado";
  // 10/11: com a obra a andar já não se arrasta, mas ainda se passa a tarefa a outro técnico, se adia e se junta uma tarefa nova
  const podeAgir = editavel || p.estado === "em curso";
  const podeCriar = podeAgir && (S.role === "operacoes" || pelaPermissao(S.role, ["obra.planear"])) && podeNeg(S.role, "obra.planear");
  const ondeEsta = (t: Tarefa) => (t.tec ? obraQueOcupa(S, t.tec, t, p, d.id) : null);
  const dif = diferencas(p);
  const podeRepor = p.estado === "por aprovar" && dif.mexidas.length > 0;
  const motivo = (t: Tarefa, ti: number) => (t.tec ? motivoOcupado(t.tec, t, p, ocup, p.tasks.filter((_, i) => i !== ti)) : null);
  const alertas = p.tasks.map((t, ti) => ({ t, ti, m: t.tec ? motivo(t, ti) : "sem técnico" })).filter((x) => x.m);
  const pessoas = [...new Set(p.tasks.map((t) => t.tec).filter((x): x is string => !!x))];
  const linhas: (string | null)[] = [...pessoas, ...(p.tasks.some((t) => !t.tec) ? [null] : [])];
  const medidasOk = retificacaoAceite(d);
  // 10/11 (Rúben: «medidas antes da fatura»): o plano aprova-se antes do pagamento. 11/11 (Rúben: «os ajustes às medidas e a validação do
  // plano devem ser em simultâneo, não tem de estar bloqueado»): já não espera pelas medidas; se elas mudarem, o plano volta a por aprovar
  const planeia = podeNeg(S.role, "obra.planear");
  const podeAprovar = p.estado === "por aprovar" && planeia && !alertas.some((a) => a.m === "de férias");
  const porque = p.estado !== "por aprovar" ? "" : !planeia ? "Quem aprova o plano são as Operações." : alertas.some((a) => a.m === "de férias") ? "Há um técnico de férias numa tarefa." : "";
  const fimData = dias[Math.max(0, fim - 1)];
  const fazer = (fn: () => void) => run(fn);
  const retrato = (): Retrato => p.tasks.map((t) => ({ dia: t.dia, dur: t.dur, h: t.h, tec: t.tec }));
  // cada mudança guarda o retrato de antes, para «Desfazer» (só se mudou mesmo)
  const mudar = (ti: number, fn: () => void) => {
    const snap = retrato();
    fazer(fn);
    if (JSON.stringify(retrato()) !== JSON.stringify(snap)) setDesfazer({ snap, ti, n: Date.now() });
  };

  const deFerias = (tec: string, iso: string) => ausenteNoRh(tec, iso) || !!TECS.find((y) => y.id === tec)?.feriasDatas?.includes(iso);
  // o dia (índice) está ocupado para o técnico fora desta obra (férias do RH, da ficha, ou outra obra)
  const foraDaObra = (tec: string, k: number) => {
    const x = dias[k];
    if (!x) return false;
    const iso = isoDia(x);
    return ausenteNoRh(tec, iso) || !!TECS.find((y) => y.id === tec)?.feriasDatas?.includes(iso) || !!ocup.get(tec)?.has(iso);
  };
  const combina = (t: Tarefa) => !foco || (foco.k === "fase" ? (t.fase ?? 1) === foco.n : t.tec === foco.id);
  const alternarFoco = (f: Exclude<Foco, null>) => setFoco((x) => (x && x.k === f.k && (f.k === "fase" ? x.k === "fase" && x.n === f.n : x.k === "tec" && x.id === f.id) ? null : f));

  // ----------------------------------------------------------------- arrastar
  const relativo = (e: { clientX: number; clientY: number }) => {
    const r = secCal.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  };
  const pegar = (e: RPointerEvent, ti: number, tipo: "mover" | "durar") => {
    if (!editavel) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    toque.current = { x: e.clientX, ti, tipo };
    setDica(null);
    setArrasto({ ti, tipo, dx: 0, ...relativo(e) });
  };
  const mover = (e: RPointerEvent) => {
    if (toque.current) { setArrasto({ ti: toque.current.ti, tipo: toque.current.tipo, dx: e.clientX - toque.current.x, ...relativo(e) }); return; }
    // a coluna do dia por baixo do rato
    const g = grelha.current?.getBoundingClientRect();
    if (!g) return;
    const k = Math.floor((e.clientX - g.left - ROTULO) / col);
    const linha = (e.target as HTMLElement).closest?.("[data-linha]")?.getAttribute("data-linha");
    const tec = linha == null ? undefined : linha === "" ? null : linha;
    const novo = k >= 0 && k < dias.length ? { k, tec } : null;
    if (novo?.k !== sob?.k || novo?.tec !== sob?.tec) setSob(novo);
  };
  const largar = () => {
    const t = toque.current;
    toque.current = null;
    if (!t || !arrasto) { setArrasto(null); return; }
    const passos = Math.round(arrasto.dx / col);
    setArrasto(null);
    if (!passos) { setSel(t.ti); return; }
    const tt = p.tasks[t.ti];
    if (t.tipo === "mover") mudar(t.ti, () => A.ajustarTarefa(d.id, t.ti, { dia: Math.max(0, tt.dia + passos) }));
    else mudar(t.ti, () => A.ajustarTarefa(d.id, t.ti, { dur: Math.max(1, tt.dur + passos) }));
  };
  // para onde vai a barra que se arrasta (e se o técnico está livre nesses dias)
  const alvo = (() => {
    if (!arrasto) return null;
    const t = p.tasks[arrasto.ti];
    if (!t) return null;
    const passos = Math.round(arrasto.dx / col);
    const dia = arrasto.tipo === "mover" ? Math.max(0, t.dia + passos) : t.dia;
    const dur = arrasto.tipo === "durar" ? Math.max(1, t.dur + passos) : t.dur;
    const conflito = !!t.tec && Array.from({ length: dur }, (_, k) => dia + k).some((k) => foraDaObra(t.tec!, k));
    return { t, dia, dur, conflito };
  })();

  const mostrarDica = (e: RPointerEvent<HTMLElement>, ti: number) => {
    if (toque.current || e.pointerType === "touch") return;
    const r = e.currentTarget.getBoundingClientRect(), s = secCal.current?.getBoundingClientRect();
    if (s) setDica({ ti, x: r.left - s.left + Math.min(r.width / 2, 120), y: r.top - s.top });
  };
  const irParaBarra = (ti: number) => {
    barras.current[ti]?.scrollIntoView({ behavior: reduzir ? "auto" : "smooth", block: "center", inline: "center" });
    setSel(ti);
  };

  const fases = FASES_OBRA.map((f) => {
    const ts = p.tasks.filter((t) => (t.fase ?? 1) === f.n);
    return { ...f, n: f.n, ts, ini: ts.length ? Math.min(...ts.map((t) => t.dia)) : 0, fim: ts.length ? Math.max(...ts.map((t) => t.dia + t.dur)) : 0 };
  }).filter((f) => f.ts.length);

  // o impacto no orçamento (as medidas e o plano), para o botão do cabeçalho e o detalhe
  const impacto = (() => {
    if (!d.orc || d.orc.vendaDireta) return null;
    const mi = impMedidas, pi = impactoDoPlano(d, S);
    const L: LinhaImpacto[] = [
      ...(mi ? linhasDoImpacto(Math.abs(mi.medidas) > 0.004 ? 1 : 0, mi, Math.abs(mi.medidas) > 0.004 || Math.abs(pi.horas) > 0.004).map((x) => (x.l.includes("medida") ? { ...x, l: "Medidas do local" } : x)) : []),
      ...(Math.abs(pi.horas) > 0.004 ? [{ l: "Ajustes ao plano", sub: `${pi.horas > 0 ? "+" : "−"}${nfmt(Math.abs(pi.horas))} h`, v: pi.semValor ? null : pi.valor }] : []),
    ];
    return { L, atual: mi?.atual ?? tot(d, S).pf, dif: L.reduce((a, x) => a + (x.v ?? 0), 0) };
  })();

  // uma barra do calendário (as duas vistas): arrastar muda o dia, a pega muda os dias, as setas também; tocar abre a tarefa
  const barra = (t: Tarefa, ti: number, top: number, alt = 32) => {
    const a = arrasto?.ti === ti ? arrasto : null;
    const dx = a && a.tipo === "mover" ? a.dx : 0, dw = a && a.tipo === "durar" ? a.dx : 0;
    const m = motivo(t, ti);
    const cor = COR_FASE[t.fase ?? 1];
    const esbatida = !combina(t);
    const mexida = dif.mexidas.includes(ti);
    const largura = Math.max(col - 4, t.dur * col - 4 + dw);
    return [
      a && <div key={"g" + ti} aria-hidden="true" className="absolute rounded-xl border-2 border-dashed border-foreground/25 bg-foreground/[0.03]" style={{ left: t.dia * col + 2, width: t.dur * col - 4, top, height: alt }} />,
      <motion.button key={ti} type="button" layout={!a && !reduzir} ref={(el: HTMLButtonElement | null) => { barras.current[ti] = el; }}
        aria-label={`${t.nome}: ${diasTxt(t.dur)}, a partir de ${dataCurta(dias[t.dia])}${m ? `, ${nomeTec(t.tec)} ${m}` : ""}`}
        onPointerDown={(e) => pegar(e, ti, "mover")} onClick={() => { if (!editavel) setSel(ti); }}
        onPointerEnter={(e) => mostrarDica(e, ti)} onPointerLeave={() => setDica((x) => (x?.ti === ti ? null : x))}
        onKeyDown={(e) => {
          if (!editavel) return;
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const s = e.key === "ArrowRight" ? 1 : -1; mudar(ti, () => A.ajustarTarefa(d.id, ti, e.shiftKey ? { dur: Math.max(1, t.dur + s) } : { dia: Math.max(0, t.dia + s) })); }
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(ti); }
        }}
        animate={{ opacity: esbatida ? 0.18 : 1, scale: a ? 1.04 : 1 }} transition={reduzir ? { duration: 0 } : { ...MOLA, opacity: { duration: 0.2 } }}
        className={cn("group absolute flex items-center gap-1.5 overflow-hidden rounded-xl px-2.5 text-left text-xs font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          editavel ? "cursor-grab active:cursor-grabbing" : "cursor-pointer", sel === ti && "ring-2 ring-foreground ring-offset-2 ring-offset-card",
          m && "ring-2 ring-destructive ring-offset-1 ring-offset-card", realce === ti && "ring-4 ring-amber-400 ring-offset-1 ring-offset-card",
          a && alvo?.conflito && "ring-2 ring-destructive")}
        style={{ left: t.dia * col + 2 + dx, width: largura, top, height: alt, background: cor, touchAction: "none", zIndex: a ? 20 : undefined,
          boxShadow: a ? `0 14px 28px -10px ${cor}` : `0 3px 10px -5px ${cor}` }}>
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />
        {a && alvo?.conflito && <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(255,255,255,0.22)_6px_10px)]" />}
        {m && <AlertTriangle className="relative h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        {vista === "gantt" && largura > 70 && <span aria-hidden="true" className="relative grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/25 text-[9px]">{iniciais(t.tec)}</span>}
        <span className="relative truncate">{t.nome}</span>
        {largura > 120 && <span aria-hidden="true" className="relative ml-auto shrink-0 rounded-md bg-white/20 px-1.5 py-px text-[10px] tabular-nums">{t.dur}d</span>}
        {mexida && <span aria-hidden="true" title="Mudou face ao orçamento" className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-white shadow" />}
        {editavel && <span onPointerDown={(e) => pegar(e, ti, "durar")} aria-hidden="true" className="absolute inset-y-0 right-0 w-3 cursor-ew-resize bg-white/0 transition-colors group-hover:bg-white/30" />}
      </motion.button>,
    ];
  };

  // os riscados (férias ou outra obra) e as semanas, por baixo das barras de uma linha
  const fundoDaLinha = (tec: string | null) => (
    <>
      {tec && dias.map((_, k) => foraDaObra(tec, k) && (
        <div key={k} aria-hidden="true" className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,transparent_0_5px,hsl(var(--destructive)/0.16)_5px_8px)]" style={{ left: k * col, width: col }} />
      ))}
      {dias.map((x, k) => x.getDay() === 1 && k > 0 && <div key={"s" + k} aria-hidden="true" className="absolute inset-y-0 border-l-2 border-l-foreground/10" style={{ left: k * col }} />)}
    </>
  );

  const temImpacto = !!impacto && Math.abs(impacto.dif) > 0.004;

  return (
    <NaFrente>
      <motion.div className="fixed inset-0 flex flex-col overflow-hidden bg-background" role="dialog" aria-modal="true" aria-labelledby="estudio-plano-titulo"
        initial={reduzir ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}>
        {/* ---------------------------------------------------------------- o cabeçalho */}
        <header className="border-b border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Button type="button" variant="outline" className="min-h-11" onClick={fechar}><ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />Voltar ao negócio</Button>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Estúdio do plano</p>
                <h1 id="estudio-plano-titulo" className="truncate text-xl font-semibold tracking-tight">{d.nome} · {d.servico || "Obra"}</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant={painel?.k === "info" ? "secondary" : "outline"} className="min-h-11" aria-pressed={painel?.k === "info"}
                onClick={() => setPainel(painel?.k === "info" ? null : { k: "info" })}><FolderOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />A obra</Button>
              {/* 10/11: o plano aprova-se antes do pagamento; «Pago» só quando já está */}
              {d.fin.pago && <Estado ok t="Pago" />}
              {!medidasOk && <span title="O supervisor confirma as medidas ao mesmo tempo; se mudarem, o plano volta a por aprovar"><Estado ok={false} t="Medidas em curso" icone={<Ruler className="h-3.5 w-3.5" aria-hidden="true" />} /></span>}
              {/* os alertas levam à lista (com a correção) */}
              <button type="button" onClick={() => secAlertas.current?.scrollIntoView({ behavior: reduzir ? "auto" : "smooth", block: "start" })}
                className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-transform hover:-translate-y-px", alertas.length ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200" : "bg-success/10 text-success")}>
                {alertas.length ? <><span aria-hidden="true" className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-60 motion-reduce:hidden" /><span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" /></span>{alertas.length} {alertas.length === 1 ? "alerta" : "alertas"}</> : <><Check className="h-3.5 w-3.5" aria-hidden="true" />Sem alertas</>}
              </button>
              {/* 11/11: o impacto no orçamento é um botão; abre o detalhe por baixo de «A obra no tempo» */}
              {impacto && (
                <button type="button" aria-expanded={verImpacto} onClick={() => setVerImpacto((x) => !x)}
                  className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-transform hover:-translate-y-px",
                    impacto.dif > 0.004 ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200" : impacto.dif < -0.004 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  {impacto.dif > 0.004 ? <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> : impacto.dif < -0.004 ? <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" /> : <Equal className="h-3.5 w-3.5" aria-hidden="true" />}
                  {temImpacto ? <>{textoEur(impacto.dif)} no orçamento</> : "Sem impacto no orçamento"}
                </button>
              )}
              <motion.span key={p.estado} initial={reduzir ? false : { scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={MOLA}
                className={cn("rounded-full px-3 py-1 text-sm font-medium", p.estado === "por aprovar" ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200" : "bg-success/15 text-success")}>{p.estado === "por aprovar" ? "Por aprovar" : p.estado === "aprovado" ? "Aprovado" : p.estado}</motion.span>
              {/* 10/11: só com o plano por aprovar e com alguma coisa mudada face ao orçamento (aprovado, mexer avisa e volta a por aprovar) */}
              {podeRepor && <Button type="button" variant="ghost" className="min-h-11" title="Volta ao plano como veio do orçamento" onClick={() => mudar(-1, () => A.reporPlano(d.id))}><RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />Repor</Button>}
              {p.estado === "por aprovar" && (
                <Button type="button" className="min-h-11" disabled={!podeAprovar} title={porque || undefined} onClick={() => { fazer(() => A.aprovarPlano(d.id)); if (d.obra.plano?.estado === "aprovado") { setDesfazer(null); celebrar({ fim: fimData, pessoas: pessoas.length }); } }}>
                  <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Aprovar o plano
                </Button>
              )}
            </div>
          </div>
          {porque && <p className="mx-auto max-w-[1500px] px-4 pb-2 text-sm text-amber-800 dark:text-amber-300 sm:px-6">{porque}</p>}
          {comAgenda && !dif.mexidas.length && planeia && (
            <div role="status" className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 pb-3 sm:px-6">
              <p className="min-w-0 flex-1 text-[15px]"><Sparkles className="mr-1.5 inline h-4 w-4 text-primary" aria-hidden="true" />
                Com a agenda dos técnicos de hoje, a obra fica em <b className="font-semibold">{comAgenda.dias} dias úteis</b> em vez de {comAgenda.antes}.</p>
              <Button type="button" variant="outline" className="min-h-11" onClick={() => mudar(-1, () => A.refazerPlanoComAgenda(d.id))}>Refazer o plano</Button>
            </div>
          )}
        </header>

        <div className="relative flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-5 sm:px-6">
              {/* ------------------------------------------------------------ a obra no tempo */}
              <section aria-label="A obra no tempo" className="relative overflow-hidden rounded-3xl border border-border bg-card p-4 sm:p-6">
                <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
                <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-primary/[0.06] blur-3xl" />
                <div className="relative flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
                  <div className="flex flex-wrap items-end gap-x-3 gap-y-3 sm:gap-5">
                    <DataGrande rotulo="Começa" data={inicio}
                      antes={editavel && p.origem === "orcamento" ? () => mudar(-1, () => A.inicioPlano(d.id, isoDia(diaUtilAntes(inicio)))) : undefined}
                      depois={editavel && p.origem === "orcamento" ? () => mudar(-1, () => A.inicioPlano(d.id, isoDia(diasDaObra(inicio, 2)[1]))) : undefined} />
                    <ArrowRight className="mb-2.5 hidden h-5 w-5 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
                    <DataGrande rotulo="Fica pronta" data={fimData} />
                  </div>
                  <div className="flex items-end gap-6">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Dias úteis</p>
                      <p className="flex items-baseline gap-2 text-3xl font-semibold tracking-tight"><Contagem valor={fim} fmt={(n) => String(Math.round(n))} de={0} />
                        <AnimatePresence>
                          {dif.dias !== 0 && (
                            <motion.span key={dif.dias} initial={reduzir ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                              className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", dif.dias > 0 ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200" : "bg-success/15 text-success")}>
                              {dif.dias > 0 ? "+" : "−"}{diasTxt(Math.abs(dif.dias))} face ao orçamento
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </p>
                      <span className="sr-only">{fim} dias úteis</span>
                    </div>
                    <div className="hidden text-sm text-muted-foreground sm:block">
                      <p><b className="font-semibold text-foreground"><Contagem valor={p.tasks.length} fmt={(n) => String(Math.round(n))} /></b> tarefas</p>
                      <p><b className="font-semibold text-foreground"><Contagem valor={p.tasks.reduce((a, t) => a + t.h, 0)} fmt={(n) => nfmt(Math.round(n))} /></b> horas</p>
                    </div>
                  </div>
                  {/* a equipa: tocar numa pessoa destaca as tarefas dela */}
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">A equipa · toque para destacar</p>
                    <div className="flex items-center -space-x-1.5">
                      {linhas.map((tec, i) => {
                        const on = foco?.k === "tec" && foco.id === tec;
                        const n = p.tasks.filter((t) => t.tec === tec).length;
                        const aviso = alertas.some((a) => a.t.tec === tec);
                        return (
                          <motion.button key={tec ?? "sem"} type="button" aria-pressed={on} title={`${nomeTec(tec)} · ${n} ${n === 1 ? "tarefa" : "tarefas"}`}
                            aria-label={`Destacar as tarefas de ${nomeTec(tec)}`} onClick={() => alternarFoco({ k: "tec", id: tec })}
                            initial={reduzir ? false : { opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: on ? 1.12 : 1, zIndex: on ? 2 : 1 }} transition={{ ...MOLA, delay: reduzir ? 0 : 0.04 * i }}
                            whileHover={reduzir ? undefined : { y: -3 }}
                            className={cn("relative grid h-11 w-11 place-items-center rounded-full border-2 border-card text-sm font-semibold shadow-sm",
                              tec ? "bg-primary/15 text-primary" : "bg-destructive/10 text-destructive", on && "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-card")}>
                            {iniciais(tec)}
                            {aviso && <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-amber-500" />}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* as fases: a pista do tempo e as fases em botões (tocar destaca as tarefas da fase) */}
                <div className="relative mt-6 space-y-2.5">
                  <div className="flex flex-wrap gap-2">
                    {fases.map((f) => {
                      const on = foco?.k === "fase" && foco.n === f.n;
                      return (
                        <button key={f.n} type="button" aria-pressed={on} onClick={() => alternarFoco({ k: "fase", n: f.n })}
                          className={cn("inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-all hover:-translate-y-px", on ? "border-transparent text-white shadow-md" : "border-border bg-background hover:border-foreground/20")}
                          style={on ? { background: COR_FASE[f.n] } : undefined}>
                          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: on ? "white" : COR_FASE[f.n] }} />
                          {f.n} · {f.curto}
                          <span className={cn("tabular-nums", on ? "text-white/80" : "text-muted-foreground")}>{diasTxt(f.fim - f.ini)}</span>
                        </button>
                      );
                    })}
                    {foco && (
                      <motion.button type="button" initial={reduzir ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} onClick={() => setFoco(null)}
                        className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" aria-hidden="true" />Ver tudo</motion.button>
                    )}
                  </div>
                  <div className="relative rounded-2xl bg-muted/60 p-1.5" style={{ height: fases.length * 14 + 12 }} aria-hidden="true">
                    {fases.map((f, i) => (
                      <motion.div key={f.n} className="absolute h-2.5 cursor-pointer rounded-full" onClick={() => alternarFoco({ k: "fase", n: f.n })}
                        style={{ top: 6 + i * 14, background: COR_FASE[f.n] }} initial={reduzir ? false : { left: "1%", width: 0 }}
                        animate={{ left: `calc(${(f.ini / fim) * 100}% + 4px)`, width: `calc(${Math.max(2, ((f.fim - f.ini) / fim) * 100)}% - 8px)`, opacity: f.ts.some(combina) ? 1 : 0.25 }}
                        transition={reduzir ? { duration: 0 } : { ...MOLA, delay: 0.05 * i }} />
                    ))}
                    {p.estado === "em curso" && <div className="absolute inset-y-1 w-0.5 rounded bg-foreground" style={{ left: `${((p.dia + 0.5) / fim) * 100}%` }} />}
                  </div>
                  <div className="flex justify-between text-xs tabular-nums text-muted-foreground"><span>{dataCurta(inicio)}</span><span>{fimData ? dataCurta(fimData) : ""}</span></div>
                </div>
              </section>

              {/* ------------------------------------------------------------ 11/11: o impacto no orçamento (abre pelo botão do cabeçalho) */}
              <AnimatePresence initial={false}>
                {impacto && verImpacto && (
                  <motion.div key="impacto" initial={reduzir ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <ImpactoNoOrcamento atual={impacto.atual} linhas={impacto.L} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ------------------------------------------------------------ o calendário */}
              <section ref={secCal} aria-label="O calendário por técnico" className="relative rounded-3xl border border-border bg-card shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-[15px] font-semibold">{vista === "tecnicos" ? "Quem faz o quê, dia a dia" : "As tarefas, pelas fases"}</h2>
                    <div role="group" aria-label="Vista" className="relative inline-flex rounded-full border border-input p-0.5">
                      {([["tecnicos", "Por técnico", Users], ["gantt", "Gantt", CalendarRange]] as const).map(([k, l, I]) => (
                        <button key={k} type="button" aria-pressed={vista === k} onClick={() => setVista(k)}
                          className={cn("relative inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors", vista === k ? "text-background" : "text-muted-foreground hover:text-foreground")}>
                          {vista === k && <motion.span layoutId={`vista-${d.id}`} aria-hidden="true" className="absolute inset-0 rounded-full bg-foreground" transition={reduzir ? { duration: 0 } : MOLA} />}
                          <I className="relative h-4 w-4" aria-hidden="true" /><span className="relative">{l}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div role="group" aria-label="Zoom" className="inline-flex rounded-full border border-input p-0.5">
                      <button type="button" aria-label="Afastar" disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))} className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted disabled:opacity-40"><ZoomOut className="h-4 w-4" /></button>
                      <button type="button" aria-label="Aproximar" disabled={zoom === ZOOM.length - 1} onClick={() => setZoom((z) => Math.min(ZOOM.length - 1, z + 1))} className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted disabled:opacity-40"><ZoomIn className="h-4 w-4" /></button>
                    </div>
                    {podeCriar && <Button type="button" size="sm" variant="outline" className="min-h-9 rounded-full" onClick={() => setPainel({ k: "nova" })}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />Nova tarefa</Button>}
                  </div>
                </div>
                <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
                  {editavel ? <>Arraste uma barra para mudar o dia; a ponta muda os dias. {podeCriar && vista === "tecnicos" ? "Num dia vazio, «+» cria uma tarefa. " : ""}Riscado: férias ou outra obra.</> : "A obra já arrancou: toque numa tarefa para a passar a outro técnico ou adiar."}
                </p>
                <div className="overflow-x-auto" onPointerMove={mover} onPointerUp={largar} onPointerLeave={() => !toque.current && setSob(null)}
                  onPointerCancel={() => { toque.current = null; setArrasto(null); }}>
                  <div ref={grelha} className="relative min-w-max">
                    {/* a coluna do dia por baixo do rato */}
                    {sob && !arrasto && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-0 bg-primary/[0.05] transition-[left] duration-75" style={{ left: ROTULO + sob.k * col, width: col }} />}
                    {/* os dias */}
                    <div className="sticky top-0 z-10 flex border-b border-border bg-card">
                      <div className="sticky left-0 z-20 w-56 shrink-0 bg-card px-4 py-2 text-xs font-medium text-muted-foreground">{vista === "tecnicos" ? "Técnico" : "Tarefa"}</div>
                      {dias.map((x, k) => {
                        const naMira = !!alvo && k >= alvo.dia && k < alvo.dia + alvo.dur;
                        const hoje = p.estado === "em curso" && k === p.dia;
                        return (
                          <div key={k} className={cn("shrink-0 py-1.5 text-center text-xs tabular-nums transition-colors", x.getDay() === 1 && k > 0 && "border-l-2 border-l-foreground/15", k >= fim && !naMira && "opacity-50",
                            naMira && (alvo!.conflito ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"), sob?.k === k && !arrasto && "text-primary")} style={{ width: col }}>
                            <span className={cn("block", !naMira && "text-muted-foreground")}>{hoje ? "hoje" : col < 44 ? SEM[x.getDay()][0] : SEM[x.getDay()]}</span>
                            <span className={cn("mx-auto grid h-6 w-6 place-items-center rounded-full font-medium", hoje && "bg-primary text-primary-foreground")}>{x.getDate()}</span>
                          </div>
                        );
                      })}
                    </div>
                    {vista === "tecnicos" && linhas.map((tec) => {
                      const ts = p.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => t.tec === tec);
                      // as tarefas da pessoa empilham-se quando se sobrepõem (cada uma na sua faixa)
                      const faixas: number[] = [];
                      const faixa = ts.map(({ t }) => { let f = 0; while (faixas[f] !== undefined && faixas[f] > t.dia) f++; faixas[f] = t.dia + t.dur; return f; });
                      // 11/11 (Rúben: «falta ver quando os técnicos estão ocupados»): por baixo das tarefas, as barras de quando a pessoa
                      // está fora desta obra: noutra obra (cinzenta, com o nome; abre o Estúdio dela) ou de férias
                      const fora = tec ? blocosForaDaObra(tec, dias, obrasOcup, deFerias, (x, iso) => ocup.cheio(x, iso)) : [];
                      const altura = Math.max(1, faixas.length) * 40 + 12 + (fora.length ? 30 : 0);
                      const esbatida = foco?.k === "tec" && foco.id !== tec;
                      // «+» num dia vazio da linha (por baixo do rato)
                      const k = sob && sob.tec === tec ? sob.k : null;
                      const livre = k != null && !ts.some(({ t }) => k >= t.dia && k < t.dia + t.dur) && !(tec && foraDaObra(tec, k));
                      return (
                        <div key={tec ?? "sem"} data-linha={tec ?? ""} className={cn("relative flex border-b border-border transition-opacity last:border-b-0", esbatida && "opacity-60")}>
                          <button type="button" onClick={() => alternarFoco({ k: "tec", id: tec })} aria-pressed={foco?.k === "tec" && foco.id === tec}
                            className="sticky left-0 z-10 flex w-56 shrink-0 items-center gap-2 bg-card px-4 py-2 text-left hover:bg-muted/50">
                            <span aria-hidden="true" className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold", tec ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>{iniciais(tec)}</span>
                            <span className="min-w-0"><span className="block truncate text-sm font-medium">{nomeTec(tec)}</span><span className="block truncate text-xs text-muted-foreground">{tec ? `${TECS.find((x) => x.id === tec)?.sk ?? ""} · ${ts.length} ${ts.length === 1 ? "tarefa" : "tarefas"}` : "falta escolher"}</span></span>
                          </button>
                          <div className="relative" style={{ width: dias.length * col, height: altura }}>
                            {fundoDaLinha(tec)}
                            {podeCriar && livre && !arrasto && (
                              <button type="button" aria-label={`Nova tarefa para ${nomeTec(tec)} a ${dataCurta(dias[k!])}`} onClick={() => setPainel({ k: "nova", inicial: { dia: k!, tec } })}
                                className="absolute top-1.5 grid place-items-center rounded-xl border-2 border-dashed border-primary/40 text-primary hover:bg-primary/[0.06]" style={{ left: k! * col + 2, width: col - 4, height: 32 }}>
                                <Plus className="h-4 w-4" aria-hidden="true" />
                              </button>
                            )}
                            {ts.map(({ t, ti }, j) => barra(t, ti, 6 + faixa[j] * 40))}
                            {fora.map((b) => {
                              const largura = (b.fim - b.ini) * col - 4, txt = b.tipo === "ferias" ? "Férias" : `${b.parcial ? "Parte do dia · " : ""}${b.obra!.nome}${b.obra!.servico ? ` · ${b.obra!.servico}` : ""}`;
                              const quando = `${dataCurta(dias[b.ini])}${b.fim - b.ini > 1 ? ` a ${dataCurta(dias[b.fim - 1])}` : ""}`;
                              const cls = "absolute flex h-6 items-center gap-1 overflow-hidden whitespace-nowrap rounded-lg px-2 text-[11px] font-medium";
                              const st = { left: b.ini * col + 2, width: largura, bottom: 4 };
                              return b.tipo === "obra" ? (
                                <button key={`o${b.ini}`} type="button" onClick={() => setOutra(b.obra!)} title={`Noutra obra: ${txt} (${quando}). Abrir o Estúdio dela`}
                                  aria-label={`${nomeTec(tec)} está noutra obra, ${txt}, ${quando}. Abrir o Estúdio dela`}
                                  className={cn(cls, b.parcial ? "border border-dashed border-muted-foreground/40 bg-card text-muted-foreground hover:bg-muted/60" : "bg-muted-foreground/20 text-foreground/80 hover:bg-muted-foreground/30")} style={st}>
                                  <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{largura > 50 ? txt : ""}</span>
                                </button>
                              ) : (
                                <span key={`f${b.ini}`} role="img" aria-label={`${nomeTec(tec)} de férias, ${quando}`} title={`Férias (${quando})`}
                                  className={cn(cls, "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100")} style={st}>
                                  <span className="truncate">{largura > 40 ? "Férias" : ""}</span>
                                </span>
                              );
                            })}
                            {p.estado === "em curso" && <div aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-primary/70" style={{ left: p.dia * col + col / 2 }} />}
                          </div>
                        </div>
                      );
                    })}
                    {/* 10/11 (Rúben: «uma vista alternativa de Gantt»): uma linha por tarefa, pela ordem das fases e dos dias */}
                    {vista === "gantt" && fases.map((f) => (
                      <div key={f.n} role="rowgroup" aria-label={`Fase ${f.n} · ${f.curto}`}>
                        <div className="flex border-b border-border bg-muted/40">
                          <button type="button" onClick={() => alternarFoco({ k: "fase", n: f.n })} className="sticky left-0 z-10 flex w-56 shrink-0 items-center gap-2 bg-muted/40 px-4 py-1.5 text-left text-xs font-semibold hover:bg-muted">
                            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: COR_FASE[f.n] }} />{f.n} · {f.curto}
                          </button>
                          <div className="relative" style={{ width: dias.length * col, height: 28 }}>
                            <motion.div aria-hidden="true" layout={!reduzir} className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full opacity-40" style={{ left: f.ini * col + 2, width: Math.max(col - 4, (f.fim - f.ini) * col - 4), background: COR_FASE[f.n] }} />
                          </div>
                        </div>
                        {f.ts.map((t) => p.tasks.indexOf(t)).sort((x, y) => p.tasks[x].dia - p.tasks[y].dia).map((ti) => {
                          const t = p.tasks[ti];
                          return (
                            <div key={ti} data-linha={t.tec ?? ""} className="flex border-b border-border last:border-b-0">
                              <button type="button" onClick={() => setSel(ti)} className="sticky left-0 z-10 flex w-56 shrink-0 items-center gap-2 bg-card px-4 py-1.5 text-left hover:bg-muted/60">
                                <span className="min-w-0"><span className="block truncate text-sm font-medium">{t.nome}</span><span className="block truncate text-xs text-muted-foreground">{nomeTec(t.tec)} · {diasTxt(t.dur)}</span></span>
                              </button>
                              <div className="relative" style={{ width: dias.length * col, height: 44 }}>
                                {fundoDaLinha(t.tec)}
                                {p.estado === "em curso" && <div aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-primary/70" style={{ left: p.dia * col + col / 2 }} />}
                                {barra(t, ti, 6)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                {/* a tarefa por baixo do rato, e as datas novas ao arrastar */}
                <AnimatePresence>
                  {alvo && arrasto ? (
                    <motion.div key="alvo" className="pointer-events-none absolute z-40" style={{ left: arrasto.x + 16, top: arrasto.y - 56 }}
                      initial={reduzir ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                      <div className={cn("whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium shadow-xl", alvo.conflito ? "bg-destructive text-destructive-foreground" : "bg-foreground text-background")}>
                        <span className="tabular-nums">{dataCurta(dias[alvo.dia])}{alvo.dur > 1 ? ` a ${dataCurta(dias[alvo.dia + alvo.dur - 1])}` : ""}</span> · {diasTxt(alvo.dur)}
                        {alvo.conflito && <span className="mt-0.5 flex items-center gap-1 text-xs font-normal"><AlertTriangle className="h-3 w-3" aria-hidden="true" />{primeiro(nomeTec(alvo.t.tec))} não está livre nestes dias</span>}
                      </div>
                    </motion.div>
                  ) : dica && p.tasks[dica.ti] ? (
                    <motion.div key={"dica" + dica.ti} className="pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-full" style={{ left: dica.x, top: dica.y - 8 }}>
                      <motion.div initial={reduzir ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}>
                        <DicaTarefa t={p.tasks[dica.ti]} dias={dias} m={motivo(p.tasks[dica.ti], dica.ti)} />
                      </motion.div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </section>

              {/* ------------------------------------------------------------ os alertas, com a correção */}
              <section ref={secAlertas} aria-label="Alertas e sugestões" className="scroll-mt-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-[15px] font-semibold">Alertas e sugestões</h2>
                  {/* 10/11: um toque resolve os conflitos de agenda (adia o que for preciso); as escolhas à mão ficam */}
                  {editavel && alertas.some(({ m }) => m === "noutra obra" || m === "de férias") && (
                    <Button type="button" size="sm" className="min-h-9 rounded-full" onClick={() => mudar(-1, () => A.resolverConflitos(d.id))}><Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />Resolver tudo</Button>
                  )}
                </div>
                <AnimatePresence initial={false} mode="popLayout">
                  {!alertas.length ? (
                    <motion.p key="ok" initial={reduzir ? false : { opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                      className="flex items-center gap-2 rounded-2xl bg-success/10 px-4 py-3 text-[15px] text-success"><VistoDesenho on className="h-5 w-5" />Toda a equipa está livre nos dias das suas tarefas.</motion.p>
                  ) : alertas.map(({ t, ti, m }) => {
                    const livres = tecnicosDoOficio(t).filter((x) => x.id !== t.tec && motivoOcupado(x.id, t, p, ocup, p.tasks.filter((_, i) => i !== ti)) == null).slice(0, 3);
                    const onde = m === "noutra obra" ? ondeEsta(t) : null;
                    const acabada = t.exec?.estado === "validada" || t.exec?.estado === "feita";
                    return (
                      <motion.div key={"a" + ti} layout={!reduzir} initial={reduzir ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
                        onPointerEnter={() => setRealce(ti)} onPointerLeave={() => setRealce(null)}
                        className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-2.5 text-sm dark:border-amber-800 dark:bg-amber-950/30">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <button type="button" onClick={() => irParaBarra(ti)} className="font-medium underline-offset-4 hover:underline">{t.nome}</button> ({dataCurta(dias[t.dia])}): {!t.tec ? "sem técnico do ofício." : onde
                            ? <>{nomeTec(t.tec)} está na obra <LigacaoObra o={onde} abrir={() => setOutra(onde)} />.</>
                            : `${nomeTec(t.tec)} está ${m}.`}
                        </span>
                        {podeAgir && !acabada && livres.map((x) => <button key={x.id} type="button" className="min-h-9 rounded-full border border-primary/40 bg-card px-3 text-primary transition-transform hover:-translate-y-px hover:bg-primary/[0.06]" onClick={() => mudar(ti, () => A.trocarTec(d.id, ti, x.id))}><Lightbulb className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Passar para {primeiro(x.n)}</button>)}
                        {podeAgir && !acabada && t.tec && m !== "noutra tarefa desta obra" && <button type="button" className="min-h-9 rounded-full border border-input bg-card px-3 transition-transform hover:-translate-y-px hover:bg-muted" onClick={() => mudar(ti, () => A.adiar(d.id, ti))}>Adiar até estar livre</button>}
                        <button type="button" className="min-h-9 rounded-full px-3 text-muted-foreground hover:bg-muted" onClick={() => setSel(ti)}>Abrir</button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </section>
            </div>
          </main>

          {/* ---------------------------------------------------------------- o painel: a tarefa, a tarefa nova ou a obra */}
          <AnimatePresence>
            {painel && (painel.k !== "tarefa" || p.tasks[painel.ti]) && (
              <motion.aside key={painel.k} aria-label={painel.k === "tarefa" ? "A tarefa" : painel.k === "nova" ? "Nova tarefa" : "A obra"}
                className={cn("absolute inset-y-0 right-0 z-30 w-full overflow-y-auto border-l border-border bg-card shadow-2xl sm:relative sm:z-auto sm:shadow-none", painel.k === "tarefa" ? "max-w-md" : "max-w-xl")}
                initial={reduzir ? false : { x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.2 }}>
                {painel.k === "tarefa" && (
                  <PainelTarefa key={painel.ti} ctx={ctx} d={d} ti={painel.ti} editavel={editavel} podeAgir={podeAgir} dias={dias} motivo={motivo(p.tasks[painel.ti], painel.ti)}
                    onde={motivo(p.tasks[painel.ti], painel.ti) === "noutra obra" ? ondeEsta(p.tasks[painel.ti]) : null} abrirOutra={setOutra} fechar={() => setPainel(null)} ocup={ocup}
                    mudar={mudar} foraDaObra={foraDaObra} />
                )}
                {painel.k === "nova" && <div className="p-4"><NovaTarefa key={JSON.stringify(painel.inicial ?? {})} ctx={ctx} d={d} inicial={painel.inicial} fechar={() => setPainel(null)} /></div>}
                {painel.k === "info" && (
                  <div className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-muted-foreground">O que se sabe da visita</p>
                        <h2 className="text-lg font-semibold leading-snug">A obra</h2>
                        {d.local && <p className="text-sm text-muted-foreground">{d.local}</p>}
                      </div>
                      <Button type="button" variant="ghost" className="min-h-10" aria-label="Fechar" onClick={() => setPainel(null)}><X className="h-4 w-4" /></Button>
                    </div>
                    <InfoDoNegocio ctx={ctx} d={d} />
                  </div>
                )}
              </motion.aside>
            )}
          </AnimatePresence>

          {/* ---------------------------------------------------------------- «Desfazer», em baixo */}
          <div className="pointer-events-none absolute inset-x-0 bottom-5 z-40 flex justify-center px-4">
            <AnimatePresence>
              {desfazer && (
                <motion.div key={desfazer.n} role="status" className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-foreground py-2 pl-4 pr-2 text-sm text-background shadow-2xl"
                  initial={reduzir ? false : { opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16 }} transition={MOLA}>
                  <span className="min-w-0">
                    {desfazer.ti >= 0 && p.tasks[desfazer.ti]
                      ? <><b className="font-semibold">{p.tasks[desfazer.ti].nome}</b>: {dataCurta(dias[p.tasks[desfazer.ti].dia])}, {diasTxt(p.tasks[desfazer.ti].dur)}{p.tasks[desfazer.ti].tec ? ` · ${primeiro(nomeTec(p.tasks[desfazer.ti].tec))}` : ""}</>
                      : <>Plano mudado · fica pronto a {fimData ? dataCurta(fimData) : "—"}</>}
                  </span>
                  <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-background/15 px-3 font-medium hover:bg-background/25"
                    onClick={() => { const s = desfazer.snap; setDesfazer(null); fazer(() => A.reporTarefasPlano(d.id, s)); }}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />Desfazer
                  </button>
                  <button type="button" aria-label="Fechar" className="grid h-9 w-9 place-items-center rounded-xl hover:bg-background/15" onClick={() => setDesfazer(null)}><X className="h-4 w-4" /></button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </motion.div>
      {outra && <EstudioPlano ctx={ctx} d={outra} fechar={() => setOutra(null)} />}
    </NaFrente>
  );
}

/** Uma data grande que vira ao mudar (o início com as setas para a mudar). */
function DataGrande({ rotulo, data, antes, depois }: { rotulo: string; data?: Date; antes?: () => void; depois?: () => void }) {
  const reduzir = useReduzir();
  const iso = data ? isoDia(data) : "";
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
      <div className="flex items-center gap-1">
        {antes && <button type="button" aria-label={`${rotulo}: um dia útil antes`} onClick={antes} className="grid h-9 w-9 place-items-center rounded-full border border-border hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>}
        <span className="relative inline-grid min-w-[6.5rem] overflow-hidden text-2xl font-semibold tracking-tight sm:min-w-[7.5rem] sm:text-3xl">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={iso} className="col-start-1 row-start-1 whitespace-nowrap tabular-nums" initial={reduzir ? false : { y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -18, opacity: 0 }} transition={reduzir ? { duration: 0 } : MOLA}>
              {data ? dataCurta(data) : "—"}
            </motion.span>
          </AnimatePresence>
        </span>
        {depois && <button type="button" aria-label={`${rotulo}: um dia útil depois`} onClick={depois} className="grid h-9 w-9 place-items-center rounded-full border border-border hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>}
      </div>
    </div>
  );
}

/** O cartão da tarefa ao passar por cima de uma barra. */
function DicaTarefa({ t, dias, m }: { t: Tarefa; dias: Date[]; m: string | null }) {
  return (
    <div className="w-64 rounded-2xl border border-border bg-popover p-3 text-sm text-popover-foreground shadow-xl">
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: COR_FASE[t.fase ?? 1] }} />Fase {t.fase ?? 1} · {FASES_OBRA[(t.fase ?? 1) - 1]?.curto}</p>
      <p className="mt-0.5 font-semibold leading-snug">{t.nome}</p>
      <p className="mt-1 tabular-nums text-muted-foreground">{dataCurta(dias[t.dia])}{t.dur > 1 ? ` a ${dataCurta(dias[t.dia + t.dur - 1])}` : ""} · {nfmt(t.h)} h</p>
      <p className="mt-2 flex items-center gap-2">
        <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{iniciais(t.tec)}</span>
        <span className="min-w-0 truncate">{nomeTec(t.tec)}</span>
        {m && <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">{m}</span>}
      </p>
    </div>
  );
}

/** A festa de aprovar, por cima de tudo e fora do Estúdio: aprovado, a página passa ao passo seguinte e o Estúdio fecha, mas a festa fica
 *  os seus 2,6 s (ou até um toque). */
function celebrar(m: { fim?: Date; pessoas: number }) {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  document.body.appendChild(el);
  const raiz = createRoot(el);
  let foi = false;
  const fechar = () => { if (foi) return; foi = true; window.clearTimeout(t); raiz.unmount(); el.remove(); };
  const t = window.setTimeout(fechar, 2600);
  flushSync(() => raiz.render(<Festa fechar={fechar} fim={m.fim} pessoas={m.pessoas} />));
}

/** A festa de aprovar: o visto que se desenha, um brilho e os papelinhos com as cores das fases. */
function Festa({ fechar, fim, pessoas }: { fechar: () => void; fim?: Date; pessoas: number }) {
  const reduzir = useReduzir();
  const cores = Object.values(COR_FASE).concat(["#f5b942", "#22c55e"]);
  return (
    <motion.div className="fixed inset-0 z-[200] grid place-items-center bg-background/60 backdrop-blur-sm" onClick={fechar}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
      <div className="relative">
        {!reduzir && Array.from({ length: 28 }, (_, i) => {
          const ang = (i / 28) * Math.PI * 2 + Math.sin(i * 7.3) * 0.3, dist = 130 + ((i * 53) % 90);
          return (
            <motion.span key={i} aria-hidden="true" className="absolute left-1/2 top-1/2 h-2.5 w-1.5 rounded-sm" style={{ background: cores[i % cores.length] }}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }} animate={{ x: Math.cos(ang) * dist, y: Math.sin(ang) * dist + 40, opacity: 0, rotate: 360 + i * 25 }}
              transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.1 }} />
          );
        })}
        <motion.div role="status" className="relative flex flex-col items-center gap-2 rounded-3xl border border-border bg-card px-10 py-8 text-center shadow-2xl"
          initial={reduzir ? false : { scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={MOLA}>
          <span className="relative grid h-16 w-16 place-items-center rounded-full bg-success/15 text-success"><Brilho ativo /><VistoDesenho on grande className="h-9 w-9" /></span>
          <p className="text-2xl font-semibold tracking-tight">Plano aprovado</p>
          <p className="max-w-xs text-[15px] text-muted-foreground">{pessoas} {pessoas === 1 ? "pessoa" : "pessoas"} na equipa · fica pronta a {fim ? dataCurta(fim) : "—"}. Os técnicos recebem as tarefas na app.</p>
        </motion.div>
      </div>
    </motion.div>
  );
}

/** 10/11: a outra obra (o nome e o serviço), que abre o Estúdio dela. */
export function LigacaoObra({ o, abrir }: { o: Negocio; abrir: () => void }) {
  return (
    <button type="button" onClick={abrir} title="Abrir o Estúdio desta obra"
      className="inline-flex items-center gap-0.5 rounded font-medium text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      {o.nome}{o.servico ? ` · ${o.servico}` : ""}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

const diaUtilAntes = (x: Date) => { const y = new Date(x); do { y.setDate(y.getDate() - 1); } while (y.getDay() === 0 || y.getDay() === 6); return y; };

function Estado({ ok, t, icone }: { ok: boolean; t: string; icone?: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm", ok ? "bg-success/10 text-success" : "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200")}>
      {icone ?? (ok ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />)}{t}
    </span>
  );
}

/** Um contador − valor + (o início e os dias da tarefa). */
function Passador({ rotulo, valor, menos, mais, chave, setas }: { rotulo: string; valor: string; menos?: () => void; mais?: () => void; chave: string; setas?: boolean }) {
  const reduzir = useReduzir();
  return (
    <div className="rounded-2xl bg-muted/60 p-2.5">
      <p className="px-1 text-xs font-medium text-muted-foreground">{rotulo}</p>
      <div className="mt-1 flex items-center justify-between gap-1">
        <button type="button" aria-label={`${rotulo}: menos`} disabled={!menos} onClick={menos} className="grid h-10 w-10 place-items-center rounded-xl bg-card shadow-sm transition-transform active:scale-90 disabled:opacity-30">{setas ? <ChevronLeft className="h-4 w-4" /> : <Minus className="h-4 w-4" />}</button>
        <span className="relative inline-grid flex-1 overflow-hidden text-center text-lg font-semibold tabular-nums">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={chave} className="col-start-1 row-start-1 whitespace-nowrap" initial={reduzir ? false : { y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={reduzir ? { duration: 0 } : MOLA}>{valor}</motion.span>
          </AnimatePresence>
        </span>
        <button type="button" aria-label={`${rotulo}: mais`} disabled={!mais} onClick={mais} className="grid h-10 w-10 place-items-center rounded-xl bg-card shadow-sm transition-transform active:scale-90 disabled:opacity-30">{setas ? <ChevronRight className="h-4 w-4" /> : <Plus className="h-4 w-4" />}</button>
      </div>
    </div>
  );
}

/** A tarefa aberta: quando (o início, os dias e a semana), o que se pode fazer, quem a faz, a fase, o que se faz, os materiais e a nota.
 *  11/11: partilhado com o Estúdio da obra (obra em curso): `minDia` (não começa antes de hoje), `notaLivre` (a nota muda-se mesmo numa tarefa
 *  já começada) e `extra` (a execução da tarefa, logo a seguir ao cabeçalho). */
export function PainelTarefa({ ctx, d, ti, editavel, podeAgir, dias, motivo, onde, abrirOutra, fechar, ocup, mudar, foraDaObra, minDia = 0, notaLivre, extra }: {
  ctx: Ctx; d: Negocio; ti: number; editavel: boolean; podeAgir: boolean; dias: Date[]; motivo: string | null; onde: Negocio | null;
  abrirOutra: (o: Negocio) => void; fechar: () => void; ocup: Map<string, Set<string>>;
  mudar: (ti: number, fn: () => void) => void; foraDaObra: (tec: string, k: number) => boolean;
  minDia?: number; notaLivre?: boolean; extra?: ReactNode;
}) {
  const { S, A, run } = ctx;
  const reduzir = useReduzir();
  const p = d.obra.plano!, t = p.tasks[ti];
  const [nota, setNota] = useState(t.nota ?? "");
  const [tirar, setTirar] = useState(false);
  const sid = t.svcs[0], s = sid ? S.svc[sid] : undefined;
  const q = s && s.h > 0 ? t.h / s.h : 0;
  const passos = sid ? passosDaTarefa(S, sid, q, t.sk, false) : [];
  const hPassos = Math.max(0.01, ...passos.map((x) => x.h));
  const mats = materiaisDaTarefa(t, S.svc);
  const outras = p.tasks.filter((_, i) => i !== ti);
  const quem = TECS.map((x) => ({ x, doOficio: tecnicosDoOficio(t).some((y) => y.id === x.id), m: motivoOcupado(x.id, t, p, ocup, outras) }))
    .sort((a, b) => Number(b.doOficio) - Number(a.doOficio) || Number(!!a.m) - Number(!!b.m));
  const fazer = (fn: () => void) => run(fn);
  const cor = COR_FASE[t.fase ?? 1];
  // 10/11 (Rúben: «na task ter a lista de ações»): o que se pode fazer com esta tarefa, num sítio só (o início e os dias vão em «Quando»)
  const acabada = t.exec?.estado === "validada" || t.exec?.estado === "feita";
  const livres = quem.filter((y) => y.doOficio && !y.m && y.x.id !== t.tec).slice(0, 3);
  const acoes: { k: string; t: string; sub?: string; icone: ReactNode; fn: () => void; perigo?: boolean }[] = [
    ...(onde ? [{ k: "outra", t: `Abrir a obra ${onde.nome}`, sub: `Onde ${primeiro(nomeTec(t.tec))} está nestes dias`, icone: <ArrowUpRight className="h-4 w-4" />, fn: () => abrirOutra(onde) }] : []),
    ...(podeAgir && !acabada ? livres.map((y) => ({ k: "p" + y.x.id, t: `Passar para ${y.x.n}`, sub: `${y.x.sk} · livre nestes dias`, icone: <Lightbulb className="h-4 w-4" />, fn: () => mudar(ti, () => A.trocarTec(d.id, ti, y.x.id)) })) : []),
    ...(podeAgir && !acabada && t.tec && motivo && motivo !== "noutra tarefa desta obra" ? [{ k: "adiar", t: "Adiar até estar livre", sub: "Esta tarefa e as seguintes andam os dias que for preciso", icone: <CalendarDays className="h-4 w-4" />, fn: () => mudar(ti, () => A.adiar(d.id, ti)) }] : []),
    ...(podeAgir && editavel && !acabada ? [{ k: "tirar", t: "Tirar do plano", sub: "O técnico é avisado", icone: <Trash2 className="h-4 w-4" />, fn: () => setTirar(true), perigo: true }] : []),
  ];
  // a semana à volta da tarefa: tocar num dia muda o início
  const de = Math.max(0, t.dia - 2), ate = Math.min(dias.length, t.dia + t.dur + 3);
  return (
    <div>
      <motion.div aria-hidden="true" className="h-1.5" style={{ background: cor }} initial={reduzir ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.35 }} />
      <div className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: cor }} />Fase {t.fase ?? 1} · {FASES_OBRA[(t.fase ?? 1) - 1]?.curto}</p>
            <h2 className="text-lg font-semibold leading-snug">{t.nome}</h2>
            <p className="text-sm tabular-nums text-muted-foreground">{dataCurta(dias[t.dia])}{t.dur > 1 ? ` a ${dataCurta(dias[t.dia + t.dur - 1])}` : ""} · {nfmt(t.h)} h</p>
          </div>
          <Button type="button" variant="ghost" className="min-h-10" aria-label="Fechar a tarefa" onClick={fechar}><X className="h-4 w-4" /></Button>
        </div>
        {motivo && <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{nomeTec(t.tec)} {onde ? <>está na obra <LigacaoObra o={onde} abrir={() => abrirOutra(onde)} /> nestes dias.</> : `está ${motivo} nestes dias.`}</span></p>}
        {extra}

        {/* 11/11: quando, à mão (o início e os dias), e a semana em quadrados */}
        <section aria-label="Quando" className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Passador rotulo="Começa" setas chave={String(t.dia)} valor={dataCurta(dias[t.dia])}
              menos={editavel && t.dia > minDia ? () => mudar(ti, () => A.ajustarTarefa(d.id, ti, { dia: t.dia - 1 })) : undefined}
              mais={editavel ? () => mudar(ti, () => A.ajustarTarefa(d.id, ti, { dia: t.dia + 1 })) : undefined} />
            <Passador rotulo="Dura" chave={String(t.dur)} valor={diasTxt(t.dur)}
              menos={editavel && t.dur > 1 ? () => mudar(ti, () => A.ajustarTarefa(d.id, ti, { dur: t.dur - 1 })) : undefined}
              mais={editavel ? () => mudar(ti, () => A.ajustarTarefa(d.id, ti, { dur: t.dur + 1 })) : undefined} />
          </div>
          <div className="flex gap-1" role="group" aria-label="Os dias à volta">
            {Array.from({ length: ate - de }, (_, j) => {
              const k = de + j, dentro = k >= t.dia && k < t.dia + t.dur, fora = !!t.tec && foraDaObra(t.tec, k);
              return (
                <button key={k} type="button" disabled={!editavel || dentro || k < minDia} onClick={() => mudar(ti, () => A.ajustarTarefa(d.id, ti, { dia: k }))}
                  aria-label={`Começar a ${dataCurta(dias[k])}${fora ? ` (${primeiro(nomeTec(t.tec))} não está livre)` : ""}`}
                  className={cn("flex min-h-12 flex-1 flex-col items-center justify-center rounded-xl text-xs tabular-nums transition-all",
                    dentro ? "font-semibold text-white shadow-sm" : "bg-muted/60 text-muted-foreground hover:-translate-y-0.5 hover:bg-muted disabled:hover:translate-y-0",
                    fora && !dentro && "bg-[repeating-linear-gradient(135deg,transparent_0_4px,hsl(var(--destructive)/0.18)_4px_7px)]")}
                  style={dentro ? { background: cor } : undefined}>
                  <span>{SEM[dias[k].getDay()]}</span><span className="text-sm">{dias[k].getDate()}</span>
                </button>
              );
            })}
          </div>
        </section>

        {acoes.length > 0 && (
          <section aria-labelledby="acoes-tarefa" className="space-y-1.5">
            <h3 id="acoes-tarefa" className="text-sm font-medium">O que pode fazer</h3>
            <ul className="overflow-hidden rounded-2xl border border-border">
              {acoes.map((x) => (
                <li key={x.k} className="border-b border-border last:border-b-0">
                  <button type="button" onClick={x.fn} className={cn("group flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none", x.perigo && "text-destructive")}>
                    <span aria-hidden="true" className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-transform group-hover:scale-110", x.perigo ? "bg-destructive/10" : "bg-primary/10 text-primary")}>{x.icone}</span>
                    <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium">{x.t}</span>{x.sub && <span className="block text-sm text-muted-foreground">{x.sub}</span>}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Quem faz</p>
          {/* 11/11 (Rúben: «as dropdowns devem ser muito mais bonitas, com pesquisa e sugestão de disponibilidade; e equipas») */}
          <EscolherQuem t={t} p={p} ocup={ocup} outras={outras} dias={dias} desligado={!podeAgir || acabada} escolher={(tec) => mudar(ti, () => A.trocarTec(d.id, ti, tec))} />
        </div>

        {editavel && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Fase</p>
            <div className="relative flex gap-1 rounded-xl bg-muted/60 p-1">
              {FASES_OBRA.map((f) => {
                const on = (t.fase ?? 1) === f.n;
                return (
                  <button key={f.n} type="button" aria-pressed={on} title={f.nome} onClick={() => mudar(ti, () => A.moverTarefaPlano(d.id, ti, { fase: f.n }))}
                    className={cn("relative min-h-10 flex-1 rounded-lg text-sm font-medium transition-colors", on ? "text-white" : "text-muted-foreground hover:text-foreground")}>
                    {on && <motion.span layoutId={`fase-tarefa-${d.id}`} aria-hidden="true" className="absolute inset-0 rounded-lg shadow-sm" style={{ background: COR_FASE[f.n] }} transition={reduzir ? { duration: 0 } : MOLA} />}
                    <span className="relative">{f.n}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">{FASES_OBRA[(t.fase ?? 1) - 1]?.nome}</p>
          </div>
        )}

        {passos.length > 0 && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-sm font-medium"><Hammer className="h-4 w-4 text-primary" aria-hidden="true" />O que se faz</p>
            <ol className="space-y-1 text-sm">
              {passos.map((x, k) => (
                <li key={k} className="relative overflow-hidden rounded-lg bg-muted/50 px-3 py-1.5">
                  <motion.span aria-hidden="true" className="absolute inset-y-0 left-0 origin-left" style={{ background: `${cor}1f`, width: `${(x.h / hPassos) * 100}%` }}
                    initial={reduzir ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.5, delay: 0.04 * k }} />
                  <span className="relative flex justify-between gap-3"><span>{k + 1}. {x.n}</span><span className="shrink-0 tabular-nums text-muted-foreground">{nfmt(x.h)} h</span></span>
                </li>
              ))}
            </ol>
          </div>
        )}
        {mats.length > 0 && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-sm font-medium"><Package className="h-4 w-4 text-primary" aria-hidden="true" />Materiais</p>
            <ul className="space-y-1 text-sm">{mats.map((m) => <li key={m.n} className="flex justify-between gap-3 rounded-lg bg-muted/50 px-3 py-1.5"><span className="min-w-0 truncate">{m.n}</span><span className="shrink-0 tabular-nums text-muted-foreground">{nfmt(m.q)} {m.un}</span></li>)}</ul>
          </div>
        )}

        <label className="grid gap-1.5 text-sm font-medium">Nota para a equipa
          <textarea value={nota} disabled={!editavel && !notaLivre} onChange={(e) => setNota(e.target.value)} onBlur={() => nota !== (t.nota ?? "") && fazer(() => A.ajustarTarefa(d.id, ti, { nota }))} rows={2}
            placeholder="Ex.: levar o andaime; a cliente está em casa de manhã" className="rounded-xl border border-input bg-background px-3 py-2 text-[15px]" />
        </label>

        <AnimatePresence>
          {tirar && (
            <motion.div initial={reduzir ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <span className="min-w-0 flex-1">Tirar «{t.nome}» do plano? O técnico é avisado.</span>
              <Button type="button" variant="destructive" className="min-h-10" onClick={() => { fazer(() => A.tirarTarefaPlano(d.id, ti)); fechar(); }}>Tirar</Button>
              <Button type="button" variant="outline" className="min-h-10" onClick={() => setTirar(false)}>Cancelar</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** O que abre o Estúdio do plano (no passo «Plano da obra»): o plano em miniatura (as barras pelas fases), as datas, a equipa e os alertas.
 *  Tocar em qualquer sítio abre o Estúdio. 11/11: substitui os números soltos (ResumoDoPlano) por uma pré-visualização viva. */
export function AbrirEstudioPlano({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  // 12/11: o Estúdio aberto vai para o endereço (?estudio=plano): o «voltar» do browser fecha-o em vez de sair do negócio
  const [aberto, setAberto] = usePainelUrl("estudio", "plano");
  const reduzir = useReduzir();
  const p = d.obra.plano;
  if (!p) return null;
  const fim = Math.max(1, ...p.tasks.map((t) => t.dia + t.dur));
  const inicio = inicioDoPlano(p) ?? new Date();
  const dias = diasDaObra(inicio, fim);
  const ocup = ocupacaoDosTecnicos(ctx.S, d.id);
  const nc = p.tasks.filter((t, i) => !t.tec || motivoOcupado(t.tec, t, p, ocup, p.tasks.filter((_, j) => j !== i)) != null).length;
  const pessoas = [...new Set(p.tasks.map((t) => t.tec).filter((x): x is string => !!x))];
  const ordem = p.tasks.map((t, i) => ({ t, i })).sort((a, b) => a.t.dia - b.t.dia).slice(0, 8);
  return (
    <>
      <motion.button type="button" onClick={() => setAberto(true)} whileHover={reduzir ? undefined : { y: -2 }} whileTap={reduzir ? undefined : { scale: 0.99 }}
        className="group block w-full overflow-hidden rounded-3xl border border-border bg-card text-left shadow-sm transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <div className="relative px-5 pb-3 pt-4">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Estúdio do plano</p>
              <p className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight tabular-nums">{dataCurta(inicio)}<ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{dataCurta(dias[fim - 1] ?? inicio)}</p>
              <p className="text-sm text-muted-foreground">{diasTxt(fim)} úteis · {p.tasks.length} {p.tasks.length === 1 ? "tarefa" : "tarefas"} · {pessoas.length} {pessoas.length === 1 ? "pessoa" : "pessoas"}</p>
            </div>
            <div className="flex items-center -space-x-1.5" aria-hidden="true">
              {pessoas.slice(0, 5).map((tec) => <span key={tec} className="grid h-9 w-9 place-items-center rounded-full border-2 border-card bg-primary/15 text-xs font-semibold text-primary">{iniciais(tec)}</span>)}
            </div>
          </div>
        </div>
        {/* o plano em miniatura */}
        <div aria-hidden="true" className="relative mx-5 space-y-1 rounded-2xl bg-muted/50 p-2.5">
          {ordem.map(({ t, i }, j) => (
            <div key={i} className="relative h-3">
              <motion.div className="absolute inset-y-0 rounded-full" style={{ left: `${(t.dia / fim) * 100}%`, background: COR_FASE[t.fase ?? 1] }}
                initial={reduzir ? false : { width: 0, opacity: 0 }} animate={{ width: `${Math.max(3, (t.dur / fim) * 100)}%`, opacity: 1 }} transition={{ duration: 0.5, delay: reduzir ? 0 : 0.06 * j, ease: [0.22, 1, 0.36, 1] }} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
          <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", nc ? "text-amber-800 dark:text-amber-300" : "text-success")}>
            {nc ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            {nc ? `${nc === 1 ? "1 alerta" : `${nc} alertas`}: resolve${nc === 1 ? "-se" : "m-se"} no Estúdio, num toque` : "Toda a equipa está livre nos dias das tarefas"}
          </span>
          <span className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-transform group-hover:translate-x-0.5">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />Abrir o estúdio<ArrowRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
      </motion.button>
      {aberto && <EstudioPlano ctx={ctx} d={d} fechar={() => setAberto(false)} />}
    </>
  );
}
