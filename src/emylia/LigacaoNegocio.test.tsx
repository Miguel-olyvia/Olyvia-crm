import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LigacaoNegocio } from "./LigacaoNegocio";

afterEach(cleanup);

describe("LigacaoNegocio (12/11: os negócios são ligações a sério)", () => {
  it("é uma ligação para o negócio; o clique normal abre-o na página, sem sair", () => {
    const abrir = vi.fn();
    render(<LigacaoNegocio negocio={1026} abrir={abrir}>Ana Ribeiro</LigacaoNegocio>);
    const a = screen.getByRole("link", { name: "Ana Ribeiro" });
    expect(a.getAttribute("href")).toBe("/negocios?negocio=1026");
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    a.dispatchEvent(ev);
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("Ctrl, Cmd, Shift + clique e o botão do meio ficam para o browser (separador novo)", () => {
    const abrir = vi.fn();
    render(<LigacaoNegocio negocio={7} abrir={abrir}>X</LigacaoNegocio>);
    const a = screen.getByRole("link", { name: "X" });
    for (const op of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
      // o jsdom não navega: basta ver que a página não o abre e que o clique não é travado
      const ev = new MouseEvent("click", { bubbles: true, cancelable: true, ...op });
      a.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
    }
    expect(abrir).not.toHaveBeenCalled();
  });
});
