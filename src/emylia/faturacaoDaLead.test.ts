import { beforeEach, describe, expect, it } from "vitest";
import { acoes, herdarFaturacao, seed, type Estado } from "./motor";

// 3/11 (Rúben): o NIF e o email da faturação vêm da Lead (a primeira fase), sem os escrever outra vez no Financeiro
describe("os dados de faturação vêm da Lead", () => {
  let S: Estado;
  const d = () => S.deals.find((x) => x.id === 1027)!;
  beforeEach(() => { S = seed(); S.role = "financeiro"; });

  it("um negócio no Financeiro com o NIF e o email por preencher recebe-os da Lead", () => {
    expect(d().fase).toBe(4);
    Object.assign(d().f, { nif: "271576596", email: "cliente@exemplo.pt", nif_fat: "", email_fat: "" });
    expect(herdarFaturacao(d())).toBe(true);
    expect(d().f).toMatchObject({ nif_fat: "271576596", email_fat: "cliente@exemplo.pt" });
    expect(herdarFaturacao(d())).toBe(false);
  });

  it("o que alguém escreveu na faturação não se troca; já pago, não se mexe", () => {
    Object.assign(d().f, { nif: "271576596", email: "cliente@exemplo.pt", nif_fat: "509999999", email_fat: "faturas@empresa.pt" });
    expect(herdarFaturacao(d())).toBe(false);
    expect(d().f).toMatchObject({ nif_fat: "509999999", email_fat: "faturas@empresa.pt" });
    Object.assign(d().f, { nif_fat: "", email_fat: "" });
    d().fin.pago = true;
    expect(herdarFaturacao(d())).toBe(false);
  });

  it("mudar o NIF ou o email na Lead muda a faturação, se não foi escrita à parte", () => {
    const A = acoes(S, () => {}, (fn) => fn());
    Object.assign(d().f, { nif: "271576596", nif_fat: "271576596", email: "", email_fat: "" });
    A.campo(1027, "nif", "123456789");
    A.campo(1027, "email", "novo@exemplo.pt");
    expect(d().f).toMatchObject({ nif_fat: "123456789", email_fat: "novo@exemplo.pt" });
    d().f.email_fat = "faturas@empresa.pt";
    A.campo(1027, "email", "outro@exemplo.pt");
    expect(d().f.email_fat).toBe("faturas@empresa.pt");
  });
});
