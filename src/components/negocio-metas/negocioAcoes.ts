// As ações que mudam um negócio, em memória: acrescentar um orçamento e aplicar um evento do Workflow (ganhar ou
// perder um passo). Funções puras e imutáveis: o dia de hoje e o número de série chegam por parâmetro. O que se
// grava vive em `negociosAlterados.ts`.
import type { EstadoOrcamentoDetalhe, OrcamentoDetalhe } from "./negocioDetalhes";
import { isNegocioGanho, type FaseNegocio, type NegocioMes } from "./negocioMetas";
import { somarDias } from "./novoNegocio";
import {
  opcoesAdmitidas, OPCOES_CONTRATO_PERDIDO, OPCOES_ORCAMENTO_GANHO, OPCOES_ORCAMENTO_PERDIDO, OPCOES_PROPOSTA_GANHO,
  OPCOES_PROPOSTA_PERDIDO, type Celula, type ConfigWorkflow,
} from "./workflowNegocio";
import { simularEvento, type EventoWorkflow } from "./workflowSimulacao";

/** Dias até ao próximo prazo de um negócio que acaba de mudar de passo. */
export const DIAS_ATE_PRAZO_SEGUINTE = 3;
/** O maior valor que um orçamento aceita (em euros). */
export const VALOR_MAXIMO_ORCAMENTO = 10_000_000;
export const MAX_DESCRICAO_ORCAMENTO = 80;
export const ESTADOS_ORCAMENTO: readonly EstadoOrcamentoDetalhe[] = ["rascunho", "enviado", "aceite", "recusado"];

export interface DadosOrcamento {
  /** O valor tal como se escreveu ("1 500,50" ou "1500.5"). */
  valor: string;
  descricao: string;
  estado: EstadoOrcamentoDetalhe;
}

export type ErroOrcamento = "valorVazio" | "valorInvalido" | "valorGrande" | "descricaoComprida";

/** O número que o texto diz, ou `NaN`: aceita espaços e vírgula decimal. */
export function lerValor(texto: string): number {
  const limpo = texto.replace(/\s/g, "").replace(",", ".");
  return limpo === "" || !/^\d+(\.\d{1,2})?$/.test(limpo) ? Number.NaN : Number(limpo);
}

/** O primeiro erro do formulário do orçamento; `null` = válido. */
export function validarOrcamento(dados: Pick<DadosOrcamento, "valor" | "descricao">): ErroOrcamento | null {
  if (dados.valor.trim() === "") return "valorVazio";
  const valor = lerValor(dados.valor);
  if (Number.isNaN(valor) || valor <= 0) return "valorInvalido";
  if (valor > VALOR_MAXIMO_ORCAMENTO) return "valorGrande";
  return dados.descricao.trim().length > MAX_DESCRICAO_ORCAMENTO ? "descricaoComprida" : null;
}

/** Só um negócio que ainda não está ganho recebe orçamentos novos. */
export const aceitaOrcamentos = (negocio: NegocioMes): boolean => !isNegocioGanho(negocio);

export interface OrcamentoAcrescentado {
  negocio: NegocioMes;
  orcamentoId: string;
  detalhe: OrcamentoDetalhe;
}

/**
 * Acrescenta um orçamento. Passa a ser o escolhido se o negócio ainda não tinha escolhido nenhum, ou se está aceite (e
 * então os outros deixam de o ser). Um negócio ganho, ou um valor inválido, ficam como estão (devolve `null`).
 */
export function acrescentarOrcamento(
  negocio: NegocioMes, dados: DadosOrcamento, sequencia: number, hoje: string,
): OrcamentoAcrescentado | null {
  if (!aceitaOrcamentos(negocio) || validarOrcamento(dados)) return null;
  const valor = lerValor(dados.valor);
  const escolhido = dados.estado === "aceite" || !negocio.orcamentos.some((o) => o.escolhido);
  const orcamentoId = `o-novo-${sequencia}`;
  const antes = escolhido ? negocio.orcamentos.map((o) => ({ ...o, escolhido: false })) : negocio.orcamentos;
  const descricao = dados.descricao.trim();
  return {
    negocio: { ...negocio, orcamentos: [...antes, { id: orcamentoId, valor, escolhido }] },
    orcamentoId,
    detalhe: { data: hoje, estado: dados.estado, ...(descricao ? { linhas: [{ descricao, valor }] } : {}) },
  };
}

/** A célula da configuração que responde a um evento (o contrato assinado não tem: ganha sempre). */
const CELULA_DO_EVENTO: Record<EventoWorkflow, Celula | null> = {
  aceitarOrcamento: "orcamentoGanho", perderOrcamento: "orcamentoPerdido", aceitarProposta: "propostaGanho",
  perderProposta: "propostaPerdido", assinarContrato: null, perderContrato: "contratoPerdido",
};

const OPCOES_DA_CELULA: Record<Celula, readonly string[]> = {
  orcamentoGanho: OPCOES_ORCAMENTO_GANHO, orcamentoPerdido: OPCOES_ORCAMENTO_PERDIDO, propostaGanho: OPCOES_PROPOSTA_GANHO,
  propostaPerdido: OPCOES_PROPOSTA_PERDIDO, contratoPerdido: OPCOES_CONTRATO_PERDIDO,
};

export interface EscolhaPergunta {
  celula: Celula;
  valor: string;
}

/** As respostas concretas que a configuração admite para um evento cuja resposta é "perguntar" (nunca inclui o próprio "perguntar", em nenhuma das suas formas). */
export function escolhasDaPergunta(config: ConfigWorkflow, evento: EventoWorkflow): EscolhaPergunta[] {
  const celula = CELULA_DO_EVENTO[evento];
  if (!celula) return [];
  const admitidas = opcoesAdmitidas(config)[celula] as Record<string, unknown>;
  return OPCOES_DA_CELULA[celula].filter((v) => !v.startsWith("pergunt") && admitidas[v] === null).map((valor) => ({ celula, valor }));
}

/** O resultado de aplicar um evento a um negócio. */
export type Aplicacao =
  | { tipo: "curso" | "ganho"; negocio: NegocioMes }
  | { tipo: "perdido"; negocio: NegocioMes; motivo: string };

export interface OpcoesEvento {
  /** A resposta escolhida quando a configuração diz "perguntar". */
  escolha?: string;
  /** O motivo de perda; sem ele vale o primeiro da lista. */
  motivo?: string;
  hoje: string;
}

type Fase = Exclude<FaseNegocio, "ganho">;

/** A cadeia (proposta e contrato) de um negócio que fica na fase pedida; o que já existe e ainda vale mantém-se. */
function cadeiaDaFase(negocio: NegocioMes, fase: Fase): Pick<NegocioMes, "proposta" | "contrato"> {
  if (fase === "orcamento") return { proposta: null, contrato: null };
  if (fase === "proposta") return { proposta: negocio.proposta ?? { estado: "rascunho" }, contrato: null };
  return { proposta: { estado: "aceite" }, contrato: { estado: "pendente" } };
}

/** O orçamento que se perde sai da lista: o escolhido, ou, sem escolhido, o último. */
function semOrcamentoPerdido(negocio: NegocioMes): NegocioMes["orcamentos"] {
  const alvo = negocio.orcamentos.find((o) => o.escolhido) ?? negocio.orcamentos[negocio.orcamentos.length - 1];
  return negocio.orcamentos.filter((o) => o !== alvo);
}

function emCurso(negocio: NegocioMes, evento: EventoWorkflow, fase: Fase, hoje: string): NegocioMes {
  const orcamentos = evento === "perderOrcamento" ? semOrcamentoPerdido(negocio) : negocio.orcamentos;
  return {
    ...negocio, ...cadeiaDaFase(negocio, fase), orcamentos,
    parado: fase === "contrato" ? null : 0, proximoPrazo: somarDias(hoje, DIAS_ATE_PRAZO_SEGUINTE),
  };
}

const comoGanho = (negocio: NegocioMes): NegocioMes => ({
  ...negocio, proposta: negocio.proposta ?? { estado: "aceite" }, contrato: { estado: "assinado" }, parado: null, proximoPrazo: null,
});

/**
 * Aplica o que o Workflow manda fazer quando um passo é ganho ou perdido. Devolve `null` quando o evento não se aplica a
 * este negócio, ou quando a configuração pergunta e ainda não se escolheu (ver `escolhasDaPergunta`).
 */
export function aplicarEvento(
  config: ConfigWorkflow, evento: EventoWorkflow, negocio: NegocioMes, { escolha, motivo, hoje }: OpcoesEvento,
): Aplicacao | null {
  const celula = CELULA_DO_EVENTO[evento];
  const usada = celula && escolha ? { ...config, [celula]: escolha } : config;
  const sim = simularEvento(usada, evento, negocio);
  if (sim.tipo !== "resultado" || sim.estado.tipo === "pergunta") return null;
  const { estado } = sim;
  if (estado.tipo === "ganho") return { tipo: "ganho", negocio: comoGanho(negocio) };
  if (estado.tipo === "perdido") return { tipo: "perdido", negocio, motivo: motivo?.trim() || usada.motivosPerda[0] };
  return { tipo: "curso", negocio: emCurso(negocio, evento, estado.fase, hoje) };
}
