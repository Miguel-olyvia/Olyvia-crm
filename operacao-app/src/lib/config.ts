/**
 * Pôr os dados lá dentro: locais, equipamentos, medições, checklists, equipa.
 *
 * Separado de `dados.ts` porque é outra coisa: aquele lê e escreve o trabalho
 * do dia-a-dia, este monta a operação. Quem anda a executar ordens nunca
 * abre nada daqui.
 */

import { supabase } from "./supabase";
import { ErroDeEscrita, ErroDeDados } from "./dados";

function rebentar(contexto: string, error: { message: string } | null): void {
  if (!error) return;
  // eslint-disable-next-line no-console
  console.error(`[Operações] ${contexto}:`, error);
  throw new ErroDeDados(`Não foi possível ${contexto}.`);
}

/**
 * Erros da base traduzidos para quem os vai ler.
 *
 * "duplicate key value violates unique constraint ops_local_organization_id_codigo_key"
 * não diz nada a quem está a criar um local. "Já existe um local com esse
 * código" diz tudo.
 */
function traduzir(mensagem: string, coisa: string): string {
  if (mensagem.includes("duplicate key")) return `Já existe um ${coisa} com esse código.`;
  if (mensagem.includes("row-level security")) {
    return `Sem permissão para criar ou editar ${coisa}s.`;
  }
  if (mensagem.includes("violates check constraint")) {
    return `Um dos campos tem um valor que não é aceite.`;
  }
  if (mensagem.includes("violates foreign key")) {
    return `Aponta para algo que já não existe. Recarrega a página.`;
  }
  return mensagem || `Não foi possível gravar o ${coisa}.`;
}

/** Um código que ninguém tem de inventar: LOC-2026-00001. */
export async function proximoCodigo(orgId: string, prefixo: string): Promise<string> {
  const { data, error } = await supabase.rpc("rpc_ops_proximo_codigo", {
    p_organization_id: orgId,
    p_prefixo: prefixo,
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível gerar o código.");
  return data as unknown as string;
}

/* ─────────────────────── Locais e equipamentos ────────────────────── */

export async function gravarLocal(l: {
  id?: string | null;
  orgId: string;
  clienteId: string;
  codigo: string;
  nome: string;
  tipo: string;
  parentId?: string | null;
  morada?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<void> {
  const linha = {
    organization_id: l.orgId,
    cliente_id: l.clienteId,
    codigo: l.codigo,
    nome: l.nome,
    tipo: l.tipo,
    parent_id: l.parentId ?? null,
    morada: l.morada ?? null,
    // Meia coordenada não é um sítio: ou vão as duas, ou vai nulo nas duas.
    // A base tem a mesma regra em `ops_local_coordenadas_validas`.
    latitude: l.latitude ?? null,
    longitude: l.longitude ?? null,
  };
  const { error } = l.id
    ? await supabase.from("ops_local").update(linha).eq("id", l.id)
    : await supabase.from("ops_local").insert(linha);
  if (error) throw new ErroDeEscrita(traduzir(error.message, "local"));
}

export async function gravarAtivo(a: {
  id?: string | null;
  orgId: string;
  localId: string;
  categoriaId?: string | null;
  codigo: string;
  nome: string;
  marca?: string | null;
  modelo?: string | null;
  numeroSerie?: string | null;
  criticidade?: string;
  centroCustoId?: string | null;
}): Promise<void> {
  const linha = {
    organization_id: a.orgId,
    local_id: a.localId,
    categoria_id: a.categoriaId ?? null,
    codigo: a.codigo,
    nome: a.nome,
    marca: a.marca ?? null,
    modelo: a.modelo ?? null,
    num_serie: a.numeroSerie ?? null,
    criticidade: a.criticidade ?? "normal",
    // O centro de custo do equipamento é o que as ordens dele herdam.
    centro_custo_id: a.centroCustoId ?? null,
  };
  const { error } = a.id
    ? await supabase.from("ops_ativo").update(linha).eq("id", a.id)
    : await supabase.from("ops_ativo").insert(linha);
  if (error) throw new ErroDeEscrita(traduzir(error.message, "equipamento"));
}

export interface CategoriaAtivo {
  id: string;
  codigo: string;
  nome: string;
}

export async function listarCategorias(orgId: string): Promise<CategoriaAtivo[]> {
  const { data, error } = await supabase
    .from("ops_categoria_ativo")
    .select("id, codigo, nome")
    .eq("organization_id", orgId)
    .order("nome");
  rebentar("carregar as categorias", error);
  return (data ?? []) as unknown as CategoriaAtivo[];
}

export async function gravarCategoria(c: {
  id?: string | null;
  orgId: string;
  codigo: string;
  nome: string;
}): Promise<void> {
  const linha = { organization_id: c.orgId, codigo: c.codigo, nome: c.nome };
  const { error } = c.id
    ? await supabase.from("ops_categoria_ativo").update(linha).eq("id", c.id)
    : await supabase.from("ops_categoria_ativo").insert(linha);
  if (error) throw new ErroDeEscrita(traduzir(error.message, "categoria"));
}

/* ───────────────────────────── Medições ───────────────────────────── */

export interface MedicaoDef {
  id: string;
  categoria_ativo_id: string | null;
  nome: string;
  tipo: "gama" | "acumulado" | "escolha" | "texto";
  unidade: string | null;
  limite_min: number | null;
  limite_max: number | null;
}

export interface OpcaoDef {
  id: string;
  medicao_def_id: string;
  nome: string;
  posicao: number;
  e_nao_conforme: boolean;
  cria_corretiva: boolean;
}

export async function listarMedicoes(orgId: string): Promise<MedicaoDef[]> {
  const { data, error } = await supabase
    .from("ops_medicao_def")
    .select("id, categoria_ativo_id, nome, tipo, unidade, limite_min, limite_max")
    .eq("organization_id", orgId)
    .order("nome");
  rebentar("carregar as medições", error);
  return (data ?? []) as unknown as MedicaoDef[];
}

export async function opcoesDasMedicoes(defIds: readonly string[]): Promise<OpcaoDef[]> {
  if (defIds.length === 0) return [];
  const { data, error } = await supabase
    .from("ops_medicao_opcao")
    .select("id, medicao_def_id, nome, posicao, e_nao_conforme, cria_corretiva")
    .in("medicao_def_id", defIds as string[])
    .order("posicao");
  rebentar("carregar as opções", error);
  return (data ?? []) as unknown as OpcaoDef[];
}

export async function gravarMedicao(m: {
  id?: string | null;
  orgId: string;
  nome: string;
  tipo: string;
  categoriaId?: string | null;
  unidade?: string | null;
  limiteMin?: number | null;
  limiteMax?: number | null;
  opcoes?: { nome: string; e_nao_conforme?: boolean; cria_corretiva?: boolean }[];
}): Promise<{ ok: boolean; id: string }> {
  const { data, error } = await supabase.rpc("rpc_ops_gravar_medicao", {
    p_medicao_id: m.id ?? null,
    p_org_id: m.orgId,
    p_nome: m.nome,
    p_tipo: m.tipo,
    p_categoria_id: m.categoriaId ?? null,
    p_unidade: m.unidade ?? null,
    p_limite_min: m.limiteMin ?? null,
    p_limite_max: m.limiteMax ?? null,
    p_opcoes: m.opcoes ?? [],
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível gravar a medição.");
  return data as unknown as { ok: boolean; id: string };
}

/* ──────────────────────────── Checklists ──────────────────────────── */

export interface Checklist {
  id: string;
  codigo: string;
  nome: string;
  versao: number;
  estado: string;
}

export async function listarTodasChecklists(orgId: string): Promise<Checklist[]> {
  const { data, error } = await supabase
    .from("ops_checklist")
    .select("id, codigo, nome, versao, estado")
    .eq("organization_id", orgId)
    .neq("estado", "arquivada")
    .order("nome");
  rebentar("carregar as checklists", error);
  return (data ?? []) as unknown as Checklist[];
}

export interface TarefaDeChecklist {
  id: string;
  posicao: number;
  nome: string;
  descricao: string | null;
  tipo: string;
  obrigatoria: boolean;
  privada: boolean;
}

export async function tarefasDaChecklist(checklistId: string): Promise<TarefaDeChecklist[]> {
  const { data, error } = await supabase
    .from("ops_checklist_tarefa")
    .select("id, posicao, nome, descricao, tipo, obrigatoria, privada")
    .eq("checklist_id", checklistId)
    .order("posicao");
  rebentar("carregar as tarefas da checklist", error);
  return (data ?? []) as unknown as TarefaDeChecklist[];
}

export async function medicoesDasTarefas(
  tarefaIds: readonly string[]
): Promise<{ checklist_tarefa_id: string; medicao_def_id: string }[]> {
  if (tarefaIds.length === 0) return [];
  const { data, error } = await supabase
    .from("ops_checklist_tarefa_medicao")
    .select("checklist_tarefa_id, medicao_def_id")
    .in("checklist_tarefa_id", tarefaIds as string[]);
  rebentar("carregar as medições das tarefas", error);
  return (data ?? []) as unknown as { checklist_tarefa_id: string; medicao_def_id: string }[];
}

export interface TarefaParaGravar {
  nome: string;
  descricao?: string | null;
  tipo: string;
  obrigatoria: boolean;
  privada: boolean;
  medicoes: string[];
}

export async function gravarChecklist(c: {
  id?: string | null;
  orgId: string;
  nome: string;
  publicar: boolean;
  tarefas: TarefaParaGravar[];
}): Promise<{ ok: boolean; id: string; codigo: string; versao: number; tarefas: number }> {
  const { data, error } = await supabase.rpc("rpc_ops_gravar_checklist", {
    p_checklist_id: c.id ?? null,
    p_nome: c.nome,
    p_org_id: c.orgId,
    p_tarefas: c.tarefas,
    p_publicar: c.publicar,
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível gravar a checklist.");
  return data as unknown as {
    ok: boolean;
    id: string;
    codigo: string;
    versao: number;
    tarefas: number;
  };
}

/* ────────────────────────────── Equipa ────────────────────────────── */

export interface Pessoa {
  utilizador_id: string;
  nome: string;
  email: string | null;
  funcao: string | null;
  ativo: boolean | null;
  em_operacoes: boolean;
}

export async function listarPessoas(orgId: string): Promise<Pessoa[]> {
  const { data, error } = await supabase
    .from("ops_v_pessoas")
    .select("utilizador_id, nome, email, funcao, ativo, em_operacoes")
    .eq("organization_id", orgId)
    .order("nome");
  rebentar("carregar as pessoas", error);
  return (data ?? []) as unknown as Pessoa[];
}

export async function gravarPerfil(p: {
  orgId: string;
  utilizadorId: string;
  funcao: string;
  custoHora?: number | null;
  ativo?: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc("rpc_ops_gravar_perfil", {
    p_org_id: p.orgId,
    p_utilizador: p.utilizadorId,
    p_funcao: p.funcao,
    p_custo_hora: p.custoHora ?? null,
    p_ativo: p.ativo ?? true,
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível gravar o perfil.");
}

/**
 * O custo/hora de cada pessoa.
 *
 * Só se lê com `operations.costs.view`. Um mapa vazio quer dizer "não é para
 * ti", não "ninguém tem custo definido" — e o ecrã diz isso, em vez de mostrar
 * traços que pareceriam dados em falta.
 */
export async function custosHora(orgId: string): Promise<Map<string, number | null>> {
  const { data, error } = await supabase
    .from("ops_utilizador_perfil")
    .select("utilizador_id, custo_hora")
    .eq("organization_id", orgId);
  if (error) return new Map();
  return new Map(
    (data ?? []).map((r) => [
      (r as { utilizador_id: string }).utilizador_id,
      (r as { custo_hora: number | null }).custo_hora,
    ])
  );
}

/* ─────────────────── O que o CRM já sabe do cliente ────────────────── */

export interface MoradaDoCliente {
  address_id: string;
  cliente_id: string;
  tipo: string | null;
  principal: boolean;
  morada: string;
  city: string | null;
  ja_e_local: boolean;
}

export async function moradasDoCliente(clienteId: string): Promise<MoradaDoCliente[]> {
  const { data, error } = await supabase
    .from("ops_v_morada_cliente")
    .select("address_id, cliente_id, tipo, principal, morada, city, ja_e_local")
    .eq("cliente_id", clienteId)
    .order("principal", { ascending: false })
    .order("morada");
  // Um cliente sem moradas no CRM não é um erro — é o caso normal de quem
  // ainda só existe como nome.
  if (error) return [];
  return (data ?? []) as unknown as MoradaDoCliente[];
}

export interface ContactoDoCliente {
  telefone_id: string | null;
  telefone: string | null;
  tipo: string | null;
  principal: boolean;
  nome: string;
  email: string | null;
}

export async function contactosDoCliente(clienteId: string): Promise<ContactoDoCliente[]> {
  const { data, error } = await supabase
    .from("ops_v_contacto_cliente")
    .select("telefone_id, telefone, tipo, principal, nome, email")
    .eq("cliente_id", clienteId)
    .order("principal", { ascending: false });
  if (error) return [];
  return ((data ?? []) as unknown as ContactoDoCliente[]).filter((c) => c.telefone);
}

/**
 * Cria um local. Com `addressId`, copia a morada do CRM.
 *
 * Devolve `ja_existia` quando a morada já tinha virado local: quem carregou no
 * botão quer o local, e ele já lá está — rebentar seria pedantismo.
 */
export async function criarLocal(l: {
  clienteId: string;
  nome?: string | null;
  tipo?: string;
  parentId?: string | null;
  addressId?: string | null;
}): Promise<{ ok: boolean; id: string; codigo: string; nome: string; ja_existia: boolean }> {
  const { data, error } = await supabase.rpc("rpc_ops_criar_local", {
    p_cliente_id: l.clienteId,
    p_nome: l.nome ?? null,
    p_tipo: l.tipo ?? "morada",
    p_parent_id: l.parentId ?? null,
    p_address_id: l.addressId ?? null,
    p_morada: null,
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível criar o local.");
  return data as unknown as {
    ok: boolean;
    id: string;
    codigo: string;
    nome: string;
    ja_existia: boolean;
  };
}

/* ────────────────────── Packs de configuração ────────────────────── */

export interface Pack {
  pack: string;
  nome: string;
  descricao: string;
  categorias: number;
  medicoes: number;
  checklists: number;
}

export interface ResultadoDoPack {
  ok: boolean;
  pack: string;
  nome: string;
  criadas: { categorias: number; medicoes: number; checklists: number };
  saltadas: { categorias: number; medicoes: number; checklists: number };
}

export async function listarPacks(): Promise<Pack[]> {
  const { data, error } = await supabase.rpc("rpc_ops_packs");
  if (error) {
    // `db/packs.sql` é opcional. Sem ele não há packs para oferecer, e o resto
    // das Definições continua a funcionar — por isso isto não rebenta.
    // eslint-disable-next-line no-console
    console.warn("[Operações] sem packs de configuração:", error.message);
    return [];
  }
  return (data ?? []) as unknown as Pack[];
}

export async function instalarPack(orgId: string, pack: string): Promise<ResultadoDoPack> {
  const { data, error } = await supabase.rpc("rpc_ops_instalar_pack", {
    _org_id: orgId,
    _pack: pack,
  });
  if (error) throw new ErroDeEscrita(error.message || "Não foi possível instalar o pack.");
  return data as unknown as ResultadoDoPack;
}

/* ─────────────────── Tipos de trabalho e centros de custo ──────────────── */

export interface TipoTrabalho {
  id: string;
  codigo: string;
  nome: string;
  posicao: number;
  fecha_automatico: boolean;
  ativo: boolean;
}

export interface CentroCusto {
  id: string;
  codigo: string;
  nome: string;
  ativo: boolean;
}

/**
 * Os tipos de trabalho da organização — semeando-os se ainda não houver.
 *
 * A sementeira é aqui e não no SQL de instalação porque as organizações não se
 * conhecem todas no momento de instalar: aparecem à medida que alguém entra em
 * cada uma. A função da base recusa semear duas vezes, por isso chamar isto a
 * cada abertura não faz mal nenhum.
 *
 * Se a sementeira falhar (falta de permissão, por exemplo), lê-se na mesma o
 * que houver. Uma lista vazia é pior do que um erro, mas um erro em cima de
 * uma lista que até existia seria pior ainda.
 */
export async function listarTiposTrabalho(orgId: string): Promise<TipoTrabalho[]> {
  await supabase.rpc("ops_semear_tipos_trabalho", { _org_id: orgId });

  const { data, error } = await supabase
    .from("ops_tipo_trabalho")
    .select("id, codigo, nome, posicao, fecha_automatico, ativo")
    .eq("organization_id", orgId)
    .order("posicao");

  rebentar("carregar os tipos de trabalho", error);
  return (data ?? []) as unknown as TipoTrabalho[];
}

export async function gravarTipoTrabalho(t: {
  orgId: string;
  id?: string | null;
  nome: string;
  codigo?: string | null;
  fechaAutomatico?: boolean;
  ativo?: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc("rpc_ops_gravar_tipo_trabalho", {
    p_org_id: t.orgId,
    p_nome: t.nome,
    p_codigo: t.codigo ?? null,
    p_fecha_automatico: t.fechaAutomatico ?? false,
    p_id: t.id ?? null,
    p_ativo: t.ativo ?? true,
  });
  if (error) {
    // A unicidade dos tipos é pelo NOME, e não pelo código — o código repete-se
    // de propósito. A mensagem tem de dizer o que a pessoa fez, não o que a
    // base chama àquilo.
    throw new ErroDeEscrita(
      error.message.includes("duplicate key")
        ? "Já existe um tipo de trabalho com esse nome."
        : traduzir(error.message, "tipo de trabalho")
    );
  }
}

export async function listarCentrosCusto(orgId: string): Promise<CentroCusto[]> {
  const { data, error } = await supabase
    .from("ops_centro_custo")
    .select("id, codigo, nome, ativo")
    .eq("organization_id", orgId)
    .order("codigo");

  rebentar("carregar os centros de custo", error);
  return (data ?? []) as unknown as CentroCusto[];
}

export async function gravarCentroCusto(c: {
  orgId: string;
  id?: string | null;
  codigo: string;
  nome: string;
  ativo?: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc("rpc_ops_gravar_centro_custo", {
    p_org_id: c.orgId,
    p_codigo: c.codigo,
    p_nome: c.nome,
    p_id: c.id ?? null,
    p_ativo: c.ativo ?? true,
  });
  if (error) throw new ErroDeEscrita(traduzir(error.message, "centro de custo"));
}

/* ────────────────────────────── Fornecedores ───────────────────────────── */

export interface Fornecedor {
  id: string;
  nome: string;
}

/**
 * Os fornecedores do Olyvia. **Só se leem.**
 *
 * Criar um fornecedor novo é no CRM — este módulo não escreve em tabelas de
 * negócio dele. O ecrã leva lá quem precisar.
 *
 * A tabela pode não existir numa instalação, e por isso um erro aqui devolve
 * lista vazia em vez de levar o formulário à frente: escolher fornecedor é
 * opcional, e uma ordem sem fornecedor é uma ordem normal.
 */
export async function listarFornecedores(orgId: string): Promise<Fornecedor[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, organization_id")
    .eq("organization_id", orgId)
    .order("name")
    .limit(500);

  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[Operações] sem fornecedores:", error.message);
    return [];
  }
  return ((data ?? []) as { id: string; name: string | null }[]).map((f) => ({
    id: f.id,
    nome: f.name ?? "(sem nome)",
  }));
}

/* ──────────────────────────── Duplicar ─────────────────────────────────── */

export interface ResultadoDaCopia {
  ok: boolean;
  id: string;
  codigo: string;
  tarefas?: number;
  alvos?: number;
  equipamentos?: number;
  estado?: string;
}

/**
 * Duplicar não é clonar: copia-se o molde, nunca o que aconteceu.
 *
 * Uma ordem copiada nasce por fazer, um plano nasce suspenso, uma checklist
 * nasce em rascunho, e um local não leva as coordenadas. As regras estão na
 * base (`db/duplicar.sql`), que é onde têm de estar.
 */
async function duplicar(rpc: string, args: Record<string, unknown>): Promise<ResultadoDaCopia> {
  const { data, error } = await supabase.rpc(rpc, args);
  if (error) throw new ErroDeEscrita(traduzir(error.message, "cópia"));
  return data as unknown as ResultadoDaCopia;
}

export const duplicarChecklist = (id: string, nome?: string | null) =>
  duplicar("rpc_ops_duplicar_checklist", { p_checklist_id: id, p_nome: nome ?? null });

export const duplicarPlano = (id: string, nome?: string | null, clienteId?: string | null) =>
  duplicar("rpc_ops_duplicar_plano", {
    p_plano_id: id,
    p_nome: nome ?? null,
    p_cliente_id: clienteId ?? null,
  });

export const duplicarLocal = (id: string, nome: string, comAtivos = true) =>
  duplicar("rpc_ops_duplicar_local", {
    p_local_id: id,
    p_nome: nome,
    p_com_ativos: comAtivos,
  });

export const duplicarOrdem = (id: string, titulo?: string | null) =>
  duplicar("rpc_ops_duplicar_ordem", { p_ordem_id: id, p_titulo: titulo ?? null });
