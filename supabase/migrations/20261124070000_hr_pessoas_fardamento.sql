-- ==============================================================================
-- pessoas_fardamento -- tamanhos de farda (tabela nova), atras das permissoes
-- laborais que ja existem. NENHUMA permissao nova.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Quem encomenda fardas (armazem, operacoes) precisa de ler tamanhos e nao
-- deve precisar de hr.pessoas.pessoais.view, que devolve data de nascimento,
-- estado civil, dependentes e retencao de IRS. Uma coluna em
-- pessoas_dados_pessoais tornava o tamanho do blazer so acessivel a quem ja
-- ve esses dados pessoais. E a UNICA razao que justifica seis colunas numa
-- tabela propria -- e uma razao de acesso, nao de arrumacao.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Tabela 1:1, FK composta (pessoa_id, organization_id) -> pessoas, mesmo
-- padrao dos satelites de RH: trigger de updated_at, trigger de ancora
-- imutavel (hr_satelite_ancora_imutavel, de 20261120040000), quatro politicas.
--
-- Permissoes: as que JA EXISTEM -- hr.pessoas.laborais.view / .edit. Nenhum
-- codigo novo no catalogo.
--
-- Tres pares de tamanho + detalhe (cima, baixo, blazer), cada tamanho
-- restrito a um CHECK fechado; o detalhe e texto livre, sem CHECK cruzado com
-- 'outro' -- e o ecra que so mostra o campo quando o tamanho e 'outro', pela
-- mesma razao que pessoas_dados_pessoais nao cruza dependentes_deficientes
-- com dependentes (um CHECK cruzado rejeitaria o registo mais obvio, um
-- rascunho a meio).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- DROP TABLE IF EXISTS public.pessoas_fardamento;
--
--
-- Prerequisitos:
--   20261120030000  pessoas (pessoas_id_org_key)
--   20261120020000  catalogo hr.* (hr.pessoas.laborais.view / .edit)
--   20261120040000  hr_satelite_ancora_imutavel(), update_updated_at_column()
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
    WHERE n.nspname = 'public' AND p.proname = 'hr_satelite_ancora_imutavel'
  ) THEN
    RAISE EXCEPTION 'public.hr_satelite_ancora_imutavel() nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.laborais.view') THEN
    RAISE EXCEPTION 'hr.pessoas.laborais.view nao existe no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.laborais.edit') THEN
    RAISE EXCEPTION 'hr.pessoas.laborais.edit nao existe no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- pessoas_fardamento
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_fardamento (
  id                    uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id             uuid NOT NULL,
  organization_id       uuid NOT NULL,

  tamanho_cima          text,
  tamanho_cima_detalhe  text,
  tamanho_baixo         text,
  tamanho_baixo_detalhe text,
  tamanho_blazer        text,
  tamanho_blazer_detalhe text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid,
  updated_by            uuid,

  CONSTRAINT pessoas_fardamento_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_fardamento_pessoa_org_unica UNIQUE (pessoa_id, organization_id),
  CONSTRAINT pessoas_fardamento_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT pessoas_fardamento_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_fardamento_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_fardamento_tamanho_cima_valido
    CHECK (tamanho_cima IS NULL OR tamanho_cima IN ('xs','s','m','l','xl','xxl','outro')),
  CONSTRAINT pessoas_fardamento_tamanho_baixo_valido
    CHECK (tamanho_baixo IS NULL OR tamanho_baixo IN ('xs','s','m','l','xl','xxl','outro')),
  CONSTRAINT pessoas_fardamento_tamanho_blazer_valido
    CHECK (tamanho_blazer IS NULL OR tamanho_blazer IN ('xs','s','m','l','xl','xxl','outro'))
);

COMMENT ON TABLE public.pessoas_fardamento IS
'Tamanhos de farda (1:1 com a pessoa), em tabela propria -- nao em pessoas_dados_pessoais -- para que quem encomenda fardas leia tamanhos sob hr.pessoas.laborais.view/edit (as MESMAS permissoes ja usadas para cargo e local_trabalho) sem precisar de hr.pessoas.pessoais.view, que devolve data de nascimento, estado civil, dependentes e retencao de IRS. NENHUMA permissao nova. DELETE bloqueado por politica restritiva: a farda que deixou de servir corrige-se para NULL.';
COMMENT ON COLUMN public.pessoas_fardamento.tamanho_cima_detalhe IS
'Texto livre, mostrado pela interface so quando tamanho_cima = ''outro''. Sem CHECK cruzado: um rascunho pode ter o detalhe preenchido antes do tamanho, como em pessoas_dados_pessoais.';

CREATE INDEX IF NOT EXISTS idx_pessoas_fardamento_pessoa_id
  ON public.pessoas_fardamento (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_fardamento_organization_id
  ON public.pessoas_fardamento (organization_id);

DROP TRIGGER IF EXISTS trg_pessoas_fardamento_updated_at ON public.pessoas_fardamento;
CREATE TRIGGER trg_pessoas_fardamento_updated_at
  BEFORE UPDATE ON public.pessoas_fardamento
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pessoas_fardamento_ancora ON public.pessoas_fardamento;
CREATE TRIGGER trg_pessoas_fardamento_ancora
  BEFORE UPDATE ON public.pessoas_fardamento
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

-- ---- Grants e RLS ------------------------------------------------------------
REVOKE ALL ON TABLE public.pessoas_fardamento FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pessoas_fardamento TO authenticated;
GRANT ALL ON TABLE public.pessoas_fardamento TO service_role;

ALTER TABLE public.pessoas_fardamento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_fardamento_select ON public.pessoas_fardamento;
CREATE POLICY pessoas_fardamento_select ON public.pessoas_fardamento
  FOR SELECT TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.laborais.view', organization_id)));

DROP POLICY IF EXISTS pessoas_fardamento_insert ON public.pessoas_fardamento;
CREATE POLICY pessoas_fardamento_insert ON public.pessoas_fardamento
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.laborais.edit', organization_id)));

DROP POLICY IF EXISTS pessoas_fardamento_update ON public.pessoas_fardamento;
CREATE POLICY pessoas_fardamento_update ON public.pessoas_fardamento
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.laborais.edit', organization_id)))
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.laborais.edit', organization_id)));

DROP POLICY IF EXISTS pessoas_fardamento_block_delete ON public.pessoas_fardamento;
CREATE POLICY pessoas_fardamento_block_delete ON public.pessoas_fardamento
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls boolean;
  v_politicas integer;
BEGIN
  SELECT c.relrowsecurity INTO v_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'pessoas_fardamento';

  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'public.pessoas_fardamento ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_politicas FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'pessoas_fardamento';

  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas em pessoas_fardamento, encontraram-se %.', v_politicas;
  END IF;

  RAISE NOTICE 'OK: pessoas_fardamento criada, RLS activo, 4 politicas, sob permissoes laborais ja existentes -- nenhuma permissao nova.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- So cria objecto novo; nenhuma tabela, politica ou permissao existente e
-- alterada -- sem janela de estado defeituoso na base partilhada.
-- ==============================================================================
