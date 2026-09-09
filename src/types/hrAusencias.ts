/**
 * As formas das linhas do modulo de AUSENCIAS E FERIAS.
 *
 * Vivem em ficheiro proprio e nao em `src/types/hr.ts` porque sao sete tabelas
 * novas e uma vista, e porque cinco delas tem ESCRITA FECHADA: o cliente le, e
 * escreve so por RPC. Ter os tipos juntos torna essa fronteira visivel.
 */

export type CategoriaAusencia =
  | "ferias"
  | "doenca"
  | "parentalidade"
  | "sem_retribuicao"
  | "falta_justificada"
  | "falta_injustificada"
  | "compensacao"
  | "outro";

/** `hr_ausencias_tipos` (20261121020000). Escrita DIRECTA permitida. */
export interface AusenciaTipo {
  id: string;
  organization_id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  categoria: CategoriaAusencia;
  cor: string | null;
  remunerada: boolean;
  desconta_saldo: boolean;
  conta_minimo_legal: boolean;
  exige_aprovacao_chefia: boolean;
  exige_aprovacao_rh: boolean;
  exige_justificacao: boolean;
  justificacao_sensivel: boolean;
  permite_meio_dia: boolean;
  inclui_fim_de_semana: boolean;
  inclui_feriados: boolean;
  antecedencia_minima_dias: number;
  /** SO apresentacao. A contabilidade do modulo e sempre em dias. */
  unidade_apresentacao: "dia" | "hora";
  activo: boolean;
}

export type OrigemDireito = "legal" | "contrato" | "manual" | "importacao";

/** `pessoas_ausencias_direitos` (20261121030000). Escrita DIRECTA permitida. */
export interface AusenciaDireito {
  id: string;
  pessoa_id: string;
  organization_id: string;
  tipo_id: string;
  vinculo_id: string | null;
  periodo_inicio: string;
  periodo_fim: string;
  dias_direito: number;
  minutos_direito: number | null;
  origem: OrigemDireito;
  notas: string | null;
}

export type MotivoAjuste =
  | "correccao"
  | "transporte_periodo_anterior"
  | "troca_por_dinheiro"
  | "premio"
  | "acerto_admissao"
  | "acerto_cessacao"
  | "outro";

/** `pessoas_ausencias_ajustes` (20261121040000). ESCRITA SO POR RPC. */
export interface AusenciaAjuste {
  id: string;
  pessoa_id: string;
  organization_id: string;
  tipo_id: string;
  periodo_inicio: string;
  periodo_fim: string;
  /** Com sinal. Nunca zero. */
  dias: number;
  motivo_codigo: MotivoAjuste;
  motivo: string;
  documento_ref: string | null;
  aplicado_em: string;
  anulado_em: string | null;
  anulacao_motivo: string | null;
}

export type EstadoPedido =
  | "pendente_chefia"
  | "pendente_rh"
  | "aprovado"
  | "recusado"
  | "cancelado";

/** `pessoas_ausencias_pedidos` (20261121060000). ESCRITA SO POR RPC. */
export interface AusenciaPedido {
  id: string;
  organization_id: string;
  pessoa_id: string;
  tipo_id: string;
  vinculo_id: string | null;
  data_inicio: string;
  data_fim: string;
  meio_dia_inicio: boolean;
  meio_dia_fim: boolean;
  hora_inicio: string | null;
  hora_fim: string | null;
  /** GRAVADO pela RPC. Nunca recalcular na interface para o mostrar. */
  dias_solicitados: number;
  // SEM `motivo`: a coluna nao tem SELECT directo para authenticated desde a
  // migration 20261122050000. Le-se so por `rpc_hr_ausencia_ver_motivo`
  // (ver useAusenciasDaOrganizacao/useAusenciasDaPessoa `verMotivo`).
  estado: EstadoPedido;
  aprovador_chefia_pessoa_id: string | null;
  criado_por_pessoa_id: string | null;
  origem: "board" | "ficha" | "importacao";
  schedule_item_id: string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  created_at: string;
}

export type PassoDecisao = "chefia" | "rh";
export type ResultadoDecisao =
  | "aprovado"
  | "recusado"
  | "dispensado"
  | "ajustado"
  | "devolvido";

/** `pessoas_ausencias_pedido_decisoes` (20261121070000). Append-only. */
export interface AusenciaDecisao {
  id: string;
  pedido_id: string;
  pessoa_id: string;
  organization_id: string;
  ordem: number;
  passo: PassoDecisao;
  resultado: ResultadoDecisao;
  decidido_por_pessoa_id: string | null;
  decidido_em: string;
  motivo: string | null;
  ajuste_data_inicio: string | null;
  ajuste_data_fim: string | null;
  ajuste_dias: number | null;
}

export type EstadoDia = "pendente" | "aprovado" | "recusado" | "cancelado";

/** `pessoas_ausencias_dias` (20261121080000). Uma linha por dia civil. */
export interface AusenciaDia {
  id: string;
  pedido_id: string;
  pessoa_id: string;
  organization_id: string;
  tipo_id: string;
  data: string;
  fraccao_dia: number;
  conta_saldo: boolean;
  e_feriado: boolean;
  e_fim_semana: boolean;
  periodo_inicio: string;
  estado: EstadoDia;
}

/** Uma linha de `v_hr_ausencias_saldos`. Nunca ha coluna de saldo. */
export interface AusenciaSaldo {
  pessoa_id: string;
  organization_id: string;
  tipo_id: string;
  periodo_inicio: string;
  adquiridos: number;
  ajustes: number;
  utilizados: number;
  pendentes: number;
  disponiveis: number;
}

/** O que `rpc_hr_ausencia_ver_justificacao` devolve, uma vez, sob registo. */
export interface AusenciaJustificacaoRevelada {
  id: string;
  tipo_documento: string | null;
  documento_ref: string | null;
  texto: string | null;
  entidade_emissora: string | null;
  data_documento: string | null;
}
