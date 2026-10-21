// A lógica pura das escritas diretas do negócio (editar, lixo, restaurar): os limites da base, as colunas que se enviam e a tradução dos erros.
import { describe, expect, it, vi } from "vitest";
import {
  CHAVE_ESCRITA_GENERICA, CHAVES_ESCRITA, colunasDaEdicao, erroDeEscrita, MAX_NOTAS_NEGOCIO, MAX_TITULO_NEGOCIO, validarEdicao,
} from "./escritasNegocio";
import { ErroNeg } from "./chamarNeg";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

describe("validarEdicao (os limites da base: título 1 a 200, notas até 5000)", () => {
  it("aceita título e notas dentro dos limites", () => {
    expect(validarEdicao({ titulo: "Cozinha", notas: "" })).toEqual({});
  });

  it.each(["", "   ", "\t\n"])("recusa um título vazio ou só com espaços (%j)", (titulo) => {
    expect(validarEdicao({ titulo, notas: "" }).titulo).toBe("empty");
  });

  it("aceita 200 caracteres no título (a base conta o texto sem aparar nada, mas o ecrã apara) e recusa 201", () => {
    expect(validarEdicao({ titulo: "a".repeat(MAX_TITULO_NEGOCIO), notas: "" }).titulo).toBeUndefined();
    expect(validarEdicao({ titulo: "a".repeat(MAX_TITULO_NEGOCIO + 1), notas: "" }).titulo).toBe("tooLong");
  });

  it("aceita 5000 caracteres nas notas e recusa 5001", () => {
    expect(validarEdicao({ titulo: "x", notas: "n".repeat(MAX_NOTAS_NEGOCIO) }).notas).toBeUndefined();
    expect(validarEdicao({ titulo: "x", notas: "n".repeat(MAX_NOTAS_NEGOCIO + 1) }).notas).toBe("tooLong");
  });

  it("conta caracteres e não unidades UTF-16: um emoji vale um", () => {
    expect(validarEdicao({ titulo: "😀".repeat(MAX_TITULO_NEGOCIO), notas: "" }).titulo).toBeUndefined();
  });

  it("devolve os dois erros ao mesmo tempo", () => {
    expect(validarEdicao({ titulo: "", notas: "n".repeat(5001) })).toEqual({ titulo: "empty", notas: "tooLong" });
  });
});

describe("colunasDaEdicao (só vai o que mudou, e só colunas permitidas)", () => {
  const antes = { titulo: "Cozinha", notas: "nota", comercialId: "u1" };

  it("sem mudanças não envia nada", () => {
    expect(colunasDaEdicao(antes, { titulo: "Cozinha", notas: "nota", comercialId: "u1" })).toEqual({});
  });

  it("apara o título e conta como igual se só mudaram espaços nas pontas", () => {
    expect(colunasDaEdicao(antes, { titulo: "  Cozinha  ", notas: "nota", comercialId: "u1" })).toEqual({});
  });

  it("envia só a coluna que mudou", () => {
    expect(colunasDaEdicao(antes, { titulo: "Cozinha nova", notas: "nota", comercialId: "u1" })).toEqual({ titulo: "Cozinha nova" });
    expect(colunasDaEdicao(antes, { titulo: "Cozinha", notas: "outra", comercialId: "u1" })).toEqual({ notas: "outra" });
    expect(colunasDaEdicao(antes, { titulo: "Cozinha", notas: "nota", comercialId: "u2" })).toEqual({ assigned_to: "u2" });
  });

  it("notas vazias passam a null (a coluna aceita null) e tirar o comercial envia null", () => {
    expect(colunasDaEdicao(antes, { titulo: "Cozinha", notas: "  ", comercialId: null })).toEqual({ notas: null, assigned_to: null });
  });

  it("notas em branco sobre notas que já eram null não é mudança", () => {
    expect(colunasDaEdicao({ ...antes, notas: "" }, { titulo: "Cozinha", notas: "", comercialId: "u1" })).toEqual({});
  });

  it("nunca leva estado, fase, motivo de perda, organização, pessoa ou criador", () => {
    const todas = colunasDaEdicao({ titulo: "a", notas: "a", comercialId: "a" }, { titulo: "b", notas: "b", comercialId: "b" });
    expect(Object.keys(todas).sort()).toEqual(["assigned_to", "notas", "titulo"]);
  });
});

describe("erroDeEscrita (traduz pelo código e pela restrição, nunca mostra a mensagem em bruto)", () => {
  const com = (code: string, message = "x") => ({ code, message });

  it("42501 é falta de permissão", () => {
    const e = erroDeEscrita(com("42501", "new row violates row-level security policy"));
    expect(e).toBeInstanceOf(ErroNeg);
    expect(e.chave).toBe(CHAVES_ESCRITA.permissao);
    expect(e.codigo).toBe("42501");
  });

  it.each([
    ['new row for relation "negocios" violates check constraint "negocios_titulo_check"', CHAVES_ESCRITA.titulo],
    ['new row for relation "negocios" violates check constraint "negocios_notas_check"', CHAVES_ESCRITA.notas],
    ["O comercial tem de ser membro activo da organização do negócio.", CHAVES_ESCRITA.comercial],
    ["Este negócio está no lixo: tem de ser restaurado antes de ser alterado.", CHAVES_ESCRITA.lixo],
  ])("23514 (%s) tem a mensagem do campo", (message, chave) => {
    expect(erroDeEscrita(com("23514", message)).chave).toBe(chave);
  });

  it("23514 de outra restrição dá a mensagem de valor inválido", () => {
    expect(erroDeEscrita(com("23514", "Não é possível mudar a pessoa de um negócio.")).chave).toBe(CHAVES_ESCRITA.invalido);
  });

  it.each([
    ["NG028", "pessoasPagina.erroNeg.ng028"],
    ["NG025", "pessoasPagina.erroNeg.ng025"],
    ["NG027", "pessoasPagina.erroNeg.ng027"],
  ])("o código %s da regra de negócio mantém o código e a chave própria", (codigo, chave) => {
    const e = erroDeEscrita(com(codigo, "x"));
    expect(e).toBeInstanceOf(ErroNeg);
    expect(e.codigo).toBe(codigo);
    expect(e.chave).toBe(chave);
  });

  it("um erro de regra sem code que traz o código no texto também é reconhecido", () => {
    const e = erroDeEscrita({ code: null, message: "Negócio ganho ou perdido não se edita [NG028]" });
    expect(e.codigo).toBe("NG028");
    expect(e.chave).toBe("pessoasPagina.erroNeg.ng028");
  });

  it("um código NG desconhecido continua genérico", () => {
    expect(erroDeEscrita(com("NG999")).chave).toBe(CHAVE_ESCRITA_GENERICA);
  });

  it("um erro que a base não explica dá a mensagem genérica", () => {
    expect(erroDeEscrita(com("XX000")).chave).toBe(CHAVE_ESCRITA_GENERICA);
    expect(erroDeEscrita(new Error("boom")).chave).toBe(CHAVE_ESCRITA_GENERICA);
    expect(erroDeEscrita(null).chave).toBe(CHAVE_ESCRITA_GENERICA);
  });

  it("uma linha que não foi tocada (a política escondeu-a) é «indisponível»", () => {
    expect(erroDeEscrita("ninguem").chave).toBe(CHAVES_ESCRITA.indisponivel);
  });

  it("devolve o mesmo ErroNeg se já o for", () => {
    const antes = new ErroNeg(null, "NG001", "pessoasPagina.erroNeg.ng001");
    expect(erroDeEscrita(antes)).toBe(antes);
  });
});
