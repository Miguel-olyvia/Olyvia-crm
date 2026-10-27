/**
 * Do formulario "Nova pessoa" do rh-exemplo para o payload COMPLETO de `usePessoas.criarPessoa`.
 *
 * O que estes testes fecham: cada campo que o formulario recolhe chega ao payload (nada se perde em silencio), e o que
 * nao tem coluna na base (nome de tratamento) e dito em `naoGravado` em vez de ser descartado. Os ficheiros anexos nao
 * passam por aqui: seguem de verdade, depois de a ficha existir (`useAnexosNovaPessoa`).
 */
import { describe, expect, it } from "vitest";
import { intervaloVazio } from "@/components/rh-exemplo/lib/horario";
import { comPatch, valoresIniciais, type ValoresNovaPessoa } from "./tiposNova";
import { paraNovaPessoa } from "./paraStore";

const HOJE = "2026-10-14";
const OPCOES = {
  comConvite: false, config: null, cargoNome: "Vendedor/a", podeLigarConta: true, podeSaude: true, podeSindicalizacao: true,
};

function preenchido(): ValoresNovaPessoa {
  let v = valoresIniciais(HOJE);
  v = comPatch(v, "geral", {
    primeiro_nome: "  Teresa ", apelido: "Nogueira", email_trabalho: "teresa@x.pt", telefone_trabalho: "912345678",
    numero_interno: "RH-0042",
  });
  v = comPatch(v, "pessoais", {
    data_nascimento: "1990-05-17", genero: "feminino", nacionalidade: "pt", estado_civil: "casado", dependentes: "2",
    telefone_pessoal: "933333333", email_pessoal: "t@pessoal.pt", tipo_documento: "cartao_cidadao",
    numero_documento: "12345678", validade_documento: "2030-01-01", nif: "123 456 789", niss: "123 456 789 02",
    morada_linha1: "Rua A", morada_codigo_postal: "1000-001", morada_localidade: "Lisboa", morada_pais: "pt",
    conta_formato: "iban", conta_numero: "PT50 0002 0123 1234 5678 9015 4", conta_bic: "cgdiptpl",
    conta_titular: "Teresa Nogueira", conta_banco: "CGD", emergencia_nome: "Rui", emergencia_relacao: "irmão",
    emergencia_telefone: "911111111", tamanho_cima: "m",
  });
  v = comPatch(v, "laborais", { cargo_id: "cargo-1", local_id: "local-1", reporta_a_pessoa_id: "p-chefe", data_admissao: "2026-10-01" });
  v = comPatch(v, "contrato", {
    tipo_contrato: "termo_certo", data_inicio: "2026-10-01", data_fim: "2027-10-01", tipo_trabalho: "presencial",
    horas_trabalho: "40", horas_frequencia: "semanal", subsidio: "7,63", subsidio_modo: "cartao", duodecimos_pct: "50",
    tem_periodo_experimental: true, periodo_experimental_dias: "90", dias_uteis: ["seg", "ter", "qua", "qui", "sex"],
  });
  return comPatch(v, "extra", {
    categoria_funcao: "tecnica_confianca", categoria_profissional: " Técnico de 2.ª ", renovavel: "sim", isencao_horario: true,
    conta_agencia: "0123", emergencia_telefone_alt: "922222222", emergencia_email: "rui@x.pt",
    saude_incapacidade: "60", saude_validade: "2028-01-01", saude_adaptacoes: "Cadeira", saude_observacoes: "Nada",
    sindicalizado: "sim", sindicato: "SINTAP", sindicato_quota: "1,5",
  });
}

describe("paraNovaPessoa: cada campo do formulario chega ao payload real", () => {
  const { payload } = paraNovaPessoa(preenchido(), OPCOES);

  it("nucleo: nome, emails, telefone, numero interno, cargo (id e nome), local, chefia e datas", () => {
    expect(payload.nucleo).toMatchObject({
      primeiro_nome: "Teresa", apelido: "Nogueira", email_trabalho: "teresa@x.pt", email_pessoal: "t@pessoal.pt",
      telefone_trabalho: "912345678", numero_interno: "RH-0042", cargo: "Vendedor/a", cargo_id: "cargo-1",
      local_id: "local-1", reporta_a_pessoa_id: "p-chefe", data_admissao: "2026-10-01",
    });
  });

  it("dados pessoais, identificacao e morada", () => {
    expect(payload.dadosPessoais).toMatchObject({
      data_nascimento: "1990-05-17", genero: "feminino", nacionalidade: "PT", estado_civil: "casado", dependentes: 2,
      telefone_pessoal: "933333333",
    });
    expect(payload.identificacao).toMatchObject({
      tipo_documento: "cartao_cidadao", numero_documento: "12345678", validade_documento: "2030-01-01", nif: "123456789",
    });
    expect(payload.morada).toMatchObject({ linha1: "Rua A", codigo_postal: "1000-001", localidade: "Lisboa", pais: "PT" });
  });

  it("NISS sem espacos, vai para a RPC propria", () => {
    expect(payload.niss).toBe("12345678902");
  });

  it("conta: IBAN sem espacos, BIC, titular, banco e agencia", () => {
    expect(payload.conta).toMatchObject({
      formato: "iban", numero: "PT50000201231234567890154", swift: "CGDIPTPL", titular: "Teresa Nogueira", banco: "CGD",
      agencia: "0123",
    });
    expect(payload.bicSozinho).toBeNull();
  });

  it("so o BIC, sem numero de conta, vai em bicSozinho", () => {
    const v = comPatch(preenchido(), "pessoais", { conta_numero: "" });
    const { payload: p } = paraNovaPessoa(v, OPCOES);
    expect(p.conta).toBeNull();
    expect(p.bicSozinho).toBe("CGDIPTPL");
  });

  it("fardamento e emergencia completa (telefone alternativo e e-mail incluidos)", () => {
    expect(payload.fardamento).toMatchObject({ tamanho_cima: "m" });
    expect(payload.emergencia).toMatchObject({
      nome: "Rui", relacao: "irmão", telefone: "911111111", telefone_alternativo: "922222222", email: "rui@x.pt",
    });
  });

  it("vinculo, horas do contrato e extras do vinculo", () => {
    expect(payload.vinculo).toMatchObject({
      tipo_contrato: "termo_certo", data_inicio: "2026-10-01", data_fim: "2027-10-01", tipo_trabalho: "presencial",
      periodo_experimental_dias: 90, dias_uteis: ["seg", "ter", "qua", "qui", "sex"],
    });
    expect(payload.horasVinculo).toEqual({ horas_periodo: 40, horas_frequencia: "semanal", valido_de: "2026-10-01" });
    expect(payload.vinculoExtra).toEqual({
      categoria_funcao: "tecnica_confianca", categoria_profissional: "Técnico de 2.ª", renovavel: true, isencao_horario: true,
    });
  });

  it("retribuicao (subsidio, modo, duodecimos)", () => {
    expect(payload.retribuicao).toEqual({ subsidio: 7.63, subsidioModo: "cartao", duodecimosPct: 50 });
  });

  it("saude e sindicalizacao seguem com a permissao de as escrever", () => {
    expect(payload.saude).toEqual({
      incapacidade_percentagem: 60, incapacidade_comprovativo_valido_ate: "2028-01-01",
      necessidades_adaptacao: "Cadeira", observacoes: "Nada",
    });
    expect(payload.sindicalizacao).toEqual({ sindicalizado: true, sindicato: "SINTAP", quota_percentagem: 1.5 });
  });

  it("sem a permissao (ou sem a indicar), saude e sindicalizacao nao seguem, mesmo preenchidas no estado", () => {
    const sem = paraNovaPessoa(preenchido(), { ...OPCOES, podeSaude: false, podeSindicalizacao: false }).payload;
    expect(sem.saude).toBeNull();
    expect(sem.sindicalizacao).toBeNull();
    const omitido = paraNovaPessoa(preenchido(), { comConvite: false, config: null, cargoNome: "Vendedor/a" }).payload;
    expect(omitido.saude).toBeNull();
    expect(omitido.sindicalizacao).toBeNull();
  });

  it("a conta de CRM escolhida so segue ligada com a permissao de ligar", () => {
    const v = comPatch(preenchido(), "geral", { conta_id: "conta-1" });
    expect(paraNovaPessoa(v, OPCOES).payload.contaALigar).toBe("conta-1");
    expect(paraNovaPessoa(v, { ...OPCOES, podeLigarConta: false }).payload.contaALigar).toBeNull();
  });
});

describe("paraNovaPessoa: horario, acesso e o que nao tem equivalente", () => {
  it("horario variavel vira linhas de pessoas_horario_planeado; sem horario variavel e null", () => {
    expect(paraNovaPessoa(preenchido(), OPCOES).payload.horario).toBeNull();
    let v = preenchido();
    const dias = v.contrato.horario.dias.map((d) =>
      d.dia_semana === 1 ? { ...d, intervalos: [{ ...intervaloVazio(), hora_inicio: "09:00", hora_fim: "13:00" }] } : d);
    v = comPatch(v, "contrato", { horario_variavel: true, horario: { ...v.contrato.horario, dias } });
    const linhas = paraNovaPessoa(v, OPCOES).payload.horario;
    expect(linhas).toHaveLength(1);
    expect(linhas?.[0]).toMatchObject({ dia_semana: 1, hora_inicio: "09:00", hora_fim: "13:00", nao_trabalha: false });
  });

  it("papel de acesso so segue com acesso pedido; o convite nao se envia daqui", () => {
    const sem = paraNovaPessoa(comPatch(preenchido(), "acesso", { role_id: "papel-1" }), OPCOES).payload.acesso;
    expect(sem.role_id).toBeNull();
    const com = paraNovaPessoa(
      comPatch(comPatch(preenchido(), "acesso", { role_id: "papel-1" }), "extra", { criar_acesso: true, email_acesso: "a@x.pt" }),
      OPCOES,
    ).payload.acesso;
    expect(com).toMatchObject({ role_id: "papel-1", enviar_convite: false, email_convite: "a@x.pt" });
  });

  it("o nome de tratamento nao tem coluna: fica listado em naoGravado, nao descartado em silencio", () => {
    expect(paraNovaPessoa(preenchido(), OPCOES).naoGravado).toEqual([]);
    const v = comPatch(preenchido(), "extra", { nome_tratamento: "Tété" });
    expect(paraNovaPessoa(v, OPCOES).naoGravado).toEqual(["nome_tratamento"]);
  });

  it("um cargo escolhido sem nome recusa-se aqui, e nada vai a base", () => {
    expect(() => paraNovaPessoa(preenchido(), { ...OPCOES, cargoNome: null })).toThrow();
  });
});
