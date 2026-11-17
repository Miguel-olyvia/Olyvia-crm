// 17/11: as rotas /catalogo/produtos, /catalogo/servicos/*, /catalogo/ligacoes e as fichas montam POR AGORA a página atual (CatalogoCustos)
// com a secção e a ficha que a rota diz; a leitura pesada fica para as fases seguintes.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { useContext } from "react";
import { EnderecoAtivo } from "@/lib/paramUrl";
import type { RotaCatalogo } from "@/emylia/catalogoRotas";

vi.mock("../CatalogoCustos", () => {
  function CatalogoFalso({ rota }: { rota?: RotaCatalogo }) {
    return (
      <div>
        <p data-testid="endereco">{String(useContext(EnderecoAtivo))}</p>
        <p data-testid="rota">{JSON.stringify({ seccao: rota?.seccao, produto: rota?.produto, servico: rota?.servico })}</p>
        <button type="button" onClick={() => rota?.ir("/catalogo/ligacoes")}>ir</button>
      </div>
    );
  }
  return { default: CatalogoFalso };
});

import CatalogoRota from "../CatalogoRota";

const Sitio = () => <p data-testid="sitio">{useLocation().pathname}</p>;
afterEach(cleanup);

function abrir(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/catalogo/produtos" element={<CatalogoRota seccao="produtos" />} />
        <Route path="/catalogo/produtos/:id" element={<CatalogoRota seccao="produtos" />} />
        <Route path="/catalogo/servicos/:sid" element={<CatalogoRota seccao="servicos" />} />
        <Route path="/catalogo/servicos/equipamentos" element={<CatalogoRota seccao="equipamentos" />} />
        <Route path="*" element={<Sitio />} />
      </Routes>
    </MemoryRouter>,
  );
  return () => JSON.parse(screen.getByTestId("rota").textContent ?? "{}");
}

describe("CatalogoRota", () => {
  it("a lista abre a secção da rota, sem ficha", () => {
    expect(abrir("/catalogo/produtos")()).toEqual({ seccao: "produtos" });
  });
  it("as secções dos serviços abrem o separador certo", () => {
    expect(abrir("/catalogo/servicos/equipamentos")()).toEqual({ seccao: "equipamentos" });
  });
  it("/catalogo/produtos/:id abre a ficha do produto", () => {
    expect(abrir("/catalogo/produtos/p-1")()).toEqual({ seccao: "produtos", produto: "p-1" });
  });
  it("/catalogo/servicos/:sid abre a ficha do serviço", () => {
    expect(abrir("/catalogo/servicos/s-1")()).toEqual({ seccao: "servicos", servico: "s-1" });
  });
  it("o que não vem da rota (?criar=, ?consumivel=) lê-se da pesquisa do endereço", () => {
    abrir("/catalogo/produtos");
    expect(screen.getByTestId("endereco")).toHaveTextContent("pesquisa");
  });
  it("o ir da página navega pelo router", () => {
    abrir("/catalogo/produtos");
    fireEvent.click(screen.getByRole("button", { name: "ir" }));
    expect(screen.getByTestId("sitio")).toHaveTextContent("/catalogo/ligacoes");
  });
});
