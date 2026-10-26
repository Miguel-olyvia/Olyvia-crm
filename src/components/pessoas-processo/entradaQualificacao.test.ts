// O que o painel manda gravar da Qualificação de um negócio: só as respostas da aba Qualificação, e só o que mudou (undefined = não mexe).
import { describe, expect, it } from "vitest";
import { entradaQualificacao } from "./entradaQualificacao";

const CHAVES = new Set(["imovel", "orcCliente"]);
const base = {
  negocioId: "n1", entityId: "p1", chavesQualificacao: CHAVES, inicial: { respostas: { imovel: "apartamento" }, pedido: "Casa de banho" },
};

describe("entradaQualificacao", () => {
  it("sem mudanças não há nada a gravar", () => {
    expect(entradaQualificacao({ ...base, rascunho: { respostas: { imovel: "apartamento" }, pedidoCliente: "Casa de banho" } })).toBeNull();
  });

  it("as respostas da Visita não contam: nem mudam nada nem vão", () => {
    expect(entradaQualificacao({ ...base, rascunho: { respostas: { imovel: "apartamento", acesso: "facil" }, pedidoCliente: "Casa de banho" } })).toBeNull();
  });

  it("uma resposta mudada vai com TODAS as da Qualificação (e só essas); o pedido não mexe", () => {
    const e = entradaQualificacao({ ...base, rascunho: { respostas: { imovel: "moradia", orcCliente: "5000", acesso: "facil" }, pedidoCliente: "Casa de banho" } });
    expect(e).toEqual({ negocioId: "n1", entityId: "p1", respostas: { imovel: "moradia", orcCliente: "5000" } });
    expect(e).not.toHaveProperty("pedidoCliente");
  });

  it("apagar todas as respostas manda {} (apaga), não undefined", () => {
    expect(entradaQualificacao({ ...base, rascunho: { respostas: {}, pedidoCliente: "Casa de banho" } })).toEqual({ negocioId: "n1", entityId: "p1", respostas: {} });
  });

  it("o pedido mudado vai; as respostas não mexem", () => {
    const e = entradaQualificacao({ ...base, rascunho: { respostas: { imovel: "apartamento" }, pedidoCliente: "Cozinha" } });
    expect(e).toEqual({ negocioId: "n1", entityId: "p1", pedidoCliente: "Cozinha" });
    expect(e).not.toHaveProperty("respostas");
  });

  it("apagar o pedido manda vazio (limpa); só espaços de diferença não é mudança", () => {
    expect(entradaQualificacao({ ...base, rascunho: { respostas: { imovel: "apartamento" }, pedidoCliente: "" } })).toMatchObject({ pedidoCliente: "" });
    expect(entradaQualificacao({ ...base, rascunho: { respostas: { imovel: "apartamento" }, pedidoCliente: "  Casa de banho " } })).toBeNull();
  });

  it("sem pedido no rascunho (sem negócio) o pedido nunca vai", () => {
    expect(entradaQualificacao({ ...base, rascunho: { respostas: { imovel: "apartamento" } } })).toBeNull();
  });

  it("a ordem das respostas não é mudança", () => {
    const e = entradaQualificacao({
      ...base, inicial: { respostas: { imovel: "a", orcCliente: "1" }, pedido: "" }, rascunho: { respostas: { orcCliente: "1", imovel: "a" }, pedidoCliente: "" },
    });
    expect(e).toBeNull();
  });
});
