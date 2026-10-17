// A semente de uma pessoa de exemplo: a pessoa mais a etapa e a visita com que o exemplo foi desenhado. Só serve para gerar os
// pedidos de exemplo (ver `pedidosDeExemplo.ts`): a pessoa em si não tem etapa nem visita, que são dos pedidos.
import type { RascunhoLevantamento } from "@/components/negocio-metas/novoNegocio";
import type { EtapaPessoa, MoradaVisita, Pessoa } from "./pessoasTipos";

/** A visita de uma semente: o dia, a hora, o comercial e a morada (a da lead ou outra), com a nota de acesso quando é outra. */
export interface VisitaSemente {
  /** AAAA-MM-DD. */
  data: string;
  /** HH:MM; vazio = sem hora. */
  hora: string;
  comercial: string;
  servico?: string;
  igualALead: boolean;
  moradaVisita: MoradaVisita;
  notaAcesso?: string;
  /** A visita já aconteceu; falta nas que estão só marcadas. */
  feita?: boolean;
  levantamento?: RascunhoLevantamento;
}

export interface PessoaSemente extends Pessoa {
  etapa: EtapaPessoa;
  visita?: VisitaSemente;
}

/**
 * A pessoa sem os campos da semente. O próximo contacto de uma pessoa com visita (ou na etapa antiga "Com visita") era o dia da
 * visita: esse dia passa a ser o da visita do pedido (ver `proximoContactoDaPessoa`) e a pessoa fica sem chamada agendada.
 */
export function paraPessoa({ etapa, visita, ...pessoa }: PessoaSemente): Pessoa {
  if (visita === undefined && etapa !== "visitaMarcada") return pessoa;
  const { proximoContacto: _dia, proximoHora: _hora, ...resto } = pessoa;
  return { ...resto, proximoContacto: null };
}
