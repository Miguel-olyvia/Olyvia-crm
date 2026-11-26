// Os erros das RPCs de equipamento do RH, do lado do ecrã: o HRA91 («Alterar conta» numa linha que é um ativo) e os códigos ATV que
// o RH também recebe ao atribuir e ao corrigir (ATV05, ATV07, ATV10 a ATV33). Nada chega ao ecrã em bruto.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chaveDoErroCusto, codigoDeErroCusto, ERRO_DE_CAMPO, CHAVE_SEM_PERMISSAO_ATIVOS } from "@/lib/hr/errosCusto";
import { tabelaFundida } from "@/translations/tabelaFundida";

const hra = (code: string, message: string) => ({ code, message, details: null, hint: null });
const atv = (message: string, details: string | null = null) => ({ code: "P0001", message, details, hint: null });

describe("HRA91: «Alterar conta» numa linha que é um ativo", () => {
  it("o SQLSTATE HRA91 passa ao código equipamento_e_ativo, com texto próprio que manda para «Corrigir equipamento»", () => {
    expect(codigoDeErroCusto(hra("HRA91", "equipamento_e_ativo"))).toBe("equipamento_e_ativo");
    expect(chaveDoErroCusto("equipamento_e_ativo")).toBe("hr.custo.erro.equipamentoEAtivo");
    expect(tabelaFundida.pt["hr.custo.erro.equipamentoEAtivo"]).toMatch(/Corrigir equipamento/);
    expect(tabelaFundida.en["hr.custo.erro.equipamentoEAtivo"]).toMatch(/Correct equipment/);
  });

  it("os códigos de antes continuam iguais", () => {
    expect(codigoDeErroCusto(hra("HRA66", "valor_invalido"))).toBe("valor_invalido");
    expect(codigoDeErroCusto(hra("HRA38", "estado_invalido"))).toBe("estado_invalido");
    expect(codigoDeErroCusto(hra("42501", "insufficient_privilege"))).toBe("insufficient_privilege");
    expect(codigoDeErroCusto({ code: "08006", message: "connection failure" })).toBeNull();
    expect(ERRO_DE_CAMPO.valor_invalido).toBe("valorZero");
  });
});

describe("códigos ATV no RH", () => {
  const NO_RH = ["ATV05", "ATV07", ...Array.from({ length: 24 }, (_, i) => `ATV${i + 10}`)];

  it.each(NO_RH)("%s é reconhecido, tem chave e texto em pt e en", (codigo) => {
    const lido = codigoDeErroCusto(atv(codigo));
    expect(lido).toBe(codigo);
    const chave = chaveDoErroCusto(lido);
    expect(chave).toBe(`ativos.erro.${codigo}`);
    expect(tabelaFundida.pt[chave], `pt ${chave}`).toBeTruthy();
    expect(tabelaFundida.en[chave], `en ${chave}`).toBeTruthy();
  });

  it("o código também se lê do details (alguns clientes devolvem lá a mensagem)", () => {
    expect(codigoDeErroCusto({ code: "P0001", message: "", details: "ATV21", hint: null })).toBe("ATV21");
  });

  it("um código ATV que o RH nunca recebe (ATV02) não se traduz: cai no genérico", () => {
    expect(codigoDeErroCusto(atv("ATV02"))).toBeNull();
    expect(chaveDoErroCusto(null)).toBe("hr.custo.erro.generico");
  });

  it("as três recusas novas dizem o que fazer: entrega a mais de 7 dias sem data de compra, contrato terminado e início depois da entrega", () => {
    expect(chaveDoErroCusto(codigoDeErroCusto(atv("ATV07", "A data de compra é inválida.")))).toBe("ativos.erro.ATV07");
    expect(tabelaFundida.pt["ativos.erro.ATV07"]).toMatch(/mais de 7 dias.*data de compra|7 dias.*indique a data de compra/);

    const terminado = atv("ATV26", "O contrato de aluguer já terminou: não se entrega.");
    expect(codigoDeErroCusto(terminado)).toBe("ATV26.contratoTerminado");
    expect(tabelaFundida.pt[chaveDoErroCusto("ATV26.contratoTerminado")]).toMatch(/terminou/);

    const inicio = atv("ATV26", "A data de entrega é anterior à compra ou ao início do aluguer.");
    expect(codigoDeErroCusto(inicio)).toBe("ATV26.antesDoInicio");
    expect(tabelaFundida.pt[chaveDoErroCusto("ATV26.antesDoInicio")]).toMatch(/início do aluguer/);
  });

  it("ATV26 sem causa legível usa o texto geral; com a causa «já entregue a outra pessoa», o texto dessa causa", () => {
    expect(codigoDeErroCusto(atv("ATV26"))).toBe("ATV26");
    expect(codigoDeErroCusto(atv("ATV26", "Este ativo já está entregue a outra pessoa."))).toBe("ATV26.ocupado");
  });
});

describe("recusa por permissão ao corrigir (ativos.edit)", () => {
  const original = window.localStorage.getItem("language");
  beforeEach(() => window.localStorage.setItem("language", "pt"));
  afterEach(() => (original === null ? window.localStorage.removeItem("language") : window.localStorage.setItem("language", original)));

  it("tem um texto próprio que fala da permissão dos Ativos e não das retribuições", () => {
    expect(tabelaFundida.pt[CHAVE_SEM_PERMISSAO_ATIVOS]).toMatch(/ativos/i);
    expect(tabelaFundida.pt[CHAVE_SEM_PERMISSAO_ATIVOS]).not.toMatch(/retribui/i);
    expect(tabelaFundida.en[CHAVE_SEM_PERMISSAO_ATIVOS]).toMatch(/assets/i);
  });
});
