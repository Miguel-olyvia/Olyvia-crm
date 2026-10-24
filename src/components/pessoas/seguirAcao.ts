// O que acontece depois de uma ação da ficha, seja ela síncrona (o exemplo, em memória) ou assíncrona (a base). O exemplo fica
// exatamente síncrono: uma ação que não devolve Promise chama `aoOk` de imediato.

/** A chave da mensagem genérica de erro (a mesma de `hooks/pessoas/errosNeg.ts`; os componentes não importam dos hooks da base). */
export const CHAVE_ERRO_ACAO_GENERICO = "pessoasPagina.erroNeg.generico";

const ehPromessa = (valor: unknown): valor is PromiseLike<void> =>
  typeof valor === "object" && valor !== null && typeof (valor as { then?: unknown }).then === "function";

/** Espera pela ação (se for uma Promise) e chama `aoOk` no fim ou `aoErro` se falhar; sem Promise, chama `aoOk` logo. */
export function seguirAcao(resultado: void | Promise<void>, aoOk: () => void, aoErro: (erro: unknown) => void): void {
  if (ehPromessa(resultado)) {
    resultado.then(aoOk, aoErro);
    return;
  }
  aoOk();
}

/** Diz se o resultado de uma ação é uma Promise (a ação está a correr na base). */
export const ehAcaoAssincrona = (resultado: void | Promise<void>): resultado is Promise<void> => ehPromessa(resultado);

const textoNaoVazio = (valor: unknown): string | null => (typeof valor === "string" && valor !== "" ? valor : null);

/** A chave de tradução do erro de uma ação: a que o erro traz (`chave`), senão a mensagem genérica. Nunca o texto cru do erro. */
export function chaveDoErroAcao(erro: unknown): string {
  const chave = typeof erro === "object" && erro !== null ? textoNaoVazio((erro as { chave?: unknown }).chave) : null;
  return chave ?? CHAVE_ERRO_ACAO_GENERICO;
}

/** A segunda chave do erro (a mensagem do código numa falha parcial), se houver. */
export function chaveExtraDoErroAcao(erro: unknown): string | null {
  return typeof erro === "object" && erro !== null ? textoNaoVazio((erro as { chaveExtra?: unknown }).chaveExtra) : null;
}
