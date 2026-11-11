-- ============================================================
-- 20270114900000_inventario_apagar_stock_so_a_zero
-- ============================================================
-- Falha (F12 do reteste): rpc_delete_stock apagava uma linha de stock com qualquer quantidade, sem movimento nenhum. O ecrã
--   deixava de mostrar as unidades e a soma dos movimentos continuava a dizer que existiam.
-- Decisão (D5): recusar apagar uma linha com quantidade diferente de 0 (também a negativa, dívida de venda); a mensagem manda
--   fazer primeiro o ajuste até 0. Não se faz o ajuste automático: quem só tem inventory.delete passaria a mexer na
--   quantidade sem inventory.edit.
-- Alterações (as únicas; o resto é o texto vivo):
--   1. a leitura da linha passa a SELECT … FOR UPDATE (a mesma trava que fn_stock_movements_apply toma), para um movimento
--      concorrente não mudar a quantidade entre a verificação e o apagar;
--   2. depois da verificação «já está eliminado» e antes do UPDATE: IF COALESCE(quantity, 0) <> 0 → check_violation.
-- Uso normal: apagar uma linha a 0 é igual a hoje. Apagar uma linha com stock mostra a mensagem (Stocks.tsx mostra
--   error.message). Na nike, a 11/11: 0 linhas apagadas com quantidade.
-- Fica de fora: o DELETE físico direto (ficheiro 20270114990000), o ecrã.
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
  v_oid oid := to_regprocedure('public.rpc_delete_stock(uuid)');
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION '20270114900000: a função public.rpc_delete_stock(uuid) não existe';
  END IF;
  IF md5(pg_get_functiondef(v_oid)) IS DISTINCT FROM '3a938566146b3c776479f3af4f20ebaf' THEN
    RAISE EXCEPTION '20270114900000: a definição viva de rpc_delete_stock mudou desde que foi lida (md5 %); reler antes de aplicar',
      md5(pg_get_functiondef(v_oid));
  END IF;
  IF (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION '20270114900000: o ACL de rpc_delete_stock mudou desde que foi lido';
  END IF;
END $pre$;

-- ─── A função (texto vivo + a alteração descrita no cabeçalho) ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_delete_stock(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_before public.stocks;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- 20270114900000 (F12): FOR UPDATE, a mesma trava dos movimentos.
  SELECT * INTO v_before FROM public.stocks WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.delete', v_before.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para eliminar stocks' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Stock já está eliminado' USING ERRCODE = 'no_data_found';
  END IF;

  -- 20270114900000 (F12): só se apaga uma linha a 0; apagar com quantidade escondia unidades que os movimentos contam.
  IF COALESCE(v_before.quantity, 0) <> 0 THEN
    RAISE EXCEPTION 'Esta linha ainda tem % unidade(s). Registe primeiro um ajuste (Registar movimento › Ajuste) até 0 e depois elimine-a.', v_before.quantity
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.stocks
  SET    deleted_at = now(), deleted_by = v_actor, updated_at = now()
  WHERE  id = p_id;

  PERFORM public.fn_manual_audit_log(
    'stocks', p_id, v_before.organization_id, 'UPDATE',
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
  v_oid oid := to_regprocedure('public.rpc_delete_stock(uuid)');
BEGIN
  IF md5(pg_get_functiondef(v_oid)) IS DISTINCT FROM 'dd35b80dd5a0cbd2305319368edad550' THEN
    RAISE EXCEPTION '20270114900000: a definição nova de rpc_delete_stock não é a esperada (md5 %); o ficheiro tem de estar em CRLF',
      md5(pg_get_functiondef(v_oid));
  END IF;
  IF (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM true
     OR (SELECT array_to_string(p.proconfig, ',')::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM 'search_path=public, pg_temp'
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION '20270114900000: rpc_delete_stock perdeu o SECURITY, o search_path ou o ACL';
  END IF;
END $chk$;

COMMIT;

RESET lock_timeout;
