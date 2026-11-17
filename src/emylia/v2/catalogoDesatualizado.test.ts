// 17/11: a gestão do Catálogo (páginas de /catalogo/produtos/…) muda dados que o Catálogo partilhado (catalogoStore) também guarda.
// Em vez de reler tudo a cada gravação, marca-se o store como desatualizado; quem o lê de novo (carregarCatalogo) limpa a marca.
import { afterEach, describe, expect, it } from "vitest";
import { catalogoDesatualizado, marcarCatalogoAtualizado, marcarCatalogoDesatualizado, reporCatalogo } from "./catalogoStore";

afterEach(() => { marcarCatalogoAtualizado(); });

describe("catalogoStore: marca de desatualizado", () => {
  it("começa limpa, marca-se e limpa-se", () => {
    expect(catalogoDesatualizado()).toBe(false);
    marcarCatalogoDesatualizado();
    expect(catalogoDesatualizado()).toBe(true);
    marcarCatalogoAtualizado();
    expect(catalogoDesatualizado()).toBe(false);
  });
  it("repor o Catálogo (troca de organização) também a limpa", () => {
    marcarCatalogoDesatualizado();
    reporCatalogo();
    expect(catalogoDesatualizado()).toBe(false);
  });
});
