-- ==============================================================================
-- pessoas_ausencias_pedidos.motivo: fecha a coluna a SELECT directo e passa a
-- servir-se so por rpc_hr_ausencia_ver_motivo, que decide caso a caso se o
-- tipo do pedido e sensivel.
--
-- POR APLICAR.
--
-- CORRIGIDO (nao aplicada ainda quando isto foi escrito): a primeira versao
-- fazia so REVOKE SELECT (motivo) ON TABLE, e isso nao tem efeito nenhum
-- enquanto existir um GRANT SELECT ao nivel da TABELA -- que 20261121060000
-- deu a authenticated. O `db push` parou aqui porque a guarda de baixo
-- apanhou a propria migracao a nao ter fechado nada. A correccao segue o
-- padrao de pessoas_identificacao para o NISS: REVOKE do GRANT de TABELA,
-- depois GRANT SELECT de uma lista explicita de colunas (todas menos
-- motivo). O bloco de conferir a seguir tambem passou a comparar o CONJUNTO
-- de colunas concedidas com o CONJUNTO de colunas da tabela menos motivo, e
-- falha para os dois lados -- para que uma coluna acrescentada a esta tabela
-- no futuro, sem tocar nesta lista, rebente no proximo `db push` em vez de
-- ficar invisivel para authenticated em silencio.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- 20261121060000 deu GRANT SELECT ON TABLE (a tabela inteira, todas as
-- colunas) a authenticated. useAusenciasDaOrganizacao.ts pede motivo
-- explicitamente, e PedidoDetalheSheet.tsx e quem decide se o mostra: um `&&`
-- em JSX que verifica tipo?.justificacao_sensivel e permissoes.verJustificacao.
-- Isso e uma cortina no ecra, nao uma fechadura na base -- quem chamar o
-- PostgREST directamente (curl, um outro cliente, um bug num ecra futuro)
-- recebe o motivo em claro, sensivel ou nao.
--
--
-- -- PORQUE NAO A MASCARA POR COLUNA (o padrao de pessoas_identificacao) ------
--
-- O padrao ja usado no modulo para o NISS -- REVOKE ALL e GRANT SELECT de uma
-- lista de colunas sem a sensivel -- funciona porque o NISS e sensivel em
-- TODAS as linhas da tabela: nao ha pessoa com um NISS "normal". Aqui nao: das
-- onze tipos de ausencia, so tres (BAIXA_MEDICA, DOENCA_FAMILIAR,
-- LICENCA_PARENTAL) sao justificacao_sensivel; os outros oito (Ferias,
-- Casamento, Congresso, Exames, Motivos familiares, Assistencia a familia,
-- Outro, Teletrabalho) tem motivo tao inocuo quanto "vou ao casamento do meu
-- irmao". Uma coluna e GRANT/REVOKE por INTEIRO -- nao ha "REVOKE SELECT
-- (motivo) WHERE tipo sensivel": a mascara por coluna e cega ao tipo da
-- LINHA, e fechar a coluna por essa via esconderia o motivo de TODOS os
-- pedidos, incluindo os oito tipos triviais, de toda a gente que hoje
-- legitimamente le a fila para aprovar (chefia, RH). Isso nao e aceitavel: e
-- pior do que o defeito que corrige, porque destroi informacao util em
-- oitenta porcento dos casos para fechar uma fuga que so existe nos outros
-- vinte.
--
--
-- -- A REGRA NOVA: RPC QUE DECIDE POR LINHA --------------------------------------
--
-- 1. REVOKE da coluna motivo a authenticated na tabela (fica sem SELECT
--    directo nenhum, sensivel ou nao) -- fecha a fuga por completo, porque so
--    uma funcao consegue decidir por linha, nunca um GRANT.
-- 2. rpc_hr_ausencia_ver_motivo(_pedido_id uuid) RETURNS text, SECURITY
--    DEFINER, que:
--      a. exige a MESMA permissao de ver o pedido que a politica de SELECT de
--         pessoas_ausencias_pedidos ja exige (hr.ausencias.view, OU
--         hr.ausencias.view.own da propria pessoa, OU
--         hr.ausencias.aprovar.chefia da cadeia) -- sem isto ninguem le
--         motivo nenhum, nem dos tipos triviais;
--      b. LE hr_ausencias_tipos.justificacao_sensivel do tipo do pedido;
--      c. se sensivel, exige ADICIONALMENTE hr.ausencias.justificacao.view e
--         regista o acesso em pessoas_acessos_sensiveis por
--         hr_registar_acesso_sensivel(pessoa, org, 'ausencia_motivo',
--         'revelar') -- o mesmo padrao do NISS, do IBAN e da propria
--         justificacao (rpc_hr_ausencia_ver_justificacao);
--      d. se NAO sensivel, devolve o motivo a quem ja passou o passo (a), sem
--         exigir nem registar nada a mais -- e exactamente o que a chefia e o
--         RH ja liam directamente ontem, sem regressao.
--
-- O QUE FICA IGUAL para a chefia e o RH nos oito tipos triviais: continuam a
-- ver o motivo, so que agora por uma chamada em vez de uma coluna. O QUE MUDA
-- nos tres tipos sensiveis: quem nao tem hr.ausencias.justificacao.view deixa
-- de ler o motivo tambem -- e essa protecao passa a existir de facto na base,
-- nao so no ecra.
--
--
-- -- O QUE ISTO EXIGE DO LADO DA APLICACAO (fora do alcance desta migracao) ----
--
-- useAusenciasDaOrganizacao.ts e PedidoDetalheSheet.tsx (repositorio,
-- src/hooks e src/components/hr/ausencias) tem de deixar de pedir a coluna
-- motivo directamente a pessoas_ausencias_pedidos e passar a chamar
-- rpc_hr_ausencia_ver_motivo por pedido. Ate essa alteracao ser feita, o
-- SELECT actual do ecra passa a falhar (PostgREST recusa o pedido inteiro
-- quando uma coluna pedida nao tem GRANT) -- e um custo aceite: a alternativa
-- e deixar a fuga aberta. Fica registado aqui para quem tratar do lado da
-- aplicacao, que corre em paralelo neste ramo.
--
--
-- -- COMO SE REVERTE -------------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP FUNCTION public.rpc_hr_ausencia_ver_motivo(uuid);
--   GRANT SELECT (motivo) ON TABLE public.pessoas_ausencias_pedidos TO authenticated;
--
--
-- Prerequisitos:
--   20261121060000  pessoas_ausencias_pedidos
--   20261121020000  hr_ausencias_tipos (coluna justificacao_sensivel)
--   20261121050000  hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid)
--   20261120090000  hr_pessoa_do_utilizador(uuid, uuid)
--   20261120040000  hr_registar_acesso_sensivel(uuid, uuid, text, text)
--   20261121010000  hr.ausencias.justificacao.view no catalogo
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_ausencias_pedidos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_pedidos nao existe. Aplicar 20261121060000 primeiro.';
  END IF;

  IF to_regclass('public.hr_ausencias_tipos') IS NULL THEN
    RAISE EXCEPTION 'public.hr_ausencias_tipos nao existe. Aplicar 20261121020000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'hr_ausencias_tipos'
       AND column_name = 'justificacao_sensivel'
  ) THEN
    RAISE EXCEPTION 'hr_ausencias_tipos.justificacao_sensivel nao existe. Estado da base inesperado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'has_anew_permission_in_org(uuid, text, uuid) nao existe. Aplicar 20261120010000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_pessoa_na_minha_cadeia' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid) nao existe. Aplicar 20261121050000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_do_utilizador' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION 'hr_pessoa_do_utilizador(uuid, uuid) nao existe. Aplicar 20261120090000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_registar_acesso_sensivel' AND p.pronargs = 4
  ) THEN
    RAISE EXCEPTION
      'hr_registar_acesso_sensivel(uuid, uuid, text, text) nao existe. Aplicar 20261120040000 primeiro: sem ela nao ha rasto de revelacao.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.ausencias.justificacao.view') THEN
    RAISE EXCEPTION 'hr.ausencias.justificacao.view nao esta no catalogo. Aplicar 20261121010000 primeiro.';
  END IF;
END;
$guardas$;

-- ---- Fechar a coluna --------------------------------------------------------
-- 20261121060000 deu GRANT SELECT ON TABLE (a tabela inteira) a authenticated.
-- Enquanto esse GRANT de tabela existir, um REVOKE SELECT (motivo) nao tem
-- efeito nenhum: o privilegio de tabela cobre todas as colunas, incluindo
-- motivo, e o REVOKE por coluna so retira algo que o GRANT por coluna tivesse
-- dado -- nunca o que veio da tabela. E foi exactamente o que aconteceu aqui:
-- a guarda de baixo apanhou a propria migracao a nao ter fechado nada.
--
-- A correccao e a mesma receita que pessoas_identificacao ja usa para o
-- NISS: primeiro REVOKE do GRANT de TABELA, depois GRANT SELECT de uma lista
-- explicita de colunas (todas menos motivo). So assim authenticated fica sem
-- nenhum caminho para SELECT motivo directamente.
REVOKE SELECT ON TABLE public.pessoas_ausencias_pedidos FROM authenticated;

GRANT SELECT (
  id, organization_id, pessoa_id,
  tipo_id, vinculo_id,
  data_inicio, data_fim, meio_dia_inicio, meio_dia_fim, hora_inicio, hora_fim,
  dias_solicitados, minutos_solicitados,
  estado,
  aprovador_chefia_pessoa_id, criado_por_pessoa_id,
  origem,
  schedule_item_id,
  periodo_inicio, periodo_fim,
  created_at, updated_at, created_by, updated_by
) ON TABLE public.pessoas_ausencias_pedidos TO authenticated;

COMMENT ON COLUMN public.pessoas_ausencias_pedidos.motivo IS
'SEM SELECT directo para authenticated desde 2026-09: le-se so por rpc_hr_ausencia_ver_motivo, que decide por linha se o tipo do pedido e sensivel. Nos oito tipos triviais devolve o motivo a quem ja pode ver o pedido; nos tres sensiveis (BAIXA_MEDICA, DOENCA_FAMILIAR, LICENCA_PARENTAL) exige ADICIONALMENTE hr.ausencias.justificacao.view e regista o acesso em pessoas_acessos_sensiveis. Uma mascara por GRANT de coluna nao serviria: e cega ao tipo da linha, e esconderia o motivo dos tipos triviais tambem.';

-- ---- A RPC -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_hr_ausencia_ver_motivo(_pedido_id uuid)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth       uuid := auth.uid();
  v_ped        public.pessoas_ausencias_pedidos;
  v_sensivel   boolean;
  v_pode_ver   boolean;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'ausencia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT p.* INTO v_ped FROM public.pessoas_ausencias_pedidos p WHERE p.id = _pedido_id;
  IF v_ped.id IS NULL THEN
    RAISE EXCEPTION 'ausencia_pedido_inexistente: o pedido % nao existe.', _pedido_id USING ERRCODE = '23503';
  END IF;

  -- O MESMO acesso que a politica de SELECT de pessoas_ausencias_pedidos ja
  -- exige para ver a linha. Sem isto, ninguem le motivo nenhum -- nem dos
  -- tipos triviais -- so por chamar esta funcao.
  v_pode_ver :=
    public.has_anew_permission_in_org(v_auth, 'hr.ausencias.view', v_ped.organization_id)
    OR (
      public.has_anew_permission_in_org(v_auth, 'hr.ausencias.view.own', v_ped.organization_id)
      AND v_ped.pessoa_id = public.hr_pessoa_do_utilizador(v_auth, v_ped.organization_id)
    )
    OR (
      public.has_anew_permission_in_org(v_auth, 'hr.ausencias.aprovar.chefia', v_ped.organization_id)
      AND public.hr_ausencias_pessoa_na_minha_cadeia(v_auth, v_ped.pessoa_id, v_ped.organization_id)
    );

  IF NOT v_pode_ver THEN
    RAISE EXCEPTION
      'ausencia_sem_permissao: sem acesso a este pedido de ausencia nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  SELECT t.justificacao_sensivel INTO v_sensivel
    FROM public.hr_ausencias_tipos t
   WHERE t.id = v_ped.tipo_id AND t.organization_id = v_ped.organization_id;

  IF coalesce(v_sensivel, false) THEN
    IF NOT public.has_anew_permission_in_org(v_auth, 'hr.ausencias.justificacao.view', v_ped.organization_id) THEN
      RAISE EXCEPTION
        'ausencia_sem_permissao: o motivo deste tipo de ausencia e sensivel e exige hr.ausencias.justificacao.view. Ver o pedido nao da acesso ao motivo clinico.'
        USING ERRCODE = '42501';
    END IF;

    -- O rasto, antes de devolver. O mesmo padrao do NISS, do IBAN e da
    -- justificacao (rpc_hr_ausencia_ver_justificacao).
    PERFORM public.hr_registar_acesso_sensivel(
      v_ped.pessoa_id, v_ped.organization_id, 'ausencia_motivo', 'revelar'
    );
  END IF;

  RETURN v_ped.motivo;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_ver_motivo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_ver_motivo(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_ver_motivo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_ver_motivo(uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_ausencia_ver_motivo(uuid) IS
'Devolve pessoas_ausencias_pedidos.motivo, decidindo por LINHA se o tipo do pedido e sensivel. Exige sempre o mesmo acesso ao pedido que a politica de SELECT da tabela (hr.ausencias.view, ou view.own da propria pessoa, ou aprovar.chefia da cadeia). Se o tipo for sensivel (BAIXA_MEDICA, DOENCA_FAMILIAR, LICENCA_PARENTAL), exige ADICIONALMENTE hr.ausencias.justificacao.view e regista a revelacao em pessoas_acessos_sensiveis. Substitui o SELECT directo da coluna motivo, fechado a authenticated por esta mesma migracao.';

-- ---- Conferir ----------------------------------------------------------------
-- Para alem de motivo estar fechado, este bloco compara o CONJUNTO de colunas
-- concedidas com o CONJUNTO de colunas da tabela menos motivo, e FALHA se
-- divergir nos dois sentidos. Uma concessao por coluna nao cobre colunas
-- futuras: quem acrescentar uma coluna a esta tabela sem tocar nesta lista
-- fica com ela invisivel para authenticated, sem erro nenhum -- e essa e a
-- classe de falha que este teste existe para apanhar em voz alta, no push,
-- em vez de a deixar desaparecer em silencio.
DO $conferir$
DECLARE
  v_grant_motivo      integer;
  v_grant_tabela       integer;
  v_colunas_tabela     text[];
  v_colunas_concedidas text[];
  v_em_falta           text[];
  v_a_mais             text[];
BEGIN
  -- 1. motivo continua sem SELECT directo (nem por tabela, nem por coluna).
  SELECT count(*) INTO v_grant_motivo
    FROM information_schema.role_column_grants
   WHERE table_schema = 'public' AND table_name = 'pessoas_ausencias_pedidos'
     AND column_name = 'motivo' AND grantee = 'authenticated' AND privilege_type = 'SELECT';

  IF v_grant_motivo <> 0 THEN
    RAISE EXCEPTION 'authenticated ainda tem SELECT directo em pessoas_ausencias_pedidos.motivo.';
  END IF;

  -- 2. Confirma que nao sobrou nenhum GRANT SELECT ao nivel da TABELA: e essa
  --    sobra que fez o REVOKE (motivo) original nao ter efeito nenhum.
  SELECT count(*) INTO v_grant_tabela
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'pessoas_ausencias_pedidos'
     AND grantee = 'authenticated' AND privilege_type = 'SELECT';

  IF v_grant_tabela <> 0 THEN
    RAISE EXCEPTION
      'authenticated ainda tem SELECT ao nivel da TABELA em pessoas_ausencias_pedidos -- isso cobre motivo tambem, mesmo com o REVOKE de coluna feito.';
  END IF;

  -- 3. O conjunto de colunas da tabela, menos motivo, TEM de ser exactamente
  --    o conjunto de colunas com SELECT concedido a authenticated. Falha para
  --    os dois lados: coluna concedida a mais (motivo vazou por outro caminho)
  --    e coluna em falta (uma coluna nova, ou uma das antigas, ficou de fora
  --    do GRANT explicito e desapareceu para authenticated sem aviso nenhum).
  SELECT array_agg(column_name ORDER BY column_name) INTO v_colunas_tabela
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'pessoas_ausencias_pedidos'
     AND column_name <> 'motivo';

  SELECT array_agg(column_name ORDER BY column_name) INTO v_colunas_concedidas
    FROM information_schema.role_column_grants
   WHERE table_schema = 'public' AND table_name = 'pessoas_ausencias_pedidos'
     AND grantee = 'authenticated' AND privilege_type = 'SELECT';

  SELECT array_agg(c) INTO v_em_falta
    FROM unnest(coalesce(v_colunas_tabela, '{}'::text[])) c
   WHERE c <> ALL (coalesce(v_colunas_concedidas, '{}'::text[]));

  SELECT array_agg(c) INTO v_a_mais
    FROM unnest(coalesce(v_colunas_concedidas, '{}'::text[])) c
   WHERE c <> ALL (coalesce(v_colunas_tabela, '{}'::text[]));

  IF v_em_falta IS NOT NULL THEN
    RAISE EXCEPTION
      'authenticated ficou sem SELECT em colunas de pessoas_ausencias_pedidos que deviam continuar legiveis: %. Se for uma coluna nova, falta acrescenta-la ao GRANT SELECT desta migracao.',
      v_em_falta;
  END IF;

  IF v_a_mais IS NOT NULL THEN
    RAISE EXCEPTION
      'authenticated tem SELECT em colunas de pessoas_ausencias_pedidos fora do esperado (incluindo, possivelmente, motivo): %.',
      v_a_mais;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_ausencia_ver_motivo' AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION 'rpc_hr_ausencia_ver_motivo(uuid) nao ficou criada.';
  END IF;

  RAISE NOTICE 'Conferido: motivo fechado a SELECT directo (tabela e coluna), servido so por rpc_hr_ausencia_ver_motivo; as restantes % colunas conferem exactamente com o GRANT.', array_length(v_colunas_tabela, 1);
END;
$conferir$;
