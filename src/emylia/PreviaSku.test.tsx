// 16/11: a pré-visualização da referência (SKU) ao criar um produto (PreviaSku.tsx): cat_prever_sku com debounce de ~300 ms, só na página real.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string, a: Record<string, unknown>) => { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f, a); }) },
}));

import { PreviaSku } from "./PreviaSku";
import type { AtributoDef, AtributoProduto } from "./v2/catalogoModelo";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const C1 = "c0000000-0000-4000-a000-000000000001", S1 = "50000000-0000-4000-a000-000000000001";
const A_COR = "aaaaaaaa-0000-4000-a000-000000000001", O_AZUL = "bbbbbbbb-0000-4000-a000-000000000001", O_VERM = "bbbbbbbb-0000-4000-a000-000000000002";
const DEFS: AtributoDef[] = [{ id: A_COR, codigo: "cor", nome: "Cor", tipo: "lista", temHex: false, ordem: 1, opcoes: [] }];
const REAL: FichaProdutoReal = { org: ORG, podeEditar: true, podeMudarPrecos: false, recarregar: vi.fn(async () => undefined) };
const categorias = { categorias: [{ id: C1, nome: "Casa de banho", ordem: 1, ativo: true, global: false, usados: 0, sigla: "BC", subcategorias: [{ id: S1, nome: "Torneiras", ordem: 1, ativo: true, global: false, usados: 0, sigla: "TO" }] }] };
const attr = (opcaoId: string): AtributoProduto[] => [{ atributoId: A_COR, opcaoId, valor: "x" }];
const chamadasDe = (f: string) => base.chamadas.filter((c) => c.f === f);

type P = Partial<Parameters<typeof PreviaSku>[0]>;
const props = (p: P = {}): Parameters<typeof PreviaSku>[0] => ({ real: REAL, categoria: "Casa de banho", subcategoria: "Torneiras", categoriaNova: false, attrs: attr(O_AZUL), defs: DEFS, manual: false, ...p });
const avancar = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  base.chamadas = [];
  base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: categorias, error: null } : { data: { sku: "BC-TO-0001-AZ", faltas: [] }, error: null });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("PreviaSku", () => {
  it("sem página real (protótipo) não mostra nada nem chama a base", async () => {
    const { container } = render(<PreviaSku {...props({ real: undefined })} />);
    await avancar(1000);
    expect(container).toBeEmptyDOMElement();
    expect(base.chamadas).toHaveLength(0);
  });
  it("com referência escrita à mão não pré-visualiza: fica a que se escreveu", async () => {
    render(<PreviaSku {...props({ manual: true })} />);
    await avancar(1000);
    expect(screen.getByRole("status")).toHaveTextContent("Fica a referência que escreveu.");
    expect(base.chamadas).toHaveLength(0);
  });
  it("sem categoria diz o que falta e não chama a base", async () => {
    render(<PreviaSku {...props({ categoria: null, subcategoria: null })} />);
    await avancar(1000);
    expect(screen.getByRole("status")).toHaveTextContent("Escolha a categoria");
    expect(base.chamadas).toHaveLength(0);
  });
  it("espera ~300 ms; chama cat_prever_sku com os ids da categoria e os atributos no formato da base; mostra «a confirmar ao guardar»", async () => {
    render(<PreviaSku {...props()} />);
    await avancar(250);
    expect(chamadasDe("cat_prever_sku")).toHaveLength(0);
    await avancar(100);
    expect(chamadasDe("cat_prever_sku")).toHaveLength(1);
    expect(chamadasDe("cat_prever_sku")[0].a).toEqual({ p_org: ORG, p_categoria: C1, p_subcategoria: S1, p_atributos: [{ atributo: A_COR, opcao: O_AZUL }] });
    const s = screen.getByRole("status");
    expect(s).toHaveTextContent("Referência gerada: BC-TO-0001-AZ");
    expect(s).toHaveTextContent("a confirmar ao guardar");
  });
  it("escrever depressa conta como uma só chamada (debounce) e só a última resposta vale", async () => {
    const { rerender } = render(<PreviaSku {...props()} />);
    await avancar(200);
    rerender(<PreviaSku {...props({ attrs: attr(O_VERM) })} />);
    await avancar(200);
    rerender(<PreviaSku {...props({ attrs: [] })} />);
    await avancar(400);
    expect(chamadasDe("cat_prever_sku")).toHaveLength(1);
    expect(chamadasDe("cat_prever_sku")[0].a.p_atributos).toEqual([]);
  });
  it("faltas em texto: sigla da categoria e da opção, com os nomes; o SKU parcial acaba em «…»", async () => {
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: categorias, error: null } : { data: { sku: "BC-TO-0001", faltas: ["sigla:cor"] }, error: null });
    render(<PreviaSku {...props()} />);
    await avancar(400);
    const s = screen.getByRole("status");
    expect(s).toHaveTextContent("Referência gerada: BC-TO-0001-…");
    expect(s).toHaveTextContent("Falta a sigla da opção escolhida em «Cor»");
    cleanup();
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: categorias, error: null } : { data: { sku: null, faltas: ["sigla_categoria"] }, error: null });
    render(<PreviaSku {...props()} />);
    await avancar(400);
    expect(screen.getByRole("status")).toHaveTextContent("Falta a sigla da categoria «Casa de banho»");
    expect(screen.getByRole("status")).not.toHaveTextContent("a confirmar ao guardar");
  });
  it("uma categoria ou subcategoria nova (ainda não existe na base) não chama a base: a referência gera-se ao guardar", async () => {
    render(<PreviaSku {...props({ categoriaNova: true })} />);
    await avancar(1000);
    expect(screen.getByRole("status")).toHaveTextContent("A categoria ou subcategoria é nova: a referência gera-se ao guardar.");
    expect(base.chamadas).toHaveLength(0);
  });
  it("uma categoria que a base não conhece pelo nome também não: gera-se ao guardar", async () => {
    render(<PreviaSku {...props({ categoria: "Outra", subcategoria: null })} />);
    await avancar(500);
    expect(chamadasDe("cat_prever_sku")).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("gera-se ao guardar");
  });
  it("duas categorias com o mesmo nome: não adivinha, não prevê e diz porquê", async () => {
    const dup = { categorias: [categorias.categorias[0], { ...categorias.categorias[0], id: "c0000000-0000-4000-a000-000000000009", subcategorias: [] }] };
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: dup, error: null } : { data: { sku: "X", faltas: [] }, error: null });
    render(<PreviaSku {...props({ subcategoria: null })} />);
    await avancar(500);
    expect(chamadasDe("cat_prever_sku")).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("Não é possível prever: há categorias com o mesmo nome.");
  });
  it("prefere a categoria ativa e da organização à global com o mesmo nome", async () => {
    const G = "c0000000-0000-4000-a000-0000000000aa";
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: { categorias: [{ ...categorias.categorias[0], id: G, global: true, subcategorias: [] }, categorias.categorias[0]] }, error: null } : { data: { sku: "BC-0001", faltas: [] }, error: null });
    render(<PreviaSku {...props({ subcategoria: null })} />);
    await avancar(500);
    expect(chamadasDe("cat_prever_sku")[0].a.p_categoria).toBe(C1);
  });
  it("ao desmontar, uma resposta que chega depois não prossegue (o pedido fica invalidado)", async () => {
    let soltar: (v: unknown) => void = () => {};
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? new Promise((r) => { soltar = r as never; }) : { data: { sku: "X", faltas: [] }, error: null });
    const { unmount } = render(<PreviaSku {...props()} />);
    await avancar(400);
    unmount();
    soltar({ data: categorias, error: null });
    await avancar(100);
    expect(chamadasDe("cat_prever_sku")).toHaveLength(0);
  });
  it("a base responde com erro: diz-o, sem rebentar; função por aplicar: «Ainda não disponível nesta base»", async () => {
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: categorias, error: null } : { data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    render(<PreviaSku {...props()} />);
    await avancar(400);
    expect(screen.getByRole("status")).toHaveTextContent("Ainda não disponível nesta base");
  });
});
