// Lógica pura da aba "Levantamento" de "Novo negócio": o que o formulário guarda, a validação e a conversão para o
// que o negócio de exemplo leva. Nada aqui lê o relógio: o dia de hoje chega por parâmetro.
import type { EstadoLevantamento, LevantamentoNegocio } from "./negocioMetas";
import { OUTRO, trabalhosPorDivisao } from "./levantamentoExemplo";

/** Uma linha tal como está no formulário: chaves das listas e texto por converter. */
export interface LinhaForm {
  id: string;
  divisao: string;
  trabalho: string;
  trabalhoOutro: string;
  medida: string;
  unidade: string;
  observacoes: string;
}

export interface LevantamentoForm {
  data: string;
  feitoPor: string;
  estado: EstadoLevantamento;
  linhas: LinhaForm[];
  observacoes: string;
}

export type ErroLevantamento = "obrigatorio" | "comprido" | "invalido" | "fora";
export type ErrosLinha = Partial<Record<"divisao" | "trabalho" | "trabalhoOutro" | "medida", ErroLevantamento>>;
export interface ErrosLevantamento {
  /** Os erros de cada linha, pelo id da linha. */
  linhas?: Record<string, ErrosLinha>;
  /** A data própria do levantamento (sem visita): vazia, mal formada ou anterior a 2000 (a base recusaria o levantamento). */
  data?: "invalido";
}

export const MAX_TRABALHO_OUTRO = 60;

/** Os limites da medida na base (numeric(12,3), maior que 0 e menor que 1 000 000): 0,0004 arredonda a 0,000 e a gravação rebentaria. */
export const MEDIDA_MINIMA = 0.001;
export const MEDIDA_MAXIMA = 999_999.999;

export function levantamentoVazio(hoje: string, feitoPor: string): LevantamentoForm {
  return { data: hoje, feitoPor, estado: "porFazer", linhas: [], observacoes: "" };
}

export function novaLinha(id: string): LinhaForm {
  return { id, divisao: "", trabalho: "", trabalhoOutro: "", medida: "", unidade: "m2", observacoes: "" };
}

/** O número escrito (aceita vírgula decimal); NaN quando não é um número. */
export function lerMedida(texto: string): number {
  const limpo = texto.trim().replace(",", ".");
  return limpo === "" ? Number.NaN : Number(limpo);
}

/** Ao mudar a divisão, o trabalho escolhido que já não está nas sugestões é limpo ("Outro" e o texto ficam). */
export function adaptarLinhaADivisao(linha: LinhaForm, divisao: string): LinhaForm {
  const validos = trabalhosPorDivisao(divisao);
  return linha.trabalho === "" || linha.trabalho === OUTRO || validos.includes(linha.trabalho) ? linha : { ...linha, trabalho: "" };
}

/** A medida, arredondada às três casas da base, está dentro dos limites. */
function cabeNaBase(medida: number): boolean {
  const arredondada = Math.round(medida * 1000) / 1000;
  return arredondada >= MEDIDA_MINIMA && arredondada <= MEDIDA_MAXIMA;
}

function validarLinha(l: LinhaForm): ErrosLinha {
  const erros: ErrosLinha = {};
  if (!l.divisao) erros.divisao = "obrigatorio";
  if (!l.trabalho) erros.trabalho = "obrigatorio";
  else if (l.trabalho === OUTRO) {
    const texto = l.trabalhoOutro.trim();
    if (!texto) erros.trabalhoOutro = "obrigatorio";
    else if (texto.length > MAX_TRABALHO_OUTRO) erros.trabalhoOutro = "comprido";
  }
  const medida = lerMedida(l.medida);
  if (l.medida.trim() === "") erros.medida = "obrigatorio";
  else if (!Number.isFinite(medida) || medida <= 0) erros.medida = "invalido";
  else if (!cabeNaBase(medida)) erros.medida = "fora";
  return erros;
}

const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/;
/** A base só aceita levantamentos desde 2000-01-01. */
const PRIMEIRO_DIA = "2000-01-01";

/** Um dia AAAA-MM-DD que existe no calendário e a base aceita. */
export function diaDoLevantamentoValido(dia: string): boolean {
  if (!FORMATO_DIA.test(dia) || dia < PRIMEIRO_DIA) return false;
  const [a, m, d] = dia.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, d));
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d;
}

/**
 * O levantamento é opcional (nem com a visita feita se exigem linhas); se houver linhas, cada uma pede divisão, trabalho (e o texto, se "Outro") e uma
 * medida maior que 0. `comDataPropria`: nenhuma visita o representa, por isso a data é dele e tem de ser um dia que a base aceite.
 */
export function validarLevantamento(l: LevantamentoForm | undefined, comDataPropria = false): ErrosLevantamento {
  if (!l) return {};
  const erros: ErrosLevantamento = {};
  if (comDataPropria && !diaDoLevantamentoValido(l.data)) erros.data = "invalido";
  const porLinha = Object.fromEntries(l.linhas.map((x) => [x.id, validarLinha(x)]).filter(([, e]) => Object.keys(e as object).length > 0));
  if (Object.keys(porLinha).length > 0) erros.linhas = porLinha as Record<string, ErrosLinha>;
  return erros;
}

/** O formulário converte-se em texto: `rotulo(grupo, chave)` devolve o nome visível (ex.: rotulo("room", "cozinha")). */
export function paraLevantamentoNegocio(
  l: LevantamentoForm, rotulo: (grupo: "room" | "work" | "unit", chave: string) => string,
): LevantamentoNegocio {
  return {
    data: l.data,
    feitoPor: l.feitoPor,
    estado: l.estado,
    linhas: l.linhas.map((x) => ({
      divisao: rotulo("room", x.divisao),
      trabalho: x.trabalho === OUTRO ? x.trabalhoOutro.trim() : rotulo("work", x.trabalho),
      medida: lerMedida(x.medida),
      unidade: rotulo("unit", x.unidade),
      observacoes: x.observacoes.trim(),
    })),
    observacoes: l.observacoes.trim(),
  };
}

/** Só se guarda o levantamento se se escreveu alguma coisa: linhas, observações ou o estado Feito. */
export function temLevantamento(l: LevantamentoNegocio | undefined): l is LevantamentoNegocio {
  return !!l && (l.linhas.length > 0 || l.observacoes !== "" || l.estado === "feito");
}
