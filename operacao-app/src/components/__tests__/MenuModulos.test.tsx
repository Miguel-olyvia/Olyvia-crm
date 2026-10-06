/**
 * Menu por empresa: uma empresa que só faz obras não vê Ordens, Planos e
 * Locais — e, se a base não responder, o menu mostra tudo (nunca esconde
 * por engano).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const auth = {
  userName: "Ruben",
  userEmail: "r@x.pt",
  funcao: "gestor" as string,
  orgs: [{ id: "org-obras", name: "Mudelar" }],
  activeOrgId: "org-obras",
  setActiveOrgId: vi.fn(),
  signOut: vi.fn(),
};
const respostas: Record<string, unknown> = {
  "org-obras": { manutencao: false, obras: true, escolhido: {}, existe: { manutencao: false, obras: true } },
};
const rpc = vi.fn(async (nome: string, args: { p_org?: string }) =>
  nome === "rpc_ops_modulos" && args?.p_org && respostas[args.p_org]
    ? { data: respostas[args.p_org], error: null }
    : { data: null, error: { message: "não existe" } }
);

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: () => ({ select: () => ({ in: () => ({ order: async () => ({ data: [], error: null }) }) }) }),
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
    auth: {},
    functions: {},
    rpc: (n: string, a: { p_org?: string }) => rpc(n, a),
  },
}));

import { OperacaoLayout } from "../OperacaoLayout";

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

describe("Menu por empresa", () => {
  it("uma empresa só de obras não vê a Manutenção", async () => {
    auth.activeOrgId = "org-obras";
    montar();
    const nav = screen.getByRole("navigation", { name: "Operações" });
    await waitFor(() => expect(within(nav).queryByText("Ordens")).toBeNull());
    expect(within(nav).queryByText("Planos")).toBeNull();
    expect(within(nav).queryByText("Locais")).toBeNull();
    expect(within(nav).getByText("Obras")).toBeInTheDocument();
    expect(within(nav).getByText("Modelos")).toBeInTheDocument();
  });

  it("se a base não responder, mostra tudo", async () => {
    auth.activeOrgId = "org-sem-rpc";
    montar();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("rpc_ops_modulos", { p_org: "org-sem-rpc" }));
    const nav = screen.getByRole("navigation", { name: "Operações" });
    expect(within(nav).getByText("Ordens")).toBeInTheDocument();
    expect(within(nav).getByText("Obras")).toBeInTheDocument();
  });
});
