// 27/11 (Rúben: «é preciso que cries uma nova área no menu para o cérebro, mostrar os agentes a trabalhar, e a base do conhecimento toda,
// como se fosse Obsidian e interativo»). /cerebro: o Cérebro da Olyvia.
//  · o grafo: cada nota da base de conhecimento (olyvia_conhecimento, com a RLS de quem abre: os custos só a quem vê custos) é um nó;
//    o negócio liga-se ao orçamento, aos custos e à obra, o guia aos temas, os agentes às obras onde propõem. Procura-se, filtra-se por
//    tipo, arrasta-se; carregar num nó abre a nota com o texto, os dados e as ligações para o negócio, o Estúdio da obra e o relatório;
//  · os agentes a trabalhar: ao vivo quando os Negócios já estão carregados nesta sessão (o mesmo cálculo da fita), senão da base, que o
//    servidor escreve de 15 em 15 minutos. As obras com decisões à espera pulsam no grafo.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BarChart3, Brain, FileText, HardHat, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyOpcional } from "@/contexts/CompanyContext";
import { useEstadoVivo } from "@/emylia/estadoVivo";
import { SinalAoVivo } from "@/emylia/SinalAoVivo";
import { agente, DEGRAUS } from "@/emylia/estudioObra/agentes";
import { GrafoCerebro, type GrafoCerebroRef } from "@/emylia/cerebro/GrafoCerebro";
import { AgentesAoVivo, VoltaDoServidor } from "@/emylia/cerebro/AgentesAoVivo";
import {
  CORES, NOMES_TIPO, TIPOS_NO, filtrarGrafo, ligacoesDoNo, montarGrafo, obrasDaBase, obrasDoEstado, procurar, resumoDosAgentes, ultimaEscrita, vizinhos,
  type Grafo, type LinhaConhecimento, type NoGrafo, type ObraCerebro, type TipoNo,
} from "@/emylia/cerebro/grafoConhecimento";

/** De quanto em quanto tempo se relê a base (o servidor escreve de 15 em 15 min, a página dos Negócios de 10 em 10). */
const RELER_MS = 60_000;
/** De quanto em quanto tempo se recalculam os agentes a partir dos Negócios carregados. */
const VIVO_MS = 30_000;

const FMT_EUR = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", useGrouping: "always" } as unknown as Intl.NumberFormatOptions);
const eur = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? FMT_EUR.format(v) : "—");
const pct = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? `${(Math.round(v * 1000) / 10).toLocaleString("pt-PT")}%` : "—");
const dataPt = (v: unknown) => (typeof v === "string" && v ? new Date(v).toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" }) : null);
const corDoTipo = (t: TipoNo) => (t === "agente" ? "#8c6df2" : CORES[t]);

/** Os dados de uma nota, em linhas legíveis (sem nomes técnicos). */
function linhasDosDados(n: NoGrafo): { rot: string; valor: string }[] {
  const d = n.dados as Record<string, unknown>;
  const L: { rot: string; valor: string | null | undefined }[] = [];
  switch (n.tipo) {
    case "negocio":
      L.push({ rot: "Fase", valor: d.fase as string }, { rot: "Proposta (com IVA)", valor: d.valor != null ? eur(d.valor) : null },
        { rot: "Obra", valor: d.obra as string }, { rot: "Enviada", valor: dataPt(d.enviada) }, { rot: "Aceite", valor: dataPt(d.aceite) });
      if (d.perdido) L.push({ rot: "Estado", valor: "Perdido" });
      break;
    case "orcamento": {
      const t = (d.totais ?? {}) as Record<string, number>;
      L.push({ rot: "Sem IVA", valor: eur(t.base) }, { rot: "IVA", valor: eur(t.iva) }, { rot: "Total com IVA", valor: eur(t.total) },
        { rot: "Linhas", valor: Array.isArray(d.linhas) ? String(d.linhas.length) : null }, { rot: "Desconto", valor: d.desconto ? `${d.desconto}%` : null },
        { rot: "Aceite", valor: dataPt(d.aceite) });
      const c = d.contrato as { total?: number } | null;
      if (c?.total) L.push({ rot: "Contrato com adendas", valor: eur(c.total) });
      break;
    }
    case "custos":
      L.push({ rot: "Custo previsto", valor: eur(d.custo) }, { rot: "Venda sem IVA", valor: eur(d.venda) }, { rot: "Margem prevista", valor: pct(d.margem) },
        { rot: "Lucro previsto", valor: eur(d.lucro) }, { rot: "Horas previstas", valor: d.horas != null ? `${d.horas} h` : null },
        { rot: "Custo real até agora", valor: d.custoReal != null ? eur(d.custoReal) : null }, { rot: "Horas registadas", valor: d.horasRegistadas ? `${d.horasRegistadas} h` : null });
      break;
    case "obra":
      L.push({ rot: "Estado", valor: d.estado as string }, { rot: "Acaba", valor: d.fim as string }, { rot: "Decisões à espera", valor: String(n.decisoes) });
      break;
    case "resumo":
      L.push({ rot: "Obras", valor: d.obras != null ? String(d.obras) : null }, { rot: "Decisões à espera", valor: d.decisoes != null ? String(d.decisoes) : null },
        { rot: "Feitas hoje pelos agentes", valor: d.feitos != null ? String(d.feitos) : null });
      break;
    default: break;
  }
  return L.filter((x): x is { rot: string; valor: string } => !!x.valor);
}

function PainelNo({ n, grafo, obras, onFechar, onEscolher }: { n: NoGrafo; grafo: Grafo; obras: ObraCerebro[]; onFechar(): void; onEscolher(id: string): void }) {
  const lig = ligacoesDoNo(n, grafo);
  const viz = [...vizinhos(grafo, n.id)].map((id) => grafo.nos.find((x) => x.id === id)!).filter(Boolean)
    .sort((a, b) => TIPOS_NO.indexOf(a.tipo) - TIPOS_NO.indexOf(b.tipo) || a.rotulo.localeCompare(b.rotulo, "pt"));
  const dados = linhasDosDados(n);
  const obra = n.tipo === "obra" ? obras.find((o) => o.numero === n.numero) : null;
  const ag = n.agente ? agente(n.agente) : null;
  const doAgente = n.agente ? obras.map((o) => ({ o, P: o.propostas.filter((x) => x.agente === n.agente) })).filter((x) => x.P.length || x.o.feitos.some((f) => f.agente === n.agente)) : [];
  const fechar = useRef<HTMLButtonElement>(null);
  useEffect(() => { fechar.current?.focus({ preventScroll: true }); }, [n.id]);
  // um só botão principal: o Estúdio da obra quando há obra, senão o negócio
  const principal = lig.obra ? { to: lig.obra, rot: "Abrir o Estúdio da obra", Icone: HardHat } : lig.negocio ? { to: lig.negocio, rot: "Abrir o negócio", Icone: ArrowRight } : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3 border-b border-border p-4">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: n.cor, boxShadow: `0 0 0 4px ${n.cor}33` }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{NOMES_TIPO[n.tipo].um}{n.atualizado ? ` · ${new Date(n.atualizado).toLocaleString("pt-PT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</p>
          <h2 className="text-lg font-semibold leading-snug">{n.titulo}</h2>
        </div>
        <button ref={fechar} type="button" onClick={onFechar} aria-label="Fechar a nota" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {n.decisoes > 0 && (
          <p className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-60 motion-reduce:animate-none" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" /></span>
            {n.decisoes === 1 ? "1 decisão dos agentes à espera" : `${n.decisoes} decisões dos agentes à espera`}
          </p>
        )}
        {principal && (
          <Link to={principal.to} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
            <principal.Icone className="h-4 w-4" aria-hidden="true" />{principal.rot}
          </Link>
        )}
        {(lig.relatorio || (lig.obra && lig.negocio)) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {lig.obra && lig.negocio && <Link to={lig.negocio} className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-2 hover:underline"><FileText className="h-4 w-4" aria-hidden="true" />O negócio</Link>}
            {lig.relatorio && <Link to={lig.relatorio} className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-2 hover:underline"><BarChart3 className="h-4 w-4" aria-hidden="true" />O relatório</Link>}
          </div>
        )}
        {dados.length > 0 && (
          <dl className="grid grid-cols-2 gap-2">
            {dados.map((x) => (
              <div key={x.rot} className="rounded-xl border border-border bg-muted/30 px-3 py-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{x.rot}</dt>
                <dd className="text-sm font-semibold tabular-nums">{x.valor}</dd>
              </div>
            ))}
          </dl>
        )}
        {ag && (
          <div className="space-y-2 text-sm">
            <p className="leading-relaxed">Vigia {ag.vigia}.</p>
            <ul className="space-y-1.5">
              {doAgente.length === 0 && <li className="text-muted-foreground">Sem propostas nas obras agora.</li>}
              {doAgente.map(({ o, P }) => (
                <li key={o.numero} className="rounded-xl border border-border p-2.5">
                  <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => onEscolher(`obra:${o.numero}`)}>Obra {o.numero} · {o.nome}</button>
                  <p className="text-xs text-muted-foreground">Degrau {o.degraus[n.agente!]} · {DEGRAUS.find((x) => x.n === o.degraus[n.agente!])?.sub}</p>
                  {P.map((p, i) => <p key={i} className="mt-1 leading-snug"><span className={cn("mr-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold", p.modo === "pede" ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-primary/10 text-primary")}>{p.modo === "pede" ? "pede" : p.modo === "prazo" ? "às 18h" : p.modo === "ja" ? "a aplicar" : "a observar"}</span>{p.titulo}</p>)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {obra && obra.propostas.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">O que os agentes propõem</h3>
            <ul className="space-y-1.5 text-sm">
              {obra.propostas.map((p, i) => (
                <li key={i} className="flex gap-2 leading-snug">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: agente(p.agente).cor }} title={agente(p.agente).nome} aria-hidden="true" />
                  <span><b className="font-semibold">{agente(p.agente).nome}</b> {p.modo === "pede" ? "pede decisão" : p.modo === "prazo" ? "aplica às 18h" : p.modo === "ja" ? "a aplicar" : "a observar"}: {p.titulo}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {n.texto && <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground/90">{n.texto}</p>}
        {viz.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ligações ({viz.length})</h3>
            <ul className="flex flex-wrap gap-1.5">
              {viz.slice(0, 40).map((v) => (
                <li key={v.id}>
                  <button type="button" onClick={() => onEscolher(v.id)} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-xs font-medium transition hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <span className="h-2 w-2 rounded-full" style={{ background: v.cor }} aria-hidden="true" />{v.rotulo}
                  </button>
                </li>
              ))}
              {viz.length > 40 && <li className="self-center text-xs text-muted-foreground">e mais {viz.length - 40}</li>}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CerebroOlyvia() {
  const empresa = useCompanyOpcional();
  const org = empresa?.activeCompany?.id ?? null, nomeOrg = empresa?.activeCompany?.name ?? "";
  const parado = useReducedMotion();
  const [linhas, setLinhas] = useState<LinhaConhecimento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lidoEm, setLidoEm] = useState<Date | null>(null);
  const [params, setParams] = useSearchParams();
  const selecionado = params.get("no");
  const [pesquisa, setPesquisa] = useState("");
  const [tipos, setTipos] = useState<Set<TipoNo>>(() => new Set(TIPOS_NO));
  const grafoRef = useRef<GrafoCerebroRef>(null);

  // a base, relida de minuto a minuto (e ao voltar ao separador)
  useEffect(() => {
    if (!org) return;
    let vivo = true;
    setLinhas(null); setErro(null);
    const ler = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void supabase.from("olyvia_conhecimento" as never).select("chave, tipo, numero, titulo, texto, dados, atualizado_em").eq("organization_id", org).limit(4000)
        .then(({ data, error }) => {
          if (!vivo) return;
          if (error) { setErro(error.message); return; }
          setErro(null); setLinhas((data ?? []) as unknown as LinhaConhecimento[]); setLidoEm(new Date());
        });
    };
    ler();
    const t = window.setInterval(ler, RELER_MS);
    const aoVoltar = () => { if (!document.hidden) ler(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { vivo = false; window.clearInterval(t); document.removeEventListener("visibilitychange", aoVoltar); };
  }, [org]);

  // os agentes ao vivo, quando os Negócios desta organização já estão carregados nesta sessão
  const estado = useEstadoVivo();
  const [tique, setTique] = useState(0);
  useEffect(() => { const t = window.setInterval(() => setTique((x) => x + 1), VIVO_MS); return () => window.clearInterval(t); }, []);
  const aoVivo = !!estado && estado.org === org;
  const obrasCalc = useMemo<ObraCerebro[]>(() => {
    if (aoVivo) { try { return obrasDoEstado(estado!.S); } catch { /* cai para a base */ } }
    return linhas ? obrasDaBase(linhas) : [];
  }, [aoVivo, estado, linhas, tique]); // eslint-disable-line react-hooks/exhaustive-deps -- o tique recalcula
  // o grafo só se refaz quando o que os agentes fazem muda mesmo (senão a simulação mexia de 30 em 30 s)
  const assinatura = JSON.stringify(obrasCalc.map((o) => [o.numero, o.propostas.map((p) => `${p.agente}${p.modo}`), o.feitos.length, o.degraus]));
  const obras = useMemo(() => obrasCalc, [assinatura]); // eslint-disable-line react-hooks/exhaustive-deps

  const grafo = useMemo(() => (linhas ? montarGrafo(linhas, obras) : { nos: [], arestas: [] }), [linhas, obras]);
  const visivel = useMemo(() => filtrarGrafo(grafo, tipos), [grafo, tipos]);
  const encontrados = useMemo(() => procurar(visivel, pesquisa), [visivel, pesquisa]);
  const destaque = useMemo(() => (pesquisa.trim() ? new Set(encontrados) : null), [encontrados, pesquisa]);
  const agentes = useMemo(() => resumoDosAgentes(obras), [obras]);
  const no = selecionado ? grafo.nos.find((n) => n.id === selecionado) ?? null : null;
  const escrita = useMemo(() => ultimaEscrita(linhas ?? []), [linhas]);
  const contagem = useMemo(() => { const m = new Map<TipoNo, number>(); for (const n of grafo.nos) m.set(n.tipo, (m.get(n.tipo) ?? 0) + 1); return m; }, [grafo]);
  const decisoes = obras.reduce((s, o) => s + o.propostas.filter((x) => x.modo === "pede").length, 0);
  const aTrabalhar = agentes.filter((a) => a.propostas > 0 || a.feitos > 0).length;

  const escolher = useCallback((id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set("no", id); else p.delete("no");
    setParams(p, { replace: !!selecionado && !!id });
  }, [params, setParams, selecionado]);
  const escolherEFocar = useCallback((id: string) => {
    // um nó escondido pelo filtro volta a aparecer
    const n = grafo.nos.find((x) => x.id === id);
    if (n && !tipos.has(n.tipo)) setTipos((t) => new Set([...t, n.tipo]));
    escolher(id);
    window.setTimeout(() => grafoRef.current?.focar(id), 60);
  }, [grafo, tipos, escolher]);

  const alternarTipo = (t: TipoNo) => setTipos((s) => {
    const n = new Set(s);
    if (n.has(t)) { if (n.size > 1) n.delete(t); } else n.add(t);
    return n;
  });

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1d1442] via-[#2c1d73] to-[#4b2fc9] p-5 text-white shadow-lg sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-violet-400/20 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-fuchsia-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
              <SinalAoVivo rotulo="O Cérebro está ao vivo" tamanho={12} cor="bg-white/85" />Cérebro da Olyvia
            </p>
            <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              <motion.span aria-hidden="true" animate={parado ? undefined : { scale: [1, 1.06, 1] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }} className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25">
                <Brain className="h-6 w-6" />
              </motion.span>
              O que a Olyvia sabe e faz
            </h1>
            <p className="mt-1.5 text-white/80">{nomeOrg ? `${nomeOrg} · ` : ""}{grafo.nos.length} notas, {grafo.arestas.length} ligações, {aTrabalhar} {aTrabalhar === 1 ? "agente a trabalhar" : "agentes a trabalhar"}{decisoes ? `, ${decisoes} ${decisoes === 1 ? "decisão à espera" : "decisões à espera"}` : ""}.</p>
          </div>
          <div className="w-full lg:w-[360px]"><VoltaDoServidor ultima={escrita.quando} origem={escrita.origem} /></div>
        </div>
      </header>

      {!org ? <p className="mt-6 text-muted-foreground">Escolhe primeiro a empresa.</p>
        : erro ? <p role="alert" className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-destructive">Não foi possível ler a base de conhecimento: {erro}</p>
        : (
          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="relative block w-full sm:max-w-xs">
                  <span className="sr-only">Procurar na base de conhecimento</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input type="search" value={pesquisa} onChange={(e) => setPesquisa(e.target.value)} placeholder="Procurar cliente, número ou nota…"
                    onKeyDown={(e) => { if (e.key === "Enter" && encontrados[0]) { e.preventDefault(); escolherEFocar(encontrados[0]); } if (e.key === "Escape") setPesquisa(""); }}
                    className="min-h-11 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30" />
                </label>
                {pesquisa.trim() && <p role="status" className="text-sm text-muted-foreground">{encontrados.length === 0 ? "Nada encontrado." : `${encontrados.length} ${encontrados.length === 1 ? "nota" : "notas"} · Enter abre a primeira`}</p>}
              </div>
              <div role="group" aria-label="Mostrar por tipo" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
                {TIPOS_NO.filter((t) => contagem.get(t)).map((t) => {
                  const on = tipos.has(t);
                  return (
                    <button key={t} type="button" aria-pressed={on} onClick={() => alternarTipo(t)}
                      className={cn("inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", on ? "border-border bg-card shadow-sm" : "border-dashed border-border bg-transparent text-muted-foreground opacity-70")}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? corDoTipo(t) : "transparent", boxShadow: `inset 0 0 0 1.5px ${corDoTipo(t)}` }} aria-hidden="true" />
                      {NOMES_TIPO[t].varios}<span className="tabular-nums text-muted-foreground">{contagem.get(t)}</span>
                    </button>
                  );
                })}
              </div>
              <div className="relative h-[62vh] min-h-[380px] overflow-hidden rounded-3xl border border-[#2a2160] shadow-lg lg:h-[calc(100vh-17rem)] lg:min-h-[560px]"
                style={{ background: "radial-gradient(ellipse at 50% 40%, #241a52 0%, #150f33 55%, #0b0920 100%)" }}>
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(rgba(196,181,253,.18) 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
                {!linhas ? (
                  <p className="absolute inset-0 grid place-items-center text-white/75"><span className="flex items-center gap-2"><SinalAoVivo rotulo="A carregar" tamanho={14} intenso cor="bg-white/80" />A ler a base de conhecimento…</span></p>
                ) : grafo.nos.length === 0 ? (
                  <p className="absolute inset-0 grid place-items-center p-6 text-center text-white/75">Ainda não há nada na base de conhecimento. Atualiza-se de 15 em 15 minutos no servidor e de 10 em 10 na página dos Negócios.</p>
                ) : (
                  <GrafoCerebro ref={grafoRef} grafo={visivel} selecionado={selecionado} onSelecionar={escolher} destaque={destaque} />
                )}
                {lidoEm && <p className="pointer-events-none absolute right-3 top-3 hidden items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-medium text-white/75 backdrop-blur sm:flex">
                  <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" /></span>
                  Lido às {lidoEm.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                </p>}
                <AnimatePresence>
                  {no && (
                    <motion.aside key="painel" aria-label={`Nota: ${no.titulo}`}
                      initial={parado ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={parado ? undefined : { opacity: 0, y: 24 }} transition={{ duration: 0.22 }}
                      className="fixed inset-x-0 bottom-0 z-[615] max-h-[72vh] overflow-hidden rounded-t-3xl border border-border bg-background shadow-2xl lg:absolute lg:inset-x-auto lg:bottom-3 lg:right-3 lg:top-3 lg:max-h-none lg:w-[380px] lg:rounded-2xl">
                      <PainelNo n={no} grafo={grafo} obras={obras} onFechar={() => escolher(null)} onEscolher={escolherEFocar} />
                    </motion.aside>
                  )}
                </AnimatePresence>
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Como ler o grafo">
                <li>Arrasta um nó ou o fundo; roda do rato ou dois dedos para aproximar.</li>
                <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden="true" />Obras com decisões dos agentes à espera (pulsam).</li>
              </ul>
            </div>
            <aside aria-label="Os agentes a trabalhar" className="min-w-0">
              <AgentesAoVivo agentes={agentes} obras={obras} aoVivo={aoVivo} onEscolher={escolherEFocar} />
            </aside>
          </div>
        )}
    </div>
  );
}
