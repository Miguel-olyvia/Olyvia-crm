/**
 * Métricas de obra: o default está errado? Quem precisa de formação?
 *
 * As duas perguntas da reunião:
 *   · "se o desvio for consistente em todos, o default está errado" → por
 *     tarefa-modelo, a média do real contra o previsto;
 *   · "se um colaborador é sistematicamente mais lento ou mais rápido, há
 *     uma necessidade de formação ou uma boa prática" → por pessoa, a razão
 *     real/previsto das tarefas em que trabalhou, pesada pelo tempo dela.
 *
 * Só contam tarefas terminadas (feitas ou validadas): uma tarefa a meio diz
 * pouco sobre se o default está certo.
 */

import type { EstadoTarefaObra } from "./obras";

export interface TarefaMetrica {
  id: string;
  modeloTarefaId: string | null;
  nome: string;
  estado: EstadoTarefaObra;
  minutosPrevistos: number;
}

export interface RegistoMetrica {
  tarefaId: string;
  utilizadorId: string;
  minutos: number;
}

/** Abaixo disto não se tira conclusão nenhuma — diz-se "poucos dados". */
export const AMOSTRA_MINIMA = 3;
/** ±20 % de desvio médio consistente: o default merece ser revisto. */
export const DESVIO_SIGNIFICATIVO = 0.2;

export type Veredicto = "poucos_dados" | "default_curto" | "default_longo" | "certo";
export type VeredictoPessoa = "poucos_dados" | "mais_lento" | "mais_rapido" | "na_media";

export interface MetricaModelo {
  chave: string;
  modeloTarefaId: string | null;
  nome: string;
  n: number;
  mediaPrevistos: number;
  mediaReais: number;
  /** real / previsto, sobre as somas. */
  razao: number;
  /** Mediana do real, arredondada a 5 min: o default que os dados sugerem. */
  sugestao: number;
  veredicto: Veredicto;
}

export interface MetricaPessoa {
  utilizadorId: string;
  nTarefas: number;
  minutos: number;
  /** Média de real/previsto das tarefas em que trabalhou, pesada pelo seu tempo. */
  razao: number;
  veredicto: VeredictoPessoa;
}

const terminada = (e: EstadoTarefaObra) => e === "feita" || e === "validada";

function mediana(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function realPorTarefa(registos: readonly RegistoMetrica[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of registos) m.set(r.tarefaId, (m.get(r.tarefaId) ?? 0) + r.minutos);
  return m;
}

export function metricasPorModelo(
  tarefas: readonly TarefaMetrica[],
  registos: readonly RegistoMetrica[]
): MetricaModelo[] {
  const real = realPorTarefa(registos);
  const grupos = new Map<string, { nome: string; modelo: string | null; prev: number[]; reais: number[] }>();

  for (const t of tarefas) {
    if (!terminada(t.estado)) continue;
    const r = real.get(t.id);
    if (r == null || r <= 0) continue;
    // Sem tarefa-modelo (criada à mão), agrupa pelo nome.
    const chave = t.modeloTarefaId ?? `nome:${t.nome.trim().toLowerCase()}`;
    const g = grupos.get(chave) ?? { nome: t.nome, modelo: t.modeloTarefaId, prev: [], reais: [] };
    g.prev.push(t.minutosPrevistos);
    g.reais.push(r);
    grupos.set(chave, g);
  }

  return [...grupos].map(([chave, g]) => {
    const somaP = g.prev.reduce((a, b) => a + b, 0);
    const somaR = g.reais.reduce((a, b) => a + b, 0);
    const razao = somaP > 0 ? somaR / somaP : 0;
    const n = g.prev.length;
    const veredicto: Veredicto =
      n < AMOSTRA_MINIMA
        ? "poucos_dados"
        : razao > 1 + DESVIO_SIGNIFICATIVO
          ? "default_curto"
          : razao < 1 - DESVIO_SIGNIFICATIVO
            ? "default_longo"
            : "certo";
    return {
      chave,
      modeloTarefaId: g.modelo,
      nome: g.nome,
      n,
      mediaPrevistos: Math.round(somaP / n),
      mediaReais: Math.round(somaR / n),
      razao: Math.round(razao * 100) / 100,
      sugestao: Math.max(5, Math.round(mediana(g.reais) / 5) * 5),
      veredicto,
    };
  }).sort((a, b) => Math.abs(b.razao - 1) - Math.abs(a.razao - 1) || a.nome.localeCompare(b.nome));
}

export function metricasPorPessoa(
  tarefas: readonly TarefaMetrica[],
  registos: readonly RegistoMetrica[]
): MetricaPessoa[] {
  const real = realPorTarefa(registos);
  const razaoTarefa = new Map<string, number>();
  for (const t of tarefas) {
    const r = real.get(t.id);
    if (!terminada(t.estado) || r == null || r <= 0 || t.minutosPrevistos <= 0) continue;
    razaoTarefa.set(t.id, r / t.minutosPrevistos);
  }

  const acc = new Map<string, { tarefas: Set<string>; minutos: number; pesado: number }>();
  for (const r of registos) {
    const rz = razaoTarefa.get(r.tarefaId);
    if (rz == null || r.minutos <= 0) continue;
    const a = acc.get(r.utilizadorId) ?? { tarefas: new Set<string>(), minutos: 0, pesado: 0 };
    a.tarefas.add(r.tarefaId);
    a.minutos += r.minutos;
    a.pesado += r.minutos * rz;
    acc.set(r.utilizadorId, a);
  }

  return [...acc].map(([utilizadorId, a]) => {
    const razao = a.minutos > 0 ? a.pesado / a.minutos : 0;
    const n = a.tarefas.size;
    const veredicto: VeredictoPessoa =
      n < AMOSTRA_MINIMA
        ? "poucos_dados"
        : razao > 1 + DESVIO_SIGNIFICATIVO
          ? "mais_lento"
          : razao < 1 - DESVIO_SIGNIFICATIVO
            ? "mais_rapido"
            : "na_media";
    return {
      utilizadorId,
      nTarefas: n,
      minutos: Math.round(a.minutos),
      razao: Math.round(razao * 100) / 100,
      veredicto,
    };
  }).sort((x, y) => y.razao - x.razao);
}

export const ROTULO_VEREDICTO: Record<Veredicto, string> = {
  poucos_dados: "Poucos dados",
  default_curto: "Default curto — rever para cima",
  default_longo: "Default longo — rever para baixo",
  certo: "Default certo",
};

export const ROTULO_VEREDICTO_PESSOA: Record<VeredictoPessoa, string> = {
  poucos_dados: "Poucos dados",
  mais_lento: "Mais lento — formação?",
  mais_rapido: "Mais rápido — boa prática a replicar?",
  na_media: "Na média",
};
