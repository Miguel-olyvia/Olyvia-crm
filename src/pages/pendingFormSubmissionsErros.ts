// A fila de envios de formulário: a tradução dos erros de rpc_resolve_form_submission e a leitura da resposta. A UI traduz pelo CÓDIGO,
// nunca pela mensagem que vem da base.
const S = "pessoasPagina.submissoes.erro.";

export const CHAVE_ERRO_SUBMISSAO_GENERICO = `${S}generico`;

const CHAVES: Readonly<Record<string, string>> = {
  NG002: `${S}ng002`,
  NG003: `${S}ng003`,
  NG029: `${S}ng029`,
  "42501": `${S}permissao`,
};

// Inteiro: nem NG0029 nem xNG002.
const CODIGO_NO_TEXTO = /(?<![A-Za-z0-9])(NG002|NG003|NG029)(?![0-9])/;

function texto(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null;
}

/** O código conhecido de um erro do PostgREST (em `code`, ou na mensagem quando `code` falta), ou null. */
export function codigoDoErroSubmissao(erro: unknown): string | null {
  if (typeof erro !== "object" || erro === null) return null;
  const campos = erro as { code?: unknown; message?: unknown; details?: unknown };
  const code = texto(campos.code);
  if (code && Object.prototype.hasOwnProperty.call(CHAVES, code)) return code;
  for (const origem of [texto(campos.message), texto(campos.details)]) {
    const achado = origem?.match(CODIGO_NO_TEXTO)?.[1];
    if (achado) return achado;
  }
  return null;
}

/** A chave de tradução do erro; um código desconhecido dá a mensagem genérica. */
export function chaveDoErroSubmissao(erro: unknown): string {
  const codigo = codigoDoErroSubmissao(erro);
  return codigo ? CHAVES[codigo] : CHAVE_ERRO_SUBMISSAO_GENERICO;
}

export type RespostaSubmissao = "feito" | "jaResolvida" | "confirmar";

/**
 * O que a RPC respondeu: `acao: 'confirmar'` (há um negócio aberto e falta confirmar), `mudou: false` (já estava resolvida: é sucesso) ou
 * feito. Uma resposta vazia ou estranha conta como feito: a base não deu erro.
 */
export function interpretarRespostaSubmissao(resposta: unknown): RespostaSubmissao {
  if (typeof resposta !== "object" || resposta === null || Array.isArray(resposta)) return "feito";
  const { acao, mudou } = resposta as { acao?: unknown; mudou?: unknown };
  if (acao === "confirmar") return "confirmar";
  return mudou === false ? "jaResolvida" : "feito";
}
