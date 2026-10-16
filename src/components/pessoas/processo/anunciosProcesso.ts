// O aviso curto (para o leitor de ecrã) do que um passo acabou de fazer: "Chamada registada: Ana passa a Contactado."
// Função pura: recebe a fase de onde a pessoa saiu e o item em que ficou, lidos depois de o estado mudar.
import type { Traduzir } from "@/components/negocio-metas/saudeNegocio";
import type { ColunaQuadro } from "../quadro/cartoesQuadroPessoas";
import { passoDoItem } from "./passosProcesso";
import type { ItemProcesso } from "./tiposProcesso";

export type TipoAviso = "chamada" | "visita" | "visitaFeita" | "levantamento" | "negocio";

/**
 * O texto do aviso, ou "" quando não há nada a dizer (a pessoa já não tem item). `antes` é a fase em que estava (ou `null`);
 * `depois` é o item em que ficou (o primeiro dela no Quadro).
 */
export function textoDoAviso(t: Traduzir, tipo: TipoAviso, nome: string, antes: ColunaQuadro | null, depois: ItemProcesso | null): string {
  if (depois === null) return tipo === "chamada" ? t("pessoasPagina.done.callNoPhase", { name: nome }) : "";
  const phase = t(`pessoasPagina.board.col.${depois.fase}`);
  const step = t(passoDoItem(depois).chave);
  switch (tipo) {
    case "chamada": return t(antes === depois.fase ? "pessoasPagina.done.callStays" : "pessoasPagina.done.call", { name: nome, phase });
    case "visita": return t("pessoasPagina.done.visitBooked", { name: nome, phase });
    case "visitaFeita": return t("pessoasPagina.done.visitDone", { name: nome, phase, step });
    case "levantamento": return t("pessoasPagina.done.survey", { name: nome, step });
    case "negocio": return t("pessoasPagina.done.deal", { name: nome, phase });
  }
}
