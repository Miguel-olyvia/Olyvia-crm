// O separador "Ligações" do Catálogo do V1 (14/10/2026): o mapa das relações à volta de um elemento.
// O elemento escolhido fica no centro; à volta, em colunas (computador) ou em camadas (telemóvel), os
// grupos ligados. As ligações são curvas SVG que se desenham do centro para fora (framer-motion,
// pathLength); ao tocar num nó, o desenho dele voa para o centro (layoutId) e as ligações novas
// desenham-se. Passar o rato (ou tocar) numa ligação mostra o porquê. Com prefers-reduced-motion
// fica tudo visível de imediato. A lógica está em ligacoes.ts (sem React).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LayoutGroup, MotionConfig, motion, useReducedMotion } from "framer-motion";
import { ChevronRight, Search, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { normal } from "./catalogo";
import type { SvcId } from "./motor";
import { IconeServico, Ilustracao } from "./ilustracoes";
import { useDesktop } from "./useDesktop";
import {
  NOME_TIPO, TIPOS_PROBLEMA, centroInicial, chaveRef, contarProblemas, ligacoesDe, noDe, problemasCatalogo, problemasPorNo, procurarNos,
  type CatalogoLig, type GrupoMapa, type Ligacao, type Mapa, type Problema, type Ref, type Visual,
} from "./ligacoes";

const NOTA = "text-[15px] text-muted-foreground";
/** No máximo 12 nós por grupo; o resto fica em "+ N". */
export const MAX_POR_GRUPO = 12;
const POR_PAGINA = 40;
const CHIP = (on: boolean) => cn("inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-[15px] transition-colors", on ? "border-primary bg-primary/10 font-medium" : "border-input bg-card hover:bg-muted");

/* ------------------------------------------------------------------ abrir o mapa noutro sítio (a ficha) */
// o rasto dura enquanto a sessão dura (ex.: abrir a ficha a partir do mapa e voltar)
let ultimoRasto: Ref[] = [];
let pendente: Ref | null = null;
/** Pede que o mapa abra centrado neste elemento (lido uma vez, quando o separador monta). */
export const abrirLigacoesEm = (r: Ref) => { pendente = r; };
const mesma = (a: Ref, b: Ref) => a.t === b.t && a.id === b.id;

/* ------------------------------------------------------------------ peças */
function Desenho({ vis, id, grande, centro }: { vis: Visual; id: string; grande?: boolean; centro?: boolean }) {
  return (
    <motion.span layoutId={`vis-${id}`} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn("grid shrink-0 place-items-center rounded-xl", grande ? "h-20 w-20" : "h-11 w-11", centro ? "bg-primary/10 text-primary" : "bg-muted text-foreground/70")}>
      {vis.k === "ilus" ? <Ilustracao k={vis.v} className={grande ? "h-16 w-16" : "h-9 w-9"} /> : <IconeServico k={vis.v} className={grande ? "h-9 w-9" : "h-5 w-5"} />}
    </motion.span>
  );
}

interface PropsNo {
  l: Ligacao; ativo: boolean; aviso: Problema[] | undefined; porqueVisivel: boolean; i: number; reduzir: boolean;
  regista: (el: HTMLElement | null) => void; onIr: (r: Ref) => void; onAtivo: (k: string | null) => void;
}
function No({ l, ativo, aviso, porqueVisivel, i, reduzir, regista, onIr, onAtivo }: PropsNo) {
  const k = chaveRef(l.ref);
  return (
    <li>
      <motion.button ref={regista} type="button" data-no={k}
        initial={reduzir ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: reduzir ? 0 : Math.min(i * 0.02, 0.15) + 0.1 }}
        onClick={() => onIr(l.ref)} onMouseEnter={() => onAtivo(k)} onMouseLeave={() => onAtivo(null)} onFocus={() => onAtivo(k)} onBlur={() => onAtivo(null)}
        className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl border bg-card px-3 py-2 text-left transition-colors",
          ativo ? "border-primary" : "border-border hover:border-foreground/30")}>
        <Desenho vis={l.vis} id={k} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-[15px] font-medium leading-snug">{l.n}</span>
          {porqueVisivel || !ativo
            ? <span className={cn(NOTA, "block", !porqueVisivel && "truncate")}>{porqueVisivel ? l.porque : l.det}</span>
            // no computador, o porquê aparece no lugar da linha de baixo enquanto a ligação está ativa
            : <motion.span key="porque" data-testid="porque" initial={reduzir ? false : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}
                className="block text-[15px] font-medium text-foreground">{l.porque}</motion.span>}
          <span className="sr-only">{porqueVisivel ? `, ${l.det}` : `, ${l.porque}`}{aviso ? `. Atenção: ${aviso.map((p) => p.t).join(" ")}` : ""}</span>
        </span>
        {l.opcional && <span className={cn(NOTA, "shrink-0")} aria-hidden="true">opcional</span>}
        {aviso && <TriangleAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />}
      </motion.button>
    </li>
  );
}

/* ------------------------------------------------------------------ o mapa */
interface Caixa { x: number; y: number; w: number; h: number }
interface PropsMapa {
  mapa: Mapa; desktop: boolean; reduzir: boolean; porNo: Map<string, Problema[]>;
  onIr: (r: Ref) => void; onMais: (g: string) => void; aberto: string | null; onAbrirFicha: (sid: SvcId) => void;
}
type Lado = "esq" | "dir";

/** Os grupos pelos dois lados do centro, equilibrando o número de nós à vista. */
function repartir(G: GrupoMapa[]): Record<Lado, GrupoMapa[]> {
  const r: Record<Lado, GrupoMapa[]> = { esq: [], dir: [] }, peso = { esq: 0, dir: 0 };
  for (const g of G) { const l: Lado = peso.esq <= peso.dir ? "esq" : "dir"; r[l].push(g); peso[l] += Math.min(g.itens.length, MAX_POR_GRUPO) + 2; }
  return r;
}

function MapaLigacoes({ mapa, desktop, reduzir, porNo, onIr, onMais, aberto, onAbrirFicha }: PropsMapa) {
  const caixa = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const registos = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const regista = (k: string) => {
    let f = registos.current.get(k);
    if (!f) { f = (el) => { if (el) els.current.set(k, el); else els.current.delete(k); }; registos.current.set(k, f); }
    return f;
  };
  const [pos, setPos] = useState<Record<string, Caixa>>({});
  const [ativo, setAtivo] = useState<string | null>(null);
  const kc = chaveRef(mapa.centro.ref);

  // as posições sem as transformações das animações (offsetLeft/offsetTop até à caixa)
  const medir = useCallback(() => {
    const c = caixa.current;
    if (!c) return;
    const r: Record<string, Caixa> = {};
    els.current.forEach((el, k) => {
      let x = 0, y = 0, e: HTMLElement | null = el;
      while (e && e !== c) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent as HTMLElement | null; }
      if (e === c) r[k] = { x, y, w: el.offsetWidth, h: el.offsetHeight };
      else {
        // sem offsetParent (ex.: jsdom): pela caixa no ecrã
        const a = el.getBoundingClientRect(), b = c.getBoundingClientRect();
        r[k] = { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
      }
    });
    setPos(r);
  }, []);
  useLayoutEffect(() => { medir(); setAtivo(null); }, [mapa, desktop, medir]);
  useEffect(() => {
    const c = caixa.current;
    if (!c || typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver(() => medir());
    o.observe(c);
    return () => o.disconnect();
  }, [medir]);

  const lados = desktop ? repartir(mapa.grupos) : { esq: mapa.grupos, dir: [] };
  const ladoDe = new Map<string, Lado>();
  for (const l of ["esq", "dir"] as Lado[]) for (const g of lados[l]) ladoDe.set(g.id, l);

  // as ligações a desenhar: os nós à vista e o "+ N" de cada grupo (tracejado)
  const C = pos[kc];
  const alvos = mapa.grupos.flatMap((g) => [
    ...g.itens.slice(0, MAX_POR_GRUPO).map((l) => ({ k: chaveRef(l.ref), lado: ladoDe.get(g.id)!, l, mais: false })),
    ...(g.itens.length > MAX_POR_GRUPO ? [{ k: `mais:${g.id}`, lado: ladoDe.get(g.id)!, l: null, mais: true }] : []),
  ]);
  const linhas = C ? alvos.flatMap((a, i) => {
    const R = pos[a.k];
    if (!R) return [];
    let d: string, x1: number, y1: number;
    if (desktop) {
      const esq = a.lado === "esq", x0 = esq ? C.x : C.x + C.w, y0 = C.y + C.h / 2;
      x1 = esq ? R.x + R.w : R.x; y1 = R.y + R.h / 2;
      const meio = (x0 + x1) / 2;
      d = `M ${x0} ${y0} C ${meio} ${y0}, ${meio} ${y1}, ${x1} ${y1}`;
    } else {
      // em camadas: uma espinha do centro para baixo e um ramo curvo para cada nó
      const sx = 20, y0 = C.y + C.h, r = 12;
      x1 = R.x; y1 = R.y + R.h / 2;
      d = `M ${sx} ${y0} L ${sx} ${y1 - r} Q ${sx} ${y1} ${sx + r} ${y1} L ${x1} ${y1}`;
    }
    return [{ ...a, i, d, x1, y1 }];
  }) : [];
  // a ativa por cima
  linhas.sort((a, b) => Number(a.k === ativo) - Number(b.k === ativo));
  const avisoCentro = porNo.get(kc);
  const total = mapa.grupos.reduce((a, g) => a + g.itens.length, 0);

  const grupo = (g: GrupoMapa) => (
    <section key={g.id} aria-label={g.titulo} className={desktop ? "" : "pl-10"}>
      <h3 className="text-[15px] font-semibold">{g.titulo} <span className="font-normal text-muted-foreground">· {g.itens.length}</span></h3>
      {g.nota && <p className={cn(NOTA, "mt-0.5")}>{g.nota}</p>}
      {g.itens.length ? (
        <ul className="mt-2 space-y-2">
          {g.itens.slice(0, MAX_POR_GRUPO).map((l, i) => {
            const k = chaveRef(l.ref);
            return <No key={k} l={l} i={i} reduzir={reduzir} ativo={ativo === k} aviso={porNo.get(k)} porqueVisivel={!desktop} regista={regista(k)} onIr={onIr} onAtivo={setAtivo} />;
          })}
        </ul>
      ) : <p className={cn(NOTA, "mt-1")}>Nenhum.</p>}
      {g.itens.length > MAX_POR_GRUPO && (
        <button ref={regista(`mais:${g.id}`)} type="button" aria-expanded={aberto === g.id} onClick={() => onMais(g.id)}
          className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-dashed border-input bg-card px-4 text-[15px] font-medium hover:bg-muted">
          + {g.itens.length - MAX_POR_GRUPO} <span className="sr-only">&nbsp;{g.titulo.toLowerCase()} (abrir a lista)</span>
        </button>
      )}
    </section>
  );

  const centro = (
    <div ref={regista(kc)} data-centro={kc} className={cn("relative z-10 rounded-2xl border-2 border-primary bg-card p-4 shadow-[var(--shadow-sm)]", desktop ? "text-center" : "flex items-start gap-4")}>
      <div className={desktop ? "flex justify-center" : ""}><Desenho vis={mapa.centro.vis} id={kc} grande centro /></div>
      <div className={cn("min-w-0", desktop && "mt-3")}>
        <p className={NOTA}>{NOME_TIPO[mapa.centro.ref.t]}</p>
        <h2 id="lig-centro" tabIndex={-1} className="text-xl font-semibold leading-snug tracking-tight outline-none">{mapa.centro.n}</h2>
        <p className={NOTA}>{mapa.centro.det}</p>
        {avisoCentro && (
          <ul className={cn("mt-2 space-y-1 text-left", desktop && "border-t border-border pt-2")} aria-label="Problemas de dados">
            {avisoCentro.map((p) => <li key={p.tipo} className="flex items-start gap-1.5 text-[15px]"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />{p.t}</li>)}
          </ul>
        )}
        {mapa.centro.ref.t === "svc" && (
          <button type="button" onClick={() => onAbrirFicha(mapa.centro.ref.id)} className="mt-1 inline-flex min-h-11 items-center text-[15px] font-medium text-primary underline-offset-4 hover:underline">
            Abrir a ficha
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div ref={caixa} className={cn("relative mt-6", desktop ? "grid grid-cols-[minmax(0,1fr)_16rem_minmax(0,1fr)] items-center gap-x-24" : "space-y-6")}
      data-testid="mapa-ligacoes" data-layout={desktop ? "colunas" : "camadas"} onMouseLeave={() => setAtivo(null)}>
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        {linhas.map((x) => {
          const on = x.k === ativo, cor = on ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.45)";
          return (
            <g key={`${kc}>${x.k}`}>
              {x.mais ? (
                <motion.path d={x.d} fill="none" stroke={cor} strokeWidth={1.5} strokeDasharray="4 5"
                  initial={reduzir ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35, delay: 0.15 }} />
              ) : (
                <motion.path d={x.d} fill="none" stroke={cor} strokeWidth={on ? 2.5 : 1.5} strokeLinecap="round" style={{ transition: "stroke .2s, stroke-width .2s" }}
                  initial={reduzir ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.35, delay: Math.min(x.i * 0.02, 0.15), ease: "easeOut" }} />
              )}
              <motion.circle cx={x.x1} cy={x.y1} r={on ? 4 : 3} fill={cor} initial={reduzir ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15, delay: reduzir ? 0 : Math.min(x.i * 0.02, 0.15) + 0.3 }} />
              {x.l && <path d={x.d} fill="none" stroke="transparent" strokeWidth={16} style={{ pointerEvents: "stroke", cursor: "help" }}
                onPointerEnter={() => setAtivo(x.k)} onClick={() => setAtivo(x.k)} />}
            </g>
          );
        })}
      </svg>
      {desktop ? (
        <>
          <div className="space-y-6">{lados.esq.map(grupo)}</div>
          {centro}
          <div className="space-y-6">{lados.dir.map(grupo)}</div>
        </>
      ) : (
        <>
          {centro}
          {mapa.grupos.map(grupo)}
        </>
      )}
      <p className="sr-only" aria-live="polite">{`${mapa.centro.n}: ${total === 1 ? "1 ligação" : `${total} ligações`}.`}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ a lista do "+ N" */
function ListaGrupo({ g, onIr, onFechar }: { g: GrupoMapa; onIr: (r: Ref) => void; onFechar: () => void }) {
  const [q, setQ] = useState("");
  const [n, setN] = useState(POR_PAGINA);
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titulo.current?.focus(); titulo.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }); }, [g.id]);
  const L = useMemo(() => { const qq = normal(q.trim()); return qq ? g.itens.filter((l) => normal(`${l.n} ${l.det}`).includes(qq)) : g.itens; }, [g, q]);
  return (
    <section aria-labelledby="lig-lista-t" className="mt-8 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="lig-lista-t" ref={titulo} tabIndex={-1} className="text-lg font-semibold outline-none">{g.titulo} <span className="font-normal text-muted-foreground">· {g.itens.length}</span></h3>
        <button type="button" onClick={onFechar} className="inline-flex min-h-11 items-center px-2 text-[15px] font-medium text-muted-foreground hover:text-foreground">Fechar a lista</button>
      </div>
      <label className="relative mt-3 block max-w-md">
        <span className="sr-only">Procurar em {g.titulo.toLowerCase()}</span>
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setN(POR_PAGINA); }} placeholder="Procurar nesta lista"
          className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
      </label>
      <ul className="mt-3 divide-y divide-border">
        {L.slice(0, n).map((l) => (
          <li key={chaveRef(l.ref)}>
            <button type="button" onClick={() => onIr(l.ref)} className="flex min-h-14 w-full items-center gap-3 py-2 text-left hover:bg-muted/60">
              {l.vis.k === "ilus" ? <Ilustracao k={l.vis.v} className="h-10 w-10" /> : <span className="grid h-10 w-10 place-items-center rounded-lg bg-muted"><IconeServico k={l.vis.v} /></span>}
              <span className="min-w-0 flex-1"><span className="block text-[15px]">{l.n}</span><span className={cn(NOTA, "block")}>{l.porque}</span></span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </li>
        ))}
        {!L.length && <li className={cn(NOTA, "py-3")}>Nada com esse nome.</li>}
      </ul>
      {L.length > n && <Button variant="outline" className="mt-3 min-h-11 text-[15px]" onClick={() => setN(n + POR_PAGINA)}>Mostrar mais {Math.min(POR_PAGINA, L.length - n)} <span className="text-muted-foreground">(faltam {L.length - n})</span></Button>}
    </section>
  );
}

/* ------------------------------------------------------------------ os problemas */
function Problemas({ P, onIr }: { P: Problema[]; onIr: (r: Ref) => void }) {
  const n = contarProblemas(P);
  const [mais, setMais] = useState<Record<string, number>>({});
  const tipos = TIPOS_PROBLEMA.filter((x) => n[x.tipo] > 0);
  return (
    <div className="mt-6" data-testid="problemas">
      <p className="text-[16px]">{P.length ? `${P.length === 1 ? "1 problema" : `${P.length} problemas`} nos dados do Catálogo. Toque num para o ver no mapa.` : "Sem problemas nos dados do Catálogo."}</p>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1" aria-label="Problemas por tipo">
        {TIPOS_PROBLEMA.map((x) => <li key={x.tipo} className={cn("text-[15px]", n[x.tipo] ? "" : "text-muted-foreground")}><span className="font-semibold tabular-nums">{n[x.tipo]}</span> {x.t.toLowerCase()}</li>)}
      </ul>
      {tipos.map((x) => {
        const L = P.filter((p) => p.tipo === x.tipo), ver = mais[x.tipo] ?? 8;
        return (
          <section key={x.tipo} aria-label={x.t} className="mt-6">
            <h3 className="text-lg font-semibold">{x.t} <span className="font-normal text-muted-foreground">· {L.length}</span></h3>
            <p className={NOTA}>{x.d}</p>
            <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)]">
              {L.slice(0, ver).map((p) => (
                <li key={chaveRef(p.ref)}>
                  <button type="button" onClick={() => onIr(p.ref)} className="flex min-h-12 w-full items-center gap-3 py-2 text-left">
                    <TriangleAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-[15px]">{p.n}</span>
                    <span className="shrink-0 text-[15px] font-medium text-primary">Ver no mapa</span>
                  </button>
                </li>
              ))}
            </ul>
            {L.length > ver && <Button variant="outline" className="mt-2 min-h-11 text-[15px]" onClick={() => setMais((m) => ({ ...m, [x.tipo]: ver + 20 }))}>Mostrar mais {Math.min(20, L.length - ver)} <span className="text-muted-foreground">(faltam {L.length - ver})</span></Button>}
          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ escolher o centro */
function EscolherCentro({ K, onIr }: { K: CatalogoLig; onIr: (r: Ref) => void }) {
  const [q, setQ] = useState("");
  const L = useMemo(() => procurarNos(K, q, 8), [K, q]);
  return (
    <div className="relative w-full max-w-md">
      <label className="relative block">
        <span className="sr-only">Escolher o centro do mapa</span>
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }}
          placeholder="Serviço, produto, técnico…" aria-controls="lig-resultados"
          className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
      </label>
      {q.trim() && (
        <ul id="lig-resultados" aria-label="Resultados" className="absolute inset-x-0 top-12 z-30 max-h-96 divide-y divide-border overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
          {L.map((x) => (
            <li key={chaveRef(x.ref)}>
              <button type="button" onClick={() => { onIr(x.ref); setQ(""); }} className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60">
                {x.vis.k === "ilus" ? <Ilustracao k={x.vis.v} className="h-9 w-9" /> : <span className="grid h-9 w-9 place-items-center rounded-lg bg-muted"><IconeServico k={x.vis.v} /></span>}
                <span className="min-w-0 flex-1"><span className="block truncate text-[15px]">{x.n}</span><span className={cn(NOTA, "block truncate")}>{NOME_TIPO[x.ref.t]} · {x.det}</span></span>
              </button>
            </li>
          ))}
          {!L.length && <li className={cn(NOTA, "px-3 py-3")}>Nada com esse nome.</li>}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ o separador */
export function LigacoesCatalogo({ K, onAbrirFicha }: { K: CatalogoLig; onAbrirFicha: (sid: SvcId) => void }) {
  const desktop = useDesktop();
  const reduzir = !!useReducedMotion();
  const [rasto, setRastoE] = useState<Ref[]>(() => {
    const vivos = ultimoRasto.filter((r) => noDe(r, K));
    const p = pendente;
    pendente = null;
    if (p && noDe(p, K)) { const i = vivos.findIndex((r) => mesma(r, p)); return i >= 0 ? vivos.slice(0, i + 1) : [...vivos, p].slice(-6); }
    if (vivos.length) return vivos;
    const c = centroInicial(K);
    return c ? [c] : [];
  });
  const setRasto = (r: Ref[]) => { ultimoRasto = r; setRastoE(r); };
  useEffect(() => { ultimoRasto = rasto; }, [rasto]);
  const [vista, setVista] = useState<"mapa" | "problemas">("mapa");
  const [aberto, setAberto] = useState<string | null>(null);
  const navegou = useRef(false);

  const centro = rasto[rasto.length - 1] ?? null;
  const mapa = useMemo(() => (centro ? ligacoesDe(centro, K) : null), [centro, K]);
  const P = useMemo(() => problemasCatalogo(K), [K]);
  const porNo = useMemo(() => problemasPorNo(P), [P]);

  const ir = (r: Ref) => {
    const i = rasto.findIndex((x) => mesma(x, r));
    setRasto(i >= 0 ? rasto.slice(0, i + 1) : [...rasto, r].slice(-6));
    setAberto(null);
    setVista("mapa");
    navegou.current = true;
  };
  // depois de mudar o centro, o foco vai para o nome dele (para quem usa o teclado)
  useEffect(() => {
    if (!navegou.current) return;
    navegou.current = false;
    document.getElementById("lig-centro")?.focus({ preventScroll: true });
  }, [centro]);

  const grupoAberto = mapa?.grupos.find((g) => g.id === aberto) ?? null;
  const nomes = rasto.map((r) => noDe(r, K)?.n ?? "—");

  return (
    <MotionConfig reducedMotion="user">
      <p className={NOTA}>Escolha um serviço, produto, equipamento, consumível ou técnico: fica no centro, com tudo o que está ligado a ele. Toque num elemento para o pôr no centro; passe o rato numa ligação para ver porquê.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <EscolherCentro K={K} onIr={ir} />
        <div role="group" aria-label="Vista" className="flex gap-2">
          <button type="button" aria-pressed={vista === "mapa"} onClick={() => setVista("mapa")} className={CHIP(vista === "mapa")}>Mapa</button>
          <button type="button" aria-pressed={vista === "problemas"} onClick={() => setVista("problemas")} className={CHIP(vista === "problemas")}>
            {P.length > 0 && <TriangleAlert className="h-4 w-4 text-warning" aria-hidden="true" />}Problemas <span className="tabular-nums text-muted-foreground">{P.length}</span>
          </button>
        </div>
      </div>

      {vista === "problemas" ? <Problemas P={P} onIr={ir} /> : !mapa ? (
        <p className={cn(NOTA, "mt-6")}>O Catálogo está vazio.</p>
      ) : (
        <>
          <nav aria-label="Rasto" className="mt-5">
            <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[15px]">
              {rasto.map((r, i) => {
                const ultimo = i === rasto.length - 1;
                return (
                  <li key={`${i}-${chaveRef(r)}`} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                    {ultimo
                      ? <span aria-current="page" className="inline-flex min-h-11 items-center px-1 font-semibold">{nomes[i]}</span>
                      : <button type="button" onClick={() => ir(r)} className="inline-flex min-h-11 max-w-[16rem] items-center truncate rounded-lg px-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"><span className="truncate">{nomes[i]}</span></button>}
                  </li>
                );
              })}
            </ol>
          </nav>
          <LayoutGroup>
            <MapaLigacoes mapa={mapa} desktop={desktop} reduzir={reduzir} porNo={porNo} onIr={ir} aberto={aberto}
              onMais={(g) => setAberto((a) => (a === g ? null : g))} onAbrirFicha={onAbrirFicha} />
          </LayoutGroup>
          {grupoAberto && <ListaGrupo g={grupoAberto} onIr={ir} onFechar={() => setAberto(null)} />}
        </>
      )}
    </MotionConfig>
  );
}
