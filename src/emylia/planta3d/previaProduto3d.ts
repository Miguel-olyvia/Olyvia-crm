// 23/11: a pré-visualização 3D de um produto no formulário de criar e na ficha (só para ver). Funções puras, sem React nem three:
// as medidas e a cor que vêm dos atributos do produto, o modelo do catálogo 3D com essas medidas, o estado do modelo (o que se vai ver)
// e a cena mínima: uma divisão pequena com a peça ao centro e a câmara a apontar-lhe.
import type { AtributoDef, AtributoProduto, DimensaoMedida } from "../v2/catalogoModelo";
import { modeloDoProduto, temModeloGenerico, temModeloHtml, type NoCat, type ProdutoModelo3D } from "./catalogo3d";
import { espacoVazio, paredesDoContorno, PE_DIREITO_OMISSAO, type Espaco, type PecaProduto } from "./modelo";

/** As medidas que os atributos dizem, em cm; o que não dizem fica de fora (vem do nome ou das omissões do tipo). */
export interface MedidasParciais { larguraCm?: number; profundidadeCm?: number; alturaCm?: number }

/** Acima disto (cm) uma medida não é de um produto de catálogo: é um engano de unidade e não se desenha. */
const MAX_CM = 1000;
const ARREDONDAR = (cm: number) => Math.round(cm * 10) / 10;

/** Uma dimensão em cm: o número, ou o limite superior (`ate`) de um intervalo; mm passa a cm. Ilegível (0, negativa, NaN, enorme): undefined. */
function emCm(d: DimensaoMedida | null | undefined, unidade: "cm" | "mm"): number | undefined {
  const v = typeof d === "number" ? d : d && typeof d === "object" ? d.ate : Number.NaN;
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return undefined;
  const cm = ARREDONDAR(unidade === "mm" ? v / 10 : v);
  return cm > 0 && cm <= MAX_CM ? cm : undefined;
}

/**
 * A medida do produto (o atributo do tipo «medida») em centímetros, para a peça 3D. 2D: largura × comprimento (a profundidade); 3D: mais a espessura,
 * que é a altura. 1D: a largura ou o comprimento dá a largura, a altura dá a altura, a espessura não diz nada. Sem medida legível: null.
 */
export function medidasDosAtributos(attrs: readonly AtributoProduto[] | undefined): MedidasParciais | null {
  const m = attrs?.find((a) => a.medida)?.medida;
  if (!m) return null;
  const r: MedidasParciais = {};
  if (m.tipo === "1D") {
    const v = emCm(m.valor, m.unidade);
    if (v !== undefined && (m.dimensao === "largura" || m.dimensao === "comprimento")) r.larguraCm = v;
    else if (v !== undefined && m.dimensao === "altura") r.alturaCm = v;
  } else {
    const l = emCm(m.largura, m.unidade), p = emCm(m.comprimento, m.unidade), a = emCm(m.espessura, m.unidade);
    if (l !== undefined) r.larguraCm = l;
    if (p !== undefined) r.profundidadeCm = p;
    if (a !== undefined) r.alturaCm = a;
  }
  return Object.keys(r).length ? r : null;
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
/** A cor (hex) da opção escolhida no atributo «cor»; sem atributo, sem definição, sem amostra ou com um hex inválido: undefined. */
export function corDosAtributos(attrs: readonly AtributoProduto[] | undefined, defs: readonly AtributoDef[] | undefined): string | undefined {
  const def = defs?.find((d) => d.codigo.toLowerCase() === "cor");
  const escolhido = def && attrs?.find((a) => a.atributoId === def.id && a.opcaoId);
  const hex = escolhido ? def.opcoes.find((o) => o.id === escolhido.opcaoId)?.hex : null;
  return hex && HEX.test(hex) ? hex : undefined;
}

export interface EntradaPrevia { nome: string; sub?: string; no: string | null; arvore: readonly NoCat[]; medidas?: MedidasParciais | null; cor?: string }
const ID_PREVIA = "previa-produto";

/**
 * O modelo do catálogo 3D do produto que se está a escrever: o classificador de sempre (pela subcategoria, pelo nome e pelo ramo da árvore), com as
 * medidas dos atributos por cima das do nome (o que os atributos não dizem vem do nome ou das omissões do tipo) e a cor do atributo Cor, que o
 * classificador não lê.
 */
export function modeloParaPrevia({ nome, sub, no, arvore, medidas, cor }: EntradaPrevia): ProdutoModelo3D {
  const p = { id: ID_PREVIA, n: nome.trim(), sub: sub?.trim() || undefined, no };
  let m = modeloDoProduto(p, arvore);
  if (medidas && Object.keys(medidas).length) {
    const d = m.dimensoes;
    m = modeloDoProduto({ ...p, dim: [medidas.larguraCm ?? d.larguraCm, medidas.profundidadeCm ?? d.profundidadeCm, medidas.alturaCm ?? d.alturaCm] }, arvore);
  }
  return cor ? { ...m, mockup3d: { ...m.mockup3d, cor } } : m;
}

/**
 * O que a pré-visualização mostra: o modelo exacto do HTML (lava-loiça, placa, torneira), o genérico da categoria, um desenho aproximado do tipo (sem
 * genérico nem modelo do HTML) ou só a caixa cinzenta com as medidas (o tipo «caixa»: o classificador não reconheceu nada).
 */
export type EstadoPrevia = "html" | "generico" | "aproximado" | "caixa";
export function estadoDoModelo(m: ProdutoModelo3D): EstadoPrevia {
  if (temModeloHtml(m)) return "html";
  if (temModeloGenerico(m)) return "generico";
  return m.tipo === "caixa" ? "caixa" : "aproximado";
}

type V3 = [number, number, number];
export interface CenaProduto { espaco: Espaco; modelos: Record<string, ProdutoModelo3D>; camara: { chave: string; pos: V3; alvo: V3 } }

const FOLGA_M = 1, LADO_MIN_M = 1.5, FOLGA_PE_DIREITO_M = 0.3, DIST_MIN_M = 1, DIST_MAX_M = 12;
/** A direcção de onde a câmara olha (a mesma diagonal da vista 3D do visualizador: de frente e de lado, um pouco por cima). */
const DIRECAO: V3 = [1, 0.6, 1];

/**
 * A cena mínima de um produto: uma divisão quadrada (o visualizador precisa de quatro paredes, e as que ficam entre a câmara e a peça escondem-se
 * sozinhas) com a peça ao centro, e uma câmara explícita que enquadra o tamanho dela (uma torneira e um roupeiro ficam do mesmo tamanho no ecrã).
 * A chave da câmara depende só das medidas: escrever o nome não a refaz, mudar as medidas sim.
 */
export function cenaDoProduto(m: ProdutoModelo3D): CenaProduto {
  const w = m.dimensoes.larguraCm / 100, p = m.dimensoes.profundidadeCm / 100, a = m.dimensoes.alturaCm / 100;
  const base = m.montagem === "parede" ? m.alturaOmissao : 0;
  const lado = Math.max(LADO_MIN_M, Math.max(w, p) + FOLGA_M), centro = lado / 2;
  const peca: PecaProduto = { id: ID_PREVIA, produtoId: m.produtoId, x: centro, y: centro, rotacao: 0, paredeEncosto: null, largura: w, profundidade: p, montagem: m.montagem, altura: base, espelhada: false, nome: m.nome };
  const vazio = espacoVazio("outro", m.nome || "Produto");
  const espaco: Espaco = {
    ...vazio, peDireito: Math.max(PE_DIREITO_OMISSAO, base + a + FOLGA_PE_DIREITO_M),
    paredes: paredesDoContorno([{ x: 0, y: 0 }, { x: lado, y: 0 }, { x: lado, y: lado }, { x: 0, y: lado }]), pecas: [peca],
  };
  const alvo: V3 = [centro, base + a / 2, centro];
  const dist = Math.min(DIST_MAX_M, Math.max(DIST_MIN_M, Math.max(w, p, a) * 2.4 + 0.5));
  const norma = Math.hypot(...DIRECAO), k = dist / norma;
  const pos: V3 = [alvo[0] + DIRECAO[0] * k, alvo[1] + DIRECAO[1] * k, alvo[2] + DIRECAO[2] * k];
  const chave = [w, p, a, base].map((v) => Math.round(v * 100)).join("x");
  return { espaco, modelos: { [m.produtoId]: m }, camara: { chave, pos, alvo } };
}
