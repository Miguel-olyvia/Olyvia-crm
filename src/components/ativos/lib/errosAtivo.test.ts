// Os erros da base dos Ativos: os códigos novos da fase A1 (ATV19 a ATV33) e as várias causas do ATV26 (entrega recusada).
import { describe, expect, it } from "vitest";
import { chaveDoErro, codigoAtv, CODIGOS_ATV, refazListaAposErro, subcodigoAtv } from "./errosAtivo";
import { ativosTranslations } from "@/translations/ativos";

const erro = (message: string, details: string | null = null) => ({ code: "P0001", message, details, hint: null });

describe("códigos ATV da A1", () => {
  it("reconhece ATV19 a ATV33 (e continua a reconhecer os de antes)", () => {
    for (let n = 19; n <= 33; n += 1) {
      const codigo = `ATV${n}`;
      expect(CODIGOS_ATV as readonly string[]).toContain(codigo);
      expect(codigoAtv(erro(codigo))).toBe(codigo);
    }
    expect(codigoAtv(erro("ATV07"))).toBe("ATV07");
    expect(codigoAtv(erro("ATV99"))).toBeNull();
  });

  it("todos os códigos têm texto em pt e en, e nenhum chega ao ecrã em bruto", () => {
    for (const lingua of ["pt", "en"] as const) {
      for (const codigo of CODIGOS_ATV) {
        const chave = chaveDoErro(erro(codigo));
        expect(ativosTranslations[lingua][chave], `${lingua} ${chave}`).toBeTruthy();
      }
    }
  });
});

describe("ATV26 (entrega recusada): cada causa tem o seu texto", () => {
  const causas: [string, string][] = [
    ["Só os ativos do grupo Pessoas se entregam a uma pessoa.", "grupo"],
    ["Este ativo está desativado. Reative-o em Ativos antes de o entregar.", "desativado"],
    ["Este ativo já está entregue a outra pessoa.", "ocupado"],
    ["A data de entrega é anterior à compra ou ao início do aluguer.", "antesDoInicio"],
    ["A data de entrega é depois do fim do aluguer.", "depoisDoFim"],
    ["O contrato de aluguer já terminou: não se entrega.", "contratoTerminado"],
    ["Esta entrega cruza outra ocupação do mesmo ativo. Corrija as datas.", "cruza"],
    ["O equipamento mudou entretanto. Volte a abrir a lista.", "mudou"],
  ];

  it.each(causas)("%s -> %s", (detalhe, sub) => {
    expect(subcodigoAtv(erro("ATV26", detalhe))).toBe(`ATV26.${sub}`);
    const chave = chaveDoErro(erro("ATV26", detalhe));
    expect(chave).toBe(`ativos.erro.ATV26.${sub}`);
    expect(ativosTranslations.pt[chave]).toBeTruthy();
    expect(ativosTranslations.en[chave]).toBeTruthy();
  });

  it("sem detalhe legível cai no texto geral do ATV26", () => {
    expect(subcodigoAtv(erro("ATV26"))).toBeNull();
    expect(chaveDoErro(erro("ATV26"))).toBe("ativos.erro.ATV26");
  });

  it("as três recusas novas do RH têm texto claro: entrega daqui a mais de 7 dias sem data de compra, contrato terminado e início depois da entrega", () => {
    expect(ativosTranslations.pt["ativos.erro.ATV07"]).toMatch(/7 dias/);
    expect(ativosTranslations.pt["ativos.erro.ATV07"]).toMatch(/data de compra/);
    expect(ativosTranslations.pt["ativos.erro.ATV26.contratoTerminado"]).toMatch(/terminou/);
    expect(ativosTranslations.pt["ativos.erro.ATV26.antesDoInicio"]).toMatch(/início do aluguer/);
    expect(ativosTranslations.en["ativos.erro.ATV07"]).toMatch(/7 days/);
  });
});

describe("a lista refaz-se quando a base diz que o ativo mudou", () => {
  it("ATV26 por mudança entretanto refaz; as outras causas do ATV26 não", () => {
    expect(refazListaAposErro(erro("ATV26", "O equipamento mudou entretanto. Volte a abrir a lista."))).toBe(true);
    expect(refazListaAposErro(erro("ATV26", "Esta entrega cruza outra ocupação do mesmo ativo. Corrija as datas."))).toBe(false);
    expect(refazListaAposErro(erro("ATV14"))).toBe(true);
  });
});
