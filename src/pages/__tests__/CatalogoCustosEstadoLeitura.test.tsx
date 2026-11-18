// 18/11: o estado de leitura do Catálogo: indicador acessível, aviso aos 10 s, erro aos 30 s, «Tentar de novo», e uma resposta tardia não se aplica.
// Ficheiro à parte: usa relógio simulado. Serviços só lê o que é de Serviços (soServicos).
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "11111111-1111-4111-a111-111111111111" }, isLoading: false }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => false }) }));

import CatalogoCustos from "../CatalogoCustos";
import { reporCustos } from "@/emylia/v2/custosStore";
import { lerCatalogo as lerCatalogoStore, reporCatalogo } from "@/emylia/v2/catalogoStore";

const produto = (id: string, name: string) => ({ id, name, sku: null, tipo_catalogo: "produto", unidade: "un", catalogo_categoria_id: null, servico_id: null, fator_servico: 1,
  entulho_m3: null, entulho_kg: null, short_description: null, marca_livre: null, fornecedor_livre: null });
const SVC = "55555555-5555-4555-a555-555555555555", OF = "66666666-6666-4666-a666-666666666666", PERFIL = "22222222-2222-4222-a222-222222222222";
const comServico = (nome: string, produtos: ReturnType<typeof produto>[] = []) => ({
  parametros: { meses: 14, tsu: 23.75, seguros_ano: 713, horas_ano: 1345, horas_mes: 672, meses_desatualizado: 6, margem_minima: 28, margem_alvo: 35 },
  margemLinha: [], categorias: [{ id: OF, name: "Canalização", parent_id: null, sort_order: 0 }],
  perfis: [{ id: PERFIL, chave: "canalizador", nome: "Canalizador", salario_referencia: 1100, ativo: true }], equipamentos: [], estrutura: [],
  servicos: [{ id: SVC, chave: "s-teste", name: nome, sku: "T1", unidade: "pt", service_category_id: OF, service_subcategory_id: null,
    linhas: ["wc"], medida: null, modo_preco: "tabela", margem: 35, justificacao_preco: null, fases: [], receita_origem: "editada", icone: null,
    exige_produto_categoria_id: null, exige_produto_medida: null, exige_produto_fator: null, exige_produto_arredondar: false, pergunta_manter: null,
    entulho_modo: null, entulho_m3: null, entulho_kg: null }],
  precosServico: [{ service_id: SVC, price: 95, valid_from: "2026-01-15", nota: null, vat_rate: null, created_at: null }],
  passos: [{ servico_id: SVC, ordem: 1, nome: "Execução", minutos_por_unidade: 90, minutos_fixos: 0, skill_id: PERFIL, fase: 1 }],
  usosEquip: [], usosCons: [], produtos, precosProduto: [], fornecedores: [], tecnicos: [],
});
const CATALOGO = { parametros: { meses: 14, tsu: 23.75, seguros_ano: 713, horas_ano: 1345, horas_mes: 672, meses_desatualizado: 6, margem_minima: 28, margem_alvo: 35 } };
const pagina = (seccao: "servicos" | "ligacoes" = "servicos") =>
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><CatalogoCustos rota={{ seccao, ir: vi.fn() }} /></MemoryRouter></QueryClientProvider>);
const nunca = () => new Promise(() => {});

describe("Catálogo e custos: o que a página de Serviços lê", () => {
  beforeEach(() => { rpc.mockReset(); });
  afterEach(() => { reporCustos(); });
  it("Serviços não lê atributos nem modelos; as Ligações leem-nos", async () => {
    rpc.mockResolvedValue({ data: CATALOGO, error: null });
    for (const [seccao, esperado] of [["servicos", false], ["ligacoes", true]] as const) {
      rpc.mockClear();
      const { unmount } = pagina(seccao);
      await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
      const fns = rpc.mock.calls.map((c) => c[0]);
      expect(fns.includes("cat_ler_atributos_definicoes")).toBe(esperado);
      expect(fns.includes("cat_ler_modelos_gestao")).toBe(esperado);
      unmount();
    }
  });
});

describe("Catálogo e custos: o estado de leitura", () => {
  beforeEach(() => { rpc.mockReset(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); reporCustos(); reporCatalogo(); });
  const avancar = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

  it("a ler: indicador com role=status e o texto, sem aviso nem botão", async () => {
    rpc.mockImplementation(nunca);
    pagina();
    await avancar(1000);
    const estado = screen.getByTestId("leitura-catalogo");
    expect(estado).toHaveAttribute("role", "status");
    expect(estado).toHaveTextContent("A ler o Catálogo…");
    expect(screen.queryByText("Está a demorar mais do que o normal.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
  });
  it("aos 10 s acrescenta o aviso e o botão", async () => {
    rpc.mockImplementation(nunca);
    pagina();
    await avancar(10_500);
    expect(screen.getByText("Está a demorar mais do que o normal.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
  });
  it("aos 30 s trata como erro, com «Tentar de novo»", async () => {
    rpc.mockImplementation(nunca);
    pagina();
    await avancar(30_500);
    expect(screen.getByText("A leitura do Catálogo demorou demasiado.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
    expect(screen.queryByText("A ler o Catálogo…")).toBeNull();
  });
  it("«Tentar de novo» lança outra leitura e, se responder, mostra a página", async () => {
    rpc.mockImplementation(nunca);
    pagina();
    await avancar(30_500);
    const antes = rpc.mock.calls.length;
    rpc.mockResolvedValue({ data: CATALOGO, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await avancar(100);
    expect(rpc.mock.calls.length).toBeGreaterThan(antes);
    expect(screen.queryByText("A leitura do Catálogo demorou demasiado.")).toBeNull();
    expect(screen.queryByTestId("leitura-catalogo")).toBeNull();
  });
  // as rpcs pendentes de cada tentativa, para as resolver à mão e por ordem
  type Pendente = { fn: string; soltar: (v: unknown) => void };
  const pendentes: Pendente[] = [];
  const reter = () => { pendentes.length = 0; rpc.mockImplementation((fn: string) => new Promise((r) => { pendentes.push({ fn, soltar: r }); })); };
  const soltarDe = (lista: Pendente[], catalogo: unknown) => { for (const p of lista) p.soltar({ data: p.fn === "cat_ler_catalogo_servicos" ? catalogo : null, error: null }); };

  it("uma resposta que chega depois do tempo limite não se aplica: nem ao ecrã, nem às stores, nem gera mais chamadas", async () => {
    reter();
    pagina();
    await avancar(30_500);
    expect(pendentes.length).toBeGreaterThan(0);
    const chamadas = rpc.mock.calls.length;
    soltarDe(pendentes, comServico("Serviço tardio", [produto("p-tardio", "Produto tardio")]));
    await avancar(1500);
    expect(screen.getByText("A leitura do Catálogo demorou demasiado.")).toBeInTheDocument();
    expect(screen.queryByText("Serviço tardio")).toBeNull();
    expect(lerCatalogoStore().produtos.map((p) => p.n)).not.toContain("Produto tardio");
    expect(rpc.mock.calls.length).toBe(chamadas);
  });
  it("«Tentar de novo» (depois do erro) mostra a página do Catálogo", async () => {
    rpc.mockImplementation(() => new Promise(() => {}));
    pagina();
    await avancar(30_500);
    rpc.mockImplementation(async (fn: string) => ({ data: fn === "cat_ler_catalogo_servicos" ? comServico("Ponto de água de teste") : null, error: null }));
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await avancar(200);
    expect(screen.getByText("Ponto de água de teste")).toBeInTheDocument();
    expect(screen.queryByTestId("leitura-catalogo")).toBeNull();
  });
  it("o botão dos 10 s lança outra leitura e o aviso desaparece", async () => {
    rpc.mockImplementation(() => new Promise(() => {}));
    pagina();
    await avancar(10_500);
    const antes = rpc.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await avancar(100);
    expect(rpc.mock.calls.length).toBeGreaterThan(antes);
    expect(screen.queryByText("Está a demorar mais do que o normal.")).toBeNull();
    expect(screen.getByText("A ler o Catálogo…")).toBeInTheDocument();
  });
  it("uma tentativa antiga que responde depois da nova não se aplica por cima dela", async () => {
    reter();
    pagina();
    await avancar(10_500);
    const antigas = pendentes.splice(0);
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await avancar(100);
    const novas = pendentes.splice(0);
    expect(novas.length).toBeGreaterThan(0);
    soltarDe(novas, comServico("Serviço novo"));
    await avancar(200);
    soltarDe(antigas, comServico("Serviço antigo", [produto("p-antigo", "Produto antigo")]));
    await avancar(200);
    expect(screen.getByText("Serviço novo")).toBeInTheDocument();
    expect(screen.queryByText("Serviço antigo")).toBeNull();
    expect(lerCatalogoStore().produtos.map((p) => p.n)).not.toContain("Produto antigo");
  });
  it("uma tentativa antiga que responde ANTES de a nova acabar também não se aplica", async () => {
    reter();
    pagina();
    await avancar(10_500);
    const antigas = pendentes.splice(0);
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await avancar(100);
    soltarDe(antigas, comServico("Serviço antigo"));
    await avancar(200);
    expect(screen.queryByText("Serviço antigo")).toBeNull();
    expect(screen.getByTestId("leitura-catalogo")).toBeInTheDocument();
  });
  it("não ficam temporizadores da leitura: nem ao desmontar, nem depois do erro dos 30 s", async () => {
    rpc.mockImplementation(() => new Promise(() => {}));
    const a = pagina();
    await avancar(1000);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    a.unmount();
    expect(vi.getTimerCount()).toBe(0);

    pagina();
    await avancar(30_500);
    expect(screen.getByText("A leitura do Catálogo demorou demasiado.")).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("depois do sucesso, passados 40 s não aparece aviso nem erro", async () => {
    rpc.mockImplementation(async (fn: string) => ({ data: fn === "cat_ler_catalogo_servicos" ? comServico("Ponto de água de teste") : null, error: null }));
    pagina();
    await avancar(200);
    expect(screen.getByText("Ponto de água de teste")).toBeInTheDocument();
    await avancar(40_000);
    expect(screen.queryByText("A leitura do Catálogo demorou demasiado.")).toBeNull();
    expect(screen.queryByText("Está a demorar mais do que o normal.")).toBeNull();
    expect(screen.getByText("Ponto de água de teste")).toBeInTheDocument();
  });
  it("depois do erro real, não ficam temporizadores da leitura", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "57014", message: "statement timeout" } });
    pagina();
    await avancar(100);
    expect(screen.getByText("statement timeout")).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("depois de «Tentar de novo» o foco vai para o indicador de leitura (a partir do aviso dos 10 s)", async () => {
    rpc.mockImplementation(() => new Promise(() => {}));
    pagina();
    await avancar(10_500);
    const botao = screen.getByRole("button", { name: "Tentar de novo" });
    botao.focus();
    fireEvent.click(botao);
    await avancar(100);
    const estado = screen.getByTestId("leitura-catalogo");
    expect(estado).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).toBe(estado);
  });
  it("depois de «Tentar de novo» (a partir do erro) o foco também vai para o indicador de leitura", async () => {
    rpc.mockImplementation(() => new Promise(() => {}));
    pagina();
    await avancar(30_500);
    const botao = screen.getByRole("button", { name: "Tentar de novo" });
    botao.focus();
    fireEvent.click(botao);
    await avancar(100);
    expect(document.activeElement).toBe(screen.getByTestId("leitura-catalogo"));
  });
  it("a primeira leitura não rouba o foco ao abrir a página", async () => {
    rpc.mockImplementation(() => new Promise(() => {}));
    pagina();
    await avancar(100);
    expect(document.activeElement).not.toBe(screen.getByTestId("leitura-catalogo"));
  });
  it("o indicador anuncia-se por role=status com aria-busy (sem aria-live redundante)", async () => {
    rpc.mockImplementation(() => new Promise(() => {}));
    pagina();
    await avancar(100);
    const estado = screen.getByTestId("leitura-catalogo");
    expect(estado).toHaveAttribute("aria-busy", "true");
    expect(estado).not.toHaveAttribute("aria-live");
  });
  it("um erro real da leitura também traz «Tentar de novo»", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "57014", message: "statement timeout" } });
    pagina();
    await avancar(100);
    expect(screen.getByText("statement timeout")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
  });
});
