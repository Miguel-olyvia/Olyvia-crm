// 27/11 (Rúben: «mostrar os agentes a trabalhar»). Os seis agentes da Olyvia, ao vivo: o que cada um vigia, as propostas por obra (e
// quantas pedem decisão), o que fizeram sozinhos hoje, a autonomia (o degrau) e a volta do servidor (de 15 em 15 minutos).
// Carregar num agente ou numa obra acende-o no grafo.
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Server } from "lucide-react";
import { cn } from "@/lib/utils";
import { SinalAoVivo } from "@/emylia/SinalAoVivo";
import { agente } from "@/emylia/estudioObra/agentes";
import { nomeDoDegrau, proximaVolta, type ObraCerebro, type ResumoAgente } from "./grafoConhecimento";

const hora = (d: Date | string) => new Date(d).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
const falta = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60); return m ? `${m} min ${String(s % 60).padStart(2, "0")} s` : `${s} s`; };
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** O relógio do servidor: um anel que se enche durante os 15 minutos até à próxima volta. */
export function VoltaDoServidor({ ultima, origem }: { ultima: string | null; origem: "servidor" | "pagina" | null }) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => { const t = window.setInterval(() => setAgora(new Date()), 1000); return () => window.clearInterval(t); }, []);
  const prox = proximaVolta(agora), ms = prox.getTime() - agora.getTime();
  const feito = 1 - ms / (15 * 60_000);
  const R = 17, C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-white">
      <div className="relative h-11 w-11 shrink-0">
        <svg viewBox="0 0 44 44" className="h-11 w-11 -rotate-90" aria-hidden="true">
          <circle cx="22" cy="22" r={R} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="4" />
          <circle cx="22" cy="22" r={R} fill="none" stroke="#c4b5fd" strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - feito)} style={{ transition: "stroke-dashoffset 1s linear" }} />
        </svg>
        <Server className="absolute inset-0 m-auto h-4 w-4 text-white/85" aria-hidden="true" />
      </div>
      <div className="min-w-0 text-sm leading-snug">
        <p className="font-semibold">Servidor: próxima volta às {hora(prox)}</p>
        <p className="text-white/70"><span className="tabular-nums">daqui a {falta(ms)}</span> · corre de 15 em 15 minutos</p>
        {ultima && <p className="text-white/60">{origem === "servidor" ? "Última volta do servidor" : origem === "pagina" ? "Base atualizada pela página dos Negócios" : "Base atualizada"} às {hora(ultima)}</p>}
      </div>
    </div>
  );
}

function CartaoAgente({ a, onEscolher, i }: { a: ResumoAgente; onEscolher(id: string): void; i: number }) {
  const parado = useReducedMotion();
  const ativo = a.propostas > 0 || a.feitos > 0;
  return (
    <motion.li initial={parado ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
      <button type="button" onClick={() => onEscolher(`agente:${a.id}`)}
        className="group relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border border-border bg-card p-3 text-left shadow-sm transition hover:border-primary/40 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span className="relative mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-extrabold text-[#0d0a1f]" style={{ background: a.cor }}>
          {a.sigla}
          {a.pedem > 0 && !parado && <motion.span aria-hidden="true" className="absolute inset-0 rounded-xl" style={{ boxShadow: `0 0 0 2px ${a.cor}` }}
            animate={{ scale: [1, 1.35], opacity: [0.8, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="font-semibold">{a.nome}</span>
            {ativo && <SinalAoVivo rotulo={`O agente ${a.nome} está a trabalhar`} tamanho={11} cor="bg-primary/70" />}
            <span className="ml-auto shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary" title="A autonomia (o degrau) mais comum nas obras">
              {a.degrau} · {nomeDoDegrau(a.degrau)}{a.degrauVaria ? " *" : ""}
            </span>
          </span>
          <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">Vigia {a.vigia}.</span>
          <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
            <span className="tabular-nums"><b>{a.propostas}</b> {a.propostas === 1 ? "proposta" : "propostas"}</span>
            <span className={cn("tabular-nums", a.pedem > 0 ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>{plural(a.pedem, "pede decisão", "pedem decisão")}</span>
            {a.prazo > 0 && <span className="tabular-nums text-muted-foreground">{a.prazo} às 18h</span>}
            <span className={cn("tabular-nums", a.feitos > 0 ? "text-success" : "text-muted-foreground")}>{plural(a.feitos, "feita hoje", "feitas hoje")}</span>
          </span>
        </span>
        {ativo && !parado && (
          <motion.span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: `linear-gradient(90deg, transparent, ${a.cor}, transparent)` }}
            animate={{ x: ["-100%", "100%"] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.3 }} />
        )}
      </button>
    </motion.li>
  );
}

export function AgentesAoVivo({ agentes, obras, aoVivo, onEscolher }: {
  agentes: ResumoAgente[];
  obras: ObraCerebro[];
  /** calculado agora a partir dos Negócios abertos nesta sessão (senão, da base) */
  aoVivo: boolean;
  onEscolher(id: string): void;
}) {
  const parado = useReducedMotion();
  const comDecisoes = obras.map((o) => ({ ...o, pedem: o.propostas.filter((x) => x.modo === "pede").length })).filter((o) => o.propostas.length > 0)
    .sort((a, b) => b.pedem - a.pedem || b.propostas.length - a.propostas.length);
  const feitos = obras.flatMap((o) => o.feitos.map((f) => ({ ...f, obra: o }))).sort((a, b) => (b.quando ?? "").localeCompare(a.quando ?? ""));
  const pedem = comDecisoes.reduce((s, o) => s + o.pedem, 0);

  return (
    <div className="space-y-5">
      <section aria-labelledby="cerebro-agentes">
        <div className="mb-2 flex items-baseline gap-2">
          <h2 id="cerebro-agentes" className="text-[15px] font-semibold">Os agentes</h2>
          <span className="text-xs text-muted-foreground">{aoVivo ? "ao vivo, dos Negócios abertos" : "da base de conhecimento"}</span>
        </div>
        <ul className="space-y-2">
          {agentes.map((a, i) => <CartaoAgente key={a.id} a={a} i={i} onEscolher={onEscolher} />)}
        </ul>
        {agentes.some((a) => a.degrauVaria) && <p className="mt-1.5 text-xs text-muted-foreground">* A autonomia muda de obra para obra: mostra-se a mais comum.</p>}
      </section>

      <section aria-labelledby="cerebro-obras">
        <h2 id="cerebro-obras" className="mb-2 text-[15px] font-semibold">Propostas por obra{pedem > 0 && <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">{plural(pedem, "decisão à espera", "decisões à espera")}</span>}</h2>
        {comDecisoes.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">{obras.length ? "Os agentes não têm nada a propor nas obras." : "Ainda não há obras em curso ou aprovadas."}</p>
        ) : (
          <ul className="space-y-1.5">
            {comDecisoes.map((o) => (
              <li key={o.numero}>
                <button type="button" onClick={() => onEscolher(`obra:${o.numero}`)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-left text-sm transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{o.nome}</span>
                    <span className="flex items-center gap-1 pt-0.5" aria-label={`Agentes com propostas: ${[...new Set(o.propostas.map((x) => agente(x.agente).nome))].join(", ")}`}>
                      {[...new Set(o.propostas.map((x) => x.agente))].map((id) => (
                        <span key={id} title={agente(id).nome} className="h-2.5 w-2.5 rounded-full" style={{ background: agente(id).cor }} />
                      ))}
                      <span className="ml-1 text-xs text-muted-foreground">Obra {o.numero} · {o.estado}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">{plural(o.propostas.length, "proposta", "propostas")}</span>
                  {o.pedem > 0 && (
                    <span className="relative shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-[#1c1206]">
                      {o.pedem}
                      {!parado && <motion.span aria-hidden="true" className="absolute inset-0 rounded-full ring-2 ring-amber-500" animate={{ scale: [1, 1.5], opacity: [0.7, 0] }} transition={{ duration: 1.6, repeat: Infinity }} />}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="cerebro-feitos">
        <h2 id="cerebro-feitos" className="mb-2 text-[15px] font-semibold">O que fizeram hoje</h2>
        {feitos.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">Hoje os agentes ainda não fizeram nada sozinhos.</p>
        ) : (
          <ol className="relative space-y-2 border-l border-border pl-4">
            <AnimatePresence initial={false}>
              {feitos.slice(0, 12).map((f, i) => {
                const a = f.agente ? agente(f.agente) : null;
                return (
                  <motion.li key={`${f.obra.numero}-${f.quando}-${i}`} initial={parado ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="relative text-sm">
                    <span aria-hidden="true" className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-background" style={{ background: a?.cor ?? "#8f89ad" }} />
                    <p className="leading-snug">{f.texto}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.quando ? `${hora(f.quando)} · ` : ""}{a ? `Agente ${a.nome}` : "Agentes"} · {f.auto ? "sozinho" : `aceite por ${f.quem ?? "alguém"}`} · <button type="button" className="underline-offset-2 hover:underline" onClick={() => onEscolher(`obra:${f.obra.numero}`)}>Obra {f.obra.numero}</button>
                    </p>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
        )}
      </section>
    </div>
  );
}
