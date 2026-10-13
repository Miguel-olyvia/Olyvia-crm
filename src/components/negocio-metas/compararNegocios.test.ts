import { describe, expect, it } from "vitest";
import { compararNegocios } from "./compararNegocios";
import type { NegocioMes } from "./negocioMetas";

const HOJE = "2026-10-13";

/** `valor` null = sem orçamento escolhido; `parado` null = não se aplica. */
const negocio = (id: string, valor: number | null, parado: number | null): NegocioMes => ({
  id, pessoaId: `p-${id}`, pessoa: id, servico: "S", comercial: "C", dias: 5, parado,
  proximoPrazo: null, contacto: { telefone: null, email: null },
  orcamentos: valor === null
    ? [{ id: `${id}-o`, valor: 100, escolhido: false }]
    : [{ id: `${id}-o`, valor, escolhido: true }],
  proposta: valor === null ? null : { estado: "enviada" }, contrato: null,
});

describe("compararNegocios", () => {
  it("marca o maior valor e o mais parado", () => {
    const r = compararNegocios([negocio("a", 5000, 2), negocio("b", 9000, 9), negocio("c", 7000, null)], HOJE);
    expect(r.melhorValor).toEqual(["b"]);
    expect(r.maisParado).toEqual(["b"]);
    expect(r.negocios.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
  it("a melhor célula de cada linha pode ser de negócios diferentes", () => {
    const r = compararNegocios([negocio("a", 9000, 2), negocio("b", 5000, 9)], HOJE);
    expect(r.melhorValor).toEqual(["a"]);
    expect(r.maisParado).toEqual(["b"]);
  });
  it("empate: todas as células empatadas ficam marcadas", () => {
    const r = compararNegocios([negocio("a", 9000, 4), negocio("b", 9000, 4), negocio("c", 3000, 1)], HOJE);
    expect(r.melhorValor).toEqual(["a", "b"]);
    expect(r.maisParado).toEqual(["a", "b"]);
  });
  it("quando todas as células são iguais não há melhor", () => {
    const r = compararNegocios([negocio("a", 9000, 4), negocio("b", 9000, 4)], HOJE);
    expect(r.melhorValor).toEqual([]);
    expect(r.maisParado).toEqual([]);
  });
  it("negócios sem valor ou sem parado ficam de fora da linha", () => {
    const r = compararNegocios([negocio("a", null, null), negocio("b", 100, null), negocio("c", 300, 5)], HOJE);
    expect(r.melhorValor).toEqual(["c"]);
    expect(r.maisParado).toEqual([]);
  });
  it("com um só valor comparável (os outros nulos) não há melhor", () => {
    const r = compararNegocios([negocio("a", null, null), negocio("b", 100, 4)], HOJE);
    expect(r.melhorValor).toEqual([]);
    expect(r.maisParado).toEqual([]);
  });
  it("todos nulos: nada marcado", () => {
    const r = compararNegocios([negocio("a", null, null), negocio("b", null, null)], HOJE);
    expect(r.melhorValor).toEqual([]);
    expect(r.maisParado).toEqual([]);
  });
  it("um negócio sozinho não tem melhor; mais de 3 contam só os 3 primeiros", () => {
    expect(compararNegocios([negocio("a", 100, 1)], HOJE).melhorValor).toEqual([]);
    const r = compararNegocios(
      [negocio("a", 1, 1), negocio("b", 2, 2), negocio("c", 3, 3), negocio("d", 99, 99)], HOJE,
    );
    expect(r.negocios).toHaveLength(3);
    expect(r.melhorValor).toEqual(["c"]);
  });
  it("sem negócios não há nada", () => {
    expect(compararNegocios([], HOJE)).toMatchObject({ negocios: [], melhorValor: [], maisParado: [], saude: [] });
  });
  it("devolve a saúde de cada negócio, na mesma ordem", () => {
    const r = compararNegocios(
      [negocio("a", 100, 12), { ...negocio("b", 100, null), proximoPrazo: "2026-10-01" }], HOJE,
    );
    expect(r.saude).toEqual(["parado", "atraso"]);
  });
});
