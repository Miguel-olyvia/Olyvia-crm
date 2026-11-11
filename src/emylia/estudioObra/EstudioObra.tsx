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
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, ArrowUpRight, CalendarCheck, Camera, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Euro, FastForward, Gauge, HardHat, Lightbulb, Lock, Minus, Package, Plus, Rocket, Shuffle, Sparkles, TrendingUp, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { comRelogioReal, eur, nfmt, type Negocio, type Plano, type Tarefa } from "../motor";
import type { Ctx } from "../pecas";
import { NaFrente } from "../NaFrente";
import { COR_FASE, FASES_OBRA } from "../fasesObra";
import { dataCurta, diasDaObra } from "../planoObra";
import { faltaParaArrancar, inicioDoPlano, obraQueOcupa, ocupacaoDosTecnicos, tecnicosDoOficio, motivoOcupado } from "../preparacaoObra";
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
import { Contagem, useReduzir } from "../movimento";
import { EstudioPlano } from "../estudioPlano/EstudioPlano";
import { ROTULO_VIVO, conflitosNovos, rotuloVivo, dataDoDia, derrapagem, diasDeAtraso, estadoVivo, feitoDe, replanear, replanoDe, simularAtraso, type ConflitoFora, type EstadoVivo, type Replano } from "./planoVivo";
import { alertasDaObra, type AcaoAlerta, type Alerta } from "./alertasObra";

const SEM = ["D", "S", "T", "Q", "Q", "S", "S"];
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const COL = 38; // px por dia útil
const LINHA = 46;
const primeiro = (n: string) => n.split(" ")[0];
const dd = (n: number) => `${n} ${Math.abs(n) === 1 ? "dia útil" : "dias úteis"}`;

type Previa = { titulo: string; k: "replanear"; adiantar: boolean } | { titulo: string; k: "atraso"; ti: number; dias: number };
type Painel = { k: "tarefa"; ti: number } | { k: "imprevisto"; ti?: number } | { k: "materiais" } | null;

const COR_VIVO: Record<EstadoVivo, string> = {
  validada: "hsl(var(--success))", feita: "#d97706", corrigir: "hsl(var(--destructive))", parada: "#64748b",
  atrasada: "", "em curso": "", hoje: "", "por começar": "",
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
  const nDias = Math.max(fim, fimR, p.base ? fimDe(p.base) : 0) + 3;
  const dias = diasDaObra(inicio, nDias);
  const PV = porValidar(p);
  const falta = vivo ? faltaParaEncerrar(d, S, db) : [];
  const faltaArrancar = p.estado === "aprovado" ? faltaParaArrancar(d, db) : [];
  const ims = imprevistosDe(d), imsAbertos = ims.filter((i) => i.estado !== "fechado" && i.estado !== "aprovado");
  const val = (() => { try { return valorContrato(d, S); } catch { return null; } })();
  const custoPend = ims.filter((i) => i.estado === "aberto" || i.estado === "proposta").reduce((a, i) => a + (i.custo ?? 0), 0);
  const validadas = p.tasks.filter((t) => acabou || estadoVivo(t, p) === "validada").length;
  const fazer = (fn: () => void) => run(fn);

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
      case "passar": fazer(() => A.trocarTec(d.id, a.ti, a.tec)); break;
      case "outra": setOutra(a.obra); break;
      case "replanear": setPainel(null); setPrevia({ titulo: "Replanear a obra", k: "replanear", adiantar: true }); break;
      case "adiantar": setPainel(null); setPrevia({ titulo: "Adiantar com a folga", k: "replanear", adiantar: true }); break;
      case "conversa": fazer(() => A.abrirPlano(d.id)); fechar(); break;
      case "materiais": setPainel({ k: "materiais" }); break;
    }
  };

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
              {/* ------------------------------------------------------------ os números */}
              <section aria-label="A obra em números" className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
                <Numero rotulo="Feito" icone={<Gauge className="h-4 w-4" />}><Contagem valor={Math.round(progresso(p) * 100)} fmt={(n) => `${Math.round(n)}%`} de={0} /></Numero>
                <Numero rotulo={vivo ? "Dia da obra" : "Começa"} icone={<Clock className="h-4 w-4" />}>{vivo ? <span>{p.dia + 1} <span className="text-base font-normal text-muted-foreground">de {fimR}</span></span> : dataCurta(inicio)}</Numero>
                <Numero rotulo="Fica pronta" icone={<CalendarCheck className="h-4 w-4" />}
                  sub={R ? (R.fimDepois === R.fimAntes ? "mantém-se" : `${R.fimDepois > R.fimAntes ? "+" : "−"}${dd(Math.abs(R.fimDepois - R.fimAntes))}`) : der > 0 ? `+${dd(der)} face ao orçamento` : der < 0 ? `${dd(-der)} mais cedo` : "como no orçamento"}
                  tom={R ? (R.fimDepois > R.fimAntes ? "mau" : R.fimDepois < R.fimAntes ? "bom" : undefined) : der > 0 ? "mau" : der < 0 ? "bom" : undefined}>
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span key={fimR} initial={reduzir ? false : { y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} className="inline-block">{dias[fimR - 1] ? dataCurta(dias[fimR - 1]) : "—"}</motion.span>
                  </AnimatePresence>
                </Numero>
                <Numero rotulo="Tarefas validadas" icone={<CheckCircle2 className="h-4 w-4" />}><span>{validadas} <span className="text-base font-normal text-muted-foreground">de {p.tasks.length}</span></span></Numero>
                <Numero rotulo="Imprevistos" icone={<AlertTriangle className="h-4 w-4" />} sub={imsAbertos.length ? `por resolver · ${ims.length} no total` : ims.length ? `${ims.length} no total, resolvidos` : "nenhum"} tom={ims.some((i) => i.estado === "aberto" || i.estado === "recusado") ? "mau" : undefined}><Contagem valor={imsAbertos.length} fmt={(n) => String(Math.round(n))} de={0} /></Numero>
                <Numero rotulo="Valor da obra" icone={<Euro className="h-4 w-4" />} sub={custoPend ? `+${eur(custoPend)} € s/ IVA em imprevistos por aprovar` : val?.adendas ? `inclui ${eur(val.adendas)} € de adendas` : "com IVA"}>{val ? `${eur(val.total)} €` : "—"}</Numero>
              </section>

              {/* ------------------------------------------------------------ «E se…?»: a pré-visualização, antes de aplicar */}
              <AnimatePresence>
                {previa && R && <PreviaPlano key="previa" ctx={ctx} d={d} previa={previa} setPrevia={setPrevia} R={R} fora={fora} dias={dias} abrirOutra={setOutra} ocup={ocup} />}
              </AnimatePresence>

              {/* ------------------------------------------------------------ o plano vivo */}
              <GanttVivo titulo={previa ? "O plano, se aplicar" : R ? "O plano, com o imprevisto" : "O plano vivo"} p={p} R={R} dias={dias} sel={painel?.k === "tarefa" ? painel.ti : null} abrir={(ti) => setPainel({ k: "tarefa", ti })} imprevistos={ims.map((i) => ({ id: i.id, dia: i.dia, texto: i.texto }))} reduzir={reduzir} />

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
            </div>
          </main>

          {/* ---------------------------------------------------------------- o painel da direita */}
          <AnimatePresence>
            {painel && (painel.k !== "tarefa" || p.tasks[painel.ti]) && (
              <motion.aside key={painel.k + (painel.k === "tarefa" ? painel.ti : "")} aria-label={painel.k === "tarefa" ? "A tarefa" : painel.k === "imprevisto" ? "Registar imprevisto" : "Materiais"}
                className="absolute inset-0 z-30 w-full overflow-y-auto border-l border-border bg-card shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-w-lg lg:relative lg:z-auto lg:shadow-none"
                initial={reduzir ? false : { x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.2 }}>
                {painel.k === "tarefa" && <PainelTarefa ctx={ctx} d={d} ti={painel.ti} ocup={ocup} dias={dias} fechar={() => setPainel(null)}
                  simular={(dias) => setPrevia(dias ? { titulo: `${p.tasks[painel.ti].nome}: mais ${dias} ${dias === 1 ? "dia" : "dias"}`, k: "atraso", ti: painel.ti, dias } : null)}
                  simulado={previa?.k === "atraso" && previa.ti === painel.ti ? previa.dias : 0} imprevisto={() => setPainel({ k: "imprevisto", ti: painel.ti })} />}
                {painel.k === "imprevisto" && <NovoImprevisto ctx={ctx} d={d} ti={painel.ti} ocup={ocup} fechar={() => setPainel(null)} mostrar={setFantasma} />}
                {painel.k === "materiais" && <PainelMateriais d={d} inv={inv} fechar={() => setPainel(null)} />}
              </motion.aside>
            )}
          </AnimatePresence>
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

/* ================================================================== o plano vivo (Gantt) */
function GanttVivo({ titulo, p, R, dias, sel, abrir, imprevistos, reduzir }: {
  titulo: string; p: Plano; R: Replano | null; dias: Date[]; sel: number | null; abrir: (ti: number) => void; imprevistos: { id: string; dia: number; texto: string }[]; reduzir: boolean;
}) {
  const vivo = p.estado === "em curso";
  const fases = FASES_OBRA.map((f) => ({ ...f, tis: p.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => (t.fase ?? 1) === f.n).sort((a, b) => a.t.dia - b.t.dia).map((x) => x.ti) })).filter((f) => f.tis.length);
  const mudou = (ti: number) => !!R && (R.plano.tasks[ti].dia !== p.tasks[ti].dia || R.plano.tasks[ti].dur !== p.tasks[ti].dur);
  const legenda: [string, string][] = [["Validada", "hsl(var(--success))"], ["Por validar", "#d97706"], ["Em curso", "#7c5ce0"], ["Atrasada", "hsl(var(--destructive))"], ["Parada", "#64748b"]];
  return (
    <section aria-label="O plano vivo" className="rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-[15px] font-semibold">{titulo}</h2>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Legenda">
          {legenda.map(([t, c]) => <li key={t} className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-4 rounded-sm" style={{ background: c }} />{t}</li>)}
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-[3px] w-4 rounded-full bg-foreground/30" />Previsto no orçamento</li>
        </ul>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-max">
          {/* os dias */}
          <div className="sticky top-0 z-10 flex border-b border-border bg-card">
            <div className="sticky left-0 z-20 w-32 shrink-0 bg-card px-3 py-2 text-xs font-medium text-muted-foreground sm:w-56 sm:px-4">Tarefa</div>
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
          {fases.map((f) => (
            <div key={f.n} role="rowgroup" aria-label={`Fase ${f.n} · ${f.curto}`}>
              <div className="flex border-b border-border bg-muted/40">
                <div className="sticky left-0 z-10 flex w-32 shrink-0 items-center gap-2 bg-muted/40 px-3 py-1.5 text-xs font-semibold sm:w-56 sm:px-4">
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COR_FASE[f.n] }} /><span className="truncate">{f.n} · {f.curto}</span>
                </div>
                <div style={{ width: dias.length * COL }} />
              </div>
              {f.tis.map((ti) => {
                const t = p.tasks[ti], n = R ? R.plano.tasks[ti] : t, v = estadoVivo(t, p), b = p.base?.[ti];
                const atraso = diasDeAtraso(t, p);
                return (
                  <div key={ti} className={cn("flex border-b border-border last:border-b-0", sel === ti && "bg-primary/[0.04]")}>
                    <button type="button" onClick={() => abrir(ti)} className="sticky left-0 z-10 flex w-32 shrink-0 items-center gap-2 bg-card px-3 py-1.5 text-left hover:bg-muted/60 sm:w-56 sm:px-4">
                      <span className="hidden sm:block"><AvatarTec id={t.tec} tam="h-7 w-7" /></span>
                      <span className="min-w-0"><span className="block truncate text-sm font-medium">{t.nome}</span><span className={cn("block truncate text-xs", v === "atrasada" || v === "corrigir" ? "font-medium text-destructive" : "text-muted-foreground")}>{rotuloVivo(t, p)}{atraso ? ` · +${atraso}` : ""}</span></span>
                    </button>
                    <div className="relative" style={{ width: dias.length * COL, height: LINHA }}>
                      {dias.map((x, k) => x.getDay() === 1 && k > 0 && <div key={"s" + k} aria-hidden="true" className="absolute inset-y-0 border-l-2 border-l-foreground/10" style={{ left: k * COL }} />)}
                      {vivo && <div aria-hidden="true" className="absolute inset-y-0 bg-primary/[0.07]" style={{ left: p.dia * COL, width: COL }} />}
                      {/* o previsto no orçamento */}
                      {b && (b.dia !== t.dia || b.dur !== t.dur) && <div aria-hidden="true" title="Previsto no orçamento" className="absolute h-[3px] rounded-full bg-foreground/30" style={{ left: b.dia * COL + 4, width: Math.max(8, b.dur * COL - 8), top: LINHA - 7 }} />}
                      {/* com a pré-visualização: onde está agora, a tracejado */}
                      {R && mudou(ti) && <div aria-hidden="true" className="absolute rounded-lg border-2 border-dashed border-foreground/35" style={{ left: t.dia * COL + 2, width: Math.max(COL - 4, t.dur * COL - 4), top: 7, height: 28 }} />}
                      {/* os dias de atraso (de quando devia ter acabado até hoje) */}
                      {!R && atraso > 0 && (
                        <div aria-hidden="true" className="absolute flex items-center justify-end rounded-r-lg bg-[repeating-linear-gradient(135deg,hsl(var(--destructive)/0.35)_0_5px,hsl(var(--destructive)/0.15)_5px_10px)] pr-1 text-[11px] font-bold text-destructive"
                          style={{ left: (t.dia + t.dur) * COL - 2, width: atraso * COL, top: 7, height: 28 }}>+{atraso}</div>
                      )}
                      <Barra t={t} n={n} v={v} p={p} sel={sel === ti} mudou={mudou(ti)} abrir={() => abrir(ti)} reduzir={reduzir} />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Barra({ t, n, v, p, sel, mudou, abrir, reduzir }: { t: Tarefa; n: Tarefa; v: EstadoVivo; p: Plano; sel: boolean; mudou: boolean; abrir: () => void; reduzir: boolean }) {
  const cor = COR_FASE[t.fase ?? 1];
  const feito = feitoDe(t, p);
  const fundo = COR_VIVO[v] || cor;
  const I = v === "validada" ? Check : v === "feita" ? Clock : v === "parada" ? Lock : v === "atrasada" || v === "corrigir" ? AlertTriangle : null;
  const dataIni = dataDoDia(p, n.dia);
  return (
    <motion.button type="button" onClick={abrir} initial={false}
      animate={{ left: n.dia * COL + 2, width: Math.max(COL - 4, n.dur * COL - 4) }} transition={reduzir ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 30 }}
      aria-label={`${t.nome}: ${ROTULO_VIVO[v].toLowerCase()}, ${n.dur} ${n.dur === 1 ? "dia" : "dias"}${dataIni ? ` a partir de ${dataCurta(dataIni)}` : ""}${mudou ? " (muda)" : ""}`}
      className={cn("absolute flex items-center gap-1 overflow-hidden rounded-lg px-2 text-left text-xs font-medium text-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        sel && "ring-2 ring-foreground ring-offset-2 ring-offset-card", v === "atrasada" && "ring-2 ring-destructive ring-offset-1 ring-offset-card", mudou && "ring-2 ring-primary ring-offset-1 ring-offset-card")}
      style={{ top: 7, height: 28, background: v === "parada" ? "repeating-linear-gradient(135deg,#64748b 0 6px,#94a3b8 6px 12px)" : (v === "em curso" || v === "hoje" || v === "atrasada") ? `color-mix(in srgb, ${fundo} 45%, transparent)` : v === "por começar" ? `color-mix(in srgb, ${fundo} 80%, white)` : fundo }}>
      {(v === "em curso" || v === "hoje" || v === "atrasada") && <motion.span aria-hidden="true" className="absolute inset-y-0 left-0" style={{ background: fundo }} initial={reduzir ? false : { width: 0 }} animate={{ width: `${Math.round(feito * 100)}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />}
      {I && <I className="relative h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span className="relative truncate drop-shadow-sm">{t.nome}</span>
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

/* ================================================================== a tarefa */
function PainelTarefa({ ctx, d, ti, ocup, dias, fechar, simular, simulado, imprevisto }: {
  ctx: Ctx; d: Negocio; ti: number; ocup: Map<string, Set<string>>; dias: Date[]; fechar: () => void; simular: (dias: number) => void; simulado: number; imprevisto: () => void;
}) {
  const { S, A, run } = ctx;
  const p = d.obra.plano!, t = p.tasks[ti], v = estadoVivo(t, p), b = p.base?.[ti];
  const vivo = p.estado === "em curso", acabada = v === "validada" || v === "feita";
  const quando = (k: number) => (dias[k] ? dataCurta(dias[k]) : `dia ${k + 1}`);
  const resto = { dia: Math.max(t.dia, vivo ? p.dia : 0), dur: Math.max(1, t.dia + t.dur - Math.max(t.dia, vivo ? p.dia : 0)) };
  const livres = tecnicosDoOficio(t).filter((x) => x.id !== t.tec && motivoOcupado(x.id, resto, p, ocup) == null).slice(0, 3);
  const E = enviosDe(t);
  const [prolongar, setProlongar] = useState(simulado || 1);
  const planeia = podeNeg(S.role, "obra.planear");
  return (
    <div className="space-y-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: COR_FASE[t.fase ?? 1] }} />Fase {t.fase ?? 1} · {FASES_OBRA[(t.fase ?? 1) - 1]?.curto}</p>
          <h2 className="text-lg font-semibold leading-snug">{t.nome}</h2>
          <p className="text-sm text-muted-foreground">{quando(t.dia)}{t.dur > 1 ? ` a ${quando(t.dia + t.dur - 1)}` : ""} · {nfmt(t.h)} h · {nomeTec(t.tec)}</p>
          {b && (b.dia !== t.dia || b.dur !== t.dur) && <p className="text-sm text-muted-foreground">No orçamento: {quando(b.dia)}{b.dur > 1 ? ` a ${quando(b.dia + b.dur - 1)}` : ""}</p>}
        </div>
        <Button type="button" variant="ghost" className="min-h-10" aria-label="Fechar a tarefa" onClick={fechar}><X className="h-4 w-4" /></Button>
      </div>
      <p className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium", v === "validada" ? "bg-success/15 text-success" : v === "atrasada" || v === "corrigir" ? "bg-destructive/10 text-destructive" : v === "feita" ? "bg-amber-100 text-amber-900" : "bg-muted")}>
        {rotuloVivo(t, p)}{v === "atrasada" ? ` · +${dd(diasDeAtraso(t, p))}` : ""}{t.exec?.horas ? ` · ${nfmt(t.exec.horas)} de ${nfmt(t.h)} h registadas` : ""}
      </p>

      {vivo && (
        <section aria-labelledby="obra-acoes" className="space-y-2">
          <h3 id="obra-acoes" className="text-sm font-medium">O que pode fazer</h3>
          <ul className="overflow-hidden rounded-xl border border-border">
            {v === "feita" && planeia && <Acao icone={<CheckCircle2 className="h-4 w-4" />} t="Validar" sub="Está feita, com as fotografias" fn={() => run(() => A.validarTarefa(d.id, ti))} />}
            {!acabada && planeia && (
              <li className="border-b border-border px-3 py-2.5 last:border-b-0">
                <p className="flex items-center gap-3"><span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><TrendingUp className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium">E se atrasar?</span><span className="block text-sm text-muted-foreground">Veja no plano o que anda, a data de fim e as outras obras</span></span></p>
                <div className="mt-2 flex flex-wrap items-center gap-2 pl-11">
                  <span role="group" aria-label="Dias a mais" className="inline-flex items-center rounded-full border border-input">
                    <button type="button" aria-label="Menos um dia" disabled={prolongar <= 1} onClick={() => { setProlongar(prolongar - 1); if (simulado) simular(prolongar - 1); }} className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted disabled:opacity-40"><Minus className="h-4 w-4" /></button>
                    <span className="min-w-[4rem] text-center text-sm tabular-nums">+{prolongar} {prolongar === 1 ? "dia" : "dias"}</span>
                    <button type="button" aria-label="Mais um dia" disabled={prolongar >= 15} onClick={() => { setProlongar(prolongar + 1); if (simulado) simular(prolongar + 1); }} className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted disabled:opacity-40"><Plus className="h-4 w-4" /></button>
                  </span>
                  <Button type="button" size="sm" variant={simulado ? "secondary" : "outline"} className="min-h-10" onClick={() => simular(simulado ? 0 : prolongar)}>{simulado ? "Tirar a simulação" : "Ver no plano"}</Button>
                </div>
              </li>
            )}
            {!acabada && <Acao icone={<AlertTriangle className="h-4 w-4" />} t="Registar um imprevisto" sub="O que encontrou, fotografias, custo e dias" fn={imprevisto} />}
            {!acabada && planeia && livres.map((x) => <Acao key={x.id} icone={<Lightbulb className="h-4 w-4" />} t={`Passar para ${x.n}`} sub={`${x.sk} · livre nestes dias`} fn={() => run(() => A.trocarTec(d.id, ti, x.id))} />)}
          </ul>
        </section>
      )}

      <section aria-labelledby="obra-registos" className="space-y-2">
        <h3 id="obra-registos" className="text-sm font-medium">Registos</h3>
        {!E.length ? <p className="text-sm text-muted-foreground">{v === "por começar" ? "Ainda não começou." : "Ainda sem registos do técnico."}</p> : (
          <ol className="space-y-3">
            {[...E].reverse().map((e, k) => (
              <li key={k} className="rounded-xl bg-muted/50 p-3">
                <p className="text-sm"><span className="font-medium">{e.k === "validada" ? "Validada" : e.k === "correcao" ? "Correção pedida" : e.k === "feita" ? "Dada por feita" : "Registo do dia"}</span> · {primeiro(e.quem)} · {e.q}{e.horas ? ` · ${nfmt(e.horas)} h` : ""}</p>
                {e.nota && <p className="text-sm text-muted-foreground">{e.nota}</p>}
                {e.fotos?.length ? <div className="mt-2"><Miniaturas fotos={e.fotos} tam="h-14 w-20" /></div> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Acao({ icone, t, sub, fn }: { icone: React.ReactNode; t: string; sub?: string; fn: () => void }) {
  return (
    <li className="border-b border-border last:border-b-0">
      <button type="button" onClick={fn} className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none">
        <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">{icone}</span>
        <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium">{t}</span>{sub && <span className="block text-sm text-muted-foreground">{sub}</span>}</span>
      </button>
    </li>
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

/* ================================================================== os materiais */
function PainelMateriais({ d, inv, fechar }: { d: Negocio; inv: ReturnType<typeof resumoEcNegocio>; fechar: () => void }) {
  const G = materiaisPorFase(d, inv);
  return (
    <div className="space-y-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Package className="h-5 w-5 text-primary" aria-hidden="true" />Materiais da obra</h2>
        <Button type="button" variant="ghost" className="min-h-10" aria-label="Fechar" onClick={fechar}><X className="h-4 w-4" /></Button>
      </div>
      {!G.length ? <p className="text-[15px] text-muted-foreground">Sem materiais na encomenda desta obra.</p> : G.map((g) => (
        <section key={g.fase} aria-label={`Fase ${g.fase}`} className="space-y-1.5">
          <p className="flex items-center gap-2 text-sm font-semibold"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: COR_FASE[g.fase] }} />Fase {g.fase} · {FASES_OBRA[g.fase - 1]?.curto}</p>
          <ul className="space-y-1">
            {g.itens.map((m, k) => {
              const ok = m.estado === "na obra" || m.estado === "na carrinha" || m.estado === "reservado" || m.estado === "recebido";
              return (
                <li key={k} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{m.n} <span className="text-muted-foreground">· {nfmt(m.q)} {m.un}</span></span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", ok ? "bg-success/15 text-success" : "bg-amber-100 text-amber-900")}>{m.estado}{m.quando ? ` · ${m.quando}` : ""}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="text-sm text-muted-foreground">O detalhe e as encomendas ao fornecedor estão no passo Materiais do negócio.</p>
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
