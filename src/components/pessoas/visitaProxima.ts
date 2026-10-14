// A próxima visita de uma pessoa e o que dela se leva para o negócio, em funções puras (o dia de hoje chega por parâmetro).
// Uma pessoa tem visita quando `pessoa.visita` existe ou, nas fichas antigas, quando está na etapa "Com visita" com um
// próximo contacto (então vale a morada da lead). Uma perdida não tem visita.
import type { ValoresIniciaisNegocio } from "@/components/negocio-metas/novoNegocio";
import { MORADA_VISITA_VAZIA, moradaDaLead } from "./moradaVisita";
import type { EtapaPessoa, Pessoa, VisitaPessoa } from "./pessoasTipos";

export type EstadoVisita = "marcada" | "porConcluir";

/** A visita com o seu estado: marcada (hoje ou à frente) ou por concluir (o dia já passou e ninguém a concluiu). */
export interface VisitaResolvida extends VisitaPessoa {
  estado: EstadoVisita;
}

/** A visita de uma ficha antiga, sem morada própria: o próximo contacto, com a morada da lead. */
function visitaDaEtapa(pessoa: Pessoa, etapa: EtapaPessoa): VisitaPessoa | null {
  if (etapa !== "visitaMarcada" || !pessoa.proximoContacto) return null;
  const lead = moradaDaLead(pessoa);
  return {
    data: pessoa.proximoContacto, hora: pessoa.proximoHora ?? "", comercial: pessoa.comercial,
    igualALead: lead !== null, moradaVisita: lead ?? MORADA_VISITA_VAZIA,
  };
}

/** A visita da pessoa, sem o estado; `null` sem visita (ou perdida). `etapa` é a etapa efetiva da ficha. */
export function visitaDaPessoa(pessoa: Pessoa, etapa: EtapaPessoa): VisitaPessoa | null {
  return pessoa.perdida ? null : pessoa.visita ?? visitaDaEtapa(pessoa, etapa);
}

/** A visita por concluir ou marcada da pessoa; `null` sem visita (ou perdida). */
export function proximaVisita(pessoa: Pessoa, etapa: EtapaPessoa, hoje: string): VisitaResolvida | null {
  const base = visitaDaPessoa(pessoa, etapa);
  return base ? { ...base, estado: base.data < hoje ? "porConcluir" : "marcada" } : null;
}

/** O dia da semana de um dia AAAA-MM-DD: 0 (domingo) a 6 (sábado), sem fusos nem relógio. */
export function diaDaSemana(dia: string): number {
  const [ano, mes, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, d)).getUTCDay();
}

/**
 * O que "Novo negócio" leva pré-preenchido quando se cria o negócio a partir da visita concluída: a pessoa, o comercial
 * responsável, e a aba Visita (o dia, quem fez, estado Feito) com a MORADA DA OBRA igual à MORADA DA VISITA, nunca à da lead.
 */
export function valoresIniciaisDaVisita(pessoa: Pessoa, visita: VisitaPessoa): ValoresIniciaisNegocio {
  return {
    pessoaId: pessoa.id,
    comercial: visita.comercial,
    visita: {
      data: visita.data, quemFez: visita.comercial, estado: "feito", moradaObra: { ...visita.moradaVisita }, igualALead: visita.igualALead,
    },
  };
}
