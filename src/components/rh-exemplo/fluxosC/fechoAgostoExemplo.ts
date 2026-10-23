/**
 * Agosto de 2026 ja foi processado: o fecho guardado (recibos imutaveis) serve de historico na apresentacao.
 * Setembro fica por fechar e Outubro por abrir. Os recibos saem do mesmo calculo que o ecra usa, a partir dos
 * dados de Agosto, por isso explicam-se a si proprios em «Como chegámos a este valor».
 */
import { lerEstado } from "@/components/rh-exemplo/dados/loja";
import type { EstadoFluxosC } from "./dadosFluxosC";
import { calcularMes, fichasDoCalculo } from "./salarioEntrada";
import { fecharMes, type FechoMes } from "./salarioFecho";

export const MES_FECHADO_EXEMPLO = "2026-08";

export function fechoDeAgostoDeExemplo(c: EstadoFluxosC): FechoMes {
  const estado = lerEstado();
  const linhas = calcularMes(fichasDoCalculo(estado.fichas, estado.ordem, 2026, 8), c, 2026, 8);
  return fecharMes(MES_FECHADO_EXEMPLO, "Sofia Rebelo", "2026-09-03T10:00:00.000Z", linhas);
}

// Um fecho e imutavel e os dados de Agosto nao mudam: calcula-se uma vez e reaproveita-se quando o estado se repoe.
let guardado: FechoMes | null = null;

/** O estado inicial dos fluxos C com Agosto ja fechado. */
export function comFechoDeAgosto(c: EstadoFluxosC): EstadoFluxosC {
  guardado ??= fechoDeAgostoDeExemplo(c);
  return { ...c, fechos: { ...c.fechos, [MES_FECHADO_EXEMPLO]: guardado } };
}
