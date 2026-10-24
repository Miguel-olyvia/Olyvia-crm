// Tipos da Frota escritos à mão a partir de supabase/migrations/20261220100000_fleet_modulo.sql e
// 20261220110000_fleet_documents_entity_type.sql (já aplicadas). NÃO regenerar o types.ts com `supabase gen types`:
// a branch tem tabelas que a BD ainda não tem e o types.ts gerado perdia-as. Quando os tipos forem regenerados com
// aprovação, este ficheiro pode sair e os imports passam para Database["public"]["Tables"]["fleet_*"].
//
// Datas `date` chegam como "AAAA-MM-DD"; `timestamptz` como ISO; `numeric` pode chegar como número ou texto
// (PostgREST devolve numeric como número JSON; por segurança a camada de dados converte com Number()).

export type FleetVehicleStatus = "active" | "workshop" | "stopped" | "inactive" | "sold";
export type FleetVehicleCategory = "light_passenger" | "light_goods" | "other";
export type FleetFuelType = "diesel" | "petrol" | "hybrid" | "plugin_hybrid" | "electric" | "lpg" | "other";
export type FleetOwnership = "owned" | "renting" | "leasing" | "rental";
export type FleetAssignmentKind = "permanent" | "temporary";
export type FleetOdometerSource = "creation" | "manual" | "handover" | "return" | "fuel" | "statement" | "maintenance";
export type FleetMaintenanceKind = "service" | "inspection" | "repair" | "tyres" | "other";
export type FleetMaintenanceStatus = "scheduled" | "in_progress" | "done" | "cancelled";
export type FleetIncidentKind = "fine" | "accident" | "breakdown";
export type FleetIncidentStatus = "to_identify" | "identified" | "in_progress" | "claimed" | "resolved" | "logged";
export type FleetComplianceKind = "insurance" | "inspection" | "road_tax" | "lease_contract" | "green_card" | "tachograph" | "other";
export type FleetExpenseCategory =
  | "fuel" | "charging" | "tolls" | "parking" | "washing" | "workshop" | "rent" | "insurance" | "road_tax" | "inspection" | "fine" | "other";
export type FleetExpenseSource = "manual" | "fuel" | "statement" | "maintenance" | "renewal" | "incident";
export type FleetRestockStatus = "requested" | "transferred" | "cancelled";

/** Vista fleet_v_vehicles (security_invoker): a viatura com o condutor de hoje, os vencimentos atuais e a revisão. */
export interface FleetVehicleView {
  id: string;
  organization_id: string;
  plate: string;
  make: string;
  model: string;
  vehicle_type: string | null;
  vehicle_category: FleetVehicleCategory | null;
  first_registration_on: string | null;
  fuel_type: FleetFuelType;
  ownership: FleetOwnership;
  lessor_supplier_id: string | null;
  monthly_rent: number | null;
  model_year: number | null;
  odometer_km: number;
  odometer_read_on: string | null;
  status: FleetVehicleStatus;
  status_reason: string | null;
  required_licence: string;
  cost_center_id: string | null;
  cost_center_label: string | null;
  personal_use: boolean;
  is_pool: boolean;
  schedule_resource_id: string | null;
  warehouse_id: string | null;
  asset_id: string | null;
  current_assignment_id: string | null;
  current_assignment_kind: FleetAssignmentKind | null;
  current_driver_id: string | null;
  current_driver_name: string | null;
  insurance_until: string | null;
  insurance_policy_no: string | null;
  insurer_supplier_id: string | null;
  inspection_until: string | null;
  road_tax_until: string | null;
  road_tax_exempt: boolean;
  contract_ends_on: string | null;
  service_every_km: number | null;
  service_every_months: number | null;
  service_last_km: number | null;
  service_last_on: string | null;
  service_next_km: number | null;
  service_next_on: string | null;
}

export interface FleetDriver {
  id: string;
  organization_id: string;
  user_id: string | null;
  pessoa_id: string | null;
  full_name: string;
  job_title: string | null;
  team: string | null;
  licence_number: string | null;
  licence_categories: string[];
  licence_expires_on: string | null;
  licence_source: "fleet" | "hr";
  is_active: boolean;
  notes: string | null;
  deleted_at: string | null;
}

export interface FleetAssignment {
  id: string;
  organization_id: string;
  vehicle_id: string;
  driver_id: string;
  kind: FleetAssignmentKind;
  starts_on: string;
  ends_on: string | null;
  returned_on: string | null;
  km_start: number | null;
  km_end: number | null;
  reason: string | null;
  ops_obra_id: string | null;
  ops_ordem_id: string | null;
  schedule_item_id: string | null;
  damage_notes: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export interface FleetOdometerReading {
  id: string;
  vehicle_id: string;
  read_on: string;
  km: number;
  source: FleetOdometerSource;
  is_flagged: boolean;
}

export interface FleetMaintenanceEvent {
  id: string;
  organization_id: string;
  vehicle_id: string;
  kind: FleetMaintenanceKind;
  title: string;
  scheduled_on: string;
  expected_end_on: string | null;
  status: FleetMaintenanceStatus;
  supplier_id: string | null;
  supplier_label: string | null;
  estimated_cost: number | null;
  final_cost: number | null;
  done_on: string | null;
  km: number | null;
  notes: string | null;
  schedule_item_id: string | null;
  incident_id: string | null;
}

export interface FleetIncident {
  id: string;
  organization_id: string;
  vehicle_id: string;
  kind: FleetIncidentKind;
  occurred_at: string;
  location: string;
  description: string;
  amount: number | null;
  notified_on: string | null;
  identify_by: string | null;
  driver_id: string | null;
  driver_notified_at: string | null;
  status: FleetIncidentStatus;
  maintenance_event_id: string | null;
  assignment_id: string | null;
  insurer_claim_no: string | null;
  resolved_at: string | null;
}

export interface FleetCompliance {
  id: string;
  vehicle_id: string;
  kind: FleetComplianceKind;
  valid_from: string | null;
  valid_until: string | null;
  is_exempt: boolean;
  provider_supplier_id: string | null;
  reference: string | null;
  amount: number | null;
  document_id: string | null;
  is_current: boolean;
}

export interface FleetExpense {
  id: string;
  vehicle_id: string;
  spent_on: string;
  category: FleetExpenseCategory;
  quantity: number | null;
  unit: "L" | "kWh" | null;
  amount: number;
  odometer_km: number | null;
  driver_id: string | null;
  supplier_id: string | null;
  supplier_label: string | null;
  cost_center_id: string | null;
  cost_center_label: string | null;
  ops_obra_id: string | null;
  ops_ordem_id: string | null;
  source: FleetExpenseSource;
  import_id: string | null;
  needs_review: boolean;
  review_reason: string | null;
  notes: string | null;
}

export interface FleetExpenseImport {
  id: string;
  file_name: string;
  file_sha256: string;
  supplier_id: string | null;
  rows_total: number;
  rows_imported: number;
  rows_flagged: number;
  rows_skipped: number;
  imported_at: string;
}

export interface FleetRestockRequest {
  id: string;
  organization_id: string;
  vehicle_id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  product_id: string;
  quantity: number;
  status: FleetRestockStatus;
  stock_document_number: string | null;
  last_error: string | null;
  requested_by: string | null;
  requested_at: string;
  done_at: string | null;
}

export interface FleetOpsLink {
  id: string;
  vehicle_id: string;
  ops_ordem_id: string | null;
  ops_obra_id: string | null;
  used_on: string;
  driver_id: string | null;
  km: number | null;
  cost_per_km: number | null;
  travel_cost: number | null;
  ops_custo_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface FleetActivityLog {
  id: string;
  vehicle_id: string | null;
  action: string;
  summary: string;
  detail: string | null;
  entity_type: string | null;
  entity_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
}

/** Colunas de `warehouses` que a Frota lê (is_vehicle ainda não está no types.ts gerado). */
export interface WarehouseFleetColumns {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  is_vehicle: boolean;
  serves_customers: boolean;
}

/* ------------------------------------------------------------------ RPCs (argumentos e resultados) */

export interface FleetLinkOrderResult {
  link_id: string;
  travel_cost: number | null;
  ops_custo_id: string | null;
  cost_not_posted_reason: string | null;
}
export interface FleetCreateVehicleResult {
  vehicle_id: string;
  warehouse_id: string | null;
  schedule_resource_id: string | null;
  default_warehouse_set: boolean;
}
export interface FleetImportResult { import_id: string; total: number; imported: number; flagged: number; skipped: number }
export interface FleetCompleteMaintenanceResult { expense_id: string | null; back_to_active: boolean; inspection_until: string | null }
export interface FleetReturnResult { assignment_id: string; incident_id: string | null }
export type FleetFulfilResult = { id: string; ok: boolean; document_number?: string; error?: string }[];

/** Uma linha do extrato para rpc_fleet_import_statement (p_rows). */
export interface FleetStatementRow {
  spent_on: string;
  plate: string;
  station?: string;
  quantity?: number | null;
  amount: number;
  km?: number | null;
  unit?: "L" | "kWh";
  external_ref?: string;
}

/** Assinaturas das RPCs da Frota (as do SQL: nomes dos parâmetros e tipos de retorno). */
export interface FleetRpcs {
  rpc_fleet_upsert_driver: { args: { p_organization_id: string; p_driver_id: string | null; p_data: Record<string, unknown> }; returns: string };
  rpc_fleet_create_vehicle: { args: { p_organization_id: string; p_data: Record<string, unknown> }; returns: FleetCreateVehicleResult };
  rpc_fleet_update_vehicle: { args: { p_vehicle_id: string; p_data: Record<string, unknown> }; returns: null };
  rpc_fleet_set_status: { args: { p_vehicle_id: string; p_status: FleetVehicleStatus; p_reason: string }; returns: null };
  rpc_fleet_assign: {
    args: {
      p_vehicle_id: string; p_driver_id: string; p_kind: FleetAssignmentKind; p_starts_on: string; p_ends_on: string | null;
      p_km: number | null; p_reason: string | null; p_ops_obra_id: string | null; p_ops_ordem_id: string | null;
    };
    returns: string;
  };
  rpc_fleet_return: { args: { p_assignment_id: string; p_km: number; p_returned_on: string; p_damage_notes: string | null }; returns: FleetReturnResult };
  rpc_fleet_cancel_reservation: { args: { p_assignment_id: string }; returns: null };
  rpc_fleet_record_odometer: { args: { p_vehicle_id: string; p_km: number; p_read_on: string; p_confirm_jump: boolean }; returns: string };
  rpc_fleet_record_fuel: {
    args: { p_vehicle_id: string; p_quantity: number; p_amount: number; p_km: number; p_supplier_id: string | null; p_supplier_label: string | null; p_spent_on: string };
    returns: string;
  };
  rpc_fleet_record_expense: {
    args: {
      p_vehicle_id: string; p_category: FleetExpenseCategory; p_spent_on: string; p_amount: number; p_supplier_id: string | null; p_supplier_label: string | null;
      p_cost_center_id: string | null; p_cost_center_label: string | null; p_ops_obra_id: string | null; p_notes: string | null;
    };
    returns: string;
  };
  rpc_fleet_import_statement: {
    args: { p_organization_id: string; p_file_name: string; p_file_sha256: string; p_supplier_id: string | null; p_rows: FleetStatementRow[]; p_document_id: string | null };
    returns: FleetImportResult;
  };
  rpc_fleet_schedule_maintenance: {
    args: {
      p_vehicle_id: string; p_kind: FleetMaintenanceKind; p_title: string; p_scheduled_on: string; p_expected_end_on: string | null;
      p_supplier_id: string | null; p_supplier_label: string | null; p_estimated_cost: number | null; p_notes: string | null; p_incident_id: string | null;
    };
    returns: string;
  };
  rpc_fleet_complete_maintenance: { args: { p_event_id: string; p_km: number; p_final_cost: number; p_done_on: string }; returns: FleetCompleteMaintenanceResult };
  rpc_fleet_report_incident: {
    args: { p_vehicle_id: string; p_kind: FleetIncidentKind; p_occurred_at: string; p_location: string; p_description: string; p_amount: number | null; p_notified_on: string | null };
    returns: string;
  };
  rpc_fleet_identify_driver: { args: { p_incident_id: string; p_driver_id: string }; returns: null };
  rpc_fleet_resolve_incident: { args: { p_incident_id: string }; returns: null };
  rpc_fleet_renew_compliance: {
    args: { p_vehicle_id: string; p_kind: FleetComplianceKind; p_valid_until: string; p_amount: number | null; p_supplier_id: string | null; p_reference: string | null; p_document_id: string | null };
    returns: string;
  };
  rpc_fleet_set_van_minimum: { args: { p_vehicle_id: string; p_product_id: string; p_minimum: number }; returns: null };
  rpc_fleet_request_restock: { args: { p_vehicle_id: string; p_from_warehouse_id: string }; returns: { request_ids: string[] } };
  rpc_fleet_fulfil_restock: { args: { p_request_ids: string[] }; returns: FleetFulfilResult };
  rpc_fleet_cancel_restock: { args: { p_request_id: string }; returns: null };
  rpc_fleet_link_order: {
    args: { p_vehicle_id: string; p_ops_ordem_id: string | null; p_ops_obra_id: string | null; p_used_on: string; p_driver_id: string | null; p_km: number | null; p_notes: string | null };
    returns: FleetLinkOrderResult;
  };
  rpc_fleet_post_travel_cost: { args: { p_link_id: string }; returns: string };
  /**
   * PROPOSTA (ainda NÃO existe na BD, falta a migração aprovada): resolve uma linha de extrato marcada needs_review.
   * p_accept=true grava as correções (viatura, km, valor), tira o needs_review e, se os km passarem a última leitura,
   * atualiza o conta-quilómetros; p_accept=false apaga a linha. Em ambos os casos acerta rows_flagged da importação.
   * Enquanto não existir, o PostgREST responde PGRST202 e a UI diz "ainda não está disponível na base de dados".
   */
  rpc_fleet_review_expense: {
    args: { p_expense_id: string; p_accept: boolean; p_vehicle_id: string | null; p_km: number | null; p_amount: number | null };
    returns: null;
  };
}
export type FleetRpcName = keyof FleetRpcs;
