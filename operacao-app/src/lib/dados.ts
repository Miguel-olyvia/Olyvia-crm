/**
 * Leituras de Operações.
 *
 * Regra desta camada: nunca engolir um erro. Uma falha de RLS ou de rede tem
 * de chegar ao ecrã como texto que alguém possa ler — no Infraspeak há listas
 * que aparecem vazias e ninguém sabe se é porque não há trabalho ou porque
 * algo falhou.
 */

import { supabase } from "./supabase";
import type { Estado, Origem, Prioridade } from "../domain/tipos";

export class ErroDeDados extends Error {}

function rebentar(contexto: string, error: { message: string } | null): void {
  if (!error) return;
  // eslint-disable-next-line no-console
  console.error(`[Operações] ${contexto}:`, error);
  throw new ErroDeDados(`Não foi possível ${contexto}.`);
}

/* ─────────────────────────────── Ordens ─────────────────────────────── */

export interface LinhaOrdem {
  id: string;
  codigo: string;
  origem: Origem;
  estado: Estado;
  prioridade: Prioridade;
  titulo: string;
  cliente_id: string;
  local_id: string | null;
  responsavel_id: string | null;
  agendada_para: string | null;
  iniciada_em: string | null;
  criada_em: string;
  atualizada_em: string;
  pausa_retoma_prevista: string | null;
}

export interface FiltrosOrdens {
  estados?: readonly Estado[];
  origem?: Origem;
  pesquisa?: string;
  responsavelId?: string;
}

const COLUNAS_ORDEM =
  "id, codigo, origem, estado, prioridade, titulo, cliente_id, local_id, " +
  "responsavel_id, agendada_para, iniciada_em, criada_em, atualizada_em, " +
  "pausa_retoma_prevista";

export async function listarOrdens(
  orgId: string,
  filtros: FiltrosOrdens = {}
): Promise<LinhaOrdem[]> {
  let q = supabase
    .from("ops_ordem")
    .select(COLUNAS_ORDEM)
    .eq("organization_id", orgId);

  if (filtros.estados?.length) q = q.in("estado", filtros.estados as string[]);
  if (filtros.origem) q = q.eq("origem", filtros.origem);
  if (filtros.responsavelId) q = q.eq("responsavel_id", filtros.responsavelId);

  const termo = filtros.pesquisa?.trim();
  if (termo) {
    // Pesquisa pelo código ou pelo título. `%` e `,` partiriam o filtro do
    // PostgREST, por isso saem antes de entrar.
    const limpo = termo.replace(/[%,]/g, " ");
    q = q.or(`codigo.ilike.%${limpo}%,titulo.ilike.%${limpo}%`);
  }

  // Sem data agendada vai para o fim: quem não tem data não é urgente.
  const { data, error } = await q
    .order("agendada_para", { ascending: true, nullsFirst: false })
    .order("criada_em", { ascending: false })
    .limit(200);

  rebentar("carregar as ordens", error);
  return (data ?? []) as unknown as LinhaOrdem[];
}

export interface OrdemCompleta extends LinhaOrdem {
  /** A lista não seleciona esta coluna; a ficha sim, e precisa dela para auditar. */
  organization_id: string;
  descricao: string | null;
  area: string | null;
  tipo: string | null;
  contacto_nome: string | null;
  contacto_telefone: string | null;
  janela_inicio: string | null;
  janela_fim: string | null;
  fechada_em: string | null;
  confirmada_em: string | null;
  cancelada_em: string | null;
  motivo_cancelamento: string | null;
  pausa_motivo: string | null;
  plano_id: string | null;
  gerada_por_tarefa_id: string | null;
}

export async function obterOrdem(codigo: string, orgId: string): Promise<OrdemCompleta | null> {
  const { data, error } = await supabase
    .from("ops_ordem")
    .select("*")
    .eq("organization_id", orgId)
    .eq("codigo", codigo)
    .maybeSingle();

  rebentar("carregar a ordem", error);
  return (data as unknown as OrdemCompleta) ?? null;
}

/* ─────────────────────────────── Tarefas ─────────────────────────────── */

export interface AlvoDaOrdem {
  id: string;
  posicao: number;
  ativo_id: string | null;
  local_id: string | null;
  checklist_id: string | null;
  checklist_versao: number | null;
}

export interface TarefaDaOrdem {
  id: string;
  ordem_alvo_id: string | null;
  posicao: number;
  nome: string;
  tipo: string;
  estado: string;
  valor_num: number | null;
  valor_texto: string | null;
  unidade: string | null;
  limite_min: number | null;
  limite_max: number | null;
  obrigatoria: boolean;
  observacoes: string | null;
  /** Uma tarefa privada não sai no relatório do cliente. */
  privada: boolean;
}

export async function alvosDaOrdem(ordemId: string): Promise<AlvoDaOrdem[]> {
  const { data, error } = await supabase
    .from("ops_ordem_alvo")
    .select("id, posicao, ativo_id, local_id, checklist_id, checklist_versao")
    .eq("ordem_id", ordemId)
    .order("posicao");
  rebentar("carregar os alvos da ordem", error);
  return (data ?? []) as unknown as AlvoDaOrdem[];
}

export async function tarefasDaOrdem(ordemId: string): Promise<TarefaDaOrdem[]> {
  const { data, error } = await supabase
    .from("ops_ordem_tarefa")
    .select(
      "id, ordem_alvo_id, posicao, nome, tipo, estado, valor_num, valor_texto, " +
        "unidade, limite_min, limite_max, obrigatoria, observacoes, privada"
    )
    .eq("ordem_id", ordemId)
    .order("posicao");
  rebentar("carregar as tarefas", error);
  return (data ?? []) as unknown as TarefaDaOrdem[];
}

/* ────────────────────────────── Sessões ────────────────────────────── */

export interface SessaoDaOrdem {
  id: string;
  utilizador_id: string;
  inicio: string;
  fim: string | null;
}

export async function sessoesDaOrdem(ordemId: string): Promise<SessaoDaOrdem[]> {
  const { data, error } = await supabase
    .from("ops_sessao_trabalho")
    .select("id, utilizador_id, inicio, fim")
    .eq("ordem_id", ordemId)
    .order("inicio");
  rebentar("carregar as sessões de trabalho", error);
  return (data ?? []) as unknown as SessaoDaOrdem[];
}

/* ────────────────────────── Clientes e equipa ────────────────────────── */

export interface Cliente {
  id: string;
  nome: string;
}

/**
 * Lê da vista `ops_v_cliente`, não de `anew_clients`.
 * `anew_clients` não tem coluna de nome — o nome vive em
 * `anew_entities.display_name`. A vista resolve o join e o `deleted_at` uma
 * vez só, em vez de cada ecrã se lembrar (ou esquecer) de o fazer.
 */
export async function listarClientes(orgId: string): Promise<Cliente[]> {
  const { data, error } = await supabase
    .from("ops_v_cliente")
    .select("id, nome")
    .eq("organization_id", orgId)
    .order("nome");
  rebentar("carregar os clientes", error);
  return (data ?? []) as unknown as Cliente[];
}

export interface MembroEquipa {
  utilizador_id: string;
  nome: string;
  email: string;
  funcao: string;
}

/**
 * Lê da vista `ops_v_equipa`, que NÃO tem a coluna `custo_hora`.
 * É isto que faz valer a regra de o técnico nunca ver custo/hora — uma policy
 * filtra linhas, não colunas.
 */
export async function listarEquipa(orgId: string): Promise<MembroEquipa[]> {
  const { data, error } = await supabase
    .from("ops_v_equipa")
    .select("utilizador_id, nome, email, funcao")
    .eq("organization_id", orgId)
    .eq("ativo", true)
    .order("nome");
  rebentar("carregar a equipa", error);
  return (data ?? []) as unknown as MembroEquipa[];
}

/* ─────────────────────────── Locais e ativos ─────────────────────────── */

export interface LocalRow {
  id: string;
  parent_id: string | null;
  cliente_id: string;
  codigo: string;
  nome: string;
  tipo: string;
  cidade: string | null;
  zona: string | null;
}

export async function listarLocais(orgId: string): Promise<LocalRow[]> {
  const { data, error } = await supabase
    .from("ops_local")
    .select("id, parent_id, cliente_id, codigo, nome, tipo, cidade, zona")
    .eq("organization_id", orgId)
    .eq("ativo", true)
    .order("nome");
  rebentar("carregar os locais", error);
  return (data ?? []) as unknown as LocalRow[];
}

export interface AtivoRow {
  id: string;
  local_id: string;
  codigo: string;
  nome: string;
  marca: string | null;
  modelo: string | null;
  criticidade: string;
}

export async function ativosDoLocal(localId: string): Promise<AtivoRow[]> {
  const { data, error } = await supabase
    .from("ops_ativo")
    .select("id, local_id, codigo, nome, marca, modelo, criticidade")
    .eq("local_id", localId)
    .eq("ativo", true)
    .order("codigo");
  rebentar("carregar os ativos", error);
  return (data ?? []) as unknown as AtivoRow[];
}

/* ─────────────────────────── Árvore de locais ─────────────────────────── */

export interface NoLocal extends LocalRow {
  filhos: NoLocal[];
}

/**
 * Monta a árvore a partir da lista plana.
 *
 * Um local cujo pai não veio na lista — porque a RLS o escondeu, ou porque os
 * dados estão inconsistentes — passa a raiz em vez de desaparecer. Um item
 * que some sem explicação é pior do que um item no sítio errado.
 */
export function montarArvore(locais: readonly LocalRow[]): NoLocal[] {
  const porId = new Map<string, NoLocal>();
  for (const l of locais) porId.set(l.id, { ...l, filhos: [] });

  const raizes: NoLocal[] = [];
  for (const no of porId.values()) {
    const pai = no.parent_id ? porId.get(no.parent_id) : undefined;
    if (pai) pai.filhos.push(no);
    else raizes.push(no);
  }

  const ordenar = (ns: NoLocal[]) => {
    ns.sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
    for (const n of ns) ordenar(n.filhos);
  };
  ordenar(raizes);
  return raizes;
}

/* ────────────────────────────── Medições ───────────────────────────── */

/**
 * Uma leitura de medição de uma tarefa.
 *
 * `lida_em` nulo quer dizer "por responder". Os limites e a unidade vêm
 * congelados na própria linha — não se vai buscá-los ao catálogo, porque o
 * catálogo pode ter mudado depois de a ordem nascer.
 */
export interface MedicaoDaTarefa {
  id: string;
  ordem_tarefa_id: string;
  medicao_def_id: string;
  nome: string;
  tipo: "gama" | "acumulado" | "escolha" | "texto";
  unidade: string | null;
  limite_min: number | null;
  limite_max: number | null;
  valor_num: number | null;
  valor_texto: string | null;
  opcao_id: string | null;
  conforme: boolean | null;
  lida_em: string | null;
  corretiva_ordem_id: string | null;
}

export interface OpcaoDeMedicao {
  id: string;
  medicao_def_id: string;
  nome: string;
  posicao: number;
  e_nao_conforme: boolean;
  cria_corretiva: boolean;
}

/** Todas as leituras da ordem, de uma vez. Uma consulta, não uma por tarefa. */
export async function medicoesDaOrdem(tarefaIds: readonly string[]): Promise<MedicaoDaTarefa[]> {
  if (tarefaIds.length === 0) return [];
  const { data, error } = await supabase
    .from("ops_ordem_tarefa_medicao")
    .select(
      "id, ordem_tarefa_id, medicao_def_id, nome, tipo, unidade, limite_min, limite_max, " +
        "valor_num, valor_texto, opcao_id, conforme, lida_em, corretiva_ordem_id"
    )
    .in("ordem_tarefa_id", tarefaIds as string[])
    .order("nome");
  rebentar("carregar as medições", error);
  return (data ?? []) as unknown as MedicaoDaTarefa[];
}

/** As opções das medições de escolha que aparecem nesta ordem. */
export async function opcoesDeMedicoes(defIds: readonly string[]): Promise<OpcaoDeMedicao[]> {
  if (defIds.length === 0) return [];
  const { data, error } = await supabase
    .from("ops_medicao_opcao")
    .select("id, medicao_def_id, nome, posicao, e_nao_conforme, cria_corretiva")
    .in("medicao_def_id", defIds as string[])
    .order("posicao");
  rebentar("carregar as opções de resposta", error);
  return (data ?? []) as unknown as OpcaoDeMedicao[];
}

/* ─────────────────────────────── Escritas ──────────────────────────── */

/**
 * O que a base devolve depois de uma resposta.
 *
 * `corretiva_gerada` é o código da ordem que nasceu da não conformidade — a
 * app não a cria nem a pede; limita-se a mostrá-la a quem acabou de a causar,
 * porque é nesse instante que a informação vale alguma coisa.
 */
export interface Resposta {
  ok: boolean;
  estado?: string;
  estado_tarefa?: string;
  conforme?: boolean | null;
  por_ler?: number;
  avaliada_automaticamente?: boolean;
  corretiva_gerada: string | null;
}

/**
 * Erro vindo de uma RPC.
 *
 * As RPCs escrevem mensagens para quem as vai ler ("Um contador não desce.
 * 'Horas' estava em 45812, e leu-se 40000."). Mostrar a do servidor é sempre
 * melhor do que uma genérica — por isso esta classe existe: para a distinguir
 * de uma falha de rede, que não tem nada de útil para dizer.
 */
export class ErroDeEscrita extends Error {}

export async function responderTarefa(args: {
  tarefaId: string;
  estado?: string | null;
  valorNum?: number | null;
  valorTexto?: string | null;
  observacoes?: string | null;
}): Promise<Resposta> {
  const { data, error } = await supabase.rpc("rpc_ops_responder_tarefa", {
    p_tarefa_id: args.tarefaId,
    p_estado: args.estado ?? null,
    p_valor_num: args.valorNum ?? null,
    p_valor_texto: args.valorTexto ?? null,
    p_observacoes: args.observacoes ?? null,
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível gravar a resposta.");
  return data as unknown as Resposta;
}

export async function responderMedicao(args: {
  tarefaId: string;
  medicaoDefId: string;
  valorNum?: number | null;
  valorTexto?: string | null;
  opcaoId?: string | null;
}): Promise<Resposta> {
  const { data, error } = await supabase.rpc("rpc_ops_responder_medicao", {
    p_tarefa_id: args.tarefaId,
    p_medicao_def_id: args.medicaoDefId,
    p_valor_num: args.valorNum ?? null,
    p_valor_texto: args.valorTexto ?? null,
    p_opcao_id: args.opcaoId ?? null,
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível gravar a leitura.");
  return data as unknown as Resposta;
}
