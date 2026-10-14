// "Registar chamada": que próximos passos cabem a cada resultado e como se valida o dia e a hora. Funções puras, sem
// relógio: o dia de hoje (AAAA-MM-DD) chega por parâmetro. Nada aqui importa de outros ficheiros de Pessoas além dos tipos.
import type { MotivoPerda, PapelPessoa, PassoChamada, ResultadoContacto } from "./pessoasTipos";

/** O que decide quais os passos que cabem: um cliente não se perde e uma perdida não leva visita. */
export interface ContextoChamada {
  papel: PapelPessoa;
  perdida: boolean;
}

const PASSOS_DO_RESULTADO: Record<ResultadoContacto, readonly PassoChamada[]> = {
  atendeuInteressado: ["marcarVisita", "ligarAmanha", "ligarHoje", "nenhum"],
  atendeuMaisTarde: ["ligarData", "ligarAmanha"],
  naoAtendeu: ["ligarAmanha", "ligarHoje"],
  semInteresse: ["perder", "nenhum"],
  numeroErrado: ["nenhum", "perder"],
};

/** Os passos que cabem a um resultado, pela ordem em que se mostram (o primeiro é o recomendado). */
export function passosDisponiveis(resultado: ResultadoContacto, ctx: ContextoChamada): PassoChamada[] {
  return PASSOS_DO_RESULTADO[resultado].filter((p) => {
    if (p === "perder") return ctx.papel === "lead" && !ctx.perdida;
    if (p === "marcarVisita") return !ctx.perdida;
    return true;
  });
}

/** O passo escolhido de início: a visita (recomendada) a quem se interessou; senão o primeiro que não perde a pessoa. */
export function passoPorDefeito(resultado: ResultadoContacto, ctx: ContextoChamada): PassoChamada {
  const lista = passosDisponiveis(resultado, ctx);
  return lista.find((p) => p !== "perder") ?? "nenhum";
}

/** É o passo que a base recomenda para este resultado (leva a marca "Recomendado"). */
export const ehRecomendado = (resultado: ResultadoContacto, passo: PassoChamada): boolean =>
  resultado === "atendeuInteressado" && passo === "marcarVisita";

/** Estes passos pedem um dia e uma hora. */
export const exigeDiaHora = (passo: PassoChamada): boolean => passo === "marcarVisita" || passo === "ligarData";

export type ErroData = "dataVazia" | "dataPassada";
export type ErroHora = "horaVazia" | "horaInvalida";

export interface ErrosChamada {
  data: ErroData | null;
  hora: ErroHora | null;
  motivo: "motivoVazio" | null;
}

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** O erro do dia (obrigatório, não pode ser anterior a hoje) e o da hora (obrigatória, HH:MM). */
export function errosDiaHora(data: string, hora: string, hoje: string): Pick<ErrosChamada, "data" | "hora"> {
  const erroData: ErroData | null = !FORMATO_DATA.test(data) ? "dataVazia" : data < hoje ? "dataPassada" : null;
  const erroHora: ErroHora | null = hora === "" ? "horaVazia" : !FORMATO_HORA.test(hora) ? "horaInvalida" : null;
  return { data: erroData, hora: erroHora };
}

export interface EntradaErros {
  passo: PassoChamada;
  data: string;
  hora: string;
  motivo: MotivoPerda | "";
}

/** Só valida o que o passo escolhido pede: dia e hora para a visita e o "ligar numa data", o motivo para perder. */
export function errosChamada(e: EntradaErros, hoje: string): ErrosChamada {
  const diaHora = exigeDiaHora(e.passo) ? errosDiaHora(e.data, e.hora, hoje) : { data: null, hora: null };
  return { ...diaHora, motivo: e.passo === "perder" && e.motivo === "" ? "motivoVazio" : null };
}

export const temErros = (e: ErrosChamada): boolean => e.data !== null || e.hora !== null || e.motivo !== null;

/** "16/10 · 09:30" (ou só "16/10" sem hora), a partir de AAAA-MM-DD e HH:MM. */
export const textoAgenda = (dia: string, hora: string): string =>
  [`${dia.slice(8, 10)}/${dia.slice(5, 7)}`, hora].filter(Boolean).join(" · ");
