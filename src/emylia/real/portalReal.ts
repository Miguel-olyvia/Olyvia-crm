// CRM (28/10/2026): o envio ao portal do cliente a partir do Negócio da Emylia (/negocios), com a conta real. Na V1 o "Enviar proposta",
// o "Enviar contrato" e o "Acesso ao portal" chamam enviarAcesso (acessosPortal.ts); quem cria a conta real regista-se em
// definirCriadorContas. Na Olyvia o portal real é o /client-portal e a conta nasce na Edge Function create-client-portal-access (a
// mesma das páginas de Propostas e de Contratos):
// · na primeira proposta cria a conta com o email do cliente e manda o email com o acesso; depois só liga o documento ao portal;
// · o email tem de ser único: a função recusa um email de outro cliente desta organização ou de um utilizador do CRM;
// · o documento é a proposta ou o contrato REAL do negócio (proposals / client_contracts, pelo neg_ler_templates_negocio).
// A função lê o email do contacto (anew_entity_emails): o da ficha do negócio passa a ser o email principal do contacto antes do envio.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocPortal, EnvioAcesso, ResultadoConta } from "../acessosPortal";
import { lerTemplates } from "@/hooks/pessoas/useTemplatesDoNegocio";

export type TipoDocPortal = "proposal" | "contract";

/** O documento real de cada envio da Emylia (o "Acesso ao portal" manda o contrato, se houver, senão a proposta). As adendas, a fatura e
 *  o auto ainda não têm documento no portal real: ficam de fora (null). */
export function tipoDoEnvio(doc: DocPortal | undefined): TipoDocPortal | null {
  if (doc === "proposta") return "proposal";
  if (doc === "contrato") return "contract";
  return null;
}

const MENSAGENS: Record<string, string> = {
  portal_email_is_crm_user: "Este email já pertence a um utilizador do CRM desta empresa. Use outro email para o acesso ao portal.",
  portal_email_used_by_other_entity: "Este email já está associado a outro cliente nesta organização. Use outro email.",
  proposal_has_signed_contract: "Esta proposta tem um contrato já assinado. Para valores novos, faça uma adenda.",
};

/** A proposta e o contrato reais do negócio. */
export async function documentosDoNegocio(sb: SupabaseClient, negocioId: string): Promise<{ proposal: string | null; contract: string | null }> {
  const { data, error } = await sb.rpc("neg_ler_templates_negocio" as never, { p_negocio_id: negocioId } as never);
  if (!error) { const t = lerTemplates(data); return { proposal: t.proposta_id, contract: t.contrato_id }; }
  const ultimo = async (tabela: string) => {
    const r = await (sb.from(tabela as never) as unknown as { select: (c: string) => { eq: (c: string, v: string) => { order: (c: string, o: object) => { limit: (n: number) => Promise<{ data: { id: string }[] | null }> } } } })
      .select("id").eq("negocio_id", negocioId).order("created_at", { ascending: false }).limit(1);
    return r.data?.[0]?.id ?? null;
  };
  return { proposal: await ultimo("proposals"), contract: await ultimo("client_contracts") };
}

/** O email do contacto passa a ser o da ficha (o principal), se for outro. */
export async function garantirEmailDoContacto(sb: SupabaseClient, entityId: string, email: string): Promise<void> {
  const tab = () => sb.from("anew_entity_emails" as never) as unknown as {
    select: (c: string) => { eq: (c: string, v: unknown) => { eq: (c: string, v: unknown) => Promise<{ data: { email: string }[] | null; error: { message: string } | null }> } };
    delete: () => { eq: (c: string, v: unknown) => { eq: (c: string, v: unknown) => Promise<{ error: { message: string } | null }> } };
    insert: (r: object) => Promise<{ error: { message: string } | null }>;
  };
  const lido = await tab().select("email").eq("entity_id", entityId).eq("is_primary", true);
  if (lido.error) throw new Error(lido.error.message);
  if ((lido.data ?? []).some((x) => x.email.trim().toLowerCase() === email.toLowerCase())) return;
  const apagado = await tab().delete().eq("entity_id", entityId).eq("is_primary", true);
  if (apagado.error) throw new Error(apagado.error.message);
  const novo = await tab().insert({ entity_id: entityId, email, email_type: "personal", is_primary: true });
  if (novo.error) throw new Error(novo.error.message);
}

/** Os indicativos mais comuns, do mais longo para o mais curto, para guardar o `country_code` ao lado do número internacional. */
const INDICATIVOS = ["+351", "+352", "+244", "+258", "+238", "+34", "+33", "+39", "+41", "+44", "+49", "+55", "+1"];

/** 29/10: o telefone do contacto passa a ser o da ficha (o principal), em formato internacional («+351912345678»): o código de assinatura vai por SMS para ele. */
export async function garantirTelefoneDoContacto(sb: SupabaseClient, entityId: string, telefone: string): Promise<void> {
  type Linha = { id: string; phone_number: string };
  const tab = () => sb.from("anew_entity_phones" as never) as unknown as {
    select: (c: string) => { eq: (c: string, v: unknown) => { eq: (c: string, v: unknown) => Promise<{ data: Linha[] | null; error: { message: string } | null }> } };
    update: (r: object) => { eq: (c: string, v: unknown) => Promise<{ error: { message: string } | null }> };
    insert: (r: object) => Promise<{ error: { message: string } | null }>;
  };
  const lido = await tab().select("id, phone_number").eq("entity_id", entityId).eq("is_primary", true);
  if (lido.error) throw new Error(lido.error.message);
  const atual = lido.data?.[0];
  if (atual && atual.phone_number === telefone) return;
  const country_code = INDICATIVOS.find((c) => telefone.startsWith(c)) ?? null;
  const resultado = atual
    ? await tab().update({ phone_number: telefone, country_code }).eq("id", atual.id)
    : await tab().insert({ entity_id: entityId, phone_number: telefone, country_code, phone_type: "mobile", is_primary: true });
  if (resultado.error) throw new Error(resultado.error.message);
}

/** A resposta da Edge Function no formato do cartão da V1 (AcessoPortalNegocio). */
export function resultadoDaFuncao(data: Record<string, unknown> | null): ResultadoConta {
  if (!data) return { fase: "erro", msg: "Sem resposta do portal." };
  if (typeof data.error === "string") return { fase: "erro", msg: MENSAGENS[data.error] ?? data.error };
  const enviado = !data.smtp_warning;
  return {
    fase: "pronta", nova: !!data.is_new_account, ...(typeof data.temp_password === "string" ? { password: data.temp_password } : {}),
    email: { enviado, ...(typeof data.email === "string" ? { para: data.email } : {}), ...(typeof data.smtp_error_safe === "string" ? { motivo: data.smtp_error_safe } : {}) },
  };
}

async function erroDaFuncao(error: unknown): Promise<string> {
  try {
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string; message?: string }> } }).context;
    const b = typeof ctx?.json === "function" ? await ctx.json() : null;
    const m = b?.error || b?.message;
    if (m) return MENSAGENS[m] ?? m;
  } catch { /* sem corpo */ }
  return (error as { message?: string })?.message || "Não foi possível criar o acesso ao portal.";
}

/** Envia ao portal o documento do envio e devolve o resultado para o cartão. */
export async function enviarAoPortal(sb: SupabaseClient, org: string, ref: { id: string; entityId: string }, email: string, e: Pick<EnvioAcesso, "doc">,
  origem = typeof window !== "undefined" ? window.location.origin : "", telefone?: string): Promise<ResultadoConta> {
  const tipo = tipoDoEnvio(e.doc);
  if (!tipo) return { fase: "erro", msg: "Este documento ainda não vai para o portal do cliente." };
  try {
    await garantirEmailDoContacto(sb, ref.entityId, email);
    if (telefone) await garantirTelefoneDoContacto(sb, ref.entityId, telefone);
    const docs = await documentosDoNegocio(sb, ref.id);
    const document_type = tipo, document_id = docs[tipo];
    if (!document_id) return { fase: "erro", msg: document_type === "proposal" ? "A proposta ainda não está gravada na base: tente de novo daqui a pouco." : "O contrato ainda não está gravado na base: tente de novo daqui a pouco." };
    const { data, error } = await sb.functions.invoke("create-client-portal-access", {
      body: { document_type, document_id, organization_id: org, login_url: `${origem}/auth`, force_new_password: false },
    });
    if (error) return { fase: "erro", msg: await erroDaFuncao(error) };
    return resultadoDaFuncao(data as Record<string, unknown> | null);
  } catch (x) {
    return { fase: "erro", msg: x instanceof Error ? x.message : String(x) };
  }
}
