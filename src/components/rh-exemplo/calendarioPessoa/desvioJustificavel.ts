/**
 * O que um dia do calendário deixa justificar: uma FALTA SUGERIDA ou um ATRASO acima da tolerância, sem nenhuma falta
 * marcada (a falta que o RH já marcou justifica-se pelo módulo de faltas). Devolve também o tempo em causa e o período
 * onde cairia a falta, para a aceitação a poder criar sem voltar a ler o dia. Função pura.
 */
import { minutosDeHora } from "@/components/rh-exemplo/lib/horarioTipos";
import type { DiaCalendario } from "./montarMes";
import { periodosDoPrevisto } from "./previsto";

export interface DesvioJustificavel {
  minutos: number;
  /** O dia tem atraso acima da tolerância (a falta nasce como falta de «atraso»). */
  deAtraso: boolean;
  periodoInicio: string;
  periodoFim: string;
}

const hhmm = (minutos: number): string => {
  const limitado = Math.min(23 * 60 + 59, Math.max(0, minutos));
  return `${String(Math.floor(limitado / 60)).padStart(2, "0")}:${String(limitado % 60).padStart(2, "0")}`;
};

export function desvioJustificavel(dia: DiaCalendario): DesvioJustificavel | null {
  if (dia.faltas.length > 0) return null;
  const sugerida = dia.chips.find((c) => c.tipo === "falta_sugerida");
  const atraso = dia.chips.find((c) => c.tipo === "atraso");
  const base = sugerida ?? atraso;
  if (!base) return null;
  const inicioPrevisto = periodosDoPrevisto(dia.previsto)[0]?.ini ?? 9 * 60;
  const ultimoFeito = dia.feitos[dia.feitos.length - 1];
  const inicio = atraso || !ultimoFeito ? inicioPrevisto : (minutosDeHora(ultimoFeito.fim) ?? inicioPrevisto);
  return { minutos: base.minutos, deAtraso: Boolean(atraso), periodoInicio: hhmm(inicio), periodoFim: hhmm(inicio + base.minutos) };
}
