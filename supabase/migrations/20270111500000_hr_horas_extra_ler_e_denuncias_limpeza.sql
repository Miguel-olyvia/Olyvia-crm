-- ==============================================================================
-- Duas pecas pequenas, ADITIVAS:
--   (1) rpc_hr_horas_extra_contagem_ler: a leitura do interruptor "so as horas
--       extra aprovadas contam" para o ecra de configuracao (E6), que hoje nao
--       tem como o ler sem escolher uma pessoa (decisao c de 20270111400000).
--   (2) Agendar a limpeza do canal de denuncias (rpc_denuncias_limpar), que
--       20270111300000 deixou de proposito sem job (POR FAZER dessa migration).
--
-- PROVISORIO. NAO FAZER db push sem: (1) listar o remoto imediatamente antes,
-- a partir do worktree rh-pessoas (project-ref uetjghdkwbywbftedtth), e
-- confirmar que so este ficheiro fica pendente, acima de 20270111410000;
-- (2) correr a prova na nike em transaccao desfeita ANTES do push (o conferir
-- abaixo e essa prova; o job agendado desfaz-se com ela); (3) revisao
-- ecc:database-reviewer e ecc:security-reviewer.
--
--
-- -- PRECISA DE CODIGO NOVO NO MESMO ENVIO --------------------------------------
--
-- NAO para nada partir: a RPC e nova e o job so chama uma funcao que ja existe.
-- Para USAR: o ecra de configuracao das horas extra (E6) passa a chamar
-- rpc_hr_horas_extra_contagem_ler para mostrar o interruptor e, com
-- folhas_fechadas_desde preenchido, dizer "nao pode desligar nem adiar: ha
-- folhas fechadas desde X".
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- 1. rpc_hr_horas_extra_contagem_ler(p_organization_id uuid) RETURNS jsonb
--      {aprovacao_desde date|null, folhas_fechadas_desde date|null,
--       ultima_folha_fechada_ate date|null, tem_config boolean}
--    hr.assiduidade.view na organizacao (o ecra e de gestao); sem sessao, sem
--    organizacao ou sem a permissao: insufficient_privilege 42501 por
--    hr_horas_extra_recusar, o mesmo erro generico de
--    rpc_hr_horas_extra_config_ler. view.own NAO chega.
--    aprovacao_desde = hr_horas_extra_config.aprovacao_conta_desde (null sem
--    linha ou desligado). tem_config = existe a linha da organizacao.
--    folhas_fechadas_desde = data_inicio da folha FECHADA mais antiga que o
--    interruptor tem de cobrir: com aprovacao_desde preenchido, min(data_inicio)
--    das folhas com estado 'fechado' e data_fim >= aprovacao_desde. E a MESMA
--    condicao com que rpc_hr_horas_extra_contagem_guardar recusa (HRA87)
--    desligar ou adiar (revisao M1 de 20270111400000; a guarda G5 confere o
--    corpo vivo dessa RPC): preenchido = desligar e adiar recusados; null com
--    o interruptor ligado = desligar aceite. Desligado: sempre null.
--    ultima_folha_fechada_ate = data_fim da folha FECHADA mais recente da
--    organizacao (max(data_fim) das folhas com estado 'fechado'), com o
--    interruptor ligado ou desligado; null sem folhas fechadas. E o v_fechado
--    com que guardar recusa ligar ou antecipar (HRA87): o ecra diz "escolha
--    uma data posterior a X" e avisa mesmo com o interruptor desligado.
--    So leitura, sem locks: e o retrato do momento; a recusa a serio continua
--    a ser a de guardar.
--
-- 2. Job pg_cron 'hr-denuncias-limpar', '50 3 * * *' (UTC, o fuso do pg_cron
--    no Supabase), comando SELECT public.rpc_denuncias_limpar(). O MESMO padrao
--    de 'hr-convites-admissao-limpar' (20261210030000): so com a extensao
--    pg_cron; unschedule antes se ja existir (idempotente); um erro ao agendar
--    da NOTICE e o conferir FALHA a migration se pg_cron existe e o job nao
--    ficou. Sem pg_cron: WARNING de pendencia, a migration passa.
--    O job corre como o papel que aplica (o dono de rpc_denuncias_limpar, que
--    tem EXECUTE por ser dono; a funcao continua sem EXECUTE para ninguem alem
--    de service_role). Nada muda nos GRANT da funcao.
--    A mesma hora que o job hr-convite-anexos-limpar (03:50): sao
--    independentes (tabelas diferentes).
--
--
-- -- O QUE MUDA PARA AS OUTRAS ORGANIZACOES DA BASE RH --------------------------
--
-- (1) nada. (2) a limpeza e GLOBAL (nao e por organizacao), como sempre foi a
-- funcao: todas as noites apaga as contagens de limite com mais de 24 h, as
-- reservas de codigo com mais de 1 h e limpa as sessoes expiradas ou com mais
-- de 4 h. Nenhuma denuncia, mensagem, identidade ou evento e apagado; as
-- sessoes limpas ja eram invalidas. Mudelar nao esta nesta base.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao, de proposito. A mao, por migration nova:
-- cron.unschedule('hr-denuncias-limpar') e
-- DROP FUNCTION public.rpc_hr_horas_extra_contagem_ler(uuid).
-- ==============================================================================

SET LOCAL lock_timeout = '5s';

-- ---- G00: dentro de uma transaccao -------------------------------------------
DO $transaccao$
BEGIN
  IF current_setting('lock_timeout') IS DISTINCT FROM '5s' THEN
    RAISE EXCEPTION
      'horas_extra_ler_fora_de_transaccao: SET LOCAL nao teve efeito (lock_timeout = %); esta migration tem de correr numa so transaccao.',
      current_setting('lock_timeout')
      USING ERRCODE = '25000';
  END IF;
END;
$transaccao$;

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_lista text;
  v_n     integer;
  v_cod   text;
  v_src   text;
  -- Corpo de rpc_hr_horas_extra_contagem_guardar(uuid, date) em
  -- 20270111400000 (aplicada; 20270111410000 nao o altera). A regra de
  -- folhas_fechadas_desde copia a recusa M1 deste corpo: se o corpo vivo
  -- mudar, a leitura tem de ser revista. md5 com espacos normalizados dos dois
  -- lados (independente de CRLF e de indentacao).
  k_guardar_src constant text := $src$
DECLARE
  v_anew    uuid;
  v_limite  date;
  v_existe  boolean;
  v_antes   date;
  v_fechado date;
  v_descob  date;
  v_o       jsonb := public.hr_horas_extra_config_omissao();
BEGIN
  -- Sessao, hr.assiduidade.gerir, utilizador da aplicacao, organizacao
  -- empregadora e limite por actor, ANTES de ler qualquer dado.
  v_anew := public.hr_horas_extra_exigir_escrita(p_organization_id, false);

  v_limite := (public.hr_horas_extra_hoje() + interval '5 years')::date;
  IF p_desde IS NOT NULL
     AND (NOT isfinite(p_desde) OR p_desde < DATE '2000-01-01' OR p_desde > v_limite) THEN
    RAISE EXCEPTION 'config_invalida' USING ERRCODE = 'HRA81',
      DETAIL = 'aprovacao_conta_desde tem de estar entre 2000-01-01 e ' || to_char(v_limite, 'YYYY-MM-DD') || '.';
  END IF;

  -- Lock da organizacao (a mesma chave da margem dos desvios, das regras
  -- salariais e de abrir a folha), antes de ler a linha e as folhas.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hr_periodos_processamento:' || p_organization_id::text, 0));

  SELECT true, c.aprovacao_conta_desde INTO v_existe, v_antes
    FROM public.hr_horas_extra_config c
   WHERE c.organization_id = p_organization_id
     FOR UPDATE;
  v_existe := coalesce(v_existe, false);

  -- Nada muda: idempotente, sem evento (desligar sem linha nao cria a linha).
  IF v_antes IS NOT DISTINCT FROM p_desde THEN
    RETURN jsonb_build_object('aprovacao_desde', p_desde, 'alterada', false);
  END IF;

  -- FOR SHARE das folhas que acabam a partir da mais antiga das duas datas
  -- (a antiga e a nova): um fecho em curso (FOR UPDATE da linha) termina
  -- antes, e as leituras seguintes ja o veem.
  PERFORM 1 FROM public.hr_periodos_processamento pp
   WHERE pp.organization_id = p_organization_id AND pp.data_fim >= LEAST(p_desde, v_antes)
     FOR SHARE;
  SELECT max(pp.data_fim) INTO v_fechado
    FROM public.hr_periodos_processamento pp
   WHERE pp.organization_id = p_organization_id AND pp.estado = 'fechado';

  -- Ligar ou antecipar sobre uma folha fechada.
  IF p_desde IS NOT NULL AND v_fechado IS NOT NULL AND v_fechado >= p_desde THEN
    RAISE EXCEPTION 'folha_fechada' USING ERRCODE = 'HRA87',
      DETAIL = 'Ha uma folha fechada ate ' || to_char(v_fechado, 'YYYY-MM-DD')
               || '; a contagem das horas extra aprovadas so pode comecar a partir de '
               || to_char(v_fechado + 1, 'YYYY-MM-DD') || '.';
  END IF;

  -- Desligar ou adiar deixando de cobrir uma folha fechada que a data antiga
  -- cobria (revisao M1): os dias dessa folha voltariam a modo bruto.
  IF v_antes IS NOT NULL THEN
    SELECT max(pp.data_fim) INTO v_descob
      FROM public.hr_periodos_processamento pp
     WHERE pp.organization_id = p_organization_id AND pp.estado = 'fechado'
       AND pp.data_fim >= v_antes
       AND (p_desde IS NULL OR pp.data_fim < p_desde);
    IF v_descob IS NOT NULL THEN
      RAISE EXCEPTION 'folha_fechada' USING ERRCODE = 'HRA87',
        DETAIL = 'A contagem das horas extra aprovadas vale desde ' || to_char(v_antes, 'YYYY-MM-DD')
                 || ' e ja fechou uma folha ate ' || to_char(v_descob, 'YYYY-MM-DD')
                 || '; depois disso nao se desliga nem se adia.';
    END IF;
  END IF;

  -- Uma linha por organizacao: sem linha, nasce com as omissoes.
  INSERT INTO public.hr_horas_extra_config AS c
    (organization_id, dia_min, ano_min, alerta_pct, minimo_min, aprovacao_conta_desde, updated_by)
  VALUES
    (p_organization_id, (v_o ->> 'dia_min')::integer, (v_o ->> 'ano_min')::integer,
     (v_o ->> 'alerta_pct')::integer, (v_o ->> 'minimo_min')::integer, p_desde, v_anew)
  ON CONFLICT (organization_id) DO UPDATE
    SET aprovacao_conta_desde = EXCLUDED.aprovacao_conta_desde,
        updated_by            = EXCLUDED.updated_by;

  PERFORM public.hr_horas_extra_evento(p_organization_id, NULL, NULL, 'config_alterada', v_anew,
    jsonb_build_object('campo', 'aprovacao_conta_desde', 'antes', v_antes, 'depois', p_desde,
                       'linha_criada', NOT v_existe));

  RETURN jsonb_build_object('aprovacao_desde', p_desde, 'alterada', true);
END;
$src$;
  -- Corpo de rpc_denuncias_limpar() em 20270111300000 (aplicada): o que o job
  -- vai correr todas as noites. Se mudar, reler antes de agendar.
  k_limpar_src constant text := $src$
DECLARE
  v_a integer;
  v_b integer;
  v_c integer;
BEGIN
  DELETE FROM public.denuncias_limites l WHERE l.janela < now() - interval '24 hours';
  GET DIAGNOSTICS v_a = ROW_COUNT;
  DELETE FROM public.denuncias_reservas r WHERE r.hora < date_trunc('hour', now()) - interval '1 hour';
  GET DIAGNOSTICS v_b = ROW_COUNT;
  UPDATE public.denuncias_acesso a SET sessao_hash = NULL, sessao_inicio_em = NULL, sessao_expira_em = NULL
   WHERE a.sessao_hash IS NOT NULL
     AND (a.sessao_expira_em <= now() OR a.sessao_inicio_em <= now() - interval '4 hours');
  GET DIAGNOSTICS v_c = ROW_COUNT;
  RETURN v_a + v_b + v_c;
END;
$src$;
BEGIN
  -- G0. Quem aplica passa a RLS (hr_horas_extra_config e as tabelas das
  --     denuncias sao FORCE; a RPC definer e o job correm com este papel).
  IF NOT EXISTS (SELECT 1 FROM pg_roles r
                  WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G0: o papel que aplica (%) nao tem BYPASSRLS; a RPC e o job nao leriam as tabelas.', current_user::text;
  END IF;

  -- G1. Nome novo livre (qualquer assinatura).
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public' AND p.proname::text = 'rpc_hr_horas_extra_contagem_ler';
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G1: ja existe %. Ler o que la esta.', v_lista;
  END IF;

  -- G2. Funcoes de suporte.
  SELECT string_agg(f, ', ') INTO v_lista
    FROM unnest(ARRAY['auth.uid()',
                      'public.has_anew_permission_in_org(uuid, text, uuid)',
                      'public.hr_horas_extra_recusar(uuid, text, text)',
                      'public.hr_horas_extra_hoje()',
                      'public.rpc_hr_horas_extra_contagem_guardar(uuid, date)',
                      'public.rpc_denuncias_limpar()']) AS f
   WHERE to_regprocedure(f) IS NULL;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G2: faltam funcoes: %.', v_lista;
  END IF;

  -- G3. Colunas usadas pela RPC e pela prova.
  SELECT count(*) INTO v_n
    FROM (VALUES ('hr_horas_extra_config', 'organization_id'), ('hr_horas_extra_config', 'aprovacao_conta_desde'),
                 ('hr_periodos_processamento', 'id'), ('hr_periodos_processamento', 'organization_id'),
                 ('hr_periodos_processamento', 'estado'), ('hr_periodos_processamento', 'data_inicio'),
                 ('hr_periodos_processamento', 'data_fim'), ('hr_periodos_processamento', 'ano'),
                 ('hr_periodos_processamento', 'mes'), ('hr_periodos_processamento', 'transicao'),
                 ('hr_periodos_processamento', 'fechado_em'))
         AS e(tabela, coluna)
   WHERE EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = to_regclass('public.' || e.tabela)
                    AND a.attname::text = e.coluna AND NOT a.attisdropped);
  IF v_n <> 11 THEN
    RAISE EXCEPTION 'G3: faltam colunas esperadas em hr_horas_extra_config ou hr_periodos_processamento (% de 11).', v_n;
  END IF;

  -- G4. Permissoes usadas (nenhuma e criada).
  FOREACH v_cod IN ARRAY ARRAY['hr.assiduidade.view', 'hr.assiduidade.view.own', 'hr.assiduidade.gerir'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code = v_cod) THEN
      RAISE EXCEPTION 'G4: o codigo % nao esta no catalogo.', v_cod;
    END IF;
  END LOOP;

  -- G5. A regra de recusa (M1) que a leitura replica e a do corpo vivo.
  SELECT p.prosrc INTO v_src FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.rpc_hr_horas_extra_contagem_guardar(uuid, date)')::oid
     AND p.prosecdef;
  IF v_src IS NULL
     OR md5(btrim(regexp_replace(v_src, '\s+', ' ', 'g'))) IS DISTINCT FROM md5(btrim(regexp_replace(k_guardar_src, '\s+', ' ', 'g'))) THEN
    RAISE EXCEPTION 'G5: rpc_hr_horas_extra_contagem_guardar no remoto (md5 normalizado %) nao e o corpo de 20270111400000 (md5 %), ou deixou de ser SECURITY DEFINER. A regra de folhas_fechadas_desde copia a dele: reler antes de aplicar.',
      md5(btrim(regexp_replace(coalesce(v_src, ''), '\s+', ' ', 'g'))), md5(btrim(regexp_replace(k_guardar_src, '\s+', ' ', 'g')));
  END IF;

  -- G6. O que o job vai correr: o corpo de 20270111300000, SECURITY DEFINER,
  --     devolve integer, e EXECUTE so para service_role (alem do dono).
  v_src := NULL;
  SELECT p.prosrc INTO v_src FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.rpc_denuncias_limpar()')::oid
     AND p.prosecdef AND p.prorettype = 'pg_catalog.int4'::regtype::oid;
  IF v_src IS NULL
     OR md5(btrim(regexp_replace(v_src, '\s+', ' ', 'g'))) IS DISTINCT FROM md5(btrim(regexp_replace(k_limpar_src, '\s+', ' ', 'g'))) THEN
    RAISE EXCEPTION 'G6: rpc_denuncias_limpar no remoto (md5 normalizado %) nao e o corpo de 20270111300000 (md5 %), ou deixou de ser SECURITY DEFINER a devolver integer. Reler antes de agendar.',
      md5(btrim(regexp_replace(coalesce(v_src, ''), '\s+', ' ', 'g'))), md5(btrim(regexp_replace(k_limpar_src, '\s+', ' ', 'g')));
  END IF;
  SELECT coalesce(string_agg(DISTINCT a.grantee::regrole::text, ',' ORDER BY a.grantee::regrole::text), '')
    INTO v_lista
    FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   WHERE p.oid = to_regprocedure('public.rpc_denuncias_limpar()')::oid
     AND a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner AND a.grantee <> 0;
  IF v_lista <> 'service_role'
     OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                 WHERE p.oid = to_regprocedure('public.rpc_denuncias_limpar()')::oid
                   AND a.privilege_type = 'EXECUTE' AND a.grantee = 0) THEN
    RAISE EXCEPTION 'G6: rpc_denuncias_limpar devia ter EXECUTE so para service_role (alem do dono); tem "%" (ou PUBLIC).', v_lista;
  END IF;

  -- G7. Com pg_cron: nenhum outro job (com outro nome) ja corre a limpeza.
  IF EXISTS (SELECT 1 FROM pg_extension e WHERE e.extname::text = 'pg_cron') THEN
    SELECT string_agg(j.jobname::text || ' (' || j.username::text || ')', ', ') INTO v_lista
      FROM cron.job j
     WHERE j.command ILIKE '%rpc_denuncias_limpar%'
       AND j.jobname IS DISTINCT FROM 'hr-denuncias-limpar';
    IF v_lista IS NOT NULL THEN
      RAISE EXCEPTION 'G7: ja ha job(s) pg_cron a correr rpc_denuncias_limpar: %. Nao agendar outro.', v_lista;
    END IF;
  END IF;
END;
$guardas$;


-- ==============================================================================
-- 1. A leitura do interruptor
-- ==============================================================================
CREATE FUNCTION public.rpc_hr_horas_extra_contagem_ler(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_existe boolean;
  v_desde  date;
  v_folhas date;
  v_ultima date;
BEGIN
  -- Sessao e hr.assiduidade.view (gestao), ANTES de ler qualquer dado; o
  -- mesmo erro generico de rpc_hr_horas_extra_config_ler.
  IF v_uid IS NULL OR p_organization_id IS NULL
     OR NOT coalesce(public.has_anew_permission_in_org(v_uid, 'hr.assiduidade.view', p_organization_id), false) THEN
    PERFORM public.hr_horas_extra_recusar(p_organization_id, 'insufficient_privilege', '42501');
  END IF;

  SELECT true, c.aprovacao_conta_desde INTO v_existe, v_desde
    FROM public.hr_horas_extra_config c
   WHERE c.organization_id = p_organization_id;
  v_existe := coalesce(v_existe, false);

  -- As folhas fechadas que o interruptor em vigor cobre: a mesma condicao com
  -- que rpc_hr_horas_extra_contagem_guardar recusa desligar ou adiar (HRA87,
  -- revisao M1). Desligado: nenhuma.
  IF v_desde IS NOT NULL THEN
    SELECT min(pp.data_inicio) INTO v_folhas
      FROM public.hr_periodos_processamento pp
     WHERE pp.organization_id = p_organization_id
       AND pp.estado = 'fechado'
       AND pp.data_fim >= v_desde;
  END IF;

  -- O fim da folha fechada mais recente (ligado ou desligado): a mesma
  -- leitura (v_fechado) com que guardar recusa ligar ou antecipar (HRA87).
  SELECT max(pp.data_fim) INTO v_ultima
    FROM public.hr_periodos_processamento pp
   WHERE pp.organization_id = p_organization_id
     AND pp.estado = 'fechado';

  RETURN jsonb_build_object('aprovacao_desde', v_desde,
                            'folhas_fechadas_desde', v_folhas,
                            'ultima_folha_fechada_ate', v_ultima,
                            'tem_config', v_existe);
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_horas_extra_contagem_ler(uuid) IS
'RH (authenticated, hr.assiduidade.view). O interruptor da contagem das horas extra aprovadas para o ecra de configuracao: {aprovacao_desde (hr_horas_extra_config.aprovacao_conta_desde, ou null), folhas_fechadas_desde (data_inicio da folha fechada mais antiga com data_fim >= aprovacao_desde, ou null; preenchido = rpc_hr_horas_extra_contagem_guardar recusa desligar e adiar com folha_fechada HRA87), ultima_folha_fechada_ate (data_fim da folha fechada mais recente, com o interruptor ligado ou desligado, ou null sem folhas fechadas; ligar ou antecipar so a partir do dia seguinte, senao HRA87), tem_config (existe a linha da organizacao)}. So leitura, sem locks. Sem sessao, sem organizacao ou sem a permissao: insufficient_privilege 42501. Desde 20270111500000.';

REVOKE ALL ON FUNCTION public.rpc_hr_horas_extra_contagem_ler(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_horas_extra_contagem_ler(uuid) TO authenticated;


-- ==============================================================================
-- 2. Agendar a limpeza das denuncias (padrao de hr-convites-admissao-limpar)
-- ==============================================================================
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('hr-denuncias-limpar')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hr-denuncias-limpar');

    PERFORM cron.schedule(
      'hr-denuncias-limpar',
      '50 3 * * *',
      $job$SELECT public.rpc_denuncias_limpar()$job$
    );

    COMMENT ON FUNCTION public.rpc_denuncias_limpar() IS
    'SO service_role (e o dono). Apaga as contagens de limite com mais de 24 h e as reservas de codigo com mais de 1 h, e limpa as sessoes expiradas ou com mais de 4 h. Devolve quantas linhas mexeu. Corre todos os dias as 03:50 (UTC) por pg_cron (job hr-denuncias-limpar, desde 20270111500000). Desde 20270111300000.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Nao se engole em silencio: o NOTICE explica, e o CONFERIR FALHA a migration
  -- se o pg_cron existe e o job nao ficou agendado.
  RAISE NOTICE 'pg_cron: nao foi possivel agendar hr-denuncias-limpar (%).', SQLERRM;
END;
$cron$;


-- ==============================================================================
-- 3. Conferir: falha a migration inteira se algo nao bater
-- ==============================================================================
DO $conferir$
DECLARE
  k_nike   constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  k_rpc    constant text := 'public.rpc_hr_horas_extra_contagem_ler(uuid)';
  k_job    constant text := 'hr-denuncias-limpar';
  k_quando constant text := '50 3 * * *';
  k_cmd    constant text := 'SELECT public.rpc_denuncias_limpar()';
  k_estado constant text[] := ARRAY['sem sessao', 'sem permissao'];
  v_grant      text;
  v_n          integer;
  v_st         text;
  v_msg        text;
  v_j          jsonb;
  v_cron       boolean := false;
  v_job_user   text;
  v_job_cmd    text;
  v_job_quando text;
  v_job_ativo  boolean;
  v_job_base   text;
  v_limpou     integer;
  v_uid        uuid;
  v_falso      uuid;
  v_own        uuid;
  v_hoje       date;
  v_ult        date;
  v_ini        date;
  v_fim        date;
  v_d          date;
  v_per1       uuid;
  v_per2       uuid;
  v_ant_tem    boolean;
  v_ant_desde  date;
  v_esp_folhas date;
  v_esp_ultima date;
  v_prova_own  text;
  v_prova_nula text;
  v_prova_cron text;
BEGIN
  -- 3.1 A RPC: EXECUTE so para authenticated (aclexplode, sem o dono),
  --     SECURITY DEFINER, STABLE, search_path vazio.
  IF to_regprocedure(k_rpc) IS NULL THEN
    RAISE EXCEPTION 'Conferir: a funcao % nao existe.', k_rpc;
  END IF;
  SELECT coalesce(string_agg(DISTINCT a.grantee::regrole::text, ',' ORDER BY a.grantee::regrole::text), '')
    INTO v_grant
    FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   WHERE p.oid = to_regprocedure(k_rpc)::oid AND a.privilege_type = 'EXECUTE'
     AND a.grantee <> p.proowner AND a.grantee <> 0;
  IF v_grant <> 'authenticated'
     OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                 WHERE p.oid = to_regprocedure(k_rpc)::oid AND a.privilege_type = 'EXECUTE' AND a.grantee = 0) THEN
    RAISE EXCEPTION 'Conferir: % devia ter EXECUTE so para authenticated; tem "%" (ou PUBLIC).', k_rpc, v_grant;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                  WHERE p.oid = to_regprocedure(k_rpc)::oid
                    AND p.prosecdef
                    AND p.provolatile::text = 's'
                    AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'Conferir: % devia ser STABLE SECURITY DEFINER com search_path vazio.', k_rpc;
  END IF;

  -- 3.2 O job: com pg_cron TEM de existir, uma vez, com a hora, o comando, a
  --     base e um papel que pode correr a funcao; sem pg_cron fica pendencia.
  v_cron := EXISTS (SELECT 1 FROM pg_extension e WHERE e.extname::text = 'pg_cron');
  IF v_cron THEN
    SELECT count(*) INTO v_n FROM cron.job j WHERE j.jobname = k_job;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Conferir: pg_cron existe mas ha % job(s) %; devia haver exactamente um (as sessoes, limites e reservas expirados nunca seriam limpos).', v_n, k_job;
    END IF;
    SELECT j.username::text, j.command::text, j.schedule::text, j.active, j.database::text
      INTO v_job_user, v_job_cmd, v_job_quando, v_job_ativo, v_job_base
      FROM cron.job j
     WHERE j.jobname = k_job;
    IF v_job_quando IS DISTINCT FROM k_quando
       OR btrim(v_job_cmd) IS DISTINCT FROM k_cmd
       OR v_job_ativo IS NOT TRUE
       OR v_job_base IS DISTINCT FROM current_database()::text THEN
      RAISE EXCEPTION 'Conferir: o job % ficou com schedule "%", comando "%", activo %, base "%"; esperado "%", "%", true, "%".',
        k_job, v_job_quando, v_job_cmd, v_job_ativo, v_job_base, k_quando, k_cmd, current_database()::text;
    END IF;
    IF NOT has_function_privilege(v_job_user, 'public.rpc_denuncias_limpar()', 'EXECUTE') THEN
      RAISE EXCEPTION 'Conferir: o job % corre como %, que nao pode executar rpc_denuncias_limpar.', k_job, v_job_user;
    END IF;
    v_prova_cron := 'agendado como ' || v_job_user || ' (' || k_quando || ')';
  ELSE
    RAISE WARNING 'PENDENCIA: pg_cron nao esta instalado, o job % NAO foi agendado. Registar em POR FAZER: as sessoes, limites e reservas expirados das denuncias ficam guardados ate la (continuam invalidos).', k_job;
    v_prova_cron := 'NAO agendado (sem pg_cron)';
  END IF;

  -- 3.3 A limpeza corre sem erro: o comando do job, DESFEITO (sentinela HDL00).
  --     A funcao e global (nao e por organizacao); o que apagar volta atras.
  BEGIN
    EXECUTE k_cmd INTO v_limpou;
    IF v_limpou IS NULL OR v_limpou < 0 THEN
      RAISE EXCEPTION 'Conferir: rpc_denuncias_limpar devolveu % (esperado um inteiro >= 0).', v_limpou;
    END IF;
    RAISE EXCEPTION 'limpeza_denuncias_ok' USING ERRCODE = 'HDL00';
  EXCEPTION
    WHEN SQLSTATE 'HDL00' THEN NULL;
  END;

  -- 3.4 Comportamento da RPC na nike, DESFEITO no fim (sentinela HHL00).
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = k_nike) THEN
      RAISE EXCEPTION 'Conferir: a nike nao existe.';
    END IF;
    v_hoje := public.hr_horas_extra_hoje();

    -- Estado actual da nike (para comparar e para confirmar que fica igual).
    SELECT true, c.aprovacao_conta_desde INTO v_ant_tem, v_ant_desde
      FROM public.hr_horas_extra_config c
     WHERE c.organization_id = k_nike;
    v_ant_tem := coalesce(v_ant_tem, false);
    SELECT min(pp.data_inicio) INTO v_esp_folhas
      FROM public.hr_periodos_processamento pp
     WHERE pp.organization_id = k_nike AND pp.estado = 'fechado' AND pp.data_fim >= v_ant_desde;
    SELECT max(pp.data_fim) INTO v_esp_ultima
      FROM public.hr_periodos_processamento pp
     WHERE pp.organization_id = k_nike AND pp.estado = 'fechado';

    -- Quem le e liga (view e gerir). Toda a consulta leva a organizacao da nike.
    SELECT au.auth_user_id INTO v_uid
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.assiduidade.view', k_nike), false)
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.assiduidade.gerir', k_nike), false)
     ORDER BY au.id
     LIMIT 1;
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Conferir: na nike falta um utilizador activo com hr.assiduidade.view e hr.assiduidade.gerir.';
    END IF;

    -- a) Sem sessao e sem permissao: insufficient_privilege 42501.
    FOR v_n IN 1..2 LOOP
      IF v_n = 1 THEN
        PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
      ELSE
        v_falso := gen_random_uuid();
        PERFORM set_config('request.jwt.claim.sub', v_falso::text, true),
                set_config('request.jwt.claims', json_build_object('sub', v_falso, 'role', 'authenticated')::text, true);
      END IF;
      v_st := NULL;
      v_msg := NULL;
      BEGIN
        PERFORM public.rpc_hr_horas_extra_contagem_ler(k_nike);
      EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE; v_msg := SQLERRM;
      END;
      IF v_st IS DISTINCT FROM '42501' OR v_msg IS DISTINCT FROM 'insufficient_privilege' THEN
        RAISE EXCEPTION 'Conferir: ler o interruptor % devia dar insufficient_privilege 42501 (deu % %).', k_estado[v_n], coalesce(v_st, 'aceite'), coalesce(v_msg, '');
      END IF;
    END LOOP;

    -- b) O estado actual da nike, tal como esta, com exactamente as quatro
    --    chaves. Sem folhas fechadas na nike, isto prova ultima = null.
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    v_j := public.rpc_hr_horas_extra_contagem_ler(k_nike);
    IF (SELECT count(*) FROM jsonb_object_keys(v_j)) <> 4
       OR NOT (v_j ?& ARRAY['aprovacao_desde', 'folhas_fechadas_desde', 'ultima_folha_fechada_ate', 'tem_config'])
       OR (v_j ->> 'aprovacao_desde')::date IS DISTINCT FROM v_ant_desde
       OR (v_j ->> 'folhas_fechadas_desde')::date IS DISTINCT FROM v_esp_folhas
       OR (v_j ->> 'ultima_folha_fechada_ate')::date IS DISTINCT FROM v_esp_ultima
       OR (v_j ->> 'tem_config')::boolean IS DISTINCT FROM v_ant_tem THEN
      RAISE EXCEPTION 'Conferir: a leitura do estado actual da nike devia ter as quatro chaves e dar desde %, folhas %, ultima %, tem_config %; deu %.', v_ant_desde, v_esp_folhas, v_esp_ultima, v_ant_tem, v_j::text;
    END IF;
    IF v_esp_ultima IS NULL THEN
      v_prova_nula := 'provado (a nike nao tem folhas fechadas)';
    ELSE
      v_prova_nula := 'nao provado: a nike ja tem folhas fechadas ate ' || to_char(v_esp_ultima, 'YYYY-MM-DD');
    END IF;

    -- Um intervalo depois de qualquer folha da nike, que inclua um dia ate
    -- hoje (a mesma escolha da prova de 20270111400000).
    SELECT max(pp.data_fim) INTO v_ult FROM public.hr_periodos_processamento pp WHERE pp.organization_id = k_nike;
    v_ini := greatest(coalesce(v_ult + 1, make_date(extract(year FROM v_hoje)::integer, extract(month FROM v_hoje)::integer, 1)),
                      v_hoje - 300);
    IF v_ini > v_hoje THEN
      RAISE EXCEPTION 'Conferir: a nike ja tem folhas ate %; a prova precisa de um dia ate hoje fora de qualquer folha.', v_ult;
    END IF;
    v_fim := (make_date(extract(year FROM v_ini)::integer, extract(month FROM v_ini)::integer, 1)
              + interval '1 month' - interval '1 day')::date;
    IF EXISTS (SELECT 1 FROM public.hr_periodos_processamento pp
                WHERE pp.organization_id = k_nike
                  AND pp.ano = extract(year FROM v_fim)::integer AND pp.mes = extract(month FROM v_fim)::integer) THEN
      v_fim := (make_date(extract(year FROM v_ini)::integer, extract(month FROM v_ini)::integer, 1)
                + interval '2 months' - interval '1 day')::date;
    END IF;
    v_d := least(v_fim, v_hoje);

    -- Partir do interruptor desligado na nike (so a nike; desfeito no fim).
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    UPDATE public.hr_horas_extra_config SET aprovacao_conta_desde = NULL WHERE organization_id = k_nike;

    -- c) Uma folha fechada que o interruptor NAO cobre (acaba antes da data):
    --    folhas_fechadas_desde null, e desligar e aceite (subtransaccao
    --    desfeita, HHL01).
    BEGIN
      INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, data_inicio, data_fim, transicao)
      VALUES (k_nike, extract(year FROM v_fim)::integer, extract(month FROM v_fim)::integer, 'aberto', v_ini, v_fim, true)
      RETURNING id INTO v_per1;
      UPDATE public.hr_periodos_processamento SET estado = 'fechado', fechado_em = now() WHERE id = v_per1;
      PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
              set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      -- Interruptor desligado com uma folha fechada: ultima = o fim dela.
      v_j := public.rpc_hr_horas_extra_contagem_ler(k_nike);
      IF (v_j ->> 'aprovacao_desde') IS NOT NULL
         OR (v_j ->> 'folhas_fechadas_desde') IS NOT NULL
         OR (v_j ->> 'ultima_folha_fechada_ate')::date IS DISTINCT FROM v_fim THEN
        RAISE EXCEPTION 'Conferir: desligado e com a folha % a % fechada, devia dar desde null, folhas null, ultima %; deu %.', v_ini, v_fim, v_fim, v_j::text;
      END IF;
      v_j := public.rpc_hr_horas_extra_contagem_guardar(k_nike, v_fim + 1);
      IF (v_j ->> 'alterada')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'Conferir: ligar o interruptor a % (depois da folha fechada) devia gravar; deu %.', v_fim + 1, v_j::text;
      END IF;
      v_j := public.rpc_hr_horas_extra_contagem_ler(k_nike);
      IF (v_j ->> 'aprovacao_desde')::date IS DISTINCT FROM v_fim + 1
         OR (v_j ->> 'folhas_fechadas_desde') IS NOT NULL
         OR (v_j ->> 'ultima_folha_fechada_ate')::date IS DISTINCT FROM v_fim
         OR (v_j ->> 'tem_config')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'Conferir: com uma folha fechada antes da data do interruptor, folhas_fechadas_desde devia ser null; deu %.', v_j::text;
      END IF;
      v_j := public.rpc_hr_horas_extra_contagem_guardar(k_nike, NULL);
      IF (v_j ->> 'alterada')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'Conferir: com folhas_fechadas_desde null desligar devia ser aceite; deu %.', v_j::text;
      END IF;
      RAISE EXCEPTION 'folha_nao_coberta_ok' USING ERRCODE = 'HHL01';
    EXCEPTION
      WHEN SQLSTATE 'HHL01' THEN NULL;
    END;

    -- d) Desligado: nada a cobrir.
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    v_j := public.rpc_hr_horas_extra_contagem_ler(k_nike);
    IF (v_j ->> 'aprovacao_desde') IS NOT NULL OR (v_j ->> 'folhas_fechadas_desde') IS NOT NULL
       OR (v_j ->> 'ultima_folha_fechada_ate')::date IS DISTINCT FROM v_esp_ultima
       OR (v_j ->> 'tem_config')::boolean IS DISTINCT FROM v_ant_tem THEN
      RAISE EXCEPTION 'Conferir: com o interruptor desligado a leitura devia dar desde null e folhas null; deu %.', v_j::text;
    END IF;

    -- e) Ligar com a folha aberta: ligado, ainda nada fechado a cobrir.
    v_j := public.rpc_hr_horas_extra_contagem_guardar(k_nike, v_d);
    IF (v_j ->> 'alterada')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'Conferir: ligar o interruptor a % devia gravar; deu %.', v_d, v_j::text;
    END IF;
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, data_inicio, data_fim, transicao)
    VALUES (k_nike, extract(year FROM v_fim)::integer, extract(month FROM v_fim)::integer, 'aberto', v_ini, v_fim, true)
    RETURNING id INTO v_per2;
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    v_j := public.rpc_hr_horas_extra_contagem_ler(k_nike);
    IF (v_j ->> 'aprovacao_desde')::date IS DISTINCT FROM v_d
       OR (v_j ->> 'folhas_fechadas_desde') IS NOT NULL
       OR (v_j ->> 'ultima_folha_fechada_ate')::date IS DISTINCT FROM v_esp_ultima
       OR (v_j ->> 'tem_config')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'Conferir: ligado a % com a folha aberta, devia dar desde %, folhas null, tem_config true; deu %.', v_d, v_d, v_j::text;
    END IF;

    -- f) Fechada a folha coberta: folhas_fechadas_desde = o seu inicio, e
    --    guardar recusa desligar e adiar (HRA87), como a leitura anuncia.
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    UPDATE public.hr_periodos_processamento SET estado = 'fechado', fechado_em = now() WHERE id = v_per2;
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    v_j := public.rpc_hr_horas_extra_contagem_ler(k_nike);
    IF (v_j ->> 'aprovacao_desde')::date IS DISTINCT FROM v_d
       OR (v_j ->> 'folhas_fechadas_desde')::date IS DISTINCT FROM v_ini
       OR (v_j ->> 'ultima_folha_fechada_ate')::date IS DISTINCT FROM v_fim
       OR (v_j ->> 'tem_config')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'Conferir: com a folha % a % fechada e coberta, folhas_fechadas_desde devia ser %; deu %.', v_ini, v_fim, v_ini, v_j::text;
    END IF;
    FOR v_n IN 1..2 LOOP
      v_st := NULL;
      BEGIN
        PERFORM public.rpc_hr_horas_extra_contagem_guardar(k_nike, (ARRAY[NULL, v_fim + 1]::date[])[v_n]);
      EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
      END;
      IF v_st IS DISTINCT FROM 'HRA87' THEN
        RAISE EXCEPTION 'Conferir: com folhas_fechadas_desde preenchido, % devia dar HRA87 (deu %).', (ARRAY['desligar', 'adiar'])[v_n], coalesce(v_st, 'aceite');
      END IF;
    END LOOP;

    -- g) Quem so tem view.own (sem view) e recusado.
    SELECT au.auth_user_id INTO v_own
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.assiduidade.view.own', k_nike), false)
       AND NOT coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.assiduidade.view', k_nike), false)
     ORDER BY au.id
     LIMIT 1;
    IF v_own IS NULL THEN
      v_prova_own := 'nao provado: na nike nao ha utilizador activo com hr.assiduidade.view.own sem view';
    ELSE
      PERFORM set_config('request.jwt.claim.sub', v_own::text, true),
              set_config('request.jwt.claims', json_build_object('sub', v_own, 'role', 'authenticated')::text, true);
      v_st := NULL;
      BEGIN
        PERFORM public.rpc_hr_horas_extra_contagem_ler(k_nike);
      EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
      END;
      IF v_st IS DISTINCT FROM '42501' THEN
        RAISE EXCEPTION 'Conferir: com so view.own ler o interruptor devia dar 42501 (deu %).', coalesce(v_st, 'aceite');
      END IF;
      v_prova_own := 'provado';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    RAISE NOTICE 'Conferir: prova na nike entre % e % (dia %); view.own: %; ultima null sem folhas fechadas: %; limpeza das denuncias: % linha(s), desfeito; job: %.',
      v_ini, v_fim, v_d, coalesce(v_prova_own, '?'), coalesce(v_prova_nula, '?'), v_limpou, v_prova_cron;
    RAISE EXCEPTION 'teste_horas_extra_ler_ok' USING ERRCODE = 'HHL00';
  EXCEPTION
    WHEN SQLSTATE 'HHL00' THEN
      NULL; -- sucesso: tudo o que o bloco escreveu na nike foi desfeito.
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

  -- Nada ficou: o interruptor da nike como estava e nenhuma folha de teste.
  IF (SELECT c.aprovacao_conta_desde FROM public.hr_horas_extra_config c WHERE c.organization_id = k_nike)
       IS DISTINCT FROM v_ant_desde
     OR EXISTS (SELECT 1 FROM public.hr_horas_extra_config c WHERE c.organization_id = k_nike) IS DISTINCT FROM v_ant_tem
     OR EXISTS (SELECT 1 FROM public.hr_periodos_processamento pp WHERE pp.id IN (v_per1, v_per2)) THEN
    RAISE EXCEPTION 'Conferir: o teste deixou alteracoes na nike.';
  END IF;

  RAISE NOTICE 'Conferido: rpc_hr_horas_extra_contagem_ler so para authenticated com hr.assiduidade.view (sem sessao, sem permissao e so view.own: 42501); quatro chaves; ultima_folha_fechada_ate = fim da folha fechada mais recente, ligado ou desligado; desligado sem folhas a cobrir; folha fechada antes da data nao conta e desligar e aceite; folha fechada coberta da o seu inicio e guardar recusa desligar e adiar (HRA87); limpeza das denuncias corre sem erro; job %.', v_prova_cron;
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes, a partir do
--    worktree rh-pessoas (project-ref uetjghdkwbywbftedtth): pendente so este
--    ficheiro, acima de 20270111410000.
-- 2. Ler, antes do push, se pg_cron esta instalado na base RH e se ja existe
--    algum job com rpc_denuncias_limpar (G7 recusa se houver com outro nome).
--    Sem pg_cron a migration passa com WARNING: e pendencia a registar.
-- 3. Prova na nike ANTES do push: correr o ficheiro numa transaccao terminada
--    por um RAISE EXCEPTION (desfaz tudo, o job incluido). O NOTICE diz o
--    intervalo usado, quantas linhas a limpeza apanharia e o que ficou por
--    provar.
-- ==============================================================================
