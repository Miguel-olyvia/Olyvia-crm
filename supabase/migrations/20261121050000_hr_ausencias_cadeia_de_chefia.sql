-- ==============================================================================
-- A cadeia de chefia: quem aprova o pedido de quem.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Um pedido de ferias tem de ir a "chefia", e a base nao sabe quem isso e.
-- Existem tres candidatos e sao todos maus por si:
--
--   employees.reports_to  -- a cadeia LEGADA de outro modelo de dados, que o
--                            ScheduleItemDialog usa hoje para decidir no
--                            CLIENTE se alguem pode aprovar. Nao se constroi
--                            mais nada sobre ela.
--   "lider de equipa"     -- nao existe como dado nenhum. Inventar uma tabela
--                            de equipas nesta ronda seria construir a segunda
--                            hierarquia antes de a primeira ser usada.
--   aprovador_id proprio  -- uma segunda hierarquia na ficha, a divergir da
--                            primeira em silencio no dia em que alguem mudar
--                            uma e nao a outra.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- A chefia e pessoas.reporta_a_pessoa_id, e mais nada. E a unica linha de
-- chefia dentro do modulo, tem FK composta, e e editavel na ficha.
--
-- Duas funcoes, e a diferenca entre elas e o momento:
--
-- 1. hr_ausencias_aprovador_chefia(pessoa, org) -> uuid
--    Resolve QUEM aprova, no momento do pedido, com quatro regras por ordem:
--      a) reporta_a_pessoa_id da pessoa, se essa chefia estiver viva, activa e
--         na mesma organizacao;
--      b) se a chefia resolvida FOR A PROPRIA PESSOA -- o chefe a pedir ferias
--         a si mesmo -- sobe um nivel, ao reporta_a_pessoa_id da chefia;
--      c) se subir levar a um ciclo, para ao segundo salto e devolve NULL;
--      d) NULL quando nao ha chefia.
--    NULL significa PASSO DISPENSADO e nao passo em aberto: a RPC grava uma
--    decisao resultado='dispensado' com motivo, e o pedido nasce em
--    pendente_rh. Nunca ha um pedido a espera de um aprovador que nao existe.
--    O resultado e gravado como SNAPSHOT em
--    pessoas_ausencias_pedidos.aprovador_chefia_pessoa_id: quando alguem muda
--    de chefe em Julho, os pedidos de Marco continuam a dizer quem tinha de os
--    aprovar naquele momento.
--
-- 2. hr_ausencias_pessoa_na_minha_cadeia(auth_uid, pessoa, org) -> boolean
--    Responde se aquela pessoa esta ABAIXO de mim na hierarquia ACTUAL, e e a
--    que a RLS usa. Actual e nao historica de proposito: quem entrou agora tem
--    de conseguir despachar a fila que herdou.
--    Sobe reporta_a_pessoa_id com WITH RECURSIVE, TODA a cadeia e nao so o
--    salto directo -- um director tem de poder despachar o pedido de quem
--    reporta a um chefe que lhe reporta. Limite de 10 saltos e deteccao de
--    ciclo por acumulacao do caminho: sem isso, dois chefes que se reportem um
--    ao outro por engano fariam a politica RLS correr para sempre, e uma
--    politica que nao termina e uma tabela que nao abre.
--
-- Ambas SECURITY DEFINER: tem de percorrer fichas que o proprio invocador pode
-- nao ter permissao para ler. Devolvem um uuid e um booleano -- veem a LINHA DE
-- CHEFIA, nao devolvem dados de ninguem. Ambas STABLE, para a RLS as poder
-- avaliar uma vez por query.
--
-- Esta migracao ACRESCENTA tambem o terceiro ramo a politica de SELECT de
-- pessoas_ausencias_direitos, que 20261121030000 deixou de fora exactamente
-- porque estas funcoes ainda nao existiam. Nenhuma politica nasce mais larga do
-- que devia e depois se estreita.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nao se cria tabela de equipas, nem cargo de lider, nem segunda hierarquia.
-- - Nao se toca em employees.reports_to: fica onde esta, legada.
-- - Nao se altera pessoas: reporta_a_pessoa_id ja existe (20261120030000).
-- - Nao se toca em pessoas_vinculos nem em pessoas_retribuicoes.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, e SO depois de as
-- politicas que as chamam terem sido reescritas sem elas:
--   DROP FUNCTION public.hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid);
--   DROP FUNCTION public.hr_ausencias_aprovador_chefia(uuid, uuid);
--
--
-- Prerequisitos:
--   20261120030000  pessoas (reporta_a_pessoa_id, estado_registo, deleted_at)
--   20261120090000  hr_pessoa_do_utilizador(uuid, uuid)
--   20261121030000  pessoas_ausencias_direitos (a politica que se completa)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas nao existe. Aplicar 20261120030000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas'
       AND column_name = 'reporta_a_pessoa_id'
  ) THEN
    RAISE EXCEPTION
      'public.pessoas nao tem reporta_a_pessoa_id. E a unica linha de chefia do modulo e estas funcoes nao existem sem ela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas' AND column_name = 'estado_registo'
  ) THEN
    RAISE EXCEPTION 'public.pessoas nao tem estado_registo; a regra de "chefia activa" depende dela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_do_utilizador' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION 'hr_pessoa_do_utilizador(uuid, uuid) nao existe. Aplicar 20261120090000 primeiro.';
  END IF;

  IF to_regclass('public.pessoas_ausencias_direitos') IS NULL THEN
    RAISE EXCEPTION
      'public.pessoas_ausencias_direitos nao existe. Aplicar 20261121030000 primeiro: esta migracao completa a politica de SELECT dela.';
  END IF;
END;
$guardas$;

-- ---- Quem aprova, resolvido no momento do pedido ---------------------------
CREATE OR REPLACE FUNCTION public.hr_ausencias_aprovador_chefia(
  _pessoa_id uuid,
  _organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_chefe  uuid;
  v_avo    uuid;
BEGIN
  IF _pessoa_id IS NULL OR _organization_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- (a) A chefia directa, se estiver viva, activa e na mesma organizacao.
  SELECT c.id
    INTO v_chefe
    FROM public.pessoas p
    JOIN public.pessoas c
      ON c.id = p.reporta_a_pessoa_id
     AND c.organization_id = p.organization_id
   WHERE p.id = _pessoa_id
     AND p.organization_id = _organization_id
     AND p.deleted_at IS NULL
     AND c.deleted_at IS NULL
     AND c.estado_registo = 'activo'
   LIMIT 1;

  IF v_chefe IS NULL THEN
    -- (d) Sem chefia. NULL quer dizer passo DISPENSADO, nao passo em aberto.
    RETURN NULL;
  END IF;

  IF v_chefe <> _pessoa_id THEN
    RETURN v_chefe;
  END IF;

  -- (b) A chefia resolvida e a propria pessoa -- o chefe a pedir ferias a si
  -- mesmo. Sobe um nivel. (O CHECK pessoas_nao_reporta_a_si torna isto
  -- improvavel, mas uma funcao de autoridade nao assenta num CHECK de outra
  -- tabela poder ser largado.)
  SELECT c.id
    INTO v_avo
    FROM public.pessoas p
    JOIN public.pessoas c
      ON c.id = p.reporta_a_pessoa_id
     AND c.organization_id = p.organization_id
   WHERE p.id = v_chefe
     AND p.organization_id = _organization_id
     AND p.deleted_at IS NULL
     AND c.deleted_at IS NULL
     AND c.estado_registo = 'activo'
   LIMIT 1;

  -- (c) Se subir levar de volta a propria pessoa, e um ciclo: para aqui.
  IF v_avo IS NULL OR v_avo = _pessoa_id THEN
    RETURN NULL;
  END IF;

  RETURN v_avo;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_ausencias_aprovador_chefia(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_ausencias_aprovador_chefia(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_ausencias_aprovador_chefia(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_ausencias_aprovador_chefia(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.hr_ausencias_aprovador_chefia(uuid, uuid) IS
'Devolve o pessoa_id de quem tem de aprovar o passo de chefia, ou NULL. Quatro regras por ordem: a chefia directa se estiver viva e activa; um nivel acima se a chefia resolvida for a propria pessoa (o chefe a pedir ferias a si mesmo); NULL se subir levar a um ciclo; NULL se nao houver chefia.

NULL significa PASSO DISPENSADO e nao passo em aberto: a RPC grava uma decisao resultado=dispensado com motivo e o pedido nasce em pendente_rh. Nunca ha um pedido a espera de um aprovador que nao existe.

O resultado grava-se como SNAPSHOT no pedido, e nao se resolve na leitura: quando alguem muda de chefe em Julho, os pedidos de Marco tem de continuar a dizer quem os tinha de aprovar naquele momento. A RLS, essa, usa a hierarquia ACTUAL -- e outra funcao.

SECURITY DEFINER porque percorre fichas que o invocador pode nao ter permissao para ler; devolve um uuid, nao devolve dados.';

-- ---- Esta pessoa esta abaixo de mim, na hierarquia ACTUAL? -----------------
CREATE OR REPLACE FUNCTION public.hr_ausencias_pessoa_na_minha_cadeia(
  _auth_uid uuid,
  _pessoa_id uuid,
  _organization_id uuid
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_eu       uuid;
  v_encontrei boolean;
BEGIN
  IF _auth_uid IS NULL OR _pessoa_id IS NULL OR _organization_id IS NULL THEN
    RETURN false;
  END IF;

  v_eu := public.hr_pessoa_do_utilizador(_auth_uid, _organization_id);

  IF v_eu IS NULL OR v_eu = _pessoa_id THEN
    -- A propria ficha nao entra por aqui: e o ramo de ficha-propria das
    -- politicas, com a permissao .view.own, e nao o de chefia.
    RETURN false;
  END IF;

  WITH RECURSIVE cadeia AS (
    SELECT p.id,
           p.reporta_a_pessoa_id,
           1 AS salto,
           ARRAY[p.id] AS caminho
      FROM public.pessoas p
     WHERE p.id = _pessoa_id
       AND p.organization_id = _organization_id
       AND p.deleted_at IS NULL

    UNION ALL

    SELECT c.id,
           c.reporta_a_pessoa_id,
           cadeia.salto + 1,
           cadeia.caminho || c.id
      FROM cadeia
      JOIN public.pessoas c
        ON c.id = cadeia.reporta_a_pessoa_id
       AND c.organization_id = _organization_id
       AND c.deleted_at IS NULL
     -- Limite de 10 saltos E deteccao de ciclo pelo caminho acumulado. Sem os
     -- dois, dois chefes que se reportem um ao outro por engano fariam a
     -- politica RLS correr para sempre -- e uma politica que nao termina e uma
     -- tabela que nao abre para ninguem.
     WHERE cadeia.salto < 10
       AND NOT (c.id = ANY (cadeia.caminho))
  )
  SELECT EXISTS (SELECT 1 FROM cadeia WHERE cadeia.id = v_eu)
    INTO v_encontrei;

  RETURN coalesce(v_encontrei, false);
END;
$$;

REVOKE ALL ON FUNCTION public.hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid) IS
'true se _pessoa_id estiver abaixo de mim na hierarquia ACTUAL de pessoas.reporta_a_pessoa_id. E a funcao que da o ramo de chefia as politicas RLS de ausencias.

Sobe TODA a cadeia e nao so o salto directo: um director tem de conseguir despachar o pedido de quem reporta a um chefe que lhe reporta. Limitada a 10 saltos, com deteccao de ciclo pelo caminho acumulado.

Hierarquia ACTUAL e nao a do momento do pedido, de proposito: quem entrou agora tem de conseguir despachar a fila que herdou. O snapshot historico e outra coisa, e vive no proprio pedido.

A PROPRIA ficha devolve false: isso e o ramo de ficha-propria com .view.own, nao o de chefia -- misturar os dois daria a quem tem aprovar.chefia leitura sobre si mesmo por um caminho errado.

SECURITY DEFINER porque tem de percorrer fichas que o invocador pode nao ter permissao para ler. Ve a linha de chefia; devolve um booleano, nao devolve dados.

NOTA de nome: e generica, e a ronda de assiduidade reaproveita-a tal como esta. O prefixo hr_ausencias_ e infeliz para esse uso; criar uma segunda funcao de cadeia ao lado seria pior.';

-- ---- Completar a politica de direitos com o ramo da chefia -----------------
-- ALTER POLICY e nao CREATE OR REPLACE a partir do zero: reescrever a politica
-- inteira aqui e o caminho por onde se perde um ramo, copiando uma versao
-- antiga. O bloco de conferencia verifica que os TRES ramos ficaram.
ALTER POLICY pessoas_ausencias_direitos_select ON public.pessoas_ausencias_direitos
  USING (
    deleted_at IS NULL
    AND (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.direitos.view', organization_id))
      OR (
        (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.view.own', organization_id))
        AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
      )
      OR (
        (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.aprovar.chefia', organization_id))
        AND (SELECT public.hr_ausencias_pessoa_na_minha_cadeia((SELECT auth.uid()), pessoa_id, organization_id))
      )
    )
  );

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_vol  char;
  v_sec  boolean;
  v_path text;
  v_qual text;
BEGIN
  -- hr_ausencias_aprovador_chefia: 2 argumentos, STABLE, SECURITY DEFINER,
  -- search_path fixo. Sem search_path fixo, uma funcao SECURITY DEFINER e uma
  -- porta aberta a captura de esquema.
  SELECT p.provolatile, p.prosecdef, array_to_string(p.proconfig, ',')
    INTO v_vol, v_sec, v_path
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_aprovador_chefia' AND p.pronargs = 2;

  IF v_vol IS NULL THEN
    RAISE EXCEPTION 'hr_ausencias_aprovador_chefia(uuid, uuid) nao ficou criada com 2 argumentos.';
  END IF;
  IF v_vol <> 's' THEN
    RAISE EXCEPTION 'hr_ausencias_aprovador_chefia nao e STABLE (volatilidade "%"). A RLS precisa de a avaliar uma vez por query.', v_vol;
  END IF;
  IF v_sec IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'hr_ausencias_aprovador_chefia nao e SECURITY DEFINER; nao conseguiria ver a cadeia de chefia.';
  END IF;
  IF coalesce(v_path,'') NOT LIKE '%search_path%' THEN
    RAISE EXCEPTION 'hr_ausencias_aprovador_chefia ficou sem search_path fixo. SECURITY DEFINER sem search_path e captura de esquema.';
  END IF;

  SELECT p.provolatile, p.prosecdef, array_to_string(p.proconfig, ',')
    INTO v_vol, v_sec, v_path
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_pessoa_na_minha_cadeia' AND p.pronargs = 3;

  IF v_vol IS NULL THEN
    RAISE EXCEPTION 'hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid) nao ficou criada com 3 argumentos.';
  END IF;
  IF v_vol <> 's' THEN
    RAISE EXCEPTION 'hr_ausencias_pessoa_na_minha_cadeia nao e STABLE (volatilidade "%").', v_vol;
  END IF;
  IF v_sec IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'hr_ausencias_pessoa_na_minha_cadeia nao e SECURITY DEFINER.';
  END IF;
  IF coalesce(v_path,'') NOT LIKE '%search_path%' THEN
    RAISE EXCEPTION 'hr_ausencias_pessoa_na_minha_cadeia ficou sem search_path fixo.';
  END IF;

  -- anon nao executa nenhuma das duas.
  IF has_function_privilege('anon', 'public.hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon consegue executar hr_ausencias_pessoa_na_minha_cadeia. O REVOKE nao pegou.';
  END IF;

  -- A politica de direitos tem de ter ficado com os TRES ramos.
  SELECT coalesce(qual,'') INTO v_qual
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_direitos'
     AND policyname = 'pessoas_ausencias_direitos_select';

  IF v_qual IS NULL THEN
    RAISE EXCEPTION 'A politica pessoas_ausencias_direitos_select desapareceu.';
  END IF;
  IF v_qual NOT LIKE '%hr_pessoa_do_utilizador%' THEN
    RAISE EXCEPTION 'A politica de direitos perdeu o ramo de ficha-propria ao ganhar o da chefia.';
  END IF;
  IF v_qual NOT LIKE '%hr_ausencias_pessoa_na_minha_cadeia%' THEN
    RAISE EXCEPTION 'A politica de direitos nao ganhou o ramo da chefia.';
  END IF;
  IF v_qual LIKE '%get_user_visible_org_ids%' THEN
    RAISE EXCEPTION 'A politica de direitos passou a usar get_user_visible_org_ids. Em RH isso nunca acontece.';
  END IF;

  RAISE NOTICE 'Conferido: as duas funcoes de cadeia, e a politica de direitos com os tres ramos.';
END;
$conferir$;
