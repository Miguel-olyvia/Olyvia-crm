-- ==============================================================================
-- pessoas_ausencias_ajustes: o ajuste manual ao contador, append-only, com
-- autor e motivo obrigatorios.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Um contador de ferias muda por razoes que nao sao pedidos: um acerto de
-- admissao, dias transportados do periodo anterior, uma troca de dias por
-- dinheiro, um premio, um acerto de cessacao, ou simplesmente um erro a
-- corrigir.
--
-- A maneira obvia -- somar ou subtrair a dias_direito -- perde exactamente a
-- informacao que interessa: passados tres meses ninguem sabe porque o contador
-- daquela pessoa tem 24 e nao 22, nem quem o mudou. E se depois se descobrir
-- que o ajuste estava errado, nao ha o que reverter, porque nao ha registo do
-- que foi feito.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- O ajuste e uma FUNCIONALIDADE DE PRIMEIRA CLASSE com tabela propria, e nunca
-- um UPDATE ao direito. Uma linha = um ajuste, COM SINAL: dias positivos somam,
-- negativos subtraem, e zero e recusado por CHECK (um ajuste de zero dias nao
-- e um ajuste, e escondia um erro de preenchimento).
--
-- motivo_codigo e um CHECK fechado (correccao, transporte_periodo_anterior,
-- troca_por_dinheiro, premio, acerto_admissao, acerto_cessacao, outro) porque e
-- por ele que a guarda dos 20 dias uteis encontra as trocas por dinheiro; e
-- motivo e text NOT NULL com btrim(motivo) <> '' -- um ajuste sem explicacao em
-- palavras nao passa, porque foi precisamente o rasto de "quem ajustou e
-- porque" que se pediu.
--
-- SEM deleted_at, de proposito: um ajuste nao se apaga, ANULA-SE, com
-- anulado_em, anulado_por_anew_user_id e anulacao_motivo, e a linha original
-- fica. O CHECK amarra os tres: nao ha anulacao sem motivo.
--
-- O autor fica gravado DUAS VEZES -- aplicado_por_anew_user_id porque e a
-- identidade que decidiu, e o pessoa_id do proprio ajuste nao serve para isso.
-- A troca de ferias por dinheiro NAO tem tabela propria: e, em substancia, um
-- ajuste negativo com motivo_codigo='troca_por_dinheiro', que e exactamente o
-- que esta tabela e.
--
--
-- -- ESCRITA FECHADA -----------------------------------------------------------
--
-- authenticated tem SELECT e mais nada. As tres politicas de escrita sao
-- AS RESTRICTIVE ... false e a escrita entra toda por RPC SECURITY DEFINER
-- (rpc_hr_ausencia_ajustar_saldo, 20261121120000). Razao: aplicar um ajuste nao
-- e inserir uma linha -- corre a guarda legal dos 20 dias uteis sobre o
-- agregado do periodo, e um WITH CHECK nao consegue garantir isso.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - A guarda dos 20 dias uteis e a RPC de ajuste: 20261121120000. Ate essa
--   migracao ser aplicada, esta tabela existe e nada lhe escreve.
-- - A chefia NAO le esta tabela. O contador de saldo de um subordinado e do RH
--   e do proprio: um ajuste de sancao ou um acerto de cessacao nao e assunto da
--   chefia directa.
-- - Nao se toca em pessoas_vinculos nem em pessoas_retribuicoes.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TABLE public.pessoas_ausencias_ajustes;
--
--
-- Prerequisitos:
--   20261120030000  pessoas (unique pessoas_id_org_key)
--   20261120040000  hr_satelite_ancora_imutavel()
--   20261120090000  hr_pessoa_do_utilizador(uuid, uuid)
--   20261121010000  hr.ausencias.ajustar / .direitos.view no catalogo
--   20261121020000  hr_ausencias_tipos
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas nao existe. Aplicar 20261120030000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_id_org_key' AND conrelid = to_regclass('public.pessoas')
  ) THEN
    RAISE EXCEPTION 'A unique pessoas_id_org_key nao existe; a FK composta da ancora depende dela.';
  END IF;

  IF to_regclass('public.hr_ausencias_tipos') IS NULL THEN
    RAISE EXCEPTION 'public.hr_ausencias_tipos nao existe. Aplicar 20261121020000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'has_anew_permission_in_org(uuid, text, uuid) nao existe. Aplicar 20261120010000.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_do_utilizador' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION 'hr_pessoa_do_utilizador(uuid, uuid) nao existe. Aplicar 20261120090000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.ausencias.ajustar') THEN
    RAISE EXCEPTION 'hr.ausencias.ajustar nao esta no catalogo. Aplicar 20261121010000 primeiro.';
  END IF;
END;
$guardas$;

-- ---- A tabela --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pessoas_ausencias_ajustes (
  id                        uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id                 uuid NOT NULL,
  organization_id           uuid NOT NULL,

  tipo_id                   uuid NOT NULL,
  periodo_inicio            date NOT NULL,
  periodo_fim               date NOT NULL,

  -- COM SINAL: positivo soma, negativo subtrai. Zero nao e um ajuste.
  dias                      numeric(6,2) NOT NULL,
  minutos                   integer,

  motivo_codigo             text NOT NULL,
  motivo                    text NOT NULL,
  documento_ref             text,

  aplicado_por_anew_user_id uuid NOT NULL,
  aplicado_em               timestamptz NOT NULL DEFAULT now(),

  -- Anular, nao apagar.
  anulado_em                timestamptz,
  anulado_por_anew_user_id  uuid,
  anulacao_motivo           text,

  created_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid,

  CONSTRAINT pessoas_ausencias_ajustes_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_ausencias_ajustes_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT pessoas_ausencias_ajustes_id_pessoa_org_key UNIQUE (id, pessoa_id, organization_id),

  CONSTRAINT pessoas_ausencias_ajustes_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,

  CONSTRAINT pessoas_ausencias_ajustes_tipo_fkey
    FOREIGN KEY (tipo_id, organization_id)
    REFERENCES public.hr_ausencias_tipos (id, organization_id) ON DELETE NO ACTION,

  CONSTRAINT pessoas_ausencias_ajustes_aplicado_por_fkey
    FOREIGN KEY (aplicado_por_anew_user_id) REFERENCES public.anew_users (id) ON DELETE NO ACTION,
  CONSTRAINT pessoas_ausencias_ajustes_anulado_por_fkey
    FOREIGN KEY (anulado_por_anew_user_id) REFERENCES public.anew_users (id) ON DELETE NO ACTION,
  CONSTRAINT pessoas_ausencias_ajustes_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  -- Um ajuste de zero dias nao e um ajuste: seria um registo sem efeito a
  -- esconder um erro de preenchimento.
  CONSTRAINT pessoas_ausencias_ajustes_dias_nao_zero
    CHECK (dias <> 0),

  CONSTRAINT pessoas_ausencias_ajustes_periodo_valido
    CHECK (periodo_fim > periodo_inicio),

  CONSTRAINT pessoas_ausencias_ajustes_motivo_codigo_valido
    CHECK (motivo_codigo IN ('correccao','transporte_periodo_anterior','troca_por_dinheiro',
                             'premio','acerto_admissao','acerto_cessacao','outro')),

  -- Um ajuste sem explicacao em palavras nao passa: e o rasto que se pediu.
  CONSTRAINT pessoas_ausencias_ajustes_motivo_nao_vazio
    CHECK (btrim(motivo) <> ''),

  -- Nao ha anulacao sem motivo, e nao ha motivo de anulacao sem anulacao.
  CONSTRAINT pessoas_ausencias_ajustes_anulacao_coerente
    CHECK (
      (anulado_em IS NULL AND anulado_por_anew_user_id IS NULL AND anulacao_motivo IS NULL)
      OR (anulado_em IS NOT NULL AND anulado_por_anew_user_id IS NOT NULL
          AND anulacao_motivo IS NOT NULL AND btrim(anulacao_motivo) <> '')
    ),

  -- Uma troca de dias por dinheiro e sempre uma SAIDA de dias do contador.
  -- Positiva, seria dinheiro a criar ferias, e nao e isso que existe.
  CONSTRAINT pessoas_ausencias_ajustes_troca_e_negativa
    CHECK (motivo_codigo <> 'troca_por_dinheiro' OR dias < 0)
);

-- Os indices que a funcao de saldo usa. Parciais nos nao anulados, que sao os
-- unicos que contam.
CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_ajustes_saldo
  ON public.pessoas_ausencias_ajustes (pessoa_id, tipo_id, periodo_inicio)
  WHERE anulado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_ajustes_org
  ON public.pessoas_ausencias_ajustes (organization_id, aplicado_em DESC);

-- A guarda legal dos 20 dias uteis soma por aqui.
CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_ajustes_troca
  ON public.pessoas_ausencias_ajustes (pessoa_id, tipo_id, periodo_inicio)
  WHERE anulado_em IS NULL AND motivo_codigo = 'troca_por_dinheiro';

COMMENT ON TABLE public.pessoas_ausencias_ajustes IS
'O ajuste manual ao contador de ausencias: append-only, com autor e motivo obrigatorios. NUNCA se faz um UPDATE a pessoas_ausencias_direitos.dias_direito -- isso apagaria a razao pela qual o contador mudou, e passados tres meses ninguem saberia porque aquela pessoa tem 24 dias e nao 22.

dias tem SINAL. A troca de ferias por dinheiro NAO tem tabela propria: e um ajuste negativo com motivo_codigo=troca_por_dinheiro, que e em substancia o que isto e -- dias que saem do contador com autor e motivo.

SEM deleted_at de proposito: um ajuste nao se apaga, anula-se com motivo.

A CHEFIA NAO LE ESTA TABELA. O contador de um subordinado e do RH e do proprio: um ajuste de sancao ou de acerto de cessacao nao e assunto da chefia directa.';

COMMENT ON COLUMN public.pessoas_ausencias_ajustes.dias IS
'COM SINAL: positivo soma ao contador, negativo subtrai. Zero e recusado por CHECK. A funcao de saldo separa os positivos (que entram nos adquiridos) dos negativos (que saem dos disponiveis).';

COMMENT ON COLUMN public.pessoas_ausencias_ajustes.aplicado_por_anew_user_id IS
'anew_users.id de quem aplicou. NOT NULL: um ajuste sem autor nao e auditavel, e nem o service_role escreve aqui sem indicar quem.';

-- ---- Grants: SELECT e mais nada -------------------------------------------
REVOKE ALL ON TABLE public.pessoas_ausencias_ajustes FROM anon;
REVOKE ALL ON TABLE public.pessoas_ausencias_ajustes FROM authenticated;
GRANT SELECT ON TABLE public.pessoas_ausencias_ajustes TO authenticated;
GRANT ALL ON TABLE public.pessoas_ausencias_ajustes TO service_role;

-- ---- RLS -------------------------------------------------------------------
ALTER TABLE public.pessoas_ausencias_ajustes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_ausencias_ajustes_select ON public.pessoas_ausencias_ajustes;
CREATE POLICY pessoas_ausencias_ajustes_select ON public.pessoas_ausencias_ajustes
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.direitos.view', organization_id))
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.view.own', organization_id))
      AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
    )
  );

-- AS RESTRICTIVE e nao permissivo: uma politica permissiva a mais nao reabre
-- nada. A escrita entra por RPC SECURITY DEFINER, que corre a guarda legal.
DROP POLICY IF EXISTS pessoas_ausencias_ajustes_block_insert ON public.pessoas_ausencias_ajustes;
CREATE POLICY pessoas_ausencias_ajustes_block_insert ON public.pessoas_ausencias_ajustes
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_ausencias_ajustes_block_update ON public.pessoas_ausencias_ajustes;
CREATE POLICY pessoas_ausencias_ajustes_block_update ON public.pessoas_ausencias_ajustes
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_ausencias_ajustes_block_delete ON public.pessoas_ausencias_ajustes;
CREATE POLICY pessoas_ausencias_ajustes_block_delete ON public.pessoas_ausencias_ajustes
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_ausencias_ajustes_select ON public.pessoas_ausencias_ajustes IS
'Dois ramos e SO dois: quem tem hr.ausencias.direitos.view naquela organizacao, e cada um os seus. A chefia esta DELIBERADAMENTE de fora -- um ajuste de sancao ou de acerto de cessacao nao e assunto da chefia directa, ainda que ela veja os pedidos da equipa.';

COMMENT ON POLICY pessoas_ausencias_ajustes_block_insert ON public.pessoas_ausencias_ajustes IS
'Escrita fechada, no padrao de pessoas_contas e de anew_entity_org_links. Aplicar um ajuste corre a guarda legal dos 20 dias uteis sobre o agregado do periodo -- direito, ajustes anteriores e dias gozados. Um WITH CHECK ve uma linha e nao consegue garantir nada disso. Entra por rpc_hr_ausencia_ajustar_saldo (20261121120000).';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls       boolean;
  v_politicas integer;
  v_escrita   integer;
BEGIN
  IF to_regclass('public.pessoas_ausencias_ajustes') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_ajustes nao ficou criada.';
  END IF;

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'pessoas_ausencias_ajustes';

  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_ajustes ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_politicas FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_ajustes';

  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas em pessoas_ausencias_ajustes, encontraram-se %.', v_politicas;
  END IF;

  -- As tres de escrita tem de ser RESTRICTIVE. Permissivas, uma politica a
  -- mais em qualquer migracao futura reabria a escrita directa.
  SELECT count(*) INTO v_escrita FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_ajustes'
     AND permissive = 'RESTRICTIVE';

  IF v_escrita <> 3 THEN
    RAISE EXCEPTION
      'Esperavam-se 3 politicas RESTRICTIVE (insert, update, delete) em pessoas_ausencias_ajustes, encontraram-se %.', v_escrita;
  END IF;

  -- authenticated nao pode ter INSERT/UPDATE/DELETE ao nivel do GRANT: sem
  -- isso, a escrita fechada dependia so da RLS.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'pessoas_ausencias_ajustes'
       AND grantee = 'authenticated'
       AND privilege_type IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION
      'authenticated tem GRANT de escrita em pessoas_ausencias_ajustes. Esta tabela e SELECT e mais nada; a escrita entra por RPC.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_ajustes'
       AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) LIKE '%get_user_visible_org_ids%'
  ) THEN
    RAISE EXCEPTION 'Alguma politica usa get_user_visible_org_ids. Em RH isso nunca acontece.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_ajustes'
       AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~ 'has_anew_permission\([^_]'
  ) THEN
    RAISE EXCEPTION 'Alguma politica usa has_anew_permission (global) em vez de has_anew_permission_in_org.';
  END IF;

  -- A chefia tem de ficar FORA desta tabela. Se a funcao de cadeia aparecer
  -- aqui, alguem copiou a politica dos pedidos por engano.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_ajustes'
       AND coalesce(qual,'') LIKE '%pessoa_na_minha_cadeia%'
  ) THEN
    RAISE EXCEPTION
      'A politica de ajustes ganhou o ramo da chefia. E deliberado que a chefia NAO le os ajustes de saldo dos subordinados.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_ajustes'
       AND policyname = 'pessoas_ausencias_ajustes_select'
       AND coalesce(qual,'') LIKE '%hr_pessoa_do_utilizador%'
  ) THEN
    RAISE EXCEPTION 'A politica de SELECT perdeu o ramo de ficha-propria.';
  END IF;

  -- Sem deleted_at: se alguem a acrescentar, ha um caminho de apagamento
  -- silencioso ao lado da anulacao.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_ausencias_ajustes'
       AND column_name = 'deleted_at'
  ) THEN
    RAISE EXCEPTION
      'pessoas_ausencias_ajustes ganhou uma coluna deleted_at. Um ajuste nao se apaga, anula-se com motivo.';
  END IF;

  RAISE NOTICE 'Conferido: pessoas_ausencias_ajustes append-only, escrita fechada, chefia fora.';
END;
$conferir$;
