// O seletor de versão do portal: escolhe UM idioma de cada vez (não há «Português + English»).
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SeletorVersaoDoDocumento } from "../SeletorVersaoDoDocumento";

function Controlado({ idiomas, inicial, onChange }: { idiomas: string[]; inicial: string; onChange?: (c: string) => void }) {
  const [valor, setValor] = useState(inicial);
  return (
    <SeletorVersaoDoDocumento
      idiomas={idiomas}
      valor={valor}
      rotulo="Idioma do documento"
      onChange={(c) => {
        onChange?.(c);
        setValor(c);
      }}
    />
  );
}

afterEach(cleanup);

describe("SeletorVersaoDoDocumento", () => {
  it("com um idioma (ou nenhum) não mostra nada", () => {
    const { container, rerender } = render(<SeletorVersaoDoDocumento idiomas={["pt"]} valor="pt" rotulo="x" onChange={() => {}} />);
    expect(container.innerHTML).toBe("");
    rerender(<SeletorVersaoDoDocumento idiomas={[]} valor="pt" rotulo="x" onChange={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("com dois idiomas: um grupo com nome e duas opções, com os nomes nativos, a escolhida marcada", () => {
    render(<Controlado idiomas={["pt", "en"]} inicial="en" />);
    const grupo = screen.getByRole("radiogroup", { name: "Idioma do documento" });
    expect(grupo).toBeTruthy();
    const opcoes = screen.getAllByRole("radio");
    expect(opcoes.map((o) => o.textContent)).toEqual(["Português", "English"]);
    expect(opcoes.map((o) => o.getAttribute("aria-checked"))).toEqual(["false", "true"]);
  });

  it("não há opção «os dois»: uma versão de cada vez", () => {
    render(<Controlado idiomas={["pt", "en"]} inicial="pt" />);
    expect(screen.queryByRole("radio", { name: /\+/ })).toBeNull();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("clicar noutro idioma escolhe-o; clicar no atual não repete a escolha", () => {
    const onChange = vi.fn();
    render(<Controlado idiomas={["pt", "en"]} inicial="pt" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Português" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    expect(onChange).toHaveBeenCalledWith("en");
    expect(screen.getByRole("radio", { name: "English" }).getAttribute("aria-checked")).toBe("true");
  });

  it("as setas passam à outra opção e dão-lhe o foco; só a escolhida está na ordem do Tab", () => {
    const onChange = vi.fn();
    render(<Controlado idiomas={["pt", "en"]} inicial="pt" onChange={onChange} />);
    const [pt, en] = screen.getAllByRole("radio");
    expect(pt.getAttribute("tabindex")).toBe("0");
    expect(en.getAttribute("tabindex")).toBe("-1");
    fireEvent.keyDown(pt, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("en");
    expect(document.activeElement).toBe(en);
    fireEvent.keyDown(en, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("pt");
    expect(document.activeElement).toBe(pt);
  });

  it("três idiomas: uma opção por idioma, ordenados como no registo (português primeiro)", () => {
    render(<Controlado idiomas={["en", "pt", "es"]} inicial="pt" />);
    expect(screen.getAllByRole("radio").map((o) => o.getAttribute("aria-checked"))).toHaveLength(3);
    expect(screen.getAllByRole("radio")[0].textContent).toBe("Português");
  });
});
