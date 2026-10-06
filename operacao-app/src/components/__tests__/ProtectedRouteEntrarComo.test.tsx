/**
 * "Entrar como" esquecido: se a pessoa em nome de quem se está não tem
 * acesso, o ecrã de bloqueio diz isso e dá o caminho de volta — antes, o
 * admin ficava preso num "Sem acesso" sem saída (06/10/2026).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const auth = {
  loading: false,
  session: { user: { id: "x" } },
  businessUserId: "u-alvo",
  funcao: null as string | null,
  perfilCarregado: true,
  orgs: [{ id: "org", name: "Mudelar" }],
  activeOrgId: "org",
};
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../../lib/supabase", () => ({ supabase: { auth: {}, rpc: async () => ({ data: null, error: null }) } }));

const sair = vi.fn(async () => undefined);
vi.mock("../EntrarComo", () => ({
  useEntrarComo: () => estado,
  sairDoEntrarComo: () => sair(),
}));
let estado: { nome: string; desde: number } | null = null;

import { ProtectedRoute } from "../ProtectedRoute";
import { DURACAO_MAX_MS } from "../../lib/entrarComo";

function montar() {
  return render(
    <MemoryRouter>
      <ProtectedRoute>
        <p>dentro</p>
      </ProtectedRoute>
    </MemoryRouter>
  );
}

beforeEach(() => {
  sair.mockClear();
  estado = null;
});

describe("ProtectedRoute — entrar como", () => {
  it("sem acesso, a ver como outra pessoa: diz quem e deixa voltar", () => {
    estado = { nome: "Adam Silva", desde: Date.now() };
    montar();
    expect(screen.getByText("Sem acesso a Operações")).toBeInTheDocument();
    expect(screen.getByText(/Adam Silva/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Voltar à minha conta"));
    expect(sair).toHaveBeenCalled();
  });

  it("sem entrar-como, o bloqueio não mostra o botão", () => {
    montar();
    expect(screen.getByText("Sem acesso a Operações")).toBeInTheDocument();
    expect(screen.queryByText("Voltar à minha conta")).toBeNull();
  });

  it("passado o tempo máximo, volta sozinho à conta do admin", () => {
    estado = { nome: "Adam Silva", desde: Date.now() - DURACAO_MAX_MS - 1000 };
    vi.useFakeTimers();
    montar();
    vi.runAllTimers();
    vi.useRealTimers();
    expect(sair).toHaveBeenCalled();
  });
});
