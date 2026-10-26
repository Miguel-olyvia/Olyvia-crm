import { describe, expect, it, vi } from "vitest";
import type { ReceivablePo } from "../porReceber";
import { resolveReceivingCode, type ResolveDeps } from "../resolveReceivingCode";

const po = (id: string, orderNumber: string, supplierId: string, productIds: string[] = ["p1"]): ReceivablePo => ({
  id,
  orderNumber,
  status: "ordered",
  supplierId,
  supplierName: supplierId === "s1" ? "Zeta Cerâmicas" : "Alfa",
  expectedDelivery: null,
  orderDate: null,
  contractId: null,
  origin: null,
  publication: null,
  emailSent: false,
  lines: productIds.map((p, i) => ({
    id: `${id}-l${i}`,
    productId: p,
    name: `Produto ${p}`,
    sku: null,
    quantity: 5,
    received: 0,
    open: 5,
    uomId: null,
    uomCode: null,
    unitsPerUom: 1,
  })),
});

const POS = [po("a", "PO-2026-0146", "s1", ["p1"]), po("b", "PO-2026-0246", "s1", ["p2"]), po("c", "PO-2026-0300", "s2", ["p1", "p3"])];

function deps(o: Partial<ResolveDeps> = {}): ResolveDeps {
  return {
    pos: POS,
    suppliers: [
      { id: "s1", name: "Zeta Cerâmicas" },
      { id: "s2", name: "Alfa" },
      { id: "s3", name: "Zeta Banhos" },
    ],
    findPoByNumber: vi.fn(async () => null),
    findNote: vi.fn(async () => null),
    lookupProduct: vi.fn(async () => []),
    ...o,
  };
}

describe("resolveReceivingCode", () => {
  it("o nº da PO inteiro (sem maiúsculas) abre a PO, sem perguntar à BD", async () => {
    const d = deps();
    expect(await resolveReceivingCode("po-2026-0146", d)).toEqual({ t: "po", po: "a" });
    expect(d.findNote).not.toHaveBeenCalled();
  });

  it("PO que já não está por receber dá aviso", async () => {
    const d = deps({ findPoByNumber: async () => ({ orderNumber: "PO-2026-0001" }) });
    expect(await resolveReceivingCode("PO-2026-0001", d)).toEqual({ t: "nada", aviso: "PO-2026-0001 já não está por receber." });
  });

  it("guia aberta: uma PO abre com a guia; várias filtram; fechada avisa", async () => {
    const note = { id: "g1", noteNumber: "GR 311", status: "open", supplierId: "s1", supplierName: "Zeta", poIds: ["b"] };
    expect(await resolveReceivingCode("GR 311", deps({ findNote: async () => note }))).toEqual({ t: "po", po: "b", noteId: "g1" });
    const semPos = { ...note, poIds: [] };
    expect(await resolveReceivingCode("GR 311", deps({ findNote: async () => semPos }))).toMatchObject({ t: "guia", pos: ["a", "b"] });
    const fechada = { ...note, status: "closed" };
    expect(await resolveReceivingCode("GR 311", deps({ findNote: async () => fechada }))).toEqual({
      t: "nada",
      aviso: "A guia GR 311 não está aberta.",
    });
  });

  it("os últimos dígitos: uma PO abre, várias filtram", async () => {
    expect(await resolveReceivingCode("0300", deps())).toEqual({ t: "po", po: "c" });
    expect(await resolveReceivingCode("46", deps())).toEqual({ t: "pos", pos: ["a", "b"] });
  });

  it("um artigo encontra as POs que o têm", async () => {
    const um = deps({ lookupProduct: async () => [{ productId: "p3", name: "Torneira" }] });
    expect(await resolveReceivingCode("5601234000028", um)).toEqual({ t: "po", po: "c", productId: "p3" });
    const varios = deps({ lookupProduct: async () => [{ productId: "p1", name: "Base" }] });
    expect(await resolveReceivingCode("5601234000011", varios)).toEqual({ t: "artigos", names: ["Base"], pos: ["a", "c"] });
    const nenhum = deps({ lookupProduct: async () => [{ productId: "p9", name: "Espelho" }] });
    expect(await resolveReceivingCode("EAN9", nenhum)).toEqual({
      t: "nada",
      aviso: "«EAN9» é Espelho, mas não há encomendas por receber com esse artigo.",
    });
  });

  it("fornecedor: nome inteiro ou parte com 3+ letras; ambíguo avisa", async () => {
    expect(await resolveReceivingCode("alfa", deps())).toEqual({ t: "forn", supplierId: "s2", supplierName: "Alfa" });
    expect(await resolveReceivingCode("banhos", deps())).toEqual({ t: "forn", supplierId: "s3", supplierName: "Zeta Banhos" });
    expect(await resolveReceivingCode("zeta", deps())).toEqual({ t: "nada", aviso: "«zeta» serve 2 fornecedores: escreva mais do nome." });
    expect(await resolveReceivingCode("ze", deps())).toEqual({ t: "nada", aviso: undefined });
  });

  it("sem armazém não procura artigos e diz porquê quando nada serve", async () => {
    const d = deps({ lookupProduct: async () => ({ error: "Escolha o armazém." }) });
    expect(await resolveReceivingCode("XYZ123", d)).toEqual({ t: "nada", aviso: "Não encontrei «XYZ123». Escolha o armazém." });
  });
});
