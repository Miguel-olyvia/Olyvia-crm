// Os erros das funções de visita, lidos por diálogo. O mesmo código quer dizer coisas diferentes consoante o ecrã (NG008 ao marcar é
// «quadro ou recurso indisponível»; NG004 no resultado é «visita indisponível»), por isso este mapa reinterpreta-os SÓ dentro dos diálogos
// de visita. `errosNeg.ts` fica como está e continua a dar a leitura geral de cada código.
import { ErroNeg } from "./chamarNeg";
import { CHAVES_ERRO_NEG, CHAVE_ERRO_GENERICO } from "./errosNeg";

export type DialogoVisita = "marcar" | "alterar" | "cancelar" | "resultado";

const V = "pessoasPagina.real.visit.";
const E = `${V}err.`;

/** A chave da mensagem que o hook usa quando os dados do formulário não dão um pedido (antes de chamar a base). */
export const CHAVES_ENTRADA_VISITA = {
  horaInvalida: `${V}err.badTime`,
  duracaoInvalida: `${V}err.badDuration`,
  recursoEmFalta: `${V}err.noResource`,
  quadroEmFalta: `${V}err.noBoard`,
  visitaEmFalta: `${V}err.noVisit`,
  /** A visita não está na ficha que o hook tem (a ficha recarrega ou a pessoa mudou): pede para recarregar, em vez de parecer uma falha de rede. */
  visitaNaoCarregada: `${V}err.visitNotLoaded`,
} as const;

/** Quem troca os recursos de uma visita futura muda o responsável da lead: é o que um 42501 quer dizer só nesse caso. */
const CHAVE_DONO_NAO_ALTERAVEL = `${V}ownerForbidden`;

// A leitura própria de cada código num diálogo; o que não está aqui fica com a mensagem geral. O 42501 ao alterar NÃO está aqui: sai também
// da permissão sobre a visita (pessoas.edit), por isso só se lê como «mudaria o responsável» quando os recursos mudaram (ver `OpcoesErroVisita`).
export const CHAVES_ERRO_POR_DIALOGO: Readonly<Record<DialogoVisita, Readonly<Record<string, string>>>> = {
  marcar: { NG008: `${E}marcar.ng008`, NG009: `${E}marcar.ng009`, NG010: `${E}marcar.ng010` },
  alterar: { NG008: `${E}alterar.ng008`, NG009: `${E}alterar.ng009`, NG010: `${E}alterar.ng010` },
  cancelar: { NG018: `${E}cancelar.ng018` },
  resultado: { NG004: `${E}resultado.ng004`, NG009: `${E}resultado.ng009`, NG018: `${E}resultado.ng018` },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O erro tal como o `chamarNeg` o devolveu (a chave é a do próprio código), e não um aviso de falha parcial com chave própria. */
const ehLeituraGeral = (erro: ErroNeg): boolean => erro.codigo !== null && erro.chave === CHAVES_ERRO_NEG[erro.codigo];

export interface OpcoesErroVisita {
  /** Ao alterar: o pedido levou uma lista de recursos nova (a base revalidou-os e pode ter mudado o responsável). */
  trocouRecursos?: boolean;
}

/** A chave a mostrar para este erro neste diálogo. */
export function chaveErroVisita(erro: ErroNeg, dialogo: DialogoVisita, opcoes: OpcoesErroVisita = {}): string {
  if (!ehLeituraGeral(erro)) return erro.chave;
  if (dialogo === "alterar" && erro.codigo === "42501" && opcoes.trocouRecursos === true) return CHAVE_DONO_NAO_ALTERAVEL;
  return CHAVES_ERRO_POR_DIALOGO[dialogo][erro.codigo as string] ?? erro.chave;
}

/**
 * O erro pronto a lançar para o diálogo: um ErroNeg com a chave deste diálogo (o código e a causa mantêm-se). Um aviso de falha parcial
 * passa tal e qual; o que não é um ErroNeg vira o erro genérico.
 */
export function traduzirErroVisita(erro: unknown, dialogo: DialogoVisita, opcoes: OpcoesErroVisita = {}): ErroNeg {
  if (!(erro instanceof ErroNeg)) return new ErroNeg(erro, null, CHAVE_ERRO_GENERICO);
  const chave = chaveErroVisita(erro, dialogo, opcoes);
  return chave === erro.chave ? erro : new ErroNeg(erro.causa, erro.codigo, chave, erro.chaveExtra);
}

/** O uuid do recurso ocupado, que a base põe no DETAIL do NG010; `null` noutro código ou se o texto não é um uuid. */
export function recursoEmConflito(erro: unknown): string | null {
  if (!(erro instanceof ErroNeg) || erro.codigo !== "NG010") return null;
  const causa = erro.causa;
  if (typeof causa !== "object" || causa === null) return null;
  const detalhe = (causa as { details?: unknown }).details;
  return typeof detalhe === "string" && UUID.test(detalhe.trim()) ? detalhe.trim() : null;
}
