// 9/11 (Rúben: «precisamos de criar um estúdio, mas para a validação do plano da obra, todo bonito e animado e super completo»). O Estúdio
// do plano: as Operações validam e ajustam o plano da obra num ecrã só, por cima do negócio (as mudanças vão pelas ações do motor e gravam
// como os outros passos):
//  · em cima, o estado (pagamento, medidas, conflitos) e «Aprovar o plano»; os números da obra (dias, início, fim, pessoas, tarefas);
//  · o calendário por técnico (uma linha por pessoa, os dias úteis em colunas): arrastar uma barra muda o dia, a pega muda os dias; os dias
//    em que a pessoa está de férias ou noutra obra ficam riscados; tocar numa barra abre a tarefa;
//  · a tarefa (à direita): os dias, o início, quem a faz (os livres primeiro), o que se faz (a receita), os materiais, a nota, a fase, tirar;
//  · os alertas, cada um com a correção num toque (passar para quem está livre, adiar); as fases, com os dias de cada uma.
// 10/11 (Rúben): o alerta «noutra obra» diz qual, com a ligação ao Estúdio dela; a tarefa aberta tem a lista do que se pode fazer; «Nova
// tarefa»; a vista em Gantt (uma linha por tarefa, pelas fases) ao lado da por técnico; e «A obra»: as fotografias da visita e o que se
// respondeu antes, em blocos que abrem e fecham.
import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, ArrowUpRight, CalendarDays, CalendarRange, Check, ChevronLeft, ChevronRight, Clock, FolderOpen, Hammer, Lightbulb, Minus, Package, Plus, RotateCcw, Ruler, Trash2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TECS, impactoDasMedidas, impactoDoPlano, medidasRetificadas, nfmt, tot, type Negocio, type Tarefa } from "../motor";
import type { Ctx } from "../pecas";
import { NaFrente } from "../NaFrente";
import { COR_FASE, FASES_OBRA } from "../fasesObra";
import { dataCurta, diasDaObra, isoDia } from "../planoObra";
import { inicioDoPlano, motivoOcupado, obraQueOcupa, ocupacaoDosTecnicos, retificacaoAceite, tecnicosDoOficio } from "../preparacaoObra";
import { NovaTarefa } from "../PlanoInterativo";
import { pelaPermissao, podeNeg } from "../permissoes";
import { InfoDoNegocio } from "./InfoDoNegocio";
import { ImpactoNoOrcamento, linhasDoImpacto, type LinhaImpacto } from "./ImpactoNoOrcamento";
import { materiaisDaTarefa } from "../tarefasValidador";
import { diferencas } from "../ajustesPlano";
import { passosDaTarefa } from "../planoDaVisita";
import { ausenteNoRh } from "../equipa/tecnicos";
import { Contagem, useReduzir } from "../movimento";

const SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const nomeTec = (id: string | null) => TECS.find((x) => x.id === id)?.n ?? "Por atribuir";
const primeiro = (n: string) => n.split(" ")[0];
const COL = 44; // px por dia útil

export function EstudioPlano({ ctx, d, fechar }: { ctx: Ctx; d: Negocio; fechar: () => void }) {
  const { S, A, run } = ctx;
  const reduzir = useReduzir();
  const p = d.obra.plano;
  // o painel da direita: a tarefa aberta, a tarefa nova ou «A obra» (o que se sabe da visita)
  const [painel, setPainel] = useState<{ k: "tarefa"; ti: number } | { k: "nova" } | { k: "info" } | null>(null);
  const sel = painel?.k === "tarefa" ? painel.ti : null;
  const setSel = (ti: number | null) => setPainel(ti == null ? null : { k: "tarefa", ti });
  const [vista, setVista] = useState<"tecnicos" | "gantt">("tecnicos");
  const [outra, setOutra] = useState<Negocio | null>(null); // a outra obra, aberta no Estúdio dela
  const [arrasto, setArrasto] = useState<{ ti: number; tipo: "mover" | "durar"; dx: number } | null>(null);
  const toque = useRef<{ x: number; ti: number; tipo: "mover" | "durar"; dia: number; dur: number } | null>(null);

  const inicio = p ? inicioDoPlano(p) ?? new Date() : new Date();
  const fim = p ? Math.max(1, ...p.tasks.map((t) => t.dia + t.dur)) : 1;
  const dias = useMemo(() => diasDaObra(inicio, fim + 5), [isoDia(inicio), fim]); // eslint-disable-line react-hooks/exhaustive-deps
  const ocup = useMemo(() => ocupacaoDosTecnicos(S, d.id), [S, d.id, S.deals]); // eslint-disable-line react-hooks/exhaustive-deps
  // 11/11: o que as medidas do local mudam no orçamento (refaz o orçamento numa cópia: só quando as medidas mudam, não a cada arrasto)
  const impMedidas = useMemo(() => (d.orc && !d.orc.vendaDireta && d.f.retif_aceite ? impactoDasMedidas(d, S, medidasRetificadas(d)) : null),
    [d.f.retif_aceite, d.orc]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return null;
  const editavel = p.estado === "por aprovar" || p.estado === "aprovado";
  // 10/11: com a obra a andar já não se arrasta, mas ainda se passa a tarefa a outro técnico, se adia e se junta uma tarefa nova
  const podeAgir = editavel || p.estado === "em curso";
  const podeCriar = podeAgir && (S.role === "operacoes" || pelaPermissao(S.role, ["obra.planear"])) && podeNeg(S.role, "obra.planear");
  const ondeEsta = (t: Tarefa) => (t.tec ? obraQueOcupa(S, t.tec, t, p, d.id) : null);
  const podeRepor = p.estado === "por aprovar" && diferencas(p).mexidas.length > 0;
  const motivo = (t: Tarefa, ti: number) => (t.tec ? motivoOcupado(t.tec, t, p, ocup, p.tasks.filter((_, i) => i !== ti)) : null);
  const alertas = p.tasks.map((t, ti) => ({ t, ti, m: t.tec ? motivo(t, ti) : "sem técnico" })).filter((x) => x.m);
  const pessoas = [...new Set(p.tasks.map((t) => t.tec).filter((x): x is string => !!x))];
  const linhas: (string | null)[] = [...pessoas, ...(p.tasks.some((t) => !t.tec) ? [null] : [])];
  const medidasOk = retificacaoAceite(d);
  // 10/11 (Rúben: «medidas antes da fatura»): o plano aprova-se antes do pagamento (com as medidas aceites)
  const planeia = podeNeg(S.role, "obra.planear");
  const podeAprovar = p.estado === "por aprovar" && planeia && medidasOk && !alertas.some((a) => a.m === "de férias");
  const porque = p.estado !== "por aprovar" ? "" : !planeia ? "Quem aprova o plano são as Operações." : !medidasOk ? "Falta o supervisor aceitar as medidas." : alertas.some((a) => a.m === "de férias") ? "Há um técnico de férias numa tarefa." : "";
  const fimData = dias[Math.max(0, fim - 1)];
  const fazer = (fn: () => void) => run(fn);

  // o dia (índice) está ocupado para o técnico fora desta obra (férias do RH, da ficha, ou outra obra)
  const foraDaObra = (tec: string, k: number) => {
    const iso = isoDia(dias[k]);
    return ausenteNoRh(tec, iso) || !!TECS.find((x) => x.id === tec)?.feriasDatas?.includes(iso) || !!ocup.get(tec)?.has(iso);
  };

  const pegar = (e: RPointerEvent, ti: number, tipo: "mover" | "durar") => {
    if (!editavel) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    toque.current = { x: e.clientX, ti, tipo, dia: p.tasks[ti].dia, dur: p.tasks[ti].dur };
    setArrasto({ ti, tipo, dx: 0 });
  };
  const mover = (e: RPointerEvent) => { if (toque.current) setArrasto({ ti: toque.current.ti, tipo: toque.current.tipo, dx: e.clientX - toque.current.x }); };
  const largar = () => {
    const t = toque.current;
    toque.current = null;
    if (!t || !arrasto) { setArrasto(null); return; }
    const passos = Math.round(arrasto.dx / COL);
    setArrasto(null);
    if (!passos) { setSel(t.ti); return; }
    if (t.tipo === "mover") fazer(() => A.ajustarTarefa(d.id, t.ti, { dia: Math.max(0, t.dia + passos) }));
    else fazer(() => A.ajustarTarefa(d.id, t.ti, { dur: Math.max(1, t.dur + passos) }));
  };

  const fases = FASES_OBRA.map((f) => {
    const ts = p.tasks.filter((t) => (t.fase ?? 1) === f.n);
    return { ...f, n: f.n, ts, ini: ts.length ? Math.min(...ts.map((t) => t.dia)) : 0, fim: ts.length ? Math.max(...ts.map((t) => t.dia + t.dur)) : 0 };
  }).filter((f) => f.ts.length);

  // uma barra do calendário (as duas vistas): arrastar muda o dia, a pega muda os dias, as setas também; tocar abre a tarefa
  const barra = (t: Tarefa, ti: number, top: number) => {
    const a = arrasto?.ti === ti ? arrasto : null;
    const dx = a && a.tipo === "mover" ? a.dx : 0, dw = a && a.tipo === "durar" ? a.dx : 0;
    const m = motivo(t, ti);
    return (
      <motion.button key={ti} type="button" layout={!a && !reduzir}
        aria-label={`${t.nome}: ${t.dur} ${t.dur === 1 ? "dia" : "dias"}, a partir de ${dataCurta(dias[t.dia])}${m ? `, ${nomeTec(t.tec)} ${m}` : ""}`}
        onPointerDown={(e) => pegar(e, ti, "mover")} onClick={() => { if (!editavel) setSel(ti); }}
        onKeyDown={(e) => {
          if (!editavel) return;
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const s = e.key === "ArrowRight" ? 1 : -1; fazer(() => A.ajustarTarefa(d.id, ti, e.shiftKey ? { dur: Math.max(1, t.dur + s) } : { dia: Math.max(0, t.dia + s) })); }
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(ti); }
        }}
        className={cn("absolute flex items-center gap-1 overflow-hidden rounded-lg px-2 text-left text-xs font-medium text-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          editavel ? "cursor-grab active:cursor-grabbing" : "cursor-pointer", sel === ti && "ring-2 ring-foreground ring-offset-2 ring-offset-card", m && "ring-2 ring-destructive ring-offset-1 ring-offset-card")}
        style={{ left: t.dia * COL + 2 + dx, width: Math.max(COL - 4, t.dur * COL - 4 + dw), top, height: 28, background: COR_FASE[t.fase ?? 1], touchAction: "none" }}>
        {m && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        <span className="truncate">{t.nome}</span>
        {editavel && <span onPointerDown={(e) => pegar(e, ti, "durar")} aria-hidden="true" className="absolute inset-y-0 right-0 w-3 cursor-ew-resize bg-white/25" />}
      </motion.button>
    );
  };

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
              <Estado ok={medidasOk} t={medidasOk ? "Medidas aceites" : "Medidas por aceitar"} icone={<Ruler className="h-3.5 w-3.5" aria-hidden="true" />} />
              <Estado ok={!alertas.length} t={alertas.length ? `${alertas.length} ${alertas.length === 1 ? "alerta" : "alertas"}` : "Sem alertas"} />
              <span className={cn("rounded-full px-3 py-1 text-sm font-medium", p.estado === "por aprovar" ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200" : "bg-success/15 text-success")}>{p.estado === "por aprovar" ? "Por aprovar" : p.estado === "aprovado" ? "Aprovado" : p.estado}</span>
              {/* 10/11: só com o plano por aprovar e com alguma coisa mudada face ao orçamento (aprovado, mexer avisa e volta a por aprovar) */}
              {podeRepor && <Button type="button" variant="ghost" className="min-h-11" title="Volta ao plano como veio do orçamento" onClick={() => fazer(() => A.reporPlano(d.id))}><RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />Repor</Button>}
              {p.estado === "por aprovar" && (
                <Button type="button" className="min-h-11" disabled={!podeAprovar} title={porque || undefined} onClick={() => fazer(() => A.aprovarPlano(d.id))}>
                  <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Aprovar o plano
                </Button>
              )}
            </div>
          </div>
          {porque && <p className="mx-auto max-w-[1500px] px-4 pb-2 text-sm text-amber-800 dark:text-amber-300 sm:px-6">{porque}</p>}
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-5 sm:px-6">
              {/* ------------------------------------------------------------ os números da obra */}
              <section aria-label="A obra em números" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                <Numero rotulo="Dias úteis" icone={<Clock className="h-4 w-4" />}><Contagem valor={fim} fmt={(n) => String(Math.round(n))} de={0} /></Numero>
                <Numero rotulo="Começa" icone={<CalendarDays className="h-4 w-4" />}>
                  <span className="flex items-center gap-1">
                    {editavel && p.origem === "orcamento" && <button type="button" aria-label="Começar um dia útil antes" className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted" onClick={() => fazer(() => A.inicioPlano(d.id, isoDia(diaUtilAntes(inicio))))}><ChevronLeft className="h-4 w-4" /></button>}
                    <span>{dataCurta(inicio)}</span>
                    {editavel && p.origem === "orcamento" && <button type="button" aria-label="Começar um dia útil depois" className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted" onClick={() => fazer(() => A.inicioPlano(d.id, isoDia(diasDaObra(inicio, 2)[1])))}><ChevronRight className="h-4 w-4" /></button>}
                  </span>
                </Numero>
                <Numero rotulo="Fica pronta" icone={<Check className="h-4 w-4" />}>{fimData ? dataCurta(fimData) : "—"}</Numero>
                <Numero rotulo="Pessoas" icone={<Users className="h-4 w-4" />}><Contagem valor={pessoas.length} fmt={(n) => String(Math.round(n))} de={0} /></Numero>
                <Numero rotulo="Tarefas" icone={<Hammer className="h-4 w-4" />}><Contagem valor={p.tasks.length} fmt={(n) => String(Math.round(n))} de={0} /></Numero>
                <Numero rotulo="Horas" icone={<Clock className="h-4 w-4" />}><Contagem valor={p.tasks.reduce((a, t) => a + t.h, 0)} fmt={(n) => nfmt(Math.round(n))} de={0} /></Numero>
              </section>

              {/* ------------------------------------------------------------ 11/11: o impacto no orçamento, ao vivo (as medidas e o plano) */}
              {(() => {
                if (!d.orc || d.orc.vendaDireta) return null;
                const mi = impMedidas, pi = impactoDoPlano(d, S);
                const L: LinhaImpacto[] = [
                  ...(mi ? linhasDoImpacto(Math.abs(mi.medidas) > 0.004 ? 1 : 0, mi, Math.abs(mi.medidas) > 0.004 || Math.abs(pi.horas) > 0.004).map((x) => (x.l.includes("medida") ? { ...x, l: "Medidas do local" } : x)) : []),
                  ...(Math.abs(pi.horas) > 0.004 ? [{ l: "Ajustes ao plano", sub: `${pi.horas > 0 ? "+" : "−"}${nfmt(Math.abs(pi.horas))} h`, v: pi.semValor ? null : pi.valor }] : []),
                ];
                return <ImpactoNoOrcamento atual={mi?.atual ?? tot(d, S).pf} linhas={L} />;
              })()}

              {/* ------------------------------------------------------------ as fases */}
              <section aria-label="As fases" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {fases.map((f, i) => (
                  <motion.div key={f.n} initial={reduzir ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}
                    className="rounded-xl border border-border bg-card p-3">
                    <p className="flex items-center gap-2 text-sm font-semibold"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: COR_FASE[f.n] }} />{f.n} · {f.curto}</p>
                    <p className="text-xs text-muted-foreground">{f.ts.length} {f.ts.length === 1 ? "tarefa" : "tarefas"} · {dataCurta(dias[f.ini])} a {dataCurta(dias[Math.max(f.ini, f.fim - 1)])}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <motion.div className="h-full rounded-full" style={{ background: COR_FASE[f.n] }} initial={reduzir ? false : { width: 0 }}
                        animate={{ width: `${Math.max(4, ((f.fim - f.ini) / fim) * 100)}%`, marginLeft: `${(f.ini / fim) * 100}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
                    </div>
                  </motion.div>
                ))}
              </section>

              {/* ------------------------------------------------------------ o calendário por técnico */}
              <section aria-label="O calendário por técnico" className="rounded-2xl border border-border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-[15px] font-semibold">{vista === "tecnicos" ? "Quem faz o quê, dia a dia" : "As tarefas, pelas fases"}</h2>
                    <div role="group" aria-label="Vista" className="inline-flex rounded-full border border-input p-0.5">
                      {([["tecnicos", "Por técnico", Users], ["gantt", "Gantt", CalendarRange]] as const).map(([k, l, I]) => (
                        <button key={k} type="button" aria-pressed={vista === k} onClick={() => setVista(k)}
                          className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium", vista === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                          <I className="h-4 w-4" aria-hidden="true" />{l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-xs text-muted-foreground">{editavel ? "Arraste uma barra para mudar o dia; a pega da ponta muda os dias. Riscado: férias ou outra obra." : "A obra já arrancou: toque numa tarefa para a passar a outro técnico ou adiar."}</p>
                    {podeCriar && <Button type="button" size="sm" variant="outline" className="min-h-9" onClick={() => setPainel({ k: "nova" })}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />Nova tarefa</Button>}
                  </div>
                </div>
                <div className="overflow-x-auto" onPointerMove={mover} onPointerUp={largar} onPointerCancel={() => { toque.current = null; setArrasto(null); }}>
                  <div className="min-w-max">
                    {/* os dias */}
                    <div className="sticky top-0 z-10 flex border-b border-border bg-card">
                      <div className="sticky left-0 z-20 w-56 shrink-0 bg-card px-4 py-2 text-xs font-medium text-muted-foreground">{vista === "tecnicos" ? "Técnico" : "Tarefa"}</div>
                      {dias.map((x, k) => (
                        <div key={k} className={cn("shrink-0 py-1.5 text-center text-xs tabular-nums", x.getDay() === 1 && k > 0 && "border-l-2 border-l-foreground/15", k >= fim && "opacity-50")} style={{ width: COL }}>
                          <span className="block text-muted-foreground">{SEM[x.getDay()]}</span><span className="block font-medium">{x.getDate()}</span>
                        </div>
                      ))}
                    </div>
                    {vista === "tecnicos" && linhas.map((tec) => {
                      const ts = p.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => t.tec === tec);
                      // as tarefas da pessoa empilham-se quando se sobrepõem (cada uma na sua faixa)
                      const faixas: number[] = [];
                      const faixa = ts.map(({ t }) => { let f = 0; while (faixas[f] !== undefined && faixas[f] > t.dia) f++; faixas[f] = t.dia + t.dur; return f; });
                      const altura = Math.max(1, faixas.length) * 34 + 12;
                      return (
                        <div key={tec ?? "sem"} className="flex border-b border-border last:border-b-0">
                          <div className="sticky left-0 z-10 flex w-56 shrink-0 items-center gap-2 bg-card px-4 py-2">
                            <span aria-hidden="true" className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold", tec ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>{tec ? nomeTec(tec).split(" ").map((x) => x[0]).slice(0, 2).join("") : "?"}</span>
                            <span className="min-w-0"><span className="block truncate text-sm font-medium">{nomeTec(tec)}</span><span className="block truncate text-xs text-muted-foreground">{tec ? TECS.find((x) => x.id === tec)?.sk : "falta escolher"}</span></span>
                          </div>
                          <div className="relative" style={{ width: dias.length * COL, height: altura }}>
                            {/* os dias riscados (fora desta obra) */}
                            {tec && dias.map((_, k) => foraDaObra(tec, k) && (
                              <div key={k} aria-hidden="true" className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,transparent_0_5px,hsl(var(--destructive)/0.18)_5px_8px)]" style={{ left: k * COL, width: COL }} />
                            ))}
                            {dias.map((x, k) => x.getDay() === 1 && k > 0 && <div key={"s" + k} aria-hidden="true" className="absolute inset-y-0 border-l-2 border-l-foreground/10" style={{ left: k * COL }} />)}
                            {ts.map(({ t, ti }, j) => barra(t, ti, 6 + faixa[j] * 34))}
                          </div>
                        </div>
                      );
                    })}
                    {/* 10/11 (Rúben: «uma vista alternativa de Gantt»): uma linha por tarefa, pela ordem das fases e dos dias */}
                    {vista === "gantt" && fases.map((f) => (
                      <div key={f.n} role="rowgroup" aria-label={`Fase ${f.n} · ${f.curto}`}>
                        <div className="flex border-b border-border bg-muted/40">
                          <div className="sticky left-0 z-10 flex w-56 shrink-0 items-center gap-2 bg-muted/40 px-4 py-1.5 text-xs font-semibold">
                            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: COR_FASE[f.n] }} />{f.n} · {f.curto}
                          </div>
                          <div className="relative" style={{ width: dias.length * COL, height: 28 }}>
                            <div aria-hidden="true" className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full opacity-40" style={{ left: f.ini * COL + 2, width: Math.max(COL - 4, (f.fim - f.ini) * COL - 4), background: COR_FASE[f.n] }} />
                          </div>
                        </div>
                        {f.ts.map((t) => p.tasks.indexOf(t)).sort((x, y) => p.tasks[x].dia - p.tasks[y].dia).map((ti) => {
                          const t = p.tasks[ti];
                          return (
                            <div key={ti} className="flex border-b border-border last:border-b-0">
                              <button type="button" onClick={() => setSel(ti)} className="sticky left-0 z-10 flex w-56 shrink-0 items-center gap-2 bg-card px-4 py-1.5 text-left hover:bg-muted/60">
                                <span className="min-w-0"><span className="block truncate text-sm font-medium">{t.nome}</span><span className="block truncate text-xs text-muted-foreground">{nomeTec(t.tec)} · {t.dur} {t.dur === 1 ? "dia" : "dias"}</span></span>
                              </button>
                              <div className="relative" style={{ width: dias.length * COL, height: 40 }}>
                                {t.tec && dias.map((_, k) => foraDaObra(t.tec!, k) && (
                                  <div key={k} aria-hidden="true" className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,transparent_0_5px,hsl(var(--destructive)/0.18)_5px_8px)]" style={{ left: k * COL, width: COL }} />
                                ))}
                                {dias.map((x, k) => x.getDay() === 1 && k > 0 && <div key={"s" + k} aria-hidden="true" className="absolute inset-y-0 border-l-2 border-l-foreground/10" style={{ left: k * COL }} />)}
                                {p.estado === "em curso" && <div aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-primary" style={{ left: p.dia * COL + COL / 2 }} />}
                                {barra(t, ti, 6)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* ------------------------------------------------------------ os alertas, com a correção */}
              <section aria-label="Alertas e sugestões" className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-[15px] font-semibold">Alertas e sugestões</h2>
                  {/* 10/11: um toque resolve os conflitos de agenda (adia o que for preciso); as escolhas à mão ficam */}
                  {editavel && alertas.some(({ m }) => m === "noutra obra" || m === "de férias") && (
                    <Button type="button" size="sm" className="min-h-9" onClick={() => fazer(() => A.resolverConflitos(d.id))}><Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Resolver tudo</Button>
                  )}
                </div>
                <AnimatePresence initial={false}>
                  {!alertas.length ? (
                    <motion.p key="ok" initial={reduzir ? false : { opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                      className="flex items-center gap-2 rounded-xl bg-success/10 px-4 py-3 text-[15px] text-success"><Check className="h-5 w-5" aria-hidden="true" />Toda a equipa está livre nos dias das suas tarefas.</motion.p>
                  ) : alertas.map(({ t, ti, m }) => {
                    const livres = tecnicosDoOficio(t).filter((x) => x.id !== t.tec && motivoOcupado(x.id, t, p, ocup, p.tasks.filter((_, i) => i !== ti)) == null).slice(0, 3);
                    const onde = m === "noutra obra" ? ondeEsta(t) : null;
                    const acabada = t.exec?.estado === "validada" || t.exec?.estado === "feita";
                    return (
                      <motion.div key={ti} layout={!reduzir} initial={reduzir ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                        className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-2.5 text-sm dark:border-amber-800 dark:bg-amber-950/30">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
                        <span className="min-w-0 flex-1"><b className="font-medium">{t.nome}</b> ({dataCurta(dias[t.dia])}): {!t.tec ? "sem técnico do ofício." : onde
                          ? <>{nomeTec(t.tec)} está na obra <LigacaoObra o={onde} abrir={() => setOutra(onde)} />.</>
                          : `${nomeTec(t.tec)} está ${m}.`}</span>
                        {podeAgir && !acabada && livres.map((x) => <button key={x.id} type="button" className="min-h-9 rounded-full border border-primary/40 bg-card px-3 text-primary hover:bg-primary/[0.06]" onClick={() => fazer(() => A.trocarTec(d.id, ti, x.id))}><Lightbulb className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Passar para {primeiro(x.n)}</button>)}
                        {podeAgir && !acabada && t.tec && m !== "noutra tarefa desta obra" && <button type="button" className="min-h-9 rounded-full border border-input bg-card px-3 hover:bg-muted" onClick={() => fazer(() => A.adiar(d.id, ti))}>Adiar até estar livre</button>}
                        <button type="button" className="min-h-9 rounded-full px-3 text-muted-foreground hover:bg-muted" onClick={() => setSel(ti)}>Abrir</button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </section>
            </div>
          </main>

          {/* ---------------------------------------------------------------- a tarefa aberta */}
          <AnimatePresence>
            {painel && (painel.k !== "tarefa" || p.tasks[painel.ti]) && (
              <motion.aside key={painel.k} aria-label={painel.k === "tarefa" ? "A tarefa" : painel.k === "nova" ? "Nova tarefa" : "A obra"}
                className={cn("absolute inset-y-0 right-0 z-30 w-full overflow-y-auto border-l border-border bg-card shadow-2xl sm:relative sm:z-auto sm:shadow-none", painel.k === "tarefa" ? "max-w-md" : "max-w-xl")}
                initial={reduzir ? false : { x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.2 }}>
                {painel.k === "tarefa" && (
                  <PainelTarefa ctx={ctx} d={d} ti={painel.ti} editavel={editavel} podeAgir={podeAgir} dias={dias} motivo={motivo(p.tasks[painel.ti], painel.ti)}
                    onde={motivo(p.tasks[painel.ti], painel.ti) === "noutra obra" ? ondeEsta(p.tasks[painel.ti]) : null} abrirOutra={setOutra} fechar={() => setPainel(null)} ocup={ocup} />
                )}
                {painel.k === "nova" && <div className="p-4"><NovaTarefa ctx={ctx} d={d} fechar={() => setPainel(null)} /></div>}
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
        </div>
      </motion.div>
      {outra && <EstudioPlano ctx={ctx} d={outra} fechar={() => setOutra(null)} />}
    </NaFrente>
  );
}

/** 10/11: a outra obra (o nome e o serviço), que abre o Estúdio dela. */
function LigacaoObra({ o, abrir }: { o: Negocio; abrir: () => void }) {
  return (
    <button type="button" onClick={abrir} title="Abrir o Estúdio desta obra"
      className="inline-flex items-center gap-0.5 rounded font-medium text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      {o.nome}{o.servico ? ` · ${o.servico}` : ""}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

const diaUtilAntes = (x: Date) => { const y = new Date(x); do { y.setDate(y.getDate() - 1); } while (y.getDay() === 0 || y.getDay() === 6); return y; };

function Estado({ ok, t, icone }: { ok: boolean; t: string; icone?: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm", ok ? "bg-success/10 text-success" : "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200")}>
      {icone ?? (ok ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />)}{t}
    </span>
  );
}

function Numero({ rotulo, icone, children }: { rotulo: string; icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><span aria-hidden="true" className="text-primary">{icone}</span>{rotulo}</p>
      <div className="mt-1 text-xl font-semibold tabular-nums">{children}</div>
    </div>
  );
}

/** A tarefa aberta: os dias, o início, quem a faz, a fase, o que se faz, os materiais, a nota e tirar. */
function PainelTarefa({ ctx, d, ti, editavel, podeAgir, dias, motivo, onde, abrirOutra, fechar, ocup }: {
  ctx: Ctx; d: Negocio; ti: number; editavel: boolean; podeAgir: boolean; dias: Date[]; motivo: string | null; onde: Negocio | null;
  abrirOutra: (o: Negocio) => void; fechar: () => void; ocup: Map<string, Set<string>>;
}) {
  const { S, A, run } = ctx;
  const p = d.obra.plano!, t = p.tasks[ti];
  const [nota, setNota] = useState(t.nota ?? "");
  const [tirar, setTirar] = useState(false);
  const sid = t.svcs[0], s = sid ? S.svc[sid] : undefined;
  const q = s && s.h > 0 ? t.h / s.h : 0;
  const passos = sid ? passosDaTarefa(S, sid, q, t.sk, false) : [];
  const mats = materiaisDaTarefa(t, S.svc);
  const outras = p.tasks.filter((_, i) => i !== ti);
  const quem = TECS.map((x) => ({ x, doOficio: tecnicosDoOficio(t).some((y) => y.id === x.id), m: motivoOcupado(x.id, t, p, ocup, outras) }))
    .sort((a, b) => Number(b.doOficio) - Number(a.doOficio) || Number(!!a.m) - Number(!!b.m));
  const fazer = (fn: () => void) => run(fn);
  // 10/11 (Rúben: «na task ter a lista de ações»): o que se pode fazer com esta tarefa, num sítio só
  const acabada = t.exec?.estado === "validada" || t.exec?.estado === "feita";
  const livres = quem.filter((y) => y.doOficio && !y.m && y.x.id !== t.tec).slice(0, 3);
  const acoes: { k: string; t: string; sub?: string; icone: React.ReactNode; fn: () => void; perigo?: boolean }[] = [
    ...(onde ? [{ k: "outra", t: `Abrir a obra ${onde.nome}`, sub: `Onde ${primeiro(nomeTec(t.tec))} está nestes dias`, icone: <ArrowUpRight className="h-4 w-4" />, fn: () => abrirOutra(onde) }] : []),
    ...(podeAgir && !acabada ? livres.map((y) => ({ k: "p" + y.x.id, t: `Passar para ${y.x.n}`, sub: `${y.x.sk} · livre nestes dias`, icone: <Lightbulb className="h-4 w-4" />, fn: () => fazer(() => A.trocarTec(d.id, ti, y.x.id)) })) : []),
    ...(podeAgir && !acabada && t.tec && motivo && motivo !== "noutra tarefa desta obra" ? [{ k: "adiar", t: "Adiar até estar livre", sub: "Esta tarefa e as seguintes andam os dias que for preciso", icone: <CalendarDays className="h-4 w-4" />, fn: () => fazer(() => A.adiar(d.id, ti)) }] : []),
    ...(editavel ? [
      ...(t.dia > 0 ? [{ k: "antes", t: "Começar um dia antes", sub: `Começa a ${dataCurta(dias[t.dia])}`, icone: <ChevronLeft className="h-4 w-4" />, fn: () => fazer(() => A.ajustarTarefa(d.id, ti, { dia: t.dia - 1 })) }] : []),
      { k: "depois", t: "Começar um dia depois", sub: `Começa a ${dataCurta(dias[t.dia])}`, icone: <ChevronRight className="h-4 w-4" />, fn: () => fazer(() => A.ajustarTarefa(d.id, ti, { dia: t.dia + 1 })) },
      { k: "mais", t: "Mais um dia", sub: `Dura ${t.dur} ${t.dur === 1 ? "dia" : "dias"}`, icone: <Plus className="h-4 w-4" />, fn: () => fazer(() => A.ajustarTarefa(d.id, ti, { dur: t.dur + 1 })) },
      ...(t.dur > 1 ? [{ k: "menos", t: "Menos um dia", sub: `Dura ${t.dur} dias`, icone: <Minus className="h-4 w-4" />, fn: () => fazer(() => A.ajustarTarefa(d.id, ti, { dur: t.dur - 1 })) }] : []),
    ] : []),
    ...(podeAgir && !acabada ? [{ k: "tirar", t: "Tirar do plano", sub: "O técnico é avisado", icone: <Trash2 className="h-4 w-4" />, fn: () => setTirar(true), perigo: true }] : []),
  ];
  return (
    <div className="space-y-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: COR_FASE[t.fase ?? 1] }} />Fase {t.fase ?? 1} · {FASES_OBRA[(t.fase ?? 1) - 1]?.curto}</p>
          <h2 className="text-lg font-semibold leading-snug">{t.nome}</h2>
          <p className="text-sm text-muted-foreground">{dataCurta(dias[t.dia])}{t.dur > 1 ? ` a ${dataCurta(dias[t.dia + t.dur - 1])}` : ""} · {nfmt(t.h)} h</p>
        </div>
        <Button type="button" variant="ghost" className="min-h-10" aria-label="Fechar a tarefa" onClick={fechar}><X className="h-4 w-4" /></Button>
      </div>
      {motivo && <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{nomeTec(t.tec)} {onde ? <>está na obra <LigacaoObra o={onde} abrir={() => abrirOutra(onde)} /> nestes dias.</> : `está ${motivo} nestes dias.`}</span></p>}

      {acoes.length > 0 && (
        <section aria-labelledby="acoes-tarefa" className="space-y-1.5">
          <h3 id="acoes-tarefa" className="text-sm font-medium">O que pode fazer</h3>
          <ul className="overflow-hidden rounded-xl border border-border">
            {acoes.map((x) => (
              <li key={x.k} className="border-b border-border last:border-b-0">
                <button type="button" onClick={x.fn} className={cn("flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none", x.perigo && "text-destructive")}>
                  <span aria-hidden="true" className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", x.perigo ? "bg-destructive/10" : "bg-primary/10 text-primary")}>{x.icone}</span>
                  <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium">{x.t}</span>{x.sub && <span className="block text-sm text-muted-foreground">{x.sub}</span>}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Quem faz</p>
        {podeAgir && !acabada ? (
          <select value={t.tec ?? ""} onChange={(e) => e.target.value && fazer(() => A.trocarTec(d.id, ti, e.target.value))} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-[15px]">
            {!t.tec && <option value="">Escolher…</option>}
            {quem.map(({ x, doOficio, m }) => <option key={x.id} value={x.id}>{x.n} · {x.sk}{doOficio ? "" : " (outro ofício)"}{m ? ` · ${m}` : " · livre"}</option>)}
          </select>
        ) : <p className="text-[15px]">{nomeTec(t.tec)}</p>}
      </div>

      {editavel && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Fase</p>
          <div className="flex gap-2">
            {FASES_OBRA.map((f) => (
              <button key={f.n} type="button" aria-pressed={(t.fase ?? 1) === f.n} title={f.nome} onClick={() => fazer(() => A.moverTarefaPlano(d.id, ti, { fase: f.n }))}
                className={cn("min-h-10 flex-1 rounded-lg border text-sm font-medium", (t.fase ?? 1) === f.n ? "border-transparent text-white" : "border-input hover:bg-muted")} style={(t.fase ?? 1) === f.n ? { background: COR_FASE[f.n] } : undefined}>{f.n}</button>
            ))}
          </div>
        </div>
      )}

      {passos.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-sm font-medium"><Hammer className="h-4 w-4 text-primary" aria-hidden="true" />O que se faz</p>
          <ol className="space-y-1 text-sm">{passos.map((x, k) => <li key={k} className="flex justify-between gap-3 rounded-lg bg-muted/50 px-3 py-1.5"><span>{k + 1}. {x.n}</span><span className="shrink-0 tabular-nums text-muted-foreground">{nfmt(x.h)} h</span></li>)}</ol>
        </div>
      )}
      {mats.length > 0 && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-sm font-medium"><Package className="h-4 w-4 text-primary" aria-hidden="true" />Materiais</p>
          <ul className="space-y-1 text-sm">{mats.map((m) => <li key={m.n} className="flex justify-between gap-3 rounded-lg bg-muted/50 px-3 py-1.5"><span className="min-w-0 truncate">{m.n}</span><span className="shrink-0 tabular-nums text-muted-foreground">{nfmt(m.q)} {m.un}</span></li>)}</ul>
        </div>
      )}

      <label className="grid gap-1.5 text-sm font-medium">Nota para a equipa
        <textarea value={nota} disabled={!editavel} onChange={(e) => setNota(e.target.value)} onBlur={() => nota !== (t.nota ?? "") && fazer(() => A.ajustarTarefa(d.id, ti, { nota }))} rows={2}
          placeholder="Ex.: levar o andaime; a cliente está em casa de manhã" className="rounded-lg border border-input bg-background px-3 py-2 text-[15px]" />
      </label>

      {tirar && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <span className="min-w-0 flex-1">Tirar «{t.nome}» do plano? O técnico é avisado.</span>
          <Button type="button" variant="destructive" className="min-h-10" onClick={() => { fazer(() => A.tirarTarefaPlano(d.id, ti)); fechar(); }}>Tirar</Button>
          <Button type="button" variant="outline" className="min-h-10" onClick={() => setTirar(false)}>Cancelar</Button>
        </div>
      )}
    </div>
  );
}

/** O botão que abre o Estúdio do plano (no passo «Plano da obra»). */
export function AbrirEstudioPlano({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const [aberto, setAberto] = useState(false);
  if (!d.obra.plano) return null;
  return (
    <>
      <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">Estúdio do plano</p>
          <p className="text-sm text-muted-foreground">O calendário por técnico, os alertas com correção num toque, cada tarefa com os passos e os materiais, e aprovar.</p>
        </div>
        <Button type="button" className="min-h-11 shrink-0" onClick={() => setAberto(true)}><CalendarDays className="mr-1.5 h-4 w-4" aria-hidden="true" />Abrir o estúdio</Button>
      </div>
      {aberto && <EstudioPlano ctx={ctx} d={d} fechar={() => setAberto(false)} />}
    </>
  );
}


