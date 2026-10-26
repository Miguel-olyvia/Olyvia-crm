// O levantamento de um NEGÓCIO no Pipeline faz-se no assistente de passos (fase Visita), não num painel: o provider só diz se se pode gravar (`pode`) e dá a
// ficha lida da base com que o assistente grava. Já não abre o painel «Visita e levantamento» (nem tem `abrir`).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { fichaDb } from "@/hooks/pessoas/fichaFabrica";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { LevantamentoDoNegocioProvider, useLevantamentoDoNegocio } from "./LevantamentoDoNegocioReal";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

afterEach(cleanup);

const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: "manual" };

function Consumidor() {
  const levantamento = useLevantamentoDoNegocio();
  return (
    <>
      <span data-testid="pode">{String(levantamento?.pode)}</span>
      <span data-testid="ficha">{levantamento?.ficha?.pessoa.id ?? "sem ficha"}</span>
      <span data-testid="abrir">{levantamento && "abrir" in levantamento ? "tem abrir" : "sem abrir"}</span>
    </>
  );
}

const montar = (ficha: FichaDb | null, fonte: FontePessoas = REAL) => render(
  <FontePessoasContext.Provider value={fonte}>
    <LevantamentoDoNegocioProvider ficha={ficha}><Consumidor /></LevantamentoDoNegocioProvider>
  </FontePessoasContext.Provider>,
);

describe("o levantamento do negócio, sem painel", () => {
  it("com a ficha lida e permissão para editar: pode, dá a ficha ao assistente e não oferece abrir nenhum painel", () => {
    const ficha = fichaDb();
    montar(ficha);
    expect(screen.getByTestId("pode")).toHaveTextContent("true");
    expect(screen.getByTestId("ficha")).toHaveTextContent(ficha.pessoa.id);
    expect(screen.getByTestId("abrir")).toHaveTextContent("sem abrir");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sem permissão para editar a ficha (ou fora da base) diz que não pode", () => {
    montar(fichaDb({ permissoes: { editar: false, criar: true } }));
    expect(screen.getByTestId("pode")).toHaveTextContent("false");
    cleanup();
    montar(fichaDb(), { modo: "exemplo" });
    expect(screen.getByTestId("pode")).toHaveTextContent("false");
  });

  it("sem ficha não há levantamento", () => {
    montar(null);
    expect(screen.getByTestId("pode")).toHaveTextContent("undefined");
  });
});
