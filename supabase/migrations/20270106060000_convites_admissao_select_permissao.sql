-- ============================================================
-- 20270106060000_convites_admissao_select_permissao
-- ============================================================
-- O que faz (Lote A, item 8): a política SELECT pessoas_convites_admissao_select pedia só hr.pessoas.view na organização.
--   Passa a pedir hr.pessoas.convite.enviar OU hr.onboarding.approve na organização (has_anew_permission_in_org), as permissões
--   de quem trata da admissão.
-- Nota: hoje authenticated NÃO tem SELECT em nenhuma coluna da tabela (has_any_column_privilege = false; o RH lê o convite só por
--   rpc_hr_convite_admissao_resumo e restantes RPCs SECURITY DEFINER), por isso a política é defesa em profundidade: nenhum ecrã
--   lê a tabela diretamente (grep src/) e nada muda para os utilizadores.
-- Política reescrita a partir de pg_policies (viva, 4/11/2026). Sem tabelas nem colunas novas.
-- ============================================================

SET lock_timeout = '5s';

DROP POLICY IF EXISTS pessoas_convites_admissao_select ON public.pessoas_convites_admissao;
CREATE POLICY pessoas_convites_admissao_select ON public.pessoas_convites_admissao
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.convite.enviar'::text, pessoas_convites_admissao.organization_id))
    OR (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.onboarding.approve'::text, pessoas_convites_admissao.organization_id))
  );
