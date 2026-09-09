-- ==============================================================================
-- O tempo de trabalho do contrato: 8 colunas novas em pessoas_vinculos.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- O passo 4 do formulario de criar pessoa recolhe informacao de contrato que
-- nao tem onde ser guardada. pessoas_vinculos (20261120060000) tem o tipo, o
-- regime, as horas semanais, as datas e a data-limite do periodo experimental,
-- mas nao tem nada do resto que o utilizador mostrou nos ecras: tipo de
-- trabalho, frequencia das horas, tempo de trabalho em percentagem, dias
-- uteis, politica de trabalho em feriados, maximo de horas anuais e semanais,
-- e a DURACAO do periodo experimental.
--
--
-- -- A DECISAO: ESTENDER pessoas_vinculos, NAO CRIAR TABELA NOVA ---------------
--
-- Justificacao em tres pontos, porque a pergunta foi feita explicitamente:
--
-- 1. A CARDINALIDADE E A MESMA. Todos os 8 campos sao atributos de UM
--    contrato: o tipo de trabalho, a frequencia das horas, o FTE, os dias
--    uteis, os maximos e a politica de feriados nao existem sem o contrato e
--    nao se repetem dentro dele. Uma tabela nova seria um 1:1 com
--    pessoas_vinculos e forcaria um join em todas as leituras para nao ganhar
--    nada.
--
-- 2. A PLUMBING CERTA JA ESTA LA E E CARISSIMA DE DUPLICAR. pessoas_vinculos
--    tem a FK composta (pessoa_id, organization_id) -> pessoas, a unique
--    (id, pessoa_id, organization_id) que e alvo das FKs das retribuicoes, o
--    indice unico parcial de um-so-vinculo-activo, soft delete, os triggers de
--    updated_at e de ancora imutavel, as 4 politicas RLS ja com o ramo de
--    ficha-propria de 20261120090000, e o DELETE bloqueado por politica
--    restritiva. Uma tabela paralela obrigava a replicar tudo isto e a manter
--    dois conjuntos de politicas em sincronia -- e e assim que uma delas fica
--    para tras.
--
-- 3. O HISTORICO VERSIONADO TEM DE SER O MESMO. Se as horas de trabalho
--    vivessem noutra tabela, uma alteracao de jornada nao criaria uma versao
--    nova de contrato -- ficaria a alterar o passado sem que o vinculo o
--    registasse. Estando na mesma linha, passar de 40h para 20h obriga a
--    fechar o vinculo e abrir outro, que e o comportamento correcto e o que
--    sustenta um recibo ou uma inspeccao.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Oito colunas ADITIVAS. Nada e renomeado e nada e removido:
--
--   tipo_trabalho            presencial / remoto / hibrido
--   horas_frequencia         semanal  (unica hipotese aceita -- ver a seccao
--                            "A UNIDADE DAS HORAS" mais abaixo)
--   tempo_trabalho_pct       o FTE, 0 a 100
--   dias_uteis               text[] no dominio {seg..dom}
--   politica_feriados        nao_laboral / trabalho_habitual
--   horas_anuais_maximas     numeric, 0 a 4000
--   horas_semanais_maximas   numeric, 0 a 80, nunca abaixo de horas_semanais
--   periodo_experimental_dias  a duracao, ao lado da data que ja existia
--
-- Tres armadilhas de nomenclatura que ficam registadas em COMMENT, porque sao
-- confusoes que ja custaram tempo a alguem:
--
-- - tipo_trabalho NAO E regime. regime e tempo_inteiro/tempo_parcial (quanto
--   se trabalha); tipo_trabalho e presencial/remoto/hibrido (onde). Sao
--   ortogonais: ha quem esteja a tempo parcial em regime remoto.
--
-- - horas_semanais MANTEM O NOME e MANTEM A UNIDADE: semanas. horas_frequencia
--   ao lado diz a unidade por escrito, mas so aceita 'semanal' -- pelo motivo
--   da seccao seguinte. Renomear uma coluna com politicas e codigo a apontar
--   para ela seria trocar um nome imperfeito por uma migracao de risco.
--
-- - periodo_experimental_dias NAO SUBSTITUI periodo_experimental_ate. O
--   Factorial recolhe a duracao, o produto ja guardava a data, e as duas
--   coexistem. Regra de escrita, que e do UI e NAO da base: quando a duracao
--   e preenchida e a data nao, o UI calcula data_inicio + dias. A base NAO o
--   faz por trigger, de proposito -- um trigger a derivar uma das duas criaria
--   duas fontes de verdade que divergem em silencio na primeira vez que
--   alguem escreve so a outra.
--
-- dias_uteis usa DELIBERADAMENTE o mesmo dominio {seg,ter,qua,qui,sex,sab,dom}
-- de pessoas.dias_trabalho. A partir daqui, os dias uteis do CONTRATO sao a
-- fonte de verdade e pessoas.dias_trabalho passa a legenda legada -- fica dito
-- em COMMENT, sem migracao de dados nesta ronda.
--
--
-- -- A UNIDADE DAS HORAS: SO 'semanal', E PORQUE ------------------------------
--
-- Uma primeira versao desta migracao dava a horas_frequencia o dominio
-- semanal/mensal/anual. Estava errada, e a revisao apanhou-o antes de isto
-- chegar a base nenhuma: o CHECK pessoas_vinculos_horas_validas, criado em
-- 20261120060000 e NAO tocado aqui, limita horas_semanais a 0..80. Com
-- frequencia 'mensal' (160h) ou 'anual' (2000h) o INSERT violava sempre esse
-- CHECK -- duas das tres opcoes nasciam inutilizaveis, e o utilizador
-- descobria-o com um erro de constraint em vez de um campo desactivado.
--
-- ESCOLHA: restringir o dominio a 'semanal'. horas_semanais e, sem ambiguidade,
-- horas por semana, e o 0..80 da ronda 1 continua a ser a regra certa. A coluna
-- fica, com o default 'semanal', porque e ela que torna a unidade explicita na
-- base para quem ler a tabela; ganha as outras hipoteses quando -- e SE -- o
-- resto do modelo as souber tratar.
--
-- POR QUE SE REJEITOU A ALTERNATIVA (limites dependentes da frequencia, do
-- genero "0..80 se semanal, 0..350 se mensal, 0..4000 se anual"):
--
-- 1. NAO IMPEDE O VALOR INCOERENTE, QUE E O QUE SE QUERIA IMPEDIR. Os
--    intervalos plausiveis sobrepoem-se: 40 e um valor legal como horas
--    semanais de tempo inteiro E como horas mensais de um 9h/semana. Quem
--    escolhesse a unidade errada no ecra passava o CHECK e ficava com um
--    contrato de tempo inteiro guardado como quase-nada -- ou o contrario. A
--    base deixaria de rejeitar o unico erro que ali importa.
--
-- 2. CONTAMINA horas_semanais_maximas. O CHECK cruzado
--    pessoas_vinculos_maximo_acima_do_contratado compara-a com horas_semanais.
--    Se horas_semanais passasse a valer 160 por ser mensal, o maximo SEMANAL
--    tinha de ser >= 160 para o cruzamento passar: uma coluna cuja unidade
--    depende, em silencio, do valor de outra coluna. Salvar isso exigia ou
--    factores de conversao (4,345 e 52) enterrados num CHECK, ou uma segunda
--    coluna de frequencia para o maximo -- e depois uma terceira para o maximo
--    anual. Tres colunas de horas com unidades independentes e a receita para
--    somas erradas em cima.
--
-- 3. A APLICACAO JA TRATA AS HORAS COMO SEMANAIS. O formulario e o separador de
--    contrato limitam o campo a max=80 e validam 0..80 sem olhar a frequencia
--    (src/lib/hr/novaPessoa.ts, SeccaoContrato.tsx, PessoaContratoTab.tsx).
--    Alargar a base sem reescrever essa validacao punha as duas metades a
--    discordar; restringir a base poe-nas de acordo.
--
-- CONSEQUENCIA PARA O UI, dita aqui por escrito para ninguem tentar guardar o
-- que a base nao aceita: a lista de hipoteses (HORAS_FREQUENCIAS em
-- src/types/hr.ts) passa a ter so 'semanal'. Um INSERT com 'mensal' ou 'anual'
-- e recusado pelo CHECK, nao silenciosamente convertido.
--
-- NAO SE TOCA EM CONSTRAINT NENHUMA DA RONDA 1. Esta e a segunda razao para
-- preferir esta saida: pessoas_vinculos_horas_validas (0..80) fica exactamente
-- como 20261120060000 a criou, sem DROP/ADD de constraints de um ficheiro que
-- ja esta aplicado no ramo. A guarda abaixo confirma que ela continua la e que
-- continua a ser o limite semanal que esta escolha pressupoe.
--
--
-- -- A POLITICA DE FERIADOS E UMA COLUNA, NAO UM CALENDARIO --------------------
--
-- schedule_holidays ja existe (por pais/organizacao) mas nao esta ligada a
-- pessoas e nao tem feriado municipal. Ligar o vinculo a calendarios de
-- feriados e trabalho de outra ronda; um CHECK de duas hipoteses resolve o
-- campo que o utilizador mostrou no ecra, e nao finge resolver mais do que
-- isso.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - NENHUMA POLITICA RLS E TOCADA. As colunas novas herdam as 4 politicas
--   existentes de pessoas_vinculos, incluindo o ramo de ficha-propria que
--   20261120090000 acrescentou ao SELECT. Quem vier a mexer nelas mais tarde
--   parte da versao de 20261120090000 linha 357, NAO da de 20261120060000 --
--   ja houve nesta base uma correccao escrita contra uma versao antiga que
--   ressuscitou o comportamento anterior.
-- - Nao se renomeia nem se remove coluna nenhuma.
-- - Nao se toca em pessoas.dias_trabalho a nao ser por COMMENT.
-- - Nao se cria calendario de feriados, nem se liga a schedule_holidays.
-- - Nada de processamento de salarios: a retribuicao continua em
--   pessoas_retribuicoes e esta migracao nao lhe toca.
-- - Nao se instala extensao nenhuma.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   ALTER TABLE public.pessoas_vinculos
--     DROP COLUMN IF EXISTS tipo_trabalho,
--     DROP COLUMN IF EXISTS horas_frequencia,
--     DROP COLUMN IF EXISTS tempo_trabalho_pct,
--     DROP COLUMN IF EXISTS dias_uteis,
--     DROP COLUMN IF EXISTS politica_feriados,
--     DROP COLUMN IF EXISTS horas_anuais_maximas,
--     DROP COLUMN IF EXISTS horas_semanais_maximas,
--     DROP COLUMN IF EXISTS periodo_experimental_dias;
-- Os CHECKs caem com as colunas. Isto apaga informacao de contrato -- exportar
-- antes.
--
--
-- Prerequisitos:
--   20261120060000  pessoas_vinculos (e a unique pessoas_vinculos_id_pessoa_org_key)
--
-- AVISO AO ORQUESTRADOR: esta migracao faz ALTER TABLE e falha se
-- pessoas_vinculos nao existir no remoto. O cabecalho de 20261120060000 diz
-- "POR APLICAR", o que contradiz a informacao de que a ronda 1 esta aplicada.
-- Correr "supabase migration list --linked" ANTES de aplicar esta. A guarda
-- abaixo apanha o caso, mas mais vale saber antes de o push falhar a meio.
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_horas_validas text;
BEGIN
  IF to_regclass('public.pessoas_vinculos') IS NULL THEN
    RAISE EXCEPTION
      'public.pessoas_vinculos nao existe. Aplicar 20261120060000 primeiro. Confirmar com "supabase migration list --linked" que a ronda 1 esta toda aplicada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_id_pessoa_org_key'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    RAISE EXCEPTION
      'Existe public.pessoas_vinculos mas sem a constraint pessoas_vinculos_id_pessoa_org_key. Nao e a tabela de 20261120060000 -- ha uma colisao de nome. Investigar antes de aplicar.';
  END IF;

  -- As colunas que os CHECKs novos referem cruzadamente tem de estar la.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos'
       AND column_name = 'horas_semanais'
  ) THEN
    RAISE EXCEPTION
      'pessoas_vinculos nao tem a coluna horas_semanais; o CHECK que compara horas_semanais_maximas com ela nao pode ser criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos'
       AND column_name = 'periodo_experimental_ate'
  ) THEN
    RAISE EXCEPTION
      'pessoas_vinculos nao tem a coluna periodo_experimental_ate. Esta migracao acrescenta a duracao AO LADO dela, nao em vez dela -- confirmar o estado real.';
  END IF;

  -- regime tem de existir, senao o COMMENT que distingue tipo_trabalho de
  -- regime fica a falar de uma coluna que nao ha.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos'
       AND column_name = 'regime'
  ) THEN
    RAISE EXCEPTION 'pessoas_vinculos nao tem a coluna regime. Estado inesperado.';
  END IF;

  -- O limite 0..80 da ronda 1 e a PREMISSA da escolha de restringir
  -- horas_frequencia a 'semanal'. Se ele tiver desaparecido ou mudado, a
  -- justificacao do cabecalho deixou de descrever a base -- avisa-se, alto,
  -- sem parar o push: a restricao do dominio continua correcta por si.
  SELECT pg_get_constraintdef(oid) INTO v_horas_validas
    FROM pg_constraint
   WHERE conname = 'pessoas_vinculos_horas_validas'
     AND conrelid = to_regclass('public.pessoas_vinculos');

  IF v_horas_validas IS NULL THEN
    RAISE WARNING
      'O CHECK pessoas_vinculos_horas_validas (0..80 em horas_semanais, de 20261120060000) nao existe. A seccao "A UNIDADE DAS HORAS" do cabecalho desta migracao assume que existe -- reler antes de alargar horas_frequencia.';
  ELSIF v_horas_validas NOT LIKE '%80%' THEN
    RAISE WARNING
      'pessoas_vinculos_horas_validas existe mas nao e o limite 0..80 esperado: %. Confirmar a unidade de horas_semanais antes de mexer em horas_frequencia.',
      v_horas_validas;
  END IF;

  RAISE NOTICE 'Guardas passadas: pessoas_vinculos existe com a unique e as colunas esperadas.';
END;
$guardas$;

-- ---- As oito colunas -------------------------------------------------------
ALTER TABLE public.pessoas_vinculos
  ADD COLUMN IF NOT EXISTS tipo_trabalho             text,
  ADD COLUMN IF NOT EXISTS horas_frequencia          text NOT NULL DEFAULT 'semanal',
  ADD COLUMN IF NOT EXISTS tempo_trabalho_pct        numeric(5,2),
  ADD COLUMN IF NOT EXISTS dias_uteis                text[],
  ADD COLUMN IF NOT EXISTS politica_feriados         text NOT NULL DEFAULT 'nao_laboral',
  ADD COLUMN IF NOT EXISTS horas_anuais_maximas      numeric(7,2),
  ADD COLUMN IF NOT EXISTS horas_semanais_maximas    numeric(5,2),
  ADD COLUMN IF NOT EXISTS periodo_experimental_dias integer;

-- ---- Os CHECKs -------------------------------------------------------------
-- ADD CONSTRAINT nao tem IF NOT EXISTS, por isso cada um vai dentro de um DO
-- com a verificacao em pg_constraint. Sem isto, reaplicar a migracao lanca
-- 42710 e o push para a meio.
DO $checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_tipo_trabalho_valido'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    ALTER TABLE public.pessoas_vinculos
      ADD CONSTRAINT pessoas_vinculos_tipo_trabalho_valido CHECK (
        tipo_trabalho IS NULL OR tipo_trabalho IN ('presencial','remoto','hibrido')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_horas_frequencia_valida'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    ALTER TABLE public.pessoas_vinculos
      -- SO 'semanal'. Ver a seccao "A UNIDADE DAS HORAS" no cabecalho: com
      -- 'mensal' ou 'anual' a linha violaria sempre o CHECK
      -- pessoas_vinculos_horas_validas (0..80) da ronda 1, e alargar esse
      -- limite por frequencia deixaria de apanhar a unidade trocada.
      ADD CONSTRAINT pessoas_vinculos_horas_frequencia_valida CHECK (
        horas_frequencia IN ('semanal')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_tempo_trabalho_pct_valido'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    ALTER TABLE public.pessoas_vinculos
      ADD CONSTRAINT pessoas_vinculos_tempo_trabalho_pct_valido CHECK (
        tempo_trabalho_pct IS NULL OR (tempo_trabalho_pct >= 0 AND tempo_trabalho_pct <= 100)
      );
  END IF;

  -- Mesmo dominio de pessoas.dias_trabalho, deliberadamente.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_dias_uteis_validos'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    ALTER TABLE public.pessoas_vinculos
      ADD CONSTRAINT pessoas_vinculos_dias_uteis_validos CHECK (
        dias_uteis IS NULL
        OR dias_uteis <@ ARRAY['seg','ter','qua','qui','sex','sab','dom']::text[]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_politica_feriados_valida'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    ALTER TABLE public.pessoas_vinculos
      ADD CONSTRAINT pessoas_vinculos_politica_feriados_valida CHECK (
        politica_feriados IN ('nao_laboral','trabalho_habitual')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_horas_anuais_maximas_validas'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    ALTER TABLE public.pessoas_vinculos
      ADD CONSTRAINT pessoas_vinculos_horas_anuais_maximas_validas CHECK (
        horas_anuais_maximas IS NULL
        OR (horas_anuais_maximas >= 0 AND horas_anuais_maximas <= 4000)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_horas_semanais_maximas_validas'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    ALTER TABLE public.pessoas_vinculos
      ADD CONSTRAINT pessoas_vinculos_horas_semanais_maximas_validas CHECK (
        horas_semanais_maximas IS NULL
        OR (horas_semanais_maximas >= 0 AND horas_semanais_maximas <= 80)
      );
  END IF;

  -- Um maximo abaixo do contratado nao e um maximo: e um erro de digitacao a
  -- passar por regra. A comparacao so faz sentido porque as duas colunas estao
  -- na MESMA unidade -- o que e garantido por horas_frequencia so aceitar
  -- 'semanal'. Alargar essa frequencia sem tratar disto poe este CHECK a
  -- comparar horas mensais com horas semanais.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_maximo_acima_do_contratado'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    ALTER TABLE public.pessoas_vinculos
      ADD CONSTRAINT pessoas_vinculos_maximo_acima_do_contratado CHECK (
        horas_semanais IS NULL
        OR horas_semanais_maximas IS NULL
        OR horas_semanais_maximas >= horas_semanais
      );
  END IF;

  -- 1095 dias = 3 anos. Nenhum periodo experimental legal chega la perto; o
  -- limite existe para apanhar quem escreve anos no campo dos dias.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_periodo_experimental_dias_valido'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    ALTER TABLE public.pessoas_vinculos
      ADD CONSTRAINT pessoas_vinculos_periodo_experimental_dias_valido CHECK (
        periodo_experimental_dias IS NULL
        OR (periodo_experimental_dias >= 0 AND periodo_experimental_dias <= 1095)
      );
  END IF;
END;
$checks$;

-- ---- COMMENTs: as tres armadilhas de nomenclatura --------------------------
COMMENT ON COLUMN public.pessoas_vinculos.tipo_trabalho IS
'ONDE se trabalha: presencial, remoto ou hibrido. NAO E o regime -- regime e tempo_inteiro/tempo_parcial, que e QUANTO se trabalha. Sao ortogonais: ha quem esteja a tempo parcial em regime remoto. Confundir os dois foi a primeira coisa que correu mal a ler estes ecras.';

COMMENT ON COLUMN public.pessoas_vinculos.horas_frequencia IS
'A unidade de horas_semanais. Por agora ACEITA APENAS ''semanal'', por CHECK: horas_semanais esta limitada a 0..80 por pessoas_vinculos_horas_validas (20261120060000), e com unidade mensal (160h) ou anual (2000h) qualquer linha violaria esse limite. A coluna existe para tornar a unidade explicita na base, nao para a variar -- alargar o dominio obriga a rever, ao mesmo tempo, esse limite, o maximo semanal e a validacao 0..80 do formulario. Nao se converte nada em silencio: ''mensal'' e ''anual'' sao recusados.';

COMMENT ON COLUMN public.pessoas_vinculos.periodo_experimental_dias IS
'A DURACAO do periodo experimental, em dias. NAO SUBSTITUI periodo_experimental_ate, que continua a existir: o formulario recolhe a duracao, o produto ja guardava a data-limite, e as duas coexistem. Regra de escrita do UI, e NAO da base: quando a duracao esta preenchida e a data nao, o UI calcula data_inicio + dias. A base nao deriva nenhuma das duas por trigger, de proposito -- derivar criaria duas fontes de verdade a divergir em silencio.';

COMMENT ON COLUMN public.pessoas_vinculos.dias_uteis IS
'Dias uteis do CONTRATO, no dominio {seg,ter,qua,qui,sex,sab,dom} -- deliberadamente o mesmo de pessoas.dias_trabalho. A partir desta migracao, ESTA e a fonte de verdade e pessoas.dias_trabalho passa a legenda legada. Nao houve migracao de dados: as fichas antigas podem ter dias_trabalho preenchido e dias_uteis nulo.';

COMMENT ON COLUMN public.pessoas_vinculos.tempo_trabalho_pct IS
'O FTE, em percentagem de 0 a 100. 50 = meio tempo. Nao e derivado de horas_semanais nem a valida: um contrato pode ter as duas coisas incoerentes se quem o escreveu as escreveu incoerentes, e a base nao adivinha qual esta certa.';

COMMENT ON COLUMN public.pessoas_vinculos.politica_feriados IS
'nao_laboral = o feriado nao se trabalha; trabalho_habitual = trabalha-se como em qualquer outro dia. E uma coluna de duas hipoteses e NAO um calendario: schedule_holidays existe mas nao esta ligada a pessoas nem tem feriado municipal, e ligar o vinculo a calendarios e trabalho de outra ronda.';

COMMENT ON COLUMN public.pessoas_vinculos.horas_semanais_maximas IS
'Limite superior de horas por semana -- SEMANA, sempre, tal como horas_semanais: horas_frequencia so aceita ''semanal'', por isso o CHECK pessoas_vinculos_maximo_acima_do_contratado compara duas grandezas na mesma unidade. Nunca abaixo de horas_semanais, garantido por esse CHECK: um maximo abaixo do contratado e um erro de digitacao a passar por regra. NAO tem relacao imposta com horas_anuais_maximas -- 52 semanas de maximo semanal dao mais do que o maximo anual em qualquer contrato com ferias, e um CHECK a cruza-los rejeitaria contratos validos.';

COMMENT ON COLUMN public.pessoas_vinculos.horas_anuais_maximas IS
'Limite superior de horas por ano. Limitado a 4000 por CHECK -- um ano tem 8760 horas e nenhum contrato legal chega perto de metade; o limite existe para apanhar dedadas.';

-- pessoas.dias_trabalho passa a legado. Nao se apaga e nao se migra nesta
-- ronda: ver 20261120170000 e o motivo la escrito sobre backfills em
-- organizacoes que nao a nike.
COMMENT ON COLUMN public.pessoas.dias_trabalho IS
'LEGADO desde 20261120140000. A fonte de verdade dos dias de trabalho passou a ser pessoas_vinculos.dias_uteis, que pertence ao contrato e por isso e versionada no tempo. Esta coluna nao foi apagada nem migrada -- pode ter valor em fichas criadas antes. Ler o vinculo primeiro e usar isto so como recurso.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_colunas    integer;
  v_checks     integer;
  v_politicas  integer;
  v_falta      text;
  v_freq_def   text;
  v_novas      text[] := ARRAY[
    'tipo_trabalho',
    'horas_frequencia',
    'tempo_trabalho_pct',
    'dias_uteis',
    'politica_feriados',
    'horas_anuais_maximas',
    'horas_semanais_maximas',
    'periodo_experimental_dias'
  ];
  v_nomes_check text[] := ARRAY[
    'pessoas_vinculos_tipo_trabalho_valido',
    'pessoas_vinculos_horas_frequencia_valida',
    'pessoas_vinculos_tempo_trabalho_pct_valido',
    'pessoas_vinculos_dias_uteis_validos',
    'pessoas_vinculos_politica_feriados_valida',
    'pessoas_vinculos_horas_anuais_maximas_validas',
    'pessoas_vinculos_horas_semanais_maximas_validas',
    'pessoas_vinculos_maximo_acima_do_contratado',
    'pessoas_vinculos_periodo_experimental_dias_valido'
  ];
BEGIN
  SELECT count(*) INTO v_colunas
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos'
     AND column_name = ANY (v_novas);

  IF v_colunas <> 8 THEN
    SELECT string_agg(c, ', ' ORDER BY c) INTO v_falta
      FROM unnest(v_novas) AS c
     WHERE NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos' AND column_name = c
     );
    RAISE EXCEPTION
      'Esperavam-se 8 colunas novas em pessoas_vinculos, encontraram-se %. Em falta: %',
      v_colunas, coalesce(v_falta, '(nenhuma identificada)');
  END IF;

  SELECT count(*) INTO v_checks
    FROM pg_constraint
   WHERE conrelid = to_regclass('public.pessoas_vinculos')
     AND conname = ANY (v_nomes_check);

  IF v_checks <> 9 THEN
    SELECT string_agg(c, ', ' ORDER BY c) INTO v_falta
      FROM unnest(v_nomes_check) AS c
     WHERE NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conrelid = to_regclass('public.pessoas_vinculos') AND conname = c
     );
    RAISE EXCEPTION
      'Esperavam-se 9 CHECKs novos em pessoas_vinculos, encontraram-se %. Em falta: %',
      v_checks, coalesce(v_falta, '(nenhum identificado)');
  END IF;

  -- O dominio de horas_frequencia tem de ficar com UMA hipotese. Se alguem
  -- reintroduzir 'mensal' ou 'anual' sem tratar do limite 0..80 e do maximo
  -- semanal, e aqui que se sabe.
  SELECT pg_get_constraintdef(oid) INTO v_freq_def
    FROM pg_constraint
   WHERE conname = 'pessoas_vinculos_horas_frequencia_valida'
     AND conrelid = to_regclass('public.pessoas_vinculos');

  IF v_freq_def IS NULL OR v_freq_def LIKE '%mensal%' OR v_freq_def LIKE '%anual%' THEN
    RAISE EXCEPTION
      'pessoas_vinculos_horas_frequencia_valida devia aceitar apenas ''semanal'' e aceita: %. Ler a seccao "A UNIDADE DAS HORAS" do cabecalho: com mensal ou anual, horas_semanais viola sempre o limite 0..80 da ronda 1.',
      coalesce(v_freq_def, '(constraint ausente)');
  END IF;

  -- O ponto que interessa mais: esta migracao NAO pode ter mexido em politica
  -- nenhuma. Se o numero de politicas mudou, alguem acrescentou algo aqui que
  -- nao devia.
  SELECT count(*) INTO v_politicas
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_vinculos';

  IF v_politicas <> 4 THEN
    RAISE EXCEPTION
      'pessoas_vinculos tem % politicas e deviam ser as 4 de sempre. Esta migracao nao toca em politicas -- investigar.', v_politicas;
  END IF;

  -- O ramo de ficha-propria de 20261120090000 tem de continuar la. Se
  -- desapareceu, alguem reescreveu a politica de SELECT a partir da versao
  -- antiga de 20261120060000.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_vinculos'
       AND policyname = 'pessoas_vinculos_select'
       AND coalesce(qual, '') LIKE '%hr_pessoa_do_utilizador%'
  ) THEN
    RAISE EXCEPTION
      'A politica pessoas_vinculos_select perdeu o ramo de ficha-propria (hr_pessoa_do_utilizador) que 20261120090000 lhe acrescentou. Alguem a reescreveu a partir da versao antiga de 20261120060000.';
  END IF;

  RAISE NOTICE
    'OK: 8 colunas de tempo de trabalho e 9 CHECKs em pessoas_vinculos; as 4 politicas intactas e o ramo de ficha-propria preservado. Nenhuma tabela nova de contratos -- ver a justificacao no cabecalho.';
END;
$conferir$;
