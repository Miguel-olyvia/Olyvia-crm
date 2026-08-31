-- =============================================================================
-- Operações — dar perfil de CRM a uma conta de autenticação
--
-- ⚠ ISTO CRIA UM LOGIN REAL NUMA BASE DE PRODUÇÃO.
--   Escreve em `anew_entities`, `anew_users` e `anew_memberships` — três
--   tabelas do CRM. É a primeira coisa deste módulo que o faz. Passa ao lado
--   da edge function `create-user`, e portanto do contexto de auditoria que
--   ela define: os triggers de auditoria continuam a disparar, mas registam
--   sem ator identificado.
--
--   Usa-o para uma conta de verificação, não como forma habitual de criar
--   pessoas. Para utilizadores a sério, o ecrã Utilizadores do CRM.
--
--   No fim está o SQL para remover a conta por inteiro.
--
--
-- ANTES DE CORRER ISTO — cria a conta de autenticação no Studio
-- =============================================================
-- Supabase → Authentication → Users → Add user
--   Email          : o mesmo que puseres na CONFIGURAÇÃO abaixo
--   Password       : uma que guardes; com um email `.invalid` nunca haverá
--                    recuperação de password por email
--   Auto Confirm User : LIGADO  ← senão a conta não entra
--
-- Porquê no Studio e não aqui: as colunas de `auth.users` e `auth.identities`
-- mudam entre versões do Supabase. Um INSERT à mão produz contas que parecem
-- existir e depois não fazem login. O Studio usa a API de autenticação e
-- acerta sempre.
--
-- Este ficheiro procura essa conta pelo email e liga-lhe o perfil de CRM.
-- =============================================================================

BEGIN;

-- ┌──────────────────────────────────────────────────────────────────────┐
-- │  CONFIGURAÇÃO                                                        │
-- └──────────────────────────────────────────────────────────────────────┘
CREATE TEMP TABLE _cfg AS SELECT
  'olyvia-live-ui-check+11544965@example.invalid'::text  AS email,

  -- Nome que aparece na aplicação.
  'Verificação de UI'::text                              AS nome,

  -- Papel a atribuir. Tem de existir em `anew_roles` e NÃO pode ser de
  -- sistema. Vê os teus com:
  --   SELECT name, is_system FROM public.anew_roles WHERE deleted_at IS NULL ORDER BY name;
  'Admin'::text                                          AS papel,

  -- Organização. NULL = usa a única que existir; se houver mais do que uma,
  -- o ficheiro pára e diz-te os nomes, em vez de escolher por ti.
  NULL::uuid                                             AS organizacao_id;


-- ============================================================
-- Parte 0 — Verificações
-- ============================================================

DO $verificar$
DECLARE
  c          record;
  v_auth     uuid;
  v_confirmado timestamptz;
  v_orgs     integer;
  v_role     record;
BEGIN
  SELECT * INTO c FROM _cfg;

  -- 1. A conta de autenticação tem de existir já.
  SELECT id, email_confirmed_at INTO v_auth, v_confirmado
    FROM auth.users WHERE lower(email) = lower(c.email);

  IF v_auth IS NULL THEN
    RAISE EXCEPTION
      'Não existe conta de autenticação com o email %. Cria-a primeiro em Authentication → Users → Add user, com Auto Confirm ligado.',
      c.email;
  END IF;

  IF v_confirmado IS NULL THEN
    RAISE EXCEPTION
      'A conta % existe mas o email não está confirmado — não vai conseguir entrar. No Studio, confirma-a (Auto Confirm User).',
      c.email;
  END IF;

  -- 2. Não duplicar. Um utilizador com dois perfis é pior do que nenhum.
  IF EXISTS (SELECT 1 FROM public.anew_users WHERE auth_user_id = v_auth AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Esta conta já tem perfil de CRM. Não há nada a fazer aqui.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.anew_users WHERE lower(email) = lower(c.email) AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Já existe um anew_users com o email % (ligado a outra conta de autenticação).', c.email;
  END IF;

  -- 3. Organização.
  IF c.organizacao_id IS NULL THEN
    SELECT count(*) INTO v_orgs FROM public.anew_organizations;
    IF v_orgs = 0 THEN
      RAISE EXCEPTION 'Não há nenhuma organização em anew_organizations.';
    END IF;
    IF v_orgs > 1 THEN
      RAISE EXCEPTION
        'Há % organizações. Escolhe uma e põe o id em `organizacao_id`:  SELECT id, name FROM public.anew_organizations ORDER BY name;',
        v_orgs;
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = c.organizacao_id) THEN
    RAISE EXCEPTION 'A organização % não existe.', c.organizacao_id;
  END IF;

  -- 4. Papel: tem de existir, não pode ser de sistema, e não pode ser ambíguo.
  SELECT count(*) FILTER (WHERE is_system IS NOT TRUE) AS normais,
         count(*) FILTER (WHERE is_system IS TRUE)     AS sistema
    INTO v_role
    FROM public.anew_roles
   WHERE name = c.papel AND deleted_at IS NULL;

  IF v_role.normais = 0 AND v_role.sistema = 0 THEN
    RAISE EXCEPTION
      'Não existe papel "%". Vê os teus:  SELECT name, is_system FROM public.anew_roles WHERE deleted_at IS NULL ORDER BY name;',
      c.papel;
  END IF;

  IF v_role.normais = 0 THEN
    RAISE EXCEPTION
      'O papel "%" é de sistema. Um trigger impede atribuir-lhe permissões, por isso não serve para isto. Escolhe um papel normal.',
      c.papel;
  END IF;

  IF v_role.normais > 1 THEN
    RAISE EXCEPTION
      'Há % papéis chamados "%". Renomeia um, ou usa um nome sem ambiguidade.',
      v_role.normais, c.papel;
  END IF;
END
$verificar$;


-- ============================================================
-- Parte 1 — A entidade
-- ============================================================
-- No CRM, o nome de uma pessoa vive em `anew_entities`, não em `anew_users`.
-- É o mesmo motivo por que `ops_v_cliente` tem de fazer um join para mostrar
-- o nome de um cliente.

CREATE TEMP TABLE _novo AS
SELECT
  gen_random_uuid() AS entidade_id,
  gen_random_uuid() AS utilizador_id,
  (SELECT id FROM auth.users WHERE lower(email) = lower((SELECT email FROM _cfg))) AS auth_id,
  COALESCE(
    (SELECT organizacao_id FROM _cfg),
    (SELECT id FROM public.anew_organizations LIMIT 1)
  ) AS org_id,
  (SELECT id FROM public.anew_roles
    WHERE name = (SELECT papel FROM _cfg)
      AND deleted_at IS NULL AND is_system IS NOT TRUE
    LIMIT 1) AS role_id;

INSERT INTO public.anew_entities (id, display_name, type, status)
SELECT n.entidade_id, c.nome, 'person', 'active'
  FROM _novo n CROSS JOIN _cfg c;


-- ============================================================
-- Parte 2 — O utilizador de negócio
-- ============================================================

INSERT INTO public.anew_users (id, auth_user_id, entity_id, name, email, status)
SELECT n.utilizador_id, n.auth_id, n.entidade_id, c.nome, c.email, 'active'
  FROM _novo n CROSS JOIN _cfg c;


-- ============================================================
-- Parte 3 — A membership
-- ============================================================
-- Sem isto o utilizador entra e não pertence a organização nenhuma: o
-- `get_user_visible_org_ids()` devolve vazio e não vê rigorosamente nada.

INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status)
SELECT n.utilizador_id, n.org_id, n.role_id, 'active'
  FROM _novo n;


-- ============================================================
-- Relatório
-- ============================================================

DO $relatorio$
DECLARE r record;
BEGIN
  SELECT c.email, c.nome, c.papel, o.name AS org
    INTO r
    FROM _cfg c
    CROSS JOIN _novo n
    JOIN public.anew_organizations o ON o.id = n.org_id;

  RAISE NOTICE 'Criado: % ("%") — papel "%", organização "%".', r.email, r.nome, r.papel, r.org;
  RAISE NOTICE 'Falta correr db/pos-instalacao.sql com este email para dar acesso a Operações.';
END
$relatorio$;

DROP TABLE _novo;
DROP TABLE _cfg;

COMMIT;


-- =============================================================================
-- PARA REMOVER A CONTA POR INTEIRO
--
-- Corre isto, e depois apaga a conta em Authentication → Users no Studio.
-- Uma conta de verificação em produção não deve ficar lá esquecida.
--
--   BEGIN;
--   WITH alvo AS (
--     SELECT id, entity_id FROM public.anew_users
--      WHERE email = 'olyvia-live-ui-check+11544965@example.invalid'
--   )
--   , a AS (DELETE FROM public.ops_utilizador_perfil
--            WHERE utilizador_id IN (SELECT id FROM alvo) RETURNING 1)
--   , b AS (DELETE FROM public.anew_memberships
--            WHERE user_id IN (SELECT id FROM alvo) RETURNING 1)
--   , c AS (DELETE FROM public.anew_users
--            WHERE id IN (SELECT id FROM alvo) RETURNING entity_id)
--   DELETE FROM public.anew_entities WHERE id IN (SELECT entity_id FROM c);
--   COMMIT;
--
-- As permissões que o pos-instalacao.sql deu ao PAPEL não saem com isto —
-- são do papel, não da pessoa. Para as tirar:
--   DELETE FROM public.anew_role_permissions WHERE permission_code LIKE 'operations.%';
-- =============================================================================
