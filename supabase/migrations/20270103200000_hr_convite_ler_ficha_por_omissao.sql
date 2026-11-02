-- Admissão: o e-mail pessoal e o telefone pessoal que já estão na ficha aparecem preenchidos no convite.
--
-- Hoje o convite só mostra o que a pessoa escreveu (o rascunho do convite); o que o RH já tinha na ficha ao criá-la não aparece.
-- rpc_hr_convite_admissao_portal_ler passa a devolver, em 'rascunho', o e-mail pessoal (pessoas.email_pessoal) e o telefone pessoal
-- (pessoas_dados_pessoais.telefone_pessoal) da ficha quando o rascunho ainda não tem um valor para eles, e SÓ enquanto a pessoa
-- preenche (convidada e em_preenchimento; numa devolução vale o que ela submeteu). Nada se copia para o rascunho: o valor da ficha é
-- só o valor por omissão do ecrã; se a pessoa o mudar, o rascunho guarda o que ela escreveu e esse passa a ganhar. O convite continua a
-- poder ir para qualquer e-mail (email_destino é independente da ficha).
--
-- Só muda o que se devolve em 'rascunho'. A função é a lida da base RH a 3/11/2026 (md5 abaixo); o resto fica igual (mesma assinatura,
-- mesmos grants: só service_role). Precisa de código novo? Não: o ecrã do convite já mostra o que vier em 'rascunho'.
SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF md5(replace(pg_get_functiondef('public.rpc_hr_convite_admissao_portal_ler(text,text)'::regprocedure), E'\r', ''))
       <> '77b2503a5ae3cf5b626b1b742faf3963' THEN
    RAISE EXCEPTION 'Guarda: rpc_hr_convite_admissao_portal_ler mudou desde a leitura da base RH. Rever esta migration antes de a aplicar.';
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_portal_ler(p_token_hash text, p_sessao_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_tecto constant integer := 10;
  -- Copia da lista branca de hr_convite_rascunho_valido (20261210420000); o
  -- bloco de conferir compara-a, chave a chave, com o comportamento da funcao.
  c_chaves constant text[] := ARRAY[
    'assinatura_nome', 'carta_conducao_categorias', 'carta_conducao_numero',
    'carta_conducao_validade', 'codigo_postal', 'conjuge_situacao_profissional',
    'conta_banco', 'conta_bic', 'conta_formato', 'conta_swift', 'conta_titular',
    'data_nascimento', 'dependentes', 'dependentes_deficientes', 'distrito',
    'email_pessoal', 'estado_civil', 'genero', 'habilitacao_academica',
    'habilitacao_data_conclusao', 'linha1', 'linha2', 'localidade',
    'morada_codigo_postal', 'morada_distrito', 'morada_linha1', 'morada_linha2',
    'morada_localidade', 'morada_pais', 'nacionalidade', 'naturalidade_concelho',
    'naturalidade_freguesia', 'naturalidade_pais', 'nif', 'numero_documento',
    'pais', 'tamanho_baixo', 'tamanho_baixo_detalhe', 'tamanho_calcado',
    'tamanho_calcado_detalhe', 'tamanho_cima', 'tamanho_cima_detalhe',
    'telefone_pessoal', 'tipo_documento', 'validade_documento'];
  c_tipos constant text[] := ARRAY['cartao_cidadao', 'comprovativo_iban', 'fotografia'];
  v_c          record;
  v_niss4      text;
  v_iban4      text;
  v_campos_dev jsonb;
  v_docs_dev   jsonb;
  v_editaveis  jsonb;
  v_docs       jsonb;
  v_obrig      jsonb;
  v_anexos     jsonb;
  v_rasc       jsonb;
  v_email_f    text;
  v_tel_f      text;
BEGIN
  SELECT c.id, c.organization_id, c.pessoa_id, c.estado, c.valid_until, c.used_at, c.revoked_at,
         c.portal_encerrado_em, c.attempts, c.rascunho, c.devolucao, c.rejeicao_mensagem,
         c.niss_segredo_id, c.iban_segredo_id
    INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.token_hash = p_token_hash
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  IF v_c.portal_encerrado_em IS NOT NULL OR v_c.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_ja_usado' USING ERRCODE = 'HRA02';
  ELSIF v_c.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'convite_revogado' USING ERRCODE = 'HRA03';
  ELSIF v_c.valid_until <= now() THEN
    RAISE EXCEPTION 'convite_expirado' USING ERRCODE = 'HRA04';
  ELSIF v_c.attempts >= c_tecto THEN
    RAISE EXCEPTION 'convite_bloqueado' USING ERRCODE = 'HRA05';
  END IF;

  PERFORM public.hr_convite_sessao_exigir(v_c.id, p_sessao_hash);

  -- As mascaras calculam-se aqui, a partir do Vault; o valor nunca sai.
  IF v_c.niss_segredo_id IS NOT NULL THEN
    SELECT right(s.decrypted_secret, 4) INTO v_niss4 FROM vault.decrypted_secrets s WHERE s.id = v_c.niss_segredo_id;
  END IF;
  IF v_c.iban_segredo_id IS NOT NULL THEN
    SELECT right(s.decrypted_secret, 4) INTO v_iban4 FROM vault.decrypted_secrets s WHERE s.id = v_c.iban_segredo_id;
  END IF;

  v_campos_dev := CASE WHEN jsonb_typeof(v_c.devolucao -> 'campos') = 'object'
                       THEN v_c.devolucao -> 'campos' ELSE '{}'::jsonb END;
  v_docs_dev   := CASE WHEN jsonb_typeof(v_c.devolucao -> 'documentos') = 'array'
                       THEN v_c.devolucao -> 'documentos' ELSE '[]'::jsonb END;

  IF v_c.estado = 'em_preenchimento' THEN
    v_editaveis := to_jsonb(c_chaves || ARRAY['niss', 'iban']);
    v_docs      := to_jsonb(c_tipos);
  ELSIF v_c.estado = 'devolvida' THEN
    SELECT coalesce(jsonb_agg(k.chave ORDER BY k.chave), '[]'::jsonb) INTO v_editaveis
      FROM jsonb_object_keys(v_campos_dev) AS k(chave);
    SELECT coalesce(jsonb_agg(d.tipo ORDER BY d.tipo), '[]'::jsonb) INTO v_docs
      FROM jsonb_array_elements_text(v_docs_dev) AS d(tipo)
     WHERE d.tipo = ANY (c_tipos);
  ELSE
    v_editaveis := '[]'::jsonb;
    v_docs      := '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(o.codigo ORDER BY o.codigo), '[]'::jsonb) INTO v_obrig
    FROM public.hr_admissao_campos_obrigatorios_org(v_c.organization_id) o
   WHERE o.origem = 'pessoa' AND o.posicao = 'convite';

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'tipo', a.tipo, 'nome', a.nome_original,
                                               'estado', a.estado) ORDER BY a.criado_em, a.id), '[]'::jsonb)
    INTO v_anexos
    FROM public.pessoas_anexos a
   WHERE a.convite_id = v_c.id
     AND a.organization_id = v_c.organization_id
     AND a.estado IN ('pendente', 'ligado');

  -- O e-mail e o telefone pessoais que o RH ja pos na ficha: valor por omissao enquanto a pessoa preenche (so quando o
  -- rascunho ainda nao tem um valor para eles). Nada se grava no rascunho.
  v_rasc := coalesce(v_c.rascunho, '{}'::jsonb);
  IF v_c.estado IN ('convidada', 'em_preenchimento') THEN
    SELECT nullif(btrim(p.email_pessoal), '') INTO v_email_f
      FROM public.pessoas p
     WHERE p.id = v_c.pessoa_id AND p.organization_id = v_c.organization_id AND p.deleted_at IS NULL;
    SELECT nullif(btrim(d.telefone_pessoal), '') INTO v_tel_f
      FROM public.pessoas_dados_pessoais d
     WHERE d.pessoa_id = v_c.pessoa_id AND d.organization_id = v_c.organization_id;
    IF v_email_f IS NOT NULL AND nullif(btrim(coalesce(v_rasc ->> 'email_pessoal', '')), '') IS NULL THEN
      v_rasc := v_rasc || jsonb_build_object('email_pessoal', v_email_f);
    END IF;
    IF v_tel_f IS NOT NULL AND nullif(btrim(coalesce(v_rasc ->> 'telefone_pessoal', '')), '') IS NULL THEN
      v_rasc := v_rasc || jsonb_build_object('telefone_pessoal', v_tel_f);
    END IF;
  END IF;

  -- Nunca o motivo interno, o email, o token, a sessao nem o OTP.
  RETURN jsonb_build_object(
    'estado',               v_c.estado,
    'rascunho',             v_rasc,
    'campos_obrigatorios',  v_obrig,
    'campos_editaveis',     v_editaveis,
    'documentos_editaveis', v_docs,
    'niss_ultimos4',        v_niss4,
    'iban_ultimos4',        v_iban4,
    'devolucao',            CASE WHEN v_c.devolucao IS NULL THEN NULL
                                 ELSE jsonb_build_object('campos', v_campos_dev,
                                                         'documentos', v_docs_dev,
                                                         'observacao', v_c.devolucao -> 'observacao') END,
    'anexos',               v_anexos,
    'rejeicao_mensagem',    CASE WHEN v_c.estado = 'rejeitada' THEN v_c.rejeicao_mensagem END);
END;
$function$;

-- Conferir: continua so executavel pelo service_role e a funcao ficou com o valor por omissao da ficha.
DO $conferir$
BEGIN
  IF has_function_privilege('anon', 'public.rpc_hr_convite_admissao_portal_ler(text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.rpc_hr_convite_admissao_portal_ler(text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.rpc_hr_convite_admissao_portal_ler(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: rpc_hr_convite_admissao_portal_ler perdeu os grants esperados (so service_role).';
  END IF;
  IF position('v_email_f' IN pg_get_functiondef('public.rpc_hr_convite_admissao_portal_ler(text,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Conferir: a funcao nao ficou com o valor por omissao da ficha.';
  END IF;
END $conferir$;
