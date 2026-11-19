// Ajudas dos testes das adendas (21/10/2026): o percurso como o do orçamento, sem passar pelos ecrãs.
import type { Acoes, Negocio } from "./motor";
import { faturasAdenda } from "./adendas";

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

let numTeste = 0;
/** 19/11 (auditoria): a Olyvia já não emite as faturas das adendas (faturarAdendas recusa): o Financeiro regista o número do Eticadata.
 *  Aqui, com um número de teste: a fatura da 1.ª parcela das adendas assinadas sem faturas (só a `n`, se vier), como fazia faturarAdendas. */
export function registarFaturasAdenda(A: Acoes, d: Negocio, n?: string): void {
  for (const a of (d.adendas ?? []).filter((x) => x.estado === "assinada" && (!n || x.n === n) && !faturasAdenda(x).length))
    A.registarFaturaAdenda(d.id, a.n, `FAT TESTE/${++numTeste}`);
}
