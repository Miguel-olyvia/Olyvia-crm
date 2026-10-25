// Criar o contrato a partir da proposta aceite, a partir do guia do negócio (sem sair da ficha). É a gravação que a página de contratos faz
// (`createMutation`): a proposta lê-se aqui por id e na organização (não de uma lista filtrada por estados), a entidade vem da proposta ou do seu
// negócio comercial, o cliente é o da entidade (pode ainda não existir: assinar converte-o), a organização de topo sobe a hierarquia, a minuta
// leva as respostas e o signatário, e a gravação é `neg_criar_contrato` (nasce ligado ao negócio) ou, sem negócio, `rpc_create_client_contract`.
import { gatherContractData, injectSignatoryIntoSignatureBlock } from "@/components/contracts/contractDocument";
import { escolherGravacaoDeContrato, parametrosNegCriarContrato } from "@/components/negocio-metas/contratoNoNegocio";
import { supabase } from "@/integrations/supabase/client";
import { exigirPermissao } from "@/lib/exigirPermissao";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

export interface PedidoDeContrato {
  propostaId: string;
  organizationId: string;
  /** O negócio a que o contrato fica ligado (fecho v4); `null` grava como a página de contratos sempre gravou. */
  negocioId: string | null;
  templateId: string;
  startDate: string;
  endDate: string;
  notes: string;
  paymentTerms: string;
  promptValues?: Record<string, string>;
  /** As permissões da sessão; sem `client_contracts.create` (a que a página de contratos exige) a gravação recusa-se, e sem lista conhecida (`undefined`) também. */
  permissoes: readonly string[] | undefined;
}

export interface ContratoCriado {
  id: string;
  ligadoAoNegocio: boolean;
}

interface PropostaParaContrato {
  id: string;
  entity_id: string | null;
  deal_id: string | null;
  quotes: Array<{ total: number | null }> | null;
}

const SEM_QUEM = "Esta proposta não tem entidade nem pedido associado, por isso não há a quem fazer o contrato.";

/** Troca `{{chave}}` pelas respostas dadas (a chave é escapada: nunca é uma expressão). */
function aplicarRespostas(html: string, respostas?: Record<string, string>): string {
  if (!respostas) return html;
  let saida = html;
  for (const [chave, valor] of Object.entries(respostas)) {
    const segura = chave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    saida = saida.replace(new RegExp(`\\{\\{\\s*${segura}\\s*\\}\\}`, "g"), () => valor);
  }
  return saida;
}

async function lerProposta(propostaId: string, organizationId: string): Promise<PropostaParaContrato> {
  const { data, error } = await supabase.from("proposals").select("id, entity_id, deal_id, quotes(total)").eq("id", propostaId).eq("organization_id", organizationId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("A proposta escolhida já não está disponível. Feche e volte a abrir.");
  return data as unknown as PropostaParaContrato;
}

/** A entidade da proposta: a sua, ou a do negócio comercial a que pertence. */
async function entidadeDaProposta(proposta: PropostaParaContrato): Promise<string | null> {
  if (proposta.entity_id) return proposta.entity_id;
  if (!proposta.deal_id) return null;
  const { data, error } = await supabase.from("deals").select("id, entity_id").in("id", [proposta.deal_id]);
  // Uma leitura que falha não é «sem entidade»: o erro sobe, em vez da falsa razão «proposta sem entidade».
  if (error) throw error;
  return ((data ?? []) as Array<{ entity_id: string | null }>)[0]?.entity_id ?? null;
}

async function clienteDaEntidade(entidade: string | null): Promise<string | null> {
  if (!entidade) return null;
  const { data, error } = await supabase.from("anew_clients").select("id, entity_id").in("entity_id", [entidade]);
  // Só «sem linha» é «ainda não é cliente»; uma leitura falhada gravaria o contrato com o cliente nulo.
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string }>)[0]?.id ?? null;
}

/** A organização de topo: sobe a hierarquia até não haver pai. Uma leitura que falha aborta: a organização de topo errada ficava gravada para sempre. */
async function organizacaoDeTopo(organizationId: string): Promise<string> {
  const { data, error } = await supabase.from("anew_hierarchy").select("parent_org_id, child_org_id").in("relationship_type", ["PARENT_OF", "parent_of", "parent_child"]);
  if (error) throw error;
  const pais = new Map<string, string>();
  ((data ?? []) as Array<{ parent_org_id: string; child_org_id: string }>).forEach((h) => pais.set(h.child_org_id, h.parent_org_id));
  let atual = organizationId;
  const vistos = new Set<string>();
  while (pais.has(atual) && !vistos.has(atual)) { vistos.add(atual); atual = pais.get(atual) as string; }
  return atual;
}

/** A minuta com as respostas e o signatário, e o texto original; sem minuta, nenhum dos dois. */
async function minuta(pedido: PedidoDeContrato, entidade: string | null, cliente: string | null): Promise<{ original: string | null; final: string | null }> {
  if (!pedido.templateId) return { original: null, final: null };
  const { data, error } = await supabase.from("client_contract_templates").select("body_html").eq("id", pedido.templateId).single();
  // Um contrato sem texto não é um contrato: se a minuta escolhida não se lê, ou vem sem texto, nada se cria.
  if (error) throw error;
  const original = (data as { body_html?: string | null } | null)?.body_html ?? null;
  if (!original) throw new Error("A minuta escolhida não tem texto ou já não está disponível. Escolha outra minuta.");
  const dados = await gatherContractData({ entity_id: entidade, client_id: cliente, contract_template_id: pedido.templateId }, pedido.organizationId);
  const { signatario_nome: nome, signatario_cargo: cargo } = dados as { signatario_nome?: string; signatario_cargo?: string };
  return { original, final: injectSignatoryIntoSignatureBlock(aplicarRespostas(original, pedido.promptValues), nome, cargo) };
}

export async function criarContratoDaProposta(pedido: PedidoDeContrato): Promise<ContratoCriado> {
  exigirPermissao(pedido.permissoes, "client_contracts.create", "criar o contrato");
  const { data: { user }, error: erroSessao } = await supabase.auth.getUser();
  if (erroSessao) throw erroSessao;
  if (!user) throw new Error("Not authenticated");
  const negocioUser = await resolveCurrentBusinessUserId();
  if (!negocioUser) throw new Error("Business user not resolved");
  const proposta = await lerProposta(pedido.propostaId, pedido.organizationId);
  const entidade = await entidadeDaProposta(proposta);
  const cliente = await clienteDaEntidade(entidade);
  if (!cliente && !entidade) throw new Error(SEM_QUEM);
  const total = (proposta.quotes ?? []).reduce((soma, q) => soma + (q.total ?? 0), 0);
  const topo = await organizacaoDeTopo(pedido.organizationId);
  const texto = await minuta(pedido, entidade, cliente);

  // Sem o contexto de auditoria o contrato ficaria sem autor: não se cria.
  const { error: erroAuditoria } = await supabase.rpc("set_audit_context", { p_user_id: negocioUser, p_source: "ui" });
  if (erroAuditoria) throw erroAuditoria;
  const parametros = {
    p_client_id: cliente, p_entity_id: entidade, p_organization_id: pedido.organizationId, p_root_organization_id: topo,
    p_proposal_id: pedido.propostaId, p_contract_template_id: pedido.templateId || null, p_total_value: total, p_currency: "EUR",
    p_start_date: pedido.startDate || null, p_end_date: pedido.endDate || null, p_notes: pedido.notes || null, p_payment_terms: pedido.paymentTerms || null,
    p_contract_body_html: texto.original, p_final_body_html: texto.final,
    p_prompt_values: pedido.promptValues && Object.keys(pedido.promptValues).length > 0 ? pedido.promptValues : null,
  };
  const rpc = supabase.rpc.bind(supabase) as unknown as (nome: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  const ligadoAoNegocio = escolherGravacaoDeContrato({ criarNoNegocioId: pedido.negocioId }) === "neg_criar_contrato";
  const { data, error } = ligadoAoNegocio
    ? await rpc("neg_criar_contrato", parametrosNegCriarContrato(pedido.negocioId as string, parametros))
    : await rpc("rpc_create_client_contract", parametros);
  if (error) throw error;
  // O contrato pode já estar criado, mas sem o identificador nada o liga ao negócio nem se mostra: é uma falha, não um «sem id».
  if (typeof data !== "string" || data === "") throw new Error("O contrato foi gravado, mas a base não devolveu o identificador. Confirme na lista de contratos antes de tentar de novo.");
  return { id: data, ligadoAoNegocio };
}
