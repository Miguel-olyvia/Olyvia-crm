// A fonte única do "A fazer": dado um item, qual é o próximo passo e a chave do seu texto. Funções puras.
import { PASSOS_PROCESSO, type ItemProcesso, type PassoDoItem, type PassoProcesso } from "./tiposProcesso";

export { PASSOS_PROCESSO };

const doPasso = (id: PassoProcesso): PassoDoItem => ({ id, chave: `pessoasPagina.todo.step.${id}` });

/** O passo de um pedido, pela fase em que está (Por contactar, Contactado ou Visita). */
function passoDoPedido(item: ItemProcesso): PassoProcesso {
  if (item.fase === "porContactar") return "registarChamada";
  if (item.fase === "contactado") return "marcarVisita";
  // Um pedido na fase Visita pede SEMPRE "marcar a visita como feita": no passado, hoje, no futuro ou sem data (como o
  // protótipo, que mostra "Marcar a visita como feita · visita na sexta"; a data da visita sai no prazo do item). A data
  // não decide nada porque a `VisitaPessoa` ainda não tem estado "feita". `fazerLevantamento` só ganha regra na Fase 3,
  // quando a visita puder estar feita; `criarNegocio` entra depois do levantamento.
  return "marcarVisitaFeita";
}

/**
 * O passo de um negócio, com o mesmo sentido da coluna "Próximo passo" (`passoDoNegocio` em `etapaPessoa.ts`):
 * Orçamento sem orçamentos: criá-lo (a coluna diz "fazer o levantamento"); com orçamentos e nenhum escolhido: escolher;
 * com um escolhido e sem proposta: criar a proposta. Proposta em rascunho: enviá-la; enviada: registar a resposta do cliente
 * (a coluna diz "à espera do cliente"). Contrato: registar a assinatura. Por ligar nas fases seguintes (ids e textos já
 * existem): `verificarOrcamento`, `aguardarDirecao` (aprovação antes do envio) e `gerarContrato`.
 */
function passoDoNegocio(item: ItemProcesso): PassoProcesso {
  if (item.fase === "contrato") return "registarAssinatura";
  if (item.fase === "proposta") return item.propostaRascunho ? "enviarProposta" : "registarRespostaCliente";
  if (item.orcamentos === 0) return "criarOrcamento";
  return item.orcamentoEscolhido ? "criarProposta" : "escolherOrcamento";
}

/** O próximo passo de um item, e a chave do texto. */
export function passoDoItem(item: ItemProcesso): PassoDoItem {
  return doPasso(item.tipo === "negocio" ? passoDoNegocio(item) : passoDoPedido(item));
}
