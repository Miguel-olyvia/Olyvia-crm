import { afterEach, describe, expect, it, vi } from "vitest";
import { cpCompleto, procurarCodigoPostal } from "../procurarCodigoPostal";

describe("código postal", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("só está completo com 7 algarismos", () => {
    expect(cpCompleto("2750-100")).toBe("2750-100");
    expect(cpCompleto("2750100")).toBe("2750-100");
    expect(cpCompleto("2750-10")).toBeNull();
    expect(cpCompleto("")).toBeNull();
  });

  it("lê a rua, a localidade, o concelho e o distrito da API", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      district: "Lisboa", municipality: "Cascais", locality: "Cascais", address: { street: "Rua Athilio Santini" },
    }), { status: 200 })));
    expect(await procurarCodigoPostal("2750-100")).toEqual({ rua: "Rua Athilio Santini", localidade: "Cascais", concelho: "Cascais", distrito: "Lisboa" });
  });

  it("sem resposta, dá null e não rebenta", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("rede"); }));
    expect(await procurarCodigoPostal("1000-001")).toBeNull();
  });
});
