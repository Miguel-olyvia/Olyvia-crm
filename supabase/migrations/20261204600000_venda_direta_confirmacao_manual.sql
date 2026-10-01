-- ─────────────────────────────────────────────────────────────────────────────
-- Venda Direta: confirmação manual no CRM (deixa de passar pelo portal)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Até aqui a venda direta era publicada no portal e o cliente aceitava-a lá
-- (client-portal-action / accept_direct_sale), o que chamava
-- rpc_create_direct_sale_order em modo fail-soft: se a encomenda falhasse, a
-- venda ficava 'aceite' SEM encomenda (é o que aconteceu a VD-2026-0001 e
-- VD-2026-0003 — a segunda porque o cliente não tinha ficha em anew_clients na
-- organização da venda).
--
-- Agora quem confirma é o comercial, no CRM, com rpc_confirm_direct_sale:
--   1. valida tudo o que é dado em falta ANTES de mudar o estado, com
--      mensagens em português;
--   2. cria a ficha de cliente em falta pelo mesmo mecanismo do resto do
--      sistema (padrão de fn_contract_signed_convert_to_client), se o
--      utilizador tiver clients.create;
--   3. passa a venda a 'aceite' (o trigger BEFORE gera o proforma_number);
--   4. gera a Encomenda de Cliente com rpc_create_direct_sale_order, na MESMA
--      transação. Se isso falhar, a exceção é relançada e tudo é desfeito:
--      nunca fica uma venda aceite sem encomenda.
--
-- Stock e fornecedor: não mudam. São os gatilhos AFTER UPDATE OF status de
-- client_contracts (fn_contract_stock_deduction, fn_contract_supplier_request),
-- que são best-effort (EXCEPTION WHEN OTHERS → workflow_execution_log) —
-- stock insuficiente fica registado como aviso e nunca bloqueia.
--
-- Não se altera nenhuma função existente. As publicações antigas de vendas
-- diretas no portal são desativadas (is_visible=false), sem apagar linhas.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Quem confirmou a venda ───────────────────────────────────────────────
-- Mesmo alvo que created_by / assigned_to desta tabela (anew_users, ON DELETE
-- SET NULL). NULL nas vendas aceites no portal antes desta migração.
ALTER TABLE public.direct_sales
  ADD COLUMN IF NOT EXISTS accepted_by uuid
    REFERENCES public.anew_users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.direct_sales.accepted_by IS
  'Utilizador do CRM (anew_users) que confirmou a venda com rpc_confirm_direct_sale. NULL nas vendas aceites pelo cliente no portal (fluxo antigo).';


-- ── 2. Confirmação manual ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_confirm_direct_sale(p_direct_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor              uuid;
  v_is_admin           boolean;
  v_sale               public.direct_sales;
  v_contract           public.client_contracts;
  v_client_id          uuid;
  v_client_created     boolean := false;
  v_repair             boolean := false;
  v_line_count         integer;
  v_line               record;
  v_origin_source      text;
  v_origin_source_id   uuid;
  v_origin_campaign_id uuid;
  v_err_state          text;
  v_err_msg            text;
  v_err_detail         text;
BEGIN
  -- ── Autenticação ─────────────────────────────────────────────────────────
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida: é preciso estar autenticado para confirmar a venda'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Ator de negócio (anew_users.id) — o mesmo que created_by no frontend e o
  -- alvo da FK de accepted_by. Mesmo padrão de rpc_register_direct_sale_invoice.
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Autorização ──────────────────────────────────────────────────────────
  -- Exatamente a política de UPDATE da RLS de direct_sales
  -- (direct_sales_update_policy): system admin, OU organização visível E
  -- direct_sales.edit. Confirmar é uma edição da venda, por isso quem não a
  -- pode editar diretamente também não a pode confirmar. A ordem (permissão,
  -- depois leitura, depois âmbito) é a de rpc_register_direct_sale_invoice.
  v_is_admin := public.is_system_admin_user(auth.uid());

  IF NOT v_is_admin AND NOT public.has_anew_permission(auth.uid(), 'direct_sales.edit') THEN
    RAISE EXCEPTION 'Sem permissão para confirmar vendas diretas' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_direct_sale_id IS NULL THEN
    RAISE EXCEPTION 'É obrigatório indicar a venda direta' USING ERRCODE = 'check_violation';
  END IF;

  -- FOR UPDATE serializa duas confirmações simultâneas da mesma venda (dois
  -- cliques, dois separadores): a segunda espera e cai na idempotência abaixo.
  SELECT * INTO v_sale
    FROM public.direct_sales
   WHERE id = p_direct_sale_id
     AND deleted_at IS NULL
     FOR UPDATE;

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'Venda direta não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT v_is_admin AND v_sale.organization_id NOT IN (
    SELECT public.get_user_visible_org_ids(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Venda direta fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Idempotência ─────────────────────────────────────────────────────────
  IF v_sale.status = 'aceite' AND v_sale.client_contract_id IS NOT NULL THEN
    SELECT * INTO v_contract
      FROM public.client_contracts
     WHERE id = v_sale.client_contract_id;

    IF v_contract.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'direct_sale_id',     v_sale.id,
        'sale_number',        v_sale.sale_number,
        'status',             v_sale.status,
        'proforma_number',    v_sale.proforma_number,
        'accepted_at',        v_sale.accepted_at,
        'accepted_by',        v_sale.accepted_by,
        'client_contract_id', v_contract.id,
        'order_number',       v_contract.order_number,
        'contract_number',    v_contract.contract_number,
        'client_id',          v_contract.client_id,
        'client_created',     false,
        'already_confirmed',  true
      );
    END IF;
    -- Ponteiro pendurado (contrato apagado à mão): segue como reparação.
  END IF;

  -- ── Estado ───────────────────────────────────────────────────────────────
  -- 'aceite' sem encomenda = aceite no portal pelo fluxo antigo, com a
  -- encomenda falhada. Não se volta a aceitar (accepted_at/accepted_by e o
  -- proforma já emitido ficam como estão): só se gera a encomenda em falta.
  IF v_sale.status = 'aceite' THEN
    v_repair := true;
  ELSIF v_sale.status = 'rejeitada' THEN
    RAISE EXCEPTION 'Esta venda direta foi rejeitada e não pode ser confirmada. Crie uma nova venda.'
      USING ERRCODE = 'check_violation';
  ELSIF v_sale.status = 'cancelada' THEN
    RAISE EXCEPTION 'Esta venda direta foi cancelada e não pode ser confirmada. Crie uma nova venda.'
      USING ERRCODE = 'check_violation';
  ELSIF v_sale.status NOT IN ('rascunho', 'enviada') THEN
    RAISE EXCEPTION 'Só é possível confirmar vendas diretas em rascunho ou enviadas (estado atual: %)', v_sale.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Validações de dados (todas ANTES de mudar o estado) ──────────────────
  -- Cada uma corresponde a um RAISE de rpc_create_direct_sale_order ou de um
  -- gatilho a jusante; aqui com a mensagem que o comercial consegue resolver.

  IF v_sale.entity_id IS NULL THEN
    RAISE EXCEPTION 'A venda não tem cliente associado. Escolha o cliente antes de confirmar.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- client_contracts.created_by e quotes.created_by são NOT NULL e a encomenda
  -- é atribuída ao autor da venda. Só acontece se o utilizador que criou a
  -- venda tiver sido apagado (FK ON DELETE SET NULL). Não se inventa autor.
  IF v_sale.created_by IS NULL THEN
    RAISE EXCEPTION 'A venda não tem autor registado (o utilizador que a criou já não existe). Não é possível atribuir a encomenda de cliente.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_line_count
    FROM public.direct_sale_lines l
   WHERE l.direct_sale_id = v_sale.id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'A venda não tem linhas. Acrescente pelo menos um produto ou serviço antes de confirmar.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Unidade de cada linha: o gatilho fn_line_units_per_uom_snapshot volta a
  -- correr no INSERT em quote_lines e rebenta se a unidade deixou de ser
  -- compatível com o produto (unidade do produto alterada depois de a linha
  -- ser gravada) ou não é visível para quem confirma. Validado aqui, linha a
  -- linha, para dizer QUAL é a linha.
  FOR v_line IN
    SELECT l.id, l.descricao_snapshot, l.uom_id, l.product_id
      FROM public.direct_sale_lines l
     WHERE l.direct_sale_id = v_sale.id
       AND l.uom_id IS NOT NULL
     ORDER BY COALESCE(l.ordem, 0), l.created_at
  LOOP
    BEGIN
      PERFORM public.fn_uom_units_per(v_line.uom_id, v_line.product_id);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
      RAISE EXCEPTION 'A linha «%» tem uma unidade inválida: %. Corrija a unidade da linha antes de confirmar.',
        COALESCE(nullif(v_line.descricao_snapshot, ''), 'Item'), v_err_msg
        USING ERRCODE = v_err_state;
    END;
  END LOOP;

  -- ── Ficha de cliente (anew_clients) na organização da venda ──────────────
  -- rpc_create_direct_sale_order exige-a (entity_id + organization_id, não
  -- apagada). Em falta, cria-se pelo mesmo mecanismo que o sistema já usa ao
  -- assinar um contrato (fn_contract_signed_convert_to_client): ficha 'active',
  -- origem de marketing via fn_resolve_client_marketing_origin, root =
  -- COALESCE(root da venda, organização). Os papéis (anew_entity_roles) ficam
  -- a cargo do gatilho trg_sync_from_client, como em qualquer outra criação.
  SELECT c.id INTO v_client_id
    FROM public.anew_clients c
   WHERE c.entity_id = v_sale.entity_id
     AND c.organization_id = v_sale.organization_id
     AND c.deleted_at IS NULL
   ORDER BY c.created_at ASC
   LIMIT 1;

  IF v_client_id IS NULL THEN
    -- Criar uma ficha de cliente é uma permissão à parte (clients.create, a
    -- mesma que rpc_create_client_manual exige). Não é implícita em
    -- direct_sales.edit.
    IF NOT v_is_admin AND NOT public.has_anew_permission(auth.uid(), 'clients.create') THEN
      RAISE EXCEPTION 'Este cliente ainda não tem ficha de cliente nesta empresa e não tem permissão para a criar. Peça a quem tenha permissão para criar clientes, ou crie a ficha antes de confirmar.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT o.origin_source, o.origin_source_id, o.origin_campaign_id
      INTO v_origin_source, v_origin_source_id, v_origin_campaign_id
      FROM public.fn_resolve_client_marketing_origin(v_sale.entity_id, v_sale.organization_id) o;

    PERFORM public.set_audit_context(v_actor, 'crm');

    BEGIN
      INSERT INTO public.anew_clients (
        entity_id, organization_id, root_organization_id,
        status, source_type, source_id, created_by, assigned_to,
        origin_source, origin_source_id, origin_campaign_id
      ) VALUES (
        v_sale.entity_id, v_sale.organization_id,
        COALESCE(v_sale.root_organization_id, v_sale.organization_id),
        'active', 'direct_sale', v_sale.id, v_actor, v_sale.assigned_to,
        v_origin_source, v_origin_source_id, v_origin_campaign_id
      )
      RETURNING id INTO v_client_id;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
      IF v_err_msg LIKE 'plan_limit_exceeded:%' THEN
        RAISE EXCEPTION 'Não foi possível criar a ficha de cliente: o limite do plano foi atingido. A venda não foi confirmada.'
          USING ERRCODE = v_err_state, DETAIL = v_err_msg;
      END IF;
      RAISE EXCEPTION 'Não foi possível criar a ficha de cliente: %. A venda não foi confirmada.', v_err_msg
        USING ERRCODE = v_err_state;
    END;

    v_client_created := true;
  END IF;

  -- ── Aceitação ────────────────────────────────────────────────────────────
  PERFORM public.set_audit_context(v_actor, 'crm');

  -- generate_proforma_number (chamada pelo gatilho BEFORE) faz MAX()+1 sem
  -- lock e há um índice único (organization_id, proforma_number): duas
  -- confirmações simultâneas na mesma organização colidiam. Este lock de
  -- transação serializa-as, sem mexer na função partilhada.
  PERFORM pg_advisory_xact_lock(hashtext('direct_sales_proforma_' || v_sale.organization_id::text));

  IF v_repair THEN
    -- Só completa a ligação à ficha de cliente; a aceitação já existe.
    UPDATE public.direct_sales
       SET client_id = COALESCE(client_id, v_client_id)
     WHERE id = v_sale.id
       AND client_id IS NULL;
  ELSE
    -- signature_image fica NULL de propósito: não há assinatura do cliente,
    -- a prova é accepted_by (quem confirmou) + accepted_at.
    UPDATE public.direct_sales
       SET status      = 'aceite',
           accepted_at = now(),
           accepted_by = v_actor,
           client_id   = COALESCE(client_id, v_client_id)
     WHERE id = v_sale.id;
  END IF;

  -- ── Encomenda de Cliente (mesma transação) ───────────────────────────────
  -- rpc_create_direct_sale_order: SECURITY DEFINER, EXECUTE só para
  -- service_role/postgres; aqui corre como dono desta função (postgres), por
  -- isso a chamada é permitida sem abrir a RPC a authenticated. Não usa
  -- auth.uid() nem verifica papéis.
  --
  -- Qualquer erro é relançado com mensagem própria: a exceção aborta a
  -- transação inteira, incluindo o UPDATE acima e a ficha de cliente criada.
  BEGIN
    v_contract := public.rpc_create_direct_sale_order(v_sale.id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_err_state  = RETURNED_SQLSTATE,
      v_err_msg    = MESSAGE_TEXT,
      v_err_detail = PG_EXCEPTION_DETAIL;
    IF v_err_msg LIKE 'plan_limit_exceeded:%' THEN
      RAISE EXCEPTION 'Não foi possível gerar a encomenda de cliente: o limite do plano foi atingido. A venda não foi confirmada.'
        USING ERRCODE = v_err_state, DETAIL = v_err_msg;
    END IF;
    RAISE EXCEPTION 'Não foi possível gerar a encomenda de cliente: %. A venda não foi confirmada.', v_err_msg
      USING ERRCODE = v_err_state, DETAIL = COALESCE(v_err_detail, '');
  END;

  IF v_contract.id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível gerar a encomenda de cliente. A venda não foi confirmada.'
      USING ERRCODE = 'internal_error';
  END IF;

  -- Relê a venda: proforma_number/proforma_issued_at vêm do gatilho BEFORE e
  -- client_contract_id foi escrito por rpc_create_direct_sale_order.
  SELECT * INTO v_sale FROM public.direct_sales WHERE id = v_sale.id;

  RETURN jsonb_build_object(
    'direct_sale_id',     v_sale.id,
    'sale_number',        v_sale.sale_number,
    'status',             v_sale.status,
    'proforma_number',    v_sale.proforma_number,
    'accepted_at',        v_sale.accepted_at,
    'accepted_by',        v_sale.accepted_by,
    'client_contract_id', v_contract.id,
    'order_number',       v_contract.order_number,
    'contract_number',    v_contract.contract_number,
    'client_id',          v_contract.client_id,
    'client_created',     v_client_created,
    'already_confirmed',  false
  );
END;
$function$;

COMMENT ON FUNCTION public.rpc_confirm_direct_sale(uuid) IS
  'Confirma manualmente (no CRM) uma venda direta em rascunho/enviada: passa-a a aceite (proforma pelo gatilho), cria a ficha de cliente em falta (com clients.create) e gera a Encomenda de Cliente via rpc_create_direct_sale_order na mesma transação. Idempotente. Também completa vendas aceites no portal cuja encomenda falhou.';

REVOKE ALL ON FUNCTION public.rpc_confirm_direct_sale(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_confirm_direct_sale(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_direct_sale(uuid) TO authenticated;


-- ── 3. Desativar as publicações de vendas diretas no portal ────────────────
-- portal_user_can_see_document só olha para is_visible, por isso isto basta
-- para a RLS "Client can view own direct sale" deixar de devolver as vendas.
-- revoked_by fica como está (NULL = revogação pelo sistema; há precedentes
-- na tabela). Não se apagam linhas.
UPDATE public.client_portal_documents
   SET is_visible = false,
       revoked_at = COALESCE(revoked_at, now())
 WHERE document_type = 'direct_sale'
   AND is_visible = true;
