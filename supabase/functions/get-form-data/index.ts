import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Get Form Data API v2
 * 
 * PUBLIC endpoint - Returns the form structure for a form or campaign including:
 * - Form fields (with option_icon_names)
 * - Branding settings
 * - System entity options
 * 
 * GET /get-form-data?form_id=xxx
 * GET /get-form-data?campaign_id=xxx (backwards compatibility)
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const formId = url.searchParams.get("form_id");
    const campaignId = url.searchParams.get("campaign_id");
    const requestedLang = (url.searchParams.get("lang") || "").toLowerCase().trim() || null;

    // ----- i18n helpers -----
    type I18nNode = { default_locale?: string; enabled_locales?: string[]; content?: any } | null | undefined;

    const normalizeLocale = (l: string | null | undefined): string | null => {
      if (!l) return null;
      return String(l).toLowerCase().split(/[-_]/)[0] || null;
    };

    /**
     * Resolve a translated value with fallback chain: requested -> default -> base.
     * Tries exact match, then language-only (e.g. "pt-PT" -> "pt").
     */
    const pick = (
      bag: Record<string, any> | undefined | null,
      requested: string | null,
      defaultLocale: string | null,
      key: string
    ): any => {
      if (!bag) return undefined;
      const candidates: string[] = [];
      if (requested) {
        candidates.push(requested);
        const short = normalizeLocale(requested);
        if (short && short !== requested) candidates.push(short);
      }
      if (defaultLocale && !candidates.includes(defaultLocale)) candidates.push(defaultLocale);
      for (const loc of candidates) {
        const node = bag[loc];
        if (node && typeof node === "object" && node[key] !== undefined && node[key] !== null && node[key] !== "") {
          return node[key];
        }
      }
      return undefined;
    };

    const resolveText = (base: any, bag: any, requested: string | null, defaultLocale: string | null, key: string) => {
      const v = pick(bag, requested, defaultLocale, key);
      return v !== undefined ? v : base;
    };

    /**
     * Translate field options. Supports:
     *   - string[]                                  -> map by index id
     *   - { id, label, ... }[]                      -> map by id
     * i18nOptions shape (per locale): { "<id|index>": "Translated label" }
     */
    const resolveOptions = (
      baseOptions: any,
      fieldI18n: any,
      requested: string | null,
      defaultLocale: string | null
    ): any => {
      if (!baseOptions) return baseOptions;
      const tryGet = (loc: string | null, id: string): string | undefined => {
        if (!loc || !fieldI18n) return undefined;
        const node = fieldI18n[loc];
        const opts = node && typeof node === "object" ? node.options : undefined;
        return opts && typeof opts === "object" ? opts[id] : undefined;
      };
      const lookup = (id: string): string | undefined => {
        if (requested) {
          const v = tryGet(requested, id);
          if (v) return v;
          const short = normalizeLocale(requested);
          if (short && short !== requested) {
            const v2 = tryGet(short, id);
            if (v2) return v2;
          }
        }
        if (defaultLocale) return tryGet(defaultLocale, id);
        return undefined;
      };

      const translateArray = (arr: any[]): any[] =>
        arr.map((opt: any, idx: number) => {
          if (typeof opt === "string") {
            const id = String(idx);
            const translated = lookup(id);
            return translated || opt;
          }
          if (opt && typeof opt === "object") {
            const id = String(opt.id ?? opt.value ?? idx);
            const translated = lookup(id);
            if (translated) return { ...opt, label: translated };
            return opt;
          }
          return opt;
        });

      // Field options are stored as { options: [...], entity_ids: [...] } in DB,
      // but legacy/ref fields may pass a bare array. Handle both.
      if (Array.isArray(baseOptions)) return translateArray(baseOptions);
      if (typeof baseOptions === "object" && Array.isArray(baseOptions.options)) {
        return { ...baseOptions, options: translateArray(baseOptions.options) };
      }
      return baseOptions;
    };

    if (!formId && !campaignId) {
      return new Response(
        JSON.stringify({ error: "form_id or campaign_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let form: any = null;
    let resolvedFormId = formId;
    let campaign: any = null;

    let defaultSourceId: string | null = null;
    
    // If campaignId provided, get the form from the campaign
    if (campaignId && !formId) {
      const { data: campaignData, error: campaignError } = await supabase
        .from("campaigns")
        .select("id, name, description, organization_id, status, form_id, location_required")
        .eq("id", campaignId)
        .single();

      if (campaignError || !campaignData) {
        return new Response(
          JSON.stringify({ error: "Campaign not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (campaignData.status !== "active") {
        return new Response(
          JSON.stringify({ error: "Campaign is not active", status: campaignData.status }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      campaign = campaignData;
      resolvedFormId = campaignData.form_id;

      if (!resolvedFormId) {
        return new Response(
          JSON.stringify({ error: "Campaign has no form associated" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get default source for this campaign
      const { data: defaultSource } = await supabase
        .from("campaign_sources")
        .select("source_id")
        .eq("campaign_id", campaignId)
        .eq("is_default", true)
        .maybeSingle();
      
      if (defaultSource) {
        defaultSourceId = defaultSource.source_id;
      }
    } else if (formId) {
      // When loading by form_id directly, try to find a campaign that uses this form
      // so we can resolve default source
      const { data: campaignForForm } = await supabase
        .from("campaigns")
        .select("id, name, description, organization_id, status, form_id, location_required")
        .eq("form_id", formId)
        .eq("status", "active")
        .maybeSingle();

      if (campaignForForm) {
        campaign = campaignForForm;

        const { data: defaultSource } = await supabase
          .from("campaign_sources")
          .select("source_id")
          .eq("campaign_id", campaignForForm.id)
          .eq("is_default", true)
          .maybeSingle();

        if (defaultSource) {
          defaultSourceId = defaultSource.source_id;
        }
      }
    }

    // Get form info
    const { data: formData, error: formError } = await supabase
      .from("forms")
      .select("id, name, slug, organization_id, form_type, is_active, is_primary, location_required, country_code, iframe_enabled, gtm_id, settings")
      .eq("id", resolvedFormId)
      .single();

    if (formError || !formData) {
      return new Response(
        JSON.stringify({ error: "Form not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!formData.is_active) {
      return new Response(
        JSON.stringify({ error: "Form is not active" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    form = formData;

    // ----- i18n setup (server-side resolve) -----
    const i18nNode: I18nNode = (form.settings && typeof form.settings === "object")
      ? (form.settings.i18n ?? null)
      : null;
    const defaultLocale: string | null = (i18nNode?.default_locale && typeof i18nNode.default_locale === "string")
      ? i18nNode.default_locale.toLowerCase()
      : null;
    const enabledLocales: string[] = Array.isArray(i18nNode?.enabled_locales)
      ? i18nNode!.enabled_locales!.map((l) => String(l).toLowerCase())
      : [];
    // Only honor requested lang if enabled (or no enabled_locales configured -> permissive)
    const requestedShort = normalizeLocale(requestedLang);
    let activeLocale: string | null = null;
    if (requestedLang) {
      if (!enabledLocales.length) {
        activeLocale = requestedLang;
      } else if (enabledLocales.includes(requestedLang) || (requestedShort && enabledLocales.includes(requestedShort))) {
        activeLocale = requestedLang;
      }
    }
    const i18nContent: any = i18nNode?.content || null;
    const formI18n = i18nContent?.form || null;
    const stepsI18n = i18nContent?.steps || null;
    const fieldsI18n = i18nContent?.fields || null;
    const brandingI18n = i18nContent?.branding || null;


    // Get allowed districts - prioritize campaign location rules over form
    let allowedDistricts: { id: string; name: string; code: string }[] = [];
    const locationRequired = campaign?.location_required || form.location_required;
    
    if (locationRequired) {
      // If campaign has location_required, use campaign_districts
      if (campaign?.location_required) {
        const { data: campaignDistricts } = await supabase
          .from("campaign_districts")
          .select("district_id")
          .eq("campaign_id", campaign.id);

        if (campaignDistricts && campaignDistricts.length > 0) {
          const districtIds = campaignDistricts.map((cd: any) => cd.district_id);
          const { data: districts } = await supabase
            .from("administrative_divisions")
            .select("id, name, code")
            .in("id", districtIds);
          
          allowedDistricts = (districts || []).map((d: any) => ({
            id: d.id,
            name: d.name,
            code: d.code
          }));
        }
      } else if (form.location_required) {
        // Otherwise use form_districts
        const { data: formDistricts } = await supabase
          .from("form_districts")
          .select("district_id")
          .eq("form_id", form.id);

        if (formDistricts && formDistricts.length > 0) {
          const districtIds = formDistricts.map((fd: any) => fd.district_id);
          const { data: districts } = await supabase
            .from("administrative_divisions")
            .select("id, name, code")
            .in("id", districtIds);
          
          allowedDistricts = (districts || []).map((d: any) => ({
            id: d.id,
            name: d.name,
            code: d.code
          }));
        }
      }
    }

    // Get form branding
    const { data: branding } = await supabase
      .from("form_branding")
      .select("*")
      .eq("form_id", form.id)
      .maybeSingle();

    // Get form fields - explicit columns to avoid any schema cache issues with option_icon_names
    const { data: fields, error: fieldsError } = await supabase
      .from("form_fields")
      .select("id, form_id, field_key, field_label, field_type, is_required, is_active, sort_order, step_number, options, placeholder, help_text, min_length, max_length, display_style, contact_field_mapping, client_field_mapping, option_icon_names")
      .eq("form_id", form.id)
      .eq("is_active", true)
      .order("step_number")
      .order("sort_order");

    if (fieldsError) {
      console.error("Error fetching fields:", fieldsError);
      return new Response(
        JSON.stringify({ error: "Error fetching form fields" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Collect unique system entity types
    const systemEntityTypes = new Set<string>();
    (fields || []).forEach((field: any) => {
      if (field.field_type?.startsWith('ref_')) {
        const entityType = field.field_type.replace('ref_', '') + 's';
        systemEntityTypes.add(entityType);
      }
    });

    // Fetch system entities
    const systemEntities: Record<string, any[]> = {};
    const companyId = form.organization_id;

    for (const entityType of systemEntityTypes) {
      try {
        let entityData: any[] = [];
        
        switch (entityType) {
          case 'services':
            const { data: services } = await supabase
              .from('services')
              .select('id, name, description, price')
              .eq('organization_id', companyId)
              .eq('is_active', true)
              .order('name');
            entityData = (services || []).map(s => ({
              id: s.id,
              name: s.name,
              label: s.name,
            }));
            break;
            
          case 'products':
            const { data: products } = await supabase
              .from('products')
              .select('id, name, description, price')
              .eq('organization_id', companyId)
              .eq('is_active', true)
              .order('name');
            entityData = (products || []).map(p => ({
              id: p.id,
              name: p.name,
              label: p.name,
            }));
            break;
            
          case 'business_units': {
            // Fetch child organizations via hierarchy (replaces legacy business_units table)
            const { data: childOrgs } = await supabase
              .from('anew_hierarchy')
              .select('child_org_id, anew_organizations!anew_hierarchy_child_org_id_fkey(id, name)')
              .eq('parent_org_id', companyId);
            entityData = (childOrgs || [])
              .filter((h: any) => h.anew_organizations)
              .map((h: any) => ({
                id: h.anew_organizations.id,
                name: h.anew_organizations.name,
                label: h.anew_organizations.name,
              }));
            break;
          }
            
          case 'districts':
            let districtQuery = supabase
              .from('administrative_divisions')
              .select('id, name, code, country_code')
              .eq('admin_level', 1)
              .order('name');
            
            if (form.country_code) {
              districtQuery = districtQuery.eq('country_code', form.country_code);
            }
            
            const { data: districts } = await districtQuery;
            entityData = (districts || []).map(d => ({
              id: d.id,
              name: d.name,
              label: d.name,
              code: d.code,
            }));
            break;
        }
        
        systemEntities[entityType] = entityData;
      } catch (err) {
        console.error(`Error fetching ${entityType}:`, err);
        systemEntities[entityType] = [];
      }
    }

    // Get form_steps metadata (step_type, scheduling config)
    const { data: formSteps } = await supabase
      .from("form_steps")
      .select("id, step_number, step_title, step_description, step_type, scheduling_duration_minutes, scheduling_board_id, scheduling_postal_code_field_key")
      .eq("form_id", form.id)
      .order("step_number");

    // Build a map of step metadata
    const stepMetaMap = new Map<number, any>();
    (formSteps || []).forEach((s: any) => {
      stepMetaMap.set(s.step_number, s);
    });

    // Group fields by step
    const fieldStepNumbers = [...new Set((fields || []).map((f: any) => f.step_number || 1))];
    const metaStepNumbers = (formSteps || []).map((s: any) => s.step_number);
    const allStepNumbers = [...new Set([...fieldStepNumbers, ...metaStepNumbers])].sort((a, b) => a - b);
    
    const stepsWithFields = allStepNumbers.map(stepNum => {
      const meta = stepMetaMap.get(stepNum);
      const stepType = meta?.step_type || 'fields';

      const stepFields = stepType === 'fields'
        ? (fields || [])
            .filter((f: any) => (f.step_number || 1) === stepNum)
            .map((f: any) => {
              const perFieldI18n = fieldsI18n?.[f.id] || null;

              // Re-key option_icon_names so it also matches the translated labels.
              // Original keys (in the form's base language) are preserved; we add
              // additional entries keyed by the translated labels for the active locale.
              let resolvedIconNames: Record<string, string> | null = f.option_icon_names || null;
              if (resolvedIconNames && f.options) {
                const baseArr: any[] = Array.isArray(f.options)
                  ? f.options
                  : (Array.isArray(f.options?.options) ? f.options.options : []);
                const translatedOpts = resolveOptions(f.options, perFieldI18n, activeLocale, defaultLocale);
                const translatedArr: any[] = Array.isArray(translatedOpts)
                  ? translatedOpts
                  : (Array.isArray(translatedOpts?.options) ? translatedOpts.options : []);
                const merged: Record<string, string> = { ...resolvedIconNames };
                baseArr.forEach((baseOpt: any, idx: number) => {
                  const baseLabel = typeof baseOpt === "string" ? baseOpt : (baseOpt?.label || baseOpt?.value || baseOpt?.id);
                  const tOpt = translatedArr[idx];
                  const tLabel = typeof tOpt === "string" ? tOpt : (tOpt?.label || tOpt?.value || tOpt?.id);
                  if (baseLabel && tLabel && resolvedIconNames![baseLabel]) {
                    merged[tLabel] = resolvedIconNames![baseLabel];
                  }
                });
                resolvedIconNames = merged;
              }

              const fieldData: any = {
                field_key: f.field_key,
                field_label: resolveText(f.field_label, perFieldI18n, activeLocale, defaultLocale, "label"),
                field_type: f.field_type,
                is_required: f.is_required,
                is_multi_select: f.is_multi_select || false,
                options: resolveOptions(f.options, perFieldI18n, activeLocale, defaultLocale),
                display_style: f.display_style || 'dropdown',
                placeholder: resolveText(f.placeholder, perFieldI18n, activeLocale, defaultLocale, "placeholder"),
                help_text: resolveText(f.help_text, perFieldI18n, activeLocale, defaultLocale, "help_text"),
                min_length: f.min_length,
                max_length: f.max_length,
                contact_field_mapping: f.contact_field_mapping,
                option_icon_names: resolvedIconNames,
                field_icon: f.field_icon || null,
                section_id: f.section_id || null,
              };
              
              // Add entity options for ref fields
              if (f.field_type?.startsWith('ref_')) {
                const entityType = f.field_type.replace('ref_', '') + 's';
                if (systemEntities[entityType]) {
                  fieldData.entity_options = systemEntities[entityType];
                }
              }
              
              return fieldData;
            })
        : []; // scheduling steps have no fields

      const stepI18n = meta?.id ? (stepsI18n?.[meta.id] || null) : null;
      const stepData: any = {
        step_number: stepNum,
        // Preserve empty/null step_title so the public form can hide the heading entirely
        step_title: resolveText(meta?.step_title ?? "", stepI18n, activeLocale, defaultLocale, "title"),
        step_description: resolveText(meta?.step_description ?? null, stepI18n, activeLocale, defaultLocale, "description"),
        step_type: stepType,
        fields: stepFields,
      };

      // Add scheduling config for scheduling steps
      if (stepType === 'scheduling') {
        stepData.scheduling_duration_minutes = meta?.scheduling_duration_minutes || 60;
        stepData.scheduling_board_id = meta?.scheduling_board_id || null;
        stepData.scheduling_postal_code_field_key = meta?.scheduling_postal_code_field_key || null;
      }

      return stepData;
    });

    // If no steps at all, return empty step
    if (stepsWithFields.length === 0) {
      stepsWithFields.push({
        step_number: 1,
        step_title: "",
        step_type: "fields",
        fields: [],
      });
    }

    // Get widget config from company_ai_knowledge
    let widgetOpenByDefault = false;
    if (form.organization_id) {
      const { data: aiKnowledge } = await supabase
        .from("company_ai_knowledge")
        .select("widget_open_by_default")
        .eq("organization_id", form.organization_id)
        .eq("is_active", true)
        .maybeSingle();
      
      if (aiKnowledge?.widget_open_by_default) {
        widgetOpenByDefault = true;
      }
    }

    // Build response
    const response: any = {
      form_id: form.id,
      form_name: resolveText(form.name, formI18n, activeLocale, defaultLocale, "name"),
      form_description: resolveText((form as any).description ?? null, formI18n, activeLocale, defaultLocale, "description"),
      form_slug: form.slug,
      organization_id: form.organization_id,
      form_type: form.form_type,
      total_steps: stepsWithFields.length,
      steps: stepsWithFields,
      location_required: locationRequired,
      allowed_districts: allowedDistricts,
      iframe_enabled: form.iframe_enabled || false,
      gtm_id: form.gtm_id || null,
      widget_open_by_default: widgetOpenByDefault,
      // i18n metadata for clients
      default_locale: defaultLocale,
      enabled_locales: enabledLocales,
      resolved_locale: activeLocale || defaultLocale || null,
    };

    // Add campaign info if available
    if (campaign) {
      response.campaign_id = campaign.id;
      response.campaign_name = campaign.name;
      response.default_source_id = defaultSourceId;
    }

    // Add branding if exists
    if (branding) {
      const rb = (k: string, base: any) => resolveText(base, brandingI18n, activeLocale, defaultLocale, k);
      response.branding = {
        logo_url: branding.logo_url,
        favicon_url: branding.favicon_url,
        background_image_url: branding.background_image_url,
        primary_color: branding.primary_color,
        secondary_color: branding.secondary_color,
        background_color: branding.background_color,
        text_color: branding.text_color,
        button_text_color: branding.button_text_color,
        accent_color: branding.accent_color,
        font_family: branding.font_family,
        heading_font_family: branding.heading_font_family,
        form_title: rb("form_title", branding.form_title),
        form_subtitle: rb("form_subtitle", branding.form_subtitle),
        submit_button_text: rb("submit_button_text", branding.submit_button_text),
        next_button_text: rb("next_button_text", branding.next_button_text),
        previous_button_text: rb("previous_button_text", branding.previous_button_text),
        success_title: rb("success_title", branding.success_title),
        success_message: rb("success_message", branding.success_message),
        success_redirect_url: branding.success_redirect_url,
        success_redirect_delay_seconds: branding.success_redirect_delay_seconds,
        show_step_indicator: branding.show_step_indicator,
        show_progress_bar: branding.show_progress_bar,
        custom_css: branding.custom_css,
        footer_text: rb("footer_text", branding.footer_text),
        privacy_policy_url: branding.privacy_policy_url,
        terms_url: branding.terms_url,
        border_radius: branding.border_radius,
        iframe_flush_embed: branding.iframe_flush_embed ?? false,
        container_padding_x: branding.container_padding_x ?? "",
        container_padding_y: branding.container_padding_y ?? "",
        show_form_title: branding.show_form_title ?? true,
      };
    }

    // Get tracking pixels
    const { data: trackingPixels } = await supabase
      .from("form_tracking_pixels")
      .select("pixel_type, pixel_id, config")
      .eq("form_id", form.id)
      .eq("is_active", true);

    if (trackingPixels && trackingPixels.length > 0) {
      response.tracking_pixels = trackingPixels.map((p: any) => ({
        type: p.pixel_type,
        id: p.pixel_id,
        config: p.config || {}
      }));
    }

    console.log(`Form ${form.id} loaded with ${stepsWithFields.length} steps, ${(fields || []).length} fields, ${(trackingPixels || []).length} tracking pixels`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in get-form-data:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});