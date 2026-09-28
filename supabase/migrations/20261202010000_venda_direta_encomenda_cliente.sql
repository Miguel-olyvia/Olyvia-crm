-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Venda Direta — Fase 5: Encomenda de Cliente                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Quando o cliente aceita uma venda direta no portal (com OTP), passa a nascer
-- por baixo um orçamento interno + um client_contracts assinado, exactamente
-- como numa Encomenda Cliente manual. É isso que faz a venda aparecer em
-- Encomendas Clientes e que liga a venda ao stock e aos fornecedores.
--
-- ── Porque é uma RPC e não INSERTs encadeados na edge function ──────────────
-- O bloco equivalente do `sign_proposal` (client-portal-action) faz vários
-- round-trips PostgREST, cada um na sua transação, embrulhados num try/catch
-- que engole falhas. Aqui isso não serve: se o contrato for criado e a
-- promoção a `signed` falhar, fica uma encomenda invisível (a listagem filtra
-- status IN ('signed','assinado')) e sem dedução de stock nem pedido ao
-- fornecedor — um estado que ninguém vê e que não se reconstitui. Uma função
-- plpgsql é uma transação real: ou nasce tudo, ou não nasce nada.
--
-- ── O detalhe que não pode falhar ───────────────────────────────────────────
-- O contrato entra em 'draft' e leva UPDATE para 'signed' NA MESMA TRANSAÇÃO.
-- Os gatilhos pesados (trg_contract_stock_deduction, trg_contract_supplier_-
-- request) são AFTER UPDATE OF status: um INSERT já com 'signed' não os
-- dispara e a encomenda ficaria sem stock deduzido e sem PO, em silêncio.
-- Mesmo padrão de rpc_create_manual_client_order (20261130200000).
--
-- ── Linhas internas (visible_to_client = false) ─────────────────────────────
-- DECISÃO DE PRODUTO (não "corrigir"): as linhas internas ENTRAM nas
-- quote_lines, mas NÃO entram no total.
--   · Entram porque uma linha interna é uma linha real — tem produto/serviço,
--     quantidade e custo. Não é cobrada ao cliente, mas alguém a vai entregar.
--     Deixá-la de fora significaria material a sair do armazém sem dedução e
--     sem pedido ao fornecedor: desvio silencioso de inventário.
--   · Não somam ao total porque direct_sales.subtotal/total já são calculados
--     só com as visíveis (DirectSaleEditor.tsx:362-368) e são esses os valores
--     impressos na proforma que o cliente aceitou com OTP. O contrato tem de
--     bater certo com esse documento.
-- Consequência assumida: a soma das linhas da encomenda não bate com o
-- total_value. O `visible_to_client` é copiado para quote_lines precisamente
-- para a UI poder marcar essas linhas como não cobradas. Nota: nenhum dos
-- gatilhos de stock/fornecedor lê essa coluna, por isso copiá-la é
-- informativo e não altera o que é deduzido nem encomendado.
--
-- ── Segurança ───────────────────────────────────────────────────────────────
-- Quem aceita no portal é o cliente, não um utilizador do CRM: não há
-- auth.uid() do CRM nem current_business_user_id(). Por isso esta função:
--   · recebe SÓ p_direct_sale_id e lê todo o resto da própria venda — nada
--     vem do chamador, logo não há nada para forjar (nem preços, nem
--     organização, nem cliente);
--   · é concedida APENAS a service_role. Nunca a authenticated: caso
--     contrário qualquer sessão autenticada poderia forçar a criação de
--     encomendas assinadas, com dedução de stock, a partir do browser.
-- A autorização de quem chama é feita a montante, no client-portal-action,
-- por assertOwnership + consumeVerifiedOtp.
--
-- Sem app.audit_bypass, de propósito: os gatilhos de auditoria e de negócio
-- têm de correr normalmente (mesma razão documentada em 20261130200000:40-43).

CREATE OR REPLACE FUNCTION public.rpc_create_direct_sale_order(p_direct_sale_id uuid)
RETURNS public.client_contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sale         public.direct_sales;
  v_contract     public.client_contracts;
  v_client_id    uuid;
  v_root_org_id  uuid;
  v_entity_name  text;
  v_quote_id     uuid;
  v_line_count   integer;
BEGIN
  IF p_direct_sale_id IS NULL THEN
    RAISE EXCEPTION 'É obrigatório indicar a venda direta' USING ERRCODE = 'check_violation';
  END IF;

  -- FOR UPDATE serializa aceitações concorrentes da mesma venda: sem isto,
  -- dois pedidos simultâneos passariam os dois pela guarda de idempotência
  -- abaixo e criariam duas encomendas (com dedução de stock a dobrar).
  SELECT * INTO v_sale
    FROM public.direct_sales
   WHERE id = p_direct_sale_id
     AND deleted_at IS NULL
     FOR UPDATE;

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'Venda direta não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Idempotência ─────────────────────────────────────────────────────────
  -- Reaceitação não cria uma segunda encomenda, pela mesma razão por que não
  -- gera um segundo número de proforma: um documento emitido não se duplica.
  IF v_sale.client_contract_id IS NOT NULL THEN
    SELECT * INTO v_contract
      FROM public.client_contracts
     WHERE id = v_sale.client_contract_id;

    IF v_contract.id IS NOT NULL THEN
      RETURN v_contract;
    END IF;
    -- Ponteiro pendurado (contrato apagado à mão): cai para a criação normal.
  END IF;

  IF v_sale.status IS DISTINCT FROM 'aceite' THEN
    RAISE EXCEPTION 'A encomenda só é criada depois de a venda direta ser aceite (estado actual: %)', v_sale.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_sale.created_by IS NULL THEN
    RAISE EXCEPTION 'Venda direta sem autor; não é possível atribuir a encomenda' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Cliente ──────────────────────────────────────────────────────────────
  -- Exigir a ficha em anew_clients é também a validação de âmbito: a
  -- encomenda só pode existir para um cliente real desta organização.
  -- Mesma regra de rpc_create_manual_client_order.
  IF v_sale.entity_id IS NULL THEN
    RAISE EXCEPTION 'Venda direta sem cliente associado' USING ERRCODE = 'check_violation';
  END IF;

  SELECT c.id, c.root_organization_id
    INTO v_client_id, v_root_org_id
    FROM public.anew_clients c
   WHERE c.entity_id = v_sale.entity_id
     AND c.organization_id = v_sale.organization_id
     AND c.deleted_at IS NULL
   LIMIT 1;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado nesta organização' USING ERRCODE = 'no_data_found';
  END IF;

  v_root_org_id := COALESCE(v_sale.root_organization_id, v_root_org_id, v_sale.organization_id);

  SELECT e.display_name INTO v_entity_name
    FROM public.anew_entities e
   WHERE e.id = v_sale.entity_id;

  SELECT count(*) INTO v_line_count
    FROM public.direct_sale_lines l
   WHERE l.direct_sale_id = v_sale.id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'A venda direta não tem linhas' USING ERRCODE = 'check_violation';
  END IF;

  -- Dentro da função de propósito: set_audit_context usa set_config(..., true),
  -- ou seja é LOCAL à transação. Chamada antes, de fora, não chegaria aqui.
  PERFORM public.set_audit_context(v_sale.created_by, 'portal_direct_sale');

  -- ── 1. Orçamento sintético (is_internal: nunca aparece em Quotes.tsx) ─────
  INSERT INTO public.quotes (
    entity_id, cliente_id, organization_id, root_organization_id,
    created_by, assigned_to, estado, is_internal, moeda,
    subtotal, total, iva_rate, accepted_at,
    title, obra_notas
  )
  VALUES (
    v_sale.entity_id, v_client_id, v_sale.organization_id, v_root_org_id,
    v_sale.created_by, COALESCE(v_sale.assigned_to, v_sale.created_by),
    'aceite', true, COALESCE(v_sale.currency, 'EUR'),
    COALESCE(v_sale.subtotal, 0), COALESCE(v_sale.total, 0),
    COALESCE(v_sale.iva_rate, 23), COALESCE(v_sale.accepted_at, now()),
    'Venda Direta — ' || COALESCE(v_sale.sale_number, v_sale.id::text),
    v_sale.notes
  )
  RETURNING id INTO v_quote_id;

  -- ── 2. Linhas, incluindo as internas (ver cabeçalho) ─────────────────────
  INSERT INTO public.quote_lines (
    quote_id, categoria, descricao_snapshot,
    qt, unidade, product_id, service_id,
    cost_price, custo_material_unit, retail_price_unit,
    margem_percent, iva_percent, discount_percent,
    total_sem_iva, total_com_iva, total_com_desconto,
    ordem, section_name, visible_to_client
  )
  SELECT
    v_quote_id, 'Geral', l.descricao_snapshot,
    COALESCE(l.qt, 0), l.unidade, l.product_id, l.service_id,
    COALESCE(l.cost_price, 0), COALESCE(l.cost_price, 0), l.retail_price_unit,
    COALESCE(l.margem_percent, 0), COALESCE(l.iva_percent, 23), COALESCE(l.discount_percent, 0),
    COALESCE(l.total_sem_iva, 0), COALESCE(l.total_com_iva, 0), COALESCE(l.total_com_desconto, 0),
    COALESCE(l.ordem, 0), 'Geral', l.visible_to_client
  FROM public.direct_sale_lines l
  WHERE l.direct_sale_id = v_sale.id
  ORDER BY COALESCE(l.ordem, 0), l.created_at;

  -- ── 3. Contrato em rascunho ──────────────────────────────────────────────
  -- contract_number fica NULL de propósito: trigger_set_client_contract_number
  -- (BEFORE INSERT) só gera o número quando o valor vem NULL — um '' passaria
  -- incólume e a encomenda ficaria sem número.
  INSERT INTO public.client_contracts (
    contract_number, client_id, entity_id, quote_id,
    organization_id, root_organization_id, created_by,
    status, total_value, currency, start_date, notes,
    is_manual_order
  )
  VALUES (
    NULL, v_client_id, v_sale.entity_id, v_quote_id,
    v_sale.organization_id, v_root_org_id, v_sale.created_by,
    'draft', COALESCE(v_sale.total, 0), COALESCE(v_sale.currency, 'EUR'),
    COALESCE(v_sale.accepted_at::date, current_date),
    'Gerada automaticamente a partir da venda direta ' || COALESCE(v_sale.sale_number, v_sale.id::text),
    true
  )
  RETURNING * INTO v_contract;

  -- ── 4. Promover a assinado: é ESTE UPDATE que dispara stock e fornecedor ──
  UPDATE public.client_contracts
     SET status            = 'signed',
         signature_date    = COALESCE(v_sale.accepted_at, now()),
         accepted_at       = COALESCE(v_sale.accepted_at, now()),
         signed_by_name    = COALESCE(v_entity_name, 'Cliente'),
         status_changed_by = v_sale.created_by,
         status_changed_at = now()
   WHERE id = v_contract.id
  RETURNING * INTO v_contract;

  -- ── 5. Ligação de volta (a coluna estava reservada desde 20261130230000) ──
  UPDATE public.direct_sales
     SET client_contract_id = v_contract.id
   WHERE id = v_sale.id;

  RETURN v_contract;
END;
$function$;

COMMENT ON FUNCTION public.rpc_create_direct_sale_order(uuid) IS
  'Venda Direta Fase 5: cria o orçamento interno + a Encomenda Cliente assinada '
  'a partir de uma venda direta aceite, e escreve direct_sales.client_contract_id. '
  'Idempotente. Chamada pelo client-portal-action após o OTP; concedida apenas a '
  'service_role porque não há utilizador do CRM no fluxo do portal.';

REVOKE ALL ON FUNCTION public.rpc_create_direct_sale_order(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_create_direct_sale_order(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_create_direct_sale_order(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_direct_sale_order(uuid) TO service_role;
