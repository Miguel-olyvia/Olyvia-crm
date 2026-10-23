// O aviso de uma região aria-live: a mesma mensagem repetida só é anunciada se a região passar por vazio entre as duas,
// por isso limpa-se primeiro e define-se a mensagem logo a seguir.
import { useCallback, useEffect, useRef, useState } from "react";

const ATRASO_MS = 50;

/** Devolve o texto da região viva e a função que o anuncia (também quando é igual ao anterior). */
export function useAviso(): [string, (msg: string) => void] {
  const [aviso, setAviso] = useState("");
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const anunciar = useCallback((msg: string): void => {
    clearTimeout(espera.current);
    setAviso("");
    espera.current = setTimeout(() => setAviso(msg), ATRASO_MS);
  }, []);
  useEffect(() => () => clearTimeout(espera.current), []);
  return [aviso, anunciar];
}
