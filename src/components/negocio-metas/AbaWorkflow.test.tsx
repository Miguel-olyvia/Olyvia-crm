// Testes de arranque: o conteúdo do workflow abre sem erro com os dados de exemplo e mostra o diagrama com
// o texto equivalente, e o botão "Workflow" abre-o num diálogo e fecha-o. Nada se grava, por isso não se
// testam cliques ao detalhe.
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AbaWorkflow } from "./AbaWorkflow";
import { BotaoWorkflow } from "./BotaoWorkflow";
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

describe("conteúdo do Workflow", () => {
  it("abre com o diagrama, o texto equivalente, o simulador e a configuração", () => {
    render(<WorkflowExemploProvider><AbaWorkflow /></WorkflowExemploProvider>);

    expect(screen.getByText("Exemplo: não grava na organização. A escolha fica só neste navegador.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Repor predefinição" })).toBeInTheDocument();

    const passos = within(screen.getByRole("list", { name: "Passos do negócio, por ordem" })).getAllByRole("listitem");
    expect(passos.map((p) => within(p).getAllByText(/^(Orçamento|Proposta|Contrato|Ganho)$/)[0].textContent)).toEqual([
      "Orçamento", "Proposta", "Contrato", "Ganho",
    ]);
    expect(screen.getByText("ganho: cria a proposta, para Proposta")).toBeInTheDocument();
    // A seta de perdido de cada passo vem por baixo, só em texto.
    expect(screen.getByText("perdido: perde o negócio se for o último orçamento")).toBeInTheDocument();
    expect(screen.getAllByText("perdido: perde o negócio")).toHaveLength(2);
    expect(screen.getByText(/Em Orçamento, se ganho: cria a proposta\. Em Orçamento, se perdido: perde o negócio se for o último orçamento\..*Perder um negócio pede sempre um motivo da lista de motivos de perda\./)).toHaveClass("sr-only");

    expect(screen.getByLabelText("Negócio de exemplo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aceitar a proposta" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Perder a proposta" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /orçamento|contrato/i })).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Resultado" })).toHaveTextContent("Escolha uma simulação para ver o resultado.");

    for (const legenda of ["Ao ganhar ou perder cada passo", "Fases em uso", "Motivos de perda"]) {
      expect(screen.getByText(legenda)).toBeInTheDocument();
    }
    // Matriz Ganho / Perdido: cinco células com opções e o Contrato ganho fixo (só leitura).
    for (const celula of ["Orçamento, Ganho", "Orçamento, Perdido", "Proposta, Ganho", "Proposta, Perdido", "Contrato, Ganho", "Contrato, Perdido"]) {
      expect(screen.getByRole("heading", { level: 5, name: celula })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("radio")).toHaveLength(16);

    // Títulos: h2 da aba, h3 por secção, h4 por grupo.
    expect(screen.getByRole("heading", { level: 2, name: "Workflow dos negócios" })).toBeInTheDocument();
    for (const nome of ["Fluxo do negócio", "Simulador", "Configuração"]) {
      expect(screen.getByRole("heading", { level: 3, name: nome })).toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { level: 4, name: "Ao ganhar ou perder cada passo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aceitar a proposta" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("botão Workflow", () => {
  const Pagina = () => {
    const [aberto, setAberto] = useState(false);
    return <WorkflowExemploProvider><BotaoWorkflow aberto={aberto} aoMudar={setAberto} /></WorkflowExemploProvider>;
  };

  it("abre o diálogo com o diagrama, foca o diálogo e fecha devolvendo o foco ao botão", async () => {
    render(<Pagina />);
    const botao = screen.getByRole("button", { name: "Workflow" });
    fireEvent.click(botao);

    const dialogo = await screen.findByRole("dialog", { name: "Workflow dos negócios" });
    expect(within(dialogo).getByRole("list", { name: "Passos do negócio, por ordem" })).toBeInTheDocument();
    await waitFor(() => expect(dialogo).toHaveFocus());
    expect(within(dialogo).getByRole("heading", { level: 2, name: "Workflow dos negócios" })).toBeInTheDocument();

    fireEvent.click(within(dialogo).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(botao).toHaveFocus();
  });
});
