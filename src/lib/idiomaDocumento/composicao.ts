// Compor e dividir o corpo de um contrato com várias versões de idioma.
//
// Só o idioma base: o body_html sai tal e qual (sem embrulho nenhum). Com outros idiomas, cada versão vai
// dentro de `<div class="olv-versao olv-versao-<codigo>">` (as seguintes com quebra de página) e a assinatura
// passa a ser UMA, no fim. Só classes: o sanitizador do HTML corta data-*.

import { htmlDaAssinaturaUnica, inserirAntesDoBlocoDeAssinatura, removerBlocoDeAssinatura, temBlocoDeAssinatura } from "./assinaturas";
import { parseEscolha } from "./escolha";
import { IDIOMA_BASE, normalizarCodigo, ordenarPorRegisto } from "./registo";
import { idiomaBaseDoTemplate, idiomasDisponiveisContrato, lerVersoes, type TemplateContratoLike } from "./versoes";

const ESTILO_NOVA_PAGINA = "break-before:page;page-break-before:always";
const RE_TAG_DIV = /<(\/?)div\b[^>]*>/gi;

export interface VersaoDoCorpo {
  codigo: string;
  html: string;
}

function codigoDoEmbrulho(tagAberta: string): string | null {
  const m = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tagAberta);
  const tokens = (m?.[1] ?? m?.[2] ?? "").split(/\s+/);
  if (!tokens.includes("olv-versao")) return null;
  for (const t of tokens) {
    const c = /^olv-versao-([a-z]{2})$/.exec(t);
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
}

/** Os embrulhos olv-versao de NÍVEL DO TOPO (um dentro de outro div qualquer não conta). */
function encontrarEmbrulhos(texto: string): Embrulho[] {
  const out: Embrulho[] = [];
  let profundidade = 0;
  let atual: Omit<Embrulho, "innerFim" | "fim"> | null = null;
  for (const m of texto.matchAll(RE_TAG_DIV)) {
    const indice = m.index ?? 0;
    if (m[1] !== "/") {
      if (profundidade === 0) {
        const codigo = codigoDoEmbrulho(m[0]);
        atual = codigo ? { codigo, inicio: indice, innerInicio: indice + m[0].length } : null;
      }
      profundidade += 1;
    } else if (profundidade > 0) {
      profundidade -= 1;
      if (profundidade === 0 && atual) {
        out.push({ ...atual, innerFim: indice, fim: indice + m[0].length });
        atual = null;
      }
    }
  }
  return out;
}

/**
 * Divide um corpo composto pelas marcas olv-versao. Sem marcas (corpo antigo, de uma só língua) é UM segmento,
 * no idioma `base` (português por omissão), com o html intacto. Texto solto fora das versões não se perde:
 * junta-se à versão vizinha.
 */
export function dividirEmVersoes(html: string | null | undefined, base: string = IDIOMA_BASE): VersaoDoCorpo[] {
  const texto = typeof html === "string" ? html : "";
  const embrulhos = encontrarEmbrulhos(texto);
  if (embrulhos.length === 0) return [{ codigo: normalizarCodigo(base) ?? IDIOMA_BASE, html: texto }];

  const segmentos: VersaoDoCorpo[] = embrulhos.map((e) => ({ codigo: e.codigo, html: texto.slice(e.innerInicio, e.innerFim) }));
  const antes = texto.slice(0, embrulhos[0].inicio);
  if (antes.trim()) segmentos[0].html = antes + segmentos[0].html;
  embrulhos.forEach((e, i) => {
    const seguinte = i + 1 < embrulhos.length ? embrulhos[i + 1].inicio : texto.length;
    const solto = texto.slice(e.fim, seguinte);
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

  if (idiomas.length > 1) {
    const comBloco = corpos.map((c) => temBlocoDeAssinatura(c.html, c.codigo));
    const ultimo = comBloco.lastIndexOf(true);
    if (ultimo >= 0) {
      corpos = corpos.map((c, i) => {
        if (i < ultimo && comBloco[i]) return { ...c, html: removerBlocoDeAssinatura(c.html, c.codigo).html };
        if (i === ultimo) return { ...c, html: inserirAntesDoBlocoDeAssinatura(c.html, htmlDaAssinaturaUnica(idiomas), c.codigo).html };
        return c;
      });
    }
  }
  return corpos.map((c, i) => embrulhar(c.codigo, c.html, i > 0)).join("\n");
}
