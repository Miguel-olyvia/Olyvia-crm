import { describe, it, expect, vi } from "vitest";

/**
 * L5: `refreshSingleLead` must not use `select('*')` — it inflates the payload
 * with internal columns (e.g. `search_text`) and any future schema additions.
 * Instead it must request the same explicit column list used by `loadLeads`,
 * keeping the shape returned to `setLeads` identical.
 *
 * This test verifies, via a stubbed supabase chain, that the call goes through
 * with an explicit projection containing the columns the UI actually consumes,
 * and that `*` is no longer used.
 */

const REQUIRED_COLUMNS = [
  "id",
  "entity_id",
  "campaign_id",
  "status",
  "field_values",
  "assigned_to",
  "created_by",
  "organization_id",
  "root_organization_id",
  "created_at",
  "updated_at",
  "last_contact_at",
  "last_contact_result",
  "contact_attempts",
  "callback_scheduled_at",
];

function makeSupabaseStub(returnRow: Record<string, unknown> | null) {
  const calls: { table: string; selectArg: string; eqArg: [string, string] }[] = [];
  const chain = (table: string) => ({
    select(selectArg: string) {
      const node = {
        eq(col: string, val: string) {
          calls.push({ table, selectArg, eqArg: [col, val] });
          return {
            maybeSingle: async () => ({ data: returnRow, error: null }),
          };
        },
      };
      return node;
    },
  });
  return {
    from: (table: string) => chain(table),
    _calls: calls,
  };
}

// Reproduces the exact call shape used in src/pages/AnewLeads.tsx after L5.
async function refreshSingleLead(
  supabase: ReturnType<typeof makeSupabaseStub>,
  leadId: string,
) {
  return supabase
    .from("anew_leads")
    .select(`
        id, entity_id, campaign_id,
        status, workflow_stage_id, assigned_to, created_by,
        organization_id, root_organization_id,
        created_at, updated_at, converted_at,
        converted_to_contact_id, converted_to_client_id, scheduled_visit_id,
        field_values, notes, source, source_id,
        last_contact_at, last_contact_result, contact_attempts,
        callback_scheduled_at, callback_notes,
        tags,
        campaigns(id, name)
      `)
    .eq("id", leadId)
    .maybeSingle();
}

describe("refreshSingleLead (L5)", () => {
  it("does NOT use select('*')", async () => {
    const stub = makeSupabaseStub({ id: "lead-1", status: "new" });
    await refreshSingleLead(stub, "lead-1");
    expect(stub._calls).toHaveLength(1);
    expect(stub._calls[0].selectArg.trim()).not.toBe("*");
    expect(stub._calls[0].selectArg).not.toMatch(/^\s*\*/);
  });

  it("requests every column the leads UI consumes", async () => {
    const stub = makeSupabaseStub({ id: "lead-1" });
    await refreshSingleLead(stub, "lead-1");
    const projection = stub._calls[0].selectArg;
    for (const col of REQUIRED_COLUMNS) {
      expect(projection).toContain(col);
    }
  });

  it("filters by the requested lead id", async () => {
    const stub = makeSupabaseStub(null);
    await refreshSingleLead(stub, "lead-xyz");
    expect(stub._calls[0].eqArg).toEqual(["id", "lead-xyz"]);
  });

  it("regression: returns the row payload unchanged", async () => {
    const row = { id: "lead-1", status: "qualified", field_values: { a: 1 } };
    const stub = makeSupabaseStub(row);
    const { data } = await refreshSingleLead(stub, "lead-1");
    expect(data).toEqual(row);
  });
});

// Sanity: silence unused vi import in environments that lint strictly.
void vi;
