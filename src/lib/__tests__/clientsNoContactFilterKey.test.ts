import { describe, it, expect } from "vitest";
import { buildNoContactFilterKey } from "../clientsNoContactFilterKey";

const a = "11111111-1111-1111-1111-111111111111";
const b = "22222222-2222-2222-2222-222222222222";

describe("buildNoContactFilterKey", () => {
  it("devolve vazio para qualquer filtro que nao seja no_contact_30d", () => {
    // O ponto do teste: com outro filtro, mudar o conteudo do alerta NAO pode
    // produzir uma chave nova -- e o que fecha o ciclo de recarregamento.
    expect(buildNoContactFilterKey("all", [{ entityId: a }])).toBe("");
    expect(buildNoContactFilterKey("all", [{ entityId: a }, { entityId: b }])).toBe("");
    expect(buildNoContactFilterKey("active", [{ entityId: b }])).toBe("");
    expect(buildNoContactFilterKey("expiring_contracts", [{ entityId: a }])).toBe("");
  });

  it("e insensivel a ordem e a duplicados em no_contact_30d", () => {
    const k1 = buildNoContactFilterKey("no_contact_30d", [{ entityId: a }, { entityId: b }]);
    const k2 = buildNoContactFilterKey("no_contact_30d", [{ entityId: b }, { entityId: a }, { entityId: a }]);
    expect(k1).toBe(k2);
  });

  it("muda quando o conjunto em risco muda mesmo", () => {
    const k1 = buildNoContactFilterKey("no_contact_30d", [{ entityId: a }]);
    const k2 = buildNoContactFilterKey("no_contact_30d", [{ entityId: a }, { entityId: b }]);
    expect(k1).not.toBe(k2);
  });

  it("ignora entradas sem entityId", () => {
    expect(buildNoContactFilterKey("no_contact_30d", [{ entityId: null }, { entityId: "" }, { entityId: a }])).toBe(a);
    expect(buildNoContactFilterKey("no_contact_30d", [])).toBe("");
  });
});
