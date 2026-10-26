// Códigos de erro das funções neg_* da base e a chave de tradução de cada um.
// A UI traduz pelo CÓDIGO, nunca pela mensagem que vem da base.
const P = "pessoasPagina.erroNeg.";

export const CHAVE_ERRO_GENERICO = `${P}generico`;
/** Dois comerciais da organização com o mesmo nome: o nome escolhido no levantamento não diz qual é (erro do ecrã, não vem da base). */
export const CHAVE_COMERCIAL_AMBIGUO = `${P}comercialAmbiguo`;

/** O email ou o telefone já pertence a outra pessoa da organização (23505 de uq_anew_entities_org_email / uq_anew_entities_org_phone9). */
export const CHAVE_EMAIL_DUPLICADO = `${P}emailDuplicado`;
export const CHAVE_TELEFONE_DUPLICADO = `${P}telefoneDuplicado`;
/** A função que grava o NIF ainda não está publicada (a migration por aplicar, ou o proxy sem ela na lista): a razão diz-se, nada se grava. */
export const CHAVE_NIF_INDISPONIVEL = `${P}nifIndisponivel`;

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
  NG025: `${P}ng025`,
  // NG026 é de outra migration (recusa do orçamento na cadeia) e ainda não tem ecrã.
  NG027: `${P}ng027`,
  NG028: `${P}ng028`,
  // NG030: o NIF já pertence a outra pessoa viva da organização (neg_guardar_nif_pessoa).
  NG030: `${P}ng030`,
  // NG031: recusa genérica do NIF (repetido fora do âmbito de quem chama, ou corrida); a mensagem não diz de quem é.
  NG031: `${P}ng031`,
  "42501": `${P}permissao`,
};

// NG001 a NG025, NG027, NG028, NG030 e NG031, inteiro: nem NG0011 nem xNG001.
const CODIGO_NO_TEXTO = /(?<![A-Za-z0-9])NG0(?:0[1-9]|1[0-9]|2[0-5]|2[78]|3[01])(?![0-9])/;

function texto(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null;
}

const CONSTRAINT_EMAIL = "uq_anew_entities_org_email";
const CONSTRAINT_TELEFONE = "uq_anew_entities_org_phone9";

/**
 * Um 23505 de email ou telefone repetido na organização: qual dos dois, ou null. A constraint lê-se de `message`, `details` ou `constraint`.
 * Este erro é esperado (a UI diz o que se passa); a ficha que já tem o valor não vem no erro, por isso não há atalho para a abrir a partir daqui.
 */
export function duplicadoDoErro(erro: unknown): "email" | "telefone" | null {
  if (typeof erro !== "object" || erro === null) return null;
  const campos = erro as { code?: unknown; message?: unknown; details?: unknown; constraint?: unknown };
  if (campos.code !== "23505") return null;
  const juntos = [campos.message, campos.details, campos.constraint].map((v) => texto(v) ?? "").join(" ");
  if (juntos.includes(CONSTRAINT_EMAIL)) return "email";
  if (juntos.includes(CONSTRAINT_TELEFONE)) return "telefone";
  return null;
}

/**
 * O código conhecido de um erro do PostgREST, ou null.
 * Provisório: a procura em `message`/`details` só corre quando `code` não é
 * uma string ou está vazio; aperta-se depois de medir na nike onde o
 * PostgREST põe o código.
 */
export function codigoDoErro(erro: unknown): string | null {
  if (typeof erro !== "object" || erro === null) return null;
  if (duplicadoDoErro(erro)) return "23505";
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
  const duplicado = duplicadoDoErro(erro);
  if (duplicado) return duplicado === "email" ? CHAVE_EMAIL_DUPLICADO : CHAVE_TELEFONE_DUPLICADO;
  const codigo = codigoDoErro(erro);
  return codigo ? CHAVES_ERRO_NEG[codigo] : CHAVE_ERRO_GENERICO;
}
