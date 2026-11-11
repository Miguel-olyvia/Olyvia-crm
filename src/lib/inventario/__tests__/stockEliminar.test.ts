// A base (rpc_delete_stock) recusa apagar uma linha de stock com quantidade: o stock só muda por movimentos.
// O ecrã desativa «Eliminar» nessas linhas e diz porquê, em vez de deixar carregar e receber o erro.
import { describe, expect, it } from "vitest";
import { tabelaFundida } from "@/translations/tabelaFundida";
import { stockDeleteAction } from "../stockEliminar";

const t = (k: string) => `T:${k}`;

describe("stockDeleteAction", () => {
  it("quantidade 0: ativo, sem motivo", () => {
    expect(stockDeleteAction(0, t)).toEqual({ disabled: false, disabledReason: undefined });
  });

  it.each([3, 0.5, -2, 1e9])("quantidade %s: desativado com o motivo traduzido", (q) => {
    expect(stockDeleteAction(q, t)).toEqual({ disabled: true, disabledReason: "T:stocks.deleteNeedsZero" });
  });

  it("quantidade desconhecida (null/NaN) não deixa eliminar", () => {
    expect(stockDeleteAction(null, t).disabled).toBe(true);
    expect(stockDeleteAction(Number.NaN, t).disabled).toBe(true);
  });

  it("o motivo existe em português e em inglês na tabela fundida", () => {
    expect(tabelaFundida.pt["stocks.deleteNeedsZero"]).toBe("Faz primeiro o ajuste para 0");
    expect(tabelaFundida.en["stocks.deleteNeedsZero"]).toMatch(/adjust.*0/i);
  });
});
