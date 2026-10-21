// Códigos de erro das funções neg_* da base e a chave de tradução de cada um.
// A UI traduz pelo CÓDIGO, nunca pela mensagem que vem da base.
const P = "pessoasPagina.erroNeg.";

export const CHAVE_ERRO_GENERICO = `${P}generico`;

export const CHAVES_ERRO_NEG: Readonly<Record<string, string>> = {
  NG001: `${P}ng001`,
  NG002: `${P}ng002`,
  NG003: `${P}ng003`,
  NG004: `${P}ng004`,
  NG005: `${P}ng005`,
  NG006: `${P}ng006`,
  NG007: `${P}ng007`,
  NG008: `${P}ng008`,
  NG009: `${P}ng009`,
  NG010: `${P}ng010`,
  NG011: `${P}ng011`,
  NG012: `${P}ng012`,
  NG013: `${P}ng013`,
  NG014: `${P}ng014`,
  NG015: `${P}ng015`,
  NG016: `${P}ng016`,
  NG017: `${P}ng017`,
  NG018: `${P}ng018`,
  NG019: `${P}ng019`,
  NG020: `${P}ng020`,
  NG021: `${P}ng021`,
  NG022: `${P}ng022`,
  NG023: `${P}ng023`,
  NG024: `${P}ng024`,
  "42501": `${P}permissao`,
};

// NG001 a NG024, inteiro: nem NG0011 nem xNG001.
const CODIGO_NO_TEXTO = /(?<![A-Za-z0-9])NG0(?:0[1-9]|1[0-9]|2[0-4])(?![0-9])/;

function texto(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null;
}

/**
 * O código conhecido de um erro do PostgREST, ou null.
 * Provisório: a procura em `message`/`details` só corre quando `code` não é
 * uma string ou está vazio; aperta-se depois de medir na nike onde o
 * PostgREST põe o código.
 */
export function codigoDoErro(erro: unknown): string | null {
  if (typeof erro !== "object" || erro === null) return null;
  const campos = erro as { code?: unknown; message?: unknown; details?: unknown };
  const code = texto(campos.code);
  if (code) {
    return Object.prototype.hasOwnProperty.call(CHAVES_ERRO_NEG, code) ? code : null;
  }
  for (const origem of [texto(campos.message), texto(campos.details)]) {
    const achado = origem?.match(CODIGO_NO_TEXTO)?.[0];
    if (achado) return achado;
  }
  return null;
}

/** A chave de tradução do erro; código desconhecido dá a mensagem genérica. */
export function chaveDoErro(erro: unknown): string {
  const codigo = codigoDoErro(erro);
  return codigo ? CHAVES_ERRO_NEG[codigo] : CHAVE_ERRO_GENERICO;
}
