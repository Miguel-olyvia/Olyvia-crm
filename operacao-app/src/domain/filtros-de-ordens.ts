/**
 * Estreitar uma lista de ordens, em funções puras.
 *
 * A lista tinha seis vistas guardadas e mais nada. Numa operação com setenta
 * ordens abertas isso chega; com setecentas, "Abertas" é o mesmo que não ter
 * filtro nenhum — e as perguntas que se fazem em frente a essa lista são
 * sempre as mesmas quatro:
 *
 *     "o que é MEU?"          · "o que é deste CLIENTE?"
 *     "o que é URGENTE?"      · "o que são AVARIAS, e não preventivas?"
 *
 * A agenda já tinha estes filtros; a lista, que é onde se passa mais tempo,
 * não tinha nenhum.
 *
 * Puro de propósito: nada aqui sabe o que é React nem o que é uma base de
 * dados. Ordenar e contar são coisas que se provam com uma lista na mão.
 */

/** O que a lista precisa de saber de uma ordem para a filtrar e ordenar. */
export interface OrdemFiltravel {
  id: string;
  codigo: string;
  titulo: string;
  estado: string;
  origem: string;
  prioridade: string;
  cliente_id: string;
  local_id: string | null;
  responsavel_id: string | null;
  agendada_para: string | null;
  criada_em: string;
}

export interface Filtro {
  /** O id de quem é responsável. `"ninguem"` = as que não têm dono. */
  responsavelId?: string | null;
  clienteId?: string | null;
  prioridade?: string | null;
  origem?: string | null;
  /** Procura em código, título e nome do cliente. */
  texto?: string;
}

export const FILTRO_VAZIO: Filtro = {};

/** Se este filtro estreita alguma coisa. Um filtro vazio não se anuncia. */
export function temFiltro(f: Filtro): boolean {
  return Boolean(
    f.responsavelId || f.clienteId || f.prioridade || f.origem || f.texto?.trim()
  );
}

/** Quantas condições estão ligadas. É o número que aparece no botão. */
export function quantosFiltros(f: Filtro): number {
  return [f.responsavelId, f.clienteId, f.prioridade, f.origem, f.texto?.trim()].filter(
    Boolean
  ).length;
}

/**
 * A lista estreitada.
 *
 * `nomeDoCliente` entra por fora porque o nome vive noutra tabela: quem chama
 * já o tem no ecrã, e ir buscá-lo aqui obrigaria esta função a saber o que é
 * uma base de dados.
 */
export function aplicarFiltro<T extends OrdemFiltravel>(
  ordens: readonly T[],
  f: Filtro,
  nomeDoCliente: (id: string) => string | null = () => null
): T[] {
  const texto = (f.texto ?? "").trim().toLowerCase();

  return ordens.filter((o) => {
    // "ninguem" é uma resposta legítima, e não a ausência de filtro: uma
    // ordem marcada e sem dono é exatamente o que se vai procurar.
    if (f.responsavelId === "ninguem") {
      if (o.responsavel_id) return false;
    } else if (f.responsavelId && o.responsavel_id !== f.responsavelId) {
      return false;
    }

    if (f.clienteId && o.cliente_id !== f.clienteId) return false;
    if (f.prioridade && o.prioridade !== f.prioridade) return false;
    if (f.origem && o.origem !== f.origem) return false;

    if (texto) {
      const onde = [o.codigo, o.titulo, nomeDoCliente(o.cliente_id) ?? ""]
        .join(" ")
        .toLowerCase();
      if (!onde.includes(texto)) return false;
    }
    return true;
  });
}

export type Ordenacao = "data" | "prioridade" | "recentes";

export const ORDENACOES: { valor: Ordenacao; nome: string; porque: string }[] = [
  { valor: "data", nome: "Por data", porque: "O que está marcado para mais cedo primeiro." },
  { valor: "prioridade", nome: "Por prioridade", porque: "Urgente em cima, e depois por data." },
  { valor: "recentes", nome: "Mais recentes", porque: "A última a nascer em cima." },
];

const PESO_PRIORIDADE: Record<string, number> = {
  urgente: 0,
  alta: 1,
  normal: 2,
  baixa: 3,
};

/**
 * Ordenar sem nunca deixar a lista saltar.
 *
 * O desempate final é sempre o código: sem ele, duas ordens com a mesma data
 * trocam de lugar entre visitas — e uma lista que salta é uma lista que
 * ninguém segue com os olhos.
 *
 * Uma ordem sem data vai para o fim, e não para o princípio. `null` a ordenar
 * como zero punha o que não está marcado à frente do que está marcado para
 * hoje, que é o contrário do que se quer ver.
 */
export function ordenar<T extends OrdemFiltravel>(
  ordens: readonly T[],
  como: Ordenacao
): T[] {
  const quando = (o: T) =>
    o.agendada_para ? new Date(o.agendada_para).getTime() : Number.POSITIVE_INFINITY;

  return [...ordens].sort((a, b) => {
    if (como === "recentes") {
      const d = new Date(b.criada_em).getTime() - new Date(a.criada_em).getTime();
      if (d !== 0) return d;
    } else if (como === "prioridade") {
      const p =
        (PESO_PRIORIDADE[a.prioridade] ?? 9) - (PESO_PRIORIDADE[b.prioridade] ?? 9);
      if (p !== 0) return p;
      const d = quando(a) - quando(b);
      if (d !== 0) return d;
    } else {
      const d = quando(a) - quando(b);
      if (d !== 0) return d;
    }
    return a.codigo.localeCompare(b.codigo, "pt");
  });
}
