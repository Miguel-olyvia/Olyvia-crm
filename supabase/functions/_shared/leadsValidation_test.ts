import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  cleanupCreatedEntityArtifacts,
  getWorkflowPermissionForSourceEntity,
  resolveCanonicalFormId,
  resolveRootOrganizationId,
} from "./leadsValidation.ts";

function makeRootResolverMock(opts: {
  rpcData?: string | null;
  rpcError?: { message: string } | null;
  parentChain?: Array<string | null>;
}) {
  const calls = {
    rpc: 0,
    rpcParams: null as Record<string, unknown> | null,
    hierarchyLookups: [] as string[],
  };

  const supabase = {
    rpc: (_name: string, params: Record<string, unknown>) => {
      calls.rpc++;
      calls.rpcParams = params;
      return Promise.resolve({
        data: opts.rpcData ?? null,
        error: opts.rpcError ?? null,
      });
    },
    from: (table: string) => {
      if (table !== "anew_hierarchy") {
        throw new Error(`Unexpected table ${table}`);
      }

      const builder: any = {
        select: () => builder,
        limit: () => builder,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      };

      builder.eq = (_column: string, value: string) => {
        calls.hierarchyLookups.push(value);
        const parentOrgId = opts.parentChain?.shift() ?? null;
        builder.maybeSingle = () => Promise.resolve({
          data: parentOrgId ? { parent_org_id: parentOrgId } : null,
          error: null,
        });
        return builder;
      };

      return builder;
    },
  };

  return { supabase, calls };
}

function makeCleanupMock(entityAddressIds: string[]) {
  const calls: string[] = [];

  const supabase = {
    from: (table: string) => {
      const builder: any = {
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

Deno.test("resolveCanonicalFormId prefers campaign.form_id when request omits form_id", () => {
  const resolved = resolveCanonicalFormId(undefined, "form-campaign");
  assertEquals(resolved, { formId: "form-campaign" });
});

Deno.test("resolveCanonicalFormId rejects mismatched form_id values", () => {
  const resolved = resolveCanonicalFormId("form-body", "form-campaign");
  assertEquals(resolved, {
    formId: null,
    error: "form_id does not match the campaign's canonical form_id",
  });
});

Deno.test("resolveRootOrganizationId uses RPC result when available", async () => {
  const { supabase, calls } = makeRootResolverMock({ rpcData: "root-from-rpc" });
  const rootOrgId = await resolveRootOrganizationId(supabase, "org-child");
  assertEquals(rootOrgId, "root-from-rpc");
  assertEquals(calls.rpc, 1);
  assertEquals(calls.rpcParams, { p_org_id: "org-child" });
  assertEquals(calls.hierarchyLookups, []);
});

Deno.test("resolveRootOrganizationId falls back to hierarchy walk when RPC is unavailable", async () => {
  const { supabase, calls } = makeRootResolverMock({
    rpcError: { message: "function resolve_root_organization_id does not exist" },
    parentChain: ["org-parent", "org-root", null],
  });

  const rootOrgId = await resolveRootOrganizationId(supabase, "org-child");

  assertEquals(rootOrgId, "org-root");
  assertEquals(calls.hierarchyLookups, ["org-child", "org-parent", "org-root"]);
});

Deno.test("cleanupCreatedEntityArtifacts deletes child records before entity", async () => {
  const { supabase, calls } = makeCleanupMock(["addr-1", "addr-2"]);
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

Deno.test("getWorkflowPermissionForSourceEntity maps every supported module", () => {
  assertEquals(getWorkflowPermissionForSourceEntity("lead"), "leads.edit");
  assertEquals(getWorkflowPermissionForSourceEntity("deal"), "deals.edit");
  assertEquals(getWorkflowPermissionForSourceEntity("quote"), "quotes.edit");
  assertEquals(getWorkflowPermissionForSourceEntity("proposal"), "proposals.edit");
  assertEquals(getWorkflowPermissionForSourceEntity("contract"), "client_contracts.edit");
});
