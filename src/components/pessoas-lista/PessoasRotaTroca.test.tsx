// Trocar de organização com a página aberta: o que o utilizador escolheu na organização anterior (formulário, «Só as minhas»)
// não pode sobreviver, senão a lista da organização nova vem vazia por causa de um id que não é dela.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PessoasRota } from "./PessoasRota";
import { useFiltrosLista } from "./useFiltrosLista";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
vi.mock("@/hooks/pessoas/useNegociosAtivos", () => ({
  useNegociosAtivos: () => ({
    ativo: true, momentoGanho: "manual", isLoading: false, isError: false, erroSemResposta: false, aRepetir: false,
  }),
  useRepetirNegociosAtivos: () => vi.fn(),
}));
let empresa: { id: string } | null = { id: "org-a" };
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: empresa, isLoading: false }) }));
vi.mock("@/hooks/usePermissionScope", () => ({ usePermissionScope: () => ({ anewUserId: "u-rui" }) }));

// Uma página mínima com os filtros reais: o estado que sobrevive (ou não) à troca é o do hook verdadeiro.
function Pagina() {
  const f = useFiltrosLista("u-rui");
  return (
    <div>
      <button type="button" onClick={() => f.mudarFormulario("form-da-org-a")}>escolher</button>
      <button type="button" onClick={() => f.mudarSoMinhas(true)}>minhas</button>
      <p data-testid="estado">{`${f.filtros.formularioId ?? "nenhum"}|${f.soMinhas ? "minhas" : "todas"}`}</p>
    </div>
  );
}

const arvore = () => (
  <MemoryRouter initialEntries={["/pessoas"]}>
    <Routes>
      <Route path="/pessoas" element={<PessoasRota><Pagina /></PessoasRota>} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => { empresa = { id: "org-a" }; });

describe("PessoasRota: troca de organização", () => {
  it("os filtros escolhidos numa organização voltam ao início quando a organização muda", () => {
    const { rerender } = render(arvore());
    fireEvent.click(screen.getByRole("button", { name: "escolher" }));
    fireEvent.click(screen.getByRole("button", { name: "minhas" }));
    expect(screen.getByTestId("estado")).toHaveTextContent("form-da-org-a|minhas");
    empresa = { id: "org-b" };
    rerender(arvore());
    expect(screen.getByTestId("estado")).toHaveTextContent("nenhum|todas");
  });

  it("sem trocar de organização, um novo render não apaga os filtros", () => {
    const { rerender } = render(arvore());
    fireEvent.click(screen.getByRole("button", { name: "escolher" }));
    rerender(arvore());
    expect(screen.getByTestId("estado")).toHaveTextContent("form-da-org-a|todas");
  });
});
