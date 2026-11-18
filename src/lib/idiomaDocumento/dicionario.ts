// Palavras dos documentos por idioma e a função que as devolve.
// Um idioma sem dicionário próprio (registado ou não) usa as palavras do português.

import { DICIONARIO_EN } from "./dicionario.en";
import { DICIONARIO_PT } from "./dicionario.pt";
import { IDIOMA_BASE, normalizarCodigo } from "./registo";

export type ParametrosDoc = Record<string, string | number | null | undefined>;

const DICIONARIOS: Record<string, Record<string, string>> = {
  pt: DICIONARIO_PT,
  en: DICIONARIO_EN,
};

function interpolar(texto: string, params?: ParametrosDoc): string {
  if (!params) return texto;
  // Função de substituição: o valor entra tal e qual (um «$&» no valor não é um padrão).
  return texto.replace(/\{([a-zA-Z0-9_]+)\}/g, (marcador, nome: string) =>
    Object.prototype.hasOwnProperty.call(params, nome) ? String(params[nome]) : marcador,
  );
}

/**
 * A palavra `chave` no idioma `codigo`, com os marcadores {x} preenchidos por `params`.
 * Cai no português se o idioma não tiver a chave, e na própria chave se nem o português a tiver.
 */
export function tDoc(codigo: string | null | undefined, chave: string, params?: ParametrosDoc): string {
  const c = normalizarCodigo(codigo) ?? IDIOMA_BASE;
  const texto = DICIONARIOS[c]?.[chave] ?? DICIONARIOS[IDIOMA_BASE][chave] ?? chave;
  return interpolar(texto, params);
}
