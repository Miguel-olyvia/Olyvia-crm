/**
 * Banco de horas (fluxo 4, parte do saldo): funções PURAS.
 * - o crédito entra logo no saldo; cada crédito vale 12 meses;
 * - os débitos (gozo em folga, horas em falta, ajuste) gastam primeiro os créditos mais antigos;
 * - nada caduca sem aviso: 30 dias antes de expirar aparece um aviso ao RH;
 * - limites por organização: saldo máximo positivo e saldo negativo até um mínimo.
 * Minutos inteiros com sinal. O valor em euros usa o valor da hora que o chamador der.
 */

export type TipoMovimentoBanco = "credito" | "debito";
export type OrigemMovimentoBanco = "automatico" | "manual";

export interface MovimentoBanco {
  id: string;
  pessoaId: string;
  /** AAAA-MM-DD */
  data: string;
  /** Positivo = crédito, negativo = débito. */
  minutos: number;
  motivo: string;
  origem: OrigemMovimentoBanco;
}

export interface LimitesBanco {
  /** Saldo máximo a favor da pessoa. */
  maxPositivoMin: number;
  /** Quanto o saldo pode ficar negativo (valor positivo: 600 = até −10 h). */
  maxNegativoMin: number;
}

export const LIMITES_BANCO_OMISSAO: LimitesBanco = { maxPositivoMin: 80 * 60, maxNegativoMin: 20 * 60 };
export const VALIDADE_CREDITO_MESES = 12;
export const AVISO_EXPIRAR_DIAS = 30;
export const MOTIVO_BANCO_MINIMO = 3;

const MS_DIA = 24 * 60 * 60 * 1000;

/** Soma meses a uma data ISO, encostando ao último dia do mês (31/01 + 1 mês = 28/02). */
export function somarMeses(dataIso: string, meses: number): string {
  const [a, m, d] = dataIso.split("-").map(Number);
  const total = a * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

export function diasEntre(deIso: string, ateIso: string): number {
  return Math.round((Date.parse(`${ateIso}T00:00:00Z`) - Date.parse(`${deIso}T00:00:00Z`)) / MS_DIA);
}

export function saldoDoBanco(movs: readonly MovimentoBanco[], pessoaId: string): number {
  return movs.filter((m) => m.pessoaId === pessoaId).reduce((s, m) => s + m.minutos, 0);
}

/** Minutos -> euros ao valor da hora; `null` quando a pessoa não tem valor da hora. */
export function valorEmEuros(minutos: number, valorHora: number | null): number | null {
  return valorHora === null ? null : Math.round((minutos / 60) * valorHora * 100) / 100;
}

export type EstadoCredito = "valido" | "a_expirar" | "expirado";

export interface CreditoComRestante {
  movimentoId: string;
  data: string;
  validoAte: string;
  restanteMin: number;
  estado: EstadoCredito;
  diasParaExpirar: number;
}

/** Créditos de uma pessoa com o que ainda resta de cada um (débitos gastam primeiro os mais antigos). */
export function creditosComRestante(movs: readonly MovimentoBanco[], pessoaId: string, hoje: string): CreditoComRestante[] {
  const dela = movs.filter((m) => m.pessoaId === pessoaId).sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
  const creditos = dela
    .filter((m) => m.minutos > 0)
    .map((m) => ({ movimentoId: m.id, data: m.data, validoAte: somarMeses(m.data, VALIDADE_CREDITO_MESES), restanteMin: m.minutos }));
  let porGastar = dela.filter((m) => m.minutos < 0).reduce((s, m) => s + -m.minutos, 0);
  for (const c of creditos) {
    const gasta = Math.min(c.restanteMin, porGastar);
    c.restanteMin -= gasta;
    porGastar -= gasta;
  }
  return creditos
    .filter((c) => c.restanteMin > 0)
    .map((c) => {
      const dias = diasEntre(hoje, c.validoAte);
      const estado: EstadoCredito = dias < 0 ? "expirado" : dias <= AVISO_EXPIRAR_DIAS ? "a_expirar" : "valido";
      return { ...c, estado, diasParaExpirar: dias };
    });
}

export type ErroBanco = "motivo_obrigatorio" | "minutos_invalidos" | "acima_maximo" | "abaixo_minimo";
export type ResultadoMovimento = { ok: true; novoSaldoMin: number } | { ok: false; erro: ErroBanco };

/** Valida um crédito/débito manual contra o motivo e os limites; não escreve nada. */
export function validarMovimento(saldoAtualMin: number, deltaMin: number, motivo: string, l: LimitesBanco): ResultadoMovimento {
  if (!Number.isInteger(deltaMin) || deltaMin === 0) return { ok: false, erro: "minutos_invalidos" };
  if (motivo.trim().length < MOTIVO_BANCO_MINIMO) return { ok: false, erro: "motivo_obrigatorio" };
  const novo = saldoAtualMin + deltaMin;
  if (novo > l.maxPositivoMin) return { ok: false, erro: "acima_maximo" };
  if (novo < -l.maxNegativoMin) return { ok: false, erro: "abaixo_minimo" };
  return { ok: true, novoSaldoMin: novo };
}

/** Legenda curta: 90 -> «+1 h 30», −480 -> «−8 h», 0 -> «0 h». */
export function formatarMinutos(minutos: number): string {
  const sinal = minutos < 0 ? "−" : minutos > 0 ? "+" : "";
  const abs = Math.abs(minutos);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (m === 0) return `${sinal}${h} h`;
  return h === 0 ? `${sinal}${m} min` : `${sinal}${h} h ${String(m).padStart(2, "0")}`;
}
