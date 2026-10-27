// 23/10/2026: os Serviços do Catálogo em três colunas (ofícios · lista · desempenho), com o painel personalizável.
// Os números vêm de desempenhoCatalogo.ts (os negócios e as obras do estado). As animações respeitam «reduzir movimento».
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Award, Clock, Eye, EyeOff, HardHat, Layers, SlidersHorizontal, TrendingUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur, nfmt, pct, type SvcId } from "./motor";
import { desvio, desvioEmPalavras, type DesempenhoServico, type DesempenhoTecnico } from "./desempenhoCatalogo";

/* ------------------------------------------------------------------ preferências (por pessoa, neste browser) */
export type PainelId = "resumo" | "vendidos" | "tecnicos" | "horas" | "oficios";
export type Ordem = "uso" | "receita" | "margem" | "nome";
export interface PrefsCatalogo { paineis: { id: PainelId; on: boolean }[]; ordem: Ordem; compacta: boolean }
export const PAINEIS: Record<PainelId, { t: string; I: typeof Award }> = {
  resumo: { t: "Resumo", I: Layers }, vendidos: { t: "Mais vendidos", I: TrendingUp }, tecnicos: { t: "Técnicos", I: HardHat },
  horas: { t: "Horas: previsto e real", I: Clock }, oficios: { t: "Margem por ofício", I: Award },
};
export const ORDENS: { id: Ordem; t: string }[] = [{ id: "uso", t: "Em uso primeiro" }, { id: "receita", t: "Mais receita" }, { id: "margem", t: "Margem mais baixa" }, { id: "nome", t: "Nome" }];
// 27/10: por omissão só o resumo e os mais vendidos; os outros painéis ligam-se em «Personalizar»
const PREFS0: PrefsCatalogo = { paineis: (Object.keys(PAINEIS) as PainelId[]).map((id) => ({ id, on: id === "resumo" || id === "vendidos" })), ordem: "uso", compacta: false };
const CHAVE = "olyvia.catalogo.prefs";
function lerPrefs(): PrefsCatalogo {
  try {
    const x = JSON.parse(localStorage.getItem(CHAVE) ?? "null") as PrefsCatalogo | null;
    if (!x || !Array.isArray(x.paineis)) return PREFS0;
    const ids = x.paineis.map((p) => p.id).filter((id) => id in PAINEIS);
    const faltam = (Object.keys(PAINEIS) as PainelId[]).filter((id) => !ids.includes(id));
    return { paineis: [...x.paineis.filter((p) => p.id in PAINEIS), ...faltam.map((id) => ({ id, on: true }))], ordem: ORDENS.some((o) => o.id === x.ordem) ? x.ordem : "uso", compacta: !!x.compacta };
  } catch { return PREFS0; }
}
export function usePrefsCatalogo(): [PrefsCatalogo, (fn: (p: PrefsCatalogo) => PrefsCatalogo) => void] {
  const [p, setP] = useState(lerPrefs);
  const mudar = (fn: (p: PrefsCatalogo) => PrefsCatalogo) => setP((a) => { const n = fn(a); try { localStorage.setItem(CHAVE, JSON.stringify(n)); } catch { /* sem armazenamento: fica na sessão */ } return n; });
  return [p, mudar];
}

/* ------------------------------------------------------------------ animações */
const semMovimento = () => typeof window === "undefined" || !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Conta de 0 até `v` (~0,7 s). Sem movimento, mostra logo o valor. */
export function useContagem(v: number, ms = 700): number {
  const [x, setX] = useState(() => (semMovimento() ? v : 0));
  const de = useRef(0);
  useEffect(() => {
    if (semMovimento()) { setX(v); return; }
    const a = de.current, t0 = performance.now();
    let id = 0;
    const passo = (t: number) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      setX(a + (v - a) * e);
      if (k < 1) id = requestAnimationFrame(passo); else de.current = v;
    };
    id = requestAnimationFrame(passo);
    return () => { cancelAnimationFrame(id); de.current = v; };
  }, [v, ms]);
  return x;
}
/** Um número que conta ao aparecer; o leitor de ecrã lê só o valor final. */
export function Contagem({ v, fmt }: { v: number; fmt: (n: number) => string }) {
  const x = useContagem(v);
  return <><span aria-hidden="true">{fmt(x)}</span><span className="sr-only">{fmt(v)}</span></>;
}
/** Uma barra que cresce ao aparecer. `v` de 0 a 1. */
// 27/10: `atraso` fica na assinatura mas já não se usa (sem cascata)
export function Barra({ v, cor = "bg-primary", className }: { v: number; cor?: string; atraso?: number; className?: string }) {
  const [on, setOn] = useState(semMovimento);
  useEffect(() => { if (on) return; const id = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(id); }, [on]);
  return (
    <span aria-hidden="true" className={cn("block h-1.5 overflow-hidden rounded-full bg-muted", className)}>
      <span className={cn("block h-full rounded-full motion-safe:transition-[width] duration-500 ease-out", cor)} style={{ width: `${Math.max(0, Math.min(1, on ? v : 0)) * 100}%` }} />
    </span>
  );
}
/** A entrada de uma linha (só com movimento). 27/10: um fade só, sem slide nem cascata; `i` fica por compatibilidade. */
export const ENTRADA = "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200";
export const entrada = (_i?: number) => ({ className: ENTRADA });

/* ------------------------------------------------------------------ coluna 1: os ofícios */
export function NavOficios({ grupos, sel, onSel, filtros }: { grupos: { oficio: string; n: number; m: number | null }[]; sel: string | null; onSel: (o: string | null) => void; filtros: ReactNode }) {
  const item = (o: string | null, t: string, n: number, m: number | null, i: number) => {
    const on = sel === o;
    return (
      <li key={o ?? "todos"} {...entrada(i)}>
        <button type="button" aria-pressed={on} aria-label={o ? `Mostrar só ${o}` : "Mostrar todos os ofícios"} onClick={() => onSel(o)}
          className={cn("group relative flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-[15px] transition-colors", on ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
          <span className={cn("absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary transition-opacity", on ? "opacity-100" : "opacity-0")} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{t}</span>
          {m != null && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", m < 0.2 ? "bg-destructive" : m < 0.3 ? "bg-warning" : "bg-success")} aria-hidden="true" />}
          <span className="shrink-0 text-sm tabular-nums">{n}</span>
        </button>
      </li>
    );
  };
  const total = grupos.reduce((a, g) => a + g.n, 0);
  return (
    <nav aria-label="Ofícios" className="hidden xl:block">
      <div className="sticky top-6 space-y-6">
        <div>
          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ofícios</p>
          <ul className="mt-2 space-y-0.5">
            {item(null, "Todos", total, null, 0)}
            {grupos.map((g, i) => item(g.oficio, g.oficio, g.n, g.m, i + 1))}
          </ul>
        </div>
        <div>
          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mostrar</p>
          <div className="mt-2 grid gap-1 px-1">{filtros}</div>
        </div>
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ coluna 3: o desempenho */
const CARTAO = "rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]";
function Cartao({ id, children, acao }: { id: PainelId; i?: number; children: ReactNode; acao?: ReactNode }) {
  const { t, I } = PAINEIS[id];
  return (
    <section aria-label={t} className={cn(CARTAO, ENTRADA)}>
      <h3 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight"><I className="h-4 w-4 text-primary" aria-hidden="true" />{t}{acao && <span className="ml-auto">{acao}</span>}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}
const Kpi = ({ t, children, sub }: { t: string; children: ReactNode; sub?: string }) => (
  <div className="rounded-xl bg-muted/50 p-3">
    <p className="text-sm text-muted-foreground">{t}</p>
    <p className="mt-0.5 text-xl font-semibold tabular-nums tracking-tight">{children}</p>
    {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
  </div>
);
const SemDados = ({ children }: { children: ReactNode }) => <p className="text-[15px] text-muted-foreground">{children}</p>;

/** min: a margem mínima do serviço, em % (como no ItemLista). */
export interface ItemPainel { sid: SvcId; n: string; oficio: string; emUso: boolean; m: number; min: number; preco: number }

export function PainelDesempenho({ itens, ds, tecs, prefs, setPrefs, onAbrir }: {
  itens: ItemPainel[]; ds: Map<SvcId, DesempenhoServico>; tecs: DesempenhoTecnico[];
  prefs: PrefsCatalogo; setPrefs: (fn: (p: PrefsCatalogo) => PrefsCatalogo) => void; onAbrir: (sid: SvcId) => void;
}) {
  const [editar, setEditar] = useState(false);
  const nome = new Map(itens.map((i) => [i.sid, i.n]));
  const emUso = itens.filter((i) => i.emUso);
  const baixa = emUso.filter((i) => i.m < i.min / 100);
  const margem = emUso.length ? emUso.reduce((a, i) => a + i.m, 0) / emUso.length : 0;
  const ganhos = [...ds.values()].filter((x) => x.receita > 0).sort((a, b) => b.receita - a.receita);
  const receita = ganhos.reduce((a, x) => a + x.receita, 0);
  const horas = [...ds.values()].filter((x) => x.hPrev > 0).map((x) => ({ ...x, dv: desvio(x.hPrev, x.hReal)! })).sort((a, b) => Math.abs(b.dv) - Math.abs(a.dv));
  const comTarefas = tecs.filter((t) => t.tarefas > 0);
  const porOficio = [...emUso.reduce((m, i) => m.set(i.oficio, [...(m.get(i.oficio) ?? []), i.m]), new Map<string, number[]>())]
    .map(([o, ms]) => ({ o, m: ms.reduce((a, b) => a + b, 0) / ms.length, n: ms.length })).sort((a, b) => a.m - b.m);
  const corMargem = (m: number, min: number) => (m < min ? "bg-destructive" : m < min + 0.08 ? "bg-warning" : "bg-success");
  const link = (sid: SvcId, t: ReactNode) => <button type="button" onClick={() => onAbrir(sid)} className="min-w-0 truncate text-left font-medium underline-offset-4 hover:underline">{t}</button>;

  const corpo: Record<PainelId, () => ReactNode> = {
    resumo: () => (
      <div className="grid grid-cols-2 gap-2">
        <Kpi t="Em uso"><Contagem v={emUso.length} fmt={(n) => nfmt(Math.round(n))} /></Kpi>
        <Kpi t="Margem média"><Contagem v={margem} fmt={pct} /></Kpi>
        <Kpi t="Abaixo do mínimo"><span className={baixa.length ? "text-destructive" : ""}><Contagem v={baixa.length} fmt={(n) => nfmt(Math.round(n))} /></span></Kpi>
        <Kpi t="Receita ganha"><Contagem v={receita} fmt={(n) => `${eur(Math.round(n))} €`} /></Kpi>
      </div>
    ),
    vendidos: () => ganhos.length ? (
      <ol className="space-y-3">
        {ganhos.slice(0, 5).map((x, i) => (
          <li key={x.sid} className="text-[15px]">
            <span className="flex items-baseline gap-2"><span className="w-4 shrink-0 text-sm text-muted-foreground tabular-nums">{i + 1}</span>{link(x.sid, nome.get(x.sid) ?? x.sid)}<span className="ml-auto shrink-0 tabular-nums">{eur(Math.round(x.receita))} €</span></span>
            <span className="mt-1 flex items-center gap-2 pl-6"><Barra v={x.receita / ganhos[0].receita} atraso={i * 60} className="flex-1" /><span className="shrink-0 text-sm text-muted-foreground tabular-nums">{x.ganhos} de {x.orcamentos}</span></span>
          </li>
        ))}
      </ol>
    ) : <SemDados>Ainda não há contratos assinados com serviços do Catálogo.</SemDados>,
    tecnicos: () => comTarefas.length ? (
      <ul className="space-y-3">
        {comTarefas.slice(0, 6).map((t, i) => {
          const dv = desvio(t.hPrev, t.hReal), feito = t.tarefas ? t.validadas / t.tarefas : 0;
          return (
            <li key={t.id} className="text-[15px]">
              <span className="flex items-center gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden="true">{t.n.split(" ").map((p) => p[0]).slice(0, 2).join("")}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{t.n}</span><span className="block text-sm text-muted-foreground">{t.validadas} de {t.tarefas} validadas · {desvioEmPalavras(dv)}{t.correcoes ? ` · ${t.correcoes} ${t.correcoes === 1 ? "correção" : "correções"}` : ""}</span></span>
                <span className="shrink-0 text-sm tabular-nums">{pct(feito)}</span>
              </span>
              <Barra v={feito} atraso={i * 60} className="ml-10 mt-1" cor={t.correcoes ? "bg-warning" : "bg-primary"} />
            </li>
          );
        })}
      </ul>
    ) : <SemDados>Ainda não há tarefas atribuídas nas obras.</SemDados>,
    horas: () => horas.length ? (
      <ul className="space-y-3">
        {horas.slice(0, 5).map((x, i) => {
          const max = Math.max(x.hPrev, x.hReal);
          return (
            <li key={x.sid} className="text-[15px]">
              <span className="flex items-baseline gap-2">{link(x.sid, nome.get(x.sid) ?? x.sid)}<span className={cn("ml-auto shrink-0 text-sm tabular-nums", x.dv > 0.05 ? "text-destructive" : "text-muted-foreground")}>{desvioEmPalavras(x.dv)}</span></span>
              <span className="mt-1 grid gap-1">
                <span className="flex items-center gap-2"><span className="w-12 shrink-0 text-xs text-muted-foreground">previsto</span><Barra v={x.hPrev / max} cor="bg-muted-foreground/40" atraso={i * 60} className="flex-1" /><span className="w-12 shrink-0 text-right text-xs tabular-nums">{nfmt(x.hPrev)} h</span></span>
                <span className="flex items-center gap-2"><span className="w-12 shrink-0 text-xs text-muted-foreground">real</span><Barra v={x.hReal / max} cor={x.dv > 0.05 ? "bg-destructive" : "bg-success"} atraso={i * 60 + 120} className="flex-1" /><span className="w-12 shrink-0 text-right text-xs tabular-nums">{nfmt(x.hReal)} h</span></span>
              </span>
            </li>
          );
        })}
      </ul>
    ) : <SemDados>As horas aparecem quando os técnicos registarem trabalho nas obras.</SemDados>,
    oficios: () => porOficio.length ? (
      <ul className="space-y-2.5">
        {porOficio.map((x, i) => (
          <li key={x.o} className="text-[15px]">
            <span className="flex items-baseline gap-2"><span className="min-w-0 flex-1 truncate">{x.o}</span><span className="shrink-0 tabular-nums">{pct(x.m)}</span></span>
            <Barra v={x.m / 0.6} cor={corMargem(x.m, (itens[0]?.min ?? 20) / 100)} atraso={i * 50} className="mt-1" />
          </li>
        ))}
      </ul>
    ) : <SemDados>Sem serviços em uso.</SemDados>,
  };

  const mover = (k: number, d: number) => setPrefs((p) => { const L = [...p.paineis], j = k + d; if (j < 0 || j >= L.length) return p; [L[k], L[j]] = [L[j], L[k]]; return { ...p, paineis: L }; });
  const visiveis = prefs.paineis.filter((p) => p.on);
  return (
    <aside aria-label="Desempenho" className="hidden space-y-4 lg:block">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight">Desempenho</h2>
        <Button variant="ghost" className="min-h-10 gap-1.5 text-[15px]" aria-expanded={editar} onClick={() => setEditar(!editar)}>
          {editar ? <X className="h-4 w-4" aria-hidden="true" /> : <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />}{editar ? "Fechar" : "Personalizar"}
        </Button>
      </div>
      {editar && (
        <div className={cn(CARTAO, "space-y-4", ENTRADA)}>
          <div>
            <p className="text-sm font-semibold">Painéis</p>
            <ul className="mt-2 space-y-1">
              {prefs.paineis.map((p, k) => {
                const { t, I } = PAINEIS[p.id];
                return (
                  <li key={p.id} className="flex items-center gap-1 text-[15px]">
                    <I className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className={cn("min-w-0 flex-1 truncate pl-1", !p.on && "text-muted-foreground line-through")}>{t}</span>
                    <button type="button" aria-label={`Subir ${t}`} disabled={k === 0} onClick={() => mover(k, -1)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" aria-label={`Descer ${t}`} disabled={k === prefs.paineis.length - 1} onClick={() => mover(k, 1)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" aria-label={`${p.on ? "Esconder" : "Mostrar"} ${t}`} aria-pressed={p.on} onClick={() => setPrefs((x) => ({ ...x, paineis: x.paineis.map((y) => (y.id === p.id ? { ...y, on: !y.on } : y)) }))} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted">{p.on ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
                  </li>
                );
              })}
            </ul>
          </div>
          <label className="flex items-center justify-between gap-3 text-[15px]">
            <span>Lista compacta</span>
            <input type="checkbox" role="switch" checked={prefs.compacta} onChange={(e) => setPrefs((p) => ({ ...p, compacta: e.target.checked }))} className="h-5 w-5 accent-[hsl(var(--primary))]" />
          </label>
          <Button variant="outline" className="min-h-10 w-full text-[15px]" onClick={() => setPrefs(() => PREFS0)}>Repor o painel de origem</Button>
        </div>
      )}
      {visiveis.map((p, i) => <Cartao key={p.id} id={p.id} i={i}>{corpo[p.id]()}</Cartao>)}
      {!visiveis.length && <SemDados>Todos os painéis escondidos. Use «Personalizar» para os mostrar.</SemDados>}
    </aside>
  );
}
