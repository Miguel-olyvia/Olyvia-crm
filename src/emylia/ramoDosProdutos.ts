// 17/11 (teste A-Z na Mudelar: o orçamento contava as louças a dobrar). O motor sabe o que um produto cobre na estimativa do modelo pelo ramo
// da árvore dos SERVIÇOS (motor.ts LINHAS[…].mat.partes: «Canalização › Louças e torneiras», «Revestimentos › Parede/Pavimento»,
// «Carpintaria › Mobiliário»). Os produtos importados da Mudelar estão na árvore dos PRODUTOS (product_categories: «Sanitas», «Bases Duche»…),
// que só se junta à dos serviços quando o nome é igual (catalogoReal.juntarArvoreProdutos). Este mapa diz a que ramo do motor pertence cada
// categoria de produto que não se juntou. É o mesmo da migration 20270121200000 (products.catalogo_categoria_id), mas aqui serve também o
// Catálogo leve, que já não traz os produtos.
import type { No } from "./v2/catalogoModelo";

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[´`']/g, "").replace(/\s+/g, " ").trim();

const LOUCAS: [string, string] = ["Canalização", "Louças e torneiras"];
const COZ_AGUA: [string, string] = ["Canalização", "Lava-loiças e torneiras de cozinha"];
const MOVEIS_WC: [string, string] = ["Carpintaria", "Móveis de casa de banho"];
const ACESS_WC: [string, string] = ["Carpintaria", "Acessórios WC"];
const ELETRO: [string, string] = ["Carpintaria", "Eletrodomésticos"];
const MOBILIARIO: [string, string] = ["Carpintaria", "Mobiliário"];

const MAPA: [string[], [string, string]][] = [
  [["Bases Duche", "Banheiras", "Sanitas", "Bidés", "Lavatórios", "Kit's para Sanitários", "Chuveiro Higiénico", "Colunas Duche", "Torneira Lavatório",
    "Torneira Pé Alto", "Torneira Bidé", "Torneira Banheira", "Torneira Encastre", "Torneira Duche", "Sifões Lavatório"], LOUCAS],
  [["Cubas compósito", "Cubas inox", "Misturadoras Monocomando", "Misturadoras Monocomando Abatível", "Misturadoras Monocomando Extraível",
    "Misturadoras Monocomando Flexível", "Misturadoras Monocomando Giratória"], COZ_AGUA],
  [["Termoacumulador"], ["Canalização", "Aquecimento de águas"]], [["Esquentador"], ["Gás (ITG)", "Aparelhos a gás"]],
  [["Resguardos de Duche"], ["Carpintaria", "Resguardos"]],
  [["Móveis de lavatório", "Colunas", "Tampos & Bancadas WC", "Espelhos"], MOVEIS_WC],
  [["Toalheiros", "Auxiliares", "Cabides", "Cestos", "Piaçaba", "Porta-rolos", "Bancos", "Cadeiras", "Pega De Segurança"], ACESS_WC],
  [["Exaustores", "Fornos", "Frigoríficos", "Garrafeira", "Máquinas lavar & secar roupa", "Máquinas lavar loiça", "Máquinas lavar roupa",
    "Máquinas secar roupa", "Micro-ondas", "Placas"], ELETRO],
  [["Armários Inferiores", "Armários superiores", "Armários de Coluna", "Acessórios de Cozinha", "Cozinha Completa - Projetos", "Puxadores"], MOBILIARIO],
  [["Apliques LED"], ["Eletricidade", "Iluminação"]], [["Ventax"], ["Eletricidade", "Ventilação"]],
  [["Cerâmico", "Cerâmico Laminado"], ["Revestimentos", "Parede"]], [["Porcelânico", "SPC"], ["Revestimentos", "Pavimento"]],
  // 24/11 (contratos reais da Mudelar, MD 1610): o mesmo cerâmico ou porcelânico vai à parede e ao chão (o SPC só ao chão)
  [["Porcelânico"], ["Revestimentos", "Parede"]], [["Cerâmico", "Cerâmico Laminado"], ["Revestimentos", "Pavimento"]],
];
/** Os ramos de cada categoria de produto, pela ordem do mapa (o primeiro é o principal). */
const RAMOS_DA_CATEGORIA = new Map<string, [string, string][]>();
for (const [subs, r] of MAPA) for (const s of subs) RAMOS_DA_CATEGORIA.set(sem(s), [...(RAMOS_DA_CATEGORIA.get(sem(s)) ?? []), r]);

/** O ramo do motor (ofício, sub) de uma categoria de produto, pelo nome (o principal); null se não está no mapa. */
export const ramoDaCategoriaProduto = (nome: string): [string, string] | null => RAMOS_DA_CATEGORIA.get(sem(nome))?.[0] ?? null;
/** 24/11: todos os ramos de uma categoria de produto (o porcelânico é da parede e do chão). */
export const ramosDaCategoriaProduto = (nome: string): [string, string][] => RAMOS_DA_CATEGORIA.get(sem(nome)) ?? [];

const VAZIAS = new Set(["a", "o", "as", "os", "e", "de", "do", "da", "dos", "das", "com", "em"]);
/** O que a pergunta pergunta, em palavras: «O cliente mantém o espelho?» → ["espelho"]; sem «mantém…», nada. */
function palavrasDoObjeto(pergunta: string | null | undefined): string[] {
  const m = pergunta && /mant[ée]m\s+(.+?)\s*\??\s*$/i.exec(pergunta);
  return m ? sem(m[1]).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !VAZIAS.has(w)) : [];
}
/**
 * 23/11 (testarh, Mudelar: «O cliente mantém o espelho?» → «Troca» não encontrava o «Espelho Simples C/ORLA ALUMÍNIO 60x50», da categoria de produto
 * «Móveis & Arrumação Casa de Banho › Espelhos»; nem a porta, de «Portas › Portas Interiores», que o mapa não tem). As categorias de produto (soProduto)
 * que são o objeto da pergunta, pelo nome: a primeira palavra da categoria é a palavra da pergunta ou o plural dela («espelho» → «Espelhos»,
 * «porta» → «Portas Interiores»; «Porta-rolos» não conta). Servem a troca mesmo quando o ramo do serviço não as tem no mapa.
 */
export function nosDoObjeto(arvore: readonly No[], pergunta: string | null | undefined): string[] {
  const pal = palavrasDoObjeto(pergunta);
  if (!pal.length) return [];
  const formas = new Set(pal.flatMap((w) => [w, w + "s", w + "es"]));
  return arvore.filter((x) => x.soProduto && formas.has(sem(x.n).split(" ")[0])).map((x) => x.id);
}

/** Os nós só de produtos (soProduto) da árvore que pertencem ao ramo (ofício, sub) do motor. */
export function nosDeProdutoDoRamo(arvore: readonly No[], oficio: string, sub?: string): string[] {
  return arvore.filter((x) => {
    if (!x.soProduto) return false;
    return ramosDaCategoriaProduto(x.n).some((r) => sem(r[0]) === sem(oficio) && (!sub || sem(r[1]) === sem(sub)));
  }).map((x) => x.id);
}
