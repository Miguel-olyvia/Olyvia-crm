// Versões por idioma de um template de proposta, do lado do editor.
//
// Funções puras e imutáveis sobre o mapa `versoes` (código -> versão) que vive em
// `proposal_templates.design_settings.versions`. O núcleo (`@/lib/idiomaDocumento`) sabe ler, aplicar e
// medir; aqui ficam as operações de edição: adicionar, escrever, remover, montar a pré-visualização e
// decidir o que se grava. O português é a base implícita e nunca entra neste mapa.

import {
  CAMPOS_DE_SECCAO,
  IDIOMAS,
  IDIOMA_BASE,
  TEXTOS_PROPOSTA,
  TEXTOS_PROPOSTA_DESIGN,
  aplicarVersaoProposta,
  calcularBaseHashDoTemplate,
  calcularCompletude,
  idiomasDisponiveisProposta,
  normalizarCodigo,
  type TemplatePropostaLike,
} from "@/lib/idiomaDocumento";

/** Código de idioma -> versão. Guarda o que lá estiver, mesmo códigos que o registo não conhece. */
export type Versoes = Record<string, unknown>;

type Objeto = Record<string, unknown>;

/** O que o editor tem do template e o núcleo precisa (todos os campos de texto são opcionais). */
export interface ConfigComTextos {
  sections: unknown[];
  header_text?: string | null;
  footer_text?: string | null;
  terms_conditions?: string | null;
  thank_you_message?: string | null;
  email_subject?: string | null;
  email_body?: string | null;
  verification_email_subject?: string | null;
  verification_email_body?: string | null;
  accept_button_text?: string | null;
  reject_button_text?: string | null;
}

export type ModeloProposta = TemplatePropostaLike & Objeto;

export type CampoDeSeccao = (typeof CAMPOS_DE_SECCAO)[number] | "label";
export type EstadoDoCampo = "traduzido" | "igual" | "falta";

export interface CampoDeVerificacao {
  /** Chave igual à de `calcularCompletude().faltam`, p.ex. `footer_text` ou `sections.terms.sectionLabel`. */
  chave: string;
  tipo: "texto" | "seccao";
  campo: string;
  seccaoId?: string;
  base: string;
  traduzido: string;
  estado: EstadoDoCampo;
}

export interface ResumoDeIdioma {
  codigo: string;
  faltam: number;
  completo: boolean;
  desatualizado: boolean;
}

/** Id do diálogo «Adicionar idioma» (o botão que o abre liga-se a ele por aria-controls). */
export const ID_DIALOGO_ADICIONAR_IDIOMA = "dialogo-adicionar-idioma";

/** Id do separador de um idioma na barra (o painel liga-se a ele por aria-labelledby). */
export function idDaAba(codigo: string): string {
  return `aba-idioma-${codigo}`;
}

function ehObjeto(valor: unknown): valor is Objeto {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function naoVazio(valor: unknown): valor is string {
  return typeof valor === "string" && valor.trim().length > 0;
}

function copiaProfunda<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T;
}

/**
 * Separa `versions` do resto do design_settings. O resto vai para o config do editor (como sempre foi) e as
 * versões para um estado próprio, para não poluírem o config nem o JSON do isDirty por engano.
 */
export function separarVersoes(designSettings: unknown): { restante: Objeto; versoes: Versoes } {
  if (!ehObjeto(designSettings)) return { restante: {}, versoes: {} };
  const { versions, ...restante } = designSettings;
  return { restante, versoes: ehObjeto(versions) ? copiaProfunda(versions) : {} };
}

/** O template como o núcleo o entende: textos nas colunas (vazio = null, como na base) e botões no design. */
export function modeloParaVersoes(config: ConfigComTextos, versoes: Versoes): ModeloProposta {
  const modelo: ModeloProposta = { sections: config.sections };
  for (const k of TEXTOS_PROPOSTA) modelo[k] = config[k] || null;
  const design: Objeto = {};
  for (const k of TEXTOS_PROPOSTA_DESIGN) design[k] = config[k];
  if (Object.keys(versoes).length > 0) design.versions = versoes;
  modelo.design_settings = design;
  return modelo;
}

/** O config com a versão `codigo` aplicada (para a pré-visualização); a MESMA referência se não houver nada a aplicar. */
export function configNoIdioma<C extends ConfigComTextos>(config: C, versoes: Versoes, codigo: string): C {
  const c = normalizarCodigo(codigo);
  if (!c || c === IDIOMA_BASE || !ehObjeto(versoes[c])) return config;
  const modelo = modeloParaVersoes(config, versoes);
  const resolvido = aplicarVersaoProposta(modelo, c);
  const desenho = resolvido.design_settings ?? {};
  const alterado: Objeto = { sections: resolvido.sections };
  for (const k of TEXTOS_PROPOSTA) if (resolvido[k] !== modelo[k]) alterado[k] = resolvido[k];
  for (const k of TEXTOS_PROPOSTA_DESIGN) if (desenho[k] !== modelo.design_settings?.[k]) alterado[k] = desenho[k];
  return { ...config, ...alterado } as C;
}

/** Os campos de uma secção que uma versão pode sobrepor (a mesma regra que o núcleo usa para medir). */
function camposDaSeccao(seccao: Objeto): Array<[string, unknown]> {
  const settings = ehObjeto(seccao.settings) ? seccao.settings : {};
  return seccao.type === "custom"
    ? [["label", seccao.label], ["content", settings.content]]
    : [["customTitle", settings.customTitle], ["sectionLabel", settings.sectionLabel]];
}

function seccoesComId(config: ConfigComTextos): Objeto[] {
  return config.sections.filter((s): s is Objeto => ehObjeto(s) && typeof s.id === "string");
}

function copiaDoPortugues(config: ConfigComTextos): Objeto {
  const copia: Objeto = {};
  for (const k of [...TEXTOS_PROPOSTA, ...TEXTOS_PROPOSTA_DESIGN]) if (naoVazio(config[k])) copia[k] = config[k];
  const porId: Record<string, Objeto> = {};
  for (const seccao of seccoesComId(config)) {
    const campos = camposDaSeccao(seccao).filter(([, valor]) => naoVazio(valor));
    if (campos.length > 0) porId[seccao.id as string] = Object.fromEntries(campos);
  }
  if (Object.keys(porId).length > 0) copia.sections = porId;
  return copia;
}

/** Cria a versão `codigo`. Código desconhecido, base ou já existente: o mesmo mapa. */
export function adicionarVersao(
  versoes: Versoes,
  codigo: string,
  config: ConfigComTextos,
  opcoes: { copiarPortugues: boolean },
): Versoes {
  const c = normalizarCodigo(codigo);
  if (!c || c === IDIOMA_BASE || ehObjeto(versoes[c])) return versoes;
  const nova: Objeto = { base_hash: calcularBaseHashDoTemplate(modeloParaVersoes(config, {})) };
  if (opcoes.copiarPortugues) Object.assign(nova, copiaDoPortugues(config));
  return { ...versoes, [c]: nova };
}

function atualizarVersao(versoes: Versoes, codigo: string, alterar: (v: Objeto) => Objeto): Versoes {
  const atual = versoes[codigo];
  if (!ehObjeto(atual)) return versoes;
  return { ...versoes, [codigo]: alterar(atual) };
}

function comOuSem(objeto: Objeto, chave: string, valor: unknown): Objeto {
  if (naoVazio(valor)) return { ...objeto, [chave]: valor };
  const { [chave]: _removida, ...resto } = objeto;
  return resto;
}

/** Escreve um texto da versão; vazio apaga a chave. */
export function definirTexto(versoes: Versoes, codigo: string, campo: string, valor: string): Versoes {
  return atualizarVersao(versoes, codigo, (v) => comOuSem(v, campo, valor));
}

/** Escreve um título (ou conteúdo) de uma secção na versão, por id; o que ficar vazio sai. */
export function definirCampoDeSeccao(
  versoes: Versoes,
  codigo: string,
  seccaoId: string,
  campo: CampoDeSeccao,
  valor: string,
): Versoes {
  return atualizarVersao(versoes, codigo, (v) => {
    const todas: Objeto = ehObjeto(v.sections) ? v.sections : {};
    const daSeccao = comOuSem(ehObjeto(todas[seccaoId]) ? todas[seccaoId] : {}, campo, valor);
    const { [seccaoId]: _antiga, ...outras } = todas;
    const novas = Object.keys(daSeccao).length > 0 ? { ...outras, [seccaoId]: daSeccao } : outras;
    const { sections: _s, ...resto } = v;
    return Object.keys(novas).length > 0 ? { ...resto, sections: novas } : resto;
  });
}

export function removerVersao(versoes: Versoes, codigo: string): Versoes {
  if (!(codigo in versoes)) return versoes;
  const { [codigo]: _removida, ...resto } = versoes;
  return resto;
}

/** «O português mudou» deixa de avisar: o base_hash passa a ser o do português de agora. */
export function marcarComoAtualizada(versoes: Versoes, codigo: string, config: ConfigComTextos): Versoes {
  return atualizarVersao(versoes, codigo, (v) => ({ ...v, base_hash: calcularBaseHashDoTemplate(modeloParaVersoes(config, {})) }));
}

/** Uma entrada por idioma não base que existe, pela ordem do registo. */
export function resumoDeIdiomas(config: ConfigComTextos, versoes: Versoes): ResumoDeIdioma[] {
  const modelo = modeloParaVersoes(config, versoes);
  return idiomasDisponiveisProposta(modelo)
    .filter((c) => c !== IDIOMA_BASE)
    .map((codigo) => {
      const comp = calcularCompletude(modelo, codigo);
      return { codigo, faltam: comp.faltam.length, completo: comp.completo, desatualizado: comp.desatualizado };
    });
}

/** Os idiomas do registo que ainda se podem acrescentar (nunca o base). */
export function idiomasQueFaltaAdicionar(versoes: Versoes): string[] {
  return IDIOMAS.map((i) => i.codigo).filter((c) => c !== IDIOMA_BASE && !ehObjeto(versoes[c]));
}

/** O design a gravar: `versions` só existe se houver versões; sem edição nenhuma, o design não muda. */
export function comVersoesNoDesign(design: Objeto, versoes: Versoes, original: Objeto | null | undefined): Objeto {
  if (Object.keys(versoes).length > 0) return { ...design, versions: versoes };
  const tinhaVersoes = ehObjeto(original) && ehObjeto(original.versions) && Object.keys(original.versions).length > 0;
  if (!tinhaVersoes) return design;
  const { versions: _removidas, ...resto } = design;
  return resto;
}

function estadoDoCampo(emFalta: boolean, traduzido: string): EstadoDoCampo {
  if (!emFalta) return "traduzido";
  return traduzido === "" ? "falta" : "igual";
}

/** Todos os textos com português, e se já estão traduzidos, iguais ao português ou em falta. */
export function listarCampos(config: ConfigComTextos, versoes: Versoes, codigo: string): CampoDeVerificacao[] {
  const c = normalizarCodigo(codigo);
  if (!c || c === IDIOMA_BASE) return [];
  const modelo = modeloParaVersoes(config, versoes);
  const faltam = new Set(calcularCompletude(modelo, c).faltam);
  const versao: Objeto = ehObjeto(versoes[c]) ? versoes[c] : {};
  const campos: CampoDeVerificacao[] = [];

  const desenho: Objeto = modelo.design_settings ?? {};
  for (const campo of [...TEXTOS_PROPOSTA, ...TEXTOS_PROPOSTA_DESIGN]) {
    const base = (TEXTOS_PROPOSTA as readonly string[]).includes(campo) ? modelo[campo] : desenho[campo];
    if (!naoVazio(base)) continue;
    const traduzido = naoVazio(versao[campo]) ? versao[campo] : "";
    campos.push({ chave: campo, tipo: "texto", campo, base, traduzido, estado: estadoDoCampo(faltam.has(campo), traduzido) });
  }

  const porId: Objeto = ehObjeto(versao.sections) ? versao.sections : {};
  for (const seccao of seccoesComId(config).filter((s) => s.visible !== false)) {
    const seccaoId = seccao.id as string;
    const daVersao: Objeto = ehObjeto(porId[seccaoId]) ? porId[seccaoId] : {};
    for (const [campo, base] of camposDaSeccao(seccao)) {
      if (!naoVazio(base)) continue;
      const chave = `sections.${seccaoId}.${campo}`;
      const traduzido = naoVazio(daVersao[campo]) ? daVersao[campo] : "";
      campos.push({ chave, tipo: "seccao", campo, seccaoId, base, traduzido, estado: estadoDoCampo(faltam.has(chave), traduzido) });
    }
  }
  return campos;
}

/** Para os cartões da lista de templates: os idiomas que a linha tem e os que estão incompletos. */
export function resumoDeIdiomasDoTemplate(linha: { sections?: unknown; design_settings?: unknown } | null | undefined): {
  idiomas: string[];
  incompletos: Array<{ codigo: string; faltam: number }>;
} {
  if (!linha) return { idiomas: [IDIOMA_BASE], incompletos: [] };
  const template = linha as TemplatePropostaLike;
  const idiomas = idiomasDisponiveisProposta(template);
  const incompletos = idiomas
    .filter((c) => c !== IDIOMA_BASE)
    .map((codigo) => ({ codigo, comp: calcularCompletude(linha, codigo) }))
    .filter(({ comp }) => !comp.completo)
    .map(({ codigo, comp }) => ({ codigo, faltam: comp.faltam.length }));
  return { idiomas, incompletos };
}
