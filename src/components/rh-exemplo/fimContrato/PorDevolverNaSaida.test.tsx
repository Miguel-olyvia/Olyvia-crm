// «Por devolver» no fim de contrato do RH: a lista de quem sai com itens por devolver (em «Contratos a terminar»), os itens de uma pessoa
// (no diálogo de Terminar) e a faixa de aviso do RH, com «Ver» só para quem tem `ativos.view`. A leitura é simulada; uma falha nunca bloqueia.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { PorDevolver } from "@/components/ativos/lib/porDevolver";

const m = vi.hoisted(() => ({ leitura: {} as Record<string, unknown>, chamadas: vi.fn(), permissoes: [] as string[] }));
vi.mock("@/hooks/ativos/useAtivosPorDevolver", () => ({
  useAtivosPorDevolver: (o: unknown) => { m.chamadas(o); return m.leitura; },
}));
vi.mock("@/components/rh-exemplo/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (p: string) => m.permissoes.includes(p), hasAnyPermission: () => false, permissions: m.permissoes, loading: false }),
}));

import { FaixaPorDevolverRh } from "./FaixaPorDevolverRh";
import { PorDevolverNaSaida } from "./PorDevolverNaSaida";

const COMPLETO: PorDevolver = {
  hoje: "2026-11-27", dias: 365, detalhe: true, totalPessoas: 1, totalItens: 2,
  pessoas: [{ pessoaId: "p1", nome: "Ana Silva", saidaPrevista: "2026-12-09", origem: "fim_contrato", diasRestantes: 12, vinculoId: "v1", nItens: 2,
    itens: [
      { origem: "ativo", itemId: "i1", refId: "a1", codigo: "NIKE-IT-LAP-26-0001", nome: "Portátil Dell", desde: "2026-06-01" },
      { origem: "frota", itemId: "i2", refId: "f1", codigo: "12-AB-34", nome: "Renault Clio", desde: "2026-07-01" },
    ] }],
};
const leitura = (p: Record<string, unknown>) => { m.leitura = { estado: "ok", dados: COMPLETO, mensagem: null, aAtualizar: false, refazer: vi.fn(), ...p }; };
const ver = (ui: React.ReactElement) => render(<LanguageProvider><MemoryRouter>{ui}</MemoryRouter></LanguageProvider>);

beforeEach(() => { window.localStorage.setItem("language", "pt"); m.chamadas.mockClear(); m.permissoes = []; leitura({}); });
afterEach(cleanup);

describe("PorDevolverNaSaida (a organização, em Contratos a terminar)", () => {
  it("pede a organização inteira para o horizonte do filtro e mostra quem sai e o que tem por devolver", () => {
    ver(<PorDevolverNaSaida organizationId="org-1" dias={60} />);
    expect(m.chamadas).toHaveBeenLastCalledWith(expect.objectContaining({ organizationId: "org-1", dias: 60 }));
    expect(m.chamadas.mock.calls.at(-1)?.[0]).not.toHaveProperty("pessoaId", "p1");
    const bloco = screen.getByRole("region", { name: "Por devolver" });
    expect(within(bloco).getByText("Ana Silva")).toBeTruthy();
    expect(within(bloco).getByText("Portátil Dell")).toBeTruthy();
    expect(within(bloco).getByText("Renault Clio")).toBeTruthy();
  });

  it("sem acesso completo mostra só as contagens e a explicação", () => {
    leitura({ dados: { ...COMPLETO, detalhe: false, pessoas: [] } });
    ver(<PorDevolverNaSaida organizationId="org-1" dias={90} />);
    expect(screen.getByText(/Pessoas que saem com itens por devolver: 1\. Itens por devolver: 2\./)).toBeTruthy();
    expect(screen.queryByText("Ana Silva")).toBeNull();
  });

  it("ninguém a sair: diz-o; recusado ou RPC por aplicar: não mostra o bloco; falha: diz que não leu, sem bloquear", () => {
    leitura({ dados: { ...COMPLETO, dias: 90, totalPessoas: 0, totalItens: 0, pessoas: [] } });
    const { container, rerender } = ver(<PorDevolverNaSaida organizationId="org-1" dias={90} />);
    expect(screen.getByText("Ninguém sai nos próximos 90 dias com itens por devolver.")).toBeTruthy();
    for (const estado of ["recusado", "indisponivel"]) {
      leitura({ estado, dados: null });
      rerender(<LanguageProvider><MemoryRouter><PorDevolverNaSaida organizationId="org-1" dias={90} /></MemoryRouter></LanguageProvider>);
      expect(container.textContent).toBe("");
    }
    leitura({ estado: "erro", dados: null, mensagem: "x" });
    rerender(<LanguageProvider><MemoryRouter><PorDevolverNaSaida organizationId="org-1" dias={90} /></MemoryRouter></LanguageProvider>);
    expect(screen.getByText("Não foi possível ler o que falta devolver. O sistema confirma ao terminar.")).toBeTruthy();
  });
});

describe("PorDevolverNaSaida (uma pessoa, no diálogo de Terminar)", () => {
  const props = { organizationId: "org-1", pessoaId: "p1", dias: 365 } as const;
  beforeEach(() => { m.permissoes = ["hr.pessoas.vinculos.view", "hr.pessoas.retribuicao.view"]; });

  it("pede só essa pessoa e mostra os itens dela antes de confirmar", () => {
    ver(<PorDevolverNaSaida {...props} />);
    expect(m.chamadas).toHaveBeenLastCalledWith(expect.objectContaining({ organizationId: "org-1", pessoaId: "p1", dias: 365 }));
    expect(screen.getByText("Se o contrato terminar já, registe a devolução (ou a perda) de cada item antes.")).toBeTruthy();
    expect(screen.getByText("NIKE-IT-LAP-26-0001")).toBeTruthy();
    expect(screen.getByText("12-AB-34")).toBeTruthy();
  });

  it("nada por devolver: diz-o sem prometer, porque o sistema confirma ao terminar", () => {
    m.permissoes = ["hr.pessoas.vinculos.view", "hr.pessoas.retribuicao.view", "fleet.view"];
    leitura({ dados: { ...COMPLETO, totalPessoas: 0, totalItens: 0, pessoas: [] } });
    ver(<PorDevolverNaSaida {...props} />);
    expect(screen.getByText("Nada por devolver neste momento. O sistema confirma ao terminar.")).toBeTruthy();
  });

  it("nada por devolver sem `fleet.view`: avisa que as viaturas da Frota não aparecem, porque o Terminar conta-as à mesma (HRV14)", () => {
    leitura({ dados: { ...COMPLETO, totalPessoas: 0, totalItens: 0, pessoas: [] } });
    ver(<PorDevolverNaSaida {...props} />);
    expect(screen.getByText(/As viaturas da Frota não aparecem sem acesso à Frota/)).toBeTruthy();
    expect(screen.queryByText("Nada por devolver neste momento. O sistema confirma ao terminar.")).toBeNull();
  });

  it("só contagens: diz quantos itens há, sem a lista", () => {
    leitura({ dados: { ...COMPLETO, detalhe: false, pessoas: [], totalItens: 1 } });
    ver(<PorDevolverNaSaida {...props} />);
    expect(screen.getByText("Há 1 item por devolver.")).toBeTruthy();
  });

  it("a leitura falhar ou ser recusada não mostra erro nem bloqueia: o ecrã decide pela base ao confirmar", () => {
    leitura({ estado: "recusado", dados: null });
    const { container } = ver(<PorDevolverNaSaida {...props} />);
    expect(container.textContent).toBe("");
  });

  it("não pede nada quando `enabled` é falso, nem sem o acesso completo ao RH (seria um 42501)", () => {
    ver(<PorDevolverNaSaida {...props} enabled={false} />);
    expect(m.chamadas).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
    cleanup();
    m.permissoes = ["hr.pessoas.vinculos.view"];
    const { container } = ver(<PorDevolverNaSaida {...props} />);
    expect(m.chamadas).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
    expect(container.textContent).toBe("");
  });

  it("a viatura só leva à Frota com `fleet.view`", () => {
    m.permissoes = ["hr.pessoas.vinculos.view", "hr.pessoas.retribuicao.view", "fleet.view"];
    ver(<PorDevolverNaSaida {...props} />);
    expect(screen.getByRole("link", { name: "Abrir a Frota" })).toBeTruthy();
  });
});

describe("FaixaPorDevolverRh", () => {
  it("o «Ver» leva a /ativos?aba=saidas só a quem tem `ativos.view`", () => {
    leitura({ dados: { ...COMPLETO, detalhe: false, pessoas: [] } });
    m.permissoes = ["ativos.view"];
    ver(<FaixaPorDevolverRh organizationId="org-1" />);
    expect(screen.getByRole("link", { name: "Ver quem sai e o que falta devolver" }).getAttribute("href")).toBe("/ativos?aba=saidas");
    cleanup();
    m.permissoes = [];
    ver(<FaixaPorDevolverRh organizationId="org-1" />);
    expect(screen.getByTestId("faixa-por-devolver")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("na ficha pede só a pessoa, e só com o acesso completo ao RH (sem ele seria um 42501)", () => {
    m.permissoes = ["hr.pessoas.vinculos.view", "hr.pessoas.retribuicao.view"];
    ver(<FaixaPorDevolverRh organizationId="org-1" pessoaId="p1" />);
    expect(m.chamadas).toHaveBeenLastCalledWith(expect.objectContaining({ pessoaId: "p1", dias: 30, enabled: true }));
    cleanup();
    m.permissoes = ["hr.pessoas.vinculos.view"];
    ver(<FaixaPorDevolverRh organizationId="org-1" pessoaId="p1" />);
    expect(m.chamadas).toHaveBeenLastCalledWith(expect.objectContaining({ pessoaId: "p1", enabled: false }));
  });
});
