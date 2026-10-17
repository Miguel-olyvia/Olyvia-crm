// O aviso curto (para o leitor de ecrã) do que um passo acabou de fazer: "Chamada registada: Ana passa a Contactado."
// Função pura: recebe a fase de onde a pessoa saiu e o item em que ficou, lidos depois de o estado mudar.
import type { Traduzir } from "@/components/negocio-metas/saudeNegocio";
import type { ColunaQuadro } from "../quadro/cartoesQuadroPessoas";
import { textoDoRotulo } from "../pedidoNegocio";
import { passoDoItem } from "./passosProcesso";
import type { ItemProcesso } from "./tiposProcesso";

export type TipoAviso =
  | "chamada" | "visita" | "visitaFeita" | "visitaGuardada" | "negocio"
  | "orcamento" | "verificado" | "direcaoPedida" | "direcaoAprovada" | "direcaoRecusada" | "proposta";

/**
 * O texto do aviso, ou "" quando não há nada a dizer (a pessoa já não tem item). `antes` é a fase em que estava (ou `null`);
 * `depois` é o item em que ficou (o primeiro dela no Quadro).
 */
export function textoDoAviso(t: Traduzir, tipo: TipoAviso, nome: string, antes: ColunaQuadro | null, depois: ItemProcesso | null): string {
  if (depois === null) return tipo === "chamada" ? t("pessoasPagina.done.callNoPhase", { name: nome }) : "";
  const phase = t(`pessoasPagina.board.col.${depois.fase}`);
  const step = t(passoDoItem(depois).chave);
  // Os avisos de um passo de um pedido dizem de que pedido é (uma pessoa pode ter vários, também sem serviço).
  const quem = depois.rotuloPedido ? `${nome} (${textoDoRotulo(t, depois.rotuloPedido)})` : nome;
  switch (tipo) {
    case "chamada": return t(antes === depois.fase ? "pessoasPagina.done.callStays" : "pessoasPagina.done.call", { name: nome, phase });
    case "visita": return t("pessoasPagina.done.visitBooked", { name: quem, phase });
    case "visitaFeita": return t("pessoasPagina.done.visitDone", { name: quem, phase, step });
    case "visitaGuardada": return t("pessoasPagina.done.visitSaved", { name: quem, phase, step });
    case "negocio": return t("pessoasPagina.done.deal", { name: nome, phase });
    case "orcamento": return t("pessoasPagina.done.quote", { name: nome, step });
    case "verificado": return t("pessoasPagina.done.verified", { name: nome, step });
    case "direcaoPedida": return t("pessoasPagina.done.directionAsked", { name: nome, step });
    case "direcaoAprovada": return t("pessoasPagina.done.directionApproved", { name: nome, step });
    case "direcaoRecusada": return t("pessoasPagina.done.directionRefused", { name: nome, step });
    case "proposta": return t("pessoasPagina.done.proposal", { name: nome, phase });
  }
}
