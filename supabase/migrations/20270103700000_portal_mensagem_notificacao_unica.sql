-- Conversa do portal: a segunda mensagem do cliente deixa de rebentar com «notifications_dedup».
--
-- A chave notifications_dedup (type, entity_id, user_id) WHERE is_resolved = false só deixa UMA notificação por tipo, negócio e
-- utilizador enquanto não estiver resolvida. portal_neg_mensagem_enviar (20270101430000) criava uma notificação 'client_message'
-- por mensagem: a primeira passava e a segunda dava «duplicate key value violates unique constraint "notifications_dedup"»,
-- o cliente via o erro e a mensagem nem ficava gravada (a transação desfaz-se).
--
-- Agora, se já existe uma notificação por resolver deste negócio para o comercial, atualiza-se com a mensagem mais recente (título,
-- texto, prioridade, data) e volta a aparecer como nova (por ler, não dispensada); senão cria-se, como antes. O resto da função
-- fica igual. É a função lida da base RH a 3/11/2026 (md5 abaixo). Não precisa de código novo.
SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF md5(replace(pg_get_functiondef('public.portal_neg_mensagem_enviar(uuid,text)'::regprocedure), E'\r', ''))
       <> 'e5c1b0bf6d0aa0beeb31a76c74746364' THEN
    RAISE EXCEPTION 'Guarda: portal_neg_mensagem_enviar mudou desde a leitura da base RH. Rever esta migration antes de a aplicar.';
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public.portal_neg_mensagem_enviar(p_negocio_id uuid, p_texto text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v        public.negocios;
  v_texto  text := btrim(p_texto);
  v_nome   text;
  v_notif  uuid;
  v_m      public.negocio_mensagens;
BEGIN
  v := public.fn_portal_msg_negocio(p_negocio_id);
  IF v_texto IS NULL OR char_length(v_texto) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Dados inválidos: a mensagem tem de 1 a 2000 caracteres.' USING ERRCODE = 'NE006';
  END IF;
  IF (SELECT count(*) FROM public.negocio_mensagens
       WHERE negocio_id = v.id AND autor_tipo = 'cliente' AND created_at > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'Demasiadas mensagens: tente daqui a pouco.' USING ERRCODE = 'NE010';
  END IF;
  SELECT COALESCE(NULLIF(btrim(e.display_name), ''), 'Cliente') INTO v_nome FROM public.anew_entities e WHERE e.id = v.entity_id;
  INSERT INTO public.negocio_mensagens (organization_id, negocio_id, autor_tipo, autor_nome, autor_auth_id, texto)
  VALUES (v.organization_id, v.id, 'cliente', COALESCE(v_nome, 'Cliente'), auth.uid(), v_texto)
  RETURNING * INTO v_m;

  -- avisa o comercial do negócio: uma só notificação por resolver por negócio (notifications_dedup); a mais recente ganha
  SELECT u.auth_user_id INTO v_notif FROM public.anew_users u WHERE u.id = v.assigned_to AND u.deleted_at IS NULL;
  IF v_notif IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, organization_id, type, kind, title, message, priority, link, entity_type, entity_id)
    VALUES (v_notif, v.organization_id, 'client_message', 'notification', 'Mensagem de ' || COALESCE(v_nome, 'Cliente'),
            left(v_texto, 200), 'high', '/negocios', 'negocio', v.id)
    ON CONFLICT (type, entity_id, user_id) WHERE (is_resolved = false)
    DO UPDATE SET title = EXCLUDED.title, message = EXCLUDED.message, priority = EXCLUDED.priority,
                  is_read = false, read_at = NULL, is_dismissed = false, created_at = now();
  END IF;
  RETURN public.fn_neg_msg_json(v_m);
END;
$function$;

-- Conferir: continua sem EXECUTE para anon e com a correção; os grants de quem a chama não mudaram (CREATE OR REPLACE mantém-nos).
DO $conferir$
BEGIN
  IF position('ON CONFLICT (type, entity_id, user_id)' IN pg_get_functiondef('public.portal_neg_mensagem_enviar(uuid,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Conferir: a função não ficou com o ON CONFLICT da notificação.';
  END IF;
  IF has_function_privilege('anon', 'public.portal_neg_mensagem_enviar(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: anon não pode executar portal_neg_mensagem_enviar.';
  END IF;
END $conferir$;
