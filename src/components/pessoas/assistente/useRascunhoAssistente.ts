// O rascunho do assistente como estado do ecrã: lê-se uma vez ao montar (por negócio, ou por pessoa) e cada alteração grava-se logo em sessionStorage,
// por isso o que se escreveu sobrevive a mudar de passo, ao passo «Marcar a visita» e a recarregar a página. Quando a chave muda (a pessoa passou a ter
// negócio) o escrito migra para a chave nova sem remontar o ecrã; `limpar` apaga-o depois de gravar com sucesso.
import { useCallback, useEffect, useRef, useState } from "react";
import { apagarRascunho, existeRascunho, guardarRascunho, lerRascunho, migrarRascunho, rascunhoVazio, type RascunhoAssistente } from "./rascunhoAssistente";

const PREFIXO_PESSOA = "pessoa-";

export function useRascunhoAssistente(
  chave: string,
): readonly [RascunhoAssistente, (parcial: Partial<RascunhoAssistente>) => void, () => void] {
  const [rascunho, setRascunho] = useState<RascunhoAssistente>(() => lerRascunho(chave));
  // O valor mais recente, para duas alterações seguidas no mesmo evento não se atropelarem.
  const atual = useRef(rascunho);
  const anterior = useRef(chave);
  useEffect(() => {
    const de = anterior.current;
    anterior.current = chave;
    if (de === chave) return;
    // Só a chave da pessoa migra para a de um negócio (a pessoa passou a ter negócio). De negócio para negócio nada migra:
    // cada um tem o seu rascunho, e o ecrã passa a mostrar o da chave nova (ou o vazio).
    if (de.startsWith(PREFIXO_PESSOA) && !chave.startsWith(PREFIXO_PESSOA)) {
      migrarRascunho(de, chave);
      // Se a chave nova já tinha rascunho (próprio, ou o que acabou de migrar) é esse que vale.
      if (!existeRascunho(chave)) return;
    }
    atual.current = lerRascunho(chave);
    setRascunho(atual.current);
  }, [chave]);
  const atualizar = useCallback((parcial: Partial<RascunhoAssistente>): void => {
    atual.current = { ...atual.current, ...parcial };
    guardarRascunho(chave, atual.current);
    setRascunho(atual.current);
  }, [chave]);
  const limpar = useCallback((): void => {
    atual.current = rascunhoVazio();
    apagarRascunho(chave);
    setRascunho(atual.current);
  }, [chave]);
  return [rascunho, atualizar, limpar];
}
