// O aviso curto (para o leitor de ecrã) do que um passo acabou de fazer: "Chamada registada: Ana passa a Contactado."
// Função pura: recebe a fase de onde a pessoa saiu e o item em que ficou, lidos depois de o estado mudar.
import type { Traduzir } from "@/components/negocio-metas/saudeNegocio";
import type { ColunaQuadro } from "../quadro/cartoesQuadroPessoas";
import { passoDoItem } from "./passosProcesso";
import type { ItemProcesso } from "./tiposProcesso";

export type TipoAviso =
  | "chamada" | "visita" | "visitaFeita" | "visitaGuardada" | "levantamento" | "negocio"
  | "orcamento" | "verificado" | "direcaoPedida" | "direcaoAprovada" | "direcaoRecusada" | "proposta" | "resposta" | "assinatura" | "recusa";

/**
 * O texto do aviso, ou "" quando não há nada a dizer (a pessoa já não tem item). `antes` é a fase em que estava (ou `null`);
 * `depois` é o item em que ficou (o primeiro dela no Quadro).
 */
export function textoDoAviso(t: Traduzir, tipo: TipoAviso, nome: string, antes: ColunaQuadro | null, depois: ItemProcesso | null): string {
  // O contrato assinado e a proposta aceite sem contrato fecham o negócio como ganho: a pessoa pode já não ter item, e o aviso diz-o na mesma.
  if (tipo === "assinatura") return t("pessoasPagina.done.signed", { name: nome });
  if (depois === null) {
    if (tipo === "chamada") return t("pessoasPagina.done.callNoPhase", { name: nome });
    return tipo === "resposta" ? t("pessoasPagina.done.replyWon", { name: nome }) : "";
  }
  const phase = t(`pessoasPagina.board.col.${depois.fase}`);
  const step = t(passoDoItem(depois).chave);
  switch (tipo) {
    case "chamada": return t(antes === depois.fase ? "pessoasPagina.done.callStays" : "pessoasPagina.done.call", { name: nome, phase });
    case "visita": return t("pessoasPagina.done.visitBooked", { name: nome, phase });
    case "visitaFeita": return t("pessoasPagina.done.visitDone", { name: nome, phase, step });
    case "visitaGuardada": return t("pessoasPagina.done.visitSaved", { name: nome, phase, step });
    case "levantamento": return t("pessoasPagina.done.surveyLinked", { name: nome, phase, step });
    case "negocio": return t("pessoasPagina.done.deal", { name: nome, phase });
    case "orcamento": return t("pessoasPagina.done.quote", { name: nome, step });
    case "verificado": return t("pessoasPagina.done.verified", { name: nome, step });
    case "direcaoPedida": return t("pessoasPagina.done.directionAsked", { name: nome, step });
    case "direcaoAprovada": return t("pessoasPagina.done.directionApproved", { name: nome, step });
    case "direcaoRecusada": return t("pessoasPagina.done.directionRefused", { name: nome, step });
    case "proposta": return t("pessoasPagina.done.proposal", { name: nome, phase });
    case "resposta": return t("pessoasPagina.done.reply", { name: nome, phase, step });
    // A recusa leva o motivo: quem a regista escreve a frase (ver `RespostaCliente`), por isso aqui não há texto.
    case "recusa": return "";
  }
}
