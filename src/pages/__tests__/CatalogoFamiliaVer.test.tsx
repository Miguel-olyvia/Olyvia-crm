// A página /catalogo/produtos/familias/:id (vista da família com 3D): lê a família uma vez (cat_ler_familia_vista, simulada) e a árvore leve de categorias (para o 3D classificar o
// produto); estados (a ler, erro com «Tentar de novo» e ligação de volta, vazia), a função ainda por aplicar na base dá um erro claro, e o 3D não espera pelas escolhas.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const org = vi.hoisted(() => ({ id: "org-1" as string | null, loading: false }));
const previa = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
const leve = vi.hoisted(() => vi.fn());
const dados = vi.hoisted(() => ({ lerFamiliaVista: vi.fn() }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: org.id ? { id: org.id } : null, isLoading: org.loading }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt", setLanguage: () => undefined }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ getPublicUrl: (c: string) => ({ data: { publicUrl: `https://cdn.teste/${c}` } }) }) } } }));
vi.mock("@/emylia/real/produtosLeves", () => ({ lerCatalogoLeve: (...a: unknown[]) => leve(...a) }));
vi.mock("@/emylia/familias/familiasDados", async (orig) => ({ ...(await orig<typeof import("@/emylia/familias/familiasDados")>()), ...dados }));
vi.mock("@/emylia/Previa3DProduto", () => ({ Previa3DProduto: (p: Record<string, unknown>) => { previa.props.push(p); return <div data-testid="previa3d" />; } }));

import { SANITA } from "@/emylia/familias/fixturesFamiliaVista";
import CatalogoFamiliaVer from "../CatalogoFamiliaVer";

const ARVORE = [{ id: "n-s1", n: "Sanitas", pai: null }];
const K = { arvore: ARVORE, categoriasProduto: [{ id: "n-s1", n: "Sanitas", pai: null, ordem: 1, origem: "s1" }] };
const COM_SUB = { ...SANITA, produtos: SANITA.produtos.map((p) => ({ ...p, subcategoriaId: "s1", subcategoria: "Sanitas" })) };
const montar = () => render(
  <MemoryRouter initialEntries={["/catalogo/produtos/familias/f-sanita"]}>
    <Routes>
      <Route path="/catalogo/produtos/familias/:id" element={<CatalogoFamiliaVer />} />
      <Route path="*" element={<p data-testid="sitio">lista</p>} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  org.id = "org-1"; org.loading = false; previa.props.length = 0;
  leve.mockReset(); dados.lerFamiliaVista.mockReset();
  leve.mockResolvedValue({ ok: true, v: { K, margens: { min: 28, alvo: 35 }, erroAtributos: null } });
  dados.lerFamiliaVista.mockResolvedValue({ ok: true, v: COM_SUB });
});
afterEach(cleanup);

describe("CatalogoFamiliaVer", () => {
  it("lê a família da rota, para a organização ativa, e mostra-a", async () => {
    montar();
    expect(screen.getByText("A abrir a família…")).toBeTruthy();
    expect(await screen.findByRole("heading", { level: 1, name: "SANITA GLAMIC BTW" })).toBeTruthy();
    expect(dados.lerFamiliaVista).toHaveBeenCalledWith("org-1", "f-sanita");
    expect(screen.getByRole("radiogroup", { name: "Cor" })).toBeTruthy();
  });

  it("o 3D recebe a árvore de categorias leve e o nó do produto (a classificação: revestimentos, colunas…)", async () => {
    montar();
    await screen.findByTestId("previa3d");
    const p = previa.props[previa.props.length - 1]!;
    expect(p).toMatchObject({ sub: "Sanitas", no: "n-s1", arvore: ARVORE });
  });

  it("o 3D não espera pelas escolhas: com a árvore ainda a ler, as escolhas já se usam e o 3D diz «A preparar o 3D…»", async () => {
    let soltar: (v: unknown) => void = () => undefined;
    leve.mockImplementation(() => new Promise((r) => { soltar = r; }));
    montar();
    await screen.findByRole("heading", { level: 1, name: "SANITA GLAMIC BTW" });
    expect(screen.queryByTestId("previa3d")).toBeNull();
    expect(screen.getByText("A preparar o 3D…")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Cinza" }));
    expect(screen.getByText("LS-S-0003-C-M")).toBeTruthy();
    soltar({ ok: true, v: { K, margens: { min: 28, alvo: 35 }, erroAtributos: null } });
    expect(await screen.findByTestId("previa3d")).toBeTruthy();
    expect(screen.getByText("LS-S-0003-C-M")).toBeTruthy(); // a escolha feita antes mantém-se
  });

  it("se a árvore não se lê o 3D abre na mesma (sem ela classifica pelo nome) e a página não parte", async () => {
    leve.mockResolvedValue({ ok: false, erro: "falhou" });
    montar();
    await screen.findByTestId("previa3d");
    expect(previa.props[previa.props.length - 1]!.arvore).toEqual([]);
  });

  it("um erro de leitura: mensagem, «Tentar de novo» (volta a ler) e a ligação de volta às famílias", async () => {
    dados.lerFamiliaVista.mockResolvedValueOnce({ ok: false, erro: "Sem ligação." });
    montar();
    expect((await screen.findByRole("alert")).textContent).toContain("Não foi possível abrir a família.");
    expect(screen.getByRole("alert").textContent).toContain("Sem ligação.");
    expect(screen.getByRole("link", { name: "Voltar às famílias" }).getAttribute("href")).toBe("/catalogo/produtos/familias");
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByRole("heading", { level: 1, name: "SANITA GLAMIC BTW" })).toBeTruthy();
    expect(dados.lerFamiliaVista).toHaveBeenCalledTimes(2);
  });

  it("a função da base ainda por aplicar: um erro claro e não um ecrã partido", async () => {
    dados.lerFamiliaVista.mockResolvedValue({ ok: false, erro: "Ainda não disponível nesta base", codigo: "PGRST202" });
    montar();
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("A leitura da família ainda não está disponível nesta base.");
    expect(alerta.textContent).not.toContain("Ainda não disponível nesta base");
    expect(screen.queryByTestId("previa3d")).toBeNull();
  });

  it("sem permissão (CT001) mostra a mensagem em português da base", async () => {
    dados.lerFamiliaVista.mockResolvedValue({ ok: false, erro: "Sem permissão para ler o catálogo.", codigo: "CT001" });
    montar();
    expect((await screen.findByRole("alert")).textContent).toContain("Sem permissão para ler o catálogo.");
  });

  it("uma família sem produtos diz-o", async () => {
    dados.lerFamiliaVista.mockResolvedValue({ ok: true, v: { ...SANITA, produtos: [] } });
    montar();
    expect(await screen.findByText("Esta família ainda não tem produtos.")).toBeTruthy();
    expect(screen.queryByTestId("previa3d")).toBeNull();
  });

  it("sem organização ativa pede para escolher uma, e não lê nada", () => {
    org.id = null;
    montar();
    expect(screen.getByText("Escolha uma organização para ver a família.")).toBeTruthy();
    expect(dados.lerFamiliaVista).not.toHaveBeenCalled();
  });

  it("enquanto a organização carrega não lê nada", async () => {
    org.loading = true;
    montar();
    await waitFor(() => expect(screen.getByText("A carregar…")).toBeTruthy());
    expect(dados.lerFamiliaVista).not.toHaveBeenCalled();
  });
});
