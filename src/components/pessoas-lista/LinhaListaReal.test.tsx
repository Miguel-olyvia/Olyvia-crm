import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { pessoaLista } from "./fabricaLista";
import { LinhaListaReal } from "./LinhaListaReal";
import type { PessoaDaLista } from "@/hooks/pessoas/listaPessoasTipos";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());

function desenhar(sobre: Partial<PessoaDaLista> = {}) {
  render(
    <MemoryRouter>
      <table><tbody><LinhaListaReal pessoa={pessoaLista("p1", { nome: "Ana Lopes", ...sobre })} /></tbody></table>
    </MemoryRouter>,
  );
  return [screen.getByRole("rowheader"), ...screen.getAllByRole("cell")];
}

describe("LinhaListaReal", () => {
  it("tem 6 colunas (o nome é o cabeçalho da linha) e o nome é texto simples: sem botão, sem ligação, sem clique na linha", () => {
    const celulas = desenhar();
    expect(celulas).toHaveLength(6);
    expect(within(celulas[0]).getByText("Ana Lopes")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(celulas[0]).toHaveAttribute("scope", "row");
  });

  it("nome vazio mostra «Sem nome»", () => {
    const celulas = desenhar({ nome: "" });
    expect(within(celulas[0]).getByText("Sem nome")).toBeInTheDocument();
  });

  it("encerrada leva o selo «Encerrada · resultado»", () => {
    const celulas = desenhar({ encerrada: "semInteresse" });
    expect(within(celulas[0]).getByText("Encerrada · Sem interesse")).toBeInTheDocument();
  });

  it("sem encerramento não há selo", () => {
    const celulas = desenhar();
    expect(within(celulas[0]).queryByText(/Encerrada/)).toBeNull();
  });

  it.each([
    ["nova", null, "Por contactar"],
    ["emContacto", null, "Em contacto"],
    ["visitaMarcada", null, "Visita marcada"],
    ["qualificada", null, "Qualificada"],
    ["qualificada", "proposta", "Negócio · Proposta"],
    ["cliente", null, "Cliente"],
  ] as const)("etapa %s com fase %s diz «%s»", (etapa, faseEtapa, texto) => {
    const celulas = desenhar({ etapa, faseEtapa });
    expect(within(celulas[1]).getByText(texto)).toBeInTheDocument();
  });

  it.each([
    [0, "hoje"],
    [1, "há 1 dia"],
    [3, "há 3 dias"],
    [7, "sem contacto há 7 dias"],
    [12, "sem contacto há 12 dias"],
  ])("último contacto com %i dias: «%s»", (dias, texto) => {
    const celulas = desenhar({ diasSemContacto: dias });
    expect(within(celulas[2]).getByText(texto)).toBeInTheDocument();
  });

  it("nunca houve contacto: «Sem contacto»", () => {
    const celulas = desenhar({ diasSemContacto: null });
    expect(within(celulas[2]).getByText("Sem contacto")).toBeInTheDocument();
  });

  it("próxima visita mostra a data, em <time>", () => {
    const celulas = desenhar({ proximaVisitaEm: "2026-10-20T10:30:00Z" });
    const tempo = celulas[3].querySelector("time");
    expect(tempo?.getAttribute("datetime")).toBe("2026-10-20T10:30:00Z");
    expect(tempo?.textContent).toMatch(/20\/10\/2026/);
  });

  it.each([null, "não é uma data"])("sem visita válida (%s): «Sem visita marcada»", (valor) => {
    const celulas = desenhar({ proximaVisitaEm: valor });
    expect(within(celulas[3]).getByText("Sem visita marcada")).toBeInTheDocument();
  });

  it("valor em euros", () => {
    expect(within(desenhar({ valorEmJogo: 14100 })[4]).getByText(formatarMeta("euro", 14100))).toBeInTheDocument();
  });

  it("valor zero mostra o travessão", () => {
    const celulas = desenhar({ valorEmJogo: 0 });
    expect(within(celulas[4]).getByText("—")).toBeInTheDocument();
  });

  it.each([
    [2, 1, 3, "2 em curso · 1 ganho · 3 perdidos"],
    [1, 2, 1, "1 em curso · 2 ganhos · 1 perdido"],
    [0, 0, 1, "0 em curso · 0 ganhos · 1 perdido"],
  ])("negócios %i/%i/%i com o plural certo", (abertos, ganhos, perdidos, texto) => {
    const celulas = desenhar({ abertos, ganhos, perdidos });
    expect(within(celulas[5]).getByText(texto)).toBeInTheDocument();
  });

  it("tudo a zero mostra «Sem negócios»", () => {
    const celulas = desenhar();
    expect(within(celulas[5]).getByText("Sem negócios")).toBeInTheDocument();
  });

  it("pronto a ganhar leva o selo; sem isso não", () => {
    expect(within(desenhar({ abertos: 1, prontoAGanhar: true })[5]).getByText("Pronto a ganhar")).toBeInTheDocument();
  });

  it("sem prontoAGanhar não há selo", () => {
    expect(within(desenhar({ abertos: 1 })[5]).queryByText("Pronto a ganhar")).toBeNull();
  });
});
