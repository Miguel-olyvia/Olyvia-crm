-- ==============================================================================
-- Modelo do contrato (1/2): cinco tipos, regime contratual individual/coletivo.
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO. O ecra deixa de oferecer o tipo tempo_parcial e passa a
-- oferecer o regime contratual (individual ou coletivo). Esta migration e a
-- 20261210310000 (historico de alteracoes) entram no mesmo commit que o ecra novo.
-- Sozinha, a migration NAO parte nada que o ecra antigo faca ao gravar, EXCEPTO
-- oferecer o tipo tempo_parcial: o ecra antigo que o grave passa a receber um erro
-- de CHECK (pessoas_vinculos_tipo_valido). Por isso o ecra novo vai junto.
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- 1. tipo_contrato passa a ter CINCO valores oferecidos: sem_termo, termo_certo,
--    termo_incerto, duracao_muito_curta e temporario. O valor tempo_parcial SAI:
--    "tempo parcial" ja existe como regime de trabalho (coluna regime,
--    tempo_inteiro/tempo_parcial) e nunca devia ter sido uma segunda resposta a mesma
--    pergunta. estagio e prestacao_servicos FICAM no CHECK como valores legados
--    escondidos (o ecra nao os oferece): encolher o dominio tornaria ilegais as
--    linhas ja gravadas com eles. Dominio do CHECK: 7 valores.
--
-- 2. As linhas que tinham tipo_contrato = tempo_parcial passam a sem_termo e, para
--    nao perder a unica informacao que esse tipo dizia, ficam com regime =
--    tempo_parcial (se ja o tinham, nada muda). A coluna regime e autoritativa do
--    tempo parcial desde 20261120200000. Cada alteracao fica no historico
--    (pessoas_vinculos_alteracoes) sem autor, porque corre na migration. A
--    migration anuncia quantas linhas migrou e quantas tinham data de fim (que
--    passam a sem_termo com data de fim: o RH decide se a mantem).
--
-- 3. Coluna nova regime_contratual text NOT NULL DEFAULT 'individual', CHECK em
--    individual / coletivo. Sem campos extra obrigatorios: coletivo nao exige
--    categoria profissional nem convencao (a categoria_profissional que ja existe
--    continua opcional). Todas as linhas existentes ficam individual.
--
-- 4. So comentarios: periodo_experimental_dias e data_fim documentam as regras de
--    data novas (fim do periodo experimental = inicio + dias - 1; fim por meses =
--    vespera do dia correspondente). A base NAO deriva nenhuma das datas, tal como
--    antes: o calculo vive no ecra (src/lib/hr/novaPessoaDatas.ts). Nao se corrigem
--    dados antigos (eram editaveis; nao se adivinha quais vieram do calculo).
--
--
-- -- A LER COM ATENCAO ANTES DO PUSH -------------------------------------------
--
-- a) O dominio de tipo_contrato foi lido na versao MAIS RECENTE do CHECK:
--    20261120200000 (na copia renumerada do branch: 20261207001900), nome
--    pessoas_vinculos_tipo_valido, 8 valores. Nenhuma migration posterior lhe toca.
--    O DROP e o ADD correm na mesma transaccao e a migration conta primeiro as
--    linhas que violariam o CHECK novo (devem ser 0, depois do passo 2).
-- b) hr_documento_variaveis (20261210140000) ainda tem um ramo WHEN tempo_parcial
--    no rotulo do tipo de contrato: fica morto e inofensivo (nenhuma linha tem
--    esse valor). NAO se mexe nele aqui.
-- c) Esta migration so se aplica ao branch de RH (uma so organizacao, a nike);
--    nada vai para a base partilhada de producao.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito (uma reversao na pasta e
-- aplicada pelo db push). A mao: largar o CHECK de regime_contratual e a coluna, e
-- repor o CHECK de tipo_contrato com tempo_parcial. As linhas migradas nao se
-- repoem sozinhas (o historico tem o antes e o depois).
--
-- Prerequisitos:
--   20261120060000  pessoas_vinculos
--   20261120200000  pessoas_vinculos_tipo_valido (8 valores)
--   20261123050000  trigger de historico (as alteracoes do passo 2 ficam registadas)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  IF to_regclass('public.pessoas_vinculos') IS NULL THEN
    RAISE EXCEPTION 'pessoas_vinculos nao existe.';
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_constraint
   WHERE conrelid = 'public.pessoas_vinculos'::regclass
     AND conname IN ('pessoas_vinculos_tipo_valido', 'pessoas_vinculos_tipo_contrato_valido');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Esperava-se UM CHECK de dominio em pessoas_vinculos.tipo_contrato e encontraram-se %. Investigar antes de aplicar.', v_n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos' AND column_name = 'regime'
  ) THEN
    RAISE EXCEPTION 'pessoas_vinculos nao tem a coluna regime. Estado inesperado.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. Regime contratual (coluna nova, antes de tudo o resto)
-- ==============================================================================
ALTER TABLE public.pessoas_vinculos
  ADD COLUMN IF NOT EXISTS regime_contratual text NOT NULL DEFAULT 'individual';

DO $regime_contratual$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_regime_contratual_valido'
       AND conrelid = 'public.pessoas_vinculos'::regclass
  ) THEN
    ALTER TABLE public.pessoas_vinculos
      ADD CONSTRAINT pessoas_vinculos_regime_contratual_valido
      CHECK (regime_contratual IN ('individual', 'coletivo'));
  END IF;
END;
$regime_contratual$;

-- ==============================================================================
-- 2. Migrar as linhas com tipo_contrato = tempo_parcial
-- ==============================================================================
DO $migrar$
DECLARE
  v_total        integer;
  v_com_fim      integer;
  v_mudam_regime integer;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE data_fim IS NOT NULL),
         count(*) FILTER (WHERE regime <> 'tempo_parcial')
    INTO v_total, v_com_fim, v_mudam_regime
    FROM public.pessoas_vinculos
   WHERE tipo_contrato = 'tempo_parcial';

  IF v_total = 0 THEN
    RAISE NOTICE 'Nenhuma linha de pessoas_vinculos com tipo_contrato = tempo_parcial. Nada a migrar.';
    RETURN;
  END IF;

  UPDATE public.pessoas_vinculos
     SET tipo_contrato = 'sem_termo',
         regime        = 'tempo_parcial'
   WHERE tipo_contrato = 'tempo_parcial';

  RAISE NOTICE 'tempo_parcial migrado: % linha(s) passaram a sem_termo (das quais % com regime que passou a tempo_parcial e % com data de fim, para o RH rever).',
    v_total, v_mudam_regime, v_com_fim;
END;
$migrar$;

-- ==============================================================================
-- 3. O CHECK de tipo_contrato: 7 valores (5 oferecidos + 2 legados escondidos)
-- ==============================================================================
DO $check_tipo$
DECLARE
  v_viola integer;
BEGIN
  SELECT count(*) INTO v_viola
    FROM public.pessoas_vinculos
   WHERE tipo_contrato NOT IN ('sem_termo', 'termo_certo', 'termo_incerto', 'duracao_muito_curta',
                               'temporario', 'estagio', 'prestacao_servicos');
  IF v_viola <> 0 THEN
    RAISE EXCEPTION 'Ha % linha(s) de pessoas_vinculos com tipo_contrato fora dos 7 valores; nao se reescreve o CHECK.', v_viola;
  END IF;

  ALTER TABLE public.pessoas_vinculos
    DROP CONSTRAINT IF EXISTS pessoas_vinculos_tipo_valido,
    DROP CONSTRAINT IF EXISTS pessoas_vinculos_tipo_contrato_valido;

  ALTER TABLE public.pessoas_vinculos
    ADD CONSTRAINT pessoas_vinculos_tipo_valido CHECK (
      tipo_contrato IN (
        'sem_termo',
        'termo_certo',
        'termo_incerto',
        'duracao_muito_curta',
        'temporario',
        'estagio',
        'prestacao_servicos'
      )
    );
END;
$check_tipo$;

-- ==============================================================================
-- 4. Comentarios
-- ==============================================================================
COMMENT ON COLUMN public.pessoas_vinculos.tipo_contrato IS
'A natureza e a duracao do contrato. A base aceita SETE valores e o ecra oferece CINCO: sem_termo, termo_certo, termo_incerto, duracao_muito_curta e temporario. estagio e prestacao_servicos continuam no CHECK como valores legados escondidos (o ecra nao os oferece; encolher o dominio tornaria ilegais as linhas que ja os usam). O valor tempo_parcial SAIU em 20261210300000: tempo parcial e um REGIME DE TRABALHO (coluna regime, tempo_inteiro/tempo_parcial), nao um tipo de contrato; as linhas que o tinham passaram a sem_termo com regime tempo_parcial. NAO confundir com regime_contratual (individual/coletivo), com regime (quanto se trabalha) nem com tipo_trabalho (presencial/remoto/hibrido).';

COMMENT ON COLUMN public.pessoas_vinculos.regime_contratual IS
'Individual ou coletivo: se o contrato e regido so pelo acordo individual ou tambem por um instrumento de regulamentacao coletiva (convencao). Sem campos extra obrigatorios: coletivo nao exige categoria profissional nem nome da convencao. NAO confundir com regime (tempo_inteiro/tempo_parcial) nem com tipo_contrato. Desde 20261210300000; as linhas anteriores ficaram individual.';

COMMENT ON COLUMN public.pessoas_vinculos.periodo_experimental_dias IS
'A DURACAO do periodo experimental, em dias. NAO SUBSTITUI periodo_experimental_ate, que continua a existir: o formulario recolhe a duracao, o produto ja guardava a data-limite, e as duas coexistem. Regra de escrita do UI, e NAO da base: quando a duracao esta preenchida e a data nao, o UI calcula data_inicio + dias - 1 (o primeiro dia conta; desde 20261210300000, antes era data_inicio + dias). A base nao deriva nenhuma das duas por trigger, de proposito -- derivar criaria duas fontes de verdade a divergir em silencio. Linhas anteriores a regra nova nao foram corrigidas.';

COMMENT ON COLUMN public.pessoas_vinculos.data_fim IS
'Data do ultimo dia do contrato. Regra do UI, nao da base: quando o contrato a termo certo e definido por meses, a data de fim e a vespera do dia correspondente (31/01 + 1 mes = 28/02, regra do dia inexistente: o ultimo dia do mes). A duracao em meses so se aplica ao termo certo. A base nao deriva a data (desde 20261210300000 apenas documentado aqui).';

-- ==============================================================================
-- Conferir (estrutura): falha o push se algo estiver diferente do esperado.
-- ==============================================================================
DO $conferir$
DECLARE
  v_def  text;
  v_n    integer;
  v_val  text;
BEGIN
  -- 1. Um unico CHECK de dominio em tipo_contrato, com os 7 valores e sem tempo_parcial.
  SELECT count(*) INTO v_n
    FROM pg_constraint
   WHERE conrelid = 'public.pessoas_vinculos'::regclass
     AND conname IN ('pessoas_vinculos_tipo_valido', 'pessoas_vinculos_tipo_contrato_valido');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Esperava-se UM CHECK de dominio em tipo_contrato e encontraram-se %.', v_n;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.pessoas_vinculos'::regclass AND conname = 'pessoas_vinculos_tipo_valido';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'pessoas_vinculos_tipo_valido nao existe.';
  END IF;
  IF v_def LIKE '%''tempo_parcial''%' THEN
    RAISE EXCEPTION 'tipo_contrato ainda aceita tempo_parcial: %', v_def;
  END IF;
  FOREACH v_val IN ARRAY ARRAY['sem_termo', 'termo_certo', 'termo_incerto', 'duracao_muito_curta',
                               'temporario', 'estagio', 'prestacao_servicos'] LOOP
    IF v_def NOT LIKE '%''' || v_val || '''%' THEN
      RAISE EXCEPTION 'tipo_contrato deixou de aceitar %: %', v_val, v_def;
    END IF;
  END LOOP;

  -- 2. Nenhuma linha ficou com tempo_parcial.
  SELECT count(*) INTO v_n FROM public.pessoas_vinculos WHERE tipo_contrato = 'tempo_parcial';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Ficaram % linha(s) com tipo_contrato = tempo_parcial.', v_n;
  END IF;

  -- 3. O regime (tempo_inteiro/tempo_parcial) nao foi tocado no dominio.
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.pessoas_vinculos'::regclass AND conname = 'pessoas_vinculos_regime_valido';
  IF v_def IS NULL OR v_def NOT LIKE '%tempo_inteiro%' OR v_def NOT LIKE '%tempo_parcial%' THEN
    RAISE EXCEPTION 'pessoas_vinculos_regime_valido deixou de aceitar tempo_inteiro/tempo_parcial: %', coalesce(v_def, '(ausente)');
  END IF;

  -- 4. regime_contratual: NOT NULL, omissao individual, CHECK com os dois valores.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos' AND column_name = 'regime_contratual'
       AND is_nullable = 'NO' AND column_default LIKE '%individual%'
  ) THEN
    RAISE EXCEPTION 'pessoas_vinculos.regime_contratual devia ser NOT NULL com valor por omissao individual.';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.pessoas_vinculos'::regclass AND conname = 'pessoas_vinculos_regime_contratual_valido';
  IF v_def IS NULL OR v_def NOT LIKE '%''individual''%' OR v_def NOT LIKE '%''coletivo''%' THEN
    RAISE EXCEPTION 'pessoas_vinculos_regime_contratual_valido nao ficou com individual e coletivo: %', coalesce(v_def, '(ausente)');
  END IF;

  SELECT count(*) INTO v_n FROM public.pessoas_vinculos WHERE regime_contratual NOT IN ('individual', 'coletivo');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Ha % linha(s) com regime_contratual invalido.', v_n;
  END IF;

  -- 5. A coluna nova tem o privilegio de tabela de authenticated (SELECT, INSERT, UPDATE).
  IF NOT has_column_privilege('authenticated', 'public.pessoas_vinculos', 'regime_contratual', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.pessoas_vinculos', 'regime_contratual', 'INSERT')
     OR NOT has_column_privilege('authenticated', 'public.pessoas_vinculos', 'regime_contratual', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated devia poder ler e escrever pessoas_vinculos.regime_contratual.';
  END IF;
  IF has_column_privilege('anon', 'public.pessoas_vinculos', 'regime_contratual', 'SELECT') THEN
    RAISE EXCEPTION 'anon consegue ler pessoas_vinculos.regime_contratual.';
  END IF;

  RAISE NOTICE 'OK: tipo_contrato com 7 valores no CHECK (5 oferecidos + estagio e prestacao_servicos legados), sem tempo_parcial; regime_contratual individual/coletivo.';
END;
$conferir$;

-- ==============================================================================
-- Conferir (ao vivo, so na organizacao nike): cria dados de teste e DESFAZ-OS
-- tudo com a sentinela HR900 (a subtransaccao reverte as linhas).
-- ==============================================================================
DO $conferir_vivo$
DECLARE
  v_org_nike  uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  v_cargo     uuid;
  v_pessoa    uuid;
  v_vinculo   uuid;
  v_regime_c  text;
  v_cons      text;
  v_tipo      text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = v_org_nike) THEN
    RAISE NOTICE 'Org nike nao encontrada neste ambiente -- o conferir ao vivo do modelo do contrato foi saltado.';
    RETURN;
  END IF;

  BEGIN
    -- Escritas SO na nike (organization_id confirmado acima). O trigger de cargos
    -- (HRC08) recusa uma ficha sem cargo: fabrica-se um cargo de teste com nome unico.
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org_nike, 'TESTE MIGRACAO cargo 20261210300000 ' || gen_random_uuid()::text, 0, 'mensal')
    RETURNING id INTO v_cargo;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org_nike, 'TESTE MIGRACAO', '20261210300000 -- apagar', v_cargo, current_date)
    RETURNING id INTO v_pessoa;

    INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, estado)
    VALUES (v_pessoa, v_org_nike, 'sem_termo', current_date, 'activo')
    RETURNING id, regime_contratual INTO v_vinculo, v_regime_c;

    -- 1. Sem escolha, o regime contratual e individual.
    IF v_regime_c IS DISTINCT FROM 'individual' THEN
      RAISE EXCEPTION 'regime_contratual devia ser individual por omissao; foi %.', coalesce(v_regime_c, '(nulo)')
        USING ERRCODE = 'HR962';
    END IF;

    -- 2. Coletivo e aceite, sem categoria nem convencao.
    UPDATE public.pessoas_vinculos SET regime_contratual = 'coletivo' WHERE id = v_vinculo;
    SELECT regime_contratual INTO v_regime_c FROM public.pessoas_vinculos WHERE id = v_vinculo;
    IF v_regime_c IS DISTINCT FROM 'coletivo' THEN
      RAISE EXCEPTION 'regime_contratual coletivo devia ser aceite sem campos extra; ficou %.', coalesce(v_regime_c, '(nulo)')
        USING ERRCODE = 'HR962';
    END IF;

    -- 3. Um valor fora de individual/coletivo e recusado pelo CHECK certo.
    v_cons := NULL;
    BEGIN
      UPDATE public.pessoas_vinculos SET regime_contratual = 'misto' WHERE id = v_vinculo;
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_cons = CONSTRAINT_NAME;
    END;
    IF v_cons IS DISTINCT FROM 'pessoas_vinculos_regime_contratual_valido' THEN
      RAISE EXCEPTION 'regime_contratual misto devia ser recusado por pessoas_vinculos_regime_contratual_valido; foi por %.', coalesce(v_cons, '(nada)')
        USING ERRCODE = 'HR962';
    END IF;

    -- 4. Os 5 tipos oferecidos e os 2 legados sao aceites.
    FOREACH v_tipo IN ARRAY ARRAY['sem_termo', 'termo_certo', 'termo_incerto', 'duracao_muito_curta',
                                  'temporario', 'estagio', 'prestacao_servicos'] LOOP
      UPDATE public.pessoas_vinculos SET tipo_contrato = v_tipo WHERE id = v_vinculo;
    END LOOP;

    -- 5. tempo_parcial deixou de ser tipo de contrato.
    v_cons := NULL;
    BEGIN
      UPDATE public.pessoas_vinculos SET tipo_contrato = 'tempo_parcial' WHERE id = v_vinculo;
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_cons = CONSTRAINT_NAME;
    END;
    IF v_cons IS DISTINCT FROM 'pessoas_vinculos_tipo_valido' THEN
      RAISE EXCEPTION 'tipo_contrato tempo_parcial devia ser recusado por pessoas_vinculos_tipo_valido; foi por %.', coalesce(v_cons, '(nada)')
        USING ERRCODE = 'HR962';
    END IF;

    -- 6. Tempo parcial continua a ser possivel como regime de trabalho.
    UPDATE public.pessoas_vinculos SET regime = 'tempo_parcial' WHERE id = v_vinculo;

    RAISE EXCEPTION 'teste_hr_vinculos_modelo_contrato_20261210300000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: tudo desfeito pela subtransaccao (linhas).
    WHEN OTHERS THEN
      RAISE EXCEPTION 'O conferir ao vivo do modelo do contrato falhou -- SQLSTATE %: %', SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'CONFERIR AO VIVO (nike): regime_contratual individual por omissao, coletivo aceite, valor invalido recusado; 5 tipos oferecidos e 2 legados aceites; tempo_parcial recusado como tipo e aceite como regime. Tudo desfeito.';
END;
$conferir_vivo$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. PRECISA DE CODIGO NOVO: ver o cabecalho. Aplica-se com o ecra no mesmo commit.
--
-- 2. Listar o que esta pendente IMEDIATAMENTE antes do push
--    (supabase migration list --linked): o push aplica TUDO o que estiver na
--    pasta, por ordem. Nunca migration repair.
--
-- 3. Correr os testes ANTES do push, contra o remoto ainda por migrar: depois de
--    aplicada, NAO se volta atras para demonstrar o vermelho.
-- ==============================================================================
