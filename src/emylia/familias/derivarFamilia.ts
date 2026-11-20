// Famílias (interface): a ponte entre a escolha (Produto + atributos lidos do servidor) e o núcleo (nucleo.ts). Funções puras, sem React nem rede.
import type { AtributoDef, AtributoProduto, Catalogo, Produto } from "../v2/catalogoModelo";
import {
  eixosValidos, familiaPorEixos, itemDoCatalogo, nomesDosAtributos, problemas, sugerirFamilia,
  type EixosCfg, type FamiliaCfg, type ItemEixos, type Problema, type TipoProblema,
} from "./nucleo";

/** Uma família derivada e os produtos que a compõem: o que o assistente entrega para gravar (20/11: na base, via familiasDados). */
export interface FamiliaGuardada { familia: FamiliaCfg; produtos: Produto[] }

/** O nome da categoria de topo do produto. `no` é o id da BASE (product_categories; é o que a linha da página traz e o que `produtoDaLinha` guarda em Produto.no) ou o id do nó da árvore:
    * o nó da árvore pode ter outro id (`origem`), por isso procura-se pelos dois. Uma subcategoria sobe ao pai (que é um id de nó). Sem nó, sem árvore ou desconhecido: undefined. */
export function categoriaDoNo(K: Pick<Catalogo, "categoriasProduto">, no: string | null): string | undefined {
  const lista = K.categoriasProduto;
  if (!no || !lista) return undefined;
  const porId = new Map(lista.map((c) => [c.id, c] as const));
  let atual = porId.get(no) ?? lista.find((c) => (c.origem ?? c.id) === no);
  for (let i = 0; atual?.pai && porId.has(atual.pai) && i < 5; i++) atual = porId.get(atual.pai);
  return atual?.n;
}

/** Os produtos escolhidos como itens do núcleo. Só entram os que já têm os atributos lidos (um produto lido sem atributos entra com `{}`). */
export function itensDosEscolhidos(
  escolhidos: readonly Produto[], atributos: ReadonlyMap<string, AtributoProduto[]>, defs: readonly AtributoDef[] | undefined, categoriaDe: (no: string | null) => string | undefined,
): ItemEixos[] {
  return escolhidos.flatMap((p) => {
    const lidos = atributos.get(p.id);
    if (!lidos) return [];
    return [itemDoCatalogo({ ...p, attrs: lidos }, defs, { categoria: categoriaDe(p.no) })];
  });
}

export interface Derivada { nomes: string[]; eixos: EixosCfg; familia: FamiliaCfg; problemas: Problema[] }

/** Tudo o que se mostra, derivado dos itens e da escolha dos eixos (nada se escreve): nomes dos atributos, eixos válidos, família e problemas do núcleo. */
export function derivarFamilia(itens: readonly ItemEixos[], escolha: EixosCfg | null, outrosIds: readonly string[] = []): Derivada {
  const atributos = itens.map((i) => i.atributos), eixos = eixosValidos(escolha, atributos);
  const refs = itens.map((i) => i.ref), nome = sugerirFamilia(refs).nome.trim() || refs[0]?.n.trim() || "";
  const { familia } = familiaPorEixos(nome, itens, eixos);
  return { nomes: nomesDosAtributos(atributos), eixos, familia, problemas: problemas(familia, outrosIds) };
}

/** Os problemas que se resolvem no resumo (nome, identificador, marcas); todos os outros resolvem-se nos atributos (eixos ou excluir produtos). */
const DO_PASSO_3: readonly TipoProblema[] = ["nome", "id", "marcas"];
/** Os problemas que se mostram em cada passo (2 ou 3). */
export const problemasDoPasso = (ps: readonly Problema[], passo: 2 | 3): Problema[] => ps.filter((p) => DO_PASSO_3.includes(p.tipo) === (passo === 3));
/** Há algum ERRO neste passo? (um aviso nunca bloqueia) */
export const bloqueiaPasso = (ps: readonly Problema[], passo: 2 | 3): boolean => problemasDoPasso(ps, passo).some((p) => p.gravidade === "erro");
