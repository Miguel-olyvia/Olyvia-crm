// O corpo de um contrato e o que se grava ao GERÁ-LO a partir de uma minuta, nos idiomas escolhidos.
//
// Só o idioma base (ou sem escolha, ou uma escolha que a minuta não oferece) sai EXATAMENTE como hoje:
// o corpo é o body_html da minuta, sem embrulho nenhum, e os valores a gravar (prompt_values) não levam a
// chave `__idiomas`. Com outros idiomas, o corpo vem composto (cada versão no seu wrapper olv-versao, uma só
// assinatura no fim) e o `__idiomas` regista a escolha («en», «pt+en») para o resto da app a ler por
// idiomasDoDocumento().

import {
  IDIOMA_BASE,
  comporCorpoDoContrato,
  idiomaBaseDoTemplate,
  idiomasDisponiveisContrato,
  ordenarPorRegisto,
  parseEscolha,
  serializarEscolha,
  type TemplateContratoLike,
} from "@/lib/idiomaDocumento";

/** A chave reservada de prompt_values onde fica a escolha de idiomas do contrato. */
export const CHAVE_IDIOMAS = "__idiomas";

export interface GeracaoDoContrato {
  /** O corpo a gravar em contract_body_html (o da minuta, tal e qual, quando só há o idioma base). */
  corpoHtml: string;
  /** Os valores a gravar: o que veio, com `__idiomas` só se a escolha não for o português de sempre. */
  promptValues: Record<string, string> | undefined;
  /** Os idiomas efetivamente usados (só os que a minuta tem), pela ordem do registo. Nunca vazio. */
  idiomas: string[];
  /**
   * Em que idioma procurar o bloco de assinatura ao injetar o signatário: o da última versão, onde a
   * assinatura única fica. undefined = o de sempre (sem idioma).
   */
  idiomaDaAssinatura: string | undefined;
}

/** Os idiomas que a minuta realmente oferece dentro da escolha pedida; sem nenhum, o base. */
function idiomasEfetivos(template: TemplateContratoLike, escolha: readonly string[] | undefined): string[] {
  const base = idiomaBaseDoTemplate(template);
  if (!escolha || escolha.length === 0) return [base];
  const disponiveis = idiomasDisponiveisContrato(template);
  const uteis = ordenarPorRegisto(parseEscolha([...escolha], base).filter((c) => disponiveis.includes(c)));
  return uteis.length > 0 ? uteis : [base];
}

export function prepararGeracaoDoContrato(
  template: TemplateContratoLike | null | undefined,
  escolha: readonly string[] | undefined,
  promptValues: Record<string, string> | undefined,
): GeracaoDoContrato {
  if (!template) return { corpoHtml: "", promptValues, idiomas: [IDIOMA_BASE], idiomaDaAssinatura: undefined };

  const idiomas = idiomasEfetivos(template, escolha);
  const soPortugues = idiomas.length === 1 && idiomas[0] === IDIOMA_BASE;
  if (soPortugues) {
    return {
      corpoHtml: typeof template.body_html === "string" ? template.body_html : "",
      promptValues,
      idiomas,
      idiomaDaAssinatura: undefined,
    };
  }
  return {
    corpoHtml: comporCorpoDoContrato(template, idiomas),
    promptValues: { ...(promptValues ?? {}), [CHAVE_IDIOMAS]: serializarEscolha(idiomas) },
    idiomas,
    idiomaDaAssinatura: idiomas[idiomas.length - 1],
  };
}
