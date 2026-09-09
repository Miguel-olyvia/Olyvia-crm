/**
 * O modelo de horario variavel: dois intervalos no MESMO dia, em locais
 * DIFERENTES.
 *
 * E o requisito central do modulo e por isso e o primeiro teste: "neste dia
 * ela fez das 9 as 14 naquela empresa e so das 15 as 19 naquilo". Se este
 * teste passar a devolver uma linha em vez de duas, o modelo voltou a ser um
 * horario semanal fixo e o requisito partiu-se em silencio.
 *
 * Os outros fecham as tres regras que a base impoe e que o ecra tem de
 * espelhar: sobreposicoes recusadas, meia-noite partida em dois dias, e a
 * precedencia das excepcoes por data.
 */
import { describe, expect, it } from "vitest";
import {
  chavesSobrepostas,
  formatarDuracao,
  horarioVazio,
  linhasParaGravar,
  minutosDe,
  novaChave,
  partirNaMeiaNoite,
  problemasDoHorario,
  rascunhoDeLinhas,
  totaisPorLocal,
  totalSemanal,
} from "@/lib/hr/horario";
import type { HorarioPlaneado } from "@/types/hr";

const LOJA = "11111111-1111-4111-8111-111111111111";
const SEDE = "22222222-2222-4222-8222-222222222222";

function intervalo(inicio: string, fim: string, localId: string | null) {
  return { chave: novaChave(), hora_inicio: inicio, hora_fim: fim, local_id: localId };
}

describe("horario planeado", () => {
  it("guarda dois intervalos no mesmo dia, cada um no seu local", () => {
    const rascunho = horarioVazio();
    const quarta = rascunho.dias.find((dia) => dia.dia_semana === 3)!;
    quarta.intervalos.push(intervalo("09:00", "14:00", LOJA));
    quarta.intervalos.push(intervalo("15:00", "19:00", SEDE));

    const linhas = linhasParaGravar(rascunho);

    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({
      dia_semana: 3,
      data: null,
      hora_inicio: "09:00",
      hora_fim: "14:00",
      local_id: LOJA,
      ordem: 1,
      nao_trabalha: false,
    });
    expect(linhas[1]).toMatchObject({
      dia_semana: 3,
      hora_inicio: "15:00",
      hora_fim: "19:00",
      local_id: SEDE,
      ordem: 2,
    });
  });

  it("aceita uma semana sem padrao nenhum -- segunda das 3 as 6, terca das 7 as 9", () => {
    const rascunho = horarioVazio();
    rascunho.dias.find((dia) => dia.dia_semana === 1)!.intervalos.push(
      intervalo("03:00", "06:00", LOJA),
    );
    rascunho.dias.find((dia) => dia.dia_semana === 2)!.intervalos.push(
      intervalo("07:00", "09:00", SEDE),
    );

    const linhas = linhasParaGravar(rascunho);

    expect(linhas.map((linha) => [linha.dia_semana, linha.hora_inicio, linha.hora_fim])).toEqual([
      [1, "03:00", "06:00"],
      [2, "07:00", "09:00"],
    ]);
    expect(totalSemanal(rascunho)).toBe(5 * 60);
  });

  it("apanha a sobreposicao dentro do mesmo dia, mesmo em locais diferentes", () => {
    const a = intervalo("09:00", "14:00", LOJA);
    const b = intervalo("13:00", "18:00", SEDE);
    const colididas = chavesSobrepostas([a, b]);
    expect(colididas.has(a.chave)).toBe(true);
    expect(colididas.has(b.chave)).toBe(true);

    // Encostados nao colidem: o fim de um e o inicio do outro.
    const c = intervalo("14:00", "18:00", SEDE);
    expect(chavesSobrepostas([a, c]).size).toBe(0);
  });

  it("parte um turno que atravessa a meia-noite em dois intervalos", () => {
    const nocturno = intervalo("22:00", "02:00", LOJA);
    const partido = partirNaMeiaNoite(nocturno);
    expect(partido).not.toBeNull();
    expect(partido!.hoje.hora_inicio).toBe("22:00");
    expect(partido!.amanha.hora_inicio).toBe("00:00");
    expect(partido!.amanha.hora_fim).toBe("02:00");
    // A linha nova nao herda o id da que estava gravada.
    expect(partido!.amanha.id).toBeUndefined();
  });

  it("marca como problema o intervalo nocturno e o incompleto", () => {
    const rascunho = horarioVazio();
    const dia = rascunho.dias.find((d) => d.dia_semana === 1)!;
    dia.intervalos.push(intervalo("22:00", "02:00", LOJA));
    dia.intervalos.push(intervalo("10:00", "", null));

    const tipos = problemasDoHorario(rascunho).map((p) => p.tipo).sort();
    expect(tipos).toEqual(["incompleto", "meiaNoite"]);
  });

  it("uma excepcao por data e uma linha com data e sem dia da semana", () => {
    const rascunho = horarioVazio();
    rascunho.excepcoes.push({
      chave: novaChave("exc"),
      data: "2026-12-24",
      nao_trabalha: false,
      intervalos: [intervalo("09:00", "13:00", SEDE)],
    });

    const linhas = linhasParaGravar(rascunho);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ dia_semana: null, data: "2026-12-24", hora_inicio: "09:00" });
  });

  it("uma excepcao sem intervalos e folga naquela data", () => {
    const rascunho = horarioVazio();
    rascunho.excepcoes.push({
      chave: novaChave("exc"),
      data: "2026-12-25",
      nao_trabalha: true,
      intervalos: [],
    });

    const linhas = linhasParaGravar(rascunho);
    expect(linhas[0]).toMatchObject({
      data: "2026-12-25",
      nao_trabalha: true,
      hora_inicio: null,
      hora_fim: null,
      local_id: null,
    });
  });

  it("um dia marcado como nao laboravel grava horas e local nulos", () => {
    const rascunho = horarioVazio();
    const domingo = rascunho.dias.find((dia) => dia.dia_semana === 0)!;
    domingo.nao_trabalha = true;

    const linhas = linhasParaGravar(rascunho);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ dia_semana: 0, nao_trabalha: true, hora_inicio: null });
  });

  it("le da base e volta a produzir os mesmos intervalos", () => {
    const daBase: HorarioPlaneado[] = [
      {
        id: "a",
        pessoa_id: "p",
        organization_id: "o",
        vinculo_id: null,
        local_id: LOJA,
        dia_semana: 3,
        data: null,
        hora_inicio: "09:00:00",
        hora_fim: "14:00:00",
        nao_trabalha: false,
        ordem: 1,
        valido_de: null,
        valido_ate: null,
        notas: null,
      },
      {
        id: "b",
        pessoa_id: "p",
        organization_id: "o",
        vinculo_id: null,
        local_id: SEDE,
        dia_semana: 3,
        data: null,
        hora_inicio: "15:00:00",
        hora_fim: "19:00:00",
        nao_trabalha: false,
        ordem: 2,
        valido_de: null,
        valido_ate: null,
        notas: null,
      },
    ];

    const rascunho = rascunhoDeLinhas(daBase);
    const quarta = rascunho.dias.find((dia) => dia.dia_semana === 3)!;
    expect(quarta.intervalos).toHaveLength(2);
    expect(quarta.intervalos.map((i) => i.local_id)).toEqual([LOJA, SEDE]);

    const totais = totaisPorLocal(rascunho);
    expect(totais.get(LOJA)).toBe(5 * 60);
    expect(totais.get(SEDE)).toBe(4 * 60);
  });

  it("le e formata horas sem inventar valores", () => {
    expect(minutosDe("09:30")).toBe(570);
    expect(minutosDe("09:30:00")).toBe(570);
    expect(minutosDe("")).toBeNull();
    expect(minutosDe("99:99")).toBeNull();
    expect(formatarDuracao(570)).toBe("9h30");
    expect(formatarDuracao(0)).toBe("0h00");
  });
});
