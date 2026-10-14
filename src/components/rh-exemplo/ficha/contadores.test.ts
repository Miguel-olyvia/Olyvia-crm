import { describe, expect, it } from "vitest";
import { criarEstadoInicial } from "@/components/rh-exemplo/dados/exemplo";
import { contadoresDaFicha } from "./contadores";

describe("contadoresDaFicha", () => {
  it("sem ficha, tudo a zero", () => {
    expect(contadoresDaFicha(null)).toEqual({ contratos: 0, documentos: 0, ausenciasPorDecidir: 0 });
  });

  it("conta contratos e documentos, e só os pedidos de ausência por decidir", () => {
    const base = Object.values(criarEstadoInicial().fichas).find((f) => f.ausencias.pedidos.length > 0);
    if (!base) throw new Error("os dados de exemplo deviam ter pelo menos uma pessoa com pedidos de ausência");
    const pedido = base.ausencias.pedidos[0];
    const ficha = {
      vinculos: base.vinculos.slice(0, 1),
      documentos: base.documentos.slice(0, 2),
      ausencias: {
        ...base.ausencias,
        pedidos: [
          { ...pedido, estado: "pendente_chefia" as const },
          { ...pedido, estado: "pendente_rh" as const },
          { ...pedido, estado: "aprovado" as const },
          { ...pedido, estado: "recusado" as const },
        ],
      },
    };
    expect(contadoresDaFicha(ficha)).toEqual({
      contratos: 1,
      documentos: Math.min(2, base.documentos.length),
      ausenciasPorDecidir: 2,
    });
  });
});
