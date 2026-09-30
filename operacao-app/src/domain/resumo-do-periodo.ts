/**
 * "Como é que correu o mês?", em funções puras.
 *
 * As Análises respondiam a duas perguntas — o PMP cumprido e a história de um
 * equipamento — e a nenhuma das que se faz primeiro. Quem abre um ecrã de
 * análises no dia 1 quer saber, por esta ordem:
 *
 *     quanto trabalho entrou e quanto saiu?
 *     ficou alguma coisa por fazer que devia estar feita?
 *     quanto tempo demorámos?
 *     onde é que se concentrou o trabalho?
 *
 * Nenhuma delas precisa de tabelas novas: as ordens já sabem quando nasceram,
 * quando foram marcadas, quando começaram e quando fecharam. O que faltava era
 * somar.
 *
 * ⚠ Tudo aqui é média e contagem sobre o que **já aconteceu**. Nada disto
 * prevê nada — um ecrã de análises que adivinha é um ecrã em que ninguém
 * acredita à segunda vez.
 */

export interface OrdemDoPeriodo {
  id: string;
  codigo: string;
  estado: string;
  origem: string;
  prioridade: string;
  cliente_id: string;
  local_id: string | null;
  responsavel_id: string | null;
  criada_em: string;
  agendada_para: string | null;
  iniciada_em: string | null;
  fechada_em: string | null;
}

export interface ResumoDoPeriodo {
  /** Nasceram dentro do período. */
  abertas: number;
  /** Fecharam dentro do período — podem ter nascido antes. */
  fechadas: number;
  /** Continuam por fechar, hoje. */
  emAberto: number;
  /** Por fechar e já passaram da data marcada. */
  atrasadas: number;
  /** Fechadas até à data para que estavam marcadas. */
  aHoras: number;
  /** Fechadas depois da data marcada. */
  foraDeHoras: number;
  /** Percentagem das fechadas COM data marcada que fecharam a horas. */
  pontualidade: number | null;
  /** Horas entre nascer e fechar, em média. */
  horasAteFechar: number | null;
  /** Horas entre nascer e começar, em média. É o tempo de resposta. */
  horasAteComecar: number | null;
  /** Quantas por natureza — preventiva, corretiva, obra. */
  porOrigem: Record<string, number>;
  /** Quantas por estado, hoje. */
  porEstado: Record<string, number>;
  /** Quantas marcadas e sem ninguém. */
  semDono: number;
}

const quando = (v: string | null): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const HORA = 3_600_000;

/** A média, ou nada quando não há de quê tirar média. Zero mentiria. */
function media(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

const FECHADAS = ["fechada", "confirmada"];

export function resumoDoPeriodo(
  ordens: readonly OrdemDoPeriodo[],
  de: Date,
  ate: Date,
  agora: Date = new Date()
): ResumoDoPeriodo {
  const dentro = (d: Date | null) => d !== null && d >= de && d <= ate;

  const abertas = ordens.filter((o) => dentro(quando(o.criada_em)));
  const fechadas = ordens.filter(
    (o) => FECHADAS.includes(o.estado) && dentro(quando(o.fechada_em))
  );

  const porFechar = ordens.filter(
    (o) => !FECHADAS.includes(o.estado) && o.estado !== "cancelada"
  );

  const atrasadas = porFechar.filter((o) => {
    const marcada = quando(o.agendada_para);
    return marcada !== null && marcada < agora;
  });

  // Pontualidade só se mede no que tinha data. Uma ordem sem data nunca
  // chegou tarde — nunca teve hora para chegar.
  const comData = fechadas.filter((o) => o.agendada_para && o.fechada_em);
  const aHoras = comData.filter(
    (o) => (quando(o.fechada_em) as Date) <= (quando(o.agendada_para) as Date)
  );

  const duracoes = fechadas
    .map((o) => {
      const n = quando(o.criada_em);
      const f = quando(o.fechada_em);
      return n && f ? (f.getTime() - n.getTime()) / HORA : null;
    })
    .filter((x): x is number => x !== null && x >= 0);

  const respostas = ordens
    .map((o) => {
      const n = quando(o.criada_em);
      const i = quando(o.iniciada_em);
      return n && i && dentro(i) ? (i.getTime() - n.getTime()) / HORA : null;
    })
    .filter((x): x is number => x !== null && x >= 0);

  const contar = (xs: readonly OrdemDoPeriodo[], campo: "origem" | "estado") => {
    const m: Record<string, number> = {};
    for (const o of xs) m[o[campo]] = (m[o[campo]] ?? 0) + 1;
    return m;
  };

  return {
    abertas: abertas.length,
    fechadas: fechadas.length,
    emAberto: porFechar.length,
    atrasadas: atrasadas.length,
    aHoras: aHoras.length,
    foraDeHoras: comData.length - aHoras.length,
    pontualidade:
      comData.length === 0
        ? null
        : Math.round((aHoras.length / comData.length) * 1000) / 10,
    horasAteFechar: media(duracoes),
    horasAteComecar: media(respostas),
    porOrigem: contar(abertas, "origem"),
    porEstado: contar(porFechar, "estado"),
    semDono: porFechar.filter((o) => !o.responsavel_id && o.agendada_para).length,
  };
}

export interface LinhaDeTopo {
  chave: string;
  quantas: number;
  /** Quantas dessas estão por fechar. */
  porFechar: number;
}

/**
 * Onde é que o trabalho se concentrou.
 *
 * Serve para clientes, locais ou pessoas — a chave é a que se der. Devolve o
 * topo por ordem decrescente, e desempata pela chave para a lista não saltar.
 *
 * Ignora as que não têm chave em vez de as juntar num grupo "sem nada": uma
 * barra grande chamada "—" rouba a atenção e não diz nada.
 */
export function topoPor(
  ordens: readonly OrdemDoPeriodo[],
  chaveDe: (o: OrdemDoPeriodo) => string | null,
  quantos = 5
): LinhaDeTopo[] {
  const m = new Map<string, LinhaDeTopo>();

  for (const o of ordens) {
    const k = chaveDe(o);
    if (!k) continue;
    const linha = m.get(k) ?? { chave: k, quantas: 0, porFechar: 0 };
    linha.quantas += 1;
    if (!FECHADAS.includes(o.estado) && o.estado !== "cancelada") linha.porFechar += 1;
    m.set(k, linha);
  }

  return [...m.values()]
    .sort((a, b) => b.quantas - a.quantas || a.chave.localeCompare(b.chave, "pt"))
    .slice(0, quantos);
}

/** "3 h", "2 dias" — a unidade que uma pessoa usaria a falar. */
export function emLinguagem(horas: number | null): string {
  if (horas === null) return "—";
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < 48) return `${Math.round(horas)} h`;
  const dias = horas / 24;
  return `${dias < 10 ? dias.toFixed(1) : Math.round(dias)} dias`;
}
