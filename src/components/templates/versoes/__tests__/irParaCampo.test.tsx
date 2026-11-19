import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CLASSES_DESTAQUE, DURACAO_DESTAQUE_MS, useIrParaCampo } from "../irParaCampo";

type Chave = "curto" | "html" | "noutra" | "porId" | "ausente";

/** Dois separadores: o campo «noutra» só existe (montado) no separador B, como no Radix. */
function Harness({ onFechar }: { onFechar?: () => void }) {
  const [separador, setSeparador] = useState<"a" | "b">("a");
  const { registar, irPara, naoEncontrado } = useIrParaCampo<Chave>({
    abrirSeparador: (chave) => setSeparador(chave === "noutra" ? "b" : "a"),
    localizar: (chave) => (chave === "porId" ? document.getElementById("campo-por-id") : null),
  });
  return (
    <div>
      <p data-testid="separador">{separador}</p>
      <button type="button" onClick={() => irPara("curto")}>ir curto</button>
      <button type="button" onClick={() => irPara("html")}>ir html</button>
      <button type="button" onClick={() => irPara("noutra")}>ir noutra</button>
      <button type="button" onClick={() => irPara("porId")}>ir por id</button>
      <button type="button" onClick={() => irPara("ausente")}>ir ausente</button>
      {onFechar && <button type="button" onClick={onFechar}>fechar</button>}
      {naoEncontrado && <p role="status">não encontrado: {naoEncontrado}</p>}
      {separador === "a" && (
        <>
          <div ref={registar("curto")} data-testid="envolucro-curto">
            <label htmlFor="curto">Curto</label>
            <input id="curto" />
          </div>
          <div ref={registar("html")} data-testid="envolucro-html">
            <div contentEditable suppressContentEditableWarning data-testid="editavel" />
          </div>
          <input id="campo-por-id" aria-label="por id" />
        </>
      )}
      {separador === "b" && (
        <div ref={registar("noutra")} data-testid="envolucro-noutra">
          <textarea aria-label="Noutra" />
        </div>
      )}
    </div>
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useIrParaCampo", () => {
  it("campo no separador aberto: recebe o foco e fica destacado", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "ir curto" }));
    expect(screen.getByLabelText("Curto")).toHaveFocus();
    const envolucro = screen.getByTestId("envolucro-curto");
    expect(envolucro).toHaveAttribute("data-destacado", "true");
    for (const classe of CLASSES_DESTAQUE) expect(envolucro).toHaveClass(classe);
  });

  it("campo noutro separador: muda de separador, depois foca e destaca", () => {
    render(<Harness />);
    expect(screen.queryByLabelText("Noutra")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ir noutra" }));
    expect(screen.getByTestId("separador")).toHaveTextContent("b");
    expect(screen.getByLabelText("Noutra")).toHaveFocus();
    expect(screen.getByTestId("envolucro-noutra")).toHaveAttribute("data-destacado", "true");
  });

  it("num editor rico, o foco vai para o editável dentro do envólucro", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "ir html" }));
    expect(screen.getByTestId("editavel")).toHaveFocus();
    expect(screen.getByTestId("envolucro-html")).toHaveAttribute("data-destacado", "true");
  });

  it("sem registo, procura pelo localizar (id estável), e o foco vai para o próprio campo", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "ir por id" }));
    expect(screen.getByLabelText("por id")).toHaveFocus();
    expect(screen.getByLabelText("por id")).toHaveAttribute("data-destacado", "true");
  });

  it("faz scroll até ao campo, ao centro e suave", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "ir curto" }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
  });

  it("com prefers-reduced-motion o scroll não é animado", () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes("prefers-reduced-motion"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      render(<Harness />);
      fireEvent.click(screen.getByRole("button", { name: "ir curto" }));
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "auto" });
    } finally {
      window.matchMedia = original;
    }
  });

  it("o destaque desaparece ao fim de uns instantes, com as classes", () => {
    vi.useFakeTimers();
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "ir curto" }));
    const envolucro = screen.getByTestId("envolucro-curto");
    expect(envolucro).toHaveAttribute("data-destacado", "true");
    act(() => { vi.advanceTimersByTime(DURACAO_DESTAQUE_MS + 10); });
    expect(envolucro).not.toHaveAttribute("data-destacado");
    for (const classe of CLASSES_DESTAQUE) expect(envolucro).not.toHaveClass(classe);
  });

  it("só um campo fica destacado de cada vez", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "ir curto" }));
    fireEvent.click(screen.getByRole("button", { name: "ir html" }));
    expect(screen.getByTestId("envolucro-curto")).not.toHaveAttribute("data-destacado");
    expect(screen.getByTestId("envolucro-html")).toHaveAttribute("data-destacado", "true");
  });

  it("campo que não existe: diz que não foi encontrado, sem rebentar nem mudar o foco", () => {
    vi.useFakeTimers();
    render(<Harness />);
    const botao = screen.getByRole("button", { name: "ir ausente" });
    botao.focus();
    fireEvent.click(botao);
    expect(screen.queryByRole("status")).toBeNull();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByRole("status")).toHaveTextContent("não encontrado: ausente");
    expect(botao).toHaveFocus();
    // um pedido seguinte limpa o aviso
    fireEvent.click(screen.getByRole("button", { name: "ir curto" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("o ref de registo é estável por chave (não remonta a cada render)", () => {
    const refs: Array<(el: HTMLElement | null) => void> = [];
    function Sonda() {
      const { registar } = useIrParaCampo<"a">({ abrirSeparador: () => {} });
      refs.push(registar("a"));
      return null;
    }
    const { rerender } = render(<Sonda />);
    rerender(<Sonda />);
    expect(refs[0]).toBe(refs[1]);
  });

  it("ao desmontar limpa o destaque pendente", () => {
    vi.useFakeTimers();
    const { unmount } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "ir curto" }));
    const envolucro = screen.getByTestId("envolucro-curto");
    expect(envolucro).toHaveAttribute("data-destacado", "true");
    unmount();
    expect(envolucro).not.toHaveAttribute("data-destacado");
    expect(() => act(() => { vi.advanceTimersByTime(DURACAO_DESTAQUE_MS * 2); })).not.toThrow();
  });
});
