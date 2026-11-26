// 26/11: o que o 3D (Previa3DProduto) recebe do produto escolhido na vista da família, a partir da leitura cat_ler_familia_vista: a cor (hex) do eixo de cor, a foto da
// opção como textura, a medida (cm), a «Aplicação» e o nó da árvore de categorias. Funções puras (o 3D classifica o produto pelo nome, pela subcategoria e por isto).
import type { MedidaAtributo } from "../v2/catalogoModelo";
import { urlDaFotoOpcao } from "../fotoOpcaoUrl";
import { medidaDosAtributos, type MedidaCm } from "../planta3d/previaProduto3d";
import { medidaDoRevestimento, type MedidaRevestimento } from "../planta3d/revestimentoPrevia";
import { LADO_TEXTURA_CM, type TexturaModelo } from "../planta3d/texturaProduto";
import { tipoDoEixo, type EixoVista, type ProdutoVista } from "./escolhaVariacao";

export interface PreviaDoProduto {
  cor: string | undefined; textura: TexturaModelo | undefined; medida: MedidaCm | null; medidaRevestimento: MedidaRevestimento | null; aplicacao: string | null;
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const sem = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
/** O «Acabamento da cor» (metal) e o «Decor» mandam sobre a «Cor», como na ficha (corDosAtributos). */
const eAcabamento = (e: EixoVista) => /^(acabamento|decor)/.test(sem(e.code)) || /^(acabamento|decor)/.test(sem(e.rotulo));

/** O primeiro hex válido de uma opção (uma cor dupla traz vários separados por vírgula); nenhum: undefined. */
function primeiroHex(hex: string | null): string | undefined {
  const h = hex?.split(",")[0]?.trim();
  return h && HEX.test(h) ? h : undefined;
}

/** A medida da base (o JSON da medida do atributo) como medida de atributo, para as funções do 3D; qualquer outra coisa: nenhuma. */
function medidaDaBase(p: ProdutoVista): MedidaAtributo | null {
  const v = p.medida?.valor;
  if (!v || typeof v !== "object") return null;
  const tipo = (v as { tipo?: unknown }).tipo;
  return tipo === "1D" || tipo === "2D" || tipo === "3D" ? (v as MedidaAtributo) : null;
}

export function previaDoProduto(p: ProdutoVista, eixos: readonly EixoVista[], produtos: readonly ProdutoVista[]): PreviaDoProduto {
  const deCor = eixos.filter((e) => tipoDoEixo(e, produtos) === "cor");
  const fonte = deCor.find(eAcabamento) ?? deCor[0];
  const escolhido = fonte ? p.valores[fonte.atributoId] : undefined;
  const url = escolhido?.foto ? urlDaFotoOpcao(escolhido.foto) : null;
  const m = medidaDaBase(p);
  const attrs = m ? [{ atributoId: p.medida?.atributoId ?? "", medida: m }] : undefined;
  return {
    cor: primeiroHex(escolhido?.hex ?? null),
    textura: url ? { url, ladoCm: LADO_TEXTURA_CM } : undefined,
    medida: medidaDosAtributos(attrs),
    medidaRevestimento: medidaDoRevestimento(attrs),
    aplicacao: p.aplicacao ? p.aplicacao.nome || p.aplicacao.valor : null,
  };
}

/**
 * O nó da árvore de categorias do produto (a subcategoria, senão a categoria). Os ids dos nós podem diferir dos da base (`origem`, quando o ramo se juntou ao de um ofício dos
 * serviços com o mesmo nome): procura-se o nó pela origem e, sem ele, fica o id da base, como a ficha faz.
 */
export function noDoProduto(p: ProdutoVista, categoriasProduto: readonly { id: string; origem?: string }[]): string | null {
  const base = p.subcategoriaId ?? p.categoriaId;
  if (!base) return null;
  return categoriasProduto.find((c) => c.origem === base)?.id ?? base;
}
