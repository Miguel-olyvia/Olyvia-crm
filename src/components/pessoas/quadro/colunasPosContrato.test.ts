import { describe, expect, it } from "vitest";
import {
  COLUNAS_POS_CONTRATO, colunaDoPosContrato, contratoEstaAssinado, pagamentoEstaValidado, type EntradaPosContrato,
} from "./colunasPosContrato";

const base: EntradaPosContrato = { estado: "aberto", fase: null, contratoAssinado: false, pagamentoValidado: false };
const com = (sobre: Partial<EntradaPosContrato>): EntradaPosContrato => ({ ...base, ...sobre });

describe("colunasPosContrato: as colunas", () => {
  it("são Financeiro e Obra, por esta ordem, cada uma com a sua faixa de cor", () => {
    expect(COLUNAS_POS_CONTRATO.map((c) => c.id)).toEqual(["financeiro", "obra"]);
    for (const c of COLUNAS_POS_CONTRATO) expect(c.cor.length).toBeGreaterThan(0);
  });
});

describe("colunaDoPosContrato: a regra de coluna reconciliada", () => {
  it.each<[string, EntradaPosContrato, string | null]>([
    ["aberto sem contrato assinado nem fase: fica nas colunas da abordagem e do negócio", base, null],
    ["fases 0 a 3 gravadas não puxam para o pós-contrato (manda a derivada)", com({ fase: 3 }), null],
    ["fase 0", com({ fase: 0 }), null],
    ["contrato assinado, sem pagamento: Financeiro", com({ contratoAssinado: true }), "financeiro"],
    ["fase 4 sem contrato assinado: Financeiro", com({ fase: 4 }), "financeiro"],
    ["contrato assinado e fase 4: Financeiro", com({ fase: 4, contratoAssinado: true }), "financeiro"],
    ["pagamento validado: Obra", com({ contratoAssinado: true, pagamentoValidado: true }), "obra"],
    ["fase 5: Obra", com({ fase: 5 }), "obra"],
    ["fase 4 com pagamento validado: Obra", com({ fase: 4, pagamentoValidado: true }), "obra"],
    ["ganho com contrato assinado entra em Financeiro", com({ estado: "ganho", contratoAssinado: true }), "financeiro"],
    ["ganho com pagamento validado entra em Obra", com({ estado: "ganho", pagamentoValidado: true }), "obra"],
    ["ganho sem nada do pós-contrato continua fora do quadro", com({ estado: "ganho" }), null],
    ["perdido fica fora, mesmo na fase 5", com({ estado: "perdido", fase: 5, pagamentoValidado: true }), null],
    ["estado desconhecido fica fora", com({ estado: "outro", fase: 5 }), null],
    ["fase fora do intervalo (9) não inventa coluna", com({ fase: 9 }), null],
    ["fase NaN é tratada como ausente", com({ fase: Number.NaN }), null],
  ])("%s", (_nome, entrada, esperado) => {
    expect(colunaDoPosContrato(entrada)).toBe(esperado);
  });
});

describe("contratoEstaAssinado", () => {
  it.each([["signed", true], ["assinado", true], ["draft", false], ["sent", false], ["", false], [null, false], [undefined, false]])(
    "%s", (estado, esperado) => expect(contratoEstaAssinado(estado as string | null | undefined)).toBe(esperado),
  );
});

describe("pagamentoEstaValidado", () => {
  it("fatura paga conta", () => expect(pagamentoEstaValidado({ faturaPaga: true, reciboNumero: null })).toBe(true));
  it("recibo com número conta", () => expect(pagamentoEstaValidado({ faturaPaga: false, reciboNumero: "R-1" })).toBe(true));
  it("recibo só com espaços não conta", () => expect(pagamentoEstaValidado({ faturaPaga: false, reciboNumero: "   " })).toBe(false));
  it("nada: não conta", () => expect(pagamentoEstaValidado({ faturaPaga: null, reciboNumero: null })).toBe(false));
  it("fatura paga nula e recibo vazio: não conta", () => expect(pagamentoEstaValidado({ faturaPaga: null, reciboNumero: "" })).toBe(false));
});
