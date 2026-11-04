-- Conversa do negócio (3/11/2026): o cliente junta fotografias às mensagens (ex.: mostrar um problema na obra).
--
-- Até aqui a conversa (20270101430000) só levava texto. O gestor de obra precisa de ver o problema que o cliente reporta para criar as
-- tarefas que o resolvem (com ou sem orçamento): por isso as mensagens do cliente passam a poder levar até 4 fotografias.
--
-- O que muda (a base só cresce; nada se apaga):
--   1. Tabela negocio_mensagem_fotos: uma linha por fotografia de uma mensagem, com os bytes (bytea, até 1,5 MB; JPEG, PNG ou WebP).
--      RLS activa e SEM políticas, sem privilégios para anon nem authenticated: como negocio_mensagens, só as funções lêem e escrevem.
--      Não se usa o Storage: sem Edge nem políticas de bucket, a mesma porta de entrada da conversa (SECURITY DEFINER) chega.
--   2. fn_neg_msg_json passa a devolver também 'fotos': os ids das fotografias da mensagem, pela ordem. O resto fica igual.
--   3. Funções novas:
--      · portal_neg_mensagem_enviar_fotos(negócio, texto, fotos): o cliente envia a mensagem com fotografias. A mensagem passa pela
--        portal_neg_mensagem_enviar de sempre (a mesma validação, o limite de 30 por hora e a notificação ao comercial); as fotografias
--        gravam-se na mesma transação (se uma falha, nada fica). Sem texto, a mensagem fica «Enviei N fotografias.».
--      · portal_neg_mensagem_foto(foto): o cliente lê uma fotografia de um negócio dele.
--      · neg_mensagem_foto(organização, foto): a equipa (pessoas.view) lê uma fotografia de um negócio da organização.
--      Cada fotografia vem como {mime, b64}; a leitura devolve {mime, b64}.
--   Limites: 1 a 4 fotografias por mensagem; até 1,5 MB cada (o portal reduz a 1600 px antes de enviar); até 200 por negócio.
--   4. Quem é avisado quando o cliente escreve (decisão do Rúben, 3/11): os GESTORES DE OBRA da organização (as pessoas do RH com o papel
--      «operacoes» no Negócio e uma conta activa), em vez do comercial do negócio. Só se a organização não tiver nenhum gestor de obra com
--      conta é que o aviso vai ao comercial (como antes), para a mensagem nunca ficar sem ninguém. Com fotografias, o título diz que o
--      cliente mostrou um problema. A notificação abre a obra (/negocios?vista=operacoes&obra=<número>).
--      portal_neg_mensagem_enviar passa a usar a função interna fn_portal_neg_msg_gravar (a mesma validação, o mesmo limite por hora e a
--      mesma notificação única por resolver, de 20270103700000); a assinatura, os GRANT e o que devolve não mudam.
--
-- O que muda para a Mudelar: nada (tabela e funções novas). Esta migration só se aplica à RH.
-- Precisa do código novo para se ver (o portal só envia fotografias com ele), mas aplicada sozinha não parte nada: as mensagens antigas
-- ficam com 'fotos': [] e o código de antes ignora o campo. O aviso passa logo a ir aos gestores de obra.
SET lock_timeout = '5s';

DO $guarda$
DECLARE v_falta text;
BEGIN
  IF to_regclass('public.negocio_mensagens') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta a tabela negocio_mensagens (migration 20270101430000).';
  END IF;
  IF to_regprocedure('public.portal_neg_mensagem_enviar(uuid,text)') IS NULL OR to_regprocedure('public.fn_portal_msg_negocio(uuid)') IS NULL
     OR to_regprocedure('public.fn_neg_msg_json(public.negocio_mensagens)') IS NULL OR to_regprocedure('public.fn_cat_exigir(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: faltam as funções da conversa do negócio (20270101430000) ou fn_cat_exigir.';
  END IF;
  -- a notificação única por resolver (20270103700000) já tem de estar aplicada: esta migration parte dessa versão
  IF position('ON CONFLICT (type, entity_id, user_id)' IN pg_get_functiondef('public.portal_neg_mensagem_enviar(uuid,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Guarda: aplicar primeiro 20270103700000_portal_mensagem_notificacao_unica.sql.';
  END IF;
  SELECT string_agg(x.t || '.' || x.c, ', ') INTO v_falta
    FROM (VALUES ('pessoas_papeis_negocio','pessoa_id'), ('pessoas_papeis_negocio','organization_id'), ('pessoas_papeis_negocio','papel'),
                 ('pessoas_contas','pessoa_id'), ('pessoas_contas','anew_user_id'), ('pessoas_contas','organization_id'), ('pessoas_contas','estado'),
                 ('pessoas_contas','revogada_em'), ('pessoas','deleted_at'), ('pessoas','data_saida')) AS x(t, c)
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns k WHERE k.table_schema = 'public' AND k.table_name = x.t AND k.column_name = x.c);
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: faltam colunas de que o aviso aos gestores de obra depende: %', v_falta;
  END IF;
END
$guarda$;

-- 1. A tabela ------------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.negocio_mensagem_fotos (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL,
  negocio_id      uuid        NOT NULL,
  mensagem_id     uuid        NOT NULL REFERENCES public.negocio_mensagens (id) ON DELETE CASCADE,
  ordem           smallint    NOT NULL CHECK (ordem BETWEEN 1 AND 4),
  mime            text        NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  dados           bytea       NOT NULL CHECK (octet_length(dados) BETWEEN 100 AND 1572864),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT negocio_mensagem_fotos_ordem_key UNIQUE (mensagem_id, ordem),
  CONSTRAINT negocio_mensagem_fotos_negocio_fkey FOREIGN KEY (negocio_id, organization_id) REFERENCES public.negocios (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS negocio_mensagem_fotos_negocio_idx ON public.negocio_mensagem_fotos (negocio_id);
ALTER TABLE public.negocio_mensagem_fotos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.negocio_mensagem_fotos FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.negocio_mensagem_fotos IS 'Negócio: as fotografias das mensagens da conversa (até 4 por mensagem). Sem políticas: só as funções portal_neg_mensagem_enviar_fotos, portal_neg_mensagem_foto e neg_mensagem_foto. 20270105400000.';

-- 2. A mensagem em JSON leva os ids das fotografias -------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_neg_msg_json(m public.negocio_mensagens)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('id', m.id, 'de', m.autor_tipo, 'quem', m.autor_nome, 't', m.texto, 'em', m.created_at, 'lida', m.lida_em IS NOT NULL,
    'fotos', COALESCE((SELECT jsonb_agg(f.id ORDER BY f.ordem) FROM public.negocio_mensagem_fotos f WHERE f.mensagem_id = m.id), '[]'::jsonb));
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_msg_json(public.negocio_mensagens) FROM PUBLIC, anon, authenticated, service_role;

-- Os bytes de uma fotografia enviada ({mime, b64}); erro se não é uma imagem JPEG, PNG ou WebP dentro do limite. Interna.
CREATE OR REPLACE FUNCTION public.fn_neg_msg_foto_bytes(p_foto jsonb)
 RETURNS bytea
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mime text := p_foto->>'mime';
  v_b    bytea;
BEGIN
  IF jsonb_typeof(p_foto) <> 'object' OR v_mime IS NULL OR v_mime NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
    RAISE EXCEPTION 'Dados inválidos: as fotografias têm de ser JPEG, PNG ou WebP.' USING ERRCODE = 'NE006';
  END IF;
  BEGIN
    v_b := decode(p_foto->>'b64', 'base64');
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Dados inválidos: uma fotografia não se conseguiu ler.' USING ERRCODE = 'NE006';
  END;
  IF v_b IS NULL OR octet_length(v_b) < 100 THEN
    RAISE EXCEPTION 'Dados inválidos: uma fotografia está vazia.' USING ERRCODE = 'NE006';
  END IF;
  IF octet_length(v_b) > 1572864 THEN
    RAISE EXCEPTION 'Dados inválidos: cada fotografia pode ter até 1,5 MB.' USING ERRCODE = 'NE006';
  END IF;
  -- o conteúdo tem de ser o que diz ser (os primeiros bytes de cada formato)
  IF NOT ((v_mime = 'image/jpeg' AND substring(v_b FROM 1 FOR 3) = '\xffd8ff'::bytea)
       OR (v_mime = 'image/png' AND substring(v_b FROM 1 FOR 8) = '\x89504e470d0a1a0a'::bytea)
       OR (v_mime = 'image/webp' AND substring(v_b FROM 1 FOR 4) = '\x52494646'::bytea AND substring(v_b FROM 9 FOR 4) = '\x57454250'::bytea)) THEN
    RAISE EXCEPTION 'Dados inválidos: uma fotografia não é uma imagem.' USING ERRCODE = 'NE006';
  END IF;
  RETURN v_b;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_msg_foto_bytes(jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_neg_msg_foto_json(f public.negocio_mensagem_fotos)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('id', f.id, 'mime', f.mime, 'b64', translate(encode(f.dados, 'base64'), E'\n\r', ''));
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_msg_foto_json(public.negocio_mensagem_fotos) FROM PUBLIC, anon, authenticated, service_role;

-- 3. Portal: gravar a mensagem e avisar os gestores de obra ---------------------------------------------------------------------------------------
-- Interna: valida, grava a mensagem do cliente e avisa. Uma só notificação por resolver por negócio e pessoa (notifications_dedup): a mais
-- recente ganha. p_fotos: quantas fotografias a mensagem vai levar (só muda o título do aviso).
CREATE OR REPLACE FUNCTION public.fn_portal_neg_msg_gravar(p_negocio_id uuid, p_texto text, p_fotos integer)
 RETURNS public.negocio_mensagens
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v        public.negocios;
  v_texto  text := btrim(p_texto);
  v_nome   text;
  v_titulo text;
  v_quem   uuid[];
  v_u      uuid;
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
  v_nome := COALESCE(v_nome, 'Cliente');
  INSERT INTO public.negocio_mensagens (organization_id, negocio_id, autor_tipo, autor_nome, autor_auth_id, texto)
  VALUES (v.organization_id, v.id, 'cliente', v_nome, auth.uid(), v_texto)
  RETURNING * INTO v_m;

  -- 3/11: avisa os gestores de obra da organização (papel «operacoes» no Negócio, pessoa activa, conta activa); sem nenhum, o comercial
  SELECT array_agg(DISTINCT u.auth_user_id) INTO v_quem
    FROM public.pessoas_papeis_negocio pp
    JOIN public.pessoas p ON p.id = pp.pessoa_id AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)
    JOIN public.pessoas_contas pc ON pc.pessoa_id = pp.pessoa_id AND pc.organization_id = v.organization_id AND pc.estado = 'activa' AND pc.revogada_em IS NULL
    JOIN public.anew_users u ON u.id = pc.anew_user_id AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL
   WHERE pp.organization_id = v.organization_id AND pp.papel = 'operacoes';
  IF v_quem IS NULL OR cardinality(v_quem) = 0 THEN
    SELECT array_agg(u.auth_user_id) INTO v_quem FROM public.anew_users u WHERE u.id = v.assigned_to AND u.deleted_at IS NULL AND u.auth_user_id IS NOT NULL;
  END IF;
  v_titulo := CASE WHEN COALESCE(p_fotos, 0) > 0 THEN v_nome || ' mostrou um problema (' || p_fotos || CASE WHEN p_fotos = 1 THEN ' fotografia)' ELSE ' fotografias)' END
                   ELSE 'Mensagem de ' || v_nome END;
  FOREACH v_u IN ARRAY COALESCE(v_quem, '{}'::uuid[]) LOOP
    INSERT INTO public.notifications (user_id, organization_id, type, kind, title, message, priority, link, entity_type, entity_id)
    VALUES (v_u, v.organization_id, 'client_message', 'notification', v_titulo, left(v_texto, 200), 'high',
            '/negocios?vista=operacoes&obra=' || v.numero, 'negocio', v.id)
    ON CONFLICT (type, entity_id, user_id) WHERE (is_resolved = false)
    DO UPDATE SET title = EXCLUDED.title, message = EXCLUDED.message, priority = EXCLUDED.priority, link = EXCLUDED.link,
                  is_read = false, read_at = NULL, is_dismissed = false, created_at = now();
  END LOOP;
  RETURN v_m;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_portal_neg_msg_gravar(uuid, text, integer) FROM PUBLIC, anon, authenticated, service_role;

-- A de sempre (a mesma assinatura e o mesmo resultado), agora pela gravação interna: o aviso vai aos gestores de obra.
CREATE OR REPLACE FUNCTION public.portal_neg_mensagem_enviar(p_negocio_id uuid, p_texto text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.fn_neg_msg_json(public.fn_portal_neg_msg_gravar(p_negocio_id, p_texto, 0));
END;
$function$;

-- 4. Portal: enviar com fotografias, ler uma fotografia -----------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_neg_mensagem_enviar_fotos(p_negocio_id uuid, p_texto text, p_fotos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v        public.negocios;
  v_n      integer;
  v_texto  text := NULLIF(btrim(COALESCE(p_texto, '')), '');
  v_bytes  bytea[] := '{}';
  v_m      public.negocio_mensagens;
  i        integer;
BEGIN
  v := public.fn_portal_msg_negocio(p_negocio_id);
  IF p_fotos IS NULL OR jsonb_typeof(p_fotos) <> 'array' OR jsonb_array_length(p_fotos) NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'Dados inválidos: junte de 1 a 4 fotografias.' USING ERRCODE = 'NE006';
  END IF;
  v_n := jsonb_array_length(p_fotos);
  IF (SELECT count(*) FROM public.negocio_mensagem_fotos WHERE negocio_id = v.id) + v_n > 200 THEN
    RAISE EXCEPTION 'Demasiadas fotografias neste negócio: fale com a equipa.' USING ERRCODE = 'NE010';
  END IF;
  -- todas as fotografias validam-se antes de gravar a mensagem
  FOR i IN 0 .. v_n - 1 LOOP
    v_bytes := array_append(v_bytes, public.fn_neg_msg_foto_bytes(p_fotos->i));
  END LOOP;
  -- a mensagem pelo caminho de sempre (validação, limite por hora, aviso aos gestores de obra)
  v_m := public.fn_portal_neg_msg_gravar(p_negocio_id, COALESCE(v_texto, CASE WHEN v_n = 1 THEN 'Enviei uma fotografia.' ELSE 'Enviei ' || v_n || ' fotografias.' END), v_n);
  FOR i IN 0 .. v_n - 1 LOOP
    INSERT INTO public.negocio_mensagem_fotos (organization_id, negocio_id, mensagem_id, ordem, mime, dados)
    VALUES (v.organization_id, v.id, v_m.id, i + 1, p_fotos->i->>'mime', v_bytes[i + 1]);
  END LOOP;
  RETURN public.fn_neg_msg_json(v_m);
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_neg_mensagem_foto(p_foto_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE f public.negocio_mensagem_fotos;
BEGIN
  SELECT * INTO f FROM public.negocio_mensagem_fotos WHERE id = p_foto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'CT001';
  END IF;
  PERFORM public.fn_portal_msg_negocio(f.negocio_id);
  RETURN public.fn_neg_msg_foto_json(f);
END;
$function$;

-- 5. CRM: ler uma fotografia ------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_mensagem_foto(p_organization_id uuid, p_foto_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE f public.negocio_mensagem_fotos;
BEGIN
  IF p_organization_id IS NULL OR p_foto_id IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view).' USING ERRCODE = 'CT001';
  END IF;
  PERFORM public.fn_cat_exigir(p_organization_id, 'pessoas.view');
  SELECT x.* INTO f FROM public.negocio_mensagem_fotos x
    JOIN public.negocios n ON n.id = x.negocio_id AND n.deleted_at IS NULL
   WHERE x.id = p_foto_id AND x.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view).' USING ERRCODE = 'CT001';
  END IF;
  RETURN public.fn_neg_msg_foto_json(f);
END;
$function$;

-- 6. Privilégios: só utilizadores com sessão; nunca anon ------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.portal_neg_mensagem_enviar_fotos(uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_neg_mensagem_foto(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.neg_mensagem_foto(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_neg_mensagem_enviar_fotos(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_neg_mensagem_foto(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_mensagem_foto(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.portal_neg_mensagem_enviar_fotos(uuid, text, jsonb) IS 'Portal: o cliente escreve à equipa com 1 a 4 fotografias ({mime, b64}); a mensagem segue por portal_neg_mensagem_enviar. 20270105400000.';
COMMENT ON FUNCTION public.portal_neg_mensagem_foto(uuid) IS 'Portal: uma fotografia ({id, mime, b64}) de uma mensagem de um negócio da conta que chama. 20270105400000.';
COMMENT ON FUNCTION public.neg_mensagem_foto(uuid, uuid) IS 'Negócio: uma fotografia ({id, mime, b64}) de uma mensagem de um negócio da organização. pessoas.view. 20270105400000.';

-- 7. Verificação final: RLS activa, sem privilégios directos, as funções só para authenticated, a mensagem com 'fotos' e o aviso aos gestores.
DO $verifica$
DECLARE v_n integer;
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.negocio_mensagem_fotos'::regclass) THEN
    RAISE EXCEPTION 'negocio_mensagem_fotos ficou sem RLS.';
  END IF;
  IF has_table_privilege('anon', 'public.negocio_mensagem_fotos', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.negocio_mensagem_fotos', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'negocio_mensagem_fotos ficou com privilégios directos para anon ou authenticated.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('portal_neg_mensagem_enviar_fotos', 'portal_neg_mensagem_foto', 'neg_mensagem_foto')
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'As funções das fotografias não ficaram só para authenticated (esperadas 3, certas %).', v_n;
  END IF;
  IF position('''fotos''' IN pg_get_functiondef('public.fn_neg_msg_json(public.negocio_mensagens)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'fn_neg_msg_json não ficou com as fotografias.';
  END IF;
  IF position('fn_portal_neg_msg_gravar' IN pg_get_functiondef('public.portal_neg_mensagem_enviar(uuid,text)'::regprocedure)) = 0
     OR has_function_privilege('anon', 'public.portal_neg_mensagem_enviar(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.portal_neg_mensagem_enviar(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'portal_neg_mensagem_enviar não ficou com o aviso aos gestores de obra (ou mudaram os privilégios).';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_portal_neg_msg_gravar(uuid,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'A gravação interna da mensagem ficou aberta a authenticated.';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_neg_msg_foto_bytes(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_neg_msg_foto_json(public.negocio_mensagem_fotos)', 'EXECUTE') THEN
    RAISE EXCEPTION 'As funções internas das fotografias ficaram abertas a authenticated.';
  END IF;
END
$verifica$;
