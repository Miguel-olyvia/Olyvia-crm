-- ============================================================
-- 20270112110000 — revogar_funcoes_preco_anon
-- ============================================================
-- O que faz: cinco funções SECURITY DEFINER de preço/stock eram executáveis por PUBLIC, anon e authenticated sem verificar
--   organização nem permissão (auditoria inventário a15: anon leu o purchase_price de um produto com calculate_product_margin):
--     calculate_product_margin(uuid), get_effective_price(uuid,uuid,price_type), get_effective_stock(uuid,uuid,uuid),
--     get_bundle_available_stock(uuid), calculate_bundle_original_price(uuid).
--   Ninguém as chama hoje como anon/authenticated (verificado a 9/11/2026 na base RH uetjghdkwbywbftedtth): nenhum .rpc() em src/
--   nem em supabase/functions (só rótulos de origem nos protótipos), nenhuma outra função SQL, vista, política, default, check ou
--   tarefa cron as usa. Por isso: REVOKE EXECUTE de PUBLIC, anon e authenticated; service_role (e o dono) mantém.
--   As funções não mudam (guarda md5 só para garantir que são as mesmas que foram verificadas).
--
-- Reversão (só como migration nova): GRANT EXECUTE ... TO PUBLIC, anon, authenticated nas cinco.
-- ============================================================
SET lock_timeout = '5s';

DO $do$
BEGIN
  IF md5(pg_get_functiondef('public.calculate_product_margin(uuid)'::regprocedure)) <> 'f8c5d5fa49d62716fa90515f437f0802'
     OR md5(pg_get_functiondef('public.get_effective_price(uuid,uuid,price_type)'::regprocedure)) <> '3c04848545435429b53b01b0a6cb98f9'
     OR md5(pg_get_functiondef('public.get_effective_stock(uuid,uuid,uuid)'::regprocedure)) <> '359d5e9c05b7e6969fe75c5562b82df8'
     OR md5(pg_get_functiondef('public.get_bundle_available_stock(uuid)'::regprocedure)) <> 'c77a7feffaa5096c1464547f5cb31522'
     OR md5(pg_get_functiondef('public.calculate_bundle_original_price(uuid)'::regprocedure)) <> '81b3c9152e9cb1c4b6b58ffe0fa4647c' THEN
    RAISE EXCEPTION 'Guarda: uma das 5 funções de preço/stock mudou desde 9/11/2026. Rever esta migration.';
  END IF;
END $do$;

REVOKE EXECUTE ON FUNCTION public.calculate_product_margin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_effective_price(uuid, uuid, public.price_type) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_effective_stock(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_bundle_available_stock(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_bundle_original_price(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.calculate_product_margin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_effective_price(uuid, uuid, public.price_type) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_effective_stock(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_bundle_available_stock(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_bundle_original_price(uuid) TO service_role;
