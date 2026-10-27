// O horario planeado real visto como versoes e excepcoes: funcoes puras, sem base nem simulacao.
import { describe, expect, it } from "vitest";
import {
  avisoContratadasMin,
  configDaVersao,
  configInicialReal,
  diaDeIntervalos,
  excecoesDoPlaneado,
  horarioPessoaDeLinhas,
  linhasComExcecao,
  linhasEditaveis,
  linhasParaNovaVersao,
  linhasSemExcecao,
  versaoEmVigorReal,
  versoesDoPlaneado,
} from "@/components/rh-exemplo/lib/horarioReal";
import { resolverHorarioDoDia } from "@/components/rh-exemplo/lib/horarioTipos";
import type { HorarioPlaneado } from "@/components/rh-exemplo/tipos";

const HOJE = "2026-10-20";

function linha(id: string, extra: Partial<HorarioPlaneado> = {}): HorarioPlaneado {
  return {
    id, pessoa_id: "p1", organization_id: "org", vinculo_id: null, local_id: null, dia_semana: 1, data: null,
    hora_inicio: "09:00:00", hora_fim: "13:00:00", nao_trabalha: false, ordem: 1, valido_de: null, valido_ate: null,
    notas: null, corrige_horario_id: null, correccao_motivo: null, corrigido_por_anew_user_id: null,
    corrigido_por_pessoa_id: null, ...extra,
  };
}

const semanaPadrao = (extra: Partial<HorarioPlaneado> = {}) =>
  [1, 2, 3, 4, 5].map((d) => linha(`s${d}`, { dia_semana: d, hora_inicio: "09:00:00", hora_fim: "17:00:00", ...extra }));

describe("diaDeIntervalos", () => {
  it("sem intervalos e folga", () => {
    expect(diaDeIntervalos([]).trabalha).toBe(false);
  });
  it("um intervalo nao tem pausa", () => {
    expect(diaDeIntervalos([{ inicio: "09:00", fim: "17:00" }])).toEqual({ trabalha: true, entrada: "09:00", saida: "17:00", pausaMin: 0 });
  });
  it("dois intervalos: o buraco entre eles e a pausa, e as horas contam exactamente", () => {
    expect(diaDeIntervalos([{ inicio: "09:00", fim: "13:00" }, { inicio: "14:00", fim: "18:00" }])).toEqual({ trabalha: true, entrada: "09:00", saida: "18:00", pausaMin: 60 });
  });
});

describe("versoesDoPlaneado", () => {
  it("sem linhas nao ha versoes", () => {
    expect(versoesDoPlaneado([], HOJE)).toEqual([]);
    expect(versaoEmVigorReal([])).toBeNull();
  });

  it("as linhas recorrentes com a mesma janela formam uma versao, com as horas da semana", () => {
    const [versao] = versoesDoPlaneado(semanaPadrao(), HOJE);
    expect(versao).toMatchObject({ tipo: "padrao", estado: "em_vigor", minutosSemana: 5 * 480, corrigida: false, desde: null, ate: null });
  });

  it("janelas diferentes sao versoes diferentes, a mais recente primeiro, e so uma esta em vigor", () => {
    const antiga = semanaPadrao({ valido_ate: "2026-09-30" });
    const nova = semanaPadrao({ valido_de: "2026-10-01" }).map((l) => ({ ...l, id: `n${l.id}` }));
    const versoes = versoesDoPlaneado([...antiga, ...nova], HOJE);
    expect(versoes.map((v) => v.estado)).toEqual(["em_vigor", "fechada"]);
    expect(versaoEmVigorReal(versoes)?.desde).toBe("2026-10-01");
  });

  it("uma versao que ainda nao comecou e futura", () => {
    expect(versoesDoPlaneado(semanaPadrao({ valido_de: "2026-11-01" }), HOJE)[0].estado).toBe("futura");
  });

  it("dois intervalos no mesmo dia tornam a versao repartida", () => {
    const [versao] = versoesDoPlaneado([linha("a"), linha("b", { ordem: 2, hora_inicio: "14:00:00", hora_fim: "18:00:00" })], HOJE);
    expect(versao.tipo).toBe("repartido");
    expect(versao.minutosSemana).toBe(480);
  });

  it("as excepcoes de um dia nao entram nas versoes", () => {
    expect(versoesDoPlaneado([linha("x", { dia_semana: null, data: "2026-10-25" })], HOJE)).toEqual([]);
  });

  it("a linha corrigida substitui a errada e a versao fica marcada com o motivo", () => {
    const [versao] = versoesDoPlaneado(
      [linha("a"), linha("b", { corrige_horario_id: "a", correccao_motivo: "Hora errada", hora_fim: "12:00:00" })],
      HOJE,
    );
    expect(versao.linhas.map((l) => l.id)).toEqual(["b"]);
    expect(versao).toMatchObject({ corrigida: true, motivoCorreccao: "Hora errada", minutosSemana: 180 });
  });
});

describe("configDaVersao", () => {
  it("um padrao sem pausas volta como configuracao padrao editavel", () => {
    const config = configDaVersao(versoesDoPlaneado(semanaPadrao(), HOJE)[0]);
    expect(config?.tipo).toBe("padrao");
    expect(config?.padrao[1]).toEqual({ trabalha: true, entrada: "09:00", saida: "17:00", pausaMin: 0 });
    expect(config?.padrao[0].trabalha).toBe(false);
  });

  it("um repartido igual em todos os dias volta como repartido", () => {
    const linhas = [2, 3].flatMap((d) => [
      linha(`a${d}`, { dia_semana: d }),
      linha(`b${d}`, { dia_semana: d, ordem: 2, hora_inicio: "14:00:00", hora_fim: "18:00:00" }),
    ]);
    const config = configDaVersao(versoesDoPlaneado(linhas, HOJE)[0]);
    expect(config?.tipo).toBe("repartido");
    expect(config?.repartido).toMatchObject({ p1Inicio: "09:00", p1Fim: "13:00", p2Inicio: "14:00", p2Fim: "18:00", dias: [2, 3] });
  });

  it("horas diferentes em cada dia repartido nao cabem num tipo: devolve null em vez de inventar", () => {
    const linhas = [
      linha("a2", { dia_semana: 2 }), linha("b2", { dia_semana: 2, ordem: 2, hora_inicio: "14:00:00", hora_fim: "18:00:00" }),
      linha("a3", { dia_semana: 3, hora_fim: "12:00:00" }), linha("b3", { dia_semana: 3, ordem: 2, hora_inicio: "14:00:00", hora_fim: "18:00:00" }),
    ];
    expect(configDaVersao(versoesDoPlaneado(linhas, HOJE)[0])).toBeNull();
  });

  it("tres intervalos no mesmo dia nao cabem num tipo", () => {
    const linhas = [1, 2, 3].map((o) => linha(`i${o}`, { ordem: o, hora_inicio: `${6 + o * 3}:00:00`, hora_fim: `${7 + o * 3}:00:00` }));
    expect(configDaVersao(versoesDoPlaneado(linhas, HOJE)[0])).toBeNull();
  });
});

describe("linhasParaNovaVersao", () => {
  const padraoDeSegunda = () => {
    const config = configInicialReal();
    return { ...config, padrao: config.padrao.map((d, i) => (i === 1 ? { ...d, trabalha: true, entrada: "08:00", saida: "12:00" } : { ...d, trabalha: false })) };
  };

  it("um padrao gera uma linha recorrente por dia de trabalho, sem data", () => {
    const resultado = linhasParaNovaVersao([], padraoDeSegunda());
    expect(resultado).toMatchObject({ ok: true });
    if (resultado.ok) expect(resultado.valor).toEqual([expect.objectContaining({ dia_semana: 1, data: null, hora_inicio: "08:00", hora_fim: "12:00", nao_trabalha: false, ordem: 1 })]);
  });

  it("recusa a pausa em minutos, que a base nao guarda", () => {
    const config = padraoDeSegunda();
    config.padrao[1] = { ...config.padrao[1], pausaMin: 30 };
    expect(linhasParaNovaVersao([], config)).toEqual({ ok: false, erro: "rhExemplo.hor.real.pausaSemColuna" });
  });

  it("recusa os tipos sem coluna (isencao, livre, banco)", () => {
    for (const tipo of ["isencao", "livre", "banco"] as const) {
      expect(linhasParaNovaVersao([], { ...configInicialReal(), tipo })).toEqual({ ok: false, erro: "rhExemplo.hor.real.tipoSemColuna" });
    }
  });

  it("recusa um horario invalido (fim antes do inicio)", () => {
    const config = padraoDeSegunda();
    config.padrao[1] = { ...config.padrao[1], entrada: "12:00", saida: "08:00" };
    const resultado = linhasParaNovaVersao([], config);
    expect(resultado.ok).toBe(false);
  });

  it("um repartido gera dois intervalos por dia escolhido", () => {
    const resultado = linhasParaNovaVersao([], { ...configInicialReal(), tipo: "repartido" });
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.valor).toHaveLength(10);
      expect(resultado.valor.filter((l) => l.dia_semana === 2).map((l) => l.ordem)).toEqual([1, 2]);
    }
  });

  it("mantem as excepcoes futuras e o local de cada intervalo que ja o tinha", () => {
    const editaveis = [linha("a", { local_id: "loc-1" }), linha("x", { dia_semana: null, data: "2026-12-24", nao_trabalha: true, hora_inicio: null, hora_fim: null })];
    const resultado = linhasParaNovaVersao(editaveis, padraoDeSegunda());
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.valor.find((l) => l.dia_semana === 1)?.local_id).toBe("loc-1");
      expect(resultado.valor.find((l) => l.data === "2026-12-24")).toMatchObject({ nao_trabalha: true });
    }
  });
});

describe("linhasEditaveis", () => {
  it("deixa de fora o que ja decorreu", () => {
    const decorrida = linha("d", { valido_ate: "2026-09-30" });
    const emCurso = linha("c");
    const excepcaoPassada = linha("x", { dia_semana: null, data: "2026-09-01" });
    expect(linhasEditaveis([decorrida, emCurso, excepcaoPassada], HOJE).map((l) => l.id)).toEqual(["c"]);
  });
});

describe("excepcoes de um dia", () => {
  const folga = linha("x1", { dia_semana: null, data: "2026-10-25", nao_trabalha: true, hora_inicio: null, hora_fim: null });

  it("lista por data, com folga e horas", () => {
    const lista = excecoesDoPlaneado([linha("x2", { dia_semana: null, data: "2026-10-30", hora_inicio: "10:00:00", hora_fim: "14:00:00" }), folga]);
    expect(lista.map((e) => [e.data, e.naoTrabalha])).toEqual([["2026-10-25", true], ["2026-10-30", false]]);
    expect(lista[1].intervalos).toEqual([{ inicio: "10:00", fim: "14:00" }]);
  });

  it("criar uma excepcao junta uma linha com data e mantem o resto", () => {
    const resultado = linhasComExcecao([linha("a")], { data: "2026-10-30", dia: { trabalha: true, entrada: "10:00", saida: "14:00", pausaMin: 0 } }, HOJE);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.valor.filter((l) => l.data === "2026-10-30")).toEqual([expect.objectContaining({ dia_semana: null, hora_inicio: "10:00", hora_fim: "14:00" })]);
      expect(resultado.valor.some((l) => l.dia_semana === 1)).toBe(true);
    }
  });

  it("uma folga de um dia grava nao_trabalha", () => {
    const resultado = linhasComExcecao([], { data: "2026-10-30", dia: { trabalha: false, entrada: "10:00", saida: "14:00", pausaMin: 0 } }, HOJE);
    expect(resultado.ok && resultado.valor).toEqual([expect.objectContaining({ data: "2026-10-30", nao_trabalha: true, hora_inicio: null })]);
  });

  it("recusa o passado, a data vazia, a data repetida e o fim antes do inicio", () => {
    const dia = { trabalha: true, entrada: "10:00", saida: "14:00", pausaMin: 0 };
    expect(linhasComExcecao([], { data: "2026-10-19", dia }, HOJE)).toEqual({ ok: false, erro: "rhExemplo.hor.erro.dataPassada" });
    expect(linhasComExcecao([], { data: "", dia }, HOJE)).toEqual({ ok: false, erro: "rhExemplo.hor.erro.dataPassada" });
    expect(linhasComExcecao([folga], { data: "2026-10-25", dia }, HOJE)).toEqual({ ok: false, erro: "rhExemplo.hor.erro.excecaoJaExiste" });
    expect(linhasComExcecao([], { data: "2026-10-30", dia: { ...dia, entrada: "14:00", saida: "10:00" } }, HOJE)).toEqual({ ok: false, erro: "rhExemplo.hor.erro.fimAntesInicio" });
  });

  it("aceita hoje, que ainda nao passou", () => {
    expect(linhasComExcecao([], { data: HOJE, dia: { trabalha: false, entrada: "10:00", saida: "14:00", pausaMin: 0 } }, HOJE).ok).toBe(true);
  });

  it("tirar a excepcao deixa o resto", () => {
    const resto = linhasSemExcecao([linha("a"), folga], "2026-10-25");
    expect(resto.some((l) => l.data !== null)).toBe(false);
    expect(resto.some((l) => l.dia_semana === 1)).toBe(true);
  });
});

describe("horarioPessoaDeLinhas (para o calendario)", () => {
  it("sem linhas nao ha horario", () => {
    expect(horarioPessoaDeLinhas([], HOJE)).toBeUndefined();
  });

  it("resolve o dia pela versao em vigor e pela excepcao, com as horas exactas", () => {
    const horario = horarioPessoaDeLinhas(
      [linha("a", { dia_semana: 3 }), linha("b", { dia_semana: 3, ordem: 2, hora_inicio: "14:00:00", hora_fim: "18:00:00" }),
        linha("x", { dia_semana: null, data: "2026-10-14", nao_trabalha: true, hora_inicio: null, hora_fim: null })],
      HOJE,
    );
    expect(horario).toBeDefined();
    if (!horario) return;
    expect(resolverHorarioDoDia(horario, "2026-10-07")).toMatchObject({ origem: "versao", minutosPlaneados: 480 });
    expect(resolverHorarioDoDia(horario, "2026-10-14")).toMatchObject({ origem: "excecao", minutosPlaneados: 0 });
    expect(resolverHorarioDoDia(horario, "2026-10-08").minutosPlaneados).toBe(0);
  });
});

describe("avisoContratadasMin", () => {
  it("avisa quando o total difere e nao avisa sem horas contratadas", () => {
    expect(avisoContratadasMin(2400, 40)).toBe(false);
    expect(avisoContratadasMin(2000, 40)).toBe(true);
    expect(avisoContratadasMin(2000, null)).toBe(false);
    expect(avisoContratadasMin(2000, 0)).toBe(false);
  });
});
