// Regra do conflito de interesses: quem é visado pela denúncia, ou declarou conflito, não pode ser o responsável do caso.
import type { Denuncia } from "./tipos";

export type MotivoBloqueio = "denunciado" | "conflito";

type ComPessoas = Pick<Denuncia, "denunciados" | "conflitos">;

/** Devolve o motivo pelo qual a pessoa não pode ficar com o caso, ou null se pode. */
export function motivoDeBloqueio(d: ComPessoas, responsavelId: string): MotivoBloqueio | null {
  if (d.denunciados.includes(responsavelId)) return "denunciado";
  if (d.conflitos.includes(responsavelId)) return "conflito";
  return null;
}

export const podeSerResponsavel = (d: ComPessoas, responsavelId: string): boolean => motivoDeBloqueio(d, responsavelId) === null;
