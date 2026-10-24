// O catálogo de trabalhos do orçamento (só exemplo, valores inventados): o custo e o preço de lista de cada um, se é mão de obra
// ou material (o IVA é de 6 % ou de 23 %) e a unidade. As chaves são as MESMAS do levantamento da visita
// (`negocio-metas/levantamentoExemplo.ts`): assim as linhas do levantamento viram as do orçamento sem tradução à mão.
import type { LinhaLevantamento } from "@/components/negocio-metas/negocioMetas";
import type { ChaveUnidade } from "@/components/negocio-metas/levantamentoExemplo";
import type { LinhaTrabalho } from "./orcamentoCalculo";

type TipoTrabalho = "maoDeObra" | "material";

interface Trabalho {
  /** O que a empresa paga por unidade (€). */
  custo: number;
  /** O preço de lista por unidade, sem IVA (€). */
  preco: number;
  tipo: TipoTrabalho;
  unidade: ChaveUnidade;
}

const trabalho = (custo: number, preco: number, tipo: TipoTrabalho, unidade: ChaveUnidade): Trabalho => ({ custo, preco, tipo, unidade });

export const CATALOGO = {
  bancaPorDuche: trabalho(320, 480, "material", "un"),
  sanita: trabalho(140, 220, "material", "un"),
  azulejos: trabalho(20, 34, "material", "m2"),
  canalizacao: trabalho(55, 90, "maoDeObra", "un"),
  bancada: trabalho(180, 290, "material", "m"),
  eletrodomesticos: trabalho(400, 560, "material", "un"),
  pavimento: trabalho(18, 30, "maoDeObra", "m2"),
  caixilharia: trabalho(260, 390, "material", "un"),
  estores: trabalho(85, 130, "material", "un"),
  paredes: trabalho(16, 28, "maoDeObra", "m2"),
  teto: trabalho(14, 24, "maoDeObra", "m2"),
  pintura: trabalho(4, 8, "maoDeObra", "m2"),
  eletricidade: trabalho(40, 70, "maoDeObra", "un"),
  outro: trabalho(50, 85, "maoDeObra", "un"),
} as const satisfies Record<string, Trabalho>;

export type ChaveTrabalho = keyof typeof CATALOGO;

export const CHAVES_CATALOGO = Object.keys(CATALOGO) as ChaveTrabalho[];

/** Uma linha nova, com 1 unidade ao preço de lista. */
export const novaLinhaDoCatalogo = (chave: ChaveTrabalho, id: string): LinhaTrabalho => ({
  id, trabalho: chave, quantidade: 1, precoUnitario: CATALOGO[chave].preco,
});

/**
 * A chave do trabalho cujo rótulo (na língua em que o levantamento foi escrito) é o texto; `null` num trabalho escrito à mão. O
 * rótulo do "Outro" não conta: é o texto livre, e não o nome de um trabalho do catálogo.
 */
export function chaveDoTrabalho(texto: string, rotulo: (chave: ChaveTrabalho) => string): ChaveTrabalho | null {
  return CHAVES_CATALOGO.find((chave) => chave !== "outro" && rotulo(chave) === texto) ?? null;
}

/** Soma de medidas sem o ruído da vírgula flutuante (0,1 + 0,2 = 0,3). */
const somar = (a: number, b: number): number => Math.round((a + b) * 1000) / 1000;

/**
 * As linhas do orçamento a partir do levantamento da visita: o mesmo trabalho em várias divisões soma as medidas numa só linha,
 * ao preço de lista. Um trabalho escrito à mão fica como "outro" com o texto por nome (textos iguais somam, diferentes não).
 */
export function linhasDoLevantamento(
  linhas: readonly LinhaLevantamento[], chaveDe: (trabalho: string) => ChaveTrabalho | null,
): LinhaTrabalho[] {
  const resultado: LinhaTrabalho[] = [];
  for (const l of linhas) {
    const chave = chaveDe(l.trabalho);
    const nome = chave === null ? l.trabalho : undefined;
    const existente = resultado.findIndex((x) => x.trabalho === (chave ?? "outro") && x.nome === nome);
    if (existente >= 0) {
      resultado[existente] = { ...resultado[existente], quantidade: somar(resultado[existente].quantidade, l.medida) };
    } else {
      resultado.push({ ...novaLinhaDoCatalogo(chave ?? "outro", `l${resultado.length + 1}`), quantidade: l.medida, ...(nome === undefined ? {} : { nome }) });
    }
  }
  return resultado;
}
