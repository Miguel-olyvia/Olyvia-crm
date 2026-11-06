-- ==============================================================================
-- Regras salariais, ENTREGA C (parte da base): km e ajudas de custo lancados
-- com QUANTIDADE e valor calculado pela regra; limite anual das horas extra
-- lido da regra salarial em vigor.
--
-- PROVISORIO. NAO FAZER db push sem: (1) listar o remoto e confirmar que o
-- carimbo 20270109700000 fica acima do maximo aplicado; (2) correr a prova na
-- nike em transaccao desfeita; (3) revisao ecc:database-reviewer e
-- ecc:security-reviewer. Depende de 20270109600000 (hr_regras_salariais,
-- hr_regras_salariais_em, pessoas_direitos_salariais) ja aplicada.
--
--
-- -- PRECISA DE CODIGO NOVO NO MESMO ENVIO --------------------------------------
--
-- NAO parte o cliente actual: a RPC nova aceita a chamada antiga por nome
-- (p_periodo_id, p_pessoa_id, p_descricao, p_valor, p_codigo_processamento_id)
-- porque p_tipo tem omissao 'manual'. Para lancar km ou ajudas o cliente tem de
-- passar p_tipo e p_quantidade (e NAO p_valor).
-- rpc_hr_horas_extra_saldo passa a devolver limite_ano_origem 'regra' ou
-- 'omissao' (antes 'contrato' ou 'organizacao'); HorasExtraDaPessoa.tsx so
-- distingue 'contrato', por isso mostra o texto da omissao ate ser mudado.
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- 1. hr_processamento_lancamentos ganha:
--      tipo        text NOT NULL DEFAULT 'manual'  ('manual' | 'km' | 'ajudas')
--      quantidade  numeric(10,2)  NULL em manual; km ou dias em km/ajudas
--    As linhas existentes ficam 'manual' sem quantidade. tipo e quantidade
--    ficam imutaveis como o resto (trigger de imutabilidade alargado, por troca
--    de texto no corpo do remoto).
--    RLS passa a FORCADA (o dono tem BYPASSRLS: guarda G0).
--
-- 2. rpc_hr_processamento_lancamento_criar: larga-se a de 5 argumentos e cria-se
--      rpc_hr_processamento_lancamento_criar(
--        p_periodo_id uuid, p_pessoa_id uuid, p_descricao text,
--        p_valor numeric DEFAULT NULL, p_codigo_processamento_id uuid DEFAULT NULL,
--        p_tipo text DEFAULT 'manual', p_quantidade numeric DEFAULT NULL) RETURNS uuid
--    manual: igual a versao de 20261207020500 (as mesmas mensagens, a mesma
--      ordem: sessao, obrigatorios, lock FOR SHARE do periodo, permissao antes
--      de revelar o periodo, fechado, pessoa, organizacao, codigo, autor).
--    km/ajudas: p_valor tem de vir NULL (o valor NUNCA vem do cliente);
--      quantidade > 0 (km ate 100000, ajudas ate 62 dias), arredondada a 2
--      casas; a pessoa tem de ter o direito (pessoas_direitos_salariais.km ou
--      .ajudas; sem linha = sem direito); valor = round(quantidade x valor da
--      regra em vigor no ULTIMO DIA do periodo (data_fim), 2). Sem regra nesse
--      dia, ou com valor 0 na regra, recusa. O valor fica gravado: mudar a regra
--      depois nao muda lancamentos ja feitos. p_descricao vazia em km/ajudas
--      gera uma descricao.
--    search_path passa de 'public, pg_temp' a '' (tudo qualificado).
--    EXECUTE: so authenticated (PUBLIC, anon e service_role sem).
--
-- 3. Horas extra: o limite anual passa a ser he_limite_anual_min da regra
--    salarial em vigor (hr_regras_salariais_em) no dia que se avalia; o ano e
--    o civil (1/1 a 31/12, como ja era). Deixa de se ler
--    hr_horas_extra_config.ano_min e pessoas_vinculos.horas_anuais_maximas.
--    Sem regra nessa data: 6000 min (100 h), decisao do utilizador (5/11/2026);
--    nunca fica sem limite anual.
--    - hr_horas_extra_limite_anual_min(org, data): nova, interna.
--    - hr_horas_extra_pessoa_ctx: (uuid, uuid, integer) -> (uuid, uuid, date).
--      O limite e o da regra nessa data; origem 'regra' | 'omissao'. O
--      feriado e a autorizacao ficam como estavam.
--    - hr_horas_extra_acima: (7 args) -> (6 args, sem p_ano_min): le o limite
--      da regra no proprio dia avaliado (6000 sem regra).
--    - rpc_hr_horas_extra_detetar, rpc_hr_hora_extra_decidir e
--      rpc_hr_hora_extra_registar: troca de TEXTO no corpo do remoto (so os
--      argumentos destas duas chamadas), guardada por contagem das ancoras e
--      conferida: corpo novo = corpo antigo com as trocas.
--    - rpc_hr_horas_extra_saldo: corpo novo (o antigo e conferido por md5).
--      O ano pedido usa a regra de hoje (ano corrente) ou a de 31/12 desse ano.
--    hr_horas_extra_config e rpc_hr_horas_extra_config_guardar NAO mudam (o
--    ano_min deixa de ser lido; larga-se numa migracao futura).
--
--
-- -- O QUE MUDA PARA AS OUTRAS ORGANIZACOES DA BASE RH --------------------------
--
-- Lancamentos manuais: nada. Horas extra: quem NAO tem regra salarial (no
-- remoto RH, depois de 20270109600000, so a nike tem) passa a ter 6000 min
-- por ano (antes: hr_horas_extra_config.ano_min, 9000 por omissao, ou o do
-- vinculo). Quem tem horas_anuais_maximas no vinculo passa a ter o limite da
-- regra (ou 6000). Decidido pelo utilizador a 5/11/2026.
--
--
-- -- CODIGOS DE ERRO (prefixo da mensagem; ERRCODE) ---------------------------
--
--   lancamento_tipo_invalido / _quantidade_invalida / _valor_nao_aceite (22023)
--   lancamento_sem_regra / _valor_regra_zero / _sem_direito (23514)
--   As mensagens do lancamento manual sao as de 20261207020500 (P0001).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao, de proposito. A mao, por migration nova: repor a
-- RPC de 5 argumentos de 20261207020500, hr_horas_extra_pessoa_ctx e
-- hr_horas_extra_acima de 20270104800000, reverter as trocas de texto nas tres
-- RPCs de horas extra e o saldo; tipo/quantidade so se largam depois de
-- exportar os lancamentos km/ajudas.
-- ==============================================================================

SET LOCAL lock_timeout = '5s';

-- ---- G00: dentro de uma transaccao -------------------------------------------
DO $transaccao$
BEGIN
  IF current_setting('lock_timeout') IS DISTINCT FROM '5s' THEN
    RAISE EXCEPTION
      'regras_calculo_fora_de_transaccao: SET LOCAL nao teve efeito (lock_timeout = %); esta migration tem de correr numa so transaccao.',
      current_setting('lock_timeout')
      USING ERRCODE = '25000';
  END IF;
END;
$transaccao$;

-- ---- Corpos esperados no remoto (para as guardas md5) -------------------------
-- O corpo de rpc_hr_processamento_lancamento_criar de 20261207020500:345.
CREATE TEMP TABLE tmp_rc_esperado (fn text PRIMARY KEY, corpo text NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_rc_esperado (fn, corpo) VALUES
('public.rpc_hr_processamento_lancamento_criar(uuid, uuid, text, numeric, uuid)', $old$
DECLARE
  v_auth      uuid := auth.uid();
  v_periodo   public.hr_periodos_processamento%ROWTYPE;
  v_pessoa_org uuid;
  v_autor_id  uuid;
  v_novo_id   uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_processamento_lancamento_criar exige um utilizador autenticado.';
  END IF;

  IF p_periodo_id IS NULL OR p_pessoa_id IS NULL THEN
    RAISE EXCEPTION 'p_periodo_id e p_pessoa_id sao obrigatorios.';
  END IF;

  IF p_descricao IS NULL OR btrim(p_descricao) = '' THEN
    RAISE EXCEPTION 'p_descricao nao pode ser vazia.';
  END IF;

  IF p_valor IS NULL OR p_valor = 0 THEN
    RAISE EXCEPTION 'p_valor tem de ser diferente de zero.';
  END IF;

  IF abs(round(p_valor, 2)) > 1000000 THEN
    RAISE EXCEPTION 'p_valor nao pode exceder 1.000.000 EUR em valor absoluto.';
  END IF;

  -- FOR SHARE, nao FOR UPDATE: fecha a corrida com
  -- rpc_hr_processamento_periodo_fechar (que usa FOR UPDATE na mesma linha),
  -- mas dois lancamentos concorrentes a pessoas diferentes do mesmo periodo
  -- ja nao se bloqueiam um ao outro -- so continuam bloqueados por, e a
  -- bloquear, um fecho de periodo em curso.
  SELECT * INTO v_periodo
    FROM public.hr_periodos_processamento
   WHERE id = p_periodo_id
   FOR SHARE;

  -- A verificacao de permissao corre logo depois do lock, ANTES de qualquer
  -- RAISE EXCEPTION que revele se o periodo existe ou o seu estado -- mesmo
  -- raciocinio de rpc_hr_processamento_periodo_fechar (20261207020400).
  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.processamento.lancamentos.gerir', v_periodo.organization_id) THEN
    RAISE EXCEPTION 'Sem permissao hr.processamento.lancamentos.gerir nesta organizacao.';
  END IF;

  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'Periodo % nao encontrado.', p_periodo_id;
  END IF;

  IF v_periodo.estado = 'fechado' THEN
    RAISE EXCEPTION 'Periodo % ja esta fechado -- nao aceita lancamentos novos.', p_periodo_id;
  END IF;

  SELECT p.organization_id INTO v_pessoa_org
    FROM public.pessoas p
   WHERE p.id = p_pessoa_id
     AND p.deleted_at IS NULL;

  IF v_pessoa_org IS NULL THEN
    RAISE EXCEPTION 'Pessoa % nao encontrada.', p_pessoa_id;
  END IF;

  IF v_pessoa_org <> v_periodo.organization_id THEN
    RAISE EXCEPTION 'A pessoa % nao pertence a organizacao deste periodo.', p_pessoa_id;
  END IF;

  IF p_codigo_processamento_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.hr_codigos_processamento c
     WHERE c.id = p_codigo_processamento_id
       AND c.activo
       AND (c.organization_id IS NULL OR c.organization_id = v_periodo.organization_id)
  ) THEN
    RAISE EXCEPTION 'Codigo de processamento % invalido, inactivo, ou de outra organizacao.', p_codigo_processamento_id;
  END IF;

  SELECT au.id INTO v_autor_id FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  IF v_autor_id IS NULL THEN
    RAISE EXCEPTION 'Utilizador autenticado sem ficha em anew_users.';
  END IF;

  INSERT INTO public.hr_processamento_lancamentos (
    periodo_id, pessoa_id, organization_id, descricao, valor, codigo_processamento_id,
    created_by, updated_by
  ) VALUES (
    p_periodo_id, p_pessoa_id, v_periodo.organization_id, btrim(p_descricao), round(p_valor, 2), p_codigo_processamento_id,
    v_autor_id, v_autor_id
  )
  RETURNING id INTO v_novo_id;

  RETURN v_novo_id;
END;
$old$),
-- O corpo de rpc_hr_horas_extra_saldo de 20270104800000:1535.
('public.rpc_hr_horas_extra_saldo(uuid, uuid, integer)', $old$
DECLARE
  v_pessoa uuid;
  v_ano    integer;
  v_cfg    record;
  v_ctx    record;
  v_conf   integer;
  v_pend   integer;
  v_total  integer;
BEGIN
  v_pessoa := public.hr_horas_extra_ambito_leitura(p_organization_id, p_pessoa_id);
  v_ano := coalesce(p_ano, extract(year FROM public.hr_horas_extra_hoje())::integer);
  IF v_pessoa IS NULL OR v_ano < 2000 OR v_ano > 2100 THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;
  PERFORM 1 FROM public.pessoas p
   WHERE p.id = v_pessoa AND p.organization_id = p_organization_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  SELECT * INTO v_cfg FROM public.hr_horas_extra_config_efetiva(p_organization_id);
  SELECT * INTO v_ctx FROM public.hr_horas_extra_pessoa_ctx(p_organization_id, v_pessoa, v_cfg.ano_min);

  SELECT coalesce(sum(x.minutos) FILTER (WHERE x.estado = 'confirmada'), 0)::integer,
         coalesce(sum(x.minutos) FILTER (WHERE x.estado = 'pendente'), 0)::integer
    INTO v_conf, v_pend
    FROM public.pessoas_horas_extra x
   WHERE x.organization_id = p_organization_id
     AND x.pessoa_id = v_pessoa
     AND x.data >= make_date(v_ano, 1, 1)
     AND x.data <  make_date(v_ano + 1, 1, 1);
  v_total := v_conf + v_pend;

  RETURN jsonb_build_object(
    'pessoa_id', v_pessoa,
    'ano', v_ano,
    'total_ano_min', v_total,
    'confirmadas_min', v_conf,
    'pendentes_min', v_pend,
    'limite_ano_min', v_ctx.limite_min,
    'limite_ano_origem', v_ctx.limite_origem,
    'limite_dia_min', v_cfg.dia_min,
    'alerta_pct', v_cfg.alerta_pct,
    'em_alerta', (v_total::bigint * 100) >= (v_ctx.limite_min::bigint * v_cfg.alerta_pct),
    'acima_limite', v_total > v_ctx.limite_min,
    'restante_min', greatest(0, v_ctx.limite_min - v_total));
END;
$old$);

-- As trocas de texto nos corpos do remoto: funcao, ancora, substituto, numero
-- exacto de ocorrencias da ancora.
CREATE TEMP TABLE tmp_rc_trocas (ordem integer PRIMARY KEY, fn text NOT NULL, ancora text NOT NULL,
                                 novo text NOT NULL, vezes integer NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_rc_trocas (ordem, fn, ancora, novo, vezes) VALUES
  (1, 'public.rpc_hr_horas_extra_detetar(uuid, date, date, uuid)',
      'public.hr_horas_extra_pessoa_ctx(p_organization_id, v_pessoa, v_cfg.ano_min)',
      'public.hr_horas_extra_pessoa_ctx(p_organization_id, v_pessoa, v_r.data)', 1),
  (2, 'public.rpc_hr_horas_extra_detetar(uuid, date, date, uuid)',
      'v_cfg.dia_min, v_ctx.limite_min)', 'v_cfg.dia_min)', 2),
  (3, 'public.rpc_hr_hora_extra_decidir(uuid, uuid, text, text)',
      'public.hr_horas_extra_pessoa_ctx(p_organization_id, v_pessoa, v_cfg.ano_min)',
      'public.hr_horas_extra_pessoa_ctx(p_organization_id, v_pessoa, v_he.data)', 1),
  (4, 'public.rpc_hr_hora_extra_decidir(uuid, uuid, text, text)',
      'v_cfg.dia_min, v_ctx.limite_min)', 'v_cfg.dia_min)', 1),
  (5, 'public.rpc_hr_hora_extra_registar(uuid, uuid, date, time without time zone, time without time zone, text)',
      'public.hr_horas_extra_pessoa_ctx(p_organization_id, p_pessoa_id, v_cfg.ano_min)',
      'public.hr_horas_extra_pessoa_ctx(p_organization_id, p_pessoa_id, p_data)', 1),
  (6, 'public.rpc_hr_hora_extra_registar(uuid, uuid, date, time without time zone, time without time zone, text)',
      'v_cfg.dia_min, v_ctx.limite_min)', 'v_cfg.dia_min)', 1),
  (7, 'public.hr_processamento_lancamento_imutavel_apos_anular()',
      'OR NEW.created_at IS DISTINCT FROM OLD.created_at',
      'OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.tipo IS DISTINCT FROM OLD.tipo OR NEW.quantidade IS DISTINCT FROM OLD.quantidade', 2);

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_lista text;
  v_n     integer;
  v_r     record;
  v_src   text;
BEGIN
  -- G0. Quem aplica e o dono de hr_processamento_lancamentos passam a RLS
  --     (a tabela fica FORCE; as RPCs definer correm como o dono).
  IF NOT EXISTS (SELECT 1 FROM pg_roles r
                  WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G0: o papel que aplica (%) nao tem BYPASSRLS.', current_user::text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
                  WHERE c.oid = to_regclass('public.hr_processamento_lancamentos')
                    AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G0: o dono de hr_processamento_lancamentos nao tem BYPASSRLS; FORCE RLS partiria as RPCs definer.';
  END IF;

  -- G1. Entrega B aplicada: regra, leitura em vigor e direitos.
  IF to_regclass('public.hr_regras_salariais') IS NULL
     OR to_regclass('public.pessoas_direitos_salariais') IS NULL
     OR to_regprocedure('public.hr_regras_salariais_em(uuid, date)') IS NULL
     OR to_regprocedure('public.hr_regras_salariais_guardar_core(uuid, date, jsonb, uuid)') IS NULL THEN
    RAISE EXCEPTION 'G1: falta a entrega B (20270109600000): hr_regras_salariais, pessoas_direitos_salariais, hr_regras_salariais_em ou _guardar_core.';
  END IF;
  SELECT count(*) INTO v_n
    FROM (VALUES ('hr_regras_salariais', 'km_valor'), ('hr_regras_salariais', 'ajudas_custo_dia'),
                 ('hr_regras_salariais', 'he_limite_anual_min'),
                 ('pessoas_direitos_salariais', 'km'), ('pessoas_direitos_salariais', 'ajudas'),
                 ('pessoas_direitos_salariais', 'pessoa_id'), ('pessoas_direitos_salariais', 'organization_id'),
                 ('hr_periodos_processamento', 'data_fim'))
         AS e(tabela, coluna)
   WHERE EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = to_regclass('public.' || e.tabela)
                    AND a.attname::text = e.coluna AND NOT a.attisdropped);
  IF v_n <> 8 THEN
    RAISE EXCEPTION 'G1: faltam colunas esperadas da entrega B ou de hr_periodos_processamento (% de 8).', v_n;
  END IF;

  -- G2. Nomes novos livres; colunas novas ainda nao existem.
  IF EXISTS (SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = to_regclass('public.hr_processamento_lancamentos')
                AND a.attname::text IN ('tipo', 'quantidade') AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'G2: hr_processamento_lancamentos ja tem tipo ou quantidade. Ler o que la esta.';
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public' AND p.proname::text = 'hr_horas_extra_limite_anual_min';
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G2: ja existe %.', v_lista;
  END IF;

  -- G3. As funcoes que se substituem existem com UMA so assinatura (a lida).
  SELECT string_agg(f.proname || ' (' || coalesce(f.n::text, '0') || ')', ', ') INTO v_lista
    FROM (SELECT x.proname, (SELECT count(*) FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                              WHERE ns.nspname::text = 'public' AND p.proname::text = x.proname) AS n
            FROM unnest(ARRAY['rpc_hr_processamento_lancamento_criar', 'hr_horas_extra_pessoa_ctx',
                              'hr_horas_extra_acima', 'rpc_hr_horas_extra_saldo', 'rpc_hr_horas_extra_detetar',
                              'rpc_hr_hora_extra_decidir', 'rpc_hr_hora_extra_registar',
                              'hr_processamento_lancamento_imutavel_apos_anular']) AS x(proname)) f
   WHERE f.n <> 1;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G3: estas funcoes nao existem ou tem mais de uma assinatura: %.', v_lista;
  END IF;
  IF to_regprocedure('public.rpc_hr_processamento_lancamento_criar(uuid, uuid, text, numeric, uuid)') IS NULL
     OR to_regprocedure('public.hr_horas_extra_pessoa_ctx(uuid, uuid, integer)') IS NULL
     OR to_regprocedure('public.hr_horas_extra_acima(uuid, uuid, date, integer, uuid, integer, integer)') IS NULL
     OR to_regprocedure('public.rpc_hr_horas_extra_saldo(uuid, uuid, integer)') IS NULL THEN
    RAISE EXCEPTION 'G3: alguma das assinaturas lidas (lancamento_criar de 5, pessoa_ctx de 3, acima de 7, saldo de 3) nao existe no remoto.';
  END IF;

  -- G4. md5 dos corpos que se substituem por inteiro (sem os \r dos dois lados).
  FOR v_r IN SELECT * FROM tmp_rc_esperado ORDER BY fn LOOP
    SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(v_r.fn)::oid;
    IF md5(replace(v_src, chr(13), '')) IS DISTINCT FROM md5(replace(v_r.corpo, chr(13), '')) THEN
      RAISE EXCEPTION 'G4: o corpo de % no remoto (md5 %) nao e o lido (md5 %). Reler a versao mais recente antes de aplicar.',
        v_r.fn, md5(replace(v_src, chr(13), '')), md5(replace(v_r.corpo, chr(13), ''));
    END IF;
  END LOOP;

  -- G5. As ancoras das trocas aparecem o numero exacto de vezes.
  FOR v_r IN SELECT * FROM tmp_rc_trocas ORDER BY ordem LOOP
    IF to_regprocedure(v_r.fn) IS NULL THEN
      RAISE EXCEPTION 'G5: % nao existe.', v_r.fn;
    END IF;
    SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = to_regprocedure(v_r.fn)::oid;
    v_n := (length(v_src) - length(replace(v_src, v_r.ancora, ''))) / length(v_r.ancora);
    IF v_n <> v_r.vezes THEN
      RAISE EXCEPTION 'G5: em %, "%" aparece % vez(es), esperavam-se %. Reler o corpo do remoto.', v_r.fn, v_r.ancora, v_n, v_r.vezes;
    END IF;
  END LOOP;

  -- G6. Ninguem mais chama as funcoes cuja assinatura muda.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND p.prosrc LIKE '%hr_horas_extra_pessoa_ctx(%'
     AND p.proname::text NOT IN ('rpc_hr_horas_extra_detetar', 'rpc_hr_hora_extra_decidir',
                                 'rpc_hr_hora_extra_registar', 'rpc_hr_horas_extra_saldo');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G6: outras funcoes chamam hr_horas_extra_pessoa_ctx: %. Incluir nesta migration.', v_lista;
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND p.prosrc LIKE '%hr_horas_extra_acima(%'
     AND p.proname::text NOT IN ('rpc_hr_horas_extra_detetar', 'rpc_hr_hora_extra_decidir',
                                 'rpc_hr_hora_extra_registar');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G6: outras funcoes chamam hr_horas_extra_acima: %. Incluir nesta migration.', v_lista;
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND p.prosrc LIKE '%rpc_hr_processamento_lancamento_criar(%'
     AND p.proname::text <> 'rpc_hr_processamento_lancamento_criar';
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G6: outras funcoes chamam rpc_hr_processamento_lancamento_criar: %. Rever antes de mudar a assinatura.', v_lista;
  END IF;

  -- G7. Permissao usada.
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code = 'hr.processamento.lancamentos.gerir') THEN
    RAISE EXCEPTION 'G7: hr.processamento.lancamentos.gerir nao esta no catalogo.';
  END IF;
  IF to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'G7: falta has_anew_permission_in_org(uuid, text, uuid).';
  END IF;
END;
$guardas$;

-- Os corpos de antes das trocas, para o conferir provar que so mudou o pedido.
CREATE TEMP TABLE tmp_rc_antes ON COMMIT DROP AS
SELECT DISTINCT t.fn, p.prosrc, p.prosecdef,
       coalesce(array_to_string(p.proconfig, ','), '') AS proconfig,
       coalesce(p.proacl::text, '') AS proacl
  FROM tmp_rc_trocas t
  JOIN pg_proc p ON p.oid = to_regprocedure(t.fn)::oid;


-- ==============================================================================
-- 1. hr_processamento_lancamentos: tipo e quantidade
-- ==============================================================================
ALTER TABLE public.hr_processamento_lancamentos
  ADD COLUMN tipo       text          NOT NULL DEFAULT 'manual',
  ADD COLUMN quantidade numeric(10,2),
  ADD CONSTRAINT hr_processamento_lancamentos_tipo_valido
    CHECK (tipo IN ('manual', 'km', 'ajudas')),
  ADD CONSTRAINT hr_processamento_lancamentos_quantidade_coerente
    CHECK ((tipo = 'manual') = (quantidade IS NULL)),
  ADD CONSTRAINT hr_processamento_lancamentos_quantidade_intervalo
    CHECK (quantidade IS NULL OR (quantidade > 0 AND quantidade <= 100000));

COMMENT ON COLUMN public.hr_processamento_lancamentos.tipo IS
'manual (valor escrito pelo RH) | km | ajudas (valor = quantidade x valor da regra salarial em vigor no ultimo dia do periodo, calculado pela RPC e gravado; mudar a regra depois nao muda o lancamento). Imutavel. Desde 20270109700000.';
COMMENT ON COLUMN public.hr_processamento_lancamentos.quantidade IS
'km (tipo km) ou dias (tipo ajudas), 2 casas; NULL em manual. Imutavel. Desde 20270109700000.';

ALTER TABLE public.hr_processamento_lancamentos FORCE ROW LEVEL SECURITY;

-- Imutabilidade: tipo e quantidade juntam-se a lista de colunas que nao mudam
-- (nos dois ramos: activa e anulada). Troca de texto no corpo do remoto.
DO $imutavel$
DECLARE
  v_fn  constant text := 'public.hr_processamento_lancamento_imutavel_apos_anular()';
  v_def text;
  v_r   record;
BEGIN
  v_def := pg_get_functiondef(to_regprocedure(v_fn)::oid);
  FOR v_r IN SELECT * FROM tmp_rc_trocas WHERE fn = v_fn ORDER BY ordem LOOP
    v_def := replace(v_def, v_r.ancora, v_r.novo);
  END LOOP;
  EXECUTE v_def;
END;
$imutavel$;


-- ==============================================================================
-- 2. rpc_hr_processamento_lancamento_criar: assinatura nova (larga a antiga)
-- ==============================================================================
DROP FUNCTION public.rpc_hr_processamento_lancamento_criar(uuid, uuid, text, numeric, uuid);

CREATE FUNCTION public.rpc_hr_processamento_lancamento_criar(
  p_periodo_id              uuid,
  p_pessoa_id               uuid,
  p_descricao               text,
  p_valor                   numeric DEFAULT NULL,
  p_codigo_processamento_id uuid    DEFAULT NULL,
  p_tipo                    text    DEFAULT 'manual',
  p_quantidade              numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max_km     constant numeric := 100000;
  c_max_dias   constant numeric := 62;
  v_auth       uuid := auth.uid();
  v_periodo    public.hr_periodos_processamento%ROWTYPE;
  v_pessoa_org uuid;
  v_autor_id   uuid;
  v_novo_id    uuid;
  v_tipo       text := coalesce(p_tipo, 'manual');
  v_qtd        numeric(10,2);
  v_regra      jsonb;
  v_unit       numeric;
  v_valor      numeric(10,2);
  v_descricao  text;
  v_direito    boolean;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_processamento_lancamento_criar exige um utilizador autenticado.';
  END IF;

  IF p_periodo_id IS NULL OR p_pessoa_id IS NULL THEN
    RAISE EXCEPTION 'p_periodo_id e p_pessoa_id sao obrigatorios.';
  END IF;

  IF v_tipo NOT IN ('manual', 'km', 'ajudas') THEN
    RAISE EXCEPTION 'lancamento_tipo_invalido: o tipo tem de ser manual, km ou ajudas.'
      USING ERRCODE = '22023';
  END IF;

  IF v_tipo = 'manual' THEN
    IF p_quantidade IS NOT NULL THEN
      RAISE EXCEPTION 'lancamento_quantidade_invalida: um lancamento manual nao leva quantidade.'
        USING ERRCODE = '22023';
    END IF;
    IF p_descricao IS NULL OR pg_catalog.btrim(p_descricao) = '' THEN
      RAISE EXCEPTION 'p_descricao nao pode ser vazia.';
    END IF;
    IF p_valor IS NULL OR p_valor = 0 THEN
      RAISE EXCEPTION 'p_valor tem de ser diferente de zero.';
    END IF;
    IF pg_catalog.abs(pg_catalog.round(p_valor, 2)) > 1000000 THEN
      RAISE EXCEPTION 'p_valor nao pode exceder 1.000.000 EUR em valor absoluto.';
    END IF;
  ELSE
    -- km e ajudas: o valor e SEMPRE o da regra; o cliente so manda a quantidade.
    IF p_valor IS NOT NULL THEN
      RAISE EXCEPTION 'lancamento_valor_nao_aceite: em km e ajudas o valor e calculado pela regra salarial; enviar so a quantidade.'
        USING ERRCODE = '22023';
    END IF;
    v_qtd := pg_catalog.round(p_quantidade, 2);
    IF v_qtd IS NULL OR v_qtd <= 0
       OR (v_tipo = 'km' AND v_qtd > c_max_km)
       OR (v_tipo = 'ajudas' AND v_qtd > c_max_dias) THEN
      RAISE EXCEPTION 'lancamento_quantidade_invalida: a quantidade tem de ser maior que zero (km ate %, dias de ajudas ate %).',
        c_max_km, c_max_dias
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- FOR SHARE, nao FOR UPDATE: fecha a corrida com
  -- rpc_hr_processamento_periodo_fechar (FOR UPDATE na mesma linha) sem
  -- bloquear lancamentos concorrentes a pessoas diferentes do mesmo periodo.
  SELECT * INTO v_periodo
    FROM public.hr_periodos_processamento pp
   WHERE pp.id = p_periodo_id
   FOR SHARE;

  -- Permissao logo depois do lock, ANTES de revelar se o periodo existe.
  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.processamento.lancamentos.gerir', v_periodo.organization_id) THEN
    RAISE EXCEPTION 'Sem permissao hr.processamento.lancamentos.gerir nesta organizacao.';
  END IF;

  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'Periodo % nao encontrado.', p_periodo_id;
  END IF;

  IF v_periodo.estado = 'fechado' THEN
    RAISE EXCEPTION 'Periodo % ja esta fechado -- nao aceita lancamentos novos.', p_periodo_id;
  END IF;

  SELECT p.organization_id INTO v_pessoa_org
    FROM public.pessoas p
   WHERE p.id = p_pessoa_id
     AND p.deleted_at IS NULL;

  IF v_pessoa_org IS NULL THEN
    RAISE EXCEPTION 'Pessoa % nao encontrada.', p_pessoa_id;
  END IF;

  IF v_pessoa_org <> v_periodo.organization_id THEN
    RAISE EXCEPTION 'A pessoa % nao pertence a organizacao deste periodo.', p_pessoa_id;
  END IF;

  IF p_codigo_processamento_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.hr_codigos_processamento c
     WHERE c.id = p_codigo_processamento_id
       AND c.activo
       AND (c.organization_id IS NULL OR c.organization_id = v_periodo.organization_id)
  ) THEN
    RAISE EXCEPTION 'Codigo de processamento % invalido, inactivo, ou de outra organizacao.', p_codigo_processamento_id;
  END IF;

  IF v_tipo = 'manual' THEN
    v_valor     := pg_catalog.round(p_valor, 2);
    v_descricao := pg_catalog.btrim(p_descricao);
  ELSE
    -- Direito da pessoa (sem linha = sem direito).
    SELECT CASE v_tipo WHEN 'km' THEN d.km ELSE d.ajudas END INTO v_direito
      FROM public.pessoas_direitos_salariais d
     WHERE d.pessoa_id = p_pessoa_id
       AND d.organization_id = v_periodo.organization_id;
    IF v_direito IS NOT TRUE THEN
      RAISE EXCEPTION 'lancamento_sem_direito: a pessoa nao tem direito a %.',
        CASE v_tipo WHEN 'km' THEN 'quilometros' ELSE 'ajudas de custo' END
        USING ERRCODE = '23514';
    END IF;

    -- A regra em vigor no ultimo dia do periodo.
    v_regra := public.hr_regras_salariais_em(v_periodo.organization_id, v_periodo.data_fim);
    IF v_regra IS NULL THEN
      RAISE EXCEPTION 'lancamento_sem_regra: nao ha regra salarial em vigor a % nesta organizacao.', v_periodo.data_fim
        USING ERRCODE = '23514';
    END IF;
    v_unit := (v_regra ->> CASE v_tipo WHEN 'km' THEN 'km_valor' ELSE 'ajudas_custo_dia' END)::numeric;
    v_valor := pg_catalog.round(v_qtd * v_unit, 2);
    IF v_valor IS NULL OR v_valor = 0 THEN
      RAISE EXCEPTION 'lancamento_valor_regra_zero: a regra salarial em vigor a % tem valor 0 para %.',
        v_periodo.data_fim, CASE v_tipo WHEN 'km' THEN 'quilometros' ELSE 'ajudas de custo' END
        USING ERRCODE = '23514';
    END IF;
    IF pg_catalog.abs(v_valor) > 1000000 THEN
      RAISE EXCEPTION 'p_valor nao pode exceder 1.000.000 EUR em valor absoluto.';
    END IF;
    v_descricao := CASE WHEN p_descricao IS NULL OR pg_catalog.btrim(p_descricao) = ''
                        THEN CASE v_tipo WHEN 'km' THEN 'Quilometros: ' || v_qtd::text || ' km'
                                         ELSE 'Ajudas de custo: ' || v_qtd::text || ' dia(s)' END
                        ELSE pg_catalog.btrim(p_descricao) END;
  END IF;

  SELECT au.id INTO v_autor_id FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  IF v_autor_id IS NULL THEN
    RAISE EXCEPTION 'Utilizador autenticado sem ficha em anew_users.';
  END IF;

  INSERT INTO public.hr_processamento_lancamentos (
    periodo_id, pessoa_id, organization_id, descricao, valor, codigo_processamento_id,
    tipo, quantidade, created_by, updated_by
  ) VALUES (
    p_periodo_id, p_pessoa_id, v_periodo.organization_id, v_descricao, v_valor, p_codigo_processamento_id,
    v_tipo, v_qtd, v_autor_id, v_autor_id
  )
  RETURNING id INTO v_novo_id;

  RETURN v_novo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_processamento_lancamento_criar(uuid, uuid, text, numeric, uuid, text, numeric)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_processamento_lancamento_criar(uuid, uuid, text, numeric, uuid, text, numeric)
  TO authenticated;

COMMENT ON FUNCTION public.rpc_hr_processamento_lancamento_criar(uuid, uuid, text, numeric, uuid, text, numeric) IS
'Cria um lancamento numa pessoa dentro de um periodo ABERTO. Exige hr.processamento.lancamentos.gerir na organizacao do periodo. p_tipo manual (omissao): p_valor obrigatorio e diferente de zero, p_descricao obrigatoria, sem p_quantidade. p_tipo km ou ajudas: so p_quantidade (km ate 100000, dias ate 62; p_valor tem de vir NULL), a pessoa tem de ter o direito em pessoas_direitos_salariais, e o valor = round(quantidade x km_valor ou ajudas_custo_dia da regra salarial em vigor no data_fim do periodo, 2), gravado. Recusa periodo fechado, pessoa de outra organizacao e codigo invalido/inactivo/de outra organizacao. Erros novos: lancamento_tipo_invalido, _quantidade_invalida, _valor_nao_aceite (22023), lancamento_sem_direito, _sem_regra, _valor_regra_zero (23514). Desde 20270109700000 (substitui a de 5 argumentos).';


-- ==============================================================================
-- 3. Horas extra: limite anual da regra salarial
-- ==============================================================================

-- 3.1 O limite anual (minutos) da regra em vigor numa data; 6000 sem regra.
CREATE FUNCTION public.hr_horas_extra_limite_anual_min(p_organization_id uuid, p_data date)
RETURNS integer
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT coalesce((public.hr_regras_salariais_em(p_organization_id, p_data) ->> 'he_limite_anual_min')::integer, 6000)
$$;

COMMENT ON FUNCTION public.hr_horas_extra_limite_anual_min(uuid, date) IS
'INTERNA (sem EXECUTE para ninguem). Limite anual de horas extra, em minutos, da regra salarial em vigor na data (hr_regras_salariais_em). Sem regra nessa data: 6000 min (100 h), a omissao decidida pelo utilizador a 5/11/2026; nunca fica sem limite. Desde 20270109700000.';

-- 3.2 O contexto da pessoa numa data.
CREATE FUNCTION public.hr_horas_extra_pessoa_ctx(
  p_organization_id uuid, p_pessoa_id uuid, p_data date,
  OUT limite_min integer, OUT limite_origem text, OUT feriado_conta boolean, OUT pode boolean)
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_pol text;
BEGIN
  SELECT v.politica_feriados INTO v_pol
    FROM public.pessoas_vinculos v
   WHERE v.pessoa_id = p_pessoa_id
     AND v.organization_id = p_organization_id
     AND v.deleted_at IS NULL
     AND public.hr_horas_extra_vinculo_em_vigor(v.estado)
   ORDER BY v.data_inicio DESC
   LIMIT 1;
  limite_min    := public.hr_horas_extra_limite_anual_min(p_organization_id, p_data);
  limite_origem := CASE WHEN public.hr_regras_salariais_em(p_organization_id, p_data) IS NULL
                        THEN 'omissao' ELSE 'regra' END;
  feriado_conta := coalesce(v_pol, 'nao_laboral') <> 'trabalho_habitual';
  pode := coalesce((SELECT a.pode FROM public.pessoas_horas_extra_autorizacao a
                     WHERE a.pessoa_id = p_pessoa_id AND a.organization_id = p_organization_id), false);
END;
$$;

COMMENT ON FUNCTION public.hr_horas_extra_pessoa_ctx(uuid, uuid, date) IS
'INTERNA. Contexto de uma pessoa: limite anual da regra salarial em vigor em p_data (origem regra), ou 6000 min sem regra (origem omissao); se o feriado conta (politica_feriados do vinculo em vigor HOJE <> trabalho_habitual) e se pode fazer horas extra. Ja nao le pessoas_vinculos.horas_anuais_maximas nem hr_horas_extra_config.ano_min. Desde 20270109700000.';

-- 3.3 Passa o limite? O anual e o da regra no proprio dia avaliado.
CREATE FUNCTION public.hr_horas_extra_acima(
  p_organization_id uuid, p_pessoa_id uuid, p_data date, p_minutos integer,
  p_excluir_id uuid, p_dia_min integer)
RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_dia     integer;
  v_ano     integer;
  v_ano_min integer;
BEGIN
  SELECT coalesce(sum(h.minutos) FILTER (WHERE h.data = p_data), 0)::integer,
         coalesce(sum(h.minutos), 0)::integer
    INTO v_dia, v_ano
    FROM public.pessoas_horas_extra h
   WHERE h.organization_id = p_organization_id
     AND h.pessoa_id = p_pessoa_id
     -- make_date e nao date_trunc: date_trunc(date) resolve para timestamptz e
     -- dependeria do fuso da sessao.
     AND h.data >= make_date(extract(year FROM p_data)::integer, 1, 1)
     AND h.data <  make_date(extract(year FROM p_data)::integer + 1, 1, 1)
     AND h.estado <> 'rejeitada'
     AND (p_excluir_id IS NULL OR h.id <> p_excluir_id);
  v_ano_min := public.hr_horas_extra_limite_anual_min(p_organization_id, p_data);
  RETURN (v_dia + p_minutos) > p_dia_min OR (v_ano + p_minutos) > v_ano_min;
END;
$$;

COMMENT ON FUNCTION public.hr_horas_extra_acima(uuid, uuid, date, integer, uuid, integer) IS
'INTERNA. Passa o limite do dia (p_dia_min, de hr_horas_extra_config) ou o anual (he_limite_anual_min da regra salarial em vigor em p_data, ou 6000 min sem regra; ano civil)? Conta todas as linhas nao rejeitadas do dia e do ano, sem p_excluir_id. Desde 20270109700000.';

-- 3.4 As tres RPCs passam a chamar as assinaturas novas (troca de texto no
--     corpo do remoto; CREATE OR REPLACE via pg_get_functiondef mantem dono,
--     privilegios, SECURITY DEFINER, search_path e comentario).
DO $trocas$
DECLARE
  v_fn  text;
  v_def text;
  v_r   record;
BEGIN
  FOR v_fn IN SELECT DISTINCT t.fn FROM tmp_rc_trocas t
               WHERE t.fn <> 'public.hr_processamento_lancamento_imutavel_apos_anular()' ORDER BY 1 LOOP
    v_def := pg_get_functiondef(to_regprocedure(v_fn)::oid);
    FOR v_r IN SELECT * FROM tmp_rc_trocas t WHERE t.fn = v_fn ORDER BY t.ordem LOOP
      v_def := replace(v_def, v_r.ancora, v_r.novo);
    END LOOP;
    EXECUTE v_def;
  END LOOP;
END;
$trocas$;

-- 3.5 Saldo: o limite do ano pedido (regra de hoje no ano corrente; de 31/12
--     nos outros); sem regra, 6000 min (origem omissao).
CREATE OR REPLACE FUNCTION public.rpc_hr_horas_extra_saldo(p_organization_id uuid, p_pessoa_id uuid, p_ano integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pessoa uuid;
  v_hoje   date := public.hr_horas_extra_hoje();
  v_ano    integer;
  v_ref    date;
  v_cfg    record;
  v_ctx    record;
  v_conf   integer;
  v_pend   integer;
  v_total  integer;
BEGIN
  v_pessoa := public.hr_horas_extra_ambito_leitura(p_organization_id, p_pessoa_id);
  v_ano := coalesce(p_ano, extract(year FROM v_hoje)::integer);
  IF v_pessoa IS NULL OR v_ano < 2000 OR v_ano > 2100 THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;
  PERFORM 1 FROM public.pessoas p
   WHERE p.id = v_pessoa AND p.organization_id = p_organization_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  v_ref := CASE WHEN v_ano = extract(year FROM v_hoje)::integer THEN v_hoje ELSE make_date(v_ano, 12, 31) END;
  SELECT * INTO v_cfg FROM public.hr_horas_extra_config_efetiva(p_organization_id);
  SELECT * INTO v_ctx FROM public.hr_horas_extra_pessoa_ctx(p_organization_id, v_pessoa, v_ref);

  SELECT coalesce(sum(x.minutos) FILTER (WHERE x.estado = 'confirmada'), 0)::integer,
         coalesce(sum(x.minutos) FILTER (WHERE x.estado = 'pendente'), 0)::integer
    INTO v_conf, v_pend
    FROM public.pessoas_horas_extra x
   WHERE x.organization_id = p_organization_id
     AND x.pessoa_id = v_pessoa
     AND x.data >= make_date(v_ano, 1, 1)
     AND x.data <  make_date(v_ano + 1, 1, 1);
  v_total := v_conf + v_pend;

  RETURN jsonb_build_object(
    'pessoa_id', v_pessoa,
    'ano', v_ano,
    'total_ano_min', v_total,
    'confirmadas_min', v_conf,
    'pendentes_min', v_pend,
    'limite_ano_min', v_ctx.limite_min,
    'limite_ano_origem', v_ctx.limite_origem,
    'limite_dia_min', v_cfg.dia_min,
    'alerta_pct', v_cfg.alerta_pct,
    'em_alerta', coalesce((v_total::bigint * 100) >= (v_ctx.limite_min::bigint * v_cfg.alerta_pct), false),
    'acima_limite', coalesce(v_total > v_ctx.limite_min, false),
    'restante_min', CASE WHEN v_ctx.limite_min IS NULL THEN NULL ELSE greatest(0, v_ctx.limite_min - v_total) END);
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_horas_extra_saldo(uuid, uuid, integer) IS
'RH ou a propria pessoa (authenticated). Saldo do ano (omissao: o corrente em Lisboa): {pessoa_id, ano, total_ano_min, confirmadas_min, pendentes_min, limite_ano_min, limite_ano_origem (regra|omissao), limite_dia_min, alerta_pct, em_alerta, acima_limite, restante_min}. O limite anual e o da regra salarial em vigor hoje (ano corrente) ou a 31/12 do ano pedido; sem regra, 6000 min (origem omissao). Rejeitadas nunca contam. Recusas: 42501, pedido_invalido HRA10, nao_encontrado HRA31. Desde 20270109700000.';

-- 3.6 Largar as assinaturas antigas.
DROP FUNCTION public.hr_horas_extra_pessoa_ctx(uuid, uuid, integer);
DROP FUNCTION public.hr_horas_extra_acima(uuid, uuid, date, integer, uuid, integer, integer);

-- 3.7 Privilegios: internas sem EXECUTE para ninguem; o saldo so authenticated.
REVOKE ALL ON FUNCTION public.hr_horas_extra_limite_anual_min(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_pessoa_ctx(uuid, uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_acima(uuid, uuid, date, integer, uuid, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_horas_extra_saldo(uuid, uuid, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_horas_extra_saldo(uuid, uuid, integer) TO authenticated;


-- ==============================================================================
-- 4. Conferir (estrutura, privilegios, trocas e comportamento na nike, desfeito)
-- ==============================================================================
DO $conferir$
DECLARE
  k_nike      constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  k_novo      constant text := 'public.rpc_hr_processamento_lancamento_criar(uuid, uuid, text, numeric, uuid, text, numeric)';
  v_r         record;
  v_new       record;
  v_esperado  text;
  v_n         integer;
  v_lista     text;
  v_uid       uuid;
  v_pid       uuid;
  v_per       uuid;
  v_id        uuid;
  v_row       public.hr_processamento_lancamentos%ROWTYPE;
  v_msg       text;
  v_ctx       record;
  v_regra     jsonb;
  v_resultado text;
BEGIN
  -- 4.1 Assinaturas: a antiga largada, a nova unica; ctx e acima so as novas.
  IF to_regprocedure('public.rpc_hr_processamento_lancamento_criar(uuid, uuid, text, numeric, uuid)') IS NOT NULL
     OR to_regprocedure(k_novo) IS NULL
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname::text = 'public' AND p.proname::text = 'rpc_hr_processamento_lancamento_criar') <> 1 THEN
    RAISE EXCEPTION 'Conferir: rpc_hr_processamento_lancamento_criar devia existir so com a assinatura nova.';
  END IF;
  IF to_regprocedure('public.hr_horas_extra_pessoa_ctx(uuid, uuid, integer)') IS NOT NULL
     OR to_regprocedure('public.hr_horas_extra_acima(uuid, uuid, date, integer, uuid, integer, integer)') IS NOT NULL
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname::text = 'public'
            AND p.proname::text IN ('hr_horas_extra_pessoa_ctx', 'hr_horas_extra_acima')) <> 2 THEN
    RAISE EXCEPTION 'Conferir: hr_horas_extra_pessoa_ctx e hr_horas_extra_acima deviam existir so com as assinaturas novas.';
  END IF;

  -- 4.2 SECURITY DEFINER e search_path vazio na RPC nova; privilegios por aclexplode.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(k_novo)::oid AND p.prosecdef
                    AND coalesce(array_to_string(p.proconfig, ','), '') IN ('search_path=""', 'search_path=')) THEN
    RAISE EXCEPTION 'Conferir: a RPC nova devia ser SECURITY DEFINER com search_path vazio.';
  END IF;
  FOR v_r IN
    SELECT f.fn, f.authenticated
      FROM (VALUES (k_novo, true),
                   ('public.rpc_hr_horas_extra_saldo(uuid, uuid, integer)', true),
                   ('public.hr_horas_extra_limite_anual_min(uuid, date)', false),
                   ('public.hr_horas_extra_pessoa_ctx(uuid, uuid, date)', false),
                   ('public.hr_horas_extra_acima(uuid, uuid, date, integer, uuid, integer)', false)) AS f(fn, authenticated)
  LOOP
    SELECT string_agg(CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ',') INTO v_lista
      FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = to_regprocedure(v_r.fn)::oid
       AND a.privilege_type::text = 'EXECUTE'
       AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon', 'authenticated', 'service_role'));
    v_esperado := CASE WHEN v_r.authenticated THEN 'authenticated' ELSE '' END;
    IF coalesce(v_lista, '') IS DISTINCT FROM v_esperado THEN
      RAISE EXCEPTION 'Conferir: EXECUTE em % devia ser so "%", e "%".',
        v_r.fn, v_esperado, coalesce(v_lista, '');
    END IF;
  END LOOP;

  -- 4.3 Tabela: colunas, CHECK, RLS forcada; authenticated sem escrita.
  IF NOT (SELECT c.relrowsecurity AND c.relforcerowsecurity FROM pg_class c
           WHERE c.oid = to_regclass('public.hr_processamento_lancamentos')) THEN
    RAISE EXCEPTION 'Conferir: hr_processamento_lancamentos devia ter RLS ligada e forcada.';
  END IF;
  IF has_table_privilege('authenticated', 'public.hr_processamento_lancamentos', 'INSERT')
     OR has_table_privilege('authenticated', 'public.hr_processamento_lancamentos', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.hr_processamento_lancamentos', 'DELETE')
     OR has_table_privilege('anon', 'public.hr_processamento_lancamentos', 'SELECT') THEN
    RAISE EXCEPTION 'Conferir: authenticated escreve ou anon le hr_processamento_lancamentos.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hr_processamento_lancamentos l WHERE l.tipo <> 'manual' OR l.quantidade IS NOT NULL) THEN
    RAISE EXCEPTION 'Conferir: as linhas existentes deviam ficar manual sem quantidade.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.hr_processamento_lancamentos') AND c.contype::text = 'c'
     AND c.conname::text IN ('hr_processamento_lancamentos_tipo_valido',
                             'hr_processamento_lancamentos_quantidade_coerente',
                             'hr_processamento_lancamentos_quantidade_intervalo');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Conferir: faltam CHECK de tipo/quantidade (% de 3).', v_n;
  END IF;

  -- 4.4 As trocas: corpo novo = corpo antigo com as trocas; o resto igual.
  FOR v_r IN SELECT * FROM tmp_rc_antes ORDER BY fn LOOP
    v_esperado := v_r.prosrc;
    FOR v_new IN SELECT * FROM tmp_rc_trocas t WHERE t.fn = v_r.fn ORDER BY t.ordem LOOP
      v_esperado := replace(v_esperado, v_new.ancora, v_new.novo);
    END LOOP;
    SELECT p.prosrc, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') AS proconfig,
           coalesce(p.proacl::text, '') AS proacl
      INTO v_new FROM pg_proc p WHERE p.oid = to_regprocedure(v_r.fn)::oid;
    IF replace(v_new.prosrc, chr(13), '') IS DISTINCT FROM replace(v_esperado, chr(13), '')
       OR v_new.prosecdef IS DISTINCT FROM v_r.prosecdef
       OR v_new.proconfig IS DISTINCT FROM v_r.proconfig
       OR v_new.proacl IS DISTINCT FROM v_r.proacl THEN
      RAISE EXCEPTION 'Conferir: % mudou mais do que as trocas (corpo, SECURITY DEFINER, search_path ou privilegios).', v_r.fn;
    END IF;
    IF v_new.prosrc LIKE '%v_cfg.ano_min%' OR v_new.prosrc LIKE '%v_ctx.limite_min)%' THEN
      RAISE EXCEPTION 'Conferir: % ainda passa o limite anual antigo.', v_r.fn;
    END IF;
  END LOOP;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND p.proname::text IN ('hr_horas_extra_pessoa_ctx', 'hr_horas_extra_acima', 'rpc_hr_horas_extra_saldo')
     AND (p.prosrc LIKE '%horas\_anuais\_maximas%' OR p.prosrc LIKE '%v\_cfg.ano\_min%');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'Conferir: ainda leem horas_anuais_maximas ou ano_min: %.', v_lista;
  END IF;

  -- 4.5 Comportamento na nike, em 2099, DESFEITO no fim (sentinela HRC00).
  BEGIN
    SELECT p.id INTO v_pid FROM public.pessoas p
     WHERE p.organization_id = k_nike AND p.deleted_at IS NULL ORDER BY p.id LIMIT 1;
    SELECT au.auth_user_id INTO v_uid
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND public.has_anew_permission_in_org(au.auth_user_id, 'hr.processamento.lancamentos.gerir', k_nike)
     ORDER BY au.id
     LIMIT 1;
    IF v_pid IS NULL OR v_uid IS NULL THEN
      RAISE EXCEPTION 'Conferir: na nike falta uma pessoa (%) ou um utilizador activo com hr.processamento.lancamentos.gerir (%).',
        coalesce(v_pid::text, 'nenhuma'), coalesce(v_uid::text, 'nenhum');
    END IF;

    -- Regra conhecida desde 2099-05-01: km 0,40, ajudas 65,89, limite 4321 min.
    v_regra := jsonb_build_object(
      'subsidio_limite_min', 300, 'subsidio_valor_hora', 0.76, 'subsidio_valor_dia', 6.15,
      'he_pct_dia_util', 50, 'he_pct_feriado', 75, 'he_pct_descanso', 100, 'he_limite_anual_min', 4321,
      'iht_pct', 25, 'km_valor', 0.40, 'ajudas_custo_dia', 65.89, 'noturnas', '[]'::jsonb);
    PERFORM public.hr_regras_salariais_guardar_core(k_nike, DATE '2099-05-01', v_regra, NULL);

    INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, data_inicio, data_fim)
    VALUES (k_nike, 2099, 5, 'aberto', DATE '2099-05-01', DATE '2099-05-31')
    RETURNING id INTO v_per;

    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

    -- a) sem direito: km recusado.
    DELETE FROM public.pessoas_direitos_salariais d WHERE d.pessoa_id = v_pid;
    v_msg := NULL;
    BEGIN
      PERFORM public.rpc_hr_processamento_lancamento_criar(v_per, v_pid, NULL, NULL, NULL, 'km', 100);
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF v_msg IS NULL OR position('lancamento_sem_direito' IN v_msg) <> 1 THEN
      RAISE EXCEPTION 'Conferir: km sem direito nao foi recusado (%).', coalesce(v_msg, 'aceite');
    END IF;

    -- b) com direito a km: 100 x 0,40 = 40,00, gravado com tipo e quantidade.
    INSERT INTO public.pessoas_direitos_salariais (pessoa_id, organization_id, km) VALUES (v_pid, k_nike, true);
    v_id := public.rpc_hr_processamento_lancamento_criar(v_per, v_pid, NULL, NULL, NULL, 'km', 100);
    SELECT * INTO v_row FROM public.hr_processamento_lancamentos l WHERE l.id = v_id;
    IF v_row.valor IS DISTINCT FROM 40.00::numeric OR v_row.tipo IS DISTINCT FROM 'km'
       OR v_row.quantidade IS DISTINCT FROM 100::numeric OR v_row.organization_id IS DISTINCT FROM k_nike THEN
      RAISE EXCEPTION 'Conferir: km 100 x 0,40 devia dar 40,00; deu valor % tipo % quantidade %.',
        v_row.valor, v_row.tipo, v_row.quantidade;
    END IF;
    v_resultado := 'km 100 x 0,40 = ' || v_row.valor::text;

    -- c) ajudas sem esse direito (so km): recusado; valor vindo do cliente: recusado.
    v_n := 0;
    BEGIN PERFORM public.rpc_hr_processamento_lancamento_criar(v_per, v_pid, NULL, NULL, NULL, 'ajudas', 2);
    EXCEPTION WHEN OTHERS THEN IF position('lancamento_sem_direito' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN PERFORM public.rpc_hr_processamento_lancamento_criar(v_per, v_pid, 'x', 999, NULL, 'km', 100);
    EXCEPTION WHEN OTHERS THEN IF position('lancamento_valor_nao_aceite' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN PERFORM public.rpc_hr_processamento_lancamento_criar(v_per, v_pid, NULL, NULL, NULL, 'km', 0);
    EXCEPTION WHEN OTHERS THEN IF position('lancamento_quantidade_invalida' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    BEGIN PERFORM public.rpc_hr_processamento_lancamento_criar(v_per, v_pid, 'x', 10, NULL, 'outro', NULL);
    EXCEPTION WHEN OTHERS THEN IF position('lancamento_tipo_invalido' IN SQLERRM) = 1 THEN v_n := v_n + 1; END IF; END;
    IF v_n <> 4 THEN
      RAISE EXCEPTION 'Conferir: das 4 recusas (ajudas sem direito, valor do cliente, quantidade 0, tipo invalido) so % deram o erro certo.', v_n;
    END IF;

    -- d) manual com a chamada antiga por posicao (5 argumentos): continua igual.
    v_id := public.rpc_hr_processamento_lancamento_criar(v_per, v_pid, 'Premio teste', 12.345, NULL);
    SELECT * INTO v_row FROM public.hr_processamento_lancamentos l WHERE l.id = v_id;
    IF v_row.valor IS DISTINCT FROM 12.35::numeric OR v_row.tipo IS DISTINCT FROM 'manual' OR v_row.quantidade IS NOT NULL THEN
      RAISE EXCEPTION 'Conferir: o lancamento manual devia ficar 12,35 manual sem quantidade.';
    END IF;

    -- e) tipo e quantidade imutaveis.
    v_msg := NULL;
    BEGIN
      UPDATE public.hr_processamento_lancamentos SET quantidade = 1 WHERE id = v_id;
    EXCEPTION WHEN OTHERS THEN v_msg := SQLERRM;
    END;
    IF v_msg IS NULL THEN
      RAISE EXCEPTION 'Conferir: mudar a quantidade de um lancamento foi aceite.';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

    -- f) limite anual lido da regra (4321 em 2099), NULL antes da primeira regra.
    SELECT * INTO v_ctx FROM public.hr_horas_extra_pessoa_ctx(k_nike, v_pid, DATE '2099-06-01');
    IF v_ctx.limite_min IS DISTINCT FROM 4321 OR v_ctx.limite_origem IS DISTINCT FROM 'regra' THEN
      RAISE EXCEPTION 'Conferir: o limite anual a 01/06/2099 devia ser 4321 (regra); deu % (%).', v_ctx.limite_min, v_ctx.limite_origem;
    END IF;
    SELECT * INTO v_ctx FROM public.hr_horas_extra_pessoa_ctx(k_nike, v_pid, DATE '1999-12-31');
    IF v_ctx.limite_min IS DISTINCT FROM 6000 OR v_ctx.limite_origem IS DISTINCT FROM 'omissao' THEN
      RAISE EXCEPTION 'Conferir: antes da primeira regra o limite devia ser 6000 (omissao); deu % (%).', v_ctx.limite_min, v_ctx.limite_origem;
    END IF;
    IF public.hr_horas_extra_acima(k_nike, v_pid, DATE '1999-12-31', 6000, NULL, 100000)
       OR NOT public.hr_horas_extra_acima(k_nike, v_pid, DATE '1999-12-31', 6001, NULL, 100000) THEN
      RAISE EXCEPTION 'Conferir: sem regra, hr_horas_extra_acima devia usar 6000 (6000 nao passa, 6001 passa).';
    END IF;
    IF public.hr_horas_extra_acima(k_nike, v_pid, DATE '2099-06-01', 4321, NULL, 100000)
       OR NOT public.hr_horas_extra_acima(k_nike, v_pid, DATE '2099-06-01', 4322, NULL, 100000) THEN
      RAISE EXCEPTION 'Conferir: hr_horas_extra_acima devia usar o limite 4321 da regra (4321 nao passa, 4322 passa).';
    END IF;
    v_resultado := v_resultado || '; limite anual da regra = ' || v_ctx.limite_min::text;

    RAISE EXCEPTION 'teste_regras_calculo_ok' USING ERRCODE = 'HRC00';
  EXCEPTION
    WHEN SQLSTATE 'HRC00' THEN
      NULL; -- sucesso: tudo o que o bloco escreveu na nike foi desfeito.
  END;

  IF EXISTS (SELECT 1 FROM public.hr_periodos_processamento pp WHERE pp.organization_id = k_nike AND pp.ano = 2099 AND pp.mes = 5)
     OR EXISTS (SELECT 1 FROM public.hr_regras_salariais r WHERE r.organization_id = k_nike AND r.valido_de = DATE '2099-05-01') THEN
    RAISE EXCEPTION 'Conferir: o teste deixou linhas na nike.';
  END IF;

  RAISE NOTICE 'Conferido: lancamentos km/ajudas com quantidade e valor da regra (100 x 0,40 = 40,00), recusa sem direito, valor do cliente recusado, assinatura antiga largada, limite anual das horas extra lido da regra salarial.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes, a partir do
--    worktree rh-pessoas (project-ref uetjghdkwbywbftedtth): so este ficheiro
--    pendente, com carimbo acima do maximo do remoto (renomear se preciso).
-- 2. Prova na nike ANTES do push: correr este ficheiro inteiro numa transaccao
--    terminada por um RAISE EXCEPTION 'RESULTADO ...' (desfaz tudo); as
--    guardas G3-G5 confirmam os corpos do remoto, o conferir prova o resto.
-- 3. O cliente (useProcessamentoLancamentos com p_tipo/p_quantidade, ecra de
--    km e ajudas, HorasExtraDaPessoa com a origem 'regra') entra no mesmo envio.
-- ==============================================================================
