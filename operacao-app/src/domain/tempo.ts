/**
 * Tempo trabalhado e custo de mão de obra.
 *
 * É a peça que falta no Infraspeak. Lá, o "tempo de execução" é um cronómetro
 * que arranca quando a ordem começa e só pára no fecho — noites, fins de
 * semana e férias incluídos. Numa ordem em curso da instância observada estava
 * `5303:05:34`. Com um número desses não se custeia nada, e por isso o custo
 * de mão de obra aparece a 0,00 € em todas as ordens.
 *
 * Aqui o tempo é a soma de sessões reais: alguém começou, alguém parou.
 */

export interface Sessao {
  inicio: Date;
  fim: Date | null;
  utilizadorId: string;
}

/** Duração de uma sessão em segundos. Uma sessão aberta conta até agora. */
export function duracaoSegundos(s: Sessao, agora: Date = new Date()): number {
  const fim = s.fim ?? agora;
  return Math.max(0, Math.floor((fim.getTime() - s.inicio.getTime()) / 1000));
}

/** Tempo total trabalhado numa ordem, somando todas as sessões. */
export function tempoTotalSegundos(
  sessoes: readonly Sessao[],
  agora: Date = new Date()
): number {
  return sessoes.reduce((total, s) => total + duracaoSegundos(s, agora), 0);
}

/** Tempo por pessoa — é assim que o custo se reparte. */
export function tempoPorUtilizador(
  sessoes: readonly Sessao[],
  agora: Date = new Date()
): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const s of sessoes) {
    const atual = mapa.get(s.utilizadorId) ?? 0;
    mapa.set(s.utilizadorId, atual + duracaoSegundos(s, agora));
  }
  return mapa;
}

/**
 * Custo de mão de obra: tempo de cada pessoa × custo/hora dessa pessoa.
 *
 * Quem não tem custo/hora definido conta 0 e não rebenta o total — mas o
 * chamador consegue saber quantos ficaram de fora, para o poder dizer no ecrã
 * em vez de apresentar um total silenciosamente errado.
 */
export function custoMaoObra(
  sessoes: readonly Sessao[],
  custoHoraPorUtilizador: ReadonlyMap<string, number | null>,
  agora: Date = new Date()
): { total: number; semCustoHora: string[] } {
  const porPessoa = tempoPorUtilizador(sessoes, agora);
  const semCustoHora: string[] = [];
  let total = 0;

  for (const [utilizadorId, segundos] of porPessoa) {
    const custoHora = custoHoraPorUtilizador.get(utilizadorId);
    if (custoHora == null) {
      if (segundos > 0) semCustoHora.push(utilizadorId);
      continue;
    }
    total += (segundos / 3600) * custoHora;
  }

  // Duas casas decimais, arredondadas uma só vez no fim.
  return { total: Math.round(total * 100) / 100, semCustoHora };
}

/**
 * Formata segundos para leitura humana: `2h47m`, `50m`, `12s`.
 * Abaixo de uma hora não mostra "0h" — um "0h 50m" lê-se pior que "50m".
 */
export function formatarDuracao(segundos: number): string {
  if (segundos < 60) return `${Math.max(0, Math.floor(segundos))}s`;
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  if (horas === 0) return `${minutos}m`;
  if (minutos === 0) return `${horas}h`;
  return `${horas}h${String(minutos).padStart(2, "0")}m`;
}

/* ───────────────────── Real contra estimado, por tarefa ───────────────────── */

/**
 * O que se escreve no formulário (minutos, à portuguesa) para o que a base
 * guarda (segundos). Vazio, negativo ou ilegível dá 0 — "sem estimativa" —
 * em vez de um número inventado.
 */
export function minutosParaSegundos(texto: string): number {
  const n = Number(texto.trim().replace(",", "."));
  if (!texto.trim() || !Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 60);
}

/** O inverso, para encher o formulário. 0 fica vazio. */
export function segundosParaMinutos(segundos: number): string {
  if (!segundos || segundos <= 0) return "";
  const m = segundos / 60;
  return Number.isInteger(m) ? String(m) : m.toFixed(1).replace(".", ",");
}

export interface ComparacaoTempo {
  estimado: number;
  real: number;
  /** real − estimado, em segundos. Nulo sem estimativa. */
  desvio: number | null;
  /**
   * `sem_estimativa` — não há contra o que comparar;
   * `dentro`         — até ao estimado, mais a tolerância;
   * `acima`          — passou a tolerância.
   */
  situacao: "sem_estimativa" | "dentro" | "acima";
}

/**
 * Compara o tempo real de uma tarefa com o estimado. A tolerância (10% por
 * omissão) existe porque ninguém faz uma tarefa de 10 minutos em 600
 * segundos certos — e um alarme que toca sempre deixa de ser ouvido.
 */
export function compararTempo(
  estimado: number,
  real: number,
  tolerancia = 0.1
): ComparacaoTempo {
  const r = Math.max(0, Math.floor(real));
  if (!estimado || estimado <= 0) {
    return { estimado: 0, real: r, desvio: null, situacao: "sem_estimativa" };
  }
  return {
    estimado,
    real: r,
    desvio: r - estimado,
    situacao: r <= estimado * (1 + tolerancia) ? "dentro" : "acima",
  };
}

/** Euros em pt-PT: `64,29 €`. */
export function formatarEuros(valor: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(valor);
}
