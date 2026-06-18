/**
 * Regression tests for the entity identity layer.
 *
 * Locks down behaviour that must not break when changing the
 * RLS policy on `anew_entities` (INSERT) or the
 * `user_has_active_membership` SECURITY DEFINER function:
 *
 *  1. `createEntityWithIdentity` writes `created_by` using the
 *     business identity (`anew_users.id`) — NEVER `auth.uid()`.
 *  2. When `createdBy` is omitted, it resolves the business id
 *     from the auth session and refuses to fall back to `auth.uid()`.
 *  3. Side tables (emails / phones / fiscal_entities + link) are
 *     written only when the corresponding input is present, keeping
 *     the anti-duplication anchors stable.
 *  4. A 42501 (RLS) error from the entity insert is surfaced to the
 *     caller verbatim so the UI can map it to a human message.
 *  5. `resolveEntityByIdentity` honours the email > phone > vat priority
 *     used by the dedup pipeline.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mocks ----
const fromMock = vi.fn();
const resolveBusinessIdMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...a: any[]) => fromMock(...a),
  },
}));

vi.mock("@/lib/identity/resolveBusinessUserId", () => ({
  resolveCurrentBusinessUserId: (...a: any[]) => resolveBusinessIdMock(...a),
}));

import {
  createEntityWithIdentity,
  resolveEntityByIdentity,
} from "@/hooks/useEntityIdentity";

// Helper: builds a chainable supabase mock that resolves to `result`.
// Captures payloads so tests can assert on insert / update bodies.
type Capture = { table: string; insert?: any; update?: any; selectedId?: string };
function buildFrom(routes: Record<string, { result: any; capture?: Capture }>) {
  return (table: string) => {
    const route = routes[table];
    if (!route) throw new Error(`Unexpected table access: ${table}`);
    const cap: Capture = route.capture ?? { table };
    cap.table = table;

    const chain: any = {
      insert: (payload: any) => {
        cap.insert = payload;
        return chain;
      },
      update: (payload: any) => {
        cap.update = payload;
        return chain;
      },
      select: () => chain,
      single: () => Promise.resolve(route.result),
      maybeSingle: () => Promise.resolve(route.result),
      eq: () => chain,
      ilike: () => chain,
      is: () => chain,
      in: () => chain,
      limit: () => chain,
      then: (resolve: any) => Promise.resolve(route.result).then(resolve),
    };
    return chain;
  };
}

beforeEach(() => {
  fromMock.mockReset();
  resolveBusinessIdMock.mockReset();
});

describe("createEntityWithIdentity — RLS / identity boundary regression", () => {
  it("writes created_by using the explicit business user id (anew_users.id), not auth.uid()", async () => {
    const BUSINESS_ID = "e811fa85-0000-0000-0000-000000000001";
    const entityCap: Capture = { table: "anew_entities" };
    const emailCap: Capture = { table: "anew_entity_emails" };

    fromMock.mockImplementation(
      buildFrom({
        anew_entities: {
          result: { data: { id: "ent-1" }, error: null },
          capture: entityCap,
        },
        anew_entity_emails: {
          result: { data: null, error: null },
          capture: emailCap,
        },
      })
    );

    const id = await createEntityWithIdentity({
      displayName: "Miguel",
      type: "person",
      email: "miguel@example.com",
      createdBy: BUSINESS_ID,
    });

    expect(id).toBe("ent-1");
    expect(entityCap.insert).toMatchObject({
      display_name: "Miguel",
      type: "person",
      status: "active",
      created_by: BUSINESS_ID, // anew_users.id — NEVER auth.uid()
    });
    expect(emailCap.insert).toMatchObject({
      entity_id: "ent-1",
      email: "miguel@example.com",
      is_primary: true,
      created_by: BUSINESS_ID,
    });
    // resolveCurrentBusinessUserId must NOT be used when caller provides createdBy.
    expect(resolveBusinessIdMock).not.toHaveBeenCalled();
  });

  it("resolves the business id from auth when createdBy is omitted, and never falls back to auth.uid()", async () => {
    const RESOLVED = "biz-from-session";
    resolveBusinessIdMock.mockResolvedValue(RESOLVED);

    const entityCap: Capture = { table: "anew_entities" };
    fromMock.mockImplementation(
      buildFrom({
        anew_entities: {
          result: { data: { id: "ent-2" }, error: null },
          capture: entityCap,
        },
      })
    );

    await createEntityWithIdentity({
      displayName: "Org Sem Email",
      type: "organization",
    });

    expect(resolveBusinessIdMock).toHaveBeenCalledTimes(1);
    expect(entityCap.insert?.created_by).toBe(RESOLVED);
  });

  it("throws explicitly when no business identity can be resolved (prevents silent auth.uid() fallback)", async () => {
    resolveBusinessIdMock.mockResolvedValue(null);
    fromMock.mockImplementation(() => {
      throw new Error("must not reach DB without business id");
    });

    await expect(
      createEntityWithIdentity({ displayName: "X", type: "person" })
    ).rejects.toThrow(/Business user not found/i);
  });

  it("surfaces RLS (42501) errors verbatim so the UI can map them to a human toast", async () => {
    fromMock.mockImplementation(
      buildFrom({
        anew_entities: {
          result: {
            data: null,
            error: {
              code: "42501",
              message:
                'new row violates row-level security policy for table "anew_entities"',
            },
          },
        },
      })
    );

    await expect(
      createEntityWithIdentity({
        displayName: "Blocked",
        type: "person",
        createdBy: "biz-x",
      })
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("does not write side-table rows when their inputs are absent (keeps dedup anchors clean)", async () => {
    const entityCap: Capture = { table: "anew_entities" };
    const visited: string[] = [];
    fromMock.mockImplementation((table: string) => {
      visited.push(table);
      return buildFrom({
        anew_entities: {
          result: { data: { id: "ent-3" }, error: null },
          capture: entityCap,
        },
      })(table);
    });

    await createEntityWithIdentity({
      displayName: "Only Name",
      type: "person",
      createdBy: "biz-y",
    });

    expect(visited).toEqual(["anew_entities"]);
  });
});

describe("resolveEntityByIdentity — dedup priority regression", () => {
  it("returns the email match first (priority: email > phone > vat)", async () => {
    fromMock.mockImplementation(
      buildFrom({
        anew_entity_emails: {
          result: { data: { entity_id: "ent-email" }, error: null },
        },
        anew_entity_phones: {
          result: { data: { entity_id: "ent-phone" }, error: null },
        },
        fiscal_entities: {
          result: { data: { id: "fe-1" }, error: null },
        },
        anew_entity_fiscal_entities: {
          result: { data: { entity_id: "ent-vat" }, error: null },
        },
      })
    );

    const id = await resolveEntityByIdentity({
      email: "a@b.com",
      phone: "910000000",
      vat: "PT500000000",
    });
    expect(id).toBe("ent-email");
  });

  it("falls back to phone when email has no match", async () => {
    fromMock.mockImplementation(
      buildFrom({
        anew_entity_emails: { result: { data: null, error: null } },
        anew_entity_phones: {
          result: { data: { entity_id: "ent-phone" }, error: null },
        },
        fiscal_entities: { result: { data: null, error: null } },
      })
    );

    const id = await resolveEntityByIdentity({
      email: "missing@x.com",
      phone: "910000000",
    });
    expect(id).toBe("ent-phone");
  });

  it("returns null when no signal matches (forces a new entity in the dedup pipeline)", async () => {
    fromMock.mockImplementation(
      buildFrom({
        anew_entity_emails: { result: { data: null, error: null } },
        anew_entity_phones: { result: { data: null, error: null } },
        fiscal_entities: { result: { data: null, error: null } },
      })
    );

    const id = await resolveEntityByIdentity({
      email: "x@y.com",
      phone: "999",
      vat: "PT1",
    });
    expect(id).toBeNull();
  });
});
