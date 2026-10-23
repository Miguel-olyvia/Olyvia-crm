import { describe, expect, it } from "vitest";
import {
  LIMITES_BANCO_OMISSAO,
  creditosComRestante,
  diasEntre,
  formatarMinutos,
  saldoDoBanco,
  somarMeses,
  validarMovimento,
  valorEmEuros,
  type MovimentoBanco,
} from "./bancoHorasRegras";

const mov = (id: string, data: string, minutos: number, pessoaId = "p1"): MovimentoBanco => ({
  id, pessoaId, data, minutos, motivo: "x", origem: "automatico",
});

describe("datas do banco", () => {
  it("soma 12 meses e encosta ao fim do mês", () => {
    expect(somarMeses("2026-03-15", 12)).toBe("2027-03-15");
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2024-02-29", 12)).toBe("2025-02-28");
    expect(somarMeses("2026-11-10", 3)).toBe("2027-02-10");
  });
  it("conta dias entre datas", () => {
    expect(diasEntre("2026-01-01", "2026-01-31")).toBe(30);
    expect(diasEntre("2026-02-01", "2026-01-01")).toBe(-31);
  });
});

describe("saldo e euros", () => {
  it("semana da Eva: +10 +1 −1 −8 +1 = 3 h", () => {
    const movs = [mov("a", "2026-01-01", 600), mov("b", "2026-11-02", 60), mov("c", "2026-11-04", -60), mov("d", "2026-11-05", -480), mov("e", "2026-11-06", 60), mov("z", "2026-11-06", 999, "p2")];
    expect(saldoDoBanco(movs, "p1")).toBe(180);
  });
  it("valor em euros ao valor da hora, ou null sem valor", () => {
    expect(valorEmEuros(180, 6)).toBe(18);
    expect(valorEmEuros(-90, 8)).toBe(-12);
    expect(valorEmEuros(60, null)).toBeNull();
  });
  it("formata minutos com sinal", () => {
    expect(formatarMinutos(90)).toBe("+1 h 30");
    expect(formatarMinutos(-480)).toBe("−8 h");
    expect(formatarMinutos(0)).toBe("0 h");
    expect(formatarMinutos(45)).toBe("+45 min");
  });
});

describe("validade de 12 meses e aviso 30 dias antes", () => {
  const hoje = "2026-10-14";
  it("classifica válido, a expirar e expirado", () => {
    const movs = [mov("a", "2025-09-20", 120), mov("b", "2025-10-30", 60), mov("c", "2026-06-01", 30), mov("d", "2025-08-01", 45)];
    const r = creditosComRestante(movs, "p1", hoje);
    const por = Object.fromEntries(r.map((c) => [c.movimentoId, c.estado]));
    expect(por).toEqual({ d: "expirado", a: "expirado", b: "a_expirar", c: "valido" });
  });
  it("o limite dos 30 dias é inclusivo e 31 dias ainda é válido", () => {
    expect(creditosComRestante([mov("a", "2025-11-13", 60)], "p1", hoje)[0].estado).toBe("a_expirar");
    expect(creditosComRestante([mov("a", "2025-11-14", 60)], "p1", hoje)[0].estado).toBe("valido");
  });
  it("os débitos gastam primeiro o crédito mais antigo (FIFO)", () => {
    const movs = [mov("a", "2025-10-20", 120), mov("b", "2026-05-01", 120), mov("c", "2026-06-01", -150)];
    const r = creditosComRestante(movs, "p1", hoje);
    expect(r).toHaveLength(1);
    expect(r[0].movimentoId).toBe("b");
    expect(r[0].restanteMin).toBe(90);
  });
  it("sem créditos ou tudo gasto não devolve nada", () => {
    expect(creditosComRestante([], "p1", hoje)).toEqual([]);
    expect(creditosComRestante([mov("a", "2026-05-01", 60), mov("b", "2026-05-02", -60)], "p1", hoje)).toEqual([]);
  });
});

describe("crédito e débito manual", () => {
  const l = LIMITES_BANCO_OMISSAO;
  it("aceita dentro dos limites", () => {
    expect(validarMovimento(0, 60, "acerto", l)).toEqual({ ok: true, novoSaldoMin: 60 });
    expect(validarMovimento(0, -60, "folga", l)).toEqual({ ok: true, novoSaldoMin: -60 });
  });
  it("exige motivo de pelo menos 3 caracteres", () => {
    expect(validarMovimento(0, 60, "  a ", l)).toEqual({ ok: false, erro: "motivo_obrigatorio" });
  });
  it("recusa zero e fracções", () => {
    expect(validarMovimento(0, 0, "acerto", l)).toEqual({ ok: false, erro: "minutos_invalidos" });
    expect(validarMovimento(0, 1.5, "acerto", l)).toEqual({ ok: false, erro: "minutos_invalidos" });
  });
  it("respeita o máximo positivo e negativo (inclusivos)", () => {
    expect(validarMovimento(l.maxPositivoMin - 60, 60, "acerto", l).ok).toBe(true);
    expect(validarMovimento(l.maxPositivoMin - 60, 61, "acerto", l)).toEqual({ ok: false, erro: "acima_maximo" });
    expect(validarMovimento(-l.maxNegativoMin + 60, -60, "acerto", l).ok).toBe(true);
    expect(validarMovimento(-l.maxNegativoMin + 60, -61, "acerto", l)).toEqual({ ok: false, erro: "abaixo_minimo" });
  });
});
