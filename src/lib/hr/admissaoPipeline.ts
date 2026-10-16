/**
 * A parte pura do pipeline de admissoes do RH (P4 da V3a): le o que `rpc_hr_admissao_listar` devolve, define os grupos
 * de filtro (que viram `p_estados`), o passo da faixa de progresso e traduz os erros da base em codigos.
 *
 * A lista devolve, por processo: `convite_id, pessoa_id, nome, cargo, estado, estado_portal, valid_until, submetido_em,
 * devolvida_em, atualizado_em`. NAO traz o e-mail de destino nem qualquer dado da submissao: so metadados. Para quem nao
 * tem `hr.onboarding.restrito`, um processo cancelado ou rejeitado chega como `terminado`, sem datas.
 */
import { chaveDeErroAdmissao } from "@/lib/hr/errosAdmissao";
import { estadoAdmissaoDe, estadoPortalDe } from "@/lib/hr/estadoAdmissao";
import type { EstadoAdmissao, EstadoAdmissaoBase, EstadoPortalConvite } from "@/types/hr";

export interface ItemPipeline {
  conviteId: string;
  pessoaId: string;
  nome: string;
  cargo: string | null;
  estado: EstadoAdmissao;
  estadoPortal: EstadoPortalConvite;
  validUntil: string | null;
  submetidoEm: string | null;
  devolvidaEm: string | null;
  atualizadoEm: string | null;
}

/** O cursor da pagina seguinte (`seguinte` da base, `NULL` quando nao ha mais): `p_apos_criado_em` e `p_apos_id`. */
export interface CursorPipeline {
  criadoEm: string;
  id: string;
}

export interface PaginaPipeline {
  itens: ItemPipeline[];
  /** Quantos processos ha em cada estado da base. */
  contadores: Record<string, number>;
  seguinte: CursorPipeline | null;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor !== "" ? valor : null;
}

function itemDaRpc(bruto: unknown): ItemPipeline | null {
  if (!bruto || typeof bruto !== "object") return null;
  const linha = bruto as Record<string, unknown>;
  const conviteId = texto(linha.convite_id);
  const pessoaId = texto(linha.pessoa_id);
  if (!conviteId || !pessoaId) return null;
  return {
    conviteId,
    pessoaId,
    nome: texto(linha.nome) ?? "",
    cargo: texto(linha.cargo),
    // Um valor que a base nao devolve (ou ausente) NAO e um estado aberto: `desconhecido`, sem acoes.
    estado: estadoAdmissaoDe(linha.estado),
    estadoPortal: estadoPortalDe(linha.estado_portal),
    validUntil: texto(linha.valid_until),
    submetidoEm: texto(linha.submetido_em),
    devolvidaEm: texto(linha.devolvida_em),
    atualizadoEm: texto(linha.atualizado_em),
  };
}

function contadoresDaRpc(bruto: unknown): Record<string, number> {
  if (!bruto || typeof bruto !== "object") return {};
  const saida: Record<string, number> = {};
  for (const [estado, n] of Object.entries(bruto as Record<string, unknown>)) {
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) saida[estado] = n;
  }
  return saida;
}

function cursorDaRpc(bruto: unknown): CursorPipeline | null {
  if (!bruto || typeof bruto !== "object") return null;
  // A base devolve `{apos_criado_em, apos_id}`: os nomes dos argumentos da pagina seguinte.
  const { apos_criado_em: aposCriadoEm, apos_id: aposId } = bruto as Record<string, unknown>;
  const data = texto(aposCriadoEm);
  const identificador = texto(aposId);
  return data && identificador ? { criadoEm: data, id: identificador } : null;
}

/** A forma da RPC -> a do ecra. Nunca rebenta: uma resposta que nao se entende e uma lista vazia. */
export function paginaDaRpc(bruto: unknown): PaginaPipeline {
  if (!bruto || typeof bruto !== "object") return { itens: [], contadores: {}, seguinte: null };
  const resposta = bruto as Record<string, unknown>;
  const itens = Array.isArray(resposta.itens)
    ? resposta.itens.map(itemDaRpc).filter((i): i is ItemPipeline => i !== null)
    : [];
  return { itens, contadores: contadoresDaRpc(resposta.contadores), seguinte: cursorDaRpc(resposta.seguinte) };
}

export type GrupoPipelineId = "por_rever" | "com_a_pessoa" | "contrato_e_acesso" | "concluidas" | "terminadas";

export interface GrupoPipeline {
  id: GrupoPipelineId;
  /** Os estados da base que o filtro pede em `p_estados`. */
  estados: readonly EstadoAdmissaoBase[];
  /** Os terminados mascarados (`terminado`) contam neste grupo. */
  comTerminados?: boolean;
}

/**
 * Pela ordem em que pedem trabalho ao RH: primeiro o que esta a espera dele. Cada um dos 11 estados da base pertence a
 * um grupo e so a um.
 */
export const GRUPOS_PIPELINE: readonly GrupoPipeline[] = [
  { id: "por_rever", estados: ["submetida"] },
  { id: "com_a_pessoa", estados: ["convidada", "em_preenchimento", "devolvida"] },
  { id: "contrato_e_acesso", estados: ["aprovada", "a_aguardar_assinaturas", "assinaturas_concluidas", "a_aguardar_ativacao"] },
  { id: "concluidas", estados: ["concluida"] },
  { id: "terminadas", estados: ["rejeitada", "cancelada"], comTerminados: true },
];

export function contagemDoGrupo(grupo: GrupoPipeline, contadores: Readonly<Record<string, number>>): number {
  const dosEstados = grupo.estados.reduce((soma, estado) => soma + (contadores[estado] ?? 0), 0);
  return dosEstados + (grupo.comTerminados ? (contadores.terminado ?? 0) : 0);
}

export const PASSOS_FAIXA = ["convite", "ficha", "aprovacao", "contrato", "assinatura", "acesso"] as const;

export interface PassoDaFaixa {
  /** O indice do passo em curso; `PASSOS_FAIXA.length` quando todos estao feitos. */
  atual: number;
  /** A admissao parou neste passo por rejeicao. */
  rejeitada: boolean;
}

const PASSO_POR_ESTADO: Readonly<Partial<Record<EstadoAdmissao, number>>> = {
  convidada: 0,
  em_preenchimento: 1,
  devolvida: 1,
  submetida: 2,
  aprovada: 3,
  a_aguardar_assinaturas: 4,
  assinaturas_concluidas: 5,
  a_aguardar_ativacao: 5,
  concluida: PASSOS_FAIXA.length,
  rejeitada: 2,
};

/**
 * Onde vai a admissao. `null` quando nao se sabe (cancelada, terminado mascarado, desconhecido): inventar um passo seria
 * dizer o que ninguem sabe.
 */
export function passoDaFaixa(estado: EstadoAdmissao): PassoDaFaixa | null {
  const atual = PASSO_POR_ESTADO[estado];
  return atual === undefined ? null : { atual, rejeitada: estado === "rejeitada" };
}

/** Os ERRCODE da V2/V3a que o RH pode receber, e o codigo que cada um quer dizer. */
const CODIGO_POR_SQLSTATE: Readonly<Record<string, string>> = {
  HRA10: "pedido_invalido",
  HRA31: "nao_encontrado",
  HRA33: "organizacao_nao_empregadora",
  HRA37: "motivo_invalido",
  HRA38: "estado_invalido",
  HRA41: "limite_excedido",
};

/**
 * Recusa por permissao (42501, ou o PostgREST a recusar antes). Igual a `isPermissionError` de `hrDb`, que nao se importa
 * aqui para este ficheiro continuar puro: `hrDb` arrasta o cliente do Supabase.
 */
function recusaPorPermissao(erro: unknown): boolean {
  if (!erro || typeof erro !== "object") return false;
  const { code, message } = erro as { code?: unknown; message?: unknown };
  if (typeof code === "string" && ["42501", "PGRST301", "401", "403"].includes(code)) return true;
  return typeof message === "string" && /permission denied|insufficient_privilege/i.test(message);
}

/**
 * O codigo de um erro de uma RPC chamada pelo browser, ou `null` quando e um defeito (rede, timeout, sintaxe). So devolve
 * codigos que o ecra sabe traduzir: o texto cru da base (`message`, `details`) nunca sobe.
 */
export function codigoDeErroRpc(erro: unknown): string | null {
  if (recusaPorPermissao(erro)) return "insufficient_privilege";
  if (!erro || typeof erro !== "object") return null;
  const { code, message } = erro as { code?: unknown; message?: unknown };
  if (typeof code === "string" && CODIGO_POR_SQLSTATE[code]) return CODIGO_POR_SQLSTATE[code];
  return typeof message === "string" && chaveDeErroAdmissao(message) !== null ? message : null;
}

/** A chave de traducao do texto que o ecra mostra para um codigo; `generica` quando nao ha texto proprio. */
export function chaveDoErro(codigo: string | null, generica: string): string {
  const entrada = codigo ? chaveDeErroAdmissao(codigo) : null;
  return entrada ? entrada.chave : generica;
}
