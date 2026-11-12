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
import { AlertTriangle, ArrowUpRight, Camera, Check, CheckCircle2, ChevronRight, Clock, MessageSquare, Minus, Package, Pause, Play, Plus, RotateCcw, Scissors, Send, ShieldCheck, TrendingUp, Undo2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TECS, eur, nfmt, type MatTarefa, type Negocio, type Plano, type Tarefa } from "../motor";
import type { Ctx } from "../pecas";
import { COR_FASE, FASES_OBRA } from "../fasesObra";
import { dataCurta } from "../planoObra";
import { blocosForaDaObra, motivoOcupado, obrasDosTecnicos, ocupacaoDosTecnicos, tecnicosDoOficio } from "../preparacaoObra";
import { materiaisPorFase, seguranca } from "../obraOps";
import { enviosDe, TEMPOS_CORRECAO } from "../trabalhoObra";
import { pontosEncerrar } from "../encerrarObra";
import { emCurso } from "../adendas";
import { AdendasDaObra } from "./AdendasObra";
import { aMais, porEncomendarDe } from "../encomendasAjuste";
import { materiaisDaTarefa } from "../tarefasValidador";
import { custosDosMateriais } from "../preparacaoObra";
import { EditorMateriais } from "../PlanoInterativo";
import { AvatarTec, Miniaturas, nomeTec } from "../AcompanhamentoObra";
import { lerFoto } from "../ObraOperacoes";
import { ausenteNoRh } from "../equipa/tecnicos";
import { useInventario } from "../inventario/loja";
import { resumoEcNegocio } from "../inventario/ponteNegocios";
import { useReduzir, MOLA } from "../movimento";
import { podeNeg } from "../permissoes";
import { ROTULO_VIVO, diasDeAtraso, estadoVivo, type EstadoVivo } from "./planoVivo";

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
  const [fotos, setFotos] = useState<string[]>([]);
  const [atraso, setAtraso] = useState(simulado || 1);
  const [parte, setParte] = useState(Math.max(1, Math.floor(t.dur / 2)));
  const input = useRef<HTMLInputElement>(null);
  const horas = t.exec?.horas ?? 0;
  const E = enviosDe(t);
  const acabou = v === "validada" || v === "feita";
  const fechar = () => { setModo(null); setMotivo(""); setFotos([]); };
  const juntar = async (L?: FileList | null) => {
    if (!L) return;
    const n: string[] = [];
    for (const f of Array.from(L).slice(0, 4)) { try { n.push(await lerFoto(f)); } catch { /* sem leitura */ } }
    setFotos((x) => [...x, ...n].slice(0, 4));
  };
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
                <input ref={input} type="file" accept="image/*" multiple className="sr-only" aria-label="Fotografias do trabalho feito" onChange={(e) => { void juntar(e.target.files); e.target.value = ""; }} />
                <div className="flex flex-wrap items-center gap-2">
                  {fotos.length > 0 && <Miniaturas fotos={fotos} tam="h-12 w-16" />}
                  <Button type="button" variant="outline" className="min-h-10" onClick={() => input.current?.click()}><Camera className="mr-1.5 h-4 w-4" aria-hidden="true" />{fotos.length ? "Mais" : "Juntar"}</Button>
                </div>
                <label className="grid gap-1 text-sm font-medium">Nota (opcional)
                  <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: ficou como combinado com a cliente" className="h-11 rounded-xl border border-input bg-background px-3 text-[15px]" /></label>
                <p className="text-xs text-muted-foreground">Fica logo validada; sem horas registadas, contam as previstas ({nfmt(t.h)} h).</p>
                <div className="flex justify-end gap-2"><Button type="button" variant="ghost" className="min-h-10" onClick={fechar}>Cancelar</Button>
                  <Button type="button" className="min-h-10" disabled={!fotos.length} onClick={() => { run(() => { A.darPorFeita(d.id, ti, { fotos, nota: motivo }); }); fechar(); }}>Dar por feita</Button></div>
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

      {/* os registos do técnico, com as fotografias e as notas */}
      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-sm font-medium">Registos {E.length > 0 && <span className="text-muted-foreground">· {E.length}</span>}</p>
        {!E.length ? <p className="text-sm text-muted-foreground">{t.dia > p.dia ? "Ainda não começou." : "Ainda sem registos do técnico."}</p> : (
          <ol className="space-y-2">
            {[...E].reverse().slice(0, 6).map((e, k) => (
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
const GRUPOS: { k: string; t: string; v: EstadoVivo[] }[] = [
  { k: "validar", t: "Por validar", v: ["feita"] },
  { k: "atraso", t: "Atrasadas", v: ["atrasada"] },
  { k: "corrigir", t: "A corrigir", v: ["corrigir"] },
  { k: "hoje", t: "Hoje e em curso", v: ["hoje", "em curso"] },
  { k: "paradas", t: "Pausadas e paradas", v: ["pausada", "parada"] },
  { k: "depois", t: "Por começar", v: ["por começar"] },
  { k: "feitas", t: "Validadas", v: ["validada"] },
];
export function Execucao({ ctx, d, abrir, dias }: { ctx: Ctx; d: Negocio; abrir: (ti: number) => void; dias: Date[] }) {
  const { S, A, run } = ctx;
  const p = d.obra.plano!;
  const planeia = podeNeg(S.role, "obra.planear");
  const quando = (k: number) => (dias[k] ? dataCurta(dias[k]) : `dia ${k + 1}`);
  const [verFeitas, setVerFeitas] = useState(false);
  return (
    <div className="space-y-5">
      {GRUPOS.map((g) => {
        const L = p.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => g.v.includes(estadoVivo(t, p))).sort((a, b) => a.t.dia - b.t.dia);
        if (!L.length) return null;
        const escondido = g.k === "feitas" && !verFeitas;
        return (
          <section key={g.k} aria-label={g.t} className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">{g.t} <span className="rounded-full bg-muted px-2 text-xs tabular-nums">{L.length}</span>
              {g.k === "feitas" && <button type="button" onClick={() => setVerFeitas((x) => !x)} className="text-xs font-normal text-primary underline-offset-4 hover:underline">{verFeitas ? "Esconder" : "Mostrar"}</button>}
            </h3>
            {!escondido && (
              <ul className="overflow-hidden rounded-2xl border border-border bg-card">
                {L.map(({ t, ti }) => {
                  const v = estadoVivo(t, p);
                  const fotos = enviosDe(t).reduce((a, e) => a + (e.fotos?.length ?? 0), 0);
                  return (
                    <li key={ti} className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
                      <button type="button" onClick={() => abrir(ti)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <AvatarTec id={t.tec} />
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-medium">{t.nome}</span>
                          <span className="block truncate text-sm text-muted-foreground">{primeiro(nomeTec(t.tec))} · {quando(t.dia)}{t.dur > 1 ? ` a ${quando(t.dia + t.dur - 1)}` : ""} · {nfmt(t.exec?.horas ?? 0)}/{nfmt(t.h)} h{fotos ? ` · ${fotos} ${fotos === 1 ? "foto" : "fotos"}` : ""}</span>
                        </span>
                      </button>
                      <ChipVivo t={t} p={p} />
                      {planeia && v === "feita" && <Button type="button" size="sm" variant="outline" className="min-h-9 rounded-full" onClick={() => run(() => A.validarTarefa(d.id, ti))}><Check className="mr-1 h-4 w-4" aria-hidden="true" />Validar</Button>}
                      {planeia && v === "pausada" && <Button type="button" size="sm" variant="outline" className="min-h-9 rounded-full" onClick={() => run(() => A.retomarTarefa(d.id, ti))}><Play className="mr-1 h-4 w-4" aria-hidden="true" />Retomar</Button>}
                      <button type="button" aria-label={`Abrir ${t.nome}`} onClick={() => abrir(ti)} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ================================================================== os materiais */
const OK_MAT = new Set(["na obra", "na carrinha", "reservado", "recebido"]);
export function MateriaisDaObra({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { S, A, run } = ctx;
  const db = useInventario();
  const inv = d.obra.ec?.ref ? resumoEcNegocio(db, d.obra.ec.ref) : null;
  const p = d.obra.plano!;
  const G = materiaisPorFase(d, inv);
  const todos = G.flatMap((g) => g.itens), ok = todos.filter((m) => OK_MAT.has(m.estado)).length;
  const planeia = podeNeg(S.role, "obra.planear");
  const [ti, setTi] = useState<number | null>(null);
  const t = ti != null ? p.tasks[ti] : null;
  const pend = porEncomendarDe(d), sobra = aMais(p);
  // o custo do que se pede a mais (ou volta ao armazém): o preço do material, se o tiver; senão o da receita do orçamento
  const custo = (L: { m: MatTarefa; q: number }[]) => L.reduce((a, x) => a + x.q * (x.m.preco ?? custosDosMateriais(d, [{ n: x.m.n, q: x.q }])[0]?.custo ?? 0), 0);
  const cPend = custo(pend), cSobra = custo(sobra);
  return (
    <div className="space-y-6">
      <section aria-label="O que chegou e o que falta" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">O que chegou e o que falta</p>
            <p className="text-sm text-muted-foreground">{todos.length ? `${ok} de ${todos.length} garantidos` : "Sem materiais na encomenda desta obra."}</p>
          </div>
          {d.obra.ec && <Button type="button" variant="outline" className="min-h-10 rounded-full" onClick={() => run(() => A.abrirInv(d.id))}><ArrowUpRight className="mr-1.5 h-4 w-4" aria-hidden="true" />No Inventário</Button>}
        </div>
        {todos.length > 0 && <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${(ok / todos.length) * 100}%` }} /></div>}
        <div className="grid gap-3 lg:grid-cols-2">
          {G.map((g) => (
            <div key={g.fase} className="rounded-2xl border border-border bg-card p-3">
              <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: COR_FASE[g.fase] }} />Fase {g.fase} · {FASES_OBRA[g.fase - 1]?.curto}</p>
              <ul className="space-y-1">
                {g.itens.map((m, k) => (
                  <li key={k} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{m.n} <span className="text-muted-foreground">· {nfmt(m.q)} {m.un}</span></span>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", OK_MAT.has(m.estado) ? "bg-success/15 text-success" : "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200")}>{m.estado}{m.quando ? ` · ${m.quando}` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {planeia && (
        <section aria-label="Pedir mais ou devolver" className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div>
            <p className="text-sm font-semibold">Pedir mais ou devolver</p>
            <p className="text-sm text-muted-foreground">Escolha a tarefa e mude as quantidades. O que sobe vai ao fornecedor numa encomenda de ajuste; o que desce volta ao armazém no fim da obra.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {p.tasks.map((x, i) => estadoVivo(x, p) === "validada" ? null : (
              <button key={i} type="button" aria-pressed={ti === i} onClick={() => setTi(ti === i ? null : i)} className={chip(ti === i)}>{x.nome}</button>
            ))}
          </div>
          {t && ti != null && (
            <EditorMateriais mats={t.mats ?? materiaisDaTarefa(t, S.svc)} mudar={(m) => run(() => A.matsTarefa(d.id, ti, m))} />
          )}
          {(pend.length > 0 || sobra.length > 0) && (
            <div className="space-y-2 rounded-xl bg-muted/50 p-3 text-sm">
              {pend.length > 0 && <p><b className="font-medium">A pedir:</b> {pend.map((x) => `${x.m.n} +${nfmt(x.q)} ${x.m.un}`).join(", ")} <span className="text-muted-foreground">· custo +{eur(cPend)} €</span></p>}
              {sobra.length > 0 && <p><b className="font-medium">Volta ao armazém:</b> {sobra.map((x) => `${x.m.n} −${nfmt(x.q)} ${x.m.un}`).join(", ")} <span className="text-muted-foreground">· −{eur(cSobra)} €</span></p>}
              {pend.length > 0 && <Button type="button" variant="outline" className="min-h-10 rounded-full" onClick={() => run(() => A.encomendarMateriais(d.id))}><Package className="mr-1.5 h-4 w-4" aria-hidden="true" />Encomendar o que falta</Button>}
            </div>
          )}
        </section>
      )}
    </div>
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
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Quem está nesta obra e o que tem por fazer</p>
        {planeia && <Button type="button" variant="outline" className="min-h-10 rounded-full" onClick={() => novaPara(null)}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Juntar uma pessoa</Button>}
      </div>
      {pessoas.map((tec) => {
        const ts = p.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => t.tec === tec);
        const porFazer = ts.filter(({ t }) => { const v = estadoVivo(t, p); return v !== "validada" && v !== "feita"; });
        const fora = blocosForaDaObra(tec, janela, obras, deFerias);
        const tx = TECS.find((x) => x.id === tec);
        const livres = porFazer.length ? tecnicosDoOficio(porFazer[0].t).filter((x) => x.id !== tec && porFazer.every(({ t }) => motivoOcupado(x.id, { dia: Math.max(t.dia, hoje), dur: t.dur }, p, ocup) == null)) : [];
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
              {ts.map(({ t, ti }) => <li key={ti}><button type="button" onClick={() => abrir(ti)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm hover:bg-muted"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: COR_FASE[t.fase ?? 1] }} />{t.nome}<ChipVivo t={t} p={p} /></button></li>)}
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
  const porLer = (d.obra.chat ?? []).filter((m) => m.de === "cliente" && !m.lida).length;
  const vistos = (d.obra.alteracoes ?? []).filter((a) => a.cliente && a.avisoCliente);
  const ads = d.adendas ?? [];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section aria-label="Avisar o cliente" className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Avisar o cliente</p>
        <p className="text-sm text-muted-foreground">Aparece nas novidades da obra, no portal dele. Para mudar datas, use o plano: o aviso vai com a mudança.</p>
        <div className="flex flex-wrap gap-2">{AVISOS_RAPIDOS.map((x) => <button key={x} type="button" onClick={() => setTexto(x)} className={chip(texto === x)}>{x}</button>)}</div>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Escreva o aviso" aria-label="O aviso ao cliente" className="w-full rounded-xl border border-input bg-background px-3 py-2 text-[15px]" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" className="min-h-10 rounded-full" onClick={() => run(() => A.abrirPlano(d.id))}><MessageSquare className="mr-1.5 h-4 w-4" aria-hidden="true" />A conversa{porLer ? ` · ${porLer} por ler` : ""}</Button>
          <Button type="button" variant="outline" className="min-h-10 rounded-full" disabled={!planeia || !texto.trim()} onClick={() => { run(() => A.avisarClienteObra(d.id, texto)); setTexto(""); }}><Send className="mr-1.5 h-4 w-4" aria-hidden="true" />Avisar no portal</Button>
        </div>
      </section>
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
          <label className="grid gap-1 text-sm">Data da vistoria
            <input type="date" value={f.vistoria ?? ""} onChange={(e) => run(() => A.campo(d.id, "vistoria", e.target.value))} className="h-11 rounded-xl border border-input bg-background px-3 text-[15px]" /></label>
          <div className="space-y-1"><p className="text-sm">Auto de receção assinado</p>
            <div className="flex gap-2">{["Sim", "Não"].map((x) => <button key={x} type="button" aria-pressed={f.auto_rececao === x} onClick={() => run(() => A.campo(d.id, "auto_rececao", x))} className={chip(f.auto_rececao === x)}>{x}</button>)}</div></div>
          <div className="space-y-1"><p className="text-sm">Satisfação do cliente</p>
            <div className="flex gap-2">{["1", "2", "3", "4", "5"].map((x) => <button key={x} type="button" aria-pressed={f.satisfacao === x} onClick={() => run(() => A.campo(d.id, "satisfacao", x))} className={cn(chip(f.satisfacao === x), "w-11 justify-center px-0")}>{x}</button>)}</div></div>
          <NotasFecho valor={f.notas_fecho ?? ""} gravar={(v) => run(() => A.campo(d.id, "notas_fecho", v))} />
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
