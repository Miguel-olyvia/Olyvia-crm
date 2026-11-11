-- ============================================================
-- 20270114990000_stocks_sem_delete_direto
-- ============================================================
-- Falha (agravante do F12 no desenho; pendente «L1»): a política stocks_delete_policy deixa um DELETE físico direto pela API a
--   quem tem inventory.delete. O próximo movimento criaria uma linha nova a partir de 0 e o saldo deixava de bater com o livro de movimentos, por cima da recusa de rpc_delete_stock (20270114900000).
-- Decisão (D1): fechar. ALTER POLICY stocks_delete_policy ON public.stocks USING (false). Apagar passa só pela RPC (soft delete),
--   que é SECURITY DEFINER do dono da tabela e não é afetada pela RLS.
-- Pré-condição: a política viva é a que foi lida a 11/11 (DELETE, PERMISSIVE, para authenticated, md5 da expressão
--   e5bd01c612e7067add082a7b369d76e0); se mudou, aborta. ALTER POLICY mantém o nome, o comando e os papéis. A política restritiva
--   system_admin_pii_default_deny (ALL) não muda. Lido a 11/11: não há outra política permissiva de DELETE ou ALL.
-- Lido a 11/11: nenhum ecrã (src/), Edge Function (supabase/functions/) nem função da base faz DELETE físico nesta tabela.
-- Efeito para quem chama a API: um DELETE direto passa a apagar 0 linhas, sem erro (a RLS filtra; não recusa).
-- Bloqueio: ALTER POLICY toma ACCESS EXCLUSIVE em stocks até ao COMMIT; ficheiro próprio, lock_timeout de 5s.
-- Uso normal: nada. Eliminar e Restaurar no ecrã usam as RPCs.
-- Desenho: vault/ficheiros/inventario/correcao-reteste-desenho.md (fechado; decisões do coordenador e revisão de segurança).
-- Base: RH (uetjghdkwbywbftedtth), que só tem a nike. Nada disto chega à Mudelar por esta base.
-- Aplicar: SET lock_timeout de sessão antes do BEGIN e RESET no fim (o CLI pode não correr o ficheiro numa só transação).
-- Teste: supabase/tests/inventario_reteste_buracos.test.sql — correr ANTES do db push (vermelho) e DEPOIS (verde).
-- ============================================================

SET lock_timeout = '5s';

BEGIN;

DO $pre$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies p
                 WHERE p.schemaname = 'public' AND p.tablename = 'stocks' AND p.policyname = 'stocks_delete_policy'
                   AND p.cmd::text = 'DELETE' AND p.permissive::text = 'PERMISSIVE'
                   AND array_to_string(p.roles, ',')::text = 'authenticated'
                   AND md5(coalesce(p.qual, '')) = 'e5bd01c612e7067add082a7b369d76e0') THEN
    RAISE EXCEPTION '20270114990000: a política stocks_delete_policy mudou desde que foi lida; reler antes de aplicar';
  END IF;
END $pre$;

ALTER POLICY stocks_delete_policy ON public.stocks USING (false);

DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies p
                 WHERE p.schemaname = 'public' AND p.tablename = 'stocks' AND p.policyname = 'stocks_delete_policy'
                   AND p.cmd::text = 'DELETE' AND p.permissive::text = 'PERMISSIVE'
                   AND array_to_string(p.roles, ',')::text = 'authenticated'
                   AND p.qual = 'false') THEN
    RAISE EXCEPTION '20270114990000: a política stocks_delete_policy não ficou USING (false)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies p
             WHERE p.schemaname = 'public' AND p.tablename = 'stocks'
               AND p.cmd::text IN ('DELETE', 'ALL') AND p.permissive::text = 'PERMISSIVE'
               AND p.policyname <> 'stocks_delete_policy') THEN
    RAISE EXCEPTION '20270114990000: há outra política permissiva de DELETE em stocks';
  END IF;
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.stocks'::regclass) THEN
    RAISE EXCEPTION '20270114990000: a RLS de stocks não está ativa';
  END IF;
END $chk$;

COMMIT;

RESET lock_timeout;
