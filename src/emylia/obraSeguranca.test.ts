// 17/11 (A-Z na Mudelar: «Pedido à Câmara de da zona»): a licença da via pública diz a câmara pela localidade da obra; sem ela, «Câmara Municipal».
import { describe, expect, it } from "vitest";
import { seed, type Negocio } from "./motor";
import { seguranca } from "./obraOps";

const negocio = (localidade?: string): Negocio => {
  const d = structuredClone(seed().deals[0]) as Negocio;
  d.f = { ...d.f, nota: "contentor na via pública", ...(localidade !== undefined ? { localidade } : {}) };
  delete (d.f as Record<string, string>).localidade;
  if (localidade) d.f.localidade = localidade;
  d.obra = { ...d.obra, seg: {} };
  return d;
};

describe("a licença da via pública", () => {
  it("com a localidade, a câmara dela", () => {
    expect(seguranca(negocio("Oeiras")).find((x) => x.k === "via")?.sub).toBe("Para o contentor de entulho. Pedido à Câmara de Oeiras.");
  });
  it("sem a localidade, «Câmara Municipal» (nunca «Câmara de da zona»)", () => {
    const sub = seguranca(negocio()).find((x) => x.k === "via")?.sub ?? "";
    expect(sub).toBe("Para o contentor de entulho. Pedido à Câmara Municipal.");
    expect(sub).not.toMatch(/de da/);
  });
});
