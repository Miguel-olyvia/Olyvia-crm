/**
 * A parte pura da revisao do RH (P4 da V3a): le o que `rpc_hr_admissao_rever_ler` devolve.
 *
 * A RPC devolve o resumo do processo (`estado`, `estado_portal`, `valid_until`, `submetido_em`, `cancelada_em`,
 * `rejeitada_em`, `eventos`) mais `campos`, `anexos`, `devolucao` e `pendencias`. So campos NAO sensiveis (lista branca):
 * cada campo traz o valor submetido e o da ficha, e `visivel: false` (valores `null`) quando o RH nao tem a permissao do
 * dominio da ficha. `niss` e `iban` so como `{preenchido}`. Um processo cancelado ou rejeitado chega so com o resumo. O valor do NISS e do IBAN nunca
 * vem daqui: pede-se a parte, a `rpc_hr_admissao_rever_sensivel`, so a quem tem `hr.onboarding.sensitive`. Por isso esta
 * leitura e DEFENSIVA: mesmo que a base devolvesse um valor de NISS ou IBAN (num campo ou fora dele), nao o guarda.
 */
import type { Pendencia } from "@/hooks/useAdmissaoPendencias";
import { estadoAdmissaoDe } from "@/lib/hr/estadoAdmissao";
import { estadoPortalDe } from "@/lib/hr/estadoAdmissao";
import type { EstadoAdmissao, EstadoPortalConvite } from "@/types/hr";

/** Os dois campos que so se veem pela segunda leitura. */
export const CAMPOS_SENSIVEIS = ["niss", "iban"] as const;
export type CampoSensivel = (typeof CAMPOS_SENSIVEIS)[number];

export function eCampoSensivel(valor: unknown): valor is CampoSensivel {
  return (CAMPOS_SENSIVEIS as readonly unknown[]).includes(valor);
}

/** O que `revelar` devolve: `valor` so existe quando correu bem, e quem o recebe e que o guarda (e apaga). */
export interface RevelarOk {
  ok: true;
  valor: string;
}
export interface RevelarFalha {
  /** O codigo que o ecra traduz; `null` e um defeito (rede, timeout...). */
  ok: false;
  codigo: string | null;
}
export type ResultadoRevelar = RevelarOk | RevelarFalha;

/** Sem `strictNullChecks` uma uniao por `ok` nao estreita: este guarda faz-o. */
export function revelouComSucesso(resultado: ResultadoRevelar): resultado is RevelarOk {
  return resultado.ok === true;
}

/** As chaves de `campos` que nunca se guardam, mesmo que a base as devolvesse: sao o NISS e o IBAN. */
const CHAVES_SENSIVEIS: ReadonlySet<string> = new Set(["niss", "iban", "conta_numero"]);

/** Os 30 eventos que a base conhece (CHECK `pessoas_convites_admissao_eventos_acao_valida`). */
export const ACOES_EVENTO = [
  "criado", "email_enviado", "email_falhou", "reenviado", "portal_aberto",
  "otp_pedido", "otp_validado", "otp_falhado", "sessao_iniciada", "sessao_substituida",
  "submetido", "devolvido", "corrigido", "aprovado", "rejeitado", "cancelado",
  "expirado", "prolongado", "link_regenerado",
  "documento_carregado", "documento_removido", "documento_validado",
  "contrato_disponibilizado", "contrato_assinado_empresa", "contrato_assinado_pessoa",
  "contrato_substituido", "assinatura_falhada",
  "acesso_enviado", "conta_ativada", "portal_encerrado",
] as const;

export const ATORES_EVENTO = ["rh", "pessoa", "sistema"] as const;

export interface CampoRevisao {
  chave: string;
  /** `false`: sem permissao do dominio da ficha; `submetido` e `ficha` ficam `null` e nunca se mostra valor. */
  visivel: boolean;
  submetido: string | null;
  ficha: string | null;
  difere: boolean;
}

export interface AnexoRevisao {
  /** `null` quando o anexo nao e visivel (sem permissao do dominio do tipo). */
  id: string | null;
  tipo: string;
  criadoEm: string | null;
  visivel: boolean;
}

export interface DevolucaoRevisao {
  /** Comentario por campo devolvido; `null` quando o RH nao tem a permissao do dominio desse campo. */
  campos: Record<string, string | null>;
  documentos: string[];
  observacao: string | null;
}

export interface EventoRevisao {
  acao: string;
  atorTipo: string;
  estadoAnterior: EstadoAdmissao | null;
  estadoPosterior: EstadoAdmissao | null;
  criadoEm: string;
}

export interface RevisaoAdmissao {
  /** Do resumo da base: o estado real do processo (inclui `cancelada` e `rejeitada`). `null` se nao veio. */
  estado: EstadoAdmissao | null;
  estadoPortal: EstadoPortalConvite | null;
  validUntil: string | null;
  campos: CampoRevisao[];
  niss: { preenchido: boolean };
  iban: { preenchido: boolean };
  anexos: AnexoRevisao[];
  devolucao: DevolucaoRevisao | null;
  pendencias: Pendencia[];
  eventos: EventoRevisao[];
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}

/** Um valor de campo -> o texto que se mostra; `null` quando esta vazio. */
export function valorParaTexto(valor: unknown): string | null {
  if (typeof valor === "string") return texto(valor);
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  return null;
}

function objetos(valor: unknown): Record<string, unknown>[] {
  return Array.isArray(valor) ? valor.filter((v): v is Record<string, unknown> => !!v && typeof v === "object") : [];
}

function campoDaRpc(linha: Record<string, unknown>): CampoRevisao | null {
  const chave = texto(linha.chave);
  if (!chave || CHAVES_SENSIVEIS.has(chave)) return null;
  // Sem permissao do dominio, nunca se guarda valor: mesmo que a base o mandasse.
  if (linha.visivel === false) return { chave, visivel: false, submetido: null, ficha: null, difere: false };
  return {
    chave,
    visivel: true,
    submetido: valorParaTexto(linha.submetido),
    ficha: valorParaTexto(linha.ficha),
    difere: linha.difere === true,
  };
}

function anexoDaRpc(linha: Record<string, unknown>): AnexoRevisao | null {
  const tipo = texto(linha.tipo);
  if (!tipo) return null;
  const id = linha.visivel === false ? null : texto(linha.id);
  // Um anexo visivel sem id nao e utilizavel; um oculto (sem id) fica, para se dizer que existe.
  if (linha.visivel !== false && !id) return null;
  return { id, tipo, criadoEm: texto(linha.criado_em), visivel: linha.visivel !== false };
}

function devolucaoDaRpc(bruto: unknown): DevolucaoRevisao | null {
  if (!bruto || typeof bruto !== "object") return null;
  const { campos, documentos, observacao } = bruto as Record<string, unknown>;
  const comentarios: Record<string, string | null> = {};
  if (campos && typeof campos === "object") {
    for (const [chave, comentario] of Object.entries(campos as Record<string, unknown>)) {
      // `null` = a chave foi devolvida mas o RH nao ve o dominio dela: a chave fica, sem texto.
      comentarios[chave] = texto(comentario);
    }
  }
  const lista = Array.isArray(documentos) ? documentos.filter((d): d is string => typeof d === "string" && d !== "") : [];
  const nota = texto(observacao);
  const vazia = Object.keys(comentarios).length === 0 && lista.length === 0 && nota === null;
  return vazia ? null : { campos: comentarios, documentos: lista, observacao: nota };
}

function pendenciaDaRpc(linha: Record<string, unknown>): Pendencia | null {
  const codigo = texto(linha.codigo);
  if (!codigo) return null;
  const origem = linha.origem === "rh" ? "rh" : "pessoa";
  const posicao =
    linha.posicao === "convite" || linha.posicao === "ficha" || linha.posicao === "rh"
      ? linha.posicao
      : origem === "rh"
        ? "rh"
        : "convite";
  return { codigo, origem, posicao };
}

function eventoDaRpc(linha: Record<string, unknown>): EventoRevisao | null {
  const acao = texto(linha.acao);
  const criadoEm = texto(linha.criado_em);
  if (!acao || !criadoEm) return null;
  const estado = (valor: unknown): EstadoAdmissao | null => (texto(valor) ? estadoAdmissaoDe(valor) : null);
  return {
    acao,
    atorTipo: texto(linha.ator_tipo) ?? "sistema",
    estadoAnterior: estado(linha.estado_anterior),
    estadoPosterior: estado(linha.estado_posterior),
    criadoEm,
  };
}

function aceitar<T>(linhas: Record<string, unknown>[], ler: (l: Record<string, unknown>) => T | null): T[] {
  return linhas.map(ler).filter((r): r is T => r !== null);
}

function preenchido(bruto: unknown): { preenchido: boolean } {
  // So a bandeira: qualquer outro campo (um valor que a base nao devia mandar) e deitado fora.
  return { preenchido: !!bruto && typeof bruto === "object" && (bruto as { preenchido?: unknown }).preenchido === true };
}

/** A forma da RPC -> a do ecra. Nunca rebenta: o que nao se entende fica vazio. */
export function revisaoDaRpc(bruto: unknown): RevisaoAdmissao {
  const r = bruto && typeof bruto === "object" ? (bruto as Record<string, unknown>) : {};
  return {
    estado: texto(r.estado) ? estadoAdmissaoDe(r.estado) : null,
    estadoPortal: texto(r.estado_portal) ? estadoPortalDe(r.estado_portal) : null,
    validUntil: texto(r.valid_until),
    campos: aceitar(objetos(r.campos), campoDaRpc),
    niss: preenchido(r.niss),
    iban: preenchido(r.iban),
    anexos: aceitar(objetos(r.anexos), anexoDaRpc),
    devolucao: devolucaoDaRpc(r.devolucao),
    pendencias: aceitar(objetos(r.pendencias), pendenciaDaRpc),
    eventos: aceitar(objetos(r.eventos), eventoDaRpc),
  };
}

/** O historico do mais recente para o mais antigo (a base nao garante a ordem). */
export function eventosRecentesPrimeiro(eventos: readonly EventoRevisao[]): EventoRevisao[] {
  return [...eventos].sort((a, b) => Date.parse(b.criadoEm) - Date.parse(a.criadoEm));
}
