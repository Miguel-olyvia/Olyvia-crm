import { useRef } from "react";

/** O último valor que não foi nulo: para a ficha não esvaziar durante a animação de fecho. */
export function useUltimo<T>(valor: T | null): T | null {
  const guardado = useRef<T | null>(null);
  if (valor !== null) guardado.current = valor;
  return valor ?? guardado.current;
}
