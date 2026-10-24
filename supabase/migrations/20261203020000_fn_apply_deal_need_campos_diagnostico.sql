-- fn_apply_deal_need() — persistir os 6 campos diag_* do diagnóstico da necessidade.
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Why this migration exists
-- --------------------------
-- 20261203010000 acrescentou deal_needs.diag_* mas nada os escrevia: toda a escrita de
-- necessidades passa por fn_apply_deal_need() (chamada por rpc_update_deal_needs e pelo
-- caminho de edição do Deals.tsx). Sem esta alteração o diagnóstico preenchido no
-- frontend era silenciosamente descartado.
--
-- Partiu-se da DEFINIÇÃO VIVA da função (pg_get_functiondef), não de migrações antigas.
-- Assinatura INALTERADA: (uuid, uuid, jsonb, jsonb, uuid, boolean, OUT uuid, OUT jsonb).
--
-- Única alteração face ao vivo:
--   · INSERT (necessidade nova): lê os 6 campos diag_* de p_need_data, no mesmo estilo
--     das restantes colunas ((p_need_data ->> 'x')::numeric / p_need_data ->> 'x').
--   · UPDATE (necessidade existente, p_update_need_columns = true): padrão
--     `CASE WHEN p_need_data ? 'diag_x' THEN ... ELSE diag_x END`, para um payload que
--     não traga a chave NÃO apagar um diagnóstico já feito. Mesmo tratamento para os
--     numeric — COALESCE não servia aqui: nunca permitiria limpar um valor, e um
--     payload sem a chave é indistinguível de um payload com null.
--
-- Tudo o resto fica letra por letra igual ao vivo. Em particular o
-- `DELETE FROM public.deal_need_items` (caminho de edição) mantém-se exatamente como
-- está — é o contrato delete+reinsert que o frontend espera.
--
-- Prerequisites:
--   20261203010000_diagnostico_deal_needs_campos_e_materiais.sql — colunas diag_*

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
      diag_proteger_descricao, diag_intervencao_tipo, diag_intervencao_descricao
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
      p_need_data ->> 'diag_intervencao_descricao'
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
