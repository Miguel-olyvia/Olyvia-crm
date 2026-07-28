-- recompute_leads_v2_buckets — adiciona sanity check de leads não
-- resolvidas e regista uma interação por lead cujo estágio realmente mudou.
--
-- Contexto (20261110540000_lead_v2_simulate_and_recompute.sql:161-196): a
-- versão anterior recalculava e persistia o novo workflow_stage_id de cada
-- lead activa da org, mas não tinha nenhuma verificação pós-gravação (quantas
-- leads ficaram sem nenhum estágio resolvido, face ao total de leads activas)
-- nem registava qualquer rasto em entity_interactions para as leads que
-- efectivamente mudaram de estágio.
--
-- Task 1 — sanity check: passa a calcular, na mesma passagem, quantas leads
-- activas da org resolveram para NULL em compute_lead_stage_v2 (nenhuma regra
-- de nenhum estágio correspondeu) face ao total de leads activas da org, e
-- devolve essa informação ao chamador via novas colunas de retorno. Isto é
-- aditivo: o único caller real encontrado em src/
-- (LeadWorkflowConfig.tsx:562 `handleRecompute`) só lê `data?.[0]?.updated_count`,
-- pelo que continua a funcionar sem alterações — mas fica preparado para a UI
-- vir a mostrar o aviso de leads não resolvidas.
--
-- Nota: mudar a forma de RETURNS TABLE(...) de uma função existente não é
-- possível com um simples CREATE OR REPLACE (Postgres recusa com "cannot
-- change return type of existing function"), por isso este ficheiro faz
-- DROP FUNCTION seguido de CREATE FUNCTION, mantendo o mesmo nome e a mesma
-- assinatura de parâmetros (p_org uuid).
--
-- Task 2 — log em entity_interactions: para cada lead cujo workflow_stage_id
-- efectivamente mudou (não as que já estavam correctas), insere uma linha em
-- entity_interactions num único INSERT...SELECT batch (sem loop por lead),
-- ligada ao entity_id da lead, com o texto "estágio antigo -> estágio novo".
--
-- interaction_type escolhido: 'note'. entity_interactions.interaction_type
-- é texto livre (sem CHECK constraint - confirmado em
-- 20260615130000_baseline_new_database.sql:9772-9791, que só tem
-- entity_interactions_sentiment_check), mas o valor tem de ser um dos que a
-- UI já reconhece (ContactInfoTab.tsx, ContactDetailsDialog.tsx,
-- ClientDetailsDialog.tsx, LeadTimelineTab.tsx mapeiam explicitamente 'call',
-- 'email', 'meeting', 'whatsapp', 'note', 'visit', 'task' — qualquer outro
-- valor cai no fallback genérico "Nota"/"Interacção"). O precedente mais
-- próximo de "nota automática gerada por automação de workflow" já existente
-- no código é execute-workflow/index.ts:368-399, que migra notas de lead
-- automaticamente para entity_interactions com
-- `interaction_type: "note"` (não "system" nem "automation" — esses valores
-- não são usados em nenhum sítio do código para entity_interactions). Segue-
-- se a mesma convenção aqui: 'note', com subject a identificar que é uma nota
-- automática de recálculo de pipeline, para não confundir com uma nota
-- manual do utilizador mas sem inventar um valor de interaction_type que a UI
-- não sabe desenhar.
--
-- created_by: segue o padrão de rpc_schedule_client_meeting
-- (20260902010000_contacts_clients_atomic_create_and_fixes.sql:1122-1129),
-- que grava o actor autenticado (auth.uid()::text) em created_by — aqui é o
-- utilizador que clicou em "Guardar & Recalcular".
--
-- Leads sem entity_id (nunca deveriam existir para leads activas, mas
-- entity_id é nullable na tabela) são excluídas do INSERT em
-- entity_interactions, já que entity_id é NOT NULL + FK nessa tabela — sem
-- isto o INSERT falharia para essas linhas e abortaria a função toda.

DROP FUNCTION IF EXISTS public.recompute_leads_v2_buckets(uuid);

CREATE FUNCTION public.recompute_leads_v2_buckets(p_org uuid)
RETURNS TABLE(
  updated_count integer,
  unresolved_count integer,
  unresolved_lead_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_authorized boolean;
  v_count integer;
  v_logged_count integer;
  v_total_count integer;
  v_unresolved_count integer;
  v_unresolved_ids uuid[];
BEGIN
  SELECT p_org IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  INTO v_authorized;

  IF NOT COALESCE(v_authorized, false) THEN
    RAISE EXCEPTION 'not authorized for organization %', p_org;
  END IF;

  WITH resolved AS (
    SELECT
      id,
      entity_id,
      organization_id,
      root_organization_id,
      workflow_stage_id AS old_stage_id,
      public.compute_lead_stage_v2(id) AS new_stage_id
    FROM public.anew_leads
    WHERE organization_id = p_org AND deleted_at IS NULL
  ),
  updated AS (
    UPDATE public.anew_leads al
    SET workflow_stage_id = r.new_stage_id,
        pipeline_dirty_at = NULL
    FROM resolved r
    WHERE al.id = r.id
      AND al.workflow_stage_id IS DISTINCT FROM r.new_stage_id
    RETURNING al.id, r.entity_id, r.organization_id, r.root_organization_id,
      r.old_stage_id, r.new_stage_id
  ),
  -- Task 2: uma linha de entity_interactions por lead que realmente mudou de
  -- estágio (não as que já estavam correctas), num único INSERT...SELECT.
  logged AS (
    INSERT INTO public.entity_interactions
      (entity_id, organization_id, root_organization_id, interaction_type,
       subject, notes, created_by, interaction_at)
    SELECT
      u.entity_id,
      u.organization_id,
      u.root_organization_id,
      'note',
      'Recalculo automático de estágio do pipeline',
      'Estágio alterado automaticamente de "' || COALESCE(os.label, 'sem estágio') ||
        '" para "' || COALESCE(ns.label, 'sem estágio') || '".',
      auth.uid()::text,
      now()
    FROM updated u
    LEFT JOIN public.lead_workflow_stages os ON os.id = u.old_stage_id
    LEFT JOIN public.lead_workflow_stages ns ON ns.id = u.new_stage_id
    WHERE u.entity_id IS NOT NULL
    RETURNING 1
  ),
  -- Task 1: leads activas que não resolveram para nenhum estágio.
  unresolved AS (
    SELECT id FROM resolved WHERE new_stage_id IS NULL
  ),
  unresolved_sample AS (
    SELECT id FROM unresolved ORDER BY id LIMIT 50
  )
  SELECT
    (SELECT COUNT(*) FROM updated)::integer,
    (SELECT COUNT(*) FROM logged)::integer,
    (SELECT COUNT(*) FROM resolved)::integer,
    (SELECT COUNT(*) FROM unresolved)::integer,
    (SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) FROM unresolved_sample)
  INTO v_count, v_logged_count, v_total_count, v_unresolved_count, v_unresolved_ids;

  IF v_unresolved_count > 0 THEN
    RAISE WARNING 'recompute_leads_v2_buckets: % of % active lead(s) in org % did not resolve to any workflow stage (compute_lead_stage_v2 returned NULL)',
      v_unresolved_count, v_total_count, p_org;
  END IF;

  RETURN QUERY SELECT v_count, v_unresolved_count, v_unresolved_ids;
END;
$function$;

REVOKE ALL ON FUNCTION public.recompute_leads_v2_buckets(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_leads_v2_buckets(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_leads_v2_buckets(uuid) TO service_role;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. Chamar recompute_leads_v2_buckets(org) numa org com leads activas cujas
--    regras de estágio não cobrem todos os casos (ex.: nenhum estágio com
--    reached_when/matching_statuses vazio a apanhar o resto) -> confirmar que
--    unresolved_count > 0, unresolved_lead_ids traz até 50 ids reais dessa
--    org, e aparece um RAISE WARNING no log do Postgres.
-- 2. Chamar numa org "saudável" (todas as leads resolvem para algum estágio)
--    -> unresolved_count = 0, unresolved_lead_ids = '{}'.
-- 3. Antes/depois da chamada, contar entity_interactions
--    WHERE interaction_type = 'note' AND subject = 'Recalculo automático de
--    estágio do pipeline' para a org -> o aumento deve ser exactamente igual
--    a updated_count (uma linha por lead cujo workflow_stage_id mudou),
--    ligada ao entity_id de cada lead.
-- 4. Repetir a chamada uma segunda vez imediatamente a seguir -> updated_count
--    deve ser 0 (idempotente) e nenhuma nova linha de entity_interactions
--    deve ser criada.
-- 5. Confirmar que uma lead sem entity_id (se existir) que mude de estágio
--    incrementa updated_count mas não gera linha em entity_interactions (é
--    excluída pelo WHERE u.entity_id IS NOT NULL), sem abortar a função.
-- 6. Confirmar RAISE EXCEPTION ao chamar com um p_org para o qual o utilizador
--    autenticado não tem visibilidade (comportamento preservado).
