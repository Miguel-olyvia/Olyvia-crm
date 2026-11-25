import { describe, expect, it } from "vitest";
import { anoDoDocumento, numeroDaProposta, numeroDaPropostaDoNegocio, numeroDoContrato, numeroDoContratoDoNegocio, versaoDaProposta } from "./numeroDocumento";

const HOJE = new Date(2026, 10, 23);

describe("numeroDaProposta", () => {
  it("com negócio: PR <ano>/<n.º do negócio>, o ano da criação do documento", () => {
    expect(numeroDaProposta({ numeroNegocio: 1031, criadoEm: "2026-10-30T10:00:00Z", guardado: "P-2026-0035" })).toBe("PR 2026/1031");
    expect(numeroDaProposta({ numeroNegocio: 1031, criadoEm: "2027-01-02T00:30:00+00:00", guardado: "P-2027-0001" })).toBe("PR 2027/1031");
  });
  it("versão 1 sem sufixo; versão 2 ou mais com « · vN» (como a Emylia)", () => {
    expect(numeroDaProposta({ numeroNegocio: 1031, versao: 1, criadoEm: "2026-10-30" })).toBe("PR 2026/1031");
    expect(numeroDaProposta({ numeroNegocio: 1031, versao: 2, criadoEm: "2026-10-30" })).toBe("PR 2026/1031 · v2");
    expect(numeroDaProposta({ numeroNegocio: 1031, versao: 3, criadoEm: "2026-10-30" })).toBe("PR 2026/1031 · v3");
  });
  it("sem negócio: o número guardado, como hoje (vazio se não houver)", () => {
    expect(numeroDaProposta({ numeroNegocio: null, criadoEm: "2026-10-30", guardado: "P-2026-0035" })).toBe("P-2026-0035");
    expect(numeroDaProposta({ guardado: null })).toBe("");
  });
  it("sem data: o ano de hoje", () => {
    expect(numeroDaProposta({ numeroNegocio: 7, criadoEm: null }, HOJE)).toBe("PR 2026/7");
    expect(numeroDaProposta({ numeroNegocio: 7, criadoEm: "lixo" }, new Date(2027, 0, 1))).toBe("PR 2027/7");
  });
  it("aceita um Date como data de criação", () => {
    expect(numeroDaProposta({ numeroNegocio: 7, criadoEm: new Date(2028, 5, 1) })).toBe("PR 2028/7");
  });
});

describe("numeroDoContrato", () => {
  it("com negócio: CT <ano>/<n.º do negócio>, sem versão", () => {
    expect(numeroDoContrato({ numeroNegocio: 1049, criadoEm: "2026-11-02T09:00:00Z", guardado: "CC-2026-0049" })).toBe("CT 2026/1049");
    expect(numeroDoContrato({ numeroNegocio: 1049, versao: 3, criadoEm: "2027-02-02" })).toBe("CT 2027/1049");
  });
  it("sem negócio: o número guardado", () => {
    expect(numeroDoContrato({ guardado: "CC-2026-0049" })).toBe("CC-2026-0049");
    expect(numeroDoContrato({})).toBe("");
  });
});

describe("a partir do negócio da Emylia", () => {
  const d = (versoes: number) => ({ id: 1031, orc: versoes ? { versoes: Array.from({ length: versoes }, () => ({})) } : {} });
  it("a versão é o número de versões antigas mais um", () => {
    expect(versaoDaProposta(d(0))).toBe(1);
    expect(versaoDaProposta(d(1))).toBe(2);
    expect(versaoDaProposta({ id: 1, orc: null })).toBe(1);
  });
  it("igual ao que a Emylia escrevia em 2026 (PR 2026/<id> · vN e CT 2026/<id>)", () => {
    expect(numeroDaPropostaDoNegocio(d(0), null, HOJE)).toBe("PR 2026/1031");
    expect(numeroDaPropostaDoNegocio(d(1), null, HOJE)).toBe("PR 2026/1031 · v2");
    expect(numeroDoContratoDoNegocio(d(1), null, HOJE)).toBe("CT 2026/1031");
  });
  it("o ano segue a data de criação quando se sabe", () => {
    expect(numeroDaPropostaDoNegocio(d(0), "2027-03-01")).toBe("PR 2027/1031");
    expect(numeroDoContratoDoNegocio(d(0), "2027-03-01")).toBe("CT 2027/1031");
  });
});

describe("anoDoDocumento", () => {
  it("lê o ano do texto ISO sem passar pelo fuso horário", () => {
    expect(anoDoDocumento("2026-12-31T23:59:59-05:00")).toBe(2026);
    expect(anoDoDocumento("2027-01-01T00:00:00+14:00")).toBe(2027);
  });
});
