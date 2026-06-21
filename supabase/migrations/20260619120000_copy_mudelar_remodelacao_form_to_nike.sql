-- Copy the Mudelar "Remodelação" form to Nike.
-- Scope: the visual layer (form_branding), the steps (form_steps), and the
-- field mappings (form_fields: field_key/label/type + contact_field_mapping/
-- client_field_mapping). Campaign tables (campaign_form_sections,
-- campaign_form_steps) and tracking pixels (form_tracking_pixels) are
-- intentionally NOT copied.
-- Any occurrence of "Mudelar" in copied text is replaced with "Nike".
-- Idempotency: re-running this does nothing if a form with the resulting
-- name already exists in Nike.

DO $$
DECLARE
  v_source_org_id uuid;
  v_target_org_id uuid;
  v_target_creator_id uuid;
  v_source_form_id uuid;
  v_source_form_name text;
  v_source_form_slug text;
  v_new_form_id uuid;
  v_new_form_name text;
  v_new_form_slug text;
  v_field_count integer;
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
    RAISE EXCEPTION 'Organization nike has no active member to own the copied form';
  END IF;

  SELECT id, name, slug
    INTO STRICT v_source_form_id, v_source_form_name, v_source_form_slug
  FROM public.forms
  WHERE organization_id = v_source_org_id
    AND name ILIKE '%remodela%'
  ORDER BY created_at
  LIMIT 1;

  v_new_form_name := regexp_replace(v_source_form_name, 'mudelar', 'Nike', 'gi');
  v_new_form_slug := regexp_replace(v_source_form_slug, 'mudelar', 'nike', 'gi') || '-nike';

  IF EXISTS (
    SELECT 1 FROM public.forms
    WHERE organization_id = v_target_org_id
      AND lower(btrim(name)) = lower(btrim(v_new_form_name))
  ) THEN
    RAISE NOTICE 'Form "%" already exists in nike, skipping.', v_new_form_name;
    RETURN;
  END IF;

  INSERT INTO public.forms (
    organization_id,
    name,
    description,
    slug,
    is_active,
    is_primary,
    form_type,
    settings,
    branding,
    created_by,
    country_code,
    location_required,
    iframe_enabled,
    gtm_id
  )
  SELECT
    v_target_org_id,
    v_new_form_name,
    regexp_replace(source.description, 'mudelar', 'Nike', 'gi'),
    v_new_form_slug,
    source.is_active,
    false,
    source.form_type,
    source.settings,
    source.branding,
    v_target_creator_id,
    source.country_code,
    source.location_required,
    source.iframe_enabled,
    source.gtm_id
  FROM public.forms AS source
  WHERE source.id = v_source_form_id
  RETURNING id INTO v_new_form_id;

  INSERT INTO public.form_steps (
    form_id,
    step_number,
    step_title,
    step_description,
    step_subtitle,
    next_button_text,
    previous_button_text,
    submit_button_text,
    sort_order,
    step_type,
    scheduling_duration_minutes,
    scheduling_board_id,
    scheduling_postal_code_field_key
  )
  SELECT
    v_new_form_id,
    source.step_number,
    regexp_replace(source.step_title, 'mudelar', 'Nike', 'gi'),
    regexp_replace(source.step_description, 'mudelar', 'Nike', 'gi'),
    regexp_replace(source.step_subtitle, 'mudelar', 'Nike', 'gi'),
    source.next_button_text,
    source.previous_button_text,
    source.submit_button_text,
    source.sort_order,
    source.step_type,
    source.scheduling_duration_minutes,
    NULL, -- scheduling_board_id belongs to Mudelar's org scope, do not carry it over
    source.scheduling_postal_code_field_key
  FROM public.form_steps AS source
  WHERE source.form_id = v_source_form_id;

  INSERT INTO public.form_branding (
    form_id,
    logo_url,
    favicon_url,
    background_image_url,
    primary_color,
    secondary_color,
    background_color,
    text_color,
    button_text_color,
    accent_color,
    icon_color,
    icon_selected_color,
    font_family,
    heading_font_family,
    form_title,
    form_subtitle,
    submit_button_text,
    next_button_text,
    previous_button_text,
    continue_button_text,
    back_button_text,
    success_title,
    success_message,
    success_redirect_url,
    success_redirect_delay_seconds,
    show_step_indicator,
    show_step_titles,
    show_progress_bar,
    progress_indicator_style,
    step_counter_style,
    card_style,
    border_radius,
    custom_css,
    footer_text,
    privacy_policy_url,
    terms_url,
    privacy_policy_label,
    terms_label,
    location_rejection_message,
    loading_text,
    error_title,
    error_message,
    redirecting_text,
    seconds_text,
    step_text,
    of_text,
    required_field_label,
    select_placeholder,
    multi_select_placeholder,
    date_placeholder,
    form_error_title,
    form_error_message,
    validation_error_text,
    location_not_available_title,
    thank_you_text,
    contact_soon_text,
    step_loading_text,
    submitting_text,
    back_button_bg_color,
    back_button_text_color,
    back_button_border_color,
    back_button_hover_bg_color,
    radio_button_color,
    input_border_radius,
    input_border_width,
    input_border_color,
    input_focus_border_color,
    input_background_color,
    input_padding,
    input_font_size,
    card_border_radius,
    card_border_width,
    card_border_color,
    card_icon_size,
    card_icon_border_radius,
    card_padding,
    card_min_height,
    radio_border_radius,
    radio_border_width,
    radio_circle_size,
    radio_inner_size,
    radio_padding,
    checkbox_border_radius,
    checkbox_border_width,
    checkbox_size,
    checkbox_padding,
    button_option_border_radius,
    button_option_border_width,
    button_option_padding,
    nav_button_border_radius,
    nav_button_padding,
    nav_button_font_size,
    step_border_radius,
    step_padding,
    step_border_width,
    step_border_color,
    step_shadow,
    info_block_border_radius,
    info_block_padding,
    info_block_background_opacity,
    progress_bar_height,
    progress_bar_border_radius,
    select_border_radius,
    select_border_width,
    success_icon_size,
    success_border_radius,
    error_display_style,
    success_display_style,
    created_by,
    show_form_title,
    iframe_flush_embed,
    container_padding_x,
    container_padding_y,
    layout_config
  )
  SELECT
    v_new_form_id,
    source.logo_url,
    source.favicon_url,
    source.background_image_url,
    source.primary_color,
    source.secondary_color,
    source.background_color,
    source.text_color,
    source.button_text_color,
    source.accent_color,
    source.icon_color,
    source.icon_selected_color,
    source.font_family,
    source.heading_font_family,
    regexp_replace(source.form_title, 'mudelar', 'Nike', 'gi'),
    regexp_replace(source.form_subtitle, 'mudelar', 'Nike', 'gi'),
    source.submit_button_text,
    source.next_button_text,
    source.previous_button_text,
    source.continue_button_text,
    source.back_button_text,
    source.success_title,
    regexp_replace(source.success_message, 'mudelar', 'Nike', 'gi'),
    source.success_redirect_url,
    source.success_redirect_delay_seconds,
    source.show_step_indicator,
    source.show_step_titles,
    source.show_progress_bar,
    source.progress_indicator_style,
    source.step_counter_style,
    source.card_style,
    source.border_radius,
    regexp_replace(source.custom_css, 'mudelar', 'nike', 'gi'),
    regexp_replace(source.footer_text, 'mudelar', 'Nike', 'gi'),
    source.privacy_policy_url,
    source.terms_url,
    source.privacy_policy_label,
    source.terms_label,
    source.location_rejection_message,
    source.loading_text,
    source.error_title,
    regexp_replace(source.error_message, 'mudelar', 'Nike', 'gi'),
    source.redirecting_text,
    source.seconds_text,
    source.step_text,
    source.of_text,
    source.required_field_label,
    source.select_placeholder,
    source.multi_select_placeholder,
    source.date_placeholder,
    source.form_error_title,
    regexp_replace(source.form_error_message, 'mudelar', 'Nike', 'gi'),
    source.validation_error_text,
    source.location_not_available_title,
    regexp_replace(source.thank_you_text, 'mudelar', 'Nike', 'gi'),
    regexp_replace(source.contact_soon_text, 'mudelar', 'Nike', 'gi'),
    source.step_loading_text,
    source.submitting_text,
    source.back_button_bg_color,
    source.back_button_text_color,
    source.back_button_border_color,
    source.back_button_hover_bg_color,
    source.radio_button_color,
    source.input_border_radius,
    source.input_border_width,
    source.input_border_color,
    source.input_focus_border_color,
    source.input_background_color,
    source.input_padding,
    source.input_font_size,
    source.card_border_radius,
    source.card_border_width,
    source.card_border_color,
    source.card_icon_size,
    source.card_icon_border_radius,
    source.card_padding,
    source.card_min_height,
    source.radio_border_radius,
    source.radio_border_width,
    source.radio_circle_size,
    source.radio_inner_size,
    source.radio_padding,
    source.checkbox_border_radius,
    source.checkbox_border_width,
    source.checkbox_size,
    source.checkbox_padding,
    source.button_option_border_radius,
    source.button_option_border_width,
    source.button_option_padding,
    source.nav_button_border_radius,
    source.nav_button_padding,
    source.nav_button_font_size,
    source.step_border_radius,
    source.step_padding,
    source.step_border_width,
    source.step_border_color,
    source.step_shadow,
    source.info_block_border_radius,
    source.info_block_padding,
    source.info_block_background_opacity,
    source.progress_bar_height,
    source.progress_bar_border_radius,
    source.select_border_radius,
    source.select_border_width,
    source.success_icon_size,
    source.success_border_radius,
    source.error_display_style,
    source.success_display_style,
    v_target_creator_id,
    source.show_form_title,
    source.iframe_flush_embed,
    source.container_padding_x,
    source.container_padding_y,
    source.layout_config
  FROM public.form_branding AS source
  WHERE source.form_id = v_source_form_id;

  INSERT INTO public.form_fields (
    form_id,
    step_number,
    field_key,
    field_label,
    field_type,
    is_required,
    is_unique,
    is_active,
    placeholder,
    help_text,
    options,
    display_style,
    min_length,
    max_length,
    min_value,
    max_value,
    pattern,
    pattern_message,
    contact_field_mapping,
    client_field_mapping,
    sort_order,
    created_by,
    option_icon_names
  )
  SELECT
    v_new_form_id,
    source.step_number,
    source.field_key,
    regexp_replace(source.field_label, 'mudelar', 'Nike', 'gi'),
    source.field_type,
    source.is_required,
    source.is_unique,
    source.is_active,
    source.placeholder,
    source.help_text,
    source.options,
    source.display_style,
    source.min_length,
    source.max_length,
    source.min_value,
    source.max_value,
    source.pattern,
    source.pattern_message,
    source.contact_field_mapping,
    source.client_field_mapping,
    source.sort_order,
    v_target_creator_id,
    source.option_icon_names
  FROM public.form_fields AS source
  WHERE source.form_id = v_source_form_id;

  SELECT count(*)
    INTO v_field_count
  FROM public.form_fields
  WHERE form_id = v_new_form_id;

  RAISE NOTICE
    'Form "%" copied to nike as "%" (id=%) with % fields (steps, branding and field mappings copied; campaigns and tracking pixels skipped).',
    v_source_form_name, v_new_form_name, v_new_form_id, v_field_count;
END
$$;
