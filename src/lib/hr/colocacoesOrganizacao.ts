/**
 * Regras puras da colocacao das pessoas no organograma, vistas a organizacao inteira
 * (`pessoas_colocacao_organograma`): qual a linha em vigor de cada pessoa e como se grava uma
 * ligacao nova (so criar, ou fechar a actual na vespera e criar a nova).
 */
import type { PessoaColocacaoOrganograma } from "@/types/hr";

/** O dia anterior a uma data AAAA-MM-DD. */
export function diaAnterior(data: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const d = new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, (dia ?? 1) - 1));
  return d.toISOString().slice(0, 10);
}

/**
 * O `valido_ate` com que se desliga uma pessoa hoje. `valido_ate` e inclusivo (a leitura trata `>= hoje` como em vigor),
 * por isso para a pessoa deixar de estar ligada ja hoje fecha-se na vespera. A excepcao e uma ligacao que comecou hoje:
 * a base exige `valido_ate >= valido_de`, e o mais cedo que se pode fechar e o proprio dia.
 */
export function validoAteDeDesligar(validoDe: string, hoje: string): string {
  return validoDe < hoje ? diaAnterior(hoje) : hoje;
}

const emVigor =(l: PessoaColocacaoOrganograma, hoje: string): boolean =>
  l.valido_de <= hoje && (l.valido_ate === null || l.valido_ate >= hoje);

/** A linha em vigor de cada pessoa (a de inicio mais recente, se houver mais de uma). */
export function vigentesPorPessoa(
  linhas: readonly PessoaColocacaoOrganograma[],
  hoje: string,
): Map<string, PessoaColocacaoOrganograma> {
  const mapa = new Map<string, PessoaColocacaoOrganograma>();
  for (const l of linhas) {
    if (!emVigor(l, hoje)) continue;
    const atual = mapa.get(l.pessoa_id);
    if (!atual || l.valido_de > atual.valido_de) mapa.set(l.pessoa_id, l);
  }
  return mapa;
}

export type PlanoGravacao =
  | { tipo: "ligar" | "alterar"; fechar: { id: string; validoAte: string } | null }
  | { erro: "inicioNaoPosterior" };

/** O que gravar para ligar/alterar a pessoa a partir de `desde`, dada a linha em vigor (ou nenhuma). */
export function planearGravacao(vigente: PessoaColocacaoOrganograma | null, desde: string): PlanoGravacao {
  if (!vigente) return { tipo: "ligar", fechar: null };
  if (desde <= vigente.valido_de) return { erro: "inicioNaoPosterior" };
  return { tipo: "alterar", fechar: { id: vigente.id, validoAte: diaAnterior(desde) } };
}
