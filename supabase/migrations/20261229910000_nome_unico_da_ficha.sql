-- =============================================================================
-- Nome unico da ficha (anew_entities.display_name), base PRINCIPAL.
--
-- Regra do dono: a ficha tem UM so nome, o display_name. Quando se edita o
-- nome, troca em todo o lado (os ecras leem o display_name); nunca ficam o
-- antigo e o novo. A empresa da lead NAO entra no nome.
--   * pessoa       -> nome + apelido (a deduplicacao do composeDisplayName);
--   * organizacao  -> o proprio nome (o display_name que la esta);
--   * um display_name escrito explicitamente por um fluxo ou utilizador e
--     respeitado.
--
-- O que faz: so uma funcao pura e um gatilho BEFORE na ficha. Sem coluna nova,
-- sem preenchimento de dados, sem LOCK TABLE: nenhum nome existente muda ao
-- aplicar. (O CREATE TRIGGER pede um lock curto de escrita na tabela, ate ao
-- commit; lock_timeout curto para nao ficar a espera.)
--
-- Gatilho trg_anew_entities_0_display_name (o «0» corre antes de
-- trg_anew_entities_search_text: os BEFORE do mesmo evento correm por ordem
-- alfabetica, e assim o search_text ja ve o nome final):
--   INSERT: so preenche o display_name quando vem vazio; um display_name
--           fornecido nunca e sobrescrito.
--   UPDATE (so em UPDATE OF first_name, last_name): recompoe nome + apelido SO
--     se (a) o UPDATE nao mudou o proprio display_name, E
--        (b) a ficha estava «em sincronia»: o display_name antigo, com os
--            espacos normalizados, era a composicao nome + apelido antiga, E
--        (c) a composicao nova e diferente.
--   Fichas fora de sincronia (nome de empresa, importado, concatenado, editado
--   a mao) nunca sao tocadas. Organizacoes: a regra devolve o proprio nome, por
--   isso nunca mudam por aqui.
--
-- Porque: os fluxos que so escrevem nome/apelido (create-lead, insert-lead,
-- update-lead, execute-workflow, backfill-entity-names) deixavam o
-- display_name antigo numa ficha em sincronia -- o nome mudava num sitio e
-- ficava o antigo noutro. Agora troca. As RPCs dos ecras (rpc_update_lead
-- 20261130140000, rpc_update_client 20261229500000) mandam o display_name
-- explicito: se muda, (a) respeita-o.
--
-- SUPOSICAO (so migrations lidas, nao o catalogo do remoto): a funcao e o
-- gatilho nao existem la; o db push corre o ficheiro numa transaccao (o SET
-- LOCAL depende disso).
-- Reversao: fora da pasta das migrations (larga o gatilho e as duas funcoes).
-- =============================================================================

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- 1. A regra -------------------------------------------------------------------------
-- Espelho em TS: entityDisplayNameRule (src/lib/entityNameSync.ts).
-- NULL = nao ha nome com que compor (pessoa sem nome nem apelido, ou nome vazio).
CREATE FUNCTION public.fn_entity_display_name(
  p_type text,
  p_first text,
  p_last text,
  p_display_name text
) RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_type IS DISTINCT FROM 'person' THEN nullif(n.d, '')
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
      btrim(regexp_replace(coalesce(p_first, ''),        '[\s\u00a0]+', ' ', 'g'), ' ') AS f,
      btrim(regexp_replace(coalesce(p_last, ''),         '[\s\u00a0]+', ' ', 'g'), ' ') AS l,
      btrim(regexp_replace(coalesce(p_display_name, ''), '[\s\u00a0]+', ' ', 'g'), ' ') AS d
  ) AS n;
$$;

COMMENT ON FUNCTION public.fn_entity_display_name(text, text, text, text) IS
  'Nome da ficha: pessoa = nome + apelido (composeDisplayName); organizacao = o proprio nome; NULL se nao ha nada.';

REVOKE ALL ON FUNCTION public.fn_entity_display_name(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_entity_display_name(text, text, text, text) TO service_role;

-- 2. Gatilho da ficha ----------------------------------------------------------------
-- SECURITY DEFINER so para chamar a funcao pura (revogada a anon/authenticated);
-- nao le nem escreve nenhuma tabela, so mexe no NEW.
CREATE FUNCTION public.fn_anew_entities_display_name_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_norm text;
  v_old_comp text;
  v_new_comp text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF btrim(regexp_replace(coalesce(NEW.display_name, ''), '[\s\u00a0]+', ' ', 'g'), ' ') = '' THEN
      NEW.display_name := coalesce(
        public.fn_entity_display_name(NEW.type, NEW.first_name, NEW.last_name, NEW.display_name),
        NEW.display_name);
    END IF;
    RETURN NEW;
  END IF;

  -- (a) display_name explicito no UPDATE: respeitado.
  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    RETURN NEW;
  END IF;
  IF NEW.first_name IS NOT DISTINCT FROM OLD.first_name
     AND NEW.last_name IS NOT DISTINCT FROM OLD.last_name THEN
    RETURN NEW;
  END IF;

  -- (b) a ficha estava em sincronia?
  v_old_norm := btrim(regexp_replace(coalesce(OLD.display_name, ''), '[\s\u00a0]+', ' ', 'g'), ' ');
  v_old_comp := public.fn_entity_display_name(OLD.type, OLD.first_name, OLD.last_name, OLD.display_name);
  IF v_old_comp IS NULL OR v_old_comp <> v_old_norm THEN
    RETURN NEW;
  END IF;

  -- (c) a composicao nova difere do nome antigo?
  v_new_comp := public.fn_entity_display_name(NEW.type, NEW.first_name, NEW.last_name, NEW.display_name);
  IF v_new_comp IS NOT NULL AND v_new_comp <> v_old_norm THEN
    NEW.display_name := v_new_comp;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_anew_entities_display_name_trigger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_anew_entities_display_name_trigger() TO service_role;

CREATE TRIGGER trg_anew_entities_0_display_name
  BEFORE INSERT OR UPDATE OF first_name, last_name
  ON public.anew_entities
  FOR EACH ROW EXECUTE FUNCTION public.fn_anew_entities_display_name_trigger();

-- 3. Conferir ------------------------------------------------------------------------
DO $$
DECLARE
  v_txt text;
BEGIN
  SELECT string_agg(t.tgname::text, ',' ORDER BY t.tgname::text COLLATE "C") INTO v_txt
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname::text = 'public' AND c.relname::text = 'anew_entities'
     AND NOT t.tgisinternal
     AND t.tgname::text IN ('trg_anew_entities_0_display_name', 'trg_anew_entities_search_text');
  IF v_txt IS DISTINCT FROM 'trg_anew_entities_0_display_name,trg_anew_entities_search_text' THEN
    RAISE EXCEPTION 'CONFERIR: gatilhos BEFORE da ficha fora de ordem ou em falta: %', coalesce(v_txt, '(nenhum)');
  END IF;

  SELECT string_agg(p.proname::text || '/' || p.pronargs::text || '/' || p.prosecdef::text, ','
                    ORDER BY p.proname::text COLLATE "C") INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND p.proname::text IN ('fn_entity_display_name', 'fn_anew_entities_display_name_trigger')
     AND p.proconfig IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search\_path=%');
  IF v_txt IS DISTINCT FROM 'fn_anew_entities_display_name_trigger/0/true,fn_entity_display_name/4/false' THEN
    RAISE EXCEPTION 'CONFERIR: funcoes em falta, duplicadas ou sem search_path: %', coalesce(v_txt, '(nenhuma)');
  END IF;

  IF has_function_privilege('anon', 'public.fn_entity_display_name(text, text, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_entity_display_name(text, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: fn_entity_display_name aberta a anon/authenticated';
  END IF;

  -- Os mesmos casos do teste em TS (entityNameSync.test.ts)
  IF public.fn_entity_display_name('person', 'Rui', 'Silva', 'qualquer') IS DISTINCT FROM 'Rui Silva'
     OR public.fn_entity_display_name('person', '  Rui ', ' Silva  ', NULL) IS DISTINCT FROM 'Rui Silva'
     OR public.fn_entity_display_name('person', 'Rui' || chr(160) || chr(160) || 'Pedro', 'Silva', NULL) IS DISTINCT FROM 'Rui Pedro Silva'
     OR public.fn_entity_display_name('person', 'Rui Silva', 'Rui Silva', NULL) IS DISTINCT FROM 'Rui Silva'
     OR public.fn_entity_display_name('person', 'Rui', 'Rui Silva', NULL) IS DISTINCT FROM 'Rui Silva'
     OR public.fn_entity_display_name('person', 'Rui Silva', 'silva', NULL) IS DISTINCT FROM 'Rui Silva'
     OR public.fn_entity_display_name('person', '', NULL, 'EVOLAR LDA') IS NOT NULL
     OR public.fn_entity_display_name('organization', 'Ana', 'Costa', ' Mudar  Lda ') IS DISTINCT FROM 'Mudar Lda'
     OR public.fn_entity_display_name('organization', NULL, NULL, '  ') IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: fn_entity_display_name nao cumpre os casos do desenho';
  END IF;
END $$;
