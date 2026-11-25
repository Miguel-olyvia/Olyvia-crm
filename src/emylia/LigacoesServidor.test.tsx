// 23/11: «Catálogo e custos › Serviços › Ligações» dava «canceling statement due to statement timeout» (lia os ~29 600 produtos da Mudelar com cat_ler_catalogo).
// Agora a página lê o Catálogo leve e os produtos do mapa vêm do servidor, à medida: os que trazem o serviço do centro, os da pesquisa para escolher o centro,
// e os problemas não acusam ramos sem produtos que só não estão em memória.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seed } from "./motor";
import { lerCustos, reporCustos } from "./v2/custosStore";
import { lerCatalogo, reporCatalogo } from "./v2/catalogoStore";
import type { Produto } from "./v2/catalogoModelo";
import { montarCatalogo, problemasCatalogo, type CatalogoLig } from "./ligacoes";
import { LigacoesCatalogo, abrirLigacoesEm } from "./LigacoesCatalogo";
import type { ServidorLigacoes } from "./real/ligacoesServidor";
import { usaLeituraLeve } from "./catalogoRotas";

afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); });

/** O Catálogo como a leitura leve o deixa: os serviços todos, nenhum produto (os de escolher). */
function leve(): CatalogoLig {
  const K = montarCatalogo(seed(), lerCustos(), lerCatalogo());
  return { ...K, produtos: [] };
}
const prod = (id: string, n: string, extra: Partial<Produto> = {}): Produto => ({ id, n, custo: 50, un: "un", marca: "Roca", fornecedor: "", data: "2026-11-23", no: null, ...extra });
function servidor(over: Partial<ServidorLigacoes> = {}): ServidorLigacoes {
  return {
    trazem: vi.fn(async () => ({ ok: true as const, v: [] })),
    doRamo: vi.fn(async () => ({ ok: true as const, v: [] })),
    procurar: vi.fn(async () => ({ ok: true as const, v: [] })),
    escolher: vi.fn(async (id: string) => ({ ok: false as const, erro: `sem ${id}` })),
    nosComProduto: vi.fn(async () => ({ ok: true as const, v: [] })),
    ...over,
  };
}
const centro = () => screen.getByRole("heading", { level: 2, name: (_, el) => el.id === "lig-centro" });

describe("Ligações com o Catálogo leve", () => {
  it("a página das Ligações lê o Catálogo leve (já não o inteiro)", () => {
    expect(usaLeituraLeve("ligacoes")).toBe(true);
  });

  it("com um serviço no centro, os produtos que o trazem vêm do servidor e aparecem no mapa", async () => {
    const K = leve(), s = K.servicos[0];
    abrirLigacoesEm({ t: "svc", id: s.id });
    const srv = servidor({ trazem: vi.fn(async () => ({ ok: true as const, v: [prod("p-1", "Sanita do servidor", { servico: s.id })] })) });
    render(<LigacoesCatalogo K={K} onAbrirFicha={vi.fn()} servidor={srv} />);
    expect(centro()).toHaveTextContent(s.n);
    expect(srv.trazem).toHaveBeenCalledWith(s.id);
    const grupo = await screen.findByRole("region", { name: "Produtos" });
    expect(await within(grupo).findByText("Sanita do servidor")).toBeInTheDocument();
  });

  it("escolher o centro procura também nos produtos do servidor; tocar num põe-no no centro", async () => {
    const K = leve();
    abrirLigacoesEm({ t: "svc", id: K.servicos[0].id });
    const srv = servidor({ procurar: vi.fn(async () => ({ ok: true as const, v: [prod("p-9", "Móvel AXIS Suspenso c/lavatório 60x50x36")] })) });
    render(<LigacoesCatalogo K={K} onAbrirFicha={vi.fn()} servidor={srv} />);
    fireEvent.change(screen.getByPlaceholderText("Serviço, produto, técnico…"), { target: { value: "axis" } });
    const op = await screen.findByRole("button", { name: /Móvel AXIS Suspenso/ }, { timeout: 2000 });
    expect(srv.procurar).toHaveBeenCalledWith("axis");
    fireEvent.click(op);
    await waitFor(() => expect(centro()).toHaveTextContent("Móvel AXIS Suspenso"));
  });

  it("uma falha do servidor diz-se, sem partir o mapa", async () => {
    const K = leve();
    abrirLigacoesEm({ t: "svc", id: K.servicos[1].id });
    render(<LigacoesCatalogo K={K} onAbrirFicha={vi.fn()} servidor={servidor({ trazem: vi.fn(async () => ({ ok: false as const, erro: "statement timeout" })) })} />);
    expect(await screen.findByText(/Não foi possível ler todos os produtos ligados: statement timeout/)).toBeInTheDocument();
    expect(centro()).toHaveTextContent(K.servicos[1].n);
  });
});

describe("problemasCatalogo com o Catálogo leve", () => {
  it("sem as contagens do servidor não acusa «exige um produto que não existe» (os produtos só não estão em memória), nem produtos sem serviço", () => {
    const K = leve();
    K.produtos = [prod("p-x", "Sanita sem serviço")];
    const todos = problemasCatalogo(K), parcial = problemasCatalogo(K, { parcial: true });
    expect(parcial.some((p) => p.tipo === "svc-exige-sem-produto")).toBe(false);
    expect(parcial.some((p) => p.tipo === "prod-sem-servico")).toBe(false);
    expect(todos.some((p) => p.tipo === "svc-exige-sem-produto")).toBe(true);
  });
  it("com as contagens, um ramo com produtos na base não é problema; um sem nenhum continua a ser", () => {
    const K = leve();
    const exigidos = K.servicos.filter((s) => s.exige && K.arvore.some((x) => x.id === s.exige));
    expect(exigidos.length).toBeGreaterThan(1);
    const a = exigidos[0];
    const P = problemasCatalogo(K, { parcial: true, nosComProduto: [a.exige!] });
    expect(P.some((p) => p.tipo === "svc-exige-sem-produto" && p.ref.id === a.id)).toBe(false);
    expect(P.some((p) => p.tipo === "svc-exige-sem-produto")).toBe(true);
  });
});
