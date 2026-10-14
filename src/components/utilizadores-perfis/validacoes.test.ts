// Validações dos formulários de role e de utilizador, e o código gerado a partir do nome.
import { describe, expect, it } from "vitest";
import { ROLES_EXEMPLO } from "./catalogoExemplo";
import {
  abasComErroRole, abasComErroUtilizador, gerarCodigo, primeiroErroUtilizador, validarRole, validarUtilizador,
  type ValoresUtilizador,
} from "./validacoes";
import { UTILIZADORES_EXEMPLO } from "./utilizadoresExemplo";

describe("gerarCodigo", () => {
  it.each([
    ["Gestor de Vendas", "gestor_de_vendas"],
    ["  Operações & Armazém  ", "operacoes_armazem"],
    ["Comercial (cópia)", "comercial_copia"],
    ["Ação---Rápida", "acao_rapida"],
    ["", ""],
    ["!!!", ""],
  ])("%j dá %j", (nome, codigo) => expect(gerarCodigo(nome)).toBe(codigo));

  it("corta nos 50 caracteres sem deixar sublinhado no fim", () => {
    const codigo = gerarCodigo(`${"a".repeat(49)} bbbb`);
    expect(codigo.length).toBeLessThanOrEqual(50);
    expect(codigo.endsWith("_")).toBe(false);
  });

  it("o código gerado é sempre válido (ou vazio) para o validador", () => {
    const erros = validarRole({ nome: "Gestão de Parceiros 2", codigo: gerarCodigo("Gestão de Parceiros 2") }, []);
    expect(erros).toEqual({});
  });
});

describe("validarRole", () => {
  it("nome e código são obrigatórios", () => {
    expect(validarRole({ nome: "  ", codigo: "" }, ROLES_EXEMPLO)).toEqual({ nome: "required", codigo: "required" });
  });

  it("o código tem de estar no formato: minúsculas, algarismos e sublinhado, a começar por letra", () => {
    for (const mau of ["Maiusculas", "com espaco", "1comeca", "_comeca", "com-hifen", "acentuação"]) {
      expect(validarRole({ nome: "X", codigo: mau }, [])).toEqual({ codigo: "format" });
    }
    expect(validarRole({ nome: "X", codigo: "ok_2" }, [])).toEqual({});
  });

  it("o código é único, mas a própria role, ao editar, não conta como repetida", () => {
    expect(validarRole({ nome: "X", codigo: "comercial" }, ROLES_EXEMPLO)).toEqual({ codigo: "duplicate" });
    expect(validarRole({ nome: "X", codigo: "comercial" }, ROLES_EXEMPLO, "r-comercial")).toEqual({});
  });

  it("recusa nomes e códigos demasiado longos", () => {
    expect(validarRole({ nome: "n".repeat(101), codigo: "ok" }, [])).toEqual({ nome: "tooLong" });
    expect(validarRole({ nome: "X", codigo: "c".repeat(51) }, [])).toEqual({ codigo: "format" });
  });

  it("só a aba Geral tem erros de role", () => {
    expect(abasComErroRole({ codigo: "format" })).toEqual(["geral"]);
    expect(abasComErroRole({})).toEqual([]);
  });
});

const BOM: ValoresUtilizador = {
  nome: "Ana Prata", email: "ana.prata@exemplo.pt", telefone: "912 345 678", palavraPasse: "segredo123",
  vinculos: [{ organizacaoId: "o-grupo", roleId: "r-comercial" }],
};
const ao = { criar: true };

describe("validarUtilizador", () => {
  it("um utilizador bem preenchido não tem erros", () => {
    expect(validarUtilizador(BOM, UTILIZADORES_EXEMPLO, ao)).toEqual({});
  });

  it("nome, email e palavra-passe são obrigatórios ao criar; a palavra-passe já não ao editar", () => {
    const vazio = { ...BOM, nome: " ", email: "", palavraPasse: "" };
    expect(validarUtilizador(vazio, [], ao)).toEqual({ nome: "required", email: "required", palavraPasse: "required" });
    expect(validarUtilizador(vazio, [], { criar: false })).toEqual({ nome: "required", email: "required" });
  });

  it("valida o formato do email e recusa um email que já existe, em qualquer capitalização", () => {
    expect(validarUtilizador({ ...BOM, email: "sem-arroba" }, [], ao).email).toBe("format");
    expect(validarUtilizador({ ...BOM, email: "RUI.PACHECO@exemplo.pt" }, UTILIZADORES_EXEMPLO, ao).email).toBe("duplicate");
    expect(validarUtilizador({ ...BOM, email: "rui.pacheco@exemplo.pt" }, UTILIZADORES_EXEMPLO, { criar: false, idAtual: "u-02" }).email).toBeUndefined();
  });

  it("a palavra-passe tem de ter entre 8 e 72 caracteres quando é dada", () => {
    expect(validarUtilizador({ ...BOM, palavraPasse: "curta" }, [], ao).palavraPasse).toBe("short");
    expect(validarUtilizador({ ...BOM, palavraPasse: "p".repeat(73) }, [], ao).palavraPasse).toBe("long");
    expect(validarUtilizador({ ...BOM, palavraPasse: "p".repeat(72) }, [], ao).palavraPasse).toBeUndefined();
    expect(validarUtilizador({ ...BOM, palavraPasse: "curta" }, [], { criar: false }).palavraPasse).toBe("short");
  });

  it("o telefone é opcional, mas se vier tem de parecer um número", () => {
    expect(validarUtilizador({ ...BOM, telefone: "" }, [], ao).telefone).toBeUndefined();
    expect(validarUtilizador({ ...BOM, telefone: "+351 912 345 678" }, [], ao).telefone).toBeUndefined();
    expect(validarUtilizador({ ...BOM, telefone: "abc" }, [], ao).telefone).toBe("format");
  });

  it("exige pelo menos um vínculo, completo e sem repetir a organização", () => {
    expect(validarUtilizador({ ...BOM, vinculos: [] }, [], ao).vinculos).toBe("min");
    expect(validarUtilizador({ ...BOM, vinculos: [{ organizacaoId: "o-grupo", roleId: "" }] }, [], ao).vinculos).toBe("incomplete");
    const repetidos = [{ organizacaoId: "o-grupo", roleId: "r-leitura" }, { organizacaoId: "o-grupo", roleId: "r-comercial" }];
    expect(validarUtilizador({ ...BOM, vinculos: repetidos }, [], ao).vinculos).toBe("duplicate");
  });

  it("diz a aba e o primeiro campo errado, pela ordem do ecrã", () => {
    expect(primeiroErroUtilizador({})).toBeNull();
    expect(primeiroErroUtilizador({ vinculos: "min", email: "format" })).toEqual({ campo: "email", aba: "dados" });
    expect(primeiroErroUtilizador({ vinculos: "min" })).toEqual({ campo: "vinculos", aba: "vinculos" });
    expect(abasComErroUtilizador({ palavraPasse: "short", vinculos: "min" })).toEqual({ dados: true, vinculos: true });
    expect(abasComErroUtilizador({})).toEqual({ dados: false, vinculos: false });
  });
});
