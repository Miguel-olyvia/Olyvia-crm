// 22/10/2026: a Agenda do RH vista por cada papel (com equipa: a equipa; sem equipa: só a sua) e "A minha agenda" do Hoje.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useMemo, useReducer } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => { throw new Error("Os ecrãs da equipa não podem importar o cliente Supabase"); });

import { acoes, seed, type Estado } from "../motor";
import RhPagina from "../rh/RhPagina";
import { esquecerRh } from "../rh/loja";
import { esquecerFrota } from "../frota/loja";
import MinhaAgenda from "./MinhaAgenda";

const LENTO = 30000;
const irObra = vi.fn(), irNegocio = vi.fn();
const TECNICOS = ["João Silva", "Rui Alves", "Marco Antunes", "Sérgio Faria", "Hugo Neves", "Paulo Mota"];

function Casa({ S }: { S: Estado }) {
  const [, redesenhar] = useReducer((x: number) => x + 1, 0);
  const run = useMemo(() => (fn: () => void) => { fn(); redesenhar(); }, []);
  const A = useMemo(() => acoes(S, () => undefined, run), [S, run]);
  return <RhPagina aba="agenda" aoMudarAba={() => undefined} equipa={{ S, A, run, irObra, irNegocio }} />;
}
const nomesDasLinhas = () => screen.getAllByRole("rowheader").map((th) => th.querySelector(".font-medium")?.textContent);

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => {
  localStorage.clear(); localStorage.setItem("language", "pt");
  esquecerRh(); esquecerFrota(); irObra.mockReset(); irNegocio.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 14, 10));
});
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); });

describe("RH › Agenda por papel", () => {
  it("as Operações veem o Filipe e os técnicos (a equipa dele)", async () => {
    const S = seed(); S.role = "operacoes";
    render(<Casa S={S} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Agenda da equipa" }, { timeout: 15000 })).toBeInTheDocument();
    expect(nomesDasLinhas()).toEqual(["Filipe Rocha", ...TECNICOS]);
    expect(screen.getByTestId("agenda-Hugo Neves-2026-10-15")).toHaveTextContent(/#1022/);
  }, LENTO);

  it("o Comercial vê só a sua agenda, com as visitas", async () => {
    const S = seed(); S.role = "comercial";
    render(<Casa S={S} />);
    expect(await screen.findByRole("heading", { level: 1, name: "A minha agenda" }, { timeout: 15000 })).toBeInTheDocument();
    expect(nomesDasLinhas()).toEqual(["Rúben Costa"]);
    fireEvent.click(within(screen.getByTestId("agenda-Rúben Costa-2026-10-15")).getByRole("button", { name: /Abrir o negócio: 10:00/ }));
    expect(irNegocio).toHaveBeenCalledWith(1036);
  }, LENTO);

  it("a Direção vê toda a gente (a Marta primeiro), e o nome abre a ficha de qualquer pessoa", async () => {
    const S = seed(); S.role = "direcao";
    render(<Casa S={S} />);
    await screen.findByRole("heading", { level: 1, name: "Agenda da equipa" }, { timeout: 15000 });
    const nomes = nomesDasLinhas();
    expect(nomes[0]).toBe("Marta Figueiredo");
    for (const n of [...TECNICOS, "Filipe Rocha", "Rúben Costa", "Sandra Moreira", "Nuno Ferreira", "Inês Carvalho", "Rui Amaral"]) expect(nomes, n).toContain(n);
    expect(screen.getByRole("button", { name: "Abrir a ficha de Sandra Moreira em Pessoas" })).toBeInTheDocument();
  }, LENTO);
});

describe("A minha agenda (Hoje)", () => {
  it("o técnico vê as suas tarefas da semana, hoje destacado; abre a obra e muda de semana", async () => {
    const S = seed(); S.role = "tecnico"; S.tec = "ma";
    render(<MinhaAgenda S={S} irObra={irObra} irNegocio={irNegocio} />);
    expect(screen.getByRole("heading", { level: 2, name: "A minha agenda" })).toBeInTheDocument();
    expect(screen.getByText(/Marco Antunes · Técnico/)).toBeInTheDocument();
    const hoje = screen.getByTestId("minha-agenda-2026-10-14");
    expect(hoje).toHaveAttribute("aria-current", "date");
    fireEvent.click(within(hoje).getByRole("button", { name: /Abrir a obra: #1022 · Canalização/ }));
    expect(irObra).toHaveBeenCalledWith(1022);
    fireEvent.click(screen.getByRole("button", { name: "Semana seguinte" }));
    expect(screen.getByText("19 a 25 de outubro de 2026")).toBeInTheDocument();
    expect(screen.queryByTestId("minha-agenda-2026-10-14")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Esta semana" }));
    expect(screen.getByTestId("minha-agenda-2026-10-14")).toBeInTheDocument();
  });

  it("o Comercial vê as visitas; a Sandra (Financeiro) não tem nada marcado", () => {
    const S = seed(); S.role = "comercial";
    const { unmount } = render(<MinhaAgenda S={S} irObra={irObra} irNegocio={irNegocio} />);
    expect(within(screen.getByTestId("minha-agenda-2026-10-15")).getByRole("button", { name: /Abrir o negócio: 10:00/ })).toBeInTheDocument();
    unmount();
    S.role = "financeiro";
    render(<MinhaAgenda S={S} irObra={irObra} irNegocio={irNegocio} />);
    expect(screen.getByText(/Sandra Moreira · Técnico\/a Financeiro\/a · nada marcado nesta semana/)).toBeInTheDocument();
  });
});
