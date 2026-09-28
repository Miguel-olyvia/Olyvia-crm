-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Timeline — backfill dos marcos de propostas, orçamentos e contratos      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Os gatilhos de 20261202050000 só apanham transições novas. Sem este backfill,
-- toda a história anterior continuaria a ler-se como "Editou estado: sent →
-- accepted" e as fichas antigas não ganhavam nada.
--
-- ── Regra: só se escreve um marco quando existe um carimbo VERDADEIRO ───────
-- Não se usa `updated_at` como substituto de uma data em falta: seria inventar
-- precisão que não existe e colocar eventos históricos na data errada. Quando
-- não há carimbo, o marco simplesmente não é backfillado — o estado actual
-- continua visível na listagem do documento, e daqui para a frente o gatilho
-- apanha a transição.
--
-- Consequência assumida, dita por extenso:
--   · Propostas — created/sent/accepted/rejected: todos têm carimbo próprio.
--   · Contratos — created e signed (signature_date, com accepted_at como
--     alternativa) e cancelled (cancelled_at). Completos.
--   · Orçamentos — created e accepted têm carimbo. O "enviado" vem do primeiro
--     registo em quote_sends, quando existir. REJEITADO e PERDIDO não têm
--     carimbo nenhum na tabela: esses ~481 orçamentos não levam marco de
--     fecho. É a única lacuna, e é deliberada.
--
-- Idempotente por (entity_id, change_type, document_id).
-- Exclusões iguais às dos gatilhos: is_internal / is_manual_order.

-- ── Propostas ───────────────────────────────────────────────────────────────

INSERT INTO public.anew_entity_history
  (entity_id, change_type, field_name, changed_by, metadata, created_at)
SELECT p.entity_id, v.change_type, 'proposal',
       COALESCE(p.assigned_to, p.created_by),
       jsonb_build_object(
         'document_id', p.id, 'number', p.proposal_number, 'title', p.title,
         'total', p.value, 'currency', COALESCE(p.currency, 'EUR'),
         'backfilled', true
       ),
       v.at
  FROM public.proposals p
  CROSS JOIN LATERAL (
    VALUES
      ('proposal_created',  p.created_at),
      ('proposal_sent',     p.sent_at),
      ('proposal_accepted', p.accepted_at),
      ('proposal_rejected', p.rejected_at)
  ) AS v(change_type, at)
 WHERE p.deleted_at IS NULL
   AND p.entity_id IS NOT NULL
   AND v.at IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.anew_entity_history h
      WHERE h.entity_id = p.entity_id
        AND h.change_type = v.change_type
        AND h.metadata ->> 'document_id' = p.id::text
   );

-- ── Contratos (exclui os sintéticos da venda direta/encomenda manual) ───────

INSERT INTO public.anew_entity_history
  (entity_id, change_type, field_name, changed_by, metadata, created_at)
SELECT c.entity_id, v.change_type, 'contract',
       c.created_by,
       jsonb_build_object(
         'document_id', c.id, 'number', c.contract_number,
         'total', c.total_value, 'currency', COALESCE(c.currency, 'EUR'),
         'backfilled', true
       ),
       v.at
  FROM public.client_contracts c
  CROSS JOIN LATERAL (
    VALUES
      ('contract_created',   c.created_at),
      ('contract_signed',    COALESCE(c.signature_date, c.accepted_at)),
      ('contract_cancelled', c.cancelled_at)
  ) AS v(change_type, at)
 WHERE c.deleted_at IS NULL
   AND c.entity_id IS NOT NULL
   AND COALESCE(c.is_manual_order, false) = false
   AND v.at IS NOT NULL
   -- Só se marca como assinado o que realmente chegou a esse estado: um
   -- signature_date preenchido num contrato cancelado não é uma assinatura.
   AND (v.change_type <> 'contract_signed' OR c.status IN ('signed', 'assinado'))
   AND NOT EXISTS (
     SELECT 1 FROM public.anew_entity_history h
      WHERE h.entity_id = c.entity_id
        AND h.change_type = v.change_type
        AND h.metadata ->> 'document_id' = c.id::text
   );

-- ── Orçamentos: criado e aceite (exclui os internos) ────────────────────────

INSERT INTO public.anew_entity_history
  (entity_id, change_type, field_name, changed_by, metadata, created_at)
SELECT q.entity_id, v.change_type, 'quote',
       COALESCE(q.assigned_to, q.created_by),
       jsonb_build_object(
         'document_id', q.id, 'number', q.quote_number, 'title', q.title,
         'total', q.total, 'currency', COALESCE(q.moeda, 'EUR'),
         'backfilled', true
       ),
       v.at
  FROM public.quotes q
  CROSS JOIN LATERAL (
    VALUES
      ('quote_created',  q.created_at),
      ('quote_accepted', q.accepted_at)
  ) AS v(change_type, at)
 WHERE q.deleted_at IS NULL
   AND q.entity_id IS NOT NULL
   AND COALESCE(q.is_internal, false) = false
   AND v.at IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.anew_entity_history h
      WHERE h.entity_id = q.entity_id
        AND h.change_type = v.change_type
        AND h.metadata ->> 'document_id' = q.id::text
   );

-- ── Orçamentos: enviado, datado pelo primeiro envio registado ───────────────

INSERT INTO public.anew_entity_history
  (entity_id, change_type, field_name, changed_by, metadata, created_at)
SELECT q.entity_id, 'quote_sent', 'quote',
       COALESCE(q.assigned_to, q.created_by),
       jsonb_build_object(
         'document_id', q.id, 'number', q.quote_number, 'title', q.title,
         'total', q.total, 'currency', COALESCE(q.moeda, 'EUR'),
         'backfilled', true
       ),
       s.first_sent
  FROM public.quotes q
  JOIN LATERAL (
    SELECT min(qs.created_at) AS first_sent
      FROM public.quote_sends qs
     WHERE qs.quote_id = q.id
  ) s ON s.first_sent IS NOT NULL
 WHERE q.deleted_at IS NULL
   AND q.entity_id IS NOT NULL
   AND COALESCE(q.is_internal, false) = false
   AND NOT EXISTS (
     SELECT 1 FROM public.anew_entity_history h
      WHERE h.entity_id = q.entity_id
        AND h.change_type = 'quote_sent'
        AND h.metadata ->> 'document_id' = q.id::text
   );
