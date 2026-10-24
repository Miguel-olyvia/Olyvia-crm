import { useEffect, useState } from "react";

/** Pede o foco para um elemento pelo id. Corre num instante a seguir, porque a aba de destino acaba de montar. */
export function useFocoCampo(): (idCampo: string) => void {
  const [pedido, setPedido] = useState<{ id: string; n: number } | null>(null);
  useEffect(() => {
    if (!pedido) return;
    const espera = setTimeout(() => document.getElementById(pedido.id)?.focus(), 0);
    return () => clearTimeout(espera);
  }, [pedido]);
  return (id) => setPedido((p) => ({ id, n: (p?.n ?? 0) + 1 }));
}
