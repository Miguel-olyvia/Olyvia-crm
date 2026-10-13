import { describe, expect, it } from "vitest";
import { efeitosDoCampo, efeitosDoLevantamento } from "./efeitosLevantamento";

describe("efeitos do levantamento no orçamento", () => {
  it("as proteções dão linhas com custo e preço", () => {
    const e = efeitosDoLevantamento({ diag_distancia_entrada: "Média (5–15 m)", diag_portas_proteger: "3", tem_elevador: "Sim", diag_mobilada: "Muito" });
    expect(e.map((x) => x.d)).toEqual([
      "Proteção do caminho: cartão canelado (12 m)", "Plástico de proteção em 3 portas", "Cobrir os móveis no caminho (muito)", "Proteção do elevador",
    ]);
    expect(e[0]).toMatchObject({ t: "linha", custo: 13.2, preco: 26.4 });
    expect(e[1]).toMatchObject({ custo: 9, preco: 21 });
  });

  it("sem elevador, a escada custa horas por andar", () => {
    expect(efeitosDoCampo("andar", { tem_elevador: "Não", andar: "3" })[0]).toMatchObject({ preco: 157.5, custo: 99 });
    expect(efeitosDoCampo("andar", { tem_elevador: "Sim", andar: "3" })).toEqual([]);
  });

  it("acesso difícil, casa habitada e sem janela são percentagens", () => {
    const e = efeitosDoLevantamento({ acesso: "Difícil", impacto_percent: "10%", habitada_durante_obra: "Sim", diag_janela: "Não" });
    expect(e.map((x) => [x.t, x.pct])).toEqual([["percent", 0.1], ["percent", 0.04], ["percent", 0.03]]);
  });

  it("materiais do cliente tiram a linha de materiais", () => {
    expect(efeitosDoCampo("materiais_cliente", { materiais_cliente: "Sim" })[0].fator).toBe(0);
    expect(efeitosDoCampo("materiais_cliente", { materiais_cliente: "Não" })).toEqual([]);
  });

  it("estacionamento pago usa a zona e o prazo", () => {
    expect(efeitosDoCampo("zona_estacionamento", { estacionamento: "Pago", zona_estacionamento: "Vermelha", prazo_exec: "5" })[0]).toMatchObject({ preco: 70 });
  });
});
