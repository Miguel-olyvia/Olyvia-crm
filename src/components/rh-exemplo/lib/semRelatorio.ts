/**
 * Na apresentação não se reporta nada a lado nenhum: esta função existe só para os
 * ecrãs copiados continuarem a compilar com a mesma chamada que têm no módulo real.
 */
export type BusinessFlow = string;

export function captureFlowError(_erro: unknown, _fluxo: BusinessFlow): void {
  // Sem relatório de erros: nenhum dado sai desta apresentação.
}
