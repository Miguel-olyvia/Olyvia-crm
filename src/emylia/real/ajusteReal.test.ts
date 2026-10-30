// 30/10 (20270101350000): na Olyvia, os materiais novos que o Gestor de obra junta às tarefas vão à encomenda a fornecedor da base
// (obra_encomendar_materiais), pendente para Compras e armazém. Antes não iam a lado nenhum: a encomenda de ajuste só existia no Inventário
// do browser, e a encomenda de cliente da base não tem a referência dele.
import { afterEach, describe, expect, it } from "vitest";
import { seed, type Negocio, type Tarefa } from "../motor";
import { ajusteReal, definirAjusteReal, desfazerAjusteReal, linhasDaEc, porEncomendarDe, type LinhaAjusteReal } from "../encomendasAjuste";
import { definirEncomendasReais, resumoDaBase } from "./encomendaReal";
import { consumiveisConhecidos, definirMateriaisReais } from "../tarefasValidador";

afterEach(() => { definirAjusteReal(null); definirMateriaisReais(null); definirEncomendasReais(null); });

/** Um negócio com a encomenda de cliente da base (contrato, sem ref) e uma tarefa nova com materiais. */
function negocioReal(mats: Tarefa["mats"]): Negocio {
  const d = structuredClone(seed().deals[0]);
  d.perdido = false;
  // como a base a dá: com o contrato e a referência do negócio (negocioBase.ts)
  d.obra.ec = { n: "EC-2026-0001", estado: "emitida", criada: "hoje", linhas: [], valor: 0, custo: 0, contrato: "ct-1", ref: "CT 2026/1010" };
  d.obra.plano = { estado: "aprovado", dia: 0, origem: "orcamento", inicio: "2026-11-02",
    tasks: [{ nome: "Reboco", svcs: [], dia: 0, dur: 1, sk: "Pedreiro", h: 4, tec: null, nova: true, mats } as Tarefa] };
  return d;
}

describe("os materiais novos da obra na Olyvia", () => {
  it("sem a ligação à base (a V1), não é aqui: segue o Inventário do browser", () => {
    expect(ajusteReal(negocioReal([{ n: "Estuque", q: 2, un: "saco", produto: "p1" }]), "tarefa nova")).toBeNull();
    // e a encomenda do Inventário do browser (sem contrato) também não, mesmo com a ligação
    definirAjusteReal(() => { throw new Error("não devia pedir"); });
    const d = negocioReal([{ n: "Estuque", q: 2, un: "saco", produto: "p1" }]);
    delete d.obra.ec!.contrato;
    expect(ajusteReal(d, "tarefa nova")).toBeNull();
  });

  it("30/10 (visto no browser): as linhas da encomenda de cliente da base vêm do documento dela (no negócio vêm vazias)", () => {
    const d = negocioReal([]);
    expect(linhasDaEc(d.obra.ec!)).toEqual([]);
    definirEncomendasReais(new Map([["CT 2026/1010", resumoDaBase({ order_number: "EC-2026-0001", lines: [
      { quote_line_id: "q1", item_type: "product", product_id: "p1", product_name: "Base de duche", product_sku: null, quantity: 1, unidade: "un", line_status: null,
        purchase_order_id: null, qty_needed: 1, qty_reserved: 1, qty_ordered: 0, qty_received: 0, qty_missing: 0, qty_served: 0, has_preferred_supplier: true },
      { quote_line_id: "q2", item_type: "product", product_id: "p2", product_name: "Cerâmico", product_sku: null, quantity: 11, unidade: "m²", line_status: null,
        purchase_order_id: null, qty_needed: 11, qty_reserved: 0, qty_ordered: 11, qty_received: 0, qty_missing: 11, qty_served: 0, has_preferred_supplier: true },
    ] }, [])]]));
    expect(linhasDaEc(d.obra.ec!).map((x) => [x.n, x.q, x.res, x.falta])).toEqual([["Base de duche", 1, 1, 0], ["Cerâmico", 11, 0, 11]]);
  });

  it("pede à base o que falta, com o produto e a tarefa, e marca-o como encomendado (não se pede duas vezes)", () => {
    const pedidos: LinhaAjusteReal[][] = [];
    definirAjusteReal((_d, _m, L) => pedidos.push(L));
    const d = negocioReal([{ n: "Estuque", q: 2.5, un: "saco", produto: "p1" }]);
    expect(ajusteReal(d, "tarefa nova")).toEqual({ n: 1, linhas: ["Estuque × 2.5 saco"] });
    expect(pedidos).toEqual([[{ produto: "p1", n: "Estuque", q: 2.5, un: "saco", tarefa: "Reboco" }]]);
    expect(porEncomendarDe(d)).toEqual([]);
    expect(ajusteReal(d, "outra vez")).toEqual({ n: 0, linhas: [] });
    expect(pedidos).toHaveLength(1);
    // mais 1 saco depois: só vai o aumento
    d.obra.plano!.tasks[0].mats![0].q = 3.5;
    ajusteReal(d, "mais");
    expect(pedidos[1]).toEqual([{ produto: "p1", n: "Estuque", q: 1, un: "saco", tarefa: "Reboco" }]);
  });

  it("um material sem produto do Catálogo não se pede: diz qual é", () => {
    definirAjusteReal(() => { throw new Error("não devia pedir"); });
    const r = ajusteReal(negocioReal([{ n: "Cola de exemplo", q: 1, un: "un" }]), "tarefa nova");
    expect(r).toEqual({ erro: "Cola de exemplo não é um produto do Catálogo: escolha os materiais da lista." });
  });

  it("se a base não o pediu (sem fornecedor, erro), volta a estar por encomendar", () => {
    definirAjusteReal(() => {});
    const d = negocioReal([{ n: "Estuque", q: 2, un: "saco", produto: "p1" }]);
    ajusteReal(d, "tarefa nova");
    desfazerAjusteReal(d, [{ produto: "p1", n: "Estuque", q: 2, un: "saco", tarefa: "Reboco" }]);
    expect(porEncomendarDe(d).map((x) => [x.m.n, x.q])).toEqual([["Estuque", 2]]);
  });

  it("os materiais que se juntam a uma tarefa são os do Catálogo da organização, com o produto", () => {
    expect(consumiveisConhecidos().some((m) => m.produto)).toBe(false);
    definirMateriaisReais([{ n: "Silicone", q: 1, un: "un", produto: "p9" }, { n: "Estuque", q: 1, un: "saco", produto: "p1" }]);
    expect(consumiveisConhecidos().map((m) => m.n)).toEqual(["Estuque", "Silicone"]);
  });
});
