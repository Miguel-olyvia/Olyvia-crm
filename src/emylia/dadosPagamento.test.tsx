// 4/11 (Rúben): os dados para o cliente pagar são os da empresa (negocio_dados_pagamento), e não um IBAN de exemplo.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { PAGAMENTO_EXEMPLO, definirDadosPagamento, ibanAVista, lerDadosPagamento, metodosDe, paraGravar, useDadosPagamento } from "./pagamentoCliente";
import { erroDoCampo } from "@/components/pessoas-workflow/PagamentosSeparador";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

let desfazer: (() => void) | null = null;
afterEach(() => { desfazer?.(); desfazer = null; });

describe("os dados da empresa para pagar", () => {
  it("lê o que a base devolve; sem nada indicado é null", () => {
    expect(lerDadosPagamento(null)).toBeNull();
    expect(lerDadosPagamento({ titular: " ", iban: null })).toBeNull();
    expect(lerDadosPagamento({ titular: "Nike, Lda.", iban: "PT50000000000000000000000", mb_entidade: null, mbway: "912345678", sepa_credor: "" }))
      .toEqual({ titular: "Nike, Lda.", iban: "PT50000000000000000000000", mbEntidade: null, mbway: "912345678", sepaCredor: null });
    expect(paraGravar({ titular: "X", iban: null, mbEntidade: "12345", mbway: null, sepaCredor: null }))
      .toEqual({ titular: "X", iban: "", mb_entidade: "12345", mbway: "", sepa_credor: "" });
  });

  it("a transferência está sempre; o Multibanco, o MB Way e o débito direto só com os seus dados", () => {
    expect(metodosDe(null)).toEqual(["Transferência"]);
    expect(metodosDe({ titular: null, iban: "PT50", mbEntidade: null, mbway: "912345678", sepaCredor: null })).toEqual(["Transferência", "MB Way"]);
    expect(metodosDe(PAGAMENTO_EXEMPLO)).toEqual(["Transferência", "Referência MB", "MB Way", "Débito direto"]);
  });

  it("o protótipo fica com os de exemplo; a página real troca-os e, ao sair, voltam", () => {
    const { result } = renderHook(() => useDadosPagamento());
    expect(result.current).toBe(PAGAMENTO_EXEMPLO);
    act(() => { desfazer = definirDadosPagamento(null); });
    expect(result.current).toBeNull();
    act(() => { desfazer?.(); desfazer = null; });
    expect(result.current).toBe(PAGAMENTO_EXEMPLO);
  });

  it("o IBAN aparece em grupos de 4 e o separador recusa o que a base não aceita", () => {
    expect(ibanAVista("pt50003500001234567890154")).toBe("PT50 0035 0000 1234 5678 9015 4");
    expect(erroDoCampo("iban", "PT50 0035 0000 1234 5678 9015 4")).toBe(false);
    expect(erroDoCampo("iban", "PT50 123")).toBe(true);
    expect(erroDoCampo("mbEntidade", "1234")).toBe(true);
    expect(erroDoCampo("mbway", "912 345 678")).toBe(false);
    expect(erroDoCampo("sepaCredor", "PT12ZZZ123456")).toBe(false);
    expect(erroDoCampo("sepaCredor", "123")).toBe(true);
    expect(erroDoCampo("titular", "")).toBe(false);
  });
});
