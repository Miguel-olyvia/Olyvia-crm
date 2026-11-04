// 4/11/2026 (20270106650000): quem planeia a obra (negocios.obra.planear, as Operações) volta a pedir AUTOMATICAMENTE os materiais da
// tarefa nova (novaTarefaPlano → ajustar → obra_encomendar_materiais); a RPC aceita negocios.obra.planear OU purchase_orders.create.
// Sem nenhuma das duas, não se pede. Na obra continua a não haver botão de encomendar.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { esquecerInventario } from "./inventario/loja";
import { acoes, seed, type Aviso } from "./motor";
import { FINANCEIRO, emFalta } from "./campos";
import { definirAjusteReal } from "./encomendasAjuste";
import { ALTERNATIVAS, CODIGO_BASE, SEM_PERM, definirPermissoesReais, podeNeg } from "./permissoes";

beforeEach(() => { esquecerInventario(); });
afterEach(() => { definirAjusteReal(null); definirPermissoesReais(null); });

const MATS = [{ n: "Estuque projetado", q: 3, un: "saco", produto: "p-estuque" }];

/** 1027 com o pagamento validado e a encomenda de cliente da base (com contrato); depois, as permissões reais `codigos`. */
function montar(codigos: string[]) {
  const S = seed(), avisos: Aviso[] = [], A = acoes(S, (a) => avisos.push(a), (fn) => fn()), d = S.deals.find((x) => x.id === 1027)!;
  for (let i = 0; i < 5; i++) for (const c of emFalta(FINANCEIRO, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  A.role("financeiro"); A.emitir(d.id); A.validar(d.id);
  d.obra.ec = { ...d.obra.ec!, contrato: "ct-1" };
  A.role("operacoes");
  const pedir = vi.fn();
  definirAjusteReal(pedir);
  definirPermissoesReais({ codigos: new Set(codigos), simular: false });
  avisos.length = 0;
  return { S, A, d, avisos, pedir };
}

describe("tarefa nova com materiais: o pedido automático", () => {
  it("obra.encomendar aceita negocios.obra.planear ou purchase_orders.create, como a RPC", () => {
    expect(CODIGO_BASE["obra.encomendar"]).toBe("purchase_orders.create");
    expect(ALTERNATIVAS["obra.encomendar"]).toEqual(["negocios.obra.planear"]);
    for (const [c, ok] of [[["negocios.obra.planear"], true], [["purchase_orders.create"], true], [["negocios.obra.materiais"], false], [[], false]] as const) {
      definirPermissoesReais({ codigos: new Set(c), simular: false });
      expect(podeNeg("operacoes", "obra.encomendar")).toBe(ok);
    }
  });

  it("com negocios.obra.planear (sem purchase_orders.create): a tarefa entra e os materiais vão à base", () => {
    const { A, d, avisos, pedir } = montar(["negocios.obra.planear", "negocios.obra.materiais"]);
    const ti = A.novaTarefaPlano(d.id, { sid: "revest", q: 20, fase: 3, mats: MATS });
    expect(ti).not.toBeNull();
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(pedir.mock.calls[0][2]).toEqual([expect.objectContaining({ produto: "p-estuque", q: 3, n: "Estuque projetado" })]);
    expect(avisos.some((a) => a.kind === "bad")).toBe(false);
  });

  it("sem negocios.obra.planear nem purchase_orders.create: não cria a tarefa nem pede os materiais", () => {
    const { A, d, avisos, pedir } = montar(["negocios.obra.materiais"]);
    const antes = d.obra.plano!.tasks.length;
    expect(A.novaTarefaPlano(d.id, { sid: "revest", q: 20, fase: 3, mats: MATS })).toBeNull();
    expect(d.obra.plano!.tasks.length).toBe(antes);
    expect(pedir).not.toHaveBeenCalled();
    expect(avisos.some((a) => a.msg === SEM_PERM["obra.planear"].msg)).toBe(true);
    expect(podeNeg("operacoes", "obra.encomendar")).toBe(false);
  });
});
