// 17/11: a seleção guiada da visita com o Catálogo LEVE (K.produtos só tem os produtos dos consumos dos serviços): «Mais produtos» procura no servidor e o produto
// escolhido entra na visita lido inteiro (com o serviço que traz), no mesmo formato de sempre.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useMemo, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MotionGlobalConfig } from "framer-motion";
import { acoes, seed, type Estado, type Negocio } from "./motor";
import { AREA, ESCOLHAS, EXTERIOR, INTERIOR, emFalta, type Grupo } from "./campos";
import { ligarCatalogo } from "./produtosVisita";
import { lerCatalogo, reporCatalogo } from "./v2/catalogoStore";
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
function Montar({ S, d }: { S: Estado; d: Negocio }) {
  const [, setN] = useState(0);
  const run = useMemo(() => (fn: () => void) => { fn(); setN((x) => x + 1); }, []);
  const A = useMemo(() => acoes(S, vi.fn(), run), [S, run]);
  const guia = { avancar: vi.fn(), recuar: vi.fn(), setGuiado: vi.fn() };
  return <GuiaPassoCtx.Provider value={guia}><SelecaoGuiada S={S} A={A} run={run} go={(fn) => () => run(fn)} q="" repor={vi.fn()} d={d} simples /></GuiaPassoCtx.Provider>;
}
const seguinte = () => fireEvent.click(screen.getByRole("button", { name: /^Seguinte/ }));
const titulo = () => screen.getByRole("heading", { level: 3 }).textContent;

beforeEach(() => {
  window.localStorage.clear(); ligarCatalogo(lerCatalogo); pagina.mockReset(); ficha.mockReset();
  pagina.mockImplementation(async (_org: string, f: { q: string }) => ({ ok: true, v: { total: 1, pagina: 1, limite: 50, paginas: 1,
    produtos: [linha("srv-espelho", "Espelho redondo 60")].filter((l) => !f.q || l.nome.toLowerCase().includes(f.q.toLowerCase())) } }));
  ficha.mockResolvedValue({ ok: true, v: ESPELHO });
  definirCatalogoLido(ORG, true);
});
afterEach(() => { cleanup(); ligarCatalogo(null); reporCatalogo(); definirCatalogoLido(ORG, false); });

describe("a seleção guiada com o Catálogo leve", () => {
  it("«Mais produtos» procura no servidor e o produto escolhido entra na visita, lido inteiro", async () => {
    const { S, d } = preparar();
    delete d.f.materiais_cliente; delete d.f.mobilidade_reduzida;
    render(<Montar S={S} d={d} />);
    seguinte(); seguinte(); seguinte();
    expect(titulo()).toBe("Mais produtos");
    const lista = await screen.findByRole("list", { name: "Mais produtos" });
    expect(pagina).toHaveBeenCalledWith(ORG, expect.objectContaining({ q: "" }), 1);
    // a lista é a do servidor, não os produtos do Catálogo de demonstração
    const botao = await within(lista).findByRole("button", { name: /Espelho redondo/ });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(1);
    fireEvent.click(botao);
    await waitFor(() => expect((d.visita.prod ?? []).some((p) => p.id === "srv-espelho")).toBe(true));
    expect(ficha).toHaveBeenCalledWith(ORG, "srv-espelho");
    expect(lerCatalogo().produtos.some((p) => p.id === "srv-espelho")).toBe(true); // ficou no Catálogo em memória (o motor procura-o aí)
    expect((d.visita.prod ?? []).find((p) => p.id === "srv-espelho")).toMatchObject({ n: "Espelho redondo 60" });
  });
  it("escrever na pesquisa procura no servidor", async () => {
    const { S, d } = preparar();
    delete d.f.materiais_cliente; delete d.f.mobilidade_reduzida;
    render(<Montar S={S} d={d} />);
    seguinte(); seguinte(); seguinte();
    await screen.findByRole("list", { name: "Mais produtos" });
    fireEvent.change(screen.getByRole("searchbox", { name: /Procurar em mais produtos/i }), { target: { value: "toalheiro" } });
    await waitFor(() => expect(pagina).toHaveBeenLastCalledWith(ORG, expect.objectContaining({ q: "toalheiro" }), 1), { timeout: 3000 });
    expect(await screen.findByText(/Nada com "toalheiro"/)).toBeInTheDocument();
  });
  it("erro a ler o produto escolhido: avisa e a visita fica como estava", async () => {
    ficha.mockResolvedValue({ ok: false, erro: "Produto não encontrado." });
    const { S, d } = preparar();
    delete d.f.materiais_cliente; delete d.f.mobilidade_reduzida;
    render(<Montar S={S} d={d} />);
    seguinte(); seguinte(); seguinte();
    const lista = await screen.findByRole("list", { name: "Mais produtos" });
    fireEvent.click(await within(lista).findByRole("button", { name: /Espelho redondo/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Produto não encontrado.");
    expect((d.visita.prod ?? []).some((p) => p.id === "srv-espelho")).toBe(false);
  });
  it("toque duplo no mesmo cartão: lê o produto UMA vez e diz que está a ler", async () => {
    let soltar!: (v: unknown) => void;
    ficha.mockImplementation(() => new Promise((r) => { soltar = r; }));
    const { S, d } = preparar();
    delete d.f.materiais_cliente; delete d.f.mobilidade_reduzida;
    render(<Montar S={S} d={d} />);
    seguinte(); seguinte(); seguinte();
    const lista = await screen.findByRole("list", { name: "Mais produtos" });
    const botao = await within(lista).findByRole("button", { name: /Espelho redondo/ });
    fireEvent.click(botao); fireEvent.click(botao);
    expect(await screen.findByText("A ler o produto…")).toBeInTheDocument();
    expect(ficha).toHaveBeenCalledTimes(1);
    soltar({ ok: true, v: ESPELHO });
    await waitFor(() => expect((d.visita.prod ?? []).filter((p) => p.id === "srv-espelho")).toHaveLength(1));
    expect(screen.queryByText("A ler o produto…")).toBeNull();
  });
  it("sem o «Filtrar» da fase e do tipo: não filtravam a lista do servidor", async () => {
    const { S, d } = preparar();
    delete d.f.materiais_cliente; delete d.f.mobilidade_reduzida;
    render(<Montar S={S} d={d} />);
    seguinte(); seguinte(); seguinte();
    await screen.findByRole("list", { name: "Mais produtos" });
    expect(screen.queryByRole("button", { name: /^Filtrar/ })).toBeNull();
    expect(screen.getByRole("searchbox", { name: /Procurar em mais produtos/i })).toBeInTheDocument();
  });
});
