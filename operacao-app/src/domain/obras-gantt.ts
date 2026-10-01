/**
 * O Gantt da obra ("mapa de atividades"), como dados: que colunas (dias
 * úteis), que linhas (fases e tarefas), onde começa e quanto ocupa cada
 * barra, onde fica a linha de hoje, e quanto do previsto já se gastou.
 *
 * O componente (components/ObraGantt.tsx) só desenha o que sai daqui. Assim
 * a parte difícil — calendário sem fins de semana, fases que abarcam as suas
 * tarefas, barras fora da janela — tem testes sem precisar de um browser.
 */

import {
  diasUteisEntre,
  distanciaUteis,
  ehDiaUtil,
  nivelDeAlerta,
  somarDiasUteis,
  totaisDaFase,
  type EstadoTarefaObra,
  type NivelAlerta,
  type TarefaResumo,
  type TotaisFase,
} from "./obras";

export interface FaseGantt {
  id: string;
  ordem: number;
  nome: string;
}

export interface TarefaGantt {
  id: string;
  faseId: string;
  ordem: number;
  nome: string;
  estado: EstadoTarefaObra;
  minutosPrevistos: number;
  minutosReais: number;
  inicio: string | null;
  fim: string | null;
  pessoas: readonly string[];
  aCorrer: number;
  dependeDe: string | null;
}

export interface Barra {
  /** Coluna (índice em `dias`) onde começa. Pode ser < 0 se começa antes da janela. */
  col: number;
  /** Quantas colunas ocupa (≥ 1). */
  span: number;
}

export type LinhaGantt =
  | { tipo: "fase"; fase: FaseGantt; totais: TotaisFase; barra: Barra | null; recolhida: boolean }
  | {
      tipo: "tarefa";
      tarefa: TarefaGantt;
      barra: Barra | null;
      /** Fração do previsto já gasta (0…∞). */
      gasto: number;
      nivel: NivelAlerta;
      emAtraso: boolean;
    };

export interface Semana {
  col: number;
  span: number;
  rotulo: string;
}

export interface LayoutGantt {
  dias: string[];
  semanas: Semana[];
  /** Coluna de hoje, ou null se hoje não é dia útil ou está fora da janela. */
  colHoje: number | null;
  linhas: LinhaGantt[];
}

/** Coluna de uma data na lista de dias úteis; fim de semana encosta ao útil seguinte. */
export function colunaDe(dias: readonly string[], iso: string): number {
  if (!dias.length) return 0;
  const alvo = ehDiaUtil(iso) ? iso : somarDiasUteis(iso, 0);
  const i = dias.indexOf(alvo);
  if (i >= 0) return i;
  // Fora da janela: conta a distância em dias úteis ao primeiro dia.
  return distanciaUteis(dias[0], alvo);
}

export function barraDe(dias: readonly string[], inicio: string | null, fim: string | null): Barra | null {
  if (!inicio) return null;
  const col = colunaDe(dias, inicio);
  const colFim = colunaDe(dias, fim ?? inicio);
  return { col, span: Math.max(1, colFim - col + 1) };
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function rotuloDia(iso: string): { dia: string; semana: string } {
  const [, m, d] = iso.split("-").map(Number);
  const sem = ["", "seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return { dia: `${d}`, semana: `${sem[dow === 0 ? 7 : dow]} · ${MESES[m - 1]}` };
}

function rotuloSemana(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `Semana de ${d} ${MESES[m - 1]}`;
}

/**
 * Monta o Gantt. A janela vai do primeiro início planeado (ou hoje, se vier
 * antes) ao último fim, com `margem` dias úteis de folga de cada lado, e
 * nunca menos de `minimoDias` colunas — uma obra de dois dias não deve
 * desenhar duas colunas gigantes.
 */
export function montarGantt(args: {
  fases: readonly FaseGantt[];
  tarefas: readonly TarefaGantt[];
  hoje: string;
  recolhidas?: ReadonlySet<string>;
  margem?: number;
  minimoDias?: number;
}): LayoutGantt {
  const { fases, tarefas, hoje, recolhidas = new Set(), margem = 1, minimoDias = 10 } = args;

  const datas = tarefas.flatMap((t) => [t.inicio, t.fim].filter((x): x is string => !!x));
  let ini = datas.length ? datas.reduce((a, b) => (a < b ? a : b)) : hoje;
  let fim = datas.length ? datas.reduce((a, b) => (a > b ? a : b)) : hoje;
  if (hoje < ini) ini = hoje;
  if (hoje > fim && distanciaUteis(fim, hoje) <= 10) fim = hoje;

  ini = somarDiasUteis(ini, -margem);
  fim = somarDiasUteis(fim, margem);
  let dias = diasUteisEntre(ini, fim);
  while (dias.length < minimoDias) {
    fim = somarDiasUteis(fim, 1);
    dias = diasUteisEntre(ini, fim);
  }

  const semanas: Semana[] = [];
  dias.forEach((d, i) => {
    const ultima = semanas[semanas.length - 1];
    // Uma semana nova começa à segunda, ou na primeira coluna.
    const segunda = new Date(`${d}T00:00:00Z`).getUTCDay() === 1;
    if (!ultima || segunda) semanas.push({ col: i, span: 1, rotulo: rotuloSemana(d) });
    else ultima.span++;
  });

  const idxHoje = dias.indexOf(hoje);
  const colHoje = idxHoje >= 0 ? idxHoje : null;

  const linhas: LinhaGantt[] = [];
  const ordenadas = [...fases].sort((a, b) => a.ordem - b.ordem);
  for (const f of ordenadas) {
    const daFase = tarefas
      .filter((t) => t.faseId === f.id)
      .sort((a, b) => a.ordem - b.ordem || (a.inicio ?? "").localeCompare(b.inicio ?? ""));
    const resumo: TarefaResumo[] = daFase.map((t) => ({
      id: t.id,
      faseId: t.faseId,
      estado: t.estado,
      minutosPrevistos: t.minutosPrevistos,
      minutosReais: t.minutosReais,
      inicio: t.inicio,
      fim: t.fim,
    }));
    const totais = totaisDaFase(resumo);
    const recolhida = recolhidas.has(f.id);
    linhas.push({ tipo: "fase", fase: f, totais, barra: barraDe(dias, totais.inicio, totais.fim), recolhida });
    if (recolhida) continue;
    for (const t of daFase) {
      const aberta = t.estado === "por_fazer" || t.estado === "em_curso" || t.estado === "rejeitada";
      linhas.push({
        tipo: "tarefa",
        tarefa: t,
        barra: barraDe(dias, t.inicio, t.fim),
        gasto: t.minutosPrevistos > 0 ? t.minutosReais / t.minutosPrevistos : 0,
        nivel: nivelDeAlerta(t.minutosReais, t.minutosPrevistos),
        emAtraso: aberta && !!t.fim && t.fim < hoje,
      });
    }
  }

  return { dias, semanas, colHoje, linhas };
}

/** Quantos dias úteis um arrasto de `dx` píxeis representa. */
export function deltaDeArrasto(dx: number, larguraDia: number): number {
  if (larguraDia <= 0) return 0;
  const d = Math.round(dx / larguraDia);
  return Object.is(d, -0) ? 0 : d;
}
