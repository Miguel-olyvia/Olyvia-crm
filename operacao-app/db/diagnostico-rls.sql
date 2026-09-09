-- =============================================================================
-- Operações — porque é que a app diz "Sem acesso a Operações"
--
-- Só lê, e reverte no fim. Não escreve nada.
--
-- O `db/verificar-acesso.sql` deu tudo `true`, mas correu como `postgres`, que
-- ignora a RLS. A app lê com o JWT do utilizador, e aí a RLS aplica-se. Esta
-- query assume a identidade do utilizador e faz a MESMA leitura que a app faz.
--
-- É a diferença entre "tens a permissão" e "a política deixa-te ver a linha".
-- =============================================================================

BEGIN;

SET LOCAL ROLE authenticated;
-- O auth.users.id da conta (não o anew_users.id).
SET LOCAL request.jwt.claim.sub = 'cb3792b7-1da6-42ff-b23c-86b96c040989';
SET LOCAL request.jwt.claims = '{"sub":"cb3792b7-1da6-42ff-b23c-86b96c040989","role":"authenticated"}';

SELECT
  -- 1. A identidade chegou?
  auth.uid()                                    AS auth_uid,

  -- 2. current_business_user_id() NÃO lê anew_users.auth_user_id: lê a tabela
  --    auth_to_business_user_map. Se a conta veio do signup e não ficou
  --    mapeada, isto vem NULL e a política falha por aqui.
  public.current_business_user_id()             AS business_user_id,

  -- 3. Os dois ramos da política de ops_utilizador_perfil.
  public.has_anew_permission(auth.uid(), 'operations.costs.view')
                                                AS ramo_costs_view,
  public.is_system_admin_user(auth.uid())       AS ramo_system_admin,

  -- 4. A app lê ops_v_equipa. A vista é security_invoker, por isso a RLS de
  --    ops_utilizador_perfil E a de anew_users aplicam-se às duas.
  (SELECT count(*) FROM public.ops_v_equipa)            AS linhas_na_vista,
  (SELECT count(*) FROM public.ops_utilizador_perfil)   AS linhas_no_perfil,
  (SELECT count(*) FROM public.anew_users)              AS linhas_em_anew_users,

  -- 5. O que a app faz exatamente: a função do utilizador.
  (SELECT p.funcao FROM public.ops_v_equipa p
    WHERE p.utilizador_id = '09923f59-08f6-40d8-a37b-051b7dcadf30'
      AND p.ativo LIMIT 1)                              AS funcao_que_a_app_le;

ROLLBACK;

-- =============================================================================
-- COMO LER O RESULTADO
--
--   linhas_em_anew_users = 0
--     → a RLS de anew_users esconde-te a ti próprio. Como ops_v_equipa faz
--       JOIN a essa tabela e é security_invoker, a vista devolve vazio mesmo
--       que o perfil exista. É a causa mais provável.
--
--   business_user_id = NULL
--     → a conta não está em auth_to_business_user_map. O trigger que a
--       preenche corre no INSERT de anew_users; contas criadas por caminhos
--       antigos podem ter ficado de fora.
--
--   linhas_no_perfil = 0 mas ramo_costs_view = true
--     → a política de ops_utilizador_perfil está a barrar por
--       organization_id: a organização do perfil não está entre as visíveis.
--
--   funcao_que_a_app_le = 'admin'
--     → a base está bem e o problema é do lado do browser (sessão antiga em
--       cache). Sai e volta a entrar.
-- =============================================================================
