/**
 * O horario planeado de UM dia concreto.
 *
 * O caso que estes testes protegem e o da limpeza: dois locais no mesmo dia,
 * semanas sem padrao, e uma excepcao por data que SUBSTITUI o padrao em vez
 * de se somar a ele. Somar dava o dobro das horas planeadas no mapa do mes.
 */
import { describe, expect, it } from "vitest";
import {
  diaSemanaDe,
  leituraDoPlaneado,
  planeadoDoDia,
  planeadoQueContemHora,
} from "@/lib/hr/planeadoDoDia";
import type { HorarioPlaneado } from "@/types/hr";

const linha = (parcial: Partial<HorarioPlaneado>): HorarioPlaneado => ({
  id: parcial.id ?? Math.random().toString(36).slice(2),
  pessoa_id: "p1",
  organization_id: "o1",
  vinculo_id: null,
  local_id: parcial.local_id ?? null,
  dia_semana: parcial.dia_semana ?? null,
  data: parcial.data ?? null,
  hora_inicio: parcial.hora_inicio ?? null,
  hora_fim: parcial.hora_fim ?? null,
  nao_trabalha: parcial.nao_trabalha ?? false,
  ordem: parcial.ordem ?? 0,
  valido_de: parcial.valido_de ?? null,
  valido_ate: parcial.valido_ate ?? null,
  notas: null,
});

// 2026-01-05 e uma segunda-feira.
const SEGUNDA = "2026-01-05";
const TERCA = "2026-01-06";

describe("o dia da semana sai do calendario civil", () => {
  it("2026-01-05 e segunda, 2026-01-04 e domingo", () => {
    expect(diaSemanaDe(SEGUNDA)).toBe(1);
    expect(diaSemanaDe("2026-01-04")).toBe(0);
  });
});

describe("um dia com dois locais", () => {
  const padrao = [
    linha({ id: "b", dia_semana: 1, hora_inicio: "15:00", hora_fim: "19:00", local_id: "L2" }),
    linha({ id: "a", dia_semana: 1, hora_inicio: "09:00", hora_fim: "14:00", local_id: "L1" }),
    linha({ id: "c", dia_semana: 2, hora_inicio: "09:00", hora_fim: "13:00", local_id: "L1" }),
  ];

  it("devolve os DOIS intervalos da segunda, por ordem de hora", () => {
    const dia = planeadoDoDia(padrao, SEGUNDA);
    expect(dia.map((i) => i.id)).toEqual(["a", "b"]);
    expect(dia.map((i) => i.local_id)).toEqual(["L1", "L2"]);
  });

  it("nao traz o que e de outro dia da semana", () => {
    expect(planeadoDoDia(padrao, TERCA).map((i) => i.id)).toEqual(["c"]);
  });

  it("um dia sem linha nenhuma devolve lista vazia e nao 'nao trabalha'", () => {
    const leitura = leituraDoPlaneado(padrao, "2026-01-11");
    expect(leitura.intervalos).toEqual([]);
    expect(leitura.naoTrabalha).toBe(false);
  });
});

describe("a excepcao por data substitui o padrao", () => {
  const linhas = [
    linha({ id: "padrao", dia_semana: 1, hora_inicio: "09:00", hora_fim: "18:00" }),
    linha({ id: "excepcao", data: SEGUNDA, hora_inicio: "10:00", hora_fim: "12:00" }),
  ];

  it("nesse dia vale a excepcao, e o padrao nao se soma", () => {
    const dia = planeadoDoDia(linhas, SEGUNDA);
    expect(dia).toHaveLength(1);
    expect(dia[0].id).toBe("excepcao");
    expect(leituraDoPlaneado(linhas, SEGUNDA).porExcepcao).toBe(true);
  });

  it("uma excepcao de 'nao trabalha' esvazia o dia e diz porque", () => {
    const comFolga = [
      linha({ id: "padrao", dia_semana: 1, hora_inicio: "09:00", hora_fim: "18:00" }),
      linha({ id: "folga", data: SEGUNDA, nao_trabalha: true }),
    ];
    const leitura = leituraDoPlaneado(comFolga, SEGUNDA);
    expect(leitura.intervalos).toEqual([]);
    expect(leitura.naoTrabalha).toBe(true);
  });
});

describe("a validade delimita o passado e o futuro", () => {
  it("uma linha que ainda nao entrou em vigor nao conta", () => {
    const linhas = [
      linha({ id: "novo", dia_semana: 1, hora_inicio: "08:00", hora_fim: "16:00", valido_de: "2026-02-01" }),
    ];
    expect(planeadoDoDia(linhas, SEGUNDA)).toEqual([]);
    expect(planeadoDoDia(linhas, "2026-02-02").map((i) => i.id)).toEqual(["novo"]);
  });

  it("uma linha que ja saiu de vigor nao conta", () => {
    const linhas = [
      linha({ id: "antigo", dia_semana: 1, hora_inicio: "08:00", hora_fim: "16:00", valido_ate: "2025-12-31" }),
    ];
    expect(planeadoDoDia(linhas, SEGUNDA)).toEqual([]);
  });

  it("mudar de horario a meio: cada dia le a linha que estava em vigor", () => {
    const linhas = [
      linha({ id: "antigo", dia_semana: 1, hora_inicio: "09:00", hora_fim: "18:00", valido_ate: "2026-01-05" }),
      linha({ id: "novo", dia_semana: 1, hora_inicio: "07:00", hora_fim: "15:00", valido_de: "2026-01-06" }),
    ];
    expect(planeadoDoDia(linhas, SEGUNDA).map((i) => i.id)).toEqual(["antigo"]);
    expect(planeadoDoDia(linhas, "2026-01-12").map((i) => i.id)).toEqual(["novo"]);
  });
});

describe("o intervalo que contem uma hora", () => {
  const dia = [
    linha({ id: "manha", dia_semana: 1, hora_inicio: "09:00", hora_fim: "13:00", local_id: "L1" }),
    linha({ id: "tarde", dia_semana: 1, hora_inicio: "14:00", hora_fim: "18:00", local_id: "L2" }),
  ];

  it("escolhe o intervalo certo, e com ele o local certo", () => {
    expect(planeadoQueContemHora(dia, "09:30")?.local_id).toBe("L1");
    expect(planeadoQueContemHora(dia, "15:00")?.local_id).toBe("L2");
  });

  it("o fim e aberto: as 13:00 ja nao se esta no turno da manha", () => {
    expect(planeadoQueContemHora(dia, "13:00")).toBeNull();
  });

  it("fora de qualquer turno nao inventa nenhum", () => {
    expect(planeadoQueContemHora(dia, "07:00")).toBeNull();
    expect(planeadoQueContemHora(dia, "22:00")).toBeNull();
  });
});
