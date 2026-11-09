/**
 * O motivo de anular, ocultar e repor um documento de RH, e os erros dessas RPCs, do lado do ecra.
 *
 * As regras repetem `hr_documento_motivo` (20270111800000): 3 a 2000 caracteres depois de tirar espacos e mudancas de linha das
 * pontas, sem caracteres de controlo (a mudanca de linha e aceite) nem invisiveis. A base e que decide; isto so evita ida e volta
 * e deixa o ecra dizer a razao em texto. Puro: nao importa o cliente da base.
 */

export const MOTIVO_DOCUMENTO_MINIMO = 3;
export const MOTIVO_DOCUMENTO_MAXIMO = 2000;

export type RazaoMotivoInvalido = "curto" | "longo" | "caracteres";

// Controlo (menos \n) e invisiveis: o mesmo conjunto do regex de hr_documento_motivo.
// eslint-disable-next-line no-control-regex -- os caracteres de controlo sao precisamente o que se quer recusar
const CARACTERES_PROIBIDOS = /[\u0001-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/;

/** O que se envia a base: CRLF vira LF (o CR e controlo) e saem espacos e mudancas de linha das pontas. */
export function motivoParaEnvio(motivo: string): string {
  return (motivo ?? "").replace(/\r\n?/g, "\n").replace(/^[ \n]+|[ \n]+$/g, "");
}

/** Porque e que o motivo ainda nao serve, ou `null` se serve. Conta pontos de codigo, como o `length` do Postgres. */
export function razaoMotivoInvalido(motivo: string): RazaoMotivoInvalido | null {
  const enviado = motivoParaEnvio(motivo);
  if (CARACTERES_PROIBIDOS.test(enviado)) return "caracteres";
  const tamanho = Array.from(enviado).length;
  if (tamanho < MOTIVO_DOCUMENTO_MINIMO) return "curto";
  if (tamanho > MOTIVO_DOCUMENTO_MAXIMO) return "longo";
  return null;
}

const CHAVE_POR_SQLSTATE: Readonly<Record<string, string>> = {
  "42501": "hr.documentos.erro.semPermissao",
  HRA31: "hr.documentos.erro.naoEncontrado",
  HRA37: "hr.documentos.erro.motivoInvalido",
  HRA38: "hr.documentos.erro.estadoInvalido",
  HRA62: "hr.documentos.erro.semFicheiro",
};

const CHAVE_POR_MENSAGEM: Readonly<Record<string, string>> = {
  insufficient_privilege: "hr.documentos.erro.semPermissao",
  nao_encontrado: "hr.documentos.erro.naoEncontrado",
  motivo_invalido: "hr.documentos.erro.motivoInvalido",
  estado_invalido: "hr.documentos.erro.estadoInvalido",
  sem_ficheiro: "hr.documentos.erro.semFicheiro",
};

/** A chave de traducao do erro de uma RPC de documentos, ou `null` quando e outra coisa (rede, defeito): nunca o texto cru. */
export function chaveErroDocumento(erro: unknown): string | null {
  if (!erro || typeof erro !== "object") return null;
  const { code, message } = erro as { code?: unknown; message?: unknown };
  if (typeof code === "string" && CHAVE_POR_SQLSTATE[code]) return CHAVE_POR_SQLSTATE[code];
  if (typeof message === "string" && CHAVE_POR_MENSAGEM[message]) return CHAVE_POR_MENSAGEM[message];
  return null;
}

/** 40P01: o Postgres desfez a transaccao por deadlock; repetir resolve. */
export function ehDeadlock(erro: unknown): boolean {
  return !!erro && typeof erro === "object" && (erro as { code?: unknown }).code === "40P01";
}

/** Corre a chamada e, se falhar por deadlock, repete-a UMA vez. Qualquer outro resultado passa como veio. */
export async function comRepeticaoPorDeadlock<T extends { error: unknown }>(chamar: () => PromiseLike<T>): Promise<T> {
  const primeira = await chamar();
  return ehDeadlock(primeira.error) ? await chamar() : primeira;
}
