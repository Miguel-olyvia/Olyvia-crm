// A guarda com o hook REAL (useNegociosAtivos) e o Supabase simulado: transições de estado de ponta a ponta.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useFontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { negociosAtivosQueryKey } from "@/hooks/pessoas/useNegociosAtivos";
import { PessoasRota } from "./PessoasRota";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
const maybeSingleMock = vi.hoisted(() => vi.fn());
const eqMock = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: (...a: unknown[]) => { eqMock(...a); return { maybeSingle: maybeSingleMock }; } }) }) },
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
let ctx: { activeCompany: { id: string } | null; isLoading: boolean } = { activeCompany: { id: "org-1" }, isLoading: false };
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ctx }));

function Sonda() {
  const f = useFontePessoas();
  return <p>PAGINA {f.modo === "real" ? f.organizationId : "exemplo"}</p>;
}

function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  const arvore = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/pessoas"]}>
        <Routes>
          <Route path="/pessoas" element={<PessoasRota><Sonda /></PessoasRota>} />
          <Route path="/leads" element={<p>LEADS</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { client, arvore, ...render(arvore()) };
}
const ativa = (momento = "manual") => ({ data: { momento_ganho: momento }, error: null });
const falha = { data: null, error: { code: "57014", message: "t" } };

beforeEach(() => {
  maybeSingleMock.mockReset();
  eqMock.mockReset();
  ctx = { activeCompany: { id: "org-1" }, isLoading: false };
});

describe("PessoasRota com o hook real", () => {
  it("passa de a carregar para a página montada", async () => {
    let libertar: (r: unknown) => void = () => {};
    maybeSingleMock.mockReturnValue(new Promise((res) => { libertar = res; }));
    montar();
    expect(screen.getByRole("status")).toHaveTextContent("A carregar pessoas...");
    expect(screen.queryByText(/PAGINA/)).toBeNull();
    await act(async () => { libertar(ativa()); });
    expect(await screen.findByText("PAGINA org-1")).toBeInTheDocument();
  });

  it("sem linha de configuração: vai para /leads", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    montar();
    expect(await screen.findByText("LEADS")).toBeInTheDocument();
  });

  it("erro na primeira leitura: alerta; «Tentar de novo» repete e monta a página", async () => {
    maybeSingleMock.mockResolvedValueOnce(falha);
    montar();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    maybeSingleMock.mockResolvedValueOnce(ativa());
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("PAGINA org-1")).toBeInTheDocument();
    expect(maybeSingleMock).toHaveBeenCalledTimes(2);
  });

  it("troca de organização: volta a carregar e usa a nova", async () => {
    maybeSingleMock.mockResolvedValue(ativa());
    const { arvore, rerender } = montar();
    expect(await screen.findByText("PAGINA org-1")).toBeInTheDocument();
    let libertar: (r: unknown) => void = () => {};
    maybeSingleMock.mockReturnValue(new Promise((res) => { libertar = res; }));
    ctx = { activeCompany: { id: "org-2" }, isLoading: false };
    rerender(arvore());
    await waitFor(() => expect(eqMock).toHaveBeenCalledWith("organization_id", "org-2"));
    expect(screen.queryByText("PAGINA org-1")).toBeNull();
    await act(async () => { libertar(ativa()); });
    expect(await screen.findByText("PAGINA org-2")).toBeInTheDocument();
  });

  it("erro numa nova leitura com dados antigos: a página mantém-se", async () => {
    maybeSingleMock.mockResolvedValueOnce(ativa());
    const { client } = montar();
    expect(await screen.findByText("PAGINA org-1")).toBeInTheDocument();
    maybeSingleMock.mockResolvedValueOnce(falha);
    await act(async () => { await client.refetchQueries({ queryKey: negociosAtivosQueryKey("org-1") }); });
    expect(screen.getByText("PAGINA org-1")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
