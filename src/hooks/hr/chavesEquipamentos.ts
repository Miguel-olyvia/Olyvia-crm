/**
 * As chaves das consultas do equipamento da pessoa que sao um ativo. Ficam num ficheiro so delas para quem escreve (o RH e os Ativos)
 * as poder invalidar sem importar os hooks (que os testes simulam). Todas tem cache de 5 minutos: quem muda quem tem o que, ou o valor, refaz-as.
 */
export const CHAVE_CUSTO_EQUIPAMENTOS = "hr-custo-equipamentos";
export const CHAVE_EQUIPAMENTOS_LIVRES = "hr-equipamentos-livres";
export const CHAVE_OCUPACOES_ATIVO = "hr-ocupacoes-ativo";
