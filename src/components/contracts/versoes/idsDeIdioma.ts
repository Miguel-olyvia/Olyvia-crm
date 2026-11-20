/** O id da aba de um idioma (liga o grupo do conteúdo à aba ativa por aria-labelledby). */
export const idDaAbaDeIdioma = (codigo: string) => `olv-aba-idioma-${codigo}`;

/** O painel «Adicionar uma versão de idioma» (o botão que o abre aponta para ele com aria-controls). */
export const ID_PAINEL_ADICIONAR = "olv-painel-adicionar-idioma";

/** O botão «Adicionar idioma» do cabeçalho do editor (recebe o foco quando a última versão é removida). */
export const ID_BOTAO_ADICIONAR_IDIOMA = "olv-botao-adicionar-idioma";

/** A nota «comum a todos os idiomas» (descreve cada zona desativada de uma versão). */
export const ID_NOTA_COMUM = "olv-nota-comum-idiomas";

/**
 * Ids estáveis dos campos que a lista de verificação sabe encontrar («ir para o campo»). A chave é o campo:
 * `corpo` (envólucro do editor rico) ou a chave do doc_settings. Só levam id as zonas que editam uma VERSÃO
 * (o painel «Layout Global» reutiliza os mesmos componentes e não pode repetir ids).
 */
export const ID_CAMPO_MINUTA: Record<string, string> = {
  corpo: "olv-minuta-corpo",
  contract_block_title: "olv-minuta-titulo-cabecalho",
  contract_block_number_label: "olv-minuta-rotulo-numero",
  contract_block_date_label: "olv-minuta-rotulo-data",
  contract_block_commercial_label: "olv-minuta-rotulo-comercial",
  footer_text: "olv-minuta-rodape",
  quote_items_title: "olv-minuta-titulo-tabela",
};
