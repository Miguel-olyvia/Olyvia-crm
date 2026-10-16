// As transições do orçamento e da proposta (Fase 4). Funções puras e imutáveis: recebem o estado de um negócio (o `NegocioMes` e os
// extras), o item do "A fazer" e os dados do diálogo, e devolvem o que passa a valer ou o que falta. Quem as chama grava o resultado
// com `gravarTransicao` (o negócio e os extras juntos, para as três páginas mostrarem o mesmo). Cada transição só se aplica no passo
// certo do item; fora dele devolve `{ ok: false, emFalta: [] }` (nada a explicar: o botão nunca a oferece).
import { acrescentarOrcamento, DIAS_ATE_PRAZO_SEGUINTE } from "@/components/negocio-metas/negocioAcoes";
import type { OrcamentoDetalhe } from "@/components/negocio-metas/negocioDetalhes";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { somarDias } from "@/components/negocio-metas/novoNegocio";
import { paraCondicoes, validarCondicoes, type CondicoesForm } from "./condicoesProposta";
import { totaisDoOrcamento, verificarOrcamento as calcularVerificacao, type LinhaTrabalho } from "./orcamentoCalculo";
import { orcamentoEscolhidoDetalhado, type ExtrasNegocio, type OrcamentoDetalhado } from "./orcamentoDetalhado";
import { passoDoItem } from "./passosProcesso";
import {
  portaoDesconto, portaoEnviarProposta, portaoGuardarOrcamento, portaoMargem, portaoResponderDirecao, portaoValorOrcamento, portaoVerificarOrcamento,
  type FaltaProcesso, type Portao,
} from "./portoesProcesso";
import type { ItemProcesso } from "./tiposProcesso";

/** O negócio como está agora, os seus extras e o número de série do próximo orçamento (`proximaSequenciaOrcamento`). */
export interface EstadoTransicao {
  negocio: NegocioMes;
  extras: ExtrasNegocio | undefined;
  sequencia: number;
}

export type Transicao =
  | {
    ok: true;
    negocio: NegocioMes;
    extras: ExtrasNegocio;
    /** Só ao acrescentar o primeiro orçamento: o detalhe (data e estado) que `guardarNegocio` guarda ao lado do negócio. */
    novoOrcamento?: { id: string; detalhe: OrcamentoDetalhe };
  }
  | { ok: false; emFalta: FaltaProcesso[] };

/** O diálogo do orçamento entrega isto: as linhas, o desconto e a venda direta. */
export interface DadosDoOrcamento {
  linhas: readonly LinhaTrabalho[];
  /** Percentagem de 0 a 50. */
  desconto: number;
  vendaDireta: boolean;
}

const NAO_SE_APLICA: Transicao = { ok: false, emFalta: [] };
const recusar = (portao: Portao): Transicao => ({ ok: false, emFalta: portao.emFalta });
const arredondar = (valor: number): number => Math.round(valor * 100) / 100;

/** O mesmo orçamento com o que mudou no diálogo; volta a ficar por verificar e sem pedido à Direção. */
const comLinhas = (atual: OrcamentoDetalhado, dados: DadosDoOrcamento): OrcamentoDetalhado => ({
  ...atual, linhas: dados.linhas, desconto: dados.desconto, vendaDireta: dados.vendaDireta, verificado: false, direcao: null,
});

/**
 * Guarda o orçamento. No passo de o criar acrescenta o orçamento ao negócio (fica escolhido) com o total com IVA; no de o verificar
 * (o utilizador editou-o, ou aceitou "Usar X €" ou "Tirar o desconto") atualiza o valor do mesmo orçamento. Em ambos volta a pedir
 * a verificação.
 */
export function guardarOrcamento(estado: EstadoTransicao, item: ItemProcesso, dados: DadosDoOrcamento, hoje: string): Transicao {
  const passo = passoDoItem(item).id;
  if (passo !== "criarOrcamento" && passo !== "verificarOrcamento") return NAO_SE_APLICA;
  const linhas = portaoGuardarOrcamento(dados.linhas);
  if (!linhas.ok) return recusar(linhas);
  const desconto = portaoDesconto(dados.desconto);
  if (!desconto.ok) return recusar(desconto);
  const total = arredondar(totaisDoOrcamento(dados).total);
  const valor = portaoValorOrcamento(total);
  if (!valor.ok) return recusar(valor);
  const atual = orcamentoEscolhidoDetalhado(estado.negocio, estado.extras);
  if (passo === "verificarOrcamento") {
    if (!atual) return { ok: false, emFalta: ["semOrcamento"] };
    const orcamentos = estado.negocio.orcamentos.map((o) => (o.id === atual.orcamentoId ? { ...o, valor: total } : o));
    return { ok: true, negocio: { ...estado.negocio, orcamentos }, extras: { ...estado.extras, orcamento: comLinhas(atual, dados) } };
  }
  const novo = acrescentarOrcamento(estado.negocio, { valor: total.toFixed(2), descricao: "", estado: "rascunho" }, estado.sequencia, hoje);
  // O negócio já não aceita orçamentos (ficou ganho entretanto): diz-se, em vez de fechar o diálogo sem guardar.
  if (!novo) return { ok: false, emFalta: ["orcamentoNaoGuardado"] };
  const orcamento: OrcamentoDetalhado = {
    orcamentoId: novo.orcamentoId, linhas: dados.linhas, desconto: dados.desconto, vendaDireta: dados.vendaDireta, verificado: false, direcao: null, versao: 1,
  };
  return { ok: true, negocio: novo.negocio, extras: { ...estado.extras, orcamento }, novoOrcamento: { id: novo.orcamentoId, detalhe: novo.detalhe } };
}

/** O orçamento do passo "verificar", ou o que falta se não o há (e a verificação dele). */
function doPassoDeVerificar(estado: EstadoTransicao, item: ItemProcesso) {
  if (passoDoItem(item).id !== "verificarOrcamento") return { aplica: false as const };
  const orcamento = orcamentoEscolhidoDetalhado(estado.negocio, estado.extras);
  const portao = portaoVerificarOrcamento(orcamento);
  if (!portao.ok || !orcamento) return { aplica: true as const, orcamento: undefined, portao };
  return { aplica: true as const, orcamento, portao, verificacao: calcularVerificacao(orcamento) };
}

const comOrcamento = (estado: EstadoTransicao, orcamento: OrcamentoDetalhado): Transicao => ({
  ok: true, negocio: estado.negocio, extras: { ...estado.extras, orcamento },
});

/** Marca o orçamento como verificado: só sem bloqueios (os de margem resolvem-se, ou pedem a aprovação da Direção). */
export function verificarOrcamento(estado: EstadoTransicao, item: ItemProcesso): Transicao {
  const base = doPassoDeVerificar(estado, item);
  if (!base.aplica) return NAO_SE_APLICA;
  if (!base.orcamento) return recusar(base.portao);
  const margem = portaoMargem(base.verificacao);
  return margem.ok ? comOrcamento(estado, { ...base.orcamento, verificado: true }) : recusar(margem);
}

/** Pede a aprovação da Direção para uma margem abaixo do mínimo. Um preço abaixo do custo nunca se aprova: não se pede. */
export function pedirAprovacaoDirecao(estado: EstadoTransicao, item: ItemProcesso): Transicao {
  const base = doPassoDeVerificar(estado, item);
  if (!base.aplica) return NAO_SE_APLICA;
  if (!base.orcamento) return recusar(base.portao);
  if (base.verificacao.duro) return recusar(portaoMargem(base.verificacao));
  if (base.verificacao.bloqueios.length === 0) return NAO_SE_APLICA;
  return comOrcamento(estado, { ...base.orcamento, direcao: "pedida" });
}

/** A resposta (simulada) da Direção: aprovar deixa o orçamento verificado; recusar desfaz o pedido e fica por verificar. */
export function responderDirecao(estado: EstadoTransicao, item: ItemProcesso, dados: { aprovada: boolean }): Transicao {
  const orcamento = orcamentoEscolhidoDetalhado(estado.negocio, estado.extras);
  const portao = portaoResponderDirecao(passoDoItem(item).id === "aguardarDirecao" ? orcamento?.direcao : undefined);
  if (!portao.ok || !orcamento) return recusar(portao);
  return comOrcamento(estado, { ...orcamento, direcao: dados.aprovada ? "aprovada" : null, verificado: dados.aprovada });
}

/**
 * Envia a proposta: o negócio passa a Proposta (enviada), com as condições guardadas nos extras. Criar e enviar são um só gesto:
 * a página real não tem proposta antes do envio. Uma proposta que já estava em rascunho (os negócios de exemplo, sem orçamento
 * detalhado) só passa a enviada.
 */
export function enviarProposta(estado: EstadoTransicao, item: ItemProcesso, condicoes: CondicoesForm, hoje: string): Transicao {
  const orcamento = orcamentoEscolhidoDetalhado(estado.negocio, estado.extras);
  const noPasso = passoDoItem(item).id === "enviarProposta";
  const portao = portaoEnviarProposta({ verificado: noPasso && (orcamento?.verificado ?? true), erros: validarCondicoes(condicoes, hoje) });
  if (!portao.ok) return recusar(portao);
  return {
    ok: true,
    negocio: { ...estado.negocio, proposta: { estado: "enviada" }, parado: 0, proximoPrazo: somarDias(hoje, DIAS_ATE_PRAZO_SEGUINTE) },
    extras: { ...estado.extras, condicoes: paraCondicoes(condicoes) },
  };
}
