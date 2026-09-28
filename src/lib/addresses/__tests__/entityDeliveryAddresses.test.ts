import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import { formatDeliveryAddress } from "../entityDeliveryAddresses";

describe("formatDeliveryAddress", () => {
  it("inclui andar e fração quando existem", () => {
    expect(formatDeliveryAddress({
      street: "Rua X", number: "12", floor: "3º", unit: "Esq", postal_code: "1000-001", city: "Lisboa",
    })).toBe("Rua X, 12, 3º Esq, 1000-001 Lisboa");
  });

  it("omite número, andar e fração vazios", () => {
    expect(formatDeliveryAddress({
      street: " Rua Y ", number: "", floor: null, unit: "  ", postal_code: "4000-100", city: "Porto",
    })).toBe("Rua Y, 4000-100 Porto");
  });

  it("aceita só a fração", () => {
    expect(formatDeliveryAddress({
      street: "Av. Z", number: "5", floor: "", unit: "B", postal_code: "3000-000", city: "Coimbra",
    })).toBe("Av. Z, 5, B, 3000-000 Coimbra");
  });

  it("devolve vazio sem morada", () => {
    expect(formatDeliveryAddress(null)).toBe("");
    expect(formatDeliveryAddress({})).toBe("");
  });
});
