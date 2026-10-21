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

function chaveDe(erro: unknown, chaves: Readonly<Record<string, string>>): string {
  if (!(erro instanceof ErroNeg)) return CHAVE_ERRO_GENERICO;
  const propria = erro.codigo !== null && Object.prototype.hasOwnProperty.call(chaves, erro.codigo) ? chaves[erro.codigo] : null;
  return propria ?? erro.chave;
}

/** A chave de tradução a mostrar para um erro de uma gravação do Workflow. */
export function chaveErroWorkflow(erro: unknown): string {
  return chaveDe(erro, CHAVES);
}

const N = "pessoasPagina.real.workflow.neg.error.";
const CHAVES_NEGOCIOS: Readonly<Record<string, string>> = {
  NG008: `${N}ng008`,
  NG009: `${N}ng009`,
  "42501": `${N}permission`,
};

/**
 * A chave de tradução do erro de gravar a configuração dos negócios (separador «Negócios»): as mesmas três situações, com mensagem própria
 * (a das regras fala de regras). Nota: quem nem vê a configuração recebe NG008 em vez de 42501, por isso a mensagem de NG008 cobre os dois casos.
 */
export function chaveErroNegocios(erro: unknown): string {
  return chaveDe(erro, CHAVES_NEGOCIOS);
}
