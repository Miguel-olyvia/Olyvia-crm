/**
 * Devolve o foco a quem o tinha quando um modal CONTROLADO (aberto por estado, sem `DialogTrigger`) fecha.
 *
 * O Radix só sabe devolver o foco ao gatilho se o modal tiver um `DialogTrigger`; abertos por `open={estado}` fecham com
 * o foco no BODY, e quem usa teclado perde o sítio. Guarda-se o elemento focado no instante em que o modal abre (antes
 * de o Radix mover o foco para dentro) e usa-se `onCloseAutoFocus` para o focar de novo.
 *
 * Uso: `<DialogContent onCloseAutoFocus={useDevolverFoco(open)}>`. Se o elemento já não existe (a lista mudou, o painel
 * fechou), deixa-se o comportamento por omissão do Radix.
 */
import { useCallback, useLayoutEffect, useRef } from "react";

export function useDevolverFoco(aberto: boolean): (evento: Event) => void {
  const origem = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!aberto) return;
    const ativo = document.activeElement;
    origem.current = ativo instanceof HTMLElement && ativo !== document.body ? ativo : null;
  }, [aberto]);

  return useCallback((evento: Event) => {
    const alvo = origem.current;
    if (!alvo?.isConnected) return;
    evento.preventDefault();
    alvo.focus();
  }, []);
}
