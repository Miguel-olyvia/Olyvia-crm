/**
 * Previsão: "e se estes orçamentos fossem todos aprovados?"
 *
 * Os dados vêm de db/previsao.sql (o cruzamento linha × modelo é o MESMO
 * motor que cria as obras). Aqui fazem-se as contas, puras e testáveis:
 *
 *   · por orçamento: horas de trabalho, duração (dias úteis), pessoas por
 *     especialidade, custo de mão de obra pelas tarifas, margem;
 *   · capacidade: quanto a equipa dá por dia em cada especialidade, quantas
 *     obras destas cabem em simultâneo, e qual é o gargalo;
 *   · a fila: se entrassem por esta ordem, quando começava e acabava cada uma,
 *     e a ocupação de cada especialidade por semana ou mês.
 *
 * Convenções (as do motor das obras):
 *   · `minutos` de um passo é pessoa × minuto; o passo dura minutos ÷ pessoas;
 *   · as fases seguem-se (1 → 9); dentro de uma fase, especialidades
 *     diferentes trabalham em paralelo e a mesma especialidade em série;
 *   · uma espera (cura, fabrico) em horas corridas conta ceil(h ÷ 24) dias.
 *   · quem tem várias especialidades conta uma parte igual em cada (não se
 *     conta a mesma hora duas vezes); passos sem especialidade contam contra
 *     a equipa toda.
 */

/* ──────────────────────────────── Dados ──────────────────────────────── */

export interface OrcamentoPrevisao {
  id: string;
  numero: string;
  titulo: string;
  estado: string;
  cliente_id: string | null;
  data: string | null;
  aceite_em: string | null;
  comercial_id: string | null;
  comercial_nome: string | null;
  total: number | null;
  valor_sem_iva: number | null;
  /** Nulo para quem não vê custos. */
  custo_material: number | null;
  mao_obra_orcada: number | null;
  linhas: number;
  contrato_id: string | null;
  contrato_numero: string | null;
  contrato_estado: string | null;
  contratado: boolean;
}

export interface PessoaPrevisao {
  utilizador_id: string;
  nome: string;
  funcao: string;
  horas_dia: number;
  /** Nulo para quem não vê custos. */
  custo_hora: number | null;
  skills: string[];
}

export interface PrevisaoBase {
  hoje: string;
  ve_custos: boolean;
  custo_hora_medio: number | null;
  orcamentos: OrcamentoPrevisao[];
  equipa: PessoaPrevisao[];
  skills: { id: string; nome: string }[];
  dias_uteis: string[];
  carga_atual: { skill_id: string | null; dia: string; minutos: number }[];
}

export interface PassoPrevisao {
  fase: number;
  nome: string;
  minutos: number;
  pessoas: number;
  skill_id: string | null;
  espera_antes_horas: number;
  origem: string | null;
}

/** Como uma linha do orçamento cruzou com os modelos das obras. */
export type Cruzamento = "modelo" | "ficha" | "sem_ficha" | "nao_planeia" | "sem_servico";

export interface LinhaPrevisao {
  id: string;
  ordem: number;
  descricao: string;
  qt: number;
  unidade: string | null;
  servico_id: string | null;
  servico_nome: string | null;
  cruzamento: Cruzamento;
  passos: PassoPrevisao[];
}

export interface ExpansaoOrcamento {
  id: string;
  linhas: LinhaPrevisao[];
}

export const CRUZAMENTO: Record<Cruzamento, { rotulo: string; ajuda: string; falha: boolean }> = {
  modelo: { rotulo: "com modelo", ajuda: "O serviço tem modelo de tarefas: passos, tempos e especialidades.", falha: false },
  ficha: {
    rotulo: "sem modelo · ficha técnica",
    ajuda: "Sem modelo: uma tarefa só, com o tempo da ficha técnica e sem especialidade. Cria o modelo em Modelos.",
    falha: true,
  },
  sem_ficha: {
    rotulo: "sem modelo nem ficha",
    ajuda: "Sem modelo nem horas na ficha técnica: contou 60 min por defeito. Cria o modelo em Modelos.",
    falha: true,
  },
  nao_planeia: { rotulo: "não é trabalho no local", ajuda: "Deslocação, projeto ou linha que só dá medidas.", falha: false },
  sem_servico: { rotulo: "produto / linha livre", ajuda: "Não é um serviço: entra no material, não no trabalho.", falha: false },
};

/** Chave da especialidade; os passos sem especialidade vão para GERAL. */
export const GERAL = "__geral__";
const chave = (skill: string | null | undefined) => skill ?? GERAL;

export const MINUTOS_DIA_PADRAO = 480;

/* ───────────────────────────── Por orçamento ─────────────────────────── */

export interface Tarifas {
  /** custo/hora médio por especialidade (das pessoas que a têm). */
  porSkill: Map<string, number>;
  media: number | null;
}

export function calcularTarifas(equipa: PessoaPrevisao[], media: number | null): Tarifas {
  const soma = new Map<string, { s: number; n: number }>();
  for (const p of equipa) {
    if (p.custo_hora == null) continue;
    for (const k of p.skills.length ? p.skills : [GERAL]) {
      const a = soma.get(k) ?? { s: 0, n: 0 };
      a.s += Number(p.custo_hora);
      a.n += 1;
      soma.set(k, a);
    }
  }
  return { porSkill: new Map([...soma].map(([k, v]) => [k, v.s / v.n])), media };
}

export interface CargaSkill {
  minutos: number;
  /** A maior equipa que um passo desta especialidade pede ao mesmo tempo. */
  pessoas: number;
}

export interface AnaliseOrcamento {
  orcamento: OrcamentoPrevisao;
  expandido: boolean;
  minutos: number;
  /** Dias úteis de calendário, com as esperas. 0 = sem trabalho no local. */
  dias: number;
  porSkill: Map<string, CargaSkill>;
  custoMaoObra: number | null;
  margem: number | null;
  margemPercent: number | null;
  linhasFalhadas: number;
  linhasSemFicha: number;
}

export function analisarOrcamento(
  o: OrcamentoPrevisao,
  exp: ExpansaoOrcamento | undefined,
  tarifas: Tarifas,
  minutosDia = MINUTOS_DIA_PADRAO
): AnaliseOrcamento {
  const passos = exp ? exp.linhas.flatMap((l) => l.passos) : [];
  const porSkill = new Map<string, CargaSkill>();
  for (const p of passos) {
    const k = chave(p.skill_id);
    const a = porSkill.get(k) ?? { minutos: 0, pessoas: 0 };
    a.minutos += p.minutos;
    a.pessoas = Math.max(a.pessoas, p.pessoas);
    porSkill.set(k, a);
  }
  const minutos = passos.reduce((s, p) => s + p.minutos, 0);

  // Duração: fases em série; numa fase, especialidades em paralelo.
  const fases = new Map<number, { porSkill: Map<string, number>; espera: number }>();
  for (const p of passos) {
    const f = fases.get(p.fase) ?? { porSkill: new Map(), espera: 0 };
    const k = chave(p.skill_id);
    f.porSkill.set(k, (f.porSkill.get(k) ?? 0) + p.minutos / Math.max(1, p.pessoas));
    f.espera = Math.max(f.espera, Number(p.espera_antes_horas) || 0);
    fases.set(p.fase, f);
  }
  let minutosCalendario = 0;
  let diasEspera = 0;
  for (const f of fases.values()) {
    minutosCalendario += Math.max(0, ...f.porSkill.values());
    diasEspera += Math.ceil(f.espera / 24);
  }
  const dias = passos.length ? Math.max(1, Math.ceil(minutosCalendario / minutosDia)) + diasEspera : 0;

  let custoMaoObra: number | null = null;
  if (tarifas.media != null || tarifas.porSkill.size) {
    custoMaoObra = 0;
    for (const [k, c] of porSkill) {
      const t = tarifas.porSkill.get(k) ?? tarifas.media ?? 0;
      custoMaoObra += (c.minutos / 60) * t;
    }
    custoMaoObra = Math.round(custoMaoObra * 100) / 100;
  }
  const valor = o.valor_sem_iva == null ? null : Number(o.valor_sem_iva);
  const margem =
    valor == null || custoMaoObra == null || o.custo_material == null
      ? null
      : Math.round((valor - Number(o.custo_material) - custoMaoObra) * 100) / 100;

  const linhas = exp?.linhas ?? [];
  return {
    orcamento: o,
    expandido: !!exp,
    minutos,
    dias,
    porSkill,
    custoMaoObra,
    margem,
    margemPercent: margem != null && valor ? Math.round((margem / valor) * 1000) / 10 : null,
    linhasFalhadas: linhas.filter((l) => CRUZAMENTO[l.cruzamento].falha).length,
    linhasSemFicha: linhas.filter((l) => l.cruzamento === "sem_ficha").length,
  };
}

/* ────────────────────────────── Capacidade ───────────────────────────── */

export interface CapacidadeSkill {
  /** minutos por dia útil que a equipa dá a esta especialidade */
  minutosDia: number;
  /** pessoas que a têm (para GERAL: a equipa toda) */
  pessoas: number;
}

/** Quanto a equipa dá por dia em cada especialidade (e a equipa toda em GERAL). */
export function capacidadeDaEquipa(equipa: PessoaPrevisao[]): Map<string, CapacidadeSkill> {
  const cap = new Map<string, CapacidadeSkill>();
  let total = 0;
  for (const p of equipa) {
    const m = (Number(p.horas_dia) || 8) * 60;
    total += m;
    for (const k of p.skills) {
      const a = cap.get(k) ?? { minutosDia: 0, pessoas: 0 };
      a.minutosDia += m / p.skills.length;
      a.pessoas += 1;
      cap.set(k, a);
    }
  }
  cap.set(GERAL, { minutosDia: total, pessoas: equipa.length });
  return cap;
}

export interface Simultaneo {
  /** Quantas obras "médias" deste cenário a equipa corre ao mesmo tempo. */
  obras: number;
  /** A especialidade que limita (null se não há trabalho). */
  gargalo: string | null;
  porSkill: {
    skill: string;
    necessidadeDia: number;
    pessoasPorObra: number;
    minutosDia: number;
    pessoas: number;
    obras: number;
  }[];
}

/**
 * Para uma obra "média" deste cenário: de quanto precisa por dia em cada
 * especialidade, e quantas cabem ao mesmo tempo — pelo tempo (minutos/dia) e
 * pelas pessoas (uma obra que pede 2 ladrilhadores ao mesmo tempo não corre
 * com 1). Fica o menor dos dois; o gargalo é a especialidade que dá menos.
 */
export function obrasEmSimultaneo(
  analises: AnaliseOrcamento[],
  cap: Map<string, CapacidadeSkill>
): Simultaneo {
  const com = analises.filter((a) => a.dias > 0);
  if (!com.length) return { obras: 0, gargalo: null, porSkill: [] };
  const nec = new Map<string, { dia: number; pessoas: number }>();
  for (const a of com) {
    for (const [k, c] of a.porSkill) {
      const x = nec.get(k) ?? { dia: 0, pessoas: 0 };
      x.dia += c.minutos / a.dias / com.length;
      x.pessoas = Math.max(x.pessoas, c.pessoas);
      nec.set(k, x);
    }
  }
  const porSkill = [...nec].map(([skill, n]) => {
    const c = cap.get(skill) ?? { minutosDia: 0, pessoas: 0 };
    const peloTempo = n.dia > 0 ? Math.floor(c.minutosDia / n.dia + 1e-9) : Infinity;
    const pelasPessoas = n.pessoas > 0 ? Math.floor(c.pessoas / n.pessoas) : Infinity;
    return {
      skill,
      necessidadeDia: Math.round(n.dia),
      pessoasPorObra: n.pessoas,
      minutosDia: Math.round(c.minutosDia),
      pessoas: c.pessoas,
      obras: Math.min(peloTempo, pelasPessoas),
    };
  });
  porSkill.sort((a, b) => a.obras - b.obras);
  const pior = porSkill[0];
  return { obras: Number.isFinite(pior.obras) ? pior.obras : 0, gargalo: pior.skill, porSkill };
}

/* ──────────────────────────────── A fila ─────────────────────────────── */

export type OrdemFila = "data" | "valor" | "margem" | "contratados";

export interface LugarNaFila {
  id: string;
  inicio: string | null;
  fim: string | null;
  dias: number;
  /** null = coube; senão a razão de não caber. */
  bloqueio: string | null;
}

export interface Fila {
  lugares: LugarNaFila[];
  /** carga por especialidade × índice do dia útil (inclui a atual, se pedida) */
  carga: Map<string, number[]>;
  dias: string[];
}

export function ordenarFila(analises: AnaliseOrcamento[], ordem: OrdemFila): AnaliseOrcamento[] {
  const d = (a: AnaliseOrcamento) => a.orcamento.aceite_em ?? a.orcamento.data ?? "9999";
  const v = [...analises];
  switch (ordem) {
    case "valor":
      return v.sort((a, b) => Number(b.orcamento.valor_sem_iva ?? 0) - Number(a.orcamento.valor_sem_iva ?? 0));
    case "margem":
      return v.sort((a, b) => (b.margemPercent ?? -Infinity) - (a.margemPercent ?? -Infinity));
    case "contratados":
      return v.sort((a, b) => Number(b.orcamento.contratado) - Number(a.orcamento.contratado) || d(a).localeCompare(d(b)));
    default:
      return v.sort((a, b) => d(a).localeCompare(d(b)));
  }
}

/**
 * Põe as obras na fila, por esta ordem: cada uma começa no 1.º dia útil em
 * que a carga de cada especialidade (já marcada + esta obra, espalhada por
 * igual pela sua duração) não passa a capacidade. Se uma especialidade não
 * chega para o ritmo normal da obra, a obra estica (dura mais) em vez de
 * ficar parada. Sem ninguém com uma especialidade de que precisa: bloqueada.
 */
export function simularFila(
  analises: AnaliseOrcamento[],
  cap: Map<string, CapacidadeSkill>,
  dias: string[],
  cargaAtual: { skill_id: string | null; dia: string; minutos: number }[] = [],
  nomeSkill: (k: string) => string = (k) => k
): Fila {
  const idx = new Map(dias.map((d, i) => [d, i]));
  const carga = new Map<string, number[]>();
  const linha = (k: string) => {
    let l = carga.get(k);
    if (!l) {
      l = new Array(dias.length).fill(0);
      carga.set(k, l);
    }
    return l;
  };
  for (const c of cargaAtual) {
    const i = idx.get(c.dia);
    if (i != null) linha(chave(c.skill_id))[i] += Number(c.minutos) || 0;
  }

  const lugares: LugarNaFila[] = [];
  for (const a of analises) {
    if (a.dias === 0) {
      lugares.push({ id: a.orcamento.id, inicio: null, fim: null, dias: 0, bloqueio: "Sem trabalho no local para planear." });
      continue;
    }
    const falta = [...a.porSkill.keys()].filter((k) => !(cap.get(k)?.minutosDia ?? 0));
    if (falta.length) {
      lugares.push({
        id: a.orcamento.id,
        inicio: null,
        fim: null,
        dias: a.dias,
        bloqueio: `Ninguém na equipa com ${falta.map(nomeSkill).join(", ")}.`,
      });
      continue;
    }
    // Estica se a especialidade não dá o ritmo normal.
    let dur = a.dias;
    for (const [k, c] of a.porSkill) dur = Math.max(dur, Math.ceil(c.minutos / cap.get(k)!.minutosDia));
    const porDia = [...a.porSkill].map(([k, c]) => [k, c.minutos / dur] as const);

    let inicio = -1;
    for (let s = 0; s + dur <= dias.length && inicio < 0; s++) {
      let cabe = true;
      for (const [k, m] of porDia) {
        const l = carga.get(k);
        const limite = cap.get(k)!.minutosDia + 1e-6;
        for (let i = s; i < s + dur; i++) {
          if ((l ? l[i] : 0) + m > limite) {
            cabe = false;
            s = i; // não vale a pena tentar começar antes deste dia cheio
            break;
          }
        }
        if (!cabe) break;
      }
      if (cabe) inicio = s;
    }
    if (inicio < 0) {
      lugares.push({ id: a.orcamento.id, inicio: null, fim: null, dias: dur, bloqueio: "Não cabe no horizonte da previsão." });
      continue;
    }
    for (const [k, m] of porDia) {
      const l = linha(k);
      for (let i = inicio; i < inicio + dur; i++) l[i] += m;
    }
    lugares.push({ id: a.orcamento.id, inicio: dias[inicio], fim: dias[inicio + dur - 1], dias: dur, bloqueio: null });
  }
  return { lugares, carga, dias };
}

/* ───────────────────────────── Ocupação ──────────────────────────────── */

export type Periodo = "semana" | "mes";

/** A segunda-feira da semana (ISO) de um dia "AAAA-MM-DD". */
export function segundaFeira(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export interface Ocupacao {
  periodos: string[];
  /** especialidade → ocupação (0..n; 1 = 100 %) por período */
  porSkill: Map<string, number[]>;
}

export function ocupacao(
  fila: Fila,
  cap: Map<string, CapacidadeSkill>,
  periodo: Periodo,
  maxPeriodos = periodo === "semana" ? 26 : 12
): Ocupacao {
  const chaveP = (d: string) => (periodo === "semana" ? segundaFeira(d) : d.slice(0, 7));
  const periodos: string[] = [];
  const posDia: number[] = [];
  for (const d of fila.dias) {
    const p = chaveP(d);
    if (periodos[periodos.length - 1] !== p) periodos.push(p);
    posDia.push(periodos.length - 1);
  }
  const usados = periodos.slice(0, maxPeriodos);
  const porSkill = new Map<string, number[]>();
  for (const [k, l] of fila.carga) {
    const c = cap.get(k)?.minutosDia ?? 0;
    const soma = new Array(usados.length).fill(0);
    const capP = new Array(usados.length).fill(0);
    l.forEach((m, i) => {
      const p = posDia[i];
      if (p < usados.length) {
        soma[p] += m;
        capP[p] += c;
      }
    });
    porSkill.set(k, soma.map((s, i) => (capP[i] > 0 ? s / capP[i] : s > 0 ? Infinity : 0)));
  }
  return { periodos: usados, porSkill };
}
