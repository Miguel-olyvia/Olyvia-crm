-- Extensão do motor de sinais/condições dos leads v2 (evaluate_lead_signals_v2
-- + evaluate_condition) com 12 sinais adicionais e 2 novos tipos de condição
-- parametrizados por tempo, pedidos para o catálogo de regras de pipeline.
--
-- Estado real confirmado ANTES desta migração (leitura directa das
-- definições em vigor, não de suposição):
--   - evaluate_lead_signals_v2(p_lead_id uuid) RETURNS jsonb — última def em
--     20261111105000_stage_reached_hardening_and_signals_single_pass.sql,
--     já reescrita para uma única passagem com LEFT JOIN LATERAL por
--     tabela (SECURITY DEFINER, SET search_path TO 'public', STABLE).
--   - evaluate_condition(p_condition jsonb, p_signals jsonb, p_lead_status
--     text) RETURNS boolean — última def em
--     20261110600000_trim_condition_catalog_to_12.sql. A assinatura real
--     tem 3 parâmetros (não 2): p_lead_status também é recebido, embora o
--     corpo actual não o use em nenhum WHEN. Mantém-se
--     LANGUAGE plpgsql IMMUTABLE, SEM SECURITY DEFINER e SEM SET
--     search_path — confirmado que nunca tocou em tabelas (só lê os jsonb
--     recebidos), pelo que não precisa desse hardening; os novos ramos
--     adicionados aqui também só leem p_signals/p_condition, portanto a
--     função continua sem necessidade de SECURITY DEFINER.
--
-- Sinais confirmados com evidência real no código (não fabricados):
--   - has_call_answered: entity_interactions.interaction_type = 'call' AND
--     result = 'answered' — valor literal escrito por
--     src/components/contacts/RegisterCallDialog.tsx (interaction_type:
--     "call", result: estado do Select, default "answered").
--   - has_email_sent: email_logs.entity_id = <entity do lead> AND
--     status = 'sent' (email_logs tem colunas entity_id, status, sent_at —
--     confirmado no baseline). Usa status='sent' como sinal primário; não
--     se exige sent_at para não descartar linhas legadas sem esse campo
--     preenchido mas já marcadas como enviadas.
--   - has_deal_won: deals d JOIN deal_stages ds ON d.stage_id = ds.id WHERE
--     ds.is_won AND d.closed_at IS NOT NULL — mesmo padrão usado em
--     src/components/deals/DealsDashboardView.tsx (isWonStage(deal_stages)
--     && d.closed_at != null).
--   - has_visit_done: schedule_items.id = anew_leads.scheduled_visit_id AND
--     schedule_items.status = 'completed' — 'completed' é um valor válido
--     do enum public.schedule_item_status (confirmado no baseline).
--   - has_quote_open / has_quote_sent / has_quote_accepted: quotes.estado
--     em ('rascunho' | 'enviado' | 'aceite') — os 4 valores reais do campo
--     (mais 'perdido') confirmados em src/pages/Quotes.tsx.
--   - has_proposal_open / has_proposal_sent / has_proposal_accepted:
--     proposals.status = 'draft' (default da coluna, confirmado no
--     baseline) / proposals.sent_at IS NOT NULL / proposals.accepted_at
--     IS NOT NULL.
--   - has_needs_assessment_done: APROXIMAÇÃO, documentada como tal.
--     Investigado directamente em src/components/deals/DealNeedsSection.tsx
--     — a tabela é public.deal_needs (deal_id uuid, status text), e os
--     ÚNICOS valores reais de status são 'pendente', 'em_analise',
--     'orcamentado', 'cancelado' (confirmado no enum do Zod do formulário
--     e no statusConfig do componente). NÃO existe um estado literal
--     "concluído"/"done" para deal_needs. 'orcamentado' ("Orçamentado") é
--     o estado terminal de sucesso mais próximo de "levantamento de
--     necessidades concluído" (o levantamento foi feito e já resultou em
--     orçamento), pelo que é usado como proxy. Isto é uma aproximação ao
--     nível do DEAL associado ao lead (via deals.entity_id = lead.entity_id,
--     mesmo padrão dos restantes sinais), não um facto directo do lead —
--     um lead pode ter o levantamento "feito" num deal sem que este sinal
--     internal reflicta nuances (ex.: levantamento feito mas depois
--     reaberto). Se este sinal for exposto no catálogo de condições da UI,
--     deve ser rotulado como "(aproximado)".
--
-- Sinais explicitamente NÃO adicionados (sem fonte de dados real
-- confirmada nesta sessão — não fabricar): has_team, has_email_reply,
-- has_meeting_scheduled, has_meeting_done, has_paid_invoice,
-- has_budget_field_filled. Se algum dia forem pedidos, precisam primeiro de
-- uma tabela/coluna real que os sustente.
--
-- Sinais de tempo (days_since_created_gt / days_since_last_contact_gt):
-- não podem ser chaves booleanas fixas no jsonb porque dependem de um
-- parâmetro N definido na regra (ex.: "há mais de 7 dias"). Em vez disso:
--   1. evaluate_lead_signals_v2 passa a incluir sempre dois INTEIROS no
--      jsonb: 'days_since_created' (sempre calculável, anew_leads.created_at
--      nunca é NULL) e 'days_since_last_contact' (pode ser NULL quando
--      anew_leads.last_contact_at IS NULL).
--   2. evaluate_condition ganha 2 novos tipos de condição:
--        {"type": "days_since_created_gt", "value": "7"}
--        {"type": "days_since_last_contact_gt", "value": "7"}
--      que comparam o inteiro correspondente em p_signals com o N indicado
--      em p_condition->>'value' (cast para integer).
--      Decisão para last_contact_at NULL (nunca contactado): tratamos como
--      satisfazendo QUALQUER N, i.e. a condição avalia para TRUE
--      independentemente do valor de N. Racional: "nunca contactado" é o
--      pior caso possível de "há quanto tempo não é contactado" — é maior
--      que qualquer intervalo finito, logo qualquer regra do tipo "sem
--      contacto há mais de N dias" deve disparar para um lead que nunca
--      teve nenhum contacto registado. Isto é análogo à forma como
--      last_contact_is_negative/positive já tratam NULL como false (ver
--      20261110590000) — aqui a escolha inversa (NULL => true) é
--      deliberada porque a semântica da condição é "tempo SEM contacto",
--      não "resultado do último contacto".
--
-- Nenhuma chave existente do jsonb foi renomeada/removida. Nenhum tipo de
-- condição existente foi alterado. As assinaturas de ambas as funções
-- mantêm-se exactamente iguais.
--
-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. Para uma amostra de leads reais com/sem cada nova condição
--    (chamada respondida, email enviado, negócio ganho, visita concluída,
--    orçamento em cada estado, proposta em cada estado, deal_needs
--    'orcamentado'), confirmar que os novos campos do jsonb reflectem a
--    realidade e que os 12 sinais antigos permanecem byte a byte iguais.
-- 2. Confirmar days_since_created/days_since_last_contact contra
--    now() - created_at / now() - last_contact_at calculados manualmente
--    para os mesmos leads, incluindo o caso last_contact_at IS NULL.
-- 3. Confirmar que stage_reached()/compute_lead_stage_v2() continuam a
--    resolver a mesma paridade de dashboard (730/437/225) para orgs sem
--    regras configuradas — nenhuma regra existente referencia os novos
--    tipos de condição, portanto o comportamento por omissão não muda.

-- ============================================================
-- evaluate_lead_signals_v2 — acrescenta 12 sinais booleanos novos + 2
-- inteiros de apoio às condições de tempo, mantendo o padrão de 1 LEFT
-- JOIN LATERAL por tabela de origem (nunca um JOIN multi-tabela simples).
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
    -- --- sinais novos ---
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
    -- APROXIMAÇÃO — ver nota no cabeçalho: proxy via deal_needs.status =
    -- 'orcamentado' num deal ligado ao lead, não um facto directo do lead.
    'has_needs_assessment_done', COALESCE(lna.has_needs_assessment_done, false),
    -- inteiros de apoio às condições days_since_created_gt /
    -- days_since_last_contact_gt (ver evaluate_condition)
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
    -- Precisa de ser o ÚLTIMO contacto apenas (ORDER BY ... LIMIT 1),
    -- não um agregado sobre todo o histórico.
    SELECT
      COALESCE(lcr.is_negative, false) AS last_is_negative,
      COALESCE(lcr.is_positive, false) AS last_is_positive
    FROM public.entity_interactions ei2
    LEFT JOIN public.lead_contact_results lcr ON lcr.id::text = ei2.result
    WHERE ei2.entity_id = l.entity_id
    ORDER BY ei2.interaction_at DESC NULLS LAST, ei2.created_at DESC
    LIMIT 1
  ) llc ON true
  LEFT JOIN LATERAL (
    -- has_call_answered: valor literal escrito por RegisterCallDialog.tsx
    -- (interaction_type: "call", result: "answered").
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
    -- Mesmo padrão de "deal ganho" usado em DealsDashboardView.tsx:
    -- estágio marcado is_won e data de fecho preenchida.
    SELECT bool_or(true) AS has_deal_won
    FROM public.deals dw
    JOIN public.deal_stages ds ON ds.id = dw.stage_id
    WHERE dw.entity_id = l.entity_id
      AND dw.deleted_at IS NULL
      AND ds.is_won
      AND dw.closed_at IS NOT NULL
  ) ldw ON true
  LEFT JOIN LATERAL (
    -- A visita agendada do lead (l.scheduled_visit_id) está concluída.
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
    -- APROXIMAÇÃO: "levantamento de necessidades concluído" não existe
    -- como facto do lead nem como estado literal em deal_needs — usa-se
    -- 'orcamentado' (o estado terminal de sucesso do deal_needs) num deal
    -- ligado ao lead como proxy. Ver nota no cabeçalho da migração.
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
-- evaluate_condition — acrescenta os 2 novos tipos de condição
-- parametrizados por tempo (days_since_created_gt / days_since_last_contact_gt).
-- Assinatura, LANGUAGE, IMMUTABLE e ausência de SECURITY DEFINER/search_path
-- mantidas exactamente como estavam (ver nota no cabeçalho: nunca tocou
-- em tabelas, continua a não tocar).
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
    -- --- novos tipos de condição ---
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
    -- Aproximação — ver nota no cabeçalho da migração.
    WHEN 'has_needs_assessment_done' THEN COALESCE((p_signals->>'has_needs_assessment_done')::boolean, false)
    -- Condições de tempo parametrizadas: {"type": "...", "value": "<N dias>"}
    WHEN 'days_since_created_gt' THEN
      COALESCE((p_signals->>'days_since_created')::int, 0) > COALESCE((p_condition->>'value')::int, 0)
    WHEN 'days_since_last_contact_gt' THEN
      -- last_contact_at NULL ("nunca contactado") satisfaz sempre a
      -- condição, qualquer que seja N: nunca ter sido contactado é o pior
      -- caso possível de "tempo sem contacto", maior que qualquer N finito.
      -- Ver nota detalhada no cabeçalho da migração.
      CASE
        WHEN p_signals->'days_since_last_contact' IS NULL
          OR p_signals->>'days_since_last_contact' IS NULL THEN true
        ELSE (p_signals->>'days_since_last_contact')::int > COALESCE((p_condition->>'value')::int, 0)
      END
    ELSE false
  END;
END;
$function$;
