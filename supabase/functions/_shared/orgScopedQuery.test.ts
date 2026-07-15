import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { orgScoped, type OrgScopedClient, type OrgScopedQueryBuilder } from "./orgScopedQuery.ts";

function makeMockClient() {
  const calls: Array<{ table: string; column: string; value: string }> = [];

  const supabase: OrgScopedClient = {
    from: (table: string) => {
      const builder: OrgScopedQueryBuilder = {
        eq: (column: string, value: string) => {
          calls.push({ table, column, value });
          return builder;
        },
        select: () => builder,
        insert: () => builder,
        update: () => builder,
        delete: () => builder,
      };
      return builder;
    },
  };

  return { supabase, calls };
}

Deno.test("orgScoped applies .eq(organization_id, ...) to the query builder", () => {
  const { supabase, calls } = makeMockClient();

  orgScoped(supabase, "anew_leads", "org-123");

  assertEquals(calls, [{ table: "anew_leads", column: "organization_id", value: "org-123" }]);
});

Deno.test("orgScoped throws when organizationId is undefined", () => {
  const { supabase } = makeMockClient();

  assertThrows(
    () => orgScoped(supabase, "anew_leads", undefined),
    Error,
    "organizationId is required",
  );
});

Deno.test("orgScoped throws when organizationId is null", () => {
  const { supabase } = makeMockClient();

  assertThrows(
    () => orgScoped(supabase, "anew_leads", null),
    Error,
    "organizationId is required",
  );
});

Deno.test("orgScoped throws when organizationId is an empty string", () => {
  const { supabase } = makeMockClient();

  assertThrows(
    () => orgScoped(supabase, "anew_leads", ""),
    Error,
    "organizationId is required",
  );
});

Deno.test("orgScoped returns a builder that still supports chaining further filters", () => {
  const { supabase, calls } = makeMockClient();

  const result = orgScoped(supabase, "anew_clients", "org-456").eq("status", "active");

  assertEquals(calls, [
    { table: "anew_clients", column: "organization_id", value: "org-456" },
    { table: "anew_clients", column: "status", value: "active" },
  ]);
  assertEquals(typeof result.select, "function");
});
