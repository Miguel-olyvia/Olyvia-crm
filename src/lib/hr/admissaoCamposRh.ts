/**
 * Campos de admissao que sao do RH, nunca da pessoa: nao aparecem no convite e
 * nao se configuram (a base devolve-os com `configuravel = false`). Os
 * obrigatorios ficam como pendencia da ficha ate estarem preenchidos; os
 * opcionais nunca ficam pendentes.
 *
 * Os rotulos vivem em `hr.pendencias.campo.<codigo>`, tal como os dos campos da
 * pessoa -- uma so familia de chaves para o ecra de configuracao, as pendencias
 * da ficha e as mensagens de erro.
 */
export interface CampoRhAdmissao {
  codigo: string;
  /** Chave de traducao de uma nota curta por baixo do rotulo. */
  nota?: string;
  /**
   * `false` esconde o campo no ecra. Gancho para o lote dos horarios: o tipo de
   * horario so passa a obrigatorio quando esse lote existir.
   */
  disponivel?: boolean;
}

export const CAMPOS_RH_OBRIGATORIOS: readonly CampoRhAdmissao[] = [
  { codigo: "data_admissao" },
  { codigo: "cargo" },
  { codigo: "tipo_contrato" },
  { codigo: "tipo_horario", disponivel: false },
  { codigo: "subsidio_alimentacao", nota: "hr.admissao.subsidioZeroConta" },
  { codigo: "duodecimos", nota: "hr.admissao.duodecimosOmissao" },
] as const;

export const CAMPOS_RH_OPCIONAIS: readonly CampoRhAdmissao[] = [
  { codigo: "local_trabalho" },
  { codigo: "reporta_a" },
] as const;

/** Chave de traducao do rotulo de qualquer codigo de admissao (pessoa ou RH). */
export function chaveEtiquetaCampo(codigo: string): string {
  return `hr.pendencias.campo.${codigo}`;
}
