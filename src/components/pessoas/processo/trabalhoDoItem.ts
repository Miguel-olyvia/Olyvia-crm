// O que um cartão do Quadro, uma sub-linha da Lista ou um aviso dizem do "trabalho" de um item: numa pessoa em abordagem, «Abordagem»;
// num negócio o serviço dele (ou «Negócio», quando não tem).
import type { Traduzir } from "@/components/negocio-metas/saudeNegocio";

export function trabalhoDoItem(t: Traduzir, item: { tipo: "pessoa" | "negocio"; trabalho: string | null }): string {
  if (item.tipo === "pessoa") return t("pessoasPagina.board.approach");
  return item.trabalho || t("pessoasPagina.board.dealName");
}
