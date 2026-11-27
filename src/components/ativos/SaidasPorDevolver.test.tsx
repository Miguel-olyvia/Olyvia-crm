// O separador «Saídas» dos Ativos: as pessoas que saem e o que ainda têm por devolver, por ordem de saída (a leitura é simulada).
// Com o acesso completo vem a lista; com `detalhe = false` só as contagens e a explicação; recusa, RPC por aplicar e defeito dizem-no.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { PorDevolver } from "@/components/ativos/lib/porDevolver";

const m = vi.hoisted(() => ({ leitura: { estado: "ok", dados: null, mensagem: null, aAtualizar: false, refazer: vi.fn() } as Record<string, unknown>, chamadas: vi.fn() }));
vi.mock("@/hooks/ativos/useAtivosPorDevolver", () => ({
  useAtivosPorDevolver: (o: unknown) => { m.chamadas(o); return m.leitura; },
}));

import { SaidasPorDevolver } from "./SaidasPorDevolver";

const COMPLETO: PorDevolver = {
  hoje: "2026-11-27", dias: 90, detalhe: true, totalPessoas: 3, totalItens: 4,
  pessoas: [
    { pessoaId: "p0", nome: "Rui Costa", saidaPrevista: "2026-11-20", origem: "data_saida", diasRestantes: -7, vinculoId: null, nItens: 1,
      itens: [{ origem: "ativo", itemId: "i0", refId: "a0", codigo: "NIKE-IT-TEL-26-0003", nome: "Telemóvel", desde: "2026-01-10" }] },
    { pessoaId: "p1", nome: "Ana Silva", saidaPrevista: "2026-12-09", origem: "fim_contrato", diasRestantes: 12, vinculoId: "v1", nItens: 2,
      itens: [
        { origem: "ativo", itemId: "i1", refId: "a1", codigo: "NIKE-IT-LAP-26-0001", nome: "Portátil Dell", desde: "2026-06-01" },
        { origem: "frota", itemId: "i2", refId: "f1", codigo: "12-AB-34", nome: "Renault Clio", desde: "2026-07-01" },
      ] },
    { pessoaId: "p2", nome: null, saidaPrevista: "2026-11-28", origem: "fim_decidido", diasRestantes: 1, vinculoId: "v2", nItens: 1,
      itens: [{ origem: "ativo", itemId: "i3", refId: "a3", codigo: null, nome: null, desde: null }] },
  ],
};

function ver(frota = true) {
  return render(
    <LanguageProvider>
      <MemoryRouter><SaidasPorDevolver organizationId="org-1" ligacaoFrota={frota} /></MemoryRouter>
    </LanguageProvider>,
  );
}
const leitura = (p: Record<string, unknown>) => { m.leitura = { estado: "ok", dados: null, mensagem: null, aAtualizar: false, refazer: vi.fn(), ...p }; };

beforeEach(() => { window.localStorage.setItem("language", "pt"); m.chamadas.mockClear(); leitura({ dados: COMPLETO }); });
afterEach(cleanup);

describe("SaidasPorDevolver", () => {
  it("pede a organização inteira com o horizonte de 90 dias, e muda-o pelo filtro", () => {
    ver();
    expect(m.chamadas).toHaveBeenLastCalledWith(expect.objectContaining({ organizationId: "org-1", dias: 90 }));
    expect(m.chamadas.mock.calls.at(-1)?.[0]).not.toHaveProperty("pessoaId", "p1");
    fireEvent.change(screen.getByLabelText("Saem nos próximos"), { target: { value: "30" } });
    expect(m.chamadas).toHaveBeenLastCalledWith(expect.objectContaining({ dias: 30 }));
  });

  it("lista as pessoas pela ordem da saída, com a data, os dias que faltam e os itens", () => {
    ver();
    const pessoas = screen.getAllByRole("listitem").filter((li) => li.hasAttribute("data-pessoa"));
    expect(pessoas.map((li) => li.getAttribute("data-pessoa"))).toEqual(["p0", "p2", "p1"]);
    const ana = pessoas[2];
    expect(within(ana).getByText("Ana Silva")).toBeTruthy();
    expect(within(ana).getByText("Sai a 09/12/2026")).toBeTruthy();
    expect(within(ana).getByText("Faltam 12 dias")).toBeTruthy();
    expect(within(ana).getByText("Fim do contrato")).toBeTruthy();
    expect(within(ana).getByText("2 itens por devolver")).toBeTruthy();
    expect(within(ana).getByText("NIKE-IT-LAP-26-0001")).toBeTruthy();
    expect(within(ana).getByText("Portátil Dell")).toBeTruthy();
    expect(within(ana).getByText("Desde 01/06/2026")).toBeTruthy();
  });

  it("diz «Já saiu», «Sai amanhã» e usa o texto de nome oculto e de item sem nome", () => {
    ver();
    const rui = screen.getByText("Rui Costa").closest("li") as HTMLElement;
    expect(within(rui).getByText("Já saiu")).toBeTruthy();
    expect(within(rui).getByText("1 item por devolver")).toBeTruthy();
    const oculto = screen.getByText("Nome oculto (sem acesso a pessoas)").closest("li") as HTMLElement;
    expect(within(oculto).getByText("Sai amanhã")).toBeTruthy();
    expect(within(oculto).getByText("Sem nome")).toBeTruthy();
  });

  it("as viaturas da Frota levam a etiqueta «Frota» e a ligação à Frota só com acesso à Frota", () => {
    ver(true);
    const ana = screen.getByText("Ana Silva").closest("li") as HTMLElement;
    expect(within(ana).getByText("Frota")).toBeTruthy();
    expect(within(ana).getByText("12-AB-34")).toBeTruthy();
    const ligacao = within(ana).getByRole("link", { name: /Abrir a Frota/ });
    expect(ligacao.getAttribute("href")).toBe("/frota/atribuicoes");
    cleanup();
    ver(false);
    expect(screen.queryByRole("link", { name: /Abrir a Frota/ })).toBeNull();
    expect(screen.getByText("12-AB-34")).toBeTruthy();
  });

  it("sem acesso completo (detalhe false) mostra só as contagens e a explicação, sem lista", () => {
    leitura({ dados: { hoje: "2026-11-27", dias: 90, detalhe: false, totalPessoas: 2, totalItens: 3, pessoas: [] } });
    ver();
    expect(screen.getByText(/Pessoas que saem com itens por devolver: 2\. Itens por devolver: 3\./)).toBeTruthy();
    expect(screen.getByText(/só aparece a quem tem acesso completo ao RH/)).toBeTruthy();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("ninguém a sair: diz o horizonte escolhido", () => {
    leitura({ dados: { hoje: "2026-11-27", dias: 90, detalhe: true, totalPessoas: 0, totalItens: 0, pessoas: [] } });
    ver();
    expect(screen.getByText("Ninguém sai nos próximos 90 dias com itens por devolver.")).toBeTruthy();
  });

  it("a carregar, indisponível, recusado e erro (com «Tentar de novo») dizem-no, sem lista", () => {
    leitura({ estado: "a_carregar", dados: null });
    ver();
    expect(screen.getByRole("status").textContent).toContain("A ler o que falta devolver");
    cleanup();
    leitura({ estado: "indisponivel", dados: null });
    ver();
    expect(screen.getByText("As saídas ainda não estão disponíveis.")).toBeTruthy();
    cleanup();
    leitura({ estado: "recusado", dados: null });
    ver();
    expect(screen.getByText("Sem acesso às saídas.")).toBeTruthy();
    cleanup();
    const refazer = vi.fn();
    leitura({ estado: "erro", dados: null, mensagem: "Não foi possível ler o que falta devolver. Tente novamente.", refazer });
    ver();
    expect(screen.getByRole("alert").textContent).toContain("Não foi possível ler o que falta devolver");
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(refazer).toHaveBeenCalledTimes(1);
  });
});
