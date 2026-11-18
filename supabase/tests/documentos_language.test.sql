-- ============================================================
-- Teste: 20261229540000_documentos_language.sql (base PRINCIPAL, tzbfgwpckrfbqcolqxtm)
-- ============================================================
-- Tudo dentro de BEGIN ... ROLLBACK, so na organizacao nike (b6ffce4f-f630-4933-833a-008649757a33).
-- Cria 1 proposta e 1 contrato proprios (titulo/notas "TESTE language"), mexe-lhes e desfaz tudo.
-- Leituras fora da nike: so catalogo (information_schema / pg_catalog) e um NOT EXISTS sobre
-- anew_memberships para escolher um utilizador que SO pertence a nike.
--
-- Correr (a partir de C:/my-crm-dream-main/projeto; confirmar supabase/.temp/project-ref = tzbfgwpckrfbqcolqxtm):
--   supabase db query --linked -f <worktree>/supabase/tests/documentos_language.test.sql
--
-- VERMELHO / VERDE:
--   * ANTES do db push: falha no passo 0 com 'FALHOU: 0 proposals.language nao existe'.
--   * Ensaio sem aplicar: BEGIN; <migration>; <este teste sem o BEGIN>; (o ROLLBACK final desfaz tudo).
--   * DEPOIS do db push: o ultimo SELECT devolve a linha 'OK: ...'.
--
-- Cobre (uma prova por suspeita):
--   0. Catalogo: coluna text, nula, sem default, comentada, CHECK validado; sem ACL por coluna e
--      privilegios iguais aos da coluna vizinha; triggers de snapshot ligados; definicoes de
--      compute_proposal_business_hash e dos triggers de snapshot iguais as de antes (md5 do prosrc)
--   1. Proposta nova da nike: language 'pt+en' grava; UPDATE de titulo nao o altera; NULL fica NULL
--   2. CHECK: aceita pt, en, pt-BR, en+pt; recusa EN, english, pt+, pt_en, '' (23514)
--   3. Contrato novo da nike: language 'en' grava; UPDATE de notas nao o altera; 'EN' recusado
--   4. authenticated (membro so-da-nike) pode ler e escrever a coluna (sem 42501)
--   5. Nenhuma outra linha da nike tem language preenchido
-- Possivel falha alheia: 'plan_limit_exceeded:*' se a nike estiver no limite do plano (gatilhos de quota
-- nos INSERT; desfeito no ROLLBACK).
-- ============================================================

BEGIN;

-- ─── 0. Catalogo ────────────────────────────────────────────────────────────
DO $t$
DECLARE
  t   text;
  viz text;
  r   text;
  p   text;
  col record;
BEGIN
  FOREACH t IN ARRAY ARRAY['proposals', 'client_contracts'] LOOP
    SELECT c.data_type::text AS data_type, c.is_nullable::text AS is_nullable,
           c.column_default::text AS column_default
      INTO col
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = t AND c.column_name = 'language';
    IF NOT FOUND THEN RAISE EXCEPTION 'FALHOU: 0 %.language nao existe', t; END IF;
    IF col.data_type <> 'text' THEN RAISE EXCEPTION 'FALHOU: 0 %.language e %', t, col.data_type; END IF;
    IF col.is_nullable <> 'YES' THEN RAISE EXCEPTION 'FALHOU: 0 %.language e NOT NULL', t; END IF;
    IF col.column_default IS NOT NULL THEN RAISE EXCEPTION 'FALHOU: 0 %.language tem default', t; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint k
                   WHERE k.conrelid = format('public.%I', t)::regclass
                     AND k.conname::text = t || '_language_formato_chk'
                     AND k.contype::text = 'c' AND k.convalidated) THEN
      RAISE EXCEPTION 'FALHOU: 0 CHECK %_language_formato_chk em falta ou por validar', t;
    END IF;

    IF col_description(format('public.%I', t)::regclass,
                       (SELECT a.attnum FROM pg_attribute a
                         WHERE a.attrelid = format('public.%I', t)::regclass
                           AND a.attname = 'language')::int) IS NULL THEN
      RAISE EXCEPTION 'FALHOU: 0 %.language sem comentario', t;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_attribute a
               WHERE a.attrelid = format('public.%I', t)::regclass
                 AND a.attname = 'language' AND a.attacl IS NOT NULL) THEN
      RAISE EXCEPTION 'FALHOU: 0 %.language tem ACL por coluna', t;
    END IF;
    viz := CASE t WHEN 'proposals' THEN 'title' ELSE 'notes' END;
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE'] LOOP
        IF has_column_privilege(r, format('public.%I', t), 'language', p)
           IS DISTINCT FROM has_column_privilege(r, format('public.%I', t), viz, p) THEN
          RAISE EXCEPTION 'FALHOU: 0 %.language: % de % diferente de %', t, p, r, viz;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  IF (SELECT count(*) FROM pg_trigger g
      WHERE g.tgenabled::text = 'O'
        AND ((g.tgrelid = 'public.proposals'::regclass
              AND g.tgname::text IN ('trg_proposals_freeze_template_snapshot', 'trg_proposals_mark_dirty'))
          OR (g.tgrelid = 'public.client_contracts'::regclass
              AND g.tgname::text = 'trg_contracts_freeze_template'))) <> 3 THEN
    RAISE EXCEPTION 'FALHOU: 0 triggers de snapshot em falta ou desligados';
  END IF;

  -- Definicoes lidas no remoto a 2026-11-18, antes da migration: nao podem mudar.
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.compute_proposal_business_hash(uuid)'))
       IS DISTINCT FROM '0bb7f7cc3367b16c8d16f27a8bd23196'
  OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.proposal_freeze_template_snapshot()'))
       IS DISTINCT FROM '85c28b676f6110882b590a0866eaf104'
  OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.contract_freeze_template_snapshot()'))
       IS DISTINCT FROM '29c642ed6b18bf2f4290199e674f3c1d'
  OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.proposal_mark_dirty_before_update()'))
       IS DISTINCT FROM 'f16985988561fe595532c3fd9dbc2e46' THEN
    RAISE EXCEPTION 'FALHOU: 0 definicao de hash/snapshot diferente da lida antes da migration';
  END IF;
END $t$;

-- ─── Fixtures (como postgres, so nike) ──────────────────────────────────────
DO $fx$
DECLARE
  c_nike constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_auth uuid;
  v_act  uuid;
BEGIN
  SELECT u.auth_user_id, u.id INTO v_auth, v_act
  FROM public.anew_users u
  JOIN public.anew_memberships m ON m.user_id = u.id AND m.organization_id = c_nike
   AND m.status = 'active' AND m.role_is_client IS NOT TRUE
  WHERE u.auth_user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.anew_memberships o
                    WHERE o.user_id = u.id AND o.status = 'active' AND o.organization_id <> c_nike)
  ORDER BY u.id
  LIMIT 1;
  IF v_act IS NULL THEN RAISE EXCEPTION 'FALHOU: fixture sem membro so-da-nike'; END IF;

  -- set_proposal_assigned_to (resolve_proposal_commercial) exige auth.uid(): claims do membro so nos INSERT.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);

  INSERT INTO public.proposals (id, organization_id, title, value, created_by, language)
  VALUES ('a3a10000-0000-4000-8000-000000000001', c_nike, 'TESTE language 1', 0, v_act, 'pt+en'),
         ('a3a10000-0000-4000-8000-000000000002', c_nike, 'TESTE language 2', 0, v_act, NULL);

  INSERT INTO public.client_contracts (id, organization_id, status, created_by, notes, currency, language)
  VALUES ('a3a1cccc-0000-4000-8000-000000000001', c_nike, 'draft', v_act, 'TESTE language contrato', 'EUR', 'en');

  PERFORM set_config('teste.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claims', '', true);
END $fx$;

-- ─── 1. UPDATE de titulo nao mexe no idioma ─────────────────────────────────
DO $t$
BEGIN
  UPDATE public.proposals SET title = 'TESTE language 1 (titulo alterado)'
   WHERE id = 'a3a10000-0000-4000-8000-000000000001';
  UPDATE public.proposals SET title = 'TESTE language 2 (titulo alterado)'
   WHERE id = 'a3a10000-0000-4000-8000-000000000002';
  IF (SELECT language FROM public.proposals WHERE id = 'a3a10000-0000-4000-8000-000000000001')
       IS DISTINCT FROM 'pt+en' THEN
    RAISE EXCEPTION 'FALHOU: 1 UPDATE de titulo alterou language (pt+en)';
  END IF;
  IF (SELECT language FROM public.proposals WHERE id = 'a3a10000-0000-4000-8000-000000000002')
       IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: 1 UPDATE de titulo preencheu language numa proposta sem idioma';
  END IF;
  IF (SELECT title FROM public.proposals WHERE id = 'a3a10000-0000-4000-8000-000000000001')
       IS DISTINCT FROM 'TESTE language 1 (titulo alterado)' THEN
    RAISE EXCEPTION 'FALHOU: 1 titulo nao gravou';
  END IF;
END $t$;

-- ─── 2. CHECK de formato ────────────────────────────────────────────────────
DO $t$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['pt', 'en', 'pt-BR', 'en+pt'] LOOP
    UPDATE public.proposals SET language = v WHERE id = 'a3a10000-0000-4000-8000-000000000002';
  END LOOP;
  FOREACH v IN ARRAY ARRAY['EN', 'english', 'pt+', 'pt_en', ''] LOOP
    BEGIN
      UPDATE public.proposals SET language = v WHERE id = 'a3a10000-0000-4000-8000-000000000002';
      RAISE EXCEPTION 'FALHOU: 2 valor "%" aceite', v;
    EXCEPTION
      WHEN check_violation THEN NULL;
    END;
  END LOOP;
END $t$;

-- ─── 3. Contrato: UPDATE de notas nao mexe no idioma; CHECK ─────────────────
DO $t$
BEGIN
  UPDATE public.client_contracts SET notes = 'TESTE language contrato (alterado)'
   WHERE id = 'a3a1cccc-0000-4000-8000-000000000001';
  IF (SELECT language FROM public.client_contracts WHERE id = 'a3a1cccc-0000-4000-8000-000000000001')
       IS DISTINCT FROM 'en' THEN
    RAISE EXCEPTION 'FALHOU: 3 UPDATE de notas alterou language do contrato';
  END IF;
  BEGIN
    UPDATE public.client_contracts SET language = 'EN' WHERE id = 'a3a1cccc-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'FALHOU: 3 contrato aceitou "EN"';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END $t$;

-- ─── 4. authenticated tem acesso a coluna (privilegio, nao visibilidade RLS) ─
SELECT set_config('request.jwt.claims', current_setting('teste.claims'), true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  BEGIN
    PERFORM language FROM public.proposals WHERE id = 'a3a10000-0000-4000-8000-000000000001';
    PERFORM language FROM public.client_contracts WHERE id = 'a3a1cccc-0000-4000-8000-000000000001';
    -- UPDATE sem linhas (id inexistente): so prova o privilegio de escrita na coluna.
    UPDATE public.proposals SET language = 'en' WHERE id = 'a3a1ffff-0000-4000-8000-000000000000';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'FALHOU: 4 authenticated sem privilegio na coluna language: %', SQLERRM;
  END;
END $t$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

-- ─── 5. Nenhuma outra linha da nike tem idioma ──────────────────────────────
DO $t$
BEGIN
  IF EXISTS (SELECT 1 FROM public.proposals
             WHERE organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'
               AND language IS NOT NULL
               AND id NOT IN ('a3a10000-0000-4000-8000-000000000001', 'a3a10000-0000-4000-8000-000000000002'))
  OR EXISTS (SELECT 1 FROM public.client_contracts
             WHERE organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'
               AND language IS NOT NULL
               AND id <> 'a3a1cccc-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'FALHOU: 5 ha linhas da nike com language preenchido';
  END IF;
END $t$;

SELECT 'OK: language existe em proposals e client_contracts (text, nula, sem default, CHECK validado, comentada, privilegios da tabela); triggers e funcoes de snapshot/hash iguais; editar titulo/notas nao mexe no idioma; formato recusa EN/english/pt+/pt_en/vazio (tudo desfeito no ROLLBACK)' AS resultado;

ROLLBACK;
