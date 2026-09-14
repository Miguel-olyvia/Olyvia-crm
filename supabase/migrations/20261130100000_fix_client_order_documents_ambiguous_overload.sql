-- HOTFIX: 20261130090000 acrescentou p_date_from/p_date_to a
-- rpc_list_client_order_documents via CREATE OR REPLACE, sem DROP FUNCTION
-- da assinatura antiga (5 argumentos). Confirmado ao vivo logo a seguir à
-- aplicação: ficaram 2 overloads na BD:
--   (p_organization_id, p_search, p_status_filter, p_limit, p_offset)
--   (p_organization_id, p_search, p_status_filter, p_limit, p_offset,
--    p_date_from, p_date_to)
-- Isto é exatamente o bug já documentado e corrigido antes neste projeto em
-- 20261110650000_fix_rpc_update_lead_ambiguous_overload.sql: o PostgREST
-- fica incapaz de decidir qual dos 2 overloads chamar quando o frontend
-- chama só com os 5 argumentos antigos (PGRST203 "Multiple Choices") —
-- afeta os 3 chamadores existentes: ClientOrders.tsx, PurchaseOrders.tsx e
-- StockMovementDialog.tsx.
--
-- CORREÇÃO: remove a assinatura antiga (5 argumentos). A assinatura nova (7
-- argumentos, com p_date_from/p_date_to DEFAULT NULL) já está correta e
-- cobre as chamadas antigas sem alteração de comportamento (os 2 parâmetros
-- novos são opcionais).

DROP FUNCTION IF EXISTS public.rpc_list_client_order_documents(uuid, text, text, integer, integer);

-- ============================================================
-- Notas de verificação (não executadas)
-- ============================================================
-- 1. SELECT pg_get_function_identity_arguments(oid) FROM pg_proc
--    WHERE proname = 'rpc_list_client_order_documents';
--    -> deve devolver exatamente 1 linha, com os 7 argumentos.
-- 2. Chamar a RPC só com os 5 argumentos antigos (nomeados) continua a
--    funcionar sem erro, sem PGRST203.
