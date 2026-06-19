import { describe, expect, it, vi } from "vitest";
import {
  resolveLeadDialogFieldDefinitions,
  type LeadDialogFieldDefinitionResolverClient,
} from "@/lib/leads/fieldDefinitions";

function makeLegacyField(overrides: Partial<Awaited<ReturnType<LeadDialogFieldDefinitionResolverClient["fetchLeadFieldDefinitionsByCampaign"]>>[number]> = {}) {
  return {
    id: "legacy-1",
    campaign_id: "campaign-1",
    organization_id: null,
    field_key: "legacy_key",
    field_label: "Legacy Field",
    field_type: "text",
    is_required: false,
    is_unique: false,
    is_active: true,
    sort_order: 20,
    options: null,
    placeholder: null,
    help_text: null,
    display_style: null,
    contact_field_mapping: null,
    client_field_mapping: null,
    default_value: null,
    ...overrides,
  };
}

function makeFormField(overrides: Partial<Awaited<ReturnType<LeadDialogFieldDefinitionResolverClient["fetchFormFields"]>>[number]> = {}) {
  return {
    id: "form-1",
    form_id: "form-123",
    field_key: "nome",
    field_label: "Nome",
    field_type: "text",
    is_required: true,
    is_unique: false,
    is_active: true,
    sort_order: 10,
    options: null,
    placeholder: "Nome",
    help_text: "Ajuda",
    display_style: "default",
    contact_field_mapping: "first_name",
    client_field_mapping: null,
    ...overrides,
  };
}

function makeClient(
  overrides: Partial<LeadDialogFieldDefinitionResolverClient> = {},
): LeadDialogFieldDefinitionResolverClient {
  return {
    fetchCampaignFormId: vi.fn().mockResolvedValue(null),
    fetchFormFields: vi.fn().mockResolvedValue([]),
    fetchLeadFieldDefinitionsByCampaign: vi.fn().mockResolvedValue([]),
    fetchLeadFieldDefinitionsByOrganization: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("resolveLeadDialogFieldDefinitions", () => {
  it("uses form_fields when campaign has a form_id with active fields", async () => {
    const client = makeClient({
      fetchCampaignFormId: vi.fn().mockResolvedValue("form-123"),
      fetchFormFields: vi.fn().mockResolvedValue([makeFormField()]),
    });

    const result = await resolveLeadDialogFieldDefinitions(
      { campaignId: "campaign-1", organizationId: "org-1" },
      client,
    );

    expect(client.fetchLeadFieldDefinitionsByCampaign).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        id: "form-1",
        campaign_id: "campaign-1",
        organization_id: null,
        field_key: "nome",
        field_label: "Nome",
        contact_field_mapping: "first_name",
        placeholder: "Nome",
        help_text: "Ajuda",
        display_style: "default",
      }),
    ]);
  });

  it("falls back to lead_field_definitions when campaign has no form_id", async () => {
    const legacyField = makeLegacyField({ id: "legacy-no-form" });
    const client = makeClient({
      fetchCampaignFormId: vi.fn().mockResolvedValue(null),
      fetchLeadFieldDefinitionsByCampaign: vi.fn().mockResolvedValue([legacyField]),
    });

    const result = await resolveLeadDialogFieldDefinitions(
      { campaignId: "campaign-2", organizationId: "org-1" },
      client,
    );

    expect(client.fetchFormFields).not.toHaveBeenCalled();
    expect(result).toEqual([legacyField]);
  });

  it("falls back to lead_field_definitions when form_fields are empty", async () => {
    const client = makeClient({
      fetchCampaignFormId: vi.fn().mockResolvedValue("form-empty"),
      fetchFormFields: vi.fn().mockResolvedValue([]),
      fetchLeadFieldDefinitionsByCampaign: vi.fn().mockResolvedValue([
        makeLegacyField({ id: "legacy-after-empty-form" }),
      ]),
    });

    const result = await resolveLeadDialogFieldDefinitions(
      { campaignId: "campaign-3", organizationId: "org-1" },
      client,
    );

    expect(client.fetchFormFields).toHaveBeenCalledWith("form-empty");
    expect(client.fetchLeadFieldDefinitionsByCampaign).toHaveBeenCalledWith("campaign-3");
    expect(result[0]?.id).toBe("legacy-after-empty-form");
  });

  it("falls back to organization-level lead_field_definitions when campaignId is missing", async () => {
    const client = makeClient({
      fetchLeadFieldDefinitionsByOrganization: vi.fn().mockResolvedValue([
        makeLegacyField({
          id: "org-field-1",
          campaign_id: null,
          organization_id: "org-99",
        }),
      ]),
    });

    const result = await resolveLeadDialogFieldDefinitions(
      { campaignId: null, organizationId: "org-99" },
      client,
    );

    expect(client.fetchCampaignFormId).not.toHaveBeenCalled();
    expect(client.fetchLeadFieldDefinitionsByOrganization).toHaveBeenCalledWith("org-99");
    expect(result[0]?.organization_id).toBe("org-99");
  });

  it("returns an empty list when there is neither campaign nor organization fallback", async () => {
    const client = makeClient();

    const result = await resolveLeadDialogFieldDefinitions(
      { campaignId: null, organizationId: null },
      client,
    );

    expect(result).toEqual([]);
    expect(client.fetchCampaignFormId).not.toHaveBeenCalled();
    expect(client.fetchLeadFieldDefinitionsByOrganization).not.toHaveBeenCalled();
  });
});
