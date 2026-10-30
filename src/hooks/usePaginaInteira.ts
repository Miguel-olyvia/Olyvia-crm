// 30/10/2026: as páginas do protótipo V1 (o /negocios, o Hoje do /home e o /catalogo-custos) ocupam a área toda do conteúdo, como na V1
// (lá o ecrã é fixed inset-0 e cada vista trata das margens). O Layout punha-as no container centrado das páginas do CRM, com largura
// máxima, e ficavam num quadrado isolado no meio. A página pede a área inteira enquanto está montada; o Layout lê o pedido.
import { useEffect, useSyncExternalStore } from "react";

let pedidos = 0;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());
const subscrever = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
const ler = () => pedidos > 0;

/** A página que a chama ocupa a área toda do conteúdo (sem o container nem as margens do Layout). */
export function usePaginaInteira(): void {
  useEffect(() => {
    pedidos++; avisar();
    return () => { pedidos--; avisar(); };
  }, []);
}

/** O Layout: alguma página montada pediu a área toda? */
export const usePedidoPaginaInteira = (): boolean => useSyncExternalStore(subscrever, ler, ler);
