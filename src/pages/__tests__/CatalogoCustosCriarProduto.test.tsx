// 18/11: criar um PRODUTO a partir de uma página de Serviços não abre o formulário (a leitura de Serviços não traz modelos nem atributos, e o produto criaria-se sem eles
// e com a referência (SKU) errada): leva à página de Produtos, que lê tudo. Os outros tipos criam-se na própria página.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "11111111-1111-4111-a111-111111111111" }, isLoading: false }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => true }) }));

import CatalogoRota from "../CatalogoRota";
import { reporCustos } from "@/emylia/v2/custosStore";

const CATALOGO = { parametros: { meses: 14, tsu: 23.75, seguros_ano: 713, horas_ano: 1345, horas_mes: 672, meses_desatualizado: 6, margem_minima: 28, margem_alvo: 35 } };
const Sitio = () => { const l = useLocation(); return <p data-testid="sitio">{l.pathname + l.search}</p>; };
// o estado da página (?criar=) lê-se do endereço do browser (EnderecoAtivo "pesquisa"), e não do MemoryRouter: pô-lo nos dois
const abrir = (url: string) => { window.history.replaceState({}, "", url); return render(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/catalogo/servicos" element={<CatalogoRota seccao="servicos" />} />
        <Route path="/catalogo/servicos/equipamentos" element={<CatalogoRota seccao="equipamentos" />} />
        <Route path="/catalogo/produtos" element={<Sitio />} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>,
); };

describe("criar um produto a partir de Serviços", () => {
  beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: CATALOGO, error: null }); });
  afterEach(() => { cleanup(); reporCustos(); window.history.replaceState({}, "", "/"); });

  it("escolher «Produto» no seletor leva a /catalogo/produtos?criar=produto e não abre o formulário", async () => {
    abrir("/catalogo/servicos?criar=servico");
    await screen.findByRole("heading", { name: "Criar no Catálogo" }, { timeout: 15_000 });
    fireEvent.click(screen.getByRole("radio", { name: /^Produto/ }));
    expect(await screen.findByTestId("sitio")).toHaveTextContent("/catalogo/produtos?criar=produto");
    expect(screen.queryByText("Criar o produto")).toBeNull();
  }, 30_000);
  it("um endereço directo /catalogo/servicos?criar=produto também segue para os Produtos", async () => {
    abrir("/catalogo/servicos/equipamentos?criar=produto");
    expect(await screen.findByTestId("sitio", {}, { timeout: 15_000 })).toHaveTextContent("/catalogo/produtos?criar=produto");
  }, 30_000);
  it("criar um serviço continua a fazer-se na própria página", async () => {
    abrir("/catalogo/servicos?criar=servico");
    await screen.findByRole("heading", { name: "Criar no Catálogo" }, { timeout: 15_000 });
    expect(screen.queryByTestId("sitio")).toBeNull();
    expect(screen.getByRole("radio", { name: /^Serviço/ })).toHaveAttribute("aria-checked", "true");
  }, 30_000);
});
