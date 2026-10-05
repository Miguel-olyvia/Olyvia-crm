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
  type Intervalo,
  diaDaSemana,
  diasUteisEntre,
  distanciaUteis,
  ehDiaUtil,
  formatarMinutos,
  nivelDeAlerta,
  somarDias,
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
  /** Dependência única (legado). Usada só quando não vem `dependencias`. */
  dependeDe: string | null;
  /** Tarefas (micro, não fases) de que esta depende: só deve começar depois de todas acabarem. */
  dependencias?: readonly string[];
  /** Plano original (baseline), yyyy-mm-dd. Sem isto, não há sombra do plano. */
  inicioOriginal?: string | null;
  fimOriginal?: string | null;
  /** Devia ter começado e ainda não começou. */
  atrasadaInicio?: boolean;
  /** O último atraso registado (e quantos houve, em `n`). */
  atraso?: AtrasoGantt | null;
  /** Planeamento automático: horas de relógio de espera antes de começar (cura, fabrico). */
  esperaAntesHoras?: number | null;
  /** "padrão", "aprendido (3 tarefas)"… — de onde veio o tempo. */
  origemTempo?: string | null;
  /** O nome inteiro, quando `nome` vem encurtado (ver domain/nomesTarefas). */
  nomeCompleto?: string | null;
  /** Etiqueta curta do serviço, quando a obra tem mais do que um. */
  servico?: string | null;
}

export interface AtrasoGantt {
  motivo: string;
  contexto: string;
  minutosExtra: number | null;
  clienteAvisado: boolean;
  /** Quantos atrasos já se registaram nesta tarefa. */
  n: number;
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
      /** A barra do plano original, quando difere do atual (senão null/ausente). */
      barraOriginal?: Barra | null;
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
 *
 * Com `escala` "semana" a janela estica para semanas inteiras (segunda a
 * sexta); com "mes", para meses inteiros. As colunas continuam a ser dias
 * úteis — só muda a largura de cada uma e o cabeçalho (ver `cabecalhoGantt`).
 */
export function montarGantt(args: {
  fases: readonly FaseGantt[];
  tarefas: readonly TarefaGantt[];
  hoje: string;
  recolhidas?: ReadonlySet<string>;
  margem?: number;
  minimoDias?: number;
  escala?: EscalaGantt;
  /**
   * Só estes dias (ver `periodoGantt`): a vista Dia mostra um dia, a Semana
   * uma semana, o Mês um mês. As barras que passam das pontas são cortadas;
   * as que ficam de fora não se desenham (a linha da tarefa fica).
   */
  janela?: { ini: string; fim: string } | null;
}): LayoutGantt {
  const { fases, tarefas, hoje, recolhidas = new Set(), margem = 1, escala = "dia", janela } = args;
  const minimoDias = args.minimoDias ?? MINIMO_DIAS[escala];
  if (janela) return linhasGantt({ fases, tarefas, hoje, recolhidas, dias: diasUteisEntre(janela.ini, janela.fim), cortar: true });

  // O plano original também conta, para a sombra caber na janela.
  const datas = tarefas.flatMap((t) =>
    [t.inicio, t.fim, t.inicioOriginal, t.fimOriginal].filter((x): x is string => !!x)
  );
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
  if (escala === "semana" || escala === "mes") {
    [ini, fim] = alinharJanela(ini, fim, escala);
    dias = diasUteisEntre(ini, fim);
  }
  return linhasGantt({ fases, tarefas, hoje, recolhidas, dias, cortar: false });
}

/** Corta uma barra aos dias da janela (`n` colunas); null se fica toda de fora. */
export function recortarBarra(b: Barra | null, n: number): Barra | null {
  if (!b || n <= 0) return null;
  const ultima = b.col + b.span - 1;
  if (ultima < 0 || b.col >= n) return null;
  const col = Math.max(0, b.col);
  return { col, span: Math.min(n - 1, ultima) - col + 1 };
}

function linhasGantt(args: {
  fases: readonly FaseGantt[];
  tarefas: readonly TarefaGantt[];
  hoje: string;
  recolhidas: ReadonlySet<string>;
  dias: string[];
  cortar: boolean;
}): LayoutGantt {
  const { fases, tarefas, hoje, recolhidas, dias, cortar } = args;
  const barra = (ini: string | null, fim: string | null) => {
    const b = barraDe(dias, ini, fim);
    return cortar ? recortarBarra(b, dias.length) : b;
  };

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
    linhas.push({ tipo: "fase", fase: f, totais, barra: barra(totais.inicio, totais.fim), recolhida });
    if (recolhida) continue;
    for (const t of daFase) {
      const aberta = t.estado === "por_fazer" || t.estado === "em_curso" || t.estado === "rejeitada";
      linhas.push({
        tipo: "tarefa",
        tarefa: t,
        barra: barra(t.inicio, t.fim),
        gasto: t.minutosPrevistos > 0 ? t.minutosReais / t.minutosPrevistos : 0,
        nivel: nivelDeAlerta(t.minutosReais, t.minutosPrevistos),
        emAtraso: aberta && !!t.fim && t.fim < hoje,
        barraOriginal: planoMudou(t) ? barra(t.inicioOriginal ?? t.inicio, t.fimOriginal ?? t.fim) : null,
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

/* ─────────────────────────── Escalas: dia, semana, mês ─────────────────────────── */

/**
 * Dia, Semana e Mês mostram esse período (um dia, uma semana de segunda a
 * sexta, um mês) à largura toda — ver `periodoGantt`. "Obra" mostra a obra
 * inteira, com um dia a `pxPorDia("obra")`. O eixo é sempre o mesmo (dias
 * úteis), por isso arrastar e esticar encaixam ao dia em qualquer escala.
 */
export type EscalaGantt = "dia" | "semana" | "mes" | "obra";

export const ESCALAS_GANTT: readonly { id: EscalaGantt; rotulo: string }[] = [
  { id: "dia", rotulo: "Dia" },
  { id: "semana", rotulo: "Semana" },
  { id: "mes", rotulo: "Mês" },
  { id: "obra", rotulo: "Obra" },
];

/** Px por dia útil: na Obra, sempre; no Dia/Semana/Mês, o mínimo (estica à largura). */
const PX_POR_DIA: Record<EscalaGantt, number> = { dia: 44, semana: 22, mes: 6, obra: 44 };
const MINIMO_DIAS: Record<EscalaGantt, number> = { dia: 10, semana: 20, mes: 40, obra: 10 };

export function ehEscalaGantt(x: unknown): x is EscalaGantt {
  return x === "dia" || x === "semana" || x === "mes" || x === "obra";
}

/** A escala mostra um período fixo (dia, semana, mês) e não a obra toda? */
export function escalaComPeriodo(escala: EscalaGantt): boolean {
  return escala !== "obra";
}

/** Os dias que a vista mostra à volta de `ancora`: o dia, a semana (seg–sex) ou o mês. */
export function periodoGantt(escala: EscalaGantt, ancora: string): { ini: string; fim: string } {
  const a = somarDiasUteis(ancora, 0);
  if (escala === "semana") {
    const seg = somarDias(a, 1 - diaDaSemana(a));
    return { ini: seg, fim: somarDias(seg, 4) };
  }
  if (escala === "mes") {
    const [ini, fim] = alinharJanela(a, a, "mes");
    return { ini, fim };
  }
  return { ini: a, fim: a };
}

/** O período seguinte (`passo` = 1) ou anterior (−1): mais um dia útil, uma semana, um mês. */
export function navegarPeriodo(escala: EscalaGantt, ancora: string, passo: number): string {
  const a = somarDiasUteis(ancora, 0);
  if (escala === "semana") return somarDias(a, 7 * passo);
  if (escala === "mes") {
    const [ano, m] = a.split("-").map(Number);
    const total = ano * 12 + (m - 1) + passo;
    return somarDiasUteis(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`, 0);
  }
  return somarDiasUteis(a, passo);
}

const DIA_LONGO = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

/** "terça, 6 out 2026" · "Sem 41 · 5–9 out 2026" · "outubro 2026". */
export function rotuloPeriodo(escala: EscalaGantt, ancora: string): string {
  const { ini, fim } = periodoGantt(escala, ancora);
  const ano = fim.slice(0, 4);
  if (escala === "mes") return `${MESES_LONGOS[Number(ini.slice(5, 7)) - 1]} ${ano}`;
  if (escala === "semana") return `${rotuloSemanaCurto(ini, fim)} ${ano}`;
  const [, m, d] = ini.split("-").map(Number);
  return `${DIA_LONGO[diaDaSemana(ini)]}, ${d} ${MESES[m - 1]} ${ano}`;
}

/** Hoje está dentro do período que se vê? */
export function periodoTemHoje(escala: EscalaGantt, ancora: string, hoje: string): boolean {
  const { ini, fim } = periodoGantt(escala, ancora);
  const h = somarDiasUteis(hoje, 0);
  return ini <= h && h <= fim;
}

/** Largura, em píxeis, de um dia útil na escala. */
export function pxPorDia(escala: EscalaGantt): number {
  return PX_POR_DIA[escala];
}

/** Estica [ini, fim] para semanas (seg–sex) ou meses inteiros, em dias úteis. */
function alinharJanela(ini: string, fim: string, escala: EscalaGantt): [string, string] {
  if (escala === "semana") {
    const seg = somarDias(ini, 1 - diaDaSemana(ini));
    const dowFim = diaDaSemana(fim);
    const sex = dowFim <= 5 ? somarDias(fim, 5 - dowFim) : somarDias(fim, -(dowFim - 5));
    return [seg, sex];
  }
  if (escala === "mes") {
    const primeiro = somarDiasUteis(`${ini.slice(0, 8)}01`, 0);
    const [a, m] = fim.split("-").map(Number);
    const seguinte = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
    let ultimo = somarDias(seguinte, -1);
    while (!ehDiaUtil(ultimo)) ultimo = somarDias(ultimo, -1);
    return [primeiro, ultimo];
  }
  return [ini, fim];
}

/** Número da semana ISO 8601 (a semana 1 é a que tem a primeira quinta-feira do ano). */
export function semanaIso(iso: string): number {
  const quinta = somarDias(iso, 4 - diaDaSemana(iso));
  const ano = Number(quinta.slice(0, 4));
  const quatroJan = `${ano}-01-04`;
  const quintaSemana1 = somarDias(quatroJan, 4 - diaDaSemana(quatroJan));
  const dias = (Date.parse(`${quinta}T00:00:00Z`) - Date.parse(`${quintaSemana1}T00:00:00Z`)) / 86_400_000;
  return 1 + Math.round(dias / 7);
}

const MESES_LONGOS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const LETRA_DIA = ["", "S", "T", "Q", "Q", "S", "S", "D"];

/** "Sem 41 · 5–9 out", ou "Sem 40 · 28 set–2 out" se a semana muda de mês. */
export function rotuloSemanaCurto(primeiro: string, ultimo: string): string {
  const [, m1, d1] = primeiro.split("-").map(Number);
  const [, m2, d2] = ultimo.split("-").map(Number);
  const sem = `Sem ${semanaIso(primeiro)}`;
  if (primeiro === ultimo) return `${sem} · ${d1} ${MESES[m1 - 1]}`;
  if (m1 === m2) return `${sem} · ${d1}–${d2} ${MESES[m1 - 1]}`;
  return `${sem} · ${d1} ${MESES[m1 - 1]}–${d2} ${MESES[m2 - 1]}`;
}

export interface ColunaCabecalho {
  /** Primeira coluna (dia útil) que o grupo cobre. */
  col: number;
  /** Quantos dias úteis cobre. */
  span: number;
  rotulo: string;
  /** Segunda linha, mais pequena (só nos dias). */
  sub?: string;
  /** Texto completo, para o `title`. */
  titulo: string;
  /** O grupo contém hoje. */
  hoje: boolean;
}

export interface CabecalhoGantt {
  /** Linha de cima: semanas (vista Dia e Semana) ou anos (vista Mês). */
  topo: ColunaCabecalho[];
  /** Linha de baixo: dias (vista Dia e Semana) ou meses (vista Mês). */
  base: ColunaCabecalho[];
}

/** Agrupa os dias consecutivos com a mesma chave. */
function agrupar(
  dias: readonly string[],
  chave: (iso: string) => string,
  rotular: (primeiro: string, ultimo: string) => { rotulo: string; titulo: string; sub?: string },
  contemHoje: (primeiro: string, ultimo: string) => boolean
): ColunaCabecalho[] {
  const out: ColunaCabecalho[] = [];
  let i = 0;
  while (i < dias.length) {
    const k = chave(dias[i]);
    let j = i;
    while (j + 1 < dias.length && chave(dias[j + 1]) === k) j++;
    out.push({ col: i, span: j - i + 1, ...rotular(dias[i], dias[j]), hoje: contemHoje(dias[i], dias[j]) });
    i = j + 1;
  }
  return out;
}

/** Chave da semana: a segunda-feira dessa semana. */
const segundaDe = (iso: string) => somarDias(iso, 1 - diaDaSemana(iso));

/**
 * As duas linhas do cabeçalho, conforme a escala.
 *  - Dia: semanas por cima ("Semana de 5 out"), um dia por coluna por baixo.
 *  - Semana: "Sem 41 · 5–9 out" por cima, dias compactos (número + letra).
 *  - Mês: anos por cima, um mês por coluna por baixo.
 */
export function cabecalhoGantt(dias: readonly string[], escala: EscalaGantt, hoje?: string): CabecalhoGantt {
  const entre = (a: string, b: string) => !!hoje && a <= hoje && hoje <= b;
  const umDia = (iso: string): ColunaCabecalho => {
    const i = dias.indexOf(iso);
    const r = rotuloDia(iso);
    return {
      col: i,
      span: 1,
      rotulo: r.dia,
      sub: escala === "dia" || escala === "obra" ? r.semana.slice(0, 3) : LETRA_DIA[diaDaSemana(iso)],
      titulo: iso,
      hoje: iso === hoje,
    };
  };

  if (escala === "mes") {
    return {
      topo: agrupar(dias, (d) => d.slice(0, 4), (a) => ({ rotulo: a.slice(0, 4), titulo: a.slice(0, 4) }), (a) =>
        !!hoje && hoje.slice(0, 4) === a.slice(0, 4)
      ),
      base: agrupar(
        dias,
        (d) => d.slice(0, 7),
        (a) => {
          const nome = MESES_LONGOS[Number(a.slice(5, 7)) - 1];
          return { rotulo: nome, titulo: `${nome} ${a.slice(0, 4)}` };
        },
        (a) => !!hoje && hoje.slice(0, 7) === a.slice(0, 7)
      ),
    };
  }

  const topo = agrupar(
    dias,
    segundaDe,
    (a, b) =>
      escala === "semana"
        ? { rotulo: rotuloSemanaCurto(a, b), titulo: `Semana ${semanaIso(a)}: ${a} a ${b}` }
        : { rotulo: rotuloSemana(a), titulo: `Semana ${semanaIso(a)}` },
    (a, b) => entre(segundaDe(a), somarDias(segundaDe(b), 6))
  );
  return { topo, base: dias.map(umDia) };
}

/* ─────────────────────────── Posição ↔ data ─────────────────────────── */

/** Píxel onde começa a coluna `col`. */
export function xDeColuna(col: number, ppd: number): number {
  return col * ppd;
}

/** Coluna sob o píxel `x` (pode ser < 0 ou ≥ dias.length, fora da janela). */
export function colunaDeX(x: number, ppd: number): number {
  if (ppd <= 0) return 0;
  return Math.floor(x / ppd);
}

/** Píxel onde começa uma data (fim de semana encosta à segunda). */
export function xDeData(dias: readonly string[], iso: string, ppd: number): number {
  return xDeColuna(colunaDe(dias, iso), ppd);
}

/** A data (dia útil) sob o píxel `x`; fora da janela, conta dias úteis a partir das pontas. */
export function dataDeX(dias: readonly string[], x: number, ppd: number): string | null {
  if (!dias.length) return null;
  const col = colunaDeX(x, ppd);
  if (col < 0) return somarDiasUteis(dias[0], col);
  if (col >= dias.length) return somarDiasUteis(dias[dias.length - 1], col - dias.length + 1);
  return dias[col];
}

/**
 * Onde desenhar a linha de hoje: a meio da coluna do dia; num fim de semana,
 * na junta entre a sexta e a segunda. Fora da janela, null.
 */
export function xHoje(dias: readonly string[], hoje: string, ppd: number): number | null {
  const i = dias.indexOf(hoje);
  if (i >= 0) return xDeColuna(i, ppd) + ppd / 2;
  if (ehDiaUtil(hoje)) return null;
  const segunda = dias.indexOf(somarDiasUteis(hoje, 0));
  return segunda > 0 ? xDeColuna(segunda, ppd) : null;
}

/** Colunas que vêm logo a seguir a um fim de semana (onde se desenha a junta sombreada). */
export function juntasDeFimDeSemana(dias: readonly string[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < dias.length; i++) {
    if (somarDias(dias[i - 1], 1) !== dias[i]) out.push(i);
  }
  return out;
}

/**
 * Posição e largura de uma barra em píxeis, com `folga` de cada lado e uma
 * largura mínima para continuar a dar para agarrar na vista Mês.
 */
export function geometriaBarra(
  barra: Barra,
  ppd: number,
  folga: number,
  minimo = 8
): { left: number; width: number } {
  return { left: xDeColuna(barra.col, ppd) + folga, width: Math.max(minimo, barra.span * ppd - 2 * folga) };
}

/* ─────────────────────────── Dependências entre tarefas ─────────────────────────── */

/**
 * As dependências contam-se tarefa a tarefa (micro), nunca por fase: a fase é
 * só agrupamento visual. Vale `dependencias` se vier; senão, o `dependeDe`
 * antigo. Sem repetidos e sem a própria tarefa.
 */
export function dependenciasDe(t: Pick<TarefaGantt, "id" | "dependeDe" | "dependencias">): string[] {
  const ids = t.dependencias ?? (t.dependeDe ? [t.dependeDe] : []);
  return [...new Set(ids)].filter((id) => !!id && id !== t.id);
}

/**
 * A dependente começa antes de a mãe acabar? Começar no dia em que a mãe acaba
 * não conta (várias tarefas cabem no mesmo dia). Sem datas, não se sabe — não avisa.
 */
export function violaDependencia(
  mae: { inicio: string | null; fim: string | null } | null | undefined,
  filha: { inicio: string | null } | null | undefined
): boolean {
  const fimMae = mae?.fim ?? mae?.inicio;
  const inicio = filha?.inicio;
  return !!fimMae && !!inicio && inicio < fimMae;
}

export interface AvisoDependencia {
  /** "mae": esta começa antes de `tarefa` acabar; "filha": `tarefa` começa antes de esta acabar. */
  tipo: "mae" | "filha";
  tarefa: TarefaGantt;
}

/** Que dependências ficam por cumprir se a tarefa `id` passar a `intervalo` (não impede nada). */
export function avisosDeDependencia(
  tarefas: readonly TarefaGantt[],
  id: string,
  intervalo: Intervalo
): AvisoDependencia[] {
  const porId = new Map(tarefas.map((t) => [t.id, t]));
  const eu = porId.get(id);
  if (!eu) return [];
  const out: AvisoDependencia[] = [];
  for (const m of dependenciasDe(eu)) {
    const mae = porId.get(m);
    if (mae && violaDependencia(mae, intervalo)) out.push({ tipo: "mae", tarefa: mae });
  }
  for (const f of tarefas) {
    if (f.id !== id && dependenciasDe(f).includes(id) && violaDependencia(intervalo, f)) {
      out.push({ tipo: "filha", tarefa: f });
    }
  }
  return out;
}

/** "Começa antes de acabar: Canalização · Pintura começa antes de esta acabar". */
export function textoAvisoDependencia(avisos: readonly AvisoDependencia[]): string | null {
  if (!avisos.length) return null;
  const maes = avisos.filter((a) => a.tipo === "mae").map((a) => a.tarefa.nome);
  const filhas = avisos.filter((a) => a.tipo === "filha").map((a) => a.tarefa.nome);
  const partes: string[] = [];
  if (maes.length) partes.push(`Começa antes de acabar: ${maes.join(", ")}`);
  if (filhas.length) partes.push(`${filhas.join(", ")} ${filhas.length > 1 ? "começam" : "começa"} antes de esta acabar`);
  return partes.join(" · ");
}

/**
 * Ligar `filha` a `mae` fecharia um ciclo? (a mãe já depende, direta ou
 * indiretamente, da filha — ou são a mesma.)
 */
export function criaCiclo(tarefas: readonly TarefaGantt[], filha: string, mae: string): boolean {
  if (filha === mae) return true;
  const porId = new Map(tarefas.map((t) => [t.id, t]));
  const vistos = new Set<string>();
  const pilha = [mae];
  while (pilha.length) {
    const id = pilha.pop() as string;
    if (id === filha) return true;
    if (vistos.has(id)) continue;
    vistos.add(id);
    const t = porId.get(id);
    if (t) pilha.push(...dependenciasDe(t));
  }
  return false;
}

export interface SetaDependencia {
  de: string;
  para: string;
  /** Caminho SVG, em píxeis relativos ao topo das linhas. */
  caminho: string;
  violada: boolean;
}

/**
 * Caminho em cotovelo do fim da mãe (x1, y1) ao início da dependente (x2, y2).
 * Se a dependente começa antes (ou logo a seguir), dá a volta pela junta entre
 * linhas para a seta não atravessar as barras.
 */
export function caminhoSeta(x1: number, y1: number, x2: number, y2: number, alturaLinha: number): string {
  const g = 6;
  if (x2 - x1 >= 2 * g) return `M ${x1} ${y1} H ${x1 + g} V ${y2} H ${x2}`;
  const junta = y2 > y1 ? y2 - alturaLinha / 2 : y2 + alturaLinha / 2;
  return `M ${x1} ${y1} H ${x1 + g} V ${junta} H ${x2 - g} V ${y2} H ${x2}`;
}

/**
 * As setas de dependência entre tarefas visíveis com barra (uma fase recolhida
 * esconde as suas). `ajuste` é a barra a ser arrastada: as setas e o vermelho
 * acompanham o arrasto antes de gravar.
 */
export function setasDependencia(args: {
  linhas: readonly LinhaGantt[];
  ppd: number;
  alturaLinha: number;
  folga: number;
  ajuste?: { id: string; barra: Barra; intervalo: Intervalo } | null;
}): SetaDependencia[] {
  const { linhas, ppd, alturaLinha, folga, ajuste } = args;
  const pos = new Map<
    string,
    { linha: number; barra: Barra; inicio: string | null; fim: string | null; deps: string[] }
  >();
  linhas.forEach((l, i) => {
    if (l.tipo !== "tarefa" || !l.barra) return;
    const a = ajuste?.id === l.tarefa.id ? ajuste : null;
    pos.set(l.tarefa.id, {
      linha: i,
      barra: a?.barra ?? l.barra,
      inicio: a ? a.intervalo.inicio : l.tarefa.inicio,
      fim: a ? a.intervalo.fim : l.tarefa.fim,
      deps: dependenciasDe(l.tarefa),
    });
  });
  const out: SetaDependencia[] = [];
  for (const [id, p] of pos) {
    for (const m of p.deps) {
      const q = pos.get(m);
      if (!q) continue;
      const gm = geometriaBarra(q.barra, ppd, folga);
      const gf = geometriaBarra(p.barra, ppd, folga);
      const y1 = q.linha * alturaLinha + alturaLinha / 2;
      const y2 = p.linha * alturaLinha + alturaLinha / 2;
      out.push({
        de: m,
        para: id,
        caminho: caminhoSeta(gm.left + gm.width, y1, gf.left, y2, alturaLinha),
        violada: violaDependencia(q, p),
      });
    }
  }
  return out;
}

/** A tarefa na linha sob `y` (píxeis a partir do topo das linhas), ou null (fase, fora). */
export function tarefaNaPosicao(linhas: readonly LinhaGantt[], y: number, alturaLinha: number): string | null {
  if (y < 0 || alturaLinha <= 0) return null;
  const l = linhas[Math.floor(y / alturaLinha)];
  return l?.tipo === "tarefa" ? l.tarefa.id : null;
}

/* ─────────────────────────── Coluna dos nomes ─────────────────────────── */

export const LARGURA_NOMES_MIN = 160;
export const LARGURA_NOMES_MAX = 640;
export const LARGURA_NOMES_PADRAO = 280;

export function limitarLarguraNomes(w: number): number {
  if (!Number.isFinite(w)) return LARGURA_NOMES_PADRAO;
  return Math.round(Math.min(LARGURA_NOMES_MAX, Math.max(LARGURA_NOMES_MIN, w)));
}

/**
 * Largura da coluna para que o nome mais comprido caiba inteiro. Cada medida é
 * de um nome: quanto ocupa agora (`ocupado`) e quanto ocuparia sem cortes
 * (`natural`); o resto da linha (recuo, ícones, minutos) fica igual.
 * Sem medidas úteis (p.ex. sem layout), fica como está.
 */
export function larguraAjustadaAosNomes(
  atual: number,
  medidas: readonly { ocupado: number; natural: number }[]
): number {
  const validas = medidas.filter((m) => m.natural > 0);
  if (!validas.length) return limitarLarguraNomes(atual);
  const precisa = Math.max(...validas.map((m) => atual - m.ocupado + m.natural));
  return limitarLarguraNomes(Math.ceil(precisa) + 4);
}

/* ─────────────────────────── Plano original e atrasos ─────────────────────────── */

/** As datas atuais diferem do plano original? (Sem plano original, não.) */
export function planoMudou(t: Pick<TarefaGantt, "inicio" | "fim" | "inicioOriginal" | "fimOriginal">): boolean {
  if (!t.inicioOriginal && !t.fimOriginal) return false;
  const iniOrig = t.inicioOriginal ?? t.inicio;
  const fimOrig = t.fimOriginal ?? t.fim ?? iniOrig;
  return iniOrig !== t.inicio || fimOrig !== (t.fim ?? t.inicio);
}

/**
 * Quantos dias úteis o fim atual passa do fim original (negativo se adiantou;
 * 0 se faltar alguma das datas). Fins de semana encostam ao dia útil seguinte.
 */
export function diasUteisDeAtraso(fimOriginal: string | null | undefined, fimAtual: string | null | undefined): number {
  if (!fimOriginal || !fimAtual) return 0;
  return distanciaUteis(somarDiasUteis(fimOriginal, 0), somarDiasUteis(fimAtual, 0));
}

/**
 * A parte da barra atual (em píxeis, relativa à grelha) que vai além do fim
 * original, para a pintar às riscas. Null se não passa do original. Serve a
 * qualquer escala: só depende de `ppd` (ver `pxPorDia`).
 */
export function segmentoAlemDoOriginal(args: {
  dias: readonly string[];
  barra: Barra;
  fimOriginal: string | null | undefined;
  ppd: number;
  folga: number;
  minimo?: number;
}): { left: number; width: number } | null {
  const { dias, barra, fimOriginal, ppd, folga, minimo } = args;
  if (!fimOriginal || !dias.length) return null;
  const g = geometriaBarra(barra, ppd, folga, minimo);
  const fimBarra = g.left + g.width;
  const xFimOriginal = xDeColuna(colunaDe(dias, fimOriginal) + 1, ppd) - folga;
  const left = Math.max(g.left, xFimOriginal);
  const width = fimBarra - left;
  return width > 0 ? { left, width } : null;
}

/** "23 out". */
export function dataCurta(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1]}`;
}

/** "secagem" ou "falta_material" → "Secagem", "Falta material"; texto livre fica como vem (1.ª maiúscula). */
function rotuloMotivo(motivo: string): string {
  const m = motivo.trim();
  if (!m) return "";
  const legivel = /^[a-z0-9_]+$/.test(m) ? m.replace(/_/g, " ") : m;
  return legivel[0].toUpperCase() + legivel.slice(1);
}

const plural = (n: number, um: string, varios: string) => `${n} ${Math.abs(n) === 1 ? um : varios}`;

/**
 * "Atrasada +2 dias — Secagem: parede ainda húmida (cliente avisado)". Os dias
 * vêm do fim atual contra o original; sem isso, dos minutos extra.
 */
export function textoAtraso(t: Pick<TarefaGantt, "fim" | "inicio" | "fimOriginal" | "atraso">): string | null {
  const a = t.atraso;
  if (!a) return null;
  const dias = diasUteisDeAtraso(t.fimOriginal, t.fim ?? t.inicio);
  const quanto =
    dias > 0
      ? ` +${plural(dias, "dia", "dias")}`
      : a.minutosExtra != null && a.minutosExtra > 0
        ? ` +${formatarMinutos(a.minutosExtra)}`
        : "";
  const motivo = rotuloMotivo(a.motivo ?? "");
  const contexto = (a.contexto ?? "").trim();
  const porque = motivo && contexto ? `${motivo}: ${contexto}` : motivo || contexto;
  const vezes = a.n > 1 ? ` · ${a.n} atrasos registados` : "";
  return `Atrasada${quanto}${porque ? ` — ${porque}` : ""} (${a.clienteAvisado ? "cliente avisado" : "cliente por avisar"})${vezes}`;
}

/** Atrasada: atraso registado, não começou a tempo, ou o fim passou do original. */
export function tarefaAtrasada(t: TarefaGantt): boolean {
  return !!t.atraso || !!t.atrasadaInicio || diasUteisDeAtraso(t.fimOriginal, t.fim ?? t.inicio) > 0;
}

export interface ResumoAtrasos {
  /** Último fim do plano atual. */
  fimPrevisto: string | null;
  /** Último fim do plano original (onde falta o original, conta o atual). */
  fimOriginal: string | null;
  /** fimPrevisto − fimOriginal, em dias úteis. */
  diasUteis: number;
  atrasadas: number;
  porAvisar: number;
  naoIniciadas: number;
}

/**
 * O resumo do topo do Gantt. Null quando nenhuma tarefa traz plano original
 * nem dados de atraso (o Gantt fica como era).
 */
export function resumoAtrasos(tarefas: readonly TarefaGantt[]): ResumoAtrasos | null {
  const comDados = tarefas.some(
    (t) => !!t.inicioOriginal || !!t.fimOriginal || !!t.atraso || t.atrasadaInicio !== undefined
  );
  if (!comDados) return null;
  const ultimo = (xs: (string | null | undefined)[]) =>
    xs.filter((x): x is string => !!x).reduce<string | null>((a, b) => (a == null || b > a ? b : a), null);
  const fimPrevisto = ultimo(tarefas.map((t) => t.fim ?? t.inicio));
  const fimOriginal = ultimo(tarefas.map((t) => t.fimOriginal ?? t.fim ?? t.inicio));
  return {
    fimPrevisto,
    fimOriginal,
    diasUteis: diasUteisDeAtraso(fimOriginal, fimPrevisto),
    atrasadas: tarefas.filter(tarefaAtrasada).length,
    porAvisar: tarefas.filter((t) => !!t.atraso && !t.atraso.clienteAvisado).length,
    naoIniciadas: tarefas.filter((t) => !!t.atrasadaInicio).length,
  };
}

/** "Fim previsto: 23 out (original 17 out, +4 dias úteis) · 3 tarefas atrasadas · 1 por avisar o cliente". */
export function textoResumoAtrasos(r: ResumoAtrasos): string {
  const partes: string[] = [];
  if (r.fimPrevisto) {
    let fim = `Fim previsto: ${dataCurta(r.fimPrevisto)}`;
    if (r.fimOriginal && r.diasUteis !== 0) {
      const sinal = r.diasUteis > 0 ? "+" : "−";
      fim += ` (original ${dataCurta(r.fimOriginal)}, ${sinal}${plural(Math.abs(r.diasUteis), "dia útil", "dias úteis")})`;
    } else {
      fim += " (no plano original)";
    }
    partes.push(fim);
  }
  partes.push(r.atrasadas ? plural(r.atrasadas, "tarefa atrasada", "tarefas atrasadas") : "sem tarefas atrasadas");
  if (r.naoIniciadas) partes.push(plural(r.naoIniciadas, "não iniciada a tempo", "não iniciadas a tempo"));
  if (r.porAvisar) partes.push(`${r.porAvisar} por avisar o cliente`);
  return partes.join(" · ");
}
