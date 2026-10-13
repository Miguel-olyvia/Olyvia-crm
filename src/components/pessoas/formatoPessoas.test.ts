import { describe, expect, it } from "vitest";
import { pessoasPaginaTranslations } from "@/translations/pessoasPagina";
import { faixaSaude, textoDataCompleta, textoHaQuanto, textoPrazoPasso } from "./formatoPessoas";

const textos = pessoasPaginaTranslations.pt;
const t = (chave: string, params?: Record<string, string | number>) =>
  Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[chave] ?? chave);
const HOJE = "2026-10-13";

describe("textoDataCompleta", () => {
  it("hoje e ontem por extenso, e as outras com dia, mês, ano e hora", () => {
    expect(textoDataCompleta(t, "2026-10-13T09:15", HOJE)).toBe("hoje às 09:15");
    expect(textoDataCompleta(t, "2026-10-12T18:40", HOJE)).toBe("ontem às 18:40");
    expect(textoDataCompleta(t, "2026-10-09T14:50", HOJE)).toBe("09/10/2026 às 14:50");
    expect(textoDataCompleta(t, "2025-12-31T23:59", HOJE)).toBe("31/12/2025 às 23:59");
  });
});

describe("textoHaQuanto", () => {
  it("hoje, há 1 dia e há N dias", () => {
    expect(textoHaQuanto(t, "2026-10-13T09:15", HOJE)).toBe("hoje");
    expect(textoHaQuanto(t, "2026-10-12T18:40", HOJE)).toBe("há 1 dia");
    expect(textoHaQuanto(t, "2026-10-09T14:50", HOJE)).toBe("há 4 dias");
  });
});

describe("textoPrazoPasso", () => {
  it("futuro, hoje e ultrapassado; sem prazo, null", () => {
    expect(textoPrazoPasso(t, "2026-10-16", HOJE)).toBe("Até 16/10");
    expect(textoPrazoPasso(t, "2026-10-13", HOJE)).toBe("Até 13/10 · hoje");
    expect(textoPrazoPasso(t, "2026-10-03", HOJE)).toBe("Prazo ultrapassado (era 03/10)");
    expect(textoPrazoPasso(t, null, HOJE)).toBeNull();
  });
});

describe("faixaSaude", () => {
  it("baixa até 33, média até 66 e alta acima; nos limites 0 e 100", () => {
    expect([0, 33, 34, 45, 66, 67, 100].map(faixaSaude)).toEqual(["baixa", "baixa", "media", "media", "media", "alta", "alta"]);
  });
});
