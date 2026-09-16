-- ==============================================================================
-- hr_regras_subsidio_alimentacao -- a REGRA de elegibilidade do subsidio de
-- alimentacao, por organizacao.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Pergunta do utilizador, verbatim: "o subsidio de alimentacao onde e que tu
-- metes o valor?? porque depende, logo tem isso tambem... isso tambem vai
-- mexer com a assiduidade, porque se alguem faltou, esse dia nao lhe e
-- pago, e como e que isso e calculado, quando alguem trabalha 5 horas quer
-- seja com hora extra ou nao no dia, nesse dia tem direito ao subsidio."
--
-- `pessoas_retribuicoes.subsidio_alimentacao` (20261120060000) JA guarda um
-- VALOR -- mas por PESSOA, sem regra nenhuma de quando se aplica. Falta a
-- regra da EMPRESA: qual e o valor por omissao, como se paga (dinheiro ou
-- cartao) e quantos minutos trabalhados num dia ja dao direito.
--
--
-- -- A REGRA NOVA, E A DISTINCAO QUE NAO SE PODE PERDER --------------------------
--
-- hr_regras_subsidio_alimentacao guarda, por organizacao (uma linha so, UNIQUE
-- em organization_id), a REGRA POR OMISSAO da empresa: valor_diario, modo,
-- minutos_minimos_dia. `pessoas_retribuicoes.subsidio_alimentacao` continua a
-- ser a EXCEPCAO por pessoa (ex.: alguem com um valor negociado diferente do
-- da empresa) -- os dois sitios NAO SE FUNDEM nesta migracao, e o comentario
-- da coluna correspondente di-lo explicitamente para nao se confundirem no
-- futuro.
--
-- minutos_minimos_dia: quantos minutos trabalhados nesse dia ja dao direito
-- ao subsidio desse dia. O utilizador deu "5 horas, com ou sem hora extra,
-- ja da direito" SO COMO EXEMPLO de que o minimo e baixo -- nao se fixa um
-- valor. Por omissao = 1 (qualquer minuto trabalhado ja conta), configuravel
-- por organizacao. NENHUM CALCULO CONTRA A ASSIDUIDADE NESTA MIGRACAO -- o
-- utilizador confirmou que este e so o primeiro passo (catalogo/config); a
-- ligacao real a assiduidade (que dias contam, que dias de falta descontam)
-- fica para depois.
--
-- modo reaproveita os MESMOS dois valores de
-- pessoas_retribuicoes.subsidio_alimentacao_modo ('dinheiro'/'cartao',
-- 20261120060000) -- NAO se cria enum nem tipo novo, so o mesmo texto e o
-- mesmo CHECK.
--
--
-- -- SEM CONCEITO DE "TRANSVERSAL" AQUI, AO CONTRARIO DOS CODIGOS ---------------
--
-- hr_codigos_processamento (20261201190000) tem organization_id NULLavel
-- porque HA codigos partilhados por todo o grupo. O subsidio de alimentacao
-- NAO: cada empresa tem SEMPRE a sua PROPRIA regra (o valor por omissao de
-- uma empresa nao serve para outra). organization_id e por isso NOT NULL e
-- UNIQUE, nunca NULL.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TABLE IF EXISTS public.hr_regras_subsidio_alimentacao;
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org
--   20261120060000  pessoas_retribuicoes.subsidio_alimentacao_modo (os valores 'dinheiro'/'cartao')
--   20261201180000  catalogo hr.vencimento.subsidio.view/.gerir
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'public.has_anew_permission_in_org(uuid,text,uuid) nao existe. Aplicar 20261120010000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.vencimento.subsidio.view') THEN
    RAISE EXCEPTION 'hr.vencimento.subsidio.view nao esta no catalogo. Aplicar 20261201180000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.vencimento.subsidio.gerir') THEN
    RAISE EXCEPTION 'hr.vencimento.subsidio.gerir nao esta no catalogo. Aplicar 20261201180000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_retribuicoes'
       AND column_name = 'subsidio_alimentacao_modo'
  ) THEN
    RAISE EXCEPTION 'pessoas_retribuicoes.subsidio_alimentacao_modo nao existe -- o pressuposto de que ''dinheiro''/''cartao'' ja e o vocabulario usado mudou. Investigar antes de aplicar.';
  END IF;

  IF to_regclass('public.hr_regras_subsidio_alimentacao') IS NOT NULL THEN
    RAISE EXCEPTION 'public.hr_regras_subsidio_alimentacao ja existe -- investigar antes de aplicar.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. A tabela
-- ==============================================================================
CREATE TABLE public.hr_regras_subsidio_alimentacao (
  id                   uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL,

  valor_diario         numeric(10,2) NOT NULL DEFAULT 0,
  modo                 text NOT NULL DEFAULT 'dinheiro',
  minutos_minimos_dia  integer NOT NULL DEFAULT 1,

  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid,

  CONSTRAINT hr_regras_subsidio_alimentacao_pkey PRIMARY KEY (id),
  CONSTRAINT hr_regras_subsidio_alimentacao_org_key UNIQUE (organization_id),
  CONSTRAINT hr_regras_subsidio_alimentacao_org_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE CASCADE,
  CONSTRAINT hr_regras_subsidio_alimentacao_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_regras_subsidio_alimentacao_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT hr_regras_subsidio_alimentacao_valor_nao_negativo CHECK (valor_diario >= 0),
  CONSTRAINT hr_regras_subsidio_alimentacao_minutos_positivos CHECK (minutos_minimos_dia > 0),
  -- Mesmos dois valores de pessoas_retribuicoes.subsidio_alimentacao_modo
  -- (20261120060000) -- nao se cria enum novo.
  CONSTRAINT hr_regras_subsidio_alimentacao_modo_valido CHECK (modo IN ('dinheiro', 'cartao'))
);

COMMENT ON TABLE public.hr_regras_subsidio_alimentacao IS
'A REGRA de elegibilidade do subsidio de alimentacao, uma linha por organizacao (UNIQUE em organization_id -- ao contrario de hr_codigos_processamento, aqui NAO ha conceito de "transversal": cada empresa tem sempre a sua propria regra). Distinta de pessoas_retribuicoes.subsidio_alimentacao, que e a EXCEPCAO por pessoa -- ver o comentario dessa coluna. SO CATALOGO/CONFIGURACAO nesta versao: nenhum calculo contra assiduidade ou picagens ainda.';
COMMENT ON COLUMN public.hr_regras_subsidio_alimentacao.valor_diario IS
'O valor por dia elegivel, por OMISSAO da empresa. Distinto de pessoas_retribuicoes.subsidio_alimentacao, que pode ser uma excepcao negociada por pessoa -- os dois nao se confundem.';
COMMENT ON COLUMN public.hr_regras_subsidio_alimentacao.minutos_minimos_dia IS
'Quantos minutos trabalhados num dia ja dao direito ao subsidio desse dia. Omissao = 1 (qualquer minuto trabalhado conta) -- baixo de proposito, nao um valor fixo. O exemplo do utilizador ("5 horas, com ou sem hora extra, ja da direito") e so isso, um exemplo de que o minimo e baixo; a ligacao real a assiduidade fica para uma fase seguinte.';
COMMENT ON COLUMN public.hr_regras_subsidio_alimentacao.modo IS
'''dinheiro'' ou ''cartao'' -- os MESMOS dois valores de pessoas_retribuicoes.subsidio_alimentacao_modo (20261120060000). Nao e enum: text com CHECK, para poder reaproveitar sem depender de um tipo partilhado.';

CREATE INDEX idx_hr_regras_subsidio_alimentacao_organization_id
  ON public.hr_regras_subsidio_alimentacao (organization_id);

DROP TRIGGER IF EXISTS trg_hr_regras_subsidio_alimentacao_updated_at ON public.hr_regras_subsidio_alimentacao;
CREATE TRIGGER trg_hr_regras_subsidio_alimentacao_updated_at
  BEFORE UPDATE ON public.hr_regras_subsidio_alimentacao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- REVOKE ALL a authenticated ANTES do GRANT -- mesma guarda de
-- 20261123020000 e 20261201190000: os privilegios por omissao do Supabase
-- deixam DELETE/TRUNCATE/REFERENCES/TRIGGER em cima, e TRUNCATE nao passa
-- por RLS.
REVOKE ALL ON TABLE public.hr_regras_subsidio_alimentacao FROM anon;
REVOKE ALL ON TABLE public.hr_regras_subsidio_alimentacao FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hr_regras_subsidio_alimentacao TO authenticated;
GRANT ALL ON TABLE public.hr_regras_subsidio_alimentacao TO service_role;

ALTER TABLE public.hr_regras_subsidio_alimentacao ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 2. RLS -- sempre filtrado a PROPRIA organizacao, nunca IS NULL aqui.
-- ==============================================================================
DROP POLICY IF EXISTS hr_regras_subsidio_alimentacao_select ON public.hr_regras_subsidio_alimentacao;
CREATE POLICY hr_regras_subsidio_alimentacao_select ON public.hr_regras_subsidio_alimentacao
  FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.vencimento.subsidio.view', organization_id)));

DROP POLICY IF EXISTS hr_regras_subsidio_alimentacao_insert ON public.hr_regras_subsidio_alimentacao;
CREATE POLICY hr_regras_subsidio_alimentacao_insert ON public.hr_regras_subsidio_alimentacao
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.vencimento.subsidio.gerir', organization_id)));

DROP POLICY IF EXISTS hr_regras_subsidio_alimentacao_update ON public.hr_regras_subsidio_alimentacao;
CREATE POLICY hr_regras_subsidio_alimentacao_update ON public.hr_regras_subsidio_alimentacao
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.vencimento.subsidio.gerir', organization_id)))
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.vencimento.subsidio.gerir', organization_id)));

DROP POLICY IF EXISTS hr_regras_subsidio_alimentacao_block_delete ON public.hr_regras_subsidio_alimentacao;
CREATE POLICY hr_regras_subsidio_alimentacao_block_delete ON public.hr_regras_subsidio_alimentacao
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY hr_regras_subsidio_alimentacao_block_delete ON public.hr_regras_subsidio_alimentacao IS
'Uma organizacao tem sempre uma regra -- para "desligar" o subsidio poe-se valor_diario=0, nunca se apaga a linha (um UPDATE ja repoe qualquer estado).';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_n           integer;
  v_privilegios text;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.hr_regras_subsidio_alimentacao'::regclass) THEN
    RAISE EXCEPTION 'RLS nao esta activa em hr_regras_subsidio_alimentacao.';
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'hr_regras_subsidio_alimentacao';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'hr_regras_subsidio_alimentacao ficou com % politicas, esperavam-se 4.', v_n;
  END IF;

  SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) INTO v_privilegios
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'hr_regras_subsidio_alimentacao'
     AND grantee = 'authenticated';
  IF v_privilegios IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN
    RAISE EXCEPTION
      'hr_regras_subsidio_alimentacao: authenticated tem "%", esperava-se exactamente INSERT,SELECT,UPDATE.',
      coalesce(v_privilegios, '(nenhum)');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'hr_regras_subsidio_alimentacao' AND grantee = 'anon'
  ) THEN
    RAISE EXCEPTION 'hr_regras_subsidio_alimentacao ficou com grant a anon.';
  END IF;

  -- O CHECK do modo rejeita um valor fora de 'dinheiro'/'cartao'. Testado ao
  -- vivo contra uma organizacao real (a primeira que existir), sem deixar
  -- linha nenhuma para tras.
  DECLARE
    v_org_teste uuid;
  BEGIN
    SELECT id INTO v_org_teste FROM public.anew_organizations LIMIT 1;
    IF v_org_teste IS NOT NULL THEN
      BEGIN
        INSERT INTO public.hr_regras_subsidio_alimentacao (organization_id, valor_diario, modo, minutos_minimos_dia)
        VALUES (v_org_teste, 5.00, 'transferencia', 60);
        RAISE EXCEPTION 'O CHECK constraint devia ter rejeitado modo=''transferencia''.';
      EXCEPTION
        WHEN check_violation THEN
          NULL; -- esperado
      END;
      IF EXISTS (SELECT 1 FROM public.hr_regras_subsidio_alimentacao WHERE organization_id = v_org_teste) THEN
        RAISE EXCEPTION 'Ficou uma linha de teste em hr_regras_subsidio_alimentacao -- limpar antes de continuar.';
      END IF;
    END IF;
  END;

  RAISE NOTICE 'OK: hr_regras_subsidio_alimentacao criada com RLS, 4 politicas, grants exactos, CHECK de modo validado ao vivo.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. Correr `supabase migration list --linked` e confirmar a ordem de
--    aplicacao real contra o remoto antes de empurrar.
-- 2. Sem janela de estado defeituoso: esta migracao so cria objectos novos.
-- 3. O ecra novo (React) e os hooks que leem/escrevem
--    hr_regras_subsidio_alimentacao entram no mesmo commit, fora do SQL.
-- ==============================================================================
