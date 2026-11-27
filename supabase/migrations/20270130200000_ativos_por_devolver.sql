-- ==============================================================================
-- 20270130200000_ativos_por_devolver.sql
--
-- ATIVOS, fase 1, passo F1.1: a lista «por devolver» — quem sai (ou já saiu) da
-- organização e ainda tem itens consigo (ativos entregues pelo RH e viaturas da Frota).
-- Desenho fechado: vault/ficheiros/ativos/ativos-plano-fase1-nike.md (secção 2, F1.1) e a
-- versão simples aprovada pelo dono (ativos-plano-fase1-nike-v2.md, passos 1 e 2).
-- Decisão do dono (v2): o AVISO NO SINO FOI RETIRADO. O aviso é uma FAIXA na página,
-- alimentada por esta mesma rpc. Por isso NÃO há aqui notificações, destinatários, rotina
-- diária nem job de cron. Não há tabelas, colunas nem CHECKs novas: só funções.
-- As viaturas ficam só na Frota: são LIDAS aqui, nunca duplicadas em ativo.
--
-- SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth). NUNCA a principal (tzbfgw...).
--
-- O QUE O ECRÃ TEM DE FAZER (no mesmo envio):
--  * src/hooks/ativos/useAtivosPorDevolver.ts: chama rpc_ativos_por_devolver(
--    p_organization_id, p_pessoa_id DEFAULT NULL, p_dias DEFAULT 90) e lê
--    {hoje, dias, detalhe, total_pessoas, total_itens, pessoas:[{pessoa_id, nome,
--    saida_prevista, origem: data_saida|fim_contrato|fim_decidido, dias_restantes, vinculo_id,
--    chefia_pessoa_id, n_itens, itens:[{origem: ativo|frota, item_id, ref_id, codigo, nome,
--    desde}]}]}. Com detalhe = false (só ativos.view ou só hr.pessoas.vinculos.view) a lista
--    `pessoas` vem VAZIA e só valem as contagens: o separador «Saídas» mostra só a faixa e
--    esconde a tabela. `nome` vem NULL a quem não tem hr.pessoas.view (salvo a chefia direta):
--    mostrar ativos.saidas.semNome. As viaturas da Frota só vêm (e só contam) a quem tem
--    fleet.view. dias_restantes negativo = já saiu.
--  * src/pages/ativos/Ativos.tsx: separador «Saídas» (SaidasPorDevolver.tsx).
--  * FAIXA no topo dos Ativos e do RH (Contratos a terminar e ficha da pessoa): a mesma rpc
--    com p_dias = 30; «X pessoas saem nos próximos 30 dias com Y itens por devolver».
--  * rh-exemplo/fimContrato (FimContratoCard, ContratosATerminarTab, PorDevolverNaSaida):
--    a coluna «Por devolver»; a chefia direta pede só o seu subordinado (p_pessoa_id).
--  * Erros: 42501 sem acesso (sem permissão e sem ser a chefia direta da pessoa pedida);
--    ATV35 p_dias fora de 0 a 365. Traduzir ATV35 em components/ativos/lib/errosAtivo.ts e
--    ativos.erro.ATV35 em src/translations/ativos.ts (pt e en).
--
-- ORDEM DE APLICAÇÃO
--  1. Testes de texto (src/components/ativos/ativosPorDevolverMigration.test.ts).
--  2. Confirmar supabase/.temp/project-ref = uetjghdkwbywbftedtth e correr
--     `supabase migration list --linked` IMEDIATAMENTE antes (o push aplica tudo o que
--     estiver pendente).
--  3. Tem de estar aplicada ANTES de 20270130400000_hr_vinculo_terminar_por_devolver, que
--     chama ativos_itens_por_devolver.
--
-- O QUE FAZ
--  0. Guardas: base certa, nomes novos livres, colunas lidas existem, permissões no
--     catálogo, ATV35 livre.
--  1. ativos_itens_por_devolver(p_org, p_pessoa_id): a REGRA ÚNICA do que está por devolver
--     (usada pela lista e pelo bloqueio do «Terminar»). p_pessoa_id NULL = todas as pessoas da
--     organização, numa só consulta (devolve também pessoa_id, para a lista não chamar a
--     função pessoa a pessoa). Itens: linhas do RH com ativo e estado «atribuido»; viaturas
--     da Frota com atribuição sem devolução nem cancelamento, a um condutor ligado à pessoa.
--  2. rpc_ativos_por_devolver: permissão ANTES de ler; uma só consulta, sem ciclos por
--     pessoa (timeout de 8 s do authenticated); só pessoas com pelo menos um item.
--  3. Direitos: a interna para ninguém; a rpc só para authenticated.
--  4. Conferir o estado final.
--
-- ACESSO (rpc_ativos_por_devolver)
--  (revisão de segurança 27/11: quem tem que equipamento só aparece a quem tem
--   hr.pessoas.retribuicao.view, como em rpc_ativos_listar; esta rpc segue a mesma porta)
--  * hr.pessoas.vinculos.view E hr.pessoas.retribuicao.view: a lista da organização, com
--    pessoas, datas e itens (detalhe = true).
--  * Chefia direta (pessoas.reporta_a_pessoa_id -> conta ativa -> utilizador com membership
--    ativo na organização): o detalhe, só pedindo esse subordinado.
--  * Só ativos.view ou só hr.pessoas.vinculos.view, pedindo a organização inteira
--    (p_pessoa_id NULL): só as contagens (detalhe = false, pessoas = []).
--  * Caso contrário (incluindo pedir uma pessoa sem detalhe nem chefia): 42501.
--  * O nome só a quem tem hr.pessoas.view, ou à chefia direta; os outros recebem nome NULL.
--    (Substitui a regra D15 do plano, que dava o nome a ativos.edit: a confirmar pelo dono.)
--  * Viaturas da Frota (matrícula, marca, modelo) só a quem tem fleet.view.
--
-- ERROS NOVOS: ATV35 p_dias fora de 0 a 365 (RAISE 'ATV35' USING ERRCODE = 'P0001').
--
-- COMO SE REVERTE: sem ficheiro de reversão nesta pasta, de propósito.
-- ==============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ---- 0. Guardas (tudo do catálogo com ::text) ----------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  -- G1 Esta é a base de RH (a nike existe aqui) e quem aplica passa a RLS.
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = 'b6ffce4f-f630-4933-833a-008649757a33') THEN
    RAISE EXCEPTION 'G1: a organização nike não existe nesta base. É a base certa?';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G1: o papel que aplica (%) não tem BYPASSRLS.', current_user::text;
  END IF;

  -- G2 Os nomes novos estão livres.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public'
     AND p.proname::text IN ('ativos_itens_por_devolver', 'rpc_ativos_por_devolver');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G2: já existem % função(ões) com nomes desta migration. Investigar.', v_n;
  END IF;

  -- G3 As colunas que as funções leem existem (lidas a 27/11).
  SELECT count(*) INTO v_n
    FROM (VALUES
      ('public.pessoas', 'organization_id'), ('public.pessoas', 'nome_completo'),
      ('public.pessoas', 'reporta_a_pessoa_id'), ('public.pessoas', 'data_saida'),
      ('public.pessoas', 'deleted_at'),
      ('public.pessoas_vinculos', 'pessoa_id'), ('public.pessoas_vinculos', 'organization_id'),
      ('public.pessoas_vinculos', 'estado'), ('public.pessoas_vinculos', 'data_fim'),
      ('public.pessoas_vinculos', 'fim_decisao'), ('public.pessoas_vinculos', 'deleted_at'),
      ('public.pessoas_equipamentos', 'organization_id'), ('public.pessoas_equipamentos', 'pessoa_id'),
      ('public.pessoas_equipamentos', 'ativo_id'), ('public.pessoas_equipamentos', 'estado'),
      ('public.pessoas_equipamentos', 'entrega'),
      ('public.ativo', 'organization_id'), ('public.ativo', 'codigo'), ('public.ativo', 'nome'),
      ('public.fleet_assignments', 'organization_id'), ('public.fleet_assignments', 'driver_id'),
      ('public.fleet_assignments', 'vehicle_id'), ('public.fleet_assignments', 'starts_on'),
      ('public.fleet_assignments', 'returned_on'), ('public.fleet_assignments', 'cancelled_at'),
      ('public.fleet_drivers', 'organization_id'), ('public.fleet_drivers', 'pessoa_id'),
      ('public.fleet_vehicles', 'organization_id'), ('public.fleet_vehicles', 'plate'),
      ('public.fleet_vehicles', 'make'), ('public.fleet_vehicles', 'model'),
      ('public.fleet_vehicles', 'deleted_at'),
      ('public.pessoas_contas', 'pessoa_id'), ('public.pessoas_contas', 'organization_id'),
      ('public.pessoas_contas', 'anew_user_id'), ('public.pessoas_contas', 'estado'),
      ('public.anew_users', 'auth_user_id'), ('public.anew_users', 'deleted_at'),
      ('public.anew_memberships', 'user_id'), ('public.anew_memberships', 'organization_id'),
      ('public.anew_memberships', 'status')
    ) AS x(tabela, coluna)
   WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a
                      WHERE a.attrelid = to_regclass(x.tabela) AND a.attname::text = x.coluna
                        AND a.attnum > 0 AND NOT a.attisdropped);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G3: faltam % coluna(s) que esta migration lê. Reler o schema antes de aplicar.', v_n;
  END IF;

  -- G4 Dependências e permissões no catálogo.
  IF to_regprocedure('public.ativos_hoje()') IS NULL
     OR to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'G4: falta ativos_hoje ou has_anew_permission_in_org.';
  END IF;
  SELECT count(DISTINCT p.code) INTO v_n FROM public.anew_permissions p
   WHERE p.code IN ('ativos.view', 'hr.pessoas.vinculos.view', 'hr.pessoas.retribuicao.view',
                    'hr.pessoas.view', 'fleet.view');
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'G4: faltam permissões no catálogo (encontradas % de 5). Esta migration não cria permissões.', v_n;
  END IF;

  -- G5 Código de erro novo ainda livre.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public' AND p.prosrc ~ 'ATV35';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G5: há % função(ões) que já usam ATV35. Escolher outro.', v_n;
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. A regra única: itens por devolver
-- ==============================================================================
CREATE FUNCTION public.ativos_itens_por_devolver(p_org uuid, p_pessoa_id uuid)
RETURNS TABLE(pessoa_id uuid, origem text, item_id uuid, ref_id uuid, codigo text, nome text, desde date)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  -- ativos entregues pelo RH e ainda não devolvidos
  SELECT pe.pessoa_id, 'ativo'::text, pe.id, a.id, a.codigo, a.nome, pe.entrega
    FROM public.pessoas_equipamentos pe
    JOIN public.ativo a ON a.id = pe.ativo_id AND a.organization_id = pe.organization_id
   WHERE pe.organization_id = p_org
     AND (p_pessoa_id IS NULL OR pe.pessoa_id = p_pessoa_id)
     AND pe.estado = 'atribuido'
  UNION ALL
  -- viaturas da Frota (só lidas): atribuição já começada, sem devolução nem cancelamento
  -- (uma reserva futura não está na posse da pessoa: não entra)
  SELECT fd.pessoa_id, 'frota'::text, fa.id, fv.id, fv.plate, nullif(concat_ws(' ', fv.make, fv.model), ''), fa.starts_on
    FROM public.fleet_assignments fa
    JOIN public.fleet_drivers fd ON fd.id = fa.driver_id AND fd.organization_id = fa.organization_id
    JOIN public.fleet_vehicles fv ON fv.id = fa.vehicle_id AND fv.organization_id = fa.organization_id AND fv.deleted_at IS NULL
   WHERE fa.organization_id = p_org
     AND fd.pessoa_id IS NOT NULL
     AND (p_pessoa_id IS NULL OR fd.pessoa_id = p_pessoa_id)
     AND fa.starts_on <= public.ativos_hoje()
     AND fa.returned_on IS NULL
     AND fa.cancelled_at IS NULL
$$;

-- ==============================================================================
-- 2. RPC: a lista por devolver (também alimenta a faixa da página)
-- ==============================================================================
CREATE FUNCTION public.rpc_ativos_por_devolver(
  p_organization_id uuid,
  p_pessoa_id uuid DEFAULT NULL,
  p_dias integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_hoje     date := public.ativos_hoje();
  v_detalhe  boolean;
  v_contagem boolean;
  v_chefia   boolean := false;
  v_ve_nome  boolean;
  v_ve_frota boolean;
  v_res      jsonb;
BEGIN
  -- 1) permissão ANTES de ler dados
  IF v_uid IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501', DETAIL = 'Não tem acesso à lista de itens por devolver.';
  END IF;
  -- lista com pessoas e itens: a mesma porta que rpc_ativos_listar usa para «quem tem o quê»
  v_detalhe := coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.vinculos.view', p_organization_id), false)
           AND coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.retribuicao.view', p_organization_id), false);
  -- só contagens da organização (a faixa), sem pessoas, datas nem itens
  v_contagem := coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.vinculos.view', p_organization_id), false)
            OR coalesce(public.has_anew_permission_in_org(v_uid, 'ativos.view', p_organization_id), false);
  IF NOT v_detalhe THEN
    -- a chefia direta vê o detalhe, mas só pedindo esse subordinado
    v_chefia := p_pessoa_id IS NOT NULL AND EXISTS (
      SELECT 1
        FROM public.pessoas p
        JOIN public.pessoas_contas pc
          ON pc.pessoa_id = p.reporta_a_pessoa_id AND pc.organization_id = p.organization_id AND pc.estado = 'activa'
        JOIN public.anew_users au
          ON au.id = pc.anew_user_id AND au.auth_user_id = v_uid AND au.deleted_at IS NULL
        JOIN public.anew_memberships am
          ON am.user_id = au.id AND am.organization_id = p.organization_id AND am.status = 'active'
       WHERE p.id = p_pessoa_id AND p.organization_id = p_organization_id AND p.deleted_at IS NULL);
    -- sem detalhe nem chefia: só as contagens da organização inteira (nunca de uma pessoa pedida)
    IF NOT v_chefia AND NOT (v_contagem AND p_pessoa_id IS NULL) THEN
      RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501', DETAIL = 'Não tem acesso à lista de itens por devolver.';
    END IF;
  END IF;

  -- 2) parâmetros
  IF p_dias IS NULL OR p_dias < 0 OR p_dias > 365 THEN
    RAISE EXCEPTION 'ATV35' USING ERRCODE = 'P0001', DETAIL = 'O horizonte tem de estar entre 0 e 365 dias.';
  END IF;

  -- o nome só a quem pode ler pessoas (ou à chefia direta do subordinado pedido)
  v_ve_nome := v_chefia
            OR coalesce(public.has_anew_permission_in_org(v_uid, 'hr.pessoas.view', p_organization_id), false);
  -- as viaturas da Frota só a quem pode ver a Frota (também fora das contagens)
  v_ve_frota := coalesce(public.has_anew_permission_in_org(v_uid, 'fleet.view', p_organization_id), false);
  v_detalhe := v_detalhe OR v_chefia;

  -- 3) uma só consulta (sem ciclos por pessoa)
  WITH saidas AS (
    SELECT p.id AS pessoa_id, p.nome_completo, p.reporta_a_pessoa_id, v.id AS vinculo_id,
           coalesce(p.data_saida, v.data_fim) AS saida,
           CASE WHEN p.data_saida IS NOT NULL THEN 'data_saida'
                WHEN v.fim_decisao = 'terminar' THEN 'fim_decidido'
                ELSE 'fim_contrato' END AS origem
      FROM public.pessoas p
      LEFT JOIN public.pessoas_vinculos v
        ON v.pessoa_id = p.id AND v.organization_id = p.organization_id
       AND v.deleted_at IS NULL AND v.estado IN ('activo', 'suspenso')
     WHERE p.organization_id = p_organization_id
       AND p.deleted_at IS NULL
       AND (p_pessoa_id IS NULL OR p.id = p_pessoa_id)
       AND coalesce(p.data_saida, v.data_fim) <= v_hoje + p_dias
  ),
  itens AS (
    SELECT i.pessoa_id, i.origem, i.item_id, i.ref_id, i.codigo, i.nome, i.desde
      FROM public.ativos_itens_por_devolver(p_organization_id, p_pessoa_id) i
     WHERE i.origem <> 'frota' OR v_ve_frota
  ),
  por_pessoa AS (
    SELECT s.pessoa_id, s.nome_completo, s.reporta_a_pessoa_id, s.vinculo_id, s.saida, s.origem,
           count(*)::integer AS n_itens,
           jsonb_agg(jsonb_build_object(
             'origem', i.origem, 'item_id', i.item_id, 'ref_id', i.ref_id,
             'codigo', i.codigo, 'nome', i.nome, 'desde', i.desde)
             ORDER BY i.desde, i.codigo) AS itens
      FROM saidas s
      JOIN itens i ON i.pessoa_id = s.pessoa_id
     GROUP BY s.pessoa_id, s.nome_completo, s.reporta_a_pessoa_id, s.vinculo_id, s.saida, s.origem
  )
  SELECT jsonb_build_object(
           'hoje', v_hoje,
           'dias', p_dias,
           'detalhe', v_detalhe,
           'total_pessoas', count(*),
           'total_itens', coalesce(sum(pp.n_itens), 0),
           'pessoas', CASE WHEN NOT v_detalhe THEN '[]'::jsonb ELSE coalesce(jsonb_agg(jsonb_build_object(
               'pessoa_id', pp.pessoa_id,
               'nome', CASE WHEN v_ve_nome THEN pp.nome_completo END,
               'saida_prevista', pp.saida,
               'origem', pp.origem,
               'dias_restantes', pp.saida - v_hoje,
               'vinculo_id', pp.vinculo_id,
               'chefia_pessoa_id', pp.reporta_a_pessoa_id,
               'n_itens', pp.n_itens,
               'itens', pp.itens)
             ORDER BY pp.saida, pp.pessoa_id), '[]'::jsonb) END)
    INTO v_res
    FROM por_pessoa pp;

  RETURN v_res;
END;
$$;

-- ==============================================================================
-- 3. Direitos: a interna para ninguém; a rpc só para authenticated
-- ==============================================================================
REVOKE ALL ON FUNCTION public.ativos_itens_por_devolver(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_ativos_por_devolver(uuid, uuid, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_ativos_por_devolver(uuid, uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.ativos_itens_por_devolver(uuid, uuid) IS
  'Regra única do que está por devolver (ativos do RH atribuídos e viaturas da Frota sem devolução). p_pessoa_id NULL = toda a organização.';
COMMENT ON FUNCTION public.rpc_ativos_por_devolver(uuid, uuid, integer) IS
  'Pessoas que saem até hoje + p_dias (ou já saíram) com itens por devolver. Alimenta o separador Saídas e a faixa da página. ATV35: p_dias fora de 0-365.';

-- ==============================================================================
-- 4. Conferir o estado final (catálogo lido com ::text)
-- ==============================================================================
DO $conferir$
DECLARE
  v_f record;
BEGIN
  -- C1 As funções existem, com o modo de segurança e o search_path vazio.
  FOR v_f IN SELECT * FROM (VALUES
      ('ativos_itens_por_devolver', 'p_org uuid, p_pessoa_id uuid', false),
      ('rpc_ativos_por_devolver', 'p_organization_id uuid, p_pessoa_id uuid, p_dias integer', true)
    ) AS x(nome, args, definer) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                    WHERE ns.nspname::text = 'public' AND p.proname::text = v_f.nome
                      AND pg_get_function_identity_arguments(p.oid)::text = v_f.args
                      AND p.prosecdef = v_f.definer
                      AND array_to_string(p.proconfig, ',')::text = 'search_path=""') THEN
      RAISE EXCEPTION 'C1: % não ficou como devia (assinatura, SECURITY DEFINER ou search_path).', v_f.nome;
    END IF;
  END LOOP;

  -- C2 Direitos: anon sem nada; authenticated só na rpc.
  IF has_function_privilege('anon', 'public.rpc_ativos_por_devolver(uuid, uuid, integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.rpc_ativos_por_devolver(uuid, uuid, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'C2: direitos errados em rpc_ativos_por_devolver.';
  END IF;
  IF has_function_privilege('anon', 'public.ativos_itens_por_devolver(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.ativos_itens_por_devolver(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'C2: ativos_itens_por_devolver não pode ter EXECUTE para anon nem authenticated.';
  END IF;

  -- C3 A regra corre (sem erros de tipo) na nike.
  PERFORM count(*) FROM public.ativos_itens_por_devolver('b6ffce4f-f630-4933-833a-008649757a33', NULL);
END;
$conferir$;

COMMIT;
