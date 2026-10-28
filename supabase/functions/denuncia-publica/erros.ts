/**
 * Catalogo de codigos de erro da denuncia publica, do lado da Edge Function.
 *
 * CONTRATO DE TRES LADOS: a base levanta a excepcao com a MENSAGEM igual ao codigo e
 * um SQLSTATE da classe HRD (ver DESENHO-denuncias.md, 3.6), esta funcao traduz-a para o
 * que sai para o browser, e o hook do cliente traduz o codigo para texto. Nunca sai nem se
 * regista o texto de um erro do Postgres (a mensagem de um CHECK traz a linha inteira).
 *
 * Modulo puro (sem Deno, sem rede): testavel no vitest.
 */

export const CODIGOS_PUBLICOS = [
  "pedido_invalido",
  "corpo_demasiado_grande",
  "accao_desconhecida",
  "method_not_allowed",
  "demasiadas_tentativas",
  "indisponivel",
  // Codigo inexistente, PIN errado e denuncia bloqueada: SEMPRE este, para nao dizer qual falhou.
  "codigo_ou_pin_invalido",
  "sessao_invalida",
  "canal_inativo",
  "texto_vazio",
  "fechada",
  "anexos_indisponiveis",
  "erro_inesperado",
] as const;

export type CodigoPublico = (typeof CODIGOS_PUBLICOS)[number];

export function eCodigoPublico(valor: unknown): valor is CodigoPublico {
  return typeof valor === "string" && (CODIGOS_PUBLICOS as readonly string[]).includes(valor);
}

/**
 * Mensagens da base (NOVO-20261231994000, "CODIGOS DE ERRO") que NAO sao codigos publicos
 * e o codigo publico que lhes corresponde. As que coincidem (texto_vazio, fechada,
 * canal_inativo, sessao_invalida) passam tal e qual.
 */
const CODIGO_POR_MENSAGEM: Readonly<Record<string, CodigoPublico>> = {
  limite_excedido: "demasiadas_tentativas",
  dados_invalidos: "pedido_invalido",
  limite_mensagens: "pedido_invalido",
};

/**
 * SQLSTATE da classe HRD -> codigo (rede de seguranca se a mensagem vier alterada), com os
 * numeros da migration: HRD04 texto_vazio, HRD08 fechada, HRD19 canal_inativo, HRD22
 * limite_excedido, HRD23 dados_invalidos, HRD24 sessao_invalida, HRD25 limite_mensagens.
 * (HRD21 na base e "visado_em_caso_aberto", do gestor: nunca chega aqui.)
 */
const CODIGO_POR_SQLSTATE: Readonly<Record<string, CodigoPublico>> = {
  HRD04: "texto_vazio",
  HRD08: "fechada",
  HRD19: "canal_inativo",
  HRD22: "demasiadas_tentativas",
  HRD23: "pedido_invalido",
  HRD24: "sessao_invalida",
  HRD25: "pedido_invalido",
};

export interface ErroRpc {
  message?: string | null;
  details?: string | null;
  code?: string | null;
}

export function mapearErroRpc(erro: ErroRpc | null | undefined): { codigo: CodigoPublico } {
  const mensagem = (erro?.message ?? "").trim();
  if (eCodigoPublico(mensagem)) return { codigo: mensagem };
  const porMensagem = Object.prototype.hasOwnProperty.call(CODIGO_POR_MENSAGEM, mensagem) ? CODIGO_POR_MENSAGEM[mensagem] : undefined;
  if (porMensagem) return { codigo: porMensagem };
  const porEstado = erro?.code ? CODIGO_POR_SQLSTATE[erro.code] : undefined;
  return { codigo: porEstado ?? "erro_inesperado" };
}

const STATUS_POR_CODIGO: Readonly<Record<CodigoPublico, number>> = {
  pedido_invalido: 400,
  corpo_demasiado_grande: 413,
  accao_desconhecida: 400,
  method_not_allowed: 405,
  demasiadas_tentativas: 429,
  indisponivel: 503,
  codigo_ou_pin_invalido: 401,
  sessao_invalida: 401,
  canal_inativo: 404,
  texto_vazio: 400,
  fechada: 409,
  anexos_indisponiveis: 410,
  erro_inesperado: 500,
};

export function statusDoCodigo(codigo: string): number {
  return eCodigoPublico(codigo) ? STATUS_POR_CODIGO[codigo] : 400;
}
