import { describe, expect, it } from "vitest";
import { preparadoNoNegocio } from "./preparadoDaVisita";

// 4/11 (Rúben): «campos preenchidos não estão a ficar guardados entre preparar a visita e marcar a visita»
describe("o que se preparou passa para «Marcar a visita»", () => {
  it("quem vai estar, a duração e a nota do passo «Preparar a visita»", () => {
    expect(preparadoNoNegocio({ f: { presentes: "O casal", duracao: "1 h 30", nota_visita: " Levar escada " } }))
      .toEqual({ presentesInicial: "casal", duracaoInicialMin: 90, notaInicial: "Levar escada" });
    expect(preparadoNoNegocio({ f: { presentes: "A família", duracao: "2 h" } })).toEqual({ presentesInicial: "familia", duracaoInicialMin: 120 });
  });
  it("sem nada preparado, nada vem preenchido", () => {
    expect(preparadoNoNegocio({ f: {} })).toEqual({});
    expect(preparadoNoNegocio({ f: { presentes: "alguém", duracao: "3 h", nota_visita: "  " } })).toEqual({});
  });
});
