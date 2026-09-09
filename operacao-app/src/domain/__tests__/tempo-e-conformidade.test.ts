import { describe, expect, it } from "vitest";
import {
  custoMaoObra,
  duracaoSegundos,
  formatarDuracao,
  formatarEuros,
  tempoPorUtilizador,
  tempoTotalSegundos,
  type Sessao,
} from "../tempo";
import {
  avaliarMedicao,
  porResponder,
  progresso,
  rascunhoCorretiva,
  type Tarefa,
} from "../conformidade";
import { alertasDaOrdem, severidadeMaxima } from "../alertas";

const d = (s: string) => new Date(s);

describe("tempo trabalhado", () => {
  const joao = "u-joao";
  // As duas sessões do exemplo do desenho: 47m + 2h00 = 2h47m.
  const sessoes: Sessao[] = [
    { utilizadorId: joao, inicio: d("2026-08-29T09:14:00Z"), fim: d("2026-08-29T10:01:00Z") },
    { utilizadorId: joao, inicio: d("2026-08-29T10:30:00Z"), fim: d("2026-08-29T12:30:00Z") },
  ];

  it("soma as sessões fechadas", () => {
    expect(tempoTotalSegundos(sessoes)).toBe(47 * 60 + 120 * 60);
    expect(formatarDuracao(tempoTotalSegundos(sessoes))).toBe("2h47m");
  });

  it("uma sessão aberta conta até agora", () => {
    const aberta: Sessao = {
      utilizadorId: joao,
      inicio: d("2026-08-29T09:00:00Z"),
      fim: null,
    };
    expect(duracaoSegundos(aberta, d("2026-08-29T09:30:00Z"))).toBe(1800);
  });

  it("uma sessão com fim antes do início não dá tempo negativo", () => {
    const invertida: Sessao = {
      utilizadorId: joao,
      inicio: d("2026-08-29T10:00:00Z"),
      fim: d("2026-08-29T09:00:00Z"),
    };
    expect(duracaoSegundos(invertida)).toBe(0);
  });

  it("reparte o tempo por pessoa", () => {
    const mistas: Sessao[] = [
      ...sessoes,
      { utilizadorId: "u-marco", inicio: d("2026-08-29T14:00:00Z"), fim: d("2026-08-29T15:00:00Z") },
    ];
    const porPessoa = tempoPorUtilizador(mistas);
    expect(porPessoa.get(joao)).toBe(167 * 60);
    expect(porPessoa.get("u-marco")).toBe(3600);
  });

  describe("custo de mão de obra", () => {
    it("2h47m a 18,50 €/h dá 51,49 €", () => {
      const custos = new Map([[joao, 18.5]]);
      expect(custoMaoObra(sessoes, custos).total).toBe(51.49);
    });

    it("quem não tem custo/hora não rebenta o total, mas é reportado", () => {
      const custos = new Map<string, number | null>([[joao, null]]);
      const r = custoMaoObra(sessoes, custos);
      expect(r.total).toBe(0);
      expect(r.semCustoHora).toEqual([joao]);
    });

    it("sem sessões, o custo é zero e ninguém fica em falta", () => {
      expect(custoMaoObra([], new Map())).toEqual({ total: 0, semCustoHora: [] });
    });
  });

  describe("formatarDuracao", () => {
    it("abaixo de uma hora mostra só os minutos", () => {
      expect(formatarDuracao(50 * 60)).toBe("50m");
    });
    it("abaixo de um minuto mostra segundos", () => {
      expect(formatarDuracao(45)).toBe("45s");
    });
    it("uma hora certa não mostra os minutos", () => {
      expect(formatarDuracao(3600)).toBe("1h");
    });
    it("preenche os minutos com zero", () => {
      expect(formatarDuracao(3600 + 5 * 60)).toBe("1h05m");
    });
  });

  it("formata euros em pt-PT", () => {
    // O separador é vírgula e o espaço antes do € não é um espaço normal.
    expect(formatarEuros(64.29)).toMatch(/64,29/);
  });
});

describe("conformidade", () => {
  const base: Omit<Tarefa, "estado"> = {
    id: "t1",
    nome: "Verificação de pressão",
    tipo: "inspecao",
    obrigatoria: true,
    unidade: "bar",
    limiteMin: 10,
    limiteMax: 15,
  };

  it("12,4 bar entre 10 e 15 é conforme", () => {
    expect(avaliarMedicao({ valorNum: 12.4, limiteMin: 10, limiteMax: 15 })).toBe("feita");
  });

  it("31 °C num limite de 16–24 é não conforme, sem ninguém decidir", () => {
    expect(avaliarMedicao({ valorNum: 31, limiteMin: 16, limiteMax: 24 })).toBe("nao_conforme");
  });

  it("abaixo do mínimo também é não conforme", () => {
    expect(avaliarMedicao({ valorNum: 8, limiteMin: 10, limiteMax: 15 })).toBe("nao_conforme");
  });

  it("sem valor lido não há veredicto", () => {
    expect(avaliarMedicao({ valorNum: null, limiteMin: 10 })).toBeNull();
  });

  it("um limite só de máximo funciona", () => {
    expect(avaliarMedicao({ valorNum: 5, limiteMax: 15 })).toBe("feita");
  });

  it("conta o progresso e as não conformidades", () => {
    const tarefas: Tarefa[] = [
      { ...base, id: "a", estado: "feita" },
      { ...base, id: "b", estado: "nao_conforme" },
      { ...base, id: "c", estado: "pendente" },
      { ...base, id: "d", estado: "pendente", obrigatoria: false },
    ];
    expect(progresso(tarefas)).toEqual({
      feitas: 2,
      total: 4,
      percentagem: 50,
      naoConformes: 1,
    });
    expect(porResponder(tarefas).map((t) => t.id)).toEqual(["c"]);
  });

  it("uma lista vazia não divide por zero", () => {
    expect(progresso([]).percentagem).toBe(0);
  });

  describe("a corretiva que nasce da não conformidade", () => {
    const tarefa: Tarefa = {
      ...base,
      id: "t9",
      nome: "Estado do suporte",
      estado: "nao_conforme",
      valorNum: 31,
      unidade: "°C",
      limiteMin: 16,
      limiteMax: 24,
      observacoes: "Suporte solto, com corrosão na base.",
    };

    it("herda o sítio no título", () => {
      const r = rascunhoCorretiva(tarefa, {
        local: "Piso -2 Garagem",
        ativo: "Extintor 100.108.0042",
      });
      expect(r.titulo).toBe("Estado do suporte — Extintor 100.108.0042 — Piso -2 Garagem");
      expect(r.origem).toBe("corretiva");
    });

    it("a descrição diz o valor lido e o limite violado", () => {
      const r = rascunhoCorretiva(tarefa, { local: null, ativo: null });
      expect(r.descricao).toContain("Valor lido: 31 °C");
      expect(r.descricao).toContain("mín. 16 °C, máx. 24 °C");
    });

    it("leva as observações do técnico — é o que se perde hoje", () => {
      const r = rascunhoCorretiva(tarefa, { local: null, ativo: null });
      expect(r.descricao).toContain("Suporte solto, com corrosão na base.");
    });

    it("sem sítio, o título é só o nome da tarefa", () => {
      const r = rascunhoCorretiva({ ...tarefa, observacoes: null }, {});
      expect(r.titulo).toBe("Estado do suporte");
    });
  });
});

describe("alertas", () => {
  const agora = d("2026-08-30T10:00:00Z");
  const vazia = {
    agendadaPara: null,
    iniciadaEm: null,
    ultimaAtividadeEm: null,
    pausaRetomaPrevista: null,
    criadaEm: null,
  };

  it("uma ordem agendada há 12 dias está atrasada e é crítica", () => {
    const a = alertasDaOrdem({
      ...vazia,
      estado: "agendada",
      agendadaPara: d("2026-08-18T09:00:00Z"),
    }, agora);
    expect(a[0]).toMatchObject({ chave: "atrasada", severidade: "critico" });
    expect(a[0].texto).toBe("Atrasada 12 dias");
  });

  it("uma ordem parada há meses é assinalada — o caso dos 7 meses", () => {
    const a = alertasDaOrdem({
      ...vazia,
      estado: "em_curso",
      iniciadaEm: d("2026-01-30T09:00:00Z"),
      ultimaAtividadeEm: d("2026-01-30T09:00:00Z"),
    }, agora);
    const parada = a.find((x) => x.chave === "parada");
    expect(parada?.severidade).toBe("critico");
  });

  it("uma ordem em curso ativa ontem não é parada", () => {
    const a = alertasDaOrdem({
      ...vazia,
      estado: "em_curso",
      iniciadaEm: d("2026-08-01T09:00:00Z"),
      ultimaAtividadeEm: d("2026-08-29T17:00:00Z"),
    }, agora);
    expect(a.find((x) => x.chave === "parada")).toBeUndefined();
  });

  it("uma pausa com retoma ultrapassada alerta", () => {
    const a = alertasDaOrdem({
      ...vazia,
      estado: "pausada",
      pausaRetomaPrevista: d("2026-08-28T09:00:00Z"),
    }, agora);
    expect(a[0].chave).toBe("retoma_ultrapassada");
  });

  it("uma ordem por aprovar há 3 dias alerta", () => {
    const a = alertasDaOrdem({
      ...vazia,
      estado: "por_aprovar",
      criadaEm: d("2026-08-27T09:00:00Z"),
    }, agora);
    expect(a[0]).toMatchObject({ chave: "por_aprovar_ha_muito", severidade: "aviso" });
  });

  it("uma ordem por aprovar desde ontem ainda não alerta", () => {
    const a = alertasDaOrdem({
      ...vazia,
      estado: "por_aprovar",
      criadaEm: d("2026-08-29T09:00:00Z"),
    }, agora);
    expect(a).toEqual([]);
  });

  it("uma ordem saudável não gera alerta nenhum", () => {
    const a = alertasDaOrdem({
      ...vazia,
      estado: "agendada",
      agendadaPara: d("2026-09-05T09:00:00Z"),
    }, agora);
    expect(a).toEqual([]);
    expect(severidadeMaxima(a)).toBeNull();
  });

  it("a severidade máxima é a mais grave da lista", () => {
    expect(
      severidadeMaxima([
        { chave: "atrasada", severidade: "aviso", texto: "" },
        { chave: "parada", severidade: "critico", texto: "" },
      ])
    ).toBe("critico");
  });
});
