import { describe, expect, it } from "vitest";
import {
  chaveDeDesvios,
  contarDia,
  linhaDaChaveDeDesvios,
  margemDoDia,
  margemLigadaNoPeriodo,
  type DesvioLido,
  type EntradaContarDia,
  type VersaoMargem,
} from "@/lib/hr/desviosRelatorio";

const dia = (extra: Partial<EntradaContarDia> = {}): EntradaContarDia => ({
  estado: "normal",
  planeadoMinutos: 540,
  realizadoMinutos: 540,
  temFalta: false,
  planeadoIntervalos: [{ hora_inicio: "09:00", hora_fim: "18:00" }],
  realizadoIntervalos: [{ hora_inicio: "09:30", hora_fim: "18:30" }],
  margemMin: null,
  desvio: null,
  ...extra,
});

const linhaDesvio = (extra: Partial<DesvioLido> = {}): DesvioLido => ({
  id: "d1",
  estado: "a_validar",
  natureza: "tempo_a_menos",
  decisao: null,
  planeado_min: 540,
  realizado_min: 480,
  ...extra,
});

describe("margemDoDia", () => {
  const versoes: VersaoMargem[] = [
    { id: "a", margem_min: 10, valido_de: "2026-01-01", valido_ate: "2026-02-28", substituida_em: null },
    { id: "b", margem_min: 20, valido_de: "2026-03-01", valido_ate: null, substituida_em: null },
    { id: "c", margem_min: 99, valido_de: "2026-03-01", valido_ate: null, substituida_em: "2026-03-02T00:00:00Z" },
  ];
  it("escolhe a versao em vigor no dia, com valido_ate inclusivo", () => {
    expect(margemDoDia(versoes, "2026-02-28")).toBe(10);
    expect(margemDoDia(versoes, "2026-03-01")).toBe(20);
  });
  it("antes da primeira versao a funcionalidade esta desligada", () => {
    expect(margemDoDia(versoes, "2025-12-31")).toBeNull();
  });
  it("uma versao «sem margem» (null) desliga a funcionalidade a partir do seu inicio", () => {
    const comDesligada: VersaoMargem[] = [
      ...versoes.slice(0, 1),
      { id: "d", margem_min: null, valido_de: "2026-03-01", valido_ate: null, substituida_em: null },
    ];
    expect(margemDoDia(comDesligada, "2026-02-10")).toBe(10);
    expect(margemDoDia(comDesligada, "2026-03-10")).toBeNull();
  });
  it("ignora as versoes substituidas e a lista vazia", () => {
    expect(margemDoDia([versoes[2]], "2026-03-05")).toBeNull();
    expect(margemDoDia([], "2026-03-05")).toBeNull();
  });
});

describe("contarDia sem margem configurada (igual ao de hoje)", () => {
  it("9:30-18:30 contra 9:00-18:00: conta o realizado e nao ha extra", () => {
    const r = contarDia(dia());
    expect(r).toEqual({ contadoMinutos: 540, extraValidadoMinutos: 0, desvio: null });
  });
  it("o excesso sobre o planeado continua a ser hora extra em bruto", () => {
    const r = contarDia(dia({ realizadoMinutos: 600 }));
    expect(r).toEqual({ contadoMinutos: 600, extraValidadoMinutos: 60, desvio: null });
  });
  it("menos do que o planeado conta o realizado (defice como hoje)", () => {
    const r = contarDia(dia({ realizadoMinutos: 400 }));
    expect(r).toEqual({ contadoMinutos: 400, extraValidadoMinutos: 0, desvio: null });
  });
  it("feriado trabalhado (planeado 0): o realizado e o extra", () => {
    const r = contarDia(dia({ estado: "feriado", planeadoMinutos: 0, planeadoIntervalos: [], realizadoMinutos: 300 }));
    expect(r).toEqual({ contadoMinutos: 300, extraValidadoMinutos: 300, desvio: null });
  });
  it("ignora linhas de desvios sem margem", () => {
    const r = contarDia(dia({ realizadoMinutos: 400, desvio: linhaDesvio() }));
    expect(r).toEqual({ contadoMinutos: 400, extraValidadoMinutos: 0, desvio: null });
  });
});

describe("contarDia com margem", () => {
  it("SEM linha de desvios o dia conta como antes: o cliente nao mede desvios por conta propria", () => {
    // 10 h picadas contra 9 h planeadas, margem 10, sem linha na base: nada se inventa aqui (o fecho deteta e a releitura traz a linha).
    const r = contarDia(dia({ margemMin: 10, realizadoMinutos: 600 }));
    expect(r).toEqual({ contadoMinutos: 600, extraValidadoMinutos: 60, desvio: null });
  });
  it("9:30-18:30 com margem 10 e sem linha: conta o realizado, sem desvio inventado", () => {
    expect(contarDia(dia({ margemMin: 10 }))).toEqual({ contadoMinutos: 540, extraValidadoMinutos: 0, desvio: null });
  });
  it("hora extra por validar: conta provisoriamente o planeado, sem extra", () => {
    const r = contarDia(
      dia({
        margemMin: 10,
        realizadoMinutos: 600,
        realizadoIntervalos: [{ hora_inicio: "09:00", hora_fim: "19:00" }],
        desvio: linhaDesvio({ natureza: "hora_extra", planeado_min: 540, realizado_min: 600 }),
      }),
    );
    expect(r).toEqual({
      contadoMinutos: 540,
      extraValidadoMinutos: 0,
      desvio: { id: "d1", estado: "a_validar", decisao: "a_validar", natureza: "hora_extra" },
    });
  });
  it("validado como hora extra: conta o realizado e o excesso e extra validada", () => {
    const r = contarDia(
      dia({
        margemMin: 10,
        realizadoMinutos: 600,
        desvio: linhaDesvio({ estado: "validado", decisao: "hora_extra", natureza: "hora_extra", planeado_min: 540, realizado_min: 600 }),
      }),
    );
    expect(r.contadoMinutos).toBe(600);
    expect(r.extraValidadoMinutos).toBe(60);
    expect(r.desvio).toMatchObject({ estado: "validado", decisao: "hora_extra" });
  });
  it("validado como normal: conta o planeado", () => {
    const r = contarDia(dia({ margemMin: 10, realizadoMinutos: 480, desvio: linhaDesvio({ estado: "validado", decisao: "normal" }) }));
    expect(r.contadoMinutos).toBe(540);
    expect(r.extraValidadoMinutos).toBe(0);
  });
  it("aceitar o desvio: conta o realizado (o defice desconta) sem extra", () => {
    const r = contarDia(dia({ margemMin: 10, realizadoMinutos: 480, desvio: linhaDesvio({ estado: "validado", decisao: "aceitar_desvio" }) }));
    expect(r.contadoMinutos).toBe(480);
    expect(r.extraValidadoMinutos).toBe(0);
  });
  it("dia sem planeado (feriado, descanso) fica como hoje, mesmo com margem", () => {
    const r = contarDia(dia({ margemMin: 10, estado: "descanso", planeadoMinutos: 0, planeadoIntervalos: [], realizadoMinutos: 120 }));
    expect(r).toEqual({ contadoMinutos: 120, extraValidadoMinutos: 120, desvio: null });
  });
  it("dia sem realizado (falta) fica como hoje: conta 0", () => {
    const r = contarDia(dia({ margemMin: 10, realizadoMinutos: 0, realizadoIntervalos: [] }));
    expect(r).toEqual({ contadoMinutos: 0, extraValidadoMinutos: 0, desvio: null });
  });
  it("ausencia de dia inteiro nao se analisa", () => {
    const r = contarDia(dia({ margemMin: 10, estado: "ausencia", realizadoMinutos: 100 }));
    expect(r).toEqual({ contadoMinutos: 100, extraValidadoMinutos: 0, desvio: null });
  });
  it("com falta registada e sem linha de desvio conta como antes (extra = max(realizado - planeado, 0))", () => {
    expect(contarDia(dia({ margemMin: 10, temFalta: true, realizadoMinutos: 360 }))).toEqual({ contadoMinutos: 360, extraValidadoMinutos: 0, desvio: null });
    expect(contarDia(dia({ margemMin: 10, temFalta: true, realizadoMinutos: 600 }))).toEqual({ contadoMinutos: 600, extraValidadoMinutos: 60, desvio: null });
  });
  it("ponto de ligacao: horas extra aprovadas somam como extra validada (maximo com a decisao)", () => {
    const r = contarDia(dia({ margemMin: 10, realizadoMinutos: 600, extraAprovadoMin: 45, desvio: linhaDesvio({ natureza: "hora_extra", realizado_min: 600 }) }));
    expect(r.extraValidadoMinutos).toBe(45);
    expect(r.contadoMinutos).toBe(540 + 45);
  });
});

describe("margemLigadaNoPeriodo e chave de desvios", () => {
  const v = (margem: number | null, de: string, ate: string | null, substituida: string | null = null): VersaoMargem => ({ id: de, margem_min: margem, valido_de: de, valido_ate: ate, substituida_em: substituida });
  it("so conta uma versao com margem que cubra algum dia do periodo", () => {
    expect(margemLigadaNoPeriodo([v(10, "2026-01-01", null)], "2026-10-01", "2026-10-31")).toBe(true);
    expect(margemLigadaNoPeriodo([v(10, "2026-01-01", "2026-09-30")], "2026-10-01", "2026-10-31")).toBe(false);
    expect(margemLigadaNoPeriodo([v(10, "2026-11-01", null)], "2026-10-01", "2026-10-31")).toBe(false);
    expect(margemLigadaNoPeriodo([v(null, "2026-01-01", null)], "2026-10-01", "2026-10-31")).toBe(false);
    expect(margemLigadaNoPeriodo([v(10, "2026-01-01", null, "2026-02-01T00:00:00Z")], "2026-10-01", "2026-10-31")).toBe(false);
    expect(margemLigadaNoPeriodo([], "2026-10-01", "2026-10-31")).toBe(false);
  });
  it("a chave e independente da ordem e vazia sem desvios", () => {
    const a = linhaDaChaveDeDesvios("2026-10-01", "x", "a_validar", null);
    const b = linhaDaChaveDeDesvios("2026-10-02", "y", "validado", "normal");
    expect(chaveDeDesvios([a, b])).toBe(chaveDeDesvios([b, a]));
    expect(chaveDeDesvios([])).toBe("");
  });
});
