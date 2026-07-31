-- Allow a SIGNED (or draft/active) client contract to be cancelled without
-- being deleted, and optionally generate a replacement DRAFT contract from
-- the same proposal so the client's current data can be applied to it.

ALTER TABLE public.client_contracts
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS replaced_by_contract_id uuid
    REFERENCES public.client_contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS replaces_contract_id uuid
    REFERENCES public.client_contracts(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.cancel_and_replace_contract(
  p_contract_id uuid,
  p_reason text,
  p_create_replacement boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org_id uuid;
  v_status text;
  v_deleted_at timestamptz;
  v_actor uuid := public.resolve_business_user_id(auth.uid());
  v_new_contract_id uuid;
BEGIN
  SELECT organization_id, status, deleted_at
  INTO v_org_id, v_status, v_deleted_at
  FROM public.client_contracts
  WHERE id = p_contract_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contract_not_found';
  END IF;

  IF v_org_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'contract_not_found';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'client_contracts.edit') THEN
    RAISE EXCEPTION 'insufficient_permission';
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'contract_already_deleted';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'contract_already_cancelled';
  END IF;

  IF v_status NOT IN ('signed', 'active', 'draft') THEN
    RAISE EXCEPTION 'contract_not_cancellable';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  UPDATE public.client_contracts
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_actor,
      cancellation_reason = p_reason,
      status_changed_by = v_actor,
      status_changed_at = now()
  WHERE id = p_contract_id;

  IF p_create_replacement THEN
    INSERT INTO public.client_contracts (
      client_id, entity_id, proposal_id, quote_id, contract_template_id,
      template_id, organization_id, root_organization_id, payment_terms,
      notes, prompt_values, currency, status, contract_body_html,
      replaces_contract_id, created_by
    )
    SELECT
      client_id, entity_id, proposal_id, quote_id, contract_template_id,
      template_id, organization_id, root_organization_id, payment_terms,
      notes, prompt_values, currency, 'draft', NULL,
      id, v_actor
    FROM public.client_contracts
    WHERE id = p_contract_id
    RETURNING id INTO v_new_contract_id;

    UPDATE public.client_contracts
    SET replaced_by_contract_id = v_new_contract_id
    WHERE id = p_contract_id;

    INSERT INTO public.client_contract_events (
      contract_id, event_type, description, new_values, created_by
    ) VALUES (
      p_contract_id, 'contract_cancelled', p_reason,
      jsonb_build_object('replacement_contract_id', v_new_contract_id),
      v_actor
    );

    INSERT INTO public.client_contract_events (
      contract_id, event_type, description, new_values, created_by
    ) VALUES (
      v_new_contract_id, 'contract_replaced', 'Contrato de substituicao criado',
      jsonb_build_object('replaces_contract_id', p_contract_id),
      v_actor
    );
  ELSE
    INSERT INTO public.client_contract_events (
      contract_id, event_type, description, new_values, created_by
    ) VALUES (
      p_contract_id, 'contract_cancelled', p_reason,
      jsonb_build_object('replacement_contract_id', NULL),
      v_actor
    );
  END IF;

  RETURN jsonb_build_object(
    'cancelled_contract_id', p_contract_id,
    'replacement_contract_id', v_new_contract_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_and_replace_contract(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_and_replace_contract(uuid, text, boolean) TO authenticated, service_role;
