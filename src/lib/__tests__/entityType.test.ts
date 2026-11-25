import { describe, expect, it } from "vitest";
import { clientTypeForEntity, isOrganizationEntity } from "@/lib/entityType";

describe("tipo da ficha (anew_entities.type: person | organization)", () => {
  it("organization e empresa; person e qualquer outro valor nao sao", () => {
    expect(isOrganizationEntity("organization")).toBe(true);
    expect(isOrganizationEntity("person")).toBe(false);
    expect(isOrganizationEntity(null)).toBe(false);
    expect(isOrganizationEntity(undefined)).toBe(false);
  });

  it("'company' nao e um tipo de ficha (era o valor errado que nunca coincidia)", () => {
    expect(isOrganizationEntity("company")).toBe(false);
  });

  it("o client_type de anew_clients: empresa so para fichas organization", () => {
    expect(clientTypeForEntity("organization")).toBe("company");
    expect(clientTypeForEntity("person")).toBe("person");
    expect(clientTypeForEntity(undefined)).toBe("person");
  });
});
