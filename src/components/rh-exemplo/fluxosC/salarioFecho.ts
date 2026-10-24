/**
 * Fechar e reabrir o mês (fluxo 10). Funções PURAS.
 * Fechar guarda uma cópia fiel e imutável de cada linha (o recibo): quem fechou, quando, e os totais.
 * Os dados posteriores (horas extra, retribuições, pontuais) já não mexem no que ficou guardado.
 * Reabrir só com a autorização especial (simulada), um motivo de pelo menos 3 caracteres, e fica registado.
 */
import type { EntradaSalario, ResultadoSalario } from "./salarioRegras";

export const MOTIVO_REABRIR_MINIMO = 3;

export interface ReciboCongelado {
  pessoaId: string;
  pessoaNome: string;
  /** Os dados de que o cálculo partiu, também congelados: o recibo explica-se sozinho. */
  entrada: EntradaSalario;
  resultado: ResultadoSalario;
}

export interface FechoMes {
  mes: string;
  fechadoPor: string;
  fechadoEm: string;
  recibos: Readonly<Record<string, ReciboCongelado>>;
  totalBruto: number;
}

export interface Reabertura {
  mes: string;
  reabertoPor: string;
  reabertoEm: string;
  motivo: string;
}

function congelar<T>(valor: T): T {
  if (valor && typeof valor === "object") {
    Object.values(valor as Record<string, unknown>).forEach(congelar);
    Object.freeze(valor);
  }
  return valor;
}

/** Cópia profunda e congelada: alterar o original depois não mexe no recibo. */
export function fecharMes(
  mes: string,
  quem: string,
  quando: string,
  recibos: readonly ReciboCongelado[],
): FechoMes {
  const copia = structuredClone(recibos);
  const porPessoa: Record<string, ReciboCongelado> = {};
  for (const r of copia) porPessoa[r.pessoaId] = r;
  const totalBruto = copia.reduce((s, r) => s + (r.resultado.totalBruto ?? 0), 0);
  return congelar({ mes, fechadoPor: quem, fechadoEm: quando, recibos: porPessoa, totalBruto: Math.round(totalBruto * 100) / 100 });
}

export type ErroReabrir = "sem_autorizacao" | "motivo_obrigatorio";
export type ResultadoReabrir = { ok: true; registo: Reabertura } | { ok: false; erro: ErroReabrir };

export function reabrirMes(
  fecho: FechoMes,
  quem: string,
  quando: string,
  motivo: string,
  temAutorizacaoEspecial: boolean,
): ResultadoReabrir {
  if (!temAutorizacaoEspecial) return { ok: false, erro: "sem_autorizacao" };
  if (motivo.trim().length < MOTIVO_REABRIR_MINIMO) return { ok: false, erro: "motivo_obrigatorio" };
  return { ok: true, registo: { mes: fecho.mes, reabertoPor: quem, reabertoEm: quando, motivo: motivo.trim() } };
}
