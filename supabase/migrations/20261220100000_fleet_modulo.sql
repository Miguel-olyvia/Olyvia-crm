-- ============================================================================
-- 20261220100000_fleet_modulo — Gestão de Frota (migração A)
-- ============================================================================
-- Estado: decisões do Rafael fechadas a 15/10/2026 (ver vault/frota-bd-plano.md,
-- secção "Decisões tomadas"). A segunda migração (documentos) é
-- 20261220110000_fleet_documents_entity_type.sql.
-- NÃO fazer `supabase db push` sem aprovação explícita: há um só Supabase
-- (tzbfgwpckrfbqcolqxtm) e é produção.
--
-- Fonte funcional: src/components/frota-exemplo/** e
-- src/pages/prototipo-negocios/frota/** (acoes.ts, regras.ts, tipos.ts) e
-- vault/frota-prototipo.html.
--
-- Estado ao vivo lido em 15/10/2026 (só leituras, transação read only):
--   • warehouses.serves_customers existe e já é respeitado por
--     fn_client_order_line_reservations (FIFO EC), rpc_confirm_client_order_
--     stock_exit e rpc_get_client_order_document. Uma carrinha com
--     serves_customers = false fica fora da reserva FIFO e das saídas para EC
--     SEM alterar nenhuma função.
--   • "Stock baixo" (rpc_inventory_today, generate-notifications, Stocks.tsx)
--     usa só stocks.reorder_point > 0. O mínimo da carrinha vive em
--     stocks.minimum_quantity e o reorder_point da carrinha fica a 0 → fora do
--     stock baixo SEM alterar funções. O valor do stock continua a somar tudo
--     (a carrinha conta).
--   • documents tem CHECK entity_type IN (quote, proposal, contract, product)
--     e o gatilho documents_validate_entity recusa qualquer outro tipo:
--     tratado na segunda migração (20261220110000), não aqui.
--   • ops_custo só tem ordem_id (NOT NULL) e é escrito pela RPC existente
--     rpc_ops_lancar_custo (gate ops_pode 'operations.costs.view'). A Frota
--     chama essa RPC tal como está; nenhuma função de Operações é alterada.
--   • As tabelas do RH (pessoas_identificacao) NÃO existem: nada aqui depende
--     delas. fleet_drivers.user_id e pessoa_id são opcionais.
--   • schedule_items: board_id NOT NULL, created_by NOT NULL, gatilho
--     prevent_schedule_items_on_holidays (recusa feriados), e
--     check_schedule_conflict devolve conflito para intervalos > 1 dia.
--   • fn_contract_stock_deduction / fn_proposal_stock_deduction escolhem "o
--     único armazém" quando não há default_warehouse_id: criar a carrinha numa
--     organização com 1 armazém e sem default parava a baixa automática. A RPC
--     de criação fixa o default no armazém que já existia (comportamento igual).
--   • Não existem tabelas routes nem pedidos de transferência; incidents
--     existe com 0 linhas (legado, não se reaproveita).
--
-- Esta secção A só CRIA: tabelas fleet_*, 1 vista, funções novas, políticas,
-- 1 coluna opcional em warehouses (DEFAULT false) + 1 CHECK que nenhuma linha
-- atual viola, 4 permissões novas (+ sementeira) e 1 job pg_cron. Nenhuma
-- função existente é alterada. Única alteração temporária a um objeto
-- existente: DISABLE/ENABLE TRIGGER USER em anew_role_permissions durante a
-- sementeira (padrão de 20261210130000).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- ============================================================================
-- A.1 Armazém móvel: marca da viatura em warehouses
-- ============================================================================
ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS is_vehicle boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.warehouses.is_vehicle IS
  'Armazém móvel (carrinha da Frota, fleet_vehicles.warehouse_id). Nunca serve clientes (CHECK warehouses_vehicle_not_serving): fica fora da reserva FIFO e das saídas das encomendas de cliente. O stock conta no valor do inventário.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'warehouses_vehicle_not_serving'
                   AND conrelid = 'public.warehouses'::regclass) THEN
    ALTER TABLE public.warehouses
      ADD CONSTRAINT warehouses_vehicle_not_serving
      CHECK (NOT is_vehicle OR NOT serves_customers);
  END IF;
END $$;

-- ============================================================================
-- A.2 Tabelas
-- ============================================================================

-- Condutores. A carta vive aqui até Pessoas (RH) chegar à main; pessoa_id é a
-- ligação futura (sem FK porque a tabela ainda não existe na main).
CREATE TABLE IF NOT EXISTS public.fleet_drivers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  user_id             uuid NULL REFERENCES public.anew_users(id) ON DELETE SET NULL,
  pessoa_id           uuid NULL,
  full_name           text NOT NULL CHECK (btrim(full_name) <> ''),
  job_title           text NULL,
  team                text NULL,
  licence_number      text NULL,
  licence_categories  text[] NOT NULL DEFAULT '{}',
  licence_expires_on  date NULL,
  licence_source      text NOT NULL DEFAULT 'fleet' CHECK (licence_source IN ('fleet', 'hr')),
  is_active           boolean NOT NULL DEFAULT true,
  notes               text NULL,
  created_by          uuid NULL REFERENCES public.anew_users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_drivers_org_user_uq
  ON public.fleet_drivers (organization_id, user_id) WHERE user_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS fleet_drivers_org_idx ON public.fleet_drivers (organization_id) WHERE deleted_at IS NULL;
COMMENT ON COLUMN public.fleet_drivers.pessoa_id IS 'Ligação futura a Pessoas (RH, ramo feature/rh-pessoas). Quando existir, a carta passa a vir de pessoas_identificacao.carta_conducao_* (licence_source = hr).';

-- Viaturas (ativos, não stock). Sem dados contabilísticos: asset_id liga ao
-- futuro módulo Gestão de Ativos (valor, amortização, abate).
CREATE TABLE IF NOT EXISTS public.fleet_vehicles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  plate                 text NOT NULL CHECK (plate ~ '^[A-Z0-9]{1,3}(-[A-Z0-9]{1,3}){1,3}$'),
  make                  text NOT NULL,
  model                 text NOT NULL,
  vehicle_type          text NULL,
  -- Categoria legal para a periodicidade da IPO (fn_fleet_next_inspection).
  -- NULL ou 'other' = +12 meses (prudente) até ser preenchida.
  vehicle_category      text NULL CHECK (vehicle_category IS NULL OR vehicle_category IN ('light_passenger', 'light_goods', 'other')),
  first_registration_on date NULL,
  fuel_type             text NOT NULL DEFAULT 'diesel'
                        CHECK (fuel_type IN ('diesel', 'petrol', 'hybrid', 'plugin_hybrid', 'electric', 'lpg', 'other')),
  ownership             text NOT NULL DEFAULT 'owned' CHECK (ownership IN ('owned', 'renting', 'leasing', 'rental')),
  lessor_supplier_id    uuid NULL REFERENCES public.suppliers(id) ON DELETE SET NULL,
  monthly_rent          numeric(12,2) NULL CHECK (monthly_rent IS NULL OR monthly_rent >= 0),
  model_year            smallint NULL,
  vin                   text NULL,
  odometer_km           integer NOT NULL DEFAULT 0 CHECK (odometer_km >= 0),
  odometer_read_on      date NULL,
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'workshop', 'stopped', 'inactive', 'sold')),
  status_reason         text NULL,
  status_changed_at     timestamptz NULL,
  required_licence      text NOT NULL DEFAULT 'B',
  cost_center_id        uuid NULL REFERENCES public.ops_centro_custo(id) ON DELETE SET NULL,
  cost_center_label     text NULL,
  personal_use          boolean NOT NULL DEFAULT false,
  is_pool               boolean NOT NULL DEFAULT false,
  schedule_resource_id  uuid NULL REFERENCES public.schedule_resources(id) ON DELETE SET NULL,
  warehouse_id          uuid NULL REFERENCES public.warehouses(id) ON DELETE SET NULL,
  asset_id              uuid NULL,
  notes                 text NULL,
  created_by            uuid NULL REFERENCES public.anew_users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz NULL,
  deleted_by            uuid NULL REFERENCES public.anew_users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_vehicles_org_plate_uq
  ON public.fleet_vehicles (organization_id, plate) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fleet_vehicles_resource_uq
  ON public.fleet_vehicles (schedule_resource_id) WHERE schedule_resource_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fleet_vehicles_warehouse_uq
  ON public.fleet_vehicles (warehouse_id) WHERE warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fleet_vehicles_org_status_idx
  ON public.fleet_vehicles (organization_id, status) WHERE deleted_at IS NULL;
COMMENT ON COLUMN public.fleet_vehicles.asset_id IS 'Ligação futura ao módulo Gestão de Ativos (sem FK enquanto a tabela não existir). A Frota não guarda valor, amortização nem abate.';

-- Plano de revisão (por km ou meses, o que chegar primeiro).
CREATE TABLE IF NOT EXISTS public.fleet_maintenance_plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  vehicle_id       uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  kind             text NOT NULL DEFAULT 'service' CHECK (kind IN ('service', 'other')),
  title            text NOT NULL DEFAULT 'Revisão',
  every_km         integer NULL CHECK (every_km IS NULL OR every_km > 0),
  every_months     integer NULL CHECK (every_months IS NULL OR every_months > 0),
  last_km          integer NULL CHECK (last_km IS NULL OR last_km >= 0),
  last_done_on     date NULL,
  is_active        boolean NOT NULL DEFAULT true,
  created_by       uuid NULL REFERENCES public.anew_users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (every_km IS NOT NULL OR every_months IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_maintenance_plans_active_uq
  ON public.fleet_maintenance_plans (vehicle_id, kind) WHERE is_active;

-- Atribuições (permanentes) e reservas (pontuais).
CREATE TABLE IF NOT EXISTS public.fleet_assignments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  vehicle_id        uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE RESTRICT,
  driver_id         uuid NOT NULL REFERENCES public.fleet_drivers(id) ON DELETE RESTRICT,
  kind              text NOT NULL CHECK (kind IN ('permanent', 'temporary')),
  starts_on         date NOT NULL,
  ends_on           date NULL,
  returned_on       date NULL,
  km_start          integer NULL CHECK (km_start IS NULL OR km_start >= 0),
  km_end            integer NULL CHECK (km_end IS NULL OR km_end >= 0),
  reason            text NULL,
  ops_obra_id       uuid NULL REFERENCES public.ops_obra(id) ON DELETE SET NULL,
  ops_ordem_id      uuid NULL REFERENCES public.ops_ordem(id) ON DELETE SET NULL,
  schedule_item_id  uuid NULL REFERENCES public.schedule_items(id) ON DELETE SET NULL,
  damage_notes      text NULL,
  cancelled_at      timestamptz NULL,
  cancelled_by      uuid NULL REFERENCES public.anew_users(id) ON DELETE SET NULL,
  created_by        uuid NULL REFERENCES public.anew_users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CHECK (kind = 'permanent' OR ends_on IS NOT NULL),
  CHECK (km_end IS NULL OR km_start IS NULL OR km_end >= km_start)
);
CREATE INDEX IF NOT EXISTS fleet_assignments_vehicle_idx ON public.fleet_assignments (vehicle_id, starts_on DESC);
CREATE INDEX IF NOT EXISTS fleet_assignments_driver_idx ON public.fleet_assignments (driver_id, starts_on DESC);
CREATE INDEX IF NOT EXISTS fleet_assignments_obra_idx ON public.fleet_assignments (ops_obra_id) WHERE ops_obra_id IS NOT NULL;
-- Uma só atribuição permanente aberta por viatura e por condutor.
CREATE UNIQUE INDEX IF NOT EXISTS fleet_assignments_open_perm_vehicle_uq
  ON public.fleet_assignments (vehicle_id) WHERE kind = 'permanent' AND ends_on IS NULL AND cancelled_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fleet_assignments_open_perm_driver_uq
  ON public.fleet_assignments (driver_id) WHERE kind = 'permanent' AND ends_on IS NULL AND cancelled_at IS NULL;

-- Leituras de km (com origem).
CREATE TABLE IF NOT EXISTS public.fleet_odometer_readings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  vehicle_id       uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  read_on          date NOT NULL,
  km               integer NOT NULL CHECK (km >= 0),
  source           text NOT NULL CHECK (source IN ('creation', 'manual', 'handover', 'return', 'fuel', 'statement', 'maintenance')),
  source_id        uuid NULL,
  is_flagged       boolean NOT NULL DEFAULT false,
  recorded_by      uuid NULL REFERENCES public.anew_users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_odometer_readings_vehicle_idx
  ON public.fleet_odometer_readings (vehicle_id, read_on DESC, km DESC);

-- Extratos importados (cartão frota, Via Verde...).
CREATE TABLE IF NOT EXISTS public.fleet_expense_imports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  file_name        text NOT NULL,
  file_sha256      text NOT NULL,
  supplier_id      uuid NULL REFERENCES public.suppliers(id) ON DELETE SET NULL,
  rows_total       integer NOT NULL DEFAULT 0,
  rows_imported    integer NOT NULL DEFAULT 0,
  rows_flagged     integer NOT NULL DEFAULT 0,
  rows_skipped     integer NOT NULL DEFAULT 0,
  document_id      uuid NULL REFERENCES public.documents(id) ON DELETE SET NULL,
  imported_by      uuid NULL REFERENCES public.anew_users(id) ON DELETE SET NULL,
  imported_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_expense_imports_file_uq
  ON public.fleet_expense_imports (organization_id, file_sha256);

-- Manutenções: revisões, inspeções, reparações (agendadas, em curso, feitas).
CREATE TABLE IF NOT EXISTS public.fleet_maintenance_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  vehicle_id         uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  kind               text NOT NULL CHECK (kind IN ('service', 'inspection', 'repair', 'tyres', 'other')),
  title              text NOT NULL,
  scheduled_on       date NOT NULL,
  expected_end_on    date NULL,
  status             text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'done', 'cancelled')),
  supplier_id        uuid NULL REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_label     text NULL,
  estimated_cost     numeric(12,2) NULL CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  final_cost         numeric(12,2) NULL CHECK (final_cost IS NULL OR final_cost >= 0),
  done_on            date NULL,
  km                 integer NULL CHECK (km IS NULL OR km >= 0),
  notes              text NULL,
  schedule_item_id   uuid NULL REFERENCES public.schedule_items(id) ON DELETE SET NULL,
  purchase_order_id  uuid NULL REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  incident_id        uuid NULL,
  created_by         uuid NULL REFERENCES public.anew_users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (expected_end_on IS NULL OR expected_end_on >= scheduled_on)
);
CREATE INDEX IF NOT EXISTS fleet_maintenance_events_vehicle_idx
  ON public.fleet_maintenance_events (vehicle_id, scheduled_on DESC);
CREATE INDEX IF NOT EXISTS fleet_maintenance_events_open_idx
  ON public.fleet_maintenance_events (organization_id, scheduled_on) WHERE status IN ('scheduled', 'in_progress');

-- Ocorrências: multas, sinistros e avarias.
CREATE TABLE IF NOT EXISTS public.fleet_incidents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  vehicle_id            uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  kind                  text NOT NULL CHECK (kind IN ('fine', 'accident', 'breakdown')),
  occurred_at           timestamptz NOT NULL,
  location              text NOT NULL,
  description           text NOT NULL,
  amount                numeric(12,2) NULL CHECK (amount IS NULL OR amount >= 0),
  notified_on           date NULL,
  identify_by           date NULL,
  driver_id             uuid NULL REFERENCES public.fleet_drivers(id) ON DELETE SET NULL,
  driver_notified_at    timestamptz NULL,
  status                text NOT NULL
                        CHECK (status IN ('to_identify', 'identified', 'in_progress', 'claimed', 'resolved', 'logged')),
  maintenance_event_id  uuid NULL REFERENCES public.fleet_maintenance_events(id) ON DELETE SET NULL,
  assignment_id         uuid NULL REFERENCES public.fleet_assignments(id) ON DELETE SET NULL,
  insurer_claim_no      text NULL,
  resolved_at           timestamptz NULL,
  resolved_by           uuid NULL REFERENCES public.anew_users(id) ON DELETE SET NULL,
  created_by            uuid NULL REFERENCES public.anew_users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_incidents_vehicle_idx ON public.fleet_incidents (vehicle_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS fleet_incidents_open_fines_idx
  ON public.fleet_incidents (organization_id, identify_by) WHERE kind = 'fine' AND status = 'to_identify';
CREATE INDEX IF NOT EXISTS fleet_incidents_driver_idx ON public.fleet_incidents (driver_id) WHERE driver_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_maintenance_events_incident_fk') THEN
    ALTER TABLE public.fleet_maintenance_events
      ADD CONSTRAINT fleet_maintenance_events_incident_fk
      FOREIGN KEY (incident_id) REFERENCES public.fleet_incidents(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Vencimentos: seguro, inspeção (IPO), IUC, contrato de renting/leasing...
-- Renovar = nova linha; a anterior fica is_current = false (histórico).
CREATE TABLE IF NOT EXISTS public.fleet_compliance (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  vehicle_id            uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  kind                  text NOT NULL
                        CHECK (kind IN ('insurance', 'inspection', 'road_tax', 'lease_contract', 'green_card', 'tachograph', 'other')),
  valid_from            date NULL,
  valid_until           date NULL,
  is_exempt             boolean NOT NULL DEFAULT false,
  provider_supplier_id  uuid NULL REFERENCES public.suppliers(id) ON DELETE SET NULL,
  reference             text NULL,
  amount                numeric(12,2) NULL CHECK (amount IS NULL OR amount >= 0),
  document_id           uuid NULL REFERENCES public.documents(id) ON DELETE SET NULL,
  is_current            boolean NOT NULL DEFAULT true,
  replaced_at           timestamptz NULL,
  created_by            uuid NULL REFERENCES public.anew_users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (is_exempt OR valid_until IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_compliance_current_uq
  ON public.fleet_compliance (vehicle_id, kind) WHERE is_current;
CREATE INDEX IF NOT EXISTS fleet_compliance_due_idx
  ON public.fleet_compliance (organization_id, valid_until) WHERE is_current AND NOT is_exempt;

-- Custos: combustível, carregamento, portagens, oficina, rendas...
CREATE TABLE IF NOT EXISTS public.fleet_expenses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  vehicle_id            uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  spent_on              date NOT NULL,
  category              text NOT NULL
                        CHECK (category IN ('fuel', 'charging', 'tolls', 'parking', 'washing', 'workshop', 'rent',
                                            'insurance', 'road_tax', 'inspection', 'fine', 'other')),
  quantity              numeric(12,3) NULL CHECK (quantity IS NULL OR quantity > 0),
  unit                  text NULL CHECK (unit IS NULL OR unit IN ('L', 'kWh')),
  amount                numeric(12,2) NOT NULL CHECK (amount >= 0),
  odometer_km           integer NULL CHECK (odometer_km IS NULL OR odometer_km >= 0),
  driver_id             uuid NULL REFERENCES public.fleet_drivers(id) ON DELETE SET NULL,
  supplier_id           uuid NULL REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_label        text NULL,
  cost_center_id        uuid NULL REFERENCES public.ops_centro_custo(id) ON DELETE SET NULL,
  cost_center_label     text NULL,
  ops_obra_id           uuid NULL REFERENCES public.ops_obra(id) ON DELETE SET NULL,
  ops_ordem_id          uuid NULL REFERENCES public.ops_ordem(id) ON DELETE SET NULL,
  source                text NOT NULL DEFAULT 'manual'
                        CHECK (source IN ('manual', 'fuel', 'statement', 'maintenance', 'renewal', 'incident')),
  import_id             uuid NULL REFERENCES public.fleet_expense_imports(id) ON DELETE SET NULL,
  external_ref          text NULL,
  needs_review          boolean NOT NULL DEFAULT false,
  review_reason         text NULL,
  maintenance_event_id  uuid NULL REFERENCES public.fleet_maintenance_events(id) ON DELETE SET NULL,
  compliance_id         uuid NULL REFERENCES public.fleet_compliance(id) ON DELETE SET NULL,
  incident_id           uuid NULL REFERENCES public.fleet_incidents(id) ON DELETE SET NULL,
  notes                 text NULL,
  created_by            uuid NULL REFERENCES public.anew_users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_expenses_vehicle_idx ON public.fleet_expenses (vehicle_id, spent_on DESC);
CREATE INDEX IF NOT EXISTS fleet_expenses_org_date_idx ON public.fleet_expenses (organization_id, spent_on DESC);
CREATE INDEX IF NOT EXISTS fleet_expenses_obra_idx ON public.fleet_expenses (ops_obra_id) WHERE ops_obra_id IS NOT NULL;
-- A mesma linha de extrato não entra duas vezes (mesmo de ficheiros diferentes).
CREATE UNIQUE INDEX IF NOT EXISTS fleet_expenses_external_ref_uq
  ON public.fleet_expenses (organization_id, COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid), external_ref)
  WHERE external_ref IS NOT NULL;

-- Pedidos de reposição da carrinha (armazém central → carrinha). A
-- transferência real é rpc_register_stock_transfer, chamada ao satisfazer.
CREATE TABLE IF NOT EXISTS public.fleet_restock_requests (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  vehicle_id             uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  from_warehouse_id      uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id        uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  product_id             uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity               integer NOT NULL CHECK (quantity > 0),
  status                 text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'transferred', 'cancelled')),
  stock_document_number  text NULL,
  transfer_group_id      uuid NULL,
  last_error             text NULL,
  requested_by           uuid NULL REFERENCES public.anew_users(id) ON DELETE SET NULL,
  requested_at           timestamptz NOT NULL DEFAULT now(),
  done_by                uuid NULL REFERENCES public.anew_users(id) ON DELETE SET NULL,
  done_at                timestamptz NULL,
  CHECK (from_warehouse_id <> to_warehouse_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_restock_requests_pending_uq
  ON public.fleet_restock_requests (to_warehouse_id, product_id) WHERE status = 'requested';
CREATE INDEX IF NOT EXISTS fleet_restock_requests_org_idx
  ON public.fleet_restock_requests (organization_id, status, requested_at DESC);

-- Ligação ordem/obra ↔ viatura (que viatura foi, km, custo da deslocação).
CREATE TABLE IF NOT EXISTS public.fleet_ops_links (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  vehicle_id       uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  ops_ordem_id     uuid NULL REFERENCES public.ops_ordem(id) ON DELETE CASCADE,
  ops_obra_id      uuid NULL REFERENCES public.ops_obra(id) ON DELETE CASCADE,
  used_on          date NOT NULL,
  driver_id        uuid NULL REFERENCES public.fleet_drivers(id) ON DELETE SET NULL,
  km               integer NULL CHECK (km IS NULL OR km >= 0),
  cost_per_km      numeric(10,4) NULL CHECK (cost_per_km IS NULL OR cost_per_km >= 0),
  travel_cost      numeric(12,2) GENERATED ALWAYS AS (round(COALESCE(km, 0) * COALESCE(cost_per_km, 0), 2)) STORED,
  ops_custo_id     uuid NULL REFERENCES public.ops_custo(id) ON DELETE SET NULL,
  notes            text NULL,
  created_by       uuid NULL REFERENCES public.anew_users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (ops_ordem_id IS NOT NULL OR ops_obra_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS fleet_ops_links_ordem_idx ON public.fleet_ops_links (ops_ordem_id) WHERE ops_ordem_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fleet_ops_links_obra_idx ON public.fleet_ops_links (ops_obra_id) WHERE ops_obra_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fleet_ops_links_vehicle_idx ON public.fleet_ops_links (vehicle_id, used_on DESC);

-- Histórico de atividade (ecrã Atividade e aba Histórico da ficha).
CREATE TABLE IF NOT EXISTS public.fleet_activity_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  vehicle_id       uuid NULL REFERENCES public.fleet_vehicles(id) ON DELETE SET NULL,
  action           text NOT NULL,
  summary          text NOT NULL,
  detail           text NULL,
  entity_type      text NULL,
  entity_id        uuid NULL,
  actor_id         uuid NULL REFERENCES public.anew_users(id) ON DELETE SET NULL,
  actor_name       text NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_activity_log_org_idx ON public.fleet_activity_log (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fleet_activity_log_vehicle_idx ON public.fleet_activity_log (vehicle_id, created_at DESC) WHERE vehicle_id IS NOT NULL;

-- updated_at
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fleet_drivers', 'fleet_vehicles', 'fleet_maintenance_plans', 'fleet_assignments',
                           'fleet_maintenance_events', 'fleet_incidents', 'fleet_expenses'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;
END $$;

-- ============================================================================
-- A.3 Permissões (mecanismo anew_permissions / anew_role_permissions)
-- ============================================================================
INSERT INTO public.anew_permissions (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('fleet.view', 'Ver a Frota',
   'Abre a Gestão de Frota e consulta viaturas, condutores, atribuições, manutenções, ocorrências e vencimentos da organização.',
   'fleet', NULL, 0, false, 'organization', false),
  ('fleet.manage', 'Gerir a Frota',
   'Cria viaturas e condutores (com ou sem conta no CRM), atribui e reserva, devolve, muda o estado, agenda e conclui manutenções, identifica condutores de multas e resolve ocorrências. Cria o recurso da viatura e o quadro Frota na Agenda. Criar o armazém móvel exige também warehouses.create.',
   'fleet', NULL, 1, false, 'organization', false),
  ('fleet.costs', 'Custos da Frota',
   'Vê e regista os custos das viaturas: despesas, importação de extratos e renovação de seguro, inspeção e IUC.',
   'fleet', NULL, 2, true, 'organization', false),
  ('fleet.self', 'Registar na própria viatura',
   'O condutor vê a viatura que tem atribuída e regista nela km, abastecimentos, ocorrências e pedidos de reposição da carrinha.',
   'fleet', NULL, 3, false, 'organization', false)
ON CONFLICT (code) DO NOTHING;

-- Sementeira por equivalência com o gate de hoje da Frota de exemplo
-- (contexto.ts: ver = inventory.view, agir = inventory.edit). Ninguém ganha
-- acesso a dados que já não via. fleet.self vai para os papéis com
-- operations.orders.execute (decisão 2).
-- DISABLE TRIGGER USER como em 20261210130000 (trg_protect_system_role_perms
-- e trg_audit_anew_role_permissions ficam desligados só durante estes INSERT).
ALTER TABLE public.anew_role_permissions DISABLE TRIGGER USER;

INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT ro.id, 'fleet.view', NULL::uuid
FROM public.anew_roles ro
WHERE ro.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM public.anew_role_permissions rp
              WHERE rp.role_id = ro.id AND rp.permission_code = 'inventory.view')
ON CONFLICT (role_id, permission_code) DO NOTHING;

INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT ro.id, c.code, NULL::uuid
FROM public.anew_roles ro
CROSS JOIN (VALUES ('fleet.manage'), ('fleet.costs')) AS c(code)
WHERE ro.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM public.anew_role_permissions rp
              WHERE rp.role_id = ro.id AND rp.permission_code = 'inventory.edit')
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- fleet.self: técnicos de obra (operations.orders.execute). Só tem efeito para
-- condutores com user_id; os condutores sem conta são geridos por fleet.manage.
INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT ro.id, 'fleet.self', NULL::uuid
FROM public.anew_roles ro
WHERE ro.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM public.anew_role_permissions rp
              WHERE rp.role_id = ro.id AND rp.permission_code = 'operations.orders.execute')
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions ENABLE TRIGGER USER;

-- ============================================================================
-- A.4 Funções auxiliares (internas, salvo indicação)
-- ============================================================================

-- O mesmo critério das políticas do inventário (organização visível pela
-- hierarquia + permissão), para RPC e RLS darem sempre a mesma resposta.
CREATE OR REPLACE FUNCTION public.fn_fleet_can(p_organization_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND p_organization_id IS NOT NULL
     AND p_organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
     AND public.has_anew_permission((SELECT auth.uid()), p_permission)
$$;

-- Os condutores que o utilizador é (com fleet.self).
CREATE OR REPLACE FUNCTION public.fn_fleet_my_driver_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT d.id
  FROM public.fleet_drivers d
  WHERE d.user_id = public.current_business_user_id()
    AND d.deleted_at IS NULL
    AND d.is_active
    AND d.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND public.has_anew_permission((SELECT auth.uid()), 'fleet.self')
$$;

-- As viaturas que o condutor tem hoje ou tem reservadas (não devolvidas).
CREATE OR REPLACE FUNCTION public.fn_fleet_my_vehicle_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT DISTINCT a.vehicle_id
  FROM public.fleet_assignments a
  WHERE a.driver_id IN (SELECT public.fn_fleet_my_driver_ids())
    AND a.cancelled_at IS NULL
    AND a.returned_on IS NULL
    AND (a.ends_on IS NULL OR a.ends_on >= current_date)
$$;

-- A atribuição que cobre o dia (regra "cobre" de regras.ts: o fim conta até
-- ao próprio dia, exceto se a viatura já foi devolvida nesse dia).
CREATE OR REPLACE FUNCTION public.fn_fleet_assignment_at(p_vehicle_id uuid, p_on date)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT a.id
  FROM public.fleet_assignments a
  WHERE a.vehicle_id = p_vehicle_id
    AND a.cancelled_at IS NULL
    AND a.starts_on <= p_on
    AND (a.ends_on IS NULL OR a.ends_on > p_on OR (a.ends_on = p_on AND a.returned_on IS NULL))
  ORDER BY a.starts_on DESC
  LIMIT 1
$$;

-- A viatura está hoje com o utilizador (fleet.self).
CREATE OR REPLACE FUNCTION public.fn_fleet_is_my_vehicle(p_vehicle_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fleet_assignments a
    WHERE a.id = public.fn_fleet_assignment_at(p_vehicle_id, current_date)
      AND a.driver_id IN (SELECT public.fn_fleet_my_driver_ids())
  )
$$;

-- Recusa se não tiver nenhuma das permissões (ou, com p_self_vehicle_id,
-- fleet.self sobre a própria viatura).
CREATE OR REPLACE FUNCTION public.fn_fleet_assert(p_organization_id uuid, p_permissions text[], p_self_vehicle_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_permissions) AS p(code) WHERE public.fn_fleet_can(p_organization_id, p.code)) THEN
    RETURN;
  END IF;
  IF p_self_vehicle_id IS NOT NULL
     AND public.fn_fleet_can(p_organization_id, 'fleet.self')
     AND public.fn_fleet_is_my_vehicle(p_self_vehicle_id) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'Sem permissão para esta ação na Frota.' USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_fleet_log(
  p_organization_id uuid, p_vehicle_id uuid, p_action text, p_summary text,
  p_detail text DEFAULT NULL, p_entity_type text DEFAULT NULL, p_entity_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  INSERT INTO public.fleet_activity_log (organization_id, vehicle_id, action, summary, detail, entity_type, entity_id, actor_id, actor_name)
  SELECT p_organization_id, p_vehicle_id, p_action, p_summary, p_detail, p_entity_type, p_entity_id, u.id, u.name
  FROM (SELECT public.current_business_user_id() AS bid) b
  LEFT JOIN public.anew_users u ON u.id = b.bid
$$;

-- Porquê a carta não serve (NULL = serve).
CREATE OR REPLACE FUNCTION public.fn_fleet_licence_problem(p_driver_id uuid, p_required text, p_on date)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN d.id IS NULL THEN 'Condutor desconhecido.'
    WHEN COALESCE(cardinality(d.licence_categories), 0) = 0
      THEN format('%s não tem carta de condução registada.', d.full_name)
    WHEN d.licence_expires_on IS NOT NULL AND d.licence_expires_on < p_on
      THEN format('A carta de %s caducou a %s.', d.full_name, to_char(d.licence_expires_on, 'DD/MM/YYYY'))
    WHEN NOT (p_required = ANY (d.licence_categories))
      THEN format('%s não tem a categoria %s.', d.full_name, p_required)
  END
  FROM (SELECT 1) AS x
  LEFT JOIN public.fleet_drivers d ON d.id = p_driver_id AND d.deleted_at IS NULL
$$;

-- n dias úteis depois de p_from (sem sábados, domingos e feriados da organização).
CREATE OR REPLACE FUNCTION public.fn_fleet_add_working_days(p_organization_id uuid, p_from date, p_days integer)
RETURNS date
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  d date := p_from;
  n integer := 0;
BEGIN
  WHILE n < GREATEST(p_days, 0) LOOP
    d := d + 1;
    IF extract(isodow FROM d) < 6 AND NOT EXISTS (
         SELECT 1 FROM public.schedule_holidays h
         WHERE h.organization_id = p_organization_id
           AND (h.holiday_date = d
                OR (COALESCE(h.is_recurring, false) AND to_char(h.holiday_date, 'MM-DD') = to_char(d, 'MM-DD')))) THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN d;
END;
$$;

-- Próxima IPO pela regra portuguesa (decisão 10), contada a partir da data da
-- 1.ª matrícula:
--   • ligeiro de passageiros: 4 anos, depois de 2 em 2 até aos 8, depois anual
--     (4, 6, 8, 9, 10, …);
--   • ligeiro de mercadorias: 2 anos, depois anual (2, 3, 4, …).
-- p_done_on = data da inspeção feita. Uma IPO feita nos 3 meses antes da data
-- limite conta para essa data (não a antecipa). Sem categoria/matrícula, ou
-- categoria 'other': +12 meses (prudente).
CREATE OR REPLACE FUNCTION public.fn_fleet_next_inspection(p_category text, p_first_registration_on date, p_done_on date)
RETURNS date
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_years integer;
  v_due   date;
BEGIN
  IF p_done_on IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_first_registration_on IS NULL OR p_category IS NULL OR p_category NOT IN ('light_passenger', 'light_goods') THEN
    RETURN (p_done_on + interval '12 months')::date;
  END IF;
  v_years := CASE WHEN p_category = 'light_passenger' THEN 4 ELSE 2 END;
  LOOP
    v_due := (p_first_registration_on + make_interval(years => v_years))::date;
    EXIT WHEN v_due > (p_done_on + interval '3 months')::date;
    v_years := v_years + CASE WHEN p_category = 'light_passenger' AND v_years < 8 THEN 2 ELSE 1 END;
  END LOOP;
  RETURN v_due;
END;
$$;

-- O quadro da Agenda onde a Frota põe reservas e manutenções (um por organização).
CREATE OR REPLACE FUNCTION public.fn_fleet_board(p_organization_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fleet_board:' || p_organization_id::text));
  SELECT b.id INTO v_id
  FROM public.schedule_boards b
  WHERE b.organization_id = p_organization_id AND b.board_type = 'fleet'
  ORDER BY b.created_at
  LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.schedule_boards (organization_id, name, name_key, description, board_type, is_system_board, is_active, color, created_by)
    VALUES (p_organization_id, 'Frota', 'fleet.boardName', 'Reservas e manutenções das viaturas (geridas na Frota).',
            'fleet', true, true, '#64748b', public.current_business_user_id())
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

-- Cria ou atualiza o bloqueio da viatura na Agenda (dia inteiro, de p_from a
-- p_to inclusive). Sem recurso da Agenda e sem item, não faz nada.
CREATE OR REPLACE FUNCTION public.fn_fleet_sync_schedule_item(
  p_vehicle_id uuid, p_item_id uuid, p_title text, p_from date, p_to date,
  p_status public.schedule_item_status, p_user_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_res   uuid;
  v_org   uuid;
  v_item  uuid := p_item_id;
  v_start timestamptz := (p_from::timestamp AT TIME ZONE 'Europe/Lisbon');
  v_end   timestamptz := ((COALESCE(p_to, p_from) + 1)::timestamp AT TIME ZONE 'Europe/Lisbon');
BEGIN
  SELECT v.schedule_resource_id, v.organization_id INTO v_res, v_org
  FROM public.fleet_vehicles v WHERE v.id = p_vehicle_id;

  IF v_item IS NULL THEN
    IF v_res IS NULL THEN
      RETURN NULL;
    END IF;
    INSERT INTO public.schedule_items (board_id, title, status, origin, start_datetime, end_datetime, all_day,
                                       organization_id, created_by, user_id, metadata)
    VALUES (public.fn_fleet_board(v_org), p_title, p_status, 'manual', v_start, v_end, true,
            v_org, public.current_business_user_id(), p_user_id,
            COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('source', 'fleet', 'fleet_vehicle_id', p_vehicle_id))
    RETURNING id INTO v_item;
    INSERT INTO public.schedule_item_assignees (item_id, resource_id, role)
    VALUES (v_item, v_res, 'vehicle')
    ON CONFLICT (item_id, resource_id) DO NOTHING;
  ELSE
    UPDATE public.schedule_items
       SET title = COALESCE(p_title, title),
           status = p_status,
           start_datetime = v_start,
           end_datetime = v_end
     WHERE id = v_item;
  END IF;
  RETURN v_item;
END;
$$;

-- O que bloqueia a viatura entre duas datas: reservas pontuais, manutenções
-- marcadas/em curso e oficina; os outros compromissos da Agenda vêm como
-- 'agenda' (aviso, não bloqueiam).
CREATE OR REPLACE FUNCTION public.fn_fleet_vehicle_blockers(
  p_vehicle_id uuid, p_from date, p_to date,
  p_exclude_assignment_id uuid DEFAULT NULL, p_exclude_event_id uuid DEFAULT NULL)
RETURNS TABLE (kind text, ref_id uuid, label text, from_on date, to_on date)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT 'temporary', a.id, d.full_name, a.starts_on, a.ends_on
  FROM public.fleet_assignments a
  JOIN public.fleet_drivers d ON d.id = a.driver_id
  WHERE a.vehicle_id = p_vehicle_id AND a.kind = 'temporary'
    AND a.cancelled_at IS NULL AND a.returned_on IS NULL
    AND a.starts_on <= p_to AND a.ends_on >= p_from
    AND (p_exclude_assignment_id IS NULL OR a.id <> p_exclude_assignment_id)
  UNION ALL
  SELECT 'maintenance', m.id, m.title, m.scheduled_on, COALESCE(m.expected_end_on, m.scheduled_on)
  FROM public.fleet_maintenance_events m
  WHERE m.vehicle_id = p_vehicle_id AND m.status IN ('scheduled', 'in_progress')
    AND m.scheduled_on <= p_to AND COALESCE(m.expected_end_on, m.scheduled_on) >= p_from
    AND (p_exclude_event_id IS NULL OR m.id <> p_exclude_event_id)
  UNION ALL
  SELECT 'workshop', v.id, COALESCE(v.status_reason, 'Oficina'), GREATEST(p_from, current_date), p_to
  FROM public.fleet_vehicles v
  WHERE v.id = p_vehicle_id AND v.status = 'workshop' AND p_to >= current_date
  UNION ALL
  SELECT 'agenda', si.id, si.title, (si.start_datetime AT TIME ZONE 'Europe/Lisbon')::date,
         ((si.end_datetime - interval '1 microsecond') AT TIME ZONE 'Europe/Lisbon')::date
  FROM public.fleet_vehicles v
  JOIN public.schedule_item_assignees sia ON sia.resource_id = v.schedule_resource_id
  JOIN public.schedule_items si ON si.id = sia.item_id
  WHERE v.id = p_vehicle_id
    AND si.status <> 'cancelled'
    AND COALESCE(si.metadata ->> 'source', '') <> 'fleet'
    AND si.start_datetime < ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Lisbon')
    AND si.end_datetime > (p_from::timestamp AT TIME ZONE 'Europe/Lisbon')
$$;

-- ============================================================================
-- A.5 Leitura: vista da viatura (security_invoker → aplica o RLS das tabelas)
-- ============================================================================
CREATE OR REPLACE VIEW public.fleet_v_vehicles
WITH (security_invoker = true) AS
SELECT
  v.id, v.organization_id, v.plate, v.make, v.model, v.vehicle_type, v.vehicle_category, v.first_registration_on,
  v.fuel_type, v.ownership,
  v.lessor_supplier_id, v.monthly_rent, v.model_year, v.odometer_km, v.odometer_read_on, v.status,
  v.status_reason, v.required_licence, v.cost_center_id, v.cost_center_label, v.personal_use, v.is_pool,
  v.schedule_resource_id, v.warehouse_id, v.asset_id,
  a.id AS current_assignment_id, a.kind AS current_assignment_kind, a.driver_id AS current_driver_id,
  d.full_name AS current_driver_name,
  ins.valid_until AS insurance_until, ins.reference AS insurance_policy_no, ins.provider_supplier_id AS insurer_supplier_id,
  ipo.valid_until AS inspection_until,
  iuc.valid_until AS road_tax_until, COALESCE(iuc.is_exempt, false) AS road_tax_exempt,
  lc.valid_until AS contract_ends_on,
  p.every_km AS service_every_km, p.every_months AS service_every_months,
  p.last_km AS service_last_km, p.last_done_on AS service_last_on,
  (p.last_km + p.every_km) AS service_next_km,
  (p.last_done_on + make_interval(months => p.every_months))::date AS service_next_on
FROM public.fleet_vehicles v
LEFT JOIN public.fleet_assignments a ON a.id = public.fn_fleet_assignment_at(v.id, current_date)
LEFT JOIN public.fleet_drivers d ON d.id = a.driver_id
LEFT JOIN public.fleet_compliance ins ON ins.vehicle_id = v.id AND ins.kind = 'insurance' AND ins.is_current
LEFT JOIN public.fleet_compliance ipo ON ipo.vehicle_id = v.id AND ipo.kind = 'inspection' AND ipo.is_current
LEFT JOIN public.fleet_compliance iuc ON iuc.vehicle_id = v.id AND iuc.kind = 'road_tax' AND iuc.is_current
LEFT JOIN public.fleet_compliance lc ON lc.vehicle_id = v.id AND lc.kind = 'lease_contract' AND lc.is_current
LEFT JOIN public.fleet_maintenance_plans p ON p.vehicle_id = v.id AND p.kind = 'service' AND p.is_active
WHERE v.deleted_at IS NULL;

-- ============================================================================
-- A.6 RPCs (SECURITY DEFINER, search_path fixo, organização + permissão)
-- ============================================================================

-- Condutores ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fleet_upsert_driver(p_organization_id uuid, p_driver_id uuid, p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id   uuid := p_driver_id;
  v_user uuid := NULLIF(p_data ->> 'user_id', '')::uuid;
  v_cats text[];
BEGIN
  PERFORM public.fn_fleet_assert(p_organization_id, ARRAY['fleet.manage']);
  IF btrim(COALESCE(p_data ->> 'full_name', '')) = '' THEN
    RAISE EXCEPTION 'Indica o nome do condutor.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_user IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.anew_memberships m
       WHERE m.user_id = v_user AND m.organization_id = p_organization_id AND m.status = 'active') THEN
    RAISE EXCEPTION 'O utilizador não pertence a esta organização.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(array_agg(upper(btrim(x))), '{}') INTO v_cats
  FROM jsonb_array_elements_text(COALESCE(p_data -> 'licence_categories', '[]'::jsonb)) AS t(x)
  WHERE btrim(x) <> '';

  IF v_id IS NULL THEN
    INSERT INTO public.fleet_drivers (organization_id, user_id, pessoa_id, full_name, job_title, team, licence_number,
                                      licence_categories, licence_expires_on, notes, created_by)
    VALUES (p_organization_id, v_user, NULLIF(p_data ->> 'pessoa_id', '')::uuid, btrim(p_data ->> 'full_name'),
            NULLIF(p_data ->> 'job_title', ''), NULLIF(p_data ->> 'team', ''), NULLIF(p_data ->> 'licence_number', ''),
            v_cats, NULLIF(p_data ->> 'licence_expires_on', '')::date, NULLIF(p_data ->> 'notes', ''),
            public.current_business_user_id())
    RETURNING id INTO v_id;
    PERFORM public.fn_fleet_log(p_organization_id, NULL, 'Novo condutor', format('Condutor %s criado.', btrim(p_data ->> 'full_name')), NULL, 'fleet_driver', v_id);
  ELSE
    UPDATE public.fleet_drivers
       SET user_id = v_user,
           pessoa_id = NULLIF(p_data ->> 'pessoa_id', '')::uuid,
           full_name = btrim(p_data ->> 'full_name'),
           job_title = NULLIF(p_data ->> 'job_title', ''),
           team = NULLIF(p_data ->> 'team', ''),
           licence_number = NULLIF(p_data ->> 'licence_number', ''),
           licence_categories = v_cats,
           licence_expires_on = NULLIF(p_data ->> 'licence_expires_on', '')::date,
           is_active = COALESCE((p_data ->> 'is_active')::boolean, is_active),
           notes = NULLIF(p_data ->> 'notes', '')
     WHERE id = v_id AND organization_id = p_organization_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Condutor desconhecido.' USING ERRCODE = 'no_data_found';
    END IF;
    PERFORM public.fn_fleet_log(p_organization_id, NULL, 'Condutor alterado', format('Condutor %s alterado.', btrim(p_data ->> 'full_name')), NULL, 'fleet_driver', v_id);
  END IF;
  RETURN v_id;
END;
$$;

-- Nova viatura (+ armazém móvel + recurso da Agenda) ---------------------------
CREATE OR REPLACE FUNCTION public.rpc_fleet_create_vehicle(p_organization_id uuid, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor        uuid := public.current_business_user_id();
  v_plate        text := upper(regexp_replace(COALESCE(p_data ->> 'plate', ''), '\s', '', 'g'));
  v_fuel         text := COALESCE(NULLIF(p_data ->> 'fuel_type', ''), 'diesel');
  v_km           integer := NULLIF(p_data ->> 'odometer_km', '')::integer;
  v_make         text := btrim(COALESCE(p_data ->> 'make', ''));
  v_model        text := btrim(COALESCE(p_data ->> 'model', ''));
  v_want_wh      boolean := COALESCE((p_data ->> 'create_warehouse')::boolean, false);
  v_exist_wh     uuid := NULLIF(p_data ->> 'existing_warehouse_id', '')::uuid;
  v_want_res     boolean := COALESCE((p_data ->> 'create_schedule_resource')::boolean, false);
  v_exist_res    uuid := NULLIF(p_data ->> 'existing_schedule_resource_id', '')::uuid;
  v_id           uuid;
  v_wh           uuid;
  v_res          uuid;
  v_wh_count     integer;
  v_only_wh      uuid;
  v_default_set  boolean := false;
  v_code         text;
  v_category     text := NULLIF(p_data ->> 'vehicle_category', '');
  v_first_reg    date := NULLIF(p_data ->> 'first_registration_on', '')::date;
  v_ipo_until    date := NULLIF(p_data ->> 'inspection_until', '')::date;
BEGIN
  PERFORM public.fn_fleet_assert(p_organization_id, ARRAY['fleet.manage']);

  IF v_plate !~ '^([A-Z]{2}-[0-9]{2}-[A-Z]{2}|[0-9]{2}-[A-Z]{2}-[0-9]{2}|[0-9]{2}-[0-9]{2}-[A-Z]{2}|[A-Z]{2}-[0-9]{2}-[0-9]{2})$' THEN
    RAISE EXCEPTION 'Usa o formato português, por exemplo AA-00-AA.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fleet_vehicles
             WHERE organization_id = p_organization_id AND plate = v_plate AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Já existe uma viatura com esta matrícula.' USING ERRCODE = 'unique_violation';
  END IF;
  IF v_make = '' THEN RAISE EXCEPTION 'Indica a marca.' USING ERRCODE = 'check_violation'; END IF;
  IF v_model = '' THEN RAISE EXCEPTION 'Indica o modelo.' USING ERRCODE = 'check_violation'; END IF;
  IF v_km IS NULL OR v_km < 0 THEN RAISE EXCEPTION 'Indica os km.' USING ERRCODE = 'check_violation'; END IF;
  IF NULLIF(p_data ->> 'insurance_until', '') IS NULL THEN
    RAISE EXCEPTION 'Sem seguro válido não pode circular.' USING ERRCODE = 'check_violation';
  END IF;

  IF v_category IS NOT NULL AND v_category NOT IN ('light_passenger', 'light_goods', 'other') THEN
    RAISE EXCEPTION 'Categoria inválida.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_first_reg IS NOT NULL AND v_first_reg > current_date THEN
    RAISE EXCEPTION 'A data da 1.ª matrícula não pode ser no futuro.' USING ERRCODE = 'check_violation';
  END IF;
  -- Sem data da próxima IPO, calcula-a pela regra legal (só com categoria e
  -- 1.ª matrícula conhecidas): o primeiro prazo legal a partir de hoje.
  IF v_ipo_until IS NULL AND v_first_reg IS NOT NULL AND v_category IN ('light_passenger', 'light_goods') THEN
    v_ipo_until := public.fn_fleet_next_inspection(v_category, v_first_reg, (current_date - interval '3 months')::date);
  END IF;

  INSERT INTO public.fleet_vehicles (organization_id, plate, make, model, vehicle_type, vehicle_category, first_registration_on,
                                     fuel_type, ownership,
                                     lessor_supplier_id, monthly_rent, model_year, vin, odometer_km, odometer_read_on,
                                     required_licence, cost_center_id, cost_center_label, personal_use, is_pool,
                                     asset_id, notes, created_by)
  VALUES (p_organization_id, v_plate, v_make, v_model, NULLIF(p_data ->> 'vehicle_type', ''), v_category, v_first_reg, v_fuel,
          COALESCE(NULLIF(p_data ->> 'ownership', ''), 'owned'),
          NULLIF(p_data ->> 'lessor_supplier_id', '')::uuid, NULLIF(p_data ->> 'monthly_rent', '')::numeric,
          NULLIF(p_data ->> 'model_year', '')::smallint, NULLIF(p_data ->> 'vin', ''), v_km, current_date,
          COALESCE(NULLIF(upper(p_data ->> 'required_licence'), ''), 'B'),
          NULLIF(p_data ->> 'cost_center_id', '')::uuid, NULLIF(p_data ->> 'cost_center_label', ''),
          COALESCE((p_data ->> 'personal_use')::boolean, false), COALESCE((p_data ->> 'is_pool')::boolean, false),
          NULLIF(p_data ->> 'asset_id', '')::uuid, NULLIF(p_data ->> 'notes', ''), v_actor)
  RETURNING id INTO v_id;

  -- Armazém móvel ------------------------------------------------------------
  IF v_want_wh OR v_exist_wh IS NOT NULL THEN
    PERFORM public.fn_fleet_assert(p_organization_id,
      CASE WHEN v_exist_wh IS NULL THEN ARRAY['warehouses.create'] ELSE ARRAY['warehouses.edit'] END);

    -- Proteger a baixa automática de stock dos contratos/propostas: sem
    -- default_warehouse_id, fn_contract_stock_deduction usa "o único armazém".
    SELECT count(*), (array_agg(w.id))[1] INTO v_wh_count, v_only_wh
    FROM public.warehouses w
    WHERE w.organization_id = p_organization_id AND w.deleted_at IS NULL;

    IF v_exist_wh IS NOT NULL AND v_wh_count = 1 AND v_only_wh = v_exist_wh THEN
      RAISE EXCEPTION 'Esse é o único armazém da organização: não pode passar a carrinha.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_wh_count = 1 AND NOT EXISTS (SELECT 1 FROM public.organization_inventory_settings s
                                      WHERE s.organization_id = p_organization_id AND s.default_warehouse_id IS NOT NULL) THEN
      INSERT INTO public.organization_inventory_settings (organization_id, default_warehouse_id, created_by)
      VALUES (p_organization_id, v_only_wh, v_actor)
      ON CONFLICT (organization_id) DO UPDATE SET default_warehouse_id = EXCLUDED.default_warehouse_id, updated_at = now();
      v_default_set := true;
    END IF;

    IF v_exist_wh IS NOT NULL THEN
      UPDATE public.warehouses
         SET is_vehicle = true, serves_customers = false, updated_at = now()
       WHERE id = v_exist_wh AND organization_id = p_organization_id AND deleted_at IS NULL
      RETURNING id INTO v_wh;
      IF v_wh IS NULL THEN
        RAISE EXCEPTION 'Armazém inválido para esta organização.' USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      v_code := 'VIA-' || replace(v_plate, '-', '');
      SELECT w.id INTO v_wh FROM public.warehouses w
      WHERE w.organization_id = p_organization_id AND w.code = v_code;
      IF v_wh IS NOT NULL THEN
        -- Reaproveita um armazém móvel antigo da mesma matrícula, só se vazio e livre.
        IF EXISTS (SELECT 1 FROM public.stocks s WHERE s.warehouse_id = v_wh AND s.deleted_at IS NULL AND s.quantity > 0)
           OR EXISTS (SELECT 1 FROM public.fleet_vehicles fv WHERE fv.warehouse_id = v_wh) THEN
          RAISE EXCEPTION 'O armazém móvel % já existe e tem stock ou outra viatura: esvazia-o por transferência primeiro.', v_code
            USING ERRCODE = 'check_violation';
        END IF;
        UPDATE public.warehouses
           SET deleted_at = NULL, deleted_by = NULL, is_active = true, serves_customers = false, is_vehicle = true, updated_at = now()
         WHERE id = v_wh;
      ELSE
        INSERT INTO public.warehouses (organization_id, name, code, address, city, is_active, serves_customers, is_vehicle, created_by)
        VALUES (p_organization_id, 'Carrinha ' || v_plate, v_code, 'Armazém móvel (viatura)',
                NULLIF(p_data ->> 'warehouse_city', ''), true, false, true, v_actor)
        RETURNING id INTO v_wh;
      END IF;
    END IF;

    -- Decisão 6: a carrinha nunca fica com reorder_point > 0 (senão entrava no
    -- "stock baixo" do Inventário). Se o armazém já tinha pontos de
    -- encomenda, passam para o mínimo da carrinha (minimum_quantity).
    UPDATE public.stocks
       SET minimum_quantity = GREATEST(minimum_quantity, reorder_point),
           reorder_point = 0
     WHERE warehouse_id = v_wh AND reorder_point > 0;
  END IF;

  -- Recurso da Agenda --------------------------------------------------------
  -- Decisão 3: criar o recurso basta fleet.manage (já verificado acima).
  -- Reaproveitar um recurso que já existe: basta fleet.manage se já for um
  -- recurso de viatura (resource_type = 'vehicle'); um recurso de outro tipo
  -- passaria a viatura, por isso continua a pedir scheduling.resources.edit.
  IF v_exist_res IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.schedule_resources sr
                   WHERE sr.id = v_exist_res AND sr.organization_id = p_organization_id
                     AND sr.resource_type = 'vehicle') THEN
      PERFORM public.fn_fleet_assert(p_organization_id, ARRAY['scheduling.resources.edit']);
    END IF;
    UPDATE public.schedule_resources
       SET resource_type = 'vehicle',
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('fleet_vehicle_id', v_id)
     WHERE id = v_exist_res AND organization_id = p_organization_id AND user_id IS NULL
    RETURNING id INTO v_res;
    IF v_res IS NULL THEN
      RAISE EXCEPTION 'Recurso da Agenda inválido (tem de ser desta organização e não ser uma pessoa).' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_want_res THEN
    INSERT INTO public.schedule_resources (name, resource_type, is_active, organization_id, created_by, metadata, color)
    VALUES (v_make || ' ' || split_part(v_model, ' ', 1) || ' · ' || v_plate, 'vehicle', true, p_organization_id, v_actor,
            jsonb_build_object('fleet_vehicle_id', v_id), '#64748b')
    RETURNING id INTO v_res;
  END IF;

  UPDATE public.fleet_vehicles SET warehouse_id = v_wh, schedule_resource_id = v_res WHERE id = v_id;

  -- Km, plano de revisão e vencimentos -------------------------------------
  INSERT INTO public.fleet_odometer_readings (organization_id, vehicle_id, read_on, km, source, recorded_by)
  VALUES (p_organization_id, v_id, current_date, v_km, 'creation', v_actor);

  INSERT INTO public.fleet_maintenance_plans (organization_id, vehicle_id, kind, title, every_km, every_months, last_km, last_done_on, created_by)
  VALUES (p_organization_id, v_id, 'service', 'Revisão',
          COALESCE(NULLIF(p_data ->> 'service_every_km', '')::integer, 30000),
          COALESCE(NULLIF(p_data ->> 'service_every_months', '')::integer, 12),
          COALESCE(NULLIF(p_data ->> 'service_last_km', '')::integer, v_km),
          COALESCE(NULLIF(p_data ->> 'service_last_on', '')::date, current_date), v_actor);

  INSERT INTO public.fleet_compliance (organization_id, vehicle_id, kind, valid_until, is_exempt, provider_supplier_id, reference, created_by)
  SELECT p_organization_id, v_id, k.kind, k.until, k.exempt, k.sup, k.ref, v_actor
  FROM (VALUES
    ('insurance', NULLIF(p_data ->> 'insurance_until', '')::date, false,
       NULLIF(p_data ->> 'insurer_supplier_id', '')::uuid, NULLIF(p_data ->> 'insurance_policy_no', '')),
    ('inspection', v_ipo_until, false, NULL::uuid, NULL::text),
    ('road_tax', CASE WHEN v_fuel = 'electric' THEN NULL ELSE NULLIF(p_data ->> 'road_tax_until', '')::date END,
       v_fuel = 'electric', NULL::uuid, NULL::text),
    ('lease_contract', NULLIF(p_data ->> 'contract_ends_on', '')::date, false,
       NULLIF(p_data ->> 'lessor_supplier_id', '')::uuid, NULL::text)
  ) AS k(kind, until, exempt, sup, ref)
  WHERE k.until IS NOT NULL OR k.exempt;

  PERFORM public.fn_fleet_log(p_organization_id, v_id, 'Nova viatura', format('Viatura %s criada.', v_plate),
    concat_ws(' · ', v_make || ' ' || v_model, v_km || ' km',
              CASE WHEN v_wh IS NOT NULL THEN 'armazém móvel' END,
              CASE WHEN v_res IS NOT NULL THEN 'recurso da agenda' END,
              CASE WHEN v_default_set THEN 'armazém por omissão do inventário fixado no armazém existente' END),
    'fleet_vehicle', v_id);

  RETURN jsonb_build_object('vehicle_id', v_id, 'warehouse_id', v_wh, 'schedule_resource_id', v_res,
                            'default_warehouse_set', v_default_set);
END;
$$;

-- Editar a ficha (sem km, estado, armazém nem recurso: esses têm ação própria)
CREATE OR REPLACE FUNCTION public.rpc_fleet_update_vehicle(p_vehicle_id uuid, p_data jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v public.fleet_vehicles;
BEGIN
  SELECT * INTO v FROM public.fleet_vehicles WHERE id = p_vehicle_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Viatura desconhecida.' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.fn_fleet_assert(v.organization_id, ARRAY['fleet.manage']);

  UPDATE public.fleet_vehicles SET
    make               = CASE WHEN p_data ? 'make' THEN btrim(p_data ->> 'make') ELSE make END,
    model              = CASE WHEN p_data ? 'model' THEN btrim(p_data ->> 'model') ELSE model END,
    vehicle_type       = CASE WHEN p_data ? 'vehicle_type' THEN NULLIF(p_data ->> 'vehicle_type', '') ELSE vehicle_type END,
    vehicle_category   = CASE WHEN p_data ? 'vehicle_category' THEN NULLIF(p_data ->> 'vehicle_category', '') ELSE vehicle_category END,
    first_registration_on = CASE WHEN p_data ? 'first_registration_on' THEN NULLIF(p_data ->> 'first_registration_on', '')::date ELSE first_registration_on END,
    fuel_type          = CASE WHEN p_data ? 'fuel_type' THEN p_data ->> 'fuel_type' ELSE fuel_type END,
    ownership          = CASE WHEN p_data ? 'ownership' THEN p_data ->> 'ownership' ELSE ownership END,
    lessor_supplier_id = CASE WHEN p_data ? 'lessor_supplier_id' THEN NULLIF(p_data ->> 'lessor_supplier_id', '')::uuid ELSE lessor_supplier_id END,
    monthly_rent       = CASE WHEN p_data ? 'monthly_rent' THEN NULLIF(p_data ->> 'monthly_rent', '')::numeric ELSE monthly_rent END,
    model_year         = CASE WHEN p_data ? 'model_year' THEN NULLIF(p_data ->> 'model_year', '')::smallint ELSE model_year END,
    vin                = CASE WHEN p_data ? 'vin' THEN NULLIF(p_data ->> 'vin', '') ELSE vin END,
    required_licence   = CASE WHEN p_data ? 'required_licence' THEN upper(p_data ->> 'required_licence') ELSE required_licence END,
    cost_center_id     = CASE WHEN p_data ? 'cost_center_id' THEN NULLIF(p_data ->> 'cost_center_id', '')::uuid ELSE cost_center_id END,
    cost_center_label  = CASE WHEN p_data ? 'cost_center_label' THEN NULLIF(p_data ->> 'cost_center_label', '') ELSE cost_center_label END,
    personal_use       = CASE WHEN p_data ? 'personal_use' THEN (p_data ->> 'personal_use')::boolean ELSE personal_use END,
    is_pool            = CASE WHEN p_data ? 'is_pool' THEN (p_data ->> 'is_pool')::boolean ELSE is_pool END,
    asset_id           = CASE WHEN p_data ? 'asset_id' THEN NULLIF(p_data ->> 'asset_id', '')::uuid ELSE asset_id END,
    notes              = CASE WHEN p_data ? 'notes' THEN NULLIF(p_data ->> 'notes', '') ELSE notes END
  WHERE id = v.id;

  IF p_data ? 'service_every_km' OR p_data ? 'service_every_months' THEN
    UPDATE public.fleet_maintenance_plans SET
      every_km     = CASE WHEN p_data ? 'service_every_km' THEN NULLIF(p_data ->> 'service_every_km', '')::integer ELSE every_km END,
      every_months = CASE WHEN p_data ? 'service_every_months' THEN NULLIF(p_data ->> 'service_every_months', '')::integer ELSE every_months END
    WHERE vehicle_id = v.id AND kind = 'service' AND is_active;
  END IF;

  PERFORM public.fn_fleet_log(v.organization_id, v.id, 'Ficha alterada', format('Ficha da %s alterada.', v.plate), NULL, 'fleet_vehicle', v.id);
END;
$$;

-- Mudar estado -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fleet_set_status(p_vehicle_id uuid, p_status text, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v     public.fleet_vehicles;
  v_a   public.fleet_assignments;
  r     record;
BEGIN
  SELECT * INTO v FROM public.fleet_vehicles WHERE id = p_vehicle_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Viatura desconhecida.' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.fn_fleet_assert(v.organization_id, ARRAY['fleet.manage']);

  IF p_status NOT IN ('active', 'workshop', 'stopped', 'inactive', 'sold') THEN
    RAISE EXCEPTION 'Estado inválido.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_status = v.status THEN
    RAISE EXCEPTION 'Escolhe um estado diferente.' USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Escreve o motivo (pelo menos 3 letras).' USING ERRCODE = 'check_violation';
  END IF;
  -- Decisão 11: vender/abater só com a carrinha a zero (nem positivo nem
  -- negativo); o armazém da carrinha fica depois inativo (não é apagado).
  IF p_status IN ('inactive', 'sold') AND v.warehouse_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.stocks s WHERE s.warehouse_id = v.warehouse_id AND s.deleted_at IS NULL AND s.quantity <> 0) THEN
    RAISE EXCEPTION 'A carrinha da % ainda tem stock: transfere-o primeiro para outro armazém (Inventário › Transferências) e depois muda o estado.', v.plate
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.fleet_vehicles
     SET status = p_status, status_reason = btrim(p_reason), status_changed_at = now()
   WHERE id = v.id;

  -- Fora de "ativa", a atribuição de hoje fecha (como gravarEstado).
  IF p_status <> 'active' THEN
    SELECT * INTO v_a FROM public.fleet_assignments WHERE id = public.fn_fleet_assignment_at(v.id, current_date);
    IF FOUND THEN
      UPDATE public.fleet_assignments
         SET ends_on = current_date, returned_on = current_date, km_end = v.odometer_km
       WHERE id = v_a.id;
      IF v_a.schedule_item_id IS NOT NULL THEN
        PERFORM public.fn_fleet_sync_schedule_item(v.id, v_a.schedule_item_id, NULL, v_a.starts_on, current_date, 'completed', NULL);
      END IF;
    END IF;
  END IF;

  IF p_status IN ('inactive', 'sold') THEN
    -- Reservas futuras caem e a viatura sai da Agenda.
    FOR r IN SELECT * FROM public.fleet_assignments
             WHERE vehicle_id = v.id AND cancelled_at IS NULL AND starts_on > current_date LOOP
      UPDATE public.fleet_assignments SET cancelled_at = now(), cancelled_by = public.current_business_user_id() WHERE id = r.id;
      IF r.schedule_item_id IS NOT NULL THEN
        UPDATE public.schedule_items SET status = 'cancelled' WHERE id = r.schedule_item_id;
      END IF;
    END LOOP;
    UPDATE public.fleet_restock_requests SET status = 'cancelled', done_at = now(), done_by = public.current_business_user_id()
     WHERE vehicle_id = v.id AND status = 'requested';
    IF v.schedule_resource_id IS NOT NULL THEN
      UPDATE public.schedule_resources SET is_active = false WHERE id = v.schedule_resource_id;
    END IF;
    IF v.warehouse_id IS NOT NULL THEN
      UPDATE public.warehouses SET is_active = false, updated_at = now()
       WHERE id = v.warehouse_id AND is_vehicle;
    END IF;
  ELSIF p_status = 'active' THEN
    IF v.schedule_resource_id IS NOT NULL THEN
      UPDATE public.schedule_resources SET is_active = true WHERE id = v.schedule_resource_id;
    END IF;
    IF v.warehouse_id IS NOT NULL AND v.status IN ('inactive', 'sold') THEN
      UPDATE public.warehouses SET is_active = true, updated_at = now()
       WHERE id = v.warehouse_id AND is_vehicle AND deleted_at IS NULL;
    END IF;
  END IF;

  PERFORM public.fn_fleet_log(v.organization_id, v.id, 'Estado', format('%s passou a "%s".', v.plate, p_status), btrim(p_reason), 'fleet_vehicle', v.id);
END;
$$;

-- Atribuir / reservar ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fleet_assign(
  p_vehicle_id uuid, p_driver_id uuid, p_kind text, p_starts_on date, p_ends_on date DEFAULT NULL,
  p_km integer DEFAULT NULL, p_reason text DEFAULT NULL, p_ops_obra_id uuid DEFAULT NULL, p_ops_ordem_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v        public.fleet_vehicles;
  d        public.fleet_drivers;
  v_prob   text;
  v_clash  record;
  v_other  text;
  v_id     uuid;
  v_item   uuid;
  v_kmini  integer;
BEGIN
  SELECT * INTO v FROM public.fleet_vehicles WHERE id = p_vehicle_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Escolhe a viatura.' USING ERRCODE = 'check_violation'; END IF;
  PERFORM public.fn_fleet_assert(v.organization_id, ARRAY['fleet.manage']);

  SELECT * INTO d FROM public.fleet_drivers
  WHERE id = p_driver_id AND organization_id = v.organization_id AND deleted_at IS NULL AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Escolhe o condutor.' USING ERRCODE = 'check_violation'; END IF;

  IF p_kind NOT IN ('permanent', 'temporary') THEN RAISE EXCEPTION 'Tipo inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF v.status <> 'active' THEN
    RAISE EXCEPTION 'A % não está ativa (%).', v.plate, v.status USING ERRCODE = 'check_violation';
  END IF;
  IF p_starts_on IS NULL THEN RAISE EXCEPTION 'Indica o início.' USING ERRCODE = 'check_violation'; END IF;
  IF p_kind = 'temporary' AND p_ends_on IS NULL THEN RAISE EXCEPTION 'Indica até quando.' USING ERRCODE = 'check_violation'; END IF;
  IF p_ends_on IS NOT NULL AND p_ends_on < p_starts_on THEN
    RAISE EXCEPTION 'O fim não pode ser antes do início.' USING ERRCODE = 'check_violation';
  END IF;

  -- a carta tem de servir no início e no último dia
  v_prob := COALESCE(public.fn_fleet_licence_problem(d.id, v.required_licence, p_starts_on),
                     public.fn_fleet_licence_problem(d.id, v.required_licence, COALESCE(p_ends_on, p_starts_on)));
  IF v_prob IS NOT NULL THEN RAISE EXCEPTION '%', v_prob USING ERRCODE = 'check_violation'; END IF;

  IF p_starts_on <= current_date AND p_km IS NOT NULL AND p_km < v.odometer_km THEN
    RAISE EXCEPTION 'Não pode ser menos do que a última leitura (% km).', v.odometer_km USING ERRCODE = 'check_violation';
  END IF;

  -- sobreposição com outra atribuição da viatura
  SELECT a.starts_on, a.ends_on, dr.full_name INTO v_clash
  FROM public.fleet_assignments a
  JOIN public.fleet_drivers dr ON dr.id = a.driver_id
  WHERE a.vehicle_id = v.id AND a.cancelled_at IS NULL
    AND a.starts_on <= COALESCE(p_ends_on, 'infinity'::date)
    AND (a.ends_on IS NULL OR a.ends_on > p_starts_on OR (a.ends_on = p_starts_on AND a.returned_on IS NULL))
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'A % já está com % de % a %.', v.plate, v_clash.full_name, to_char(v_clash.starts_on, 'DD/MM/YYYY'),
      COALESCE(to_char(v_clash.ends_on, 'DD/MM/YYYY'), 'sem fim') USING ERRCODE = 'check_violation';
  END IF;

  -- uma reserva pontual não pode cair em manutenção nem oficina
  IF p_kind = 'temporary' THEN
    SELECT b.kind, b.label, b.from_on INTO v_clash
    FROM public.fn_fleet_vehicle_blockers(v.id, p_starts_on, p_ends_on) b
    WHERE b.kind IN ('maintenance', 'workshop')
    ORDER BY b.from_on
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'A % tem % a %: está bloqueada na agenda.', v.plate, v_clash.label, to_char(v_clash.from_on, 'DD/MM/YYYY')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_kind = 'permanent' THEN
    SELECT fv.plate INTO v_other
    FROM public.fleet_assignments a JOIN public.fleet_vehicles fv ON fv.id = a.vehicle_id
    WHERE a.driver_id = d.id AND a.kind = 'permanent' AND a.ends_on IS NULL AND a.cancelled_at IS NULL
    LIMIT 1;
    IF v_other IS NOT NULL THEN
      RAISE EXCEPTION '% já tem a %. Devolve-a primeiro.', d.full_name, v_other USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_ops_obra_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ops_obra o WHERE o.id = p_ops_obra_id AND o.organization_id = v.organization_id) THEN
    RAISE EXCEPTION 'Obra inválida.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_ops_ordem_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ops_ordem o WHERE o.id = p_ops_ordem_id AND o.organization_id = v.organization_id) THEN
    RAISE EXCEPTION 'Ordem inválida.' USING ERRCODE = 'check_violation';
  END IF;

  v_kmini := CASE WHEN p_starts_on <= current_date THEN COALESCE(p_km, v.odometer_km) END;

  INSERT INTO public.fleet_assignments (organization_id, vehicle_id, driver_id, kind, starts_on, ends_on, km_start, reason,
                                        ops_obra_id, ops_ordem_id, created_by)
  VALUES (v.organization_id, v.id, d.id, p_kind, p_starts_on, p_ends_on, v_kmini, NULLIF(btrim(COALESCE(p_reason, '')), ''),
          p_ops_obra_id, p_ops_ordem_id, public.current_business_user_id())
  RETURNING id INTO v_id;

  IF p_starts_on <= current_date AND p_km IS NOT NULL AND p_km > v.odometer_km THEN
    UPDATE public.fleet_vehicles SET odometer_km = p_km, odometer_read_on = current_date WHERE id = v.id;
    INSERT INTO public.fleet_odometer_readings (organization_id, vehicle_id, read_on, km, source, source_id, recorded_by)
    VALUES (v.organization_id, v.id, current_date, p_km, 'handover', v_id, public.current_business_user_id());
  END IF;

  -- a reserva pontual bloqueia a viatura na Agenda
  IF p_kind = 'temporary' THEN
    v_item := public.fn_fleet_sync_schedule_item(v.id, NULL, format('Reserva · %s · %s', v.plate, d.full_name),
                                                 p_starts_on, p_ends_on, 'scheduled', d.user_id,
                                                 jsonb_build_object('fleet_kind', 'reservation', 'fleet_assignment_id', v_id));
    UPDATE public.fleet_assignments SET schedule_item_id = v_item WHERE id = v_id;
  END IF;

  PERFORM public.fn_fleet_log(v.organization_id, v.id, CASE WHEN p_kind = 'temporary' THEN 'Reserva' ELSE 'Atribuição' END,
    format('%s atribuída a %s.', v.plate, d.full_name),
    concat_ws(' · ', CASE WHEN p_kind = 'temporary' THEN 'Reserva' ELSE 'Permanente' END || ' de ' || to_char(p_starts_on, 'DD/MM/YYYY')
              || COALESCE(' a ' || to_char(p_ends_on, 'DD/MM/YYYY'), ', sem fim'), NULLIF(btrim(COALESCE(p_reason, '')), '')),
    'fleet_assignment', v_id);
  RETURN v_id;
END;
$$;

-- Devolver -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fleet_return(p_assignment_id uuid, p_km integer, p_returned_on date, p_damage_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  a     public.fleet_assignments;
  v     public.fleet_vehicles;
  v_inc uuid;
BEGIN
  SELECT * INTO a FROM public.fleet_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Atribuição desconhecida.' USING ERRCODE = 'no_data_found'; END IF;
  SELECT * INTO v FROM public.fleet_vehicles WHERE id = a.vehicle_id FOR UPDATE;
  PERFORM public.fn_fleet_assert(v.organization_id, ARRAY['fleet.manage']);

  IF a.returned_on IS NOT NULL OR a.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta atribuição já foi devolvida.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_km IS NULL OR p_km < v.odometer_km THEN
    RAISE EXCEPTION 'Indica os km. Não pode ser menos do que % km.', v.odometer_km USING ERRCODE = 'check_violation';
  END IF;
  IF p_returned_on IS NULL OR p_returned_on < a.starts_on THEN
    RAISE EXCEPTION 'A data é anterior à entrega.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_returned_on > current_date THEN
    RAISE EXCEPTION 'Não pode ser no futuro.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.fleet_assignments
     SET ends_on = p_returned_on, returned_on = p_returned_on, km_end = p_km,
         damage_notes = NULLIF(btrim(COALESCE(p_damage_notes, '')), '')
   WHERE id = a.id;
  UPDATE public.fleet_vehicles SET odometer_km = p_km, odometer_read_on = p_returned_on WHERE id = v.id;
  INSERT INTO public.fleet_odometer_readings (organization_id, vehicle_id, read_on, km, source, source_id, recorded_by)
  VALUES (v.organization_id, v.id, p_returned_on, p_km, 'return', a.id, public.current_business_user_id());

  IF a.schedule_item_id IS NOT NULL THEN
    -- liberta a Agenda a partir do dia seguinte à devolução
    PERFORM public.fn_fleet_sync_schedule_item(v.id, a.schedule_item_id, NULL, a.starts_on, p_returned_on, 'completed', NULL);
  END IF;

  IF NULLIF(btrim(COALESCE(p_damage_notes, '')), '') IS NOT NULL THEN
    INSERT INTO public.fleet_incidents (organization_id, vehicle_id, kind, occurred_at, location, description, driver_id,
                                        status, assignment_id, created_by)
    VALUES (v.organization_id, v.id, 'accident', (p_returned_on + time '18:00') AT TIME ZONE 'Europe/Lisbon',
            'Na devolução', 'Danos detetados na devolução: ' || btrim(p_damage_notes), a.driver_id, 'logged', a.id,
            public.current_business_user_id())
    RETURNING id INTO v_inc;
  END IF;

  PERFORM public.fn_fleet_log(v.organization_id, v.id, 'Devolução', format('%s devolvida com %s km.', v.plate, p_km),
    to_char(p_returned_on, 'DD/MM/YYYY') || CASE WHEN v_inc IS NOT NULL THEN ' · com danos (ocorrência aberta)' ELSE '' END,
    'fleet_assignment', a.id);
  RETURN jsonb_build_object('assignment_id', a.id, 'incident_id', v_inc);
END;
$$;

-- Cancelar reserva futura ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fleet_cancel_reservation(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  a public.fleet_assignments;
  v_org uuid;
BEGIN
  SELECT * INTO a FROM public.fleet_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva desconhecida.' USING ERRCODE = 'no_data_found'; END IF;
  v_org := a.organization_id;
  PERFORM public.fn_fleet_assert(v_org, ARRAY['fleet.manage']);
  IF a.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'Esta reserva já foi cancelada.' USING ERRCODE = 'check_violation'; END IF;
  IF a.starts_on <= current_date THEN
    RAISE EXCEPTION 'Só se cancelam reservas que ainda não começaram. Esta devolve-se.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.fleet_assignments SET cancelled_at = now(), cancelled_by = public.current_business_user_id() WHERE id = a.id;
  IF a.schedule_item_id IS NOT NULL THEN
    UPDATE public.schedule_items SET status = 'cancelled' WHERE id = a.schedule_item_id;
  END IF;
  PERFORM public.fn_fleet_log(v_org, a.vehicle_id, 'Reserva cancelada', 'Reserva cancelada. A viatura ficou livre na Agenda.',
    to_char(a.starts_on, 'DD/MM/YYYY') || ' a ' || COALESCE(to_char(a.ends_on, 'DD/MM/YYYY'), 'sem fim'), 'fleet_assignment', a.id);
END;
$$;

-- Registar km ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fleet_record_odometer(p_vehicle_id uuid, p_km integer, p_read_on date DEFAULT current_date, p_confirm_jump boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v    public.fleet_vehicles;
  v_id uuid;
BEGIN
  SELECT * INTO v FROM public.fleet_vehicles WHERE id = p_vehicle_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Viatura desconhecida.' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.fn_fleet_assert(v.organization_id, ARRAY['fleet.manage'], v.id);

  IF p_km IS NULL THEN RAISE EXCEPTION 'Indica os km.' USING ERRCODE = 'check_violation'; END IF;
  IF p_km < v.odometer_km THEN
    RAISE EXCEPTION 'Os km não podem descer. Última leitura: % km.', v.odometer_km USING ERRCODE = 'check_violation';
  END IF;
  IF p_km - v.odometer_km > 5000 AND NOT p_confirm_jump THEN
    RAISE EXCEPTION 'São mais % km do que a última leitura. Confirma o valor.', p_km - v.odometer_km USING ERRCODE = 'check_violation';
  END IF;
  IF p_read_on IS NULL OR p_read_on > current_date THEN
    RAISE EXCEPTION 'Não pode ser no futuro.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.fleet_odometer_readings (organization_id, vehicle_id, read_on, km, source, recorded_by)
  VALUES (v.organization_id, v.id, p_read_on, p_km, 'manual', public.current_business_user_id())
  RETURNING id INTO v_id;
  UPDATE public.fleet_vehicles SET odometer_km = p_km, odometer_read_on = p_read_on WHERE id = v.id;

  PERFORM public.fn_fleet_log(v.organization_id, v.id, 'Km', 'Km registados.', p_km || ' km a ' || to_char(p_read_on, 'DD/MM/YYYY'), 'fleet_odometer_reading', v_id);
  RETURN v_id;
END;
$$;

-- Abastecimento / carregamento -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fleet_record_fuel(
  p_vehicle_id uuid, p_quantity numeric, p_amount numeric, p_km integer,
  p_supplier_id uuid DEFAULT NULL, p_supplier_label text DEFAULT NULL, p_spent_on date DEFAULT current_date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v      public.fleet_vehicles;
  v_el   boolean;
  v_drv  uuid;
  v_id   uuid;
BEGIN
  SELECT * INTO v FROM public.fleet_vehicles WHERE id = p_vehicle_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Escolhe a viatura.' USING ERRCODE = 'check_violation'; END IF;
  -- como no protótipo: gestor ou o próprio condutor (o perfil Financeiro não abastece)
  PERFORM public.fn_fleet_assert(v.organization_id, ARRAY['fleet.manage'], v.id);

  IF NOT (p_quantity > 0) THEN RAISE EXCEPTION 'Indica a quantidade.' USING ERRCODE = 'check_violation'; END IF;
  IF NOT (p_amount > 0) THEN RAISE EXCEPTION 'Indica o valor.' USING ERRCODE = 'check_violation'; END IF;
  IF p_km IS NULL OR p_km < v.odometer_km THEN
    RAISE EXCEPTION 'Indica os km (pelo menos % km).', v.odometer_km USING ERRCODE = 'check_violation';
  END IF;
  IF p_spent_on IS NULL OR p_spent_on > current_date THEN
    RAISE EXCEPTION 'Não pode ser no futuro.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = p_supplier_id AND s.organization_id = v.organization_id) THEN
    RAISE EXCEPTION 'Fornecedor inválido.' USING ERRCODE = 'check_violation';
  END IF;

  v_el := v.fuel_type = 'electric';
  SELECT a.driver_id INTO v_drv FROM public.fleet_assignments a WHERE a.id = public.fn_fleet_assignment_at(v.id, p_spent_on);

  INSERT INTO public.fleet_expenses (organization_id, vehicle_id, spent_on, category, quantity, unit, amount, odometer_km,
                                     driver_id, supplier_id, supplier_label, cost_center_id, cost_center_label, source, created_by)
  VALUES (v.organization_id, v.id, p_spent_on, CASE WHEN v_el THEN 'charging' ELSE 'fuel' END, p_quantity,
          CASE WHEN v_el THEN 'kWh' ELSE 'L' END, p_amount, p_km, v_drv, p_supplier_id, NULLIF(p_supplier_label, ''),
          v.cost_center_id, v.cost_center_label, 'fuel', public.current_business_user_id())
  RETURNING id INTO v_id;

  UPDATE public.fleet_vehicles SET odometer_km = p_km, odometer_read_on = p_spent_on WHERE id = v.id;
  INSERT INTO public.fleet_odometer_readings (organization_id, vehicle_id, read_on, km, source, source_id, recorded_by)
  VALUES (v.organization_id, v.id, p_spent_on, p_km, 'fuel', v_id, public.current_business_user_id());

  PERFORM public.fn_fleet_log(v.organization_id, v.id, CASE WHEN v_el THEN 'Carregamento' ELSE 'Abastecimento' END,
    format('Abastecimento de %s € registado na %s.', p_amount, v.plate),
    concat_ws(' · ', p_quantity || CASE WHEN v_el THEN ' kWh' ELSE ' L' END, p_amount || ' €', p_km || ' km', NULLIF(p_supplier_label, '')),
    'fleet_expense', v_id);
  RETURN v_id;
END;
$$;

-- Despesa ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fleet_record_expense(
  p_vehicle_id uuid, p_category text, p_spent_on date, p_amount numeric,
  p_supplier_id uuid DEFAULT NULL, p_supplier_label text DEFAULT NULL,
  p_cost_center_id uuid DEFAULT NULL, p_cost_center_label text DEFAULT NULL,
  p_ops_obra_id uuid DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v    public.fleet_vehicles;
  v_id uuid;
BEGIN
  SELECT * INTO v FROM public.fleet_vehicles WHERE id = p_vehicle_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Escolhe a viatura.' USING ERRCODE = 'check_violation'; END IF;
  PERFORM public.fn_fleet_assert(v.organization_id, ARRAY['fleet.costs', 'fleet.manage']);

  IF p_category IS NULL OR p_category NOT IN ('fuel', 'charging', 'tolls', 'parking', 'washing', 'workshop', 'rent',
                                              'insurance', 'road_tax', 'inspection', 'fine', 'other') THEN
    RAISE EXCEPTION 'Tipo de despesa inválido.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT (p_amount > 0) THEN RAISE EXCEPTION 'Indica o valor.' USING ERRCODE = 'check_violation'; END IF;
  IF p_supplier_id IS NULL AND NULLIF(btrim(COALESCE(p_supplier_label, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Escolhe o fornecedor.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_spent_on IS NULL OR p_spent_on > current_date THEN
    RAISE EXCEPTION 'Não pode ser no futuro.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = p_supplier_id AND s.organization_id = v.organization_id) THEN
    RAISE EXCEPTION 'Fornecedor inválido.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_ops_obra_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ops_obra o WHERE o.id = p_ops_obra_id AND o.organization_id = v.organization_id) THEN
    RAISE EXCEPTION 'Obra inválida.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.fleet_expenses (organization_id, vehicle_id, spent_on, category, amount, supplier_id, supplier_label,
                                     cost_center_id, cost_center_label, ops_obra_id, source, notes, created_by)
  VALUES (v.organization_id, v.id, p_spent_on, p_category, p_amount, p_supplier_id, NULLIF(btrim(COALESCE(p_supplier_label, '')), ''),
          COALESCE(p_cost_center_id, CASE WHEN p_cost_center_label IS NULL AND p_ops_obra_id IS NULL THEN v.cost_center_id END),
          COALESCE(NULLIF(p_cost_center_label, ''), CASE WHEN p_cost_center_id IS NULL AND p_ops_obra_id IS NULL THEN v.cost_center_label END),
          p_ops_obra_id, 'manual', NULLIF(p_notes, ''), public.current_business_user_id())
  RETURNING id INTO v_id;

  PERFORM public.fn_fleet_log(v.organization_id, v.id, 'Despesa', format('Despesa de %s € registada.', p_amount),
    concat_ws(' · ', p_category, p_amount || ' €', NULLIF(p_supplier_label, ''), NULLIF(p_cost_center_label, '')), 'fleet_expense', v_id);
  RETURN v_id;
END;
$$;

-- Importar extrato -------------------------------------------------------------------------
-- p_rows: [{"spent_on":"2026-10-13","plate":"AA-12-BC","station":"Galp Loures","quantity":61.2,
--           "amount":99.14,"km":148230,"unit":"L","external_ref":"..."}]
CREATE OR REPLACE FUNCTION public.rpc_fleet_import_statement(
  p_organization_id uuid, p_file_name text, p_file_sha256 text, p_supplier_id uuid, p_rows jsonb, p_document_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_imp     uuid;
  r         jsonb;
  v         public.fleet_vehicles;
  v_plate   text;
  v_km      integer;
  v_on      date;
  v_flag    boolean;
  v_drv     uuid;
  v_exp     uuid;
  n_total   integer := 0;
  n_ok      integer := 0;
  n_flag    integer := 0;
  n_skip    integer := 0;
BEGIN
  PERFORM public.fn_fleet_assert(p_organization_id, ARRAY['fleet.costs']);
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Extrato vazio ou inválido.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fleet_expense_imports i WHERE i.organization_id = p_organization_id AND i.file_sha256 = p_file_sha256) THEN
    RAISE EXCEPTION 'O % já foi importado: importá-lo outra vez duplicava os custos.', p_file_name USING ERRCODE = 'unique_violation';
  END IF;
  IF p_supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = p_supplier_id AND s.organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'Fornecedor inválido.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.fleet_expense_imports (organization_id, file_name, file_sha256, supplier_id, document_id, imported_by)
  VALUES (p_organization_id, p_file_name, p_file_sha256, p_supplier_id, p_document_id, public.current_business_user_id())
  RETURNING id INTO v_imp;

  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    n_total := n_total + 1;
    v_plate := upper(regexp_replace(COALESCE(r ->> 'plate', ''), '\s', '', 'g'));
    SELECT * INTO v FROM public.fleet_vehicles
    WHERE organization_id = p_organization_id AND plate = v_plate AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND OR NOT (COALESCE(NULLIF(r ->> 'amount', '')::numeric, 0) > 0) THEN
      n_skip := n_skip + 1;  -- matrícula desconhecida ou linha sem valor
      CONTINUE;
    END IF;
    v_km := NULLIF(r ->> 'km', '')::integer;
    v_on := (r ->> 'spent_on')::date;
    v_flag := v_km IS NOT NULL AND v_km < v.odometer_km;
    SELECT a.driver_id INTO v_drv FROM public.fleet_assignments a WHERE a.id = public.fn_fleet_assignment_at(v.id, v_on);

    v_exp := NULL;
    INSERT INTO public.fleet_expenses (organization_id, vehicle_id, spent_on, category, quantity, unit, amount, odometer_km,
                                       driver_id, supplier_id, supplier_label, cost_center_id, cost_center_label, source,
                                       import_id, external_ref, needs_review, review_reason, created_by)
    VALUES (p_organization_id, v.id, v_on,
            CASE WHEN COALESCE(r ->> 'unit', 'L') = 'kWh' THEN 'charging' ELSE 'fuel' END,
            NULLIF(r ->> 'quantity', '')::numeric, COALESCE(NULLIF(r ->> 'unit', ''), 'L'), (r ->> 'amount')::numeric, v_km,
            v_drv, p_supplier_id, 'Cartão frota · ' || COALESCE(r ->> 'station', ''), v.cost_center_id, v.cost_center_label,
            'statement', v_imp, COALESCE(NULLIF(r ->> 'external_ref', ''), md5(r::text)), v_flag,
            CASE WHEN v_flag THEN format('Km abaixo da última leitura (%s)', v.odometer_km) END,
            public.current_business_user_id())
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_exp;

    IF v_exp IS NULL THEN
      n_skip := n_skip + 1;  -- linha já importada noutro extrato
      CONTINUE;
    END IF;
    n_ok := n_ok + 1;
    IF v_flag THEN
      n_flag := n_flag + 1;
    ELSIF v_km IS NOT NULL AND v_km > v.odometer_km THEN
      UPDATE public.fleet_vehicles SET odometer_km = v_km, odometer_read_on = v_on WHERE id = v.id;
      INSERT INTO public.fleet_odometer_readings (organization_id, vehicle_id, read_on, km, source, source_id, recorded_by)
      VALUES (p_organization_id, v.id, v_on, v_km, 'statement', v_exp, public.current_business_user_id());
    END IF;
  END LOOP;

  UPDATE public.fleet_expense_imports
     SET rows_total = n_total, rows_imported = n_ok, rows_flagged = n_flag, rows_skipped = n_skip
   WHERE id = v_imp;

  PERFORM public.fn_fleet_log(p_organization_id, NULL, 'Importação',
    format('%s abastecimentos importados.%s', n_ok, CASE WHEN n_flag > 0 THEN format(' %s ficou para rever.', n_flag) ELSE '' END),
    p_file_name, 'fleet_expense_import', v_imp);
  RETURN jsonb_build_object('import_id', v_imp, 'total', n_total, 'imported', n_ok, 'flagged', n_flag, 'skipped', n_skip);
END;
$$;

-- Agendar manutenção -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fleet_schedule_maintenance(
  p_vehicle_id uuid, p_kind text, p_title text, p_scheduled_on date, p_expected_end_on date DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL, p_supplier_label text DEFAULT NULL, p_estimated_cost numeric DEFAULT NULL,
  p_notes text DEFAULT NULL, p_incident_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v       public.fleet_vehicles;
  v_res   record;
  v_id    uuid;
  v_item  uuid;
BEGIN
  SELECT * INTO v FROM public.fleet_vehicles WHERE id = p_vehicle_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Escolhe a viatura.' USING ERRCODE = 'check_violation'; END IF;
  PERFORM public.fn_fleet_assert(v.organization_id, ARRAY['fleet.manage']);

  IF p_kind NOT IN ('service', 'inspection', 'repair', 'tyres', 'other') THEN
    RAISE EXCEPTION 'Tipo de intervenção inválido.' USING ERRCODE = 'check_violation';
  END IF;
  IF btrim(COALESCE(p_title, '')) = '' THEN RAISE EXCEPTION 'Indica a intervenção.' USING ERRCODE = 'check_violation'; END IF;
  IF p_scheduled_on IS NULL OR p_scheduled_on < current_date THEN
    RAISE EXCEPTION 'Escolhe uma data a partir de hoje.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_expected_end_on IS NOT NULL AND p_expected_end_on < p_scheduled_on THEN
    RAISE EXCEPTION 'A data prevista de fim não pode ser antes do início.' USING ERRCODE = 'check_violation';
  END IF;

  -- a manutenção bloqueia a viatura: não pode cair numa reserva pontual
  SELECT b.label, b.from_on, b.to_on INTO v_res
  FROM public.fn_fleet_vehicle_blockers(v.id, p_scheduled_on, COALESCE(p_expected_end_on, p_scheduled_on)) b
  WHERE b.kind = 'temporary'
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'A viatura está reservada a % nesse dia (% a %). Escolhe outro dia ou cancela a reserva.',
      v_res.label, to_char(v_res.from_on, 'DD/MM/YYYY'), to_char(v_res.to_on, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.fleet_maintenance_events (organization_id, vehicle_id, kind, title, scheduled_on, expected_end_on, status,
                                               supplier_id, supplier_label, estimated_cost, notes, incident_id, created_by)
  VALUES (v.organization_id, v.id, p_kind, btrim(p_title), p_scheduled_on, p_expected_end_on, 'scheduled',
          p_supplier_id, NULLIF(p_supplier_label, ''), p_estimated_cost, NULLIF(p_notes, ''), p_incident_id,
          public.current_business_user_id())
  RETURNING id INTO v_id;

  v_item := public.fn_fleet_sync_schedule_item(v.id, NULL, format('%s · %s', btrim(p_title), v.plate),
                                               p_scheduled_on, COALESCE(p_expected_end_on, p_scheduled_on), 'scheduled', NULL,
                                               jsonb_build_object('fleet_kind', 'maintenance', 'fleet_maintenance_event_id', v_id));
  UPDATE public.fleet_maintenance_events SET schedule_item_id = v_item WHERE id = v_id;
  IF p_incident_id IS NOT NULL THEN
    UPDATE public.fleet_incidents SET maintenance_event_id = v_id, status = 'in_progress'
     WHERE id = p_incident_id AND vehicle_id = v.id AND status NOT IN ('resolved');
  END IF;

  PERFORM public.fn_fleet_log(v.organization_id, v.id, 'Manutenção agendada',
    format('%s da %s agendada para %s.', btrim(p_title), v.plate, to_char(p_scheduled_on, 'DD/MM/YYYY')),
    concat_ws(' · ', btrim(p_title), NULLIF(p_supplier_label, ''), to_char(p_scheduled_on, 'DD/MM/YYYY')), 'fleet_maintenance_event', v_id);
  RETURN v_id;
END;
$$;

-- Concluir manutenção --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fleet_complete_maintenance(p_event_id uuid, p_km integer, p_final_cost numeric, p_done_on date DEFAULT current_date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  m        public.fleet_maintenance_events;
  v        public.fleet_vehicles;
  v_exp    uuid;
  v_left   boolean := false;
  v_ipo    date;
BEGIN
  SELECT * INTO m FROM public.fleet_maintenance_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intervenção desconhecida.' USING ERRCODE = 'no_data_found'; END IF;
  SELECT * INTO v FROM public.fleet_vehicles WHERE id = m.vehicle_id FOR UPDATE;
  PERFORM public.fn_fleet_assert(v.organization_id, ARRAY['fleet.manage']);

  IF m.status IN ('done', 'cancelled') THEN RAISE EXCEPTION 'Esta intervenção já está fechada.' USING ERRCODE = 'check_violation'; END IF;
  IF p_km IS NULL OR p_km < v.odometer_km THEN
    RAISE EXCEPTION 'Não pode ser menos do que % km.', v.odometer_km USING ERRCODE = 'check_violation';
  END IF;
  IF p_final_cost IS NULL OR p_final_cost < 0 THEN
    RAISE EXCEPTION 'Indica o valor (0 se não teve custo).' USING ERRCODE = 'check_violation';
  END IF;
  IF p_done_on IS NULL OR p_done_on > current_date THEN RAISE EXCEPTION 'Não pode ser no futuro.' USING ERRCODE = 'check_violation'; END IF;

  UPDATE public.fleet_maintenance_events
     SET status = 'done', km = p_km, final_cost = p_final_cost, done_on = p_done_on
   WHERE id = m.id;

  UPDATE public.fleet_vehicles SET odometer_km = p_km, odometer_read_on = p_done_on WHERE id = v.id;
  INSERT INTO public.fleet_odometer_readings (organization_id, vehicle_id, read_on, km, source, source_id, recorded_by)
  VALUES (v.organization_id, v.id, p_done_on, p_km, 'maintenance', m.id, public.current_business_user_id());

  IF m.kind = 'service' THEN
    UPDATE public.fleet_maintenance_plans SET last_km = p_km, last_done_on = p_done_on
     WHERE vehicle_id = v.id AND kind = 'service' AND is_active;
  END IF;

  -- Decisão 10: próxima IPO pela regra legal (categoria + 1.ª matrícula).
  IF m.kind = 'inspection' THEN
    v_ipo := public.fn_fleet_next_inspection(v.vehicle_category, v.first_registration_on, p_done_on);
    UPDATE public.fleet_compliance SET is_current = false, replaced_at = now()
     WHERE vehicle_id = v.id AND kind = 'inspection' AND is_current;
    INSERT INTO public.fleet_compliance (organization_id, vehicle_id, kind, valid_from, valid_until, provider_supplier_id, created_by)
    VALUES (v.organization_id, v.id, 'inspection', p_done_on, v_ipo, m.supplier_id, public.current_business_user_id());
  END IF;

  IF v.status = 'workshop' THEN
    UPDATE public.fleet_vehicles SET status = 'active', status_reason = NULL, status_changed_at = now() WHERE id = v.id;
    v_left := true;
  END IF;

  IF p_final_cost > 0 THEN
    INSERT INTO public.fleet_expenses (organization_id, vehicle_id, spent_on, category, amount, odometer_km, supplier_id,
                                       supplier_label, cost_center_id, cost_center_label, source, maintenance_event_id, notes, created_by)
    VALUES (v.organization_id, v.id, p_done_on, CASE WHEN m.kind = 'inspection' THEN 'inspection' ELSE 'workshop' END,
            p_final_cost, p_km, m.supplier_id, m.supplier_label, v.cost_center_id, v.cost_center_label, 'maintenance', m.id,
            m.title, public.current_business_user_id())
    RETURNING id INTO v_exp;
  END IF;

  IF m.schedule_item_id IS NOT NULL THEN
    UPDATE public.schedule_items SET status = 'completed' WHERE id = m.schedule_item_id;
  END IF;

  PERFORM public.fn_fleet_log(v.organization_id, v.id, 'Manutenção concluída',
    m.title || ' concluída. ' || CASE WHEN v_left THEN v.plate || ' volta a estar ativa.' ELSE '' END,
    concat_ws(' · ', m.title, m.supplier_label, p_final_cost || ' €', p_km || ' km'), 'fleet_maintenance_event', m.id);
  RETURN jsonb_build_object('expense_id', v_exp, 'back_to_active', v_left, 'inspection_until', v_ipo);
END;
$$;

-- Ocorrências --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fleet_report_incident(
  p_vehicle_id uuid, p_kind text, p_occurred_at timestamptz, p_location text, p_description text,
  p_amount numeric DEFAULT NULL, p_notified_on date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v       public.fleet_vehicles;
  v_drv   uuid;
  v_ntf   date;
  v_id    uuid;
BEGIN
  SELECT * INTO v FROM public.fleet_vehicles WHERE id = p_vehicle_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Escolhe a viatura.' USING ERRCODE = 'check_violation'; END IF;
  PERFORM public.fn_fleet_assert(v.organization_id, ARRAY['fleet.manage'], v.id);

  IF p_kind NOT IN ('fine', 'accident', 'breakdown') THEN RAISE EXCEPTION 'Tipo inválido.' USING ERRCODE = 'check_violation'; END IF;
  IF p_occurred_at IS NULL THEN RAISE EXCEPTION 'Indica quando.' USING ERRCODE = 'check_violation'; END IF;
  IF (p_occurred_at AT TIME ZONE 'Europe/Lisbon')::date > current_date THEN
    RAISE EXCEPTION 'Não pode ser no futuro.' USING ERRCODE = 'check_violation';
  END IF;
  IF btrim(COALESCE(p_location, '')) = '' THEN RAISE EXCEPTION 'Indica o local.' USING ERRCODE = 'check_violation'; END IF;
  IF length(btrim(COALESCE(p_description, ''))) < 3 THEN RAISE EXCEPTION 'Descreve o que aconteceu.' USING ERRCODE = 'check_violation'; END IF;

  IF p_kind = 'fine' THEN
    v_ntf := COALESCE(p_notified_on, current_date);
    INSERT INTO public.fleet_incidents (organization_id, vehicle_id, kind, occurred_at, location, description, amount,
                                        notified_on, identify_by, status, created_by)
    VALUES (v.organization_id, v.id, 'fine', p_occurred_at, btrim(p_location), btrim(p_description), NULLIF(p_amount, 0),
            v_ntf, public.fn_fleet_add_working_days(v.organization_id, v_ntf, 15), 'to_identify', public.current_business_user_id())
    RETURNING id INTO v_id;
  ELSE
    SELECT a.driver_id INTO v_drv FROM public.fleet_assignments a
    WHERE a.id = public.fn_fleet_assignment_at(v.id, (p_occurred_at AT TIME ZONE 'Europe/Lisbon')::date);
    INSERT INTO public.fleet_incidents (organization_id, vehicle_id, kind, occurred_at, location, description, amount,
                                        driver_id, status, created_by)
    VALUES (v.organization_id, v.id, p_kind, p_occurred_at, btrim(p_location), btrim(p_description), NULLIF(p_amount, 0),
            v_drv, 'logged', public.current_business_user_id())
    RETURNING id INTO v_id;
  END IF;

  PERFORM public.fn_fleet_log(v.organization_id, v.id, 'Ocorrência', format('%s registada na %s.', p_kind, v.plate),
    concat_ws(' · ', p_kind, btrim(p_location), btrim(p_description)), 'fleet_incident', v_id);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_fleet_identify_driver(p_incident_id uuid, p_driver_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  i       public.fleet_incidents;
  d       public.fleet_drivers;
  v_plate text;
  v_auth  uuid;
BEGIN
  SELECT * INTO i FROM public.fleet_incidents WHERE id = p_incident_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ocorrência desconhecida.' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.fn_fleet_assert(i.organization_id, ARRAY['fleet.manage']);
  SELECT * INTO d FROM public.fleet_drivers WHERE id = p_driver_id AND organization_id = i.organization_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Escolhe o condutor.' USING ERRCODE = 'check_violation'; END IF;
  IF i.status = 'resolved' THEN RAISE EXCEPTION 'A ocorrência já está resolvida.' USING ERRCODE = 'check_violation'; END IF;

  SELECT plate INTO v_plate FROM public.fleet_vehicles WHERE id = i.vehicle_id;
  UPDATE public.fleet_incidents SET driver_id = d.id, status = 'identified', driver_notified_at = now() WHERE id = i.id;

  -- aviso ao condutor (se tiver conta)
  SELECT au.auth_user_id INTO v_auth FROM public.anew_users au WHERE au.id = d.user_id AND au.deleted_at IS NULL;
  IF v_auth IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, organization_id, kind, type, entity_type, entity_id, title, message, priority, link, data)
    VALUES (v_auth, i.organization_id, 'notification', 'fleet_fine_identified', 'fleet_incident', i.id,
            'Multa associada a ti',
            format('Foste identificado como condutor da %s a %s (%s).', v_plate,
                   to_char(i.occurred_at AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI'), i.description),
            'medium', '/frota/ocorrencias', jsonb_build_object('vehicle_id', i.vehicle_id));
  END IF;

  PERFORM public.fn_fleet_log(i.organization_id, i.vehicle_id, 'Condutor identificado',
    format('Condutor identificado: %s.%s', d.full_name, CASE WHEN v_auth IS NOT NULL THEN ' Notificação enviada.' ELSE '' END),
    concat_ws(' · ', i.kind || ' de ' || to_char(i.occurred_at AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY'), i.description),
    'fleet_incident', i.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_fleet_resolve_incident(p_incident_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  i public.fleet_incidents;
BEGIN
  SELECT * INTO i FROM public.fleet_incidents WHERE id = p_incident_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ocorrência desconhecida.' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.fn_fleet_assert(i.organization_id, ARRAY['fleet.manage']);
  IF i.status = 'resolved' THEN RAISE EXCEPTION 'A ocorrência já está resolvida.' USING ERRCODE = 'check_violation'; END IF;

  UPDATE public.fleet_incidents SET status = 'resolved', resolved_at = now(), resolved_by = public.current_business_user_id() WHERE id = i.id;
  -- os avisos pendentes desta ocorrência deixam de valer
  UPDATE public.notifications SET is_resolved = true, resolved_at = now(), resolved_reason = 'fleet_incident_resolved'
   WHERE entity_id = i.id AND type IN ('fleet_fine_deadline', 'fleet_fine_identified') AND is_resolved = false;

  PERFORM public.fn_fleet_log(i.organization_id, i.vehicle_id, 'Ocorrência resolvida', 'Ocorrência marcada como resolvida.',
    concat_ws(' · ', i.kind || ' de ' || to_char(i.occurred_at AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY'), i.description),
    'fleet_incident', i.id);
END;
$$;

-- Renovar seguro / IPO / IUC / contrato -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fleet_renew_compliance(
  p_vehicle_id uuid, p_kind text, p_valid_until date, p_amount numeric DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL, p_reference text DEFAULT NULL, p_document_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v      public.fleet_vehicles;
  old    public.fleet_compliance;
  v_id   uuid;
  v_sup  uuid;
BEGIN
  SELECT * INTO v FROM public.fleet_vehicles WHERE id = p_vehicle_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Viatura desconhecida.' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.fn_fleet_assert(v.organization_id, ARRAY['fleet.manage', 'fleet.costs']);

  IF p_kind NOT IN ('insurance', 'inspection', 'road_tax', 'lease_contract', 'green_card', 'tachograph', 'other') THEN
    RAISE EXCEPTION 'Documento inválido.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_valid_until IS NULL OR p_valid_until <= current_date THEN
    RAISE EXCEPTION 'A nova validade tem de ser depois de hoje.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id = p_document_id AND d.organization_id = v.organization_id) THEN
    RAISE EXCEPTION 'Documento anexo inválido.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO old FROM public.fleet_compliance WHERE vehicle_id = v.id AND kind = p_kind AND is_current FOR UPDATE;
  v_sup := COALESCE(p_supplier_id, old.provider_supplier_id);
  IF old.id IS NOT NULL THEN
    UPDATE public.fleet_compliance SET is_current = false, replaced_at = now() WHERE id = old.id;
  END IF;
  INSERT INTO public.fleet_compliance (organization_id, vehicle_id, kind, valid_from, valid_until, provider_supplier_id,
                                       reference, amount, document_id, created_by)
  VALUES (v.organization_id, v.id, p_kind, current_date, p_valid_until, v_sup, COALESCE(NULLIF(p_reference, ''), old.reference),
          NULLIF(p_amount, 0), p_document_id, public.current_business_user_id())
  RETURNING id INTO v_id;

  IF p_amount > 0 THEN
    INSERT INTO public.fleet_expenses (organization_id, vehicle_id, spent_on, category, amount, supplier_id, supplier_label,
                                       cost_center_id, cost_center_label, source, compliance_id, created_by)
    VALUES (v.organization_id, v.id, current_date,
            CASE p_kind WHEN 'insurance' THEN 'insurance' WHEN 'road_tax' THEN 'road_tax' WHEN 'inspection' THEN 'inspection'
                        WHEN 'lease_contract' THEN 'rent' ELSE 'other' END,
            p_amount, v_sup, CASE WHEN p_kind = 'road_tax' AND v_sup IS NULL THEN 'Autoridade Tributária' END,
            v.cost_center_id, v.cost_center_label, 'renewal', v_id, public.current_business_user_id());
  END IF;

  UPDATE public.notifications SET is_resolved = true, resolved_at = now(), resolved_reason = 'fleet_compliance_renewed'
   WHERE entity_id = old.id AND type = 'fleet_document_due' AND is_resolved = false;

  PERFORM public.fn_fleet_log(v.organization_id, v.id, 'Documento renovado',
    format('%s da %s renovado até %s.', p_kind, v.plate, to_char(p_valid_until, 'DD/MM/YYYY')),
    CASE WHEN p_amount > 0 THEN p_amount || ' €' END, 'fleet_compliance', v_id);
  RETURN v_id;
END;
$$;

-- Carrinha: mínimo por artigo, pedir e satisfazer reposição ----------------------------------
-- O mínimo vive em stocks.minimum_quantity da carrinha; reorder_point fica a 0
-- para a carrinha não entrar no "stock baixo" do Inventário.
CREATE OR REPLACE FUNCTION public.rpc_fleet_set_van_minimum(p_vehicle_id uuid, p_product_id uuid, p_minimum integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v public.fleet_vehicles;
BEGIN
  SELECT * INTO v FROM public.fleet_vehicles WHERE id = p_vehicle_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Viatura desconhecida.' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.fn_fleet_assert(v.organization_id, ARRAY['fleet.manage']);
  PERFORM public.fn_fleet_assert(v.organization_id, ARRAY['inventory.edit']);
  IF v.warehouse_id IS NULL THEN RAISE EXCEPTION 'A % não é um armazém móvel.', v.plate USING ERRCODE = 'check_violation'; END IF;
  IF p_minimum IS NULL OR p_minimum < 0 THEN RAISE EXCEPTION 'Indica o mínimo.' USING ERRCODE = 'check_violation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = p_product_id AND p.organization_id = v.organization_id) THEN
    RAISE EXCEPTION 'Artigo inválido.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.stocks SET minimum_quantity = p_minimum, reorder_point = 0
   WHERE product_id = p_product_id AND warehouse_id = v.warehouse_id;
  IF NOT FOUND THEN
    INSERT INTO public.stocks (organization_id, product_id, warehouse_id, quantity, minimum_quantity, reorder_point, created_by)
    VALUES (v.organization_id, p_product_id, v.warehouse_id, 0, p_minimum, 0, public.current_business_user_id());
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_fleet_request_restock(p_vehicle_id uuid, p_from_warehouse_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v       public.fleet_vehicles;
  v_below integer;
  v_ids   uuid[];
BEGIN
  SELECT * INTO v FROM public.fleet_vehicles WHERE id = p_vehicle_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Viatura desconhecida.' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.fn_fleet_assert(v.organization_id, ARRAY['fleet.manage'], v.id);
  IF v.warehouse_id IS NULL THEN RAISE EXCEPTION 'A % não é um armazém móvel.', v.plate USING ERRCODE = 'check_violation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses w
                 WHERE w.id = p_from_warehouse_id AND w.organization_id = v.organization_id
                   AND w.deleted_at IS NULL AND w.is_active AND NOT w.is_vehicle) THEN
    RAISE EXCEPTION 'Armazém de origem inválido.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_below
  FROM public.stocks s
  WHERE s.warehouse_id = v.warehouse_id AND s.deleted_at IS NULL
    AND s.minimum_quantity > 0 AND s.quantity < s.minimum_quantity;
  IF v_below = 0 THEN
    RAISE EXCEPTION 'Nenhum artigo da carrinha está abaixo do mínimo.' USING ERRCODE = 'check_violation';
  END IF;

  WITH ins AS (
    INSERT INTO public.fleet_restock_requests (organization_id, vehicle_id, from_warehouse_id, to_warehouse_id, product_id, quantity, requested_by)
    SELECT v.organization_id, v.id, p_from_warehouse_id, v.warehouse_id, s.product_id, s.minimum_quantity - s.quantity,
           public.current_business_user_id()
    FROM public.stocks s
    WHERE s.warehouse_id = v.warehouse_id AND s.deleted_at IS NULL
      AND s.minimum_quantity > 0 AND s.quantity < s.minimum_quantity
    ON CONFLICT DO NOTHING
    RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM ins;

  IF v_ids IS NULL THEN
    RAISE EXCEPTION 'Já há pedidos de reposição pendentes para todos os artigos em falta.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.fn_fleet_log(v.organization_id, v.id, 'Pedido de reposição',
    format('Pedido de reposição: armazém central → carrinha %s (%s artigo(s)).', v.plate, cardinality(v_ids)), NULL,
    'fleet_restock_request', v_ids[1]);
  RETURN jsonb_build_object('request_ids', to_jsonb(v_ids));
END;
$$;

-- Satisfazer: transferência real (rpc_register_stock_transfer, que volta a
-- exigir inventory.edit). Cada pedido corre à parte: um sem stock não trava os outros.
CREATE OR REPLACE FUNCTION public.rpc_fleet_fulfil_restock(p_request_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r       record;
  v_res   jsonb;
  v_out   jsonb := '[]'::jsonb;
BEGIN
  FOR r IN SELECT q.*, fv.plate
           FROM public.fleet_restock_requests q
           JOIN public.fleet_vehicles fv ON fv.id = q.vehicle_id
           WHERE q.id = ANY (p_request_ids)
           ORDER BY q.product_id
           FOR UPDATE OF q LOOP
    PERFORM public.fn_fleet_assert(r.organization_id, ARRAY['inventory.edit']);
    IF r.status <> 'requested' THEN
      v_out := v_out || jsonb_build_object('id', r.id, 'ok', false, 'error', 'Pedido já tratado.');
      CONTINUE;
    END IF;
    BEGIN
      v_res := public.rpc_register_stock_transfer(r.product_id, r.from_warehouse_id, r.to_warehouse_id, r.quantity,
                                                  'Reposição da carrinha ' || r.plate);
      UPDATE public.fleet_restock_requests
         SET status = 'transferred', stock_document_number = v_res ->> 'document_number',
             transfer_group_id = (v_res ->> 'transfer_group_id')::uuid, last_error = NULL,
             done_by = public.current_business_user_id(), done_at = now()
       WHERE id = r.id;
      v_out := v_out || jsonb_build_object('id', r.id, 'ok', true, 'document_number', v_res ->> 'document_number');
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.fleet_restock_requests SET last_error = SQLERRM WHERE id = r.id;
      v_out := v_out || jsonb_build_object('id', r.id, 'ok', false, 'error', SQLERRM);
    END;
    PERFORM public.fn_fleet_log(r.organization_id, r.vehicle_id, 'Reposição', format('Reposição da carrinha %s tratada.', r.plate),
      NULL, 'fleet_restock_request', r.id);
  END LOOP;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_fleet_cancel_restock(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  q public.fleet_restock_requests;
BEGIN
  SELECT * INTO q FROM public.fleet_restock_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido desconhecido.' USING ERRCODE = 'no_data_found'; END IF;
  IF q.requested_by IS DISTINCT FROM public.current_business_user_id() THEN
    PERFORM public.fn_fleet_assert(q.organization_id, ARRAY['fleet.manage', 'inventory.edit']);
  ELSE
    PERFORM public.fn_fleet_assert(q.organization_id, ARRAY['fleet.manage', 'inventory.edit'], q.vehicle_id);
  END IF;
  IF q.status <> 'requested' THEN RAISE EXCEPTION 'Pedido já tratado.' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.fleet_restock_requests SET status = 'cancelled', done_by = public.current_business_user_id(), done_at = now() WHERE id = q.id;
END;
$$;

-- Operações: ligação ordem/obra ↔ viatura e custo por km ---------------------------------
CREATE OR REPLACE FUNCTION public.fn_fleet_cost_per_km(
  p_organization_id uuid, p_vehicle_id uuid DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_from date := COALESCE(p_from, current_date - 90);
  v_to   date := COALESCE(p_to, current_date);
  v_km   numeric;
  v_cost numeric;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR p_organization_id IS NULL
     OR p_organization_id NOT IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))) THEN
    RAISE EXCEPTION 'Sem acesso a esta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH km AS (
    SELECT r.vehicle_id, max(r.km) - min(r.km) AS km
    FROM public.fleet_odometer_readings r
    JOIN public.fleet_vehicles v ON v.id = r.vehicle_id
    WHERE r.organization_id = p_organization_id
      AND r.read_on BETWEEN v_from AND v_to
      AND NOT r.is_flagged
      AND v.deleted_at IS NULL AND v.status NOT IN ('inactive', 'sold')
      AND (p_vehicle_id IS NULL OR r.vehicle_id = p_vehicle_id)
    GROUP BY r.vehicle_id
  ), cost AS (
    -- Decisão 9: só custos variáveis com o uso. Ficam de fora os fixos
    -- (seguro, IUC, renda, inspeção) e as multas.
    SELECT e.vehicle_id, sum(e.amount) AS amount
    FROM public.fleet_expenses e
    WHERE e.organization_id = p_organization_id
      AND e.spent_on BETWEEN v_from AND v_to
      AND NOT e.needs_review
      AND e.category IN ('fuel', 'charging', 'tolls', 'parking', 'washing', 'workshop', 'other')
      AND e.vehicle_id IN (SELECT km.vehicle_id FROM km)
    GROUP BY e.vehicle_id
  )
  SELECT sum(km.km), sum(COALESCE(cost.amount, 0)) INTO v_km, v_cost
  FROM km LEFT JOIN cost ON cost.vehicle_id = km.vehicle_id;

  IF p_vehicle_id IS NOT NULL AND (v_km IS NULL OR v_km <= 0) THEN
    RETURN public.fn_fleet_cost_per_km(p_organization_id, NULL, p_from, p_to);  -- média da frota
  END IF;
  IF v_km IS NULL OR v_km <= 0 OR v_cost IS NULL OR v_cost <= 0 THEN
    RETURN 0.40;  -- os 0,40 €/km de sempre (sugestaoFichaLocal.ts, km_eur)
  END IF;
  RETURN round(v_cost / v_km, 4);
END;
$$;

-- Lançar o custo da deslocação na ordem (decisão 9). Usa a RPC EXISTENTE
-- rpc_ops_lancar_custo, sem a alterar: é ela que verifica
-- operations.costs.view + função admin/gestor em Operações, recusa ordens
-- confirmadas/canceladas e regista o evento 'custo_lancado'. Fica com
-- tipo 'outro' e origem 'manual' (a RPC não deixa escolher a origem; e
-- 'calculado' é reservado à mão de obra, que ops_recalcular_custo_mao_obra
-- apaga e recria). Quantidade 1 e valor = travel_cost, para não perder as
-- casas decimais do €/km (valor_unit é numeric(12,2) dentro da RPC).
-- ops_custo só tem ordem: ligações só a obra não lançam custo.
CREATE OR REPLACE FUNCTION public.rpc_fleet_post_travel_cost(p_link_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  l       public.fleet_ops_links;
  v_plate text;
  v_res   jsonb;
  v_cid   uuid;
BEGIN
  SELECT * INTO l FROM public.fleet_ops_links WHERE id = p_link_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ligação desconhecida.' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.fn_fleet_assert(l.organization_id, ARRAY['fleet.manage', 'fleet.costs'], l.vehicle_id);
  IF l.ops_custo_id IS NOT NULL THEN
    RAISE EXCEPTION 'O custo desta deslocação já foi lançado na ordem.' USING ERRCODE = 'check_violation';
  END IF;
  IF l.ops_ordem_id IS NULL THEN
    RAISE EXCEPTION 'Só se lança custo numa ordem (o custo de Operações pertence à ordem, não à obra).' USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(l.travel_cost, 0) <= 0 THEN
    RAISE EXCEPTION 'Indica os km da deslocação.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT fv.plate INTO v_plate FROM public.fleet_vehicles fv WHERE fv.id = l.vehicle_id;
  v_res := public.rpc_ops_lancar_custo(
    l.ops_ordem_id, 'outro',
    format('Deslocação %s · %s km × %s €/km', v_plate, l.km, replace(trim_scale(l.cost_per_km)::text, '.', ',')),
    1, l.travel_cost, NULL, NULL, NULL);
  v_cid := (v_res ->> 'id')::uuid;

  UPDATE public.fleet_ops_links SET ops_custo_id = v_cid WHERE id = l.id;
  PERFORM public.fn_fleet_log(l.organization_id, l.vehicle_id, 'Custo da deslocação',
    format('Deslocação de %s € lançada na ordem.', l.travel_cost), NULL, 'fleet_ops_link', l.id);
  RETURN v_cid;
END;
$$;

-- Liga a viatura a uma ordem/obra. Lança logo o custo na ordem quando quem
-- liga pode lançar custos em Operações e a ordem está aberta; senão a ligação
-- fica com o custo pendente (ops_custo_id NULL) e um gestor lança-o depois com
-- rpc_fleet_post_travel_cost. Assim o condutor (fleet.self) pode ligar sem
-- ter acesso aos custos.
CREATE OR REPLACE FUNCTION public.rpc_fleet_link_order(
  p_vehicle_id uuid, p_ops_ordem_id uuid, p_ops_obra_id uuid, p_used_on date,
  p_driver_id uuid DEFAULT NULL, p_km integer DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v        public.fleet_vehicles;
  v_id     uuid;
  v_cost   numeric;
  v_estado text;
  v_cid    uuid;
  v_why    text;
BEGIN
  SELECT * INTO v FROM public.fleet_vehicles WHERE id = p_vehicle_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Viatura desconhecida.' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.fn_fleet_assert(v.organization_id, ARRAY['fleet.manage'], v.id);
  IF p_ops_ordem_id IS NULL AND p_ops_obra_id IS NULL THEN
    RAISE EXCEPTION 'Indica a ordem ou a obra.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_ops_ordem_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ops_ordem o WHERE o.id = p_ops_ordem_id AND o.organization_id = v.organization_id) THEN
    RAISE EXCEPTION 'Ordem inválida.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_ops_obra_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ops_obra o WHERE o.id = p_ops_obra_id AND o.organization_id = v.organization_id) THEN
    RAISE EXCEPTION 'Obra inválida.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_driver_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fleet_drivers d WHERE d.id = p_driver_id AND d.organization_id = v.organization_id) THEN
    RAISE EXCEPTION 'Condutor inválido.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.fleet_ops_links (organization_id, vehicle_id, ops_ordem_id, ops_obra_id, used_on, driver_id, km, cost_per_km, notes, created_by)
  VALUES (v.organization_id, v.id, p_ops_ordem_id, p_ops_obra_id, COALESCE(p_used_on, current_date), p_driver_id, p_km,
          public.fn_fleet_cost_per_km(v.organization_id, v.id), NULLIF(p_notes, ''), public.current_business_user_id())
  RETURNING id, travel_cost INTO v_id, v_cost;
  PERFORM public.fn_fleet_log(v.organization_id, v.id, 'Ligação a Operações', format('%s ligada a uma ordem/obra.', v.plate), NULL, 'fleet_ops_link', v_id);

  IF p_ops_ordem_id IS NULL THEN
    v_why := 'Ligação só à obra: o custo de Operações pertence à ordem.';
  ELSIF COALESCE(v_cost, 0) <= 0 THEN
    v_why := 'Sem km: não há custo a lançar.';
  ELSIF NOT public.ops_pode(v.organization_id, 'operations.costs.view') THEN
    v_why := 'Sem permissão para lançar custos em Operações: fica pendente para um gestor.';
  ELSE
    SELECT o.estado INTO v_estado FROM public.ops_ordem o WHERE o.id = p_ops_ordem_id;
    IF v_estado IN ('confirmada', 'cancelada') THEN
      v_why := 'A ordem já está encerrada: o custo não foi lançado.';
    ELSE
      v_cid := public.rpc_fleet_post_travel_cost(v_id);
    END IF;
  END IF;

  RETURN jsonb_build_object('link_id', v_id, 'travel_cost', v_cost, 'ops_custo_id', v_cid, 'cost_not_posted_reason', v_why);
END;
$$;

-- ============================================================================
-- A.7 Alertas diários (notifications + alert_settings + pg_cron)
-- ============================================================================
-- Tipos (alert_settings.alert_type, kind 'alert'; sem linha = ativo com o
-- limiar por omissão): fleet_document_due (30 d), fleet_service_due (30 d /
-- 3000 km), fleet_fine_deadline (5 d), fleet_licence_expiring (60 d).
-- Destinatários: quem tem fleet.manage na organização (membro direto); a
-- carta também ao próprio condutor. Sem repetir o mesmo aviso em 7 dias.
CREATE OR REPLACE FUNCTION public.fn_fleet_daily_alerts()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_n    integer := 0;
  v_rows integer;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _fleet_alerts (
    organization_id uuid, type text, entity_type text, entity_id uuid, priority text,
    title text, message text, link text, data jsonb, driver_user uuid
  ) ON COMMIT DROP;
  TRUNCATE _fleet_alerts;

  WITH orgs AS (
    SELECT DISTINCT organization_id FROM public.fleet_vehicles WHERE deleted_at IS NULL
  ), cfg AS (
    SELECT o.organization_id,
           COALESCE(s_doc.is_active, true) AS doc_on,  COALESCE(s_doc.days_threshold, 30) AS doc_days,
           COALESCE(s_srv.is_active, true) AS srv_on,  COALESCE(s_srv.days_threshold, 30) AS srv_days,
           COALESCE(s_fin.is_active, true) AS fin_on,  COALESCE(s_fin.days_threshold, 5)  AS fin_days,
           COALESCE(s_lic.is_active, true) AS lic_on,  COALESCE(s_lic.days_threshold, 60) AS lic_days
    FROM orgs o
    LEFT JOIN public.alert_settings s_doc ON s_doc.organization_id = o.organization_id AND s_doc.alert_type = 'fleet_document_due' AND s_doc.kind = 'alert'
    LEFT JOIN public.alert_settings s_srv ON s_srv.organization_id = o.organization_id AND s_srv.alert_type = 'fleet_service_due' AND s_srv.kind = 'alert'
    LEFT JOIN public.alert_settings s_fin ON s_fin.organization_id = o.organization_id AND s_fin.alert_type = 'fleet_fine_deadline' AND s_fin.kind = 'alert'
    LEFT JOIN public.alert_settings s_lic ON s_lic.organization_id = o.organization_id AND s_lic.alert_type = 'fleet_licence_expiring' AND s_lic.kind = 'alert'
  )
  INSERT INTO _fleet_alerts
  -- vencimentos
  SELECT c.organization_id, 'fleet_document_due', 'fleet_compliance', c.id,
         CASE WHEN c.valid_until < current_date THEN 'high' ELSE 'medium' END,
         'Documento da viatura a vencer',
         format('%s da %s: %s %s.',
                CASE c.kind WHEN 'insurance' THEN 'Seguro' WHEN 'inspection' THEN 'Inspeção (IPO)' WHEN 'road_tax' THEN 'IUC'
                            WHEN 'lease_contract' THEN 'Fim do contrato' ELSE 'Documento' END,
                v.plate, CASE WHEN c.valid_until < current_date THEN 'venceu a' ELSE 'vence a' END, to_char(c.valid_until, 'DD/MM/YYYY')),
         '/frota/documentos', jsonb_build_object('vehicle_id', v.id, 'kind', c.kind, 'valid_until', c.valid_until), NULL::uuid
  FROM public.fleet_compliance c
  JOIN public.fleet_vehicles v ON v.id = c.vehicle_id
  JOIN cfg ON cfg.organization_id = c.organization_id
  WHERE cfg.doc_on AND c.is_current AND NOT c.is_exempt
    AND v.deleted_at IS NULL AND v.status NOT IN ('inactive', 'sold')
    AND c.valid_until <= current_date + cfg.doc_days
  UNION ALL
  -- revisões (km ou data, o que chegar primeiro), sem revisão já marcada
  SELECT p.organization_id, 'fleet_service_due', 'fleet_vehicle', v.id, 'medium',
         'Revisão a fazer',
         format('A %s precisa de revisão (próxima aos %s km ou a %s).', v.plate, p.last_km + p.every_km,
                to_char((p.last_done_on + make_interval(months => p.every_months))::date, 'DD/MM/YYYY')),
         '/frota/manutencao', jsonb_build_object('vehicle_id', v.id), NULL::uuid
  FROM public.fleet_maintenance_plans p
  JOIN public.fleet_vehicles v ON v.id = p.vehicle_id
  JOIN cfg ON cfg.organization_id = p.organization_id
  WHERE cfg.srv_on AND p.is_active AND p.kind = 'service'
    AND v.deleted_at IS NULL AND v.status NOT IN ('inactive', 'sold')
    AND ((p.every_km IS NOT NULL AND p.last_km IS NOT NULL AND v.odometer_km >= p.last_km + p.every_km - 3000)
      OR (p.every_months IS NOT NULL AND p.last_done_on IS NOT NULL
          AND (p.last_done_on + make_interval(months => p.every_months))::date <= current_date + cfg.srv_days))
    AND NOT EXISTS (SELECT 1 FROM public.fleet_maintenance_events m
                    WHERE m.vehicle_id = v.id AND m.kind = 'service' AND m.status IN ('scheduled', 'in_progress'))
  UNION ALL
  -- multas por identificar perto do prazo
  SELECT i.organization_id, 'fleet_fine_deadline', 'fleet_incident', i.id,
         CASE WHEN i.identify_by <= current_date + 2 THEN 'high' ELSE 'medium' END,
         'Multa por identificar',
         format('Multa da %s: identifica o condutor até %s.', v.plate, to_char(i.identify_by, 'DD/MM/YYYY')),
         '/frota/ocorrencias', jsonb_build_object('vehicle_id', v.id, 'identify_by', i.identify_by), NULL::uuid
  FROM public.fleet_incidents i
  JOIN public.fleet_vehicles v ON v.id = i.vehicle_id
  JOIN cfg ON cfg.organization_id = i.organization_id
  WHERE cfg.fin_on AND i.kind = 'fine' AND i.status = 'to_identify' AND i.identify_by <= current_date + cfg.fin_days
  UNION ALL
  -- cartas a caducar
  SELECT d.organization_id, 'fleet_licence_expiring', 'fleet_driver', d.id,
         CASE WHEN d.licence_expires_on < current_date THEN 'high' ELSE 'medium' END,
         'Carta de condução a caducar',
         format('A carta de %s %s a %s.', d.full_name,
                CASE WHEN d.licence_expires_on < current_date THEN 'caducou' ELSE 'caduca' END, to_char(d.licence_expires_on, 'DD/MM/YYYY')),
         '/frota/condutores', jsonb_build_object('driver_id', d.id), au.auth_user_id
  FROM public.fleet_drivers d
  JOIN cfg ON cfg.organization_id = d.organization_id
  LEFT JOIN public.anew_users au ON au.id = d.user_id AND au.deleted_at IS NULL
  WHERE cfg.lic_on AND d.is_active AND d.deleted_at IS NULL
    AND d.licence_expires_on IS NOT NULL AND d.licence_expires_on <= current_date + cfg.lic_days;

  WITH recipients AS (
    SELECT DISTINCT am.organization_id, au.auth_user_id
    FROM public.anew_memberships am
    JOIN public.anew_users au ON au.id = am.user_id
    JOIN public.anew_role_permissions rp ON rp.role_id = am.role_id AND rp.permission_code = 'fleet.manage'
    WHERE am.status = 'active' AND am.role_is_client IS NOT TRUE
      AND au.auth_user_id IS NOT NULL AND au.deleted_at IS NULL
  ), targets AS (
    SELECT r.auth_user_id AS user_id, a.* FROM _fleet_alerts a JOIN recipients r ON r.organization_id = a.organization_id
    UNION
    SELECT a.driver_user, a.* FROM _fleet_alerts a WHERE a.driver_user IS NOT NULL
  )
  INSERT INTO public.notifications (user_id, organization_id, kind, type, entity_type, entity_id, title, message, priority, link, data)
  SELECT t.user_id, t.organization_id, 'alert', t.type, t.entity_type, t.entity_id, t.title, t.message, t.priority, t.link, t.data
  FROM targets t
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = t.user_id AND n.type = t.type AND n.entity_id = t.entity_id
      AND n.is_resolved = false AND n.is_dismissed = false
      AND n.created_at > now() - interval '7 days');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_n := v_rows;
  RETURN v_n;
END;
$$;

-- ============================================================================
-- A.8 RLS — só leitura direta; toda a escrita passa pelas RPCs
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fleet_drivers', 'fleet_vehicles', 'fleet_maintenance_plans', 'fleet_assignments',
                           'fleet_odometer_readings', 'fleet_expense_imports', 'fleet_maintenance_events', 'fleet_incidents',
                           'fleet_compliance', 'fleet_expenses', 'fleet_restock_requests', 'fleet_ops_links',
                           'fleet_activity_log'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
  END LOOP;
END $$;

-- Gestão (fleet.view) vê tudo da organização; o condutor (fleet.self) vê o seu.
CREATE POLICY fleet_vehicles_select ON public.fleet_vehicles FOR SELECT TO authenticated USING (
  (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
   AND public.has_anew_permission((SELECT auth.uid()), 'fleet.view'))
  OR id IN (SELECT public.fn_fleet_my_vehicle_ids()));

CREATE POLICY fleet_drivers_select ON public.fleet_drivers FOR SELECT TO authenticated USING (
  (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
   AND public.has_anew_permission((SELECT auth.uid()), 'fleet.view'))
  OR id IN (SELECT public.fn_fleet_my_driver_ids()));

CREATE POLICY fleet_maintenance_plans_select ON public.fleet_maintenance_plans FOR SELECT TO authenticated USING (
  (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
   AND public.has_anew_permission((SELECT auth.uid()), 'fleet.view'))
  OR vehicle_id IN (SELECT public.fn_fleet_my_vehicle_ids()));

CREATE POLICY fleet_assignments_select ON public.fleet_assignments FOR SELECT TO authenticated USING (
  (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
   AND public.has_anew_permission((SELECT auth.uid()), 'fleet.view'))
  OR driver_id IN (SELECT public.fn_fleet_my_driver_ids()));

CREATE POLICY fleet_odometer_readings_select ON public.fleet_odometer_readings FOR SELECT TO authenticated USING (
  (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
   AND public.has_anew_permission((SELECT auth.uid()), 'fleet.view'))
  OR vehicle_id IN (SELECT public.fn_fleet_my_vehicle_ids()));

CREATE POLICY fleet_maintenance_events_select ON public.fleet_maintenance_events FOR SELECT TO authenticated USING (
  (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
   AND public.has_anew_permission((SELECT auth.uid()), 'fleet.view'))
  OR vehicle_id IN (SELECT public.fn_fleet_my_vehicle_ids()));

CREATE POLICY fleet_incidents_select ON public.fleet_incidents FOR SELECT TO authenticated USING (
  (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
   AND public.has_anew_permission((SELECT auth.uid()), 'fleet.view'))
  OR driver_id IN (SELECT public.fn_fleet_my_driver_ids())
  OR (created_by = public.current_business_user_id() AND vehicle_id IN (SELECT public.fn_fleet_my_vehicle_ids())));

CREATE POLICY fleet_compliance_select ON public.fleet_compliance FOR SELECT TO authenticated USING (
  (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
   AND public.has_anew_permission((SELECT auth.uid()), 'fleet.view'))
  OR vehicle_id IN (SELECT public.fn_fleet_my_vehicle_ids()));

-- Custos: fleet.costs; o condutor vê só os que lhe estão imputados.
CREATE POLICY fleet_expenses_select ON public.fleet_expenses FOR SELECT TO authenticated USING (
  (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
   AND public.has_anew_permission((SELECT auth.uid()), 'fleet.costs'))
  OR driver_id IN (SELECT public.fn_fleet_my_driver_ids()));

CREATE POLICY fleet_expense_imports_select ON public.fleet_expense_imports FOR SELECT TO authenticated USING (
  organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  AND public.has_anew_permission((SELECT auth.uid()), 'fleet.costs'));

-- Reposição: a Frota e quem trata das transferências no Inventário.
CREATE POLICY fleet_restock_requests_select ON public.fleet_restock_requests FOR SELECT TO authenticated USING (
  (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
   AND (public.has_anew_permission((SELECT auth.uid()), 'fleet.view')
        OR public.has_anew_permission((SELECT auth.uid()), 'inventory.edit')))
  OR vehicle_id IN (SELECT public.fn_fleet_my_vehicle_ids()));

CREATE POLICY fleet_ops_links_select ON public.fleet_ops_links FOR SELECT TO authenticated USING (
  organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  AND (public.has_anew_permission((SELECT auth.uid()), 'fleet.view')
       OR public.has_anew_permission((SELECT auth.uid()), 'operations.view')));

CREATE POLICY fleet_activity_log_select ON public.fleet_activity_log FOR SELECT TO authenticated USING (
  organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  AND public.has_anew_permission((SELECT auth.uid()), 'fleet.view'));

REVOKE ALL ON public.fleet_v_vehicles FROM anon;
GRANT SELECT ON public.fleet_v_vehicles TO authenticated;

-- ============================================================================
-- A.9 Grants das funções
-- ============================================================================
DO $$
DECLARE
  f text;
BEGIN
  -- internas: só o dono (postgres) e service_role
  FOREACH f IN ARRAY ARRAY[
    'public.fn_fleet_log(uuid, uuid, text, text, text, text, uuid)',
    'public.fn_fleet_licence_problem(uuid, text, date)',
    'public.fn_fleet_add_working_days(uuid, date, integer)',
    'public.fn_fleet_board(uuid)',
    'public.fn_fleet_sync_schedule_item(uuid, uuid, text, date, date, public.schedule_item_status, uuid, jsonb)',
    'public.fn_fleet_vehicle_blockers(uuid, date, date, uuid, uuid)',
    'public.fn_fleet_daily_alerts()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;

  -- usadas pelo RLS e pelas RPCs, ou chamadas pela app
  FOREACH f IN ARRAY ARRAY[
    'public.fn_fleet_can(uuid, text)',
    'public.fn_fleet_my_driver_ids()',
    'public.fn_fleet_my_vehicle_ids()',
    'public.fn_fleet_assignment_at(uuid, date)',
    'public.fn_fleet_is_my_vehicle(uuid)',
    'public.fn_fleet_assert(uuid, text[], uuid)',
    'public.fn_fleet_cost_per_km(uuid, uuid, date, date)',
    'public.fn_fleet_next_inspection(text, date, date)',
    'public.rpc_fleet_post_travel_cost(uuid)',
    'public.rpc_fleet_upsert_driver(uuid, uuid, jsonb)',
    'public.rpc_fleet_create_vehicle(uuid, jsonb)',
    'public.rpc_fleet_update_vehicle(uuid, jsonb)',
    'public.rpc_fleet_set_status(uuid, text, text)',
    'public.rpc_fleet_assign(uuid, uuid, text, date, date, integer, text, uuid, uuid)',
    'public.rpc_fleet_return(uuid, integer, date, text)',
    'public.rpc_fleet_cancel_reservation(uuid)',
    'public.rpc_fleet_record_odometer(uuid, integer, date, boolean)',
    'public.rpc_fleet_record_fuel(uuid, numeric, numeric, integer, uuid, text, date)',
    'public.rpc_fleet_record_expense(uuid, text, date, numeric, uuid, text, uuid, text, uuid, text)',
    'public.rpc_fleet_import_statement(uuid, text, text, uuid, jsonb, uuid)',
    'public.rpc_fleet_schedule_maintenance(uuid, text, text, date, date, uuid, text, numeric, text, uuid)',
    'public.rpc_fleet_complete_maintenance(uuid, integer, numeric, date)',
    'public.rpc_fleet_report_incident(uuid, text, timestamptz, text, text, numeric, date)',
    'public.rpc_fleet_identify_driver(uuid, uuid)',
    'public.rpc_fleet_resolve_incident(uuid)',
    'public.rpc_fleet_renew_compliance(uuid, text, date, numeric, uuid, text, uuid)',
    'public.rpc_fleet_set_van_minimum(uuid, uuid, integer)',
    'public.rpc_fleet_request_restock(uuid, uuid)',
    'public.rpc_fleet_fulfil_restock(uuid[])',
    'public.rpc_fleet_cancel_restock(uuid)',
    'public.rpc_fleet_link_order(uuid, uuid, uuid, date, uuid, integer, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

-- ============================================================================
-- A.10 Job diário (pg_cron, como ops-obras-avisos / ops-avisar-atrasos)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fleet-daily-alerts') THEN
    PERFORM cron.unschedule('fleet-daily-alerts');
  END IF;
  PERFORM cron.schedule('fleet-daily-alerts', '30 6 * * *', 'SELECT public.fn_fleet_daily_alerts()');
END $$;

COMMIT;

-- ============================================================================
-- FORA DESTA MIGRAÇÃO (decisões de 15/10/2026)
-- ============================================================================
-- • Documentos da Frota (antiga B.1): segunda migração
--   20261220110000_fleet_documents_entity_type.sql, escrita a partir do CHECK
--   ao vivo.
-- • B.2 (blindar o "stock baixo" em rpc_inventory_today / generate-notifications)
--   DESCARTADA. As RPCs da Frota nunca deixam reorder_point > 0 numa carrinha
--   (rpc_fleet_set_van_minimum e rpc_fleet_create_vehicle põem-no a 0) e o
--   Stocks.tsx vai esconder/bloquear o reorder_point nos armazéns is_vehicle
--   (tarefa de UI depois desta migração).
-- • B.3 (excluir is_vehicle em fn_contract/proposal_stock_deduction)
--   DESCARTADA: rpc_fleet_create_vehicle fixa default_warehouse_id.

-- ============================================================================
-- ROLLBACK (pela ordem certa) — ver também o plano
-- Se a 20261220110000 (documentos) já foi aplicada, desfazê-la PRIMEIRO.
-- Custos já lançados em ops_custo pela Frota ficam (são custos reais da
-- ordem); para os retirar: rpc_ops_remover_custo, um a um, antes do DROP.
-- ============================================================================
-- BEGIN;
-- SELECT cron.unschedule('fleet-daily-alerts') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fleet-daily-alerts');
-- DROP VIEW IF EXISTS public.fleet_v_vehicles;
-- DROP FUNCTION IF EXISTS public.rpc_fleet_link_order(uuid, uuid, uuid, date, uuid, integer, text);
-- DROP FUNCTION IF EXISTS public.rpc_fleet_post_travel_cost(uuid);
-- DROP FUNCTION IF EXISTS public.fn_fleet_cost_per_km(uuid, uuid, date, date);
-- DROP FUNCTION IF EXISTS public.rpc_fleet_cancel_restock(uuid);
-- DROP FUNCTION IF EXISTS public.rpc_fleet_fulfil_restock(uuid[]);
-- DROP FUNCTION IF EXISTS public.rpc_fleet_request_restock(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.rpc_fleet_set_van_minimum(uuid, uuid, integer);
-- DROP FUNCTION IF EXISTS public.rpc_fleet_renew_compliance(uuid, text, date, numeric, uuid, text, uuid);
-- DROP FUNCTION IF EXISTS public.rpc_fleet_resolve_incident(uuid);
-- DROP FUNCTION IF EXISTS public.rpc_fleet_identify_driver(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.rpc_fleet_report_incident(uuid, text, timestamptz, text, text, numeric, date);
-- DROP FUNCTION IF EXISTS public.rpc_fleet_complete_maintenance(uuid, integer, numeric, date);
-- DROP FUNCTION IF EXISTS public.rpc_fleet_schedule_maintenance(uuid, text, text, date, date, uuid, text, numeric, text, uuid);
-- DROP FUNCTION IF EXISTS public.rpc_fleet_import_statement(uuid, text, text, uuid, jsonb, uuid);
-- DROP FUNCTION IF EXISTS public.rpc_fleet_record_expense(uuid, text, date, numeric, uuid, text, uuid, text, uuid, text);
-- DROP FUNCTION IF EXISTS public.rpc_fleet_record_fuel(uuid, numeric, numeric, integer, uuid, text, date);
-- DROP FUNCTION IF EXISTS public.rpc_fleet_record_odometer(uuid, integer, date, boolean);
-- DROP FUNCTION IF EXISTS public.rpc_fleet_cancel_reservation(uuid);
-- DROP FUNCTION IF EXISTS public.rpc_fleet_return(uuid, integer, date, text);
-- DROP FUNCTION IF EXISTS public.rpc_fleet_assign(uuid, uuid, text, date, date, integer, text, uuid, uuid);
-- DROP FUNCTION IF EXISTS public.rpc_fleet_set_status(uuid, text, text);
-- DROP FUNCTION IF EXISTS public.rpc_fleet_update_vehicle(uuid, jsonb);
-- DROP FUNCTION IF EXISTS public.rpc_fleet_create_vehicle(uuid, jsonb);
-- DROP FUNCTION IF EXISTS public.rpc_fleet_upsert_driver(uuid, uuid, jsonb);
-- DROP FUNCTION IF EXISTS public.fn_fleet_daily_alerts();
-- DROP TABLE IF EXISTS public.fleet_activity_log, public.fleet_ops_links, public.fleet_restock_requests,
--   public.fleet_expenses, public.fleet_compliance, public.fleet_incidents CASCADE;  -- CASCADE larga a FK de maintenance_events
-- DROP TABLE IF EXISTS public.fleet_maintenance_events, public.fleet_expense_imports, public.fleet_odometer_readings,
--   public.fleet_assignments, public.fleet_maintenance_plans;
-- DROP FUNCTION IF EXISTS public.fn_fleet_vehicle_blockers(uuid, date, date, uuid, uuid);
-- DROP FUNCTION IF EXISTS public.fn_fleet_sync_schedule_item(uuid, uuid, text, date, date, public.schedule_item_status, uuid, jsonb);
-- DROP FUNCTION IF EXISTS public.fn_fleet_board(uuid);
-- DROP FUNCTION IF EXISTS public.fn_fleet_add_working_days(uuid, date, integer);
-- DROP FUNCTION IF EXISTS public.fn_fleet_next_inspection(text, date, date);
-- DROP FUNCTION IF EXISTS public.fn_fleet_licence_problem(uuid, text, date);
-- DROP FUNCTION IF EXISTS public.fn_fleet_log(uuid, uuid, text, text, text, text, uuid);
-- DROP FUNCTION IF EXISTS public.fn_fleet_assert(uuid, text[], uuid);
-- DROP FUNCTION IF EXISTS public.fn_fleet_is_my_vehicle(uuid);
-- DROP FUNCTION IF EXISTS public.fn_fleet_assignment_at(uuid, date);
-- DROP FUNCTION IF EXISTS public.fn_fleet_my_vehicle_ids();
-- DROP FUNCTION IF EXISTS public.fn_fleet_my_driver_ids();
-- DROP FUNCTION IF EXISTS public.fn_fleet_can(uuid, text);
-- DROP TABLE IF EXISTS public.fleet_vehicles, public.fleet_drivers;
-- ALTER TABLE public.anew_role_permissions DISABLE TRIGGER USER;
-- DELETE FROM public.anew_role_permissions WHERE permission_code LIKE 'fleet.%';
-- ALTER TABLE public.anew_role_permissions ENABLE TRIGGER USER;
-- DELETE FROM public.anew_permissions WHERE code LIKE 'fleet.%';
-- -- Dados criados fora das tabelas fleet_* (decidir se ficam):
-- --   schedule_items/schedule_item_assignees com metadata->>'source' = 'fleet';
-- --   schedule_boards board_type = 'fleet'; schedule_resources resource_type = 'vehicle';
-- --   warehouses is_vehicle = true (ficam armazéns normais com serves_customers = false);
-- --   organization_inventory_settings.default_warehouse_id fixado pela criação da carrinha;
-- --   stocks.reorder_point passado a minimum_quantity em armazéns convertidos em carrinha;
-- --   warehouses inativados por venda/abate da viatura;
-- --   ops_custo/ops_evento lançados por rpc_fleet_post_travel_cost (ver acima);
-- --   notifications type LIKE 'fleet_%'.
-- ALTER TABLE public.warehouses DROP CONSTRAINT IF EXISTS warehouses_vehicle_not_serving;
-- ALTER TABLE public.warehouses DROP COLUMN IF EXISTS is_vehicle;
-- COMMIT;
