/**
 * Fim provável de uma obra e o "e se…" — sem gravar nada.
 *
 * Parte do plano que está na base (datas de cada tarefa) e refaz as datas do
 * que falta com:
 *   · um fator de ritmo (real ÷ previsto): P50 → "fim previsto", P80 →
 *     "provável até". Vem de `rpc_ops_obra_previsao` (o ritmo desta obra ou o
 *     histórico da organização);
 *   · um cenário: adiar o início N dias úteis, +1 pessoa numa especialidade,
 *     uma tarefa que demora +N %.
 *
 * Regras (as mesmas que o motor usa para empurrar dependentes):
 *   · feitas/validadas ficam onde estão;
 *   · em curso continuam a partir de hoje, com o que falta;
 *   · por fazer nunca começam antes do planeado (nem antes de hoje); a
 *     duração em dias úteis escala com o fator e com as pessoas;
 *   · depois das dependências: quem começava no dia seguinte ao fim da outra
 *     continua no dia seguinte ao novo fim; quem começava no próprio dia, no
 *     próprio dia.
 * Os dias úteis vêm da base (com os feriados da organização); fora dessa
 * lista, só se saltam fins de semana.
 */

import { somarDiasUteis, type EstadoTarefaObra } from "./obras";

export interface TarefaPrevisao {
  id: string;
  estado: EstadoTarefaObra;
  inicio: string | null;
  fim: string | null;
  minutosPrevistos: number;
  /** Estimativa depois de atrasos (null = a prevista). */
  minutosEstimativa?: number | null;
  minutosReais: number;
  /** Pessoas previstas na tarefa (≥ 1). */
  pessoas: number;
  skillId?: string | null;
  dependencias: readonly string[];
}

export interface Cenario {
  /** Adiar o início de tudo o que ainda não começou, em dias úteis. */
  adiarDias?: number;
  /** +1 pessoa nas tarefas desta especialidade. */
  maisUmaPessoaEm?: string | null;
  /** Esta tarefa demora mais N %. */
  tarefaMaisLonga?: { id: string; percentagem: number } | null;
}

export interface Calendario {
  /** Dias úteis (AAAA-MM-DD, por ordem, com feriados já tirados). */
  diasUteis: readonly string[];
  hoje: string;
  minutosPorDia: number;
}

export interface DatasSimuladas {
  inicio: string;
  fim: string;
}

export interface ResultadoPrevisao {
  tarefas: Map<string, DatasSimuladas>;
  /** O fim da última tarefa, simulado. */
  fim: string | null;
  /** O fim da última tarefa, no plano atual. */
  fimPlano: string | null;
}

export interface FatoresPrevisao {
  p50: number;
  p80: number;
  fonte: "obra" | "historico" | "sem_dados";
  /** Por especialidade (só com histórico suficiente). Ignorado se o ritmo vier da própria obra. */
  porEspecialidade?: ReadonlyMap<string, { p50: number; p80: number }>;
}

/* ─────────────────────────── Calendário ─────────────────────────── */

function criarCalendario(c: Calendario) {
  const dias = c.diasUteis;
  const indice = new Map<string, number>(dias.map((d, i) => [d, i]));
  const primeiro = dias[0];
  const ultimo = dias[dias.length - 1];
  const dentro = (d: string) => !!primeiro && d >= primeiro && d <= ultimo;

  /** O primeiro dia útil a partir de `d` (inclusive). */
  const util = (d: string): string => {
    if (dentro(d)) {
      if (indice.has(d)) return d;
      // Pesquisa binária pelo primeiro ≥ d.
      let lo = 0;
      let hi = dias.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (dias[mid] < d) lo = mid + 1;
        else hi = mid;
      }
      return dias[lo];
    }
    return somarDiasUteis(d, 0);
  };

  /** n dias úteis depois de `d` (d é levado ao primeiro útil antes). */
  const somar = (d: string, n: number): string => {
    const base = util(d);
    const i = indice.get(base);
    if (i !== undefined && i + n < dias.length && i + n >= 0) return dias[i + n];
    return somarDiasUteis(base, n);
  };

  /** Quantos dias úteis de `de` a `ate`, inclusive (≥ 1 se ate ≥ de). */
  const contar = (de: string, ate: string): number => {
    if (ate < de) return 1;
    const a = util(de);
    let n = 0;
    for (let d = a; d <= ate && n < 2000; d = somar(d, 1)) n++;
    return Math.max(1, n);
  };

  return { util, somar, contar };
}

/* ─────────────────────────── A simulação ─────────────────────────── */

const FEITA: ReadonlySet<EstadoTarefaObra> = new Set(["feita", "validada"]);
const EM_CURSO: ReadonlySet<EstadoTarefaObra> = new Set(["em_curso", "rejeitada"]);

/**
 * Refaz as datas do que falta. `fator(t)` dá o ritmo de cada tarefa (1 = o
 * previsto). Não muda as tarefas recebidas.
 */
export function simularPlano(
  tarefas: readonly TarefaPrevisao[],
  fator: (t: TarefaPrevisao) => number,
  calendario: Calendario,
  cenario: Cenario = {}
): ResultadoPrevisao {
  const cal = criarCalendario(calendario);
  const hoje = cal.util(calendario.hoje);
  const porId = new Map(tarefas.map((t) => [t.id, t]));
  const out = new Map<string, DatasSimuladas>();
  const aCalcular = new Set<string>();
  const adiar = Math.max(0, Math.round(cenario.adiarDias ?? 0));
  const mpd = Math.max(60, calendario.minutosPorDia || 480);

  const diasDoPlano = (t: TarefaPrevisao): number => {
    if (t.inicio && t.fim) return cal.contar(t.inicio, t.fim);
    const base = Math.max(1, t.minutosEstimativa ?? t.minutosPrevistos);
    return Math.max(1, Math.ceil(base / (Math.max(1, t.pessoas) * mpd) - 1e-9));
  };

  const multiplicador = (t: TarefaPrevisao): number => {
    let m = Math.max(0.05, fator(t));
    if (cenario.tarefaMaisLonga && cenario.tarefaMaisLonga.id === t.id) {
      m *= 1 + cenario.tarefaMaisLonga.percentagem / 100;
    }
    if (cenario.maisUmaPessoaEm && t.skillId === cenario.maisUmaPessoaEm) {
      const p = Math.max(1, t.pessoas);
      m *= p / (p + 1);
    }
    return m;
  };

  const calcular = (id: string): DatasSimuladas | null => {
    const feito = out.get(id);
    if (feito) return feito;
    const t = porId.get(id);
    if (!t) return null;
    if (aCalcular.has(id)) return null; // ciclo: ignora a ligação
    aCalcular.add(id);

    let resultado: DatasSimuladas | null;
    if (FEITA.has(t.estado)) {
      resultado = t.inicio && t.fim ? { inicio: t.inicio, fim: t.fim } : null;
    } else {
      const planoDias = diasDoPlano(t);
      const base = Math.max(1, t.minutosEstimativa ?? t.minutosPrevistos);
      let dias: number;
      let minimo: string;
      if (EM_CURSO.has(t.estado)) {
        // O que falta, ao ritmo do fator; nunca menos de 10 % da tarefa.
        const falta = Math.max(base * multiplicador(t) - t.minutosReais, base * 0.1);
        dias = Math.max(1, Math.ceil(planoDias * (falta / base) - 1e-9));
        minimo = hoje;
      } else {
        dias = Math.max(1, Math.ceil(planoDias * multiplicador(t) - 1e-9));
        minimo = hoje;
      }

      // Dependências (fim → início). Com dependências, a tarefa anda com
      // elas — para a frente E para trás — guardando a folga que tinha no
      // plano (dias úteis entre o que as dependências exigiam e o início
      // planeado). Sem dependências, não começa antes do planeado (+ adiar).
      let reqNovo: string | null = null;
      let reqPlano: string | null = null;
      for (const depId of t.dependencias) {
        const dep = porId.get(depId);
        const d = calcular(depId);
        // Uma dependência já feita não puxa nem empurra: a tarefa conta como
        // ponto de partida (planeado + adiar).
        if (!dep || !d || FEITA.has(dep.estado)) continue;
        const mesmoDia = !!(t.inicio && dep.fim && t.inicio <= dep.fim);
        const req = mesmoDia ? cal.util(d.fim) : cal.somar(d.fim, 1);
        if (!reqNovo || req > reqNovo) reqNovo = req;
        if (dep.fim) {
          const rp = mesmoDia ? cal.util(dep.fim) : cal.somar(dep.fim, 1);
          if (!reqPlano || rp > reqPlano) reqPlano = rp;
        }
      }
      if (!EM_CURSO.has(t.estado)) {
        let alvo: string;
        if (reqNovo) {
          const folga = t.inicio && reqPlano && t.inicio > reqPlano ? cal.contar(reqPlano, t.inicio) - 1 : 0;
          alvo = cal.somar(reqNovo, folga);
          // As dependências também podem ter sido adiadas; a folga não as repete.
        } else {
          alvo = t.inicio ? cal.somar(t.inicio, adiar) : hoje;
        }
        if (alvo > minimo) minimo = alvo;
      } else if (reqNovo && reqNovo > minimo) {
        minimo = reqNovo;
      }

      const inicio = cal.util(minimo);
      resultado = { inicio, fim: cal.somar(inicio, dias - 1) };
    }

    aCalcular.delete(id);
    if (resultado) out.set(id, resultado);
    return resultado;
  };

  for (const t of tarefas) calcular(t.id);

  const fins = [...out.values()].map((d) => d.fim).sort();
  const finsPlano = tarefas.map((t) => t.fim).filter((f): f is string => !!f).sort();
  return {
    tarefas: out,
    fim: fins.length ? fins[fins.length - 1] : null,
    fimPlano: finsPlano.length ? finsPlano[finsPlano.length - 1] : null,
  };
}

/** O fator de cada tarefa para um percentil: a especialidade, se houver histórico e a obra não tiver ritmo próprio. */
export function fatorPara(f: FatoresPrevisao, percentil: "p50" | "p80"): (t: TarefaPrevisao) => number {
  return (t) => {
    if (f.fonte !== "obra" && t.skillId && f.porEspecialidade?.has(t.skillId)) {
      return f.porEspecialidade.get(t.skillId)![percentil];
    }
    return f[percentil];
  };
}

/** Diferença em dias úteis entre dois fins (positivo = mais tarde). */
export function diasUteisDeDiferenca(de: string | null, ate: string | null, calendario: Calendario): number {
  if (!de || !ate || de === ate) return 0;
  const cal = criarCalendario(calendario);
  return ate > de ? cal.contar(de, ate) - 1 : -(cal.contar(ate, de) - 1);
}

/** Texto curto do ritmo: "1,3× o previsto", "o previsto". */
export function rotuloRitmo(r: number): string {
  if (Math.abs(r - 1) < 0.005) return "o previsto";
  return `${r.toFixed(2).replace(".", ",").replace(/0$/, "")}× o previsto`;
}
