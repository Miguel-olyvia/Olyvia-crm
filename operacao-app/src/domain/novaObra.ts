/**
 * Nova obra, passo 2 — "Serviços do contrato". Regras puras (sem base de
 * dados): passar da pré-visualização da base (rpc_ops_obra_previsao_contrato)
 * para um estado editável, editar, somar tempos, ver materiais contra o
 * stock, e montar o `p_tarefas` de rpc_ops_obra_criar.
 *
 * Quem manda é a base: valida tudo outra vez (pessoas da organização, fases
 * 1..9, minutos > 0, linhas do orçamento, ciclos). Aqui é só para o ecrã
 * responder já.
 */

/* ───────────────────────────── O que vem da base ───────────────────────────── */

export type OrigemMaterial = "ficha" | "contrato" | "stock";

/**
 * Um material do CRM ligado a uma tarefa (ops_obra_tarefa.materiais_crm).
 * Compatível com o `MaterialLigado` de src/lib/stock.ts (MateriaisStock):
 * {produto_id, nome, quantidade, unidade, disponivel} — `origem` é extra.
 */
export interface MaterialLigado {
  produto_id: string | null;
  nome: string;
  quantidade: number | null;
  unidade?: string | null;
  /** Retrato do disponível (stock − reservas) quando foi ligado. Não é reserva. */
  disponivel?: number | null;
  origem: OrigemMaterial;
}

export interface TarefaPrevistaContrato {
  /** Só vale dentro desta resposta (a obra simulada é desfeita). */
  id: string;
  ordem: number;
  linha_id: string | null;
  servico_id: string | null;
  servico_tarefa_id: string | null;
  do_tipo: boolean;
  nome: string;
  fase: number;
  minutos: number;
  pessoas_previstas: number;
  skill_id: string | null;
  skill_nome: string | null;
  /** Ids (desta resposta) das tarefas de que depende. */
  depende: string[];
  procedimento: string | null;
  materiais: string | null;
  ferramentas: string | null;
  materiais_crm: MaterialLigado[];
  /** Planeamento automático (db/obras.sql, 2c) — passam de ida e volta. */
  chave_passo?: string | null;
  espera_antes_horas?: number | null;
  medida?: string | null;
  medida_qt?: number | null;
  minutos_origem?: string | null;
  ritmo_n?: number | null;
  fatores?: Record<string, string> | null;
  fatores_chave?: string | null;
  minutos_juntos?: number | null;
  inicio: string | null;
  fim: string | null;
  pessoas: string[];
  /** Quem está livre nos dias da tarefa (sem ≥ 8 h noutras obras nem ordens). */
  livres: string[];
  /** Quem não está, e porquê ("ausência: Férias", "feriado: …", "agenda cheia: OB-…"). */
  ocupados?: Ocupado[];
}

export interface Ocupado {
  utilizador_id: string;
  motivo: string | null;
}

export interface ServicoContrato {
  linha_id: string;
  servico_id: string;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  quantidade: number;
  unidade: string | null;
  /** Sem modelo: as tarefas vieram da biblioteca, agora (não gravadas). */
  sugerido: boolean;
  com_modelo: boolean;
  sem_ficha: boolean;
  /** Os materiais da ficha técnica × quantidade. */
  materiais_ficha: MaterialLigado[];
  tarefas: TarefaPrevistaContrato[];
}

export interface PrevisaoContrato {
  orcamento_id: string | null;
  inicio: string | null;
  servicos: ServicoContrato[];
  /** Produtos vendidos no contrato (linhas com produto). */
  produtos: (MaterialLigado & { linha_id: string })[];
  /** As tarefas do tipo de obra (arranque, proteção, limpeza, entrega). */
  outras: TarefaPrevistaContrato[];
  minutos: number;
}

export interface ProdutoStock {
  produto_id: string;
  nome: string;
  sku: string | null;
  unidade: string | null;
  gere_stock: boolean | null;
  /** null = não há inventário nesta base. */
  stock: number | null;
  reservado: number;
  disponivel: number | null;
}

/** Um elemento de `p_tarefas` (ver ops_obra_validar_tarefas em db/obras.sql). */
export interface TarefaParaCriar {
  nome: string;
  fase: number;
  minutos: number;
  pessoas_previstas: number;
  pessoas: string[];
  skill_id: string | null;
  skill_nome: string | null;
  orcamento_linha_id: string | null;
  servico_id: string | null;
  servico_tarefa_id: string | null;
  /** Posições (1..n) de outras tarefas desta lista. */
  depende: number[];
  procedimento: string | null;
  materiais: string | null;
  ferramentas: string | null;
  materiais_crm: MaterialLigado[];
  /** Planeamento automático (db/obras.sql, 2c) — passam de ida e volta. */
  chave_passo?: string | null;
  espera_antes_horas?: number | null;
  medida?: string | null;
  medida_qt?: number | null;
  minutos_origem?: string | null;
  ritmo_n?: number | null;
  fatores?: Record<string, string> | null;
  fatores_chave?: string | null;
  minutos_juntos?: number | null;
}

/* ───────────────────────────── O estado do ecrã ───────────────────────────── */

export interface TarefaEditavel {
  /** O id da pré-visualização, ou "nova-N" para as acrescentadas. */
  chave: string;
  linha_id: string | null;
  servico_id: string | null;
  servico_tarefa_id: string | null;
  nome: string;
  fase: number;
  minutos: number;
  pessoas_previstas: number;
  /** Quem a faz: vem preenchido com a sugestão automática. */
  pessoas: string[];
  /** true depois de o gestor mexer nas pessoas: "Recalcular" já não as troca. */
  pessoas_manuais: boolean;
  skill_id: string | null;
  skill_nome: string | null;
  /** Chaves das tarefas de que depende ("depois de"). */
  depende: string[];
  procedimento: string;
  materiais: string;
  ferramentas: string;
  materiais_crm: MaterialLigado[];
  /** Planeamento automático (db/obras.sql, 2c) — passam de ida e volta. */
  chave_passo?: string | null;
  espera_antes_horas?: number | null;
  medida?: string | null;
  medida_qt?: number | null;
  minutos_origem?: string | null;
  ritmo_n?: number | null;
  fatores?: Record<string, string> | null;
  fatores_chave?: string | null;
  minutos_juntos?: number | null;
  inicio: string | null;
  fim: string | null;
  /** null = ainda não se sabe (tarefa nova antes de recalcular): mostra toda a gente. */
  livres: string[] | null;
  ocupados: Ocupado[];
}

export interface ServicoEditavel {
  linha_id: string;
  servico_id: string;
  nome: string;
  quantidade: number;
  unidade: string | null;
  sugerido: boolean;
  com_modelo: boolean;
  sem_ficha: boolean;
  materiais_ficha: MaterialLigado[];
  tarefas: TarefaEditavel[];
}

const n = (x: unknown, d = 0): number => {
  const v = Number(x);
  return Number.isFinite(v) ? v : d;
};

function editavel(t: TarefaPrevistaContrato): TarefaEditavel {
  return {
    chave: t.id,
    linha_id: t.linha_id,
    servico_id: t.servico_id,
    servico_tarefa_id: t.servico_tarefa_id,
    nome: t.nome,
    fase: n(t.fase, 3),
    minutos: Math.max(1, Math.round(n(t.minutos, 60))),
    pessoas_previstas: Math.max(1, n(t.pessoas_previstas, 1)),
    pessoas: [...(t.pessoas ?? [])],
    pessoas_manuais: false,
    skill_id: t.skill_id,
    skill_nome: t.skill_nome,
    depende: [...(t.depende ?? [])],
    procedimento: t.procedimento ?? "",
    materiais: t.materiais ?? "",
    ferramentas: t.ferramentas ?? "",
    materiais_crm: (t.materiais_crm ?? []).map((m) => ({ ...m, quantidade: m.quantidade == null ? null : n(m.quantidade) })),
    chave_passo: t.chave_passo ?? null,
    espera_antes_horas: t.espera_antes_horas == null ? 0 : n(t.espera_antes_horas),
    medida: t.medida ?? null,
    medida_qt: t.medida_qt == null ? null : n(t.medida_qt),
    minutos_origem: t.minutos_origem ?? null,
    ritmo_n: n(t.ritmo_n, 0),
    fatores: t.fatores ?? {},
    fatores_chave: t.fatores_chave ?? "",
    minutos_juntos: n(t.minutos_juntos, 0),
    inicio: t.inicio,
    fim: t.fim,
    livres: t.livres ?? null,
    ocupados: t.ocupados ?? [],
  };
}

/**
 * A tarefa "principal" de um serviço, onde vão os materiais da ficha: a que
 * já traz o texto dos materiais (a biblioteca põe-nos no passo principal),
 * senão a mais comprida.
 */
export function tarefaPrincipal(tarefas: readonly TarefaEditavel[]): TarefaEditavel | null {
  if (tarefas.length === 0) return null;
  const comTexto = tarefas.find((t) => t.materiais.trim());
  if (comTexto) return comTexto;
  return tarefas.reduce((a, t) => (t.minutos > a.minutos ? t : a), tarefas[0]);
}

/** Da pré-visualização para o estado editável, com os materiais da ficha já sugeridos. */
export function servicosEditaveis(p: PrevisaoContrato): ServicoEditavel[] {
  return (p.servicos ?? []).map((s) => {
    const tarefas = (s.tarefas ?? []).map(editavel);
    const ficha = (s.materiais_ficha ?? []).map((m) => ({
      ...m,
      quantidade: m.quantidade == null ? null : n(m.quantidade),
      origem: "ficha" as const,
    }));
    // Sugestão automática: os materiais da ficha × qt, na tarefa principal.
    if (ficha.length && !tarefas.some((t) => t.materiais_crm.length)) {
      const principal = tarefaPrincipal(tarefas);
      if (principal) principal.materiais_crm = ficha.map((m) => ({ ...m }));
    }
    return {
      linha_id: s.linha_id,
      servico_id: s.servico_id,
      nome: s.nome,
      quantidade: n(s.quantidade, 1),
      unidade: s.unidade,
      sugerido: !!s.sugerido,
      com_modelo: !!s.com_modelo,
      sem_ficha: !!s.sem_ficha,
      materiais_ficha: ficha,
      tarefas,
    };
  });
}

export const minutosDoServico = (s: ServicoEditavel): number => s.tarefas.reduce((a, t) => a + (t.minutos || 0), 0);

export const minutosTotais = (servicos: readonly ServicoEditavel[]): number =>
  servicos.reduce((a, s) => a + minutosDoServico(s), 0);

/** Todas as tarefas, pela ordem em que vão para a base. */
export const todasAsTarefas = (servicos: readonly ServicoEditavel[]): TarefaEditavel[] =>
  servicos.flatMap((s) => s.tarefas);

let contador = 0;

/** Uma tarefa nova no serviço (fase da última, 60 min, 1 pessoa, sem ninguém escolhido). */
export function novaTarefa(s: ServicoEditavel): TarefaEditavel {
  contador += 1;
  const ultima = s.tarefas[s.tarefas.length - 1];
  return {
    chave: `nova-${Date.now().toString(36)}-${contador}`,
    linha_id: s.linha_id,
    servico_id: s.servico_id,
    servico_tarefa_id: null,
    nome: `${s.nome}: `,
    fase: ultima?.fase ?? 3,
    minutos: 60,
    pessoas_previstas: 1,
    pessoas: [],
    pessoas_manuais: false,
    skill_id: ultima?.skill_id ?? null,
    skill_nome: ultima?.skill_nome ?? null,
    depende: ultima ? [ultima.chave] : [],
    procedimento: "",
    materiais: "",
    ferramentas: "",
    materiais_crm: [],
    espera_antes_horas: 0,
    minutos_origem: "manual",
    inicio: null,
    fim: null,
    livres: null,
    ocupados: [],
  };
}

/** Tira uma tarefa e as referências a ela nos "depois de" das outras. */
export function removerTarefa(servicos: readonly ServicoEditavel[], chave: string): ServicoEditavel[] {
  return servicos.map((s) => ({
    ...s,
    tarefas: s.tarefas
      .filter((t) => t.chave !== chave)
      .map((t) => (t.depende.includes(chave) ? { ...t, depende: t.depende.filter((d) => d !== chave) } : t)),
  }));
}

/** Muda uma tarefa (pela chave). */
export function mudarTarefa(
  servicos: readonly ServicoEditavel[],
  chave: string,
  mudar: (t: TarefaEditavel) => TarefaEditavel
): ServicoEditavel[] {
  return servicos.map((s) => ({ ...s, tarefas: s.tarefas.map((t) => (t.chave === chave ? mudar(t) : t)) }));
}

/** O que está mal, para o botão "Abrir obra" dizer porquê. null = pronto. */
export function problemaNoPasso2(servicos: readonly ServicoEditavel[]): string | null {
  for (const t of todasAsTarefas(servicos)) {
    const nome = t.nome.trim();
    if (!nome) return "Há uma tarefa sem nome.";
    if (!Number.isInteger(t.fase) || t.fase < 1 || t.fase > 9) return `"${nome}": a fase tem de ser de 1 a 9.`;
    if (!Number.isFinite(t.minutos) || t.minutos <= 0) return `"${nome}": os minutos têm de ser maiores que 0.`;
    if (t.pessoas_previstas < 1 || t.pessoas_previstas > 20) return `"${nome}": de 1 a 20 pessoas.`;
    if (t.materiais_crm.some((m) => m.quantidade != null && (!Number.isFinite(m.quantidade) || m.quantidade < 0)))
      return `"${nome}": há uma quantidade de material inválida.`;
  }
  if (temCiclo(servicos)) return "As dependências (\"depois de\") fecham um ciclo.";
  return null;
}

/** Há um ciclo nos "depois de"? (A depois de B depois de A.) */
export function temCiclo(servicos: readonly ServicoEditavel[]): boolean {
  const tarefas = todasAsTarefas(servicos);
  const deps = new Map(tarefas.map((t) => [t.chave, t.depende]));
  const estado = new Map<string, 1 | 2>();
  const visitar = (k: string): boolean => {
    const e = estado.get(k);
    if (e === 1) return true;
    if (e === 2) return false;
    estado.set(k, 1);
    for (const d of deps.get(k) ?? []) if (deps.has(d) && visitar(d)) return true;
    estado.set(k, 2);
    return false;
  };
  return tarefas.some((t) => visitar(t.chave));
}

const texto = (s: string): string | null => (s.trim() ? s.trim() : null);

/**
 * O `p_tarefas` para rpc_ops_obra_criar: as tarefas pela ordem, com os
 * "depois de" convertidos em posições (os que apontam para fora da lista —
 * as tarefas do tipo de obra — caem: essas ligações faz a base sozinha).
 */
export function paraCriar(
  servicos: readonly ServicoEditavel[],
  stock?: ReadonlyMap<string, ProdutoStock> | null
): TarefaParaCriar[] {
  const tarefas = todasAsTarefas(servicos);
  const pos = new Map(tarefas.map((t, i) => [t.chave, i + 1]));
  return tarefas.map((t) => {
    const pessoas = [...new Set(t.pessoas)];
    return {
      nome: t.nome.trim(),
      fase: t.fase,
      minutos: Math.max(1, Math.round(t.minutos)),
      pessoas_previstas: Math.min(20, Math.max(t.pessoas_previstas, pessoas.length, 1)),
      pessoas,
      skill_id: t.skill_id,
      skill_nome: t.skill_id ? null : t.skill_nome,
      orcamento_linha_id: t.linha_id,
      servico_id: t.servico_id,
      servico_tarefa_id: t.servico_tarefa_id,
      depende: [...new Set(t.depende.map((d) => pos.get(d)).filter((p): p is number => p != null))],
      procedimento: texto(t.procedimento),
      materiais: texto(t.materiais),
      ferramentas: texto(t.ferramentas),
      materiais_crm: t.materiais_crm
        .filter((m) => m.nome.trim())
        .map((m) => ({
          produto_id: m.produto_id,
          nome: m.nome.trim(),
          quantidade: m.quantidade == null ? null : Math.round(m.quantidade * 10000) / 10000,
          unidade: m.unidade ?? (m.produto_id ? stock?.get(m.produto_id)?.unidade : null) ?? null,
          disponivel: (m.produto_id ? stock?.get(m.produto_id)?.disponivel : undefined) ?? m.disponivel ?? null,
          origem: m.origem,
        })),
      chave_passo: t.chave_passo ?? null,
      espera_antes_horas: t.espera_antes_horas ?? 0,
      medida: t.medida ?? null,
      medida_qt: t.medida_qt ?? null,
      minutos_origem: t.minutos_origem ?? null,
      ritmo_n: t.ritmo_n ?? 0,
      fatores: t.fatores ?? {},
      fatores_chave: t.fatores_chave ?? "",
      minutos_juntos: t.minutos_juntos ?? 0,
    };
  });
}

/** Mudar os minutos à mão: a origem do tempo passa a "mudado à mão" (a aprendizagem continua a contar o real). */
export function mudarMinutos(t: TarefaEditavel, minutos: number): TarefaEditavel {
  return { ...t, minutos, minutos_origem: minutos === t.minutos ? t.minutos_origem : "manual" };
}

/**
 * Depois de "Recalcular" (a mesma pré-visualização com `p_tarefas`): as
 * tarefas voltam com ordem = 1000 + posição. Atualiza datas e quem está
 * livre; as pessoas só mudam onde o gestor não mexeu.
 */
export function aplicarRecalculo(servicos: readonly ServicoEditavel[], p: PrevisaoContrato): ServicoEditavel[] {
  const porPos = new Map<number, TarefaPrevistaContrato>();
  for (const t of [...(p.servicos ?? []).flatMap((s) => s.tarefas ?? []), ...(p.outras ?? [])]) {
    if (t.ordem > 1000) porPos.set(t.ordem - 1000, t);
  }
  let i = 0;
  return servicos.map((s) => ({
    ...s,
    tarefas: s.tarefas.map((t) => {
      i += 1;
      const r = porPos.get(i);
      if (!r) return t;
      return {
        ...t,
        inicio: r.inicio,
        fim: r.fim,
        livres: r.livres ?? null,
        ocupados: r.ocupados ?? [],
        pessoas: t.pessoas_manuais ? t.pessoas : [...(r.pessoas ?? [])],
      };
    }),
  }));
}

/* ───────────────────────────── Materiais e stock ───────────────────────────── */

export interface NecessidadeMaterial {
  produto_id: string;
  nome: string;
  unidade: string | null;
  quantidade: number;
  /** Em quantas tarefas aparece. */
  tarefas: number;
}

/** O total de cada produto pedido nas tarefas (só os que têm produto do CRM). */
export function necessidadesDeMateriais(servicos: readonly ServicoEditavel[]): NecessidadeMaterial[] {
  const m = new Map<string, NecessidadeMaterial>();
  for (const t of todasAsTarefas(servicos)) {
    for (const x of t.materiais_crm) {
      if (!x.produto_id) continue;
      const a = m.get(x.produto_id) ?? {
        produto_id: x.produto_id,
        nome: x.nome,
        unidade: x.unidade ?? null,
        quantidade: 0,
        tarefas: 0,
      };
      a.quantidade += x.quantidade ?? 0;
      a.tarefas += 1;
      m.set(x.produto_id, a);
    }
  }
  return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
}

export type EstadoStock =
  | { tipo: "sem_inventario" }
  | { tipo: "sem_registo" }
  | { tipo: "chega"; disponivel: number }
  | { tipo: "falta"; disponivel: number; falta: number };

/** Chega o stock disponível (stock − reservas) para o que é preciso? */
export function estadoDoStock(necessario: number, s: ProdutoStock | undefined, comInventario: boolean): EstadoStock {
  if (!comInventario) return { tipo: "sem_inventario" };
  if (!s || s.disponivel == null) return { tipo: "sem_registo" };
  const disp = s.disponivel;
  if (necessario <= disp) return { tipo: "chega", disponivel: disp };
  return { tipo: "falta", disponivel: disp, falta: Math.round((necessario - Math.max(disp, 0)) * 100) / 100 };
}

/** Os produtos de que vale a pena saber o stock: os ligados, os da ficha e os do contrato. */
export function produtosParaStock(servicos: readonly ServicoEditavel[], p: PrevisaoContrato | null): string[] {
  const ids = new Set<string>();
  for (const s of servicos) {
    for (const m of s.materiais_ficha) if (m.produto_id) ids.add(m.produto_id);
    for (const t of s.tarefas) for (const m of t.materiais_crm) if (m.produto_id) ids.add(m.produto_id);
  }
  for (const m of p?.produtos ?? []) if (m.produto_id) ids.add(m.produto_id);
  return [...ids];
}

/** Junta (ou soma) um material numa tarefa. */
export function ligarMaterial(t: TarefaEditavel, m: MaterialLigado): TarefaEditavel {
  const i = m.produto_id ? t.materiais_crm.findIndex((x) => x.produto_id === m.produto_id) : -1;
  if (i >= 0) {
    const atual = t.materiais_crm[i];
    const soma = (atual.quantidade ?? 0) + (m.quantidade ?? 0);
    const lista = [...t.materiais_crm];
    lista[i] = { ...atual, quantidade: soma };
    return { ...t, materiais_crm: lista };
  }
  return { ...t, materiais_crm: [...t.materiais_crm, { ...m }] };
}
