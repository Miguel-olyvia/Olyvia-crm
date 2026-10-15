/**
 * Justificar um dia com FALTA SUGERIDA ou ATRASO acima da tolerância (fluxos 5 e 7). Funções puras, sem loja nem ecrã.
 *
 * A pessoa só justifica (tipo, motivo, hora real, anexos simulados), dentro do prazo da organização; o RH aceita
 * (paga ou não paga) ou recusa com motivo. O desconto NÃO se recalcula aqui: aceitar cria uma falta marcada e o
 * cálculo do mês usa `descontoDaFalta` de `faltasB.ts`, a mesma regra de sempre (só desconta o que não seja
 * justificado e pago). `descontoDaDecisao` limita-se a perguntar a essa função o que daria cada decisão.
 */
import { minutosDeHora, motivoValido, type Resultado } from "@/components/rh-exemplo/lib/horarioTipos";
import {
  decidirJustificacaoFalta,
  descontoDaFalta,
  foraDoPrazoDeJustificar,
  prazoParaJustificar,
  type DescontoDaFalta,
} from "@/components/rh-exemplo/lib/faltasB";
import { diasUteisEntre } from "@/components/rh-exemplo/lib/diasUteis";

export const TIPOS_JUSTIFICACAO_DIA = ["consulta_medica", "transporte", "assunto_pessoal", "outro"] as const;
export type TipoJustificacaoDia = (typeof TIPOS_JUSTIFICACAO_DIA)[number];
export const MAX_ANEXOS_JUSTIFICACAO = 4;
/** O texto de uma consulta médica é dado de saúde: o RH só o lê com «Ver texto», que regista quem leu. */
export const TIPO_SENSIVEL: TipoJustificacaoDia = "consulta_medica";

export type EstadoJustificacaoDia = "pendente" | "aceite_paga" | "aceite_nao_paga" | "recusada";
export type DecisaoJustificacaoDia = "aceitar_paga" | "aceitar_nao_paga" | "recusar";

export interface JustificacaoDia {
  id: string;
  /** De onde nasce: de uma sugestão do sistema (falta sugerida ou atraso), não de uma picagem esquecida. */
  origem: "sugestao";
  pessoaId: string;
  data: string;
  tipo: TipoJustificacaoDia;
  motivo: string;
  /** Hora real de chegada ou saída, se a pessoa a indicou. */
  horaReal: string | null;
  /** Só os nomes: o exemplo não envia nada. */
  anexos: string[];
  /** O tempo em causa e o período onde cairia a falta, fixados quando a pessoa justifica. */
  minutos: number;
  periodoInicio: string;
  periodoFim: string;
  deAtraso: boolean;
  enviadaEm: string;
  estado: EstadoJustificacaoDia;
  decididaPor: string | null;
  decididaEm: string | null;
  motivoRecusa: string | null;
  /** A falta marcada que a aceitação criou (é ela que o cálculo do mês desconta, ou não). */
  faltaId: string | null;
  /** O mês já estava fechado quando o RH decidiu: o desconto só muda se o mês for reaberto. */
  mesFechado: boolean;
}

export type EstadoDoDia =
  | "nao_aplica"
  | "pode_justificar"
  | "prazo_terminado"
  | "enviada"
  | "aceite_paga"
  | "aceite_nao_paga"
  | "recusada_com_prazo"
  | "recusada_sem_prazo";

export interface SituacaoDoDia {
  estado: EstadoDoDia;
  /** A última justificação do dia, se existe. */
  justificacao: JustificacaoDia | null;
  prazoAte: string | null;
  diasRestantes: number;
}

export interface EntradaSituacao {
  data: string;
  hoje: string;
  prazoDias: number;
  /** O dia tem falta sugerida ou atraso acima da tolerância e nenhuma falta marcada. */
  temDesvio: boolean;
  /** As justificações DESTA pessoa; a função escolhe as do dia. */
  justificacoes: readonly JustificacaoDia[];
}

/** O estado do dia que corresponde a cada estado da justificação (para os rótulos de quem só a lê). */
export const ESTADO_DA_JUSTIFICACAO: Record<EstadoJustificacaoDia, EstadoDoDia> = {
  pendente: "enviada",
  aceite_paga: "aceite_paga",
  aceite_nao_paga: "aceite_nao_paga",
  recusada: "recusada_com_prazo",
};

/** O que a pessoa vê num dia: pode justificar, já enviou, foi aceite ou recusada, ou o prazo acabou. */
export function situacaoDoDia(e: EntradaSituacao): SituacaoDoDia {
  const ultima = [...e.justificacoes].reverse().find((j) => j.data === e.data) ?? null;
  const prazoAte = prazoParaJustificar(e.data, e.prazoDias);
  const fora = foraDoPrazoDeJustificar(e.data, e.hoje, e.prazoDias);
  const diasRestantes = fora || e.hoje >= prazoAte ? 0 : diasUteisEntre(e.hoje, prazoAte);
  const com = (estado: EstadoDoDia, justificacao: JustificacaoDia | null): SituacaoDoDia => ({ estado, justificacao, prazoAte, diasRestantes });
  if (ultima) {
    const base = ESTADO_DA_JUSTIFICACAO[ultima.estado];
    return com(base === "recusada_com_prazo" && fora ? "recusada_sem_prazo" : base, ultima);
  }
  if (!e.temDesvio) return { estado: "nao_aplica", justificacao: null, prazoAte: null, diasRestantes: 0 };
  return com(fora ? "prazo_terminado" : "pode_justificar", null);
}

/** A pessoa pode enviar (ou voltar a enviar) a justificação. */
export const podeEnviar = (estado: EstadoDoDia): boolean => estado === "pode_justificar" || estado === "recusada_com_prazo";

export interface DadosEnvio {
  tipo: string;
  motivo: string;
  /** Vazio quando não se indica. */
  horaReal: string;
  anexos: readonly string[];
}

export type CampoEnvio = "tipo" | "motivo" | "horaReal" | "anexos" | "geral";
/** Chaves de tradução, por campo. */
export type ErrosEnvio = Partial<Record<CampoEnvio, string>>;

export interface ContextoEnvio {
  id: string;
  pessoaId: string;
  data: string;
  estado: EstadoDoDia;
  minutos: number;
  periodoInicio: string;
  periodoFim: string;
  deAtraso: boolean;
  agora: string;
}

export function validarEnvio(dados: DadosEnvio, estado: EstadoDoDia): ErrosEnvio {
  const erros: ErrosEnvio = {};
  if (estado === "prazo_terminado" || estado === "recusada_sem_prazo") erros.geral = "rhJust.erro.foraDoPrazo";
  else if (!podeEnviar(estado)) erros.geral = "rhJust.erro.naoPodeJustificar";
  if (!(TIPOS_JUSTIFICACAO_DIA as readonly string[]).includes(dados.tipo)) erros.tipo = "rhJust.erro.tipo";
  if (!motivoValido(dados.motivo)) erros.motivo = "rhJust.erro.motivoCurto";
  if (dados.horaReal.trim() !== "" && minutosDeHora(dados.horaReal) === null) erros.horaReal = "rhJust.erro.horaInvalida";
  if (dados.anexos.length > MAX_ANEXOS_JUSTIFICACAO) erros.anexos = "rhJust.erro.anexosMax";
  return erros;
}

/** Cria a justificação pendente, ou devolve os erros por campo. */
export function criarJustificacaoDia(
  ctx: ContextoEnvio,
  dados: DadosEnvio,
): { ok: true; valor: JustificacaoDia } | { ok: false; erros: ErrosEnvio } {
  const erros = validarEnvio(dados, ctx.estado);
  if (Object.keys(erros).length > 0) return { ok: false, erros };
  return {
    ok: true,
    valor: {
      id: ctx.id,
      origem: "sugestao",
      pessoaId: ctx.pessoaId,
      data: ctx.data,
      tipo: dados.tipo as TipoJustificacaoDia,
      motivo: dados.motivo.trim(),
      horaReal: dados.horaReal.trim() === "" ? null : dados.horaReal.trim(),
      anexos: [...dados.anexos],
      minutos: ctx.minutos,
      periodoInicio: ctx.periodoInicio,
      periodoFim: ctx.periodoFim,
      deAtraso: ctx.deAtraso,
      enviadaEm: ctx.agora,
      estado: "pendente",
      decididaPor: null,
      decididaEm: null,
      motivoRecusa: null,
      faltaId: null,
      mesFechado: false,
    },
  };
}

export interface DadosDecisao {
  motivo: string;
  quem: string;
  agora: string;
  mesFechado: boolean;
}

const ESTADO_DA_DECISAO: Record<DecisaoJustificacaoDia, EstadoJustificacaoDia> = {
  aceitar_paga: "aceite_paga",
  aceitar_nao_paga: "aceite_nao_paga",
  recusar: "recusada",
};

/** O RH decide uma justificação pendente. Recusar exige motivo (mínimo 3 caracteres). */
export function decidirJustificacaoDia(
  j: JustificacaoDia,
  decisao: DecisaoJustificacaoDia,
  d: DadosDecisao,
): Resultado<JustificacaoDia> {
  if (j.estado !== "pendente") return { ok: false, erro: "rhJust.erro.jaDecidida" };
  if (decisao === "recusar" && !motivoValido(d.motivo)) return { ok: false, erro: "rhExemplo.pic.erro.motivoCurto" };
  return {
    ok: true,
    valor: {
      ...j,
      estado: ESTADO_DA_DECISAO[decisao],
      decididaPor: d.quem,
      decididaEm: d.agora,
      motivoRecusa: decisao === "recusar" ? d.motivo.trim() : null,
      mesFechado: d.mesFechado,
    },
  };
}

/** O desconto que cada decisão daria, perguntado à regra das faltas. Recusar não marca falta: nada muda. */
export function descontoDaDecisao(
  j: Pick<JustificacaoDia, "minutos" | "deAtraso">,
  decisao: DecisaoJustificacaoDia,
  valorHora: number,
): DescontoDaFalta | null {
  if (decisao === "recusar") return null;
  const decidida = decidirJustificacaoFalta(
    { estado: "activa", justificacao_estado: "pendente_documento" },
    decisao === "aceitar_paga" ? "justificada_paga" : "justificada_nao_paga",
    "",
  );
  if (decidida.ok === false) return null;
  return descontoDaFalta(
    {
      minutos: j.minutos,
      estado: "activa",
      justificacao_estado: decidida.patch.justificacao_estado,
      remunerada: decidida.patch.remunerada,
      motivo_codigo: j.deAtraso ? "atraso" : "outro",
    },
    valorHora,
  );
}

/** O mês (AAAA-MM) a que o dia pertence. */
export const mesDoDia = (data: string): string => data.slice(0, 7);

/** O texto fica atrás de «Ver texto» quando é dado de saúde. */
export const textoEhSensivel = (j: Pick<JustificacaoDia, "tipo">): boolean => j.tipo === TIPO_SENSIVEL;

/** Há quantos dias foi enviada (0 = hoje). */
export function diasDesdeEnvio(enviadaEm: string, hoje: string): number {
  const dia = (iso: string): number => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Math.max(0, Math.round((dia(hoje) - dia(enviadaEm)) / 86_400_000));
}

/** O motivo encurtado para uma linha de lista. */
export function resumoDoMotivo(motivo: string, maximo = 60): string {
  const limpo = motivo.trim().replace(/\s+/g, " ");
  return limpo.length <= maximo ? limpo : `${limpo.slice(0, maximo - 1).trimEnd()}…`;
}
