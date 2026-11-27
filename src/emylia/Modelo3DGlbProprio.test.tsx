// 27/11: o GLB PRÓPRIO na ficha do produto. O Modelo, a subcategoria ou a categoria do produto podem ter um GLB carregado à mão; a ficha mostra-o (a forma do ficheiro, escalada pelas medidas do
// produto e com a cor e a textura dele) e diz de onde vem. A escolha manual do produto vence-o; sem GLB, tudo como antes. O Visualizador3D está simulado (jsdom não tem WebGL): mostra o que o modelo recebeu.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AtributoDef, AtributoProduto } from "./v2/catalogoModelo";

const base = vi.hoisted(() => ({
  chamadas: [] as string[],
  categorias: [] as unknown[],
  modelos: [] as unknown[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (f: string) => {
      base.chamadas.push(f);
      if (f === "cat_ler_categorias_gestao") return { data: { categorias: base.categorias }, error: null };
      if (f === "cat_ler_modelos_gestao") return { data: { modelos: base.modelos }, error: null };
      return { data: null, error: null };
    }),
    storage: { from: (bucket: string) => ({ getPublicUrl: (caminho: string) => ({ data: { publicUrl: `https://cdn.teste/${bucket}/${caminho}` } }) }) },
  },
}));
vi.mock("./planta3d/Visualizador3D", () => ({
  default: (p: { descricao: string; modelos: Record<string, { dimensoes: { deNome: boolean }; mockup3d: { url?: string; proprio?: boolean; cor: string; corDoProduto?: boolean; generico?: { id: string } } }>; espaco: { pecas: { produtoId: string }[] } }) => {
    const m = p.modelos[p.espaco.pecas[0].produtoId];
    return <div data-testid="canvas3d" role="img" aria-label={p.descricao} data-url={m.mockup3d.url ?? ""} data-proprio={String(!!m.mockup3d.proprio)} data-cor={m.mockup3d.cor} data-cor-produto={String(!!m.mockup3d.corDoProduto)} data-de-nome={String(m.dimensoes.deNome)} data-generico={m.mockup3d.generico?.id ?? ""} />;
  },
}));

import { Modelo3DProduto } from "./Modelo3DProduto";
import { invalidarGlbsDoCatalogo } from "./glbCatalogoCache";
import { registarFalhaGlb, registarEstadoGlb } from "./planta3d/estadoGlbProprio";
import type { NoCat } from "./planta3d/catalogo3d";

const ORG = "3242e925-da26-459a-8258-be04d904e355";
const G = (n: string) => `${ORG}/aaaaaaaa-bbbb-4ccc-8ddd-${n.padStart(12, "0")}.glb`;
const URL_DE = (n: string) => `https://cdn.teste/catalogo-modelos3d/${G(n)}`;
const ARVORE: NoCat[] = [{ id: "n-cb", n: "Casa de banho", pai: null }, { id: "n-bides", n: "Bidés", pai: "n-cb" }];
const A_COR = "aaaaaaaa-0000-4000-a000-000000000041", A_MED = "aaaaaaaa-0000-4000-a000-000000000043";
const COR: AtributoDef = { id: A_COR, codigo: "cor", nome: "Cor", tipo: "lista", temHex: true, temFoto: false, ordem: 1, opcoes: [{ id: "azul", valor: "azul", nome: "Azul", hex: "#336699", foto: null, ordem: 1 }] };
const MEDIDA: AtributoProduto = { atributoId: A_MED, opcaoId: null, valor: "", medida: { tipo: "2D", largura: 54, comprimento: 36, espessura: null, unidade: "cm" } } as unknown as AtributoProduto;
const AZUL: AtributoProduto = { atributoId: A_COR, opcaoId: "azul", valor: "azul" };

const categoria = (extra: Record<string, unknown> = {}, sub: Record<string, unknown> = {}) => ({ id: "c1", nome: "Casa de banho", ...extra, subcategorias: [{ id: "s1", nome: "Bidés", ...sub }] });
const modelo = (extra: Record<string, unknown> = {}) => ({ id: "m1", nome: "SMOOTH", numero: 1, ativo: true, usados: 0, subcategoria: { id: "s1", nome: "Bidés" }, categoria: { id: "c1", nome: "Casa de banho" }, ...extra });

beforeEach(() => { base.chamadas = []; base.categorias = []; base.modelos = []; invalidarGlbsDoCatalogo(); });
afterEach(cleanup);

type Extra = Partial<React.ComponentProps<typeof Modelo3DProduto>>;
const montar = (extra: Extra = {}) => render(<Modelo3DProduto nome="Bidé suspenso" sub="Bidés" no="n-bides" arvore={ARVORE} attrs={[MEDIDA, AZUL]} defs={[COR]} org={ORG} modeloId="m1" {...extra} />);
const abrir = async (extra: Extra = {}) => { montar(extra); fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" })); return screen.findByTestId("canvas3d"); };

describe("Modelo3DProduto com GLB próprio", () => {
  it("o GLB do Modelo: o 3D recebe o url e a marca `proprio`, a cor do produto e as medidas do produto; o texto diz de onde vem", async () => {
    base.categorias = [categoria()];
    base.modelos = [modelo({ glb_caminho: G("1"), glb_bytes: 5000 })];
    montar();
    await waitFor(() => expect(screen.getByTestId("modelo3d-origem").textContent).toContain("Modelo 3D próprio (do modelo SMOOTH)"));
    fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" }));
    const c = await screen.findByTestId("canvas3d");
    expect(c.getAttribute("data-url")).toBe(URL_DE("1"));
    expect(c.getAttribute("data-proprio")).toBe("true");
    expect(c.getAttribute("data-cor")).toBe("#336699");
    expect(c.getAttribute("data-cor-produto")).toBe("true");
    expect(c.getAttribute("data-de-nome")).toBe("true"); // o produto tem Medida: o GLB escala por ela
    expect(c.getAttribute("data-generico")).not.toBe(""); // o genérico fica como reserva
  });

  it("sem Modelo, vale o GLB da subcategoria (e depois o da categoria)", async () => {
    base.categorias = [categoria({ glb_caminho: G("3"), glb_bytes: 100 }, { glb_caminho: G("2"), glb_bytes: 100 })];
    montar({ modeloId: null });
    await waitFor(() => expect(screen.getByTestId("modelo3d-origem").textContent).toContain("Modelo 3D próprio (da subcategoria Bidés)"));
    cleanup(); invalidarGlbsDoCatalogo(ORG);
    base.categorias = [categoria({ glb_caminho: G("3"), glb_bytes: 100 })];
    montar({ modeloId: null });
    await waitFor(() => expect(screen.getByTestId("modelo3d-origem").textContent).toContain("Modelo 3D próprio (da categoria Casa de banho)"));
  });

  it("sem cor nem medidas do produto o GLB não é pintado e fica no tamanho nativo (sem marcas)", async () => {
    base.categorias = [categoria({}, { glb_caminho: G("2"), glb_bytes: 100 })];
    const c = await abrir({ attrs: [], modeloId: null });
    await waitFor(() => expect(c.getAttribute("data-proprio")).toBe("true"));
    expect(c.getAttribute("data-cor-produto")).toBe("false");
    expect(c.getAttribute("data-de-nome")).toBe("false");
  });

  it("a escolha manual do produto manda: nem lê os GLB, e o texto é o de sempre", async () => {
    base.categorias = [categoria({ glb_caminho: G("3"), glb_bytes: 100 })];
    const c = await abrir({ modelo3d: "bide" });
    expect(c.getAttribute("data-proprio")).toBe("false");
    expect(c.getAttribute("data-url")).toBe("");
    expect(screen.getByTestId("modelo3d-origem").textContent).toContain("escolhido neste produto");
    expect(base.chamadas).toEqual([]);
  });

  it("um id escolhido na subcategoria vence o GLB da categoria; no mesmo nível o GLB vence o id", async () => {
    base.categorias = [categoria({ glb_caminho: G("3"), glb_bytes: 100 }, { modelo3d: "bide" })];
    const c = await abrir({ modeloId: null });
    await waitFor(() => expect(base.chamadas.length).toBe(2));
    expect(c.getAttribute("data-proprio")).toBe("false");
    cleanup(); invalidarGlbsDoCatalogo(ORG);
    base.categorias = [categoria({}, { modelo3d: "bide", glb_caminho: G("2"), glb_bytes: 100 })];
    const d = await abrir({ modeloId: null });
    await waitFor(() => expect(d.getAttribute("data-proprio")).toBe("true"));
  });

  it("sem organização (protótipo, formulário sem base) não lê nada e o 3D é o de sempre", async () => {
    base.categorias = [categoria({ glb_caminho: G("3"), glb_bytes: 100 })];
    const c = await abrir({ org: null });
    expect(c.getAttribute("data-proprio")).toBe("false");
    expect(base.chamadas).toEqual([]);
    expect(screen.getByTestId("modelo3d-origem").textContent).toContain("automático");
  });

  it("a leitura falhar (base sem a migração) deixa tudo como estava", async () => {
    base.categorias = [categoria({ glb_caminho: "isto/nao/e/um.glb" }, { glb_caminho: "outro-lixo" })];
    const c = await abrir({ modeloId: null });
    await waitFor(() => expect(base.chamadas.length).toBe(2));
    expect(c.getAttribute("data-proprio")).toBe("false");
  });

  it("com GLB próprio não aparece o aviso «sem modelo 3D parecido» (o que se vê é o ficheiro), e sem GLB aparece como sempre", async () => {
    const especial: NoCat[] = [{ id: "n-x", n: "Peças especiais", pai: null }];
    const extra = { nome: "Objeto sem tipo conhecido", sub: null, no: "n-x", arvore: especial, modeloId: null, attrs: [] as AtributoProduto[] };
    const semGlb = await abrir(extra);
    await waitFor(() => expect(base.chamadas.length).toBe(2));
    expect(semGlb.getAttribute("data-proprio")).toBe("false");
    await waitFor(() => expect(screen.getByText(/Sem modelo 3D parecido/)).toBeTruthy());
    cleanup(); invalidarGlbsDoCatalogo(ORG);
    base.categorias = [{ id: "c9", nome: "Peças especiais", subcategorias: [], glb_caminho: G("9"), glb_bytes: 100 }];
    const comGlb = await abrir(extra);
    await waitFor(() => expect(comGlb.getAttribute("data-proprio")).toBe("true"));
    expect(screen.queryByText(/Sem modelo 3D parecido/)).toBeNull();
  });
});

describe("a nota do GLB próprio (falha, aviso)", () => {
  it("se o GLB não abrir, a nota diz porquê e que se mostra o genérico", async () => {
    base.categorias = [categoria({}, { glb_caminho: G("2"), glb_bytes: 100 })];
    const c = await abrir({ modeloId: null });
    await waitFor(() => expect(c.getAttribute("data-url")).toBe(URL_DE("2")));
    act(() => registarFalhaGlb(URL_DE("2"), new TypeError("Failed to fetch")));
    await waitFor(() => expect(screen.getByText(/Não foi possível carregar o modelo 3D próprio.*genérico/)).toBeTruthy());
  });
  it("um aviso (tamanho nativo) também se mostra, e «ok» não mostra nada", async () => {
    base.categorias = [categoria({}, { glb_caminho: G("2"), glb_bytes: 100 })];
    const c = await abrir({ modeloId: null });
    await waitFor(() => expect(c.getAttribute("data-url")).toBe(URL_DE("2")));
    act(() => registarEstadoGlb(URL_DE("2"), { tipo: "ok" }));
    expect(screen.queryByText(/modelo 3D próprio/i, { selector: "p[role='status']" })).toBeNull();
    act(() => registarEstadoGlb(URL_DE("2"), { tipo: "aviso", texto: "O modelo 3D próprio é muito grande." }));
    await waitFor(() => expect(screen.getByText("O modelo 3D próprio é muito grande.")).toBeTruthy());
  });
});
