/** O id da aba de um idioma (liga o grupo do conteúdo à aba ativa por aria-labelledby). */
export const idDaAbaDeIdioma = (codigo: string) => `olv-aba-idioma-${codigo}`;

/** O painel «Adicionar uma versão de idioma» (o botão que o abre aponta para ele com aria-controls). */
export const ID_PAINEL_ADICIONAR = "olv-painel-adicionar-idioma";

/** O botão «Adicionar idioma» do cabeçalho do editor (recebe o foco quando a última versão é removida). */
export const ID_BOTAO_ADICIONAR_IDIOMA = "olv-botao-adicionar-idioma";

/** A nota «comum a todos os idiomas» (descreve cada zona desativada de uma versão). */
export const ID_NOTA_COMUM = "olv-nota-comum-idiomas";
