// RH › Técnicos e RH › Agenda (22/10/2026) dentro da moldura do RH do protótipo: as abas abrem, a ficha do técnico muda o custo/hora (e o custo
// da obra), a agenda mostra a semana com a obra certa e abre a obra ao clicar. Sem base de dados: o cliente rebenta se alguém o importar.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useMemo, useReducer } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => { throw new Error("Os ecrãs da equipa não podem importar o cliente Supabase"); });

import { lerEstado } from "@/components/rh-exemplo/dados/loja";
import { acoes, seed, type Estado } from "../motor";
import { custosObra } from "../obraOps";
import MenuRh from "../rh/MenuRh";
import RhPagina from "../rh/RhPagina";
import type { AbaRh } from "../rh/abas";
import { esquecerRh } from "../rh/loja";
import { esquecerFrota } from "../frota/loja";

const LENTO = 30000;
const irObra = vi.fn(), irNegocio = vi.fn();

function Casa({ S, aba }: { S: Estado; aba: AbaRh }) {
  const [, redesenhar] = useReducer((x: number) => x + 1, 0);
  const run = useMemo(() => (fn: () => void) => { fn(); redesenhar(); }, []);
  const A = useMemo(() => acoes(S, () => undefined, run), [S, run]);
  return <RhPagina aba={aba} equipa={{ S, A, run, irObra, irNegocio }} />;
}

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

describe("RH › Técnicos", () => {
  it("o menu do RH tem as entradas Técnicos e Agenda", () => {
    render(<MenuRh aba={null} aoIr={() => undefined} iniciarAberto />);
    const menu = screen.getByTestId("menu-rh");
    expect(within(menu).getByRole("button", { name: /^Técnicos/ })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: /^Agenda/ })).toBeInTheDocument();
  });

  it("abre com os técnicos, junta-os ao RH como pessoas e o custo/hora guardado muda o custo da obra", async () => {
    const S = seed(); S.role = "direcao";
    render(<Casa S={S} aba="tecnicos" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Técnicos de obra" }, { timeout: 15000 })).toBeInTheDocument();
    expect(lerEstado().fichas["p-tec-hn"]?.pessoa.cargo).toBe("Técnico de obra");
    fireEvent.click(screen.getByRole("button", { name: /Hugo Neves/ }));
    const ficha = screen.getByRole("region", { name: "Hugo Neves" });
    expect(within(ficha).getByText(/Pelo salário no RH/)).toBeInTheDocument();
    expect(within(ficha).getByText(/#1022/)).toBeInTheDocument();
    const p = S.deals.find((d) => d.id === 1022)!.obra.plano!, antes = custosObra(p).prev;
    fireEvent.change(within(ficha).getByLabelText("Custo por hora (€/h)"), { target: { value: "25,5" } });
    fireEvent.click(within(ficha).getByRole("button", { name: "Guardar" }));
    expect(S.tecnicos!.find((t) => t.id === "hn")!.custoHora).toBe(25.5);
    expect(custosObra(p).prev).toBeGreaterThan(antes);
    expect(screen.getByRole("button", { name: /Hugo Neves.*25,50 €\/h/ })).toBeInTheDocument();
    // as férias: junta um dia e tira-o
    fireEvent.change(within(ficha).getByLabelText("Dia de férias a juntar"), { target: { value: "2026-11-02" } });
    fireEvent.click(within(ficha).getByRole("button", { name: /Juntar dia/ }));
    expect(S.tecnicos!.find((t) => t.id === "hn")!.feriasDatas).toEqual(["2026-11-02"]);
    fireEvent.click(within(ficha).getByRole("button", { name: "Tirar o dia 02/11/2026 das férias" }));
    expect(S.tecnicos!.find((t) => t.id === "hn")!.feriasDatas).toEqual([]);
    // abrir a obra
    fireEvent.click(within(ficha).getByRole("button", { name: "Abrir a obra #1022" }));
    expect(irObra).toHaveBeenCalledWith(1022);
  }, LENTO);

  it("sem a permissão, a ficha só se consulta", async () => {
    const S = seed(); S.role = "comercial";
    render(<Casa S={S} aba="tecnicos" />);
    await screen.findByRole("heading", { level: 1, name: "Técnicos de obra" }, { timeout: 15000 });
    expect(screen.getByRole("note")).toHaveTextContent(/só a Direção ou as Operações/);
    expect(screen.getByLabelText("Custo por hora (€/h)")).toBeDisabled();
  }, LENTO);

  it("aberto sem o Estado do protótipo, mostra o título e explica de onde se abre", async () => {
    render(<RhPagina aba="tecnicos" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Técnicos" })).toBeInTheDocument();
    expect(screen.getByText(/abra-o pelo menu Recursos Humanos do protótipo/)).toBeInTheDocument();
  });
});

describe("RH › Agenda", () => {
  it("mostra a semana com cada técnico na obra certa, abre a obra e a visita, muda para mês e navega", async () => {
    const S = seed();
    render(<Casa S={S} aba="agenda" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Agenda da equipa" }, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.getByText("12 a 18 de outubro de 2026")).toBeInTheDocument();
    const seg = screen.getByTestId("agenda-João Silva-2026-10-13");
    const demol = within(seg).getByRole("button", { name: /Abrir a obra: #1022 · Demolição/ });
    expect(seg).toHaveTextContent("AA-12-BC");
    fireEvent.click(demol);
    expect(irObra).toHaveBeenCalledWith(1022);
    fireEvent.click(within(screen.getByTestId("agenda-Rúben-2026-10-15")).getByRole("button", { name: /Abrir o negócio: 10:00/ }));
    expect(irNegocio).toHaveBeenCalledWith(1036);
    expect(screen.getByText("Sem conflitos neste período")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Semana seguinte/ }));
    expect(screen.getByText("19 a 25 de outubro de 2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hoje" }));
    expect(screen.getByText("12 a 18 de outubro de 2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mês" }));
    expect(screen.getByRole("button", { name: "Mês" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("outubro de 2026")).toBeInTheDocument();
    expect(screen.getByTestId("agenda-João Silva-2026-10-31")).toBeInTheDocument();
  }, LENTO);

  it("um técnico em obra num dia de férias aparece como conflito", async () => {
    const S = seed(); S.role = "operacoes";
    acoes(S, () => undefined, (fn) => fn()).editarTecnico("hn", { feriasDatas: ["2026-10-15"] });
    render(<Casa S={S} aba="agenda" />);
    await screen.findByRole("heading", { level: 1, name: "Agenda da equipa" }, { timeout: 15000 });
    await waitFor(() => expect(screen.getByText("1 conflito neste período")).toBeInTheDocument());
    const lista = screen.getByRole("region", { name: /Agenda:/ });
    expect(within(lista).getByTestId("agenda-Hugo Neves-2026-10-15")).toHaveTextContent(/obra marcada num dia de férias/);
    expect(screen.getByRole("heading", { name: "Conflitos" })).toBeInTheDocument();
  }, LENTO);
});
