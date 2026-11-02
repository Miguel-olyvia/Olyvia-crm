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
  // os modelos de obra atravessam a obra (remoção, infraestruturas, revestimento e montagem)
  [/^mo modelo (\d|remodelacao completa)/, [1, 2, 3, 4]],
  [/^mo modelo .*mobiliario/, [1, 4]],
  // antes de a obra arrancar, ou durante toda ela: o projeto e a deslocação ao km
  [/projeto|deslocacao fora|valor p\/km/, [1]],
  // "levantamento de parede" é erguer a parede (não é remover): com as infraestruturas e fecha-se nos revestimentos
  [/levantamento de (parede|alvenaria|muro)/, [2, 3]],
  // os roços abrem-se para as infraestruturas; com o fecho e o acabamento, chegam aos revestimentos
  [/fecho de roco/, [2, 3]],
  [/roco/, [2]],
  // mexer num ponto (luz, água, esgoto) é infraestrutura, mesmo quando o nome fala de eletrodomésticos
  [/deslocacao de ponto|ponto de luz|ponto de agua|ponto de esgoto/, [2]],
  [/la de rocha|isolamento (termico|acustico)/, [2, 3]],
  [/pedra natural|painel acustico|sem pintura/, [3]],
  [/limpeza|protec|proteg|isolamento da zona|montagem de estaleiro|estaleiro/, [1]],
  // demolições e remoções
  [/demol|remoc|remover|retirar|levantamento d|supress|anulac|desmont|picagem|picar|entulho|contentor|big ?bag/, [1]],
  // as peças que se montam no fim ganham às palavras das infraestruturas e dos revestimentos
  // ("Instalação de sanita elétrica", "Lavatório cerâmica", "Porta revestida", "Estrutura para gaveta")
  [/louca|sanita|bide|lavatorio|torneira|misturadora|coluna de duche|resguardo|base de duche|banheira|movel|moveis|mobiliario|bancada|tampo|lava[- ]loica|eletrodomestic|exaustor|espelho|toalheiro|acessorio|porta|roupeiro|gaveta|gavetao|garrafeira|cristaleira|prateleira|dispenseiro|vista (superior|inferior|coluna)|banco|mesa |puxador|aplique|luminaria|candeeiro|janela|caixilh|estore|rede mosquiteira|vidro|serigrafia/, [4]],
  // alvenaria e pladur: levantam-se com as infraestruturas e fecham-se nos revestimentos
  [/alvenaria|murete|tijolo|parede divis|pladur|gesso cartonado|teto falso|tecto falso|sanca/, [2, 3]],
  // instalações técnicas
  [/canaliz|esgoto|ponto de agua|ponto de esgoto|tubagem|ppr|multicamada|\bgas\b|eletric|electric|quadro|disjunt|tomada|interruptor|ponto de luz|passagem de fio|cabo|avac|ar condicionado|pre[- ]instal|climatiz|ventilac|extrac|tela radiante|piso radiante|aquecimento|esquentador|termoacumul|caldeira|domotica|telecom|ited|rede de dados/, [2]],
  // pintura: a base com os revestimentos, a de acabamento no fim
  // com \b: "carpintaria" contém "pintar"
  [/\bpintura|\bpintar|\btinta|envernizar|\bverniz|lacagem/, [3, 4]],
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

/** A rampa das fases (um só tom, do claro ao escuro; todos ≥ 3:1 sobre o branco e sobre o fundo). 02/11: mudou de planoObra.ts para
 *  aqui (a Encomenda de Cliente também a usa, sem o motor); planoObra.ts reexporta-a. */
export const COR_FASE: Record<number, string> = { 1: "#9074dc", 2: "#7452d1", 3: "#5a36bf", 4: "#432791" };

/* ------------------------------------------------------------------ os materiais na obra (02/11) */
// Uma regra só para a fase de um material, na Encomenda de Cliente (Olyvia) e na obra (materiais por fase, transporte):
//  a) o produto é instalado por um serviço que ESTÁ na obra → a última fase desse serviço (faseDoProduto: é quando se monta);
//  b) senão, é um consumível da receita de serviços da obra → a primeira fase do serviço que o gasta (a menor, se forem vários);
//  c) senão, pelo nome (faseDoMaterial, a regra de sempre das obras).

/** A fase em que o material entra, só pelo nome (a regra antiga das obras). 02/11: mudou de obraOps.ts para aqui (obraOps reexporta-a). */
export function faseDoMaterial(n: string): FaseObra {
  const s = n.toLowerCase();
  // "saco" só os do entulho/lixo: "Cimento-cola · saco 25 kg" é revestimento (F3), não preparação
  if (/sacos? (de |para )?(entulho|lixo|rafia|ráfia)|big ?bag|prote|plást|cartão|entulho/.test(s)) return 1;
  if (/tubo|vál|valv|torneira de corte|multicamada|cabo|caixa/.test(s)) return 2;
  if (/cerâm|ceram|azulej|pavimento|cola|junta|argamassa|revest/.test(s)) return 3;
  return 4;
}

/** O nome e o ofício dos serviços do modelo do motor (motor.ts SVC0, pela chave): o ofício é o `perfil` com que o plano chama
 *  fasesDoServico. Os outros serviços usam o ofício do Catálogo (a categoria). Quem não tem o motor (a Encomenda de Cliente, a obra sem
 *  o Estado) usa isto para dar as mesmas fases. O teste de fasesObra confirma que bate com o SVC0. */
export const SERVICOS_MODELO: Record<string, { n: string; oficio: string }> = {
  demol: { n: "Demolição e entulho", oficio: "Servente · demolição" }, canal: { n: "Canalização", oficio: "Canalizador" },
  revest: { n: "Revestimento de parede", oficio: "Ladrilhador" }, pav: { n: "Pavimento cerâmico", oficio: "Ladrilhador" },
  loucas: { n: "Montagem de louças", oficio: "Canalizador" }, moveis: { n: "Montagem de móveis", oficio: "Montador" },
  eletr: { n: "Pontos elétricos", oficio: "Eletricista" }, teto: { n: "Teto falso em pladur", oficio: "Montador" },
  pint: { n: "Pintura de tetos e paredes", oficio: "Pintor" },
};
/** O ofício de um serviço como o plano o vê: o do modelo (pela chave) ou o da categoria do Catálogo. */
export const oficioDoServico = (chave: string | null | undefined, categoria: string | null | undefined): string =>
  (chave && SERVICOS_MODELO[chave]?.oficio) || categoria || "";

/** Um serviço da obra (ou da encomenda): o id com que se procura em `K.fasesServico`, o nome e o ofício (como no plano) e os
 *  consumíveis da receita (pelo id do produto e/ou pelo nome). */
export interface ServicoNaObra { sid: string; nome: string; oficio?: string; cons?: { id?: string | null; n?: string | null }[] }
/** O material: o id e o nome (para a receita), o serviço que o instala (o `servico` do produto no Catálogo) e a ilustração. */
export interface MaterialNaObra { id?: string | null; n: string; servico?: string | null; img?: string }
export interface FaseMaterialNaObra {
  fase: FaseObra;
  /** Qual das regras decidiu: o serviço que o instala, a receita de um serviço, ou o nome. */
  por: "instala" | "receita" | "nome";
  /** Os serviços que o justificam (o que o instala, ou os que o gastam, pela primeira fase de cada um), para mostrar "para: …". Vazio
   *  pelo nome. */
  servicos: ServicoNaObra[];
}
/** O mesmo nome, sem acentos nem maiúsculas (a receita e o Catálogo guardam o consumível pelo nome). */
export const mesmoNome = (a?: string | null, b?: string | null): boolean => !!a && !!b && sem(a).trim() === sem(b).trim();

/** A fase de um material numa obra (ou encomenda), com os serviços dela: ver a regra acima. */
export function faseDoMaterialNaObra(K: ComFases | null | undefined, m: MaterialNaObra, servicos: readonly ServicoNaObra[]): FaseMaterialNaObra {
  // a) o serviço que o instala está na obra
  const inst = m.servico ? servicos.find((s) => s.sid === m.servico) : undefined;
  if (inst) return { fase: faseDoProduto(K, { servico: inst.sid, img: m.img }, { nome: inst.nome, oficio: inst.oficio }), por: "instala", servicos: [inst] };
  // b) é consumível da receita de serviços da obra: a primeira fase do que o gasta mais cedo
  const gastam = servicos.filter((s) => s.cons?.some((c) => (!!m.id && c.id === m.id) || mesmoNome(c.n, m.n)));
  if (gastam.length) {
    // pela primeira fase de cada um (o primeiro é o que decide); na mesma fase, pela ordem da obra
    const porFase = gastam.map((s, i) => ({ s, i, f: fasesDoServico(K, s.sid, s.nome, s.oficio)[0] })).sort((a, b) => a.f - b.f || a.i - b.i);
    return { fase: porFase[0].f, por: "receita", servicos: porFase.map((x) => x.s) };
  }
  // c) pelo nome
  return { fase: faseDoMaterial(m.n), por: "nome", servicos: [] };
}

/** Os serviços de uma obra: as linhas de serviço do orçamento e os serviços das tarefas do plano, sem repetidos (pela ordem). Só a forma
 *  do Negócio que interessa, para a Frota a usar sem o motor. */
export function servicosDaObra(d: {
  orc?: { linhas: readonly ({ t: string; sid?: string; q?: number })[] } | null;
  obra: { plano?: { tasks: readonly { svcs: readonly string[] }[] } | null };
}): string[] {
  const L = [...(d.orc?.linhas ?? []).flatMap((l) => (l.t === "svc" && l.sid && (l.q ?? 0) > 0 ? [l.sid] : [])), ...(d.obra.plano?.tasks ?? []).flatMap((t) => t.svcs)];
  return [...new Set(L.filter(Boolean))];
}
