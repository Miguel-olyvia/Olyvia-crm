/**
 * As chaves de traducao dos anexos pelo RH (ficha e "Nova pessoa") existem nas
 * cinco linguas, nao vazias e diferentes da propria chave. Fecha o ponto (b) do
 * teste de contrato: todo o codigo do catalogo da Edge tem texto traduzido.
 *
 * `useTranslation` cai para a propria chave quando nenhuma lingua a tem: quem
 * esquecesse uma lingua veria "hr.anexos.anexar" no ecra.
 */
import { describe, expect, it } from "vitest";
import { translations } from "@/translations/index";
import { chaveDeErroAnexoRh } from "@/lib/hr/anexosRh";

const LINGUAS = ["en", "pt", "es", "fr", "de"] as const;
type Lingua = (typeof LINGUAS)[number];

const dicionario = (lingua: Lingua): Record<string, string> =>
  (translations as unknown as Record<string, Record<string, string>>)[lingua];

const CHAVES_NOVAS: readonly string[] = [
  "hr.anexos.anexar",
  "hr.anexos.substituir",
  "hr.anexos.remover",
  "hr.anexos.retirar",
  "hr.anexos.removerConfirmar.titulo",
  "hr.anexos.removerConfirmar.descricao",
  "hr.anexos.aEnviar",
  "hr.anexos.aVerificar",
  "hr.anexos.progresso",
  "hr.anexos.ajudaFicheiros",
  "hr.anexos.ajudaFotografia",
  "hr.anexos.ver",
  "hr.anexos.fechar",
  "hr.anexos.marcaDagua",
  "hr.anexos.visualizar.aviso",
  "hr.anexos.visualizar.aCarregar",
  "hr.anexos.erro.semPermissao",
  "hr.anexos.erro.pessoaNaoEncontrada",
  "hr.anexos.erro.substitutoInvalido",
  "hr.anexos.erro.limitePessoa",
  "hr.anexos.erro.demasiadasTentativas",
  "hr.anexos.erro.falhaEnvio",
  "hr.anexos.novaPessoa.titulo",
  "hr.anexos.novaPessoa.ajuda",
  "hr.form.seccoes.anexos",
  // Ja existiam: tem de continuar.
  "hr.anexos.titulo",
  "hr.anexos.vazio",
  "hr.anexos.abrir",
  "hr.anexos.erroAbrir",
];

/** Os codigos do catalogo da Edge hr-anexo-rh (lidos do ficheiro, como no teste de contrato). */
const ERROS_RH = Object.values(
  import.meta.glob("../../../../supabase/functions/hr-anexo-rh/erros.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
)[0];

function codigosRh(): string[] {
  const limpo = ERROS_RH.replace(/\/\/.*$/gm, "");
  const inicio = limpo.indexOf("export const CODIGOS_RH = [");
  const fim = limpo.indexOf("] as const", inicio);
  return [...limpo.slice(inicio, fim).matchAll(/"([a-z_0-9]+)"/g)].map((m) => m[1]);
}

describe.each(LINGUAS)("anexos pelo RH: traducoes (%s)", (lingua) => {
  it.each(CHAVES_NOVAS)("%s existe, nao e vazia e nao e a propria chave", (chave) => {
    const texto = dicionario(lingua)[chave];
    expect(texto, `${lingua}: ${chave}`).toBeTruthy();
    expect(texto).not.toBe(chave);
  });

  it("todo o codigo de CODIGOS_RH tem chave de erro traduzida (nunca o codigo em bruto)", () => {
    const codigos = codigosRh();
    expect(codigos.length).toBeGreaterThan(15);
    for (const codigo of codigos) {
      const chave = chaveDeErroAnexoRh(codigo);
      const texto = dicionario(lingua)[chave];
      expect(texto, `${lingua}: ${codigo} -> ${chave}`).toBeTruthy();
      expect(texto).not.toContain(codigo);
    }
  });

  it("os textos de erro proprios do RH nao mandam 'contactar o RH' (quem os le e o RH)", () => {
    const proprios = [
      "hr.anexos.erro.semPermissao",
      "hr.anexos.erro.pessoaNaoEncontrada",
      "hr.anexos.erro.substitutoInvalido",
      "hr.anexos.erro.limitePessoa",
      "hr.anexos.erro.demasiadasTentativas",
      "hr.anexos.erro.falhaEnvio",
    ];
    for (const chave of proprios) {
      expect(dicionario(lingua)[chave], `${lingua}: ${chave}`).not.toMatch(/\b(RH|HR|RR\. ?HH\.|RH)\b/);
    }
  });
});

describe("paridade de parametros entre linguas", () => {
  it.each(["hr.anexos.marcaDagua", "hr.anexos.progresso"])("%s usa os mesmos {{parametros}} em todas", (chave) => {
    const parametros = (lingua: Lingua) =>
      [...(dicionario(lingua)[chave] ?? "").matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    const referencia = parametros("pt");
    expect(referencia.length).toBeGreaterThan(0);
    for (const lingua of LINGUAS) expect(parametros(lingua), `${lingua}: ${chave}`).toEqual(referencia);
  });
});
