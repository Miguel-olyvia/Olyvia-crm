// Os erros de neg_guardar_questionario e neg_questionario_levantamento, com mensagem própria do separador «Levantamento»: NG008 (a organização
// não tem o levantamento), NG009 (valor inválido; a regra do tipo traz a mensagem da base, que diz qual é a pergunta), NG021 (alguém guardou
// entretanto) e 42501 (sem pessoas.config). Qualquer outro erro fica com a mensagem de código. Não se mexe em errosWorkflow.ts (é da Qualificação).
import { ErroNeg } from "../chamarNeg";
import { CHAVE_ERRO_GENERICO } from "../errosNeg";

const E = "pessoasPagina.real.workflow.";
const CHAVES: Readonly<Record<string, string>> = {
  NG008: `${E}lev.error.ng008`,
  NG009: `${E}lev.error.ng009`,
  NG021: `${E}lev.error.ng021`,
  "42501": `${E}lev.error.permission`,
};

// Na leitura (separador sem dados) só dois erros têm explicação própria; o resto fica com «Não foi possível carregar».
const CHAVES_LEITURA: Readonly<Record<string, string>> = {
  NG008: `${E}lev.loadError.ng008`,
  "42501": `${E}lev.loadError.permission`,
};

const PREFIXO_BASE = /^Questionário inválido:\s*/;
// A regra «o tipo só muda sem respostas» é a única NG009 cuja mensagem da base ajuda o utilizador (diz a pergunta).
const REGRA_DO_TIPO = /já tem respostas/i;

// «secção/pergunta/opção desconhecida»: o rascunho tem um id que a base já não tem (outra pessoa apagou o item). Não apanha «tipo de pergunta
// desconhecido» nem «opções desconhecidas ou repetidas» (esses são valores inválidos, não itens apagados).
const ITEM_DESAPARECIDO = /(?:secção|pergunta|opção) desconhecida/i;

const ehNg009 = (erro: unknown): erro is ErroNeg => erro instanceof ErroNeg && erro.codigo === "NG009";
const ehItemDesaparecido = (erro: unknown): boolean => ehNg009(erro) && ITEM_DESAPARECIDO.test(erro.message);
const ehRegraDoTipo = (erro: unknown): erro is ErroNeg => ehNg009(erro) && REGRA_DO_TIPO.test(erro.message);

/** A chave de tradução a mostrar para um erro de uma leitura ou gravação do levantamento. */
export function chaveErroQuestionario(erro: unknown): string {
  if (!(erro instanceof ErroNeg)) return CHAVE_ERRO_GENERICO;
  if (ehRegraDoTipo(erro)) return `${E}lev.error.ng009Tipo`;
  if (ehItemDesaparecido(erro)) return `${E}lev.error.ng009Desaparecido`;
  const propria = erro.codigo !== null && Object.prototype.hasOwnProperty.call(CHAVES, erro.codigo) ? CHAVES[erro.codigo] : null;
  return propria ?? erro.chave;
}

/** O motivo a juntar a «Não foi possível carregar o levantamento», quando a base o explica (NG008, 42501); senão null. */
export function chaveErroLeitura(erro: unknown): string | null {
  if (!(erro instanceof ErroNeg) || erro.codigo === null) return null;
  return Object.prototype.hasOwnProperty.call(CHAVES_LEITURA, erro.codigo) ? CHAVES_LEITURA[erro.codigo] : null;
}

/** A mensagem da base, só na regra do tipo (a UI traduz tudo o resto pelo código), sem o prefixo «Questionário inválido:». */
export function detalheDaBase(erro: unknown): string | null {
  return ehRegraDoTipo(erro) ? erro.message.replace(PREFIXO_BASE, "") : null;
}

/** NG021: a versão do questionário já não é a que o ecrã leu. */
export const ehConflitoDeVersao = (erro: unknown): boolean => erro instanceof ErroNeg && erro.codigo === "NG021";
