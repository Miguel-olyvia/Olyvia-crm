// A classificação MQL/SQL à mão na ficha real (o cartão «Qualificação comercial» de Leads, em Pessoas): classificar, promover, limpar,
// erros traduzidos e sem permissão ou sem lead não há nada para fazer.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ErroNeg } from "@/hooks/pessoas/chamarNeg";
import { CHAVES_ERRO_NEG } from "@/hooks/pessoas/errosNeg";
import type { TipoQualificacao } from "@/hooks/pessoas/useQualificarLeadPessoa";
import { QualificacaoManualFichaReal } from "./QualificacaoManualFichaReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

type Props = Parameters<typeof QualificacaoManualFichaReal>[0];
function desenhar(sobre: Partial<Props> = {}) {
  const aoClassificar = vi.fn<(t: TipoQualificacao) => Promise<unknown>>().mockResolvedValue(undefined);
  const props: Props = { leadId: "lead-1", qualificacao: undefined, podeEditar: true, aoClassificar, ...sobre };
  return { aoClassificar, ...render(<QualificacaoManualFichaReal {...props} />) };
}
const botao = (nome: RegExp | string) => screen.getByRole("button", { name: nome });

describe("QualificacaoManualFichaReal: sem classificação", () => {
  it("oferece MQL e SQL com a descrição de cada um, como em Leads", () => {
    desenhar();
    expect(screen.getByRole("heading", { name: "Qualificação comercial" })).toBeInTheDocument();
    expect(botao(/classificar como mql/i)).toBeInTheDocument();
    expect(botao(/classificar como sql/i)).toBeInTheDocument();
    expect(screen.getByText(/Demonstrou interesse/)).toBeInTheDocument();
    expect(screen.getByText(/Já validada pelo comercial/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /limpar/i })).toBeNull();
  });

  it.each([["mql", /classificar como mql/i], ["sql", /classificar como sql/i]] as const)("%s: chama a gravação com o tipo e anuncia", async (tipo, nome) => {
    const { aoClassificar } = desenhar();
    fireEvent.click(botao(nome));
    await waitFor(() => expect(aoClassificar).toHaveBeenCalledExactlyOnceWith(tipo));
  });
});

describe("QualificacaoManualFichaReal: com classificação", () => {
  it("MQL: mostra o selo, oferece promover a SQL e limpar", async () => {
    const { aoClassificar } = desenhar({ qualificacao: "MQL" });
    expect(screen.getByText("MQL")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /classificar como mql/i })).toBeNull();
    fireEvent.click(botao("Promover a SQL"));
    await waitFor(() => expect(aoClassificar).toHaveBeenCalledWith("sql"));
  });

  it("SQL: oferece voltar a MQL e limpar; limpar manda null", async () => {
    const { aoClassificar } = desenhar({ qualificacao: "SQL" });
    expect(screen.getByText("SQL")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Promover a SQL" })).toBeNull();
    fireEvent.click(botao("Limpar classificação"));
    await waitFor(() => expect(aoClassificar).toHaveBeenCalledWith(null));
    fireEvent.click(botao("Passar a MQL"));
    await waitFor(() => expect(aoClassificar).toHaveBeenCalledWith("mql"));
  });
});

describe("QualificacaoManualFichaReal: teclado e leitor de ecrã", () => {
  const titulo = () => screen.getByRole("heading", { name: "Qualificação comercial" });

  it.each([
    ["classificar como MQL", undefined, /classificar como mql/i],
    ["promover a SQL", "MQL", "Promover a SQL"],
    ["limpar", "SQL", "Limpar classificação"],
  ] as const)("depois de %s o foco não cai no corpo: vai para o título da secção", async (_nome, qualificacao, rotulo) => {
    const { aoClassificar } = desenhar({ qualificacao });
    fireEvent.click(botao(rotulo));
    await waitFor(() => expect(aoClassificar).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(titulo()).toHaveFocus());
  });

  it("o foco fica no título mesmo quando a ficha se refaz com a classificação nova (o botão clicado já não existe)", async () => {
    const { aoClassificar, rerender } = desenhar();
    aoClassificar.mockImplementation(async () => {
      rerender(<QualificacaoManualFichaReal leadId="lead-1" qualificacao="MQL" podeEditar aoClassificar={aoClassificar} />);
    });
    fireEvent.click(botao(/classificar como mql/i));
    await waitFor(() => expect(screen.queryByRole("button", { name: /classificar como mql/i })).toBeNull());
    await waitFor(() => expect(titulo()).toHaveFocus());
  });

  it("uma falha não rouba o foco: o botão clicado continua onde estava", async () => {
    const { aoClassificar } = desenhar();
    aoClassificar.mockRejectedValue(new ErroNeg(new Error("x"), "42501", CHAVES_ERRO_NEG["42501"]));
    fireEvent.click(botao(/classificar como sql/i));
    await screen.findByRole("alert");
    expect(titulo()).not.toHaveFocus();
  });

  it("o selo diz-se uma só vez ao leitor de ecrã: o selo visual fica escondido e o texto completo é o que se lê", () => {
    desenhar({ qualificacao: "MQL" });
    expect(screen.getByText("MQL")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText(/Marketing Qualified Lead|Marketing/)).not.toHaveAttribute("aria-hidden");
  });
});

describe("QualificacaoManualFichaReal: falhas e limites", () => {
  it("um erro da base aparece traduzido (nunca o texto cru) e os botões continuam disponíveis", async () => {
    const { aoClassificar } = desenhar();
    aoClassificar.mockRejectedValue(new ErroNeg(new Error("texto cru da base"), "42501", CHAVES_ERRO_NEG["42501"]));
    fireEvent.click(botao(/classificar como sql/i));
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).not.toMatch(/texto cru/);
    expect(alerta.textContent?.trim()).not.toBe("");
    expect(botao(/classificar como sql/i)).not.toHaveAttribute("aria-disabled", "true");
  });

  it("enquanto grava, o segundo clique é ignorado (um só pedido)", async () => {
    let acabar: () => void = () => undefined;
    const { aoClassificar } = desenhar();
    aoClassificar.mockReturnValue(new Promise<void>((r) => { acabar = r; }));
    fireEvent.click(botao(/classificar como mql/i));
    fireEvent.click(botao(/classificar como sql/i));
    expect(aoClassificar).toHaveBeenCalledTimes(1);
    expect(botao(/classificar como sql/i)).toHaveAttribute("aria-disabled", "true");
    acabar();
    await waitFor(() => expect(botao(/classificar como sql/i)).not.toHaveAttribute("aria-disabled", "true"));
  });

  it("sem lead ou sem permissão para editar não desenha nada", () => {
    const a = desenhar({ leadId: null });
    expect(a.container).toBeEmptyDOMElement();
    a.unmount();
    const b = desenhar({ podeEditar: false });
    expect(b.container).toBeEmptyDOMElement();
  });
});
