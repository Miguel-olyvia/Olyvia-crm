// O pedido de outro módulo (a obra no negócio, "Abrir no Inventário") para o Inventário do V1 abrir numa obra. Sem imports: o motor lê-o sem ciclos.
let obra: number | null = null;
export function pedirObraInv(id: number): void { obra = id; }
/** Quem abre a obra tira o pedido (não volta a abrir mais tarde). */
export function tirarPedidoObraInv(): number | null { const id = obra; obra = null; return id; }
