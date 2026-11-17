// 22/01 (regra «exige produto»): ver também selecaoLeve.test.tsx. A seleção guiada da visita com o Catálogo LEVE (K.produtos só tem os produtos dos consumos dos serviços): «Mais produtos» procura no servidor e o produto
// escolhido entra na visita lido inteiro (com o serviço que traz), no mesmo formato de sempre.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useMemo, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MotionGlobalConfig } from "framer-motion";
import { acoes, seed, type Estado, type Negocio } from "./motor";
import { AREA, ESCOLHAS, EXTERIOR, INTERIOR, emFalta, type Grupo } from "./campos";
import { ligarCatalogo } from "./produtosVisita";
import { lerCatalogo, mudarCatalogo, reporCatalogo } from "./v2/catalogoStore";
import type { Produto } from "./v2/catalogoModelo";
import { SelecaoGuiada } from "./SelecaoGuiada";
import { GuiaPassoCtx } from "./guiaPasso";
import { definirCatalogoLido } from "./real/catalogoLeve";

MotionGlobalConfig.skipAnimations = true;

const ORG = "11111111-1111-4111-a111-111111111111";
const linha = (id: string, nome: string) => ({ id, nome, sku: `S-${id}`, sku_gerado: false, marca: "Roca", categoria_id: null, categoria: null, subcategoria_id: null, subcategoria: null,
  modelo_id: null, modelo: null, modelo_numero: null, unidade: "un", custo: 100, pvp: 180, grossista: null, distribuidor: null, fornecedor: "Roca PT", ativo: true, imagem: null, atributos_resumo: null });
const ESPELHO: Produto = { id: "srv-espelho", n: "Espelho redondo 60", custo: 100, un: "un", marca: "Roca", fornecedor: "Roca PT", data: "2026-11-01", no: null, pvp: 180 };

const pagina = vi.fn(), ficha = vi.fn();
vi.mock("./real/produtosPaginados", async (orig) => ({ ...(await orig<typeof import("./real/produtosPaginados")>()), lerProdutosPagina: (...a: unknown[]) => pagina(...a) }));
vi.mock("./real/produtosLeves", () => ({ lerProdutoFicha: (...a: unknown[]) => ficha(...a) }));

function preparar() {
  const S = seed();
  const A = acoes(S, () => {}, (fn) => fn());
  const d = S.deals.find((x) => x.id === 1035)!;
  for (let i = 0; i < 5; i++) {
    const f = emFalta([EXTERIOR, INTERIOR, AREA, ESCOLHAS] as Grupo[], d.f);
    if (!f.length) break;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
  return { S, A, d };
}
function Montar({ S, d, avancar }: { S: Estado; d: Negocio; avancar: () => void }) {
  const [, setN] = useState(0);
  const run = useMemo(() => (fn: () => void) => { fn(); setN((x) => x + 1); }, []);
  const A = useMemo(() => acoes(S, vi.fn(), run), [S, run]);
  const guia = { avancar, recuar: vi.fn(), setGuiado: vi.fn() };
  return <GuiaPassoCtx.Provider value={guia}><SelecaoGuiada S={S} A={A} run={run} go={(fn) => () => run(fn)} q="" repor={vi.fn()} d={d} simples /></GuiaPassoCtx.Provider>;
}
const seguinte = () => fireEvent.click(screen.getByRole("button", { name: /^Seguinte/ }));
const titulo = () => screen.getByRole("heading", { level: 3 }).textContent;
const PRODUTOS: Record<string, Produto> = {
  "srv-san": { id: "srv-san", n: "Sanita Roca Gap", custo: 100, un: "un", marca: "Roca", fornecedor: "", data: "2026-11-01", no: null, pvp: 180 },
  "srv-base": { id: "srv-base", n: "Base de duche Roca 120", custo: 100, un: "un", marca: "Roca", fornecedor: "", data: "2026-11-01", no: null, pvp: 180 },
};

beforeEach(() => {
  window.localStorage.clear(); ligarCatalogo(lerCatalogo); pagina.mockReset(); ficha.mockReset();
  mudarCatalogo((k) => { k.produtos = []; }); // o Catálogo leve: sem os produtos da lista
  // o servidor: «sanita» e «base duche» (as partes da pergunta) e, sem texto, os dois
  pagina.mockImplementation(async (_org: string, f: { q: string }) => {
    const todos = [linha("srv-san", "Sanita Roca Gap"), linha("srv-base", "Base de duche Roca 120")];
    const produtos = todos.filter((l) => !f.q || f.q.split(" ").every((w) => l.nome.toLowerCase().includes(w)));
    return { ok: true, v: { total: produtos.length, pagina: 1, limite: 50, paginas: 1, produtos } };
  });
  // o produto lido é do ramo que a regra «exige» (o nó de «loucas»), como o que o servidor devolveria
  ficha.mockImplementation(async (_o: string, id: string) => ({ ok: true, v: { ...PRODUTOS[id], no: lerCatalogo().exigeProduto!.loucas } }));
  definirCatalogoLido(ORG, true);
});
afterEach(() => { cleanup(); ligarCatalogo(null); reporCatalogo(); definirCatalogoLido(ORG, false); });

describe("a regra «exige produto» com o Catálogo leve", () => {
  it("«a sanita e a base de duche»: com a sanita escolhida a troca NÃO se resolve (o servidor tem bases de duche); com as duas, sim", async () => {
    const { S, d } = preparar();
    delete d.f.materiais_cliente; delete d.f.mobilidade_reduzida;
    render(<Montar S={S} d={d} avancar={vi.fn()} />);
    seguinte(); seguinte();
    expect(titulo()).toBe("O cliente mantém a sanita e a base de duche?");
    fireEvent.click(screen.getByRole("button", { name: /^Troca/ }));
    const lista = await screen.findByRole("list", { name: "Produtos: a sanita e a base de duche" });
    fireEvent.click(await within(lista).findByRole("button", { name: /Sanita Roca Gap/ }));
    await waitFor(() => expect((d.visita.prod ?? []).some((p) => p.id === "srv-san")).toBe(true));
    // a troca resolvida avança sozinha ao fim de 0,6 s: com só a sanita, fica no mesmo passo
    await new Promise((r) => setTimeout(r, 1000));
    expect(titulo()).toBe("O cliente mantém a sanita e a base de duche?");
    fireEvent.click(await within(lista).findByRole("button", { name: /Base de duche Roca 120/ }));
    await waitFor(() => expect(titulo()).toBe("Mais produtos"), { timeout: 3000 });
  });
});

describe("M11: a verificação do ramo", () => {
  it("relê a visita depois da pesquisa: se o produto foi tirado entretanto, a troca não avança", async () => {
    const { S, d } = preparar();
    delete d.f.materiais_cliente; delete d.f.mobilidade_reduzida;
    render(<Montar S={S} d={d} avancar={vi.fn()} />);
    seguinte(); seguinte();
    fireEvent.click(screen.getByRole("button", { name: /^Troca/ }));
    const lista = await screen.findByRole("list", { name: "Produtos: a sanita e a base de duche" });
    // as pesquisas das partes da pergunta (com texto) ficam à espera
    let soltar!: () => void;
    const espera = new Promise<void>((r) => { soltar = r; });
    const antes = pagina.getMockImplementation()!;
    pagina.mockImplementation(async (o: string, f: { q: string }) => { if (f.q) await espera; return antes(o, f); });
    fireEvent.click(await within(lista).findByRole("button", { name: /Sanita Roca Gap/ }));
    await waitFor(() => expect((d.visita.prod ?? []).some((p) => p.id === "srv-san")).toBe(true));
    fireEvent.click(await within(lista).findByRole("button", { name: /Base de duche Roca 120/ }));
    await waitFor(() => expect((d.visita.prod ?? []).some((p) => p.id === "srv-base")).toBe(true));
    fireEvent.click(await within(lista).findByRole("button", { name: /Base de duche Roca 120/ })); // tira-a
    await waitFor(() => expect((d.visita.prod ?? []).some((p) => p.id === "srv-base")).toBe(false));
    soltar();
    await new Promise((r) => setTimeout(r, 1000));
    expect(titulo()).toBe("O cliente mantém a sanita e a base de duche?");
  });
  it("se a pesquisa do ramo falha, avisa que não foi possível verificar (escolha à mão)", async () => {
    const { S, d } = preparar();
    delete d.f.materiais_cliente; delete d.f.mobilidade_reduzida;
    render(<Montar S={S} d={d} avancar={vi.fn()} />);
    seguinte(); seguinte();
    fireEvent.click(screen.getByRole("button", { name: /^Troca/ }));
    const lista = await screen.findByRole("list", { name: "Produtos: a sanita e a base de duche" });
    const antes = pagina.getMockImplementation()!;
    pagina.mockImplementation(async (o: string, f: { q: string }) => (f.q ? { ok: false, erro: "tempo" } : antes(o, f)));
    fireEvent.click(await within(lista).findByRole("button", { name: /Sanita Roca Gap/ }));
    expect(await screen.findByText(/não foi possível verificar o ramo; escolha à mão/i)).toBeInTheDocument();
  });
});
