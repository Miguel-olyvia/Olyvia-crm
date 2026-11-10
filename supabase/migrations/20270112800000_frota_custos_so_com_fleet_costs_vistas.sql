-- ============================================================
-- 20270112800000 — Frota: valores de custo só com fleet.costs (1/2: vistas mascaradas)
-- ============================================================
-- Problema: as políticas SELECT das tabelas da Frota deixam ler as linhas com fleet.view (ou fleet.self, ou
--   operations.view nas ligações) e o authenticated tem SELECT em todas as colunas. Quem só tem fleet.view (sem
--   fleet.costs) recebia da base os valores de custo, embora o ecrã mostre «—»:
--     fleet_maintenance_events.estimated_cost / final_cost, fleet_incidents.amount, fleet_ops_links.cost_per_km /
--     travel_cost, fleet_compliance.amount (prémio de seguro, IUC, IPO, renda do contrato) e fleet_vehicles.monthly_rent
--     (também exposto por fleet_v_vehicles).
--   fleet_expenses e fleet_expense_imports já exigem fleet.costs na política (o condutor vê as suas despesas) e não mudam.
--
-- Escolha: o RLS não mascara colunas; um REVOKE por coluna parte os select("*") do ecrã. Por isso, em duas migrações:
--   1/2 (esta, segura com o ecrã atual e com o novo):
--     · Funções SECURITY DEFINER fn_fleet_custos_* que devolvem (id, colunas de custo) SÓ das linhas cuja organização é
--       visível ao utilizador E onde ele tem fleet.costs (o mesmo critério da política de fleet_expenses).
--     · Vistas security_invoker fleet_v_maintenance_events, fleet_v_incidents, fleet_v_ops_links e fleet_v_compliance:
--       as mesmas colunas, pela mesma ordem e com os mesmos tipos das tabelas; as linhas vêm da tabela (o RLS do
--       utilizador decide quais) e os custos vêm por LEFT JOIN da função (NULL sem fleet.costs). O ecrã passa a ler estas
--       vistas em vez das tabelas (src/components/frota/dados/consultas.ts).
--     · fleet_v_vehicles (já security_invoker, lida pelo ecrã): monthly_rent passa a vir de fn_fleet_custos_viaturas()
--       (NULL sem fleet.costs). Mesmo nome, mesma ordem e tipo de colunas.
--     · rpc_fleet_link_order devolvia travel_cost a quem tem fleet.manage: passa a devolvê-lo só com fleet.costs
--       (substituição de UMA linha na definição viva, com guarda md5). O resto da função não muda.
--     · fn_fleet_cost_per_km (custo por km derivado das despesas) era executável por qualquer authenticated com a
--       organização visível, sem fleet.*: deixa de ser executável por authenticated/anon/PUBLIC. Nenhum ecrã nem edge
--       function a chama; só rpc_fleet_link_order (SECURITY DEFINER, corre como dono), que continua a funcionar.
--   2/2 (20270112801000, só DEPOIS do ecrã que lê as vistas estar publicado): REVOKE SELECT nas colunas de custo das
--     tabelas para authenticated (GRANT nas restantes). Fecha a leitura direta das tabelas.
--
-- Escritas: as tabelas fleet_* não têm INSERT/UPDATE/DELETE para authenticated; tudo passa pelas RPCs rpc_fleet_*,
--   todas SECURITY DEFINER (não são afetadas por estas vistas nem pelo REVOKE de 2/2).
-- O condutor (fleet.self) continua a ver as linhas que vê hoje (o RLS não muda); sem fleet.costs vê os custos a NULL
--   nestas tabelas (o ecrã já mostra «—»). As suas despesas (fleet_expenses) não mudam.
--
-- Guarda (10/11/2026): md5(pg_get_viewdef(fleet_v_vehicles)) = 99a6bc084cfe2c979d8b08a64a243106 (security_invoker=true);
--   md5(pg_get_functiondef(rpc_fleet_link_order)) = d8ec45264106aec6241dcee6233c691c;
--   md5(pg_get_functiondef(fn_fleet_cost_per_km)) = efcb68935c2b826ccae8ce24abb91097;
--   colunas exatas das 5 tabelas (as listas abaixo); RLS ligado nas 5.
-- Reversão: DROP das 4 vistas novas e das 5 funções fn_fleet_custos_*; fleet_v_vehicles com v.monthly_rent; a linha
--   RETURN de rpc_fleet_link_order com v_cost; GRANT EXECUTE ON fn_fleet_cost_per_km TO authenticated.
-- ============================================================
SET lock_timeout = '5s';

DO $guarda$
DECLARE
  v_opts text[];
  r record;
BEGIN
  SELECT c.reloptions INTO v_opts FROM pg_class c WHERE c.oid = 'public.fleet_v_vehicles'::regclass;
  IF NOT ('security_invoker=true' = ANY (coalesce(v_opts, '{}'::text[])))
     OR md5(pg_get_viewdef('public.fleet_v_vehicles'::regclass)) <> '99a6bc084cfe2c979d8b08a64a243106' THEN
    RAISE EXCEPTION 'Guarda: fleet_v_vehicles mudou ou deixou de ser security_invoker desde 10/11/2026. Rever esta migration.';
  END IF;

  IF md5(pg_get_functiondef('public.rpc_fleet_link_order(uuid,uuid,uuid,date,uuid,integer,text)'::regprocedure)) <> 'd8ec45264106aec6241dcee6233c691c' THEN
    RAISE EXCEPTION 'Guarda: rpc_fleet_link_order mudou desde 10/11/2026. Rever esta migration.';
  END IF;

  IF md5(pg_get_functiondef('public.fn_fleet_cost_per_km(uuid,uuid,date,date)'::regprocedure)) <> 'efcb68935c2b826ccae8ce24abb91097' THEN
    RAISE EXCEPTION 'Guarda: fn_fleet_cost_per_km mudou desde 10/11/2026. Rever esta migration.';
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
    IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = ('public.' || r.tabela)::regclass) THEN
      RAISE EXCEPTION 'Guarda: % não tem RLS ligado. Rever esta migration.', r.tabela;
    END IF;
  END LOOP;

  IF to_regclass('public.fleet_v_maintenance_events') IS NOT NULL OR to_regclass('public.fleet_v_incidents') IS NOT NULL
     OR to_regclass('public.fleet_v_ops_links') IS NOT NULL OR to_regclass('public.fleet_v_compliance') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: já existe uma das vistas fleet_v_* novas. Rever esta migration.';
  END IF;
END $guarda$;

-- ------------------------------------------------------------
-- Os custos que cada um pode ver: só organizações visíveis E com fleet.costs (critério da política de fleet_expenses).
-- ------------------------------------------------------------
CREATE FUNCTION public.fn_fleet_custos_manutencao()
RETURNS TABLE (id uuid, estimated_cost numeric, final_cost numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.id, m.estimated_cost, m.final_cost
  FROM public.fleet_maintenance_events m
  WHERE m.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND m.organization_id IN (SELECT public.get_user_permission_org_ids((SELECT auth.uid()), 'fleet.costs'))
$$;

CREATE FUNCTION public.fn_fleet_custos_ocorrencias()
RETURNS TABLE (id uuid, amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT i.id, i.amount
  FROM public.fleet_incidents i
  WHERE i.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND i.organization_id IN (SELECT public.get_user_permission_org_ids((SELECT auth.uid()), 'fleet.costs'))
$$;

CREATE FUNCTION public.fn_fleet_custos_ligacoes()
RETURNS TABLE (id uuid, cost_per_km numeric, travel_cost numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT l.id, l.cost_per_km, l.travel_cost
  FROM public.fleet_ops_links l
  WHERE l.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND l.organization_id IN (SELECT public.get_user_permission_org_ids((SELECT auth.uid()), 'fleet.costs'))
$$;

CREATE FUNCTION public.fn_fleet_custos_vencimentos()
RETURNS TABLE (id uuid, amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id, c.amount
  FROM public.fleet_compliance c
  WHERE c.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND c.organization_id IN (SELECT public.get_user_permission_org_ids((SELECT auth.uid()), 'fleet.costs'))
$$;

CREATE FUNCTION public.fn_fleet_custos_viaturas()
RETURNS TABLE (id uuid, monthly_rent numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT v.id, v.monthly_rent
  FROM public.fleet_vehicles v
  WHERE v.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    AND v.organization_id IN (SELECT public.get_user_permission_org_ids((SELECT auth.uid()), 'fleet.costs'))
$$;

REVOKE ALL ON FUNCTION public.fn_fleet_custos_manutencao(), public.fn_fleet_custos_ocorrencias(), public.fn_fleet_custos_ligacoes(),
  public.fn_fleet_custos_vencimentos(), public.fn_fleet_custos_viaturas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fleet_custos_manutencao(), public.fn_fleet_custos_ocorrencias(), public.fn_fleet_custos_ligacoes(),
  public.fn_fleet_custos_vencimentos(), public.fn_fleet_custos_viaturas() TO authenticated, service_role;

-- ------------------------------------------------------------
-- Vistas security_invoker: linhas pelo RLS de quem lê; custos só com fleet.costs.
-- ------------------------------------------------------------
CREATE VIEW public.fleet_v_maintenance_events WITH (security_invoker = true) AS
SELECT m.id, m.organization_id, m.vehicle_id, m.kind, m.title, m.scheduled_on, m.expected_end_on, m.status, m.supplier_id, m.supplier_label,
       c.estimated_cost::numeric(12,2) AS estimated_cost, c.final_cost::numeric(12,2) AS final_cost,
       m.done_on, m.km, m.notes, m.schedule_item_id, m.purchase_order_id, m.incident_id, m.created_by, m.created_at, m.updated_at
FROM public.fleet_maintenance_events m
LEFT JOIN public.fn_fleet_custos_manutencao() c ON c.id = m.id;

CREATE VIEW public.fleet_v_incidents WITH (security_invoker = true) AS
SELECT i.id, i.organization_id, i.vehicle_id, i.kind, i.occurred_at, i.location, i.description,
       c.amount::numeric(12,2) AS amount,
       i.notified_on, i.identify_by, i.driver_id, i.driver_notified_at, i.status, i.maintenance_event_id, i.assignment_id, i.insurer_claim_no,
       i.resolved_at, i.resolved_by, i.created_by, i.created_at, i.updated_at
FROM public.fleet_incidents i
LEFT JOIN public.fn_fleet_custos_ocorrencias() c ON c.id = i.id;

CREATE VIEW public.fleet_v_ops_links WITH (security_invoker = true) AS
SELECT l.id, l.organization_id, l.vehicle_id, l.ops_ordem_id, l.ops_obra_id, l.used_on, l.driver_id, l.km,
       c.cost_per_km::numeric(10,4) AS cost_per_km, c.travel_cost::numeric(12,2) AS travel_cost,
       l.ops_custo_id, l.notes, l.created_by, l.created_at
FROM public.fleet_ops_links l
LEFT JOIN public.fn_fleet_custos_ligacoes() c ON c.id = l.id;

CREATE VIEW public.fleet_v_compliance WITH (security_invoker = true) AS
SELECT k.id, k.organization_id, k.vehicle_id, k.kind, k.valid_from, k.valid_until, k.is_exempt, k.provider_supplier_id, k.reference,
       c.amount::numeric(12,2) AS amount,
       k.document_id, k.is_current, k.replaced_at, k.created_by, k.created_at
FROM public.fleet_compliance k
LEFT JOIN public.fn_fleet_custos_vencimentos() c ON c.id = k.id;

REVOKE ALL ON public.fleet_v_maintenance_events, public.fleet_v_incidents, public.fleet_v_ops_links, public.fleet_v_compliance FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fleet_v_maintenance_events, public.fleet_v_incidents, public.fleet_v_ops_links, public.fleet_v_compliance TO authenticated, service_role;

-- ------------------------------------------------------------
-- fleet_v_vehicles: igual à definição viva, só monthly_rent passa a vir da função (NULL sem fleet.costs).
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.fleet_v_vehicles WITH (security_invoker = true) AS
 SELECT v.id,
    v.organization_id,
    v.plate,
    v.make,
    v.model,
    v.vehicle_type,
    v.vehicle_category,
    v.first_registration_on,
    v.fuel_type,
    v.ownership,
    v.lessor_supplier_id,
    cr.monthly_rent::numeric(12,2) AS monthly_rent,
    v.model_year,
    v.odometer_km,
    v.odometer_read_on,
    v.status,
    v.status_reason,
    v.required_licence,
    v.cost_center_id,
    v.cost_center_label,
    v.personal_use,
    v.is_pool,
    v.schedule_resource_id,
    v.warehouse_id,
    v.asset_id,
    a.id AS current_assignment_id,
    a.kind AS current_assignment_kind,
    a.driver_id AS current_driver_id,
    d.full_name AS current_driver_name,
    ins.valid_until AS insurance_until,
    ins.reference AS insurance_policy_no,
    ins.provider_supplier_id AS insurer_supplier_id,
    ipo.valid_until AS inspection_until,
    iuc.valid_until AS road_tax_until,
    COALESCE(iuc.is_exempt, false) AS road_tax_exempt,
    lc.valid_until AS contract_ends_on,
    p.every_km AS service_every_km,
    p.every_months AS service_every_months,
    p.last_km AS service_last_km,
    p.last_done_on AS service_last_on,
    (p.last_km + p.every_km) AS service_next_km,
    ((p.last_done_on + make_interval(months => p.every_months)))::date AS service_next_on
   FROM ((((((((public.fleet_vehicles v
     LEFT JOIN public.fleet_assignments a ON ((a.id = public.fn_fleet_assignment_at(v.id, CURRENT_DATE))))
     LEFT JOIN public.fleet_drivers d ON ((d.id = a.driver_id)))
     LEFT JOIN public.fleet_compliance ins ON (((ins.vehicle_id = v.id) AND (ins.kind = 'insurance'::text) AND ins.is_current)))
     LEFT JOIN public.fleet_compliance ipo ON (((ipo.vehicle_id = v.id) AND (ipo.kind = 'inspection'::text) AND ipo.is_current)))
     LEFT JOIN public.fleet_compliance iuc ON (((iuc.vehicle_id = v.id) AND (iuc.kind = 'road_tax'::text) AND iuc.is_current)))
     LEFT JOIN public.fleet_compliance lc ON (((lc.vehicle_id = v.id) AND (lc.kind = 'lease_contract'::text) AND lc.is_current)))
     LEFT JOIN public.fleet_maintenance_plans p ON (((p.vehicle_id = v.id) AND (p.kind = 'service'::text) AND p.is_active)))
     LEFT JOIN public.fn_fleet_custos_viaturas() cr ON ((cr.id = v.id)))
  WHERE (v.deleted_at IS NULL);

-- ------------------------------------------------------------
-- rpc_fleet_link_order: travel_cost na resposta só com fleet.costs (uma linha da definição viva).
-- ------------------------------------------------------------
DO $ligar$
DECLARE
  v_def  text := pg_get_functiondef('public.rpc_fleet_link_order(uuid,uuid,uuid,date,uuid,integer,text)'::regprocedure);
  v_old  text := $t$RETURN jsonb_build_object('link_id', v_id, 'travel_cost', v_cost, 'ops_custo_id', v_cid, 'cost_not_posted_reason', v_why);$t$;
  v_new  text := $t$RETURN jsonb_build_object('link_id', v_id, 'travel_cost', CASE WHEN public.fn_fleet_can(v.organization_id, 'fleet.costs') THEN v_cost END, 'ops_custo_id', v_cid, 'cost_not_posted_reason', v_why);$t$;
BEGIN
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'Guarda: a linha RETURN de rpc_fleet_link_order não aparece exatamente uma vez. Rever esta migration.';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END $ligar$;

-- ------------------------------------------------------------
-- fn_fleet_cost_per_km: só para uso interno (RPCs SECURITY DEFINER).
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_fleet_cost_per_km(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;

DO $verificar$
BEGIN
  IF NOT (pg_get_functiondef('public.rpc_fleet_link_order(uuid,uuid,uuid,date,uuid,integer,text)'::regprocedure) LIKE '%fn_fleet_can(v.organization_id, ''fleet.costs'') THEN v_cost END%') THEN
    RAISE EXCEPTION 'Verificação: rpc_fleet_link_order não ficou com a máscara de travel_cost.';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_fleet_cost_per_km(uuid,uuid,date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Verificação: fn_fleet_cost_per_km continua executável por authenticated.';
  END IF;
  IF NOT ('security_invoker=true' = ANY (coalesce((SELECT c.reloptions FROM pg_class c WHERE c.oid = 'public.fleet_v_vehicles'::regclass), '{}'::text[]))) THEN
    RAISE EXCEPTION 'Verificação: fleet_v_vehicles deixou de ser security_invoker.';
  END IF;
END $verificar$;

NOTIFY pgrst, 'reload schema';
