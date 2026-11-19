// 19/11 (auditoria): o painel que o Estúdio da obra abre à chegada, pedido de fora (o Hoje do técnico ou do gestor: «O cliente pediu uma
// alteração» abre a tarefa, onde «Porquê?» › «O cliente pediu» prepara a adenda). O motor só muda de ecrã (S.view, S.op); o painel fica
// aqui até o Estúdio dessa obra o tomar (uma vez). Sem React nem dependências: o motor importa isto.
let pedido: { obra: number; painel: string } | null = null;

/** Pede ao Estúdio da obra `obra` que abra este painel (o mesmo texto do endereço: "tarefa-<i>", "imprevisto-<i>", "porque-…"). */
export function pedirPainelObra(obra: number, painel: string): void { pedido = { obra, painel }; }

/** O painel pedido para esta obra (e esquece-o); "" sem pedido. */
export function tomarPainelObra(obra: number): string {
  if (!pedido || pedido.obra !== obra) return "";
  const p = pedido.painel;
  pedido = null;
  return p;
}

/** Só para testes: o pedido sem o tomar. */
export const verPainelPedido = (): { obra: number; painel: string } | null => pedido;
