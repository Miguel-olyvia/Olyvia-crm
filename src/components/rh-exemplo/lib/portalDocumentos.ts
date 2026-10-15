/**
 * A troca de documentos do Portal do colaborador (de exemplo): funções puras, sem memória nem ecrã. Três coisas:
 *  - «Recebidos»: documentos que o RH enviou à pessoa (alguns pedem assinatura);
 *  - «Pedidos do RH»: o que o RH pede à pessoa (cartão de cidadão, IBAN...), que ela envia e o RH aceita ou recusa;
 *  - «Os meus pedidos»: o que a pessoa pede ao RH (declaração, cópia do contrato...), que o RH prepara e disponibiliza.
 * Nada aqui sai para lado nenhum: os ficheiros são só nomes. Cada transição devolve um portal novo ou o código do erro.
 */
import type { ErroAdmissao } from "@/components/rh-exemplo/lib/admissaoFluxo";
import { LIMITES_ANEXOS } from "@/components/rh-exemplo/lib/conviteAnexos";

/** O mesmo limite do convite de admissão (fluxo 1): 4 ficheiros por documento. */
export const MAX_FICHEIROS_PEDIDO: number = LIMITES_ANEXOS.maxActivos;
export const MIN_MOTIVO_PORTAL = 3;

export type ErroPortal =
  | ErroAdmissao | "sem_ficheiro" | "max_ficheiros" | "titulo_obrigatorio" | "prazo_invalido" | "nao_encontrado";

export type TipoPedidoRh = "cartao_cidadao" | "comprovativo_iban" | "fotografia" | "outro";
export type EstadoPedidoRh = "por_enviar" | "enviado" | "aceite" | "recusado";
export type TipoPedidoPessoa = "declaracao_vinculo" | "comprovativo_rendimentos" | "copia_contrato" | "outro";
export type EstadoPedidoPessoa = "pedido" | "em_preparacao" | "disponivel" | "recusado";
export type Urgencia = "normal" | "urgente";
export type EstadoRecebido = "novo" | "visto" | "assinado";

export const TIPOS_PEDIDO_RH: readonly TipoPedidoRh[] = ["cartao_cidadao", "comprovativo_iban", "fotografia", "outro"];
export const TIPOS_PEDIDO_PESSOA: readonly TipoPedidoPessoa[] = ["declaracao_vinculo", "comprovativo_rendimentos", "copia_contrato", "outro"];

export interface DocRecebido {
  id: string;
  titulo: string;
  nomeFicheiro: string;
  enviadoEm: string;
  precisaAssinatura: boolean;
  assinadoEm: string | null;
  assinaturaNome: string | null;
  recusa: { motivo: string; em: string } | null;
  /** Se o documento é a resposta a um pedido da pessoa. */
  origemPedidoId: string | null;
}

export interface PedidoRh {
  id: string;
  tipo: TipoPedidoRh;
  /** Só para «outro»; nos tipos fixos o título vem da tradução. */
  titulo: string;
  nota: string;
  /** AAAA-MM-DD. */
  prazo: string;
  criadoEm: string;
  estado: EstadoPedidoRh;
  ficheiros: string[];
  enviadoEm: string | null;
  motivoRecusa: string | null;
}

export interface PedidoPessoa {
  id: string;
  tipo: TipoPedidoPessoa;
  titulo: string;
  nota: string;
  urgencia: Urgencia;
  criadoEm: string;
  estado: EstadoPedidoPessoa;
  motivoRecusa: string | null;
  /** O documento em «Recebidos» quando o pedido fica disponível. */
  documentoId: string | null;
}

export interface PortalPessoa {
  recebidos: DocRecebido[];
  pedidosRh: PedidoRh[];
  pedidosPessoa: PedidoPessoa[];
  /** Os documentos que a pessoa já abriu (o contrato incluído, com o id «contrato»). */
  vistos: string[];
  contador: number;
}

export type ResultadoPortal =
  | { ok: true; portal: PortalPessoa; id: string; erro?: undefined }
  | { ok: false; erro: ErroPortal; portal?: undefined; id?: undefined };

export const PORTAL_VAZIO: PortalPessoa = { recebidos: [], pedidosRh: [], pedidosPessoa: [], vistos: [], contador: 0 };

const falha = (erro: ErroPortal): ResultadoPortal => ({ ok: false, erro });
const feito = (portal: PortalPessoa, id: string): ResultadoPortal => ({ ok: true, portal, id });
const motivoValido = (m: string | undefined): m is string => (m ?? "").trim().length >= MIN_MOTIVO_PORTAL;
const normalizar = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

function proximoId(p: PortalPessoa, prefixo: string): { id: string; contador: number } {
  const contador = p.contador + 1;
  return { id: `${prefixo}-${contador}`, contador };
}

/** Só os nomes não vazios, sem repetidos, por ordem. */
export function nomesValidos(nomes: readonly string[]): string[] {
  const limpos = nomes.map((n) => n.trim()).filter((n) => n !== "");
  return limpos.filter((n, i) => limpos.indexOf(n) === i);
}

/** Junta ficheiros aos já escolhidos, sem passar do máximo: devolve a lista ou o erro. */
export function juntarFicheiros(atuais: readonly string[], novos: readonly string[], max = MAX_FICHEIROS_PEDIDO): { ok: true; nomes: string[] } | { ok: false; erro: "max_ficheiros" } {
  const nomes = nomesValidos([...atuais, ...novos]);
  return nomes.length > max ? { ok: false, erro: "max_ficheiros" } : { ok: true, nomes };
}

function alterarPedidoRh(p: PortalPessoa, id: string, de: readonly EstadoPedidoRh[], fn: (x: PedidoRh) => PedidoRh | ErroPortal): ResultadoPortal {
  const atual = p.pedidosRh.find((x) => x.id === id);
  if (!atual) return falha("nao_encontrado");
  if (!de.includes(atual.estado)) return falha("transicao_invalida");
  const novo = fn(atual);
  if (typeof novo === "string") return falha(novo);
  return feito({ ...p, pedidosRh: p.pedidosRh.map((x) => (x.id === id ? novo : x)) }, id);
}

function alterarPedidoPessoa(p: PortalPessoa, id: string, de: readonly EstadoPedidoPessoa[], fn: (x: PedidoPessoa) => PedidoPessoa | ErroPortal): ResultadoPortal {
  const atual = p.pedidosPessoa.find((x) => x.id === id);
  if (!atual) return falha("nao_encontrado");
  if (!de.includes(atual.estado)) return falha("transicao_invalida");
  const novo = fn(atual);
  if (typeof novo === "string") return falha(novo);
  return feito({ ...p, pedidosPessoa: p.pedidosPessoa.map((x) => (x.id === id ? novo : x)) }, id);
}

/* ---- Pedidos do RH à pessoa ---- */

export interface DadosPedidoRh { tipo: TipoPedidoRh; titulo: string; nota: string; prazo: string }

/** O RH pede um documento à pessoa. */
export function pedirDocumentoPessoa(p: PortalPessoa, d: DadosPedidoRh, agora: Date): ResultadoPortal {
  if (d.tipo === "outro" && d.titulo.trim() === "") return falha("titulo_obrigatorio");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.prazo)) return falha("prazo_invalido");
  const { id, contador } = proximoId(p, "pr");
  const pedido: PedidoRh = {
    id, tipo: d.tipo, titulo: d.tipo === "outro" ? d.titulo.trim() : "", nota: d.nota.trim(), prazo: d.prazo,
    criadoEm: agora.toISOString(), estado: "por_enviar", ficheiros: [], enviadoEm: null, motivoRecusa: null,
  };
  return feito({ ...p, contador, pedidosRh: [...p.pedidosRh, pedido] }, id);
}

/** A pessoa envia os ficheiros de um pedido (ou volta a enviar, depois de recusado): de 1 a 4 nomes. */
export function enviarFicheirosPedidoRh(p: PortalPessoa, id: string, nomes: readonly string[], agora: Date): ResultadoPortal {
  return alterarPedidoRh(p, id, ["por_enviar", "recusado"], (x) => {
    const lista = nomesValidos(nomes);
    if (lista.length === 0) return "sem_ficheiro";
    if (lista.length > MAX_FICHEIROS_PEDIDO) return "max_ficheiros";
    return { ...x, estado: "enviado", ficheiros: lista, enviadoEm: agora.toISOString(), motivoRecusa: null };
  });
}

export const aceitarPedidoRh = (p: PortalPessoa, id: string): ResultadoPortal =>
  alterarPedidoRh(p, id, ["enviado"], (x) => ({ ...x, estado: "aceite" }));

export const recusarPedidoRh = (p: PortalPessoa, id: string, motivo: string): ResultadoPortal =>
  alterarPedidoRh(p, id, ["enviado"], (x) => (motivoValido(motivo) ? { ...x, estado: "recusado", motivoRecusa: motivo.trim() } : "motivo_curto"));

/* ---- Documentos que o RH envia à pessoa ---- */

export interface DadosDocumentoEnviado { titulo: string; nomeFicheiro: string; precisaAssinatura: boolean }

export function enviarDocumentoAPessoa(p: PortalPessoa, d: DadosDocumentoEnviado, agora: Date): ResultadoPortal {
  if (d.titulo.trim() === "") return falha("titulo_obrigatorio");
  const { id, contador } = proximoId(p, "dr");
  const doc: DocRecebido = {
    id, titulo: d.titulo.trim(), nomeFicheiro: d.nomeFicheiro.trim() || `${d.titulo.trim()}.pdf`, enviadoEm: agora.toISOString(),
    precisaAssinatura: d.precisaAssinatura, assinadoEm: null, assinaturaNome: null, recusa: null, origemPedidoId: null,
  };
  return feito({ ...p, contador, recebidos: [doc, ...p.recebidos] }, id);
}

/** A pessoa abriu o documento (ver ou descarregar). Idempotente; um id desconhecido não faz nada. */
export function marcarVisto(p: PortalPessoa, id: string): PortalPessoa {
  return p.vistos.includes(id) ? p : { ...p, vistos: [...p.vistos, id] };
}

export function assinarRecebido(p: PortalPessoa, id: string, e: { nome: string; nomeEsperado: string; aceite: boolean }, agora: Date): ResultadoPortal {
  const doc = p.recebidos.find((x) => x.id === id);
  if (!doc) return falha("nao_encontrado");
  if (!doc.precisaAssinatura || doc.assinadoEm) return falha("transicao_invalida");
  if (!e.aceite) return falha("aceite_obrigatorio");
  if (!e.nome.trim() || normalizar(e.nome) !== normalizar(e.nomeEsperado)) return falha("nome_nao_confere");
  const assinado: DocRecebido = { ...doc, assinadoEm: agora.toISOString(), assinaturaNome: e.nome.trim(), recusa: null };
  return feito(marcarVisto({ ...p, recebidos: p.recebidos.map((x) => (x.id === id ? assinado : x)) }, id), id);
}

export function recusarAssinaturaRecebido(p: PortalPessoa, id: string, motivo: string, agora: Date): ResultadoPortal {
  const doc = p.recebidos.find((x) => x.id === id);
  if (!doc) return falha("nao_encontrado");
  if (!doc.precisaAssinatura || doc.assinadoEm) return falha("transicao_invalida");
  if (!motivoValido(motivo)) return falha("motivo_curto");
  const recusado: DocRecebido = { ...doc, recusa: { motivo: motivo.trim(), em: agora.toISOString() } };
  return feito({ ...p, recebidos: p.recebidos.map((x) => (x.id === id ? recusado : x)) }, id);
}

/* ---- Pedidos da pessoa ao RH ---- */

export interface DadosPedidoPessoa { tipo: TipoPedidoPessoa; titulo: string; nota: string; urgencia: Urgencia }

export function pedirDocumentoAoRh(p: PortalPessoa, d: DadosPedidoPessoa, agora: Date): ResultadoPortal {
  if (d.tipo === "outro" && d.titulo.trim() === "") return falha("titulo_obrigatorio");
  const { id, contador } = proximoId(p, "pp");
  const pedido: PedidoPessoa = {
    id, tipo: d.tipo, titulo: d.tipo === "outro" ? d.titulo.trim() : "", nota: d.nota.trim(), urgencia: d.urgencia,
    criadoEm: agora.toISOString(), estado: "pedido", motivoRecusa: null, documentoId: null,
  };
  return feito({ ...p, contador, pedidosPessoa: [pedido, ...p.pedidosPessoa] }, id);
}

export const prepararPedidoPessoa = (p: PortalPessoa, id: string): ResultadoPortal =>
  alterarPedidoPessoa(p, id, ["pedido"], (x) => ({ ...x, estado: "em_preparacao" }));

export const recusarPedidoPessoa = (p: PortalPessoa, id: string, motivo: string): ResultadoPortal =>
  alterarPedidoPessoa(p, id, ["pedido", "em_preparacao"], (x) => (motivoValido(motivo) ? { ...x, estado: "recusado", motivoRecusa: motivo.trim() } : "motivo_curto"));

/** O RH responde com o documento: o pedido fica «Disponível» e o documento aparece também em «Recebidos». */
export function responderPedidoPessoa(p: PortalPessoa, id: string, nomeFicheiro: string, titulo: string, agora: Date): ResultadoPortal {
  if (nomeFicheiro.trim() === "") return falha("sem_ficheiro");
  const { id: docId, contador } = proximoId(p, "dr");
  const r = alterarPedidoPessoa(p, id, ["pedido", "em_preparacao"], (x) => ({ ...x, estado: "disponivel", documentoId: docId }));
  if (!r.ok) return r;
  const doc: DocRecebido = {
    id: docId, titulo: titulo.trim(), nomeFicheiro: nomeFicheiro.trim(), enviadoEm: agora.toISOString(), precisaAssinatura: false,
    assinadoEm: null, assinaturaNome: null, recusa: null, origemPedidoId: id,
  };
  return feito({ ...r.portal, contador, recebidos: [doc, ...r.portal.recebidos] }, id);
}

/* ---- Leituras derivadas ---- */

export function estadoRecebido(doc: DocRecebido, vistos: readonly string[]): EstadoRecebido {
  if (doc.assinadoEm) return "assinado";
  return vistos.includes(doc.id) ? "visto" : "novo";
}

/** O que pede uma ação da pessoa: assinar (e ainda não recusou) ou enviar ficheiros (por enviar, ou recusado pelo RH). */
export const recebidoPedeAcao = (d: DocRecebido): boolean => d.precisaAssinatura && !d.assinadoEm && !d.recusa;
export const pedidoRhPedeAcao = (x: PedidoRh): boolean => x.estado === "por_enviar" || x.estado === "recusado";

/** O contador da entrada «Documentos» do portal: o que a pessoa ainda tem de fazer. */
export function pendentesDaPessoa(recebidos: readonly DocRecebido[], pedidosRh: readonly PedidoRh[]): number {
  return recebidos.filter(recebidoPedeAcao).length + pedidosRh.filter(pedidoRhPedeAcao).length;
}

/** O que está à espera do RH: ficheiros por aceitar e pedidos da pessoa por tratar. */
export function pendentesDoRh(p: PortalPessoa): number {
  return p.pedidosRh.filter((x) => x.estado === "enviado").length
    + p.pedidosPessoa.filter((x) => x.estado === "pedido" || x.estado === "em_preparacao").length;
}

/** Um pedido do RH já passou do prazo e ainda falta a pessoa agir. `hoje` e `prazo` em AAAA-MM-DD. */
export const pedidoRhAtrasado = (x: PedidoRh, hoje: string): boolean => pedidoRhPedeAcao(x) && x.prazo < hoje;

/** A chave de tradução de um erro: os do fluxo de admissão têm texto próprio em `rhAdm.erro`, os do portal em `rhPortal.erro`. */
export function chaveErroPortal(erro: ErroPortal): string {
  const proprios: readonly string[] = ["sem_ficheiro", "max_ficheiros", "titulo_obrigatorio", "prazo_invalido", "nao_encontrado"];
  return proprios.includes(erro) ? `rhPortal.erro.${erro}` : `rhAdm.erro.${erro}`;
}
