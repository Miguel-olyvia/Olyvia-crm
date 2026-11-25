// 23/11: a secção «Modelo 3D» aparece ao CRIAR (dentro de «O produto», a seguir aos atributos) e ao EDITAR (na ficha, a seguir aos atributos), fechada;
// com o nome, a subcategoria e as medidas do próprio produto. O Visualizador3D está simulado (jsdom não tem WebGL).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./planta3d/Visualizador3D", () => ({
  default: (p: { espaco: { pecas: { largura: number; nome?: string }[] }; descricao: string }) =>
    <div data-testid="canvas3d" role="img" aria-label={p.descricao} data-nome={p.espaco.pecas[0].nome} data-largura={p.espaco.pecas[0].largura} />,
}));
// o Supabase simulado regista as funções chamadas e as escritas (insert, update, upsert, delete), para provar que abrir o 3D não grava nada
const base = vi.hoisted(() => ({ respostas: {} as Record<string, { data: unknown; error: unknown }>, rpcs: [] as string[], escritas: [] as string[] }));
vi.mock("@/integrations/supabase/client", () => {
  const cadeia = (tabela: string) => {
    const c: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "order", "limit"]) c[k] = () => c;
    for (const k of ["insert", "update", "upsert", "delete"]) c[k] = () => { base.escritas.push(`${tabela}.${k}`); return c; };
    c.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return c;
  };
  return { supabase: { rpc: vi.fn(async (f: string) => { base.rpcs.push(f); return base.respostas[f] ?? { data: null, error: null }; }), from: vi.fn((t: string) => cadeia(t)) } };
});
/** As funções da base que escrevem (cat_guardar_*, cat_definir_*, cat_criar_*…) e qualquer insert, update, upsert ou delete. */
const ESCRITA = /^cat_(guardar|definir|criar|eliminar|apagar|gravar|mudar|ligar|importar)|insert|update|upsert|delete/i;
const escritasFeitas = () => [...base.rpcs.filter((f) => ESCRITA.test(f)), ...base.escritas];

import { acoes, seed } from "./motor";
import { CatalogoV1 } from "./CatalogoV1";
import { FichaProduto } from "./FichaProduto";
import { reporCustos } from "./v2/custosStore";
import { mudarCatalogo, reporCatalogo } from "./v2/catalogoStore";
import type { AtributoDef, No, Produto } from "./v2/catalogoModelo";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const ARVORE: No[] = [{ id: "c1", n: "Casa de banho", pai: null }, { id: "s1", n: "Sanitas", pai: "c1" }];
const DEFS: AtributoDef[] = [{ id: "a-med", codigo: "medida", nome: "Medida", tipo: "medida", temHex: false, ordem: 1, opcoes: [] }];
const PID = "11111111-2222-4333-8444-555555555555";
const real: FichaProdutoReal = { org: "org-1", podeEditar: true, podeMudarPrecos: true, recarregar: vi.fn(async () => {}) };

beforeEach(() => { base.respostas = { cat_produto_stock: { data: { gere_stock: true, pode_editar: true, armazens: [] }, error: null } }; base.rpcs = []; base.escritas = []; });
afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); });

describe("Modelo 3D ao criar um produto", () => {
  const abrirCriar = () => {
    mudarCatalogo((k) => { k.arvore = structuredClone(ARVORE); k.atributos = structuredClone(DEFS); });
    const S = seed(), run = (fn: () => void) => fn();
    render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} real={real} />);
    fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
  };
  it("a secção «Modelo 3D» está lá, dentro de «O produto», fechada e sem canvas", () => {
    abrirCriar();
    const produto = screen.getByRole("region", { name: "O produto" });
    const sec = within(produto).getByRole("region", { name: "Modelo 3D" });
    expect(within(sec).getByRole("button", { name: "Ver em 3D" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("canvas3d")).toBeNull();
  });
  it("abrir mostra o 3D do nome escrito; o resto do formulário continua igual", async () => {
    abrirCriar();
    fireEvent.change(screen.getByLabelText("Nome do produto"), { target: { value: "Sanita suspensa Rimless" } });
    fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" }));
    expect((await screen.findByTestId("canvas3d")).getAttribute("data-nome")).toBe("Sanita suspensa Rimless");
    expect(screen.getByRole("region", { name: "Compra e venda" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar o produto" })).toBeInTheDocument();
  });
  it("não grava nada por abrir e fechar o 3D: nenhuma função de escrita nem insert, update, upsert ou delete, e o produto não se cria", async () => {
    abrirCriar();
    fireEvent.change(screen.getByLabelText("Nome do produto"), { target: { value: "Sanita suspensa Rimless" } });
    fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" }));
    await screen.findByTestId("canvas3d");
    await waitFor(() => expect(screen.getByRole("button", { name: "Criar o produto" })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" }));
    expect(screen.queryByTestId("canvas3d")).toBeNull();
    expect(escritasFeitas()).toEqual([]);
  });
});

describe("Modelo 3D ao editar um produto (ficha)", () => {
  const PROD: Produto = { id: PID, n: "Sanita suspensa Rimless", custo: 60, pvp: 100, un: "un", marca: "Grohe", fornecedor: "", data: "2026-10-01", no: "s1", sub: "Sanitas", sku: "GR-1",
    attrs: [{ atributoId: "a-med", medida: { tipo: "3D", largura: 400, comprimento: 520, espessura: 400, unidade: "mm" } }] };
  const ficha = (p: Produto = PROD, tipo: "produto" | "consumivel" = "produto") =>
    render(<FichaProduto p={p} min={28} alvo={35} voltar={vi.fn()} anunciar={vi.fn()} nomeServico={(s) => s} onAbrirServico={vi.fn()} real={real} tipo={tipo} atributos={DEFS} arvore={ARVORE} />);
  it("a secção «Modelo 3D» está lá, fechada, e não monta nada", () => {
    ficha();
    const sec = screen.getByRole("region", { name: "Modelo 3D" });
    expect(within(sec).getByRole("button", { name: "Ver em 3D" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("canvas3d")).toBeNull();
  });
  it("abrir mostra o 3D do produto, com a medida do atributo (mm passa a cm)", async () => {
    ficha();
    fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" }));
    const c = await screen.findByTestId("canvas3d");
    expect(c.getAttribute("data-nome")).toBe("Sanita suspensa Rimless");
    expect(c.getAttribute("data-largura")).toBe("0.4");
  });
  it("não grava nada por abrir e fechar o 3D", async () => {
    ficha();
    fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" }));
    await screen.findByTestId("canvas3d");
    fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" }));
    expect(screen.queryByTestId("canvas3d")).toBeNull();
    expect(base.rpcs.length).toBeGreaterThan(0); // o mock vê as leituras da ficha: sem escritas, o teste não é vazio
    expect(escritasFeitas()).toEqual([]);
  });
  it("um consumível não tem a secção", () => {
    ficha(PROD, "consumivel");
    expect(screen.queryByRole("region", { name: "Modelo 3D" })).toBeNull();
  });
});
