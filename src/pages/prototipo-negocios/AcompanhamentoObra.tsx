// O acompanhamento da obra (21/10/2026): as peças partilhadas pela página da obra (gestor), pelo negócio (comercial),
// pelo Hoje do técnico e pelo portal do cliente.
// · FitaDias: os dias úteis da obra, para trás e para a frente, com a cor das fases, o "hoje" e o que já tem registo.
// · DiaDaObra: o que se fez (ou se vai fazer) num dia: as tarefas, quem, o passo a passo, os registos com fotografias.
// · HistoricoTarefa: todos os registos de uma tarefa, do primeiro dia à validação (o cliente vê-o sem horas).
// · Fotografias ampliadas num toque (Ampliar).
// A lógica está em trabalhoObra.ts; aqui só se desenha.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Camera, Check, CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock, HardHat, ListChecks, MessageSquareWarning, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TECS, nfmt, type Plano, type Tarefa } from "./motor";
import { COR_FASE } from "./planoObra";
import { FASES_OBRA } from "./fasesObra";
import { rotuloDia } from "./preparacaoObra";
import { fimDe } from "./ajustesPlano";
import { ROTULO_EXEC, estadoDe, iniciais, type EstadoExec } from "./obraOps";
import { diaDaTarefa, enviosDe, instrucoesDe, oDia, passosFeitos, registouNoDia, rotuloDiaTarefa, tempoDoDia, type Envio } from "./trabalhoObra";

const COR_TEC = ["#7c5ce0", "#0e7490", "#b45309", "#be185d", "#15803d", "#4338ca"];
export const corTec = (id: string | null) => COR_TEC[Math.max(0, TECS.findIndex((x) => x.id === id)) % COR_TEC.length];
export const nomeTec = (id: string | null) => TECS.find((x) => x.id === id)?.n ?? "sem técnico";
export function AvatarTec({ id, tam = "h-8 w-8" }: { id: string | null; tam?: string }) {
  const n = nomeTec(id);
  return <span className={cn("grid shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white ring-2 ring-card", tam)} style={{ background: corTec(id) }} title={n} aria-hidden="true">{iniciais(n)}</span>;
}
const corDe = (t: Tarefa) => (t.fase ? COR_FASE[t.fase] : "#7c5ce0");

const TOM: Record<EstadoExec, string> = {
  "por fazer": "bg-muted text-muted-foreground", "em curso": "bg-primary/10 text-primary", feita: "bg-warning/15 text-foreground",
  validada: "bg-success/15 text-foreground", corrigir: "bg-destructive/10 text-destructive",
};
export function ChipEstado({ e, cliente }: { e: EstadoExec; cliente?: boolean }) {
  const I = e === "validada" ? CheckCircle2 : e === "feita" ? Clock : e === "corrigir" ? AlertTriangle : e === "em curso" ? HardHat : Circle;
  // o cliente não vê "a corrigir" nem "por validar": vê em curso até estar validada
  const rot = cliente ? (e === "validada" ? "concluída" : e === "por fazer" ? "por começar" : e === "feita" ? "a verificar" : "a decorrer") : ROTULO_EXEC[e];
  const tom = cliente ? (e === "validada" ? TOM.validada : e === "por fazer" ? TOM["por fazer"] : TOM["em curso"]) : TOM[e];
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-sm font-medium", tom)}><I className="h-3.5 w-3.5" aria-hidden="true" />{rot}</span>;
}

/* ------------------------------------------------------------------ as fotografias ampliadas */
export function Ampliar({ fotos, i, fechar }: { fotos: string[]; i: number; fechar: () => void }) {
  const [k, setK] = useState(i);
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); if (e.key === "ArrowRight") setK((x) => Math.min(fotos.length - 1, x + 1)); if (e.key === "ArrowLeft") setK((x) => Math.max(0, x - 1)); };
    window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f);
  }, [fotos.length, fechar]);
  // por cima de tudo (também do portal do cliente, que já é uma camada): vai para o body
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Fotografia" className="fixed inset-0 z-[1000] grid place-items-center bg-black/85 p-4 animate-in fade-in-0" onClick={fechar}>
      <img src={fotos[k]} alt={`Fotografia ${k + 1} de ${fotos.length}`} className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-2xl animate-in zoom-in-95" onClick={(e) => e.stopPropagation()} />
      <button type="button" onClick={fechar} aria-label="Fechar" className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"><X className="h-5 w-5" /></button>
      {fotos.length > 1 && (
        <div className="absolute bottom-6 flex items-center gap-3 text-white" onClick={(e) => e.stopPropagation()}>
          <button type="button" disabled={k === 0} onClick={() => setK(k - 1)} aria-label="Anterior" className="grid h-11 w-11 place-items-center rounded-full bg-white/15 disabled:opacity-30"><ChevronLeft className="h-5 w-5" /></button>
          <span className="tabular-nums">{k + 1} / {fotos.length}</span>
          <button type="button" disabled={k === fotos.length - 1} onClick={() => setK(k + 1)} aria-label="Seguinte" className="grid h-11 w-11 place-items-center rounded-full bg-white/15 disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
        </div>
      )}
    </div>,
    document.body,
  );
}
export function Miniaturas({ fotos, tam = "h-20 w-28" }: { fotos: string[]; tam?: string }) {
  const [aberta, setAberta] = useState<number | null>(null);
  if (!fotos.length) return null;
  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {fotos.map((f, k) => (
          <button key={k} type="button" onClick={() => setAberta(k)} aria-label={`Ampliar a fotografia ${k + 1}`} className="overflow-hidden rounded-lg border border-border transition-transform hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-primary">
            <img src={f} alt="" className={cn("object-cover", tam)} />
          </button>
        ))}
      </div>
      {aberta != null && <Ampliar fotos={fotos} i={aberta} fechar={() => setAberta(null)} />}
    </>
  );
}

/* ------------------------------------------------------------------ a fita dos dias */
/** Os dias úteis da obra: escolher um dia (para trás ou para a frente). `hoje`: o dia de hoje do plano (em curso). */
export function FitaDias({ p, sel, setSel, rotulo = "Dias da obra" }: { p: Plano; sel: number; setSel: (k: number) => void; rotulo?: string }) {
  const nd = Math.max(1, fimDe(p.tasks)), hoje = p.estado === "em curso" ? p.dia : null;
  const caixa = useRef<HTMLDivElement>(null);
  // o dia escolhido fica ao centro da fita (só na horizontal: a página não salta)
  useEffect(() => {
    const c = caixa.current, b = c?.querySelector<HTMLElement>(`[data-dia="${sel}"]`);
    if (c && b && typeof c.scrollTo === "function") c.scrollTo({ left: b.offsetLeft - c.clientWidth / 2 + b.clientWidth / 2, behavior: "smooth" });
  }, [sel]);
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => setSel(Math.max(0, sel - 1))} disabled={sel <= 0} aria-label="Dia anterior"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-input bg-card transition-colors hover:border-foreground/40 disabled:opacity-30"><ChevronLeft className="h-5 w-5" /></button>
      <div ref={caixa} role="tablist" aria-label={rotulo} className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-0.5 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {Array.from({ length: nd }, (_, k) => {
          const ts = p.tasks.filter((t) => diaDaTarefa(t, k) != null);
          const fases = [...new Set(ts.map((t) => t.fase ?? 0))];
          const tudo = ts.length > 0 && ts.every((t) => estadoDe(t) === "validada") || p.estado === "concluída";
          const reg = ts.some((t) => registouNoDia(t, k));
          const [ds, dn] = rotuloDia(p, k).replace(",", "").split(" ");
          const on = sel === k;
          return (
            <button key={k} type="button" role="tab" aria-selected={on} data-dia={k} onClick={() => setSel(k)}
              aria-label={`Dia ${k + 1}, ${rotuloDia(p, k)}${hoje === k ? ", hoje" : ""}${tudo ? ", tudo validado" : reg ? ", com registos" : ""}`}
              className={cn("relative flex min-h-[3.75rem] w-14 shrink-0 flex-col items-center justify-center rounded-xl border text-center transition-all",
                on ? "border-primary bg-primary text-primary-foreground shadow-md" : hoje === k ? "border-primary/60 bg-primary/[0.06]" : "border-input bg-card hover:border-foreground/40")}>
              <span className={cn("text-[11px] leading-4", on ? "text-primary-foreground/85" : hoje === k ? "font-semibold text-primary" : "text-muted-foreground")}>{hoje === k ? "hoje" : ds}</span>
              <span className="text-[15px] font-semibold tabular-nums leading-5">{dn}</span>
              <span className="mt-1 flex h-1.5 gap-0.5" aria-hidden="true">
                {fases.map((f) => <span key={f} className="h-1.5 w-3 rounded-full" style={{ background: on ? "rgba(255,255,255,.85)" : COR_FASE[f] ?? "#7c5ce0" }} />)}
              </span>
              {(tudo || reg) && <span className={cn("absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full ring-2 ring-background", tudo ? "bg-success text-white" : "bg-warning text-white")} aria-hidden="true">{tudo ? <Check className="h-2.5 w-2.5" /> : <Camera className="h-2.5 w-2.5" />}</span>}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={() => setSel(Math.min(nd - 1, sel + 1))} disabled={sel >= nd - 1} aria-label="Dia seguinte"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-input bg-card transition-colors hover:border-foreground/40 disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
    </div>
  );
}

/* ------------------------------------------------------------------ um registo e o histórico de uma tarefa */
const ROT_ENVIO: Record<Envio["k"], string> = { registo: "Registo do dia", feita: "Terminou a tarefa", validada: "Validada pelo responsável de obra", correcao: "Correção pedida" };
export function EnvioItem({ e, p, cliente, ultimo }: { e: Envio; p: Plano; cliente?: boolean; ultimo?: boolean }) {
  const quem = cliente ? e.quem.split(" ")[0] : e.quem;
  const I = e.k === "validada" ? CheckCircle2 : e.k === "correcao" ? MessageSquareWarning : e.k === "feita" ? Check : Camera;
  const tom = e.k === "validada" ? "bg-success text-white" : e.k === "correcao" ? "bg-destructive text-white" : e.k === "feita" ? "bg-primary text-primary-foreground" : "bg-card text-primary border border-primary/40";
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {!ultimo && <span aria-hidden="true" className="absolute bottom-0 left-[13px] top-8 w-px bg-border" />}
      <span className={cn("relative z-[1] grid h-7 w-7 shrink-0 place-items-center rounded-full", tom)} aria-hidden="true"><I className="h-3.5 w-3.5" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px]"><b className="font-semibold">{cliente && e.k === "correcao" ? "Revisão do responsável de obra" : ROT_ENVIO[e.k]}</b>
          <span className="text-muted-foreground"> · {quem} · {e.q.startsWith("hoje") ? `${rotuloDia(p, e.dia)}, ${e.q.slice(5)}` : e.q}{!cliente && e.horas ? ` · ${nfmt(e.horas)} h` : ""}</span></p>
        {e.nota && (!cliente || e.k !== "correcao") && <p className="mt-0.5 text-[15px] leading-relaxed">{e.nota}</p>}
        {e.passos && e.passos.length > 0 && <PassosFeitos passos={e.passos} />}
        <Miniaturas fotos={e.fotos ?? []} />
      </div>
    </li>
  );
}
/** Os passos feitos num registo: até 3 à vista; mais do que isso, num toque. */
function PassosFeitos({ passos }: { passos: string[] }) {
  const [todos, setTodos] = useState(false);
  const V = todos || passos.length <= 3 ? passos : passos.slice(0, 2);
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Passos feitos">
      {V.map((x) => <li key={x} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-sm"><Check className="h-3 w-3 text-success" aria-hidden="true" />{x}</li>)}
      {V.length < passos.length && <li><button type="button" onClick={() => setTodos(true)} className="rounded-full border border-border px-2 py-0.5 text-sm font-medium text-primary hover:bg-muted">+{passos.length - V.length} passos</button></li>}
    </ul>
  );
}

/** Todos os registos de uma tarefa, do mais antigo para o mais recente. */
export function HistoricoTarefa({ t, p, cliente }: { t: Tarefa; p: Plano; cliente?: boolean }) {
  const L = enviosDe(t).filter((e) => !cliente || e.k !== "correcao");
  if (!L.length) return <p className="text-[15px] text-muted-foreground">{cliente ? "Ainda sem fotografias desta parte da obra." : "Ainda sem registos do técnico."}</p>;
  return <ol className="mt-1">{L.map((e, k) => <EnvioItem key={k} e={e} p={p} cliente={cliente} ultimo={k === L.length - 1} />)}</ol>;
}

/* ------------------------------------------------------------------ um dia da obra */
/** O que se passa num dia: as tarefas desse dia, cada uma com o estado, o passo a passo e os registos desse dia. */
export function DiaDaObra({ p, dia, modo, acoes }: { p: Plano; dia: number; modo: "gestor" | "comercial" | "cliente"; acoes?: (ti: number) => React.ReactNode }) {
  const L = oDia(p, dia), tempo = tempoDoDia(p, dia), cliente = modo === "cliente";
  const titulo = tempo === "hoje" ? "Hoje" : tempo === "passado" ? "O que se fez" : "O que está previsto";
  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300" key={dia}>
      <p className="text-sm font-medium text-muted-foreground">{titulo} · dia {dia + 1} de {Math.max(1, fimDe(p.tasks))}, {rotuloDia(p, dia)}</p>
      {!L.length ? <p className="mt-2 text-[15px] text-muted-foreground">Sem trabalho previsto neste dia.</p> : (
        <ul className="mt-2 space-y-3">
          {L.map(({ ti, t, envios }) => {
            const ex = p.estado === "concluída" ? "validada" : estadoDe(t), I = instrucoesDe(t), feitos = passosFeitos(t).length;
            const semRegisto = !cliente && tempo === "passado" && !envios.length && ex !== "validada" && diaDaTarefa(t, dia) != null;
            const fase = t.fase ? FASES_OBRA[t.fase - 1] : null;
            return (
              <li key={ti} className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]">
                <div className="flex">
                  <span className="w-1.5 shrink-0" style={{ background: corDe(t) }} aria-hidden="true" />
                  <div className="min-w-0 flex-1 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-3">
                        {!cliente && <AvatarTec id={t.tec} tam="h-9 w-9" />}
                        <div className="min-w-0">
                          <p className="text-base font-semibold">{t.nome}</p>
                          <p className="text-sm text-muted-foreground">
                            {cliente ? fase?.curto ?? "" : nomeTec(t.tec)}{fase && !cliente ? ` · ${fase.curto}` : ""}{diaDaTarefa(t, dia) != null ? ` · ${rotuloDiaTarefa(t, dia)}` : ""}
                            {!cliente && <> · {nfmt(t.exec?.horas ?? 0)} de {nfmt(t.h)} h</>}
                          </p>
                        </div>
                      </div>
                      <ChipEstado e={ex} cliente={cliente} />
                    </div>
                    {!cliente && (
                      <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                        <ListChecks className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true"><span className="block h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(ex === "validada" ? 1 : feitos / I.passos.length) * 100}%` }} /></span>
                        <span className="tabular-nums">{ex === "validada" ? I.passos.length : feitos} de {I.passos.length} passos</span>
                      </div>
                    )}
                    {t.exec?.estado === "corrigir" && t.exec.motivo && !cliente && <p className="mt-3 rounded-lg bg-destructive/[0.06] px-3 py-2 text-[15px]"><b className="font-medium">Correção pedida:</b> {t.exec.motivo}</p>}
                    {semRegisto && <p className="mt-3 flex items-center gap-2 text-[15px] text-warning"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />Sem registo do técnico neste dia.</p>}
                    {envios.length > 0 && <ol className="mt-3 border-t border-border pt-3">{envios.filter((e) => !cliente || e.k !== "correcao").map((e, k, A) => <EnvioItem key={k} e={e} p={p} cliente={cliente} ultimo={k === A.length - 1} />)}</ol>}
                    {tempo === "futuro" && !envios.length && (
                      <p className="mt-3 text-[15px] text-muted-foreground">{cliente ? "Previsto para este dia." : `Previsto: ${I.passos.slice(0, 3).join(" · ").toLowerCase()}${I.passos.length > 3 ? "…" : ""}`}</p>
                    )}
                    {tempo === "hoje" && !envios.length && ex !== "validada" && ex !== "feita" && (
                      <p className="mt-3 text-[15px] text-muted-foreground">{cliente ? "A equipa está a trabalhar nisto hoje." : ex === "por fazer" ? "Ainda não começou hoje." : "A trabalhar. O registo do dia chega ao fim da tarde."}</p>
                    )}
                    {acoes?.(ti)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
