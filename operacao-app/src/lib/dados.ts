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
  categoria_id: string | null;
  codigo: string;
  nome: string;
  marca: string | null;
  modelo: string | null;
  criticidade: string;
}

export async function ativosDoLocal(localId: string): Promise<AtivoRow[]> {
  const { data, error } = await supabase
    .from("ops_ativo")
    .select("id, local_id, categoria_id, codigo, nome, marca, modelo, criticidade")
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
