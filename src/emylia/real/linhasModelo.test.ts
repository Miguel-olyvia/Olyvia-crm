// As linhas de negócio da base (neg_ler_linhas_modelo, migration 20270101300000) no motor, e os materiais do modelo nas linhas do
// orçamento que vão à encomenda de cliente (uma por material, com o produto do Catálogo).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LINHAS, seed, type LinhaServico, type Negocio } from "../motor";
import { esquecerInventario } from "../inventario/loja";
import { ligarCatalogo, type ProdVisita } from "../produtosVisita";
import type { Catalogo } from "../v2/catalogoModelo";
import { aplicarLinhasModelo, carregarLinhasModelo, linhasModeloDe, regraQuantidade, type LinhaModeloBase } from "./linhasModelo";
import { deLinhas, materiaisDoOrcamento, paraLinhas } from "./negocioReal";

const HOJE = new Date(2026, 9, 29, 10, 0);
const ORIGINAIS = { ...LINHAS } as Record<keyof typeof LINHAS, LinhaServico>;

/** A linha wc como a migration a semeia. */
const WC_BASE: LinhaModeloBase = {
  chave: "wc", nome: "Casa de banho", modelo: "WC com base de duche", necessidades: ["Base de duche", "Sanita suspensa", "Banheira", "Móvel 80 cm"],
  mat_descricao: "cerâmico, louças, base, torneiras", mat_custo: 1400, mat_preco: 2168,
  medidas: [{ medida: "pav", rotulo: "Pavimento (m²)" }, { medida: "par", rotulo: "Paredes (m²)" }, { medida: "pts", rotulo: "Pontos de água" }, { medida: "pcs", rotulo: "Vasos sanitários" }],
  servicos: [{ servico: "demol", medida: "pav" }, { servico: "canal", medida: "pts" }, { servico: "revest", medida: "par" }, { servico: "pav", medida: "pav" }, { servico: "loucas", medida: "pcs" }],
  partes: [
    { descricao: "cerâmico de parede", peso: 0.25, ramo_oficio: "Revestimentos", ramo_sub: "Parede", manter: [] },
    { descricao: "pavimento", peso: 0.15, ramo_oficio: "Revestimentos", ramo_sub: "Pavimento", manter: ["pav", "c6"] },
    { descricao: "louças, base e torneiras", peso: 0.5, ramo_oficio: "Canalização", ramo_sub: "Louças e torneiras", manter: ["loucas", "c13", "c17"] },
    { descricao: "colas e pequeno material", peso: 0.1, ramo_oficio: null, ramo_sub: null, manter: [] },
  ],
  materiais: [
    { id: "m1", nome: "Cerâmico de parede 30×60", unidade: "m²", medidas: ["par"], fator: 1.1, fixo: 0, stock_chave: "cp", parte: "cerâmico de parede", produto: "p-cp", produto_nome: "Cerâmico de parede 30×60" },
    { id: "m2", nome: "Pavimento cerâmico 60×60", unidade: "m²", medidas: ["pav"], fator: 1.1, fixo: 0, stock_chave: "pv", parte: "pavimento", produto: "p-pv", produto_nome: "Pavimento cerâmico 60×60" },
    { id: "m3", nome: "Sanita suspensa com estrutura", unidade: "un", medidas: [], fator: 0, fixo: 1, stock_chave: "san", parte: "louças, base e torneiras", produto: "p-san", produto_nome: null },
    { id: "m4", nome: "Base de duche 80×120", unidade: "un", medidas: [], fator: 0, fixo: 1, stock_chave: "base", parte: "louças, base e torneiras", produto: "p-base", produto_nome: null },
    { id: "m5", nome: "Cimento-cola · saco 25 kg", unidade: "sacos", medidas: ["par", "pav"], fator: 0.25, fixo: 0, stock_chave: "cim", parte: "colas e pequeno material", produto: null, produto_nome: null },
  ],
};

beforeEach(() => { localStorage.clear(); esquecerInventario(); });
afterEach(() => { Object.assign(LINHAS, ORIGINAIS); });

/** Um negócio de exemplo com orçamento na linha wc, por enviar. */
function negocioWc(): Negocio {
  const d = seed().deals.find((x) => x.linha === "wc" && x.orc && !x.orc.aceite && x.orc.linhas.some((l) => l.t === "mat" && l.d === LINHAS.wc.mat.d));
  if (!d) throw new Error("sem negócio wc com a linha Materiais por aceitar nos exemplos");
  return d;
}

describe("linhas de negócio da base", () => {
  it("a linha wc da base dá o mesmo pacote, as mesmas medidas e as mesmas quantidades que a do código", () => {
    const codigo = LINHAS.wc;
    aplicarLinhasModelo(linhasModeloDe([WC_BASE]));
    const base = LINHAS.wc;
    expect(base.n).toBe(codigo.n);
    expect(base.nec).toEqual(codigo.nec);
    expect(base.map).toEqual(codigo.map);
    expect(base.med).toEqual(codigo.med);
    expect(base.mat).toEqual(codigo.mat);
    for (const med of [{ pav: 4, par: 18, pts: 5, pcs: 1 }, { pav: 3.5, par: 21.2, pts: 4, pcs: 2 }]) {
      expect(base.mats.map(([n, un, f, k]) => [n, un, f(med), k])).toEqual(codigo.mats.map(([n, un, f, k]) => [n, un, f(med), k]));
    }
    expect(base.mats.map((m) => m[4]?.produto)).toEqual(["p-cp", "p-pv", "p-san", "p-base", null]);
  });

  it("a quantidade arredonda para cima sem o erro das casas decimais (10 m² × 1,1 = 11, não 12)", () => {
    expect(regraQuantidade(["par"], 1.1, 0)({ pav: 0, par: 10, pts: 0, pcs: 0 })).toBe(11);
    expect(regraQuantidade(["par", "pav"], 0.25, 0)({ pav: 4, par: 18, pts: 0, pcs: 0 })).toBe(6);
    expect(regraQuantidade([], 0, 1)({ pav: 0, par: 0, pts: 0, pcs: 0 })).toBe(1);
  });

  it("o que não é uma linha conhecida fica de fora; sem a função na base ficam as linhas do código", async () => {
    expect(linhasModeloDe([{ chave: "outra", nome: "x" }, null, { nome: "sem chave" }])).toEqual([]);
    expect(linhasModeloDe({ servicos: [] })).toEqual([]);
    const antes = LINHAS.wc;
    const sb = { rpc: async () => ({ data: null, error: { code: "PGRST202", message: "função desconhecida" } }) };
    expect(await carregarLinhasModelo(sb as never, "org")).toEqual([]);
    expect(LINHAS.wc).toBe(antes);
  });
});

describe("materiais do modelo na encomenda de cliente", () => {
  it("o orçamento por aceitar leva uma linha por material, com o produto e a quantidade, a preço 0", () => {
    aplicarLinhasModelo([WC_BASE]);
    const d = negocioWc();
    const mats = materiaisDoOrcamento(d);
    expect(mats.length).toBeGreaterThan(0);
    const L = paraLinhas(d, HOJE);
    const atual = L.orcamentos.find((o) => o.estado !== "substituido")!;
    const linhas = atual.linhas!.filter((l) => l.tipo === "material_modelo");
    expect(linhas.map((l) => [l.descricao, l.produto, l.quantidade, l.preco_un])).toEqual(mats.map((m) => [m.n, m.produto, m.q, 0]));
    // as ordens seguem as das linhas do orçamento
    expect(linhas[0].ordem).toBe(d.orc!.linhas.length);
    // na volta não entram nas linhas do orçamento da Emylia
    expect(deLinhas(L).orc!.linhas).toHaveLength(d.orc!.linhas.length);
  });

  it("com as linhas do código (a base sem a migration), nenhum material: a gravação não muda", () => {
    const d = negocioWc();
    expect(materiaisDoOrcamento(d)).toEqual([]);
    expect(paraLinhas(d, HOJE).orcamentos.flatMap((o) => o.linhas ?? []).some((l) => l.tipo === "material_modelo")).toBe(false);
  });

  it("sem a linha Materiais do modelo, nenhum material", () => {
    aplicarLinhasModelo([WC_BASE]);
    const d = negocioWc();
    d.orc!.linhas = d.orc!.linhas.filter((l) => !(l.t === "mat" && l.d === LINHAS.wc.mat.d));
    expect(materiaisDoOrcamento(d)).toEqual([]);
  });

  it("o material de uma parte que o cliente mantém, tirada à mão ou coberta por um produto escolhido não se encomenda", () => {
    // as partes precisam da árvore do Catálogo (os ramos)
    const arvore = [
      { id: "rev", n: "Revestimentos", pai: null }, { id: "par", n: "Parede", pai: "rev" }, { id: "pav", n: "Pavimento", pai: "rev" },
      { id: "can", n: "Canalização", pai: null }, { id: "lou", n: "Louças e torneiras", pai: "can" },
    ];
    ligarCatalogo(() => ({ arvore, produtos: [], pacotes: [], classe: {} }) as unknown as Catalogo);
    try {
      aplicarLinhasModelo([WC_BASE]);
      const d = negocioWc();
      d.visita.manter = {}; d.visita.semParte = []; d.visita.prod = [];
      const nomes = () => materiaisDoOrcamento(d).map((m) => m.n);
      expect(nomes()).toEqual(WC_BASE.materiais.map((m) => m.nome));
      d.visita.manter = { loucas: "sim" };
      expect(nomes()).toEqual(["Cerâmico de parede 30×60", "Pavimento cerâmico 60×60", "Cimento-cola · saco 25 kg"]);
      d.visita.semParte = ["cerâmico de parede"];
      expect(nomes()).toEqual(["Pavimento cerâmico 60×60", "Cimento-cola · saco 25 kg"]);
      d.visita.prod = [{ id: "x", n: "Mosaico", un: "m²", custo: 20, q: 5, no: "pav" } as ProdVisita];
      expect(nomes()).toEqual(["Cimento-cola · saco 25 kg"]);
    } finally { ligarCatalogo(null); }
  });

  it("o orçamento aceite grava os materiais que a base já tem (não se reescreve) e volta igual", () => {
    aplicarLinhasModelo([WC_BASE]);
    const d = negocioWc();
    const L = paraLinhas(d, HOJE);
    const atual = L.orcamentos.find((o) => o.estado !== "substituido")!;
    atual.estado = "aceite";
    atual.aceite_em = "2026-10-29T10:00:00";
    const volta = deLinhas(L);
    expect(volta.orc!.matsModelo).toEqual(materiaisDoOrcamento(d).map(({ n, un, q }) => ({ n, un, q })));
    // a base mudou a quantidade de um material depois: o aceite grava o que a base tem, não o calculado
    const outra = paraLinhas(volta, HOJE).orcamentos.find((o) => o.estado !== "substituido")!;
    expect(outra.linhas!.filter((l) => l.tipo === "material_modelo").map((l) => [l.descricao, l.quantidade]))
      .toEqual(volta.orc!.matsModelo!.map((m) => [m.n, m.q]));
    // aceite e sem materiais na base: nenhum
    delete volta.orc!.matsModelo;
    expect(materiaisDoOrcamento(volta)).toEqual([]);
  });
});
