// Deteção e remoção do BLOCO DE ASSINATURA de um corpo de contrato, para o juntar numa só assinatura quando
// o documento sai em vários idiomas. É a ÚNICA localização do bloco: contractDocument.ts (carimbo e signatário)
// usa `localizarAssinaturas` daqui; não há cópia noutro sítio (há um teste de paridade com injectSignaturesIntoBlock).
//
// A deteção, por esta ordem:
//   1) marcas por classe: olv-assinaturas (contentor) ou olv-assinatura-empresa / olv-assinatura-cliente (colunas);
//   2) as frases do idioma pedido e do idioma base (o português é exatamente o de sempre): duas colunas, cada uma
//      com a sua linha, uma delas a mencionar o cliente; ou o bloco plano antigo. Os OUTROS idiomas só se procuram
//      quando são pedidos expressamente (lista `idiomas`), nunca por omissão;
//   3) nada.
// Em idiomas que não o base o bloco PLANO (uma etiqueta curta com as duas partes) só vale no fim do corpo e com uma
// linha de assinatura, e nunca se REMOVE sem marcas nem colunas: «The Company shall provide the Services to the
// Client.» é uma cláusula, não uma assinatura. O português fica como hoje (mesma heurística de sempre).
// Precisa de DOM (como injectSignaturesIntoBlock): sem `document` não deteta nada e devolve o html intacto.

import { tDoc } from "./dicionario";
import { IDIOMA_BASE, normalizarCodigo, obterIdioma, ordenarPorRegisto, type FrasesDeAssinatura } from "./registo";

export const CLASSE_ASSINATURAS = "olv-assinaturas";
export const CLASSE_ASSINATURA_EMPRESA = "olv-assinatura-empresa";
export const CLASSE_ASSINATURA_CLIENTE = "olv-assinatura-cliente";
export const CLASSE_ASSINATURA_UNICA = "olv-assinatura-unica";

const MAX_LINHAS_DECORATIVAS = 2;
/** Quantos blocos de nível superior, contados do fim, ainda são «o fim do corpo». */
const BLOCOS_FINAIS = 3;
/** Conteúdo que nunca é uma linha decorativa: uma rúbrica, um carimbo ou um quadro. */
const CONTEUDO_NAO_DECORATIVO = "img, svg, table, canvas, picture, video, iframe, object, embed, input";

function abrir(html: string | null | undefined): HTMLTemplateElement | null {
  if (!html || typeof document === "undefined") return null;
  const modelo = document.createElement("template");
  modelo.innerHTML = html;
  return modelo;
}

function classes(el: Element): string {
  return el.getAttribute("class") ?? "";
}

// ── critérios de uma linha para assinar ─────────────────────────────────────────────────────────

/**
 * Parágrafo/div só com underscores, traços e espaços (as linhas de assinatura soltas de uma minuta).
 * Nunca com imagem, svg, tabela ou canvas lá dentro: uma rúbrica ou um carimbo não é uma linha decorativa.
 */
export function isDecorativeLine(el: Element | null): boolean {
  if (!el) return false;
  if (!/^(P|DIV)$/.test(el.tagName)) return false;
  if (el.querySelector(CONTEUDO_NAO_DECORATIVO)) return false;
  const raw = (el.textContent || "").replace(/\u00A0/g, " ");
  return raw.replace(/[\s_·\-–—]/g, "").length === 0;
}

/** Uma linha para assinar: borda inferior, <hr> ou um parágrafo só de underscores. */
export function isLineElement(el: Element): boolean {
  if (/border-bottom/i.test(el.getAttribute?.("style") || "")) return true;
  if (el.tagName === "HR") return true;
  const text = el.textContent || "";
  return text.replace(/[\s_·\-–—]/g, "").length === 0 && text.replace(/\s/g, "").length > 0;
}

/** Uma coluna de assinatura real tem uma linha: ela própria, um filho ou um descendente. */
export function hasLineMarker(el: Element): boolean {
  if (isLineElement(el)) return true;
  if (Array.from(el.children).some(isLineElement)) return true;
  return !!el.querySelector('[style*="border-bottom" i], hr');
}

// ── o bloco plano em idiomas que não o base ─────────────────────────────────────────────────────

/** Os blocos de nível superior do corpo, com os wrappers olv-versao desembrulhados. */
function blocosDeNivelTopo(raiz: ParentNode): Element[] {
  const out: Element[] = [];
  for (const el of Array.from(raiz.children)) {
    if (/(^|\s)olv-versao(\s|$)/.test(classes(el))) out.push(...blocosDeNivelTopo(el));
    else out.push(el);
  }
  return out;
}

function estaNoFimDoCorpo(raiz: ParentNode, el: Element): boolean {
  const blocos = blocosDeNivelTopo(raiz);
  const indice = blocos.findIndex((b) => b === el || b.contains(el));
  return indice >= 0 && indice >= blocos.length - BLOCOS_FINAIS;
}

/** Tem uma linha para assinar: borda, <hr>, sublinhados no próprio texto ou uma linha logo antes. */
function temLinhaDeAssinatura(el: Element): boolean {
  if (hasLineMarker(el)) return true;
  if (/_{3,}/.test(el.textContent || "")) return true;
  const anterior = el.previousElementSibling;
  return !!anterior && isLineElement(anterior);
}

/** O bloco plano é crível? No fim do corpo e com linha de assinatura. */
export function blocoPlanoPlausivel(raiz: ParentNode, el: Element): boolean {
  return estaNoFimDoCorpo(raiz, el) && temLinhaDeAssinatura(el);
}

// ── idiomas de deteção ──────────────────────────────────────────────────────────────────────────

export interface FrasesDoIdioma {
  codigo: string;
  frases: FrasesDeAssinatura;
}

/**
 * Os idiomas em que se procuram as frases de assinatura: o pedido (se tiver frases), o base e, só se vierem
 * expressamente em `extras`, os outros. Sem idioma (chamadas antigas) é só o português de hoje.
 */
export function idiomasDeDeteccao(idioma?: string | null, extras: readonly string[] = []): FrasesDoIdioma[] {
  const pedidos = [normalizarCodigo(idioma) ?? IDIOMA_BASE, IDIOMA_BASE, ...extras.map((c) => normalizarCodigo(c))];
  const vistos: string[] = [];
  for (const c of pedidos) if (c && !vistos.includes(c)) vistos.push(c);
  const out: FrasesDoIdioma[] = [];
  for (const codigo of vistos) {
    const frases = obterIdioma(codigo)?.assinatura;
    if (frases) out.push({ codigo, frases });
  }
  return out;
}

// ── localização ─────────────────────────────────────────────────────────────────────────────────

export interface OpcoesDeLocalizacao {
  /** O idioma da versão onde se procura (omissão: o base). */
  idioma?: string | null;
  /** Outros idiomas em que também se procura, pedidos expressamente (o documento com vários idiomas). */
  idiomas?: readonly string[];
  /** «remover»: em idiomas que não o base, o bloco plano (só frases) não conta — só marcas e colunas. */
  modo?: "detetar" | "remover";
  /** Só as marcas por classe. */
  soMarcas?: boolean;
}

export type LocalizacaoDaAssinatura =
  /** Duas colunas (marcadas por classe ou achadas pelas frases). Uma das partes pode faltar. */
  | { tipo: "colunas"; marcada: boolean; empresa: Element | null; cliente: Element | null; elementos: Element[]; idioma?: string }
  /** O bloco plano: uma só etiqueta com as duas partes. */
  | { tipo: "plano"; alvo: Element; elementos: Element[]; idioma: string };

function candidatos(raiz: ParentNode): Element[] {
  return Array.from(raiz.querySelectorAll("div, p, td, span, tr"));
}

function posicao(a: Element, b: Element): number {
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

function semEspacos(texto: string | null): string {
  return (texto ?? "").replace(/\s+/g, "");
}

/** O que sai quando se tira o bloco marcado: o ancestral comum, se ele só contém as colunas; senão cada coluna. */
function elementosDasColunas(empresa: Element | null, cliente: Element | null): Element[] {
  const colunas = [empresa, cliente].filter((c): c is Element => c !== null).sort(posicao);
  if (colunas.length < 2) return colunas;
  let ancestral = colunas[1].parentElement;
  while (ancestral && !ancestral.contains(colunas[0])) ancestral = ancestral.parentElement;
  if (ancestral && semEspacos(ancestral.textContent) === semEspacos(colunas[0].textContent) + semEspacos(colunas[1].textContent)) {
    return [ancestral];
  }
  return colunas;
}

/** A coluna irmã (com linha) de uma coluna marcada. */
function irma(coluna: Element): Element | null {
  const pai = coluna.parentElement;
  return Array.from(pai?.children ?? []).find((k) => k !== coluna && hasLineMarker(k)) ?? null;
}

function localizarMarcado(raiz: ParentNode): LocalizacaoDaAssinatura | null {
  const contentor = raiz.querySelector(`.${CLASSE_ASSINATURAS}`);
  const ambito: ParentNode = contentor ?? raiz;
  let empresa = ambito.querySelector(`.${CLASSE_ASSINATURA_EMPRESA}`);
  let cliente = ambito.querySelector(`.${CLASSE_ASSINATURA_CLIENTE}`);
  if (!contentor && !empresa && !cliente) return null;

  if (contentor && !empresa && !cliente) {
    // Só o contentor: as duas colunas diretas (a da empresa à esquerda, a do cliente à direita).
    let filhos = Array.from(contentor.children);
    if (filhos.length === 1) filhos = Array.from(filhos[0].children);
    if (filhos.length >= 2) {
      empresa = filhos[0];
      cliente = filhos[filhos.length - 1];
    }
  }
  if (cliente && !empresa) empresa = irma(cliente);
  if (empresa && !cliente) cliente = irma(empresa);

  return {
    tipo: "colunas",
    marcada: true,
    empresa,
    cliente,
    elementos: contentor ? [contentor] : elementosDasColunas(empresa, cliente),
  };
}

/** O texto do elemento com os blocos separados por um espaço (o `textContent` cola «…1.2.3.4» a «O CLIENTE»). */
function textoSeparado(el: Element): string {
  const partes: string[] = [];
  const passeio = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let no = passeio.nextNode(); no; no = passeio.nextNode()) partes.push(no.textContent ?? "");
  return partes.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * O elemento menciona esta parte? Pelo texto corrido e, se não, pelo texto com os blocos separados: um bloco já
 * carimbado (nome, data e IP por cima da linha) cola o último número do carimbo à etiqueta da parte, e o `\b` das
 * frases deixava de a reconhecer. Só acrescenta correspondências, nunca tira.
 */
function mencionaParte(frase: RegExp, el: Element): boolean {
  return frase.test(el.textContent || "") || frase.test(textoSeparado(el));
}

/**
 * O contentor cujos PRÓPRIOS filhos diretos já se dividem em duas colunas de assinatura genuínas (cada uma com
 * a sua linha) — uma menciona o cliente/segunda parte, a outra não. Ignora wrappers de 1 filho e containers
 * maiores que incluem texto solto (datas, quebras de linha) ao lado do verdadeiro bloco de colunas.
 */
function procurarColunas(raiz: ParentNode, frases: FrasesDeAssinatura): { contentor: Element; empresa: Element; cliente: Element } | null {
  // Vários contentores podem passar neste teste (o wrapper das colunas e, por cima dele, o parágrafo «Pontinha, ____»
  // que o contém, cujo «____» da data por preencher também conta como linha). Escolhe-se o MAIS INTERIOR (o de menos
  // texto): é o das duas colunas verdadeiras, e cada assinatura fica por cima da linha da sua parte. Os <br> soltos
  // entre colunas não contam como coluna. (Correção do ramo RH, reaplicada aqui depois de a deteção passar para este módulo.)
  let melhor: { contentor: Element; empresa: Element; cliente: Element; tamanho: number } | null = null;
  for (const el of candidatos(raiz)) {
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!mencionaParte(frases.segundaParte, el) || text.length >= 400) continue;
    const kids = Array.from(el.children).filter((k) => k.tagName !== "BR");
    if (kids.length < 2) continue;
    const cliente = kids.find((k) => mencionaParte(frases.segundaParte, k));
    const empresa = kids.find((k) => k !== cliente);
    if (!cliente || !empresa) continue;
    if (!(hasLineMarker(cliente) && hasLineMarker(empresa))) continue;
    if (melhor === null || text.length < melhor.tamanho) melhor = { contentor: el, empresa, cliente, tamanho: text.length };
  }
  return melhor ? { contentor: melhor.contentor, empresa: melhor.empresa, cliente: melhor.cliente } : null;
}

/** O bloco plano antigo: uma só etiqueta curta (<220) com as duas partes (e, se `aceita`, que passe o crivo). */
function procurarPlano(raiz: ParentNode, frases: FrasesDeAssinatura, aceita?: (el: Element) => boolean): Element | null {
  return (
    candidatos(raiz).find((el) => {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!(frases.primeiraParte.test(text) && frases.segundaParte.test(text) && text.length < 220)) return false;
      return aceita ? aceita(el) : true;
    }) ?? null
  );
}

export function localizarAssinaturas(raiz: ParentNode, opcoes: OpcoesDeLocalizacao = {}): LocalizacaoDaAssinatura | null {
  const marcado = localizarMarcado(raiz);
  if (marcado || opcoes.soMarcas) return marcado;

  for (const { codigo, frases } of idiomasDeDeteccao(opcoes.idioma, opcoes.idiomas)) {
    const base = codigo === IDIOMA_BASE;
    const colunas = procurarColunas(raiz, frases);
    if (colunas) {
      return { tipo: "colunas", marcada: false, empresa: colunas.empresa, cliente: colunas.cliente, elementos: [colunas.contentor], idioma: codigo };
    }
    if (!base && opcoes.modo === "remover") continue;
    const alvo = procurarPlano(raiz, frases, base ? undefined : (el) => blocoPlanoPlausivel(raiz, el));
    if (alvo) return { tipo: "plano", alvo, elementos: [alvo], idioma: codigo };
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
  /** O bloco (já sem o embrulho que só o continha); mais de um quando as colunas estão soltas no topo. */
  principais: Element[];
  /** As linhas decorativas imediatamente antes do primeiro (do mais próximo para o mais longe). */
  linhas: Element[];
}

function encontrarBloco(raiz: ParentNode, opcoes: OpcoesDeLocalizacao): Bloco | null {
  const loc = localizarAssinaturas(raiz, opcoes);
  if (!loc || loc.elementos.length === 0) return null;
  const principais = Array.from(new Set(loc.elementos.map(subir)));
  const linhas: Element[] = [];
  let anterior = principais[0].previousElementSibling;
  while (linhas.length < MAX_LINHAS_DECORATIVAS && isDecorativeLine(anterior)) {
    linhas.push(anterior as Element);
    anterior = (anterior as Element).previousElementSibling;
  }
  return { principais, linhas };
}

/** O bloco existe? (`idioma` = o da versão; `idiomas` = outros idiomas pedidos expressamente.) */
export function temBlocoDeAssinatura(html: string | null | undefined, codigo?: string, idiomas?: readonly string[]): boolean {
  const modelo = abrir(html);
  return !!modelo && localizarAssinaturas(modelo.content, { idioma: codigo, idiomas }) !== null;
}

/**
 * Tira o bloco de assinatura (e as linhas decorativas que o antecedem). Sem bloco, devolve o html tal e qual.
 * Em idiomas que não o base só se remove com marcas por classe ou colunas: nunca só pela heurística plana.
 */
export function removerBlocoDeAssinatura(
  html: string,
  codigo?: string,
  idiomas?: readonly string[],
): { html: string; removido: boolean } {
  const modelo = abrir(html);
  const bloco = modelo ? encontrarBloco(modelo.content, { idioma: codigo, idiomas, modo: "remover" }) : null;
  if (!modelo || !bloco) return { html, removido: false };
  bloco.linhas.forEach((l) => l.remove());
  bloco.principais.forEach((p) => p.remove());
  return { html: modelo.innerHTML, removido: true };
}

/**
 * O bloco de assinatura (com as linhas decorativas que o antecedem, pela ordem original) como html, para o repetir
 * noutra versão que não o tem. É uma leitura: o html recebido não se altera. Sem bloco, null.
 */
export function extrairBlocoDeAssinatura(
  html: string | null | undefined,
  codigo?: string,
  idiomas?: readonly string[],
): string | null {
  const modelo = abrir(html);
  const bloco = modelo ? encontrarBloco(modelo.content, { idioma: codigo, idiomas }) : null;
  if (!bloco) return null;
  return [...[...bloco.linhas].reverse(), ...bloco.principais].map((el) => el.outerHTML).join("");
}

/** Põe `fragmento` imediatamente antes do bloco de assinatura (antes das suas linhas decorativas). */
export function inserirAntesDoBlocoDeAssinatura(
  html: string,
  fragmento: string,
  codigo?: string,
  idiomas?: readonly string[],
): { html: string; inserido: boolean } {
  const modelo = abrir(html);
  const bloco = modelo ? encontrarBloco(modelo.content, { idioma: codigo, idiomas }) : null;
  if (!modelo || !bloco) return { html, inserido: false };
  const inicio = bloco.linhas.length > 0 ? bloco.linhas[bloco.linhas.length - 1] : bloco.principais[0];
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
