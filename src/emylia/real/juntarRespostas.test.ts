// 10/11: um ecrã aberto há mais tempo já não apaga as respostas que outra pessoa deu entretanto (a base substitui-as todas ao gravar).
import { describe, expect, it } from "vitest";
import { juntarRespostas } from "./sincronizarNegocios";

describe("juntar as respostas da base antes de gravar", () => {
  it("as que outra pessoa respondeu entretanto ficam", () => {
    const antes = { serie: "FT 2026" }, f: Record<string, string> = { serie: "FT 2026", nif_fat: "123123123" };
    const base = [{ campo_chave: "serie", valor: "FT 2026" }, { campo_chave: "tranche", valor: "1.ª (adjudicação)" }, { campo_chave: "metodo", valor: "Transferência" }];
    expect(juntarRespostas(antes, f, base)).toBe(true);
    expect(f).toEqual({ serie: "FT 2026", nif_fat: "123123123", tranche: "1.ª (adjudicação)", metodo: "Transferência" });
  });
  it("o que este ecrã mudou ganha; o que outra pessoa mudou e este não, fica o da base", () => {
    const antes = { a: "1", b: "1" }, f: Record<string, string> = { a: "2", b: "1" };
    juntarRespostas(antes, f, [{ campo_chave: "a", valor: "9" }, { campo_chave: "b", valor: "5" }]);
    expect(f).toEqual({ a: "2", b: "5" });
  });
  it("o que este ecrã apagou fica apagado", () => {
    const antes = { a: "1" }, f: Record<string, string> = {};
    expect(juntarRespostas(antes, f, [{ campo_chave: "a", valor: "1" }])).toBe(false);
    expect(f).toEqual({});
  });
});
