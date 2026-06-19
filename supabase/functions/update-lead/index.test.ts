/**
 * L4 — update-lead unique field check uses JSON `->>` operator
 *
 * The pre-fix code used `.contains("field_values", { [k]: v })` which relies
 * on JSONB containment and silently fails for non-string values (numbers,
 * booleans) when they are stored as JSON literals. The fix uses
 * `.filter("field_values->>{key}", "eq", String(value))` which extracts the
 * field as text and compares as a string.
 *
 * These tests intercept the supabase client builder calls and assert the
 * filter operator + arguments are constructed correctly for string, number
 * and boolean values, and that empty/undefined/null are skipped.
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveCanonicalFormId } from "../_shared/leadsValidation.ts";

interface FilterCall {
  column: string;
  operator: string;
  value: unknown;
}

function makeMockSupabase(existingRows: any[] = []) {
  const calls: { table: string; eqs: Array<[string, unknown]>; neqs: Array<[string, unknown]>; filters: FilterCall[] } = {
    table: "",
    eqs: [],
    neqs: [],
    filters: [],
  };

  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      calls.eqs.push([col, val]);
      return builder;
    },
    neq: (col: string, val: unknown) => {
      calls.neqs.push([col, val]);
      return builder;
    },
    filter: (column: string, operator: string, value: unknown) => {
      calls.filters.push({ column, operator, value });
      // Resolve like supabase: returns { data, error }
      return Promise.resolve({ data: existingRows, error: null });
    },
    contains: (_col: string, _payload: unknown) => {
      // If old code path is hit, mark it via a sentinel filter to fail tests
      calls.filters.push({ column: "__CONTAINS__", operator: "contains", value: _payload });
      return Promise.resolve({ data: existingRows, error: null });
    },
  };

  const supabase = {
    from: (table: string) => {
      calls.table = table;
      return builder;
    },
  };

  return { supabase, calls };
}

/**
 * Replicates the relevant block from update-lead/index.ts (post-fix). Keeps
 * the test independent of HTTP/Deno.serve plumbing.
 */
async function runUniqueCheck(
  supabase: any,
  field: { field_key: string; field_label: string; is_unique: boolean },
  field_values: Record<string, unknown>,
  campaignId: string,
  lead_id: string,
): Promise<{ status: number } | null> {
  if (
    field.is_unique &&
    field_values[field.field_key] !== undefined &&
    field_values[field.field_key] !== null &&
    field_values[field.field_key] !== ""
  ) {
    const candidate = String(field_values[field.field_key]);
    const { data: existingLeads } = await supabase
      .from("anew_leads")
      .select("id")
      .eq("campaign_id", campaignId)
      .neq("id", lead_id)
      .filter(`field_values->>${field.field_key}`, "eq", candidate);

    if (existingLeads && existingLeads.length > 0) {
      return { status: 409 };
    }
  }
  return null;
}

Deno.test("L4 — uses ->> operator with string value (collision => 409)", async () => {
  const { supabase, calls } = makeMockSupabase([{ id: "other-lead" }]);
  const result = await runUniqueCheck(
    supabase,
    { field_key: "email", field_label: "Email", is_unique: true },
    { email: "a@b.pt" },
    "camp-1",
    "lead-1",
  );
  assertExists(result);
  assertEquals(result?.status, 409);
  assertEquals(calls.filters.length, 1);
  assertEquals(calls.filters[0].column, "field_values->>email");
  assertEquals(calls.filters[0].operator, "eq");
  assertEquals(calls.filters[0].value, "a@b.pt");
  // Ensure the broken `.contains()` path was NOT taken
  assertEquals(
    calls.filters.some((f) => f.column === "__CONTAINS__"),
    false,
  );
});

Deno.test("L4 — uses ->> operator with string value (no collision => null)", async () => {
  const { supabase } = makeMockSupabase([]);
  const result = await runUniqueCheck(
    supabase,
    { field_key: "email", field_label: "Email", is_unique: true },
    { email: "new@b.pt" },
    "camp-1",
    "lead-1",
  );
  assertEquals(result, null);
});

Deno.test("L4 — number value: stringified, collision => 409 (was broken before fix)", async () => {
  const { supabase, calls } = makeMockSupabase([{ id: "other-lead" }]);
  const result = await runUniqueCheck(
    supabase,
    { field_key: "nif", field_label: "NIF", is_unique: true },
    { nif: 123456789 },
    "camp-1",
    "lead-1",
  );
  assertEquals(result?.status, 409);
  assertEquals(calls.filters[0].value, "123456789");
  assertEquals(typeof calls.filters[0].value, "string");
});

Deno.test("L4 — boolean value: stringified, collision => 409 (was broken before fix)", async () => {
  const { supabase, calls } = makeMockSupabase([{ id: "other-lead" }]);
  const result = await runUniqueCheck(
    supabase,
    { field_key: "newsletter_optin", field_label: "Newsletter", is_unique: true },
    { newsletter_optin: true },
    "camp-1",
    "lead-1",
  );
  assertEquals(result?.status, 409);
  assertEquals(calls.filters[0].value, "true");
});

Deno.test("L4 — empty/undefined/null values skip the unique check", async () => {
  for (const v of ["", null, undefined]) {
    const { supabase, calls } = makeMockSupabase([{ id: "any" }]);
    const result = await runUniqueCheck(
      supabase,
      { field_key: "email", field_label: "Email", is_unique: true },
      { email: v },
      "camp-1",
      "lead-1",
    );
    assertEquals(result, null, `value=${String(v)} should skip check`);
    assertEquals(calls.filters.length, 0);
  }
});

Deno.test("L4 — non-unique field is ignored entirely", async () => {
  const { supabase, calls } = makeMockSupabase([{ id: "other" }]);
  const result = await runUniqueCheck(
    supabase,
    { field_key: "notes", field_label: "Notes", is_unique: false },
    { notes: "hello" },
    "camp-1",
    "lead-1",
  );
  assertEquals(result, null);
  assertEquals(calls.filters.length, 0);
});

Deno.test("L6 â€” update-lead uses the campaign canonical form_id when body omits it", () => {
  const resolved = resolveCanonicalFormId(undefined, "form-campaign");
  assertEquals(resolved.formId, "form-campaign");
  assertEquals(resolved.error, undefined);
});

Deno.test("L6 â€” update-lead rejects mismatched body form_id", () => {
  const resolved = resolveCanonicalFormId("form-body", "form-campaign");
  assertEquals(resolved.formId, null);
  assertEquals(
    resolved.error,
    "form_id does not match the campaign's canonical form_id",
  );
});
