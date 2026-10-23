// O wrapper de Pessoas.tsx: com a fonte real monta a Lista real; sem provider, o exemplo.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FontePessoasContext } from "@/hooks/pessoas/useFontePessoas";
import Pessoas from "./Pessoas";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => true }) }));
vi.mock("@/components/pessoas-lista/PessoasReal", () => ({ PessoasReal: () => <p>LISTA REAL</p> }));

const pagina = (ui: React.ReactNode) => render(<MemoryRouter initialEntries={["/pessoas"]}>{ui}</MemoryRouter>);

describe("Pessoas: modo da fonte", () => {
  it("com a fonte real monta a Lista real e não o exemplo", async () => {
    pagina(
      <FontePessoasContext.Provider value={{ modo: "real", organizationId: "org-1", momentoGanho: null }}>
        <Pessoas />
      </FontePessoasContext.Provider>,
    );
    expect(await screen.findByText("LISTA REAL")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nova lead" })).toBeNull();
  });

  it("sem provider monta o exemplo", () => {
    pagina(<Pessoas />);
    expect(screen.queryByText("LISTA REAL")).toBeNull();
    expect(screen.getByRole("button", { name: "Nova lead" })).toBeInTheDocument();
  });

  it("com a fonte em exemplo monta o exemplo", () => {
    pagina(
      <FontePessoasContext.Provider value={{ modo: "exemplo" }}>
        <Pessoas />
      </FontePessoasContext.Provider>,
    );
    expect(screen.queryByText("LISTA REAL")).toBeNull();
    expect(screen.getByRole("button", { name: "Nova lead" })).toBeInTheDocument();
  });
});
