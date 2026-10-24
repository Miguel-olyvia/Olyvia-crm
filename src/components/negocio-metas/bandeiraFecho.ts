// A bandeira do fecho v4 (ecrã de fecho do negócio: Fechar agora, Converter em cliente, Reabrir negócio, Manter perdido, alertas e origem).
// Ligada: as migrations C, D, E e F estão aplicadas na base (21/10, por esta ordem, provadas na nike). Sem ela, o botão «Dar como ganho»
// antigo falharia (neg_ganhar_negocio recusa negócios abertos, NG002), por isso não se volta a desligá-la sem reverter a migration D.
// O contexto serve os testes (e uma eventual ligação por organização): quando existe, manda sobre a constante.
import { createContext, useContext } from "react";

export const FECHO_V4_ATIVO = true;

export const FechoV4Context = createContext<boolean | null>(null);

export function useFechoV4(): boolean {
  const forcado = useContext(FechoV4Context);
  return forcado ?? FECHO_V4_ATIVO;
}
