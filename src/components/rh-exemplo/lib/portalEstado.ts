/**
 * O que o Portal do colaborador (de exemplo) mostra, derivado da admissão: a etiqueta da «Ficha de admissão», os passos
 * (Ficha, Aprovação do RH, Contrato, Acesso), a secção que abre por omissão, o aviso do prazo do acesso temporário e o
 * contrato como documento por assinar. Funções puras.
 */
import {
  passoDaFaixa, prazoDoLogin, type Admissao, type EstadoAdmissao, type VistaPublica,
} from "@/components/rh-exemplo/lib/admissaoFluxo";
import type { DocRecebido } from "@/components/rh-exemplo/lib/portalDocumentos";

export type SeccaoPortal = "ficha" | "documentos";
export type AbaDocumentos = "recebidos" | "pedidos" | "meus";
export type EtiquetaFicha = "a_preencher" | "devolvida" | "submetida" | "aprovada" | "rejeitada";
export type SituacaoPasso = "feito" | "atual" | "falta" | "rejeitado";
export type PassoPortal = "ficha" | "aprovacao" | "contrato" | "acesso";

export const SECCOES_PORTAL: readonly SeccaoPortal[] = ["ficha", "documentos"];
export const ABAS_DOCUMENTOS: readonly AbaDocumentos[] = ["recebidos", "pedidos", "meus"];
export const ID_CONTRATO = "contrato";
/** Com menos de dois dias de acesso, o selo avisa (âmbar, com texto). */
export const MS_AVISO_PRAZO = 2 * 24 * 60 * 60 * 1000;

/** Só nestas vistas há portal; nas outras o acesso terminou (ou o link não existe). */
const VISTAS_COM_PORTAL: readonly VistaPublica[] = ["preencher", "submetida", "contrato", "assinado"];
export const temPortal = (vista: VistaPublica): boolean => VISTAS_COM_PORTAL.includes(vista);

export type VistaTerminada = Extract<VistaPublica, "expirada" | "revogada" | "encerrada" | "invalida">;

/** A vista de um acesso sem portal (qualquer uma que não dê direito à navegação). */
export function vistaTerminada(vista: VistaPublica): VistaTerminada {
  return vista === "expirada" || vista === "revogada" || vista === "encerrada" ? vista : "invalida";
}

export function etiquetaFicha(estado: EstadoAdmissao): EtiquetaFicha {
  if (estado === "convite_enviado" || estado === "a_preencher") return "a_preencher";
  if (estado === "devolvida") return "devolvida";
  if (estado === "submetida") return "submetida";
  return estado === "rejeitada" ? "rejeitada" : "aprovada";
}

/** Os quatro passos do portal com a situação de cada um. */
export function passosDaAdmissao(estado: EstadoAdmissao): Array<{ passo: PassoPortal; situacao: SituacaoPasso }> {
  const p = passoDaFaixa(estado);
  const aprovacao: SituacaoPasso = p >= 3 ? "feito" : p === 2 ? (estado === "rejeitada" ? "rejeitado" : "atual") : "falta";
  const acesso: SituacaoPasso = estado === "acesso_ativo" ? "feito" : p === 5 ? "atual" : "falta";
  return [
    { passo: "ficha", situacao: p >= 2 ? "feito" : "atual" },
    { passo: "aprovacao", situacao: aprovacao },
    { passo: "contrato", situacao: p >= 4 ? "feito" : p === 3 ? "atual" : "falta" },
    { passo: "acesso", situacao: acesso },
  ];
}

/** Com o contrato por assinar, a pessoa vai direta a Documentos; nos outros casos abre na ficha. */
export function seccaoPorOmissao(estado: EstadoAdmissao): SeccaoPortal {
  return estado === "contrato_por_assinar" ? "documentos" : "ficha";
}

/** A secção do endereço; um valor em falta ou inválido cai na `omissao` (a de quando a pessoa abriu o portal). */
export function lerSeccao(valor: string | null, omissao: SeccaoPortal): SeccaoPortal {
  return SECCOES_PORTAL.find((s) => s === valor) ?? omissao;
}

export function lerAbaDocumentos(valor: string | null): AbaDocumentos {
  return ABAS_DOCUMENTOS.find((a) => a === valor) ?? "recebidos";
}

/** O selo do prazo fica âmbar (com texto) quando resta menos de dois dias. */
export function prazoEmAviso(adm: Admissao, agora: Date): boolean {
  const prazo = prazoDoLogin(adm, agora);
  if (prazo.tipo === "horas") return true;
  return prazo.tipo === "dias" && Date.parse(adm.login.expiraEm) - agora.getTime() < MS_AVISO_PRAZO;
}

/** O contrato gerado pelo RH, como documento por assinar (ou assinado), à cabeça de «Recebidos». */
export function contratoComoRecebido(adm: Admissao): DocRecebido | null {
  const c = adm.contrato;
  if (!c) return null;
  return {
    id: ID_CONTRATO, titulo: c.titulo, nomeFicheiro: `${c.titulo}.pdf`, enviadoEm: c.geradoEm, precisaAssinatura: true,
    assinadoEm: c.assinadoEm, assinaturaNome: c.assinaturaNome, recusa: c.recusa, origemPedidoId: null,
  };
}

/** Os recebidos que a pessoa vê: o contrato (se o RH o gerou) e depois os que o RH enviou. */
export function recebidosVisiveis(recebidos: readonly DocRecebido[], adm: Admissao | null): DocRecebido[] {
  const contrato = adm ? contratoComoRecebido(adm) : null;
  return contrato ? [contrato, ...recebidos] : [...recebidos];
}
