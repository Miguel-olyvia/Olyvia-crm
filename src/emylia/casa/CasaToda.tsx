// 28/11 (Rúben, Schroeder: «é a casa toda, tem sala, cozinha, casa de banho etc. precisamos de ter tudo. uma planta 3d muito mais
// completa, em que conseguimos ter a casa toda, ou ver em destaque e isolado cada área de intervenção»). Escolhido: «Áreas encaixadas».
// A casa toda: as plantas das áreas (cada uma desenhada no seu Estúdio) juntas, cada uma no seu lugar. Arrasta-se para o sítio (encaixa
// nas paredes das outras), roda-se de 90 em 90°, toca-se para a destacar e «Ver só esta» isola-a (no 3D, com os modelos dos produtos).
// O lugar de cada área fica no negócio (f.casa_layout, casaLayout.ts).
import { lazy, Suspense, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as PE } from "react";
import { Box, Eye, Map as MapaIcon, RotateCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Negocio } from "../motor";
import type { Ctx } from "../pecas";
import { PECAS, lerPlanta, type Planta } from "../planta";
import { divisoesDoNegocio, fDaDivisao, type DivisaoNegocio } from "../divisoesNegocio";
import { projetoDoNegocio } from "@/pages/prototipo-estudio/daVisita";
import { produto } from "@/pages/prototipo-estudio/catalogoFake";
import type { Projeto } from "@/pages/prototipo-estudio/necessidadesEstudio";
import { espacoDoEstudio } from "@/pages/prototipo-estudio/estudioNo3D";
import { Visualizador3DSeguro } from "../planta3d/Visualizador3DSeguro";
import { temWebGL } from "../planta3d/carregarVisualizador3D";
import { PlantaVista } from "@/pages/prototipo-estudio/PlantaVista";
import { areaTotal, arrumarCasa, caixaDe, encaixar, gravarLayout, lerLayout, limitesCasa, rodarMais, type AreaNaCasa, type LayoutCasa } from "./casaLayout";
import type { Area3D } from "./CasaToda3D";

const CasaToda3D = lazy(() => import("./CasaToda3D"));
const nf = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 1 });
const peDireitoM = (v: string | undefined) => { const m = (v ?? "").replace(",", ".").match(/(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : 2.5; };

export interface AreaDaCasa { div: DivisaoNegocio; projeto: Projeto | null; hoje: Planta | null; depois: Planta | null; peDireito: number }

/** As áreas do negócio com o que cada uma tem: o projeto do Estúdio, a planta de hoje (a corrigida no local, a da visita ou a do Estúdio)
 *  e a de como vai ficar (a do Estúdio; sem ele, a de hoje). */
export function areasDaCasa(d: Pick<Negocio, "f" | "linha">): AreaDaCasa[] {
  return divisoesDoNegocio(d.f, d.linha).map((div) => {
    const fx = fDaDivisao(d.f, div), projeto = projetoDoNegocio(fx);
    const hoje = lerPlanta(fx.retif_planta) ?? lerPlanta(fx.planta) ?? (projeto?.antes.paredes.length ? projeto.antes : null);
    const depois = projeto?.depois.paredes.length ? projeto.depois : hoje;
    return { div, projeto, hoje, depois, peDireito: projeto ? projeto.alturas.peDireito / 100 : peDireitoM(fx.diag_pe_direito_m) };
  });
}

const OPCAO = (on: boolean) => cn("inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors", on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground");

export function CasaToda({ ctx, d, abrirArea, soVer: soVerDado = false }: { ctx?: Ctx; d: Negocio; abrirArea?: (div: DivisaoNegocio) => void; soVer?: boolean }) {
  const soVer = soVerDado || !ctx;
  const areas = useMemo(() => areasDaCasa(d), [d]);
  const [qual, setQual] = useState<"hoje" | "depois">(() => (areas.some((a) => a.projeto) ? "depois" : "hoje"));
  const [modo, setModo] = useState<"2d" | "3d">("2d");
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [isolar, setIsolar] = useState(false);
  const L = useMemo(() => lerLayout(d.f.casa_layout), [d.f.casa_layout]);
  const [mexer, setMexer] = useState<{ chave: string; x: number; y: number } | null>(null);
  const casa = useMemo(() => arrumarCasa(areas.map((a) => ({ nome: a.div.nome, planta: qual === "hoje" ? a.hoje : a.depois })), L), [areas, L, qual]);
  const comMexer = mexer ? casa.map((a) => (a.chave === mexer.chave ? { ...a, lugar: { ...a.lugar, x: mexer.x, y: mexer.y } } : a)) : casa;
  const daArea = (k: string | null) => (k ? areas[casa.findIndex((a) => a.chave === k)] : undefined);
  const sel = comMexer.find((a) => a.chave === escolhida) ?? null, selA = daArea(escolhida);
  const total = areaTotal(casa);

  const gravar = (novo: LayoutCasa) => { if (!soVer && ctx) ctx.run(() => ctx.A.campo(d.id, "casa_layout", gravarLayout(novo))); };
  /** Grava o lugar de todas (a primeira vez que se mexe, as que entraram sozinhas ficam onde estão). */
  const comTodas = (mudar: (l: LayoutCasa) => void) => {
    const novo: LayoutCasa = {};
    for (const a of casa) novo[a.chave] = { ...a.lugar };
    mudar(novo);
    gravar(novo);
  };
  const largar = (chave: string, x: number, y: number) => {
    const a = casa.find((z) => z.chave === chave);
    if (!a) return;
    const outras = casa.filter((z) => z.chave !== chave).map(caixaDe);
    const e = encaixar({ x, y, w: a.forma.w, h: a.forma.h }, outras);
    comTodas((l) => { l[chave] = { ...l[chave], x: e.x, y: e.y }; });
  };
  const rodar = (chave: string) => comTodas((l) => { l[chave] = { ...l[chave], r: rodarMais(l[chave].r) }; if (!l[chave].r) delete l[chave].r; });

  // ------------------------------------------------------------------ arrastar (o SVG em cm; a vista fica fixa enquanto se arrasta)
  const svg = useRef<SVGSVGElement>(null);
  const inicio = useRef<{ chave: string; px: number; py: number; x: number; y: number; moveu: boolean } | null>(null);
  const vb0 = limitesCasa(isolar && sel ? [sel] : casa);
  const margem = Math.max(vb0.w, vb0.h) * 0.08 + 40;
  const vbFixo = useRef(vb0);
  if (!mexer) vbFixo.current = vb0;
  const vb = vbFixo.current;
  const noSvg = (e: PE) => {
    const s = svg.current, m = s?.getScreenCTM();
    if (!s || !m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const pegar = (e: PE, a: AreaNaCasa) => {
    if (soVer || isolar) { setEscolhida(a.chave); return; }
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const q = noSvg(e);
    inicio.current = { chave: a.chave, px: q.x, py: q.y, x: a.lugar.x, y: a.lugar.y, moveu: false };
  };
  const mover = (e: PE) => {
    const i = inicio.current;
    if (!i) return;
    const q = noSvg(e), dx = q.x - i.px, dy = q.y - i.py;
    if (!i.moveu && Math.hypot(dx, dy) < Math.max(vb.w, vb.h) / 80) return;
    i.moveu = true;
    setMexer({ chave: i.chave, x: Math.round(i.x + dx), y: Math.round(i.y + dy) });
  };
  const soltar = () => {
    const i = inicio.current;
    inicio.current = null;
    if (!i) return;
    if (!i.moveu) { setEscolhida((k) => (k === i.chave ? null : i.chave)); return; }
    if (mexer) largar(mexer.chave, mexer.x, mexer.y);
    setMexer(null);
    setEscolhida(i.chave);
  };
  const teclas = (e: KeyboardEvent, a: AreaNaCasa) => {
    const passo = e.shiftKey ? 50 : 10;
    const mv: Record<string, [number, number]> = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] };
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEscolhida((k) => (k === a.chave ? null : a.chave)); return; }
    if (soVer) return;
    if (mv[e.key]) { e.preventDefault(); const [dx, dy] = mv[e.key]; comTodas((l) => { l[a.chave] = { ...l[a.chave], x: a.lugar.x + dx, y: a.lugar.y + dy }; }); }
    else if (e.key === "r" || e.key === "R") { e.preventDefault(); rodar(a.chave); }
  };
  const letra = Math.max(vb.w, vb.h) / 34 + 6;

  // ------------------------------------------------------------------ o 3D
  const areas3d: Area3D[] = casa.map((a, i) => {
    const A = areas[i], p = A.projeto;
    return { ...a, peDireito: A.peDireito, cor: (id) => (qual === "depois" && p ? produto(p.escolhas[id])?.hex : undefined) };
  });
  const isolada3d = modo === "3d" && isolar && selA?.projeto && temWebGL() ? espacoDoEstudio(selA.projeto, qual === "hoje" ? "antes" : "depois") : null;

  if (areas.length < 2) return null;
  const semPlanta = areas.filter((a) => !(qual === "hoje" ? a.hoje : a.depois)).map((a) => a.div.nome);
  return (
    <section aria-labelledby={`casa-${d.id}`} className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`casa-${d.id}`} className="text-[17px] font-semibold tracking-tight">A casa toda</h3>
          <p className="text-sm text-muted-foreground">
            {areas.length} áreas{total !== null ? `, ${nf(total)} m² de chão` : ""}. {soVer ? "Toque numa área para a destacar." : "Arraste cada área para o seu sítio; encaixa nas paredes das outras. Toque para a destacar."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div role="group" aria-label="O que ver" className="inline-flex rounded-full bg-muted p-1">
            <button type="button" aria-pressed={qual === "hoje"} onClick={() => setQual("hoje")} className={OPCAO(qual === "hoje")}>Hoje</button>
            <button type="button" aria-pressed={qual === "depois"} onClick={() => setQual("depois")} className={OPCAO(qual === "depois")}>Como vai ficar</button>
          </div>
          <div role="group" aria-label="A vista" className="inline-flex rounded-full bg-muted p-1">
            <button type="button" aria-pressed={modo === "2d"} onClick={() => setModo("2d")} className={OPCAO(modo === "2d")}><MapaIcon className="h-4 w-4" aria-hidden="true" />Planta</button>
            <button type="button" aria-pressed={modo === "3d"} onClick={() => setModo("3d")} className={OPCAO(modo === "3d")}><Box className="h-4 w-4" aria-hidden="true" />3D</button>
          </div>
        </div>
      </div>

      {modo === "2d" ? (
        <svg ref={svg} viewBox={`${vb.x - margem} ${vb.y - margem} ${vb.w + 2 * margem} ${vb.h + 2 * margem}`} role="group" aria-label="A planta da casa toda"
          className="block h-[56vh] min-h-[320px] w-full touch-none select-none rounded-xl border border-border bg-muted/30" onPointerMove={mover} onPointerUp={soltar} onPointerCancel={() => { inicio.current = null; setMexer(null); }}>
          <defs>
            <pattern id={`grelha-${d.id}`} width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" className="stroke-border" strokeWidth={1} /></pattern>
          </defs>
          <rect x={vb.x - margem * 4} y={vb.y - margem * 4} width={vb.w + margem * 8} height={vb.h + margem * 8} fill={`url(#grelha-${d.id})`} onPointerDown={() => !isolar && setEscolhida(null)} />
          {(isolar && sel ? [sel] : comMexer).map((a, i) => {
            const on = a.chave === escolhida, apagada = !!escolhida && !on, A = areas[casa.findIndex((z) => z.chave === a.chave)] ?? areas[i];
            const p = A?.projeto, cor = (id: string) => (qual === "depois" && p ? produto(p.escolhas[id])?.hex : undefined);
            const pts = a.forma.pts.map((q) => `${q.x + a.lugar.x},${q.y + a.lugar.y}`).join(" ");
            const semDesenho = !(qual === "hoje" ? A?.hoje : A?.depois);
            return (
              <g key={a.chave} role="button" tabIndex={0} aria-pressed={on} aria-label={`${a.nome}${a.m2 !== null ? `, ${nf(a.m2)} m²` : ""}${soVer ? "" : ". Setas para mover, R para rodar."}`}
                onPointerDown={(e) => pegar(e, a)} onKeyDown={(e) => teclas(e, a)}
                className={cn("outline-none transition-opacity focus-visible:[&>polygon]:stroke-ring", !soVer && !isolar && "cursor-grab active:cursor-grabbing")} opacity={apagada ? 0.35 : 1}>
                {a.forma.fecha || semDesenho
                  ? <polygon points={pts} className={cn(on ? "fill-primary/15 stroke-primary" : "fill-card stroke-foreground", semDesenho && "stroke-dashed")} strokeWidth={on ? letra / 4 : letra / 6} strokeDasharray={semDesenho ? `${letra / 2} ${letra / 3}` : undefined} strokeLinejoin="round" />
                  : <polyline points={pts} fill="none" className={on ? "stroke-primary" : "stroke-foreground"} strokeWidth={letra / 5} strokeLinejoin="round" strokeLinecap="round" />}
                {a.forma.pecas.map((pc) => {
                  const c = cor(pc.id), ang = (pc.rot ?? 0) + (a.lugar.r ?? 0), x = pc.cx + a.lugar.x, y = pc.cy + a.lugar.y;
                  return (
                    <rect key={pc.id} x={x - pc.w / 2} y={y - pc.h / 2} width={pc.w} height={pc.h} rx={Math.min(pc.w, pc.h) / 8} transform={ang ? `rotate(${ang} ${x} ${y})` : undefined}
                      className={c ? "stroke-foreground/50" : PECAS[pc.tipo]?.abertura ? "fill-amber-200 stroke-amber-700" : "fill-primary/15 stroke-primary/70"} style={c ? { fill: c } : undefined} strokeWidth={letra / 14} />
                  );
                })}
                <text x={a.lugar.x + a.forma.w / 2} y={a.lugar.y + a.forma.h / 2} textAnchor="middle" fontSize={letra} className="pointer-events-none fill-foreground font-semibold"
                  style={{ paintOrder: "stroke", stroke: "hsl(var(--card))", strokeWidth: letra / 4 }}>{a.nome}</text>
                <text x={a.lugar.x + a.forma.w / 2} y={a.lugar.y + a.forma.h / 2 + letra * 1.15} textAnchor="middle" fontSize={letra * 0.75} className="pointer-events-none fill-muted-foreground"
                  style={{ paintOrder: "stroke", stroke: "hsl(var(--card))", strokeWidth: letra / 4 }}>{semDesenho ? "por desenhar" : a.m2 !== null ? `${nf(a.m2)} m²` : "a planta não fecha"}</text>
              </g>
            );
          })}
        </svg>
      ) : isolada3d && isolada3d.ok ? (
        <div className="h-[56vh] min-h-[320px] overflow-hidden rounded-xl border border-border">
          <Visualizador3DSeguro alternativa={<PlantaVista planta={(qual === "hoje" ? selA!.hoje : selA!.depois) ?? selA!.projeto!.depois} titulo={selA!.div.nome} />} refazer={`${escolhida}|${qual}`}
            espaco={isolada3d.espaco} modelos={isolada3d.modelos} vista="3d" teto={false} etiquetas={false} descricao={`A ${selA!.div.nome.toLowerCase()} em 3D`} selecionada={null} onSelecionar={() => {}} />
        </div>
      ) : temWebGL() ? (
        <div className="h-[56vh] min-h-[320px] overflow-hidden rounded-xl border border-border">
          <Suspense fallback={<p role="status" className="grid h-full place-items-center text-[15px] text-muted-foreground">A abrir o 3D…</p>}>
            <CasaToda3D areas={areas3d} escolhida={escolhida} isolar={isolar} escolher={(k) => setEscolhida(k || null)} descricao={`A casa toda em 3D: ${casa.map((a) => a.nome).join(", ")}`} />
          </Suspense>
        </div>
      ) : <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Este aparelho não mostra 3D. Use a planta.</p>}

      {semPlanta.length > 0 && <p className="text-sm text-muted-foreground">Por desenhar: {semPlanta.join(", ")}. Desenhe-as no Estúdio de cada área.</p>}

      {/* a área destacada: o que tem e o que se faz com ela */}
      {sel && selA ? (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-[15px]"><b className="font-semibold">{sel.nome}</b>
            <span className="text-muted-foreground">{sel.m2 !== null ? ` · ${nf(sel.m2)} m² de chão` : ""}{selA.projeto ? ` · ${selA.projeto.depois.pecas.length} peças no Estúdio` : " · ainda sem Estúdio"}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={isolar ? "default" : "outline"} className="min-h-11" aria-pressed={isolar} onClick={() => setIsolar((x) => !x)}>
              <Eye className="mr-1.5 h-4 w-4" aria-hidden="true" />{isolar ? "Ver a casa toda" : "Ver só esta"}
            </Button>
            {!soVer && !isolar && modo === "2d" && <Button type="button" variant="outline" className="min-h-11" onClick={() => rodar(sel.chave)}><RotateCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Rodar</Button>}
            {abrirArea && <Button type="button" variant="outline" className="min-h-11" onClick={() => abrirArea(selA.div)}><Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />Estúdio da {sel.nome.toLowerCase()}</Button>}
            <button type="button" onClick={() => { setEscolhida(null); setIsolar(false); }} aria-label="Tirar o destaque" className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-muted"><X className="h-4 w-4" aria-hidden="true" /></button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Destacar uma área">
          {casa.map((a) => (
            <button key={a.chave} type="button" onClick={() => setEscolhida(a.chave)} className="inline-flex min-h-9 items-center rounded-full border border-border bg-background px-3 text-sm font-medium hover:border-primary/50">{a.nome}</button>
          ))}
        </div>
      )}
    </section>
  );
}
