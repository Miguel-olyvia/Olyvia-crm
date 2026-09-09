-- ==============================================================================
-- Alarga dois dominios pedidos pelo utilizador: periodicidade do vencimento
-- (tres valores -> cinco) e tipo de contrato (+ duracao muito curta e
-- + tempo parcial, os SEIS que o utilizador listou).
--
-- POR APLICAR.
--
--
-- -- O QUE O UTILIZADOR PEDIU --------------------------------------------------
--
-- Periodicidade do montante de vencimento: por hora, diariamente, semanalmente,
-- mensalmente, anualmente. Hoje pessoas_retribuicoes.periodicidade aceita tres:
-- 'mensal', 'anual', 'hora' (20261120060000, linha 347).
--
-- Tipo de contrato: Termo certo, Sem Termo, Termo Incerto, Duracao muito curta,
-- Temporario, Tempo parcial -- SEIS, e os seis entram. Hoje
-- pessoas_vinculos.tipo_contrato aceita seis outros: sem_termo, termo_certo,
-- termo_incerto, estagio, prestacao_servicos, temporario (20261120060000,
-- linha 221). Acrescentam-se DOIS codigos novos: 'duracao_muito_curta' e
-- 'tempo_parcial'. Ficam OITO no dominio, SEIS oferecidos no ecra.
--
--
-- -- A REGRA DOS CODIGOS ------------------------------------------------------
--
-- O codigo na coluna e snake_case sem acentos e NUNCA muda; a etiqueta vive so
-- em src/translations/index.ts. Onde ja existe um codigo, mantem-se mesmo que a
-- palavra que o utilizador escreveu seja outra: mudar 'hora' para 'horaria' ou
-- 'mensal' para 'mensalmente' so para casar com o rotulo seria reescrever dados
-- por causa de um texto de ecra. As tres periodicidades que ja existem mudam de
-- ETIQUETA (de "Mensal" para "Mensalmente") e nao de codigo.
--
-- Acrescentam-se, portanto, dois codigos e nao cinco: 'diaria' e 'semanal'.
--
--
-- -- "TEMPO PARCIAL" ENTRA COMO TIPO DE CONTRATO -- DECIDIDO --------------------
--
-- Foi o sexto valor pedido. A ronda anterior deixou-o de fora e escreveu aqui
-- a razao: no mesmo pedido a lista seguinte e "Tipo de trabalho: Tempo
-- integral, Tempo parcial", que e pessoas_vinculos.regime -- confirmado por
-- leitura, CHECK (regime IN ('tempo_inteiro','tempo_parcial')), linha 223 de
-- 20261120060000 -- e portanto o valor sobrepoe-se a um campo que ja existe.
--
-- O utilizador decidiu, por escrito e com captura de ecra, que quer os SEIS.
-- A decisao esta tomada e NAO se reabre: 'tempo_parcial' passa a ser um tipo
-- de contrato legal, com codigo igual ao dos outros -- snake_case, sem acentos,
-- estavel. A etiqueta "Tempo parcial" vive em src/translations/index.ts, como
-- todas as outras.
--
--
-- -- E A CONTRADICAO tipo_contrato='tempo_parcial' + regime='tempo_inteiro'? ---
--
-- E real, e fica ACEITE -- sem CHECK a impedi-la. Nao e desatencao; e a escolha
-- menos danosa das duas, por tres razoes, a primeira decisiva:
--
-- 1. regime e NOT NULL DEFAULT 'tempo_inteiro' (20261120060000, linha 209). Um
--    CHECK do genero "tipo_contrato='tempo_parcial' implica
--    regime='tempo_parcial'" faria REBENTAR o INSERT mais obvio que existe:
--    escolher "Tempo parcial" no tipo de contrato e nao mexer no regime, que
--    entra por omissao a tempo_inteiro. A base nao consegue distinguir um
--    regime ESCOLHIDO de um regime que veio do DEFAULT -- e por isso o CHECK
--    recusaria exactamente a linha que o utilizador acabou de pedir para poder
--    gravar. Trocar a incoerencia por um erro ao gravar e piorar.
--
-- 2. Sendo um CHECK entre duas colunas, e sensivel a ORDEM das escritas.
--    Passar de (tempo_parcial, tempo_parcial) para (sem_termo, tempo_inteiro)
--    em dois UPDATEs -- que e como um formulario que grava campo a campo faz --
--    passa numa ordem e rebenta na outra, com um erro que nao explica nada a
--    quem esta no ecra.
--
-- 3. tipo_contrato nao e, nesta tabela, um campo de invariantes: e uma
--    classificacao. Aceita de proposito valores que o ecra nem oferece
--    (estagio, prestacao_servicos) e nenhuma outra coluna de pessoas_vinculos
--    tem CHECK cruzado tirando a ordem das datas. E o campo com que se conta
--    para as horas e regime, nao tipo_contrato: horas_semanais_equivalentes
--    depende de horas_periodo/horas_frequencia, nao daqui.
--
-- Onde se resolve, entao: no caminho de ESCRITA, nao no dominio. Ao escolher
-- "Tempo parcial" como tipo de contrato o formulario deve por regime a
-- 'tempo_parcial' (uma linha de TypeScript, reversivel), e a incoerencia
-- residual e materia de relatorio de qualidade de dados, nao de restricao que
-- impede gravar.
--
--
-- -- estagio e prestacao_servicos: saem do ECRA, ficam na BASE ----------------
--
-- A lista que o utilizador escreveu nao os inclui. Ficam no CHECK: a base
-- continua a aceita-los, o formulario deixa de os propor (TIPOS_CONTRATO em
-- src/types/hr.ts). Duas razoes. Primeira: se ele os quiser de volta, e uma
-- linha de TypeScript e nao uma migracao. Segunda, e a que decide: largar um
-- valor do dominio torna ILEGAL qualquer linha que ja o tivesse -- e um dominio
-- so encolhe depois de se provar que ninguem o usa, o que nao se provou.
--
--
-- -- horas_frequencia nao vem aqui -------------------------------------------
--
-- A quarta lista do pedido (Frequencia das horas de trabalho: dia, semana, mes,
-- ano) e pessoas_vinculos.horas_frequencia, e ja foi tratada em
-- 20261120190000, junto com a unidade canonica de que depende. Nao se reabre.
--
-- Tambem nao se toca em regime nem em tipo_trabalho: "Tipo de trabalho" e
-- "Modalidade" sao trabalho de etiqueta na interface, e os dominios da base
-- ja estao certos.
-- ==============================================================================


-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_tipo_def  text;
  v_per_def   text;
  v_nome_tipo text;
BEGIN
  IF to_regclass('public.pessoas_vinculos') IS NULL THEN
    RAISE EXCEPTION
      'public.pessoas_vinculos nao existe -- 20261120060000 tem de ir a frente na fila.';
  END IF;

  IF to_regclass('public.pessoas_retribuicoes') IS NULL THEN
    RAISE EXCEPTION
      'public.pessoas_retribuicoes nao existe -- 20261120060000 tem de ir a frente na fila.';
  END IF;

  -- ATENCAO ao nome. O plano desta ronda falava de
  -- "pessoas_vinculos_tipo_contrato_valido"; a leitura de 20261120060000
  -- (linha 220) mostra que o CHECK se chama pessoas_vinculos_tipo_valido, sem
  -- "contrato". Um DROP pelo nome errado nao da erro (IF EXISTS) e deixaria o
  -- dominio antigo de pe ao lado do novo -- por isso confirma-se aqui qual dos
  -- dois nomes existe, em vez de se assumir.
  SELECT conname INTO v_nome_tipo
    FROM pg_constraint
   WHERE conrelid = to_regclass('public.pessoas_vinculos')
     AND conname IN ('pessoas_vinculos_tipo_valido', 'pessoas_vinculos_tipo_contrato_valido')
   ORDER BY conname
   LIMIT 1;

  IF v_nome_tipo IS NULL THEN
    RAISE EXCEPTION
      'Nao existe em pessoas_vinculos nenhum CHECK chamado pessoas_vinculos_tipo_valido nem pessoas_vinculos_tipo_contrato_valido. O dominio de tipo_contrato nao esta onde se esperava -- investigar antes de aplicar, para nao ficar tabela sem restricao de tipo.';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_tipo_def
    FROM pg_constraint
   WHERE conrelid = to_regclass('public.pessoas_vinculos') AND conname = v_nome_tipo;

  -- Se ja aceita os dois codigos novos, a migracao ja correu: segue idempotente.
  IF v_tipo_def LIKE '%duracao_muito_curta%' AND v_tipo_def LIKE '%tempo_parcial%' THEN
    RAISE NOTICE 'tipo_contrato ja aceita duracao_muito_curta e tempo_parcial. Segue idempotente.';
  ELSIF v_tipo_def NOT LIKE '%prestacao_servicos%' THEN
    RAISE EXCEPTION
      'O CHECK % nao tem a forma esperada de 20261120060000 (falta prestacao_servicos): %. Alguem o alterou entretanto -- reler antes de o substituir, para nao largar valores que estao em uso.',
      v_nome_tipo, v_tipo_def;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_per_def
    FROM pg_constraint
   WHERE conrelid = to_regclass('public.pessoas_retribuicoes')
     AND conname = 'pessoas_retribuicoes_periodicidade_valida';

  IF v_per_def IS NULL THEN
    RAISE EXCEPTION
      'pessoas_retribuicoes_periodicidade_valida nao existe. O dominio da periodicidade nao esta onde se esperava -- investigar antes de aplicar.';
  END IF;

  IF v_per_def NOT LIKE '%mensal%' OR v_per_def NOT LIKE '%hora%' THEN
    RAISE EXCEPTION
      'pessoas_retribuicoes_periodicidade_valida nao tem a forma esperada de 20261120060000: %. Reler antes de substituir.',
      v_per_def;
  END IF;

  RAISE NOTICE
    'Guardas passadas. O CHECK de tipo de contrato chama-se "%" e vale: %. Periodicidade actual: %',
    v_nome_tipo, coalesce(v_tipo_def, '(nao lido)'), v_per_def;
END;
$guardas$;


-- ---- 1. Periodicidade da retribuicao: cinco valores ------------------------
-- 'diaria' e 'semanal' sao os codigos NOVOS. 'hora', 'mensal' e 'anual'
-- mantem-se tal e qual -- muda-lhes a etiqueta, nao o codigo.
ALTER TABLE public.pessoas_retribuicoes
  DROP CONSTRAINT IF EXISTS pessoas_retribuicoes_periodicidade_valida;

ALTER TABLE public.pessoas_retribuicoes
  ADD CONSTRAINT pessoas_retribuicoes_periodicidade_valida CHECK (
    periodicidade IN ('hora','diaria','semanal','mensal','anual')
  );


-- ---- 2. Tipo de contrato: + duracao_muito_curta e + tempo_parcial ----------
-- Larga-se pelos DOIS nomes possiveis. Se o remoto tiver o nome sem "contrato"
-- (que e o que 20261120060000 escreveu) e nos so largassemos o outro, ficariam
-- duas restricoes a valer ao mesmo tempo e a antiga continuaria a recusar
-- duracao_muito_curta -- em silencio, porque um ADD com nome diferente passa.
ALTER TABLE public.pessoas_vinculos
  DROP CONSTRAINT IF EXISTS pessoas_vinculos_tipo_valido,
  DROP CONSTRAINT IF EXISTS pessoas_vinculos_tipo_contrato_valido;

ALTER TABLE public.pessoas_vinculos
  -- Mantem-se o nome original de 20261120060000. estagio e prestacao_servicos
  -- ficam: sao os que a base aceita e o ecra nao propoe (ver cabecalho).
  ADD CONSTRAINT pessoas_vinculos_tipo_valido CHECK (
    tipo_contrato IN (
      'termo_certo',
      'sem_termo',
      'termo_incerto',
      'duracao_muito_curta',
      'temporario',
      'tempo_parcial',
      'estagio',
      'prestacao_servicos'
    )
  );


-- ---- COMMENTs --------------------------------------------------------------
COMMENT ON COLUMN public.pessoas_retribuicoes.periodicidade IS
'A unidade de tempo a que valor_base se refere: hora, diaria, semanal, mensal ou anual. Passou de tres para cinco valores em 20261120200000, a pedido do utilizador. Os codigos NAO acompanham as etiquetas do ecra -- ''mensal'' mostra-se como "Mensalmente" e ''hora'' como "Por hora", e a traducao vive em src/translations/index.ts. NAO ha conversao entre periodicidades nesta tabela: valor_base guarda o que foi ACORDADO na unidade acordada, e comparar retribuicoes de periodicidades diferentes e trabalho de quem processa salarios -- que nao acontece aqui.';

COMMENT ON COLUMN public.pessoas_vinculos.tipo_contrato IS
'A natureza juridica do contrato. A base aceita OITO valores e o formulario propoe SEIS: estagio e prestacao_servicos continuam legais mas fora da lista que o utilizador pediu em 20261120200000 -- estao no CHECK porque encolher um dominio torna ilegais as linhas que ja o usam, e a lista oferecida vive em TIPOS_CONTRATO (src/types/hr.ts), onde volta a ser uma linha de TypeScript se ele os quiser de novo. NAO confundir com regime (tempo_inteiro/tempo_parcial, que o ecra chama "Tipo de trabalho") nem com tipo_trabalho (presencial/remoto/hibrido, que o ecra chama "Modalidade"). ATENCAO ao valor ''tempo_parcial'': foi pedido como sexto tipo de contrato e ESTA aceite por decisao do utilizador (20261120200000), pelo que se sobrepoe de proposito ao dominio de regime. NAO ha CHECK a impedir tipo_contrato=''tempo_parcial'' com regime=''tempo_inteiro'': regime e NOT NULL DEFAULT ''tempo_inteiro'', logo um CHECK cruzado recusaria o INSERT que so escolhe o tipo de contrato e deixa o regime por omissao -- trocava uma incoerencia por um erro ao gravar. Quem le esta coluna para saber se alguem esta a tempo parcial deve ler REGIME, nao daqui; a coerencia entre os dois e responsabilidade do caminho de escrita.';


-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_per_def   text;
  v_tipo_def  text;
  v_n_tipo    integer;
  v_politicas integer;
  v_reg_def   text;
  v_valor     text;
BEGIN
  -- Periodicidade: as cinco, e o dominio a valer.
  SELECT pg_get_constraintdef(oid) INTO v_per_def
    FROM pg_constraint
   WHERE conrelid = to_regclass('public.pessoas_retribuicoes')
     AND conname = 'pessoas_retribuicoes_periodicidade_valida';

  IF v_per_def IS NULL THEN
    RAISE EXCEPTION
      'pessoas_retribuicoes_periodicidade_valida desapareceu: a coluna ficou SEM dominio nenhum. Nao aplicar neste estado -- aceitaria qualquer texto.';
  END IF;

  IF v_per_def NOT LIKE '%diaria%' OR v_per_def NOT LIKE '%semanal%'
     OR v_per_def NOT LIKE '%hora%' OR v_per_def NOT LIKE '%mensal%'
     OR v_per_def NOT LIKE '%anual%' THEN
    RAISE EXCEPTION
      'A periodicidade devia aceitar hora, diaria, semanal, mensal e anual e aceita: %',
      v_per_def;
  END IF;

  -- Tipo de contrato: tem de existir UM so CHECK de dominio, e com os oito.
  SELECT count(*) INTO v_n_tipo
    FROM pg_constraint
   WHERE conrelid = to_regclass('public.pessoas_vinculos')
     AND conname IN ('pessoas_vinculos_tipo_valido', 'pessoas_vinculos_tipo_contrato_valido');

  IF v_n_tipo <> 1 THEN
    RAISE EXCEPTION
      'Esperava-se UM CHECK de dominio em tipo_contrato e encontraram-se %. Com dois, o mais restritivo manda e duracao_muito_curta continuaria recusado em silencio; com zero, a coluna aceita qualquer texto.',
      v_n_tipo;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_tipo_def
    FROM pg_constraint
   WHERE conrelid = to_regclass('public.pessoas_vinculos')
     AND conname = 'pessoas_vinculos_tipo_valido';

  IF v_tipo_def IS NULL OR v_tipo_def NOT LIKE '%duracao_muito_curta%' THEN
    RAISE EXCEPTION
      'tipo_contrato nao aceita duracao_muito_curta: %. Era um dos DOIS valores novos que esta migracao existe para acrescentar.',
      coalesce(v_tipo_def, '(constraint ausente)');
  END IF;

  -- O sexto valor que o utilizador pediu, e que a ronda anterior deixou de
  -- fora. Se faltar, o ecra volta a propor cinco tipos em vez de seis.
  IF v_tipo_def NOT LIKE '%tempo_parcial%' THEN
    RAISE EXCEPTION
      'tipo_contrato nao aceita tempo_parcial: %. E o sexto valor pedido e confirmado pelo utilizador -- sem ele o dominio fica nos cinco.',
      v_tipo_def;
  END IF;

  -- Os SEIS que o ecra oferece tem de estar todos no dominio. Cada falha aqui
  -- e um valor que o formulario propoe e a base recusa: erro so ao gravar.
  FOREACH v_valor IN ARRAY ARRAY[
    'termo_certo','sem_termo','termo_incerto','duracao_muito_curta',
    'temporario','tempo_parcial'
  ] LOOP
    IF v_tipo_def NOT LIKE '%' || v_valor || '%' THEN
      RAISE EXCEPTION
        'O dominio de tipo_contrato nao aceita "%", que e um dos seis oferecidos no ecra (TIPOS_CONTRATO, src/types/hr.ts). Dominio actual: %',
        v_valor, v_tipo_def;
    END IF;
  END LOOP;

  -- Os dois valores que se decidiu manter na base tem de estar la mesmo. Se
  -- cairem, qualquer vinculo de estagio existente passa a ilegal.
  IF v_tipo_def NOT LIKE '%estagio%' OR v_tipo_def NOT LIKE '%prestacao_servicos%' THEN
    RAISE EXCEPTION
      'estagio ou prestacao_servicos desapareceram do dominio de tipo_contrato: %. A decisao foi tira-los da lista OFERECIDA e mante-los na base -- encolher o dominio tornaria ilegais as linhas que ja os usam.',
      v_tipo_def;
  END IF;

  -- regime nao foi tocado: continua com as duas hipoteses de 20261120060000, e
  -- continua a ser O campo autoritativo para saber quem esta a tempo parcial.
  -- tipo_contrato passou a ter um valor com o mesmo nome, e e precisamente por
  -- isso que se confirma aqui, explicitamente, que o dominio de regime nao
  -- mudou -- se ambos os campos se mexessem, deixava de haver campo de
  -- referencia.
  SELECT pg_get_constraintdef(oid) INTO v_reg_def
    FROM pg_constraint
   WHERE conrelid = to_regclass('public.pessoas_vinculos')
     AND conname = 'pessoas_vinculos_regime_valido';

  IF v_reg_def IS NULL THEN
    RAISE EXCEPTION
      'pessoas_vinculos_regime_valido desapareceu. Esta migracao nao devia ter tocado em regime.';
  END IF;

  IF v_reg_def NOT LIKE '%tempo_inteiro%' OR v_reg_def NOT LIKE '%tempo_parcial%' THEN
    RAISE EXCEPTION
      'pessoas_vinculos_regime_valido deixou de aceitar tempo_inteiro/tempo_parcial: %. regime e o campo autoritativo do tempo parcial e esta migracao nao lhe devia tocar.',
      v_reg_def;
  END IF;

  -- NAO se verifica aqui a ausencia de linhas com tipo_contrato=tempo_parcial e
  -- regime=tempo_inteiro, nem existe CHECK a recusa-las: essa combinacao e
  -- legal por decisao expressa. A razao esta no cabecalho -- em resumo, regime
  -- tem DEFAULT tempo_inteiro e um CHECK cruzado recusaria o INSERT que so
  -- escolhe o tipo de contrato.

  -- Nenhuma politica mexida, em nenhuma das duas tabelas.
  SELECT count(*) INTO v_politicas
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('pessoas_vinculos','pessoas_retribuicoes');

  IF v_politicas <> 8 THEN
    RAISE EXCEPTION
      'pessoas_vinculos + pessoas_retribuicoes ficaram com % politicas e esperavam-se 8 (4 + 4). Esta migracao nao devia ter tocado em politica nenhuma.',
      v_politicas;
  END IF;

  RAISE NOTICE
    'OK: periodicidade com 5 valores (hora, diaria, semanal, mensal, anual) e tipo_contrato com 8 na base (6 oferecidos no ecra, tempo_parcial incluido). Sem CHECK de coerencia entre tipo_contrato e regime: 100%% das combinacoes dos dois dominios ficam legais, de proposito. regime e tipo_trabalho intocados.';
END;
$conferir$;


-- ==============================================================================
-- ANTES DO db push
--
-- 1. Vai a seguir a 20261120190000. Nao ha dependencia tecnica entre as duas,
--    mas a ordem esta escolhida: a que renomeia coluna vai a frente para que
--    tudo o que se escreva depois assuma o nome final.
--
-- 2. So ALARGA dominios -- nenhuma linha que hoje seja legal passa a ilegal, e
--    por isso nao ha momento em que a base partilhada fique defeituosa. Entre o
--    DROP e o ADD de cada CHECK ha uma janela dentro da MESMA transacao, logo
--    invisivel de fora.
--
-- 3. As etiquetas novas (Mensalmente, Por hora, Duracao muito curta, Tempo
--    parcial) e as chaves hr.periodicidade.diaria / .semanal e
--    hr.tipoContrato.duracao_muito_curta / .tempo_parcial, em cinco linguas,
--    vao no commit do src. Sem elas, o ecra mostra o codigo cru.
--
-- 4. Do lado do src os SEIS ja estao: 'tempo_parcial' esta no tipo
--    TipoContrato e na lista TIPOS_CONTRATO (src/types/hr.ts), com etiqueta
--    nas cinco linguas e teste em src/lib/hr/__tests__/listasHr.test.ts.
--    Confirmado por leitura, nao por execucao.
--
-- 5. O que fica POR FAZER e a coerencia no caminho de escrita: hoje
--    SeccaoContrato.tsx trata tipo_contrato e regime como dois campos
--    independentes, portanto e possivel escolher "Tempo parcial" no tipo de
--    contrato e deixar o regime em "Tempo integral". Recomenda-se que o
--    formulario passe regime a 'tempo_parcial' quando este tipo for
--    escolhido. E la, e nao num CHECK, que isto se resolve -- a razao esta no
--    cabecalho.
-- ==============================================================================
