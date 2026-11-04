import { describe, expect, it } from "vitest";
import { acoes, seed, servicosPedidos } from "./motor";

// 4/11 (Rúben): «o tipo de serviço tem de ser mais completo» → os serviços do Catálogo que o cliente pediu
describe("os serviços do Catálogo pedidos na chamada", () => {
  it("guardam-se no negócio pela ordem escolhida, os que não existem no Catálogo saem, e ficam no histórico", () => {
    const S = seed(), A = acoes(S, () => {}, (fn) => fn());
    const d = S.deals.find((x) => x.fase === 1)!;
    A.servicosDoPedido(d.id, ["canal", "nao-existe", "eletr", "canal"]);
    expect(d.f.servicos_pedidos).toBe("canal,eletr");
    expect(servicosPedidos(d, S).map((s) => s.n)).toEqual(["Canalização", "Pontos elétricos"]);
    expect(d.hist[0].t).toBe("Serviços pedidos: Canalização, Pontos elétricos");
    const n = d.hist.length;
    A.servicosDoPedido(d.id, ["canal", "eletr"]);
    expect(d.hist).toHaveLength(n);
    A.servicosDoPedido(d.id, []);
    expect(d.f.servicos_pedidos).toBeUndefined();
  });
});
