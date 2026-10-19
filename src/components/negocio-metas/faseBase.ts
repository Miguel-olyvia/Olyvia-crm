// A fase em que um negócio se perde, tal como a base a aceita. O protótipo guarda `FaseNaPerda` (inclui «ganho»); a base só aceita
// lead, contacto, visita, levantamento, orcamento, proposta e contrato. Funções puras.
import type { FaseNaPerda } from "./percursoNegocio";

/** As fases de `FaseNaPerda` que a base aceita tal como estão. */
export type FaseBase = Exclude<FaseNaPerda, "ganho">;

/** «ganho» não existe na base: um negócio nessa fase estava no contrato. As outras seguem como estão. */
export function faseParaBase(fase: FaseNaPerda): FaseBase {
  return fase === "ganho" ? "contrato" : fase;
}
