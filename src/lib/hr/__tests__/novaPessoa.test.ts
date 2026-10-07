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
import { getLocalizedFallback } from "@/utils/friendlyError";
import { describe, expect, it } from "vitest";
import { linhasParaGravar } from "@/lib/hr/horario";
import type { ConfiguracaoCampo } from "@/lib/hr/admissaoObrigatorios";
import {
  avisosDoRascunho,
  camposPorPreencherNaFicha,
  codigosObrigatoriosDoFormulario,
  dataDoPeriodoExperimental,
  payloadDoRascunho,
  problemasDoRascunho,
  rascunhoInicial as rascunhoInicialBase,
  seccaoPreenchida,
} from "@/lib/hr/novaPessoa";

const CARGO_ID = "cargo-1";
const NOME_CARGO = "Operador";

/**
 * Desde o fluxo 2 toda a pessoa tem cargo: sem `laborais.cargo_id` a ficha nao
 * se cria. Quase todos os testes querem um rascunho valido, por isso este
 * ponto de partida ja traz cargo; os que testam a falta dele usam o base.
 */
function rascunhoInicial() {
  const r = rascunhoInicialBase();
  r.laborais.cargo_id = CARGO_ID;
  return r;
}

describe("rascunho de nova pessoa", () => {
  it("so exige nomes e cargo (sem configuracao a que recorrer)", () => {
    const vazio = rascunhoInicialBase();
    const problemas = problemasDoRascunho(vazio);
    expect(problemas.map((p) => p.campoId).sort()).toEqual([
      "hr-novo-apelido",
      "hr-novo-cargo",
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

    const payload = payloadDoRascunho(rascunho, linhasParaGravar, false, NOME_CARGO);
    const chaves = Object.keys(payload.nucleo);
    expect(chaves).not.toContain("organization_id");
    expect(chaves).not.toContain("entidade_legal_org_id");
    expect(JSON.stringify(payload)).not.toContain("entidade_legal");
  });

  it("nao cria satelites para seccoes que ficaram em branco", () => {
    const rascunho = rascunhoInicial();
    rascunho.geral.primeiro_nome = "Ana";
    rascunho.geral.apelido = "Silva";

    const payload = payloadDoRascunho(rascunho, linhasParaGravar, false, NOME_CARGO);
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

    const payload = payloadDoRascunho(rascunho, linhasParaGravar, false, NOME_CARGO);
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

    const payload = payloadDoRascunho(rascunho, linhasParaGravar, false, NOME_CARGO);
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
    // Os campos so do RH preenchidos: senao ha tambem o aviso de pendencia.
    rascunho.laborais.data_admissao = "2026-01-01";
    rascunho.contrato.tipo_contrato = "sem_termo";
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
    const payload = payloadDoRascunho(rascunho, linhasParaGravar, false, NOME_CARGO);
    expect(payload.conta).toEqual({
      formato: "clabe",
      numero: "PT51000201231234567890154",
      swift: null,
      titular: null,
      banco: null,
    });
    expect(JSON.stringify(payload.dadosPessoais)).not.toContain("PT51");
  });

  describe("BIC", () => {
    function rascunhoComNomes() {
      const rascunho = rascunhoInicial();
      rascunho.geral.primeiro_nome = "Ana";
      rascunho.geral.apelido = "Silva";
      return rascunho;
    }
    const IBAN_BOM = "PT50000201231234567890154";

    it("um BIC malformado e problema do campo hr-novo-conta-bic", () => {
      const rascunho = rascunhoComNomes();
      rascunho.pessoais.conta_numero = IBAN_BOM;
      rascunho.pessoais.conta_bic = "ABCD1234";
      const problemas = problemasDoRascunho(rascunho);
      expect(problemas).toHaveLength(1);
      expect(problemas[0]).toMatchObject({
        seccao: "pessoais",
        campoId: "hr-novo-conta-bic",
        rotuloKey: "hr.campos.swift",
        mensagemKey: "hr.form.erroBic",
      });
    });

    it("um BIC valido sem numero de conta nao e problema: vai sozinho, por rpc_hr_definir_bic", () => {
      const rascunho = rascunhoComNomes();
      rascunho.pessoais.conta_bic = " cgdi ptpl ";
      expect(problemasDoRascunho(rascunho)).toHaveLength(0);
      const payload = payloadDoRascunho(rascunho, linhasParaGravar, false, NOME_CARGO);
      expect(payload.conta).toBeNull();
      expect(payload.bicSozinho).toBe("CGDIPTPL");
    });

    it("com numero de conta o BIC viaja em conta.swift e bicSozinho fica null", () => {
      const rascunho = rascunhoComNomes();
      rascunho.pessoais.conta_numero = IBAN_BOM;
      rascunho.pessoais.conta_bic = "CGDIPTPL";
      const payload = payloadDoRascunho(rascunho, linhasParaGravar, false, NOME_CARGO);
      expect(payload.conta?.swift).toBe("CGDIPTPL");
      expect(payload.bicSozinho).toBeNull();
    });

    it("sem BIC nem conta, bicSozinho e null", () => {
      const payload = payloadDoRascunho(rascunhoComNomes(), linhasParaGravar, false, NOME_CARGO);
      expect(payload.bicSozinho).toBeNull();
    });

    it("vazio nao e erro", () => {
      const rascunho = rascunhoComNomes();
      rascunho.pessoais.conta_bic = "   ";
      expect(problemasDoRascunho(rascunho)).toHaveLength(0);
    });

    it("o BIC sai normalizado em payload.conta.swift, e null quando nao ha BIC", () => {
      const rascunho = rascunhoComNomes();
      rascunho.pessoais.conta_numero = IBAN_BOM;
      rascunho.pessoais.conta_bic = " cgdi ptpl ";
      expect(problemasDoRascunho(rascunho)).toHaveLength(0);
      expect(payloadDoRascunho(rascunho, linhasParaGravar, false, NOME_CARGO).conta).toEqual({
        formato: "iban",
        numero: IBAN_BOM,
        swift: "CGDIPTPL",
        titular: null,
        banco: null,
      });

      rascunho.pessoais.conta_bic = "";
      expect(payloadDoRascunho(rascunho, linhasParaGravar, false, NOME_CARGO).conta?.swift).toBeNull();
    });

    it("o BIC aplica-se a todos os formatos de conta", () => {
      const rascunho = rascunhoComNomes();
      rascunho.pessoais.conta_formato = "clabe";
      rascunho.pessoais.conta_numero = "0123456789";
      rascunho.pessoais.conta_bic = "CGDIPTPLXXX";
      expect(problemasDoRascunho(rascunho)).toHaveLength(0);
      expect(payloadDoRascunho(rascunho, linhasParaGravar, false, NOME_CARGO).conta?.swift).toBe(
        "CGDIPTPLXXX",
      );
    });

    it("escrever so o BIC conta como seccao preenchida", () => {
      const rascunho = rascunhoInicial();
      rascunho.pessoais.conta_bic = "CGDIPTPL";
      expect(seccaoPreenchida(rascunho, "pessoais")).toBe(true);
    });
  });

  it("o nome social e os pronomes deixaram de existir no payload", () => {
    const rascunho = rascunhoInicial();
    rascunho.geral.primeiro_nome = "Ana";
    rascunho.geral.apelido = "Silva";
    rascunho.pessoais.nacionalidade = "PT";

    const payload = payloadDoRascunho(rascunho, linhasParaGravar, false, NOME_CARGO);
    const serializado = JSON.stringify(payload);
    expect(serializado).not.toContain("nome_social");
    expect(serializado).not.toContain("pronomes");
    // A nacionalidade vai em maiusculas: o CHECK da base e ^[A-Z]{2}$.
    expect(payload.dadosPessoais).toMatchObject({ nacionalidade: "PT" });
  });

  it("o e-mail pessoal vai para o nucleo, nunca para dadosPessoais", () => {
    const rascunho = rascunhoInicial();
    rascunho.geral.primeiro_nome = "Ana";
    rascunho.geral.apelido = "Silva";
    rascunho.pessoais.email_pessoal = "ana@exemplo.pt";
    rascunho.pessoais.data_nascimento = "1990-01-01";

    const payload = payloadDoRascunho(rascunho, linhasParaGravar, false, NOME_CARGO);
    expect(payload.nucleo.email_pessoal).toBe("ana@exemplo.pt");
    expect(payload.dadosPessoais).not.toHaveProperty("email_comunicacoes");
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

  it("nenhuma escolha de UI conta como seccao preenchida: vazio e vazio", () => {
    // Fechar o assistente sem nada escrito nao pede confirmacao.
    expect(seccaoPreenchida(rascunhoInicial(), "geral")).toBe(false);
  });
});

/** Uma linha da configuracao: so interessa o codigo e a posicao. */
function linha(codigo: string, posicao: "convite" | "ficha" | "opcional" | "rh" = "convite"): ConfiguracaoCampo {
  return {
    codigo,
    origem: posicao === "rh" ? "rh" : "pessoa",
    condicional: false,
    posicao,
    configuravel: posicao !== "rh",
  };
}

function comNomes() {
  const r = rascunhoInicial();
  r.geral.primeiro_nome = "Ana";
  r.geral.apelido = "Silva";
  return r;
}

describe("o que bloqueia a criacao da ficha", () => {
  it("sem configuracao so exige nome, apelido (e cargo)", () => {
    expect(problemasDoRascunho(comNomes())).toHaveLength(0);
    expect(problemasDoRascunho(comNomes(), { config: null })).toHaveLength(0);
    expect(problemasDoRascunho(comNomes(), { config: undefined })).toHaveLength(0);
  });

  it("sem convite (o RH preenche), um obrigatorio da configuracao em falta RECUSA a criacao", () => {
    const config = [linha("telefone_pessoal", "convite"), linha("linha1", "convite")];
    const problemas = problemasDoRascunho(comNomes(), { config });
    expect(problemas.map((p) => p.campoId).sort()).toEqual([
      "hr-novo-morada-linha1",
      "hr-novo-telefone-pessoal",
    ]);
    expect(problemas.every((p) => p.mensagemKey === "hr.form.erroObrigatorio")).toBe(true);

    const preenchido = comNomes();
    preenchido.pessoais.telefone_pessoal = "912345678";
    preenchido.pessoais.morada_linha1 = "Rua A";
    expect(problemasDoRascunho(preenchido, { config })).toHaveLength(0);
  });

  it("as posicoes ficha e opcional nunca bloqueiam, nem os campos so do RH", () => {
    const config = [
      linha("telefone_pessoal", "ficha"),
      linha("genero", "opcional"),
      linha("cargo", "rh"),
    ];
    expect(problemasDoRascunho(comNomes(), { config })).toHaveLength(0);
  });

  it("sem convite respeita as condicoes: validade so sem cartao de cidadao, NIF ou NISS basta um, conjuge so com casado", () => {
    const config = [
      linha("validade_documento"),
      linha("nif"),
      linha("niss"),
      linha("conjuge_situacao_profissional"),
    ];

    const cartao = comNomes();
    cartao.pessoais.tipo_documento = "cartao_cidadao";
    cartao.pessoais.niss = "12345678902";
    expect(problemasDoRascunho(cartao, { config })).toHaveLength(0);

    const passaporte = comNomes();
    passaporte.pessoais.tipo_documento = "passaporte";
    passaporte.pessoais.nif = "123456789";
    expect(problemasDoRascunho(passaporte, { config }).map((p) => p.campoId)).toEqual([
      "hr-novo-validade-documento",
    ]);

    const casado = comNomes();
    casado.pessoais.estado_civil = "casado";
    casado.pessoais.niss = "12345678902";
    expect(problemasDoRascunho(casado, { config }).map((p) => p.campoId).sort()).toEqual([
      "hr-novo-conjuge-situacao",
    ]);

    expect(problemasDoRascunho(comNomes(), { config }).map((p) => p.campoId).sort()).toEqual([
      "hr-novo-nif",
      "hr-novo-niss",
    ]);
  });

  it("dependentes a 0 e resposta", () => {
    const rascunho = comNomes();
    rascunho.pessoais.dependentes = "0";
    expect(problemasDoRascunho(rascunho, { config: [linha("dependentes")] })).toHaveLength(0);
  });

  it("COM convite so exige o e-mail pessoal, mesmo com a configuracao a pedir tudo", () => {
    const rascunho = comNomes();
    const config = [linha("telefone_pessoal"), linha("nif"), linha("data_nascimento")];

    const problemas = problemasDoRascunho(rascunho, { comConvite: true, config });
    expect(problemas.map((p) => p.campoId)).toEqual(["hr-novo-email-pessoal"]);
    expect(problemas[0].mensagemKey).toBe("hr.form.erroObrigatorio");

    rascunho.pessoais.email_pessoal = "ana@exemplo.pt";
    expect(problemasDoRascunho(rascunho, { comConvite: true, config })).toHaveLength(0);
  });

  it("sem convite o e-mail pessoal so e exigido se a configuracao o pedir", () => {
    expect(problemasDoRascunho(comNomes())).toHaveLength(0);
    expect(
      problemasDoRascunho(comNomes(), { config: [linha("email_pessoal")] }).map((p) => p.campoId),
    ).toEqual(["hr-novo-email-pessoal"]);
  });

  it("um e-mail so com espacos conta como vazio quando se envia convite", () => {
    const rascunho = comNomes();
    rascunho.pessoais.email_pessoal = "   ";
    expect(problemasDoRascunho(rascunho)).toHaveLength(0);
    expect(problemasDoRascunho(rascunho, { comConvite: true }).map((p) => p.mensagemKey)).toEqual([
      "hr.form.erroObrigatorio",
    ]);
  });

  it("um e-mail mal escrito e erro de formato, com ou sem convite", () => {
    const rascunho = comNomes();
    rascunho.pessoais.email_pessoal = "isto-nao-e-email";
    expect(problemasDoRascunho(rascunho).map((p) => p.mensagemKey)).toEqual(["hr.form.erroEmail"]);
    expect(problemasDoRascunho(rascunho, { comConvite: true }).map((p) => p.mensagemKey)).toEqual([
      "hr.form.erroEmail",
    ]);
  });

  it("os asteriscos seguem a accao: sem convite os da posicao convite, com convite nenhum", () => {
    const config = [linha("telefone_pessoal"), linha("naturalidade_concelho"), linha("genero", "ficha")];
    expect([...codigosObrigatoriosDoFormulario(false, config)].sort()).toEqual([
      "naturalidade_concelho",
      "telefone_pessoal",
    ]);
    expect(codigosObrigatoriosDoFormulario(true, config).size).toBe(0);
    expect(codigosObrigatoriosDoFormulario(false, null).size).toBe(0);
  });
});

describe("pendencias da ficha (o que nao bloqueia e fica por preencher)", () => {
  it("lista o que esta em posicao ficha e vazio; opcional, preenchidos e do RH nunca", () => {
    const rascunho = comNomes();
    rascunho.pessoais.telefone_pessoal = "912345678";
    const config = [
      linha("telefone_pessoal", "ficha"), // preenchido
      linha("data_nascimento", "ficha"), // vazio: pendencia
      linha("genero", "opcional"), // opcional: nunca
      linha("linha1", "convite"), // convite: bloqueia, nao e pendencia
      linha("cargo", "rh"), // do RH
    ];
    expect(camposPorPreencherNaFicha(config, rascunho.pessoais)).toEqual(["data_nascimento"]);
  });

  it("respeita as condicoes da posicao ficha", () => {
    const config = [linha("validade_documento", "ficha"), linha("conjuge_situacao_profissional", "ficha")];
    const cartao = comNomes();
    cartao.pessoais.tipo_documento = "cartao_cidadao";
    expect(camposPorPreencherNaFicha(config, cartao.pessoais)).toEqual([]);
    const passaporte = comNomes();
    passaporte.pessoais.tipo_documento = "passaporte";
    passaporte.pessoais.estado_civil = "uniao_de_facto";
    expect(camposPorPreencherNaFicha(config, passaporte.pessoais)).toEqual([
      "validade_documento",
      "conjuge_situacao_profissional",
    ]);
  });

  it("um codigo que o formulario nao conhece fica sempre pendente, em qualquer posicao pedida", () => {
    const config = [linha("campo_futuro", "ficha"), linha("outro_futuro", "convite")];
    expect(camposPorPreencherNaFicha(config, comNomes().pessoais)).toEqual(["campo_futuro", "outro_futuro"]);
  });

  it("sem configuracao nao se inventa nada", () => {
    expect(camposPorPreencherNaFicha(null, comNomes().pessoais)).toEqual([]);
    expect(camposPorPreencherNaFicha(undefined, comNomes().pessoais)).toEqual([]);
  });
});

describe("NIF e NISS com digito de controlo", () => {
  it("recusa o NIF e o NISS com o digito errado, aceita os validos", () => {
    const rascunho = comNomes();
    rascunho.pessoais.nif = "123456788";
    rascunho.pessoais.niss = "12345678901";
    expect(problemasDoRascunho(rascunho).map((p) => p.mensagemKey).sort()).toEqual([
      "hr.form.erroNif",
      "hr.form.erroNiss",
    ]);

    rascunho.pessoais.nif = "123456789";
    rascunho.pessoais.niss = "12345678902";
    expect(problemasDoRascunho(rascunho)).toHaveLength(0);
  });

  it("o payload leva o NIF e o NISS sem espacos", () => {
    const rascunho = comNomes();
    rascunho.pessoais.nif = "123 456 789";
    rascunho.pessoais.niss = "123 4567 8902";
    const payload = payloadDoRascunho(rascunho, linhasParaGravar, false, NOME_CARGO);
    expect(payload.identificacao).toMatchObject({ nif: "123456789" });
    expect(payload.niss).toBe("12345678902");
  });
});

describe("campos so do RH", () => {
  it("nao bloqueiam a criacao mas avisam que ficam pendencia (o cargo ja nao e um deles)", () => {
    const rascunho = comNomes();
    expect(problemasDoRascunho(rascunho)).toHaveLength(0);
    const avisos = avisosDoRascunho(rascunho);
    expect(avisos.map((a) => a.campoId).sort()).toEqual([
      "hr-novo-data-admissao",
      "hr-novo-tipo-contrato",
    ]);
    expect(avisos.every((a) => a.mensagemKey === "hr.form.avisoCampoRhPendente")).toBe(true);

    rascunho.laborais.data_admissao = "2026-01-01";
    rascunho.contrato.tipo_contrato = "sem_termo";
    expect(avisosDoRascunho(rascunho)).toHaveLength(0);
  });
});

describe("o cargo e obrigatorio (fluxo 2)", () => {
  it("sem cargo_id e um PROBLEMA bloqueante, nao um aviso", () => {
    const rascunho = rascunhoInicialBase();
    rascunho.geral.primeiro_nome = "Ana";
    rascunho.geral.apelido = "Silva";
    rascunho.pessoais.email_pessoal = "ana@exemplo.pt";

    const problemas = problemasDoRascunho(rascunho);
    expect(problemas).toEqual([
      {
        seccao: "laborais",
        campoId: "hr-novo-cargo",
        rotuloKey: "hr.columns.cargo",
        mensagemKey: "hr.form.cargoObrigatorio",
      },
    ]);
    expect(avisosDoRascunho(rascunho).map((a) => a.campoId)).not.toContain("hr-novo-cargo");
  });

  it("e obrigatorio tambem por convite", () => {
    const rascunho = rascunhoInicialBase();
    rascunho.geral.primeiro_nome = "Ana";
    rascunho.geral.apelido = "Silva";
    rascunho.pessoais.email_pessoal = "ana@exemplo.pt";
    expect(problemasDoRascunho(rascunho).map((p) => p.campoId)).toEqual(["hr-novo-cargo"]);
  });

  it("o nucleo leva cargo_id e o nome do cargo escolhido como texto", () => {
    const rascunho = comNomes();
    const payload = payloadDoRascunho(rascunho, linhasParaGravar, false, "Operador");
    expect(payload.nucleo).toMatchObject({ cargo_id: CARGO_ID, cargo: "Operador" });
  });

  it("com cargo_id mas sem o nome do catalogo FALHA com erro claro: pessoas.cargo nunca fica null sem aviso", () => {
    expect(() => payloadDoRascunho(comNomes(), linhasParaGravar, false)).toThrow(getLocalizedFallback("hr.form.cargoObrigatorio"));
    expect(() => payloadDoRascunho(comNomes(), linhasParaGravar, false, null)).toThrow(getLocalizedFallback("hr.form.cargoObrigatorio"));
    expect(() => payloadDoRascunho(comNomes(), linhasParaGravar, false, "   ")).toThrow(getLocalizedFallback("hr.form.cargoObrigatorio"));
  });

  it("sem cargo_id (problema bloqueante, tratado antes) nao ha nome a exigir", () => {
    const sem = comNomes();
    sem.laborais.cargo_id = "";
    const payload = payloadDoRascunho(sem, linhasParaGravar, false);
    expect(payload.nucleo.cargo_id).toBe("");
    expect(payload.nucleo.cargo).toBeNull();
  });

  it("numeros em hexadecimal ou notacao cientifica nao passam para o payload (0x10, 1e3)", () => {
    const rascunho = comNomes();
    rascunho.pessoais.dependentes = "0x10";
    rascunho.contrato.horas_trabalho = "1e3";
    const payload = payloadDoRascunho(rascunho, linhasParaGravar, false, NOME_CARGO);
    expect(payload.dadosPessoais?.dependentes ?? null).toBeNull();
    expect(payload.horasVinculo).toBeNull();
  });
});

describe("o valor base ja nao vem do contrato (fluxo 2)", () => {
  it("o rascunho do contrato perdeu valor_base, moeda e periodicidade", () => {
    const contrato = rascunhoInicial().contrato as unknown as Record<string, unknown>;
    expect(contrato).not.toHaveProperty("valor_base");
    expect(contrato).not.toHaveProperty("moeda");
    expect(contrato).not.toHaveProperty("periodicidade");
  });

  it("sem subsidio nem duodecimos escolhidos nao ha parte da pessoa", () => {
    const payload = payloadDoRascunho(comNomes(), linhasParaGravar, false, NOME_CARGO);
    expect(payload.retribuicao).toBeNull();
  });

  it("com subsidio, os duodecimos propoem 50 por omissao", () => {
    const rascunho = comNomes();
    rascunho.contrato.subsidio = "6,5";
    rascunho.contrato.subsidio_modo = "cartao";
    const payload = payloadDoRascunho(rascunho, linhasParaGravar, false, NOME_CARGO);
    expect(payload.retribuicao).toEqual({
      subsidio: 6.5,
      subsidioModo: "cartao",
      duodecimosPct: 50,
    });
    expect(JSON.stringify(payload)).not.toContain("valor_base");
  });

  it("os duodecimos escolhidos a mao prevalecem sobre a proposta", () => {
    const rascunho = comNomes();
    rascunho.contrato.duodecimos_pct = "0";
    const payload = payloadDoRascunho(rascunho, linhasParaGravar, false, NOME_CARGO);
    expect(payload.retribuicao).toEqual({ subsidio: null, subsidioModo: null, duodecimosPct: 0 });
  });

  it("um subsidio negativo ou ilegivel e erro de formato no campo do subsidio", () => {
    const rascunho = comNomes();
    rascunho.contrato.subsidio = "-1";
    expect(problemasDoRascunho(rascunho).map((p) => p.campoId)).toEqual(["hr-novo-subsidio"]);
    rascunho.contrato.subsidio = "abc";
    expect(problemasDoRascunho(rascunho).map((p) => p.campoId)).toEqual(["hr-novo-subsidio"]);
    rascunho.contrato.subsidio = "";
    expect(problemasDoRascunho(rascunho)).toHaveLength(0);
  });
});
