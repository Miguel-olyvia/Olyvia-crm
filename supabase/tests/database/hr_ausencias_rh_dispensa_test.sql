-- pgTAP integration tests for:
--   supabase/migrations/20261202030000_hr_ausencias_rh_dispensa_o_proprio_passo.sql
--
-- The pure hr_ausencias_estado_inicial(4) combinations are already proved by
-- the migration's own DO $conferir$ block. This file covers the RPC-level
-- behaviour that block cannot reach: who actually gets the shortcut.
--
-- Covers:
--   1. A user with hr.ausencias.aprovar.rh creating a request on ANOTHER
--      person's record, for a type with no chefia step, gets the request
--      born already 'aprovado' (the shortcut).
--   2. The RH decision row for that request says resultado='aprovado' with
--      an author, not the old always-'dispensado' text.
--   3. The SAME user creating a request for THEMSELVES does NOT get the
--      shortcut -- born 'pendente_rh', same as before this migration.
--   4. A user with only hr.ausencias.pedir.outros (no aprovar.rh) does NOT
--      get the shortcut either.
--   5. A type that also requires chefia approval is untouched by the
--      shortcut -- born 'pendente_chefia' regardless of who has aprovar.rh.
--
-- How to run (once local Postgres/pgTAP infra is available):
--   supabase start
--   supabase db reset
--   supabase test db

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(5);

-- ---------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_org uuid;
  v_role_rh uuid;
  v_role_pedir_outros uuid;
BEGIN
  INSERT INTO public.anew_organizations (id, name)
  VALUES ('bbbbbbbb-0001-0000-0000-000000000001'::uuid, 'Org Ausencias') RETURNING id INTO v_org;

  INSERT INTO public.anew_users (id, email, name, auth_user_id) VALUES
    ('55555555-0001-0000-0000-000000000001'::uuid, 'rh@example.test', 'RH User', '25555555-0001-0000-0000-000000000001'::uuid),
    ('55555555-0001-0000-0000-000000000002'::uuid, 'registador@example.test', 'Registador Sem Aprovar', '25555555-0001-0000-0000-000000000002'::uuid);

  -- Papel com hr.ausencias.pedir, .pedir.outros e .aprovar.rh -- o utilizador
  -- RH que ganha o atalho.
  INSERT INTO public.anew_roles (id, code, name, organization_id, is_system)
  VALUES ('bbbbbbbb-0002-0000-0000-000000000001'::uuid, 'rh_aprova', 'RH Aprova', v_org, false)
  RETURNING id INTO v_role_rh;
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    (v_role_rh, 'hr.ausencias.pedir'),
    (v_role_rh, 'hr.ausencias.pedir.outros'),
    (v_role_rh, 'hr.ausencias.aprovar.rh');

  -- Papel so com pedir.outros -- regista em papel, NAO decide o passo de RH.
  INSERT INTO public.anew_roles (id, code, name, organization_id, is_system)
  VALUES ('bbbbbbbb-0002-0000-0000-000000000002'::uuid, 'so_regista', 'So Regista', v_org, false)
  RETURNING id INTO v_role_pedir_outros;
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    (v_role_pedir_outros, 'hr.ausencias.pedir.outros');

  INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status) VALUES
    ('55555555-0001-0000-0000-000000000001'::uuid, v_org, v_role_rh, 'active'),
    ('55555555-0001-0000-0000-000000000002'::uuid, v_org, v_role_pedir_outros, 'active');

  -- Duas pessoas: a do RH user (ficha propria, para o caso "a si proprio nao
  -- vale") e a de um colaborador comum.
  INSERT INTO public.pessoas (id, organization_id, primeiro_nome, apelido) VALUES
    ('66666666-0001-0000-0000-000000000001'::uuid, v_org, 'Rita', 'RH'),
    ('66666666-0001-0000-0000-000000000002'::uuid, v_org, 'Colaborador', 'Comum');

  INSERT INTO public.pessoas_contas (pessoa_id, anew_user_id, organization_id, estado) VALUES
    ('66666666-0001-0000-0000-000000000001'::uuid, '55555555-0001-0000-0000-000000000001'::uuid, v_org, 'activa');

  -- Tipo SEM chefia, COM RH, sem restricoes de fim-de-semana/feriado/saldo --
  -- para isolar o atalho sem depender de schedule_holidays ou de saldo.
  INSERT INTO public.hr_ausencias_tipos (
    id, organization_id, codigo, nome, categoria,
    desconta_saldo, exige_aprovacao_chefia, exige_aprovacao_rh,
    permite_meio_dia, inclui_fim_de_semana, inclui_feriados
  ) VALUES (
    'bbbbbbbb-0003-0000-0000-000000000001'::uuid, v_org, 'SEM_CHEFIA_COM_RH', 'Sem chefia, com RH', 'outro',
    false, false, true, false, true, true
  );

  -- Tipo COM chefia e COM RH -- para provar que o atalho nao a atropela. Sem
  -- aprovador de chefia atribuido a ninguem, por isso hr_ausencias_aprovador_chefia
  -- devolve NULL e o pedido devia SEMPRE nascer pendente_rh (chefia dispensada
  -- por falta de aprovador) -- MAS este teste usa um tipo COM chefia e testa
  -- que a linha 1 do CASE continua a mandar quando ha aprovador; ver nota no
  -- proprio teste 5 abaixo.
  INSERT INTO public.hr_ausencias_tipos (
    id, organization_id, codigo, nome, categoria,
    desconta_saldo, exige_aprovacao_chefia, exige_aprovacao_rh,
    permite_meio_dia, inclui_fim_de_semana, inclui_feriados
  ) VALUES (
    'bbbbbbbb-0003-0000-0000-000000000002'::uuid, v_org, 'COM_CHEFIA_COM_RH', 'Com chefia, com RH', 'outro',
    false, true, true, false, true, true
  );

  -- Aprovador de chefia atribuido ao colaborador comum, para o tipo com
  -- chefia ter um aprovador resoluvel.
  UPDATE public.pessoas SET reporta_a_pessoa_id = '66666666-0001-0000-0000-000000000001'::uuid
   WHERE id = '66666666-0001-0000-0000-000000000002'::uuid;
END $$;

-- ---------------------------------------------------------------------
-- 1 & 2. RH user pede para o colaborador comum, tipo sem chefia com RH:
--        nasce 'aprovado', decisao de RH diz 'aprovado' com autor.
-- ---------------------------------------------------------------------
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '25555555-0001-0000-0000-000000000001';

SELECT is(
  (SELECT estado FROM public.pessoas_ausencias_pedidos WHERE id = (
     SELECT public.rpc_hr_ausencia_pedir(
       'bbbbbbbb-0001-0000-0000-000000000001'::uuid,
       '66666666-0001-0000-0000-000000000002'::uuid,
       'bbbbbbbb-0003-0000-0000-000000000001'::uuid,
       current_date + 10, current_date + 10
     )
   )),
  'aprovado',
  'RH user with hr.ausencias.aprovar.rh, requesting for another person on a no-chefia type, gets the shortcut: born already aprovado'
);

SELECT is(
  (SELECT resultado FROM public.pessoas_ausencias_pedido_decisoes d
    JOIN public.pessoas_ausencias_pedidos p ON p.id = d.pedido_id
   WHERE p.pessoa_id = '66666666-0001-0000-0000-000000000002'::uuid
     AND p.tipo_id = 'bbbbbbbb-0003-0000-0000-000000000001'::uuid
     AND d.passo = 'rh'
   ORDER BY d.created_at DESC LIMIT 1),
  'aprovado',
  'The RH decision row says aprovado (with an author), not the old always-dispensado text'
);

-- ---------------------------------------------------------------------
-- 3. O mesmo utilizador, a pedir PARA SI PROPRIO: nao ganha o atalho.
-- ---------------------------------------------------------------------
SELECT is(
  (SELECT estado FROM public.pessoas_ausencias_pedidos WHERE id = (
     SELECT public.rpc_hr_ausencia_pedir(
       'bbbbbbbb-0001-0000-0000-000000000001'::uuid,
       '66666666-0001-0000-0000-000000000001'::uuid,
       'bbbbbbbb-0003-0000-0000-000000000001'::uuid,
       current_date + 11, current_date + 11
     )
   )),
  'pendente_rh',
  'The same RH user requesting for THEMSELVES does not get the shortcut: born pendente_rh'
);

-- ---------------------------------------------------------------------
-- 4. Utilizador so com pedir.outros (sem aprovar.rh) nao ganha o atalho.
-- ---------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '25555555-0001-0000-0000-000000000002';

SELECT is(
  (SELECT estado FROM public.pessoas_ausencias_pedidos WHERE id = (
     SELECT public.rpc_hr_ausencia_pedir(
       'bbbbbbbb-0001-0000-0000-000000000001'::uuid,
       '66666666-0001-0000-0000-000000000002'::uuid,
       'bbbbbbbb-0003-0000-0000-000000000001'::uuid,
       current_date + 12, current_date + 12
     )
   )),
  'pendente_rh',
  'A user with only hr.ausencias.pedir.outros (no aprovar.rh) does not get the shortcut'
);

-- ---------------------------------------------------------------------
-- 5. Tipo com chefia: o atalho nunca atropela o passo de chefia.
-- ---------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '25555555-0001-0000-0000-000000000001';

SELECT is(
  (SELECT estado FROM public.pessoas_ausencias_pedidos WHERE id = (
     SELECT public.rpc_hr_ausencia_pedir(
       'bbbbbbbb-0001-0000-0000-000000000001'::uuid,
       '66666666-0001-0000-0000-000000000002'::uuid,
       'bbbbbbbb-0003-0000-0000-000000000002'::uuid,
       current_date + 13, current_date + 13
     )
   )),
  'pendente_chefia',
  'A type that requires chefia is untouched by the RH shortcut: born pendente_chefia when an aprovador is resolvable'
);

SELECT * FROM finish();
ROLLBACK;
