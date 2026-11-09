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
import { BarraRevestimentos } from "./planta3d/BarraRevestimentos";
import { PE_DIREITO_OMISSAO, areaPavimento, areaParedes } from "./planta3d/modelo";
import { Planta3DPainel } from "./planta3d/Planta3DPainel";
import { comDemonstracao, produtosParaEspaco, type ProdutoModelo3D } from "./planta3d/catalogo3d";
import { ajustarPeca, ativa, avisosDaPlanta, centroPeca, ehAbertura, ehDeParede, encostarParede, moverPara, normalizarAngulo, poligonoDe, rodarPeca } from "./planta3d/pecas3d";
import type { Mover3D } from "./planta3d/Visualizador3D";
import { aplicarVariante, expandirConjunto, guardarLugarLocal, mudarMontagem, reporComponente, reposicionarConjunto, retirarComponente, type Conjunto } from "./planta3d/conjuntos";
import { familiaPorId, modeloDaFamilia } from "./planta3d/familias";
import { ListaVendavel, PainelConjunto, PainelVariante } from "./planta3d/PainelVariante";
import { PainelGenerico } from "./planta3d/PainelGenerico";
import { PainelComposicao } from "./planta3d/PainelComposicao";
import { aplicarComposicao, composicaoDe, modeloDaComposicao, pecaComposicao, predefinido, type ComposicaoCozinha } from "./planta3d/composicaoCozinha";
import { PainelBancada } from "./planta3d/PainelBancada";
import { BANCADA_OMISSAO, aplicarConfig, modeloDaBancada, pecaBancada, type ConfigBancada } from "./planta3d/bancada";
import { ListaPecas, nomeDaPeca } from "./planta3d/ListaPecas";
import { deLegado, pecaDeProduto } from "./planta3d/ligacao";
import { useProto3d } from "./planta3d/usarProto3d";
import { Check, Copy, FlipHorizontal, Redo2, RotateCcw, RotateCw, Trash2, Undo2 } from "lucide-react";
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
/** A ordem de desenho: as grandes por baixo, as pequenas e as elevadas por cima, e a escolhida sempre por cima de tudo (recebe o toque mesmo sob um conjunto). */
function ordemDeDesenho(pecas: PecaPlanta[], sel: string | null): PecaPlanta[] {
  const peso = (x: PecaPlanta) => (x.id === sel ? 2 : (x.alt ?? 0) >= 30 || x.mont === "parede" ? 1 : 0);
  return [...pecas].sort((a, b) => peso(a) - peso(b) || b.w * b.h - a.w * a.h);
}

/** O que se vê: a tela de sempre, alargada ao que está desenhado (com margem). Só muda quando se grava, nunca a meio de um traço. */
function vistaDe(p: Planta) {
  if (!p.paredes.length && !p.pecas.length) return TELA;
  const b = limites(p), m = 60;
  const x = Math.min(TELA.x, b.x - m), y = Math.min(TELA.y, b.y - m);
  return { x, y, w: Math.max(TELA.x + TELA.w, b.x + b.w + m) - x, h: Math.max(TELA.y + TELA.h, b.y + b.h + m) - y };
}

export function PlantaDivisao3D({ ctx, d, divisao }: { ctx: Ctx; d: Negocio; divisao?: string }) {
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
  const produtosTodos = useMemo(() => comDemonstracao(K.produtos, K.arvore), [K]);
  const produtosCat = useMemo(() => produtosParaEspaco(produtosTodos, K.arvore, proto.pref.tipo, { max: 100000 }), [produtosTodos, K, proto.pref.tipo]);
  const [aviso, setAviso] = useState("");
  // os revestimentos como produtos: os da planta por cima das preferências (os selectores do 3D), as paredes e as áreas da divisão
  const revInfo = useMemo(() => {
    const r = deLegado(p, { tipo: proto.pref.tipo, nome: divisao ?? "Espaço", peDireito: PE_DIREITO_OMISSAO, produtos: {}, revestimentos: proto.pref.rev });
    if (!r.ok) return null;
    return { rev: r.espaco.revestimentos, paredes: r.espaco.paredes.map((w, i) => ({ id: w.id, nome: `${i + 1}` })), chao: areaPavimento(r.espaco), paredesM2: areaParedes(r.espaco) };
  }, [p, proto.pref.tipo, proto.pref.rev, divisao]);
  const origem = useRef<PecaPlanta | null>(null);
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

  // histórico para Desfazer/Refazer: a planta de antes de cada acção (a do início do arrasto, não a do meio)
  const passado = useRef<Planta[]>([]), futuro = useRef<Planta[]>([]), instantanea = useRef<Planta | null>(null);
  const [, redesenhar] = useState(0);
  const [confirmarLimpar, setConfirmarLimpar] = useState(false);
  const aplicar = (np: Planta) => { setP(np); setVista(vistaDe(np)); setFeito(""); ctx.A.campo(d.id, "planta", gravarPlanta(np)); };
  const gravar = (np: Planta) => {
    passado.current = [...passado.current.slice(-49), instantanea.current ?? p]; futuro.current = []; instantanea.current = null;
    aplicar(np); redesenhar((n) => n + 1);
  };
  const desfazer = () => {
    const antes = passado.current.pop(); if (!antes) return;
    futuro.current.push(p); aplicar(antes); setSel((s) => (s && antes.pecas.some((x) => x.id === s) ? s : null)); setAviso(""); redesenhar((n) => n + 1);
  };
  const refazer = () => {
    const depois = futuro.current.pop(); if (!depois) return;
    passado.current.push(p); aplicar(depois); setSel((s) => (s && depois.pecas.some((x) => x.id === s) ? s : null)); setAviso(""); redesenhar((n) => n + 1);
  };
  const mudarPeca = (pid: string, parcial: Partial<PecaPlanta>, guardar = true) => {
    const np = { ...p, pecas: p.pecas.map((x) => (x.id === pid ? { ...x, ...parcial } : x)) };
    if (guardar) gravar(np); else setP(np);
  };

  const avisosPlanta = useMemo(() => avisosDaPlanta(p), [p]);
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
  // a barra da peça escolhida fica logo por baixo da planta (e por cima do 3D): Remover sem andar à procura do painel
  const barraSel = selecionada ? (
    <div role="toolbar" aria-label="Peça escolhida" className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/[0.06] p-2">
      <span className="min-w-0 flex-1 px-2 text-[15px] font-medium">{nomeDaPeca(selecionada)}</span>
      {!ehAbertura(selecionada) && !selecionada.semGeo && <Button type="button" variant="outline" className="min-h-11" aria-label={`Rodar ${nomeDaPeca(selecionada)}`} onClick={() => rodar(selecionada, 90)}><RotateCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Rodar</Button>}
      <Button type="button" variant="destructive" className="min-h-11" aria-label={`Remover ${nomeDaPeca(selecionada)}`} onClick={() => removerPeca(selecionada.id)}><Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Remover</Button>
      <Button type="button" variant="ghost" className="min-h-11" onClick={() => setSel(null)}>Desescolher</Button>
    </div>
  ) : null;
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
  const largarNaTela = (e?: RPointerEvent<SVGSVGElement>) => {
    if (traco) {
      const parede = paredeDoTraco(traco.de, traco.ate, p.paredes.length >= 2 ? p.o : undefined);
      setTraco(null);
      if (parede) gravar({ ...p, paredes: juntarParede(p.paredes, parede) });
      return;
    }
    if (arrasto.current) {
      const pid = arrasto.current.id; arrasto.current = null;
      const r = svg.current?.getBoundingClientRect(), pc = p.pecas.find((x) => x.id === pid), antes = origem.current;
      // largada fora da planta (na barra de produtos, por exemplo): a peça sai
      const fora = !!e && e.type === "pointerup" && !!r && r.width > 0 && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
      if (fora && pc) { removerPeca(pid); setAviso("Peça removida: foi largada fora da planta. Desfazer repõe-na."); return; }
      if (pc && antes && antes.id === pid && pc.x === antes.x && pc.y === antes.y) { instantanea.current = null; return; } // só um toque: selecciona, não grava
      confirmarPeca(p, pid);
    }
  };

  // ---- as peças dentro da planta ----
  const pegarPeca = (e: RPointerEvent, pc: PecaPlanta) => {
    e.stopPropagation();
    const q = naPlanta(e.clientX, e.clientY); if (!q) return;
    svg.current?.setPointerCapture?.(e.pointerId);
    arrasto.current = { id: pc.id, dx: q.x - pc.x, dy: q.y - pc.y };
    origem.current = pc; instantanea.current = p;
    setSel(pc.id); setParedeSel(null);
  };
  const teclas = (e: KeyboardEvent, pc: PecaPlanta) => {
    if ((e.key === "r" || e.key === "R") && !ehAbertura(pc)) { e.preventDefault(); rodar(pc, e.shiftKey ? -90 : 90); return; }
    const passo = e.shiftKey ? 25 : PASSO;
    const mov: Record<string, [number, number]> = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] };
    const m = mov[e.key]; if (!m) return;
    e.preventDefault();
    confirmarPeca({ ...p, pecas: p.pecas.map((x) => (x.id === pc.id ? { ...x, x: pc.x + m[0], y: pc.y + m[1] } : x)) }, pc.id, pc);
  };

  // ---- ajustar à divisão (peças de parede encostam-se; nenhuma sai das paredes) ----
  /** Grava a planta com a peça ajustada; se não couber, volta ao sítio anterior (`antes`) e diz «Fora da divisão». */
  function confirmarPeca(np: Planta, pid: string, antes: PecaPlanta | null = origem.current, o: { parede?: number; orientar?: boolean } = {}) {
    const pc = np.pecas.find((x) => x.id === pid); if (!pc) { gravar(np); return; }
    const r = ajustarPeca(np, pc, o);
    if (r.ok) { gravar(aposPeca({ ...np, pecas: np.pecas.map((x) => (x.id === pid ? r.peca : x)) }, r.peca)); setAviso(""); return; }
    gravar({ ...np, pecas: antes ? np.pecas.map((x) => (x.id === pid ? antes : x)) : np.pecas.filter((x) => x.id !== pid) });
    setAviso(r.erro);
  }
  /** Mover no 3D: as mesmas regras da planta (moverPara/ajustarPeca); a gravação é a de sempre (Desfazer/Refazer, conjuntos com a âncora). */
  const mover3D: Mover3D = {
    ajustar: (id, x, y, alt) => {
      const pc = p.pecas.find((k) => k.id === id); if (!pc) return null;
      const r = moverPara(p, pc, x, y, alt);
      return r.ok ? { x: (r.peca.x + r.peca.w / 2) / 100, y: (r.peca.y + r.peca.h / 2) / 100, rot: r.peca.rot ?? 0, altura: (r.peca.alt ?? 0) / 100 } : null;
    },
    confirmar: (id, x, y, alt) => {
      const pc = p.pecas.find((k) => k.id === id); if (!pc) return;
      const r = moverPara(p, pc, x, y, alt);
      if (!r.ok) { setAviso(r.erro); return; }
      gravar(aposPeca({ ...p, pecas: p.pecas.map((k) => (k.id === id ? r.peca : k)) }, r.peca)); setAviso("");
    },
  };
  /** Peça de um conjunto: se for a âncora, o conjunto vai com ela; se for outro componente, guarda-se o novo lugar dele. */
  const aposPeca = (np: Planta, peca: PecaPlanta): Planta => (!peca.conj ? np : peca.ancora ? reposicionarConjunto(np, peca.conj) : guardarLugarLocal(np, peca.id));
  /** Remove uma peça (a de um conjunto sai do conjunto; a âncora leva o conjunto). Desfazer repõe. */
  function removerPeca(id: string) {
    const pc = p.pecas.find((x) => x.id === id); if (!pc) return;
    gravar(retirarComponente(p, id)); setSel((s) => (s === id ? null : s)); setAviso("");
  }
  const removerConjunto = (inst: string) => { gravar({ ...p, pecas: p.pecas.filter((x) => x.conj !== inst) }); setSel((s) => (s && p.pecas.find((x) => x.id === s)?.conj === inst ? null : s)); setAviso(""); };
  const rodarPorId = (id: string) => { const pc = p.pecas.find((x) => x.id === id); if (pc) rodar(pc, 90); };
  const duplicarPorId = (id: string) => { const pc = p.pecas.find((x) => x.id === id); if (pc) duplicar(pc); };
  const limparTudo = () => { gravar({ ...p, pecas: [] }); setSel(null); setConfirmarLimpar(false); setAviso(""); };
  // atalhos: Delete e Backspace removem a escolhida, Escape desescolhe, Ctrl+Z desfaz, Ctrl+Y (ou Ctrl+Shift+Z) refaz; nunca dentro de um campo de texto
  useEffect(() => {
    const tecla = (e: globalThis.KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (/^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName) || alvo.isContentEditable)) return;
      const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && k === "z" && !e.shiftKey) { e.preventDefault(); desfazer(); return; }
      if (ctrl && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); refazer(); return; }
      if (e.key === "Escape") { setSel(null); return; }
      if (sel && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); removerPeca(sel); }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  });
  const novoId = () => { let n = contador.current; while (p.pecas.some((x) => x.id === `pc${n}`)) n++; contador.current = n; return `pc${n}`; };
  /** Roda uma peça: de chão em torno do centro; de parede passa à parede oposta (passos de 180 graus). */
  const rodar = (pc: PecaPlanta, graus: number) => {
    const r = rodarPeca(p, pc, graus);
    if (r.ok) { gravar(aposPeca({ ...p, pecas: p.pecas.map((x) => (x.id === pc.id ? r.peca : x)) }, r.peca)); setAviso(""); } else setAviso(r.erro);
  };
  const livre = (pc: PecaPlanta, graus: number) => {
    const r = ajustarPeca(p, { ...pc, rot: normalizarAngulo(graus) });
    if (r.ok) { gravar(aposPeca({ ...p, pecas: p.pecas.map((x) => (x.id === pc.id ? r.peca : x)) }, r.peca)); setAviso(""); } else setAviso(r.erro);
  };
  const duplicar = (pc: PecaPlanta) => {
    const nid = novoId();
    const r = ajustarPeca(p, { ...pc, id: nid, x: pc.x + 20, y: pc.y + 20 });
    if (!r.ok) { setAviso(r.erro); return; }
    gravar({ ...p, pecas: [...p.pecas, r.peca] }); setSel(nid); setAviso("");
  };
  /** Põe um conjunto na planta: a âncora ajusta-se à divisão (as peças de chão viram as costas à parede) e os componentes ficam ligados à volta dela. */
  const adicionarConjunto = (c: Conjunto) => {
    const comp = c.componentes.find((k) => k.papel === c.ancora), fam = comp && familiaPorId(comp.familiaId);
    if (!comp || !fam) return;
    const inst = (() => { let n = 1; while (p.pecas.some((x) => x.conj === `cj${n}`)) n++; return `cj${n}`; })();
    const m = modeloDaFamilia(fam, comp.medidaId, comp.acabId);
    const sem = pecaDeProduto(p, m, `${inst}-${c.ancora}`, undefined);
    const largura = fam.id === "tampo" ? 240 : sem.w, poly = poligonoDe(p);
    const base = { ...sem, w: largura };
    // os conjuntos de chão encostam as costas à parede mais próxima
    const r = ajustarPeca(p, poly && !ehDeParede(base) ? encostarParede(poly, base).peca : base, { orientar: true });
    if (!r.ok) { setAviso(r.erro); return; }
    const novas = expandirConjunto(c, inst, r.peca);
    gravar({ ...p, pecas: [...p.pecas, ...novas] }); setSel(`${inst}-${c.ancora}`); setAviso("");
  };
  /** Põe a bancada composta na planta: ao meio, com as costas na parede mais próxima (como os conjuntos). */
  const adicionarBancada = () => {
    const nid = novoId(), cfg = BANCADA_OMISSAO;
    const sem = pecaDeProduto(p, modeloDaBancada(nid, cfg), nid, undefined), poly = poligonoDe(p);
    const base = pecaBancada(nid, { x: sem.x, y: sem.y }, cfg);
    const r = ajustarPeca(p, poly ? encostarParede(poly, base).peca : base, { orientar: true });
    if (!r.ok) { setAviso(r.erro); return; }
    gravar({ ...p, pecas: [...p.pecas, r.peca] }); setSel(nid); setAviso("");
  };
  /** Põe uma composição modular de cozinha: como a bancada (ao meio, de costas para a parede mais próxima); a ilha fica solta, só dentro da divisão. */
  const adicionarComposicao = (id: string) => {
    const pre = predefinido(id); if (!pre) return;
    const nid = novoId(), cfg = composicaoDe(pre), poly = poligonoDe(p);
    const sem = pecaDeProduto(p, modeloDaComposicao(nid, cfg), nid, undefined);
    const base = pecaComposicao(nid, { x: sem.x, y: sem.y }, cfg);
    const r = ajustarPeca(p, poly && !cfg.ilha ? encostarParede(poly, base).peca : base, { orientar: !cfg.ilha });
    if (!r.ok) { setAviso(r.erro); return; }
    gravar({ ...p, pecas: [...p.pecas, r.peca] }); setSel(nid); setAviso("");
  };
  const mudarComposicao = (pc: PecaPlanta, c: ComposicaoCozinha) => confirmarPeca({ ...p, pecas: p.pecas.map((x) => (x.id === pc.id ? aplicarComposicao(x, c) : x)) }, pc.id, pc);
  const mudarBancada = (pc: PecaPlanta, c: ConfigBancada) => confirmarPeca({ ...p, pecas: p.pecas.map((x) => (x.id === pc.id ? aplicarConfig(x, c) : x)) }, pc.id, pc);
  const mudarVariante = (pc: PecaPlanta, familiaId: string, medidaId?: string, acabId?: string) => {
    const nova = aplicarVariante(pc, familiaId, medidaId, acabId);
    confirmarPeca({ ...p, pecas: p.pecas.map((x) => (x.id === pc.id ? nova : x)) }, pc.id, pc);
  };
  const adicionarProduto = (m: ProdutoModelo3D, centro?: Ponto) => {
    const nid = novoId();
    const base = { ...p, pecas: [...p.pecas, pecaDeProduto(p, m, nid, centro)] };
    confirmarPeca(base, nid, null, { orientar: true });
    setSel(nid);
  };

  // ---- as peças novas: arrastar da barra para a planta (ou tocar, e fica ao meio) ----
  const juntarAoMeio = (t: TipoPeca) => { const nid = novoId(); gravar(juntarPeca(p, t, nid)); setSel(nid); };
  const pegarNova = (e: RPointerEvent<HTMLButtonElement>, tipo: TipoPeca, produto?: ProdutoModelo3D) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setNova({ tipo, x: e.clientX, y: e.clientY, produto });
  };
  const juntarProdutoAoMeio = (m: ProdutoModelo3D) => adicionarProduto(m);
  const moverNova = (e: RPointerEvent<HTMLButtonElement>) => { if (nova) setNova({ ...nova, x: e.clientX, y: e.clientY }); };
  const largarNova = (e: RPointerEvent<HTMLButtonElement>) => {
    if (!nova) return;
    const r = svg.current?.getBoundingClientRect();
    const dentro = !!r && r.width > 0 && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    const centro = dentro ? naPlanta(e.clientX, e.clientY) ?? undefined : undefined;
    if (nova.produto) { adicionarProduto(nova.produto, centro); setNova(null); return; }
    const nid = novoId();
    gravar(juntarPeca(p, nova.tipo, nid, centro));
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
          {ordemDeDesenho(p.pecas.filter(ativa), sel).map((pc) => {
            const c = centroPeca(pc), nome = pc.nome ?? PECAS[pc.tipo].n;
            const cor = ehDeParede(pc) ? "fill-sky-100 stroke-sky-700" : PECAS[pc.tipo].abertura ? "fill-amber-200 stroke-amber-700" : "fill-primary/15 stroke-primary";
            return (
              <g key={pc.id} role="button" tabIndex={0} aria-label={`${nome}, ${pc.w} por ${pc.h} cm${ehDeParede(pc) && !ehAbertura(pc) ? `, na parede a ${pc.alt ?? 0} cm do chão` : ""}. Setas para mover${ehAbertura(pc) ? "" : ", R para rodar"}.`} aria-pressed={sel === pc.id}
                onPointerDown={(e) => pegarPeca(e, pc)} onKeyDown={(e) => teclas(e, pc)} onFocus={() => setSel(pc.id)} className="cursor-grab outline-none">
                <g transform={pc.rot ? `rotate(${pc.rot} ${c.x} ${c.y})` : undefined}>
                  {/* área de toque maior do que a peça (as pequenas, como uma torneira, também se tocam com o dedo) */}
                  <rect data-toque="" x={pc.x - letra * 1.2} y={pc.y - letra * 1.2} width={pc.w + letra * 2.4} height={pc.h + letra * 2.4} fill="transparent" />
                  <rect x={pc.x} y={pc.y} width={pc.w} height={pc.h} rx={Math.min(pc.w, pc.h) / 8} className={cor} strokeWidth={sel === pc.id ? letra / 4 : letra / 10} />
                  {pc.rot !== undefined && <line x1={pc.x} y1={pc.y + pc.h} x2={pc.x + pc.w} y2={pc.y + pc.h} className="stroke-foreground" strokeWidth={letra / 5} />}
                </g>
                <text x={c.x} y={c.y + letra / 3} textAnchor="middle" fontSize={letra * 0.7} className="pointer-events-none fill-foreground">{nome.length > 18 ? `${nome.slice(0, 17)}…` : nome}</text>
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
          style={{ left: nova.x, top: nova.y }}>{nova.produto?.nome ?? PECAS[nova.tipo].n}</div>
      )}

      {barraSel}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" className="min-h-11" disabled={passado.current.length === 0} onClick={desfazer}><Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Desfazer</Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={futuro.current.length === 0} onClick={refazer}><Redo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Refazer</Button>
        {p.pecas.length > 0 && !confirmarLimpar && <Button type="button" variant="ghost" className="min-h-11" onClick={() => setConfirmarLimpar(true)}>Limpar todas as peças</Button>}
        {confirmarLimpar && (
          <span role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-2 py-1 text-[15px]">
            Tirar as {p.pecas.length} peças da divisão?
            <Button type="button" variant="destructive" className="min-h-11" onClick={limparTudo}>Sim, limpar todas</Button>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setConfirmarLimpar(false)}>Cancelar</Button>
          </span>
        )}
      </div>
      <section aria-label="Peças na divisão" className="space-y-2">
        <h3 className="text-[15px] font-semibold">Peças na divisão ({p.pecas.filter((x) => !x.ret).length})</h3>
        <ListaPecas planta={p} sel={sel} onSel={setSel} onRemover={removerPeca} onRodar={rodarPorId} onDuplicar={duplicarPorId} onRemoverConjunto={removerConjunto} onRetirar={(id) => gravar(retirarComponente(p, id))} onRepor={(id) => gravar(reporComponente(p, id))} />
      </section>
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
          onPegar={(e, m) => pegarNova(e, "movel", m)} onMover={moverNova} onLargar={largarNova} onCancelar={() => setNova(null)} onJuntar={juntarProdutoAoMeio} onConjunto={adicionarConjunto} onBancada={adicionarBancada} onComposicao={adicionarComposicao} />
        {/* pavimentos e revestimentos de parede como produtos: ficam na planta (desfazer/refazer); os selectores do 3D são um atalho para o mesmo */}
        {revInfo && (
          <details className="rounded-2xl border border-border p-3">
            <summary className="min-h-11 cursor-pointer text-[15px] font-semibold">Pavimentos e revestimentos de parede</summary>
            <BarraRevestimentos rev={revInfo.rev} paredes={revInfo.paredes} areaChao={revInfo.chao} areaParedes={revInfo.paredesM2}
              onPavimento={(id) => gravar({ ...p, rev: { ...p.rev, pavimento: id } })} onParedes={(id) => gravar({ ...p, rev: { ...p.rev, parede: id } })}
              onParede={(w, id) => { const pp = { ...p.rev?.porParede }; if (id) pp[w] = id; else delete pp[w]; gravar({ ...p, rev: { ...p.rev, porParede: pp } }); }} />
          </details>
        )}
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

      {(aviso || avisosPlanta.length > 0) && (
        <ul role="status" className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[15px] text-amber-900">
          {aviso && <li>{aviso}</li>}
          {avisosPlanta.map((a) => <li key={a}>{a}</li>)}
        </ul>
      )}
      {selecionada && (() => {
        const novaPeca = selecionada.rot !== undefined && !ehAbertura(selecionada);
        const parede = ehDeParede(selecionada) && novaPeca;
        const poly = poligonoDe(p);
        const ao = parede && poly ? Math.round(encostarParede(poly, selecionada).ao) : null;
        const mudarCaixa = (k: "w" | "h", n: number) => confirmarPeca({ ...p, pecas: p.pecas.map((x) => (x.id === selecionada.id ? { ...x, [k]: n } : x)) }, selecionada.id, selecionada);
        const naParede = (novoAo: number) => {
          const r = ajustarPeca(p, selecionada, { ao: novoAo });
          if (r.ok) { gravar(aposPeca({ ...p, pecas: p.pecas.map((x) => (x.id === selecionada.id ? r.peca : x)) }, r.peca)); setAviso(""); } else setAviso(r.erro);
        };
        return (
          <div role="group" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-muted/30 p-3" aria-label={`Peça escolhida: ${selecionada.nome ?? PECAS[selecionada.tipo].n}`}>
            <p className="w-full text-[15px] font-medium">{selecionada.nome ?? PECAS[selecionada.tipo].n}{parede ? " (de parede)" : ""}</p>
            {selecionada.ret && <p className="w-full text-sm text-amber-800">Retirado do conjunto.</p>}
            {!selecionada.banc && (["w", "h"] as const).map((k) => (
              <label key={k} className="grid w-28 gap-1 text-sm font-medium">{k === "w" ? "Largura" : "Fundo"} (cm)
                <input key={`${selecionada.id}-${k}-${selecionada[k]}`} type="number" inputMode="numeric" min={1} defaultValue={selecionada[k]} className={INP}
                  onBlur={(e) => { const n = Math.max(1, Math.round(Number(e.target.value) || 0)); if (n !== selecionada[k]) (novaPeca ? mudarCaixa(k, n) : mudarPeca(selecionada.id, { [k]: n })); }} />
              </label>
            ))}
            {parede && (
              <>
                <label className="grid w-36 gap-1 text-sm font-medium">Altura ao chão (cm)
                  <input key={`${selecionada.id}-alt-${selecionada.alt}`} type="number" inputMode="numeric" min={0} defaultValue={selecionada.alt ?? 0} className={INP}
                    onBlur={(e) => { const n = Math.max(0, Math.round(Number(e.target.value) || 0)); if (n !== (selecionada.alt ?? 0)) mudarPeca(selecionada.id, { alt: n }); }} />
                </label>
                {ao !== null && (
                  <label className="grid w-44 gap-1 text-sm font-medium">Posição ao longo da parede (cm)
                    <input key={`${selecionada.id}-ao-${ao}`} type="number" inputMode="numeric" min={0} defaultValue={ao} className={INP}
                      onBlur={(e) => { const n = Math.max(0, Math.round(Number(e.target.value) || 0)); if (n !== ao) naParede(n); }} />
                  </label>
                )}
              </>
            )}
            {novaPeca && !parede && (
              <label className="grid w-36 gap-1 text-sm font-medium">Ângulo (graus)
                <input key={`${selecionada.id}-rot-${selecionada.rot}`} type="number" inputMode="numeric" step={5} defaultValue={selecionada.rot ?? 0} className={INP}
                  onBlur={(e) => { const n = normalizarAngulo(Number(e.target.value) || 0); if (n !== (selecionada.rot ?? 0)) livre(selecionada, n); }} />
              </label>
            )}
            {novaPeca && (
              <>
                <Button type="button" variant="outline" className="min-h-11" onClick={() => rodar(selecionada, -90)}>
                  <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />{parede ? "Passar à parede oposta" : "Rodar 90° à esquerda"}
                </Button>
                {!parede && (
                  <Button type="button" variant="outline" className="min-h-11" onClick={() => rodar(selecionada, 90)}>
                    <RotateCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Rodar 90° à direita
                  </Button>
                )}
                <Button type="button" variant="outline" className="min-h-11" aria-pressed={!!selecionada.esp} onClick={() => mudarPeca(selecionada.id, { esp: !selecionada.esp })}>
                  <FlipHorizontal className="mr-1.5 h-4 w-4" aria-hidden="true" />Espelhar
                </Button>
              </>
            )}
            {!novaPeca && !ehAbertura(selecionada) && (
              <Button type="button" variant="outline" className="min-h-11" onClick={() => mudarPeca(selecionada.id, { w: selecionada.h, h: selecionada.w })}>
                <RotateCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Rodar
              </Button>
            )}
            <Button type="button" variant="outline" className="min-h-11" onClick={() => duplicar(selecionada)}>
              <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />Duplicar
            </Button>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => { gravar(retirarComponente(p, selecionada.id)); if (!selecionada.conj || selecionada.ancora) setSel(null); setAviso(""); }}>
              <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />{selecionada.ancora ? "Remover o conjunto" : selecionada.conj ? "Retirar do conjunto" : "Remover"}
            </Button>
            {selecionada.banc && <PainelBancada cfg={selecionada.banc} onMudar={(c) => mudarBancada(selecionada, c)} />}
            {selecionada.coz && <PainelComposicao cfg={selecionada.coz} onMudar={(c) => mudarComposicao(selecionada, c)} />}
            <PainelVariante peca={selecionada} onOpcao={(o) => gravar({ ...p, pecas: p.pecas.map((x) => (x.id === selecionada.id ? { ...x, opc: { ...x.opc, ...o } } : x)) })} onMudar={(f, med, ac) => mudarVariante(selecionada, f, med, ac)} onMontagem={(mo) => gravar({ ...p, pecas: p.pecas.map((x) => (x.id === selecionada.id ? mudarMontagem(x, mo) : x)) })} />
            <PainelGenerico modelo={selecionada.produto ? produtosCat.find((m) => m.produtoId === selecionada.produto) : undefined} opc={selecionada.opc}
              onGen={(gen) => gravar({ ...p, pecas: p.pecas.map((x) => (x.id === selecionada.id ? { ...x, opc: { ...x.opc, gen } } : x)) })} />
            {selecionada.conj && <PainelConjunto planta={p} peca={selecionada} onEscolher={setSel} onRetirar={(id) => gravar(retirarComponente(p, id))} onRepor={(id) => gravar(reporComponente(p, id))} />}
            <p className="w-full text-sm text-muted-foreground">Com a peça escolhida: setas movem (Shift: 25 cm), R roda 90° para a direita e Shift+R para a esquerda{parede ? " (as de parede passam à parede oposta)" : ""}.</p>
          </div>
        );
      })()}

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

      <ListaVendavel planta={p} />

      {/* protótipo: ver o que está desenhado em 3D */}
      <div className="space-y-3">
        <Button type="button" variant="outline" className="min-h-11" aria-expanded={ver3d} onClick={() => setVer3d(!ver3d)}>
          <Box className="mr-1.5 h-4 w-4" aria-hidden="true" />{ver3d ? "Fechar o 3D" : "Ver em 3D"}
        </Button>
        {ver3d && (
          <Planta3DPainel planta={p} tipo={proto.pref.tipo} nome={divisao ?? "Espaço"} peDireito={pe} produtos={produtosTodos} arvore={K.arvore}
            rev={proto.pref.rev} onRev={proto.setRev} teto={proto.pref.teto} onTeto={proto.setTeto} selecionada={sel} onSelecionar={setSel} acoes={barraSel} mover={mover3D} />
        )}
      </div>
    </div>
  );
}
