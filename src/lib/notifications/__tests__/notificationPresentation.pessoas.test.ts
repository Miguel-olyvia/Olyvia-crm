import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { getNotificationRoute } from "../notificationPresentation";

const rota = (n: Record<string, unknown>) => getNotificationRoute(n as never);

describe("getNotificationRoute: leads, contactos e clientes abrem em /pessoas", () => {
  it("action_config com client_id e contact_id", async () => {
    expect(await rota({ action_config: { client_id: "C1" } })).toBe("/pessoas?open=C1");
    expect(await rota({ action_config: { contact_id: "K1" } })).toBe("/pessoas?open=K1");
  });

  it.each(["lead", "contact", "client"])("entity_type %s com id", async (tipo) => {
    expect(await rota({ entity_type: tipo, entity_id: "X1" })).toBe("/pessoas?open=X1");
  });

  it.each(["lead", "contact", "client"])("entity_type %s sem id vai a /pessoas", async (tipo) => {
    expect(await rota({ entity_type: tipo })).toBe("/pessoas");
  });

  it("as outras entidades ficam como estavam", async () => {
    expect(await rota({ entity_type: "quote", entity_id: "Q1" })).toBe("/quotes?open=Q1");
    expect(await rota({ entity_type: "proposal" })).toBe("/proposals");
  });
});
