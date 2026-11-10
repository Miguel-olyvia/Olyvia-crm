-- ============================================================
-- 20270112720000 — rpc_hr_documento_emitir: deteção de {{retribuicao_*}} com qualquer grafia
-- ============================================================
-- O que faz: a deteção de variáveis de retribuição no modelo era
--     v_usa_retribuicao := v_modelo.corpo_html LIKE '%{{retribuicao_%';
--   mas o substituidor (hr_documento_substituir_variaveis, md5 vivo 32605a2c5c27639156ce41b0308ecd8d) aceita
--   '\{\{\s*([A-Za-z0-9_]+)\s*\}\}' e passa o nome a minúsculas. Um modelo com «{{ retribuicao_valor_base }}» ou
--   «{{Retribuicao_valor_base}}» escapava ao gate hr.pessoas.retribuicao.view (e a variável saía em branco, porque
--   hr_documento_variaveis era chamada com p_incluir_retribuicao = false).
--   Passa a: v_usa_retribuicao := v_modelo.corpo_html ~* '\{\{\s*retribuicao_';
--   (espaços depois de «{{» e maiúsculas/minúsculas, como o substituidor). Nada mais muda: mesma assinatura, mesmo
--   SECURITY DEFINER/search_path, mesmas mensagens; CREATE OR REPLACE mantém os GRANTs (authenticated, service_role).
--
-- Parte do pg_get_functiondef vivo de 10/11/2026 (ramo uetjghdkwbywbftedtth), md5 a306c445dd570a2420433bd0bcc9d93c.
--   O corpo vivo tinha fins de linha CRLF; aqui fica com LF. Tirando isso, a definição nova é a viva com só a linha
--   acima trocada (verificado: md5(nova) = md5(replace(viva sem CR, linha antiga, linha nova))).
-- Reversão: repor a linha LIKE acima (o resto da função é igual).
-- ============================================================
SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF md5(pg_get_functiondef('public.rpc_hr_documento_emitir(uuid,uuid[])'::regprocedure)) <> 'a306c445dd570a2420433bd0bcc9d93c' THEN
    RAISE EXCEPTION 'Guarda: rpc_hr_documento_emitir mudou desde 10/11/2026 (md5). Rever esta migration contra a função viva.';
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public.rpc_hr_documento_emitir(p_modelo_id uuid, p_pessoa_ids uuid[])
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_modelo        public.pessoas_documentos_modelos%ROWTYPE;
  v_auth          uuid := auth.uid();
  v_emitido_por   uuid;
  v_pessoa_id     uuid;
  v_pessoa_org    uuid;
  v_novo_id       uuid;
  v_usa_retribuicao boolean;
  v_variaveis     jsonb;
  v_corpo         text;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_documento_emitir exige um utilizador autenticado.';
  END IF;

  IF p_pessoa_ids IS NULL OR array_length(p_pessoa_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_pessoa_ids nao pode ser vazio.';
  END IF;

  SELECT * INTO v_modelo
    FROM public.pessoas_documentos_modelos
   WHERE id = p_modelo_id AND deleted_at IS NULL;

  IF v_modelo.id IS NULL THEN
    RAISE EXCEPTION 'Modelo % nao encontrado ou apagado.', p_modelo_id;
  END IF;

  IF NOT v_modelo.activo THEN
    RAISE EXCEPTION 'Modelo % esta desactivado.', p_modelo_id;
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.pessoas.documentos.emitir', v_modelo.organization_id) THEN
    RAISE EXCEPTION 'Sem permissao hr.pessoas.documentos.emitir na organizacao do modelo.';
  END IF;

  -- O corpo usa {{retribuicao_*}}? Se sim, o gate de retribuicao aplica-se a
  -- TODAS as pessoas do lote -- decidido uma vez, aqui, nao pessoa a pessoa.
  v_usa_retribuicao := v_modelo.corpo_html ~* '\{\{\s*retribuicao_';

  IF v_usa_retribuicao AND NOT public.has_anew_permission_in_org(v_auth, 'hr.pessoas.retribuicao.view', v_modelo.organization_id) THEN
    RAISE EXCEPTION
      'O modelo "%" usa uma variavel de retribuicao; emiti-lo exige hr.pessoas.retribuicao.view nesta organizacao.',
      v_modelo.nome;
  END IF;

  SELECT au.id INTO v_emitido_por FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  FOREACH v_pessoa_id IN ARRAY p_pessoa_ids
  LOOP
    SELECT p.organization_id INTO v_pessoa_org
      FROM public.pessoas p
     WHERE p.id = v_pessoa_id;

    IF v_pessoa_org IS NULL THEN
      RAISE EXCEPTION 'Pessoa % nao encontrada.', v_pessoa_id;
    END IF;

    IF v_pessoa_org <> v_modelo.organization_id THEN
      RAISE EXCEPTION 'Pessoa % nao pertence a organizacao do modelo (%).', v_pessoa_id, v_modelo.organization_id;
    END IF;

    v_variaveis := public.hr_documento_variaveis(v_pessoa_id, v_modelo.organization_id, v_usa_retribuicao);

    -- Tokens do MODELO e do MOMENTO de emissao, iguais para todo o lote:
    -- documento_data_emissao usa now() -- a data grava-se UMA VEZ, aqui, no
    -- corpo; nunca recalculada depois (o mesmo erro que data_documento em
    -- contractVariables.ts do CRM ja teve de corrigir).
    v_variaveis := v_variaveis || jsonb_build_object(
      'documento_titulo',       v_modelo.nome,
      'documento_tipo',         v_modelo.tipo,
      'documento_data_emissao', to_char(now(), 'DD/MM/YYYY')
    );

    v_corpo := public.hr_documento_substituir_variaveis(v_modelo.corpo_html, v_variaveis);

    INSERT INTO public.pessoas_documentos (
      pessoa_id, organization_id, modelo_id,
      tipo, titulo, corpo_html,
      estado, emitido_em, emitido_por,
      created_by, updated_by
    ) VALUES (
      v_pessoa_id, v_modelo.organization_id, v_modelo.id,
      v_modelo.tipo, v_modelo.nome, v_corpo,
      'a_aguardar_assinatura', now(), v_emitido_por,
      v_emitido_por, v_emitido_por
    )
    RETURNING id INTO v_novo_id;

    RETURN NEXT v_novo_id;
  END LOOP;

  RETURN;
END;
$function$;

DO $verificar$
DECLARE
  v_def text := pg_get_functiondef('public.rpc_hr_documento_emitir(uuid,uuid[])'::regprocedure);
BEGIN
  IF strpos(v_def, $t$v_modelo.corpo_html ~* '\{\{\s*retribuicao_'$t$) = 0
     OR strpos(v_def, $t$LIKE '%{{retribuicao_%'$t$) > 0 THEN
    RAISE EXCEPTION 'Verificação: a deteção de retribuição em rpc_hr_documento_emitir não ficou como esperado.';
  END IF;
END $verificar$;
