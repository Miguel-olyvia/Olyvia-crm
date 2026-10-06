-- ==============================================================================
-- O salario de um cargo passa a mudar so por uma funcao, com data de efeito e
-- motivo, e a subida chega a todas as pessoas que tem o cargo -- sem perder o
-- historico.
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO NO MESMO COMMIT: useCargos.editar deixa de enviar
-- salario_base e periodicidade; o salario muda por definirSalario, que chama
-- rpc_hr_cargo_definir_salario. Com o codigo antigo, EDITAR um cargo e mudar-lhe
-- o salario ou a periodicidade passa a falhar com HRC01 (cargo_salario_so_por_
-- periodos); editar so o nome ou as horas continua a funcionar.
--
-- TAMBEM PARA A UI, nesta migration (salarios so a quem tem
-- hr.pessoas.retribuicao.view):
--   - hr_cargos: authenticated PERDE o SELECT das colunas salario_base e
--     periodicidade (o resto continua legivel por quem tem laborais.view). Um
--     select("*") ou um insert/update com .select() que devolva essas colunas
--     passa a falhar com "permission denied". O salario de um cargo le-se de
--     hr_cargos_periodos (so com retribuicao.view; sem ela, zero linhas).
--   - Criar um cargo com salario diferente de 0 exige hr.cargos.salario.alterar
--     (trigger de INSERT); sem ela, o cargo cria-se com salario 0 e quem tem a
--     permissao define o salario depois.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Editar o salario de um cargo apagava o valor antigo e nao dizia quantas
-- pessoas afectava. Com o salario base a vir SO do cargo (20261210120000), uma
-- mudanca no cargo e uma mudanca no salario de todas as pessoas que o tem: tem
-- de ter data, motivo, historico, e uma permissao propria.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- 1. Um trigger BEFORE UPDATE OF salario_base, periodicidade em hr_cargos
--    recusa a mudanca (HRC01) sempre que a GUC de transaccao
--    hr.cargo_salario_via_rpc nao esta ligada. hr_cargos.salario_base e
--    periodicidade passam a ser CACHE do periodo mais recente de
--    hr_cargos_periodos (que pode ser um periodo futuro, se a subida esta
--    agendada): quem quiser o salario de hoje le os periodos.
--    As colunas de salario deixam de ser legiveis por authenticated (ver 1b).
--
-- 2. hr_cargo_definir_salario_core (interna): valida, fecha o periodo mais
--    recente na data de efeito e abre o novo (ou, se a data for a de uma subida
--    ja agendada, CORRIGE essa subida), actualiza a cache e refaz as
--    retribuicoes de cada pessoa com o cargo (hr_retribuicao_refazer_desde, de
--    20261210120000) a partir da data. Uma excepcao desfaz tudo: ou sobem
--    todas, ou nenhuma. As versoes futuras de origem pessoa sao preservadas.
--
-- 3. rpc_hr_cargo_definir_salario: gate hr.cargos.salario.alterar na
--    organizacao do cargo.
--
-- DECISAO D3 (datas): a subida so pode ser de hoje para a frente (HRC05); as
-- subidas retroactivas ficam para quando o processamento (fluxo 10) souber
-- tratar acertos e meses fechados. Tambem nunca mais de 5 anos para a frente, e
-- o motivo tem de ter entre 3 e 500 caracteres.
--
-- REVISAO:
--  - Locks FOR NO KEY UPDATE, cargo antes das pessoas (sem impasse com mudar o
--    cargo de uma pessoa).
--  - Corrigir o PRIMEIRO periodo do cargo muda o salario "desde sempre": as
--    pessoas refazem-se desde a primeira linha de cargo, e havendo retribuicao ja
--    em vigor a correccao e recusada (HRC06) -- nunca fica o historico incoerente.
--  - Cancelar uma subida agendada voltando ao valor anterior (mesma data, valor
--    antigo) funciona: os trocos iguais deixam de se juntar atravessando o
--    inicio de um periodo (20261210120000).
--  - Corrigir uma subida agendada deixa o valor antigo e quem corrigiu em
--    hr_cargos_correcoes; fechar um periodo regista updated_by.
--  - rpc_hr_cargo_definir_salario: cargo inexistente e falta de permissao dao a
--    mesma resposta (42501).
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nao se toca em nenhuma versao de retribuicao existente fora das pessoas do
--   cargo, nem em versoes ja em vigor (HRC06 e so uma rede contra corridas).
-- - Nao se muda a atribuicao da permissao a papeis (ver 20261210100000, D1).
-- - Nao se corrige uma subida que ja esta em vigor: com data de hoje em diante
--   abre-se sempre um periodo novo. Agendar uma subida antes de outra ja
--   agendada (data anterior ao inicio do periodo mais recente) recusa-se
--   (HRC04); para corrigir uma subida agendada usa-se a data exacta dela.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TRIGGER IF EXISTS trg_hr_cargos_salario_so_por_periodos ON public.hr_cargos;
--   DROP FUNCTION IF EXISTS public.hr_cargos_salario_so_por_periodos();
--   DROP TRIGGER IF EXISTS trg_hr_cargos_salario_so_com_permissao ON public.hr_cargos;
--   DROP FUNCTION IF EXISTS public.hr_cargos_salario_so_com_permissao();
--   GRANT SELECT ON TABLE public.hr_cargos TO authenticated;   -- repoe as colunas de salario
--   DROP FUNCTION IF EXISTS public.rpc_hr_cargo_definir_salario(uuid, numeric, text, date, text);
--   DROP FUNCTION IF EXISTS public.hr_cargo_definir_salario_core(uuid, numeric, text, date, text, uuid);
--
--
-- Prerequisitos:
--   20261210100000  hr_cargos_periodos, hr.cargos.salario.alterar
--   20261210110000  pessoas_cargos
--   20261210120000  hr_retribuicao_refazer_desde
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.hr_cargos_periodos') IS NULL
     OR to_regprocedure('public.hr_cargo_salario_em(uuid,date)') IS NULL THEN
    RAISE EXCEPTION 'hr_cargos_periodos ou hr_cargo_salario_em nao existem. Aplicar 20261210100000 primeiro.';
  END IF;

  IF to_regclass('public.pessoas_cargos') IS NULL THEN
    RAISE EXCEPTION 'pessoas_cargos nao existe. Aplicar 20261210110000 primeiro.';
  END IF;

  IF to_regprocedure('public.hr_retribuicao_refazer_desde(uuid,date,jsonb,text,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'hr_retribuicao_refazer_desde nao existe. Aplicar 20261210120000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.cargos.salario.alterar') THEN
    RAISE EXCEPTION 'hr.cargos.salario.alterar nao esta no catalogo. Aplicar 20261210100000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. O salario de hr_cargos so muda pela funcao propria
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_cargos_salario_so_por_periodos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF (NEW.salario_base IS DISTINCT FROM OLD.salario_base
      OR NEW.periodicidade IS DISTINCT FROM OLD.periodicidade)
     AND coalesce(current_setting('hr.cargo_salario_via_rpc', true), 'off') <> 'on' THEN
    RAISE EXCEPTION
      'cargo_salario_so_por_periodos: o salario e a periodicidade de um cargo mudam so pela funcao de definir o salario do cargo (com data de efeito e motivo), para ficarem no historico de periodos. Nao se editam directamente.'
      USING ERRCODE = 'HRC01';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_cargos_salario_so_por_periodos() IS
'BEFORE UPDATE OF salario_base, periodicidade em hr_cargos: recusa (HRC01) a mudanca de qualquer das duas colunas fora de hr_cargo_definir_salario_core, que liga a GUC de transaccao hr.cargo_salario_via_rpc. Um UPDATE que reenvia os mesmos valores passa.';

DROP TRIGGER IF EXISTS trg_hr_cargos_salario_so_por_periodos ON public.hr_cargos;
CREATE TRIGGER trg_hr_cargos_salario_so_por_periodos
  BEFORE UPDATE OF salario_base, periodicidade ON public.hr_cargos
  FOR EACH ROW EXECUTE FUNCTION public.hr_cargos_salario_so_por_periodos();

COMMENT ON COLUMN public.hr_cargos.salario_base IS
'CACHE do salario base do periodo MAIS RECENTE de hr_cargos_periodos (que pode comecar no futuro, se a subida esta agendada). Desde 20261210130000 so muda por hr_cargo_definir_salario_core (HRC01 em qualquer outro UPDATE). O salario que vale numa data le-se dos periodos (hr_cargos_periodos), nunca desta coluna. Quem tem o cargo ganha o salario do cargo nessa data: pessoas_retribuicoes e refeita pela funcao de definir o salario.';
COMMENT ON COLUMN public.hr_cargos.periodicidade IS
'CACHE da periodicidade do periodo MAIS RECENTE de hr_cargos_periodos. Mesmas regras de hr_cargos.salario_base (20261210130000).';

-- ==============================================================================
-- 1b. SALARIOS SO A QUEM TEM hr.pessoas.retribuicao.view, e criar um cargo com
--     salario so a quem tem hr.cargos.salario.alterar.
--
--     (i) hr_cargos: authenticated deixa de ter SELECT das colunas salario_base e
--     periodicidade. Quem so tem laborais.view le o cargo (nome, activo, horas)
--     mas nao o salario: de outro modo, laborais.view (que ve o cargo de cada
--     pessoa) ficava a saber o salario de toda a gente. Revoga-se a tabela e
--     concede-se coluna a coluna (um REVOKE por coluna nao faz nada enquanto
--     existir GRANT ao nivel da tabela). Uma concessao por coluna NAO cobre
--     colunas futuras: o conferir compara as colunas concedidas com as da tabela.
--     O salario de um cargo le-se de hr_cargos_periodos (retribuicao.view).
--
--     (ii) Um INSERT de authenticated em hr_cargos com salario_base <> 0 exige
--     hr.cargos.salario.alterar (senao atribuir um cargo recem-criado contornava
--     a permissao perigosa). Sem sessao de utilizador (migration, service_role) ou
--     com a GUC das funcoes do modulo, passa. Salario 0 passa sempre.
-- ==============================================================================
REVOKE SELECT ON TABLE public.hr_cargos FROM authenticated;
GRANT SELECT (id, organization_id, nome, horas_referencia, activo,
              deleted_at, deleted_by, created_at, updated_at, created_by, updated_by)
  ON TABLE public.hr_cargos TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_cargos_salario_so_com_permissao()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.salario_base IS NOT NULL AND NEW.salario_base <> 0
     AND auth.uid() IS NOT NULL
     AND coalesce(current_setting('hr.cargo_salario_via_rpc', true), 'off') <> 'on'
     AND NOT public.has_anew_permission_in_org(auth.uid(), 'hr.cargos.salario.alterar', NEW.organization_id) THEN
    RAISE EXCEPTION 'insufficient_privilege: criar um cargo com salario exige hr.cargos.salario.alterar. Sem ela o cargo cria-se com salario 0 e quem tem a permissao define o salario depois.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_cargos_salario_so_com_permissao() IS
'BEFORE INSERT em hr_cargos: com sessao de utilizador e fora das funcoes do modulo (GUC hr.cargo_salario_via_rpc), um salario_base diferente de 0 exige hr.cargos.salario.alterar na organizacao do cargo (42501). Salario 0 passa. Sem sessao (migration, service_role) nao actua.';

DROP TRIGGER IF EXISTS trg_hr_cargos_salario_so_com_permissao ON public.hr_cargos;
CREATE TRIGGER trg_hr_cargos_salario_so_com_permissao
  BEFORE INSERT ON public.hr_cargos
  FOR EACH ROW EXECUTE FUNCTION public.hr_cargos_salario_so_com_permissao();

-- ==============================================================================
-- 2. hr_cargo_definir_salario_core (interna)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_cargo_definir_salario_core(
  p_cargo_id       uuid,
  p_salario_base   numeric,
  p_periodicidade  text,
  p_valido_de      date,
  p_motivo         text,
  p_actor          uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_motivo_max   constant integer := 500;
  v_hoje         date := current_date;
  v_limite_futuro date := (current_date + interval '5 years')::date;
  v_org          uuid;
  v_sal          numeric(12,2);
  v_motivo       text;
  v_p            public.hr_cargos_periodos%ROWTYPE;
  v_primeiro     boolean;
  v_periodo_id   uuid;
  v_r            record;
  v_n            integer;
  v_actualizadas integer := 0;
  v_sem_retrib   integer := 0;
  v_falhadas     integer := 0;
  v_lista        text;
  v_nome         text;
  v_dica         text;
BEGIN
  -- 1. O cargo, com lock (serializa quem mexe no mesmo cargo). FOR NO KEY UPDATE:
  --    nao bloqueia as verificacoes de chave estrangeira de quem escreve em
  --    pessoas_cargos. Ordem de locks do modulo: o cargo ANTES das pessoas
  --    (rpc_hr_pessoa_mudar_cargo faz o mesmo), e as pessoas por ordem de id.
  SELECT c.organization_id INTO v_org
    FROM public.hr_cargos c
   WHERE c.id = p_cargo_id AND c.deleted_at IS NULL
     FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cargo_nao_encontrado: o cargo nao existe ou foi apagado.'
      USING ERRCODE = 'HRC02';
  END IF;

  v_motivo := btrim(coalesce(p_motivo, ''));

  IF p_salario_base IS NULL OR p_salario_base < 0 OR round(p_salario_base, 2) >= 10000000000 THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: o salario base tem de ser um valor entre 0 e 9999999999,99.'
      USING ERRCODE = 'HRC03';
  END IF;
  IF p_periodicidade IS NULL OR p_periodicidade NOT IN ('mensal', 'anual', 'hora') THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: a periodicidade do salario do cargo tem de ser mensal, anual ou hora.'
      USING ERRCODE = 'HRC03';
  END IF;
  IF char_length(v_motivo) < 3 THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: o motivo da alteracao do salario e obrigatorio (3 caracteres ou mais).'
      USING ERRCODE = 'HRC03';
  END IF;
  IF char_length(v_motivo) > c_motivo_max THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: o motivo da alteracao do salario nao pode ter mais de % caracteres.', c_motivo_max
      USING ERRCODE = 'HRC03';
  END IF;
  IF p_valido_de IS NULL THEN
    RAISE EXCEPTION 'data_invalida: a data de efeito do novo salario e obrigatoria.'
      USING ERRCODE = 'HRC04';
  END IF;
  IF p_valido_de < v_hoje THEN
    RAISE EXCEPTION 'cargo_periodo_no_passado: a subida so pode ser de hoje (%) para a frente. Subidas com data passada ficam para quando o processamento souber tratar acertos.',
      v_hoje
      USING ERRCODE = 'HRC05';
  END IF;
  IF p_valido_de > v_limite_futuro THEN
    RAISE EXCEPTION 'data_invalida: a data de efeito nao pode ser depois de % (maximo 5 anos para a frente).', v_limite_futuro
      USING ERRCODE = 'HRC04';
  END IF;

  v_sal := round(p_salario_base, 2);

  -- 2. O periodo mais recente do cargo.
  SELECT * INTO v_p
    FROM public.hr_cargos_periodos p
   WHERE p.cargo_id = p_cargo_id
   ORDER BY p.valido_de DESC
   LIMIT 1;
  IF NOT FOUND OR v_p.valido_ate IS NOT NULL THEN
    RAISE EXCEPTION 'data_invalida: o cargo nao tem um periodo de salario em aberto. Investigar hr_cargos_periodos antes de continuar.'
      USING ERRCODE = 'HRC04';
  END IF;

  IF p_valido_de < v_p.valido_de THEN
    RAISE EXCEPTION 'data_invalida: ja ha um periodo de salario que comeca em %. A data de efeito nao pode ser anterior; para o corrigir usar essa mesma data.',
      v_p.valido_de
      USING ERRCODE = 'HRC04';
  END IF;

  IF v_sal = v_p.salario_base AND p_periodicidade = v_p.periodicidade THEN
    RAISE EXCEPTION 'sem_alteracao: o salario e a periodicidade pedidos sao iguais aos do periodo mais recente do cargo.'
      USING ERRCODE = 'HRC07';
  END IF;

  -- Corrigir o PRIMEIRO periodo do cargo (o unico, e com a data dele) muda o
  -- salario "desde sempre": o primeiro valor de um cargo vale para todas as datas
  -- anteriores (hr_cargo_salario_em). Por isso as pessoas refazem-se desde a
  -- primeira linha de cargo, e se alguma tem retribuicao ja em vigor a
  -- correccao e recusada (HRC06) em vez de deixar o historico incoerente.
  v_primeiro := p_valido_de = v_p.valido_de
                AND NOT EXISTS (
                  SELECT 1 FROM public.hr_cargos_periodos q
                   WHERE q.cargo_id = p_cargo_id AND q.valido_de < v_p.valido_de);

  IF p_valido_de > v_p.valido_de THEN
    -- Fecha o periodo mais recente nesta data e abre o novo.
    UPDATE public.hr_cargos_periodos
       SET valido_ate = p_valido_de, updated_by = p_actor
     WHERE id = v_p.id;

    INSERT INTO public.hr_cargos_periodos
      (organization_id, cargo_id, salario_base, periodicidade, valido_de, motivo, created_by)
    VALUES
      (v_org, p_cargo_id, v_sal, p_periodicidade, p_valido_de, v_motivo, p_actor)
    RETURNING id INTO v_periodo_id;
  ELSE
    -- Mesma data: corrige a subida agendada (o periodo ainda nao comecou, ou
    -- comeca hoje). O valor antigo e quem corrigiu ficam em hr_cargos_correcoes
    -- (trigger de hr_cargos_periodos, que le updated_by).
    UPDATE public.hr_cargos_periodos
       SET salario_base = v_sal, periodicidade = p_periodicidade, motivo = v_motivo,
           updated_by = p_actor
     WHERE id = v_p.id;
    v_periodo_id := v_p.id;
  END IF;

  -- 3. A cache em hr_cargos (so por aqui).
  PERFORM set_config('hr.cargo_salario_via_rpc', 'on', true);
  UPDATE public.hr_cargos
     SET salario_base = v_sal, periodicidade = p_periodicidade, updated_by = p_actor
   WHERE id = p_cargo_id;
  PERFORM set_config('hr.cargo_salario_via_rpc', 'off', true);

  -- 4. Cada pessoa com este cargo, por ordem de pessoa_id (evita impasses). A
  --    pessoa que tem varias linhas deste cargo refaz-se uma so vez, a partir da
  --    primeira data em que o tem a partir de p_valido_de (ou, ao corrigir o
  --    primeiro periodo, desde a primeira linha, qualquer que seja).
  FOR v_r IN
    SELECT pc.pessoa_id,
           CASE WHEN v_primeiro THEN min(pc.valido_de)
                ELSE GREATEST(p_valido_de, min(pc.valido_de)) END AS desde
      FROM public.pessoas_cargos pc
      JOIN public.pessoas p ON p.id = pc.pessoa_id AND p.deleted_at IS NULL
     WHERE pc.cargo_id = p_cargo_id
       AND (v_primeiro OR pc.valido_ate IS NULL OR pc.valido_ate > p_valido_de)
     GROUP BY pc.pessoa_id
     ORDER BY pc.pessoa_id
  LOOP
    BEGIN
      v_n := public.hr_retribuicao_refazer_desde(
        v_r.pessoa_id, v_r.desde, NULL, 'subida_cargo',
        'Subida do cargo: ' || v_motivo, p_actor);

      IF v_n > 0 THEN
        v_actualizadas := v_actualizadas + 1;
      ELSE
        v_sem_retrib := v_sem_retrib + 1;
      END IF;
    EXCEPTION
      WHEN SQLSTATE 'HRC06' THEN
        v_falhadas := v_falhadas + 1;
        IF v_falhadas <= 5 THEN
          SELECT p.nome_completo INTO v_nome FROM public.pessoas p WHERE p.id = v_r.pessoa_id;
          v_lista := coalesce(v_lista || ', ', '') || coalesce(v_nome, 'pessoa sem nome');
        END IF;
    END;
  END LOOP;

  -- Uma so falha desfaz tudo (a excepcao reverte o periodo, a cache e as
  -- pessoas que ja tinham sido refeitas): ou sobem todas, ou nenhuma.
  IF v_falhadas > 0 THEN
    v_dica := CASE WHEN v_primeiro
                   THEN ' Corrigir o primeiro valor de um cargo muda o salario desde sempre, e reescrevia retribuicoes ja em vigor.'
                   ELSE '' END;
    RAISE EXCEPTION
      'alteracao_posterior_existe: a alteracao nao foi feita porque ha versoes de retribuicao ja em vigor que ela reescreveria: %.%',
      v_lista || CASE WHEN v_falhadas > 5 THEN ' e mais ' || (v_falhadas - 5)::text ELSE '' END,
      v_dica
      USING ERRCODE = 'HRC06';
  END IF;

  RETURN jsonb_build_object(
    'periodo_id',              v_periodo_id,
    'pessoas_actualizadas',    v_actualizadas,
    'pessoas_sem_retribuicao', v_sem_retrib
  );
END;
$$;

REVOKE ALL ON FUNCTION public.hr_cargo_definir_salario_core(uuid, numeric, text, date, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_cargo_definir_salario_core(uuid, numeric, text, date, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hr_cargo_definir_salario_core(uuid, numeric, text, date, text, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.hr_cargo_definir_salario_core(uuid, numeric, text, date, text, uuid) FROM service_role;

COMMENT ON FUNCTION public.hr_cargo_definir_salario_core(uuid, numeric, text, date, text, uuid) IS
'INTERNA (sem EXECUTE para ninguem excepto o dono; chamada so por rpc_hr_cargo_definir_salario, que faz o gate). Define o salario base e a periodicidade de um cargo a partir de p_valido_de (hoje ou futuro ate 5 anos, HRC05; motivo de 3 a 500 caracteres): fecha o periodo mais recente nessa data e abre o novo, ou corrige a subida agendada se a data for a dela (o valor antigo e quem corrigiu ficam em hr_cargos_correcoes); actualiza a cache de hr_cargos; refaz as retribuicoes de cada pessoa com o cargo desde essa data (as versoes futuras de origem pessoa sao preservadas). Corrigir o PRIMEIRO periodo do cargo muda o salario desde sempre: as pessoas refazem-se desde a primeira linha de cargo e, havendo retribuicao ja em vigor, a correccao e recusada (HRC06). Uma falha em qualquer pessoa desfaz tudo. Locks: cargo FOR NO KEY UPDATE e depois cada pessoa por ordem de id. Devolve jsonb: periodo_id, pessoas_actualizadas, pessoas_sem_retribuicao.';

-- ==============================================================================
-- 3. rpc_hr_cargo_definir_salario
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_cargo_definir_salario(
  p_cargo_id       uuid,
  p_salario_base   numeric,
  p_periodicidade  text,
  p_valido_de      date,
  p_motivo         text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_org    uuid;
  v_actor  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege: e preciso uma sessao autenticada.'
      USING ERRCODE = '42501';
  END IF;

  -- Cargo que nao existe e falta de permissao dao A MESMA resposta: quem nao tem
  -- acesso nao descobre se um uuid pertence a um cargo de outra organizacao.
  SELECT c.organization_id INTO v_org
    FROM public.hr_cargos c
   WHERE c.id = p_cargo_id AND c.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_privilege: o cargo nao existe, ou nao tem permissao para alterar o salario deste cargo (hr.cargos.salario.alterar).'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_uid, 'hr.cargos.salario.alterar', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege: o cargo nao existe, ou nao tem permissao para alterar o salario deste cargo (hr.cargos.salario.alterar).'
      USING ERRCODE = '42501';
  END IF;

  SELECT au.id INTO v_actor FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;

  RETURN public.hr_cargo_definir_salario_core(
    p_cargo_id, p_salario_base, p_periodicidade, p_valido_de, p_motivo, v_actor);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_cargo_definir_salario(uuid, numeric, text, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_cargo_definir_salario(uuid, numeric, text, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_cargo_definir_salario(uuid, numeric, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_cargo_definir_salario(uuid, numeric, text, date, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_cargo_definir_salario(uuid, numeric, text, date, text) IS
'Muda o salario base e a periodicidade de um cargo a partir de p_valido_de (hoje ou futuro, ate 5 anos), com motivo obrigatorio (3 a 500 caracteres), e refaz as retribuicoes de todas as pessoas que tem o cargo. Gate: hr.cargos.salario.alterar (perigosa) na organizacao do cargo; cargo inexistente e falta de permissao dao a mesma resposta (42501). Erros HRC03, HRC04, HRC05, HRC06, HRC07, HRC13 e 42501. Devolve jsonb: periodo_id, pessoas_actualizadas, pessoas_sem_retribuicao.';

-- ==============================================================================
-- Conferir. Estrutura + teste fabricado (organizacao, cargos e pessoas proprios;
-- a RPC publica tem gate e auth.uid() e nulo numa migration: testa-se o core, o
-- gate testa-se ao vivo). Bloco aninhado que TERMINA sempre em HR900.
-- ==============================================================================
DO $conferir$
DECLARE
  v_com_acesso text;
  v_sem_acesso text;
BEGIN
  -- 1. Estrutura
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_hr_cargos_salario_so_por_periodos'
       AND tgrelid = to_regclass('public.hr_cargos')
  ) THEN
    RAISE EXCEPTION 'O trigger trg_hr_cargos_salario_so_por_periodos nao ficou criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_hr_cargos_salario_so_com_permissao'
       AND tgrelid = to_regclass('public.hr_cargos')
  ) THEN
    RAISE EXCEPTION 'O trigger trg_hr_cargos_salario_so_com_permissao nao ficou criado.';
  END IF;

  -- Colunas de hr_cargos: authenticated le todas EXCEPTO salario_base e
  -- periodicidade. Uma coluna futura sem concessao aparece aqui e para o push.
  SELECT string_agg(a.attname, ', ' ORDER BY a.attname) INTO v_com_acesso
    FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.hr_cargos')
     AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname IN ('salario_base', 'periodicidade')
     AND has_column_privilege('authenticated', 'public.hr_cargos', a.attname, 'SELECT');
  IF v_com_acesso IS NOT NULL THEN
    RAISE EXCEPTION 'authenticated ainda consegue ler as colunas de salario de hr_cargos: %.', v_com_acesso;
  END IF;

  SELECT string_agg(a.attname, ', ' ORDER BY a.attname) INTO v_sem_acesso
    FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.hr_cargos')
     AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname NOT IN ('salario_base', 'periodicidade')
     AND NOT has_column_privilege('authenticated', 'public.hr_cargos', a.attname, 'SELECT');
  IF v_sem_acesso IS NOT NULL THEN
    RAISE EXCEPTION 'hr_cargos tem colunas que authenticated nao consegue ler (concessao por coluna nao cobre colunas futuras): %. Acrescentar ao GRANT SELECT da 1b.', v_sem_acesso;
  END IF;

  IF has_table_privilege('anon', 'public.hr_cargos', 'SELECT') THEN
    RAISE EXCEPTION 'hr_cargos: anon nao devia ter SELECT.';
  END IF;

  IF has_function_privilege('anon', 'public.rpc_hr_cargo_definir_salario(uuid,numeric,text,date,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_hr_cargo_definir_salario nao devia ser executavel por anon.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rpc_hr_cargo_definir_salario(uuid,numeric,text,date,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_hr_cargo_definir_salario devia ser executavel por authenticated.';
  END IF;
  IF has_function_privilege('anon', 'public.hr_cargo_definir_salario_core(uuid,numeric,text,date,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.hr_cargo_definir_salario_core(uuid,numeric,text,date,text,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.hr_cargo_definir_salario_core(uuid,numeric,text,date,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_cargo_definir_salario_core e interna: ninguem alem do dono devia poder executa-la.';
  END IF;

  -- 2. Teste fabricado
  DECLARE
    v_org      uuid;
    v_cargo    uuid;
    v_cargo2   uuid;
    v_ana      uuid;
    v_bruno    uuid;
    v_carla    uuid;
    v_dora     uuid;
    v_cargo5   uuid;
    v_cargo6   uuid;
    v_jo       uuid;
    v_msg1     text;
    v_msg2     text;
    v_hoje     date := current_date;
    v_res      jsonb;
    v_n        integer;
    v_linhas   integer;
    v_cache    numeric;
  BEGIN
    INSERT INTO public.anew_organizations (name)
    VALUES ('Teste migracao 20261210130000 (descartavel)')
    RETURNING id INTO v_org;

    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org, 'Cargo 1 20261210130000', 1000, 'mensal') RETURNING id INTO v_cargo;
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org, 'Cargo 2 20261210130000', 1100, 'mensal') RETURNING id INTO v_cargo2;

    -- Ana (0 por cento, subsidio 6,00) e Bruno (50 por cento, 7,50) com versoes
    -- abertas desde ha 60 dias; Carla sem retribuicao; Dora noutro cargo.
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org, 'Ana', 'Teste 20261210130000', v_cargo, v_hoje - 60) RETURNING id INTO v_ana;
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org, 'Bruno', 'Teste 20261210130000', v_cargo, v_hoje - 60) RETURNING id INTO v_bruno;
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org, 'Carla', 'Teste 20261210130000', v_cargo, v_hoje - 60) RETURNING id INTO v_carla;
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org, 'Dora', 'Teste 20261210130000', v_cargo2, v_hoje - 60) RETURNING id INTO v_dora;

    INSERT INTO public.pessoas_retribuicoes
      (pessoa_id, organization_id, valor_base, moeda, periodicidade,
       subsidio_alimentacao, subsidio_alimentacao_modo, duodecimos_pct, valido_de, valido_ate, motivo)
    VALUES
      (v_ana,   v_org, 1000, 'EUR', 'mensal', 6.00, 'dinheiro', 0,  v_hoje - 60, NULL, 'teste'),
      (v_bruno, v_org, 1000, 'EUR', 'mensal', 7.50, 'cartao',   50, v_hoje - 60, NULL, 'teste'),
      (v_dora,  v_org, 1100, 'EUR', 'mensal', NULL, NULL,       50, v_hoje - 60, NULL, 'teste');

    -- A. UPDATE directo do salario -> HRC01; mudar so o nome passa.
    BEGIN
      UPDATE public.hr_cargos SET salario_base = 1234 WHERE id = v_cargo;
      RAISE EXCEPTION 'Um UPDATE directo de hr_cargos.salario_base devia ter sido recusado.' USING ERRCODE = 'HR901';
    EXCEPTION
      WHEN SQLSTATE 'HRC01' THEN NULL;
    END;
    BEGIN
      UPDATE public.hr_cargos SET periodicidade = 'anual' WHERE id = v_cargo;
      RAISE EXCEPTION 'Um UPDATE directo de hr_cargos.periodicidade devia ter sido recusado.' USING ERRCODE = 'HR902';
    EXCEPTION
      WHEN SQLSTATE 'HRC01' THEN NULL;
    END;
    UPDATE public.hr_cargos SET nome = 'Cargo 1 renomeado 20261210130000' WHERE id = v_cargo;
    UPDATE public.hr_cargos SET salario_base = salario_base WHERE id = v_cargo;

    -- B. Uma escolha futura do Bruno (+40 dias, 100 por cento), ANTES da subida.
    v_n := public.hr_retribuicao_refazer_desde(
      v_bruno, v_hoje + 40,
      jsonb_build_object('vinculo_id', NULL, 'moeda', 'EUR', 'subsidio_alimentacao', 7.50,
                         'subsidio_alimentacao_modo', 'cartao', 'duodecimos_pct', 100),
      'pessoa', 'escolha futura', NULL);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'A escolha futura do Bruno devia criar 1 versao, criou %.', v_n USING ERRCODE = 'HR903';
    END IF;

    -- C. Subida de 1000 para 1050 em hoje + 30 (via core: aceite)
    v_res := public.hr_cargo_definir_salario_core(v_cargo, 1050, 'mensal', v_hoje + 30, 'teste subida', NULL);
    IF (v_res ->> 'pessoas_actualizadas')::integer <> 2 OR (v_res ->> 'pessoas_sem_retribuicao')::integer <> 1 THEN
      RAISE EXCEPTION 'A subida devia actualizar 2 pessoas (Ana e Bruno) e deixar 1 sem retribuicao (Carla); resultado: %.', v_res::text
        USING ERRCODE = 'HR904';
    END IF;

    SELECT c.salario_base INTO v_cache FROM public.hr_cargos c WHERE c.id = v_cargo;
    IF v_cache <> 1050 THEN
      RAISE EXCEPTION 'A cache hr_cargos.salario_base devia ser 1050 (periodo mais recente), e %.', v_cache USING ERRCODE = 'HR905';
    END IF;

    -- Ana: a versao antiga fechada na data com os valores antigos intactos, e
    -- a nova com 1050 e o subsidio e os duodecimos copiados.
    SELECT count(*) INTO v_linhas FROM public.pessoas_retribuicoes
     WHERE pessoa_id = v_ana AND deleted_at IS NULL AND valor_base = 1000
       AND valido_de = v_hoje - 60 AND valido_ate = v_hoje + 30
       AND duodecimos_pct = 0 AND subsidio_alimentacao = 6.00;
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION 'A versao antiga da Ana devia ter ficado fechada em hoje + 30 com 1000, 0 por cento e 6,00 (encontradas %).', v_linhas
        USING ERRCODE = 'HR906';
    END IF;
    SELECT count(*) INTO v_linhas FROM public.pessoas_retribuicoes
     WHERE pessoa_id = v_ana AND deleted_at IS NULL AND valor_base = 1050
       AND valido_de = v_hoje + 30 AND valido_ate IS NULL
       AND duodecimos_pct = 0 AND subsidio_alimentacao = 6.00
       AND subsidio_alimentacao_modo = 'dinheiro' AND origem = 'subida_cargo';
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION 'A Ana devia ter uma versao aberta desde hoje + 30 com 1050, 0 por cento, 6,00 e origem subida_cargo (encontradas %).', v_linhas
        USING ERRCODE = 'HR907';
    END IF;

    -- Bruno: a de +30 a +40 com 1050 e 50 por cento; a escolha pessoal de +40
    -- continua la, com 1050 e 100 por cento.
    SELECT count(*) INTO v_linhas FROM public.pessoas_retribuicoes
     WHERE pessoa_id = v_bruno AND deleted_at IS NULL AND valor_base = 1050
       AND valido_de = v_hoje + 30 AND valido_ate = v_hoje + 40
       AND duodecimos_pct = 50 AND subsidio_alimentacao = 7.50 AND origem = 'subida_cargo';
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION 'O Bruno devia ter uma versao de hoje + 30 a hoje + 40 com 1050 e 50 por cento (encontradas %).', v_linhas
        USING ERRCODE = 'HR908';
    END IF;
    SELECT count(*) INTO v_linhas FROM public.pessoas_retribuicoes
     WHERE pessoa_id = v_bruno AND deleted_at IS NULL AND valor_base = 1050
       AND valido_de = v_hoje + 40 AND valido_ate IS NULL
       AND duodecimos_pct = 100 AND origem = 'pessoa';
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION 'A escolha pessoal do Bruno a hoje + 40 devia continuar la com 1050 e 100 por cento (encontradas %).', v_linhas
        USING ERRCODE = 'HR909';
    END IF;

    -- D. Corrigir a subida (mesma data, 1060): refaz as duas.
    v_res := public.hr_cargo_definir_salario_core(v_cargo, 1060, 'mensal', v_hoje + 30, 'correccao', NULL);
    IF (v_res ->> 'pessoas_actualizadas')::integer <> 2 THEN
      RAISE EXCEPTION 'Corrigir a subida devia refazer 2 pessoas; resultado: %.', v_res::text USING ERRCODE = 'HR910';
    END IF;

    SELECT c.salario_base INTO v_cache FROM public.hr_cargos c WHERE c.id = v_cargo;
    IF v_cache <> 1060 THEN
      RAISE EXCEPTION 'Depois de corrigir, a cache devia ser 1060, e %.', v_cache USING ERRCODE = 'HR911';
    END IF;

    SELECT count(*) INTO v_linhas FROM public.pessoas_retribuicoes
     WHERE pessoa_id = v_ana AND deleted_at IS NULL AND valor_base = 1060
       AND valido_de = v_hoje + 30 AND valido_ate IS NULL AND origem = 'subida_cargo'
       AND duodecimos_pct = 0 AND subsidio_alimentacao = 6.00;
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION 'A Ana devia ter uma versao aberta desde hoje + 30 com 1060 (encontradas %).', v_linhas USING ERRCODE = 'HR912';
    END IF;

    SELECT count(*) INTO v_linhas FROM public.pessoas_retribuicoes
     WHERE pessoa_id = v_bruno AND deleted_at IS NULL AND valor_base = 1060
       AND ((valido_de = v_hoje + 30 AND valido_ate = v_hoje + 40 AND duodecimos_pct = 50)
         OR (valido_de = v_hoje + 40 AND valido_ate IS NULL AND duodecimos_pct = 100 AND origem = 'pessoa'));
    IF v_linhas <> 2 THEN
      RAISE EXCEPTION 'O Bruno devia ter 2 versoes futuras com 1060 (50 por cento de +30 a +40 e 100 por cento desde +40); encontradas %.', v_linhas
        USING ERRCODE = 'HR913';
    END IF;

    -- Os valores antigos continuam intactos (versoes de ha 60 dias).
    SELECT count(*) INTO v_linhas FROM public.pessoas_retribuicoes
     WHERE pessoa_id IN (v_ana, v_bruno) AND deleted_at IS NULL AND valor_base = 1000
       AND valido_de = v_hoje - 60 AND valido_ate = v_hoje + 30;
    IF v_linhas <> 2 THEN
      RAISE EXCEPTION 'As versoes antigas da Ana e do Bruno (1000) deviam estar intactas e fechadas em hoje + 30 (encontradas %).', v_linhas
        USING ERRCODE = 'HR914';
    END IF;

    -- Quem tem outro cargo nao foi tocado.
    SELECT count(*) INTO v_linhas FROM public.pessoas_retribuicoes
     WHERE pessoa_id = v_dora AND deleted_at IS NULL AND valor_base = 1100
       AND valido_de = v_hoje - 60 AND valido_ate IS NULL;
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION 'A Dora (outro cargo) nao devia ter sido tocada (encontradas %).', v_linhas USING ERRCODE = 'HR915';
    END IF;

    -- E. Data no passado -> HRC05
    BEGIN
      PERFORM public.hr_cargo_definir_salario_core(v_cargo, 1070, 'mensal', v_hoje - 1, 'teste', NULL);
      RAISE EXCEPTION 'Uma subida com data passada devia ter sido recusada.' USING ERRCODE = 'HR916';
    EXCEPTION
      WHEN SQLSTATE 'HRC05' THEN NULL;
    END;

    -- F. Valor e periodicidade iguais aos do periodo mais recente -> HRC07
    BEGIN
      PERFORM public.hr_cargo_definir_salario_core(v_cargo, 1060, 'mensal', v_hoje + 31, 'teste', NULL);
      RAISE EXCEPTION 'Uma subida igual ao periodo mais recente devia ter sido recusada.' USING ERRCODE = 'HR917';
    EXCEPTION
      WHEN SQLSTATE 'HRC07' THEN NULL;
    END;

    -- G. Data anterior ao periodo mais recente (que comeca em hoje + 30) -> HRC04
    BEGIN
      PERFORM public.hr_cargo_definir_salario_core(v_cargo, 1070, 'mensal', v_hoje + 10, 'teste', NULL);
      RAISE EXCEPTION 'Uma data anterior ao periodo mais recente devia ter sido recusada.' USING ERRCODE = 'HR918';
    EXCEPTION
      WHEN SQLSTATE 'HRC04' THEN NULL;
    END;

    -- H. Dados invalidos -> HRC03 (motivo curto, salario negativo, periodicidade)
    BEGIN
      PERFORM public.hr_cargo_definir_salario_core(v_cargo, 1070, 'mensal', v_hoje + 31, 'ab', NULL);
      RAISE EXCEPTION 'Um motivo com menos de 3 caracteres devia ter sido recusado.' USING ERRCODE = 'HR919';
    EXCEPTION
      WHEN SQLSTATE 'HRC03' THEN NULL;
    END;
    BEGIN
      PERFORM public.hr_cargo_definir_salario_core(v_cargo, -1, 'mensal', v_hoje + 31, 'teste', NULL);
      RAISE EXCEPTION 'Um salario negativo devia ter sido recusado.' USING ERRCODE = 'HR920';
    EXCEPTION
      WHEN SQLSTATE 'HRC03' THEN NULL;
    END;
    BEGIN
      PERFORM public.hr_cargo_definir_salario_core(v_cargo, 1070, 'semanal', v_hoje + 31, 'teste', NULL);
      RAISE EXCEPTION 'Uma periodicidade invalida devia ter sido recusada.' USING ERRCODE = 'HR921';
    EXCEPTION
      WHEN SQLSTATE 'HRC03' THEN NULL;
    END;

    -- I. Cargo inexistente -> HRC02
    BEGIN
      PERFORM public.hr_cargo_definir_salario_core(gen_random_uuid(), 1070, 'mensal', v_hoje + 31, 'teste', NULL);
      RAISE EXCEPTION 'Um cargo inexistente devia ter sido recusado.' USING ERRCODE = 'HR922';
    EXCEPTION
      WHEN SQLSTATE 'HRC02' THEN NULL;
    END;

    -- J. CANCELAR a subida agendada voltando ao valor anterior (mesma data, 1000):
    --    funciona, a cache volta a 1000, e uma alteracao posterior que cruza o
    --    inicio do periodo (hoje + 30, agora com o mesmo valor dos dois lados)
    --    nao falha com o 23514 enganador (a Ana define o subsidio desde hoje + 10:
    --    a versao parte-se em hoje + 30 em vez de atravessar o inicio do periodo).
    v_res := public.hr_cargo_definir_salario_core(v_cargo, 1000, 'mensal', v_hoje + 30, 'cancelar a subida', NULL);
    IF (v_res ->> 'pessoas_actualizadas')::integer <> 2 THEN
      RAISE EXCEPTION 'Cancelar a subida devia refazer 2 pessoas; resultado: %.', v_res::text USING ERRCODE = 'HR923';
    END IF;

    SELECT c.salario_base INTO v_cache FROM public.hr_cargos c WHERE c.id = v_cargo;
    IF v_cache <> 1000 THEN
      RAISE EXCEPTION 'Depois de cancelar, a cache devia voltar a 1000, e %.', v_cache USING ERRCODE = 'HR924';
    END IF;

    SELECT count(*) INTO v_linhas FROM public.pessoas_retribuicoes
     WHERE pessoa_id = v_ana AND deleted_at IS NULL AND valor_base = 1000
       AND valido_de = v_hoje + 30 AND valido_ate IS NULL AND origem = 'subida_cargo';
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION 'A Ana devia ter uma versao aberta desde hoje + 30 com 1000 depois de cancelar (encontradas %).', v_linhas
        USING ERRCODE = 'HR925';
    END IF;

    v_n := public.hr_retribuicao_refazer_desde(
      v_ana, v_hoje + 10,
      jsonb_build_object('vinculo_id', NULL, 'moeda', 'EUR', 'subsidio_alimentacao', 6.00,
                         'subsidio_alimentacao_modo', 'dinheiro', 'duodecimos_pct', 50),
      'pessoa', 'teste', NULL);
    IF v_n <> 2 THEN
      RAISE EXCEPTION 'Definir o subsidio da Ana desde hoje + 10 devia criar 2 versoes (partidas em hoje + 30), criou %.', v_n
        USING ERRCODE = 'HR926';
    END IF;

    -- K. Corrigir o PRIMEIRO periodo de um cargo (o valor "desde sempre"). Com uma
    --    pessoa com retribuicao ja em vigor, e recusado (HRC06) e o periodo fica
    --    como estava; sem ninguem, corrige e deixa o valor antigo em
    --    hr_cargos_correcoes.
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org, 'Cargo 5 20261210130000', 1000, 'mensal') RETURNING id INTO v_cargo5;
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org, 'Cargo 6 20261210130000', 1000, 'mensal') RETURNING id INTO v_cargo6;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org, 'Jo', 'Teste 20261210130000', v_cargo5, v_hoje - 60) RETURNING id INTO v_jo;
    INSERT INTO public.pessoas_retribuicoes
      (pessoa_id, organization_id, valor_base, moeda, periodicidade, duodecimos_pct, valido_de, valido_ate, motivo)
    VALUES (v_jo, v_org, 1000, 'EUR', 'mensal', 50, v_hoje - 60, NULL, 'teste');

    BEGIN
      PERFORM public.hr_cargo_definir_salario_core(v_cargo5, 1200, 'mensal', v_hoje, 'corrigir o primeiro valor', NULL);
      RAISE EXCEPTION 'Corrigir o primeiro valor de um cargo com retribuicao em vigor devia ter sido recusado.' USING ERRCODE = 'HR927';
    EXCEPTION
      WHEN SQLSTATE 'HRC06' THEN NULL;
    END;

    SELECT count(*) INTO v_linhas FROM public.hr_cargos_periodos
     WHERE cargo_id = v_cargo5 AND salario_base = 1000 AND valido_ate IS NULL;
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION 'A recusa devia deixar o primeiro periodo do cargo 5 como estava (encontrados %).', v_linhas USING ERRCODE = 'HR928';
    END IF;

    v_res := public.hr_cargo_definir_salario_core(v_cargo6, 1300, 'mensal', v_hoje, 'corrigir o primeiro valor', NULL);
    SELECT count(*) INTO v_linhas FROM public.hr_cargos_periodos
     WHERE cargo_id = v_cargo6 AND salario_base = 1300 AND valido_ate IS NULL;
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION 'O primeiro periodo do cargo 6 devia ter ficado a 1300 (encontrados %).', v_linhas USING ERRCODE = 'HR929';
    END IF;
    SELECT count(*) INTO v_linhas FROM public.hr_cargos_correcoes
     WHERE cargo_id = v_cargo6 AND tabela = 'hr_cargos_periodos'
       AND (valor_antigo ->> 'salario_base')::numeric = 1000
       AND (valor_novo ->> 'salario_base')::numeric = 1300;
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION 'Corrigir o primeiro valor devia deixar o valor antigo (1000) em hr_cargos_correcoes (encontradas %).', v_linhas
        USING ERRCODE = 'HR930';
    END IF;

    -- L. Com uma sessao de utilizador FABRICADA (request.jwt.claim.sub = um uuid
    --    qualquer, sem papeis): criar um cargo com salario e recusado, com
    --    salario 0 passa; e a RPC de definir o salario da a MESMA resposta (42501)
    --    a um cargo que existe e a um que nao existe.
    PERFORM set_config('request.jwt.claim.sub', x.u::text, true),
                  set_config('request.jwt.claims', json_build_object('sub', x.u, 'role', 'authenticated')::text, true)
      FROM (SELECT gen_random_uuid() AS u) x;

    BEGIN
      INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
      VALUES (v_org, 'Cargo com salario sem permissao 20261210130000', 1500, 'mensal');
      RAISE EXCEPTION 'Criar um cargo com salario sem hr.cargos.salario.alterar devia ter sido recusado.' USING ERRCODE = 'HR931';
    EXCEPTION
      WHEN SQLSTATE '42501' THEN NULL;
    END;

    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org, 'Cargo sem salario 20261210130000', 0, 'mensal');

    v_msg1 := NULL;
    v_msg2 := NULL;
    BEGIN
      PERFORM public.rpc_hr_cargo_definir_salario(v_cargo, 1200, 'mensal', v_hoje + 60, 'teste');
    EXCEPTION
      WHEN SQLSTATE '42501' THEN v_msg1 := SQLERRM;
    END;
    BEGIN
      PERFORM public.rpc_hr_cargo_definir_salario(gen_random_uuid(), 1200, 'mensal', v_hoje + 60, 'teste');
    EXCEPTION
      WHEN SQLSTATE '42501' THEN v_msg2 := SQLERRM;
    END;
    IF v_msg1 IS NULL OR v_msg1 IS DISTINCT FROM v_msg2 THEN
      RAISE EXCEPTION 'rpc_hr_cargo_definir_salario devia dar a mesma resposta 42501 a um cargo que existe e a um que nao existe (% / %).', v_msg1, v_msg2
        USING ERRCODE = 'HR932';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

    RAISE EXCEPTION 'teste_cargo_definir_salario_20261210130000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: tudo o que o teste criou e desfeito pela subtransaccao
    WHEN OTHERS THEN
      RAISE EXCEPTION
        'Um dos testes ao vivo desta migration (definir salario do cargo) falhou -- SQLSTATE %: %',
        SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE
    'OK: o salario de hr_cargos so muda pela funcao propria (HRC01 em UPDATE directo), as colunas de salario de hr_cargos ja nao sao legiveis por authenticated, criar cargo com salario exige a permissao, a subida fecha e abre periodos, refaz as retribuicoes (valores antigos intactos, subsidio e duodecimos copiados, escolhas futuras da pessoa preservadas), corrigir ou cancelar a subida refaz, corrigir o primeiro periodo e coerente, e HRC02 a HRC05 e HRC07 confirmados com dados fabricados. As RPCs publicas so para authenticated e service_role, o core e interno.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes: so podem estar
--    pendentes os cinco ficheiros do fluxo 2.
-- 2. Esta migration PARTE o ecra de editar cargo se ele ainda enviar salario ou
--    periodicidade alterados (HRC01). Migration e codigo entram juntos.
-- 3. A subida refaz as retribuicoes das pessoas do cargo numa so transaccao:
--    medir na nike o custo da funcao num cargo com varias fichas antes de dar
--    por feito (ver o plano, F7).
-- 4. Quando for para a base partilhada, muda para a Mudelar: o salario dos
--    cargos so se altera pela funcao nova. Dizer ao Miguel e esperar
--    autorizacao.
-- ==============================================================================
