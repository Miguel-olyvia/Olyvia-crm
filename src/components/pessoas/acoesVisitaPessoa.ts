// O que as ações da visita e do levantamento mudam na pessoa e na atividade, em funções puras e imutáveis (as visitas e o levantamento em si
// vivem no store dos registos da pessoa). O dia de hoje chega por parâmetro. Uma pessoa que não existe deixa o estado como está.
import type { ResultadoVisita, VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import type { EstadoAcoes } from "./acoesPessoa";
import type { ItemAtividade, MotivoEncerramento } from "./pessoasTipos";

/** O que se guarda de uma visita: o resultado e, nos que encerram a abordagem, o motivo (um da lista, ou «outro» com texto). */
export interface DadosResultadoVisita {
  resultado: ResultadoVisita;
  motivo?: MotivoEncerramento;
  motivoOutro?: string;
}

const CHAVE_VISITA_MARCADA = "pessoasPagina.activity.visitBooked";
const CHAVE_VISITA_ALTERADA = "pessoasPagina.activity.visitChanged";
const CHAVE_VISITA_FEITA = "pessoasPagina.process.activity.visitMarkedDone";
const CHAVE_LEVANTAMENTO = "pessoasPagina.process.activity.surveySaved";
const CHAVE_RESULTADO = "pessoasPagina.visitResult.activity";

const existe = (estado: EstadoAcoes, id: string): boolean => estado.pessoas.some((p) => p.id === id);

/** Uma linha da atividade; `n` evita ids repetidos quando uma ação junta várias. */
const linha = (estado: EstadoAcoes, n: number, pessoaId: string, tipo: string, chaveTitulo: string, hoje: string, resto: Partial<ItemAtividade>): ItemAtividade => ({
  id: `novo-${tipo}-${estado.atividade.length + n + 1}`, pessoaId, tipo: "historico", titulo: "", chaveTitulo, detalhe: "", quando: hoje, exemplo: false, ...resto,
});

/** Falar com a pessoa: o último contacto é hoje e conta como contactada (deixa de ser «Voltou a contactar»). */
function contactar<E extends EstadoAcoes>(estado: E, pessoaId: string): E {
  return {
    ...estado,
    pessoas: estado.pessoas.map((p) => (p.id === pessoaId ? { ...p, ultimoContactoDias: 0 } : p)),
    contactadas: estado.contactadas.includes(pessoaId) ? estado.contactadas : [...estado.contactadas, pessoaId],
  };
}

/** Marcar uma visita conta como contacto e deixa «Visita marcada» (com o dia e a morada em `detalhe`) na atividade. */
export function visitaMarcada<E extends EstadoAcoes>(estado: E, pessoaId: string, detalhe: string, hoje: string): E {
  if (!existe(estado, pessoaId)) return estado;
  const item = linha(estado, 0, pessoaId, "visita", CHAVE_VISITA_MARCADA, hoje, { detalhe });
  const contactada = contactar(estado, pessoaId);
  return { ...contactada, atividade: [item, ...estado.atividade] };
}

/** Alterar o dia, a hora ou a morada de uma visita deixa a linha na atividade; não conta como contacto. */
export function visitaAlterada<E extends EstadoAcoes>(estado: E, pessoaId: string, detalhe: string, hoje: string): E {
  if (!existe(estado, pessoaId)) return estado;
  const item = linha(estado, 0, pessoaId, "visita-alterada", CHAVE_VISITA_ALTERADA, hoje, { detalhe });
  return { ...estado, atividade: [item, ...estado.atividade] };
}

/** As visitas que passaram a feita: cada uma deixa «Visita feita» (dia e hora) na atividade, pela ordem dada, e a pessoa conta como contactada. */
export function visitasFeitas<E extends EstadoAcoes>(estado: E, pessoaId: string, feitas: readonly VisitaPessoa[], hoje: string): E {
  if (feitas.length === 0 || !existe(estado, pessoaId)) return estado;
  const itens = feitas.map((v, i) => linha(estado, i, pessoaId, "visita-feita", CHAVE_VISITA_FEITA, hoje, { detalhe: [v.data, v.hora].filter(Boolean).join(" ") }));
  return { ...contactar(estado, pessoaId), atividade: [...itens, ...estado.atividade] };
}

/** Um levantamento novo, ou diferente do que havia, deixa «Levantamento guardado» na atividade; sem mudança, nada. */
export function levantamentoGuardado<E extends EstadoAcoes>(estado: E, pessoaId: string, mudou: boolean, hoje: string): E {
  if (!mudou || !existe(estado, pessoaId)) return estado;
  const item = linha(estado, 0, pessoaId, "levantamento", CHAVE_LEVANTAMENTO, hoje, {});
  return { ...estado, atividade: [item, ...estado.atividade] };
}

/** O resultado de uma visita (interessado, a pensar...) fica na atividade e conta como contacto. */
export function resultadoDaVisitaRegistado<E extends EstadoAcoes>(estado: E, pessoaId: string, resultado: ResultadoVisita, hoje: string): E {
  if (!existe(estado, pessoaId)) return estado;
  const item = linha(estado, 0, pessoaId, "resultado-visita", CHAVE_RESULTADO, hoje, { chaveDetalhe: `pessoasPagina.visitResult.result.${resultado}` });
  return { ...contactar(estado, pessoaId), atividade: [item, ...estado.atividade] };
}
