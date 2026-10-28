// Que separadores da página "Utilizadores e perfis" cada pessoa vê. Lógica pura, sem base nem contextos.
import type { Separador } from "./tipos";

/** Pela ordem em que aparecem na página. */
export const SEPARADORES: readonly Separador[] = ["utilizadores", "roles", "portal"];

/** A permissão de leitura que cada separador pede (as mesmas das antigas /users e /roles). */
export const PERMISSAO_SEPARADOR: Record<Separador, string> = {
  utilizadores: "users.view",
  roles: "roles.view",
  portal: "users.view",
};

export function separadoresPermitidos(tem: (permissao: string) => boolean): Separador[] {
  return SEPARADORES.filter((s) => tem(PERMISSAO_SEPARADOR[s]));
}

/** O separador a abrir: o pedido no URL se for permitido; senão o primeiro permitido; sem nenhum, null. */
export function resolverSeparador(pedido: string | null, permitidos: readonly Separador[]): Separador | null {
  const escolhido = permitidos.find((s) => s === pedido);
  return escolhido ?? permitidos[0] ?? null;
}
