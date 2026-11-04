import { describe, expect, it, vi } from "vitest";
import { acoes, moradaDoTexto, seed, type Negocio } from "../motor";
import { lerMoradasDasPessoas, moradaDaFicha, sugerirMoradas } from "./moradaDaLead";

// 4/11 (Rúben): a «Morada da obra» vai buscar a morada que a lead já trazia
describe("a morada que a lead já trazia", () => {
  it("lê a morada da ficha em partes (rua e número, código postal, localidade, andar e fração)", () => {
    expect(moradaDaFicha({ street: "Estrada de Santo Eloy", number: "12", floor: "3.º", unit: "Esq.", postal_code: "1675-010", city: "Odivelas" }))
      .toEqual({ morada: "Estrada de Santo Eloy 12", cp: "1675-010", localidade: "Odivelas", fracao: "3.º Esq.", de: "ficha" });
    expect(moradaDaFicha({ street: " ", number: "1", floor: null, unit: null, postal_code: "1675-010", city: "Odivelas" })).toBeNull();
  });

  it("a do pedido só se sugere com código postal (sem ele não se sabe o que é rua e o que é localidade)", () => {
    expect(moradaDoTexto("Estrada de Santo Eloy, 1675-010 Odivelas · 1")).toEqual({ morada: "Estrada de Santo Eloy", cp: "1675-010", localidade: "Odivelas", fracao: "1", de: "pedido" });
    expect(moradaDoTexto("Rua Morais Soares 112, 1900-341 Lisboa")).toMatchObject({ morada: "Rua Morais Soares 112", cp: "1900-341", localidade: "Lisboa", fracao: "" });
    expect(moradaDoTexto("Almada")).toBeNull();
    expect(moradaDoTexto("Rua das Flores 12, Sintra")).toBeNull();
    expect(moradaDoTexto("")).toBeNull();
  });

  it("de cada pessoa fica a principal (ou a mais recente); um erro a ler deixa tudo sem sugestões", async () => {
    const linhas = [
      { entity_id: "p1", is_primary: true, anew_addresses: { street: "Rua A", number: "1", floor: null, unit: null, postal_code: "1000-001", city: "Lisboa" } },
      { entity_id: "p1", is_primary: false, anew_addresses: { street: "Rua B", number: "2", floor: null, unit: null, postal_code: "1000-002", city: "Lisboa" } },
      { entity_id: "p2", is_primary: false, anew_addresses: { street: "", number: "", floor: null, unit: null, postal_code: "", city: "" } },
    ];
    const order2 = vi.fn(async () => ({ data: linhas, error: null }));
    const sb = { from: vi.fn(() => ({ select: () => ({ in: () => ({ order: () => ({ order: order2 }) }) }) })) } as never;
    const m = await lerMoradasDasPessoas(sb, ["p1", "p2", "p1", ""]);
    expect([...m.keys()]).toEqual(["p1"]);
    expect(m.get("p1")?.morada).toBe("Rua A 1");
    const falha = { from: () => { throw new Error("sem permissão"); } } as never;
    expect((await lerMoradasDasPessoas(falha, ["p1"])).size).toBe(0);
    expect((await lerMoradasDasPessoas(sb, [])).size).toBe(0);
  });

  it("sugere a da ficha e, sem ela, a do pedido; com a morada da obra já escrita não sugere nada", () => {
    const neg = (id: number, local: string, morada = "") => ({ id, local, f: { morada } }) as unknown as Negocio;
    const a = neg(1, "Rua X, 1000-001 Lisboa"), b = neg(2, "Rua Y, 2000-002 Santarém"), c = neg(3, "Rua Z, 3000-003 Coimbra", "Já escrita");
    const ficha = new Map([["p1", { morada: "Rua da Ficha 5", cp: "1000-005", localidade: "Lisboa", fracao: "", de: "ficha" as const }]]);
    sugerirMoradas([a, b, c], (d) => (d.id === 1 ? "p1" : "p2"), ficha);
    expect(a.moradaLead?.morada).toBe("Rua da Ficha 5");
    expect(b.moradaLead).toMatchObject({ morada: "Rua Y", de: "pedido" });
    expect(c.moradaLead).toBeUndefined();
  });

  it("validar preenche os campos da morada da obra com o que a lead trazia e fica no histórico; o que falta fica por preencher", () => {
    const S = seed(); S.role = "comercial";
    const d = S.deals.find((x) => x.fase === 1)!;
    for (const k of ["morada", "cp", "localidade", "fracao"]) delete d.f[k];
    acoes(S, () => {}, (fn) => fn()).moradaDaLead(d.id, { morada: "Rua A 1", cp: "1000-001", localidade: "Lisboa", fracao: "", de: "ficha" });
    expect(d.f).toMatchObject({ morada: "Rua A 1", cp: "1000-001", localidade: "Lisboa" });
    expect(d.f.fracao).toBeUndefined();
    expect(d.hist[0].t).toBe("Morada da obra validada a partir da ficha do cliente");
  });
});
