-- ==============================================================================
-- O ecra /rh/admissao/configuracao (React) chamava directamente
-- hr_admissao_campos_obrigatorios_org(uuid) via supabase-js, mas essa funcao
-- e SO service_role desde 20261201050000, DE PROPOSITO (ver o comentario na
-- propria funcao): sem gate de permissao dentro do corpo, um GRANT a
-- authenticated deixaria qualquer utilizador autenticado, de QUALQUER
-- organizacao, pedir o organization_id de OUTRA organizacao e descobrir a
-- configuracao dela.
--
-- Confirmado ao vivo contra o remoto (nao so lido no ficheiro da migracao):
--   supabase db query --linked
--     "SELECT has_function_privilege('authenticated',
--       'public.hr_admissao_campos_obrigatorios_org(uuid)', 'EXECUTE')"
--   -> false. E o que faz o ecra mostrar o cartao "Os seus dados" vazio: o
--   hook chama a RPC como authenticated, recebe permission denied, o erro
--   fica so no estado de erro do react-query (nunca lancado como toast), e
--   `campos ?? []` renderiza uma lista vazia em vez de um erro.
--
-- POR APLICAR.
--
--
-- -- A REGRA NOVA ----------------------------------------------------------------
--
-- rpc_hr_admissao_campos_obrigatorios_org(p_organization_id) e a funcao nova,
-- SECURITY DEFINER, que faz ELA PROPRIA o gate que faltava -- confirma
-- has_anew_permission_in_org(auth.uid(), 'hr.admissao.obrigatorios.gerir',
-- p_organization_id) antes de devolver linha nenhuma -- e SO DEPOIS chama
-- hr_admissao_campos_obrigatorios_org(p_organization_id), que continua
-- inalterada e continua SO service_role (esta migracao nao lhe toca).
-- GRANT EXECUTE a authenticated fica so nesta wrapper nova.
--
-- hr_admissao_pendencias(uuid) e rpc_hr_convite_admissao_estado(text) NAO
-- mudam -- continuam a chamar hr_admissao_campos_obrigatorios_org
-- directamente, como donos da funcao (EXECUTE implicito), sem passar por
-- este gate novo, porque a decisao de quem pode ver a ficha ou o convite ja
-- e tomada dentro de cada uma delas.
--
--
-- -- O ECRA (fora do SQL) --------------------------------------------------------
--
-- src/hooks/useConfiguracaoObrigatoriosAdmissao.ts passa a chamar
-- "rpc_hr_admissao_campos_obrigatorios_org" em vez de
-- "hr_admissao_campos_obrigatorios_org". Entra no mesmo commit desta
-- migracao.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP FUNCTION IF EXISTS public.rpc_hr_admissao_campos_obrigatorios_org(uuid);
-- E reverter o hook para chamar hr_admissao_campos_obrigatorios_org (o que
-- reabre o bug: o ecra volta a mostrar a lista vazia para quem nao for
-- service_role).
--
--
-- Prerequisitos:
--   20261201050000  hr_admissao_campos_obrigatorios_org (versao vigente, service_role)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_n integer;
  v_retorno text;
  v_retorno_esperado CONSTANT text := 'TABLE(codigo text, origem text, condicional boolean, obrigatorio boolean)';
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_campos_obrigatorios_org' AND p.pronargs = 1;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Esperava exactamente 1 hr_admissao_campos_obrigatorios_org(uuid), encontrei %. Aplicar 20261201050000 primeiro.', v_n;
  END IF;

  -- Confirma nao so a aridade mas a FORMA da funcao pre-existente -- ja
  -- aconteceu nesta base escrever contra uma assinatura substituida por
  -- outra com colunas diferentes (ver CLAUDE.md, "Antes de escrever uma
  -- migration para uma funcao... que ja existe"). O RETURN QUERY abaixo so
  -- faz sentido se as colunas forem estas quatro, por esta ordem e tipo.
  SELECT pg_get_function_result(p.oid) INTO v_retorno
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_admissao_campos_obrigatorios_org' AND p.pronargs = 1;
  IF v_retorno <> v_retorno_esperado THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios_org(uuid) devolve "%", esperava-se "%" -- a assinatura mudou desde 20261201050000, investigar antes de aplicar.', v_retorno, v_retorno_esperado;
  END IF;

  IF has_function_privilege('authenticated', 'public.hr_admissao_campos_obrigatorios_org(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios_org ja e executavel por authenticated -- investigar antes de criar o wrapper, o gate desta migracao pode ja nao ser necessario.';
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org';
  IF v_n = 0 THEN
    RAISE EXCEPTION 'has_anew_permission_in_org nao existe -- esperava-a de 20261120010000.';
  END IF;
END;
$guardas$;


-- ==============================================================================
-- 1. rpc_hr_admissao_campos_obrigatorios_org: o gate que faltava a authenticated
-- ==============================================================================
DROP FUNCTION IF EXISTS public.rpc_hr_admissao_campos_obrigatorios_org(uuid);

CREATE FUNCTION public.rpc_hr_admissao_campos_obrigatorios_org(p_organization_id uuid)
RETURNS TABLE (codigo text, origem text, condicional boolean, obrigatorio boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.admissao.obrigatorios.gerir', p_organization_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.codigo, c.origem, c.condicional, c.obrigatorio
  FROM public.hr_admissao_campos_obrigatorios_org(p_organization_id) c;
END;
$$;

-- Callable por authenticated: o gate acima e o unico portao, agora dentro do
-- corpo da propria funcao -- e por isso que existe, em vez de simplesmente
-- dar GRANT EXECUTE a hr_admissao_campos_obrigatorios_org().
REVOKE ALL ON FUNCTION public.rpc_hr_admissao_campos_obrigatorios_org(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_admissao_campos_obrigatorios_org(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_admissao_campos_obrigatorios_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_admissao_campos_obrigatorios_org(uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_admissao_campos_obrigatorios_org(uuid) IS
'Wrapper de hr_admissao_campos_obrigatorios_org(uuid) chamavel por authenticated -- essa funcao e SO service_role (20261201050000) por nao ter gate proprio. Esta funcao confirma has_anew_permission_in_org(auth.uid(), ''hr.admissao.obrigatorios.gerir'', p_organization_id) antes de devolver seja o que for; quem nao tiver a permissao NESSA organizacao leva insufficient_privilege. Usada pelo ecra /rh/admissao/configuracao (useConfiguracaoObrigatoriosAdmissao.ts). Criada em 20261201130000 para corrigir o ecra a mostrar a lista de campos sempre vazia -- a chamada anterior, directa a hr_admissao_campos_obrigatorios_org, falhava com permission denied para qualquer authenticated.';


-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_n         integer;
  v_org_teste uuid;
  v_perm_id   uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_admissao_campos_obrigatorios_org'
       AND p.pronargs = 1 AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'rpc_hr_admissao_campos_obrigatorios_org(uuid) nao ficou SECURITY DEFINER.';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.rpc_hr_admissao_campos_obrigatorios_org(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_hr_admissao_campos_obrigatorios_org nao ficou executavel por authenticated -- o ecra continuaria vazio.';
  END IF;
  IF has_function_privilege('anon', 'public.rpc_hr_admissao_campos_obrigatorios_org(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rpc_hr_admissao_campos_obrigatorios_org ficou executavel por anon.';
  END IF;

  -- A funcao original continua fechada a authenticated -- esta migracao nao
  -- lhe alarga o acesso, so acrescenta um wrapper com gate proprio.
  IF has_function_privilege('authenticated', 'public.hr_admissao_campos_obrigatorios_org(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_admissao_campos_obrigatorios_org ficou executavel por authenticated -- devia continuar so service_role.';
  END IF;

  -- Sem permissao na organizacao, a wrapper recusa (nao devolve lista vazia
  -- silenciosa, que se leria como "sem campos a configurar").
  SELECT id INTO v_org_teste FROM public.anew_organizations LIMIT 1;
  IF v_org_teste IS NOT NULL THEN
    BEGIN
      PERFORM 1 FROM public.rpc_hr_admissao_campos_obrigatorios_org(v_org_teste);
      RAISE EXCEPTION 'rpc_hr_admissao_campos_obrigatorios_org devolveu linhas sem confirmar permissao -- o gate nao esta a correr (este bloco corre sem auth.uid()).';
    EXCEPTION
      WHEN sqlstate '42501' THEN
        NULL; -- esperado: auth.uid() e NULL dentro deste bloco DO, sem permissao nenhuma
    END;
  END IF;

  RAISE NOTICE
    'OK: rpc_hr_admissao_campos_obrigatorios_org criada, SECURITY DEFINER, executavel por authenticated com gate proprio, e a funcao original continua so service_role.';
END;
$conferir$;


-- ==============================================================================
-- ANTES DO db push
--
-- 1. O timestamp desta migration (20261201130000) e posterior a tudo o que
--    existe hoje na pasta -- reconfirmar com
--    `supabase migration list --linked` imediatamente antes do push real.
-- 2. Nenhuma janela de estado defeituoso: esta migracao so ACRESCENTA uma
--    funcao nova; nao toca em hr_admissao_campos_obrigatorios_org,
--    hr_admissao_pendencias nem rpc_hr_convite_admissao_estado.
-- 3. O hook `useConfiguracaoObrigatoriosAdmissao.ts` (React) que passa a
--    chamar `rpc_hr_admissao_campos_obrigatorios_org` em vez do nome antigo
--    entra no mesmo commit, fora do SQL -- sem essa mudanca esta migracao
--    fica sem efeito nenhum no ecra.
-- ==============================================================================
