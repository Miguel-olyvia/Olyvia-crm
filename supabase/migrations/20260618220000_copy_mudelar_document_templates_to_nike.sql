-- Copy Mudelar document templates to nike.
-- Scope: proposal_templates (quote/proposal PDF layouts) and
-- client_contract_templates only. Quick quote models are intentionally excluded.
-- Idempotency: an existing destination template with the same normalized name
-- and type is preserved.

DO $$
DECLARE
  v_source_org_id uuid;
  v_target_org_id uuid;
  v_target_creator_id uuid;
  v_quote_count integer;
  v_proposal_count integer;
  v_contract_count integer;
BEGIN
  SELECT id
    INTO STRICT v_source_org_id
  FROM public.anew_organizations
  WHERE lower(btrim(name)) = 'mudelar';

  SELECT id
    INTO STRICT v_target_org_id
  FROM public.anew_organizations
  WHERE lower(btrim(name)) = 'nike';

  SELECT m.user_id
    INTO v_target_creator_id
  FROM public.anew_memberships AS m
  WHERE m.organization_id = v_target_org_id
    AND m.status = 'active'
  ORDER BY m.accepted_at NULLS LAST, m.created_at, m.id
  LIMIT 1;

  IF v_target_creator_id IS NULL THEN
    RAISE EXCEPTION 'Organization nike has no active member to own the copied templates';
  END IF;

  INSERT INTO public.proposal_templates (
    organization_id,
    name,
    description,
    logo_url,
    primary_color,
    secondary_color,
    accent_color,
    background_color,
    text_color,
    font_family,
    heading_font_family,
    header_style,
    show_company_info,
    show_client_info,
    show_validity,
    show_terms,
    header_text,
    footer_text,
    terms_conditions,
    thank_you_message,
    is_default,
    is_active,
    created_at,
    updated_at,
    created_by,
    accept_enabled,
    accept_verification_method,
    show_quote_details,
    email_subject,
    email_body,
    verification_email_subject,
    verification_email_body,
    sections,
    design_settings,
    template_type
  )
  SELECT
    v_target_org_id,
    source.name,
    source.description,
    source.logo_url,
    source.primary_color,
    source.secondary_color,
    source.accent_color,
    source.background_color,
    source.text_color,
    source.font_family,
    source.heading_font_family,
    source.header_style,
    source.show_company_info,
    source.show_client_info,
    source.show_validity,
    source.show_terms,
    source.header_text,
    source.footer_text,
    source.terms_conditions,
    source.thank_you_message,
    false,
    source.is_active,
    now(),
    now(),
    v_target_creator_id,
    source.accept_enabled,
    source.accept_verification_method,
    source.show_quote_details,
    source.email_subject,
    source.email_body,
    source.verification_email_subject,
    source.verification_email_body,
    source.sections,
    source.design_settings,
    source.template_type
  FROM public.proposal_templates AS source
  WHERE source.organization_id = v_source_org_id
    AND source.template_type IN ('quote', 'proposal')
    AND NOT EXISTS (
      SELECT 1
      FROM public.proposal_templates AS target
      WHERE target.organization_id = v_target_org_id
        AND target.template_type = source.template_type
        AND lower(btrim(target.name)) = lower(btrim(source.name))
    );

  INSERT INTO public.client_contract_templates (
    name,
    description,
    language,
    body_html,
    is_active,
    created_at,
    updated_at,
    created_by,
    primary_color,
    secondary_color,
    text_color,
    background_color,
    logo_url,
    header_text,
    footer_text,
    show_proposal_details,
    show_total_value,
    organization_id,
    is_default,
    signatory_user_id,
    signatory_role_id,
    doc_settings
  )
  SELECT
    source.name,
    source.description,
    source.language,
    source.body_html,
    source.is_active,
    now(),
    now(),
    v_target_creator_id,
    source.primary_color,
    source.secondary_color,
    source.text_color,
    source.background_color,
    source.logo_url,
    source.header_text,
    source.footer_text,
    source.show_proposal_details,
    source.show_total_value,
    v_target_org_id,
    false,
    NULL,
    NULL,
    source.doc_settings
  FROM public.client_contract_templates AS source
  WHERE source.organization_id = v_source_org_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.client_contract_templates AS target
      WHERE target.organization_id = v_target_org_id
        AND lower(btrim(target.name)) = lower(btrim(source.name))
    );

  SELECT count(*) FILTER (WHERE template_type = 'quote'),
         count(*) FILTER (WHERE template_type = 'proposal')
    INTO v_quote_count, v_proposal_count
  FROM public.proposal_templates
  WHERE organization_id = v_target_org_id
    AND EXISTS (
      SELECT 1
      FROM public.proposal_templates AS source
      WHERE source.organization_id = v_source_org_id
        AND source.template_type = proposal_templates.template_type
        AND lower(btrim(source.name)) = lower(btrim(proposal_templates.name))
    );

  SELECT count(*)
    INTO v_contract_count
  FROM public.client_contract_templates AS target
  WHERE target.organization_id = v_target_org_id
    AND EXISTS (
      SELECT 1
      FROM public.client_contract_templates AS source
      WHERE source.organization_id = v_source_org_id
        AND lower(btrim(source.name)) = lower(btrim(target.name))
    );

  IF v_quote_count <> 7 OR v_proposal_count <> 6 OR v_contract_count <> 4 THEN
    RAISE EXCEPTION
      'Template copy validation failed: expected quote=7, proposal=6, contract=4; got quote=%, proposal=%, contract=%',
      v_quote_count, v_proposal_count, v_contract_count;
  END IF;

  RAISE NOTICE
    'Mudelar templates available in nike: quote=%, proposal=%, contract=%',
    v_quote_count, v_proposal_count, v_contract_count;
END
$$;
