-- TEMPORARY diagnostic function, to be dropped in a follow-up migration once
-- the compute_proposal_business_hash discrepancy (fresh hash not reflecting a
-- real quote_lines.qt change) is root-caused. Not part of any feature.
CREATE OR REPLACE FUNCTION public._debug_proposal_hash_payload(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payload jsonb;
BEGIN
  SELECT jsonb_build_object(
    'proposal', jsonb_build_object(
      'id', p.id, 'title', p.title, 'description', p.description, 'value', p.value,
      'valid_until', p.valid_until, 'notes', p.notes, 'currency', p.currency,
      'client_id', p.client_id, 'entity_id', p.entity_id, 'deal_id', p.deal_id,
      'template_id', p.template_id
    ),
    'quotes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', q.id, 'proposal_id', q.proposal_id,
        'lines', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('id', ql.id, 'quote_id', ql.quote_id, 'qt', ql.qt))
          FROM public.quote_lines ql WHERE ql.quote_id = q.id
        ), '[]'::jsonb)
      ) ORDER BY q.id)
      FROM public.quotes q WHERE q.proposal_id = p.id AND q.deleted_at IS NULL
    ), '[]'::jsonb)
  )
  INTO v_payload
  FROM public.proposals p
  WHERE p.id = p_proposal_id;

  RETURN v_payload;
END;
$function$;

REVOKE ALL ON FUNCTION public._debug_proposal_hash_payload(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._debug_proposal_hash_payload(uuid) TO authenticated, service_role;
