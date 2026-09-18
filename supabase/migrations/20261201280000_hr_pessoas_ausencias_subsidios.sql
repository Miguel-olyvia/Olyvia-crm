-- ==============================================================================
-- pessoas_ausencias_subsidios: o subsidio de ferias, SEPARADO do banco de dias.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- O subsidio de ferias e dinheiro, e o direito a ferias e dias. Sao duas contas
-- com regras diferentes que hoje nao existem em sitio nenhum da base: o valor
-- vive numa folha de calculo e entra no processamento a mao.
--
-- A tentacao e por montante_devido em pessoas_ausencias_direitos, ao lado de
-- dias_direito. Nao se faz, por tres razoes que nao sao de estilo:
--
--   1. O subsidio PAGA-SE, e um pagamento tem data, e pode ser parcial. Um
--      direito de dias nao tem nada disso -- ganharia quatro colunas que estao
--      NULL em todas as linhas que nao sao de ferias.
--   2. O regime de pagamento (por inteiro ou em duodecimos) e uma escolha que
--      se faz UMA VEZ e se congela. Guardado no direito, seria lido ao vivo e
--      mudava retroactivamente o que ja foi pago.
--   3. Um direito de dias pode nao ter subsidio nenhum, e um subsidio nunca
--      existe sem o direito de que deriva. Isso e uma relacao, nao uma coluna.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Uma linha = o subsidio que resulta de UM direito. A ligacao e uma FK COMPOSTA
-- de tres colunas (direito_id, pessoa_id, organization_id) -- nao uma FK simples
-- a id -- porque uma FK simples deixaria um subsidio dizer que resulta do
-- direito de OUTRA pessoa da mesma organizacao. E o mesmo erro que
-- pessoas_ausencias_direitos ja tinha fechado no vinculo_id.
--
-- ON DELETE RESTRICT e nao CASCADE, e e deliberado: apagar um direito com um
-- subsidio PAGO pendurado apagaria o rasto de um pagamento feito. O direito ja
-- e "nao se apaga, marca-se deleted_at" (ver a politica de DELETE de
-- 20261121030000); o RESTRICT e a segunda fechadura, para o caminho de
-- service_role que nao passa por RLS nenhuma.
--
-- regime_pagamento e um SNAPSHOT, nao uma leitura. Grava-se o regime que
-- vigorava quando o subsidio foi calculado, e nunca mais se vai buscar o actual.
-- Mudar a organizacao de "por inteiro" para "duodecimos" em Junho nao pode
-- reescrever o que se pagou em Maio.
--
-- montante_pago comeca a 0 e sobe. O CHECK (montante_pago <= montante_devido)
-- impede pagar mais do que se deve, que e o erro que nao se ve num mapa mensal.
--
-- lancamento_id liga ao lancamento de processamento que efectivamente pagou
-- (hr_processamento_lancamentos). E OPCIONAL: ha subsidios calculados que ainda
-- nao foram a processamento nenhum, e ha historico importado que nunca vai ter
-- lancamento. FK SIMPLES, porque hr_processamento_lancamentos NAO tem uma
-- UNIQUE (id, organization_id) -- nao ha alvo para uma FK composta. Essa lacuna
-- fecha-se com um trigger proprio, hr_ausencias_subsidio_lancamento_coerente(),
-- que recusa um lancamento de outra pessoa ou de outra organizacao. Um comentario
-- a dizer "tem cuidado" nao teria fechado nada.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - NAO se calcula o montante. base_calculo e montante_devido entram por quem
--   os calcula; a formula depende da retribuicao e de decisoes de produto que
--   nao estao tomadas. A tabela guarda o resultado, nao a conta.
-- - Nao ha RPC de pagamento nesta ronda. montante_pago sobe por UPDATE, sob a
--   permissao de edicao. Quando houver um caminho unico de pagamento, e ele que
--   passa a escrever.
-- - Nao se escreve em hr_processamento_lancamentos, nem se lhe altera nada.
-- - O ramo de ficha-propria existe na LEITURA e nao na escrita: ninguem define
--   o proprio subsidio. Mesmo criterio do direito de dias.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TABLE public.pessoas_ausencias_subsidios;
--   DROP FUNCTION public.hr_ausencias_subsidio_lancamento_coerente();
--
--
-- Prerequisitos:
--   20261121030000  pessoas_ausencias_direitos (unique id, pessoa_id, organization_id)
--   20261121050000  hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid)
--   20261120090000  hr_pessoa_do_utilizador(uuid, uuid)
--   20261120040000  hr_satelite_ancora_imutavel()
--   20261201230000  hr_processamento_lancamentos
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_ausencias_subsidios') IS NOT NULL THEN
    RAISE NOTICE 'Ja aplicada: public.pessoas_ausencias_subsidios ja existe. A migracao segue por ser idempotente.';
  END IF;

  IF to_regclass('public.pessoas_ausencias_direitos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_direitos nao existe. Aplicar 20261121030000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_ausencias_direitos_id_pessoa_org_key'
       AND conrelid = to_regclass('public.pessoas_ausencias_direitos')
  ) THEN
    RAISE EXCEPTION
      'A unique pessoas_ausencias_direitos_id_pessoa_org_key nao existe; a FK COMPOSTA de direito_id depende dela. Sem ela, um subsidio poderia dizer que resulta do direito de OUTRA pessoa.';
  END IF;

  IF to_regclass('public.hr_processamento_lancamentos') IS NULL THEN
    RAISE EXCEPTION 'public.hr_processamento_lancamentos nao existe. Aplicar 20261201230000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_pessoa_na_minha_cadeia' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION
      'hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid) nao existe. Aplicar 20261121050000 primeiro -- sem ela a politica nasceria sem o ramo de chefia.';
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
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.ausencias.direitos.edit') THEN
    RAISE EXCEPTION 'hr.ausencias.direitos.edit nao esta no catalogo. Aplicar 20261121010000 primeiro.';
  END IF;
END;
$guardas$;

-- ---- A tabela --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pessoas_ausencias_subsidios (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id        uuid NOT NULL,
  organization_id  uuid NOT NULL,

  direito_id       uuid NOT NULL,

  base_calculo     numeric(12,2) NOT NULL,
  montante_devido  numeric(12,2) NOT NULL,
  montante_pago    numeric(12,2) NOT NULL DEFAULT 0,

  -- SNAPSHOT do regime, nao leitura ao vivo. Ver o cabecalho.
  regime_pagamento text NOT NULL,

  proporcional     boolean NOT NULL DEFAULT false,
  pago_em          date,

  -- FK SIMPLES por falta de alvo composto; a coerencia pessoa/organizacao e
  -- garantida pelo trigger hr_ausencias_subsidio_lancamento_coerente().
  lancamento_id    uuid,

  notas            text,

  deleted_at       timestamptz,
  deleted_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  updated_by       uuid,

  CONSTRAINT pessoas_ausencias_subsidios_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_ausencias_subsidios_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT pessoas_ausencias_subsidios_id_pessoa_org_key UNIQUE (id, pessoa_id, organization_id),

  -- Ancora COMPOSTA a pessoa: sem organization_id na chave, o satelite podia
  -- pender de uma pessoa de outra organizacao.
  CONSTRAINT pessoas_ausencias_subsidios_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,

  -- COMPOSTA de tres colunas, e RESTRICT: apagar um direito com um subsidio
  -- pago pendurado apagaria o rasto de um pagamento feito.
  CONSTRAINT pessoas_ausencias_subsidios_direito_fkey
    FOREIGN KEY (direito_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_ausencias_direitos (id, pessoa_id, organization_id)
    ON DELETE RESTRICT,

  CONSTRAINT pessoas_ausencias_subsidios_lancamento_fkey
    FOREIGN KEY (lancamento_id)
    REFERENCES public.hr_processamento_lancamentos (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_ausencias_subsidios_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_ausencias_subsidios_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_ausencias_subsidios_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_ausencias_subsidios_regime_valido
    CHECK (regime_pagamento IN ('normal','duodecimos')),

  CONSTRAINT pessoas_ausencias_subsidios_base_nao_negativa
    CHECK (base_calculo >= 0),
  CONSTRAINT pessoas_ausencias_subsidios_devido_nao_negativo
    CHECK (montante_devido >= 0),
  CONSTRAINT pessoas_ausencias_subsidios_pago_nao_negativo
    CHECK (montante_pago >= 0),

  -- O erro que nao se ve num mapa mensal: pagar mais do que se deve.
  CONSTRAINT pessoas_ausencias_subsidios_pago_nao_excede_devido
    CHECK (montante_pago <= montante_devido)
);

-- Um direito nao tem dois subsidios vivos: seriam dois montantes devidos pela
-- mesma coisa, e a vista de 20261201320000 teria de escolher um sem criterio.
-- Parcial em deleted_at IS NULL para que um subsidio corrigido possa ser
-- substituido.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pessoas_ausencias_subsidios_direito
  ON public.pessoas_ausencias_subsidios (direito_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_subsidios_pessoa
  ON public.pessoas_ausencias_subsidios (pessoa_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_subsidios_org
  ON public.pessoas_ausencias_subsidios (organization_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_subsidios_lancamento
  ON public.pessoas_ausencias_subsidios (lancamento_id);

COMMENT ON TABLE public.pessoas_ausencias_subsidios IS
'O subsidio de ferias que resulta de um direito. SEPARADO de pessoas_ausencias_direitos de proposito: um pagamento tem data e pode ser parcial, o regime de pagamento congela-se no momento do calculo, e ha direitos sem subsidio nenhum. Tres coisas que, postas em colunas do direito, ficariam NULL em todas as linhas que nao sao de ferias e seriam lidas ao vivo quando tem de ser snapshot.

NAO se calcula aqui o montante: base_calculo e montante_devido entram por quem os calcula. A tabela guarda o resultado, nao a conta.

ON DELETE RESTRICT no direito: apagar um direito com um subsidio pago pendurado apagaria o rasto de um pagamento feito.';

COMMENT ON COLUMN public.pessoas_ausencias_subsidios.regime_pagamento IS
'SNAPSHOT do regime que vigorava quando o subsidio foi calculado -- nunca se vai buscar o actual. Mudar a organizacao para duodecimos em Junho nao pode reescrever o que se pagou em Maio.';

COMMENT ON COLUMN public.pessoas_ausencias_subsidios.lancamento_id IS
'O lancamento de processamento que pagou, quando ja houve um. OPCIONAL: ha subsidios calculados ainda por processar e historico importado que nunca vai ter lancamento.

FK SIMPLES porque hr_processamento_lancamentos nao tem UNIQUE (id, organization_id) e nao ha alvo para uma composta. A coerencia de pessoa e organizacao e imposta pelo trigger hr_ausencias_subsidio_lancamento_coerente().';

COMMENT ON CONSTRAINT pessoas_ausencias_subsidios_direito_fkey ON public.pessoas_ausencias_subsidios IS
'FK COMPOSTA de tres colunas. Uma FK simples deixaria um subsidio dizer que resulta do direito de OUTRA pessoa da mesma organizacao -- o mesmo erro que vinculo_id ja tinha fechado em pessoas_ausencias_direitos.';

-- ---- Coerencia do lancamento -----------------------------------------------
-- A metade que a FK simples nao consegue impor.
CREATE OR REPLACE FUNCTION public.hr_ausencias_subsidio_lancamento_coerente()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pessoa uuid;
  v_org    uuid;
BEGIN
  IF NEW.lancamento_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT l.pessoa_id, l.organization_id INTO v_pessoa, v_org
    FROM public.hr_processamento_lancamentos l
   WHERE l.id = NEW.lancamento_id;

  -- A FK ja garante que existe; isto e defesa contra a ordem dos triggers.
  IF v_pessoa IS NULL THEN
    RAISE EXCEPTION
      'subsidio_lancamento_inexistente: o lancamento % nao existe.', NEW.lancamento_id
      USING ERRCODE = '23503';
  END IF;

  IF v_org <> NEW.organization_id OR v_pessoa <> NEW.pessoa_id THEN
    RAISE EXCEPTION
      'subsidio_lancamento_de_outra_pessoa: o lancamento % e da pessoa % da organizacao %, e este subsidio e da pessoa % da organizacao %. Um subsidio nao se liga ao pagamento de outra pessoa.',
      NEW.lancamento_id, v_pessoa, v_org, NEW.pessoa_id, NEW.organization_id
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_ausencias_subsidio_lancamento_coerente() IS
'Recusa um subsidio ligado a um lancamento de processamento de OUTRA pessoa ou de OUTRA organizacao. Existe porque hr_processamento_lancamentos nao tem UNIQUE (id, organization_id) e por isso nao ha alvo para a FK composta que fecharia isto ao nivel da constraint.

SECURITY DEFINER: sob RLS de invocador, quem tem hr.ausencias.direitos.edit sem ver o processamento nao leria a linha do lancamento e a verificacao passaria vazia -- que e precisamente o defeito por omissao.';

DROP TRIGGER IF EXISTS trg_pessoas_ausencias_subsidios_lancamento ON public.pessoas_ausencias_subsidios;
CREATE TRIGGER trg_pessoas_ausencias_subsidios_lancamento
  BEFORE INSERT OR UPDATE ON public.pessoas_ausencias_subsidios
  FOR EACH ROW EXECUTE FUNCTION public.hr_ausencias_subsidio_lancamento_coerente();

-- ---- Triggers de padrao ----------------------------------------------------
DROP TRIGGER IF EXISTS trg_pessoas_ausencias_subsidios_updated_at ON public.pessoas_ausencias_subsidios;
CREATE TRIGGER trg_pessoas_ausencias_subsidios_updated_at
  BEFORE UPDATE ON public.pessoas_ausencias_subsidios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pessoas_ausencias_subsidios_ancora ON public.pessoas_ausencias_subsidios;
CREATE TRIGGER trg_pessoas_ausencias_subsidios_ancora
  BEFORE UPDATE ON public.pessoas_ausencias_subsidios
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

-- ---- Grants ----------------------------------------------------------------
REVOKE ALL ON TABLE public.pessoas_ausencias_subsidios FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pessoas_ausencias_subsidios TO authenticated;
GRANT ALL ON TABLE public.pessoas_ausencias_subsidios TO service_role;

-- ---- RLS -------------------------------------------------------------------
ALTER TABLE public.pessoas_ausencias_subsidios ENABLE ROW LEVEL SECURITY;

-- Os TRES ramos de leitura, escritos de uma vez: ao contrario de
-- 20261121030000, a funcao de cadeia de chefia ja existe quando esta migracao
-- corre, e por isso nao ha politica a completar depois.
DROP POLICY IF EXISTS pessoas_ausencias_subsidios_select ON public.pessoas_ausencias_subsidios;
CREATE POLICY pessoas_ausencias_subsidios_select ON public.pessoas_ausencias_subsidios
  FOR SELECT TO authenticated
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

-- SEM ramo de ficha-propria na escrita: ninguem define o proprio subsidio.
DROP POLICY IF EXISTS pessoas_ausencias_subsidios_insert ON public.pessoas_ausencias_subsidios;
CREATE POLICY pessoas_ausencias_subsidios_insert ON public.pessoas_ausencias_subsidios
  FOR INSERT TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.direitos.edit', organization_id))
  );

DROP POLICY IF EXISTS pessoas_ausencias_subsidios_update ON public.pessoas_ausencias_subsidios;
CREATE POLICY pessoas_ausencias_subsidios_update ON public.pessoas_ausencias_subsidios
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.direitos.edit', organization_id)))
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.direitos.edit', organization_id)));

DROP POLICY IF EXISTS pessoas_ausencias_subsidios_block_delete ON public.pessoas_ausencias_subsidios;
CREATE POLICY pessoas_ausencias_subsidios_block_delete ON public.pessoas_ausencias_subsidios
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_ausencias_subsidios_select ON public.pessoas_ausencias_subsidios IS
'Os mesmos tres ramos de pessoas_ausencias_direitos: hr.ausencias.direitos.view na organizacao; a propria ficha (hr.ausencias.view.own + a conta ligada a pessoa); e a chefia sobre a sua cadeia. Que o trabalhador veja quanto lhe e devido de subsidio e deliberado -- e a base de poder contestar o valor.';

COMMENT ON POLICY pessoas_ausencias_subsidios_block_delete ON public.pessoas_ausencias_subsidios IS
'Nao se apaga um subsidio: ha pagamentos feitos imputados a ele. Marca-se deleted_at.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls        boolean;
  v_politicas  integer;
  v_bloqueado  boolean;
  v_org_id     uuid;
  v_pessoa_id  uuid;
  v_outra_p    uuid;
  v_tipo_id    uuid;
  v_direito    uuid;
  v_direito_2  uuid;
  v_sub        uuid;
BEGIN
  IF to_regclass('public.pessoas_ausencias_subsidios') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_subsidios nao ficou criada.';
  END IF;

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'pessoas_ausencias_subsidios';

  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_subsidios ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_politicas FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_subsidios';

  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas em pessoas_ausencias_subsidios, encontraram-se %.', v_politicas;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_subsidios'
       AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) LIKE '%get_user_visible_org_ids%'
  ) THEN
    RAISE EXCEPTION 'Alguma politica usa get_user_visible_org_ids. Em RH isso nunca acontece.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_subsidios'
       AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~ 'has_anew_permission\([^_]'
  ) THEN
    RAISE EXCEPTION 'Alguma politica usa has_anew_permission (global) em vez de has_anew_permission_in_org.';
  END IF;

  -- A leitura ganhar ambito nao quer dizer que a escrita o tenha: o UPDATE tem
  -- de ter USING **e** WITH CHECK escritos, senao a tabela parece fechada na
  -- leitura e esta aberta na escrita.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_subsidios'
       AND policyname = 'pessoas_ausencias_subsidios_update'
       AND (qual IS NULL OR with_check IS NULL)
  ) THEN
    RAISE EXCEPTION 'A politica de UPDATE nao tem USING e WITH CHECK ambos escritos.';
  END IF;

  -- Os tres ramos do SELECT, cada um pelo seu sinal.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_subsidios'
       AND policyname = 'pessoas_ausencias_subsidios_select'
       AND coalesce(qual,'') LIKE '%hr_pessoa_do_utilizador%'
       AND coalesce(qual,'') LIKE '%hr_ausencias_pessoa_na_minha_cadeia%'
  ) THEN
    RAISE EXCEPTION
      'A politica de SELECT ficou sem o ramo de ficha-propria ou sem o de chefia. Ao contrario de 20261121030000, aqui os tres ramos nascem de uma vez.';
  END IF;

  -- As escritas NAO podem ter ganho um ramo de ficha-propria.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_subsidios'
       AND policyname IN ('pessoas_ausencias_subsidios_insert','pessoas_ausencias_subsidios_update')
       AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) LIKE '%hr_pessoa_do_utilizador%'
  ) THEN
    RAISE EXCEPTION
      'Uma politica de escrita ganhou o ramo de ficha-propria. Ninguem define o proprio subsidio.';
  END IF;

  -- A FK do direito tem de ser COMPOSTA de 3 colunas e RESTRICT.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_ausencias_subsidios_direito_fkey'
       AND conrelid = to_regclass('public.pessoas_ausencias_subsidios')
       AND cardinality(conkey) = 3
       AND confdeltype = 'r'
  ) THEN
    RAISE EXCEPTION
      'pessoas_ausencias_subsidios_direito_fkey nao e a FK composta de 3 colunas com ON DELETE RESTRICT. CASCADE aqui apagaria o rasto de um pagamento feito.';
  END IF;

  IF has_table_privilege('anon', 'public.pessoas_ausencias_subsidios', 'SELECT') THEN
    RAISE EXCEPTION 'anon consegue ler pessoas_ausencias_subsidios. O REVOKE nao pegou.';
  END IF;

  -- ---- Exercicio vivo, revertido por ROLLBACK da subtransaccao.
  BEGIN
    INSERT INTO public.anew_organizations (name)
    VALUES ('__conferir_20261201280000__') RETURNING id INTO v_org_id;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_id, 'Conferir', 'Subsidio') RETURNING id INTO v_pessoa_id;
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_id, 'Outra', 'Pessoa') RETURNING id INTO v_outra_p;

    INSERT INTO public.hr_ausencias_tipos (organization_id, codigo, nome, categoria)
    VALUES (v_org_id, 'FER', 'Ferias', 'ferias') RETURNING id INTO v_tipo_id;

    INSERT INTO public.pessoas_ausencias_direitos
      (pessoa_id, organization_id, tipo_id, periodo_inicio, periodo_fim, dias_direito)
    VALUES
      (v_pessoa_id, v_org_id, v_tipo_id, DATE '2026-01-01', DATE '2026-12-31', 22)
    RETURNING id INTO v_direito;

    -- Direito 2: da MESMA pessoa A, sem subsidio nenhum pendurado. Existe so
    -- para o Caso 4: usar v_direito (que ja tem o subsidio do Caso 1) la
    -- faria o indice unico por direito disparar primeiro, mascarando o que a
    -- FK composta faz. Periodo diferente para nao colidir com o UNIQUE
    -- parcial (pessoa_id, tipo_id, periodo_inicio) de pessoas_ausencias_direitos.
    INSERT INTO public.pessoas_ausencias_direitos
      (pessoa_id, organization_id, tipo_id, periodo_inicio, periodo_fim, dias_direito)
    VALUES
      (v_pessoa_id, v_org_id, v_tipo_id, DATE '2027-01-01', DATE '2027-12-31', 22)
    RETURNING id INTO v_direito_2;

    -- Caso 1: o caminho normal entra.
    INSERT INTO public.pessoas_ausencias_subsidios
      (pessoa_id, organization_id, direito_id, base_calculo, montante_devido, regime_pagamento)
    VALUES
      (v_pessoa_id, v_org_id, v_direito, 1200.00, 1200.00, 'normal')
    RETURNING id INTO v_sub;

    -- Caso 2: pagar MAIS do que se deve tem de ser recusado.
    v_bloqueado := false;
    BEGIN
      UPDATE public.pessoas_ausencias_subsidios
         SET montante_pago = 1500.00 WHERE id = v_sub;
      RAISE EXCEPTION 'pessoas_ausencias_subsidios aceitou um montante pago superior ao devido.';
    EXCEPTION
      WHEN check_violation THEN v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O CHECK de pago<=devido nao disparou como esperado (caso 2).';
    END IF;

    -- Caso 3: um segundo subsidio VIVO para o mesmo direito tem de ser
    -- recusado -- seriam dois montantes devidos pela mesma coisa.
    v_bloqueado := false;
    BEGIN
      INSERT INTO public.pessoas_ausencias_subsidios
        (pessoa_id, organization_id, direito_id, base_calculo, montante_devido, regime_pagamento)
      VALUES
        (v_pessoa_id, v_org_id, v_direito, 900.00, 900.00, 'duodecimos');
      RAISE EXCEPTION 'pessoas_ausencias_subsidios aceitou dois subsidios vivos para o mesmo direito.';
    EXCEPTION
      WHEN unique_violation THEN v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O indice unico por direito nao disparou como esperado (caso 3).';
    END IF;

    -- Caso 4: o subsidio de UMA pessoa nao pode apontar ao direito de OUTRA.
    -- E o caso que uma FK simples a id teria deixado passar. Usa v_direito_2
    -- (sem subsidio nenhum vivo) e nao v_direito -- se usasse v_direito, o
    -- indice unico por direito (Caso 3) dispararia primeiro e o teste passaria
    -- pela razao errada, sem provar nada sobre a FK composta.
    v_bloqueado := false;
    BEGIN
      INSERT INTO public.pessoas_ausencias_subsidios
        (pessoa_id, organization_id, direito_id, base_calculo, montante_devido, regime_pagamento)
      VALUES
        (v_outra_p, v_org_id, v_direito_2, 900.00, 900.00, 'normal');
      RAISE EXCEPTION
        'pessoas_ausencias_subsidios aceitou um subsidio da pessoa B ligado ao direito da pessoa A -- a FK composta nao esta a fazer o seu trabalho.';
    EXCEPTION
      WHEN foreign_key_violation THEN v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'A FK composta do direito nao disparou como esperado (caso 4).';
    END IF;

    -- Caso 5: um regime fora do catalogo tem de ser recusado. Faz-se por UPDATE
    -- da linha que ja existe, para que a UNICA coisa que pode falhar seja o
    -- CHECK do regime -- um INSERT novo apanharia primeiro a FK ou o indice
    -- unico, e o teste passaria sem provar nada sobre o regime.
    v_bloqueado := false;
    BEGIN
      UPDATE public.pessoas_ausencias_subsidios
         SET regime_pagamento = 'mensal' WHERE id = v_sub;
      RAISE EXCEPTION 'pessoas_ausencias_subsidios aceitou um regime_pagamento fora do catalogo.';
    EXCEPTION
      WHEN check_violation THEN v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O CHECK do regime nao disparou como esperado (caso 5).';
    END IF;

    -- Caso 6: apagar o DIREITO com um subsidio pendurado tem de ser recusado
    -- pelo RESTRICT -- e o rasto do pagamento que se esta a proteger.
    v_bloqueado := false;
    BEGIN
      DELETE FROM public.pessoas_ausencias_direitos WHERE id = v_direito;
      RAISE EXCEPTION 'pessoas_ausencias_direitos deixou apagar um direito com subsidio pendurado -- o RESTRICT nao pegou.';
    EXCEPTION
      WHEN foreign_key_violation THEN v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O ON DELETE RESTRICT do direito nao disparou como esperado (caso 6).';
    END IF;

    RAISE EXCEPTION 'conferir_20261201280000_ok' USING ERRCODE = 'CF011';
  EXCEPTION
    WHEN SQLSTATE 'CF011' THEN
      RAISE NOTICE 'OK: pessoas_ausencias_subsidios aceita o caminho normal e recusa pago>devido, dois subsidios no mesmo direito, subsidio ligado ao direito de outra pessoa, regime fora do catalogo, e o apagar do direito -- exercitado com dados descartaveis revertidos por ROLLBACK.';
    WHEN OTHERS THEN
      RAISE;
  END;

  RAISE NOTICE 'Conferido: pessoas_ausencias_subsidios com RLS, 4 politicas, os tres ramos de leitura e as FKs compostas.';
END;
$conferir$;
