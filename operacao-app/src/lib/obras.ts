/**
 * Leituras e escritas do módulo de Obras.
 *
 * As mesmas regras de `dados.ts`: nunca engolir um erro (uma lista vazia por
 * falha de RLS e uma lista vazia por não haver trabalho são coisas
 * diferentes), e nunca escrever numa tabela — tudo o que muda passa por uma
 * RPC `rpc_ops_obra_*`, que verifica a função de quem chama.
 */

import { supabase } from "./supabase";
import { ErroDeDados, ErroDeEscrita } from "./dados";
import type {
  EstadoExtra,
  EstadoObra,
  EstadoTarefaObra,
  MotivoDesvio,
} from "../domain/obras";
import type { MaterialLigado, PrevisaoContrato, ProdutoStock, TarefaParaCriar } from "../domain/novaObra";
import type { MotivoAtraso, TipoAlerta } from "../domain/atrasos";

export type { MaterialLigado, PrevisaoContrato, ProdutoStock, TarefaParaCriar } from "../domain/novaObra";

function rebentar(contexto: string, error: { message: string } | null): void {
  if (!error) return;
  // eslint-disable-next-line no-console
  console.error(`[Obras] ${contexto}:`, error);
  throw new ErroDeDados(`Não foi possível ${contexto}.`);
}

async function rpc<T>(nome: string, args: Record<string, unknown>, falha: string): Promise<T> {
  const { data, error } = await supabase.rpc(nome, args);
  if (error) throw new ErroDeEscrita(error.message || falha);
  return data as unknown as T;
}

/* ─────────────────────────────── Obras ─────────────────────────────── */

export interface ObraResumo {
  id: string;
  organization_id: string;
  codigo: string;
  titulo: string;
  estado: EstadoObra;
  cliente_id: string | null;
  orcamento_id: string | null;
  contrato_id: string | null;
  modelo_id: string | null;
  morada: string | null;
  data_inicio_prevista: string | null;
  gestor_id: string | null;
  supervisor_id: string | null;
  tolerancia_percent: number;
  criada_em: string;
  n_tarefas: number;
  n_feitas: number;
  n_validadas: number;
  n_por_validar: number;
  minutos_previstos: number;
  minutos_reais: number;
  inicio_planeado: string | null;
  fim_planeado: string | null;
  n_extras: number;
  /** O fim do plano original (antes dos atrasos). Opcional até o SQL dos atrasos correr. */
  fim_original?: string | null;
  /** Alertas da obra (não iniciadas, fim ultrapassado, cliente por avisar). */
  n_alertas?: number;
}

export async function listarObras(orgId: string): Promise<ObraResumo[]> {
  const { data, error } = await supabase
    .from("ops_v_obra_resumo")
    .select("*")
    .eq("organization_id", orgId)
    .order("criada_em", { ascending: false })
    .limit(200);
  rebentar("carregar as obras", error);
  return ((data ?? []) as unknown as ObraResumo[]).map((o) => ({
    ...o,
    minutos_reais: Number(o.minutos_reais),
  }));
}

export async function obterObra(codigo: string, orgId: string): Promise<ObraResumo | null> {
  const { data, error } = await supabase
    .from("ops_v_obra_resumo")
    .select("*")
    .eq("organization_id", orgId)
    .eq("codigo", codigo)
    .maybeSingle();
  rebentar("carregar a obra", error);
  if (!data) {
    // Não está na empresa ativa (ex.: link aberto noutro endereço, ou outra
    // empresa escolhida): procura nas que a pessoa vê — a RLS filtra.
    const { data: outras, error: e2 } = await supabase
      .from("ops_v_obra_resumo")
      .select("*")
      .eq("codigo", codigo)
      .limit(1);
    rebentar("carregar a obra", e2);
    if (!outras?.length) return null;
    const o = outras[0] as unknown as ObraResumo;
    return { ...o, minutos_reais: Number(o.minutos_reais) };
  }
  const o = data as unknown as ObraResumo;
  return { ...o, minutos_reais: Number(o.minutos_reais) };
}

export interface FaseObra {
  id: string;
  obra_id: string;
  ordem: number;
  nome: string;
}

export async function fasesDaObra(obraId: string): Promise<FaseObra[]> {
  const { data, error } = await supabase
    .from("ops_obra_fase")
    .select("id, obra_id, ordem, nome")
    .eq("obra_id", obraId)
    .order("ordem");
  rebentar("carregar as fases", error);
  return (data ?? []) as unknown as FaseObra[];
}

export interface TarefaObra {
  id: string;
  organization_id: string;
  obra_id: string;
  fase_id: string;
  modelo_tarefa_id: string | null;
  ordem: number;
  nome: string;
  procedimento: string | null;
  materiais: string | null;
  ferramentas: string | null;
  minutos_previstos: number;
  inicio_planeado: string | null;
  fim_planeado: string | null;
  depende_de: string | null;
  estado: EstadoTarefaObra;
  iniciada_em: string | null;
  terminada_em: string | null;
  motivo_desvio: MotivoDesvio | null;
  nota_desvio: string | null;
  validada_por: string | null;
  validada_em: string | null;
  motivo_rejeicao: string | null;
  fase_ordem: number;
  fase_nome: string;
  obra_codigo: string;
  obra_titulo: string;
  obra_estado: EstadoObra;
  obra_morada: string | null;
  tolerancia_percent: number;
  minutos_reais: number;
  a_correr: number;
  pessoas: string[];
  /** Todas as tarefas de que esta depende (ops_obra_tarefa_dependencia) — as setas do Gantt. */
  dependencias?: string[];
  /** Materiais do CRM ligados no passo "Serviços do contrato". */
  materiais_crm?: MaterialLigado[];
  // Atrasos (db/obras.sql, 11b) — opcionais: a app não rebenta antes de o SQL correr.
  /** Plano original (guardado no 1.º atraso/replaneamento com a obra em curso). */
  inicio_original?: string | null;
  fim_original?: string | null;
  /** Estimativa final de mão de obra depois dos atrasos. null = igual ao previsto. */
  minutos_estimativa?: number | null;
  n_atrasos?: number;
  ultimo_atraso?: UltimoAtraso | null;
  /** Devia ter começado (hora de início + 60 min) e está por fazer. */
  atrasada_inicio?: boolean;
  pessoas_previstas?: number;
  minutos_por_dia?: number;
  // Planeamento automático (db/obras.sql, 2c) — opcionais, como os atrasos.
  /** Horas de relógio de espera antes de começar (cura, fabrico). */
  espera_antes_horas?: number | null;
  /** O que mediu o tempo (m² de parede, pontos de água…) e quanto. */
  medida?: string | null;
  medida_qt?: number | null;
  /** O que se fez de facto, dito por quem terminou. */
  medida_real?: number | null;
  /** De onde veio o tempo: padrão, aprendido, ficha, mudado à mão. */
  minutos_origem?: string | null;
  ritmo_n?: number | null;
  minutos_juntos?: number | null;
  chave?: string | null;
  servico_tarefa_id?: string | null;
}

export interface UltimoAtraso {
  id: string;
  motivo: MotivoAtraso;
  contexto: string;
  minutos_extra: number | null;
  novo_fim: string | null;
  fim_anterior: string | null;
  registado_em: string;
  registado_por: string | null;
  cliente_avisado: boolean;
}

function normalizarTarefa(t: TarefaObra): TarefaObra {
  return {
    ...t,
    minutos_reais: Number(t.minutos_reais),
    pessoas: t.pessoas ?? [],
    dependencias: t.dependencias ?? (t.depende_de ? [t.depende_de] : []),
    materiais_crm: t.materiais_crm ?? [],
  };
}

export async function tarefasDaObra(obraId: string): Promise<TarefaObra[]> {
  const { data, error } = await supabase
    .from("ops_v_obra_tarefa")
    .select("*")
    .eq("obra_id", obraId)
    .order("fase_ordem")
    .order("ordem");
  rebentar("carregar as tarefas da obra", error);
  return ((data ?? []) as unknown as TarefaObra[]).map(normalizarTarefa);
}

/** As tarefas abertas em que a pessoa está, de todas as obras que vê. */
export async function minhasTarefas(orgId: string, utilizadorId: string): Promise<TarefaObra[]> {
  const { data, error } = await supabase
    .from("ops_v_obra_tarefa")
    .select("*")
    .eq("organization_id", orgId)
    .contains("pessoas", [utilizadorId])
    .in("estado", ["por_fazer", "em_curso", "rejeitada", "feita"])
    .in("obra_estado", ["planeada", "em_curso"])
    .order("inicio_planeado", { ascending: true, nullsFirst: false })
    .order("fase_ordem")
    .order("ordem")
    .limit(300);
  rebentar("carregar as tuas tarefas", error);
  return ((data ?? []) as unknown as TarefaObra[]).map(normalizarTarefa);
}

export async function tarefasPorValidar(orgId: string): Promise<TarefaObra[]> {
  const { data, error } = await supabase
    .from("ops_v_obra_tarefa")
    .select("*")
    .eq("organization_id", orgId)
    .eq("estado", "feita")
    .order("terminada_em", { ascending: true })
    .limit(300);
  rebentar("carregar as tarefas por validar", error);
  return ((data ?? []) as unknown as TarefaObra[]).map(normalizarTarefa);
}

/** Tarefas terminadas da organização — a matéria-prima das métricas. */
export async function tarefasTerminadas(orgId: string): Promise<TarefaObra[]> {
  const { data, error } = await supabase
    .from("ops_v_obra_tarefa")
    .select("*")
    .eq("organization_id", orgId)
    .in("estado", ["feita", "validada"])
    .limit(2000);
  rebentar("carregar as tarefas terminadas", error);
  return ((data ?? []) as unknown as TarefaObra[]).map(normalizarTarefa);
}

export interface RegistoObra {
  id: string;
  obra_id: string;
  tarefa_id: string;
  utilizador_id: string;
  inicio: string;
  fim: string | null;
}

const COLUNAS_REGISTO = "id, obra_id, tarefa_id, utilizador_id, inicio, fim";

export async function registosDaObra(obraId: string): Promise<RegistoObra[]> {
  const { data, error } = await supabase
    .from("ops_obra_registo")
    .select(COLUNAS_REGISTO)
    .eq("obra_id", obraId)
    .order("inicio");
  rebentar("carregar os tempos da obra", error);
  return (data ?? []) as unknown as RegistoObra[];
}

export async function registosDasTarefas(tarefaIds: readonly string[]): Promise<RegistoObra[]> {
  // Aos bocados: uma lista de ids enorme não cabe no URL do PostgREST.
  const out: RegistoObra[] = [];
  for (let i = 0; i < tarefaIds.length; i += 150) {
    const { data, error } = await supabase
      .from("ops_obra_registo")
      .select(COLUNAS_REGISTO)
      .in("tarefa_id", tarefaIds.slice(i, i + 150) as string[])
      .order("inicio");
    rebentar("carregar os tempos", error);
    out.push(...((data ?? []) as unknown as RegistoObra[]));
  }
  return out;
}

/** O relógio que tenho a correr agora (há no máximo um). */
export async function meuRegistoAberto(utilizadorId: string): Promise<RegistoObra | null> {
  const { data, error } = await supabase
    .from("ops_obra_registo")
    .select(COLUNAS_REGISTO)
    .eq("utilizador_id", utilizadorId)
    .is("fim", null)
    .limit(1);
  rebentar("ver se tens um relógio a correr", error);
  return ((data ?? [])[0] as unknown as RegistoObra) ?? null;
}

export interface ConflitoObra {
  tarefa_id: string;
  utilizador_id: string;
  outra_tarefa_id: string;
  outra_tarefa: string;
  outra_obra: string;
  outro_inicio: string | null;
  outro_fim: string | null;
}

export async function conflitosDaObra(obraId: string): Promise<ConflitoObra[]> {
  const { data, error } = await supabase
    .from("ops_v_obra_conflito")
    .select("tarefa_id, utilizador_id, outra_tarefa_id, outra_tarefa, outra_obra, outro_inicio, outro_fim")
    .eq("obra_id", obraId);
  if (error) {
    // Os choques são um aviso, não o essencial: se falharem (ex.: tempo
    // esgotado), a obra abre na mesma, sem os avisos — em vez de um erro.
    // eslint-disable-next-line no-console
    console.warn("[Obras] choques de agenda indisponíveis:", error);
    return [];
  }
  return (data ?? []) as unknown as ConflitoObra[];
}

export interface AlertaObra {
  tarefa_id: string;
  obra_id: string;
  obra_codigo: string;
  nome: string;
  estado: EstadoTarefaObra;
  minutos_previstos: number;
  minutos_reais: number;
  a_correr: number;
  nivel: "aviso" | "excedido";
}

export async function alertasDaOrganizacao(orgId: string): Promise<AlertaObra[]> {
  const { data, error } = await supabase
    .from("ops_v_obra_alerta")
    .select("tarefa_id, obra_id, obra_codigo, nome, estado, minutos_previstos, minutos_reais, a_correr, nivel")
    .eq("organization_id", orgId)
    .limit(200);
  rebentar("carregar os alertas", error);
  return ((data ?? []) as unknown as AlertaObra[]).map((a) => ({ ...a, minutos_reais: Number(a.minutos_reais) }));
}

/* ─────────────────────────────── Extras ─────────────────────────────── */

export interface ExtraObra {
  id: string;
  obra_id: string;
  tarefa_id: string | null;
  descricao: string;
  valor_estimado: number | null;
  fotos: string[];
  estado: EstadoExtra;
  motivo_recusa: string | null;
  registado_por: string | null;
  registado_em: string;
  decidido_em: string | null;
  enviado_em: string | null;
}

export async function extrasDaObra(obraId: string): Promise<ExtraObra[]> {
  const { data, error } = await supabase
    .from("ops_obra_extra")
    .select(
      "id, obra_id, tarefa_id, descricao, valor_estimado, fotos, estado, motivo_recusa, " +
        "registado_por, registado_em, decidido_em, enviado_em"
    )
    .eq("obra_id", obraId)
    .order("registado_em", { ascending: false });
  rebentar("carregar os trabalhos extra", error);
  return (data ?? []) as unknown as ExtraObra[];
}

/* ─────────────────────────────── Modelos ─────────────────────────────── */

export interface ModeloTarefa {
  id: string;
  modelo_fase_id: string;
  ordem: number;
  nome: string;
  procedimento: string | null;
  materiais: string | null;
  ferramentas: string | null;
  minutos_previstos: number;
}

export interface ModeloFase {
  id: string;
  ordem: number;
  nome: string;
  tarefas: ModeloTarefa[];
}

export interface ModeloObra {
  id: string;
  nome: string;
  descricao: string | null;
  tipo_servico: string | null;
  ativo: boolean;
  /** O tipo que vem escolhido numa obra nova a partir de orçamento/contrato. */
  por_defeito?: boolean;
  fases: ModeloFase[];
}

export async function listarModelos(orgId: string): Promise<ModeloObra[]> {
  const [m, f, t] = await Promise.all([
    supabase
      .from("ops_obra_modelo")
      .select("id, nome, descricao, tipo_servico, ativo, por_defeito")
      .eq("organization_id", orgId)
      .order("nome"),
    supabase
      .from("ops_obra_modelo_fase")
      .select("id, modelo_id, ordem, nome")
      .eq("organization_id", orgId)
      .order("ordem"),
    supabase
      .from("ops_obra_modelo_tarefa")
      .select("id, modelo_id, modelo_fase_id, ordem, nome, procedimento, materiais, ferramentas, minutos_previstos")
      .eq("organization_id", orgId)
      .order("ordem"),
  ]);
  rebentar("carregar os modelos", m.error ?? f.error ?? t.error);
  const tarefas = (t.data ?? []) as unknown as (ModeloTarefa & { modelo_id: string })[];
  const fases = (f.data ?? []) as unknown as { id: string; modelo_id: string; ordem: number; nome: string }[];
  return ((m.data ?? []) as unknown as Omit<ModeloObra, "fases">[]).map((mod) => ({
    ...mod,
    fases: fases
      .filter((x) => x.modelo_id === mod.id)
      .map((x) => ({
        id: x.id,
        ordem: x.ordem,
        nome: x.nome,
        tarefas: tarefas.filter((y) => y.modelo_fase_id === x.id),
      })),
  }));
}

export interface FaseParaGravar {
  ordem: number;
  nome: string;
  tarefas: {
    id?: string;
    nome: string;
    procedimento?: string | null;
    materiais?: string | null;
    ferramentas?: string | null;
    minutos_previstos: number;
  }[];
}

export function gravarModelo(args: {
  orgId: string;
  modeloId: string | null;
  nome: string;
  descricao: string | null;
  tipoServico: string | null;
  fases: FaseParaGravar[];
  ativo?: boolean;
}): Promise<{ ok: boolean; id: string; tarefas: number }> {
  return rpc(
    "rpc_ops_obra_gravar_modelo",
    {
      p_org: args.orgId,
      p_modelo_id: args.modeloId,
      p_nome: args.nome,
      p_descricao: args.descricao,
      p_tipo_servico: args.tipoServico,
      p_fases: args.fases,
      p_ativo: args.ativo ?? true,
    },
    "Não foi possível gravar o modelo."
  );
}

export function semearModeloExemplo(orgId: string): Promise<{ ok: boolean; id: string }> {
  return rpc("rpc_ops_obra_semear_modelo_exemplo", { p_org: orgId }, "Não foi possível criar o exemplo.");
}

/* ───────────────────────── Fontes no CRM (só leitura) ───────────────────────── */

export interface ContratoAssinado {
  id: string;
  cliente_id: string | null;
  numero: string;
  estado: string;
  orcamento_id: string | null;
  titulo: string;
  obra_endereco: string | null;
  assinado_em: string | null;
  valor: number | null;
  tem_obra: boolean;
  /** Linhas de serviço do orçamento do contrato (viram tarefas). Ausente em bases antigas. */
  n_servicos?: number | null;
  /** Linhas só de produto. */
  n_produtos?: number | null;
}

/**
 * Contratos assinados (vista `ops_v_contrato`). Se a vista não existir — base
 * sem o módulo de contratos — devolve lista vazia e diz porquê, em vez de
 * rebentar o ecrã inteiro.
 */
export async function listarContratos(
  orgId: string
): Promise<{ contratos: ContratoAssinado[]; indisponivel: boolean }> {
  const { data, error } = await supabase
    .from("ops_v_contrato")
    // "*": as colunas n_servicos/n_produtos só existem depois do SQL novo.
    .select("*")
    .eq("organization_id", orgId)
    .order("assinado_em", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[Obras] contratos indisponíveis:", error);
    return { contratos: [], indisponivel: true };
  }
  return { contratos: (data ?? []) as unknown as ContratoAssinado[], indisponivel: false };
}

/** Os orçamentos que já têm obra (para os tirar da lista de "por pôr a andar"). */
export async function orcamentosComObra(orgId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("ops_obra")
    .select("orcamento_id")
    .eq("organization_id", orgId)
    .neq("estado", "cancelada")
    .not("orcamento_id", "is", null);
  rebentar("ver que orçamentos já têm obra", error);
  return new Set(((data ?? []) as { orcamento_id: string }[]).map((r) => r.orcamento_id));
}

export interface TarefaPrevista {
  fase: number;
  nome: string;
  minutos: number;
  sem_ficha: boolean;
  materiais: string | null;
}

export interface PrevisaoOrcamento {
  orcamento_id: string | null;
  tarefas: TarefaPrevista[];
  minutos: number;
  sem_ficha: number;
}

/**
 * As tarefas que uma obra SEM modelo vai ter, vindas dos serviços do
 * orçamento (ou do orçamento do contrato): uma por serviço, com o tempo da
 * ficha técnica. Só lê.
 */
export function previsaoDoOrcamento(args: {
  orgId: string;
  orcamentoId?: string | null;
  contratoId?: string | null;
}): Promise<PrevisaoOrcamento> {
  return rpc(
    "rpc_ops_obra_previsao_orcamento",
    {
      p_org: args.orgId,
      p_orcamento_id: args.orcamentoId ?? null,
      p_contrato_id: args.contratoId ?? null,
    },
    "Não foi possível ler os serviços do orçamento."
  );
}

/**
 * O passo 2 da Nova obra, "Serviços do contrato": cada serviço vendido com as
 * tarefas que vai ter (do modelo do serviço, ou sugeridas pela biblioteca),
 * datas, pessoas sugeridas e quem está livre. A base cria a obra numa
 * subtransação e desfaz — nada fica gravado. Com `tarefas`, recalcula com as
 * tarefas já editadas.
 */
export function previsaoDoContrato(args: {
  orgId: string;
  contratoId?: string | null;
  orcamentoId?: string | null;
  modeloId?: string | null;
  dataInicio?: string | null;
  morada?: string | null;
  tarefas?: TarefaParaCriar[] | null;
}): Promise<PrevisaoContrato> {
  return rpc(
    "rpc_ops_obra_previsao_contrato",
    {
      p_org: args.orgId,
      p_contrato_id: args.contratoId ?? null,
      p_orcamento_id: args.orcamentoId ?? null,
      p_modelo_id: args.modeloId ?? null,
      p_data_inicio: args.dataInicio ?? null,
      p_morada: args.morada ?? null,
      p_tarefas: args.tarefas ?? null,
    },
    "Não foi possível preparar os serviços do contrato."
  );
}

/** Stock dos produtos (por ids, ou pesquisa por nome/SKU). Só lê o inventário do CRM; não reserva. */
export async function stockDosProdutos(args: {
  orgId: string;
  produtoIds?: readonly string[] | null;
  pesquisa?: string | null;
  limite?: number;
}): Promise<{ com_inventario: boolean; com_reservas?: boolean; produtos: ProdutoStock[] }> {
  const r = await rpc<{ com_inventario: boolean; com_reservas?: boolean; produtos: ProdutoStock[] | null }>(
    "rpc_ops_obra_stock",
    {
      p_org: args.orgId,
      p_produto_ids: args.produtoIds ?? null,
      p_pesquisa: args.pesquisa ?? null,
      p_limite: args.limite ?? 30,
    },
    "Não foi possível ler o stock."
  );
  return {
    ...r,
    produtos: (r.produtos ?? []).map((p) => ({
      ...p,
      stock: p.stock == null ? null : Number(p.stock),
      reservado: Number(p.reservado ?? 0),
      disponivel: p.disponivel == null ? null : Number(p.disponivel),
    })),
  };
}

export interface PessoaLivre {
  utilizador_id: string;
  nome: string;
  funcao: string;
  skills: string[];
  zona: string | null;
  minutos_ocupados: number;
  dias_cheios: number;
  ordens: number;
  livre: boolean;
  /** Porque não está livre ('ausência: Férias', 'feriado: …', 'agenda cheia: OB-…', 'ordem OT-…'); null se livre. */
  motivo: string | null;
}

/**
 * Quem está livre entre duas datas (≥ 8 h planeadas num dia ou uma ordem
 * agendada = ocupado). Devolve toda a gente ativa, com `livre`.
 */
export async function pessoasLivres(args: {
  orgId: string;
  inicio: string;
  fim?: string | null;
  excluirTarefa?: string | null;
}): Promise<PessoaLivre[]> {
  const r = await rpc<PessoaLivre[] | null>(
    "rpc_ops_pessoas_livres",
    {
      p_org: args.orgId,
      p_inicio: args.inicio,
      p_fim: args.fim ?? null,
      p_excluir_tarefa: args.excluirTarefa ?? null,
    },
    "Não foi possível ler a agenda da equipa."
  );
  return r ?? [];
}

/** "Depois de": substitui as dependências da tarefa (recusa ciclos). */
export function gravarDependencias(tarefaId: string, dependeDe: readonly string[]) {
  return rpc<{ ok: boolean; dependencias: string[]; antes_de_acabar: string[] }>(
    "rpc_ops_obra_gravar_dependencias",
    { p_tarefa_id: tarefaId, p_depende_de: dependeDe },
    "Não foi possível gravar as dependências."
  );
}

/** A morada que a obra vai ter: a do orçamento/contrato, ou a do cliente. Só lê. */
export async function moradaSugerida(args: {
  orgId: string;
  clienteId?: string | null;
  orcamentoId?: string | null;
  contratoId?: string | null;
}): Promise<string | null> {
  const r = await rpc<string | null>(
    "rpc_ops_obra_morada_sugerida",
    {
      p_org: args.orgId,
      p_cliente_id: args.clienteId ?? null,
      p_orcamento_id: args.orcamentoId ?? null,
      p_contrato_id: args.contratoId ?? null,
    },
    "Não foi possível ler a morada."
  );
  return r ?? null;
}

/* ─────────────────────────────── Escritas ─────────────────────────────── */

export interface ConflitoRpc {
  utilizador_id: string;
  nome: string;
  tarefa_id: string;
  tarefa: string;
  obra_codigo: string;
  inicio: string | null;
  fim: string | null;
}

export function criarObra(args: {
  orgId: string;
  titulo?: string | null;
  clienteId?: string | null;
  modeloId?: string | null;
  dataInicio?: string | null;
  orcamentoId?: string | null;
  contratoId?: string | null;
  morada?: string | null;
  gestorId?: string | null;
  supervisorId?: string | null;
  /** As tarefas dos serviços revistas no passo 2. Omitido = expansão automática de sempre. */
  tarefas?: TarefaParaCriar[] | null;
}): Promise<{ ok: boolean; id: string; codigo: string; tarefas: number }> {
  const params: Record<string, unknown> = {
    p_org: args.orgId,
    p_titulo: args.titulo ?? null,
    p_cliente_id: args.clienteId ?? null,
    p_modelo_id: args.modeloId ?? null,
    p_data_inicio: args.dataInicio ?? null,
    p_orcamento_id: args.orcamentoId ?? null,
    p_contrato_id: args.contratoId ?? null,
    p_morada: args.morada ?? null,
    p_gestor_id: args.gestorId ?? null,
    p_supervisor_id: args.supervisorId ?? null,
  };
  // Só se manda quando há: assim a chamada de sempre continua igual.
  if (args.tarefas) params.p_tarefas = args.tarefas;
  return rpc("rpc_ops_obra_criar", params, "Não foi possível abrir a obra.");
}

export function atualizarObra(args: {
  obraId: string;
  titulo: string;
  morada: string | null;
  gestorId: string | null;
  supervisorId: string | null;
  tolerancia: number | null;
}): Promise<{ ok: boolean }> {
  return rpc(
    "rpc_ops_obra_atualizar",
    {
      p_obra_id: args.obraId,
      p_titulo: args.titulo,
      p_morada: args.morada,
      p_gestor_id: args.gestorId,
      p_supervisor_id: args.supervisorId,
      p_tolerancia: args.tolerancia,
    },
    "Não foi possível gravar a obra."
  );
}

export function mudarEstadoObra(obraId: string, estado: EstadoObra, motivo?: string | null) {
  return rpc<{ ok: boolean; estado: EstadoObra }>(
    "rpc_ops_obra_mudar_estado",
    { p_obra_id: obraId, p_estado: estado, p_motivo: motivo ?? null },
    "Não foi possível mudar o estado da obra."
  );
}

/** `dataInicio` null = a primeira data em que a equipa está livre (replaneia e redistribui). */
export function replanearObra(obraId: string, dataInicio: string | null) {
  return rpc<{ ok: boolean; tarefas: number; inicio: string }>(
    "rpc_ops_obra_replanear",
    { p_obra_id: obraId, p_data_inicio: dataInicio },
    "Não foi possível replanear."
  );
}

/** Distribui a equipa pelas tarefas sem ninguém; `refazer` redistribui as que ninguém começou. */
export function distribuirEquipa(obraId: string, refazer = false) {
  return rpc<{ ok: boolean; tarefas: number }>(
    "rpc_ops_obra_distribuir",
    { p_obra_id: obraId, p_refazer: refazer },
    "Não foi possível distribuir a equipa."
  );
}

export function renomearFase(faseId: string, nome: string) {
  return rpc<{ ok: boolean }>("rpc_ops_obra_gravar_fase", { p_fase_id: faseId, p_nome: nome }, "Não foi possível gravar a fase.");
}

export function gravarTarefa(args: {
  obraId: string;
  tarefaId: string | null;
  faseId: string;
  nome: string;
  minutos: number;
  procedimento?: string | null;
  materiais?: string | null;
  ferramentas?: string | null;
  inicio?: string | null;
  fim?: string | null;
  dependeDe?: string | null;
}): Promise<{ ok: boolean; id: string; conflitos: ConflitoRpc[] }> {
  return rpc(
    "rpc_ops_obra_gravar_tarefa",
    {
      p_obra_id: args.obraId,
      p_tarefa_id: args.tarefaId,
      p_fase_id: args.faseId,
      p_nome: args.nome,
      p_minutos: args.minutos,
      p_procedimento: args.procedimento ?? null,
      p_materiais: args.materiais ?? null,
      p_ferramentas: args.ferramentas ?? null,
      p_inicio: args.inicio ?? null,
      p_fim: args.fim ?? null,
      p_depende_de: args.dependeDe ?? null,
    },
    "Não foi possível gravar a tarefa."
  );
}

export function planearTarefa(tarefaId: string, inicio: string, fim: string) {
  return rpc<{ ok: boolean; conflitos: ConflitoRpc[] }>(
    "rpc_ops_obra_planear_tarefa",
    { p_tarefa_id: tarefaId, p_inicio: inicio, p_fim: fim },
    "Não foi possível mudar as datas."
  );
}

export function apagarTarefa(tarefaId: string) {
  return rpc<{ ok: boolean }>("rpc_ops_obra_apagar_tarefa", { p_tarefa_id: tarefaId }, "Não foi possível apagar a tarefa.");
}

export function atribuirTarefa(tarefaId: string, pessoas: readonly string[]) {
  return rpc<{ ok: boolean; pessoas: number; conflitos: ConflitoRpc[] }>(
    "rpc_ops_obra_atribuir_tarefa",
    { p_tarefa_id: tarefaId, p_pessoas: pessoas },
    "Não foi possível atribuir a tarefa."
  );
}

export interface RespostaTempo {
  ok: boolean;
  estado: EstadoTarefaObra;
  minutos_reais: number;
  minutos_previstos: number;
  excedido?: boolean;
}

export function iniciarTarefa(tarefaId: string) {
  return rpc<RespostaTempo>("rpc_ops_obra_iniciar_tarefa", { p_tarefa_id: tarefaId }, "Não foi possível iniciar.");
}

export function terminarTarefa(args: {
  tarefaId: string;
  concluir: boolean;
  motivo?: MotivoDesvio | null;
  nota?: string | null;
  /** Quanto se fez de facto (ex.: 18 m²). Sem ela, fica a prevista. */
  medidaReal?: number | null;
}) {
  return rpc<RespostaTempo>(
    "rpc_ops_obra_terminar_tarefa",
    {
      p_tarefa_id: args.tarefaId,
      p_concluir: args.concluir,
      p_motivo: args.motivo ?? null,
      p_nota: args.nota ?? null,
      // Só se manda quando há: a base de antes da atualização não a conhece.
      ...(args.medidaReal != null ? { p_medida_real: args.medidaReal } : {}),
    },
    "Não foi possível terminar."
  );
}

export function validarTarefa(tarefaId: string, aprovar: boolean, motivo?: string | null) {
  return rpc<{ ok: boolean; estado: EstadoTarefaObra }>(
    "rpc_ops_obra_validar_tarefa",
    { p_tarefa_id: tarefaId, p_aprovar: aprovar, p_motivo: motivo ?? null },
    "Não foi possível validar."
  );
}

export function registarExtra(args: {
  obraId: string;
  descricao: string;
  valor?: number | null;
  tarefaId?: string | null;
}) {
  return rpc<{ ok: boolean; id: string }>(
    "rpc_ops_obra_registar_extra",
    {
      p_obra_id: args.obraId,
      p_descricao: args.descricao,
      p_valor: args.valor ?? null,
      p_tarefa_id: args.tarefaId ?? null,
    },
    "Não foi possível registar o extra."
  );
}

export function decidirExtra(extraId: string, acao: "aprovar" | "recusar" | "enviar", motivo?: string | null) {
  return rpc<{ ok: boolean; estado: EstadoExtra }>(
    "rpc_ops_obra_decidir_extra",
    { p_extra_id: extraId, p_acao: acao, p_motivo: motivo ?? null },
    "Não foi possível decidir o extra."
  );
}

/* ─────────────────────────── Previsto vs real ─────────────────────────── */

export interface CustosObra {
  obra_id: string;
  ve_custos: boolean;
  minutos_previstos: number;
  minutos_reais: number;
  por_fase: { fase_id: string; ordem: number; nome: string; minutos_previstos: number; minutos_reais: number }[];
  por_pessoa: { utilizador_id: string; nome: string; minutos: number; custo: number | null; sem_tarifa: boolean | null }[];
  custo_previsto: number | null;
  custo_real: number | null;
  sem_tarifa: number | null;
  orcado_mao_obra: number | null;
}

export async function custosDaObra(obraId: string): Promise<CustosObra> {
  const { data, error } = await supabase.rpc("rpc_ops_obra_custos", { p_obra_id: obraId });
  rebentar("calcular o previsto contra o real", error);
  return data as unknown as CustosObra;
}

/* ─────────────────────────── Modelos por serviço ─────────────────────────── */

export interface TarefaServico {
  id?: string;
  ordem?: number;
  nome: string;
  fase: number;
  minutos_por_unidade: number;
  minutos_fixos: number;
  pessoas: number;
  skill_id: string | null;
  depende_ordem: number | null;
  procedimento: string | null;
  materiais: string | null;
  ferramentas: string | null;
  origem?: "manual" | "sugerida" | "padrao";
  // Planeamento automático (2c).
  /** Código estável do passo ("3.3"), para os extras se encaixarem. */
  chave?: string | null;
  depende_chaves?: string[];
  espera_antes_horas?: number;
  medida?: string;
  /** {servicos: [id], ficha: {campo, valores}} — só se lê aqui. */
  condicao?: { servicos?: string[]; ficha?: { campo: string; valores: string[] } } | null;
  /** Por tipo de pacote: {modo: 'junta'|'entre'|'livre', alvo}. Só se lê aqui. */
  encaixe?: Record<string, { modo: string; alvo?: string | string[] }> | null;
  fatores?: string[];
}

export interface PerfilServico {
  tipo: "casa_banho" | "cozinha" | null;
  medidas: Record<string, number>;
  planear: boolean;
  medida_para: string | null;
}

export interface ServicoComModelo {
  servico_id: string;
  nome: string;
  sku: string | null;
  categoria: string | null;
  horas: number | null;
  pessoas: number | null;
  descricao_mao_obra: string | null;
  tarefas: TarefaServico[];
  editado: boolean;
  /** Tem os tempos padrão (manuais operacionais). */
  padrao?: boolean;
  perfil?: PerfilServico | null;
}

export interface RitmoAprendido {
  servico_tarefa_id: string;
  fatores_chave: string;
  n: number;
  minutos_fixos: number;
  minutos_por_unidade: number;
  padrao_fixos: number;
  padrao_por_unidade: number;
  atualizado_em: string;
}

/** O ritmo aprendido de cada passo de modelo (antes do SQL novo a tabela não existe → []). */
export async function ritmosAprendidos(orgId: string): Promise<RitmoAprendido[]> {
  const { data, error } = await supabase
    .from("ops_obra_ritmo")
    .select("servico_tarefa_id, fatores_chave, n, minutos_fixos, minutos_por_unidade, padrao_fixos, padrao_por_unidade, atualizado_em")
    .eq("organization_id", orgId);
  if (error) return [];
  return ((data ?? []) as unknown as RitmoAprendido[]).map((r) => ({
    ...r,
    n: Number(r.n),
    minutos_fixos: Number(r.minutos_fixos),
    minutos_por_unidade: Number(r.minutos_por_unidade),
    padrao_fixos: Number(r.padrao_fixos),
    padrao_por_unidade: Number(r.padrao_por_unidade),
  }));
}

/** "Carregar tempos padrão": os manuais de casa de banho e cozinha, pelos nomes dos serviços. */
export function semearTemposPadrao(orgId: string, substituir = false) {
  return rpc<{ ok: boolean; versao: string; servicos: number; passos: number; saltados: string[]; nao_encontrados: string[] }>(
    "rpc_ops_obra_semear_tempos_padrao",
    { p_org: orgId, p_substituir: substituir },
    "Não foi possível carregar os tempos padrão."
  );
}

export interface Skill {
  id: string;
  nome: string;
}

/** Os serviços do catálogo do CRM desta organização, com o modelo de cada um. */
export async function listarServicosComModelo(orgId: string): Promise<ServicoComModelo[]> {
  const r = await rpc<ServicoComModelo[] | null>(
    "rpc_ops_servicos_com_modelo",
    { p_org: orgId },
    "Não foi possível carregar os serviços."
  );
  return r ?? [];
}

/** Gera modelos pela biblioteca: um serviço, ou todos os que faltam (`substituir` refaz os sugeridos). */
export function sugerirModelos(args: { orgId: string; servicoId?: string | null; substituir?: boolean }) {
  return rpc<{ ok: boolean; servicos: number; tarefas: number }>(
    "rpc_ops_servico_modelo_sugerir",
    { p_org: args.orgId, p_servico_id: args.servicoId ?? null, p_substituir: args.substituir ?? false },
    "Não foi possível gerar os modelos."
  );
}

export function gravarModeloServico(orgId: string, servicoId: string, tarefas: TarefaServico[]) {
  return rpc<{ ok: boolean; tarefas: number }>(
    "rpc_ops_servico_modelo_gravar",
    {
      p_org: orgId,
      p_servico_id: servicoId,
      p_tarefas: tarefas.map((t) => ({
        nome: t.nome,
        fase: t.fase,
        minutos_por_unidade: t.minutos_por_unidade,
        minutos_fixos: t.minutos_fixos,
        pessoas: t.pessoas,
        skill_id: t.skill_id,
        depende_ordem: t.depende_ordem,
        procedimento: t.procedimento,
        materiais: t.materiais,
        ferramentas: t.ferramentas,
        // A condição, o encaixe e os fatores não se mandam: a base guarda os
        // que lá estão, pela chave do passo.
        ...(t.chave ? { chave: t.chave } : {}),
        ...(t.depende_chaves ? { depende_chaves: t.depende_chaves } : {}),
        ...(t.espera_antes_horas != null ? { espera_antes_horas: t.espera_antes_horas } : {}),
        ...(t.medida ? { medida: t.medida } : {}),
      })),
    },
    "Não foi possível gravar o modelo."
  );
}

export async function listarSkills(orgId: string): Promise<Skill[]> {
  const { data, error } = await supabase
    .from("ops_skill")
    .select("id, nome")
    .eq("organization_id", orgId)
    .eq("ativo", true)
    .order("nome");
  rebentar("carregar as especialidades", error);
  return (data ?? []) as unknown as Skill[];
}

export function criarSkill(orgId: string, nome: string) {
  return rpc<{ ok: boolean; id: string }>("rpc_ops_skill_criar", { p_org: orgId, p_nome: nome }, "Não foi possível criar a especialidade.");
}

export function tornarTipoPorDefeito(modeloId: string) {
  return rpc<{ ok: boolean }>("rpc_ops_obra_modelo_por_defeito", { p_modelo_id: modeloId }, "Não foi possível mudar o tipo por defeito.");
}

/** Zona base e especialidades de cada pessoa da equipa (para a distribuição automática). */
export async function planeamentoDaEquipa(
  orgId: string
): Promise<Map<string, { zona: string | null; skills: string[] }>> {
  const [p, s] = await Promise.all([
    supabase.from("ops_utilizador_perfil").select("utilizador_id, zona_base").eq("organization_id", orgId),
    supabase.from("ops_utilizador_skill").select("utilizador_id, skill_id, ops_skill!inner(organization_id)").eq("ops_skill.organization_id", orgId),
  ]);
  rebentar("carregar a zona e as especialidades", p.error ?? s.error);
  const out = new Map<string, { zona: string | null; skills: string[] }>();
  for (const r of (p.data ?? []) as { utilizador_id: string; zona_base: string | null }[]) {
    out.set(r.utilizador_id, { zona: r.zona_base, skills: [] });
  }
  for (const r of (s.data ?? []) as unknown as { utilizador_id: string; skill_id: string }[]) {
    out.get(r.utilizador_id)?.skills.push(r.skill_id);
  }
  return out;
}

export function gravarPlaneamentoPessoa(args: { orgId: string; utilizadorId: string; zona: string | null; skills: string[] }) {
  return rpc<{ ok: boolean }>(
    "rpc_ops_pessoa_planeamento",
    { p_org: args.orgId, p_utilizador: args.utilizadorId, p_zona: args.zona, p_skills: args.skills },
    "Não foi possível gravar a zona e as especialidades."
  );
}

/* ─────────────────────────────── Atrasos e alertas ─────────────────────────────── */

export interface AtrasoTarefa {
  id: string;
  obra_id: string;
  tarefa_id: string;
  motivo: MotivoAtraso;
  contexto: string;
  minutos_extra: number | null;
  novo_fim: string | null;
  fim_anterior: string | null;
  registado_por: string | null;
  registado_em: string;
  cliente_avisado: boolean;
  cliente_avisado_em: string | null;
  cliente_avisado_por: string | null;
  nota_cliente: string | null;
}

const COLUNAS_ATRASO =
  "id, obra_id, tarefa_id, motivo, contexto, minutos_extra, novo_fim, fim_anterior, registado_por, " +
  "registado_em, cliente_avisado, cliente_avisado_em, cliente_avisado_por, nota_cliente";

/** Os atrasos de uma obra (ou de uma tarefa), o mais recente primeiro. */
export async function atrasosDaObra(obraId: string, tarefaId?: string | null): Promise<AtrasoTarefa[]> {
  let pedido = supabase.from("ops_obra_tarefa_atraso").select(COLUNAS_ATRASO).eq("obra_id", obraId);
  if (tarefaId) pedido = pedido.eq("tarefa_id", tarefaId);
  const { data, error } = await pedido.order("registado_em", { ascending: false }).limit(500);
  rebentar("carregar os atrasos", error);
  return (data ?? []) as unknown as AtrasoTarefa[];
}

export interface EmpurradaAtraso {
  tarefa_id: string;
  nome: string;
  inicio_anterior: string | null;
  fim_anterior: string | null;
  novo_inicio: string;
  novo_fim: string;
}

export interface RespostaAtraso {
  ok: boolean;
  simulado: boolean;
  atraso_id: string | null;
  fim_anterior: string | null;
  novo_fim: string;
  minutos_estimativa: number | null;
  empurradas: EmpurradaAtraso[];
  fim_obra_anterior: string | null;
  fim_obra_novo: string | null;
}

export interface ArgsAtraso {
  tarefaId: string;
  motivo: MotivoAtraso | null;
  contexto: string;
  minutosExtra?: number | null;
  novoFim?: string | null;
  empurrar?: boolean;
}

function argsAtraso(a: ArgsAtraso, simular: boolean) {
  return {
    p_tarefa_id: a.tarefaId,
    p_motivo: a.motivo,
    p_contexto: a.contexto,
    p_minutos_extra: a.minutosExtra ?? null,
    p_novo_fim: a.novoFim || null,
    p_empurrar: a.empurrar ?? true,
    p_simular: simular,
  };
}

/** Regista o atraso: novo fim, plano original guardado, dependentes empurradas. */
export function registarAtraso(a: ArgsAtraso): Promise<RespostaAtraso> {
  return rpc("rpc_ops_obra_registar_atraso", argsAtraso(a, false), "Não foi possível registar o atraso.");
}

/** A mesma conta, sem gravar nada: o impacto (novo fim da tarefa e da obra). */
export function simularAtraso(a: ArgsAtraso): Promise<RespostaAtraso> {
  return rpc("rpc_ops_obra_registar_atraso", argsAtraso(a, true), "Não foi possível calcular o impacto.");
}

export function marcarClienteAvisado(atrasoId: string, nota?: string | null) {
  return rpc<{ ok: boolean; ja_avisado: boolean }>(
    "rpc_ops_obra_cliente_avisado",
    { p_atraso_id: atrasoId, p_nota: nota?.trim() || null },
    "Não foi possível marcar o cliente como avisado."
  );
}

export interface AlertaSupervisao {
  tipo: TipoAlerta;
  gravidade: number;
  tarefa_id: string;
  obra_id: string;
  obra_codigo: string;
  obra_titulo: string;
  tarefa_nome: string;
  pessoas: string[];
  pessoas_nomes: string[];
  desde: string | null;
  minutos_atraso: number | null;
  detalhe: string;
  atraso_id: string | null;
}

/**
 * Os alertas que a pessoa deve ver (gestor/admin: todas as obras; supervisor:
 * as suas; os outros: nenhum). O pior primeiro. Não confundir com
 * `alertasDaOrganizacao` (tarefas a ≥ 80 % do tempo previsto).
 */
export async function alertasDeSupervisao(orgId: string): Promise<AlertaSupervisao[]> {
  const { data, error } = await supabase.rpc("rpc_ops_obra_alertas", { p_org: orgId });
  rebentar("carregar os alertas de atraso", error);
  return ((data ?? []) as unknown as AlertaSupervisao[]).map((a) => ({
    ...a,
    pessoas: a.pessoas ?? [],
    pessoas_nomes: a.pessoas_nomes ?? [],
  }));
}

/** Os alertas de uma obra (filtrados dos da organização). */
export async function alertasDaObra(orgId: string, obraId: string): Promise<AlertaSupervisao[]> {
  return (await alertasDeSupervisao(orgId)).filter((a) => a.obra_id === obraId);
}

/** Uma tarefa (a linha da vista), para abrir a folha do atraso a partir de um alerta. */
export async function obterTarefa(tarefaId: string): Promise<TarefaObra | null> {
  const { data, error } = await supabase.from("ops_v_obra_tarefa").select("*").eq("id", tarefaId).maybeSingle();
  rebentar("carregar a tarefa", error);
  return data ? normalizarTarefa(data as unknown as TarefaObra) : null;
}

/** Avisa o resto da app (o contador do menu) de que os alertas mudaram. */
export const EVENTO_ALERTAS = "ops:alertas-mudaram";
export function avisarAlertasMudaram(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_ALERTAS));
}
