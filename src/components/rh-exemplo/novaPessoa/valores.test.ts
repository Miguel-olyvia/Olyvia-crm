import { describe, expect, it } from "vitest";
import {
  abaDoCampo,
  dataIsoValida,
  paraNovaPessoa,
  primeiroErro,
  resumoDeErros,
  validarNovaPessoa,
  valoresIniciais,
  type ValoresNovaPessoa,
} from "./valores";

const HOJE = "2026-10-14";

const completo = (extra: Partial<ValoresNovaPessoa> = {}): ValoresNovaPessoa => ({
  ...valoresIniciais(HOJE),
  nome: "Ana",
  apelido: "Sousa",
  localId: "loc-sede",
  cargoId: "cargo-1",
  ...extra,
});

describe("validarNovaPessoa", () => {
  it("aceita o mínimo: nome, apelido, centro e cargo", () => {
    expect(validarNovaPessoa(completo(), HOJE)).toEqual({});
  });

  it("pede o que é obrigatório e diz em que aba está", () => {
    const erros = validarNovaPessoa(valoresIniciais(HOJE), HOJE);
    expect(erros).toEqual({ nome: "obrigatorio", apelido: "obrigatorio", localId: "obrigatorio", cargoId: "obrigatorio" });
    expect(resumoDeErros(erros)).toEqual({ total: 4, porAba: { dados: 2, contrato: 2, acesso: 0 } });
  });

  it("trata espaços como vazio", () => {
    expect(validarNovaPessoa(completo({ nome: "   " }), HOJE).nome).toBe("obrigatorio");
  });

  it("recusa NIF e NISS com dígito de controlo errado e aceita os certos, com espaços", () => {
    expect(validarNovaPessoa(completo({ nif: "123456780", niss: "12345678900" }), HOJE)).toMatchObject({ nif: "invalido", niss: "invalido" });
    expect(validarNovaPessoa(completo({ nif: "123 456 789", niss: "12345678902" }), HOJE)).toEqual({});
  });

  it("valida e-mail, telefone e código postal só quando preenchidos", () => {
    const erros = validarNovaPessoa(completo({ emailPessoal: "ana@", telefonePessoal: "123", moradaCodigoPostal: "1000" }), HOJE);
    expect(erros).toMatchObject({ emailPessoal: "invalido", telefonePessoal: "invalido", moradaCodigoPostal: "invalido" });
    const bem = validarNovaPessoa(completo({ emailPessoal: "ana@x.pt", telefonePessoal: "912 345 678", moradaCodigoPostal: "1000-001" }), HOJE);
    expect(bem).toEqual({});
  });

  it("recusa datas de nascimento futuras ou que não existem", () => {
    expect(validarNovaPessoa(completo({ dataNascimento: "2027-01-01" }), HOJE).dataNascimento).toBe("futuro");
    expect(validarNovaPessoa(completo({ dataNascimento: "2020-02-31" }), HOJE).dataNascimento).toBe("invalido");
    expect(validarNovaPessoa(completo({ dataNascimento: "1990-05-17" }), HOJE).dataNascimento).toBeUndefined();
  });

  it("exige a data de fim num contrato com termo, e depois do início", () => {
    expect(validarNovaPessoa(completo({ tipoContrato: "termo_certo" }), HOJE).dataFim).toBe("obrigatorio");
    expect(validarNovaPessoa(completo({ tipoContrato: "termo_certo", dataFim: "2026-10-01" }), HOJE).dataFim).toBe("antesDoInicio");
    expect(validarNovaPessoa(completo({ tipoContrato: "termo_certo", dataFim: "2027-10-13" }), HOJE).dataFim).toBeUndefined();
    expect(validarNovaPessoa(completo({ dataFim: "lixo" }), HOJE).dataFim).toBeUndefined();
  });

  it("limita as horas e a retribuição", () => {
    expect(validarNovaPessoa(completo({ horas: "0" }), HOJE).horas).toBe("intervalo");
    expect(validarNovaPessoa(completo({ horas: "61" }), HOJE).horas).toBe("intervalo");
    expect(validarNovaPessoa(completo({ horas: "abc" }), HOJE).horas).toBe("intervalo");
    expect(validarNovaPessoa(completo({ horas: "37,5", retribuicao: "1 200" }), HOJE)).toMatchObject({ retribuicao: "intervalo" });
    expect(validarNovaPessoa(completo({ horas: "37,5", retribuicao: "1200,50" }), HOJE)).toEqual({});
    expect(validarNovaPessoa(completo({ retribuicao: "-1" }), HOJE).retribuicao).toBe("intervalo");
  });

  it("só pede grupo e e-mail do acesso quando se cria acesso", () => {
    expect(validarNovaPessoa(completo({ papelId: "", emailAcesso: "" }), HOJE)).toEqual({});
    const erros = validarNovaPessoa(completo({ criarAcesso: true }), HOJE);
    expect(erros).toEqual({ papelId: "obrigatorio", emailAcesso: "obrigatorio" });
    expect(validarNovaPessoa(completo({ criarAcesso: true, papelId: "p", emailAcesso: "x" }), HOJE).emailAcesso).toBe("invalido");
    expect(abaDoCampo("emailAcesso")).toBe("acesso");
  });
});

describe("primeiroErro", () => {
  it("devolve o primeiro campo pela ordem do ecrã, não pela ordem em que o erro foi calculado", () => {
    expect(primeiroErro(validarNovaPessoa(valoresIniciais(HOJE), HOJE))).toBe("nome");
    expect(primeiroErro(validarNovaPessoa(completo({ cargoId: "", nif: "1" }), HOJE))).toBe("nif");
    expect(primeiroErro({})).toBeNull();
  });
});

describe("dataIsoValida", () => {
  it("só aceita datas que existem", () => {
    expect(dataIsoValida("2024-02-29")).toBe(true);
    expect(dataIsoValida("2025-02-29")).toBe(false);
    expect(dataIsoValida("14/10/2026")).toBe(false);
  });
});

describe("paraNovaPessoa", () => {
  it("limpa o texto, deixa o fim do contrato sem termo a nulo e normaliza os identificadores", () => {
    const dados = paraNovaPessoa(completo({
      nome: " Ana ", nif: "123 456 789", niss: "", telefonePessoal: "912 345 678", horas: "37,5",
      retribuicao: "1200,5", dataFim: "2027-01-01", chefiaId: "",
    }));
    expect(dados).toMatchObject({ primeiro_nome: "Ana", apelido: "Sousa", dataFim: null, reportaAId: null });
    expect(dados.extras).toMatchObject({
      nif: "123456789", niss: null, telefonePessoal: "912345678", horasSemana: 37.5, salarioBase: 1200.5, criarAcesso: false, emailTrabalho: null,
    });
  });

  it("leva o fim do contrato com termo, a chefia e o e-mail do acesso", () => {
    const dados = paraNovaPessoa(completo({
      tipoContrato: "termo_certo", dataFim: "2027-01-01", chefiaId: "p-rui", criarAcesso: true, papelId: "r", emailAcesso: " ana@x.pt ",
    }));
    expect(dados).toMatchObject({ dataFim: "2027-01-01", reportaAId: "p-rui" });
    expect(dados.extras).toMatchObject({ criarAcesso: true, emailTrabalho: "ana@x.pt" });
  });
});
