// 22/01: a volta do Estúdio com o Catálogo LEVE (K.produtos sem a lista dos 29 785 produtos): o par de cada peça vem do servidor
// (cat_pesquisar_produtos) e é lido inteiro (cat_ler_produto) antes de o Estúdio levar o projeto ao negócio. Mesmo fluxo de VisitaEstudioFluxo.test.tsx.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Negocio } from "./motor";
import { DoEstudio, EstudioNaVisita } from "./VisitaEstudio";
import type { Ctx } from "./pecas";
import { retangulo } from "./planta";
import { CHAVE_ESTUDIO, CHAVE_VOLTA, abrirEstudio, devolverAoNegocio } from "@/pages/prototipo-estudio/daVisita";
import type { Projeto } from "@/pages/prototipo-estudio/necessidadesEstudio";
import { lerCatalogo, mudarCatalogo, reporCatalogo } from "./v2/catalogoStore";
import { definirCatalogoLido } from "./real/catalogoLeve";
import { limparCandidatosDoEstudio } from "./real/produtosDoEstudio";
import type { Produto } from "./v2/catalogoModelo";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const ORG = "11111111-1111-4111-a111-111111111111";
const linha = (id: string, nome: string) => ({ id, nome, sku: null, sku_gerado: null, marca: "Roca", categoria_id: null, categoria: null, subcategoria_id: null, subcategoria: null,
  modelo_id: null, modelo: null, modelo_numero: null, unidade: "un", custo: 50, pvp: 100, grossista: null, distribuidor: null, fornecedor: null, ativo: true, imagem: null,
  atributos_resumo: null, servico_id: null, fator_servico: null });
const pesquisa = vi.fn(), ficha = vi.fn();
vi.mock("./real/produtosPaginados", async (orig) => ({ ...(await orig<typeof import("./real/produtosPaginados")>()), lerPesquisaProdutos: (...a: unknown[]) => pesquisa(...a) }));
vi.mock("./real/produtosLeves", () => ({ lerProdutoFicha: (...a: unknown[]) => ficha(...a) }));

const pag = (produtos: unknown[]) => ({ ok: true, v: { total: produtos.length, pagina: 1, limite: 50, paginas: 1, produtos } });
const PRODUTO = (id: string): Produto => ({ id, n: id === "srv-base" ? "Base de duche Roca 120" : "Sanita suspensa Roca", custo: 50, un: "un", marca: "Roca", fornecedor: "", data: "2026-11-01", no: null } as Produto);
beforeEach(() => {
  localStorage.clear(); pesquisa.mockReset(); ficha.mockReset(); limparCandidatosDoEstudio();
  mudarCatalogo((k) => { k.produtos = []; });
  definirCatalogoLido(ORG, true);
  pesquisa.mockImplementation(async (_o: string, f: { q: string }) => pag(f.q === "base" ? [linha("srv-base", "Base de duche Roca 120")] : f.q === "sanita" ? [linha("srv-san", "Sanita suspensa Roca")] : []));
  ficha.mockImplementation(async (_o: string, id: string) => ({ ok: true, v: { id, n: id === "srv-base" ? "Base de duche Roca 120" : "Sanita suspensa Roca", custo: 50, un: "un", marca: "Roca", fornecedor: "", data: "2026-11-01", no: null } as Produto }));
});
afterEach(() => { cleanup(); reporCatalogo(); definirCatalogoLido(ORG, false); limparCandidatosDoEstudio(); });

function projetoVoltado(d: Negocio, fechar = false): Projeto {
  expect(abrirEstudio(d.nome, d.f, d.id, "/negocios")).toBe(true);
  const p0 = JSON.parse(localStorage.getItem(CHAVE_ESTUDIO)!) as Projeto;
  const planta = { o: { x: 50, y: 50 }, paredes: retangulo(200, 250), pecas: [] };
  const p: Projeto = {
    ...p0, antes: planta, depois: { ...planta, pecas: [{ id: "b", tipo: "base", x: 50, y: 50, w: 120, h: 70 }, { id: "s", tipo: "sanita", x: 200, y: 250, w: 36, h: 52 }] },
    escolhas: { b: "bas-ard-p", s: "san-nexo-s" }, revestimento: "rev-tela-c", servicos: [{ id: "sv-imperm", q: 4.6 }], gravadoEm: Date.now(),
  };
  localStorage.setItem(CHAVE_ESTUDIO, JSON.stringify(p));
  expect(devolverAoNegocio(p, fechar)).toBe(true);
  return p;
}

describe("a volta do Estúdio com o Catálogo leve", () => {
  it("o par da base de duche e da sanita vem do servidor e chega às necessidades do negócio", async () => {
    const S = seed();
    const run = (fn: () => void) => { fn(); };
    const ctx = { S, A: acoes(S, () => {}, run), run, go: (fn: () => void) => () => run(fn), q: "" } as unknown as Ctx;
    const d = S.deals.find((x) => x.linha === "wc" && x.fase === 2)! as Negocio;
    expect(lerCatalogo().produtos).toHaveLength(0);
    projetoVoltado(d);
    render(<EstudioNaVisita ctx={ctx} d={d} />);
    await waitFor(() => expect((d.visita.prod ?? []).map((x) => x.id).sort()).toEqual(["srv-base", "srv-san"]));
    expect(pesquisa).toHaveBeenCalledWith(ORG, expect.objectContaining({ q: "base" }), 1);
    expect(ficha).toHaveBeenCalledWith(ORG, "srv-base");
    expect(lerCatalogo().produtos.map((p) => p.id).sort()).toEqual(["srv-base", "srv-san"]);
    expect(await screen.findByText(/Nas necessidades:/)).toBeInTheDocument();
  });
  it("sem o Catálogo leve (leitura inteira) a volta é a de sempre: não pesquisa no servidor", () => {
    definirCatalogoLido(ORG, false);
    const S = seed();
    const run = (fn: () => void) => { fn(); };
    const ctx = { S, A: acoes(S, () => {}, run), run, go: (fn: () => void) => () => run(fn), q: "" } as unknown as Ctx;
    const d = S.deals.find((x) => x.linha === "wc" && x.fase === 2)! as Negocio;
    projetoVoltado(d);
    mudarCatalogo((k) => { k.produtos = [{ id: "loc-base", n: "Base de duche local", custo: 1, un: "un", marca: "", fornecedor: "", data: "2026-11-01", no: null }]; });
    render(<EstudioNaVisita ctx={ctx} d={d} />);
    expect(pesquisa).not.toHaveBeenCalled();
    expect((d.visita.prod ?? []).some((x) => x.id === "loc-base")).toBe(true);
  });
});

describe("«Do Estúdio para as necessidades» com o Catálogo leve", () => {
  it("mostra o par do servidor e «Juntar» lê o produto inteiro antes de o pôr nas necessidades", async () => {
    const S = seed();
    const produto = vi.fn(), run = (fn: () => void) => { fn(); };
    const ctx = { S, A: { produto, extra: vi.fn() }, run } as unknown as Ctx;
    const d = S.deals.find((x) => x.linha === "wc" && x.fase === 2)! as Negocio;
    const feito = vi.fn();
    render(<DoEstudio ctx={ctx} d={d} linhas={[{ id: "prod-s", n: "Sanita", q: 1, un: "un", tipo: "produto", chave: "sanita" }]} feito={feito} />);
    expect(await screen.findByText("Sanita suspensa Roca")).toBeInTheDocument();
    expect(screen.getByText(/melhor correspondência entre os primeiros resultados/)).toBeInTheDocument(); // M5
    fireEvent.click(screen.getByRole("button", { name: /Juntar às necessidades/ }));
    await waitFor(() => expect(produto).toHaveBeenCalledWith(d.id, expect.objectContaining({ id: "srv-san", n: "Sanita suspensa Roca" }), 1));
    expect(ficha).toHaveBeenCalledWith(ORG, "srv-san");
    await waitFor(() => expect(feito).toHaveBeenCalledWith(expect.stringContaining("1 produto")));
  });
});

function montarCtx() {
  const S = seed();
  const run = (fn: () => void) => { fn(); };
  const base = acoes(S, () => {}, run);
  const fecharVisita = vi.fn();
  const ctx = { S, A: { ...base, fecharVisita }, run, go: (fn: () => void) => () => run(fn), q: "" } as unknown as Ctx;
  const d = S.deals.find((x) => x.linha === "wc" && x.fase === 2)! as Negocio;
  return { S, ctx, d, fecharVisita };
}

describe("H1: «Fechar a visita» com erros de leitura", () => {
  it("se um produto não se leu, a visita NÃO fecha e a mensagem diz qual", async () => {
    ficha.mockImplementation(async (_o: string, id: string) => (id === "srv-san" ? { ok: false, erro: "sem permissão" } : { ok: true, v: PRODUTO(id) }));
    const { ctx, d, fecharVisita } = montarCtx();
    projetoVoltado(d, true);
    render(<EstudioNaVisita ctx={ctx} d={d} />);
    expect(await screen.findByText(/Sanita suspensa Roca.*sem permissão/)).toBeInTheDocument();
    expect(fecharVisita).not.toHaveBeenCalled();
    expect(screen.getByText(/visita ficou aberta/i)).toBeInTheDocument();
  });
  it("sem erros, fecha como sempre", async () => {
    const { ctx, d, fecharVisita } = montarCtx();
    projetoVoltado(d, true);
    render(<EstudioNaVisita ctx={ctx} d={d} />);
    await waitFor(() => expect(fecharVisita).toHaveBeenCalledTimes(1));
  });
  it("se aplicar lançar, não fica uma rejeição por tratar: mostra o erro e não fecha", async () => {
    const { ctx, d, fecharVisita } = montarCtx();
    const campo = ctx.A.campo;
    (ctx.A as unknown as { campo: unknown }).campo = (id: number, k: string, v: string) => { if (k === "estudio") return campo(id, k, v); throw new Error("falhou a gravar"); };
    projetoVoltado(d, true);
    const solta = vi.fn();
    window.addEventListener("unhandledrejection", solta);
    render(<EstudioNaVisita ctx={ctx} d={d} />);
    expect(await screen.findByText(/falhou a gravar/)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 30));
    window.removeEventListener("unhandledrejection", solta);
    expect(solta).not.toHaveBeenCalled();
    expect(fecharVisita).not.toHaveBeenCalled();
  });
});

describe("M3 e M4: negócio que mudou, componente desmontado, botão", () => {
  it("se o componente desmontou, ignora a resposta (nada entra no negócio)", async () => {
    let soltar!: () => void;
    const espera = new Promise<void>((r) => { soltar = r; });
    ficha.mockImplementation(async (_o: string, id: string) => { await espera; return { ok: true, v: PRODUTO(id) }; });
    const { ctx, d } = montarCtx();
    projetoVoltado(d);
    const { unmount } = render(<EstudioNaVisita ctx={ctx} d={d} />);
    await waitFor(() => expect(ficha).toHaveBeenCalled());
    unmount(); soltar();
    await new Promise((r) => setTimeout(r, 50));
    expect(d.visita.prod ?? []).toHaveLength(0);
  });
  it("se o negócio mudou entretanto, a resposta do anterior não se aplica ao novo", async () => {
    let soltar!: () => void;
    const espera = new Promise<void>((r) => { soltar = r; });
    ficha.mockImplementation(async (_o: string, id: string) => { await espera; return { ok: true, v: PRODUTO(id) }; });
    const { S, ctx, d } = montarCtx();
    const d2 = (S.deals.find((x) => x.id !== d.id && x.linha === "wc") ?? S.deals.find((x) => x.id !== d.id)!) as Negocio;
    projetoVoltado(d);
    const { rerender } = render(<EstudioNaVisita ctx={ctx} d={d} />);
    await waitFor(() => expect(ficha).toHaveBeenCalled());
    rerender(<EstudioNaVisita ctx={ctx} d={d2} />);
    soltar();
    await new Promise((r) => setTimeout(r, 50));
    expect(d2.visita.prod ?? []).toHaveLength(0);
    expect(d.visita.prod ?? []).toHaveLength(0);
  });
  it("«Trazer do Estúdio» fica desativado a ler, com «A ler os produtos do Estúdio…»", async () => {
    let soltar!: () => void;
    const espera = new Promise<void>((r) => { soltar = r; });
    ficha.mockImplementation(async (_o: string, id: string) => { await espera; return { ok: true, v: PRODUTO(id) }; });
    const { ctx, d } = montarCtx();
    const p = projetoVoltado(d);
    localStorage.removeItem(CHAVE_VOLTA);
    d.f.estudio = JSON.stringify(p);
    render(<EstudioNaVisita ctx={ctx} d={d} />);
    fireEvent.click(screen.getByRole("button", { name: "Trazer do Estúdio" }));
    expect(await screen.findByText("A ler os produtos do Estúdio…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trazer do Estúdio" })).toBeDisabled();
    soltar();
    await waitFor(() => expect(screen.queryByText("A ler os produtos do Estúdio…")).toBeNull());
    expect(screen.getByRole("button", { name: "Trazer do Estúdio" })).toBeEnabled();
  });
  it("M5: diz no ecrã que o par é a melhor correspondência entre os primeiros resultados", async () => {
    const { ctx, d } = montarCtx();
    projetoVoltado(d);
    render(<EstudioNaVisita ctx={ctx} d={d} />);
    expect(await screen.findByText(/melhor correspondência entre os primeiros resultados/)).toBeInTheDocument();
  });
});
