import { beforeEach, describe, expect, it } from "vitest";
import { esquecerDiaADia, lerRegistos, registar } from "./diaADia";
import { contactosDe } from "./FuncAcoes";

beforeEach(() => esquecerDiaADia());

describe("diaADia · esquecer não repete ids", () => {
  it("os ids continuam a crescer depois de esquecerDiaADia", () => {
    const a = registar({ nome: "Ana", tipo: "nota", texto: "x" });
    esquecerDiaADia();
    expect(lerRegistos()).toHaveLength(0);
    const b = registar({ nome: "Ana", tipo: "nota", texto: "y" });
    expect(b.id).toBeGreaterThan(a.id);
  });
});

describe("contactosDe · mailto", () => {
  it("codifica o email no link", () => {
    expect(contactosDe({ telefone: "", email: " a+b?x=1&y@ex.pt " }).mail).toBe(`mailto:${encodeURIComponent("a+b?x=1&y@ex.pt")}`);
  });
  it("sem email ou telefone não há links", () => {
    expect(contactosDe({ telefone: "", email: "  " })).toEqual({ tel: null, wa: null, mail: null });
  });
});
