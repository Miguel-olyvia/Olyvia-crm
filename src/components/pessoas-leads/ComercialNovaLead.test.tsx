// O comercial da «Nova lead» (cópia de Leads): filtro por organização e por distrito da lead, com «a mostrar todos» quando ninguém serve a zona.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComercialLido, NoArvoreOrg } from "@/hooks/pessoas/novaLead/comerciaisNovaLead";
import { ComercialNovaLead } from "./ComercialNovaLead";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

const RUI: ComercialLido = { id: "u1", name: "Rui", districts: ["Porto"], org_ids: ["loja-a"] };
const SOFIA: ComercialLido = { id: "u2", name: "Sofia", districts: ["Lisboa"], org_ids: ["loja-b"] };
const SEM_ZONA: ComercialLido = { id: "u3", name: "Tiago", districts: [], org_ids: ["loja-a"] };
const ARVORE: NoArvoreOrg[] = [
  { id: "grupo", name: "Grupo", type: "empresa", depth: 0 }, { id: "loja-a", name: "Loja A", type: "loja", depth: 1 }, { id: "loja-b", name: "Loja B", type: "loja", depth: 1 },
];

function desenhar(sobre: Partial<Parameters<typeof ComercialNovaLead>[0]> = {}) {
  const f = { aoMudarAtribuido: vi.fn(), aoMudarOrgFiltro: vi.fn() };
  render(<ComercialNovaLead comerciais={[RUI, SOFIA, SEM_ZONA]} arvore={ARVORE} atribuidoId="" orgFiltro="all" distritoDaLead="" {...f} {...sobre} />);
  return f;
}
const opcoes = () => within(screen.getByLabelText("Atribuído a (comercial)", { selector: "select" })).getAllByRole("option").map((o) => o.textContent);

describe("ComercialNovaLead", () => {
  it("sem distrito mostra todos, cada um com as suas zonas", () => {
    desenhar();
    expect(opcoes()).toEqual(["Selecionar comercial...", "Rui (Porto)", "Sofia (Lisboa)", "Tiago"]);
  });

  it("escolher um comercial devolve o id", () => {
    const f = desenhar();
    fireEvent.change(screen.getByLabelText("Atribuído a (comercial)", { selector: "select" }), { target: { value: "u2" } });
    expect(f.aoMudarAtribuido).toHaveBeenCalledWith("u2");
  });

  it("com o distrito da lead só mostra os comerciais dessa zona e di-lo", () => {
    desenhar({ distritoDaLead: "porto" });
    expect(opcoes()).toEqual(["Selecionar comercial...", "Rui (Porto)"]);
    expect(screen.getByText(/A mostrar comerciais de/)).toHaveTextContent("A mostrar comerciais de porto");
  });

  it("se ninguém serve a zona, mostra todos e avisa (em texto, num estado)", () => {
    desenhar({ distritoDaLead: "Faro" });
    // como em Leads: com distrito na lead, as zonas mostradas são só as que coincidem (aqui nenhuma)
    expect(opcoes()).toEqual(["Selecionar comercial...", "Rui", "Sofia", "Tiago"]);
    expect(screen.getByRole("status")).toHaveTextContent("Nenhum comercial na zona de Faro — a mostrar todos");
  });

  it("o filtro por organização só aparece com mais do que uma e limita os comerciais", () => {
    const f = desenhar({ orgFiltro: "loja-a" });
    expect(opcoes()).toEqual(["Selecionar comercial...", "Rui (Porto)", "Tiago"]);
    fireEvent.change(screen.getByLabelText("Filtrar por organização..."), { target: { value: "loja-b" } });
    expect(f.aoMudarOrgFiltro).toHaveBeenCalledWith("loja-b");
  });

  it("com uma só organização não há filtro; sem comerciais diz que não há nenhum", () => {
    desenhar({ arvore: [ARVORE[0]], comerciais: [] });
    expect(screen.queryByLabelText("Filtrar por organização...")).toBeNull();
    expect(screen.getByText("Nenhum comercial encontrado")).toBeInTheDocument();
  });
});
