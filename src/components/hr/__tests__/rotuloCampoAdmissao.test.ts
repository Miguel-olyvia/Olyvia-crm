/**
 * Um codigo de campo que o servidor devolve e o cliente ainda nao conhece nao
 * pode aparecer como chave de traducao crua no ecra.
 */
import { describe, it, expect } from "vitest";
import { rotuloDeCampoAdmissao } from "@/components/hr/rotuloCampoAdmissao";

const TEXTOS: Record<string, string> = {
  "hr.pendencias.campo.cargo": "Cargo",
  "hr.pendencias.campo.desconhecido": "Campo por identificar",
};

/** Como o `useTranslation` real: sem traducao, devolve a propria chave. */
const t = (chave: string) => TEXTOS[chave] ?? chave;

describe("rotuloDeCampoAdmissao", () => {
  it("um codigo conhecido da o seu nome", () => {
    expect(rotuloDeCampoAdmissao(t, "cargo")).toBe("Cargo");
  });

  it("um codigo fora do catalogo cai no texto generico, nunca na chave crua", () => {
    const texto = rotuloDeCampoAdmissao(t, "campo_novo_do_servidor");
    expect(texto).toBe("Campo por identificar");
    expect(texto).not.toContain("hr.pendencias.campo.");
  });

  it("um codigo vazio tambem nao mostra a chave", () => {
    expect(rotuloDeCampoAdmissao(t, "")).toBe("Campo por identificar");
  });
});
