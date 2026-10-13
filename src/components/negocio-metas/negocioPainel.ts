// Lógica pura do painel de um negócio: que separadores tem, em que estado está a validade de uma proposta e
// como se escreve uma data. Nada aqui lê dados nem o relógio: o dia de hoje (AAAA-MM-DD) chega por parâmetro.
import type { NegocioMes } from "./negocioMetas";
import { diasParaPrazo } from "./saudeNegocio";

export type AbaPainel = "resumo" | "pessoa" | "orcamentos" | "proposta" | "contrato";

export interface AbaDoPainel {
  id: AbaPainel;
  /** O número a mostrar na aba (só nos Orçamentos). */
  contador?: number;
}

/** Resumo, Pessoa e Orçamentos há sempre; Proposta e Contrato só se o negócio os tem. */
export function abasDoNegocio(negocio: NegocioMes): AbaDoPainel[] {
  return [
    { id: "resumo" },
    { id: "pessoa" },
    { id: "orcamentos", contador: negocio.orcamentos.length },
    ...(negocio.proposta ? [{ id: "proposta" as const }] : []),
    ...(negocio.contrato ? [{ id: "contrato" as const }] : []),
  ];
}

/** O valor é um separador que este negócio tem (Proposta e Contrato só existem se o negócio os tem). */
export function ehAba(valor: string, negocio: NegocioMes): valor is AbaPainel {
  return abasDoNegocio(negocio).some((a) => a.id === valor);
}

export type EstadoValidade = { tipo: "valida"; ate: string } | { tipo: "expirada"; dias: number };

/** "Válida até X" (inclusive o próprio dia) ou "expirada há N dias". */
export function estadoValidade(validaAte: string, hoje: string): EstadoValidade {
  const dias = diasParaPrazo(validaAte, hoje) ?? 0;
  return dias >= 0 ? { tipo: "valida", ate: validaAte } : { tipo: "expirada", dias: -dias };
}

/** "2026-10-13" passa a "13/10/2026"; um texto que não seja uma data fica como está. */
export function formatarData(dia: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dia;
}
