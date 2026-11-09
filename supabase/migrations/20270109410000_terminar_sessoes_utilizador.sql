-- 20270109410000 — "Terminar sessões" passa a funcionar.
-- A edge revoke-user-sessions chamava auth.admin.signOut(<id do utilizador>), mas essa função espera o JWT da sessão:
-- o GoTrue respondia 403 bad_jwt e nenhuma sessão era terminada (confirmado em 05/11/2026). Não há chamada de Admin API
-- para terminar as sessões de um utilizador pelo id, por isso faz-se na base: apagar auth.sessions do utilizador
-- (auth.refresh_tokens e auth.mfa_amr_claims seguem por ON DELETE CASCADE) e os refresh tokens antigos sem sessão.
-- Os access tokens já emitidos continuam válidos até expirarem (no máximo o tempo de vida do JWT, 1 h por omissão).
-- Só a service_role a executa: a edge chama-a DEPOIS de verificar a autorização (admin de sistema ou users.edit sobre
-- a pessoa, fn_pode_gerir_utilizador_por). Sem tabelas nem colunas novas.

DO $guard$
BEGIN
  IF to_regprocedure('public.fn_terminar_sessoes_utilizador(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'fn_terminar_sessoes_utilizador já existe - parar e reler';
  END IF;
END
$guard$;

CREATE FUNCTION public.fn_terminar_sessoes_utilizador(p_auth_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_n integer;
BEGIN
  -- 20270109410000: apaga todas as sessões (e os refresh tokens) da conta. Devolve o número de sessões terminadas.
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilizador em falta' USING ERRCODE = '22004';
  END IF;
  DELETE FROM auth.sessions s WHERE s.user_id = p_auth_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  DELETE FROM auth.refresh_tokens rt WHERE rt.user_id = p_auth_user_id::text;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_terminar_sessoes_utilizador(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_terminar_sessoes_utilizador(uuid) TO service_role;
