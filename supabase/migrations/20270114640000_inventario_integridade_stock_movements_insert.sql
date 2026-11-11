-- ============================================================
-- 20270114640000_inventario_integridade_stock_movements_insert
-- ============================================================
-- Lote «integridade do inventário», ficheiro 5 de 5 (stock_movements). Decisão 8.1 do desenho: os movimentos de stock só
-- entram pelas funções do sistema.
--
-- O que corrige: stock_movements_insert_policy deixava quem tem inventory.edit inserir movimentos diretamente pelo PostgREST,
--   com qualquer tipo, saltando a numeração do documento, a validação do tipo, as verificações das RPCs e o cálculo do custo.
--   Com o ficheiro 1 (20270114600000) esse INSERT já falharia — fn_stock_movements_apply é INVOKER e a guarda de stocks
--   recusa-lhe a escrita como authenticated —, mas com uma mensagem enganadora sobre stocks. Aqui fica explícito, como já
--   estão stock_movements_no_update e stock_movements_no_delete (USING/WITH CHECK false).
--
-- Como: ALTER POLICY … WITH CHECK (false), mantendo nome, comando e papel (authenticated). Antes, confirma que a política viva
--   é a esperada (md5 de qual||with_check = cbbf7f2f819c2f51433a7efc893afff2, lido no remoto a 11/11); se mudou entretanto,
--   a migration para em vez de a sobrescrever às cegas. Se já estiver WITH CHECK (false), não faz nada (repetível).
--   As RPCs (rpc_adjust_stock, rpc_register_stock_*, receções, contagens, encomendas de cliente...) são SECURITY DEFINER do
--   postgres, que tem BYPASSRLS: não avaliam esta política e não mudam. Lido no código: nenhum .from('stock_movements').insert
--   em src/ nem em supabase/functions/.
--   O gatilho vivo trg_stock_movements_00_guard_reversal (BEFORE INSERT, padrão current_user) continua igual.
-- Nenhuma RPC nem GRANT muda. lock_timeout de 5s (ALTER POLICY tranca a tabela).
-- ============================================================

SET lock_timeout = '5s';

BEGIN;

DO $pol$
DECLARE
  v_md5        text;
  v_with_check text;
BEGIN
  SELECT md5(coalesce(p.qual, '')::text || coalesce(p.with_check, '')::text), p.with_check::text
    INTO v_md5, v_with_check
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = 'stock_movements' AND p.policyname = 'stock_movements_insert_policy'
    AND p.cmd::text = 'INSERT';

  IF v_md5 IS NULL THEN
    RAISE EXCEPTION '20270114640000: stock_movements_insert_policy não existe (ou já não é de INSERT)';
  END IF;

  IF v_with_check IS NOT DISTINCT FROM 'false' THEN
    RETURN;  -- já fechada: nada a fazer
  END IF;

  IF v_md5 <> 'cbbf7f2f819c2f51433a7efc893afff2' THEN
    RAISE EXCEPTION '20270114640000: stock_movements_insert_policy mudou desde o desenho (md5 %); reler antes de fechar', v_md5;
  END IF;

  ALTER POLICY stock_movements_insert_policy ON public.stock_movements
    TO authenticated
    WITH CHECK (false);
END $pol$;

-- ─── Conferir ────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies p
                 WHERE p.schemaname = 'public' AND p.tablename = 'stock_movements'
                   AND p.policyname = 'stock_movements_insert_policy'
                   AND p.cmd::text = 'INSERT'
                   AND p.roles::text = '{authenticated}'
                   AND p.qual IS NULL
                   AND p.with_check::text = 'false') THEN
    RAISE EXCEPTION '20270114640000: stock_movements_insert_policy não ficou WITH CHECK (false) para authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                 WHERE t.tgrelid = 'public.stock_movements'::regclass
                   AND t.tgname::text = 'trg_stock_movements_00_guard_reversal'
                   AND t.tgenabled::text = 'O') THEN
    RAISE EXCEPTION '20270114640000: esperava o gatilho vivo trg_stock_movements_00_guard_reversal';
  END IF;
END $chk$;

COMMIT;

RESET lock_timeout;
