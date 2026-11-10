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

const MS_DIA = 86_400_000;

/** Dias desde 1970 de uma data `AAAA-MM-DD` (ou com hora: so os 10 primeiros caracteres contam). */
function diaNumero(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / MS_DIA);
}

/** O vinculo que os subsidios usam: a CADEIA CONTINUA de contratos da pessoa (ver `vinculoContinuoDoPeriodo`). */
export interface VinculoContinuo {
  /** Inicio do PRIMEIRO vinculo da cadeia (`AAAA-MM-DD`). */
  dataInicio: string;
  /** Fim do ULTIMO vinculo da cadeia (inclusivo); `null` = sem fim. */
  dataFim: string | null;
  /** Ha dias sem contrato, dentro do ano do periodo, entre vinculos da pessoa. */
  comIntervalo: boolean;
}

interface Cadeia {
  inicio: string;
  /** Maior `dataFim` da cadeia; `null` = sem fim. */
  fim: string | null;
}

const soData = (iso: string | null): string | null => (iso === null ? null : iso.slice(0, 10));

/**
 * A cadeia continua de vinculos que cobre o mes do FIM do periodo (`ultimoDia`, `AAAA-MM-DD`): contratos renovados sem interrupcao
 * contam como um so. Dois vinculos (por data de inicio) sao contiguos se o seguinte comeca no dia seguinte ao fim do anterior ou antes
 * (sobrepostos); `dataFim` e o ULTIMO dia do contrato. O inicio e o do primeiro da cadeia, o fim o do ultimo.
 *
 * `comIntervalo`: entre vinculos da pessoa ha pelo menos um dia sem contrato dentro do ano civil do periodo, e por isso o subsidio nao
 * se calcula. Intervalos anteriores ao ano apenas fazem a cadeia comecar depois deles. Sem vinculo que cubra o mes: `null`.
 */
export function vinculoContinuoDoPeriodo(vinculos: readonly VinculoLido[] | undefined, ultimoDia: string): VinculoContinuo | null {
  if (!vinculos || vinculos.length === 0) return null;
  const ano = Number(ultimoDia.slice(0, 4));
  const primeiroDoAno = diaNumero(`${ano}-01-01`);
  const ultimoDoAno = diaNumero(`${ano}-12-31`);
  const mes = ultimoDia.slice(0, 7);
  const primeiroDoMes = `${mes}-01`;
  const ultimoDoMes = `${mes}-31`;

  const ordenados = [...vinculos].sort((a, b) => (a.dataInicio < b.dataInicio ? -1 : a.dataInicio > b.dataInicio ? 1 : 0));
  const cadeias: Cadeia[] = [];
  let intervaloNoAno = false;
  for (const v of ordenados) {
    const atual = cadeias[cadeias.length - 1];
    const fimDoAtual = atual ? soData(atual.fim) : null;
    if (atual && (fimDoAtual === null || diaNumero(v.dataInicio) <= diaNumero(fimDoAtual) + 1)) {
      if (fimDoAtual !== null && (v.dataFim === null || diaNumero(v.dataFim) > diaNumero(fimDoAtual))) atual.fim = soData(v.dataFim);
      continue;
    }
    if (fimDoAtual !== null) {
      const deDia = diaNumero(fimDoAtual) + 1;
      const ateDia = diaNumero(v.dataInicio) - 1;
      if (deDia <= ultimoDoAno && ateDia >= primeiroDoAno) intervaloNoAno = true;
    }
    cadeias.push({ inicio: v.dataInicio.slice(0, 10), fim: soData(v.dataFim) });
  }

  let escolhida: Cadeia | null = null;
  for (const c of cadeias) {
    if (c.inicio > ultimoDoMes) continue;
    if (c.fim !== null && c.fim < primeiroDoMes) continue;
    if (!escolhida || c.inicio > escolhida.inicio) escolhida = c;
  }
  if (!escolhida) return null;
  return { dataInicio: escolhida.inicio, dataFim: escolhida.fim, comIntervalo: intervaloNoAno };
}
