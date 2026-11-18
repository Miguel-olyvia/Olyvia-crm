// Versões por idioma dentro de UM só template.
//
// Contratos:  client_contract_templates.doc_settings.versions.<codigo>
// Propostas:  proposal_templates.design_settings.versions.<codigo>
// O português é a base implícita (os campos de sempre). Sem versões, tudo sai como hoje: as funções
// «aplicar» devolvem a MESMA referência que receberam.

import { IDIOMA_BASE, normalizarCodigo, ordenarPorRegisto } from "./registo";
import { ehObjeto, naoVazio, temTexto } from "./texto";

export interface TemplateContratoLike {
  language?: string | null;
  body_html?: string | null;
  doc_settings?: Record<string, unknown> | null;
}

export interface TemplatePropostaLike {
  language?: string | null;
  sections?: unknown;
  design_settings?: Record<string, unknown> | null;
}

/** Rótulos do bloco «Contrato» do cabeçalho: sem tradução própria, caem no dicionário (null). */
export const ROTULOS_CABECALHO = [
  "contract_block_title",
  "contract_block_number_label",
  "contract_block_date_label",
  "contract_block_commercial_label",
] as const;
export const SUBTITULO_CABECALHO = "contract_block_subtitle";

/** Textos da proposta guardados em colunas do template. */
export const TEXTOS_PROPOSTA = [
  "header_text",
  "footer_text",
  "terms_conditions",
  "thank_you_message",
  "email_subject",
  "email_body",
  "verification_email_subject",
  "verification_email_body",
] as const;
/** Textos da proposta guardados dentro de design_settings. */
export const TEXTOS_PROPOSTA_DESIGN = ["accept_button_text", "reject_button_text"] as const;
/** O que uma versão pode sobrepor numa secção (por id). */
export const CAMPOS_DE_SECCAO = ["customTitle", "sectionLabel", "content"] as const;

export function idiomaBaseDoTemplate(template: { language?: string | null } | null | undefined): string {
  return normalizarCodigo(template?.language) ?? IDIOMA_BASE;
}

/** Todas as versões registadas (≠ base) guardadas em `container.versions`, só as que são objetos. */
export function lerVersoes(container: unknown, base: string): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  const versions = ehObjeto(container) ? container.versions : undefined;
  if (!ehObjeto(versions)) return out;
  for (const [chave, valor] of Object.entries(versions)) {
    const c = normalizarCodigo(chave);
    if (c && c !== base && ehObjeto(valor)) out[c] = valor;
  }
  return out;
}

function versaoDoContrato(template: TemplateContratoLike, codigo: string): Record<string, unknown> | undefined {
  const v = lerVersoes(template.doc_settings, idiomaBaseDoTemplate(template))[codigo];
  return v && temTexto(v.body_html) ? v : undefined;
}

/** Idiomas em que o contrato pode ser gerado: o base mais as versões com texto no corpo. */
export function idiomasDisponiveisContrato(template: TemplateContratoLike | null | undefined): string[] {
  const base = idiomaBaseDoTemplate(template);
  if (!template) return [base];
  const extra = Object.keys(lerVersoes(template.doc_settings, base)).filter((c) => versaoDoContrato(template, c));
  return ordenarPorRegisto([base, ...extra]);
}

/** Idiomas em que a proposta pode ser gerada: o base mais as versões que existem (a chave basta). */
export function idiomasDisponiveisProposta(template: TemplatePropostaLike | null | undefined): string[] {
  const base = idiomaBaseDoTemplate(template);
  if (!template) return [base];
  return ordenarPorRegisto([base, ...Object.keys(lerVersoes(template.design_settings, base))]);
}

/**
 * O que a versão `codigo` sobrepõe às definições (doc_settings) da base: os rótulos e o subtítulo do cabeçalho
 * (o que a versão não traz fica a null e cai no dicionário, nunca no português), o título da tabela de artigos e,
 * se a versão tiver, o rodapé. null se não houver versão para aplicar. Quem espalha extra_settings por cima das
 * colunas deve aplicar isto DEPOIS, para que o português do extra_settings não anule a versão.
 */
export function sobreposicaoDaVersaoContrato(template: TemplateContratoLike, codigo: string): Record<string, unknown> | null {
  const c = normalizarCodigo(codigo);
  if (!template || !c || c === idiomaBaseDoTemplate(template)) return null;
  const v = versaoDoContrato(template, c);
  if (!v) return null;

  const cabecalho = ehObjeto(v.header) ? v.header : {};
  const sobre: Record<string, unknown> = {};
  for (const chave of [...ROTULOS_CABECALHO, SUBTITULO_CABECALHO]) sobre[chave] = naoVazio(cabecalho[chave]) ? cabecalho[chave] : null;
  if (naoVazio(v.footer_text)) sobre.footer_text = v.footer_text;
  sobre.quote_items_title = naoVazio(v.quote_items_title) ? v.quote_items_title : null;
  return sobre;
}

/** O template com a versão `codigo` aplicada; a MESMA referência se não houver nada a aplicar. */
export function aplicarVersaoContrato<T extends TemplateContratoLike>(template: T, codigo: string): T {
  const sobre = sobreposicaoDaVersaoContrato(template, codigo);
  const c = normalizarCodigo(codigo);
  const v = sobre && c ? versaoDoContrato(template, c) : undefined;
  if (!sobre || !v) return template;
  return { ...template, body_html: v.body_html as string, doc_settings: { ...(template.doc_settings ?? {}), ...sobre } };
}

function sobreporSeccao(seccao: unknown, porId: Record<string, unknown>): unknown {
  if (!ehObjeto(seccao) || typeof seccao.id !== "string") return seccao;
  const ov = porId[seccao.id];
  if (!ehObjeto(ov)) return seccao;
  const settings: Record<string, unknown> = ehObjeto(seccao.settings) ? { ...seccao.settings } : {};
  let mudou = false;
  for (const chave of CAMPOS_DE_SECCAO) {
    if (naoVazio(ov[chave])) {
      settings[chave] = ov[chave];
      mudou = true;
    }
  }
  const label = naoVazio(ov.label) ? ov.label : seccao.label;
  if (label !== seccao.label) mudou = true;
  return mudou ? { ...seccao, label, settings } : seccao;
}

/** A proposta com a versão `codigo` aplicada; a MESMA referência se não houver nada a aplicar. */
export function aplicarVersaoProposta<T extends TemplatePropostaLike>(template: T, codigo: string): T {
  const c = normalizarCodigo(codigo);
  if (!template || !c || c === idiomaBaseDoTemplate(template)) return template;
  const v = lerVersoes(template.design_settings, idiomaBaseDoTemplate(template))[c];
  if (!v) return template;

  const resultado = { ...template } as Record<string, unknown>;
  for (const chave of TEXTOS_PROPOSTA) if (naoVazio(v[chave])) resultado[chave] = v[chave];

  const design: Record<string, unknown> = { ...(template.design_settings ?? {}) };
  for (const chave of TEXTOS_PROPOSTA_DESIGN) if (naoVazio(v[chave])) design[chave] = v[chave];
  resultado.design_settings = design;

  if (ehObjeto(v.sections) && Array.isArray(template.sections)) {
    const porId = v.sections;
    resultado.sections = template.sections.map((s) => sobreporSeccao(s, porId));
  }
  return resultado as T;
}
