/**
 * Onde vive o segredo da sessao do portal da admissao no browser: SO em memoria.
 *
 * DECISAO (do Miguel): a sessao perde-se ao fechar ou recarregar o separador, e a pessoa confirma
 * de novo o codigo. Por isso:
 *  - nunca `localStorage` nem `sessionStorage` (nem IndexedDB, nem cookies): nada do que sobrevive
 *    ao separador pode guardar um segredo que abre dados pessoais;
 *  - nunca o URL: ficaria em historicos, logs de proxy e no Referer;
 *  - o segredo nao entra no estado do React (que o DevTools e os testes de snapshot mostram): fica
 *    nesta variavel do modulo, que so o hook `useConviteAdmissaoPublico` le para o pôr no
 *    cabecalho `x-portal-sessao`.
 *
 * O custo, assumido: uma recarga acidental (frequente no telemovel) pede outro codigo, e os pedidos
 * estao limitados (1 por minuto, 10 por dia).
 */
let segredo: string | null = null;

export function guardarSessao(sessao: string): void {
  segredo = sessao;
}

export function lerSessao(): string | null {
  return segredo;
}

export function limparSessao(): void {
  segredo = null;
}
