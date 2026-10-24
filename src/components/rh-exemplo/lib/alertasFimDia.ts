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
