// 24/11 (fase 1, só ecrã): os EIXOS da Medida. A Medida de um produto tem três campos (largura, comprimento, espessura) e o 3D precisa de largura, altura e profundidade.
// Qual campo é qual depende do tipo (como o classificador faz com os números do nome); aqui essa regra de hoje passa a ser DADOS (`eixosPorOmissao`), para se poder escolher
// outra à mão no painel «Medidas». A escolha só se vê (não grava): a gravação por produto, subcategoria e categoria vem na fase 2, e a regra por tipo fica só a omissão.
// Sem React nem three.
import { COMPRIMENTO_NA_ALTURA, type TipoMockup } from "./catalogo3d";

/** Os três campos da Medida, pela ordem em que aparecem no formulário. */
export const CAMPOS_MEDIDA = ["largura", "comprimento", "espessura"] as const;
export type CampoMedida = (typeof CAMPOS_MEDIDA)[number];
/** Os três eixos da peça no 3D. */
export const EIXOS_PECA = ["largura", "altura", "profundidade"] as const;
export type EixoPeca = (typeof EIXOS_PECA)[number];
/** Que campo da Medida dá cada eixo da peça: uma permutação dos três campos (cada campo serve um só eixo). */
export type Eixos = Readonly<Record<EixoPeca, CampoMedida>>;
/** Os valores da Medida em cm que interessam aos eixos (o 1D «altura» à parte: serve de reserva da altura). */
export interface ValoresMedida { largura?: number; comprimento?: number; espessura?: number; altura?: number }

const DE_PE: Eixos = { largura: "largura", altura: "comprimento", profundidade: "espessura" };
const DEITADO: Eixos = { largura: "largura", altura: "espessura", profundidade: "comprimento" };

/**
 * A regra de hoje, por tipo, como eixos: nas peças de COMPRIMENTO_NA_ALTURA (móveis, colunas, armários, espelho, roupeiro…) o comprimento é a altura e a espessura a profundidade;
 * nas outras (tampo, bancada, lavatório…) o comprimento é a profundidade e a espessura a altura. A base de duche e a banheira escolhem pela medida: o MAIOR lado é a largura e o
 * menor a profundidade, e a espessura é a altura (sem medida, ou com um lado só, fica o campo `largura` como largura; com um lado só, é esse o que dá a largura).
 */
export function eixosPorOmissao(tipo: TipoMockup, medida?: ValoresMedida | null): Eixos {
  if (tipo === "base_duche" || tipo === "banheira") {
    const l = medida?.largura, c = medida?.comprimento;
    // só o comprimento, ou o comprimento maior do que a largura: o comprimento é a largura da peça
    const compridoNaLargura = c !== undefined && (l === undefined || c > l);
    return compridoNaLargura ? { largura: "comprimento", altura: "espessura", profundidade: "largura" } : { largura: "largura", altura: "espessura", profundidade: "comprimento" };
  }
  return COMPRIMENTO_NA_ALTURA.includes(tipo) ? DE_PE : DEITADO;
}

/** Os eixos se forem uma permutação dos três campos (cada campo uma só vez); senão null. Aceita `unknown` (o que vier de fora). */
export function validarEixos(x: unknown): Eixos | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const campos = EIXOS_PECA.map((e) => o[e]);
  if (!campos.every((c): c is CampoMedida => (CAMPOS_MEDIDA as readonly unknown[]).includes(c))) return null;
  if (new Set(campos).size !== 3) return null;
  return { largura: campos[0], altura: campos[1], profundidade: campos[2] };
}

/** Escolhe `campo` para `eixo`; se outro eixo já o usava, esse fica com o campo que `eixo` tinha (os dois trocam), e o resultado é sempre uma permutação válida. */
export function trocarEixo(eixos: Eixos, eixo: EixoPeca, campo: CampoMedida): Eixos {
  const antigo = eixos[eixo];
  if (antigo === campo) return eixos;
  const outro = EIXOS_PECA.find((e) => e !== eixo && eixos[e] === campo);
  return { ...eixos, [eixo]: campo, ...(outro ? { [outro]: antigo } : {}) };
}

const ARTIGO_CAMPO: Record<CampoMedida, string> = { largura: "a largura", comprimento: "o comprimento", espessura: "a espessura" };
/**
 * O aviso (para o ecrã e para leitores de ecrã) de que escolher `eixo` trocou dois eixos: «A profundidade passou a usar «comprimento», porque a espessura já estava em uso.»
 * `antes` e `depois` são os eixos de antes e de depois de `trocarEixo`; sem troca (nenhum outro eixo mudou): null.
 */
export function notaDaTroca(antes: Eixos, depois: Eixos, eixo: EixoPeca): string | null {
  const outro = EIXOS_PECA.find((e) => e !== eixo && depois[e] !== antes[e]);
  if (!outro) return null;
  return `A ${outro} passou a usar «${depois[outro]}», porque ${ARTIGO_CAMPO[depois[eixo]]} já estava em uso.`;
}

/** A Medida só tem painel de eixos com pelo menos dois dos três campos (2D ou 3D): com um só (1D) não há nada a repartir. */
export const temCamposParaEixos = (m: ValoresMedida | null | undefined): boolean => !!m && CAMPOS_MEDIDA.filter((c) => m[c] !== undefined).length >= 2;

const nf = (cm: number): string => (Math.round(cm * 10) / 10).toLocaleString("pt-PT", { maximumFractionDigits: 1 });
/** O texto de uma medida em cm para os rótulos: «40», «87,5». */
export const textoDeCm = nf;
/** A linha de texto equivalente às cotas (para leitores de ecrã): «L 40 · A 160 · P 25 cm». */
export function textoDasMedidas(d: { larguraCm: number; alturaCm: number; profundidadeCm: number }): string {
  return `L ${nf(d.larguraCm)} · A ${nf(d.alturaCm)} · P ${nf(d.profundidadeCm)} cm`;
}
