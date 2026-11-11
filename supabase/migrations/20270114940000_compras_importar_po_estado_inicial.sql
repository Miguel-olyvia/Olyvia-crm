-- ============================================================
-- 20270114940000_compras_importar_po_estado_inicial
-- ============================================================
-- Falha (F5 do reteste): rpc_import_purchase_orders_csv gravava o Estado que viesse no CSV. Importava-se uma PO já
--   «encomendada» sem purchase_orders.approve, ou já «recebida» sem receção nenhuma (conta como recebida na reserva da EC).
-- Decisões (D2 + revisão de segurança, MEDIUM: lista branca): por linha, na organização da linha, só 'pending'; 'ordered'
--   apenas com purchase_orders.approve; tudo o resto recusado (received, partially_received, cancelled, texto livre).
--   Normalizado com lower(btrim()); grava-se o valor normalizado; vazio = 'pending', como hoje.
--   (D6) *.import NÃO passa a exigir *.create: a verificação create OU import fica como está.
-- Alterações (as únicas; o resto é o texto vivo):
--   1. nova variável v_status;
--   2. dentro do ciclo, a seguir à verificação create/import da organização da linha e antes do INSERT, as mesmas duas
--      verificações do 20270114930000 (a mensagem leva o número da encomenda);
--   3. o INSERT grava v_status. Uma linha recusada desfaz a importação inteira (como hoje com as outras recusas).
-- Uso normal: importar CSVs com Estado pendente (ou vazio) é igual a hoje. Reimportar uma exportação com encomendas
--   encomendadas pede purchase_orders.approve; com Estado recebido, parcial ou cancelado passa a ser recusado com o número
--   da encomenda na mensagem (a exportação inclui o Estado: purchaseOrdersExportImport.ts).
-- Fica de fora (registado, não desta leva): validar a organização do fornecedor; o ecrã.
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
  v_oid oid := to_regprocedure('public.rpc_import_purchase_orders_csv(jsonb)');
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION '20270114940000: a função public.rpc_import_purchase_orders_csv(jsonb) não existe';
  END IF;
  IF md5(pg_get_functiondef(v_oid)) IS DISTINCT FROM 'dbea9a9587d6324d568311e0bb67129f' THEN
    RAISE EXCEPTION '20270114940000: a definição viva de rpc_import_purchase_orders_csv mudou desde que foi lida (md5 %); reler antes de aplicar',
      md5(pg_get_functiondef(v_oid));
  END IF;
  IF (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION '20270114940000: o ACL de rpc_import_purchase_orders_csv mudou desde que foi lido';
  END IF;
END $pre$;

-- ─── A função (texto vivo + a alteração descrita no cabeçalho) ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_import_purchase_orders_csv(p_orders jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor    uuid;
  v_row      jsonb;
  v_order    public.purchase_orders;
  v_org_id   uuid;
  v_count    integer := 0;
  v_new      jsonb;
  v_diff     jsonb;
  v_status   text;  -- 20270114940000 (F5)
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_orders IS NULL OR jsonb_typeof(p_orders) <> 'array' OR jsonb_array_length(p_orders) = 0 THEN
    RAISE EXCEPTION 'Sem encomendas válidas para importar' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with purchase_orders_insert RLS, predicate (2) ───
  -- The import is INSERT INTO purchase_orders; that policy checks 'purchase_orders.create'
  -- (no 'purchase_orders.import' predicate exists in the DB). Checked once up front so the
  -- whole batch fails before any write if the caller lacks the create permission.
  -- 20270108540000: aceita também purchase_orders.import (a permissão que o ecrã pede para o botão Importar). Aqui só a
  -- verificação rápida (alguma das duas); a de cada linha, por organização, está no ciclo.
  IF NOT (public.has_anew_permission(auth.uid(), 'purchase_orders.create')
          OR public.has_anew_permission(auth.uid(), 'purchase_orders.import')) THEN
    RAISE EXCEPTION 'Sem permissão para importar encomendas de compra' USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_orders)
  LOOP
    v_org_id := nullif(v_row ->> 'organization_id', '')::uuid;

    -- ── Authorization parity: each PO's org must be in the caller's scope ────
    IF v_org_id IS NULL OR NOT public.fn_deal_org_in_scope(v_org_id) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- 20270108540000: create OU import na organização da PO (Lote B: a permissão conta na organização da linha).
    IF NOT (public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.create', v_org_id)
            OR public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.import', v_org_id)) THEN
      RAISE EXCEPTION 'Sem permissão para importar encomendas de compra nesta organização' USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 20270114940000 (F5): uma PO importada nasce pendente; 'ordered' só com a permissão de aprovar nesta organização.
    -- Lista branca, com o estado normalizado (é o valor normalizado que se grava).
    v_status := COALESCE(nullif(lower(btrim(v_row ->> 'status')), ''), 'pending');
    IF v_status NOT IN ('pending', 'ordered') THEN
      RAISE EXCEPTION 'A encomenda % não pode ser importada com o estado %: importe-a pendente (a mercadoria regista-se na Receção)', v_row ->> 'order_number', v_row ->> 'status'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_status = 'ordered'
       AND NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.approve', v_org_id) THEN
      RAISE EXCEPTION 'Sem permissão para aprovar encomendas: a encomenda % tem de ser importada pendente', v_row ->> 'order_number'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- ── INSERT the imported PO (mirrors parsePurchaseOrdersCSV output) ───────
    -- order_number comes from the CSV (values[0]); it is required and non-empty
    -- there, so it is inserted as-is rather than auto-generated.
    INSERT INTO public.purchase_orders (
      order_number, supplier_id, order_date, expected_delivery, status,
      total_value, notes, organization_id, created_by
    )
    VALUES (
      v_row ->> 'order_number',
      nullif(v_row ->> 'supplier_id', '')::uuid,
      (v_row ->> 'order_date')::date,
      nullif(v_row ->> 'expected_delivery', '')::date,
      v_status,  -- 20270114940000 (F5)
      COALESCE((v_row ->> 'total_value')::numeric, 0),
      nullif(v_row ->> 'notes', ''),
      v_org_id,
      -- created_by is ALWAYS the authenticated caller (v_actor), never a value taken
      -- from the payload — matching every other RPC in the codebase (rpc_create_purchase_order,
      -- rpc_update_purchase_order, products/roles RPCs). Trusting v_row->>'created_by' would let
      -- an authenticated caller forge the author of imported POs, breaking audit traceability.
      -- The FE (parsePurchaseOrdersCSV) already always passes its own businessUserId, so this is
      -- behavior-preserving via the UI while closing the direct-call forgery gap.
      v_actor
    )
    RETURNING * INTO v_order;

    -- ── One INSERT audit row per imported PO (source 'csv_import') ───────────
    v_new := to_jsonb(v_order);
    v_diff := jsonb_build_object(
      'purchase_orders', jsonb_build_object(
        'order_number',      jsonb_build_object('old', NULL, 'new', v_new -> 'order_number'),
        'supplier_id',       jsonb_build_object('old', NULL, 'new', v_new -> 'supplier_id'),
        'order_date',        jsonb_build_object('old', NULL, 'new', v_new -> 'order_date'),
        'expected_delivery', jsonb_build_object('old', NULL, 'new', v_new -> 'expected_delivery'),
        'status',            jsonb_build_object('old', NULL, 'new', v_new -> 'status'),
        'total_value',       jsonb_build_object('old', NULL, 'new', v_new -> 'total_value'),
        'notes',             jsonb_build_object('old', NULL, 'new', v_new -> 'notes'),
        'organization_id',   jsonb_build_object('old', NULL, 'new', v_new -> 'organization_id')
      )
    );

    PERFORM public.fn_manual_audit_log(
      'purchase_orders', v_order.id, v_order.organization_id, 'INSERT', v_diff, 'csv_import'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- ─── Conferir: corpo novo (md5 com os CR deste ficheiro), DEFINER/INVOKER, search_path e ACL mantidos ───────────────────
DO $chk$
DECLARE
  v_oid oid := to_regprocedure('public.rpc_import_purchase_orders_csv(jsonb)');
BEGIN
  IF md5(pg_get_functiondef(v_oid)) IS DISTINCT FROM 'c95b9e39ecc7439d6a422554edab963a' THEN
    RAISE EXCEPTION '20270114940000: a definição nova de rpc_import_purchase_orders_csv não é a esperada (md5 %); o ficheiro tem de estar em CRLF',
      md5(pg_get_functiondef(v_oid));
  END IF;
  IF (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM true
     OR (SELECT array_to_string(p.proconfig, ',')::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM 'search_path=public, pg_temp'
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION '20270114940000: rpc_import_purchase_orders_csv perdeu o SECURITY, o search_path ou o ACL';
  END IF;
END $chk$;

COMMIT;

RESET lock_timeout;
