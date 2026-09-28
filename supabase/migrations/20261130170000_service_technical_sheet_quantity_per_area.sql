-- Ficha técnica: "regra de três simples" para quantidade por área, em vez de
-- um multiplicador abstrato.
--
-- Substitui o desenho inicial desta mesma migration (ainda não aplicada à
-- BD — corrigida em vez de empilhada, tal como já fizemos noutras vezes
-- nesta sessão para migrations do próprio dia sem dados reais a proteger).
--
-- Pedido do utilizador: em vez de configurar um "multiplicador" (ex.: 0.35),
-- que obriga a fazer a conta de cabeça, o utilizador só preenche dois
-- números que já sabe da realidade: "Para X m² preciso de Y [unidades]".
-- O sistema guarda os dois valores tal como foram dados e, ao aplicar,
-- calcula pela regra de três simples: quantidade = (Y / X) × área_da_zona,
-- arredondado para cima. Quando X ou Y não estão preenchidos, mantém-se o
-- comportamento atual (quantidade fixa, sem cálculo automático).
--
-- Aplica-se em dois níveis, com o mesmo modelo mental em ambos:
--   1. Ao próprio serviço (technical_sheet_reference_area_m2 /
--      technical_sheet_reference_quantity em public.services) — quantidade
--      sugerida do serviço quando escolhido diretamente no diagnóstico.
--   2. A cada material da ficha técnica (reference_area_m2 /
--      reference_quantity em public.service_materials) — quantidade desse
--      material específico, que é o caso concreto pedido (ex.: "Saco de
--      Entulho": para 5 m² preciso de 35 unidades; para 7 m², 35/5×7=49).
--
-- Não tocado: quote_suggestion_rules, rpc_preview_diagnostic_suggestions,
-- rpc_update_service, rpc_create_service. O cálculo da regra de três em si
-- fica no frontend (QuoteDiagnosticPhase.tsx), tal como o cálculo de
-- ceil(...) já fazia para as regras de sugestão antigas — esta migration só
-- guarda os dois números de referência.
--
-- Confirmações feitas contra a BD viva (mesma connection string usada em
-- check_db.py) antes de escrever este ficheiro:
--   · public.services não tem ainda nenhuma coluna
--     technical_sheet_quantity_per_area nem technical_sheet_reference_*
--     — sem colisão (o desenho anterior desta migration nunca chegou a ser
--     aplicado).
--   · A única assinatura viva de rpc_update_service_technical_sheet é
--     (uuid, text, numeric, numeric) — a mesma confirmada na versão
--     anterior deste ficheiro, sem alterações entretanto.
--   · public.service_materials não tem ainda colunas reference_area_m2 /
--     reference_quantity — sem colisão.
--   · Grants vivos de rpc_update_service_technical_sheet: authenticated,
--     service_role, postgres — sem anon nem PUBLIC. Mantido o mesmo padrão
--     na nova assinatura.

-- ------------------------------------------------------------
-- 1. public.services — regra de três do próprio serviço (opcional)
-- ------------------------------------------------------------
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS technical_sheet_reference_area_m2 numeric(10,4),
  ADD COLUMN IF NOT EXISTS technical_sheet_reference_quantity numeric(10,4);

COMMENT ON COLUMN public.services.technical_sheet_reference_area_m2 IS
  'Ficha técnica do serviço: "Para X m²" da regra de três simples usada para calcular a quantidade sugerida do próprio serviço no diagnóstico Fase 1. Usar sempre junto com technical_sheet_reference_quantity ("preciso de Y"). Quantidade sugerida = ceil((technical_sheet_reference_quantity / technical_sheet_reference_area_m2) × area_m2 da zona). NULL (omissão de qualquer um dos dois) mantém a quantidade fixa em 1, sem cálculo automático. Editável via rpc_update_service_technical_sheet.';
COMMENT ON COLUMN public.services.technical_sheet_reference_quantity IS
  'Ficha técnica do serviço: "preciso de Y" da regra de três simples — ver technical_sheet_reference_area_m2 para a fórmula completa.';

-- ------------------------------------------------------------
-- 2. public.service_materials — regra de três por material (opcional)
-- ------------------------------------------------------------
ALTER TABLE public.service_materials
  ADD COLUMN IF NOT EXISTS reference_area_m2 numeric(10,4),
  ADD COLUMN IF NOT EXISTS reference_quantity numeric(10,4);

COMMENT ON COLUMN public.service_materials.reference_area_m2 IS
  'Regra de três simples para este material: "Para X m²" (ex.: 5). Usar sempre junto com reference_quantity ("preciso de Y", ex.: 35 sacos). Quantidade deste material ao aceitar o serviço no diagnóstico = ceil((reference_quantity / reference_area_m2) × area_m2 da zona) em vez da quantity fixa desta linha. NULL (omissão de qualquer um dos dois) mantém a quantity fixa da linha, tal como hoje.';
COMMENT ON COLUMN public.service_materials.reference_quantity IS
  'Regra de três simples para este material: "preciso de Y" — ver reference_area_m2 para a fórmula completa.';

-- ------------------------------------------------------------
-- 3. RPC rpc_update_service_technical_sheet — 4 parâmetros eliminados
--    (versão com p_quantity_per_area, nunca aplicada em produção),
--    recriada com o par de referência no lugar. Restante lógica de
--    validação (services.edit + âmbito de organização) e audit log
--    (fn_manual_audit_log) inalterada face à versão viva confirmada.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_update_service_technical_sheet(uuid, text, numeric, numeric);
DROP FUNCTION IF EXISTS public.rpc_update_service_technical_sheet(uuid, text, numeric, numeric, numeric);

CREATE OR REPLACE FUNCTION public.rpc_update_service_technical_sheet(
  p_service_id            uuid,
  p_labor_description     text,
  p_labor_people_count    numeric,
  p_labor_hours           numeric,
  p_reference_area_m2     numeric DEFAULT NULL,
  p_reference_quantity    numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_before public.services;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.services WHERE id = p_service_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serviço não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.is_deleted THEN
    RAISE EXCEPTION 'Serviço eliminado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_system_admin_user((SELECT auth.uid())) THEN
    -- services.organization_id é nullable (confirmado no baseline) — trata-se
    -- explicitamente como "fora do âmbito" em vez de confiar num
    -- NOT IN (...) com NULL, que avaliaria para UNKNOWN e nunca bloquearia.
    IF v_before.organization_id IS NULL
       OR v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT public.has_anew_permission((SELECT auth.uid()), 'services.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar a ficha técnica deste serviço' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  UPDATE public.services
  SET    technical_sheet_labor_description     = p_labor_description,
         technical_sheet_labor_people_count    = p_labor_people_count,
         technical_sheet_labor_hours           = p_labor_hours,
         technical_sheet_reference_area_m2     = p_reference_area_m2,
         technical_sheet_reference_quantity    = p_reference_quantity,
         updated_at = now()
  WHERE  id = p_service_id;

  PERFORM public.fn_manual_audit_log(
    'services', p_service_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'technical_sheet_labor_description',
        jsonb_build_object('old', to_jsonb(v_before.technical_sheet_labor_description), 'new', to_jsonb(p_labor_description)),
      'technical_sheet_labor_people_count',
        jsonb_build_object('old', to_jsonb(v_before.technical_sheet_labor_people_count), 'new', to_jsonb(p_labor_people_count)),
      'technical_sheet_labor_hours',
        jsonb_build_object('old', to_jsonb(v_before.technical_sheet_labor_hours), 'new', to_jsonb(p_labor_hours)),
      'technical_sheet_reference_area_m2',
        jsonb_build_object('old', to_jsonb(v_before.technical_sheet_reference_area_m2), 'new', to_jsonb(p_reference_area_m2)),
      'technical_sheet_reference_quantity',
        jsonb_build_object('old', to_jsonb(v_before.technical_sheet_reference_quantity), 'new', to_jsonb(p_reference_quantity))
    ),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_service_technical_sheet(uuid, text, numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_service_technical_sheet(uuid, text, numeric, numeric, numeric, numeric) TO authenticated;

-- ============================================================
-- Verification notes (para revisão humana, não executadas)
-- ============================================================
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'services'
--   AND column_name LIKE 'technical_sheet_reference%';
-- -- deve devolver 2 linhas, numeric(10,4), nullable
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'service_materials'
--   AND column_name LIKE 'reference%';
-- -- deve devolver 2 linhas, numeric(10,4), nullable
--
-- SELECT rpc_update_service_technical_sheet('<service_id>', 'Demolição de parede', 2, 4, 5, 35);
-- -- "Para 5 m² preciso de 35" (aplica-se ao próprio serviço, se fizer
-- -- sentido no caso concreto); para area_m2 = 7, quantidade sugerida do
-- -- serviço = ceil(35/5 × 7) = 49 (cálculo feito no frontend, ao aceitar).
--
-- UPDATE service_materials SET reference_area_m2 = 5, reference_quantity = 35
-- WHERE id = '<material_id>'; -- "Saco de Entulho": para 5 m², 35 unidades.
