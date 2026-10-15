// O contexto dos ecrãs da Frota de exemplo (app real): a base, se o utilizador pode agir (permissão real), como agir,
// o aviso (região aria-live), a ficha da viatura e os diálogos. Os filtros vivem no URL de cada ecrã (?vista=…).
import { createContext, useContext } from "react";
import type { ResultadoFrota } from "./dados/loja";
import type { Frota, LinhaCarrinha, ObraRef } from "./dados";

export type EcraFrota = "hoje" | "viaturas" | "atribuicoes" | "condutores" | "manutencao" | "custos" | "ocorrencias" | "documentos" | "relatorios" | "atividade" | "ligacoes";
export type AbaFicha = "resumo" | "atrib" | "manut" | "custos" | "ocorr" | "docs" | "stock" | "lig" | "hist";
export type TipoDlg = "atribuir" | "devolver" | "km" | "abastecer" | "despesa" | "importar" | "manut" | "concluir" | "estado" | "ocorrencia" | "identificar" | "renovar" | "nova";
/** Os dados com que se abre um diálogo: viatura, pessoa, atribuição, manutenção, ocorrência, documento e dia. */
export interface DadosDlg { v?: string; p?: string; a?: string; m?: string; o?: string; k?: string; ini?: string }

/** Uma ligação no aviso (por exemplo "Ver no calendário", na semana da manutenção agendada). */
export interface LigacaoAviso { rotulo: string; para: string }
export interface AvisoFrota { texto: string; erro: boolean; n: number; link?: LigacaoAviso }

export interface CtxFrotaExemplo {
  F: Frota;
  /** O utilizador tem a permissão de escrita (inventory.edit). Sem ela, os ecrãs são só de consulta. */
  podeAgir: boolean;
  /** O porquê dos botões de escrita desativados ("A carregar permissões…" enquanto as permissões carregam). */
  semPermissao: string;
  stock: (vid: string) => LinhaCarrinha[];
  obras: readonly ObraRef[];
  /** Corre uma ação na base de exemplo; o aviso (e o toast) dizem sempre o resultado, com uma ligação opcional para onde o efeito se vê. */
  agir: <T>(fn: (F: Frota) => T, ok?: string | ((r: T) => string), link?: LigacaoAviso | ((r: T) => LigacaoAviso | undefined)) => ResultadoFrota<T>;
  avisar: (texto: string, erro?: boolean, link?: LigacaoAviso) => void;
  aviso: AvisoFrota | null;
  abrir: (vid: string, aba?: AbaFicha) => void;
  fechar: () => void;
  dlg: (tipo: TipoDlg, dados?: DadosDlg) => void;
  /** Pede confirmação (AlertDialog) antes de uma ação sem formulário (cancelar reserva, marcar resolvida). */
  confirmar: (p: PedidoConfirmacao) => void;
  repor: () => void;
}

export interface PedidoConfirmacao { titulo: string; texto: string; ok: string; perigo?: boolean; aoConfirmar: () => void }

export const ContextoFrotaExemplo = createContext<CtxFrotaExemplo | null>(null);
export function useFrotaCtx(): CtxFrotaExemplo {
  const c = useContext(ContextoFrotaExemplo);
  if (!c) throw new Error("useFrotaCtx fora da Frota de exemplo");
  return c;
}

/** As rotas de cada ecrã (o Hoje é /frota/hoje para o menu lateral não o marcar ativo em todas as páginas). */
export const ROTA_FROTA: Record<EcraFrota, string> = {
  hoje: "/frota/hoje", viaturas: "/frota/viaturas", atribuicoes: "/frota/atribuicoes", condutores: "/frota/condutores", manutencao: "/frota/manutencao",
  custos: "/frota/custos", ocorrencias: "/frota/ocorrencias", documentos: "/frota/documentos", relatorios: "/frota/relatorios", atividade: "/frota/atividade", ligacoes: "/frota/ligacoes",
};
export const TITULO_FROTA: Record<EcraFrota, string> = {
  hoje: "Hoje", viaturas: "Viaturas", atribuicoes: "Atribuições", condutores: "Condutores", manutencao: "Manutenção", custos: "Abastecimentos e custos",
  ocorrencias: "Ocorrências", documentos: "Documentos", relatorios: "Relatórios", atividade: "Atividade", ligacoes: "Ligações",
};
/** A permissão (existente) que abre a Frota de exemplo, e a que permite registar/alterar. */
export const PERMISSAO_VER_FROTA = "inventory.view";
export const PERMISSAO_AGIR_FROTA = "inventory.edit";
