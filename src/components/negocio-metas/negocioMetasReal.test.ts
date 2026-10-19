// Os dois campos que a ficha real acrescenta ao negócio: `valorBase` (o valor que a base calcula) e `estadoReal` (o estado que a base diz).
// Sem eles, tudo se comporta como antes (os negócios de exemplo não os têm).
import { describe, expect, it } from "vitest";
import { faseDoNegocio, isNegocioGanho, valorDoNegocio, type NegocioMes } from "./negocioMetas";

const base: NegocioMes = {
  id: "x", pessoaId: "p-x", pessoa: "P", servico: "S", comercial: "C", dias: 1, parado: null,
  proximoPrazo: null, contacto: { telefone: null, email: null },
  orcamentos: [{ id: "a", valor: 100, escolhido: true }, { id: "b", valor: 300, escolhido: false }],
  proposta: null, contrato: null,
};

describe("valorDoNegocio com valorBase", () => {
  it("o valor da base manda sobre o orçamento escolhido", () => {
    expect(valorDoNegocio({ ...base, valorBase: 750 })).toBe(750);
  });

  it("um valorBase de 0 também manda (a base disse zero)", () => {
    expect(valorDoNegocio({ ...base, valorBase: 0 })).toBe(0);
  });

  it("sem valorBase continua a ser o orçamento escolhido (ou 0)", () => {
    expect(valorDoNegocio(base)).toBe(100);
    expect(valorDoNegocio({ ...base, orcamentos: [] })).toBe(0);
  });
});

describe("isNegocioGanho com estadoReal", () => {
  const assinado = { contrato: { estado: "assinado" as const } };

  it("sem estadoReal, contrato assinado é ganho (como sempre)", () => {
    expect(isNegocioGanho({ ...base, ...assinado })).toBe(true);
    expect(isNegocioGanho(base)).toBe(false);
  });

  it("um negócio aberto com contrato assinado não é ganho: fica pronto a ganhar", () => {
    expect(isNegocioGanho({ ...base, ...assinado, estadoReal: "aberto" })).toBe(false);
  });

  it("só o estado «ganho» da base conta como ganho", () => {
    expect(isNegocioGanho({ ...base, estadoReal: "ganho" })).toBe(true);
    expect(isNegocioGanho({ ...base, ...assinado, estadoReal: "perdido" })).toBe(false);
  });

  it("a fase continua a ler a cadeia (um aberto com contrato assinado mostra a fase do contrato assinado)", () => {
    expect(faseDoNegocio({ ...base, ...assinado, estadoReal: "aberto" })).toBe("ganho");
  });
});
