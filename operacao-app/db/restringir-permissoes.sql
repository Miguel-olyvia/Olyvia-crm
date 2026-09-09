-- =============================================================================
-- Operações — restringir as permissões aos papéis que interessam
--
-- O `db/pos-instalacao.sql` atribuiu `operations.*` a TODOS os papéis com o
-- nome indicado. Numa base com 56 organizações, "Admin" existe uma vez por
-- organização: as 15 permissões foram parar a dezenas de papéis em vez de um.
--
-- A culpa é do desenho desse ficheiro — quando encontrava vários papéis com o
-- mesmo nome emitia um aviso e seguia, em vez de parar. Um aviso que não trava
-- não serve num SQL Editor onde as mensagens passam despercebidas.
--
-- Este ficheiro corrige, e é conservador: mantém as permissões apenas nos
-- papéis que a pessoa indicada realmente tem, e tira-as de todos os outros.
--
-- Só toca em `anew_role_permissions`, e só em linhas `operations.*`. Nenhuma
-- outra permissão do CRM é afetada.
--
-- Antes de apagar, imprime o que vai apagar e o que vai manter.
-- =============================================================================

BEGIN;

-- ┌──────────────────────────────────────────────────────────────────────┐
-- │  CONFIGURAÇÃO                                                        │
-- └──────────────────────────────────────────────────────────────────────┘
CREATE TEMP TABLE _cfg AS SELECT
  -- Os papéis DESTA pessoa ficam com as permissões. Todos os outros perdem-nas.
  '1999rubencmail@gmail.com'::text AS email;


-- ============================================================
-- Parte 0 — Verificações
-- ============================================================

DO $verificar$
DECLARE c record; v_user uuid; v_papeis integer;
BEGIN
  SELECT * INTO c FROM _cfg;

  SELECT id INTO v_user FROM public.anew_users
   WHERE lower(email) = lower(c.email) AND deleted_at IS NULL;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Não existe utilizador ativo com o email %.', c.email;
  END IF;

  SELECT count(DISTINCT m.role_id) INTO v_papeis
    FROM public.anew_memberships m
   WHERE m.user_id = v_user AND m.status = 'active';

  IF v_papeis = 0 THEN
    RAISE EXCEPTION
      'Esta pessoa não tem memberships ativas. Correr isto tirava as permissões a TODOS os papéis e deixava o módulo inacessível.';
  END IF;
END
$verificar$;


-- ============================================================
-- Parte 1 — Mostrar antes de apagar
-- ============================================================

DO $mostrar$
DECLARE
  r record;
  v_manter integer := 0;
  v_tirar  integer := 0;
BEGIN
  RAISE NOTICE '─── papéis que MANTÊM as permissões ──────';
  FOR r IN
    SELECT DISTINCT ro.name AS papel, o.name AS org
      FROM public.anew_memberships m
      JOIN public.anew_users u  ON u.id = m.user_id
      JOIN public.anew_roles ro ON ro.id = m.role_id
      LEFT JOIN public.anew_organizations o ON o.id = ro.organization_id
     WHERE lower(u.email) = lower((SELECT email FROM _cfg))
       AND m.status = 'active'
     ORDER BY 2, 1
  LOOP
    v_manter := v_manter + 1;
    RAISE NOTICE '  % — %', COALESCE(r.org, '(global)'), r.papel;
  END LOOP;

  SELECT count(*) INTO v_tirar
    FROM public.anew_role_permissions rp
   WHERE rp.permission_code LIKE 'operations.%'
     AND rp.role_id NOT IN (
       SELECT m.role_id FROM public.anew_memberships m
         JOIN public.anew_users u ON u.id = m.user_id
        WHERE lower(u.email) = lower((SELECT email FROM _cfg)) AND m.status = 'active');

  RAISE NOTICE '─── % papéis mantidos, % ligações a remover ──', v_manter, v_tirar;
END
$mostrar$;


-- ============================================================
-- Parte 2 — Restringir
-- ============================================================

DELETE FROM public.anew_role_permissions rp
 WHERE rp.permission_code LIKE 'operations.%'
   AND rp.role_id NOT IN (
     SELECT m.role_id
       FROM public.anew_memberships m
       JOIN public.anew_users u ON u.id = m.user_id
      WHERE lower(u.email) = lower((SELECT email FROM _cfg))
        AND m.status = 'active');


-- ============================================================
-- Relatório
-- ============================================================

DO $relatorio$
DECLARE
  v_restantes integer;
  v_papeis    integer;
  v_uid       uuid;
BEGIN
  SELECT count(*) INTO v_restantes
    FROM public.anew_role_permissions WHERE permission_code LIKE 'operations.%';
  SELECT count(DISTINCT role_id) INTO v_papeis
    FROM public.anew_role_permissions WHERE permission_code LIKE 'operations.%';

  RAISE NOTICE 'Ficaram % ligações, em % papéis.', v_restantes, v_papeis;

  -- A verificação que interessa: quem pediu isto continua a poder entrar.
  SELECT au.id INTO v_uid
    FROM public.anew_users u JOIN auth.users au ON au.id = u.auth_user_id
   WHERE lower(u.email) = lower((SELECT email FROM _cfg)) LIMIT 1;

  IF v_uid IS NOT NULL AND NOT public.has_anew_permission(v_uid, 'operations.view') THEN
    RAISE EXCEPTION 'A restrição deixou a própria pessoa sem acesso. A reverter.';
  END IF;

  RAISE NOTICE 'Confirmado: o acesso de quem pediu isto mantém-se.';
END
$relatorio$;

DROP TABLE _cfg;

COMMIT;


-- =============================================================================
-- PARA VOLTAR A ALARGAR (se for mesmo o que se quer)
--
--   INSERT INTO public.anew_role_permissions (role_id, permission_code)
--   SELECT r.id, p.code
--     FROM public.anew_roles r
--     CROSS JOIN public.anew_permissions p
--    WHERE r.name = 'Admin' AND r.deleted_at IS NULL AND r.is_system IS NOT TRUE
--      AND p.category = 'operations'
--   ON CONFLICT DO NOTHING;
-- =============================================================================
