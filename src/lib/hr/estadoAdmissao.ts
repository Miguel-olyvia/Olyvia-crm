/**
 * Os estados da admissao (V2, migration 20261210420000) e o que cada um permite
 * ao RH. As regras espelham as da base, que e quem decide de facto:
 *  - "aberto" e a definicao de `hr_convite_estado_aberto`: tudo menos
 *    concluida, rejeitada e cancelada;
 *  - prolongar so nos estados convidada, em_preenchimento e devolvida, com o
 *    portal ativo ou so expirado (`rpc_hr_convite_admissao_prolongar`);
 *  - cancelar desde `aprovada` desfaz uma decisao de aprovacao e exige tambem
 *    `hr.onboarding.approve` (`rpc_hr_convite_admissao_cancelar`).
 * O ecra usa isto so para mostrar ou esconder botoes: a recusa vem sempre da base.
 */
import type { EstadoAdmissao, EstadoAdmissaoBase, EstadoPortalConvite } from "@/types/hr";

/** Tecto do motivo de cancelamento, igual ao da Edge Function e da base (2000 caracteres). */
export const MOTIVO_CANCELAR_MAX = 2000;

/** Os 11 estados do CHECK da base. */
export const ESTADOS_ADMISSAO: readonly EstadoAdmissaoBase[] = [
  "convidada",
  "em_preenchimento",
  "submetida",
  "devolvida",
  "aprovada",
  "a_aguardar_assinaturas",
  "assinaturas_concluidas",
  "a_aguardar_ativacao",
  "concluida",
  "rejeitada",
  "cancelada",
];

const ESTADOS_FECHADOS: readonly EstadoAdmissao[] = ["concluida", "rejeitada", "cancelada", "terminado"];
const ESTADOS_PORTAL: readonly EstadoPortalConvite[] = ["ativo", "expirado", "revogado", "encerrado"];
const ESTADOS_QUE_PROLONGAM: readonly EstadoAdmissao[] = ["convidada", "em_preenchimento", "devolvida"];
const ESTADOS_DEPOIS_DE_APROVAR: readonly EstadoAdmissao[] = [
  "aprovada",
  "a_aguardar_assinaturas",
  "assinaturas_concluidas",
  "a_aguardar_ativacao",
];

/**
 * O estado que a RPC devolveu, ou `desconhecido`. Os estados da V1 (pendente,
 * usado, revogado...) ja nao existem: nunca se tratam como um estado aberto.
 */
export function estadoAdmissaoDe(valor: unknown): EstadoAdmissao {
  if (valor === "terminado") return "terminado";
  return (ESTADOS_ADMISSAO as readonly unknown[]).includes(valor) ? (valor as EstadoAdmissao) : "desconhecido";
}

export function estadoPortalDe(valor: unknown): EstadoPortalConvite {
  return (ESTADOS_PORTAL as readonly unknown[]).includes(valor) ? (valor as EstadoPortalConvite) : "desconhecido";
}

/**
 * Ha um processo aberto? `desconhecido` conta como aberto: nao se sabe, e
 * oferecer enviar outro convite por cima de um processo a meio e o erro caro.
 */
export function processoAberto(estado: EstadoAdmissao): boolean {
  return !ESTADOS_FECHADOS.includes(estado);
}

export function podeProlongar(estado: EstadoAdmissao, portal: EstadoPortalConvite): boolean {
  return ESTADOS_QUE_PROLONGAM.includes(estado) && (portal === "ativo" || portal === "expirado");
}

/** Cancelar desde `aprovada` desfaz uma aprovacao: exige `hr.onboarding.approve`. */
export function cancelarExigeAprovar(estado: EstadoAdmissao): boolean {
  return ESTADOS_DEPOIS_DE_APROVAR.includes(estado);
}

/** Ha algo a cancelar (estado aberto conhecido) e a permissao basta para esse estado. */
export function podeCancelar(estado: EstadoAdmissao, permissoes: { podeAprovar: boolean }): boolean {
  if (estado === "desconhecido" || !processoAberto(estado)) return false;
  return !cancelarExigeAprovar(estado) || permissoes.podeAprovar;
}
