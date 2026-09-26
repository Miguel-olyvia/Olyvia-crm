/**
 * Somar o que já está gravado, e dizer o que os números querem dizer.
 *
 * Tudo aqui é função pura sobre linhas que a base devolve. Nenhuma destas
 * contas se faz no SQL de propósito: são as contas que mais mudam de
 * definição — "cumprido" quer dizer coisas diferentes conforme o contrato —
 * e mudá-las num ficheiro com testes é mais barato do que numa vista.
 */

/* ──────────────────────── PMP: a promessa cumprida ─────────────────────── */

/** Uma ordem preventiva prevista, como sai de `ops_v_pmp`. */
export interface LinhaPmp {
  ordem_id: string;
  cliente_id: string;
  codigo: string;
  titulo: string;
  estado: string;
  agendada_para: string;
  fechada_em: string | null;
  mes: string;
  cumprida: boolean;
  a_horas: boolean;
  em_atraso: boolean;
}

export interface ResumoPmp {
  previstas: number;
  cumpridas: number;
  aHoras: number;
  emAtraso: number;
  porFazer: number;
  /** Cumpridas sobre previstas, 0–100. É este o número do contrato. */
  percentagem: number;
  /** Das cumpridas, as que foram feitas até ao dia prometido. */
  percentagemAHoras: number;
}

/**
 * A percentagem sozinha mente por omissão: 100 % pode ser trabalho todo feito
 * com três meses de atraso. Por isso vêm as duas.
 *
 * Sem ordens previstas o resultado é 0 %, não 100 %. Um cliente sem
 * manutenção planeada não tem manutenção cumprida — tem um plano por montar,
 * e mostrar-lhe 100 % esconderia exatamente isso.
 */
export function resumoPmp(linhas: readonly LinhaPmp[]): ResumoPmp {
  const previstas = linhas.length;
  const cumpridas = linhas.filter((l) => l.cumprida).length;
  const aHoras = linhas.filter((l) => l.a_horas).length;
  return {
    previstas,
    cumpridas,
    aHoras,
    emAtraso: linhas.filter((l) => l.em_atraso).length,
    porFazer: previstas - cumpridas,
    percentagem: previstas === 0 ? 0 : Math.round((cumpridas / previstas) * 100),
    percentagemAHoras: previstas === 0 ? 0 : Math.round((aHoras / previstas) * 100),
  };
}

export interface GrupoPmp<T> {
  chave: string;
  linhas: T[];
  resumo: ResumoPmp;
}

/** Agrupa por qualquer chave (cliente, mês) e resume cada grupo. */
export function agruparPmp(
  linhas: readonly LinhaPmp[],
  chave: (l: LinhaPmp) => string
): GrupoPmp<LinhaPmp>[] {
  const mapa = new Map<string, LinhaPmp[]>();
  for (const l of linhas) {
    const k = chave(l);
    const lista = mapa.get(k);
    if (lista) lista.push(l);
    else mapa.set(k, [l]);
  }
  return [...mapa.entries()]
    .map(([chave, linhas]) => ({ chave, linhas, resumo: resumoPmp(linhas) }))
    .sort((a, b) => a.chave.localeCompare(b.chave));
}

/**
 * O semáforo do indicador.
 *
 * Os cortes são os que a empresa usa a falar: abaixo de 80 % um contrato de
 * manutenção está em incumprimento visível, entre 80 e 95 % está a escorregar.
 * São valores a discutir com quem assina os contratos, não uma verdade.
 */
export function estadoPmp(percentagem: number): "bom" | "atencao" | "mau" {
  if (percentagem >= 95) return "bom";
  if (percentagem >= 80) return "atencao";
  return "mau";
}

/* ───────────────────────── A vida de um equipamento ────────────────────── */

export interface Intervencao {
  ordem_id: string;
  codigo: string;
  origem: string;
  estado: string;
  titulo: string;
  quando: string;
  nao_conformidades: number;
  tarefas: number;
}

export interface ResumoAtivo {
  visitas: number;
  preventivas: number;
  corretivas: number;
  naoConformidades: number;
  ultimaVisita: string | null;
  /** Dias entre a primeira e a última visita, para dar escala ao resto. */
  diasDeHistorico: number;
}

export function resumoAtivo(intervencoes: readonly Intervencao[]): ResumoAtivo {
  if (intervencoes.length === 0) {
    return {
      visitas: 0,
      preventivas: 0,
      corretivas: 0,
      naoConformidades: 0,
      ultimaVisita: null,
      diasDeHistorico: 0,
    };
  }
  const datas = intervencoes
    .map((i) => Date.parse(i.quando))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);

  return {
    visitas: intervencoes.length,
    preventivas: intervencoes.filter((i) => i.origem === "preventiva").length,
    corretivas: intervencoes.filter((i) => i.origem === "corretiva").length,
    naoConformidades: intervencoes.reduce((s, i) => s + i.nao_conformidades, 0),
    ultimaVisita: datas.length ? new Date(datas[datas.length - 1]).toISOString() : null,
    diasDeHistorico: datas.length
      ? Math.round((datas[datas.length - 1] - datas[0]) / 86400000)
      : 0,
  };
}

/**
 * O sinal de que vale mais substituir do que voltar a reparar.
 *
 * Não é um veredicto — é uma pergunta a fazer a quem decide. Por isso devolve
 * o motivo em palavras, e não um número: "3 corretivas em 12 meses" leva-se a
 * uma reunião, um índice de 0,73 não.
 *
 * O critério: três ou mais avarias num ano. Abaixo disso é uso normal; acima,
 * o equipamento está a pedir para ser trocado.
 */
export function ativoProblematico(
  intervencoes: readonly Intervencao[],
  agora: Date = new Date()
): string | null {
  const limite = agora.getTime() - 365 * 86400000;
  const corretivas = intervencoes.filter(
    (i) => i.origem === "corretiva" && Date.parse(i.quando) >= limite
  ).length;
  if (corretivas >= 3) {
    return `${corretivas} avarias nos últimos 12 meses. Vale a pena ver se compensa substituir.`;
  }
  return null;
}

/* ───────────────────────── A evolução de uma leitura ───────────────────── */

export interface Leitura {
  leitura_id: string;
  medicao_def_id: string;
  nome: string;
  tipo: string;
  unidade: string | null;
  limite_min: number | null;
  limite_max: number | null;
  valor_num: number | null;
  valor_texto: string | null;
  conforme: boolean | null;
  lida_em: string;
  codigo: string;
}

export interface SerieDeLeituras {
  medicaoDefId: string;
  nome: string;
  unidade: string | null;
  limiteMin: number | null;
  limiteMax: number | null;
  /** Da mais antiga para a mais recente — é assim que se lê um gráfico. */
  pontos: Leitura[];
  naoConformes: number;
}

/**
 * Junta as leituras por medição, para se poder ver a mesma coisa ao longo do
 * tempo em vez de uma lista de valores soltos.
 *
 * Só as numéricas: uma série de "Conforme / Não conforme / Conforme" não é
 * uma evolução, é um histórico — e esse já está na lista de intervenções.
 */
export function seriesDeLeituras(leituras: readonly Leitura[]): SerieDeLeituras[] {
  const mapa = new Map<string, Leitura[]>();
  for (const l of leituras) {
    if (l.valor_num == null) continue;
    const lista = mapa.get(l.medicao_def_id);
    if (lista) lista.push(l);
    else mapa.set(l.medicao_def_id, [l]);
  }

  return [...mapa.values()]
    .map((pontos) => {
      const ordenados = [...pontos].sort(
        (a, b) => Date.parse(a.lida_em) - Date.parse(b.lida_em)
      );
      const primeiro = ordenados[0];
      return {
        medicaoDefId: primeiro.medicao_def_id,
        nome: primeiro.nome,
        unidade: primeiro.unidade,
        limiteMin: primeiro.limite_min,
        limiteMax: primeiro.limite_max,
        pontos: ordenados,
        naoConformes: ordenados.filter((p) => p.conforme === false).length,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

/**
 * Para onde é que o valor está a andar.
 *
 * Compara a última leitura com a anterior, e não com a média: quem está a
 * olhar para um extintor quer saber se piorou desde a última vez, não a média
 * dos três anos.
 */
export function paraOndeVai(serie: SerieDeLeituras): "sobe" | "desce" | "igual" | null {
  const n = serie.pontos.length;
  if (n < 2) return null;
  const ultimo = serie.pontos[n - 1].valor_num;
  const anterior = serie.pontos[n - 2].valor_num;
  if (ultimo == null || anterior == null) return null;
  if (ultimo > anterior) return "sobe";
  if (ultimo < anterior) return "desce";
  return "igual";
}
