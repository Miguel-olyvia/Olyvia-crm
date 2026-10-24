import { describe, expect, it } from "vitest";
import {
  LIMITES_OMISSAO,
  avaliarCandidata,
  avaliarLimites,
  decidirHoraExtra,
  estadoVisivel,
  minutosNocturnos,
  pagamentoHorasExtra,
  saldoDeLimites,
  tempoAMaisPorTipo,
  type HoraExtra,
} from "./horasExtraRegras";

const hora = (p: Partial<HoraExtra> = {}): HoraExtra => ({
  id: "h1",
  pessoaId: "p1",
  data: "2026-11-06",
  minutos: 90,
  nocturnoMin: 0,
  origem: "diaria",
  motivoOrigem: "",
  estado: "pendente",
  acimaDoLimite: false,
  motivoDecisao: null,
  decididoPor: null,
  ...p,
});

describe("tempo a mais por tipo de horário", () => {
  it("normal e repartido: feito menos planeado, nunca abaixo de zero", () => {
    expect(tempoAMaisPorTipo({ tipo: "normal", feitoMin: 570, planeadoMin: 480, diaEspecial: null })).toEqual({ minutos: 90, origem: "diaria" });
    expect(tempoAMaisPorTipo({ tipo: "repartido", feitoMin: 420, planeadoMin: 480, diaEspecial: null }).minutos).toBe(0);
  });
  it("livre conta por semana (34 h − 32 h = 2 h)", () => {
    expect(tempoAMaisPorTipo({ tipo: "livre", feitoMin: 34 * 60, planeadoMin: 32 * 60, diaEspecial: null })).toEqual({ minutos: 120, origem: "semanal" });
  });
  it("isenção só conta feriado e descanso", () => {
    expect(tempoAMaisPorTipo({ tipo: "isencao", feitoMin: 640, planeadoMin: 480, diaEspecial: null }).minutos).toBe(0);
    expect(tempoAMaisPorTipo({ tipo: "isencao", feitoMin: 120, planeadoMin: 0, diaEspecial: "descanso" })).toEqual({ minutos: 120, origem: "descanso" });
  });
  it("feriado conta o tempo inteiro em qualquer tipo", () => {
    expect(tempoAMaisPorTipo({ tipo: "normal", feitoMin: 480, planeadoMin: 0, diaEspecial: "feriado" })).toEqual({ minutos: 480, origem: "feriado" });
  });
  it("banco de horas só conta o que passa do saldo máximo", () => {
    expect(tempoAMaisPorTipo({ tipo: "banco_horas", feitoMin: 600, planeadoMin: 480, diaEspecial: null }).minutos).toBe(0);
    expect(tempoAMaisPorTipo({ tipo: "banco_horas", feitoMin: 600, planeadoMin: 480, diaEspecial: null, excessoSobreSaldoMaxMin: 30 })).toEqual({ minutos: 30, origem: "banco" });
  });
  it("valores inválidos dão zero", () => {
    expect(tempoAMaisPorTipo({ tipo: "normal", feitoMin: Number.NaN, planeadoMin: 0, diaEspecial: null }).minutos).toBe(0);
  });
});

describe("tempo nocturno 22:00-07:00", () => {
  it("conta só a parte dentro da janela", () => {
    expect(minutosNocturnos("21:00", "23:00")).toBe(60);
    expect(minutosNocturnos("09:00", "18:00")).toBe(0);
    expect(minutosNocturnos("06:00", "08:00")).toBe(60);
  });
  it("atravessa a meia-noite", () => {
    expect(minutosNocturnos("22:00", "02:00")).toBe(240);
  });
  it("entrada inválida dá zero", () => {
    expect(minutosNocturnos("x", "y")).toBe(0);
  });
});

describe("mínimo de 15 minutos e marca da pessoa", () => {
  it("6 min fica abaixo do mínimo, 15 min já conta", () => {
    expect(avaliarCandidata(6, true, 15)).toBe("abaixo_minimo");
    expect(avaliarCandidata(15, true, 15)).toBe("cria_pendente");
  });
  it("sem a marca não gera, e sem tempo não há nada", () => {
    expect(avaliarCandidata(60, false, 15)).toBe("sem_marca");
    expect(avaliarCandidata(0, true, 15)).toBe("sem_tempo");
  });
});

describe("limites e alerta a 80 %", () => {
  it("caso da Sofia: 118 h no ano + 3 h numa quinta", () => {
    const r = avaliarLimites(180, { jaNoDiaMin: 0, jaNoAnoMin: 118 * 60 }, LIMITES_OMISSAO);
    expect(r.alertaAno).toBe(true);
    expect(r.acimaDoLimiteMin).toBe(60);
    expect(r.normaisMin).toBe(120);
  });
  it("abaixo de tudo não alerta nem marca", () => {
    const r = avaliarLimites(30, { jaNoDiaMin: 0, jaNoAnoMin: 0 }, LIMITES_OMISSAO);
    expect(r).toEqual({ normaisMin: 30, acimaDoLimiteMin: 0, alertaDia: false, alertaAno: false });
  });
  it("passar o limite anual marca o que excede", () => {
    const r = avaliarLimites(120, { jaNoDiaMin: 0, jaNoAnoMin: 149 * 60 }, LIMITES_OMISSAO);
    expect(r.acimaDoLimiteMin).toBe(60);
    expect(r.normaisMin).toBe(60);
  });
  it("o ponto de alerta é inclusivo (120 h exactas)", () => {
    expect(avaliarLimites(120, { jaNoDiaMin: 0, jaNoAnoMin: 119 * 60 }, LIMITES_OMISSAO).alertaAno).toBe(true);
  });
  it("o saldo anual ignora rejeitadas e outras pessoas", () => {
    const horas = [hora({ minutos: 600 }), hora({ id: "h2", minutos: 300, estado: "rejeitada" }), hora({ id: "h3", pessoaId: "p2", minutos: 900 })];
    const s = saldoDeLimites(horas, "p1", 2026, LIMITES_OMISSAO);
    expect(s.anoMin).toBe(600);
    expect(s.restanteMin).toBe(9000 - 600);
    expect(s.emAlerta).toBe(false);
  });
});

describe("estado e decisão do RH", () => {
  it("pendente marcada aparece como «acima do limite»", () => {
    expect(estadoVisivel(hora({ acimaDoLimite: true }))).toBe("acima_limite");
    expect(estadoVisivel(hora({ acimaDoLimite: true, estado: "confirmada" }))).toBe("confirmada");
    expect(estadoVisivel(hora())).toBe("pendente");
  });
  it("confirmar normal não exige motivo", () => {
    const r = decidirHoraExtra(hora(), "confirmar", "", "RH");
    expect(r.ok && r.hora.estado).toBe("confirmada");
  });
  it("rejeitar exige motivo de 3 caracteres ou mais", () => {
    expect(decidirHoraExtra(hora(), "rejeitar", "ab", "RH")).toEqual({ ok: false, erro: "motivo_obrigatorio" });
    expect(decidirHoraExtra(hora(), "rejeitar", "  ab ", "RH")).toEqual({ ok: false, erro: "motivo_obrigatorio" });
    const r = decidirHoraExtra(hora(), "rejeitar", "não feita", "RH");
    expect(r.ok && r.hora.estado).toBe("rejeitada");
  });
  it("confirmar acima do limite exige motivo e fica marcada", () => {
    expect(decidirHoraExtra(hora({ acimaDoLimite: true }), "confirmar", "", "RH").ok).toBe(false);
    const r = decidirHoraExtra(hora({ acimaDoLimite: true }), "confirmar", "pico de vendas", "RH");
    expect(r.ok && r.hora.acimaDoLimite).toBe(true);
  });
  it("não decide duas vezes nem muta o original", () => {
    const original = hora();
    decidirHoraExtra(original, "confirmar", "", "RH");
    expect(original.estado).toBe("pendente");
    expect(decidirHoraExtra(hora({ estado: "confirmada" }), "rejeitar", "xxxx", "RH")).toEqual({ ok: false, erro: "ja_decidida" });
  });
});

describe("pagamento das horas extra confirmadas", () => {
  const conf = (p: Partial<HoraExtra>) => hora({ estado: "confirmada", ...p });
  const total = (linhas: { valor: number }[]) => linhas.reduce((s, l) => s + l.valor, 0);
  it("Ana: 1 h 30 = 1.ª hora a 125 % + meia hora a 150 % = 12,50", () => {
    const linhas = pagamentoHorasExtra([conf({ minutos: 90 })], 6.25);
    expect(total(linhas)).toBeCloseTo(12.5, 6);
    expect(linhas.map((l) => l.codigo)).toEqual(["primeira_hora", "seguintes"]);
  });
  it("Bruno: feriado 8 h + extra 1 h 10 + nocturno 1 h 40 = 111,9792", () => {
    const linhas = pagamentoHorasExtra(
      [conf({ id: "a", origem: "feriado", minutos: 480 }), conf({ id: "b", minutos: 70, nocturnoMin: 100 })],
      6.25,
    );
    expect(total(linhas)).toBeCloseTo(111.9792, 3);
  });
  it("Carla: descanso 2 h a 150 % com valor da hora 8,3333 = 25", () => {
    expect(total(pagamentoHorasExtra([conf({ origem: "descanso", minutos: 120 })], 1400 / 168))).toBeCloseTo(25, 6);
  });
  it("só as confirmadas pagam; sem valor da hora não gera valor", () => {
    expect(pagamentoHorasExtra([hora(), hora({ estado: "rejeitada" })], 6.25)).toEqual([]);
    expect(total(pagamentoHorasExtra([conf({ minutos: 90 })], null))).toBe(0);
  });
  it("cada registo tem a sua primeira hora", () => {
    const linhas = pagamentoHorasExtra([conf({ id: "a", minutos: 60 }), conf({ id: "b", minutos: 60 })], 10);
    expect(linhas).toEqual([{ codigo: "primeira_hora", minutos: 120, pct: 125, valor: 25 }]);
  });
});
