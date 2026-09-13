/**
 * Regras de negocio de `pessoas_colocacao_organograma` (20261130080000),
 * partilhadas entre o hook (`usePessoaColocacaoOrganograma`) e o ecra
 * (`PessoaColocacaoOrganogramaSeccao`).
 *
 * PORQUE SO ISTO VIVE AQUI, E O RESTO REAPROVEITA `lib/hr/afectacoes.ts`
 * -------------------------------------------------------------------------
 * `dataDeHojeISO`, `periodoDecorrido`, `bucketDePermissao`, `diaSeguinte`,
 * `estaEmAberto`, `mensagemDeErro` e `ehErroNomeado` nao sao especificas de
 * afectacoes -- sao a MESMA regra de ALTERAR-vs-CORRIGIR que espelha
 * `public.hr_periodo_decorrido(date)`, partilhada por todos os satelites
 * versionados deste modulo (afectacoes, horas contratadas, colocacao no
 * organograma). Reescreve-las aqui duplicava a logica e o risco de as duas
 * copias divergirem -- por isso o hook e o ecra desta seccao importam-nas
 * directamente de `@/lib/hr/afectacoes`. So o que e mesmo proprio desta
 * tabela -- a ordenacao pelo seu tipo, e o nome do erro de sobreposicao --
 * vive aqui.
 */
import type { PessoaColocacaoOrganograma } from "@/types/hr";
import { estaEmAberto } from "@/lib/hr/afectacoes";

/**
 * Nome do erro que `public.hr_colocacao_organograma_sem_sobreposicao`
 * (20261130080000) levanta quando dois intervalos de colocacao da mesma
 * pessoa se cruzam no tempo -- so um no de organograma vigora de cada vez.
 */
export const ERRO_COLOCACAO_SOBREPOSTA = "colocacao_organograma_sobreposta";

/** Ordena para mostrar: em aberto primeiro, depois o historico, mais recente
 *  primeiro -- o mesmo criterio de `ordenarAfectacoes`. */
export function ordenarColocacoes(
  linhas: PessoaColocacaoOrganograma[],
): PessoaColocacaoOrganograma[] {
  return [...linhas].sort((a, b) => {
    const aAberta = estaEmAberto(a);
    const bAberta = estaEmAberto(b);
    if (aAberta !== bAberta) return aAberta ? -1 : 1;
    return b.valido_de.localeCompare(a.valido_de);
  });
}
