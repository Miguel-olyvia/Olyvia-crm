import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  cleanupCreatedEntityArtifacts,
  resolveRootOrganizationId,
  validateInsertLeadCampaign,
} from "../_shared/leadsValidation.ts";

function makeRootResolverMock() {
  const supabase = {
    rpc: () => Promise.resolve({ data: "root-org", error: null }),
    from: (_table: string) => {
      throw new Error("Hierarchy fallback should not run in this test");
    },
  };

  return supabase;
}

function makeCleanupMock(entityAddressIds: string[]) {
  const calls: string[] = [];

  const supabase = {
    from: (table: string) => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        delete: () => {
          builder.eq = (_column: string, _value: unknown) => {
            calls.push(`delete:${table}`);
            return Promise.resolve({ data: null, error: null });
          };
          builder.in = (_column: string, _value: unknown[]) => {
            calls.push(`delete-in:${table}`);
            return Promise.resolve({ data: null, error: null });
          };
          return builder;
        },
        eq: (_column: string, _value: unknown) => {
          if (table === "anew_entity_addresses") {
            return Promise.resolve({
              data: entityAddressIds.map((addressId) => ({ address_id: addressId })),
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        in: (_column: string, _value: unknown[]) => Promise.resolve({ data: null, error: null }),
      };

      return builder;
    },
  };

  return { supabase, calls };
}

Deno.test("insert-lead validates that campaign belongs to the token organization and is active", () => {
  assertEquals(
    validateInsertLeadCampaign("org-a", {
      id: "campaign-1",
      organization_id: "org-b",
      status: "active",
    }),
    {
      ok: false,
      status: 403,
      error: "Campaign does not belong to the API token organization",
    },
  );

  assertEquals(
    validateInsertLeadCampaign("org-a", {
      id: "campaign-1",
      organization_id: "org-a",
      status: "paused",
    }),
    {
      ok: false,
      status: 400,
      error: "Campaign is not active",
      details: { status: "paused" },
    },
  );
});

Deno.test("insert-lead resolves root organization through the canonical RPC path", async () => {
  const rootOrgId = await resolveRootOrganizationId(makeRootResolverMock(), "org-child");
  assertEquals(rootOrgId, "root-org");
});

Deno.test("insert-lead compensation cleanup removes atomic entity artifacts without leaving orphans", async () => {
  const { supabase, calls } = makeCleanupMock(["addr-1"]);
  await cleanupCreatedEntityArtifacts(supabase, "entity-1");
  assertEquals(calls, [
    "delete:anew_entity_addresses",
    "delete-in:anew_addresses",
    "delete:anew_entity_emails",
    "delete:anew_entity_phones",
    "delete:anew_entity_roles",
    "delete:anew_entities",
  ]);
});
