// A bandeira do fecho v4: ligada (as migrations C, D, E e F estao aplicadas); os testes forcam-na por contexto, sem tocar na constante.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FECHO_V4_ATIVO, FechoV4Context, useFechoV4 } from "./bandeiraFecho";

afterEach(cleanup);

function Sonda() {
  return <p>{useFechoV4() ? "ligada" : "desligada"}</p>;
}

describe("bandeira do fecho v4", () => {
  it("a constante vem ligada", () => {
    expect(FECHO_V4_ATIVO).toBe(true);
  });

  it("sem contexto segue a constante (ligada)", () => {
    render(<Sonda />);
    expect(screen.getByText("ligada")).toBeInTheDocument();
  });

  it("o contexto liga-a e desliga-a, e manda sobre a constante", () => {
    render(<FechoV4Context.Provider value={true}><Sonda /></FechoV4Context.Provider>);
    expect(screen.getByText("ligada")).toBeInTheDocument();
    cleanup();
    render(<FechoV4Context.Provider value={false}><Sonda /></FechoV4Context.Provider>);
    expect(screen.getByText("desligada")).toBeInTheDocument();
  });
});
