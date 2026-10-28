// A página Negócios (Emylia ligada à base): lê os negócios da organização ativa, abrir não grava, e o "Novo negócio" nasce pela
// "Nova lead" do CRM, fica com o número da base e grava as partes da Emylia com neg_guardar_negocio.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const ORG = "11111111-1111-4111-a111-111111111111";
const rpc = vi.fn();
const gravarNovaLead = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { numero: 1201 }, error: null }) }) }) }),
  },
}));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: ORG }, isLoading: false }) }));
vi.mock("@/hooks/pessoas/novaLead/gravarNovaLead", () => ({ gravarNovaLead: (...a: unknown[]) => gravarNovaLead(...a) }));
vi.mock("@/hooks/pessoas/novaLead/comerciaisNovaLead", () => ({ resolverOrgRaiz: async () => ORG }));

import NegociosEmylia from "../NegociosEmylia";

const CATALOGO = {
  parametros: { meses: 14, tsu: 23.75, seguros_ano: 713, horas_ano: 1345, horas_mes: 672, meses_desatualizado: 6, margem_minima: 28, margem_alvo: 35 },
  margemLinha: [], categorias: [], perfis: [], equipamentos: [], estrutura: [], servicos: [], precosServico: [], passos: [], usosEquip: [], usosCons: [],
  produtos: [], precosProduto: [], fornecedores: [], tecnicos: [],
};
const NEGOCIO = {
  negocio: { id: "22222222-2222-4222-a222-222222222222", entity_id: "33333333-3333-4333-a333-333333333333", estado_crm: "aberto", fluxo_emylia: true,
    numero: 1101, titulo: "Marta Lima", telefone: "916 004 552", fase: 0, linha: "wc", linha_por_definir: false, servico_pedido: "WC social",
    morada_obra: "Odivelas", origem: "site", pedido_em: "2026-10-20T10:00:00", dono_papel: "comercial", estado: "aberto", motivo_perda: null,
    anulado_em: null, anulado_por: null, anulado_motivo: null, anulado_origem: null, fatura_numero: null, fatura_em: null, fatura_paga: false, recibo_numero: null, recibo_em: null },
  respostas: [], visitas: [], medidas: { pav: 0, par: 0, pts: 0, pcs: 0, ptf: null, ptq: null, necessidades: [], slot: "", fotos_total: 0, fotos_exterior: null, fotos_interior: null, fotos_area: null, fechada: false },
  servicos: [], produtos: null, partes_fora: null, orcamentos: [], contratos: [], faturas: null, historico: [{ ordem: 0, texto: "Pedido pelo site", tipo: "a", ocorrido_em: "2026-10-20T10:00:00" }],
};

describe("Negócios (Emylia ligada à base)", { timeout: 20000 }, () => {
  beforeEach(() => {
    rpc.mockReset(); gravarNovaLead.mockReset();
    rpc.mockImplementation(async (fn: string) => {
      if (fn === "cat_ler_catalogo") return { data: CATALOGO, error: null };
      if (fn === "neg_ler_negocios") return { data: [NEGOCIO], error: null };
      // 20261231999000: as obras dos negócios lêem-se ao lado (aqui, nenhuma)
      if (fn === "obra_ler_negocios") return { data: [], error: null };
      if (fn === "neg_guardar_negocio") return { data: { negocio_id: "x" }, error: null };
      return { data: null, error: { message: "inesperado: " + fn } };
    });
    gravarNovaLead.mockResolvedValue({ entityId: "44444444-4444-4444-a444-444444444444", leadId: null, negocioId: "55555555-5555-4555-a555-555555555555" });
  });

  it("lê os negócios da organização ativa e abrir um negócio não grava nada", async () => {
    render(<MemoryRouter><NegociosEmylia /></MemoryRouter>);
    await waitFor(() => { if (!screen.queryAllByText("Marta Lima").length) throw new Error(document.body.textContent?.slice(0, 600) ?? ""); }, { timeout: 8000 });
    expect(rpc).toHaveBeenCalledWith("neg_ler_negocios", { p_org: ORG });
    fireEvent.click(screen.getAllByText("Marta Lima")[0]);
    await new Promise((r) => setTimeout(r, 300));
    expect(rpc.mock.calls.filter(([fn]) => fn === "neg_guardar_negocio")).toHaveLength(0);
    expect(rpc.mock.calls.filter(([fn]) => fn === "obra_guardar_negocio")).toHaveLength(0);
  });

  it("um negócio novo nasce pela Nova lead do CRM, fica com o número da base e grava", async () => {
    render(<MemoryRouter><NegociosEmylia /></MemoryRouter>);
    await waitFor(() => expect(screen.queryAllByText("Marta Lima").length).toBeGreaterThan(0), { timeout: 8000 });
    fireEvent.click(screen.getByRole("button", { name: /Novo negócio/ }));
    // o formulário aparece no quadro do computador e no do telemóvel: usa-se o primeiro
    await waitFor(() => expect(screen.queryAllByLabelText("Nome").length).toBeGreaterThan(0));
    fireEvent.change(screen.getAllByLabelText("Nome")[0], { target: { value: "Rui Costa" } });
    fireEvent.change(screen.getAllByLabelText("Telefone ou email")[0], { target: { value: "912 345 678" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Criar" })[0]);
    await waitFor(() => expect(rpc.mock.calls.some(([fn]) => fn === "neg_guardar_negocio")).toBe(true), { timeout: 5000 });
    expect(gravarNovaLead).toHaveBeenCalledTimes(1);
    expect(gravarNovaLead.mock.calls[0][0]).toMatchObject({ organizationId: ORG, dados: { displayName: "Rui Costa", telefone: "912 345 678" } });
    const [, args] = rpc.mock.calls.find(([fn]) => fn === "neg_guardar_negocio")!;
    expect(args).toMatchObject({ p_org: ORG, p_negocio_id: "55555555-5555-4555-a555-555555555555" });
    expect((args as { p_linhas: { negocio: { numero: number; titulo: string } } }).p_linhas.negocio).toMatchObject({ numero: 1201, titulo: "Rui Costa" });
  });
});
