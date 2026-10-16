/**
 * Dos valores do painel «Nova pessoa» para o payload REAL de `usePessoas.criarPessoa`.
 *
 * O que estes testes fecham:
 *  1. o que o painel partilha com o assistente real vai tal e qual como `payloadDoRascunho` o escreve (a mesma
 *     normalização, o mesmo NIF sem espaços, o mesmo país em maiúsculas): `paraPayload` não reimplementa nada;
 *  2. o que o painel recolhe a mais (saúde, sindicalização, categoria, renovável, isenção, agência, contacto de
 *     emergência completo) chega ao payload em campos próprios e opcionais, e só quando foi escrito;
 *  3. nada que não tenha coluna na base segue (o nome de tratamento fica de fora).
 */
import { describe, expect, it } from "vitest";
import { linhasParaGravar } from "@/lib/hr/horario";
import { payloadDoRascunho } from "@/lib/hr/novaPessoa";
import { paraPayload } from "./paraPayload";
import { comPatch, valoresIniciais, type ValoresNovaPessoa } from "./tiposNova";

const HOJE = "2026-10-14";
const OPCOES = { podeLigarConta: true, podeSaude: true, podeSindicalizacao: true, cargoNome: "Vendedor/a" };

/** Um formulário preenchido de ponta a ponta, sem nenhum dos extras. */
function preenchido(): ValoresNovaPessoa {
  let v = valoresIniciais(HOJE);
  v = comPatch(v, "geral", {
    primeiro_nome: "  Teresa ", apelido: "Nogueira", email_trabalho: "teresa@x.pt", telefone_trabalho: "912345678",
    numero_interno: "RH-0042", conta_id: "conta-1",
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
  return comPatch(v, "contrato", {
    tipo_contrato: "termo_certo", data_inicio: "2026-10-01", data_fim: "2027-10-01", tipo_trabalho: "presencial",
    horas_trabalho: "40", horas_frequencia: "semanal", subsidio: "7,63", subsidio_modo: "cartao", duodecimos_pct: "50",
    tem_periodo_experimental: true, periodo_experimental_dias: "90", dias_uteis: ["seg", "ter", "qua", "qui", "sex"],
  });
}

const SEM_EXTRAS = { saude: null, sindicalizacao: null, vinculoExtra: null };

describe("paraPayload: o que é do assistente real vai como o assistente real o escreve", () => {
  it("sem extras, é exatamente o payload de payloadDoRascunho", () => {
    const v = preenchido();
    const real = payloadDoRascunho(v, linhasParaGravar, true, "Vendedor/a");
    expect(paraPayload(v, OPCOES)).toEqual({ ...real, ...SEM_EXTRAS });
  });

  it("o formulário vazio (só com o nome) também coincide", () => {
    const v = comPatch(valoresIniciais(HOJE), "geral", { primeiro_nome: "Ana", apelido: "Sousa" });
    const semCargo = comPatch(v, "laborais", { cargo_id: "" });
    const real = payloadDoRascunho(semCargo, linhasParaGravar, false, null);
    expect(paraPayload(semCargo, { podeLigarConta: false, podeSaude: false, podeSindicalizacao: false, cargoNome: null })).toEqual({ ...real, ...SEM_EXTRAS });
  });

  it("sem a permissão de ligar contas, a conta escolhida só preenche e não segue", () => {
    expect(paraPayload(preenchido(), { ...OPCOES, podeLigarConta: false }).contaALigar).toBeNull();
    expect(paraPayload(preenchido(), OPCOES).contaALigar).toBe("conta-1");
  });

  it("um cargo escolhido sem o nome do cargo recusa-se aqui, e não vai à base", () => {
    expect(() => paraPayload(preenchido(), { ...OPCOES, cargoNome: null })).toThrow();
  });
});

describe("paraPayload: os extras são opcionais e só seguem se foram escritos", () => {
  it("saúde: só as colunas que existem em pessoas_dados_saude", () => {
    const v = comPatch(preenchido(), "extra", {
      saude_incapacidade: "60", saude_validade: "2027-01-01", saude_adaptacoes: " rampa ", saude_observacoes: "",
    });
    expect(paraPayload(v, OPCOES).saude).toEqual({
      incapacidade_percentagem: 60,
      incapacidade_comprovativo_valido_ate: "2027-01-01",
      necessidades_adaptacao: "rampa",
      observacoes: null,
    });
  });

  it("sindicalização: «sim» leva o sindicato e a quota; «não» limpa-os; por decidir não grava nada", () => {
    const sim = comPatch(preenchido(), "extra", { sindicalizado: "sim", sindicato: " SINTAP ", sindicato_quota: "1,5" });
    expect(paraPayload(sim, OPCOES).sindicalizacao).toEqual({ sindicalizado: true, sindicato: "SINTAP", quota_percentagem: 1.5 });
    const nao = comPatch(preenchido(), "extra", { sindicalizado: "nao", sindicato: "SINTAP", sindicato_quota: "2" });
    expect(paraPayload(nao, OPCOES).sindicalizacao).toEqual({ sindicalizado: false, sindicato: null, quota_percentagem: null });
    expect(paraPayload(preenchido(), OPCOES).sindicalizacao).toBeNull();
  });

  it("contrato: categoria, categoria profissional, renovável e isenção só levam o que foi escolhido", () => {
    const v = comPatch(preenchido(), "extra", {
      categoria_funcao: "tecnica_confianca", categoria_profissional: " Técnico de 2.ª ", renovavel: "sim", isencao_horario: true,
    });
    expect(paraPayload(v, OPCOES).vinculoExtra).toEqual({
      categoria_funcao: "tecnica_confianca", categoria_profissional: "Técnico de 2.ª", renovavel: true, isencao_horario: true,
    });
    const soRenovavel = comPatch(preenchido(), "extra", { renovavel: "nao" });
    expect(paraPayload(soRenovavel, OPCOES).vinculoExtra).toEqual({ renovavel: false });
  });

  it("o contacto de emergência leva o telefone alternativo e o e-mail, mas só com nome e telefone", () => {
    const v = comPatch(preenchido(), "extra", { emergencia_telefone_alt: "922222222", emergencia_email: "rui@x.pt" });
    expect(paraPayload(v, OPCOES).emergencia).toEqual({
      nome: "Rui", relacao: "irmão", telefone: "911111111", ordem: 1,
      telefone_alternativo: "922222222", email: "rui@x.pt",
    });
    const semContacto = comPatch(
      comPatch(preenchido(), "pessoais", { emergencia_nome: "", emergencia_telefone: "" }),
      "extra",
      { emergencia_telefone_alt: "922222222" },
    );
    expect(paraPayload(semContacto, OPCOES).emergencia).toBeNull();
  });

  it("a agência segue com a conta (a RPC tem p_agencia), e sem número de conta não segue", () => {
    const v = comPatch(preenchido(), "extra", { conta_agencia: " 0123 " });
    expect(paraPayload(v, OPCOES).conta).toMatchObject({ formato: "iban", agencia: "0123" });
    const semConta = comPatch(comPatch(preenchido(), "pessoais", { conta_numero: "" }), "extra", { conta_agencia: "0123" });
    expect(paraPayload(semConta, OPCOES).conta).toBeNull();
  });

  it("criar acesso leva o papel e o e-mail de acesso; sem a opção, nada disto segue", () => {
    const com = comPatch(comPatch(preenchido(), "extra", { criar_acesso: true, email_acesso: "acesso@x.pt" }), "acesso", { role_id: "papel-1" });
    expect(paraPayload(com, OPCOES).acesso).toEqual({ role_id: "papel-1", enviar_convite: false, email_convite: "acesso@x.pt" });
    const sem = comPatch(preenchido(), "acesso", { role_id: "papel-1" });
    expect(paraPayload(sem, OPCOES).acesso.role_id).toBeNull();
  });

  it("o nome de tratamento não existe no payload (ainda não há coluna na base)", () => {
    expect(JSON.stringify(paraPayload(preenchido(), OPCOES))).not.toContain("tratamento");
  });
});

describe("paraPayload: saúde e sindicalização (art. 9.º do RGPD) seguem a permissão de quem cria, não só o ecrã", () => {
  const comDados = () =>
    comPatch(preenchido(), "extra", {
      saude_incapacidade: "60", saude_adaptacoes: "rampa", sindicalizado: "sim", sindicato: "SINTAP", sindicato_quota: "1,5",
    });

  it("sem hr.pessoas.saude.edit a saúde não segue, mesmo que o estado do formulário a tenha (campo escondido que ficou preenchido)", () => {
    const p = paraPayload(comDados(), { ...OPCOES, podeSaude: false });
    expect(p.saude).toBeNull();
    expect(p.sindicalizacao).not.toBeNull();
  });

  it("sem hr.pessoas.sindicalizacao.edit a sindicalização não segue, e a saúde sim", () => {
    const p = paraPayload(comDados(), { ...OPCOES, podeSindicalizacao: false });
    expect(p.sindicalizacao).toBeNull();
    expect(p.saude).not.toBeNull();
  });

  it("sem nenhuma das duas, o payload não leva nenhum dos dois satélites", () => {
    const p = paraPayload(comDados(), { ...OPCOES, podeSaude: false, podeSindicalizacao: false });
    expect(p.saude).toBeNull();
    expect(p.sindicalizacao).toBeNull();
    expect(JSON.stringify(p)).not.toContain("SINTAP");
    expect(JSON.stringify(p)).not.toContain("rampa");
  });
});
