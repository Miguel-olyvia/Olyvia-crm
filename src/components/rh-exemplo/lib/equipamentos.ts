/**
 * Os equipamentos atribuídos a uma pessoa (fluxo 11, separador Custo): telemóvel, portátil, viatura, fardamento, ferramentas.
 * Contas puras, sem dados de lado nenhum. Cada equipamento tem o seu «como conta» (`comoConta.ts`): pago de uma vez, repartido
 * por N meses (por omissão 36, o do fluxo 11: portátil de 900 € / 36 = 25 € por mês) ou todos os meses. Conta do mês da
 * entrega e, ao devolver, deixa de contar a partir do mês seguinte ao da devolução.
 */
import {
  contaRepartida,
  situacaoDoItem,
  validarConta,
  valorNoMes,
  type ContaItem,
  type ErroConta,
  type ItemParaConta,
  type SituacaoConta,
} from "./comoConta";
import type { MesIso } from "./custo";

export const TIPOS_EQUIPAMENTO = ["telemovel", "portatil", "viatura", "fardamento", "ferramentas", "outro"] as const;
export type TipoEquipamento = (typeof TIPOS_EQUIPAMENTO)[number];

export const ESTADOS_DEVOLUCAO = ["bom", "desgaste", "danificado"] as const;
export type EstadoDevolucao = (typeof ESTADOS_DEVOLUCAO)[number];

export interface EquipamentoPessoa {
  id: string;
  pessoaId: string;
  tipo: TipoEquipamento;
  descricao: string;
  /** Valor de aquisição, em euros (no «todos os meses», o valor de cada mês). */
  valor: number;
  /** Data de entrega (AAAA-MM-DD). */
  entrega: string;
  /** Como conta: de uma vez, repartido por N meses ou todos os meses. */
  conta: ContaItem;
  estado: "atribuido" | "devolvido";
  devolucao: string | null;
  estadoDevolucao: EstadoDevolucao | null;
  autor: string;
}

/** O equipamento visto como um valor que conta (para `comoConta.ts`). */
export const itemDoEquipamento = (e: Pick<EquipamentoPessoa, "valor" | "entrega" | "conta" | "devolucao">): ItemParaConta => ({
  valor: e.valor,
  data: e.entrega,
  conta: e.conta,
  devolucao: e.devolucao,
});

/** O estado do equipamento no mês `mes` («AAAA-MM»): o que conta no mês, o que já contou e o que falta. */
export const situacaoDoEquipamento = (e: EquipamentoPessoa, mes: MesIso): SituacaoConta => situacaoDoItem(itemDoEquipamento(e), mes);

/** O que o equipamento conta no mês (0 fora do período, antes da entrega ou depois da devolução). */
export const valorDoEquipamentoNoMes = (e: EquipamentoPessoa, mes: MesIso): number => valorNoMes(itemDoEquipamento(e), mes);

/** Os equipamentos que contam neste mês no custo da pessoa. */
export const equipamentosDoMes = (lista: readonly EquipamentoPessoa[], mes: MesIso): EquipamentoPessoa[] =>
  lista.filter((e) => valorDoEquipamentoNoMes(e, mes) > 0);

export type ErroEquipamento = "semDescricao" | "valorZero" | "semData" | "semPessoa" | ErroConta;
export type ErroDevolucao = "semData" | "antesDaEntrega" | "semEstado";

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Sem `conta` vale o que o documento diz: repartido por 36 meses. */
export function validarEquipamento(e: { pessoaId: string; descricao: string; valor: number; entrega: string; conta?: ContaItem }): ErroEquipamento | null {
  if (e.pessoaId === "") return "semPessoa";
  if (e.descricao.trim() === "") return "semDescricao";
  if (!Number.isFinite(e.valor) || e.valor <= 0) return "valorZero";
  if (!DATA.test(e.entrega)) return "semData";
  return validarConta(e.conta ?? contaRepartida());
}

export function validarDevolucao(e: EquipamentoPessoa, data: string, estado: string): ErroDevolucao | null {
  if (!DATA.test(data)) return "semData";
  if (data < e.entrega) return "antesDaEntrega";
  return (ESTADOS_DEVOLUCAO as readonly string[]).includes(estado) ? null : "semEstado";
}
