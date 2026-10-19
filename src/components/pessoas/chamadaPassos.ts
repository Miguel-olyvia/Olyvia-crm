// "Registar chamada": que próximos passos cabem a cada resultado e como se valida o dia e a hora. Funções puras, sem
// relógio: o dia de hoje (AAAA-MM-DD) chega por parâmetro. No fim, os registos que a chamada deixa na pessoa (contacto e visita).
import type { ContactoPessoa, VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import type { DadosChamada } from "./acoesPessoa";
import { destinoInicial, moradaDaLead, resolverDestino, textoMoradaVisita } from "./moradaVisita";
import type { MotivoEncerramento, PapelPessoa, PassoChamada, Pessoa, ResultadoContacto } from "./pessoasTipos";
import { visitaNova, type VisitaPorRegistar } from "./visitaDaPessoa";

/**
 * O que decide quais os passos que cabem: um cliente não encerra a abordagem, e uma pessoa com a abordagem encerrada (ou perdida) não leva
 * visita nem se volta a encerrar. Com um negócio aberto também não há abordagem a encerrar.
 */
export interface ContextoChamada {
  papel: PapelPessoa;
  /** A pessoa está perdida, ou com a abordagem encerrada. */
  perdida: boolean;
  comNegocioAberto?: boolean;
  /** Marcar visita ainda não existe nesta versão (a ficha real): o passo «Marcar visita» não se oferece. */
  semVisita?: boolean;
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
    if (p === "perder") return ctx.papel === "lead" && !ctx.perdida && !ctx.comNegocioAberto;
    if (p === "marcarVisita") return !ctx.perdida && !ctx.semVisita;
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
  /** Falta o motivo, ou o texto do motivo «outro». */
  motivo: "motivoVazio" | "outroVazio" | null;
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
  motivo: MotivoEncerramento | "";
  /** O texto do motivo «outro». */
  motivoOutro?: string;
}

/** O erro do motivo ao encerrar: falta escolher um, ou o «outro» está sem texto. */
function erroDoMotivo(e: EntradaErros): ErrosChamada["motivo"] {
  if (e.passo !== "perder") return null;
  if (e.motivo === "") return "motivoVazio";
  return e.motivo === "outro" && (e.motivoOutro ?? "").trim() === "" ? "outroVazio" : null;
}

/** Só valida o que o passo escolhido pede: dia e hora para a visita e o "ligar numa data", o motivo para encerrar a abordagem. */
export function errosChamada(e: EntradaErros, hoje: string): ErrosChamada {
  const diaHora = exigeDiaHora(e.passo) ? errosDiaHora(e.data, e.hora, hoje) : { data: null, hora: null };
  return { ...diaHora, motivo: erroDoMotivo(e) };
}

export const temErros = (e: ErrosChamada): boolean => e.data !== null || e.hora !== null || e.motivo !== null;

/** "16/10 · 09:30" (ou só "16/10" sem hora), a partir de AAAA-MM-DD e HH:MM. */
export const textoAgenda = (dia: string, hora: string): string =>
  [`${dia.slice(8, 10)}/${dia.slice(5, 7)}`, hora].filter(Boolean).join(" · ");

/** O contacto da chamada: o dia de hoje, o resultado e a nota aparada. O formulário que a pessoa preencheu não conta como contacto. */
export const contactoDaChamada = (
  pessoaId: string, d: Pick<DadosChamada, "resultado" | "nota" | "hoje">,
): Omit<ContactoPessoa, "id" | "negocioId"> => ({ pessoaId, data: d.hoje, resultado: d.resultado, nota: d.nota.trim() });

/** O texto da atividade da visita marcada na chamada: "16/10 · 09:30 · Rua A 1, 1000-001 Lisboa". */
export function detalheDaVisitaDaChamada(pessoa: Pick<Pessoa, "morada">, d: Pick<DadosChamada, "data" | "hora" | "destinoVisita">): string {
  const lead = moradaDaLead(pessoa);
  const lugar = textoMoradaVisita(resolverDestino(d.destinoVisita ?? destinoInicial(lead), lead).moradaVisita);
  return [textoAgenda(d.data ?? "", d.hora ?? ""), lugar].filter(Boolean).join(" · ");
}

/** A visita que a chamada marca (só no passo `marcarVisita`), ou `null`: outro passo, ou dados que não servem. */
export function visitaDaChamada(
  pessoa: Pick<Pessoa, "id" | "morada" | "comercial">, d: DadosChamada, existentes: readonly Pick<VisitaPessoa, "estado">[],
): VisitaPorRegistar | null {
  if (d.passo !== "marcarVisita") return null;
  const r = visitaNova(
    pessoa, { data: d.data ?? "", hora: d.hora ?? "", nota: "", destino: d.destinoVisita, detalhe: detalheDaVisitaDaChamada(pessoa, d) },
    existentes, d.hoje,
  );
  return r && { ...r, visita: { ...r.visita, pessoaId: pessoa.id } };
}
