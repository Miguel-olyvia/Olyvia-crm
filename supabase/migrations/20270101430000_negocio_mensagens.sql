-- Negócio (30/10/2026): a conversa com o cliente, a mesma nas Operações e no portal do cliente.
--
-- Até aqui a «Conversa com o cliente» da página de obra (Operações) era um desenho do protótipo (um array dentro do estado do negócio) e o portal
-- real não tinha conversa: a «dúvida» do cliente só gerava uma notificação, sem texto guardado nem resposta.
--
-- O que muda (a base só cresce; nada se apaga):
--   1. Tabela negocio_mensagens: uma linha por mensagem de um negócio, escrita pelo cliente (portal) ou pela equipa (CRM).
--      RLS activa e SEM políticas, sem privilégios para anon nem authenticated: ninguém lê nem escreve na tabela directamente.
--   2. Funções SECURITY DEFINER, as únicas portas de entrada:
--      · CRM (pessoas.view / pessoas.edit, pelo número do negócio da organização): neg_mensagens_ler, neg_mensagem_enviar, neg_mensagens_marcar_lidas.
--        O autor da equipa é o utilizador que escreve (nome lido do servidor, nunca enviado pelo cliente da chamada).
--      · Portal (conta de portal cuja pessoa e organização são as do negócio): portal_neg_mensagens_ler, portal_neg_mensagem_enviar,
--        portal_neg_mensagens_marcar_lidas e portal_neg_mensagens_nao_lidas. O autor do cliente é o nome da ficha dele.
--   3. Quando o cliente escreve, o comercial do negócio (negocios.assigned_to) recebe uma notificação.
--   Limites: mensagens de 1 a 2000 caracteres; o cliente até 30 mensagens por hora e negócio.
--
-- O que muda para a Mudelar: nada (tabela e funções novas). Esta migration só se aplica à RH. A migração e o código que a usa entram juntos.
SET lock_timeout = '5s';

DO $guarda$
DECLARE v_falta text;
BEGIN
  SELECT string_agg(x.t || '.' || x.c, ', ') INTO v_falta
    FROM (VALUES ('negocios','id'), ('negocios','organization_id'), ('negocios','entity_id'), ('negocios','assigned_to'), ('negocios','numero'),
                 ('negocios','deleted_at'), ('client_portal_users','auth_user_id'), ('client_portal_users','organization_id'), ('client_portal_users','entity_id'),
                 ('anew_users','id'), ('anew_users','name'), ('anew_users','auth_user_id'), ('anew_users','deleted_at'), ('anew_entities','id'), ('anew_entities','display_name'),
                 ('notifications','user_id'), ('notifications','organization_id'), ('notifications','type'), ('notifications','title'), ('notifications','message'),
                 ('notifications','kind'), ('notifications','priority'), ('notifications','link'), ('notifications','entity_type'), ('notifications','entity_id')) AS x(t, c)
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns k WHERE k.table_schema = 'public' AND k.table_name = x.t AND k.column_name = x.c);
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Faltam colunas de que as mensagens do negócio dependem: %', v_falta;
  END IF;
END
$guarda$;

-- 1. A tabela ------------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.negocio_mensagens (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL,
  negocio_id      uuid        NOT NULL,
  autor_tipo      text        NOT NULL CHECK (autor_tipo IN ('cliente', 'empresa')),
  autor_nome      text        NOT NULL CHECK (char_length(btrim(autor_nome)) BETWEEN 1 AND 200),
  autor_user_id   uuid,
  autor_auth_id   uuid,
  texto           text        NOT NULL CHECK (char_length(btrim(texto)) BETWEEN 1 AND 2000),
  created_at      timestamptz NOT NULL DEFAULT now(),
  lida_em         timestamptz,
  -- a organização da mensagem é sempre a do negócio (negocios_id_org_key é UNIQUE (id, organization_id)): a base garante-o
  CONSTRAINT negocio_mensagens_negocio_fkey FOREIGN KEY (negocio_id, organization_id) REFERENCES public.negocios (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS negocio_mensagens_negocio_idx ON public.negocio_mensagens (negocio_id, created_at);
CREATE INDEX IF NOT EXISTS negocio_mensagens_por_ler_idx ON public.negocio_mensagens (negocio_id, autor_tipo) WHERE lida_em IS NULL;
ALTER TABLE public.negocio_mensagens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.negocio_mensagens FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.negocio_mensagens IS 'Negócio: a conversa entre a equipa e o cliente (Operações e portal). Sem políticas: só as funções neg_mensagens_* e portal_neg_mensagens_* lêem e escrevem. 20270101430000.';

-- 2. Auxiliares internos (sem acesso directo) ------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_neg_msg_json(m public.negocio_mensagens)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('id', m.id, 'de', m.autor_tipo, 'quem', m.autor_nome, 't', m.texto, 'em', m.created_at, 'lida', m.lida_em IS NOT NULL);
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_msg_json(public.negocio_mensagens) FROM PUBLIC, anon, authenticated, service_role;

-- O negócio de um número numa organização (CRM); NULL se não existe.
CREATE OR REPLACE FUNCTION public.fn_neg_msg_negocio(p_organization_id uuid, p_numero integer)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT n.id FROM public.negocios n WHERE n.organization_id = p_organization_id AND n.numero = p_numero AND n.deleted_at IS NULL LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_msg_negocio(uuid, integer) FROM PUBLIC, anon, authenticated, service_role;

-- O negócio de uma conta de portal: só se a pessoa e a organização da conta são as do negócio; senão erro (a mesma mensagem para «não existe»).
CREATE OR REPLACE FUNCTION public.fn_portal_msg_negocio(p_negocio_id uuid)
 RETURNS public.negocios
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v public.negocios;
BEGIN
  IF auth.uid() IS NULL OR p_negocio_id IS NULL THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'CT001';
  END IF;
  SELECT n.* INTO v
    FROM public.negocios n
   WHERE n.id = p_negocio_id AND n.deleted_at IS NULL
     AND EXISTS (SELECT 1 FROM public.client_portal_users cpu
                  WHERE cpu.auth_user_id = auth.uid() AND cpu.organization_id = n.organization_id AND cpu.entity_id = n.entity_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'CT001';
  END IF;
  RETURN v;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_portal_msg_negocio(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- 3. CRM: ler, enviar, marcar como lidas ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_mensagens_ler(p_organization_id uuid, p_numero integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_neg uuid;
BEGIN
  IF p_organization_id IS NULL OR p_numero IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view).' USING ERRCODE = 'CT001';
  END IF;
  PERFORM public.fn_cat_exigir(p_organization_id, 'pessoas.view');
  v_neg := public.fn_neg_msg_negocio(p_organization_id, p_numero);
  IF v_neg IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view).' USING ERRCODE = 'CT001';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(public.fn_neg_msg_json(m) ORDER BY m.created_at, m.id)
                     FROM (SELECT * FROM public.negocio_mensagens WHERE negocio_id = v_neg ORDER BY created_at DESC, id DESC LIMIT 200) m), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.neg_mensagem_enviar(p_organization_id uuid, p_numero integer, p_texto text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_neg   uuid;
  v_texto text := btrim(p_texto);
  v_actor uuid;
  v_nome  text;
  v_m     public.negocio_mensagens;
BEGIN
  IF p_organization_id IS NULL OR p_numero IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit).' USING ERRCODE = 'CT001';
  END IF;
  PERFORM public.fn_cat_exigir(p_organization_id, 'pessoas.edit');
  v_neg := public.fn_neg_msg_negocio(p_organization_id, p_numero);
  IF v_neg IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit).' USING ERRCODE = 'CT001';
  END IF;
  IF v_texto IS NULL OR char_length(v_texto) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Dados inválidos: a mensagem tem de 1 a 2000 caracteres.' USING ERRCODE = 'NE006';
  END IF;
  v_actor := public.current_business_user_id();
  SELECT u.name INTO v_nome FROM public.anew_users u WHERE u.id = v_actor;
  INSERT INTO public.negocio_mensagens (organization_id, negocio_id, autor_tipo, autor_nome, autor_user_id, autor_auth_id, texto)
  VALUES (p_organization_id, v_neg, 'empresa', COALESCE(NULLIF(btrim(v_nome), ''), 'Equipa'), v_actor, auth.uid(), v_texto)
  RETURNING * INTO v_m;
  RETURN public.fn_neg_msg_json(v_m);
END;
$function$;

CREATE OR REPLACE FUNCTION public.neg_mensagens_marcar_lidas(p_organization_id uuid, p_numero integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_neg uuid; v_n integer;
BEGIN
  IF p_organization_id IS NULL OR p_numero IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit).' USING ERRCODE = 'CT001';
  END IF;
  PERFORM public.fn_cat_exigir(p_organization_id, 'pessoas.edit');
  v_neg := public.fn_neg_msg_negocio(p_organization_id, p_numero);
  IF v_neg IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit).' USING ERRCODE = 'CT001';
  END IF;
  UPDATE public.negocio_mensagens SET lida_em = now() WHERE negocio_id = v_neg AND autor_tipo = 'cliente' AND lida_em IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

-- 4. Portal: ler, enviar, marcar como lidas, contar as por ler -------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_neg_mensagens_ler(p_negocio_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v public.negocios;
BEGIN
  v := public.fn_portal_msg_negocio(p_negocio_id);
  RETURN COALESCE((SELECT jsonb_agg(public.fn_neg_msg_json(m) ORDER BY m.created_at, m.id)
                     FROM (SELECT * FROM public.negocio_mensagens WHERE negocio_id = v.id ORDER BY created_at DESC, id DESC LIMIT 200) m), '[]'::jsonb);
END;
$function$;

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

  -- avisa o comercial do negócio
  SELECT u.auth_user_id INTO v_notif FROM public.anew_users u WHERE u.id = v.assigned_to AND u.deleted_at IS NULL;
  IF v_notif IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, organization_id, type, kind, title, message, priority, link, entity_type, entity_id)
    VALUES (v_notif, v.organization_id, 'client_message', 'notification', 'Mensagem de ' || COALESCE(v_nome, 'Cliente'),
            left(v_texto, 200), 'high', '/negocios', 'negocio', v.id);
  END IF;
  RETURN public.fn_neg_msg_json(v_m);
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_neg_mensagens_marcar_lidas(p_negocio_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v public.negocios; v_n integer;
BEGIN
  v := public.fn_portal_msg_negocio(p_negocio_id);
  UPDATE public.negocio_mensagens SET lida_em = now() WHERE negocio_id = v.id AND autor_tipo = 'empresa' AND lida_em IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

-- {negocio_id: n} com as mensagens da equipa por ler, só dos negócios desta conta de portal.
CREATE OR REPLACE FUNCTION public.portal_neg_mensagens_nao_lidas()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_object_agg(x.negocio_id, x.n), '{}'::jsonb)
    FROM (SELECT m.negocio_id, count(*)::integer AS n
            FROM public.negocio_mensagens m
            JOIN public.negocios g ON g.id = m.negocio_id AND g.deleted_at IS NULL
           WHERE auth.uid() IS NOT NULL AND m.autor_tipo = 'empresa' AND m.lida_em IS NULL
             AND EXISTS (SELECT 1 FROM public.client_portal_users cpu
                          WHERE cpu.auth_user_id = auth.uid() AND cpu.organization_id = g.organization_id AND cpu.entity_id = g.entity_id)
           GROUP BY m.negocio_id) x;
$function$;

-- 5. Privilégios: só utilizadores com sessão; nunca anon ------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.neg_mensagens_ler(uuid, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.neg_mensagem_enviar(uuid, integer, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.neg_mensagens_marcar_lidas(uuid, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_neg_mensagens_ler(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_neg_mensagem_enviar(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_neg_mensagens_marcar_lidas(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_neg_mensagens_nao_lidas() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_mensagens_ler(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_mensagem_enviar(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_mensagens_marcar_lidas(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_neg_mensagens_ler(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_neg_mensagem_enviar(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_neg_mensagens_marcar_lidas(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_neg_mensagens_nao_lidas() TO authenticated;

COMMENT ON FUNCTION public.neg_mensagens_ler(uuid, integer) IS 'Negócio: as últimas 200 mensagens da conversa com o cliente (por organização e número do negócio). pessoas.view. 20270101430000.';
COMMENT ON FUNCTION public.neg_mensagem_enviar(uuid, integer, text) IS 'Negócio: a equipa escreve ao cliente; o autor é o utilizador com sessão. pessoas.edit. 20270101430000.';
COMMENT ON FUNCTION public.neg_mensagens_marcar_lidas(uuid, integer) IS 'Negócio: marca como lidas as mensagens do cliente. pessoas.edit. 20270101430000.';
COMMENT ON FUNCTION public.portal_neg_mensagens_ler(uuid) IS 'Portal: as últimas 200 mensagens de um negócio da conta de portal que chama. 20270101430000.';
COMMENT ON FUNCTION public.portal_neg_mensagem_enviar(uuid, text) IS 'Portal: o cliente escreve à equipa (até 30 por hora e negócio) e o comercial do negócio é notificado. 20270101430000.';
COMMENT ON FUNCTION public.portal_neg_mensagens_marcar_lidas(uuid) IS 'Portal: marca como lidas as mensagens da equipa de um negócio da conta que chama. 20270101430000.';
COMMENT ON FUNCTION public.portal_neg_mensagens_nao_lidas() IS 'Portal: {negocio_id: n} com as mensagens da equipa por ler nos negócios da conta que chama. 20270101430000.';

-- 6. Verificação final: RLS activa, sem privilégios directos, e as sete funções só para authenticated.
DO $verifica$
DECLARE v_n integer;
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.negocio_mensagens'::regclass) THEN
    RAISE EXCEPTION 'negocio_mensagens ficou sem RLS.';
  END IF;
  IF has_table_privilege('anon', 'public.negocio_mensagens', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.negocio_mensagens', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'negocio_mensagens ficou com privilégios directos para anon ou authenticated.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('neg_mensagens_ler', 'neg_mensagem_enviar', 'neg_mensagens_marcar_lidas', 'portal_neg_mensagens_ler',
                       'portal_neg_mensagem_enviar', 'portal_neg_mensagens_marcar_lidas', 'portal_neg_mensagens_nao_lidas')
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'As funções das mensagens não ficaram só para authenticated (esperadas 7, certas %).', v_n;
  END IF;
END
$verifica$;
