// Lógica pura do campo opcional «Pessoa do RH» do formulário de utilizador: que fichas se oferecem e quando se liga.
// A ligação é a de `rpc_hr_ligar_conta` (pessoas_contas): a mesma que a ficha do RH faz. Sem ela, os ecrãs pessoais do RH
// (O meu ponto, Ausências, Documentos) dizem que a conta não está ligada a nenhuma ficha. Desligar faz-se na ficha do RH.
import type { ResultadoMutacao, Vinculo } from "./tipos";

/** Uma ficha de RH (`pessoas`) que se pode ligar a esta conta. */
export interface PessoaRh {
  id: string;
  nome: string;
  /** Número interno ou e-mail de trabalho, para distinguir homónimos. */
  detalhe: string | null;
}

/** O que a página entrega ao formulário. Sem `hr.pessoas.conta.link` na organização ativa, `podeLigar` é falso e o campo não aparece. */
export interface EstadoPessoaRh {
  podeLigar: boolean;
  /** A organização ativa: é dela que vêm as fichas e é nela que a ligação é feita. */
  organizacaoId: string | null;
  /** Fichas sem conta ativa ligada (mais a ligada a este utilizador, se houver). */
  pessoas: PessoaRh[];
  /** A ficha já ligada a este utilizador nesta organização, ou `null`. */
  ligadaId: string | null;
  carregando: boolean;
  erro: string | null;
  /** Liga a ficha à conta (`anew_users.id`). Devolve o erro já em texto. */
  ligar: (pessoaId: string, utilizadorId: string) => Promise<ResultadoMutacao>;
}

export interface LinhaPessoaRh {
  id: string;
  nome_completo: string | null;
  numero_interno: string | null;
  email_trabalho: string | null;
}

export interface LinhaContaRh {
  pessoa_id: string;
  anew_user_id: string;
}

/**
 * As fichas que se oferecem: as que não têm conta ativa ligada, mais a ligada a este utilizador. A exclusão é uma
 * cortesia (quem não vê todas as ligações pode ver uma ficha já ligada): a garantia é a RPC, que recusa.
 */
export function pessoasLigaveis(pessoas: readonly LinhaPessoaRh[], contas: readonly LinhaContaRh[], utilizadorId?: string) {
  const ocupadas = new Set(contas.filter((c) => c.anew_user_id !== utilizadorId).map((c) => c.pessoa_id));
  const ligadaId = utilizadorId ? contas.find((c) => c.anew_user_id === utilizadorId)?.pessoa_id ?? null : null;
  const lista: PessoaRh[] = pessoas
    .filter((p) => !ocupadas.has(p.id))
    .map((p) => ({ id: p.id, nome: p.nome_completo?.trim() || p.id, detalhe: p.numero_interno || p.email_trabalho || null }));
  return { pessoas: lista, ligadaId };
}

/** A RPC exige membership ativa na organização da ficha: só se liga com um vínculo completo nessa organização. */
export function temVinculoNaOrganizacao(vinculos: readonly Vinculo[], organizacaoId: string | null): boolean {
  return !!organizacaoId && vinculos.some((v) => v.organizacaoId === organizacaoId && !!v.roleId);
}

/** A ficha a ligar depois de gravar, ou `null` (sem permissão, nada escolhido, já ligada, ou sem vínculo na organização). */
export function pessoaALigar(estado: EstadoPessoaRh | undefined, escolhida: string, vinculos: readonly Vinculo[]): string | null {
  if (!estado?.podeLigar || !escolhida || estado.ligadaId) return null;
  if (!temVinculoNaOrganizacao(vinculos, estado.organizacaoId)) return null;
  return escolhida;
}
