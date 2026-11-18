// Deteção e remoção do BLOCO DE ASSINATURA de um corpo de contrato, para o juntar numa só assinatura quando
// o documento sai em vários idiomas.
//
// Escolha (passo 1): a lógica de contractDocument.ts (isDecorativeLine, hasLineMarker, a procura das duas
// colunas e o bloco plano com SECOND_PARTY_RE/FIRST_PARTY_RE) NÃO está exportada e esse ficheiro traz o
// cliente Supabase — este módulo é neutro e não o pode importar. Por isso aqui vão CÓPIAS PURAS dessa
// lógica, com os mesmos critérios e as mesmas expressões (as do português estão no registo), provadas
// por um teste de paridade contra injectSignaturesIntoBlock. contractDocument.ts não foi alterado.
//
// A deteção deixa de depender só de frases em português, por esta ordem:
//   1) marcas por classe: olv-assinaturas (contentor) ou olv-assinatura-empresa / olv-assinatura-cliente;
//   2) expressões por idioma, vindas do registo (o idioma da versão primeiro, os outros como último recurso);
//   3) a heurística de sempre (colunas com linha; bloco plano curto) — é a mesma de 2, aplicada ao português.
// Precisa de DOM (como injectSignaturesIntoBlock): sem `document` não deteta nada e devolve o html intacto.

import { tDoc } from "./dicionario";
import { IDIOMAS, ordenarPorRegisto, type FrasesDeAssinatura } from "./registo";

export const CLASSE_ASSINATURAS = "olv-assinaturas";
export const CLASSE_ASSINATURA_EMPRESA = "olv-assinatura-empresa";
export const CLASSE_ASSINATURA_CLIENTE = "olv-assinatura-cliente";
export const CLASSE_ASSINATURA_UNICA = "olv-assinatura-unica";

const MAX_LINHAS_DECORATIVAS = 2;

function abrir(html: string | null | undefined): HTMLTemplateElement | null {
  if (!html || typeof document === "undefined") return null;
  const modelo = document.createElement("template");
  modelo.innerHTML = html;
  return modelo;
}

function classes(el: Element): string {
  return el.getAttribute("class") ?? "";
}

// ── cópias de contractDocument.ts ───────────────────────────────────────────────────────────────

/** Parágrafo/div só com underscores, traços e espaços (as linhas de assinatura soltas de uma minuta). */
function isDecorativeLine(el: Element | null): boolean {
  if (!el) return false;
  if (!/^(P|DIV)$/.test(el.tagName)) return false;
  const raw = (el.textContent || "").replace(/\u00A0/g, " ");
  return raw.replace(/[\s_·\-–—]/g, "").length === 0;
}

/** Uma linha para assinar: borda inferior, <hr> ou um parágrafo só de underscores. */
function isLineElement(el: Element): boolean {
  if (/border-bottom/i.test(el.getAttribute?.("style") || "")) return true;
  if (el.tagName === "HR") return true;
  const text = el.textContent || "";
  return text.replace(/[\s_·\-–—]/g, "").length === 0 && text.replace(/\s/g, "").length > 0;
}

function hasLineMarker(el: Element): boolean {
  if (isLineElement(el)) return true;
  if (Array.from(el.children).some(isLineElement)) return true;
  return !!el.querySelector('[style*="border-bottom" i], hr');
}

/** O contentor cujos filhos diretos são duas colunas de assinatura (uma delas menciona o cliente). */
function findColumns(raiz: ParentNode, frases: FrasesDeAssinatura): Element | null {
  const candidatos = Array.from(raiz.querySelectorAll("div, p, td, span, tr"));
  return (
    candidatos.find((el) => {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!frases.segundaParte.test(text) || text.length >= 400) return false;
      const kids = Array.from(el.children);
      if (kids.length < 2) return false;
      const cliente = kids.find((k) => frases.segundaParte.test(k.textContent || ""));
      const empresa = kids.find((k) => k !== cliente);
      if (!cliente || !empresa) return false;
      return hasLineMarker(cliente) && hasLineMarker(empresa);
    }) ?? null
  );
}

/** O bloco plano antigo: uma só etiqueta curta com as duas partes. */
function findFlat(raiz: ParentNode, frases: FrasesDeAssinatura): Element | null {
  const candidatos = Array.from(raiz.querySelectorAll("div, p, td, span, tr"));
  return (
    candidatos.find((el) => {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      return frases.primeiraParte.test(text) && frases.segundaParte.test(text) && text.length < 220;
    }) ?? null
  );
}

// ── deteção ─────────────────────────────────────────────────────────────────────────────────────

function findMarked(raiz: ParentNode): Element | null {
  const contentor = raiz.querySelector(`.${CLASSE_ASSINATURAS}`);
  if (contentor) return contentor;
  const cliente = raiz.querySelector(`.${CLASSE_ASSINATURA_CLIENTE}`);
  const empresa = raiz.querySelector(`.${CLASSE_ASSINATURA_EMPRESA}`);
  if (cliente && empresa) {
    let ancestral = cliente.parentElement;
    while (ancestral && !ancestral.contains(empresa)) ancestral = ancestral.parentElement;
    return ancestral ?? cliente;
  }
  return cliente ?? empresa;
}

function frasesPorOrdem(codigo?: string): FrasesDeAssinatura[] {
  const comFrases = IDIOMAS.filter((i) => i.assinatura);
  const primeiro = comFrases.filter((i) => i.codigo === codigo);
  const resto = comFrases.filter((i) => i.codigo !== codigo);
  return [...primeiro, ...resto].map((i) => i.assinatura as FrasesDeAssinatura);
}

function localizar(raiz: ParentNode, codigo?: string): Element | null {
  const marcado = findMarked(raiz);
  if (marcado) return marcado;
  for (const frases of frasesPorOrdem(codigo)) {
    const alvo = findColumns(raiz, frases) ?? findFlat(raiz, frases);
    if (alvo) return alvo;
  }
  return null;
}

/** Sobe enquanto o pai só contém este elemento (o embrulho `margin-top:40px` do bloco), sem sair de uma versão. */
function subir(elemento: Element): Element {
  let atual = elemento;
  for (;;) {
    const pai = atual.parentElement;
    if (!pai || /(^|\s)olv-versao(\s|$)/.test(classes(pai))) return atual;
    const outros = Array.from(pai.childNodes).filter((n) => {
      if (n === atual || n.nodeType === 8) return false;
      return !(n.nodeType === 3 && !(n.textContent || "").trim());
    });
    if (outros.length > 0) return atual;
    atual = pai;
  }
}

interface Bloco {
  /** O bloco (já sem o embrulho que só o continha). */
  principal: Element;
  /** As linhas decorativas imediatamente antes dele (do mais próximo para o mais longe). */
  linhas: Element[];
}

function encontrarBloco(raiz: ParentNode, codigo?: string): Bloco | null {
  const alvo = localizar(raiz, codigo);
  if (!alvo) return null;
  const principal = subir(alvo);
  const linhas: Element[] = [];
  let anterior = principal.previousElementSibling;
  while (linhas.length < MAX_LINHAS_DECORATIVAS && isDecorativeLine(anterior)) {
    linhas.push(anterior as Element);
    anterior = (anterior as Element).previousElementSibling;
  }
  return { principal, linhas };
}

export function temBlocoDeAssinatura(html: string | null | undefined, codigo?: string): boolean {
  const modelo = abrir(html);
  return !!modelo && localizar(modelo.content, codigo) !== null;
}

/** Tira o bloco de assinatura (e as linhas decorativas que o antecedem). Sem bloco, devolve o html tal e qual. */
export function removerBlocoDeAssinatura(html: string, codigo?: string): { html: string; removido: boolean } {
  const modelo = abrir(html);
  const bloco = modelo ? encontrarBloco(modelo.content, codigo) : null;
  if (!modelo || !bloco) return { html, removido: false };
  bloco.linhas.forEach((l) => l.remove());
  bloco.principal.remove();
  return { html: modelo.innerHTML, removido: true };
}

/** Põe `fragmento` imediatamente antes do bloco de assinatura (antes das suas linhas decorativas). */
export function inserirAntesDoBlocoDeAssinatura(
  html: string,
  fragmento: string,
  codigo?: string,
): { html: string; inserido: boolean } {
  const modelo = abrir(html);
  const bloco = modelo ? encontrarBloco(modelo.content, codigo) : null;
  if (!modelo || !bloco) return { html, inserido: false };
  const inicio = bloco.linhas.length > 0 ? bloco.linhas[bloco.linhas.length - 1] : bloco.principal;
  const novo = document.createElement("template");
  novo.innerHTML = fragmento;
  inicio.parentNode?.insertBefore(novo.content, inicio);
  return { html: modelo.innerHTML, inserido: true };
}

// ── a frase da assinatura única ─────────────────────────────────────────────────────────────────

function juntarNomes(codigo: string, nomes: string[]): string {
  if (nomes.length < 2) return nomes.join("");
  const separador = tDoc(codigo, "doc.lista.sep");
  const ultimo = tDoc(codigo, "doc.lista.ultimo");
  return nomes.slice(0, -1).join(separador) + ultimo + nomes[nomes.length - 1];
}

/**
 * «Esta assinatura vale para as versões em português e em inglês. / This signature applies to both the Portuguese
 * and English versions.» Uma frase por idioma da escolha, cada uma na sua língua (idiomas sem palavras próprias
 * repetiriam a portuguesa e saem uma só vez). Com menos de dois idiomas, vazio.
 */
export function fraseAssinaturaUnica(codigos: readonly string[]): string {
  const lista = ordenarPorRegisto(codigos);
  if (lista.length < 2) return "";
  const chave = lista.length === 2 ? "doc.assinaturaUnica" : "doc.assinaturaUnicaN";
  const frases: string[] = [];
  for (const codigo of lista) {
    const nomes = lista.map((c) => tDoc(codigo, `doc.idioma.${c}`));
    const frase = tDoc(codigo, chave, { idiomas: juntarNomes(codigo, nomes) });
    if (!frases.includes(frase)) frases.push(frase);
  }
  return frases.join(" / ");
}

function escapar(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** O parágrafo com a frase da assinatura única, pronto a inserir antes do bloco. Vazio com um só idioma. */
export function htmlDaAssinaturaUnica(codigos: readonly string[]): string {
  const frase = fraseAssinaturaUnica(codigos);
  if (!frase) return "";
  return `<p class="${CLASSE_ASSINATURA_UNICA}" style="margin:24px 0 8px;font-size:11px;color:#4b5563;text-align:center;">${escapar(frase)}</p>`;
}
