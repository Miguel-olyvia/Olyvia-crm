// Resolver uma submissão pendente, em memória: a lista desce e a nota fica na ficha da
// pessoa certa. Não grava nada. A única ação é "registar na ficha como nota"; num conflito
// é preciso dizer qual das candidatas é a pessoa.
import type { EstadoPessoas, NotaPessoa, Submissao } from "./pessoasTipos";

/** Conflitos primeiro; dentro de cada grupo, a data mais recente primeiro. */
export function ordenarSubmissoes(submissoes: readonly Submissao[]): Submissao[] {
  const conflito = (s: Submissao) => (s.codigo === "CONFLITO" ? 0 : 1);
  return [...submissoes].sort((a, b) => conflito(a) - conflito(b) || b.data.localeCompare(a.data));
}

/** Quem tem pelo menos uma submissão pendente (as duas candidatas de um conflito contam). */
export function pessoasComPendentes(submissoes: readonly Submissao[]): Set<string> {
  return new Set(submissoes.flatMap((s) => s.candidatas.map((c) => c.pessoaId)));
}

/**
 * "Voltou a contactar": quem tem submissões pendentes e ainda não foi respondida (só um resultado "atendeu" conta, ver
 * `registarChamada`) nem marcada como perdida.
 */
export function pessoasQueVoltaram(
  estado: Pick<EstadoPessoas, "pessoas" | "contactadas">, submissoes: readonly Submissao[],
): Set<string> {
  const ids = pessoasComPendentes(submissoes);
  estado.contactadas.forEach((id) => ids.delete(id));
  estado.pessoas.filter((p) => p.perdida).forEach((p) => ids.delete(p.id));
  return ids;
}

/** A pessoa a quem a nota vai: a escolhida (obrigatória num conflito) ou a única candidata; `null` se não for válida. */
function pessoaDaNota(s: Submissao, escolhida?: string): string | null {
  const ids = s.candidatas.map((c) => c.pessoaId);
  if (s.codigo === "CONFLITO") return escolhida !== undefined && ids.includes(escolhida) ? escolhida : null;
  if (escolhida !== undefined && escolhida !== ids[0]) return null;
  return ids[0] ?? null;
}

/**
 * Devolve o estado novo: a submissão sai da lista e a nota entra na ficha. Se a submissão não
 * existe ou a pessoa não é válida, devolve o próprio estado, sem mudanças.
 */
export function resolverSubmissao<E extends Pick<EstadoPessoas, "submissoes" | "notas">>(
  estado: E, submissaoId: string, pessoaId?: string,
): E {
  const submissao = estado.submissoes.find((s) => s.id === submissaoId);
  const destino = submissao ? pessoaDaNota(submissao, pessoaId) : null;
  if (!submissao || destino === null) return estado;
  const nota: NotaPessoa = {
    id: `nota-${submissao.id}`,
    pessoaId: destino,
    submissaoId: submissao.id,
    formulario: submissao.formulario,
    data: submissao.data,
    campos: submissao.campos,
  };
  return {
    ...estado,
    submissoes: estado.submissoes.filter((s) => s.id !== submissaoId),
    notas: [...estado.notas, nota],
  };
}
