/** O painel que a barra de idiomas controla (o conteúdo do idioma ativo) leva este id. */
export const ID_PAINEL_IDIOMA = "olv-painel-idioma-minuta";

/** O id da aba de um idioma (liga a aba ao painel por aria-labelledby). */
export const idDaAbaDeIdioma = (codigo: string) => `olv-aba-idioma-${codigo}`;
