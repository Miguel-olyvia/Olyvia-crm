// 17/11: /catalogo-custos deixou de montar o Catálogo e passa a encaminhar para as rotas novas (as ligações guardadas continuam a abrir o mesmo sítio).
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { RedirectCatalogo } from "./RedirectCatalogo";

const Sitio = () => { const l = useLocation(); return <p data-testid="sitio">{l.pathname + l.search + l.hash}</p>; };
afterEach(cleanup);

function abrir(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/catalogo-custos" element={<RedirectCatalogo />} />
        <Route path="*" element={<Sitio />} />
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByTestId("sitio").textContent;
}

describe("RedirectCatalogo", () => {
  it.each([
    ["/catalogo-custos", "/catalogo/servicos"],
    ["/catalogo-custos?sec=ligacoes", "/catalogo/servicos/ligacoes"],
    ["/catalogo-custos?sec=tecnicos", "/catalogo/servicos/tecnicos"],
    ["/catalogo-custos?servico=s1", "/catalogo/servicos/s1"],
    ["/catalogo-custos?produto=p1", "/catalogo/produtos/p1"],
    ["/catalogo-custos?consumivel=Cola", "/catalogo/servicos/consumiveis?consumivel=Cola"],
    ["/catalogo-custos?criar=produto", "/catalogo/produtos?criar=produto"],
    ["/catalogo-custos?atributos=categorias", "/catalogo/produtos/categorias"],
    ["/catalogo-custos?atributos=1", "/catalogo/produtos/atributos"],
    ["/catalogo-custos?atributos=sku#x", "/catalogo/produtos/referencia#x"],
  ])("%s -> %s", (de, para) => {
    expect(abrir(de)).toBe(para);
  });
});
