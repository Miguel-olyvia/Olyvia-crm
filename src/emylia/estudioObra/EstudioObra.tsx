// 11/11/2026 (Rúben: «precisamos também de usar o Estúdio da obra todo completo e super dinâmico e com muito potencial de dinamismo…
// alertas dentro, atrasos, adiantamentos, imprevistos, etc.»). O Estúdio da obra: acompanhar a execução num ecrã só, por cima do negócio.
//  · em cima, o estado e UM botão principal (arrancar, validar o que está feito, encerrar, ou registar um imprevisto);
//  · os números: o progresso, o dia, quando fica pronta (face ao orçamento), as tarefas, os imprevistos e o valor;
//  · o plano vivo (Gantt): validadas, por validar, em curso (a encher), atrasadas (com os dias a mais), paradas, por começar; a linha do
//    previsto no orçamento por baixo de cada barra e o «hoje»;
//  · «E se…?»: um atraso numa tarefa, «Replanear» ou «Adiantar com a folga» mostram-se primeiro no Gantt (as barras andam), com o impacto
//    na data de fim e nas outras obras dos mesmos técnicos; aplicar fica nos ajustes da obra e avisa os técnicos (e o cliente, se se quiser);
//  · os alertas, cada um com o próximo passo; os imprevistos (com fotografias, custo e dias, e o impacto no prazo e no orçamento antes de
//    registar; com custo, a adenda vai logo ao cliente); a atividade (os ajustes ao plano).
// A lógica está em planoVivo.ts e alertasObra.ts; as mudanças vão pelas ações do motor (A.replanearObra, A.registarImprevisto…).
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, ArrowUpRight, CalendarCheck, CalendarRange, Camera, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Euro, FastForward, Flag, Flame, Gauge, HardHat, Lightbulb, ListChecks, Lock, MessageSquare, Minus, Package, Pause, Plus, Rocket, RotateCcw, Shuffle, Sparkles, TrendingUp, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { comRelogioReal, eur, nfmt, type Negocio, type Plano, type Tarefa } from "../motor";
import type { Ctx } from "../pecas";
import { NaFrente } from "../NaFrente";
import { COR_FASE, FASES_OBRA } from "../fasesObra";
import { dataCurta, diasDaObra, isoDia } from "../planoObra";
import { blocosForaDaObra, faltaParaArrancar, inicioDoPlano, motivoOcupado, obraQueOcupa, obrasDosTecnicos, ocupacaoDosTecnicos, tecnicosDoOficio } from "../preparacaoObra";
import { materiaisPorFase, porValidar, progresso } from "../obraOps";
import { enviosDe, MOTIVOS_AJUSTE } from "../trabalhoObra";
import { fimDe } from "../ajustesPlano";
import { faltaParaEncerrar } from "../encerrarObra";
import { atrasar, imprevistosDe, tarefasAfetaveis, GRAVIDADES, type Gravidade } from "../imprevistos";
import { diasAdenda, precoSugeridoLivre, totaisLinhas, valorContrato, type LinhaAdenda } from "../adendas";
import { podeNeg } from "../permissoes";
import { useInventario } from "../inventario/loja";
import { resumoEcNegocio } from "../inventario/ponteNegocios";
import { ImprevistosNaObra } from "../ImprevistosObra";
import { AvatarTec, Miniaturas, nomeTec } from "../AcompanhamentoObra";
import { lerFoto } from "../ObraOperacoes";
import { Contagem, MOLA, useReduzir } from "../movimento";
import { EstudioPlano, PainelTarefa } from "../estudioPlano/EstudioPlano";
import { NovaTarefa } from "../PlanoInterativo";
import { porqueNaoMexe, TECS } from "../motor";
import { ausenteNoRh } from "../equipa/tecnicos";
import { Aba, ClienteDaObra, EquipaDaObra, Execucao, ExecucaoTarefa, FechoDaObra, MateriaisDaObra } from "./PaineisObra";
import { AgendaEquipa, ComandoHoje, DiarioObra, Entregas, FechoVivo, PontoDaSemana, PrevisaoViva, Pulso, precisaDeTi, obraViva, type Ir } from "./ComandoObra";
import { ROTULO_VIVO, conflitosNovos, rotuloVivo, dataDoDia, derrapagem, diasDeAtraso, estadoVivo, feitoDe, replanear, replanoDe, simularAtraso, type ConflitoFora, type EstadoVivo, type Replano } from "./planoVivo";
import { alertasDaObra, type AcaoAlerta, type Alerta } from "./alertasObra";

const SEM = ["D", "S", "T", "Q", "Q", "S", "S"];
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const COL = 38; // px por dia útil
const LINHA = 46;
const primeiro = (n: string) => n.split(" ")[0];
const dd = (n: number) => `${n} ${Math.abs(n) === 1 ? "dia útil" : "dias úteis"}`;

type Previa = { titulo: string; k: "replanear"; adiantar: boolean } | { titulo: string; k: "atraso"; ti: number; dias: number };
type Painel = { k: "tarefa"; ti: number } | { k: "imprevisto"; ti?: number } | { k: "nova"; inicial?: { dia?: number; tec?: string | null } } | null;
type AbaObra = "plano" | "execucao" | "diario" | "materiais" | "equipa" | "cliente" | "fecho";
type Retrato = { dia: number; dur: number; h: number; tec: string | null }[];

const COR_VIVO: Record<EstadoVivo, string> = {
  validada: "hsl(var(--success))", feita: "#d97706", corrigir: "hsl(var(--destructive))", parada: "#64748b",
  pausada: "#64748b", atrasada: "", "em curso": "", hoje: "", "por começar": "",
};

export function EstudioObra({ ctx, d, fechar }: { ctx: Ctx; d: Negocio; fechar: () => void }) {
  const { S, A, run } = ctx;
  const reduzir = useReduzir();
  const p = d.obra.plano;
  const db = useInventario();
  const inv = d.obra.ec?.ref ? resumoEcNegocio(db, d.obra.ec.ref) : null;
  const [painel, setPainel] = useState<Painel>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [outra, setOutra] = useState<Negocio | null>(null);
  // o imprevisto a ser registado (painel): o atraso dele mostra-se já no plano vivo, sem a caixa de aplicar
  const [fantasma, setFantasma] = useState<Plano | null>(null);
  const imprevistosRef = useRef<HTMLElement>(null);
  const comandoRef = useRef<HTMLElement>(null), previsaoRef = useRef<HTMLElement>(null);
  // 11/11 (Rúben: «gerir tudo por completo»): os separadores, a vista do plano e o «Desfazer» das mudanças ao plano
  const [aba, setAba] = useState<AbaObra>("plano");
  const [vista, setVista] = useState<"gantt" | "tecnicos">("gantt");
  const [desfazer, setDesfazer] = useState<{ snap: Retrato; ti: number; n: number } | null>(null);
  useEffect(() => { if (!desfazer) return; const t = setTimeout(() => setDesfazer(null), 7000); return () => clearTimeout(t); }, [desfazer?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  const obras = useMemo(() => obrasDosTecnicos(S, d.id), [S, d.id, S.deals, painel, desfazer]); // eslint-disable-line react-hooks/exhaustive-deps
  // Esc fecha o que está por cima: o painel, depois a pré-visualização, depois o Estúdio (com outra obra aberta, é ela que fecha)
  useEffect(() => {
    if (outra) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (painel) setPainel(null); else if (previa) setPrevia(null); else fechar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [painel, previa, outra, fechar]);

  if (!p) return null;
  // as outras obras (para os técnicos noutra obra): lê-se a cada desenho, porque o estado muda no sítio
  const ocup = ocupacaoDosTecnicos(S, d.id);
  const R: Replano | null = previa ? (previa.k === "atraso" ? simularAtraso(p, previa.ti, previa.dias, ocup) : replanear(p, ocup, { adiantar: previa.adiantar }))
    : fantasma && painel?.k === "imprevisto" ? replanoDe(p, fantasma) : null;
  const fora: ConflitoFora[] = R ? conflitosNovos(S, d, R.plano) : [];
  const alertas = alertasDaObra(d, S, ocup, inv);
  const vivo = p.estado === "em curso", acabou = p.estado === "concluída";
  const planeia = podeNeg(S.role, "obra.planear");
  const fim = Math.max(1, fimDe(p.tasks)), der = derrapagem(p);
  const fimR = R ? R.fimDepois : fim;
  const inicio = inicioDoPlano(p) ?? new Date();
  // 12/11: os números vivos (a previsão vai além do fim do plano: as datas têm de chegar lá)
  const viva = obraViva(d, S);
  const nDias = Math.max(fim, fimR, p.base ? fimDe(p.base) : 0, viva.prev ? viva.prev.ate : 0) + 3;
  const dias = diasDaObra(inicio, nDias);
  const PV = porValidar(p);
  const falta = vivo ? faltaParaEncerrar(d, S, db) : [];
  const faltaArrancar = p.estado === "aprovado" ? faltaParaArrancar(d, db) : [];
  const ims = imprevistosDe(d), imsAbertos = ims.filter((i) => i.estado !== "fechado" && i.estado !== "aprovado");
  const val = (() => { try { return valorContrato(d, S); } catch { return null; } })();
  const custoPend = ims.filter((i) => i.estado === "aberto" || i.estado === "proposta").reduce((a, i) => a + (i.custo ?? 0), 0);
  const validadas = p.tasks.filter((t) => acabou || estadoVivo(t, p) === "validada").length;
  const fazer = (fn: () => void) => run(fn);
  // cada mudança ao plano guarda o retrato de antes, para «Desfazer» (só se mudou mesmo)
  const retrato = (): Retrato => p.tasks.map((t) => ({ dia: t.dia, dur: t.dur, h: t.h, tec: t.tec }));
  const mudar = (ti: number, fn: () => void) => {
    const snap = retrato(), n0 = p.tasks.length;
    fazer(fn);
    if (p.tasks.length === n0 && JSON.stringify(retrato()) !== JSON.stringify(snap)) setDesfazer({ snap, ti, n: Date.now() });
  };
  const deFerias = (tec: string, iso: string) => ausenteNoRh(tec, iso) || !!TECS.find((y) => y.id === tec)?.feriasDatas?.includes(iso);
  const foraDaObra = (tec: string, k: number) => { const x = dias[k]; if (!x) return false; const iso = isoDia(x); return deFerias(tec, iso) || !!ocup.get(tec)?.has(iso); };
  const podeMexer = (ti: number) => planeia && !acabou && !porqueNaoMexe(p, ti);
  const podeCriar = planeia && !acabou;
  const n = {
    execucao: p.tasks.filter((t) => ["feita", "atrasada", "corrigir"].includes(estadoVivo(t, p))).length,
    materiais: alertas.filter((x) => x.id.startsWith("mat-")).length,
    equipa: alertas.filter((x) => x.id.startsWith("conflito-") || x.id.startsWith("sem-")).length,
    cliente: (d.obra.chat ?? []).filter((m) => m.de === "cliente" && !m.lida).length + (d.adendas ?? []).filter((a) => a.estado === "enviada" || a.estado === "recusada").length,
    fecho: vivo ? falta.length : 0,
  };

  const verImprevisto = (id: string) => {
    imprevistosRef.current?.scrollIntoView({ behavior: reduzir ? "auto" : "smooth", block: "start" });
    window.setTimeout(() => (document.querySelector(`[aria-label="Imprevisto ${id}"]`) as HTMLElement | null)?.focus?.(), 300);
  };
  const agir = (a: AcaoAlerta) => {
    switch (a.k) {
      case "prolongar": setPainel(null); setPrevia({ titulo: `Pôr ${(p.tasks[a.ti]?.nome ?? "a tarefa").toLowerCase()} em dia`, k: "replanear", adiantar: false }); break;
      case "validar": fazer(() => A.validarTarefa(d.id, a.ti)); break;
      case "tarefa": setPainel({ k: "tarefa", ti: a.ti }); break;
      case "imprevisto": verImprevisto(a.id); break;
      case "passar": mudar(a.ti, () => A.trocarTec(d.id, a.ti, a.tec)); break;
      case "outra": setOutra(a.obra); break;
      case "replanear": setPainel(null); setPrevia({ titulo: "Replanear a obra", k: "replanear", adiantar: true }); break;
      case "adiantar": setPainel(null); setPrevia({ titulo: "Adiantar com a folga", k: "replanear", adiantar: true }); break;
      case "conversa": setAba("cliente"); break;
      case "materiais": setAba("materiais"); break;
    }
  };

  // 12/11: o que as peças vivas (pulso, comando, previsão, agenda, diário) usam para levar cada coisa ao sítio dela
  const rolar = (r: React.RefObject<HTMLElement>) => window.setTimeout(() => r.current?.scrollIntoView({ behavior: reduzir ? "auto" : "smooth", block: "start" }), 60);
  const ir: Ir = {
    tarefa: (ti) => setPainel({ k: "tarefa", ti }), aba: (x) => setAba(x), outra: setOutra,
    replanear: () => { setPainel(null); setAba("plano"); setPrevia({ titulo: "Pôr a obra em dia", k: "replanear", adiantar: true }); },
    imprevisto: (id) => { setAba("plano"); if (id) window.setTimeout(() => verImprevisto(id), 80); else rolar(imprevistosRef); },
    previsao: () => { setAba("plano"); rolar(previsaoRef); }, comando: () => rolar(comandoRef),
  };
  const pedidos = precisaDeTi(ctx, d, ir);
  // o botão principal: um só, pelo momento da obra
  const principal = p.estado === "aprovado"
    ? { t: "Arrancar a obra", icone: Rocket, desligado: faltaArrancar.length > 0 || !planeia, porque: faltaArrancar.length ? `Falta ${faltaArrancar.join(", ")}.` : !planeia ? "Quem arranca a obra são as Operações." : "", fn: () => fazer(() => A.arrancar(d.id)) }
    : vivo && PV.length ? { t: PV.length === 1 ? "Validar a tarefa feita" : `Validar ${PV.length} tarefas feitas`, icone: CheckCircle2, desligado: !planeia, porque: "", fn: () => fazer(() => A.validarVarias(d.id, PV)) }
    : vivo && !falta.length ? { t: "Encerrar a obra", icone: CalendarCheck, desligado: !planeia, porque: "", fn: () => fazer(() => A.fimObra(d.id)) }
    : vivo ? { t: "Registar imprevisto", icone: AlertTriangle, desligado: false, porque: "", fn: () => setPainel({ k: "imprevisto" }) }
    : null;

  return (
    <NaFrente>
      <motion.div className="fixed inset-0 flex flex-col overflow-hidden bg-background" role="dialog" aria-modal="true" aria-labelledby="estudio-obra-titulo"
        initial={reduzir ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}>
        {/* ---------------------------------------------------------------- o cabeçalho */}
        <header className="border-b border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Button type="button" variant="outline" className="min-h-11 shrink-0" onClick={fechar} aria-label="Voltar ao negócio"><ArrowLeft className="h-4 w-4 sm:mr-1.5" aria-hidden="true" /><span className="hidden sm:inline">Voltar ao negócio</span></Button>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Estúdio da obra</p>
                <h1 id="estudio-obra-titulo" className="truncate text-xl font-semibold tracking-tight">{d.nome} · {d.servico || "Obra"}</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Saude p={p} der={der} />
              {vivo && !comRelogioReal() && (
                <span role="group" aria-label="Dia da obra (simulação)" className="inline-flex items-center rounded-full border border-input">
                  <button type="button" aria-label="Dia anterior" disabled={p.dia <= 0} onClick={() => fazer(() => A.irParaDia(d.id, p.dia - 1))} className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                  <span className="px-1 text-sm tabular-nums">Dia {p.dia + 1}</span>
                  <button type="button" aria-label="Dia seguinte" onClick={() => fazer(() => A.irParaDia(d.id, p.dia + 1))} className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
                </span>
              )}
              {vivo && planeia && <Button type="button" variant="outline" className="min-h-11 px-3 sm:px-4" aria-label="Replanear" onClick={() => { setPainel(null); setPrevia({ titulo: "Replanear a obra", k: "replanear", adiantar: true }); }}><Shuffle className="h-4 w-4 sm:mr-1.5" aria-hidden="true" /><span className="hidden sm:inline">Replanear</span></Button>}
              {vivo && principal?.t !== "Registar imprevisto" && <Button type="button" variant="outline" className="min-h-11 px-3 sm:px-4" aria-label="Registar imprevisto" onClick={() => setPainel({ k: "imprevisto" })}><AlertTriangle className="h-4 w-4 sm:mr-1.5" aria-hidden="true" /><span className="hidden sm:inline">Imprevisto</span></Button>}
              {principal && <Button type="button" className="min-h-11" disabled={principal.desligado} title={principal.porque || undefined} onClick={principal.fn}><principal.icone className="mr-1.5 h-4 w-4" aria-hidden="true" />{principal.t}</Button>}
            </div>
          </div>
          {principal?.porque && <p className="mx-auto max-w-[1500px] px-4 pb-2 text-sm text-amber-800 dark:text-amber-300 sm:px-6">{principal.porque}</p>}
        </header>

        <div className="relative flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-5 sm:px-6">
              {/* ------------------------------------------------------------ 12/11: o pulso (os números, que se tocam) e o comando de hoje */}
              {viva.prev && <Pulso d={d} S={S} dias={dias} prev={viva.prev} margem={viva.margem} precisa={pedidos.length} ir={ir} />}
              {(vivo || p.estado === "aprovado") && <ComandoHoje ctx={ctx} d={d} dias={dias} pedidos={pedidos} ir={ir} comandoRef={comandoRef} />}

              {/* ------------------------------------------------------------ «E se…?»: a pré-visualização, antes de aplicar */}
              <AnimatePresence>
                {previa && R && <PreviaPlano key="previa" ctx={ctx} d={d} previa={previa} setPrevia={setPrevia} R={R} fora={fora} dias={dias} abrirOutra={setOutra} ocup={ocup} />}
              </AnimatePresence>

              {/* ------------------------------------------------------------ 11/11: os separadores (o plano, a execução, os materiais, a equipa, o cliente, o fecho) */}
              <div role="tablist" aria-label="O que gerir" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
                <Aba on={aba === "plano"} rot="Plano" n={alertas.length} aviso onClick={() => setAba("plano")} icone={<CalendarRange className="h-4 w-4" />} />
                <Aba on={aba === "execucao"} rot="Execução" n={n.execucao} aviso onClick={() => setAba("execucao")} icone={<ListChecks className="h-4 w-4" />} />
                <Aba on={aba === "diario"} rot="Diário" onClick={() => setAba("diario")} icone={<Camera className="h-4 w-4" />} />
                <Aba on={aba === "materiais"} rot="Materiais" n={n.materiais} aviso onClick={() => setAba("materiais")} icone={<Package className="h-4 w-4" />} />
                <Aba on={aba === "equipa"} rot="Equipa" n={n.equipa} aviso onClick={() => setAba("equipa")} icone={<Users className="h-4 w-4" />} />
                <Aba on={aba === "cliente"} rot="Cliente" n={n.cliente} aviso onClick={() => setAba("cliente")} icone={<MessageSquare className="h-4 w-4" />} />
                <Aba on={aba === "fecho"} rot="Fecho" n={n.fecho} onClick={() => setAba("fecho")} icone={<Flag className="h-4 w-4" />} />
              </div>
              {/* troca logo (sem esperar pela saída do anterior), com uma entrada curta */}
              <motion.div key={aba} role="tabpanel" initial={reduzir ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
                  {aba === "plano" && <>
                  {viva.prev && !previa && <PrevisaoViva d={d} dias={dias} prev={viva.prev} margem={viva.margem} critico={viva.critico} ir={ir} previsaoRef={previsaoRef} />}
              {/* ------------------------------------------------------------ o plano vivo */}
              <GanttVivo titulo={previa ? "O plano, se aplicar" : R ? "O plano, com o imprevisto" : "O plano vivo"} p={p} R={R} dias={dias} sel={painel?.k === "tarefa" ? painel.ti : null} abrir={(ti) => setPainel({ k: "tarefa", ti })} imprevistos={ims.map((i) => ({ id: i.id, dia: i.dia, texto: i.texto }))} reduzir={reduzir}
                vista={vista} setVista={setVista} podeMexer={podeMexer} mover={(ti, m) => mudar(ti, () => A.ajustarTarefa(d.id, ti, m))}
                nova={podeCriar ? (dia, tec) => setPainel({ k: "nova", inicial: { dia, tec } }) : undefined} obras={obras} deFerias={deFerias} abrirOutra={setOutra}
                critico={viva.critico} passar={planeia && !acabou ? (ti, tec) => mudar(ti, () => A.trocarTec(d.id, ti, tec)) : undefined} />

              <div className="grid gap-6 lg:grid-cols-2">
                {/* ------------------------------------------------------------ os alertas */}
                <section aria-label="Alertas" className="space-y-2">
                  <h2 className="flex items-center gap-2 text-[15px] font-semibold">Alertas {alertas.length > 0 && <span className="rounded-full bg-muted px-2 text-sm font-medium tabular-nums">{alertas.length}</span>}</h2>
                  <AnimatePresence initial={false}>
                    {!alertas.length ? (
                      <motion.p key="ok" initial={reduzir ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 rounded-xl bg-success/10 px-4 py-3 text-[15px] text-success">
                        <Check className="h-5 w-5" aria-hidden="true" />{acabou ? "Obra concluída." : "Tudo em dia: nada atrasado, nada à espera."}
                      </motion.p>
                    ) : alertas.map((a) => <CartaoAlerta key={a.id} a={a} agir={agir} reduzir={reduzir} />)}
                  </AnimatePresence>
                </section>

                {/* ------------------------------------------------------------ os imprevistos */}
                <section ref={imprevistosRef} aria-label="Imprevistos" className="scroll-mt-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-[15px] font-semibold">Imprevistos</h2>
                    {vivo && <Button type="button" size="sm" variant="outline" className="min-h-9" onClick={() => setPainel({ k: "imprevisto" })}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />Registar</Button>}
                  </div>
                  {imsAbertos.length ? <ImprevistosNaObra ctx={ctx} d={d} /> : <p className="rounded-xl bg-muted/50 px-4 py-3 text-[15px] text-muted-foreground">{ims.length ? "Os imprevistos estão todos tratados." : "Sem imprevistos. Se aparecer um problema na obra, registe-o aqui: vê logo o impacto no prazo e no valor."}</p>}
                  {ims.filter((i) => i.estado === "fechado" || i.estado === "aprovado").length > 0 && (
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {ims.filter((i) => i.estado === "fechado" || i.estado === "aprovado").map((i) => <li key={i.id} className="flex items-center gap-2"><Check className="h-4 w-4 text-success" aria-hidden="true" />{i.texto} · {i.estado === "aprovado" ? `aprovado (${i.adenda})` : i.decisao ?? "fechado"}</li>)}
                    </ul>
                  )}
                </section>
              </div>

              {/* ------------------------------------------------------------ a atividade: os ajustes ao plano */}
              {(d.obra.alteracoes ?? []).length > 0 && (
                <section aria-label="O que mudou no plano" className="space-y-2">
                  <h2 className="text-[15px] font-semibold">O que mudou no plano</h2>
                  <ol className="relative space-y-3 border-l-2 border-border pl-5">
                    {(d.obra.alteracoes ?? []).slice(0, 8).map((x, k) => (
                      <li key={k} className="relative">
                        <span aria-hidden="true" className={cn("absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ring-4 ring-background", x.fimAntes === x.fimDepois ? "bg-muted-foreground/50" : "bg-amber-500")} />
                        <p className="text-[15px]">{x.t} <span className="text-muted-foreground">· {x.motivo}</span></p>
                        <p className="text-sm text-muted-foreground">{x.q} · {x.quem} · {x.fimAntes === x.fimDepois ? "o fim mantém-se" : `fim: ${x.fimAntes} → ${x.fimDepois}`}{x.cliente ? " · cliente avisado" : ""}</p>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
                  </>}
                  {aba === "execucao" && <Execucao ctx={ctx} d={d} dias={dias} abrir={(ti) => setPainel({ k: "tarefa", ti })} />}
                  {aba === "diario" && <DiarioObra d={d} ir={ir} />}
                  {aba === "materiais" && <><Entregas d={d} /><MateriaisDaObra ctx={ctx} d={d} /></>}
                  {aba === "equipa" && <AgendaEquipa ctx={ctx} d={d} dias={dias} ir={ir} />}
                  {aba === "equipa" && <EquipaDaObra ctx={ctx} d={d} dias={dias} abrirOutra={setOutra} abrir={(ti) => setPainel({ k: "tarefa", ti })} novaPara={(tec) => setPainel({ k: "nova", inicial: { tec, dia: vivo ? p.dia : undefined } })} />}
                  {aba === "cliente" && <>{vivo && <PontoDaSemana ctx={ctx} d={d} dias={dias} />}<ClienteDaObra ctx={ctx} d={d} /></>}
                  {aba === "fecho" && <><FechoDaObra ctx={ctx} d={d} irPara={setAba} /><FechoVivo d={d} ir={ir} /></>}
              </motion.div>
            </div>
          </main>

          {/* ---------------------------------------------------------------- o painel da direita */}
          <AnimatePresence>
            {painel && (painel.k !== "tarefa" || p.tasks[painel.ti]) && (
              <motion.aside key={painel.k + (painel.k === "tarefa" ? painel.ti : "")} aria-label={painel.k === "tarefa" ? "A tarefa" : painel.k === "imprevisto" ? "Registar imprevisto" : "Nova tarefa"}
                className="absolute inset-0 z-30 w-full overflow-y-auto border-l border-border bg-card shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-w-lg lg:relative lg:z-auto lg:shadow-none"
                initial={reduzir ? false : { x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.2 }}>
                {painel.k === "tarefa" && (() => {
                  const t = p.tasks[painel.ti], m = t.tec ? motivoOcupado(t.tec, t, p, ocup, p.tasks.filter((_, i) => i !== painel.ti)) : null;
                  const onde = m === "noutra obra" && t.tec ? obraQueOcupa(S, t.tec, t, p, d.id) : null;
                  return (
                    <PainelTarefa key={painel.ti} ctx={ctx} d={d} ti={painel.ti} editavel={podeMexer(painel.ti)} podeAgir={planeia && !acabou} dias={dias} motivo={m} onde={onde}
                      abrirOutra={setOutra} fechar={() => setPainel(null)} ocup={ocup} mudar={mudar} foraDaObra={foraDaObra} minDia={vivo ? p.dia : 0} notaLivre={planeia && !acabou}
                      extra={<ExecucaoTarefa ctx={ctx} d={d} ti={painel.ti} imprevisto={() => setPainel({ k: "imprevisto", ti: painel.ti })}
                        simular={(n) => setPrevia(n ? { titulo: `${t.nome}: mais ${n} ${n === 1 ? "dia" : "dias"}`, k: "atraso", ti: painel.ti, dias: n } : null)}
                        simulado={previa?.k === "atraso" && previa.ti === painel.ti ? previa.dias : 0} />} />
                  );
                })()}
                {painel.k === "nova" && <div className="p-4"><NovaTarefa key={JSON.stringify(painel.inicial ?? {})} ctx={ctx} d={d} inicial={painel.inicial} fechar={() => setPainel(null)} /></div>}
                {painel.k === "imprevisto" && <NovoImprevisto ctx={ctx} d={d} ti={painel.ti} ocup={ocup} fechar={() => setPainel(null)} mostrar={setFantasma} />}
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
                      ? <><b className="font-semibold">{p.tasks[desfazer.ti].nome}</b>: {dias[p.tasks[desfazer.ti].dia] ? dataCurta(dias[p.tasks[desfazer.ti].dia]) : ""}, {p.tasks[desfazer.ti].dur} {p.tasks[desfazer.ti].dur === 1 ? "dia" : "dias"}{p.tasks[desfazer.ti].tec ? ` · ${primeiro(nomeTec(p.tasks[desfazer.ti].tec))}` : ""}</>
                      : <>Plano mudado · fica pronta a {dias[fim - 1] ? dataCurta(dias[fim - 1]) : "—"}</>}
                  </span>
                  <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-background/15 px-3 font-medium hover:bg-background/25"
                    onClick={() => { const s0 = desfazer.snap; setDesfazer(null); fazer(() => A.reporTarefasPlano(d.id, s0)); }}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />Desfazer
                  </button>
                  <button type="button" aria-label="Fechar" className="grid h-9 w-9 place-items-center rounded-xl hover:bg-background/15" onClick={() => setDesfazer(null)}><X className="h-4 w-4" /></button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
      {outra && (outra.obra.plano?.estado === "em curso" || outra.obra.plano?.estado === "concluída"
        ? <EstudioObra ctx={ctx} d={outra} fechar={() => setOutra(null)} />
        : <EstudioPlano ctx={ctx} d={outra} fechar={() => setOutra(null)} />)}
    </NaFrente>
  );
}

/* ================================================================== peças pequenas */
function Saude({ p, der }: { p: Plano; der: number }) {
  const atras = p.tasks.filter((t) => estadoVivo(t, p) === "atrasada").length;
  const [t, tom] = p.estado === "concluída" ? ["Concluída", "ok"] : p.estado === "aprovado" ? ["Plano aprovado · por arrancar", "neutro"] : p.estado === "por aprovar" ? ["Plano por aprovar", "aviso"]
    : atras ? [`${atras} ${atras === 1 ? "tarefa atrasada" : "tarefas atrasadas"}`, "mau"] : der > 0 ? [`+${dd(der)} face ao orçamento`, "aviso"] : der < 0 ? [`${dd(-der)} adiantada`, "ok"] : ["Em curso · no prazo", "ok"];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium",
      tom === "ok" ? "bg-success/10 text-success" : tom === "mau" ? "bg-destructive/10 text-destructive" : tom === "aviso" ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200" : "bg-muted text-foreground")}>
      {tom === "ok" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : tom === "neutro" ? <HardHat className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}{t}
    </span>
  );
}

function Numero({ rotulo, icone, children, sub, tom }: { rotulo: string; icone: React.ReactNode; children: React.ReactNode; sub?: string; tom?: "bom" | "mau" }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><span aria-hidden="true" className="text-primary">{icone}</span>{rotulo}</p>
      <div className="mt-1 overflow-hidden whitespace-nowrap text-xl font-semibold tabular-nums">{children}</div>
      {sub && <p className={cn("truncate text-xs", tom === "mau" ? "font-medium text-destructive" : tom === "bom" ? "font-medium text-success" : "text-muted-foreground")}>{sub}</p>}
    </div>
  );
}

const NIVEL = {
  critico: { cx: "border-destructive/40 bg-destructive/[0.05]", ic: "text-destructive", I: AlertTriangle },
  atencao: { cx: "border-amber-300/60 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30", ic: "text-amber-700 dark:text-amber-300", I: Clock },
  oportunidade: { cx: "border-success/40 bg-success/[0.06]", ic: "text-success", I: Sparkles },
} as const;
function CartaoAlerta({ a, agir, reduzir }: { a: Alerta; agir: (x: AcaoAlerta) => void; reduzir: boolean }) {
  const N = NIVEL[a.nivel];
  return (
    <motion.div initial={reduzir ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
      role="group" aria-label={a.t} className={cn("rounded-xl border px-4 py-3", N.cx)}>
      <div className="flex gap-3">
        <N.I className={cn("mt-0.5 h-5 w-5 shrink-0", N.ic)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">{a.t}</p>
          {a.sub && <p className="text-sm text-muted-foreground">{a.sub}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {a.acoes.map((x, k) => (
              <button key={k} type="button" onClick={() => agir(x.a)}
                className={cn("min-h-9 rounded-full px-3 text-sm font-medium", k === 0 ? "bg-foreground text-background hover:bg-foreground/90" : "border border-input bg-card hover:bg-muted")}>
                {x.a.k === "passar" && <Lightbulb className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}{x.a.k === "outra" && <ArrowUpRight className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}{x.rot}
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ================================================================== o plano vivo (Gantt e por técnico) */
// 11/11 (Rúben: «gerir tudo por completo, mais ainda do que na aprovação»): as tarefas que ainda não começaram arrastam-se (o dia) e a ponta
// muda os dias, como no Estúdio do plano; na vista por técnico, por baixo das tarefas, onde a pessoa está fora desta obra (outra obra, que
// abre o Estúdio dela, ou férias) e, num dia vazio, «+» cria uma tarefa para essa pessoa nesse dia.
type Arrasto = { ti: number; tipo: "mover" | "durar"; dx: number; dy: number };
function GanttVivo({ titulo, p, R, dias, sel, abrir, imprevistos, reduzir, vista, setVista, podeMexer, mover: moverTarefa, nova, obras, deFerias, abrirOutra, critico, passar }: {
  titulo: string; p: Plano; R: Replano | null; dias: Date[]; sel: number | null; abrir: (ti: number) => void; imprevistos: { id: string; dia: number; texto: string }[]; reduzir: boolean;
  vista: "gantt" | "tecnicos"; setVista: (v: "gantt" | "tecnicos") => void; podeMexer: (ti: number) => boolean;
  mover: (ti: number, m: { dia?: number; dur?: number }) => void; nova?: (dia: number, tec: string | null) => void;
  obras: Map<string, Map<string, Negocio>>; deFerias: (tec: string, iso: string) => boolean; abrirOutra: (o: Negocio) => void;
  /** 12/11: as tarefas sem folga (realçadas) e passar uma tarefa a outra pessoa (arrastar para a linha dela, na vista por técnico) */
  critico: Set<number>; passar?: (ti: number, tec: string) => void;
}) {
  const vivo = p.estado === "em curso";
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const toque = useRef<{ x: number; y: number; ti: number; tipo: "mover" | "durar" } | null>(null);
  const [sob, setSob] = useState<{ k: number; tec: string | null } | null>(null);
  const largouEm = useRef(0); // o clique logo a seguir a um arrasto não abre a tarefa
  const fases = FASES_OBRA.map((f) => ({ ...f, tis: p.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => (t.fase ?? 1) === f.n).sort((a, b) => a.t.dia - b.t.dia).map((x) => x.ti) })).filter((f) => f.tis.length);
  const mudou = (ti: number) => !!R && (R.plano.tasks[ti].dia !== p.tasks[ti].dia || R.plano.tasks[ti].dur !== p.tasks[ti].dur);
  const legenda: [string, string][] = [["Validada", "hsl(var(--success))"], ["Por validar", "#d97706"], ["Em curso", "#7c5ce0"], ["Atrasada", "hsl(var(--destructive))"], ["Parada", "#64748b"]];
  const pegar = (e: React.PointerEvent, ti: number, tipo: "mover" | "durar") => {
    if (R || !podeMexer(ti)) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    toque.current = { x: e.clientX, y: e.clientY, ti, tipo };
    setArrasto({ ti, tipo, dx: 0, dy: 0 });
  };
  const arrastar = (e: React.PointerEvent) => { if (toque.current) setArrasto({ ti: toque.current.ti, tipo: toque.current.tipo, dx: e.clientX - toque.current.x, dy: vista === "tecnicos" ? e.clientY - toque.current.y : 0 }); };
  const largar = (e: React.PointerEvent) => {
    const t = toque.current;
    toque.current = null;
    if (!t) { setArrasto(null); return; }
    // pelo próprio evento (um arrasto rápido larga antes de o estado do arrasto mudar)
    const passos = Math.round((e.clientX - t.x) / COL);
    setArrasto(null);
    // 12/11: na vista por técnico, largar noutra linha passa a tarefa a essa pessoa
    const linha = vista === "tecnicos" && passar && Math.abs(e.clientY - t.y) > 18 ? (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest?.("[data-tec]")?.getAttribute("data-tec") : null;
    const x = p.tasks[t.ti];
    if (linha && linha !== x.tec) { largouEm.current = Date.now(); passar!(t.ti, linha); if (passos && t.tipo === "mover") moverTarefa(t.ti, { dia: Math.max(vivo ? p.dia : 0, x.dia + passos) }); return; }
    if (!passos) return; // sem andar, é um clique: abre a tarefa (onClick)
    largouEm.current = Date.now();
    if (t.tipo === "mover") moverTarefa(t.ti, { dia: Math.max(vivo ? p.dia : 0, x.dia + passos) });
    else moverTarefa(t.ti, { dur: Math.max(1, x.dur + passos) });
  };
  const fundo = () => (
    <>
      {dias.map((x, k) => x.getDay() === 1 && k > 0 && <div key={"s" + k} aria-hidden="true" className="absolute inset-y-0 border-l-2 border-l-foreground/10" style={{ left: k * COL }} />)}
      {vivo && <div aria-hidden="true" className="absolute inset-y-0 bg-primary/[0.07]" style={{ left: p.dia * COL, width: COL }} />}
    </>
  );
  const barra = (ti: number, top: number) => {
    const t = p.tasks[ti], n = R ? R.plano.tasks[ti] : t, v = estadoVivo(t, p), b = p.base?.[ti];
    const atraso = diasDeAtraso(t, p), a = arrasto?.ti === ti ? arrasto : null;
    return (
      <Fragment key={ti}>
        {b && (b.dia !== t.dia || b.dur !== t.dur) && <div aria-hidden="true" title="Previsto no orçamento" className="absolute h-[3px] rounded-full bg-foreground/30" style={{ left: b.dia * COL + 4, width: Math.max(8, b.dur * COL - 8), top: top + 31 }} />}
        {((R && mudou(ti)) || a) && <div aria-hidden="true" className="absolute rounded-lg border-2 border-dashed border-foreground/35" style={{ left: t.dia * COL + 2, width: Math.max(COL - 4, t.dur * COL - 4), top, height: 28 }} />}
        {!R && atraso > 0 && (
          <div aria-hidden="true" className="absolute flex items-center justify-end rounded-r-lg bg-[repeating-linear-gradient(135deg,hsl(var(--destructive)/0.35)_0_5px,hsl(var(--destructive)/0.15)_5px_10px)] pr-1 text-[11px] font-bold text-destructive"
            style={{ left: (t.dia + t.dur) * COL - 2, width: atraso * COL, top, height: 28 }}>+{atraso}</div>
        )}
        <Barra t={t} n={n} v={v} p={p} sel={sel === ti} mudou={mudou(ti)} abrir={() => { if (Date.now() - largouEm.current > 350) abrir(ti); }} reduzir={reduzir} top={top} critica={critico.has(ti)}
          arrasto={a} mexe={!R && podeMexer(ti)} pegar={(e, tipo) => pegar(e, ti, tipo)} />
      </Fragment>
    );
  };
  const pessoas = [...new Set(p.tasks.map((t) => t.tec).filter((x): x is string => !!x))];
  const linhas: (string | null)[] = [...pessoas, ...(p.tasks.some((t) => !t.tec) ? [null] : [])];
  const rotulo = "w-32 sm:w-56";
  return (
    <section aria-label="O plano vivo" className="rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[15px] font-semibold">{titulo}</h2>
          <div role="group" aria-label="Vista" className="relative inline-flex rounded-full border border-input p-0.5">
            {([["gantt", "Gantt", CalendarRange], ["tecnicos", "Por técnico", Users]] as const).map(([k, l, I]) => (
              <button key={k} type="button" aria-pressed={vista === k} onClick={() => setVista(k)}
                className={cn("relative inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors", vista === k ? "text-background" : "text-muted-foreground hover:text-foreground")}>
                {vista === k && <motion.span layoutId="vista-obra" aria-hidden="true" className="absolute inset-0 rounded-full bg-foreground" transition={reduzir ? { duration: 0 } : MOLA} />}
                <I className="relative h-4 w-4" aria-hidden="true" /><span className="relative">{l}</span>
              </button>
            ))}
          </div>
        </div>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Legenda">
          {legenda.map(([t, c]) => <li key={t} className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-4 rounded-sm" style={{ background: c }} />{t}</li>)}
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-[3px] w-4 rounded-full bg-foreground/30" />Previsto no orçamento</li>
          <li className="flex items-center gap-1.5"><Flame className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />Caminho crítico</li>
        </ul>
      </div>
      {!R && <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">{vivo ? "As tarefas que ainda não começaram arrastam-se (o dia) e a ponta muda os dias; as outras abrem-se para gerir a execução." : "Arraste uma barra para mudar o dia; a ponta muda os dias."}{nova && vista === "tecnicos" ? " Num dia vazio, «+» cria uma tarefa." : ""}{passar && vista === "tecnicos" ? " Arraste para a linha de outra pessoa para lhe passar a tarefa." : ""}</p>}
      <div className="overflow-x-auto" onPointerMove={arrastar} onPointerUp={largar} onPointerCancel={() => { toque.current = null; setArrasto(null); }} onPointerLeave={() => !toque.current && setSob(null)}>
        <div className="min-w-max">
          {/* os dias */}
          <div className="sticky top-0 z-10 flex border-b border-border bg-card">
            <div className={cn("sticky left-0 z-20 shrink-0 bg-card px-3 py-2 text-xs font-medium text-muted-foreground sm:px-4", rotulo)}>{vista === "gantt" ? "Tarefa" : "Técnico"}</div>
            {dias.map((x, k) => {
              const im = imprevistos.filter((i) => i.dia === k);
              const hoje = vivo && k === p.dia;
              return (
                <div key={k} className={cn("relative shrink-0 py-1.5 text-center text-xs tabular-nums", x.getDay() === 1 && k > 0 && "border-l-2 border-l-foreground/15", hoje && "bg-primary/10")} style={{ width: COL }}>
                  <span className="block text-muted-foreground">{k === 0 || x.getDate() === 1 ? MES[x.getMonth()] : SEM[x.getDay()]}</span>
                  <span className={cn("block font-medium", hoje && "text-primary")}>{x.getDate()}</span>
                  {hoje && <span className="block text-[10px] font-semibold uppercase text-primary">hoje</span>}
                  {im.length > 0 && <span title={im.map((i) => `Imprevisto: ${i.texto}`).join("\n")} aria-label={`Imprevisto neste dia: ${im.map((i) => i.texto).join(", ")}`} className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-destructive text-[10px] font-bold text-white">!</span>}
                </div>
              );
            })}
          </div>
          {vista === "gantt" && fases.map((f) => (
            <div key={f.n} role="rowgroup" aria-label={`Fase ${f.n} · ${f.curto}`}>
              <div className="flex border-b border-border bg-muted/40">
                <div className={cn("sticky left-0 z-10 flex shrink-0 items-center gap-2 bg-muted/40 px-3 py-1.5 text-xs font-semibold sm:px-4", rotulo)}>
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COR_FASE[f.n] }} /><span className="truncate">{f.n} · {f.curto}</span>
                </div>
                <div style={{ width: dias.length * COL }} />
              </div>
              {f.tis.map((ti) => {
                const t = p.tasks[ti], v = estadoVivo(t, p), atraso = diasDeAtraso(t, p);
                return (
                  <div key={ti} className={cn("flex border-b border-border last:border-b-0", sel === ti && "bg-primary/[0.04]")}>
                    <button type="button" onClick={() => abrir(ti)} className={cn("sticky left-0 z-10 flex shrink-0 items-center gap-2 bg-card px-3 py-1.5 text-left hover:bg-muted/60 sm:px-4", rotulo)}>
                      <span className="hidden sm:block"><AvatarTec id={t.tec} tam="h-7 w-7" /></span>
                      <span className="min-w-0"><span className="block truncate text-sm font-medium">{t.nome}</span><span className={cn("block truncate text-xs", v === "atrasada" || v === "corrigir" ? "font-medium text-destructive" : "text-muted-foreground")}>{rotuloVivo(t, p)}{atraso ? ` · +${atraso}` : ""}</span></span>
                    </button>
                    <div className="relative" style={{ width: dias.length * COL, height: LINHA }}>{fundo()}{barra(ti, 7)}</div>
                  </div>
                );
              })}
            </div>
          ))}
          {vista === "tecnicos" && linhas.map((tec) => {
            const ts = p.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => t.tec === tec).sort((a, b) => a.t.dia - b.t.dia);
            const faixas: number[] = [];
            const faixa = ts.map(({ t }) => { let f = 0; while (faixas[f] !== undefined && faixas[f] > t.dia) f++; faixas[f] = t.dia + t.dur; return f; });
            const fora = tec ? blocosForaDaObra(tec, dias, obras, deFerias) : [];
            const altura = Math.max(1, faixas.length) * 38 + 12 + (fora.length ? 28 : 0);
            const k = sob && sob.tec === tec ? sob.k : null;
            const ocupado = (kk: number) => ts.some(({ t }) => kk >= t.dia && kk < t.dia + t.dur) || fora.some((b) => kk >= b.ini && kk < b.fim);
            const livre = k != null && !ocupado(k) && (!vivo || k >= p.dia);
            return (
              <div key={tec ?? "sem"} className="flex border-b border-border last:border-b-0">
                <div className={cn("sticky left-0 z-10 flex shrink-0 items-center gap-2 bg-card px-3 py-2 sm:px-4", rotulo)}>
                  <span className="hidden sm:block"><AvatarTec id={tec} tam="h-8 w-8" /></span>
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{nomeTec(tec)}</span><span className="block truncate text-xs text-muted-foreground">{tec ? `${TECS.find((x) => x.id === tec)?.sk ?? ""} · ${ts.length} ${ts.length === 1 ? "tarefa" : "tarefas"}` : "falta escolher"}</span></span>
                </div>
                <div className="relative" style={{ width: dias.length * COL, height: altura }} data-tec={tec ?? undefined}
                  onPointerMove={(e) => { if (toque.current) return; const r = e.currentTarget.getBoundingClientRect(); const kk = Math.floor((e.clientX - r.left) / COL); if (kk !== sob?.k || tec !== sob?.tec) setSob(kk >= 0 && kk < dias.length ? { k: kk, tec } : null); }}>
                  {fundo()}
                  {nova && livre && !arrasto && !R && (
                    <button type="button" aria-label={`Nova tarefa para ${nomeTec(tec)} a ${dataCurta(dias[k!])}`} onClick={() => nova(k!, tec)}
                      className="absolute top-1.5 grid place-items-center rounded-lg border-2 border-dashed border-primary/40 text-primary hover:bg-primary/[0.06]" style={{ left: k! * COL + 2, width: COL - 4, height: 28 }}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                  {ts.map(({ ti }, j) => barra(ti, 6 + faixa[j] * 38))}
                  {fora.map((b) => {
                    const largura = (b.fim - b.ini) * COL - 4, txt = b.tipo === "ferias" ? "Férias" : `${b.obra!.nome}${b.obra!.servico ? ` · ${b.obra!.servico}` : ""}`;
                    const quando = `${dataCurta(dias[b.ini])}${b.fim - b.ini > 1 ? ` a ${dataCurta(dias[b.fim - 1])}` : ""}`;
                    const st = { left: b.ini * COL + 2, width: largura, bottom: 4 };
                    const cls = "absolute flex h-6 items-center gap-1 overflow-hidden whitespace-nowrap rounded-lg px-2 text-[11px] font-medium";
                    return b.tipo === "obra" ? (
                      <button key={`o${b.ini}`} type="button" onClick={() => abrirOutra(b.obra!)} title={`Noutra obra: ${txt} (${quando}). Abrir o Estúdio dela`}
                        aria-label={`${nomeTec(tec)} está noutra obra, ${txt}, ${quando}. Abrir o Estúdio dela`} className={cn(cls, "bg-muted-foreground/20 text-foreground/80 hover:bg-muted-foreground/30")} style={st}>
                        <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{largura > 50 ? txt : ""}</span>
                      </button>
                    ) : (
                      <span key={`f${b.ini}`} role="img" aria-label={`${nomeTec(tec)} de férias, ${quando}`} title={`Férias (${quando})`} className={cn(cls, "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100")} style={st}>
                        <span className="truncate">{largura > 40 ? "Férias" : ""}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Barra({ t, n, v, p, sel, mudou, abrir, reduzir, top, arrasto, mexe, pegar, critica }: {
  t: Tarefa; n: Tarefa; v: EstadoVivo; p: Plano; sel: boolean; mudou: boolean; abrir: () => void; reduzir: boolean; top: number; critica?: boolean;
  arrasto: Arrasto | null; mexe: boolean; pegar: (e: React.PointerEvent, tipo: "mover" | "durar") => void;
}) {
  const cor = COR_FASE[t.fase ?? 1];
  const feito = feitoDe(t, p);
  const fundo = COR_VIVO[v] || cor;
  const I = v === "validada" ? Check : v === "feita" ? Clock : v === "parada" ? Lock : v === "pausada" ? Pause : v === "atrasada" || v === "corrigir" ? AlertTriangle : null;
  const dataIni = dataDoDia(p, n.dia);
  const dx = arrasto?.tipo === "mover" ? arrasto.dx : 0, dw = arrasto?.tipo === "durar" ? arrasto.dx : 0;
  const passos = arrasto ? Math.round(arrasto.dx / COL) : 0;
  return (
    <motion.button type="button" onClick={abrir} onPointerDown={(e) => mexe && pegar(e, "mover")} initial={false}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); } }}
      animate={{ left: n.dia * COL + 2 + dx, width: Math.max(COL - 4, n.dur * COL - 4 + dw), scale: arrasto ? 1.03 : 1, y: arrasto?.dy ?? 0 }}
      transition={reduzir || arrasto ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 30 }}
      aria-label={`${t.nome}: ${ROTULO_VIVO[v].toLowerCase()}, ${n.dur} ${n.dur === 1 ? "dia" : "dias"}${dataIni ? ` a partir de ${dataCurta(dataIni)}` : ""}${mudou ? " (muda)" : ""}`}
      className={cn("absolute flex items-center gap-1 overflow-hidden rounded-lg px-2 text-left text-xs font-medium text-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        mexe ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        critica && !sel && v !== "atrasada" && "ring-2 ring-amber-500/80 ring-offset-1 ring-offset-card",
        sel && "ring-2 ring-foreground ring-offset-2 ring-offset-card", v === "atrasada" && "ring-2 ring-destructive ring-offset-1 ring-offset-card", mudou && "ring-2 ring-primary ring-offset-1 ring-offset-card")}
      style={{ top, height: 28, touchAction: mexe ? "none" : undefined, zIndex: arrasto ? 20 : undefined,
        background: v === "parada" || v === "pausada" ? "repeating-linear-gradient(135deg,#64748b 0 6px,#94a3b8 6px 12px)" : (v === "em curso" || v === "hoje" || v === "atrasada") ? `color-mix(in srgb, ${fundo} 45%, transparent)` : v === "por começar" ? `color-mix(in srgb, ${fundo} 80%, white)` : fundo }}>
      {(v === "em curso" || v === "hoje" || v === "atrasada") && <motion.span aria-hidden="true" className="absolute inset-y-0 left-0" style={{ background: fundo }} initial={reduzir ? false : { width: 0 }} animate={{ width: `${Math.round(feito * 100)}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />}
      {I && <I className="relative h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      {critica && !I && <Flame className="relative h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span className="relative truncate drop-shadow-sm">{t.nome}</span>
      {arrasto && passos !== 0 && <span className="relative ml-auto shrink-0 rounded bg-black/25 px-1 text-[10px] tabular-nums">{passos > 0 ? "+" : ""}{passos}</span>}
      {mexe && <span onPointerDown={(e) => pegar(e, "durar")} aria-hidden="true" className="absolute inset-y-0 right-0 w-3 cursor-ew-resize bg-white/0 hover:bg-white/30" />}
    </motion.button>
  );
}

/* ================================================================== «E se…?»: a pré-visualização */
function PreviaPlano({ ctx, d, previa, setPrevia, R, fora, dias, abrirOutra, ocup }: {
  ctx: Ctx; d: Negocio; previa: Previa; setPrevia: (x: Previa | null) => void; R: Replano; fora: ConflitoFora[]; dias: Date[]; abrirOutra: (o: Negocio) => void; ocup: Map<string, Set<string>>;
}) {
  const { A, run } = ctx;
  const reduzir = useReduzir();
  // o motivo por omissão segue o que acontece: espera por um técnico, só adianta, ou um atraso (sem motivo escolhido, fica «Pôr o plano em dia»)
  const [motivo, setMotivo] = useState<string>(previa.k === "atraso" ? "Imprevisto na obra" : R.mudancas.some((m) => m.espera) ? "Técnico indisponível"
    : R.mudancas.length && R.mudancas.every((m) => m.tipo === "adiantada") ? "Mais rápido do que previsto" : "");
  const p0 = d.obra.plano!;
  // quem do mesmo ofício está livre para a tarefa que espera (a partir de quando podia começar sem esperar)
  const livresPara = (m: Replano["mudancas"][number]) => {
    const t = p0.tasks[m.ti], ini = Math.max(m.de.dia, p0.estado === "em curso" ? p0.dia : 0);
    return tecnicosDoOficio(t).filter((x) => x.id !== t.tec && motivoOcupado(x.id, { dia: ini, dur: m.para.dur }, p0, ocup) == null).slice(0, 2);
  };
  const [cliente, setCliente] = useState(true);
  const df = R.fimDepois - R.fimAntes;
  // a obra onde está o técnico por quem a tarefa espera (nos dias em que ela começaria pela ordem do plano)
  const esperaObra = (m: Replano["mudancas"][number]) => (m.espera ? obraQueOcupa(ctx.S, m.espera.tec, { dia: Math.min(m.de.dia, m.para.dia), dur: Math.abs(m.para.dia - m.de.dia) + m.para.dur }, R.plano, d.id) : null);
  const quando = (k: number) => (dias[k] ? dataCurta(dias[k]) : `dia ${k + 1}`);
  const aplicar = () => {
    run(() => A.replanearObra(d.id, { adiantar: previa.k === "replanear" && previa.adiantar, motivo, cliente, ...(previa.k === "atraso" ? { atraso: { ti: previa.ti, dias: previa.dias } } : {}) }));
    setPrevia(null);
  };
  return (
    <motion.section aria-label="Antes de aplicar" initial={reduzir ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      className="space-y-4 rounded-2xl border-2 border-primary/40 bg-primary/[0.03] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">E se…?</p>
          <h2 className="text-lg font-semibold">{previa.titulo}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {previa.k === "replanear" && (
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-input bg-card px-3 text-sm">
              <input type="checkbox" checked={previa.adiantar} onChange={(e) => setPrevia({ ...previa, adiantar: e.target.checked })} className="h-4 w-4 accent-[hsl(var(--primary))]" />Usar a folga para adiantar
            </label>
          )}
          {previa.k === "atraso" && (
            <span role="group" aria-label="Dias de atraso" className="inline-flex items-center rounded-full border border-input bg-card">
              <button type="button" aria-label="Menos um dia" disabled={previa.dias <= 1} onClick={() => setPrevia({ ...previa, dias: previa.dias - 1, titulo: previa.titulo.replace(/mais \d+ dias?/, `mais ${previa.dias - 1} ${previa.dias - 1 === 1 ? "dia" : "dias"}`) })} className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted disabled:opacity-40"><Minus className="h-4 w-4" /></button>
              <span className="min-w-[4.5rem] text-center text-sm tabular-nums">+{previa.dias} {previa.dias === 1 ? "dia" : "dias"}</span>
              <button type="button" aria-label="Mais um dia" disabled={previa.dias >= 15} onClick={() => setPrevia({ ...previa, dias: previa.dias + 1, titulo: previa.titulo.replace(/mais \d+ dias?/, `mais ${previa.dias + 1} dias`) })} className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted disabled:opacity-40"><Plus className="h-4 w-4" /></button>
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-card p-3 ring-1 ring-border">
          <p className="text-xs text-muted-foreground">A obra acaba</p>
          <p className="text-lg font-semibold tabular-nums">{quando(R.fimDepois - 1)}</p>
          <p className={cn("text-sm font-medium", df > 0 ? "text-destructive" : df < 0 ? "text-success" : "text-muted-foreground")}>{df === 0 ? "a mesma data" : df > 0 ? `+${dd(df)} (era ${quando(R.fimAntes - 1)})` : `${dd(-df)} mais cedo (era ${quando(R.fimAntes - 1)})`}</p>
        </div>
        <div className="rounded-xl bg-card p-3 ring-1 ring-border sm:col-span-2">
          <p className="text-xs text-muted-foreground">{R.mudancas.length ? `${R.mudancas.length} ${R.mudancas.length === 1 ? "tarefa muda" : "tarefas mudam"}` : "Nada muda"}</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {R.mudancas.slice(0, 6).map((m) => (
              <li key={m.ti} className="flex flex-wrap items-center gap-x-2">
                {m.tipo === "adiantada" ? <FastForward className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : <TrendingUp className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />}
                <span className="font-medium">{m.nome}</span>
                <span className="text-muted-foreground">{m.tipo === "prolongada" ? `${m.de.dur} → ${m.para.dur} dias` : `${quando(m.de.dia)} → ${quando(m.para.dia)}`}</span>
                {m.espera && <span className="text-amber-800 dark:text-amber-300">· espera pelo {primeiro(nomeTec(m.espera.tec))} ({m.espera.motivo === "noutra obra" && esperaObra(m) ? <>está na obra <button type="button" onClick={() => abrirOutra(esperaObra(m)!)} className="font-medium underline underline-offset-2 hover:no-underline">{esperaObra(m)!.nome}</button></> : `está ${m.espera.motivo}`})</span>}
                {m.espera && livresPara(m).map((x) => (
                  <button key={x.id} type="button" onClick={() => run(() => A.trocarTec(d.id, m.ti, x.id))}
                    className="inline-flex min-h-8 items-center gap-1 rounded-full border border-primary/40 bg-card px-2.5 text-sm font-medium text-primary hover:bg-primary/[0.06]">
                    <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />Passar para {primeiro(x.n)}, que está livre
                  </button>
                ))}
              </li>
            ))}
            {R.mudancas.length > 6 && <li className="text-muted-foreground">e mais {R.mudancas.length - 6}</li>}
          </ul>
        </div>
      </div>

      {/* o impacto nas outras obras dos mesmos técnicos */}
      <div className={cn("rounded-xl p-3 text-sm", fora.length ? "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200" : "bg-success/10 text-success")}>
        {fora.length ? (
          <>
            <p className="flex items-center gap-1.5 font-medium"><Users className="h-4 w-4" aria-hidden="true" />Nas outras obras</p>
            <ul className="mt-1 space-y-1">
              {fora.map((c, k) => (
                <li key={k}>{nomeTec(c.tec)} passa a coincidir com a obra{" "}
                  <button type="button" onClick={() => abrirOutra(c.obra)} className="inline-flex items-center gap-0.5 font-medium underline underline-offset-2 hover:no-underline">{c.obra.nome}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
                  {" "}a {c.dias.slice(0, 3).map((x) => x.split("-").reverse().slice(0, 2).join("/")).join(", ")}{c.dias.length > 3 ? "…" : ""}. Passe a tarefa a outro técnico, ou mude a outra obra.
                </li>
              ))}
            </ul>
          </>
        ) : <p className="flex items-center gap-1.5"><Check className="h-4 w-4" aria-hidden="true" />{R.mudancas.some((m) => m.espera) ? "As outras obras não mudam: as tarefas desta esperam pelos técnicos." : "Não mexe nas outras obras: os técnicos continuam livres nos dias novos."}</p>}
      </div>

      {R.mudancas.length > 0 && (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Porquê?</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {MOTIVOS_AJUSTE.map((m) => <button key={m} type="button" aria-pressed={motivo === m} onClick={() => setMotivo(m)} className={cn("min-h-10 rounded-full border px-3 text-sm", motivo === m ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40")}>{m}</button>)}
            </div>
          </div>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-[15px]"><input type="checkbox" checked={cliente} onChange={(e) => setCliente(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />Avisar o cliente no portal</label>
        </div>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" size="lg" onClick={() => setPrevia(null)}>Cancelar</Button>
        <Button type="button" size="lg" disabled={!R.mudancas.length} onClick={aplicar}><Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Aplicar ao plano</Button>
      </div>
    </motion.section>
  );
}

/* ================================================================== o imprevisto: o que se encontrou, o impacto e a proposta */
const OFICIOS = ["Canalização", "Eletricidade", "Revestimentos", "Carpintaria", "Pintura", "Demolições"];
const chip = (on: boolean) => cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[15px] transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40");
const ENTRADA = "h-12 w-full rounded-xl border border-input bg-background px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring";

function NovoImprevisto({ ctx, d, ti, ocup: _ocup, fechar, mostrar }: { ctx: Ctx; d: Negocio; ti?: number; ocup: Map<string, Set<string>>; fechar: () => void; mostrar: (c: Plano | null) => void }) {
  const { S, A, run } = ctx;
  const p = d.obra.plano!;
  const afetaveis = tarefasAfetaveis(p);
  const [texto, setTexto] = useState("");
  const [onde, setOnde] = useState("");
  const [fotos, setFotos] = useState<string[]>([]);
  const [grav, setGrav] = useState<Gravidade>("atrasa");
  const [tarefas, setTarefas] = useState<number[]>(ti != null && afetaveis.includes(ti) ? [ti] : []);
  const [dias, setDias] = useState(1);
  const [custo, setCusto] = useState(false);
  const [horas, setHoras] = useState(4);
  const [preco, setPreco] = useState<number | null>(null);
  const [oficio, setOficio] = useState("Canalização");
  const input = useRef<HTMLInputElement>(null);
  const juntar = async (L?: FileList | null) => {
    if (!L) return;
    const novas: string[] = [];
    for (const f of Array.from(L).slice(0, 4 - fotos.length)) { try { novas.push(await lerFoto(f)); } catch { /* sem leitura */ } }
    setFotos((F) => [...F, ...novas].slice(0, 4));
  };
  const precoV = preco ?? precoSugeridoLivre(S, horas, oficio);
  const linha: LinhaAdenda | null = custo && horas > 0 ? { sid: "livre", n: texto.trim() ? texto.trim().replace(/^./, (c) => c.toUpperCase()) : "Trabalho do imprevisto", un: "vg", q: 1, pu: precoV, h: horas, perfil: oficio, livre: true, mats: [] } : null;
  // o impacto, ao vivo: no prazo (o plano numa cópia) e no valor (a adenda)
  const imp = useMemo(() => {
    const c: Plano = JSON.parse(JSON.stringify(p));
    let fimDepois = fimDe(p.tasks);
    if (grav === "atrasa" && tarefas.length) fimDepois = atrasar(c, tarefas, dias).fimDepois;
    const extra = linha ? diasAdenda([linha]) : 0;
    return { c, fimAntes: fimDe(p.tasks), fimDepois: fimDepois + (grav === "impede" ? extra : 0), extra, fora: grav === "atrasa" && tarefas.length ? conflitosNovos(S, d, c) : [] };
  }, [grav, tarefas.join(","), dias, linha?.h, p.tasks.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // o atraso no plano vivo, enquanto se escolhe
  useEffect(() => { mostrar(grav === "atrasa" && tarefas.length ? imp.c : null); }, [imp]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => mostrar(null), []); // eslint-disable-line react-hooks/exhaustive-deps
  const T = linha ? totaisLinhas([linha]) : null;
  const val = (() => { try { return valorContrato(d, S).total; } catch { return null; } })();
  const quando = (k: number) => { const x = dataDoDia(p, k); return x ? dataCurta(x) : `dia ${k + 1}`; };
  const falta = [!texto.trim() && "o que encontrou", !tarefas.length && "as tarefas afetadas"].filter(Boolean) as string[];
  const registar = () => run(() => {
    const id = A.registarImprevisto(d.id, { texto, onde, grav, tarefas, dias, fotos, ...(linha ? { custo: linha.pu } : {}) });
    if (id && linha) A.proporImprevisto(d.id, id, [], [{ n: linha.n, h: linha.h, preco: linha.pu, perfil: linha.perfil, mats: [] }]);
    fechar();
  });
  return (
    <div className="space-y-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Na obra</p>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><AlertTriangle className="h-5 w-5 text-amber-700" aria-hidden="true" />Registar imprevisto</h2>
        </div>
        <Button type="button" variant="ghost" className="min-h-10" aria-label="Fechar" onClick={fechar}><X className="h-4 w-4" /></Button>
      </div>

      <label className="block space-y-1.5">
        <span className="text-[15px] font-medium">O que encontrou?</span>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Ex.: cano de esgoto podre por baixo da base de duche" className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      <label className="block space-y-1.5">
        <span className="text-[15px] font-medium">Onde? <span className="font-normal text-muted-foreground">(opcional)</span></span>
        <input value={onde} onChange={(e) => setOnde(e.target.value)} placeholder="Ex.: parede do fundo" className={ENTRADA} />
      </label>
      <div className="space-y-1.5">
        <p className="text-[15px] font-medium">Fotografias <span className="font-normal text-muted-foreground">({fotos.length} de 4)</span></p>
        <input ref={input} type="file" accept="image/*" multiple className="sr-only" aria-label="Fotografias do imprevisto" onChange={(e) => { void juntar(e.target.files); e.target.value = ""; }} />
        <div className="flex flex-wrap items-center gap-2">
          {fotos.length > 0 && <Miniaturas fotos={fotos} tam="h-14 w-20" />}
          {fotos.length > 0 && <button type="button" onClick={() => setFotos([])} className="min-h-11 px-2 text-sm text-muted-foreground hover:text-foreground">Tirar</button>}
          {fotos.length < 4 && <Button type="button" variant="outline" className="min-h-11" onClick={() => input.current?.click()}><Camera className="mr-1.5 h-4 w-4" aria-hidden="true" />{fotos.length ? "Mais" : "Juntar"}</Button>}
        </div>
      </div>

      <fieldset>
        <legend className="text-[15px] font-medium">Que efeito tem?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {GRAVIDADES.map((g) => (
            <button key={g.k} type="button" aria-pressed={grav === g.k} onClick={() => setGrav(g.k)}
              className={cn("min-h-11 rounded-xl border p-3 text-left transition-colors", grav === g.k ? "border-primary bg-primary/[0.06] ring-1 ring-primary" : "border-input hover:border-foreground/40")}>
              <span className="block text-[15px] font-medium">{g.t}</span><span className="block text-sm text-muted-foreground">{g.sub}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-[15px] font-medium">Que tarefas afeta?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {afetaveis.map((i) => {
            const on = tarefas.includes(i);
            return <button key={i} type="button" aria-pressed={on} onClick={() => setTarefas((L) => (on ? L.filter((x) => x !== i) : [...L, i]))} className={chip(on)}>{on && <Check className="h-4 w-4" aria-hidden="true" />}{p.tasks[i].nome}</button>;
          })}
        </div>
      </fieldset>
      {grav === "atrasa" && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[15px] font-medium">Atrasa</span>
          <span role="group" aria-label="Dias de atraso do imprevisto" className="inline-flex items-center rounded-lg border border-input">
            <button type="button" aria-label="Menos um dia" disabled={dias <= 1} onClick={() => setDias(dias - 1)} className="grid h-11 w-11 place-items-center hover:bg-muted disabled:opacity-40"><Minus className="h-4 w-4" /></button>
            <span className="min-w-[4.5rem] text-center text-[15px] tabular-nums">{dias} {dias === 1 ? "dia" : "dias"}</span>
            <button type="button" aria-label="Mais um dia" disabled={dias >= 15} onClick={() => setDias(dias + 1)} className="grid h-11 w-11 place-items-center hover:bg-muted disabled:opacity-40"><Plus className="h-4 w-4" /></button>
          </span>
        </div>
      )}

      <fieldset>
        <legend className="text-[15px] font-medium">Tem custo para o cliente?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" aria-pressed={!custo} onClick={() => setCusto(false)} className={chip(!custo)}>Não, fica connosco</button>
          <button type="button" aria-pressed={custo} onClick={() => setCusto(true)} className={chip(custo)}>Sim, vai numa adenda</button>
        </div>
      </fieldset>
      {custo && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1"><span className="text-sm text-muted-foreground">Horas de trabalho (estimativa)</span><input type="number" inputMode="decimal" min={0.5} step={0.5} value={horas || ""} onChange={(e) => setHoras(Math.max(0, Number(e.target.value.replace(",", ".")) || 0))} className={ENTRADA} /></label>
          <label className="block space-y-1"><span className="text-sm text-muted-foreground">Preço sem IVA (€)</span><input type="number" inputMode="decimal" min={0} step={1} value={precoV || ""} onChange={(e) => setPreco(Math.max(0, Number(e.target.value.replace(",", ".")) || 0))} className={ENTRADA} /></label>
          <div className="sm:col-span-2">
            <p className="text-sm text-muted-foreground">Ofício</p>
            <div className="mt-1.5 flex flex-wrap gap-2">{OFICIOS.map((o) => <button key={o} type="button" aria-pressed={oficio === o} onClick={() => setOficio(o)} className={chip(oficio === o)}>{o}</button>)}</div>
          </div>
        </div>
      )}

      {/* o impacto, antes de registar */}
      <section aria-label="O impacto" className="space-y-2 rounded-2xl bg-muted/50 p-4">
        <p className="text-sm font-semibold">O impacto</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">No prazo</p>
            <p className="text-[15px] font-semibold tabular-nums">{!tarefas.length ? "—" : grav === "impede" ? "Param até o cliente decidir" : imp.fimDepois === imp.fimAntes ? "Mantém-se" : `Acaba a ${quando(imp.fimDepois - 1)}`}</p>
            <p className="text-sm text-muted-foreground">{grav === "atrasa" && tarefas.length && imp.fimDepois !== imp.fimAntes ? `+${dd(imp.fimDepois - imp.fimAntes)} (era ${quando(imp.fimAntes - 1)})` : grav === "impede" && imp.extra ? `+${dd(imp.extra)} com o trabalho extra` : ""}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">No valor</p>
            <p className="text-[15px] font-semibold tabular-nums">{T ? `+${eur(T.total)} €` : "Sem custo para o cliente"}</p>
            <p className="text-sm text-muted-foreground">{T && val != null ? `${eur(val)} € → ${eur(val + T.total)} € com IVA` : T ? "com IVA" : ""}</p>
          </div>
        </div>
        {imp.fora.length > 0 && <p className="text-sm text-amber-800 dark:text-amber-300">{imp.fora.map((c) => `${nomeTec(c.tec)} passa a coincidir com a obra ${c.obra.nome}`).join(" · ")}.</p>}
        {T && <p className="text-sm text-muted-foreground">Vai ao cliente como adenda ao contrato: aceita e assina no portal; depois entra no plano.</p>}
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {falta.length > 0 && <p className="text-sm text-muted-foreground sm:mr-auto">Falta {falta.join(" e ")}.</p>}
        <Button type="button" variant="ghost" size="lg" onClick={fechar}>Cancelar</Button>
        <Button type="button" size="lg" disabled={falta.length > 0} onClick={registar}>{T ? "Registar e propor ao cliente" : "Registar o imprevisto"}</Button>
      </div>
    </div>
  );
}

/* ================================================================== o cartão que abre o Estúdio (no passo «Plano da obra») */
export function AbrirEstudioObra({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const [aberto, setAberto] = useState(false);
  const p = d.obra.plano;
  if (!p || p.estado === "por aprovar") return null;
  const ocup = ocupacaoDosTecnicos(ctx.S, d.id);
  const A = alertasDaObra(d, ctx.S, ocup);
  const crit = A.filter((a) => a.nivel === "critico").length;
  const pct = Math.round(progresso(p) * 100);
  return (
    <>
      <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">Estúdio da obra</p>
          <p className="text-sm text-muted-foreground">
            {p.estado === "aprovado" ? "O plano vivo, os materiais e arrancar a obra." : p.estado === "concluída" ? "A obra como correu: o plano, os imprevistos e o que mudou." : `${pct}% feito · ${A.length ? `${A.length} ${A.length === 1 ? "alerta" : "alertas"}${crit ? ` (${crit} ${crit === 1 ? "urgente" : "urgentes"})` : ""}` : "sem alertas"} · atrasos, adiantamentos e imprevistos num só sítio.`}
          </p>
        </div>
        <Button type="button" className="min-h-11 shrink-0" onClick={() => setAberto(true)}><HardHat className="mr-1.5 h-4 w-4" aria-hidden="true" />Abrir o estúdio</Button>
      </div>
      {aberto && <EstudioObra ctx={ctx} d={d} fechar={() => setAberto(false)} />}
    </>
  );
}
