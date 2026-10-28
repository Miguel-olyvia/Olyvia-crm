import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PassarParaNegocio } from "./PassarParaNegocio";
import type { AcaoPassar } from "./useNegocioEmyliaDoGuia";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
afterEach(cleanup);

const acao = (sobre: Partial<AcaoPassar> = {}): AcaoPassar => ({ visivel: true, razao: null, aFazer: false, fazer: vi.fn(), ...sobre });

describe("PassarParaNegocio (a saída da Visita)", () => {
  it("com o levantamento guardado e tudo em ordem, o botão «Passar para o Negócio» está ativo e faz a passagem", () => {
    const a = acao();
    render(<PassarParaNegocio acao={a} />);
    const botao = screen.getByRole("button", { name: /Passar para o Negócio/ });
    expect(botao).not.toHaveAttribute("aria-disabled");
    fireEvent.click(botao);
    expect(a.fazer).toHaveBeenCalledTimes(1);
  });

  it("diz que o que falta responder é opcional e não a bloqueia", () => {
    render(<PassarParaNegocio acao={acao()} />);
    expect(screen.getByText(/opcional/i)).toBeInTheDocument();
  });

  it("sem levantamento guardado (ou negócio já da Emylia) não aparece", () => {
    const { container } = render(<PassarParaNegocio acao={acao({ visivel: false })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["semPermissao", /permissão/i],
    ["docsCrm", /CRM/],
    ["aLer", /A ler/],
    ["erro", /Não foi possível ler/],
    ["semNegocio", /não devolveu/],
  ] as const)("desativada com a razão dita em texto (%s), e o clique não faz nada", (razao, texto) => {
    const a = acao({ razao });
    render(<PassarParaNegocio acao={a} />);
    const botao = screen.getByRole("button", { name: /Passar para o Negócio/ });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("status")).toHaveTextContent(texto);
    expect(botao.getAttribute("aria-describedby")).toBe(screen.getByRole("status").id);
    fireEvent.click(botao);
    expect(a.fazer).not.toHaveBeenCalled();
  });

  it("enquanto passa fica ocupada e não se repete o clique", () => {
    const a = acao({ aFazer: true });
    render(<PassarParaNegocio acao={a} />);
    const botao = screen.getByRole("button", { name: /Passar para o Negócio/ });
    expect(botao).toHaveAttribute("aria-busy", "true");
    fireEvent.click(botao);
    expect(a.fazer).not.toHaveBeenCalled();
    expect(screen.getByText("A passar o negócio…")).toBeInTheDocument();
  });

  it("se a gravação falhou diz-o (alerta)", () => {
    render(<PassarParaNegocio acao={acao()} erro="RLS recusou" />);
    expect(screen.getByRole("alert")).toHaveTextContent("RLS recusou");
  });
});
