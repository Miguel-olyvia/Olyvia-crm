// A simulação do Workflow: o que aconteceria a um negócio de exemplo quando um dos seus passos é
// ganho ou perdido, e a linha "Se ganho / Se perdido" do negócio. Só calcula: nunca altera o
// negócio nem a configuração. Devolve chaves de tradução (`Texto`).
import { faseDoNegocio, isNegocioGanho, type NegocioMes } from "./negocioMetas";
import {
  acaoDe, normalizarConfig, tx, type Celula, type ConfigWorkflow, type ContratoPerdido, type FaseCadeia, type OrcamentoGanho,
  type OrcamentoPerdido, type PropostaGanho, type PropostaPerdido, type Texto,
} from "./workflowNegocio";

export type EventoWorkflow =
  | "aceitarOrcamento" | "perderOrcamento" | "aceitarProposta" | "perderProposta" | "assinarContrato" | "perderContrato";

/** Como fica o negócio depois do evento. */
export type EstadoResultante =
  | { tipo: "ganho" } | { tipo: "perdido" } | { tipo: "pergunta" } | { tipo: "curso"; fase: FaseCadeia };

export type Simulacao =
  | {
    tipo: "resultado";
    resultado: Texto;
    estado: EstadoResultante;
    /** O negócio fica perdido: pede um motivo da lista de motivos de perda. */
    pedeMotivo: boolean;
    /** Fecha como ganho sem contrato assinado, o que as metas ainda não contam. */
    ganhoSemContrato: boolean;
    /** Uma nota do simulador (por exemplo, o valor do negócio que fica a 0); `null` sem nota. */
    nota: Texto | null;
  }
  | { tipo: "nao-aplicavel"; motivo: Texto };

const EVENTOS_DO_PASSO: Record<ReturnType<typeof faseDoNegocio>, readonly [EventoWorkflow, EventoWorkflow]> = {
  orcamento: ["aceitarOrcamento", "perderOrcamento"],
  proposta: ["aceitarProposta", "perderProposta"],
  contrato: ["assinarContrato", "perderContrato"],
  ganho: ["assinarContrato", "perderContrato"],
};

/** Os dois eventos do passo atual do negócio (um negócio já ganho mostra os do contrato, indisponíveis). */
export const eventosDoPasso = (negocio: NegocioMes): readonly [EventoWorkflow, EventoWorkflow] =>
  EVENTOS_DO_PASSO[faseDoNegocio(negocio)];

const naoAplicavel = (sufixo: string): Simulacao => ({ tipo: "nao-aplicavel", motivo: tx(`sim.na.${sufixo}`) });

/** `null` = o evento aplica-se; senão, o motivo. A fase do negócio decide, e a configuração só desliga fases. */
function motivoNaoAplicavel(c: ConfigWorkflow, evento: EventoWorkflow, n: NegocioMes): Simulacao | null {
  if (isNegocioGanho(n)) return naoAplicavel("jaFechado");
  if (evento === "aceitarOrcamento" || evento === "perderOrcamento") {
    if (faseDoNegocio(n) !== "orcamento") return naoAplicavel("jaPassou");
    if (evento === "aceitarOrcamento") return n.orcamentos.some((o) => o.escolhido) ? null : naoAplicavel("semEscolhido");
    return n.orcamentos.length >= 1 ? null : naoAplicavel("semOrcamentos");
  }
  if (evento === "aceitarProposta" || evento === "perderProposta") {
    if (!c.fases.proposta) return naoAplicavel("faseDesligada");
    if (!n.proposta) return naoAplicavel("semProposta");
    if (n.contrato) return naoAplicavel("jaPassou");
    if (n.proposta.estado === "aceite") return naoAplicavel("jaAceite");
    return n.proposta.estado === "rascunho" ? naoAplicavel("rascunho") : null;
  }
  if (!c.fases.contrato) return naoAplicavel("contratoDesligado");
  return n.contrato ? null : naoAplicavel("semContrato");
}

const GANHO: EstadoResultante = { tipo: "ganho" };
const PERDIDO: EstadoResultante = { tipo: "perdido" };
const PERGUNTA: EstadoResultante = { tipo: "pergunta" };
const curso = (fase: FaseCadeia): EstadoResultante => ({ tipo: "curso", fase });

type ChaveEstado =
  | `orcamentoGanho.${OrcamentoGanho}` | `orcamentoPerdido.${OrcamentoPerdido}` | `propostaGanho.${PropostaGanho}`
  | `propostaPerdido.${PropostaPerdido}` | `contratoPerdido.${ContratoPerdido}` | "contratoGanho.assinado";

/** Como fica o negócio, por célula e valor. O perdido do Orçamento depende dos outros orçamentos (ver `estadoDe`). */
const ESTADO_POR_RESPOSTA: Record<ChaveEstado, EstadoResultante> = {
  "orcamentoGanho.criarProposta": curso("proposta"), "orcamentoGanho.perguntar": PERGUNTA,
  "orcamentoGanho.nada": curso("orcamento"), "orcamentoGanho.fecharGanho": GANHO,
  "orcamentoPerdido.perderSeUltimo": PERDIDO, "orcamentoPerdido.manterAberto": curso("orcamento"),
  "orcamentoPerdido.perguntar": PERGUNTA,
  "propostaGanho.perguntarContrato": PERGUNTA, "propostaGanho.criarContrato": curso("contrato"),
  "propostaGanho.fecharSemContrato": GANHO,
  "propostaPerdido.perderNegocio": PERDIDO, "propostaPerdido.voltarOrcamento": curso("orcamento"),
  "propostaPerdido.perguntar": PERGUNTA,
  "contratoGanho.assinado": GANHO,
  "contratoPerdido.perderNegocio": PERDIDO, "contratoPerdido.voltarProposta": curso("proposta"),
  "contratoPerdido.perguntar": PERGUNTA,
};

function estadoDe(celula: Celula | "contratoGanho", valor: string, n: NegocioMes): EstadoResultante {
  const chave = `${celula}.${valor}` as ChaveEstado;
  // Com outro orçamento em aberto, perder um orçamento não perde o negócio.
  if (chave === "orcamentoPerdido.perderSeUltimo" && n.orcamentos.length >= 2) return curso("orcamento");
  return ESTADO_POR_RESPOSTA[chave];
}

/** A célula (e o valor escolhido) que responde a cada evento. */
function respostaDe(c: ConfigWorkflow, evento: EventoWorkflow): { celula: Celula | "contratoGanho"; valor: string } {
  switch (evento) {
    case "aceitarOrcamento": return { celula: "orcamentoGanho", valor: c.orcamentoGanho };
    case "perderOrcamento": return { celula: "orcamentoPerdido", valor: c.orcamentoPerdido };
    case "aceitarProposta": return { celula: "propostaGanho", valor: c.propostaGanho };
    case "perderProposta": return { celula: "propostaPerdido", valor: c.propostaPerdido };
    case "assinarContrato": return { celula: "contratoGanho", valor: "assinado" };
    case "perderContrato": return { celula: "contratoPerdido", valor: c.contratoPerdido };
  }
}

/**
 * O que aconteceria ao negócio neste evento. Perder o orçamento que estava escolhido deixa o valor do
 * negócio a 0 até escolher outro: só o simulador o diz, em nota.
 */
export function simularEvento(entrada: ConfigWorkflow, evento: EventoWorkflow, negocio: NegocioMes): Simulacao {
  const c = normalizarConfig(entrada).config;
  const bloqueio = motivoNaoAplicavel(c, evento, negocio);
  if (bloqueio) return bloqueio;
  const { celula, valor } = respostaDe(c, evento);
  const estado = estadoDe(celula, valor, negocio);
  const fechaSemContrato = estado.tipo === "ganho" && evento !== "assinarContrato";
  const perdeEscolhido = evento === "perderOrcamento" && estado.tipo === "curso" && negocio.orcamentos.some((o) => o.escolhido);
  return {
    tipo: "resultado",
    resultado: tx("sim.res", { acao: acaoDe(celula, valor) }),
    estado,
    pedeMotivo: estado.tipo === "perdido",
    ganhoSemContrato: fechaSemContrato,
    nota: perdeEscolhido ? tx("sim.nota.valorZero") : null,
  };
}

/** Onde o diagrama marca o resultado da simulação: um nó, ou a seta de perdido de um passo. */
export type DestinoDiagrama = { tipo: "no"; no: FaseCadeia | "ganho" } | { tipo: "perdido"; de: FaseCadeia };

const FASE_DO_EVENTO: Record<EventoWorkflow, FaseCadeia> = {
  aceitarOrcamento: "orcamento", perderOrcamento: "orcamento", aceitarProposta: "proposta",
  perderProposta: "proposta", assinarContrato: "contrato", perderContrato: "contrato",
};

/** O que o diagrama destaca depois de simular: o nó onde o negócio fica, ou a seta de perdido; nada se só pergunta. */
export function destinoDoEvento(evento: EventoWorkflow, simulacao: Simulacao | null): DestinoDiagrama | null {
  if (simulacao?.tipo !== "resultado") return null;
  const { estado } = simulacao;
  if (estado.tipo === "ganho") return { tipo: "no", no: "ganho" };
  if (estado.tipo === "curso") return { tipo: "no", no: estado.fase };
  return estado.tipo === "perdido" ? { tipo: "perdido", de: FASE_DO_EVENTO[evento] } : null;
}

/**
 * "Se ganho: ..." e "Se perdido: ...": cada linha só existe se o simulador a daria como aplicável a este negócio
 * (uma proposta em rascunho, ou já aceite sem contrato, não tem nenhuma); `null` num negócio sem passo atual.
 */
export function textoAoMudar(entrada: ConfigWorkflow, negocio: NegocioMes): { ganho: Texto | null; perdido: Texto | null } | null {
  const c = normalizarConfig(entrada).config;
  const fase = faseDoNegocio(negocio);
  if (fase === "ganho" || (fase === "proposta" && !c.fases.proposta) || (fase === "contrato" && !c.fases.contrato)) return null;
  const [evGanho, evPerdido] = EVENTOS_DO_PASSO[fase];
  const linha = (evento: EventoWorkflow, chave: string): Texto | null => {
    if (motivoNaoAplicavel(c, evento, negocio)) return null;
    const { celula, valor } = respostaDe(c, evento);
    return tx(chave, { acao: acaoDe(celula, valor) });
  };
  const ganho = linha(evGanho, "aoMudar.ganho");
  const perdido = linha(evPerdido, "aoMudar.perdido");
  return ganho || perdido ? { ganho, perdido } : null;
}
