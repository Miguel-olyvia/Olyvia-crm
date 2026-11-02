/**
 * A troca de documentos do portal do colaborador, do lado do ecra: a forma que a Edge `convite-admissao` devolve na acao
 * `doc_ler` (documentos que o RH enviou, pedidos do RH a pessoa, pedidos da pessoa ao RH), normalizada por LISTA BRANCA,
 * e as leituras derivadas (o que pede uma acao da pessoa, o contador de pendentes). Funcoes puras: nada aqui chama a rede.
 *
 * O CONTRATO (RPC `rpc_hr_portal_documentos_ler`): `{estado, documentos_ate, pendentes, telemovel_mascarado, envios[], pedidos_rh[],
 * pedidos_pessoa[]}`. Nunca traz o telemovel completo, o caminho de um ficheiro, o IP nem o id da pessoa; o que vier a mais
 * fica de fora.
 */

export type SituacaoEnvio = "por_assinar" | "assinado" | "recusado" | "entregue" | "anulado";
export type EstadoPedidoRhPortal = "por_enviar" | "enviado" | "aceite" | "recusado" | "cancelado";
export type EstadoPedidoPessoaPortal = "pedido" | "em_preparacao" | "disponivel" | "recusado" | "cancelado";
export type UrgenciaPortal = "normal" | "urgente";

const SITUACOES: readonly SituacaoEnvio[] = ["por_assinar", "assinado", "recusado", "entregue", "anulado"];
const ESTADOS_PEDIDO_RH: readonly EstadoPedidoRhPortal[] = ["por_enviar", "enviado", "aceite", "recusado", "cancelado"];
const ESTADOS_PEDIDO_PESSOA: readonly EstadoPedidoPessoaPortal[] = ["pedido", "em_preparacao", "disponivel", "recusado", "cancelado"];

export interface EnvioPortal {
  id: string;
  titulo: string;
  tipo: string;
  enviadoEm: string | null;
  vistoEm: string | null;
  exigeAssinatura: boolean;
  situacao: SituacaoEnvio;
  assinadoEm: string | null;
  assinaturaReferencia: string | null;
  recusaMotivo: string | null;
  temConteudo: boolean;
  temFicheiro: boolean;
  pedidoId: string | null;
}

export interface FicheiroPedidoPortal {
  id: string;
  nome: string;
  estado: string;
}

export interface PedidoRhPortal {
  id: string;
  tipo: string;
  titulo: string;
  nota: string;
  /** AAAA-MM-DD. */
  prazo: string;
  estado: EstadoPedidoRhPortal;
  motivoRecusa: string | null;
  ficheiros: FicheiroPedidoPortal[];
}

export interface PedidoPessoaPortal {
  id: string;
  tipo: string;
  titulo: string;
  nota: string;
  urgencia: UrgenciaPortal;
  estado: EstadoPedidoPessoaPortal;
  motivoRecusa: string | null;
  envioId: string | null;
}

export interface DocumentosPortal {
  estado: string | null;
  documentosAte: string | null;
  pendentes: number;
  /** So mascarado (ex.: «*** *** 678»): o numero completo nunca chega ao browser. */
  telemovelMascarado: string | null;
  envios: EnvioPortal[];
  pedidosRh: PedidoRhPortal[];
  pedidosPessoa: PedidoPessoaPortal[];
}

function eObjecto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

function daLista<T extends string>(valor: unknown, lista: readonly T[]): T | null {
  return typeof valor === "string" && (lista as readonly string[]).includes(valor) ? (valor as T) : null;
}

function normalizarEnvio(bruto: unknown): EnvioPortal | null {
  if (!eObjecto(bruto)) return null;
  const id = texto(bruto.id);
  const situacao = daLista(bruto.situacao, SITUACOES);
  if (!id || !situacao) return null;
  return {
    id,
    titulo: texto(bruto.titulo) ?? "",
    tipo: texto(bruto.tipo) ?? "outro",
    enviadoEm: texto(bruto.enviado_em),
    vistoEm: texto(bruto.visto_em),
    exigeAssinatura: bruto.exige_assinatura === true,
    situacao,
    assinadoEm: texto(bruto.assinado_em),
    assinaturaReferencia: texto(bruto.assinatura_referencia),
    recusaMotivo: texto(bruto.recusa_motivo),
    temConteudo: bruto.tem_conteudo === true,
    temFicheiro: bruto.tem_ficheiro === true,
    pedidoId: texto(bruto.pedido_id),
  };
}

function normalizarFicheiros(bruto: unknown): FicheiroPedidoPortal[] {
  if (!Array.isArray(bruto)) return [];
  const saida: FicheiroPedidoPortal[] = [];
  for (const f of bruto) {
    if (!eObjecto(f)) continue;
    const id = texto(f.id);
    if (id) saida.push({ id, nome: texto(f.nome) ?? "", estado: texto(f.estado) ?? "" });
  }
  return saida;
}

function normalizarPedidoRh(bruto: unknown): PedidoRhPortal | null {
  if (!eObjecto(bruto)) return null;
  const id = texto(bruto.id);
  const estado = daLista(bruto.estado, ESTADOS_PEDIDO_RH);
  if (!id || !estado) return null;
  return {
    id,
    tipo: texto(bruto.tipo) ?? "outro",
    titulo: texto(bruto.titulo) ?? "",
    nota: texto(bruto.nota) ?? "",
    prazo: texto(bruto.prazo) ?? "",
    estado,
    motivoRecusa: texto(bruto.motivo_recusa),
    ficheiros: normalizarFicheiros(bruto.ficheiros),
  };
}

function normalizarPedidoPessoa(bruto: unknown): PedidoPessoaPortal | null {
  if (!eObjecto(bruto)) return null;
  const id = texto(bruto.id);
  const estado = daLista(bruto.estado, ESTADOS_PEDIDO_PESSOA);
  if (!id || !estado) return null;
  return {
    id,
    tipo: texto(bruto.tipo) ?? "outro",
    titulo: texto(bruto.titulo) ?? "",
    nota: texto(bruto.nota) ?? "",
    urgencia: bruto.urgencia === "urgente" ? "urgente" : "normal",
    estado,
    motivoRecusa: texto(bruto.motivo_recusa),
    envioId: texto(bruto.envio_id),
  };
}

function lista<T>(bruto: unknown, normalizar: (x: unknown) => T | null): T[] {
  return Array.isArray(bruto) ? bruto.map(normalizar).filter((x): x is T => x !== null) : [];
}

/** O que a pessoa ainda tem de fazer: assinar (e ainda nao recusou) ou enviar ficheiros (por enviar, ou recusado pelo RH). */
export const envioPedeAssinatura = (e: EnvioPortal): boolean => e.exigeAssinatura && e.situacao === "por_assinar";
export const pedidoRhPedeAcaoReal = (p: PedidoRhPortal): boolean => p.estado === "por_enviar" || p.estado === "recusado";

/** O contador da entrada «Documentos»: usa o que a base diz; sem isso, conta-se aqui. */
export function pendentesDocumentos(d: Pick<DocumentosPortal, "envios" | "pedidosRh">, daBase: number | null): number {
  if (daBase !== null) return daBase;
  return d.envios.filter(envioPedeAssinatura).length + d.pedidosRh.filter(pedidoRhPedeAcaoReal).length;
}

/** So as chaves documentadas da `doc_ler`; o resto (um dia a Edge acrescentar algo) nao chega ao ecra. */
export function normalizarDocumentos(bruto: unknown): DocumentosPortal {
  const o = eObjecto(bruto) ? bruto : {};
  const envios = lista(o.envios, normalizarEnvio);
  const pedidosRh = lista(o.pedidos_rh, normalizarPedidoRh);
  const pedidosPessoa = lista(o.pedidos_pessoa, normalizarPedidoPessoa);
  const daBase = typeof o.pendentes === "number" && Number.isFinite(o.pendentes) && o.pendentes >= 0 ? o.pendentes : null;
  return {
    estado: texto(o.estado),
    documentosAte: texto(o.documentos_ate),
    pendentes: pendentesDocumentos({ envios, pedidosRh }, daBase),
    telemovelMascarado: texto(o.telemovel_mascarado),
    envios,
    pedidosRh,
    pedidosPessoa,
  };
}

/** Um pedido do RH ja passou do prazo e ainda falta a pessoa agir. `hoje` e `prazo` em AAAA-MM-DD. */
export const pedidoRhAtrasadoReal = (p: PedidoRhPortal, hoje: string): boolean =>
  pedidoRhPedeAcaoReal(p) && p.prazo !== "" && p.prazo < hoje;
