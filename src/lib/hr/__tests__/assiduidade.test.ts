/**
 * Os testes da logica pura da assiduidade.
 *
 * Tres coisas que valem por si e que a base nao repete no cliente: o valor em
 * vigor com correccoes empilhadas, a sobreposicao de intervalos, e a falta
 * parcial sobre o horario planeado. Cada uma tem um caso do mundo real por
 * tras -- tres correccoes seguidas na mesma picagem, um dia com dois locais,
 * e faltar so a manha de um 09:00-18:00.
 */
import { describe, expect, it } from "vitest";
import {
  LEITOR_FALTAS,
  LEITOR_PICAGENS,
  LEITOR_REALIZADO,
  TOLERANCIA_COBERTURA_MINUTOS,
  agoraHoraLocal,
  avisoDeAusenciaParcial,
  cadeiaDeCorreccoes,
  chaveDoErroDeAssiduidade,
  chavesSobrepostas,
  contarCorreccoes,
  emVigor,
  envolventeDoDia,
  hojeIso,
  horaCurta,
  justificacaoUtil,
  minutosCobertos,
  minutosEntre,
  problemasDaFalta,
  sentidoSeguinte,
  situacaoDoIntervalo,
  sobrepoem,
  totaisPorLocal,
} from "@/lib/hr/assiduidade";

type LinhaPicagem = { id: string; corrige_picagem_id: string | null; estado: string };

const picagem = (
  id: string,
  corrige: string | null = null,
  estado = "valida",
): LinhaPicagem => ({ id, corrige_picagem_id: corrige, estado });

describe("valor em vigor com correccoes empilhadas", () => {
  it("sem correccoes, a linha original e a que esta em vigor", () => {
    const linhas = [picagem("a"), picagem("b")];
    expect(emVigor(linhas, LEITOR_PICAGENS).map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("tres correccoes empilhadas dao tres linhas na tabela e UMA em vigor", () => {
    // a <- b <- c <- d. A base marca as substituidas como 'corrigida'.
    const linhas = [
      picagem("a", null, "corrigida"),
      picagem("b", "a", "corrigida"),
      picagem("c", "b", "corrigida"),
      picagem("d", "c"),
    ];
    const vigor = emVigor(linhas, LEITOR_PICAGENS);
    expect(vigor).toHaveLength(1);
    expect(vigor[0].id).toBe("d");
  });

  it("uma correccao ANULADA nao substitui nada: a antiga volta a vigorar", () => {
    const linhas = [picagem("a"), picagem("b", "a", "anulada")];
    const vigor = emVigor(linhas, LEITOR_PICAGENS);
    expect(vigor.map((l) => l.id)).toEqual(["a"]);
  });

  it("a linha anulada nunca esta em vigor, mesmo sem corrector", () => {
    const linhas = [picagem("a", null, "anulada")];
    expect(emVigor(linhas, LEITOR_PICAGENS)).toHaveLength(0);
  });

  it("no realizado, a linha morta e a rejeitada e nao a anulada", () => {
    const linhas = [
      { id: "h1", corrige_realizado_id: null, estado: "rejeitado" },
      { id: "h2", corrige_realizado_id: "h1", estado: "registado" },
    ];
    expect(emVigor(linhas, LEITOR_REALIZADO).map((l) => l.id)).toEqual(["h2"]);
  });

  it("nas faltas, corrigir aponta para corrige_falta_id", () => {
    const linhas = [
      { id: "f1", corrige_falta_id: null, estado: "corrigida" },
      { id: "f2", corrige_falta_id: "f1", estado: "activa" },
    ];
    expect(emVigor(linhas, LEITOR_FALTAS).map((l) => l.id)).toEqual(["f2"]);
  });

  it("a cadeia sai do original para o valor em vigor, por essa ordem", () => {
    const linhas = [
      picagem("a", null, "corrigida"),
      picagem("b", "a", "corrigida"),
      picagem("c", "b"),
    ];
    const cadeia = cadeiaDeCorreccoes(picagem("c", "b"), linhas, LEITOR_PICAGENS);
    expect(cadeia.map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("contar correccoes: tres linhas empilhadas sao duas correccoes", () => {
    const linhas = [
      picagem("a", null, "corrigida"),
      picagem("b", "a", "corrigida"),
      picagem("c", "b"),
    ];
    expect(contarCorreccoes(linhas[2], linhas, LEITOR_PICAGENS)).toBe(2);
    expect(contarCorreccoes(picagem("z"), [picagem("z")], LEITOR_PICAGENS)).toBe(0);
  });

  it("uma cadeia com ciclo para, em vez de girar para sempre", () => {
    const linhas = [picagem("a", "b"), picagem("b", "a")];
    const cadeia = cadeiaDeCorreccoes(linhas[0], linhas, LEITOR_PICAGENS);
    expect(cadeia).toHaveLength(2);
  });

  it("preserva a ordem de entrada das linhas em vigor", () => {
    const linhas = [picagem("x"), picagem("y"), picagem("z")];
    expect(emVigor(linhas, LEITOR_PICAGENS).map((l) => l.id)).toEqual(["x", "y", "z"]);
  });
});

describe("sobreposicao de intervalos", () => {
  it("a fronteira e aberta: 09-13 e 13-18 nao se sobrepoem", () => {
    expect(
      sobrepoem(
        { hora_inicio: "09:00", hora_fim: "13:00" },
        { hora_inicio: "13:00", hora_fim: "18:00" },
      ),
    ).toBe(false);
  });

  it("intervalos que se cruzam sao sobrepostos", () => {
    expect(
      sobrepoem(
        { hora_inicio: "09:00", hora_fim: "14:00" },
        { hora_inicio: "13:00", hora_fim: "18:00" },
      ),
    ).toBe(true);
  });

  it("um intervalo dentro do outro conta como sobreposicao", () => {
    expect(
      sobrepoem(
        { hora_inicio: "09:00", hora_fim: "18:00" },
        { hora_inicio: "10:00", hora_fim: "11:00" },
      ),
    ).toBe(true);
  });

  it("as horas com segundos, como a base as devolve, comparam-se na mesma", () => {
    expect(
      sobrepoem(
        { hora_inicio: "09:00:00", hora_fim: "13:00:00" },
        { hora_inicio: "12:59:00", hora_fim: "18:00:00" },
      ),
    ).toBe(true);
  });

  it("um dia com dois locais seguidos nao tem conflito nenhum", () => {
    const dia = [
      { chave: "a", hora_inicio: "09:00", hora_fim: "14:00", local_id: "empresaA" },
      { chave: "b", hora_inicio: "15:00", hora_fim: "19:00", local_id: "empresaB" },
    ];
    expect(chavesSobrepostas(dia).size).toBe(0);
  });

  it("assinala AS DUAS chaves em conflito, nao so a segunda", () => {
    const dia = [
      { chave: "a", hora_inicio: "09:00", hora_fim: "14:00" },
      { chave: "b", hora_inicio: "13:00", hora_fim: "19:00" },
      { chave: "c", hora_inicio: "20:00", hora_fim: "21:00" },
    ];
    const conflitos = chavesSobrepostas(dia);
    expect([...conflitos].sort()).toEqual(["a", "b"]);
  });

  it("totais por local somam cada sitio de per si", () => {
    const totais = totaisPorLocal([
      { hora_inicio: "09:00", hora_fim: "14:00", local_id: "A" },
      { hora_inicio: "15:00", hora_fim: "19:00", local_id: "B" },
      { hora_inicio: "20:00", hora_fim: "21:00", local_id: "A" },
    ]);
    expect(totais.get("A")).toBe(360);
    expect(totais.get("B")).toBe(240);
  });

  it("um intervalo sem local soma na chave nula, e nao se perde", () => {
    const totais = totaisPorLocal([{ hora_inicio: "09:00", hora_fim: "10:00", local_id: null }]);
    expect(totais.get(null)).toBe(60);
  });
});

describe("minutos cobertos", () => {
  it("dois cobertores que se sobrepoem nao contam a mesma hora duas vezes", () => {
    const cobertos = minutosCobertos({ hora_inicio: "09:00", hora_fim: "12:00" }, [
      { hora_inicio: "09:00", hora_fim: "11:00" },
      { hora_inicio: "10:00", hora_fim: "12:00" },
    ]);
    expect(cobertos).toBe(180);
  });

  it("o que cai fora do alvo nao conta", () => {
    const cobertos = minutosCobertos({ hora_inicio: "09:00", hora_fim: "10:00" }, [
      { hora_inicio: "08:00", hora_fim: "12:00" },
    ]);
    expect(cobertos).toBe(60);
  });

  it("sem cobertores, zero", () => {
    expect(minutosCobertos({ hora_inicio: "09:00", hora_fim: "18:00" }, [])).toBe(0);
  });
});

describe("falta parcial sobre o horario planeado", () => {
  const manha = { hora_inicio: "09:00", hora_fim: "13:00" };
  const tarde = { hora_inicio: "14:00", hora_fim: "18:00" };

  it("faltar so a manha deixa a manha em falta e a tarde coberta", () => {
    const faltas = [{ hora_inicio: "09:00", hora_fim: "13:00" }];
    const realizados = [{ hora_inicio: "14:00", hora_fim: "18:00" }];

    const deManha = situacaoDoIntervalo(manha, realizados, faltas);
    expect(deManha.situacao).toBe("emFalta");
    expect(deManha.minutosEmFalta).toBe(240);

    const deTarde = situacaoDoIntervalo(tarde, realizados, faltas);
    expect(deTarde.situacao).toBe("coberto");
    expect(deTarde.minutosRealizados).toBe(240);
  });

  it("sem horas e sem falta, o intervalo fica por explicar", () => {
    expect(situacaoDoIntervalo(manha, [], []).situacao).toBe("semHoras");
  });

  it("chegar as 10:30 a um turno das 9 e cobertura parcial", () => {
    const situacao = situacaoDoIntervalo(manha, [{ hora_inicio: "10:30", hora_fim: "13:00" }], []);
    expect(situacao.situacao).toBe("parcial");
    expect(situacao.minutosRealizados).toBe(150);
  });

  it("um desvio dentro da tolerancia nao chega a ser parcial", () => {
    const situacao = situacaoDoIntervalo(manha, [{ hora_inicio: "09:03", hora_fim: "13:00" }], []);
    expect(TOLERANCIA_COBERTURA_MINUTOS).toBe(5);
    expect(situacao.situacao).toBe("coberto");
  });

  it("meia falta e meias horas somam-se e explicam o intervalo todo", () => {
    const situacao = situacaoDoIntervalo(
      manha,
      [{ hora_inicio: "11:00", hora_fim: "13:00" }],
      [{ hora_inicio: "09:00", hora_fim: "11:00" }],
    );
    expect(situacao.situacao).toBe("coberto");
    expect(situacao.minutosRealizados).toBe(120);
    expect(situacao.minutosEmFalta).toBe(120);
  });

  it("o dia todo de uma falta e do primeiro ao ultimo minuto planeado", () => {
    expect(envolventeDoDia([manha, tarde])).toEqual({
      hora_inicio: "09:00",
      hora_fim: "18:00",
    });
    expect(envolventeDoDia([])).toBeNull();
  });

  it("o formulario recusa o fim antes do inicio antes de chamar a base", () => {
    const problemas = problemasDaFalta({
      data: "2026-10-14",
      horaInicio: "13:00",
      horaFim: "09:00",
      motivoCodigo: "doenca",
    });
    expect(problemas.map((p) => p.mensagemKey)).toContain(
      "hr.assiduidade.erro.fimAntesDoInicio",
    );
  });

  it("uma falta bem preenchida nao tem problema nenhum", () => {
    expect(
      problemasDaFalta({
        data: "2026-10-14",
        horaInicio: "09:00",
        horaFim: "13:00",
        motivoCodigo: "doenca",
      }),
    ).toEqual([]);
  });

  it("faltam campos: cada um levanta o seu problema, sem parar no primeiro", () => {
    const problemas = problemasDaFalta({
      data: "",
      horaInicio: "",
      horaFim: "",
      motivoCodigo: "",
    });
    expect(problemas.map((p) => p.campo).sort()).toEqual([
      "data",
      "horaFim",
      "horaInicio",
      "motivoCodigo",
    ]);
  });

  it("meio dia de ausencia aprovada avisa; dia inteiro e nenhum nao avisam", () => {
    expect(avisoDeAusenciaParcial(0.5)).toBe(true);
    expect(avisoDeAusenciaParcial(1)).toBe(false);
    expect(avisoDeAusenciaParcial(null)).toBe(false);
  });
});

describe("o sentido do botao de picar", () => {
  it("sem picagens hoje, entra-se", () => {
    expect(sentidoSeguinte([])).toBe("entrada");
  });

  it("depois de uma entrada, o botao regista a saida", () => {
    expect(sentidoSeguinte([{ hora_local: "09:04", sentido: "entrada" }])).toBe("saida");
  });

  it("le a ULTIMA do dia, mesmo com a lista fora de ordem", () => {
    expect(
      sentidoSeguinte([
        { hora_local: "13:00", sentido: "saida" },
        { hora_local: "09:00", sentido: "entrada" },
      ]),
    ).toBe("entrada");
  });
});

describe("erros estaveis das RPCs", () => {
  it("apanha o prefixo no meio da mensagem do Postgres", () => {
    expect(
      chaveDoErroDeAssiduidade({
        message: 'erro: falta_cruza_realizado: ha horas registadas nesse periodo.',
      }),
    ).toBe("hr.assiduidade.erroRpc.faltaCruzaRealizado");
  });

  it("distingue a falta coberta por ausencia da que cruza horas", () => {
    expect(chaveDoErroDeAssiduidade("falta_coberta_por_ausencia: ...")).toBe(
      "hr.assiduidade.erroRpc.faltaCobertaPorAusencia",
    );
  });

  it("a recusa de autovalidacao tem chave propria", () => {
    expect(chaveDoErroDeAssiduidade("realizado_autovalidacao: ninguem valida as suas.")).toBe(
      "hr.assiduidade.erroRpc.autovalidacao",
    );
  });

  it("o estado fechado a UPDATE directo tem chave propria", () => {
    expect(chaveDoErroDeAssiduidade("realizado_estado_fora_da_rpc: ...")).toBe(
      "hr.assiduidade.erroRpc.estadoForaDaRpc",
    );
  });

  it("um erro desconhecido devolve nulo, para quem chama reportar", () => {
    expect(chaveDoErroDeAssiduidade({ message: "connection reset by peer" })).toBeNull();
    expect(chaveDoErroDeAssiduidade(null)).toBeNull();
    expect(chaveDoErroDeAssiduidade({})).toBeNull();
  });
});

describe("ajudas de apresentacao", () => {
  it("minutos entre duas horas, com e sem segundos", () => {
    expect(minutosEntre("09:00", "13:00")).toBe(240);
    expect(minutosEntre("09:00:00", "09:30:00")).toBe(30);
    expect(minutosEntre(null, "13:00")).toBeNull();
  });

  it("as horas mostram-se sem segundos, e o vazio mostra-se como traco", () => {
    expect(horaCurta("09:00:00")).toBe("09:00");
    expect(horaCurta(null)).toBe("—");
  });

  it("hoje e agora saem no fuso do browser e nao em UTC", () => {
    const quando = new Date(2026, 0, 5, 8, 7);
    expect(hojeIso(quando)).toBe("2026-01-05");
    expect(agoraHoraLocal(quando)).toBe("08:07");
  });

  it("a justificacao precisa de referencia OU texto", () => {
    expect(justificacaoUtil("", "")).toBe(false);
    expect(justificacaoUtil("  ", "  ")).toBe(false);
    expect(justificacaoUtil("AT-2026-1", "")).toBe(true);
    expect(justificacaoUtil("", "entregue em mao")).toBe(true);
  });
});
