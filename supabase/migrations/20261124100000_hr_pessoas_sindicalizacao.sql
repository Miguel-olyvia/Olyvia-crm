-- ==============================================================================
-- pessoas_sindicalizacao -- filiacao sindical (art. 9.o RGPD), tabela propria,
-- copiando o regime ja usado para pessoas_dados_saude. NAO o regime do NISS.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Filiacao sindical e dado de categoria especial e nao tem forma mascarada --
-- "os ultimos 4 caracteres do sindicato" nao significa nada; e tudo ou nada,
-- como a incapacidade. Por isso segue pessoas_dados_saude (tabela propria,
-- permissoes proprias is_dangerous, auditoria por trigger em
-- pessoas_acessos_sensiveis) e NAO pessoas_identificacao (grants por coluna):
-- esse regime obriga, para sempre, a lembrar de conceder cada coluna futura, e
-- ja ha armadilha dessas que chegue numa tabela so.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Tabela 1:1, FK composta -> pessoas, mesmo padrao dos satelites: trigger de
-- updated_at, trigger de ancora imutavel, quatro politicas (SELECT
-- hr.pessoas.sindicalizacao.view, INSERT/UPDATE hr.pessoas.sindicalizacao.edit,
-- DELETE restritiva false), auditoria por trigger AFTER INSERT OR UPDATE que
-- chama hr_registar_acesso_sensivel(..., 'sindicalizacao', 'alterar') -- copia
-- de hr_saude_auditar().
--
-- SEM clausula de ficha-propria (nao entra em hr.pessoas.view.own): mesma
-- decisao ja tomada para pessoas_dados_saude.
--
-- quota_percentagem numeric(5,2), NULL nesta ronda -- a quota e retida no
-- salario; preparada, sem calculo.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nunca aparece no formulario de criacao de pessoa (fora do ambito desta
--   migracao, que e so base de dados).
-- - Nenhuma permissao e atribuida a papel nenhum.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- DROP TABLE IF EXISTS public.pessoas_sindicalizacao;
-- DROP FUNCTION IF EXISTS public.hr_sindicalizacao_auditar();
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org
--   20261120040000  hr_satelite_ancora_imutavel(), pessoas_acessos_sensiveis,
--                   hr_registar_acesso_sensivel()
--   20261124010000  catalogo: hr.pessoas.sindicalizacao.view / .edit
--   20261124020000  pessoas_acessos_sensiveis aceita campo='sindicalizacao'
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas nao existe. Aplicar 20261120030000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pessoas_id_org_key' AND conrelid = 'public.pessoas'::regclass
  ) THEN
    RAISE EXCEPTION 'A unique pessoas_id_org_key nao existe; a FK composta desta tabela depende dela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_registar_acesso_sensivel' AND p.pronargs = 4
  ) THEN
    RAISE EXCEPTION 'public.hr_registar_acesso_sensivel(uuid,uuid,text,text) nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_satelite_ancora_imutavel'
  ) THEN
    RAISE EXCEPTION 'public.hr_satelite_ancora_imutavel() nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.anew_permissions
    WHERE code = 'hr.pessoas.sindicalizacao.view' AND is_dangerous
  ) THEN
    RAISE EXCEPTION 'hr.pessoas.sindicalizacao.view nao existe ou nao esta marcada is_dangerous. Aplicar 20261124010000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.anew_permissions
    WHERE code = 'hr.pessoas.sindicalizacao.edit' AND is_dangerous
  ) THEN
    RAISE EXCEPTION 'hr.pessoas.sindicalizacao.edit nao existe ou nao esta marcada is_dangerous. Aplicar 20261124010000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pessoas_acessos_sensiveis_campo_valido'
      AND conrelid = 'public.pessoas_acessos_sensiveis'::regclass
      AND pg_get_constraintdef(oid) LIKE '%sindicalizacao%'
  ) THEN
    RAISE EXCEPTION 'O CHECK de campo em pessoas_acessos_sensiveis nao aceita "sindicalizacao". Aplicar 20261124020000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- pessoas_sindicalizacao
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_sindicalizacao (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id           uuid NOT NULL,
  organization_id     uuid NOT NULL,

  sindicalizado       boolean,
  sindicato           text,
  quota_percentagem   numeric(5,2),

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid,
  updated_by          uuid,

  CONSTRAINT pessoas_sindicalizacao_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_sindicalizacao_pessoa_org_unica UNIQUE (pessoa_id, organization_id),
  CONSTRAINT pessoas_sindicalizacao_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT pessoas_sindicalizacao_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_sindicalizacao_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_sindicalizacao_quota_valida
    CHECK (quota_percentagem IS NULL OR (quota_percentagem >= 0 AND quota_percentagem <= 100))
);

COMMENT ON TABLE public.pessoas_sindicalizacao IS
'Filiacao sindical (1:1 com a pessoa). Dado de categoria especial, art. 9.o do RGPD -- sem forma mascarada possivel, ao contrario do NISS. Copia o regime de pessoas_dados_saude (tabela propria, permissoes is_dangerous, auditoria por trigger) e NAO o de pessoas_identificacao (grants por coluna): esse regime obrigaria a lembrar, para sempre, de conceder cada coluna futura. SEM clausula de ficha-propria: mesma decisao de pessoas_dados_saude. NENHUM trigger escreve o historico geral de alteracoes (pessoas_dados_alteracoes) a partir desta tabela -- o rasto dela e so pessoas_acessos_sensiveis, atras de hr.pessoas.acessos_sensiveis.view.';
COMMENT ON COLUMN public.pessoas_sindicalizacao.quota_percentagem IS
'Preparada para quando a quota vier a ser retida no salario. NULL nesta ronda -- sem calculo associado.';

CREATE INDEX IF NOT EXISTS idx_pessoas_sindicalizacao_pessoa_id
  ON public.pessoas_sindicalizacao (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_sindicalizacao_organization_id
  ON public.pessoas_sindicalizacao (organization_id);

DROP TRIGGER IF EXISTS trg_pessoas_sindicalizacao_updated_at ON public.pessoas_sindicalizacao;
CREATE TRIGGER trg_pessoas_sindicalizacao_updated_at
  BEFORE UPDATE ON public.pessoas_sindicalizacao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pessoas_sindicalizacao_ancora ON public.pessoas_sindicalizacao;
CREATE TRIGGER trg_pessoas_sindicalizacao_ancora
  BEFORE UPDATE ON public.pessoas_sindicalizacao
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

-- ---- Auditoria ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_sindicalizacao_auditar()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.hr_registar_acesso_sensivel(
    NEW.pessoa_id, NEW.organization_id, 'sindicalizacao', 'alterar'
  );
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.hr_sindicalizacao_auditar() IS
'Copia de hr_saude_auditar(): regista em pessoas_acessos_sensiveis cada criacao ou alteracao de filiacao sindical. SECURITY DEFINER porque hr_registar_acesso_sensivel nao e chamavel por authenticated.';

DROP TRIGGER IF EXISTS trg_pessoas_sindicalizacao_auditar ON public.pessoas_sindicalizacao;
CREATE TRIGGER trg_pessoas_sindicalizacao_auditar
  AFTER INSERT OR UPDATE ON public.pessoas_sindicalizacao
  FOR EACH ROW EXECUTE FUNCTION public.hr_sindicalizacao_auditar();

-- ---- Grants e RLS --------------------------------------------------------------
REVOKE ALL ON TABLE public.pessoas_sindicalizacao FROM anon;
REVOKE ALL ON TABLE public.pessoas_sindicalizacao FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pessoas_sindicalizacao TO authenticated;
GRANT ALL ON TABLE public.pessoas_sindicalizacao TO service_role;

ALTER TABLE public.pessoas_sindicalizacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_sindicalizacao_select ON public.pessoas_sindicalizacao;
CREATE POLICY pessoas_sindicalizacao_select ON public.pessoas_sindicalizacao
  FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.sindicalizacao.view', organization_id)));

DROP POLICY IF EXISTS pessoas_sindicalizacao_insert ON public.pessoas_sindicalizacao;
CREATE POLICY pessoas_sindicalizacao_insert ON public.pessoas_sindicalizacao
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.sindicalizacao.edit', organization_id)));

DROP POLICY IF EXISTS pessoas_sindicalizacao_update ON public.pessoas_sindicalizacao;
CREATE POLICY pessoas_sindicalizacao_update ON public.pessoas_sindicalizacao
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.sindicalizacao.edit', organization_id)))
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.sindicalizacao.edit', organization_id)));

DROP POLICY IF EXISTS pessoas_sindicalizacao_block_delete ON public.pessoas_sindicalizacao;
CREATE POLICY pessoas_sindicalizacao_block_delete ON public.pessoas_sindicalizacao
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_sindicalizacao_select ON public.pessoas_sindicalizacao IS
'Ve filiacao sindical quem tem hr.pessoas.sindicalizacao.view NAQUELA organizacao -- permissao is_dangerous, nao atribuida a papel nenhum por omissao. hr.pessoas.view (a de ver a lista de colegas) NAO da acesso a esta tabela.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls boolean;
  v_politicas integer;
BEGIN
  SELECT c.relrowsecurity INTO v_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'pessoas_sindicalizacao';

  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'public.pessoas_sindicalizacao ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_politicas FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'pessoas_sindicalizacao';

  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas em pessoas_sindicalizacao, encontraram-se %.', v_politicas;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.pessoas_sindicalizacao'::regclass
      AND tgname = 'trg_pessoas_sindicalizacao_auditar'
  ) THEN
    RAISE EXCEPTION 'O trigger de auditoria de sindicalizacao nao ficou criado.';
  END IF;

  -- Nenhuma politica de sindicalizacao pode usar hr.pessoas.view nem
  -- hr.pessoas.view.own: e um dado que nao acompanha a ficha-propria nem a
  -- permissao mais basica do modulo.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pessoas_sindicalizacao'
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%''hr.pessoas.view''%'
  ) THEN
    RAISE EXCEPTION 'Uma politica de pessoas_sindicalizacao usa hr.pessoas.view em vez de hr.pessoas.sindicalizacao.*. Quem so ve a lista de colegas leria filiacao sindical.';
  END IF;

  RAISE NOTICE 'OK: pessoas_sindicalizacao criada, RLS activo, 4 politicas, auditoria por trigger em pessoas_acessos_sensiveis, permissoes perigosas por atribuir.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. So cria objectos novos; nenhuma tabela, politica ou funcao existente e
--    alterada -- sem janela de estado defeituoso na base partilhada.
-- 2. Depois de aplicada, ninguem ve esta tabela: as duas permissoes existem
--    no catalogo e nao estao atribuidas a papel nenhum.
-- ==============================================================================
