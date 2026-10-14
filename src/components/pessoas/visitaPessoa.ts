// "Marcar visita" a partir de uma submissão que a pediu, em memória: funções puras e imutáveis. O dia de hoje chega por
// parâmetro. A pessoa passa à etapa "Visita" (se ainda estava antes), o próximo contacto é o dia da visita e fica
// registado na atividade.
import type { EstadoAcoes } from "./acoesPessoa";
import { indiceEtapa } from "./etapaPessoa";
import type { ItemAtividade } from "./pessoasTipos";

export const MAX_NOTA_VISITA = 140;

export interface DadosVisita {
  /** AAAA-MM-DD. */
  data: string;
  /** HH:MM; vazio = sem hora. */
  hora: string;
  nota: string;
  /** O serviço de que pediu a visita (para o registo). */
  servico: string;
}

export type ErroVisita = "dataVazia" | "dataPassada" | "horaInvalida" | "notaComprida";

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** O primeiro erro do formulário da visita; `null` = válido. A data não pode ser anterior a hoje. */
export function validarVisita(dados: Pick<DadosVisita, "data" | "hora" | "nota">, hoje: string): ErroVisita | null {
  if (!FORMATO_DATA.test(dados.data)) return "dataVazia";
  if (dados.data < hoje) return "dataPassada";
  if (dados.hora !== "" && !FORMATO_HORA.test(dados.hora)) return "horaInvalida";
  return dados.nota.trim().length > MAX_NOTA_VISITA ? "notaComprida" : null;
}

/** O que fica escrito na atividade: "2026-10-20 10:30 · Cozinha · nota". */
const detalheDaVisita = (d: DadosVisita): string =>
  [d.hora ? `${d.data} ${d.hora}` : d.data, d.servico, d.nota.trim()].filter(Boolean).join(" · ");

/**
 * Marca a visita: o próximo contacto passa a ser o dia dela, o último contacto é hoje, quem estava antes da etapa "Visita"
 * passa a ela, e conta como contactada (marcar uma visita é falar com ela). Uma perdida, um id que não existe ou dados
 * inválidos deixam o estado como está.
 */
export function marcarVisita<E extends EstadoAcoes>(estado: E, id: string, dados: DadosVisita, hoje: string): E {
  const alvo = estado.pessoas.find((p) => p.id === id);
  if (!alvo || alvo.perdida || validarVisita(dados, hoje)) return estado;
  const item: ItemAtividade = {
    id: `novo-visita-${estado.atividade.length + 1}`, pessoaId: id, tipo: "historico", titulo: "",
    chaveTitulo: "pessoasPagina.activity.visitBooked", detalhe: detalheDaVisita(dados), quando: hoje, exemplo: false,
  };
  const etapa = indiceEtapa(alvo.etapa) < indiceEtapa("visitaMarcada") ? "visitaMarcada" : alvo.etapa;
  return {
    ...estado,
    pessoas: estado.pessoas.map((p) => (p.id === id ? { ...p, etapa, ultimoContactoDias: 0, proximoContacto: dados.data } : p)),
    atividade: [item, ...estado.atividade],
    contactadas: estado.contactadas.includes(id) ? estado.contactadas : [...estado.contactadas, id],
  };
}
