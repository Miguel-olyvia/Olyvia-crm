/**
 * Duas garantias sobre as traducoes dos ecras de Pessoas, da "Nova pessoa" e do convite:
 *
 * 1. Nenhuma chave literal `t("...")` usada nesses ficheiros pode faltar em pt ou em en (o `useTranslation` cai para
 *    a propria chave e o utilizador veria "rhNova.pos.convite" no ecra). As chaves montadas com `${}` nao se leem do
 *    codigo: as da etiqueta de posicao do painel "Nova pessoa" listam-se aqui a partir dos valores possiveis.
 * 2. Os textos pt das familias acrescentadas pelas etapas E1a/E1c/E2 nao podem trazer palavras comuns sem acento
 *    ("Obrigatorio", "proprios", "nao"...).
 */
import { describe, expect, it } from "vitest";
import { translations } from "@/translations/index";
import { bundleTranslations } from "@/translations/bundles";
import { priceContextsTranslations } from "@/translations/priceContexts";

type Dicionario = Record<string, string>;

function fundir(lingua: "pt" | "en"): Dicionario {
  return {
    ...(translations[lingua] as Dicionario),
    ...((bundleTranslations as Record<string, Dicionario>)[lingua] ?? {}),
    ...((priceContextsTranslations as Record<string, Dicionario>)[lingua] ?? {}),
  };
}

const PT = fundir("pt");
const EN = fundir("en");

/** O codigo (nao os testes) dos ecras de Pessoas, da "Nova pessoa" e do convite, lido como texto. */
const FONTES = import.meta.glob(
  [
    "/src/components/hr/{novaPessoa,ficha,form,convite,lista,anexos}/**/*.{ts,tsx}",
    "/src/components/hr/{NovaPessoaDialogo,EnviarConviteDialog,CancelarConviteDialog,ProlongarConviteDialog,PessoaConviteAdmissaoEstado,PessoaVisaoGeralTab,BotaoCriarAcesso,CriarAcessoDialog}.tsx",
    "/src/pages/{Pessoas,PessoaDetail,ConviteAdmissao}.tsx",
    "!/src/**/*.test.{ts,tsx}",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

function ficheirosDosEcras(): Array<[string, string]> {
  return Object.entries(FONTES);
}

/** As chaves literais de `t("...")` / `t('...')` / `t(\`...\`)` sem interpolacao. */
function chavesLiterais(texto: string): string[] {
  const achadas = new Set<string>();
  for (const m of texto.matchAll(/\bt\(\s*(["'`])([A-Za-z][\w.-]*\.[\w.-]+)\1/g)) achadas.add(m[2]);
  return [...achadas];
}

/** As etiquetas de posicao possiveis (`PosicaoEtiqueta` em contextoNova.ts), usadas como `rhNova.pos.${posicao}`. */
const POSICOES = ["convite", "ficha", "opcional", "rh", "pedirConvite"] as const;

describe("traducoes dos ecras de Pessoas, Nova pessoa e convite", () => {
  it("encontra ficheiros e chaves para verificar (a pesquisa nao esta vazia)", () => {
    const ficheiros = ficheirosDosEcras();
    expect(ficheiros.length).toBeGreaterThan(30);
    const chaves = ficheiros.flatMap(([, texto]) => chavesLiterais(texto));
    expect(chaves.length).toBeGreaterThan(200);
  });

  it("nenhuma chave literal usada fica sem traducao em pt ou em en", () => {
    const emFalta: string[] = [];
    for (const [ficheiro, texto] of ficheirosDosEcras()) {
      for (const chave of chavesLiterais(texto)) {
        if (!PT[chave]) emFalta.push(`pt: ${chave} (${ficheiro})`);
        if (!EN[chave]) emFalta.push(`en: ${chave} (${ficheiro})`);
      }
    }
    expect(emFalta).toEqual([]);
  });

  it.each(POSICOES)("a etiqueta de posicao rhNova.pos.%s existe em pt e em en", (posicao) => {
    expect(PT[`rhNova.pos.${posicao}`]).toBeTruthy();
    expect(EN[`rhNova.pos.${posicao}`]).toBeTruthy();
  });
});

/**
 * Palavras do pt que levam sempre acento ou cedilha: se aparecerem escritas so com letras ASCII, o texto foi escrito
 * sem acentos. Duas partes: palavras soltas conhecidas (nao, numero, codigo...) e terminacoes que em pt nunca vem sem
 * acento (-cao/-coes, -sao/-soes, -ncia, -avel/-ivel). So palavras inteiras, e sem os {parametros}, para nao apanhar
 * identificadores como {duracao}.
 */
const SEM_ACENTO =
  /\b(?:[A-Za-z]+(?:cao|coes|sao|soes|ncia|ncias|avel|aveis|ivel|iveis)|obrigatori[oa]s?|propri[oa]s?|nao|numeros?|enderecos?|excecao|excecoes|codigo|periodo|minimo|maximo|ultimo|necessario|pagina|tambem|apos|ja|saude|sera|conjuge|comeca|duodecimos|subsidios?|conducao|historico|pais (?:de|da|do))\b/i;

/** As familias de chaves pt acrescentadas por E1a/E1c/E2, ou reutilizadas por elas, e visiveis nestes ecras. */
const FAMILIAS = [
  /^rhNova\./, /^rhForm\./, /^hr\.convite\./, /^hr\.form\./, /^hr\.admissao\./, /^hr\.campos\./, /^hr\.contrato\./,
  /^hr\.pendencias\./, /^hr\.laborais\./, /^hr\.fardamento\./, /^hr\.acesso\./, /^hr\.anexos\./, /^hr\.cargos\./,
];

describe("acentos nos textos pt das familias de Pessoas e convite", () => {
  it("nenhum texto pt traz palavras comuns sem acento", () => {
    const culpados = Object.entries(translations.pt as Dicionario)
      .filter(([chave]) => FAMILIAS.some((f) => f.test(chave)))
      .filter(([, texto]) => SEM_ACENTO.test(texto.replace(/\{\{?\w+\}?\}/g, "")))
      .map(([chave, texto]) => `${chave}: ${texto}`);
    expect(culpados).toEqual([]);
  });

  it("o detector apanha o que tem de apanhar (e deixa passar o que esta certo)", () => {
    for (const mau of ["Obrigatorio", "os seus proprios dados", "Nao foi possivel", "Situacao profissional", "Renovavel", "deficiencia"]) {
      expect(SEM_ACENTO.test(mau)).toBe(true);
    }
    for (const bom of ["Obrigatório", "próprios", "Não foi possível", "Situação", "Renovável", "deficiência", "{duracao} dias"]) {
      expect(SEM_ACENTO.test(bom.replace(/\{\{?\w+\}?\}/g, ""))).toBe(false);
    }
  });
});
