-- Diagnóstico da necessidade — medidas e características para o PLANEAMENTO da obra.
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Why this migration exists
-- --------------------------
-- O planeamento automático das Operações (operacao-app/db/obras.sql, secção 2c)
-- calcula o tempo de cada tarefa de um pacote ("Remodelação Completa - Casa de
-- Banho") pelas MEDIDAS da área de intervenção — m² de pavimento, m² de parede,
-- pontos de água — e aprende o ritmo real por CARACTERÍSTICAS (cortes fora, sem
-- janela, casa mobilada…). Os pacotes vendem-se com quantidade 1: sem isto, todas
-- as casas de banho levariam o mesmo tempo.
--
-- Uma necessidade do negócio = uma área de intervenção (DealNeedDiagnostic.tsx),
-- por isso as 15 colunas novas ficam em deal_needs, ao lado das diag_* de
-- 20261203010000. Campos FECHADOS (números com limites, escolhas por CHECK),
-- nada de texto livre — reunião de 02/10/2026: "poucos campos, fechados"; e
-- todos OPCIONAIS (o histórico continua válido; obrigatórios quando a equipa
-- decidir). As Operações leem-nos só por to_jsonb (tolerante a colunas que
-- faltem), nunca escrevem.
--
-- Não mexe na cópia congelada do orçamento (quote_diagnostic_snapshot): o
-- planeamento lê a necessidade ao vivo para estes campos — a visita técnica pode
-- afinar as medidas depois do contrato, e é isso que a obra deve usar.
--
-- fn_apply_deal_need: partiu-se da definição em 20261203020000 (a viva).
-- Assinatura INALTERADA. Única alteração: os 15 campos novos, no INSERT
-- (nullif → NULL) e no UPDATE com o padrão `CASE WHEN p_need_data ? 'x'` (um
-- ecrã que não conhece os campos não apaga o levantamento).
--
-- Prerequisites:
--   20261203010000_diagnostico_deal_needs_campos_e_materiais.sql — diag_* e deal_needs
--   20261203020000_fn_apply_deal_need_campos_diagnostico.sql — a definição de partida

SET lock_timeout = '5s';

ALTER TABLE public.deal_needs
  ADD COLUMN IF NOT EXISTS diag_tipo_area             text,
  ADD COLUMN IF NOT EXISTS diag_m2_pavimento          numeric(10,2),
  ADD COLUMN IF NOT EXISTS diag_perimetro_m           numeric(10,2),
  ADD COLUMN IF NOT EXISTS diag_pe_direito_m          numeric(10,2),
  ADD COLUMN IF NOT EXISTS diag_altura_revestimento   text,
  ADD COLUMN IF NOT EXISTS diag_pontos_agua           integer,
  ADD COLUMN IF NOT EXISTS diag_pontos_eletricos      integer,
  ADD COLUMN IF NOT EXISTS diag_janela                boolean,
  ADD COLUMN IF NOT EXISTS diag_local_cortes          text,
  ADD COLUMN IF NOT EXISTS diag_gas                   text,
  ADD COLUMN IF NOT EXISTS diag_toalheiro             boolean,
  ADD COLUMN IF NOT EXISTS diag_distancia_entrada     text,
  ADD COLUMN IF NOT EXISTS diag_mobilada              text,
  ADD COLUMN IF NOT EXISTS diag_portas_proteger       integer,
  ADD COLUMN IF NOT EXISTS diag_cliente_recusou_fotos boolean;

ALTER TABLE public.deal_needs
  DROP CONSTRAINT IF EXISTS deal_needs_diag_tipo_area_chk,
  DROP CONSTRAINT IF EXISTS deal_needs_diag_medidas_chk,
  DROP CONSTRAINT IF EXISTS deal_needs_diag_altura_revestimento_chk,
  DROP CONSTRAINT IF EXISTS deal_needs_diag_pontos_chk,
  DROP CONSTRAINT IF EXISTS deal_needs_diag_local_cortes_chk,
  DROP CONSTRAINT IF EXISTS deal_needs_diag_gas_chk,
  DROP CONSTRAINT IF EXISTS deal_needs_diag_distancia_entrada_chk,
  DROP CONSTRAINT IF EXISTS deal_needs_diag_mobilada_chk;

ALTER TABLE public.deal_needs
  ADD CONSTRAINT deal_needs_diag_tipo_area_chk
    CHECK (diag_tipo_area IS NULL OR diag_tipo_area IN ('casa_banho', 'cozinha', 'outro')),
  ADD CONSTRAINT deal_needs_diag_medidas_chk
    CHECK ((diag_m2_pavimento IS NULL OR diag_m2_pavimento BETWEEN 0.1 AND 10000)
       AND (diag_perimetro_m IS NULL OR diag_perimetro_m BETWEEN 0.1 AND 10000)
       AND (diag_pe_direito_m IS NULL OR diag_pe_direito_m BETWEEN 1.5 AND 10)),
  ADD CONSTRAINT deal_needs_diag_altura_revestimento_chk
    CHECK (diag_altura_revestimento IS NULL OR diag_altura_revestimento IN ('20cm', '60cm', '120cm', 'teto')),
  ADD CONSTRAINT deal_needs_diag_pontos_chk
    CHECK ((diag_pontos_agua IS NULL OR diag_pontos_agua BETWEEN 0 AND 50)
       AND (diag_pontos_eletricos IS NULL OR diag_pontos_eletricos BETWEEN 0 AND 200)
       AND (diag_portas_proteger IS NULL OR diag_portas_proteger BETWEEN 0 AND 50)),
  ADD CONSTRAINT deal_needs_diag_local_cortes_chk
    CHECK (diag_local_cortes IS NULL OR diag_local_cortes IN ('na_area', 'varanda', 'fora')),
  ADD CONSTRAINT deal_needs_diag_gas_chk
    CHECK (diag_gas IS NULL OR diag_gas IN ('sem', 'manter', 'anular', 'instalar')),
  ADD CONSTRAINT deal_needs_diag_distancia_entrada_chk
    CHECK (diag_distancia_entrada IS NULL OR diag_distancia_entrada IN ('curta', 'media', 'longa')),
  ADD CONSTRAINT deal_needs_diag_mobilada_chk
    CHECK (diag_mobilada IS NULL OR diag_mobilada IN ('pouco', 'medio', 'muito'));

COMMENT ON COLUMN public.deal_needs.diag_altura_revestimento IS
  'Até onde vai o revestimento de parede: 20cm/60cm/120cm/teto. Com diag_perimetro_m (e diag_pe_direito_m para "teto") dá os m² de parede que o planeamento das Operações usa.';
COMMENT ON COLUMN public.deal_needs.diag_local_cortes IS
  'Onde se cortam os azulejos: na_area/varanda/fora (garagem, rua). Fator do ritmo do assentamento no planeamento.';

CREATE OR REPLACE FUNCTION public.fn_apply_deal_need(p_deal_id uuid, p_need_id uuid, p_need_data jsonb, p_items jsonb, p_created_by uuid, p_update_need_columns boolean DEFAULT true, OUT o_need_id uuid, OUT o_diff jsonb)
 RETURNS record
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_need_id     uuid := p_need_id;
  v_item        jsonb;
  v_idx         integer := 0;
  v_items_arr   jsonb := COALESCE(p_items, '[]'::jsonb);
  v_need_diff   jsonb := '{}'::jsonb;
BEGIN
  IF v_need_id IS NULL THEN
    -- INSERT a new deal_needs row from the payload.
    INSERT INTO public.deal_needs (
      deal_id, title, description, priority, status, internal_notes,
      initial_estimate, estimate_min, estimate_max, template_id,
      custom_fields, measurement_values, checklist, created_by,
      category_id, category_name, technical_notes, measurements, sort_order,
      diag_area_m2, diag_demolir_descricao, diag_demolir_m2,
      diag_proteger_descricao, diag_intervencao_tipo, diag_intervencao_descricao,
      diag_tipo_area, diag_m2_pavimento, diag_perimetro_m, diag_pe_direito_m, diag_altura_revestimento, diag_pontos_agua, diag_pontos_eletricos, diag_janela, diag_local_cortes, diag_gas, diag_toalheiro, diag_distancia_entrada, diag_mobilada, diag_portas_proteger, diag_cliente_recusou_fotos
    )
    VALUES (
      p_deal_id,
      COALESCE(p_need_data ->> 'title', 'Itens do pedido'),
      p_need_data ->> 'description',
      COALESCE(p_need_data ->> 'priority', 'media'),
      COALESCE(p_need_data ->> 'status', 'pending'),
      p_need_data ->> 'internal_notes',
      COALESCE((p_need_data ->> 'initial_estimate')::numeric, 0),
      COALESCE((p_need_data ->> 'estimate_min')::numeric, 0),
      COALESCE((p_need_data ->> 'estimate_max')::numeric, 0),
      nullif(p_need_data ->> 'template_id', '')::uuid,
      COALESCE(p_need_data -> 'custom_fields', '[]'::jsonb),
      COALESCE(p_need_data -> 'measurement_values', '[]'::jsonb),
      COALESCE(p_need_data -> 'checklist', '[]'::jsonb),
      p_created_by,
      nullif(p_need_data ->> 'category_id', '')::uuid,
      p_need_data ->> 'category_name',
      p_need_data ->> 'technical_notes',
      COALESCE(p_need_data -> 'measurements', '{}'::jsonb),
      COALESCE((p_need_data ->> 'sort_order')::integer, 0),
      -- Diagnóstico (20261203010000): tudo nullable, sem default — uma necessidade
      -- criada sem visita técnica fica simplesmente sem diagnóstico.
      nullif(p_need_data ->> 'diag_area_m2', '')::numeric,
      p_need_data ->> 'diag_demolir_descricao',
      nullif(p_need_data ->> 'diag_demolir_m2', '')::numeric,
      p_need_data ->> 'diag_proteger_descricao',
      p_need_data ->> 'diag_intervencao_tipo',
      p_need_data ->> 'diag_intervencao_descricao',
      -- Planeamento da obra (20261208100000): tudo nullable; vazio = NULL.
      nullif(p_need_data ->> 'diag_tipo_area', ''),
      nullif(p_need_data ->> 'diag_m2_pavimento', '')::numeric,
      nullif(p_need_data ->> 'diag_perimetro_m', '')::numeric,
      nullif(p_need_data ->> 'diag_pe_direito_m', '')::numeric,
      nullif(p_need_data ->> 'diag_altura_revestimento', ''),
      nullif(p_need_data ->> 'diag_pontos_agua', '')::integer,
      nullif(p_need_data ->> 'diag_pontos_eletricos', '')::integer,
      nullif(p_need_data ->> 'diag_janela', '')::boolean,
      nullif(p_need_data ->> 'diag_local_cortes', ''),
      nullif(p_need_data ->> 'diag_gas', ''),
      nullif(p_need_data ->> 'diag_toalheiro', '')::boolean,
      nullif(p_need_data ->> 'diag_distancia_entrada', ''),
      nullif(p_need_data ->> 'diag_mobilada', ''),
      nullif(p_need_data ->> 'diag_portas_proteger', '')::integer,
      nullif(p_need_data ->> 'diag_cliente_recusou_fotos', '')::boolean
    )
    RETURNING id INTO v_need_id;

    v_need_diff := jsonb_build_object(
      'id',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_need_id)),
      'title', jsonb_build_object('old', NULL, 'new', to_jsonb(COALESCE(p_need_data ->> 'title', 'Itens do pedido')))
    );
  ELSE
    IF p_update_need_columns THEN
      -- UPDATE the existing need only with the columns present in p_need_data.
      -- rpc_update_deal_needs supplies the full editable column set here.
      UPDATE public.deal_needs
      SET title            = COALESCE(p_need_data ->> 'title', title),
          description      = CASE WHEN p_need_data ? 'description' THEN p_need_data ->> 'description' ELSE description END,
          priority         = COALESCE(p_need_data ->> 'priority', priority),
          status           = COALESCE(p_need_data ->> 'status', status),
          internal_notes   = CASE WHEN p_need_data ? 'internal_notes' THEN p_need_data ->> 'internal_notes' ELSE internal_notes END,
          initial_estimate = COALESCE((p_need_data ->> 'initial_estimate')::numeric, initial_estimate),
          estimate_min     = COALESCE((p_need_data ->> 'estimate_min')::numeric, estimate_min),
          estimate_max     = COALESCE((p_need_data ->> 'estimate_max')::numeric, estimate_max),
          template_id      = CASE WHEN p_need_data ? 'template_id' THEN nullif(p_need_data ->> 'template_id', '')::uuid ELSE template_id END,
          custom_fields    = COALESCE(p_need_data -> 'custom_fields', custom_fields),
          measurement_values = COALESCE(p_need_data -> 'measurement_values', measurement_values),
          checklist        = COALESCE(p_need_data -> 'checklist', checklist),
          category_id      = CASE WHEN p_need_data ? 'category_id' THEN nullif(p_need_data ->> 'category_id', '')::uuid ELSE category_id END,
          category_name    = CASE WHEN p_need_data ? 'category_name' THEN p_need_data ->> 'category_name' ELSE category_name END,
          technical_notes  = CASE WHEN p_need_data ? 'technical_notes' THEN p_need_data ->> 'technical_notes' ELSE technical_notes END,
          measurements     = COALESCE(p_need_data -> 'measurements', measurements),
          -- Diagnóstico (20261203010000): só se escreve o que vier no payload. Um
          -- ecrã que não conhece os campos diag_* não pode apagar o levantamento.
          diag_area_m2               = CASE WHEN p_need_data ? 'diag_area_m2' THEN nullif(p_need_data ->> 'diag_area_m2', '')::numeric ELSE diag_area_m2 END,
          diag_demolir_descricao     = CASE WHEN p_need_data ? 'diag_demolir_descricao' THEN p_need_data ->> 'diag_demolir_descricao' ELSE diag_demolir_descricao END,
          diag_demolir_m2            = CASE WHEN p_need_data ? 'diag_demolir_m2' THEN nullif(p_need_data ->> 'diag_demolir_m2', '')::numeric ELSE diag_demolir_m2 END,
          diag_proteger_descricao    = CASE WHEN p_need_data ? 'diag_proteger_descricao' THEN p_need_data ->> 'diag_proteger_descricao' ELSE diag_proteger_descricao END,
          diag_intervencao_tipo      = CASE WHEN p_need_data ? 'diag_intervencao_tipo' THEN p_need_data ->> 'diag_intervencao_tipo' ELSE diag_intervencao_tipo END,
          diag_intervencao_descricao = CASE WHEN p_need_data ? 'diag_intervencao_descricao' THEN p_need_data ->> 'diag_intervencao_descricao' ELSE diag_intervencao_descricao END,
          -- Planeamento da obra (20261208100000): o mesmo contrato — só o que vier no payload.
          diag_tipo_area             = CASE WHEN p_need_data ? 'diag_tipo_area' THEN nullif(p_need_data ->> 'diag_tipo_area', '') ELSE diag_tipo_area END,
          diag_m2_pavimento          = CASE WHEN p_need_data ? 'diag_m2_pavimento' THEN nullif(p_need_data ->> 'diag_m2_pavimento', '')::numeric ELSE diag_m2_pavimento END,
          diag_perimetro_m           = CASE WHEN p_need_data ? 'diag_perimetro_m' THEN nullif(p_need_data ->> 'diag_perimetro_m', '')::numeric ELSE diag_perimetro_m END,
          diag_pe_direito_m          = CASE WHEN p_need_data ? 'diag_pe_direito_m' THEN nullif(p_need_data ->> 'diag_pe_direito_m', '')::numeric ELSE diag_pe_direito_m END,
          diag_altura_revestimento   = CASE WHEN p_need_data ? 'diag_altura_revestimento' THEN nullif(p_need_data ->> 'diag_altura_revestimento', '') ELSE diag_altura_revestimento END,
          diag_pontos_agua           = CASE WHEN p_need_data ? 'diag_pontos_agua' THEN nullif(p_need_data ->> 'diag_pontos_agua', '')::integer ELSE diag_pontos_agua END,
          diag_pontos_eletricos      = CASE WHEN p_need_data ? 'diag_pontos_eletricos' THEN nullif(p_need_data ->> 'diag_pontos_eletricos', '')::integer ELSE diag_pontos_eletricos END,
          diag_janela                = CASE WHEN p_need_data ? 'diag_janela' THEN nullif(p_need_data ->> 'diag_janela', '')::boolean ELSE diag_janela END,
          diag_local_cortes          = CASE WHEN p_need_data ? 'diag_local_cortes' THEN nullif(p_need_data ->> 'diag_local_cortes', '') ELSE diag_local_cortes END,
          diag_gas                   = CASE WHEN p_need_data ? 'diag_gas' THEN nullif(p_need_data ->> 'diag_gas', '') ELSE diag_gas END,
          diag_toalheiro             = CASE WHEN p_need_data ? 'diag_toalheiro' THEN nullif(p_need_data ->> 'diag_toalheiro', '')::boolean ELSE diag_toalheiro END,
          diag_distancia_entrada     = CASE WHEN p_need_data ? 'diag_distancia_entrada' THEN nullif(p_need_data ->> 'diag_distancia_entrada', '') ELSE diag_distancia_entrada END,
          diag_mobilada              = CASE WHEN p_need_data ? 'diag_mobilada' THEN nullif(p_need_data ->> 'diag_mobilada', '') ELSE diag_mobilada END,
          diag_portas_proteger       = CASE WHEN p_need_data ? 'diag_portas_proteger' THEN nullif(p_need_data ->> 'diag_portas_proteger', '')::integer ELSE diag_portas_proteger END,
          diag_cliente_recusou_fotos = CASE WHEN p_need_data ? 'diag_cliente_recusou_fotos' THEN nullif(p_need_data ->> 'diag_cliente_recusou_fotos', '')::boolean ELSE diag_cliente_recusou_fotos END,
          updated_at       = now()
      WHERE id = v_need_id AND deal_id = p_deal_id;

      v_need_diff := jsonb_build_object(
        'id', jsonb_build_object('old', to_jsonb(v_need_id), 'new', to_jsonb(v_need_id))
      );
    ELSE
      -- Items-only path (Deals.tsx edit): leave deal_needs completely untouched.
      -- The FE never writes deal_needs when a need already exists — it only
      -- rewrites deal_need_items — so the need's independently-set title/status
      -- (e.g. from DealNeedsSection) is preserved verbatim.
      v_need_diff := jsonb_build_object(
        'id', jsonb_build_object('old', to_jsonb(v_need_id), 'new', to_jsonb(v_need_id))
      );
    END IF;

    -- Delete existing items (delete+reinsert, identical to the FE).
    DELETE FROM public.deal_need_items WHERE deal_need_id = v_need_id;
  END IF;

  -- (Re)insert the items in order, mirroring the FE's map(item, idx) shape.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_arr)
  LOOP
    INSERT INTO public.deal_need_items (
      deal_need_id, item_type, product_id, service_id,
      quantity, unit_price, notes, sort_order
    )
    VALUES (
      v_need_id,
      v_item ->> 'item_type',
      nullif(v_item ->> 'product_id', '')::uuid,
      nullif(v_item ->> 'service_id', '')::uuid,
      COALESCE((v_item ->> 'quantity')::numeric, 1),
      COALESCE((v_item ->> 'unit_price')::numeric, 0),
      v_item ->> 'notes',
      COALESCE((v_item ->> 'sort_order')::integer, v_idx)
    );
    v_idx := v_idx + 1;
  END LOOP;

  IF jsonb_array_length(v_items_arr) > 0 THEN
    v_need_diff := v_need_diff || jsonb_build_object('items_count',
      jsonb_build_object('old', NULL, 'new', to_jsonb(jsonb_array_length(v_items_arr))));
  END IF;

  o_need_id := v_need_id;
  o_diff    := jsonb_build_object('deal_needs', v_need_diff);
END;
$function$;

-- ============================================================
-- CONFERIR
-- ============================================================
DO $conferir$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'deal_needs'
     AND column_name IN ('diag_tipo_area', 'diag_m2_pavimento', 'diag_perimetro_m', 'diag_pe_direito_m', 'diag_altura_revestimento', 'diag_pontos_agua', 'diag_pontos_eletricos', 'diag_janela', 'diag_local_cortes', 'diag_gas', 'diag_toalheiro', 'diag_distancia_entrada', 'diag_mobilada', 'diag_portas_proteger', 'diag_cliente_recusou_fotos');
  IF n <> 15 THEN
    RAISE EXCEPTION 'CONFERIR: deal_needs tem % das 15 colunas de planeamento', n;
  END IF;
  IF position('diag_altura_revestimento' IN pg_get_functiondef('public.fn_apply_deal_need(uuid, uuid, jsonb, jsonb, uuid, boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'CONFERIR: fn_apply_deal_need não escreve os campos de planeamento';
  END IF;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname = 'fn_apply_deal_need';
  IF n <> 1 THEN
    RAISE EXCEPTION 'CONFERIR: há % versões de fn_apply_deal_need (esperada 1)', n;
  END IF;
END
$conferir$;
