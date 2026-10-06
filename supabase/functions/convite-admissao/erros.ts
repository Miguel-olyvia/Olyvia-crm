/**
 * Catalogo de codigos de erro do convite de admissao, do lado da Edge Function.
 *
 * E UM CONTRATO DE TRES LADOS: a base levanta a excepcao com a MENSAGEM igual
 * ao codigo (e um SQLSTATE proprio da classe HRA), esta funcao traduz-a para o
 * que sai para o browser, e `src/lib/hr/errosAdmissao.ts` (o UNICO catalogo
 * do lado do browser, o que os hooks importam) le-o la. Todo o codigo que
 * chega ao RH ou ao candidato tem de ter ai uma chave de traducao, ou uma
 * excepcao explicita: o teste `src/lib/hr/__tests__/errosAdmissao.test.ts`
 * compara-o com a lista `CODIGOS_PUBLICOS` abaixo.
 *
 * Modulo puro (sem Deno, sem rede): e o que o torna testavel no vitest.
 *
 * Os `pessoa_id` em conflito (HRA13/HRA14) so servem a Edge Function, para
 * gravar o registo da recusa para o RH. NUNCA saem para o publico.
 */

export const CODIGOS_PUBLICOS = [
  "convite_invalido",
  "convite_ja_usado",
  "convite_revogado",
  "convite_expirado",
  "convite_bloqueado",
  "pedido_invalido",
  "nif_invalido",
  "niss_invalido",
  "nif_ja_existe",
  "niss_ja_existe",
  "pais_invalido",
  "iban_invalido",
  "admissao_incompleta",
  "pessoa_nao_encontrada",
  "insufficient_privilege",
  "sem_sessao",
  "accao_desconhecida",
  "demasiadas_tentativas",
  "assinatura_obrigatoria",
  "rascunho_nao_gravado",
  "rascunho_demasiado_grande",
  "erro_inesperado",
  "ficha_incompleta",
  "validade_invalida",
] as const;

export type CodigoPublico = (typeof CODIGOS_PUBLICOS)[number];

/** Os codigos que contam como recusa de uma submissao (ficam registados no convite). */
export const CODIGOS_RECUSA_SUBMISSAO: readonly CodigoPublico[] = [
  "nif_invalido",
  "niss_invalido",
  "nif_ja_existe",
  "niss_ja_existe",
  "pais_invalido",
  "iban_invalido",
  "admissao_incompleta",
  "assinatura_obrigatoria",
  "pedido_invalido",
];

/** SQLSTATE da classe HRA -> codigo (rede de seguranca se a mensagem vier alterada). */
const CODIGO_POR_SQLSTATE: Record<string, CodigoPublico> = {
  HRA01: "convite_invalido",
  HRA02: "convite_ja_usado",
  HRA03: "convite_revogado",
  HRA04: "convite_expirado",
  HRA05: "convite_bloqueado",
  HRA10: "pedido_invalido",
  HRA11: "nif_invalido",
  HRA12: "niss_invalido",
  HRA13: "nif_ja_existe",
  HRA14: "niss_ja_existe",
  HRA15: "pais_invalido",
  HRA16: "iban_invalido",
  HRA17: "admissao_incompleta",
  HRA30: "pessoa_nao_encontrada",
  "42501": "insufficient_privilege",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODIGO_DE_CAMPO = /^[a-z0-9_]+$/;

export interface ErroRpc {
  message?: string | null;
  details?: string | null;
  code?: string | null;
}

export interface ErroMapeado {
  codigo: CodigoPublico;
  /** Codigos de campo em falta; so em `admissao_incompleta`. */
  campos?: string[];
  /** `pessoa_id` das fichas em conflito; so em `*_ja_existe`. NUNCA para o publico. */
  conflitos?: string[];
}

export function eCodigoPublico(valor: unknown): valor is CodigoPublico {
  return typeof valor === "string" && (CODIGOS_PUBLICOS as readonly string[]).includes(valor);
}

function separar(texto: string): string[] {
  return texto.split(",").map((s) => s.trim()).filter((s) => s !== "");
}

export function mapearErroRpc(error: ErroRpc | null | undefined): ErroMapeado {
  const mensagem = (error?.message ?? "").trim();
  const detalhes = (error?.details ?? "").trim();

  // Formato legado: 'admissao_incompleta: a, b' (a lista vinha na mensagem).
  let codigo: CodigoPublico | null = null;
  let legado = "";
  if (eCodigoPublico(mensagem)) {
    codigo = mensagem;
  } else {
    const i = mensagem.indexOf(":");
    if (i > 0 && mensagem.slice(0, i).trim() === "admissao_incompleta") {
      codigo = "admissao_incompleta";
      legado = mensagem.slice(i + 1);
    }
  }
  if (!codigo && error?.code && CODIGO_POR_SQLSTATE[error.code]) {
    codigo = CODIGO_POR_SQLSTATE[error.code];
  }
  if (!codigo) return { codigo: "erro_inesperado" };

  if (codigo === "admissao_incompleta") {
    const campos = separar(detalhes !== "" ? detalhes : legado).filter((c) => CODIGO_DE_CAMPO.test(c));
    return { codigo, campos };
  }
  if (codigo === "nif_ja_existe" || codigo === "niss_ja_existe") {
    return { codigo, conflitos: separar(detalhes).filter((c) => UUID.test(c)) };
  }
  return { codigo };
}

export function statusDoCodigo(codigo: string): number {
  if (codigo.startsWith("convite_")) return 401;
  if (codigo.endsWith("_ja_existe")) return 409;
  if (codigo === "demasiadas_tentativas") return 429;
  if (codigo === "insufficient_privilege") return 403;
  if (codigo === "erro_inesperado") return 500;
  return 400;
}
