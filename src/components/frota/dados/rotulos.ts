// Os rótulos em português dos valores da BD (a correspondência UI → BD do plano, secção 2) e os tons dos selos.
import type {
  FleetAssignmentKind, FleetComplianceKind, FleetExpenseCategory, FleetExpenseSource, FleetFuelType, FleetIncidentKind, FleetIncidentStatus,
  FleetMaintenanceKind, FleetMaintenanceStatus, FleetOwnership, FleetVehicleCategory, FleetVehicleStatus,
} from "@/integrations/supabase/fleetTypes";

export type Tom = "ok" | "info" | "warn" | "bad" | "violet" | "neu";

export const ESTADOS: Record<FleetVehicleStatus, [Tom, string]> = {
  active: ["ok", "Ativa"], workshop: ["warn", "Em oficina"], stopped: ["neu", "Parada"], inactive: ["neu", "Inativa"], sold: ["neu", "Vendida"],
};
export const COMBUSTIVEIS: Record<FleetFuelType, string> = {
  diesel: "Gasóleo", petrol: "Gasolina", hybrid: "Híbrido", plugin_hybrid: "Híbrido plug-in", electric: "Elétrico", lpg: "GPL", other: "Outro",
};
export const POSSES: Record<FleetOwnership, string> = { owned: "Própria", renting: "Renting", leasing: "Leasing", rental: "Aluguer" };
export const CATEGORIAS: Record<FleetVehicleCategory, string> = {
  light_passenger: "Ligeiro de passageiros", light_goods: "Ligeiro de mercadorias", other: "Outra",
};
export const TIPOS_ATRIB: Record<FleetAssignmentKind, string> = { permanent: "Permanente", temporary: "Pontual" };
export const TIPOS_MANUT: Record<FleetMaintenanceKind, string> = {
  service: "Revisão", inspection: "Inspeção periódica (IPO)", repair: "Reparação", tyres: "Pneus", other: "Outra",
};
export const ESTADOS_MANUT: Record<FleetMaintenanceStatus, [Tom, string]> = {
  scheduled: ["info", "Agendada"], in_progress: ["warn", "Em curso"], done: ["ok", "Concluída"], cancelled: ["neu", "Cancelada"],
};
export const TIPOS_OCORR: Record<FleetIncidentKind, string> = { fine: "Multa", accident: "Sinistro", breakdown: "Avaria" };
export const ESTADOS_OCORR: Record<FleetIncidentStatus, [Tom, string]> = {
  to_identify: ["bad", "Por identificar"], identified: ["info", "Identificado"], in_progress: ["warn", "Em resolução"],
  claimed: ["info", "Participado"], resolved: ["ok", "Resolvido"], logged: ["neu", "Registada"],
};
export const VENC: Record<FleetComplianceKind, string> = {
  insurance: "Seguro", inspection: "Inspeção (IPO)", road_tax: "IUC", lease_contract: "Contrato de renting/leasing",
  green_card: "Carta verde", tachograph: "Tacógrafo", other: "Outro documento",
};
export const CATEGORIAS_CUSTO: Record<FleetExpenseCategory, string> = {
  fuel: "Combustível", charging: "Carregamento", tolls: "Portagens", parking: "Estacionamento", washing: "Lavagem", workshop: "Oficina",
  rent: "Renting / leasing", insurance: "Seguro", road_tax: "IUC", inspection: "Inspeção", fine: "Multa", other: "Outro",
};
/** As categorias que se escolhem no "Registar despesa" (o combustível regista-se em "Registar abastecimento"). */
export const CATEGORIAS_DESPESA: FleetExpenseCategory[] = ["tolls", "parking", "washing", "workshop", "rent", "insurance", "road_tax", "inspection", "fine", "other"];
export const ORIGENS_CUSTO: Record<FleetExpenseSource, string> = {
  manual: "Registo manual", fuel: "Abastecimento", statement: "Extrato", maintenance: "Manutenção", renewal: "Renovação", incident: "Ocorrência",
};

export const opcoesDe = <K extends string>(m: Record<K, string>, chaves?: readonly K[]): { value: string; label: string }[] =>
  (chaves ?? (Object.keys(m) as K[])).map((k) => ({ value: k, label: m[k] }));
