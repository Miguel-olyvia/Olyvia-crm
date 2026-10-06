/**
 * Regras de recorrência, escritas e lidas em português.
 *
 * A RRULE (`FREQ=MONTHLY;BYDAY=1MO`) é um bom formato para guardar e um mau
 * formato para mostrar a alguém. Ninguém que faça manutenção de extintores
 * devia ter de aprender iCalendar para dizer "na primeira segunda de cada mês".
 *
 * Este ficheiro traduz nos dois sentidos, e não sabe que existe base de dados.
 */

export const DIAS = [
  { chave: "MO", curto: "Seg", nome: "segunda-feira" },
  { chave: "TU", curto: "Ter", nome: "terça-feira" },
  { chave: "WE", curto: "Qua", nome: "quarta-feira" },
  { chave: "TH", curto: "Qui", nome: "quinta-feira" },
  { chave: "FR", curto: "Sex", nome: "sexta-feira" },
  { chave: "SA", curto: "Sáb", nome: "sábado" },
  { chave: "SU", curto: "Dom", nome: "domingo" },
] as const;

export type Frequencia = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

/** O que o formulário manipula. Vira RRULE só na hora de gravar. */
export interface Recorrencia {
  frequencia: Frequencia;
  intervalo: number;
  /** WEEKLY: os dias da semana. MONTHLY com ordinal: um só dia. */
  dias: string[];
  /** MONTHLY: o dia do mês (1–31). Nulo quando se usa ordinal. */
  diaDoMes: number | null;
  /** MONTHLY: 1 a 4, ou −1 para "a última". Nulo quando se usa dia do mês. */
  ordinal: number | null;
}

export const RECORRENCIA_VAZIA: Recorrencia = {
  frequencia: "MONTHLY",
  intervalo: 1,
  dias: [],
  diaDoMes: 1,
  ordinal: null,
};

/* ───────────────────────────── Periodicidades ───────────────────────────── */

/**
 * As periodicidades que o formulário oferece. A escolha é sempre desta lista —
 * não há campo livre de "de quantas em quantas": quem faz manutenção pensa em
 * "trimestral", não em "MONTHLY com intervalo 3".
 *
 * Por baixo continua a ser uma RRULE (frequência + intervalo), que é o que a
 * base guarda e expande. Acrescentar uma periodicidade é acrescentar uma linha
 * aqui; a base já sabe expandir qualquer intervalo.
 */
export const PERIODICIDADES = [
  { chave: "diaria", nome: "Diária", frequencia: "DAILY", intervalo: 1 },
  { chave: "semanal", nome: "Semanal", frequencia: "WEEKLY", intervalo: 1 },
  { chave: "quinzenal", nome: "Quinzenal (de 2 em 2 semanas)", frequencia: "WEEKLY", intervalo: 2 },
  { chave: "mensal", nome: "Mensal", frequencia: "MONTHLY", intervalo: 1 },
  { chave: "bimestral", nome: "Bimestral (de 2 em 2 meses)", frequencia: "MONTHLY", intervalo: 2 },
  { chave: "trimestral", nome: "Trimestral (de 3 em 3 meses)", frequencia: "MONTHLY", intervalo: 3 },
  { chave: "quadrimestral", nome: "Quadrimestral (de 4 em 4 meses)", frequencia: "MONTHLY", intervalo: 4 },
  { chave: "semestral", nome: "Semestral (de 6 em 6 meses)", frequencia: "MONTHLY", intervalo: 6 },
  { chave: "anual", nome: "Anual", frequencia: "YEARLY", intervalo: 1 },
  { chave: "bienal", nome: "Bienal (de 2 em 2 anos)", frequencia: "YEARLY", intervalo: 2 },
  { chave: "trienal", nome: "Trienal (de 3 em 3 anos)", frequencia: "YEARLY", intervalo: 3 },
  { chave: "quinquenal", nome: "Quinquenal (de 5 em 5 anos)", frequencia: "YEARLY", intervalo: 5 },
] as const satisfies ReadonlyArray<{
  chave: string;
  nome: string;
  frequencia: Frequencia;
  intervalo: number;
}>;

export type ChavePeriodicidade = (typeof PERIODICIDADES)[number]["chave"];

/** A periodicidade da lista que corresponde à regra, ou `null` se não houver. */
export function periodicidadeDe(r: Recorrencia): ChavePeriodicidade | null {
  return (
    PERIODICIDADES.find((p) => p.frequencia === r.frequencia && p.intervalo === r.intervalo)
      ?.chave ?? null
  );
}

/**
 * O nome curto da periodicidade: "Trimestral (de 3 em 3 meses)", ou, para uma
 * regra antiga fora da lista, "De 3 em 3 dias".
 */
export function nomeDaPeriodicidade(r: Recorrencia): string {
  const chave = periodicidadeDe(r);
  if (chave) return PERIODICIDADES.find((p) => p.chave === chave)!.nome;
  const plural = { DAILY: "dias", WEEKLY: "semanas", MONTHLY: "meses", YEARLY: "anos" }[r.frequencia];
  return `De ${r.intervalo} em ${r.intervalo} ${plural}`;
}

/**
 * Muda a periodicidade, ajustando o resto ao que a nova frequência usa.
 *
 * As anuais (anual, bienal, …) repetem-se na DATA DE INÍCIO do plano: um
 * "dia do mês" sem mês não quer dizer nada numa regra anual.
 */
export function comPeriodicidade(r: Recorrencia, chave: ChavePeriodicidade): Recorrencia {
  const p = PERIODICIDADES.find((x) => x.chave === chave);
  if (!p) return r;
  const base = { ...r, frequencia: p.frequencia, intervalo: p.intervalo };

  if (p.frequencia === "DAILY") return { ...base, dias: [], diaDoMes: null, ordinal: null };
  if (p.frequencia === "YEARLY") return { ...base, dias: [], diaDoMes: null, ordinal: null };
  if (p.frequencia === "WEEKLY") {
    return { ...base, dias: r.frequencia === "WEEKLY" ? r.dias : [], diaDoMes: null, ordinal: null };
  }
  // MONTHLY: mantém o que já havia de mensal; senão, dia 1.
  if (r.frequencia === "MONTHLY") return base;
  return { ...base, dias: [], diaDoMes: 1, ordinal: null };
}

/* ─────────────────────────── Escrever a RRULE ─────────────────────────── */

export function paraRRule(r: Recorrencia): string {
  const partes = [`FREQ=${r.frequencia}`];
  if (r.intervalo > 1) partes.push(`INTERVAL=${r.intervalo}`);

  if (r.frequencia === "WEEKLY" && r.dias.length > 0) {
    partes.push(`BYDAY=${r.dias.join(",")}`);
  }

  if (r.frequencia === "MONTHLY" || r.frequencia === "YEARLY") {
    if (r.ordinal != null && r.dias.length > 0) {
      // "Primeira segunda-feira": um ordinal e um dia só.
      partes.push(`BYDAY=${r.ordinal}${r.dias[0]}`);
    } else if (r.diaDoMes != null) {
      partes.push(`BYMONTHDAY=${r.diaDoMes}`);
    }
  }

  return partes.join(";");
}

/* ─────────────────────────────── Ler a RRULE ──────────────────────────── */

/**
 * O contrário. Devolve `null` para uma regra que o expansor da base não
 * suporta — melhor não abrir o formulário do que abri-lo a mostrar outra
 * coisa e gravar por cima do que lá estava.
 */
export function deRRule(regra: string | null | undefined): Recorrencia | null {
  if (!regra) return null;

  const mapa = new Map<string, string>();
  for (const parte of regra.split(";")) {
    const [k, v] = parte.split("=");
    if (k && v) mapa.set(k.trim().toUpperCase(), v.trim().toUpperCase());
  }

  const freq = mapa.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") {
    return null;
  }

  // O expansor da base recusa estas em voz alta; o formulário faz o mesmo.
  if (mapa.has("BYSETPOS") || mapa.has("BYWEEKNO") || mapa.has("BYYEARDAY")) return null;

  const r: Recorrencia = {
    frequencia: freq,
    intervalo: Math.max(1, Number(mapa.get("INTERVAL") ?? 1) || 1),
    dias: [],
    diaDoMes: null,
    ordinal: null,
  };

  const byday = mapa.get("BYDAY");
  if (byday) {
    const tokens = byday.split(",");
    const ordinais = tokens.map((t) => /^(-?\d+)([A-Z]{2})$/.exec(t)).filter(Boolean);

    if (ordinais.length > 0 && ordinais.length === tokens.length) {
      // Ordinal só faz sentido com um dia: "a primeira segunda e a terceira
      // quarta" existe em iCalendar e não existe no expansor da base.
      if (tokens.length > 1) return null;
      const m = ordinais[0]!;
      r.ordinal = Number(m[1]);
      r.dias = [m[2]!];
    } else if (ordinais.length === 0) {
      r.dias = tokens.filter((t) => DIAS.some((d) => d.chave === t));
      if (r.dias.length !== tokens.length) return null;
    } else {
      return null; // metade com ordinal, metade sem
    }
  }

  const bymonthday = mapa.get("BYMONTHDAY");
  if (bymonthday) {
    if (bymonthday.includes(",")) return null; // vários dias do mês: não suportado
    const n = Number(bymonthday);
    if (!Number.isInteger(n) || n < 1 || n > 31) return null;
    r.diaDoMes = n;
  }

  return r;
}

/* ───────────────────────── Dizer em voz alta ──────────────────────────── */

const ORDINAIS: Record<number, string> = {
  1: "primeira",
  2: "segunda",
  3: "terceira",
  4: "quarta",
  [-1]: "última",
};

/**
 * A frase que aparece por baixo do formulário, e na lista de planos.
 *
 * É a única defesa contra gravar uma regra que faz outra coisa: quem escreve
 * "de 2 em 2 semanas à terça e quinta" lê a frase e vê se bate certo.
 */
export function emPortugues(r: Recorrencia | null): string {
  if (!r) return "Regra não reconhecida";

  // "Todos os meses" mas "Todas as semanas". O género do período muda o
  // artigo, e uma frase mal concordada num ecrã de gestão dá a impressão de
  // que o resto também foi feito à pressa.
  const cada = (plural: string, feminino: boolean) =>
    r.intervalo === 1
      ? `${feminino ? "Todas as" : "Todos os"} ${plural}`
      : `De ${r.intervalo} em ${r.intervalo} ${plural}`;

  if (r.frequencia === "DAILY") return cada("dias", false);

  if (r.frequencia === "WEEKLY") {
    const base = cada("semanas", true);
    if (r.dias.length === 0) return base;
    const nomes = r.dias
      .map((d) => DIAS.find((x) => x.chave === d)?.nome ?? d)
      .join(", ")
      .replace(/,([^,]*)$/, " e$1");
    return `${base}, à ${nomes}`;
  }

  const base = cada(r.frequencia === "MONTHLY" ? "meses" : "anos", false);

  // Numa anual, o mês é o da data de início do plano.
  const doMesDeInicio = r.frequencia === "YEARLY" ? " do mês de início" : "";

  // Anual sem dia: repete-se na data de início do plano.
  if (r.frequencia === "YEARLY" && r.ordinal == null && r.diaDoMes == null) {
    return `${base}, na data de início`;
  }

  if (r.ordinal != null && r.dias.length > 0) {
    const dia = DIAS.find((x) => x.chave === r.dias[0])?.nome ?? r.dias[0];
    const ord = ORDINAIS[r.ordinal] ?? `${r.ordinal}.ª`;
    return `${base}, na ${ord} ${dia}${doMesDeInicio}`;
  }

  if (r.diaDoMes != null) {
    return `${base}, no dia ${r.diaDoMes}${doMesDeInicio}`;
  }

  return base;
}

/** Atalho: da regra guardada direto para a frase. */
export function regraEmPortugues(regra: string | null | undefined): string {
  return emPortugues(deRRule(regra));
}

/** O que falta para a regra poder ser gravada. */
export function faltaNaRecorrencia(r: Recorrencia): string | null {
  if (r.intervalo < 1) return "O intervalo tem de ser pelo menos 1.";
  if (r.frequencia === "WEEKLY" && r.dias.length === 0) {
    return "Escolhe pelo menos um dia da semana.";
  }
  if ((r.frequencia === "MONTHLY" || r.frequencia === "YEARLY") && r.ordinal != null) {
    if (r.dias.length === 0) return "Escolhe o dia da semana.";
  }
  // Anual sem dia é válido: repete-se na data de início.
  if (
    r.frequencia === "MONTHLY" &&
    r.ordinal == null &&
    (r.diaDoMes == null || r.diaDoMes < 1 || r.diaDoMes > 31)
  ) {
    return "O dia do mês tem de estar entre 1 e 31.";
  }
  return null;
}

/**
 * Um aviso, não um erro.
 *
 * O dia 31 salta nos meses que não o têm — o expansor da base faz isso de
 * propósito, porque escorregar para o dia 1 do mês seguinte seria pior. Mas
 * quem escolhe 31 raramente sabe disso, e é melhor dizer-lho.
 */
export function avisoDaRecorrencia(r: Recorrencia): string | null {
  if (r.frequencia === "MONTHLY" && r.diaDoMes != null && r.diaDoMes > 28) {
    return `Nos meses sem dia ${r.diaDoMes}, não é gerada ordem nenhuma — em vez de escorregar para o mês seguinte.`;
  }
  return null;
}
