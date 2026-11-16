// Desempenho do ecrã do Catálogo com 15 000 produtos (Mudelar): aplicar, abrir e mudar de separador.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, seed } from "../motor";
import { CatalogoV1 } from "../CatalogoV1";
import { catalogo0 } from "../v2/catalogoModelo";
import { reporCustos } from "../v2/custosStore";
import { aplicarCatalogo } from "./carregarCatalogo";
import { montarCatalogo } from "./catalogoReal";
import { linhasDe, juntarTabelas, juntarAtributos } from "./lerCatalogo";

afterEach(() => { cleanup(); reporCustos(); });
const N = 15000;
const uid = (p: number, i: number) => `${String(p).padStart(8, "0")}-0000-4000-a000-${String(i).padStart(12, "0")}`;
const tempo = <T,>(f: () => T): [T, number] => { const t = performance.now(); const r = f(); return [r, performance.now() - t]; };

describe("CatalogoV1 com 15 000 produtos", () => {
  it("aplica, abre e muda de separador depressa", () => {
    const cats = [{ id: uid(1, 1), name: "Bases", parent_id: null, sort_order: 0 }, ...Array.from({ length: 40 }, (_, i) => ({ id: uid(1, i + 2), name: "Sub " + i, parent_id: uid(1, 1), sort_order: i }))];
    const produtos = Array.from({ length: N }, (_, i) => ({ id: uid(2, i), name: "Base " + i, sku: "B-" + i, tipo_catalogo: "produto", unidade: "un", catalogo_categoria_id: null,
      servico_id: null, fator_servico: 1, entulho_m3: null, entulho_kg: null, short_description: null, marca_livre: "M" + (i % 30), fornecedor_livre: "F" }));
    let L = juntarTabelas(linhasDe({ produtos }), { categoriasProduto: cats, marcas: ["M1"], unidades: ["un"], exige: [], produtos: produtos.map((p, i) => ({ id: p.id, category_id: uid(1, 1), subcategory_id: uid(1, 2 + (i % 40)) })) });
    L = juntarAtributos(L, { atributos: [{ id: uid(3, 1), codigo: "cor", nome: "Cor", tipo: "lista", tem_hex: false, ordem: 0, opcoes: [{ id: uid(4, 1), valor: "a", hex: null, ordem: 0 }] }],
      produtos: produtos.map((p) => ({ id: p.id, valores: [{ atributo: uid(3, 1), opcao: uid(4, 1), valor: null, medida: null }] })) });
    const S = seed(); S.deals = [];
    const M = montarCatalogo(L, catalogo0(), seed().svc);
    const [, tAplicar] = tempo(() => aplicarCatalogo("o", M, L.produtos, S));
    const run = (fn: () => void) => fn();
    const [, tRender] = tempo(() => render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} />));
    const [, tProdutos] = tempo(() => fireEvent.click(screen.getByRole("tab", { name: "Produtos" })));
    const [, tPesquisa] = tempo(() => fireEvent.change(screen.getByRole("searchbox", { name: "Procurar produto" }), { target: { value: "base 14" } }));
    const [, tLig] = tempo(() => fireEvent.click(screen.getByRole("tab", { name: "Ligações" })));
    console.warn(`aplicar ${tAplicar.toFixed(0)} ms | render ${tRender.toFixed(0)} | tab Produtos ${tProdutos.toFixed(0)} | pesquisa ${tPesquisa.toFixed(0)} | tab Ligações ${tLig.toFixed(0)}`);
    expect(tAplicar).toBeLessThan(1500); expect(tRender).toBeLessThan(1500); expect(tProdutos).toBeLessThan(1500); expect(tPesquisa).toBeLessThan(1500); expect(tLig).toBeLessThan(1500);
  }, 120000);
});
