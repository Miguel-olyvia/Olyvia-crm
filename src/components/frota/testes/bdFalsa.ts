// Uma BD falsa para os testes da Frota (vi.mock do cliente Supabase): as leituras devolvem as linhas de `bd.tabelas`
// (com os filtros simples eq/is/neq/in aplicados às colunas que existem na linha) e as RPCs passam por `bd.rpc`, um
// vi.fn que regista o nome e os argumentos e devolve o que `bd.respostas[nome]` disser. Uma resposta pode mexer em
// `bd.tabelas` (o efeito da RPC na BD), para os testes verem os ecrãs ligados atualizarem depois da invalidação.
import { vi } from "vitest";
import type {
  FleetAssignment, FleetDriver, FleetIncident, FleetMaintenanceEvent, FleetOpsLink, FleetRestockRequest, FleetVehicleView,
} from "@/integrations/supabase/fleetTypes";
import { addDias, hojeFrota } from "../dados/base";

export const ORG = "org-teste";
export const HOJE = hojeFrota();
export const dia = (n: number): string => addDias(HOJE, n);

type Linha = Record<string, any>;
type Resposta = (args: Record<string, unknown>) => { data?: unknown; error?: { message: string; code?: string } | null };

export const bd = {
  tabelas: {} as Record<string, Linha[]>,
  respostas: {} as Record<string, Resposta>,
  /** Tabelas cuja leitura falha (para testar o aviso de erro). */
  falhar: new Set<string>(),
  rpc: vi.fn(async (nome: string, args: Record<string, unknown>) => {
    const r = bd.respostas[nome]?.(args) ?? {};
    return { data: r.data ?? null, error: r.error ?? null };
  }),
  updates: [] as { tabela: string; valores: unknown; filtro: [string, unknown][] }[],
};

function construtor(tabela: string) {
  const filtros: [string, string, unknown][] = [];
  let atualizar: unknown = undefined;
  const q: Record<string, unknown> = {};
  const encadear = (op: string) => (col: string, v: unknown) => { filtros.push([op, col, v]); return q; };
  for (const op of ["eq", "is", "neq", "in", "gte", "lte", "like"]) q[op] = encadear(op);
  for (const m of ["select", "order", "limit", "or"]) q[m] = () => q;
  q.update = (v: unknown) => { atualizar = v; return q; };
  q.maybeSingle = () => Promise.resolve({ data: (bd.tabelas[tabela] ?? [])[0] ?? null, error: null });
  q.then = (ok: (r: unknown) => unknown, falha?: (e: unknown) => unknown) => {
    if (atualizar !== undefined) {
      bd.updates.push({ tabela, valores: atualizar, filtro: filtros.map(([, c, v]) => [c, v]) });
      return Promise.resolve({ data: null, error: null }).then(ok, falha);
    }
    if (bd.falhar.has(tabela)) return Promise.resolve({ data: null, error: { message: `sem acesso a ${tabela}`, code: "42501" } }).then(ok, falha);
    const linhas = (bd.tabelas[tabela] ?? []).filter((l) => filtros.every(([op, c, v]) => {
      if (c.includes(".") || !(c in l)) return true;
      const x = l[c];
      if (op === "eq") return x === v;
      if (op === "neq") return x !== v;
      if (op === "is") return v === null ? x === null || x === undefined : x === v;
      if (op === "in") return (v as unknown[]).includes(x);
      return true;
    }));
    return Promise.resolve({ data: linhas, error: null }).then(ok, falha);
  };
  return q;
}

/** O módulo "@/integrations/supabase/client" falso. */
export const clienteFalso = {
  supabase: {
    from: (t: string) => construtor(t),
    rpc: (nome: string, args: Record<string, unknown>) => bd.rpc(nome, args),
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "auth-1", email: "ana@teste.pt" } } } }),
      getUser: async () => ({ data: { user: { id: "auth-1" } } }),
    },
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }), createSignedUrl: async () => ({ data: null, error: null }) }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => undefined,
  },
};

/* ------------------------------------------------------------------ dados de exemplo dos testes (datas relativas a hoje) */

export function viaturaBase(o: Partial<FleetVehicleView> = {}): FleetVehicleView {
  return {
    id: "v1", organization_id: ORG, plate: "AA-12-BC", make: "Renault", model: "Master 2.3 dCi", vehicle_type: "Furgão", vehicle_category: "light_goods",
    first_registration_on: "2022-03-01", fuel_type: "diesel", ownership: "owned", lessor_supplier_id: null, monthly_rent: null, model_year: 2022,
    odometer_km: 148230, odometer_read_on: dia(-2), status: "active", status_reason: null, required_licence: "B", cost_center_id: null, cost_center_label: "Instalações",
    personal_use: false, is_pool: false, schedule_resource_id: "res-1", warehouse_id: "wh-v1", asset_id: null,
    current_assignment_id: null, current_assignment_kind: null, current_driver_id: null, current_driver_name: null,
    insurance_until: dia(200), insurance_policy_no: "AP-1", insurer_supplier_id: null, inspection_until: dia(120), road_tax_until: dia(90), road_tax_exempt: false,
    contract_ends_on: null, service_every_km: 30000, service_every_months: 12, service_last_km: 130000, service_last_on: dia(-100),
    service_next_km: 160000, service_next_on: addDias(dia(-100), 365), ...o,
  };
}
export function condutorBase(o: Partial<FleetDriver> = {}): FleetDriver {
  return {
    id: "d1", organization_id: ORG, user_id: "u-1", pessoa_id: null, full_name: "Sofia Martins", job_title: "Técnica", team: "Norte", licence_number: "L-1",
    licence_categories: ["B"], licence_expires_on: dia(900), licence_source: "fleet", is_active: true, notes: null, deleted_at: null, ...o,
  };
}
export function atribBase(o: Partial<FleetAssignment> = {}): FleetAssignment {
  return {
    id: "a1", organization_id: ORG, vehicle_id: "v1", driver_id: "d1", kind: "permanent", starts_on: dia(-30), ends_on: null, returned_on: null, km_start: 140000,
    km_end: null, reason: null, ops_obra_id: null, ops_ordem_id: null, schedule_item_id: null, damage_notes: null, cancelled_at: null, created_at: dia(-30), ...o,
  };
}
export function manutBase(o: Partial<FleetMaintenanceEvent> = {}): FleetMaintenanceEvent {
  return {
    id: "m1", organization_id: ORG, vehicle_id: "v1", kind: "service", title: "Revisão anual", scheduled_on: dia(3), expected_end_on: null, status: "scheduled",
    supplier_id: null, supplier_label: "Oficina Central", estimated_cost: 300, final_cost: null, done_on: null, km: null, notes: null, schedule_item_id: "si-1", incident_id: null, ...o,
  };
}
export function ocorrBase(o: Partial<FleetIncident> = {}): FleetIncident {
  return {
    id: "o1", organization_id: ORG, vehicle_id: "v1", kind: "fine", occurred_at: `${dia(-5)}T09:30:00Z`, location: "A1, Loures", description: "Excesso de velocidade",
    amount: 120, notified_on: dia(-2), identify_by: dia(17), driver_id: null, driver_notified_at: null, status: "to_identify", maintenance_event_id: null,
    assignment_id: null, insurer_claim_no: null, resolved_at: null, ...o,
  };
}
export function pedidoBase(o: Partial<FleetRestockRequest> = {}): FleetRestockRequest {
  return {
    id: "r1", organization_id: ORG, vehicle_id: "v1", from_warehouse_id: "wh-central", to_warehouse_id: "wh-v1", product_id: "p1", quantity: 6, status: "requested",
    stock_document_number: null, last_error: null, requested_by: "u-1", requested_at: `${dia(-1)}T10:00:00Z`, done_at: null, ...o,
  };
}
export function ligacaoBase(o: Partial<FleetOpsLink> = {}): FleetOpsLink {
  return {
    id: "l1", vehicle_id: "v1", ops_ordem_id: "ord-1", ops_obra_id: null, used_on: dia(-1), driver_id: "d1", km: 40, cost_per_km: 0.4, travel_cost: 16,
    ops_custo_id: null, notes: null, created_at: dia(-1), ...o,
  };
}

/** A frota dos testes: duas viaturas (uma carrinha com stock), dois condutores (um sem carta), uma atribuição,
 *  uma reserva futura, uma manutenção, uma multa por identificar, uma avaria, um pedido e uma deslocação pendente. */
export function frotaDeTeste(): void {
  bd.tabelas = {
    fleet_v_vehicles: [
      viaturaBase({ current_assignment_id: "a1", current_assignment_kind: "permanent", current_driver_id: "d1", current_driver_name: "Sofia Martins" }),
      viaturaBase({ id: "v2", plate: "45-XZ-78", make: "Peugeot", model: "Partner", warehouse_id: null, schedule_resource_id: null, odometer_km: 61200, inspection_until: dia(-9) }),
    ],
    fleet_drivers: [condutorBase(), condutorBase({ id: "d2", full_name: "Paulo Mota", user_id: null, licence_categories: [], licence_expires_on: null })],
    fleet_assignments: [
      atribBase(),
      atribBase({ id: "a2", vehicle_id: "v2", driver_id: "d1", kind: "temporary", starts_on: dia(10), ends_on: dia(11), km_start: null, reason: "Obra Odivelas", schedule_item_id: "si-2" }),
    ],
    fleet_odometer_readings: [
      { id: "k1", vehicle_id: "v1", read_on: dia(-60), km: 146000, source: "manual", is_flagged: false },
      { id: "k2", vehicle_id: "v1", read_on: dia(-2), km: 148230, source: "fuel", is_flagged: false },
    ],
    fleet_maintenance_events: [manutBase()],
    fleet_incidents: [ocorrBase(), ocorrBase({ id: "o2", kind: "breakdown", status: "logged", description: "Bateria descarregada", identify_by: null, notified_on: null, amount: null, driver_id: "d1" })],
    fleet_compliance: [],
    fleet_expenses: [
      { id: "e1", vehicle_id: "v1", spent_on: dia(-2), category: "fuel", quantity: 60, unit: "L", amount: 99.5, odometer_km: 148230, driver_id: "d1", supplier_id: null,
        supplier_label: "Galp Loures", cost_center_id: null, cost_center_label: "Instalações", ops_obra_id: null, ops_ordem_id: null, source: "fuel", import_id: null,
        needs_review: false, review_reason: null, notes: null },
    ],
    fleet_expense_imports: [],
    fleet_restock_requests: [pedidoBase()],
    fleet_ops_links: [ligacaoBase()],
    fleet_activity_log: [
      { id: "h1", vehicle_id: "v1", action: "Km", summary: "Km registados.", detail: "148230 km", entity_type: null, entity_id: null, actor_id: "u-1", actor_name: "Ana Teste", created_at: `${dia(-2)}T10:00:00Z` },
    ],
    stocks: [
      { id: "s1", product_id: "p1", warehouse_id: "wh-v1", quantity: 4, minimum_quantity: 10, products: { name: "Tubo multicamada 16 mm", sku: "TM-16" } },
      { id: "s2", product_id: "p2", warehouse_id: "wh-v1", quantity: 8, minimum_quantity: 5, products: { name: "Válvula de esfera 1/2\"", sku: "VE-12" } },
    ],
    suppliers: [{ id: "f1", name: "Oficina Central" }, { id: "f2", name: "Galp" }],
    ops_centro_custo: [{ id: "cc1", nome: "Instalações", codigo: "INS" }],
    ops_obra: [{ id: "obra-1", codigo: "OB-77", titulo: "WC Marta Lima", estado: "em_curso" }],
    ops_ordem: [{ id: "ord-1", codigo: "OT-501", titulo: "Canalização", estado: "agendada" }],
    warehouses: [
      { id: "wh-central", name: "Armazém central", code: "AC", is_active: true, is_vehicle: false, serves_customers: true },
      { id: "wh-v1", name: "Carrinha AA-12-BC", code: "VIA-AA12BC", is_active: true, is_vehicle: true, serves_customers: false },
    ],
    anew_memberships: [{ user_id: "u-1" }, { user_id: "u-2" }],
    anew_users: [{ id: "u-1", name: "Sofia Martins", email: "s@t.pt" }, { id: "u-2", name: "Rui Alves", email: "r@t.pt" }],
    notifications: [],
    documents: [],
  };
}
