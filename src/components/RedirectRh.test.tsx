import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { RedirectRh } from "./RedirectRh";

function Onde() {
  const l = useLocation();
  return <p data-testid="onde">{`${l.pathname}${l.search}${l.hash}`}</p>;
}

const ir = (de: string, rota: string, para: string) => {
  render(
    <MemoryRouter initialEntries={[de]}>
      <Routes>
        <Route path={rota} element={<RedirectRh para={para} />} />
        <Route path="*" element={<Onde />} />
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByTestId("onde").textContent;
};

describe("RedirectRh", () => {
  it("mantém o :id, a query e o hash", () => {
    expect(ir("/rh/pessoas/abc-1?tab=laborais#x", "/rh/pessoas/:id?", "/rh-exemplo/pessoas/:id?")).toBe("/rh-exemplo/pessoas/abc-1?tab=laborais#x");
  });

  it("sem :id vai para a lista", () => {
    expect(ir("/rh/pessoas", "/rh/pessoas/:id?", "/rh-exemplo/pessoas/:id?")).toBe("/rh-exemplo/pessoas");
  });

  it("junta a query do destino à do endereço antigo (a do destino ganha)", () => {
    expect(ir("/rh/ausencias/aprovacoes?x=1&dominio=y", "/rh/ausencias/aprovacoes", "/rh-exemplo/assiduidade-e-ausencias?dominio=ausencias&tab=aprovacoes"))
      .toBe("/rh-exemplo/assiduidade-e-ausencias?x=1&dominio=ausencias&tab=aprovacoes");
  });
});
