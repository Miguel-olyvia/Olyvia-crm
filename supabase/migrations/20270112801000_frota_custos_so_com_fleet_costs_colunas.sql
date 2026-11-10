-- ============================================================
-- 20270112801000 — Frota: valores de custo só com fleet.costs (2/2: colunas de custo fechadas nas tabelas)
-- ============================================================
-- Pré-requisito: 20270112800000 aplicada E o ecrã da Frota que lê as vistas fleet_v_maintenance_events,
--   fleet_v_incidents, fleet_v_ops_links e fleet_v_compliance já publicado. Com o ecrã antigo (select("*") nas
--   tabelas) a Frota deixava de carregar: aplicar só depois.
--
-- O que faz: o authenticated deixa de poder ler as colunas de custo diretamente nas tabelas:
--     fleet_maintenance_events (estimated_cost, final_cost), fleet_incidents (amount), fleet_ops_links (cost_per_km,
--     travel_cost), fleet_compliance (amount), fleet_vehicles (monthly_rent).
--   REVOKE SELECT da tabela + GRANT SELECT só nas restantes colunas (as políticas RLS não mudam). Os valores chegam a
--   quem tem fleet.costs pelas vistas/funções de 20270112800000. As RPCs rpc_fleet_* (SECURITY DEFINER, correm como
--   dono) e o service_role não são afetados; o authenticated não tem INSERT/UPDATE/DELETE nestas tabelas (guarda).
--   Leituras do ecrã que continuam diretas às tabelas: fleet_vehicles (vin, notes) na edição e o embed
--   fleet_vehicles(plate) nos pedidos de reposição — só colunas que ficam concedidas.
--
-- Guarda (10/11/2026): as mesmas listas de colunas de 20270112800000; as 4 vistas novas existem; o authenticated só
--   tem SELECT (nenhum outro privilégio) nas 5 tabelas.
-- Reversão: GRANT SELECT ON <tabela> TO authenticated (as 5 tabelas).
-- ============================================================
SET lock_timeout = '5s';

DO $guarda$
DECLARE
  r record;
BEGIN
  IF to_regclass('public.fleet_v_maintenance_events') IS NULL OR to_regclass('public.fleet_v_incidents') IS NULL
     OR to_regclass('public.fleet_v_ops_links') IS NULL OR to_regclass('public.fleet_v_compliance') IS NULL
     OR to_regprocedure('public.fn_fleet_custos_viaturas()') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta aplicar 20270112800000 (vistas e funções dos custos da Frota).';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('fleet_maintenance_events', 'id,organization_id,vehicle_id,kind,title,scheduled_on,expected_end_on,status,supplier_id,supplier_label,estimated_cost,final_cost,done_on,km,notes,schedule_item_id,purchase_order_id,incident_id,created_by,created_at,updated_at'),
      ('fleet_incidents', 'id,organization_id,vehicle_id,kind,occurred_at,location,description,amount,notified_on,identify_by,driver_id,driver_notified_at,status,maintenance_event_id,assignment_id,insurer_claim_no,resolved_at,resolved_by,created_by,created_at,updated_at'),
      ('fleet_ops_links', 'id,organization_id,vehicle_id,ops_ordem_id,ops_obra_id,used_on,driver_id,km,cost_per_km,travel_cost,ops_custo_id,notes,created_by,created_at'),
      ('fleet_compliance', 'id,organization_id,vehicle_id,kind,valid_from,valid_until,is_exempt,provider_supplier_id,reference,amount,document_id,is_current,replaced_at,created_by,created_at'),
      ('fleet_vehicles', 'id,organization_id,plate,make,model,vehicle_type,vehicle_category,first_registration_on,fuel_type,ownership,lessor_supplier_id,monthly_rent,model_year,vin,odometer_km,odometer_read_on,status,status_reason,status_changed_at,required_licence,cost_center_id,cost_center_label,personal_use,is_pool,schedule_resource_id,warehouse_id,asset_id,notes,created_by,created_at,updated_at,deleted_at,deleted_by')
    ) AS t(tabela, colunas)
  LOOP
    IF (SELECT string_agg(a.attname, ',' ORDER BY a.attnum) FROM pg_attribute a
         WHERE a.attrelid = ('public.' || r.tabela)::regclass AND a.attnum > 0 AND NOT a.attisdropped) IS DISTINCT FROM r.colunas THEN
      RAISE EXCEPTION 'Guarda: as colunas de % mudaram desde 10/11/2026. Rever esta migration.', r.tabela;
    END IF;
    IF has_table_privilege('authenticated', 'public.' || r.tabela, 'INSERT,UPDATE,DELETE,TRUNCATE')
       OR has_table_privilege('anon', 'public.' || r.tabela, 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'Guarda: % tem privilégios de escrita para authenticated ou algum para anon. Rever esta migration.', r.tabela;
    END IF;
  END LOOP;
END $guarda$;

REVOKE SELECT ON public.fleet_maintenance_events FROM authenticated;
GRANT SELECT (id, organization_id, vehicle_id, kind, title, scheduled_on, expected_end_on, status, supplier_id, supplier_label,
  done_on, km, notes, schedule_item_id, purchase_order_id, incident_id, created_by, created_at, updated_at)
  ON public.fleet_maintenance_events TO authenticated;

REVOKE SELECT ON public.fleet_incidents FROM authenticated;
GRANT SELECT (id, organization_id, vehicle_id, kind, occurred_at, location, description, notified_on, identify_by, driver_id,
  driver_notified_at, status, maintenance_event_id, assignment_id, insurer_claim_no, resolved_at, resolved_by, created_by, created_at, updated_at)
  ON public.fleet_incidents TO authenticated;

REVOKE SELECT ON public.fleet_ops_links FROM authenticated;
GRANT SELECT (id, organization_id, vehicle_id, ops_ordem_id, ops_obra_id, used_on, driver_id, km, ops_custo_id, notes, created_by, created_at)
  ON public.fleet_ops_links TO authenticated;

REVOKE SELECT ON public.fleet_compliance FROM authenticated;
GRANT SELECT (id, organization_id, vehicle_id, kind, valid_from, valid_until, is_exempt, provider_supplier_id, reference,
  document_id, is_current, replaced_at, created_by, created_at)
  ON public.fleet_compliance TO authenticated;

REVOKE SELECT ON public.fleet_vehicles FROM authenticated;
GRANT SELECT (id, organization_id, plate, make, model, vehicle_type, vehicle_category, first_registration_on, fuel_type, ownership,
  lessor_supplier_id, model_year, vin, odometer_km, odometer_read_on, status, status_reason, status_changed_at, required_licence,
  cost_center_id, cost_center_label, personal_use, is_pool, schedule_resource_id, warehouse_id, asset_id, notes, created_by,
  created_at, updated_at, deleted_at, deleted_by)
  ON public.fleet_vehicles TO authenticated;

DO $verificar$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('fleet_maintenance_events', 'estimated_cost'), ('fleet_maintenance_events', 'final_cost'), ('fleet_incidents', 'amount'),
      ('fleet_ops_links', 'cost_per_km'), ('fleet_ops_links', 'travel_cost'), ('fleet_compliance', 'amount'), ('fleet_vehicles', 'monthly_rent')
    ) AS t(tabela, coluna)
  LOOP
    IF has_column_privilege('authenticated', 'public.' || r.tabela, r.coluna, 'SELECT') THEN
      RAISE EXCEPTION 'Verificação: authenticated continua a poder ler %.%.', r.tabela, r.coluna;
    END IF;
  END LOOP;
  IF NOT has_column_privilege('authenticated', 'public.fleet_vehicles', 'plate', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.fleet_incidents', 'description', 'SELECT') THEN
    RAISE EXCEPTION 'Verificação: faltam as colunas concedidas.';
  END IF;
END $verificar$;

NOTIFY pgrst, 'reload schema';
