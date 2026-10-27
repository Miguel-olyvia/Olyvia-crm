/**
 * Fluxo 5 (Picagem): os alertas de FIM DO DIA e a justificacao de falha de marcacao. Funcoes puras.
 *
 * O RH trata cada alerta de uma de quatro maneiras: corrigir (motivo), pedir justificacao, marcar falta
 * (fluxo 7, com motivo) ou aceitar a diferenca. A pessoa que se esqueceu de picar justifica em 5 dias
 * uteis; o RH aceita (a picagem fica lancada a mao) ou recusa com motivo (a diferenca volta a pendente);
 * passado o prazo sem justificacao a diferenca fica «sem justificacao», falta sugerida.
 */
import { diasUteisEntre, somarDiasUteis } from "@/components/rh-exemplo/lib/diasUteis";
import { minutosDeHora, motivoValido, type Resultado } from "@/components/rh-exemplo/lib/horarioTipos";
import type { Desvio } from "@/components/rh-exemplo/tiposAssiduidade";

export const PRAZO_JUSTIFICACAO_PICAGEM_DIAS_UTEIS = 5;

export const TIPOS_ALERTA = [
  "planeado_sem_realizado",
  "parcialmente_realizado",
  "realizado_sem_planeado",
  "pendente_par",
  "fora_do_local",
] as const;
export type TipoAlerta = (typeof TIPOS_ALERTA)[number];

export type EstadoAlerta =
  | "pendente"
  | "justificacao_pedida"
  | "justificacao_recebida"
  | "corrigido"
  | "falta_marcada"
  | "aceite";

export type AccaoAlerta = "corrigir" | "pedir_justificacao" | "marcar_falta" | "aceitar";

export interface AlertaDia {
  id: string;
  pessoaId: string;
  data: string;
  tipo: TipoAlerta;
  horaInicio: string | null;
  horaFim: string | null;
  minutos: number | null;
  distanciaM: number | null;
  estado: EstadoAlerta;
  motivo: string | null;
  tratadoPor: string | null;
  tratadoEm: string | null;
}

export interface JustificacaoPicagem {
  id: string;
  alertaId: string;
  pessoaId: string;
  horaReal: string;
  motivo: string;
  anexoNome: string | null;
  enviadaEm: string;
  estado: "pendente" | "aceite" | "recusada";
  decididaPor: string | null;
  decididaEm: string | null;
  motivoRecusa: string | null;
}

/** Corrigir e marcar falta exigem motivo (fluxos 5 e 7); pedir justificacao e aceitar nao. */
export function accaoExigeMotivo(accao: AccaoAlerta): boolean {
  return accao === "corrigir" || accao === "marcar_falta";
}

export const ESTADO_DEPOIS_DA_ACCAO: Record<AccaoAlerta, EstadoAlerta> = {
  corrigir: "corrigido",
  pedir_justificacao: "justificacao_pedida",
  marcar_falta: "falta_marcada",
  aceitar: "aceite",
};

export interface DadosAccao {
  motivo: string;
  quem: string;
  agora: string;
}

/** Uma accao do RH sobre um alerta pendente. Um alerta ja tratado nao se trata outra vez. */
export function aplicarAccao(alerta: AlertaDia, accao: AccaoAlerta, dados: DadosAccao): Resultado<AlertaDia> {
  if (alerta.estado !== "pendente") return { ok: false, erro: "rhExemplo.pic.erro.jaTratado" };
  if (accaoExigeMotivo(accao) && !motivoValido(dados.motivo)) return { ok: false, erro: "rhExemplo.pic.erro.motivoCurto" };
  return {
    ok: true,
    valor: {
      ...alerta,
      estado: ESTADO_DEPOIS_DA_ACCAO[accao],
      motivo: dados.motivo.trim() === "" ? null : dados.motivo.trim(),
      tratadoPor: dados.quem,
      tratadoEm: dados.agora,
    },
  };
}

/** O ultimo dia para justificar: 5 dias uteis depois do dia do alerta. */
export function prazoDaJustificacao(dataDoAlerta: string, dias: number = PRAZO_JUSTIFICACAO_PICAGEM_DIAS_UTEIS): string {
  return somarDiasUteis(dataDoAlerta, dias);
}

export function prazoPassou(dataDoAlerta: string, hoje: string, dias?: number): boolean {
  return hoje > prazoDaJustificacao(dataDoAlerta, dias);
}

/** Dias uteis que ainda restam para justificar (0 no ultimo dia e depois dele). */
export function diasUteisRestantes(dataDoAlerta: string, hoje: string, dias?: number): number {
  const prazo = prazoDaJustificacao(dataDoAlerta, dias);
  return hoje >= prazo ? 0 : diasUteisEntre(hoje, prazo);
}

/** O que a pessoa e o RH veem do prazo de um alerta que ainda espera justificacao. */
export type SituacaoDoPrazo = "dentro_do_prazo" | "sem_justificacao" | "nao_aplica";

export function situacaoDoPrazo(alerta: AlertaDia, hoje: string): SituacaoDoPrazo {
  const espera = alerta.estado === "pendente" || alerta.estado === "justificacao_pedida";
  if (!espera) return "nao_aplica";
  return prazoPassou(alerta.data, hoje) ? "sem_justificacao" : "dentro_do_prazo";
}

export interface DadosJustificacao {
  id: string;
  horaReal: string;
  motivo: string;
  anexoNome: string | null;
  hoje: string;
  agora: string;
}

/** A pessoa justifica uma falha de marcacao: hora real + motivo (+ anexo), dentro dos 5 dias uteis. */
export function submeterJustificacao(alerta: AlertaDia, dados: DadosJustificacao): Resultado<JustificacaoPicagem> {
  if (alerta.estado !== "pendente" && alerta.estado !== "justificacao_pedida") {
    return { ok: false, erro: "rhExemplo.pic.erro.jaTratado" };
  }
  if (prazoPassou(alerta.data, dados.hoje)) return { ok: false, erro: "rhExemplo.pic.erro.foraDoPrazo" };
  if (minutosDeHora(dados.horaReal) === null) return { ok: false, erro: "rhExemplo.pic.erro.horaInvalida" };
  if (!motivoValido(dados.motivo)) return { ok: false, erro: "rhExemplo.pic.erro.motivoCurto" };
  return {
    ok: true,
    valor: {
      id: dados.id,
      alertaId: alerta.id,
      pessoaId: alerta.pessoaId,
      horaReal: dados.horaReal,
      motivo: dados.motivo.trim(),
      anexoNome: dados.anexoNome,
      enviadaEm: dados.agora,
      estado: "pendente",
      decididaPor: null,
      decididaEm: null,
      motivoRecusa: null,
    },
  };
}

export interface DecisaoJustificacao {
  aceitar: boolean;
  motivo: string;
  quem: string;
  agora: string;
}

/** O RH aceita (a picagem fica lancada a mao, o alerta resolve-se) ou recusa com motivo (volta a pendente). */
export function decidirJustificacaoPicagem(
  justificacao: JustificacaoPicagem,
  alerta: AlertaDia,
  decisao: DecisaoJustificacao,
): Resultado<{ justificacao: JustificacaoPicagem; alerta: AlertaDia }> {
  if (justificacao.estado !== "pendente") return { ok: false, erro: "rhExemplo.pic.erro.jaTratado" };
  if (!decisao.aceitar && !motivoValido(decisao.motivo)) return { ok: false, erro: "rhExemplo.pic.erro.motivoCurto" };
  const decidida: JustificacaoPicagem = {
    ...justificacao,
    estado: decisao.aceitar ? "aceite" : "recusada",
    decididaPor: decisao.quem,
    decididaEm: decisao.agora,
    motivoRecusa: decisao.aceitar ? null : decisao.motivo.trim(),
  };
  const alertaNovo: AlertaDia = decisao.aceitar
    ? { ...alerta, estado: "corrigido", motivo: justificacao.motivo, tratadoPor: decisao.quem, tratadoEm: decisao.agora }
    : { ...alerta, estado: "pendente" };
  return { ok: true, valor: { justificacao: decidida, alerta: alertaNovo } };
}

/** Os alertas que ainda esperam o RH (pendentes, ou com a justificacao recebida por decidir). */
export function alertasPorTratar(alertas: AlertaDia[]): AlertaDia[] {
  return alertas.filter((a) => a.estado === "pendente" || a.estado === "justificacao_recebida");
}

/* ---- A fila REAL: os desvios que a base propoe (`hr_assiduidade_desvios`) ---- */

/** As tolerancias do filtro de minutos, em texto (o valor do seletor). «0» mostra tudo. */
export const TOLERANCIAS_DESVIO = ["0", "5", "10", "15", "30"] as const;

/** O que o RH pode fazer a um desvio, ligado a RPCs reais. Pedir justificacao e aceitar nao tem equivalente na base. */
export type AccaoDesvio = "corrigir" | "marcar_falta" | "anular_por_ausencia";

/** Uma chave estavel para a linha: a base nao da id ao desvio. */
export function chaveDoDesvio(desvio: Desvio, indice: number): string {
  return [desvio.pessoa_id, desvio.data, desvio.tipo, desvio.referencia_id ?? desvio.planeado_id ?? "", desvio.hora_inicio ?? "", indice].join("|");
}

/**
 * As accoes que cada tipo admite. Corrigir so onde ha uma linha real a corrigir (horas realizadas ou picagem por
 * emparelhar); marcar falta so onde ha um periodo planeado em falta; anular so na falta ja coberta por ausencia.
 */
export function accoesDoDesvio(desvio: Desvio): AccaoDesvio[] {
  switch (desvio.tipo) {
    case "planeado_sem_realizado":
      return desvio.hora_inicio && desvio.hora_fim ? ["marcar_falta"] : [];
    case "planeado_parcialmente_realizado":
      // O desvio traz o bloco planeado inteiro (nao o buraco exacto): o formulario abre com esse bloco e o RH
      // ajusta o inicio e o fim ao buraco real (o almoco nao picado, por exemplo) antes de gravar.
      return desvio.hora_inicio && desvio.hora_fim ? ["marcar_falta"] : [];
    case "realizado_sem_planeado":
      return desvio.referencia_id ? ["corrigir"] : [];
    case "pendente_par":
      return desvio.referencia_id ? ["corrigir"] : [];
    case "falta_coberta_por_ausencia":
      return ["anular_por_ausencia"];
    default:
      return [];
  }
}

/** A picagem por emparelhar nunca se filtra: nao tem duracao e nenhuma tolerancia a torna irrelevante. */
export function filtrarDesviosPorTolerancia(desvios: readonly Desvio[], minutosMinimos: number): Desvio[] {
  return desvios.filter((d) => d.tipo === "pendente_par" || minutosMinimos <= 0 || (d.minutos ?? 0) >= minutosMinimos);
}

/** Agrupa por dia, do mais recente para o mais antigo. */
export function agruparDesviosPorDia(desvios: readonly Desvio[]): Array<[string, Desvio[]]> {
  const porData = new Map<string, Desvio[]>();
  for (const d of desvios) porData.set(d.data, [...(porData.get(d.data) ?? []), d]);
  return [...porData.entries()].sort(([a], [b]) => b.localeCompare(a));
}

export interface SugestaoDeDesvio {
  chave: string;
  pessoaId: string;
  data: string;
  inicio: string;
  fim: string;
  minutos: number;
}

const hhmm = (hora: string): string => hora.slice(0, 5);

/**
 * As sugestoes de falta: turnos planeados sem horas e ainda sem falta em vigor a cobri-los. Os turnos so
 * parcialmente picados ficam DE FORA de proposito: o desvio traz o bloco inteiro e nao o buraco, por isso sugerir
 * uma falta de bloco inteiro seria afirmar o que a base diz que se decide e nao se infere; esses tratam-se na fila
 * (Marcar falta), onde o RH ajusta o periodo. A base ja exclui o
 * que tem falta ou ausencia aprovada; a confirmacao aqui e so contra uma lista de faltas mais recente que os desvios.
 */
export function sugestoesDeFaltaDosDesvios(
  desvios: readonly Desvio[],
  faltas: ReadonlyArray<{ pessoa_id: string; data: string; hora_inicio: string; hora_fim: string }>,
): SugestaoDeDesvio[] {
  return desvios
    .filter((d) => d.tipo === "planeado_sem_realizado" && d.hora_inicio && d.hora_fim && (d.minutos ?? 0) > 0)
    .filter(
      (d) =>
        !faltas.some(
          (f) =>
            f.pessoa_id === d.pessoa_id &&
            f.data === d.data &&
            hhmm(d.hora_inicio ?? "") < hhmm(f.hora_fim) &&
            hhmm(f.hora_inicio) < hhmm(d.hora_fim ?? ""),
        ),
    )
    .map((d) => ({
      chave: [d.pessoa_id, d.data, hhmm(d.hora_inicio ?? "")].join("|"),
      pessoaId: d.pessoa_id,
      data: d.data,
      inicio: hhmm(d.hora_inicio ?? ""),
      fim: hhmm(d.hora_fim ?? ""),
      minutos: d.minutos ?? 0,
    }));
}
