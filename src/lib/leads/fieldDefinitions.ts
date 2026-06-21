import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface LeadDialogFieldDefinition {
  id: string;
  campaign_id: string | null;
  organization_id: string | null;
  field_key: string;
  field_label: string;
  field_type: string;
  is_required: boolean | null;
  is_unique: boolean | null;
  is_active: boolean | null;
  options: any;
  sort_order: number | null;
  contact_field_mapping: string | null;
  client_field_mapping: string | null;
  placeholder: string | null;
  help_text: string | null;
  display_style: string | null;
  default_value: string | null;
}

export interface LeadDialogFormFieldRecord {
  id: string;
  form_id: string;
  field_key: string;
  field_label: string;
  field_type: string;
  is_required: boolean | null;
  is_unique: boolean | null;
  is_active: boolean | null;
  options: any;
  sort_order: number | null;
  contact_field_mapping: string | null;
  client_field_mapping: string | null;
  placeholder: string | null;
  help_text: string | null;
  display_style: string | null;
}

export interface LeadDialogFieldDefinitionResolverClient {
  fetchCampaignFormId(campaignId: string): Promise<string | null>;
  fetchFormFields(formId: string): Promise<LeadDialogFormFieldRecord[]>;
  fetchLeadFieldDefinitionsByCampaign(campaignId: string): Promise<LeadDialogFieldDefinition[]>;
  fetchLeadFieldDefinitionsByOrganization(organizationId: string): Promise<LeadDialogFieldDefinition[]>;
}

interface ResolveLeadDialogFieldDefinitionsParams {
  campaignId?: string | null;
  organizationId?: string | null;
}

function mapFormFieldToLeadDialogFieldDefinition(
  formField: LeadDialogFormFieldRecord,
  campaignId: string,
): LeadDialogFieldDefinition {
  return {
    id: formField.id,
    campaign_id: campaignId,
    organization_id: null,
    field_key: formField.field_key,
    field_label: formField.field_label,
    field_type: formField.field_type,
    is_required: formField.is_required,
    is_unique: formField.is_unique,
    is_active: formField.is_active,
    options: formField.options,
    sort_order: formField.sort_order,
    contact_field_mapping: formField.contact_field_mapping,
    client_field_mapping: formField.client_field_mapping,
    placeholder: formField.placeholder,
    help_text: formField.help_text,
    display_style: formField.display_style,
    default_value: null,
  };
}

export async function resolveLeadDialogFieldDefinitions(
  params: ResolveLeadDialogFieldDefinitionsParams,
  client: LeadDialogFieldDefinitionResolverClient,
): Promise<LeadDialogFieldDefinition[]> {
  const campaignId = params.campaignId ?? null;
  const organizationId = params.organizationId ?? null;

  if (campaignId) {
    const formId = await client.fetchCampaignFormId(campaignId);

    if (formId) {
      const formFields = await client.fetchFormFields(formId);
      if (formFields.length > 0) {
        return formFields.map((field) => mapFormFieldToLeadDialogFieldDefinition(field, campaignId));
      }
    }

    return client.fetchLeadFieldDefinitionsByCampaign(campaignId);
  }

  if (organizationId) {
    return client.fetchLeadFieldDefinitionsByOrganization(organizationId);
  }

  return [];
}

export function createSupabaseLeadDialogFieldDefinitionResolverClient(
  supabase: SupabaseClient<Database>,
): LeadDialogFieldDefinitionResolverClient {
  return {
    async fetchCampaignFormId(campaignId) {
      const { data, error } = await supabase
        .from("campaigns")
        .select("form_id")
        .eq("id", campaignId)
        .maybeSingle();

      if (error) throw error;
      return data?.form_id ?? null;
    },
    async fetchFormFields(formId) {
      const { data, error } = await supabase
        .from("form_fields")
        .select(
          "id, form_id, field_key, field_label, field_type, is_required, is_unique, is_active, sort_order, options, placeholder, help_text, display_style, contact_field_mapping, client_field_mapping",
        )
        .eq("form_id", formId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true, nullsFirst: false });

      if (error) throw error;
      return (data ?? []) as LeadDialogFormFieldRecord[];
    },
    async fetchLeadFieldDefinitionsByCampaign(campaignId) {
      const { data, error } = await supabase
        .from("lead_field_definitions")
        .select(
          "id, campaign_id, organization_id, field_key, field_label, field_type, is_required, is_unique, is_active, sort_order, options, placeholder, help_text, display_style, contact_field_mapping, client_field_mapping, default_value",
        )
        .eq("campaign_id", campaignId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true, nullsFirst: false });

      if (error) throw error;
      return (data ?? []) as LeadDialogFieldDefinition[];
    },
    async fetchLeadFieldDefinitionsByOrganization(organizationId) {
      const { data, error } = await supabase
        .from("lead_field_definitions")
        .select(
          "id, campaign_id, organization_id, field_key, field_label, field_type, is_required, is_unique, is_active, sort_order, options, placeholder, help_text, display_style, contact_field_mapping, client_field_mapping, default_value",
        )
        .eq("organization_id", organizationId)
        .is("campaign_id", null)
        .eq("is_active", true)
        .order("sort_order", { ascending: true, nullsFirst: false });

      if (error) throw error;
      return (data ?? []) as LeadDialogFieldDefinition[];
    },
  };
}
