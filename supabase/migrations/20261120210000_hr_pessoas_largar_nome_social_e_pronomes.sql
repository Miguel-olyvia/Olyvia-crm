-- ==============================================================================
-- Larga pessoas.nome_social e pessoas_dados_pessoais.pronomes.
--
-- POR APLICAR.
--
--
-- -- O PEDIDO -----------------------------------------------------------------
--
-- Palavras do utilizador, sobre a seccao de informacoes gerais: "o nome social
-- n acho necessario". E, sobre os detalhes pessoais, tirar o campo "Pronomes".
--
--
-- -- PORQUE SE LARGA A COLUNA E NAO SE ESCONDE SO O CAMPO ---------------------
--
-- A razao e DIFERENTE para cada uma, e vale a pena separa-las.
--
-- pronomes (pessoas_dados_pessoais, 20261120040000 linha 277) e o caso facil:
-- coluna de texto livre, sem CHECK, sem indice, sem leitor nenhum alem do
-- proprio campo do formulario -- confirmado por grep as migracoes, onde a
-- palavra aparece uma vez so, na definicao. Deixa-la escondida criaria uma
-- coluna que ninguem escreve e que o proximo a ler o esquema tomaria por
-- lacuna da interface. Sai.
--
-- nome_social (pessoas, 20261120030000 linha 155) OBRIGA a apagar, e
-- precisamente porque E usada. Tres ecras mostram-na como nome preferido --
-- Pessoas.tsx:213, PessoaDetail.tsx:158 e PessoasOrganogramaTab.tsx:109 fazem
-- todos "pessoa.nome_social || pessoa.nome_completo" -- e Pessoas.tsx:88
-- pesquisa por ela. Se a coluna ficasse na base sem campo que a preencha, esses
-- tres sitios ficariam a preferir para sempre um valor que ja ninguem consegue
-- introduzir: um caminho de codigo morto que so se manifesta no dia em que
-- alguem escrever ali um valor por SQL, e que ninguem saberia explicar.
--
-- Ao largar a coluna, o TypeScript de src/types/hr.ts obriga a corrigir os
-- quatro sitios, e o compilador passa a ser a garantia de que nao fica nenhum
-- esquecido. Esconder sem largar seria passar a lacuna para o futuro.
--
--
-- -- O QUE SE PERDE, ASSUMIDO -------------------------------------------------
--
-- A hipotese "nome preferido" -- alguem que se apresente por um nome diferente
-- do nome legal -- morre nesta ronda. E reversivel a custo baixo enquanto a
-- tabela estiver vazia (uma coluna de texto e quatro sitios de leitura), e o
-- utilizador disse explicitamente que nao a acha necessaria.
--
-- Nenhuma das duas colunas tem indice, CHECK, FK ou vista dependente -- por
-- isso nao ha CASCADE nenhum, e o DROP e deliberadamente sem CASCADE: se
-- alguma dependencia tiver aparecido entretanto, o push falha e alguem olha,
-- em vez de a levar atras em silencio.
-- ==============================================================================


-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_pessoas   bigint;
  v_pessoais  bigint;
  v_com_nome  bigint;
  v_com_pron  bigint;
BEGIN
  IF to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION
      'public.pessoas nao existe -- 20261120030000 tem de ir a frente na fila.';
  END IF;

  IF to_regclass('public.pessoas_dados_pessoais') IS NULL THEN
    RAISE EXCEPTION
      'public.pessoas_dados_pessoais nao existe -- 20261120040000 tem de ir a frente na fila.';
  END IF;

  -- A guarda que interessa mesmo: nao largar uma coluna que tenha valores.
  -- Uma contagem de zero LIDA COMO SUPER-UTILIZADOR e prova de ausencia (a RLS
  -- nao se aplica ao dono do esquema numa migracao); a mesma contagem lida como
  -- utilizador autenticado nao seria, e essa confusao ja custou caro neste
  -- projecto.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas'
       AND column_name = 'nome_social'
  ) THEN
    EXECUTE 'SELECT count(*) FROM public.pessoas' INTO v_pessoas;
    EXECUTE 'SELECT count(*) FROM public.pessoas WHERE nome_social IS NOT NULL'
      INTO v_com_nome;

    IF v_com_nome > 0 THEN
      RAISE EXCEPTION
        'Ha % de % fichas com nome_social preenchido. Largar a coluna apagava esses nomes sem rasto e sem ninguem os ter visto. NAO aplicar: confirmar com o utilizador o que se faz com eles primeiro.',
        v_com_nome, v_pessoas;
    END IF;

    RAISE NOTICE
      'nome_social: % fichas na tabela, nenhuma com valor. Seguro largar.', v_pessoas;
  ELSE
    RAISE NOTICE 'pessoas.nome_social ja nao existe. Segue idempotente.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_dados_pessoais'
       AND column_name = 'pronomes'
  ) THEN
    EXECUTE 'SELECT count(*) FROM public.pessoas_dados_pessoais' INTO v_pessoais;
    EXECUTE 'SELECT count(*) FROM public.pessoas_dados_pessoais WHERE pronomes IS NOT NULL'
      INTO v_com_pron;

    IF v_com_pron > 0 THEN
      RAISE EXCEPTION
        'Ha % de % linhas de dados pessoais com pronomes preenchido. NAO aplicar: confirmar com o utilizador primeiro.',
        v_com_pron, v_pessoais;
    END IF;

    RAISE NOTICE
      'pronomes: % linhas de dados pessoais, nenhuma com valor. Seguro largar.', v_pessoais;
  ELSE
    RAISE NOTICE 'pessoas_dados_pessoais.pronomes ja nao existe. Segue idempotente.';
  END IF;

  -- Se alguma das duas tiver ganho dependencias desde a ronda 1, mais vale
  -- saber-se aqui do que descobri-lo por um DROP a levar algo atras.
  IF EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_attribute a
        ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
     WHERE i.indrelid = to_regclass('public.pessoas')
       AND a.attname = 'nome_social'
  ) THEN
    RAISE EXCEPTION
      'Ha um indice sobre pessoas.nome_social que nao existia em 20261120030000. Este DROP e sem CASCADE de proposito -- investigar quem o criou antes de largar a coluna.';
  END IF;
END;
$guardas$;


-- ---- Largar ----------------------------------------------------------------
-- Sem CASCADE, de proposito: ver cabecalho.
ALTER TABLE public.pessoas
  DROP COLUMN IF EXISTS nome_social;

ALTER TABLE public.pessoas_dados_pessoais
  DROP COLUMN IF EXISTS pronomes;


-- ---- COMMENTs: fica escrito na base porque desapareceram -------------------
-- Nao ha onde por um COMMENT numa coluna que nao existe, por isso a nota vai
-- para a tabela -- e o unico sitio onde o proximo a ler o esquema a encontra
-- antes de propor "falta o nome preferido".
COMMENT ON TABLE public.pessoas IS
'Ficha de pessoa do modulo de RH, com ambito por organizacao. NOTA HISTORICA: tinha uma coluna nome_social (nome preferido, mostrado em vez de nome_completo quando preenchido) que foi largada em 20261120210000, a pedido do utilizador ("o nome social n acho necessario") e com a tabela vazia -- zero linhas com valor, conferido pela guarda dessa migracao. Nao voltar a propor a coluna como lacuna: foi decisao e nao esquecimento. Se a hipotese do nome preferido voltar, volta com os quatro sitios de leitura que existiam (Pessoas.tsx lista e pesquisa, PessoaDetail.tsx titulo, PessoasOrganogramaTab.tsx no).';

COMMENT ON TABLE public.pessoas_dados_pessoais IS
'Dados pessoais da pessoa, um para um com pessoas. NOTA HISTORICA: tinha uma coluna pronomes (texto livre) largada em 20261120210000 a pedido do utilizador, com a tabela vazia. Nao voltar a propor como lacuna. nacionalidade continua aqui como ISO-2 (CHECK de duas maiusculas) e o ecra passou a escolhe-la de uma lista de paises vinda de public.countries -- o formato gravado nao mudou.';


-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_politicas integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas'
       AND column_name = 'nome_social'
  ) THEN
    RAISE EXCEPTION 'pessoas.nome_social ainda existe depois do DROP.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_dados_pessoais'
       AND column_name = 'pronomes'
  ) THEN
    RAISE EXCEPTION 'pessoas_dados_pessoais.pronomes ainda existe depois do DROP.';
  END IF;

  -- O DROP sem CASCADE nao devia ter levado nada atras. As colunas de que a
  -- ficha depende tem de continuar todas la -- em especial nome_completo, que
  -- passa a ser o UNICO nome que a aplicacao mostra.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas'
       AND column_name = 'nome_completo'
  ) THEN
    RAISE EXCEPTION
      'pessoas.nome_completo desapareceu. Com nome_social largada, era o unico nome que a aplicacao tinha para mostrar -- nao aplicar neste estado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_dados_pessoais'
       AND column_name = 'nacionalidade'
  ) THEN
    RAISE EXCEPTION
      'pessoas_dados_pessoais.nacionalidade desapareceu. O DROP de pronomes nao devia ter tocado em mais nada.';
  END IF;

  SELECT count(*) INTO v_politicas
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('pessoas','pessoas_dados_pessoais');

  IF v_politicas < 8 THEN
    RAISE EXCEPTION
      'pessoas + pessoas_dados_pessoais ficaram com % politicas, menos do que as 8 esperadas. Largar uma coluna nao devia ter tocado em politica nenhuma -- confirmar que nenhuma politica referia nome_social.',
      v_politicas;
  END IF;

  RAISE NOTICE
    'OK: nome_social e pronomes largadas, nome_completo e nacionalidade intactas, politicas preservadas (%). O src TEM de ir no mesmo commit: quatro sitios liam nome_social.',
    v_politicas;
END;
$conferir$;


-- ==============================================================================
-- ANTES DO db push
--
-- 1. E a mais IRREVERSIVEL das quatro desta ronda, e esta em terceiro lugar de
--    proposito: se algo em 20261120190000 ou 20261120200000 falhar, prefere-se
--    que falhe ANTES de se largarem colunas.
--
-- 2. NAO ha migracao de reversao, por regra do projecto. Se o nome preferido
--    voltar a ser pedido, escreve-se uma migracao nova para a frente.
--
-- 3. As alteracoes de src tem de ir NO MESMO COMMIT: src/types/hr.ts,
--    usePessoa.ts:44,51, usePessoas.ts:62, Pessoas.tsx:88,213,
--    PessoaDetail.tsx:158, PessoasOrganogramaTab.tsx:109,
--    PessoaLaboraisTab.tsx (quatro ocorrencias), PessoaPessoaisTab.tsx,
--    SeccaoInformacoesGerais.tsx, SeccaoDetalhesPessoais.tsx e novaPessoa.ts.
--    Depois do push, qualquer select que peca nome_social ou pronomes devolve
--    erro de coluna inexistente e o ecra de Pessoas deixa de carregar.
-- ==============================================================================
