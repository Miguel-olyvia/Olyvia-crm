/**
 * O criterio de "utilizador interno" (CRM) vs "utilizador de portal" (cliente).
 *
 * E o MESMO criterio que `useClientRole.ts` (fetchAccessKind) ja usa para
 * decidir se uma sessao entra no CRM ou fica presa ao portal -- extraido para
 * aqui para nao ser reescrito uma terceira vez por quem precisar dele fora de
 * uma sessao autenticada (por exemplo, ao listar candidatos a ligar a uma
 * ficha de RH).
 *
 * PORQUE E NEGATIVO, E NAO UMA LISTA DE PAPEIS "BONS"
 * ----------------------------------------------------
 * Nao existe uma whitelist de papeis internos. Qualquer papel que nao seja o
 * codigo literal `client` conta como interno. Uma whitelist fixa bloquearia,
 * em silencio, qualquer papel criado depois desta linha ser escrita -- e isso
 * ja foi um erro deste projecto uma vez (ver `useClientRole.ts`). NAO
 * reintroduzir aqui o que foi deliberadamente evitado la.
 *
 * O QUE NAO ESTA AQUI: o caso "zero papeis". Em `useClientRole.fetchAccessKind`
 * isso conta como `crm_user` (onboarding acabado de comecar, ainda sem
 * membership) -- mas esse e um julgamento sobre "esta SESSAO entra no CRM?",
 * nao sobre "esta conta e interna?". Quem usa este predicado para listar
 * candidatos a ligacao ja parte de contas com pelo menos uma membership activa
 * (e por isso pelo menos um papel), e decide o caso de zero papeis por si,
 * porque o significado muda consoante o contexto.
 */
export function eInterno(roleCodes: readonly string[]): boolean {
  return roleCodes.some((code) => code !== "client");
}
