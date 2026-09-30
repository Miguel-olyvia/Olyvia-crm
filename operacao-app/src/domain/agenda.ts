/**
 * O dia, visto de cima: quem tem o quê, e a que horas.
 *
 * Tudo funções puras. A parte difícil de uma agenda não é desenhar — é decidir
 * o que fazer com o que não encaixa: a ordem sem hora, a que atravessa o
 * almoço, a que começa antes de o dia abrir. Cada uma dessas decisões está
 * aqui, com um teste ao lado.
 *
 * Uma escolha que atravessa tudo: **este ecrã não inventa horas.** No
 * Infraspeak o calendário mostra tudo empilhado às 09:00, porque a hora é
 * simbólica e ninguém a preenche — e uma grelha cheia de blocos às nove da
 * manhã é precisão falsa. Aqui, uma ordem sem hora marcada aparece à parte,
 * numa faixa "sem hora", e não a fingir que é às nove.
 */

/** O dia útil que a grelha desenha. Fora disto, encosta-se à borda. */
export const HORA_ABRE = 7;
export const HORA_FECHA = 20;

export interface OrdemNaAgenda {
  id: string;
  codigo: string;
  titulo: string;
  estado: string;
  origem: string;
  prioridade: string;
  responsavel_id: string | null;
  local_id: string | null;
  cliente_id: string | null;
  tipo_trabalho_id: string | null;
  fornecedor_id: string | null;
  agendada_para: string | null;
  janela_inicio: string | null;
  janela_fim: string | null;
}

/** Um impedimento vindo da agenda do CRM, já com o dono. */
export interface ImpedimentoDaEquipa {
  utilizador_id: string;
  tipo: "ausente" | "fora_de_horario" | "feriado";
  detalhe: string;
  desde: string;
  ate: string;
}

/* ─────────────────────────── O dia ─────────────────────────── */

/** As horas que a régua mostra: 7, 8, … 20. */
export function horasDaRegua(): number[] {
  const h: number[] = [];
  for (let i = HORA_ABRE; i <= HORA_FECHA; i++) h.push(i);
  return h;
}

/** O mesmo dia, mais ou menos n dias. Sem mexer no original. */
export function somarDias(dia: Date, n: number): Date {
  const d = new Date(dia);
  d.setDate(d.getDate() + n);
  return d;
}

export function mesmoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/* ──────────────────────── Onde fica o bloco ─────────────────── */

export interface Posicao {
  /** Percentagem da largura, da esquerda. */
  esquerda: number;
  /** Percentagem da largura. Nunca zero — um bloco invisível não se clica. */
  largura: number;
  /** A ordem começa antes de a régua abrir, ou acaba depois de fechar. */
  transborda: boolean;
}

const LARGURA_MINIMA = 3;

/**
 * Onde é que a barra de uma ordem fica na régua do dia.
 *
 * A janela de visita manda, se existir. Sem janela, assume-se uma hora a
 * partir da hora marcada — o mesmo pressuposto que o aviso de choque já usa,
 * de propósito: duas partes do sistema a assumir durações diferentes davam
 * respostas contraditórias sobre o mesmo dia.
 */
export function posicaoNaRegua(o: OrdemNaAgenda, dia: Date): Posicao | null {
  const marcada = o.agendada_para ? new Date(o.agendada_para) : null;
  if (!marcada || Number.isNaN(marcada.getTime())) return null;

  const inicio = o.janela_inicio ? new Date(o.janela_inicio) : marcada;
  const fimBruto = o.janela_fim ? new Date(o.janela_fim) : new Date(inicio.getTime() + 3600_000);

  // Uma ordem de outro dia não tem sítio nesta régua.
  if (!mesmoDia(inicio, dia) && !mesmoDia(fimBruto, dia)) return null;

  const emHoras = (d: Date) =>
    mesmoDia(d, dia) ? d.getHours() + d.getMinutes() / 60 : d < dia ? HORA_ABRE : HORA_FECHA;

  const h1 = emHoras(inicio);
  const h2 = Math.max(emHoras(fimBruto), h1 + 0.25);
  const total = HORA_FECHA - HORA_ABRE;

  const transborda = h1 < HORA_ABRE || h2 > HORA_FECHA;
  const a = Math.max(h1, HORA_ABRE);
  const b = Math.min(h2, HORA_FECHA);

  // Uma visita marcada para as 6h30 não desaparece do ecrã: encosta-se à
  // borda e leva a marca de que transborda.
  if (b <= a) {
    return {
      esquerda: h1 < HORA_ABRE ? 0 : 100 - LARGURA_MINIMA,
      largura: LARGURA_MINIMA,
      transborda: true,
    };
  }

  return {
    esquerda: ((a - HORA_ABRE) / total) * 100,
    largura: Math.max(LARGURA_MINIMA, ((b - a) / total) * 100),
    transborda,
  };
}

/* ─────────────────────── A carga de cada um ─────────────────── */

export interface CargaDoDia {
  ordens: number;
  /** Horas comprometidas, contando a janela ou uma hora por omissão. */
  horas: number;
  /** As que não têm hora marcada, e por isso não entram na régua. */
  semHora: number;
}

export function cargaDoDia(ordens: readonly OrdemNaAgenda[]): CargaDoDia {
  let horas = 0;
  let semHora = 0;

  for (const o of ordens) {
    if (!o.agendada_para) {
      semHora += 1;
      continue;
    }
    if (o.janela_inicio && o.janela_fim) {
      const d = (new Date(o.janela_fim).getTime() - new Date(o.janela_inicio).getTime()) / 3600_000;
      horas += d > 0 ? d : 1;
    } else {
      horas += 1;
    }
  }

  return { ordens: ordens.length, horas: Math.round(horas * 10) / 10, semHora };
}

/**
 * O aviso de carga.
 *
 * Oito horas é o dia. Acima disso não se impede nada — quem coordena sabe que
 * há dias assim — mas diz-se, porque a alternativa é descobrir às cinco da
 * tarde que a última visita não vai acontecer.
 */
export function cargaPesada(carga: CargaDoDia): boolean {
  return carga.horas > 8;
}

/* ──────────────────── Distribuir pelas pessoas ──────────────── */

export interface LinhaDaAgenda<P> {
  pessoa: P;
  ordens: OrdemNaAgenda[];
  carga: CargaDoDia;
  impedimentos: ImpedimentoDaEquipa[];
}

/**
 * Uma linha por pessoa, mesmo que não tenha nada.
 *
 * As linhas vazias são metade do valor deste ecrã: é nelas que se vê quem
 * está livre. Esconder quem não tem trabalho transformava a agenda numa lista
 * de quem já está ocupado, que é a pergunta contrária.
 */
export function porPessoa<P extends { utilizador_id: string }>(
  pessoas: readonly P[],
  ordens: readonly OrdemNaAgenda[],
  impedimentos: readonly ImpedimentoDaEquipa[]
): LinhaDaAgenda<P>[] {
  return pessoas.map((pessoa) => {
    const minhas = ordens.filter((o) => o.responsavel_id === pessoa.utilizador_id);
    return {
      pessoa,
      ordens: minhas,
      carga: cargaDoDia(minhas),
      impedimentos: impedimentos.filter((i) => i.utilizador_id === pessoa.utilizador_id),
    };
  });
}

/**
 * As que ainda não têm dono.
 *
 * Ficam numa faixa própria, em cima. É o trabalho que ainda precisa de uma
 * decisão, e por isso é a primeira coisa que quem coordena deve ver.
 */
export function porAtribuir(ordens: readonly OrdemNaAgenda[]): OrdemNaAgenda[] {
  return ordens.filter((o) => !o.responsavel_id);
}

/** Um feriado é de toda a gente — não é de ninguém em particular. */
export function feriadoDoDia(
  impedimentos: readonly ImpedimentoDaEquipa[]
): string | null {
  return impedimentos.find((i) => i.tipo === "feriado")?.detalhe ?? null;
}

/* ───────────────────── Compromissos vindos do CRM ──────────────────────── */

/**
 * Um compromisso da agenda do CRM — uma visita comercial, uma formação.
 *
 * A agenda é uma só: uma pessoa com uma visita marcada às 10h não está livre
 * às 10h, e até se cruzarem as duas agendas Operações dizia que estava.
 */
export interface Compromisso {
  utilizador_id: string;
  compromisso_id: string;
  titulo: string;
  inicio: string;
  fim: string;
  dia_inteiro: boolean;
  onde: string | null;
}

/** Um compromisso desenha-se na mesma régua que uma ordem. */
export function posicaoDoCompromisso(c: Compromisso, dia: Date): Posicao | null {
  return posicaoNaRegua(
    {
      id: c.compromisso_id,
      codigo: "",
      titulo: c.titulo,
      estado: "agendada",
      origem: "crm",
      prioridade: "normal",
      responsavel_id: c.utilizador_id,
      // Um compromisso do CRM não tem local de Operações — e por isso nunca
      // entra numa rota nem no mapa. O `onde` que ele traz é texto à mão.
      local_id: null,
      cliente_id: null,
      tipo_trabalho_id: null,
      fornecedor_id: null,
      agendada_para: c.inicio,
      janela_inicio: c.inicio,
      janela_fim: c.fim,
    },
    dia
  );
}

/* ─────────────────────────── Semana e mês ──────────────────────────────── */

/** Segunda-feira da semana que contém este dia. Cá a semana começa à segunda. */
export function inicioDaSemana(dia: Date): Date {
  const d = new Date(dia);
  d.setHours(0, 0, 0, 0);
  // getDay(): 0 = domingo. Domingo pertence à semana que começou na segunda
  // anterior, e não à seguinte.
  const desvio = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - desvio);
  return d;
}

export function diasDaSemana(dia: Date): Date[] {
  const inicio = inicioDaSemana(dia);
  return Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
}

/**
 * A grelha do mês: semanas completas, com os dias vizinhos a preencher.
 *
 * Um calendário que começasse a meio de uma linha lê-se pior — e o dia 1 numa
 * quinta-feira deixaria três células vazias sem explicação.
 */
export function grelhaDoMes(dia: Date): Date[] {
  const primeiro = new Date(dia.getFullYear(), dia.getMonth(), 1);
  const ultimo = new Date(dia.getFullYear(), dia.getMonth() + 1, 0);
  const inicio = inicioDaSemana(primeiro);
  const fim = somarDias(inicioDaSemana(ultimo), 6);

  const dias: Date[] = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) dias.push(d);
  return dias;
}

/** `2026-09-16`, no fuso local — a chave por que se agrupa um calendário. */
export function chaveDoDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function noMesDe(dia: Date, referencia: Date): boolean {
  return dia.getMonth() === referencia.getMonth() && dia.getFullYear() === referencia.getFullYear();
}

/**
 * Agrupa por dia o que tem data.
 *
 * O que não tem data fica de fora: numa vista de semana ou de mês não há sítio
 * para o pôr sem inventar um dia, e inventar é o que se está a evitar.
 */
export function porDia<T>(itens: readonly T[], quando: (x: T) => string | null): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of itens) {
    const iso = quando(x);
    if (!iso) continue;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const k = chaveDoDia(d);
    const lista = m.get(k);
    if (lista) lista.push(x);
    else m.set(k, [x]);
  }
  return m;
}

/** Quantas horas ocupa um compromisso. Um dia inteiro conta como o dia útil. */
export function horasDoCompromisso(c: Compromisso): number {
  if (c.dia_inteiro) return 8;
  const h = (new Date(c.fim).getTime() - new Date(c.inicio).getTime()) / 3600_000;
  return Number.isFinite(h) && h > 0 ? h : 1;
}

/** A carga de um dia, contando também o que veio do CRM. */
export function cargaComCompromissos(
  ordens: readonly OrdemNaAgenda[],
  compromissos: readonly Compromisso[]
): CargaDoDia & { compromissos: number } {
  const base = cargaDoDia(ordens);
  const horas = compromissos.reduce((s, c) => s + horasDoCompromisso(c), 0);
  return {
    ...base,
    compromissos: compromissos.length,
    horas: Math.round((base.horas + horas) * 10) / 10,
  };
}

/* ─────────────────────────── Filtrar a agenda ──────────────────────────── */

/**
 * As cinco perguntas que se fazem a olhar para uma agenda cheia.
 *
 * Vazio quer dizer "todos" — e não "nenhum". É a diferença entre um filtro que
 * ajuda e um ecrã que nasce em branco à espera que alguém adivinhe.
 */
export interface FiltroDaAgenda {
  clienteId?: string | null;
  tipoTrabalhoId?: string | null;
  responsavelId?: string | null;
  fornecedorId?: string | null;
  /** Escolhe-se a especialidade; filtram-se as ordens de quem a tem. */
  especialidadeId?: string | null;
}

export const FILTRO_VAZIO: FiltroDaAgenda = {};

export function temFiltro(f: FiltroDaAgenda): boolean {
  return Object.values(f).some((v) => !!v);
}

export function quantosFiltros(f: FiltroDaAgenda): number {
  return Object.values(f).filter(Boolean).length;
}

/**
 * As ordens que passam o filtro.
 *
 * `quemTem` é o mapa especialidade → utilizadores. Uma ordem sem responsável
 * nunca passa um filtro de especialidade: não se sabe de quem é, e dizer que
 * sim seria adivinhar.
 */
export function filtrarOrdens(
  ordens: readonly OrdemNaAgenda[],
  f: FiltroDaAgenda,
  quemTem?: ReadonlyMap<string, readonly string[]>
): OrdemNaAgenda[] {
  const daEspecialidade = f.especialidadeId
    ? new Set(quemTem?.get(f.especialidadeId) ?? [])
    : null;

  return ordens.filter((o) => {
    if (f.clienteId && o.cliente_id !== f.clienteId) return false;
    if (f.tipoTrabalhoId && o.tipo_trabalho_id !== f.tipoTrabalhoId) return false;
    if (f.responsavelId && o.responsavel_id !== f.responsavelId) return false;
    if (f.fornecedorId && o.fornecedor_id !== f.fornecedorId) return false;
    if (daEspecialidade) {
      if (!o.responsavel_id) return false;
      if (!daEspecialidade.has(o.responsavel_id)) return false;
    }
    return true;
  });
}

/**
 * A equipa que ainda faz sentido mostrar, dado o filtro.
 *
 * Com um filtro ativo, uma grelha com as vinte pessoas da casa e dezanove
 * linhas vazias não é uma agenda filtrada — é a mesma agenda com buracos. Sem
 * filtro nenhum, mostram-se todos, porque uma pessoa livre é informação.
 */
export function equipaVisivel<T extends { utilizador_id: string }>(
  equipa: readonly T[],
  ordens: readonly OrdemNaAgenda[],
  f: FiltroDaAgenda,
  quemTem?: ReadonlyMap<string, readonly string[]>
): T[] {
  if (!temFiltro(f)) return [...equipa];

  const comTrabalho = new Set(
    ordens.map((o) => o.responsavel_id).filter((x): x is string => !!x)
  );

  // Com um filtro de especialidade, quem a tem aparece mesmo sem trabalho —
  // é precisamente a pergunta "quem é que está livre e sabe fazer isto?".
  const daEspecialidade = f.especialidadeId
    ? new Set(quemTem?.get(f.especialidadeId) ?? [])
    : null;

  return equipa.filter(
    (p) => comTrabalho.has(p.utilizador_id) || daEspecialidade?.has(p.utilizador_id)
  );
}
