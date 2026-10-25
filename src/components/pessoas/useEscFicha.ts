// O Esc da ficha NA PÁGINA (no painel lateral é o do Sheet). Ouve o documento; as camadas do Radix (diálogo «Mais sobre a pessoa», menus, popovers)
// tratam o Esc em captura e fazem `preventDefault`, por isso um Esc que fecha uma delas não chega aqui como pendente. Depois vem o painel em linha
// aberto (Nota, Adiar...), que fecha primeiro; só então se fecha a ficha.
import { useEffect, useRef, type MutableRefObject } from "react";

export function useEscFicha(ativo: boolean, fecharPainel: MutableRefObject<(() => boolean) | null>, aoFechar: () => void): void {
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;
  useEffect(() => {
    if (!ativo) return undefined;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      if (fecharPainel.current?.()) return;
      fechar.current();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [ativo, fecharPainel]);
}
