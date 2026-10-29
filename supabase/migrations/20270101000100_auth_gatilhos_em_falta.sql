-- Os gatilhos de auth.users que faltam na base RH (29 de outubro de 2026). Só acrescenta.
-- Defeito (visto no teste no browser, negócio 1009): "Enviar proposta" no /negocios chama a create-client-portal-access, que cria a conta
-- no Auth e espera que o gatilho on_auth_user_created (handle_new_user) crie a linha em anew_users. Nesta base o gatilho não existe (só há
-- os gatilhos das chaves estrangeiras em auth.users): a linha nunca aparece, a função apaga a conta e devolve "Falha ao registar o
-- utilizador no sistema". Nenhuma conta nova do portal (nem de auto-registo) se conseguia criar.
-- O on_auth_user_created vinha da base original e nunca foi migrado; o on_auth_account_changed (20261110260000, a auditoria das mudanças
-- de email e de password) consta como aplicado mas também não está. As funções handle_new_user e handle_auth_account_changed existem.
-- Cada gatilho só se cria se ainda não existir (numa base que já os tem, não muda nada).

SET lock_timeout = '5s';

DO $gatilhos$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace s ON s.oid = c.relnamespace
                 WHERE s.nspname = 'auth' AND c.relname = 'users' AND t.tgname = 'on_auth_user_created') THEN
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace s ON s.oid = c.relnamespace
                 WHERE s.nspname = 'auth' AND c.relname = 'users' AND t.tgname = 'on_auth_account_changed') THEN
    CREATE TRIGGER on_auth_account_changed AFTER UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_auth_account_changed();
  END IF;
END $gatilhos$;
