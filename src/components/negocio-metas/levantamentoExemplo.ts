// As listas fechadas de "Novo negócio": divisões, unidades e os trabalhos sugeridos de cada divisão. São chaves; o
// texto que se vê vem de `negocioMetasNovo.ts` (room.*, work.*, unit.*). Só exemplo.

/** A chave do "Outro": pede um texto curto a seguir. */
export const OUTRO = "outro";

export const DIVISOES = ["casaDeBanho", "cozinha", "sala", "quarto", "exterior", "outra"] as const;

export const UNIDADES = ["m2", "m", "un"] as const;
export type ChaveUnidade = (typeof UNIDADES)[number];

/** Os trabalhos sugeridos de cada divisão (a lista de "Trabalho a fazer" adapta-se à divisão escolhida). */
const TRABALHOS: Record<string, readonly string[]> = {
  casaDeBanho: ["bancaPorDuche", "sanita", "azulejos", "canalizacao"],
  cozinha: ["bancada", "eletrodomesticos", "azulejos", "pavimento"],
  sala: ["pavimento", "pintura", "eletricidade"],
  quarto: ["pavimento", "pintura", "eletricidade"],
  exterior: ["caixilharia", "estores", "paredes", "teto"],
};

const SEM_TRABALHOS: readonly string[] = [];

/** Os trabalhos sugeridos de uma divisão; sem divisão, ou em "Outra", não há sugestões (só o "Outro" com texto). */
export function trabalhosPorDivisao(divisao: string): readonly string[] {
  return TRABALHOS[divisao] ?? SEM_TRABALHOS;
}
