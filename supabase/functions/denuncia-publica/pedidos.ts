/**
 * Validacao dos pedidos da denuncia publica: LISTA BRANCA de campos (nada que o cliente
 * mande fora desta lista chega a base) e as mesmas regras de `lib/formulario.ts` do
 * prototipo. Modulo puro, sem Deno. A base volta a validar tudo (nao e a unica fronteira).
 *
 * CONTRATO (um so, para os tres lados; o SQL de 20261231994000 manda):
 *  - corpo de `criar` (cliente `corpoDeCriacao`): `modo`, os campos do formulario no topo,
 *    `impedidos` (ids de responsaveis visados, D3) e, so numa identificada, `identidade`
 *    = {nome, email, telefone, pode_contactar, so_responsavel} ANINHADA.
 *  - `p_dados` da RPC: so `anonima` (booleano, sempre) e os campos do formulario; nunca
 *    `origem` nem `impedidos` (a RPC recusa chaves desconhecidas). Os visados vao em
 *    `p_impedidos`.
 *  - a vista do denunciante que sai para o browser: ver `vistaDoDenunciante`.
 */

export const SLUG = /^[a-z0-9-]{4,40}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const TIPOS = ["assedio", "discriminacao", "corrupcao", "fraude", "seguranca", "dados", "conflito", "outro"] as const;
const TRES_VALORES = ["sim", "nao", "nao_sei"] as const;

export const DESCRICAO_MIN = 30;
export const DESCRICAO_MAX = 4000;
export const TEXTO_MAX = 4000;
const QUANDO_MIN = 2;
const QUANDO_MAX = 200;
const LIVRE_MAX = 1000;
const NOME_MAX = 200;
const EMAIL_MAX = 254;
const TELEFONE_MAX = 40;
export const IMPEDIDOS_MAX = 10;

export type Modo = "anonima" | "identificada";

export interface IdentidadePedida {
  nome: string | null;
  email: string | null;
  telefone: string | null;
  pode_contactar: boolean;
  so_responsavel: boolean;
}

export interface PedidoCriar {
  modo: Modo;
  /** Exactamente o `p_dados` da RPC: `anonima` e os campos do formulario. */
  dados: Record<string, unknown>;
  /** Os responsaveis que o denunciante indica como visados (D3): vao em `p_impedidos`. */
  impedidos: string[];
  /** Sempre `null` numa anonima: a identidade nao existe em lado nenhum. */
  identidade: IdentidadePedida | null;
}

type Objecto = Record<string, unknown>;

/** Texto aparado dentro de [min, max]; `undefined` se nao for texto ou estiver fora. */
function texto(v: unknown, min: number, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length >= min && t.length <= max ? t : undefined;
}

/** Texto opcional: ausente ou vazio => "" (ou `null` se `vazioNulo`); invalido => `undefined`. */
function opcional(v: unknown, max: number): string | undefined {
  if (v === undefined || v === null) return "";
  return texto(v, 0, max);
}

function umDe<T extends string>(v: unknown, validos: readonly T[], porOmissao: T): T | undefined {
  if (v === undefined || v === null) return porOmissao;
  return typeof v === "string" && (validos as readonly string[]).includes(v) ? (v as T) : undefined;
}

function validarImpedidos(v: unknown): string[] | undefined {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > IMPEDIDOS_MAX) return undefined;
  if (!v.every((x) => typeof x === "string" && UUID.test(x))) return undefined;
  return [...new Set(v as string[])];
}

/** A identidade vem ANINHADA em `identidade` (como o cliente a envia); ausente = toda vazia. */
function validarIdentidade(bruta: unknown): IdentidadePedida | undefined {
  if (bruta !== undefined && bruta !== null && !eObjecto(bruta)) return undefined;
  const p: Objecto = eObjecto(bruta) ? bruta : {};
  const nome = opcional(p.nome, NOME_MAX);
  const email = opcional(p.email, EMAIL_MAX);
  const telefone = opcional(p.telefone, TELEFONE_MAX);
  if (nome === undefined || email === undefined || telefone === undefined) return undefined;
  if (email !== "" && !EMAIL.test(email)) return undefined;
  const pode = p.pode_contactar ?? false;
  const soResp = p.so_responsavel ?? true;
  if (typeof pode !== "boolean" || typeof soResp !== "boolean") return undefined;
  if (pode && email === "" && telefone === "") return undefined;
  return {
    nome: nome || null,
    email: email || null,
    telefone: telefone || null,
    pode_contactar: pode,
    so_responsavel: soResp,
  };
}

/** O `p_dados` da RPC (sem `anonima`, que o modo decide). */
function validarDados(p: Objecto): Record<string, unknown> | undefined {
  const tipo = typeof p.tipo === "string" && (TIPOS as readonly string[]).includes(p.tipo) ? p.tipo : undefined;
  const descricao = texto(p.descricao, DESCRICAO_MIN, DESCRICAO_MAX);
  const quando = texto(p.quando, QUANDO_MIN, QUANDO_MAX);
  const onde = opcional(p.onde, LIVRE_MAX);
  const envolvidos = opcional(p.envolvidos, LIVRE_MAX);
  const jaReportado = opcional(p.ja_reportado, LIVRE_MAX);
  const ainda = umDe(p.ainda_acontece, TRES_VALORES, "nao_sei");
  const testemunhas = umDe(p.testemunhas, TRES_VALORES, "nao_sei");
  const completo = [tipo, descricao, quando, onde, envolvidos, jaReportado, ainda, testemunhas].every((x) => x !== undefined);
  if (!completo || p.boa_fe !== true) return undefined;
  return {
    tipo,
    descricao,
    quando,
    onde,
    envolvidos,
    ainda_acontece: ainda,
    testemunhas,
    ja_reportado: jaReportado,
    boa_fe: true,
  };
}

/** `null` quando o pedido nao serve. O resultado so tem campos da lista branca. */
export function validarCriar(p: Objecto): PedidoCriar | null {
  const modo = p.modo === "anonima" || p.modo === "identificada" ? p.modo : null;
  if (!modo) return null;
  const formulario = validarDados(p);
  const impedidos = validarImpedidos(p.impedidos);
  if (!formulario || !impedidos) return null;
  // O modo vai SEMPRE explicito para a base: sem ele a RPC recusa (nunca passa a anonima em silencio).
  const dados = { anonima: modo === "anonima", ...formulario };
  if (modo === "anonima") return { modo, dados, impedidos, identidade: null };
  const identidade = validarIdentidade(p.identidade);
  return identidade ? { modo, dados, impedidos, identidade } : null;
}

export function validarSlug(v: unknown): string | null {
  return typeof v === "string" && SLUG.test(v) ? v : null;
}

/** Texto da resposta do denunciante: 1 a 4000 caracteres depois de aparado. */
export function validarTextoResposta(v: unknown): string | null {
  return texto(v, 1, TEXTO_MAX) ?? null;
}

// -- vistas (o que o denunciante pode ver) ----------------------------------------------

/**
 * O que a base devolve (denuncias_vista_denunciante) e o que sai para o browser (o
 * `VistaDenuncianteDb` do cliente, src/lib/denuncias/canal.ts):
 *  - texto ou nulo, tal e qual: CAMPOS_VISTA;
 *  - `anonima`: so se for booleano;
 *  - `desfecho` {resultado, medidas} ou {arquivada} -> `resultado` e `medidas` no topo;
 *  - mensagens: {id, autor, texto, pedido_informacao, em} -> `em` sai como `criada_em`.
 */
const CAMPOS_VISTA = [
  "codigo", "estado", "tipo", "descricao", "quando", "onde", "recebida_em", "confirmada_em",
  "prazo_confirmar", "prazo_seguimento", "fechada_em",
] as const;
const CAMPOS_MENSAGEM = ["id", "autor", "texto"] as const;
const CAMPOS_DESFECHO = ["resultado", "medidas"] as const;

function eObjecto(v: unknown): v is Objecto {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function soTextoOuNulo(origem: Objecto, campos: readonly string[]): Objecto {
  const saida: Objecto = {};
  for (const c of campos) {
    const v = origem[c];
    if (typeof v === "string" || v === null) saida[c] = v;
  }
  return saida;
}

/**
 * O que a base devolve passa por AQUI: so estes campos saem. Identidade, notas, gravidade,
 * responsavel, `autor_user_id` e o que a base venha a acrescentar nunca chegam ao denunciante.
 */
export function vistaDoDenunciante(data: unknown): Objecto | null {
  if (!eObjecto(data)) return null;
  const desfecho = eObjecto(data.desfecho) ? soTextoOuNulo(data.desfecho, CAMPOS_DESFECHO) : {};
  const mensagens = Array.isArray(data.mensagens) ? data.mensagens : [];
  return {
    ...soTextoOuNulo(data, CAMPOS_VISTA),
    ...(typeof data.anonima === "boolean" ? { anonima: data.anonima } : {}),
    resultado: typeof desfecho.resultado === "string" ? desfecho.resultado : null,
    medidas: typeof desfecho.medidas === "string" ? desfecho.medidas : null,
    mensagens: mensagens.filter(eObjecto).map((m) => ({
      ...soTextoOuNulo(m, CAMPOS_MENSAGEM),
      pedido_informacao: m.pedido_informacao === true,
      ...(typeof m.em === "string" ? { criada_em: m.em } : {}),
    })),
  };
}

/** Igual a base: 4 digitos com zeros, ate 6 (denuncias_proximo_codigo). */
export const CODIGO_DEN = /^DEN-\d{4}-\d{4,6}$/;
export const PIN_6 = /^\d{6}$/;
export const SESSAO_43 = /^[A-Za-z0-9_-]{43}$/;
