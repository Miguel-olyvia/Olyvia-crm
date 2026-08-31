import { describe, expect, it } from "vitest";
import {
  HORA_ABRE,
  HORA_FECHA,
  cargaDoDia,
  cargaPesada,
  feriadoDoDia,
  horasDaRegua,
  mesmoDia,
  porAtribuir,
  porPessoa,
  posicaoNaRegua,
  somarDias,
  type ImpedimentoDaEquipa,
  type OrdemNaAgenda,
} from "../agenda";

const DIA = new Date(2026, 8, 16); // 16 de setembro de 2026, uma quarta-feira

/** Uma hora daquele dia, no fuso local — que é como o ecrã as lê. */
const as = (h: number, m = 0) => new Date(2026, 8, 16, h, m).toISOString();

const ordem = (p: Partial<OrdemNaAgenda> = {}): OrdemNaAgenda => ({
  id: "o1",
  codigo: "OT-1",
  titulo: "Visita",
  estado: "agendada",
  origem: "preventiva",
  prioridade: "normal",
  responsavel_id: "p1",
  agendada_para: as(9),
  janela_inicio: null,
  janela_fim: null,
  ...p,
});

describe("a régua do dia", () => {
  it("vai das 7 às 20", () => {
    const h = horasDaRegua();
    expect(h[0]).toBe(HORA_ABRE);
    expect(h[h.length - 1]).toBe(HORA_FECHA);
  });

  it("somar dias não mexe no original", () => {
    const d = new Date(2026, 8, 16);
    const seguinte = somarDias(d, 1);
    expect(seguinte.getDate()).toBe(17);
    expect(d.getDate()).toBe(16);
  });

  it("atravessa o fim do mês sem se enganar", () => {
    expect(somarDias(new Date(2026, 8, 30), 1).getMonth()).toBe(9);
  });

  it("mesmoDia ignora as horas", () => {
    expect(mesmoDia(new Date(2026, 8, 16, 3), new Date(2026, 8, 16, 23))).toBe(true);
    expect(mesmoDia(new Date(2026, 8, 16), new Date(2026, 8, 17))).toBe(false);
  });
});

describe("onde fica o bloco de uma ordem", () => {
  it("uma ordem às 9h, sem janela, ocupa uma hora", () => {
    const p = posicaoNaRegua(ordem(), DIA)!;
    // 9h numa régua de 7 a 20 = 2/13 da largura
    expect(Math.round(p.esquerda)).toBe(Math.round((2 / 13) * 100));
    expect(Math.round(p.largura)).toBe(Math.round((1 / 13) * 100));
    expect(p.transborda).toBe(false);
  });

  it("a janela manda, quando existe", () => {
    const p = posicaoNaRegua(
      ordem({ janela_inicio: as(14), janela_fim: as(18) }),
      DIA
    )!;
    expect(Math.round(p.esquerda)).toBe(Math.round((7 / 13) * 100));
    expect(Math.round(p.largura)).toBe(Math.round((4 / 13) * 100));
  });

  it("uma ordem sem hora não tem sítio na régua", () => {
    // No Infraspeak estas apareciam empilhadas às 09:00, e a grelha mentia.
    expect(posicaoNaRegua(ordem({ agendada_para: null }), DIA)).toBeNull();
  });

  it("uma ordem de outro dia também não", () => {
    expect(
      posicaoNaRegua(ordem({ agendada_para: new Date(2026, 8, 17, 9).toISOString() }), DIA)
    ).toBeNull();
  });

  it("uma visita às 6h30 encosta à borda em vez de desaparecer", () => {
    const p = posicaoNaRegua(
      ordem({ agendada_para: as(6, 30), janela_inicio: as(6, 30), janela_fim: as(6, 50) }),
      DIA
    )!;
    expect(p.esquerda).toBe(0);
    expect(p.largura).toBeGreaterThan(0);
    expect(p.transborda).toBe(true);
  });

  it("uma que começa antes das 7 e acaba às 9 fica cortada, e diz que transborda", () => {
    const p = posicaoNaRegua(
      ordem({ agendada_para: as(6), janela_inicio: as(6), janela_fim: as(9) }),
      DIA
    )!;
    expect(p.esquerda).toBe(0);
    expect(Math.round(p.largura)).toBe(Math.round((2 / 13) * 100));
    expect(p.transborda).toBe(true);
  });

  it("uma ordem de dez minutos ainda se consegue clicar", () => {
    const p = posicaoNaRegua(
      ordem({ janela_inicio: as(10), janela_fim: as(10, 10) }),
      DIA
    )!;
    expect(p.largura).toBeGreaterThanOrEqual(3);
  });

  it("uma janela invertida não rebenta nem desenha ao contrário", () => {
    const p = posicaoNaRegua(
      ordem({ janela_inicio: as(15), janela_fim: as(11) }),
      DIA
    )!;
    expect(p.largura).toBeGreaterThan(0);
    expect(p.esquerda).toBeGreaterThanOrEqual(0);
  });

  it("uma data impossível devolve nulo em vez de NaN", () => {
    expect(posicaoNaRegua(ordem({ agendada_para: "não é uma data" }), DIA)).toBeNull();
  });
});

describe("a carga de um dia", () => {
  it("uma hora por ordem, quando não há janela", () => {
    const c = cargaDoDia([ordem(), ordem({ id: "o2", agendada_para: as(11) })]);
    expect(c.ordens).toBe(2);
    expect(c.horas).toBe(2);
  });

  it("com janela, conta a janela", () => {
    const c = cargaDoDia([ordem({ janela_inicio: as(9), janela_fim: as(13) })]);
    expect(c.horas).toBe(4);
  });

  it("as sem hora contam-se à parte, e não somam horas", () => {
    const c = cargaDoDia([ordem({ agendada_para: null }), ordem()]);
    expect(c.semHora).toBe(1);
    expect(c.horas).toBe(1);
    expect(c.ordens).toBe(2);
  });

  it("uma janela invertida vale uma hora, e não menos zero", () => {
    const c = cargaDoDia([ordem({ janela_inicio: as(15), janela_fim: as(11) })]);
    expect(c.horas).toBe(1);
  });

  it("acima de oito horas avisa", () => {
    expect(cargaPesada({ ordens: 9, horas: 9, semHora: 0 })).toBe(true);
    expect(cargaPesada({ ordens: 8, horas: 8, semHora: 0 })).toBe(false);
  });

  it("um dia vazio é zero, não é NaN", () => {
    expect(cargaDoDia([])).toEqual({ ordens: 0, horas: 0, semHora: 0 });
  });
});

describe("distribuir pelas pessoas", () => {
  const pessoas = [{ utilizador_id: "p1" }, { utilizador_id: "p2" }];
  const ordens = [
    ordem({ id: "a", responsavel_id: "p1" }),
    ordem({ id: "b", responsavel_id: "p1", agendada_para: as(14) }),
    ordem({ id: "c", responsavel_id: null }),
  ];
  const impedimentos: ImpedimentoDaEquipa[] = [
    {
      utilizador_id: "p2",
      tipo: "ausente",
      detalhe: "Ausência marcada e aprovada",
      desde: "2026-09-14",
      ate: "2026-09-25",
    },
  ];

  it("cada pessoa fica com as suas", () => {
    const linhas = porPessoa(pessoas, ordens, impedimentos);
    expect(linhas[0].ordens.map((o) => o.id)).toEqual(["a", "b"]);
    expect(linhas[0].carga.horas).toBe(2);
  });

  it("quem não tem nada continua a aparecer — é aí que se vê quem está livre", () => {
    const linhas = porPessoa(pessoas, ordens, impedimentos);
    expect(linhas).toHaveLength(2);
    expect(linhas[1].ordens).toHaveLength(0);
  });

  it("e traz os impedimentos dela", () => {
    const linhas = porPessoa(pessoas, ordens, impedimentos);
    expect(linhas[1].impedimentos[0].tipo).toBe("ausente");
    expect(linhas[0].impedimentos).toHaveLength(0);
  });

  it("as sem dono ficam à parte", () => {
    expect(porAtribuir(ordens).map((o) => o.id)).toEqual(["c"]);
  });
});

describe("o feriado", () => {
  it("é de toda a gente, não de uma pessoa", () => {
    expect(
      feriadoDoDia([
        { utilizador_id: "p1", tipo: "feriado", detalhe: "Natal", desde: "x", ate: "x" },
      ])
    ).toBe("Natal");
  });

  it("sem feriado, nada", () => {
    expect(feriadoDoDia([])).toBeNull();
  });
});
