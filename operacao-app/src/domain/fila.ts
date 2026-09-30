/**
 * O que fazer quando não há rede.
 *
 * Uma garagem −2 não tem rede. Hoje o técnico responde a seis tarefas, a
 * aplicação avisa a cada uma que não conseguiu gravar, e o valor fica no ecrã
 * — mas se ele fechar a aplicação, ou o telemóvel adormecer, perde tudo. Foi
 * trabalho feito duas vezes.
 *
 * A partir daqui, uma resposta que não conseguiu sair fica **guardada no
 * telemóvel** e sai sozinha quando houver rede.
 *
 * ⚠ A DECISÃO QUE TEM DE ESTAR CERTA
 *
 * Nem toda a falha se guarda para depois. Há duas espécies, e confundi-las é o
 * pior que este código pode fazer:
 *
 *  · **não chegou lá** (sem rede, servidor em baixo) — guarda-se e tenta-se
 *    outra vez. A resposta é boa, o caminho é que não estava;
 *  · **chegou e foi recusada** (sem permissão, ordem já fechada, valor
 *    inválido) — **não** se guarda. Tentar outra vez daria o mesmo não, e
 *    entretanto a pessoa ficava a pensar que estava gravado.
 *
 * Guardar uma recusa seria mentir ao técnico. Deitar fora uma falha de rede
 * seria perder-lhe o trabalho. Por isso esta distinção vive aqui, sozinha e
 * com testes, e não escondida num `catch` de um ecrã.
 */

/* ────────────────────── Que espécie de falha é ─────────────────────────── */

export type EspecieDeFalha = "sem_rede" | "recusada";

/**
 * As marcas de uma falha de transporte.
 *
 * São as mensagens que os browsers dão quando o pedido nem sai — cada um com a
 * sua redação, e nenhum deles em português. Se aparecer uma nova, o pior que
 * acontece é a resposta ser tratada como recusa: o técnico vê o erro e volta a
 * responder. É o lado seguro por onde falhar.
 */
const MARCAS_DE_REDE = [
  "failed to fetch",
  "networkerror",
  "network request failed",
  "load failed",
  "err_internet_disconnected",
  "err_network",
  "the internet connection appears to be offline",
  "timeout",
  "aborted",
];

export function especieDaFalha(
  erro: unknown,
  online: boolean = typeof navigator === "undefined" ? true : navigator.onLine
): EspecieDeFalha {
  // O browser a dizer que não há rede é a prova mais direta que existe.
  if (!online) return "sem_rede";

  const m = (erro instanceof Error ? erro.message : String(erro ?? "")).toLowerCase();
  return MARCAS_DE_REDE.some((marca) => m.includes(marca)) ? "sem_rede" : "recusada";
}

/* ──────────────────────── O que está por enviar ────────────────────────── */

export interface PorEnviar {
  /**
   * O que isto responde. Duas respostas à mesma pergunta têm a mesma chave, e
   * a segunda substitui a primeira — o técnico que corrige um valor antes de
   * haver rede quer que saia o corrigido, e só esse.
   */
  chave: string;
  tipo: "tarefa" | "medicao";
  ordemId: string;
  /** Os argumentos da RPC, tal como iriam. */
  carga: Record<string, unknown>;
  criadaEm: number;
  tentativas: number;
  /** A última razão por que não saiu. Só para se poder dizer à pessoa. */
  ultimoErro?: string;
}

export const chaveDaTarefa = (tarefaId: string) => `tarefa:${tarefaId}`;
export const chaveDaMedicao = (tarefaId: string, medicaoDefId: string) =>
  `medicao:${tarefaId}:${medicaoDefId}`;

/**
 * Junta uma resposta nova às que já esperam.
 *
 * Substitui pela chave, e mantém a ordem por que foram feitas — o servidor há
 * de recebê-las na ordem em que o técnico as deu, que é a que faz sentido para
 * quem depois lê o histórico.
 */
export function juntar(fila: readonly PorEnviar[], nova: PorEnviar): PorEnviar[] {
  const i = fila.findIndex((x) => x.chave === nova.chave);
  if (i === -1) return [...fila, nova];

  const fora = [...fila];
  // Fica no lugar da primeira: a pessoa respondeu àquilo antes de responder ao
  // resto, e corrigir não a põe no fim da bicha.
  fora[i] = { ...nova, criadaEm: fila[i].criadaEm };
  return fora;
}

/**
 * Quantas tentativas antes de desistir de uma resposta.
 *
 * Não é para poupar rede — é para uma resposta que o servidor recusa por uma
 * razão que só aparece à segunda (a ordem foi fechada entretanto, por exemplo)
 * não ficar a bater à porta para sempre. Ao fim disto, diz-se à pessoa.
 */
export const TENTATIVAS_ATE_DESISTIR = 5;

export function desistiu(item: PorEnviar): boolean {
  return item.tentativas >= TENTATIVAS_ATE_DESISTIR;
}

/** O que se diz a quem tem trabalho à espera de rede. */
export function comoContagem(n: number): string {
  if (n <= 0) return "";
  return n === 1 ? "1 resposta por enviar" : `${n} respostas por enviar`;
}
