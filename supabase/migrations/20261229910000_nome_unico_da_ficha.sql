-- =============================================================================
-- Nome unico da ficha, parte 1 de 2 (base PRINCIPAL): coluna e funcoes puras.
--
-- Rapida e inofensiva: so metadados. Nao preenche nada, nao cria gatilhos e
-- nao muda nenhum display_name. A parte 2 (20261229920000) preenche
-- company_name e cria os gatilhos.
--
--   1. anew_entities.company_name: opcional, sem default (ADD COLUMN so mexe
--      no catalogo, nao reescreve a tabela; o ACCESS EXCLUSIVE dura o tempo
--      do catalogo);
--   2. fn_entity_display_name: a regra (empresa; senao, numa pessoa, nome +
--      apelido como o composeDisplayName do ecra; senao NULL = «nao ha regra»);
--   3. fn_lead_company_from_field_values: a empresa de uma lead com as MESMAS
--      chaves, pela mesma ordem, do AnewLeadEditDialog (GENERAL_FIELD_ALIASES).
--
-- Espacos: os dois lados normalizam igual ao ecra (normalizeFirstLast /
-- nameFieldsChanged): espacos e NBSP colapsados num so espaco, e aparados.
--
-- SUPOSICAO (lido nas migrations, nao no catalogo do remoto): a coluna e as
-- duas funcoes nao existem la. ADD COLUMN sem IF NOT EXISTS de proposito: se a
-- coluna existir, a migration falha em vez de assumir.
-- Reversao: fora da pasta das migrations.
-- =============================================================================

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- 1. Coluna ---------------------------------------------------------------------
ALTER TABLE public.anew_entities ADD COLUMN company_name text;

COMMENT ON COLUMN public.anew_entities.company_name IS
  'Empresa da ficha (metadado). Registada a partir da empresa da lead por trg_anew_leads_sync_entity_company; nunca renomeia a ficha por si so.';

-- 2. A regra ----------------------------------------------------------------------
-- Espelho em TS: composeEntityDisplayName (src/lib/entityDisplayName.ts).
CREATE FUNCTION public.fn_entity_display_name(
  p_type text,
  p_first text,
  p_last text,
  p_company text
) RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN n.c <> '' THEN n.c
    WHEN p_type IS DISTINCT FROM 'person' THEN NULL
    WHEN n.f = '' AND n.l = '' THEN NULL
    WHEN n.f = '' THEN n.l
    WHEN n.l = '' THEN n.f
    WHEN lower(n.f) = lower(n.l) THEN n.f
    WHEN starts_with(lower(n.l), lower(n.f) || ' ') THEN n.l
    WHEN right(lower(n.f), char_length(lower(n.l)) + 1) = ' ' || lower(n.l) THEN n.f
    ELSE n.f || ' ' || n.l
  END
  FROM (
    SELECT
      btrim(regexp_replace(coalesce(p_first, ''),   '[\s\u00a0]+', ' ', 'g'), ' ') AS f,
      btrim(regexp_replace(coalesce(p_last, ''),    '[\s\u00a0]+', ' ', 'g'), ' ') AS l,
      btrim(regexp_replace(coalesce(p_company, ''), '[\s\u00a0]+', ' ', 'g'), ' ') AS c
  ) AS n;
$$;

COMMENT ON FUNCTION public.fn_entity_display_name(text, text, text, text) IS
  'Nome da ficha: empresa se houver; senao, numa pessoa, nome + apelido (composeDisplayName); senao NULL (nao ha regra).';

-- 3. Empresa de uma lead ------------------------------------------------------------
--   NULL  -> nenhuma das chaves existe;
--   ''    -> a chave existe mas esta vazia;
--   texto -> a primeira chave com valor (sem normalizar).
CREATE FUNCTION public.fn_lead_company_from_field_values(p_field_values jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_key text;
  v_val jsonb;
  v_has_key boolean := false;
BEGIN
  IF p_field_values IS NULL OR jsonb_typeof(p_field_values) <> 'object' THEN
    RETURN NULL;
  END IF;

  FOREACH v_key IN ARRAY ARRAY['company_name', 'empresa', 'company', 'nome_empresa', 'organizacao', 'organização']
  LOOP
    IF p_field_values ? v_key THEN
      v_has_key := true;
      v_val := p_field_values -> v_key;
      IF jsonb_typeof(v_val) = 'null'
         OR (jsonb_typeof(v_val) = 'string' AND (v_val #>> '{}') = '') THEN
        CONTINUE;
      END IF;
      IF jsonb_typeof(v_val) = 'object' THEN
        RETURN coalesce(nullif(v_val ->> 'address_line1', ''),
                        nullif(v_val ->> 'street', ''),
                        nullif(v_val ->> 'value', ''),
                        '');
      END IF;
      RETURN v_val #>> '{}';
    END IF;
  END LOOP;

  RETURN CASE WHEN v_has_key THEN '' ELSE NULL END;
END;
$$;

COMMENT ON FUNCTION public.fn_lead_company_from_field_values(jsonb) IS
  'Empresa de uma lead com as chaves do AnewLeadEditDialog. NULL = sem chave de empresa; vazio = chave sem valor.';

-- Internas: so os gatilhos (SECURITY DEFINER, parte 2) as chamam.
REVOKE ALL ON FUNCTION public.fn_entity_display_name(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_entity_display_name(text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.fn_lead_company_from_field_values(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_lead_company_from_field_values(jsonb) TO service_role;

-- 4. Conferir ----------------------------------------------------------------------
DO $$
DECLARE
  v_txt text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'anew_entities'
       AND column_name = 'company_name' AND is_nullable = 'YES' AND column_default IS NULL
  ) THEN
    RAISE EXCEPTION 'CONFERIR: anew_entities.company_name em falta, obrigatoria ou com default';
  END IF;

  SELECT string_agg(p.proname::text || '/' || p.pronargs::text, ',' ORDER BY p.proname::text COLLATE "C") INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND p.proname::text IN ('fn_entity_display_name', 'fn_lead_company_from_field_values')
     AND p.proconfig IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search\_path=%');
  IF v_txt IS DISTINCT FROM 'fn_entity_display_name/4,fn_lead_company_from_field_values/1' THEN
    RAISE EXCEPTION 'CONFERIR: funcoes puras em falta, duplicadas ou sem search_path: %', coalesce(v_txt, '(nenhuma)');
  END IF;

  IF has_function_privilege('anon', 'public.fn_entity_display_name(text, text, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_entity_display_name(text, text, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_lead_company_from_field_values(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_lead_company_from_field_values(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: funcoes puras abertas a anon/authenticated';
  END IF;

  -- Os mesmos casos do teste em TS (composeEntityDisplayName.test.ts)
  IF public.fn_entity_display_name('person', 'Rui', 'Silva', 'EVOLAR MOVEIS LDA') IS DISTINCT FROM 'EVOLAR MOVEIS LDA'
     OR public.fn_entity_display_name('person', '  Rui ', ' Silva  ', '   ') IS DISTINCT FROM 'Rui Silva'
     OR public.fn_entity_display_name('person', 'Rui' || chr(160) || chr(160) || 'Pedro', 'Silva', NULL) IS DISTINCT FROM 'Rui Pedro Silva'
     OR public.fn_entity_display_name('person', 'Rui Silva', 'Rui Silva', NULL) IS DISTINCT FROM 'Rui Silva'
     OR public.fn_entity_display_name('person', 'Rui', 'Rui Silva', NULL) IS DISTINCT FROM 'Rui Silva'
     OR public.fn_entity_display_name('person', 'Rui Silva', 'silva', NULL) IS DISTINCT FROM 'Rui Silva'
     OR public.fn_entity_display_name('organization', NULL, NULL, NULL) IS NOT NULL
     OR public.fn_entity_display_name('organization', 'Ana', 'Costa', NULL) IS NOT NULL
     OR public.fn_entity_display_name('person', '', NULL, '') IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: fn_entity_display_name nao cumpre os casos do desenho';
  END IF;

  IF public.fn_lead_company_from_field_values('{"nome":"Rui"}'::jsonb) IS NOT NULL
     OR public.fn_lead_company_from_field_values('{"empresa":""}'::jsonb) IS DISTINCT FROM ''
     OR public.fn_lead_company_from_field_values('{"company_name":"","empresa":"X"}'::jsonb) IS DISTINCT FROM 'X' THEN
    RAISE EXCEPTION 'CONFERIR: fn_lead_company_from_field_values nao le as chaves como o ecra';
  END IF;
END $$;
