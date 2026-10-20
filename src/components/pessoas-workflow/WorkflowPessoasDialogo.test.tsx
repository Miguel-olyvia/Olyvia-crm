// O diálogo do Workflow de Pessoas: título, separador «Qualificação» (o «Levantamento» é de uma fase seguinte), foco ao abrir e ao fechar,
// e não se fecha enquanto grava. O hook das regras é simulado.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import type { RegrasQualificacaoHook } from "@/hooks/pessoas/workflow/useRegrasQualificacao";
import { WorkflowPessoasDialogo } from "./WorkflowPessoasDialogo";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));


vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
const usarRegras = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/workflow/useRegrasQualificacao", () => ({ useRegrasQualificacao: (h: boolean) => usarRegras(h) }));
beforeAll(prepararRadixNoJsdom);

const hook = (sobre: Partial<RegrasQualificacaoHook> = {}): RegrasQualificacaoHook => ({
  dados: { mql: null, sql: null, descartadas: 0 }, isLoading: false, isError: false, aGuardar: false,
  guardar: vi.fn(), recarregar: vi.fn(), ...sobre,
});

beforeEach(() => { usarRegras.mockReset(); usarRegras.mockReturnValue(hook()); });

const desenhar = (aberto = true, sobre: Partial<Parameters<typeof WorkflowPessoasDialogo>[0]> = {}) => {
  const props = { aberto, aoMudarAberto: vi.fn(), aoFocarOrigem: vi.fn(), ...sobre };
  return { ...render(<WorkflowPessoasDialogo {...props} />), props };
};

describe("WorkflowPessoasDialogo", () => {
  it("fechado não mostra nada e não lê as regras", () => {
    desenhar(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(usarRegras).toHaveBeenCalledWith(false);
  });

  it("aberto: diálogo com título e descrição, e as regras passam a ser lidas", () => {
    desenhar();
    const d = screen.getByRole("dialog", { name: "Configuração de Workflow" });
    expect(d).toHaveAccessibleDescription(/Pessoas desta organização/);
    expect(usarRegras).toHaveBeenCalledWith(true);
  });

  it("tem só o separador «Qualificação», selecionado, com o conteúdo das regras MQL e SQL (o «Levantamento» fica para a fase seguinte)", () => {
    desenhar();
    const lista = screen.getByRole("tablist", { name: "Secções do Workflow" });
    const separadores = within(lista).getAllByRole("tab");
    expect(separadores.map((s) => s.textContent)).toEqual(["Qualificação"]);
    expect(separadores[0]).toHaveAttribute("aria-selected", "true");
    const painel = screen.getByRole("tabpanel", { name: "Qualificação" });
    expect(within(painel).getByRole("group", { name: "Quando uma lead é MQL" })).toBeInTheDocument();
    expect(within(painel).getByRole("group", { name: "Quando uma lead é SQL" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /levantamento/i })).toBeNull();
  });

  it("ao abrir o foco fica dentro do diálogo", () => {
    desenhar();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("Escape pede para fechar", () => {
    const { props } = desenhar();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(props.aoMudarAberto).toHaveBeenCalledWith(false);
  });

  it("ao fechar, devolve o foco à origem (o botão Workflow) pelo callback", async () => {
    const { rerender, props } = desenhar();
    rerender(<WorkflowPessoasDialogo {...props} aberto={false} />);
    await waitFor(() => expect(props.aoFocarOrigem).toHaveBeenCalled());
  });

  it("a gravar: Escape não fecha e o botão de fechar sai (o resultado não chegava a ninguém)", () => {
    usarRegras.mockReturnValue(hook({ aGuardar: true }));
    const { props } = desenhar();
    expect(screen.queryByRole("button", { name: /close|fechar/i })).toBeNull();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(props.aoMudarAberto).not.toHaveBeenCalled();
  });

  it("com o botão de fechar visível quando não grava", () => {
    desenhar();
    expect(screen.getByRole("button", { name: /close|fechar/i })).toBeInTheDocument();
  });
});
