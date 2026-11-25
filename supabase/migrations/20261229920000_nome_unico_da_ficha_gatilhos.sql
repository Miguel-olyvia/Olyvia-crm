-- =============================================================================
-- Nome unico da ficha, PARTE 2 de 2 (base PRINCIPAL): os gatilhos.
-- Depende da parte 1 (20261229910000_nome_unico_da_ficha: company_name e
-- fn_entity_compose_name / fn_entity_display_name).
--
-- O que faz:
--   1. gatilho BEFORE trg_anew_entities_0_display_name (o «0» corre antes de
--      trg_anew_entities_search_text, por ordem alfabetica):
--        INSERT: so preenche o display_name quando vem vazio;
--        UPDATE (OF first_name, last_name, company_name, type): recompoe SO se
--          (a) o UPDATE nao mudou o proprio display_name, E
--          (b) o tipo NAO mudou (mudar de tipo e so pela RPC, que escreve o
--              nome explicitamente), E
--          (c) MUDOU O VALOR de um campo que ja tinha valor: Pessoa -> o nome
--              E o apelido antigos estavam ambos preenchidos e um deles mudou;
--              Empresa -> a empresa antiga estava preenchida e mudou.
--              PREENCHER o que faltava (ficha «Rui» que recebe o apelido
--              «Silva» de uma lead nova ou do update-lead) NAO renomeia, E
--          (d) a ficha estava em sincronia: o display_name antigo, normalizado,
--              era a composicao ESTRITA antiga, E
--          (e) a composicao nova e diferente e nao vazia, SEM contar
--              maiusculas: «Rui» -> «rui» nao renomeia.
--        Fichas fora de sincronia nunca se tocam; um display_name explicito
--        e respeitado.
--      A PROVA DE FALHA: o corpo corre num bloco BEGIN ... EXCEPTION WHEN
--      OTHERS. Se alguma coisa rebentar, o gatilho levanta um WARNING com o
--      erro e devolve a linha com o display_name como veio. Uma gravacao de
--      ficha (de qualquer organizacao, Mudelar incluida) nunca e bloqueada
--      por este gatilho. Custo: um subbloco por linha gravada em anew_entities
--      com estas colunas; nao escreve nada, por isso nao consome xid.
--   2. os tres gatilhos que mantem o search_text (da ficha, das leads e dos
--      clientes) passam a escutar tambem company_name e type, porque um UPDATE
--      so da empresa pode agora mudar o nome. Mesmas funcoes (20261113150000,
--      20261111130000, 20261113100000, as versoes mais recentes); so a lista
--      de colunas muda; nenhuma funcao nova e chamada por eles, e continuam a
--      ler so display_name/first_name/last_name (nada se alarga).
--
-- Conferir: existencia, ordem, eventos e funcao dos quatro gatilhos, e a regra
-- POSTA A CORRER numa tabela TEMPORARIA (ON COMMIT DROP, largada no fim) com a
-- mesma funcao de gatilho. Nao se grava nenhuma ficha em anew_entities: uma
-- ficha de teste dispararia a auditoria e os outros gatilhos da tabela, que
-- precisam de contexto de sessao, e o objectivo e nunca deixar linhas.
--
-- SUPOSICAO (so migrations lidas): os tres gatilhos do search_text estao como
-- nas migrations citadas; o db push corre o ficheiro numa transaccao.
-- Reversao: fora da pasta das migrations.
-- =============================================================================

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- 1. Gatilho da ficha ---------------------------------------------------------------------
-- SECURITY DEFINER so para chamar as funcoes puras (revogadas a anon e
-- authenticated); nao le nem escreve nenhuma tabela, so mexe no NEW.
CREATE FUNCTION public.fn_anew_entities_display_name_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_incoming text := NEW.display_name;
  v_old_norm text;
  v_old_comp text;
  v_new_comp text;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      IF btrim(regexp_replace(coalesce(NEW.display_name, ''), '[\s\u00a0]+', ' ', 'g'), ' ') = '' THEN
        NEW.display_name := public.fn_entity_display_name(
          NEW.type, NEW.first_name, NEW.last_name, NEW.company_name, NEW.display_name);
      END IF;
      RETURN NEW;
    END IF;

    -- (a) display_name explicito no UPDATE: respeitado.
    IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
      RETURN NEW;
    END IF;

    -- (b) mudar de tipo nao recompoe (e pela RPC, com nome explicito).
    IF NEW.type IS DISTINCT FROM OLD.type THEN
      RETURN NEW;
    END IF;

    -- (c) so a MUDANCA de um valor que ja existia recompoe; preencher o que
    --     faltava nao renomeia.
    IF OLD.type = 'person' THEN
      IF btrim(regexp_replace(coalesce(OLD.first_name, ''), '[\s\u00a0]+', ' ', 'g'), ' ') = ''
         OR btrim(regexp_replace(coalesce(OLD.last_name, ''), '[\s\u00a0]+', ' ', 'g'), ' ') = ''
         OR (NEW.first_name IS NOT DISTINCT FROM OLD.first_name
             AND NEW.last_name IS NOT DISTINCT FROM OLD.last_name) THEN
        RETURN NEW;
      END IF;
    ELSIF OLD.type = 'organization' THEN
      IF btrim(regexp_replace(coalesce(OLD.company_name, ''), '[\s\u00a0]+', ' ', 'g'), ' ') = ''
         OR NEW.company_name IS NOT DISTINCT FROM OLD.company_name THEN
        RETURN NEW;
      END IF;
    ELSE
      RETURN NEW;
    END IF;

    -- (d) a ficha estava em sincronia (composicao estrita)?
    v_old_norm := btrim(regexp_replace(coalesce(OLD.display_name, ''), '[\s\u00a0]+', ' ', 'g'), ' ');
    v_old_comp := public.fn_entity_compose_name(OLD.type, OLD.first_name, OLD.last_name, OLD.company_name);
    IF v_old_comp IS NULL OR v_old_comp <> v_old_norm THEN
      RETURN NEW;
    END IF;

    -- (e) a composicao nova difere (sem contar maiusculas)?
    v_new_comp := public.fn_entity_compose_name(NEW.type, NEW.first_name, NEW.last_name, NEW.company_name);
    IF v_new_comp IS NOT NULL AND lower(v_new_comp) <> lower(v_old_norm) THEN
      NEW.display_name := v_new_comp;
    END IF;
    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    -- A prova de falha: a gravacao segue, com o nome como veio.
    RAISE WARNING 'fn_anew_entities_display_name_trigger (ficha %): % (%); nome deixado como veio',
      NEW.id, SQLERRM, SQLSTATE;
    NEW.display_name := v_incoming;
    RETURN NEW;
  END;
END;
$$;

COMMENT ON FUNCTION public.fn_anew_entities_display_name_trigger() IS
  'Nome da ficha pelo tipo: preenche o display_name vazio no INSERT; no UPDATE so recompoe uma ficha em sincronia cujo nome/apelido/empresa existente mudou de valor. A prova de falha: em erro, WARNING e a linha segue com o nome como veio.';

REVOKE ALL ON FUNCTION public.fn_anew_entities_display_name_trigger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_anew_entities_display_name_trigger() TO service_role;

CREATE TRIGGER trg_anew_entities_0_display_name
  BEFORE INSERT OR UPDATE OF first_name, last_name, company_name, type
  ON public.anew_entities
  FOR EACH ROW EXECUTE FUNCTION public.fn_anew_entities_display_name_trigger();

-- 2. Os gatilhos do search_text escutam tambem company_name e type -------------------------
-- Mesmas funcoes; so a lista de colunas. As funcoes de sincronizacao comparam
-- display_name/first_name/last_name com o OLD, por isso um UPDATE da empresa
-- que nao mude o nome continua a nao fazer nada.
DROP TRIGGER IF EXISTS trg_anew_entities_search_text ON public.anew_entities;
CREATE TRIGGER trg_anew_entities_search_text
  BEFORE INSERT OR UPDATE OF display_name, first_name, last_name, company_name, type ON public.anew_entities
  FOR EACH ROW EXECUTE FUNCTION public.anew_entities_search_text_trigger();

DROP TRIGGER IF EXISTS trg_anew_entities_sync_leads_search_text ON public.anew_entities;
CREATE TRIGGER trg_anew_entities_sync_leads_search_text
  AFTER UPDATE OF display_name, first_name, last_name, company_name, type ON public.anew_entities
  FOR EACH ROW EXECUTE FUNCTION public.anew_entities_sync_leads_search_text_trigger();

DROP TRIGGER IF EXISTS trg_anew_entities_sync_clients_search_text ON public.anew_entities;
CREATE TRIGGER trg_anew_entities_sync_clients_search_text
  AFTER UPDATE OF display_name, first_name, last_name, company_name, type ON public.anew_entities
  FOR EACH ROW EXECUTE FUNCTION public.anew_entities_sync_clients_search_text_trigger();

-- 3. Conferir ---------------------------------------------------------------------------------
DO $$
DECLARE
  v_txt text;
  v_got text;
BEGIN
  -- 3a. Os quatro gatilhos: nomes (o do nome antes do do search_text), activos,
  --     eventos e colunas, e a funcao certa.
  --     A ordem dos BEFORE e alfabetica: '0' < 's' (trg_anew_entities_0_... antes
  --     de trg_anew_entities_search_text) e fixa pelos proprios nomes.
  SELECT string_agg(e.name, ', ' ORDER BY e.name) INTO v_txt
    FROM (VALUES
      ('trg_anew_entities_0_display_name',
       '%BEFORE INSERT OR UPDATE OF first_name, last_name, company_name, type ON %anew_entities FOR EACH ROW EXECUTE FUNCTION %fn_anew_entities_display_name_trigger()'),
      ('trg_anew_entities_search_text',
       '%BEFORE INSERT OR UPDATE OF display_name, first_name, last_name, company_name, type ON %anew_entities FOR EACH ROW EXECUTE FUNCTION %anew_entities_search_text_trigger()'),
      ('trg_anew_entities_sync_leads_search_text',
       '%AFTER UPDATE OF display_name, first_name, last_name, company_name, type ON %anew_entities FOR EACH ROW EXECUTE FUNCTION %anew_entities_sync_leads_search_text_trigger()'),
      ('trg_anew_entities_sync_clients_search_text',
       '%AFTER UPDATE OF display_name, first_name, last_name, company_name, type ON %anew_entities FOR EACH ROW EXECUTE FUNCTION %anew_entities_sync_clients_search_text_trigger()')
    ) AS e(name, pat)
   WHERE NOT EXISTS (
     SELECT 1
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname::text = 'public' AND c.relname::text = 'anew_entities'
        AND NOT t.tgisinternal
        AND t.tgname::text = e.name
        AND t.tgenabled::text = 'O'
        AND pg_get_triggerdef(t.oid) LIKE e.pat);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: gatilhos da ficha em falta, inactivos ou com outra definicao: %', v_txt;
  END IF;

  -- 3b. A funcao: uma so, DEFINER, search_path fixo, a prova de falha, revogada.
  SELECT count(*)::text INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public' AND p.proname::text = 'fn_anew_entities_display_name_trigger'
     AND p.prosecdef
     AND EXISTS (SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search\_path=%')
     AND p.prosrc ~* 'EXCEPTION\s+WHEN\s+OTHERS\s+THEN'
     AND p.prosrc ~* 'RAISE\s+WARNING';
  IF v_txt IS DISTINCT FROM '1'
     OR has_function_privilege('authenticated', 'public.fn_anew_entities_display_name_trigger()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_anew_entities_display_name_trigger()', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: fn_anew_entities_display_name_trigger em falta, duplicada, sem a prova de falha ou com permissoes erradas';
  END IF;

  -- 3c. A regra A CORRER, numa tabela temporaria com a mesma funcao de gatilho.
  --     Nada se grava em anew_entities; a tabela larga-se no fim (e ON COMMIT
  --     DROP se algo falhar antes). Se a funcao rebentasse, a prova de falha
  --     deixaria o nome como veio e os casos de renomear falhariam aqui.
  CREATE TEMP TABLE nome_unico_prova (
    id           int PRIMARY KEY,
    type         text,
    display_name text,
    first_name   text,
    last_name    text,
    company_name text
  ) ON COMMIT DROP;
  CREATE TRIGGER nome_unico_prova_trg
    BEFORE INSERT OR UPDATE OF first_name, last_name, company_name, type ON nome_unico_prova
    FOR EACH ROW EXECUTE FUNCTION public.fn_anew_entities_display_name_trigger();

  INSERT INTO nome_unico_prova VALUES
    (1, 'person',       '  ',          'Rui',  'Silva', NULL),         -- vazio: compoe
    (2, 'person',       'Sr. Rui',     'Rui',  'Silva', NULL),         -- fornecido: fica
    (3, 'person',       'Rui',         'Rui',  NULL,    NULL),         -- sem apelido
    (4, 'person',       'Rui Silva',   'Rui',  'Silva', 'EVOLAR LDA'),
    (5, 'organization', 'EVOLAR LDA',  'Rui',  'Silva', 'EVOLAR LDA'),
    (6, 'person',       'EVOLAR LDA',  'Rui',  'Silva', NULL),         -- fora de sincronia
    (7, 'organization', 'Mudar Lda',   NULL,   NULL,    NULL),         -- empresa por registar
    (8, 'person',       'Rui Silva',   'Rui',  'Silva', NULL),
    (9, 'person',       'Rui Silva',   'Rui',  'Silva', NULL);

  UPDATE nome_unico_prova SET last_name = 'Costa' WHERE id IN (1, 6);          -- 1 renomeia; 6 nao
  UPDATE nome_unico_prova SET last_name = 'Silva' WHERE id = 3;                -- preencher: nao
  UPDATE nome_unico_prova SET type = 'organization' WHERE id = 4;              -- tipo: nao
  UPDATE nome_unico_prova SET company_name = 'NOVA LDA' WHERE id = 5;          -- empresa: renomeia
  UPDATE nome_unico_prova SET company_name = 'Outra' WHERE id = 7;             -- preencher: nao
  UPDATE nome_unico_prova SET first_name = 'rui', last_name = 'silva' WHERE id = 8; -- maiusculas: nao
  UPDATE nome_unico_prova SET last_name = 'Lopes', display_name = 'Sr. Rui' WHERE id = 9; -- explicito

  SELECT string_agg(id::text || '=' || coalesce(display_name, '(null)'), ';' ORDER BY id) INTO v_got
    FROM nome_unico_prova;
  DROP TABLE nome_unico_prova;

  IF v_got IS DISTINCT FROM
     '1=Rui Costa;2=Sr. Rui;3=Rui;4=Rui Silva;5=NOVA LDA;6=EVOLAR LDA;7=Mudar Lda;8=Rui Silva;9=Sr. Rui' THEN
    RAISE EXCEPTION 'CONFERIR: o gatilho do nome nao cumpre os casos do desenho: %', coalesce(v_got, '(nada)');
  END IF;
END $$;
