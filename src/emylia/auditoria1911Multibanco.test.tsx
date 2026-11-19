// 19/11/2026 (auditoria, ponto 5): a referência Multibanco que a Olyvia gera (referenciaMb) é de teste, mas aparecia ao cliente como real.
// Agora a opção só aparece com um prestador de pagamentos configurado (mbDisponivel); a base ainda não o tem, por isso fica escondida.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { seed } from "./motor";
import { Montar } from "./v2/testeV2";
import { PagamentoDoCliente } from "./PagamentoDoCliente";
import { PAGAMENTO_EXEMPLO, definirDadosPagamento, lerDadosPagamento, mbDisponivel, metodosDe } from "./pagamentoCliente";

afterEach(() => { cleanup(); localStorage.clear(); });

describe("a referência Multibanco só com um prestador de pagamentos", () => {
  it("sem prestador (o caso de hoje, também com a entidade), não há Multibanco; ficam a transferência e o MB Way", () => {
    expect(mbDisponivel(PAGAMENTO_EXEMPLO)).toBe(false);
    expect(metodosDe(PAGAMENTO_EXEMPLO)).not.toContain("Referência MB");
    expect(metodosDe(PAGAMENTO_EXEMPLO)).toEqual(expect.arrayContaining(["Transferência", "MB Way"]));
    // o que a base devolve hoje (sem mb_prestador)
    const daBase = lerDadosPagamento({ titular: "Mudelar, Lda.", iban: "PT50000000000000000000000", mb_entidade: "21312", mbway: "912345678" });
    expect(metodosDe(daBase)).toEqual(["Transferência", "MB Way"]);
  });

  it("o Financeiro não vê uma referência de teste como se fosse do cliente", () => {
    const S = seed(), d = S.deals.find((x) => x.id === 1027)!;
    d.fin.fatura = { n: "FT 2026/418", q: "15/10" }; d.fin.pago = false; d.f.metodo = "Referência MB";
    S.role = "financeiro";
    render(<Montar S={S}>{(ctx) => <PagamentoDoCliente {...ctx} d={d} />}</Montar>);
    expect(screen.queryByText(/de teste/)).toBeNull();
    expect(screen.getByText(/indisponível \(sem prestador de pagamentos ligado\)/)).toBeTruthy();
    cleanup();
    const desfazer = definirDadosPagamento({ ...PAGAMENTO_EXEMPLO, mbPrestador: "Prestador de teste" });
    try {
      render(<Montar S={S}>{(ctx) => <PagamentoDoCliente {...ctx} d={d} />}</Montar>);
      expect(screen.getByText("Entidade · referência")).toBeTruthy();
    } finally { desfazer(); }
  });
});
