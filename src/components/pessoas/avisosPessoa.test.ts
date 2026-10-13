import { describe, expect, it } from "vitest";
import { avisosPessoa } from "./avisosPessoa";

const base = { ultimoContactoDias: 2 };

describe("avisosPessoa", () => {
  it("sem nada a avisar, lista vazia", () => {
    expect(avisosPessoa({ pessoa: base, voltou: false, podeVerSubmissoes: true })).toEqual([]);
  });
  it("Voltou a contactar só com permissão para ver submissões", () => {
    expect(avisosPessoa({ pessoa: base, voltou: true, podeVerSubmissoes: true })).toEqual([{ tipo: "voltou" }]);
    expect(avisosPessoa({ pessoa: base, voltou: true, podeVerSubmissoes: false })).toEqual([]);
  });
  it("Sem contacto há N dias a partir de 7 (6 não, 7 sim)", () => {
    expect(avisosPessoa({ pessoa: { ultimoContactoDias: 6 }, voltou: false, podeVerSubmissoes: true })).toEqual([]);
    expect(avisosPessoa({ pessoa: { ultimoContactoDias: 7 }, voltou: false, podeVerSubmissoes: true })).toEqual([{ tipo: "semContacto", dias: 7 }]);
  });
  it("os dois, por ordem; e uma perdida não leva Sem contacto", () => {
    expect(avisosPessoa({ pessoa: { ultimoContactoDias: 12 }, voltou: true, podeVerSubmissoes: true }).map((a) => a.tipo)).toEqual(["voltou", "semContacto"]);
    const perdida = { ultimoContactoDias: 12, perdida: { motivo: "preco", data: "2026-10-01" } } as const;
    expect(avisosPessoa({ pessoa: perdida, voltou: false, podeVerSubmissoes: true })).toEqual([]);
  });
  it("uma lead perdida com negócios abertos avisa que ficam à parte; sem eles, não", () => {
    const perdida = { ultimoContactoDias: 2, perdida: { motivo: "preco", data: "2026-10-01" } } as const;
    expect(avisosPessoa({ pessoa: perdida, voltou: false, podeVerSubmissoes: false, negociosAbertos: 2 })).toEqual([{ tipo: "negociosAbertosPerdida", quantos: 2 }]);
    expect(avisosPessoa({ pessoa: perdida, voltou: false, podeVerSubmissoes: false, negociosAbertos: 0 })).toEqual([]);
    expect(avisosPessoa({ pessoa: base, voltou: false, podeVerSubmissoes: false, negociosAbertos: 2 })).toEqual([]);
  });
});
