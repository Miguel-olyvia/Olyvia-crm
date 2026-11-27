// 11/11 (Rúben: «na gestão da obra a decorrer, o estúdio está muito incompleto… o gestor tem de ter a capacidade de gerir tudo por completo,
// mais ainda do que na fase de aprovação»). As peças do Estúdio da obra além do plano:
//  · ExecucaoTarefa: dentro da tarefa aberta, o ciclo dela (começar, pausar, dar por feita, validar, pedir correção, reabrir), as horas, os
//    registos com as fotografias, dividir, «E se atrasar?» e o imprevisto;
//  · Execucao: as tarefas pelo que pedem (por validar, hoje, em curso, pausadas, a corrigir, por começar, validadas), com o toque principal;
//  · MateriaisDaObra: o que chegou e o que falta, mudar as quantidades de uma tarefa (pedir mais ou devolver), o custo disso e encomendar;
//  · EquipaDaObra: quem está, as tarefas de cada um, onde está nos próximos dias (outra obra, férias), passar as tarefas a outra pessoa;
//  · ClienteDaObra: avisar o cliente, a conversa, o que ele já viu, as adendas (aprovadas, recusadas, à espera);
//  · FechoDaObra: o que falta para fechar, a segurança, a vistoria e o auto, e encerrar.
import { useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowUpRight, CalendarClock, Wrench, Camera, Check, CheckCircle2, ChevronRight, Clock, Minus, Package, Pause, Play, Plus, RotateCcw, Scissors, Send, ShieldCheck, TrendingUp, Undo2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TECS, eur, nfmt, type MatTarefa, type Negocio, type Plano, type Tarefa } from "../motor";
import type { Ctx } from "../pecas";
import { EquipasNaObra } from "./EquipasNaObra";
import { COR_FASE, FASES_OBRA } from "../fasesObra";
import { dataCurta } from "../planoObra";
import { blocosForaDaObra, motivoOcupado, obrasDosTecnicos, ocupacaoDosTecnicos, tecnicosDoOficio } from "../preparacaoObra";
import { equipamentosDaObra, materiaisPorFase, seguranca } from "../obraOps";
import { RECEBIDO_DE_TESTE, ROTULO_MAT_NOVO, emFalta, equipamentosDasTarefasNovas, materiaisDasTarefasNovas, resumoFalta, type EstadoMatNovo, type MatDaTarefaNova } from "./materiaisTarefasNovas";
import { enviosDe, TEMPOS_CORRECAO } from "../trabalhoObra";
import { pontosEncerrar } from "../encerrarObra";
import { emCurso } from "../adendas";
import { AdendasDaObra } from "./AdendasObra";
import { aMais, porEncomendarDe } from "../encomendasAjuste";
import { materiaisDaTarefa } from "../tarefasValidador";
import { custosDosMateriais } from "../preparacaoObra";
import { EditorMateriais } from "../PlanoInterativo";
import { AvatarTec, Miniaturas, nomeTec } from "../AcompanhamentoObra";
import { ConversaDoClienteNaObra } from "../ObraOperacoes";
import { EstadoFotos, useFotosAJuntar } from "../fotosDaObra";
import { ausenteNoRh } from "../equipa/tecnicos";
import { useInventario } from "../inventario/loja";
import { EscolherTarefa, ICONE_DA_FASE, iconeDaTarefa } from "./CaminhoCritico";
import { dispersaoDaEquipa } from "./dispersaoEquipa";
import { resumoEcNegocio } from "../inventario/ponteNegocios";
import { encomendaPorLer } from "../real/encomendaReal";
import { modoReal } from "../acessosPortal";
import { useReduzir, MOLA } from "../movimento";
import { podeNeg } from "../permissoes";
import { ROTULO_VIVO, diasDeAtraso, estadoVivo, nomeCurtoTarefa, type EstadoVivo } from "./planoVivo";

const primeiro = (n: string) => n.split(" ")[0];
const dd = (n: number) => `${n} ${Math.abs(n) === 1 ? "dia" : "dias"}`;
const CHIP = "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors";
const chip = (on: boolean) => cn(CHIP, on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40");
const TOM: Record<EstadoVivo, string> = {
  validada: "bg-success/15 text-success", feita: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200", corrigir: "bg-destructive/10 text-destructive",
  parada: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200", pausada: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  atrasada: "bg-destructive/10 text-destructive", "em curso": "bg-primary/10 text-primary", hoje: "bg-primary/10 text-primary", "por começar": "bg-muted text-muted-foreground",
};
export function ChipVivo({ t, p }: { t: Tarefa; p: Plano }) {
  const v = estadoVivo(t, p), n = diasDeAtraso(t, p);
  return <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", TOM[v])}>{v === "hoje" && t.dia < p.dia ? "Devia ter começado" : ROTULO_VIVO[v]}{n ? ` · +${n}` : ""}</span>;
}

/* ================================================================== a execução da tarefa aberta */
const MOTIVOS_PAUSA = ["Falta material", "O cliente pediu", "Outra frente da obra", "Tempo", "Espera por outro ofício"];
export function ExecucaoTarefa({ ctx, d, ti, simular, simulado, imprevisto }: {
  ctx: Ctx; d: Negocio; ti: number; simular: (dias: number) => void; simulado: number; imprevisto: () => void;
}) {
  const { S, A, run } = ctx;
  const reduzir = useReduzir();
  const p = d.obra.plano!, t = p.tasks[ti], v = estadoVivo(t, p);
  const planeia = podeNeg(S.role, "obra.planear");
  const vivo = p.estado === "em curso";
  const [modo, setModo] = useState<null | "pausar" | "corrigir" | "reabrir" | "feita">(null);
  const [motivo, setMotivo] = useState("");
  const [horasCorr, setHorasCorr] = useState<number>(TEMPOS_CORRECAO[1].h);
  // 20/11 (auditoria, Lote 3): as fotografias guardam-se na base ao escolher; o limite diz-se (antes ficavam só as 4 primeiras, calado)
  const F = useFotosAJuntar(d.id), fotos = F.fotos;
  const [atraso, setAtraso] = useState(simulado || 1);
  const [parte, setParte] = useState(Math.max(1, Math.floor(t.dur / 2)));
  const [todosReg, setTodosReg] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const horas = t.exec?.horas ?? 0;
  const E = enviosDe(t);
  const acabou = v === "validada" || v === "feita";
  // ao cancelar, as fotografias guardadas e não enviadas apagam-se; depois de enviar ficam (já estão na obra)
  const fechar = () => { setModo(null); setMotivo(""); F.descartar(); };
  const fecharEnviado = () => { setModo(null); setMotivo(""); F.limpar(); };
  if (!vivo) return null;
  // o toque principal da tarefa, pelo estado dela
  const principal = !planeia ? null
    : v === "feita" ? { t: "Validar", I: CheckCircle2, fn: () => run(() => A.validarTarefa(d.id, ti)) }
    : v === "pausada" ? { t: "Retomar", I: Play, fn: () => run(() => A.retomarTarefa(d.id, ti)) }
    : v === "por começar" || (v === "hoje" && !t.exec) || (v === "atrasada" && !t.exec) ? (t.dia <= p.dia ? { t: "Começar", I: Play, fn: () => run(() => A.comecarTarefa(d.id, ti)) } : null)
    : v === "em curso" || v === "hoje" || v === "atrasada" || v === "corrigir" ? { t: "Dar por feita", I: Check, fn: () => setModo("feita") }
    : null;
  return (
    <section aria-label="A execução" className="space-y-3 rounded-2xl border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold"><ChipVivo t={t} p={p} /></p>
        <p className="text-sm tabular-nums text-muted-foreground">{nfmt(horas)} de {nfmt(t.h)} h</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <motion.div className="h-full rounded-full" style={{ background: COR_FASE[t.fase ?? 1] }} initial={reduzir ? false : { width: 0 }}
          animate={{ width: `${Math.min(100, acabou ? 100 : (horas / Math.max(0.5, t.h)) * 100)}%` }} transition={{ duration: 0.5 }} />
      </div>
      {t.exec?.pausa && <p className="text-sm text-muted-foreground">Pausada {t.exec.pausa.q}: {t.exec.pausa.motivo}</p>}
      {t.exec?.motivo && (v === "corrigir" || v === "em curso") && <p className="text-sm text-destructive">Pedido: {t.exec.motivo}</p>}
      {t.bloqueio && <p className="text-sm text-muted-foreground">Parada por um imprevisto, à espera do cliente.</p>}
      {/* 12/11 (quem paga): um pedido do cliente para esta tarefa à espera da assinatura da adenda */}
      {(d.adendas ?? []).filter((a) => a.ajuste && a.ajuste.k !== "nova" && a.ajuste.tarefa === t.nome && emCurso(a)).map((a) => (
        <p key={a.n} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{a.estado === "rascunho" ? "Por disparar" : "À espera do cliente"}: {a.ajuste!.k === "atraso" ? `mais ${a.ajuste!.dias} ${a.ajuste!.dias === 1 ? "dia" : "dias"}` : "mais tempo"}{a.ajuste!.k !== "nova" && a.ajuste!.horas ? ` (+${nfmt(a.ajuste!.horas)} h)` : ""} na adenda {a.n}. Muda quando ele assinar.</p>
      ))}

      {/* os toques: o principal e os outros, pelo estado */}
      {planeia && (
        <div className="flex flex-wrap gap-2">
          {principal && <Button type="button" className="min-h-10 rounded-full" onClick={principal.fn}><principal.I className="mr-1.5 h-4 w-4" aria-hidden="true" />{principal.t}</Button>}
          {v === "feita" && <Button type="button" variant="outline" className="min-h-10 rounded-full" onClick={() => setModo("corrigir")}><RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />Pedir correção</Button>}
          {(v === "validada" || v === "feita") && <Button type="button" variant="ghost" className="min-h-10 rounded-full" onClick={() => setModo("reabrir")}><Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Reabrir</Button>}
          {!acabou && v !== "pausada" && !t.bloqueio && (t.exec || t.dia <= p.dia) && <Button type="button" variant="ghost" className="min-h-10 rounded-full" onClick={() => setModo("pausar")}><Pause className="mr-1.5 h-4 w-4" aria-hidden="true" />Pausar</Button>}
        </div>
      )}

      <AnimatePresence initial={false}>
        {modo && (
          <motion.div key={modo} initial={reduzir ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="space-y-2.5 rounded-xl bg-card p-3 ring-1 ring-border">
              {modo === "pausar" && <>
                <p className="text-sm font-medium">Porque pausa?</p>
                <div className="flex flex-wrap gap-2">{MOTIVOS_PAUSA.map((m) => <button key={m} type="button" aria-pressed={motivo === m} onClick={() => setMotivo(m)} className={chip(motivo === m)}>{m}</button>)}</div>
                <div className="flex justify-end gap-2"><Button type="button" variant="ghost" className="min-h-10" onClick={fechar}>Cancelar</Button>
                  <Button type="button" className="min-h-10" disabled={!motivo} onClick={() => { run(() => A.pausarTarefa(d.id, ti, motivo)); fechar(); }}>Pausar</Button></div>
              </>}
              {modo === "corrigir" && <>
                <label className="grid gap-1 text-sm font-medium">O que está mal?
                  <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Ex.: junta torta na parede do duche" className="rounded-xl border border-input bg-background px-3 py-2 text-[15px]" /></label>
                <p className="text-sm font-medium">Quanto tempo leva a corrigir?</p>
                <div className="flex flex-wrap gap-2">{TEMPOS_CORRECAO.map((x) => <button key={x.h} type="button" aria-pressed={horasCorr === x.h} onClick={() => setHorasCorr(x.h)} className={chip(horasCorr === x.h)}>{x.rot}</button>)}</div>
                <p className="text-xs text-muted-foreground">Entra no plano como tarefa nova para {primeiro(nomeTec(t.tec))}{horasCorr >= 8 ? "; um dia ou mais começa amanhã e empurra o que vem depois" : ", ainda hoje"}.</p>
                <div className="flex justify-end gap-2"><Button type="button" variant="ghost" className="min-h-10" onClick={fechar}>Cancelar</Button>
                  <Button type="button" className="min-h-10" disabled={!motivo.trim()} onClick={() => { run(() => A.pedirCorrecao(d.id, ti, motivo, { horas: horasCorr })); fechar(); }}>Pedir correção</Button></div>
              </>}
              {modo === "reabrir" && <>
                <label className="grid gap-1 text-sm font-medium">Porque reabre?
                  <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Ex.: o cliente reparou numa fissura" className="rounded-xl border border-input bg-background px-3 py-2 text-[15px]" /></label>
                <div className="flex justify-end gap-2"><Button type="button" variant="ghost" className="min-h-10" onClick={fechar}>Cancelar</Button>
                  <Button type="button" className="min-h-10" onClick={() => { run(() => A.reabrirTarefa(d.id, ti, motivo)); fechar(); }}>Reabrir a tarefa</Button></div>
              </>}
              {modo === "feita" && <>
                <p className="text-sm font-medium">Uma fotografia do trabalho feito</p>
                <input ref={input} type="file" accept="image/*" multiple className="sr-only" aria-label="Fotografias do trabalho feito" onChange={(e) => { void F.juntar(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
                <div className="flex flex-wrap items-center gap-2">
                  {fotos.length > 0 && <Miniaturas fotos={fotos} tam="h-12 w-16" />}
                  {fotos.length > 0 && <button type="button" onClick={() => F.tirar(fotos.length - 1)} className="min-h-10 px-2 text-sm text-muted-foreground hover:text-foreground">Tirar a última</button>}
                  <Button type="button" variant="outline" className="min-h-10" disabled={F.cheio} onClick={() => input.current?.click()}><Camera className="mr-1.5 h-4 w-4" aria-hidden="true" />{fotos.length ? "Mais" : "Juntar"}</Button>
                </div>
                <EstadoFotos aGuardar={F.aGuardar} erro={F.erro} />
                <label className="grid gap-1 text-sm font-medium">Nota (opcional)
                  <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: ficou como combinado com a cliente" className="h-11 rounded-xl border border-input bg-background px-3 text-[15px]" /></label>
                <p className="text-xs text-muted-foreground">Fica logo validada; sem horas registadas, contam as previstas ({nfmt(t.h)} h).</p>
                <div className="flex justify-end gap-2"><Button type="button" variant="ghost" className="min-h-10" onClick={fechar}>Cancelar</Button>
                  <Button type="button" className="min-h-10" disabled={!fotos.length || F.aGuardar > 0} onClick={() => { run(() => { A.darPorFeita(d.id, ti, { fotos, nota: motivo }); }); fecharEnviado(); }}>Dar por feita</Button></div>
              </>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* as horas, à mão (corrigir o que o técnico registou) */}
      {planeia && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm">Horas registadas</span>
          <span role="group" aria-label="Horas registadas" className="inline-flex items-center rounded-full border border-input bg-card">
            <button type="button" aria-label="Menos meia hora" disabled={horas <= 0} onClick={() => run(() => A.corrigirHoras(d.id, ti, horas - 0.5))} className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted disabled:opacity-40"><Minus className="h-4 w-4" /></button>
            <span className="min-w-[4rem] text-center text-sm tabular-nums">{nfmt(horas)} h</span>
            <button type="button" aria-label="Mais meia hora" onClick={() => run(() => A.corrigirHoras(d.id, ti, horas + 0.5))} className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted"><Plus className="h-4 w-4" /></button>
          </span>
        </div>
      )}

      {/* E se atrasar? · dividir · imprevisto */}
      {planeia && !acabou && (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm"><TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />E se atrasar?</span>
            <span className="flex items-center gap-2">
              <span role="group" aria-label="Dias a mais" className="inline-flex items-center rounded-full border border-input bg-card">
                <button type="button" aria-label="Menos um dia" disabled={atraso <= 1} onClick={() => { setAtraso(atraso - 1); if (simulado) simular(atraso - 1); }} className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted disabled:opacity-40"><Minus className="h-4 w-4" /></button>
                <span className="min-w-[3.5rem] text-center text-sm tabular-nums">+{atraso}</span>
                <button type="button" aria-label="Mais um dia" disabled={atraso >= 15} onClick={() => { setAtraso(atraso + 1); if (simulado) simular(atraso + 1); }} className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted disabled:opacity-40"><Plus className="h-4 w-4" /></button>
              </span>
              <Button type="button" size="sm" variant={simulado ? "secondary" : "outline"} className="min-h-10 rounded-full" onClick={() => simular(simulado ? 0 : atraso)}>{simulado ? "Tirar" : "Ver no plano"}</Button>
            </span>
          </div>
          {t.dur >= 2 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm"><Scissors className="h-4 w-4 text-primary" aria-hidden="true" />Dividir em {dd(parte)} + {dd(t.dur - parte)}</span>
              <span className="flex items-center gap-2">
                <span role="group" aria-label="Dias da primeira parte" className="inline-flex items-center rounded-full border border-input bg-card">
                  <button type="button" aria-label="Menos um dia na primeira parte" disabled={parte <= 1} onClick={() => setParte(parte - 1)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted disabled:opacity-40"><Minus className="h-4 w-4" /></button>
                  <button type="button" aria-label="Mais um dia na primeira parte" disabled={parte >= t.dur - 1} onClick={() => setParte(parte + 1)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted disabled:opacity-40"><Plus className="h-4 w-4" /></button>
                </span>
                <Button type="button" size="sm" variant="outline" className="min-h-10 rounded-full" onClick={() => run(() => { A.dividirTarefa(d.id, ti, parte); })}>Dividir</Button>
              </span>
            </div>
          )}
          <button type="button" onClick={imprevisto} className="flex min-h-10 w-full items-center gap-1.5 rounded-xl px-1 text-left text-sm text-amber-800 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />Registar um imprevisto nesta tarefa<ChevronRight className="ml-auto h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* os registos do técnico, com as fotografias e as notas
          27/11 (menos ruído no painel): só o último à vista; os outros abrem-se (antes eram até 6 cartões antes do «Quando» e do «Quem faz») */}
      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Registos {E.length > 0 && <span className="text-muted-foreground">· {E.length}</span>}</p>
          {E.length > 1 && <button type="button" aria-expanded={todosReg} onClick={() => setTodosReg((x) => !x)} className="min-h-9 rounded-full px-2 text-sm font-medium text-primary hover:underline">{todosReg ? "Só o último" : `Ver os ${Math.min(E.length, 6)}`}</button>}
        </div>
        {!E.length ? <p className="text-sm text-muted-foreground">{t.dia > p.dia ? "Ainda não começou." : "Ainda sem registos do técnico."}</p> : (
          <ol className="space-y-2">
            {[...E].reverse().slice(0, todosReg ? 6 : 1).map((e, k) => (
              <li key={k} className="rounded-xl bg-card p-2.5 ring-1 ring-border">
                <p className="text-sm"><span className="font-medium">{e.k === "validada" ? "Validada" : e.k === "correcao" ? "Correção" : e.k === "feita" ? "Dada por feita" : "Registo do dia"}</span> · {primeiro(e.quem)} · {e.q}{e.horas ? ` · ${nfmt(e.horas)} h` : ""}</p>
                {e.nota && <p className="text-sm text-muted-foreground">{e.nota}</p>}
                {e.fotos?.length ? <div className="mt-1.5"><Miniaturas fotos={e.fotos} tam="h-14 w-20" /></div> : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

/* ================================================================== a execução, tarefa a tarefa */
// 23/11 (Rúben, no 1015: «isto também»): os grupos pelo estado (o que pede ação primeiro) e, dentro de cada um, as tarefas pelas fases da
// obra, como o caminho crítico e os Materiais: o ícone e a cor da fase, o ícone do trabalho, o nome curto, as datas e as horas fáceis de
// ler. O estado de cada tarefa só aparece quando o grupo junta mais do que um (hoje e em curso, pausadas e paradas) ou há atraso.
const GRUPOS: { k: string; t: string; v: EstadoVivo[]; ic: typeof Clock; cls: string }[] = [
  { k: "validar", t: "Por validar", v: ["feita"], ic: Clock, cls: "text-amber-700 dark:text-amber-300" },
  { k: "atraso", t: "Atrasadas", v: ["atrasada"], ic: AlertTriangle, cls: "text-destructive" },
  { k: "corrigir", t: "A corrigir", v: ["corrigir"], ic: RotateCcw, cls: "text-amber-700 dark:text-amber-300" },
  { k: "hoje", t: "Hoje e em curso", v: ["hoje", "em curso"], ic: Play, cls: "text-primary" },
  { k: "paradas", t: "Pausadas e paradas", v: ["pausada", "parada"], ic: Pause, cls: "text-muted-foreground" },
  { k: "depois", t: "Por começar", v: ["por começar"], ic: CalendarClock, cls: "text-primary" },
  { k: "feitas", t: "Validadas", v: ["validada"], ic: CheckCircle2, cls: "text-success" },
];
/** Horas com uma casa decimal. */
const horas = (h: number) => nfmt(Math.round(h * 10) / 10);
export function Execucao({ ctx, d, abrir, dias }: { ctx: Ctx; d: Negocio; abrir: (ti: number) => void; dias: Date[] }) {
  const { S, A, run } = ctx;
  const p = d.obra.plano!;
  const planeia = podeNeg(S.role, "obra.planear");
  const quando = (k: number) => (dias[k] ? dataCurta(dias[k]) : `dia ${k + 1}`);
  const curta = (k: number) => quando(k).replace(/^[^,]+, /, ""); // «30 nov», sem o dia da semana
  const intervalo = (a: number, b: number) => (a === b ? quando(a) : `${curta(a)} – ${curta(b)}`);
  const [verFeitas, setVerFeitas] = useState(false);
  return (
    <div className="space-y-6">
      {GRUPOS.map((g) => {
        const L = p.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => g.v.includes(estadoVivo(t, p))).sort((a, b) => a.t.dia - b.t.dia || a.ti - b.ti);
        if (!L.length) return null;
        const escondido = g.k === "feitas" && !verFeitas, misto = g.v.length > 1;
        const fases = FASES_OBRA.map((f) => ({ ...f, L: L.filter(({ t }) => (t.fase ?? 1) === f.n) })).filter((f) => f.L.length);
        const totH = L.reduce((a, x) => a + x.t.h, 0), feitoH = L.reduce((a, x) => a + (x.t.exec?.horas ?? 0), 0);
        const G = g.ic;
        return (
          <section key={g.k} aria-label={g.t} className="space-y-3">
            <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
              <G className={cn("h-4 w-4", g.cls)} aria-hidden="true" />{g.t}
              <span className="rounded-full bg-muted px-2 text-xs tabular-nums">{L.length}</span>
              <span className="text-xs font-normal tabular-nums text-muted-foreground">· {feitoH > 0 ? `${horas(feitoH)} de ${horas(totH)} h` : `${horas(totH)} h`} · {intervalo(L[0].t.dia, Math.max(...L.map((x) => x.t.dia + x.t.dur - 1)))}</span>
              {g.k === "feitas" && <button type="button" onClick={() => setVerFeitas((x) => !x)} className="text-xs font-normal text-primary underline-offset-4 hover:underline">{verFeitas ? "Esconder" : "Mostrar"}</button>}
            </h3>
            {!escondido && (
              <div className="grid gap-3 lg:grid-cols-2">
                {fases.map((f) => {
                  const Ic = ICONE_DA_FASE[f.n] ?? Package, cor = COR_FASE[f.n];
                  return (
                    <div key={f.n} role="group" aria-label={`${g.t} · Fase ${f.n} · ${f.curto}`} className="overflow-hidden rounded-2xl border border-border bg-card">
                      <div className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
                        <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white" style={{ background: cor }}><Ic className="h-4 w-4" /></span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: cor }}>Fase {f.n}</p>
                          <p className="truncate text-sm font-semibold leading-tight">{f.curto}</p>
                        </div>
                        <p className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{f.L.length} {f.L.length === 1 ? "tarefa" : "tarefas"}</p>
                      </div>
                      <ul>
                        {f.L.map(({ t, ti }) => {
                          const v = estadoVivo(t, p), T = iconeDaTarefa(t.nome), feito = t.exec?.horas ?? 0;
                          const fotos = enviosDe(t).reduce((a, e) => a + (e.fotos?.length ?? 0), 0);
                          return (
                            <li key={ti} className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
                              <button type="button" onClick={() => abrir(ti)} title={t.nome} aria-label={`Abrir ${t.nome}`}
                                className="group flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${cor} 12%, transparent)`, color: cor }}><T className="h-[18px] w-[18px]" /></span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[15px] font-medium">{nomeCurtoTarefa(t.nome)}</span>
                                  <span className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
                                    <AvatarTec id={t.tec} tam="h-5 w-5 text-[9px]" /><span>{primeiro(nomeTec(t.tec))}</span>
                                    <span aria-hidden="true">·</span><span className="tabular-nums">{intervalo(t.dia, t.dia + t.dur - 1)}</span>
                                    <span aria-hidden="true">·</span><span className="tabular-nums">{feito > 0 ? `${horas(feito)} de ${horas(t.h)} h` : `${horas(t.h)} h`}</span>
                                    {fotos > 0 && <><span aria-hidden="true">·</span><span>{fotos} {fotos === 1 ? "foto" : "fotos"}</span></>}
                                  </span>
                                  {feito > 0 && t.h > 0 && <span aria-hidden="true" className="mt-1 block h-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${Math.min(100, (feito / t.h) * 100)}%`, background: cor }} /></span>}
                                </span>
                                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground" aria-hidden="true" />
                              </button>
                              {(misto || diasDeAtraso(t, p) > 0) && <ChipVivo t={t} p={p} />}
                              {planeia && v === "feita" && <Button type="button" size="sm" variant="outline" className="min-h-9 rounded-full" onClick={() => run(() => A.validarTarefa(d.id, ti))}><Check className="mr-1 h-4 w-4" aria-hidden="true" />Validar</Button>}
                              {planeia && v === "pausada" && <Button type="button" size="sm" variant="outline" className="min-h-9 rounded-full" onClick={() => run(() => A.retomarTarefa(d.id, ti))}><Play className="mr-1 h-4 w-4" aria-hidden="true" />Retomar</Button>}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ================================================================== os materiais */
const OK_MAT = new Set(["na obra", "na carrinha", "reservado", "recebido"]);
/** 23/11 (Rúben: «mega next-level»): a tarefa que precisa de cada material: a que instala o produto (o serviço que ele traz, nos produtos
 *  do contrato) ou, sem ela, a primeira por validar da fase dele. E se o material vem do contrato ou do modelo de obra. */
export function quemPrecisa(d: Negocio, fase: number, nome: string): { ti: number | null; contrato: boolean } {
  const p = d.obra.plano!, norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const prod = (d.visita.prod ?? []).find((x) => norm(x.n) === norm(nome));
  const L = p.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => estadoVivo(t, p) !== "validada").sort((a, b) => a.t.dia - b.t.dia || a.ti - b.ti);
  const porSvc = prod?.svc ? L.find(({ t }) => t.svcs.includes(prod.svc!)) : undefined;
  const daFase = L.find(({ t }) => (t.fase ?? 1) === fase);
  return { ti: (porSvc ?? daFase)?.ti ?? null, contrato: !!prod };
}
const isoDe = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
const ROTULO_MAT: Record<string, string> = { reservado: "no armazém", recebido: "no armazém", "na obra": "na obra", "na carrinha": "na carrinha" };

/** 27/11: o chip de cada estado do que falta (âmbar: há um passo a dar; vermelho: está parado; neutro: à espera de outra coisa). */
const TOM_NOVO: Record<EstadoMatNovo, string> = {
  "por encomendar": "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200", "sem fornecedor": "bg-destructive/10 text-destructive",
  "por aprovar": "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200", encomendado: "bg-primary/10 text-primary", "a chegar": "bg-primary/10 text-primary",
  "espera adenda": "bg-muted text-muted-foreground", "espera inicial": "bg-muted text-muted-foreground", garantido: "bg-success/15 text-success",
};

/** `abrir`: abre o painel da tarefa; `irAba`: muda de separador (a adenda está no Cliente); `realce`: a tarefa acabada de juntar (27/11). */
export function MateriaisDaObra({ ctx, d, dias = [], abrir, irAba, realce }: { ctx: Ctx; d: Negocio; dias?: Date[]; abrir?: (ti: number) => void; irAba?: (a: "cliente") => void; realce?: string | null }) {
  const { S, A, run } = ctx;
  const db = useInventario();
  const inv = d.obra.ec?.ref ? resumoEcNegocio(db, d.obra.ec.ref) : null;
  const p = d.obra.plano!;
  const G = materiaisPorFase(d, inv);
  // 27/11 (Rúben: «adicionar novas tarefas … ver em destaque o que falta, link para ver o detalhe»): os materiais das tarefas novas (e
  // das de materiais mudados à mão), por tarefa, em cima de tudo, com o passo seguinte de cada um
  const novos = materiaisDasTarefasNovas(d, inv), F = emFalta(novos), RF = resumoFalta(d, novos);
  const garantidosNovos = novos.length - F.length;
  const porTarefa = [...new Set(novos.map((x) => x.ti))].map((i) => ({ ti: i, L: novos.filter((x) => x.ti === i) })).sort((a, b) => p.tasks[a.ti].dia - p.tasks[b.ti].dia);
  // 27/11 (Rúben: «novo equipamento funciona tal como o step de materiais»): o equipamento que as tarefas novas pedem fora dos dias em que
  // já estava na obra, por receber até alguém o dar como recebido
  const EQ = equipamentosDasTarefasNovas(p), eqFalta = EQ.filter((e) => !e.recebido);
  const E = equipamentosDaObra(p), nomesNovas = new Set(p.tasks.filter((t) => t.nova).map((t) => t.nome));
  const temFalta = F.length > 0 || eqFalta.length > 0;
  const [verGarantidos, setVerGarantidos] = useState(false);
  // 27/11 (teste): o botão «Recebido» (RECEBIDO_DE_TESTE), para quem planeia
  const podeReceber = RECEBIDO_DE_TESTE && podeNeg(S.role, "obra.planear");
  const todos = G.flatMap((g) => g.itens), ok = todos.filter((m) => OK_MAT.has(m.estado)).length;
  const planeia = podeNeg(S.role, "obra.planear");
  const [ti, setTi] = useState<number | null>(null);
  const t = ti != null ? p.tasks[ti] : null;
  const pend = porEncomendarDe(d), sobra = aMais(p);
  // o custo do que se pede a mais (ou volta ao armazém): o preço do material, se o tiver; senão o da receita do orçamento
  const custo = (L: { m: MatTarefa; q: number }[]) => L.reduce((a, x) => a + x.q * (x.m.preco ?? custosDosMateriais(d, [{ n: x.m.n, q: x.q }])[0]?.custo ?? 0), 0);
  const cPend = custo(pend), cSobra = custo(sobra);
  // a tarefa que precisa de cada material, o dia dela e se o material chega tarde
  const linhaDe = (fase: number, m: (typeof todos)[number]) => {
    // 27/11: a linha de uma encomenda de ajuste é da tarefa que a pediu (antes, a primeira tarefa da fase)
    const daEc = m.ec ? p.tasks.findIndex((t) => !!t.ecs?.includes(m.ec!) && (t.mats ?? []).some((x) => x.n === m.n)) : -1;
    const q = daEc >= 0 ? { ti: daEc, contrato: true } : quemPrecisa(d, fase, m.n), tt = q.ti != null ? p.tasks[q.ti] : null, dia = tt ? dias[tt.dia] : undefined;
    return { ti: q.ti, t: tt, contrato: q.contrato, precisa: dia ? dataCurta(dia) : tt ? `dia ${tt.dia + 1}` : "", tarde: !!(m.chega && dia && m.chega > isoDe(dia)) };
  };
  const tarde = G.flatMap((g) => g.itens.filter((m) => linhaDe(g.fase, m).tarde));
  // as saídas: os materiais agrupados pelo dia e por quem faz a tarefa que precisa deles
  const saidas = (() => {
    const M = new Map<string, { dia: number; quando: string; tec: string | null; tarefas: string[]; itens: (typeof todos)[number][]; naObra: boolean; pronto: boolean }>();
    for (const g of G) for (const m of g.itens) {
      const x = linhaDe(g.fase, m);
      if (!x.t) continue;
      const k = `${x.t.dia}:${x.t.tec ?? ""}`, cur = M.get(k) ?? { dia: x.t.dia, quando: x.precisa, tec: x.t.tec, tarefas: [], itens: [], naObra: true, pronto: true };
      cur.tarefas.push(nomeCurtoTarefa(x.t.nome)); cur.itens.push(m);
      cur.naObra &&= m.estado === "na obra"; cur.pronto &&= OK_MAT.has(m.estado);
      M.set(k, cur);
    }
    return [...M.values()].sort((a, b) => a.dia - b.dia);
  })();
  // o link de cada linha: a encomenda de ajuste no Inventário, as compras da obra (o que vai ao fornecedor) ou a adenda
  const link = (x: MatDaTarefaNova): { rot: string; fn: () => void } | null => {
    if (x.estado === "espera adenda") return irAba ? { rot: "Ver a adenda", fn: () => irAba("cliente") } : null;
    if (x.estado === "por aprovar" || x.estado === "encomendado" || x.estado === "a chegar" || x.estado === "sem fornecedor") return { rot: "Ver a compra", fn: () => run(() => A.abrirComprasObra(d.id)) };
    if (x.ec) return { rot: `Ver ${x.ec}`, fn: () => run(() => A.abrirInv(d.id, x.ec)) };
    return null;
  };
  // 27/11 (visto no testarh): as linhas das encomendas de ajuste usam na lista por fase o mesmo rótulo do destaque (antes, a mesma linha
  // dizia «por encomendar» em baixo e «por aprovar» em cima)
  const rotuloNovo = (m: { n: string; ec?: string }): string | null => {
    const x = m.ec ? novos.find((y) => y.ec === m.ec && y.n === m.n) : undefined;
    return x && x.estado !== "garantido" ? ROTULO_MAT_NOVO[x.estado] : null;
  };
  const precisaA = (t: Tarefa) => (dias[t.dia] ? dataCurta(dias[t.dia]) : `dia ${t.dia + 1}`);
  const quandoE = (k: number) => (dias[k] ? dataCurta(dias[k]) : `dia ${k + 1}`);
  return (
    <div className="space-y-6">
      {(novos.length > 0 || EQ.length > 0) && (
        <section aria-label={temFalta ? "Falta para as tarefas novas" : "Tudo garantido para as tarefas novas"}
          className={cn("space-y-3 rounded-2xl border p-4", temFalta ? "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20" : "border-success/40 bg-success/[0.06]")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              {temFalta ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />}
              <div className="min-w-0">
                <p className="text-sm font-semibold">{temFalta ? "Falta para as tarefas novas" : "Tudo garantido para as tarefas novas"}</p>
                <p className="text-sm text-muted-foreground">{[RF.frase, eqFalta.length ? `${eqFalta.length} ${eqFalta.length === 1 ? "equipamento" : "equipamentos"} por receber` : "", garantidosNovos + EQ.length - eqFalta.length ? `${garantidosNovos + EQ.length - eqFalta.length} já ${garantidosNovos + EQ.length - eqFalta.length === 1 ? "garantido" : "garantidos"}` : ""].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
            {/* o passo seguinte: encomendar o que ainda não foi a nenhuma encomenda (o caminho de sempre: a encomenda de ajuste) */}
            {planeia && RF.podeEncomendar && (
              <Button type="button" className="min-h-10 rounded-full" onClick={() => run(() => A.encomendarMateriais(d.id))}>
                <Package className="mr-1.5 h-4 w-4" aria-hidden="true" />Encomendar {RF.porEncomendar === 1 ? "1 material" : `${RF.porEncomendar} materiais`}
              </Button>
            )}
            {!temFalta && <Button type="button" variant="ghost" className="min-h-10 rounded-full" aria-expanded={verGarantidos} onClick={() => setVerGarantidos((x) => !x)}>{verGarantidos ? "Esconder" : "Ver"}</Button>}
          </div>
          {RF.porEncomendar > 0 && !RF.podeEncomendar && (
            <p className="text-sm text-muted-foreground">{d.obra.ec ? "A encomenda de cliente desta obra não está no Inventário: estes materiais pedem-se lá, à mão." : "Saem com a encomenda de cliente, quando o pagamento for validado."}</p>
          )}
          {(temFalta || verGarantidos) && <ul className="space-y-2">
            {porTarefa.map(({ ti: i, L }) => {
              const t = p.tasks[i], cor = COR_FASE[t.fase ?? 1], Ic = iconeDaTarefa(t.nome);
              return (
                <li key={i} role="group" aria-label={`Tarefa ${t.nome}`} className={cn("overflow-hidden rounded-xl bg-card ring-1 ring-border", realce === t.nome && "ring-2 ring-primary")}>
                  <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-3 py-2">
                    <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white" style={{ background: cor }}><Ic className="h-3.5 w-3.5" /></span>
                    <span className="min-w-0 flex-1">
                      {abrir ? <button type="button" title={t.nome} onClick={() => abrir(i)} className="block max-w-full truncate text-left text-sm font-semibold underline-offset-2 hover:underline">{nomeCurtoTarefa(t.nome)}</button>
                        : <span title={t.nome} className="block truncate text-sm font-semibold">{nomeCurtoTarefa(t.nome)}</span>}
                      <span className="block text-xs text-muted-foreground">Fase {t.fase ?? 1} · {FASES_OBRA[(t.fase ?? 1) - 1]?.curto} · precisa a {precisaA(t)}{t.nova ? "" : " · materiais mudados"}</span>
                    </span>
                  </div>
                  <ul>
                    {L.map((x, k) => {
                      const l = x.estado === "garantido" ? null : link(x), tarde = !!(x.chega && dias[t.dia] && x.chega > isoDe(dias[t.dia]));
                      return (
                        <li key={k} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2 last:border-b-0">
                          <span className="min-w-0 flex-1 text-sm"><b className="font-medium">{x.n}</b> <span className="text-muted-foreground">· {nfmt(x.q)} {x.un}</span>
                            {tarde && <span className="block text-xs font-medium text-destructive">Chega a {x.chega!.slice(8, 10)}/{x.chega!.slice(5, 7)}, depois de a tarefa começar</span>}
                          </span>
                          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", tarde ? "bg-destructive/10 text-destructive" : TOM_NOVO[x.estado])}>
                            {x.recebido ? "recebido" : x.estado === "a chegar" && x.chega ? `chega a ${x.chega.slice(8, 10)}/${x.chega.slice(5, 7)}` : x.estado === "espera adenda" && x.adenda ? `à espera da ${x.adenda} paga` : ROTULO_MAT_NOVO[x.estado]}
                          </span>
                          {l && <button type="button" onClick={l.fn} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium text-primary hover:bg-primary/[0.08]">{l.rot}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                          {podeReceber && x.estado !== "garantido" && (
                            <button type="button" aria-label={`Recebido: ${x.n}`} title="Teste: dá o material como recebido (fica garantido)" onClick={() => run(() => A.recebidoTeste(d.id, i, x.n, x.ec))}
                              className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-input bg-card px-3 text-xs font-medium hover:border-success hover:text-success"><Check className="h-3.5 w-3.5" aria-hidden="true" />Recebido</button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
            {EQ.length > 0 && (
              <li role="group" aria-label="Equipamento das tarefas novas" className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
                <p className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-semibold"><Wrench className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Equipamento</p>
                <ul>
                  {EQ.map((e) => (
                    <li key={e.n} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2 text-sm last:border-b-0">
                      <span className="min-w-0 flex-1"><b className="font-medium">{e.n}</b> <span className="text-muted-foreground">· {e.origem === "Aluguer" ? `aluguer${e.de ? ` a ${e.de}` : ""}` : "do armazém"} · {e.tarefas.map((k) => nomeCurtoTarefa(p.tasks[k].nome)).join(", ")}</span></span>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", e.recebido ? TOM_NOVO.garantido : "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200")}>
                        {e.recebido ? "recebido" : `por receber · ${quandoE(e.dia)}${e.fim - 1 > e.dia ? ` a ${quandoE(e.fim - 1)}` : ""}`}
                      </span>
                      {podeReceber && !e.recebido && (
                        <button type="button" aria-label={`Recebido: ${e.n}`} title="Teste: dá o equipamento como recebido na obra" onClick={() => run(() => e.tarefas.forEach((k) => A.recebidoTeste(d.id, k, e.n)))}
                          className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-input bg-card px-3 text-xs font-medium hover:border-success hover:text-success"><Check className="h-3.5 w-3.5" aria-hidden="true" />Recebido</button>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            )}
          </ul>}
          {RF.porEncomendar > 0 && RF.podeEncomendar && <p className="text-xs text-muted-foreground">Ao encomendar, o que houver no armazém fica reservado; o resto vai ao fornecedor, por aprovar no Inventário. As tarefas esperam pela chegada.</p>}
        </section>
      )}

      <section aria-label="O que chegou e o que falta" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">O que chegou e o que falta</p>
            <p className="text-sm text-muted-foreground">{todos.length ? `${ok} de ${todos.length} garantidos` : encomendaPorLer(d.obra.ec?.ref, modoReal()) ? "A ler a encomenda desta obra…" : "Sem materiais na encomenda desta obra."}</p>
          </div>
          {d.obra.ec && <Button type="button" variant="outline" className="min-h-10 rounded-full" onClick={() => run(() => A.abrirInv(d.id))}><ArrowUpRight className="mr-1.5 h-4 w-4" aria-hidden="true" />No Inventário</Button>}
        </div>
        {todos.length > 0 && <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${(ok / todos.length) * 100}%` }} /></div>}
        {tarde.length > 0 && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{tarde.length === 1 ? `${tarde[0].n} chega depois de a tarefa que precisa dele começar.` : `${tarde.length} materiais chegam depois de as tarefas que precisam deles começarem.`}
          </p>
        )}
        {/* 23/11: uma lista só (antes, «As entregas» repetia esta): por fase, com o dia em que a tarefa precisa e quando chega */}
        <div className="grid gap-3 lg:grid-cols-2">
          {G.map((g) => {
            const Ic = ICONE_DA_FASE[g.fase] ?? Package, cor = COR_FASE[g.fase];
            return (
              <div key={g.fase} role="group" aria-label={`Fase ${g.fase} · ${FASES_OBRA[g.fase - 1]?.curto}`} className={cn("overflow-hidden rounded-2xl border border-border bg-card", g.itens.length > 6 && "lg:col-span-2")}>
                <div className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
                  <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white" style={{ background: cor }}><Ic className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: cor }}>Fase {g.fase}</p>
                    <p className="truncate text-sm font-semibold leading-tight">{FASES_OBRA[g.fase - 1]?.curto}</p>
                  </div>
                  <p className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{g.itens.filter((m) => OK_MAT.has(m.estado)).length} de {g.itens.length} garantidos</p>
                </div>
                {/* 23/11 (revisão): uma fase com muitos materiais ocupa a largura toda, em duas colunas (a grelha fica equilibrada) */}
                <ul className={cn(g.itens.length > 6 && "lg:grid lg:grid-cols-2 lg:gap-x-6")}>
                  {g.itens.map((m, k) => {
                    const x = linhaDe(g.fase, m);
                    return (
                      <li key={k} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2", x.tarde && "bg-destructive/[0.05]")}>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{m.n} <span className="font-normal text-muted-foreground">· {nfmt(m.q)} {m.un}</span>{!x.contrato && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">modelo de obra</span>}</span>
                          {x.t && <span className="block text-xs text-muted-foreground">Precisa a {x.precisa} · <button type="button" title={x.t.nome} onClick={() => setTi(x.ti)} className="underline-offset-2 hover:underline">{nomeCurtoTarefa(x.t.nome)}</button></span>}
                          {x.tarde && <span className="block text-xs font-medium text-destructive">Chega depois de a tarefa começar</span>}
                        </span>
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", OK_MAT.has(m.estado) ? "bg-success/15 text-success" : x.tarde ? "bg-destructive/10 text-destructive" : "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200")}>
                          {OK_MAT.has(m.estado) ? ((m as { manual?: true }).manual ? "recebido" : ROTULO_MAT[m.estado] ?? m.estado) : m.quando ? `chega a ${m.quando}` : rotuloNovo(m) ?? m.estado}
                        </span>
                        {/* 27/11 (Rúben: «ajustar à mão os materiais (gerir)»): a data prevista e o recebido, à mão */}
                        {planeia && <GerirMaterial n={m.n} manual={d.obra.matManual?.[m.n]} pronto={OK_MAT.has(m.estado) && !(m as { manual?: true }).manual}
                          mudar={(x) => run(() => A.materialManual(d.id, m.n, x))} />}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* 27/11 (Rúben: «atualizar a tab de materiais e equipamentos»): os equipamentos só se viam no Hoje do técnico. Aqui, os da obra
          toda: de onde vêm (armazém, aluguer, Frota), em que dias e para que tarefas; os das tarefas novas marcados */}
      {E.length > 0 && (
        <section aria-label="Equipamentos" className="space-y-3">
          <div>
            <p className="text-sm font-semibold">Equipamentos</p>
            <p className="text-sm text-muted-foreground">Do armazém, alugados ou da Frota, nos dias das tarefas que os usam.</p>
          </div>
          <ul className="grid gap-2 lg:grid-cols-2">
            {E.map((e) => {
              const nova = e.tarefas.some((x) => nomesNovas.has(x));
              return (
                <li key={e.n} className={cn("flex items-start gap-3 rounded-2xl border bg-card p-3", nova ? "border-primary/40" : "border-border")}>
                  <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{e.n}{nova && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">tarefa nova</span>}</span>
                    <span className="block text-xs text-muted-foreground">{quandoE(e.dia)}{e.fim - 1 > e.dia ? ` a ${quandoE(e.fim - 1)}` : ""} · {e.tarefas.map(nomeCurtoTarefa).join(", ")}</span>
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", EQ.some((x) => x.n === e.n && x.recebido) ? TOM_NOVO.garantido : e.origem === "Aluguer" ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200" : "bg-muted text-muted-foreground")}>
                    {e.origem === "Aluguer" ? `aluguer${e.de ? ` · ${e.de}` : ""}` : e.origem === "Frota" ? "Frota" : "armazém"}{EQ.some((x) => x.n === e.n && x.recebido) ? " · recebido para a tarefa nova" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 23/11 (revisão: «a saída do armazém para a obra»): no dia de cada tarefa, o que sai do armazém e quem o leva */}
      {saidas.length > 0 && (
        <section aria-label="Saídas para a obra" className="space-y-3">
          <div>
            <p className="text-sm font-semibold">Saídas para a obra</p>
            <p className="text-sm text-muted-foreground">O que sai do armazém, em que dia e quem leva: o material de cada tarefa, no dia em que ela começa.</p>
          </div>
          <ol className="space-y-2">
            {saidas.map((x) => (
              <li key={`${x.dia}:${x.tec ?? ""}`} className="flex flex-wrap items-start gap-3 rounded-2xl border border-border bg-card p-3">
                <span className="w-24 shrink-0 text-sm font-semibold tabular-nums">{x.quando}</span>
                <span className="flex min-w-0 flex-1 items-start gap-2">
                  <AvatarTec id={x.tec} tam="h-7 w-7" />
                  <span className="min-w-0">
                    <span className="block text-sm"><b className="font-medium">{primeiro(nomeTec(x.tec)) || "Sem técnico"}</b> leva {x.itens.length} {x.itens.length === 1 ? "material" : "materiais"} · {[...new Set(x.tarefas)].join(", ")}</span>
                    <span className="block text-xs text-muted-foreground">{x.itens.map((m) => `${m.n} · ${nfmt(m.q)} ${m.un}`).join(" · ")}</span>
                  </span>
                </span>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", x.naObra ? "bg-success/15 text-success" : x.pronto ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200")}>
                  {x.naObra ? "na obra" : x.pronto ? "pronto a sair" : "ainda não está no armazém"}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {planeia && (
        <section aria-label="Pedir mais ou devolver" className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div>
            <p className="text-sm font-semibold">Pedir mais ou devolver</p>
            <p className="text-sm text-muted-foreground">Escolha a tarefa e mude as quantidades. O que sobe vai ao fornecedor numa encomenda de ajuste; o que desce volta ao armazém no fim da obra.</p>
          </div>
          {/* 23/11 (Rúben: «lista está feia»): as tarefas pelas fases da obra, com ícones e nomes curtos */}
          <EscolherTarefa p={p} rotulo="A tarefa" sel={ti} escolher={setTi}
            tis={p.tasks.map((_, i) => i).filter((i) => estadoVivo(p.tasks[i], p) !== "validada")}
            detalhe={(i) => { const n = (p.tasks[i].mats ?? materiaisDaTarefa(p.tasks[i], S.svc)).length; return n ? `${n} ${n === 1 ? "material" : "materiais"}` : null; }} />
          {t && ti != null && (
            <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/[0.03] p-3">
              <p className="text-sm font-semibold" title={t.nome}>{nomeCurtoTarefa(t.nome)}</p>
              <EditorMateriais mats={t.mats ?? materiaisDaTarefa(t, S.svc)} mudar={(m) => run(() => A.matsTarefa(d.id, ti, m))} />
            </div>
          )}
          {/* 27/11: o que se pede a mais está em destaque em cima («Falta para as tarefas novas»), com o botão de encomendar; aqui fica o
              custo, para quem está a mudar as quantidades, e o que volta ao armazém */}
          {(pend.length > 0 || sobra.length > 0) && (
            <div className="space-y-2 rounded-xl bg-muted/50 p-3 text-sm">
              {pend.length > 0 && <p><b className="font-medium">A pedir:</b> {pend.map((x) => `${x.m.n} +${nfmt(x.q)} ${x.m.un}`).join(", ")} <span className="text-muted-foreground">· custo +{eur(cPend)} € · em destaque em cima</span></p>}
              {sobra.length > 0 && <p><b className="font-medium">Volta ao armazém:</b> {sobra.map((x) => `${x.m.n} −${nfmt(x.q)} ${x.m.un}`).join(", ")} <span className="text-muted-foreground">· −{eur(cSobra)} €</span></p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* ================================================================== 23/11: a dispersão da equipa */
export function DispersaoDaEquipa({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { S, A, run } = ctx;
  const p = d.obra.plano!;
  const planeia = podeNeg(S.role, "obra.planear");
  const ocup = ocupacaoDosTecnicos(S, d.id);
  const D = dispersaoDaEquipa(p, ocup);
  const [feito, setFeito] = useState(false);
  if (!D) return null;
  return (
    <section aria-label="A equipa dispersa" className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-800 dark:bg-amber-950/20">
      <div className="flex items-start gap-3">
        <Users className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{D.pessoas} pessoas para {D.tarefas} tarefas em {D.dias} dias úteis</p>
          <p className="text-sm text-muted-foreground">Numa obra pequena, cada pessoa a mais é mais uma deslocação e mais uma passagem de mão.{D.passagens.length ? " Juntando tarefas em quem já cá está (do ofício e livre nesses dias):" : " Não há como juntar sem mudar datas: quem é do mesmo ofício não está livre nesses dias, ou cada tarefa pede um ofício diferente. Para juntar, mude o dia de uma tarefa no plano ou escolha outra pessoa na agenda."}</p>
        </div>
      </div>
      {D.passagens.length > 0 && <>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {([["Pessoas", D.pessoas, D.depois], ["Idas à obra", D.deslocacoesAntes, D.deslocacoesDepois], ["Fim e horas", "=", "="]] as [string, number | string, number | string][]).map(([l, a, b]) => (
          <div key={l} className="rounded-xl bg-card p-2 ring-1 ring-border">
            <dt className="text-xs text-muted-foreground">{l}</dt>
            <dd className="text-lg font-semibold tabular-nums">{a === b ? "não mudam" : <>{a} <span className="text-muted-foreground">→</span> {b}</>}</dd>
          </div>
        ))}
      </dl>
      <ul className="space-y-1 text-sm">
        {D.passagens.map((x) => (
          <li key={x.ti} className="flex flex-wrap items-center gap-2" title={p.tasks[x.ti].nome}>
            <span className="font-medium">{nomeCurtoTarefa(p.tasks[x.ti].nome)}</span>
            <span className="text-muted-foreground">{primeiro(nomeTec(x.de))} → {primeiro(nomeTec(x.para))}</span>
          </li>
        ))}
      </ul>
      {planeia && (
        <Button type="button" className="min-h-11 rounded-full" disabled={feito} onClick={() => { run(() => D.passagens.forEach((x) => A.trocarTec(d.id, x.ti, x.para))); setFeito(true); }}>
          <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />{feito ? "Aplicado" : `Juntar: ${D.passagens.length} ${D.passagens.length === 1 ? "passagem" : "passagens"}`}
        </Button>
      )}
      </>}
    </section>
  );
}

/* ================================================================== a equipa */
export function EquipaDaObra({ ctx, d, dias, abrirOutra, novaPara, abrir }: {
  ctx: Ctx; d: Negocio; dias: Date[]; abrirOutra: (o: Negocio) => void; novaPara: (tec: string | null) => void; abrir: (ti: number) => void;
}) {
  const { S, A, run } = ctx;
  const p = d.obra.plano!;
  const planeia = podeNeg(S.role, "obra.planear");
  const obras = useMemo(() => obrasDosTecnicos(S, d.id), [S, d.id, S.deals]); // eslint-disable-line react-hooks/exhaustive-deps
  const ocup = ocupacaoDosTecnicos(S, d.id);
  const deFerias = (tec: string, iso: string) => ausenteNoRh(tec, iso) || !!TECS.find((y) => y.id === tec)?.feriasDatas?.includes(iso);
  const pessoas = [...new Set(p.tasks.map((t) => t.tec).filter((x): x is string => !!x))];
  const hoje = p.estado === "em curso" ? p.dia : 0;
  const janela = dias.slice(hoje, hoje + 10);
  const [passar, setPassar] = useState<string | null>(null);
  const [pedirEquipa, setPedirEquipa] = useState(false);
  return (
    <div className="space-y-3">
      {/* 27/11 (Rúben: «equipas pré-customizadas, e não técnicos isolados; customizar equipas e associar à obra»): as equipas primeiro */}
      <EquipasNaObra ctx={ctx} d={d} pedirEquipa={pedirEquipa} fecharPedido={() => setPedirEquipa(false)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Quem está nesta obra e o que tem por fazer</p>
        {planeia && (
          <div className="flex flex-wrap gap-2">
            {/* 27/11 (Rúben: «junta uma pessoa, mas falta o botão de juntar uma equipa»): a equipa vem com a distribuição proposta */}
            <Button type="button" className="min-h-10 rounded-full" onClick={() => setPedirEquipa(true)}><Users className="mr-1.5 h-4 w-4" aria-hidden="true" />Juntar uma equipa</Button>
            <Button type="button" variant="outline" className="min-h-10 rounded-full" onClick={() => novaPara(null)}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Juntar uma pessoa</Button>
          </div>
        )}
      </div>
      {pessoas.map((tec) => {
        const ts = p.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => t.tec === tec);
        const porFazer = ts.filter(({ t }) => { const v = estadoVivo(t, p); return v !== "validada" && v !== "feita"; });
        const fora = blocosForaDaObra(tec, janela, obras, deFerias);
        const tx = TECS.find((x) => x.id === tec);
        const livres = porFazer.length ? tecnicosDoOficio(porFazer[0].t).filter((x) => x.id !== tec && porFazer.every(({ t }) => motivoOcupado(x.id, { dia: Math.max(t.dia, hoje), dur: t.dur, h: t.h }, p, ocup) == null)) : [];
        return (
          <article key={tec} aria-label={nomeTec(tec)} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <AvatarTec id={tec} tam="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">{nomeTec(tec)}</p>
                <p className="text-sm text-muted-foreground">{tx?.sk ?? ""} · {ts.length} {ts.length === 1 ? "tarefa" : "tarefas"} nesta obra · {porFazer.length} por fazer</p>
              </div>
              {planeia && porFazer.length > 0 && <Button type="button" size="sm" variant="ghost" className="min-h-9 rounded-full" onClick={() => setPassar(passar === tec ? null : tec)}><Users className="mr-1 h-4 w-4" aria-hidden="true" />Passar as tarefas</Button>}
            </div>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {ts.map(({ t, ti }) => <li key={ti}><button type="button" onClick={() => abrir(ti)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm hover:bg-muted"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: COR_FASE[t.fase ?? 1] }} /><span title={t.nome}>{nomeCurtoTarefa(t.nome)}</span>{estadoVivo(t, p) !== "por começar" && <ChipVivo t={t} p={p} />}</button></li>)}
            </ul>
            <AnimatePresence>
              {passar === tec && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mt-3 space-y-2 rounded-xl bg-muted/50 p-3">
                    <p className="text-sm">Passar as {porFazer.length} {porFazer.length === 1 ? "tarefa por fazer" : "tarefas por fazer"} de {primeiro(nomeTec(tec))} para:</p>
                    {livres.length ? (
                      <div className="flex flex-wrap gap-2">{livres.map((x) => (
                        <button key={x.id} type="button" onClick={() => { run(() => porFazer.forEach(({ ti }) => A.trocarTec(d.id, ti, x.id))); setPassar(null); }} className={chip(false)}>{x.n}<span className="text-xs text-success">livre</span></button>
                      ))}</div>
                    ) : <p className="text-sm text-muted-foreground">Ninguém do mesmo ofício está livre nesses dias. Abra uma tarefa para escolher à mão.</p>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </article>
        );
      })}
    </div>
  );
}

/* ================================================================== o cliente */
const AVISOS_RAPIDOS = ["Amanhã a equipa chega às 9h.", "Os materiais já chegaram à obra.", "Hoje não vamos à obra; retomamos amanhã.", "A obra atrasa um dia: estamos a recuperar."];
export function ClienteDaObra({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { S, A, run } = ctx;
  const planeia = podeNeg(S.role, "obra.planear");
  const [texto, setTexto] = useState("");
  const vistos = (d.obra.alteracoes ?? []).filter((a) => a.cliente && a.avisoCliente);
  const ads = d.adendas ?? [];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* 19/11: a conversa com o cliente e os problemas que ele reporta vivem aqui (a página antiga da obra saiu das Operações) */}
      <ConversaDoClienteNaObra ctx={ctx} d={d} soLer={!planeia} />
      {/* 23/11 (permissões): sem negocios.obra.planear não se escreve ao cliente daqui */}
      {planeia && <section aria-label="Avisar o cliente" className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Avisar o cliente</p>
        <p className="text-sm text-muted-foreground">Aparece nas novidades da obra, no portal dele. Para mudar datas, use o plano: o aviso vai com a mudança.</p>
        <div className="flex flex-wrap gap-2">{AVISOS_RAPIDOS.map((x) => <button key={x} type="button" onClick={() => setTexto(x)} className={chip(texto === x)}>{x}</button>)}</div>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Escreva o aviso" aria-label="O aviso ao cliente" className="w-full rounded-xl border border-input bg-background px-3 py-2 text-[15px]" />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" className="min-h-10 rounded-full" disabled={!planeia || !texto.trim()} onClick={() => { run(() => A.avisarClienteObra(d.id, texto)); setTexto(""); }}><Send className="mr-1.5 h-4 w-4" aria-hidden="true" />Avisar no portal</Button>
        </div>
      </section>}
      <section aria-label="As adendas" className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">As adendas: do disparo ao pagamento</p>
        {!ads.length ? <p className="text-sm text-muted-foreground">Sem adendas. Um pedido do cliente ou um imprevisto com custo prepara uma, por disparar.</p> : (
          <AdendasDaObra ctx={ctx} d={d} todas />
        )}
      </section>
      <section aria-label="O que o cliente já viu" className="space-y-2 rounded-2xl border border-border bg-card p-4 lg:col-span-2">
        <p className="text-sm font-semibold">O que o cliente já viu no portal</p>
        {!vistos.length ? <p className="text-sm text-muted-foreground">Ainda nenhum aviso.</p> : (
          <ol className="space-y-2">{vistos.slice(0, 8).map((a, k) => (
            <li key={k} className="rounded-xl bg-muted/50 px-3 py-2 text-sm"><p>{a.avisoCliente}</p><p className="text-xs text-muted-foreground">{a.q} · {a.quem}</p></li>
          ))}</ol>
        )}
      </section>
    </div>
  );
}

/* ================================================================== o fecho */
export function FechoDaObra({ ctx, d, irPara }: { ctx: Ctx; d: Negocio; irPara: (aba: "execucao" | "materiais" | "cliente") => void }) {
  const { S, A, run } = ctx;
  const db = useInventario();
  const P = pontosEncerrar(d, S, db);
  const feitos = P.filter((x) => x.ok).length;
  const planeia = podeNeg(S.role, "obra.planear");
  const seg = seguranca(d);
  const f = d.f;
  const ir: Record<string, (() => void) | undefined> = { plano: () => irPara("execucao"), validar: () => irPara("execucao"), chat: () => irPara("cliente"), mat: () => irPara("materiais") };
  const reduzir = useReduzir();
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section aria-label="Para fechar a obra" className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Para fechar a obra</p>
          <span className="text-sm tabular-nums text-muted-foreground">{feitos} de {P.length}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true"><motion.div className="h-full rounded-full bg-success" initial={reduzir ? false : { width: 0 }} animate={{ width: `${(feitos / P.length) * 100}%` }} transition={MOLA} /></div>
        <ul className="space-y-1.5">
          {P.map((x) => (
            <li key={x.k} className="flex items-start gap-2.5">
              {x.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" /> : <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />}
              <span className="min-w-0 flex-1"><span className="block text-[15px]">{x.t}</span><span className="block text-sm text-muted-foreground">{x.sub}</span></span>
              {!x.ok && ir[x.onde] && <button type="button" onClick={ir[x.onde]} className="min-h-9 shrink-0 rounded-full px-3 text-sm font-medium text-primary hover:bg-primary/[0.06]">Ver</button>}
            </li>
          ))}
        </ul>
        {feitos === P.length && <p className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">Está tudo. Encerre no botão de cima: o auto de receção vai ao portal do cliente.</p>}
      </section>
      <div className="space-y-5">
        <section aria-label="Segurança e licenças" className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />Segurança e licenças</p>
          <ul className="space-y-1.5">{seg.map((x) => (
            <li key={x.k} className="flex items-center gap-2.5 text-sm">
              {x.ok ? <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <X className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />}
              <span className="min-w-0 flex-1">{x.t}<span className="block text-xs text-muted-foreground">{x.sub}</span></span>
              {!x.ok && planeia && <Button type="button" size="sm" variant="outline" className="min-h-9 rounded-full" onClick={() => run(() => A.tratarSeguranca(d.id, x.k))}>Tratado</Button>}
            </li>
          ))}</ul>
        </section>
        <section aria-label="A vistoria final" className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">A vistoria final</p>
          {/* 23/11 (permissões): sem negocios.obra.planear lê-se a vistoria, a satisfação e as notas, sem as mudar */}
          {planeia ? <label className="grid gap-1 text-sm">Data da vistoria
            <input type="date" value={f.vistoria ?? ""} onChange={(e) => run(() => A.campo(d.id, "vistoria", e.target.value))} className="h-11 rounded-xl border border-input bg-background px-3 text-[15px]" /></label>
            : <p className="text-sm">Data da vistoria: <span className="text-muted-foreground">{f.vistoria ? f.vistoria.split("-").reverse().join("/") : "por marcar"}</span></p>}
          {/* 17/11: o auto de receção não se marca à mão: gera-se ao encerrar e o cliente assina-o no portal */}
          <p className="text-sm text-muted-foreground">Auto de receção: {d.obra.auto ? `${d.obra.auto.n} · ${d.obra.auto.estado === "assinado" ? `assinado pelo cliente a ${d.obra.auto.assinado ?? d.obra.auto.q}` : "no portal do cliente, por assinar"}` : "gera-se ao encerrar a obra e vai ao portal do cliente para assinar."}</p>
          {planeia ? <>
          <div className="space-y-1"><p className="text-sm">Satisfação do cliente</p>
            <div className="flex gap-2">{["1", "2", "3", "4", "5"].map((x) => <button key={x} type="button" aria-pressed={f.satisfacao === x} onClick={() => run(() => A.campo(d.id, "satisfacao", x))} className={cn(chip(f.satisfacao === x), "w-11 justify-center px-0")}>{x}</button>)}</div></div>
          <NotasFecho valor={f.notas_fecho ?? ""} gravar={(v) => run(() => A.campo(d.id, "notas_fecho", v))} />
          </> : <>
            <p className="text-sm">Satisfação do cliente: <span className="text-muted-foreground">{f.satisfacao ? `${f.satisfacao} de 5` : "por dar"}</span></p>
            {f.notas_fecho && <p className="text-sm">Remates e notas: <span className="text-muted-foreground">{f.notas_fecho}</span></p>}
          </>}
        </section>
      </div>
    </div>
  );
}
function NotasFecho({ valor, gravar }: { valor: string; gravar: (v: string) => void }) {
  const [v, setV] = useState(valor);
  return (
    <label className="grid gap-1 text-sm">Remates e notas
      <textarea value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== valor && gravar(v)} rows={2} placeholder="Ex.: falta o silicone da base, a cliente aceitou" className="rounded-xl border border-input bg-background px-3 py-2 text-[15px]" />
    </label>
  );
}

/** Um separador do Estúdio da obra (com a contagem do que pede atenção). */
export function Aba({ on, rot, n, aviso, onClick, icone }: { on: boolean; rot: string; n?: number; aviso?: boolean; onClick: () => void; icone: ReactNode }) {
  const reduzir = useReduzir();
  return (
    <button type="button" role="tab" aria-selected={on} onClick={onClick}
      className={cn("relative inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors", on ? "text-background" : "text-muted-foreground hover:text-foreground")}>
      {on && <motion.span layoutId="aba-obra" aria-hidden="true" className="absolute inset-0 rounded-full bg-foreground" transition={reduzir ? { duration: 0 } : MOLA} />}
      <span className="relative" aria-hidden="true">{icone}</span><span className="relative">{rot}</span>
      {!!n && <span className={cn("relative rounded-full px-1.5 text-xs tabular-nums", on ? "bg-background/20" : aviso ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200" : "bg-muted")}>{n}</span>}
    </button>
  );
}

/** 27/11 (Rúben: «permitir ajustar à mão os materiais (gerir)»): num material por receber, a data prevista de chegada e o «Recebido»;
 *  num recebido à mão, desfazer. Os que o Inventário já dá como no armazém ou na obra não se mexem aqui. */
function GerirMaterial({ n, manual, pronto, mudar }: { n: string; manual?: { chega?: string; recebido?: string }; pronto: boolean;
  mudar: (m: { chega?: string | null; recebido?: boolean }) => void }) {
  if (pronto) return null;
  if (manual?.recebido) return (
    <button type="button" onClick={() => mudar({ recebido: false })} aria-label={`Desfazer o recebido de ${n}`}
      className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium text-muted-foreground hover:bg-muted">
      <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />Desfazer</button>
  );
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <label className="sr-only" htmlFor={`chega-${n}`}>Chega a (data prevista) de {n}</label>
      <input id={`chega-${n}`} type="date" value={manual?.chega ?? ""} onChange={(e) => mudar({ chega: e.target.value || null })}
        title="Data prevista de chegada (à mão)" className="h-9 rounded-lg border border-input bg-background px-2 text-xs" />
      <button type="button" onClick={() => mudar({ recebido: true })} aria-label={`Recebido: ${n}`} title="Dá o material como recebido (à mão)"
        className="inline-flex min-h-9 items-center gap-1 rounded-full border border-input bg-card px-3 text-xs font-medium hover:border-success hover:text-success">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />Recebido</button>
    </span>
  );
}
