-- Diagnóstico de obra na necessidade (deal_needs) — campos próprios + materiais
-- informativos para o armazém.
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Why this migration exists
-- --------------------------
-- O diagnóstico da Fase 1 vivia só ao nível do orçamento (quote_diagnostic_areas,
-- 20261119140000). Na prática quem faz a visita preenche o diagnóstico contra a
-- NECESSIDADE do negócio (deal_needs), antes de existir orçamento nenhum. Estas 6
-- colunas diag_* passam a guardar esse levantamento no sítio onde ele nasce, com os
-- mesmos nomes/tipos de quote_diagnostic_areas para o mapeamento ser 1:1 e sem
-- conversões pelo meio.
--
-- deal_need_diagnostic_materials guarda a lista de materiais estimados por
-- necessidade. Regra de negócio importante (e deliberada): esta lista é APENAS
-- INFORMATIVA para o armazém — nunca cria linhas de orçamento nem mão de obra. A
-- mão de obra é sempre introduzida à mão pelo comercial. Não voltar a ligar esta
-- tabela a nenhuma importação automática para quote_lines.
--
-- Prerequisites:
--   20260615130000_baseline_new_database.sql — deal_needs, products, services,
--                                              anew_organizations, anew_users,
--                                              get_user_visible_org_ids(),
--                                              update_updated_at_column()
--   20261119140000_fase1_diagnostico_orcamento_regras_e_ia_fallback.sql — padrão de
--                                              RLS org-scoped aqui replicado
--                                              (linhas 196-216)
--
-- Nota de segurança (RLS): tabela estritamente interna — sem policy "anon_*" nem
-- baseada em portal_user_can_see_document(). O diagnóstico nunca é exposto ao portal
-- do cliente nem ao link público de proposta.
--
-- Só acrescenta. Nenhuma coluna/constraint/policy existente é alterada ou removida.

-- ============================================================
-- 1. deal_needs — colunas de diagnóstico (todas nullable, sem default)
-- ============================================================

ALTER TABLE public.deal_needs
  ADD COLUMN IF NOT EXISTS diag_area_m2              numeric(10,2),
  ADD COLUMN IF NOT EXISTS diag_demolir_descricao    text,
  ADD COLUMN IF NOT EXISTS diag_demolir_m2           numeric(10,2),
  ADD COLUMN IF NOT EXISTS diag_proteger_descricao   text,
  ADD COLUMN IF NOT EXISTS diag_intervencao_tipo     text,
  ADD COLUMN IF NOT EXISTS diag_intervencao_descricao text;

COMMENT ON COLUMN public.deal_needs.diag_area_m2 IS
  'Diagnóstico de obra: área intervencionada em m2. Nullable — necessidades antigas e necessidades sem visita técnica não têm diagnóstico.';
COMMENT ON COLUMN public.deal_needs.diag_demolir_descricao IS
  'Diagnóstico de obra: o que há a demolir (texto livre do técnico).';
COMMENT ON COLUMN public.deal_needs.diag_demolir_m2 IS
  'Diagnóstico de obra: área a demolir em m2.';
COMMENT ON COLUMN public.deal_needs.diag_proteger_descricao IS
  'Diagnóstico de obra: o que há a proteger durante a obra (texto livre do técnico).';
COMMENT ON COLUMN public.deal_needs.diag_intervencao_tipo IS
  'Diagnóstico de obra: tipo de intervenção. Texto livre de propósito — mesmo domínio informal de quote_diagnostic_areas.intervencao_tipo, sem CHECK para não partir levantamentos já feitos.';
COMMENT ON COLUMN public.deal_needs.diag_intervencao_descricao IS
  'Diagnóstico de obra: descrição da intervenção a realizar.';

-- ============================================================
-- 2. deal_need_diagnostic_materials — materiais estimados (informativo, armazém)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.deal_need_diagnostic_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id),
  deal_need_id uuid NOT NULL REFERENCES public.deal_needs(id) ON DELETE CASCADE,
  -- Serviço de origem: de que serviço do catálogo veio este material (ficha técnica).
  -- Nullable — o técnico pode acrescentar material avulso, sem serviço associado.
  service_id uuid REFERENCES public.services(id),
  product_id uuid REFERENCES public.products(id),
  descricao text,
  quantity numeric(10,2) NOT NULL DEFAULT 0,
  unidade text,
  sort_order integer DEFAULT 0,
  created_by uuid REFERENCES public.anew_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.deal_need_diagnostic_materials IS
  'Materiais estimados no diagnóstico de uma necessidade (deal_needs). APENAS INFORMATIVO para o armazém: nunca gera linhas de orçamento nem mão de obra — a mão de obra é sempre metida à mão pelo comercial. Congelado em quote_diagnostic_snapshot.materials quando o orçamento é criado.';

COMMENT ON COLUMN public.deal_need_diagnostic_materials.service_id IS
  'Serviço do catálogo de onde o material foi puxado (ficha técnica). NULL quando o técnico acrescentou o material à mão.';

CREATE INDEX IF NOT EXISTS idx_deal_need_diagnostic_materials_need
  ON public.deal_need_diagnostic_materials (deal_need_id);

DROP TRIGGER IF EXISTS update_deal_need_diagnostic_materials_updated_at
  ON public.deal_need_diagnostic_materials;
CREATE TRIGGER update_deal_need_diagnostic_materials_updated_at
  BEFORE UPDATE ON public.deal_need_diagnostic_materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- RLS — mesmo padrão org-scoped de quote_diagnostic_areas (20261119140000)
-- ------------------------------------------------------------
ALTER TABLE public.deal_need_diagnostic_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deal_need_diagnostic_materials_select_policy ON public.deal_need_diagnostic_materials;
CREATE POLICY deal_need_diagnostic_materials_select_policy ON public.deal_need_diagnostic_materials
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())));

DROP POLICY IF EXISTS deal_need_diagnostic_materials_insert_policy ON public.deal_need_diagnostic_materials;
CREATE POLICY deal_need_diagnostic_materials_insert_policy ON public.deal_need_diagnostic_materials
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())));

DROP POLICY IF EXISTS deal_need_diagnostic_materials_update_policy ON public.deal_need_diagnostic_materials;
CREATE POLICY deal_need_diagnostic_materials_update_policy ON public.deal_need_diagnostic_materials
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())))
  WITH CHECK (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())));

DROP POLICY IF EXISTS deal_need_diagnostic_materials_delete_policy ON public.deal_need_diagnostic_materials;
CREATE POLICY deal_need_diagnostic_materials_delete_policy ON public.deal_need_diagnostic_materials
  FOR DELETE TO authenticated
  USING (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_need_diagnostic_materials TO authenticated;
GRANT ALL ON public.deal_need_diagnostic_materials TO service_role;
