-- ==============================================================================
-- pessoas_documentos_modelos -- modelos de documento (corpo HTML + variaveis).
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Emitir um contrato ou uma adenda precisa de um texto-base reutilizavel, com
-- variaveis a preencher por pessoa (nome, retribuicao, data). Sem um modelo
-- gravado, cada emissao seria texto solto sem forma consistente.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Tabela por ORGANIZACAO (nao satelite de pessoa: um modelo nao pertence a
-- ninguem em concreto). SELECT com hr.pessoas.documentos.modelos.view,
-- INSERT/UPDATE com .modelos.edit, DELETE bloqueado (RESTRICTIVE false) --
-- um modelo em uso por documentos emitidos nao se apaga, desactiva-se
-- (activo=false).
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nao ha versionamento de modelo (se o texto muda, os documentos ja
--   emitidos com o texto anterior nao sao afectados -- corpo_html e copiado
--   para pessoas_documentos no momento da emissao, nao referenciado por FK).
-- - Nao se semeia nenhum modelo por omissao nesta migracao.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TABLE IF EXISTS public.pessoas_documentos_modelos;
-- So depois de 20261123030000 ser revertida (pessoas_documentos referencia
-- esta tabela).
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org
--   20261123010000  catalogo hr.pessoas.documentos.*
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

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.documentos.modelos.view') THEN
    RAISE EXCEPTION 'hr.pessoas.documentos.modelos.view nao esta no catalogo. Aplicar 20261123010000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.documentos.modelos.edit') THEN
    RAISE EXCEPTION 'hr.pessoas.documentos.modelos.edit nao esta no catalogo. Aplicar 20261123010000 primeiro.';
  END IF;

  IF to_regclass('public.anew_organizations') IS NULL THEN
    RAISE EXCEPTION 'public.anew_organizations nao existe.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- pessoas_documentos_modelos
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_documentos_modelos (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,

  nome            text NOT NULL,
  tipo            text NOT NULL,
  corpo_html      text NOT NULL,
  variaveis       jsonb NOT NULL DEFAULT '[]'::jsonb,
  activo          boolean NOT NULL DEFAULT true,

  deleted_at      timestamptz,
  deleted_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,

  CONSTRAINT pessoas_documentos_modelos_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_documentos_modelos_org_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE CASCADE,
  CONSTRAINT pessoas_documentos_modelos_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_documentos_modelos_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_documentos_modelos_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_documentos_modelos_tipo_valido CHECK (
    tipo IN ('contrato','adenda','declaracao','recibo','outro')
  )
);

COMMENT ON TABLE public.pessoas_documentos_modelos IS
'Modelos de documento por organizacao: corpo HTML com variaveis a preencher na emissao. Nao versionado -- corpo_html e COPIADO para pessoas_documentos no momento da emissao, por isso alterar o modelo nao muda documentos ja emitidos.';
COMMENT ON COLUMN public.pessoas_documentos_modelos.variaveis IS
'Lista JSON dos nomes de variavel que o corpo_html espera (ex.: ["nome_completo","retribuicao_valor"]). Documentacao para quem emite, nao validada pela base.';

CREATE INDEX IF NOT EXISTS idx_pessoas_documentos_modelos_organization_id
  ON public.pessoas_documentos_modelos (organization_id);

DROP TRIGGER IF EXISTS trg_pessoas_documentos_modelos_updated_at ON public.pessoas_documentos_modelos;
CREATE TRIGGER trg_pessoas_documentos_modelos_updated_at
  BEFORE UPDATE ON public.pessoas_documentos_modelos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- REVOKE ALL a authenticated ANTES do GRANT, e nao so a anon: os privilegios
-- por omissao do Supabase deixam DELETE, TRUNCATE, REFERENCES e TRIGGER em
-- cima, e TRUNCATE NAO passa por RLS. Sem isto, um utilizador autenticado de
-- qualquer organizacao apagava os modelos de TODAS -- e a politica que bloqueia
-- o DELETE nao o travava. E o mesmo erro que 20261121260000 existe para
-- corrigir nas outras tabelas de RH.
REVOKE ALL ON TABLE public.pessoas_documentos_modelos FROM anon;
REVOKE ALL ON TABLE public.pessoas_documentos_modelos FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pessoas_documentos_modelos TO authenticated;
GRANT ALL ON TABLE public.pessoas_documentos_modelos TO service_role;

ALTER TABLE public.pessoas_documentos_modelos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_documentos_modelos_select ON public.pessoas_documentos_modelos;
CREATE POLICY pessoas_documentos_modelos_select ON public.pessoas_documentos_modelos
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.documentos.modelos.view', organization_id))
  );

DROP POLICY IF EXISTS pessoas_documentos_modelos_insert ON public.pessoas_documentos_modelos;
CREATE POLICY pessoas_documentos_modelos_insert ON public.pessoas_documentos_modelos
  FOR INSERT TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.documentos.modelos.edit', organization_id))
  );

DROP POLICY IF EXISTS pessoas_documentos_modelos_update ON public.pessoas_documentos_modelos;
CREATE POLICY pessoas_documentos_modelos_update ON public.pessoas_documentos_modelos
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.documentos.modelos.edit', organization_id)))
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.documentos.modelos.edit', organization_id)));

DROP POLICY IF EXISTS pessoas_documentos_modelos_block_delete ON public.pessoas_documentos_modelos;
CREATE POLICY pessoas_documentos_modelos_block_delete ON public.pessoas_documentos_modelos
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_documentos_modelos_block_delete ON public.pessoas_documentos_modelos IS
'Um modelo ja usado para emitir documentos nao se apaga: desactiva-se (activo=false, ou deleted_at por UPDATE). Apagar um modelo apagaria a explicacao de como um documento antigo foi gerado.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_politicas    integer;
  v_privilegios  text;
BEGIN
  SELECT count(*) INTO v_politicas
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_documentos_modelos';

  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'pessoas_documentos_modelos ficou com % politicas, esperavam-se 4.', v_politicas;
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.pessoas_documentos_modelos'::regclass) THEN
    RAISE EXCEPTION 'RLS nao esta activo em pessoas_documentos_modelos.';
  END IF;

  -- Os GRANTS tambem se conferem. Contar politicas nao apanha um TRUNCATE em
  -- excesso, porque TRUNCATE nao passa por RLS -- e foi exactamente isso que
  -- esta tabela tinha antes da revisao.
  SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) INTO v_privilegios
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'pessoas_documentos_modelos'
     AND grantee = 'authenticated';

  IF v_privilegios IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN
    RAISE EXCEPTION
      'pessoas_documentos_modelos: authenticated tem "%", esperava-se exactamente INSERT,SELECT,UPDATE. DELETE ou TRUNCATE a mais aqui apagam modelos de todas as organizacoes.',
      coalesce(v_privilegios, '(nenhum)');
  END IF;

  RAISE NOTICE 'Guardas passadas: pessoas_documentos_modelos criada com RLS, 4 politicas e grants exactos.';
END;
$conferir$;
