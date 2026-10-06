import { describe, expect, it } from "vitest";
import { FICHA_TECNICA_VAZIA } from "../fichaTecnicaEdificio";
import { camposEmFaltaFicha, fichaComDados } from "../fichaEmFalta";
import { normalizarCodigoPostal, textoDistanciaArmazem } from "../distanciaArmazem";

describe("camposEmFaltaFicha", () => {
  it("ficha vazia ou inexistente: nada (é 'por preencher', não 'incompleta')", () => {
    expect(camposEmFaltaFicha(null)).toEqual([]);
    expect(camposEmFaltaFicha(FICHA_TECNICA_VAZIA, "2")).toEqual([]);
    expect(fichaComDados(FICHA_TECNICA_VAZIA)).toBe(false);
  });

  it("diz só o que falta dos campos que o planeamento usa", () => {
    const f = { ...FICHA_TECNICA_VAZIA, acesso: "dificil" as const, tem_elevador: false, pavimento: "ceramico" as const };
    expect(camposEmFaltaFicha(f, "4")).toEqual(["estacionamento", "casa habitada"]);
  });

  it("false conta como preenchido; o andar vem da morada", () => {
    const f = {
      ...FICHA_TECNICA_VAZIA,
      acesso: "facil" as const,
      estacionamento: "pago" as const,
      tem_elevador: false,
      habitada_durante_obra: false,
      pavimento: "madeira" as const,
    };
    expect(camposEmFaltaFicha(f, "3")).toEqual([]);
    expect(camposEmFaltaFicha(f, " ")).toEqual(["andar"]);
  });
});

describe("distância ao armazém", () => {
  it("normaliza o código postal (só dígitos, pelo menos 4)", () => {
    expect(normalizarCodigoPostal("1675-195 ")).toBe("1675195");
    expect(normalizarCodigoPostal("12")).toBeNull();
    expect(normalizarCodigoPostal(null)).toBeNull();
  });

  it("texto: armazém, km de estrada, minutos e a nota de zona", () => {
    const base = { armazem: "Lisboa", km_estrada: 30.3, km_ida_volta: 61, minutos: 49 };
    expect(textoDistanciaArmazem({ ...base, precisao_obra: "cp7" })).toBe("Armazém Lisboa · 30,3 km · ~49 min");
    expect(textoDistanciaArmazem({ ...base, precisao_obra: "cp4" })).toMatch(/pela zona do código postal/);
  });
});
