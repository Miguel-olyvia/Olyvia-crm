// Onde está o bloco de assinatura de um corpo de contrato, por esta ordem:
//   1) marcas por classe: olv-assinatura-empresa / olv-assinatura-cliente (as colunas);
//   2) as frases de cada idioma do registo (o idioma pedido primeiro, os outros como último recurso):
//      duas colunas, cada uma com a sua linha, uma delas a mencionar o cliente; ou o bloco plano antigo;
//   3) nada.
// Para o português as frases são as de sempre (O SEGUNDO CONTRATANTE | O CLIENTE / A PRIMEIRA CONTRATANTE).
// Precisa de DOM: quem chama garante `document`.

import { IDIOMAS, IDIOMA_BASE, type FrasesDeAssinatura } from "@/lib/idiomaDocumento";
import { htmlTemClasse } from "./contractClassMarks";

export const CLASSE_EMPRESA = "olv-assinatura-empresa";
export const CLASSE_CLIENTE = "olv-assinatura-cliente";
export const CLASSE_BLOCO = "olv-assinaturas";

/** As duas etiquetas que o bloco plano gerado escreve, por idioma (sem palavras próprias: as do português). */
const ROTULOS_DAS_PARTES: Record<string, { primeira: string; segunda: string }> = {
  pt: { primeira: "A PRIMEIRA CONTRATANTE", segunda: "O SEGUNDO CONTRATANTE" },
  en: { primeira: "THE FIRST PARTY", segunda: "THE SECOND PARTY" },
};

export function rotulosDasPartes(codigo: string): { primeira: string; segunda: string } {
  return ROTULOS_DAS_PARTES[codigo] ?? ROTULOS_DAS_PARTES[IDIOMA_BASE];
}

export interface FrasesDoIdioma {
  codigo: string;
  frases: FrasesDeAssinatura;
}

/** Os idiomas com frases de assinatura, o pedido primeiro (e depois os restantes, pela ordem do registo). */
export function frasesPorOrdem(idioma?: string): FrasesDoIdioma[] {
  const todos = IDIOMAS.filter((i) => i.assinatura).map((i) => ({ codigo: i.codigo, frases: i.assinatura as FrasesDeAssinatura }));
  return [...todos.filter((i) => i.codigo === idioma), ...todos.filter((i) => i.codigo !== idioma)];
}

/** O html tem alguma das marcas por classe do bloco de assinatura? */
export function temMarcaDeAssinatura(html: string | null | undefined): boolean {
  return htmlTemClasse(html, CLASSE_BLOCO, CLASSE_EMPRESA, CLASSE_CLIENTE);
}

// ── critérios de uma linha para assinar (os mesmos de sempre) ───────────────────────────────────

/** Parágrafo/div só com underscores, traços e espaços (as linhas de assinatura soltas de uma minuta). */
export function isDecorativeLine(el: Element | null): boolean {
  if (!el) return false;
  if (!/^(P|DIV)$/.test(el.tagName)) return false;
  const raw = (el.textContent || "").replace(/\u00A0/g, " ");
  return raw.replace(/[\s_·\-–—]/g, "").length === 0;
}

/**
 * Uma "coluna" de assinatura real tem sempre uma linha para assinar por cima da etiqueta — via borda
 * (border-bottom), <hr>, ou um parágrafo feito só de underscores/traços (ex.: "_______________________").
 */
export function isLineElement(el: Element): boolean {
  if (/border-bottom/i.test(el.getAttribute?.("style") || "")) return true;
  if (el.tagName === "HR") return true;
  const text = el.textContent || "";
  const stripped = text.replace(/[\s_·\-–—]/g, "");
  return stripped.length === 0 && text.replace(/\s/g, "").length > 0;
}

function hasLineMarker(el: Element): boolean {
  if (isLineElement(el)) return true;
  if (Array.from(el.children).some(isLineElement)) return true;
  return !!el.querySelector('[style*="border-bottom" i], hr');
}

// ── localização ─────────────────────────────────────────────────────────────────────────────────

export type LocalizacaoDaAssinatura =
  | { tipo: "marcado"; empresa: Element | null; cliente: Element | null }
  | { tipo: "colunas"; empresa: Element; cliente: Element; idioma: string }
  | { tipo: "plano"; alvo: Element; idioma: string };

function candidatos(raiz: ParentNode): Element[] {
  return Array.from(raiz.querySelectorAll("div, p, td, span, tr"));
}

/**
 * O contentor cujos PRÓPRIOS filhos diretos já se dividem em duas colunas de assinatura genuínas (cada uma com
 * a sua linha) — uma menciona o cliente/segunda parte, a outra não. Ignora wrappers de 1 filho e containers
 * maiores que incluem texto solto (datas, quebras de linha) ao lado do verdadeiro bloco de colunas.
 */
function procurarColunas(raiz: ParentNode, frases: FrasesDeAssinatura): { empresa: Element; cliente: Element } | null {
  for (const el of candidatos(raiz)) {
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!frases.segundaParte.test(text) || text.length >= 400) continue;
    const kids = Array.from(el.children);
    if (kids.length < 2) continue;
    const cliente = kids.find((k) => frases.segundaParte.test(k.textContent || ""));
    const empresa = kids.find((k) => k !== cliente);
    if (!cliente || !empresa) continue;
    if (hasLineMarker(cliente) && hasLineMarker(empresa)) return { empresa, cliente };
  }
  return null;
}

/** O bloco plano antigo: uma só etiqueta curta (<220) com as duas partes. */
function procurarPlano(raiz: ParentNode, frases: FrasesDeAssinatura): Element | null {
  return (
    candidatos(raiz).find((el) => {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      return frases.primeiraParte.test(text) && frases.segundaParte.test(text) && text.length < 220;
    }) ?? null
  );
}

export function localizarAssinaturas(raiz: ParentNode, idioma?: string): LocalizacaoDaAssinatura | null {
  const empresaMarcada = raiz.querySelector(`.${CLASSE_EMPRESA}`);
  const clienteMarcado = raiz.querySelector(`.${CLASSE_CLIENTE}`);
  if (empresaMarcada || clienteMarcado) return { tipo: "marcado", empresa: empresaMarcada, cliente: clienteMarcado };

  for (const { codigo, frases } of frasesPorOrdem(idioma)) {
    const colunas = procurarColunas(raiz, frases);
    if (colunas) return { tipo: "colunas", ...colunas, idioma: codigo };
    const alvo = procurarPlano(raiz, frases);
    if (alvo) return { tipo: "plano", alvo, idioma: codigo };
  }
  return null;
}

/** O primeiro elemento (até `max`) que contém as duas etiquetas das partes — o bloco que o signatário substitui. */
export function localizarBlocoGenerico(raiz: ParentNode, idioma?: string): { alvo: Element; idioma: string } | null {
  const elementos = Array.from(raiz.querySelectorAll("p, div, td"));
  for (const { codigo } of frasesPorOrdem(idioma)) {
    const { primeira, segunda } = rotulosDasPartes(codigo);
    const alvo = elementos.find((el) => {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      return text.includes(primeira) && text.includes(segunda) && text.length < 220;
    });
    if (alvo) return { alvo, idioma: codigo };
  }
  return null;
}
