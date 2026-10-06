/**
 * As chaves de traducao dos anexos da admissao (convite publico e ficha do RH)
 * tem de existir nas cinco linguas, com os mesmos marcadores `{{...}}`.
 *
 * `useTranslation` cai para a propria chave quando nenhuma lingua a tem: quem
 * esquecesse uma lingua via "hr.convite.anexos.titulo" no ecra. Este teste
 * falha antes disso.
 */
import { describe, expect, it } from "vitest";
import { translations } from "@/translations/index";
import { chaveDeErroAdmissao } from "@/lib/hr/errosAdmissao";
import { chaveDeErroAnexo } from "@/lib/hr/conviteAnexos";

const LINGUAS = ["en", "pt", "es", "fr", "de"] as const;
const tabela = translations as unknown as Record<string, Record<string, string>>;

/** Os codigos de anexo que a Edge Function `convite-admissao` emite. */
const CODIGOS_ANEXO = [
  "anexo_tipo_invalido",
  "anexo_formato_invalido",
  "anexo_fotografia_formato",
  "anexo_demasiado_grande",
  "anexo_fotografia_demasiado_grande",
  "anexo_vazio",
  "anexo_maximo_ficheiros",
  "anexo_tipo_cheio",
  "anexo_limite_convite",
  "anexo_nao_encontrado",
  "anexo_nao_carregado",
  "anexo_estado_invalido",
  "anexo_falha_envio",
] as const;

const CHAVES_ERRO: readonly string[] = [
  // Ja existiam (lote B) e sao reutilizadas.
  "hr.convite.erro.anexoFormato",
  "hr.convite.erro.anexosDemasiados",
  "hr.convite.erro.fotografiaGrande",
  // Novas.
  "hr.convite.erro.fotografiaFormato",
  "hr.convite.erro.anexoVazio",
  "hr.convite.erro.anexoTipoCheio",
  "hr.convite.erro.anexoLimiteConvite",
  "hr.convite.erro.anexoNaoEncontrado",
  "hr.convite.erro.anexoNaoCarregado",
  "hr.convite.erro.anexoEstadoInvalido",
  "hr.convite.erro.anexoFalhaEnvio",
];

const CHAVES_ECRA_PUBLICO: readonly string[] = [
  "hr.convite.anexos.titulo",
  "hr.convite.anexos.descricao",
  "hr.convite.anexos.cartaoCidadao",
  "hr.convite.anexos.cartaoCidadaoAjuda",
  "hr.convite.anexos.comprovativoIban",
  "hr.convite.anexos.fotografia",
  "hr.convite.anexos.fotografiaAjuda",
  "hr.convite.anexos.formatosAjuda",
  "hr.convite.anexos.adicionar",
  "hr.convite.anexos.remover",
  "hr.convite.anexos.aEnviar",
  "hr.convite.anexos.aVerificar",
  "hr.convite.anexos.progresso",
  "hr.convite.anexos.contador",
  "hr.convite.anexos.aguardarEnvio",
  "hr.convite.anexos.enviado",
  "hr.convite.anexos.aRemover",
  "hr.convite.anexos.removido",
  "hr.convite.anexos.limiteAtingido",
];

const CHAVES_FICHA_RH: readonly string[] = [
  "hr.anexos.titulo",
  "hr.anexos.vazio",
  "hr.anexos.abrir",
  "hr.anexos.tipo.cartao_cidadao",
  "hr.anexos.tipo.comprovativo_iban",
  "hr.anexos.tipo.fotografia",
  "hr.anexos.semPermissao",
  "hr.anexos.promovidoEm",
  "hr.anexos.erroAbrir",
  "hr.anexos.fotografiaAlt",
  "hr.anexos.vazioRestrito",
  "hr.anexos.notaRestrita",
];

const TODAS = [...CHAVES_ERRO, ...CHAVES_ECRA_PUBLICO, ...CHAVES_FICHA_RH];

const marcadores = (texto: string): string[] => (texto.match(/\{\{\w+\}\}/g) ?? []).sort();

describe("traducoes dos anexos da admissao", () => {
  for (const lingua of LINGUAS) {
    it(`${lingua}: todas as chaves existem e tem texto`, () => {
      const emFalta = TODAS.filter((chave) => !tabela[lingua]?.[chave]?.trim());
      expect(emFalta).toEqual([]);
    });
  }

  it("as cinco linguas usam os mesmos marcadores {{...}} em cada chave", () => {
    for (const chave of TODAS) {
      const referencia = marcadores(tabela.pt[chave]);
      for (const lingua of LINGUAS) {
        expect(marcadores(tabela[lingua][chave]), `${lingua}: ${chave}`).toEqual(referencia);
      }
    }
  });

  it("os textos com parametros declaram os parametros que o ecra passa", () => {
    expect(marcadores(tabela.pt["hr.convite.anexos.remover"])).toEqual(["{{nome}}"]);
    expect(marcadores(tabela.pt["hr.convite.anexos.progresso"])).toEqual(["{{nome}}"]);
    expect(marcadores(tabela.pt["hr.convite.anexos.contador"])).toEqual(["{{n}}"]);
    expect(marcadores(tabela.pt["hr.convite.anexos.removido"])).toEqual(["{{nome}}"]);
    expect(marcadores(tabela.pt["hr.anexos.promovidoEm"])).toEqual(["{{data}}"]);
    expect(marcadores(tabela.pt["hr.anexos.fotografiaAlt"])).toEqual(["{{nome}}"]);
  });

  it("o texto de cada lingua e mesmo traduzido (nao e uma copia do portugues)", () => {
    // Os rotulos curtos podem coincidir; o resto nao.
    const podemCoincidir = new Set([
      "hr.anexos.tipo.fotografia",
      "hr.convite.anexos.titulo",
      "hr.anexos.vazio",
    ]);
    for (const chave of TODAS) {
      if (podemCoincidir.has(chave)) continue;
      for (const lingua of ["en", "fr", "de"] as const) {
        expect(tabela[lingua][chave], `${lingua}: ${chave}`).not.toBe(tabela.pt[chave]);
      }
    }
  });
});

describe("erros de anexo: o mapa de errosAdmissao e a unica porta", () => {
  it("todo o codigo de anexo tem chave no mapa, e essa chave existe nas cinco linguas", () => {
    for (const codigo of CODIGOS_ANEXO) {
      const entrada = chaveDeErroAdmissao(codigo);
      expect(entrada, codigo).not.toBeNull();
      expect(chaveDeErroAnexo(codigo)).toBe(entrada?.chave);
      for (const lingua of LINGUAS) {
        expect(tabela[lingua][entrada!.chave], `${lingua}: ${entrada!.chave}`).toBeTruthy();
      }
    }
  });

  it("nenhuma chave de erro de anexo ou fotografia fica fora do mapa (nada de textos mortos)", () => {
    const alcancaveis = new Set(CODIGOS_ANEXO.map((c) => chaveDeErroAdmissao(c)?.chave));
    const chavesDeErroDeAnexo = Object.keys(tabela.pt).filter((chave) =>
      /^hr\.convite\.erro\.(anexo|fotografia)/.test(chave),
    );
    expect(chavesDeErroDeAnexo.length).toBeGreaterThan(0);
    for (const chave of chavesDeErroDeAnexo) {
      expect(alcancaveis.has(chave), chave).toBe(true);
    }
  });
});
