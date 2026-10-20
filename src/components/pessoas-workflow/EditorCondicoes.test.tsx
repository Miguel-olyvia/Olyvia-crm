// O editor de condições do separador «Qualificação»: as 12 condições de Leads (11 tipos), duas colunas (Todas/Qualquer) por regra,
// cada uma um grupo com nome, e a lógica de marcar e desmarcar é a do catálogo de Leads.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import type { RuleGroup } from "@/components/leads/workflow/conditionCatalog";
import { EditorCondicoes } from "./EditorCondicoes";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
beforeAll(prepararRadixNoJsdom);

const ROTULOS = [
  "Tem comercial atribuído", "Tem canal/origem definida", "Já foi contactada", "Tem visita agendada", "Tem deal ativo", "Tem orçamento ativo",
  "Tem proposta ativa", "Tem contrato assinado", "Qualificação = MQL", "Qualificação = SQL", "Último contacto negativo", "Último contacto positivo",
];

function desenhar(valor: RuleGroup | null = null, sobre: Partial<Parameters<typeof EditorCondicoes>[0]> = {}) {
  const aoMudar = vi.fn();
  const r = render(
    <EditorCondicoes tom="mql" idBase="mql" titulo="Quando uma lead é MQL" descricao="Sinais que indicam interesse." valor={valor} aoMudar={aoMudar} {...sobre} />,
  );
  const grupo = screen.getByRole("group", { name: "Quando uma lead é MQL" });
  const coluna = (nome: RegExp) => within(grupo).getByRole("group", { name: nome });
  return { ...r, aoMudar, grupo, todas: () => coluna(/Todas/), qualquer: () => coluna(/Qualquer/) };
}

describe("EditorCondicoes: estrutura", () => {
  it("é um grupo com o título da regra e dois grupos dentro: Todas (AND) e Qualquer (OU)", () => {
    const { grupo, todas, qualquer } = desenhar();
    expect(grupo).toBeInTheDocument();
    expect(todas()).toBeInTheDocument();
    expect(qualquer()).toBeInTheDocument();
    expect(screen.getByText("Sinais que indicam interesse.")).toBeInTheDocument();
  });

  it("cada coluna tem as 12 condições de Leads, com os rótulos de Leads, e nenhuma outra", () => {
    const { todas, qualquer } = desenhar();
    for (const coluna of [todas(), qualquer()]) {
      expect(within(coluna).getAllByRole("checkbox").map((c) => c.getAttribute("aria-label") ?? c.id)).toHaveLength(12);
      for (const rotulo of ROTULOS) expect(within(coluna).getByRole("checkbox", { name: rotulo })).toBeInTheDocument();
    }
  });

  it("cada coluna explica-se em texto visível, ligado ao grupo (não só num tooltip)", () => {
    const { todas, qualquer } = desenhar();
    expect(todas()).toHaveAccessibleDescription(/todas têm de ser verdadeiras/i);
    expect(qualquer()).toHaveAccessibleDescription(/basta que uma/i);
  });

  it("os identificadores são únicos mesmo com duas regras (MQL e SQL) na página", () => {
    render(<EditorCondicoes tom="sql" idBase="sql" titulo="Quando uma lead é SQL" descricao="x" valor={null} aoMudar={() => undefined} />);
    desenhar();
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cada condição tem uma linha com pelo menos 44 px de altura", () => {
    const { todas } = desenhar();
    const caixa = within(todas()).getByRole("checkbox", { name: "Tem comercial atribuído" });
    expect(caixa.closest("div")?.className).toContain("min-h-11");
  });
});

describe("EditorCondicoes: o que está marcado", () => {
  const valor: RuleGroup = {
    all: [{ type: "has_source" }, { type: "qualification_is", value: "sql" }],
    any: [{ type: "has_source" }, { type: "has_signed_contract" }],
  };

  it("reflete a regra: cada coluna marca as suas condições, e uma pode estar nas duas", () => {
    const { todas, qualquer } = desenhar(valor);
    const marcadas = (c: HTMLElement) => within(c).getAllByRole("checkbox").filter((x) => x.getAttribute("aria-checked") === "true").length;
    expect(marcadas(todas())).toBe(2);
    expect(marcadas(qualquer())).toBe(2);
    expect(within(todas()).getByRole("checkbox", { name: "Qualificação = SQL" })).toBeChecked();
    expect(within(todas()).getByRole("checkbox", { name: "Qualificação = MQL" })).not.toBeChecked();
    expect(within(qualquer()).getByRole("checkbox", { name: "Tem contrato assinado" })).toBeChecked();
    expect(within(qualquer()).getByRole("checkbox", { name: "Qualificação = SQL" })).not.toBeChecked();
  });

  it("sem regra, nada está marcado", () => {
    const { grupo } = desenhar(null);
    expect(within(grupo).getAllByRole("checkbox").every((c) => c.getAttribute("aria-checked") === "false")).toBe(true);
  });
});

describe("EditorCondicoes: marcar e desmarcar", () => {
  it("marcar na coluna Todas acrescenta a condição só a «all», sem estragar «any»", () => {
    const { aoMudar, todas } = desenhar({ all: [], any: [{ type: "has_signed_contract" }] });
    fireEvent.click(within(todas()).getByRole("checkbox", { name: "Já foi contactada" }));
    expect(aoMudar).toHaveBeenCalledTimes(1);
    expect(aoMudar).toHaveBeenCalledWith({ all: [{ type: "has_contact_logged" }], any: [{ type: "has_signed_contract" }] });
  });

  it("marcar na coluna Qualquer acrescenta só a «any»", () => {
    const { aoMudar, qualquer } = desenhar(null);
    fireEvent.click(within(qualquer()).getByRole("checkbox", { name: "Qualificação = MQL" }));
    expect(aoMudar).toHaveBeenCalledWith({ all: [], any: [{ type: "qualification_is", value: "mql" }] });
  });

  it("desmarcar a última condição devolve null (sem regra)", () => {
    const { aoMudar, todas } = desenhar({ all: [{ type: "has_source" }], any: [] });
    fireEvent.click(within(todas()).getByRole("checkbox", { name: "Tem canal/origem definida" }));
    expect(aoMudar).toHaveBeenCalledWith(null);
  });

  it("desmarcar numa coluna deixa a mesma condição da outra", () => {
    const { aoMudar, todas } = desenhar({ all: [{ type: "has_source" }], any: [{ type: "has_source" }] });
    fireEvent.click(within(todas()).getByRole("checkbox", { name: "Tem canal/origem definida" }));
    expect(aoMudar).toHaveBeenCalledWith({ all: [], any: [{ type: "has_source" }] });
  });
});

describe("EditorCondicoes: desativado", () => {
  it("com desativado, todas as caixas ficam desativadas e não mudam nada", () => {
    const { aoMudar, grupo } = desenhar(null, { desativado: true });
    const caixas = within(grupo).getAllByRole("checkbox");
    expect(caixas).toHaveLength(24);
    expect(caixas.every((c) => (c as HTMLButtonElement).disabled)).toBe(true);
    fireEvent.click(caixas[0]);
    expect(aoMudar).not.toHaveBeenCalled();
  });
});
