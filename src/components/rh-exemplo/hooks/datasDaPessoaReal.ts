/**
 * A regra das tres datas da pessoa (contratacao, antiguidade, saida) derivadas dos contratos, a mesma que o servidor aplica.
 * Fica aqui, em hooks/, porque e o unico sitio de rh-exemplo onde o teste guarda (semBase.test.ts) deixa importar codigo real
 * de RH (`@/lib/hr`).
 */
export { datasDaPessoa } from "@/lib/hr/datasDaPessoa";
export type { DatasDaPessoa, VinculoParaDatas } from "@/lib/hr/datasDaPessoa";
