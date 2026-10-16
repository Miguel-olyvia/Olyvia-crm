// Uma região live só anuncia quando o texto muda: o mesmo aviso dito duas vezes seguidas (dois cliques num botão bloqueado, a mesma
// lead criada duas vezes) ficaria mudo à segunda. Alternar um espaço inseparável no fim muda o texto sem mudar o que se ouve,
// como já faz `useResolucaoSubmissao`.
import { useCallback, useRef } from "react";

/** U+00A0, escrito por código para se ver (um espaço inseparável literal é igual a um espaço). */
const ESPACO_INSEPARAVEL = String.fromCharCode(0xa0);

/** Devolve uma função que, a cada chamada, dá o texto com ou sem o espaço inseparável no fim, alternando. */
export function useAvisoAlternado(): (texto: string) => string {
  const sufixo = useRef(false);
  return useCallback((texto: string) => {
    sufixo.current = !sufixo.current;
    return sufixo.current ? texto : `${texto}${ESPACO_INSEPARAVEL}`;
  }, []);
}
