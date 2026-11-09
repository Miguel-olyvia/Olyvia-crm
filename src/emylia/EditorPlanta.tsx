// 5/11 (Rúben): o desenho da planta, para a Visita (PlantaDivisao) e para o Estúdio (o antes e o depois). Simples, como pediram:
//  1. arrasta-se o dedo para desenhar cada parede: sai reta, de 5 em 5 cm, com o comprimento por cima; a seguinte continua de onde a
//     anterior acabou, e perto do canto de partida fecha a planta;
//  2. tocar no número de uma parede deixa escrever a medida certa;
//  3. as peças arrastam-se da barra para a planta, e dentro dela para o sítio.
// O Estúdio junta: paredes fixas (o depois tem as paredes do antes), as peças que saem a tracejado, a cor e o nome do produto escolhido
// em cada peça, e tocar numa peça para a trocar no catálogo. A geometria está em planta.ts.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { RotateCw, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PASSO, PECAS, PLANTA_VAZIA, cantos, emL, etiquetasSemSobrepor, faltaFechar, gravarPlanta, juntarParede, juntarPeca, limites, moverParede, mudarComprimentoFechada, paredeDoTraco,
  retangulo, tiposDaDivisao, type PecaPlanta, type Planta, type Ponto, type TipoPeca,
} from "./planta";

const INP = "h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
const CHIP = "inline-flex min-h-11 touch-none select-none items-center gap-1.5 rounded-full border border-input bg-background px-4 py-2 text-[15px] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
/** A tela sem nada desenhado: 5 m por 4 m. */
const TELA = { x: 0, y: 0, w: 500, h: 400 };
const arred = (n: number) => Math.round(n / PASSO) * PASSO;
/** 6/11: sem tipos dados, a barra tem as peças da divisão (a cozinha tem as dela), a porta e a janela. */
const tiposDeSempre = (divisao?: string): TipoPeca[] => [...tiposDaDivisao(divisao), "porta", "janela"];

/** O que se vê: a tela de sempre, alargada ao que está desenhado (com margem). Só muda quando se grava, nunca a meio de um traço. */
function vistaDe(p: Planta, fantasmas: readonly PecaPlanta[] = []) {
  const todas = { ...p, pecas: [...p.pecas, ...fantasmas] };
  if (!todas.paredes.length && !todas.pecas.length) return TELA;
  const b = limites(todas), m = 60;
  const x = Math.min(TELA.x, b.x - m), y = Math.min(TELA.y, b.y - m);
  return { x, y, w: Math.max(TELA.x + TELA.w, b.x + b.w + m) - x, h: Math.max(TELA.y + TELA.h, b.y + b.h + m) - y };
}

/** As peças encostadas à parede `i` (a menos de 3 cm dela, e ao lado dela): andam com a parede quando se arrasta. */
function coladasA(p: Planta, i: number): Set<string> {
  const pts = cantos(p.paredes, p.o), a = pts[i], z = pts[i + 1];
  const ENCOSTA = 3;
  const ids = p.pecas.filter((pc) => {
    if (a.x === z.x) { // vertical
      const y0 = Math.min(a.y, z.y), y1 = Math.max(a.y, z.y);
      const toca = Math.abs(pc.x - a.x) <= ENCOSTA || Math.abs(pc.x + pc.w - a.x) <= ENCOSTA;
      return toca && pc.y < y1 && pc.y + pc.h > y0;
    }
    const x0 = Math.min(a.x, z.x), x1 = Math.max(a.x, z.x);
    const toca = Math.abs(pc.y - a.y) <= ENCOSTA || Math.abs(pc.y + pc.h - a.y) <= ENCOSTA;
    return toca && pc.x < x1 && pc.x + pc.w > x0;
  }).map((pc) => pc.id);
  return new Set(ids);
}

/** Como uma peça aparece (o Estúdio pinta-a com a cor do produto e escreve o nome dele). */
export interface AparenciaPeca { cor?: string; rotulo?: string; destaque?: boolean }

export interface PropsEditor {
  planta: Planta;
  /** Cada mudança acabada (fim do traço, peça largada, medida escrita). */
  onMudar: (p: Planta) => void;
  divisao?: string;
  /** As paredes não se mexem (o depois do Estúdio tem as paredes do antes). */
  paredesFixas?: boolean;
  /** As peças que se podem juntar pela barra. */
  tipos?: readonly TipoPeca[];
  /** As peças do antes que saem: aparecem a tracejado, só para ver. */
  fantasmas?: readonly PecaPlanta[];
  aparencia?: (pc: PecaPlanta) => AparenciaPeca;
  /** Tocar numa peça (sem a arrastar): o Estúdio abre o catálogo dela. */
  aoTocarPeca?: (pc: PecaPlanta) => void;
  /** Uma peça acabada de juntar pela barra. */
  aoJuntarPeca?: (pc: PecaPlanta) => void;
  /** Por baixo da peça selecionada (ex.: «Trocar no catálogo»). */
  acoesDaPeca?: (pc: PecaPlanta) => ReactNode;
  textoBarra?: string;
  /** 5/11: os produtos escolhidos que ainda não estão na planta (o Estúdio): arrastam-se para o sítio. */
  bandeja?: readonly ItemBandeja[];
  aoColocar?: (id: string, centro?: Ponto) => void;
}
export interface ItemBandeja { id: string; tipo: TipoPeca; rotulo: string; cor?: string }

export function EditorPlanta({ planta, onMudar, divisao, paredesFixas = false, tipos: tiposDados, fantasmas = [], aparencia, aoTocarPeca, aoJuntarPeca, acoesDaPeca, textoBarra, bandeja = [], aoColocar }: PropsEditor) {
  const tipos = tiposDados ?? tiposDeSempre(divisao);
  const id = useId();
  const [p, setP] = useState<Planta>(planta);
  const [vista, setVista] = useState(() => vistaDe(planta, fantasmas));
  const [sel, setSel] = useState<string | null>(null);
  const [paredeSel, setParedeSel] = useState<number | null>(null);
  const [traco, setTraco] = useState<{ de: Ponto; ate: Ponto } | null>(null);
  const [nova, setNovaEstado] = useState<{ tipo: TipoPeca; x: number; y: number; bandeja?: string; rotulo?: string } | null>(null);
  // a peça a arrastar também numa ref: um largar logo a seguir ao pegar (antes de o ecrã se redesenhar) não a perde
  const novaRef = useRef<typeof nova>(null);
  const setNova = (n: typeof nova) => { novaRef.current = n; setNovaEstado(n); };
  // arrastar uma parede: de onde partiu e a planta como estava
  const arrastoParede = useRef<{ i: number; de: Ponto; base: Planta; mexeu: boolean; coladas: Set<string> } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  // 5/11 (Rúben: «ao clicar para mover a parede a página faz scroll para baixo»): a caixa da medida já não toma o foco sozinha ao tocar na
  // parede (o browser descia até ela); só com o teclado (Enter no número da parede) é que o foco vai para lá
  const caixaMedida = useRef<HTMLInputElement>(null);
  const arrasto = useRef<{ id: string; dx: number; dy: number; mexeu: boolean } | null>(null);
  const contador = useRef(Date.now() % 100000);

  // a planta mudada por fora (outra planta, a folha lida, o antes copiado) entra no desenho
  useEffect(() => {
    if (gravarPlanta(planta) === gravarPlanta(p)) return;
    setP(planta); setVista(vistaDe(planta, fantasmas)); setParedeSel(null);
    if (sel && !planta.pecas.some((x) => x.id === sel)) setSel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando a planta de fora muda
  }, [gravarPlanta(planta)]);

  const gravar = (np: Planta) => { setP(np); setVista(vistaDe(np, fantasmas)); onMudar(np); };
  const mudarPeca = (pid: string, parcial: Partial<PecaPlanta>, guardar = true) => {
    const np = { ...p, pecas: p.pecas.map((x) => (x.id === pid ? { ...x, ...parcial } : x)) };
    if (guardar) gravar(np); else setP(np);
  };

  const pts = cantos(p.paredes, p.o);
  const fim = pts[pts.length - 1];
  const falta = faltaFechar(p.paredes);
  const fechada = falta <= 1;
  const desenhar = !paredesFixas && !fechada;
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

  // ---- desenhar as paredes (só enquanto a planta não fecha, e se as paredes não estão fixas) ----
  const tocarTela = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.target !== svg.current && !(e.target as Element).hasAttribute?.("data-tela")) return;
    setSel(null); setParedeSel(null);
    if (!desenhar) return;
    const q = naPlanta(e.clientX, e.clientY); if (!q) return;
    svg.current?.setPointerCapture?.(e.pointerId);
    const de = p.paredes.length ? fim : { x: arred(q.x), y: arred(q.y) };
    if (!p.paredes.length) setP({ ...p, o: de });
    setTraco({ de, ate: q });
  };
  const moverNaTela = (e: RPointerEvent<SVGSVGElement>) => {
    if (traco) { const q = naPlanta(e.clientX, e.clientY); if (q) setTraco({ ...traco, ate: q }); return; }
    const ap = arrastoParede.current;
    if (ap) {
      const q = naPlanta(e.clientX, e.clientY); if (!q) return;
      const s = { x: arred(q.x - ap.de.x), y: arred(q.y - ap.de.y) };
      const r = moverParede(ap.base, ap.i, s);
      if (r) {
        // as peças encostadas a esta parede (o espelho, o móvel, a sanita) andam com ela
        const vertical = ap.base.paredes[ap.i].r === "N" || ap.base.paredes[ap.i].r === "S";
        const d = vertical ? { x: s.x, y: 0 } : { x: 0, y: s.y };
        ap.mexeu = true;
        setP({ ...ap.base, ...r, pecas: ap.base.pecas.map((x) => (ap.coladas.has(x.id) ? { ...x, x: x.x + d.x, y: x.y + d.y } : x)) });
      }
      return;
    }
    const a = arrasto.current, q = a && naPlanta(e.clientX, e.clientY);
    if (a && q) { a.mexeu = true; mudarPeca(a.id, { x: arred(q.x - a.dx), y: arred(q.y - a.dy) }, false); }
  };
  const largarNaTela = () => {
    const ap = arrastoParede.current;
    if (ap) { arrastoParede.current = null; if (ap.mexeu) gravar(p); return; }
    if (traco) {
      const parede = paredeDoTraco(traco.de, traco.ate, p.paredes.length >= 2 ? p.o : undefined);
      setTraco(null);
      if (parede) gravar({ ...p, paredes: juntarParede(p.paredes, parede) });
      return;
    }
    const a = arrasto.current;
    if (!a) return;
    arrasto.current = null;
    if (a.mexeu) gravar(p);
    else { const pc = p.pecas.find((x) => x.id === a.id); if (pc && aoTocarPeca) aoTocarPeca(pc); }
  };

  // ---- as peças dentro da planta ----
  const pegarPeca = (e: RPointerEvent, pc: PecaPlanta) => {
    e.stopPropagation();
    const q = naPlanta(e.clientX, e.clientY); if (!q) return;
    svg.current?.setPointerCapture?.(e.pointerId);
    arrasto.current = { id: pc.id, dx: q.x - pc.x, dy: q.y - pc.y, mexeu: false };
    setSel(pc.id); setParedeSel(null);
  };
  const teclas = (e: KeyboardEvent, pc: PecaPlanta) => {
    if ((e.key === "Enter" || e.key === " ") && aoTocarPeca) { e.preventDefault(); aoTocarPeca(pc); return; }
    const passo = e.shiftKey ? 25 : PASSO;
    const mov: Record<string, [number, number]> = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] };
    const m = mov[e.key]; if (!m) return;
    e.preventDefault();
    mudarPeca(pc.id, { x: pc.x + m[0], y: pc.y + m[1] });
  };

  // ---- as peças novas: arrastar da barra para a planta (ou tocar, e fica ao meio) ----
  const juntar = (t: TipoPeca, centro?: Ponto) => {
    const nid = `pc${++contador.current}`;
    const np = juntarPeca(p, t, nid, centro);
    gravar(np); setSel(nid);
    const pc = np.pecas.find((x) => x.id === nid);
    if (pc) aoJuntarPeca?.(pc);
  };
  // 5/11: pegar numa peça da barra (ou da bandeja) e largá-la na planta. O arrasto segue-se na janela inteira (não só no botão): o rato e o
  // dedo podem sair do botão, e o largar conta onde quer que aconteça. Largar fora da planta (ou só tocar) põe a peça ao meio.
  const pegarNova = (e: RPointerEvent<HTMLButtonElement>, item: { tipo: TipoPeca; bandeja?: string; rotulo?: string }) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setNova({ ...item, x: e.clientX, y: e.clientY });
  };
  const largarEm = (cx: number, cy: number) => {
    const n = novaRef.current;
    if (!n) return;
    setNova(null);
    const r = svg.current?.getBoundingClientRect();
    const dentro = !!r && r.width > 0 && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
    const centro = dentro ? naPlanta(cx, cy) ?? undefined : undefined;
    if (n.bandeja) aoColocar?.(n.bandeja, centro); else juntar(n.tipo, centro);
  };
  const largarEmRef = useRef(largarEm);
  largarEmRef.current = largarEm;
  const aArrastarNova = nova !== null;
  useEffect(() => {
    if (!aArrastarNova) return;
    const mover = (e: PointerEvent) => { const n = novaRef.current; if (n) setNova({ ...n, x: e.clientX, y: e.clientY }); };
    const largar = (e: PointerEvent) => largarEmRef.current(e.clientX, e.clientY);
    const cancelar = () => setNova(null);
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", largar);
    window.addEventListener("pointercancel", cancelar);
    return () => { window.removeEventListener("pointermove", mover); window.removeEventListener("pointerup", largar); window.removeEventListener("pointercancel", cancelar); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao começar e ao acabar o arrasto
  }, [aArrastarNova]);
  const pegarParede = (e: RPointerEvent, i: number) => {
    e.stopPropagation();
    e.preventDefault();
    setParedeSel(i); setSel(null);
    if (paredesFixas || !fechada) return;
    const q = naPlanta(e.clientX, e.clientY); if (!q) return;
    svg.current?.setPointerCapture?.(e.pointerId);
    arrastoParede.current = { i, de: q, base: p, mexeu: false, coladas: coladasA(p, i) };
  };
  const mudarMedida = (i: number, c: number) => { const r = mudarComprimentoFechada(p, i, c); if (r) gravar({ ...p, ...r }); };

  /** A etiqueta de uma parede: ao lado da reta, a meio (desenhando como na folha, no sentido dos ponteiros do relógio, fica por fora). */
  // 5/11 (Rúben: «não pode haver overlap de medidas»): cada medida procura um sítio livre (planta.ts)
  const etiquetas = etiquetasSemSobrepor(p.paredes, p.o, letra * 4.2, letra * 1.5);

  const texto = paredesFixas ? (textoBarra ?? "Toque numa peça para a trocar; arraste-a para o sítio.")
    : !p.paredes.length ? `Arraste o dedo para desenhar as paredes${divisao ? ` da ${divisao.toLowerCase()}` : ""}, uma a uma, como na folha.`
    : fechada ? "A planta fecha. Arraste as peças da barra para a planta, e toque num número para escrever a medida certa."
    : "Continue a desenhar a partir do ponto. Toque num número para escrever a medida certa.";

  return (
    <div className="space-y-4">
      <p className="text-[15px] text-muted-foreground">{texto}</p>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <svg ref={svg} viewBox={`${vista.x} ${vista.y} ${vista.w} ${vista.h}`} className="block h-auto max-h-[65vh] w-full touch-none select-none"
          role="img" aria-label={`Planta: ${p.paredes.map((x) => `${x.c} cm`).join(", ") || "por desenhar"}`}
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
          {/* cada parede: tocar seleciona, arrastar muda-a de sítio (as vizinhas acompanham); a selecionada fica destacada */}
          {!paredesFixas && fechada && p.paredes.map((_w, i) => (
            <g key={`p-${i}`}>
              {paredeSel === i && <line x1={pts[i].x} y1={pts[i].y} x2={pts[i + 1].x} y2={pts[i + 1].y} className="pointer-events-none stroke-primary" strokeWidth={letra / 1.8} strokeLinecap="round" />}
              <line x1={pts[i].x} y1={pts[i].y} x2={pts[i + 1].x} y2={pts[i + 1].y} stroke="transparent" strokeWidth={letra * 1.4}
                className={pts[i].x === pts[i + 1].x ? "cursor-ew-resize" : "cursor-ns-resize"} onPointerDown={(e) => pegarParede(e, i)} aria-hidden="true" />
            </g>
          ))}
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
          {desenhar && p.paredes.length > 0 && !traco && <circle cx={fim.x} cy={fim.y} r={letra * 0.6} className="pointer-events-none fill-primary" />}
          {desenhar && p.paredes.length > 1 && <circle cx={p.o.x} cy={p.o.y} r={letra * 0.45} className="pointer-events-none fill-none stroke-primary" strokeWidth={letra / 6} strokeDasharray={`${letra / 4} ${letra / 4}`} />}

          {/* as medidas por cima de cada parede: tocar para escrever a certa */}
          {p.paredes.map((w, i) => {
            const e = etiquetas[i];
            const ativa = paredeSel === i;
            const conteudo = (
              <>
                <rect x={e.x - letra * 2.1} y={e.y - letra * 0.8} width={letra * 4.2} height={letra * 1.5} rx={letra * 0.4}
                  className={ativa ? "fill-primary" : "fill-card stroke-border"} strokeWidth={letra / 12} />
                <text x={e.x} y={e.y + letra * 0.3} textAnchor="middle" fontSize={letra * 0.95} className={cn("font-semibold", ativa ? "fill-primary-foreground" : "fill-foreground")}>{w.c}</text>
              </>
            );
            return paredesFixas ? <g key={i} className="pointer-events-none">{conteudo}</g> : (
              <g key={i} role="button" tabIndex={0} aria-label={`Parede ${i + 1}: ${w.c} cm. Escrever a medida.`} className="cursor-pointer outline-none"
                onPointerDown={(ev) => pegarParede(ev, i)}
                onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setParedeSel(i); setTimeout(() => caixaMedida.current?.focus(), 0); } }}>{conteudo}</g>
            );
          })}

          {/* as peças que saem (o antes), a tracejado */}
          {fantasmas.map((pc) => (
            <g key={`f-${pc.id}`} className="pointer-events-none" aria-hidden="true">
              <rect x={pc.x} y={pc.y} width={pc.w} height={pc.h} rx={Math.min(pc.w, pc.h) / 8} className="fill-destructive/[0.04] stroke-destructive/70"
                strokeWidth={letra / 10} strokeDasharray={`${letra / 3} ${letra / 4}`} />
              <text x={pc.x + pc.w / 2} y={pc.y + pc.h / 2 + letra / 3} textAnchor="middle" fontSize={letra * 0.6} className="fill-destructive/80">sai: {PECAS[pc.tipo].n}</text>
            </g>
          ))}

          {/* as peças: arrastar com o dedo; com o teclado, as setas */}
          {p.pecas.map((pc) => {
            const ap = aparencia?.(pc) ?? {};
            const rotulo = ap.rotulo ?? PECAS[pc.tipo].n;
            return (
              <g key={pc.id} role="button" tabIndex={0} aria-label={`${rotulo}, ${pc.w} por ${pc.h} cm.${aoTocarPeca ? " Enter para trocar." : ""} Setas para mover.`}
                aria-pressed={sel === pc.id} onPointerDown={(e) => pegarPeca(e, pc)} onKeyDown={(e) => teclas(e, pc)} onFocus={() => setSel(pc.id)} className="cursor-grab outline-none">
                <rect x={pc.x} y={pc.y} width={pc.w} height={pc.h} rx={Math.min(pc.w, pc.h) / 8}
                  className={ap.cor ? "stroke-foreground/70" : PECAS[pc.tipo].abertura ? "fill-amber-200 stroke-amber-700" : "fill-primary/15 stroke-primary"}
                  style={ap.cor ? { fill: ap.cor } : undefined} strokeWidth={sel === pc.id ? letra / 4 : letra / 10} />
                {ap.destaque && <circle cx={pc.x + pc.w} cy={pc.y} r={letra * 0.45} className="fill-primary stroke-card" strokeWidth={letra / 10} />}
                <text x={pc.x + pc.w / 2} y={pc.y + pc.h / 2 + letra / 3} textAnchor="middle" fontSize={letra * 0.62}
                  className="pointer-events-none fill-foreground font-medium" style={ap.cor ? { paintOrder: "stroke", stroke: "hsl(var(--card))", strokeWidth: letra / 6 } : undefined}>
                  {rotulo.length > 22 ? rotulo.slice(0, 21) + "…" : rotulo}
                </text>
              </g>
            );
          })}

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
          style={{ left: nova.x, top: nova.y }}>{nova.rotulo ?? PECAS[nova.tipo].n}</div>
      )}

      {!paredesFixas && (
        <p role="status" className={cn("text-[15px]", !p.paredes.length ? "text-muted-foreground" : fechada ? "text-success" : "text-foreground")}>
          {!p.paredes.length ? "Ainda sem paredes." : fechada ? "A planta fecha."
            : falta === Infinity ? `${p.paredes.length} ${p.paredes.length === 1 ? "parede" : "paredes"}.` : `Faltam ${falta} cm até ao canto de partida.`}
        </p>
      )}

      {/* a medida certa da parede tocada */}
      {paredeSel !== null && p.paredes[paredeSel] && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1">
          <label className="grid w-40 gap-1 text-sm font-medium" htmlFor={`${id}-medida`}>Parede {paredeSel + 1}, em cm
            <input ref={caixaMedida} id={`${id}-medida`} key={`${paredeSel}-${p.paredes[paredeSel].c}`} type="number" inputMode="numeric" min={0} defaultValue={p.paredes[paredeSel].c} className={INP}
              onBlur={(e) => { const c = Math.round(Number(e.target.value) || 0); if (c > 0 && c !== p.paredes[paredeSel].c) mudarMedida(paredeSel, c); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
          </label>
          {fechada && !paredesFixas && <p className="min-w-[200px] flex-1 text-sm text-muted-foreground">Arraste a parede na planta para a mudar de sítio: as do lado acompanham e a planta continua fechada.</p>}
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => setParedeSel(null)}>Feito</Button>
        </div>
      )}

      {/* os produtos escolhidos que faltam pôr na planta: arrastar para o sítio, ou tocar e fica ao meio */}
      {bandeja.length > 0 && (
        <div className="select-none space-y-2 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/[0.03] p-3">
          <p className="text-[15px] font-medium">Por colocar ({bandeja.length}): arraste cada um para o sítio</p>
          <div className="flex flex-wrap gap-2">
            {bandeja.map((b) => (
              <button key={b.id} type="button" className={cn(CHIP, "border-primary/40 bg-card shadow-sm motion-safe:animate-in motion-safe:zoom-in-95")}
                onPointerDown={(e) => pegarNova(e, { tipo: b.tipo, bandeja: b.id, rotulo: b.rotulo })}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); aoColocar?.(b.id); } }}>
                <span aria-hidden="true" className="h-4 w-4 rounded border border-black/15" style={{ background: b.cor ?? "transparent" }} />{b.rotulo}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* as peças: arrastar para a planta, ou tocar */}
      {tipos.length > 0 && (
        <div className="select-none space-y-2">
          <p className="text-sm text-muted-foreground">Arraste para a planta (ou toque, e fica ao meio):</p>
          <div className="flex flex-wrap gap-2">
            {tipos.map((t) => (
              <button key={t} type="button" className={CHIP} onPointerDown={(e) => pegarNova(e, { tipo: t })}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); juntar(t); } }}>
                {PECAS[t].n}
              </button>
            ))}
          </div>
        </div>
      )}

      {selecionada && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-muted/30 p-3">
          <p className="w-full text-[15px] font-medium">{aparencia?.(selecionada).rotulo ?? PECAS[selecionada.tipo].n}</p>
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
          {acoesDaPeca?.(selecionada)}
        </div>
      )}

      {/* desfazer, recomeçar, ou escrever as medidas à mão */}
      {!paredesFixas && p.paredes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={() => { gravar({ ...p, paredes: p.paredes.slice(0, -1) }); setParedeSel(null); }}>
            <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Desfazer a última parede
          </Button>
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => { gravar({ ...PLANTA_VAZIA, pecas: p.pecas }); setParedeSel(null); }}>Apagar as paredes</Button>
        </div>
      )}
      {!paredesFixas && (
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
                  onBlur={(e) => { const c = Math.max(0, Math.round(Number(e.target.value) || 0)); if (c !== w.c) mudarMedida(i, c); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                <span className="text-muted-foreground">cm</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
