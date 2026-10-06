/**
 * O que vai para o Sentry quando algo falha numa Edge Function que toca em
 * ficheiros ou dados pessoais: so o tipo e o codigo do erro, NUNCA error.message
 * -- o Storage e a base podem la meter o caminho do ficheiro, o nome que a
 * pessoa escolheu ou o valor de uma coluna.
 *
 * Um unico sitio: endurecer a regra aqui endurece-a em todas as funcoes.
 */
export function erroSemDados(origem: string, e: unknown): Error {
  const code = (e as { code?: unknown } | null)?.code;
  const tipo = e instanceof Error ? e.name : typeof e;
  return new Error(`${origem}: ${tipo}${typeof code === "string" ? ` ${code}` : ""}`);
}
