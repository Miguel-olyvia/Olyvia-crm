import { describe, expect, it } from "vitest";
import { novaLinhaDoCatalogo } from "./catalogoTrabalhos";
import { entradaDoCalculo, erroDoDesconto, errosDaLinha, paraDados, paraEditavel, type LinhaEditavel } from "./orcamentoForm";

const editavel = (extra: Partial<LinhaEditavel> = {}): LinhaEditavel => ({ id: "l1", trabalho: "pavimento", quantidade: "10", preco: "30", ...extra });

describe("paraEditavel", () => {
  it("escreve os números com vírgula decimal, como se escrevem num campo", () => {
    expect(paraEditavel({ ...novaLinhaDoCatalogo("pavimento", "l1"), quantidade: 15.5 })).toEqual({ id: "l1", trabalho: "pavimento", quantidade: "15,5", preco: "30" });
  });
  it("leva o nome dos trabalhos escritos à mão", () => {
    expect(paraEditavel({ ...novaLinhaDoCatalogo("outro", "l1"), nome: "Lareira" }).nome).toBe("Lareira");
  });
});

describe("errosDaLinha", () => {
  it("quantidade e preço têm de ser números maiores que 0 (a vírgula decimal serve)", () => {
    expect(errosDaLinha(editavel())).toEqual({ quantidade: false, preco: false });
    expect(errosDaLinha(editavel({ quantidade: "2,5", preco: "0,5" }))).toEqual({ quantidade: false, preco: false });
    for (const mau of ["", "0", "-1", "abc", "1,2,3"]) {
      expect(errosDaLinha(editavel({ quantidade: mau })).quantidade, mau).toBe(true);
      expect(errosDaLinha(editavel({ preco: mau })).preco, mau).toBe(true);
    }
  });
});

describe("erroDoDesconto", () => {
  it("vazio vale 0; de 0 a 50 serve; fora disso, ou texto, não", () => {
    expect(erroDoDesconto("")).toBe(false);
    expect(erroDoDesconto(" ")).toBe(false);
    for (const bom of ["0", "10", "50", "12,5"]) expect(erroDoDesconto(bom), bom).toBe(false);
    for (const mau of ["50,1", "51", "-1", "abc"]) expect(erroDoDesconto(mau), mau).toBe(true);
  });
});

describe("entradaDoCalculo e paraDados", () => {
  it("o cálculo em tempo real trata o que ainda não é número como 0 (e o desconto inválido também)", () => {
    const e = entradaDoCalculo([editavel(), editavel({ id: "l2", trabalho: "pintura", quantidade: "abc" })], "99");
    expect(e.desconto).toBe(0);
    expect(e.linhas.map((l) => [l.quantidade, l.precoUnitario])).toEqual([[10, 30], [0, 30]]);
  });

  it("os dados que se guardam são números, com o nome dos trabalhos escritos à mão", () => {
    const dados = paraDados([editavel({ quantidade: "12,5", preco: "31,5" }), editavel({ id: "l2", trabalho: "outro", nome: "Lareira" })], "5", true);
    expect(dados).toEqual({
      linhas: [
        { id: "l1", trabalho: "pavimento", quantidade: 12.5, precoUnitario: 31.5 },
        { id: "l2", trabalho: "outro", quantidade: 10, precoUnitario: 30, nome: "Lareira" },
      ],
      desconto: 5, vendaDireta: true,
    });
  });
});
