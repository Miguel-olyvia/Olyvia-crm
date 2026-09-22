/**
 * A lista partilhada de obrigatorios do convite de admissao -- ver
 * `admissaoObrigatorios.ts`. O que este ficheiro protege:
 *
 *  - `dependentes = "0"` conta como preenchido (e resposta, nao ausencia).
 *  - `validade_documento` so e obrigatoria quando o documento NAO e cartao
 *    de cidadao, e um `tipo_documento` por escolher nao arrasta a validade
 *    consigo -- so a sua propria pendencia aparece.
 *  - a situacao profissional do conjuge so e exigida a quem tem conjuge.
 *  - a carta de conducao NUNCA e exigida: nem toda a gente tem carta.
 *  - um rascunho completo nao deixa pendencia nenhuma.
 */
import { describe, expect, it } from "vitest";
import {
  CAMPOS_OBRIGATORIOS_ADMISSAO,
  campoEhObrigatorio,
  obrigatoriosResolvidos,
  pendenciasDoRascunho,
  type RascunhoConviteObrigatorios,
} from "@/lib/hr/admissaoObrigatorios";

const VAZIO: RascunhoConviteObrigatorios = {
  data_nascimento: "",
  genero: "",
  nacionalidade: "",
  telefone_pessoal: "",
  email_pessoal: "",
  estado_civil: "",
  dependentes: "",
  dependentes_deficientes: "",
  conjuge_situacao_profissional: "",
  naturalidade_freguesia: "",
  naturalidade_concelho: "",
  naturalidade_pais: "",
  habilitacao_academica: "",
  habilitacao_data_conclusao: "",
  nif: "",
  niss: "",
  tipo_documento: "",
  numero_documento: "",
  validade_documento: "",
  linha1: "",
  codigo_postal: "",
  localidade: "",
  tamanho_cima: "",
  tamanho_baixo: "",
  tamanho_calcado: "",
  conta_numero: "",
  conta_titular: "",
  conta_banco: "",
};

const COMPLETO: RascunhoConviteObrigatorios = {
  data_nascimento: "1990-01-01",
  genero: "feminino",
  nacionalidade: "PT",
  telefone_pessoal: "912345678",
  email_pessoal: "pessoa@example.com",
  // Solteira: o condicional fica por exigir, e o rascunho continua completo.
  estado_civil: "solteiro",
  dependentes: "0",
  dependentes_deficientes: "0",
  conjuge_situacao_profissional: "",
  naturalidade_freguesia: "Santa Maria Maior",
  naturalidade_concelho: "Lisboa",
  naturalidade_pais: "PT",
  habilitacao_academica: "licenciatura",
  habilitacao_data_conclusao: "2012-07-01",
  nif: "123456789",
  niss: "12345678901",
  tipo_documento: "cartao_cidadao",
  numero_documento: "12345678",
  validade_documento: "",
  linha1: "Rua Principal 1",
  codigo_postal: "1000-001",
  localidade: "Lisboa",
  tamanho_cima: "m",
  tamanho_baixo: "m",
  tamanho_calcado: "42",
  conta_numero: "PT50000201231234567890154",
  conta_titular: "Maria Silva",
  conta_banco: "Banco Exemplo",
};

describe("pendenciasDoRascunho", () => {
  it("um rascunho vazio tem pendencia em todos os campos incondicionais", () => {
    const pendencias = pendenciasDoRascunho(VAZIO);
    expect(pendencias).toContain("data_nascimento");
    expect(pendencias).toContain("niss");
    expect(pendencias).toContain("nif");
    expect(pendencias).toContain("linha1");
    expect(pendencias).toContain("tamanho_cima");
    expect(pendencias).toContain("conta_numero");
    // validade_documento NAO e pendencia so por o tipo ainda estar vazio.
    expect(pendencias).not.toContain("validade_documento");
    // nem a situacao do conjuge por o estado civil ainda estar por escolher.
    expect(pendencias).not.toContain("conjuge_situacao_profissional");
  });

  it("a situacao profissional do conjuge so e exigida a quem tem conjuge", () => {
    expect(pendenciasDoRascunho({ ...COMPLETO, estado_civil: "casado" })).toContain(
      "conjuge_situacao_profissional",
    );
    expect(pendenciasDoRascunho({ ...COMPLETO, estado_civil: "uniao_de_facto" })).toContain(
      "conjuge_situacao_profissional",
    );
    expect(pendenciasDoRascunho({ ...COMPLETO, estado_civil: "divorciado" })).not.toContain(
      "conjuge_situacao_profissional",
    );
  });

  it("a conta bancaria e obrigatoria, os tres campos", () => {
    expect(pendenciasDoRascunho({ ...COMPLETO, conta_numero: "" })).toContain("conta_numero");
    expect(pendenciasDoRascunho({ ...COMPLETO, conta_titular: "" })).toContain("conta_titular");
    expect(pendenciasDoRascunho({ ...COMPLETO, conta_banco: "" })).toContain("conta_banco");
  });

  it("dependentes = '0' conta como preenchido, nao como ausente", () => {
    const rascunho = { ...COMPLETO, dependentes: "0" };
    expect(pendenciasDoRascunho(rascunho)).not.toContain("dependentes");
  });

  it("dependentes = '' fica pendente mesmo com o resto preenchido", () => {
    const rascunho = { ...COMPLETO, dependentes: "" };
    expect(pendenciasDoRascunho(rascunho)).toContain("dependentes");
  });

  it("validade_documento fica obrigatoria quando o documento nao e cartao de cidadao", () => {
    const rascunho = { ...COMPLETO, tipo_documento: "passaporte", validade_documento: "" };
    expect(pendenciasDoRascunho(rascunho)).toContain("validade_documento");
  });

  it("validade_documento nao e exigida para cartao de cidadao", () => {
    const rascunho = { ...COMPLETO, tipo_documento: "cartao_cidadao", validade_documento: "" };
    expect(pendenciasDoRascunho(rascunho)).not.toContain("validade_documento");
  });

  it("um rascunho completo (cartao de cidadao) nao deixa pendencia nenhuma", () => {
    expect(pendenciasDoRascunho(COMPLETO)).toEqual([]);
  });
});

describe("campoEhObrigatorio", () => {
  it("validade_documento so fica marcada obrigatoria depois de escolhido um tipo diferente de cartao de cidadao", () => {
    expect(campoEhObrigatorio(VAZIO, "validade_documento")).toBe(false);
    expect(
      campoEhObrigatorio({ ...VAZIO, tipo_documento: "cartao_cidadao" }, "validade_documento"),
    ).toBe(false);
    expect(
      campoEhObrigatorio({ ...VAZIO, tipo_documento: "passaporte" }, "validade_documento"),
    ).toBe(true);
  });

  it("niss e obrigatorio quando o nif tambem esta vazio", () => {
    expect(campoEhObrigatorio(VAZIO, "niss")).toBe(true);
  });

  // Decisao 38 (mapa do modulo RH): NIF e NISS deixaram de ser os dois
  // incondicionalmente obrigatorios -- um dos dois basta. `condicao` depende
  // do OUTRO campo, nao do proprio: com o nif preenchido, deixa de ser exigido
  // o niss -- mas o nif continua "exigivel" em si (ver o teste de
  // `pendenciasDoRascunho` a seguir para o efeito completo, que tambem olha
  // ao que ja esta preenchido).
  it("so o nif preenchido: o niss deixa de ser exigido", () => {
    const rascunho = { ...VAZIO, nif: "123456789" };
    expect(campoEhObrigatorio(rascunho, "niss")).toBe(false);
  });

  it("so o niss preenchido: o nif deixa de ser exigido", () => {
    const rascunho = { ...VAZIO, niss: "12345678901" };
    expect(campoEhObrigatorio(rascunho, "nif")).toBe(false);
  });

  it("nenhum dos dois preenchido: nif e niss ficam ambos obrigatorios", () => {
    expect(campoEhObrigatorio(VAZIO, "nif")).toBe(true);
    expect(campoEhObrigatorio(VAZIO, "niss")).toBe(true);
  });

  it("os dois preenchidos: nif e niss deixam de ser obrigatorios", () => {
    const rascunho = { ...VAZIO, nif: "123456789", niss: "12345678901" };
    expect(campoEhObrigatorio(rascunho, "nif")).toBe(false);
    expect(campoEhObrigatorio(rascunho, "niss")).toBe(false);
  });
});

describe("pendenciasDoRascunho -- nif e niss (decisao 38, NIF OU NISS)", () => {
  it("so o nif preenchido: nenhum dos dois aparece nas pendencias", () => {
    const rascunho = { ...COMPLETO, nif: "123456789", niss: "" };
    const pendencias = pendenciasDoRascunho(rascunho);
    expect(pendencias).not.toContain("nif");
    expect(pendencias).not.toContain("niss");
  });

  it("so o niss preenchido: nenhum dos dois aparece nas pendencias", () => {
    const rascunho = { ...COMPLETO, nif: "", niss: "12345678901" };
    const pendencias = pendenciasDoRascunho(rascunho);
    expect(pendencias).not.toContain("nif");
    expect(pendencias).not.toContain("niss");
  });

  it("nenhum dos dois preenchido: os dois aparecem nas pendencias", () => {
    const rascunho = { ...COMPLETO, nif: "", niss: "" };
    const pendencias = pendenciasDoRascunho(rascunho);
    expect(pendencias).toContain("nif");
    expect(pendencias).toContain("niss");
  });

  it("os dois preenchidos: nenhum dos dois aparece nas pendencias", () => {
    const rascunho = { ...COMPLETO, nif: "123456789", niss: "12345678901" };
    const pendencias = pendenciasDoRascunho(rascunho);
    expect(pendencias).not.toContain("nif");
    expect(pendencias).not.toContain("niss");
  });
});

describe("obrigatoriosResolvidos", () => {
  it("sem dados do servidor, cai na lista estatica por inteiro (fallback, nunca regressao)", () => {
    expect(obrigatoriosResolvidos(undefined)).toBe(CAMPOS_OBRIGATORIOS_ADMISSAO);
    expect(obrigatoriosResolvidos(null)).toBe(CAMPOS_OBRIGATORIOS_ADMISSAO);
  });

  it("um codigo omitido pelo servidor deixa de ser obrigatorio", () => {
    const doServidor = CAMPOS_OBRIGATORIOS_ADMISSAO.filter((c) => c.codigo !== "niss").map((c) => ({
      codigo: c.codigo as string,
      condicional: false,
    }));

    const resolvidos = obrigatoriosResolvidos(doServidor);
    expect(resolvidos.some((c) => c.codigo === "niss")).toBe(false);
    expect(pendenciasDoRascunho(VAZIO, resolvidos)).not.toContain("niss");
    // O resto continua obrigatorio como sempre.
    expect(pendenciasDoRascunho(VAZIO, resolvidos)).toContain("nif");
  });

  it("um codigo condicional presente no servidor mas cuja condicao local e falsa nao fica pendente", () => {
    const doServidor = CAMPOS_OBRIGATORIOS_ADMISSAO.map((c) => ({
      codigo: c.codigo as string,
      condicional: c.codigo === "validade_documento",
    }));
    const resolvidos = obrigatoriosResolvidos(doServidor);

    // Cartao de cidadao: a condicao local (precisaDeValidadeDocumento) e
    // falsa, mesmo com o codigo presente na lista do servidor.
    const rascunhoCC: RascunhoConviteObrigatorios = { ...VAZIO, tipo_documento: "cartao_cidadao" };
    expect(campoEhObrigatorio(rascunhoCC, "validade_documento", resolvidos)).toBe(false);
    expect(pendenciasDoRascunho(rascunhoCC, resolvidos)).not.toContain("validade_documento");

    // Passaporte: a condicao local passa a ser verdadeira.
    const rascunhoPassaporte: RascunhoConviteObrigatorios = {
      ...VAZIO,
      tipo_documento: "passaporte",
    };
    expect(campoEhObrigatorio(rascunhoPassaporte, "validade_documento", resolvidos)).toBe(true);
    expect(pendenciasDoRascunho(rascunhoPassaporte, resolvidos)).toContain("validade_documento");
  });
});
