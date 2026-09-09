-- ==============================================================================
-- Horas de trabalho: uma unidade canonica em vez de quatro intervalos.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- 20261120140000 criou horas_frequencia com o dominio fechado a UMA hipotese
-- ('semanal') e escreveu la a razao: horas_semanais estava limitada a 0..80 por
-- pessoas_vinculos_horas_validas (20261120060000), e com unidade mensal (160h)
-- ou anual (2000h) qualquer linha violaria sempre esse limite.
--
-- O utilizador pede agora as quatro frequencias -- dia, semana, mes, ano. A
-- saida obvia seria um limite superior por frequencia (16 / 80 / 346 / 4160),
-- e e essa que NAO se toma, por uma razao que vale a pena escrever:
--
--   NENHUM limite por frequencia distingue "40 mensais" mal digitado de um
--   contrato real de 9h/semana. As duas linhas sao diferentes e AMBAS sao
--   legais. Procurar um intervalo que apanhe a unidade trocada e procurar o
--   que nao existe.
--
-- O que a base pode garantir e outra coisa: que o par (quantidade, unidade) e
-- interpretavel e COMPARAVEL. Isso resolve-se com uma unidade canonica.
--
--
-- -- O DESENHO -----------------------------------------------------------------
--
-- 1. horas_semanais passa a chamar-se horas_periodo. O nome antigo era
--    activamente enganador com frequencia diaria ou anual -- dizia "semanais"
--    uma coluna que passa a poder conter horas por ano. Renomeia-se AGORA,
--    com a tabela vazia, porque depois custa caro. Esta e a unica migracao
--    desta ronda com rename de coluna, e vai a frente de proposito: tudo o que
--    se escrever depois, em SQL ou na interface, ja assume o nome final.
--
-- 2. horas_periodo perde o limite superior proprio e fica so com >= 0.
--
-- 3. horas_semanais_equivalentes -- coluna GERADA, STORED -- converte para
--    semana por factores fixos, e e ELA que leva o <= 80. Os quatro intervalos
--    passam a ser consequencia aritmetica em vez de quatro numeros escritos a
--    mao: diaria <= 16, semanal <= 80, mensal <= 346,67, anual <= 4160.
--    Ninguem os escreve e ninguem os pode contradizer.
--
-- 4. O CHECK cruzado com horas_semanais_maximas passa a comparar contra a
--    coluna canonica. Os dois lados estao SEMPRE na mesma unidade, qualquer que
--    seja a frequencia declarada -- que era exactamente a armadilha que o
--    COMMENT de 20261120140000 avisava.
--
-- Os factores (diaria x5, semanal x1, mensal x3/13 = 12/52, anual /52) sao
-- CONVENCOES e nao medicoes. E por isso que vivem num sitio so, com COMMENT:
-- qualquer comparacao entre unidades precisa deles, e a alternativa e cada
-- chamador inventar os seus.
--
--
-- -- horas_semanais_maximas NAO ganha frequencia --------------------------------
--
-- Foi considerado e recusado. Dar-lhe frequencia propria criaria tres colunas
-- de horas com unidades independentes entre si, e o CHECK cruzado voltaria a
-- comparar grandezas incomparaveis -- o problema que esta migracao existe para
-- fechar. Fica semanal para sempre: o nome passa a ser carga util em vez de
-- acidente. horas_anuais_maximas fica intocada e continua deliberadamente sem
-- cruzamento com o maximo semanal (52 semanas de maximo semanal dao mais do que
-- o maximo anual em qualquer contrato com ferias).
--
--
-- -- DOIS DEFEITOS ENCONTRADOS POR LEITURA, E CORRIGIDOS AQUI -------------------
--
-- (a) horas_semanais e numeric(5,2) -- maximo 999,99. Com frequencia anual, um
--     contrato normal de 2080 horas NAO CABE: o INSERT rebentaria com "numeric
--     field overflow", e nao com uma violacao de CHECK. Alargar o dominio da
--     frequencia sem alargar o tipo teria dado um erro incompreensivel no ecra.
--     Passa a numeric(8,2). O tipo alarga-se ANTES de a coluna gerada existir:
--     depois, a dependencia impede o ALTER TYPE.
--
-- (b) Se alguem alargar horas_frequencia sem acrescentar o factor ao CASE, o
--     CASE devolve NULL e o <= 80 passaria em vazio -- um buraco silencioso.
--     O CHECK ..._frequencia_tem_factor obriga o equivalente a existir sempre
--     que ha quantidade: o alargamento sem factor rebenta ao primeiro INSERT,
--     em voz alta, que e como estas coisas se devem descobrir.
--
--
-- -- O QUE ESTA MIGRACAO NAO FAZ -------------------------------------------------
--
-- Nao apanha a unidade trocada dentro do que e fisicamente possivel -- ver o
-- primeiro paragrafo. Isso e trabalho da interface, e fica registado onde tem
-- de ficar: o max do input deriva da frequencia escolhida e um equivalente fora
-- de 5..48 h/semana merece AVISO e nao bloqueio (apanha o "40 mensal" real sem
-- rejeitar o 9h/semana legitimo). Hoje PessoaContratoTab.tsx nao valida nada no
-- cliente e e o ecra mais exposto.
--
-- Nao se toca em 20261120140000. O bloco de conferencia desse ficheiro faz
-- RAISE se o CHECK da frequencia aceitar 'mensal'/'anual', mas isso nao e
-- problema: numa reconstrucao do zero ela corre ANTES desta migracao, com o
-- dominio ainda a um valor, e passa; e o db push nunca reaplica uma migracao ja
-- aplicada. Editar aquele ficheiro seria drift sem ganho nenhum.
-- ==============================================================================


-- ---- Guardas ---------------------------------------------------------------
-- to_regclass() e nao 'public.x'::regclass: o cast literal rebenta em parse se
-- a tabela nao existir, e uma guarda que rebenta antes de conferir nao guarda.
DO $guardas$
DECLARE
  v_tem_antiga  boolean;
  v_tem_nova    boolean;
  v_tipo        text;
BEGIN
  IF to_regclass('public.pessoas_vinculos') IS NULL THEN
    RAISE EXCEPTION
      'public.pessoas_vinculos nao existe. Esta migracao altera colunas de horas dessa tabela -- 20261120060000 e 20261120140000 tem de ir a frente na fila.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos'
       AND column_name = 'horas_semanais'
  ) INTO v_tem_antiga;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos'
       AND column_name = 'horas_periodo'
  ) INTO v_tem_nova;

  IF NOT v_tem_antiga AND NOT v_tem_nova THEN
    RAISE EXCEPTION
      'pessoas_vinculos nao tem horas_semanais nem horas_periodo. O estado nao e o esperado: alguem largou a coluna. Investigar antes de aplicar.';
  END IF;

  IF v_tem_antiga AND v_tem_nova THEN
    RAISE EXCEPTION
      'pessoas_vinculos tem horas_semanais E horas_periodo ao mesmo tempo. Um rename a meio ficou por acabar e nao se sabe qual delas tem os dados. Resolver a mao antes de aplicar.';
  END IF;

  -- horas_frequencia e o alicerce da coluna gerada. Sem ela, o CASE nao tem
  -- sobre o que decidir.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos'
       AND column_name = 'horas_frequencia'
  ) THEN
    RAISE EXCEPTION
      'pessoas_vinculos.horas_frequencia nao existe. E a coluna de que a unidade canonica depende -- 20261120140000 tem de ir a frente na fila.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos'
       AND column_name = 'horas_semanais_maximas'
  ) THEN
    RAISE EXCEPTION
      'pessoas_vinculos.horas_semanais_maximas nao existe. O CHECK cruzado desta migracao precisa dela -- 20261120140000 tem de ir a frente na fila.';
  END IF;

  -- A tabela devia estar vazia. O rename e grato agora e caro depois, e o
  -- limite passa a incidir sobre uma coluna gerada: com linhas la dentro, uma
  -- que nao caiba no <= 80 faz o ALTER falhar a meio do push.
  IF EXISTS (SELECT 1 FROM public.pessoas_vinculos LIMIT 1) THEN
    RAISE WARNING
      'pessoas_vinculos NAO esta vazia. O rename e seguro, mas o novo limite de 80h no equivalente semanal vai ser validado contra as linhas existentes e o push falha se alguma nao couber. Conferir antes: select id, horas_semanais, horas_frequencia from pessoas_vinculos;';
  END IF;

  IF v_tem_nova THEN
    RAISE NOTICE 'horas_periodo ja existe: o rename ja foi feito numa aplicacao anterior. Segue idempotente.';
  ELSE
    SELECT format_type(a.atttypid, a.atttypmod) INTO v_tipo
      FROM pg_attribute a
     WHERE a.attrelid = to_regclass('public.pessoas_vinculos')
       AND a.attname = 'horas_semanais';
    RAISE NOTICE 'Guardas passadas: horas_semanais existe como % e vai ser renomeada para horas_periodo.', v_tipo;
  END IF;
END;
$guardas$;


-- ---- 1. O rename -----------------------------------------------------------
DO $rename$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos'
       AND column_name = 'horas_semanais'
  ) THEN
    ALTER TABLE public.pessoas_vinculos
      RENAME COLUMN horas_semanais TO horas_periodo;
  END IF;
END;
$rename$;


-- ---- 2. O tipo, alargado ANTES de existir dependencia ----------------------
-- numeric(5,2) nao chega para horas anuais: 2080 nao cabe em 999,99. Depois de
-- a coluna gerada existir, o Postgres recusa este ALTER TYPE por dependencia --
-- por isso e aqui e nao mais abaixo.
ALTER TABLE public.pessoas_vinculos
  ALTER COLUMN horas_periodo TYPE numeric(8,2);


-- ---- 3. Os tres CHECKs que deixam de fazer sentido -------------------------
-- Nao se editam as migracoes onde nasceram (estao aplicadas): larga-se aqui e
-- reconstroi-se a seguir, na forma nova.
ALTER TABLE public.pessoas_vinculos
  -- 0..80 sobre a coluna crua (20261120060000): passa a ser consequencia do
  -- limite no equivalente semanal, e sobre a coluna crua era o que impedia
  -- qualquer frequencia que nao 'semanal'.
  DROP CONSTRAINT IF EXISTS pessoas_vinculos_horas_validas,
  -- Comparava horas_semanais_maximas com uma quantidade em unidade declarada:
  -- so era correcto enquanto a frequencia tinha uma hipotese so.
  DROP CONSTRAINT IF EXISTS pessoas_vinculos_maximo_acima_do_contratado,
  -- Dominio de um valor unico.
  DROP CONSTRAINT IF EXISTS pessoas_vinculos_horas_frequencia_valida;


-- ---- 4. A coluna canonica --------------------------------------------------
ALTER TABLE public.pessoas_vinculos
  ADD COLUMN IF NOT EXISTS horas_semanais_equivalentes numeric
    GENERATED ALWAYS AS (
      CASE horas_frequencia
        WHEN 'diaria'  THEN horas_periodo * 5
        WHEN 'semanal' THEN horas_periodo
        -- 12/52 simplificado. Escrito como multiplicacao antes da divisao para
        -- a conta correr em numeric e nao truncar: 3/13 sozinho seria 0 em
        -- aritmetica inteira.
        WHEN 'mensal'  THEN horas_periodo * 3 / 13
        WHEN 'anual'   THEN horas_periodo / 52
      END
    ) STORED;


-- ---- 5. Os cinco CHECKs novos ----------------------------------------------
-- ADD CONSTRAINT nao tem IF NOT EXISTS, por isso cada um vai dentro de um DO
-- com a verificacao em pg_constraint -- mesmo padrao de 20261120140000. Sem
-- isto, reaplicar lanca 42710 e para o push a meio.
DO $checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_horas_frequencia_valida'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    ALTER TABLE public.pessoas_vinculos
      ADD CONSTRAINT pessoas_vinculos_horas_frequencia_valida CHECK (
        horas_frequencia IN ('diaria','semanal','mensal','anual')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_horas_periodo_nao_negativa'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    -- So o piso. O tecto vive no equivalente semanal, uma unidade acima.
    ALTER TABLE public.pessoas_vinculos
      ADD CONSTRAINT pessoas_vinculos_horas_periodo_nao_negativa CHECK (
        horas_periodo IS NULL OR horas_periodo >= 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_frequencia_tem_factor'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    -- A guarda contra o buraco futuro: uma frequencia sem factor no CASE da
    -- equivalente NULL, e o limite de 80 passaria em vazio. Assim rebenta.
    ALTER TABLE public.pessoas_vinculos
      ADD CONSTRAINT pessoas_vinculos_frequencia_tem_factor CHECK (
        horas_periodo IS NULL OR horas_semanais_equivalentes IS NOT NULL
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_horas_equivalentes_validas'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    -- O unico tecto de horas da tabela. Implica diaria <= 16, semanal <= 80,
    -- mensal <= 346,67 e anual <= 4160, sem ninguem escrever esses numeros.
    ALTER TABLE public.pessoas_vinculos
      ADD CONSTRAINT pessoas_vinculos_horas_equivalentes_validas CHECK (
        horas_semanais_equivalentes IS NULL OR horas_semanais_equivalentes <= 80
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_maximo_acima_do_contratado'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    -- Um maximo abaixo do contratado nao e um maximo: e um erro de digitacao a
    -- passar por regra. Agora os dois lados estao sempre em horas por semana,
    -- qualquer que seja a frequencia declarada.
    ALTER TABLE public.pessoas_vinculos
      ADD CONSTRAINT pessoas_vinculos_maximo_acima_do_contratado CHECK (
        horas_semanais_equivalentes IS NULL
        OR horas_semanais_maximas IS NULL
        OR horas_semanais_maximas >= horas_semanais_equivalentes
      );
  END IF;
END;
$checks$;


-- ---- 6. COMMENTs: dois deles afirmavam falsidades a partir de agora --------
COMMENT ON COLUMN public.pessoas_vinculos.horas_periodo IS
'A QUANTIDADE de horas de trabalho, na unidade declarada em horas_frequencia -- e nao necessariamente por semana. Chamava-se horas_semanais ate 20261120190000, nome que passou a mentir quando a frequencia deixou de ter uma hipotese so. Nao tem limite superior proprio: o tecto esta em horas_semanais_equivalentes, que e a mesma grandeza em unidade comparavel. Nunca comparar esta coluna com horas_semanais_maximas -- podem estar em unidades diferentes; comparar sempre a equivalente.';

COMMENT ON COLUMN public.pessoas_vinculos.horas_semanais_equivalentes IS
'horas_periodo convertida para horas por SEMANA. GENERATED ALWAYS ... STORED: nao se escreve, e derivada. Existe para que quantidades declaradas em unidades diferentes sejam comparaveis entre si e contra horas_semanais_maximas. Factores, que sao CONVENCOES e nao medicoes: diaria x5 (semana de 5 dias uteis), semanal x1, mensal x3/13 (=12/52), anual /52. Vivem aqui e so aqui -- qualquer chamador que precise de converter usa esta coluna em vez de inventar os seus.';

COMMENT ON COLUMN public.pessoas_vinculos.horas_frequencia IS
'A unidade de horas_periodo: diaria, semanal, mensal ou anual. Desde 20261120190000 aceita as quatro -- o COMMENT anterior dizia "ACEITA APENAS semanal" e deixou de ser verdade. O que tornou o alargamento seguro nao foi um limite por frequencia (nenhum distingue "40 mensais" mal digitado de um contrato real de 9h/semana: as duas linhas sao legais) mas a conversao para unidade canonica em horas_semanais_equivalentes, que leva o unico tecto. ALARGAR ESTE DOMINIO OBRIGA A ACRESCENTAR O FACTOR ao CASE da coluna gerada: sem ele o equivalente fica NULL e o CHECK pessoas_vinculos_frequencia_tem_factor rebenta ao primeiro INSERT, de proposito.';

COMMENT ON COLUMN public.pessoas_vinculos.horas_semanais_maximas IS
'Limite superior de horas por SEMANA -- sempre semana, e por decisao e nao por acidente: nao ganhou frequencia propria em 20261120190000 para nao criar tres colunas de horas com unidades independentes a comparar-se entre si. Nunca abaixo do contratado, garantido por pessoas_vinculos_maximo_acima_do_contratado, que desde essa migracao compara contra horas_semanais_equivalentes e nao contra a quantidade crua -- e por isso continua correcto com frequencia diaria, mensal ou anual. NAO tem relacao imposta com horas_anuais_maximas: 52 semanas de maximo semanal dao mais do que o maximo anual em qualquer contrato com ferias, e um CHECK a cruza-los rejeitaria contratos validos.';


-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_freq_def  text;
  v_gerada    text;
  v_tipo      text;
  v_checks    integer;
  v_falta     text;
  v_politicas integer;
  v_esperados text[] := ARRAY[
    'pessoas_vinculos_horas_frequencia_valida',
    'pessoas_vinculos_horas_periodo_nao_negativa',
    'pessoas_vinculos_frequencia_tem_factor',
    'pessoas_vinculos_horas_equivalentes_validas',
    'pessoas_vinculos_maximo_acima_do_contratado'
  ];
BEGIN
  -- O rename tem de ter acontecido, e o nome antigo tem de ter desaparecido.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos'
       AND column_name = 'horas_semanais'
  ) THEN
    RAISE EXCEPTION
      'pessoas_vinculos.horas_semanais ainda existe depois do rename. Nao aplicar neste estado: ficariam duas colunas de horas e nao se saberia qual e a verdade.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos'
       AND column_name = 'horas_periodo'
  ) THEN
    RAISE EXCEPTION 'pessoas_vinculos.horas_periodo nao existe depois do rename.';
  END IF;

  -- O tipo tem de caber em horas anuais, senao o defeito (a) volta.
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_tipo
    FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.pessoas_vinculos')
     AND a.attname = 'horas_periodo';

  IF v_tipo <> 'numeric(8,2)' THEN
    RAISE EXCEPTION
      'horas_periodo ficou como % e esperava-se numeric(8,2). Com menos precisao, um contrato anual de 2080 horas rebenta com numeric field overflow em vez de uma violacao de CHECK legivel.',
      v_tipo;
  END IF;

  -- A coluna canonica tem de ser GERADA. Se alguem a tornar escrevivel, passa a
  -- haver duas fontes de verdade a divergir em silencio.
  SELECT a.attgenerated INTO v_gerada
    FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.pessoas_vinculos')
     AND a.attname = 'horas_semanais_equivalentes';

  IF v_gerada IS DISTINCT FROM 's' THEN
    RAISE EXCEPTION
      'horas_semanais_equivalentes nao e uma coluna gerada STORED (attgenerated = %). Se for escrevivel, deixa de ser derivada e passa a poder contradizer horas_periodo.',
      coalesce(v_gerada, '(ausente)');
  END IF;

  -- O dominio tem de ter as QUATRO. E o inverso exacto da guarda de
  -- 20261120140000, que exigia uma so -- e e por isso que esta migracao vem
  -- depois dela e nao a edita.
  SELECT pg_get_constraintdef(oid) INTO v_freq_def
    FROM pg_constraint
   WHERE conname = 'pessoas_vinculos_horas_frequencia_valida'
     AND conrelid = to_regclass('public.pessoas_vinculos');

  IF v_freq_def IS NULL
     OR v_freq_def NOT LIKE '%diaria%'
     OR v_freq_def NOT LIKE '%semanal%'
     OR v_freq_def NOT LIKE '%mensal%'
     OR v_freq_def NOT LIKE '%anual%' THEN
    RAISE EXCEPTION
      'pessoas_vinculos_horas_frequencia_valida devia aceitar diaria, semanal, mensal e anual e aceita: %',
      coalesce(v_freq_def, '(constraint ausente)');
  END IF;

  -- O limite antigo sobre a coluna crua nao pode ter sobrevivido: se ficasse,
  -- travava as frequencias mensal e anual, que e o que se veio abrir.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_horas_validas'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    RAISE EXCEPTION
      'pessoas_vinculos_horas_validas (0..80 na coluna crua) ainda existe. Com ela de pe, qualquer contrato mensal ou anual e recusado -- o alargamento da frequencia ficaria por metade.';
  END IF;

  SELECT count(*) INTO v_checks
    FROM pg_constraint
   WHERE conrelid = to_regclass('public.pessoas_vinculos')
     AND conname = ANY (v_esperados);

  IF v_checks <> 5 THEN
    SELECT string_agg(c, ', ') INTO v_falta
      FROM unnest(v_esperados) AS c
     WHERE NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conrelid = to_regclass('public.pessoas_vinculos') AND conname = c
     );
    RAISE EXCEPTION
      'Esperavam-se os 5 CHECKs de horas e encontraram-se %. Em falta: %',
      v_checks, coalesce(v_falta, '(nenhum identificado)');
  END IF;

  -- Prova aritmetica dos factores. Sao convencoes, mas convencoes conferidas:
  -- se alguem mexer no CASE, e aqui que se sabe, e nao numa folha de salarios.
  IF (8::numeric * 5) <> 40 THEN
    RAISE EXCEPTION 'Factor diario inconsistente.';
  END IF;
  IF round(173::numeric * 3 / 13, 2) <> 39.92 THEN
    RAISE EXCEPTION
      'O factor mensal (x3/13) deixou de dar 39,92 h/semana para 173 h/mes: deu %. A conta esta a correr em aritmetica inteira ou o factor mudou.',
      round(173::numeric * 3 / 13, 2);
  END IF;
  IF round(2080::numeric / 52, 2) <> 40.00 THEN
    RAISE EXCEPTION 'O factor anual (/52) deixou de dar 40 h/semana para 2080 h/ano: deu %.', round(2080::numeric / 52, 2);
  END IF;

  -- Esta migracao NAO mexe em politicas. Se o numero mudou, alguem
  -- acrescentou aqui algo que nao devia.
  SELECT count(*) INTO v_politicas
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_vinculos';

  IF v_politicas <> 4 THEN
    RAISE EXCEPTION
      'pessoas_vinculos ficou com % politicas e esperavam-se 4. Esta migracao nao devia ter tocado em politica nenhuma.',
      v_politicas;
  END IF;

  RAISE NOTICE
    'OK: horas_semanais renomeada para horas_periodo (numeric(8,2)), horas_semanais_equivalentes gerada STORED, frequencia com as 4 hipoteses, 5 CHECKs de horas, limite unico de 80h no equivalente semanal. Implicados: diaria <= 16, semanal <= 80, mensal <= 346,67, anual <= 4160.';
END;
$conferir$;


-- ==============================================================================
-- ANTES DO db push
--
-- 1. Correr "supabase migration list" e confirmar que nao ha 20261120190000 ja
--    aplicado no remoto sem ficheiro local, e que 20261120060000 e
--    20261120140000 estao aplicadas.
--
-- 2. Esta migracao RENOMEIA uma coluna que a interface le. Entre o push e o
--    deploy do src, qualquer select a horas_semanais devolve erro de coluna
--    inexistente. A tabela esta vazia e o modulo nao esta em uso, mas a
--    migracao e a alteracao de src/types/hr.ts, usePessoa.ts, novaPessoa.ts,
--    SeccaoContrato.tsx e PessoaContratoTab.tsx tem de ir NO MESMO COMMIT.
--
-- 3. Correr os testes ANTES do push, contra o remoto ainda por corrigir -- e ai
--    que o defeito ainda existe legitimamente. Depois de aplicada, nao se volta
--    atras para demonstrar: a base e partilhada por organizacoes com dados
--    reais.
-- ==============================================================================
