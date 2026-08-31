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
import type { Intervencao, Leitura, LinhaPmp } from "../domain/analises";

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
  tipo_trabalho_id: string | null;
  centro_custo_id: string | null;
  /** → suppliers.id do CRM. Sem chave estrangeira, de propósito. */
  fornecedor_id: string | null;
  fecha_automatico: boolean;
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
  morada: string | null;
  cidade: string | null;
  zona: string | null;
  latitude: number | null;
  longitude: number | null;
}

/**
 * As coordenadas como número, venham elas como vierem.
 *
 * Na base são `numeric`, e um `numeric` chega aqui como número — mas há
 * versões do PostgREST que o mandam como texto, para não perder casas. Se isso
 * acontecesse, o botão de navegação desaparecia sem nada explicar: as guardas
 * em `domain/mapa.ts` exigem número, e exigem bem. Normaliza-se à entrada, uma
 * vez, e o resto do código deixa de ter de saber disto.
 */
function comCoordenadas(l: LocalRow): LocalRow {
  const n = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const x = typeof v === "number" ? v : Number(v);
    return Number.isFinite(x) ? x : null;
  };
  return { ...l, latitude: n(l.latitude), longitude: n(l.longitude) };
}

export async function listarLocais(orgId: string): Promise<LocalRow[]> {
  const { data, error } = await supabase
    .from("ops_local")
    .select(
      "id, parent_id, cliente_id, codigo, nome, tipo, morada, cidade, zona, " +
        "latitude, longitude"
    )
    .eq("organization_id", orgId)
    .eq("ativo", true)
    .order("nome");
  rebentar("carregar os locais", error);
  return ((data ?? []) as unknown as LocalRow[]).map(comCoordenadas);
}

export interface AtivoRow {
  id: string;
  local_id: string;
  categoria_id: string | null;
  codigo: string;
  nome: string;
  marca: string | null;
  modelo: string | null;
  num_serie: string | null;
  criticidade: string;
  centro_custo_id: string | null;
  data_instalacao: string | null;
  garantia_ate: string | null;
}

export async function ativosDoLocal(localId: string): Promise<AtivoRow[]> {
  const { data, error } = await supabase
    .from("ops_ativo")
    .select(
      "id, local_id, categoria_id, codigo, nome, marca, modelo, num_serie, " +
        "criticidade, centro_custo_id, data_instalacao, garantia_ate"
    )
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

/* ──────────────────────── Criar, atribuir, agendar ──────────────────── */

export interface NovaOrdem {
  titulo: string;
  clienteId: string;
  origem?: string;
  prioridade?: string;
  descricao?: string | null;
  localId?: string | null;
  ativoId?: string | null;
  checklistId?: string | null;
  area?: string | null;
  tipo?: string | null;
  contactoNome?: string | null;
  contactoTelefone?: string | null;
  agendadaPara?: string | null;
  responsavelId?: string | null;
}

export interface OrdemCriada {
  ok: boolean;
  id: string;
  codigo: string;
  estado: string;
  tarefas: number;
}

export async function criarOrdem(o: NovaOrdem): Promise<OrdemCriada> {
  const { data, error } = await supabase.rpc("rpc_ops_criar_ordem", {
    p_titulo: o.titulo,
    p_cliente_id: o.clienteId,
    p_origem: o.origem ?? "corretiva",
    p_prioridade: o.prioridade ?? "normal",
    p_descricao: o.descricao ?? null,
    p_local_id: o.localId ?? null,
    p_ativo_id: o.ativoId ?? null,
    p_checklist_id: o.checklistId ?? null,
    p_area: o.area ?? null,
    p_tipo: o.tipo ?? null,
    p_contacto_nome: o.contactoNome ?? null,
    p_contacto_telefone: o.contactoTelefone ?? null,
    p_agendada_para: o.agendadaPara ?? null,
    p_responsavel_id: o.responsavelId ?? null,
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível criar a ordem.");
  return data as unknown as OrdemCriada;
}

export async function atribuirOrdem(args: {
  ordemId: string;
  responsavelId: string | null;
  equipa?: readonly string[];
}): Promise<{ ok: boolean; equipa: number }> {
  const { data, error } = await supabase.rpc("rpc_ops_atribuir_ordem", {
    p_ordem_id: args.ordemId,
    p_responsavel_id: args.responsavelId,
    p_equipa: args.equipa?.length ? [...args.equipa] : null,
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível atribuir a ordem.");
  return data as unknown as { ok: boolean; equipa: number };
}

/** Uma ordem que já ocupa a agenda da mesma pessoa à mesma hora. */
export interface Conflito {
  codigo: string;
  titulo: string;
  agendada_para: string;
}

/**
 * Um impedimento vindo da agenda do CRM: férias, horário ou feriado.
 *
 * Nunca traz o motivo da ausência — pode ser uma baixa médica, e quem marca
 * a visita só precisa de saber que a pessoa não está. Ver `db/agenda.sql`.
 */
export interface AvisoDeAgenda {
  tipo: "ausente" | "fora_de_horario" | "feriado";
  detalhe: string;
  desde: string;
  ate: string;
}

export async function agendarOrdem(args: {
  ordemId: string;
  agendadaPara: string;
  janelaInicio?: string | null;
  janelaFim?: string | null;
}): Promise<{ ok: boolean; conflitos: Conflito[]; avisos: AvisoDeAgenda[] }> {
  const { data, error } = await supabase.rpc("rpc_ops_agendar_ordem", {
    p_ordem_id: args.ordemId,
    p_agendada_para: args.agendadaPara,
    p_janela_inicio: args.janelaInicio ?? null,
    p_janela_fim: args.janelaFim ?? null,
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível agendar a ordem.");
  // `avisos` só existe se `db/agenda.sql` estiver instalado. Sem ele a RPC
  // devolve o resto na mesma, e o ecrã fica simplesmente sem estes avisos.
  const r = data as unknown as { ok: boolean; conflitos: Conflito[]; avisos?: AvisoDeAgenda[] };
  return { ...r, avisos: r.avisos ?? [] };
}

/** Quem já está na ordem. Serve para desenhar a equipa e saber quem a executa. */
export async function pessoasDaOrdem(
  ordemId: string
): Promise<{ utilizador_id: string; papel: string }[]> {
  const { data, error } = await supabase
    .from("ops_ordem_pessoa")
    .select("utilizador_id, papel")
    .eq("ordem_id", ordemId);
  rebentar("carregar a equipa da ordem", error);
  return (data ?? []) as unknown as { utilizador_id: string; papel: string }[];
}

/** As checklists publicadas, para escolher o procedimento ao criar uma ordem. */
export async function listarChecklists(
  orgId: string
): Promise<{ id: string; codigo: string; nome: string }[]> {
  const { data, error } = await supabase
    .from("ops_checklist")
    .select("id, codigo, nome")
    .eq("organization_id", orgId)
    .eq("estado", "publicada")
    .order("nome");
  rebentar("carregar as checklists", error);
  return (data ?? []) as unknown as { id: string; codigo: string; nome: string }[];
}

/* ────────────────────────── Orçamentos e custo ─────────────────────── */

/** Um orçamento aceite no CRM, visto do lado de Operações. */
export interface OrcamentoAceite {
  id: string;
  cliente_id: string | null;
  numero: string;
  titulo: string;
  obra_endereco: string | null;
  estado: string;
  accepted_at: string | null;
  total: number | null;
  moeda: string | null;
  /** O CUSTO somado das linhas — não o preço de venda. */
  custo_previsto: number;
  linhas: number;
  tem_obra: boolean;
}

export async function listarOrcamentos(orgId: string): Promise<OrcamentoAceite[]> {
  const { data, error } = await supabase
    .from("ops_v_orcamento")
    .select(
      "id, cliente_id, numero, titulo, obra_endereco, estado, accepted_at, " +
        "total, moeda, custo_previsto, linhas, tem_obra"
    )
    .eq("organization_id", orgId)
    .order("accepted_at", { ascending: false, nullsFirst: false })
    .limit(200);
  rebentar("carregar os orçamentos aceites", error);
  return (data ?? []) as unknown as OrcamentoAceite[];
}

export async function obraDeOrcamento(args: {
  orcamentoId: string;
  localId?: string | null;
  checklistId?: string | null;
  agendadaPara?: string | null;
  responsavelId?: string | null;
}): Promise<{ ok: boolean; id: string; codigo: string; linhas: number; custo_previsto: number }> {
  const { data, error } = await supabase.rpc("rpc_ops_obra_de_orcamento", {
    p_orcamento_id: args.orcamentoId,
    p_local_id: args.localId ?? null,
    p_checklist_id: args.checklistId ?? null,
    p_agendada_para: args.agendadaPara ?? null,
    p_responsavel_id: args.responsavelId ?? null,
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível abrir a obra.");
  return data as unknown as {
    ok: boolean;
    id: string;
    codigo: string;
    linhas: number;
    custo_previsto: number;
  };
}

/** Previsto e real lado a lado. Nulo em `previsto` = não houve orçamento. */
export interface CustoDaOrdem {
  ordem_id: string;
  previsto: number | null;
  real_material: number | null;
  real_mao_obra: number | null;
  real_outros: number | null;
  real_total: number;
  desvio: number | null;
  desvio_percent: number | null;
}

export async function custoDaOrdem(ordemId: string): Promise<CustoDaOrdem | null> {
  const { data, error } = await supabase
    .from("ops_v_ordem_custo")
    .select(
      "ordem_id, previsto, real_material, real_mao_obra, real_outros, " +
        "real_total, desvio, desvio_percent"
    )
    .eq("ordem_id", ordemId)
    .limit(1);
  // Sem permissão de custos a vista devolve vazio, e isso não é um erro:
  // é a resposta certa para quem não pode ver números.
  if (error) return null;
  return (data?.[0] ?? null) as unknown as CustoDaOrdem | null;
}

export interface LinhaPrevista {
  id: string;
  posicao: number;
  categoria: string | null;
  descricao: string;
  unidade: string | null;
  quantidade: number;
  custo_material: number;
  custo_mao_obra: number;
  total_sem_iva: number;
}

export async function previstoDaOrdem(ordemId: string): Promise<LinhaPrevista[]> {
  const { data, error } = await supabase
    .from("ops_ordem_previsto")
    .select(
      "id, posicao, categoria, descricao, unidade, quantidade, " +
        "custo_material, custo_mao_obra, total_sem_iva"
    )
    .eq("ordem_id", ordemId)
    .order("posicao");
  if (error) return [];
  return (data ?? []) as unknown as LinhaPrevista[];
}

/* ─────────────────────────────── Anexos ────────────────────────────── */

export interface Anexo {
  id: string;
  ordem_id: string;
  ordem_tarefa_id: string | null;
  caminho: string;
  nome: string;
  mime: string | null;
  tamanho: number | null;
  legenda: string | null;
  privado: boolean;
  carregado_por: string | null;
  carregado_em: string;
}

const BUCKET = "operacoes";

export async function anexosDaOrdem(ordemId: string): Promise<Anexo[]> {
  const { data, error } = await supabase
    .from("ops_anexo")
    .select(
      "id, ordem_id, ordem_tarefa_id, caminho, nome, mime, tamanho, legenda, " +
        "privado, carregado_por, carregado_em"
    )
    .eq("ordem_id", ordemId)
    .not("caminho", "is", null)
    .order("carregado_em", { ascending: false });
  rebentar("carregar os anexos", error);
  return (data ?? []) as unknown as Anexo[];
}

/**
 * URLs temporários para ver os ficheiros.
 *
 * O bucket é privado, por isso não há URL fixo: pede-se um assinado, válido
 * por uma hora. Um ficheiro de obra pode ter a matrícula de um carro ou a
 * cara de alguém, e um link permanente a circular por email é a maneira mais
 * fácil de isso sair da empresa sem ninguém decidir.
 */
export async function urlsDosAnexos(caminhos: readonly string[]): Promise<Map<string, string>> {
  if (caminhos.length === 0) return new Map();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls([...caminhos], 3600);
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[Operações] falha a assinar os URLs dos anexos:", error);
    return new Map();
  }
  const m = new Map<string, string>();
  for (const x of data ?? []) {
    if (x.signedUrl && x.path) m.set(x.path, x.signedUrl);
  }
  return m;
}

/**
 * Sobe um ficheiro e regista-o.
 *
 * Duas escritas em sítios diferentes, e por isso duas maneiras de ficar a
 * meio. Se o registo falhar, o ficheiro é apagado — senão ficava lá para
 * sempre, a ocupar espaço, sem nada que soubesse o que era.
 */
/**
 * Um nome único para o ficheiro no storage.
 *
 * NÃO usa `crypto.randomUUID()`. Essa função só existe em "contexto seguro"
 * — HTTPS ou localhost. Num telemóvel a abrir a app pelo IP da rede local
 * (`http://192.168.1.104:5274`) não existe, e o envio de fotos rebentava com
 * um erro que não dizia porquê. Em produção, com HTTPS, funcionaria — mas
 * depender de uma API de contexto seguro para gerar um nome de ficheiro é
 * fragilidade a troco de nada.
 */
function nomeSorteado(): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  }
  // Sem crypto de todo: a hora mais aleatoriedade chega para não haver
  // colisões dentro da mesma ordem.
  const extra = Array.from({ length: 12 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return `${Date.now().toString(16)}${extra}`;
}

export async function anexarFicheiro(args: {
  ordemId: string;
  organizationId: string;
  ficheiro: File;
  tarefaId?: string | null;
  legenda?: string | null;
  privado?: boolean;
}): Promise<Anexo> {
  const ext = args.ficheiro.name.includes(".")
    ? args.ficheiro.name.slice(args.ficheiro.name.lastIndexOf(".")).toLowerCase()
    : "";
  // Nome sorteado, não o do telemóvel: dois "IMG_0001.jpg" na mesma ordem
  // chocariam, e o nome original guarda-se na coluna `nome`.
  const caminho = `${args.organizationId}/${args.ordemId}/${nomeSorteado()}${ext}`;

  const { error: erroUpload } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, args.ficheiro, {
      contentType: args.ficheiro.type || undefined,
      upsert: false,
    });

  if (erroUpload) {
    // eslint-disable-next-line no-console
    console.error("[Operações] falha a enviar o ficheiro:", erroUpload);
    const m = erroUpload.message ?? "";
    throw new ErroDeEscrita(
      m.includes("exceeded") || m.includes("too large")
        ? "O ficheiro é grande demais. O limite é 25 MB."
        : m.includes("Bucket not found")
          ? "O armazenamento de Operações não está criado. Falta correr db/anexos.sql."
          : m.includes("row-level security") || m.includes("Unauthorized")
            ? "Sem permissão para anexar ficheiros a esta ordem."
            : m || "Não foi possível enviar o ficheiro."
    );
  }

  const { data, error } = await supabase.rpc("rpc_ops_registar_anexo", {
    p_ordem_id: args.ordemId,
    p_caminho: caminho,
    p_nome: args.ficheiro.name,
    p_tarefa_id: args.tarefaId ?? null,
    p_mime: args.ficheiro.type || null,
    p_tamanho: args.ficheiro.size,
    p_legenda: args.legenda ?? null,
    p_privado: args.privado ?? false,
  });

  if (error) {
    // O registo falhou: o ficheiro não pode ficar órfão no storage.
    await supabase.storage.from(BUCKET).remove([caminho]);
    throw new ErroDeEscrita(error.message || "Não foi possível registar o ficheiro.");
  }

  const r = data as unknown as { id: string };
  return {
    id: r.id,
    ordem_id: args.ordemId,
    ordem_tarefa_id: args.tarefaId ?? null,
    caminho,
    nome: args.ficheiro.name,
    mime: args.ficheiro.type || null,
    tamanho: args.ficheiro.size,
    legenda: args.legenda ?? null,
    privado: args.privado ?? false,
    carregado_por: null,
    carregado_em: new Date().toISOString(),
  };
}

export async function removerAnexo(anexoId: string): Promise<void> {
  const { data, error } = await supabase.rpc("rpc_ops_remover_anexo", {
    p_anexo_id: anexoId,
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível apagar o ficheiro.");

  const r = data as unknown as { caminho?: string };
  // O registo já saiu. Se o ficheiro não sair, fica lixo — chato, mas não
  // perigoso: sem registo, ninguém lhe chega pela app.
  if (r?.caminho) await supabase.storage.from(BUCKET).remove([r.caminho]);
}

/* ──────────────────────── Planos preventivos ───────────────────────── */

export interface PlanoRow {
  id: string;
  codigo: string;
  nome: string;
  cliente_id: string;
  estado: string;
  tipo_recorrencia: string;
  regra_recorrencia: string | null;
  intervalo_horas: number | null;
  hora_prevista: string;
  responsavel_id: string | null;
  inicio_em: string;
  fim_em: string | null;
  materializado_ate: string | null;
}

export interface AlvoDoPlano {
  id: string;
  plano_id: string;
  ativo_id: string | null;
  local_id: string | null;
  checklist_id: string | null;
}

export async function listarPlanos(orgId: string): Promise<PlanoRow[]> {
  const { data, error } = await supabase
    .from("ops_plano")
    .select(
      "id, codigo, nome, cliente_id, estado, tipo_recorrencia, regra_recorrencia, " +
        "intervalo_horas, hora_prevista, responsavel_id, inicio_em, fim_em, materializado_ate"
    )
    .eq("organization_id", orgId)
    .order("estado")
    .order("nome");
  rebentar("carregar os planos", error);
  return (data ?? []) as unknown as PlanoRow[];
}

export async function alvosDosPlanos(planoIds: readonly string[]): Promise<AlvoDoPlano[]> {
  if (planoIds.length === 0) return [];
  const { data, error } = await supabase
    .from("ops_plano_alvo")
    .select("id, plano_id, ativo_id, local_id, checklist_id")
    .in("plano_id", planoIds as string[]);
  rebentar("carregar os alvos dos planos", error);
  return (data ?? []) as unknown as AlvoDoPlano[];
}

export interface PlanoParaGravar {
  id?: string | null;
  nome: string;
  clienteId: string;
  tipoRecorrencia: "calendario" | "dinamica";
  regra?: string | null;
  intervaloHoras?: number | null;
  horaPrevista?: string;
  inicioEm?: string | null;
  fimEm?: string | null;
  responsavelId?: string | null;
  estado?: string;
  alvos: { local_id?: string | null; ativo_id?: string | null; checklist_id?: string | null }[];
}

export async function gravarPlano(
  p: PlanoParaGravar
): Promise<{ ok: boolean; id: string; codigo: string; criado: boolean; alvos: number }> {
  const { data, error } = await supabase.rpc("rpc_ops_gravar_plano", {
    p_plano_id: p.id ?? null,
    p_nome: p.nome,
    p_cliente_id: p.clienteId,
    p_tipo_recorrencia: p.tipoRecorrencia,
    p_regra: p.regra ?? null,
    p_intervalo_horas: p.intervaloHoras ?? null,
    p_hora_prevista: p.horaPrevista ?? "09:00",
    p_inicio_em: p.inicioEm ?? null,
    p_fim_em: p.fimEm ?? null,
    p_responsavel_id: p.responsavelId ?? null,
    p_estado: p.estado ?? "ativo",
    p_duracao: 0,
    p_alvos: p.alvos,
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível gravar o plano.");
  return data as unknown as {
    ok: boolean;
    id: string;
    codigo: string;
    criado: boolean;
    alvos: number;
  };
}

/**
 * As próximas datas que uma regra vai gerar, sem gravar nada.
 *
 * É a diferença entre confiar numa regra e verificá-la. Devolve `{ok:false}`
 * com o erro em vez de rebentar — uma regra a meio de ser escrita é inválida
 * quase sempre, e não é um acidente.
 */
export async function experimentarRegra(
  regra: string,
  de?: string
): Promise<{ ok: boolean; datas?: string[]; erro?: string }> {
  const { data, error } = await supabase.rpc("rpc_ops_experimentar_regra", {
    p_regra: regra,
    p_de: de ?? null,
    p_quantas: 6,
  });
  if (error) return { ok: false, erro: error.message };
  return data as unknown as { ok: boolean; datas?: string[]; erro?: string };
}

/** Corre a materialização à mão, para quem não quer esperar pelo job diário. */
export async function materializarPlanos(
  planoId?: string | null
): Promise<{ ordens_criadas: number; planos_vistos: number; ignorados: unknown[] }> {
  const { data, error } = await supabase.rpc("rpc_ops_materializar_planos", {
    p_plano_id: planoId ?? null,
    p_dias: 120,
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível gerar as ordens.");
  return data as unknown as {
    ordens_criadas: number;
    planos_vistos: number;
    ignorados: unknown[];
  };
}

/* ─────────────────────────────── Análises ─────────────────────────────── */
/*
 * As três vistas de `db/analises.sql`. São vistas com `security_invoker`, por
 * isso a RLS das tabelas por baixo continua a decidir o que cada pessoa vê —
 * não é preciso filtrar por organização aqui a não ser para reduzir o volume.
 */

/** Todas as visitas feitas a um equipamento, da mais recente para trás. */
export async function intervencoesDoAtivo(ativoId: string): Promise<Intervencao[]> {
  const { data, error } = await supabase
    .from("ops_v_ativo_intervencao")
    .select("ordem_id, codigo, origem, estado, titulo, quando, nao_conformidades, tarefas")
    .eq("ativo_id", ativoId)
    .order("quando", { ascending: false });
  rebentar("carregar o histórico do equipamento", error);
  return (data ?? []) as unknown as Intervencao[];
}

/** Todas as leituras feitas a um equipamento. A ordem final é do domínio. */
export async function leiturasDoAtivo(ativoId: string): Promise<Leitura[]> {
  const { data, error } = await supabase
    .from("ops_v_ativo_leitura")
    .select(
      "leitura_id, medicao_def_id, nome, tipo, unidade, limite_min, limite_max, " +
        "valor_num, valor_texto, conforme, lida_em, codigo"
    )
    .eq("ativo_id", ativoId)
    .order("lida_em");
  rebentar("carregar as leituras do equipamento", error);
  return (data ?? []) as unknown as Leitura[];
}

/**
 * As ordens preventivas previstas num período.
 *
 * O corte é pela data prometida (`agendada_para`), não pela de fecho: a
 * pergunta é "o que estava prometido para março foi feito?", e uma ordem de
 * março fechada em abril continua a ser de março.
 */
export async function pmpDoPeriodo(
  orgId: string,
  desde: string,
  ate: string
): Promise<LinhaPmp[]> {
  const { data, error } = await supabase
    .from("ops_v_pmp")
    .select(
      "ordem_id, cliente_id, codigo, titulo, estado, agendada_para, fechada_em, " +
        "mes, cumprida, a_horas, em_atraso"
    )
    .eq("organization_id", orgId)
    .gte("agendada_para", desde)
    .lte("agendada_para", ate)
    .order("agendada_para");
  rebentar("carregar a manutenção preventiva", error);
  return (data ?? []) as unknown as LinhaPmp[];
}

export interface AtivoComLocal extends AtivoRow {
  local_nome: string;
  cliente_id: string;
}

/**
 * Todos os equipamentos da organização, para se poder escolher um.
 *
 * Traz o nome do local junto: "Extintor 3" sozinho não identifica nada quando
 * há quarenta extintores.
 */
export async function listarAtivos(orgId: string): Promise<AtivoComLocal[]> {
  const { data, error } = await supabase
    .from("ops_ativo")
    .select(
      "id, local_id, categoria_id, codigo, nome, marca, modelo, criticidade, " +
        "ops_local!inner(nome, cliente_id)"
    )
    .eq("organization_id", orgId)
    .eq("ativo", true)
    .order("codigo");
  rebentar("carregar os equipamentos", error);
  const linhas = (data ?? []) as unknown as Record<string, unknown>[];
  return linhas.map((a) => {
    const local = a.ops_local as { nome: string; cliente_id: string };
    return {
      ...(a as unknown as AtivoRow),
      local_nome: local?.nome ?? "—",
      cliente_id: local?.cliente_id ?? "",
    };
  });
}

/**
 * Manda a base procurar ordens atrasadas e pausas expiradas, e avisar quem
 * tem de saber.
 *
 * Existe porque essas duas falhas não geram evento nenhum — são a ausência de
 * um. Só se descobrem a olhar para o relógio, e alguém tem de olhar.
 *
 * Idempotente do lado da base: o mesmo aviso não se repete enquanto o primeiro
 * estiver por ler. Falhar aqui não é motivo para estragar um ecrã, por isso
 * quem chama isto ignora o erro.
 */
export async function avisarAtrasos(): Promise<number> {
  const { data, error } = await supabase.rpc("rpc_ops_avisar_atrasos");
  if (error) throw new ErroDeEscrita(error.message);
  return (data as unknown as { avisos?: number })?.avisos ?? 0;
}

/* ────────────────────── Exportar leituras ────────────────────── */

/** Uma leitura com o contexto todo, como sai de `ops_v_leitura`. */
export interface LeituraExportavel {
  leitura_id: string;
  ordem: string;
  cliente_id: string;
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
  lida_por: string | null;
  tarefa: string | null;
  local: string | null;
  local_codigo: string | null;
  ativo: string | null;
  ativo_codigo: string | null;
}

/** O PostgREST devolve no máximo 1000 linhas de cada vez. */
const PAGINA = 1000;

/**
 * Todas as leituras que satisfazem os filtros — **todas**, não as primeiras mil.
 *
 * Sem a paginação, uma exportação de dois anos de leituras vinha cortada nas
 * 1000 primeiras linhas sem erro nenhum, e quem a entregasse a um regulador não
 * dava por isso. É por isso que o `while` existe.
 *
 * `limite` existe para o caso patológico: se alguém pedir dez anos de tudo, é
 * melhor parar e dizer que é demais do que ficar a puxar páginas para sempre.
 */
export async function leiturasParaExportar(
  orgId: string,
  filtros: { defId?: string | null; clienteId?: string | null; desde: string; ate: string },
  limite = 50_000
): Promise<{ linhas: LeituraExportavel[]; truncado: boolean }> {
  const linhas: LeituraExportavel[] = [];

  for (let inicio = 0; inicio < limite; inicio += PAGINA) {
    let q = supabase
      .from("ops_v_leitura")
      .select(
        "leitura_id, ordem, cliente_id, medicao_def_id, nome, tipo, unidade, " +
          "limite_min, limite_max, valor_num, valor_texto, conforme, lida_em, " +
          "lida_por, tarefa, local, local_codigo, ativo, ativo_codigo"
      )
      .eq("organization_id", orgId)
      .gte("lida_em", filtros.desde)
      .lte("lida_em", filtros.ate)
      .order("lida_em")
      .range(inicio, inicio + PAGINA - 1);

    if (filtros.defId) q = q.eq("medicao_def_id", filtros.defId);
    if (filtros.clienteId) q = q.eq("cliente_id", filtros.clienteId);

    const { data, error } = await q;
    rebentar("carregar as leituras", error);

    const pagina = (data ?? []) as unknown as LeituraExportavel[];
    linhas.push(...pagina);
    if (pagina.length < PAGINA) return { linhas, truncado: false };
  }

  return { linhas, truncado: true };
}

/* ─────────────────────────────── Agenda ─────────────────────────────── */

import type { Compromisso, ImpedimentoDaEquipa, OrdemNaAgenda } from "../domain/agenda";

/**
 * As ordens de um dia, com a janela de visita.
 *
 * `listarOrdens` não serve aqui: não traz `janela_inicio`/`janela_fim`, e sem
 * eles todas as barras teriam a mesma largura.
 *
 * Traz também as **pausadas**: uma ordem em pausa continua a ocupar o dia de
 * quem a tem, e escondê-la faria a agenda parecer mais livre do que está.
 */
export async function ordensDoDia(orgId: string, dia: Date): Promise<OrdemNaAgenda[]> {
  const inicio = new Date(dia);
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(dia);
  fim.setHours(23, 59, 59, 999);

  const { data, error } = await supabase
    .from("ops_ordem")
    .select(
      "id, codigo, titulo, estado, origem, prioridade, responsavel_id, " +
        "local_id, cliente_id, tipo_trabalho_id, fornecedor_id, " +
        "agendada_para, janela_inicio, janela_fim"
    )
    .eq("organization_id", orgId)
    .in("estado", ["por_aprovar", "agendada", "em_curso", "pausada"])
    .gte("agendada_para", inicio.toISOString())
    .lte("agendada_para", fim.toISOString())
    .order("agendada_para");

  rebentar("carregar a agenda do dia", error);
  return (data ?? []) as unknown as OrdemNaAgenda[];
}

/**
 * Férias, horários e feriados da equipa toda, num pedido só.
 *
 * Se `db/agenda.sql` não estiver instalado, a RPC não existe — e a agenda
 * desenha-se na mesma, só sem as faixas de ausência. Por isso o erro é
 * engolido aqui em vez de levar o ecrã à frente.
 */
export async function impedimentosDoDia(
  orgId: string,
  dia: Date
): Promise<ImpedimentoDaEquipa[]> {
  const { data, error } = await supabase.rpc("rpc_ops_agenda_do_dia", {
    _org_id: orgId,
    _dia: dia.toISOString().slice(0, 10),
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[Operações] sem disponibilidade da equipa:", error.message);
    return [];
  }
  return (data ?? []) as unknown as ImpedimentoDaEquipa[];
}

/* ───────────────────────── Assinatura do cliente ───────────────────────── */

export interface Assinatura {
  id: string;
  ordem_id: string;
  nome: string;
  qualidade: string | null;
  caminho: string;
  recolhida_por: string | null;
  assinada_em: string;
}

export async function assinaturaDaOrdem(ordemId: string): Promise<Assinatura | null> {
  const { data, error } = await supabase
    .from("ops_assinatura")
    .select("id, ordem_id, nome, qualidade, caminho, recolhida_por, assinada_em")
    .eq("ordem_id", ordemId)
    .maybeSingle();
  // A tabela é opcional: sem `db/assinaturas.sql` a ficha da ordem continua a
  // abrir, só sem o painel.
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[Operações] sem assinatura:", error.message);
    return null;
  }
  return (data as unknown as Assinatura) ?? null;
}

/**
 * Sobe a imagem e regista a assinatura.
 *
 * Mesma coreografia dos anexos, e pela mesma razão: são duas escritas em
 * sítios diferentes, e se a segunda falhar o ficheiro não pode ficar órfão.
 */
export async function assinarOrdem(args: {
  ordemId: string;
  organizationId: string;
  imagem: Blob;
  nome: string;
  qualidade?: string | null;
}): Promise<{ ok: boolean; substituiu: boolean; caminho: string }> {
  const caminho = `${args.organizationId}/${args.ordemId}/assinatura-${nomeSorteado()}.png`;

  const { error: erroUpload } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, args.imagem, { contentType: "image/png", upsert: false });

  if (erroUpload) {
    const m = erroUpload.message ?? "";
    throw new ErroDeEscrita(
      m.includes("Bucket not found")
        ? "O armazenamento de Operações não está criado. Falta correr db/anexos.sql."
        : m || "Não foi possível guardar a assinatura."
    );
  }

  const { data, error } = await supabase.rpc("rpc_ops_assinar_ordem", {
    p_ordem_id: args.ordemId,
    p_caminho: caminho,
    p_nome: args.nome,
    p_qualidade: args.qualidade ?? null,
  });

  if (error) {
    await supabase.storage.from(BUCKET).remove([caminho]);
    throw new ErroDeEscrita(error.message || "Não foi possível registar a assinatura.");
  }

  const r = data as unknown as { substituiu: boolean };
  return { ok: true, substituiu: Boolean(r?.substituiu), caminho };
}

/** Uma indisponibilidade num dia concreto, para as vistas de semana e mês. */
export interface IndisponibilidadeNoDia {
  utilizador_id: string;
  dia: string;
  tipo: "ausente" | "fora_de_horario" | "feriado";
  detalhe: string;
}

/** As ordens de um período, para a semana e o mês. */
export async function ordensDoPeriodo(
  orgId: string,
  de: Date,
  ate: Date
): Promise<OrdemNaAgenda[]> {
  const inicio = new Date(de);
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(ate);
  fim.setHours(23, 59, 59, 999);

  const { data, error } = await supabase
    .from("ops_ordem")
    .select(
      "id, codigo, titulo, estado, origem, prioridade, responsavel_id, " +
        "agendada_para, janela_inicio, janela_fim"
    )
    .eq("organization_id", orgId)
    .in("estado", ["por_aprovar", "agendada", "em_curso", "pausada"])
    .gte("agendada_para", inicio.toISOString())
    .lte("agendada_para", fim.toISOString())
    .order("agendada_para");

  rebentar("carregar a agenda", error);
  return (data ?? []) as unknown as OrdemNaAgenda[];
}

/**
 * Férias, horários e feriados de um período, por pessoa e por dia.
 *
 * Como `impedimentosDoDia`, o erro é engolido: sem `db/agenda.sql` a agenda
 * desenha-se na mesma, só sem as faixas de ausência.
 */
export async function indisponibilidadesDoPeriodo(
  orgId: string,
  de: Date,
  ate: Date
): Promise<IndisponibilidadeNoDia[]> {
  const { data, error } = await supabase.rpc("rpc_ops_agenda_periodo", {
    _org_id: orgId,
    _de: isoDia(de),
    _ate: isoDia(ate),
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[Operações] sem indisponibilidades:", error.message);
    return [];
  }
  return (data ?? []) as unknown as IndisponibilidadeNoDia[];
}

/**
 * Os compromissos que já estão na agenda do CRM.
 *
 * A agenda é uma só: uma pessoa com uma visita comercial marcada às 10h não
 * está livre às 10h.
 */
export async function compromissosDoCRM(
  orgId: string,
  de: Date,
  ate: Date
): Promise<Compromisso[]> {
  const { data, error } = await supabase.rpc("rpc_ops_compromissos_crm", {
    _org_id: orgId,
    _de: isoDia(de),
    _ate: isoDia(ate),
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[Operações] sem compromissos do CRM:", error.message);
    return [];
  }
  return (data ?? []) as unknown as Compromisso[];
}

/**
 * `2026-09-16` no fuso local.
 *
 * `toISOString().slice(0,10)` daria o dia em UTC — e às 23h de Lisboa isso é
 * já o dia seguinte, o que faria a agenda carregar o período errado.
 */
function isoDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * O local de uma ordem, com a morada e o ponto no mapa.
 *
 * Só isto — a ficha da ordem não precisa da árvore toda de locais para
 * desenhar um botão de navegação.
 */
export async function localDaOrdem(localId: string | null): Promise<LocalRow | null> {
  if (!localId) return null;
  const { data, error } = await supabase
    .from("ops_local")
    .select(
      "id, parent_id, cliente_id, codigo, nome, tipo, morada, cidade, zona, latitude, longitude"
    )
    .eq("id", localId)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[Operações] sem o local da ordem:", error.message);
    return null;
  }
  return data ? comCoordenadas(data as unknown as LocalRow) : null;
}

/* ─────────────────────── Definições da organização ─────────────────────── */

/** As chaves que existem. Fechadas, tal como na base. */
export type ChaveDeDefinicao = "relatorio_automatico";

/**
 * As definições da organização, já com os valores por omissão aplicados.
 *
 * Uma organização que nunca mexeu em nada não tem linha nenhuma na tabela —
 * e a resposta certa nesse caso não é "vazio", é "desligado".
 */
export async function lerDefinicoes(
  orgId: string
): Promise<Record<ChaveDeDefinicao, string>> {
  const { data, error } = await supabase
    .from("ops_definicao")
    .select("chave, valor")
    .eq("organization_id", orgId);

  rebentar("ler as definições", error);

  const fora: Record<ChaveDeDefinicao, string> = { relatorio_automatico: "nao" };
  for (const l of (data ?? []) as { chave: string; valor: string }[]) {
    if (l.chave in fora) fora[l.chave as ChaveDeDefinicao] = l.valor;
  }
  return fora;
}

export async function definirDefinicao(
  orgId: string,
  chave: ChaveDeDefinicao,
  valor: string
): Promise<void> {
  const { error } = await supabase.rpc("rpc_ops_definir", {
    p_org_id: orgId,
    p_chave: chave,
    p_valor: valor,
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível gravar a definição.");
}

/* ─────────────────── Classificação de uma ordem ────────────────────────── */

/**
 * Tipo de trabalho, centro de custo, fornecedor e o fecho automático.
 *
 * Vai por UPDATE direto e não por RPC porque **não mexe no estado** — e o
 * estado é a única coisa que a base tranca. Título, responsável e descrição
 * seguem o mesmo caminho desde o início.
 */
export async function gravarClassificacao(
  ordemId: string,
  c: {
    tipoTrabalhoId?: string | null;
    centroCustoId?: string | null;
    fornecedorId?: string | null;
    fechaAutomatico?: boolean;
  }
): Promise<void> {
  const linha: Record<string, unknown> = { atualizada_em: new Date().toISOString() };
  if ("tipoTrabalhoId" in c) linha.tipo_trabalho_id = c.tipoTrabalhoId || null;
  if ("centroCustoId" in c) linha.centro_custo_id = c.centroCustoId || null;
  if ("fornecedorId" in c) linha.fornecedor_id = c.fornecedorId || null;
  if ("fechaAutomatico" in c) linha.fecha_automatico = c.fechaAutomatico;

  const { error } = await supabase.from("ops_ordem").update(linha).eq("id", ordemId);
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível gravar.");
}

/**
 * Fecha a ordem se ela for das que se fecham sozinhas e já não faltar nada.
 *
 * Chamada depois de cada resposta. Não é erro não ser altura — a base devolve
 * o motivo e a aplicação segue. Falhar aqui nunca pode estragar uma resposta
 * que já foi gravada, e por isso o erro é engolido.
 */
export async function fecharSeCompleta(ordemId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("rpc_ops_fechar_se_completa", {
    p_ordem_id: ordemId,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[Operações] fecho automático não correu:", error.message);
    return false;
  }
  return (data as { fechou?: boolean } | null)?.fechou === true;
}

/* ────────────────────────── Um local em detalhe ────────────────────────── */

/** As ordens que passaram por um sítio. É a memória dele. */
export async function ordensDoLocal(
  orgId: string,
  localId: string,
  limite = 20
): Promise<LinhaOrdem[]> {
  const { data, error } = await supabase
    .from("ops_ordem")
    .select(COLUNAS_ORDEM)
    .eq("organization_id", orgId)
    .eq("local_id", localId)
    .order("criada_em", { ascending: false })
    .limit(limite);

  rebentar("carregar as ordens do local", error);
  return (data ?? []) as unknown as LinhaOrdem[];
}

/**
 * O caminho desde a raiz até este local: Cliente › Torre › Piso › Espaço.
 *
 * Pura, e a partir da lista que a página já tem — não vale um pedido à base
 * para subir três níveis. Pára a subir se encontrar um ciclo: dados errados
 * não podem pendurar o ecrã.
 */
export function caminhoAteLocal(
  locais: readonly LocalRow[],
  localId: string
): LocalRow[] {
  const porId = new Map(locais.map((l) => [l.id, l]));
  const caminho: LocalRow[] = [];
  const vistos = new Set<string>();

  let atual = porId.get(localId);
  while (atual && !vistos.has(atual.id)) {
    vistos.add(atual.id);
    caminho.unshift(atual);
    atual = atual.parent_id ? porId.get(atual.parent_id) : undefined;
  }
  return caminho;
}

/* ─────────────────────────────── Histórico ─────────────────────────────── */

export interface EventoRow {
  id: string;
  entidade: string;
  entidade_id: string;
  tipo: string;
  descricao: string | null;
  autor_id: string | null;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  criado_em: string;
}

/**
 * O que aconteceu a uma coisa, do mais recente para trás.
 *
 * O módulo escreve histórico desde o primeiro dia e nunca o mostrou a
 * ninguém. Isto é a porta que faltava — serve para o equipamento, e serve
 * para tudo o resto que a use a seguir.
 */
export async function historicoDe(
  entidade: string,
  entidadeId: string,
  limite = 30
): Promise<EventoRow[]> {
  const { data, error } = await supabase
    .from("ops_evento")
    .select("id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois, criado_em")
    .eq("entidade", entidade)
    .eq("entidade_id", entidadeId)
    .order("criado_em", { ascending: false })
    .limit(limite);

  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[Operações] sem histórico:", error.message);
    return [];
  }
  return (data ?? []) as unknown as EventoRow[];
}

/* ─────────────────────── Um equipamento em detalhe ─────────────────────── */

/**
 * O equipamento pelo código, que é o que a etiqueta QR carrega.
 *
 * O código é único por organização — e é por isso que serve de endereço. Um
 * uuid numa etiqueta seria ilegível para quem a colasse ao contrário.
 */
export async function ativoPorCodigo(
  orgId: string,
  codigo: string
): Promise<AtivoRow | null> {
  const { data, error } = await supabase
    .from("ops_ativo")
    .select(
      "id, local_id, categoria_id, codigo, nome, marca, modelo, num_serie, " +
        "criticidade, centro_custo_id, data_instalacao, garantia_ate"
    )
    .eq("organization_id", orgId)
    .eq("codigo", codigo)
    .maybeSingle();

  rebentar("carregar o equipamento", error);
  return (data as unknown as AtivoRow) ?? null;
}

/** As ordens que passaram por um equipamento, pelos alvos dela. */
export async function ordensDoAtivo(
  orgId: string,
  ativoId: string,
  limite = 20
): Promise<LinhaOrdem[]> {
  const { data, error } = await supabase
    .from("ops_ordem_alvo")
    .select(`ordem_id, ops_ordem!inner(${COLUNAS_ORDEM}, organization_id)`)
    .eq("ativo_id", ativoId)
    .limit(limite);

  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[Operações] sem ordens do equipamento:", error.message);
    return [];
  }

  const linhas = ((data ?? []) as unknown as { ops_ordem: LinhaOrdem & { organization_id: string } }[])
    .map((l) => l.ops_ordem)
    .filter((o) => o && o.organization_id === orgId);

  // Da mais recente para trás — é a ordem por que a memória se lê.
  return linhas.sort((a, b) => (b.criada_em ?? "").localeCompare(a.criada_em ?? ""));
}

/* ────────────────────────── A conversa da ordem ────────────────────────── */

/**
 * Uma mensagem escrita dentro da ordem.
 *
 * Não é WhatsApp nem chat com o cliente: é a conversa entre colegas sobre
 * *este* trabalho, guardada onde o trabalho está. Ver `db/mensagens.sql` para
 * a razão de não se poder apagar nem reescrever.
 */
export interface Mensagem {
  id: string;
  ordem_id: string;
  autor_id: string | null;
  texto: string;
  criada_em: string;
}

export async function mensagensDaOrdem(ordemId: string): Promise<Mensagem[]> {
  const { data, error } = await supabase
    .from("ops_mensagem")
    .select("id, ordem_id, autor_id, texto, criada_em")
    .eq("ordem_id", ordemId)
    .eq("canal", "interno")
    // Do princípio para o fim, como se lê uma conversa.
    .order("criada_em", { ascending: true });
  rebentar("carregar as mensagens", error);
  return (data ?? []) as unknown as Mensagem[];
}

/**
 * Escrever uma mensagem.
 *
 * Passa pela RPC e não por um INSERT direto porque escrever é metade do
 * trabalho: a outra metade é tocar o sino a quem está na ordem. Uma mensagem
 * que ninguém lê não serve para nada.
 */
export async function escreverMensagem(
  ordemId: string,
  texto: string
): Promise<{ ok: boolean; id: string }> {
  const { data, error } = await supabase.rpc("rpc_ops_escrever_mensagem", {
    p_ordem_id: ordemId,
    p_texto: texto,
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível enviar a mensagem.");
  return data as unknown as { ok: boolean; id: string };
}

/* ─────────────────────── O relatório ao cliente ─────────────────────── */

/** Para onde ia o relatório desta ordem, e se já foi algum. */
export interface DestinoDoRelatorio {
  email: string | null;
  estado: string;
  ja_enviado: string | null;
}

export async function destinoDoRelatorio(ordemId: string): Promise<DestinoDoRelatorio> {
  const { data, error } = await supabase.rpc("rpc_ops_destino_do_relatorio", {
    p_ordem_id: ordemId,
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível saber o destinatário.");
  return data as unknown as DestinoDoRelatorio;
}

/**
 * Mandar o relatório ao cliente agora.
 *
 * Não leva destinatário: vai para o email da ficha do cliente e mais nenhum.
 * Ver `db/relatorio-manual.sql` para a razão.
 */
export async function enviarRelatorio(ordemId: string): Promise<{ ok: boolean; para: string }> {
  const { data, error } = await supabase.rpc("rpc_ops_enviar_relatorio", {
    p_ordem_id: ordemId,
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível enviar o relatório.");
  return data as unknown as { ok: boolean; para: string };
}
