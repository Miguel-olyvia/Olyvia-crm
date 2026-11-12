// 12/11/2026 (Rúben: «melhorar muito a gestão da obra… go all in, crazy innovation mode, deixa isto WOW», «sem limites»). As peças vivas do
// Estúdio da obra (a lógica está em previsaoObra.ts):
//  · Pulso: os números da obra, cada um um botão que leva ao sítio dele, com o anel do feito, o fim provável e a margem ao vivo;
//  · ComandoHoje: quem está na obra hoje e o que faz, «Precisa de ti» (cada coisa num toque) e o que vem a seguir (entregas, amanhã);
//  · PrevisaoViva: as horas planeadas contra as reais (gráfico), o fim provável com a confiança, a margem ao vivo em degraus e o caminho
//    crítico;
//  · AgendaEquipa: a semana de cada pessoa em blocos (esta obra, outra obra com o nome, férias, livre); arrastar uma tarefa para outra pessoa;
//  · DiarioObra: o antes e o depois com um deslizador, as fotografias e o diário;
//  · PontoDaSemana: o resumo para o cliente, escrito sozinho, para rever e publicar no portal;
//  · Entregas: a linha do tempo dos materiais (chega hoje, amanhã, a dd/mm).
import { useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowUpRight, CalendarCheck, Camera, Check, ChevronLeft, ChevronRight, Euro, Flame, Gauge, HardHat, Inbox, Package, Send, Sparkles, Truck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TECS, eur, nfmt, type Estado, type Negocio } from "../motor";
import type { Ctx } from "../pecas";
import { COR_FASE } from "../fasesObra";
import { dataCurta } from "../planoObra";
import { blocosForaDaObra, obrasDosTecnicos } from "../preparacaoObra";
import { materiaisPorFase, progresso } from "../obraOps";
import { porEncomendarDe } from "../encomendasAjuste";
import { imprevistosDe } from "../imprevistos";
import { emCurso, valorContrato } from "../adendas";
import { ausenteNoRh } from "../equipa/tecnicos";
import { AvatarTec, Miniaturas, nomeTec } from "../AcompanhamentoObra";
import { Contagem, MOLA, useReduzir } from "../movimento";
import { podeNeg } from "../permissoes";
import { estadoVivo, rotuloVivo } from "./planoVivo";
import { antesEDepois, caminhoCritico, diarioDaObra, fotografiasDaObra, hojeNaObra, margemAoVivo, pontoDaSemana, previsao, type MargemViva, type Previsao } from "./previsaoObra";

const primeiro = (n: string) => n.split(" ")[0];
const pct = (x: number) => `${Math.round(x * 1000) / 10}%`.replace(".", ",");
const quandoDe = (dias: Date[]) => (k: number) => (dias[k] ? dataCurta(dias[k]) : `dia ${k + 1}`);

/** O que o Estúdio liga às peças (para cada coisa se fazer num toque). */
export interface Ir {
  tarefa: (ti: number) => void; aba: (a: "plano" | "execucao" | "diario" | "materiais" | "equipa" | "cliente" | "fecho") => void;
  replanear: () => void; imprevisto: (id?: string) => void; previsao: () => void; comando: () => void; outra: (o: Negocio) => void;
}

/* ================================================================== o pulso */
function Mosaico({ rotulo, icone, children, sub, tom, onClick, extra }: { rotulo: string; icone: ReactNode; children: ReactNode; sub?: ReactNode; tom?: "bom" | "mau"; onClick: () => void; extra?: ReactNode }) {
  const reduzir = useReduzir();
  return (
    <motion.button type="button" onClick={onClick} whileHover={reduzir ? undefined : { y: -2 }} whileTap={reduzir ? undefined : { scale: 0.98 }}
      className="group relative flex min-h-[92px] items-center gap-3 overflow-hidden rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      {extra}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span aria-hidden="true" className="text-primary">{icone}</span>{rotulo}</span>
        <span className="mt-0.5 block overflow-hidden whitespace-nowrap text-xl font-semibold tabular-nums">{children}</span>
        {sub && <span className={cn("block truncate text-xs", tom === "mau" ? "font-medium text-destructive" : tom === "bom" ? "font-medium text-success" : "text-muted-foreground")}>{sub}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
    </motion.button>
  );
}
function Anel({ valor, cor = "hsl(var(--primary))" }: { valor: number; cor?: string }) {
  const reduzir = useReduzir(), r = 20, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="24" cy="24" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
      <motion.circle cx="24" cy="24" r={r} fill="none" stroke={cor} strokeWidth="5" strokeLinecap="round" strokeDasharray={c}
        initial={reduzir ? false : { strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, valor))) }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
    </svg>
  );
}
export function Pulso({ d, S, dias, prev, margem, precisa, ir }: { d: Negocio; S: Estado; dias: Date[]; prev: Previsao; margem: MargemViva | null; precisa: number; ir: Ir }) {
  const p = d.obra.plano!, quando = quandoDe(dias);
  const ims = imprevistosDe(d), abertos = ims.filter((i) => i.estado !== "fechado" && i.estado !== "aprovado");
  const val = (() => { try { return valorContrato(d, S); } catch { return null; } })();
  const dif = prev.fimProvavel - prev.fimPlano;
  return (
    <section aria-label="O pulso da obra" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <Mosaico rotulo="Feito" icone={<Gauge className="h-4 w-4" />} onClick={() => ir.aba("execucao")} extra={<Anel valor={progresso(p)} />}
        sub={`${p.tasks.filter((t) => estadoVivo(t, p) === "validada").length} de ${p.tasks.length} validadas`}>
        <Contagem valor={Math.round(progresso(p) * 100)} fmt={(n) => `${Math.round(n)}%`} de={0} />
      </Mosaico>
      <Mosaico rotulo="Fim provável" icone={<CalendarCheck className="h-4 w-4" />} onClick={ir.previsao} tom={dif > 0 ? "mau" : dif < 0 ? "bom" : undefined}
        sub={<>{dif === 0 ? "como o plano" : dif > 0 ? `+${dif} face ao plano` : `${-dif} antes do plano`} · confiança {prev.confianca}</>}>
        {quando(prev.fimProvavel - 1)}
      </Mosaico>
      <Mosaico rotulo="Margem ao vivo" icone={<Euro className="h-4 w-4" />} onClick={ir.previsao} tom={margem ? (margem.margemViva < margem.margemOrc - 0.005 ? "mau" : "bom") : undefined}
        sub={margem ? `orçamento ${pct(margem.margemOrc)}` : "sem orçamento"}>
        {margem ? pct(margem.margemViva) : "—"}
      </Mosaico>
      <Mosaico rotulo="Precisa de ti" icone={<Inbox className="h-4 w-4" />} onClick={ir.comando} tom={precisa ? "mau" : "bom"} sub={precisa ? "toque para tratar" : "nada à espera"}>
        <Contagem valor={precisa} fmt={(n) => String(Math.round(n))} de={0} />
      </Mosaico>
      <Mosaico rotulo="Imprevistos" icone={<AlertTriangle className="h-4 w-4" />} onClick={() => ir.imprevisto()} tom={abertos.length ? "mau" : undefined}
        sub={ims.length ? `${ims.length} no total` : "nenhum"}>
        <Contagem valor={abertos.length} fmt={(n) => String(Math.round(n))} de={0} />
      </Mosaico>
      <Mosaico rotulo="Valor da obra" icone={<Euro className="h-4 w-4" />} onClick={() => ir.aba("cliente")} sub={[val?.adendas ? `com ${eur(val.adendas)} € de adendas` : "com IVA", (d.adendas ?? []).filter((a) => a.estado === "rascunho").length ? `${(d.adendas ?? []).filter((a) => a.estado === "rascunho").length} por disparar` : "", (d.adendas ?? []).filter((a) => emCurso(a) && a.estado !== "rascunho").length ? `${(d.adendas ?? []).filter((a) => emCurso(a) && a.estado !== "rascunho").length} à espera do cliente` : ""].filter(Boolean).join(" · ")}>
        {val ? `${eur(val.total)} €` : "—"}
      </Mosaico>
    </section>
  );
}

/* ================================================================== o comando de hoje */
export interface Pedido { k: string; t: string; sub?: string; rot: string; fn: () => void; nivel: "critico" | "atencao" }
/** O que precisa do gestor, com o toque que resolve cada coisa. */
export function precisaDeTi(ctx: Ctx, d: Negocio, ir: Ir): Pedido[] {
  const { S, A, run } = ctx;
  const p = d.obra.plano!, L: Pedido[] = [];
  if (!podeNeg(S.role, "obra.planear") || p.estado !== "em curso") return L;
  p.tasks.forEach((t, ti) => { if (estadoVivo(t, p) === "feita") L.push({ k: "v" + ti, t: `Validar ${t.nome.toLowerCase()}`, sub: `${primeiro(nomeTec(t.tec))} deu-a por feita, com ${t.exec?.fotos.length ?? 0} ${t.exec?.fotos.length === 1 ? "fotografia" : "fotografias"}`, rot: "Validar", fn: () => run(() => A.validarTarefa(d.id, ti)), nivel: "atencao" }); });
  for (const im of imprevistosDe(d)) {
    if (im.estado === "aberto") L.push({ k: "i" + im.id, t: `Imprevisto: ${im.texto}`, sub: "Falta a proposta ao cliente (ou resolver sem custo)", rot: "Tratar", fn: () => ir.imprevisto(im.id), nivel: "critico" });
    if (im.estado === "recusado") L.push({ k: "i" + im.id, t: `O cliente recusou: ${im.texto}`, sub: "Decida o que fazer", rot: "Decidir", fn: () => ir.imprevisto(im.id), nivel: "critico" });
  }
  const atr = p.tasks.filter((t) => estadoVivo(t, p) === "atrasada");
  if (atr.length) L.push({ k: "atr", t: `${atr.length} ${atr.length === 1 ? "tarefa atrasada" : "tarefas atrasadas"}`, sub: atr.map((t) => t.nome).join(", "), rot: "Pôr em dia", fn: ir.replanear, nivel: "critico" });
  // devia ter começado e ainda não tem nada do técnico
  p.tasks.forEach((t, ti) => { if (estadoVivo(t, p) === "hoje" && t.dia < p.dia && !t.exec) L.push({ k: "c" + ti, t: `${t.nome} ainda não começou`, sub: `Era para ${t.dia === p.dia - 1 ? "ontem" : "dias atrás"} · ${primeiro(nomeTec(t.tec))}`, rot: "Ver", fn: () => ir.tarefa(ti), nivel: "atencao" }); });
  const porLer = (d.obra.chat ?? []).filter((m) => m.de === "cliente" && !m.lida).length;
  if (porLer) L.push({ k: "chat", t: `${porLer} ${porLer === 1 ? "mensagem do cliente" : "mensagens do cliente"}`, sub: (d.obra.chat ?? []).filter((m) => m.de === "cliente" && !m.lida).slice(-1)[0]?.t, rot: "Responder", fn: () => ir.aba("cliente"), nivel: "atencao" });
  const pend = porEncomendarDe(d);
  if (pend.length) L.push({ k: "mat", t: `${pend.length} ${pend.length === 1 ? "material por encomendar" : "materiais por encomendar"}`, sub: pend.slice(0, 3).map((x) => x.m.n).join(", "), rot: "Encomendar", fn: () => run(() => A.encomendarMateriais(d.id)), nivel: "atencao" });
  const pausadas = p.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => estadoVivo(t, p) === "pausada");
  for (const { t, ti } of pausadas) L.push({ k: "p" + ti, t: `${t.nome} está pausada`, sub: t.exec?.pausa?.motivo, rot: "Retomar", fn: () => run(() => A.retomarTarefa(d.id, ti)), nivel: "atencao" });
  return L.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "critico" ? -1 : 1));
}

export function ComandoHoje({ ctx, d, dias, pedidos, ir, comandoRef }: { ctx: Ctx; d: Negocio; dias: Date[]; pedidos: Pedido[]; ir: Ir; comandoRef: React.RefObject<HTMLElement> }) {
  const reduzir = useReduzir();
  const p = d.obra.plano!, H = hojeNaObra(p), quando = quandoDe(dias);
  const [feitos, setFeitos] = useState<string[]>([]);
  const vivo = p.estado === "em curso";
  // o que vem a seguir: as entregas de material e as tarefas de amanhã
  const entregas = materiaisPorFase(d).flatMap((g) => g.itens).filter((m) => m.estado === "a chegar" || m.estado === "encomendado" || m.estado === "por encomendar" || m.estado === "em falta").slice(0, 3);
  const amanha = p.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => t.dia === p.dia + 1);
  const visiveis = pedidos.filter((x) => !feitos.includes(x.k));
  return (
    <section ref={comandoRef} aria-label="Hoje na obra" className="scroll-mt-4 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="relative grid grid-cols-1 gap-0 lg:grid-cols-[1.1fr_1.3fr_1fr]">
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        {/* quem está na obra */}
        <div className="relative min-w-0 space-y-3 border-b border-border p-4 lg:border-b-0 lg:border-r">
          <p className="flex items-center gap-2 text-sm font-semibold"><HardHat className="h-4 w-4 text-primary" aria-hidden="true" />{vivo ? `Na obra hoje · ${quando(p.dia)}` : "A obra ainda não arrancou"}</p>
          {vivo && !H.pessoas.length && <p className="text-sm text-muted-foreground">Ninguém tem trabalho marcado para hoje.</p>}
          <ul className="space-y-2">
            {H.pessoas.map(({ tec, tarefas }, i) => (
              <motion.li key={tec ?? "sem"} initial={reduzir ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduzir ? 0 : 0.05 * i }}
                className="flex items-start gap-3 rounded-2xl bg-muted/40 p-2.5">
                <span className="relative"><AvatarTec id={tec} tam="h-9 w-9" />
                  {tarefas.some(({ t }) => t.exec) && <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" /><span className="relative inline-flex h-3 w-3 rounded-full border-2 border-card bg-success" /></span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{nomeTec(tec)}</span>
                  {tarefas.map(({ t, ti }) => (
                    <button key={ti} type="button" onClick={() => ir.tarefa(ti)} className="mt-0.5 flex w-full items-center gap-2 text-left text-sm text-muted-foreground hover:text-foreground">
                      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: COR_FASE[t.fase ?? 1] }} /><span className="truncate">{t.nome}</span><span className="ml-auto shrink-0 text-xs">{rotuloVivo(t, p)}</span>
                    </button>
                  ))}
                </span>
              </motion.li>
            ))}
          </ul>
          {(H.acabaram.length > 0 || H.atrasadas.length > 0) && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {H.acabaram.map(({ t, ti }) => <button key={"a" + ti} type="button" onClick={() => ir.tarefa(ti)} className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-success"><Check className="h-3 w-3" aria-hidden="true" />{t.nome}</button>)}
              {H.atrasadas.map(({ t, ti }) => <button key={"x" + ti} type="button" onClick={() => ir.tarefa(ti)} className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-destructive"><AlertTriangle className="h-3 w-3" aria-hidden="true" />{t.nome}</button>)}
            </div>
          )}
        </div>
        {/* precisa de ti */}
        <div className="relative min-w-0 space-y-2 border-b border-border p-4 lg:border-b-0 lg:border-r">
          <p className="flex items-center gap-2 text-sm font-semibold"><Zap className="h-4 w-4 text-amber-600" aria-hidden="true" />Precisa de ti {visiveis.length > 0 && <span className="rounded-full bg-amber-100 px-2 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">{visiveis.length}</span>}</p>
          <AnimatePresence initial={false} mode="popLayout">
            {!visiveis.length ? (
              <motion.p key="ok" initial={reduzir ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-2 rounded-2xl bg-success/10 px-3 py-3 text-sm text-success">
                <Sparkles className="h-4 w-4" aria-hidden="true" />Nada à espera de ti. A obra anda sozinha.
              </motion.p>
            ) : visiveis.slice(0, 5).map((x) => (
              <motion.div key={x.k} layout={!reduzir} initial={reduzir ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
                className={cn("flex items-center gap-3 rounded-2xl border px-3 py-2", x.nivel === "critico" ? "border-destructive/30 bg-destructive/[0.04]" : "border-border bg-background")}>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{x.t}</span>{x.sub && <span className="block truncate text-xs text-muted-foreground">{x.sub}</span>}</span>
                <Button type="button" size="sm" variant="outline" className="min-h-9 shrink-0 rounded-full" onClick={() => { x.fn(); if (x.k.startsWith("v") || x.k === "mat" || x.k.startsWith("p")) setFeitos((L) => [...L, x.k]); }}>{x.rot}</Button>
              </motion.div>
            ))}
          </AnimatePresence>
          {visiveis.length > 5 && <p className="text-xs text-muted-foreground">e mais {visiveis.length - 5}</p>}
        </div>
        {/* a seguir */}
        <div className="relative min-w-0 space-y-3 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><Truck className="h-4 w-4 text-primary" aria-hidden="true" />A seguir</p>
          {entregas.length ? (
            <ul className="space-y-1.5">{entregas.map((m, k) => (
              <li key={k} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate"><Package className="mr-1.5 inline h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />{m.n}</span>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", m.quando ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200")}>{m.quando ? `chega a ${m.quando}` : m.estado}</span>
              </li>
            ))}</ul>
          ) : <p className="text-sm text-muted-foreground">Os materiais estão todos garantidos.</p>}
          {amanha.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Amanhã começa</p>
              {amanha.map(({ t, ti }) => <button key={ti} type="button" onClick={() => ir.tarefa(ti)} className="flex w-full items-center gap-2 rounded-xl px-1 py-0.5 text-left text-sm hover:bg-muted"><AvatarTec id={t.tec} tam="h-6 w-6" /><span className="truncate">{t.nome}</span></button>)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ================================================================== a previsão viva */
export function PrevisaoViva({ d, dias, prev, margem, critico, ir, previsaoRef }: { d: Negocio; dias: Date[]; prev: Previsao; margem: MargemViva | null; critico: Set<number>; ir: Ir; previsaoRef: React.RefObject<HTMLElement> }) {
  const reduzir = useReduzir();
  const p = d.obra.plano!, quando = quandoDe(dias);
  const W = 640, H = 180, n = Math.max(2, prev.planeadas.length), max = Math.max(prev.totalH, ...prev.reais, 1);
  const X = (k: number) => (k / (n - 1)) * W, Y = (h: number) => H - (h / max) * (H - 16) - 4;
  const linha = (L: number[]) => L.map((h, k) => `${k ? "L" : "M"}${X(k).toFixed(1)},${Y(h).toFixed(1)}`).join(" ");
  const hoje = p.estado === "em curso" ? p.dia : -1;
  const [sob, setSob] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const crit = [...critico].map((ti) => ({ ti, t: p.tasks[ti] })).sort((a, b) => a.t.dia - b.t.dia);
  return (
    <section ref={previsaoRef} aria-label="A previsão viva" className="scroll-mt-4 grid grid-cols-1 gap-4 rounded-3xl border border-border bg-card p-4 shadow-sm lg:grid-cols-[1.6fr_1fr] sm:p-5">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Horas planeadas e reais</p>
            <p className="text-xs text-muted-foreground">Ritmo {prev.ritmo >= 1 ? "a tempo" : "abaixo do plano"}: {Math.round(prev.ritmo * 100)}% · fim provável {quando(prev.fimProvavel - 1)}{prev.ate > prev.de ? ` (entre ${quando(prev.de - 1)} e ${quando(prev.ate - 1)})` : ""}</p>
          </div>
          <ul className="flex gap-3 text-xs text-muted-foreground"><li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-4 border-t-2 border-dashed border-muted-foreground" />Planeadas</li><li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-1 w-4 rounded bg-primary" />Reais</li></ul>
        </div>
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="h-44 w-full touch-none" role="img" aria-label={`Horas: ${nfmt(prev.feitoH)} feitas de ${nfmt(prev.totalH)} previstas`}
          onPointerMove={(e) => { const r = svg.current!.getBoundingClientRect(); const k = Math.round(((e.clientX - r.left) / r.width) * (n - 1)); setSob(Math.max(0, Math.min(n - 1, k))); }} onPointerLeave={() => setSob(null)}>
          {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={0} x2={W} y1={Y(max * f)} y2={Y(max * f)} stroke="hsl(var(--border))" strokeWidth={1} />)}
          {hoje >= 0 && <line x1={X(hoje)} x2={X(hoje)} y1={0} y2={H} stroke="hsl(var(--primary))" strokeOpacity={0.35} strokeWidth={2} />}
          {prev.fimProvavel !== prev.fimPlano && <line x1={X(Math.min(n - 1, prev.fimProvavel - 1))} x2={X(Math.min(n - 1, prev.fimProvavel - 1))} y1={0} y2={H} stroke="hsl(var(--destructive))" strokeDasharray="4 4" strokeWidth={1.5} />}
          <motion.path d={linha(prev.planeadas)} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="6 5"
            initial={reduzir ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }} />
          {prev.reais.length > 1 && <motion.path d={`${linha(prev.reais)} L${X(prev.reais.length - 1)},${H} L0,${H} Z`} fill="hsl(var(--primary))" fillOpacity={0.08} initial={reduzir ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} />}
          {prev.reais.length > 0 && <motion.path d={linha(prev.reais)} fill="none" stroke="hsl(var(--primary))" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
            initial={reduzir ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, delay: 0.2 }} />}
          {sob != null && <>
            <line x1={X(sob)} x2={X(sob)} y1={0} y2={H} stroke="hsl(var(--foreground))" strokeOpacity={0.2} />
            <circle cx={X(sob)} cy={Y(prev.planeadas[sob] ?? 0)} r={4} fill="hsl(var(--muted-foreground))" />
            {prev.reais[sob] != null && <circle cx={X(sob)} cy={Y(prev.reais[sob])} r={5} fill="hsl(var(--primary))" />}
          </>}
        </svg>
        <p className="h-5 text-xs tabular-nums text-muted-foreground">{sob != null ? `${quando(sob)}: ${nfmt(prev.planeadas[sob] ?? 0)} h planeadas${prev.reais[sob] != null ? ` · ${nfmt(prev.reais[sob])} h reais` : ""}` : `${nfmt(prev.feitoH)} de ${nfmt(prev.totalH)} h feitas · passe o dedo no gráfico`}</p>
      </div>
      <div className="min-w-0 space-y-4">
        {margem && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Margem ao vivo</p>
            {[
              { l: "Do orçamento", v: margem.valor - margem.custoOrc, m: margem.margemOrc, base: true },
              { l: "Mão de obra até hoje", v: -margem.desvioMO },
              { l: "O resto, a este ritmo", v: -margem.projecao },
              { l: "Materiais a mais", v: -margem.materiais },
              ...(margem.nossos ? [{ l: "Atrasos e erros nossos", v: -margem.nossos }] : []),
              { l: "Ao vivo", v: margem.valor - margem.custoVivo, m: margem.margemViva, base: true },
            ].filter((x) => x.base || Math.abs(x.v) > 0.5).map((x, k) => {
              const larg = Math.min(100, (Math.abs(x.v) / Math.max(1, margem.valor - margem.custoOrc)) * 100);
              return (
                <div key={k} className="space-y-0.5">
                  <div className="flex justify-between gap-2 text-sm"><span className={cn(x.base && "font-medium")}>{x.l}</span><span className={cn("tabular-nums", !x.base && (x.v < 0 ? "text-destructive" : "text-success"))}>{x.v > 0 && !x.base ? "+" : ""}{eur(x.v)} €{x.m != null ? ` · ${pct(x.m)}` : ""}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><motion.div className={cn("h-full rounded-full", x.base ? "bg-primary" : x.v < 0 ? "bg-destructive" : "bg-success")}
                    initial={reduzir ? false : { width: 0 }} animate={{ width: `${Math.max(2, larg)}%` }} transition={{ duration: 0.7, delay: reduzir ? 0 : 0.08 * k }} /></div>
                </div>
              );
            })}
          </div>
        )}
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Flame className="h-4 w-4 text-destructive" aria-hidden="true" />Caminho crítico</p>
          <p className="text-xs text-muted-foreground">Se uma destas atrasar, a obra acaba mais tarde.</p>
          <div className="flex flex-wrap gap-1.5">{crit.length ? crit.map(({ t, ti }) => (
            <button key={ti} type="button" onClick={() => ir.tarefa(ti)} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/[0.05] px-2.5 text-sm hover:bg-destructive/10">
              <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: COR_FASE[t.fase ?? 1] }} />{t.nome}<span className="text-xs text-muted-foreground">{quando(t.dia)}</span>
            </button>
          )) : <span className="text-sm text-muted-foreground">Todas as tarefas por fazer têm folga.</span>}</div>
        </div>
      </div>
    </section>
  );
}

/* ================================================================== a agenda da equipa */
const SEMANA = ["seg", "ter", "qua", "qui", "sex"];
export function AgendaEquipa({ ctx, d, dias, ir }: { ctx: Ctx; d: Negocio; dias: Date[]; ir: Ir }) {
  const { S, A, run } = ctx;
  const reduzir = useReduzir();
  const p = d.obra.plano!;
  const planeia = podeNeg(S.role, "obra.planear");
  const obras = useMemo(() => obrasDosTecnicos(S, d.id), [S, d.id, S.deals]); // eslint-disable-line react-hooks/exhaustive-deps
  const deFerias = (tec: string, iso: string) => ausenteNoRh(tec, iso) || !!TECS.find((y) => y.id === tec)?.feriasDatas?.includes(iso);
  // a semana: começa na segunda da semana de hoje (ou do início)
  const hoje = p.estado === "em curso" ? p.dia : 0;
  const segundaDe = (k: number) => { let j = k; while (j > 0 && dias[j] && dias[j].getDay() !== 1) j--; return j; };
  const [ini, setIni] = useState(() => segundaDe(hoje));
  const semana = Array.from({ length: 5 }, (_, j) => ini + j).filter((k) => k < dias.length);
  const pessoas = [...new Set(p.tasks.map((t) => t.tec).filter((x): x is string => !!x))];
  const [arr, setArr] = useState<number | null>(null); // a tarefa a ser arrastada
  const [alvo, setAlvo] = useState<string | null>(null);
  const largar = (tec: string, k: number) => {
    const ti = arr; setArr(null); setAlvo(null);
    if (ti == null) return;
    const t = p.tasks[ti];
    run(() => {
      if (t.tec !== tec) A.trocarTec(d.id, ti, tec);
      if (k !== t.dia && !t.exec) A.ajustarTarefa(d.id, ti, { dia: k });
    });
  };
  return (
    <section aria-label="A agenda da equipa" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">A semana de cada pessoa</p>
          <p className="text-xs text-muted-foreground">{planeia ? "Arraste uma tarefa desta obra para outra pessoa ou outro dia. " : ""}Os blocos cinzentos são outras obras (abrem o Estúdio delas).</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Semana anterior" disabled={ini <= 0} onClick={() => setIni(Math.max(0, ini - 5))} className="grid h-10 w-10 place-items-center rounded-full border border-input hover:bg-muted disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[9rem] text-center text-sm tabular-nums">{semana.length ? `${dataCurta(dias[semana[0]])} a ${dataCurta(dias[semana[semana.length - 1]])}` : ""}</span>
          <button type="button" aria-label="Semana seguinte" disabled={ini + 5 >= dias.length} onClick={() => setIni(ini + 5)} className="grid h-10 w-10 place-items-center rounded-full border border-input hover:bg-muted disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[150px_repeat(5,1fr)] border-b border-border text-xs text-muted-foreground">
            <div className="px-3 py-2">Pessoa</div>
            {semana.map((k) => <div key={k} className={cn("px-2 py-2 text-center", k === hoje && p.estado === "em curso" && "font-semibold text-primary")}>{SEMANA[(dias[k].getDay() + 6) % 7] ?? ""} {dias[k].getDate()}{k === hoje && p.estado === "em curso" ? " · hoje" : ""}</div>)}
          </div>
          {pessoas.map((tec) => {
            const fora = blocosForaDaObra(tec, semana.map((k) => dias[k]), obras, deFerias);
            return (
              <div key={tec} className="grid grid-cols-[150px_repeat(5,1fr)] border-b border-border last:border-b-0">
                <div className="flex items-center gap-2 px-3 py-2"><AvatarTec id={tec} tam="h-8 w-8" /><span className="min-w-0"><span className="block truncate text-sm font-medium">{primeiro(nomeTec(tec))}</span><span className="block truncate text-xs text-muted-foreground">{TECS.find((x) => x.id === tec)?.sk}</span></span></div>
                {semana.map((k, j) => {
                  const aqui = p.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => t.tec === tec && k >= t.dia && k < t.dia + t.dur);
                  const b = fora.find((x) => j >= x.ini && j < x.fim);
                  const chave = `${tec}:${k}`;
                  const ocupadoFora = !!b;
                  return (
                    <div key={k} onDragOver={(e) => { if (arr != null && planeia) { e.preventDefault(); setAlvo(chave); } }} onDragLeave={() => setAlvo((x) => (x === chave ? null : x))} onDrop={(e) => { e.preventDefault(); largar(tec, k); }}
                      className={cn("min-h-[64px] space-y-1 border-l border-border p-1.5 transition-colors", alvo === chave && (ocupadoFora ? "bg-destructive/10" : "bg-primary/10"), k === hoje && p.estado === "em curso" && "bg-primary/[0.03]")}>
                      {b && (b.tipo === "obra"
                        ? <button type="button" onClick={() => ir.outra(b.obra!)} className="flex w-full items-center gap-1 rounded-lg bg-muted-foreground/15 px-2 py-1 text-left text-xs hover:bg-muted-foreground/25" title={`Noutra obra: ${b.obra!.nome}${b.obra!.servico ? ` · ${b.obra!.servico}` : ""}`}>
                            <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{b.obra!.nome}{b.obra!.servico ? ` · ${b.obra!.servico}` : ""}</span></button>
                        : <span className="block rounded-lg bg-amber-100 px-2 py-1 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">Férias</span>)}
                      {aqui.map(({ t, ti }) => (
                        <motion.button key={ti} type="button" layout={!reduzir} draggable={planeia} onDragStart={() => setArr(ti)} onDragEnd={() => { setArr(null); setAlvo(null); }} onClick={() => ir.tarefa(ti)}
                          className={cn("flex w-full items-center gap-1 rounded-lg px-2 py-1 text-left text-xs font-medium text-white shadow-sm", planeia && "cursor-grab active:cursor-grabbing", arr === ti && "opacity-40")}
                          style={{ background: COR_FASE[t.fase ?? 1] }} title={`${t.nome} · ${rotuloVivo(t, p)}`}>
                          <span className="truncate">{t.nome}</span>
                        </motion.button>
                      ))}
                      {!b && !aqui.length && <span className="block px-1 text-[11px] text-muted-foreground/70">livre</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {arr != null && <p className="text-xs text-muted-foreground">A largar «{p.tasks[arr]?.nome}»: azul, a pessoa está livre; vermelho, está noutra obra ou de férias.</p>}
    </section>
  );
}

/* ================================================================== o diário */
export function DiarioObra({ d, ir }: { d: Negocio; ir: Ir }) {
  const reduzir = useReduzir();
  const F = diarioDaObra(d), ad = antesEDepois(d), fotos = fotografiasDaObra(d.obra.plano);
  const [corte, setCorte] = useState(50);
  const [n, setN] = useState(12);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.2fr]">
      <div className="min-w-0 space-y-4">
        {ad ? (
          <section aria-label="Antes e depois" className="space-y-2 rounded-3xl border border-border bg-card p-3">
            <p className="px-1 text-sm font-semibold">Antes e depois</p>
            <div className="relative aspect-[4/3] select-none overflow-hidden rounded-2xl bg-muted">
              <img src={ad.antes} alt="Antes" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${corte}%)` }}><img src={ad.depois} alt="Depois" className="h-full w-full object-cover" /></div>
              <div aria-hidden="true" className="absolute inset-y-0 w-1 -translate-x-1/2 bg-white shadow" style={{ left: `${corte}%` }}><span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-foreground shadow">⇆</span></div>
              <span className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">Antes</span>
              <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">Depois</span>
            </div>
            <input type="range" min={0} max={100} value={corte} onChange={(e) => setCorte(Number(e.target.value))} aria-label="Comparar o antes e o depois" className="w-full accent-[hsl(var(--primary))]" />
          </section>
        ) : <p className="rounded-2xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">O antes e o depois aparece quando houver fotografias dos técnicos.</p>}
        {fotos.length > 0 && (
          <section aria-label="As fotografias" className="space-y-2 rounded-3xl border border-border bg-card p-3">
            <p className="flex items-center gap-1.5 px-1 text-sm font-semibold"><Camera className="h-4 w-4 text-primary" aria-hidden="true" />{fotos.length} {fotos.length === 1 ? "fotografia" : "fotografias"}</p>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {fotos.slice(-12).reverse().map((f, k) => (
                <motion.button key={k} type="button" onClick={() => ir.tarefa(f.ti)} title={f.t.nome} initial={reduzir ? false : { opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: reduzir ? 0 : 0.03 * k }}
                  className="group relative aspect-square overflow-hidden rounded-xl bg-muted">
                  <img src={f.foto} alt={f.t.nome} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1 text-[10px] text-white">{f.t.nome}</span>
                </motion.button>
              ))}
            </div>
          </section>
        )}
      </div>
      <section aria-label="O diário da obra" className="min-w-0 space-y-2">
        <p className="text-sm font-semibold">O diário</p>
        {!F.length ? <p className="text-sm text-muted-foreground">Ainda nada no diário.</p> : (
          <ol className="relative space-y-3 border-l-2 border-border pl-5">
            {F.slice(0, n).map((e, k) => (
              <motion.li key={k} className="relative" initial={reduzir ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduzir ? 0 : Math.min(0.3, 0.03 * k) }}>
                <span aria-hidden="true" className={cn("absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ring-4 ring-background",
                  e.k === "ocorrencia" || e.k === "correcao" ? "bg-destructive" : e.k === "validacao" ? "bg-success" : e.k === "marco" ? "bg-amber-500" : "bg-primary")} />
                <p className="text-[15px]">{e.t}</p>
                <p className="text-xs text-muted-foreground">{e.q} · {e.quem}</p>
                {e.fotos.length > 0 && <div className="mt-1.5"><Miniaturas fotos={e.fotos} tam="h-14 w-20" /></div>}
              </motion.li>
            ))}
          </ol>
        )}
        {F.length > n && <button type="button" onClick={() => setN(n + 12)} className="min-h-10 text-sm font-medium text-primary">Ver mais</button>}
      </section>
    </div>
  );
}

/* ================================================================== o ponto da semana */
export function PontoDaSemana({ ctx, d, dias }: { ctx: Ctx; d: Negocio; dias: Date[] }) {
  const { S, A, run } = ctx;
  const p = d.obra.plano!;
  const sugerido = pontoDaSemana(p, quandoDe(dias));
  const [texto, setTexto] = useState(sugerido);
  const [feito, setFeito] = useState(false);
  const fotos = fotografiasDaObra(p).slice(-4).map((f) => f.foto);
  const planeia = podeNeg(S.role, "obra.planear");
  return (
    <section aria-label="O ponto da semana" className="space-y-3 rounded-2xl border border-primary/30 bg-primary/[0.03] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />O ponto da semana</p>
        {texto !== sugerido && <button type="button" onClick={() => setTexto(sugerido)} className="text-xs text-primary underline-offset-4 hover:underline">Repor o sugerido</button>}
      </div>
      <p className="text-xs text-muted-foreground">Escrito a partir da obra: o que ficou feito, o que está a decorrer e quando acaba. Reveja antes de publicar.</p>
      {/* a pré-visualização: como o cliente vê no portal */}
      <div className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
        <p className="mb-1 text-xs text-muted-foreground">No portal de {d.nome.split(" ")[0]}</p>
        <textarea value={texto} onChange={(e) => { setTexto(e.target.value); setFeito(false); }} rows={4} aria-label="O ponto da semana" className="w-full resize-y rounded-xl bg-transparent text-[15px] outline-none" />
        {fotos.length > 0 && <div className="mt-2"><Miniaturas fotos={fotos} tam="h-14 w-20" /></div>}
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="outline" className="min-h-10 rounded-full" disabled={!planeia || !texto.trim() || feito} onClick={() => { run(() => A.avisarClienteObra(d.id, texto)); setFeito(true); }}>
          {feito ? <><Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Publicado</> : <><Send className="mr-1.5 h-4 w-4" aria-hidden="true" />Publicar no portal</>}
        </Button>
      </div>
    </section>
  );
}

/* ================================================================== as entregas */
export function Entregas({ d }: { d: Negocio }) {
  const reduzir = useReduzir();
  const itens = materiaisPorFase(d).flatMap((g) => g.itens.map((m) => ({ ...m, fase: g.fase })));
  const ok = new Set(["na obra", "na carrinha", "reservado", "recebido"]);
  const ordem = [...itens].sort((a, b) => Number(ok.has(a.estado)) - Number(ok.has(b.estado)) || (a.quando ?? "99").localeCompare(b.quando ?? "99"));
  if (!ordem.length) return null;
  return (
    <section aria-label="As entregas" className="space-y-2 rounded-2xl border border-border bg-card p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold"><Truck className="h-4 w-4 text-primary" aria-hidden="true" />As entregas</p>
      <ol className="relative space-y-2 border-l-2 border-border pl-5">
        {ordem.map((m, k) => (
          <motion.li key={k} className="relative" initial={reduzir ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduzir ? 0 : 0.03 * k }}>
            <span aria-hidden="true" className={cn("absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ring-4 ring-card", ok.has(m.estado) ? "bg-success" : m.quando ? "bg-primary" : "bg-amber-500")} />
            <p className="text-sm"><span className="font-medium">{m.n}</span> <span className="text-muted-foreground">· {nfmt(m.q)} {m.un} · fase {m.fase}</span></p>
            <p className={cn("text-xs", ok.has(m.estado) ? "text-success" : "text-muted-foreground")}>{ok.has(m.estado) ? `✓ ${m.estado}` : m.quando ? `chega a ${m.quando}${m.forn ? ` · ${m.forn}` : ""}` : m.estado}</p>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}

/* ================================================================== o fecho: as fotografias finais, o auto e a garantia */
export function FechoVivo({ d, ir }: { d: Negocio; ir: Ir }) {
  const p = d.obra.plano!;
  const ultimas = p.tasks.map((t, ti) => ({ t, ti, f: [...(t.exec?.envios ?? [])].reverse().find((e) => e.fotos?.length)?.fotos?.[0] ?? t.exec?.fotos?.[0] })).filter((x) => x.f);
  const auto = d.obra.auto;
  return (
    <section aria-label="A vistoria e a garantia" className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-semibold">As fotografias da vistoria</p>
      {ultimas.length ? (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
          {ultimas.map(({ t, ti, f }) => (
            <button key={ti} type="button" onClick={() => ir.tarefa(ti)} className="group relative aspect-square overflow-hidden rounded-xl bg-muted" title={t.nome}>
              <img src={f!} alt={t.nome} className="h-full w-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 truncate bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1 text-[10px] text-white">{estadoVivo(t, p) === "validada" && <Check className="h-3 w-3" aria-hidden="true" />}{t.nome}</span>
            </button>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">Ainda sem fotografias finais.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className={cn("rounded-xl p-3 text-sm", auto?.estado === "assinado" ? "bg-success/10" : "bg-muted/50")}>
          <p className="font-medium">Auto de receção</p>
          <p className="text-muted-foreground">{!auto ? "Vai ao portal do cliente ao encerrar a obra." : auto.estado === "assinado" ? `Assinado ${auto.assinado ?? ""}${auto.reservas ? ` · reservas: ${auto.reservas}` : " · sem reservas"}` : `${auto.n} no portal, por assinar`}</p>
        </div>
        <div className={cn("rounded-xl p-3 text-sm", auto?.estado === "assinado" ? "bg-success/10" : "bg-muted/50")}>
          <p className="font-medium">Garantia</p>
          <p className="text-muted-foreground">{auto?.estado === "assinado" ? `Conta a partir de ${auto.assinado?.split(" ")[0] ?? "a assinatura do auto"}.` : "Começa com o auto de receção assinado."}</p>
        </div>
      </div>
    </section>
  );
}

/** Para o Estúdio: os números que as peças partilham (calculados uma vez por desenho). */
export function obraViva(d: Negocio, S: Estado) {
  const p = d.obra.plano;
  return {
    prev: p ? previsao(p) : null,
    margem: p ? margemAoVivo(d, S) : null,
    critico: p ? caminhoCritico(p) : new Set<number>(),
  };
}
