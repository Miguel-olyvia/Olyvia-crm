// Protótipo (visualizador 3D): a BANCADA composta, como a aba «Bancadas» do «Torneiras e Lava-loiças · Catálogo 3D». Uma chapa Coverlam Top de 12 mm
// (série, tom, acabamento, desenho da chapa, sentido e faixa dos veios), com comprimento e profundidade, um lava-loiça (montagem por baixo ou por
// cima), uma placa e uma torneira escolhidos entre os modelos do HTML, a posição de cada equipamento em cm a partir da esquerda e o rodatampo.
// Os dados das chapas (`SERIES_BANCADA`) e a composição de exemplo (`BANCADA_OMISSAO`) são cópia exacta do HTML (`counterMaterials` e
// `counterDefaults`); as regras (`validarBancada`, `distribuir`, `colocacao`) são as do HTML (`validateCounter`, `counterAuto`, `counterPlacement`).
// Medidas em mm, como no HTML: +Z é a frente, o topo da chapa é Y0, o centro da chapa é a origem. Cada equipamento vende-se à parte (`linhasDaBancada`).
import type { PecaPlanta } from "../planta";
import type { ProdutoModelo3D } from "./catalogo3d";
import { FAMILIAS, acabamentosDaMedida, resolverVariante, type Familia } from "./familias";
import { AMBAR_SPECS, LODY_SPECS, VELAR_SPECS, roundLoop } from "./modelosHtml/lavaLoicas";
import { CUBAS_SPECS, KERAN_SPECS, UNA_SPECS } from "./modelosHtml/lavaLoicasRodi";
import { HOB_SPECS, type SpecPlaca } from "./modelosHtml/placas";
import { ehModeloTorneira } from "./modelosHtml/torneiras";

/* ------------------------------------------------------------------ as chapas (cópia de `counterMaterials` do HTML) */
export interface LivroChapa { file: string; url: string; label: string }
export interface AcabamentoChapa { label: string; roughness: number; clearcoat: number; refs: Record<string, string>; catalogRefs: Record<string, string> }
export interface TomChapa { label: string; edge: string; books: Record<string, LivroChapa>; finishes: Record<string, AcabamentoChapa>; source?: string }
export interface SerieChapa { label: string; source: string; catalogSource: string; catalogPages: string; slab: [number, number]; thickness: number; tones: Record<string, TomChapa> }
const CAT = "https://www.coverlambygrespania.com/wp-content/uploads/2025/12/CATALOGO-COVERLAM-TOP-2026-11_WEB.pdf";
export const SERIES_BANCADA: Record<string, SerieChapa> = {"canela-roma": {"label": "Canela Roma", "source": "https://www.coverlambygrespania.com/serie/canela-roma/", "catalogSource": CAT, "catalogPages": "52–53", "slab": [1620, 3240], "thickness": 12, "tones": {"beige": {"label": "Beige", "edge": "#d8d1bb", "books": {"A": {"file": "canela-roma-A.jpg", "url": "https://www.coverlambygrespania.com/wp-content/uploads/2026/02/agdgetdocdir2-234-scaled.jpg", "label": "Book A"}, "B": {"file": "canela-roma-B.jpg", "url": "https://www.coverlambygrespania.com/wp-content/uploads/2026/02/agdgetdocdir2-235-scaled.jpg", "label": "Book B"}}, "finishes": {"natural": {"label": "Natural · acetinado", "roughness": 0.62, "clearcoat": 0, "refs": {"A": "88C772A", "B": "88C772B"}, "catalogRefs": {"A": "88C776A", "B": "88C776B"}}}}}}, "nero-ardi": {"label": "Nero Ardi", "source": "https://www.coverlambygrespania.com/serie/nero-ardi/", "catalogSource": CAT, "catalogPages": "96–97", "slab": [1620, 3240], "thickness": 12, "tones": {"negro": {"label": "Negro", "edge": "#303032", "books": {"A": {"file": "nero-ardi-0.jpg", "url": "https://www.coverlambygrespania.com/wp-content/uploads/2026/02/agdgetdocdir2-1619-scaled.jpg", "label": "Chapa integral"}}, "finishes": {"natural": {"label": "Natural · mate", "roughness": 0.67, "clearcoat": 0, "refs": {"A": "88NH912"}, "catalogRefs": {"A": "88NH916"}}}}}}, "blue-roma": {"label": "Blue Roma", "source": "https://www.coverlambygrespania.com/serie/blue-roma/", "catalogSource": CAT, "catalogPages": "32–33", "slab": [1620, 3240], "thickness": 12, "tones": {"cielo": {"label": "Cielo", "edge": "#aaa99d", "books": {"A": {"file": "blue-roma-2.jpg", "url": "https://www.coverlambygrespania.com/wp-content/uploads/2026/02/agdgetdocdir2-77-scaled.jpg", "label": "Book A"}, "B": {"file": "blue-roma-3.jpg", "url": "https://www.coverlambygrespania.com/wp-content/uploads/2026/02/agdgetdocdir2-78-scaled.jpg", "label": "Book B"}}, "finishes": {"natural": {"label": "Natural · acetinado", "roughness": 0.56, "clearcoat": 0, "refs": {"A": "88B132A", "B": "88B132B"}, "catalogRefs": {"A": "88B136A", "B": "88B136B"}}}}}}, "camargue": {"label": "Camargue", "source": "https://www.coverlambygrespania.com/serie/camargue/", "catalogSource": CAT, "catalogPages": "128–129", "slab": [1620, 3240], "thickness": 12, "tones": {"blanco": {"label": "Blanco", "edge": "#deddd6", "books": {"A": {"file": "camargue-blanco.webp", "url": "https://media.grespania.com/productos/camargue-1600x3200x12-blanco-web.webp", "label": "Chapa integral"}}, "finishes": {"natural": {"label": "Natural · mate", "roughness": 0.67, "clearcoat": 0, "refs": {"A": "88RG42S"}, "catalogRefs": {"A": "88RG46S"}}}, "source": "https://www.grespania.com/en/products/coverlam-top-camargue-natural-162x324-12-mm"}, "arena": {"label": "Arena", "edge": "#d6cdbd", "books": {"A": {"file": "camargue-arena.webp", "url": "https://media.grespania.com/productos/camargue-1600x3200x12-arena-web.webp", "label": "Chapa integral"}}, "finishes": {"natural": {"label": "Natural · mate", "roughness": 0.67, "clearcoat": 0, "refs": {"A": "88RG72S"}, "catalogRefs": {"A": "88RG76S"}}}, "source": "https://www.grespania.com/en/products/coverlam-top-camargue-arena-natural-162x324-12-mm-1"}}}, "capraia": {"label": "Capraia", "source": "https://www.coverlambygrespania.com/serie/capraia/", "catalogSource": CAT, "catalogPages": "56–57", "slab": [1620, 3240], "thickness": 12, "tones": {"blanco": {"label": "Blanco", "edge": "#d8d6ce", "books": {"A": {"file": "capraia-2.jpg", "url": "https://www.coverlambygrespania.com/wp-content/uploads/2026/02/agdgetdocdir2-51-scaled.jpg", "label": "Book A"}, "B": {"file": "capraia-3.jpg", "url": "https://www.coverlambygrespania.com/wp-content/uploads/2026/02/agdgetdocdir2-1395-scaled.jpg", "label": "Book B"}}, "finishes": {"natural": {"label": "Natural · acetinado", "roughness": 0.56, "clearcoat": 0, "refs": {"A": "88C142A", "B": "88C142B"}, "catalogRefs": {"A": "88C146A", "B": "88C146B"}}}}}}, "calacata-vaglie": {"label": "Calacata Vaglie", "source": "https://www.coverlambygrespania.com/serie/calacata-vaglie/", "catalogSource": CAT, "catalogPages": "44–45", "slab": [1620, 3240], "thickness": 12, "tones": {"blanco": {"label": "Blanco", "edge": "#d6d6d0", "books": {"A": {"file": "calacata-vaglie-2.jpg", "url": "https://www.coverlambygrespania.com/wp-content/uploads/2026/02/agdgetdocdir2-212-scaled.jpg", "label": "Book A"}, "B": {"file": "calacata-vaglie-3.jpg", "url": "https://www.coverlambygrespania.com/wp-content/uploads/2026/02/agdgetdocdir2-213-scaled.jpg", "label": "Book B"}}, "finishes": {"natural": {"label": "Natural · acetinado", "roughness": 0.56, "clearcoat": 0, "refs": {"A": "88CV42A", "B": "88CV42B"}, "catalogRefs": {"A": "88CV46A", "B": "88CV46B"}}, "seda": {"label": "Polido Seda", "roughness": 0.27, "clearcoat": 0.18, "refs": {"A": "88CV2PA", "B": "88CV2PB"}, "catalogRefs": {"A": "88CV4PA", "B": "88CV4PB"}}}}}}, "jungla": {"label": "Jungla", "source": "https://www.coverlambygrespania.com/serie/jungla/", "catalogSource": CAT, "catalogPages": "172–173", "slab": [1620, 3240], "thickness": 12, "tones": {"abeto": {"label": "Abeto", "edge": "#cabb9a", "books": {"A": {"file": "jungla-3.jpg", "url": "https://www.coverlambygrespania.com/wp-content/uploads/2026/04/agdgetdocdir2-872-scaled.jpg", "label": "Chapa integral"}}, "finishes": {"escovado": {"label": "Escovado · mate", "roughness": 0.78, "clearcoat": 0, "refs": {"A": "88JG42S"}, "catalogRefs": {"A": "88JG46S"}}}}, "cipres": {"label": "Cipres", "edge": "#b5a17f", "books": {"A": {"file": "jungla-1.jpg", "url": "https://www.coverlambygrespania.com/wp-content/uploads/2026/02/agdgetdocdir2-920-scaled.jpg", "label": "Chapa integral"}}, "finishes": {"escovado": {"label": "Escovado · mate", "roughness": 0.78, "clearcoat": 0, "refs": {"A": "88JG52S"}, "catalogRefs": {"A": "88JG56S"}}}}, "iroko": {"label": "Iroko", "edge": "#947653", "books": {"A": {"file": "jungla-0.jpg", "url": "https://www.coverlambygrespania.com/wp-content/uploads/2026/04/agdgetdocdir2-869-scaled.jpg", "label": "Chapa integral"}}, "finishes": {"escovado": {"label": "Escovado · mate", "roughness": 0.78, "clearcoat": 0, "refs": {"A": "88JG22S"}, "catalogRefs": {"A": "88JG26S"}}}}, "roble": {"label": "Roble", "edge": "#998e7a", "books": {"A": {"file": "jungla-2.jpg", "url": "https://www.coverlambygrespania.com/wp-content/uploads/2026/02/agdgetdocdir2-923-scaled.jpg", "label": "Chapa integral"}}, "finishes": {"escovado": {"label": "Escovado · mate", "roughness": 0.78, "clearcoat": 0, "refs": {"A": "88JG72S"}, "catalogRefs": {"A": "88JG76S"}}}}}}, "moma": {"label": "Moma", "source": "https://www.coverlambygrespania.com/serie/moma/", "catalogSource": CAT, "catalogPages": "152–153", "slab": [1620, 3240], "thickness": 12, "tones": {"gris": {"label": "Gris", "edge": "#9f9d97", "books": {"A": {"file": "moma-0.jpg", "url": "https://www.coverlambygrespania.com/wp-content/uploads/2026/02/agdgetdocdir2-495-scaled.jpg", "label": "Chapa integral"}}, "finishes": {"natural": {"label": "Natural · mate", "roughness": 0.67, "clearcoat": 0, "refs": {"A": "88MM32S"}, "catalogRefs": {"A": "88MM36S"}}}}, "arena": {"label": "Arena", "edge": "#c0b8a8", "books": {"A": {"file": "moma-1.jpg", "url": "https://www.coverlambygrespania.com/wp-content/uploads/2026/04/agdgetdocdir2-455-scaled.jpg", "label": "Chapa integral"}}, "finishes": {"natural": {"label": "Natural · mate", "roughness": 0.67, "clearcoat": 0, "refs": {"A": "88MM02S"}, "catalogRefs": {"A": "88MM06S"}}}}}}};

/** A imagem da chapa servida pela aplicação (reduzida do original do fabricante a 640 × 1280; as duas Camargue convertidas de webp para jpg). */
export const ficheiroDaChapa = (file: string): string => `/prototipo/chapas/${file.replace(/\.webp$/, ".jpg")}`;
/** A chapa de omissão para um tampo do catálogo sem composição (a da composição de exemplo do HTML). */
export const CHAPA_OMISSAO = "canela-roma-A.jpg";

/* ------------------------------------------------------------------ a composição (cópia de `counterDefaults` do HTML) */
export interface ConfigBancada {
  series: string; tone: string; surface: string; length: number; depth: number; thickness: 12; cabinet: boolean;
  sink: string; hob: string; tap: string; sinkFinish: string; hobFinish: string; tapFinish: string; mount: "under" | "top";
  sinkX: number; hobX: number; reverse: boolean; upstand: number; back: boolean; left: boolean; right: boolean; book: string; direction: 0 | 180; textureOffset: number;
}
/** Os acabamentos do HTML têm outros ids nos lava-loiças (o «brushed» do Velar é o «inox» da família): a composição de exemplo usa os ids das famílias. */
export const BANCADA_OMISSAO: ConfigBancada = { series: "canela-roma", tone: "beige", surface: "natural", length: 2400, depth: 650, thickness: 12, cabinet: true, sink: "velar50", hob: "ib65b60", tap: "round", sinkFinish: "inox", hobFinish: "negro", tapFinish: "brushed", mount: "under", sinkX: 650, hobX: 1800, reverse: false, upstand: 40, back: true, left: true, right: true, book: "A", direction: 0, textureOffset: 45 };
/** A altura do topo da chapa ao chão (mm): o móvel do SketchUp tem 88,8 cm e a bancada fica a 90 cm. */
export const TOPO_BANCADA_MM = 900;

export function selecaoChapa(c: ConfigBancada): { series?: SerieChapa; tone?: TomChapa; finish?: AcabamentoChapa; book?: LivroChapa } {
  const series = SERIES_BANCADA[c.series], tone = series?.tones[c.tone], finish = tone?.finishes[c.surface], book = tone?.books[c.book];
  return { series, tone, finish, book };
}
/** `counterChangeMaterial`: muda série, tom ou acabamento, e cai no primeiro tom/acabamento/desenho que existam. */
export function mudarChapa(c: ConfigBancada, chave: "series" | "tone" | "surface", valor: string): ConfigBancada {
  const next = { ...c, [chave]: valor }, series = SERIES_BANCADA[next.series];
  if (!series) return c;
  if (!series.tones[next.tone]) next.tone = Object.keys(series.tones)[0];
  const tone = series.tones[next.tone];
  if (!tone.finishes[next.surface]) next.surface = Object.keys(tone.finishes)[0];
  if (!tone.books[next.book]) next.book = Object.keys(tone.books)[0];
  return next;
}

/* ------------------------------------------------------------------ os equipamentos (os modelos do HTML) */
type Par = number[];
interface Cuba { w: number; d: number; r?: number; left: number; top?: number }
export interface InfoLavaLoica {
  id: string; familia: Familia; outerWidth: number; outerDepth: number; outerRadius?: number; innerWidth?: number; radius?: number;
  bowls?: Cuba[]; duo: boolean; drainer: boolean; tapLedge: boolean; keran: boolean; una: boolean; ambar: boolean; reversible: boolean; tapAlignment?: "sink" | "bowls";
}
const ALINHAMENTO: Record<string, "sink" | "bowls"> = { keran116: "bowls", ambar116: "bowls", una75: "sink", duo80: "sink" };
const familiaDaMedida = (tipo: Familia["tipo"], medida: string): Familia | undefined => FAMILIAS.find((f) => f.tipo === tipo && f.medidas.some((m) => m.id === medida));

export function infoLavaLoica(id: string): InfoLavaLoica | null {
  const familia = familiaDaMedida("lava_loica", id);
  if (!familia) return null;
  const dim = familia.medidas.find((m) => m.id === id)?.dim ?? [50, 44, 20];
  const base = { id, familia, outerWidth: dim[0] * 10, outerDepth: dim[1] * 10, duo: false, drainer: false, tapLedge: false, keran: false, una: false, ambar: false, reversible: false, tapAlignment: ALINHAMENTO[id] };
  const v = VELAR_SPECS.find((s) => s.id === id); if (v) return { ...base, innerWidth: v.innerWidth, radius: 25 };
  const l = LODY_SPECS.find((s) => s.id === id); if (l) return { ...base, innerWidth: l.innerWidth, radius: l.radius };
  const a = AMBAR_SPECS.find((s) => s.id === id); if (a) return { ...base, outerWidth: a.outerWidth, outerDepth: a.outerDepth, ambar: true, drainer: !!a.drainer, tapLedge: !!a.tapLedge, bowls: a.bowls };
  const k = KERAN_SPECS.find((s) => s.id === id); if (k) return { ...base, outerWidth: k.outerWidth, outerDepth: 500, keran: true, reversible: true, bowls: k.bowls };
  const u = UNA_SPECS.find((s) => s.id === id); if (u) return { ...base, outerWidth: u.outerWidth, una: true, bowls: u.bowls };
  const c = CUBAS_SPECS.find((s) => s.id === id); if (c) return { ...base, outerWidth: c.outerWidth, outerDepth: c.outerDepth, outerRadius: c.outerRadius, duo: !!c.duo, bowls: c.bowls };
  return base;
}
export const infoPlaca = (id: string): SpecPlaca | undefined => HOB_SPECS.find((s) => s.id === id);
export const familiaDaPlaca = (id: string): Familia | undefined => familiaDaMedida("placa", id);
export const familiaDaTorneira = (id: string): Familia | undefined => FAMILIAS.find((f) => f.tipo === "torneira_cozinha" && f.id === id);
/** As torneiras com o modelo detalhado portado (as outras do HTML ainda não estão portadas e não entram na bancada). */
export const torneirasDaBancada = (): Familia[] => FAMILIAS.filter((f) => f.tipo === "torneira_cozinha" && ehModeloTorneira(f.id));
export const lavaLoicasDaBancada = (): { id: string; rotulo: string }[] =>
  FAMILIAS.filter((f) => f.tipo === "lava_loica").flatMap((f) => f.medidas.map((m) => ({ id: m.id, rotulo: `${f.marca} · ${f.nome.replace(/^Lava-loiça /, "").replace(/ \(demo\)$/, "")} · ${m.rotulo}` })));
export const placasDaBancada = (): { id: string; rotulo: string }[] => HOB_SPECS.map((s) => ({ id: s.id, rotulo: `${s.brand} · ${s.title}` }));
/** Os acabamentos de cada equipamento (os da família, só os que servem a medida). */
export function acabamentosDoEquipamento(qual: "sink" | "hob" | "tap", id: string): { id: string; nome: string }[] {
  const f = qual === "sink" ? infoLavaLoica(id)?.familia : qual === "hob" ? familiaDaPlaca(id) : familiaDaTorneira(id);
  return f ? acabamentosDaMedida(f, qual === "tap" ? undefined : id).map((a) => ({ id: a.id, nome: a.nome })) : [];
}

/** `counterAllowedMounts`: as Duo só por baixo; Keran, as de escorredor e a de plataforma para a torneira só por cima. */
export function montagensPermitidas(sinkId: string): ("under" | "top")[] {
  const s = infoLavaLoica(sinkId);
  if (!s) return ["under", "top"];
  return s.duo ? ["under"] : s.keran || s.drainer || s.tapLedge ? ["top"] : ["under", "top"];
}

/* ------------------------------------------------------------------ recortes e lugares (`counterPlacement`) */
function contornosDoLavaLoica(s: InfoLavaLoica, mount: "under" | "top"): Par[][] {
  if (mount === "top") return [roundLoop(s.outerWidth - 20, s.outerDepth - 20, Math.max(6, (s.outerRadius ?? 10) - 10), 24)];
  if (s.duo || s.una) return [roundLoop(s.outerWidth - (s.duo ? 50 : 40), s.outerDepth - (s.duo ? 50 : 40), s.duo ? 50 : 25, 24)];
  if (s.ambar && s.bowls) {
    // um rebaixo à volta das cubas (o `ambarRecess` do HTML, aproximado pelo rectângulo que as envolve)
    const x0 = Math.min(...s.bowls.map((b) => b.left)), x1 = Math.max(...s.bowls.map((b) => b.left + b.w)), z0 = Math.min(...s.bowls.map((b) => b.top ?? 20)), z1 = Math.max(...s.bowls.map((b) => (b.top ?? 20) + b.d));
    return [roundLoop(x1 - x0, z1 - z0, 15, 24).map(([x, z]) => [x - s.outerWidth / 2 + (x0 + x1) / 2, z - s.outerDepth / 2 + (z0 + z1) / 2])];
  }
  if (s.bowls) return s.bowls.map((b) => roundLoop(b.w, b.d, b.r ?? 25, 24).map(([x, z]) => [x - s.outerWidth / 2 + b.left + b.w / 2, z - s.outerDepth / 2 + (b.top ?? 20) + b.d / 2]));
  return [roundLoop(s.innerWidth ?? s.outerWidth - 40, 400, s.radius ?? 25, 24)];
}
export interface Colocacao {
  sink: InfoLavaLoica; hob: SpecPlaca; sx: number; hx: number; sz: number; tx: number; tz: number;
  holes: Par[][]; sinkHoles: Par[][]; hobHole: Par[]; tapHole: Par[];
}
export function colocacao(c: ConfigBancada): Colocacao | null {
  const sink = infoLavaLoica(c.sink), hob = infoPlaca(c.hob);
  if (!sink || !hob) return null;
  const sign = c.reverse ? -1 : 1, sx = c.sinkX - c.length / 2, hx = c.hobX - c.length / 2, sz = 25;
  const sinkHoles = contornosDoLavaLoica(sink, c.mount).map((l) => l.map(([x, z]) => [sx + x * sign, sz + z * sign]));
  const b = sink.bowls?.[0];
  let tapOffset = b ? -sink.outerWidth / 2 + b.left + b.w / 2 : 0;
  if (sink.tapAlignment === "sink") tapOffset = 0;
  else if (sink.tapAlignment === "bowls" && sink.bowls) tapOffset = (Math.min(...sink.bowls.map((q) => q.left)) + Math.max(...sink.bowls.map((q) => q.left + q.w))) / 2 - sink.outerWidth / 2;
  const tx = sx + tapOffset * sign, tz = -c.depth / 2 + 70;
  const hobHole = roundLoop(hob.cut[0], hob.cut[1], ["thp642", "gmwl958"].includes(hob.id) ? 7 : 6, 24).map(([x, z]) => [x + hx, z]);
  const tapHole = Array.from({ length: 48 }, (_, i) => [tx + 17.5 * Math.cos((i / 48) * Math.PI * 2), tz + 17.5 * Math.sin((i / 48) * Math.PI * 2)]);
  return { sink, hob, sx, hx, sz, tx, tz, holes: [...sinkHoles, hobHole, tapHole], sinkHoles, hobHole, tapHole };
}
const limitesDe = (loop: Par[]) => ({ minX: Math.min(...loop.map((p) => p[0])), maxX: Math.max(...loop.map((p) => p[0])), minZ: Math.min(...loop.map((p) => p[1])), maxZ: Math.max(...loop.map((p) => p[1])) });

/** `validateCounter`: devolve a mensagem do HTML, ou "" se a composição serve. */
export function validarBancada(c: ConfigBancada): string {
  const m = selecaoChapa(c);
  if (!m.series || !m.tone || !m.finish || !m.book || !m.finish.refs[c.book]) return "Escolhe uma combinação de série, tom e acabamento disponível em 12 mm.";
  for (const k of ["length", "depth", "sinkX", "hobX", "upstand", "textureOffset", "direction"] as const) if (!Number.isFinite(c[k])) return "Introduz medidas válidas.";
  if (c.length < 1600 || c.length > 3200 || c.depth < 600 || c.depth > 1200) return "Usa um comprimento entre 160 e 320 cm e profundidade entre 60 e 120 cm.";
  if (c.upstand < 0 || c.upstand > 200) return "As bancadas usam sempre 12 mm de espessura e rodatampo entre 0 e 20 cm.";
  if (c.textureOffset < 0 || c.textureOffset > 100 || ![0, 180].includes(c.direction)) return "Escolhe uma faixa e um sentido válidos para a chapa.";
  const p = colocacao(c);
  if (!p || !familiaDaTorneira(c.tap)) return "Escolhe equipamentos do catálogo.";
  if (!montagensPermitidas(c.sink).includes(c.mount)) return "Esta montagem não está prevista para o lava-loiça escolhido.";
  for (const [q, id, ac] of [["sink", c.sink, c.sinkFinish], ["hob", c.hob, c.hobFinish], ["tap", c.tap, c.tapFinish]] as const) if (!acabamentosDoEquipamento(q, id).some((a) => a.id === ac)) return "Escolhe um acabamento disponível.";
  for (const loop of p.holes) { const b = limitesDe(loop); if (b.minX < -c.length / 2 + 50 - 0.01 || b.maxX > c.length / 2 - 50 + 0.01 || b.minZ < -c.depth / 2 + 50 - 0.01 || b.maxZ > c.depth / 2 - 50 + 0.01) return "Mantém pelo menos 5 cm entre os recortes e as extremidades da bancada."; }
  const gap = Math.abs(c.sinkX - c.hobX) - (p.sink.outerWidth + p.hob.outerWidth) / 2;
  if (gap < 50) return "Afasta o lava-loiça e a placa: deixa pelo menos 5 cm livres entre os equipamentos.";
  for (const [x, w, d, z] of [[p.sx, p.sink.outerWidth, p.sink.outerDepth, p.sz], [p.hx, p.hob.outerWidth, p.hob.outerDepth, 0]]) if (Math.abs(x) + w / 2 > c.length / 2 - 20 || Math.abs(z) + d / 2 > c.depth / 2 - 20) return "O equipamento ultrapassa a área disponível. Aumenta a bancada ou ajusta a posição.";
  const rear = Math.min(...p.sinkHoles.flat().map((q) => q[1]));
  if (rear - (p.tz + 17.5) < 50) return "Aumenta a profundidade para deixar espaço para a torneira atrás do lava-loiça.";
  if (p.tz + 30 > p.sz - p.sink.outerDepth / 2) return "Aumenta a profundidade: a base da torneira toca na aba do lava-loiça.";
  return "";
}

/** `counterAuto` («Distribuir»): alarga a bancada se for preciso e afasta os equipamentos, com a profundidade que a torneira pede. */
export function distribuir(entrada: ConfigBancada): ConfigBancada {
  const c = { ...entrada }, s = infoLavaLoica(c.sink), h = infoPlaca(c.hob);
  if (!s || !h) return c;
  c.length = Math.max(c.length, Math.ceil((s.outerWidth + h.outerWidth + 250) / 10) * 10);
  const leftSink = c.sinkX <= c.hobX, lo = s.outerWidth / 2 + 90, hi = c.length - h.outerWidth / 2 - 90;
  if (leftSink) { c.sinkX = Math.max(lo, Math.min(c.length * 0.27, hi - h.outerWidth / 2 - 80 - s.outerWidth / 2)); c.hobX = Math.max(c.length * 0.75, c.sinkX + (s.outerWidth + h.outerWidth) / 2 + 80); c.hobX = Math.min(hi, c.hobX); }
  else { c.hobX = Math.max(h.outerWidth / 2 + 90, c.length * 0.25); c.sinkX = Math.min(c.length - s.outerWidth / 2 - 90, Math.max(c.length * 0.73, c.hobX + (s.outerWidth + h.outerWidth) / 2 + 80)); }
  c.sinkX = Math.round(c.sinkX / 10) * 10; c.hobX = Math.round(c.hobX / 10) * 10;
  const p = colocacao(c);
  if (!p) return c;
  const bb = limitesDe(p.sinkHoles.flat());
  const required = Math.max(600, 2 * bb.maxZ + 104, 104 - 2 * bb.minZ, 275 - 2 * bb.minZ, s.outerDepth + 150);
  c.depth = Math.max(c.depth, Math.ceil(required / 10) * 10);
  return c;
}
/** «Trocar lados ⇄»: espelha as posições e redistribui (como o HTML). */
export const trocarLados = (c: ConfigBancada): ConfigBancada => distribuir({ ...c, sinkX: c.length - c.sinkX, hobX: c.length - c.hobX });
/** Trocar um equipamento: mantém o acabamento se servir, senão o primeiro; o lava-loiça leva a primeira montagem permitida; redistribui. */
export function trocarEquipamento(c: ConfigBancada, qual: "sink" | "hob" | "tap", id: string): ConfigBancada {
  const chave = qual === "sink" ? "sinkFinish" : qual === "hob" ? "hobFinish" : "tapFinish";
  const acabs = acabamentosDoEquipamento(qual, id), next: ConfigBancada = { ...c, [qual]: id };
  next[chave] = acabs.some((a) => a.id === c[chave]) ? c[chave] : acabs[0]?.id ?? c[chave];
  if (qual === "sink") { const m = montagensPermitidas(id); next.mount = m.includes(c.mount) ? c.mount : m[0]; next.reverse = false; }
  return distribuir(next);
}

/* ------------------------------------------------------------------ vistas (`counterPresets`, em mm no referencial da bancada; y = 0 no topo da chapa) */
export type VistaBancada = "three" | "side" | "front" | "back" | "top" | "detail";
export const VISTAS_BANCADA: { id: VistaBancada; nome: string }[] = [
  { id: "three", nome: "Perspetiva ¾" }, { id: "side", nome: "Perfil" }, { id: "front", nome: "Frente" }, { id: "back", nome: "Traseira" }, { id: "top", nome: "De cima" }, { id: "detail", nome: "Detalhe da bica" },
];
export function presetDaVista(c: ConfigBancada, v: VistaBancada): { p: [number, number, number]; t: [number, number, number] } {
  const s = c.length * 1.05, t: [number, number, number] = [0, -230, 0];
  switch (v) {
    case "top": return { p: [0, s * 1.3, 1], t: [0, 0, 0] };
    case "front": return { p: [0, s * 0.14, s * 1.25], t };
    case "back": return { p: [0, s * 0.42, -s * 1.2], t };
    case "side": return { p: [s * 0.9, s * 0.25, s * 0.15], t };
    case "detail": return { p: [c.sinkX - c.length / 2 + 330, 650, 700], t: [c.sinkX - c.length / 2, -40, -30] };
    default: return { p: [s * 0.27, s * 0.42, s * 1.12], t };
  }
}

/* ------------------------------------------------------------------ a bancada como peça da planta e como produto 3D */
export const nomeDaBancada = (c: ConfigBancada): string => { const { series, tone } = selecaoChapa(c); return `Bancada ${series?.label ?? ""} · ${tone?.label ?? ""}`; };
/** A peça da planta (cm): a caixa é o comprimento × a profundidade, encostada com as costas para cima (rot 0 = frente para baixo). */
export function pecaBancada(id: string, canto: { x: number; y: number }, c: ConfigBancada = BANCADA_OMISSAO): PecaPlanta {
  return { id, tipo: "movel", x: canto.x, y: canto.y, w: c.length / 10, h: c.depth / 10, rot: 0, mont: "chao", alt: 0, esp: false, nome: nomeDaBancada(c), dh: (TOPO_BANCADA_MM + c.upstand) / 10, banc: c };
}
/** Muda a composição de uma peça de bancada: o comprimento e a profundidade passam para a caixa, mantendo o centro. */
export function aplicarConfig(p: PecaPlanta, c: ConfigBancada): PecaPlanta {
  const w = c.length / 10, h = c.depth / 10, cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  return { ...p, banc: c, w, h, x: Math.round((cx - w / 2) * 10) / 10, y: Math.round((cy - h / 2) * 10) / 10, nome: nomeDaBancada(c), dh: (TOPO_BANCADA_MM + c.upstand) / 10 };
}
export function modeloDaBancada(pecaId: string, c: ConfigBancada): ProdutoModelo3D {
  const altura = (TOPO_BANCADA_MM + c.upstand) / 1000;
  return {
    produtoId: `bancada|${pecaId}`, nome: nomeDaBancada(c), tipo: "tampo", dimensoes: { larguraCm: c.length / 10, profundidadeCm: c.depth / 10, alturaCm: altura * 100, deNome: false },
    mockup3d: { tipo: "tampo", largura: c.length / 1000, profundidade: c.depth / 1000, altura, cor: selecaoChapa(c).tone?.edge ?? "#d8d1bb", params: { k: "bancada", cfg: c } },
    marca: "Coverlam Top", categoria: "Bancada", montagem: "chao", alturaOmissao: 0, demo: true,
  };
}

/* ------------------------------------------------------------------ venda: cada equipamento é uma linha à parte */
export interface LinhaBancada { papel: "chapa" | "lavaloica" | "placa" | "torneira" | "movel"; nome: string; sku?: string; preco?: number }
export function linhasDaBancada(c: ConfigBancada): LinhaBancada[] {
  const { series, tone, finish, book } = selecaoChapa(c), out: LinhaBancada[] = [];
  if (series && tone && finish && book) out.push({ papel: "chapa", nome: `Bancada Coverlam Top 12 mm · ${series.label} · ${tone.label} · ${finish.label} · ${book.label} · ${c.length / 10} × ${c.depth / 10} cm${c.upstand ? ` · rodatampo ${c.upstand / 10} cm` : ""}`, sku: finish.refs[c.book] });
  const s = infoLavaLoica(c.sink);
  if (s) { const v = resolverVariante(s.familia, c.sink, c.sinkFinish); out.push({ papel: "lavaloica", nome: `${v.nome} · ${c.mount === "under" ? "por baixo" : "por cima"}`, sku: v.sku, preco: v.preco }); }
  const hf = familiaDaPlaca(c.hob);
  if (hf) { const v = resolverVariante(hf, c.hob, c.hobFinish); out.push({ papel: "placa", nome: v.nome, sku: v.sku, preco: v.preco }); }
  const tf = familiaDaTorneira(c.tap);
  if (tf) { const v = resolverVariante(tf, undefined, c.tapFinish); out.push({ papel: "torneira", nome: v.nome, sku: v.sku, preco: v.preco }); }
  if (c.cabinet) { const mf = FAMILIAS.find((f) => f.id === "movel_base"); if (mf) { const v = resolverVariante(mf); out.push({ papel: "movel", nome: `${v.nome} · ${c.length / 10} cm`, sku: v.sku, preco: v.preco }); } }
  return out;
}
