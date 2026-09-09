-- ==============================================================================
-- pessoas_ausencias_pedido_decisoes: quem decidiu, em que passo, quando e
-- porque. A FONTE DA VERDADE do fluxo de aprovacao.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A pergunta "quem aprovou isto e quando" tem, neste fluxo, DUAS RESPOSTAS
-- SIMULTANEAS: o chefe a 3 de Marco e o RH a 5 de Marco. Uma coluna de estado
-- guarda uma decisao -- a ultima.
--
-- A alternativa obvia, duplicar colunas (aprovado_chefia_por,
-- aprovado_chefia_em, aprovado_rh_por, aprovado_rh_em, recusado_por,
-- motivo_recusa), resolve dois passos e rebenta ao terceiro. Nao guarda uma
-- devolucao seguida de nova aprovacao, e nao tem onde por o "ajustar" que o
-- fluxo mostra ao lado de aprovar e recusar.
--
-- E ha o exemplo em casa: schedule_items tem approval_status + approved_by +
-- approved_at, sem historico, com approved_by a guardar auth.uid() enquanto
-- created_by guarda anew_users.id -- duas identidades diferentes na mesma
-- linha -- e um rejection_reason que nao se consegue alcancar.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Uma linha = uma decisao. Append-only: sem deleted_at, sem updated_at, e sem
-- politica de UPDATE que passe. Isto e o que auditoria significa -- se uma
-- decisao se pode reescrever, nao e um registo, e uma opiniao actual.
--
-- passo: chefia / rh. resultado: aprovado / recusado / dispensado / ajustado /
-- devolvido. A tabela da, de graca, o que as colunas nao davam: os dois autores
-- com os dois instantes; o motivo de recusa preso ao passo que recusou; o
-- ajuste com as datas propostas; e um pedido devolvido e reaprovado sem perder
-- a primeira volta.
--
-- O autor fica gravado DUAS VEZES: decidido_por_anew_user_id porque anew_users
-- e a identidade que decide, e decidido_por_pessoa_id porque e a ficha que se
-- le meses depois, quando a conta ja nao existe. Nao e redundancia -- e a
-- diferenca entre "quem tinha sessao aberta" e "quem, na organizacao, e essa
-- pessoa".
--
-- Tres CHECKs que fazem o trabalho:
--   - recusado, ajustado e devolvido EXIGEM motivo nao vazio. Uma recusa sem
--     razao escrita e o que gera a disputa laboral;
--   - ajustado exige as datas propostas, senao nao ha ajuste nenhum a ler;
--   - so 'dispensado' pode nao ter autor. Um passo dispensado e a base a
--     registar que o passo nao se aplica (tipo sem aprovacao de chefia, ou
--     pessoa sem chefia resoluvel) -- nunca ha um pedido aprovado sem duas
--     linhas de decisao a explica-lo.
--
--
-- -- ESCRITA FECHADA -----------------------------------------------------------
--
-- authenticated tem SELECT e mais nada; tres politicas AS RESTRICTIVE ... false.
-- Decidir valida a aresta da maquina de estados E a autoridade de quem decide
-- (a chefia so decide o passo de chefia, e so dos seus) -- um WITH CHECK nao
-- alcanca nem uma coisa nem a outra.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - As RPCs de decidir: 20261121110000. Ate la esta tabela existe e nada lhe
--   escreve por caminho de utilizador.
-- - Notificacoes, prazos, escalonamento por inercia: nao ha nada disso.
-- - Nao se toca em pessoas_vinculos nem em pessoas_retribuicoes.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TABLE public.pessoas_ausencias_pedido_decisoes;
--
--
-- Prerequisitos:
--   20261121060000  pessoas_ausencias_pedidos (unique id, pessoa_id, organization_id)
--   20261121050000  hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid)
--   20261120090000  hr_pessoa_do_utilizador(uuid, uuid)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_ausencias_pedidos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_pedidos nao existe. Aplicar 20261121060000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_ausencias_pedidos_id_pessoa_org_key'
       AND conrelid = to_regclass('public.pessoas_ausencias_pedidos')
       AND cardinality(conkey) = 3
  ) THEN
    RAISE EXCEPTION
      'A unique (id, pessoa_id, organization_id) de pessoas_ausencias_pedidos nao existe; a FK COMPOSTA de pedido_id depende dela. Sem ela, uma decisao podia apontar ao pedido de outra pessoa.';
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
END;
$guardas$;

-- ---- A tabela --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pessoas_ausencias_pedido_decisoes (
  id                       uuid NOT NULL DEFAULT gen_random_uuid(),
  pedido_id                uuid NOT NULL,
  pessoa_id                uuid NOT NULL,
  organization_id          uuid NOT NULL,

  ordem                    smallint NOT NULL,
  passo                    text NOT NULL,
  resultado                text NOT NULL,

  -- O autor, duas vezes: a identidade que decidiu e a ficha que se le depois.
  decidido_por_anew_user_id uuid,
  decidido_por_pessoa_id    uuid,
  decidido_em               timestamptz NOT NULL DEFAULT now(),

  motivo                   text,

  -- Quando o resultado e 'ajustado', a contraproposta.
  ajuste_data_inicio       date,
  ajuste_data_fim          date,
  ajuste_dias              numeric(6,2),

  -- SEM updated_at e SEM deleted_at: append-only.
  created_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pessoas_ausencias_pedido_decisoes_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_ausencias_pedido_decisoes_id_org_key UNIQUE (id, organization_id),

  -- Uma decisao por passo e por ordem. E isto que impede duas aprovacoes de
  -- chefia na mesma volta a coexistirem, e o que da a devolucao um numero de
  -- volta proprio em vez de sobrescrever a anterior.
  CONSTRAINT pessoas_ausencias_pedido_decisoes_passo_ordem_key
    UNIQUE (pedido_id, passo, ordem),

  CONSTRAINT pessoas_ausencias_pedido_decisoes_pedido_fkey
    FOREIGN KEY (pedido_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_ausencias_pedidos (id, pessoa_id, organization_id)
    ON DELETE CASCADE,

  CONSTRAINT pessoas_ausencias_pedido_decisoes_decidido_por_fkey
    FOREIGN KEY (decidido_por_anew_user_id) REFERENCES public.anew_users (id) ON DELETE NO ACTION,

  CONSTRAINT pessoas_ausencias_pedido_decisoes_decidido_por_pessoa_fkey
    FOREIGN KEY (decidido_por_pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id)
    ON DELETE SET NULL (decidido_por_pessoa_id),

  CONSTRAINT pessoas_ausencias_pedido_decisoes_passo_valido
    CHECK (passo IN ('chefia','rh')),

  CONSTRAINT pessoas_ausencias_pedido_decisoes_resultado_valido
    CHECK (resultado IN ('aprovado','recusado','dispensado','ajustado','devolvido')),

  CONSTRAINT pessoas_ausencias_pedido_decisoes_ordem_positiva
    CHECK (ordem >= 1),

  -- Uma recusa, um ajuste ou uma devolucao sem razao escrita e o que gera a
  -- disputa laboral. Nao passa.
  CONSTRAINT pessoas_ausencias_pedido_decisoes_motivo_obrigatorio
    CHECK (
      resultado NOT IN ('recusado','ajustado','devolvido')
      OR (motivo IS NOT NULL AND btrim(motivo) <> '')
    ),

  -- Um ajuste sem contraproposta nao e um ajuste.
  CONSTRAINT pessoas_ausencias_pedido_decisoes_ajuste_com_datas
    CHECK (resultado <> 'ajustado' OR ajuste_data_inicio IS NOT NULL),

  CONSTRAINT pessoas_ausencias_pedido_decisoes_ajuste_datas_validas
    CHECK (ajuste_data_fim IS NULL OR ajuste_data_inicio IS NULL
           OR ajuste_data_fim >= ajuste_data_inicio),

  -- SO 'dispensado' pode nao ter autor: e a base a registar que o passo nao se
  -- aplica. Todos os outros resultados sao actos de alguem.
  CONSTRAINT pessoas_ausencias_pedido_decisoes_autor_obrigatorio
    CHECK (resultado = 'dispensado' OR decidido_por_anew_user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_pedido_decisoes_pedido
  ON public.pessoas_ausencias_pedido_decisoes (pedido_id, decidido_em);

CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_pedido_decisoes_pessoa
  ON public.pessoas_ausencias_pedido_decisoes (pessoa_id, decidido_em DESC);

CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_pedido_decisoes_org
  ON public.pessoas_ausencias_pedido_decisoes (organization_id, decidido_em DESC);

COMMENT ON TABLE public.pessoas_ausencias_pedido_decisoes IS
'A FONTE DA VERDADE do fluxo de aprovacao: uma linha por decisao, append-only. pessoas_ausencias_pedidos.estado e uma cache disto.

Existe porque "quem aprovou isto e quando" tem duas respostas simultaneas -- a chefia e o RH -- e uma coluna de estado guarda a ultima. Colunas duplicadas resolvem dois passos e rebentam ao terceiro, nao guardam uma devolucao seguida de nova aprovacao, e nao tem onde por o resultado "ajustado".

E o defeito que schedule_items ja tem: approval_status + approved_by + approved_at, sem historico, com approved_by a guardar auth.uid() enquanto created_by guarda anew_users.id.

Um tipo com exige_aprovacao_chefia=false NAO salta o registo: a RPC de criacao escreve logo uma decisao passo=chefia, resultado=dispensado, e o pedido nasce em pendente_rh. Nunca ha um pedido aprovado sem duas linhas de decisao a explica-lo.';

COMMENT ON COLUMN public.pessoas_ausencias_pedido_decisoes.decidido_por_anew_user_id IS
'anew_users.id -- a identidade que decidiu. Guardado ao lado de decidido_por_pessoa_id de proposito: nao e redundancia, e a diferenca entre "quem tinha sessao aberta" e "quem, na organizacao, e essa pessoa". A conta pode desaparecer; a ficha fica.';

COMMENT ON COLUMN public.pessoas_ausencias_pedido_decisoes.resultado IS
'aprovado / recusado / dispensado / ajustado / devolvido. dispensado e o unico que pode nao ter autor -- e a base a registar que o passo nao se aplica. devolvido devolve o pedido ao passo anterior sem perder a volta que ja tinha havido.';

COMMENT ON COLUMN public.pessoas_ausencias_pedido_decisoes.ordem IS
'O numero da volta dentro do passo. Com a unique (pedido_id, passo, ordem), uma devolucao seguida de nova aprovacao de chefia da duas linhas -- ordem 1 e ordem 2 -- em vez de sobrescrever a primeira.';

-- ---- Grants: SELECT e mais nada -------------------------------------------
REVOKE ALL ON TABLE public.pessoas_ausencias_pedido_decisoes FROM anon;
REVOKE ALL ON TABLE public.pessoas_ausencias_pedido_decisoes FROM authenticated;
GRANT SELECT ON TABLE public.pessoas_ausencias_pedido_decisoes TO authenticated;
GRANT ALL ON TABLE public.pessoas_ausencias_pedido_decisoes TO service_role;

-- ---- RLS -------------------------------------------------------------------
ALTER TABLE public.pessoas_ausencias_pedido_decisoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_ausencias_pedido_decisoes_select ON public.pessoas_ausencias_pedido_decisoes;
CREATE POLICY pessoas_ausencias_pedido_decisoes_select ON public.pessoas_ausencias_pedido_decisoes
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.view', organization_id))
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.view.own', organization_id))
      AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
    )
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.aprovar.chefia', organization_id))
      AND (SELECT public.hr_ausencias_pessoa_na_minha_cadeia((SELECT auth.uid()), pessoa_id, organization_id))
    )
  );

DROP POLICY IF EXISTS pessoas_ausencias_pedido_decisoes_block_insert ON public.pessoas_ausencias_pedido_decisoes;
CREATE POLICY pessoas_ausencias_pedido_decisoes_block_insert ON public.pessoas_ausencias_pedido_decisoes
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_ausencias_pedido_decisoes_block_update ON public.pessoas_ausencias_pedido_decisoes;
CREATE POLICY pessoas_ausencias_pedido_decisoes_block_update ON public.pessoas_ausencias_pedido_decisoes
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_ausencias_pedido_decisoes_block_delete ON public.pessoas_ausencias_pedido_decisoes;
CREATE POLICY pessoas_ausencias_pedido_decisoes_block_delete ON public.pessoas_ausencias_pedido_decisoes
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_ausencias_pedido_decisoes_select ON public.pessoas_ausencias_pedido_decisoes IS
'Os mesmos tres ramos dos pedidos. Que o trabalhador leia as decisoes sobre os SEUS pedidos e deliberado: saber que a recusa foi da chefia e nao do RH, e com que motivo, e a base de poder contesta-la.';

COMMENT ON POLICY pessoas_ausencias_pedido_decisoes_block_update ON public.pessoas_ausencias_pedido_decisoes IS
'Append-only nao e uma convencao: e esta politica. Uma decisao que se pode reescrever nao e um registo de auditoria, e uma opiniao actual. Nem as RPCs do modulo actualizam aqui -- corrigir uma decisao e escrever outra.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls       boolean;
  v_politicas integer;
  v_restr     integer;
  v_qual      text;
BEGIN
  IF to_regclass('public.pessoas_ausencias_pedido_decisoes') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_pedido_decisoes nao ficou criada.';
  END IF;

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'pessoas_ausencias_pedido_decisoes';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'A tabela ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_politicas FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_pedido_decisoes';
  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas, encontraram-se %.', v_politicas;
  END IF;

  SELECT count(*) INTO v_restr FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_pedido_decisoes'
     AND permissive = 'RESTRICTIVE';
  IF v_restr <> 3 THEN
    RAISE EXCEPTION 'Esperavam-se 3 politicas RESTRICTIVE de escrita, encontraram-se %.', v_restr;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'pessoas_ausencias_pedido_decisoes'
       AND grantee = 'authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION 'authenticated tem GRANT de escrita. Esta tabela e SELECT e mais nada.';
  END IF;

  SELECT coalesce(qual,'') INTO v_qual FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_pedido_decisoes'
     AND policyname = 'pessoas_ausencias_pedido_decisoes_select';

  IF v_qual NOT LIKE '%hr_pessoa_do_utilizador%' THEN
    RAISE EXCEPTION 'A politica de SELECT perdeu o ramo de ficha-propria.';
  END IF;
  IF v_qual NOT LIKE '%hr_ausencias_pessoa_na_minha_cadeia%' THEN
    RAISE EXCEPTION 'A politica de SELECT perdeu o ramo da chefia.';
  END IF;
  IF v_qual LIKE '%get_user_visible_org_ids%' THEN
    RAISE EXCEPTION 'A politica usa get_user_visible_org_ids. Em RH isso nunca acontece.';
  END IF;
  IF v_qual ~ 'has_anew_permission\([^_]' THEN
    RAISE EXCEPTION 'A politica usa has_anew_permission (global) em vez de has_anew_permission_in_org.';
  END IF;

  -- Append-only de verdade: nem updated_at nem deleted_at.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_ausencias_pedido_decisoes'
       AND column_name IN ('updated_at','deleted_at')
  ) THEN
    RAISE EXCEPTION
      'A tabela de decisoes ganhou updated_at ou deleted_at. E append-only: corrigir uma decisao e escrever outra.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_ausencias_pedido_decisoes_pedido_fkey'
       AND conrelid = to_regclass('public.pessoas_ausencias_pedido_decisoes')
       AND cardinality(conkey) = 3
  ) THEN
    RAISE EXCEPTION
      'A FK do pedido nao e composta de 3 colunas. Uma FK simples deixaria uma decisao apontar ao pedido de outra pessoa.';
  END IF;

  RAISE NOTICE 'Conferido: decisoes append-only, escrita fechada, tres ramos de leitura.';
END;
$conferir$;
