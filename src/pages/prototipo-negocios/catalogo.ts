// O Catálogo de serviços do protótipo (09/10/2026).
// Os nomes, ofícios, unidades, horas e o nº de orçamentos em que aparecem são
// os REAIS da Mudelar: vêm de operacao-app/tools/planeamento/dados.mjs (EXTRAS),
// os serviços vendidos à parte dos pacotes. Os custos e preços são de exemplo:
// mão de obra a 25 €/h e preço de tabela com 35% de margem.

export type LinhaCat = "wc" | "coz";
export interface ItemCatalogo {
  id: string;
  n: string;
  /** Ofício (a categoria no Catálogo). */
  cat: string;
  un: string;
  /** Horas fixas por linha e horas por unidade (a receita). */
  hf: number;
  hu: number;
  /** Quantidade mediana nos orçamentos. */
  qm: number;
  /** Em quantos orçamentos aparece: ordena os "mais pedidos". */
  usos: number;
  linhas: LinhaCat[];
}

export const CATALOGO: ItemCatalogo[] = [
  { id: "c1", n: "Levantamento de Sanitários e Mobiliário", cat: "Demolições", un: "un", hf: 2, hu: 0, qm: 1, usos: 133, linhas: ["wc"] },
  { id: "c2", n: "Supressão de ponto de água", cat: "Canalização", un: "un", hf: 0, hu: 1.5, qm: 1, usos: 101, linhas: ["wc"] },
  { id: "c3", n: "Mão de Obra Construção de Nicho (valor por unidade)", cat: "Revestimentos", un: "un", hf: 0, hu: 3, qm: 1, usos: 86, linhas: ["wc"] },
  { id: "c4", n: "Instalação de Revestimento m2", cat: "Revestimentos", un: "m²", hf: 0, hu: 1, qm: 8, usos: 46, linhas: ["wc"] },
  { id: "c5", n: "Mão de Obra Demolição de parede m2", cat: "Demolições", un: "ml", hf: 0, hu: 0.8, qm: 3, usos: 110, linhas: ["wc", "coz"] },
  { id: "c6", n: "Instalação de Pavimento m2", cat: "Revestimentos", un: "m²", hf: 0, hu: 1, qm: 5, usos: 23, linhas: ["wc"] },
  { id: "c7", n: "Anulação de Ponto de Gás", cat: "Gás (ITG)", un: "un", hf: 2, hu: 0, qm: 1, usos: 64, linhas: ["wc", "coz"] },
  { id: "c8", n: "Mão de Obra Levantamento de parede em Alvenaria m2", cat: "Revestimentos", un: "m²", hf: 1, hu: 1.5, qm: 2, usos: 35, linhas: ["wc", "coz"] },
  { id: "c9", n: "Instalação de Mobiliário WC", cat: "Carpintaria", un: "un", hf: 0, hu: 2, qm: 1, usos: 21, linhas: ["wc"] },
  { id: "c10", n: "Instalação de Coluna de Duche", cat: "Canalização", un: "un", hf: 0, hu: 1.5, qm: 1, usos: 19, linhas: ["wc"] },
  { id: "c11", n: "Colocação de Serigrafia para Resguardo", cat: "Carpintaria", un: "un", hf: 0, hu: 1, qm: 1, usos: 18, linhas: ["wc"] },
  { id: "c12", n: "Construção de Murete em Alvenaria até 80cm", cat: "Revestimentos", un: "un", hf: 0, hu: 4, qm: 1, usos: 17, linhas: ["wc"] },
  { id: "c13", n: "Instalação de Sanita Compacta", cat: "Canalização", un: "un", hf: 0, hu: 2, qm: 1, usos: 14, linhas: ["wc"] },
  { id: "c14", n: "Instalação de Resguardo", cat: "Carpintaria", un: "un", hf: 0, hu: 2, qm: 1, usos: 12, linhas: ["wc"] },
  { id: "c15", n: "Instalação de Eletrodoméstico a Gás", cat: "Gás (ITG)", un: "un", hf: 0, hu: 2, qm: 1, usos: 66, linhas: ["wc", "coz"] },
  { id: "c16", n: "Mão de Obra - Deslocação de Ponto de Água ML", cat: "Canalização", un: "ml", hf: 0, hu: 1.5, qm: 1, usos: 12, linhas: ["wc"] },
  { id: "c17", n: "Instalação de Banheira de Pousar", cat: "Canalização", un: "un", hf: 0, hu: 3, qm: 1, usos: 10, linhas: ["wc"] },
  { id: "c18", n: "Instalação de torneira de lavatório", cat: "Canalização", un: "un", hf: 0, hu: 0.75, qm: 1, usos: 10, linhas: ["wc"] },
  { id: "c19", n: "Instalação de Espelho com LED", cat: "Eletricidade", un: "un", hf: 0, hu: 1, qm: 1, usos: 9, linhas: ["wc"] },
  { id: "c20", n: "Instalação de Acessórios WC", cat: "Carpintaria", un: "un", hf: 0, hu: 0.5, qm: 1, usos: 8, linhas: ["wc"] },
  { id: "c21", n: "Mão de Obra - Deslocação de Ponto de Esgoto ML", cat: "Canalização", un: "ml", hf: 0, hu: 2, qm: 1.5, usos: 14, linhas: ["wc", "coz"] },
  { id: "c22", n: "Instalação de Lavatório Cerâmica", cat: "Canalização", un: "un", hf: 0, hu: 1.5, qm: 1, usos: 7, linhas: ["wc"] },
  { id: "c23", n: "Instalação de Bidé Compacto", cat: "Canalização", un: "un", hf: 0, hu: 1.5, qm: 1, usos: 6, linhas: ["wc"] },
  { id: "c24", n: "Instalação de Acessório de segurança WC", cat: "Carpintaria", un: "un", hf: 0, hu: 0.5, qm: 1.5, usos: 6, linhas: ["wc"] },
  { id: "c25", n: "Mão de Obra Abertura e Fecho de Roço c/ Acabamento ml", cat: "Canalização", un: "ml", hf: 0, hu: 1, qm: 4, usos: 18, linhas: ["wc", "coz"] },
  { id: "c26", n: "Instalação de Vidro Lateral Fixo", cat: "Carpintaria", un: "un", hf: 0, hu: 1.5, qm: 1, usos: 5, linhas: ["wc"] },
  { id: "c27", n: "Instalação de Torneira de Bidé", cat: "Canalização", un: "un", hf: 0, hu: 0.75, qm: 1, usos: 5, linhas: ["wc"] },
  { id: "c28", n: "Instalação de Toalheiros Eletricos", cat: "Eletricidade", un: "un", hf: 0, hu: 1.5, qm: 1, usos: 5, linhas: ["wc"] },
  { id: "c29", n: "Instalação de Ventaxia WC", cat: "Eletricidade", un: "un", hf: 0, hu: 1.5, qm: 1, usos: 5, linhas: ["wc"] },
  { id: "c30", n: "Instalação de Eletrodomésticos de Cozinha", cat: "Carpintaria", un: "un", hf: 0, hu: 1, qm: 4, usos: 122, linhas: ["coz"] },
  { id: "c31", n: "Instalação Estrutura para gaveta (valor unitário)", cat: "Carpintaria", un: "un", hf: 0, hu: 0.3, qm: 4, usos: 86, linhas: ["coz"] },
  { id: "c32", n: "Instalação Estrutura para gavetão (valor unitário)", cat: "Carpintaria", un: "un", hf: 0, hu: 0.4, qm: 2, usos: 74, linhas: ["coz"] },
  { id: "c33", n: "Instalação de Eletrodomésticos Mudelar", cat: "Carpintaria", un: "un", hf: 0, hu: 1, qm: 4, usos: 46, linhas: ["coz"] },
  { id: "c34", n: "Instalação de Gás nas Paredes", cat: "Gás (ITG)", un: "un", hf: 6, hu: 0, qm: 1, usos: 28, linhas: ["coz"] },
  { id: "c35", n: "Passagem de fio Eletrico fase/neutro 1,5mm² ML", cat: "Eletricidade", un: "ml", hf: 0, hu: 0.15, qm: 4, usos: 17, linhas: ["coz"] },
  { id: "c36", n: "Instalação Vista superior até 20cm de altura (valor p/ml)", cat: "Carpintaria", un: "ml", hf: 0, hu: 0.3, qm: 4, usos: 14, linhas: ["coz"] },
  { id: "c37", n: "Instalação Estrutura de Gavetões Internos para dispenseiro (valor até 4 unidades)", cat: "Carpintaria", un: "un", hf: 0, hu: 1, qm: 1, usos: 12, linhas: ["coz"] },
  { id: "c38", n: "Certificação de Gás", cat: "Gás (ITG)", un: "un", hf: 2, hu: 0, qm: 1, usos: 8, linhas: ["coz"] },
  { id: "c39", n: "Instalação de torneira de Cozinha", cat: "Canalização", un: "un", hf: 0, hu: 0.75, qm: 1, usos: 7, linhas: ["coz"] },
  { id: "c40", n: "Instalação de Rodapé ML", cat: "Pintura", un: "ml", hf: 0, hu: 0.25, qm: 25, usos: 7, linhas: ["coz"] },
  { id: "c41", n: "Instalação de Lava Loiça", cat: "Canalização", un: "un", hf: 0, hu: 1, qm: 1, usos: 6, linhas: ["coz"] },
  { id: "eletr", n: "Pontos elétricos", cat: "Eletricidade", un: "pt", hf: 0, hu: 1.5, qm: 4, usos: 0, linhas: ["wc", "coz"] },
  { id: "teto", n: "Teto falso em pladur", cat: "Carpintaria", un: "m²", hf: 0, hu: 0.9, qm: 4, usos: 0, linhas: ["wc", "coz"] },
  { id: "pint", n: "Pintura de tetos e paredes", cat: "Pintura", un: "m²", hf: 0, hu: 0.3, qm: 10, usos: 0, linhas: ["wc", "coz"] },
];

export const OFICIOS = [...new Set(CATALOGO.map((c) => c.cat))];

/** Sem acentos e em minúsculas, para a pesquisa. */
export const normal = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
