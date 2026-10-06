-- ==============================================================================
-- Anexos da admissao (2/4): as RPCs do convite (reservar, contexto, ligar,
-- descartar e listar).
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO. Estas funcoes so as chama a Edge Function
-- convite-admissao nova (accoes anexo_url, anexo_confirmar, anexo_remover e a
-- lista de anexos na accao estado). Sem a Edge nova nada as chama; com a Edge
-- nova e sem esta migration, as accoes de anexos falham (a funcao nao existe).
-- Publicar na ordem: db push, Edge Functions, ecra.
--
--
-- -- O DESENHO -----------------------------------------------------------------
--
-- Todas: plpgsql, SECURITY DEFINER, search_path public e pg_temp; REVOKE de
-- PUBLIC, anon e authenticated; GRANT EXECUTE so a service_role. Devolvem jsonb
-- com {erro: codigo} em vez de levantar excepcao (como _estado e _rascunho), e
-- nenhuma incrementa attempts: um anexo recusado nao e uma abertura falhada.
--
-- Um convite vivo e: used_at NULL, revoked_at NULL, valid_until maior que agora,
-- attempts menor que 10. Para um convite morto devolvem o motivo especifico pela
-- ordem de rpc_hr_convite_admissao_estado: convite_invalido (nao existe),
-- convite_ja_usado, convite_revogado, convite_expirado, convite_bloqueado.
--
-- Limites (constantes no topo de cada funcao, iguais a supabase/functions/
-- convite-admissao/anexos.ts e a src/lib/hr/conviteAnexos.ts): no maximo 4
-- anexos activos (pendente mais ligado) por convite; cartao_cidadao 2,
-- comprovativo_iban 1, fotografia 1; 10485760 bytes por ficheiro; fotografia
-- 5242880 bytes e so png ou jpeg; no maximo 12 reservas por convite durante a
-- vida dele (os apagados contam).
--
-- A ordem das recusas de reservar e a do desenho: convite morto, tipo,
-- formato, vazio, demasiado grande, maximo de ficheiros, tipo cheio, limite do
-- convite. reservar nunca devolve organization_id nem pessoa_id: o browser nao
-- precisa deles e nao os deve ver.
--
-- ligar so aceita o caminho final EXACTO <org>/<pessoa>/admissao/<anexo_id>.<ext>,
-- construido dos valores da propria linha: a Edge Function nao escolhe onde o
-- ficheiro fica, so confirma onde o pos.
--
-- O CAMINHO DA QUARENTENA (coluna pessoas_anexos.caminho_quarentena, 050000):
-- quem a preenche e rpc_hr_convite_anexo_reservar (o mesmo valor de `caminho`,
-- gravado no INSERT). NENHUMA outra funcao a escreve: ligar passa `caminho` e
-- `bucket` para os finais mas deixa caminho_quarentena como esta, e a limpeza
-- (070000) so lhe marca quarentena_removida_em. rpc_hr_convite_anexo_descartar
-- passa a devolver {ok, bucket, caminho, caminho_quarentena}: a Edge remove os dois
-- (deduplicando quando coincidem, que e o caso de um pendente). Argumentos de
-- ligar e de descartar: INALTERADOS. Codigos de erro: nenhum novo.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao: largar as cinco
-- funcoes rpc_hr_convite_anexo* e hr_convite_anexos_motivo.
--
-- Prerequisitos:
--   20261210050000  pessoas_anexos
--   20261124120000  pessoas_convites_admissao
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_anexos') IS NULL THEN
    RAISE EXCEPTION 'pessoas_anexos nao existe. Aplicar 20261210050000 primeiro.';
  END IF;
  IF to_regclass('public.pessoas_convites_admissao') IS NULL THEN
    RAISE EXCEPTION 'pessoas_convites_admissao nao existe.';
  END IF;
  IF to_regprocedure('public.rpc_hr_convite_admissao_estado(text)') IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_estado(text) nao existe; a ordem dos motivos copia-se dela.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 0. O motivo de um convite morto, pela ordem de rpc_hr_convite_admissao_estado
--    Interna: so as funcoes desta migration a chamam (SECURITY DEFINER, como o
--    dono). NULL quer dizer que o convite esta vivo.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_convite_anexos_motivo(
  p_used_at     timestamptz,
  p_revoked_at  timestamptz,
  p_valid_until timestamptz,
  p_attempts    integer
)
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN p_used_at IS NOT NULL    THEN 'convite_ja_usado'
    WHEN p_revoked_at IS NOT NULL THEN 'convite_revogado'
    WHEN p_valid_until <= now()   THEN 'convite_expirado'
    WHEN p_attempts >= 10         THEN 'convite_bloqueado'
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.hr_convite_anexos_motivo(timestamptz, timestamptz, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_convite_anexos_motivo(timestamptz, timestamptz, timestamptz, integer) FROM anon;
REVOKE ALL ON FUNCTION public.hr_convite_anexos_motivo(timestamptz, timestamptz, timestamptz, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_convite_anexos_motivo(timestamptz, timestamptz, timestamptz, integer) TO service_role;

COMMENT ON FUNCTION public.hr_convite_anexos_motivo(timestamptz, timestamptz, timestamptz, integer) IS
'Motivo pelo qual um convite de admissao ja nao aceita anexos, pela ordem de rpc_hr_convite_admissao_estado: convite_ja_usado, convite_revogado, convite_expirado, convite_bloqueado (10 tentativas); NULL se esta vivo. Interna das RPCs de anexos. Desde 20261210060000.';

-- ==============================================================================
-- 1. rpc_hr_convite_anexo_reservar
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_anexo_reservar(
  p_token_hash        text,
  p_tipo              text,
  p_nome_original     text,
  p_tamanho_declarado bigint,
  p_mime_declarado    text,
  p_ip                inet
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_max_activos    constant integer := 4;
  c_max_reservas   constant integer := 12;
  c_max_bytes      constant bigint  := 10485760;
  c_max_bytes_foto constant bigint  := 5242880;
  v_convite     record;
  v_motivo      text;
  v_limite_tipo integer;
  v_activos     integer;
  v_do_tipo     integer;
  v_reservas    integer;
  v_ext         text;
  v_nome        text;
  v_id          uuid := gen_random_uuid();
  v_caminho     text;
BEGIN
  -- O convite fica bloqueado ate ao fim: duas reservas em simultaneo nao
  -- passam as duas pelos limites.
  SELECT c.id, c.organization_id, c.pessoa_id, c.used_at, c.revoked_at, c.valid_until, c.attempts
    INTO v_convite
    FROM public.pessoas_convites_admissao c
   WHERE c.token_hash = p_token_hash
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'convite_invalido');
  END IF;

  v_motivo := public.hr_convite_anexos_motivo(
    v_convite.used_at, v_convite.revoked_at, v_convite.valid_until, v_convite.attempts);
  IF v_motivo IS NOT NULL THEN
    RETURN jsonb_build_object('erro', v_motivo);
  END IF;

  IF p_tipo IS NULL OR p_tipo NOT IN ('cartao_cidadao', 'comprovativo_iban', 'fotografia') THEN
    RETURN jsonb_build_object('erro', 'anexo_tipo_invalido');
  END IF;

  IF p_mime_declarado IS NULL
     OR p_mime_declarado NOT IN ('application/pdf', 'image/png', 'image/jpeg') THEN
    RETURN jsonb_build_object('erro', 'anexo_formato_invalido');
  END IF;

  IF p_tipo = 'fotografia' AND p_mime_declarado NOT IN ('image/png', 'image/jpeg') THEN
    RETURN jsonb_build_object('erro', 'anexo_fotografia_formato');
  END IF;

  IF p_tamanho_declarado IS NULL OR p_tamanho_declarado <= 0 THEN
    RETURN jsonb_build_object('erro', 'anexo_vazio');
  END IF;

  IF p_tipo = 'fotografia' THEN
    IF p_tamanho_declarado > c_max_bytes_foto THEN
      RETURN jsonb_build_object('erro', 'anexo_fotografia_demasiado_grande');
    END IF;
  ELSIF p_tamanho_declarado > c_max_bytes THEN
    RETURN jsonb_build_object('erro', 'anexo_demasiado_grande');
  END IF;

  v_limite_tipo := CASE p_tipo
    WHEN 'cartao_cidadao'     THEN 2
    WHEN 'comprovativo_iban'  THEN 1
    WHEN 'fotografia'         THEN 1
  END;

  SELECT count(*),
         count(*) FILTER (WHERE a.tipo = p_tipo)
    INTO v_activos, v_do_tipo
    FROM public.pessoas_anexos a
   WHERE a.convite_id = v_convite.id
     AND a.estado IN ('pendente', 'ligado');

  IF v_activos >= c_max_activos THEN
    RETURN jsonb_build_object('erro', 'anexo_maximo_ficheiros');
  END IF;
  IF v_do_tipo >= v_limite_tipo THEN
    RETURN jsonb_build_object('erro', 'anexo_tipo_cheio');
  END IF;

  -- Os apagados tambem contam: sem isto, carregar e remover em ciclo nunca
  -- esbarrava em limite nenhum e enchia o Storage.
  SELECT count(*) INTO v_reservas
    FROM public.pessoas_anexos a
   WHERE a.convite_id = v_convite.id;
  IF v_reservas >= c_max_reservas THEN
    RETURN jsonb_build_object('erro', 'anexo_limite_convite');
  END IF;

  v_ext := CASE p_mime_declarado
    WHEN 'application/pdf' THEN 'pdf'
    WHEN 'image/png'       THEN 'png'
    ELSE 'jpg'
  END;

  -- So o nome para mostrar: sem caracteres de controlo e com o tamanho limitado.
  -- O ficheiro nunca se guarda com este nome (o caminho usa o id).
  v_nome := left(btrim(regexp_replace(coalesce(p_nome_original, ''), '[[:cntrl:]]', '', 'g')), 200);
  IF v_nome = '' THEN
    v_nome := 'ficheiro';
  END IF;

  v_caminho := 'admissao/' || v_convite.id::text || '/' || v_id::text || '.' || v_ext;

  -- caminho_quarentena guarda o caminho da quarentena ATE AO FIM (ligar muda so
  -- `caminho`): e o que deixa a limpeza apagar a copia da quarentena depois.
  INSERT INTO public.pessoas_anexos (
    id, organization_id, pessoa_id, convite_id, tipo, estado, bucket,
    caminho, caminho_quarentena, nome_original, upload_ip
  ) VALUES (
    v_id, v_convite.organization_id, v_convite.pessoa_id, v_convite.id, p_tipo, 'pendente',
    'hr-documentos-quarantine', v_caminho, v_caminho, v_nome, p_ip
  );

  RETURN jsonb_build_object('anexo_id', v_id, 'caminho', v_caminho);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_anexo_reservar(text, text, text, bigint, text, inet) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_anexo_reservar(text, text, text, bigint, text, inet) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_anexo_reservar(text, text, text, bigint, text, inet) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_anexo_reservar(text, text, text, bigint, text, inet) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_anexo_reservar(text, text, text, bigint, text, inet) IS
'Reserva um anexo no convite: valida convite vivo, tipo, formato declarado, tamanho e limites (4 activos, cartao 2, comprovativo 1, fotografia 1, 12 reservas na vida do convite) e cria a linha pendente na quarentena, gravando o caminho tambem em caminho_quarentena (que nunca mais se reescreve). Devolve {anexo_id, caminho} ou {erro}. Nunca devolve organizacao nem pessoa. SO service_role (Edge Function convite-admissao, accao anexo_url). Desde 20261210060000.';

-- ==============================================================================
-- 2. rpc_hr_convite_anexo_contexto
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_anexo_contexto(
  p_token_hash text,
  p_anexo_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_convite record;
  v_anexo   record;
  v_motivo  text;
BEGIN
  SELECT c.id, c.used_at, c.revoked_at, c.valid_until, c.attempts
    INTO v_convite
    FROM public.pessoas_convites_admissao c
   WHERE c.token_hash = p_token_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'convite_invalido');
  END IF;

  v_motivo := public.hr_convite_anexos_motivo(
    v_convite.used_at, v_convite.revoked_at, v_convite.valid_until, v_convite.attempts);
  IF v_motivo IS NOT NULL THEN
    RETURN jsonb_build_object('erro', v_motivo);
  END IF;

  -- Um anexo de OUTRO convite e um anexo inexistente: nao se distingue.
  SELECT a.id, a.tipo, a.estado, a.caminho, a.organization_id, a.pessoa_id
    INTO v_anexo
    FROM public.pessoas_anexos a
   WHERE a.id = p_anexo_id
     AND a.convite_id = v_convite.id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;

  IF v_anexo.estado <> 'pendente' THEN
    RETURN jsonb_build_object('erro', 'anexo_estado_invalido');
  END IF;

  -- Uso interno da Edge Function: precisa da organizacao e da pessoa para
  -- construir o caminho final. Nunca se reenvia ao browser.
  RETURN jsonb_build_object(
    'anexo_id', v_anexo.id,
    'tipo', v_anexo.tipo,
    'estado', v_anexo.estado,
    'caminho', v_anexo.caminho,
    'organization_id', v_anexo.organization_id,
    'pessoa_id', v_anexo.pessoa_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_anexo_contexto(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_anexo_contexto(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_anexo_contexto(text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_anexo_contexto(text, uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_anexo_contexto(text, uuid) IS
'Contexto de um anexo pendente do convite, para a Edge Function o confirmar: {anexo_id, tipo, estado, caminho, organization_id, pessoa_id}. Um anexo de outro convite ou inexistente da anexo_nao_encontrado; um que ja nao esta pendente da anexo_estado_invalido. Uso INTERNO da Edge Function: a resposta com organizacao e pessoa nunca chega ao browser. SO service_role. Desde 20261210060000.';

-- ==============================================================================
-- 3. rpc_hr_convite_anexo_ligar
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_anexo_ligar(
  p_token_hash    text,
  p_anexo_id      uuid,
  p_caminho_final text,
  p_mime          text,
  p_tamanho       bigint,
  p_hash          text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_max_activos    constant integer := 4;
  c_max_bytes      constant bigint  := 10485760;
  c_max_bytes_foto constant bigint  := 5242880;
  v_convite     record;
  v_anexo       record;
  v_motivo      text;
  v_limite_tipo integer;
  v_activos     integer;
  v_do_tipo     integer;
  v_ext         text;
  v_esperado    text;
BEGIN
  SELECT c.id, c.used_at, c.revoked_at, c.valid_until, c.attempts
    INTO v_convite
    FROM public.pessoas_convites_admissao c
   WHERE c.token_hash = p_token_hash
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'convite_invalido');
  END IF;

  v_motivo := public.hr_convite_anexos_motivo(
    v_convite.used_at, v_convite.revoked_at, v_convite.valid_until, v_convite.attempts);
  IF v_motivo IS NOT NULL THEN
    RETURN jsonb_build_object('erro', v_motivo);
  END IF;

  SELECT a.id, a.tipo, a.estado, a.nome_original, a.organization_id, a.pessoa_id
    INTO v_anexo
    FROM public.pessoas_anexos a
   WHERE a.id = p_anexo_id
     AND a.convite_id = v_convite.id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;

  IF v_anexo.estado <> 'pendente' THEN
    RETURN jsonb_build_object('erro', 'anexo_estado_invalido');
  END IF;

  -- Daqui para baixo, o tipo e o tamanho sao os REAIS (os bytes que a Edge
  -- Function leu), nao os que o browser declarou ao reservar.
  IF p_mime IS NULL OR p_mime NOT IN ('application/pdf', 'image/png', 'image/jpeg') THEN
    RETURN jsonb_build_object('erro', 'anexo_formato_invalido');
  END IF;

  IF v_anexo.tipo = 'fotografia' AND p_mime NOT IN ('image/png', 'image/jpeg') THEN
    RETURN jsonb_build_object('erro', 'anexo_fotografia_formato');
  END IF;

  IF p_tamanho IS NULL OR p_tamanho <= 0 THEN
    RETURN jsonb_build_object('erro', 'anexo_vazio');
  END IF;

  IF v_anexo.tipo = 'fotografia' THEN
    IF p_tamanho > c_max_bytes_foto THEN
      RETURN jsonb_build_object('erro', 'anexo_fotografia_demasiado_grande');
    END IF;
  ELSIF p_tamanho > c_max_bytes THEN
    RETURN jsonb_build_object('erro', 'anexo_demasiado_grande');
  END IF;

  IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('erro', 'anexo_falha_envio');
  END IF;

  v_limite_tipo := CASE v_anexo.tipo
    WHEN 'cartao_cidadao'     THEN 2
    WHEN 'comprovativo_iban'  THEN 1
    WHEN 'fotografia'         THEN 1
  END;

  -- O anexo que se liga conta como activo (esta pendente): so recusa se ja
  -- passou do limite.
  SELECT count(*),
         count(*) FILTER (WHERE a.tipo = v_anexo.tipo)
    INTO v_activos, v_do_tipo
    FROM public.pessoas_anexos a
   WHERE a.convite_id = v_convite.id
     AND a.estado IN ('pendente', 'ligado');

  IF v_activos > c_max_activos THEN
    RETURN jsonb_build_object('erro', 'anexo_maximo_ficheiros');
  END IF;
  IF v_do_tipo > v_limite_tipo THEN
    RETURN jsonb_build_object('erro', 'anexo_tipo_cheio');
  END IF;

  v_ext := CASE p_mime
    WHEN 'application/pdf' THEN 'pdf'
    WHEN 'image/png'       THEN 'png'
    ELSE 'jpg'
  END;

  -- O caminho final e o unico possivel, construido dos valores da propria linha.
  v_esperado := v_anexo.organization_id::text || '/' || v_anexo.pessoa_id::text
             || '/admissao/' || v_anexo.id::text || '.' || v_ext;

  IF p_caminho_final IS DISTINCT FROM v_esperado THEN
    RETURN jsonb_build_object('erro', 'anexo_falha_envio');
  END IF;

  UPDATE public.pessoas_anexos
     SET estado        = 'ligado',
         bucket        = 'hr-documentos',
         caminho       = p_caminho_final,
         mime_type     = p_mime,
         tamanho_bytes = p_tamanho,
         hash_sha256   = p_hash,
         ligado_em     = now()
   WHERE id = v_anexo.id;

  RETURN jsonb_build_object('ok', true, 'anexo', jsonb_build_object(
      'id', v_anexo.id,
      'tipo', v_anexo.tipo,
      'nome_original', v_anexo.nome_original,
      'tamanho_bytes', p_tamanho,
      'mime_type', p_mime
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_anexo_ligar(text, uuid, text, text, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_anexo_ligar(text, uuid, text, text, bigint, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_anexo_ligar(text, uuid, text, text, bigint, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_anexo_ligar(text, uuid, text, text, bigint, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_anexo_ligar(text, uuid, text, text, bigint, text) IS
'Liga um anexo pendente ao convite depois de a Edge Function verificar os bytes: repete convite vivo, estado pendente, formato, tamanho e limites com o tipo e o tamanho REAIS, exige o caminho final exacto <org>/<pessoa>/admissao/<anexo_id>.<ext> e passa a ligado (bucket hr-documentos, mime, tamanho e hash). Nao toca em caminho_quarentena (continua a apontar para a copia da quarentena, que a Edge remove e a limpeza garante). O anexo fica INVISIVEL na ficha ate a submissao. Devolve {ok, anexo:{id, tipo, nome_original, tamanho_bytes, mime_type}} ou {erro}. SO service_role. Desde 20261210060000.';

-- ==============================================================================
-- 4. rpc_hr_convite_anexo_descartar
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_anexo_descartar(
  p_token_hash text,
  p_anexo_id   uuid,
  p_motivo     text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_convite record;
  v_anexo   record;
  v_motivo  text;
BEGIN
  IF p_motivo IS NULL
     OR p_motivo NOT IN ('removido_pela_pessoa', 'formato_invalido', 'demasiado_grande', 'upload_abandonado') THEN
    RETURN jsonb_build_object('erro', 'pedido_invalido');
  END IF;

  SELECT c.id, c.used_at, c.revoked_at, c.valid_until, c.attempts
    INTO v_convite
    FROM public.pessoas_convites_admissao c
   WHERE c.token_hash = p_token_hash
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'convite_invalido');
  END IF;

  -- So remover a pedido da pessoa exige o convite vivo. Os outros motivos sao
  -- da Edge Function a desfazer o seu proprio trabalho (ficheiro recusado,
  -- ligacao recusada por corrida com a submissao) e precisam de funcionar
  -- mesmo que o convite tenha acabado de morrer.
  IF p_motivo = 'removido_pela_pessoa' THEN
    v_motivo := public.hr_convite_anexos_motivo(
      v_convite.used_at, v_convite.revoked_at, v_convite.valid_until, v_convite.attempts);
    IF v_motivo IS NOT NULL THEN
      RETURN jsonb_build_object('erro', v_motivo);
    END IF;
  END IF;

  SELECT a.id, a.estado, a.bucket, a.caminho, a.caminho_quarentena
    INTO v_anexo
    FROM public.pessoas_anexos a
   WHERE a.id = p_anexo_id
     AND a.convite_id = v_convite.id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'anexo_nao_encontrado');
  END IF;

  -- Um anexo ja promovido faz parte da ficha: a pessoa nunca o apaga por aqui.
  IF v_anexo.estado = 'promovido' THEN
    RETURN jsonb_build_object('erro', 'anexo_estado_invalido');
  END IF;

  IF v_anexo.estado = 'apagado' THEN
    IF p_motivo = 'removido_pela_pessoa' THEN
      RETURN jsonb_build_object('erro', 'anexo_estado_invalido');
    END IF;
    -- Idempotente para a Edge Function: repetir o descarte devolve onde esta o objecto.
    RETURN jsonb_build_object('ok', true, 'bucket', v_anexo.bucket, 'caminho', v_anexo.caminho,
                              'caminho_quarentena', v_anexo.caminho_quarentena);
  END IF;

  UPDATE public.pessoas_anexos
     SET estado         = 'apagado',
         apagado_em     = now(),
         apagado_motivo = p_motivo
   WHERE id = v_anexo.id;

  -- bucket/caminho: o objecto da linha neste momento (a quarentena se estava
  -- pendente, o final em hr-documentos se estava ligado). caminho_quarentena:
  -- a copia da quarentena, que pode ainda existir mesmo depois de ligado (a
  -- Edge apaga-a, e se falhar a limpeza apanha-a). Pendente: os dois coincidem.
  RETURN jsonb_build_object('ok', true, 'bucket', v_anexo.bucket, 'caminho', v_anexo.caminho,
                            'caminho_quarentena', v_anexo.caminho_quarentena);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_anexo_descartar(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_anexo_descartar(text, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_anexo_descartar(text, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_anexo_descartar(text, uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_anexo_descartar(text, uuid, text) IS
'Marca um anexo do convite como apagado e devolve {ok, bucket, caminho, caminho_quarentena} para a Edge Function remover o objecto (bucket/caminho e onde o objecto esta agora; caminho_quarentena e a copia da quarentena, que pode ainda existir depois de ligado e coincide com caminho se estava pendente; a Edge remove os dois e, se falhar, a limpeza apanha-os). Motivos aceites: removido_pela_pessoa (exige convite vivo e anexo pendente ou ligado), formato_invalido, demasiado_grande e upload_abandonado (so exigem que o anexo seja deste convite e ainda nao promovido; upload_abandonado e a Edge Function a desfazer uma ligacao recusada por corrida com a submissao). Nunca apaga um anexo promovido. SO service_role. Desde 20261210060000.';

-- ==============================================================================
-- 5. rpc_hr_convite_anexos_listar
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_anexos_listar(
  p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_convite record;
  v_motivo  text;
BEGIN
  SELECT c.id, c.used_at, c.revoked_at, c.valid_until, c.attempts
    INTO v_convite
    FROM public.pessoas_convites_admissao c
   WHERE c.token_hash = p_token_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'convite_invalido');
  END IF;

  v_motivo := public.hr_convite_anexos_motivo(
    v_convite.used_at, v_convite.revoked_at, v_convite.valid_until, v_convite.attempts);
  IF v_motivo IS NOT NULL THEN
    RETURN jsonb_build_object('erro', v_motivo);
  END IF;

  -- So os ligados: os pendentes ainda nao foram verificados. Nunca o caminho,
  -- o hash nem o IP.
  RETURN jsonb_build_object(
    'anexos', coalesce((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'id', a.id,
                 'tipo', a.tipo,
                 'nome_original', a.nome_original,
                 'tamanho_bytes', a.tamanho_bytes,
                 'mime_type', a.mime_type,
                 'ligado_em', a.ligado_em
               )
               ORDER BY a.tipo, a.ligado_em
             )
        FROM public.pessoas_anexos a
       WHERE a.convite_id = v_convite.id
         AND a.estado = 'ligado'
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_anexos_listar(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_anexos_listar(text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_anexos_listar(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_anexos_listar(text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_anexos_listar(text) IS
'Os anexos LIGADOS do convite ({anexos: [{id, tipo, nome_original, tamanho_bytes, mime_type, ligado_em}]}), por tipo e data, para o ecra os mostrar ao reabrir o convite. Convite morto: {erro} pela ordem de _estado. Nunca devolve caminho, hash nem IP. SO service_role. Desde 20261210060000.';

-- ==============================================================================
-- Conferir (estrutura)
-- ==============================================================================
DO $conferir$
DECLARE
  v_assinatura text;
  v_n          integer;
  v_nome       text;
BEGIN
  FOREACH v_nome IN ARRAY ARRAY[
    'rpc_hr_convite_anexo_reservar', 'rpc_hr_convite_anexo_contexto', 'rpc_hr_convite_anexo_ligar',
    'rpc_hr_convite_anexo_descartar', 'rpc_hr_convite_anexos_listar'
  ] LOOP
    SELECT count(*) INTO v_n
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname = v_nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION '% devia existir UMA vez; ha %.', v_nome, v_n;
    END IF;
  END LOOP;

  FOREACH v_assinatura IN ARRAY ARRAY[
    'public.rpc_hr_convite_anexo_reservar(text, text, text, bigint, text, inet)',
    'public.rpc_hr_convite_anexo_contexto(text, uuid)',
    'public.rpc_hr_convite_anexo_ligar(text, uuid, text, text, bigint, text)',
    'public.rpc_hr_convite_anexo_descartar(text, uuid, text)',
    'public.rpc_hr_convite_anexos_listar(text)'
  ] LOOP
    IF has_function_privilege('anon', v_assinatura, 'EXECUTE')
       OR has_function_privilege('authenticated', v_assinatura, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_assinatura, 'EXECUTE') THEN
      RAISE EXCEPTION '% tem de ser so service_role.', v_assinatura;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
       WHERE p.oid = v_assinatura::regprocedure AND p.prosecdef
         AND p.proconfig @> ARRAY['search_path=public, pg_temp']
    ) THEN
      RAISE EXCEPTION '% perdeu SECURITY DEFINER ou o search_path fixo.', v_assinatura;
    END IF;
  END LOOP;

  RAISE NOTICE 'OK: cinco RPCs de anexos do convite, so service_role, SECURITY DEFINER com search_path fixo.';
END;
$conferir$;

-- ==============================================================================
-- Conferir (ao vivo, so na organizacao nike): percorre o ciclo inteiro com um
-- convite de teste e DESFAZ tudo com a sentinela HR900.
-- ==============================================================================
DO $conferir_vivo$
DECLARE
  v_org_nike  uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  v_pessoa    uuid;
  v_convite   uuid;
  v_outro     uuid;
  -- As RPCs recebem o token_hash tal e qual: tem de respeitar o CHECK
  -- pessoas_convites_admissao_token_hash_formato (64 hex minusculos).
  v_token     constant text := encode(sha256(convert_to('conferir-anexos-20261210060000-token', 'UTF8')), 'hex');
  v_token_b   constant text := encode(sha256(convert_to('conferir-anexos-20261210060000-outro', 'UTF8')), 'hex');
  v_r         jsonb;
  v_a1        uuid;
  v_a2        uuid;
  v_a3        uuid;
  v_foto      uuid;
  v_caminho   text;
  v_org       uuid;
  v_hash      constant text := repeat('a', 64);
  v_tentativas integer;
  v_quarentena text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = v_org_nike) THEN
    RAISE NOTICE 'Org nike nao encontrada neste ambiente -- o conferir ao vivo das RPCs de anexos foi saltado.';
    RETURN;
  END IF;

  BEGIN
    -- Escritas SO na nike.
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_nike, 'TESTE MIGRACAO', '20261210060000 -- apagar')
    RETURNING id INTO v_pessoa;

    INSERT INTO public.pessoas_convites_admissao
      (pessoa_id, organization_id, token_hash, email_destino, valid_until)
    VALUES (v_pessoa, v_org_nike, v_token, 'teste.20261210060000@example.invalid', now() + interval '1 day')
    RETURNING id INTO v_convite;

    -- Convite inexistente e tipo invalido.
    v_r := public.rpc_hr_convite_anexo_reservar('conferir-nao-existe', 'cartao_cidadao', 'a.pdf', 100, 'application/pdf', NULL);
    IF v_r->>'erro' IS DISTINCT FROM 'convite_invalido' THEN
      RAISE EXCEPTION 'reservar com token inexistente devolveu %', v_r USING ERRCODE = 'HR961';
    END IF;
    v_r := public.rpc_hr_convite_anexo_reservar(v_token, 'passaporte', 'a.pdf', 100, 'application/pdf', NULL);
    IF v_r->>'erro' IS DISTINCT FROM 'anexo_tipo_invalido' THEN
      RAISE EXCEPTION 'reservar com tipo invalido devolveu %', v_r USING ERRCODE = 'HR961';
    END IF;

    -- A ordem das recusas de formato, vazio e tamanho.
    v_r := public.rpc_hr_convite_anexo_reservar(v_token, 'cartao_cidadao', 'a.gif', 100, 'image/gif', NULL);
    IF v_r->>'erro' IS DISTINCT FROM 'anexo_formato_invalido' THEN
      RAISE EXCEPTION 'gif devolveu %', v_r USING ERRCODE = 'HR961';
    END IF;
    v_r := public.rpc_hr_convite_anexo_reservar(v_token, 'fotografia', 'a.pdf', 100, 'application/pdf', NULL);
    IF v_r->>'erro' IS DISTINCT FROM 'anexo_fotografia_formato' THEN
      RAISE EXCEPTION 'fotografia pdf devolveu %', v_r USING ERRCODE = 'HR961';
    END IF;
    v_r := public.rpc_hr_convite_anexo_reservar(v_token, 'cartao_cidadao', 'a.pdf', 0, 'application/pdf', NULL);
    IF v_r->>'erro' IS DISTINCT FROM 'anexo_vazio' THEN
      RAISE EXCEPTION 'tamanho 0 devolveu %', v_r USING ERRCODE = 'HR961';
    END IF;
    v_r := public.rpc_hr_convite_anexo_reservar(v_token, 'cartao_cidadao', 'a.pdf', 10485761, 'application/pdf', NULL);
    IF v_r->>'erro' IS DISTINCT FROM 'anexo_demasiado_grande' THEN
      RAISE EXCEPTION '10485761 bytes devolveu %', v_r USING ERRCODE = 'HR961';
    END IF;
    v_r := public.rpc_hr_convite_anexo_reservar(v_token, 'fotografia', 'a.jpg', 5242881, 'image/jpeg', NULL);
    IF v_r->>'erro' IS DISTINCT FROM 'anexo_fotografia_demasiado_grande' THEN
      RAISE EXCEPTION 'fotografia de 5242881 bytes devolveu %', v_r USING ERRCODE = 'HR961';
    END IF;

    -- Reservar com sucesso: nao devolve organizacao nem pessoa.
    v_r := public.rpc_hr_convite_anexo_reservar(v_token, 'cartao_cidadao', E'frente\n.pdf', 10485760, 'application/pdf', NULL);
    IF v_r ? 'erro' OR v_r ? 'organization_id' OR v_r ? 'pessoa_id' OR NOT (v_r ? 'anexo_id') THEN
      RAISE EXCEPTION 'reservar devolveu %', v_r USING ERRCODE = 'HR961';
    END IF;
    v_a1 := (v_r->>'anexo_id')::uuid;
    IF (v_r->>'caminho') <> 'admissao/' || v_convite::text || '/' || v_a1::text || '.pdf' THEN
      RAISE EXCEPTION 'caminho de quarentena inesperado: %', v_r->>'caminho' USING ERRCODE = 'HR961';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pessoas_anexos WHERE id = v_a1 AND nome_original ~ '[[:cntrl:]]') THEN
      RAISE EXCEPTION 'o nome ficou com caracteres de controlo.' USING ERRCODE = 'HR961';
    END IF;
    -- reservar grava o caminho da quarentena tambem na coluna propria.
    IF NOT EXISTS (SELECT 1 FROM public.pessoas_anexos WHERE id = v_a1 AND caminho_quarentena = caminho AND caminho_quarentena = v_r->>'caminho') THEN
      RAISE EXCEPTION 'reservar devia gravar caminho_quarentena igual ao caminho devolvido.' USING ERRCODE = 'HR961';
    END IF;
    v_quarentena := v_r->>'caminho';

    -- Contexto: do proprio convite sim, de outro convite nao.
    v_r := public.rpc_hr_convite_anexo_contexto(v_token, v_a1);
    IF v_r->>'estado' IS DISTINCT FROM 'pendente' OR v_r->>'organization_id' IS DISTINCT FROM v_org_nike::text THEN
      RAISE EXCEPTION 'contexto devolveu %', v_r USING ERRCODE = 'HR961';
    END IF;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_nike, 'TESTE MIGRACAO', '20261210060000 B -- apagar')
    RETURNING id INTO v_outro;
    INSERT INTO public.pessoas_convites_admissao
      (pessoa_id, organization_id, token_hash, email_destino, valid_until)
    VALUES (v_outro, v_org_nike, v_token_b, 'teste.b.20261210060000@example.invalid', now() + interval '1 day');

    v_r := public.rpc_hr_convite_anexo_contexto(v_token_b, v_a1);
    IF v_r->>'erro' IS DISTINCT FROM 'anexo_nao_encontrado' THEN
      RAISE EXCEPTION 'contexto de um anexo de outro convite devolveu %', v_r USING ERRCODE = 'HR961';
    END IF;

    -- Ligar: caminho errado recusado, caminho certo aceite.
    v_r := public.rpc_hr_convite_anexo_ligar(v_token, v_a1, 'qualquer/coisa.pdf', 'application/pdf', 1000, v_hash);
    IF v_r->>'erro' IS DISTINCT FROM 'anexo_falha_envio' THEN
      RAISE EXCEPTION 'ligar com caminho errado devolveu %', v_r USING ERRCODE = 'HR961';
    END IF;
    v_caminho := v_org_nike::text || '/' || v_pessoa::text || '/admissao/' || v_a1::text || '.pdf';
    v_r := public.rpc_hr_convite_anexo_ligar(v_token, v_a1, v_caminho, 'application/pdf', 1000, v_hash);
    IF NOT coalesce((v_r->>'ok')::boolean, false) THEN
      RAISE EXCEPTION 'ligar devolveu %', v_r USING ERRCODE = 'HR961';
    END IF;
    -- Ligar passa `caminho` para o final e deixa o da quarentena intacto.
    IF NOT EXISTS (
      SELECT 1 FROM public.pessoas_anexos
       WHERE id = v_a1 AND caminho = v_caminho AND caminho_quarentena = v_quarentena AND caminho_quarentena <> caminho
    ) THEN
      RAISE EXCEPTION 'ligar devia manter caminho_quarentena e passar caminho para o final.' USING ERRCODE = 'HR961';
    END IF;
    v_r := public.rpc_hr_convite_anexo_ligar(v_token, v_a1, v_caminho, 'application/pdf', 1000, v_hash);
    IF v_r->>'erro' IS DISTINCT FROM 'anexo_estado_invalido' THEN
      RAISE EXCEPTION 'ligar duas vezes devolveu %', v_r USING ERRCODE = 'HR961';
    END IF;

    -- Limites: segundo cartao aceite, terceiro recusado; fotografia e comprovativo; quinto recusado.
    v_r := public.rpc_hr_convite_anexo_reservar(v_token, 'cartao_cidadao', 'verso.png', 2000, 'image/png', NULL);
    v_a2 := (v_r->>'anexo_id')::uuid;
    IF v_a2 IS NULL THEN
      RAISE EXCEPTION 'o segundo cartao devia ser aceite: %', v_r USING ERRCODE = 'HR961';
    END IF;
    v_r := public.rpc_hr_convite_anexo_reservar(v_token, 'cartao_cidadao', 'x.png', 2000, 'image/png', NULL);
    IF v_r->>'erro' IS DISTINCT FROM 'anexo_tipo_cheio' THEN
      RAISE EXCEPTION 'o terceiro cartao devia dar anexo_tipo_cheio: %', v_r USING ERRCODE = 'HR961';
    END IF;
    v_r := public.rpc_hr_convite_anexo_reservar(v_token, 'comprovativo_iban', 'iban.pdf', 2000, 'application/pdf', NULL);
    v_a3 := (v_r->>'anexo_id')::uuid;
    v_r := public.rpc_hr_convite_anexo_reservar(v_token, 'fotografia', 'eu.jpg', 2000, 'image/jpeg', NULL);
    v_foto := (v_r->>'anexo_id')::uuid;
    IF v_a3 IS NULL OR v_foto IS NULL THEN
      RAISE EXCEPTION 'comprovativo e fotografia deviam ser aceites: %', v_r USING ERRCODE = 'HR961';
    END IF;
    v_r := public.rpc_hr_convite_anexo_reservar(v_token, 'fotografia', 'eu2.jpg', 2000, 'image/jpeg', NULL);
    IF v_r->>'erro' IS DISTINCT FROM 'anexo_maximo_ficheiros' THEN
      RAISE EXCEPTION 'o quinto anexo devia dar anexo_maximo_ficheiros: %', v_r USING ERRCODE = 'HR961';
    END IF;

    -- Listar so mostra os ligados.
    v_r := public.rpc_hr_convite_anexos_listar(v_token);
    IF jsonb_array_length(v_r->'anexos') <> 1 THEN
      RAISE EXCEPTION 'listar devia mostrar 1 ligado; mostrou %', v_r USING ERRCODE = 'HR961';
    END IF;

    -- Descartar: remover devolve onde esta o objecto e a segunda vez recusa.
    v_r := public.rpc_hr_convite_anexo_descartar(v_token, v_a1, 'removido_pela_pessoa');
    IF NOT coalesce((v_r->>'ok')::boolean, false) OR v_r->>'bucket' IS DISTINCT FROM 'hr-documentos' OR v_r->>'caminho' IS DISTINCT FROM v_caminho
       OR v_r->>'caminho_quarentena' IS DISTINCT FROM v_quarentena THEN
      RAISE EXCEPTION 'descartar devia devolver o objecto final e o caminho da quarentena; devolveu %', v_r USING ERRCODE = 'HR961';
    END IF;
    v_r := public.rpc_hr_convite_anexo_descartar(v_token, v_a1, 'removido_pela_pessoa');
    IF v_r->>'erro' IS DISTINCT FROM 'anexo_estado_invalido' THEN
      RAISE EXCEPTION 'remover duas vezes devolveu %', v_r USING ERRCODE = 'HR961';
    END IF;
    v_r := public.rpc_hr_convite_anexo_descartar(v_token, v_a2, 'motivo_inventado');
    IF v_r->>'erro' IS DISTINCT FROM 'pedido_invalido' THEN
      RAISE EXCEPTION 'um motivo inventado devolveu %', v_r USING ERRCODE = 'HR961';
    END IF;

    -- Um convite expirado recusa tudo pela ordem de _estado.
    UPDATE public.pessoas_convites_admissao SET valid_until = now() - interval '1 minute' WHERE id = v_convite;
    v_r := public.rpc_hr_convite_anexo_reservar(v_token, 'cartao_cidadao', 'a.pdf', 100, 'application/pdf', NULL);
    IF v_r->>'erro' IS DISTINCT FROM 'convite_expirado' THEN
      RAISE EXCEPTION 'reservar num convite expirado devolveu %', v_r USING ERRCODE = 'HR961';
    END IF;
    v_r := public.rpc_hr_convite_anexos_listar(v_token);
    IF v_r->>'erro' IS DISTINCT FROM 'convite_expirado' THEN
      RAISE EXCEPTION 'listar num convite expirado devolveu %', v_r USING ERRCODE = 'HR961';
    END IF;

    -- Nada disto conta como tentativa.
    SELECT attempts INTO v_tentativas FROM public.pessoas_convites_admissao WHERE id = v_convite;
    IF v_tentativas <> 0 THEN
      RAISE EXCEPTION 'as RPCs de anexos incrementaram attempts (%).', v_tentativas USING ERRCODE = 'HR961';
    END IF;

    SELECT organization_id INTO v_org FROM public.pessoas_anexos WHERE id = v_a2;
    IF v_org IS DISTINCT FROM v_org_nike THEN
      RAISE EXCEPTION 'um anexo de teste ficou fora da nike.' USING ERRCODE = 'HR961';
    END IF;

    RAISE EXCEPTION 'teste_hr_anexos_rpcs_20261210060000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: tudo desfeito pela subtransaccao.
    WHEN OTHERS THEN
      RAISE EXCEPTION 'O conferir ao vivo das RPCs de anexos falhou -- SQLSTATE %: %', SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'CONFERIR AO VIVO (nike): recusas pela ordem do desenho, limites, ligar com caminho exacto, listar so ligados, descartar, convite expirado, attempts intacto. Tudo desfeito.';
END;
$conferir_vivo$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. PRECISA DE CODIGO NOVO: so a Edge Function convite-admissao nova chama
--    estas funcoes. Ordem: db push (as quatro migrations), Edge, ecra.
-- 2. Listar o pendente imediatamente antes do push (supabase migration list
--    --linked). Depende de 20261210050000.
-- 3. Correr os testes ANTES do push, contra o remoto ainda por corrigir, so se
--    houver algum vermelho a demonstrar: aqui as funcoes sao novas, por isso
--    nao ha estado defeituoso a mostrar. Depois do push nao se volta atras.
-- ==============================================================================
