-- ============================================================
-- 20270114920000_compras_apagar_po_so_sem_rececao
-- ============================================================
-- Falha (O11 do reteste, grave): rpc_delete_purchase_order apagava uma encomenda a fornecedor já recebida. A mercadoria de
--   uma PO ligada a uma Encomenda Cliente é recebida diretamente para a EC; apagada a PO, a reserva deixa de contar o
--   recebido (filtra po.deleted_at IS NULL) e a EC vai buscar ao stock livre unidades reservadas para ECs mais recentes.
-- Decisão: recusar apagar uma PO com mercadoria recebida; o caminho é anular primeiro a receção
--   (rpc_revert_purchase_order_receipt) e depois eliminar; para devolver mercadoria, a devolução ao fornecedor (o mesmo
--   aviso que a edição já dá). «Recebida» = a MESMA definição que a edição usa (rpc_update_purchase_order, desde
--   20261114040000): existe uma linha com received_quantity > 0.
--   Não se alarga ao estado 'received' / 'partially_received' (revisão da base): rpc_revert_purchase_order_receipt recusa
--   linhas com received_quantity <= 0, e uma PO nesse estado sem receção ficaria impossível de apagar e de reverter. Com a
--   lista branca de estados (20270114930000…950000) e o CHECK (20270114980000) esse estado já não se fabrica; na nike, a
--   11/11, não há nenhuma PO recebida sem receção (lido no desenho).
-- Alterações (as únicas; o resto é o texto vivo):
--   1. a leitura da PO passa a SELECT … FOR UPDATE: serializa com as receções, que já trancam a linha da PO;
--   2. depois da verificação «já está eliminada» e antes do UPDATE: IF EXISTS (linha com received_quantity > 0) →
--      check_violation (é regra de negócio, não falta de permissão).
-- Uso normal: POs pendentes, encomendadas ou canceladas sem receção apagam como hoje. Eliminar uma PO com mercadoria
--   recebida mostra a mensagem (PurchaseOrders.tsx mostra error.message). rpc_restore_purchase_order não muda.
-- Fica de fora: o DELETE físico direto (20270115000000), esconder o botão no ecrã (opcional, outro agente), as 6 POs de
--   teste da nike já apagadas com receção (decisão do utilizador).
--
-- Desenho: vault/ficheiros/inventario/correcao-reteste-desenho.md (fechado, com as decisões D1 a D6 do coordenador).
-- Base: RH (uetjghdkwbywbftedtth), que só tem a nike. Nada disto chega à Mudelar por esta base; na base principal só entra
--   com o ramo, e antes disso diz-se ao utilizador o que muda.
-- Partida: a definição VIVA (pg_get_functiondef, lida a 11/11), não um ficheiro. Pré-condição md5 da definição viva e do
--   ACL; no fim confere-se o md5 da definição nova, o SECURITY, o search_path e o ACL (CREATE OR REPLACE conserva o ACL).
--   O md5 esperado depois conta com os CR deste ficheiro (o corpo de uma função guarda os bytes do ficheiro): este ficheiro
--   tem de ficar em CRLF; convertido para LF, a conferência falha e a transação desfaz-se (falha segura).
-- Aplicar: SET lock_timeout de sessão antes do BEGIN e RESET no fim (o CLI pode não correr o ficheiro numa só transação).
-- Teste: supabase/tests/inventario_reteste_buracos.test.sql — correr ANTES do db push (vermelho) e DEPOIS (verde).

SET lock_timeout = '5s';

BEGIN;

-- ─── Pré-condição: a definição viva é a que foi lida (md5) e o ACL é o de hoje ──────────────────────────────────────────
DO $pre$
DECLARE
  v_oid oid := to_regprocedure('public.rpc_delete_purchase_order(uuid)');
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION '20270114920000: a função public.rpc_delete_purchase_order(uuid) não existe';
  END IF;
  IF md5(pg_get_functiondef(v_oid)) IS DISTINCT FROM '72aa46fed525e4b5cec4bf6dcf528849' THEN
    RAISE EXCEPTION '20270114920000: a definição viva de rpc_delete_purchase_order mudou desde que foi lida (md5 %); reler antes de aplicar',
      md5(pg_get_functiondef(v_oid));
  END IF;
  IF (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION '20270114920000: o ACL de rpc_delete_purchase_order mudou desde que foi lido';
  END IF;
END $pre$;

-- ─── A função (texto vivo + a alteração descrita no cabeçalho) ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_delete_purchase_order(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_before public.purchase_orders;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- 20270114920000 (O11): FOR UPDATE, a mesma trava das receções.
  SELECT * INTO v_before FROM public.purchase_orders WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.delete', v_before.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para eliminar encomendas' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Encomenda já está eliminada' USING ERRCODE = 'no_data_found';
  END IF;

  -- 20270114920000 (O11): uma PO com mercadoria recebida não se apaga (a mesma definição de «recebida» que a edição usa).
  IF EXISTS (SELECT 1 FROM public.purchase_order_items
             WHERE purchase_order_id = p_id AND received_quantity > 0) THEN
    RAISE EXCEPTION 'Esta encomenda já tem mercadoria recebida. Anule primeiro a receção; para devolver mercadoria use a devolução ao fornecedor.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.purchase_orders
  SET    deleted_at = now(), deleted_by = v_actor, updated_at = now()
  WHERE  id = p_id;

  PERFORM public.fn_manual_audit_log(
    'purchase_orders', p_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now())),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', to_jsonb(v_actor))
    ),
    'web_app', p_id
  );
END;
$function$;

-- ─── Conferir: corpo novo (md5 com os CR deste ficheiro), DEFINER/INVOKER, search_path e ACL mantidos ───────────────────
DO $chk$
DECLARE
  v_oid oid := to_regprocedure('public.rpc_delete_purchase_order(uuid)');
BEGIN
  IF md5(pg_get_functiondef(v_oid)) IS DISTINCT FROM '62df696d968a813dcd088229ce8890d8' THEN
    RAISE EXCEPTION '20270114920000: a definição nova de rpc_delete_purchase_order não é a esperada (md5 %); o ficheiro tem de estar em CRLF',
      md5(pg_get_functiondef(v_oid));
  END IF;
  IF (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM true
     OR (SELECT array_to_string(p.proconfig, ',')::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM 'search_path=public, pg_temp'
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION '20270114920000: rpc_delete_purchase_order perdeu o SECURITY, o search_path ou o ACL';
  END IF;
END $chk$;

COMMIT;

RESET lock_timeout;
