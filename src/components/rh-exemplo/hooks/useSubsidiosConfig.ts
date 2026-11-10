/**
 * A configuracao dos subsidios de ferias e de Natal da organizacao (desde quando, e em que mes se paga cada um), delegando ao hook real
 * (RPCs `rpc_hr_subsidios_config_ler` e `_guardar`). So os wrappers desta pasta importam codigo real de RH.
 */
export { useSubsidiosConfig, type SubsidiosConfigHook, type ResultadoGuardarSubsidios } from "@/hooks/hr/useSubsidiosConfig";
export type { SubsidiosConfigLida } from "@/lib/hr/subsidiosConfigRpc";
