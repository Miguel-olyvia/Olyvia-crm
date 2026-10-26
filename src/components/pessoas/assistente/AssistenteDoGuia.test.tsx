// O assistente de passos (a apresentação, como no protótipo): a coluna com os passos (visto, atual com aria-current, «!» com falta) e «Fases feitas»,
// o cabeçalho «Passo N de M · faltam X respostas · tempo», o título com ícone, o corpo do passo e o rodapé «Anterior», «Ir para "..."» e «Continuar».
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AssistenteDoGuia } from "./AssistenteDoGuia";
import { useAssistente } from "./useAssistente";
import type { PassoAssistente } from "./tiposAssistente";
import type { FaseFeita } from "../processo/passoGuiado";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));
afterEach(cleanup);

const p = (id: string, extra: Partial<PassoAssistente> = {}): PassoAssistente => ({
  id, rotuloChave: `pessoasPagina.assistente.passo.${id}`, icone: "telefone", obrigatorias: 2, respondidas: 0, precisaNegocio: false, ...extra,
});
const PASSOS = [p("chamada", { obrigatorias: 1, respondidas: 1 }), p("qualificacao", { obrigatorias: 6 }), p("morada", { obrigatorias: 3 }), p("preparar"), p("marcar", { obrigatorias: 1 })];
const FEITA: FaseFeita = { id: "porContactar", rotuloChave: "pessoasPagina.board.col.porContactar", estado: "feita", itens: [] };

function Ecra({ passos = PASSOS, aoContinuar, inicial, feitas = [], aoVerFase = vi.fn() }: {
  passos?: PassoAssistente[]; aoContinuar?: (p: PassoAssistente) => Promise<string | null> | string | null; inicial?: number;
  feitas?: FaseFeita[]; aoVerFase?: (id: string) => void;
}) {
  const assistente = useAssistente(passos, { inicial });
  return (
    <AssistenteDoGuia
      faseRotuloChave="pessoasPagina.board.col.contactado" passos={passos} assistente={assistente} feitas={feitas} aoVerFase={aoVerFase} nivel="h3"
      aoContinuar={aoContinuar} renderCorpo={(passo) => <p>corpo de {passo.id}</p>}
    />
  );
}

describe("AssistenteDoGuia: a coluna", () => {
  it("lista os passos da fase, com o atual realçado por aria-current e o estado dito em texto", () => {
    render(<Ecra inicial={1} />);
    const coluna = screen.getByRole("navigation", { name: "Passos da fase" });
    const botoes = within(coluna).getAllByRole("button");
    expect(botoes).toHaveLength(5);
    expect(botoes[1]).toHaveAttribute("aria-current", "step");
    expect(botoes[0]).not.toHaveAttribute("aria-current");
    expect(within(botoes[0]).getByText(/feito/)).toBeInTheDocument();
    expect(within(botoes[1]).getByText(/passo atual/)).toBeInTheDocument();
    expect(within(botoes[3]).getByText(/por fazer/)).toBeInTheDocument();
  });

  it("um passo visitado que ficou com falta mostra «com falta» (e não só a cor)", () => {
    render(<Ecra inicial={1} />);
    const coluna = within(screen.getByRole("navigation", { name: "Passos da fase" }));
    fireEvent.click(coluna.getByRole("button", { name: /Morada da obra/ }));
    expect(within(coluna.getByRole("button", { name: /Qualificação/ })).getByText(/com falta/)).toBeInTheDocument();
  });

  it("clicar num passo vai para ele", () => {
    render(<Ecra inicial={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Preparar a visita/ }));
    expect(screen.getByText("corpo de preparar")).toBeInTheDocument();
  });

  it("«Fases feitas» só existe quando há fases feitas e cada uma reabre-se", () => {
    const aoVerFase = vi.fn();
    const { rerender } = render(<Ecra />);
    expect(screen.queryByText("Fases feitas")).not.toBeInTheDocument();
    cleanup();
    render(<Ecra feitas={[FEITA]} aoVerFase={aoVerFase} />);
    expect(screen.getByText("Fases feitas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Por contactar" }));
    expect(aoVerFase).toHaveBeenCalledWith("porContactar");
    void rerender;
  });
});

describe("AssistenteDoGuia: o cabeçalho e o título", () => {
  it("diz «Passo N de M · faltam X respostas · tempo» e o título leva o nome do passo", () => {
    render(<Ecra inicial={3} />);
    expect(screen.getByText("Passo 4 de 5 · faltam 2 respostas · menos de 1 minuto")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Preparar a visita" })).toBeInTheDocument();
  });

  it("uma resposta que falta diz-se no singular e um passo completo diz «completo»", () => {
    const { unmount } = render(<Ecra inicial={4} />);
    expect(screen.getByText("Passo 5 de 5 · falta 1 resposta · menos de 1 minuto")).toBeInTheDocument();
    unmount();
    render(<Ecra inicial={0} />);
    expect(screen.getByText("Passo 1 de 5 · completo")).toBeInTheDocument();
  });

  it("muitas respostas contam minutos", () => {
    render(<Ecra passos={[p("a", { obrigatorias: 25 })]} />);
    expect(screen.getByText("Passo 1 de 1 · faltam 25 respostas · cerca de 3 min")).toBeInTheDocument();
  });

  it("o título de uma secção do levantamento é o texto que veio da base", () => {
    render(<Ecra passos={[p("seccao:exterior", { rotuloChave: undefined, rotulo: "Exterior do edifício" })]} />);
    expect(screen.getByRole("heading", { level: 3, name: "Exterior do edifício" })).toBeInTheDocument();
  });
});

describe("AssistenteDoGuia: o rodapé", () => {
  it("mostra o corpo do passo atual", () => {
    render(<Ecra inicial={2} />);
    expect(screen.getByText("corpo de morada")).toBeInTheDocument();
  });

  it("Anterior está desativado no primeiro passo e recua nos outros", () => {
    render(<Ecra inicial={0} />);
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    cleanup();
    render(<Ecra inicial={2} />);
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(screen.getByText("corpo de qualificacao")).toBeInTheDocument();
  });

  it("«Ir para» salta para o próximo passo que ainda falta e diz o nome dele", () => {
    render(<Ecra passos={[p("chamada", { obrigatorias: 1, respondidas: 1 }), p("qualificacao", { obrigatorias: 6, respondidas: 6 }), p("morada"), p("preparar"), p("marcar")]} inicial={0} />);
    fireEvent.click(screen.getByRole("button", { name: 'Ir para "Morada da obra"' }));
    expect(screen.getByText("corpo de morada")).toBeInTheDocument();
  });

  it("no último passo não há «Ir para» nem «Continuar»", () => {
    render(<Ecra inicial={4} />);
    expect(screen.queryByRole("button", { name: /Ir para/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuar" })).not.toBeInTheDocument();
  });

  it("Continuar avança um passo", async () => {
    render(<Ecra inicial={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByText("corpo de qualificacao")).toBeInTheDocument());
  });

  it("Continuar grava primeiro (aoContinuar) e só avança se correu bem", async () => {
    const aoContinuar = vi.fn().mockResolvedValue(null);
    render(<Ecra inicial={1} aoContinuar={aoContinuar} />);
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByText("corpo de morada")).toBeInTheDocument());
    expect(aoContinuar).toHaveBeenCalledWith(expect.objectContaining({ id: "qualificacao" }));
  });

  it("se gravar falha, fica no passo e diz porquê num alerta", async () => {
    const aoContinuar = vi.fn().mockResolvedValue("Não foi possível guardar.");
    render(<Ecra inicial={1} aoContinuar={aoContinuar} />);
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível guardar.");
    expect(screen.getByText("corpo de qualificacao")).toBeInTheDocument();
  });

  it("se quem grava rebenta em vez de devolver o erro, fica no passo e diz-o em geral", async () => {
    const aoContinuar = vi.fn().mockRejectedValue(new Error("rebentou"));
    render(<Ecra inicial={1} aoContinuar={aoContinuar} />);
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível guardar este passo.");
    expect(screen.getByText("corpo de qualificacao")).toBeInTheDocument();
  });

  it("enquanto grava o botão fica ocupado e um segundo clique não grava outra vez", async () => {
    let resolver: (v: string | null) => void = () => undefined;
    const aoContinuar = vi.fn().mockImplementation(() => new Promise<string | null>((r) => { resolver = r; }));
    render(<Ecra inicial={1} aoContinuar={aoContinuar} />);
    const botao = screen.getByRole("button", { name: "Continuar" });
    fireEvent.click(botao);
    fireEvent.click(botao);
    expect(aoContinuar).toHaveBeenCalledTimes(1);
    expect(botao).toHaveAttribute("aria-busy", "true");
    await act(async () => resolver(null));
    await waitFor(() => expect(screen.getByText("corpo de morada")).toBeInTheDocument());
  });

  it("mostra por baixo do passo o que o guia trouxe (o prazo, «Alterar prazo»...)", () => {
    const passos = [p("chamada")];
    function ComExtra() {
      const assistente = useAssistente(passos);
      return <AssistenteDoGuia faseRotuloChave="pessoasPagina.board.col.contactado" passos={passos} assistente={assistente} feitas={[]} aoVerFase={vi.fn()} nivel="h3" renderCorpo={() => <p>corpo</p>} extra={<button type="button">Alterar prazo</button>} />;
    }
    render(<ComExtra />);
    expect(screen.getByRole("button", { name: "Alterar prazo" })).toBeInTheDocument();
  });

  it("o foco vai para o título quando o passo muda (e não à entrada)", () => {
    render(<Ecra inicial={0} />);
    expect(screen.getByRole("heading", { level: 3 })).not.toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    return waitFor(() => expect(screen.getByRole("heading", { level: 3, name: "Qualificação" })).toHaveFocus());
  });
});
