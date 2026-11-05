import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import {
  CUSTOS_LINHAS_LOTE,
  QUOTE_LINE_COLUNAS_CUSTO,
  QUOTE_LINE_COLUNAS_SEM_CUSTO,
  custosSinteticos,
  juntarCustos,
  lerCustosDasLinhas,
  lerLinhasComCustos,
  linhaComCustosOcultos,
  marcaCustosOcultos,
  type QuoteLineCustos,
} from "../quoteLineCosts";
import { getLineSubtotal, getLineUnitPrice } from "@/utils/quotes/quoteLinePricing";

beforeEach(() => rpc.mockReset());

const custo = (id: string, pode: boolean, extra: Partial<QuoteLineCustos> = {}): QuoteLineCustos => ({
  id, quote_id: "q1", pode_ver_custos: pode, cost_price: pode ? 4 : null, custo_material_unit: pode ? 5 : null,
  custo_mao_obra_unit: pode ? 1 : null, margem_percent: pode ? 30 : null, custo_un_exato: null, custo_un_origem: null,
  mao_obra_congelada: null, preco_base_un: 7.8, ...extra,
});

/** A fórmula do servidor (rpc_quote_lines_custos › preco_base_un): (material + mão de obra) × (1 + markup/100), em float. */
const precoBaseDoServidor = (cm: number, cmo: number, m: number) => (cm + cmo) * (1 + m / 100);

describe("colunas", () => {
  it("a lista sem custo não tem nenhuma coluna de custo", () => {
    const cols = QUOTE_LINE_COLUNAS_SEM_CUSTO.split(",").map((c) => c.trim());
    for (const c of QUOTE_LINE_COLUNAS_CUSTO) expect(cols).not.toContain(c);
    expect(cols).toEqual(expect.arrayContaining(["id", "quote_id", "qt", "int_percent", "retail_price_unit", "total_sem_iva"]));
  });
});

describe("lerCustosDasLinhas", () => {
  it("pede à RPC por lotes e converte os números", async () => {
    const ids = Array.from({ length: CUSTOS_LINHAS_LOTE + 3 }, (_, i) => `q${i}`);
    rpc
      .mockResolvedValueOnce({ data: [{ id: "l1", quote_id: "q0", pode_ver_custos: true, cost_price: "4", custo_material_unit: "5.10", custo_mao_obra_unit: null, margem_percent: "30", preco_base_un: 6.63 }], error: null })
      .mockResolvedValueOnce({ data: [{ id: "l2", quote_id: "q201", pode_ver_custos: false, preco_base_un: 3 }], error: null });
    const m = await lerCustosDasLinhas([...ids, "q0"]);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(["rpc_quote_lines_custos", { p_quote_ids: ids.slice(0, CUSTOS_LINHAS_LOTE) }]);
    expect(m.get("l1")).toMatchObject({ pode_ver_custos: true, cost_price: 4, custo_material_unit: 5.1, custo_mao_obra_unit: null, margem_percent: 30 });
    expect(m.get("l2")).toMatchObject({ pode_ver_custos: false, cost_price: null, preco_base_un: 3 });
  });
  it("lança o erro da base", async () => {
    const erro = { code: "42501" };
    rpc.mockResolvedValueOnce({ data: null, error: erro });
    await expect(lerCustosDasLinhas(["q1"])).rejects.toBe(erro);
  });
});

describe("juntarCustos / lerLinhasComCustos", () => {
  it("só junta os custos das linhas que a base deixa ver", () => {
    const m = new Map([["a", custo("a", true)], ["b", custo("b", false)]]);
    const out = juntarCustos([{ id: "a", qt: 1 }, { id: "b", qt: 2 }, { id: "c", qt: 3 }], m);
    expect(out[0]).toEqual({ id: "a", qt: 1, cost_price: 4, custo_material_unit: 5, custo_mao_obra_unit: 1, margem_percent: 30 });
    expect(out[1]).toEqual({ id: "b", qt: 2 });
    expect(out[2]).toEqual({ id: "c", qt: 3 });
  });
  it("sem linhas não chama a base", async () => {
    await expect(lerLinhasComCustos([])).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("custos de fachada (quem edita sem ver custos)", () => {
  it("dão exatamente o preço que o custo verdadeiro daria, com e sem intermediação", () => {
    const casos: Array<[number, number, number, number]> = [];
    for (const cm of [0.01, 1.005, 7.1, 10.1, 12.345, 99.99, 1234.567]) {
      for (const cmo of [0, 0.5, 3.33]) {
        for (const m of [0, 15, 30, 33.3, 47.5]) {
          for (const i of [0, 5, 7.5, 12]) casos.push([cm, cmo, m, i]);
        }
      }
    }
    for (const [cm, cmo, m, i] of casos) {
      const real = { qt: 51, custo_material_unit: cm, custo_mao_obra_unit: cmo, margem_percent: m, int_percent: i, discount_percent: 10 };
      const fachada = { ...real, ...custosSinteticos(precoBaseDoServidor(cm, cmo, m)) };
      expect(getLineUnitPrice(fachada)).toBe(getLineUnitPrice(real));
      expect(getLineSubtotal(fachada)).toBe(getLineSubtotal(real));
      // mudar a intermediação dá o mesmo que daria com o custo verdadeiro
      expect(getLineUnitPrice({ ...fachada, int_percent: i + 3 })).toBe(getLineUnitPrice({ ...real, int_percent: i + 3 }));
    }
  });
  it("sem preço calculado ficam a zero", () => {
    expect(custosSinteticos(null)).toEqual({ custo_material_unit: 0, custo_mao_obra_unit: 0, margem_percent: 0, cost_price: 0 });
  });
});

describe("linhaComCustosOcultos", () => {
  const base = { id: "l1", product_id: "p1", service_id: null, bundle_id: null, item_supplier_id: "s1", ...custosSinteticos(12.5) };
  const marcada = { ...base, custos_ocultos: marcaCustosOcultos(base) };
  it("linha recebida e não mexida vai como oculta (o servidor grava o custo verdadeiro)", () => {
    expect(linhaComCustosOcultos(marcada)).toBe(true);
    expect(linhaComCustosOcultos({ ...marcada, qt: 9, discount_percent: 5, retail_price_unit: 20, margem_percent: 60 } as typeof marcada)).toBe(true);
  });
  it("trocar o artigo, o fornecedor ou o custo tira a marca (vai o que o ecrã calculou)", () => {
    expect(linhaComCustosOcultos({ ...marcada, product_id: "p2" })).toBe(false);
    expect(linhaComCustosOcultos({ ...marcada, item_supplier_id: null })).toBe(false);
    expect(linhaComCustosOcultos({ ...marcada, custo_material_unit: 3 })).toBe(false);
    expect(linhaComCustosOcultos({ ...marcada, custo_mao_obra_unit: 1 })).toBe(false);
    expect(linhaComCustosOcultos({ ...marcada, cost_price: 2 })).toBe(false);
  });
  it("sem marca ou sem id nunca é oculta", () => {
    expect(linhaComCustosOcultos(base)).toBe(false);
    expect(linhaComCustosOcultos({ ...marcada, id: undefined })).toBe(false);
  });
});
