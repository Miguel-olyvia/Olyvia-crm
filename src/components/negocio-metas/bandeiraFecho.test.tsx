// A bandeira do fecho v4: desligada por omissao (so se liga depois de as migrations C, D, E e F estarem aplicadas e o codigo publicado);
// os testes forcam-na por contexto, sem tocar na constante.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FECHO_V4_ATIVO, FechoV4Context, useFechoV4 } from "./bandeiraFecho";

afterEach(cleanup);

function Sonda() {
  return <p>{useFechoV4() ? "ligada" : "desligada"}</p>;
}

describe("bandeira do fecho v4", () => {
  it("a constante vem desligada", () => {
    expect(FECHO_V4_ATIVO).toBe(false);
  });

  it("sem contexto segue a constante (desligada)", () => {
    render(<Sonda />);
    expect(screen.getByText("desligada")).toBeInTheDocument();
  });

  it("o contexto liga-a e desliga-a, e manda sobre a constante", () => {
    render(<FechoV4Context.Provider value={true}><Sonda /></FechoV4Context.Provider>);
    expect(screen.getByText("ligada")).toBeInTheDocument();
    cleanup();
    render(<FechoV4Context.Provider value={false}><Sonda /></FechoV4Context.Provider>);
    expect(screen.getByText("desligada")).toBeInTheDocument();
  });
});
