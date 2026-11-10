/**
 * A assinatura da configuracao dos subsidios de ferias e de Natal de um periodo (e a decisao «este periodo paga ferias / Natal»),
 * delegando ao hook real (RPC `rpc_hr_subsidios_assinatura`). So os wrappers desta pasta importam codigo real de RH.
 */
export { useSubsidiosAssinatura, type SubsidiosAssinaturaHook } from "@/hooks/hr/useSubsidiosAssinatura";
export type { SubsidiosAssinaturaLida } from "@/lib/hr/subsidiosConfigRpc";
