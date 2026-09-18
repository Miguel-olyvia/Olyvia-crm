-- ==============================================================================
-- pessoas_documentos_clausulas -- biblioteca de clausulas reutilizaveis, por
-- organizacao, para colar dentro do corpo de um modelo de documento de RH.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Periodo experimental, confidencialidade, isencao de horario, RGPD,
-- propriedade intelectual -- o mesmo paragrafo repete-se em vinte modelos.
-- Sem persistencia, "adicionar uma clausula" e so escrever texto -- coisa que
-- o RichTextEditor ja faz hoje. O valor esta na REUTILIZACAO.
--
--
-- -- A REGRA NOVA: INSERCAO POR COPIA, NUNCA POR REFERENCIA --------------------
--
-- Inserir uma clausula num modelo COPIA o corpo_html da clausula para dentro
-- do corpo_html do modelo, no editor, no cliente. Nao ha FK entre um modelo e
-- as clausulas usadas para o compor, nao ha ordem persistida, nao ha
-- composicao em tempo de emissao. E o MESMO PADRAO que pessoas_documentos_modelos
-- ja segue para pessoas_documentos: corpo_html e copiado de proposito, para
-- que mexer na fonte nao mexa em quem ja a usou. Aqui e so um nivel acima:
-- editar uma clausula depois de colada nao muda os modelos onde ja foi colada
-- -- custo assumido, nao descuido. A UI diz isto numa linha.
--
-- Uma clausula PODE conter variaveis ({{pessoa_nome_completo}}, etc.): como a
-- substituicao de variaveis corre sobre o corpo do MODELO ja montado (ver
-- 20261202020000), uma variavel dentro de uma clausula colada funciona sem
-- codigo extra nenhum.
--
--
-- -- PERMISSOES: REUTILIZADAS, NENHUMA NOVA ------------------------------------
--
-- Quem edita modelos edita clausulas -- nao ha caso de negocio para separar as
-- duas, e cada permissao nova e mais uma para atribuir ao super_admin e
-- esquecer. RLS espelha exactamente hr.pessoas.documentos.modelos.view/.edit.
--
--
-- -- NUNCA SE APAGA -- SO SE (DES)ACTIVA ---------------------------------------
--
-- Mesma razao de pessoas_documentos_modelos: uma clausula pode ja estar colada
-- dentro de modelos e de documentos emitidos (como texto simples, sem
-- referencia). RESTRICTIVE bloqueia DELETE; o ecra so mostra activar/desactivar.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TABLE IF EXISTS public.pessoas_documentos_clausulas;
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org
--   20261123010000  catalogo hr.pessoas.documentos.* (modelos.view/.edit)
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

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    RAISE EXCEPTION 'public.update_updated_at_column() nao existe.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- pessoas_documentos_clausulas
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_documentos_clausulas (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,

  nome            text NOT NULL,
  categoria       text,
  corpo_html      text NOT NULL,
  activo          boolean NOT NULL DEFAULT true,

  deleted_at      timestamptz,
  deleted_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_by      uuid,

  CONSTRAINT pessoas_documentos_clausulas_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_documentos_clausulas_org_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE CASCADE,
  CONSTRAINT pessoas_documentos_clausulas_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_documentos_clausulas_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_documentos_clausulas_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_documentos_clausulas_nome_nao_vazio CHECK (btrim(nome) <> ''),
  CONSTRAINT pessoas_documentos_clausulas_corpo_nao_vazio CHECK (btrim(corpo_html) <> '')
);

COMMENT ON TABLE public.pessoas_documentos_clausulas IS
'Biblioteca de clausulas reutilizaveis por organizacao (periodo experimental, confidencialidade, RGPD, etc.). Inserir uma clausula num modelo COPIA corpo_html para dentro do corpo do modelo -- sem FK, sem lista ordenada. Editar uma clausula depois de colada NAO altera os modelos onde ja foi colada, de proposito, no mesmo espirito de pessoas_documentos_modelos.corpo_html copiado para pessoas_documentos.';
COMMENT ON COLUMN public.pessoas_documentos_clausulas.categoria IS
'Texto livre para agrupar no popover de insercao (ex.: "periodo experimental", "confidencialidade"). Sem dominio fechado -- e so agrupamento visual, nao regra de negocio.';
COMMENT ON COLUMN public.pessoas_documentos_clausulas.corpo_html IS
'HTML a colar dentro do corpo de um modelo. Pode conter tokens {{...}} do catalogo de variaveis de RH -- resolvidos como qualquer outro token do corpo do modelo, porque a substituicao corre sobre o corpo JA montado (ver hr_documento_variaveis_catalogo em 20261202020000).';

CREATE INDEX IF NOT EXISTS idx_pessoas_documentos_clausulas_organization_id
  ON public.pessoas_documentos_clausulas (organization_id);

DROP TRIGGER IF EXISTS trg_pessoas_documentos_clausulas_updated_at ON public.pessoas_documentos_clausulas;
CREATE TRIGGER trg_pessoas_documentos_clausulas_updated_at
  BEFORE UPDATE ON public.pessoas_documentos_clausulas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- REVOKE ALL a authenticated ANTES do GRANT, e nao so a anon -- TRUNCATE nao
-- passa por RLS. Mesma armadilha documentada em 20261123020000.
REVOKE ALL ON TABLE public.pessoas_documentos_clausulas FROM anon;
REVOKE ALL ON TABLE public.pessoas_documentos_clausulas FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pessoas_documentos_clausulas TO authenticated;
GRANT ALL ON TABLE public.pessoas_documentos_clausulas TO service_role;

ALTER TABLE public.pessoas_documentos_clausulas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_documentos_clausulas_select ON public.pessoas_documentos_clausulas;
CREATE POLICY pessoas_documentos_clausulas_select ON public.pessoas_documentos_clausulas
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.documentos.modelos.view', organization_id))
  );

DROP POLICY IF EXISTS pessoas_documentos_clausulas_insert ON public.pessoas_documentos_clausulas;
CREATE POLICY pessoas_documentos_clausulas_insert ON public.pessoas_documentos_clausulas
  FOR INSERT TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.documentos.modelos.edit', organization_id))
  );

DROP POLICY IF EXISTS pessoas_documentos_clausulas_update ON public.pessoas_documentos_clausulas;
CREATE POLICY pessoas_documentos_clausulas_update ON public.pessoas_documentos_clausulas
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.documentos.modelos.edit', organization_id)))
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.documentos.modelos.edit', organization_id)));

DROP POLICY IF EXISTS pessoas_documentos_clausulas_block_delete ON public.pessoas_documentos_clausulas;
CREATE POLICY pessoas_documentos_clausulas_block_delete ON public.pessoas_documentos_clausulas
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_documentos_clausulas_block_delete ON public.pessoas_documentos_clausulas IS
'Uma clausula ja pode estar colada dentro de modelos existentes (como texto simples, sem referencia): apagar a linha nao apaga esse texto, so perde a explicacao de onde veio. Desactiva-se (activo=false), nao se apaga.';

-- ---- Conferir ---------------------------------------------------------------
DO $conferir$
DECLARE
  v_politicas    integer;
  v_privilegios  text;
BEGIN
  SELECT count(*) INTO v_politicas
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_documentos_clausulas';

  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'pessoas_documentos_clausulas ficou com % politicas, esperavam-se 4.', v_politicas;
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.pessoas_documentos_clausulas'::regclass) THEN
    RAISE EXCEPTION 'RLS nao esta activo em pessoas_documentos_clausulas.';
  END IF;

  SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) INTO v_privilegios
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'pessoas_documentos_clausulas'
     AND grantee = 'authenticated';

  IF v_privilegios IS DISTINCT FROM 'INSERT,SELECT,UPDATE' THEN
    RAISE EXCEPTION
      'pessoas_documentos_clausulas: authenticated tem "%", esperava-se exactamente INSERT,SELECT,UPDATE. DELETE ou TRUNCATE a mais aqui apagam clausulas de todas as organizacoes.',
      coalesce(v_privilegios, '(nenhum)');
  END IF;

  RAISE NOTICE 'Guardas passadas: pessoas_documentos_clausulas criada com RLS, 4 politicas e grants exactos.';
END;
$conferir$;
