// «O que falta traduzir» e «o português mudou desde esta versão».
//
// Falta traduzir tudo o que o texto base tem e a versão não tem (vazio) ou tem igual ao base (cópia sem
// tags). O base_hash só serve para avisar que o português mudou depois de a versão ser escrita.

import { normalizarCodigo } from "./registo";
import { ehObjeto, mesmoTexto, naoVazio, temTexto } from "./texto";
import {
  CAMPOS_DE_SECCAO,
  ROTULOS_CABECALHO,
  TEXTOS_PROPOSTA,
  TEXTOS_PROPOSTA_DESIGN,
  idiomaBaseDoTemplate,
  lerVersoes,
} from "./versoes";

export interface Completude {
  codigo: string;
  completo: boolean;
  /** Chaves por traduzir, p.ex. `body_html`, `header.contract_block_title`, `sections.terms.sectionLabel`. */
  faltam: string[];
  /** A versão tem um base_hash e o texto base já não é aquele. */
  desatualizado: boolean;
}

type Objeto = Record<string, unknown>;

/** Hash curto e determinístico (FNV-1a de 32 bits, em 8 caracteres hexadecimais). Não é criptográfico. */
export function calcularBaseHash(texto: string | null | undefined): string {
  let h = 0x811c9dc5;
  const s = typeof texto === "string" ? texto : "";
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function ehContrato(template: Objeto | null): boolean {
  return template === null || "body_html" in template;
}

function seccoesVisiveis(template: Objeto): Objeto[] {
  return Array.isArray(template.sections) ? template.sections.filter((s): s is Objeto => ehObjeto(s) && s.visible !== false && typeof s.id === "string") : [];
}

/** O par (campo, texto base) de cada texto traduzível de uma secção visível. */
function camposDaSeccao(seccao: Objeto): Array<[string, string]> {
  const settings = ehObjeto(seccao.settings) ? seccao.settings : {};
  const campos: Array<[string, unknown]> =
    seccao.type === "custom"
      ? [["label", seccao.label], ["content", settings.content]]
      : CAMPOS_DE_SECCAO.filter((c) => c !== "content").map((c): [string, unknown] => [c, settings[c]]);
  return campos.filter((c): c is [string, string] => naoVazio(c[1]));
}

/** O texto base de que depende o base_hash: o corpo do contrato, ou os textos da proposta. */
function textoBase(template: Objeto | null): string {
  if (template === null) return "";
  if (ehContrato(template)) return typeof template.body_html === "string" ? template.body_html : "";
  const design = ehObjeto(template.design_settings) ? template.design_settings : {};
  const partes: unknown[] = [
    ...TEXTOS_PROPOSTA.map((k) => template[k]),
    ...TEXTOS_PROPOSTA_DESIGN.map((k) => design[k]),
    ...seccoesVisiveis(template).map((s) => [s.id, camposDaSeccao(s)]),
  ];
  return JSON.stringify(partes);
}

export function calcularBaseHashDoTemplate(template: object | null | undefined): string {
  return calcularBaseHash(textoBase((template ?? null) as Objeto | null));
}

function emFalta(base: unknown, versao: unknown): boolean {
  return naoVazio(base) && (!naoVazio(versao) || mesmoTexto(versao, base));
}

function faltamNoContrato(template: Objeto | null, v: Objeto): string[] {
  const ds = template && ehObjeto(template.doc_settings) ? template.doc_settings : {};
  const cabecalho = ehObjeto(v.header) ? v.header : {};
  const faltam: string[] = [];
  if (!temTexto(v.body_html) || mesmoTexto(v.body_html, template?.body_html)) faltam.push("body_html");
  for (const k of ROTULOS_CABECALHO) if (emFalta(ds[k], cabecalho[k])) faltam.push(`header.${k}`);
  if (emFalta(ds.footer_text, v.footer_text)) faltam.push("footer_text");
  if (emFalta(ds.quote_items_title, v.quote_items_title)) faltam.push("quote_items_title");
  return faltam;
}

function faltamNaProposta(template: Objeto, v: Objeto): string[] {
  const design = ehObjeto(template.design_settings) ? template.design_settings : {};
  const faltam: string[] = [];
  for (const k of TEXTOS_PROPOSTA) if (emFalta(template[k], v[k])) faltam.push(k);
  for (const k of TEXTOS_PROPOSTA_DESIGN) if (emFalta(design[k], v[k])) faltam.push(k);
  const porId = ehObjeto(v.sections) ? v.sections : {};
  for (const seccao of seccoesVisiveis(template)) {
    const id = seccao.id as string;
    const traduzida = ehObjeto(porId[id]) ? porId[id] : {};
    for (const [campo, base] of camposDaSeccao(seccao)) {
      if (emFalta(base, traduzida[campo])) faltam.push(`sections.${id}.${campo}`);
    }
  }
  return faltam;
}

/** O que falta traduzir na versão `codigo` de um template de contrato ou de proposta. O idioma base está sempre completo. */
export function calcularCompletude(template: object | null | undefined, codigo: string): Completude {
  const t = (template ?? null) as Objeto | null;
  const c = normalizarCodigo(codigo) ?? codigo;
  const base = idiomaBaseDoTemplate(t as { language?: string | null } | null);
  if (c === base) return { codigo: c, completo: true, faltam: [], desatualizado: false };

  const container = t ? (ehContrato(t) ? t.doc_settings : t.design_settings) : null;
  const v: Objeto = lerVersoes(container, base)[c] ?? {};
  const faltam = t !== null && !ehContrato(t) ? faltamNaProposta(t, v) : faltamNoContrato(t, v);
  const desatualizado = naoVazio(v.base_hash) && v.base_hash !== calcularBaseHashDoTemplate(t);
  return { codigo: c, completo: faltam.length === 0, faltam, desatualizado };
}
