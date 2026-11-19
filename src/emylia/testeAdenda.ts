// Ajudas dos testes das adendas (21/10/2026): o percurso como o do orçamento, sem passar pelos ecrãs.
import type { Acoes } from "./motor";

/** Da adenda criada (rascunho) ao contrato da adenda no portal, por assinar: verificar e enviar, o cliente aceita, o comercial gera o contrato. */
export function adendaPorAssinar(A: Acoes, id: number, n: string): void {
  A.verificarEnviarAdenda(id, n);
  A.aceitarAdenda(id, n);
  A.enviarContratoAdenda(id, n);
}

/** E o cliente assina (Chave Móvel Digital, simulada). */
export function adendaAssinada(A: Acoes, id: number, n: string): void {
  adendaPorAssinar(A, id, n);
  A.simularAdenda(id, n);
}
