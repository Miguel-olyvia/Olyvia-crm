/**
 * Fase 1 do formulario "Nova pessoa": passa a ter TODOS os campos do convite
 * de admissao (naturalidade, habilitacoes, dependentes com deficiencia,
 * situacao do conjuge, carta de conducao, fardamento, titular e banco da
 * conta), para o RH preencher tudo de uma vez. Preencher e opcional.
 *
 * O que estes testes fecham:
 *  1. cada campo novo vai para a tabela certa, normalizado como o convite o faz;
 *  2. a situacao do conjuge so segue com casado/uniao de facto; o detalhe do
 *     tamanho so segue com 'outro';
 *  3. titular e banco so seguem com conta (a RPC so os grava com conta);
 *  4. o fardamento so existe se houver algum tamanho;
 *  5. o aviso "ficam como pendencia" deixou de listar o que ja esta no
 *     formulario, e passa a listar a seccao bancaria quando nao ha permissao;
 *  6. a configuracao da admissao exige estes campos no modo "RH, agora".
 */
import { describe, expect, it } from "vitest";
import { linhasParaGravar } from "@/lib/hr/horario";
import type { ConfiguracaoCampo } from "@/lib/hr/admissaoObrigatorios";
import {
  camposPorPreencherNaFicha,
  codigosObrigatoriosDoFormulario,
  payloadDoRascunho,
  problemasDoRascunho,
  rascunhoInicial as rascunhoInicialBase,
  seccaoPreenchida,
} from "@/lib/hr/novaPessoa";
import {
  CODIGOS_BANCARIOS,
  CODIGOS_FARDAMENTO,
  codigosIndisponiveis,
} from "@/lib/hr/novaPessoaAdmissao";
import { patchEstadoCivil, patchTamanho } from "@/lib/hr/novaPessoaDetalhes";

const IBAN_BOM = "PT50000201231234567890154";

function rascunho() {
  const r = rascunhoInicialBase();
  r.geral.primeiro_nome = "Ana";
  r.geral.apelido = "Silva";
  r.laborais.cargo_id = "cargo-1";
  return r;
}

function payloadDe(r: ReturnType<typeof rascunho>) {
  return payloadDoRascunho(r, linhasParaGravar, false, "Operador");
}

function linha(codigo: string, posicao: "convite" | "ficha" | "opcional" | "rh" = "convite"): ConfiguracaoCampo {
  return {
    codigo,
    origem: posicao === "rh" ? "rh" : "pessoa",
    condicional: false,
    posicao,
    configuravel: posicao !== "rh",
  };
}

describe("rascunho: os campos novos nascem vazios e nao contam como preenchidos", () => {
  it("nasce vazio, e a seccao pessoais nao fica preenchida so por existirem", () => {
    const r = rascunho();
    expect(r.pessoais).toMatchObject({
      dependentes_deficientes: "",
      conjuge_situacao_profissional: "",
      naturalidade_freguesia: "",
      naturalidade_concelho: "",
      naturalidade_pais: "",
      habilitacao_academica: "",
      habilitacao_data_conclusao: "",
      carta_conducao_numero: "",
      carta_conducao_categorias: "",
      carta_conducao_validade: "",
      conta_titular: "",
      conta_banco: "",
      tamanho_cima: "",
      tamanho_cima_detalhe: "",
      tamanho_baixo: "",
      tamanho_baixo_detalhe: "",
      tamanho_calcado: "",
      tamanho_calcado_detalhe: "",
    });
    expect(seccaoPreenchida(r, "pessoais")).toBe(false);
  });

  it("escrever so um campo novo conta como seccao preenchida", () => {
    const r = rascunho();
    r.pessoais.tamanho_calcado = "42";
    expect(seccaoPreenchida(r, "pessoais")).toBe(true);
  });
});

describe("payload: dados pessoais", () => {
  it("leva naturalidade, habilitacao e dependentes com deficiencia, normalizados", () => {
    const r = rascunho();
    r.pessoais.naturalidade_freguesia = "  Se  ";
    r.pessoais.naturalidade_concelho = "Porto";
    r.pessoais.naturalidade_pais = "pt";
    r.pessoais.habilitacao_academica = "licenciatura";
    r.pessoais.habilitacao_data_conclusao = "2012-07-01";
    r.pessoais.dependentes_deficientes = "2";

    expect(payloadDe(r).dadosPessoais).toMatchObject({
      naturalidade_freguesia: "Se",
      naturalidade_concelho: "Porto",
      naturalidade_pais: "PT",
      habilitacao_academica: "licenciatura",
      habilitacao_data_conclusao: "2012-07-01",
      dependentes_deficientes: 2,
    });
  });

  it("dependentes com deficiencia a 0 e resposta e vai como 0", () => {
    const r = rascunho();
    r.pessoais.dependentes_deficientes = "0";
    expect(payloadDe(r).dadosPessoais).toMatchObject({ dependentes_deficientes: 0 });
  });

  it("so um campo novo ja cria a linha de dados pessoais; vazios viram null", () => {
    const r = rascunho();
    r.pessoais.naturalidade_concelho = "Braga";
    const dados = payloadDe(r).dadosPessoais as Record<string, unknown>;
    expect(dados.naturalidade_concelho).toBe("Braga");
    expect(dados.naturalidade_freguesia).toBeNull();
    expect(dados.naturalidade_pais).toBeNull();
    expect(dados.habilitacao_academica).toBeNull();
    expect(dados.dependentes_deficientes).toBeNull();
    expect(dados.conjuge_situacao_profissional).toBeNull();
  });

  it("sem nenhum campo, nao ha linha de dados pessoais", () => {
    expect(payloadDe(rascunho()).dadosPessoais).toBeNull();
  });

  it.each(["casado", "uniao_de_facto"] as const)(
    "a situacao do conjuge segue com estado civil %s",
    (estado) => {
      const r = rascunho();
      r.pessoais.estado_civil = estado;
      r.pessoais.conjuge_situacao_profissional = "trabalhador";
      expect(payloadDe(r).dadosPessoais).toMatchObject({
        conjuge_situacao_profissional: "trabalhador",
      });
    },
  );

  it.each(["solteiro", "divorciado", "viuvo", "separado", ""] as const)(
    "a situacao do conjuge NAO segue com estado civil '%s' (um valor antigo nao fica gravado)",
    (estado) => {
      const r = rascunho();
      r.pessoais.estado_civil = estado;
      r.pessoais.conjuge_situacao_profissional = "trabalhador";
      r.pessoais.dependentes = "1";
      expect(payloadDe(r).dadosPessoais).toMatchObject({ conjuge_situacao_profissional: null });
    },
  );
});

describe("payload: carta de conducao (em identificacao)", () => {
  it("vai para identificacao, nunca para dados pessoais", () => {
    const r = rascunho();
    r.pessoais.carta_conducao_numero = " P-123456 7 ";
    r.pessoais.carta_conducao_categorias = "B, B1";
    r.pessoais.carta_conducao_validade = "2031-05-04";
    // Um campo pessoal tambem preenchido: sem ele `dadosPessoais` seria null e o
    // `not.toContain` nunca poderia falhar.
    r.pessoais.naturalidade_concelho = "Braga";

    const payload = payloadDe(r);
    expect(payload.identificacao).toMatchObject({
      carta_conducao_numero: "P-123456 7",
      carta_conducao_categorias: "B, B1",
      carta_conducao_validade: "2031-05-04",
    });
    expect(payload.dadosPessoais).toMatchObject({ naturalidade_concelho: "Braga" });
    expect(JSON.stringify(payload.dadosPessoais)).not.toContain("carta_conducao");
    expect(JSON.stringify(payload.identificacao)).not.toContain("Braga");
  });

  it("so a carta ja cria a linha de identificacao", () => {
    const r = rascunho();
    r.pessoais.carta_conducao_numero = "X1";
    expect(payloadDe(r).identificacao).not.toBeNull();
  });
});

describe("payload: conta, titular e banco", () => {
  it("com conta, titular e banco seguem dentro de conta", () => {
    const r = rascunho();
    r.pessoais.conta_numero = IBAN_BOM;
    r.pessoais.conta_titular = " Ana Silva ";
    r.pessoais.conta_banco = "Caixa Geral";
    expect(payloadDe(r).conta).toEqual({
      formato: "iban",
      numero: IBAN_BOM,
      swift: null,
      titular: "Ana Silva",
      banco: "Caixa Geral",
    });
  });

  it("sem conta, titular e banco NAO seguem (a RPC so os grava com conta) e o BIC vai sozinho", () => {
    const r = rascunho();
    r.pessoais.conta_titular = "Ana Silva";
    r.pessoais.conta_banco = "Caixa Geral";
    r.pessoais.conta_bic = "CGDIPTPL";
    const payload = payloadDe(r);
    expect(payload.conta).toBeNull();
    expect(payload.bicSozinho).toBe("CGDIPTPL");
    expect(JSON.stringify(payload)).not.toContain("Caixa Geral");
  });

  it("titular e banco vazios viram null", () => {
    const r = rascunho();
    r.pessoais.conta_numero = IBAN_BOM;
    r.pessoais.conta_titular = "   ";
    expect(payloadDe(r).conta).toMatchObject({ titular: null, banco: null });
  });
});

describe("payload: fardamento (satelite novo)", () => {
  it("sem nenhum tamanho, nao ha linha de fardamento", () => {
    expect(payloadDe(rascunho()).fardamento).toBeNull();
  });

  it("leva os tres tamanhos; o detalhe so segue com 'outro'", () => {
    const r = rascunho();
    r.pessoais.tamanho_cima = "m";
    r.pessoais.tamanho_cima_detalhe = "ignorado: o tamanho nao e 'outro'";
    r.pessoais.tamanho_baixo = "outro";
    r.pessoais.tamanho_baixo_detalhe = "  62 ";
    r.pessoais.tamanho_calcado = "42";
    r.pessoais.tamanho_calcado_detalhe = "tambem ignorado";

    expect(payloadDe(r).fardamento).toEqual({
      tamanho_cima: "m",
      tamanho_cima_detalhe: null,
      tamanho_baixo: "outro",
      tamanho_baixo_detalhe: "62",
      tamanho_calcado: "42",
      tamanho_calcado_detalhe: null,
    });
  });

  it("um so tamanho basta; os outros vao a null", () => {
    const r = rascunho();
    r.pessoais.tamanho_calcado = "outro";
    r.pessoais.tamanho_calcado_detalhe = "49";
    expect(payloadDe(r).fardamento).toEqual({
      tamanho_cima: null,
      tamanho_cima_detalhe: null,
      tamanho_baixo: null,
      tamanho_baixo_detalhe: null,
      tamanho_calcado: "outro",
      tamanho_calcado_detalhe: "49",
    });
  });

  it("um detalhe solto, sem tamanho, nao cria linha", () => {
    const r = rascunho();
    r.pessoais.tamanho_cima_detalhe = "xxl+";
    expect(payloadDe(r).fardamento).toBeNull();
  });
});

describe("validacao dos campos novos", () => {
  it("vazio nunca e erro", () => {
    expect(problemasDoRascunho(rascunho())).toHaveLength(0);
  });

  it.each(["-1", "31", "abc", "1.5"])("dependentes com deficiencia '%s' e erro de numero", (valor) => {
    const r = rascunho();
    r.pessoais.dependentes_deficientes = valor;
    expect(problemasDoRascunho(r)).toEqual([
      expect.objectContaining({
        seccao: "pessoais",
        campoId: "hr-novo-dependentes-deficientes",
        rotuloKey: "hr.campos.dependentesDeficientes",
        mensagemKey: "hr.form.erroNumero",
      }),
    ]);
  });

  it.each(["0", "1", "30"])("dependentes com deficiencia '%s' e valido (limites 0 a 30)", (valor) => {
    const r = rascunho();
    r.pessoais.dependentes_deficientes = valor;
    expect(problemasDoRascunho(r)).toHaveLength(0);
  });
});

describe("configuracao da admissao e os campos novos (RH, agora)", () => {
  const CODIGOS_NOVOS = [
    "dependentes_deficientes",
    "naturalidade_freguesia",
    "naturalidade_concelho",
    "naturalidade_pais",
    "habilitacao_academica",
    "habilitacao_data_conclusao",
    "tamanho_cima",
    "tamanho_baixo",
    "tamanho_calcado",
  ];

  it("a posicao convite exige cada um, apontando para o id do campo", () => {
    const config = CODIGOS_NOVOS.map((c) => linha(c));
    const problemas = problemasDoRascunho(rascunho(), { config });
    expect(problemas.map((p) => p.campoId).sort()).toEqual(
      [
        "hr-novo-dependentes-deficientes",
        "hr-novo-naturalidade-freguesia",
        "hr-novo-naturalidade-concelho",
        "hr-novo-naturalidade-pais",
        "hr-novo-habilitacao",
        "hr-novo-habilitacao-data",
        "hr-novo-tamanho-cima",
        "hr-novo-tamanho-baixo",
        "hr-novo-tamanho-calcado",
      ].sort(),
    );
  });

  it("preenchidos, deixam de ser problema (dependentes com deficiencia a 0 e resposta)", () => {
    const config = CODIGOS_NOVOS.map((c) => linha(c));
    const r = rascunho();
    Object.assign(r.pessoais, {
      dependentes_deficientes: "0",
      naturalidade_freguesia: "Se",
      naturalidade_concelho: "Porto",
      naturalidade_pais: "PT",
      habilitacao_academica: "secundario",
      habilitacao_data_conclusao: "2010-06-30",
      tamanho_cima: "m",
      tamanho_baixo: "40",
      tamanho_calcado: "42",
    });
    expect(problemasDoRascunho(r, { config })).toHaveLength(0);
  });

  it("a situacao do conjuge so e exigida com casado ou uniao de facto", () => {
    const config = [linha("conjuge_situacao_profissional")];

    const solteiro = rascunho();
    solteiro.pessoais.estado_civil = "solteiro";
    expect(problemasDoRascunho(solteiro, { config })).toHaveLength(0);

    const casado = rascunho();
    casado.pessoais.estado_civil = "casado";
    expect(problemasDoRascunho(casado, { config }).map((p) => p.campoId)).toEqual([
      "hr-novo-conjuge-situacao",
    ]);
    casado.pessoais.conjuge_situacao_profissional = "nao_trabalhador";
    expect(problemasDoRascunho(casado, { config })).toHaveLength(0);
  });

  it("ficha e opcional nunca bloqueiam; o asterisco so segue a posicao convite", () => {
    const config = [linha("naturalidade_pais", "ficha"), linha("tamanho_cima", "opcional")];
    expect(problemasDoRascunho(rascunho(), { config })).toHaveLength(0);
    expect(codigosObrigatoriosDoFormulario(false, config).size).toBe(0);
    expect([...codigosObrigatoriosDoFormulario(false, [linha("tamanho_cima")])]).toEqual(["tamanho_cima"]);
  });

  it("a enviar convite, nada disto e exigido (so o e-mail pessoal): a pessoa preenche", () => {
    const config = CODIGOS_NOVOS.map((c) => linha(c));
    const r = rascunho();
    expect(problemasDoRascunho(r, { comConvite: true, config }).map((p) => p.campoId)).toEqual([
      "hr-novo-email-pessoal",
    ]);
    r.pessoais.email_pessoal = "ana@exemplo.pt";
    expect(problemasDoRascunho(r, { comConvite: true, config })).toHaveLength(0);
    expect(codigosObrigatoriosDoFormulario(true, config).size).toBe(0);
  });
});

describe("o aviso 'ficam como pendencia na ficha'", () => {
  it("com o formulario completo, nenhum campo da admissao fica de fora so por nao ter campo", () => {
    const config = [
      // Titular e banco ficam de fora: sem numero de conta nao se exigem e
      // passam a pendencia (ver o bloco "titular e banco" mais abaixo).
      linha("conta_numero"),
      linha("conta_bic"),
      linha("naturalidade_concelho"),
      linha("tamanho_cima"),
      linha("dependentes_deficientes"),
      linha("conjuge_situacao_profissional"),
      linha("habilitacao_academica"),
    ];
    expect(camposPorPreencherNaFicha(config, rascunho().pessoais)).toEqual([]);
  });

  it("a posicao ficha, vazia, fica pendente (sem bloquear); preenchida, nao", () => {
    const config = [linha("naturalidade_concelho", "ficha"), linha("tamanho_cima", "ficha")];
    const r = rascunho();
    r.pessoais.tamanho_cima = "m";
    expect(camposPorPreencherNaFicha(config, r.pessoais)).toEqual(["naturalidade_concelho"]);
    expect(problemasDoRascunho(r, { config })).toHaveLength(0);
  });

  describe("sem permissao para editar dados bancarios", () => {
    const INDISPONIVEIS = new Set<string>(CODIGOS_BANCARIOS);

    it("os campos do banco em posicao convite passam a pendencia, e so esses", () => {
      const config = [
        linha("conta_numero"),
        linha("conta_bic", "ficha"),
        linha("conta_titular", "opcional"), // opcional: nunca
        linha("conta_banco"),
        linha("nif"), // convite mas nao e do banco: bloqueia, nao e pendencia
      ];
      expect(camposPorPreencherNaFicha(config, rascunho().pessoais, INDISPONIVEIS)).toEqual([
        "conta_numero",
        "conta_bic",
        "conta_banco",
      ]);
    });

    it("nao bloqueiam a criacao (o campo esta desactivado: nao se exige o que nao se pode escrever)", () => {
      const config = CODIGOS_BANCARIOS.map((c) => linha(c));
      expect(problemasDoRascunho(rascunho(), { config })).toHaveLength(2);
      expect(problemasDoRascunho(rascunho(), { config, indisponiveis: INDISPONIVEIS })).toHaveLength(0);
    });

    it("nao levam asterisco", () => {
      const config = [...CODIGOS_BANCARIOS.map((c) => linha(c)), linha("nif")];
      expect([...codigosObrigatoriosDoFormulario(false, config, INDISPONIVEIS)]).toEqual(["nif"]);
    });
  });
});

describe("dependentes: inteiro de 0 a 30 (CHECK pessoas_dados_pessoais_dependentes_validos)", () => {
  it.each(["31", "1,5", "1.5", "-1", "abc", "100"])("dependentes '%s' e erro de numero antes de gravar", (valor) => {
    const r = rascunho();
    r.pessoais.dependentes = valor;
    expect(problemasDoRascunho(r)).toEqual([
      expect.objectContaining({
        seccao: "pessoais",
        campoId: "hr-novo-dependentes",
        rotuloKey: "hr.campos.dependentes",
        mensagemKey: "hr.form.erroNumero",
      }),
    ]);
  });

  it.each(["0", "1", "30", " 7 "])("dependentes '%s' e valido (limites 0 a 30)", (valor) => {
    const r = rascunho();
    r.pessoais.dependentes = valor;
    expect(problemasDoRascunho(r)).toHaveLength(0);
  });
});

describe("titular e banco: so se exigem com numero de conta", () => {
  const titularBanco = [linha("conta_titular"), linha("conta_banco")];

  it("sem numero de conta nao bloqueiam e ficam como pendencia (o ecra desactiva-os)", () => {
    expect(problemasDoRascunho(rascunho(), { config: titularBanco })).toHaveLength(0);
    expect(camposPorPreencherNaFicha(titularBanco, rascunho().pessoais)).toEqual([
      "conta_titular",
      "conta_banco",
    ]);
  });

  it("com numero de conta, titular e banco vazios bloqueiam", () => {
    const r = rascunho();
    r.pessoais.conta_numero = IBAN_BOM;
    expect(problemasDoRascunho(r, { config: titularBanco }).map((p) => p.campoId)).toEqual([
      "hr-novo-conta-titular",
      "hr-novo-conta-banco",
    ]);
    r.pessoais.conta_titular = "Ana Silva";
    r.pessoais.conta_banco = "CGD";
    expect(problemasDoRascunho(r, { config: titularBanco })).toHaveLength(0);
    expect(camposPorPreencherNaFicha(titularBanco, r.pessoais)).toEqual([]);
  });

  it("o impasse: titular em convite e conta em ficha nao prende a criacao", () => {
    const config = [linha("conta_titular", "convite"), linha("conta_numero", "ficha")];
    expect(problemasDoRascunho(rascunho(), { config })).toHaveLength(0);
    expect(camposPorPreencherNaFicha(config, rascunho().pessoais)).toEqual([
      "conta_titular",
      "conta_numero",
    ]);
  });

  it("titular em ficha, sem conta, e pendencia e nunca bloqueia", () => {
    const config = [linha("conta_titular", "ficha")];
    expect(problemasDoRascunho(rascunho(), { config })).toHaveLength(0);
    expect(camposPorPreencherNaFicha(config, rascunho().pessoais)).toEqual(["conta_titular"]);
  });
});

describe("sem hr.pessoas.laborais.edit (RLS de pessoas_fardamento)", () => {
  const SEM_FARDAMENTO = codigosIndisponiveis({ bancarios: true, laborais: false });

  it("os indisponiveis juntam bancarios e fardamento conforme as permissoes", () => {
    expect([...codigosIndisponiveis({ bancarios: true, laborais: true })]).toEqual([]);
    expect([...SEM_FARDAMENTO].sort()).toEqual([...CODIGOS_FARDAMENTO].sort());
    expect([...codigosIndisponiveis({ bancarios: false, laborais: true })].sort()).toEqual(
      [...CODIGOS_BANCARIOS].sort(),
    );
    expect(codigosIndisponiveis({ bancarios: false, laborais: false }).size).toBe(
      CODIGOS_BANCARIOS.length + CODIGOS_FARDAMENTO.length,
    );
  });

  it("os tamanhos em posicao convite deixam de bloquear e de levar asterisco, e passam a pendencia", () => {
    const config = CODIGOS_FARDAMENTO.map((c) => linha(c));
    expect(problemasDoRascunho(rascunho(), { config })).toHaveLength(3);
    expect(problemasDoRascunho(rascunho(), { config, indisponiveis: SEM_FARDAMENTO })).toHaveLength(0);
    expect(codigosObrigatoriosDoFormulario(false, config, SEM_FARDAMENTO).size).toBe(0);
    expect(camposPorPreencherNaFicha(config, rascunho().pessoais, SEM_FARDAMENTO)).toEqual([
      ...CODIGOS_FARDAMENTO,
    ]);
  });
});

describe("valores escondidos limpam-se ao mudar o que os mostra", () => {
  it.each(["solteiro", "divorciado", "viuvo", "separado", ""] as const)(
    "estado civil '%s' limpa a situacao do conjuge",
    (estado) => {
      expect(patchEstadoCivil(estado)).toEqual({
        estado_civil: estado,
        conjuge_situacao_profissional: "",
      });
    },
  );

  it.each(["casado", "uniao_de_facto"] as const)(
    "estado civil '%s' mantem a situacao do conjuge (nao a toca)",
    (estado) => {
      expect(patchEstadoCivil(estado)).toEqual({ estado_civil: estado });
    },
  );

  it.each(["cima", "baixo", "calcado"] as const)(
    "o tamanho %s deixar de ser 'outro' limpa o detalhe correspondente",
    (campo) => {
      expect(patchTamanho(campo, "m")).toEqual({
        [`tamanho_${campo}`]: "m",
        [`tamanho_${campo}_detalhe`]: "",
      });
      expect(patchTamanho(campo, "")).toEqual({
        [`tamanho_${campo}`]: "",
        [`tamanho_${campo}_detalhe`]: "",
      });
    },
  );

  it("escolher 'outro' nao toca no detalhe", () => {
    expect(patchTamanho("baixo", "outro")).toEqual({ tamanho_baixo: "outro" });
  });
});
