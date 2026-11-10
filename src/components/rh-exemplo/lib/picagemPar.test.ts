// Lancar a ENTRADA e a SAIDA de uma vez: a validacao e os momentos que se gravam. Funcoes puras.
import { describe, expect, it } from "vitest";
import { momentosDoPar, saidaPrecisaDeDiaSeguinte } from "@/components/rh-exemplo/lib/picagemPar";

const base = { dia: "2026-10-06", horaEntrada: "09:00", horaSaida: "13:00", saidaNoDiaSeguinte: false };

describe("momentosDoPar", () => {
  it("devolve a entrada e a saida do mesmo dia, por ordem", () => {
    const r = momentosDoPar(base);
    expect(r).toEqual({
      ok: true,
      valor: { entrada: new Date("2026-10-06T09:00:00").toISOString(), saida: new Date("2026-10-06T13:00:00").toISOString() },
    });
  });

  it("recusa a falta de data, de entrada ou de saida, com a mensagem do campo em falta", () => {
    expect(momentosDoPar({ ...base, dia: "" })).toEqual({ ok: false, erro: "hr.assiduidade.erro.semData" });
    expect(momentosDoPar({ ...base, horaEntrada: "" })).toEqual({ ok: false, erro: "rhExemplo.pic.par.erro.semEntrada" });
    expect(momentosDoPar({ ...base, horaSaida: "" })).toEqual({ ok: false, erro: "rhExemplo.pic.par.erro.semSaida" });
  });

  it("recusa uma saida igual ou anterior a entrada quando nao e no dia seguinte", () => {
    expect(momentosDoPar({ ...base, horaSaida: "09:00" })).toEqual({ ok: false, erro: "rhExemplo.pic.par.erro.saidaNaoPosterior" });
    expect(momentosDoPar({ ...base, horaSaida: "08:59" })).toEqual({ ok: false, erro: "rhExemplo.pic.par.erro.saidaNaoPosterior" });
  });

  it("com «saida no dia seguinte» a saida cai no dia a seguir, tambem na passagem de mes e de ano", () => {
    const r = momentosDoPar({ ...base, dia: "2026-12-31", horaEntrada: "22:00", horaSaida: "06:00", saidaNoDiaSeguinte: true });
    expect(r).toEqual({
      ok: true,
      valor: { entrada: new Date("2026-12-31T22:00:00").toISOString(), saida: new Date("2027-01-01T06:00:00").toISOString() },
    });
  });

  it("a caixa so conta quando a saida e mesmo menor que a entrada", () => {
    const r = momentosDoPar({ ...base, saidaNoDiaSeguinte: true });
    expect(r).toEqual({
      ok: true,
      valor: { entrada: new Date("2026-10-06T09:00:00").toISOString(), saida: new Date("2026-10-06T13:00:00").toISOString() },
    });
  });
});

describe("saidaPrecisaDeDiaSeguinte", () => {
  it("so quando as duas horas estao preenchidas e a saida e menor que a entrada", () => {
    expect(saidaPrecisaDeDiaSeguinte("22:00", "06:00")).toBe(true);
    expect(saidaPrecisaDeDiaSeguinte("09:00", "13:00")).toBe(false);
    expect(saidaPrecisaDeDiaSeguinte("09:00", "09:00")).toBe(false);
    expect(saidaPrecisaDeDiaSeguinte("", "06:00")).toBe(false);
    expect(saidaPrecisaDeDiaSeguinte("22:00", "")).toBe(false);
  });
});
