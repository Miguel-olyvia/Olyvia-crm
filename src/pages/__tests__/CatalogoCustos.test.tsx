// A página Catálogo e custos: lê o Catálogo da organização ativa (cat_ler_catalogo) e mostra o Catálogo da Emylia.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "11111111-1111-4111-a111-111111111111" }, isLoading: false }) }));

import CatalogoCustos from "../CatalogoCustos";

const SVC = "55555555-5555-4555-a555-555555555555", OF = "66666666-6666-4666-a666-666666666666", PERFIL = "22222222-2222-4222-a222-222222222222";
const CATALOGO = {
  parametros: { meses: 14, tsu: 23.75, seguros_ano: 713, horas_ano: 1345, horas_mes: 672, meses_desatualizado: 6, margem_minima: 28, margem_alvo: 35 },
  margemLinha: [], categorias: [{ id: OF, name: "Canalização", parent_id: null, sort_order: 0 }],
  perfis: [{ id: PERFIL, chave: "canalizador", nome: "Canalizador", salario_referencia: 1100, ativo: true }],
  equipamentos: [], estrutura: [],
  servicos: [{ id: SVC, chave: "s-teste", name: "Ponto de água de teste", sku: "T1", unidade: "pt", service_category_id: OF, service_subcategory_id: null,
    linhas: ["wc"], medida: null, modo_preco: "tabela", margem: 35, justificacao_preco: null, fases: [], receita_origem: "editada", icone: null,
    exige_produto_categoria_id: null, exige_produto_medida: null, exige_produto_fator: null, exige_produto_arredondar: false, pergunta_manter: null,
    entulho_modo: null, entulho_m3: null, entulho_kg: null }],
  precosServico: [{ service_id: SVC, price: 95, valid_from: "2026-01-15", nota: null, vat_rate: null, created_at: null }],
  passos: [{ servico_id: SVC, ordem: 1, nome: "Execução", minutos_por_unidade: 90, minutos_fixos: 0, skill_id: PERFIL, fase: 1 }],
  usosEquip: [], usosCons: [], produtos: [], precosProduto: [], fornecedores: [], tecnicos: [],
};

describe("Catálogo e custos (ligado à base)", () => {
  beforeEach(() => { rpc.mockReset(); });
  it("lê o Catálogo da organização ativa e mostra o serviço", async () => {
    rpc.mockResolvedValue({ data: CATALOGO, error: null });
    render(<MemoryRouter><CatalogoCustos /></MemoryRouter>);
    expect(await screen.findByText("Ponto de água de teste", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("cat_ler_catalogo", { p_org: "11111111-1111-4111-a111-111111111111" });
    // abrir não grava nada (nada mudou)
    await new Promise((r) => setTimeout(r, 1200));
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("sem permissão, diz porquê", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "CT001", message: "Sem permissão (services.view)." } });
    render(<MemoryRouter><CatalogoCustos /></MemoryRouter>);
    expect(await screen.findByText("Não tem permissão para ver o Catálogo e custos desta organização.")).toBeInTheDocument();
  });
});
