/**
 * As regras puras de que estado da admissão admite que ação (processo aberto, prolongar, cancelar), as do RH real. Só lógica,
 * sem componentes nem base: pode importar-se sem arrastar o resto. Fica aqui, em hooks/, porque é o único sítio de rh-exemplo
 * onde o teste guarda (semBase.test.ts) deixa importar código real de RH.
 */
export { cancelarExigeAprovar, podeCancelar, podeProlongar, processoAberto } from "@/lib/hr/estadoAdmissao";
