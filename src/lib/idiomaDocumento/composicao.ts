// Compor e dividir o corpo de um contrato com várias versões de idioma.
//
// Só o idioma base: o body_html sai tal e qual (sem embrulho nenhum). Com outros idiomas, cada versão vai
// dentro de `<div class="olv-versao olv-versao-<codigo>">` (as seguintes com quebra de página) e a assinatura
// passa a ser UMA, no fim. Só classes: o sanitizador do HTML corta data-*.

import { htmlDaAssinaturaUnica, inserirAntesDoBlocoDeAssinatura, removerBlocoDeAssinatura, temBlocoDeAssinatura } from "./assinaturas";
import { parseEscolha } from "./escolha";
import { IDIOMA_BASE, normalizarCodigo, ordenarPorRegisto, temFrasesDeAssinatura } from "./registo";
import { idiomaBaseDoTemplate, idiomasDisponiveisContrato, lerVersoes, type TemplateContratoLike } from "./versoes";

const ESTILO_NOVA_PAGINA = "break-before:page;page-break-before:always";
const RE_TAG_DIV = /<(\/?)div\b[^>]*>/gi;

export interface VersaoDoCorpo {
  codigo: string;
  html: string;
}

/** A classe tem de ser mesmo `class` (não `data-class`); as maiúsculas e as aspas simples aceitam-se. */
const RE_CLASSE = /(?<![\w-])class\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

function codigoDoEmbrulho(tagAberta: string): string | null {
  const m = RE_CLASSE.exec(tagAberta);
  const tokens = (m?.[1] ?? m?.[2] ?? "").split(/\s+/);
  if (!tokens.includes("olv-versao")) return null;
  for (const t of tokens) {
    const c = /^olv-versao-([a-z]{2})$/i.exec(t);
    if (c) return normalizarCodigo(c[1]);
  }
  return null;
}

interface Embrulho {
  codigo: string;
  inicio: number;
  innerInicio: number;
  innerFim: number;
  fim: number;
  /** O html de dentro tem divs sem fecho (a versão acabou noutro wrapper ou no fim do texto). */
  desequilibrado: boolean;
}

/**
 * Os embrulhos olv-versao de NÍVEL DO TOPO (um dentro de outro div qualquer não conta), tolerando html
 * desequilibrado: um wrapper que aparece com outro ainda aberto fecha-o (um `<div>` sem fecho numa versão não
 * engole as seguintes) e um `</div>` a mais fecha a versão mais cedo, sem perder o texto que sobra.
 */
function encontrarEmbrulhos(texto: string): Embrulho[] {
  const out: Embrulho[] = [];
  const estado: { fora: number; atual: { codigo: string; inicio: number; innerInicio: number; prof: number } | null } = { fora: 0, atual: null };
  const fechar = (innerFim: number, fim: number, desequilibrado: boolean) => {
    const a = estado.atual;
    if (a) out.push({ codigo: a.codigo, inicio: a.inicio, innerInicio: a.innerInicio, innerFim, fim, desequilibrado });
    estado.atual = null;
  };
  for (const m of texto.matchAll(RE_TAG_DIV)) {
    const indice = m.index ?? 0;
    if (m[1] !== "/") {
      const codigo = codigoDoEmbrulho(m[0]);
      const novo = codigo ? { codigo, inicio: indice, innerInicio: indice + m[0].length, prof: 1 } : null;
      if (estado.atual) {
        if (novo) {
          fechar(indice, indice, estado.atual.prof > 1);
          estado.atual = novo;
        } else {
          estado.atual.prof += 1;
        }
      } else if (estado.fora === 0 && novo) {
        estado.atual = novo;
      } else {
        estado.fora += 1;
      }
    } else if (estado.atual) {
      estado.atual.prof -= 1;
      if (estado.atual.prof === 0) fechar(indice, indice + m[0].length, false);
    } else if (estado.fora > 0) {
      estado.fora -= 1;
    }
  }
  if (estado.atual) fechar(texto.length, texto.length, estado.atual.prof > 1);
  return out;
}

/** Tira os `</div>` que não fecham nenhum `<div>` do próprio texto (restos de um wrapper fechado mais cedo). */
function semFechosSoltos(texto: string): string {
  let aberto = 0;
  return texto.replace(RE_TAG_DIV, (tag, barra: string) => {
    if (barra !== "/") {
      aberto += 1;
      return tag;
    }
    if (aberto === 0) return "";
    aberto -= 1;
    return tag;
  });
}

/** Equilibra o html pelo parser (só para versões com divs sem fecho; sem DOM, fica como está). */
function equilibrar(html: string): string {
  if (typeof document === "undefined") return html;
  const modelo = document.createElement("template");
  modelo.innerHTML = html;
  return modelo.innerHTML;
}

/**
 * Divide um corpo composto pelas marcas olv-versao. Sem marcas (corpo antigo, de uma só língua) é UM segmento,
 * no idioma `base` (português por omissão), com o html intacto. Texto solto fora das versões não se perde:
 * junta-se à versão vizinha. Html desequilibrado devolve as versões mesmo assim.
 */
export function dividirEmVersoes(html: string | null | undefined, base: string = IDIOMA_BASE): VersaoDoCorpo[] {
  const texto = typeof html === "string" ? html : "";
  const embrulhos = encontrarEmbrulhos(texto);
  if (embrulhos.length === 0) return [{ codigo: normalizarCodigo(base) ?? IDIOMA_BASE, html: texto }];

  const segmentos: VersaoDoCorpo[] = embrulhos.map((e) => {
    const dentro = texto.slice(e.innerInicio, e.innerFim);
    return { codigo: e.codigo, html: e.desequilibrado ? equilibrar(dentro) : dentro };
  });
  const antes = texto.slice(0, embrulhos[0].inicio);
  if (antes.trim()) segmentos[0].html = antes + segmentos[0].html;
  embrulhos.forEach((e, i) => {
    const seguinte = i + 1 < embrulhos.length ? embrulhos[i + 1].inicio : texto.length;
    const solto = semFechosSoltos(texto.slice(e.fim, seguinte));
    if (solto.trim()) segmentos[i].html += solto;
  });
  return segmentos;
}

function embrulhar(codigo: string, html: string, novaPagina: boolean): string {
  const estilo = novaPagina ? ` style="${ESTILO_NOVA_PAGINA}"` : "";
  return `<div class="olv-versao olv-versao-${codigo}"${estilo}>${html}</div>`;
}

/**
 * O corpo do contrato nos idiomas escolhidos (só os que o modelo tem; a ordem é a do registo, português primeiro).
 * Com mais de um idioma, o bloco de assinatura sai de todas as versões menos da última que o tem, e antes
 * desse entra a frase bilingue «esta assinatura vale para as duas versões».
 */
export function comporCorpoDoContrato(
  template: TemplateContratoLike | null | undefined,
  escolha: unknown,
): string {
  if (!template) return "";
  const corpoBase = typeof template.body_html === "string" ? template.body_html : "";
  const base = idiomaBaseDoTemplate(template);
  const disponiveis = idiomasDisponiveisContrato(template);
  const idiomas = ordenarPorRegisto(parseEscolha(escolha, base).filter((c) => disponiveis.includes(c)));
  if (idiomas.length === 0 || (idiomas.length === 1 && idiomas[0] === base)) return corpoBase;

  const versoes = lerVersoes(template.doc_settings, base);
  let corpos = idiomas.map((codigo) => ({
    codigo,
    html: codigo === base ? corpoBase : String(versoes[codigo]?.body_html ?? ""),
  }));

  // Uma versão em branco (corpo base vazio com a versão inglesa cheia) não gera uma página só com cabeçalho.
  const comTexto = corpos.filter((c) => c.html.trim() !== "");
  if (comTexto.length > 0 && comTexto.length < corpos.length) corpos = comTexto;

  if (corpos.length > 1) {
    const codigos = corpos.map((c) => c.codigo);
    const comBloco = corpos.map((c) => temBlocoDeAssinatura(c.html, c.codigo));
    const ultimoIdx = corpos.length - 1;
    // Só se remove o que sobra se se identificar COM CERTEZA a assinatura que fica: quando a última versão não
    // tem expressões de assinatura (es, fr) nem marcas, não se sabe onde está a sua, e não se mexe em nenhuma.
    const ultimoNaoIdentificavel = !comBloco[ultimoIdx] && !temFrasesDeAssinatura(codigos[ultimoIdx]);
    const ultimo = comBloco.lastIndexOf(true);
    if (ultimo >= 0 && !ultimoNaoIdentificavel) {
      corpos = corpos.map((c, i) => {
        if (i < ultimo && comBloco[i]) return { ...c, html: removerBlocoDeAssinatura(c.html, c.codigo).html };
        if (i === ultimo) return { ...c, html: inserirAntesDoBlocoDeAssinatura(c.html, htmlDaAssinaturaUnica(codigos), c.codigo).html };
        return c;
      });
    }
  }
  return corpos.map((c, i) => embrulhar(c.codigo, c.html, i > 0)).join("\n");
}
