import { describe, expect, it } from "vitest";

// O CRM não pode depender do portal: o núcleo de idioma dos documentos só importa o que está dentro dele.
// Lê o texto dos ficheiros do módulo (só os de topo, não os testes) como texto.
const FONTES = import.meta.glob("../*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const FICHEIROS = Object.keys(FONTES).sort();

function importacoes(texto: string): string[] {
  const out: string[] = [];
  for (const m of texto.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g)) out.push(m[1]);
  for (const m of texto.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]);
  for (const m of texto.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/g)) out.push(m[1]);
  return out;
}

describe("src/lib/idiomaDocumento é um módulo neutro", () => {
  it("há ficheiros para verificar", () => {
    expect(FICHEIROS.length).toBeGreaterThan(8);
  });

  it.each(FICHEIROS)("%s só importa ficheiros do próprio módulo", (ficheiro) => {
    for (const origem of importacoes(FONTES[ficheiro])) {
      expect(origem.startsWith("./"), `${ficheiro} importa "${origem}"`).toBe(true);
    }
  });

  it.each(FICHEIROS)("%s não menciona portal-i18n", (ficheiro) => {
    expect(FONTES[ficheiro]).not.toMatch(/portal-i18n/);
  });

  it("cada ficheiro tem menos de 400 linhas", () => {
    for (const f of FICHEIROS) {
      expect(FONTES[f].split("\n").length, f).toBeLessThan(400);
    }
  });
});
