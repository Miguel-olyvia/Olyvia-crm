-- ==============================================================================
-- Apagar (irreversivelmente) os segredos orfaos no Vault, para os dados
-- bancarios de RH -- a acao sobre o diagnostico de 20261201080000.
--
-- POR APLICAR.
--
--
-- -- O QUE ESTA FUNCAO FAZ ------------------------------------------------------
--
-- hr_contas_bancarias_cofre_limpar_orfaos() identifica os MESMOS orfaos que
-- hr_contas_bancarias_cofre_resumo() conta (20261201080000): segredos em
-- vault.secrets com nome a comecar por 'hr_conta:' ou 'hr_iban:' para os quais
-- NAO existe nenhuma linha em pessoas_dados_bancarios com conta_secret_id
-- igual ao id do segredo (mesmo NOT EXISTS, reutilizado sem alteracao). Em vez
-- de so contar, apaga cada um com um DELETE directo em vault.secrets e devolve um
-- REGISTO do que apagou -- nunca o nome completo (leva o pessoa_id) nem o
-- conteudo (a conta em claro nao sai daqui nem em nenhum outro sitio, decisao
-- de 20261120070000):
--
--   prefixo | apagados | criado_mais_antigo | criado_mais_recente
--
-- agrupado por prefixo (hr_conta / hr_iban), com a contagem e o intervalo de
-- created_at dos segredos apagados nesta chamada. Sem lista de ids, sem nomes.
--
-- O utilizador decidiu avancar directamente para apagar, sem passo
-- intermedio de listar para revisao humana -- essa decisao ja foi tomada,
-- nao se repete aqui.
--
--
-- -- IRREVERSIBILIDADE: PORQUE A FUNCAO E CUIDADOSA A MAIS -----------------------
--
-- Um DELETE directo em vault.secrets apaga a linha a serio -- nao ha
-- soft-delete no Vault. Por isso:
--
-- 1. ATOMICIDADE: esta funcao PL/pgSQL nao tem nenhum COMMIT explicito, nem
--    nenhum bloco BEGIN/EXCEPTION a apanhar erros a meio do ciclo -- de
--    proposito. PL/pgSQL corre sempre dentro da transaccao de quem chama; se
--    o DELETE falhar na chamada N do ciclo, a excepcao propaga sem ser
--    apanhada, e o Postgres desfaz TODA a transaccao, incluindo os N-1
--    DELETE que ja tinham corrido dentro dela (DELETE e uma operacao
--    transaccional normal, mesmo dentro do Vault). Ou apagam-se todos os
--    orfaos identificados nesta chamada, ou nenhum -- e a mesma garantia
--    cobre o INSERT de auditoria feito dentro do mesmo ciclo (ver secção de
--    auditoria abaixo): ou fica tudo registado e apagado, ou nao fica nada.
-- 2. Os dados do que vai ser apagado (prefixo e created_at -- nunca o nome
--    nem o id) sao acumulados em ARRAYS PL/pgSQL locais, nao numa TEMP TABLE:
--    evita o problema de uma tabela temporaria ON COMMIT DROP colidir se a
--    funcao for chamada duas vezes dentro da mesma transaccao explicita.
-- 3. O agrupamento por prefixo e devolvido SO DEPOIS do ciclo de apagar
--    terminar por completo -- nunca parcialmente, nunca antes de confirmar
--    que todos os DELETE desta chamada correram.
--
-- Como e IRREVERSIVEL, esta migracao NAO testa o apagamento em si contra
-- dados reais (nem cria segredos de teste para depois os apagar -- seria um
-- teste real de apagamento no Vault, mais arriscado do que vale a pena numa
-- migracao). O bloco de conferir testa APENAS a guarda de permissao (o mesmo
-- teste que 20261201080000 ja fazia): confirma que um uid sem is_system_admin
-- e recusado. O comportamento de apagar em si so e exercido na primeira
-- chamada real, feita por um system_admin, fora desta migracao.
--
--
-- -- AUDITORIA: DECISAO TOMADA -----------------------------------------------
--
-- pessoas_acessos_sensiveis (20261120040000) NAO serve para este registo, e
-- por isso NAO se usa aqui:
--   - pessoa_id e organization_id sao NOT NULL com FK composta para pessoas
--     (id, organization_id) -- esta operacao nao pertence a uma pessoa nem a
--     uma organizacao: um segredo orfao pode ter ficado de qualquer
--     organizacao, e a limpeza corre sobre o Vault inteiro, nao sobre a ficha
--     de ninguem.
--   - campo tem CHECK IN ('niss','iban','incapacidade','retribuicao') e accao
--     tem CHECK IN ('revelar','alterar') -- nenhum valor descreve "apagar
--     segredos orfaos do cofre", e a instrucao deste pedido e clara em NAO
--     adicionar um valor novo ao CHECK sem confirmar isso à parte (mudar um
--     CHECK partilhado por varias RPCs de RH e uma decisao maior do que esta
--     ronda).
-- Por isso a auditoria real desta operacao passa a ser uma tabela propria,
-- public.hr_cofre_manutencao_log, criada por esta mesma migracao: uma linha
-- por prefixo apagado (nunca por segredo), com executado_em, executado_por
-- (auth.uid() de quem chamou), prefixo, apagados e o intervalo created_at
-- min/max dos apagados nesta chamada -- sem pessoa_id nem organization_id,
-- porque esta operacao e de manutencao do cofre inteiro, nao de uma ficha
-- (a mesma razao por que pessoas_acessos_sensiveis nao serve, ver acima). O
-- INSERT corre DENTRO do mesmo ciclo da funcao, na mesma transaccao dos
-- DELETE ao Vault -- herda a atomicidade descrita na secção anterior: ou
-- fica tudo (apagado + registado), ou nao fica nada. RLS restringe o SELECT
-- a system_admin e nao permite INSERT/UPDATE/DELETE a ninguem directamente
-- -- so a propria funcao (SECURITY DEFINER) escreve. O RAISE NOTICE
-- continua a existir como complemento imediato (visivel ao cliente que fez
-- a chamada), mas deixa de ser a unica auditoria: um RAISE NOTICE isolado
-- nao fica escrito em lado nenhum consultavel depois do facto -- so chega ao
-- cliente da chamada, nunca aos logs do Supabase Dashboard (confirmado ao
-- vivo: `SHOW log_min_messages` devolveu 'warning' neste remoto, que nao
-- persiste NOTICE).
--
--
-- -- APAGAR DO VAULT: DELETE DIRECTO, NAO vault.delete_secret -------------------
--
-- Esta instalacao tem supabase_vault 0.3.1, cuja API publica so expoe
-- vault.create_secret e vault.update_secret -- NAO ha vault.delete_secret
-- (confirmado ao vivo, query directa e read-only a pg_proc do schema vault,
-- sem service_role). A forma correcta de apagar um segredo nesta versao e
-- um DELETE directo:
--
--   DELETE FROM vault.secrets WHERE id = <id do orfao>;
--
-- Um DELETE directo dentro do mesmo ciclo FOR ... LOOP tem exactamente a
-- mesma garantia transaccional que uma chamada a funcao teria (ver a secção
-- de atomicidade acima) -- nao ha soft-delete no Vault e o DELETE corre
-- dentro da transaccao normal de quem chama.
--
--
-- -- O QUE FICA DE FORA ----------------------------------------------------------
--
-- - Retencao/janela de espera antes de apagar: decisao de produto ja tomada
--   pelo utilizador (avancar directo), nao revisitada aqui.
-- - Lista dos ids apagados: continua a nao existir, pelo mesmo motivo do
--   diagnostico -- nunca expor nome nem id de segredo.
--
--
-- -- COMO SE REVERTE ---------------------------------------------------------
--
-- DROP FUNCTION IF EXISTS public.hr_contas_bancarias_cofre_limpar_orfaos();
-- DROP TABLE IF EXISTS public.hr_cofre_manutencao_log;
-- Isto reverte a funcao e a tabela de log. Os segredos que ja tiverem sido
-- apagados por uma chamada real NAO voltam -- e irreversivel por definicao,
-- nao ha reversao de dados aqui, so da funcao e da tabela de auditoria. Sem
-- ficheiro de reversao guardado nesta pasta, de proposito -- ver a regra ja
-- escrita em 20261120070000.
--
-- Prerequisitos:
--   20260622114000  is_system_admin(uuid)
--   20261120070000 / 20261120220000  pessoas_dados_bancarios.conta_secret_id
--   20261201080000  hr_contas_bancarias_cofre_resumo() (o diagnostico -- nao
--                   e alterado, so partilha a mesma condicao de NOT EXISTS)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_system_admin' AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION 'public.is_system_admin(uuid) nao existe. Aplicar 20260622114000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pessoas_dados_bancarios'
      AND column_name = 'conta_secret_id'
  ) THEN
    RAISE EXCEPTION
      'public.pessoas_dados_bancarios.conta_secret_id nao existe. Aplicar 20261120070000 e 20261120220000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_contas_bancarias_cofre_resumo' AND p.pronargs = 0
  ) THEN
    RAISE EXCEPTION
      'public.hr_contas_bancarias_cofre_resumo() nao existe. Aplicar 20261201080000 primeiro (o diagnostico antes da limpeza).';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
    RAISE EXCEPTION
      'O schema vault nao existe. Esta funcao existe precisamente para apagar segredos orfaos la dentro; sem o schema nao ha nada para apagar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'vault' AND table_name = 'secrets' AND column_name = 'name'
  ) THEN
    RAISE EXCEPTION 'vault.secrets nao tem a coluna name esperada. Confirmar a extensao supabase_vault no remoto.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'vault' AND table_name = 'secrets' AND column_name = 'created_at'
  ) THEN
    RAISE EXCEPTION 'vault.secrets nao tem a coluna created_at esperada. Confirmar a extensao supabase_vault no remoto.';
  END IF;

  -- Esta migracao apaga com DELETE directo em vault.secrets (nao existe
  -- vault.delete_secret nesta versao da extensao -- ver cabecalho). Confirmar
  -- que a tabela e a coluna id existem antes de definir a funcao.
  IF to_regclass('vault.secrets') IS NULL THEN
    RAISE EXCEPTION
      'vault.secrets nao existe no remoto. Confirmar a extensao supabase_vault antes de aplicar esta migracao.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'vault' AND table_name = 'secrets' AND column_name = 'id'
  ) THEN
    RAISE EXCEPTION 'vault.secrets nao tem a coluna id esperada. Confirmar a extensao supabase_vault no remoto.';
  END IF;
END;
$guardas$;

-- ---- Tabela de auditoria ------------------------------------------------------
-- Uma linha por prefixo apagado nesta chamada (nunca por segredo, nunca com
-- o nome nem o id). Sem pessoa_id/organization_id -- operacao de manutencao
-- do cofre inteiro, nao de uma ficha (ver cabecalho). So a propria funcao
-- (SECURITY DEFINER) escreve; system_admin pode ler; mais ninguem pode
-- INSERT/UPDATE/DELETE directamente.
CREATE TABLE IF NOT EXISTS public.hr_cofre_manutencao_log (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  executado_em         timestamptz NOT NULL DEFAULT now(),
  executado_por        uuid,
  prefixo              text,
  apagados             bigint,
  criado_mais_antigo   timestamptz,
  criado_mais_recente  timestamptz
);

COMMENT ON TABLE public.hr_cofre_manutencao_log IS
'Auditoria consultavel (nao so RAISE NOTICE) da limpeza de segredos orfaos no Vault por hr_contas_bancarias_cofre_limpar_orfaos(). Uma linha por prefixo apagado em cada chamada, sem pessoa_id/organization_id -- operacao sobre o cofre inteiro, nao sobre uma ficha. So a propria funcao SECURITY DEFINER escreve; so system_admin pode ler.';

ALTER TABLE public.hr_cofre_manutencao_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_cofre_manutencao_log FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.hr_cofre_manutencao_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.hr_cofre_manutencao_log TO authenticated;
GRANT ALL ON public.hr_cofre_manutencao_log TO service_role;

DROP POLICY IF EXISTS hr_cofre_manutencao_log_select_system_admin ON public.hr_cofre_manutencao_log;
CREATE POLICY hr_cofre_manutencao_log_select_system_admin
  ON public.hr_cofre_manutencao_log
  FOR SELECT
  TO authenticated
  USING (public.is_system_admin(auth.uid()));

-- Sem policy de INSERT/UPDATE/DELETE para authenticated: RLS por omissao
-- nega tudo o que nao tenha policy propria -- por isso ninguem, incluindo
-- quem chama a RPC via authenticated, consegue escrever aqui directamente.
-- A funcao hr_contas_bancarias_cofre_limpar_orfaos() e SECURITY DEFINER e
-- corre com os privilegios de quem a definiu (o role que aplica esta
-- migracao, superuser em Supabase) -- um superuser bypassa RLS sempre,
-- FORCE ROW LEVEL SECURITY incluido (FORCE so tira o bypass a um
-- proprietario nao-superuser sem BYPASSRLS). E por isso que o INSERT feito
-- pela funcao mais abaixo funciona apesar de so existir a policy de SELECT.

-- ---- Funcao -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_contas_bancarias_cofre_limpar_orfaos()
RETURNS TABLE (prefixo text, apagados bigint, criado_mais_antigo timestamptz, criado_mais_recente timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_orfao     record;
  v_prefixos  text[]        := ARRAY[]::text[];
  v_criados   timestamptz[] := ARRAY[]::timestamptz[];
BEGIN
  IF v_uid IS NULL OR NOT public.is_system_admin(v_uid) THEN
    RAISE EXCEPTION 'permission denied: system_admin required';
  END IF;

  -- Mesma condicao de orfao que hr_contas_bancarias_cofre_resumo() (20261201080000):
  -- NOT EXISTS, nao NOT IN, para nao ter surpresas com NULLs.
  FOR v_orfao IN
    SELECT
      s.id,
      CASE
        WHEN s.name LIKE 'hr_conta:%' THEN 'hr_conta'
        WHEN s.name LIKE 'hr_iban:%'  THEN 'hr_iban'
      END AS prefixo,
      s.created_at
    FROM vault.secrets s
    WHERE (s.name LIKE 'hr_conta:%' OR s.name LIKE 'hr_iban:%')
      AND NOT EXISTS (
        SELECT 1 FROM public.pessoas_dados_bancarios b
        WHERE b.conta_secret_id = s.id
      )
  LOOP
    -- Sem BEGIN/EXCEPTION aqui: se esta chamada falhar, a excepcao propaga
    -- sem ser apanhada e o Postgres desfaz toda a transaccao, incluindo os
    -- DELETE anteriores deste mesmo ciclo. Ou apaga-se tudo, ou nada --
    -- nunca um subconjunto. Nao existe vault.delete_secret nesta versao da
    -- extensao (supabase_vault 0.3.1) -- ver cabecalho da migracao.
    DELETE FROM vault.secrets WHERE id = v_orfao.id;

    v_prefixos := array_append(v_prefixos, v_orfao.prefixo);
    v_criados  := array_append(v_criados, v_orfao.created_at);
  END LOOP;

  -- Auditoria real desta operacao de manutencao do cofre: uma linha por
  -- prefixo em public.hr_cofre_manutencao_log, DENTRO da mesma transaccao
  -- dos DELETE acima -- ou fica tudo (apagado + registado), ou nao fica
  -- nada de nenhum dos dois. Nao usa pessoas_acessos_sensiveis (essa tabela
  -- exige pessoa_id e organization_id NOT NULL com FK propria, e um
  -- campo/accao de um CHECK que nao descreve isto -- ver o cabecalho desta
  -- migracao).
  INSERT INTO public.hr_cofre_manutencao_log
    (executado_por, prefixo, apagados, criado_mais_antigo, criado_mais_recente)
  SELECT v_uid, x.prefixo, count(*), min(x.criado), max(x.criado)
  FROM unnest(v_prefixos, v_criados) AS x(prefixo, criado)
  GROUP BY x.prefixo;

  -- Complemento imediato, visivel ao cliente que fez a chamada -- mas ja
  -- nao e a unica auditoria: a tabela acima e que fica consultavel depois
  -- do facto (um RAISE NOTICE isolado so chega ao cliente da chamada, nunca
  -- aos logs do Supabase Dashboard -- confirmado ao vivo, log_min_messages
  -- = 'warning' neste remoto).
  RAISE NOTICE
    'hr_contas_bancarias_cofre_limpar_orfaos: % segredo(s) orfao(s) apagado(s) do Vault (chamado por auth.uid()=%).',
    coalesce(array_length(v_prefixos, 1), 0), v_uid;

  RETURN QUERY
  SELECT
    x.prefixo,
    count(*) AS apagados,
    min(x.criado) AS criado_mais_antigo,
    max(x.criado) AS criado_mais_recente
  FROM unnest(v_prefixos, v_criados) AS x(prefixo, criado)
  GROUP BY x.prefixo
  ORDER BY x.prefixo;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_contas_bancarias_cofre_limpar_orfaos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_contas_bancarias_cofre_limpar_orfaos() TO authenticated, service_role;

COMMENT ON FUNCTION public.hr_contas_bancarias_cofre_limpar_orfaos() IS
'Apaga (irreversivelmente, DELETE directo em vault.secrets -- esta instalacao de supabase_vault 0.3.1 nao tem vault.delete_secret) os segredos orfaos no Vault para contas bancarias de RH -- mesma condicao de orfao que hr_contas_bancarias_cofre_resumo(). Devolve um registo do que apagou, agrupado por prefixo (hr_conta/hr_iban): quantos e o created_at minimo/maximo dos apagados nesta chamada -- nunca o nome completo (leva o pessoa_id) nem o conteudo. Corre sem COMMIT explicito e sem apanhar excepcoes a meio do ciclo: uma falha a meio desfaz toda a transaccao, nunca um subconjunto -- incluindo o INSERT de auditoria. Auditoria real em public.hr_cofre_manutencao_log (uma linha por prefixo, dentro da mesma transaccao), com RAISE NOTICE como complemento imediato -- nao por pessoas_acessos_sensiveis, essa tabela exige pessoa_id/organization_id e um campo/accao que nao descrevem uma operacao de manutencao do cofre inteiro. Restrita a system_admin, no mesmo molde de hr_contas_bancarias_cofre_resumo: authenticated pode chamar, mas so quem tem is_system_admin(auth.uid()) recebe resposta -- os restantes recebem excepcao.';

-- ---- Conferir ----------------------------------------------------------------
-- So testa a guarda de permissao (o comportamento de apagar em si e
-- irreversivel -- ver o cabecalho desta migracao para o porque de nao ser
-- exercido aqui contra segredos reais nem de teste).
DO $conferir$
DECLARE
  v_existe        boolean;
  v_retorna_table boolean;
  v_seguranca     boolean;
  v_tem_public    boolean;
  v_tem_anon      boolean;
  v_tem_auth      boolean;
  v_tem_service   boolean;
  v_uid_falso     uuid := '00000000-0000-0000-0000-000000000000';
  v_recusou       boolean := false;
  v_log_existe    boolean;
  v_rls_activa    boolean;
  v_rls_forcada   boolean;
  v_tem_policy_select boolean;
  v_num_policies      int;
BEGIN
  -- Tabela de auditoria: existe, com RLS activa e forcada, e so a policy de
  -- SELECT para system_admin -- nenhuma de INSERT/UPDATE/DELETE.
  SELECT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'hr_cofre_manutencao_log' AND c.relkind = 'r'
  ) INTO v_log_existe;

  IF NOT v_log_existe THEN
    RAISE EXCEPTION 'public.hr_cofre_manutencao_log nao existe apos a migracao.';
  END IF;

  SELECT c.relrowsecurity, c.relforcerowsecurity INTO v_rls_activa, v_rls_forcada
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'hr_cofre_manutencao_log';

  IF NOT v_rls_activa THEN
    RAISE EXCEPTION 'public.hr_cofre_manutencao_log nao tem RLS activa.';
  END IF;

  SELECT count(*) INTO v_num_policies
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'hr_cofre_manutencao_log';

  IF v_num_policies <> 1 THEN
    RAISE EXCEPTION
      'public.hr_cofre_manutencao_log tem % policy(ies), esperava-se exactamente 1 (so SELECT para system_admin).',
      v_num_policies;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'hr_cofre_manutencao_log'
      AND p.polname = 'hr_cofre_manutencao_log_select_system_admin'
      AND p.polcmd = 'r'
  ) INTO v_tem_policy_select;

  IF NOT v_tem_policy_select THEN
    RAISE EXCEPTION
      'public.hr_cofre_manutencao_log nao tem a policy de SELECT esperada (hr_cofre_manutencao_log_select_system_admin).';
  END IF;

  RAISE NOTICE
    'OK: public.hr_cofre_manutencao_log criada, RLS activa%, exactamente 1 policy (SELECT para system_admin), sem INSERT/UPDATE/DELETE directo para authenticated.',
    CASE WHEN v_rls_forcada THEN ' e forcada' ELSE '' END;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_contas_bancarias_cofre_limpar_orfaos'
      AND p.pronargs = 0
  ) INTO v_existe;

  IF NOT v_existe THEN
    RAISE EXCEPTION 'public.hr_contas_bancarias_cofre_limpar_orfaos() nao existe apos a migracao.';
  END IF;

  SELECT p.proretset, p.prosecdef INTO v_retorna_table, v_seguranca
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'hr_contas_bancarias_cofre_limpar_orfaos' AND p.pronargs = 0;

  IF v_retorna_table IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'hr_contas_bancarias_cofre_limpar_orfaos() nao devolve um conjunto (RETURNS TABLE esperado).';
  END IF;

  IF v_seguranca IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'hr_contas_bancarias_cofre_limpar_orfaos() nao ficou SECURITY DEFINER.';
  END IF;

  -- REVOKE/GRANT como esperado.
  SELECT has_function_privilege('public', 'public.hr_contas_bancarias_cofre_limpar_orfaos()', 'EXECUTE') INTO v_tem_public;
  SELECT has_function_privilege('anon', 'public.hr_contas_bancarias_cofre_limpar_orfaos()', 'EXECUTE') INTO v_tem_anon;
  SELECT has_function_privilege('authenticated', 'public.hr_contas_bancarias_cofre_limpar_orfaos()', 'EXECUTE') INTO v_tem_auth;
  SELECT has_function_privilege('service_role', 'public.hr_contas_bancarias_cofre_limpar_orfaos()', 'EXECUTE') INTO v_tem_service;

  IF v_tem_public OR v_tem_anon THEN
    RAISE EXCEPTION
      'PUBLIC ou anon conseguem executar hr_contas_bancarias_cofre_limpar_orfaos(). Devia estar revogado a ambos.';
  END IF;

  IF NOT v_tem_auth OR NOT v_tem_service THEN
    RAISE EXCEPTION
      'authenticated ou service_role nao tem EXECUTE em hr_contas_bancarias_cofre_limpar_orfaos(). A guarda interna de is_system_admin e que restringe, nao o GRANT.';
  END IF;

  -- Teste ao vivo: um auth.uid() sem is_system_admin tem de ser recusado,
  -- ANTES de chegar a qualquer DELETE em vault.secrets. Simula-se via
  -- request.jwt.claims (o mesmo GUC de que auth.uid() le), limitado a esta
  -- transaccao (is_local = true) e reposto no fim. Nao apaga nenhum segredo
  -- real do Vault -- a guarda dispara antes do ciclo comecar.
  IF NOT public.is_system_admin(v_uid_falso) THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid_falso::text, 'role', 'authenticated')::text, true);

    BEGIN
      PERFORM * FROM public.hr_contas_bancarias_cofre_limpar_orfaos();
      v_recusou := false;
    EXCEPTION WHEN OTHERS THEN
      v_recusou := true;
    END;

    -- Repor de imediato, para nao deixar esta transaccao a falar em nome de
    -- outro uid pelo resto da migracao (mesmo nao havendo mais nada depois).
    PERFORM set_config('request.jwt.claims', '', true);

    IF NOT v_recusou THEN
      RAISE EXCEPTION
        'hr_contas_bancarias_cofre_limpar_orfaos() NAO recusou um uid sem is_system_admin. A guarda interna falhou -- nao aplicar neste estado.';
    END IF;

    RAISE NOTICE 'Teste ao vivo: um uid sem is_system_admin foi recusado, como esperado -- antes de qualquer DELETE em vault.secrets.';
  ELSE
    RAISE NOTICE
      'Teste ao vivo omitido: o uid falso 00000000-0000-0000-0000-000000000000 e, neste remoto, is_system_admin. Verificacao so estrutural.';
  END IF;

  RAISE NOTICE
    'OK: hr_contas_bancarias_cofre_limpar_orfaos() criada, SECURITY DEFINER, PUBLIC/anon revogados, authenticated/service_role com EXECUTE, guarda de system_admin confirmada ao vivo. O apagamento em si (DELETE em vault.secrets sobre orfaos reais) so sera exercido na primeira chamada real, por um system_admin, fora desta migracao.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. Esta migracao so cria objectos novos (uma funcao e uma tabela de
--    auditoria, com a sua propria RLS). Nao altera tabela, coluna nem
--    politica existente -- nao ha janela em que a base fique defeituosa so
--    por causa desta migracao.
--
-- 2. Esta funcao APAGA dados reais e irreversiveis no Vault na primeira vez
--    que for chamada por um system_admin -- a migracao em si nao chama a
--    funcao contra dados reais, so a define e testa a guarda de permissao.
--
-- 3. Confirmar por leitura directa (fora desta migracao, com service_role,
--    nunca aqui) a dimensao real dos orfaos (via hr_contas_bancarias_cofre_resumo(),
--    ja aplicada) antes da primeira chamada real desta funcao de limpeza.
-- ==============================================================================
