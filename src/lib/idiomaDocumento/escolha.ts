// A escolha de idiomas de um documento: «pt», «en», «pt+en»…
// Lê-se e escreve-se sempre por aqui; nunca devolve uma escolha vazia.

import { IDIOMA_BASE, normalizarCodigo } from "./registo";

function juntarCodigos(valor: unknown): unknown[] {
  if (Array.isArray(valor)) return valor;
  if (typeof valor === "string") return valor.split(/[+,]/);
  return [];
}

function limpar(valor: unknown): string[] {
  const out: string[] = [];
  for (const item of juntarCodigos(valor)) {
    const c = normalizarCodigo(item);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/** Lê uma escolha («pt+en», ["pt","en"]…): ordem preservada, sem repetidos, códigos inválidos ignorados. */
export function parseEscolha(valor: unknown, porOmissao: string = IDIOMA_BASE): string[] {
  const lidos = limpar(valor);
  return lidos.length > 0 ? lidos : [porOmissao];
}

/** Escreve uma escolha como «pt», «en» ou «pt+en». */
export function serializarEscolha(codigos: readonly unknown[]): string {
  return parseEscolha([...codigos]).join("+");
}

interface LinhaComIdiomas {
  language?: unknown;
  prompt_values?: Record<string, unknown> | null;
}

/**
 * Os idiomas de um contrato ou proposta já criados: `language`, senão `prompt_values.__idiomas`, senão português.
 * É a ÚNICA porta de leitura — quando a coluna `language` existir nas duas tabelas, só aqui se muda.
 */
export function idiomasDoDocumento(linha: LinhaComIdiomas | null | undefined): string[] {
  return parseEscolha(linha?.language ?? linha?.prompt_values?.__idiomas ?? null);
}
