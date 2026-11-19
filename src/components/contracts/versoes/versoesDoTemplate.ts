// Operações PURAS sobre as versões por idioma de uma minuta de contrato (client_contract_templates).
//
// Onde ficam as versões: doc_settings.versions.<codigo> (ver src/lib/idiomaDocumento/versoes.ts). O texto base
// são os campos de sempre (body_html e doc_settings). Nada aqui muda o objeto recebido: devolve cópias, e só
// escreve a chave `versions` quando existem versões. Chaves desconhecidas (de doc_settings e das próprias
// versões) passam intactas.

import {
  IDIOMAS,
  ROTULOS_CABECALHO,
  SUBTITULO_CABECALHO,
  calcularBaseHashDoTemplate,
  idiomaBaseDoTemplate,
  lerVersoes,
  normalizarCodigo,
  ordenarPorRegisto,
} from "@/lib/idiomaDocumento";
import { ehObjeto, mesmoTexto, naoVazio, temTexto, textoSimples } from "@/lib/idiomaDocumento/texto";
import { readQuoteItemsChipConfig, upsertQuoteItemsChipInHtml } from "@/components/contracts/TableInsertPopover";

type Obj = Record<string, unknown>;

export interface EstadoMinuta {
  language?: string | null;
  body_html: string;
  doc_settings: Obj | null;
}

export interface CamposDaMinuta {
  body_html: string;
  doc_settings: Obj | null;
}

/** O que uma versão pode traduzir no «Layout da Minuta»: rótulos e subtítulo do cabeçalho, rodapé e título da tabela. */
export const CHAVES_TRADUZIVEIS = [...ROTULOS_CABECALHO, SUBTITULO_CABECALHO, "footer_text", "quote_items_title"] as const;

const ROTULOS_SECUNDARIOS = ROTULOS_CABECALHO.filter((k) => k !== "contract_block_title");

function docSettings(m: EstadoMinuta): Obj {
  return m.doc_settings ?? {};
}

function versoesBrutas(m: EstadoMinuta): Obj {
  const v = docSettings(m).versions;
  return ehObjeto(v) ? v : {};
}

function versaoBruta(m: EstadoMinuta, codigo: string): Obj | undefined {
  const v = versoesBrutas(m)[codigo];
  return ehObjeto(v) ? v : undefined;
}

/** doc_settings com as `versions` dadas: sem versões a chave desaparece; sem nada, volta a null. */
function comVersoes(m: EstadoMinuta, versions: Obj): Obj | null {
  const novo: Obj = { ...docSettings(m) };
  delete novo.versions;
  if (Object.keys(versions).length > 0) novo.versions = versions;
  return Object.keys(novo).length === 0 ? null : novo;
}

function atualizarVersao(m: EstadoMinuta, codigo: string, alterar: (v: Obj) => Obj): Obj | null {
  const atual = versaoBruta(m, codigo);
  if (!atual) return m.doc_settings;
  return comVersoes(m, { ...versoesBrutas(m), [codigo]: alterar(atual) });
}

/** Códigos das versões existentes (sem o base), pela ordem do registo. */
export function codigosDasVersoes(m: EstadoMinuta): string[] {
  return ordenarPorRegisto(Object.keys(lerVersoes(m.doc_settings, idiomaBaseDoTemplate(m))));
}

/** Idiomas do registo que ainda se podem acrescentar (nem o base nem os que já existem). */
export function idiomasPorAdicionar(m: EstadoMinuta): string[] {
  const base = idiomaBaseDoTemplate(m);
  const existentes = codigosDasVersoes(m);
  return IDIOMAS.map((i) => i.codigo).filter((c) => c !== base && !existentes.includes(c));
}

/**
 * O que o editor mostra no idioma `codigo`: o corpo e o doc_settings visto pelo painel de layout.
 * No idioma base são os próprios dados (mesmas referências). Numa versão, os textos traduzíveis vêm da
 * versão (vazios quando não existem) e tudo o resto continua a ser o do base.
 */
export function camposDoIdioma(m: EstadoMinuta, codigo: string): { body_html: string; settings: Obj | null } {
  const c = normalizarCodigo(codigo);
  const v = c && c !== idiomaBaseDoTemplate(m) ? versaoBruta(m, c) : undefined;
  if (!v) return { body_html: m.body_html, settings: m.doc_settings };

  const cabecalho = ehObjeto(v.header) ? v.header : {};
  const settings: Obj = { ...docSettings(m) };
  for (const k of ROTULOS_CABECALHO) settings[k] = naoVazio(cabecalho[k]) ? cabecalho[k] : "";
  // O subtítulo ausente na versão cai no do base (é o que o render faz); presente (mesmo null) manda.
  if (SUBTITULO_CABECALHO in cabecalho) settings[SUBTITULO_CABECALHO] = cabecalho[SUBTITULO_CABECALHO] ?? null;
  settings.footer_text = naoVazio(v.footer_text) ? v.footer_text : "";
  settings.quote_items_title = naoVazio(v.quote_items_title) ? v.quote_items_title : "";
  return { body_html: typeof v.body_html === "string" ? v.body_html : "", settings };
}

/**
 * Escreve o corpo no idioma `codigo`. Editar a versão NÃO mexe no base_hash: o aviso «o português mudou» só
 * desaparece com `marcarRevisto` (ou ao criar a versão), nunca a cada tecla.
 */
export function escreverCorpo(m: EstadoMinuta, codigo: string, html: string): CamposDaMinuta {
  const c = normalizarCodigo(codigo);
  if (!c || c === idiomaBaseDoTemplate(m)) return { body_html: html, doc_settings: m.doc_settings };
  return { body_html: m.body_html, doc_settings: atualizarVersao(m, c, (v) => ({ ...v, body_html: html })) };
}

function aplicarTextoNaVersao(v: Obj, next: Obj, mudou: readonly string[]): Obj {
  const novo: Obj = { ...v };
  const cabecalho: Obj = ehObjeto(v.header) ? { ...v.header } : {};
  for (const k of ROTULOS_CABECALHO) {
    if (!mudou.includes(k)) continue;
    if (naoVazio(next[k])) cabecalho[k] = next[k];
    else delete cabecalho[k];
  }
  if (mudou.includes(SUBTITULO_CABECALHO)) cabecalho[SUBTITULO_CABECALHO] = naoVazio(next[SUBTITULO_CABECALHO]) ? next[SUBTITULO_CABECALHO] : null;
  if (Object.keys(cabecalho).length > 0) novo.header = cabecalho;
  else delete novo.header;

  for (const k of ["footer_text", "quote_items_title"] as const) {
    if (!mudou.includes(k)) continue;
    if (naoVazio(next[k])) novo[k] = next[k];
    else delete novo[k];
  }

  // O título dentro do bloco da tabela do corpo manda sobre o das definições: mantê-los iguais.
  if (mudou.includes("quote_items_title") && typeof novo.body_html === "string") {
    const cfg = readQuoteItemsChipConfig(novo.body_html);
    if (cfg) novo.body_html = upsertQuoteItemsChipInHtml(novo.body_html, { ...cfg, title: naoVazio(next.quote_items_title) ? next.quote_items_title : "" }, true);
  }
  return novo;
}

/**
 * Aplica o que o painel de layout devolveu. No idioma base é o doc_settings inteiro (vazio = null, como
 * sempre). Numa versão só contam os textos traduzíveis: o que é comum (cores, margens, estilo…) é ignorado.
 */
export function escreverSettings(m: EstadoMinuta, codigo: string, next: Obj | null): CamposDaMinuta {
  const c = normalizarCodigo(codigo);
  if (!c || c === idiomaBaseDoTemplate(m) || !versaoBruta(m, c)) {
    const vazio = !next || Object.keys(next).length === 0;
    return { body_html: m.body_html, doc_settings: vazio ? null : next };
  }
  const atual = (camposDoIdioma(m, c).settings ?? {}) as Obj;
  const proximo = next ?? {};
  const mudou = CHAVES_TRADUZIVEIS.filter((k) => proximo[k] !== atual[k]);
  if (mudou.length === 0) return { body_html: m.body_html, doc_settings: m.doc_settings };
  return { body_html: m.body_html, doc_settings: atualizarVersao(m, c, (v) => aplicarTextoNaVersao(v, proximo, mudou)) };
}

/** A versão inicial: uma cópia do texto base (só o que o base tem) ou uma versão vazia. */
function versaoInicial(m: EstadoMinuta, copiar: boolean): Obj {
  const hash = calcularBaseHashDoTemplate(m);
  if (!copiar) return { body_html: "", base_hash: hash };

  const ds = docSettings(m);
  const cabecalho: Obj = {};
  for (const k of [...ROTULOS_CABECALHO, SUBTITULO_CABECALHO]) if (naoVazio(ds[k])) cabecalho[k] = ds[k];
  const v: Obj = { body_html: m.body_html };
  if (Object.keys(cabecalho).length > 0) v.header = cabecalho;
  if (naoVazio(ds.footer_text)) v.footer_text = ds.footer_text;
  if (naoVazio(ds.quote_items_title)) v.quote_items_title = ds.quote_items_title;
  v.base_hash = hash;
  return v;
}

/** Acrescenta a versão `codigo`. Já existente, igual ao base ou desconhecida: devolve a mesma referência. */
export function adicionarVersao<T extends EstadoMinuta>(m: T, codigo: string, copiar: boolean): T {
  const c = normalizarCodigo(codigo);
  if (!c || c === idiomaBaseDoTemplate(m) || versaoBruta(m, c)) return m;
  return { ...m, doc_settings: comVersoes(m, { ...versoesBrutas(m), [c]: versaoInicial(m, copiar) }) };
}

/** Tira a versão `codigo`. Sem ela, devolve a mesma referência. */
export function removerVersao<T extends EstadoMinuta>(m: T, codigo: string): T {
  const c = normalizarCodigo(codigo);
  if (!c || !versaoBruta(m, c)) return m;
  const versions = { ...versoesBrutas(m) };
  delete versions[c];
  return { ...m, doc_settings: comVersoes(m, versions) };
}

/** Dá a versão por revista contra o texto base de agora (apaga o aviso «o português mudou»). */
export function marcarRevisto<T extends EstadoMinuta>(m: T, codigo: string): T {
  const c = normalizarCodigo(codigo);
  if (!c || !versaoBruta(m, c)) return m;
  const hash = calcularBaseHashDoTemplate(m);
  return { ...m, doc_settings: atualizarVersao(m, c, (v) => ({ ...v, base_hash: hash })) };
}

export type ChaveDeVerificacao = "corpo" | "titulo_cabecalho" | "rodape" | "tabela" | "rotulos";
export type EstadoDeVerificacao = "traduzido" | "igual" | "falta";

export interface LinhaDeVerificacao {
  chave: ChaveDeVerificacao;
  estado: EstadoDeVerificacao;
  /** O texto no idioma base (sem tags), para mostrar ao lado. */
  textoBase: string;
  textoVersao: string;
  /** Quantos textos ainda faltam nesta linha (a dos «outros rótulos» pode ter mais do que um). */
  pendentes: number;
}

function estadoDoTexto(base: unknown, versao: unknown): EstadoDeVerificacao {
  if (!naoVazio(versao)) return "falta";
  return mesmoTexto(versao, base) ? "igual" : "traduzido";
}

const CAMPO_DA_LINHA: Record<Exclude<ChaveDeVerificacao, "rotulos">, string> = {
  corpo: "corpo",
  titulo_cabecalho: "contract_block_title",
  rodape: "footer_text",
  tabela: "quote_items_title",
};

/**
 * O campo para onde um item da lista de verificação leva: `corpo` ou a chave do doc_settings. Os «outros
 * rótulos» levam ao primeiro que ainda falta traduzir (ou, se estão todos feitos, ao primeiro que o base tem).
 */
export function alvoDaLinha(m: EstadoMinuta, codigo: string, chave: ChaveDeVerificacao): string {
  if (chave !== "rotulos") return CAMPO_DA_LINHA[chave];
  const ds = docSettings(m);
  const c = normalizarCodigo(codigo);
  const v = c ? versaoBruta(m, c) : undefined;
  const cabecalho = v && ehObjeto(v.header) ? v.header : {};
  const presentes = ROTULOS_SECUNDARIOS.filter((k) => naoVazio(ds[k]));
  return presentes.find((k) => estadoDoTexto(ds[k], cabecalho[k]) !== "traduzido") ?? presentes[0] ?? ROTULOS_SECUNDARIOS[0];
}

function linhaSimples(chave: ChaveDeVerificacao, base: unknown, versao: unknown): LinhaDeVerificacao | null {
  if (!naoVazio(base)) return null;
  const estado = estadoDoTexto(base, versao);
  return { chave, estado, textoBase: base, textoVersao: typeof versao === "string" ? versao : "", pendentes: estado === "traduzido" ? 0 : 1 };
}

/**
 * A lista de verificação da versão `codigo`: Corpo, Título do cabeçalho, Rodapé, Título da tabela e os outros
 * rótulos do cabeçalho. Só aparecem as linhas em que o texto base existe (o corpo aparece sempre).
 * No idioma base devolve vazio.
 */
export function linhasDeVerificacao(m: EstadoMinuta, codigo: string): LinhaDeVerificacao[] {
  const c = normalizarCodigo(codigo);
  const v = c && c !== idiomaBaseDoTemplate(m) ? versaoBruta(m, c) : undefined;
  if (!v) return [];

  const ds = docSettings(m);
  const cabecalho = ehObjeto(v.header) ? v.header : {};
  const corpoEstado: EstadoDeVerificacao = !temTexto(v.body_html) ? "falta" : mesmoTexto(v.body_html, m.body_html) ? "igual" : "traduzido";
  const linhas: Array<LinhaDeVerificacao | null> = [
    {
      chave: "corpo",
      estado: corpoEstado,
      textoBase: textoSimples(m.body_html),
      textoVersao: textoSimples(v.body_html),
      pendentes: corpoEstado === "traduzido" ? 0 : 1,
    },
    linhaSimples("titulo_cabecalho", ds.contract_block_title, cabecalho.contract_block_title),
    linhaSimples("rodape", ds.footer_text, v.footer_text),
    linhaSimples("tabela", ds.quote_items_title, v.quote_items_title),
  ];

  const presentes = ROTULOS_SECUNDARIOS.filter((k) => naoVazio(ds[k]));
  if (presentes.length > 0) {
    const estados = presentes.map((k) => estadoDoTexto(ds[k], cabecalho[k]));
    const pendentes = estados.filter((e) => e !== "traduzido").length;
    linhas.push({
      chave: "rotulos",
      estado: estados.includes("falta") ? "falta" : pendentes > 0 ? "igual" : "traduzido",
      textoBase: presentes.map((k) => String(ds[k])).join(" · "),
      textoVersao: presentes.map((k) => (naoVazio(cabecalho[k]) ? String(cabecalho[k]) : "")).filter(Boolean).join(" · "),
      pendentes,
    });
  }
  return linhas.filter((l): l is LinhaDeVerificacao => l !== null);
}
