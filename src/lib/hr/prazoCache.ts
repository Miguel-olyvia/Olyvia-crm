/**
 * A «versao» do prazo de justificar de cada organizacao. O prazo (`hr_justificacao_dia_prazo`) fica em cache 5 minutos por
 * periodo; abrir ou fechar um periodo, ou gravar uma regra do periodo, muda-o. Quem escreve chama `invalidarPrazoDaJustificacao`
 * e quem le (`usePrazoJustificacaoPorPeriodo`) tem a versao na chave da cache: muda a versao, pede-se outra vez.
 * Um modulo proprio (e nao o QueryClient) porque os hooks que escrevem (`useProcessamentoPeriodo`) nao usam react-query.
 */
const versoes = new Map<string, number>();
const ouvintes = new Set<() => void>();

export function versaoDoPrazo(organizationId: string | null | undefined): number {
  return organizationId ? (versoes.get(organizationId) ?? 0) : 0;
}

export function invalidarPrazoDaJustificacao(organizationId: string | null | undefined): void {
  if (!organizationId) return;
  versoes.set(organizationId, versaoDoPrazo(organizationId) + 1);
  ouvintes.forEach((ouvinte) => ouvinte());
}

export function subscreverPrazo(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}