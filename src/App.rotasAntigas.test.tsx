import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import appSource from "@/App.tsx?raw";
import { RedirectPreservandoPesquisa } from "@/components/pessoas-lista/RedirectPreservandoPesquisa";

const ROTAS_ANTIGAS = ["/leads", "/clients", "/anew-leads", "/anew-clients", "/anew-contacts", "/contacts"];

function Destino() {
  const l = useLocation();
  return <div data-testid="destino">{`${l.pathname}|${l.search}|${l.hash}`}</div>;
}

function montar(entrada: string, caminho: string) {
  render(
    <MemoryRouter initialEntries={[entrada]}>
      <Routes>
        <Route path={caminho} element={<RedirectPreservandoPesquisa />} />
        <Route path="/pessoas" element={<Destino />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("redirecionamentos antigos para /pessoas", () => {
  it("preserva a query string e o hash", () => {
    montar("/leads?open=abc-123&x=1#topo", "/leads");
    expect(screen.getByTestId("destino").textContent).toBe("/pessoas|?open=abc-123&x=1|#topo");
  });

  it("sem query string vai para /pessoas limpo", () => {
    montar("/contacts", "/contacts");
    expect(screen.getByTestId("destino").textContent).toBe("/pessoas||");
  });

  it.each(ROTAS_ANTIGAS)("o App.tsx usa o redirecionamento que preserva a pesquisa em %s", (rota) => {
    const linha = appSource.split(/\r?\n/).find((l) => l.includes(`path="${rota}"`));
    expect(linha).toBeDefined();
    expect(linha).toContain("<RedirectPreservandoPesquisa />");
    expect(linha).not.toContain('<Navigate to="/pessoas"');
  });
});
