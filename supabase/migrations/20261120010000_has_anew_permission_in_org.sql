-- ==============================================================================
-- has_anew_permission_in_org: a gemea de has_anew_permission, com filtro de
-- organizacao. E a fundacao que faltava para o modulo de Recursos Humanos.
--
-- POR APLICAR. Ler o bloco "ANTES DO db push" no fim do ficheiro.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- public.has_anew_permission(_auth_uid, _permission_code) esta definida em
-- 20260622114000_system_admin_least_privilege.sql (linhas 92-111) e e a
-- definicao vigente. Junta anew_users -> anew_memberships (status='active') ->
-- anew_role_permissions e o WHERE tem UMA unica condicao: au.auth_user_id =
-- _auth_uid. Nao ha filtro de organizacao nenhum.
--
-- A consequencia: quem tem uma permissao numa organizacao tem-na em TODAS as
-- organizacoes onde tenha membership activo. No CRM isso fica mascarado porque
-- quase todas as politicas juntam a permissao com um "organization_id IN
-- (SELECT get_user_crm_org_ids(...))". Mas a funcao em si e global, e uma
-- politica que se esqueca desse segundo filtro fica aberta.
--
-- O RH nao pode viver com isso. Uma ficha de trabalhador tem NISS, morada,
-- contacto de emergencia, incapacidade, IBAN e retribuicao. O fecho nao pode
-- depender de quem escreve a politica lembrar-se de juntar o filtro a mao.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- has_anew_permission_in_org(_auth_uid, _permission_code, _organization_id)
-- devolve true so se o utilizador tiver um membership ACTIVO NAQUELA
-- organizacao cujo papel tenha aquela permissao. Mesma cadeia de tabelas da
-- funcao original, mais a condicao am.organization_id = _organization_id.
--
-- Com _organization_id NULL devolve false: o "=" ja garante isso, e e o que se
-- quer. Nao se usa IS NOT DISTINCT FROM -- uma linha sem organizacao nao deve
-- ser visivel por omissao.
--
--
-- -- PORQUE NAO LEVA BYPASS DE system_admin NEM DE super_admin ------------------
--
-- 1. O bypass reintroduz exactamente o defeito que a funcao existe para fechar.
--    Um "OR is_system_admin(_auth_uid)" faz a funcao voltar a ser global -- a
--    organizacao deixa de contar justamente para quem tem o papel que consegue
--    ler as fichas todas.
--
-- 2. Os dados de RH nao sao dados de configuracao. NISS, morada, contacto de
--    emergencia, incapacidade, IBAN e retribuicao sao dados pessoais de
--    trabalhadores de organizacoes distintas. system_admin e um papel de
--    operacao da plataforma, nao uma relacao laboral: nao ha base legal para
--    lhe dar leitura de fichas de RH de organizacoes onde nao e membro. O
--    precedente do projecto e o mesmo -- 20260622114000 existe precisamente
--    para retirar o acesso automatico do system_admin, e 20260615130000 ja
--    exclui platform.% do backfill do super_admin.
--
-- 3. super_admin continua a poder ter acesso, mas pela via normal: recebe as
--    permissoes hr.* por atribuicao de papel NA organizacao onde e membro, e
--    ai a funcao devolve true por membership, nao por excepcao. Um bypass no
--    corpo da funcao e invisivel na interface de papeis; uma atribuicao de
--    permissao e auditavel e revogavel.
--
-- Consequencia pratica, escrita aqui para nao surpreender ninguem: QUEM NAO
-- TEM MEMBERSHIP ACTIVO NA ORGANIZACAO NAO VE A FICHA, SEJA QUAL FOR O PAPEL.
-- Um system_admin que precise mesmo de intervir passa por service_role (Edge
-- Function ou consola), que e o caminho auditado.
--
--
-- -- ALCANCE -------------------------------------------------------------------
--
-- Cria uma funcao nova. NAO altera has_anew_permission (a versao sem
-- organizacao) -- ha centenas de politicas a usa-la e mexer-lhe esta fora do
-- ambito desta ronda. NAO migra politica nenhuma existente. A funcao nova
-- nasce e e usada SO pelas tabelas novas de RH (20261120030000 em diante).
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nao se toca em has_anew_permission.
-- - Nao se atribui permissao nenhuma a papel nenhum.
-- - O helper hr_pessoa_do_utilizador (ambito "a minha propria ficha") NAO e
--   criado aqui: depende da tabela pessoas_contas, e por isso nasce em
--   20261120090000, que tambem faz os ALTER POLICY que o usam.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Nao ha ficheiro de reversao nesta pasta, de proposito: um .sql de reversao
-- guardado ao lado e aplicado pelo db push seguinte. Para reverter a mao, e
-- depois de confirmar que nenhuma politica a usa:
--   DROP FUNCTION IF EXISTS public.has_anew_permission_in_org(uuid, text, uuid);
-- Se as tabelas de RH ja existirem, as politicas delas dependem desta funcao e
-- o DROP falha -- e o que se quer.
--
--
-- Prerequisitos:
--   20260615130000  baseline (anew_users, anew_memberships, anew_role_permissions)
--   20260622114000  definicao vigente de has_anew_permission
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_aridade integer;
BEGIN
  -- A funcao de que dependemos para o contraste tem mesmo de existir.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'has_anew_permission'
      AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION
      'public.has_anew_permission(uuid, text) nao existe. Esta migracao assume o estado deixado por 20260622114000; confirmar o estado real antes de continuar.';
  END IF;

  -- Se ja existir algo com este nome mas com outra aridade, parar. Ja aconteceu
  -- neste repositorio ressuscitar uma assinatura antiga e deixar o PostgREST
  -- sem saber qual escolher.
  SELECT p.pronargs INTO v_aridade
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'has_anew_permission_in_org'
    AND p.pronargs <> 3
  LIMIT 1;

  IF v_aridade IS NOT NULL THEN
    RAISE EXCEPTION
      'Ja existe public.has_anew_permission_in_org com % argumentos. Esta migracao cria a versao de 3 argumentos; resolver a ambiguidade a mao antes de aplicar.',
      v_aridade;
  END IF;
END;
$guardas$;

-- ---- A funcao --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_anew_permission_in_org(
  _auth_uid uuid,
  _permission_code text,
  _organization_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.anew_users au
    JOIN public.anew_memberships am
      ON am.user_id = au.id
     AND am.status = 'active'
    JOIN public.anew_role_permissions arp
      ON arp.role_id = am.role_id
     AND arp.permission_code = _permission_code
    WHERE au.auth_user_id = _auth_uid
      AND am.organization_id = _organization_id
  )
$$;

REVOKE ALL ON FUNCTION public.has_anew_permission_in_org(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_anew_permission_in_org(uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_anew_permission_in_org(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_anew_permission_in_org(uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.has_anew_permission_in_org(uuid, text, uuid) IS
'Gemea de has_anew_permission COM filtro de organizacao. Devolve true so se o utilizador tiver membership activo NAQUELA organizacao com um papel que tenha a permissao. Existe porque has_anew_permission responde true para qualquer organizacao onde o utilizador tenha membership, e o RH nao pode viver com isso. NAO tem bypass de system_admin nem de super_admin, de proposito: um bypass torna a funcao global outra vez, e dados de RH (NISS, morada, incapacidade, IBAN, retribuicao) sao dados pessoais de trabalhadores de organizacoes distintas, nao configuracao da plataforma. super_admin obtem acesso pela via normal -- permissao hr.* atribuida ao papel na organizacao onde e membro. Quem nao tem membership activo na organizacao nao ve a ficha, seja qual for o papel; a via de excepcao e service_role.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_provolatile "char";
  v_secdef boolean;
  v_config text[];
BEGIN
  SELECT p.provolatile, p.prosecdef, p.proconfig
    INTO v_provolatile, v_secdef, v_config
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'has_anew_permission_in_org'
    AND p.pronargs = 3;

  IF v_provolatile IS NULL THEN
    RAISE EXCEPTION 'has_anew_permission_in_org(uuid,text,uuid) nao ficou criada.';
  END IF;
  IF v_provolatile <> 's' THEN
    RAISE EXCEPTION 'has_anew_permission_in_org devia ser STABLE, esta com volatilidade "%".', v_provolatile;
  END IF;
  IF NOT v_secdef THEN
    RAISE EXCEPTION 'has_anew_permission_in_org devia ser SECURITY DEFINER.';
  END IF;
  IF v_config IS NULL OR NOT (v_config::text LIKE '%search_path%') THEN
    RAISE EXCEPTION 'has_anew_permission_in_org ficou sem search_path fixo.';
  END IF;

  RAISE NOTICE 'OK: has_anew_permission_in_org(uuid,text,uuid) criada, STABLE, SECURITY DEFINER, search_path fixo.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. Correr "supabase migration list" e confirmar que nao ha nenhum timestamp
--    20261120* ja aplicado no remoto sem ficheiro local. Ja houve neste
--    repositorio timestamps aplicados sem ficheiro (ver cabecalho de
--    20261116020000). Se colidir, renumerar TODO o bloco 20261120010000 ..
--    20261120090000 mantendo a ordem relativa -- as nove migrations dependem
--    umas das outras por esta ordem.
--
-- 2. Confirmar que nao ficou nenhum ficheiro de reversao pendente na pasta.
--    O db push aplica TUDO o que estiver por aplicar, por ordem.
--
-- 3. Esta migracao nao toca em dados nem em objectos existentes. Nao ha janela
--    de estado defeituoso na base partilhada.
-- ==============================================================================
