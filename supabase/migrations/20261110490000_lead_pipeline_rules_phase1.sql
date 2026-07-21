-- Fase 1 — Funil de Leads totalmente personalizável por organização.
-- Migração + seed de defaults + fallback nas leituras (invisível ao
-- utilizador). NÃO reescreve get_lead_dashboard_stats_scoped nem qualquer
-- RPC/UI — isso é Fase 2/3 (separado, a pedido explícito do utilizador).
--
-- IMPORTANTE (clarificado pelo utilizador): "v2"/"anew_leads_v2" no
-- documento original desta feature referem-se ao módulo REAL de Leads deste
-- repositório (tabela anew_leads, dashboard get_lead_dashboard_stats_scoped,
-- página AnewLeads.tsx) — não a uma tabela paralela de comparação. Confirmado
-- ao vivo antes de escrever esta migração: anew_leads_v2 NÃO existe nesta
-- base de dados (0 tabelas), por isso todas as referências a "_v2" no
-- documento original foram mapeadas para as tabelas reais.
--
-- ============================================================
-- 1. lead_workflow_stages — novas colunas (todas com defaults seguros)
-- ============================================================
-- default_status já existe na tabela (baseline) mas está sempre NULL em
-- produção — confirmado ao vivo. `name` é, na prática, o literal de status
-- já usado em toda a app (get_scoped_leads_base, etc.), por isso o seed
-- abaixo usa `name` como fonte, não `default_status`.

ALTER TABLE public.lead_workflow_stages
  ADD COLUMN IF NOT EXISTS matching_statuses text[] NULL,
  ADD COLUMN IF NOT EXISTS reached_when jsonb NULL,
  ADD COLUMN IF NOT EXISTS auto_advance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qualification_hint text NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS counts_as_converted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS counts_as_lost boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS counts_as_qualified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS counts_as_negotiation boolean NOT NULL DEFAULT false;

ALTER TABLE public.lead_workflow_stages
  DROP CONSTRAINT IF EXISTS lead_workflow_stages_qualification_hint_check;
ALTER TABLE public.lead_workflow_stages
  ADD CONSTRAINT lead_workflow_stages_qualification_hint_check
  CHECK (qualification_hint IN ('none', 'mql', 'sql'));

-- ── Seed defaults: reproduz o comportamento actual, invisível ao utilizador ──
-- reached_when fica NULL de propósito (regra vazia): a Fase 2 especifica que
-- "vazio → só matching_statuses/default_status contam", ou seja, a resolução
-- de etapa continua 100% baseada no status literal, exactamente como hoje,
-- até alguém configurar uma regra.
UPDATE public.lead_workflow_stages
SET
  matching_statuses = ARRAY[name],
  default_status = COALESCE(default_status, name),
  counts_as_converted = is_conversion,
  counts_as_lost = is_rejection,
  counts_as_qualified = (name = 'qualified'),
  counts_as_negotiation = (name = 'negotiation')
WHERE matching_statuses IS NULL;

-- ============================================================
-- 2. lead_qualification_rules — nova tabela, uma linha por organização
-- ============================================================
-- Atribuição manual (anew_leads.qualification_type, já existe desde a
-- feature SQL/MQL) sempre ganha sobre a sugestão destas regras — isto é
-- reforçado no motor da Fase 2, não aqui; esta tabela só guarda a config.

CREATE TABLE IF NOT EXISTS public.lead_qualification_rules (
  organization_id uuid NOT NULL PRIMARY KEY REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  mql_when jsonb NULL,
  sql_when jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES public.anew_users(id),
  updated_by uuid NULL REFERENCES public.anew_users(id)
);

DROP TRIGGER IF EXISTS update_lead_qualification_rules_updated_at ON public.lead_qualification_rules;
CREATE TRIGGER update_lead_qualification_rules_updated_at
  BEFORE UPDATE ON public.lead_qualification_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.lead_qualification_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authenticated_select_lead_qualification_rules ON public.lead_qualification_rules;
CREATE POLICY authenticated_select_lead_qualification_rules
  ON public.lead_qualification_rules
  FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())));

DROP POLICY IF EXISTS authenticated_insert_lead_qualification_rules ON public.lead_qualification_rules;
CREATE POLICY authenticated_insert_lead_qualification_rules
  ON public.lead_qualification_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())));

DROP POLICY IF EXISTS authenticated_update_lead_qualification_rules ON public.lead_qualification_rules;
CREATE POLICY authenticated_update_lead_qualification_rules
  ON public.lead_qualification_rules
  FOR UPDATE
  TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())))
  WITH CHECK (organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())));

DROP POLICY IF EXISTS authenticated_delete_lead_qualification_rules ON public.lead_qualification_rules;
CREATE POLICY authenticated_delete_lead_qualification_rules
  ON public.lead_qualification_rules
  FOR DELETE
  TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())));

REVOKE ALL ON public.lead_qualification_rules FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_qualification_rules TO authenticated;
GRANT ALL ON public.lead_qualification_rules TO service_role;

-- Audit trigger: nova tabela, organization_id directo → Grupo A, mesmo
-- padrão usado para todas as outras tabelas org-scoped nesta sessão.
DROP TRIGGER IF EXISTS trg_audit_lead_qualification_rules ON public.lead_qualification_rules;
CREATE TRIGGER trg_audit_lead_qualification_rules
  AFTER INSERT OR UPDATE OR DELETE ON public.lead_qualification_rules
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. lead_workflow_stages: SELECT name, matching_statuses, counts_as_qualified,
--    counts_as_negotiation, counts_as_converted, counts_as_lost, reached_when,
--    auto_advance, qualification_hint FROM lead_workflow_stages — confirma
--    que cada etapa existente ficou com matching_statuses = ARRAY[name],
--    counts_as_qualified/negotiation true só nas etapas 'qualified'/
--    'negotiation', counts_as_converted/lost espelhando is_conversion/
--    is_rejection, reached_when NULL, auto_advance false, qualification_hint
--    'none' — ou seja, nada muda até alguém configurar algo (Fase 3).
-- 2. lead_qualification_rules existe, vazia, RLS scoped por organização,
--    com trigger de auditoria.
-- 3. Nenhuma RPC nem UI foi alterada nesta migração — get_lead_dashboard_stats_scoped
--    continua a ler apenas de anew_leads/get_scoped_leads_base, os números do
--    dashboard não mudam. Isso é o objectivo explícito da Fase 1: "invisível
--    ao utilizador".
