-- Contrato de Fornecedor — Fase 5: o catálogo do fornecedor passa a ter Produto | Serviço
-- (subempreiteiros, ex. eletricista).
--
-- • supplier_catalog_items.item_kind  'produto' (por omissão, tudo o que já existe) | 'servico'
-- • Serviço: unit_label obrigatório e de uma lista fechada (h, dia, m², m³, ml, m, un, pt, km, vg),
--   service_districts = códigos de distrito (administrative_divisions PT nível 1, ≥ 1),
--   mobilization_days = prazo de mobilização (dias, 0–365). Sem código de barras, embalagem nem
--   categoria/SKU de produto (a normalização limpa-os).
-- • Produto: igual ao que era; os campos de serviço ficam sempre a NULL.
-- • Ligação: um serviço do fornecedor liga-se a um serviço nosso (services, os do orçamento) por
--   rpc_catalog_link_service → item_suppliers item_type='service' / service_id (estrutura que já
--   existia). rpc_catalog_link e cat_ligar_produto_artigo recusam artigos do tipo serviço.
-- • Preço único (base_price) com exceção por empresa (item_suppliers.purchase_price) e pedidos de
--   alteração de preço: o gatilho de pedidos já trabalha sobre item_suppliers por catalog_item_id,
--   por isso serve igual aos serviços (sem custo de produto: fn_price_change_cost_plan → not_product).
--
-- Todas as funções alteradas partem do pg_get_functiondef() vivo na BD RH (02/11/2026).

-- ═══ 1. Estrutura ═══════════════════════════════════════════════════════════

ALTER TABLE public.supplier_catalog_items
  ADD COLUMN IF NOT EXISTS item_kind text NOT NULL DEFAULT 'produto',
  ADD COLUMN IF NOT EXISTS service_districts text[],
  ADD COLUMN IF NOT EXISTS mobilization_days integer;

ALTER TABLE public.supplier_catalog_items
  ADD CONSTRAINT supplier_catalog_items_kind_chk CHECK (item_kind IN ('produto', 'servico')),
  ADD CONSTRAINT supplier_catalog_items_mob_chk CHECK (mobilization_days IS NULL OR (mobilization_days >= 0 AND mobilization_days <= 365)),
  ADD CONSTRAINT supplier_catalog_items_produto_chk CHECK (item_kind <> 'produto' OR (service_districts IS NULL AND mobilization_days IS NULL)),
  ADD CONSTRAINT supplier_catalog_items_servico_chk CHECK (
    item_kind <> 'servico'
    OR (unit_label IN ('h', 'dia', 'm²', 'm³', 'ml', 'm', 'un', 'pt', 'km', 'vg')
        AND COALESCE(cardinality(service_districts), 0) >= 1));

COMMENT ON COLUMN public.supplier_catalog_items.item_kind IS 'produto | servico (Fase 5 do contrato de fornecedor)';
COMMENT ON COLUMN public.supplier_catalog_items.service_districts IS 'Serviço: zona de atuação, códigos de distrito (administrative_divisions PT nível 1)';
COMMENT ON COLUMN public.supplier_catalog_items.mobilization_days IS 'Serviço: prazo de mobilização em dias';

CREATE INDEX IF NOT EXISTS idx_supplier_catalog_items_kind ON public.supplier_catalog_items (supplier_account_id, item_kind);

-- ═══ 2. Auxiliares ══════════════════════════════════════════════════════════

-- Unidade de serviço canónica (NULL = não é uma unidade de serviço).
CREATE OR REPLACE FUNCTION public.fn_sp_service_unit(p_unit text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN v IN ('h', 'hora', 'horas', 'hr', 'hrs') THEN 'h'
    WHEN v IN ('dia', 'dias', 'd') THEN 'dia'
    WHEN v IN ('m²', 'm2', 'metro quadrado', 'metros quadrados') THEN 'm²'
    WHEN v IN ('m³', 'm3', 'metro cúbico', 'metro cubico', 'metros cúbicos', 'metros cubicos') THEN 'm³'
    WHEN v IN ('ml', 'metro linear', 'metros lineares') THEN 'ml'
    WHEN v IN ('m', 'metro', 'metros') THEN 'm'
    WHEN v IN ('un', 'unidade', 'unidades', 'und', 'uni') THEN 'un'
    WHEN v IN ('pt', 'ponto', 'pontos') THEN 'pt'
    WHEN v IN ('km', 'quilómetro', 'quilometro', 'quilómetros', 'quilometros') THEN 'km'
    WHEN v IN ('vg', 'valor global', 'empreitada', 'global', 'empreitada (valor global)') THEN 'vg'
  END
  FROM (SELECT lower(btrim(regexp_replace(COALESCE(p_unit, ''), '\s+', ' ', 'g'))) AS v) x
$function$;

-- jsonb (lista) → text[]; NULL quando não é lista ou está vazia.
CREATE OR REPLACE FUNCTION public.fn_sp_jsonb_textarr(p jsonb)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN jsonb_typeof(p) = 'array' AND jsonb_array_length(p) > 0
              THEN ARRAY(SELECT jsonb_array_elements_text(p)) END
$function$;

-- Distritos: aceita uma lista ou um texto "Lisboa; Setúbal" / "PT-11,PT-15"; devolve os códigos
-- (ordenados, sem repetidos) e o que não se reconheceu.
CREATE OR REPLACE FUNCTION public.fn_sp_catalog_distritos(p_val jsonb, OUT codes text[], OUT unknown text[])
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  toks text[];
  tok  text;
  c    text;
BEGIN
  codes := ARRAY[]::text[];
  unknown := ARRAY[]::text[];
  IF p_val IS NULL OR jsonb_typeof(p_val) = 'null' THEN
    codes := NULL;
    RETURN;
  END IF;
  IF jsonb_typeof(p_val) = 'array' THEN
    toks := ARRAY(SELECT jsonb_array_elements_text(p_val));
  ELSE
    toks := regexp_split_to_array(p_val #>> '{}', '\s*[,;|\n]\s*');
  END IF;
  IF cardinality(toks) > 50 THEN
    unknown := ARRAY['Demasiados distritos'];
    codes := NULL;
    RETURN;
  END IF;
  FOREACH tok IN ARRAY COALESCE(toks, ARRAY[]::text[]) LOOP
    tok := NULLIF(btrim(regexp_replace(COALESCE(tok, ''), '[\x01-\x1F\x7F]', '', 'g')), '');
    CONTINUE WHEN tok IS NULL;
    SELECT d.code INTO c
    FROM public.administrative_divisions d
    WHERE d.country_code = 'PT' AND d.admin_level = 1 AND d.is_active AND d.code IS NOT NULL
      AND (upper(d.code) = upper(tok)
           OR lower(extensions.unaccent('extensions.unaccent'::regdictionary, d.name))
              = lower(extensions.unaccent('extensions.unaccent'::regdictionary, tok)))
    ORDER BY d.code
    LIMIT 1;
    IF c IS NULL THEN
      unknown := unknown || left(tok, 40);
    ELSE
      codes := codes || c::text;
    END IF;
  END LOOP;
  codes := ARRAY(SELECT DISTINCT x FROM unnest(codes) x ORDER BY x);
  IF cardinality(codes) = 0 THEN
    codes := NULL;
  END IF;
END;
$function$;

-- Validação com o estado final do artigo (a linha recebida sobre o que está gravado).
CREATE OR REPLACE FUNCTION public.fn_sp_catalog_kind_errors(p_kind text, p_unit text, p_districts jsonb)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  e text[] := ARRAY[]::text[];
BEGIN
  IF COALESCE(p_kind, 'produto') <> 'servico' THEN
    RETURN e;
  END IF;
  IF NULLIF(btrim(COALESCE(p_unit, '')), '') IS NULL THEN
    e := e || 'Unidade obrigatória num serviço (hora, dia, m², ponto, empreitada…)'::text;
  ELSIF public.fn_sp_service_unit(p_unit) IS NULL THEN
    e := e || format('A unidade «%s» não serve para um serviço (use hora, dia, m², m³, metro linear, metro, unidade, ponto, km ou empreitada)', left(p_unit, 30));
  END IF;
  IF p_districts IS NULL OR jsonb_typeof(p_districts) <> 'array' OR jsonb_array_length(p_districts) = 0 THEN
    e := e || 'Zona de atuação obrigatória num serviço: indique pelo menos 1 distrito'::text;
  END IF;
  RETURN e;
END;
$function$;

-- Normalização em qualquer escrita (antes do gatilho do SKU, pela ordem alfabética).
CREATE OR REPLACE FUNCTION public.fn_sp_catalog_kind_normalize()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_bad text;
BEGIN
  IF NEW.item_kind = 'servico' THEN
    NEW.unit_label := COALESCE(public.fn_sp_service_unit(NEW.unit_label), NEW.unit_label);
    NEW.barcode := NULL;
    NEW.units_per_pack := NULL;
    NEW.categoria_id := NULL;
    NEW.subcategoria_id := NULL;
    NEW.medida := NULL;
    NEW.cor := NULL;
    NEW.sku := NULL;
    NEW.service_districts := NULLIF(ARRAY(SELECT DISTINCT x FROM unnest(NEW.service_districts) x
                                           WHERE x IS NOT NULL ORDER BY x), ARRAY[]::text[]);
    SELECT x INTO v_bad FROM unnest(NEW.service_districts) x
    WHERE NOT EXISTS (SELECT 1 FROM public.administrative_divisions d
                      WHERE d.code = x AND d.country_code = 'PT' AND d.admin_level = 1)
    LIMIT 1;
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'Distrito desconhecido: «%»', v_bad USING ERRCODE = 'check_violation', HINT = 'validation';
    END IF;
  ELSE
    NEW.service_districts := NULL;
    NEW.mobilization_days := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sp_catalog_00_kind ON public.supplier_catalog_items;
CREATE TRIGGER trg_sp_catalog_00_kind BEFORE INSERT OR UPDATE ON public.supplier_catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_sp_catalog_kind_normalize();

-- ═══ 3. Limpeza / diferença / JSON do artigo ═══════════════════════════════

-- Vivo + item_kind, service_districts, mobilization_days. Passa a STABLE (lê os distritos).
CREATE OR REPLACE FUNCTION public.fn_sp_catalog_clean(p_row jsonb, OUT data jsonb, OUT errors text[])
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k     text;
  raw   text;
  v     text;
  n     numeric;
  ctrl  text := '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]';
  lim   integer;
  labels jsonb := '{"supplier_ref":"Referência","name":"Nome","description":"Descrição","brand":"Marca","unit_label":"Unidade","barcode":"Código de barras","currency":"Moeda","base_price":"Preço","units_per_pack":"Unidades por embalagem","moq":"Quantidade mínima","lead_time_days":"Prazo de entrega (dias)","is_active":"Ativo","item_kind":"Tipo","service_districts":"Zona de atuação","mobilization_days":"Prazo de mobilização (dias)"}';
  d_codes text[];
  d_bad   text[];
BEGIN
  data := '{}'::jsonb;
  errors := ARRAY[]::text[];

  IF p_row IS NULL OR jsonb_typeof(p_row) <> 'object' THEN
    errors := errors || 'Linha inválida'::text;
    RETURN;
  END IF;

  -- Texto
  FOR k, lim IN SELECT * FROM (VALUES ('supplier_ref', 100), ('name', 300), ('description', 2000),
                                      ('brand', 100), ('unit_label', 30)) t(k, lim) LOOP
    IF p_row ? k THEN
      raw := CASE WHEN jsonb_typeof(p_row -> k) = 'null' THEN NULL ELSE p_row ->> k END;
      v := NULLIF(btrim(regexp_replace(COALESCE(raw, ''), ctrl, '', 'g')), '');
      IF v IS NOT NULL AND char_length(v) > lim THEN
        errors := errors || format('%s demasiado longo (máx. %s caracteres)', labels ->> k, lim);
      ELSIF v IS NULL AND k IN ('supplier_ref', 'name') THEN
        errors := errors || format('%s obrigatório', labels ->> k);
      ELSE
        data := data || jsonb_build_object(k, v);
      END IF;
    END IF;
  END LOOP;
  IF NOT (p_row ? 'supplier_ref') THEN
    errors := errors || 'Referência obrigatória'::text;
  END IF;

  -- Código de barras: 8 a 14 dígitos
  IF p_row ? 'barcode' THEN
    raw := CASE WHEN jsonb_typeof(p_row -> 'barcode') = 'null' THEN NULL ELSE p_row ->> 'barcode' END;
    v := NULLIF(regexp_replace(COALESCE(raw, ''), '[\s' || chr(160) || ']', '', 'g'), '');
    IF v IS NOT NULL AND v !~ '^[0-9]{8,14}$' THEN
      errors := errors || 'Código de barras inválido (8 a 14 dígitos)'::text;
    ELSE
      data := data || jsonb_build_object('barcode', v);
    END IF;
  END IF;

  -- Moeda
  IF p_row ? 'currency' THEN
    v := upper(NULLIF(btrim(COALESCE(p_row ->> 'currency', '')), ''));
    IF v IS NULL THEN
      data := data || jsonb_build_object('currency', 'EUR');
    ELSIF v !~ '^[A-Z]{3}$' THEN
      errors := errors || 'Moeda inválida (código de 3 letras, ex.: EUR)'::text;
    ELSE
      data := data || jsonb_build_object('currency', v);
    END IF;
  END IF;

  -- Números
  FOR k IN SELECT unnest(ARRAY['base_price', 'units_per_pack', 'moq', 'lead_time_days', 'mobilization_days']) LOOP
    IF p_row ? k THEN
      raw := CASE WHEN jsonb_typeof(p_row -> k) = 'null' THEN NULL ELSE btrim(p_row ->> k) END;
      IF raw IS NULL OR raw = '' THEN
        data := data || jsonb_build_object(k, NULL);
        CONTINUE;
      END IF;
      n := public.fn_catalog_parse_number(raw);
      IF n IS NULL THEN
        errors := errors || format('%s inválido: «%s»', labels ->> k, left(raw, 40));
      ELSIF k = 'base_price' AND (n < 0 OR n > 1000000000) THEN
        errors := errors || 'Preço fora do intervalo (0 a 1 000 000 000)'::text;
      ELSIF k IN ('units_per_pack', 'moq') AND (n <= 0 OR n > 1000000000) THEN
        errors := errors || format('%s tem de ser maior que zero', labels ->> k);
      ELSIF k = 'lead_time_days' AND (n < 0 OR n > 3650 OR n <> trunc(n)) THEN
        errors := errors || 'Prazo de entrega inválido (dias inteiros, 0 a 3650)'::text;
      ELSIF k = 'mobilization_days' AND (n < 0 OR n > 365 OR n <> trunc(n)) THEN
        errors := errors || 'Prazo de mobilização inválido (dias inteiros, 0 a 365)'::text;
      ELSE
        data := data || jsonb_build_object(k, CASE WHEN k IN ('lead_time_days', 'mobilization_days') THEN to_jsonb(n::integer)
                                                  ELSE to_jsonb(trim_scale(round(n, 4))) END);
      END IF;
    END IF;
  END LOOP;

  -- Ativo
  IF p_row ? 'is_active' THEN
    v := lower(btrim(COALESCE(p_row ->> 'is_active', '')));
    IF v IN ('', 'true', 'sim', 's', 'yes', 'y', '1', 'ativo', 'activo', 'x') THEN
      data := data || jsonb_build_object('is_active', true);
    ELSIF v IN ('false', 'não', 'nao', 'n', 'no', '0', 'inativo', 'inactivo') THEN
      data := data || jsonb_build_object('is_active', false);
    ELSE
      errors := errors || format('Ativo inválido: «%s» (use sim/não)', left(v, 20));
    END IF;
  END IF;

  -- 20270103600000: Tipo (produto | serviço)
  IF p_row ? 'item_kind' THEN
    v := lower(btrim(COALESCE(p_row ->> 'item_kind', '')));
    IF v IN ('', 'produto', 'product', 'artigo', 'material') THEN
      data := data || jsonb_build_object('item_kind', 'produto');
    ELSIF v IN ('servico', 'serviço', 'service', 'subempreitada', 'mão de obra', 'mao de obra') THEN
      data := data || jsonb_build_object('item_kind', 'servico');
    ELSE
      errors := errors || format('Tipo inválido: «%s» (use produto ou serviço)', left(v, 20));
    END IF;
  END IF;

  -- 20270103600000: Zona de atuação (distritos)
  IF p_row ? 'service_districts' THEN
    SELECT x.codes, x.unknown INTO d_codes, d_bad FROM public.fn_sp_catalog_distritos(p_row -> 'service_districts') x;
    IF cardinality(d_bad) > 0 THEN
      errors := errors || format('Distrito desconhecido: %s', array_to_string(ARRAY(SELECT '«' || b || '»' FROM unnest(d_bad[1:3]) b), ', '));
    ELSE
      data := data || jsonb_build_object('service_districts', to_jsonb(d_codes));
    END IF;
  END IF;
END;
$function$;

-- Vivo + as chaves novas.
CREATE OR REPLACE FUNCTION public.fn_sp_catalog_diff(p_item supplier_catalog_items, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  cur jsonb := to_jsonb(p_item);
  out jsonb := '{}'::jsonb;
  k   text;
BEGIN
  FOR k IN SELECT jsonb_object_keys(p_data) LOOP
    IF k IN ('base_price', 'units_per_pack', 'moq', 'lead_time_days', 'mobilization_days') THEN
      IF (cur ->> k)::numeric IS DISTINCT FROM (p_data ->> k)::numeric THEN
        out := out || jsonb_build_object(k, jsonb_build_object('old', cur -> k, 'new', p_data -> k));
      END IF;
    ELSIF k = 'is_active' THEN
      IF (cur ->> k)::boolean IS DISTINCT FROM (p_data ->> k)::boolean THEN
        out := out || jsonb_build_object(k, jsonb_build_object('old', cur -> k, 'new', p_data -> k));
      END IF;
    ELSIF k IN ('supplier_ref', 'name', 'description', 'brand', 'unit_label', 'barcode', 'currency', 'item_kind') THEN
      IF (cur ->> k) IS DISTINCT FROM (p_data ->> k) THEN
        out := out || jsonb_build_object(k, jsonb_build_object('old', cur -> k, 'new', p_data -> k));
      END IF;
    ELSIF k = 'service_districts' THEN
      IF COALESCE(cur -> k, 'null'::jsonb) IS DISTINCT FROM COALESCE(p_data -> k, 'null'::jsonb) THEN
        out := out || jsonb_build_object(k, jsonb_build_object('old', cur -> k, 'new', p_data -> k));
      END IF;
    END IF;
  END LOOP;
  RETURN out;
END;
$function$;

-- Vivo + item_kind, service_districts, mobilization_days.
CREATE OR REPLACE FUNCTION public.fn_sp_catalog_item_json(p_item supplier_catalog_items, p_with_price boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'id', p_item.id,
    'supplier_ref', p_item.supplier_ref,
    'barcode', p_item.barcode,
    'name', p_item.name,
    'description', p_item.description,
    'brand', p_item.brand,
    'unit_label', p_item.unit_label,
    'units_per_pack', p_item.units_per_pack,
    'base_price', CASE WHEN p_with_price THEN p_item.base_price END,
    'currency', p_item.currency,
    'moq', p_item.moq,
    'lead_time_days', p_item.lead_time_days,
    'is_active', p_item.is_active,
    'updated_at', p_item.updated_at,
    -- 20270101310000: a classificação e o SKU gerado
    'categoria_id', p_item.categoria_id,
    'subcategoria_id', p_item.subcategoria_id,
    'medida', p_item.medida,
    'cor', p_item.cor,
    'sku', p_item.sku,
    -- 20270103600000: produto | serviço
    'item_kind', p_item.item_kind,
    'service_districts', to_jsonb(p_item.service_districts),
    'mobilization_days', p_item.mobilization_days
  )
$function$;

-- ═══ 4. Portal: gravar / importar / listar / classificar ═══════════════════

-- Vivo + tipo e campos de serviço (validados com o estado final do artigo).
CREATE OR REPLACE FUNCTION public.sp_catalog_upsert_item(p_item jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u      public.supplier_portal_users := public.fn_sp_actor();
  v_id   uuid;
  v_errs text[];
  cur    public.supplier_catalog_items;
  v_key  text;
  v_data jsonb;
  v_row  jsonb;
  v_kind text;
  v_unit text;
  v_dist jsonb;
BEGIN
  IF u.role <> 'owner' THEN
    RAISE EXCEPTION 'Só o utilizador principal da conta pode alterar o catálogo'
      USING ERRCODE = 'insufficient_privilege', HINT = 'not_owner';
  END IF;
  IF p_item IS NULL OR jsonb_typeof(p_item) <> 'object' THEN
    RAISE EXCEPTION 'Artigo inválido' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  IF NULLIF(p_item ->> 'id', '') IS NOT NULL THEN
    BEGIN
      v_id := (p_item ->> 'id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Artigo não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
    END;
    SELECT * INTO cur FROM public.supplier_catalog_items
    WHERE id = v_id AND supplier_account_id = u.supplier_account_id FOR UPDATE;
    IF cur.id IS NULL THEN
      RAISE EXCEPTION 'Artigo não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
    END IF;
    -- Na edição a referência é opcional: sem ela fica a atual.
    v_row := p_item - 'id';
    IF NOT (v_row ? 'supplier_ref') THEN
      v_row := v_row || jsonb_build_object('supplier_ref', cur.supplier_ref);
    END IF;
  ELSE
    v_row := p_item - 'id';
  END IF;

  SELECT x.data, x.errors INTO v_data, v_errs FROM public.fn_sp_catalog_clean(v_row) x;
  IF cur.id IS NULL AND NOT (v_data ? 'name') AND NOT ('Nome obrigatório' = ANY (v_errs)) THEN
    v_errs := v_errs || 'Nome obrigatório'::text;
  END IF;

  -- 20270103600000: produto | serviço, com o estado final (o recebido sobre o gravado).
  v_kind := COALESCE(v_data ->> 'item_kind', cur.item_kind, 'produto');
  v_unit := CASE WHEN v_data ? 'unit_label' THEN v_data ->> 'unit_label' ELSE cur.unit_label END;
  v_dist := CASE WHEN v_data ? 'service_districts' THEN v_data -> 'service_districts' ELSE to_jsonb(cur.service_districts) END;
  v_errs := v_errs || public.fn_sp_catalog_kind_errors(v_kind, v_unit, v_dist);
  IF v_kind = 'servico' THEN
    v_data := v_data - 'barcode' - 'units_per_pack';
    IF public.fn_sp_service_unit(v_unit) IS NOT NULL THEN
      v_data := v_data || jsonb_build_object('unit_label', public.fn_sp_service_unit(v_unit));
    END IF;
  ELSE
    v_data := v_data - 'service_districts' - 'mobilization_days';
  END IF;

  IF cardinality(v_errs) > 0 THEN
    RAISE EXCEPTION '%', array_to_string(v_errs, '; ')
      USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('sp_catalog:' || u.supplier_account_id::text, 0));
  v_key := public.fn_product_code_key(v_data ->> 'supplier_ref');
  IF EXISTS (SELECT 1 FROM public.supplier_catalog_items
             WHERE supplier_account_id = u.supplier_account_id AND ref_key = v_key
               AND id IS DISTINCT FROM cur.id) THEN
    RAISE EXCEPTION 'Já existe um artigo com a referência «%»', v_data ->> 'supplier_ref'
      USING ERRCODE = 'unique_violation', HINT = 'conflict';
  END IF;

  IF cur.id IS NULL THEN
    INSERT INTO public.supplier_catalog_items (
      supplier_account_id, supplier_ref, barcode, name, description, brand, unit_label,
      units_per_pack, base_price, currency, moq, lead_time_days, is_active,
      created_by_portal_user, updated_by_portal_user,
      item_kind, service_districts, mobilization_days
    ) VALUES (
      u.supplier_account_id, v_data ->> 'supplier_ref', v_data ->> 'barcode', v_data ->> 'name',
      v_data ->> 'description', v_data ->> 'brand', v_data ->> 'unit_label',
      (v_data ->> 'units_per_pack')::numeric, (v_data ->> 'base_price')::numeric,
      COALESCE(v_data ->> 'currency', 'EUR'), (v_data ->> 'moq')::numeric,
      (v_data ->> 'lead_time_days')::integer, COALESCE((v_data ->> 'is_active')::boolean, true), u.id, u.id,
      v_kind, public.fn_sp_jsonb_textarr(v_data -> 'service_districts'), (v_data ->> 'mobilization_days')::integer
    ) RETURNING * INTO cur;
    RETURN jsonb_build_object('created', true, 'item', public.fn_sp_catalog_item_json(cur, true));
  END IF;

  UPDATE public.supplier_catalog_items ci SET
    supplier_ref   = v_data ->> 'supplier_ref',
    barcode        = CASE WHEN v_data ? 'barcode'        THEN v_data ->> 'barcode' ELSE ci.barcode END,
    name           = CASE WHEN v_data ? 'name'           THEN v_data ->> 'name' ELSE ci.name END,
    description    = CASE WHEN v_data ? 'description'    THEN v_data ->> 'description' ELSE ci.description END,
    brand          = CASE WHEN v_data ? 'brand'          THEN v_data ->> 'brand' ELSE ci.brand END,
    unit_label     = CASE WHEN v_data ? 'unit_label'     THEN v_data ->> 'unit_label' ELSE ci.unit_label END,
    units_per_pack = CASE WHEN v_data ? 'units_per_pack' THEN (v_data ->> 'units_per_pack')::numeric ELSE ci.units_per_pack END,
    base_price     = CASE WHEN v_data ? 'base_price'     THEN (v_data ->> 'base_price')::numeric ELSE ci.base_price END,
    currency       = CASE WHEN v_data ? 'currency'       THEN v_data ->> 'currency' ELSE ci.currency END,
    moq            = CASE WHEN v_data ? 'moq'            THEN (v_data ->> 'moq')::numeric ELSE ci.moq END,
    lead_time_days = CASE WHEN v_data ? 'lead_time_days' THEN (v_data ->> 'lead_time_days')::integer ELSE ci.lead_time_days END,
    is_active      = CASE WHEN v_data ? 'is_active'      THEN (v_data ->> 'is_active')::boolean ELSE ci.is_active END,
    item_kind         = v_kind,
    service_districts = CASE WHEN v_data ? 'service_districts' THEN public.fn_sp_jsonb_textarr(v_data -> 'service_districts') ELSE ci.service_districts END,
    mobilization_days = CASE WHEN v_data ? 'mobilization_days' THEN (v_data ->> 'mobilization_days')::integer ELSE ci.mobilization_days END,
    updated_at = now(),
    updated_by_portal_user = u.id
  WHERE ci.id = cur.id
  RETURNING ci.* INTO cur;

  RETURN jsonb_build_object('created', false, 'item', public.fn_sp_catalog_item_json(cur, true));
END;
$function$;

-- Vivo + tipo e campos de serviço.
CREATE OR REPLACE FUNCTION public.sp_catalog_import(p_rows jsonb, p_dry_run boolean DEFAULT true, p_file_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u         public.supplier_portal_users := public.fn_sp_actor();
  v_n       integer;
  v_dry     boolean := COALESCE(p_dry_run, true);
  v_file    text := NULLIF(left(btrim(regexp_replace(COALESCE(p_file_name, ''), '[\x01-\x1F\x7F]', '', 'g')), 255), '');
  v_new     integer;
  v_chg     integer;
  v_same    integer;
  v_err     integer;
  v_rows    jsonb;
  v_summary jsonb;
  v_import  uuid;
BEGIN
  IF u.role <> 'owner' THEN
    RAISE EXCEPTION 'Só o utilizador principal da conta pode alterar o catálogo'
      USING ERRCODE = 'insufficient_privilege', HINT = 'not_owner';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Envie as linhas como uma lista' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  v_n := jsonb_array_length(p_rows);
  IF v_n = 0 THEN
    RAISE EXCEPTION 'O ficheiro não tem linhas' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF v_n > 5000 THEN
    RAISE EXCEPTION 'Demasiadas linhas (%); o máximo é 5000 por importação', v_n
      USING ERRCODE = 'check_violation', HINT = 'too_many_rows';
  END IF;

  -- Uma importação de cada vez por conta.
  PERFORM pg_advisory_xact_lock(hashtextextended('sp_catalog:' || u.supplier_account_id::text, 0));

  CREATE TEMP TABLE IF NOT EXISTS _sp_cat_import (
    idx         integer,
    rownum      integer,
    data        jsonb,
    errors      text[],
    ref_key     text,
    existing_id uuid,
    status      text,
    changes     jsonb
  ) ON COMMIT DROP;
  TRUNCATE pg_temp._sp_cat_import;

  INSERT INTO pg_temp._sp_cat_import (idx, rownum, data, errors, ref_key)
  SELECT e.ord::integer,
         CASE WHEN jsonb_typeof(e.v) = 'object' AND (e.v ->> '_row') ~ '^[0-9]{1,7}$'
              THEN (e.v ->> '_row')::integer ELSE e.ord::integer END,
         c.data, c.errors,
         public.fn_product_code_key(c.data ->> 'supplier_ref')
  FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS e(v, ord)
  CROSS JOIN LATERAL public.fn_sp_catalog_clean(e.v) c;

  -- Referência repetida no próprio ficheiro: fica a primeira.
  UPDATE pg_temp._sp_cat_import t
     SET errors = t.errors || format('Referência repetida no ficheiro (já na linha %s)', d.first_row)
  FROM (
    SELECT idx, first_value(rownum) OVER (PARTITION BY ref_key ORDER BY idx) AS first_row,
           row_number() OVER (PARTITION BY ref_key ORDER BY idx) AS rn
    FROM pg_temp._sp_cat_import
    WHERE ref_key IS NOT NULL
  ) d
  WHERE d.idx = t.idx AND d.rn > 1;

  UPDATE pg_temp._sp_cat_import t
     SET existing_id = ci.id
  FROM public.supplier_catalog_items ci
  WHERE ci.supplier_account_id = u.supplier_account_id AND ci.ref_key = t.ref_key;

  -- Artigo novo precisa de nome.
  UPDATE pg_temp._sp_cat_import t
     SET errors = t.errors || 'Nome obrigatório'::text
  WHERE t.existing_id IS NULL AND NOT (t.data ? 'name')
    AND NOT ('Nome obrigatório' = ANY (t.errors));

  -- 20270103600000: produto | serviço, com o estado final (linha sobre o artigo gravado).
  UPDATE pg_temp._sp_cat_import t
     SET errors = t.errors || public.fn_sp_catalog_kind_errors(k.kind, k.unit, k.dist),
         data = CASE WHEN k.kind = 'servico'
                     THEN (t.data - 'barcode' - 'units_per_pack')
                          || jsonb_build_object('item_kind', 'servico')
                          || CASE WHEN public.fn_sp_service_unit(k.unit) IS NOT NULL
                                  THEN jsonb_build_object('unit_label', public.fn_sp_service_unit(k.unit))
                                  ELSE '{}'::jsonb END
                     ELSE t.data - 'service_districts' - 'mobilization_days' END
  FROM (
    SELECT t2.idx,
           COALESCE(t2.data ->> 'item_kind', ci.item_kind, 'produto') AS kind,
           CASE WHEN t2.data ? 'unit_label' THEN t2.data ->> 'unit_label' ELSE ci.unit_label END AS unit,
           CASE WHEN t2.data ? 'service_districts' THEN t2.data -> 'service_districts' ELSE to_jsonb(ci.service_districts) END AS dist
    FROM pg_temp._sp_cat_import t2
    LEFT JOIN public.supplier_catalog_items ci ON ci.id = t2.existing_id
  ) k
  WHERE k.idx = t.idx;

  UPDATE pg_temp._sp_cat_import t
     SET status = 'error'
  WHERE cardinality(t.errors) > 0;

  UPDATE pg_temp._sp_cat_import t
     SET changes = public.fn_sp_catalog_diff(ci, t.data),
         status = CASE WHEN public.fn_sp_catalog_diff(ci, t.data) = '{}'::jsonb THEN 'unchanged' ELSE 'changed' END
  FROM public.supplier_catalog_items ci
  WHERE t.status IS NULL AND t.existing_id = ci.id;

  UPDATE pg_temp._sp_cat_import SET status = 'new' WHERE status IS NULL;

  SELECT count(*) FILTER (WHERE status = 'new'),
         count(*) FILTER (WHERE status = 'changed'),
         count(*) FILTER (WHERE status = 'unchanged'),
         count(*) FILTER (WHERE status = 'error')
  INTO v_new, v_chg, v_same, v_err
  FROM pg_temp._sp_cat_import;

  IF NOT v_dry THEN
    INSERT INTO public.supplier_catalog_items (
      supplier_account_id, supplier_ref, barcode, name, description, brand, unit_label,
      units_per_pack, base_price, currency, moq, lead_time_days, is_active,
      created_by_portal_user, updated_by_portal_user,
      item_kind, service_districts, mobilization_days
    )
    SELECT u.supplier_account_id,
           t.data ->> 'supplier_ref', t.data ->> 'barcode', t.data ->> 'name', t.data ->> 'description',
           t.data ->> 'brand', t.data ->> 'unit_label',
           (t.data ->> 'units_per_pack')::numeric, (t.data ->> 'base_price')::numeric,
           COALESCE(t.data ->> 'currency', 'EUR'), (t.data ->> 'moq')::numeric,
           (t.data ->> 'lead_time_days')::integer, COALESCE((t.data ->> 'is_active')::boolean, true),
           u.id, u.id,
           COALESCE(t.data ->> 'item_kind', 'produto'), public.fn_sp_jsonb_textarr(t.data -> 'service_districts'),
           (t.data ->> 'mobilization_days')::integer
    FROM pg_temp._sp_cat_import t
    WHERE t.status = 'new';

    UPDATE public.supplier_catalog_items ci SET
      supplier_ref   = CASE WHEN t.data ? 'supplier_ref'   THEN t.data ->> 'supplier_ref' ELSE ci.supplier_ref END,
      barcode        = CASE WHEN t.data ? 'barcode'        THEN t.data ->> 'barcode' ELSE ci.barcode END,
      name           = CASE WHEN t.data ? 'name'           THEN t.data ->> 'name' ELSE ci.name END,
      description    = CASE WHEN t.data ? 'description'    THEN t.data ->> 'description' ELSE ci.description END,
      brand          = CASE WHEN t.data ? 'brand'          THEN t.data ->> 'brand' ELSE ci.brand END,
      unit_label     = CASE WHEN t.data ? 'unit_label'     THEN t.data ->> 'unit_label' ELSE ci.unit_label END,
      units_per_pack = CASE WHEN t.data ? 'units_per_pack' THEN (t.data ->> 'units_per_pack')::numeric ELSE ci.units_per_pack END,
      base_price     = CASE WHEN t.data ? 'base_price'     THEN (t.data ->> 'base_price')::numeric ELSE ci.base_price END,
      currency       = CASE WHEN t.data ? 'currency'       THEN t.data ->> 'currency' ELSE ci.currency END,
      moq            = CASE WHEN t.data ? 'moq'            THEN (t.data ->> 'moq')::numeric ELSE ci.moq END,
      lead_time_days = CASE WHEN t.data ? 'lead_time_days' THEN (t.data ->> 'lead_time_days')::integer ELSE ci.lead_time_days END,
      is_active      = CASE WHEN t.data ? 'is_active'      THEN (t.data ->> 'is_active')::boolean ELSE ci.is_active END,
      item_kind         = CASE WHEN t.data ? 'item_kind'         THEN t.data ->> 'item_kind' ELSE ci.item_kind END,
      service_districts = CASE WHEN t.data ? 'service_districts' THEN public.fn_sp_jsonb_textarr(t.data -> 'service_districts') ELSE ci.service_districts END,
      mobilization_days = CASE WHEN t.data ? 'mobilization_days' THEN (t.data ->> 'mobilization_days')::integer ELSE ci.mobilization_days END,
      updated_at = now(),
      updated_by_portal_user = u.id
    FROM pg_temp._sp_cat_import t
    WHERE t.status = 'changed' AND ci.id = t.existing_id;
  END IF;

  v_summary := jsonb_build_object('total', v_n, 'new', v_new, 'changed', v_chg, 'unchanged', v_same, 'errors', v_err);

  IF NOT v_dry THEN
    INSERT INTO public.supplier_catalog_imports (supplier_account_id, portal_user_id, file_name, total_rows, summary)
    VALUES (u.supplier_account_id, u.id, v_file, v_n, v_summary)
    RETURNING id INTO v_import;
  END IF;

  -- Detalhe só das linhas novas, alteradas ou com erro (as iguais só contam).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'row', t.rownum,
           'status', t.status,
           'supplier_ref', t.data ->> 'supplier_ref',
           'name', COALESCE(t.data ->> 'name', ci.name),
           'changes', CASE WHEN t.status = 'changed' THEN t.changes END,
           'errors', CASE WHEN t.status = 'error' THEN to_jsonb(t.errors) END
         ) ORDER BY t.idx), '[]'::jsonb)
  INTO v_rows
  FROM pg_temp._sp_cat_import t
  LEFT JOIN public.supplier_catalog_items ci ON ci.id = t.existing_id
  WHERE t.status <> 'unchanged';

  TRUNCATE pg_temp._sp_cat_import;

  RETURN v_summary || jsonb_build_object('dry_run', v_dry, 'import_id', v_import, 'rows', v_rows);
END;
$function$;

-- Vivo + filtro p_kind (produto | servico) e contagem por tipo. Assinatura nova: DROP + CREATE.
DROP FUNCTION IF EXISTS public.sp_catalog_list(text, integer, integer, boolean);
CREATE FUNCTION public.sp_catalog_list(p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_include_inactive boolean DEFAULT false, p_kind text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u        public.supplier_portal_users := public.fn_sp_actor();
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_q      text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_kind   text := NULLIF(lower(btrim(COALESCE(p_kind, ''))), '');
  v_like   text;
  v_total  integer;
  v_items  jsonb;
  v_kinds  jsonb;
BEGIN
  IF v_kind IS NOT NULL AND v_kind NOT IN ('produto', 'servico') THEN
    RAISE EXCEPTION 'Tipo inválido (produto, servico)' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF v_q IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(left(v_q, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  SELECT count(*) FILTER (WHERE v_kind IS NULL OR ci.item_kind = v_kind),
         jsonb_build_object('produto', count(*) FILTER (WHERE ci.item_kind = 'produto'),
                            'servico', count(*) FILTER (WHERE ci.item_kind = 'servico'))
  INTO v_total, v_kinds
  FROM public.supplier_catalog_items ci
  WHERE ci.supplier_account_id = u.supplier_account_id
    AND (COALESCE(p_include_inactive, false) OR ci.is_active)
    AND (v_like IS NULL OR ci.supplier_ref ILIKE v_like OR ci.name ILIKE v_like
         OR ci.barcode ILIKE v_like OR ci.brand ILIKE v_like);

  SELECT COALESCE(jsonb_agg(public.fn_sp_catalog_item_json(ci, true) ORDER BY ci.supplier_ref, ci.id), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT c.id
    FROM public.supplier_catalog_items c
    WHERE c.supplier_account_id = u.supplier_account_id
      AND (COALESCE(p_include_inactive, false) OR c.is_active)
      AND (v_kind IS NULL OR c.item_kind = v_kind)
      AND (v_like IS NULL OR c.supplier_ref ILIKE v_like OR c.name ILIKE v_like
           OR c.barcode ILIKE v_like OR c.brand ILIKE v_like)
    ORDER BY c.supplier_ref, c.id
    LIMIT v_limit OFFSET v_offset
  ) z
  JOIN public.supplier_catalog_items ci ON ci.id = z.id;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'can_edit', u.role = 'owner',
    'kind_counts', v_kinds,
    'items', v_items
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.sp_catalog_list(text, integer, integer, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sp_catalog_list(text, integer, integer, boolean, text) TO authenticated, service_role;

-- Vivo + um serviço não tem categoria de produto (a normalização limpava-a em silêncio).
CREATE OR REPLACE FUNCTION public.sp_catalog_classificar_item(p_id uuid, p_categoria uuid, p_subcategoria uuid, p_medida text, p_cor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  u   public.supplier_portal_users := public.fn_sp_actor();
  cur public.supplier_catalog_items;
  v_medida text := nullif(btrim(regexp_replace(coalesce(p_medida, ''), '[\x01-\x1F\x7F]', '', 'g')), '');
  v_cor    text := nullif(btrim(regexp_replace(coalesce(p_cor, ''), '[\x01-\x1F\x7F]', '', 'g')), '');
BEGIN
  IF u.role <> 'owner' THEN
    RAISE EXCEPTION 'Só o utilizador principal da conta pode alterar o catálogo'
      USING ERRCODE = 'insufficient_privilege', HINT = 'not_owner';
  END IF;
  SELECT * INTO cur FROM public.supplier_catalog_items WHERE id = p_id AND supplier_account_id = u.supplier_account_id FOR UPDATE;
  IF cur.id IS NULL THEN
    RAISE EXCEPTION 'Artigo não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  -- 20270103600000
  IF cur.item_kind = 'servico' THEN
    RAISE EXCEPTION 'Um serviço não tem categoria de produto' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF p_categoria IS NULL THEN
    RAISE EXCEPTION 'Categoria obrigatória' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sp_categorias WHERE id = p_categoria AND parent_id IS NULL AND ativa) THEN
    RAISE EXCEPTION 'Categoria desconhecida' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF p_subcategoria IS NULL AND EXISTS (SELECT 1 FROM public.sp_categorias WHERE parent_id = p_categoria AND ativa) THEN
    RAISE EXCEPTION 'Subcategoria obrigatória' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF p_subcategoria IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sp_categorias WHERE id = p_subcategoria AND parent_id = p_categoria AND ativa) THEN
    RAISE EXCEPTION 'A subcategoria não é desta categoria' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF length(v_medida) > 40 OR length(v_cor) > 40 THEN
    RAISE EXCEPTION 'A medida e a cor têm no máximo 40 caracteres' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  UPDATE public.supplier_catalog_items SET categoria_id = p_categoria, subcategoria_id = p_subcategoria, medida = v_medida, cor = v_cor,
    updated_at = now(), updated_by_portal_user = u.id
  WHERE id = cur.id RETURNING * INTO cur;
  RETURN jsonb_build_object('item', public.fn_sp_catalog_item_json(cur, true));
END $function$;

-- ═══ 5. CRM: lista, sugestões, ligar ═══════════════════════════════════════

-- Vivo + p_kind, kind_counts, can_link_services e ligações a serviços (LEFT JOIN: antes o
-- JOIN a products deixava de fora as ligações de serviço). Assinatura nova: DROP + CREATE.
DROP FUNCTION IF EXISTS public.rpc_supplier_catalog_list(uuid, text, text, integer, integer, boolean);
CREATE FUNCTION public.rpc_supplier_catalog_list(p_supplier_id uuid, p_filter text DEFAULT 'all'::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_include_inactive boolean DEFAULT false, p_kind text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org     uuid := public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.view');
  v_uid     uuid := auth.uid();
  v_pricing boolean;
  v_filter  text := lower(COALESCE(NULLIF(btrim(p_filter), ''), 'all'));
  v_kind    text := NULLIF(lower(btrim(COALESCE(p_kind, ''))), '');
  v_limit   integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
  v_offset  integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_q       text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_like    text;
  l         public.supplier_account_links;
  v_counts  jsonb;
  v_kinds   jsonb;
  v_total   integer;
  v_items   jsonb;
BEGIN
  IF v_filter NOT IN ('all', 'linked', 'unlinked', 'dismissed') THEN
    RAISE EXCEPTION 'Filtro inválido (all, linked, unlinked, dismissed)' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  IF v_kind IS NOT NULL AND v_kind NOT IN ('produto', 'servico') THEN
    RAISE EXCEPTION 'Tipo inválido (produto, servico)' USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;
  v_pricing := public.has_anew_permission(v_uid, 'suppliers.view_pricing')
            OR public.has_anew_permission(v_uid, 'products.view_cost');

  SELECT * INTO l FROM public.supplier_account_links WHERE supplier_id = p_supplier_id AND status = 'active';
  IF l.id IS NULL THEN
    RETURN jsonb_build_object('linked_account', false, 'counts', jsonb_build_object('all', 0, 'linked', 0, 'unlinked', 0, 'dismissed', 0),
                              'kind_counts', jsonb_build_object('produto', 0, 'servico', 0),
                              'total', 0, 'limit', v_limit, 'offset', v_offset, 'items', '[]'::jsonb,
                              'can_link', false, 'can_link_services', false, 'can_view_pricing', v_pricing,
                              'can_manage_prices', public.has_anew_permission(v_uid, 'products.manage_prices'),
                              'can_manage_service_prices', public.has_anew_permission(v_uid, 'services.manage_prices'));
  END IF;

  IF v_q IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(left(v_q, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  WITH f0 AS (
    SELECT ci.id, ci.supplier_ref, ci.item_kind,
           EXISTS (SELECT 1 FROM public.item_suppliers isup
                   WHERE isup.supplier_id = p_supplier_id AND isup.catalog_item_id = ci.id AND isup.deleted_at IS NULL) AS is_linked,
           EXISTS (SELECT 1 FROM public.supplier_catalog_dismissals d WHERE d.link_id = l.id AND d.catalog_item_id = ci.id) AS is_dismissed
    FROM public.supplier_catalog_items ci
    WHERE ci.supplier_account_id = l.supplier_account_id
      AND (COALESCE(p_include_inactive, false) OR ci.is_active)
      AND (v_like IS NULL OR ci.supplier_ref ILIKE v_like OR ci.name ILIKE v_like
           OR ci.barcode ILIKE v_like OR ci.brand ILIKE v_like)
  ),
  f AS (
    SELECT f0.* FROM f0 WHERE v_kind IS NULL OR f0.item_kind = v_kind
  ),
  fx AS (
    SELECT f.*,
           (v_filter = 'all'
            OR (v_filter = 'linked' AND f.is_linked)
            OR (v_filter = 'unlinked' AND NOT f.is_linked AND NOT f.is_dismissed)
            OR (v_filter = 'dismissed' AND f.is_dismissed AND NOT f.is_linked)) AS in_filter
    FROM f
  ),
  page AS (
    SELECT fx.id, fx.is_linked, fx.is_dismissed
    FROM fx WHERE fx.in_filter
    ORDER BY fx.supplier_ref, fx.id
    LIMIT v_limit OFFSET v_offset
  )
  SELECT
    (SELECT jsonb_build_object(
              'all', count(*),
              'linked', count(*) FILTER (WHERE is_linked),
              'unlinked', count(*) FILTER (WHERE NOT is_linked AND NOT is_dismissed),
              'dismissed', count(*) FILTER (WHERE is_dismissed AND NOT is_linked))
       FROM fx),
    -- Por tipo, no filtro de estado escolhido (para os botões Produtos/Serviços).
    (SELECT jsonb_build_object(
              'produto', count(*) FILTER (WHERE f0.item_kind = 'produto'),
              'servico', count(*) FILTER (WHERE f0.item_kind = 'servico'))
       FROM f0
       WHERE (v_filter = 'all'
              OR (v_filter = 'linked' AND f0.is_linked)
              OR (v_filter = 'unlinked' AND NOT f0.is_linked AND NOT f0.is_dismissed)
              OR (v_filter = 'dismissed' AND f0.is_dismissed AND NOT f0.is_linked))),
    (SELECT count(*) FROM fx WHERE in_filter),
    (SELECT COALESCE(jsonb_agg(
           public.fn_sp_catalog_item_json(ci, v_pricing)
           || jsonb_build_object(
                'is_linked', f.is_linked,
                'is_dismissed', f.is_dismissed,
                'links', COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                           'item_supplier_id', isup.id,
                           'item_type', isup.item_type,
                           'product_id', p.id,
                           'product_name', COALESCE(p.name, sv.name),
                           'product_sku', COALESCE(p.sku, sv.sku),
                           'service_id', sv.id,
                           'service_name', sv.name,
                           'service_sku', sv.sku,
                           'uom_id', isup.uom_id,
                           'supplier_sku', isup.supplier_sku,
                           'purchase_price', CASE WHEN v_pricing THEN isup.purchase_price END,
                           'currency', isup.currency,
                           'is_preferred', isup.is_preferred) ORDER BY COALESCE(p.name, sv.name))
                  FROM public.item_suppliers isup
                  LEFT JOIN public.products p ON p.id = isup.product_id
                  LEFT JOIN public.services sv ON sv.id = isup.service_id
                  WHERE isup.supplier_id = p_supplier_id AND isup.catalog_item_id = ci.id AND isup.deleted_at IS NULL
                    AND (p.id IS NOT NULL OR sv.id IS NOT NULL)
                ), '[]'::jsonb))
           ORDER BY ci.supplier_ref, ci.id), '[]'::jsonb)
       FROM page f
       JOIN public.supplier_catalog_items ci ON ci.id = f.id)
  INTO v_counts, v_kinds, v_total, v_items;

  RETURN jsonb_build_object(
    'linked_account', true,
    'counts', v_counts,
    'kind_counts', v_kinds,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'items', v_items,
    'can_link', public.has_anew_permission(v_uid, 'products.edit'),
    'can_link_services', public.has_anew_permission(v_uid, 'services.edit'),
    'can_view_pricing', v_pricing,
    'can_manage_prices', public.has_anew_permission(v_uid, 'products.manage_prices'),
    'can_manage_service_prices', public.has_anew_permission(v_uid, 'services.manage_prices')
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.rpc_supplier_catalog_list(uuid, text, text, integer, integer, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_catalog_list(uuid, text, text, integer, integer, boolean, text) TO authenticated, service_role;

-- Vivo + só artigos do tipo produto (os serviços ligam-se por rpc_catalog_service_search).
CREATE OR REPLACE FUNCTION public.rpc_catalog_link_suggestions(p_supplier_id uuid, p_catalog_item_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid := public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.view');
  v_acc uuid;
  v_res jsonb;
BEGIN
  IF NOT public.has_anew_permission(auth.uid(), 'products.view') THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (products.view)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF p_catalog_item_ids IS NULL OR cardinality(p_catalog_item_ids) = 0 THEN
    RETURN jsonb_build_object('items', '[]'::jsonb);
  END IF;
  IF cardinality(p_catalog_item_ids) > 200 THEN
    RAISE EXCEPTION 'Demasiados artigos (máx. 200 por pedido)' USING ERRCODE = 'check_violation', HINT = 'too_many_rows';
  END IF;

  SELECT supplier_account_id INTO v_acc FROM public.supplier_account_links
  WHERE supplier_id = p_supplier_id AND status = 'active';
  IF v_acc IS NULL THEN
    RAISE EXCEPTION 'Este fornecedor não está ligado ao portal' USING ERRCODE = 'no_data_found', HINT = 'not_linked';
  END IF;

  WITH ci AS (
    SELECT c.id, c.ref_key, c.barcode_key, c.name,
           lower(extensions.unaccent('extensions.unaccent'::regdictionary, c.name)) AS uname
    FROM public.supplier_catalog_items c
    WHERE c.supplier_account_id = v_acc AND c.id = ANY (p_catalog_item_ids)
      AND c.item_kind = 'produto'   -- 20270103600000
  ),
  cand AS (
    SELECT ci.id AS catalog_item_id, isup.product_id, 'supplier_sku'::text AS reason, 1.00::numeric AS score, isup.id AS item_supplier_id
    FROM ci
    JOIN public.item_suppliers isup
      ON isup.supplier_id = p_supplier_id AND isup.deleted_at IS NULL AND isup.product_id IS NOT NULL
     AND isup.catalog_item_id IS NULL
     AND public.fn_product_code_key(isup.supplier_sku) = ci.ref_key
    UNION ALL
    SELECT ci.id, pc.product_id, 'supplier_ref_code', 0.98, NULL
    FROM ci
    JOIN public.product_codes pc
      ON pc.organization_id = v_org AND pc.supplier_id = p_supplier_id AND pc.kind = 'supplier_ref'
     AND pc.deleted_at IS NULL AND pc.code_key = ci.ref_key
    UNION ALL
    SELECT ci.id, p.id, 'barcode', 0.95, NULL
    FROM ci
    JOIN public.products p
      ON ci.barcode_key IS NOT NULL AND p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
     AND public.fn_product_code_key(p.barcode) = ci.barcode_key
    UNION ALL
    SELECT ci.id, pc.product_id, 'barcode', 0.95, NULL
    FROM ci
    JOIN public.product_codes pc
      ON ci.barcode_key IS NOT NULL AND pc.organization_id = v_org AND pc.kind = 'barcode'
     AND pc.deleted_at IS NULL AND pc.code_key = ci.barcode_key
    UNION ALL
    SELECT ci.id, n.id, 'name', n.score, NULL
    FROM ci
    CROSS JOIN LATERAL (
      SELECT p.id,
             round(extensions.similarity(lower(extensions.unaccent('extensions.unaccent'::regdictionary, p.name)), ci.uname)::numeric, 3) AS score
      FROM public.products p
      WHERE p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
        AND p.name OPERATOR(extensions.%) ci.name
      ORDER BY 2 DESC, p.id
      LIMIT 10
    ) n
    WHERE n.score >= 0.30
  ),
  best AS (
    SELECT DISTINCT ON (c.catalog_item_id, c.product_id)
           c.catalog_item_id, c.product_id, c.reason, c.score, c.item_supplier_id
    FROM cand c
    JOIN public.products p ON p.id = c.product_id AND p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
    WHERE NOT EXISTS (
      SELECT 1 FROM public.item_suppliers x
      WHERE x.supplier_id = p_supplier_id AND x.catalog_item_id = c.catalog_item_id
        AND x.product_id = c.product_id AND x.deleted_at IS NULL)
    ORDER BY c.catalog_item_id, c.product_id, c.score DESC, c.item_supplier_id NULLS LAST
  ),
  ranked AS (
    SELECT b.*, row_number() OVER (PARTITION BY b.catalog_item_id ORDER BY b.score DESC, b.product_id) AS rn
    FROM best b
  )
  SELECT jsonb_build_object('items', COALESCE(jsonb_agg(jsonb_build_object(
           'catalog_item_id', ci.id,
           'suggestions', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'product_id', p.id,
                      'product_name', p.name,
                      'product_sku', p.sku,
                      'product_barcode', p.barcode,
                      'reason', r.reason,
                      'score', r.score,
                      'exact', r.reason <> 'name',
                      'item_supplier_id', r.item_supplier_id) ORDER BY r.rn)
             FROM ranked r JOIN public.products p ON p.id = r.product_id
             WHERE r.catalog_item_id = ci.id AND r.rn <= 5
           ), '[]'::jsonb)) ORDER BY ci.id), '[]'::jsonb))
  INTO v_res
  FROM ci;

  RETURN v_res;
END;
$function$;

-- Vivo + recusa artigos do tipo serviço (ligam-se a um serviço nosso por rpc_catalog_link_service).
CREATE OR REPLACE FUNCTION public.rpc_catalog_link(p_supplier_id uuid, p_catalog_item_id uuid, p_product_id uuid, p_uom_id uuid DEFAULT NULL::uuid, p_apply_catalog_price boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org      uuid := public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.view');
  v_actor    uuid := public.current_business_user_id();
  l          public.supplier_account_links;
  ci         public.supplier_catalog_items;
  p          record;
  isup       public.item_suppliers;
  v_other    record;
  v_created  boolean := false;
  v_warn     jsonb := '[]'::jsonb;
  v_codes    jsonb := '[]'::jsonb;
  v_price    boolean := COALESCE(p_apply_catalog_price, true);
  v_pref     boolean;
  v_code_id  uuid;
  v_old_price numeric;
  v_old_ccy  text;
  v_price_upd boolean := false;
  v_cost     jsonb;
  v_link_factor integer;   -- fn_uom_units_per(p_uom_id, produto)
  v_pack     numeric;      -- units_per_pack do artigo quando a ligação é à unidade
  v_link_price numeric;    -- preço do catálogo a gravar na ligação (÷N nas embalagens)
  v_use_price boolean;     -- usar mesmo o preço (pedido, com preço e conversível)
BEGIN
  IF NOT public.has_anew_permission(auth.uid(), 'products.edit') THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (products.edit)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  SELECT * INTO l FROM public.supplier_account_links WHERE supplier_id = p_supplier_id AND status = 'active';
  IF l.id IS NULL THEN
    RAISE EXCEPTION 'Este fornecedor não está ligado ao portal' USING ERRCODE = 'no_data_found', HINT = 'not_linked';
  END IF;
  SELECT * INTO ci FROM public.supplier_catalog_items WHERE id = p_catalog_item_id AND supplier_account_id = l.supplier_account_id;
  IF ci.id IS NULL THEN
    RAISE EXCEPTION 'Artigo do catálogo não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  -- 20270103600000: um serviço do fornecedor liga-se a um serviço nosso.
  IF ci.item_kind = 'servico' THEN
    RAISE EXCEPTION 'Este artigo é um serviço: ligue-o a um serviço nosso' USING ERRCODE = 'check_violation', HINT = 'kind_mismatch';
  END IF;
  SELECT id, name, sku, barcode INTO p FROM public.products
  WHERE id = p_product_id AND organization_id = v_org AND deleted_at IS NULL AND NOT is_deleted
  FOR NO KEY UPDATE;
  IF p.id IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  -- F3.4b: usar o preço do catálogo muda preços (ligação e custo do produto):
  -- a mesma permissão de aceitar um pedido de alteração de preço.
  IF v_price AND ci.base_price IS NOT NULL
     AND NOT public.has_anew_permission(auth.uid(), 'products.manage_prices') THEN
    RAISE EXCEPTION 'Sem permissão para alterar preços: liga sem usar o preço do catálogo'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_price_permission';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('catalog_link:' || p_supplier_id::text, 0));
  PERFORM set_config('app.audit_source', 'supplier_catalog', true);

  -- 20270101210000: ligado a um artigo do portal, o produto entra no Catálogo (/catalogo-custos lista tipo_catalogo não nulo).
  -- Só preenche o que está vazio: nunca muda tipo_catalogo/unidade já escolhidos. Qualquer erro mais abaixo desfaz isto também.
  UPDATE public.products
     SET tipo_catalogo = COALESCE(tipo_catalogo, 'produto'),
         -- 20270101240000: ao entrar no Catálogo passa a gerir stock (como todos os produtos do Catálogo)
         manages_stock = CASE WHEN tipo_catalogo IS NULL THEN true ELSE manages_stock END,
         unidade = COALESCE(unidade, public.fn_cat_unidade_do_artigo(ci.unit_label, ci.units_per_pack))
   WHERE id = p.id AND (tipo_catalogo IS NULL OR unidade IS NULL);

  -- Artigo em embalagem de N ligado à unidade do produto: o preço do catálogo é
  -- da embalagem; a ligação guarda o preço por unidade (÷ N, como
  -- fn_price_change_cost_plan). N não inteiro → não se grava preço.
  BEGIN
    v_link_factor := public.fn_uom_units_per(p_uom_id, p.id);
  EXCEPTION WHEN OTHERS THEN
    v_link_factor := NULL;
  END;
  v_pack := CASE WHEN v_link_factor = 1 AND ci.units_per_pack > 1 THEN ci.units_per_pack END;
  v_link_price := CASE
                    WHEN ci.base_price IS NULL THEN NULL
                    WHEN v_pack IS NULL THEN ci.base_price
                    WHEN v_pack = trunc(v_pack) AND v_pack <= 2147483647 THEN round(ci.base_price / v_pack, 2)
                    ELSE NULL
                  END;
  v_use_price := v_price AND v_link_price IS NOT NULL;

  -- Este artigo já está ligado?
  SELECT * INTO isup FROM public.item_suppliers
  WHERE supplier_id = p_supplier_id AND catalog_item_id = ci.id AND deleted_at IS NULL;
  IF isup.id IS NOT NULL THEN
    IF isup.product_id = p.id THEN
      RETURN jsonb_build_object('item_supplier_id', isup.id, 'created', false, 'already_linked', true,
                                'codes', '[]'::jsonb, 'warnings', '[]'::jsonb,
                                'item_supplier_price_updated', false, 'product_cost_updated', false,
                                'product_cost_reason', 'already_linked', 'product_cost_message', NULL);
    END IF;
    SELECT name, sku INTO v_other FROM public.products WHERE id = isup.product_id;
    RAISE EXCEPTION 'A referência «%» já está ligada ao produto «%» (%)', ci.supplier_ref, v_other.name, v_other.sku
      USING ERRCODE = 'unique_violation', HINT = 'conflict';
  END IF;

  -- A referência já aponta para outro produto em product_codes?
  SELECT pr.name, pr.sku INTO v_other
  FROM public.product_codes pc JOIN public.products pr ON pr.id = pc.product_id
  WHERE pc.organization_id = v_org AND pc.supplier_id = p_supplier_id AND pc.kind = 'supplier_ref'
    AND pc.deleted_at IS NULL AND pc.code_key = ci.ref_key AND pc.product_id <> p.id
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'A referência «%» já está associada ao produto «%» (%) nos códigos do fornecedor', ci.supplier_ref, v_other.name, v_other.sku
      USING ERRCODE = 'unique_violation', HINT = 'conflict';
  END IF;

  -- Linha existente (produto, fornecedor, unidade)?
  SELECT * INTO isup FROM public.item_suppliers
  WHERE product_id = p.id AND supplier_id = p_supplier_id AND deleted_at IS NULL
    AND COALESCE(uom_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_uom_id, '00000000-0000-0000-0000-000000000000'::uuid)
  FOR UPDATE;

  IF isup.id IS NOT NULL THEN
    IF isup.catalog_item_id IS NOT NULL THEN
      SELECT supplier_ref INTO v_other FROM public.supplier_catalog_items WHERE id = isup.catalog_item_id;
      RAISE EXCEPTION 'Este produto já está ligado a outra referência do catálogo («%»)', v_other.supplier_ref
        USING ERRCODE = 'unique_violation', HINT = 'conflict';
    END IF;
    IF isup.supplier_sku IS NOT NULL AND public.fn_product_code_key(isup.supplier_sku) IS DISTINCT FROM ci.ref_key THEN
      v_warn := v_warn || jsonb_build_array(format('Referência do fornecedor alterada de «%s» para «%s»', isup.supplier_sku, ci.supplier_ref));
    END IF;
    v_old_price := isup.purchase_price;
    v_old_ccy := isup.currency;
    UPDATE public.item_suppliers SET
      catalog_item_id = ci.id,
      supplier_sku = ci.supplier_ref,
      purchase_price = CASE WHEN v_use_price THEN v_link_price ELSE purchase_price END,
      currency = CASE WHEN v_use_price THEN ci.currency ELSE currency END,
      preco_data = CASE WHEN v_use_price THEN current_date ELSE preco_data END,
      moq = COALESCE(moq, ci.moq),
      lead_time_days = COALESCE(lead_time_days, ci.lead_time_days),
      updated_at = now()
    WHERE id = isup.id
    RETURNING * INTO isup;
    v_price_upd := v_use_price
                   AND (isup.purchase_price IS DISTINCT FROM v_old_price OR isup.currency IS DISTINCT FROM v_old_ccy);
  ELSE
    v_pref := NOT EXISTS (SELECT 1 FROM public.item_suppliers WHERE product_id = p.id AND deleted_at IS NULL);
    INSERT INTO public.item_suppliers (
      organization_id, item_type, product_id, supplier_id, uom_id, supplier_sku, purchase_price,
      currency, moq, lead_time_days, is_preferred, is_active, created_by, catalog_item_id, preco_data
    ) VALUES (
      v_org, 'product', p.id, p_supplier_id, p_uom_id, ci.supplier_ref,
      CASE WHEN v_use_price THEN v_link_price END, ci.currency, ci.moq, ci.lead_time_days,
      v_pref, true, v_actor, ci.id, CASE WHEN v_use_price THEN current_date END
    ) RETURNING * INTO isup;
    v_created := true;
    v_price_upd := v_use_price;
  END IF;

  -- F3.4b: com o preço do catálogo, o custo do produto segue a mesma regra
  -- de aceitar um preço (ligação preferencial, empresa principal, unidade).
  -- Embalagem: passa-se o preço do catálogo e o plano divide por N (o custo
  -- fica = preço por unidade gravado na ligação). N não inteiro: o plano
  -- devolve 'pack_not_integer' e o custo não muda.
  IF v_price AND ci.base_price IS NOT NULL THEN
    v_cost := public.fn_apply_product_cost_from_supplier(
                isup.id, v_org,
                CASE WHEN v_pack IS NOT NULL THEN ci.base_price ELSE isup.purchase_price END,
                CASE WHEN v_pack IS NOT NULL THEN ci.currency ELSE isup.currency END,
                v_actor);
  ELSE
    v_cost := jsonb_build_object(
      'product_cost_updated', false, 'product_cost_rows', 0,
      'product_cost_reason', CASE WHEN v_price THEN 'no_catalog_price' ELSE 'catalog_price_not_used' END,
      'product_cost_message', CASE WHEN v_price THEN 'O artigo não tem preço no catálogo: preços não mudaram'
                                   ELSE 'Preço do catálogo não usado: preços não mudaram' END,
      'new_unit_cost', NULL, 'units_per_purchase_uom', NULL);
  END IF;

  -- product_codes: referência do fornecedor
  IF NOT EXISTS (SELECT 1 FROM public.product_codes
                 WHERE organization_id = v_org AND supplier_id = p_supplier_id AND kind = 'supplier_ref'
                   AND deleted_at IS NULL AND code_key = ci.ref_key) THEN
    v_code_id := gen_random_uuid();
    INSERT INTO public.product_codes (id, organization_id, code, kind, product_id, uom_id, supplier_id, source, context, created_by)
    VALUES (v_code_id, v_org, ci.supplier_ref, 'supplier_ref', p.id, p_uom_id, p_supplier_id, 'catalog',
            jsonb_build_object('catalog_item_id', ci.id, 'link_id', l.id), v_actor);
    v_codes := v_codes || jsonb_build_array(jsonb_build_object('id', v_code_id, 'kind', 'supplier_ref', 'code', ci.supplier_ref));
  END IF;

  -- product_codes: código de barras do artigo, se faltar no produto e estiver livre
  IF ci.barcode_key IS NOT NULL
     AND public.fn_product_code_key(p.barcode) IS DISTINCT FROM ci.barcode_key
     AND NOT EXISTS (SELECT 1 FROM public.product_codes
                     WHERE organization_id = v_org AND kind = 'barcode' AND deleted_at IS NULL
                       AND code_key = ci.barcode_key AND product_id = p.id) THEN
    SELECT pr.name, pr.sku INTO v_other
    FROM public.products pr
    WHERE pr.organization_id = v_org AND pr.id <> p.id AND pr.deleted_at IS NULL AND NOT pr.is_deleted
      AND public.fn_product_code_key(pr.barcode) = ci.barcode_key
    UNION ALL
    SELECT pr.name, pr.sku
    FROM public.product_codes pc JOIN public.products pr ON pr.id = pc.product_id
    WHERE pc.organization_id = v_org AND pc.kind = 'barcode' AND pc.deleted_at IS NULL
      AND pc.code_key = ci.barcode_key AND pc.product_id <> p.id
    LIMIT 1;
    IF FOUND THEN
      v_warn := v_warn || jsonb_build_array(format('O código de barras %s já está no produto «%s» (%s); não foi associado', ci.barcode, v_other.name, v_other.sku));
    ELSE
      v_code_id := gen_random_uuid();
      INSERT INTO public.product_codes (id, organization_id, code, kind, product_id, uom_id, supplier_id, source, context, created_by)
      VALUES (v_code_id, v_org, ci.barcode, 'barcode', p.id, p_uom_id, p_supplier_id, 'catalog',
              jsonb_build_object('catalog_item_id', ci.id, 'link_id', l.id), v_actor);
      v_codes := v_codes || jsonb_build_array(jsonb_build_object('id', v_code_id, 'kind', 'barcode', 'code', ci.barcode));
    END IF;
  END IF;

  -- Ligado deixa de estar "dispensado".
  DELETE FROM public.supplier_catalog_dismissals WHERE link_id = l.id AND catalog_item_id = ci.id;

  RETURN jsonb_build_object(
    'item_supplier_id', isup.id,
    'created', v_created,
    'already_linked', false,
    'is_preferred', isup.is_preferred,
    'codes', v_codes,
    'warnings', v_warn,
    'item_supplier_price_updated', v_price_upd
  ) || v_cost;
END;
$function$;

-- Vivo + recusa artigos do tipo serviço.
CREATE OR REPLACE FUNCTION public.cat_ligar_produto_artigo(p_org uuid, p_product_id uuid, p_supplier_id uuid, p_catalog_item_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := public.fn_cat_exigir(p_org, 'products.edit'); v_id uuid; a record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id AND organization_id = p_org AND NOT is_deleted) THEN
    RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE = 'CT003';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM suppliers WHERE id = p_supplier_id AND organization_id = p_org AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Fornecedor não encontrado.' USING ERRCODE = 'CT003';
  END IF;
  SELECT * INTO a FROM supplier_catalog_items WHERE id = p_catalog_item_id AND is_active;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Artigo do fornecedor não encontrado.' USING ERRCODE = 'CT003'; END IF;
  -- o artigo tem de ser deste fornecedor (a conta do portal ligada a este fornecedor da organização)
  IF NOT EXISTS (SELECT 1 FROM supplier_account_links l WHERE l.supplier_account_id = a.supplier_account_id AND l.supplier_id = p_supplier_id
                 AND l.organization_id = p_org AND l.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'O artigo não é deste fornecedor.' USING ERRCODE = 'CT002';
  END IF;
  -- 20270103600000: um serviço do fornecedor não se liga a um produto.
  IF a.item_kind = 'servico' THEN
    RAISE EXCEPTION 'Este artigo do fornecedor é um serviço: não se liga a um produto.' USING ERRCODE = 'CT002';
  END IF;
  UPDATE item_suppliers SET is_preferred = false, updated_at = now()
  WHERE product_id = p_product_id AND organization_id = p_org AND is_preferred AND deleted_at IS NULL;
  SELECT id INTO v_id FROM item_suppliers WHERE product_id = p_product_id AND supplier_id = p_supplier_id AND organization_id = p_org AND deleted_at IS NULL LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO item_suppliers (organization_id, item_type, product_id, supplier_id, supplier_sku, purchase_price, currency, lead_time_days, moq,
      is_preferred, is_active, created_by, catalog_item_id, preco_data)
    VALUES (p_org, 'product', p_product_id, p_supplier_id, a.supplier_ref,
      round(a.base_price / nullif(coalesce(a.units_per_pack, 1), 0), 2), coalesce(a.currency, 'EUR'), a.lead_time_days, a.moq,
      true, true, v_user, a.id, a.updated_at::date)
    RETURNING id INTO v_id;
  ELSE
    UPDATE item_suppliers SET supplier_sku = a.supplier_ref, purchase_price = round(a.base_price / nullif(coalesce(a.units_per_pack, 1), 0), 2),
      lead_time_days = a.lead_time_days, moq = a.moq, is_preferred = true, is_active = true, catalog_item_id = a.id,
      preco_data = a.updated_at::date, updated_at = now()
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END $function$;

-- Nova: serviços nossos (services, os do orçamento) para ligar um serviço do fornecedor.
-- Sem p_query: sugestões pelo nome do artigo (e ref. = SKU do serviço). Com p_query: pesquisa.
CREATE OR REPLACE FUNCTION public.rpc_catalog_service_search(p_supplier_id uuid, p_catalog_item_id uuid, p_query text DEFAULT NULL::text, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org   uuid := public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.view');
  v_acc   uuid;
  ci      public.supplier_catalog_items;
  v_q     text := NULLIF(left(btrim(regexp_replace(COALESCE(p_query, ''), '[\x01-\x1F\x7F]', '', 'g')), 100), '');
  v_like  text;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_res   jsonb;
BEGIN
  IF NOT public.has_anew_permission(auth.uid(), 'services.view') THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (services.view)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  SELECT supplier_account_id INTO v_acc FROM public.supplier_account_links
  WHERE supplier_id = p_supplier_id AND status = 'active';
  IF v_acc IS NULL THEN
    RAISE EXCEPTION 'Este fornecedor não está ligado ao portal' USING ERRCODE = 'no_data_found', HINT = 'not_linked';
  END IF;
  SELECT * INTO ci FROM public.supplier_catalog_items WHERE id = p_catalog_item_id AND supplier_account_id = v_acc;
  IF ci.id IS NULL THEN
    RAISE EXCEPTION 'Artigo do catálogo não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF v_q IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  WITH base AS (
    SELECT s.id, s.name, s.sku, s.unidade, s.is_active,
           round(extensions.similarity(lower(extensions.unaccent('extensions.unaccent'::regdictionary, s.name)),
                                       lower(extensions.unaccent('extensions.unaccent'::regdictionary, COALESCE(v_q, ci.name))))::numeric, 3) AS score,
           public.fn_product_code_key(s.sku) = ci.ref_key AS same_ref
    FROM public.services s
    WHERE s.organization_id = v_org AND NOT s.is_deleted AND s.deleted_at IS NULL
      AND (v_like IS NULL OR s.name ILIKE v_like OR s.sku ILIKE v_like)
  ),
  hits AS (
    SELECT b.*,
           CASE WHEN b.same_ref THEN 'supplier_ref_code' WHEN v_q IS NOT NULL THEN 'search' ELSE 'name' END AS reason
    FROM base b
    WHERE v_q IS NOT NULL OR b.same_ref OR b.score >= 0.20
    ORDER BY b.same_ref DESC, b.is_active DESC, b.score DESC, b.name, b.id
    LIMIT CASE WHEN v_q IS NULL THEN LEAST(v_limit, 5) ELSE v_limit END
  )
  SELECT jsonb_build_object(
           'catalog_item_id', ci.id,
           'items', COALESCE(jsonb_agg(jsonb_build_object(
             'service_id', h.id,
             'service_name', h.name,
             'service_sku', h.sku,
             'unidade', h.unidade,
             'is_active', h.is_active,
             'reason', h.reason,
             'score', CASE WHEN h.same_ref THEN 1 ELSE h.score END,
             'exact', h.same_ref,
             'item_supplier_id', (SELECT x.id FROM public.item_suppliers x
                                  WHERE x.service_id = h.id AND x.supplier_id = p_supplier_id AND x.deleted_at IS NULL LIMIT 1),
             'linked_to_other', EXISTS (SELECT 1 FROM public.item_suppliers x
                                        WHERE x.service_id = h.id AND x.supplier_id = p_supplier_id AND x.deleted_at IS NULL
                                          AND x.catalog_item_id IS NOT NULL AND x.catalog_item_id <> ci.id))
             ORDER BY h.same_ref DESC, h.is_active DESC, h.score DESC, h.name, h.id), '[]'::jsonb))
  INTO v_res
  FROM hits h;

  RETURN v_res;
END;
$function$;
REVOKE ALL ON FUNCTION public.rpc_catalog_service_search(uuid, uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_catalog_service_search(uuid, uuid, text, integer) TO authenticated, service_role;

-- Nova: ligar um serviço do fornecedor a um serviço nosso (item_suppliers item_type='service').
-- Mesma forma que rpc_catalog_link: reaproveita a associação (serviço, fornecedor) livre ou cria;
-- preço do catálogo só com services.manage_prices; sem custo de produto (é um serviço).
CREATE OR REPLACE FUNCTION public.rpc_catalog_link_service(p_supplier_id uuid, p_catalog_item_id uuid, p_service_id uuid, p_apply_catalog_price boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org      uuid := public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.view');
  v_actor    uuid := public.current_business_user_id();
  l          public.supplier_account_links;
  ci         public.supplier_catalog_items;
  s          record;
  isup       public.item_suppliers;
  v_other    record;
  v_created  boolean := false;
  v_warn     jsonb := '[]'::jsonb;
  v_price    boolean := COALESCE(p_apply_catalog_price, true);
  v_use_price boolean;
  v_old_price numeric;
  v_old_ccy  text;
  v_price_upd boolean := false;
  v_pref     boolean;
BEGIN
  IF NOT public.has_anew_permission(auth.uid(), 'services.edit') THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (services.edit)' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  SELECT * INTO l FROM public.supplier_account_links WHERE supplier_id = p_supplier_id AND status = 'active';
  IF l.id IS NULL THEN
    RAISE EXCEPTION 'Este fornecedor não está ligado ao portal' USING ERRCODE = 'no_data_found', HINT = 'not_linked';
  END IF;
  SELECT * INTO ci FROM public.supplier_catalog_items WHERE id = p_catalog_item_id AND supplier_account_id = l.supplier_account_id;
  IF ci.id IS NULL THEN
    RAISE EXCEPTION 'Artigo do catálogo não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF ci.item_kind <> 'servico' THEN
    RAISE EXCEPTION 'Este artigo é um produto: ligue-o a um produto nosso' USING ERRCODE = 'check_violation', HINT = 'kind_mismatch';
  END IF;
  SELECT id, name, sku INTO s FROM public.services
  WHERE id = p_service_id AND organization_id = v_org AND NOT is_deleted AND deleted_at IS NULL
  FOR NO KEY UPDATE;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'Serviço não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  IF v_price AND ci.base_price IS NOT NULL
     AND NOT public.has_anew_permission(auth.uid(), 'services.manage_prices') THEN
    RAISE EXCEPTION 'Sem permissão para alterar preços: liga sem usar o preço do catálogo'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_price_permission';
  END IF;
  v_use_price := v_price AND ci.base_price IS NOT NULL;

  PERFORM pg_advisory_xact_lock(hashtextextended('catalog_link:' || p_supplier_id::text, 0));
  PERFORM set_config('app.audit_source', 'supplier_catalog', true);

  -- Este artigo já está ligado?
  SELECT * INTO isup FROM public.item_suppliers
  WHERE supplier_id = p_supplier_id AND catalog_item_id = ci.id AND deleted_at IS NULL;
  IF isup.id IS NOT NULL THEN
    IF isup.service_id = s.id THEN
      RETURN jsonb_build_object('item_supplier_id', isup.id, 'created', false, 'already_linked', true,
                                'codes', '[]'::jsonb, 'warnings', '[]'::jsonb, 'service_id', s.id,
                                'item_supplier_price_updated', false, 'product_cost_updated', false,
                                'product_cost_reason', 'already_linked', 'product_cost_message', NULL);
    END IF;
    SELECT COALESCE(pr.name, sv.name) AS name, COALESCE(pr.sku, sv.sku) AS sku INTO v_other
    FROM (SELECT 1) x
    LEFT JOIN public.products pr ON pr.id = isup.product_id
    LEFT JOIN public.services sv ON sv.id = isup.service_id;
    RAISE EXCEPTION 'A referência «%» já está ligada a «%» (%)', ci.supplier_ref, v_other.name, v_other.sku
      USING ERRCODE = 'unique_violation', HINT = 'conflict';
  END IF;

  -- Associação (serviço, fornecedor) existente? (única por item_suppliers_service_supplier_active_uniq)
  SELECT * INTO isup FROM public.item_suppliers
  WHERE service_id = s.id AND supplier_id = p_supplier_id AND deleted_at IS NULL
  FOR UPDATE;

  IF isup.id IS NOT NULL THEN
    IF isup.catalog_item_id IS NOT NULL THEN
      SELECT supplier_ref INTO v_other FROM public.supplier_catalog_items WHERE id = isup.catalog_item_id;
      RAISE EXCEPTION 'Este serviço já está ligado a outra referência do catálogo («%»)', v_other.supplier_ref
        USING ERRCODE = 'unique_violation', HINT = 'conflict';
    END IF;
    IF isup.supplier_sku IS NOT NULL AND public.fn_product_code_key(isup.supplier_sku) IS DISTINCT FROM ci.ref_key THEN
      v_warn := v_warn || jsonb_build_array(format('Referência do fornecedor alterada de «%s» para «%s»', isup.supplier_sku, ci.supplier_ref));
    END IF;
    v_old_price := isup.purchase_price;
    v_old_ccy := isup.currency;
    UPDATE public.item_suppliers SET
      catalog_item_id = ci.id,
      supplier_sku = ci.supplier_ref,
      purchase_price = CASE WHEN v_use_price THEN round(ci.base_price, 2) ELSE purchase_price END,
      currency = CASE WHEN v_use_price THEN ci.currency ELSE currency END,
      preco_data = CASE WHEN v_use_price THEN current_date ELSE preco_data END,
      lead_time_days = COALESCE(lead_time_days, ci.mobilization_days),
      updated_at = now()
    WHERE id = isup.id
    RETURNING * INTO isup;
    v_price_upd := v_use_price
                   AND (isup.purchase_price IS DISTINCT FROM v_old_price OR isup.currency IS DISTINCT FROM v_old_ccy);
  ELSE
    v_pref := NOT EXISTS (SELECT 1 FROM public.item_suppliers WHERE service_id = s.id AND deleted_at IS NULL);
    INSERT INTO public.item_suppliers (
      organization_id, item_type, service_id, supplier_id, supplier_sku, purchase_price,
      currency, lead_time_days, is_preferred, is_active, created_by, catalog_item_id, preco_data
    ) VALUES (
      v_org, 'service', s.id, p_supplier_id, ci.supplier_ref,
      CASE WHEN v_use_price THEN round(ci.base_price, 2) END, ci.currency, ci.mobilization_days,
      v_pref, true, v_actor, ci.id, CASE WHEN v_use_price THEN current_date END
    ) RETURNING * INTO isup;
    v_created := true;
    v_price_upd := v_use_price;
  END IF;

  -- Ligado deixa de estar "dispensado".
  DELETE FROM public.supplier_catalog_dismissals WHERE link_id = l.id AND catalog_item_id = ci.id;

  RETURN jsonb_build_object(
    'item_supplier_id', isup.id,
    'service_id', s.id,
    'created', v_created,
    'already_linked', false,
    'is_preferred', isup.is_preferred,
    'codes', '[]'::jsonb,
    'warnings', v_warn,
    'item_supplier_price_updated', v_price_upd,
    'product_cost_updated', false,
    'product_cost_rows', 0,
    'product_cost_reason', 'not_product',
    'product_cost_message', NULL,
    'new_unit_cost', NULL,
    'units_per_purchase_uom', NULL
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.rpc_catalog_link_service(uuid, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_catalog_link_service(uuid, uuid, uuid, boolean) TO authenticated, service_role;

-- Vivo + 'service' (o serviço nosso ligado) e 'item_kind' do artigo, para os pedidos de preço de serviços.
CREATE OR REPLACE FUNCTION public.rpc_price_changes_list(p_supplier_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'pending'::text, p_product_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_status text := lower(COALESCE(NULLIF(btrim(p_status), ''), 'pending'));
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 100), 0), 500);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_orgs   uuid[];
  v_counts jsonb;
  v_total  integer;
  v_items  jsonb;
BEGIN
  IF v_uid IS NULL OR public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF v_status NOT IN ('pending', 'approved', 'rejected', 'superseded', 'decided', 'all') THEN
    RAISE EXCEPTION 'Estado inválido (pending, approved, rejected, superseded, decided, all)'
      USING ERRCODE = 'check_violation', HINT = 'validation';
  END IF;

  IF p_supplier_id IS NOT NULL THEN
    PERFORM public.fn_sp_crm_supplier_org(p_supplier_id, 'suppliers.view');
  ELSIF NOT public.has_anew_permission(v_uid, 'suppliers.view') THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (suppliers.view)'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;
  IF NOT (public.has_anew_permission(v_uid, 'suppliers.view_pricing')
          OR public.has_anew_permission(v_uid, 'products.view_cost')) THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (suppliers.view_pricing)'
      USING ERRCODE = 'insufficient_privilege', HINT = 'no_permission';
  END IF;

  v_orgs := ARRAY(SELECT public.get_user_visible_org_ids(v_uid));
  IF p_organization_id IS NOT NULL AND NOT (p_organization_id = ANY (v_orgs)) THEN
    RAISE EXCEPTION 'Empresa não encontrada' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;
  IF p_product_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.products pr
       WHERE pr.id = p_product_id
         AND (pr.organization_id = ANY (v_orgs)
              OR EXISTS (SELECT 1 FROM public.product_organizations po
                         WHERE po.product_id = pr.id AND po.organization_id = ANY (v_orgs)))) THEN
    RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'no_data_found', HINT = 'not_found';
  END IF;

  WITH sc AS (
    SELECT r.*
    FROM public.supplier_price_change_requests r
    WHERE r.organization_id = ANY (v_orgs)
      AND (p_supplier_id IS NULL OR r.supplier_id = p_supplier_id)
      AND (p_product_id IS NULL OR r.product_id = p_product_id)
      AND (p_organization_id IS NULL OR r.organization_id = p_organization_id)
  ),
  f AS (
    SELECT sc.* FROM sc
    WHERE v_status = 'all' OR sc.status = v_status
       OR (v_status = 'decided' AND sc.status IN ('approved', 'rejected'))
  ),
  page AS (
    SELECT f.* FROM f
    ORDER BY f.requested_at DESC, f.id
    LIMIT v_limit OFFSET v_offset
  )
  SELECT
    (SELECT jsonb_build_object(
              'pending', count(*) FILTER (WHERE status = 'pending'),
              'approved', count(*) FILTER (WHERE status = 'approved'),
              'rejected', count(*) FILTER (WHERE status = 'rejected'),
              'superseded', count(*) FILTER (WHERE status = 'superseded'))
       FROM sc),
    (SELECT count(*) FROM f),
    (SELECT COALESCE(jsonb_agg(x.item ORDER BY x.requested_at DESC, x.id), '[]'::jsonb)
       FROM (
         SELECT pg.requested_at, pg.id,
                jsonb_build_object(
                  'id', pg.id,
                  'status', pg.status,
                  'organization_id', pg.organization_id,
                  'requested_at', pg.requested_at,
                  'batch_id', pg.batch_id,
                  'supplier', jsonb_build_object('id', s.id, 'name', s.name),
                  'catalog_item', jsonb_build_object(
                    'id', ci.id, 'supplier_ref', ci.supplier_ref, 'name', ci.name, 'is_active', ci.is_active,
                    'item_kind', ci.item_kind),
                  'item_supplier_id', pg.item_supplier_id,
                  'product', CASE WHEN pr.id IS NULL THEN NULL
                                  ELSE jsonb_build_object('id', pr.id, 'name', pr.name, 'sku', pr.sku) END,
                  -- 20270103600000: ligação a um serviço nosso
                  'service', CASE WHEN sv.id IS NULL THEN NULL
                                  ELSE jsonb_build_object('id', sv.id, 'name', sv.name, 'sku', sv.sku) END,
                  'purchase_uom', jsonb_build_object('id', isup.uom_id, 'code', um.code),
                  'is_preferred', COALESCE(isup.is_preferred AND isup.is_active, false),
                  'current_price', isup.purchase_price,
                  'current_currency', isup.currency,
                  'old_price', pg.old_price,
                  'new_price', pg.new_price,
                  'currency', pg.currency,
                  'catalog_old_price', pg.catalog_old_price,
                  'catalog_new_price', pg.catalog_new_price,
                  'diff', CASE WHEN isup.purchase_price IS NOT NULL THEN pg.new_price - isup.purchase_price END,
                  'diff_pct', CASE WHEN isup.purchase_price > 0
                                   THEN round((pg.new_price - isup.purchase_price) / isup.purchase_price * 100, 2) END,
                  'unit_changed', pg.unit_changed,
                  'old_unit_label', pg.old_unit_label,
                  'unit_label', pg.unit_label,
                  'old_units_per_pack', pg.old_units_per_pack,
                  'units_per_pack', pg.units_per_pack,
                  'stale', (isup.id IS NULL OR isup.deleted_at IS NOT NULL
                            OR isup.catalog_item_id IS DISTINCT FROM pg.catalog_item_id
                            OR isup.supplier_id IS DISTINCT FROM pg.supplier_id),
                  'already_applied', (isup.purchase_price IS NOT DISTINCT FROM pg.new_price
                                      AND isup.currency IS NOT DISTINCT FROM pg.currency),
                  'product_cost', CASE WHEN pg.status = 'pending'
                                       -- Preço do catálogo: o plano divide por N nas embalagens ligadas à unidade.
                                       THEN public.fn_price_change_cost_plan(pg.item_supplier_id, pg.organization_id,
                                                                             CASE WHEN pg.catalog_new_price IS NOT NULL
                                                                                   AND COALESCE(pg.units_per_pack, 1) > 1
                                                                                  THEN pg.catalog_new_price ELSE pg.new_price END,
                                                                             pg.currency) END,
                  'decided_at', pg.decided_at,
                  'decided_by', CASE WHEN du.id IS NULL THEN NULL
                                     ELSE jsonb_build_object('id', du.id, 'name', du.name) END,
                  'decision_note', pg.decision_note,
                  'superseded_at', pg.superseded_at,
                  'superseded_by', pg.superseded_by,
                  'result', pg.result
                ) AS item
         FROM page pg
         JOIN public.suppliers s ON s.id = pg.supplier_id
         JOIN public.supplier_catalog_items ci ON ci.id = pg.catalog_item_id
         LEFT JOIN public.item_suppliers isup ON isup.id = pg.item_supplier_id
         LEFT JOIN public.uom um ON um.id = isup.uom_id
         LEFT JOIN public.products pr ON pr.id = pg.product_id
         LEFT JOIN public.services sv ON sv.id = isup.service_id
         LEFT JOIN public.anew_users du ON du.id = pg.decided_by
       ) x)
  INTO v_counts, v_total, v_items;

  RETURN jsonb_build_object(
    'counts', v_counts,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'items', v_items,
    'can_decide', public.has_anew_permission(v_uid, 'products.edit')
                  AND public.has_anew_permission(v_uid, 'products.manage_prices')
  );
END;
$function$;

-- ═══ 6. Permissões dos auxiliares (só uso interno, dentro das RPCs definer) ═══
REVOKE ALL ON FUNCTION public.fn_sp_service_unit(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_sp_jsonb_textarr(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_sp_catalog_distritos(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_sp_catalog_kind_errors(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_sp_catalog_kind_normalize() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sp_service_unit(text), public.fn_sp_jsonb_textarr(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_sp_catalog_distritos(jsonb), public.fn_sp_catalog_kind_errors(text, text, jsonb),
                          public.fn_sp_catalog_kind_normalize() TO service_role;

NOTIFY pgrst, 'reload schema';
