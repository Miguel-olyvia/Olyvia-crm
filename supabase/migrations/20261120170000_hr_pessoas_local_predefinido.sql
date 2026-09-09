-- ==============================================================================
-- pessoas.local_id: o local de trabalho predefinido da pessoa.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- pessoas.local_trabalho e text livre (20261120030000 linha 162). Isso
-- significa tres coisas, todas mas:
--
--   1. "Porto", "porto" e "Porto " sao tres locais diferentes, e ninguem
--      consegue contar horas por local com uma coluna assim.
--   2. Um intervalo de horario nao tem nada a que apontar a nao ser repetir a
--      string, e a partir dai as duas divergem.
--   3. Nao ha morada, nem tipo, nem coordenadas -- so um nome.
--
-- Ao mesmo tempo, os intervalos de horario (20261120150000/160000) tem
-- local_id NULO como caso normal: a maioria das pessoas trabalha sempre no
-- mesmo sitio e escrever o local em cada intervalo seria ruido. Falta o sitio
-- onde esse "sempre o mesmo" vive.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- pessoas.local_id, FK COMPOSTA (local_id, organization_id) contra
-- hr_locais_trabalho (id, organization_id). E o local PREDEFINIDO da pessoa,
-- usado quando um intervalo de horario nao indica local nenhum.
--
-- A resolucao do local de um intervalo passa a ser, e isto e a regra do
-- LEITOR:
--   1. pessoas_horario_planeado.local_id (ou _realizado), se estiver preenchido
--   2. senao, pessoas.local_id
--   3. senao, nada -- e mostra-se "sem local", nao se inventa
--
-- ON DELETE NO ACTION e nao SET NULL, pelo motivo ja documentado em
-- 20261120030000 linhas 194-203: num FK composto o SET NULL classico poe a
-- NULL TODAS as colunas da chave, incluindo organization_id, que e NOT NULL --
-- o apagamento rebentaria com uma violacao de NOT NULL em vez de limpar a
-- referencia. Na pratica nao incomoda: o DELETE de hr_locais_trabalho esta
-- bloqueado por politica restritiva e os locais desactivam-se (activo=false),
-- nao se apagam.
--
--
-- -- PORQUE NAO HA BACKFILL, E ESTA E A PARTE IMPORTANTE ----------------------
--
-- Era tentador percorrer pessoas.local_trabalho, criar um hr_locais_trabalho
-- por cada valor distinto e ligar as fichas. NAO SE FAZ, por duas razoes:
--
-- 1. NAO FOI CONFIRMADO NO REMOTO quantas linhas tem local_trabalho
--    preenchido, nem com que valores. Um backfill escrito contra uma suposicao
--    sobre o conteudo de uma coluna e exactamente o tipo de alteracao que ja
--    correu mal nesta base. E uma contagem lida como utilizador autenticado
--    nem provaria ausencia: a RLS pode esconder linhas.
--
-- 2. UM BACKFILL SERIA UMA ESCRITA EM DADOS DE ORGANIZACOES QUE NAO A NIKE.
--    As outras organizacoes tem dados reais de clientes e sao so leitura. Criar
--    locais a partir de texto livre nelas -- com os duplicados de maiusculas e
--    espacos que o texto livre sempre tem -- deixaria cada uma com um catalogo
--    de locais sujo, que alguem teria de limpar a mao depois.
--
-- Consequencia assumida: durante um periodo, fichas antigas tem
-- local_trabalho preenchido e local_id nulo. O UI le local_id primeiro e cai
-- para o texto legado quando ele e nulo. Fica visivelmente inconsistente ate
-- alguem escolher o local de cada ficha -- e isso e melhor do que um catalogo
-- inventado.
--
-- local_trabalho NAO SE APAGA. A remocao e decisao de produto, para outra
-- ronda, depois de haver certeza de que nada depende dela.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nao se apaga nem se altera pessoas.local_trabalho. So ganha um COMMENT a
--   dizer que e legado.
-- - Nao se faz backfill, nem se cria local nenhum, em organizacao nenhuma.
-- - Nao se torna local_id obrigatorio: uma ficha sem local e legitima (quem
--   trabalha sempre em casa de clientes diferentes).
-- - NENHUMA POLITICA RLS E TOCADA. A coluna nova herda as politicas de
--   pessoas, incluindo o ramo de ficha-propria que 20261120090000 acrescentou
--   ao SELECT. Quem vier a mexer nelas parte dessa versao, nao da de
--   20261120030000.
-- - Nao se muda nada em pessoas.dias_trabalho (isso foi 20261120140000, e so
--   por COMMENT).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   ALTER TABLE public.pessoas DROP COLUMN IF EXISTS local_id;
-- A FK e o indice caem com a coluna. Isto apaga a associacao das fichas aos
-- locais; local_trabalho (o texto) fica intacto, porque nunca foi tocado.
--
--
-- Prerequisitos:
--   20261120030000  pessoas
--   20261120130000  hr_locais_trabalho (e a unique hr_locais_trabalho_id_org_key)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas nao existe. Aplicar 20261120030000 primeiro.';
  END IF;

  IF to_regclass('public.hr_locais_trabalho') IS NULL THEN
    RAISE EXCEPTION
      'public.hr_locais_trabalho nao existe. Aplicar 20261120130000 primeiro -- a FK desta coluna aponta para ela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_locais_trabalho_id_org_key'
       AND conrelid = to_regclass('public.hr_locais_trabalho')
  ) THEN
    RAISE EXCEPTION
      'A unique hr_locais_trabalho_id_org_key nao existe; a FK COMPOSTA (local_id, organization_id) desta migracao depende dela.';
  END IF;

  -- A coluna legada tem de continuar la: esta migracao promete que ela nao e
  -- apagada, e o COMMENT que se lhe poe abaixo falaria de nada.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas'
       AND column_name = 'local_trabalho'
  ) THEN
    RAISE EXCEPTION
      'pessoas.local_trabalho nao existe. Esta migracao acrescenta local_id AO LADO dela, nao em vez dela -- se ja foi apagada, o estado nao e o esperado. Investigar.';
  END IF;

  RAISE NOTICE 'Guardas passadas: pessoas e hr_locais_trabalho existem, local_trabalho intacta.';
END;
$guardas$;

-- ---- A coluna --------------------------------------------------------------
ALTER TABLE public.pessoas
  ADD COLUMN IF NOT EXISTS local_id uuid;

-- ADD CONSTRAINT nao tem IF NOT EXISTS: dentro de um DO com verificacao, para
-- reaplicar nao lancar 42710 e parar o push a meio.
DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_local_fkey'
       AND conrelid = to_regclass('public.pessoas')
  ) THEN
    ALTER TABLE public.pessoas
      ADD CONSTRAINT pessoas_local_fkey
        FOREIGN KEY (local_id, organization_id)
        REFERENCES public.hr_locais_trabalho (id, organization_id)
        ON DELETE NO ACTION;
  END IF;
END;
$fk$;

CREATE INDEX IF NOT EXISTS idx_pessoas_local_id
  ON public.pessoas (local_id)
  WHERE local_id IS NOT NULL;

-- ---- COMMENTs --------------------------------------------------------------
COMMENT ON COLUMN public.pessoas.local_id IS
'Local de trabalho PREDEFINIDO da pessoa, em hr_locais_trabalho. Usado quando um intervalo de horario nao indica local. Resolucao do local de um intervalo, a cargo do LEITOR: primeiro o local_id do intervalo, senao este, senao "sem local" -- nunca se inventa. Nulo e legitimo: quem trabalha sempre em casa de clientes diferentes nao tem local predefinido. FK COMPOSTA com organization_id, para nao poder apontar para um local de outra organizacao.';

COMMENT ON COLUMN public.pessoas.local_trabalho IS
'LEGADO desde 20261120170000. A fonte de verdade do local passou a ser pessoas.local_id, que aponta para hr_locais_trabalho e por isso tem morada, tipo e nome unico por organizacao. Esta coluna de texto livre NAO foi apagada e NAO houve backfill -- fichas antigas podem ter isto preenchido e local_id nulo, e o UI le local_id primeiro e cai para aqui. Nao houve backfill porque criar locais a partir de texto livre seria uma escrita em dados de organizacoes que nao a nike, com os duplicados de maiusculas e espacos que o texto livre sempre tem. A remocao desta coluna e decisao de produto, para outra ronda.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_politicas integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas' AND column_name = 'local_id'
  ) THEN
    RAISE EXCEPTION 'A coluna pessoas.local_id nao ficou criada.';
  END IF;

  -- A promessa central desta migracao: local_trabalho continua la.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas' AND column_name = 'local_trabalho'
  ) THEN
    RAISE EXCEPTION
      'pessoas.local_trabalho desapareceu. Esta migracao promete NAO a apagar -- se nao esta la, alguem a apagou e ha texto de local perdido.';
  END IF;

  -- A FK tem de ser COMPOSTA (2 colunas). Uma FK simples contra
  -- hr_locais_trabalho(id) deixaria uma ficha apontar para um local de outra
  -- organizacao.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_local_fkey'
       AND conrelid = to_regclass('public.pessoas')
       AND cardinality(conkey) = 2
       AND confrelid = to_regclass('public.hr_locais_trabalho')
  ) THEN
    RAISE EXCEPTION
      'pessoas_local_fkey nao e a FK composta (local_id, organization_id) contra hr_locais_trabalho. Uma FK simples deixaria uma ficha apontar para um local de outra organizacao.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'idx_pessoas_local_id'
  ) THEN
    RAISE EXCEPTION 'O indice de pessoas.local_id nao ficou criado.';
  END IF;

  -- Esta migracao nao toca em politicas. Se o numero mudou, alguem acrescentou
  -- aqui algo que nao devia.
  SELECT count(*) INTO v_politicas
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas';

  IF v_politicas < 4 THEN
    RAISE EXCEPTION
      'pessoas tem so % politicas. Esta migracao nao toca em politicas -- investigar.', v_politicas;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas'
       AND policyname = 'pessoas_select_policy'
       AND coalesce(qual, '') LIKE '%hr_pessoa_do_utilizador%'
  ) THEN
    RAISE EXCEPTION
      'A politica pessoas_select_policy perdeu o ramo de ficha-propria que 20261120090000 lhe acrescentou. Alguem a reescreveu a partir da versao antiga de 20261120030000.';
  END IF;

  RAISE NOTICE
    'OK: pessoas.local_id criada com FK composta contra hr_locais_trabalho; local_trabalho intacta e marcada como legada; sem backfill, de proposito; nenhuma politica tocada.';
END;
$conferir$;
