// 6/11 (Rúben: «algo como o planner do IKEA com os produtos que temos»). O planeador da cozinha: à esquerda o 3D (arrastar roda, a roda do
// rato aproxima, tocar num móvel escolhe-o), por cima o total e o resumo, em baixo as voltas, as medidas, desfazer e a divisão; à direita o
// painel com os separadores (baixos, altos, de parede, eletrodomésticos, tampo e frentes), as frentes e as larguras em miniatura, e o móvel
// escolhido (largura, frente, produto, mover, duplicar, tirar). Aberto a partir do Estúdio (?estudio=1), lê a parede da planta e volta
// para lá com os móveis (Projeto.cozinha), que entram nas necessidades e no orçamento.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ChevronLeft, ChevronRight, Copy, List, Redo2, RotateCcw, RotateCw, Ruler, Save, Settings2, Trash2, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATALOGO, produto, type Produto } from "../catalogoFake";
import { CHAVE_ESTUDIO } from "../daVisita";
import type { Projeto } from "../necessidadesEstudio";
import { Ilustracao } from "../Ilustracao";
import {
  ACABAMENTOS, MODELOS, NOME_FRENTE, PUXADORES, acabamentoDoEstilo, avisos, comprimento, cozinhaDeExemplo, cozinhaParaParede, duplicar, juntar, lerCozinha, linhasDaCozinha,
  moduloDe, mover, mudar, novoModulo, porNoLugar, postos, precoDoMovel, produtosPara, tirar, totalDaCozinha, type Cozinha, type Frente, type LinhaCozinha, type Modelo, type Modulo,
} from "./modelo";
import { cenaDaCozinha, cenaDoModulo, cotas, desenhar, projetor, type Camara } from "./cena";

export const CHAVE_COZINHA = "olyvia.cozinha.v1";
const eur = (n: number) => n.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";
const eur2 = (n: number) => n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const BOTAO_FLUT = "inline-flex min-h-11 items-center gap-2 rounded-full bg-white/95 px-4 text-[15px] font-medium text-slate-900 shadow-md ring-1 ring-black/5 backdrop-blur hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";
const REDONDO = "grid h-11 w-11 place-items-center rounded-full bg-white/95 text-slate-900 shadow-md ring-1 ring-black/5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-40";

type Separador = "baixos" | "altos" | "parede" | "aparelhos" | "acabamentos";
const SEPARADORES: { id: Separador; n: string }[] = [
  { id: "baixos", n: "Baixos" }, { id: "altos", n: "Altos" }, { id: "parede", n: "De parede" }, { id: "aparelhos", n: "Eletrodomésticos" }, { id: "acabamentos", n: "Tampo e frentes" },
];

// ---------------------------------------------------------------- ler e guardar (no browser e, vindo do Estúdio, no projeto)
function lerProjeto(): Projeto | null {
  try { const t = localStorage.getItem(CHAVE_ESTUDIO); return t ? (JSON.parse(t) as Projeto) : null; } catch { return null; }
}
function cozinhaInicial(doEstudio: boolean): Cozinha {
  if (doEstudio) {
    const p = lerProjeto();
    const c = lerCozinha(p?.cozinha);
    if (c) return c;
    // a parede mais comprida da planta é a dos móveis
    const parede = Math.max(0, ...(p?.depois.paredes ?? []).map((w) => w.c));
    return { ...(parede >= 150 ? cozinhaParaParede(parede) : cozinhaDeExemplo()), acabamento: acabamentoDoEstilo(p?.estilo.porCategoria.movel ?? p?.estilo.cores) };
  }
  try { const c = lerCozinha(JSON.parse(localStorage.getItem(CHAVE_COZINHA) ?? "null")); if (c) return c; } catch { /* o exemplo */ }
  return cozinhaDeExemplo();
}
function guardar(c: Cozinha, doEstudio: boolean): boolean {
  try {
    localStorage.setItem(CHAVE_COZINHA, JSON.stringify(c));
    if (doEstudio) { const p = lerProjeto(); if (p) localStorage.setItem(CHAVE_ESTUDIO, JSON.stringify({ ...p, cozinha: c, gravadoEm: Date.now() })); }
    return true;
  } catch { return false; }
}

// ---------------------------------------------------------------- o ecrã
export default function PlaneadorCozinha() {
  const [busca] = useSearchParams();
  const doEstudio = busca.get("estudio") === "1";
  const navegar = useNavigate();
  const reduzir = useReducedMotion();
  const [hist, setHist] = useState<{ agora: Cozinha; passado: Cozinha[]; futuro: Cozinha[] }>(() => ({ agora: cozinhaInicial(doEstudio), passado: [], futuro: [] }));
  const c = hist.agora;
  const mexer = (fn: (x: Cozinha) => Cozinha) => setHist((h) => { const n = fn(h.agora); return n === h.agora ? h : { agora: n, passado: [...h.passado.slice(-40), h.agora], futuro: [] }; });
  const desfazer = () => setHist((h) => (h.passado.length ? { agora: h.passado[h.passado.length - 1], passado: h.passado.slice(0, -1), futuro: [h.agora, ...h.futuro] } : h));
  const refazer = () => setHist((h) => (h.futuro.length ? { agora: h.futuro[0], passado: [...h.passado, h.agora], futuro: h.futuro.slice(1) } : h));
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [sep, setSep] = useState<Separador>("baixos");
  const [frenteFiltro, setFrenteFiltro] = useState<Frente>("3g");
  const [resumo, setResumo] = useState(false);
  const [divisao, setDivisao] = useState(false);
  const [aviso, setAviso] = useState("");
  const [cam, setCam] = useState<Camara>({ rumo: -0.42, inclinacao: 0.3, perto: 1 });
  const [medidas, setMedidas] = useState(true);

  // grava sozinho (e no projeto do Estúdio, quando veio de lá)
  useEffect(() => { guardar(c, doEstudio); }, [c, doEstudio]);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(""), 2600); return () => clearTimeout(t); }, [aviso]);

  const sel = moduloDe(c, escolhido);
  const total = totalDaCozinha(c);
  const problemas = avisos(c);

  // o teclado: Delete tira, as setas mudam o escolhido de sítio, Ctrl+Z desfaz
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (/input|textarea|select/i.test(alvo.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) refazer(); else desfazer(); return; }
      if (!escolhido) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); mexer((x) => tirar(x, escolhido)); setEscolhido(null); }
      if (e.key === "ArrowLeft") { e.preventDefault(); mexer((x) => mover(x, escolhido, -1)); }
      if (e.key === "ArrowRight") { e.preventDefault(); mexer((x) => mover(x, escolhido, 1)); }
      if (e.key === "Escape") setEscolhido(null);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as funções usam setHist
  }, [escolhido]);

  const juntarModulo = (m: Modulo, emCima?: boolean) => {
    const depois = sel && (MODELOS[sel.modelo].fila === "parede") === (emCima ?? MODELOS[m.modelo].fila === "parede") ? sel.id : undefined;
    mexer((x) => juntar(x, m, depois, emCima));
    setEscolhido(m.id);
    setAviso(`${MODELOS[m.modelo].n} de ${m.w} cm junto${depois ? " a seguir ao escolhido" : " no fim da fila"}.`);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground lg:h-[100dvh] lg:flex-row">
      <main className="relative h-[62vh] shrink-0 overflow-hidden bg-gradient-to-b from-[#f4f3f0] to-[#e6e2da] lg:h-auto lg:flex-1" aria-label="A cozinha em 3D">
        <Vista c={c} cam={cam} setCam={setCam} escolhido={escolhido} setEscolhido={setEscolhido} medidas={medidas}
          aoPorNoLugar={(id, i) => { mexer((x) => porNoLugar(x, id, i)); setAviso("Mudado de sítio."); }} />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 sm:p-4">
          <div className="pointer-events-auto flex flex-wrap gap-2">
            {doEstudio && <button type="button" className={BOTAO_FLUT} onClick={() => { guardar(c, true); navegar("/prototipo/estudio"); }}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Voltar ao Estúdio</button>}
            <button type="button" className={BOTAO_FLUT} onClick={() => setAviso(guardar(c, doEstudio) ? (doEstudio ? "Guardado no projeto do Estúdio." : "Guardado neste browser.") : "Não deu para guardar neste browser.")}>
              <Save className="h-4 w-4" aria-hidden="true" />Guardar
            </button>
          </div>
          <div className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-full bg-white/95 p-1 pl-3 shadow-md ring-1 ring-black/5 sm:pl-4">
            <List className="hidden h-4 w-4 text-slate-500 sm:block" aria-hidden="true" />
            <span className="whitespace-nowrap px-1 text-xl font-semibold tabular-nums tracking-tight text-slate-900 sm:px-2 sm:text-2xl" aria-label={`Total com IVA: ${eur(total.comIva)}`}>{eur(total.comIva)}</span>
            <button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-[15px] font-medium text-primary-foreground hover:bg-primary/90" onClick={() => setResumo(true)}>
              Resumo<ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* os avisos (passa da parede, falta o lava-loiça) e o que acabou de acontecer */}
        <div className="pointer-events-none absolute inset-x-0 top-20 flex flex-col items-center gap-2 px-4" aria-live="polite">
          <AnimatePresence>
            {aviso && <motion.p key={aviso} initial={reduzir ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-full bg-slate-900/85 px-4 py-2 text-sm text-white shadow">{aviso}</motion.p>}
          </AnimatePresence>
          {problemas.slice(0, 2).map((p) => <p key={p} className="rounded-full bg-amber-50/95 px-3 py-1.5 text-sm text-amber-900 shadow-sm ring-1 ring-amber-200">{p}</p>)}
        </div>

        <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-2 sm:bottom-4 sm:left-4">
          <button type="button" className={REDONDO} aria-label="Rodar para a esquerda" onClick={() => setCam((x) => ({ ...x, rumo: Math.max(-1.2, x.rumo - 0.35) }))}><RotateCcw className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" className={REDONDO} aria-label="Rodar para a direita" onClick={() => setCam((x) => ({ ...x, rumo: Math.min(1.2, x.rumo + 0.35) }))}><RotateCw className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" className={cn(REDONDO, medidas && "bg-slate-900 text-white hover:bg-slate-800")} aria-pressed={medidas} aria-label="Mostrar as medidas" onClick={() => setMedidas((m) => !m)}><Ruler className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" className={REDONDO} aria-label="Desfazer" disabled={!hist.passado.length} onClick={desfazer}><Undo2 className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" className={REDONDO} aria-label="Refazer" disabled={!hist.futuro.length} onClick={refazer}><Redo2 className="h-4 w-4" aria-hidden="true" /></button>
        </div>
        <div className="absolute bottom-3 right-3 sm:bottom-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
          <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full bg-slate-900 px-3 text-[15px] font-medium text-white shadow-lg hover:bg-slate-800 sm:px-4" aria-expanded={divisao} aria-label="Personalizar divisão" onClick={() => setDivisao((x) => !x)}>
            <Settings2 className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Personalizar divisão</span>
          </button>
          <AnimatePresence>
            {divisao && (
              <motion.div initial={reduzir ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                className="absolute bottom-14 right-0 w-72 space-y-3 rounded-2xl bg-white p-4 text-slate-900 shadow-xl ring-1 ring-black/5 sm:left-1/2 sm:right-auto sm:-translate-x-1/2">
                <p className="text-[15px] font-semibold">A divisão</p>
                <Medida rotulo="Comprimento da parede" valor={c.parede} onMudar={(n) => mexer((x) => ({ ...x, parede: n }))} />
                <Medida rotulo="Altura do teto" valor={c.altura} onMudar={(n) => mexer((x) => ({ ...x, altura: n }))} />
                <Medida rotulo="Fundo da divisão" valor={c.fundo} onMudar={(n) => mexer((x) => ({ ...x, fundo: n }))} />
                <p className="text-xs text-slate-500">Baixos: {comprimento(c.baixo)} cm · de parede: {comprimento(c.cima)} cm, de {c.parede} cm de parede.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <aside className="flex min-h-0 w-full flex-col border-t border-border bg-card lg:w-[440px] lg:border-l lg:border-t-0" aria-label="Os móveis">
        {sel ? (
          <PainelModulo c={c} m={sel} fechar={() => setEscolhido(null)} mexer={mexer} tirarEste={() => { mexer((x) => tirar(x, sel.id)); setEscolhido(null); setAviso(`${MODELOS[sel.modelo].n} tirado.`); }} />
        ) : (
          <PainelCatalogo c={c} sep={sep} setSep={setSep} frente={frenteFiltro} setFrente={setFrenteFiltro} juntar={juntarModulo} mexer={mexer} />
        )}
      </aside>

      <AnimatePresence>
        {resumo && <Resumo c={c} fechar={() => setResumo(false)} doEstudio={doEstudio} voltar={() => { guardar(c, true); navegar("/prototipo/estudio"); }} />}
      </AnimatePresence>
    </div>
  );
}

function Medida({ rotulo, valor, onMudar }: { rotulo: string; valor: number; onMudar: (n: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      {rotulo}
      <span className="flex items-center gap-1.5">
        <input key={valor} type="number" min={100} max={1200} step={5} defaultValue={valor} className="h-10 w-24 rounded-lg border border-slate-300 px-2 text-right tabular-nums"
          onBlur={(e) => { const n = Math.round(Number(e.target.value)); if (Number.isFinite(n) && n >= 100 && n !== valor) onMudar(n); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        <span className="text-slate-500">cm</span>
      </span>
    </label>
  );
}

// ---------------------------------------------------------------- o 3D
function Vista({ c, cam, setCam, escolhido, setEscolhido, medidas, aoPorNoLugar }: {
  c: Cozinha; cam: Camara; setCam: React.Dispatch<React.SetStateAction<Camara>>; escolhido: string | null; setEscolhido: (id: string | null) => void; medidas: boolean;
  aoPorNoLugar: (id: string, i: number) => void;
}) {
  const cena = useMemo(() => cenaDaCozinha(c), [c]);
  const { poligonos, caixa } = useMemo(() => desenhar(cena, cam), [cena, cam]);
  const cs = useMemo(() => (medidas ? cotas(c, cena, cam, escolhido) : []), [medidas, c, cena, cam, escolhido]);
  const arrasto = useRef<{ x: number; y: number; r: number; i: number; mexeu: boolean; movel?: string } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [passar, setPassar] = useState<string | null>(null);
  // 6/11: arrastar o escolhido muda-o de sítio na fila (o lugar é o do ponto mais perto, entre os outros)
  const [lugar, setLugar] = useState<{ id: string; i: number; linha: [number, number][] } | null>(null);
  // à volta dos móveis: espaço para as cotas e para os botões por cima e por baixo
  const m = Math.max(caixa.w, caixa.h) * 0.1, vb = { x: caixa.x - m, y: caixa.y - m * 1.6, w: caixa.w + 2 * m, h: caixa.h + 3 * m };
  const sw = vb.w / 900, letra = vb.w / 62;

  const noSvg = (e: { clientX: number; clientY: number }): [number, number] | null => {
    const el = svgRef.current, ctm = el?.getScreenCTM?.();
    if (!el || !ctm) return null;
    const pt = el.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(ctm.inverse());
    return [q.x, q.y];
  };
  /** O lugar na fila (sem o que se arrasta) para o ponto do ecrã: conta os que ficam à esquerda dele, e a linha onde entra. */
  const lugarPara = (id: string, u: number) => {
    const emCima = c.cima.some((x) => x.id === id), fila = (emCima ? c.cima : c.baixo).filter((x) => x.id !== id);
    const { ver } = projetor(cena, cam), z = emCima ? 150 : 0, y = emCima ? 37 : 64;
    const ps = postos(fila);
    const i = ps.filter((p) => ver([(p.x0 + p.x1) / 2, y, z]).u < u).length;
    const x = i < ps.length ? ps[i].x0 : ps.length ? ps[ps.length - 1].x1 : 0;
    const a = ver([x, y, z]), b = ver([x, y, z + (emCima ? 70 : 92)]);
    return { id, i, linha: [[a.u, a.v], [b.u, b.v]] as [number, number][] };
  };

  const comecar = (e: RPointerEvent<SVGSVGElement>) => {
    const alvo = (e.target as Element).closest("[data-modulo]")?.getAttribute("data-modulo") ?? undefined;
    arrasto.current = { x: e.clientX, y: e.clientY, r: cam.rumo, i: cam.inclinacao, mexeu: false, movel: alvo && alvo === escolhido ? alvo : undefined };
  };
  const mexerRato = (e: RPointerEvent<SVGSVGElement>) => {
    const a = arrasto.current;
    if (!a) { setPassar((e.target as Element).closest("[data-modulo]")?.getAttribute("data-modulo") ?? null); return; }
    const dx = e.clientX - a.x, dy = e.clientY - a.y;
    if (!a.mexeu && Math.hypot(dx, dy) < 5) return;
    if (!a.mexeu) { a.mexeu = true; e.currentTarget.setPointerCapture?.(e.pointerId); }
    if (a.movel) { const q = noSvg(e); if (q) setLugar(lugarPara(a.movel, q[0])); return; }
    setCam((x) => ({ ...x, rumo: Math.max(-1.2, Math.min(1.2, a.r + dx * 0.006)), inclinacao: Math.max(0.05, Math.min(0.95, a.i + dy * 0.004)) }));
  };
  const largar = (e: RPointerEvent<SVGSVGElement>) => {
    const a = arrasto.current; arrasto.current = null;
    if (a?.movel && a.mexeu && lugar) { aoPorNoLugar(lugar.id, lugar.i); setLugar(null); return; }
    setLugar(null);
    if (a && !a.mexeu) {
      // um toque: o móvel debaixo do dedo (ou nada)
      const alvo = (e.target as Element).closest("[data-modulo]");
      setEscolhido(alvo?.getAttribute("data-modulo") ?? null);
    }
  };
  const roda = (e: React.WheelEvent) => setCam((x) => ({ ...x, perto: Math.max(0.55, Math.min(1.8, (x.perto ?? 1) * (e.deltaY > 0 ? 1.08 : 0.93))) }));

  return (
    <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
      role="img" aria-label="A cozinha em 3D: arraste para rodar, toque num móvel para o escolher, arraste o escolhido para o mudar de sítio." onPointerDown={comecar} onPointerMove={mexerRato} onPointerUp={largar}
      onPointerLeave={() => { if (!arrasto.current) setPassar(null); }} onPointerCancel={() => { arrasto.current = null; setLugar(null); }} onWheel={roda}>
      {poligonos.map((p, i) => {
        const pts = p.pts.map((q) => q.join(",")).join(" ");
        if (p.linha) return p.fechada
          ? <polygon key={i} points={pts} fill="none" stroke={p.cor} strokeWidth={(p.largura ?? 1) * sw} />
          : <polyline key={i} points={pts} fill="none" stroke={p.cor} strokeWidth={(p.largura ?? 1) * sw} />;
        const mod = p.id && p.id !== "tampo" && p.id !== "chao" && !p.id.startsWith("parede") ? p.id : undefined;
        const este = mod && mod === escolhido, porCima = mod && mod === passar && !este;
        return (
          <polygon key={i} points={pts} fill={p.cor} data-modulo={mod} className={mod ? (este ? "cursor-move" : "cursor-pointer") : undefined}
            stroke={este ? "hsl(var(--primary))" : porCima ? "hsl(var(--primary) / 0.55)" : p.contorno ?? "rgba(0,0,0,0.22)"} strokeWidth={(este ? 2.4 : porCima ? 1.6 : 0.7) * sw} strokeLinejoin="round"
            opacity={lugar && mod === lugar.id ? 0.55 : 1} />
        );
      })}
      {/* onde entra o que se arrasta */}
      {lugar && <line x1={lugar.linha[0][0]} y1={lugar.linha[0][1]} x2={lugar.linha[1][0]} y2={lugar.linha[1][1]} stroke="hsl(var(--primary))" strokeWidth={4 * sw} strokeLinecap="round" />}
      {cs.map((k, i) => {
        const tw = letra * (0.62 * k.texto.length + 1.2), th = letra * 1.5;
        return (
          <g key={i} aria-hidden="true">
            <line x1={k.a[0]} y1={k.a[1]} x2={k.b[0]} y2={k.b[1]} stroke="#111" strokeWidth={1.4 * sw} />
            {[k.a, k.b].map((q, j) => <circle key={j} cx={q[0]} cy={q[1]} r={2.2 * sw} fill="#111" />)}
            <rect x={k.meio[0] - tw / 2} y={k.meio[1] - th / 2} width={tw} height={th} rx={th * 0.28} fill="#111" />
            <text x={k.meio[0]} y={k.meio[1] + letra * 0.36} textAnchor="middle" fontSize={letra} fontWeight={700} fill="#fff">{k.texto}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** A miniatura de um módulo, no painel. */
function Miniatura({ m, c, tamanho = 78 }: { m: Modulo; c: Cozinha; tamanho?: number }) {
  const { poligonos, caixa } = useMemo(() => desenhar(cenaDoModulo(m, c), { rumo: -0.5, inclinacao: 0.28 }), [m, c]);
  const mg = Math.max(caixa.w, caixa.h) * 0.08, sw = Math.max(caixa.w, caixa.h) / 260;
  if (!poligonos.length) return <span className="grid place-items-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400" style={{ width: tamanho, height: tamanho }}>livre</span>;
  return (
    <svg viewBox={`${caixa.x - mg} ${caixa.y - mg} ${caixa.w + 2 * mg} ${caixa.h + 2 * mg}`} width={tamanho} height={tamanho} aria-hidden="true">
      {poligonos.map((p, i) => p.linha
        ? <polygon key={i} points={p.pts.map((q) => q.join(",")).join(" ")} fill="none" stroke={p.cor} strokeWidth={sw * 0.6} />
        : <polygon key={i} points={p.pts.map((q) => q.join(",")).join(" ")} fill={p.cor} stroke="rgba(0,0,0,0.2)" strokeWidth={sw * 0.5} strokeLinejoin="round" />)}
    </svg>
  );
}

/** O desenho da disposição da frente (como os ícones do IKEA). */
function IconeFrente({ f }: { f: Frente }) {
  const linhas: Record<Frente, ReactNode> = {
    "3g": <><path d="M5 10h14M5 15h14" /><path d="M10 7.5h4M10 12.5h4M10 17.5h4" /></>,
    gp: <><path d="M5 9h14" /><path d="M10 7h4M10 11.5h4" /></>,
    p: <path d="M10 7.5h4" />,
    "2p": <><path d="M5 15h14" /><path d="M10 13h4M10 17h4" /></>,
    forno: <><rect x="7" y="9" width="10" height="6" rx="1" /><path d="M5 17h14" /></>,
    painel: <path d="M9 7.5h6" />,
  };
  return <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="1" />{linhas[f]}</svg>;
}

// ---------------------------------------------------------------- o painel do catálogo
function PainelCatalogo({ c, sep, setSep, frente, setFrente, juntar, mexer }: {
  c: Cozinha; sep: Separador; setSep: (s: Separador) => void; frente: Frente; setFrente: (f: Frente) => void;
  juntar: (m: Modulo, emCima?: boolean) => void; mexer: (fn: (x: Cozinha) => Cozinha) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-5 pb-0 pt-5">
        <h2 className="text-xl font-semibold tracking-tight">Os móveis da cozinha</h2>
        <p className="text-sm text-muted-foreground">Toque num móvel para o juntar à fila. No 3D, toque num para o mudar.</p>
        <div role="tablist" aria-label="Tipos de móvel" className="mt-3 flex flex-wrap gap-x-3">
          {SEPARADORES.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={sep === s.id} onClick={() => setSep(s.id)}
              className={cn("min-h-11 shrink-0 border-b-2 px-2 text-[15px] font-medium transition-colors", sep === s.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{s.n}</button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5" role="tabpanel">
        {sep === "baixos" && <>
          <section className="space-y-2">
            <h3 className="text-[15px] font-semibold">Disposição da frente</h3>
            <p className="text-sm text-muted-foreground">{NOME_FRENTE[frente]}</p>
            <div className="flex gap-2">
              {(["3g", "gp", "p"] as Frente[]).map((f) => (
                <button key={f} type="button" aria-pressed={frente === f} aria-label={NOME_FRENTE[f]} onClick={() => setFrente(f)}
                  className={cn("grid h-16 w-16 place-items-center rounded-lg border-2 transition-colors", frente === f ? "border-foreground" : "border-border hover:border-foreground/40")}><IconeFrente f={f} /></button>
              ))}
            </div>
          </section>
          <Grupo titulo="Normal" c={c} itens={MODELOS.normal.larguras.slice().reverse().map((w) => ({ modelo: "normal" as Modelo, w, frente }))} juntar={juntar} />
          <Grupo titulo="Lava-loiça" c={c} itens={MODELOS.lava.larguras.slice().reverse().map((w) => ({ modelo: "lava" as Modelo, w }))} juntar={juntar} />
          <Grupo titulo="Com placa e forno" c={c} itens={[{ modelo: "placa", w: 60, frente: "forno" }, { modelo: "placa", w: 80, frente: "forno" }, { modelo: "placa", w: 60, frente: "3g" }]} juntar={juntar} />
          <Grupo titulo="Máquina da loiça" c={c} itens={[{ modelo: "maquina", w: 60 }]} juntar={juntar} />
          <Grupo titulo="Espaço livre" c={c} itens={[20, 30, 60].map((w) => ({ modelo: "vazio" as Modelo, w }))} juntar={juntar} />
        </>}
        {sep === "altos" && <>
          <Grupo titulo="Armários altos" c={c} itens={[{ modelo: "alto", w: 60 }, { modelo: "alto", w: 40 }, { modelo: "alto_forno", w: 60 }]} juntar={juntar} />
          <Grupo titulo="Frigorífico" c={c} itens={[{ modelo: "alto_frigorifico", w: 60 }, ...produtosPara("frigorifico").map((p) => ({ modelo: "frigorifico" as Modelo, w: 60, produto: p.id }))]} juntar={juntar} />
        </>}
        {sep === "parede" && <>
          <Grupo titulo="Armários de parede" c={c} itens={MODELOS.parede.larguras.slice().reverse().map((w) => ({ modelo: "parede" as Modelo, w }))} juntar={juntar} />
          <Grupo titulo="Exaustor" c={c} itens={produtosPara("exaustor").map((p) => ({ modelo: "exaustor" as Modelo, w: p.w ?? 60, produto: p.id }))} juntar={juntar} />
          <Grupo titulo="Espaço livre (em cima)" c={c} itens={[30, 60].map((w) => ({ modelo: "vazio" as Modelo, w }))} juntar={juntar} emCima />
        </>}
        {sep === "aparelhos" && <Aparelhos c={c} juntar={juntar} />}
        {sep === "acabamentos" && <Acabamentos c={c} mexer={mexer} />}
      </div>
    </div>
  );
}

function Grupo({ titulo, c, itens, juntar, emCima }: { titulo: string; c: Cozinha; itens: { modelo: Modelo; w: number; frente?: Frente; produto?: string }[]; juntar: (m: Modulo, emCima?: boolean) => void; emCima?: boolean }) {
  // as miniaturas: um módulo de cada (com o produto, quando é um eletrodoméstico escolhido)
  const exemplos = useMemo(() => itens.map((it) => { const m = novoModulo(it.modelo, it.w, it.frente); return it.produto ? { ...m, produto: it.produto } : m; }), [itens]);
  return (
    <section className="space-y-2">
      <h3 className="text-[15px] font-semibold">{titulo}</h3>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {exemplos.map((m, i) => {
          const p = produto(m.produto);
          return (
            <li key={i}>
              <button type="button" onClick={() => juntar({ ...m, id: novoModulo(m.modelo).id }, emCima)} aria-label={`Juntar ${MODELOS[m.modelo].n} de ${m.w} cm${p ? `, ${p.n}` : ""}`}
                className="group flex w-full flex-col items-center gap-1 rounded-xl border border-border p-2 text-center transition-colors hover:border-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                <Miniatura m={m} c={c} />
                <span className="text-xs text-muted-foreground">L: {m.w} cm</span>
                {p && <span className="line-clamp-2 text-[11px] leading-tight text-muted-foreground">{p.n.split(",")[0]}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Os eletrodomésticos do catálogo: tocar junta o móvel que o leva (ou troca o do móvel que já há). */
function Aparelhos({ c, juntar }: { c: Cozinha; juntar: (m: Modulo, emCima?: boolean) => void }) {
  const grupos: { n: string; modelo: Modelo; cat: Produto["cat"] }[] = [
    { n: "Lava-loiças", modelo: "lava", cat: "lava" }, { n: "Placas", modelo: "placa", cat: "placa" }, { n: "Fornos", modelo: "alto_forno", cat: "forno" },
    { n: "Máquinas da loiça", modelo: "maquina", cat: "maquina" }, { n: "Frigoríficos", modelo: "frigorifico", cat: "frigorifico" }, { n: "Exaustores", modelo: "exaustor", cat: "exaustor" },
  ];
  const emUso = new Set([...c.baixo, ...c.cima].flatMap((m) => [m.produto, m.extra]).filter(Boolean));
  return <>
    {grupos.map((g) => (
      <section key={g.n} className="space-y-2">
        <h3 className="text-[15px] font-semibold">{g.n}</h3>
        <ul className="space-y-2">
          {CATALOGO.filter((p) => p.cat === g.cat).map((p) => {
            const modelo: Modelo = g.cat === "frigorifico" && /encastrar/i.test(p.n) ? "alto_frigorifico" : g.modelo;
            return (
              <li key={p.id}>
                <button type="button" onClick={() => juntar({ ...novoModulo(modelo, p.w && p.w > 60 ? 80 : undefined, modelo === "placa" ? "forno" : undefined), produto: p.id })}
                  className="flex w-full items-center gap-3 rounded-xl border border-border p-2.5 text-left transition-colors hover:border-foreground/50">
                  <Ilustracao cat={p.cat} hex={p.hex} tamanho={44} />
                  <span className="min-w-0 flex-1 text-sm"><span className="block font-medium">{p.n}</span><span className="text-muted-foreground">{eur(p.preco)} + {eur(p.inst)} de instalação</span></span>
                  {emUso.has(p.id) && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">na cozinha</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    ))}
  </>;
}

function Acabamentos({ c, mexer }: { c: Cozinha; mexer: (fn: (x: Cozinha) => Cozinha) => void }) {
  return <>
    <section className="space-y-2">
      <h3 className="text-[15px] font-semibold">As frentes</h3>
      <div className="flex flex-wrap gap-2">
        {ACABAMENTOS.map((a) => (
          <button key={a.id} type="button" aria-pressed={c.acabamento === a.id} onClick={() => mexer((x) => ({ ...x, acabamento: a.id }))}
            className={cn("flex min-h-11 items-center gap-2 rounded-full border-2 px-3 text-sm", c.acabamento === a.id ? "border-foreground" : "border-border")}>
            <span className="h-5 w-5 rounded-full ring-1 ring-black/15" style={{ background: a.hex }} aria-hidden="true" />{a.n}
          </button>
        ))}
      </div>
    </section>
    <section className="space-y-2">
      <h3 className="text-[15px] font-semibold">Os puxadores</h3>
      <div className="flex flex-wrap gap-2">
        {PUXADORES.map((p) => (
          <button key={p.id} type="button" aria-pressed={c.puxador === p.id} onClick={() => mexer((x) => ({ ...x, puxador: p.id }))}
            className={cn("min-h-11 rounded-full border-2 px-3 text-sm", c.puxador === p.id ? "border-foreground" : "border-border")}>{p.n}{p.preco ? ` · ${eur(p.preco)}` : ""}</button>
        ))}
      </div>
    </section>
    <section className="space-y-2">
      <h3 className="text-[15px] font-semibold">O tampo</h3>
      <ul className="space-y-2">
        {CATALOGO.filter((p) => p.cat === "bancada").map((p) => (
          <li key={p.id}>
            <button type="button" aria-pressed={c.tampo === p.id} onClick={() => mexer((x) => ({ ...x, tampo: p.id }))}
              className={cn("flex w-full items-center gap-3 rounded-xl border-2 p-2.5 text-left", c.tampo === p.id ? "border-foreground" : "border-border")}>
              <span className="h-10 w-14 rounded-md ring-1 ring-black/10" style={{ background: p.hex }} aria-hidden="true" />
              <span className="min-w-0 flex-1 text-sm"><span className="block font-medium">{p.n}</span><span className="text-muted-foreground">{eur2(p.preco / 1.2)} por metro</span></span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  </>;
}

// ---------------------------------------------------------------- o móvel escolhido
function PainelModulo({ c, m, fechar, mexer, tirarEste }: { c: Cozinha; m: Modulo; fechar: () => void; mexer: (fn: (x: Cozinha) => Cozinha) => void; tirarEste: () => void }) {
  const info = MODELOS[m.modelo];
  const leva = produtosPara(m.modelo), extra = produtosPara(m.modelo, "extra");
  const preco = precoDoMovel(m, c) + (produto(m.produto)?.preco ?? 0) + (m.modelo !== "placa" || m.frente === "forno" ? produto(m.extra)?.preco ?? 0 : 0);
  const fila = info.fila === "parede" ? c.cima : c.baixo, i = fila.findIndex((x) => x.id === m.id);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <button type="button" className="grid h-11 w-11 place-items-center rounded-full hover:bg-muted" aria-label="Voltar aos móveis" onClick={fechar}><ArrowLeft className="h-5 w-5" aria-hidden="true" /></button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold tracking-tight">{info.n}</h2>
          <p className="text-sm text-muted-foreground">{m.w} cm · {NOME_FRENTE[m.frente]} · {eur(preco)}</p>
        </div>
        <Miniatura m={m} c={c} tamanho={64} />
      </div>
      <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5">
        {info.larguras.length > 1 && (
          <section className="space-y-2">
            <h3 className="text-[15px] font-semibold">Largura</h3>
            <div className="flex flex-wrap gap-2">
              {info.larguras.map((w) => (
                <button key={w} type="button" aria-pressed={m.w === w} onClick={() => mexer((x) => mudar(x, m.id, { w }))}
                  className={cn("min-h-11 min-w-16 rounded-full border-2 px-3 text-sm tabular-nums", m.w === w ? "border-foreground" : "border-border")}>{w} cm</button>
              ))}
            </div>
          </section>
        )}
        {info.frentes.length > 1 && (
          <section className="space-y-2">
            <h3 className="text-[15px] font-semibold">Disposição da frente</h3>
            <div className="flex flex-wrap gap-2">
              {info.frentes.map((f) => (
                <button key={f} type="button" aria-pressed={m.frente === f} onClick={() => mexer((x) => mudar(x, m.id, { frente: f, ...(f === "forno" && !m.extra && extra[0] ? { extra: extra[0].id } : {}) }))}
                  className={cn("flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border-2 px-3 text-xs", m.frente === f ? "border-foreground" : "border-border")}><IconeFrente f={f} />{NOME_FRENTE[f]}</button>
              ))}
            </div>
          </section>
        )}
        {leva.length > 0 && <EscolhaProduto titulo={tituloLeva(info.leva)} produtos={leva} escolhido={m.produto} onEscolher={(id) => mexer((x) => mudar(x, m.id, { produto: id }))} />}
        {extra.length > 0 && (m.modelo !== "placa" || m.frente === "forno") && <EscolhaProduto titulo={info.extra === "forno" ? "O forno" : "A torneira"} produtos={extra} escolhido={m.extra} onEscolher={(id) => mexer((x) => mudar(x, m.id, { extra: id }))} />}
        <section className="space-y-2">
          <h3 className="text-[15px] font-semibold">Na fila</h3>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3 text-sm disabled:opacity-40" disabled={i <= 0} onClick={() => mexer((x) => mover(x, m.id, -1))}><ChevronLeft className="h-4 w-4" aria-hidden="true" />Para a esquerda</button>
            <button type="button" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3 text-sm disabled:opacity-40" disabled={i >= fila.length - 1} onClick={() => mexer((x) => mover(x, m.id, 1))}>Para a direita<ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
            <button type="button" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3 text-sm" onClick={() => mexer((x) => duplicar(x, m.id))}><Copy className="h-4 w-4" aria-hidden="true" />Duplicar</button>
            <button type="button" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-destructive/40 px-3 text-sm text-destructive" onClick={tirarEste}><Trash2 className="h-4 w-4" aria-hidden="true" />Tirar</button>
          </div>
          <p className="text-xs text-muted-foreground">No 3D, arraste o escolhido para outro sítio. No teclado: as setas mudam de sítio, Delete tira, Ctrl+Z desfaz.</p>
        </section>
      </div>
    </div>
  );
}
const tituloLeva = (cat: string | undefined) => ({ lava: "O lava-loiça", placa: "A placa", maquina: "A máquina da loiça", forno: "O forno", frigorifico: "O frigorífico", exaustor: "O exaustor" } as Record<string, string>)[cat ?? ""] ?? "O produto";

function EscolhaProduto({ titulo, produtos, escolhido, onEscolher }: { titulo: string; produtos: Produto[]; escolhido?: string; onEscolher: (id: string) => void }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[15px] font-semibold">{titulo}</h3>
      <ul className="space-y-2">
        {produtos.map((p) => (
          <li key={p.id}>
            <button type="button" aria-pressed={escolhido === p.id} onClick={() => onEscolher(p.id)}
              className={cn("flex w-full items-center gap-3 rounded-xl border-2 p-2.5 text-left transition-colors", escolhido === p.id ? "border-foreground bg-muted/40" : "border-border hover:border-foreground/40")}>
              <Ilustracao cat={p.cat} hex={p.hex} tamanho={44} />
              <span className="min-w-0 flex-1 text-sm"><span className="block font-medium">{p.n}</span><span className="text-muted-foreground">{eur(p.preco)}{p.destaque ? ` · ${p.destaque}` : ""}</span></span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- o resumo
function Resumo({ c, fechar, doEstudio, voltar }: { c: Cozinha; fechar: () => void; doEstudio: boolean; voltar: () => void }) {
  const linhas = linhasDaCozinha(c), t = totalDaCozinha(c);
  const grupos = (["Móveis", "Tampo", "Eletrodomésticos", "Montagem"] as LinhaCozinha["grupo"][]).map((g) => ({ g, ls: linhas.filter((l) => l.grupo === g) })).filter((x) => x.ls.length);
  return (
    <motion.div className="fixed inset-0 z-50 flex justify-end bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={fechar}>
      <motion.section role="dialog" aria-modal="true" aria-labelledby="t-resumo" className="flex h-full w-full max-w-md flex-col bg-card shadow-2xl"
        initial={{ x: 40 }} animate={{ x: 0 }} exit={{ x: 40 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="t-resumo" className="text-xl font-semibold tracking-tight">Resumo da cozinha</h2>
          <button type="button" className="grid h-11 w-11 place-items-center rounded-full hover:bg-muted" aria-label="Fechar o resumo" onClick={fechar}><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {grupos.map(({ g, ls }) => (
            <section key={g} className="space-y-2">
              <h3 className="text-[15px] font-semibold">{g}</h3>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {ls.map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                    <span className="min-w-0">{l.n}<span className="block text-xs text-muted-foreground">{l.q.toLocaleString("pt-PT")} {l.un} × {eur2(l.unit)}</span></span>
                    <span className="shrink-0 tabular-nums">{eur2(l.total)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="text-xs text-muted-foreground">Os móveis, as frentes e os puxadores têm preços de teste. Os eletrodomésticos, o lava-loiça, a torneira e o tampo são os produtos do catálogo do Estúdio.</p>
        </div>
        <div className="space-y-3 border-t border-border px-5 py-4">
          <p className="flex items-baseline justify-between"><span className="text-sm text-muted-foreground">Sem IVA</span><span className="tabular-nums">{eur2(t.semIva)}</span></p>
          <p className="flex items-baseline justify-between"><span className="font-medium">Com IVA</span><span className="text-2xl font-semibold tabular-nums">{eur2(t.comIva)}</span></p>
          {doEstudio && <button type="button" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/90" onClick={voltar}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Levar para o Estúdio</button>}
        </div>
      </motion.section>
    </motion.div>
  );
}
