/**
 * Os onze tipos de ausencia (semeados pela migration `20261122010000`) tem
 * de aparecer traduzidos, nao no portugues gravado em `nome`.
 *
 * O QUE ESTE TESTE APANHA
 * ------------------------
 * `useTranslation` cai para a propria chave quando nenhuma lingua a tem. Se
 * alguem acrescentar um tipo a `CODIGOS_TIPO_AUSENCIA` e esquecer uma das
 * cinco linguas em `translations/index.ts`, o utilizador dessa lingua veria
 * "hr.ausencias.tipoNome.FERIAS" em vez de um nome -- este teste falha antes
 * disso chegar a producao.
 */
import { describe, expect, it } from "vitest";
import { translations } from "@/translations/index";
import { CODIGOS_TIPO_AUSENCIA, chaveNomeTipoAusencia, nomeTipoAusencia } from "@/lib/hr/ausencias";

const LINGUAS = ["en", "pt", "es", "fr", "de"] as const;

describe("traducao dos onze tipos de ausencia", () => {
  it("todos os onze codigos tem chave de traducao", () => {
    for (const codigo of CODIGOS_TIPO_AUSENCIA) {
      expect(chaveNomeTipoAusencia(codigo)).toBe(`hr.ausencias.tipoNome.${codigo}`);
    }
  });

  it.each(LINGUAS)("%s tem etiqueta para os onze codigos, nenhuma vazia nem igual a chave", (lingua) => {
    for (const codigo of CODIGOS_TIPO_AUSENCIA) {
      const chave = chaveNomeTipoAusencia(codigo)!;
      const tabela = translations[lingua] as Record<string, string>;
      const etiqueta = tabela[chave];
      expect(etiqueta, `${lingua}/${codigo}`).toBeTruthy();
      expect(etiqueta, `${lingua}/${codigo}`).not.toBe(chave);
    }
  });

  it("um codigo desconhecido usa o nome gravado na base, nunca a chave crua", () => {
    const t = (chave: string) => chave; // simula o t() a nao encontrar nada
    const tipoDesconhecido = { codigo: "CODIGO_NOVO_SEM_TRADUCAO", nome: "Nome vindo da base" };
    expect(nomeTipoAusencia(tipoDesconhecido, t)).toBe("Nome vindo da base");
  });

  it("um codigo conhecido pede a chave ao t() em vez do nome da base", () => {
    let pedida: string | null = null;
    const t = (chave: string) => {
      pedida = chave;
      return "Etiqueta traduzida";
    };
    const tipo = { codigo: "FERIAS", nome: "Ferias" };
    expect(nomeTipoAusencia(tipo, t)).toBe("Etiqueta traduzida");
    expect(pedida).toBe("hr.ausencias.tipoNome.FERIAS");
  });
});
