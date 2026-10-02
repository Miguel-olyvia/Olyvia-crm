/**
 * O menu de Operações segue o desenho do CRM: barra de ícones + painel do
 * módulo no desktop, gaveta à esquerda no telemóvel — e nada desliza na
 * horizontal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GRUPOS, OperacaoLayout } from "../OperacaoLayout";

const auth = {
  userName: "Ruben Carvalho",
  userEmail: "ruben@exemplo.pt",
  funcao: "gestor" as string,
  orgs: [{ id: "org", name: "Org" }],
  activeOrgId: "org",
  setActiveOrgId: vi.fn(),
  signOut: vi.fn(),
};

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));

function montar(rota = "/") {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route element={<OperacaoLayout />}>
          <Route path="*" element={<p>conteúdo</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

const TODOS = GRUPOS.flatMap((g) => g.itens.map((i) => i.rotulo));

describe("OperacaoLayout — menu", () => {
  beforeEach(() => {
    auth.funcao = "gestor";
    localStorage.clear();
  });

  it("o painel do módulo mostra todos os destinos, agrupados, a um gestor", () => {
    montar();
    const nav = screen.getByRole("navigation", { name: "Operações" });
    for (const rotulo of TODOS) expect(within(nav).getByText(rotulo)).toBeInTheDocument();
    for (const titulo of ["Execução", "Trabalho", "Dados", "Sistema"]) {
      expect(within(nav).getByText(titulo)).toBeInTheDocument();
    }
  });

  it("um técnico não vê Validar", () => {
    auth.funcao = "tecnico";
    montar();
    const nav = screen.getByRole("navigation", { name: "Operações" });
    expect(within(nav).queryByText("Validar")).toBeNull();
    expect(within(nav).getByText("As minhas tarefas")).toBeInTheDocument();
  });

  it("nada no menu desliza na horizontal", () => {
    const { container } = montar();
    expect(container.querySelector(".overflow-x-auto")).toBeNull();
  });

  it("marca a página atual", () => {
    montar("/obras/123");
    const nav = screen.getByRole("navigation", { name: "Operações" });
    expect(within(nav).getByText("Obras").closest("a")).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByText("Hoje").closest("a")).not.toHaveAttribute("aria-current");
  });

  it("o painel fecha e reabre pelo ícone do módulo, e lembra-se", () => {
    montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Fechar menu" })[0]);
    expect(screen.queryByRole("navigation", { name: "Operações" })).toBeNull();
    expect(localStorage.getItem("operacao.menu-aberto")).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "Operações" }));
    expect(screen.getByRole("navigation", { name: "Operações" })).toBeInTheDocument();
  });

  it("no telemóvel, o botão de menu abre a gaveta e escolher um destino fecha-a", () => {
    localStorage.setItem("operacao.menu-aberto", "0");
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    const gaveta = screen.getByRole("dialog", { name: "Menu de Operações" });
    fireEvent.click(within(gaveta).getByText("Ordens"));
    expect(screen.queryByRole("dialog", { name: "Menu de Operações" })).toBeNull();
  });

  it("Esc fecha a gaveta", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Menu de Operações" })).toBeNull();
  });
});
