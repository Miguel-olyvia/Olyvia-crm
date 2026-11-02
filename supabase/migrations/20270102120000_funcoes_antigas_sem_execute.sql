-- ============================================================
-- 20270102120000_funcoes_antigas_sem_execute
-- ============================================================
-- O que faz
--   Tira EXECUTE a PUBLIC, anon e authenticated de três funções antigas
--   SECURITY DEFINER que ninguém do código atual chama:
--     duplicate_quote(uuid)                     -- substituída pela edge
--                                                 duplicate-quote +
--                                                 rpc_duplicate_quote_insert
--     create_company_base_roles(uuid, uuid)     -- criava papéis base com
--                                                 permissões (escalada)
--     clone_template_roles_for_company()        -- função de trigger sem
--                                                 nenhum trigger ligado
--
-- Verificado antes
--   - src/ e supabase/functions: nenhuma chamada rpc() a estas funções (a
--     tool "duplicate_quote" da Olyvia AI chama a edge duplicate-quote).
--   - Nenhuma função viva da base chama estas três; nenhum trigger usa
--     clone_template_roles_for_company.
--   service_role e postgres mantêm EXECUTE. As funções não são apagadas.
-- ============================================================

BEGIN;

REVOKE EXECUTE ON FUNCTION public.duplicate_quote(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_company_base_roles(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clone_template_roles_for_company() FROM PUBLIC, anon, authenticated;

COMMIT;
