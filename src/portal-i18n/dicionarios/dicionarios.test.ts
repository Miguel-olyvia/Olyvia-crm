// Paridade dos dicionários do portal (cliente, fornecedor e comum): pt e en têm as mesmas chaves, nenhuma está
// vazia, os marcadores {x} / {{x}} são os mesmos, cada área só usa o seu prefixo e nenhum ficheiro passa das 400 linhas.
import { describe, expect, it } from "vitest";
import { AREAS, dicionarios } from "./index";

// Os ficheiros desta pasta lidos como texto (sem node:fs): o index e os de cada área, sem o próprio teste.
const FICHEIROS = import.meta.glob(["./*.ts", "!./*.test.ts"], { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;
const MAX_LINHAS = 400;
const MIN_CHAVES_DE_EXEMPLO = 12;

const marcadores = (s: string): string[] => (s.match(/\{\{\w+\}\}|\{\w+\}/g) ?? []).sort();
const areas = Object.entries(AREAS);

describe("dicionários do portal: estrutura", () => {
  it("existem as três áreas com os prefixos combinados", () => {
    expect(Object.keys(AREAS).sort()).toEqual(["cliente", "comum", "fornecedor"]);
    expect(AREAS.cliente.prefixo).toBe("pc.");
    expect(AREAS.fornecedor.prefixo).toBe("sp.");
    expect(AREAS.comum.prefixo).toBe("pt.");
  });

  it.each(areas)("%s: começa com chaves de exemplo suficientes", (_nome, area) => {
    expect(Object.keys(area.pt).length).toBeGreaterThanOrEqual(MIN_CHAVES_DE_EXEMPLO);
  });
});

describe.each(areas)("dicionário %s", (_nome, area) => {
  it("pt e en têm exatamente as mesmas chaves", () => {
    expect(Object.keys(area.en).sort()).toEqual(Object.keys(area.pt).sort());
  });

  it("nenhuma chave está vazia (nem só espaços)", () => {
    for (const lingua of [area.pt, area.en]) {
      expect(Object.entries(lingua).filter(([, v]) => typeof v !== "string" || v.trim() === "")).toEqual([]);
    }
  });

  it("os marcadores {x} e {{x}} são os mesmos em pt e en", () => {
    const diferentes = Object.keys(area.pt).filter(
      (k) => JSON.stringify(marcadores(area.pt[k])) !== JSON.stringify(marcadores(area.en[k] ?? "")),
    );
    expect(diferentes).toEqual([]);
  });

  it("todas as chaves usam o prefixo da área e têm a forma prefixo.parte.parte", () => {
    const fora = Object.keys({ ...area.pt, ...area.en }).filter(
      (k) => !k.startsWith(area.prefixo) || !/^[a-z]{2}(\.[A-Za-z0-9_]+)+$/.test(k),
    );
    expect(fora).toEqual([]);
  });
});

describe("dicionários do portal: junção", () => {
  it("nenhuma chave aparece em duas áreas (a junção por spread não perde nada em silêncio)", () => {
    for (const lingua of ["pt", "en"] as const) {
      const soma = areas.reduce((n, [, a]) => n + Object.keys(a[lingua]).length, 0);
      expect(Object.keys(dicionarios[lingua]).length).toBe(soma);
    }
  });

  it("o dicionário junto de pt e de en tem as mesmas chaves", () => {
    expect(Object.keys(dicionarios.en).sort()).toEqual(Object.keys(dicionarios.pt).sort());
  });

  it("cada ficheiro de dicionários tem menos de 400 linhas", () => {
    const ficheiros = Object.entries(FICHEIROS);
    expect(ficheiros.length).toBeGreaterThanOrEqual(7);
    const grandes = ficheiros
      .map(([f, texto]) => ({ f, linhas: texto.split(/\r?\n/).length }))
      .filter((x) => x.linhas >= MAX_LINHAS);
    expect(grandes).toEqual([]);
  });
});
