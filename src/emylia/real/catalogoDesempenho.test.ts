// Desempenho do Catálogo com uma organização grande (Mudelar: 14 328 produtos): montar, fotografar e comparar têm de acabar depressa.
import { describe, expect, it } from "vitest";
import { catalogo0 } from "../v2/catalogoModelo";
import { montarCatalogo, type LinhasCatalogo } from "./catalogoReal";
import { juntarAtributos, juntarModelos, juntarTabelas, linhasDe } from "./lerCatalogo";
import { diferencasCatalogo, fotografar } from "./gravarCatalogo";

const N = 15000;
const uid = (p: number, i: number) => `${String(p).padStart(8, "0")}-0000-4000-a000-${String(i).padStart(12, "0")}`;

function linhasGrandes(): LinhasCatalogo {
  const cats = [{ id: uid(1, 1), name: "Bases", parent_id: null, sort_order: 0 }, ...Array.from({ length: 40 }, (_, i) => ({ id: uid(1, i + 2), name: "Sub " + i, parent_id: uid(1, 1), sort_order: i }))];
  const produtos = Array.from({ length: N }, (_, i) => ({ id: uid(2, i), name: "Base " + i, sku: "B-" + i, tipo_catalogo: "produto", unidade: "un", catalogo_categoria_id: null,
    servico_id: null, fator_servico: 1, entulho_m3: null, entulho_kg: null, short_description: null, marca_livre: "M" + (i % 30), fornecedor_livre: "F" + (i % 20) }));
  let L = linhasDe({
    categorias: [], produtos, fornecedores: produtos.filter((_, i) => i % 2).map((p) => ({ product_id: p.id, purchase_price: 10, preco_data: "2026-01-01", ligacao: "ligado", fornecedor: "F" })),
    precosProduto: produtos.flatMap((p, i) => [{ product_id: p.id, price_type: "purchase", price: i, valid_from: "2026-01-01" }, { product_id: p.id, price_type: "retail", price: i * 2, valid_from: "2026-01-01" }]),
  });
  L = juntarTabelas(L, { categoriasProduto: cats, marcas: ["M1"], unidades: ["un"], exige: [], produtos: produtos.map((p, i) => ({ id: p.id, category_id: uid(1, 1), subcategory_id: uid(1, 2 + (i % 40)) })) });
  L = juntarAtributos(L, { atributos: [{ id: uid(3, 1), codigo: "cor", nome: "Cor", tipo: "lista", tem_hex: false, ordem: 0, opcoes: [{ id: uid(4, 1), valor: "a", hex: null, ordem: 0 }] }],
    produtos: produtos.map((p) => ({ id: p.id, valores: [{ atributo: uid(3, 1), opcao: uid(4, 1), valor: null, medida: null }, { atributo: uid(3, 2), opcao: null, valor: "x", medida: null }] })) });
  return juntarModelos(L, { modelos: Array.from({ length: 800 }, (_, i) => ({ id: uid(5, i), nome: "Mod " + i, numero: i, ativo: true, subcategoria: { id: uid(1, 2 + (i % 40)) } })) },
    produtos.map((p, i) => ({ id: p.id, model_id: uid(5, i % 800) })));
}
const tempo = <T,>(f: () => T): [T, number] => { const t = performance.now(); const r = f(); return [r, performance.now() - t]; };

describe("Catálogo com 15 000 produtos", () => {
  it("monta, fotografa e compara em menos de 1,5 s cada passo", () => {
    const [L, tJuntar] = tempo(linhasGrandes);
    const [M, tMontar] = tempo(() => montarCatalogo(L, catalogo0(), {}));
    const [F, tFoto] = tempo(() => fotografar({ C: M.C, K: M.K, svc: M.svc, margens: M.margens }));
    const [D, tDif] = tempo(() => { const d = fotografar({ C: M.C, K: M.K, svc: M.svc, margens: M.margens }); return diferencasCatalogo("o", F, d, { ids: M.ids, produtos: L.produtos }); });
    console.info(`juntar ${tJuntar.toFixed(0)} ms, montar ${tMontar.toFixed(0)} ms, fotografar ${tFoto.toFixed(0)} ms, fotografar+diferencas ${tDif.toFixed(0)} ms`);
    expect(M.K.produtos).toHaveLength(N);
    expect(D).toHaveLength(0);
    expect(tJuntar).toBeLessThan(1500); expect(tMontar).toBeLessThan(1500); expect(tFoto).toBeLessThan(1500); expect(tDif).toBeLessThan(1500);
  }, 60000);
});
