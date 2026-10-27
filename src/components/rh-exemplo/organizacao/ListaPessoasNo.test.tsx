// O historico de uma pessoa na lista do no: le as colocacoes dela ao abrir e nunca mostra «sem alteracoes» quando a leitura falhou.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ListaPessoasNo } from "@/components/rh-exemplo/organizacao/ListaPessoasNo";
import type { EstruturaOrg, Ligacao, PessoaOrg } from "@/components/rh-exemplo/organizacao/tipos";

const recarregar = vi.fn();
const colocacaoSimulada = { colocacoes: [] as unknown[], loading: false, recusado: false };

vi.mock("@/components/rh-exemplo/hooks/useCompany", () => ({
  useCompany: () => ({ activeCompany: { id: "org-1", name: "Nike Teste" }, companies: [], isLoading: false }),
}));
vi.mock("@/components/rh-exemplo/hooks/usePessoaColocacaoOrganograma", () => ({
  usePessoaColocacaoOrganograma: () => ({ ...colocacaoSimulada, recarregar }),
}));
vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const est: EstruturaOrg = {
  grupo: { id: "grupo:org-1", nome: "Nike Teste", nif: "", morada: "", responsavel: "" },
  empresas: [{ id: "empresa:org-1", nome: "Nike Teste", nif: "", morada: "", responsavel: "" }],
  filiais: [
    { id: "org-1", empresaId: "empresa:org-1", nome: "Sede", morada: "", responsavel: "" },
    { id: "org-2", empresaId: "empresa:org-1", nome: "Filial Porto", morada: "", responsavel: "" },
  ],
  centros: [],
};
const lig: Ligacao = { pessoaId: "p1", empresaId: "empresa:org-1", filialId: "org-2", centroId: "", desde: "2026-06-01" };
const pessoas = new Map<string, PessoaOrg>([["p1", { id: "p1", nome: "Ana", cargo: null, reportaAId: null }]]);

function abrir() {
  render(<ListaPessoasNo est={est} ligacoes={[lig]} pessoas={pessoas} modo="legal" vazio="" aoAlterar={vi.fn()} aoDesligar={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /rhOrg.historico: Ana/ }));
}

beforeEach(() => {
  recarregar.mockReset();
  colocacaoSimulada.colocacoes = [];
  colocacaoSimulada.loading = false;
  colocacaoSimulada.recusado = false;
});

describe("ListaPessoasNo - historico", () => {
  it("mostra os eventos derivados das colocacoes reais da pessoa", () => {
    colocacaoSimulada.colocacoes = [
      { id: "b", organograma_node_id: "org-2", valido_de: "2026-06-01", valido_ate: null, motivo: "Mudanca" },
      { id: "a", organograma_node_id: "org-1", valido_de: "2026-01-01", valido_ate: "2026-05-31", motivo: null },
    ];
    abrir();
    expect(screen.getByText(/rhOrg.ev.ligar/)).toBeTruthy();
    expect(screen.getByText(/rhOrg.ev.alterar/)).toBeTruthy();
    expect(screen.getByText("rhOrg.ev.motivo")).toBeTruthy();
  });

  it("enquanto carrega diz que esta a carregar", () => {
    colocacaoSimulada.loading = true;
    abrir();
    expect(screen.getByText("rhOrg.historico.aCarregar")).toBeTruthy();
  });

  it("sem permissao diz-o", () => {
    colocacaoSimulada.recusado = true;
    abrir();
    expect(screen.getByText("rhOrg.historico.semPermissao")).toBeTruthy();
  });

  it("zero linhas numa pessoa ligada e falha de leitura: avisa e deixa tentar de novo", () => {
    abrir();
    expect(screen.getByText("rhOrg.historico.falha")).toBeTruthy();
    expect(screen.queryByText("rhOrg.historico.vazio")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "rhOrg.tentarDeNovo" }));
    expect(recarregar).toHaveBeenCalledTimes(1);
  });
});
