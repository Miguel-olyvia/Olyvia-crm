// Listas de escolha do artigo do fornecedor (reunião de 30/10/2026: o que liga a dados nossos escolhe-se de uma lista, para não haver
// "preto", "Preto" e "PRETO" como coisas diferentes).

/** As unidades em que se vende um artigo (o valor é o que fica em unit_label). */
export const UNIDADES: ReadonlyArray<readonly [string, string]> = [
  ["un", "un (unidade)"], ["cx", "cx (caixa)"], ["emb", "emb (embalagem)"], ["pal", "pal (palete)"], ["par", "par"],
  ["cj", "cj (conjunto)"], ["kit", "kit"], ["rolo", "rolo"], ["saco", "saco"], ["lata", "lata"], ["balde", "balde"],
  ["m", "m (metro)"], ["m2", "m² (metro quadrado)"], ["m3", "m³ (metro cúbico)"], ["ml", "ml (metro linear)"],
  ["kg", "kg (quilo)"], ["g", "g (grama)"], ["t", "t (tonelada)"], ["l", "l (litro)"], ["h", "h (hora)"], ["dia", "dia"],
];

/** As cores mais comuns, para sugerir. A pessoa pode escrever outra. */
export const CORES: readonly string[] = [
  "Branco", "Preto", "Cinzento", "Antracite", "Bege", "Creme", "Castanho", "Azul", "Verde", "Vermelho", "Amarelo", "Laranja",
  "Rosa", "Roxo", "Dourado", "Prateado", "Cromado", "Inox", "Latão", "Cobre", "Madeira natural", "Carvalho", "Nogueira",
  "Transparente", "Mate", "Brilho",
];

const chave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * A cor escrita, igual a uma que já existe quando só muda nas maiúsculas, nos acentos ou nos espaços ("PRETO" → "Preto").
 * Uma cor nova fica com a primeira letra maiúscula.
 */
export function corCanonica(texto: string, conhecidas: readonly string[] = CORES): string {
  const limpo = texto.trim().replace(/\s+/g, " ");
  if (!limpo) return "";
  const igual = conhecidas.find((c) => chave(c) === chave(limpo));
  return igual ?? limpo.charAt(0).toUpperCase() + limpo.slice(1);
}
