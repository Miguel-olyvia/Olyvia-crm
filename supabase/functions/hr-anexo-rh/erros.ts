/**
 * Catalogo de codigos de erro de hr-anexo-rh (anexos pelo RH).
 *
 * Contrato de tres lados: as RPCs rpc_hr_anexo_rh_* devolvem jsonb com a chave
 * `erro` igual a um destes codigos; esta Edge traduz-os para `{error: codigo}`;
 * o browser mapeia cada um para uma chave de traducao (chaveDeErroAnexoRh).
 * Um motivo da base que nao esteja aqui sai como `erro_inesperado`.
 *
 * Modulo puro (sem Deno, sem rede). O catalogo e proprio do RH: nao inclui
 * nenhum codigo `convite_*`.
 */
import { statusDoCodigo } from "../convite-admissao/erros.ts";

export const CODIGOS_RH = [
  // Devolvidos pelas RPCs (plano, seccao 2.2).
  "sem_sessao",
  "pessoa_nao_encontrada",
  "sem_permissao",
  "pedido_invalido",
  "anexo_tipo_invalido",
  "anexo_formato_invalido",
  "anexo_fotografia_formato",
  "anexo_vazio",
  "anexo_demasiado_grande",
  "anexo_fotografia_demasiado_grande",
  "anexo_maximo_ficheiros",
  "anexo_tipo_cheio",
  "anexo_nao_encontrado",
  "anexo_estado_invalido",
  "anexo_falha_envio",
  "anexo_substituto_invalido",
  "anexo_limite_pessoa",
  // So da Edge.
  "erro_inesperado",
  "accao_desconhecida",
  "demasiadas_tentativas",
  // So da Edge: o ficheiro nao chegou a quarentena (confirmar sem upload).
  "anexo_nao_carregado",
] as const;

export type CodigoRh = (typeof CODIGOS_RH)[number];

export function eCodigoRh(valor: unknown): valor is CodigoRh {
  return typeof valor === "string" && (CODIGOS_RH as readonly string[]).includes(valor);
}

/** Estados que o RH acrescenta ou muda em relacao ao catalogo do convite. */
const STATUS_RH: Readonly<Record<string, number>> = {
  sem_permissao: 403,
  pessoa_nao_encontrada: 404,
  sem_sessao: 401,
  anexo_substituto_invalido: 409,
  anexo_limite_pessoa: 429,
  demasiadas_tentativas: 429,
};

export function statusRh(codigo: string): number {
  return STATUS_RH[codigo] ?? statusDoCodigo(codigo);
}
