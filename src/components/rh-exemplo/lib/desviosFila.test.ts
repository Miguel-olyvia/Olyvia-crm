// A fila de fim de dia ligada aos desvios REAIS (`hr_assiduidade_desvios`): que accoes cada tipo admite, o filtro de
// minutos, o agrupamento por dia e as sugestoes de falta. Funcoes puras, sem base.
import { describe, expect, it } from "vitest";
import {
  accoesDoDesvio,
  agruparDesviosPorDia,
  chaveDoDesvio,
  filtrarDesviosPorTolerancia,
  sugestoesDeFaltaDosDesvios,
} from "@/components/rh-exemplo/lib/alertasFimDia";
import type { Desvio } from "@/components/rh-exemplo/tiposAssiduidade";

function desvio(extra: Partial<Desvio> = {}): Desvio {
  return {
    organization_id: "org",
    pessoa_id: "pessoa-a",
    data: "2026-10-06",
    tipo: "planeado_sem_realizado",
    hora_inicio: "09:00:00",
    hora_fim: "13:00:00",
    minutos: 240,
    planeado_id: "plan-1",
    local_id: null,
    referencia_id: null,
    detalhe: null,
    ...extra,
  };
}

describe("accoesDoDesvio", () => {
  it("turno planeado sem horas: so marcar falta, e so com periodo completo", () => {
    expect(accoesDoDesvio(desvio())).toEqual(["marcar_falta"]);
    expect(accoesDoDesvio(desvio({ hora_fim: null }))).toEqual([]);
    expect(accoesDoDesvio(desvio({ hora_inicio: null }))).toEqual([]);
  });

  it("horas sem turno e picagem por emparelhar: corrigir, so se houver a linha de origem", () => {
    expect(accoesDoDesvio(desvio({ tipo: "realizado_sem_planeado", referencia_id: "r1" }))).toEqual(["corrigir"]);
    expect(accoesDoDesvio(desvio({ tipo: "realizado_sem_planeado", referencia_id: null }))).toEqual([]);
    expect(accoesDoDesvio(desvio({ tipo: "pendente_par", referencia_id: "p1", hora_fim: null }))).toEqual(["corrigir"]);
    expect(accoesDoDesvio(desvio({ tipo: "pendente_par", referencia_id: null }))).toEqual([]);
  });

  it("turno so parcialmente picado (almoco nao picado): marcar falta, so com o bloco completo, e nunca vira sugestao", () => {
    const parcial = desvio({ tipo: "planeado_parcialmente_realizado", minutos: 60 });
    expect(accoesDoDesvio(parcial)).toEqual(["marcar_falta"]);
    expect(accoesDoDesvio({ ...parcial, hora_fim: null })).toEqual([]);
    expect(sugestoesDeFaltaDosDesvios([parcial], [])).toEqual([]);
  });

  it("falta coberta por ausencia: anular", () => {
    expect(accoesDoDesvio(desvio({ tipo: "falta_coberta_por_ausencia", referencia_id: "aus-1" }))).toEqual(["anular_por_ausencia"]);
  });

  it("um tipo desconhecido da base nao oferece accao nenhuma", () => {
    expect(accoesDoDesvio(desvio({ tipo: "novo_tipo" as Desvio["tipo"] }))).toEqual([]);
  });
});

describe("filtrarDesviosPorTolerancia", () => {
  const lista = [
    desvio({ minutos: 3 }),
    desvio({ minutos: 30 }),
    desvio({ tipo: "pendente_par", minutos: null, hora_fim: null, referencia_id: "p1" }),
    desvio({ minutos: null }),
  ];

  it("zero mostra tudo", () => {
    expect(filtrarDesviosPorTolerancia(lista, 0)).toHaveLength(4);
  });

  it("esconde o que fica abaixo, trata minutos nulos como zero e nunca esconde a picagem por emparelhar", () => {
    const visiveis = filtrarDesviosPorTolerancia(lista, 10);
    expect(visiveis).toHaveLength(2);
    expect(visiveis.map((d) => d.tipo)).toEqual(["planeado_sem_realizado", "pendente_par"]);
  });

  it("o limite e inclusivo", () => {
    expect(filtrarDesviosPorTolerancia([desvio({ minutos: 10 })], 10)).toHaveLength(1);
  });

  it("lista vazia dá lista vazia", () => {
    expect(filtrarDesviosPorTolerancia([], 5)).toEqual([]);
  });
});

describe("agruparDesviosPorDia", () => {
  it("agrupa por dia, do mais recente para o mais antigo, sem perder linhas", () => {
    const grupos = agruparDesviosPorDia([desvio({ data: "2026-10-01" }), desvio({ data: "2026-10-08" }), desvio({ data: "2026-10-01", pessoa_id: "b" })]);
    expect(grupos.map(([data, linhas]) => [data, linhas.length])).toEqual([["2026-10-08", 1], ["2026-10-01", 2]]);
  });
});

describe("chaveDoDesvio", () => {
  it("distingue dois desvios da mesma pessoa no mesmo dia", () => {
    expect(chaveDoDesvio(desvio({ hora_inicio: "09:00:00" }), 0)).not.toBe(chaveDoDesvio(desvio({ hora_inicio: "14:00:00" }), 1));
  });
});

describe("sugestoesDeFaltaDosDesvios", () => {
  it("sugere os turnos planeados sem horas, com hora curta", () => {
    expect(sugestoesDeFaltaDosDesvios([desvio()], [])).toEqual([
      { chave: "pessoa-a|2026-10-06|09:00", pessoaId: "pessoa-a", data: "2026-10-06", inicio: "09:00", fim: "13:00", minutos: 240 },
    ]);
  });

  it("ignora os outros tipos, periodos incompletos e duracao zero ou nula", () => {
    expect(sugestoesDeFaltaDosDesvios([desvio({ tipo: "realizado_sem_planeado" })], [])).toEqual([]);
    expect(sugestoesDeFaltaDosDesvios([desvio({ tipo: "pendente_par" })], [])).toEqual([]);
    expect(sugestoesDeFaltaDosDesvios([desvio({ hora_fim: null })], [])).toEqual([]);
    expect(sugestoesDeFaltaDosDesvios([desvio({ minutos: 0 })], [])).toEqual([]);
    expect(sugestoesDeFaltaDosDesvios([desvio({ minutos: null })], [])).toEqual([]);
  });

  it("nao sugere o periodo que ja tem falta a sobrepor-se, mas sugere o que so toca na fronteira", () => {
    const falta = { pessoa_id: "pessoa-a", data: "2026-10-06", hora_inicio: "10:00:00", hora_fim: "11:00:00" };
    expect(sugestoesDeFaltaDosDesvios([desvio()], [falta])).toEqual([]);
    const vizinha = { ...falta, hora_inicio: "13:00:00", hora_fim: "18:00:00" };
    expect(sugestoesDeFaltaDosDesvios([desvio()], [vizinha])).toHaveLength(1);
    expect(sugestoesDeFaltaDosDesvios([desvio()], [{ ...falta, pessoa_id: "outra" }])).toHaveLength(1);
    expect(sugestoesDeFaltaDosDesvios([desvio()], [{ ...falta, data: "2026-10-07" }])).toHaveLength(1);
  });
});
