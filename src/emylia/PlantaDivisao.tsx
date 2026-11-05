// 5/11 (Rúben, a visita real: «reconstruir tudo o que está em papel, a planta da área»; depois: «o desenho deve ser simples: desenhar no
// ecrã as retas com as medidas em overlay e depois drag and drop das coisas»). O croqui da folha, no ecrã:
//  1. arrasta-se o dedo para desenhar cada parede: sai reta (horizontal ou vertical), de 5 em 5 cm, com o comprimento por cima; a seguinte
//     continua de onde a anterior acabou, e perto do canto de partida fecha a planta;
//  2. tocar no número de uma parede deixa escrever a medida certa;
//  3. as peças (base, sanita, banheira…) arrastam-se da barra para a planta, e dentro dela para o sítio.
// Os m² do chão e das paredes vão para as medidas com um toque. A planta grava-se no negócio (f.planta, JSON). A geometria está em planta.ts.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import { Box } from "lucide-react";
import { useCatalogo } from "./v2/catalogoStore";
import { BarraProdutos } from "./planta3d/BarraProdutos";
import { Planta3DPainel } from "./planta3d/Planta3DPainel";
import { produtosParaEspaco, type ProdutoModelo3D } from "./planta3d/catalogo3d";
import { pecaDeProduto } from "./planta3d/ligacao";
import { useProto3d } from "./planta3d/usarProto3d";
import { Check, RotateCw, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { porMedida, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import {
  PASSO, PECAS, PLANTA_VAZIA, areaChaoM2, areaParedesM2, cantos, emL, faltaFechar, gravarPlanta, juntarParede, juntarPeca, lerPlanta, limites,
  mudarComprimento, paredeDoTraco, peDireitoDoCampo, retangulo, type PecaPlanta, type Planta, type Ponto, type TipoPeca,
} from "./planta";

const INP = "h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
const CHIP = "inline-flex min-h-11 touch-none select-none items-center gap-1.5 rounded-full border border-input bg-background px-4 py-2 text-[15px] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const PE_DIREITO_SEM_RESPOSTA = 2.5;
/** A tela sem nada desenhado: 5 m por 4 m. */
const TELA = { x: 0, y: 0, w: 500, h: 400 };
const nf = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 2 });
const arred = (n: number) => Math.round(n / PASSO) * PASSO;

/** O que se vê: a tela de sempre, alargada ao que está desenhado (com margem). Só muda quando se grava, nunca a meio de um traço. */
function vistaDe(p: Planta) {
  if (!p.paredes.length && !p.pecas.length) return TELA;
  const b = limites(p), m = 60;
  const x = Math.min(TELA.x, b.x - m), y = Math.min(TELA.y, b.y - m);
  return { x, y, w: Math.max(TELA.x + TELA.w, b.x + b.w + m) - x, h: Math.max(TELA.y + TELA.h, b.y + b.h + m) - y };
}

export function PlantaDivisao({ ctx, d, divisao }: { ctx: Ctx; d: Negocio; divisao?: string }) {
  const id = useId();
  const [p, setP] = useState<Planta>(() => lerPlanta(d.f.planta) ?? PLANTA_VAZIA);
  const [vista, setVista] = useState(() => vistaDe(p));
  const [sel, setSel] = useState<string | null>(null);
  const [paredeSel, setParedeSel] = useState<number | null>(null);
  const [traco, setTraco] = useState<{ de: Ponto; ate: Ponto } | null>(null);
  const [nova, setNova] = useState<{ tipo: TipoPeca; x: number; y: number; produto?: ProdutoModelo3D } | null>(null);
  // protótipo do visualizador 3D: as peças vêm dos produtos do catálogo; o 3D abre por baixo da planta
  const K = useCatalogo();
  const proto = useProto3d(d.id, divisao);
  const produtosCat = useMemo(() => produtosParaEspaco(K.produtos, K.arvore, proto.pref.tipo, { max: 400 }), [K, proto.pref.tipo]);
  const [ver3d, setVer3d] = useState(false);
  const [genericas, setGenericas] = useState(false);
  const [feito, setFeito] = useState("");
  const svg = useRef<SVGSVGElement>(null);
  const arrasto = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const contador = useRef(p.pecas.length);

  // a planta gravada por fora (ex.: «Usar esta planta» da folha) entra no desenho
  useEffect(() => {
    if (!d.f.planta || d.f.planta === gravarPlanta(p)) return;
    const lida = lerPlanta(d.f.planta);
    if (lida) { setP(lida); setVista(vistaDe(lida)); setSel(null); setParedeSel(null); contador.current = lida.pecas.length; }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando o que está gravado muda
  }, [d.f.planta]);

  const gravar = (np: Planta) => { setP(np); setVista(vistaDe(np)); setFeito(""); ctx.A.campo(d.id, "planta", gravarPlanta(np)); };
  const mudarPeca = (pid: string, parcial: Partial<PecaPlanta>, guardar = true) => {
    const np = { ...p, pecas: p.pecas.map((x) => (x.id === pid ? { ...x, ...parcial } : x)) };
    if (guardar) gravar(np); else setP(np);
  };

  const pts = cantos(p.paredes, p.o);
  const fim = pts[pts.length - 1];
  const falta = faltaFechar(p.paredes);
  const fechada = falta <= 1;
  const chao = areaChaoM2(p.paredes);
  const peCampo = peDireitoDoCampo(d.f.diag_pe_direito_m);
  const pe = peCampo ?? PE_DIREITO_SEM_RESPOSTA;
  const paredes = areaParedesM2(p, pe);
  const letra = Math.max(vista.w, vista.h) / 28;
  const selecionada = p.pecas.find((x) => x.id === sel) ?? null;
  const preve = traco ? paredeDoTraco(traco.de, traco.ate, p.paredes.length >= 2 ? p.o : undefined) : null;

  /** Do ecrã para cm na planta. */
  const naPlanta = (cx: number, cy: number): Ponto | null => {
    const m = svg.current?.getScreenCTM();
    if (!svg.current || !m) return null;
    const pt = svg.current.createSVGPoint(); pt.x = cx; pt.y = cy;
    const r = pt.matrixTransform(m.inverse());
    return { x: r.x, y: r.y };
  };

  // ---- desenhar as paredes (só enquanto a planta não fecha) ----
  const tocarTela = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.target !== svg.current && !(e.target as Element).hasAttribute?.("data-tela")) return;
    setSel(null); setParedeSel(null);
    if (fechada) return;
    const q = naPlanta(e.clientX, e.clientY); if (!q) return;
    svg.current?.setPointerCapture?.(e.pointerId);
    const de = p.paredes.length ? fim : { x: arred(q.x), y: arred(q.y) };
    if (!p.paredes.length) setP({ ...p, o: de });
    setTraco({ de, ate: q });
  };
  const moverNaTela = (e: RPointerEvent<SVGSVGElement>) => {
    if (traco) { const q = naPlanta(e.clientX, e.clientY); if (q) setTraco({ ...traco, ate: q }); return; }
    const a = arrasto.current, q = a && naPlanta(e.clientX, e.clientY);
    if (a && q) mudarPeca(a.id, { x: arred(q.x - a.dx), y: arred(q.y - a.dy) }, false);
  };
  const largarNaTela = () => {
    if (traco) {
      const parede = paredeDoTraco(traco.de, traco.ate, p.paredes.length >= 2 ? p.o : undefined);
      setTraco(null);
      if (parede) gravar({ ...p, paredes: juntarParede(p.paredes, parede) });
      return;
    }
    if (arrasto.current) { arrasto.current = null; gravar(p); }
  };

  // ---- as peças dentro da planta ----
  const pegarPeca = (e: RPointerEvent, pc: PecaPlanta) => {
    e.stopPropagation();
    const q = naPlanta(e.clientX, e.clientY); if (!q) return;
    svg.current?.setPointerCapture?.(e.pointerId);
    arrasto.current = { id: pc.id, dx: q.x - pc.x, dy: q.y - pc.y };
    setSel(pc.id); setParedeSel(null);
  };
  const teclas = (e: KeyboardEvent, pc: PecaPlanta) => {
    const passo = e.shiftKey ? 25 : PASSO;
    const mov: Record<string, [number, number]> = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] };
    const m = mov[e.key]; if (!m) return;
    e.preventDefault();
    mudarPeca(pc.id, { x: pc.x + m[0], y: pc.y + m[1] });
  };

  // ---- as peças novas: arrastar da barra para a planta (ou tocar, e fica ao meio) ----
  const juntarAoMeio = (t: TipoPeca) => { const nid = `pc${++contador.current}`; gravar(juntarPeca(p, t, nid)); setSel(nid); };
  const pegarNova = (e: RPointerEvent<HTMLButtonElement>, tipo: TipoPeca, produto?: ProdutoModelo3D) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setNova({ tipo, x: e.clientX, y: e.clientY, produto });
  };
  const juntarProdutoAoMeio = (m: ProdutoModelo3D) => { const nid = `pc${++contador.current}`; gravar({ ...p, pecas: [...p.pecas, pecaDeProduto(p, m, nid)] }); setSel(nid); };
  const moverNova = (e: RPointerEvent<HTMLButtonElement>) => { if (nova) setNova({ ...nova, x: e.clientX, y: e.clientY }); };
  const largarNova = (e: RPointerEvent<HTMLButtonElement>) => {
    if (!nova) return;
    const r = svg.current?.getBoundingClientRect();
    const dentro = !!r && r.width > 0 && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    const nid = `pc${++contador.current}`;
    const centro = dentro ? naPlanta(e.clientX, e.clientY) ?? undefined : undefined;
    gravar(nova.produto ? { ...p, pecas: [...p.pecas, pecaDeProduto(p, nova.produto, nid, centro)] } : juntarPeca(p, nova.tipo, nid, centro));
    setSel(nid); setNova(null);
  };

  const usarNasMedidas = () => {
    if (chao === null) return;
    ctx.run(() => {
      porMedida(d.visita.med, "pav", chao);
      if (paredes !== null) porMedida(d.visita.med, "par", paredes);
    });
    setFeito(`Nas medidas: chão ${nf(chao)} m²${paredes !== null ? ` e paredes ${nf(paredes)} m²` : ""}.`);
  };

  /** A etiqueta de uma parede: ao lado da reta, a meio (desenhando como na folha, no sentido dos ponteiros do relógio, fica por fora). */
  const etiqueta = (a: Ponto, z: Ponto) => {
    const horiz = a.y === z.y, sinal = horiz ? Math.sign(z.x - a.x) || 1 : Math.sign(z.y - a.y) || 1;
    return horiz ? { x: (a.x + z.x) / 2, y: a.y - sinal * letra * 1.1 } : { x: a.x + sinal * letra * 2.4, y: (a.y + z.y) / 2 };
  };

  return (
    <div className="space-y-4">
      <p className="text-[15px] text-muted-foreground">
        {!p.paredes.length ? `Arraste o dedo para desenhar as paredes${divisao ? ` da ${divisao.toLowerCase()}` : ""}, uma a uma, como na folha.`
          : fechada ? "A planta fecha. Arraste as peças da barra para a planta, e toque num número para escrever a medida certa."
          : "Continue a desenhar a partir do ponto. Toque num número para escrever a medida certa."}
      </p>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <svg ref={svg} viewBox={`${vista.x} ${vista.y} ${vista.w} ${vista.h}`} className="block h-auto max-h-[65vh] w-full touch-none select-none"
          role="img" aria-label={`Planta: ${p.paredes.map((x) => `${x.c} cm`).join(", ") || "por desenhar"}${chao !== null ? `; chão ${nf(chao)} m²` : ""}`}
          onPointerDown={tocarTela} onPointerMove={moverNaTela} onPointerUp={largarNaTela} onPointerCancel={largarNaTela}>
          <defs>
            <pattern id={`${id}-grelha`} width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" className="stroke-border" strokeWidth="0.4" />
            </pattern>
            <pattern id={`${id}-metro`} width="100" height="100" patternUnits="userSpaceOnUse">
              <rect width="100" height="100" fill={`url(#${id}-grelha)`} />
              <path d="M 100 0 L 0 0 0 100" fill="none" className="stroke-muted-foreground/40" strokeWidth="0.8" />
            </pattern>
          </defs>
          <rect data-tela="" x={vista.x - 1000} y={vista.y - 1000} width={vista.w + 2000} height={vista.h + 2000} fill={`url(#${id}-metro)`} />

          {/* as paredes */}
          {p.paredes.length > 0 && (fechada
            ? <polygon points={pts.slice(0, -1).map((q) => `${q.x},${q.y}`).join(" ")} className="pointer-events-none fill-primary/[0.06] stroke-foreground" strokeWidth={letra / 3.5} strokeLinejoin="round" />
            : <polyline points={pts.map((q) => `${q.x},${q.y}`).join(" ")} fill="none" className="pointer-events-none stroke-foreground" strokeWidth={letra / 3.5} strokeLinejoin="round" strokeLinecap="round" />)}
          {/* o traço a desenhar, com a medida junto ao dedo */}
          {traco && preve && (() => {
            const z = cantos([preve], traco.de)[1];
            return (
              <g className="pointer-events-none">
                <line x1={traco.de.x} y1={traco.de.y} x2={z.x} y2={z.y} className="stroke-primary" strokeWidth={letra / 3} strokeLinecap="round" />
                <rect x={traco.ate.x + letra * 0.6} y={traco.ate.y - letra * 2} width={letra * 4.6} height={letra * 1.5} rx={letra * 0.4} className="fill-primary" />
                <text x={traco.ate.x + letra * 2.9} y={traco.ate.y - letra * 0.9} textAnchor="middle" fontSize={letra} className="fill-primary-foreground font-semibold">{preve.c} cm</text>
              </g>
            );
          })()}
          {/* onde continuar, e o canto de partida */}
          {!fechada && p.paredes.length > 0 && !traco && <circle cx={fim.x} cy={fim.y} r={letra * 0.6} className="pointer-events-none fill-primary" />}
          {!fechada && p.paredes.length > 1 && <circle cx={p.o.x} cy={p.o.y} r={letra * 0.45} className="pointer-events-none fill-none stroke-primary" strokeWidth={letra / 6} strokeDasharray={`${letra / 4} ${letra / 4}`} />}

          {/* as medidas por cima de cada parede: tocar para escrever a certa */}
          {p.paredes.map((w, i) => {
            const e = etiqueta(pts[i], pts[i + 1]);
            const ativa = paredeSel === i;
            return (
              <g key={i} role="button" tabIndex={0} aria-label={`Parede ${i + 1}: ${w.c} cm. Escrever a medida.`} className="cursor-pointer outline-none"
                onPointerDown={(ev) => { ev.stopPropagation(); setParedeSel(i); setSel(null); }}
                onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setParedeSel(i); } }}>
                <rect x={e.x - letra * 2.1} y={e.y - letra * 0.8} width={letra * 4.2} height={letra * 1.5} rx={letra * 0.4}
                  className={ativa ? "fill-primary" : "fill-card stroke-border"} strokeWidth={letra / 12} />
                <text x={e.x} y={e.y + letra * 0.3} textAnchor="middle" fontSize={letra * 0.95} className={cn("font-semibold", ativa ? "fill-primary-foreground" : "fill-foreground")}>{w.c}</text>
              </g>
            );
          })}

          {/* as peças: arrastar com o dedo; com o teclado, as setas */}
          {p.pecas.map((pc) => (
            <g key={pc.id} role="button" tabIndex={0} aria-label={`${PECAS[pc.tipo].n}, ${pc.w} por ${pc.h} cm. Setas para mover.`} aria-pressed={sel === pc.id}
              onPointerDown={(e) => pegarPeca(e, pc)} onKeyDown={(e) => teclas(e, pc)} onFocus={() => setSel(pc.id)} className="cursor-grab outline-none">
              <rect x={pc.x} y={pc.y} width={pc.w} height={pc.h} rx={Math.min(pc.w, pc.h) / 8}
                className={PECAS[pc.tipo].abertura ? "fill-amber-200 stroke-amber-700" : "fill-primary/15 stroke-primary"}
                strokeWidth={sel === pc.id ? letra / 4 : letra / 10} />
              <text x={pc.x + pc.w / 2} y={pc.y + pc.h / 2 + letra / 3} textAnchor="middle" fontSize={letra * 0.7} className="pointer-events-none fill-foreground">{PECAS[pc.tipo].n}</text>
            </g>
          ))}

          {!p.paredes.length && !traco && (
            <text x={vista.x + vista.w / 2} y={vista.y + vista.h / 2} textAnchor="middle" fontSize={letra} className="pointer-events-none fill-muted-foreground">
              Arraste o dedo para desenhar a primeira parede
            </text>
          )}
        </svg>
      </div>
      {/* a peça a ser arrastada da barra, debaixo do dedo */}
      {nova && (
        <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-primary bg-primary/15 px-3 py-2 text-sm font-medium shadow-lg"
          style={{ left: nova.x, top: nova.y }}>{nova.produto?.nome ?? PECAS[nova.tipo].n}</div>
      )}

      <p role="status" className={cn("text-[15px]", !p.paredes.length ? "text-muted-foreground" : fechada ? "text-success" : "text-foreground")}>
        {!p.paredes.length ? "Ainda sem paredes." : fechada ? "A planta fecha."
          : falta === Infinity ? `${p.paredes.length} ${p.paredes.length === 1 ? "parede" : "paredes"}.` : `Faltam ${falta} cm até ao canto de partida.`}
      </p>

      {/* a medida certa da parede tocada */}
      {paredeSel !== null && p.paredes[paredeSel] && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-3">
          <label className="grid w-40 gap-1 text-sm font-medium" htmlFor={`${id}-medida`}>Parede {paredeSel + 1}, em cm
            <input id={`${id}-medida`} key={`${paredeSel}-${p.paredes[paredeSel].c}`} type="number" inputMode="numeric" min={0} autoFocus defaultValue={p.paredes[paredeSel].c} className={INP}
              onBlur={(e) => { const c = Math.round(Number(e.target.value) || 0); if (c > 0 && c !== p.paredes[paredeSel].c) gravar({ ...p, paredes: mudarComprimento(p.paredes, paredeSel, c) }); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
          </label>
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => setParedeSel(null)}>Feito</Button>
        </div>
      )}

      {/* as peças: arrastar para a planta, ou tocar */}
      <div className="space-y-2">
        <BarraProdutos produtos={produtosCat} espaco={proto.pref.tipo} onEspaco={proto.setTipo}
          onPegar={(e, m) => pegarNova(e, "movel", m)} onMover={moverNova} onLargar={largarNova} onCancelar={() => setNova(null)} onJuntar={juntarProdutoAoMeio} />
        <p className="text-sm text-muted-foreground">Portas e janelas (arraste para a planta, ou toque, e fica ao meio):</p>
        {produtosCat.length > 0 && (
          <button type="button" className="min-h-11 text-sm underline underline-offset-2" aria-expanded={genericas} onClick={() => setGenericas(!genericas)}>
            {genericas ? "Esconder" : "Mostrar"} as peças genéricas (sem produto do catálogo)
          </button>
        )}
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PECAS) as TipoPeca[]).filter((t) => PECAS[t].abertura || genericas || produtosCat.length === 0).map((t) => (
            <button key={t} type="button" className={CHIP} onPointerDown={(e) => pegarNova(e, t)} onPointerMove={moverNova} onPointerUp={largarNova}
              onPointerCancel={() => setNova(null)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); juntarAoMeio(t); } }}>
              {PECAS[t].n}
            </button>
          ))}
        </div>
      </div>

      {selecionada && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-muted/30 p-3">
          <p className="w-full text-[15px] font-medium">{PECAS[selecionada.tipo].n}</p>
          {(["w", "h"] as const).map((k) => (
            <label key={k} className="grid w-28 gap-1 text-sm font-medium">{k === "w" ? "Largura" : "Fundo"} (cm)
              <input key={`${selecionada.id}-${k}-${selecionada[k]}`} type="number" inputMode="numeric" min={1} defaultValue={selecionada[k]} className={INP}
                onBlur={(e) => { const n = Math.max(1, Math.round(Number(e.target.value) || 0)); if (n !== selecionada[k]) mudarPeca(selecionada.id, { [k]: n }); }} />
            </label>
          ))}
          <Button type="button" variant="outline" className="min-h-11" onClick={() => mudarPeca(selecionada.id, { w: selecionada.h, h: selecionada.w })}>
            <RotateCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Rodar
          </Button>
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => { gravar({ ...p, pecas: p.pecas.filter((x) => x.id !== selecionada.id) }); setSel(null); }}>
            <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Tirar
          </Button>
        </div>
      )}

      {/* desfazer, recomeçar, ou escrever as medidas à mão */}
      {p.paredes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={() => { gravar({ ...p, paredes: p.paredes.slice(0, -1) }); setParedeSel(null); }}>
            <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Desfazer a última parede
          </Button>
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => { gravar({ ...PLANTA_VAZIA, pecas: p.pecas }); setParedeSel(null); }}>Apagar as paredes</Button>
        </div>
      )}
      <details className="rounded-xl border border-border p-3">
        <summary className="min-h-11 cursor-pointer content-center text-[15px] font-medium">Escrever as medidas em vez de desenhar</summary>
        <div className="space-y-3 pt-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={CHIP} onClick={() => gravar({ ...p, o: { x: 0, y: 0 }, paredes: retangulo(p.paredes[0]?.c || 200, p.paredes[1]?.c || 150) })}>Retângulo</button>
            <button type="button" className={CHIP} onClick={() => { const a = p.paredes[0]?.c || 200, b = p.paredes[1]?.c || 150; gravar({ ...p, o: { x: 0, y: 0 }, paredes: emL(a, b, Math.round(a / 3), Math.round(b / 3)) }); }}>Em L</button>
          </div>
          {p.paredes.map((w, i) => (
            <div key={i} className="flex items-center gap-3 text-sm font-medium">
              <label htmlFor={`${id}-p${i}`} className="w-20">Parede {i + 1}</label>
              <input id={`${id}-p${i}`} key={`${i}-${w.c}`} type="number" inputMode="numeric" min={0} defaultValue={w.c} className={cn(INP, "w-32")}
                onBlur={(e) => { const c = Math.max(0, Math.round(Number(e.target.value) || 0)); if (c !== w.c) gravar({ ...p, paredes: mudarComprimento(p.paredes, i, c) }); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
              <span className="text-muted-foreground">cm</span>
            </div>
          ))}
        </div>
      </details>

      {/* o que a planta dá, e passá-lo às medidas */}
      <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[15px]">
          {chao === null ? "Feche a planta para ver os m²." : <>
            Chão <b>{nf(chao)} m²</b>{paredes !== null && <> · paredes <b>{nf(paredes)} m²</b></>}
            <span className="block text-sm text-muted-foreground">
              Paredes com {nf(pe)} m de pé-direito{peCampo === null ? " (o pé-direito ainda não foi respondido)" : ""}, sem as portas e as janelas da planta.
            </span>
          </>}
        </p>
        <Button type="button" className="min-h-11 shrink-0" disabled={chao === null} onClick={usarNasMedidas}>
          <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Usar nas medidas
        </Button>
      </div>
      <p role="status" className="min-h-5 text-sm text-success">{feito}</p>

      {/* protótipo: ver o que está desenhado em 3D */}
      <div className="space-y-3">
        <Button type="button" variant="outline" className="min-h-11" aria-expanded={ver3d} onClick={() => setVer3d(!ver3d)}>
          <Box className="mr-1.5 h-4 w-4" aria-hidden="true" />{ver3d ? "Fechar o 3D" : "Ver em 3D"}
        </Button>
        {ver3d && (
          <Planta3DPainel planta={p} tipo={proto.pref.tipo} nome={divisao ?? "Espaço"} peDireito={pe} produtos={K.produtos} arvore={K.arvore}
            rev={proto.pref.rev} onRev={proto.setRev} teto={proto.pref.teto} onTeto={proto.setTeto} />
        )}
      </div>
    </div>
  );
}
