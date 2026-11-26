// Um aviso ou um erro nunca e so cor: leva sempre um icone (escondido do leitor de ecra) e o texto, que o leitor le inteiro.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AvisoAtivo } from "./AvisoAtivo";

afterEach(cleanup);

describe("AvisoAtivo", () => {
  it("aviso: icone aria-hidden antes do texto, com o papel e o testid pedidos", () => {
    render(<AvisoAtivo tom="aviso" role="note" data-testid="x">Cuidado com o passado</AvisoAtivo>);
    const el = screen.getByTestId("x");
    expect(el).toHaveAttribute("role", "note");
    expect(el).toHaveTextContent("Cuidado com o passado");
    const icone = el.querySelector("svg");
    expect(icone).not.toBeNull();
    expect(icone).toHaveAttribute("aria-hidden", "true");
    expect(el.className).toMatch(/amber/);
  });

  it("erro: papel alert, cor de erro e icone; o texto e so a frase", () => {
    render(<AvisoAtivo tom="erro" role="alert">Nao foi possivel guardar</AvisoAtivo>);
    const el = screen.getByRole("alert");
    expect(el.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(el.className).toMatch(/destructive/);
    expect(el).toHaveTextContent(/^Nao foi possivel guardar$/);
  });
});
