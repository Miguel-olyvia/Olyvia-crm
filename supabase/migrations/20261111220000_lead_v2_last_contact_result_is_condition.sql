-- Nova condição de regra: "Último resultado de contacto é <X>", pedida para
-- permitir escolher um resultado ESPECÍFICO de lead_contact_results (não só
-- os agregados booleanos last_contact_is_negative/positive já existentes).
--
-- Investigação feita ANTES de escrever esta migração (não assumida):
--   - NÃO existe nenhum enum/CHECK fixo para entity_interactions.result nem
--     para um qualquer "lead_contact_results" enumerado a nível de schema.
--     public.lead_contact_results é uma tabela normal, com linhas GLOBAIS
--     (organization_id IS NULL) e por ORGANIZAÇÃO, geridas livremente pelo
--     utilizador em src/pages/LeadContactResults.tsx (criar/editar/apagar
--     nome, cor, ícone, is_positive/is_negative, etc.). Confirmado: não há
--     nenhum INSERT de seed de linhas globais em nenhuma migração da
--     baseline nem posterior (grep exaustivo a "lead_contact_results" em
--     supabase/migrations só devolve a policy de INSERT da baseline).
--   - O fluxo real que regista o "último contacto" de um LEAD é
--     src/components/leads/AnewLeadContactDialog.tsx: carrega
--     lead_contact_results (globais + da org, is_active=true) e grava o
--     UUID do resultado escolhido em entity_interactions.result (confirmado
--     em handleSubmit: `result: contactResult` onde contactResult é
--     `contactResults.find(r => r.id === ...)`-comparável, i.e. o id, não um
--     nome/label). O catálogo fixo 'answered'/'no_answer'/'busy'/
--     'voicemail'/'wrong_number' referido nalguma investigação anterior
--     pertence a src/components/contacts/RegisterCallDialog.tsx, que é o
--     dialog de chamadas de CONTACTOS/CLIENTES (ClientDetailsDialog.tsx),
--     não de leads — não é a fonte usada pelas regras de pipeline de leads.
--   - Os nomes "Interessado"/"Não Interessado"/"Pediu Callback"/
--     "Número Errado" citados em src/hooks/useLeadHealthScore.ts são
--     exemplos de NOMES que uma organização pode dar às suas linhas de
--     lead_contact_results (comparação por texto, já frágil hoje) — não são
--     um enum fixo em lado nenhum do schema.
--   - Conclusão: um novo tipo de condição parametrizado por um valor de
--     texto FIXO ("answered"/"Interessado"/etc., como sugerido inicialmente)
--     não corresponderia a nenhum dado real gravado para leads. A condição
--     correcta tem de ser parametrizada pelo id (uuid) de
--     public.lead_contact_results, tal como já ficou gravado em
--     entity_interactions.result pelo AnewLeadContactDialog. A UI (ver
--     conditionCatalog.ts/StageRulesEditor.tsx) carrega a lista real de
--     lead_contact_results da organização (globais + próprios, activos) e
--     constrói uma condição por linha, com esse id como "value" — nunca um
--     valor inventado.
--
-- Reaproveita exactamente o mesmo padrão LATERAL/ORDER BY já usado por
-- last_contact_is_negative/last_contact_is_positive (ORDER BY
-- ei2.interaction_at DESC NULLS LAST, ei2.created_at DESC LIMIT 1) — não
-- introduz nenhum lookup novo, apenas expõe mais uma coluna (o id textual
-- do último resultado) a partir da mesma sub-query já existente.
--
-- Forma da condição, consistente com o "value"-based `qualification_is` já
-- existente no catálogo:
--   {"type": "last_contact_result_is", "value": "<lead_contact_results.id>"}
--
-- Nenhuma chave existente do jsonb foi renomeada/removida. Nenhum tipo de
-- condição existente foi alterado. As assinaturas de ambas as funções
-- mantêm-se exactamente iguais (evaluate_lead_signals_v2(uuid) -> jsonb;
-- evaluate_condition(jsonb, jsonb, text) -> boolean).

-- ============================================================
-- evaluate_lead_signals_v2 — acrescenta 'last_contact_result_id' (texto cru
-- de entity_interactions.result do ÚLTIMO contacto), lido da mesma LATERAL
-- "llc" que já calcula last_is_negative/last_is_positive.
-- ============================================================
CREATE OR REPLACE FUNCTION public.evaluate_lead_signals_v2(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'has_assignee', l.assigned_to IS NOT NULL,
    'has_active_deal', COALESCE(ld.has_active_deal, false),
    'has_active_quote', COALESCE(lq.has_active_quote, false),
    'has_active_proposal', COALESCE(lp.has_active_proposal, false),
    'has_signed_contract', COALESCE(lc.has_signed_contract, false),
    'has_qualification_mql', COALESCE(l.qualification_type = 'mql', false),
    'has_qualification_sql', COALESCE(l.qualification_type = 'sql', false),
    'has_source', COALESCE(NULLIF(l.source, ''), NULL) IS NOT NULL,
    'has_contact_logged', COALESCE(lei.has_contact_logged, false),
    'has_scheduled_visit', l.scheduled_visit_id IS NOT NULL,
    'last_contact_is_negative', COALESCE(llc.last_is_negative, false),
    'last_contact_is_positive', COALESCE(llc.last_is_positive, false),
    -- novo: id textual (uuid de lead_contact_results, ou literal legado) do
    -- resultado do ÚLTIMO contacto — NULL quando não há nenhum contacto.
    'last_contact_result_id', llc.last_result_id,
    -- --- sinais novos (migração 20261111200000) ---
    'has_call_answered', COALESCE(lca.has_call_answered, false),
    'has_email_sent', COALESCE(les.has_email_sent, false),
    'has_deal_won', COALESCE(ldw.has_deal_won, false),
    'has_visit_done', COALESCE(lvd.has_visit_done, false),
    'has_quote_open', COALESCE(lqs.has_quote_open, false),
    'has_quote_sent', COALESCE(lqs.has_quote_sent, false),
    'has_quote_accepted', COALESCE(lqs.has_quote_accepted, false),
    'has_proposal_open', COALESCE(lps.has_proposal_open, false),
    'has_proposal_sent', COALESCE(lps.has_proposal_sent, false),
    'has_proposal_accepted', COALESCE(lps.has_proposal_accepted, false),
    -- APROXIMAÇÃO — ver nota na migração 20261111200000: proxy via
    -- deal_needs.status = 'orcamentado' num deal ligado ao lead.
    'has_needs_assessment_done', COALESCE(lna.has_needs_assessment_done, false),
    'days_since_created', EXTRACT(day FROM now() - l.created_at)::int,
    'days_since_last_contact', CASE
      WHEN l.last_contact_at IS NULL THEN NULL
      ELSE EXTRACT(day FROM now() - l.last_contact_at)::int
    END
  )
  INTO v_result
  FROM public.anew_leads l
  LEFT JOIN LATERAL (
    SELECT bool_or(true) AS has_active_deal
    FROM public.deals d
    WHERE d.entity_id = l.entity_id
      AND d.deleted_at IS NULL
      AND d.closed_at IS NULL
      AND d.lost_reason IS NULL
  ) ld ON true
  LEFT JOIN LATERAL (
    SELECT bool_or(true) AS has_active_quote
    FROM public.quotes q
    WHERE q.entity_id = l.entity_id
      AND q.deleted_at IS NULL
      AND q.estado <> 'perdido'
  ) lq ON true
  LEFT JOIN LATERAL (
    SELECT bool_or(true) AS has_active_proposal
    FROM public.proposals p
    WHERE p.entity_id = l.entity_id
      AND p.deleted_at IS NULL
      AND p.status <> 'rejected'
  ) lp ON true
  LEFT JOIN LATERAL (
    SELECT bool_or(true) AS has_signed_contract
    FROM public.client_contracts cc
    WHERE cc.entity_id = l.entity_id
      AND cc.deleted_at IS NULL
      AND cc.status = 'signed'
  ) lc ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) > 0 AS has_contact_logged
    FROM public.entity_interactions ei
    WHERE ei.entity_id = l.entity_id
  ) lei ON true
  LEFT JOIN LATERAL (
    -- Precisa de ser o ÚLTIMO contacto apenas (ORDER BY ... LIMIT 1), não um
    -- agregado sobre todo o histórico. last_result_id é o mesmo ei2.result
    -- cru já usado para o JOIN com lead_contact_results nesta sub-query,
    -- só que agora também exposto no jsonb (não apenas usado para calcular
    -- is_negative/is_positive).
    SELECT
      COALESCE(lcr.is_negative, false) AS last_is_negative,
      COALESCE(lcr.is_positive, false) AS last_is_positive,
      ei2.result AS last_result_id
    FROM public.entity_interactions ei2
    LEFT JOIN public.lead_contact_results lcr ON lcr.id::text = ei2.result
    WHERE ei2.entity_id = l.entity_id
    ORDER BY ei2.interaction_at DESC NULLS LAST, ei2.created_at DESC
    LIMIT 1
  ) llc ON true
  LEFT JOIN LATERAL (
    SELECT bool_or(true) AS has_call_answered
    FROM public.entity_interactions ei3
    WHERE ei3.entity_id = l.entity_id
      AND ei3.interaction_type = 'call'
      AND ei3.result = 'answered'
  ) lca ON true
  LEFT JOIN LATERAL (
    SELECT bool_or(true) AS has_email_sent
    FROM public.email_logs em
    WHERE em.entity_id = l.entity_id
      AND em.status = 'sent'
  ) les ON true
  LEFT JOIN LATERAL (
    SELECT bool_or(true) AS has_deal_won
    FROM public.deals dw
    JOIN public.deal_stages ds ON ds.id = dw.stage_id
    WHERE dw.entity_id = l.entity_id
      AND dw.deleted_at IS NULL
      AND ds.is_won
      AND dw.closed_at IS NOT NULL
  ) ldw ON true
  LEFT JOIN LATERAL (
    SELECT bool_or(true) AS has_visit_done
    FROM public.schedule_items si
    WHERE si.id = l.scheduled_visit_id
      AND si.status = 'completed'
  ) lvd ON true
  LEFT JOIN LATERAL (
    SELECT
      bool_or(q2.estado = 'rascunho') AS has_quote_open,
      bool_or(q2.estado = 'enviado') AS has_quote_sent,
      bool_or(q2.estado = 'aceite') AS has_quote_accepted
    FROM public.quotes q2
    WHERE q2.entity_id = l.entity_id
      AND q2.deleted_at IS NULL
  ) lqs ON true
  LEFT JOIN LATERAL (
    SELECT
      bool_or(p2.status = 'draft') AS has_proposal_open,
      bool_or(p2.sent_at IS NOT NULL) AS has_proposal_sent,
      bool_or(p2.accepted_at IS NOT NULL) AS has_proposal_accepted
    FROM public.proposals p2
    WHERE p2.entity_id = l.entity_id
      AND p2.deleted_at IS NULL
  ) lps ON true
  LEFT JOIN LATERAL (
    SELECT bool_or(true) AS has_needs_assessment_done
    FROM public.deals dn_deal
    JOIN public.deal_needs dn ON dn.deal_id = dn_deal.id
    WHERE dn_deal.entity_id = l.entity_id
      AND dn_deal.deleted_at IS NULL
      AND dn.status = 'orcamentado'
  ) lna ON true
  WHERE l.id = p_lead_id;

  IF v_result IS NULL THEN
    RETURN jsonb_build_object(
      'has_assignee', false,
      'has_active_deal', false,
      'has_active_quote', false,
      'has_active_proposal', false,
      'has_signed_contract', false,
      'has_qualification_mql', false,
      'has_qualification_sql', false,
      'has_source', false,
      'has_contact_logged', false,
      'has_scheduled_visit', false,
      'last_contact_is_negative', false,
      'last_contact_is_positive', false,
      'last_contact_result_id', null,
      'has_call_answered', false,
      'has_email_sent', false,
      'has_deal_won', false,
      'has_visit_done', false,
      'has_quote_open', false,
      'has_quote_sent', false,
      'has_quote_accepted', false,
      'has_proposal_open', false,
      'has_proposal_sent', false,
      'has_proposal_accepted', false,
      'has_needs_assessment_done', false,
      'days_since_created', 0,
      'days_since_last_contact', null
    );
  END IF;

  RETURN v_result;
END;
$function$;

-- ============================================================
-- evaluate_condition — acrescenta 'last_contact_result_is', comparação de
-- texto simples entre o id do último resultado e o "value" pedido pela
-- condição (funciona tanto para os uuids de lead_contact_results como para
-- eventuais literais legados, sem qualquer cast que possa rebentar).
-- ============================================================
CREATE OR REPLACE FUNCTION public.evaluate_condition(
  p_condition jsonb,
  p_signals jsonb,
  p_lead_status text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $function$
BEGIN
  RETURN CASE p_condition->>'type'
    WHEN 'has_assignee' THEN COALESCE((p_signals->>'has_assignee')::boolean, false)
    WHEN 'has_source' THEN COALESCE((p_signals->>'has_source')::boolean, false)
    WHEN 'has_contact_logged' THEN COALESCE((p_signals->>'has_contact_logged')::boolean, false)
    WHEN 'has_scheduled_visit' THEN COALESCE((p_signals->>'has_scheduled_visit')::boolean, false)
    WHEN 'has_active_deal' THEN COALESCE((p_signals->>'has_active_deal')::boolean, false)
    WHEN 'has_active_quote' THEN COALESCE((p_signals->>'has_active_quote')::boolean, false)
    WHEN 'has_active_proposal' THEN COALESCE((p_signals->>'has_active_proposal')::boolean, false)
    WHEN 'has_signed_contract' THEN COALESCE((p_signals->>'has_signed_contract')::boolean, false)
    WHEN 'qualification_is' THEN CASE p_condition->>'value'
      WHEN 'mql' THEN COALESCE((p_signals->>'has_qualification_mql')::boolean, false)
      WHEN 'sql' THEN COALESCE((p_signals->>'has_qualification_sql')::boolean, false)
      ELSE false
    END
    WHEN 'last_contact_is_negative' THEN COALESCE((p_signals->>'last_contact_is_negative')::boolean, false)
    WHEN 'last_contact_is_positive' THEN COALESCE((p_signals->>'last_contact_is_positive')::boolean, false)
    -- Novo tipo: {"type": "last_contact_result_is", "value": "<lead_contact_results.id>"}
    WHEN 'last_contact_result_is' THEN
      p_signals->>'last_contact_result_id' IS NOT NULL
      AND p_signals->>'last_contact_result_id' = p_condition->>'value'
    WHEN 'has_call_answered' THEN COALESCE((p_signals->>'has_call_answered')::boolean, false)
    WHEN 'has_email_sent' THEN COALESCE((p_signals->>'has_email_sent')::boolean, false)
    WHEN 'has_deal_won' THEN COALESCE((p_signals->>'has_deal_won')::boolean, false)
    WHEN 'has_visit_done' THEN COALESCE((p_signals->>'has_visit_done')::boolean, false)
    WHEN 'has_quote_open' THEN COALESCE((p_signals->>'has_quote_open')::boolean, false)
    WHEN 'has_quote_sent' THEN COALESCE((p_signals->>'has_quote_sent')::boolean, false)
    WHEN 'has_quote_accepted' THEN COALESCE((p_signals->>'has_quote_accepted')::boolean, false)
    WHEN 'has_proposal_open' THEN COALESCE((p_signals->>'has_proposal_open')::boolean, false)
    WHEN 'has_proposal_sent' THEN COALESCE((p_signals->>'has_proposal_sent')::boolean, false)
    WHEN 'has_proposal_accepted' THEN COALESCE((p_signals->>'has_proposal_accepted')::boolean, false)
    WHEN 'has_needs_assessment_done' THEN COALESCE((p_signals->>'has_needs_assessment_done')::boolean, false)
    WHEN 'days_since_created_gt' THEN
      COALESCE((p_signals->>'days_since_created')::int, 0) > COALESCE((p_condition->>'value')::int, 0)
    WHEN 'days_since_last_contact_gt' THEN
      CASE
        WHEN p_signals->'days_since_last_contact' IS NULL
          OR p_signals->>'days_since_last_contact' IS NULL THEN true
        ELSE (p_signals->>'days_since_last_contact')::int > COALESCE((p_condition->>'value')::int, 0)
      END
    ELSE false
  END;
END;
$function$;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. Para uma lead real cujo último entity_interactions.result seja um uuid
--    válido de lead_contact_results, confirmar que
--    evaluate_lead_signals_v2(...)->>'last_contact_result_id' é exactamente
--    esse uuid, e que {"type":"last_contact_result_is","value":"<esse
--    uuid>"} avalia para true só para essa lead (false para outra lead com
--    um último resultado diferente, e false para uma lead sem nenhum
--    entity_interactions).
-- 2. Confirmar que os 12+12+2 sinais/condições já existentes continuam
--    byte a byte iguais (nenhuma chave renomeada/removida, nenhum tipo de
--    condição alterado).
-- 3. Confirmar que stage_reached()/compute_lead_stage_v2() continuam a
--    resolver a mesma paridade de dashboard para orgs sem regras
--    configuradas — nenhuma regra existente referencia
--    'last_contact_result_is'.
