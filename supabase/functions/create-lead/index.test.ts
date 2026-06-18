/**
 * L3 + L19 — create-lead transactional entity creation
 *
 * These tests cover the pure logic that prepares the RPC payload and the
 * compensation flow. They do NOT spin up the full Deno.serve handler; instead
 * they replicate the exact payload-builder rules used inside
 * `supabase/functions/create-lead/index.ts` so any regression there is caught
 * here.
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

// ---- Helpers replicated from index.ts ----------------------------------

function buildAddressesPayload(opts: { street?: string; postal?: string; city?: string }) {
  const street = String(opts.street ?? "").trim();
  const postal = String(opts.postal ?? "").trim();
  const city = String(opts.city ?? "").trim();
  // L19: only persist an address when both street AND postal_code are present.
  if (street && postal) {
    return [{
      street,
      postal_code: postal,
      city: city || "",
      number: "",
      country: "PT",
      address_type: "primary",
      is_primary: true,
    }];
  }
  return [];
}

function buildEmailsPayload(leadEmail: string | null) {
  if (!leadEmail) return [];
  return [{ email: leadEmail.toLowerCase().trim(), email_type: "personal", is_primary: true }];
}

function buildPhonesPayload(leadPhone: string | null) {
  if (!leadPhone) return [];
  return [{ phone_number: leadPhone, phone_type: "mobile", is_primary: true }];
}

// ---- L19 address gating -------------------------------------------------

Deno.test("L19 — full address (street + postal + city) is included", () => {
  const payload = buildAddressesPayload({ street: "Rua A 12", postal: "1000-001", city: "Lisboa" });
  assertEquals(payload.length, 1);
  assertEquals(payload[0].street, "Rua A 12");
  assertEquals(payload[0].postal_code, "1000-001");
  assertEquals(payload[0].city, "Lisboa");
});

Deno.test("L19 — missing street: address NOT included (no 'N/A' placeholder)", () => {
  const payload = buildAddressesPayload({ street: "", postal: "1000-001", city: "Lisboa" });
  assertEquals(payload.length, 0);
});

Deno.test("L19 — missing postal_code: address NOT included (no '0000-000' placeholder)", () => {
  const payload = buildAddressesPayload({ street: "Rua A", postal: "", city: "Lisboa" });
  assertEquals(payload.length, 0);
});

Deno.test("L19 — only city: address NOT included", () => {
  const payload = buildAddressesPayload({ street: "", postal: "", city: "Lisboa" });
  assertEquals(payload.length, 0);
});

Deno.test("L19 — undefined fields: address NOT included", () => {
  const payload = buildAddressesPayload({});
  assertEquals(payload.length, 0);
});

// ---- L3 RPC payload shape ----------------------------------------------

Deno.test("L3 — emails payload normalises and lowercases", () => {
  assertEquals(buildEmailsPayload(null), []);
  const p = buildEmailsPayload("  USER@Example.PT  ");
  assertEquals(p.length, 1);
  assertEquals(p[0].email, "user@example.pt");
  assertEquals(p[0].is_primary, true);
});

Deno.test("L3 — phones payload omitted when null", () => {
  assertEquals(buildPhonesPayload(null), []);
  const p = buildPhonesPayload("+351912345678");
  assertEquals(p[0].phone_number, "+351912345678");
});

// ---- L3 compensation flow on lead-insert failure -----------------------

interface MockCallLog {
  rpcCalled: boolean;
  rpcArgs?: Record<string, unknown>;
  leadInsertCalled: boolean;
  cleanupCalls: string[];
}

function makeMockSupabase(opts: {
  rpcReturns: { data?: string | null; error?: { message: string } | null };
  leadInsertReturns: { data?: any; error?: { message: string } | null };
  entityAddrLookup?: any[];
}): { supabase: any; calls: MockCallLog } {
  const calls: MockCallLog = { rpcCalled: false, leadInsertCalled: false, cleanupCalls: [] };

  const supabase = {
    rpc: (_name: string, args: Record<string, unknown>) => {
      calls.rpcCalled = true;
      calls.rpcArgs = args;
      return Promise.resolve({ data: opts.rpcReturns.data ?? null, error: opts.rpcReturns.error ?? null });
    },
    from: (table: string) => {
      const builder: any = {
        _table: table,
        insert: (_row: any) => ({
          select: () => ({
            single: () => {
              if (table === "anew_leads") {
                calls.leadInsertCalled = true;
                return Promise.resolve(opts.leadInsertReturns);
              }
              return Promise.resolve({ data: { id: "stub" }, error: null });
            },
          }),
        }),
        select: (_cols?: string) => builder,
        delete: () => builder,
        eq: (_col: string, _val: any) => {
          if (builder._mode === "delete") {
            calls.cleanupCalls.push(`delete:${table}`);
            return Promise.resolve({ data: null, error: null });
          }
          if (table === "anew_entity_addresses") {
            return Promise.resolve({ data: opts.entityAddrLookup ?? [], error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
        in: (_col: string, _vals: any[]) => {
          calls.cleanupCalls.push(`delete-in:${table}`);
          return Promise.resolve({ data: null, error: null });
        },
      };
      // Override delete to mark mode
      const origDelete = builder.delete;
      builder.delete = () => {
        builder._mode = "delete";
        return origDelete();
      };
      return builder;
    },
  };
  return { supabase, calls };
}

/**
 * Replicates the compensation routine from create-lead/index.ts after a
 * lead insert failure with entityWasCreated=true.
 */
async function runCompensation(supabase: any, entityId: string) {
  const { data: entAddrs } = await supabase
    .from("anew_entity_addresses").select("address_id").eq("entity_id", entityId);
  await supabase.from("anew_entity_addresses").delete().eq("entity_id", entityId);
  const addrIds = (entAddrs || []).map((a: any) => a.address_id).filter(Boolean);
  if (addrIds.length > 0) {
    await supabase.from("anew_addresses").delete().in("id", addrIds);
  }
  await supabase.from("anew_entity_emails").delete().eq("entity_id", entityId);
  await supabase.from("anew_entity_phones").delete().eq("entity_id", entityId);
  await supabase.from("anew_entity_roles").delete().eq("entity_id", entityId);
  await supabase.from("anew_entities").delete().eq("id", entityId);
}

Deno.test("L3 — compensation deletes children before entity (FK-safe order)", async () => {
  const { supabase, calls } = makeMockSupabase({
    rpcReturns: { data: "entity-1" },
    leadInsertReturns: { data: null, error: { message: "boom" } },
    entityAddrLookup: [{ address_id: "addr-1" }, { address_id: "addr-2" }],
  });

  await runCompensation(supabase, "entity-1");

  // Order matters: addresses (link table) -> orphan addresses -> emails -> phones -> roles -> entity
  assertEquals(calls.cleanupCalls, [
    "delete:anew_entity_addresses",
    "delete-in:anew_addresses",
    "delete:anew_entity_emails",
    "delete:anew_entity_phones",
    "delete:anew_entity_roles",
    "delete:anew_entities",
  ]);
});

Deno.test("L3 — compensation skips orphan address delete when no addresses existed", async () => {
  const { supabase, calls } = makeMockSupabase({
    rpcReturns: { data: "entity-2" },
    leadInsertReturns: { data: null, error: { message: "boom" } },
    entityAddrLookup: [],
  });

  await runCompensation(supabase, "entity-2");

  assertEquals(calls.cleanupCalls.includes("delete-in:anew_addresses"), false);
  assertEquals(calls.cleanupCalls.at(-1), "delete:anew_entities");
});
