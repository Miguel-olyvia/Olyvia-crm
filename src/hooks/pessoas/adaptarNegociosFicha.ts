// Os negócios da ficha real: passam de `negocios.itens` ao NegocioPessoa do ecrã.
// Um negócio ABERTO com contrato assinado continua aberto (fica «pronto a ganhar»): o estado vem da base (`estadoReal`),
// nunca se deduz do contrato. Ganhos e perdidos viram históricos, com o mês de Lisboa.
import type { EstadoContrato, EstadoProposta, NegocioMes } from "@/components/negocio-metas/negocioMetas";
import type { NegocioHistorico, NegocioPessoa } from "@/components/pessoas/pessoasTipos";
import { maisRecentePrimeiro, numero } from "./adaptarComum";
import { diasEntre } from "./adaptarResumoPessoa";
import type { ContratoDb, FichaDb, NegocioFichaDb, PropostaDb } from "./fichaTipos";
import { diaLisboa } from "./tempoLisboa";

// Tabelas de tradução dos valores da base (em minúsculas). Valores reais por confirmar na nike: um desconhecido nunca rebenta.
const PROPOSTA_RASCUNHO = ["draft", "rascunho"];
const PROPOSTA_ACEITE = ["accepted", "aceite", "aceita", "approved"];
// Já saíram de rascunho (enviada, vista, rejeitada, expirada): contam como enviadas.
const PROPOSTA_ENVIADA = ["sent", "viewed", "enviada", "enviado", "rejected", "declined", "expired"];
const CONTRATO_PENDENTE = ["draft", "pending", "pendente", "sent"];
const CONTRATO_ASSINADO = ["signed", "assinado", "assinada", "completed"];
const CONTRATO_CANCELADO = ["cancelled", "canceled", "anulado", "voided"];

const minusculas = (v: string | null | undefined): string => (v ?? "").trim().toLowerCase();

/** O estado da proposta; um valor desconhecido lê os instantes (aceite, enviada, senão rascunho). */
export function estadoPropostaDeDb(p: PropostaDb): EstadoProposta {
  const s = minusculas(p.status);
  if (PROPOSTA_RASCUNHO.includes(s)) return "rascunho";
  if (PROPOSTA_ACEITE.includes(s)) return "aceite";
  if (PROPOSTA_ENVIADA.includes(s)) return "enviada";
  if (p.aceite_em) return "aceite";
  return p.enviada_em ? "enviada" : "rascunho";
}

/** O estado do contrato; os cancelados não contam (null); um valor desconhecido lê `assinado_em`. */
export function estadoContratoDeDb(c: ContratoDb): EstadoContrato | null {
  const s = minusculas(c.status);
  if (CONTRATO_CANCELADO.includes(s)) return null;
  if (CONTRATO_ASSINADO.includes(s)) return "assinado";
  if (CONTRATO_PENDENTE.includes(s)) return "pendente";
  return c.assinado_em ? "assinado" : "pendente";
}

function contratoDoNegocio(n: NegocioFichaDb): NegocioMes["contrato"] {
  const ativos = (n.contratos ?? []).filter((c) => estadoContratoDeDb(c) !== null);
  const recente = maisRecentePrimeiro(ativos, (c) => c.criado_em)[0];
  const estado = recente ? estadoContratoDeDb(recente) : null;
  return estado ? { estado } : null;
}

function propostaDoNegocio(n: NegocioFichaDb): NegocioMes["proposta"] {
  const recente = maisRecentePrimeiro(n.propostas ?? [], (p) => p.criado_em)[0];
  return recente ? { estado: estadoPropostaDeDb(recente) } : null;
}

function adaptarNegocio(n: NegocioFichaDb, ficha: FichaDb, hoje: string): NegocioMes {
  const estadoReal = n.estado === "ganho" || n.estado === "perdido" ? n.estado : "aberto";
  return {
    id: n.id,
    pessoaId: ficha.pessoa.id,
    pessoa: ficha.pessoa.nome?.trim() ?? "",
    servico: n.titulo?.trim() ?? "",
    comercial: n.responsavel_nome?.trim() ?? "",
    dias: diasEntre(n.criado_em, hoje) ?? 0,
    parado: n.parado_desde ? diasEntre(n.parado_desde, hoje) : null,
    proximoPrazo: null,
    contacto: { telefone: ficha.pessoa.contacto?.telefone ?? null, email: ficha.pessoa.contacto?.email ?? null },
    orcamentos: (n.orcamentos ?? []).map((o) => ({ id: o.id, valor: numero(o.total), escolhido: false })),
    proposta: propostaDoNegocio(n),
    contrato: contratoDoNegocio(n),
    ...(n.levantamento_id ? { decisaoLevantamento: "ligado" as const } : {}),
    valorBase: numero(n.valor),
    estadoReal,
  };
}

function comoHistorico(base: NegocioMes, n: NegocioFichaDb): NegocioHistorico {
  const resultado = base.estadoReal === "ganho" ? "ganho" : "perdido";
  const quando = (resultado === "ganho" ? n.ganho_em : n.perdido_em) ?? n.criado_em;
  return { ...base, resultado, mes: (diaLisboa(quando) ?? "").slice(0, 7) };
}

/** Todos os negócios da pessoa: os abertos como NegocioMes, os ganhos e perdidos como históricos. */
export function adaptarNegocios(ficha: FichaDb, hoje: string): NegocioPessoa[] {
  return (ficha.negocios?.itens ?? []).map((n) => {
    const base = adaptarNegocio(n, ficha, hoje);
    return base.estadoReal === "aberto" ? base : comoHistorico(base, n);
  });
}
