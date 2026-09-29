-- Endurecer permissões: Venda Direta e estornos de stock.
-- Base: definições VIVAS (pg_get_functiondef em 2026-09-29, remoto até
-- 20261204780000). PostgreSQL 17.6.
--
-- 1. direct_sales: gatilho BEFORE INSERT/UPDATE que impede UPDATE/INSERT direto
--    (PostgREST, current_user authenticated/anon) das colunas de aceitação,
--    ligação à encomenda, proforma e fatura. Essas colunas só as escrevem as
--    RPCs SECURITY DEFINER (dono postgres → current_user = postgres):
--    rpc_confirm_direct_sale, rpc_create_direct_sale_order,
--    rpc_register_direct_sale_invoice, e o gatilho BEFORE
--    set_direct_sale_proforma_number no mesmo statement. service_role não é
--    bloqueado. A função do gatilho é SECURITY INVOKER de propósito: numa
--    trigger function SECURITY DEFINER o current_user seria o dono (postgres)
--    e o teste nunca apanharia o PostgREST.
--    Validação de organização: client_contract_id não nulo tem de apontar para
--    um contrato da mesma organização da venda (qualquer role).
-- 2. Portal: retiradas as policies de leitura do portal em direct_sales e
--    direct_sale_lines (a venda direta saiu do portal em 20261204600000).
-- 3. rpc_confirm_direct_sale: o atalho de system admin exige sessão de suporte
--    ativa (has_active_support_access); sem ela, o admin segue o caminho normal
--    de membro. Nada mais muda na função.
-- 4. stock_movements: authenticated/anon não podem inserir estornos
--    (reversal_of_movement_id) diretamente; só as funções do sistema.
-- 5. REVOKE EXECUTE das trigger functions fn_contract_stock_deduction e
--    fn_contract_cancelled_stock_reversal a PUBLIC/anon/authenticated. O
--    disparo de um gatilho não verifica EXECUTE do role do statement
--    (confirmado em PG 17.6 com um gatilho de prova, em transação revertida);
--    o privilégio só é verificado no CREATE TRIGGER.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. direct_sales — colunas geridas pelo sistema
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_direct_sales_guard_system_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_blocked      text[] := ARRAY[]::text[];
  v_contract_org uuid;
BEGIN
  -- Só pedidos diretos do PostgREST. Dentro de uma RPC SECURITY DEFINER o
  -- current_user é o dono da RPC (postgres) e passa.
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      -- Uma venda nova nasce sempre em rascunho, sem aceitação, sem encomenda,
      -- sem proforma e sem fatura (DirectSaleEditor.tsx grava só isto).
      IF NEW.status IS DISTINCT FROM 'rascunho'         THEN v_blocked := v_blocked || 'status'::text; END IF;
      IF NEW.accepted_at IS NOT NULL                    THEN v_blocked := v_blocked || 'accepted_at'::text; END IF;
      IF NEW.accepted_by IS NOT NULL                    THEN v_blocked := v_blocked || 'accepted_by'::text; END IF;
      IF NEW.signature_image IS NOT NULL                THEN v_blocked := v_blocked || 'signature_image'::text; END IF;
      IF NEW.acceptance_ip IS NOT NULL                  THEN v_blocked := v_blocked || 'acceptance_ip'::text; END IF;
      IF NEW.acceptance_user_agent IS NOT NULL          THEN v_blocked := v_blocked || 'acceptance_user_agent'::text; END IF;
      IF NEW.client_contract_id IS NOT NULL             THEN v_blocked := v_blocked || 'client_contract_id'::text; END IF;
      IF NEW.proforma_number IS NOT NULL                THEN v_blocked := v_blocked || 'proforma_number'::text; END IF;
      IF NEW.proforma_issued_at IS NOT NULL             THEN v_blocked := v_blocked || 'proforma_issued_at'::text; END IF;
      IF NEW.invoice_number IS NOT NULL                 THEN v_blocked := v_blocked || 'invoice_number'::text; END IF;
      IF NEW.invoice_series IS NOT NULL                 THEN v_blocked := v_blocked || 'invoice_series'::text; END IF;
      IF NEW.invoice_issued_at IS NOT NULL              THEN v_blocked := v_blocked || 'invoice_issued_at'::text; END IF;
      IF NEW.invoice_atcud IS NOT NULL                  THEN v_blocked := v_blocked || 'invoice_atcud'::text; END IF;
      IF NEW.invoice_hash IS NOT NULL                   THEN v_blocked := v_blocked || 'invoice_hash'::text; END IF;
      IF NEW.external_invoice_id IS NOT NULL            THEN v_blocked := v_blocked || 'external_invoice_id'::text; END IF;
      IF NEW.invoice_pdf_url IS NOT NULL                THEN v_blocked := v_blocked || 'invoice_pdf_url'::text; END IF;
      IF NEW.invoice_status IS DISTINCT FROM 'pendente' THEN v_blocked := v_blocked || 'invoice_status'::text; END IF;
      IF NEW.invoice_source IS NOT NULL                 THEN v_blocked := v_blocked || 'invoice_source'::text; END IF;
    ELSE
      -- Estado: só a passagem PARA ou DE 'aceite' é do sistema (Confirmar
      -- venda). As outras transições não são tocadas aqui.
      IF NEW.status IS DISTINCT FROM OLD.status
         AND (NEW.status = 'aceite' OR OLD.status = 'aceite')                  THEN v_blocked := v_blocked || 'status'::text; END IF;
      IF NEW.accepted_at IS DISTINCT FROM OLD.accepted_at                     THEN v_blocked := v_blocked || 'accepted_at'::text; END IF;
      IF NEW.accepted_by IS DISTINCT FROM OLD.accepted_by                     THEN v_blocked := v_blocked || 'accepted_by'::text; END IF;
      IF NEW.signature_image IS DISTINCT FROM OLD.signature_image             THEN v_blocked := v_blocked || 'signature_image'::text; END IF;
      IF NEW.acceptance_ip IS DISTINCT FROM OLD.acceptance_ip                 THEN v_blocked := v_blocked || 'acceptance_ip'::text; END IF;
      IF NEW.acceptance_user_agent IS DISTINCT FROM OLD.acceptance_user_agent THEN v_blocked := v_blocked || 'acceptance_user_agent'::text; END IF;
      IF NEW.client_contract_id IS DISTINCT FROM OLD.client_contract_id       THEN v_blocked := v_blocked || 'client_contract_id'::text; END IF;
      IF NEW.proforma_number IS DISTINCT FROM OLD.proforma_number             THEN v_blocked := v_blocked || 'proforma_number'::text; END IF;
      IF NEW.proforma_issued_at IS DISTINCT FROM OLD.proforma_issued_at       THEN v_blocked := v_blocked || 'proforma_issued_at'::text; END IF;
      -- Fatura: exatamente as colunas que rpc_register_direct_sale_invoice escreve.
      IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number               THEN v_blocked := v_blocked || 'invoice_number'::text; END IF;
      IF NEW.invoice_series IS DISTINCT FROM OLD.invoice_series               THEN v_blocked := v_blocked || 'invoice_series'::text; END IF;
      IF NEW.invoice_issued_at IS DISTINCT FROM OLD.invoice_issued_at         THEN v_blocked := v_blocked || 'invoice_issued_at'::text; END IF;
      IF NEW.invoice_atcud IS DISTINCT FROM OLD.invoice_atcud                 THEN v_blocked := v_blocked || 'invoice_atcud'::text; END IF;
      IF NEW.invoice_hash IS DISTINCT FROM OLD.invoice_hash                   THEN v_blocked := v_blocked || 'invoice_hash'::text; END IF;
      IF NEW.external_invoice_id IS DISTINCT FROM OLD.external_invoice_id     THEN v_blocked := v_blocked || 'external_invoice_id'::text; END IF;
      IF NEW.invoice_pdf_url IS DISTINCT FROM OLD.invoice_pdf_url             THEN v_blocked := v_blocked || 'invoice_pdf_url'::text; END IF;
      IF NEW.invoice_status IS DISTINCT FROM OLD.invoice_status               THEN v_blocked := v_blocked || 'invoice_status'::text; END IF;
      IF NEW.invoice_source IS DISTINCT FROM OLD.invoice_source               THEN v_blocked := v_blocked || 'invoice_source'::text; END IF;
    END IF;

    IF array_length(v_blocked, 1) IS NOT NULL THEN
      RAISE EXCEPTION 'Estes campos da venda direta só podem ser alterados pelas funções do sistema (Confirmar venda, Registar fatura): %',
        array_to_string(v_blocked, ', ')
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Organização: a encomenda ligada tem de ser da mesma organização da venda.
  -- Para qualquer role (inclui as RPCs), sempre que a ligação é criada/muda ou
  -- a venda muda de organização com uma ligação existente.
  IF NEW.client_contract_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.client_contract_id IS DISTINCT FROM OLD.client_contract_id
          OR NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
    SELECT cc.organization_id INTO v_contract_org
      FROM public.client_contracts cc
     WHERE cc.id = NEW.client_contract_id;

    IF NOT FOUND OR v_contract_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'A encomenda de cliente ligada à venda direta tem de pertencer à mesma organização da venda'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.fn_direct_sales_guard_system_columns() OWNER TO postgres;
-- Trigger function: não é para ser chamada diretamente. O disparo do gatilho
-- não precisa de EXECUTE do role do statement (ver cabeçalho, ponto 5).
REVOKE EXECUTE ON FUNCTION public.fn_direct_sales_guard_system_columns() FROM PUBLIC, anon, authenticated;

-- "00": corre antes dos outros BEFORE (ordem alfabética), portanto compara o
-- que o pedido enviou, antes de set_direct_sale_proforma_number/updated_at.
DROP TRIGGER IF EXISTS trg_direct_sales_00_guard_system_columns ON public.direct_sales;
CREATE TRIGGER trg_direct_sales_00_guard_system_columns
  BEFORE INSERT OR UPDATE ON public.direct_sales
  FOR EACH ROW EXECUTE FUNCTION public.fn_direct_sales_guard_system_columns();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Portal — a venda direta deixou de estar no portal
-- ═══════════════════════════════════════════════════════════════════════════
-- Policies de membros da organização (direct_sales_*_policy,
-- direct_sale_lines_*_policy) não são tocadas.

DROP POLICY IF EXISTS "Client can view own direct sale" ON public.direct_sales;
DROP POLICY IF EXISTS "Client can view own direct sale lines" ON public.direct_sale_lines;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. rpc_confirm_direct_sale — admin exige sessão de suporte ativa
-- ═══════════════════════════════════════════════════════════════════════════
-- Partida: pg_get_functiondef viva. Só muda o bloco marcado NOVO (20261204800000)
-- a seguir à verificação de âmbito e um comentário no ramo da ficha de cliente.
-- CREATE OR REPLACE mantém owner (postgres), grants (authenticated,
-- service_role), SECURITY DEFINER e search_path.

CREATE OR REPLACE FUNCTION public.rpc_confirm_direct_sale(p_direct_sale_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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

  -- NOVO (20261204800000): o atalho de system admin passa a exigir sessão de
  -- suporte ativa na organização da venda (has_active_support_access), como
  -- em system_admin_pii_default_deny. Sem sessão, o admin só passa pelo
  -- caminho normal de membro (organização visível + direct_sales.edit) e a
  -- partir daqui é tratado como tal — incluindo a criação da ficha de
  -- cliente, que volta a exigir clients.create (ramo abaixo).
  IF v_is_admin AND NOT public.has_active_support_access(v_sale.organization_id) THEN
    IF public.has_anew_permission(auth.uid(), 'direct_sales.edit')
       AND v_sale.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
      v_is_admin := false;
    ELSE
      RAISE EXCEPTION 'Acesso de suporte não ativo para esta organização' USING ERRCODE = 'insufficient_privilege';
    END IF;
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
    -- NOVO (20261204800000): aqui v_is_admin só é true se o admin tiver
    -- sessão de suporte ativa na organização da venda (verificado acima).
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. stock_movements — estornos só pelas funções do sistema
-- ═══════════════════════════════════════════════════════════════════════════
-- Hoje só escrevem reversal_of_movement_id funções SECURITY DEFINER (dono
-- postgres): fn_client_order_reverse_stock_movement,
-- fn_contract_cancelled_stock_reversal, fn_proposal_cancelled_stock_reversal,
-- rpc_confirm_client_order_stock_exit, rpc_revert_client_order_stock_exit.
-- O frontend não insere estornos.

CREATE OR REPLACE FUNCTION public.fn_stock_movements_guard_reversal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- SECURITY INVOKER de propósito: current_user é o role do statement.
  IF NEW.reversal_of_movement_id IS NOT NULL
     AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Estornos de movimentos só podem ser feitos pelas funções do sistema'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.fn_stock_movements_guard_reversal() OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.fn_stock_movements_guard_reversal() FROM PUBLIC, anon, authenticated;

-- "00": corre antes de trg_stock_movements_apply (que mexe em stocks). Mesmo
-- que corresse depois, o RAISE revertia tudo; assim nem chega a tocar.
DROP TRIGGER IF EXISTS trg_stock_movements_00_guard_reversal ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_00_guard_reversal
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.fn_stock_movements_guard_reversal();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Higiene — trigger functions de stock dos contratos
-- ═══════════════════════════════════════════════════════════════════════════
-- Só são usadas por trg_contract_stock_deduction e
-- trg_contract_cancelled_stock_reversal (client_contracts); nenhuma função as
-- chama diretamente. postgres e service_role mantêm EXECUTE.

REVOKE EXECUTE ON FUNCTION public.fn_contract_stock_deduction() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_contract_cancelled_stock_reversal() FROM PUBLIC, anon, authenticated;
