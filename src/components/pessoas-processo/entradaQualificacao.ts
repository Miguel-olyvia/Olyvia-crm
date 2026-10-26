// O que o painel «Visita e levantamento» manda gravar da Qualificação de um negócio: só as respostas da aba Qualificação e «o que o cliente pediu», e só o que
// mudou desde que o painel abriu (`undefined` = a base não mexe). Função pura.
import type { Respostas } from "@/components/negocio-metas/perguntasTipos";
import type { EntradaGuardarQualificacao } from "@/hooks/pessoas/useGuardarQualificacao";

interface Entrada {
  negocioId: string;
  entityId: string;
  /** As chaves das perguntas da aba Qualificação (`chavesDaAba(q, "qualificacao")`). */
  chavesQualificacao: ReadonlySet<string>;
  /** O que o negócio tinha ao abrir o painel. */
  inicial: { respostas: Respostas; pedido: string };
  /** O que o formulário tem agora; sem `pedidoCliente` (não há negócio no formulário) o pedido nunca vai. */
  rascunho: { respostas: Respostas; pedidoCliente?: string };
}

const soQualificacao = (r: Respostas, chaves: ReadonlySet<string>): Record<string, string> =>
  Object.fromEntries(Object.entries(r).filter(([chave]) => chaves.has(chave)));

const emTexto = (r: Record<string, string>): string => JSON.stringify(Object.entries(r).sort(([a], [b]) => a.localeCompare(b)));

/** A entrada de `useGuardarQualificacao`, ou `null` se nada da Qualificação mudou. */
export function entradaQualificacao(e: Entrada): EntradaGuardarQualificacao | null {
  const antes = soQualificacao(e.inicial.respostas, e.chavesQualificacao);
  const agora = soQualificacao(e.rascunho.respostas, e.chavesQualificacao);
  const respostasMudaram = emTexto(antes) !== emTexto(agora);
  const pedidoMudou = e.rascunho.pedidoCliente !== undefined && e.rascunho.pedidoCliente.trim() !== e.inicial.pedido.trim();
  if (!respostasMudaram && !pedidoMudou) return null;
  return {
    negocioId: e.negocioId, entityId: e.entityId,
    ...(respostasMudaram ? { respostas: agora } : {}),
    ...(pedidoMudou ? { pedidoCliente: e.rascunho.pedidoCliente } : {}),
  };
}
