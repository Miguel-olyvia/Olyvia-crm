/**
 * T6: quando uma ficha tem mais do que um telefone (ou email) principal, o Info
 * mostra SEMPRE o mesmo que o portal e as propostas: o de `created_at` mais
 * recente e, se foram escritos na mesma hora, o de `id` maior. A ordem do portal e
 * `is_primary desc, created_at desc, id desc` (supabase/functions/sms-otp/index.ts).
 *
 * O hook fica com a ULTIMA linha que processa, por isso pede tudo por ordem
 * ascendente. Sem o desempate por id, dois principais a mesma hora ficavam pela
 * ordem em que a base os devolvesse, e o Info podia mostrar um numero diferente
 * do que o portal usa.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { fakeFrom, type FakeTables } from "@/test/fakeSupabaseTables";

let tables: FakeTables = {};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => fakeFrom(tables)(table) },
}));
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({
  resolveCurrentBusinessUserId: () => Promise.resolve("user-1"),
}));
vi.mock("@/lib/nif/callFiscalEntityResolve", () => ({
  callFiscalEntityResolve: () => Promise.resolve({ data: null, error: null }),
}));
vi.mock("@/lib/nif/callNifReveal", () => ({
  callNifReveal: () => Promise.resolve({ data: null }),
  callNifRevealSingle: () => Promise.resolve(null),
}));

import { useEntityIdentity } from "@/hooks/useEntityIdentity";

const ENTITY = { id: "entity-1", display_name: "Idalina Andrade", first_name: "Idalina", last_name: "Andrade", type: "person" };
const OLD = "2026-11-01T10:00:00+00:00";
const NEW = "2026-11-27T10:00:00+00:00";

const phone = (id: string, number: string, createdAt: string, isPrimary = true) => ({
  id, entity_id: "entity-1", phone_number: number, country_code: "+351", is_primary: isPrimary, created_at: createdAt,
});
const mail = (id: string, email: string, createdAt: string, isPrimary = true) => ({
  id, entity_id: "entity-1", email, is_primary: isPrimary, created_at: createdAt,
});

async function identityOf(entityId: string) {
  const { result } = renderHook(() => useEntityIdentity());
  await act(async () => {
    await result.current.resolveEntities([entityId]);
  });
  return result.current.getIdentity(entityId);
}

beforeEach(() => {
  tables = { anew_entities: [ENTITY] };
});

describe("useEntityIdentity: qual e o telefone principal quando ha varios", () => {
  it("ganha o de created_at mais recente, mesmo que outro tenha um id maior", async () => {
    tables.anew_entity_phones = [
      phone("id-9", "900000009", OLD), // id maior, mas mais antigo
      phone("id-4", "900000004", NEW),
    ];
    expect((await identityOf("entity-1"))?.phone).toBe("900000004");
  });

  it("na mesma hora, ganha o de id maior (e nao o ultimo que a base devolve)", async () => {
    tables.anew_entity_phones = [
      phone("id-7", "900000007", NEW),
      phone("id-9", "900000009", OLD),
      phone("id-3", "900000003", NEW), // empate com id-7: escrito depois, mas id menor
    ];
    const identity = await identityOf("entity-1");
    expect(identity?.phone).toBe("900000007");
    expect(identity?.phone_country_code).toBe("+351");
  });

  it("um telefone que ja nao e principal nunca ganha, por mais recente que seja", async () => {
    tables.anew_entity_phones = [
      phone("id-1", "900000001", OLD),
      phone("id-8", "900000008", NEW, false),
    ];
    expect((await identityOf("entity-1"))?.phone).toBe("900000001");
  });
});

describe("useEntityIdentity: qual e o email principal quando ha varios", () => {
  it("na mesma hora, ganha o de id maior", async () => {
    tables.anew_entity_emails = [
      mail("id-7", "sete@exemplo.pt", NEW),
      mail("id-9", "nove@exemplo.pt", OLD),
      mail("id-3", "tres@exemplo.pt", NEW),
    ];
    expect((await identityOf("entity-1"))?.email).toBe("sete@exemplo.pt");
  });
});
