import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const querySchema = z.object({
  campaign_id: z.string().uuid(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "no-cache, no-store, must-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

/**
 * Get Campaign Form API
 * 
 * PUBLIC endpoint - Returns the form structure for a campaign including:
 * - Form steps
 * - Field definitions
 * - System entity options (services, products, etc.)
 * 
 * GET /get-campaign-form?campaign_id=xxx
 */
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const parsed = querySchema.safeParse({ campaign_id: url.searchParams.get("campaign_id") });
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { campaign_id: campaignId } = parsed.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get campaign info with location_required
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, name, description, organization_id, status, location_required")
      .eq("id", campaignId)
      .single();

    // Get campaign districts if location is required
    let allowedDistricts: { id: string; name: string; code: string }[] = [];
    if (!campaignError && campaign?.location_required) {
      const { data: campaignDistricts } = await supabase
        .from("campaign_districts")
        .select("district_id")
        .eq("campaign_id", campaignId);

      if (campaignDistricts && campaignDistricts.length > 0) {
        const districtIds = campaignDistricts.map(cd => cd.district_id);
        const { data: districts } = await supabase
          .from("administrative_divisions")
          .select("id, name, code")
          .in("id", districtIds);
        
        allowedDistricts = (districts || []).map(d => ({
          id: d.id,
          name: d.name,
          code: d.code
        }));
      }
    }

    if (campaignError || !campaign) {
      return new Response(
        JSON.stringify({ error: "Campaign not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if campaign is active
    if (campaign.status !== "active") {
      return new Response(
        JSON.stringify({ error: "Campaign is not active", status: campaign.status }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get branding settings
    const { data: branding } = await supabase
      .from("campaign_branding")
      .select("*")
      .eq("campaign_id", campaignId)
      .maybeSingle();

    // Get form steps
    const { data: steps, error: stepsError } = await supabase
      .from("campaign_form_steps")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("step_number");

    // Get step IDs for info blocks and sections
    const stepIds = (steps || []).map((s: any) => s.id);
    
    // Get info blocks for all steps
    let infoBlocksByStep: Record<string, any[]> = {};
    // Get sections for all steps
    let sectionsByStep: Record<string, any[]> = {};
    
    if (stepIds.length > 0) {
      const { data: infoBlocks } = await supabase
        .from("campaign_step_info_blocks")
        .select("*")
        .in("step_id", stepIds)
        .eq("is_visible", true)
        .order("sort_order");
      
      // Group info blocks by step_id
      (infoBlocks || []).forEach((block: any) => {
        if (!infoBlocksByStep[block.step_id]) {
          infoBlocksByStep[block.step_id] = [];
        }
        infoBlocksByStep[block.step_id].push({
          id: block.id,
          title: block.title,
          content: block.content,
          icon_type: block.icon_type,
          sort_order: block.sort_order,
        });
      });

      // Get sections
      const { data: sections } = await supabase
        .from("campaign_form_sections")
        .select("*")
        .in("step_id", stepIds)
        .eq("is_visible", true)
        .order("sort_order");
      
      // Group sections by step_id
      (sections || []).forEach((section: any) => {
        if (!sectionsByStep[section.step_id]) {
          sectionsByStep[section.step_id] = [];
        }
        sectionsByStep[section.step_id].push({
          id: section.id,
          title: section.title,
          description: section.description,
          sort_order: section.sort_order,
        });
      });
    }

    // Get field definitions
    const { data: fields, error: fieldsError } = await supabase
      .from("lead_field_definitions")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("is_active", true)
      .order("sort_order");

    if (fieldsError) {
      console.error("Error fetching fields:", fieldsError);
      return new Response(
        JSON.stringify({ error: "Error fetching form fields" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Collect unique system entity types that need to be fetched
    const systemEntityTypes = new Set<string>();
    const entityCompanyIds = new Map<string, string>();
    const entityCountryCodes = new Map<string, string>();
    
    (fields || []).forEach((field: any) => {
      if (field.system_entity_type) {
        systemEntityTypes.add(field.system_entity_type);
        if (field.system_entity_organization_id) {
          entityCompanyIds.set(field.system_entity_type, field.system_entity_organization_id);
        }
        if (field.system_entity_country_code) {
          entityCountryCodes.set(field.system_entity_type, field.system_entity_country_code);
        }
      }
    });

    // Fetch system entities
    const systemEntities: Record<string, any[]> = {};

    for (const entityType of systemEntityTypes) {
      const companyId = entityCompanyIds.get(entityType) || campaign.organization_id;
      
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
              description: s.description,
              price: s.price,
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
              description: p.description,
              price: p.price,
            }));
            break;
            
          case 'business_units': {
            // Fetch child organizations of type "filial" via hierarchy
            const { data: childOrgs } = await supabase
              .from('anew_hierarchy')
              .select('child_org_id, anew_organizations!anew_hierarchy_child_org_id_fkey(id, name, description, type)')
              .eq('parent_org_id', companyId);
            entityData = (childOrgs || [])
              .filter((h: any) => h.anew_organizations)
              .map((h: any) => ({
                id: h.anew_organizations.id,
                name: h.anew_organizations.name,
                label: h.anew_organizations.name,
                description: h.anew_organizations.description,
              }));
            break;
          }
            
          case 'departments': {
            // Fetch child organizations of type "departamento" via hierarchy
            const { data: deptOrgs } = await supabase
              .from('anew_hierarchy')
              .select('child_org_id, anew_organizations!anew_hierarchy_child_org_id_fkey(id, name, description, type)')
              .eq('parent_org_id', companyId);
            entityData = (deptOrgs || [])
              .filter((h: any) => h.anew_organizations?.type === 'departamento')
              .map((h: any) => ({
                id: h.anew_organizations.id,
                name: h.anew_organizations.name,
                label: h.anew_organizations.name,
                description: h.anew_organizations.description,
              }));
            break;
          }
            
          case 'districts':
            const countryCode = entityCountryCodes.get(entityType);
            let districtQuery = supabase
              .from('administrative_divisions')
              .select('id, name, code, country_code')
              .eq('admin_level', 1)
              .order('name');
            
            if (countryCode) {
              districtQuery = districtQuery.eq('country_code', countryCode);
            }
            
            const { data: districts } = await districtQuery;
            entityData = (districts || []).map(d => ({
              id: d.id,
              name: d.name,
              label: d.name,
              code: d.code,
              country_code: d.country_code,
            }));
            break;
        }
        
        systemEntities[entityType] = entityData;
      } catch (err) {
        console.error(`Error fetching ${entityType}:`, err);
        systemEntities[entityType] = [];
      }
    }

    // If no steps defined, create a virtual step 1
    const formSteps = steps && steps.length > 0 
      ? steps 
      : [{ step_number: 1, step_title: "Step 1", step_description: null }];

    // Group fields by step and enrich with system entity options
    const stepsWithFields = formSteps.map((step: any) => {
      const stepFields = (fields || [])
        .filter((f: any) => f.step_number === step.step_number)
        .map((f: any) => {
          const fieldData: any = {
            field_key: f.field_key,
            field_label: f.field_label,
            field_type: f.field_type,
            is_required: f.is_required,
            is_multi_select: f.is_multi_select || false,
            options: f.options,
            default_value: f.default_value,
            display_style: f.display_style || 'dropdown',
            option_icons: f.option_icons,
            option_icon_names: f.option_icon_names,
            section_id: f.section_id,
            min_length: f.min_length,
            max_length: f.max_length,
            min_value: f.min_value,
            max_value: f.max_value,
            placeholder: f.placeholder,
            help_text: f.help_text,
          };
          
          // If this field has a system entity type, add the options
          if (f.system_entity_type && systemEntities[f.system_entity_type]) {
            fieldData.system_entity_type = f.system_entity_type;
            fieldData.entity_options = systemEntities[f.system_entity_type];
          }
          
          return fieldData;
        });

      // Get info blocks and sections for this step
      const stepInfoBlocks = step.id ? (infoBlocksByStep[step.id] || []) : [];
      const stepSections = step.id ? (sectionsByStep[step.id] || []) : [];

      return {
        step_number: step.step_number,
        step_title: step.step_title,
        step_description: step.step_description,
        step_subtitle: step.step_subtitle,
        next_button_text: step.next_button_text,
        previous_button_text: step.previous_button_text,
        submit_button_text: step.submit_button_text,
        fields: stepFields,
        info_blocks: stepInfoBlocks,
        sections: stepSections,
      };
    });

    // Return the form structure
    return new Response(
      JSON.stringify({
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        campaign_description: campaign.description,
        organization_id: campaign.organization_id,
        total_steps: stepsWithFields.length,
        steps: stepsWithFields,
        system_entities: systemEntities,
        location_required: campaign.location_required || false,
        allowed_districts: allowedDistricts,
        branding: branding ? {
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
          form_title: branding.form_title,
          form_subtitle: branding.form_subtitle,
          submit_button_text: branding.submit_button_text,
          next_button_text: branding.next_button_text,
          previous_button_text: branding.previous_button_text,
          continue_button_text: branding.continue_button_text,
          back_button_text: branding.back_button_text,
          success_title: branding.success_title,
          success_message: branding.success_message,
          success_redirect_url: branding.success_redirect_url,
          success_redirect_delay_seconds: branding.success_redirect_delay_seconds,
          show_step_indicator: branding.show_step_indicator,
          show_step_titles: branding.show_step_titles,
          show_progress_bar: branding.show_progress_bar,
          progress_indicator_style: branding.progress_indicator_style || 'bar',
          progress_animation: branding.progress_animation ?? true,
          step_counter_style: branding.step_counter_style || 'text',
          card_style: branding.card_style,
          border_radius: branding.border_radius,
          custom_css: branding.custom_css,
          footer_text: branding.footer_text,
          privacy_policy_url: branding.privacy_policy_url,
          terms_url: branding.terms_url,
          location_rejection_message: branding.location_rejection_message,
          // Customizable texts
          loading_text: branding.loading_text,
          error_title: branding.error_title,
          error_message: branding.error_message,
          redirecting_text: branding.redirecting_text,
          seconds_text: branding.seconds_text,
          privacy_policy_label: branding.privacy_policy_label,
          terms_label: branding.terms_label,
          step_text: branding.step_text,
          of_text: branding.of_text,
          required_field_label: branding.required_field_label,
          select_placeholder: branding.select_placeholder,
          multi_select_placeholder: branding.multi_select_placeholder,
          date_placeholder: branding.date_placeholder,
          form_error_title: branding.form_error_title,
          form_error_message: branding.form_error_message,
          validation_error_text: branding.validation_error_text,
          location_not_available_title: branding.location_not_available_title,
          thank_you_text: branding.thank_you_text,
          contact_soon_text: branding.contact_soon_text,
          // Icon colors
          icon_color: branding.icon_color,
          icon_selected_color: branding.icon_selected_color,
          // Step loading
          step_loading_text: branding.step_loading_text,
          submitting_text: branding.submitting_text,
          // Back button styling
          back_button_bg_color: branding.back_button_bg_color,
          back_button_text_color: branding.back_button_text_color,
          back_button_border_color: branding.back_button_border_color,
          back_button_hover_bg_color: branding.back_button_hover_bg_color,
          // Radio button color
          radio_button_color: branding.radio_button_color,
          // Granular element styling
          input_border_radius: branding.input_border_radius,
          input_border_width: branding.input_border_width,
          input_border_color: branding.input_border_color,
          input_focus_border_color: branding.input_focus_border_color,
          input_background_color: branding.input_background_color,
          input_padding: branding.input_padding,
          input_font_size: branding.input_font_size,
          card_border_radius: branding.card_border_radius,
          card_border_width: branding.card_border_width,
          card_border_color: branding.card_border_color,
          card_icon_size: branding.card_icon_size,
          card_icon_border_radius: branding.card_icon_border_radius,
          card_padding: branding.card_padding,
          card_min_height: branding.card_min_height,
          radio_border_radius: branding.radio_border_radius,
          radio_border_width: branding.radio_border_width,
          radio_circle_size: branding.radio_circle_size,
          radio_inner_size: branding.radio_inner_size,
          radio_padding: branding.radio_padding,
          checkbox_border_radius: branding.checkbox_border_radius,
          checkbox_border_width: branding.checkbox_border_width,
          checkbox_size: branding.checkbox_size,
          checkbox_padding: branding.checkbox_padding,
          button_option_border_radius: branding.button_option_border_radius,
          button_option_border_width: branding.button_option_border_width,
          button_option_padding: branding.button_option_padding,
          nav_button_border_radius: branding.nav_button_border_radius,
          nav_button_padding: branding.nav_button_padding,
          nav_button_font_size: branding.nav_button_font_size,
          step_border_radius: branding.step_border_radius,
          step_padding: branding.step_padding,
          step_border_width: branding.step_border_width,
          step_border_color: branding.step_border_color,
          step_shadow: branding.step_shadow,
          info_block_border_radius: branding.info_block_border_radius,
          info_block_padding: branding.info_block_padding,
          info_block_background_opacity: branding.info_block_background_opacity,
          progress_bar_height: branding.progress_bar_height,
          progress_bar_border_radius: branding.progress_bar_border_radius,
          select_border_radius: branding.select_border_radius,
          select_border_width: branding.select_border_width,
          success_icon_size: branding.success_icon_size,
          success_border_radius: branding.success_border_radius,
          // Message display configuration
          error_display_style: branding.error_display_style,
          success_display_style: branding.success_display_style,
        } : null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
