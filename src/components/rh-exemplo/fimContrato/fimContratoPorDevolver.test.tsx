// O «por devolver» ligado ao fim de contrato do RH: em «Contratos a terminar» (faixa e bloco, pelo horizonte do filtro) e no diálogo de
// «Terminar» (os itens da pessoa antes de confirmar; o erro HRV14 da base fica à vista com a lista). Renovar não leva a lista.
// A leitura do «por devolver», o hook de fim de contrato e as permissões são simulados: nada vai à base.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { PorDevolver } from "@/components/ativos/lib/porDevolver";

const m = vi.hoisted(() => ({
  chamadas: vi.fn(),
  terminar: vi.fn(),
  renovar: vi.fn(),
  permissoes: [] as string[],
  contratos: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/hooks/ativos/useAtivosPorDevolver", () => ({
  useAtivosPorDevolver: (o: { dias: number; pessoaId?: string | null; enabled?: boolean }) => {
    m.chamadas(o);
    const dados: PorDevolver = o.dias === 30 && !o.pessoaId ? RESUMO : LISTA;
    return { estado: "ok", dados, mensagem: null, aAtualizar: false, refazer: vi.fn() };
  },
}));
vi.mock("@/components/rh-exemplo/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (p: string) => m.permissoes.includes(p), hasAnyPermission: () => false, permissions: m.permissoes, loading: false }),
}));
vi.mock("@/components/rh-exemplo/hooks/useContratosATerminar", () => ({
  useContratosATerminar: () => ({ contratos: m.contratos, isLoading: false, error: null }),
}));
vi.mock("@/components/rh-exemplo/fimContrato/SinoFimContrato", () => ({ SinoFimContrato: () => null }));
vi.mock("@/components/rh-exemplo/fimContrato/FimContratoHistorico", () => ({ FimContratoHistorico: () => null }));
vi.mock("@/components/rh-exemplo/fimContrato/ExcepcaoContratoDialog", () => ({ ExcepcaoContratoDialog: () => null }));
vi.mock("@/components/rh-exemplo/hooks/IndicacaoDoResponsavelReal", () => ({ IndicacaoDoResponsavelReal: () => null }));
vi.mock("@/components/rh-exemplo/hooks/usePessoaContratoFim", () => ({
  usePessoaContratoFim: () => ({
    regra: {
      no_ambito: true, ativo: true, fonte: "organizacao", renovacoes_realizadas: 0, max_renovacoes: 2, renovacoes_restantes: 2, dias_aviso: 30,
      renovacao_automatica: false, duracao_valor: 6, duracao_unidade: "meses", ao_atingir_limite: "decisao_rh",
    },
    loading: false, erroLeitura: false, saving: false, indicacoes: [], renovacoes: [], avisos: [],
    terminar: m.terminar, renovar: m.renovar, guardarExcepcao: vi.fn(),
  }),
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ContratosATerminarTab } from "./ContratosATerminarTab";
import { FimContratoCard } from "./FimContratoCard";

const RESUMO: PorDevolver = { hoje: "2026-11-27", dias: 30, detalhe: false, totalPessoas: 2, totalItens: 3, pessoas: [] };
const LISTA: PorDevolver = {
  hoje: "2026-11-27", dias: 365, detalhe: true, totalPessoas: 1, totalItens: 1,
  pessoas: [{ pessoaId: "p1", nome: "Ana Teste", saidaPrevista: "2026-12-31", origem: "fim_contrato", diasRestantes: 34, vinculoId: "v1", nItens: 1,
    itens: [{ origem: "ativo", itemId: "i1", refId: "a1", codigo: "NIKE-IT-LAP-26-0001", nome: "Portátil Dell", desde: "2026-06-01" }] }],
};
const VINCULO = { id: "v1", pessoa_id: "p1", data_fim: "2026-12-31" } as never;
const COMPLETO = ["hr.pessoas.vinculos.view", "hr.pessoas.retribuicao.view"];

const ver = (ui: React.ReactElement) => render(<LanguageProvider><MemoryRouter>{ui}</MemoryRouter></LanguageProvider>);

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  m.chamadas.mockClear();
  m.terminar.mockReset().mockResolvedValue({ erro: null, valor: "terminado" });
  m.renovar.mockReset().mockResolvedValue({ erro: null, valor: "2027-06-30" });
  m.permissoes = ["hr.pessoas.vinculos.view"];
  m.contratos = [];
});
afterEach(cleanup);

describe("Contratos a terminar: faixa e bloco «Por devolver»", () => {
  it("mostra a faixa (30 dias) e o bloco com o horizonte da base (90), e o filtro muda o horizonte do bloco", () => {
    ver(<ContratosATerminarTab organizationId="org-1" />);
    expect(screen.getByTestId("faixa-por-devolver")).toHaveTextContent("2 pessoas saem nos próximos 30 dias com 3 itens por devolver");
    expect(m.chamadas).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", dias: 90 }));
    expect(screen.getByRole("region", { name: "Por devolver" })).toHaveTextContent("Ana Teste");
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: /60/ }));
    expect(m.chamadas).toHaveBeenLastCalledWith(expect.objectContaining({ dias: 60 }));
  });
});

describe("Terminar: a lista antes de confirmar", () => {
  const abrirTerminar = () => fireEvent.click(screen.getByRole("button", { name: "Terminar" }));

  it("com o acesso completo, o diálogo de Terminar mostra os itens da pessoa (365 dias) antes do motivo", async () => {
    m.permissoes = COMPLETO;
    ver(<FimContratoCard organizationId="org-1" vinculo={VINCULO} podeEditar />);
    expect(m.chamadas).not.toHaveBeenCalled();
    abrirTerminar();
    const janela = await screen.findByRole("dialog");
    expect(m.chamadas).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", pessoaId: "p1", dias: 365 }));
    expect(within(janela).getByText("NIKE-IT-LAP-26-0001")).toBeTruthy();
    expect(within(janela).getByText("Portátil Dell")).toBeTruthy();
  });

  it("o erro da base (HRV14) fica à vista, com a lista, e a janela não fecha", async () => {
    m.permissoes = COMPLETO;
    m.terminar.mockResolvedValue({ erro: "Há itens por devolver.", valor: undefined });
    ver(<FimContratoCard organizationId="org-1" vinculo={VINCULO} podeEditar />);
    abrirTerminar();
    const janela = await screen.findByRole("dialog");
    fireEvent.click(within(janela).getByRole("button", { name: "Terminar contrato" }));
    await waitFor(() => expect(within(janela).getByRole("alert")).toHaveTextContent("Há itens por devolver."));
    expect(within(janela).getByText("Portátil Dell")).toBeTruthy();
  });

  it("sem o acesso completo não se pede a lista da pessoa (seria 42501) e o Terminar segue para a base", async () => {
    ver(<FimContratoCard organizationId="org-1" vinculo={VINCULO} podeEditar />);
    abrirTerminar();
    const janela = await screen.findByRole("dialog");
    expect(within(janela).queryByText("Portátil Dell")).toBeNull();
    expect(m.chamadas.mock.calls.every(([o]) => (o as { enabled?: boolean }).enabled === false)).toBe(true);
    fireEvent.click(within(janela).getByRole("button", { name: "Terminar contrato" }));
    await waitFor(() => expect(m.terminar).toHaveBeenCalledTimes(1));
  });

  it("Renovar não leva a lista", async () => {
    m.permissoes = COMPLETO;
    ver(<FimContratoCard organizationId="org-1" vinculo={VINCULO} podeEditar />);
    fireEvent.click(screen.getByRole("button", { name: "Renovar" }));
    const janela = await screen.findByRole("dialog");
    expect(within(janela).queryByText("Portátil Dell")).toBeNull();
    expect(m.chamadas).not.toHaveBeenCalled();
  });
});
