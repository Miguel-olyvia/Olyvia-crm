-- Admissao: (1) deixa de se poder cancelar depois de o contrato estar assinado;
--           (2) o RH passa a poder marcar a admissao como concluida depois de enviar o acesso.
--
-- PRECISA DE CODIGO NOVO (entra junto com o ecra, no mesmo envio):
--   * o ecra da admissao deixa de mostrar «Cancelar admissao» nos estados
--     assinaturas_concluidas, a_aguardar_ativacao e concluida (a base passa a recusar
--     com HRA38 estado_invalido; sem o ecra novo o botao aparece e da erro);
--   * o ecra passa a mostrar o botao de enviar o acesso nos estados
--     assinaturas_concluidas e a_aguardar_ativacao e, depois de o acesso ser enviado
--     com sucesso, chama public.rpc_hr_admissao_concluir(p_convite_id, p_organization_id).
--   Sem o codigo novo nada parte: a funcao nova fica so por chamar, e o cancelar
--   continua a funcionar nos estados em que o contrato ainda nao esta assinado.
--
-- 1. rpc_hr_convite_admissao_cancelar (definicao lida da base RH a 3/11/2026, guarda
--    abaixo): nos estados assinaturas_concluidas e a_aguardar_ativacao passa a devolver
--    HRA38 estado_invalido (concluida ja o devolvia, por nao ser aberto). aprovada e
--    a_aguardar_assinaturas continuam a poder cancelar, com hr.onboarding.approve como
--    antes. hr_convite_estado_aberto NAO muda. O resto da funcao fica igual.
--
-- 2. rpc_hr_admissao_concluir(p_convite_id uuid, p_organization_id uuid) -> jsonb
--    {ok:true, estado:'concluida'}. Permissao hr.onboarding.approve na organizacao
--    pedida, verificada antes de ler/trancar a linha (como rpc_hr_admissao_aprovar).
--    So de assinaturas_concluidas ou a_aguardar_ativacao; sobre uma ja concluida devolve
--    ok sem evento novo. Fecha o portal (portal_encerrado_em) e a janela de documentos
--    (portal_documentos_ate deixa de estar no futuro), limpa a sessao/OTP do portal e
--    regista o evento 'acesso_enviado' (ja aceite pelo CHECK de acao: nao se alarga).
--    Nao toca em used_at (o trigger used_at_transitorio nao dispara), nem em revoked_at
--    (revogado_so_terminal exige NULL fora de rejeitada/cancelada), nem nos campos
--    imutaveis.
--
-- Guardas: o texto das funcoes lidas compara-se por md5 sem os \r com o texto lido no
-- remoto (escrito aqui por extenso: nao foi possivel calcular o md5 fora da base).
SET lock_timeout = '5s';

DO $guardas$
DECLARE
  v_def  text;
  v_nomes text[];
BEGIN
  -- 1. rpc_hr_convite_admissao_cancelar e exactamente a lida a 3/11.
  IF to_regprocedure('public.rpc_hr_convite_admissao_cancelar(uuid,uuid,text)') IS NULL
     OR md5(replace(pg_get_functiondef('public.rpc_hr_convite_admissao_cancelar(uuid,uuid,text)'::regprocedure), E'\r', ''))
        <> md5(replace($esperado$CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_cancelar(p_convite_id uuid, p_organization_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_motivo_max  constant integer := 2000;
  c_limite_hora constant integer := 60;
  v_uid    uuid := auth.uid();
  v_motivo text := btrim(p_motivo);
  v_org    uuid;
  v_c      record;
  v_anew   uuid;
  v_n      integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- Chamavel por PostgREST, salta o limite da Edge: no maximo 60 eventos do
  -- actor na ultima hora (idx_pessoas_convites_admissao_eventos_ator).
  SELECT count(*) INTO v_n
    FROM public.pessoas_convites_admissao_eventos e
   WHERE e.ator_id = v_uid AND e.criado_em > now() - interval '1 hour';
  IF v_n >= c_limite_hora THEN
    RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRA41';
  END IF;

  -- A organizacao vem da LINHA e tem de ser a activeCompany; sem permissao
  -- nela, o processo "nao existe".
  SELECT c.organization_id INTO v_org
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id;
  IF v_org IS NULL
     OR p_organization_id IS NULL
     OR v_org <> p_organization_id
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.convite.enviar', v_org) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  -- Sem guarda de work organization: uma organizacao que deixou de ser
  -- empregadora tem de poder cancelar o que ficou aberto.

  IF v_motivo IS NULL OR v_motivo = '' OR length(v_motivo) > c_motivo_max THEN
    RAISE EXCEPTION 'motivo_invalido' USING ERRCODE = 'HRA37';
  END IF;

  SELECT c.id, c.estado INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id AND c.organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  IF NOT public.hr_convite_estado_aberto(v_c.estado) THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  -- Depois da aprovacao, cancelar e desfazer uma decisao de aprovacao.
  IF v_c.estado IN ('aprovada', 'a_aguardar_assinaturas', 'assinaturas_concluidas', 'a_aguardar_ativacao')
     AND NOT public.has_anew_permission_in_org(v_uid, 'hr.onboarding.approve', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;

  UPDATE public.pessoas_convites_admissao
     SET estado                     = 'cancelada',
         legado                     = false,
         revoked_at                 = now(),
         cancelada_em               = now(),
         cancelada_por              = v_anew,
         cancelada_motivo_interno   = v_motivo,
         sessao_hash                = NULL,
         sessao_iniciada_em         = NULL,
         sessao_ultima_atividade_em = NULL,
         otp_hmac                   = NULL,
         otp_expira_em              = NULL
   WHERE id = v_c.id;

  -- O motivo e interno: fica so na coluna, nunca nos metadados.
  INSERT INTO public.pessoas_convites_admissao_eventos
    (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
  VALUES
    (v_c.id, v_org, 'cancelado', 'rh', v_uid, v_c.estado, 'cancelada', '{}'::jsonb);

  RETURN jsonb_build_object('convite_id', v_c.id, 'estado', 'cancelada', 'estado_portal', 'revogado');
END;
$function$
$esperado$, E'\r', '')) THEN
    RAISE EXCEPTION 'Guarda: rpc_hr_convite_admissao_cancelar mudou desde a leitura da base RH a 3/11. Rever esta migration antes de a aplicar.';
  END IF;

  -- 2. A funcao nova ainda nao existe (nem com outra assinatura).
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
              WHERE ns.nspname::text = 'public' AND p.proname::text = 'rpc_hr_admissao_concluir') THEN
    RAISE EXCEPTION 'Guarda: public.rpc_hr_admissao_concluir ja existe. Rever esta migration antes de a aplicar.';
  END IF;

  -- 3. hr_convite_estado_aberto continua a dar concluida como fechado (o cancelar conta com isso).
  IF public.hr_convite_estado_aberto('concluida')
     OR NOT public.hr_convite_estado_aberto('assinaturas_concluidas')
     OR NOT public.hr_convite_estado_aberto('a_aguardar_ativacao') THEN
    RAISE EXCEPTION 'Guarda: hr_convite_estado_aberto mudou de regra. Rever esta migration antes de a aplicar.';
  END IF;

  -- 4. Os CHECKs do processo sao os lidos a 3/11 (nenhum novo que a passagem a concluida possa violar).
  SELECT array_agg(c.conname::text ORDER BY c.conname::text) INTO v_nomes
    FROM pg_constraint c
   WHERE c.conrelid = 'public.pessoas_convites_admissao'::regclass AND c.contype::text = 'c';
  IF v_nomes IS DISTINCT FROM ARRAY[
       'pessoas_convites_admissao_attempts_nao_negativo',
       'pessoas_convites_admissao_contadores_nao_negativos',
       'pessoas_convites_admissao_devolucao_formato',
       'pessoas_convites_admissao_email_erro_tamanho',
       'pessoas_convites_admissao_email_formato',
       'pessoas_convites_admissao_email_sem_especiais',
       'pessoas_convites_admissao_estado_valido',
       'pessoas_convites_admissao_hashes_formato',
       'pessoas_convites_admissao_rascunho_lista_branca',
       'pessoas_convites_admissao_revogado_so_terminal',
       'pessoas_convites_admissao_submetido_sha256_formato',
       'pessoas_convites_admissao_terminal_com_data',
       'pessoas_convites_admissao_textos_tamanho',
       'pessoas_convites_admissao_token_hash_formato']::text[] THEN
    RAISE EXCEPTION 'Guarda: os CHECKs de pessoas_convites_admissao mudaram desde 3/11. Rever esta migration antes de a aplicar.';
  END IF;

  SELECT pg_get_constraintdef(c.oid)::text INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.pessoas_convites_admissao'::regclass
     AND c.conname::text = 'pessoas_convites_admissao_revogado_so_terminal';
  IF v_def IS DISTINCT FROM 'CHECK (((revoked_at IS NOT NULL) = (estado = ANY (ARRAY[''rejeitada''::text, ''cancelada''::text]))))' THEN
    RAISE EXCEPTION 'Guarda: revogado_so_terminal mudou desde 3/11 (a concluida tem de ficar com revoked_at NULL).';
  END IF;

  SELECT pg_get_constraintdef(c.oid)::text INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.pessoas_convites_admissao'::regclass
     AND c.conname::text = 'pessoas_convites_admissao_terminal_com_data';
  IF v_def IS DISTINCT FROM 'CHECK ((((estado <> ''cancelada''::text) OR (cancelada_em IS NOT NULL)) AND ((estado <> ''rejeitada''::text) OR (rejeitada_em IS NOT NULL))))' THEN
    RAISE EXCEPTION 'Guarda: terminal_com_data mudou desde 3/11 (pode passar a exigir uma data para concluida).';
  END IF;

  SELECT pg_get_constraintdef(c.oid)::text INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.pessoas_convites_admissao'::regclass
     AND c.conname::text = 'pessoas_convites_admissao_estado_valido';
  IF v_def IS NULL OR position('''concluida''::text' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Guarda: o estado concluida deixou de ser aceite em pessoas_convites_admissao.';
  END IF;

  -- 5. Os eventos aceitam acao acesso_enviado, estado concluida, ator rh com ator_id e metadados vazios.
  SELECT pg_get_constraintdef(c.oid)::text INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.pessoas_convites_admissao_eventos'::regclass
     AND c.conname::text = 'pessoas_convites_admissao_eventos_acao_valida';
  IF v_def IS NULL OR position('''acesso_enviado''::text' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Guarda: a acao acesso_enviado deixou de ser aceite nos eventos da admissao.';
  END IF;

  SELECT pg_get_constraintdef(c.oid)::text INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.pessoas_convites_admissao_eventos'::regclass
     AND c.conname::text = 'pessoas_convites_admissao_eventos_estados_validos';
  IF v_def IS NULL OR position('''concluida''::text' IN v_def) = 0
     OR position('''a_aguardar_ativacao''::text' IN v_def) = 0
     OR position('''assinaturas_concluidas''::text' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Guarda: os estados dos eventos da admissao mudaram desde 3/11.';
  END IF;

  SELECT pg_get_constraintdef(c.oid)::text INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.pessoas_convites_admissao_eventos'::regclass
     AND c.conname::text = 'pessoas_convites_admissao_eventos_ator_valido';
  IF v_def IS DISTINCT FROM 'CHECK (((ator_tipo = ANY (ARRAY[''rh''::text, ''pessoa''::text, ''sistema''::text])) AND ((ator_tipo = ''rh''::text) = (ator_id IS NOT NULL))))' THEN
    RAISE EXCEPTION 'Guarda: ator_valido dos eventos da admissao mudou desde 3/11.';
  END IF;

  IF NOT public.hr_convite_evento_metadados_validos('{}'::jsonb) THEN
    RAISE EXCEPTION 'Guarda: hr_convite_evento_metadados_validos recusa metadados vazios.';
  END IF;

  -- 6. Os triggers do processo sao so os dois lidos a 3/11.
  SELECT array_agg(t.tgname::text ORDER BY t.tgname::text) INTO v_nomes
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.pessoas_convites_admissao'::regclass AND NOT t.tgisinternal;
  IF v_nomes IS DISTINCT FROM ARRAY[
       'trg_pessoas_convites_admissao_imutaveis',
       'trg_pessoas_convites_admissao_used_at_transitorio']::text[] THEN
    RAISE EXCEPTION 'Guarda: os triggers de pessoas_convites_admissao mudaram desde 3/11. Rever esta migration antes de a aplicar.';
  END IF;

  -- 6a. O de campos imutaveis e exactamente o lido (nao toca em estado nem nas colunas do portal).
  IF to_regprocedure('public.hr_convite_admissao_imutaveis()') IS NULL
     OR md5(replace(pg_get_functiondef('public.hr_convite_admissao_imutaveis()'::regprocedure), E'\r', ''))
        <> md5(replace($esperado$CREATE OR REPLACE FUNCTION public.hr_convite_admissao_imutaveis()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.pessoa_id          IS DISTINCT FROM OLD.pessoa_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.email_destino   IS DISTINCT FROM OLD.email_destino
     OR NEW.created_at      IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'convite_campo_imutavel' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$
$esperado$, E'\r', '')) THEN
    RAISE EXCEPTION 'Guarda: hr_convite_admissao_imutaveis mudou desde a leitura de 3/11.';
  END IF;

  -- 6b. O de used_at so age quando used_at passa de NULL a preenchido (esta migration nao toca em used_at).
  --     [CONFIRMAR] o corpo deste trigger nao estava na leitura de 3/11: verifica-se pela condicao.
  IF to_regprocedure('public.hr_convite_admissao_used_at_transitorio()') IS NULL THEN
    RAISE EXCEPTION 'Guarda: hr_convite_admissao_used_at_transitorio nao existe.';
  END IF;
  v_def := pg_get_functiondef('public.hr_convite_admissao_used_at_transitorio()'::regprocedure)::text;
  IF position('OLD.used_at IS NULL AND NEW.used_at IS NOT NULL' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Guarda: hr_convite_admissao_used_at_transitorio deixou de agir so na escrita de used_at.';
  END IF;

  -- 7. As colunas que a funcao nova escreve existem.
  IF (SELECT count(*) FROM pg_attribute a
       WHERE a.attrelid = 'public.pessoas_convites_admissao'::regclass
         AND NOT a.attisdropped
         AND a.attname::text IN ('portal_encerrado_em', 'portal_documentos_ate', 'legado',
                                 'sessao_hash', 'sessao_iniciada_em', 'sessao_ultima_atividade_em',
                                 'otp_hmac', 'otp_expira_em')) <> 8 THEN
    RAISE EXCEPTION 'Guarda: falta uma das colunas de pessoas_convites_admissao que esta migration escreve.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. Cancelar: recusado depois de o contrato estar assinado
-- ==============================================================================
-- Igual a lida a 3/11, menos dois pontos marcados com «3/11»: os estados
-- assinaturas_concluidas e a_aguardar_ativacao devolvem HRA38, e a exigencia de
-- hr.onboarding.approve fica so para aprovada e a_aguardar_assinaturas.
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_cancelar(p_convite_id uuid, p_organization_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_motivo_max  constant integer := 2000;
  c_limite_hora constant integer := 60;
  v_uid    uuid := auth.uid();
  v_motivo text := btrim(p_motivo);
  v_org    uuid;
  v_c      record;
  v_anew   uuid;
  v_n      integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- Chamavel por PostgREST, salta o limite da Edge: no maximo 60 eventos do
  -- actor na ultima hora (idx_pessoas_convites_admissao_eventos_ator).
  SELECT count(*) INTO v_n
    FROM public.pessoas_convites_admissao_eventos e
   WHERE e.ator_id = v_uid AND e.criado_em > now() - interval '1 hour';
  IF v_n >= c_limite_hora THEN
    RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRA41';
  END IF;

  -- A organizacao vem da LINHA e tem de ser a activeCompany; sem permissao
  -- nela, o processo "nao existe".
  SELECT c.organization_id INTO v_org
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id;
  IF v_org IS NULL
     OR p_organization_id IS NULL
     OR v_org <> p_organization_id
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.convite.enviar', v_org) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  -- Sem guarda de work organization: uma organizacao que deixou de ser
  -- empregadora tem de poder cancelar o que ficou aberto.

  IF v_motivo IS NULL OR v_motivo = '' OR length(v_motivo) > c_motivo_max THEN
    RAISE EXCEPTION 'motivo_invalido' USING ERRCODE = 'HRA37';
  END IF;

  SELECT c.id, c.estado INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id AND c.organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  IF NOT public.hr_convite_estado_aberto(v_c.estado) THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  -- 3/11: com o contrato assinado a admissao ja nao se cancela (conclui-se
  -- com rpc_hr_admissao_concluir depois de enviar o acesso).
  IF v_c.estado IN ('assinaturas_concluidas', 'a_aguardar_ativacao') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  -- Depois da aprovacao, cancelar e desfazer uma decisao de aprovacao.
  -- 3/11: so restam aqui os estados com o contrato ainda por assinar.
  IF v_c.estado IN ('aprovada', 'a_aguardar_assinaturas')
     AND NOT public.has_anew_permission_in_org(v_uid, 'hr.onboarding.approve', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;

  UPDATE public.pessoas_convites_admissao
     SET estado                     = 'cancelada',
         legado                     = false,
         revoked_at                 = now(),
         cancelada_em               = now(),
         cancelada_por              = v_anew,
         cancelada_motivo_interno   = v_motivo,
         sessao_hash                = NULL,
         sessao_iniciada_em         = NULL,
         sessao_ultima_atividade_em = NULL,
         otp_hmac                   = NULL,
         otp_expira_em              = NULL
   WHERE id = v_c.id;

  -- O motivo e interno: fica so na coluna, nunca nos metadados.
  INSERT INTO public.pessoas_convites_admissao_eventos
    (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
  VALUES
    (v_c.id, v_org, 'cancelado', 'rh', v_uid, v_c.estado, 'cancelada', '{}'::jsonb);

  RETURN jsonb_build_object('convite_id', v_c.id, 'estado', 'cancelada', 'estado_portal', 'revogado');
END;
$function$;

-- ==============================================================================
-- 2. Concluir: assinaturas_concluidas / a_aguardar_ativacao -> concluida
-- ==============================================================================
CREATE FUNCTION public.rpc_hr_admissao_concluir(p_convite_id uuid, p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_limite_hora constant integer := 60;
  v_uid uuid := auth.uid();
  v_c   record;
  v_n   integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_n
    FROM public.pessoas_convites_admissao_eventos e
   WHERE e.ator_id = v_uid AND e.criado_em > now() - interval '1 hour';
  IF v_n >= c_limite_hora THEN
    RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRA41';
  END IF;

  -- A permissao primeiro, na activeCompany, antes de ler ou trancar a linha.
  IF p_organization_id IS NULL
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.onboarding.approve', p_organization_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- A organizacao da linha tem de ser a pedida: outra organizacao = nao existe.
  SELECT c.id, c.organization_id, c.estado INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id AND c.organization_id = p_organization_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  -- Idempotente: uma segunda chamada nao falha nem regista outro evento.
  IF v_c.estado = 'concluida' THEN
    RETURN jsonb_build_object('ok', true, 'estado', 'concluida');
  END IF;

  IF v_c.estado NOT IN ('assinaturas_concluidas', 'a_aguardar_ativacao') THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  -- used_at, revoked_at e os campos imutaveis nao se tocam (ver as guardas).
  UPDATE public.pessoas_convites_admissao
     SET estado                     = 'concluida',
         legado                     = false,
         portal_encerrado_em        = coalesce(portal_encerrado_em, now()),
         portal_documentos_ate      = CASE WHEN portal_documentos_ate IS NULL THEN NULL
                                           ELSE least(portal_documentos_ate, now()) END,
         sessao_hash                = NULL,
         sessao_iniciada_em         = NULL,
         sessao_ultima_atividade_em = NULL,
         otp_hmac                   = NULL,
         otp_expira_em              = NULL
   WHERE id = v_c.id;

  INSERT INTO public.pessoas_convites_admissao_eventos
    (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
  VALUES
    (v_c.id, v_c.organization_id, 'acesso_enviado', 'rh', v_uid, v_c.estado, 'concluida', '{}'::jsonb);

  RETURN jsonb_build_object('ok', true, 'estado', 'concluida');
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_admissao_concluir(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_admissao_concluir(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.rpc_hr_admissao_concluir(uuid, uuid) IS
'Marca a admissao como concluida depois de o RH enviar o acesso a pessoa: assinaturas_concluidas ou a_aguardar_ativacao -> concluida. Fecha o portal (portal_encerrado_em) e a janela de documentos (portal_documentos_ate), limpa a sessao e o OTP do portal e regista o evento acesso_enviado. Sobre uma ja concluida devolve ok sem evento. hr.onboarding.approve na organizacao pedida (42501), HRA31 nao encontrado, HRA38 estado invalido, HRA41 limite. Devolve {ok, estado}. Desde 20270104400000.';

-- ==============================================================================
-- Conferir
-- ==============================================================================
DO $conferir$
DECLARE
  v_def text;
BEGIN
  -- Cancelar: ficou com a recusa nova e manteve os privilegios.
  v_def := pg_get_functiondef('public.rpc_hr_convite_admissao_cancelar(uuid,uuid,text)'::regprocedure)::text;
  IF position('IF v_c.estado IN (''assinaturas_concluidas'', ''a_aguardar_ativacao'') THEN' IN v_def) = 0
     OR position('IF v_c.estado IN (''aprovada'', ''a_aguardar_assinaturas'')' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Conferir: rpc_hr_convite_admissao_cancelar nao ficou a recusar o contrato assinado.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rpc_hr_convite_admissao_cancelar(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_convite_admissao_cancelar(uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: os privilegios de rpc_hr_convite_admissao_cancelar mudaram.';
  END IF;

  -- Concluir: existe, SECURITY DEFINER com search_path fixo, EXECUTE so para authenticated.
  IF to_regprocedure('public.rpc_hr_admissao_concluir(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Conferir: rpc_hr_admissao_concluir nao foi criada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = 'public.rpc_hr_admissao_concluir(uuid,uuid)'::regprocedure::oid
                    AND p.prosecdef
                    AND p.proconfig IS NOT NULL
                    AND EXISTS (SELECT 1 FROM unnest(p.proconfig) AS u(cfg) WHERE u.cfg::text LIKE 'search_path=%')) THEN
    RAISE EXCEPTION 'Conferir: rpc_hr_admissao_concluir nao ficou SECURITY DEFINER com search_path fixo.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rpc_hr_admissao_concluir(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_admissao_concluir(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.rpc_hr_admissao_concluir(uuid,uuid)', 'EXECUTE')
     OR EXISTS (SELECT 1
                  FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS a
                 WHERE p.oid = 'public.rpc_hr_admissao_concluir(uuid,uuid)'::regprocedure::oid
                   AND a.grantee = 0
                   AND a.privilege_type::text = 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: EXECUTE de rpc_hr_admissao_concluir tem de ser so para authenticated.';
  END IF;

  -- hr_convite_estado_aberto ficou como estava.
  IF public.hr_convite_estado_aberto('concluida')
     OR NOT public.hr_convite_estado_aberto('assinaturas_concluidas') THEN
    RAISE EXCEPTION 'Conferir: hr_convite_estado_aberto foi alterada.';
  END IF;
END;
$conferir$;
