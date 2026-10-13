// Um teste de arranque: a aba abre sem erro com os dados de exemplo e mostra o diagrama com
// o texto equivalente. A aba não grava nada, por isso não se testam cliques ao detalhe.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AbaWorkflow } from "./AbaWorkflow";
import { WorkflowExemploProvider } from "./useWorkflowExemplo";

vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) => {
        let texto = negocioMetasTranslations.pt[key] ?? key;
        Object.entries(params ?? {}).forEach(([k, v]) => {
          texto = texto.replace(`{${k}}`, String(v));
        });
        return texto;
      },
    }),
  };
});

beforeEach(() => window.localStorage.clear());

describe("aba Workflow", () => {
  it("abre com o diagrama, o texto equivalente, o simulador e a configuração", () => {
    render(<WorkflowExemploProvider><AbaWorkflow /></WorkflowExemploProvider>);

    expect(screen.getByText("Exemplo: não grava na organização. A escolha fica só neste navegador.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Repor predefinição" })).toBeInTheDocument();

    const passos = within(screen.getByRole("list", { name: "Passos do negócio, por ordem" })).getAllByRole("listitem");
    expect(passos.map((p) => within(p).getAllByText(/^(Orçamento|Proposta|Contrato|Ganho)$/)[0].textContent)).toEqual([
      "Orçamento", "Proposta", "Contrato", "Ganho",
    ]);
    expect(screen.getByText("aceite: cria a proposta, para Proposta")).toBeInTheDocument();
    expect(screen.getByText("Perdido, com motivo, possível em qualquer fase")).toBeInTheDocument();
    expect(screen.getByText(/Ao aceitar o orçamento, cria a proposta.*Perdido, com motivo, é possível em qualquer fase\./)).toHaveClass("sr-only");

    expect(screen.getByLabelText("Negócio de exemplo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simular aceitar a proposta" })).toBeEnabled();
    expect(screen.getByRole("status", { name: "Resultado" })).toHaveTextContent("Escolha uma simulação para ver o resultado.");

    for (const legenda of ["A · Ao aceitar o orçamento", "B · Ao aceitar a proposta", "C · Fases em uso", "F · Motivos de perda"]) {
      expect(screen.getByText(legenda)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("radio")).toHaveLength(7);

    // Títulos: h2 da aba, h3 por secção, h4 por grupo.
    expect(screen.getByRole("heading", { level: 2, name: "Workflow dos negócios" })).toBeInTheDocument();
    for (const nome of ["Fluxo do negócio", "Simulador", "Configuração"]) {
      expect(screen.getByRole("heading", { level: 3, name: nome })).toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { level: 4, name: "A · Ao aceitar o orçamento" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simular aceitar a proposta" })).toHaveAttribute("aria-pressed", "false");
  });
});
