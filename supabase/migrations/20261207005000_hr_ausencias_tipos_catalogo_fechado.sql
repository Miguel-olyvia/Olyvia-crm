-- ==============================================================================
-- hr_ausencias_tipos passa de catalogo editavel por organizacao a catalogo
-- FECHADO: os onze tipos semeados por 20261122010000 deixam de poder ser
-- criados, alterados ou apagados pela aplicacao.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- 20261121020000 deu a quem tem hr.ausencias.tipos.edit GRANT INSERT, UPDATE e
-- duas politicas RLS que os deixam passar. Isso e o desenho de um catalogo
-- CONFIGURAVEL por organizacao -- exactamente o que o utilizador rejeitou:
-- "os tipos de ausencia deve ser algo fixo e nao configuravel". Com a semente
-- fixa da migracao anterior e o ecra de edicao a sair da aplicacao (fora do
-- alcance desta migracao, so base de dados), deixar a porta de escrita aberta
-- so daria a quem tivesse a permissao a certa a possibilidade de a reabrir por
-- fora do ecra -- via qualquer chamada directa ao PostgREST.
--
--
-- -- A REGRA NOVA ----------------------------------------------------------------
--
-- O mesmo regime de pessoas_dados_bancarios: SELECT para authenticated, mais
-- nada. Escreve so quem tem ALL na tabela -- service_role, e por essa via a
-- migracao anterior (dono da base) e o trigger SECURITY DEFINER de criacao de
-- organizacao.
--
--   DROP POLICY hr_ausencias_tipos_insert;
--   DROP POLICY hr_ausencias_tipos_update;
--   REVOKE INSERT, UPDATE ON public.hr_ausencias_tipos FROM authenticated;
--
-- A politica de SELECT NAO se toca: continua a decidir quem ve o catalogo por
-- hr.ausencias.tipos.view. A politica RESTRICTIVE de bloqueio de DELETE
-- (hr_ausencias_tipos_block_delete) tambem nao se toca -- ja bloqueava, e
-- continua a bloquear.
--
--
-- -- O QUE FICA DE FORA ---------------------------------------------------------
--
-- - hr.ausencias.tipos.edit NAO se apaga do catalogo de permissoes. A tabela
--   continua a existir e "fixos" e uma decisao de PRODUTO, nao de esquema --
--   pode inverter-se. Apagar a permissao obrigaria a desligar
--   trg_protect_system_role_perms e a remover atribuicoes de papeis de
--   clientes que a possam ter dado a mao, por uma decisao que pode mudar.
--   Fica no catalogo SEM EFEITO: nenhuma politica a consulta depois desta
--   migracao, so a descricao muda para o dizer.
-- - hr.ausencias.tipos.view continua indispensavel: e o que faz o nome do
--   tipo ser legivel. Nao se mexe na sua atribuicao ao super_admin.
-- - O ecra /rh/definicoes/ausencias-tipos, a rota e a entrada de menu: saem do
--   lado da aplicacao, fora do alcance desta ronda (so base de dados).
--
--
-- -- COMO SE REVERTE -------------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, se o catalogo
-- voltar a ser configuravel:
--   GRANT INSERT, UPDATE ON public.hr_ausencias_tipos TO authenticated;
--   CREATE POLICY hr_ausencias_tipos_insert ON public.hr_ausencias_tipos
--     FOR INSERT TO authenticated WITH CHECK (deleted_at IS NULL AND
--       (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.tipos.edit', organization_id)));
--   CREATE POLICY hr_ausencias_tipos_update ON public.hr_ausencias_tipos
--     FOR UPDATE TO authenticated
--     USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.tipos.edit', organization_id)))
--     WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.tipos.edit', organization_id)));
--
--
-- Prerequisitos:
--   20261121020000  hr_ausencias_tipos, politicas hr_ausencias_tipos_insert/update
--   20261122010000  a semente -- confirmada aqui ANTES de fechar a porta: fechar
--                   primeiro e semear depois deixaria o modulo inutilizavel e
--                   sem forma de o corrigir pela aplicacao.
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_orgs_sem_11 integer;
BEGIN
  IF to_regclass('public.hr_ausencias_tipos') IS NULL THEN
    RAISE EXCEPTION 'public.hr_ausencias_tipos nao existe. Aplicar 20261121020000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_tipos_semear' AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION
      'hr_ausencias_tipos_semear(uuid) nao existe. Aplicar 20261122010000 primeiro -- fechar a escrita antes de semear deixaria o modulo inutilizavel.';
  END IF;

  SELECT count(*) INTO v_orgs_sem_11
    FROM public.anew_organizations o
   WHERE (
     SELECT count(DISTINCT lower(btrim(t.codigo)))
       FROM public.hr_ausencias_tipos t
      WHERE t.organization_id = o.id AND t.deleted_at IS NULL
   ) < 11;

  IF v_orgs_sem_11 > 0 THEN
    RAISE EXCEPTION
      '% organizacao(oes) tem menos de 11 codigos distintos de tipo de ausencia. A semente (20261122010000) nao correu ou nao cobriu todas. Investigar antes de fechar a escrita.',
      v_orgs_sem_11;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'hr_ausencias_tipos' AND policyname = 'hr_ausencias_tipos_insert'
  ) THEN
    RAISE EXCEPTION 'hr_ausencias_tipos_insert nao existe. Estado da base inesperado -- ja foi removida?';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'hr_ausencias_tipos' AND policyname = 'hr_ausencias_tipos_update'
  ) THEN
    RAISE EXCEPTION 'hr_ausencias_tipos_update nao existe. Estado da base inesperado -- ja foi removida?';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.ausencias.tipos.edit') THEN
    RAISE EXCEPTION 'hr.ausencias.tipos.edit nao esta no catalogo. Estado da base inesperado.';
  END IF;
END;
$guardas$;

-- ---- Fechar a escrita --------------------------------------------------------
DROP POLICY IF EXISTS hr_ausencias_tipos_insert ON public.hr_ausencias_tipos;
DROP POLICY IF EXISTS hr_ausencias_tipos_update ON public.hr_ausencias_tipos;

REVOKE INSERT, UPDATE ON TABLE public.hr_ausencias_tipos FROM authenticated;

COMMENT ON TABLE public.hr_ausencias_tipos IS
'Catalogo FECHADO de tipos de ausencia, semeado por hr_ausencias_tipos_semear() com os onze tipos canonicos (Férias, Assistência a família, Baixa médica, Casamento, Congresso, Doença de um familiar, Exames, Licença parental, Motivos familiares, Outro, Teletrabalho). Decisao de produto de 2026-09: os tipos de ausencia NAO sao configuraveis pela aplicacao. authenticated tem SO SELECT -- sem politica de INSERT nem de UPDATE, e sem esses grants, nenhuma escrita passa por RLS nem por PostgREST. Escreve-se so por service_role (a semente e o trigger de criacao de organizacao). Esta decisao pode inverter-se: se voltar a ser configuravel, ver o cabecalho de 20261122020000 para a forma de reabrir.';

COMMENT ON COLUMN public.hr_ausencias_tipos.activo IS
'Fixo desde 2026-09: so a semente (service_role) o muda. A migracao 20261122010000 desactiva tipos pre-existentes fora da lista canonica que nao tenham dependentes.';

-- ---- Descricao da permissao, agora sem efeito --------------------------------
UPDATE public.anew_permissions
   SET description = 'SEM EFEITO desde 2026-09: os tipos de ausencia sao um catalogo fixo, semeado por hr_ausencias_tipos_semear() e sem politica de INSERT/UPDATE na tabela. Fica no catalogo porque a decisao de "fixos" e de produto e pode inverter-se; enquanto nao inverter, atribuir esta permissao a um papel nao concede poder nenhum.'
 WHERE code = 'hr.ausencias.tipos.edit';

-- ---- Conferir ------------------------------------------------------------------
DO $conferir$
DECLARE
  v_politicas integer;
  v_grants    integer;
BEGIN
  SELECT count(*) INTO v_politicas
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'hr_ausencias_tipos'
     AND policyname IN ('hr_ausencias_tipos_insert', 'hr_ausencias_tipos_update');

  IF v_politicas <> 0 THEN
    RAISE EXCEPTION 'Ainda ha % politica(s) de INSERT/UPDATE em hr_ausencias_tipos.', v_politicas;
  END IF;

  SELECT count(*) INTO v_grants
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'hr_ausencias_tipos'
     AND grantee = 'authenticated' AND privilege_type IN ('INSERT', 'UPDATE');

  IF v_grants <> 0 THEN
    RAISE EXCEPTION 'authenticated ainda tem % grant(s) de INSERT/UPDATE em hr_ausencias_tipos.', v_grants;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'hr_ausencias_tipos'
       AND grantee = 'authenticated' AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'authenticated perdeu o SELECT em hr_ausencias_tipos -- isso fecharia o ecra para todos.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'hr_ausencias_tipos' AND policyname = 'hr_ausencias_tipos_select'
  ) THEN
    RAISE EXCEPTION 'hr_ausencias_tipos_select desapareceu. Nao devia ter sido tocada.';
  END IF;

  RAISE NOTICE 'Conferido: hr_ausencias_tipos so aceita SELECT de authenticated. Escrita so por service_role.';
END;
$conferir$;
