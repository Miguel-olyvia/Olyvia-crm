-- Duas alterações independentes, sem relação funcional entre si — agrupadas
-- num único ficheiro apenas por terem sido pedidas na mesma sessão de
-- trabalho.
--
-- ============================================================
-- PARTE 1 — Corrige o modelo de mão de obra da ficha técnica de serviços
-- ============================================================
-- A migration 20261130130000_service_technical_sheet_materials.sql (aplicada
-- HOJE, sem dados reais de produção a proteger) modelou mal a mão de obra:
--   · "quantidade" (technical_sheet_labor_quantity) representava, na prática,
--     Nº DE PESSOAS necessárias — nome enganador.
--   · Faltava o Nº DE HORAS. O serviço já tem preço/hora nos campos de preço
--     existentes; custo de mão de obra = preço/hora × pessoas × horas.
--   · technical_sheet_labor_uom_id apontava para public.uom (kg, litro,
--     caixa, ...) — unidade de medida de MATERIAIS, sem sentido nenhum para
--     mão de obra.
--
-- Como esta migration é de hoje e ainda não protege dados reais, corrige-se
-- de forma limpa (substituição), em vez de empilhar mais uma migration
-- aditiva por cima de um modelo errado:
--   · technical_sheet_labor_uom_id é eliminada.
--   · technical_sheet_labor_quantity é renomeada para
--     technical_sheet_labor_people_count (mesmo tipo numeric(10,2)).
--   · technical_sheet_labor_hours é criada (numeric(10,2)).
--   · rpc_update_service_technical_sheet(uuid, text, numeric, uuid) é
--     eliminada e recriada com a assinatura
--     (uuid, text, numeric, numeric) — mesma lógica de validação de
--     permissão (services.edit + âmbito de organização) e audit log
--     (fn_manual_audit_log) da versão anterior, só ajustada às novas
--     colunas/parâmetros.
--
-- rpc_update_service / rpc_create_service e qualquer outra função fora deste
-- âmbito não são tocadas.

-- ------------------------------------------------------------
-- 1.1 Elimina a coluna de UoM (não faz sentido para mão de obra)
-- ------------------------------------------------------------
ALTER TABLE public.services
  DROP COLUMN IF EXISTS technical_sheet_labor_uom_id;

-- ------------------------------------------------------------
-- 1.2 Renomeia quantidade → nº de pessoas (idempotente: só renomeia se a
--     coluna antiga ainda existir com o nome antigo; caso contrário garante
--     que a coluna final existe)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'services'
      AND column_name = 'technical_sheet_labor_quantity'
  ) THEN
    ALTER TABLE public.services
      RENAME COLUMN technical_sheet_labor_quantity TO technical_sheet_labor_people_count;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'services'
      AND column_name = 'technical_sheet_labor_people_count'
  ) THEN
    ALTER TABLE public.services
      ADD COLUMN technical_sheet_labor_people_count numeric(10,2);
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 1.3 Nova coluna: nº de horas
-- ------------------------------------------------------------
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS technical_sheet_labor_hours numeric(10,2);

COMMENT ON COLUMN public.services.technical_sheet_labor_description IS
  'Ficha técnica do serviço: descrição da mão de obra necessária. Editável via rpc_update_service_technical_sheet — nunca diretamente via UPDATE do frontend (permissão services.edit validada na RPC).';
COMMENT ON COLUMN public.services.technical_sheet_labor_people_count IS
  'Ficha técnica do serviço: número de pessoas necessárias para a mão de obra. Custo de mão de obra = preço/hora do serviço × technical_sheet_labor_people_count × technical_sheet_labor_hours. Editável via rpc_update_service_technical_sheet.';
COMMENT ON COLUMN public.services.technical_sheet_labor_hours IS
  'Ficha técnica do serviço: número de horas de mão de obra necessárias. Ver technical_sheet_labor_people_count para a fórmula de custo. Editável via rpc_update_service_technical_sheet.';

-- ------------------------------------------------------------
-- 1.4 RPC — assinatura antiga eliminada, nova recriada
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_update_service_technical_sheet(uuid, text, numeric, uuid);

CREATE OR REPLACE FUNCTION public.rpc_update_service_technical_sheet(
  p_service_id         uuid,
  p_labor_description  text,
  p_labor_people_count numeric,
  p_labor_hours        numeric
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
  SET    technical_sheet_labor_description  = p_labor_description,
         technical_sheet_labor_people_count = p_labor_people_count,
         technical_sheet_labor_hours        = p_labor_hours,
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
        jsonb_build_object('old', to_jsonb(v_before.technical_sheet_labor_hours), 'new', to_jsonb(p_labor_hours))
    ),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_service_technical_sheet(uuid, text, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_service_technical_sheet(uuid, text, numeric, numeric) TO authenticated;


-- ============================================================
-- PARTE 2 — Nova origem "manual" nas sugestões da Fase 1 diagnóstico
-- ============================================================
-- quote_diagnostic_area_suggestions (criada em
-- 20261119140000_fase1_diagnostico_orcamento_regras_e_ia_fallback.sql) só
-- admite source IN ('rule','ai'). Falta uma 3ª origem: 'manual', para quando
-- o utilizador escolhe diretamente um serviço sem passar por regra nem IA.
--
-- Nomes reais dos constraints confirmados por leitura direta da BD viva
-- (pg_get_constraintdef via information_schema/pg_constraint) — não
-- coincidem exatamente com os nomes assumidos no pedido original:
--   · quote_diagnostic_area_suggestions_source_check
--       → CHECK simples: source = ANY (ARRAY['rule','ai'])
--   · quote_diagnostic_area_suggestions_source_consistency_check
--       → CHECK composto (rule ⇒ rule_id preenchido + ai_rationale nulo;
--         ai ⇒ rule_id nulo + ai_rationale preenchido). Este é o constraint
--         que o pedido original designava (por engano) como
--         "quote_diagnostic_area_suggestions_source_check" — na migration de
--         origem tinha esse nome pedido explicitamente, mas o Postgres já
--         tinha atribuído esse nome ao CHECK simples da coluna (unnamed) e
--         renomeou este para "_source_consistency_check" na altura da
--         aplicação; confirmado também que não há nenhuma migration de
--         rename posterior no repositório, i.e. o nome vivo é mesmo este.
--   · quote_diagnostic_area_suggestions_source_field_check
--       → CHECK simples: source_field = ANY (ARRAY['area_m2','demolir',
--         'proteger','intervencao'])
--
-- 'servico_direto' passa a ser um valor válido de source_field, para o caso
-- de escolha direta de um serviço (não corresponde a nenhum dos 4 campos de
-- texto do diagnóstico).

ALTER TABLE public.quote_diagnostic_area_suggestions
  DROP CONSTRAINT IF EXISTS quote_diagnostic_area_suggestions_source_check;
ALTER TABLE public.quote_diagnostic_area_suggestions
  ADD CONSTRAINT quote_diagnostic_area_suggestions_source_check
  CHECK (source IN ('rule', 'ai', 'manual'));

ALTER TABLE public.quote_diagnostic_area_suggestions
  DROP CONSTRAINT IF EXISTS quote_diagnostic_area_suggestions_source_consistency_check;
ALTER TABLE public.quote_diagnostic_area_suggestions
  ADD CONSTRAINT quote_diagnostic_area_suggestions_source_consistency_check
  CHECK (
    (source = 'rule'   AND rule_id IS NOT NULL AND ai_rationale IS NULL)     OR
    (source = 'ai'     AND rule_id IS NULL     AND ai_rationale IS NOT NULL) OR
    (source = 'manual' AND rule_id IS NULL     AND ai_rationale IS NULL)
  );

ALTER TABLE public.quote_diagnostic_area_suggestions
  DROP CONSTRAINT IF EXISTS quote_diagnostic_area_suggestions_source_field_check;
ALTER TABLE public.quote_diagnostic_area_suggestions
  ADD CONSTRAINT quote_diagnostic_area_suggestions_source_field_check
  CHECK (source_field IN ('area_m2', 'demolir', 'proteger', 'intervencao', 'servico_direto'));

-- Mesma assinatura de sempre (13 parâmetros, mesma ordem) — só a validação
-- de p_source_field é alargada para incluir 'servico_direto'. Resto do corpo
-- inalterado (confirmado por diff contra pg_get_functiondef() da versão
-- viva antes de escrever esta migration).
CREATE OR REPLACE FUNCTION public.rpc_record_diagnostic_suggestion_accepted(
  p_diagnostic_area_id uuid,
  p_source              text,
  p_source_field        text,
  p_target_type         text,
  p_descricao           text,
  p_qty                 numeric,
  p_product_id          uuid DEFAULT NULL,
  p_service_id          uuid DEFAULT NULL,
  p_catalog_item_id     uuid DEFAULT NULL,
  p_unidade             text DEFAULT NULL,
  p_rule_id             uuid DEFAULT NULL,
  p_ai_rationale        text DEFAULT NULL,
  p_ai_confidence       numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_area public.quote_diagnostic_areas;
  v_id   uuid;
BEGIN
  IF p_source_field NOT IN ('area_m2', 'demolir', 'proteger', 'intervencao', 'servico_direto') THEN
    RAISE EXCEPTION 'Campo de origem inválido: %', p_source_field USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_area FROM public.quote_diagnostic_areas WHERE id = p_diagnostic_area_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Área de diagnóstico não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_area.organization_id IS NULL
     OR v_area.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Área fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.quote_diagnostic_area_suggestions (
    diagnostic_area_id, quote_line_id, source, rule_id, ai_rationale, ai_confidence,
    source_field, suggested_qty, was_edited_by_user,
    target_type, product_id, service_id, catalog_item_id, descricao, unidade
  )
  VALUES (
    p_diagnostic_area_id, NULL, p_source, p_rule_id, p_ai_rationale, p_ai_confidence,
    p_source_field, p_qty, false,
    p_target_type, p_product_id, p_service_id, p_catalog_item_id, p_descricao, p_unidade
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_record_diagnostic_suggestion_accepted(uuid, text, text, text, text, numeric, uuid, uuid, uuid, text, uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_record_diagnostic_suggestion_accepted(uuid, text, text, text, text, numeric, uuid, uuid, uuid, text, uuid, text, numeric) TO authenticated;

COMMENT ON FUNCTION public.rpc_record_diagnostic_suggestion_accepted(uuid, text, text, text, text, numeric, uuid, uuid, uuid, text, uuid, text, numeric) IS
  'Grava uma sugestão da Fase 1 (regra, IA ou escolha manual de serviço) aceite pelo utilizador — auto-suficiente, nunca cria nem depende de quote_lines. Chamada diretamente por QuoteDiagnosticPhase.tsx. source=''manual'' + source_field=''servico_direto'' cobre a escolha direta de um serviço, sem regra nem IA envolvidas.';


-- ============================================================
-- Verification notes (para revisão humana, não executadas)
-- ============================================================
--
-- Parte 1:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'services'
--     AND column_name LIKE 'technical_sheet_labor%';
--   -- deve devolver: technical_sheet_labor_description,
--   --                technical_sheet_labor_people_count,
--   --                technical_sheet_labor_hours
--   -- (sem technical_sheet_labor_quantity nem technical_sheet_labor_uom_id)
--
--   SELECT rpc_update_service_technical_sheet('<service_id>', 'Pintura', 2, 8);
--   -- 2 pessoas × 8 horas
--
-- Parte 2:
--   SELECT rpc_record_diagnostic_suggestion_accepted(
--     '<area_id>', 'manual', 'servico_direto', 'service', 'Pintura de parede',
--     1, NULL, '<service_id>', NULL, 'un', NULL, NULL, NULL
--   );
--   -- deve gravar com sucesso (source='manual', rule_id NULL, ai_rationale NULL)
--
--   INSERT INTO quote_diagnostic_area_suggestions
--     (diagnostic_area_id, source, source_field, suggested_qty)
--   VALUES ('<area_id>', 'manual', 'servico_direto', 1);
--   -- deve passar nos 3 CHECKs (source, source_consistency, source_field)
