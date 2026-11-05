// 5/11 (Rúben: «deve marcar logo a visita, tudo automático»): quando a chamada em direto preenche o dia e a hora combinados, o passo
// «Marcar a visita» marca-a sozinho com o comercial livre mais perto a essa hora. O pedido fica só em memória (não vai para o negócio
// nem para a base): abrir o negócio mais tarde não marca nada sozinho.
const pedidos = new Set<number>();
const ouvintes = new Set<() => void>();

export function pedirMarcacao(negocio: number): void { pedidos.add(negocio); ouvintes.forEach((f) => f()); }
export function marcacaoPedida(negocio: number): boolean { return pedidos.has(negocio); }
export function esquecerMarcacao(negocio: number): void { if (pedidos.delete(negocio)) ouvintes.forEach((f) => f()); }
export function ouvirMarcacoes(f: () => void): () => void { ouvintes.add(f); return () => { ouvintes.delete(f); }; }
