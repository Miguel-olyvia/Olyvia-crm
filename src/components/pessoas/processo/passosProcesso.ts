// A fonte única do "A fazer": dado um item, qual é o próximo passo e a chave do seu texto. Funções puras.
import { PASSOS_PROCESSO, type ItemProcesso, type PassoDoItem, type PassoProcesso } from "./tiposProcesso";

const doPasso = (id: PassoProcesso): PassoDoItem => ({ id, chave: `pessoasPagina.todo.step.${id}` });

/** Todos os passos do processo executam: nenhum botão do "A fazer" se limita a abrir a ficha (há um teste que o garante). */
export const ehExecutavel = (passo: PassoProcesso): boolean => (PASSOS_PROCESSO as readonly string[]).includes(passo);

/**
 * O passo de uma pessoa em abordagem, pela fase em que está (Por contactar, Contactado ou Visita). Na fase Visita por fazer pede SEMPRE
 * "marcar a visita como feita" (no passado, hoje, no futuro ou sem data: a data não decide nada, sai no prazo do item). Abre o
 * painel de visita e levantamento da pessoa, onde se marca a visita como feita e, se se quiser, se tiram as medidas (o levantamento
 * é opcional) numa só gravação. Com uma visita feita, o passo é criar o negócio (à mão), com ou sem linhas de medidas.
 */
function passoDaPessoa(item: ItemProcesso): PassoProcesso {
  if (item.fase === "porContactar") return "registarChamada";
  if (item.fase === "contactado") return "marcarVisita";
  return item.visitaFeita ? "criarNegocio" : "marcarVisitaFeita";
}

/**
 * O passo de um negócio, com o mesmo sentido da coluna "Próximo passo" (`passoDoNegocio` em `etapaPessoa.ts`):
 * Orçamento sem orçamentos: criá-lo (a coluna diz "fazer o levantamento"); com orçamentos, criar a proposta (não há passo de escolher:
 * sem nenhum escolhido vale o último). Proposta em rascunho: enviá-la; enviada: registar a resposta do cliente
 * (a coluna diz "à espera do cliente"). Contrato: registar a assinatura. O contrato nasce da resposta do cliente, segundo o Workflow
 * (não há passo de o gerar à parte).
 * Um orçamento escolhido com detalhe guardado (Fase 4) tem de ser verificado antes da proposta: `verificarOrcamento`, depois
 * `aguardarDirecao` (se se pediu aprovação) e, com tudo pronto, `enviarProposta`. A coluna continua a dizer "criar a proposta" (a
 * página real só tem proposta depois de ela ser enviada): criar e enviar é um só gesto, por isso não há botão "criar" à parte.
 * Sem detalhe (os negócios de exemplo) o passo é o da coluna.
 */
function passoDoNegocio(item: ItemProcesso): PassoProcesso {
  if (item.fase === "levantamento") return "fazerLevantamento";
  if (item.fase === "contrato") return "registarAssinatura";
  if (item.fase === "proposta") return item.propostaRascunho ? "enviarProposta" : "registarRespostaCliente";
  if (item.orcamentos === 0) return "criarOrcamento";
  switch (item.verificacao) {
    case "porVerificar": return "verificarOrcamento";
    case "aguardaDirecao": return "aguardarDirecao";
    case "verificado": return "enviarProposta";
    case "semDetalhe": return "criarProposta";
  }
}

/** O próximo passo de um item, e a chave do texto. */
export function passoDoItem(item: ItemProcesso): PassoDoItem {
  return doPasso(item.tipo === "negocio" ? passoDoNegocio(item) : passoDaPessoa(item));
}
