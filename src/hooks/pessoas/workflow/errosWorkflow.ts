// Os erros que a função neg_guardar_regras_qualificacao dá, com mensagem própria do Workflow de Pessoas: NG008 (a organização não tem o
// novo fluxo), NG009 (uma regra inválida) e 42501 (sem a permissão pessoas.config). Qualquer outro erro fica com a mensagem de código.
import { ErroNeg } from "../chamarNeg";
import { CHAVE_ERRO_GENERICO } from "../errosNeg";

const E = "pessoasPagina.real.workflow.error.";
const CHAVES: Readonly<Record<string, string>> = {
  NG008: `${E}ng008`,
  NG009: `${E}ng009`,
  "42501": `${E}permission`,
};

/** A chave de tradução a mostrar para um erro de uma gravação do Workflow. */
export function chaveErroWorkflow(erro: unknown): string {
  if (!(erro instanceof ErroNeg)) return CHAVE_ERRO_GENERICO;
  const propria = erro.codigo !== null && Object.prototype.hasOwnProperty.call(CHAVES, erro.codigo) ? CHAVES[erro.codigo] : null;
  return propria ?? erro.chave;
}
