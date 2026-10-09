/**
 * O rascunho do separador Contratos: o que o ecra edita antes de gravar, e as
 * duas conversoes de texto que `gravar()` usa. Saiu de `PessoaContratoTab.tsx`
 * (que passava das 800 linhas) para os tres grupos de campos o poderem partilhar.
 */
import { mesesDaDataFim } from "@/hooks/useFimDoContratoPorMeses";
import { tipoTemDuracaoEmMeses } from "@/lib/hr/contrato";
import type { CampoNumericoContrato } from "@/lib/hr/contrato";
import type {
  CategoriaFuncao,
  DiaSemana,
  EstadoVinculo,
  HorasFrequencia,
  PeriodoExperimentalOrigem,
  PessoaVinculo,
  PoliticaFeriados,
  RegimeContratual,
  RegimeTrabalho,
  TipoContrato,
} from "@/types/hr";

export type RascunhoVinculo = {
  tipo_contrato: TipoContrato;
  /** "Tipo de trabalho": tempo integral ou parcial. */
  regime: RegimeTrabalho;
  /** "Regime contratual": individual ou coletivo. */
  regime_contratual: RegimeContratual;
  estado: EstadoVinculo;
  data_inicio: string;
  data_fim: string;
  /**
   * UI, nao dados: so no termo certo. Nao ha coluna: ao abrir um contrato sai
   * da data de fim (`mesesDaDataFim`, vazio se nenhuma duracao a produz) e
   * depois recalcula a data ao mudar o inicio ou os meses. Nunca e gravado.
   */
  duracao_meses: string;
  motivo_termo: string;
  periodo_experimental_dias: string;
  periodo_experimental_ate: string;
  /** `null` = ainda ninguem escolheu; alimenta so a sugestao de periodo experimental. */
  categoria_funcao: CategoriaFuncao | null;
  /** `null` = contrato anterior a esta funcionalidade, ou nunca gravado. */
  periodo_experimental_origem: PeriodoExperimentalOrigem | null;
  tipo_trabalho: string;
  /** A quantidade, na unidade de `horas_frequencia`. Nao necessariamente semanal. */
  horas_periodo: string;
  horas_frequencia: HorasFrequencia;
  tempo_trabalho_pct: string;
  politica_feriados: PoliticaFeriados;
  horas_anuais_maximas: string;
  horas_semanais_maximas: string;
  dias_uteis: DiaSemana[];
  // -- Admissao, 20261124080000 ---------------------------------------------
  categoria_profissional: string;
  /** "" = por decidir (`null` na base); nao e o mesmo que um booleano falso. */
  renovavel: "" | "sim" | "nao";
  isencao_horario: boolean;
  formacao_inicio: string;
  formacao_fim: string;
};

/** Um contrato "tem periodo experimental" se algum dos dois campos vier
 *  preenchido. Nao ha coluna que o diga -- e derivado, e e de proposito: uma
 *  coluna booleana podia contradizer os valores ao lado dela. */
export function temAlgumExperimental(rascunho: RascunhoVinculo): boolean {
  return (
    rascunho.periodo_experimental_dias.trim() !== "" ||
    rascunho.periodo_experimental_ate.trim() !== ""
  );
}

export function rascunhoDe(vinculo: PessoaVinculo | null): RascunhoVinculo {
  const tipo = vinculo?.tipo_contrato ?? "sem_termo";
  const dataInicio = vinculo?.data_inicio ?? "";
  const dataFim = vinculo?.data_fim ?? "";
  return {
    tipo_contrato: tipo,
    regime: vinculo?.regime ?? "tempo_inteiro",
    regime_contratual: vinculo?.regime_contratual ?? "individual",
    estado: vinculo?.estado ?? "activo",
    data_inicio: dataInicio,
    data_fim: dataFim,
    duracao_meses: tipoTemDuracaoEmMeses(tipo) ? mesesDaDataFim(dataInicio, dataFim) : "",
    motivo_termo: vinculo?.motivo_termo ?? "",
    periodo_experimental_dias:
      vinculo?.periodo_experimental_dias == null ? "" : String(vinculo.periodo_experimental_dias),
    periodo_experimental_ate: vinculo?.periodo_experimental_ate ?? "",
    categoria_funcao: vinculo?.categoria_funcao ?? null,
    periodo_experimental_origem: vinculo?.periodo_experimental_origem ?? null,
    tipo_trabalho: vinculo?.tipo_trabalho ?? "",
    horas_periodo: vinculo?.horas_periodo == null ? "" : String(vinculo.horas_periodo),
    horas_frequencia: vinculo?.horas_frequencia ?? "semanal",
    tempo_trabalho_pct:
      vinculo?.tempo_trabalho_pct == null ? "" : String(vinculo.tempo_trabalho_pct),
    politica_feriados: vinculo?.politica_feriados ?? "nao_laboral",
    horas_anuais_maximas:
      vinculo?.horas_anuais_maximas == null ? "" : String(vinculo.horas_anuais_maximas),
    horas_semanais_maximas:
      vinculo?.horas_semanais_maximas == null ? "" : String(vinculo.horas_semanais_maximas),
    dias_uteis: vinculo?.dias_uteis ?? [],
    categoria_profissional: vinculo?.categoria_profissional ?? "",
    renovavel:
      vinculo?.renovavel === null || vinculo?.renovavel === undefined
        ? ""
        : vinculo.renovavel
          ? "sim"
          : "nao",
    isencao_horario: vinculo?.isencao_horario ?? false,
    formacao_inicio: vinculo?.formacao_inicio ?? "",
    formacao_fim: vinculo?.formacao_fim ?? "",
  };
}

/** Onde vive, NESTE ecra, cada numero validado por `lib/hr/contrato`. */
export const CAMPOS_NUMERICOS: Record<CampoNumericoContrato, string> = {
  horas: "hr-contrato-horas-periodo",
  maximoSemanal: "hr-contrato-horas-semanais-maximas",
  maximoAnual: "hr-contrato-horas-anuais-maximas",
  fte: "hr-contrato-tempo-trabalho-pct",
  experimental: "hr-contrato-periodo-experimental-dias",
};

export function numeroOuNull(valor: string): number | null {
  const limpo = valor.trim().replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

export function textoOuNull(valor: string): string | null {
  return valor.trim() === "" ? null : valor.trim();
}

/** Como um grupo de campos escreve no rascunho (o `definir` do separador). */
export type DefinirCampo = <K extends keyof RascunhoVinculo>(
  campo: K,
  valor: RascunhoVinculo[K],
) => void;
