/**
 * O contador de alertas de obra no item "Validar" do menu: só para quem
 * supervisiona, e volta a perguntar ao focar a janela.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const auth = {
  userName: "Sara Supervisora",
  userEmail: "s@x.pt",
  funcao: "supervisor" as string,
  orgs: [{ id: "org", name: "Org" }],
  activeOrgId: "org",
  setActiveOrgId: vi.fn(),
  signOut: vi.fn(),
};

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../../lib/supabase", () => ({ supabase: { from: () => ({}), rpc: async () => ({ data: null, error: null }), auth: {}, functions: {}, storage: { from: () => ({}) } } }));
vi.mock("../../lib/obras", () => ({
  EVENTO_ALERTAS: "ops:alertas-mudaram",
  sincronizarAvisos: vi.fn(async () => undefined),
  alertasDeSupervisao: vi.fn(async () => [{ tipo: "nao_iniciada" }, { tipo: "fim_ultrapassado" }, { tipo: "cliente_por_avisar" }]),
}));

import { OperacaoLayout } from "../OperacaoLayout";
import * as obras from "../../lib/obras";

function montar() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route element={<OperacaoLayout />}>
          <Route path="*" element={<p>conteúdo</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("OperacaoLayout — alertas no menu", () => {
  beforeEach(() => {
    auth.funcao = "supervisor";
    vi.mocked(obras.alertasDeSupervisao).mockClear();
  });

  it("o supervisor vê quantos alertas há, no item Validar", async () => {
    montar();
    const nav = screen.getByRole("navigation", { name: "Operações" });
    const validar = within(nav).getByText("Validar").closest("a")!;
    expect(await within(validar).findByLabelText("3 alertas")).toHaveTextContent("3");
    expect(obras.alertasDeSupervisao).toHaveBeenCalledWith("org");
  });

  it("volta a perguntar ao focar a janela e quando um ecrã avisa", async () => {
    montar();
    await waitFor(() => expect(obras.alertasDeSupervisao).toHaveBeenCalledTimes(1));
    fireEvent.focus(window);
    await waitFor(() => expect(obras.alertasDeSupervisao).toHaveBeenCalledTimes(2));
    window.dispatchEvent(new Event("ops:alertas-mudaram"));
    await waitFor(() => expect(obras.alertasDeSupervisao).toHaveBeenCalledTimes(3));
  });

  it("o técnico não pergunta nem vê contador", () => {
    auth.funcao = "tecnico";
    montar();
    expect(obras.alertasDeSupervisao).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/alertas?$/)).toBeNull();
  });
});
