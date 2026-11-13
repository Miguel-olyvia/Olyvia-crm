-- ============================================================
-- Anular um contrato ENVIADO (pending_signature)
-- ============================================================
-- Problema: o ecra de contratos (src/pages/ClientContracts.tsx, isPreSignature)
-- oferece "Anular" a contratos em 'draft' E em 'pending_signature' (Enviado /
-- A aguardar assinatura), mas cancel_and_replace_contract so aceitava
-- ('signed','active','draft') e recusava o resto com 'contract_not_cancellable'.
-- Caso reportado: CC-2026-0423, enviado ao cliente, "Este contrato nao pode ser
-- anulado no estado atual".
--
-- O que muda (as UNICAS diferencas em relacao a definicao viva, md5 do
-- pg_get_functiondef 1410eb20dc41b015651af9e754581ccf, fonte
-- 20261111380000_cancel_and_replace_client_contract.sql):
--   1. 'pending_signature' passa a ser anulavel. So ALARGA o que se pode anular;
--      nenhum estado que hoje se anula deixa de se anular, e as mensagens de
--      erro dos outros estados ficam iguais ('contract_already_cancelled',
--      'contract_not_cancellable', 'insufficient_permission', 'reason_required').
--   2. Em QUALQUER anulacao, as ligacoes de assinatura por usar deste contrato
--      deixam de valer: os tokens com used_at IS NULL e ainda validos ficam com
--      valid_until = now() (nenhuma linha e apagada; tokens ja usados ou ja
--      expirados nao mudam), e os pedidos de assinatura ainda abertos passam a
--      'cancelled'. A coluna client_contract_signature_requests.status nao tem
--      CHECK (lido no catalogo); os valores escritos pelo codigo sao 'created'
--      (omissao) e 'completed' (validate-contract-signature). 'cancelled' e
--      terminal e nenhum leitor o trata como aberto.
--   3. O evento 'contract_cancelled' em client_contract_events ganha, em
--      new_values, as chaves previous_status, signature_tokens_invalidated e
--      signature_requests_cancelled (aditivas; replacement_contract_id mantem-se).
--   4. A leitura inicial do contrato passa a FOR UPDATE (so essa linha), para
--      que uma assinatura concorrente espere e o previous_status do evento seja
--      o estado real no momento da anulacao. Mensagens e permissoes iguais.
--
-- Mantem-se: assinatura (uuid, text, boolean) -> jsonb, SECURITY DEFINER,
-- search_path public, pg_temp, owner postgres, e as permissoes (EXECUTE so a
-- authenticated e service_role; PUBLIC e anon sem EXECUTE).
--
-- TOCA NA MUDELAR: e uma funcao partilhada da base principal. Para a Mudelar o
-- efeito e o mesmo que para as outras organizacoes: passa a poder anular
-- contratos enviados, e ao anular qualquer contrato as ligacoes de assinatura
-- por usar desse contrato deixam de funcionar. Nada mais muda.
--
-- Nao precisa de codigo novo para entrar: o ecra ja oferece o botao.
--
-- Gatilho novo: um contrato ANULADO nao volta a assinado.
-- A assinatura no portal do cliente (client-portal-action, sign_contract) nao
-- usa tokens e grava status='signed' sem verificar o estado; o mesmo fazem
-- validate-contract-signature, pipeline-automation (finalize_contract, ramo
-- service_role) e rpc_update_client_contract_status. Quem tivesse o portal
-- aberto num contrato anulado podia assina-lo. O gatilho
-- trg_00_client_contracts_block_reopen_cancelled (BEFORE UPDATE OF status)
-- recusa SO a passagem de 'cancelled' para 'signed' ou 'active', com a
-- mensagem 'contract_cancelled_cannot_reopen', venha de onde vier (corre para
-- todos os papeis, service_role incluido). Tudo o resto fica como estava:
-- 'cancelled' -> 'draft'/'pending_signature'/outro, eliminar (deleted_at),
-- alterar qualquer outra coluna de um contrato anulado.
-- Procurado antes (migrations mais recentes por objecto e codigo): nenhum fluxo
-- legitimo poe 'signed'/'active' a partir de 'cancelled'. Os que gravam
-- 'signed' fazem-no sobre contratos acabados de criar em 'draft'
-- (rpc_create_direct_sale_order, rpc_create_manual_client_order) ou sobre
-- contratos por assinar (portal, assinatura por token, finalize_contract); o
-- menu de um contrato anulado no ecra nao oferece assinar.
-- Nome com prefixo trg_00_ para correr antes dos outros BEFORE UPDATE (ordem
-- alfabetica) e falhar antes de trabalho inutil; nenhum dos BEFORE UPDATE
-- existentes escreve NEW.status (lido no catalogo).
-- ============================================================

-- Nao ficar a espera de um lock em client_contracts (tabela quente): falha
-- depressa e o push repete-se, em vez de enfileirar a escrita de toda a gente.
SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.cancel_and_replace_contract(
  p_contract_id uuid,
  p_reason text,
  p_create_replacement boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org_id uuid;
  v_status text;
  v_deleted_at timestamptz;
  v_actor uuid := public.resolve_business_user_id(auth.uid());
  v_new_contract_id uuid;
  v_tokens_invalidated integer := 0;
  v_requests_cancelled integer := 0;
BEGIN
  SELECT organization_id, status, deleted_at
  INTO v_org_id, v_status, v_deleted_at
  FROM public.client_contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contract_not_found';
  END IF;

  IF v_org_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'contract_not_found';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'client_contracts.edit') THEN
    RAISE EXCEPTION 'insufficient_permission';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'contract_already_deleted';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'contract_already_cancelled';
  END IF;

  IF v_status NOT IN ('signed', 'active', 'draft', 'pending_signature') THEN
    RAISE EXCEPTION 'contract_not_cancellable';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  UPDATE public.client_contracts
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_actor,
      cancellation_reason = p_reason,
      status_changed_by = v_actor,
      status_changed_at = now()
  WHERE id = p_contract_id;

  -- Ligacoes de assinatura por usar deixam de valer (sem apagar linhas).
  UPDATE public.client_contract_signature_tokens t
  SET valid_until = now()
  WHERE t.used_at IS NULL
    AND t.valid_until > now()
    AND (
      t.signature_request_id IN (
        SELECT r.id FROM public.client_contract_signature_requests r
        WHERE r.contract_id = p_contract_id
      )
      OR t.contract_party_id IN (
        SELECT pa.id FROM public.client_contract_parties pa
        WHERE pa.contract_id = p_contract_id
      )
    );
  GET DIAGNOSTICS v_tokens_invalidated = ROW_COUNT;

  UPDATE public.client_contract_signature_requests r
  SET status = 'cancelled'
  WHERE r.contract_id = p_contract_id
    AND r.status NOT IN ('completed', 'cancelled', 'expired', 'declined', 'rejected');
  GET DIAGNOSTICS v_requests_cancelled = ROW_COUNT;

  IF p_create_replacement THEN
    INSERT INTO public.client_contracts (
      client_id, entity_id, proposal_id, quote_id, contract_template_id,
      template_id, organization_id, root_organization_id, payment_terms,
      notes, prompt_values, currency, status, contract_body_html,
      replaces_contract_id, created_by
    )
    SELECT
      client_id, entity_id, proposal_id, quote_id, contract_template_id,
      template_id, organization_id, root_organization_id, payment_terms,
      notes, prompt_values, currency, 'draft', NULL,
      id, v_actor
    FROM public.client_contracts
    WHERE id = p_contract_id
    RETURNING id INTO v_new_contract_id;

    UPDATE public.client_contracts
    SET replaced_by_contract_id = v_new_contract_id
    WHERE id = p_contract_id;

    INSERT INTO public.client_contract_events (
      contract_id, event_type, description, new_values, created_by
    ) VALUES (
      p_contract_id, 'contract_cancelled', p_reason,
      jsonb_build_object(
        'replacement_contract_id', v_new_contract_id,
        'previous_status', v_status,
        'signature_tokens_invalidated', v_tokens_invalidated,
        'signature_requests_cancelled', v_requests_cancelled
      ),
      v_actor
    );

    INSERT INTO public.client_contract_events (
      contract_id, event_type, description, new_values, created_by
    ) VALUES (
      v_new_contract_id, 'contract_replaced', 'Contrato de substituicao criado',
      jsonb_build_object('replaces_contract_id', p_contract_id),
      v_actor
    );
  ELSE
    INSERT INTO public.client_contract_events (
      contract_id, event_type, description, new_values, created_by
    ) VALUES (
      p_contract_id, 'contract_cancelled', p_reason,
      jsonb_build_object(
        'replacement_contract_id', NULL,
        'previous_status', v_status,
        'signature_tokens_invalidated', v_tokens_invalidated,
        'signature_requests_cancelled', v_requests_cancelled
      ),
      v_actor
    );
  END IF;

  RETURN jsonb_build_object(
    'cancelled_contract_id', p_contract_id,
    'replacement_contract_id', v_new_contract_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_and_replace_contract(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_and_replace_contract(uuid, text, boolean) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Um contrato anulado nao volta a assinado/activo.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_client_contracts_block_reopen_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF OLD.status = 'cancelled' AND NEW.status IN ('signed', 'active') THEN
    RAISE EXCEPTION 'contract_cancelled_cannot_reopen'
      USING ERRCODE = 'check_violation',
            DETAIL = 'Um contrato anulado nao pode passar a assinado ou activo.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_client_contracts_block_reopen_cancelled() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_00_client_contracts_block_reopen_cancelled
  BEFORE UPDATE OF status ON public.client_contracts
  FOR EACH ROW
  WHEN (OLD.status = 'cancelled' AND NEW.status IN ('signed', 'active'))
  EXECUTE FUNCTION public.fn_client_contracts_block_reopen_cancelled();

-- ------------------------------------------------------------
-- Conferir: falha (e desfaz a migration) se a funcao nao ficar como devia.
-- ------------------------------------------------------------
DO $chk$
DECLARE
  v_fn regprocedure := to_regprocedure('public.cancel_and_replace_contract(uuid,text,boolean)');
  v_n integer;
  v_p record;
BEGIN
  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'conferir: cancel_and_replace_contract(uuid,text,boolean) nao existe';
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname::text = 'public' AND p.proname::text = 'cancel_and_replace_contract';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'conferir: esperava 1 cancel_and_replace_contract, ha %', v_n;
  END IF;

  SELECT p.prosecdef, p.proconfig::text AS cfg, p.prorettype::regtype::text AS ret,
         pg_get_userbyid(p.proowner)::text AS owner, p.prosrc::text AS src
  INTO v_p
  FROM pg_proc p WHERE p.oid = v_fn::oid;

  IF NOT v_p.prosecdef THEN
    RAISE EXCEPTION 'conferir: perdeu SECURITY DEFINER';
  END IF;
  IF v_p.cfg IS DISTINCT FROM '{"search_path=public, pg_temp"}' THEN
    RAISE EXCEPTION 'conferir: search_path inesperado: %', v_p.cfg;
  END IF;
  IF v_p.ret <> 'jsonb' THEN
    RAISE EXCEPTION 'conferir: tipo de retorno mudou: %', v_p.ret;
  END IF;
  IF v_p.owner <> 'postgres' THEN
    RAISE EXCEPTION 'conferir: owner mudou: %', v_p.owner;
  END IF;
  IF position('''signed'', ''active'', ''draft'', ''pending_signature''' IN v_p.src) = 0 THEN
    RAISE EXCEPTION 'conferir: a lista de estados anulaveis nao inclui pending_signature';
  END IF;
  IF position('client_contract_signature_tokens' IN v_p.src) = 0 THEN
    RAISE EXCEPTION 'conferir: falta a invalidacao dos tokens de assinatura';
  END IF;
  IF position('v_tokens_invalidated' IN v_p.src) = 0
     OR position('UPDATE public.client_contract_signature_tokens' IN v_p.src) = 0
     OR position('UPDATE public.client_contract_signature_requests' IN v_p.src) = 0 THEN
    RAISE EXCEPTION 'conferir: faltam os UPDATE de tokens/pedidos de assinatura ou a contagem do evento';
  END IF;
  IF position('FOR UPDATE' IN v_p.src) = 0 THEN
    RAISE EXCEPTION 'conferir: falta o FOR UPDATE na leitura do contrato';
  END IF;

  IF has_function_privilege('anon', v_fn::oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'conferir: anon tem EXECUTE';
  END IF;
  IF NOT has_function_privilege('authenticated', v_fn::oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'conferir: authenticated perdeu EXECUTE';
  END IF;
  IF NOT has_function_privilege('service_role', v_fn::oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'conferir: service_role perdeu EXECUTE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
    WHERE p.oid = v_fn::oid AND a.grantee = 0 AND a.privilege_type::text = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'conferir: PUBLIC tem EXECUTE';
  END IF;

  -- Gatilho: existe, esta activo, e BEFORE UPDATE de linha sobre client_contracts.
  SELECT count(*) INTO v_n
  FROM pg_trigger t
  WHERE t.tgrelid = 'public.client_contracts'::regclass
    AND t.tgname::text = 'trg_00_client_contracts_block_reopen_cancelled'
    AND NOT t.tgisinternal
    AND t.tgenabled::text = 'O'
    AND t.tgfoid = to_regprocedure('public.fn_client_contracts_block_reopen_cancelled()')::oid
    AND (t.tgtype::int & 2) = 2     -- BEFORE
    AND (t.tgtype::int & 1) = 1     -- FOR EACH ROW
    AND (t.tgtype::int & 16) = 16;  -- UPDATE
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'conferir: gatilho trg_00_client_contracts_block_reopen_cancelled em falta ou inactivo';
  END IF;
END $chk$;
