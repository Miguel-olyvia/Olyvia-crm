import { describe, expect, it } from "vitest";
import { adaptarLinhaPosContrato } from "./adaptarCartaoPosContrato";
import { linhaNegocio } from "./quadroPessoasTestUtil";

describe("adaptarLinhaPosContrato", () => {
  it("uma linha financeiro dá um cartão de Financeiro com o passo «pagamento por validar»", () => {
    const r = adaptarLinhaPosContrato(linhaNegocio("n1", "financeiro", { valor: "1500.5", chave_ordem: "K1", papel: "cliente", nome: "Ana", titulo: "Cozinha" }));
    expect(r?.cartao).toEqual({
      id: "n1", pessoaId: "pessoa-de-n1", nome: "Ana", papel: "cliente", coluna: "financeiro", trabalho: "Cozinha", valor: 1500.5, passo: "pagamentoPorValidar",
    });
    expect(r?.cursor).toEqual({ chave: "K1", id: "n1" });
  });

  it("uma linha obra dá o passo «obra por abrir» e nunca um estado de obra inventado", () => {
    const r = adaptarLinhaPosContrato(linhaNegocio("n2", "obra", { valor: 900 }));
    expect(r?.cartao.coluna).toBe("obra");
    expect(r?.cartao.passo).toBe("obraPorAbrir");
    expect(Object.keys(r!.cartao)).not.toContain("estadoObra");
  });

  it.each(["porContactar", "contactado", "visita", "levantamento", "orcamento", "proposta", "contrato", "nova-do-futuro", ""])(
    "a coluna %s não é do pós-contrato e descarta-se", (coluna) => {
      expect(adaptarLinhaPosContrato(linhaNegocio("x", coluna))).toBeNull();
    },
  );

  it("uma linha que não é de negócio descarta-se", () => {
    expect(adaptarLinhaPosContrato(linhaNegocio("x", "financeiro", { tipo: "pessoa" }))).toBeNull();
  });

  it("valor nulo, ilegível ou infinito fica sem valor; zero é um valor", () => {
    expect(adaptarLinhaPosContrato(linhaNegocio("a", "obra", { valor: null }))?.cartao.valor).toBeNull();
    expect(adaptarLinhaPosContrato(linhaNegocio("b", "obra", { valor: "abc" }))?.cartao.valor).toBeNull();
    expect(adaptarLinhaPosContrato(linhaNegocio("c", "obra", { valor: Infinity }))?.cartao.valor).toBeNull();
    expect(adaptarLinhaPosContrato(linhaNegocio("d", "obra", { valor: 0 }))?.cartao.valor).toBe(0);
  });

  it("sem chave de ordem não há cursor; nome em falta fica vazio; papel desconhecido é lead", () => {
    const r = adaptarLinhaPosContrato(linhaNegocio("e", "financeiro", { chave_ordem: null, nome: null, papel: "outro" }));
    expect(r?.cursor).toBeNull();
    expect(r?.cartao.nome).toBe("");
    expect(r?.cartao.papel).toBe("lead");
  });

  it("título em falta fica sem trabalho", () => {
    expect(adaptarLinhaPosContrato(linhaNegocio("f", "financeiro", { titulo: null }))?.cartao.trabalho).toBeNull();
  });
});
