import { describe, expect, it } from "vitest";
import { pessoasContratoTranslations } from "./pessoasContrato";
import { pessoasPaginaTranslations } from "./pessoasPagina";

const { en, pt } = pessoasContratoTranslations;
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();

describe("traduções da resposta do cliente e da assinatura", () => {
  it("pt e en têm as mesmas chaves, com os mesmos marcadores, e nenhum texto está vazio", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) {
      expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
      expect(pt[chave].trim(), chave).not.toBe("");
      expect(en[chave].trim(), chave).not.toBe("");
    }
  });

  it("as chaves são só da resposta, da assinatura, das faltas e dos avisos deste passo", () => {
    for (const chave of Object.keys(pt)) expect(chave).toMatch(/^pessoasPagina\.(reply|sign|gate\.(escolhaEmFalta|motivoEmFalta)|done\.(reply|replyWon|signed|refused))/);
  });

  it("há um texto para cada falta nova dos portões", () => {
    for (const falta of ["escolhaEmFalta", "motivoEmFalta"]) {
      expect(pt[`pessoasPagina.gate.${falta}`], falta).toBeTruthy();
      expect(en[`pessoasPagina.gate.${falta}`], falta).toBeTruthy();
    }
  });

  it("a página «Pessoas» junta-os nas duas línguas", () => {
    for (const chave of Object.keys(pt)) expect(pessoasPaginaTranslations.pt[chave]).toBe(pt[chave]);
    for (const chave of Object.keys(en)) expect(pessoasPaginaTranslations.en[chave]).toBe(en[chave]);
  });

  it("não fala de pedidos nem de «Avançar para venda»", () => {
    for (const texto of [...Object.values(pt), ...Object.values(en)]) expect(texto).not.toMatch(/pedido|request|avançar para venda/i);
  });
});
