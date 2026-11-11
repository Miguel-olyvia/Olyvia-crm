/**
 * O banco de horas esta ESCONDIDO na ficha da pessoa (decisao 5 do RH): o cartao e os movimentos mostravam valores de exemplo
 * guardados em memoria (`fluxosC/lojaFluxosC`, semeados por `dados/assiduidadeSetembro`), nao os da base.
 *
 * UM SO INTERRUPTOR, lido em tres sitios da ficha:
 *   - `useEmBancoDeHoras`: o cartao da aba Planeamento (`BancoHorasDaFicha`) e a sub-aba «Banco de horas» da Assiduidade;
 *   - `useMesDaPessoa`: os creditos e debitos (e o saldo) que o calendario do mes desenhava a partir da mesma loja.
 * Nada foi apagado: ligar outra vez o cartao e mudar este valor para `true` (e ligar o banco a dados reais).
 */
export const BANCO_DE_HORAS_VISIVEL = false;
