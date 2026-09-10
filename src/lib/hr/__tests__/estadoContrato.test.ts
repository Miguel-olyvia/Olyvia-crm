/**
 * A precedencia de `derivarEstadoContrato`: nove casos que fecham a regra
 * negocio a negocio, sem depender de base nenhuma.
 */
import { describe, expect, it } from "vitest";
import { derivarEstadoContrato } from "@/lib/hr/estadoContrato";

describe("derivarEstadoContrato", () => {
  it("sem vinculo nenhum, diz 'sem_contrato' -- o caso que originou a mudanca", () => {
    expect(derivarEstadoContrato([])).toBe("sem_contrato");
  });

  it("um vinculo activo diz 'em_curso'", () => {
    expect(derivarEstadoContrato([{ estado: "activo" }])).toBe("em_curso");
  });

  it("activo mais um futuro (renovacao ja registada) continua 'em_curso'", () => {
    expect(derivarEstadoContrato([{ estado: "activo" }, { estado: "futuro" }])).toBe("em_curso");
  });

  it("um vinculo suspenso diz 'suspenso'", () => {
    expect(derivarEstadoContrato([{ estado: "suspenso" }])).toBe("suspenso");
  });

  it("suspenso mais futuro: suspenso ganha -- precedencia 2 antes de 3", () => {
    expect(derivarEstadoContrato([{ estado: "suspenso" }, { estado: "futuro" }])).toBe("suspenso");
  });

  it("so um futuro diz 'por_iniciar'", () => {
    expect(derivarEstadoContrato([{ estado: "futuro" }])).toBe("por_iniciar");
  });

  it("dois terminados dizem 'terminado'", () => {
    expect(derivarEstadoContrato([{ estado: "terminado" }, { estado: "terminado" }])).toBe(
      "terminado",
    );
  });

  it("terminado mais futuro: futuro ganha -- 'por_iniciar'", () => {
    expect(derivarEstadoContrato([{ estado: "terminado" }, { estado: "futuro" }])).toBe(
      "por_iniciar",
    );
  });

  it("um valor desconhecido nao lanca, e diz 'sem_contrato'", () => {
    expect(
      derivarEstadoContrato([{ estado: "xpto" as unknown as "activo" }]),
    ).toBe("sem_contrato");
  });
});
