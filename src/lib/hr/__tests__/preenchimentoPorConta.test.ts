/**
 * O calculo puro do preenchimento a partir de uma conta de CRM.
 *
 * O que estes testes fecham:
 *  1. o nome parte-se no ULTIMO espaco, e um nome de uma so palavra avisa em
 *     vez de inventar um apelido;
 *  2. um campo escrito a mao NUNCA e sobrescrito -- so um campo vazio ou que
 *     ainda tenha o palpite anterior;
 *  3. o e-mail vazio ou malformado nao se planta no formulario;
 *  4. o local so se preenche por correspondencia EXACTA, nunca por adivinha;
 *  5. reverter desfaz so os campos que ainda tem o palpite anterior.
 */
import { describe, it, expect } from "vitest";
import {
  CAMPO_APELIDO,
  CAMPO_CARGO,
  CAMPO_EMAIL_TRABALHO,
  CAMPO_LOCAL,
  CAMPO_PRIMEIRO_NOME,
  CAMPO_TELEFONE_TRABALHO,
  dividirNome,
  preenchimentoDaConta,
  reverterAutoPreenchido,
  type CamposPreenchiveis,
  type ContaParaPreencher,
} from "@/lib/hr/preenchimentoPorConta";

const CAMPOS_VAZIOS: CamposPreenchiveis = {
  primeiro_nome: "",
  apelido: "",
  email_trabalho: "",
  telefone_trabalho: "",
  cargo: "",
  local_id: "",
};

const CONTA_BASE: ContaParaPreencher = {
  name: "Ana Alves",
  email: "ana.alves@empresa.pt",
  phone: "912345678",
  position: "Gestora",
  location: "Lisboa",
};

describe("dividirNome", () => {
  it("parte no ultimo espaco: varios apelidos ficam todos no apelido", () => {
    expect(dividirNome("Maria do Carmo Silva Pereira")).toEqual({
      primeiroNome: "Maria do Carmo Silva",
      apelido: "Pereira",
      umaSoPalavra: false,
    });
  });

  it("uma so palavra: fica tudo no primeiro nome, apelido fica vazio", () => {
    expect(dividirNome("Madonna")).toEqual({
      primeiroNome: "Madonna",
      apelido: "",
      umaSoPalavra: true,
    });
  });

  it("so espacos -> null (nada a preencher)", () => {
    expect(dividirNome("   ")).toBeNull();
  });
});

describe("preenchimentoDaConta", () => {
  it("preenche nome, email, telefone e cargo numa ficha vazia", () => {
    const resultado = preenchimentoDaConta(CONTA_BASE, CAMPOS_VAZIOS, {}, [
      { id: "loc-1", nome: "Lisboa" },
    ]);

    expect(resultado.patchGeral).toEqual({
      primeiro_nome: "Ana",
      apelido: "Alves",
      email_trabalho: "ana.alves@empresa.pt",
      telefone_trabalho: "912345678",
    });
    expect(resultado.patchLaborais).toEqual({ cargo: "Gestora", local_id: "loc-1" });
    expect(resultado.avisos.find((a) => a.campoId === CAMPO_PRIMEIRO_NOME)).toBeTruthy();
  });

  it("nome de uma so palavra: preenche primeiro_nome e avisa que falta o apelido", () => {
    const conta: ContaParaPreencher = { ...CONTA_BASE, name: "Madonna" };
    const resultado = preenchimentoDaConta(conta, CAMPOS_VAZIOS, {}, []);

    expect(resultado.patchGeral.primeiro_nome).toBe("Madonna");
    expect(resultado.patchGeral.apelido).toBeUndefined();
    expect(
      resultado.avisos.find(
        (a) => a.campoId === CAMPO_APELIDO && a.mensagemKey === "hr.preenchimento.avisoNomeUmaPalavra",
      ),
    ).toBeTruthy();
  });

  it("NUNCA escreve por cima de um campo ja preenchido a mao", () => {
    const actual: CamposPreenchiveis = {
      ...CAMPOS_VAZIOS,
      primeiro_nome: "Escrito a mao",
      apelido: "Tambem a mao",
    };
    const resultado = preenchimentoDaConta(CONTA_BASE, actual, {}, []);

    expect(resultado.patchGeral.primeiro_nome).toBeUndefined();
    expect(resultado.patchGeral.apelido).toBeUndefined();
    expect(resultado.autoNovo[CAMPO_PRIMEIRO_NOME]).toBeUndefined();
    expect(resultado.autoNovo[CAMPO_APELIDO]).toBeUndefined();
  });

  it("sobrescreve um campo que ainda tem o palpite da conta ANTERIOR", () => {
    const actual: CamposPreenchiveis = { ...CAMPOS_VAZIOS, primeiro_nome: "Bruno" };
    const autoAnterior = { [CAMPO_PRIMEIRO_NOME]: "Bruno" };
    const resultado = preenchimentoDaConta(CONTA_BASE, actual, autoAnterior, []);

    expect(resultado.patchGeral.primeiro_nome).toBe("Ana");
  });

  it("e-mail vazio: nao preenche e avisa que a conta nao tem e-mail", () => {
    const conta: ContaParaPreencher = { ...CONTA_BASE, email: "" };
    const resultado = preenchimentoDaConta(conta, CAMPOS_VAZIOS, {}, []);

    expect(resultado.patchGeral.email_trabalho).toBeUndefined();
    expect(
      resultado.avisos.find((a) => a.mensagemKey === "hr.preenchimento.avisoSemEmail"),
    ).toBeTruthy();
  });

  it("e-mail malformado: nao preenche", () => {
    const conta: ContaParaPreencher = { ...CONTA_BASE, email: "nao-e-email" };
    const resultado = preenchimentoDaConta(conta, CAMPOS_VAZIOS, {}, []);

    expect(resultado.patchGeral.email_trabalho).toBeUndefined();
  });

  it("telefone e cargo vazios: saltados em silencio, sem aviso", () => {
    const conta: ContaParaPreencher = { ...CONTA_BASE, phone: null, position: null };
    const resultado = preenchimentoDaConta(conta, CAMPOS_VAZIOS, {}, []);

    expect(resultado.patchGeral.telefone_trabalho).toBeUndefined();
    expect(resultado.patchLaborais.cargo).toBeUndefined();
    expect(resultado.avisos.some((a) => a.campoId === CAMPO_TELEFONE_TRABALHO)).toBe(false);
  });

  it("local com correspondencia exacta preenche; sem correspondencia avisa e nao preenche", () => {
    const comCorrespondencia = preenchimentoDaConta(CONTA_BASE, CAMPOS_VAZIOS, {}, [
      { id: "loc-1", nome: "lisboa" }, // maiusculas nao contam
    ]);
    expect(comCorrespondencia.patchLaborais.local_id).toBe("loc-1");

    const semCorrespondencia = preenchimentoDaConta(CONTA_BASE, CAMPOS_VAZIOS, {}, [
      { id: "loc-2", nome: "Porto" },
    ]);
    expect(semCorrespondencia.patchLaborais.local_id).toBeUndefined();
    expect(
      semCorrespondencia.avisos.find((a) => a.campoId === CAMPO_LOCAL)?.parametros?.local,
    ).toBe("Lisboa");
  });
});

describe("reverterAutoPreenchido", () => {
  it("reverte so os campos que ainda tem exactamente o palpite anterior", () => {
    const actual: CamposPreenchiveis = {
      primeiro_nome: "Bruno", // ainda o palpite anterior
      apelido: "Escrito a mao", // divergiu do palpite -- fica
      email_trabalho: "",
      telefone_trabalho: "",
      cargo: "Gestor", // ainda o palpite anterior
      local_id: "",
    };
    const autoAnterior = {
      [CAMPO_PRIMEIRO_NOME]: "Bruno",
      [CAMPO_APELIDO]: "Bastos",
      [CAMPO_CARGO]: "Gestor",
    };

    const { patchGeral, patchLaborais } = reverterAutoPreenchido(actual, autoAnterior);

    expect(patchGeral.primeiro_nome).toBe("");
    expect(patchGeral.apelido).toBeUndefined();
    expect(patchLaborais.cargo).toBe("");
  });
});
