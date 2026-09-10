/**
 * O rascunho do assistente: o que e obrigatorio, o que e erro, e o que NUNCA
 * vai para o servidor.
 *
 * Os dois testes que importam mais:
 *
 *  1. o payload nao tem `organization_id` nem `entidade_legal_org_id` -- a
 *     entidade legal e a da organizacao activa e resolve-se no hook, nao no
 *     formulario. Se voltarem a aparecer aqui, voltou a ser possivel criar uma
 *     ficha numa organizacao escolhida no ecra;
 *  2. vazio nunca e erro. So os dois nomes sao exigidos, e um campo malformado
 *     e erro mesmo que o resto esteja em branco.
 */
import { describe, expect, it } from "vitest";
import { linhasParaGravar } from "@/lib/hr/horario";
import {
  avisosDoRascunho,
  dataDoPeriodoExperimental,
  payloadDoRascunho,
  problemasDoRascunho,
  rascunhoInicial,
  seccaoPreenchida,
} from "@/lib/hr/novaPessoa";

describe("rascunho de nova pessoa", () => {
  it("so exige primeiro nome e apelido", () => {
    const vazio = rascunhoInicial();
    const problemas = problemasDoRascunho(vazio);
    expect(problemas.map((p) => p.campoId).sort()).toEqual([
      "hr-novo-apelido",
      "hr-novo-primeiro-nome",
    ]);

    const comNomes = rascunhoInicial();
    comNomes.geral.primeiro_nome = "Ana";
    comNomes.geral.apelido = "Silva";
    expect(problemasDoRascunho(comNomes)).toHaveLength(0);
  });

  it("vazio nao e erro, malformado e", () => {
    const rascunho = rascunhoInicial();
    rascunho.geral.primeiro_nome = "Ana";
    rascunho.geral.apelido = "Silva";
    expect(problemasDoRascunho(rascunho)).toHaveLength(0);

    rascunho.pessoais.nif = "123";
    rascunho.geral.email_trabalho = "isto-nao-e-email";
    const campos = problemasDoRascunho(rascunho).map((p) => p.campoId).sort();
    expect(campos).toEqual(["hr-novo-email-trabalho", "hr-novo-nif"]);
  });

  it("apanha a incoerencia entre passos: termo antes do inicio, maximo abaixo do contratado", () => {
    const rascunho = rascunhoInicial();
    rascunho.geral.primeiro_nome = "Ana";
    rascunho.geral.apelido = "Silva";
    rascunho.contrato.data_inicio = "2026-03-01";
    rascunho.contrato.data_fim = "2026-01-01";
    rascunho.contrato.horas_trabalho = "40";
    rascunho.contrato.horas_frequencia = "semanal";
    rascunho.contrato.horas_semanais_maximas = "20";

    const mensagens = problemasDoRascunho(rascunho).map((p) => p.mensagemKey).sort();
    expect(mensagens).toEqual(["hr.form.erroDataFim", "hr.form.erroMaximoSemanal"]);
  });

  it("o payload nao leva organizacao nem entidade legal", () => {
    const rascunho = rascunhoInicial();
    rascunho.geral.primeiro_nome = "Ana";
    rascunho.geral.apelido = "Silva";

    const payload = payloadDoRascunho(rascunho, linhasParaGravar, false);
    const chaves = Object.keys(payload.nucleo);
    expect(chaves).not.toContain("organization_id");
    expect(chaves).not.toContain("entidade_legal_org_id");
    expect(JSON.stringify(payload)).not.toContain("entidade_legal");
  });

  it("nao cria satelites para seccoes que ficaram em branco", () => {
    const rascunho = rascunhoInicial();
    rascunho.geral.primeiro_nome = "Ana";
    rascunho.geral.apelido = "Silva";

    const payload = payloadDoRascunho(rascunho, linhasParaGravar, false);
    expect(payload.dadosPessoais).toBeNull();
    expect(payload.identificacao).toBeNull();
    expect(payload.morada).toBeNull();
    expect(payload.emergencia).toBeNull();
    expect(payload.vinculo).toBeNull();
    expect(payload.retribuicao).toBeNull();
    expect(payload.horario).toBeNull();
    expect(payload.niss).toBeNull();
  });

  it("o NISS sai a parte, para poder falhar sozinho", () => {
    const rascunho = rascunhoInicial();
    rascunho.geral.primeiro_nome = "Ana";
    rascunho.geral.apelido = "Silva";
    rascunho.pessoais.niss = "12345678901";
    rascunho.pessoais.nif = "123456789";

    const payload = payloadDoRascunho(rascunho, linhasParaGravar, false);
    expect(payload.niss).toBe("12345678901");
    expect(payload.identificacao).not.toBeNull();
    expect(payload.identificacao).not.toHaveProperty("niss");
  });

  it("deriva a data do periodo experimental da duracao, e so quando ha duracao", () => {
    expect(dataDoPeriodoExperimental("2026-01-01", 90)).toBe("2026-04-01");
    expect(dataDoPeriodoExperimental("", 90)).toBeNull();

    const rascunho = rascunhoInicial();
    rascunho.geral.primeiro_nome = "Ana";
    rascunho.geral.apelido = "Silva";
    rascunho.contrato.data_inicio = "2026-01-01";
    rascunho.contrato.tem_periodo_experimental = true;
    rascunho.contrato.periodo_experimental_dias = "90";

    const payload = payloadDoRascunho(rascunho, linhasParaGravar, false);
    expect(payload.vinculo).toMatchObject({
      periodo_experimental_dias: 90,
      periodo_experimental_ate: "2026-04-01",
    });
  });

  it("as horas sao validadas na unidade escolhida, nao no numero cru", () => {
    const rascunho = rascunhoInicial();
    rascunho.geral.primeiro_nome = "Ana";
    rascunho.geral.apelido = "Silva";

    // 2080 por ano e um contrato normal. Com o limite antigo -- 0..80 sobre o
    // numero cru -- isto era recusado.
    rascunho.contrato.horas_trabalho = "2080";
    rascunho.contrato.horas_frequencia = "anual";
    expect(problemasDoRascunho(rascunho)).toHaveLength(0);

    // O mesmo numero por semana e fisicamente impossivel.
    rascunho.contrato.horas_frequencia = "semanal";
    expect(problemasDoRascunho(rascunho).map((p) => p.campoId)).toEqual([
      "hr-novo-horas-trabalho",
    ]);
  });

  it("avisa da unidade trocada sem bloquear a gravacao", () => {
    const rascunho = rascunhoInicial();
    rascunho.geral.primeiro_nome = "Ana";
    rascunho.geral.apelido = "Silva";
    rascunho.contrato.horas_trabalho = "40";
    rascunho.contrato.horas_frequencia = "mensal";

    // Nao e erro: 9,2h por semana e um contrato legal.
    expect(problemasDoRascunho(rascunho)).toHaveLength(0);
    // Mas e quase sempre "40 por semana" mal escolhido, e diz-se.
    expect(avisosDoRascunho(rascunho).map((a) => a.mensagemKey)).toEqual([
      "hr.form.avisoHorasImplausiveis",
    ]);

    rascunho.contrato.horas_frequencia = "semanal";
    expect(avisosDoRascunho(rascunho)).toHaveLength(0);
  });

  it("a conta bancaria sai a parte, e o formato manda na validacao", () => {
    const rascunho = rascunhoInicial();
    rascunho.geral.primeiro_nome = "Ana";
    rascunho.geral.apelido = "Silva";

    // Um IBAN com o digito de controlo errado e erro.
    rascunho.pessoais.conta_numero = "PT51000201231234567890154";
    expect(problemasDoRascunho(rascunho).map((p) => p.mensagemKey)).toEqual([
      "hr.form.erroIban",
    ]);

    // O mesmo valor como CLABE passa: nao ha mod-97 fora do IBAN.
    rascunho.pessoais.conta_formato = "clabe";
    expect(problemasDoRascunho(rascunho)).toHaveLength(0);

    // E vai FORA do insert -- a tabela tem a escrita revogada.
    const payload = payloadDoRascunho(rascunho, linhasParaGravar, false);
    expect(payload.conta).toEqual({
      formato: "clabe",
      numero: "PT51000201231234567890154",
    });
    expect(JSON.stringify(payload.dadosPessoais)).not.toContain("PT51");
  });

  it("o nome social e os pronomes deixaram de existir no payload", () => {
    const rascunho = rascunhoInicial();
    rascunho.geral.primeiro_nome = "Ana";
    rascunho.geral.apelido = "Silva";
    rascunho.pessoais.nacionalidade = "PT";

    const payload = payloadDoRascunho(rascunho, linhasParaGravar, false);
    const serializado = JSON.stringify(payload);
    expect(serializado).not.toContain("nome_social");
    expect(serializado).not.toContain("pronomes");
    // A nacionalidade vai em maiusculas: o CHECK da base e ^[A-Z]{2}$.
    expect(payload.dadosPessoais).toMatchObject({ nacionalidade: "PT" });
  });

    it("o estado de cada seccao segue o que esta preenchido", () => {
    const rascunho = rascunhoInicial();
    expect(seccaoPreenchida(rascunho, "geral")).toBe(false);
    expect(seccaoPreenchida(rascunho, "pessoais")).toBe(false);

    rascunho.geral.primeiro_nome = "Ana";
    expect(seccaoPreenchida(rascunho, "geral")).toBe(true);

    // O pais da morada vem preenchido por omissao e nao conta como
    // "seccao preenchida": senao os Detalhes pessoais nasciam com visto.
    expect(seccaoPreenchida(rascunho, "pessoais")).toBe(false);
    rascunho.pessoais.nif = "123456789";
    expect(seccaoPreenchida(rascunho, "pessoais")).toBe(true);
  });
});
