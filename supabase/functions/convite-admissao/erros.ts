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
  "bic_invalido",
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
  // Anexos do convite (cartao de cidadao, comprovativo de IBAN, fotografia).
  "anexo_tipo_invalido",
  "anexo_formato_invalido",
  "anexo_fotografia_formato",
  "anexo_demasiado_grande",
  "anexo_fotografia_demasiado_grande",
  "anexo_vazio",
  "anexo_maximo_ficheiros",
  "anexo_tipo_cheio",
  "anexo_limite_convite",
  "anexo_nao_encontrado",
  "anexo_nao_carregado",
  "anexo_estado_invalido",
  "anexo_falha_envio",
] as const;

export type CodigoPublico = (typeof CODIGOS_PUBLICOS)[number];

/**
 * Os codigos da V2 da admissao (20261210420000, HRA31 a HRA39) e o do rascunho
 * recusado pela Edge. Lista SEPARADA de CODIGOS_PUBLICOS de proposito: o
 * catalogo do browser (`src/lib/hr/errosAdmissao.ts`) compara-se com essa
 * lista, e as chaves de traducao destes codigos entram com o frontend da E2.
 * Quando entrarem, passam para CODIGOS_PUBLICOS.
 */
export const CODIGOS_V2 = [
  "nao_encontrado",
  "processo_aberto",
  "organizacao_nao_empregadora",
  "token_invalido",
  "email_invalido",
  "token_repetido",
  "motivo_invalido",
  "estado_invalido",
  "dias_invalidos",
  "prazo_excedido",
  "limite_excedido",
  "rascunho_chave_invalida",
  "rascunho_valor_invalido",
  // V3a da admissao (20261210430000): OTP, sessao do portal e link guardado.
  "otp_espera",
  "otp_limite_diario",
  "otp_expirado",
  "otp_bloqueado",
  "otp_invalido",
  "campo_bloqueado",
  "sessao_ausente",
  "sessao_expirada",
  "sessao_substituida",
  "link_indisponivel",
  // So da Edge (sem SQLSTATE): sem pepper de OTP ou sem correio, e o SMTP a falhar.
  "otp_indisponivel",
  "email_nao_enviado",
  // Os anexos ficam para a fase 2 do portal: respondem 410 (o link sozinho nao escreve).
  "portal_em_atualizacao",
] as const;

export type CodigoV2 = (typeof CODIGOS_V2)[number];

export function eCodigoV2(valor: unknown): valor is CodigoV2 {
  return typeof valor === "string" && (CODIGOS_V2 as readonly string[]).includes(valor);
}

/** Os codigos que contam como recusa de uma submissao (ficam registados no convite). */
export const CODIGOS_RECUSA_SUBMISSAO: readonly CodigoPublico[] = [
  "nif_invalido",
  "niss_invalido",
  "nif_ja_existe",
  "niss_ja_existe",
  "pais_invalido",
  "iban_invalido",
  "bic_invalido",
  "admissao_incompleta",
  "assinatura_obrigatoria",
  "pedido_invalido",
];

/** SQLSTATE da classe HRA -> codigo (rede de seguranca se a mensagem vier alterada). */
const CODIGO_POR_SQLSTATE: Record<string, CodigoPublico | CodigoV2> = {
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
  HRA18: "bic_invalido",
  HRA17: "admissao_incompleta",
  HRA30: "pessoa_nao_encontrada",
  HRA31: "nao_encontrado",
  HRA32: "processo_aberto",
  HRA33: "organizacao_nao_empregadora",
  HRA34: "token_invalido",
  HRA35: "email_invalido",
  HRA36: "token_repetido",
  HRA37: "motivo_invalido",
  HRA38: "estado_invalido",
  HRA39: "dias_invalidos",
  HRA40: "prazo_excedido",
  HRA41: "limite_excedido",
  HRA42: "otp_espera",
  HRA43: "otp_limite_diario",
  HRA44: "otp_expirado",
  HRA45: "otp_bloqueado",
  HRA46: "otp_invalido",
  HRA47: "campo_bloqueado",
  HRA51: "sessao_ausente",
  HRA52: "sessao_expirada",
  HRA53: "sessao_substituida",
  HRA56: "link_indisponivel",
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
  codigo: CodigoPublico | CodigoV2;
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
  let codigo: CodigoPublico | CodigoV2 | null = null;
  let legado = "";
  if (eCodigoPublico(mensagem) || eCodigoV2(mensagem)) {
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

/** Os codigos (anexo_* e da V2) que nao seguem a regra por omissao (400). */
const STATUS_POR_CODIGO: Readonly<Record<string, number>> = {
  anexo_demasiado_grande: 413,
  anexo_fotografia_demasiado_grande: 413,
  anexo_nao_encontrado: 404,
  anexo_nao_carregado: 409,
  anexo_estado_invalido: 409,
  // V2 da admissao.
  nao_encontrado: 404,
  processo_aberto: 409,
  organizacao_nao_empregadora: 403,
  token_invalido: 500,
  token_repetido: 500,
  estado_invalido: 409,
  prazo_excedido: 409,
  limite_excedido: 429,
  // V3a: os limites de OTP contam-se como os de pedidos (429); o codigo errado e
  // 401; o expirado 410; as sessoes 401 (o browser distingue-as pelo codigo).
  otp_espera: 429,
  otp_limite_diario: 429,
  otp_bloqueado: 429,
  otp_invalido: 401,
  otp_expirado: 410,
  campo_bloqueado: 409,
  sessao_ausente: 401,
  sessao_expirada: 401,
  sessao_substituida: 401,
  link_indisponivel: 409,
  otp_indisponivel: 503,
  email_nao_enviado: 502,
  portal_em_atualizacao: 410,
  anexo_maximo_ficheiros: 409,
  anexo_tipo_cheio: 409,
  anexo_limite_convite: 409,
  anexo_formato_invalido: 422,
  anexo_fotografia_formato: 422,
  anexo_vazio: 422,
  anexo_tipo_invalido: 422,
};

export function statusDoCodigo(codigo: string): number {
  if (codigo.startsWith("convite_")) return 401;
  if (codigo in STATUS_POR_CODIGO) return STATUS_POR_CODIGO[codigo];
  if (codigo.endsWith("_ja_existe")) return 409;
  if (codigo === "demasiadas_tentativas") return 429;
  if (codigo === "insufficient_privilege") return 403;
  if (codigo === "erro_inesperado") return 500;
  return 400;
}
