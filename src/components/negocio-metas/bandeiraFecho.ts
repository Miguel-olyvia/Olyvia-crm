// A bandeira do fecho v4 (ecrã de fecho do negócio: Fechar agora, Converter em cliente, Reabrir negócio, Manter perdido, alertas e origem).
// Desligada por omissão: só se liga depois de as migrations C, D, E e F estarem aplicadas na base (por esta ordem, com testes antes de cada
// push) e de o código que as usa estar publicado. Com ela desligada, ANTES de a migration D ser aplicada, o ecrã fica como estava («Dar como
// ganho» incluído). DEPOIS de D, esse botão falha (neg_ganhar_negocio recusa negócios abertos, NG002): D, E e F aplicam-se na mesma janela e a
// bandeira liga-se logo a seguir, sem deixar D aplicada com a bandeira desligada.
// O contexto serve os testes (e uma eventual ligação por organização): quando existe, manda sobre a constante.
import { createContext, useContext } from "react";

export const FECHO_V4_ATIVO = false;

export const FechoV4Context = createContext<boolean | null>(null);

export function useFechoV4(): boolean {
  const forcado = useContext(FechoV4Context);
  return forcado ?? FECHO_V4_ATIVO;
}
