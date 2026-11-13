// 13/11: o Campo liga a dica ao campo (aria-describedby) sem apagar o que o campo já declara; o CAMPO tem anel de foco com opacidade total.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CAMPO, Campo } from "./pecasForm";

afterEach(cleanup);

describe("Campo", () => {
  it("a dica fica ligada ao campo por aria-describedby", () => {
    render(<Campo rot="Nome" dica="Escreva o nome completo.">{(id) => <input id={id} />}</Campo>);
    const i = screen.getByLabelText("Nome");
    expect(i).toHaveAccessibleDescription("Escreva o nome completo.");
  });
  it("junta-se ao que o campo já declara", () => {
    render(<><p id="outra">Outra nota.</p><Campo rot="Nome" dica="A dica.">{(id) => <input id={id} aria-describedby="outra" />}</Campo></>);
    expect(screen.getByLabelText("Nome")).toHaveAccessibleDescription("A dica. Outra nota.");
  });
  it("sem dica, nada muda", () => {
    render(<Campo rot="Nome">{(id) => <input id={id} />}</Campo>);
    expect(screen.getByLabelText("Nome")).not.toHaveAttribute("aria-describedby");
  });
  it("o anel de foco tem opacidade total (ring-ring, com afastamento)", () => {
    expect(CAMPO).toContain("focus-visible:ring-ring");
    expect(CAMPO).toContain("focus-visible:ring-offset-2");
    expect(CAMPO).not.toContain("ring-primary/25");
  });
});
