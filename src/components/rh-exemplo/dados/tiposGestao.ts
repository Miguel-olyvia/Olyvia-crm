/**
 * O que a apresentação de gestão de RH guarda em memória, ALÉM das fichas: picagens, faltas, desvios,
 * cláusulas, códigos de processamento salarial, períodos, configuração da admissão e regras de fim de contrato.
 * Vive num store à parte (`lojaGestao.ts`) para não mexer na forma das fichas.
 */
import type { ConfiguracaoCampo } from "@/components/rh-exemplo/lib/admissaoObrigatorios";
import type { RegraFimContratoOrg } from "@/components/rh-exemplo/lib/fimContrato";
import type { HrCodigoProcessamento, HrPeriodoProcessamento, HrProcessamentoLancamento } from "@/components/rh-exemplo/tipos";
import type { Desvio, Falta, Picagem } from "@/components/rh-exemplo/tiposAssiduidade";

export interface ClausulaExemplo {
  id: string;
  organization_id: string;
  nome: string;
  categoria: string | null;
  corpo_html: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ObraHorasExemplo {
  id: string;
  pessoa_id: string;
  organization_id: string;
  data: string;
  horas: number;
  descricao: string;
  registado_por: string | null;
  anulado_em: string | null;
  anulado_por: string | null;
  anulado_motivo: string | null;
  created_at: string;
}

export interface EstadoGestao {
  picagens: Picagem[];
  faltas: Falta[];
  desvios: Desvio[];
  obras: ObraHorasExemplo[];
  clausulas: ClausulaExemplo[];
  codigos: HrCodigoProcessamento[];
  /** Minutos mínimos por dia para ter direito ao subsídio de alimentação (`null` = ainda sem regra gravada). */
  minutosMinimosSubsidio: number | null;
  periodos: HrPeriodoProcessamento[];
  lancamentos: HrProcessamentoLancamento[];
  admissaoCampos: ConfiguracaoCampo[];
  regrasFimContrato: RegraFimContratoOrg | null;
}
