-- ==============================================================================
-- Larga pessoas_dados_pessoais.email_comunicacoes: o e-mail pessoal passa a
-- viver so em pessoas.email_pessoal.
--
-- POR APLICAR.
--
--
-- -- O PEDIDO -----------------------------------------------------------------
--
-- O separador de Detalhes laborais mostrava um campo "E-mail pessoal"
-- (pessoas.email_pessoal) e o separador de Detalhes pessoais mostrava um
-- campo diferente, "E-mail para comunicacoes" (pessoas_dados_pessoais.
-- email_comunicacoes) -- dois campos, duas colunas, para o mesmo conceito.
-- Palavras do utilizador: "se e detalhes laborais o email pessoal n deve ser
-- aqui". O campo passa para Detalhes pessoais, onde ja vivem o telefone
-- pessoal e a nacionalidade, e a coluna a mais larga-se em vez de ficar la
-- muda -- a mesma razao de sempre: uma coluna que ninguem escreve e uma
-- lacuna disfarcada para quem ler o esquema a seguir.
--
--
-- -- PORQUE HA BACKFILL, E NAO SO UM DROP -------------------------------------
--
-- `src/lib/hr/novaPessoa.ts` escrevia, ate esta ronda, O MESMO VALOR do mesmo
-- campo do ecra ("E-mail pessoal", passo 2) nas duas colunas: `nucleo.
-- email_pessoal` (linha 597) e `dadosPessoais.email_comunicacoes` (linha 615).
-- Na pratica, quase todo o `email_comunicacoes` preenchido e uma copia do
-- `email_pessoal` da mesma ficha, escrita no momento da admissao. O que nao
-- for copia foi escrito a mao mais tarde no separador de Detalhes pessoais, e
-- e o UNICO sitio onde esse valor existe -- perde-se se a coluna cair sem
-- backfill.
--
-- O CHECK de formato e o MESMO REGEX nas duas colunas (confirmado em
-- 20261120030000 e 20261120040000: '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
-- por isso um valor que passou no CHECK de uma passa no da outra -- o
-- backfill nao arrisca violar a constraint de destino.
--
-- Regra do backfill: so preenche BURACOS (pessoas.email_pessoal IS NULL). Se
-- sobrar algum par com os dois lados preenchidos e DIFERENTES, a migracao
-- ABORTA -- qual dos dois fica e escolha do utilizador, nao desta migracao.
--
--
-- -- O QUE PODIA IMPEDIR O DROP, E O QUE SE VERIFICOU -------------------------
--
-- CHECK pessoas_dados_pessoais_email_formato (20261120040000): menciona so
-- email_comunicacoes -- cai sozinho com a coluna.
-- Indices: so idx_pessoas_dados_pessoais_pessoa_id e _organization_id, nenhum
-- sobre email_comunicacoes -- guarda-se na mesma, a EXCEPTION dispara se
-- algum tiver aparecido entretanto.
-- Vistas: nenhuma depende desta tabela, no repositorio -- guarda-se por
-- pg_depend, porque recriar uma vista perde security_invoker, GRANT, REVOKE e
-- comentarios se nao forem reaplicados a mao, e essa nao e uma decisao para
-- tomar aqui.
-- Grants por coluna: pessoas_dados_pessoais NAO TEM nenhum -- 20261121260000
-- da SELECT, INSERT, UPDATE ao nivel da TABELA a authenticated (os grants por
-- coluna sao de pessoas_identificacao, por causa do NISS, tabela diferente).
-- Nada a ajustar; o bloco de conferir reafirma que continua assim.
-- Politicas RLS: as 4 da tabela (select/insert/update/block_delete) nao
-- referem a coluna nenhuma.
--
-- Por tudo isto o DROP e SEM CASCADE, de proposito: se alguma dependencia
-- tiver aparecido entretanto, o push falha e alguem olha, em vez de a levar
-- atras em silencio.
--
--
-- -- O QUE SE PERDE, ASSUMIDO -------------------------------------------------
--
-- Nenhum dado se perde: o que estava em email_comunicacoes e unico (nao copia
-- de email_pessoal) migra para pessoas.email_pessoal antes do DROP. Se algum
-- par tiver os dois valores preenchidos e a DIFERIR, a migracao nao aplica --
-- fica por decidir com o utilizador, e reporta-se com os numeros.
-- ==============================================================================


-- ---- Guardas ----------------------------------------------------------------
DO $guardas$
DECLARE
  v_pessoas       bigint;
  v_dados         bigint;
  v_com_valor     bigint;
BEGIN
  IF to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION
      'public.pessoas nao existe -- 20261120030000 tem de ir a frente na fila.';
  END IF;

  IF to_regclass('public.pessoas_dados_pessoais') IS NULL THEN
    RAISE EXCEPTION
      'public.pessoas_dados_pessoais nao existe -- 20261120040000 tem de ir a frente na fila.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_dados_pessoais'
       AND column_name = 'email_comunicacoes'
  ) THEN
    RAISE NOTICE 'pessoas_dados_pessoais.email_comunicacoes ja nao existe. Segue idempotente.';
    RETURN;
  END IF;

  -- Contagem lida como DONO DO ESQUEMA (dentro da migracao): a RLS nao se
  -- aplica aqui, por isso zero e mesmo ausencia. A mesma contagem lida como
  -- utilizador autenticado nao provaria nada -- essa confusao ja custou caro
  -- neste projecto (489 fichas dadas por "vazias" quando so estavam escondidas
  -- pela RLS).
  EXECUTE 'SELECT count(*) FROM public.pessoas_dados_pessoais' INTO v_dados;
  EXECUTE 'SELECT count(*) FROM public.pessoas_dados_pessoais WHERE email_comunicacoes IS NOT NULL'
    INTO v_com_valor;
  SELECT count(*) INTO v_pessoas FROM public.pessoas;

  RAISE NOTICE
    'email_comunicacoes: % de % linhas de dados pessoais com valor (% pessoas na tabela nucleo). A seguir: backfill de buracos e guarda de conflito.',
    v_com_valor, v_dados, v_pessoas;

  -- Indice sobre a coluna que nao existia em 20261120040000: nao largar sem
  -- olhar. O DROP mais abaixo e sem CASCADE de proposito.
  IF EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_attribute a
        ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
     WHERE i.indrelid = to_regclass('public.pessoas_dados_pessoais')
       AND a.attname = 'email_comunicacoes'
  ) THEN
    RAISE EXCEPTION
      'Ha um indice sobre pessoas_dados_pessoais.email_comunicacoes que nao existia em 20261120040000. Este DROP e sem CASCADE de proposito -- investigar quem o criou antes de largar a coluna.';
  END IF;

  -- Vista dependente: recriar uma vista perde security_invoker, GRANT, REVOKE
  -- e comentarios se nao forem reaplicados a mao -- essa e uma migracao
  -- propria, nao esta. Aqui so se verifica que nao existe nenhuma.
  IF EXISTS (
    SELECT 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid
      JOIN pg_class v ON v.oid = r.ev_class AND v.relkind IN ('v','m')
      JOIN pg_attribute a
        ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
     WHERE d.refobjid = to_regclass('public.pessoas_dados_pessoais')
       AND a.attname = 'email_comunicacoes'
  ) THEN
    RAISE EXCEPTION
      'Ha uma vista dependente de pessoas_dados_pessoais.email_comunicacoes. Recriar uma vista perde security_invoker, GRANT, REVOKE e comentarios -- isto NAO se resolve aqui. Investigar antes de largar a coluna.';
  END IF;
END;
$guardas$;


-- ---- Backfill: so preenche buracos em pessoas.email_pessoal ----------------
DO $backfill$
DECLARE
  v_copiados bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_dados_pessoais'
       AND column_name = 'email_comunicacoes'
  ) THEN
    RETURN;
  END IF;

  UPDATE public.pessoas p
     SET email_pessoal = d.email_comunicacoes
    FROM public.pessoas_dados_pessoais d
   WHERE d.pessoa_id = p.id
     AND d.email_comunicacoes IS NOT NULL
     AND p.email_pessoal IS NULL;

  GET DIAGNOSTICS v_copiados = ROW_COUNT;
  RAISE NOTICE 'Copiados % e-mails de email_comunicacoes para pessoas.email_pessoal (so buracos).', v_copiados;
END;
$backfill$;


-- ---- Guarda de conflito: os dois lados preenchidos E diferentes ------------
-- Isto e decisao humana, nao desta migracao. Se aparecer um so caso, aborta.
DO $conflito$
DECLARE
  v_conflitos bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_dados_pessoais'
       AND column_name = 'email_comunicacoes'
  ) THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_conflitos
    FROM public.pessoas p
    JOIN public.pessoas_dados_pessoais d ON d.pessoa_id = p.id
   WHERE p.email_pessoal IS NOT NULL
     AND d.email_comunicacoes IS NOT NULL
     AND p.email_pessoal IS DISTINCT FROM d.email_comunicacoes;

  IF v_conflitos > 0 THEN
    RAISE EXCEPTION
      'Ha % ficha(s) com pessoas.email_pessoal e pessoas_dados_pessoais.email_comunicacoes preenchidos e DIFERENTES. Largar a coluna apagava um dos dois sem ninguem escolher qual. NAO aplicar: confirmar com o utilizador qual valor fica em cada caso, antes de repetir o db push.',
      v_conflitos;
  END IF;

  RAISE NOTICE 'Sem conflitos entre email_pessoal e email_comunicacoes. Seguro largar a coluna.';
END;
$conflito$;


-- ---- Largar -----------------------------------------------------------------
-- Sem CASCADE, de proposito: ver cabecalho.
ALTER TABLE public.pessoas_dados_pessoais
  DROP COLUMN IF EXISTS email_comunicacoes;


-- ---- COMMENT: fica escrito na base porque desapareceu ----------------------
COMMENT ON TABLE public.pessoas_dados_pessoais IS
'Dados pessoais da pessoa, um para um com pessoas. NOTA HISTORICA: tinha uma coluna pronomes (texto livre) largada em 20261120210000 a pedido do utilizador, com a tabela vazia. Nao voltar a propor como lacuna. nacionalidade continua aqui como ISO-2 (CHECK de duas maiusculas) e o ecra passou a escolhe-la de uma lista de paises vinda de public.countries -- o formato gravado nao mudou. NOTA HISTORICA 2: tinha tambem uma coluna email_comunicacoes (e-mail para comunicacoes) largada em 20261122060000, a pedido do utilizador ("se e detalhes laborais o email pessoal n deve ser aqui") -- o campo do ecra passou a escrever pessoas.email_pessoal, e os valores que so existiam aqui foram copiados para la antes do DROP. Nao voltar a propor email_comunicacoes como lacuna: o e-mail pessoal da pessoa vive em pessoas.email_pessoal.';


-- ---- Conferir ----------------------------------------------------------------
DO $conferir$
DECLARE
  v_politicas    integer;
  v_priv_coluna  integer;
  v_priv_tabela  text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_dados_pessoais'
       AND column_name = 'email_comunicacoes'
  ) THEN
    RAISE EXCEPTION 'pessoas_dados_pessoais.email_comunicacoes ainda existe depois do DROP.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas'
       AND column_name = 'email_pessoal'
  ) THEN
    RAISE EXCEPTION
      'pessoas.email_pessoal desapareceu. E o destino do backfill e o unico sitio onde o e-mail pessoal fica -- nao aplicar neste estado.';
  END IF;

  -- O CHECK que so mencionava a coluna largada tem de ter caido com ela; as
  -- outras cinco CHECKs da tabela continuam.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_dados_pessoais_email_formato'
       AND conrelid = to_regclass('public.pessoas_dados_pessoais')
  ) THEN
    RAISE EXCEPTION 'pessoas_dados_pessoais_email_formato ainda existe -- devia ter caido com a coluna.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_dados_pessoais_nacionalidade_iso'
       AND conrelid = to_regclass('public.pessoas_dados_pessoais')
  ) THEN
    RAISE EXCEPTION
      'pessoas_dados_pessoais_nacionalidade_iso desapareceu. O DROP de email_comunicacoes nao devia ter tocado em mais nada.';
  END IF;

  SELECT count(*) INTO v_politicas
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_dados_pessoais';

  IF v_politicas <> 4 THEN
    RAISE EXCEPTION
      'pessoas_dados_pessoais ficou com % politicas, esperavam-se 4. Largar uma coluna nao devia ter tocado em politica nenhuma.',
      v_politicas;
  END IF;

  -- Sem grants por coluna nesta tabela, antes e depois: so ao nivel da
  -- tabela (SELECT, INSERT, UPDATE a authenticated, por 20261121260000).
  -- NAO usar information_schema.column_privileges aqui: essa vista e a UNIAO
  -- de pg_class.relacl expandido por TODAS as colunas com pg_attribute.attacl.
  -- Como esta tabela tem GRANT SELECT, INSERT, UPDATE ao nivel da TABELA, a
  -- contagem daria 3 x numero de colunas e nunca zero -- a guarda rebentava
  -- sempre, e o que ela media nao era o que se queria medir. O privilegio POR
  -- COLUNA vive so em pg_attribute.attacl.
  SELECT count(*) INTO v_priv_coluna
    FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.pessoas_dados_pessoais')
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND a.attacl IS NOT NULL;

  IF v_priv_coluna <> 0 THEN
    RAISE EXCEPTION
      'pessoas_dados_pessoais ganhou % privilegio(s) de COLUNA para authenticated, que nao existiam antes desta migracao. Investigar antes de aceitar.',
      v_priv_coluna;
  END IF;

  -- DISTINCT: ha uma linha por (grantor, grantee, privilegio). Se algum destes
  -- GRANT tiver sido feito por dois grantors ao longo da vida do remoto, sem
  -- DISTINCT sai "INSERT,INSERT,SELECT,SELECT,UPDATE" e a guarda falhava sem
  -- haver problema nenhum.
  SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) INTO v_priv_tabela
    FROM information_schema.table_privileges
   WHERE table_schema = 'public' AND table_name = 'pessoas_dados_pessoais'
     AND grantee = 'authenticated';

  IF v_priv_tabela IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN
    RAISE EXCEPTION
      'pessoas_dados_pessoais: privilegios de TABELA para authenticated sao "%", esperava-se INSERT,SELECT,UPDATE (20261121260000). Largar uma coluna nao devia ter mexido em GRANT nenhum.',
      v_priv_tabela;
  END IF;

  RAISE NOTICE
    'OK: email_comunicacoes largada, pessoas.email_pessoal intacta, CHECK de formato caiu com a coluna, as outras permanecem, 4 politicas preservadas, grants de tabela e coluna inalterados. O src TEM de ir no mesmo commit: PessoaPessoaisTab.tsx e usePessoa.ts liam esta coluna.';
END;
$conferir$;


-- ==============================================================================
-- ANTES DO db push
--
-- 1. Ler o backfill (o UPDATE ... FROM logo acima das guardas de conflito):
--    toca linhas de TODAS as organizacoes, nao so nike. E legitimo -- e
--    preservacao de dados dentro de uma migracao versionada, nao SQL avulso
--    -- mas quem orquestra deve ler antes de aplicar. A regra "escritas so na
--    org nike" continua a valer para qualquer SQL corrido a mao fora desta
--    migracao.
--
-- 2. Se a guarda de conflito disparar (EXCEPTION com "preenchidos e
--    DIFERENTES"), NAO tentar contornar nem escolher um lado por conta
--    propria: reportar os numeros e devolver a decisao ao utilizador.
--
-- 3. NAO ha migracao de reversao, por regra do projecto. Se o e-mail para
--    comunicacoes distinto do pessoal voltar a ser pedido, escreve-se uma
--    migracao nova para a frente.
--
-- 4. As alteracoes de src TEM de ir no MESMO COMMIT: src/types/hr.ts,
--    src/hooks/usePessoa.ts (COLUNAS_DADOS_PESSOAIS), src/components/hr/
--    PessoaPessoaisTab.tsx, PessoaLaboraisTab.tsx, src/pages/PessoaDetail.tsx,
--    src/lib/hr/novaPessoa.ts, src/components/hr/form/
--    SeccaoDetalhesPessoais.tsx e src/translations/index.ts (5 linguas).
--    Depois do push, qualquer select que peca email_comunicacoes devolve erro
--    de coluna inexistente e o separador de Detalhes pessoais deixa de
--    carregar.
-- ==============================================================================
