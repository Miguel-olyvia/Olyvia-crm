import { describe, expect, it } from "vitest";
import { negocioMetasQuadroTranslations } from "@/translations/negocioMetasQuadro";
import { precisaTratar, rotuloPrazo, saudeDoNegocio, type Traduzir } from "./saudeNegocio";
import type { NegocioMes } from "./negocioMetas";

const HOJE = "2026-10-13";

const negocio = (extra: Partial<NegocioMes> = {}): NegocioMes => ({
  id: "x", pessoaId: "p-x", pessoa: "P", servico: "S", comercial: "C", dias: 5, parado: null,
  proximoPrazo: null, contacto: { telefone: null, email: null },
  orcamentos: [{ id: "x-o1", valor: 1000, escolhido: true }],
  proposta: { estado: "enviada" }, contrato: null,
  ...extra,
});
const semEscolhido = { orcamentos: [{ id: "x-o1", valor: 1000, escolhido: false }], proposta: null };
const ganho = { proposta: { estado: "aceite" as const }, contrato: { estado: "assinado" as const } };

describe("saudeDoNegocio", () => {
  it("atraso: o prazo já passou", () => {
    expect(saudeDoNegocio(negocio({ proximoPrazo: "2026-10-12" }), HOJE)).toBe("atraso");
  });
  it("atraso ganha ao parado e ao sem orçamento", () => {
    expect(saudeDoNegocio(negocio({ proximoPrazo: "2026-10-01", parado: 20 }), HOJE)).toBe("atraso");
    expect(saudeDoNegocio(negocio({ ...semEscolhido, proximoPrazo: "2026-10-01" }), HOJE)).toBe("atraso");
  });
  it("parado: mais de 7 dias (7 ainda não)", () => {
    expect(saudeDoNegocio(negocio({ parado: 8, proximoPrazo: "2026-10-30" }), HOJE)).toBe("parado");
    expect(saudeDoNegocio(negocio({ parado: 7, proximoPrazo: "2026-10-30" }), HOJE)).toBe("emDia");
  });
  it("parado ganha ao sem orçamento e ao urgente", () => {
    expect(saudeDoNegocio(negocio({ ...semEscolhido, parado: 9 }), HOJE)).toBe("parado");
    expect(saudeDoNegocio(negocio({ parado: 9, proximoPrazo: HOJE }), HOJE)).toBe("parado");
  });
  it("sem orçamento escolhido só conta na fase Orçamento", () => {
    expect(saudeDoNegocio(negocio({ ...semEscolhido, parado: 3 }), HOJE)).toBe("semOrcamento");
    expect(saudeDoNegocio(negocio({ ...semEscolhido, proposta: { estado: "rascunho" } }), HOJE)).toBe("emDia");
  });
  it("sem orçamento ganha ao urgente", () => {
    expect(saudeDoNegocio(negocio({ ...semEscolhido, proximoPrazo: HOJE }), HOJE)).toBe("semOrcamento");
  });
  it("urgente: prazo hoje ou amanhã", () => {
    expect(saudeDoNegocio(negocio({ proximoPrazo: "2026-10-13" }), HOJE)).toBe("urgente");
    expect(saudeDoNegocio(negocio({ proximoPrazo: "2026-10-14" }), HOJE)).toBe("urgente");
    expect(saudeDoNegocio(negocio({ proximoPrazo: "2026-10-15" }), HOJE)).toBe("emDia");
  });
  it("em dia: prazo futuro ou sem prazo", () => {
    expect(saudeDoNegocio(negocio({ proximoPrazo: "2026-10-20" }), HOJE)).toBe("emDia");
    expect(saudeDoNegocio(negocio(), HOJE)).toBe("emDia");
  });
  it("ganho: contrato assinado sem nada a tratar", () => {
    expect(saudeDoNegocio(negocio(ganho), HOJE)).toBe("ganho");
  });
  it("um ganho mostra só Ganho, mesmo com prazo passado, hoje ou amanhã, ou parado", () => {
    for (const proximoPrazo of ["2026-10-10", HOJE, "2026-10-14"]) {
      expect(saudeDoNegocio(negocio({ ...ganho, proximoPrazo, parado: 20 }), HOJE)).toBe("ganho");
    }
  });
  it("depende só do dia recebido, nunca do relógio", () => {
    const n = negocio({ proximoPrazo: "2026-10-13" });
    expect(saudeDoNegocio(n, "2026-10-12")).toBe("urgente");
    expect(saudeDoNegocio(n, "2026-10-14")).toBe("atraso");
    expect(saudeDoNegocio(n, "2026-10-01")).toBe("emDia");
  });
});

describe("precisaTratar (Para tratar)", () => {
  it("é atraso OU parado OU prazo hoje", () => {
    expect(precisaTratar(negocio({ proximoPrazo: "2026-10-12" }), HOJE)).toBe(true);
    expect(precisaTratar(negocio({ parado: 8 }), HOJE)).toBe(true);
    expect(precisaTratar(negocio({ proximoPrazo: HOJE }), HOJE)).toBe(true);
  });
  it("amanhã, em dia, sem orçamento e ganho não entram", () => {
    expect(precisaTratar(negocio({ proximoPrazo: "2026-10-14" }), HOJE)).toBe(false);
    expect(precisaTratar(negocio({ parado: 7, proximoPrazo: "2026-10-20" }), HOJE)).toBe(false);
    expect(precisaTratar(negocio(semEscolhido), HOJE)).toBe(false);
    expect(precisaTratar(negocio(ganho), HOJE)).toBe(false);
  });
  it("um ganho nunca precisa de tratamento, nem em atraso nem com prazo hoje", () => {
    expect(precisaTratar(negocio({ ...ganho, proximoPrazo: "2026-10-01" }), HOJE)).toBe(false);
    expect(precisaTratar(negocio({ ...ganho, proximoPrazo: HOJE }), HOJE)).toBe(false);
  });
});

describe("rotuloPrazo", () => {
  it("hoje e amanhã", () => {
    expect(rotuloPrazo("2026-10-13", HOJE)).toBe("Hoje");
    expect(rotuloPrazo("2026-10-14", HOJE)).toBe("Amanhã");
  });
  it("futuro: dias e dia da semana", () => {
    expect(rotuloPrazo("2026-10-16", HOJE)).toBe("Em 3 d · sex 16/10");
  });
  it("passado: dias de atraso e dia da semana", () => {
    expect(rotuloPrazo("2026-10-12", HOJE)).toBe("Atrasado 1 d · seg 12/10");
    expect(rotuloPrazo("2026-10-11", HOJE)).toBe("Atrasado 2 d · dom 11/10");
  });
  it("sem prazo devolve null", () => {
    expect(rotuloPrazo(null, HOJE)).toBeNull();
  });
  it("atravessa o fim do mês e do ano", () => {
    expect(rotuloPrazo("2026-11-02", "2026-10-30")).toBe("Em 3 d · seg 02/11");
    expect(rotuloPrazo("2027-01-02", "2026-12-31")).toBe("Em 2 d · sáb 02/01");
    expect(rotuloPrazo("2026-03-01", "2026-02-28")).toBe("Amanhã");
    expect(rotuloPrazo("2026-02-27", "2026-03-01")).toBe("Atrasado 2 d · sex 27/02");
  });
  it("em inglês, com o tradutor da língua", () => {
    const en: Traduzir = (chave, params) =>
      Object.entries(params ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), negocioMetasQuadroTranslations.en[chave] ?? chave);
    expect(rotuloPrazo("2026-10-16", HOJE, en)).toBe("In 3 d · Fri 16/10");
    expect(rotuloPrazo("2026-10-11", HOJE, en)).toBe("Overdue 2 d · Sun 11/10");
    expect(rotuloPrazo("2026-10-14", HOJE, en)).toBe("Tomorrow");
  });
  it("com dias por extenso, no singular quando é 1", () => {
    expect(rotuloPrazo("2026-10-16", HOJE, undefined, true)).toBe("Dentro de 3 dias, sex 16/10");
    expect(rotuloPrazo("2026-10-12", HOJE, undefined, true)).toBe("Atrasado 1 dia, seg 12/10");
    expect(rotuloPrazo("2026-10-11", HOJE, undefined, true)).toBe("Atrasado 2 dias, dom 11/10");
  });
});
