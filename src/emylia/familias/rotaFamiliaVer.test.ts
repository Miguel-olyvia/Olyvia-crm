// A rota da vista da família no App.tsx (lida como texto: montar o App inteiro é caro): /catalogo/produtos/familias/:id exige services.view, como a lista, e a página é carregada à parte (lazy).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("App.tsx: rota da vista da família", () => {
  it("declara /catalogo/produtos/familias/:id com ProtectedRoute services.view, como a lista", () => {
    const rota = app.split(/\r?\n/).find((l) => l.includes('path="/catalogo/produtos/familias/:id"'));
    expect(rota).toBeDefined();
    expect(rota).toContain('<ProtectedRoute permission="services.view"><CatalogoFamiliaVer /></ProtectedRoute>');
    const lista = app.split(/\r?\n/).find((l) => l.includes('path="/catalogo/produtos/familias"'));
    expect(lista).toContain('permission="services.view"');
  });

  it("a página carrega-se à parte (lazy)", () => {
    expect(app).toMatch(/const CatalogoFamiliaVer = lazy\(\(\) => import\("\.\/pages\/CatalogoFamiliaVer"\)\);/);
  });
});
