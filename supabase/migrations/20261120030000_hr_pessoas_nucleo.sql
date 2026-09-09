-- ==============================================================================
-- Tabela pessoas: a identidade interna de RH. E o nucleo de que todos os
-- satelites do modulo dependem.
--
-- POR APLICAR. Ler o bloco "ANTES DO db push" no fim do ficheiro.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Nao existe tabela nenhuma para trabalhadores. Nao ha pessoas, nao ha
-- employees, nao ha departments -- confirmado por leitura das 547 migrations.
-- O que ha e anew_users (contas de acesso) e as entidades de CRM (clientes,
-- leads). Nenhuma das duas serve: uma conta e um mecanismo de login, e uma
-- entidade de CRM e alguem com quem se faz negocio. Um trabalhador pode nao
-- ter conta nenhuma, e nao e um cliente.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- pessoas e a ficha do trabalhador, por organizacao. Guarda identificacao
-- interna: nomes, cargo, local de trabalho, entidade legal, quem reporta a
-- quem, datas de admissao/antiguidade/saida, estado do contrato.
--
-- O QUE NAO TEM, e e a decisao mais importante deste ficheiro:
--
--   NAO ha coluna can_access_crm, nem role_id, nem auth_user_id, nem
--   anew_user_id.
--
-- O acesso a aplicacao e um GRANT e vive onde sempre viveu -- anew_memberships
-- mais o papel. A ligacao entre uma ficha de pessoa e uma conta e uma tabela
-- curada a parte (pessoas_contas, 20261120090000), e ligar NAO da acesso
-- nenhum. Misturar as duas coisas numa coluna aqui faria com que editar uma
-- ficha de RH concedesse ou retirasse acesso a aplicacao, que e exactamente o
-- tipo de acoplamento que causa fugas.
--
-- O "estado do acesso" que a lista mostra e DERIVADO da conta ligada, nao uma
-- coluna desta tabela.
--
--
-- -- A UNIQUE (id, organization_id) E A PECA CENTRAL ----------------------------
--
-- pessoas_id_org_key UNIQUE (id, organization_id) parece redundante (id ja e
-- PK). Nao e. E ela que permite a TODOS os satelites terem uma chave
-- estrangeira COMPOSTA (pessoa_id, organization_id) -> pessoas (id,
-- organization_id). Com isso, a base garante que um satelite nunca pode
-- apontar para uma pessoa de outra organizacao, e as politicas dos satelites
-- podem filtrar pela sua propria coluna organization_id sem um unico join a
-- pessoas. Sem esta unique, nada do resto do modulo funciona como desenhado.
--
-- O mesmo truque fecha reporta_a_pessoa_id: a FK e composta, por isso ninguem
-- consegue apontar a hierarquia para uma pessoa de outra organizacao.
--
--
-- -- RLS -----------------------------------------------------------------------
--
-- Quatro politicas, todas TO authenticated, todas com
-- has_anew_permission_in_org (a versao COM organizacao, 20261120010000) e
-- todas com as funcoes embrulhadas em (SELECT ...) -- a regra de performance
-- de 20261119120000, onde a mesma mudanca levou uma consulta de 924ms a 38ms.
--
--   SELECT  hr.pessoas.view
--   INSERT  hr.pessoas.create
--   UPDATE  hr.pessoas.edit, com USING E WITH CHECK ambos escritos
--   DELETE  restritiva USING (false) -- nao se apaga, arquiva-se
--
-- O DELETE ja estaria negado so por haver RLS activo sem politica de DELETE.
-- Escreve-se a restritiva na mesma para a intencao ficar registada e para que
-- uma permissiva acrescentada por descuido numa ronda futura nao abra a porta.
--
-- A organizacao e imutavel depois de criada a ficha, e isso e garantido por
-- TRIGGER, nao por politica restritiva. Uma restritiva de UPDATE nao consegue
-- ler a linha antiga de forma fiavel (o WITH CHECK so ve a linha nova), por
-- isso a comparacao OLD/NEW tem de ser num trigger.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nao se instala extensao nenhuma. O indice trigram sobre nome_completo so
--   e criado SE pg_trgm ja estiver instalado; caso contrario salta com um
--   NOTICE e a pesquisa da lista faz-se por ILIKE simples.
-- - A clausula de ficha-propria (ver a minha ficha) NAO entra aqui: depende de
--   pessoas_contas e e acrescentada por ALTER POLICY em 20261120090000.
-- - Nao se atribui permissao nenhuma a papel nenhum.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, e so depois de
-- remover os satelites (que dependem desta por FK):
--   DROP TABLE IF EXISTS public.pessoas;
-- Isto apaga fichas de trabalhadores. Confirmar que a tabela esta vazia, ou
-- exportar antes.
--
--
-- Prerequisitos:
--   20260615130000  baseline (anew_organizations, anew_users, update_updated_at_column)
--   20261120010000  has_anew_permission_in_org
--   20261120020000  catalogo hr.*
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'public.has_anew_permission_in_org(uuid,text,uuid) nao existe. Aplicar 20261120010000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.view'
  ) THEN
    RAISE EXCEPTION 'A permissao hr.pessoas.view nao esta no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    RAISE EXCEPTION 'public.update_updated_at_column() nao existe; os triggers de updated_at dependem dela.';
  END IF;

  -- Colisao de nome: se ja existir uma tabela "pessoas" que NAO e a nossa
  -- (reconhece-se pela unique composta), parar. Reaplicar esta migracao sobre
  -- a nossa propria tabela e seguro -- tudo o que se segue e IF NOT EXISTS.
  --
  -- NOTA: usa-se to_regclass() e NAO 'public.pessoas'::regclass. Um cast
  -- literal para regclass e resolvido ao planear a expressao, nao em tempo de
  -- execucao, por isso lancava 42P01 (relation does not exist) precisamente no
  -- caso normal -- a primeira aplicacao, em que a tabela ainda nao existe. O
  -- curto-circuito do AND nao salva um cast constante. to_regclass() devolve
  -- NULL em vez de rebentar, e a comparacao fica falsa como se pretende.
  IF to_regclass('public.pessoas') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'pessoas_id_org_key' AND conrelid = to_regclass('public.pessoas')
     )
  THEN
    RAISE EXCEPTION
      'Ja existe public.pessoas mas sem a constraint pessoas_id_org_key. Nao e a tabela desta migracao -- ha uma colisao de nome. Investigar antes de aplicar.';
  END IF;
END;
$guardas$;

-- ---- A tabela --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pessoas (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL,

  numero_interno         text,
  primeiro_nome          text NOT NULL,
  apelido                text NOT NULL,
  nome_completo          text GENERATED ALWAYS AS (btrim(primeiro_nome || ' ' || apelido)) STORED,
  nome_social            text,

  email_trabalho         text,
  email_pessoal          text,
  telefone_trabalho      text,

  cargo                  text,
  local_trabalho         text,
  entidade_legal_org_id  uuid,
  reporta_a_pessoa_id    uuid,

  data_admissao          date,
  data_antiguidade       date,
  data_saida             date,

  estado_contrato        text NOT NULL DEFAULT 'em_curso',
  estado_registo         text NOT NULL DEFAULT 'activo',

  dias_trabalho          text[],
  notas                  text,

  deleted_at             timestamptz,
  deleted_by             uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,

  CONSTRAINT pessoas_pkey PRIMARY KEY (id),

  -- A peca central: e esta unique que torna possiveis as FK compostas de todos
  -- os satelites. Ver o cabecalho.
  CONSTRAINT pessoas_id_org_key UNIQUE (id, organization_id),

  CONSTRAINT pessoas_organization_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE RESTRICT,
  CONSTRAINT pessoas_entidade_legal_fkey
    FOREIGN KEY (entidade_legal_org_id) REFERENCES public.anew_organizations (id) ON DELETE SET NULL,

  -- FK composta: nao se reporta a alguem de outra organizacao.
  -- ON DELETE NO ACTION, e NAO SET NULL: num FK composto o SET NULL classico
  -- poe A NULL TODAS as colunas da chave, incluindo organization_id, que e NOT
  -- NULL -- o apagamento rebentaria com uma violacao de NOT NULL em vez de
  -- limpar a hierarquia. A variante "SET NULL (coluna)" so existe a partir do
  -- PostgreSQL 15 e a versao do remoto nao esta declarada em lado nenhum do
  -- repositorio, por isso nao se assume. Na pratica nao incomoda: o DELETE
  -- esta bloqueado para authenticated e as fichas sao arquivadas, nao
  -- apagadas. Quem apagar mesmo (service_role) tem de reatribuir primeiro
  -- quem reportava aquela pessoa -- que e o comportamento correcto.
  CONSTRAINT pessoas_reporta_a_fkey
    FOREIGN KEY (reporta_a_pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE NO ACTION,

  CONSTRAINT pessoas_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_primeiro_nome_nao_vazio CHECK (btrim(primeiro_nome) <> ''),
  CONSTRAINT pessoas_apelido_nao_vazio       CHECK (btrim(apelido) <> ''),
  CONSTRAINT pessoas_nao_reporta_a_si        CHECK (reporta_a_pessoa_id IS NULL OR reporta_a_pessoa_id <> id),
  CONSTRAINT pessoas_email_trabalho_formato  CHECK (email_trabalho IS NULL OR email_trabalho ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT pessoas_email_pessoal_formato   CHECK (email_pessoal  IS NULL OR email_pessoal  ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT pessoas_estado_contrato_valido  CHECK (estado_contrato IN ('em_curso','suspenso','terminado')),
  CONSTRAINT pessoas_estado_registo_valido   CHECK (estado_registo  IN ('activo','arquivado')),
  CONSTRAINT pessoas_saida_depois_admissao   CHECK (data_saida IS NULL OR data_admissao IS NULL OR data_saida >= data_admissao),
  CONSTRAINT pessoas_dias_trabalho_validos   CHECK (
    dias_trabalho IS NULL
    OR dias_trabalho <@ ARRAY['seg','ter','qua','qui','sex','sab','dom']::text[]
  )
);

COMMENT ON TABLE public.pessoas IS
'Ficha de trabalhador (identidade interna de RH), por organizacao. NAO tem colunas de acesso: o acesso a aplicacao e um grant e vive em anew_memberships + papel; a ligacao a uma conta e a tabela curada pessoas_contas, e ligar nao concede acesso nenhum. O "estado do acesso" mostrado na interface e derivado da conta ligada, nao guardado aqui.';

COMMENT ON CONSTRAINT pessoas_id_org_key ON public.pessoas IS
'Parece redundante (id ja e PK) mas nao e: e o alvo das chaves estrangeiras COMPOSTAS (pessoa_id, organization_id) de todos os satelites de RH. E ela que garante, ao nivel da base, que um satelite nunca aponta para uma pessoa de outra organizacao, e que permite as politicas dos satelites filtrarem pela sua propria coluna organization_id sem join nenhum a pessoas.';

COMMENT ON COLUMN public.pessoas.estado_registo IS
'Ciclo de vida do REGISTO (activo/arquivado), independente do acesso a aplicacao e do estado do contrato.';

COMMENT ON COLUMN public.pessoas.nome_completo IS
'Gerado a partir de primeiro_nome e apelido. E por esta coluna que a lista pesquisa e ordena.';

-- ---- Indices ---------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_numero_interno_org
  ON public.pessoas (organization_id, numero_interno)
  WHERE numero_interno IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pessoas_organization_id
  ON public.pessoas (organization_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pessoas_estado_registo
  ON public.pessoas (organization_id, estado_registo) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pessoas_reporta_a
  ON public.pessoas (reporta_a_pessoa_id) WHERE reporta_a_pessoa_id IS NOT NULL;

-- Indice trigram para a pesquisa por nome. So se pg_trgm JA estiver instalado:
-- esta ronda nao instala extensoes.
DO $trigram$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    -- A classe de operadores TEM de vir qualificada com o esquema. Neste
    -- projecto pg_trgm esta instalada em "extensions", nao em "public"
    -- (baseline 20260615130000 linha 24), e o search_path fixo desta migracao
    -- nao a inclui -- com o nome nu, isto lancava 42704 (operator class does
    -- not exist). Todos os oito indices trigram do baseline qualificam da
    -- mesma forma; ver por exemplo a linha 15157.
    CREATE INDEX IF NOT EXISTS idx_pessoas_nome_completo
      ON public.pessoas USING gin (nome_completo extensions.gin_trgm_ops);
    RAISE NOTICE 'pg_trgm presente: indice trigram sobre pessoas.nome_completo criado.';
  ELSE
    RAISE NOTICE 'pg_trgm ausente: indice trigram saltado de proposito (esta ronda nao instala extensoes). A pesquisa da lista fara ILIKE simples.';
  END IF;
END;
$trigram$;

-- ---- Triggers --------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_pessoas_updated_at ON public.pessoas;
CREATE TRIGGER trg_pessoas_updated_at
  BEFORE UPDATE ON public.pessoas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- A organizacao de uma ficha e imutavel. Tem de ser trigger e nao politica
-- restritiva: o WITH CHECK so ve a linha nova, nao consegue comparar com a
-- antiga de forma fiavel.
CREATE OR REPLACE FUNCTION public.hr_pessoas_org_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION
      'A organizacao de uma pessoa e imutavel (tentou-se mudar de % para %). Criar a ficha na organizacao certa em vez de a mover.',
      OLD.organization_id, NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_pessoas_org_imutavel() IS
'Impede mover uma ficha de pessoa entre organizacoes. Mover levaria os satelites atras (FK composta com ON DELETE CASCADE) e mudaria quem os ve, sem deixar rasto.';

DROP TRIGGER IF EXISTS trg_pessoas_org_imutavel ON public.pessoas;
CREATE TRIGGER trg_pessoas_org_imutavel
  BEFORE UPDATE ON public.pessoas
  FOR EACH ROW EXECUTE FUNCTION public.hr_pessoas_org_imutavel();

-- ---- Grants ----------------------------------------------------------------
-- A RLS e que decide as linhas; os grants decidem as operacoes possiveis.
REVOKE ALL ON TABLE public.pessoas FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pessoas TO authenticated;
GRANT ALL ON TABLE public.pessoas TO service_role;

-- ---- RLS -------------------------------------------------------------------
ALTER TABLE public.pessoas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_select_policy ON public.pessoas;
CREATE POLICY pessoas_select_policy ON public.pessoas
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.view', organization_id))
  );

DROP POLICY IF EXISTS pessoas_insert_policy ON public.pessoas;
CREATE POLICY pessoas_insert_policy ON public.pessoas
  FOR INSERT TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.create', organization_id))
  );

DROP POLICY IF EXISTS pessoas_update_policy ON public.pessoas;
CREATE POLICY pessoas_update_policy ON public.pessoas
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.edit', organization_id))
  )
  WITH CHECK (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.edit', organization_id))
  );

DROP POLICY IF EXISTS pessoas_delete_bloqueado ON public.pessoas;
CREATE POLICY pessoas_delete_bloqueado ON public.pessoas
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (false);

COMMENT ON POLICY pessoas_select_policy ON public.pessoas IS
'Ve as fichas quem tem hr.pessoas.view NAQUELA organizacao. Sem membership activo na organizacao nao ha leitura, seja qual for o papel.';
COMMENT ON POLICY pessoas_insert_policy ON public.pessoas IS
'Cria fichas quem tem hr.pessoas.create naquela organizacao.';
COMMENT ON POLICY pessoas_update_policy ON public.pessoas IS
'Edita quem tem hr.pessoas.edit naquela organizacao. O WITH CHECK repete a condicao sobre a linha nova; mudar de organizacao esta alem disso bloqueado pelo trigger trg_pessoas_org_imutavel.';
COMMENT ON POLICY pessoas_delete_bloqueado ON public.pessoas IS
'Nao se apaga uma ficha de trabalhador: arquiva-se (estado_registo) ou marca-se deleted_at por via de servico. A restritiva existe para a intencao ficar escrita e para que uma permissiva acrescentada por descuido nao abra a porta.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls boolean;
  v_politicas integer;
BEGIN
  SELECT c.relrowsecurity INTO v_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'pessoas';

  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'public.pessoas ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_politicas FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'pessoas';

  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas em public.pessoas, encontraram-se %.', v_politicas;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pessoas_id_org_key' AND conrelid = 'public.pessoas'::regclass
  ) THEN
    RAISE EXCEPTION 'A unique pessoas_id_org_key nao ficou criada; os satelites nao poderao ter FK composta.';
  END IF;

  RAISE NOTICE 'OK: public.pessoas criada, RLS activo, 4 politicas, unique (id, organization_id) presente.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. Correr "supabase migration list". Se 20261120* colidir, renumerar o bloco
--    inteiro (20261120010000 .. 20261120090000) mantendo a ordem relativa.
--
-- 2. Confirmar que 20261120010000 e 20261120020000 vao a frente desta na fila.
--
-- 3. Esta migracao so CRIA objectos novos. Nao altera tabela, politica nem
--    funcao existente, por isso nao ha janela em que a base partilhada fique
--    num estado defeituoso.
--
-- 4. Depois de aplicada, a tabela fica invisivel para todos os utilizadores da
--    aplicacao ate alguem atribuir hr.pessoas.view a um papel. Isso e o
--    comportamento pretendido, nao um defeito.
-- ==============================================================================
