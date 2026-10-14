// A visita de uma pessoa, em memória: funções puras e imutáveis. O dia de hoje chega por parâmetro. Marcar (a partir de
// uma submissão ou da chamada), alterar e concluir a visita. A visita leva a morada onde acontece (a da lead ou outra) e
// guarda-se em `Pessoa.visita`; o próximo contacto é o dia dela e fica tudo registado na atividade.
import type { EstadoAcoes } from "./acoesPessoa";
import { indiceEtapa } from "./etapaPessoa";
import {
  destinoInicial, moradaDaLead, resolverDestino, textoMoradaVisita, validarDestino, type DestinoVisita, type ErroMoradaVisita,
} from "./moradaVisita";
import type { ItemAtividade, Pessoa, VisitaPessoa } from "./pessoasTipos";

export const MAX_NOTA_VISITA = 140;

export interface DadosVisita {
  /** AAAA-MM-DD. */
  data: string;
  /** HH:MM; vazio = sem hora. */
  hora: string;
  nota: string;
  /** O serviço de que pediu a visita (para o registo). */
  servico: string;
  /** O texto do registo, quando quem marca já o tem escrito (a chamada: "16/10 · 09:30 · morada"); senão compõe-se aqui. */
  detalhe?: string;
  /** Onde é a visita; sem isto, vale a morada da lead (se a tiver). */
  destino?: DestinoVisita;
}

export type ErroVisita = "dataVazia" | "dataPassada" | "horaInvalida" | "notaComprida" | ErroMoradaVisita;

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * O primeiro erro do formulário da visita; `null` = válido. A data não pode ser anterior a hoje. Com `destino`, valida também
 * a morada (`moradaLead` diz se "na morada da lead" é possível).
 */
export function validarVisita(
  dados: Pick<DadosVisita, "data" | "hora" | "nota"> & { destino?: DestinoVisita }, hoje: string, moradaLead: Parameters<typeof validarDestino>[1] = null,
): ErroVisita | null {
  if (!FORMATO_DATA.test(dados.data)) return "dataVazia";
  if (dados.data < hoje) return "dataPassada";
  if (dados.hora !== "" && !FORMATO_HORA.test(dados.hora)) return "horaInvalida";
  if (dados.nota.trim().length > MAX_NOTA_VISITA) return "notaComprida";
  return dados.destino ? validarDestino(dados.destino, moradaLead) : null;
}

/** O que fica escrito na atividade: "2026-10-20 10:30 · Cozinha · nota · Rua A 1, 1000-001 Lisboa". */
const detalheDaVisita = (d: DadosVisita, morada: string): string =>
  [d.hora ? `${d.data} ${d.hora}` : d.data, d.servico, d.nota.trim(), morada].filter(Boolean).join(" · ");

const novoId = (estado: EstadoAcoes, tipo: string): string => `novo-${tipo}-${estado.atividade.length + 1}`;

const registo = (estado: EstadoAcoes, id: string, tipo: string, chaveTitulo: string, detalhe: string, hoje: string): ItemAtividade => ({
  id: novoId(estado, tipo), pessoaId: id, tipo: "historico", titulo: "", chaveTitulo, detalhe, quando: hoje, exemplo: false,
});

/**
 * Marca a visita: o próximo contacto passa a ser o dia dela, o último contacto é hoje, quem estava antes da etapa "Visita"
 * passa a ela, e conta como contactada (marcar uma visita é falar com ela). Uma perdida, um id que não existe ou dados
 * inválidos deixam o estado como está. A morada da visita é a da lead, salvo se `destino` disser outra.
 */
export function marcarVisita<E extends EstadoAcoes>(estado: E, id: string, dados: DadosVisita, hoje: string): E {
  const alvo = estado.pessoas.find((p) => p.id === id);
  if (!alvo || alvo.perdida) return estado;
  const lead = moradaDaLead(alvo);
  if (validarVisita(dados, hoje, lead)) return estado;
  const onde = resolverDestino(dados.destino ?? destinoInicial(lead), lead);
  const visita: VisitaPessoa = {
    data: dados.data, hora: dados.hora, comercial: alvo.comercial, ...(dados.servico ? { servico: dados.servico } : {}), ...onde,
  };
  const item = registo(estado, id, "visita", "pessoasPagina.activity.visitBooked", dados.detalhe ?? detalheDaVisita(dados, textoMoradaVisita(onde.moradaVisita)), hoje);
  const etapa = indiceEtapa(alvo.etapa) < indiceEtapa("visitaMarcada") ? "visitaMarcada" : alvo.etapa;
  return {
    ...estado,
    pessoas: estado.pessoas.map((p) => (p.id === id ? { ...p, etapa, visita, ultimoContactoDias: 0, proximoContacto: dados.data, proximoHora: dados.hora || undefined } : p)),
    atividade: [item, ...estado.atividade],
    contactadas: estado.contactadas.includes(id) ? estado.contactadas : [...estado.contactadas, id],
  };
}

export interface DadosAlterarVisita {
  data: string;
  hora: string;
  destino: DestinoVisita;
}

/** A pessoa tem uma visita por concluir ou marcada (a guardada, ou a etapa "Com visita" das fichas antigas). */
const temVisita = (p: Pessoa): boolean => !p.perdida && (p.visita !== undefined || p.etapa === "visitaMarcada");

/**
 * Altera a visita já marcada (dia, hora e morada): a nova morada passa a valer, o próximo contacto acompanha o dia e a
 * atividade regista-o. Sem visita, perdida, ou dados inválidos, o estado fica como está.
 */
export function alterarVisita<E extends EstadoAcoes>(estado: E, id: string, dados: DadosAlterarVisita, hoje: string): E {
  const alvo = estado.pessoas.find((p) => p.id === id);
  if (!alvo || !temVisita(alvo)) return estado;
  const lead = moradaDaLead(alvo);
  if (validarVisita({ ...dados, nota: "" }, hoje, lead)) return estado;
  const onde = resolverDestino(dados.destino, lead);
  const visita: VisitaPessoa = { ...alvo.visita, comercial: alvo.visita?.comercial ?? alvo.comercial, data: dados.data, hora: dados.hora, ...onde };
  if (!onde.notaAcesso) delete visita.notaAcesso;
  const detalhe = [dados.hora ? `${dados.data} ${dados.hora}` : dados.data, textoMoradaVisita(onde.moradaVisita)].filter(Boolean).join(" · ");
  return {
    ...estado,
    pessoas: estado.pessoas.map((p) => (p.id === id ? { ...p, visita, proximoContacto: dados.data, proximoHora: dados.hora || undefined } : p)),
    atividade: [registo(estado, id, "visita-alterada", "pessoasPagina.activity.visitChanged", detalhe, hoje), ...estado.atividade],
  };
}

/**
 * Conclui a visita (o negócio acaba de ser criado a partir dela): a visita sai da ficha, o próximo contacto que era o dia
 * dela fica vazio, conta como contacto de hoje e a atividade regista "Visita concluída · negócio criado". A etapa passa a
 * "Negócio" sozinha, pelas regras já existentes (há um negócio aberto). Sem visita ou perdida, fica como está.
 */
export function concluirVisita<E extends EstadoAcoes>(estado: E, id: string, hoje: string): E {
  const alvo = estado.pessoas.find((p) => p.id === id);
  if (!alvo || !temVisita(alvo)) return estado;
  const dia = alvo.visita?.data ?? alvo.proximoContacto ?? hoje;
  const detalhe = [alvo.visita?.hora ? `${dia} ${alvo.visita.hora}` : dia, alvo.visita ? textoMoradaVisita(alvo.visita.moradaVisita) : ""].filter(Boolean).join(" · ");
  return {
    ...estado,
    pessoas: estado.pessoas.map((p) => {
      if (p.id !== id) return p;
      const { visita: _visita, ...resto } = p;
      const eraOProximo = p.proximoContacto === dia;
      return { ...resto, ultimoContactoDias: 0, ...(eraOProximo ? { proximoContacto: null, proximoHora: undefined } : {}) };
    }),
    atividade: [registo(estado, id, "visita-concluida", "pessoasPagina.activity.visitDone", detalhe, hoje), ...estado.atividade],
    contactadas: estado.contactadas.includes(id) ? estado.contactadas : [...estado.contactadas, id],
  };
}
