// O rascunho do assistente como estado do ecrã: lê-se uma vez ao montar (por negócio, ou por pessoa) e cada alteração grava-se logo em sessionStorage,
// por isso o que se escreveu sobrevive a mudar de passo, ao passo «Marcar a visita» e a recarregar a página. Quem muda de negócio remonta o componente (key).
import { useCallback, useRef, useState } from "react";
import { guardarRascunho, lerRascunho, type RascunhoAssistente } from "./rascunhoAssistente";

export function useRascunhoAssistente(chave: string): readonly [RascunhoAssistente, (parcial: Partial<RascunhoAssistente>) => void] {
  const [rascunho, setRascunho] = useState<RascunhoAssistente>(() => lerRascunho(chave));
  // O valor mais recente, para duas alterações seguidas no mesmo evento não se atropelarem.
  const atual = useRef(rascunho);
  const atualizar = useCallback((parcial: Partial<RascunhoAssistente>): void => {
    atual.current = { ...atual.current, ...parcial };
    guardarRascunho(chave, atual.current);
    setRascunho(atual.current);
  }, [chave]);
  return [rascunho, atualizar];
}
