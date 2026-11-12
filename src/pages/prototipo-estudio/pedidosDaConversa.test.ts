import { describe, expect, it } from "vitest";
import type { Fala } from "@/emylia/chamadaMotor";
import { chavesDosPedidos, pedidosDaConversa, resumoPedidos } from "./pedidosDaConversa";

let t = 0;
const f = (texto: string, falante: Fala["falante"] = "cliente"): Fala => ({ inicio: (t += 5), fim: t + 4, texto, falante, confianca_falante: 1 });
const pecas = (...xs: string[]) => pedidosDaConversa(xs.map((x) => f(x)), "visita").pecas.map((d) => `${d.tipo}:${d.acao}`);
const servicos = (...xs: string[]) => pedidosDaConversa(xs.map((x) => f(x)), "visita").servicos.map((d) => `${d.id}:${d.quer}`);

describe("as peças decididas em voz alta", () => {
  it("tirar, trocar, manter e juntar", () => {
    expect(pecas("Quero tirar o bidé.")).toEqual(["bide:tira"]);
    expect(pecas("Não quero o bidé.")).toEqual(["bide:tira"]);
    expect(pecas("O bidé sai.")).toEqual(["bide:tira"]);
    expect(pecas("Vamos trocar a sanita.")).toEqual(["sanita:troca"]);
    expect(pecas("Queria uma sanita nova.")).toEqual(["sanita:junta"]);
    expect(pecas("A banheira fica.")).toEqual(["banheira:fica"]);
    expect(pecas("Quero uma base de duche.")).toEqual(["base:junta"]);
    expect(pecas("Tirar a banheira e pôr uma base de duche.")).toEqual(["banheira:tira", "base:junta"]);
  });

  it("a negação vira a decisão; a cor não é «fica»; o que não é decisão não conta", () => {
    expect(pecas("Não quero tirar o bidé.")).toEqual(["bide:fica"]);
    expect(pecas("Fica a sanita preta.")).toEqual([]);
    expect(pecas("Quero um nicho no duche.")).toEqual([]);
    expect(pecas("O bidé está velho.")).toEqual([]);
  });

  it("a pergunta só conta com o sim", () => {
    expect(pedidosDaConversa([f("Tiramos o bidé?", "comercial"), f("Hum, não sei.")], "visita").pecas).toEqual([]);
    expect(pedidosDaConversa([f("Tiramos o bidé?", "comercial"), f("Sim, pode tirar.")], "visita").pecas.map((d) => d.acao)).toEqual(["tira"]);
  });
});

describe("os serviços pedidos em voz alta", () => {
  it("junta os pedidos e tira os dispensados", () => {
    expect(servicos("Quero um nicho no duche.")).toEqual(["sv-nicho:true"]);
    expect(servicos("Também é para pintar o teto.")).toEqual(["sv-pintura-teto:true"]);
    expect(servicos("Precisava de uma tomada nova ao pé do espelho.")).toEqual(["sv-tomada:true"]);
    expect(servicos("A limpeza não é precisa, fazemos nós.")).toEqual(["sv-limpeza:false"]);
    expect(servicos("Dispenso o rodapé.")).toEqual(["sv-rodape:false"]);
    expect(servicos("Temos nichos de vários tamanhos.")).toEqual([]);
  });

  it("chaves e resumo: a última decisão ganha", () => {
    const p = pedidosDaConversa([f("Quero tirar o bidé."), f("Afinal o bidé fica."), f("Quero um nicho no duche.")], "visita");
    expect(resumoPedidos(p)).toEqual(["Bidé: fica", "Nicho embutido no duche: juntar"]);
    expect(chavesDosPedidos(p).pecas).toEqual(["peca|bide|tira#1", "peca|bide|fica#1"]);
  });
});
