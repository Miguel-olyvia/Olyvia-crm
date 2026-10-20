// Uma visita cancelada não se oferece para ligar a um negócio: fora dos registos por ligar da pessoa. Continua a ser da pessoa.
import { describe, expect, it } from "vitest";
import { visitaPessoaBase } from "@/components/pessoas/fabricaTestes";
import { registosDaPessoa, registosPorLigar } from "./acoesRegistos";
import type { EstadoRegistos } from "./registosTipos";

const ESTADO: EstadoRegistos = {
  contactos: [],
  visitas: [
    visitaPessoaBase("rv-1"), visitaPessoaBase("rv-c", { estado: "cancelada" }), visitaPessoaBase("rv-f", { estado: "feita" }),
    visitaPessoaBase("rv-n", { negocioId: "n1" }),
  ],
  levantamentos: [],
};

describe("registosPorLigar e as visitas canceladas", () => {
  it("não inclui a cancelada, e mantém as por fazer e as feitas livres", () => {
    expect(registosPorLigar(ESTADO, "a").visitas.map((v) => v.id)).toEqual(["rv-1", "rv-f"]);
  });

  it("a cancelada continua a ser da pessoa (não desaparece dos registos dela)", () => {
    expect(registosDaPessoa(ESTADO, "a").visitas.map((v) => v.id)).toContain("rv-c");
  });
});
