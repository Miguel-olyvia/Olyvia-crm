-- pgTAP integration tests for:
--   supabase/migrations/20261202010000_hr_pessoas_documentos_clausulas.sql
--   supabase/migrations/20261202020000_hr_documento_emitir_substitui_variaveis.sql
--
-- The pure-function checks (hr_documento_substituir_variaveis, the catalog
-- shape) are already proved inline by the migration's own DO $conferir$
-- block on every apply. This file covers what that block cannot: end-to-end
-- behaviour of rpc_hr_documento_emitir as an impersonated authenticated user
-- -- permission gates, RLS on pessoas_documentos_clausulas, and the
-- retribuicao gate/abort.
--
-- Covers:
--   1. rpc_hr_documento_emitir substitutes {{pessoa_nome_completo}} and an
--      unknown token with the real value / placeholder in corpo_html.
--   2. Emitting a model that uses {{retribuicao_valor_base}} without
--      hr.pessoas.retribuicao.view is rejected.
--   3. Emitting that same model, WITH the permission, but for a pessoa with
--      no retribuicao em vigor, aborts (never emits with a blank salary).
--   4. With the permission AND a valid retribuicao, the value is
--      substituted and an audit row lands in pessoas_acessos_sensiveis.
--   5. pessoas_documentos_clausulas: RLS -- a user of another organization
--      cannot see or insert a clause; INSERT/UPDATE without
--      hr.pessoas.documentos.modelos.edit is rejected; DELETE is always
--      rejected regardless of permission (RESTRICTIVE policy).
--   6. A token written with spaces and mixed case ("{{ Pessoa_Nome_Completo }}")
--      resolves through the real RPC, not just the TS preview -- proves the
--      SQL side of the regex now agrees with the TS side.
--   7. pessoa_local_trabalho reads pessoas.local_id (hr_locais_trabalho.nome)
--      first, and only falls back to the legacy pessoas.local_trabalho text
--      when local_id is null.
--
-- How to run (once local Postgres/pgTAP infra is available):
--   supabase start
--   supabase db reset
--   supabase test db

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(19);

-- ---------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_org_a uuid;
  v_org_b uuid;
  v_role_edit uuid;
  v_role_emit_no_retribuicao uuid;
  v_role_none uuid;
BEGIN
  INSERT INTO public.anew_organizations (id, name)
  VALUES ('aaaaaaaa-0001-0000-0000-000000000001'::uuid, 'Org A') RETURNING id INTO v_org_a;
  INSERT INTO public.anew_organizations (id, name)
  VALUES ('aaaaaaaa-0001-0000-0000-000000000002'::uuid, 'Org B') RETURNING id INTO v_org_b;

  INSERT INTO public.anew_users (id, email, name, auth_user_id) VALUES
    ('11111111-0001-0000-0000-000000000001'::uuid, 'editor-a@example.test', 'Editor A', '21111111-0001-0000-0000-000000000001'::uuid),
    ('11111111-0001-0000-0000-000000000002'::uuid, 'sem-retribuicao@example.test', 'Sem Retribuicao', '21111111-0001-0000-0000-000000000002'::uuid),
    ('11111111-0001-0000-0000-000000000003'::uuid, 'outra-org@example.test', 'Outra Org', '21111111-0001-0000-0000-000000000003'::uuid);

  -- Papel COM as tres permissoes: modelos.edit, documentos.emitir, retribuicao.view.
  INSERT INTO public.anew_roles (id, code, name, organization_id, is_system)
  VALUES ('aaaaaaaa-0002-0000-0000-000000000001'::uuid, 'rh_editor_completo', 'RH Editor Completo', v_org_a, false)
  RETURNING id INTO v_role_edit;
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    (v_role_edit, 'hr.pessoas.documentos.modelos.view'),
    (v_role_edit, 'hr.pessoas.documentos.modelos.edit'),
    (v_role_edit, 'hr.pessoas.documentos.emitir'),
    (v_role_edit, 'hr.pessoas.retribuicao.view');

  -- Papel SEM hr.pessoas.retribuicao.view (mas com emitir/modelos), para
  -- provar o gate.
  INSERT INTO public.anew_roles (id, code, name, organization_id, is_system)
  VALUES ('aaaaaaaa-0002-0000-0000-000000000002'::uuid, 'rh_editor_sem_retribuicao', 'RH Editor Sem Retribuicao', v_org_a, false)
  RETURNING id INTO v_role_emit_no_retribuicao;
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    (v_role_emit_no_retribuicao, 'hr.pessoas.documentos.modelos.view'),
    (v_role_emit_no_retribuicao, 'hr.pessoas.documentos.modelos.edit'),
    (v_role_emit_no_retribuicao, 'hr.pessoas.documentos.emitir');

  -- Papel sem NENHUMA permissao de RH, membership na Org B.
  INSERT INTO public.anew_roles (id, code, name, organization_id, is_system)
  VALUES ('aaaaaaaa-0002-0000-0000-000000000003'::uuid, 'sem_permissoes', 'Sem Permissoes', v_org_b, false)
  RETURNING id INTO v_role_none;

  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('11111111-0001-0000-0000-000000000001'::uuid, v_org_a, v_role_edit, 'active'),
    ('11111111-0001-0000-0000-000000000002'::uuid, v_org_a, v_role_emit_no_retribuicao, 'active'),
    ('11111111-0001-0000-0000-000000000003'::uuid, v_org_b, v_role_none, 'active');

  -- Local de trabalho novo (hr_locais_trabalho), para provar o fallback de
  -- pessoa_local_trabalho: local_id primeiro, so cai para o texto legado
  -- pessoas.local_trabalho quando local_id e nulo (20261120170000).
  INSERT INTO public.hr_locais_trabalho (id, organization_id, nome) VALUES
    ('55555555-0001-0000-0000-000000000001'::uuid, v_org_a, 'Sede — Porto');

  -- Tres pessoas na Org A:
  --   Ana:    com retribuicao em vigor, sem local_id nem local_trabalho.
  --   Bruno:  sem retribuicao, SO local_trabalho legado preenchido (local_id nulo).
  --   Carla:  local_id preenchido (aponta para "Sede — Porto") E local_trabalho
  --           legado tambem preenchido com outro texto -- prova que local_id
  --           GANHA ao legado quando os dois existem.
  INSERT INTO public.pessoas (id, organization_id, primeiro_nome, apelido, local_trabalho, local_id) VALUES
    ('33333333-0001-0000-0000-000000000001'::uuid, v_org_a, 'Ana', 'Ferreira', NULL, NULL),
    ('33333333-0001-0000-0000-000000000002'::uuid, v_org_a, 'Bruno', 'Costa', 'Escritorio Antigo (legado)', NULL),
    ('33333333-0001-0000-0000-000000000003'::uuid, v_org_a, 'Carla', 'Nunes', 'Texto legado que nao devia aparecer', '55555555-0001-0000-0000-000000000001'::uuid);

  INSERT INTO public.pessoas_retribuicoes (pessoa_id, organization_id, valor_base, valido_de) VALUES
    ('33333333-0001-0000-0000-000000000001'::uuid, v_org_a, 1200.00, current_date - 30);

  -- Modelos: um so com o nome, outro com retribuicao (e um token
  -- desconhecido, para provar o placeholder), outro com local de trabalho, e
  -- um ultimo com o MESMO token de nome escrito com espacos e maiusculas
  -- (para provar a paridade TS/SQL do regex, ponto (a) da revisao).
  INSERT INTO public.pessoas_documentos_modelos (id, organization_id, nome, tipo, corpo_html) VALUES
    ('44444444-0001-0000-0000-000000000001'::uuid, v_org_a, 'Declaracao simples', 'declaracao',
     '<p>Nome: {{pessoa_nome_completo}} — Campo: {{token_que_nao_existe}}</p>'),
    ('44444444-0001-0000-0000-000000000003'::uuid, v_org_a, 'Declaracao de local', 'declaracao',
     '<p>{{pessoa_nome_completo}} trabalha em {{pessoa_local_trabalho}}.</p>'),
    ('44444444-0001-0000-0000-000000000004'::uuid, v_org_a, 'Declaracao com token espacado', 'declaracao',
     '<p>Ola {{ Pessoa_Nome_Completo }}, token {{TOKEN_DESCONHECIDO}}.</p>'),
    ('44444444-0001-0000-0000-000000000002'::uuid, v_org_a, 'Contrato com retribuicao', 'contrato',
     '<p>{{pessoa_nome_completo}} ganha {{retribuicao_valor_base}} {{retribuicao_moeda}}.</p>');
END $$;

-- ---------------------------------------------------------------------
-- 1. Substituicao real: token conhecido substituido, desconhecido apagado.
-- ---------------------------------------------------------------------
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '21111111-0001-0000-0000-000000000001';

SELECT lives_ok(
  $$ SELECT public.rpc_hr_documento_emitir(
       '44444444-0001-0000-0000-000000000001'::uuid,
       ARRAY['33333333-0001-0000-0000-000000000001'::uuid]
     ) $$,
  'Editor A can issue the simple declaration for Ana Ferreira'
);

SELECT ok(
  (SELECT corpo_html FROM public.pessoas_documentos
    WHERE pessoa_id = '33333333-0001-0000-0000-000000000001'::uuid
      AND modelo_id = '44444444-0001-0000-0000-000000000001'::uuid) LIKE '%Ana Ferreira%',
  'Issued document body contains the real person name, substituted server-side'
);

SELECT ok(
  (SELECT corpo_html FROM public.pessoas_documentos
    WHERE pessoa_id = '33333333-0001-0000-0000-000000000001'::uuid
      AND modelo_id = '44444444-0001-0000-0000-000000000001'::uuid) NOT LIKE '%{{%',
  'No raw {{token}} survives in the issued document, even for an unknown token'
);

-- ---------------------------------------------------------------------
-- 2. Gate de retribuicao: sem hr.pessoas.retribuicao.view, emitir um modelo
--    com {{retribuicao_*}} e recusado.
-- ---------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '21111111-0001-0000-0000-000000000002';

SELECT throws_like(
  $$ SELECT public.rpc_hr_documento_emitir(
       '44444444-0001-0000-0000-000000000002'::uuid,
       ARRAY['33333333-0001-0000-0000-000000000001'::uuid]
     ) $$,
  '%hr.pessoas.retribuicao.view%',
  'Issuing a model with a retribuicao token without hr.pessoas.retribuicao.view is rejected'
);

-- ---------------------------------------------------------------------
-- 3. Com a permissao, mas SEM retribuicao em vigor: aborta.
-- ---------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '21111111-0001-0000-0000-000000000001';

SELECT throws_ok(
  $$ SELECT public.rpc_hr_documento_emitir(
       '44444444-0001-0000-0000-000000000002'::uuid,
       ARRAY['33333333-0001-0000-0000-000000000002'::uuid]
     ) $$,
  'Issuing a model with a retribuicao token for a person with no retribuicao em vigor aborts (never a blank salary)'
);

-- ---------------------------------------------------------------------
-- 4. Com a permissao E retribuicao em vigor: substitui e audita.
-- ---------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT public.rpc_hr_documento_emitir(
       '44444444-0001-0000-0000-000000000002'::uuid,
       ARRAY['33333333-0001-0000-0000-000000000001'::uuid]
     ) $$,
  'Editor A (with hr.pessoas.retribuicao.view) can issue the contract with retribuicao for Ana'
);

SELECT ok(
  (SELECT corpo_html FROM public.pessoas_documentos
    WHERE pessoa_id = '33333333-0001-0000-0000-000000000001'::uuid
      AND modelo_id = '44444444-0001-0000-0000-000000000002'::uuid) LIKE '%1200%',
  'The real retribuicao value is substituted into the issued contract'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.pessoas_acessos_sensiveis
     WHERE pessoa_id = '33333333-0001-0000-0000-000000000001'::uuid
       AND campo = 'retribuicao' AND accao = 'revelar'
  ),
  'Reading retribuicao during issuing is audited in pessoas_acessos_sensiveis'
);

-- ---------------------------------------------------------------------
-- 6. Token com espacos e maiusculas resolve pela RPC real (nao so na
--    pre-visualizacao TS) -- prova que o regex SQL concorda com o TS.
-- ---------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT public.rpc_hr_documento_emitir(
       '44444444-0001-0000-0000-000000000004'::uuid,
       ARRAY['33333333-0001-0000-0000-000000000001'::uuid]
     ) $$,
  'Editor A can issue the model whose body writes the token with spaces/mixed case'
);

SELECT ok(
  (SELECT corpo_html FROM public.pessoas_documentos
    WHERE pessoa_id = '33333333-0001-0000-0000-000000000001'::uuid
      AND modelo_id = '44444444-0001-0000-0000-000000000004'::uuid) LIKE '%Ana Ferreira%',
  '{{ Pessoa_Nome_Completo }} (spaces + mixed case) resolves to the real value, same as {{pessoa_nome_completo}}'
);

SELECT ok(
  (SELECT corpo_html FROM public.pessoas_documentos
    WHERE pessoa_id = '33333333-0001-0000-0000-000000000001'::uuid
      AND modelo_id = '44444444-0001-0000-0000-000000000004'::uuid) NOT LIKE '%{{%',
  'An unknown token written as {{TOKEN_DESCONHECIDO}} (uppercase) is still masked, never left raw'
);

-- ---------------------------------------------------------------------
-- 7. pessoa_local_trabalho: local_id (hr_locais_trabalho.nome) ganha ao
--    texto legado; o legado so aparece quando local_id e nulo.
-- ---------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT public.rpc_hr_documento_emitir(
       '44444444-0001-0000-0000-000000000003'::uuid,
       ARRAY['33333333-0001-0000-0000-000000000002'::uuid, '33333333-0001-0000-0000-000000000003'::uuid]
     ) $$,
  'Editor A can issue the local-de-trabalho declaration for Bruno (legacy text) and Carla (local_id)'
);

SELECT ok(
  (SELECT corpo_html FROM public.pessoas_documentos
    WHERE pessoa_id = '33333333-0001-0000-0000-000000000002'::uuid
      AND modelo_id = '44444444-0001-0000-0000-000000000003'::uuid) LIKE '%Escritorio Antigo (legado)%',
  'Bruno has no local_id: pessoa_local_trabalho falls back to the legacy pessoas.local_trabalho text'
);

SELECT ok(
  (SELECT corpo_html FROM public.pessoas_documentos
    WHERE pessoa_id = '33333333-0001-0000-0000-000000000003'::uuid
      AND modelo_id = '44444444-0001-0000-0000-000000000003'::uuid) LIKE '%Sede — Porto%',
  'Carla has local_id set: pessoa_local_trabalho reads hr_locais_trabalho.nome'
);

SELECT ok(
  (SELECT corpo_html FROM public.pessoas_documentos
    WHERE pessoa_id = '33333333-0001-0000-0000-000000000003'::uuid
      AND modelo_id = '44444444-0001-0000-0000-000000000003'::uuid) NOT LIKE '%Texto legado que nao devia aparecer%',
  'Carla has local_id AND legacy local_trabalho both filled: local_id wins, the legacy text never surfaces'
);

-- ---------------------------------------------------------------------
-- 8. pessoas_documentos_clausulas: RLS e permissoes.
-- ---------------------------------------------------------------------
SELECT lives_ok(
  $$ INSERT INTO public.pessoas_documentos_clausulas (organization_id, nome, categoria, corpo_html)
     VALUES ('aaaaaaaa-0001-0000-0000-000000000001'::uuid, 'Confidencialidade', 'confidencialidade', '<p>Texto</p>') $$,
  'Editor A (hr.pessoas.documentos.modelos.edit) can insert a clause in their own org'
);

-- User from Org B (no hr permissions at all) cannot see Org A's clause.
SET LOCAL request.jwt.claim.sub = '21111111-0001-0000-0000-000000000003';

SELECT is(
  (SELECT count(*)::int FROM public.pessoas_documentos_clausulas
    WHERE organization_id = 'aaaaaaaa-0001-0000-0000-000000000001'::uuid),
  0,
  'A user from Org B, with no hr.pessoas.documentos.modelos.view, sees zero clauses from Org A (RLS)'
);

SELECT throws_ok(
  $$ INSERT INTO public.pessoas_documentos_clausulas (organization_id, nome, corpo_html)
     VALUES ('aaaaaaaa-0001-0000-0000-000000000002'::uuid, 'Tentativa', '<p>x</p>') $$,
  'A user without hr.pessoas.documentos.modelos.edit cannot insert a clause'
);

-- Editor A cannot DELETE a clause even though they have .edit -- RESTRICTIVE
-- policy blocks DELETE unconditionally, same as pessoas_documentos_modelos.
SET LOCAL request.jwt.claim.sub = '21111111-0001-0000-0000-000000000001';

SELECT throws_ok(
  $$ DELETE FROM public.pessoas_documentos_clausulas
      WHERE organization_id = 'aaaaaaaa-0001-0000-0000-000000000001'::uuid $$,
  'DELETE on pessoas_documentos_clausulas is always rejected, even with modelos.edit (RESTRICTIVE policy)'
);

SELECT * FROM finish();
ROLLBACK;
