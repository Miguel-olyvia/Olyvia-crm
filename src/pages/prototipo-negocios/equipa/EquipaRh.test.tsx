// Os técnicos de obra no RH do protótipo (22/10/2026): não há aba Técnicos; a ficha da pessoa que é técnico (RH › Pessoas) tem o bloco "Obra",
// com o custo/hora calculado nos Custos do RH (só leitura; 22/10), o ofício e as férias; a Agenda mostra a semana com a obra certa, abre a obra ao clicar e abre a
// ficha do técnico pelo nome. Sem base de dados: o cliente rebenta se alguém o importar.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useMemo, useReducer, useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => { throw new Error("Os ecrãs da equipa não podem importar o cliente Supabase"); });

import { atualizarFicha, lerEstado } from "@/components/rh-exemplo/dados/loja";
import { acoes, seed, type Estado } from "../motor";
import { custoObra } from "../custoObra";
import MenuRh from "../rh/MenuRh";
import RhPagina from "../rh/RhPagina";
import type { AbaRh } from "../rh/abas";
import { esquecerRh } from "../rh/loja";
import { esquecerFrota } from "../frota/loja";

const LENTO = 30000;
const irObra = vi.fn(), irNegocio = vi.fn();

function Casa({ S, aba: inicial }: { S: Estado; aba: AbaRh }) {
  const [, redesenhar] = useReducer((x: number) => x + 1, 0);
  const [aba, setAba] = useState<AbaRh>(inicial);
  const run = useMemo(() => (fn: () => void) => { fn(); redesenhar(); }, []);
  const A = useMemo(() => acoes(S, () => undefined, run), [S, run]);
  return <RhPagina aba={aba} aoMudarAba={setAba} equipa={{ S, A, run, irObra, irNegocio }} />;
}

/** Abre a ficha do técnico pelo nome na Agenda e devolve o painel da ficha (já na Visão geral). */
async function abrirFichaPelaAgenda(nome: string): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole("button", { name: `Abrir a ficha de ${nome} em Pessoas` }, { timeout: 15000 }));
  const titulo = await screen.findByRole("heading", { level: 1, name: new RegExp(nome) }, { timeout: 15000 });
  return titulo.closest<HTMLElement>('[role="dialog"]') as HTMLElement;
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

describe("Técnicos de obra na ficha da pessoa (RH › Pessoas)", () => {
  it("o menu do RH tem a Agenda e já não tem a entrada Técnicos", () => {
    render(<MenuRh aba={null} aoIr={() => undefined} iniciarAberto />);
    const menu = screen.getByTestId("menu-rh");
    expect(within(menu).queryByRole("button", { name: /^Técnicos/ })).not.toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: /^Agenda/ })).toBeInTheDocument();
  });

  it("a ficha do técnico tem o bloco Obra: o custo/hora guardado muda o custo da obra, as férias juntam-se e tiram-se, abre a obra", async () => {
    const S = seed(); S.role = "direcao";
    render(<Casa S={S} aba="agenda" />);
    const ficha = await abrirFichaPelaAgenda("Hugo Neves");
    expect(lerEstado().fichas["p-tec-hn"]?.pessoa.cargo).toBe("Técnico de obra");
    const bloco = await within(ficha).findByTestId("bloco-obra-pessoa", undefined, { timeout: 15000 });
    expect(within(bloco).getByRole("heading", { name: "Obra" })).toBeInTheDocument();
    // 22/10: o custo/hora é só leitura, calculado nos Custos do RH (2.112 € × 14 ÷ 12 + 25,25 % ÷ 173,3 h = 17,80 €/h)
    const custo = within(bloco).getByTestId("custo-hora-rh");
    expect(custo).toHaveTextContent("Custo/hora (calculado nos Custos do RH)");
    expect(custo).toHaveTextContent(/17,80 €\/h = \(2\.112,00 € × 14 ÷ 12 \+ 25,25 % de encargos da empresa\) ÷ 173,3 h/);
    expect(within(bloco).queryByLabelText("Custo por hora (€/h)")).not.toBeInTheDocument();
    expect(within(bloco).getByText(/#1022/)).toBeInTheDocument();
    // mudar a retribuição no RH muda o €/h dele, a média do Ladrilhador e o custo do revestimento num orçamento novo
    const d22 = S.deals.find((d) => d.id === 1022)!, antes = custoObra(d22, S).prev, revAntes = S.svc.revest.eh;
    const enviado = S.deals.find((d) => d.id === 1050)!.orc!.linhas.find((l) => l.t === "svc" && l.sid === "revest")!;
    const cuEnviado = enviado.t === "svc" ? enviado.cu : 0;
    act(() => atualizarFicha("p-tec-hn", (f) => ({ ...f, retribuicoes: f.retribuicoes.map((r) => ({ ...r, valor_base: 2500 })) })));
    const hn = S.tecnicos!.find((t) => t.id === "hn")!;
    expect(hn.custoHora).toBe(21.08);
    expect(S.svc.revest.eh).toBeCloseTo((17.8 + 21.08) / 2, 2);
    expect(S.svc.revest.eh).toBeGreaterThan(revAntes);
    expect(custoObra(d22, S).prev).toBe(antes); // o previsto da obra é o da proposta (congelado)
    expect(enviado.t === "svc" && enviado.cu).toBe(cuEnviado); // a proposta já enviada não muda
    await waitFor(() => expect(within(bloco).getByTestId("custo-hora-rh")).toHaveTextContent("21,08 €/h"));
    // as férias: junta um dia e tira-o
    fireEvent.change(within(bloco).getByLabelText("Dia de férias a juntar"), { target: { value: "2026-11-02" } });
    fireEvent.click(within(bloco).getByRole("button", { name: /Juntar dia/ }));
    expect(S.tecnicos!.find((t) => t.id === "hn")!.feriasDatas).toEqual(["2026-11-02"]);
    fireEvent.click(within(bloco).getByRole("button", { name: "Tirar o dia 02/11/2026 das férias" }));
    expect(S.tecnicos!.find((t) => t.id === "hn")!.feriasDatas).toEqual([]);
    // o ofício
    fireEvent.change(within(bloco).getByLabelText("Ofício"), { target: { value: "montador" } });
    expect(S.tecnicos!.find((t) => t.id === "hn")).toMatchObject({ sk: "Montador", perfilId: "montador" });
    // abrir a obra
    fireEvent.click(within(bloco).getByRole("button", { name: "Abrir a obra #1022" }));
    expect(irObra).toHaveBeenCalledWith(1022);
  }, LENTO);

  it("uma pessoa de loja não tem o bloco Obra", async () => {
    const S = seed(); S.role = "direcao";
    render(<Casa S={S} aba="pessoas" />);
    const tabela = await screen.findByRole("table", undefined, { timeout: 15000 });
    fireEvent.click(within(tabela).getByText("Rui Amaral"));
    const titulo = await screen.findByRole("heading", { level: 1, name: /Rui Amaral/ }, { timeout: 15000 });
    const ficha = titulo.closest<HTMLElement>('[role="dialog"]') as HTMLElement;
    expect(within(ficha).getByRole("tab", { selected: true })).toHaveTextContent(/Visão geral/);
    expect(within(ficha).queryByTestId("bloco-obra-pessoa")).not.toBeInTheDocument();
  }, LENTO);

  it("sem a permissão, o bloco Obra só se consulta", async () => {
    const S = seed(); S.role = "comercial";
    render(<Casa S={S} aba="agenda" />);
    const ficha = await abrirFichaPelaAgenda("Hugo Neves");
    const bloco = await within(ficha).findByTestId("bloco-obra-pessoa", undefined, { timeout: 15000 });
    expect(within(bloco).getByRole("note")).toHaveTextContent(/só a Direção ou as Operações/);
    expect(within(bloco).getByLabelText("Ofício")).toBeDisabled();
    expect(within(bloco).queryByLabelText("Dia de férias a juntar")).not.toBeInTheDocument();
  }, LENTO);

  it("sem o Estado do protótipo (o RH de exemplo sozinho), a ficha do técnico não tem o bloco Obra", async () => {
    render(<RhPagina aba="pessoas" aoMudarAba={() => undefined} />);
    const tabela = await screen.findByRole("table", undefined, { timeout: 15000 });
    fireEvent.click(within(tabela).getByText("Hugo Neves"));
    const titulo = await screen.findByRole("heading", { level: 1, name: /Hugo Neves/ }, { timeout: 15000 });
    const ficha = titulo.closest<HTMLElement>('[role="dialog"]') as HTMLElement;
    expect(within(ficha).queryByTestId("bloco-obra-pessoa")).not.toBeInTheDocument();
  }, LENTO);

  it("a Agenda aberta sem o Estado do protótipo mostra o título e explica de onde se abre", async () => {
    render(<RhPagina aba="agenda" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Agenda" })).toBeInTheDocument();
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
