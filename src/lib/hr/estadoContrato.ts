/**
 * O estado do contrato de uma pessoa, DERIVADO dos vinculos vivos -- nunca
 * mais uma coluna escrita a mao em `pessoas`.
 *
 * PORQUE DEIXOU DE SER UMA COLUNA
 * --------------------------------
 * `pessoas.estado_contrato` era um enum independente do vinculo: nada
 * obrigava os dois a concordar, e uma ficha sem vinculo nenhum podia dizer
 * "Em curso" -- o defeito concreto que motivou esta mudanca. A fonte de
 * verdade passa a ser SEMPRE `pessoas_vinculos`.
 *
 * PORQUE E FUNCAO PURA EM TYPESCRIPT, E NAO VISTA NEM RPC
 * --------------------------------------------------------
 * A regra e uma precedencia sobre quatro valores. Escrita aqui, prova-se com
 * `vitest`; escrita em SQL, so se prova pelo `db push` passar. E o unico sitio
 * onde o teste "ficha sem contrato NAO diz Em curso" pode mesmo correr.
 */
import type { EstadoVinculo } from "@/types/hr";

export type EstadoContratoDerivado =
  | "sem_contrato"
  | "em_curso"
  | "por_iniciar"
  | "suspenso"
  | "terminado";

/**
 * Recebe SO vinculos vivos (`deleted_at IS NULL`) -- filtrar a montante, esta
 * funcao nao sabe nada sobre soft delete.
 *
 * Precedencia, por esta ordem exacta:
 *   1. existe `activo`               -> "em_curso"
 *   2. senao, existe `suspenso`      -> "suspenso"
 *   3. senao, existe `futuro`        -> "por_iniciar"
 *   4. senao, existe `terminado`     -> "terminado"
 *   5. nenhum vinculo (ou so valores desconhecidos) -> "sem_contrato"
 *
 * Suspenso vem antes de futuro: um contrato suspenso e uma relacao laboral
 * EXISTENTE e parada; um futuro ainda nem comecou. Valores desconhecidos
 * (defesa contra dados que este ficheiro ainda nao preveja) sao ignorados,
 * nunca lancam.
 */
export function derivarEstadoContrato(
  vinculos: ReadonlyArray<{ estado: EstadoVinculo }>,
): EstadoContratoDerivado {
  const estados = new Set(vinculos.map((vinculo) => vinculo.estado));
  if (estados.has("activo")) return "em_curso";
  if (estados.has("suspenso")) return "suspenso";
  if (estados.has("futuro")) return "por_iniciar";
  if (estados.has("terminado")) return "terminado";
  return "sem_contrato";
}
