// As listas fechadas de "Novo negócio": serviços, divisões, unidades e os trabalhos sugeridos de cada serviço. São
// chaves; o texto que se vê vem de `negocioMetasNovo.ts` (service.opt.*, room.*, work.*, unit.*). Só exemplo.

/** A chave do "Outro": pede um texto curto a seguir. */
export const OUTRO = "outro";

export const SERVICOS = ["casaDeBanho", "cozinha", "janelas", "isolamento", "remodelacaoTotal", OUTRO] as const;
export type ChaveServico = (typeof SERVICOS)[number];

export const DIVISOES = ["casaDeBanho", "cozinha", "sala", "quarto", "exterior", "outra"] as const;

export const UNIDADES = ["m2", "m", "un"] as const;
export type ChaveUnidade = (typeof UNIDADES)[number];

export const ESTADOS_LEVANTAMENTO = ["porFazer", "feito"] as const;

/** Os trabalhos sugeridos de cada serviço (a lista de "Trabalho a fazer" adapta-se ao serviço escolhido). */
const TRABALHOS: Record<string, readonly string[]> = {
  casaDeBanho: ["bancaPorDuche", "sanita", "azulejos", "canalizacao"],
  cozinha: ["bancada", "eletrodomesticos", "azulejos", "pavimento"],
  janelas: ["caixilharia", "estores"],
  isolamento: ["paredes", "teto"],
  remodelacaoTotal: ["pavimento", "azulejos", "pintura", "eletricidade", "canalizacao"],
};

const SEM_TRABALHOS: readonly string[] = [];

/** Os trabalhos sugeridos de um serviço; sem serviço, ou em "Outro", não há sugestões (só o "Outro" com texto). */
export function trabalhosPorServico(servico: string): readonly string[] {
  return TRABALHOS[servico] ?? SEM_TRABALHOS;
}

/** A divisão que faz sentido por omissão numa linha nova (vazia quando o serviço não aponta para nenhuma). */
export function divisaoPorServico(servico: string): string {
  return servico === "casaDeBanho" || servico === "cozinha" ? servico : "";
}

/** O serviço é uma chave da lista (a lista é fechada). */
export const ehServico = (valor: string): valor is ChaveServico => (SERVICOS as readonly string[]).includes(valor);
