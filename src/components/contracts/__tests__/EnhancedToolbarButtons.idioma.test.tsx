import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EnhancedToolbarButtons } from "../EnhancedToolbarButtons";
import { htmlBlocoAssinatura } from "../versoes/blocosDeInsercao";

const execCommand = vi.fn();

beforeEach(() => {
  execCommand.mockReset();
  (document as unknown as { execCommand: typeof execCommand }).execCommand = execCommand;
});
afterEach(cleanup);

describe("EnhancedToolbarButtons: bloco de assinatura por idioma", () => {
  it("sem idioma insere o bloco em português (como sempre)", () => {
    render(<EnhancedToolbarButtons onExecCommand={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Espaço para assinatura"));
    expect(execCommand).toHaveBeenCalledTimes(1);
    expect(execCommand).toHaveBeenCalledWith("insertHTML", false, htmlBlocoAssinatura("pt"));
    const html = execCommand.mock.calls[0][2] as string;
    expect(html).toContain("A PRIMEIRA CONTRATANTE");
    expect(html).toContain("O SEGUNDO CONTRATANTE");
    expect(html).toContain("olv-assinaturas");
  });

  it("com idioma «en» insere o bloco em inglês, com as marcas por classe", () => {
    render(<EnhancedToolbarButtons onExecCommand={vi.fn()} idioma="en" />);
    fireEvent.click(screen.getByTitle("Espaço para assinatura"));
    const html = execCommand.mock.calls[0][2] as string;
    expect(html).toBe(htmlBlocoAssinatura("en"));
    expect(html).toContain("THE FIRST PARTY");
    expect(html).toContain("THE SECOND PARTY");
    expect(html).toContain("olv-assinatura-empresa");
    expect(html).toContain("olv-assinatura-cliente");
    expect(html).not.toContain("CONTRATANTE");
  });

  it("muda de idioma quando a prop muda", () => {
    const { rerender } = render(<EnhancedToolbarButtons onExecCommand={vi.fn()} idioma="pt" />);
    rerender(<EnhancedToolbarButtons onExecCommand={vi.fn()} idioma="en" />);
    fireEvent.click(screen.getByTitle("Espaço para assinatura"));
    expect(execCommand.mock.calls[0][2]).toContain("THE SECOND PARTY");
  });
});
