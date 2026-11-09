-- ==============================================================================
-- Margem de tempo dos desvios (ENTREGA E2 do plano de desvios): a configuracao
-- versionada por organizacao e as duas RPCs de ler e guardar.
--
-- PROVISORIO. NAO FAZER db push sem: (1) listar o remoto imediatamente antes,
-- a partir do worktree rh-pessoas (project-ref uetjghdkwbywbftedtth), e
-- confirmar que so este ficheiro e 20270110710000 ficam pendentes, acima de
-- 20270109900000; (2) correr a prova na nike em transaccao desfeita ANTES do
-- push; (3) revisao ecc:database-reviewer e ecc:security-reviewer. Entra no
-- MESMO push que 20270110710000 (deteccao e fecho), que depende desta.
--
--
-- -- PRECISA DE CODIGO NOVO NO MESMO ENVIO --------------------------------------
--
-- NAO para nada partir: a tabela e as RPCs sao novas. Para se ver, o ecra de
-- configuracao (entrega E4) ganha a seccao "Margem de tempo".
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- 1. hr_desvios_config: versoes por organizacao, [valido_de, valido_ate] com
--    valido_ate INCLUSIVO (como hr_regras_salariais): uma versao nova fecha a
--    anterior NO DIA ANTERIOR. A versao de uma data d tem valido_de <= d e
--    (valido_ate NULL ou >= d), e nao esta substituida. margem_min 0..120 ou
--    NULL. SEM VERSAO EM VIGOR, OU COM UMA VERSAO DE MARGEM NULL ("sem
--    margem"), A FUNCIONALIDADE ESTA DESLIGADA nessa data: sem deteccao, sem
--    bloqueio no fecho, relatorio igual ao de hoje (20270110710000 e o
--    cliente dependem disto). Uma versao NULL e a forma de desligar a partir
--    de uma data.
--    Historico: so acrescenta. UPDATE so para FECHAR (valido_ate de NULL para
--    uma data), marcar SUBSTITUIDA (substituida_em/_por, uma vez) e as
--    cascatas SET NULL dos autores; DELETE e TRUNCATE recusados. Corrigir a
--    versao mais recente (mesma data) marca-a substituida e cria outra.
--    Uma so versao em aberto por organizacao (indice unico parcial) e nenhuma
--    sobreposicao entre versoes nao substituidas (trigger, com lock por
--    organizacao; btree_gist nao esta instalada).
--    Uma versao nunca comeca em ou antes do fim de uma folha FECHADA
--    (desvios_config_periodo_fechado), com o lock da organizacao que as regras
--    salariais usam e FOR SHARE das folhas que acabam a partir da data: fechar
--    uma folha a meio espera por esta transaccao.
--    RLS ligada e FORCADA, sem politicas, sem privilegios: so as RPCs.
--
-- 2. rpc_hr_desvios_config_ler(p_organization_id uuid, p_data date DEFAULT
--    NULL) RETURNS jsonb {em_vigor: {...} | null, versoes: [...]}.
--    ATENCAO, DESVIO AO PLANO (1.1 pede hr.assiduidade.gerir): a LEITURA
--    aceita hr.assiduidade.view, hr.assiduidade.view.own ou
--    hr.assiduidade.gerir. O relatorio de assiduidade (entrega E5) tem de
--    saber a margem para contar os dias dentro dela, e quem o abre tem view
--    ou view.own, nao gerir. A margem nao e um dado pessoal. Se se quiser so
--    gerir, trocar a condicao e o comentario; o resto nao muda.
--
-- 3. rpc_hr_desvios_config_guardar(p_organization_id uuid, p_valido_de date,
--    p_margem_min integer) RETURNS uuid. p_margem_min NULL = "sem margem"
--    (desliga a partir de p_valido_de). Exige hr.assiduidade.gerir. Data de
--    2000-01-01 ate 5 anos para a frente, nunca em ou antes de uma folha
--    fechada, nunca antes da versao mais recente (mesma data = corrige-a).
--
--
-- -- O QUE MUDA PARA AS OUTRAS ORGANIZACOES -----------------------------------
--
-- Nada. Nenhuma organizacao fica com versao: a funcionalidade nasce desligada
-- em todas, incluindo a nike, ate alguem gravar uma margem.
--
--
-- -- CODIGOS DE ERRO (prefixo da mensagem; ERRCODE) ---------------------------
--
--   desvios_config_sem_sessao / _sem_permissao / _sem_utilizador (42501)
--   desvios_config_dados_em_falta (23502)
--   desvios_config_fora_de_intervalo / _data_invalida / _periodo_fechado /
--   _data_anterior (23514)
--   desvios_config_versoes_sobrepostas (23P01)
--   desvios_config_historico_imutavel (22000)
--   desvios_config_fora_de_transaccao (25000)
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao, de proposito. A mao, por migration nova, e so
-- depois de reverter 20270110710000 (pessoas_desvios tem FK para esta tabela):
-- largar as RPCs, as funcoes internas e, depois de exportar e de largar os
-- triggers de historico, a tabela.
-- ==============================================================================

SET LOCAL lock_timeout = '5s';

-- ---- G00: dentro de uma transaccao -------------------------------------------
DO $transaccao$
BEGIN
  IF current_setting('lock_timeout') IS DISTINCT FROM '5s' THEN
    RAISE EXCEPTION
      'desvios_config_fora_de_transaccao: SET LOCAL nao teve efeito (lock_timeout = %); esta migration tem de correr numa so transaccao.',
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
BEGIN
  -- G0. Quem aplica passa a RLS (tabela FORCE sem politicas; as RPCs definer
  --     correm com os direitos deste papel).
  IF NOT EXISTS (SELECT 1 FROM pg_roles r
                  WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G0: o papel que aplica (%) nao tem BYPASSRLS; com FORCE RLS as RPCs nao leriam a configuracao.', current_user::text;
  END IF;

  -- G1. Nomes novos livres.
  IF to_regclass('public.hr_desvios_config') IS NOT NULL THEN
    RAISE EXCEPTION 'G1: public.hr_desvios_config ja existe. Ler o que la esta.';
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND p.proname::text IN ('hr_desvios_config_sem_sobreposicao', 'hr_desvios_config_imutavel',
                             'hr_desvios_config_json', 'hr_desvios_config_em',
                             'hr_desvios_config_guardar_core',
                             'rpc_hr_desvios_config_ler', 'rpc_hr_desvios_config_guardar');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G1: ja existem funcoes com nomes desta migration: %.', v_lista;
  END IF;

  -- G2. Permissoes usadas (nenhuma e criada).
  FOREACH v_cod IN ARRAY ARRAY['hr.assiduidade.view', 'hr.assiduidade.view.own', 'hr.assiduidade.gerir'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code = v_cod) THEN
      RAISE EXCEPTION 'G2: o codigo % nao esta no catalogo.', v_cod;
    END IF;
  END LOOP;

  -- G3. Suporte.
  IF to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'G3: falta has_anew_permission_in_org(uuid, text, uuid).';
  END IF;
  SELECT count(*) INTO v_n
    FROM (VALUES ('hr_periodos_processamento', 'organization_id'), ('hr_periodos_processamento', 'estado'),
                 ('hr_periodos_processamento', 'data_inicio'), ('hr_periodos_processamento', 'data_fim'),
                 ('anew_users', 'id'), ('anew_users', 'auth_user_id'),
                 ('anew_organizations', 'id'))
         AS e(tabela, coluna)
   WHERE EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = to_regclass('public.' || e.tabela)
                    AND a.attname::text = e.coluna AND NOT a.attisdropped);
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'G3: faltam colunas esperadas em hr_periodos_processamento, anew_users ou anew_organizations (% de 7).', v_n;
  END IF;
END;
$guardas$;


-- ==============================================================================
-- 1. A tabela
-- ==============================================================================
CREATE TABLE public.hr_desvios_config (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  margem_min       integer,
  valido_de        date        NOT NULL,
  valido_ate       date,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  substituida_em   timestamptz,
  substituida_por  uuid,

  CONSTRAINT hr_desvios_config_pkey PRIMARY KEY (id),
  CONSTRAINT hr_desvios_config_org_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE RESTRICT,
  CONSTRAINT hr_desvios_config_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_desvios_config_substituida_por_fkey
    FOREIGN KEY (substituida_por) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_desvios_config_margem_intervalo
    CHECK (margem_min IS NULL OR margem_min BETWEEN 0 AND 120),
  CONSTRAINT hr_desvios_config_datas_validas
    CHECK (valido_de BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
           AND (valido_ate IS NULL OR valido_ate >= valido_de)),
  CONSTRAINT hr_desvios_config_substituicao_coerente
    CHECK (substituida_em IS NOT NULL OR substituida_por IS NULL)
);

-- Uma so versao em vigor (nao substituida) em aberto por organizacao.
CREATE UNIQUE INDEX uq_hr_desvios_config_org_aberta
  ON public.hr_desvios_config (organization_id) WHERE valido_ate IS NULL AND substituida_em IS NULL;
CREATE INDEX idx_hr_desvios_config_org_de
  ON public.hr_desvios_config (organization_id, valido_de DESC);
CREATE INDEX idx_hr_desvios_config_created_by
  ON public.hr_desvios_config (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX idx_hr_desvios_config_substituida_por
  ON public.hr_desvios_config (substituida_por) WHERE substituida_por IS NOT NULL;

COMMENT ON TABLE public.hr_desvios_config IS
'Margem de tempo dos desvios de assiduidade, versionada por organizacao: cada linha vale de valido_de a valido_ate INCLUSIVO (NULL = em aberto); linhas com substituida_em foram corrigidas por outra com a mesma data e ja nao valem. margem_min (0..120, ou NULL = sem margem): um dia so tem desvio quando |realizado - planeado| ou min(fora, em falta) passam a margem (igual nao e desvio). SEM VERSAO EM VIGOR NUMA DATA, OU COM A VERSAO EM VIGOR DE MARGEM NULL, A FUNCIONALIDADE ESTA DESLIGADA NESSA DATA (sem deteccao, sem bloqueio no fecho). Historico: so se fecha ou se substitui; DELETE e TRUNCATE recusados. Nunca comeca em ou antes de uma folha fechada. RLS forcada, sem politicas nem privilegios: so rpc_hr_desvios_config_ler e rpc_hr_desvios_config_guardar.';

-- Versoes nao substituidas que se cruzam. Serializa por organizacao.
CREATE FUNCTION public.hr_desvios_config_sem_sobreposicao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_c record;
BEGIN
  IF NEW.substituida_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hr_desvios_config:' || NEW.organization_id::text, 0));

  SELECT c.id, c.valido_de, c.valido_ate INTO v_c
    FROM public.hr_desvios_config c
   WHERE c.organization_id = NEW.organization_id
     AND c.id <> NEW.id
     AND c.substituida_em IS NULL
     AND pg_catalog.daterange(c.valido_de, c.valido_ate, '[]')
         OPERATOR(pg_catalog.&&) pg_catalog.daterange(NEW.valido_de, NEW.valido_ate, '[]')
   LIMIT 1;

  IF v_c.id IS NOT NULL THEN
    RAISE EXCEPTION
      'desvios_config_versoes_sobrepostas: a versao de % a % cruza-se com a de % a %.',
      NEW.valido_de, coalesce(NEW.valido_ate::text, 'sem fim'),
      v_c.valido_de, coalesce(v_c.valido_ate::text, 'sem fim')
      USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hr_desvios_config_sem_sobreposicao
  BEFORE INSERT OR UPDATE ON public.hr_desvios_config
  FOR EACH ROW EXECUTE FUNCTION public.hr_desvios_config_sem_sobreposicao();

-- Historico: UPDATE so para fechar, marcar substituida, ou as cascatas SET
-- NULL; DELETE e TRUNCATE recusados.
CREATE FUNCTION public.hr_desvios_config_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.id, NEW.organization_id, NEW.margem_min, NEW.valido_de, NEW.created_at)
       IS NOT DISTINCT FROM
       ROW(OLD.id, OLD.organization_id, OLD.margem_min, OLD.valido_de, OLD.created_at)
       AND (NEW.valido_ate IS NOT DISTINCT FROM OLD.valido_ate
            OR (OLD.valido_ate IS NULL AND NEW.valido_ate IS NOT NULL AND OLD.substituida_em IS NULL))
       AND (NEW.created_by IS NOT DISTINCT FROM OLD.created_by OR NEW.created_by IS NULL)
       AND (NEW.substituida_em IS NOT DISTINCT FROM OLD.substituida_em
            OR (OLD.substituida_em IS NULL AND NEW.substituida_em IS NOT NULL))
       AND (NEW.substituida_por IS NOT DISTINCT FROM OLD.substituida_por
            OR NEW.substituida_por IS NULL
            OR (OLD.substituida_em IS NULL AND NEW.substituida_em IS NOT NULL AND OLD.substituida_por IS NULL)) THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION
    'desvios_config_historico_imutavel: as versoes da margem de tempo sao historico; so se fecham ou se substituem por uma nova (%).', TG_OP
    USING ERRCODE = '22000';
END;
$$;

CREATE TRIGGER trg_hr_desvios_config_imutavel
  BEFORE UPDATE OR DELETE ON public.hr_desvios_config
  FOR EACH ROW EXECUTE FUNCTION public.hr_desvios_config_imutavel();
CREATE TRIGGER trg_hr_desvios_config_sem_truncate
  BEFORE TRUNCATE ON public.hr_desvios_config
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_desvios_config_imutavel();

REVOKE ALL ON TABLE public.hr_desvios_config FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.hr_desvios_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_desvios_config FORCE ROW LEVEL SECURITY;
-- Sem CREATE POLICY de proposito: so as RPCs.


-- ==============================================================================
-- 2. Leitura: uma versao em jsonb; a versao em vigor numa data (internas)
-- ==============================================================================
CREATE FUNCTION public.hr_desvios_config_json(p_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
           'id',             c.id,
           'margem_min',     c.margem_min,
           'valido_de',      c.valido_de,
           'valido_ate',     c.valido_ate,
           'created_at',     c.created_at,
           'substituida_em', c.substituida_em)
    FROM public.hr_desvios_config c
   WHERE c.id = p_id
$$;

CREATE FUNCTION public.hr_desvios_config_em(p_organization_id uuid, p_data date)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT public.hr_desvios_config_json(c.id)
    FROM public.hr_desvios_config c
   WHERE c.organization_id = p_organization_id
     AND c.substituida_em IS NULL
     AND c.valido_de <= p_data
     AND (c.valido_ate IS NULL OR c.valido_ate >= p_data)
   ORDER BY c.valido_de DESC
   LIMIT 1
$$;

COMMENT ON FUNCTION public.hr_desvios_config_em(uuid, date) IS
'INTERNA (sem EXECUTE para ninguem). A versao da margem em vigor na data (nao substituida), em jsonb; NULL quando nao ha versao (funcionalidade desligada nessa data). valido_ate e INCLUSIVO.';

CREATE FUNCTION public.rpc_hr_desvios_config_ler(p_organization_id uuid, p_data date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth uuid := auth.uid();
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'desvios_config_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'desvios_config_dados_em_falta: a organizacao e obrigatoria.' USING ERRCODE = '23502';
  END IF;
  IF NOT (coalesce(public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.gerir', p_organization_id), false)
          OR coalesce(public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.view', p_organization_id), false)
          OR coalesce(public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.view.own', p_organization_id), false)) THEN
    RAISE EXCEPTION 'desvios_config_sem_permissao: ver a margem de tempo exige hr.assiduidade.view, hr.assiduidade.view.own ou hr.assiduidade.gerir nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'em_vigor', public.hr_desvios_config_em(
                  p_organization_id, coalesce(p_data, (pg_catalog.now() AT TIME ZONE 'Europe/Lisbon')::date)),
    'versoes', coalesce((
      SELECT pg_catalog.jsonb_agg(public.hr_desvios_config_json(c.id)
                                  ORDER BY c.valido_de DESC, c.created_at DESC, c.id DESC)
        FROM public.hr_desvios_config c
       WHERE c.organization_id = p_organization_id), '[]'::jsonb));
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_desvios_config_ler(uuid, date) IS
'A margem de tempo dos desvios: {em_vigor: versao em vigor na data (NULL = hoje em Lisboa) ou null se a funcionalidade esta desligada nessa data, versoes: todas, incluindo as substituidas, mais recente primeiro}. Exige hr.assiduidade.view, hr.assiduidade.view.own ou hr.assiduidade.gerir (42501 desvios_config_sem_permissao). A leitura com view/view.own e um desvio consciente ao plano: o relatorio precisa da margem.';


-- ==============================================================================
-- 3. Guardar: core interno e RPC com o gate
-- ==============================================================================
CREATE FUNCTION public.hr_desvios_config_guardar_core(
  p_organization_id uuid,
  p_valido_de       date,
  p_margem_min      integer,
  p_actor           uuid
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_fechado date;
  v_ult     record;
  v_id      uuid;
BEGIN
  -- p_margem_min NULL = "sem margem": desliga a funcionalidade a partir da data.
  IF p_organization_id IS NULL OR p_valido_de IS NULL THEN
    RAISE EXCEPTION 'desvios_config_dados_em_falta: organizacao e data de inicio sao obrigatorias.'
      USING ERRCODE = '23502';
  END IF;
  IF p_margem_min IS NOT NULL AND (p_margem_min < 0 OR p_margem_min > 120) THEN
    RAISE EXCEPTION 'desvios_config_fora_de_intervalo: a margem tem de estar entre 0 e 120 minutos (recebido %).', p_margem_min
      USING ERRCODE = '23514';
  END IF;
  IF p_valido_de < DATE '2000-01-01' OR p_valido_de > DATE '2100-12-31' THEN
    RAISE EXCEPTION 'desvios_config_data_invalida: a data de inicio tem de estar entre 2000 e 2100 (recebido %).', p_valido_de
      USING ERRCODE = '23514';
  END IF;

  -- Lock da organizacao (a mesma chave das regras salariais e de abrir a
  -- folha) e das folhas que acabam a partir da data: fechar uma folha a meio
  -- espera por esta transaccao.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hr_periodos_processamento:' || p_organization_id::text, 0));
  PERFORM 1 FROM public.hr_periodos_processamento pp
   WHERE pp.organization_id = p_organization_id AND pp.data_fim >= p_valido_de
     FOR SHARE;

  SELECT max(pp.data_fim) INTO v_fechado
    FROM public.hr_periodos_processamento pp
   WHERE pp.organization_id = p_organization_id AND pp.estado = 'fechado';
  IF v_fechado IS NOT NULL AND v_fechado >= p_valido_de THEN
    RAISE EXCEPTION
      'desvios_config_periodo_fechado: ha uma folha fechada ate %; a margem nova so pode valer a partir de %.',
      v_fechado, v_fechado + 1
      USING ERRCODE = '23514';
  END IF;

  -- A versao em vigor mais recente (sempre a em aberto).
  SELECT c.id, c.valido_de INTO v_ult
    FROM public.hr_desvios_config c
   WHERE c.organization_id = p_organization_id AND c.substituida_em IS NULL
   ORDER BY c.valido_de DESC
   LIMIT 1
     FOR UPDATE;

  IF v_ult.id IS NOT NULL AND p_valido_de < v_ult.valido_de THEN
    RAISE EXCEPTION
      'desvios_config_data_anterior: ja ha uma versao que comeca em %; a nova tem de comecar nessa data (corrige-a) ou depois.',
      v_ult.valido_de
      USING ERRCODE = '23514';
  END IF;

  IF v_ult.id IS NOT NULL THEN
    IF p_valido_de = v_ult.valido_de THEN
      UPDATE public.hr_desvios_config c
         SET substituida_em = pg_catalog.now(), substituida_por = p_actor
       WHERE c.id = v_ult.id;
    ELSE
      UPDATE public.hr_desvios_config c
         SET valido_ate = p_valido_de - 1
       WHERE c.id = v_ult.id;
    END IF;
  END IF;

  INSERT INTO public.hr_desvios_config (organization_id, margem_min, valido_de, created_by)
  VALUES (p_organization_id, p_margem_min, p_valido_de, p_actor)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.hr_desvios_config_guardar_core(uuid, date, integer, uuid) IS
'INTERNA (sem EXECUTE para ninguem; chamada por rpc_hr_desvios_config_guardar, que faz o gate). Valida a margem (0..120, ou NULL = sem margem, que desliga a partir da data) e a data, toma o lock da organizacao, recusa uma data em ou antes do fim de uma folha fechada (desvios_config_periodo_fechado) ou antes da versao mais recente (desvios_config_data_anterior). Mesma data da mais recente: marca-a substituida e cria a nova. Data posterior: fecha a em aberto no dia anterior e cria a nova. Devolve o id.';

CREATE FUNCTION public.rpc_hr_desvios_config_guardar(
  p_organization_id uuid,
  p_valido_de       date,
  p_margem_min      integer
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth   uuid := auth.uid();
  v_actor  uuid;
  v_limite date := ((pg_catalog.now() AT TIME ZONE 'Europe/Lisbon')::date + interval '5 years')::date;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'desvios_config_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL OR p_valido_de IS NULL THEN
    RAISE EXCEPTION 'desvios_config_dados_em_falta: a organizacao e a data de inicio sao obrigatorias.' USING ERRCODE = '23502';
  END IF;
  IF NOT coalesce(public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.gerir', p_organization_id), false) THEN
    RAISE EXCEPTION 'desvios_config_sem_permissao: gravar a margem de tempo exige hr.assiduidade.gerir nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  SELECT au.id INTO v_actor FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'desvios_config_sem_utilizador: a sessao nao corresponde a nenhum utilizador.' USING ERRCODE = '42501';
  END IF;

  IF p_valido_de > v_limite THEN
    RAISE EXCEPTION 'desvios_config_data_invalida: a margem nao pode comecar depois de % (maximo 5 anos para a frente).', v_limite
      USING ERRCODE = '23514';
  END IF;

  RETURN public.hr_desvios_config_guardar_core(p_organization_id, p_valido_de, p_margem_min, v_actor);
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_desvios_config_guardar(uuid, date, integer) IS
'Grava uma versao da margem de tempo dos desvios (0..120 minutos, ou NULL = sem margem: funcionalidade desligada a partir dessa data) a partir de p_valido_de: de 2000-01-01 ate 5 anos para a frente, nunca em ou antes de uma folha fechada, nunca antes da versao mais recente. Fecha a versao em vigor no dia anterior, ou, com a mesma data, substitui-a (fica no historico). Exige hr.assiduidade.gerir (42501), verificada antes de ler qualquer dado. Devolve o id da versao.';

REVOKE ALL ON FUNCTION public.hr_desvios_config_sem_sobreposicao() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_desvios_config_imutavel() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_desvios_config_json(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_desvios_config_em(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_desvios_config_guardar_core(uuid, date, integer, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_desvios_config_ler(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_desvios_config_guardar(uuid, date, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_desvios_config_ler(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_desvios_config_guardar(uuid, date, integer) TO authenticated;


-- ==============================================================================
-- 4. Conferir: falha a migration inteira se algo nao bater
-- ==============================================================================
DO $conferir$
DECLARE
  k_nike     constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  v_novas    text[] := ARRAY[
    'public.rpc_hr_desvios_config_ler(uuid, date)',
    'public.rpc_hr_desvios_config_guardar(uuid, date, integer)'];
  v_internas text[] := ARRAY[
    'public.hr_desvios_config_sem_sobreposicao()',
    'public.hr_desvios_config_imutavel()',
    'public.hr_desvios_config_json(uuid)',
    'public.hr_desvios_config_em(uuid, date)',
    'public.hr_desvios_config_guardar_core(uuid, date, integer, uuid)'];
  v_fn       text;
  v_grant    text;
  v_n        integer;
  v_msg      text;
  v_j        jsonb;
  v_id       uuid;
  v_id2      uuid;
  v_corr     uuid;
  v_per      uuid;
  v_uid      uuid;
  v_autor    uuid;
  v_falso    uuid;
  v_antes    integer;
BEGIN
  -- 1. EXECUTE por aclexplode (sem o dono). NULL em proacl = o omisso (PUBLIC).
  FOREACH v_fn IN ARRAY v_novas || v_internas LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION 'Conferir: a funcao % nao existe.', v_fn;
    END IF;
    SELECT coalesce(string_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ','
                               ORDER BY CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END), '')
      INTO v_grant
      FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = to_regprocedure(v_fn)::oid AND a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner;
    IF v_fn = ANY (v_novas) AND v_grant <> 'authenticated' THEN
      RAISE EXCEPTION 'Conferir: % devia ter EXECUTE so para authenticated; tem "%".', v_fn, v_grant;
    ELSIF v_fn <> ALL (v_novas) AND v_grant <> '' THEN
      RAISE EXCEPTION 'Conferir: a interna % tem EXECUTE para "%".', v_fn, v_grant;
    END IF;
  END LOOP;

  -- 2. SECURITY DEFINER so nas RPCs; search_path vazio em todas.
  FOREACH v_fn IN ARRAY v_novas LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(v_fn)::oid AND p.prosecdef) THEN
      RAISE EXCEPTION 'Conferir: % devia ser SECURITY DEFINER.', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY v_internas LOOP
    IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(v_fn)::oid AND p.prosecdef) THEN
      RAISE EXCEPTION 'Conferir: a interna % nao devia ser SECURITY DEFINER.', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY v_novas || v_internas LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = to_regprocedure(v_fn)::oid
                      AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'Conferir: % nao tem search_path vazio.', v_fn;
    END IF;
  END LOOP;

  -- 3. Tabela: RLS ligada e forcada, sem politicas, sem privilegios.
  IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = to_regclass('public.hr_desvios_config')
                  AND c.relrowsecurity AND c.relforcerowsecurity) THEN
    RAISE EXCEPTION 'Conferir: hr_desvios_config sem RLS ligada e forcada.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = to_regclass('public.hr_desvios_config')) THEN
    RAISE EXCEPTION 'Conferir: hr_desvios_config tem politicas; o desenho e sem nenhuma.';
  END IF;
  SELECT coalesce(string_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END
                             || ':' || a.privilege_type::text, ','), '')
    INTO v_grant
    FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
   WHERE c.oid = to_regclass('public.hr_desvios_config') AND a.grantee <> c.relowner;
  IF v_grant <> '' THEN
    RAISE EXCEPTION 'Conferir: hr_desvios_config tem privilegios para "%".', v_grant;
  END IF;
  SELECT count(*) INTO v_n FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.hr_desvios_config')
     AND c.conname::text IN ('hr_desvios_config_pkey', 'hr_desvios_config_org_fkey', 'hr_desvios_config_created_by_fkey',
                             'hr_desvios_config_substituida_por_fkey', 'hr_desvios_config_margem_intervalo',
                             'hr_desvios_config_datas_validas', 'hr_desvios_config_substituicao_coerente');
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'Conferir: restricoes em falta em hr_desvios_config (% de 7).', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class ci ON ci.oid = i.indexrelid
                  WHERE i.indrelid = to_regclass('public.hr_desvios_config')
                    AND ci.relname::text = 'uq_hr_desvios_config_org_aberta'
                    AND i.indisunique AND i.indpred IS NOT NULL) THEN
    RAISE EXCEPTION 'Conferir: falta o indice unico parcial de uma versao em aberto por organizacao.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_trigger t
   WHERE NOT t.tgisinternal AND t.tgenabled::text <> 'D'
     AND t.tgrelid = to_regclass('public.hr_desvios_config')
     AND t.tgname::text IN ('trg_hr_desvios_config_sem_sobreposicao', 'trg_hr_desvios_config_imutavel',
                            'trg_hr_desvios_config_sem_truncate');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Conferir: deviam existir 3 triggers ligados em hr_desvios_config; ha %.', v_n;
  END IF;
  IF EXISTS (SELECT 1 FROM public.hr_desvios_config) THEN
    RAISE EXCEPTION 'Conferir: a migration nao devia criar versoes (a funcionalidade nasce desligada).';
  END IF;

  -- 4. Comportamento, na nike, em 2098, DESFEITO no fim (sentinela HDC00).
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = k_nike) THEN
      RAISE EXCEPTION 'Conferir: a nike nao existe.';
    END IF;

    -- 4.0 RPCs: sem sessao, sem permissao, e com um utilizador da nike com
    --     gerir (a RPC so aceita ate 5 anos: corre antes das versoes de 2098).
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_desvios_config_ler(k_nike, NULL);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('desvios_config_sem_sessao' IN v_msg), 0) <> 1 THEN
      RAISE EXCEPTION 'Conferir: ler sem sessao devia ser recusado (%).', coalesce(v_msg, 'aceite');
    END IF;

    v_falso := gen_random_uuid();
    PERFORM set_config('request.jwt.claim.sub', v_falso::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_falso, 'role', 'authenticated')::text, true);
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_desvios_config_ler(k_nike, NULL);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('desvios_config_sem_permissao' IN v_msg), 0) <> 1 THEN
      RAISE EXCEPTION 'Conferir: ler sem permissao devia ser recusado (%).', coalesce(v_msg, 'aceite');
    END IF;
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_desvios_config_guardar(k_nike, current_date + 400, 10);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('desvios_config_sem_permissao' IN v_msg), 0) <> 1 THEN
      RAISE EXCEPTION 'Conferir: guardar sem permissao devia ser recusado (%).', coalesce(v_msg, 'aceite');
    END IF;

    SELECT au.auth_user_id, au.id INTO v_uid, v_autor
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND public.has_anew_permission_in_org(au.auth_user_id, 'hr.assiduidade.gerir', k_nike)
     ORDER BY au.id
     LIMIT 1;
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Conferir: na nike falta um utilizador activo com hr.assiduidade.gerir.';
    END IF;
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_desvios_config_guardar(k_nike, current_date + 2000, 10);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('desvios_config_data_invalida' IN v_msg), 0) <> 1 THEN
      RAISE EXCEPTION 'Conferir: guardar a mais de 5 anos devia ser recusado (%).', coalesce(v_msg, 'aceite');
    END IF;
    v_id := public.rpc_hr_desvios_config_guardar(k_nike, current_date + 400, 12);
    IF NOT EXISTS (SELECT 1 FROM public.hr_desvios_config c
                    WHERE c.id = v_id AND c.created_by = v_autor AND c.margem_min = 12
                      AND c.valido_de = current_date + 400 AND c.valido_ate IS NULL) THEN
      RAISE EXCEPTION 'Conferir: guardar pela RPC devia gravar a versao em aberto com o autor.';
    END IF;
    v_j := public.rpc_hr_desvios_config_ler(k_nike, current_date + 401);
    IF (v_j -> 'em_vigor' ->> 'id')::uuid IS DISTINCT FROM v_id OR jsonb_array_length(v_j -> 'versoes') <> 1 THEN
      RAISE EXCEPTION 'Conferir: ler pela RPC devia dar a versao gravada; deu %.', v_j::text;
    END IF;
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

    -- 4.a folha de 03/2098 fechada: datas em ou antes do fim recusadas.
    INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, data_inicio, data_fim)
    VALUES (k_nike, 2098, 3, 'aberto', DATE '2098-03-01', DATE '2098-03-31')
    RETURNING id INTO v_per;
    UPDATE public.hr_periodos_processamento SET estado = 'fechado', fechado_em = now() WHERE id = v_per;

    v_msg := NULL;
    BEGIN
      PERFORM public.hr_desvios_config_guardar_core(k_nike, DATE '2098-03-15', 10, NULL);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF v_msg IS NULL OR position('desvios_config_periodo_fechado' IN v_msg) <> 1 THEN
      RAISE EXCEPTION 'Conferir: uma margem dentro de uma folha fechada nao foi recusada (%).', coalesce(v_msg, 'aceite');
    END IF;

    -- 4.b margem fora do intervalo.
    FOREACH v_n IN ARRAY ARRAY[-1, 121] LOOP
      v_msg := NULL;
      BEGIN
        PERFORM public.hr_desvios_config_guardar_core(k_nike, DATE '2098-04-01', v_n, NULL);
      EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
      END;
      IF v_msg IS NULL OR position('desvios_config_fora_de_intervalo' IN v_msg) <> 1 THEN
        RAISE EXCEPTION 'Conferir: a margem % nao foi recusada (%).', v_n, coalesce(v_msg, 'aceite');
      END IF;
    END LOOP;

    -- 4.c vigencia: 10 desde 2098-04-01; 15 desde 2098-07-01 fecha a primeira a 2098-06-30.
    v_id := public.hr_desvios_config_guardar_core(k_nike, DATE '2098-04-01', 10, NULL);
    v_id2 := public.hr_desvios_config_guardar_core(k_nike, DATE '2098-07-01', 15, NULL);
    v_j := public.hr_desvios_config_em(k_nike, DATE '2098-06-30');
    IF (v_j ->> 'id')::uuid IS DISTINCT FROM v_id OR (v_j ->> 'margem_min')::integer IS DISTINCT FROM 10
       OR (v_j ->> 'valido_ate')::date IS DISTINCT FROM DATE '2098-06-30' THEN
      RAISE EXCEPTION 'Conferir: a 30/06/2098 devia valer a margem 10 fechada nesse dia; deu %.', coalesce(v_j::text, 'NULL');
    END IF;
    v_j := public.hr_desvios_config_em(k_nike, DATE '2098-07-01');
    IF (v_j ->> 'id')::uuid IS DISTINCT FROM v_id2 OR (v_j ->> 'margem_min')::integer IS DISTINCT FROM 15 THEN
      RAISE EXCEPTION 'Conferir: a 01/07/2098 devia valer a margem 15; deu %.', coalesce(v_j::text, 'NULL');
    END IF;
    IF (public.hr_desvios_config_em(k_nike, DATE '2098-03-31') ->> 'valido_ate')::date IS DISTINCT FROM DATE '2098-03-31' THEN
      RAISE EXCEPTION 'Conferir: a versao gravada pela RPC devia ter ficado fechada a 31/03/2098 pela de 01/04/2098.';
    END IF;
    IF public.hr_desvios_config_em(k_nike, current_date) IS NOT NULL THEN
      RAISE EXCEPTION 'Conferir: antes da primeira versao a funcionalidade devia estar desligada (NULL).';
    END IF;

    -- 4.d data anterior a versao mais recente: recusada.
    v_msg := NULL;
    BEGIN
      PERFORM public.hr_desvios_config_guardar_core(k_nike, DATE '2098-05-01', 20, NULL);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF v_msg IS NULL OR position('desvios_config_data_anterior' IN v_msg) <> 1 THEN
      RAISE EXCEPTION 'Conferir: uma versao anterior a mais recente nao foi recusada (%).', coalesce(v_msg, 'aceite');
    END IF;

    -- 4.e correccao com a mesma data: a antiga fica substituida, a nova vale.
    v_corr := public.hr_desvios_config_guardar_core(k_nike, DATE '2098-07-01', 25, NULL);
    IF v_corr = v_id2
       OR (public.hr_desvios_config_em(k_nike, DATE '2098-08-01') ->> 'id')::uuid IS DISTINCT FROM v_corr
       OR NOT EXISTS (SELECT 1 FROM public.hr_desvios_config c WHERE c.id = v_id2 AND c.substituida_em IS NOT NULL)
       OR (SELECT count(*) FROM public.hr_desvios_config c
            WHERE c.organization_id = k_nike AND c.valido_ate IS NULL AND c.substituida_em IS NULL) <> 1 THEN
      RAISE EXCEPTION 'Conferir: corrigir a versao mais recente devia substitui-la e deixar uma so em aberto.';
    END IF;

    -- 4.f historico: mudar a margem, reabrir, apagar e TRUNCATE recusados (mesmo ao dono).
    v_n := 0;
    BEGIN UPDATE public.hr_desvios_config SET margem_min = 30 WHERE id = v_corr;
    EXCEPTION WHEN OTHERS THEN IF position('desvios_config_historico_imutavel' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN UPDATE public.hr_desvios_config SET valido_ate = NULL WHERE id = v_id;
    EXCEPTION WHEN OTHERS THEN IF position('desvios_config_historico_imutavel' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN DELETE FROM public.hr_desvios_config WHERE id = v_id;
    EXCEPTION WHEN OTHERS THEN IF position('desvios_config_historico_imutavel' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN TRUNCATE public.hr_desvios_config;
    EXCEPTION WHEN OTHERS THEN IF position('desvios_config_historico_imutavel' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    IF v_n <> 4 THEN
      RAISE EXCEPTION 'Conferir: das 4 escritas proibidas no historico so % foram recusadas.', v_n;
    END IF;

    -- 4.g sobreposicao: uma linha a mao que se cruza com outra nao substituida.
    v_msg := NULL;
    BEGIN
      INSERT INTO public.hr_desvios_config (organization_id, margem_min, valido_de, valido_ate)
      VALUES (k_nike, 5, DATE '2098-05-01', DATE '2098-05-31');
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF v_msg IS NULL OR position('desvios_config_versoes_sobrepostas' IN v_msg) <> 1 THEN
      RAISE EXCEPTION 'Conferir: uma versao sobreposta nao foi recusada (%).', coalesce(v_msg, 'aceite');
    END IF;

    -- 4.h Ler pela RPC: a 01/08/2098 vale a correccao (25); 4 versoes (a da
    --     RPC em 4.0, as duas de 2098 e a correccao).
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    v_j := public.rpc_hr_desvios_config_ler(k_nike, DATE '2098-08-01');
    IF (v_j -> 'em_vigor' ->> 'margem_min')::integer IS DISTINCT FROM 25
       OR jsonb_array_length(v_j -> 'versoes') <> 4 THEN
      RAISE EXCEPTION 'Conferir: ler a 01/08/2098 devia dar a margem 25 e 4 versoes; deu %.', v_j::text;
    END IF;
    -- Com a folha de 03/2098 fechada, uma data antes dela e recusada tambem pela RPC.
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_desvios_config_guardar(k_nike, current_date + 400, 10);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF coalesce(position('desvios_config_periodo_fechado' IN v_msg), 0) <> 1 THEN
      RAISE EXCEPTION 'Conferir: guardar antes de uma folha fechada devia ser recusado pela RPC (%).', coalesce(v_msg, 'aceite');
    END IF;

    -- 4.i "sem margem": uma versao NULL desliga a partir da sua data (fecha
    --     a anterior no dia anterior); ler devolve em_vigor com margem null.
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    v_id := public.hr_desvios_config_guardar_core(k_nike, DATE '2098-10-01', NULL, NULL);
    v_j := public.hr_desvios_config_em(k_nike, DATE '2098-10-02');
    IF (v_j ->> 'id')::uuid IS DISTINCT FROM v_id OR (v_j -> 'margem_min') IS DISTINCT FROM 'null'::jsonb
       OR (public.hr_desvios_config_em(k_nike, DATE '2098-09-30') ->> 'margem_min')::integer IS DISTINCT FROM 25
       OR (public.hr_desvios_config_em(k_nike, DATE '2098-09-30') ->> 'valido_ate')::date IS DISTINCT FROM DATE '2098-09-30' THEN
      RAISE EXCEPTION 'Conferir: a versao sem margem de 01/10/2098 devia valer dai em diante (margem null) e fechar a de 25 a 30/09; deu %.', coalesce(v_j::text, 'NULL');
    END IF;
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    v_j := public.rpc_hr_desvios_config_ler(k_nike, DATE '2098-10-02');
    IF (v_j -> 'em_vigor') IS NULL OR (v_j -> 'em_vigor' -> 'margem_min') IS DISTINCT FROM 'null'::jsonb THEN
      RAISE EXCEPTION 'Conferir: ler a 02/10/2098 devia dar a versao em vigor com margem null; deu %.', v_j::text;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    RAISE EXCEPTION 'teste_desvios_config_ok' USING ERRCODE = 'HDC00';
  EXCEPTION
    WHEN SQLSTATE 'HDC00' THEN
      NULL; -- sucesso: tudo o que o bloco escreveu na nike foi desfeito.
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

  IF EXISTS (SELECT 1 FROM public.hr_desvios_config)
     OR EXISTS (SELECT 1 FROM public.hr_periodos_processamento pp WHERE pp.organization_id = k_nike AND pp.ano = 2098) THEN
    RAISE EXCEPTION 'Conferir: o teste deixou linhas na nike.';
  END IF;

  RAISE NOTICE 'Conferido: margem de tempo versionada (vigencia com valido_ate inclusivo, correccao por substituicao, folha fechada, intervalo 0..120, versao sem margem (NULL) a desligar, historico so acrescenta, sobreposicao recusada); RPCs so para authenticated com permissao; nenhuma organizacao fica com margem.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes, a partir do
--    worktree rh-pessoas (project-ref uetjghdkwbywbftedtth): pendentes so este
--    ficheiro e 20270110710000, acima de 20270109900000.
-- 2. Prova na nike ANTES do push: correr os dois ficheiros numa transaccao
--    terminada por um RAISE EXCEPTION (desfaz tudo).
-- ==============================================================================
