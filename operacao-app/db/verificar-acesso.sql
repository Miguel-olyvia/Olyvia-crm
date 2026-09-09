-- =============================================================================
-- Operações — verificar se o acesso ficou mesmo montado
--
-- Só lê. É a pergunta que interessa antes de abrir a aplicação: "eu, com as
-- minhas memberships e os meus papéis, tenho as permissões que a app exige?"
--
-- Chama as MESMAS funções que a RLS chama. Se aqui der `true`, a app vê; se
-- der `false`, a app mostra listas vazias e ninguém percebe porquê.
-- =============================================================================

WITH eu AS (
  SELECT au.id AS auth_id, u.id AS user_id
    FROM public.anew_users u
    JOIN auth.users au ON au.id = u.auth_user_id
   WHERE lower(u.email) = lower('1999rubencmail@gmail.com')
     AND u.deleted_at IS NULL
   LIMIT 1
)
SELECT
  (SELECT count(*) FROM public.get_user_visible_org_ids((SELECT auth_id FROM eu)))
    AS orgs_visiveis,
  (SELECT count(*) FROM public.anew_memberships m WHERE m.user_id = (SELECT user_id FROM eu) AND m.status = 'active')
    AS memberships,
  (SELECT p.funcao FROM public.ops_utilizador_perfil p WHERE p.utilizador_id = (SELECT user_id FROM eu) LIMIT 1)
    AS funcao_operacoes,
  public.has_anew_permission((SELECT auth_id FROM eu), 'operations.view')
    AS pode_abrir_modulo,
  public.has_anew_permission((SELECT auth_id FROM eu), 'operations.orders.view')
    AS pode_ver_ordens,
  public.has_anew_permission((SELECT auth_id FROM eu), 'operations.orders.view_all')
    AS ve_todas_as_ordens,
  public.has_anew_permission((SELECT auth_id FROM eu), 'operations.locations.view')
    AS pode_ver_locais,
  public.is_system_admin_user((SELECT auth_id FROM eu))
    AS e_system_admin;
