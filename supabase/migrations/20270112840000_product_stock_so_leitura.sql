-- ============================================================
-- 20270112840000 — product_stock_so_leitura
-- ============================================================
-- O que faz (auditoria de permissões, inventário — mesmo padrão do B5, 20270112310000_po_linhas_so_por_rpc):
--   product_stock é a tabela antiga de stock por localização (o stock real está em stocks, por armazém). As políticas de
--   escrita deixavam authenticated inserir/alterar/apagar linhas diretamente com fn_tem_alguma_permissao(inventory.edit/
--   adjust/delete), que não é por organização (basta ter a permissão em qualquer organização + o produto ser visível).
--   Escrita direta aqui contorna os movimentos de stock (sem stock_movements, sem reservas EC) e alimenta
--   get_effective_stock / get_bundle_available_stock e a leitura de stock do ai-assistant com números inventados.
--
--   Verificado a 10/11/2026 (base RH uetjghdkwbywbftedtth):
--     - src/ e supabase/functions (feature/rh-pessoas e origin/main): nenhum .insert/.update/.upsert/.delete em
--       product_stock; só leituras (ai-assistant/tools/catalog_read.ts: get_product_details e get_product_stock).
--     - nenhuma função (qualquer esquema, definer ou invoker) escreve em product_stock; só get_effective_stock e
--       get_bundle_available_stock a leem (ambas SECURITY DEFINER). Sem gatilhos na tabela, sem cron, sem vistas.
--     - a tabela tem 0 linhas.
--   Por isso: apagam-se as três políticas de escrita. A leitura (auth_select_product_stock) não muda. Sem política, o RLS
--   recusa INSERT e UPDATE/DELETE diretos de authenticated (anon já não tinha nenhuma política); service_role e o dono da
--   tabela continuam a escrever.
--
-- Reversão (só como migration nova): recriar as três políticas com o texto de pg_policies de 10/11/2026 (md5 na guarda).
-- ============================================================
SET lock_timeout = '5s';

DO $do$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'product_stock'
     AND (policyname, cmd, md5(coalesce(qual,'') || '|' || coalesce(with_check,''))) IN (
       ('auth_delete_product_stock', 'DELETE', '780c384bc408ed9955437f067af92ed1'),
       ('auth_insert_product_stock', 'INSERT', '88f7cf2c917d8bd7fae9498bb86b3ae4'),
       ('auth_update_product_stock', 'UPDATE', '0d2cb8d9b29f90bb2320e499aae08cdd'));
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Guarda: as políticas de escrita de product_stock mudaram desde 10/11/2026 (encontradas % de 3). Rever esta migration.', v_n;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND p.prokind IN ('f', 'p') AND p.prolang <> 13
       AND NOT p.prosecdef
       AND pg_get_functiondef(p.oid) ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?product_stock\M') THEN
    RAISE EXCEPTION 'Guarda: há uma função SECURITY INVOKER que escreve em product_stock. Rever esta migration.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.product_stock'::regclass AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Guarda: product_stock passou a ter gatilhos. Rever esta migration.';
  END IF;
END $do$;

DROP POLICY "auth_insert_product_stock" ON public.product_stock;
DROP POLICY "auth_update_product_stock" ON public.product_stock;
DROP POLICY "auth_delete_product_stock" ON public.product_stock;
