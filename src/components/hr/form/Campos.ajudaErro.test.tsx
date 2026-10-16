/**
 * A ajuda de um campo não desaparece quando ele tem erro: o leitor de ecrã ouve a ajuda E o erro (`aria-describedby` com os
 * dois ids), e a posição do campo na configuração (no convite, na ficha, opcional) pode juntar-se por `descritoPor`.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CampoPais, CampoSelect, CampoTexto } from "./Campos";

vi.mock("@/components/CountrySelect", () => ({
  CountrySelect: (p: Record<string, unknown>) => <button type="button" id={p.id as string} aria-describedby={p["aria-describedby"] as string} />,
}));

const ids = (el: HTMLElement) => (el.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);

describe("Campos: a ajuda mantém-se quando há erro", () => {
  it("CampoTexto com ajuda e erro liga os dois ao controlo, e os dois textos estão no ecrã", () => {
    render(<CampoTexto id="x" label="Quota" valor="" onChange={vi.fn()} ajuda="Entre 0 e 100" erro="Valor inválido" />);
    const campo = screen.getByLabelText("Quota");
    expect(ids(campo)).toEqual(["x-ajuda", "x-erro"]);
    expect(document.getElementById("x-ajuda")).toHaveTextContent("Entre 0 e 100");
    expect(document.getElementById("x-erro")).toHaveTextContent("Valor inválido");
  });

  it("só com ajuda, só a ajuda; só com erro, só o erro; sem nada, nada", () => {
    const { rerender } = render(<CampoTexto id="x" label="Quota" valor="" onChange={vi.fn()} ajuda="Entre 0 e 100" />);
    expect(ids(screen.getByLabelText("Quota"))).toEqual(["x-ajuda"]);
    rerender(<CampoTexto id="x" label="Quota" valor="" onChange={vi.fn()} erro="Valor inválido" />);
    expect(ids(screen.getByLabelText("Quota"))).toEqual(["x-erro"]);
    rerender(<CampoTexto id="x" label="Quota" valor="" onChange={vi.fn()} />);
    expect(screen.getByLabelText("Quota")).not.toHaveAttribute("aria-describedby");
  });

  it("o selector e o país também mantêm a ajuda com erro", () => {
    render(
      <>
        <CampoSelect id="s" label="Género" valor="" onChange={vi.fn()} opcoes={[]} ajuda="Opcional" erro="Escolha uma opção" />
        <CampoPais id="p" label="País" valor="" onChange={vi.fn()} ajuda="Código ISO" erro="Escolha um país" />
      </>,
    );
    expect(ids(screen.getByRole("combobox", { name: /Género/ }))).toEqual(["s-ajuda", "s-erro"]);
    expect(ids(document.getElementById("p") as HTMLElement)).toEqual(["p-ajuda", "p-erro"]);
  });

  it("descritoPor junta ids de fora (a posição do campo) à descrição, antes da ajuda e do erro", () => {
    render(<CampoTexto id="x" label="Telefone" valor="" onChange={vi.fn()} ajuda="9 dígitos" erro="Inválido" descritoPor="x-posicao" />);
    expect(ids(screen.getByLabelText("Telefone"))).toEqual(["x-posicao", "x-ajuda", "x-erro"]);
  });
});
