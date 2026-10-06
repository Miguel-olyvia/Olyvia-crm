/**
 * As chaves de traducao que os ecras da admissao pedem (dialogo de envio do
 * convite, cartao do estado, formulario de criar pessoa, convite publico) tem de
 * existir nas cinco linguas, nao vazias e diferentes da propria chave.
 *
 * `useTranslation` cai para a propria chave quando nenhuma lingua a tem: quem
 * esquecesse uma lingua veria "hr.convite.copiado" no ecra. O convite publico
 * escolhe a lingua pelo navegador (pt, es, fr, de, en), por isso as cinco contam.
 */
import { describe, expect, it } from "vitest";
import { translations } from "@/translations/index";

const LINGUAS = ["en", "pt", "es", "fr", "de"] as const;

const CHAVES: readonly string[] = [
  // Dialogo de envio do convite
  "hr.convite.copiado",
  "hr.convite.copiarFalhou",
  "hr.convite.criadoSemLink",
  "hr.convite.fecharSemCopiar",
  "hr.convite.fecharMesmoAssim",
  "hr.convite.voltarAoLink",
  "hr.convite.detalheTecnico",
  // Cartao do estado do convite
  "hr.convite.estado.erroCarregar",
  "hr.convite.estado.recusaOutraFicha",
  "hr.convite.estado.conflitoIndisponivel",
  // Pendencias com codigo desconhecido
  "hr.pendencias.campo.desconhecido",
  // Formulario de criar pessoa
  "hr.form.conviteNaoAberto.semPermissao",
  "hr.form.conviteNaoAberto.semEmail",
  "hr.form.configuracaoNaoCarregada",
  "hr.form.quemPreenche.ajudaConvite",
  "hr.form.quemPreenche.ajudaRh",
  // Reutilizadas pelos ecras acima (o convite publico, o cartao, a configuracao)
  "common.loading",
  "common.retry",
  "common.close",
  "hr.campos.obrigatorio",
  "hr.campos.nif",
  "hr.campos.niss",
];

describe("traducoes dos ecras da admissao", () => {
  it("nao ha chaves repetidas na lista", () => {
    expect(new Set(CHAVES).size).toBe(CHAVES.length);
  });

  it.each(LINGUAS)("%s tem todas as chaves, nenhuma vazia nem igual a chave", (lingua) => {
    const tabela = translations[lingua] as Record<string, string>;
    const emFalta = CHAVES.filter((chave) => !tabela[chave] || tabela[chave] === chave);
    expect(emFalta, `${lingua}: chaves por traduzir`).toEqual([]);
  });

  it("nenhum texto novo foi deixado em portugues noutra lingua (excepto os que coincidem de proposito)", () => {
    // `Copiado` e `Campo por identificar` sao iguais em pt e es; o resto tem de diferir.
    const pt = translations.pt as Record<string, string>;
    const COINCIDEM = new Set([
      "hr.convite.copiado",
      "hr.pendencias.campo.desconhecido",
      "hr.convite.estado.recusaOutraFicha", // diferente de facto (outra pessoa / otra persona), mas curto
      "hr.campos.nif",
      "hr.campos.niss",
      "hr.convite.voltarAoLink",
    ]);
    for (const lingua of ["en", "fr", "de"] as const) {
      const tabela = translations[lingua] as Record<string, string>;
      const iguais = CHAVES.filter((chave) => !COINCIDEM.has(chave) && tabela[chave] === pt[chave]);
      expect(iguais, `${lingua}: texto igual ao portugues`).toEqual([]);
    }
  });
});
