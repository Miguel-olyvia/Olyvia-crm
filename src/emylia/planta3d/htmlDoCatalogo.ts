// Protótipo (visualizador 3D): um PRODUTO DO CATÁLOGO real (lista «Produtos do catálogo») passa a usar o MESMO modelo do HTML «Torneiras e
// Lava-loiças · Catálogo 3D», escolhido pelo nome e pela medida: «Lava-louças VELAR 1 CUBA 50» = Frasa Velar 50 U/F; «Placa DE INDUÇÃO INDESIT» =
// Indesit IB 65B60 NE; «Misturadoras Monocomando Extraível ROUND» = GME IO Round; «Bancada de Cozinha CANELA ROMA … 1/2» = chapa Coverlam Canela Roma
// Beige. As medidas passam a ser as do modelo (não as de omissão). `exacto: false` diz que o HTML não tem esse produto e se usa o mais parecido
// (fica na lista de «sem modelo no HTML»). Sem three: corre na lista de produtos. Funções puras.
import { AMBAR_SPECS, CUBAS_SPECS, HOB_SPECS, KERAN_SPECS, LODY_SPECS, MEDIDAS_TORNEIRA, UNA_SPECS, VELAR_SPECS, type ModeloTorneira } from "./modelosHtml/specs";

export type EscolhaHtml =
  | { tipo: "lava_loica"; modelo: string; acab: string; exacto: boolean; dim: [number, number, number] }
  | { tipo: "placa"; modelo: string; acab: string; exacto: boolean; dim: [number, number, number] }
  | { tipo: "torneira_cozinha"; modelo: ModeloTorneira; acab: string; exacto: true; dim: [number, number, number] }
  | { tipo: "tampo"; series: string; tone: string; exacto: true };

const sem = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const numeros = (s: string): number[] => (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
/** O primeiro número do nome que é uma das medidas dadas. */
const medida = (s: string, validas: readonly number[]): number | undefined => numeros(s).find((n) => validas.includes(n));
const cm = (mm: number) => Math.round(mm) / 10;

/* ------------------------------------------------------------------ lava-loiças */
function dimLava(id: string): [number, number, number] | null {
  const v = VELAR_SPECS.find((s) => s.id === id) ?? LODY_SPECS.find((s) => s.id === id);
  if (v) return [cm(v.outerWidth), 44, 20];
  const a = AMBAR_SPECS.find((s) => s.id === id);
  if (a) return [cm(a.outerWidth), cm(a.outerDepth), cm(Math.max(...a.bowls.map((b) => b.depth)))];
  const k = KERAN_SPECS.find((s) => s.id === id);
  if (k) return [cm(k.outerWidth), 50, cm(Math.max(...k.bowls.map((b) => b.depth)))];
  const u = UNA_SPECS.find((s) => s.id === id);
  if (u) return [cm(u.outerWidth), 44, cm(Math.max(...u.bowls.map((b) => b.depth)))];
  const c = CUBAS_SPECS.find((s) => s.id === id);
  if (c) return [cm(c.outerWidth), cm(c.outerDepth), cm(Math.max(...c.bowls.map((b) => b.depth)))];
  return null;
}
function lavaLoica(s: string): EscolhaHtml | null {
  const pronto = (modelo: string, acab: string, exacto = true): EscolhaHtml | null => { const dim = dimLava(modelo); return dim ? { tipo: "lava_loica", modelo, acab, exacto, dim } : null; };
  if (/\bvelar\b/.test(s)) { const n = medida(s, [34, 40, 45, 50, 70, 71]); return n ? pronto(`velar${n === 70 ? 71 : n}`, "inox") : null; }
  if (/\blody\b/.test(s)) { const n = medida(s, [40, 50, 70]); return n ? pronto(`lody${n}`, "oro") : null; }
  if (/\bambar\b/.test(s)) {
    const n = medida(s, [40, 50, 55, 57, 70, 80, 86, 100, 105, 116]);
    return n ? pronto(`ambar${n}${new RegExp(`\\b${n} n\\b`).test(s) ? "n" : ""}`, "negro") : null;
  }
  if (/\bkeran\b/.test(s)) { const n = medida(s, [80, 86, 100, 116]); return n ? pronto(`keran${n}`, "inox") : null; }
  if (/\buna\b/.test(s)) { const n = medida(s, [55, 75]); return n ? pronto(`una${n}`, "inox") : null; }
  if (/\bduo\b/.test(s)) { const n = medida(s, [60, 80]); return n ? pronto(`duo${n}`, "inox") : null; }
  for (const id of ["bahia", "belem", "brasilia", "laguna"]) if (new RegExp(`\\b${id}\\b`).test(s)) return pronto(id, "inox");
  // o HTML não tem este lava-loiça: o modelo do HTML mais parecido (inox com escorredor, ou uma cuba da largura mais próxima)
  const larg = medida(s, numeros(s).filter((x) => x >= 30 && x <= 120));
  if (/escorredor|86 ?cm|\b86\b/.test(s)) return pronto("keran86", "inox", false);
  const v = VELAR_SPECS.reduce((a, b) => (Math.abs(b.size - (larg ?? 50)) < Math.abs(a.size - (larg ?? 50)) ? b : a));
  return pronto(v.id, "inox", false);
}

/* ------------------------------------------------------------------ placas */
function placa(s: string): EscolhaHtml | null {
  const pronto = (modelo: string, acab: string, exacto = true): EscolhaHtml | null => {
    const h = HOB_SPECS.find((x) => x.id === modelo);
    return h ? { tipo: "placa", modelo, acab, exacto, dim: [cm(h.outerWidth), cm(h.outerDepth), cm(h.plate + (h.above ?? 0))] } : null;
  };
  const indesit = /indesit/.test(s), whirl = /whirpool|whirlpool/.test(s);
  if (/teka/.test(s)) return pronto(/\b90\b/.test(s) ? "gmwl958" : "ing61t", /\b90\b/.test(s) ? "inox" : "negro", false);
  if (/exaustor/.test(s)) return pronto("ib65b60", "negro", false);
  if (/inducao/.test(s)) return pronto(whirl ? "wlb1160" : "ib65b60", "negro", indesit || whirl);
  if (/vitro/.test(s)) return pronto(whirl ? "akt8090" : "ri161", "negro", indesit || whirl);
  if (/gas/.test(s)) {
    if (whirl) return pronto(/\b90\b/.test(s) ? "gmwl958" : "gmal6422", "inox");
    if (/preto|negro/.test(s)) return pronto("ing61t", "negro", indesit);
    if (/branco|blanco/.test(s)) return pronto("ing61t", "blanco", indesit);
    return pronto("thp642", "inox", indesit);
  }
  return null;
}

/* ------------------------------------------------------------------ torneiras de cozinha (só as que estão portadas) */
/** O acabamento de omissão de cada torneira (o `rememberedFinish` do HTML; o Noah e o Round abrem em escovado). */
const ACAB_TORNEIRA: Record<ModeloTorneira, string> = { round: "brushed", noah: "brushed", smooth: "chrome", stick: "negro", cira: "chrome", alexia: "chrome", granada: "negro" };
function torneira(s: string): EscolhaHtml | null {
  for (const m of Object.keys(MEDIDAS_TORNEIRA) as ModeloTorneira[]) {
    if (!new RegExp(`\\b${m}\\b`).test(s)) continue;
    const t = MEDIDAS_TORNEIRA[m];
    return { tipo: "torneira_cozinha", modelo: m, acab: ACAB_TORNEIRA[m], exacto: true, dim: [cm(t.base), cm(t.alcance + t.base / 2), cm(t.altura)] };
  }
  return null;
}

/* ------------------------------------------------------------------ tampos (as séries Coverlam do HTML) */
const SERIES: [RegExp, string, string][] = [
  [/canela roma/, "canela-roma", "beige"], [/nero ardi/, "nero-ardi", "negro"], [/blue roma/, "blue-roma", "cielo"], [/(camargue|carmague) arena/, "camargue", "arena"],
  [/(camargue|carmague) blanco/, "camargue", "blanco"], [/capraia/, "capraia", "blanco"], [/calacata vaglie/, "calacata-vaglie", "blanco"], [/jungla abeto/, "jungla", "abeto"],
  [/jungla cipres/, "jungla", "cipres"], [/jungla iroko/, "jungla", "iroko"], [/jungla roble/, "jungla", "roble"], [/moma gris/, "moma", "gris"], [/moma arena/, "moma", "arena"],
];
function tampo(s: string): EscolhaHtml | null {
  for (const [re, series, tone] of SERIES) if (re.test(s)) return { tipo: "tampo", series, tone, exacto: true };
  return null;
}

/** As misturadoras de lava-loiça do catálogo (o sub-ofício «Misturadoras Monocomando…»): são torneiras de cozinha, sobre a bancada. */
export const ehMisturadoraDeCozinha = (nome: string, sub = ""): boolean => /^misturadoras? monocomando/.test(sem(sub)) || /lava[ -]?lo[iu]ca/.test(sem(nome)) && /monocomando|misturadora/.test(sem(nome));

/** O modelo do HTML de um produto do catálogo (pelo tipo e pelo nome), ou null se o HTML não tem nada deste tipo. */
export function modeloHtmlDoProduto(nome: string, tipo: string): EscolhaHtml | null {
  const s = sem(nome);
  if (tipo === "lava_loica") return lavaLoica(s);
  if (tipo === "placa") return placa(s);
  if (tipo === "torneira_cozinha") return torneira(s);
  if (tipo === "bancada" || tipo === "tampo") return tampo(s);
  return null;
}
