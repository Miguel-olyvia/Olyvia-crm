/**
 * As contas puras sobre os vinculos de uma organizacao: agrupar por pessoa e escolher o que cobre um mes. Sem base e sem
 * React, para se poderem usar e testar em qualquer lado.
 */
import type { EstadoVinculo, TipoContrato } from "@/types/hr";

export interface VinculoLido {
  tipoContrato: TipoContrato;
  estado: EstadoVinculo;
  dataInicio: string;
  /** `null` = sem fim. */
  dataFim: string | null;
  /** As horas por semana do contrato; `null` = o contrato nao as fixa. */
  horasSemanais: number | null;
}

export interface LinhaVinculo {
  pessoa_id: string;
  tipo_contrato: TipoContrato;
  estado: EstadoVinculo;
  data_inicio: string;
  data_fim: string | null;
  horas_semanais_equivalentes: number | null;
}

/** Agrupa as linhas da base por pessoa. Puro, para se poder testar sem base. */
export function vinculosPorPessoa(linhas: readonly LinhaVinculo[]): Map<string, VinculoLido[]> {
  const mapa = new Map<string, VinculoLido[]>();
  for (const l of linhas) {
    const lista = mapa.get(l.pessoa_id) ?? [];
    lista.push({
      tipoContrato: l.tipo_contrato,
      estado: l.estado,
      dataInicio: l.data_inicio,
      dataFim: l.data_fim ?? null,
      horasSemanais: l.horas_semanais_equivalentes === null || l.horas_semanais_equivalentes === undefined ? null : Number(l.horas_semanais_equivalentes),
    });
    mapa.set(l.pessoa_id, lista);
  }
  return mapa;
}

/**
 * O vinculo que cobre o mes `AAAA-MM`: comeca ate ao ultimo dia do mes e nao acabou antes do primeiro. Com mais do que
 * um (mudanca a meio do mes), o de inicio mais recente. `null` se nenhum cobre o mes.
 */
export function vinculoDoMes(vinculos: readonly VinculoLido[] | undefined, mes: string): VinculoLido | null {
  if (!vinculos) return null;
  const primeiro = `${mes}-01`;
  const ultimo = `${mes}-31`;
  let escolhido: VinculoLido | null = null;
  for (const v of vinculos) {
    if (v.dataInicio > ultimo) continue;
    if (v.dataFim !== null && v.dataFim < primeiro) continue;
    if (!escolhido || v.dataInicio > escolhido.dataInicio) escolhido = v;
  }
  return escolhido;
}

