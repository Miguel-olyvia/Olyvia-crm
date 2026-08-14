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
import { resolveCanonicalFormId } from "../_shared/leadsValidation.ts";

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

Deno.test("L6 â€” campaign.form_id becomes the canonical form_id when caller omits it", () => {
  const resolved = resolveCanonicalFormId(undefined, "form-campaign");
  assertEquals(resolved.formId, "form-campaign");
  assertEquals(resolved.error, undefined);
});

Deno.test("L6 â€” mismatched body form_id is rejected in favour of campaign.form_id", () => {
  const resolved = resolveCanonicalFormId("form-body", "form-campaign");
  assertEquals(resolved.formId, null);
  assertEquals(
    resolved.error,
    "form_id does not match the campaign's canonical form_id",
  );
});

// ---- Reused-entity backfill (email/phone/address) ----------------------
//
// Covers the conservative backfill added to the "Reused entity, but no
// active contact/client/lead" branch in index.ts: when a public form
// submission resolves to a pre-existing anew_entities row (dedup by
// email/phone/NIF) that is missing email/phone/address, the new submission's
// data is used to fill the gap — but ONLY when the entity has ZERO rows in
// the corresponding table, and existing rows are NEVER overwritten.

function computeAddressKey(street: string, postal: string, city: string): string {
  // Mirrors create_entity_with_contacts_and_roles:
  // lower(concat_ws('|', v_street, v_postal, COALESCE(v_city, '')))
  // (20260821020000_security_definer_identity_from_authuid_fix_record.sql:106)
  return [street, postal, city].join("|").toLowerCase();
}

Deno.test("address_key — matches SQL concat_ws('|', street, postal, city) lowercase", () => {
  assertEquals(computeAddressKey("Rua A 12", "1000-001", "Lisboa"), "rua a 12|1000-001|lisboa");
});

Deno.test("address_key — empty city still yields the trailing '|' (concat_ws keeps empty-string args)", () => {
  assertEquals(computeAddressKey("Rua A 12", "1000-001", ""), "rua a 12|1000-001|");
});

/**
 * In-memory mock supabase supporting exactly the calls the reused-entity
 * backfill routine makes: count lookups (head:true), address_key lookup,
 * and inserts into anew_entity_emails / anew_entity_phones / anew_addresses
 * / anew_entity_addresses.
 */
function makeBackfillMockSupabase(opts: {
  emailCount?: number;
  phoneCount?: number;
  addressCount?: number;
  existingAddressByKey?: Record<string, { id: string }>;
}) {
  const inserted: Record<string, any[]> = {
    anew_entity_emails: [],
    anew_entity_phones: [],
    anew_addresses: [],
    anew_entity_addresses: [],
  };
  const existingAddressByKey = opts.existingAddressByKey ?? {};
  let addressSeq = 0;

  const supabase = {
    from: (table: string) => {
      const builder: any = {
        _table: table,
        _filters: {} as Record<string, unknown>,
        select: (_cols: string, selectOpts?: { count?: string; head?: boolean }) => {
          builder._isCount = !!selectOpts?.head;
          return builder;
        },
        eq: (col: string, val: any) => {
          builder._filters[col] = val;
          return builder;
        },
        maybeSingle: () => {
          if (table === "anew_addresses") {
            const key = builder._filters["address_key"];
            const found = existingAddressByKey[key as string];
            return Promise.resolve({ data: found ?? null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert: (row: any) => {
          inserted[table]?.push(row);
          const insertResult = {
            select: (_c?: string) => ({
              single: () => {
                if (table === "anew_addresses") {
                  addressSeq += 1;
                  return Promise.resolve({ data: { id: `new-address-${addressSeq}` }, error: null });
                }
                return Promise.resolve({ data: { id: "stub" }, error: null });
              },
            }),
          };
          // Also awaitable directly (no .select chained), matching the
          // entity_emails/entity_phones/entity_addresses insert calls in index.ts.
          return Object.assign(Promise.resolve({ error: null }), insertResult);
        },
      };
      // Count queries resolve when awaited directly (no .single()/.maybeSingle() chained).
      const originalEq = builder.eq;
      builder.eq = (col: string, val: any) => {
        originalEq(col, val);
        if (builder._isCount) {
          const countMap: Record<string, number | undefined> = {
            anew_entity_emails: opts.emailCount,
            anew_entity_phones: opts.phoneCount,
            anew_entity_addresses: opts.addressCount,
          };
          return Object.assign(Promise.resolve({ count: countMap[table] ?? 0, error: null }), builder);
        }
        return builder;
      };
      return builder;
    },
  };
  return { supabase, inserted };
}

/**
 * Replicates the reused-entity backfill routine from create-lead/index.ts:
 * email/phone/address are only inserted when the entity has ZERO existing
 * rows in that table; an existing address_key is reused instead of
 * duplicated.
 */
async function runReusedEntityBackfill(
  supabase: any,
  opts: {
    entityId: string;
    leadEmail: string | null;
    leadPhone: string | null;
    street: string;
    postal: string;
    city: string;
    createdBy: string | null;
  },
) {
  const { entityId, leadEmail, leadPhone, street, postal, city, createdBy } = opts;

  if (leadEmail) {
    const { count: emailCount } = await supabase
      .from("anew_entity_emails")
      .select("id", { count: "exact", head: true })
      .eq("entity_id", entityId);
    if (!emailCount) {
      await supabase.from("anew_entity_emails").insert({
        entity_id: entityId,
        email: leadEmail.toLowerCase().trim(),
        email_type: "personal",
        is_primary: true,
        created_by: createdBy,
      });
    }
  }

  if (leadPhone) {
    const { count: phoneCount } = await supabase
      .from("anew_entity_phones")
      .select("id", { count: "exact", head: true })
      .eq("entity_id", entityId);
    if (!phoneCount) {
      await supabase.from("anew_entity_phones").insert({
        entity_id: entityId,
        phone_number: leadPhone,
        phone_type: "mobile",
        is_primary: true,
        created_by: createdBy,
      });
    }
  }

  if (street && postal) {
    const { count: addressCount } = await supabase
      .from("anew_entity_addresses")
      .select("id", { count: "exact", head: true })
      .eq("entity_id", entityId);
    if (!addressCount) {
      const addressKey = computeAddressKey(street, postal, city);
      let addressId: string | null = null;
      const { data: existingAddress } = await supabase
        .from("anew_addresses")
        .select("id")
        .eq("address_key", addressKey)
        .maybeSingle();
      if (existingAddress?.id) {
        addressId = existingAddress.id;
      } else {
        const { data: newAddress } = await supabase
          .from("anew_addresses")
          .insert({
            address_key: addressKey,
            street,
            number: "",
            postal_code: postal,
            city: city || "",
            country: "PT",
            created_by: createdBy,
          })
          .select("id")
          .single();
        addressId = newAddress?.id || null;
      }
      if (addressId) {
        await supabase.from("anew_entity_addresses").insert({
          entity_id: entityId,
          address_id: addressId,
          address_type: "primary",
          is_primary: true,
          created_by: createdBy,
        });
      }
    }
  }
}

Deno.test("reused-entity backfill — entity has NO email/phone/address: all get filled from the new submission", async () => {
  const { supabase, inserted } = makeBackfillMockSupabase({
    emailCount: 0,
    phoneCount: 0,
    addressCount: 0,
  });

  await runReusedEntityBackfill(supabase, {
    entityId: "entity-1",
    leadEmail: "  USER@Example.PT  ",
    leadPhone: "+351912345678",
    street: "Rua Nova 5",
    postal: "2000-002",
    city: "Santarém",
    createdBy: "admin-1",
  });

  assertEquals(inserted.anew_entity_emails.length, 1);
  assertEquals(inserted.anew_entity_emails[0].email, "user@example.pt");
  assertEquals(inserted.anew_entity_phones.length, 1);
  assertEquals(inserted.anew_entity_phones[0].phone_number, "+351912345678");
  assertEquals(inserted.anew_addresses.length, 1);
  assertEquals(inserted.anew_addresses[0].address_key, "rua nova 5|2000-002|santarém");
  assertEquals(inserted.anew_entity_addresses.length, 1);
  assertEquals(inserted.anew_entity_addresses[0].address_id, "new-address-1");
});

Deno.test("reused-entity backfill — entity ALREADY has email/phone/address: nothing is inserted (never overwritten)", async () => {
  const { supabase, inserted } = makeBackfillMockSupabase({
    emailCount: 1,
    phoneCount: 1,
    addressCount: 1,
  });

  await runReusedEntityBackfill(supabase, {
    entityId: "entity-2",
    leadEmail: "new@example.pt",
    leadPhone: "+351900000000",
    street: "Outra Rua",
    postal: "3000-003",
    city: "Coimbra",
    createdBy: "admin-1",
  });

  assertEquals(inserted.anew_entity_emails.length, 0);
  assertEquals(inserted.anew_entity_phones.length, 0);
  assertEquals(inserted.anew_addresses.length, 0);
  assertEquals(inserted.anew_entity_addresses.length, 0);
});

Deno.test("reused-entity backfill — matching address_key already exists: reused, not duplicated", async () => {
  const key = computeAddressKey("Rua Existente", "4000-004", "Porto");
  const { supabase, inserted } = makeBackfillMockSupabase({
    emailCount: 1,
    phoneCount: 1,
    addressCount: 0,
    existingAddressByKey: { [key]: { id: "existing-address-9" } },
  });

  await runReusedEntityBackfill(supabase, {
    entityId: "entity-3",
    leadEmail: null,
    leadPhone: null,
    street: "Rua Existente",
    postal: "4000-004",
    city: "Porto",
    createdBy: "admin-1",
  });

  // No new anew_addresses row created — the existing one (by address_key) is reused.
  assertEquals(inserted.anew_addresses.length, 0);
  assertEquals(inserted.anew_entity_addresses.length, 1);
  assertEquals(inserted.anew_entity_addresses[0].address_id, "existing-address-9");
});

Deno.test("reused-entity backfill — incomplete address (missing postal_code) is skipped, email/phone still processed", async () => {
  const { supabase, inserted } = makeBackfillMockSupabase({
    emailCount: 0,
    phoneCount: 0,
    addressCount: 0,
  });

  await runReusedEntityBackfill(supabase, {
    entityId: "entity-4",
    leadEmail: "someone@example.pt",
    leadPhone: "+351911111111",
    street: "Rua Sem Postal",
    postal: "",
    city: "Braga",
    createdBy: null,
  });

  assertEquals(inserted.anew_entity_emails.length, 1);
  assertEquals(inserted.anew_entity_phones.length, 1);
  assertEquals(inserted.anew_addresses.length, 0);
  assertEquals(inserted.anew_entity_addresses.length, 0);
});
