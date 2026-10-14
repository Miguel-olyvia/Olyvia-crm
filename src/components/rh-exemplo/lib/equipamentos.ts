/**
 * Os equipamentos atribuídos a uma pessoa (fluxo 11, separador Custo): telemóvel, portátil, viatura, fardamento, ferramentas.
 * Contas puras, sem dados de lado nenhum. O valor de aquisição amortiza-se por 36 meses (valor / 36 por mês), do mês da
 * entrega, enquanto o equipamento está atribuído; ao devolver, a amortização pára a partir do mês da devolução (exclusive).
 */
import { MESES_EQUIPAMENTO, arredondar, equipamentoDoMes, equipamentoPorMes, mesDaData, type MesIso } from "./custo";

export const TIPOS_EQUIPAMENTO = ["telemovel", "portatil", "viatura", "fardamento", "ferramentas", "outro"] as const;
export type TipoEquipamento = (typeof TIPOS_EQUIPAMENTO)[number];

export const ESTADOS_DEVOLUCAO = ["bom", "desgaste", "danificado"] as const;
export type EstadoDevolucao = (typeof ESTADOS_DEVOLUCAO)[number];

export interface EquipamentoPessoa {
  id: string;
  pessoaId: string;
  tipo: TipoEquipamento;
  descricao: string;
  /** Valor de aquisição, em euros. */
  valor: number;
  /** Data de entrega (AAAA-MM-DD). */
  entrega: string;
  estado: "atribuido" | "devolvido";
  devolucao: string | null;
  estadoDevolucao: EstadoDevolucao | null;
  autor: string;
}

export interface SituacaoEquipamento {
  /** O que pesa no custo deste mês (0 fora dos 36 meses, antes da entrega ou depois da devolução). */
  amortizacaoMes: number;
  /** Meses já amortizados, até ao mês pedido inclusive (no máximo 36). */
  mesesDecorridos: number;
  /** Meses que faltam amortizar (0 se já está tudo amortizado ou se foi devolvido). */
  mesesRestantes: number;
  /** Valor de aquisição que ainda falta amortizar (0 se tudo amortizado ou devolvido). */
  porAmortizar: number;
  totalmenteAmortizado: boolean;
}

const indice = (mes: MesIso): number => {
  const [ano, m] = mes.split("-").map(Number);
  return ano * 12 + (m - 1);
};

/** O estado de amortização de um equipamento no mês `mes` («AAAA-MM»). */
export function situacaoDoEquipamento(e: EquipamentoPessoa, mes: MesIso): SituacaoEquipamento {
  const desde = indice(mesDaData(e.entrega));
  const ate = e.devolucao === null ? Infinity : indice(mesDaData(e.devolucao));
  const atual = indice(mes);
  const decorridos = Math.max(0, Math.min(MESES_EQUIPAMENTO, atual - desde + 1, ate - desde + 1));
  const devolvido = e.estado === "devolvido" && atual >= ate;
  const restantes = devolvido ? 0 : MESES_EQUIPAMENTO - decorridos;
  const amortizado = arredondar((e.valor * decorridos) / MESES_EQUIPAMENTO);
  return {
    amortizacaoMes: equipamentoDoMes({ entrega: e.entrega, devolucao: e.devolucao }, mes) ? equipamentoPorMes(e.valor) : 0,
    mesesDecorridos: decorridos,
    mesesRestantes: restantes,
    porAmortizar: devolvido ? 0 : arredondar(e.valor - amortizado),
    totalmenteAmortizado: !devolvido && decorridos >= MESES_EQUIPAMENTO,
  };
}

/** Os equipamentos que pesam neste mês no custo da pessoa. */
export const equipamentosDoMes = (lista: readonly EquipamentoPessoa[], mes: MesIso): EquipamentoPessoa[] =>
  lista.filter((e) => equipamentoDoMes({ entrega: e.entrega, devolucao: e.devolucao }, mes));

export type ErroEquipamento = "semDescricao" | "valorZero" | "semData" | "semPessoa";
export type ErroDevolucao = "semData" | "antesDaEntrega" | "semEstado";

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export function validarEquipamento(e: { pessoaId: string; descricao: string; valor: number; entrega: string }): ErroEquipamento | null {
  if (e.pessoaId === "") return "semPessoa";
  if (e.descricao.trim() === "") return "semDescricao";
  if (!Number.isFinite(e.valor) || e.valor <= 0) return "valorZero";
  return DATA.test(e.entrega) ? null : "semData";
}

export function validarDevolucao(e: EquipamentoPessoa, data: string, estado: string): ErroDevolucao | null {
  if (!DATA.test(data)) return "semData";
  if (data < e.entrega) return "antesDaEntrega";
  return (ESTADOS_DEVOLUCAO as readonly string[]).includes(estado) ? null : "semEstado";
}
