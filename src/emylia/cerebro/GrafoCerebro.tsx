// 27/11 (Rúben: «a base do conhecimento toda, como se fosse Obsidian e interativo»). O grafo do Cérebro: as notas da base de conhecimento
// ligadas umas às outras. Arrasta-se um nó (os vizinhos vêm atrás), arrasta-se o fundo para andar, roda do rato ou dois dedos para o zoom.
// Passar por cima de um nó acende as ligações dele; as obras com decisões dos agentes à espera pulsam, e a ligação do agente corre.
// O desenho é SVG; as posições mudam-se diretamente nos elementos (sem redesenhar o React a cada passo da simulação).
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type PointerEvent as EventoPonteiro } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Simulacao, corpoDoNo, enquadrar } from "./forcas";
import { vizinhos, type Grafo, type NoGrafo } from "./grafoConhecimento";

export interface GrafoCerebroRef {
  /** Leva a vista até ao nó (centra e aproxima). */
  focar(id: string): void;
  enquadrar(): void;
}

interface Props {
  grafo: Grafo;
  selecionado: string | null;
  onSelecionar(id: string | null): void;
  /** os nós que batem com a pesquisa (os outros apagam-se) */
  destaque?: ReadonlySet<string> | null;
  className?: string;
}

type Vista = { k: number; x: number; y: number };
const ROTULO_SEMPRE = new Set(["tema", "agente", "obra", "resumo"]);

export const GrafoCerebro = forwardRef<GrafoCerebroRef, Props>(function GrafoCerebro({ grafo, selecionado, onSelecionar, destaque, className }, ref) {
  const caixa = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const mundo = useRef<SVGGElement>(null);
  const elNos = useRef(new Map<string, SVGGElement>());
  const elArestas = useRef(new Map<string, SVGLineElement>());
  const vista = useRef<Vista>({ k: 1, x: 0, y: 0 });
  const sim = useRef<Simulacao | null>(null);
  const quadro = useRef<number | null>(null);
  const mexeu = useRef(false); // a pessoa já mexeu na vista: não se volta a enquadrar sozinho
  const [hover, setHover] = useState<string | null>(null);

  const corpos = useMemo(() => grafo.nos.map(corpoDoNo), [grafo]);
  const raios = useMemo(() => new Map(corpos.map((c) => [c.id, c.r])), [corpos]);
  const porId = useMemo(() => new Map(grafo.nos.map((n) => [n.id, n])), [grafo]);
  const pontas = useMemo(() => grafo.arestas.map((e) => ({ ...e })), [grafo]);

  const aplicarVista = useCallback(() => {
    const v = vista.current;
    mundo.current?.setAttribute("transform", `translate(${v.x},${v.y}) scale(${v.k})`);
    // de perto, aparecem os nomes de todos os nós
    if (svg.current) { if (v.k > 1.35) svg.current.setAttribute("data-perto", ""); else svg.current.removeAttribute("data-perto"); }
  }, []);

  const desenhar = useCallback(() => {
    const s = sim.current;
    if (!s) return;
    for (const c of s.corpos) elNos.current.get(c.id)?.setAttribute("transform", `translate(${c.x.toFixed(1)},${c.y.toFixed(1)})`);
    for (const e of pontas) {
      const l = elArestas.current.get(e.id), a = s.corpo(e.de), b = s.corpo(e.para);
      if (!l || !a || !b) continue;
      l.setAttribute("x1", a.x.toFixed(1)); l.setAttribute("y1", a.y.toFixed(1)); l.setAttribute("x2", b.x.toFixed(1)); l.setAttribute("y2", b.y.toFixed(1));
    }
  }, [pontas]);

  const animar = useCallback(() => {
    if (quadro.current != null) return;
    const volta = () => {
      const s = sim.current;
      if (!s) { quadro.current = null; return; }
      s.passo();
      desenhar();
      if (s.parada) { quadro.current = null; return; }
      quadro.current = requestAnimationFrame(volta);
    };
    quadro.current = requestAnimationFrame(volta);
  }, [desenhar]);

  const fazerEnquadrar = useCallback(() => {
    const s = sim.current, el = caixa.current;
    if (!s || !el) return;
    const r = el.getBoundingClientRect();
    vista.current = enquadrar(s.limites(), r.width, r.height, 36);
    aplicarVista();
  }, [aplicarVista]);

  // uma simulação nova quando o grafo muda (os nós que já lá estavam ficam onde estavam)
  useEffect(() => {
    const antes = sim.current ? new Map(sim.current.corpos.map((c) => [c.id, { x: c.x, y: c.y }])) : undefined;
    const nova = new Simulacao(corpos, grafo.arestas, {}, antes);
    if (antes) nova.alpha = 0.35; // só se acomoda
    else nova.correr(200); // a primeira disposição já quase assente; o resto vê-se a assentar
    sim.current = nova;
    desenhar();
    if (!mexeu.current) fazerEnquadrar();
    animar();
  }, [grafo, corpos, desenhar, animar, fazerEnquadrar]);
  useEffect(() => () => { if (quadro.current != null) cancelAnimationFrame(quadro.current); sim.current = null; }, []);

  // reenquadrar quando a caixa muda de tamanho (rodar o telemóvel), enquanto a pessoa não mexeu
  useEffect(() => {
    const el = caixa.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (!mexeu.current) fazerEnquadrar(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fazerEnquadrar]);

  const irPara = useCallback((alvo: Vista) => {
    const de = { ...vista.current }, t0 = performance.now(), dur = 420;
    const passo = (t: number) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      vista.current = { k: de.k + (alvo.k - de.k) * e, x: de.x + (alvo.x - de.x) * e, y: de.y + (alvo.y - de.y) * e };
      aplicarVista();
      if (p < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }, [aplicarVista]);

  useImperativeHandle(ref, () => ({
    focar(id: string) {
      const c = sim.current?.corpo(id), el = caixa.current;
      if (!c || !el) return;
      const r = el.getBoundingClientRect();
      const k = Math.max(vista.current.k, 1.6);
      // no ecrã largo o painel da nota tapa a direita: o nó fica um pouco à esquerda
      const cx = r.width >= 900 ? r.width * 0.36 : r.width / 2, cy = r.width >= 900 ? r.height / 2 : r.height * 0.3;
      mexeu.current = true;
      irPara({ k, x: cx - k * c.x, y: cy - k * c.y });
    },
    enquadrar() { mexeu.current = false; const s = sim.current, el = caixa.current; if (!s || !el) return; const r = el.getBoundingClientRect(); irPara(enquadrar(s.limites(), r.width, r.height, 36)); },
  }), [irPara]);

  // ------------------------------------------------------------ gestos: arrastar nós, andar, zoom (roda e dois dedos)
  const ponteiros = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<{ tipo: "no"; id: string; x0: number; y0: number; moveu: boolean } | { tipo: "fundo"; x0: number; y0: number; vx: number; vy: number; moveu: boolean } | { tipo: "pinca"; d0: number; k0: number; cx: number; cy: number; vx: number; vy: number } | null>(null);
  const paraMundo = (cx: number, cy: number) => {
    const r = svg.current!.getBoundingClientRect(), v = vista.current;
    return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k };
  };
  const zoomEm = useCallback((px: number, py: number, fator: number) => {
    const v = vista.current, k = Math.max(0.2, Math.min(4, v.k * fator));
    vista.current = { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
    mexeu.current = true;
    aplicarVista();
  }, [aplicarVista]);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const roda = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomEm(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)));
    };
    el.addEventListener("wheel", roda, { passive: false });
    return () => el.removeEventListener("wheel", roda);
  }, [zoomEm]);

  const noDoEvento = (t: EventTarget | null): string | null => {
    let el = t as Element | null;
    while (el && el !== svg.current) { const id = el.getAttribute?.("data-no"); if (id) return id; el = el.parentElement; }
    return null;
  };

  const aoCarregar = (e: EventoPonteiro<SVGSVGElement>) => {
    svg.current?.setPointerCapture(e.pointerId);
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ponteiros.current.size === 2) {
      const [a, b] = [...ponteiros.current.values()];
      const r = svg.current!.getBoundingClientRect();
      if (gesto.current?.tipo === "no") { const c = sim.current?.corpo(gesto.current.id); if (c) { c.fx = null; c.fy = null; } }
      gesto.current = { tipo: "pinca", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: vista.current.k, cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top, vx: vista.current.x, vy: vista.current.y };
      return;
    }
    const id = noDoEvento(e.target);
    if (id && sim.current) {
      const c = sim.current.corpo(id);
      if (c) { c.fx = c.x; c.fy = c.y; }
      gesto.current = { tipo: "no", id, x0: e.clientX, y0: e.clientY, moveu: false };
    } else gesto.current = { tipo: "fundo", x0: e.clientX, y0: e.clientY, vx: vista.current.x, vy: vista.current.y, moveu: false };
  };
  const aoMover = (e: EventoPonteiro<SVGSVGElement>) => {
    if (ponteiros.current.has(e.pointerId)) ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesto.current;
    if (!g) return;
    if (g.tipo === "pinca") {
      const [a, b] = [...ponteiros.current.values()];
      if (!a || !b) return;
      const k = Math.max(0.2, Math.min(4, (g.k0 * Math.hypot(a.x - b.x, a.y - b.y)) / g.d0));
      vista.current = { k, x: g.cx - ((g.cx - g.vx) * k) / g.k0, y: g.cy - ((g.cy - g.vy) * k) / g.k0 };
      mexeu.current = true;
      aplicarVista();
      return;
    }
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.moveu && Math.hypot(dx, dy) < 5) return;
    g.moveu = true;
    if (g.tipo === "fundo") { vista.current = { ...vista.current, x: g.vx + dx, y: g.vy + dy }; mexeu.current = true; aplicarVista(); return; }
    const c = sim.current?.corpo(g.id);
    if (!c || !sim.current) return;
    const p = paraMundo(e.clientX, e.clientY);
    c.fx = p.x; c.fy = p.y;
    sim.current.alphaAlvo = 0.25; sim.current.aquecer(0.25);
    animar();
  };
  const aoLargar = (e: EventoPonteiro<SVGSVGElement>) => {
    ponteiros.current.delete(e.pointerId);
    const g = gesto.current;
    if (g?.tipo === "pinca") { if (ponteiros.current.size < 2) gesto.current = null; return; }
    gesto.current = null;
    if (!g) return;
    if (g.tipo === "no") {
      const c = sim.current?.corpo(g.id);
      if (c) { c.fx = null; c.fy = null; }
      if (sim.current) sim.current.alphaAlvo = 0;
      if (!g.moveu) onSelecionar(g.id === selecionado ? null : g.id);
      animar();
    } else if (!g.moveu) onSelecionar(null);
  };

  // ------------------------------------------------------------ o que se acende
  const foco = hover ?? selecionado;
  const perto = useMemo(() => (foco ? new Set([foco, ...vizinhos(grafo, foco)]) : null), [foco, grafo]);
  const apagado = (id: string) => (perto ? !perto.has(id) : destaque ? !destaque.has(id) : false);
  const comRotulo = (n: NoGrafo) => ROTULO_SEMPRE.has(n.tipo) || n.id === selecionado || (perto?.has(n.id) ?? false) || (destaque?.has(n.id) ?? false);

  const resumo = `${grafo.nos.length} notas e ${grafo.arestas.length} ligações. ${grafo.nos.filter((n) => n.decisoes > 0).length} obras com decisões à espera.`;

  return (
    <div ref={caixa} className={cn("relative h-full w-full overflow-hidden", className)}>
      <style>{CSS}</style>
      <svg ref={svg} className="cerebro-svg h-full w-full touch-none select-none" role="img" aria-label={`O grafo da base de conhecimento: ${resumo}`}
        onPointerDown={aoCarregar} onPointerMove={aoMover} onPointerUp={aoLargar} onPointerCancel={aoLargar}
        onPointerLeave={() => setHover(null)}>
        <defs>
          <radialGradient id="cerebro-brilho">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g ref={mundo}>
          <g>
            {grafo.arestas.map((e) => {
              const ag = e.tipo === "agente" ? porId.get(e.de.startsWith("agente:") ? e.de : e.para) : null;
              const ativa = foco ? (e.de === foco || e.para === foco) : false;
              return (
                <line key={e.id} ref={(el) => { if (el) elArestas.current.set(e.id, el); else elArestas.current.delete(e.id); }}
                  className={cn("cerebro-aresta", e.ativa && "cerebro-corre", ativa && "cerebro-acesa", (perto || destaque) && !ativa && "cerebro-apagada")}
                  stroke={ag ? ag.cor : undefined} />
              );
            })}
          </g>
          <g>
            {grafo.nos.map((n) => {
              const r = raios.get(n.id) ?? 6;
              const sel = n.id === selecionado;
              return (
                <g key={n.id} data-no={n.id} ref={(el) => { if (el) elNos.current.set(n.id, el); else elNos.current.delete(n.id); }}
                  className={cn("cerebro-no", apagado(n.id) && "cerebro-apagado", !comRotulo(n) && "cerebro-rotulo-menor")}
                  onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}>
                  {n.decisoes > 0 && <circle r={r + 3} className="cerebro-pulso" stroke={n.cor} />}
                  <circle r={r * 2.4} fill={n.cor} opacity={0.13} />
                  {n.tipo === "agente" ? (
                    <>
                      <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={r * 0.55} fill={n.cor} stroke="#0d0a1f" strokeWidth={1.5} />
                      <text className="cerebro-sigla" dy="0.35em">{n.rotulo.slice(0, 2).toUpperCase()}</text>
                    </>
                  ) : (
                    <circle r={r} fill={n.cor} stroke={n.tipo === "tema" ? "#ede9fe" : "#0d0a1f"} strokeWidth={n.tipo === "tema" ? 1.5 : 1.2} />
                  )}
                  {n.tipo !== "agente" && <circle r={r * 0.45} cx={-r * 0.25} cy={-r * 0.3} fill="url(#cerebro-brilho)" opacity={0.35} />}
                  {sel && <circle r={r + 6} className="cerebro-selecao" />}
                  {destaque?.has(n.id) && !sel && <circle r={r + 5} className="cerebro-encontrado" />}
                  {n.decisoes > 0 && (
                    <g transform={`translate(${r * 0.8},${-r * 0.8})`}>
                      <circle r={7} fill="#f59e0b" stroke="#0d0a1f" strokeWidth={1.5} />
                      <text className="cerebro-contador" dy="0.35em">{n.decisoes > 9 ? "9+" : n.decisoes}</text>
                    </g>
                  )}
                  <text className={cn("cerebro-rotulo", n.tipo === "tema" && "cerebro-rotulo-tema")} y={r + 13}>{n.rotulo}</text>
                </g>
              );
            })}
          </g>
        </g>
      </svg>
      <div className="absolute bottom-3 left-3 flex flex-col gap-1.5">
        {[
          { rot: "Aproximar", Icone: Plus, f: () => { const r = caixa.current!.getBoundingClientRect(); zoomEm(r.width / 2, r.height / 2, 1.3); } },
          { rot: "Afastar", Icone: Minus, f: () => { const r = caixa.current!.getBoundingClientRect(); zoomEm(r.width / 2, r.height / 2, 1 / 1.3); } },
          { rot: "Ver tudo", Icone: Maximize2, f: () => { mexeu.current = false; const s = sim.current, el = caixa.current; if (!s || !el) return; const r = el.getBoundingClientRect(); irPara(enquadrar(s.limites(), r.width, r.height, 36)); } },
        ].map(({ rot, Icone, f }) => (
          <button key={rot} type="button" onClick={f} aria-label={rot} title={rot}
            className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/80 backdrop-blur transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300">
            <Icone className="h-4 w-4" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
});

const CSS = `
.cerebro-svg { cursor: grab; }
.cerebro-svg:active { cursor: grabbing; }
.cerebro-no { cursor: pointer; transition: opacity .25s ease; }
.cerebro-apagado { opacity: .14; }
.cerebro-aresta { stroke: #c4b5fd; stroke-opacity: .2; stroke-width: 1; transition: stroke-opacity .25s ease; vector-effect: non-scaling-stroke; }
.cerebro-aresta.cerebro-acesa { stroke-opacity: .85; stroke-width: 1.6; }
.cerebro-aresta.cerebro-apagada { stroke-opacity: .05; }
.cerebro-aresta.cerebro-corre { stroke-opacity: .75; stroke-width: 1.6; stroke-dasharray: 3 5; animation: cerebro-fluxo 1.1s linear infinite; }
.cerebro-rotulo { fill: #ede9fe; font-size: 10.5px; font-weight: 500; text-anchor: middle; paint-order: stroke; stroke: #0d0a1f; stroke-width: 3px; stroke-linejoin: round; pointer-events: none; }
.cerebro-rotulo-tema { font-size: 12.5px; font-weight: 700; fill: #fff; letter-spacing: .02em; }
.cerebro-svg:not([data-perto]) .cerebro-rotulo-menor .cerebro-rotulo { opacity: 0; }
.cerebro-sigla { fill: #0d0a1f; font-size: 9px; font-weight: 800; text-anchor: middle; pointer-events: none; }
.cerebro-contador { fill: #1c1206; font-size: 8.5px; font-weight: 800; text-anchor: middle; pointer-events: none; }
.cerebro-selecao { fill: none; stroke: #fff; stroke-width: 2; }
.cerebro-encontrado { fill: none; stroke: #fde68a; stroke-width: 2; stroke-dasharray: 2 2; }
.cerebro-pulso { fill: none; stroke-width: 2; transform-box: fill-box; transform-origin: center; animation: cerebro-pulso 1.8s ease-out infinite; }
@keyframes cerebro-pulso { 0% { transform: scale(1); opacity: .9; } 100% { transform: scale(2.6); opacity: 0; } }
@keyframes cerebro-fluxo { to { stroke-dashoffset: -16; } }
@media (prefers-reduced-motion: reduce) { .cerebro-pulso, .cerebro-aresta.cerebro-corre { animation: none; } }
`;
