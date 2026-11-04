-- ============================================================
-- 20270106440000_reverter_guarda_quantidade_stocks
-- ============================================================
-- O que faz: reverte o 20270106080000 (Lote A, item 10). O gatilho trg_stocks_00_guardar_quantidade e a função
--   fn_stocks_guardar_quantidade eram integridade de dados (quantidade/custo/produto/armazém do stock só por movimento),
--   não permissões. Repõe-se o comportamento anterior: a escrita direta em stocks volta a ser decidida só pelas políticas RLS
--   (stocks_update_policy / insert com inventory.edit, etc.), que ficam intactas.
-- O 20270106080000 só criou esta função e este gatilho; não há mais nada a reverter.
-- Sem tabelas nem colunas novas.
-- ============================================================

SET lock_timeout = '5s';

DROP TRIGGER IF EXISTS trg_stocks_00_guardar_quantidade ON public.stocks;
DROP FUNCTION IF EXISTS public.fn_stocks_guardar_quantidade();
