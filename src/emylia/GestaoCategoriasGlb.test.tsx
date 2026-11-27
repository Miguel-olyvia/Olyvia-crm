// 27/11: o GLB PRÓPRIO nas páginas de Categorias e de Subcategorias (categoriasAcoes.tsx): o chip «GLB · 1,2 MB» / «Sem GLB» em cada categoria e subcategoria e o botão «Modelo 3D próprio…»
// que abre o diálogo (ModeloGlbDialogo.tsx). Sem permissão, a gravar ou numa partilhada o botão fica à vista e bloqueado, com a razão; depois de gravar a página relê, anuncia e o foco volta
// ao botão. A base e a validação estão simuladas (a gravação é o contrato de modeloGlbDados.ts); uma categoria e uma subcategoria gravam com o mesmo alvo da base: «categoria».
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  glbs: {} as Record<string, { caminho: string; bytes: number }>,
  guardar: vi.fn(),
  remover: vi.fn(),
  analisar: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async (f: string, a: Record<string, unknown>) => {
    base.chamadas.push({ f, a });
    return f === "cat_ler_categorias_gestao" ? { data: { categorias: CATEGORIAS() }, error: null } : { data: null, error: null };
  }) },
}));
vi.mock("./modeloGlbDados", async (original) => ({
  ...(await original<typeof import("./modeloGlbDados")>()),
  guardarGlbProprio: base.guardar, removerGlbProprio: base.remover, urlDoGlbProprio: (c: string | null) => (c ? `https://cdn.teste/${c}` : null),
}));
vi.mock("./planta3d/glbValidar", async (original) => ({ ...(await original<typeof import("./planta3d/glbValidar")>()), analisarGlb: base.analisar }));

import { GestaoCategorias } from "./GestaoCategorias";
import { GestaoSubcategorias } from "./GestaoSubcategorias";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const C1 = "c0000000-0000-4000-a000-000000000001", C4 = "c0000000-0000-4000-a000-000000000004";
const S1 = "50000000-0000-4000-a000-000000000001", S2 = "50000000-0000-4000-a000-000000000002", S5 = "50000000-0000-4000-a000-000000000005";
const CAMINHO = `${ORG}/aaaaaaaa-bbbb-4ccc-8ddd-000000000001.glb`;
const comGlb = (id: string) => (base.glbs[id] ? { glb_caminho: base.glbs[id].caminho, glb_bytes: base.glbs[id].bytes } : { glb_caminho: null, glb_bytes: null });
const CATEGORIAS = () => [
  { id: C1, nome: "Casa de banho", ordem: 1, ativo: true, global: false, usados: 5, ...comGlb(C1), subcategorias: [
    { id: S1, nome: "Louças", ordem: 1, ativo: true, global: false, usados: 3, ...comGlb(S1) },
    { id: S2, nome: "Torneiras", ordem: 2, ativo: true, global: false, usados: 0 },
  ] },
  { id: C4, nome: "Ferramentas", ordem: 4, ativo: true, global: true, usados: 7, subcategorias: [{ id: S5, nome: "Manuais", ordem: 1, ativo: true, global: true, usados: 2 }] },
];

const REAL = (p: Partial<FichaProdutoReal> = {}): FichaProdutoReal => ({ org: ORG, podeEditar: true, podeMudarPrecos: false, recarregar: vi.fn(async () => undefined), ...p });
const relatorio = { ok: true, erros: [], avisos: [], triangulos: 1200, malhas: 1, materiais: ["corpo"], bytes: 1_258_291, abriu: true };
const leituras = () => base.chamadas.filter((c) => c.f === "cat_ler_categorias_gestao").length;
const razao = (b: HTMLElement) => (b.getAttribute("aria-describedby") ?? "").split(" ").map((i) => document.getElementById(i)?.textContent ?? "").join(" ").trim();

beforeEach(() => {
  base.chamadas = []; base.glbs = {};
  base.guardar.mockReset(); base.remover.mockReset(); base.analisar.mockReset();
  base.analisar.mockResolvedValue(relatorio);
  base.guardar.mockImplementation(async (_o: string, _a: string, id: string) => { base.glbs[id] = { caminho: CAMINHO, bytes: 1_258_291 }; return { ok: true, v: { alvo: "categoria", id, caminho: CAMINHO, anterior: null, anteriorOrfao: false, avisos: [], bytes: 1_258_291, triangulos: 1200 } }; });
  base.remover.mockImplementation(async (_o: string, _a: string, id: string) => { delete base.glbs[id]; return { ok: true, v: { alvo: "categoria", id, caminho: null, anterior: CAMINHO, anteriorOrfao: true } }; });
});
afterEach(cleanup);

const escolherFicheiro = async () => {
  fireEvent.change(screen.getByLabelText("Ficheiro GLB"), { target: { files: [new File([new Uint8Array(64)], "m.glb")] } });
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Ficheiro válido/));
};
const confirmar = async (titulo: RegExp) => fireEvent.click(within(await screen.findByRole("group", { name: titulo })).getByRole("button", { name: "Confirmar" }));

describe("Categorias: o chip e o botão do GLB próprio", () => {
  const abrir = async (r: FichaProdutoReal = REAL(), anunciar = vi.fn()) => {
    render(<GestaoCategorias real={r} anunciar={anunciar} />);
    await screen.findByRole("article", { name: "Casa de banho" });
    return anunciar;
  };
  const cartao = () => screen.getByRole("article", { name: "Casa de banho" });
  const linhaSub = (nome: string) => within(cartao()).getAllByRole("listitem").find((x) => (x.textContent ?? "").startsWith(nome))!;
  const botaoCat = () => within(cartao()).getByRole("button", { name: "Modelo 3D próprio da categoria Casa de banho" });
  const botaoSub = (nome: string) => within(linhaSub(nome)).getByRole("button", { name: `Modelo 3D próprio da subcategoria ${nome} em Casa de banho` });

  it("a categoria e a subcategoria dizem se têm GLB; sem a chave na leitura diz «Sem GLB»", async () => {
    base.glbs = { [C1]: { caminho: CAMINHO, bytes: 1_258_291 } };
    await abrir();
    expect(within(cartao()).getAllByText("GLB · 1,2 MB")).toHaveLength(1);
    expect(linhaSub("Louças")).toHaveTextContent("Sem GLB");
    expect(linhaSub("Torneiras")).toHaveTextContent("Sem GLB");
  });

  it("o botão fica à vista em cada categoria e subcategoria, com o nome", async () => {
    await abrir();
    expect(botaoCat()).toHaveTextContent("Modelo 3D próprio…");
    expect(botaoSub("Louças")).not.toHaveAttribute("aria-disabled");
  });

  it("sem permissão de editar, o botão fica à vista e bloqueado, com a razão; clicar não abre nada", async () => {
    await abrir(REAL({ podeEditar: false }));
    expect(botaoCat()).toHaveAttribute("aria-disabled", "true");
    expect(razao(botaoCat())).toMatch(/Só quem pode editar produtos/);
    fireEvent.click(botaoCat());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("numa categoria ou subcategoria partilhada o botão está bloqueado e diz porquê (a base recusa um GLB numa partilhada)", async () => {
    await abrir();
    const partilhada = screen.getByRole("article", { name: "Ferramentas" });
    const bc = within(partilhada).getByRole("button", { name: "Modelo 3D próprio da categoria Ferramentas" });
    expect(bc).toHaveAttribute("aria-disabled", "true");
    expect(razao(bc)).toMatch(/partilhada/);
    const bs = within(partilhada).getByRole("button", { name: "Modelo 3D próprio da subcategoria Manuais em Ferramentas" });
    expect(bs).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(bs);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("categoria: o diálogo diz os produtos da categoria, grava com o alvo «categoria», relê, anuncia, avisa o Catálogo e o foco volta ao botão", async () => {
    const real = REAL();
    const anunciar = await abrir(real);
    const antes = leituras();
    fireEvent.click(botaoCat());
    expect(await screen.findByRole("dialog", { name: "Modelo 3D próprio" })).toHaveAccessibleDescription(/Da categoria «Casa de banho»/);
    await escolherFicheiro();
    fireEvent.click(screen.getByRole("button", { name: "Carregar" }));
    expect(await screen.findByRole("group", { name: /Carregar este modelo 3D em «Casa de banho»/ })).toHaveTextContent("5 produtos");
    await confirmar(/Carregar este modelo 3D/);
    await waitFor(() => expect(base.guardar).toHaveBeenCalledTimes(1));
    expect(base.guardar.mock.calls[0].slice(0, 3)).toEqual([ORG, "categoria", C1]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(leituras()).toBeGreaterThan(antes);
    expect(anunciar).toHaveBeenCalledWith("Modelo 3D próprio de «Casa de banho» carregado (1,2 MB).");
    expect(real.recarregar).toHaveBeenCalled();
    await waitFor(() => expect(within(cartao()).getAllByText("GLB · 1,2 MB")).toHaveLength(1));
    await waitFor(() => expect(document.activeElement).toBe(botaoCat()));
  });

  it("subcategoria: «Da subcategoria», os produtos da subcategoria e o mesmo alvo «categoria» da base", async () => {
    await abrir();
    fireEvent.click(botaoSub("Louças"));
    expect(await screen.findByRole("dialog")).toHaveAccessibleDescription(/Da subcategoria «Louças»/);
    await escolherFicheiro();
    fireEvent.click(screen.getByRole("button", { name: "Carregar" }));
    expect(await screen.findByRole("group", { name: /Carregar este modelo 3D em «Louças»/ })).toHaveTextContent("3 produtos");
    await confirmar(/Carregar este modelo 3D/);
    await waitFor(() => expect(base.guardar).toHaveBeenCalled());
    expect(base.guardar.mock.calls[0].slice(0, 3)).toEqual([ORG, "categoria", S1]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(linhaSub("Louças")).toHaveTextContent("GLB · 1,2 MB"));
  });

  it("remover: com GLB, o diálogo oferece Remover e o chip passa a «Sem GLB»", async () => {
    base.glbs = { [S1]: { caminho: CAMINHO, bytes: 1_258_291 } };
    const anunciar = await abrir();
    fireEvent.click(botaoSub("Louças"));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: /^Remover/ }));
    await confirmar(/Remover o modelo 3D próprio de «Louças»/);
    await waitFor(() => expect(base.remover).toHaveBeenCalledWith(ORG, "categoria", S1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(anunciar).toHaveBeenCalledWith("Modelo 3D próprio de «Louças» removido: o 3D volta ao modelo escolhido ou ao automático.");
    await waitFor(() => expect(linhaSub("Louças")).toHaveTextContent("Sem GLB"));
  });

  it("uma falha da base fica no diálogo, a página relê na mesma e não anuncia", async () => {
    base.guardar.mockResolvedValue({ ok: false, erro: "Categoria não encontrada.", codigo: "CT003" });
    const anunciar = await abrir();
    const antes = leituras();
    fireEvent.click(botaoCat());
    await screen.findByRole("dialog");
    await escolherFicheiro();
    fireEvent.click(screen.getByRole("button", { name: "Carregar" }));
    await confirmar(/Carregar este modelo 3D/);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Categoria não encontrada."));
    await waitFor(() => expect(leituras()).toBeGreaterThan(antes));
    expect(anunciar).not.toHaveBeenCalled();
  });
});

describe("Subcategorias: o chip e o botão do GLB próprio", () => {
  const abrir = async (r: FichaProdutoReal = REAL(), anunciar = vi.fn()) => {
    render(<GestaoSubcategorias real={r} anunciar={anunciar} />);
    await screen.findByText("Louças");
    return anunciar;
  };
  const linha = (nome: string) => screen.getAllByRole("listitem").find((x) => (x.textContent ?? "").startsWith(nome))!;
  const botao = (nome: string, cat: string) => within(linha(nome)).getByRole("button", { name: `Modelo 3D próprio da subcategoria ${nome} em ${cat}` });

  it("cada linha diz se tem GLB, e o botão abre o diálogo da subcategoria; grava com o alvo «categoria» e relê", async () => {
    base.glbs = { [S1]: { caminho: CAMINHO, bytes: 1_258_291 } };
    const anunciar = await abrir();
    expect(linha("Louças")).toHaveTextContent("GLB · 1,2 MB");
    expect(linha("Torneiras")).toHaveTextContent("Sem GLB");
    const antes = leituras();
    fireEvent.click(botao("Torneiras", "Casa de banho"));
    expect(await screen.findByRole("dialog")).toHaveAccessibleDescription(/Da subcategoria «Torneiras»/);
    await escolherFicheiro();
    fireEvent.click(screen.getByRole("button", { name: "Carregar" }));
    expect(await screen.findByRole("group", { name: /Carregar este modelo 3D em «Torneiras»/ })).toHaveTextContent("Nenhum produto");
    await confirmar(/Carregar este modelo 3D/);
    await waitFor(() => expect(base.guardar).toHaveBeenCalled());
    expect(base.guardar.mock.calls[0].slice(0, 3)).toEqual([ORG, "categoria", S2]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(leituras()).toBeGreaterThan(antes);
    expect(anunciar).toHaveBeenCalledWith("Modelo 3D próprio de «Torneiras» carregado (1,2 MB).");
    await waitFor(() => expect(document.activeElement).toBe(botao("Torneiras", "Casa de banho")));
  });

  it("sem permissão de editar, o botão fica bloqueado com a razão", async () => {
    await abrir(REAL({ podeEditar: false }));
    const b = botao("Louças", "Casa de banho");
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(razao(b)).toMatch(/Só quem pode editar produtos/);
  });
});
