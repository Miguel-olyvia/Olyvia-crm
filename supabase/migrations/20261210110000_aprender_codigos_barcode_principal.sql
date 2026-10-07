-- 20261210110000: aprender códigos — preencher o código de barras principal
--
-- Pedido (07/10/2026): ao associar um código de barras a um produto que não
-- tem products.barcode, gravar também esse código em products.barcode. A
-- linha em product_codes continua a ser criada como até aqui.
--
--   ~ rpc_product_code_learn (CREATE OR REPLACE, mesma assinatura, a partir do
--     pg_get_functiondef VIVO):
--       • kind = 'barcode', código da unidade do produto (sem embalagem) e
--         produto sem código principal → UPDATE products.barcode depois do
--         INSERT em product_codes. Códigos de embalagem, referências do
--         fornecedor, produto que já tem principal, 'already' e replay: sem
--         alteração.
--       • Num código de barras a linha do produto passa a ser trancada
--         (FOR NO KEY UPDATE) antes do advisory da chave — mesma ordem que a
--         edição do produto (linha → gatilho → advisory), sem deadlock.
--       • JSON: + main_barcode_set (true só se gravou products.barcode nesta
--         chamada). Nenhum campo existente muda.
--   ~ rpc_product_code_remove (CREATE OR REPLACE, a partir do VIVO):
--       • ao anular um código de barras cujo code_key é igual à chave de
--         products.barcode do produto → products.barcode = NULL.
--       • JSON: + main_barcode_cleared.
--   Gatilhos D5 (fn_products_barcode_guard / fn_product_codes_guard): sem
--   alteração — já excluem o próprio produto, por isso o mesmo código no
--   principal e na lista do MESMO produto é aceite; entre produtos diferentes
--   continua 23505.
--   Correção de dados: produtos ativos sem principal e com código de barras
--   ativo da unidade em product_codes → principal = o código mais antigo.
--   Auditoria: os UPDATE a products passam pelo fn_generic_entity_audit
--   (origem 'receiving' na receção; 'migration:20261210110000' na correção).
--   Owner, SECURITY DEFINER, search_path e GRANTs mantêm-se (repostos iguais).

CREATE OR REPLACE FUNCTION public.rpc_product_code_learn(p_id uuid, p_warehouse_id uuid, p_code text, p_kind text, p_product_id uuid, p_uom_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_set_product_uom boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_actor     uuid;
  v_org       uuid;
  v_code      text := btrim(COALESCE(p_code, ''));
  v_kind      text := lower(btrim(COALESCE(p_kind, '')));
  v_key       text;
  v_source    text;
  v_can_edit  boolean;
  v_can_wh    boolean;
  v_prod      record;
  v_uom       uuid;
  v_req_uom   uuid;
  v_factor    integer;
  v_un        uuid;
  v_conf      text;
  v_row       public.product_codes%ROWTYPE;
  v_other     record;
  v_already   text;
  v_existing  uuid;
  v_annulled  jsonb := '[]'::jsonb;
  v_warnings  jsonb := '[]'::jsonb;
  v_uom_set   boolean := false;
  v_prev_src  text;
  v_cn        text;
  v_txt       text;
  v_main_set  boolean := false;  -- products.barcode gravado nesta chamada
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Identificador da associação em falta' USING ERRCODE = 'check_violation';
  END IF;
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'Indica o produto' USING ERRCODE = 'check_violation';
  END IF;

  IF p_warehouse_id IS NOT NULL THEN
    SELECT organization_id INTO v_org FROM public.warehouses WHERE id = p_warehouse_id AND deleted_at IS NULL;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
    END IF;
    v_source := 'receiving';
  ELSE
    SELECT organization_id INTO v_org FROM public.products WHERE id = p_product_id;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'no_data_found';
    END IF;
    v_source := 'product_form';
  END IF;

  v_can_edit := public.has_anew_permission(v_uid, 'products.edit');
  v_can_wh   := public.has_anew_permission(v_uid, 'purchase_orders.receive')
            AND public.has_anew_permission(v_uid, 'inventory.edit');
  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(v_uid)) OR NOT (v_can_edit OR v_can_wh) THEN
    RAISE EXCEPTION 'Sem permissão para associar códigos a produtos desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Produto (trancado se a unidade do produto pode mudar ou, num código de
  -- barras, se o código principal pode ser preenchido — mesma ordem que a
  -- edição do produto: linha do produto antes do advisory da chave).
  IF COALESCE(p_set_product_uom, false) OR v_kind = 'barcode' THEN
    SELECT id, name, sku, barcode, uom_id, organization_id, deleted_at, is_deleted INTO v_prod
    FROM public.products WHERE id = p_product_id FOR NO KEY UPDATE;
  ELSE
    SELECT id, name, sku, barcode, uom_id, organization_id, deleted_at, is_deleted INTO v_prod
    FROM public.products WHERE id = p_product_id;
  END IF;
  IF v_prod.id IS NULL OR v_prod.organization_id IS DISTINCT FROM v_org
     OR v_prod.deleted_at IS NOT NULL OR v_prod.is_deleted THEN
    RAISE EXCEPTION 'Produto inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  -- Pedido já processado → devolve o gravado (tem de ser igual).
  SELECT * INTO v_row FROM public.product_codes WHERE id = p_id;
  IF FOUND THEN
    v_req_uom := CASE WHEN p_uom_id IS NOT DISTINCT FROM v_prod.uom_id THEN NULL ELSE p_uom_id END;
    IF v_row.organization_id IS DISTINCT FROM v_org OR v_row.created_by IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'Esta associação pertence a outro utilizador ou organização' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_row.product_id IS DISTINCT FROM p_product_id OR v_row.kind IS DISTINCT FROM v_kind
       OR v_row.code_key IS DISTINCT FROM public.fn_product_code_key(v_code)
       OR v_row.supplier_id IS DISTINCT FROM p_supplier_id OR v_row.uom_id IS DISTINCT FROM v_req_uom THEN
      RAISE EXCEPTION 'O identificador da associação já foi usado noutra associação (outro código, produto, unidade ou fornecedor)'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN public.fn_product_code_json(p_id)
      || jsonb_build_object('replayed', true, 'learned', v_row.deleted_at IS NULL, 'already', NULL,
                            'product_uom_set', COALESCE((v_row.context ->> 'product_uom_set')::boolean, false),
                            'annulled', COALESCE(v_row.context -> 'annulled', '[]'::jsonb), 'warnings', '[]'::jsonb,
                            'main_barcode_set', false);
  END IF;

  IF v_code = '' THEN
    RAISE EXCEPTION 'Indica o código lido' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_code) > 200 THEN
    RAISE EXCEPTION 'Código demasiado longo' USING ERRCODE = 'check_violation';
  END IF;
  IF v_kind NOT IN ('barcode', 'supplier_ref') THEN
    RAISE EXCEPTION 'Tipo de código inválido (barcode ou supplier_ref)' USING ERRCODE = 'check_violation';
  END IF;
  v_key := public.fn_product_code_key(v_code);

  IF v_kind = 'supplier_ref' AND p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Indica o fornecedor da referência' USING ERRCODE = 'check_violation';
  END IF;
  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers WHERE id = p_supplier_id AND organization_id = v_org AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Fornecedor inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  v_prev_src := current_setting('app.audit_source', true);
  IF v_source = 'receiving' THEN
    PERFORM set_config('app.audit_source', 'receiving', true);
  END IF;

  -- Produto sem unidade: definir 'un' (opcional, sem conflitos).
  IF v_prod.uom_id IS NULL AND COALESCE(p_set_product_uom, false) THEN
    IF NOT v_can_edit THEN
      RAISE EXCEPTION 'Definir a unidade do produto exige permissão para editar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT id INTO v_un FROM public.uom
    WHERE organization_id IS NULL AND base_uom_id IS NULL AND lower(btrim(code)) = 'un'
    ORDER BY id LIMIT 1;
    IF v_un IS NULL THEN
      RAISE EXCEPTION 'Unidade "un" não encontrada' USING ERRCODE = 'no_data_found';
    END IF;
    SELECT string_agg(format('%s %s', z.n, z.t), ', ' ORDER BY z.t) INTO v_conf
    FROM (
      SELECT 'linha(s) de encomenda a fornecedor' AS t, count(*) AS n FROM public.purchase_order_items WHERE product_id = p_product_id AND uom_id IS NOT NULL AND uom_id <> v_un
      UNION ALL SELECT 'linha(s) de orçamento', count(*) FROM public.quote_lines WHERE product_id = p_product_id AND uom_id IS NOT NULL AND uom_id <> v_un
      UNION ALL SELECT 'linha(s) de venda direta', count(*) FROM public.direct_sale_lines WHERE product_id = p_product_id AND uom_id IS NOT NULL AND uom_id <> v_un
      UNION ALL SELECT 'ligação(ões) a fornecedores', count(*) FROM public.item_suppliers WHERE product_id = p_product_id AND deleted_at IS NULL AND uom_id IS NOT NULL AND uom_id <> v_un
      UNION ALL SELECT 'material(is) de serviços', count(*) FROM public.service_materials WHERE product_id = p_product_id AND uom_id IS NOT NULL AND uom_id <> v_un
      UNION ALL SELECT 'linha(s) de guias', count(*) FROM public.supplier_delivery_note_lines WHERE product_id = p_product_id AND uom_id IS NOT NULL AND uom_id <> v_un
      UNION ALL SELECT 'código(s) aprendido(s)', count(*) FROM public.product_codes WHERE product_id = p_product_id AND deleted_at IS NULL AND uom_id IS NOT NULL AND uom_id <> v_un
    ) z
    WHERE z.n > 0;
    IF v_conf IS NOT NULL THEN
      RAISE EXCEPTION 'Não é possível definir a unidade "un" em «%»: já há % noutra unidade', v_prod.name, v_conf
        USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.products SET uom_id = v_un WHERE id = p_product_id;
    v_prod.uom_id := v_un;
    v_uom_set := true;
  END IF;

  -- Unidade do código: NULL = a do produto.
  v_uom := CASE WHEN p_uom_id IS NOT DISTINCT FROM v_prod.uom_id THEN NULL ELSE p_uom_id END;
  IF v_uom IS NOT NULL AND v_prod.uom_id IS NULL
     AND EXISTS (SELECT 1 FROM public.uom WHERE id = v_uom AND base_uom_id IS NULL) THEN
    RAISE EXCEPTION 'O produto «%» não tem unidade definida — associa o código sem unidade ou define a unidade do produto', v_prod.name
      USING ERRCODE = 'check_violation';
  END IF;
  v_factor := public.fn_uom_units_per(v_uom, p_product_id);  -- erro claro se incompatível

  -- Conflitos (com o lock da chave detido).
  IF v_kind = 'barcode' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('product_code:' || v_org::text || ':' || v_key, 0));

    IF public.fn_product_code_key(v_prod.barcode) = v_key THEN
      IF v_uom IS NOT NULL THEN
        RAISE EXCEPTION 'O código «%» já é o código de barras principal de «%» (na unidade do produto)', v_code, v_prod.name
          USING ERRCODE = 'unique_violation', DETAIL = p_product_id::text;
      END IF;
      v_already := 'product_barcode';
    END IF;

    SELECT p.id, p.name, p.sku INTO v_other
    FROM public.products p
    WHERE p.organization_id = v_org AND p.id <> p_product_id
      AND p.deleted_at IS NULL AND NOT p.is_deleted
      AND public.fn_product_code_key(p.barcode) = v_key
    ORDER BY p.id LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'O código «%» já é o código de barras do produto «%» (%)', v_code, v_other.name, v_other.sku
        USING ERRCODE = 'unique_violation', DETAIL = v_other.id::text;
    END IF;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended('product_code:' || v_org::text || ':' || p_supplier_id::text || ':' || v_key, 0));

    -- Referência na ficha do produto (item_suppliers) do mesmo fornecedor.
    FOR v_other IN
      SELECT i.product_id, p.name, p.sku,
             CASE WHEN i.uom_id IS NOT DISTINCT FROM p.uom_id THEN NULL ELSE i.uom_id END AS uom_id
      FROM public.item_suppliers i
      JOIN public.products p ON p.id = i.product_id
      WHERE i.organization_id = v_org AND i.supplier_id = p_supplier_id AND i.deleted_at IS NULL
        AND i.product_id IS NOT NULL AND p.deleted_at IS NULL AND NOT p.is_deleted
        AND public.fn_product_code_key(i.supplier_sku) = v_key
      ORDER BY (i.product_id = p_product_id) DESC, i.id
    LOOP
      IF v_other.product_id <> p_product_id THEN
        RAISE EXCEPTION 'A referência «%» deste fornecedor já está na ficha do produto «%» (%)', v_code, v_other.name, v_other.sku
          USING ERRCODE = 'unique_violation', DETAIL = v_other.product_id::text;
      ELSIF v_other.uom_id IS DISTINCT FROM v_uom THEN
        RAISE EXCEPTION 'A referência «%» deste fornecedor já está na ficha de «%» noutra unidade', v_code, v_prod.name
          USING ERRCODE = 'unique_violation', DETAIL = p_product_id::text;
      ELSE
        v_already := 'item_supplier';
      END IF;
    END LOOP;
  END IF;

  -- Códigos aprendidos ativos com a mesma chave (no máximo um: índices únicos).
  FOR v_other IN
    SELECT pc.id, pc.product_id, pc.uom_id, p.name, p.sku,
           (p.deleted_at IS NULL AND NOT p.is_deleted) AS active
    FROM public.product_codes pc
    JOIN public.products p ON p.id = pc.product_id
    WHERE pc.organization_id = v_org AND pc.kind = v_kind AND pc.deleted_at IS NULL AND pc.code_key = v_key
      AND (v_kind = 'barcode' OR pc.supplier_id = p_supplier_id)
    FOR UPDATE OF pc
  LOOP
    IF v_other.product_id = p_product_id THEN
      IF v_other.uom_id IS DISTINCT FROM v_uom THEN
        RAISE EXCEPTION 'O código «%» já está associado a «%» noutra unidade', v_code, v_prod.name
          USING ERRCODE = 'unique_violation', DETAIL = p_product_id::text;
      END IF;
      v_already := 'product_code';
      v_existing := v_other.id;
    ELSIF v_other.active THEN
      RAISE EXCEPTION 'O código «%» já está associado ao produto «%» (%)', v_code, v_other.name, v_other.sku
        USING ERRCODE = 'unique_violation', DETAIL = v_other.product_id::text;
    ELSE
      -- Produto apagado não bloqueia: o código antigo é anulado.
      UPDATE public.product_codes
      SET deleted_at = now(), deleted_by = v_actor,
          delete_reason = left(format('Produto «%s» apagado — código associado a «%s»', v_other.name, v_prod.name), 1000)
      WHERE id = v_other.id;
      v_annulled := v_annulled || to_jsonb(v_other.id);
    END IF;
  END LOOP;

  -- Avisos: o código também é o SKU de outro produto (a leitura passa a
  -- encontrar este primeiro — nível 1/2 antes do SKU).
  SELECT string_agg(DISTINCT format('«%s» (%s)', p.name, p.sku), ', ') INTO v_txt
  FROM public.products p
  WHERE p.organization_id = v_org AND p.id <> p_product_id AND p.deleted_at IS NULL AND NOT p.is_deleted
    AND lower(btrim(p.sku)) = lower(v_code);
  IF v_txt IS NOT NULL THEN
    v_warnings := v_warnings || to_jsonb(format('O código «%s» também é o SKU de %s — a leitura passa a encontrar «%s» primeiro', v_code, v_txt, v_prod.name));
  END IF;

  IF v_already IS NOT NULL THEN
    PERFORM set_config('app.audit_source', COALESCE(v_prev_src, ''), true);
    RETURN COALESCE(public.fn_product_code_json(v_existing),
                    jsonb_build_object('id', NULL, 'code', v_code, 'code_key', v_key, 'kind', v_kind,
                                       'product_id', p_product_id, 'product_name', v_prod.name, 'sku', v_prod.sku,
                                       'uom_id', COALESCE(v_uom, v_prod.uom_id),
                                       'uom_code', (SELECT code FROM public.uom WHERE id = COALESCE(v_uom, v_prod.uom_id)),
                                       'is_pack', v_uom IS NOT NULL, 'units_per_uom', v_factor,
                                       'supplier_id', p_supplier_id))
      || jsonb_build_object('replayed', false, 'learned', false, 'already', v_already,
                            'product_uom_set', v_uom_set, 'annulled', v_annulled, 'warnings', v_warnings,
                            'main_barcode_set', false);
  END IF;

  BEGIN
    INSERT INTO public.product_codes (
      id, organization_id, code, kind, product_id, uom_id, supplier_id, source, context, created_by
    ) VALUES (
      p_id, v_org, v_code, v_kind, p_product_id, v_uom, p_supplier_id, v_source,
      jsonb_strip_nulls(jsonb_build_object(
        'warehouse_id', p_warehouse_id,
        'product_uom_set', CASE WHEN v_uom_set THEN true END,
        'annulled', CASE WHEN jsonb_array_length(v_annulled) > 0 THEN v_annulled END)),
      v_actor
    )
    ON CONFLICT (id) DO NOTHING;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Associação em conflito — tenta de novo' USING ERRCODE = 'serialization_failure';
    END IF;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_cn = CONSTRAINT_NAME;
    IF COALESCE(v_cn, '') = '' THEN
      RAISE;  -- mensagem do gatilho (já com o nome do produto)
    END IF;
    RAISE EXCEPTION 'O código «%» acabou de ser associado a outro produto — lê de novo', v_code
      USING ERRCODE = 'unique_violation';
  END;

  -- Código de barras da unidade do produto num produto sem código principal:
  -- passa também a ser o products.barcode (a linha em product_codes fica).
  -- Códigos de embalagem (v_uom não nulo) nunca: o principal é o da unidade.
  -- Depois do INSERT, com o advisory da chave e a linha do produto detidos;
  -- auditado (fn_generic_entity_audit) com a mesma origem do código.
  IF v_kind = 'barcode' AND v_uom IS NULL AND public.fn_product_code_key(v_prod.barcode) IS NULL THEN
    UPDATE public.products SET barcode = v_code
    WHERE id = p_product_id AND public.fn_product_code_key(barcode) IS NULL;
    v_main_set := FOUND;
  END IF;

  PERFORM set_config('app.audit_source', COALESCE(v_prev_src, ''), true);

  RETURN public.fn_product_code_json(p_id)
    || jsonb_build_object('replayed', false, 'learned', true, 'already', NULL,
                          'product_uom_set', v_uom_set, 'annulled', v_annulled, 'warnings', v_warnings,
                          'main_barcode_set', v_main_set);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_product_code_learn(uuid, uuid, text, text, uuid, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_product_code_learn(uuid, uuid, text, text, uuid, uuid, uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_product_code_remove(p_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_actor    uuid;
  v_reason   text := btrim(COALESCE(p_reason, ''));
  v_row      public.product_codes%ROWTYPE;
  v_can_edit boolean;
  v_can_wh   boolean;
  v_already  boolean := false;
  v_scans    integer;
  v_main_cleared boolean := false;  -- products.barcode limpo nesta chamada
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_row FROM public.product_codes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Código não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_can_edit := public.has_anew_permission(v_uid, 'products.edit');
  v_can_wh   := public.has_anew_permission(v_uid, 'purchase_orders.receive')
            AND public.has_anew_permission(v_uid, 'inventory.edit');
  IF v_row.organization_id NOT IN (SELECT public.get_user_visible_org_ids(v_uid))
     OR NOT (v_can_edit
             OR (v_can_wh AND v_row.created_by = v_actor AND v_row.created_at > now() - interval '24 hours')) THEN
    RAISE EXCEPTION 'Só quem associou o código (nas primeiras 24 h) ou quem edita produtos o pode remover'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_reason = '' THEN
    RAISE EXCEPTION 'Indica o motivo' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'Motivo demasiado longo' USING ERRCODE = 'check_violation';
  END IF;

  IF v_row.deleted_at IS NOT NULL THEN
    v_already := true;
  ELSE
    UPDATE public.product_codes
    SET deleted_at = now(), deleted_by = v_actor, delete_reason = v_reason
    WHERE id = p_id;
    -- O código removido era também o código principal (mesma chave): limpa-o.
    IF v_row.kind = 'barcode' THEN
      UPDATE public.products SET barcode = NULL
      WHERE id = v_row.product_id AND public.fn_product_code_key(barcode) = v_row.code_key;
      v_main_cleared := FOUND;
    END IF;
  END IF;

  SELECT count(*) INTO v_scans
  FROM public.receiving_scans s
  WHERE s.organization_id = v_row.organization_id
    AND s.product_id = v_row.product_id
    AND s.created_at >= v_row.created_at
    AND public.fn_product_code_key(s.code) = v_row.code_key;

  RETURN public.fn_product_code_json(p_id)
    || jsonb_build_object('removed', NOT v_already, 'already_removed', v_already, 'scans_using_code', v_scans,
                          'main_barcode_cleared', v_main_cleared);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_product_code_remove(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_product_code_remove(uuid, text) TO authenticated, service_role;

-- Correção de dados: código de barras aprendido (unidade) → principal vazio.
SELECT set_config('app.audit_source', 'migration:20261210110000', true);

WITH c AS (
  SELECT DISTINCT ON (pc.product_id) pc.product_id, btrim(pc.code) AS code
  FROM public.product_codes pc
  JOIN public.products p ON p.id = pc.product_id
  WHERE pc.kind = 'barcode' AND pc.deleted_at IS NULL AND pc.uom_id IS NULL
    AND p.deleted_at IS NULL AND NOT p.is_deleted
    AND public.fn_product_code_key(p.barcode) IS NULL
  ORDER BY pc.product_id, pc.created_at, pc.id
)
UPDATE public.products p
SET barcode = c.code
FROM c
WHERE p.id = c.product_id AND public.fn_product_code_key(p.barcode) IS NULL;

SELECT set_config('app.audit_source', '', true);
