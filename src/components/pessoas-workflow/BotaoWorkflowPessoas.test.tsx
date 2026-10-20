// O botão «Workflow» do cabeçalho de Pessoas: abre o diálogo e devolve-lhe o foco ao fechar. (Quem o mostra é o PessoasReal, com a
// permissão pessoas.config: ver PessoasRealWorkflow.test.tsx.) O hook das regras é simulado.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { BotaoWorkflowPessoas } from "./BotaoWorkflowPessoas";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));


vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
const usarRegras = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/workflow/useRegrasQualificacao", () => ({ useRegrasQualificacao: (h: boolean) => usarRegras(h) }));
beforeAll(prepararRadixNoJsdom);
beforeEach(() => {
  usarRegras.mockReset();
  usarRegras.mockReturnValue({
    dados: { mql: null, sql: null, descartadas: 0 }, isLoading: false, isError: false, aGuardar: false, guardar: vi.fn(), recarregar: vi.fn(),
  });
});

describe("BotaoWorkflowPessoas", () => {
  it("é um botão «Workflow» de 44 px, com o ícone escondido ao leitor de ecrã, e o diálogo começa fechado", () => {
    render(<BotaoWorkflowPessoas />);
    const b = screen.getByRole("button", { name: "Workflow" });
    expect(b.className).toContain("min-h-11");
    expect(b.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("um clique abre o diálogo do Workflow", () => {
    render(<BotaoWorkflowPessoas />);
    fireEvent.click(screen.getByRole("button", { name: "Workflow" }));
    expect(screen.getByRole("dialog", { name: "Configuração de Workflow" })).toBeInTheDocument();
  });

  it("ao fechar com Escape o foco volta ao botão", async () => {
    render(<BotaoWorkflowPessoas />);
    const b = screen.getByRole("button", { name: "Workflow" });
    b.focus();
    fireEvent.click(b);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(b).toHaveFocus();
  });

  it("reabre e fecha mais do que uma vez", async () => {
    render(<BotaoWorkflowPessoas />);
    for (let i = 0; i < 2; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Workflow" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
  });
});
