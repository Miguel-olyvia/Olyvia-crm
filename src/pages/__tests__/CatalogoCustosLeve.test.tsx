// 17/11: as páginas de Serviços leem o Catálogo LEVE (cat_ler_catalogo_servicos). Ficheiro à parte: a página dos outros testes grava ao desmontar e relê, e essa leitura tardia cairia aqui.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "11111111-1111-4111-a111-111111111111" }, isLoading: false }) }));
// 29/10: a página lê as permissões (ficha do produto, armazéns em lote)
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => false }) }));

import CatalogoCustos from "../CatalogoCustos";
import { reporCustos } from "@/emylia/v2/custosStore";
import { usaLeituraLeve } from "@/emylia/catalogoRotas";
import { catalogoParcial, orgDoCatalogoLido } from "@/emylia/real/catalogoLeve";

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

describe("Catálogo e custos: a leitura leve", () => {
  beforeEach(() => { rpc.mockReset(); });
  afterEach(() => { reporCustos(); });
  // cat_ler_catalogo trazia os 29 785 produtos da Mudelar (32 MB, statement timeout). Os Serviços leem a versão leve; os Produtos e as Ligações, que precisam da lista toda, não.
  it("a página de Serviços lê o Catálogo LEVE (cat_ler_catalogo_servicos) e não o inteiro", async () => {
    rpc.mockResolvedValue({ data: CATALOGO, error: null });
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><CatalogoCustos rota={{ seccao: "servicos", ir: vi.fn() }} /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText("Ponto de água de teste", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("cat_ler_catalogo_servicos", { p_org: "11111111-1111-4111-a111-111111111111" });
    expect(rpc.mock.calls.map((c) => c[0])).not.toContain("cat_ler_catalogo");
  });
  it("os Equipamentos, os Consumíveis e os Técnicos também leem o leve; as Ligações e os Produtos, o inteiro", () => {
    for (const s of ["servicos", "equipamentos", "consumiveis", "tecnicos"] as const) expect(usaLeituraLeve(s)).toBe(true);
    for (const s of ["produtos", "ligacoes"] as const) expect(usaLeituraLeve(s)).toBe(false);
    expect(usaLeituraLeve(undefined)).toBe(false);
  });
  it("sem a função leve na base (PGRST202), a página de Serviços volta a ler o Catálogo inteiro", async () => {
    rpc.mockImplementation(async (fn: string) => fn === "cat_ler_catalogo_servicos"
      ? { data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_ler_catalogo_servicos" } } : { data: CATALOGO, error: null });
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><CatalogoCustos rota={{ seccao: "servicos", ir: vi.fn() }} /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText("Ponto de água de teste", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(rpc.mock.calls.filter((c) => c[0] === "cat_ler_catalogo")).toHaveLength(1);
  });
  it("ao sair da página, o estado parcial e a organização ficam limpos (o protótipo e as outras organizações não os herdam)", async () => {
    rpc.mockResolvedValue({ data: CATALOGO, error: null });
    const { unmount } = render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><CatalogoCustos rota={{ seccao: "servicos", ir: vi.fn() }} /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText("Ponto de água de teste", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(catalogoParcial()).toBe(true);
    expect(orgDoCatalogoLido()).toBe("11111111-1111-4111-a111-111111111111");
    unmount();
    expect(catalogoParcial()).toBe(false);
    expect(orgDoCatalogoLido()).toBeNull();
  });
});
