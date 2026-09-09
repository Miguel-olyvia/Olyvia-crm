-- ==============================================================================
-- pessoas_ausencias_direitos: quantos dias cada pessoa tem direito, por
-- periodo e por tipo.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Sem uma linha de direito, um contador de ferias nao tem numerador: sabe-se
-- quantos dias foram gozados e nao se sabe quantos havia. Hoje esse numero nao
-- existe em sitio nenhum da base -- vive numa folha de calculo.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Uma linha = o direito de UMA pessoa, a UM tipo, num PERIODO. O periodo e um
-- PAR DE DATAS (periodo_inicio, periodo_fim) e nao um "ano smallint", por tres
-- razoes concretas: ha admissoes a meio do ano (direito proporcional a partir
-- de Marco), ha periodos de ferias que nao coincidem com o ano civil, e ha
-- cessacoes que fecham o periodo antes de Dezembro. Um "ano" obrigaria a
-- inventar convencoes para os tres casos.
--
-- dias_direito e numeric(6,2): permite 0,25 e 0,5, que e o que a marcacao de
-- meio dia exige. minutos_direito viaja ao lado, opcional, para os tipos
-- apresentados em horas -- nao e a unidade de conta.
--
-- origem (legal / contrato / manual / importacao) diz DE ONDE veio o numero.
-- Nao ha calculo automatico nesta ronda: a acumulacao mensal proporcional a
-- admissao exige decisoes de produto que nao estao tomadas, e por isso o
-- direito entra por linha, a mao ou por importacao. origem='legal' e uma
-- etiqueta de quem o pos, nao a marca de um calculo que a base fez.
--
-- vinculo_id liga o direito ao contrato de que resulta, quando ha. E uma FK
-- COMPOSTA (vinculo_id, pessoa_id, organization_id) declarada NESTA tabela --
-- nao altera pessoas_vinculos -- e composta porque uma FK simples deixaria um
-- direito dizer que resulta do contrato de OUTRA pessoa da mesma organizacao.
-- ON DELETE SET NULL: apagar um contrato nao apaga o direito que dele resultou.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Acumulacao automatica (accrual mensal), subsidio de ferias, e qualquer
--   ligacao a pessoas_retribuicoes. Nada disso se constroi nesta ronda.
-- - Ajustes ao contador NAO se fazem aqui por UPDATE: sao linhas em
--   pessoas_ausencias_ajustes (20261121040000), append-only, com autor e
--   motivo. Um UPDATE a dias_direito apaga a historia de porque mudou.
-- - Nao se escreve em pessoas_vinculos nem em pessoas_retribuicoes.
-- - O ramo de ficha-propria existe na LEITURA e nao na escrita: ninguem define
--   o proprio direito a ferias.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TABLE public.pessoas_ausencias_direitos;
--
--
-- Prerequisitos:
--   20261120030000  pessoas (unique pessoas_id_org_key)
--   20261120060000  pessoas_vinculos (unique pessoas_vinculos_id_pessoa_org_key)
--   20261120040000  hr_satelite_ancora_imutavel()
--   20261120090000  hr_pessoa_do_utilizador(uuid, uuid)
--   20261121010000  hr.ausencias.direitos.view / .edit no catalogo
--   20261121020000  hr_ausencias_tipos (unique hr_ausencias_tipos_id_org_key)
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
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_ausencias_tipos_id_org_key'
       AND conrelid = to_regclass('public.hr_ausencias_tipos')
  ) THEN
    RAISE EXCEPTION 'A unique hr_ausencias_tipos_id_org_key nao existe; a FK composta de tipo_id depende dela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_id_pessoa_org_key'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    RAISE EXCEPTION
      'A unique pessoas_vinculos_id_pessoa_org_key nao existe; a FK COMPOSTA de vinculo_id depende dela. Sem ela, um direito poderia dizer que resulta do contrato de OUTRA pessoa.';
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

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_satelite_ancora_imutavel'
  ) THEN
    RAISE EXCEPTION 'hr_satelite_ancora_imutavel() nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.ausencias.direitos.view') THEN
    RAISE EXCEPTION 'hr.ausencias.direitos.view nao esta no catalogo. Aplicar 20261121010000 primeiro.';
  END IF;
END;
$guardas$;

-- ---- A tabela --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pessoas_ausencias_direitos (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id       uuid NOT NULL,
  organization_id uuid NOT NULL,

  tipo_id         uuid NOT NULL,
  vinculo_id      uuid,

  periodo_inicio  date NOT NULL,
  periodo_fim     date NOT NULL,

  dias_direito    numeric(6,2) NOT NULL,
  minutos_direito integer,

  origem          text NOT NULL DEFAULT 'manual',
  notas           text,

  deleted_at      timestamptz,
  deleted_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,

  CONSTRAINT pessoas_ausencias_direitos_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_ausencias_direitos_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT pessoas_ausencias_direitos_id_pessoa_org_key UNIQUE (id, pessoa_id, organization_id),

  -- Ancora COMPOSTA: sem organization_id na chave, um satelite podia pender de
  -- uma pessoa de outra organizacao.
  CONSTRAINT pessoas_ausencias_direitos_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,

  CONSTRAINT pessoas_ausencias_direitos_tipo_fkey
    FOREIGN KEY (tipo_id, organization_id)
    REFERENCES public.hr_ausencias_tipos (id, organization_id) ON DELETE NO ACTION,

  -- FK declarada NESTA tabela; nao altera pessoas_vinculos. Composta de tres
  -- colunas para que o direito nao possa apontar ao contrato de outra pessoa.
  CONSTRAINT pessoas_ausencias_direitos_vinculo_fkey
    FOREIGN KEY (vinculo_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_vinculos (id, pessoa_id, organization_id)
    ON DELETE SET NULL (vinculo_id),

  CONSTRAINT pessoas_ausencias_direitos_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_ausencias_direitos_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_ausencias_direitos_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_ausencias_direitos_dias_nao_negativos
    CHECK (dias_direito >= 0),
  CONSTRAINT pessoas_ausencias_direitos_minutos_nao_negativos
    CHECK (minutos_direito IS NULL OR minutos_direito >= 0),
  CONSTRAINT pessoas_ausencias_direitos_periodo_valido
    CHECK (periodo_fim > periodo_inicio),
  CONSTRAINT pessoas_ausencias_direitos_origem_valida
    CHECK (origem IN ('legal','contrato','manual','importacao'))
);

-- UNIQUE PARCIAL: uma pessoa nao tem dois direitos vivos ao mesmo tipo com o
-- mesmo inicio de periodo -- seriam dois numeradores para o mesmo contador, e
-- a funcao de saldo teria de escolher um deles sem criterio. Parcial em
-- deleted_at IS NULL para que um direito corrigido possa ser substituido.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pessoas_ausencias_direitos_pessoa_tipo_periodo
  ON public.pessoas_ausencias_direitos (pessoa_id, tipo_id, periodo_inicio)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_direitos_pessoa
  ON public.pessoas_ausencias_direitos (pessoa_id, periodo_inicio)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_direitos_org_periodo
  ON public.pessoas_ausencias_direitos (organization_id, periodo_inicio)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.pessoas_ausencias_direitos IS
'O direito de uma pessoa a um tipo de ausencia, num periodo. E o numerador do contador de saldo: sem esta linha sabe-se o que foi gozado e nao se sabe de quanto.

PERIODO E UM PAR DE DATAS e nao um "ano": ha admissoes a meio do ano, periodos de ferias que nao coincidem com o civil, e cessacoes que fecham o periodo antes de Dezembro.

Ajustes ao contador NAO se fazem por UPDATE a dias_direito -- sao linhas em pessoas_ausencias_ajustes, com autor e motivo. Um UPDATE aqui apaga a historia de porque o numero mudou.

NAO ha acumulacao automatica: o direito entra por linha, a mao ou por importacao. origem=legal e a etiqueta de quem o pos, nao a marca de um calculo da base.';

COMMENT ON COLUMN public.pessoas_ausencias_direitos.dias_direito IS
'numeric(6,2), a unidade canonica do modulo. Permite 0,25 e 0,5 para a marcacao de meio dia.';

COMMENT ON COLUMN public.pessoas_ausencias_direitos.minutos_direito IS
'Opcional, para os tipos apresentados em horas. NAO e a unidade de conta: o saldo e a guarda legal sao sempre em dias.';

COMMENT ON CONSTRAINT pessoas_ausencias_direitos_vinculo_fkey ON public.pessoas_ausencias_direitos IS
'FK COMPOSTA de tres colunas, declarada nesta tabela. Uma FK simples deixaria um direito dizer que resulta do contrato de OUTRA pessoa da mesma organizacao. SET NULL: apagar o contrato nao apaga o direito que dele resultou.';

-- ---- Triggers de padrao ----------------------------------------------------
DROP TRIGGER IF EXISTS trg_pessoas_ausencias_direitos_updated_at ON public.pessoas_ausencias_direitos;
CREATE TRIGGER trg_pessoas_ausencias_direitos_updated_at
  BEFORE UPDATE ON public.pessoas_ausencias_direitos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pessoas_ausencias_direitos_ancora ON public.pessoas_ausencias_direitos;
CREATE TRIGGER trg_pessoas_ausencias_direitos_ancora
  BEFORE UPDATE ON public.pessoas_ausencias_direitos
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

-- ---- Grants ----------------------------------------------------------------
REVOKE ALL ON TABLE public.pessoas_ausencias_direitos FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pessoas_ausencias_direitos TO authenticated;
GRANT ALL ON TABLE public.pessoas_ausencias_direitos TO service_role;

-- ---- RLS -------------------------------------------------------------------
ALTER TABLE public.pessoas_ausencias_direitos ENABLE ROW LEVEL SECURITY;

-- Tres ramos de leitura. O da chefia usa a funcao de 20261121050000, que ainda
-- nao existe quando esta migracao corre -- e por isso a politica de SELECT e
-- COMPLETADA em 20261121050000, com ALTER POLICY. Aqui ficam os dois ramos que
-- nao dependem dela: nenhuma politica nasce mais larga do que devia.
DROP POLICY IF EXISTS pessoas_ausencias_direitos_select ON public.pessoas_ausencias_direitos;
CREATE POLICY pessoas_ausencias_direitos_select ON public.pessoas_ausencias_direitos
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.direitos.view', organization_id))
      OR (
        (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.view.own', organization_id))
        AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
      )
    )
  );

-- SEM ramo de ficha-propria na escrita: ninguem define o proprio direito a
-- ferias. Ver a propria ficha nao da para a editar.
DROP POLICY IF EXISTS pessoas_ausencias_direitos_insert ON public.pessoas_ausencias_direitos;
CREATE POLICY pessoas_ausencias_direitos_insert ON public.pessoas_ausencias_direitos
  FOR INSERT TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.direitos.edit', organization_id))
  );

DROP POLICY IF EXISTS pessoas_ausencias_direitos_update ON public.pessoas_ausencias_direitos;
CREATE POLICY pessoas_ausencias_direitos_update ON public.pessoas_ausencias_direitos
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.direitos.edit', organization_id)))
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.direitos.edit', organization_id)));

DROP POLICY IF EXISTS pessoas_ausencias_direitos_block_delete ON public.pessoas_ausencias_direitos;
CREATE POLICY pessoas_ausencias_direitos_block_delete ON public.pessoas_ausencias_direitos
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_ausencias_direitos_select ON public.pessoas_ausencias_direitos IS
'Tres ramos: quem tem hr.ausencias.direitos.view naquela organizacao; cada um o seu (hr.ausencias.view.own + a conta ligada a pessoa); e a chefia sobre a sua cadeia -- este terceiro ramo e ACRESCENTADO em 20261121050000, quando a funcao de cadeia existir. Que o trabalhador veja o seu direito e deliberado: e a base de poder contestar o contador.';

COMMENT ON POLICY pessoas_ausencias_direitos_block_delete ON public.pessoas_ausencias_direitos IS
'Nao se apaga um direito: ha pedidos aprovados imputados ao periodo dele. Marca-se deleted_at.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls       boolean;
  v_politicas integer;
BEGIN
  IF to_regclass('public.pessoas_ausencias_direitos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_direitos nao ficou criada.';
  END IF;

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'pessoas_ausencias_direitos';

  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_direitos ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_politicas FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_direitos';

  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas em pessoas_ausencias_direitos, encontraram-se %.', v_politicas;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_direitos'
       AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) LIKE '%get_user_visible_org_ids%'
  ) THEN
    RAISE EXCEPTION 'Alguma politica usa get_user_visible_org_ids. Em RH isso nunca acontece.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_direitos'
       AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~ 'has_anew_permission\([^_]'
  ) THEN
    RAISE EXCEPTION 'Alguma politica usa has_anew_permission (global) em vez de has_anew_permission_in_org.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_direitos'
       AND policyname = 'pessoas_ausencias_direitos_update'
       AND (qual IS NULL OR with_check IS NULL)
  ) THEN
    RAISE EXCEPTION 'A politica de UPDATE nao tem USING e WITH CHECK ambos escritos.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_direitos'
       AND policyname = 'pessoas_ausencias_direitos_select'
       AND coalesce(qual,'') LIKE '%hr_pessoa_do_utilizador%'
  ) THEN
    RAISE EXCEPTION
      'A politica de SELECT nao tem o ramo de ficha-propria. O trabalhador nao veria o seu direito e nao podia contestar o contador.';
  END IF;

  -- A FK do vinculo tem de ser COMPOSTA de 3 colunas.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_ausencias_direitos_vinculo_fkey'
       AND conrelid = to_regclass('public.pessoas_ausencias_direitos')
       AND cardinality(conkey) = 3
  ) THEN
    RAISE EXCEPTION
      'pessoas_ausencias_direitos_vinculo_fkey nao e a FK composta de 3 colunas esperada.';
  END IF;

  -- A do tipo tem de ser composta de 2.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_ausencias_direitos_tipo_fkey'
       AND conrelid = to_regclass('public.pessoas_ausencias_direitos')
       AND cardinality(conkey) = 2
  ) THEN
    RAISE EXCEPTION
      'pessoas_ausencias_direitos_tipo_fkey nao e a FK composta (tipo_id, organization_id). Uma FK simples deixaria usar o tipo de outra organizacao.';
  END IF;

  RAISE NOTICE 'Conferido: pessoas_ausencias_direitos com RLS, 4 politicas e as FKs compostas.';
END;
$conferir$;
