-- ============================================================
-- 20261230100000_fornecedores_permissoes_super_admin
-- ============================================================
-- O que faz (so dados de configuracao; nenhuma funcao nem tabela e alterada)
--   1. Cria no catalogo anew_permissions as 7 permissoes de fornecedores,
--      compras e rececao que a base de RH nao tinha:
--        suppliers.portal_manage
--        purchase_orders.manage, purchase_orders.view_prices
--        receiving.download_proof, receiving.learn_codes,
--        receiving.manage_delivery_notes, receiving.receive
--   2. Da essas 7 ao papel GLOBAL de sistema super_admin (anew_roles.code =
--      'super_admin', is_system, organization_id nulo). Mais nenhum papel.
--
-- Porque
--   Lido na base de RH (so select): o super_admin ja tinha as 27 permissoes
--   destas categorias que existem no catalogo. Das funcoes da base que citam
--   as 7 em falta, 10 recusam o super_admin sem elas (todas SECURITY DEFINER,
--   com has_anew_permission): rpc_supplier_portal_invite_prepare,
--   _resend_prepare e _revoke_access (suppliers.portal_manage);
--   rpc_delivery_note_save, _close, _cancel e _reopen
--   (receiving.manage_delivery_notes); rpc_product_code_learn e _remove
--   (receiving.learn_codes); rpc_receive_by_code (receiving.receive).
--   rpc_supplier_portal_status e rpc_receiving_lookup nao falham: so passam a
--   devolver can_manage e can_receive a verdadeiro. purchase_orders.manage,
--   purchase_orders.view_prices e receiving.download_proof nao sao exigidas
--   por nenhuma funcao nem politica da base: so abrem ecras no frontend
--   (Suppliers, Receiving, DeliveryNoteDetail, StockMovements).
--
-- Origem das definicoes: codigo, nome, categoria e se e perigosa vem da lista
--   de permissoes do ecra de papeis (permissoesExemplo.ts). As descricoes sao
--   escritas a partir dos nomes das funcoes e dos ecras, nao copiadas do
--   catalogo da base principal (que nao se consultou).
--
-- Fora de ambito (nao se concede nada): inventory.manage e inventory.receive,
--   que tambem faltam no catalogo mas sao do armazem e nao de fornecedores.
--   Nenhum outro papel recebe estas permissoes.
--
-- Porque o set_config: anew_role_permissions tem o trigger
--   protect_system_role_permissions, que so deixa escrever em papeis de
--   sistema com request.jwt.claims->>'role' = 'service_role'. A claim e posta
--   LOCAL a transaccao, so a volta do INSERT, e restaurada depois (nunca
--   texto vazio: ''::jsonb rebenta). Nenhum trigger e desligado.
--
-- Idempotente: ON CONFLICT DO NOTHING.
-- Reversao (NAO aplicar sem decisao; so como migration nova): apagar as 7
--   linhas de anew_role_permissions do super_admin e as 7 de anew_permissions,
--   com a mesma claim local.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- 1. Catalogo
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('suppliers.portal_manage', 'Gerir acesso dos fornecedores ao portal', 'Convidar um fornecedor para o portal, reenviar o convite, ver o estado do acesso e revogá-lo.', 'suppliers', NULL, 3, true, 'organization', false),
  ('purchase_orders.manage', 'Gerir encomendas de compra', 'Ações de gestão das encomendas de compra, para além de criar e editar.', 'purchase_orders', NULL, 4, false, 'organization', false),
  ('purchase_orders.view_prices', 'Ver preços das encomendas de compra', 'Ver os preços e os totais das linhas das encomendas de compra.', 'purchase_orders', NULL, 5, false, 'organization', false),
  ('receiving.download_proof', 'Descarregar comprovativo de receção', 'Descarregar o comprovativo de uma receção de mercadoria.', 'receiving', NULL, 1, false, 'organization', false),
  ('receiving.learn_codes', 'Associar códigos a produtos', 'Na receção, associar e remover os códigos lidos (de barras ou do fornecedor) aos produtos.', 'receiving', NULL, 2, false, 'organization', false),
  ('receiving.manage_delivery_notes', 'Gerir guias do fornecedor', 'Guardar, fechar, cancelar e reabrir as guias de remessa do fornecedor na receção.', 'receiving', NULL, 3, false, 'organization', false),
  ('receiving.receive', 'Receber mercadoria por leitura', 'Dar entrada de mercadoria lendo um código, contra as linhas de encomenda em aberto.', 'receiving', NULL, 4, true, 'organization', false)
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  v_role       uuid;
  v_n          int;
  v_prev_claim text;
  v_codes      text[] := ARRAY['suppliers.portal_manage','purchase_orders.manage','purchase_orders.view_prices',
                               'receiving.download_proof','receiving.learn_codes','receiving.manage_delivery_notes',
                               'receiving.receive'];
BEGIN
  -- Guarda: as 7 estao no catalogo.
  SELECT count(*) INTO v_n FROM public.anew_permissions p WHERE p.code = ANY (v_codes);
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'GUARDA: esperadas 7 permissoes no catalogo, encontradas %', v_n;
  END IF;

  -- 2. super_admin global
  SELECT count(*) INTO v_n
  FROM public.anew_roles r
  WHERE r.code = 'super_admin' AND r.is_system = true AND r.organization_id IS NULL;
  IF v_n = 0 THEN
    RAISE NOTICE 'Papel super_admin global nao existe nesta base: nao se concede nada.';
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'GUARDA: % papeis super_admin globais de sistema (esperado 1)', v_n;
  ELSE
    SELECT r.id INTO v_role
    FROM public.anew_roles r
    WHERE r.code = 'super_admin' AND r.is_system = true AND r.organization_id IS NULL;

    v_prev_claim := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

    INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
    SELECT v_role, c, NULL::uuid
    FROM unnest(v_codes) AS c
    ON CONFLICT (role_id, permission_code) DO NOTHING;

    PERFORM set_config(
      'request.jwt.claims',
      CASE WHEN coalesce(v_prev_claim, '') = '' THEN '{}' ELSE v_prev_claim END,
      true);

    SELECT count(*) INTO v_n
    FROM public.anew_role_permissions rp
    WHERE rp.role_id = v_role AND rp.permission_code = ANY (v_codes);
    IF v_n <> 7 THEN
      RAISE EXCEPTION 'CONFERIR: o super_admin tem % de 7 permissoes novas', v_n;
    END IF;
  END IF;

  -- 3. A claim nao ficou vazia nem em service_role.
  IF coalesce(current_setting('request.jwt.claims', true), '') = '' THEN
    RAISE EXCEPTION 'CONFERIR: request.jwt.claims ficou vazia';
  END IF;
  IF (current_setting('request.jwt.claims', true)::jsonb ->> 'role') IS NOT DISTINCT FROM 'service_role'
     AND (nullif(v_prev_claim, '')::jsonb ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'CONFERIR: a claim service_role ficou activa';
  END IF;
END $$;

COMMIT;
