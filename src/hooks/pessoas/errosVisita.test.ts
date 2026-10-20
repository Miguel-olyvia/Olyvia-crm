import { describe, expect, it, vi } from "vitest";

// O ErroNeg vive em chamarNeg, que importa o cliente da base: aqui nunca se chama.
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import { ErroNeg } from "./chamarNeg";
import { CHAVES_ERRO_NEG, CHAVE_ERRO_GENERICO } from "./errosNeg";
import { CHAVES_ERRO_POR_DIALOGO, chaveErroVisita, recursoEmConflito, traduzirErroVisita, type DialogoVisita } from "./errosVisita";

const V = "pessoasPagina.real.visit.";
const RECURSO = "33333333-3333-4333-8333-333333333333";

/** Um ErroNeg tal como o chamarNeg o devolve: a chave é a do código. */
const erro = (codigo: string, details?: string): ErroNeg =>
  new ErroNeg({ code: codigo, message: "x", details }, codigo, CHAVES_ERRO_NEG[codigo]);

describe("chaveErroVisita: o mesmo código lê-se de outra maneira em cada diálogo", () => {
  it.each<[DialogoVisita, string, string]>([
    ["marcar", "NG008", `${V}err.marcar.ng008`],
    ["alterar", "NG008", `${V}err.alterar.ng008`],
    ["marcar", "NG009", `${V}err.marcar.ng009`],
    ["alterar", "NG009", `${V}err.alterar.ng009`],
    ["marcar", "NG010", `${V}err.marcar.ng010`],
    ["alterar", "NG010", `${V}err.alterar.ng010`],
    ["cancelar", "NG018", `${V}err.cancelar.ng018`],
    ["resultado", "NG009", `${V}err.resultado.ng009`],
    ["resultado", "NG018", `${V}err.resultado.ng018`],
    ["encerrar", "NG009", `${V}err.encerrar.ng009`],
  ])("%s com %s", (dialogo, codigo, chave) => {
    expect(chaveErroVisita(erro(codigo), dialogo)).toBe(chave);
  });

  it("o mesmo código lê-se de outra maneira consoante a chamada que falhou: NG009 ao dar a visita como feita e ao encerrar a abordagem", () => {
    expect(chaveErroVisita(erro("NG009"), "resultado")).toBe(`${V}err.resultado.ng009`);
    expect(chaveErroVisita(erro("NG009"), "encerrar")).toBe(`${V}err.encerrar.ng009`);
    expect(chaveErroVisita(erro("NG009"), "encerrar")).not.toBe(chaveErroVisita(erro("NG009"), "resultado"));
    expect(traduzirErroVisita(erro("NG009"), "encerrar").chave).toBe(`${V}err.encerrar.ng009`);
  });

  it("o encerramento: NG011, NG008, NG003 e 42501 ficam com a leitura geral (NG011 é só do encerrar); NG004 nunca dispara e não tem leitura própria nos diálogos de resultado", () => {
    for (const c of ["NG011", "NG008", "NG003", "42501"]) expect(chaveErroVisita(erro(c), "encerrar"), c).toBe(CHAVES_ERRO_NEG[c]);
    expect(chaveErroVisita(erro("NG004"), "resultado")).toBe(CHAVES_ERRO_NEG.NG004);
    expect(chaveErroVisita(erro("NG004"), "encerrar")).toBe(CHAVES_ERRO_NEG.NG004);
    expect(CHAVES_ERRO_POR_DIALOGO.resultado).not.toHaveProperty("NG004");
    expect(CHAVES_ERRO_POR_DIALOGO.encerrar).not.toHaveProperty("NG004");
  });

  it("o que não tem leitura própria fica com a mensagem geral do código", () => {
    expect(chaveErroVisita(erro("NG017"), "alterar")).toBe(CHAVES_ERRO_NEG.NG017);
    expect(chaveErroVisita(erro("NG017"), "cancelar")).toBe(CHAVES_ERRO_NEG.NG017);
    expect(chaveErroVisita(erro("NG018"), "alterar")).toBe(CHAVES_ERRO_NEG.NG018);
    expect(chaveErroVisita(erro("NG016"), "marcar")).toBe(CHAVES_ERRO_NEG.NG016);
    // NG008 e NG004 fora do sítio onde mudam de sentido: igual ao geral.
    expect(chaveErroVisita(erro("NG008"), "cancelar")).toBe(CHAVES_ERRO_NEG.NG008);
    expect(chaveErroVisita(erro("NG004"), "marcar")).toBe(CHAVES_ERRO_NEG.NG004);
    // 42501 fora de «alterar» é a permissão geral.
    expect(chaveErroVisita(erro("42501"), "cancelar")).toBe(CHAVES_ERRO_NEG["42501"]);
  });

  it("42501 ao alterar: só quem troca os recursos lê «mudaria o responsável»; sem trocar é a permissão geral (vem também de pessoas.edit sobre a visita)", () => {
    expect(chaveErroVisita(erro("42501"), "alterar", { trocouRecursos: true })).toBe(`${V}ownerForbidden`);
    expect(chaveErroVisita(erro("42501"), "alterar", { trocouRecursos: false })).toBe(CHAVES_ERRO_NEG["42501"]);
    expect(chaveErroVisita(erro("42501"), "alterar")).toBe(CHAVES_ERRO_NEG["42501"]);
    expect(traduzirErroVisita(erro("42501"), "alterar", { trocouRecursos: true }).chave).toBe(`${V}ownerForbidden`);
    // O sinal só vale ao alterar.
    expect(chaveErroVisita(erro("42501"), "cancelar", { trocouRecursos: true })).toBe(CHAVES_ERRO_NEG["42501"]);
  });

  it("um erro sem código (avaria) fica genérico em todos os diálogos", () => {
    const avaria = new ErroNeg({ code: "57014" }, null, CHAVE_ERRO_GENERICO);
    for (const d of ["marcar", "alterar", "cancelar", "resultado", "encerrar"] as const) expect(chaveErroVisita(avaria, d)).toBe(CHAVE_ERRO_GENERICO);
  });

  it("um aviso de falha parcial (chave própria, com a do código ao lado) não se reescreve", () => {
    const parcial = new ErroNeg({ code: "NG018" }, "NG018", "pessoasPagina.real.ficha.partialVisit", CHAVES_ERRO_NEG.NG018);
    expect(chaveErroVisita(parcial, "resultado")).toBe("pessoasPagina.real.ficha.partialVisit");
  });
});

describe("traduzirErroVisita", () => {
  it("devolve um ErroNeg com a chave do diálogo e guarda o código, a causa e a segunda mensagem", () => {
    const original = erro("NG010", RECURSO);
    const novo = traduzirErroVisita(original, "marcar");
    expect(novo).toBeInstanceOf(ErroNeg);
    expect(novo.chave).toBe(`${V}err.marcar.ng010`);
    expect(novo.codigo).toBe("NG010");
    expect(novo.causa).toBe(original.causa);
  });

  it("qualquer coisa que não seja um ErroNeg vira o erro genérico", () => {
    expect(traduzirErroVisita(new Error("boom"), "marcar").chave).toBe(CHAVE_ERRO_GENERICO);
    expect(traduzirErroVisita(null, "cancelar").chave).toBe(CHAVE_ERRO_GENERICO);
  });

  it("um aviso parcial passa tal e qual (a mesma instância)", () => {
    const parcial = new ErroNeg(null, "NG002", "pessoasPagina.real.ficha.partialVisit", CHAVES_ERRO_NEG.NG002);
    expect(traduzirErroVisita(parcial, "resultado")).toBe(parcial);
  });
});

describe("recursoEmConflito", () => {
  it("lê o uuid do recurso do DETAIL, só no NG010", () => {
    expect(recursoEmConflito(erro("NG010", RECURSO))).toBe(RECURSO);
  });

  it("sem DETAIL, com texto que não é um uuid, ou noutro código: null", () => {
    expect(recursoEmConflito(erro("NG010"))).toBeNull();
    expect(recursoEmConflito(erro("NG010", "o recurso x"))).toBeNull();
    expect(recursoEmConflito(erro("NG009", RECURSO))).toBeNull();
    expect(recursoEmConflito(new Error("x"))).toBeNull();
    expect(recursoEmConflito(null)).toBeNull();
  });

  it("funciona também depois de traduzido (a causa mantém-se)", () => {
    expect(recursoEmConflito(traduzirErroVisita(erro("NG010", RECURSO), "alterar"))).toBe(RECURSO);
  });
});
