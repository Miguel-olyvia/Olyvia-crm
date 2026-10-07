/**
 * As chaves de traducao do formulario "Nova pessoa" completo (fase 1) tem de
 * existir nas cinco linguas, nao vazias e diferentes da propria chave, e as do
 * interruptor "Quem preenche" (que deixou de existir) nao podem ter ficado.
 *
 * `useTranslation` cai para a propria chave quando nenhuma lingua a tem: quem
 * esquecesse uma lingua veria "hr.form.enviarConvite" no ecra.
 */
import { describe, expect, it } from "vitest";
import { translations } from "@/translations/index";

const LINGUAS = ["en", "pt", "es", "fr", "de"] as const;

const CHAVES_NOVAS: readonly string[] = [
  "hr.form.enviarConvite",
  "hr.form.enviarConviteAjudaLigado",
  "hr.form.enviarConviteAjudaDesligado",
  "hr.form.criarEEnviarConvite",
  "hr.form.ajudaTitularBanco",
  "hr.form.semPermissaoBancarios",
  "hr.form.seccoes.fardamento",
  "hr.form.camposFicamPendencia",
  "hr.form.conviteSemPermissao",
  "hr.form.criarMotivo.nomes",
  "hr.form.criarMotivo.configuracao",
  "hr.form.criarMotivo.duplicado",
  "hr.form.criarMotivo.sinal",
  "hr.form.configuracaoSemAcesso",
  "hr.form.semPermissaoFardamento",
  "hr.form.semPermissaoIdentificacao",
];

/** Reutilizadas do convite pelo formulario completo: tem de continuar a existir. */
const CHAVES_DO_CONVITE: readonly string[] = [
  "hr.campos.dependentesDeficientes",
  "hr.campos.conjugeSituacaoProfissional",
  "hr.campos.naturalidadeFreguesia",
  "hr.campos.naturalidadeConcelho",
  "hr.campos.naturalidadePais",
  "hr.campos.habilitacaoAcademica",
  "hr.campos.habilitacaoDataConclusao",
  "hr.campos.cartaConducaoNumero",
  "hr.campos.cartaConducaoCategorias",
  "hr.campos.cartaConducaoValidade",
  "hr.campos.titularConta",
  "hr.campos.banco",
  "hr.convite.naturalidadeHabilitacao",
  "hr.fardamento.titulo",
  "hr.fardamento.tamanhoCima",
  "hr.fardamento.tamanhoBaixo",
  "hr.fardamento.tamanhoCalcado",
  "hr.fardamento.detalhe",
  "hr.tamanhoFardamento.outro",
  "hr.conjugeSituacaoProfissional.trabalhador",
  "hr.habilitacaoAcademica.licenciatura",
];

const REMOVIDAS: readonly string[] = [
  "hr.form.quemPreenche",
  "hr.form.quemPreenche.convite",
  "hr.form.quemPreenche.rh",
  "hr.form.quemPreenche.ajudaConvite",
  "hr.form.quemPreenche.ajudaRh",
  // O aviso de "sem permissao" ao criar com convite deixou de existir: o
  // interruptor fica desactivado (hr.form.conviteSemPermissao).
  "hr.form.conviteNaoAberto.semPermissao",
];

describe("traducoes do formulario Nova pessoa completo", () => {
  for (const lingua of LINGUAS) {
    const dicionario = translations[lingua] as Record<string, string>;
    it(`${lingua}: as chaves novas e as reutilizadas existem e tem texto`, () => {
      for (const chave of [...CHAVES_NOVAS, ...CHAVES_DO_CONVITE]) {
        const texto = dicionario[chave];
        expect(texto, `${lingua} ${chave}`).toBeTypeOf("string");
        expect(texto.trim(), `${lingua} ${chave}`).not.toBe("");
        expect(texto, `${lingua} ${chave}`).not.toBe(chave);
      }
    });
    it(`${lingua}: as chaves do interruptor removido nao ficaram`, () => {
      for (const chave of REMOVIDAS) expect(dicionario[chave], `${lingua} ${chave}`).toBeUndefined();
    });
  }
});
