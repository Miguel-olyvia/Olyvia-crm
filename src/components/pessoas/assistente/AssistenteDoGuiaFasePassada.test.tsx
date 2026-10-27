// O assistente a mostrar uma fase JÁ FEITA: os mesmos passos e o mesmo corpo, mas sem «Continuar» nem «Ir para», com «fase feita» no cabeçalho, a fase marcada
// em «Fases feitas», o que o guia mostra por baixo escondido e «Voltar ao passo atual» como botão primário.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AssistenteDoGuia } from "./AssistenteDoGuia";
import { useAssistente } from "./useAssistente";
import type { PassoAssistente } from "./tiposAssistente";
import type { FaseFeita } from "../processo/passoGuiado";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));
afterEach(cleanup);

const p = (id: string, extra: Partial<PassoAssistente> = {}): PassoAssistente => ({
  id, rotuloChave: `pessoasPagina.assistente.passo.${id}`, icone: "telefone", obrigatorias: 2, respondidas: 0, precisaNegocio: false, ...extra,
});
const PASSOS = [p("chamada", { obrigatorias: 1, respondidas: 1 }), p("qualificacao", { obrigatorias: 6 }), p("marcar", { obrigatorias: 1 })];
const FEITA: FaseFeita = { id: "contactado", rotuloChave: "pessoasPagina.board.col.contactado", estado: "feita", itens: [] };

function Ecra({ aoVoltar = vi.fn(), aoContinuar = vi.fn(() => null), focarAoMontar }: { aoVoltar?: () => void; aoContinuar?: () => null; focarAoMontar?: boolean }) {
  const assistente = useAssistente(PASSOS, { inicial: 0 });
  return (
    <AssistenteDoGuia
      faseRotuloChave="pessoasPagina.board.col.contactado" passos={PASSOS} assistente={assistente} feitas={[FEITA]} aoVerFase={vi.fn()} nivel="h3"
      aoContinuar={aoContinuar} renderCorpo={(passo) => <p>corpo de {passo.id}</p>} extra={<p>prazo do negócio</p>}
      fasePassada={{ id: "contactado", aoVoltar }} focarAoMontar={focarAoMontar}
    />
  );
}

describe("AssistenteDoGuia: fase feita", () => {
  it("o cabeçalho diz «fase feita» e não conta respostas em falta nem tempo", () => {
    render(<Ecra />);
    expect(screen.getByText("Passo 1 de 3 · fase feita")).toBeInTheDocument();
    expect(screen.queryByText(/faltam|falta/)).toBeNull();
  });

  it("não tem «Continuar» nem «Ir para», e esconde o que o guia põe por baixo", () => {
    render(<Ecra />);
    expect(screen.queryByRole("button", { name: /^Continuar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Ir para/ })).toBeNull();
    expect(screen.queryByText("prazo do negócio")).toBeNull();
  });

  it("os passos continuam a abrir-se pela coluna, com o mesmo corpo", () => {
    render(<Ecra />);
    fireEvent.click(within(screen.getByRole("navigation", { name: "Passos da fase" })).getByRole("button", { name: /Qualificação/ }));
    expect(screen.getByText("corpo de qualificacao")).toBeInTheDocument();
  });

  it("ao montar depois de trocar de fase vista, o foco vai para o título do passo; à primeira entrada não", () => {
    const { unmount } = render(<Ecra />);
    expect(document.activeElement).toBe(document.body);
    unmount();
    render(<Ecra focarAoMontar />);
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 3 }));
  });

  it("a fase vista fica marcada em «Fases feitas» e «Voltar ao passo atual» chama o caminho de volta", () => {
    const aoVoltar = vi.fn();
    render(<Ecra aoVoltar={aoVoltar} />);
    expect(within(screen.getByRole("navigation", { name: "Fases feitas" })).getByRole("button", { name: "Contactado" })).toHaveAttribute("aria-current", "true");
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao passo atual" }));
    expect(aoVoltar).toHaveBeenCalledTimes(1);
  });
});
