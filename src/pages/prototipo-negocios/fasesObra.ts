// As fases da obra (14/10/2026, pedido do Ruben): cada serviço pode acontecer numa ou em várias fases, e a etapa
// "Necessidades do cliente" divide os serviços e os produtos por fase. O valor escolhido na ficha do serviço fica
// no Catálogo (`fasesServico`); sem ele, usam-se as regras por omissão abaixo, pelo nome e pelo ofício.
// Um produto fica na fase do serviço que o instala; sem serviço, pela ilustração (o tipo de produto).
// Funções puras, sem React.

export type FaseObra = 1 | 2 | 3 | 4;
export const FASES_OBRA: { n: FaseObra; nome: string; curto: string }[] = [
  { n: 1, nome: "Trabalhos preparatórios e demolições", curto: "Preparação e demolições" },
  { n: 2, nome: "Infraestruturas (instalações técnicas)", curto: "Infraestruturas" },
  { n: 3, nome: "Revestimentos e acabamentos base", curto: "Revestimentos" },
  { n: 4, nome: "Montagem final e acabamentos finos", curto: "Montagem final" },
];
export const nomeFase = (f: FaseObra) => `Fase ${f} · ${FASES_OBRA[f - 1].nome}`;

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** As regras por omissão: a primeira que bate ganha. Ordem: do mais específico para o mais geral. */
const REGRAS: [RegExp, FaseObra[]][] = [
  // limpeza: a final é montagem; a de arranque é preparação
  [/limpeza (final|fina)|limpeza pos[- ]obra/, [4]],
  [/limpeza|protec|proteg|isolamento da zona|montagem de estaleiro|estaleiro/, [1]],
  // demolições e remoções
  [/demol|remoc|remover|retirar|levantamento d|supress|anulac|desmont|picagem|picar|entulho|contentor|big ?bag|roco/, [1]],
  // as peças que se montam no fim ganham às palavras das infraestruturas e dos revestimentos
  // ("Instalação de sanita elétrica", "Lavatório cerâmica", "Porta revestida", "Estrutura para gaveta")
  [/louca|sanita|bide|lavatorio|torneira|misturadora|coluna de duche|resguardo|base de duche|banheira|movel|moveis|mobiliario|bancada|tampo|lava[- ]loica|eletrodomestic|exaustor|espelho|toalheiro|acessorio|porta|roupeiro|gaveta|gavetao|garrafeira|cristaleira|prateleira|dispenseiro|vista (superior|inferior|coluna)|banco|mesa |puxador|aplique|luminaria|candeeiro|janela|caixilh|estore|rede mosquiteira|vidro|serigrafia/, [4]],
  // alvenaria e pladur: levantam-se com as infraestruturas e fecham-se nos revestimentos
  [/alvenaria|murete|tijolo|parede divis|pladur|gesso cartonado|teto falso|tecto falso|sanca/, [2, 3]],
  // instalações técnicas
  [/canaliz|esgoto|ponto de agua|ponto de esgoto|tubagem|ppr|multicamada|\bgas\b|eletric|electric|quadro|disjunt|tomada|interruptor|ponto de luz|passagem de fio|cabo|avac|ar condicionado|pre[- ]instal|climatiz|ventilac|extrac|tela radiante|piso radiante|aquecimento|esquentador|termoacumul|caldeira|domotica|telecom|ited|rede de dados/, [2]],
  // pintura: a base com os revestimentos, a de acabamento no fim
  [/pintura|pintar|tinta|envernizar|verniz|lacagem/, [3, 4]],
  // revestimentos e acabamentos base
  [/revest|azulej|ceramic|mosaico|pavimento|soalho|flutuante|vinilico|microcimento|betonilha|regulariz|autonivel|reboco|estuque|barramento|impermeabiliz|isolamento termico|isolamento acustico|cappoto|base de duche em obra|nicho/, [3]],
  // montagem final e acabamentos finos
  [/louca|sanita|bide|lavatorio|torneira|misturadora|coluna de duche|resguardo|base de duche|banheira|movel|moveis|cozinha|bancada|lava[- ]loica|eletrodomestic|exaustor|espelho|toalheiro|acessorio|porta|roupeiro|rodape|silicone|aplique|luminaria|foco|candeeiro|iluminac|janela|caixilh|estore|rede mosquiteira|puxador|montagem|instalacao de/, [4]],
];
/** As fases por omissão de um serviço, pelo nome e pelo ofício (sem acentos). Sem regra: montagem final. */
export function fasesPadrao(nome: string, oficio = ""): FaseObra[] {
  // primeiro o nome ("Instalação de sanita" é montagem, mesmo sendo do ofício Canalização); o ofício só desempata
  for (const t of [sem(nome), sem(oficio)]) for (const [re, f] of REGRAS) if (t && re.test(t)) return f;
  return [4];
}

/** O tipo de produto (a chave da ilustração) → a fase, quando o produto não tem serviço de instalação. */
const FASE_DA_ILUSTRACAO: Record<string, FaseObra> = {
  revestimento: 3, pavimento: 3, cola: 3, quimico: 3,
  eletrico: 2, avac: 2, esquentador: 2, material: 2,
  limpeza: 1, ferramenta: 1,
};
export const faseDaIlustracao = (img?: string): FaseObra => (img && FASE_DA_ILUSTRACAO[img]) || 4;

/** O que se lê do Catálogo: as fases escolhidas na ficha (opcional). */
export interface ComFases { fasesServico?: Record<string, FaseObra[]> }
/** As fases de um serviço: as da ficha, senão as por omissão. Sempre ordenadas e sem repetidos. */
export function fasesDoServico(K: ComFases | null | undefined, sid: string, nome: string, oficio = ""): FaseObra[] {
  const f = K?.fasesServico?.[sid];
  const lista = f && f.length ? f : fasesPadrao(nome, oficio);
  return [...new Set(lista)].sort((a, b) => a - b);
}
/** A fase de um produto: a última fase do serviço que o instala (é quando se monta); sem ele, pelo tipo. */
export function faseDoProduto(
  K: ComFases | null | undefined, p: { servico?: string; img?: string },
  servico?: { nome: string; oficio?: string },
): FaseObra {
  if (p.servico && servico) { const f = fasesDoServico(K, p.servico, servico.nome, servico.oficio); return f[f.length - 1]; }
  return faseDaIlustracao(p.img);
}
