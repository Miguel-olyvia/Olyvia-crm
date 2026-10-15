// O contexto dos ecrãs da Frota (app real): o retrato lido da BD, as permissões fleet.*, como agir (RPC + invalidação +
// aviso), a ficha da viatura e os diálogos. Os filtros vivem no URL de cada ecrã (?vista=…).
import { createContext, useContext } from "react";
import type { AcaoFrota, EstadoDadosFrota, Frota, LinhaStock } from "./dados";

export type EcraFrota = "hoje" | "viaturas" | "atribuicoes" | "condutores" | "manutencao" | "custos" | "ocorrencias" | "documentos" | "relatorios" | "atividade" | "ligacoes";
export type AbaFicha = "resumo" | "atrib" | "manut" | "custos" | "ocorr" | "docs" | "stock" | "lig" | "hist";
export type TipoDlg =
  | "atribuir" | "devolver" | "km" | "abastecer" | "despesa" | "importar" | "manut" | "concluir" | "estado" | "ocorrencia" | "identificar"
  | "renovar" | "nova" | "condutor" | "ligar" | "reposicao" | "minimo" | "editar" | "rever";
/** Os dados com que se abre um diálogo: viatura, condutor, atribuição, manutenção, ocorrência, documento, dia, artigo e importação. */
export interface DadosDlg { v?: string; p?: string; a?: string; m?: string; o?: string; k?: string; ini?: string; produto?: string; imp?: string }

/** Uma ligação no aviso (por exemplo "Ver no calendário", na semana da manutenção agendada). */
export interface LigacaoAviso { rotulo: string; para: string; externo?: boolean }
export interface AvisoFrota { texto: string; erro: boolean; n: number; link?: LigacaoAviso }
export interface ResultadoFrota<T> { ok: boolean; valor: T | undefined; erro: string }

/** As permissões da Frota (anew_permissions) e as dos módulos ligados. */
export const PERM = {
  ver: "fleet.view", gerir: "fleet.manage", custos: "fleet.costs", self: "fleet.self",
  inventario: "inventory.edit", criarArmazem: "warehouses.create", verArmazens: "warehouses.view",
  operacoes: "operations.view", agenda: "scheduling.view",
} as const;

/** O que uma ação exige (o mesmo que o fn_fleet_assert da RPC). */
export type Requisito = "gerir" | "custos" | "gerirOuCustos" | "gerirOuSelf" | "inventario" | "minimo";
export const PERMS_REQUISITO: Record<Requisito, { lista: string[]; todas?: boolean }> = {
  gerir: { lista: [PERM.gerir] },
  custos: { lista: [PERM.custos] },
  gerirOuCustos: { lista: [PERM.gerir, PERM.custos] },
  gerirOuSelf: { lista: [PERM.gerir, PERM.self] },
  inventario: { lista: [PERM.inventario] },
  minimo: { lista: [PERM.gerir, PERM.inventario], todas: true },
};

export interface CtxFrota {
  F: Frota;
  dados: EstadoDadosFrota;
  /** O utilizador pode fazer isto? Sem a permissão, `porque` diz o que falta ("A carregar permissões…" enquanto carregam). */
  pode: (r: Requisito) => { ok: boolean; porque: string };
  /** Tem a permissão (código anew_permissions). */
  tem: (perm: string) => boolean;
  stock: (vid: string) => LinhaStock[];
  /**
   * Corre uma RPC da Frota: no fim invalida as consultas da ação (todos os ecrãs ligados atualizam) e o aviso (e o toast)
   * dizem o resultado, com uma ligação opcional para onde o efeito se vê. Erro da RPC → aviso de erro, nada muda.
   */
  agir: <T>(
    acao: AcaoFrota, chamada: () => Promise<T>,
    msg: { ok: string | ((r: T) => string); link?: LigacaoAviso | ((r: T) => LigacaoAviso | undefined) },
  ) => Promise<ResultadoFrota<T>>;
  avisar: (texto: string, erro?: boolean, link?: LigacaoAviso) => void;
  aviso: AvisoFrota | null;
  abrir: (vid: string, aba?: AbaFicha) => void;
  fechar: () => void;
  dlg: (tipo: TipoDlg, dados?: DadosDlg) => void;
  /** Pede confirmação (AlertDialog) antes de uma ação sem formulário (cancelar reserva, marcar resolvida…). */
  confirmar: (p: PedidoConfirmacao) => void;
}

export interface PedidoConfirmacao { titulo: string; texto: string; ok: string; perigo?: boolean; aoConfirmar: () => void }

export const ContextoFrota = createContext<CtxFrota | null>(null);
export function useFrotaCtx(): CtxFrota {
  const c = useContext(ContextoFrota);
  if (!c) throw new Error("useFrotaCtx fora da Frota");
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
/** As permissões que abrem a Frota (rotas e menu): a gestão (fleet.view) ou o condutor (fleet.self). */
export const PERMISSOES_VER_FROTA = [PERM.ver, PERM.self];
