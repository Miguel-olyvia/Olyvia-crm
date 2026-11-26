// 25/11 (plano «Obra Viva», etapa 1): a fita dos agentes no Estúdio da obra. A Olyvia com seis papéis: cada cartão diz o que um agente
// viu, o que quer fazer e quando; o pulso mostra que está a vigiar; o degrau 2 tem a barra do prazo (aplica-se sozinho ao fim do dia útil
// se ninguém recusar); o que os agentes fizeram aparece em «Desde a última visita», com desfazer. As regras estão em agentes.ts.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Settings2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Negocio } from "../motor";
import type { Ctx } from "../pecas";
import { useReduzir } from "../movimento";
import { podeNeg } from "../permissoes";
import type { AcaoAlerta } from "./alertasObra";
import { AGENTES, DEGRAUS, aAplicarAgora, agente, degrauDe, modoDa, pausaDe, prazoDoDegrau2, type AgenteId, type Degrau, type FeitoAgente, type Proposta } from "./agentes";

/* ------------------------------------------------------------------ o rasto do antes (o Gantt mostra-o uns segundos) */
let rasto: { antes: Map<number, number>; ate: number } | null = null;
const quemOuveRasto = new Set<() => void>();
function deixarRasto(f: FeitoAgente) {
  rasto = { antes: new Map(f.antes.map((a) => [a.ti, a.dia])), ate: Date.now() + 6000 };
  quemOuveRasto.forEach((x) => x());
  window.setTimeout(() => { if (rasto && rasto.ate <= Date.now()) { rasto = null; quemOuveRasto.forEach((x) => x()); } }, 6100);
}
/** O dia de onde cada tarefa saiu na última mudança de um agente (só durante uns segundos), para o Gantt desenhar o rasto. */
export function useRastoAgente(): Map<number, number> | null {
  return useSyncExternalStore((f) => { quemOuveRasto.add(f); return () => { quemOuveRasto.delete(f); }; }, () => rasto?.antes ?? null, () => null);
}

const hora = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const quandoPrazo = (d: Date, agora: Date) => (d.toDateString() === agora.toDateString() ? `hoje às ${hora(d)}` : `${SEM[d.getDay()]} às ${hora(d)}`);
const quandoFeito = (iso: string) => { const d = new Date(iso); return `${d.getDate()}/${d.getMonth() + 1} ${hora(d)}`; };
const CHAVE_VISTO = (id: number) => `olyvia.agentes.visto.${id}`;
const lerVisto = (id: number): string | null => { try { return window.localStorage.getItem(CHAVE_VISTO(id)); } catch { return null; } };
const guardarVisto = (id: number, iso: string) => { try { window.localStorage.setItem(CHAVE_VISTO(id), iso); } catch { /* sem armazenamento */ } };

function Avatar({ id, tam = "h-9 w-9" }: { id: AgenteId; tam?: string }) {
  const a = agente(id);
  return <span aria-hidden="true" className={cn("grid shrink-0 place-items-center rounded-xl font-mono text-[11px] font-semibold text-white shadow-sm", tam)} style={{ background: a.cor }}>{a.sigla}</span>;
}

export function FitaAgentes({ ctx, d, propostas, agir }: { ctx: Ctx; d: Negocio; propostas: Proposta[]; agir: (a: AcaoAlerta) => void }) {
  const { A, run, S } = ctx;
  const reduzir = useReduzir();
  const e = d.obra.agentes;
  const planeia = podeNeg(S.role, "obra.planear");
  const [agora, setAgora] = useState(() => new Date());
  const [filtro, setFiltro] = useState<AgenteId | null>(null);
  const [todas, setTodas] = useState(false);
  const [autonomia, setAutonomia] = useState(false);
  const [ultimaVisita] = useState(() => lerVisto(d.id));
  const aplicados = useRef(new Set<string>());

  // o relógio da fita (o prazo do degrau 2 e as barras que encolhem)
  useEffect(() => { const t = window.setInterval(() => setAgora(new Date()), 30000); return () => window.clearInterval(t); }, []);
  // a visita: o que os agentes fizeram desde a última fica à vista; ao sair, esta passa a ser a última
  useEffect(() => () => guardarVisto(d.id, new Date().toISOString()), [d.id]);

  // quando cada proposta apareceu (o prazo do degrau 2 conta daí)
  const ids = propostas.map((x) => x.id).join("|");
  useEffect(() => {
    if (!planeia) return;
    const v = e?.vistos ?? {}, L = propostas.map((x) => x.id);
    if (!(L.some((x) => !v[x]) || Object.keys(v).some((x) => !L.includes(x)))) return;
    // um instante depois de abrir (não a meio da montagem do Estúdio)
    const t = window.setTimeout(() => run(() => { A.agentesObra(d.id, { k: "vistos", ids: L }); }), 0);
    return () => window.clearTimeout(t);
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  const aplicar = (x: Proposta, auto: boolean) => {
    if (!x.auto) return;
    let ok = false;
    run(() => { ok = A.agentesObra(d.id, { k: "aplicar", pid: x.id, agente: x.agente, nomeAgente: agente(x.agente).nome, texto: x.auto!.texto, acao: x.auto!.acao, auto }); });
    const f = d.obra.agentes?.feitos?.[0];
    if (ok && f) deixarRasto(f);
  };
  // o que se aplica sozinho agora (degrau 3, ou degrau 2 com o prazo passado), uma vez por proposta
  useEffect(() => {
    if (!planeia) return;
    const L = aAplicarAgora(propostas, e, agora).filter((x) => !aplicados.current.has(x.id));
    if (!L.length) return;
    const t = window.setTimeout(() => { for (const x of L) { if (aplicados.current.has(x.id)) continue; aplicados.current.add(x.id); aplicar(x, true); } }, 0);
    return () => window.clearTimeout(t);
  }, [ids, agora]); // eslint-disable-line react-hooks/exhaustive-deps

  const recusar = (x: Proposta) => run(() => { A.agentesObra(d.id, { k: "recusar", pid: x.id, texto: x.titulo }); });
  const desfazer = (f: FeitoAgente) => { run(() => { A.agentesObra(d.id, { k: "desfazer", fid: f.id }); }); deixarRasto({ ...f, antes: f.antes.map((a) => ({ ...a, dia: d.obra.plano?.tasks[a.ti]?.dia ?? a.dia })) }); };
  const mudarDegrau = (id: AgenteId, n: Degrau) => run(() => { A.agentesObra(d.id, { k: "degrau", agente: id, n, texto: `${agente(id).nome} passou a «${DEGRAUS[n].nome}»` }); });

  const visiveis = propostas.filter((x) => !filtro || x.agente === filtro);
  const mostradas = todas ? visiveis : visiveis.slice(0, 5);
  const feitos = (e?.feitos ?? []).filter((f) => !f.desfeito);
  const novos = feitos.filter((f) => !ultimaVisita || f.q > ultimaVisita);
  const recentes = novos.length ? novos : feitos.slice(0, 3);
  const conta = useMemo(() => {
    const c = { pede: 0, prazo: 0, ver: 0 };
    for (const x of propostas) { const m = modoDa(x, e, agora); if (m === "prazo") c.prazo++; else if (m === "ver") c.ver++; else c.pede++; }
    return c;
  }, [propostas, e]);

  return (
    <section aria-label="Os agentes da obra" className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      {/* o cabeçalho: o pulso, o resumo e a autonomia */}
      <div className="relative flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
        <span className="relative flex h-3 w-3" aria-hidden="true">
          {!reduzir && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />}
          <span className="relative inline-flex h-3 w-3 rounded-full bg-success" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Os agentes <span className="font-normal text-muted-foreground">· a vigiar a obra</span></p>
          <p className="text-sm text-muted-foreground">
            {propostas.length ? [conta.pede && `${conta.pede} ${conta.pede === 1 ? "pede" : "pedem"} decisão`, conta.prazo && `${conta.prazo} ${conta.prazo === 1 ? "aplica-se" : "aplicam-se"} sozinho${conta.prazo === 1 ? "" : "s"} se ninguém recusar`, conta.ver && `${conta.ver} a observar`].filter(Boolean).join(" · ") : "Está tudo em ordem. Nada à espera de ti."}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="min-h-9 rounded-full" aria-expanded={autonomia} onClick={() => setAutonomia((x) => !x)}>
          <Settings2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Autonomia
        </Button>
      </div>

      {/* a autonomia: o degrau de cada agente nesta obra */}
      <AnimatePresence initial={false}>
        {autonomia && (
          <motion.div key="autonomia" initial={reduzir ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-border bg-muted/30">
            <div className="grid gap-2 p-4 sm:px-5 lg:grid-cols-2">
              {AGENTES.map((a) => {
                const g = degrauDe(e, a.id);
                return (
                  <div key={a.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-2xl bg-card p-3 ring-1 ring-border">
                    <Avatar id={a.id} />
                    <div className="min-w-0 flex-1 basis-40"><p className="text-sm font-semibold">{a.nome}</p><p className="truncate text-xs text-muted-foreground">Vigia {a.vigia}</p></div>
                    <div role="group" aria-label={`Autonomia do agente ${a.nome}`} className="inline-flex rounded-full border border-input p-0.5">
                      {DEGRAUS.map((x) => (
                        <button key={x.n} type="button" aria-pressed={g === x.n} title={x.sub} disabled={!planeia} onClick={() => mudarDegrau(a.id, x.n)}
                          className={cn("min-h-8 rounded-full px-2.5 text-xs font-medium transition-colors", g === x.n ? "text-white" : "text-muted-foreground hover:text-foreground")}
                          style={g === x.n ? { background: a.cor } : undefined}>{x.nome}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground lg:col-span-2">Sozinhos, os agentes só fazem mudanças que não empurram o fim da obra, até 2 dias úteis, sem pôr ninguém em duas obras. Nunca mexem em preços, no contrato nem em trabalho validado, e nada vai para o cliente sem carregar em enviar. Tudo fica no histórico e desfaz-se.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative grid gap-4 p-4 sm:p-5">
        {/* o que os agentes fizeram */}
        {recentes.length > 0 && (
          <div className="rounded-2xl bg-success/[0.06] p-3 ring-1 ring-success/20">
            <p className="mb-2 text-sm font-semibold">{novos.length ? "Desde a última visita" : "O que os agentes fizeram"}</p>
            <ul className="space-y-1.5">
              {recentes.map((f) => (
                <motion.li key={f.id} layout={!reduzir} className="flex flex-wrap items-center gap-2 text-sm">
                  <Avatar id={f.agente} tam="h-6 w-6" />
                  <span className="min-w-0 flex-1">{f.texto} <span className="text-xs text-muted-foreground">· {f.auto ? "sozinho" : `aceite por ${f.quem || "si"}`} · {quandoFeito(f.q)}</span></span>
                  {planeia && f.antes.length > 0 && <Button type="button" size="sm" variant="ghost" className="min-h-8 rounded-full" onClick={() => desfazer(f)}><Undo2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Desfazer</Button>}
                </motion.li>
              ))}
            </ul>
          </div>
        )}

        {/* os agentes: filtrar a fita por um */}
        <div role="group" aria-label="Ver só um agente" className="flex flex-wrap gap-1.5">
          {AGENTES.map((a) => {
            const n = propostas.filter((x) => x.agente === a.id).length, on = filtro === a.id;
            return (
              <button key={a.id} type="button" aria-pressed={on} onClick={() => setFiltro(on ? null : a.id)}
                className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors", on ? "border-transparent text-white" : "border-input text-muted-foreground hover:text-foreground", !n && !on && "opacity-50")}
                style={on ? { background: a.cor } : undefined}>
                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: on ? "white" : a.cor }} />{a.nome}{n > 0 && <span className="tabular-nums">{n}</span>}
              </button>
            );
          })}
        </div>

        {/* a fita */}
        {!visiveis.length ? <p className="rounded-2xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">{filtro ? `O agente ${agente(filtro).nome} não tem nada a dizer agora.` : "Os agentes não encontraram nada para fazer."}</p> : (
          <ul className="grid gap-2">
            <AnimatePresence initial={false}>
              {mostradas.map((x) => {
                const m = modoDa(x, e, agora), a = agente(x.agente), pausa = m === "pede" && x.auto ? pausaDe(e, x.agente, agora) : null;
                const visto = e?.vistos?.[x.id], prazo = m === "prazo" && visto ? prazoDoDegrau2(visto) : null;
                const falta = prazo && visto ? Math.max(0, Math.min(1, (prazo.getTime() - agora.getTime()) / Math.max(1, prazo.getTime() - new Date(visto).getTime()))) : null;
                const principal = x.acoes[0];
                return (
                  <motion.li key={x.id} layout={!reduzir} initial={reduzir ? false : { opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduzir ? undefined : { opacity: 0, x: 40 }}
                    transition={{ duration: 0.3 }} className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-2xl border bg-background/60 p-3", x.nivel === "critico" ? "border-destructive/30" : "border-border", m === "ver" && "opacity-80")}>
                    <Avatar id={x.agente} />
                    <div className="min-w-0 space-y-1.5">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] leading-snug">
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: a.cor }}>{a.nome}</span>
                        <span className="font-medium">{x.titulo}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium",
                          m === "prazo" ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200" : m === "ver" ? "bg-muted text-muted-foreground" : m === "ja" ? "bg-success/15 text-success" : "bg-primary/10 text-primary")}>
                          {m === "prazo" && prazo ? `aplica-se sozinho ${quandoPrazo(prazo, agora)}` : m === "ver" ? "a observar" : m === "ja" ? "a aplicar" : pausa ? `em pausa até ${quandoPrazo(pausa, agora)}: desfez uma mudança` : "pede decisão"}
                        </span>
                      </p>
                      {x.sub && <p className="text-sm text-muted-foreground">{x.sub}</p>}
                      {x.auto && m !== "ver" && <p className="text-sm"><span className="text-muted-foreground">Proposta:</span> {x.auto.texto}</p>}
                      {falta != null && <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-amber-500 transition-[width] duration-1000 ease-linear" style={{ width: `${Math.round(falta * 100)}%` }} /></div>}
                      {planeia && m !== "ver" && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          {x.auto ? <Button type="button" size="sm" className="min-h-9 rounded-full" onClick={() => aplicar(x, false)}><Check className="mr-1.5 h-4 w-4" aria-hidden="true" />{m === "prazo" ? "Aplicar já" : "Aplicar"}</Button>
                            : principal && <Button type="button" size="sm" className="min-h-9 rounded-full" onClick={() => agir(principal.a)}>{principal.rot}</Button>}
                          {x.acoes.filter((b, i) => (x.auto ? b.a.k !== "passar" && b.a.k !== "fecharBuraco" : i > 0)).slice(0, 2).map((b) => (
                            <Button key={b.rot} type="button" size="sm" variant="ghost" className="min-h-9 rounded-full" onClick={() => agir(b.a)}>{b.rot}</Button>
                          ))}
                          <Button type="button" size="sm" variant="ghost" className="min-h-9 rounded-full text-muted-foreground" onClick={() => recusar(x)} aria-label={`Recusar: ${x.titulo}`}><X className="mr-1 h-4 w-4" aria-hidden="true" />Recusar</Button>
                        </div>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
        {visiveis.length > 5 && (
          <button type="button" aria-expanded={todas} onClick={() => setTodas((x) => !x)} className="inline-flex min-h-9 items-center gap-1 justify-self-start rounded-full px-3 text-sm font-medium text-primary hover:bg-primary/10">
            {todas ? "Mostrar menos" : `Ver todas (${visiveis.length})`}<ChevronDown className={cn("h-4 w-4 transition-transform", todas && "rotate-180")} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}
