// 20/11 (auditoria de 19/11): a decisão de qual é O botão principal da Visita, à parte do ecrã, e o que as peças dizem umas às outras.
import { describe, expect, it } from "vitest";
import { principalDaVisita, type EstadoVisita } from "./principalDaVisita";

const e = (x: Partial<EstadoVisita>): EstadoVisita => ({ gravacao: "livre", gravada: false, porConfirmar: false, passo: "outro", ...x });

describe("principalDaVisita", () => {
  it("antes da visita (nada gravado): gravar, em qualquer passo menos o fim", () => {
    expect(principalDaVisita(e({}))).toBe("gravar");
    expect(principalDaVisita(e({ passo: "estudio" }))).toBe("gravar");
    expect(principalDaVisita(e({ passo: "fim" }))).toBe("fechar");
  });
  it("a gravar: o Estúdio no passo do Estúdio; terminar nos outros (também no fim)", () => {
    expect(principalDaVisita(e({ gravacao: "a_gravar", passo: "estudio" }))).toBe("estudio");
    expect(principalDaVisita(e({ gravacao: "a_gravar" }))).toBe("terminar");
    expect(principalDaVisita(e({ gravacao: "a_gravar", passo: "fim" }))).toBe("terminar");
    // os campos por confirmar esperam pelo fim da gravação
    expect(principalDaVisita(e({ gravacao: "a_gravar", porConfirmar: true }))).toBe("terminar");
  });
  it("parada a meio: retomar, em qualquer passo", () => {
    for (const passo of ["outro", "estudio", "fim"] as const) expect(principalDaVisita(e({ gravacao: "interrompida", passo }))).toBe("retomar");
  });
  it("campos ou planta por confirmar: confirmar (antes de fechar)", () => {
    expect(principalDaVisita(e({ gravada: true, porConfirmar: true, passo: "fim" }))).toBe("confirmar");
    expect(principalDaVisita(e({ gravada: true, porConfirmar: true }))).toBe("confirmar");
  });
  it("já gravada: continuar nos passos, o Estúdio no passo dele, fechar no fim", () => {
    expect(principalDaVisita(e({ gravada: true }))).toBe("continuar");
    expect(principalDaVisita(e({ gravada: true, passo: "estudio" }))).toBe("estudio");
    expect(principalDaVisita(e({ gravada: true, passo: "fim" }))).toBe("fechar");
  });
  it("a transcrever ou outro negócio a gravar: o passo decide (o gravar não está disponível)", () => {
    expect(principalDaVisita(e({ gravacao: "outro" }))).toBe("continuar");
    expect(principalDaVisita(e({ gravacao: "outro", passo: "estudio" }))).toBe("estudio");
    expect(principalDaVisita(e({ gravacao: "outro", passo: "fim" }))).toBe("fechar");
  });
});
