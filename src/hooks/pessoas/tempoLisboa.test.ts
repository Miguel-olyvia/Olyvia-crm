import { describe, expect, it } from "vitest";
import {
  diaLisboa, diasEntre, horaDoProximoContacto, horaLisboa, hojeLisboa, inicioDoDiaLisboa, instanteLisboa,
} from "./tempoLisboa";

describe("diaLisboa e horaLisboa", () => {
  it("em verão (UTC+1) perto da meia-noite UTC já é o dia seguinte", () => {
    expect(diaLisboa("2026-07-01T23:30:00Z")).toBe("2026-07-02");
    expect(horaLisboa("2026-07-01T23:30:00Z")).toBe("00:30");
  });

  it("em inverno (UTC+0) o dia e a hora coincidem com os de UTC", () => {
    expect(diaLisboa("2026-01-15T23:30:00Z")).toBe("2026-01-15");
    expect(horaLisboa("2026-01-15T23:30:00Z")).toBe("23:30");
  });

  it("passagem para a hora de verão (29/03/2026, 01:00 UTC)", () => {
    expect(horaLisboa("2026-03-29T00:59:00Z")).toBe("00:59");
    expect(horaLisboa("2026-03-29T01:00:00Z")).toBe("02:00");
    expect(diaLisboa("2026-03-28T23:30:00Z")).toBe("2026-03-28");
  });

  it("passagem para a hora de inverno (25/10/2026, 01:00 UTC)", () => {
    expect(horaLisboa("2026-10-25T00:30:00Z")).toBe("01:30");
    expect(horaLisboa("2026-10-25T01:30:00Z")).toBe("01:30");
    expect(diaLisboa("2026-10-24T23:30:00Z")).toBe("2026-10-25");
  });

  it("nunca devolve 24:00 e devolve null para o que não é data", () => {
    expect(horaLisboa("2026-01-15T00:00:00Z")).toBe("00:00");
    expect(diaLisboa("lixo")).toBeNull();
    expect(horaLisboa("")).toBeNull();
    expect(diaLisboa(null)).toBeNull();
    expect(horaLisboa(undefined)).toBeNull();
  });
});

describe("instanteLisboa e inicioDoDiaLisboa", () => {
  it("verão: 10:00 de Lisboa são 09:00 UTC; inverno: coincidem", () => {
    expect(instanteLisboa("2026-07-15", "10:00")).toBe("2026-07-15T09:00:00.000Z");
    expect(instanteLisboa("2026-01-15", "10:00")).toBe("2026-01-15T10:00:00.000Z");
  });

  it("dia da passagem de março: antes da mudança +0, depois +1", () => {
    expect(instanteLisboa("2026-03-29", "00:30")).toBe("2026-03-29T00:30:00.000Z");
    expect(instanteLisboa("2026-03-29", "12:00")).toBe("2026-03-29T11:00:00.000Z");
  });

  it("dia da passagem de outubro: antes da mudança +1, depois +0", () => {
    expect(instanteLisboa("2026-10-25", "00:30")).toBe("2026-10-24T23:30:00.000Z");
    expect(instanteLisboa("2026-10-25", "12:00")).toBe("2026-10-25T12:00:00.000Z");
  });

  it("o início do dia de Lisboa, nas duas passagens e em pleno verão", () => {
    expect(inicioDoDiaLisboa("2026-07-15")).toBe("2026-07-14T23:00:00.000Z");
    expect(inicioDoDiaLisboa("2026-03-29")).toBe("2026-03-29T00:00:00.000Z");
    expect(inicioDoDiaLisboa("2026-03-30")).toBe("2026-03-29T23:00:00.000Z");
    expect(inicioDoDiaLisboa("2026-10-25")).toBe("2026-10-24T23:00:00.000Z");
    expect(inicioDoDiaLisboa("2026-10-26")).toBe("2026-10-26T00:00:00.000Z");
  });

  it("ida e volta: o dia e a hora de Lisboa dão o mesmo instante (fora da hora repetida)", () => {
    const instantes = [
      "2026-01-15T09:15:00.000Z", "2026-03-29T00:59:00.000Z", "2026-03-29T01:00:00.000Z", "2026-07-01T23:30:00.000Z",
      "2026-10-24T23:30:00.000Z", "2026-10-25T01:30:00.000Z", "2026-12-31T23:59:00.000Z",
    ];
    for (const iso of instantes) {
      expect(instanteLisboa(diaLisboa(iso) as string, horaLisboa(iso) as string), iso).toBe(iso);
    }
  });

  it("devolve null para um dia ou uma hora que não existem", () => {
    expect(instanteLisboa("2026-02-30", "10:00")).toBeNull();
    expect(instanteLisboa("2026-07-15", "25:00")).toBeNull();
    expect(instanteLisboa("", "10:00")).toBeNull();
    expect(inicioDoDiaLisboa("amanhã")).toBeNull();
  });
});

describe("horaDoProximoContacto", () => {
  it("a meia-noite de Lisboa vale «sem hora»", () => {
    expect(horaDoProximoContacto("2026-07-14T23:00:00.000Z")).toBeUndefined();
    expect(horaDoProximoContacto("2026-01-15T00:00:00.000Z")).toBeUndefined();
  });

  it("outra hora mantém-se; sem instante, sem hora", () => {
    expect(horaDoProximoContacto("2026-07-15T09:00:00.000Z")).toBe("10:00");
    expect(horaDoProximoContacto(null)).toBeUndefined();
  });
});

describe("diasEntre e hojeLisboa", () => {
  it("conta dias de calendário de Lisboa, nunca abaixo de 0", () => {
    expect(diasEntre("2026-07-01T23:30:00Z", "2026-07-04")).toBe(2);
    expect(diasEntre("2026-07-10T09:00:00Z", "2026-07-04")).toBe(0);
    expect(diasEntre(null, "2026-07-04")).toBeNull();
  });

  it("hojeLisboa devolve o dia de Lisboa de um instante", () => {
    expect(hojeLisboa(new Date("2026-07-01T23:30:00Z"))).toBe("2026-07-02");
  });
});
