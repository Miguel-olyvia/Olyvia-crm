import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { CartaoPosContrato } from "@/hooks/pessoas/adaptarCartaoPosContrato";
import type { QuadroPosContratoEstado } from "@/hooks/pessoas/useQuadroPosContrato";
import { cartaoQuadro, quadroBase } from "./fabricaQuadro";
import { QuadroReal } from "./QuadroReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

const cartaoPos = (id: string, sobre: Partial<CartaoPosContrato> = {}): CartaoPosContrato => ({
  id: `neg-${id}`, pessoaId: id, nome: `Pessoa ${id}`, papel: "cliente", coluna: "financeiro", trabalho: `Trabalho ${id}`, valor: null, passo: "Validar o pagamento", ...sobre,
});

function pos(cartoes: CartaoPosContrato[] = [], sobre: Partial<QuadroPosContratoEstado> = {}): QuadroPosContratoEstado {
  const vazia = { cursor: null, haMais: false, valor: 0 };
  const dela = (id: "financeiro" | "obra") => cartoes.filter((c) => c.coluna === id);
  return {
    colunas: { financeiro: { ...vazia, cartoes: dela("financeiro"), total: dela("financeiro").length }, obra: { ...vazia, cartoes: dela("obra"), total: dela("obra").length } },
    cartoes, isLoading: false, isError: false, erro: null, aCarregarMais: new Set(), errosAoCarregarMais: {},
    carregarMais: () => false, recarregar: () => undefined, ...sobre,
  };
}

const CARTOES = [cartaoQuadro("a", { nome: "Ana Lopes" })];
const props = () => ({ temFiltros: false, aoAbrir: vi.fn(), aoLimpar: vi.fn() });

describe("QuadroReal com as colunas Financeiro e Obra", () => {
  it("sem o estado do pós-contrato continua com as 4 regiões (o Quadro das Pessoas não muda)", () => {
    render(<QuadroReal quadro={quadroBase({}, CARTOES)} {...props()} />);
    expect(screen.getAllByRole("region")).toHaveLength(4);
    expect(screen.queryByRole("region", { name: /^Financeiro/ })).toBeNull();
  });

  it("com o estado, passa a 6 regiões e 6 títulos h3: Novo, Contactado, Visita, Negócio, Financeiro, Obra, por esta ordem", () => {
    render(<QuadroReal quadro={quadroBase({}, CARTOES)} posContrato={pos()} {...props()} />);
    expect(screen.getAllByRole("region")).toHaveLength(6);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => /^[^,]+/.exec(h.textContent ?? "")?.[0])).toEqual([
      "Novo", "Contactado", "Visita", "Negócio", "Financeiro", "Obra",
    ]);
  });

  it("o cartão de Financeiro abre a pessoa já no negócio dele", () => {
    const { aoAbrir, ...resto } = props();
    render(<QuadroReal quadro={quadroBase({}, CARTOES)} posContrato={pos([cartaoPos("f")])} aoAbrir={aoAbrir} {...resto} />);
    fireEvent.click(within(screen.getByRole("region", { name: /^Financeiro/ })).getByRole("button", { name: "Abrir a ficha de Pessoa f" }));
    expect(aoAbrir).toHaveBeenCalledWith("f", "neg-f");
  });

  it("o atalho «o» abre a ficha do cartão de Obra focado (j/k percorrem também as colunas novas)", () => {
    const { aoAbrir, ...resto } = props();
    render(<QuadroReal quadro={quadroBase({}, CARTOES)} posContrato={pos([cartaoPos("o", { coluna: "obra", passo: "Operações: arrancar a obra" })])} aoAbrir={aoAbrir} {...resto} />);
    const a = screen.getByRole("button", { name: "Abrir a ficha de Ana Lopes" });
    a.focus();
    fireEvent.keyDown(a, { key: "j" });
    expect(screen.getByRole("button", { name: "Abrir a ficha de Pessoa o" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "o" });
    expect(aoAbrir).toHaveBeenLastCalledWith("o", "neg-o");
  });

  it("um quadro só com cartões de Financeiro não diz que está vazio", () => {
    render(<QuadroReal quadro={quadroBase()} posContrato={pos([cartaoPos("f")])} {...props()} />);
    expect(screen.queryByText("Ainda não há cartões no quadro.")).toBeNull();
  });

  it("sem cartões em lado nenhum diz que está vazio, e as duas colunas novas continuam visíveis", () => {
    render(<QuadroReal quadro={quadroBase()} posContrato={pos()} {...props()} />);
    expect(screen.getByText("Ainda não há cartões no quadro.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /^Obra/ })).toBeInTheDocument();
  });

  it("com Financeiro e Obra ainda a carregar ou em erro, não se diz que o quadro está vazio", () => {
    for (const parcial of [{ isLoading: true }, { isError: true }]) {
      const { unmount } = render(<QuadroReal quadro={quadroBase()} posContrato={pos([], parcial)} {...props()} />);
      expect(screen.queryByText("Ainda não há cartões no quadro.")).toBeNull();
      unmount();
    }
  });

  it("erro do quadro principal sem dados continua a bloquear só o quadro, sem desenhar as colunas novas", () => {
    render(<QuadroReal quadro={quadroBase({ isError: true, erroSemDados: true })} posContrato={pos()} {...props()} />);
    expect(screen.queryByRole("region")).toBeNull();
  });
});
