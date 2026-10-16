/**
 * Visao geral da ficha: cada cartao clicavel (Estado do ponto, Ausencias, Folha de horas, Compensacoes) e UM so ponto
 * de paragem do Tab, e o proprio botao. Nada de um contentor focavel com um botao dentro (duas paragens para o mesmo
 * cartao), e o clique continua a abrir o separador certo.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ language: "pt", t: (chave: string) => chave }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import { PessoaVisaoGeralTab } from "@/components/hr/PessoaVisaoGeralTab";
import type { Pessoa } from "@/types/hr";

const PESSOA = { id: "p1", email_trabalho: null, data_admissao: null } as unknown as Pessoa;

function montar(onAbrirSeparador = vi.fn()) {
  const { container } = render(
    <PessoaVisaoGeralTab
      pessoa={PESSOA} reportaANome={null} entidadeLegalNome={null} vinculos={[]} horarioRealizado={[]} retribuicao={null}
      podeVerRealizado podeVerAusencias={false} podeVerRetribuicao onAbrirSeparador={onAbrirSeparador}
    />,
  );
  return { container, onAbrirSeparador };
}

/** Os elementos que o Tab alcanca: botoes e qualquer coisa com tabindex >= 0. */
function paragensDoTab(raiz: HTMLElement): HTMLElement[] {
  return [...raiz.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]")].filter(
    (el) => el.getAttribute("tabindex") !== "-1" && !el.hasAttribute("disabled"),
  );
}

describe("Visao geral: um so ponto de paragem por cartao", () => {
  it("nenhum contentor nao-interactivo e focavel (sem tabindex em divs)", () => {
    const { container } = montar();
    const divsFocaveis = [...container.querySelectorAll("div[tabindex]")].filter((d) => d.getAttribute("tabindex") !== "-1");
    expect(divsFocaveis).toEqual([]);
  });

  it("o cartao do ponto contem um botao que e a unica paragem, e nao tem outro focavel dentro", () => {
    const { container } = montar();
    const cartao = screen.getByRole("button", { name: "hr.visaoGeral.cards.ponto" });
    expect(paragensDoTab(cartao)).toEqual([]);
    expect(cartao.closest("[tabindex]:not(button)")).toBeNull();
    expect(paragensDoTab(container).filter((el) => el === cartao || cartao.contains(el))).toEqual([cartao]);
  });

  it("cada cartao clicavel e exactamente uma paragem do Tab: os botoes, e mais nada", () => {
    const { container } = montar();
    const botoes = screen.getAllByRole("button");
    expect(botoes).toHaveLength(4);
    expect(paragensDoTab(container)).toEqual(botoes);
  });

  it("o clique no cartao continua a abrir o separador", () => {
    const { onAbrirSeparador } = montar();
    fireEvent.click(screen.getByRole("button", { name: "hr.visaoGeral.cards.ponto" }));
    expect(onAbrirSeparador).toHaveBeenCalledWith("planeamento");
  });
});
