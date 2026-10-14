import { describe, expect, it } from "vitest";
import { extrasDeValores, paraNovaPessoa } from "@/components/rh-exemplo/novaPessoa/paraStore";
import { comPatch, valoresIniciais, type ValoresNovaPessoa } from "@/components/rh-exemplo/novaPessoa/tiposNova";
import { criarEstadoInicial } from "./exemplo";
import { camposDeAdmissaoIniciais } from "./gestaoExemplo";
import { aplicarExtras } from "./fichaNovaPessoa";

const HOJE = "2026-10-14";
const CONFIG = camposDeAdmissaoIniciais();

const base = () => {
  const ficha = Object.values(criarEstadoInicial().fichas).find((f) => f.pendencias.length > 0 && f.dadosPessoais && f.identificacao);
  if (!ficha) throw new Error("os dados de exemplo deviam ter uma ficha com pendências");
  return ficha;
};

function minimo(): ValoresNovaPessoa {
  let v = valoresIniciais(HOJE);
  v = comPatch(v, "geral", { primeiro_nome: "Ana", apelido: "Sousa" });
  v = comPatch(v, "laborais", { cargo_id: "cargo-1" });
  return comPatch(v, "contrato", { tipo_contrato: "sem_termo", subsidio: "0", duodecimos_pct: "50" });
}

const extras = (v: ValoresNovaPessoa, comConvite = false) => extrasDeValores(v, { config: CONFIG, comConvite });

describe("aplicarExtras: o que ficou em branco fica em branco", () => {
  it("sem nada escrito não há NIF, morada, contactos, conta, saúde, sindicalização, tamanhos nem anexos", () => {
    const ficha = aplicarExtras(base(), extras(minimo()));
    expect(ficha.identificacao).toMatchObject({ nif: null, niss_ultimos4: null, carta_conducao_numero: null, numero_documento: null });
    expect(ficha.dadosPessoais).toMatchObject({ data_nascimento: null, genero: null, nacionalidade: null, estado_civil: null, habilitacao_academica: null });
    expect(ficha.pessoa).toMatchObject({ email_pessoal: null, email_trabalho: null, telefone_trabalho: null });
    expect(ficha.dadosPessoais?.telefone_pessoal).toBeNull();
    expect([ficha.morada, ficha.emergencia, ficha.bancarios, ficha.saude, ficha.fardamento, ficha.sindicalizacao]).toEqual([null, null, null, null, null, null]);
    expect(ficha.anexos).toEqual([]);
    expect(ficha.convite).toBeNull();
    expect(ficha.nomeTratamento).toBeNull();
    expect(ficha.vinculos[0]).toMatchObject({ categoria_funcao: null, categoria_profissional: null, renovavel: null, periodo_experimental_dias: null });
    expect(ficha.segredos).toEqual({ niss: "", conta: "" });
  });
});

describe("aplicarExtras: o que se escreveu aparece na ficha", () => {
  function completo(): ValoresNovaPessoa {
    let v = minimo();
    v = comPatch(v, "geral", { email_trabalho: "ana@emp.pt", telefone_trabalho: "211234567", numero_interno: "RH-9" });
    v = comPatch(v, "pessoais", {
      data_nascimento: "1990-05-17", genero: "feminino", nacionalidade: "pt", estado_civil: "casado", dependentes: "2",
      conjuge_situacao_profissional: "trabalhador", naturalidade_freguesia: "Arroios", naturalidade_concelho: "Lisboa", naturalidade_pais: "pt",
      tipo_documento: "cartao_cidadao", numero_documento: "12345678", nif: "123 456 789", niss: "12345678902",
      carta_conducao_numero: "L-1", email_pessoal: "ana@x.pt", telefone_pessoal: "912 345 678",
      morada_linha1: "Rua A, 1", morada_codigo_postal: "1000-001", morada_localidade: "Lisboa", morada_distrito: "Lisboa",
      emergencia_nome: "Rui", emergencia_relacao: "Pai", emergencia_telefone: "913000000",
      conta_numero: "PT50 0002 0123 1234 5678 9015 4", conta_titular: "Ana Sousa", conta_banco: "Banco X", conta_bic: "cgdiptpl",
      habilitacao_academica: "licenciatura", habilitacao_data_conclusao: "2012-07-01", tamanho_cima: "m", tamanho_calcado: "outro",
      tamanho_calcado_detalhe: "37,5",
    });
    v = comPatch(v, "extra", {
      nome_tratamento: "Aninha", conta_agencia: "0123", emergencia_telefone_alt: "914000000", saude_incapacidade: "60",
      saude_adaptacoes: "Cadeira", sindicalizado: "sim", sindicato: "SINTAC", sindicato_quota: "1,5", categoria_funcao: "geral",
      categoria_profissional: "Técnica", renovavel: "sim", isencao_horario: true,
    });
    return comPatch(v, "contrato", {
      regime: "tempo_parcial", tipo_trabalho: "hibrido", horas_trabalho: "20", dias_uteis: ["seg", "ter"], subsidio: "7,63",
      subsidio_modo: "cartao", tem_periodo_experimental: true, periodo_experimental_dias: "90",
    });
  }

  it("dados pessoais, documentos, contactos, morada, emergência, conta e farda", () => {
    const f = aplicarExtras(base(), extras(completo()));
    expect(f.dadosPessoais).toMatchObject({
      data_nascimento: "1990-05-17", genero: "feminino", nacionalidade: "PT", estado_civil: "casado", dependentes: 2,
      conjuge_situacao_profissional: "trabalhador", naturalidade_freguesia: "Arroios", naturalidade_pais: "PT",
      telefone_pessoal: "912 345 678", habilitacao_academica: "licenciatura", habilitacao_data_conclusao: "2012-07-01",
    });
    expect(f.identificacao).toMatchObject({ tipo_documento: "cartao_cidadao", numero_documento: "12345678", nif: "123456789", niss_ultimos4: "8902", carta_conducao_numero: "L-1" });
    expect(f.segredos.niss).toBe("12345678902");
    expect(f.pessoa).toMatchObject({ email_pessoal: "ana@x.pt", email_trabalho: "ana@emp.pt", telefone_trabalho: "211234567", numero_interno: "RH-9" });
    expect(f.morada).toMatchObject({ linha1: "Rua A, 1", codigo_postal: "1000-001", localidade: "Lisboa", distrito: "Lisboa", pais: "PT" });
    expect(f.emergencia).toMatchObject({ nome: "Rui", relacao: "Pai", telefone: "913000000", telefone_alternativo: "914000000" });
    expect(f.bancarios).toMatchObject({ formato_conta: "iban", titular: "Ana Sousa", banco: "Banco X", agencia: "0123", conta_ultimos4: "0154", conta_pais: "PT", swift: "CGDIPTPL" });
    expect(f.fardamento).toMatchObject({ tamanho_cima: "m", tamanho_calcado: "outro", tamanho_calcado_detalhe: "37,5", tamanho_baixo: null });
  });

  it("saúde, sindicalização, nome de tratamento, contrato, horas e retribuição", () => {
    const f = aplicarExtras(base(), extras(completo()));
    expect(f.saude).toMatchObject({ incapacidade_percentagem: 60, necessidades_adaptacao: "Cadeira", observacoes: null });
    expect(f.sindicalizacao).toMatchObject({ sindicalizado: true, sindicato: "SINTAC", quota_percentagem: 1.5 });
    expect(f.nomeTratamento).toBe("Aninha");
    expect(f.vinculos[0]).toMatchObject({
      regime: "tempo_parcial", tipo_trabalho: "hibrido", dias_uteis: ["seg", "ter"], periodo_experimental_dias: 90,
      periodo_experimental_origem: "manual", categoria_funcao: "geral", categoria_profissional: "Técnica", renovavel: true,
      isencao_horario: true, horas_periodo: 20, horas_frequencia: "semanal", horas_semanais_equivalentes: 20,
    });
    expect(f.horasVersoes).toHaveLength(1);
    expect(f.retribuicoes[0]).toMatchObject({ subsidio_alimentacao: 7.63, subsidio_alimentacao_modo: "cartao", duodecimos_pct: 50, origem: "pessoa" });
  });

  it("sindicato e quota só contam para quem está sindicalizado", () => {
    const v = comPatch(completo(), "extra", { sindicalizado: "nao" });
    expect(aplicarExtras(base(), extras(v)).sindicalizacao).toMatchObject({ sindicalizado: false, sindicato: null, quota_percentagem: null });
  });

  it("anexos escolhidos ficam na ficha, e a fotografia liga-se à pessoa", () => {
    const v = comPatch(minimo(), "extra", {
      anexos: [
        { id: "a", tipo: "cartao_cidadao", nome: "cc.pdf", tamanho: 1000, mime: "application/pdf" },
        { id: "b", tipo: "fotografia", nome: "foto.png", tamanho: 500, mime: "image/png" },
      ],
    });
    const f = aplicarExtras(base(), extras(v));
    expect(f.anexos.map((a) => [a.tipo, a.nome_original])).toEqual([["cartao_cidadao", "cc.pdf"], ["fotografia", "foto.png"]]);
    expect(f.pessoa.fotografia_anexo_id).not.toBeNull();
  });

  it("sem centro de trabalho a ficha não tem local nem afetação", () => {
    const f = aplicarExtras(base(), extras(minimo()));
    expect(f.pessoa.local_id).toBeNull();
    expect(f.afectacoes).toEqual([]);
    expect(f.horarioPlaneado.every((h) => h.local_id === null)).toBe(true);
  });
});

describe("aplicarExtras: convite e pendências", () => {
  it("«Criar e enviar convite» deixa um convite pendente para o e-mail pessoal, válido 7 dias", () => {
    const v = comPatch(minimo(), "pessoais", { email_pessoal: "ana@x.pt" });
    const f = aplicarExtras(base(), extras(v, true));
    expect(f.convite).toMatchObject({ estado: "pendente", emailDestino: "ana@x.pt", usadoEm: null });
    const dias = (Date.parse(f.convite?.validUntil ?? "") - Date.parse(f.convite?.criadoEm ?? "")) / 86_400_000;
    expect(dias).toBe(7);
  });

  it("o que a configuração pede e ficou vazio vira pendência da ficha; o preenchido sai da lista", () => {
    const sem = aplicarExtras(base(), extras(minimo())).pendencias.map((p) => p.codigo);
    expect(sem).toEqual(expect.arrayContaining(["nif", "niss", "genero", "linha1", "conta_numero"]));
    const com = aplicarExtras(base(), extras(comPatch(minimo(), "pessoais", { nif: "123456789" }))).pendencias.map((p) => p.codigo);
    expect(com).not.toContain("nif");
    expect(com).not.toContain("niss");
  });

  it("não muta a ficha de origem", () => {
    const original = base();
    const copia = JSON.stringify(original);
    aplicarExtras(original, extras(comPatch(minimo(), "pessoais", { nif: "123456789" })));
    expect(JSON.stringify(original)).toBe(copia);
  });
});

describe("paraNovaPessoa", () => {
  it("passa o essencial a quem cria a pessoa e ignora o fim num contrato sem termo", () => {
    const v = comPatch(minimo(), "contrato", { data_fim: "2027-01-01" });
    const nova = paraNovaPessoa(v, { config: CONFIG, comConvite: false });
    expect(nova).toMatchObject({ primeiro_nome: "Ana", apelido: "Sousa", cargoId: "cargo-1", localId: "", tipoContrato: "sem_termo", dataFim: null, reportaAId: null });
  });
});
