import { describe, expect, it } from "vitest";
import { dataDita, duracaoDita, interpretarFala, normalizar, resumoProposta } from "../voz";
import { rotuloMotivoAtraso } from "../atrasos";

// Terça-feira, 6 de outubro de 2026.
const HOJE = "2026-10-06";

describe("interpretarFala — intenções", () => {
  it("material em falta, com data: o fim passa para a data dita", () => {
    const p = interpretarFala("falta o sifão, só chega amanhã", { hoje: HOJE, fimAtual: HOJE });
    expect(p.intencao).toBe("atraso");
    expect(p.motivo).toBe("material_em_falta");
    expect(p.novoFim).toBe("2026-10-07");
    expect(p.texto).toBe("Falta o sifão, só chega amanhã");
    expect(p.porque.join(" ")).toContain("amanhã");
  });

  it("data antes do fim previsto: ouve-a, mas não mexe no fim", () => {
    const p = interpretarFala("o material só chega amanhã", { hoje: HOJE, fimAtual: "2026-10-12" });
    expect(p.intencao).toBe("atraso");
    expect(p.dataOuvida).toBe("2026-10-07");
    expect(p.novoFim).toBeNull();
  });

  it("secagem", () => {
    const p = interpretarFala("Ainda está húmido, não secou", { hoje: HOJE });
    expect(p.motivo).toBe("secagem");
  });

  it("acesso / cliente", () => {
    expect(interpretarFala("o cliente não estava em casa", { hoje: HOJE }).motivo).toBe("acesso_cliente");
  });

  it("equipa antes do material: 'o colega faltou'", () => {
    expect(interpretarFala("hoje o colega faltou", { hoje: HOJE }).motivo).toBe("equipa");
  });

  it("duração dita: mais 2 horas", () => {
    const p = interpretarFala("vai demorar mais 2 horas", { hoje: HOJE });
    expect(p.intencao).toBe("atraso");
    expect(p.motivo).toBe("outro");
    expect(p.quantidade).toBe(2);
    expect(p.unidade).toBe("horas");
  });

  it("mais um dia", () => {
    const p = interpretarFala("a cura precisa de mais um dia", { hoje: HOJE });
    expect(p.motivo).toBe("secagem");
    expect(p).toMatchObject({ quantidade: 1, unidade: "dias" });
  });

  it("terminei → feita", () => {
    expect(interpretarFala("Terminei", { hoje: HOJE }).intencao).toBe("feita");
    expect(interpretarFala("pronto, já está feito", { hoje: HOJE }).intencao).toBe("feita");
  });

  it("'não está feito' não é feita", () => {
    expect(interpretarFala("ainda não está feito", { hoje: HOJE }).intencao).toBe("nota");
  });

  it("qualquer outra coisa é nota", () => {
    const p = interpretarFala("azulejo assente na parede do duche", { hoje: HOJE });
    expect(p.intencao).toBe("nota");
    expect(p.motivo).toBeNull();
  });

  it("frase vazia é nota vazia", () => {
    expect(interpretarFala("   ", { hoje: HOJE })).toMatchObject({ intencao: "nota", texto: "" });
  });
});

describe("datas e durações ditas", () => {
  it("dias da semana — sempre para a frente", () => {
    expect(dataDita(normalizar("sexta"), HOJE)?.data).toBe("2026-10-09");
    expect(dataDita(normalizar("terça"), HOJE)?.data).toBe("2026-10-13");
  });
  it("depois de amanhã, daqui a N dias, para a semana", () => {
    expect(dataDita(normalizar("depois de amanhã"), HOJE)?.data).toBe("2026-10-08");
    expect(dataDita(normalizar("daqui a três dias"), HOJE)?.data).toBe("2026-10-09");
    expect(dataDita(normalizar("só para a semana"), HOJE)?.data).toBe("2026-10-12");
  });
  it("dia N, N de mês, N/M", () => {
    expect(dataDita(normalizar("dia 14"), HOJE)?.data).toBe("2026-10-14");
    expect(dataDita(normalizar("dia 2"), HOJE)?.data).toBe("2026-11-02");
    expect(dataDita(normalizar("20 de março"), HOJE)?.data).toBe("2027-03-20");
    expect(dataDita(normalizar("15/10"), HOJE)?.data).toBe("2026-10-15");
  });
  it("durações", () => {
    expect(duracaoDita(normalizar("meio dia"))).toMatchObject({ quantidade: 0.5, unidade: "dias" });
    expect(duracaoDita(normalizar("mais 3 dias"))).toMatchObject({ quantidade: 3, unidade: "dias" });
    expect(duracaoDita(normalizar("daqui a 3 dias"))).toBeNull();
  });
});

describe("resumoProposta", () => {
  it("diz o que se vai fazer", () => {
    const p = interpretarFala("falta material, só chega dia 14", { hoje: HOJE, fimAtual: HOJE });
    expect(resumoProposta(p, rotuloMotivoAtraso)).toBe("Registar um atraso — Material em falta · novo fim a 14/10.");
  });
});
