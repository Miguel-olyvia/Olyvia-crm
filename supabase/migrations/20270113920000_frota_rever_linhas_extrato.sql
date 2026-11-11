-- 11/11/2026 — Correções da auditoria «campos sem permissão» (Área 5, Frota).
--  rpc_fleet_review_expense (nova; o ecrã DialogoRever.tsx já a chamava e não existia): resolve uma linha de extrato
--     marcada needs_review. Aceitar grava viatura, km e valor, tira o needs_review e, se os km passarem a última leitura,
--     atualiza o conta-quilómetros (como rpc_fleet_import_statement); rejeitar apaga a linha. Em ambos os casos acerta o
--     rows_flagged da importação. Exige fleet.costs (o mesmo da importação do extrato e do botão). Sem tabelas nem colunas novas.
-- Os documentos da viatura (tabela documents) NÃO mudam aqui: nesta base o CHECK documents_entity_type_check e o gatilho
-- documents_validate_entity recusam entity_type = 'vehicle' a toda a gente (ver o relatório da auditoria, Correções 11/11).
DO $g$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_fleet_review_expense') THEN
    RAISE EXCEPTION 'rpc_fleet_review_expense já existe; rever antes de aplicar';
  END IF;
END $g$;

-- Rever uma linha do extrato
CREATE FUNCTION public.rpc_fleet_review_expense(p_expense_id uuid, p_accept boolean, p_vehicle_id uuid, p_km integer, p_amount numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  e     public.fleet_expenses;
  v     public.fleet_vehicles;
  v_drv uuid;
BEGIN
  SELECT * INTO e FROM public.fleet_expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Linha do extrato desconhecida.' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.fn_fleet_assert(e.organization_id, ARRAY['fleet.costs']);
  IF NOT e.needs_review THEN
    RAISE EXCEPTION 'Esta linha já foi revista.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_accept IS NULL THEN RAISE EXCEPTION 'Indica se a linha é aceite ou rejeitada.' USING ERRCODE = 'check_violation'; END IF;

  IF NOT p_accept THEN
    DELETE FROM public.fleet_expenses WHERE id = e.id;
    PERFORM public.fn_fleet_log(e.organization_id, e.vehicle_id, 'Rever extrato', 'Linha do extrato rejeitada: saiu dos custos.',
      to_char(e.spent_on, 'DD/MM/YYYY') || ' · ' || e.amount || ' €', 'fleet_expense', e.id);
  ELSE
    SELECT * INTO v FROM public.fleet_vehicles
    WHERE id = COALESCE(p_vehicle_id, e.vehicle_id) AND organization_id = e.organization_id AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Viatura desconhecida.' USING ERRCODE = 'no_data_found'; END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
      RAISE EXCEPTION 'Indica o valor (maior do que 0).' USING ERRCODE = 'check_violation';
    END IF;
    IF p_km IS NOT NULL AND p_km < 0 THEN
      RAISE EXCEPTION 'Os km têm de ser um número igual ou maior do que 0.' USING ERRCODE = 'check_violation';
    END IF;

    -- noutra viatura, o condutor e o centro de custo são os dessa viatura nesse dia (como na importação)
    IF v.id <> e.vehicle_id THEN
      SELECT a.driver_id INTO v_drv FROM public.fleet_assignments a WHERE a.id = public.fn_fleet_assignment_at(v.id, e.spent_on);
      UPDATE public.fleet_expenses
         SET vehicle_id = v.id, driver_id = v_drv, cost_center_id = v.cost_center_id, cost_center_label = v.cost_center_label
       WHERE id = e.id;
    END IF;
    UPDATE public.fleet_expenses
       SET odometer_km = p_km, amount = p_amount, needs_review = false, review_reason = NULL
     WHERE id = e.id;

    IF p_km IS NOT NULL AND p_km > v.odometer_km THEN
      UPDATE public.fleet_vehicles SET odometer_km = p_km, odometer_read_on = e.spent_on WHERE id = v.id;
      INSERT INTO public.fleet_odometer_readings (organization_id, vehicle_id, read_on, km, source, source_id, recorded_by)
      VALUES (e.organization_id, v.id, e.spent_on, p_km, 'statement', e.id, public.current_business_user_id());
    END IF;

    PERFORM public.fn_fleet_log(e.organization_id, v.id, 'Rever extrato', 'Linha do extrato aceite.',
      to_char(e.spent_on, 'DD/MM/YYYY') || ' · ' || p_amount || ' €' || COALESCE(' · ' || p_km || ' km', ''), 'fleet_expense', e.id);
  END IF;

  IF e.import_id IS NOT NULL THEN
    UPDATE public.fleet_expense_imports SET rows_flagged = GREATEST(rows_flagged - 1, 0) WHERE id = e.import_id;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_fleet_review_expense(uuid, boolean, uuid, integer, numeric) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_fleet_review_expense(uuid, boolean, uuid, integer, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fleet_review_expense(uuid, boolean, uuid, integer, numeric) TO service_role;
