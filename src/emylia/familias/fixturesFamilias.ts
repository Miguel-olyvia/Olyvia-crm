// Dados de teste partilhados pelos testes da interface das famílias (só testes importam este ficheiro).
import { catalogo0, type AtributoDef, type AtributoProduto, type Catalogo, type Produto } from "../v2/catalogoModelo";
import type { LinhaPaginaProduto } from "../real/produtosPaginados";

export const A_MED = "a-medida", A_COR = "a-cor", A_CUBAS = "a-cubas";
export const DEFS: AtributoDef[] = [
  { id: A_MED, codigo: "medida", nome: "Medida", tipo: "medida", temHex: false, ordem: 1, opcoes: [] },
  {
    id: A_COR, codigo: "cor", nome: "Cor", tipo: "lista", temHex: true, ordem: 2,
    opcoes: [
      { id: "o-branco", valor: "BRANCO", nome: "Branco", hex: "#F5F5F0", ordem: 1 },
      { id: "o-preto", valor: "PRETO", nome: "Preto", hex: "#000000", ordem: 2 },
      { id: "o-pedra", valor: "PEDRA", nome: "Pedra", hex: null, ordem: 3 },
      // a cor dupla é UMA opção cujo hex traz vários (o catálogo só guarda um valor por atributo e produto)
      { id: "o-bp", valor: "BRANCO/PRETO", nome: "Branco/Preto", hex: "#F5F5F0, #000000", ordem: 4 },
    ],
  },
  { id: A_CUBAS, codigo: "cubas", nome: "Nº de cubas", tipo: "lista", temHex: false, ordem: 3, opcoes: [{ id: "o-1", valor: "1", nome: "1 cuba", hex: null, ordem: 1 }, { id: "o-2", valor: "2", nome: "2 cubas", hex: null, ordem: 2 }] },
];

/** Os atributos estruturados de um produto: medida 1D (largura, cm) e a opção de cor (id da opção). */
export const attrs = (largura: number | null, opcaoCor: string | null): AtributoProduto[] => [
  ...(largura == null ? [] : [{ atributoId: A_MED, medida: { tipo: "1D" as const, dimensao: "largura" as const, valor: largura, unidade: "cm" as const } }]),
  ...(opcaoCor ? [{ atributoId: A_COR, opcaoId: opcaoCor }] : []),
];

export const linha = (id: string, nome: string, extra: Partial<LinhaPaginaProduto> = {}): LinhaPaginaProduto => ({
  id, nome, sku: `SKU-${id}`, sku_gerado: null, marca: "Cunha", categoria_id: "c1", categoria: "Louças", subcategoria_id: "s1", subcategoria: "Lava-loiças",
  modelo_id: null, modelo: null, modelo_numero: null, unidade: "un", custo: 80, pvp: 150, grossista: null, distribuidor: null, fornecedor: null, ativo: true, imagem: null, atributos_resumo: null, ...extra,
});

export const produto = (id: string, n: string, extra: Partial<Produto> = {}): Produto => ({
  id, n, custo: 80, pvp: 150, un: "un", marca: "Cunha", fornecedor: "", data: "", no: "s1", sku: `SKU-${id}`, sub: "Lava-loiças", ...extra,
});

/** O Catálogo leve da página: sem produtos, com a árvore de categorias de produto, um modelo, marcas e os atributos. */
export const K_LEVE: Catalogo = {
  ...catalogo0(),
  // os ids dos NÓS da árvore são diferentes dos da base (`origem`): é o caso real depois de juntar com os serviços, e o que apanha confundir um com o outro
  categoriasProduto: [{ id: "n-c1", n: "Louças", pai: null, ordem: 1, origem: "c1" }, { id: "n-s1", n: "Lava-loiças", pai: "n-c1", ordem: 1, origem: "s1" }, { id: "n-c2", n: "Torneiras", pai: null, ordem: 2, origem: "c2" }],
  modelos: [{ id: "m1", n: "Velar", numero: 1, sub: "n-s1", ativo: true }],
  marcas: ["Cunha", "Roca"],
  atributos: DEFS,
};

/** A resposta de uma página do servidor. */
export const paginaDe = (produtos: LinhaPaginaProduto[], extra: { total?: number; pagina?: number; paginas?: number } = {}) => ({
  ok: true as const, v: { total: extra.total ?? produtos.length, pagina: extra.pagina ?? 1, limite: 50, paginas: extra.paginas ?? 1, produtos },
});
