// 4/11 (Rúben): a fase Lead do pipeline mostra o que a lead trouxe quando foi criada (Pessoas › Nova lead, os campos da Olyvia original):
// nome próprio e apelido, empresa, notas, fonte, campanha, comercial e as respostas aos campos do formulário. Lê-se da pessoa
// (anew_entities: first_name, last_name, extra, origin_id, campaign_id, assigned_to) e grava-se nela: a ficha e o negócio ficam iguais.
// Telefone, email e NIF continuam em «Editar os dados do cliente» (EditarCliente.tsx).
import type { SupabaseClient } from "@supabase/supabase-js";

export interface RespostaLead { k: string; l: string; v: string }
export interface DadosLead {
  entityId: string;
  primeiro: string;
  apelido: string;
  empresa: string;
  notas: string;
  fonteId: string;
  fonte: string;
  campanha: string;
  comercialId: string;
  comercial: string;
  /** A pessoa já é cliente (anew_entities.client_since preenchido): neg_atribuir_pessoa só pede leads.assign a quem ainda não é. */
  cliente: boolean;
  /** As respostas aos campos do formulário da campanha (pela chave do campo), com o nome do campo. */
  respostas: RespostaLead[];
  /** O `extra` como está na base (para gravar sem perder o resto). */
  extra: Record<string, unknown>;
}
export interface FonteLead { id: string; name: string }

type Linha = Record<string, any>;
const db = (sb: SupabaseClient) => sb as unknown as { from: (t: string) => any };
const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" || typeof v === "boolean" ? String(v) : Array.isArray(v) ? v.join(", ") : "");
/** As chaves do `extra` que não são respostas do formulário (a empresa e as notas têm campo próprio). */
const FORA: ReadonlySet<string> = new Set(["company_name", "notes"]);

async function ler(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<Linha[]> {
  const { data, error } = await q;
  if (error) throw error;
  return Array.isArray(data) ? (data as Linha[]) : [];
}

/** O que cada pessoa trouxe na criação da lead. Um erro a ler não para o Negócio: fica sem estes dados. */
export async function lerDadosDasLeads(sb: SupabaseClient, org: string, pessoas: readonly string[]): Promise<{ porPessoa: Map<string, DadosLead>; fontes: FonteLead[] }> {
  const ids = [...new Set(pessoas.filter(Boolean))];
  const vazio = { porPessoa: new Map<string, DadosLead>(), fontes: [] as FonteLead[] };
  if (ids.length === 0) return vazio;
  try {
    const ents = await ler(db(sb).from("anew_entities").select("id, first_name, last_name, extra, origin_id, campaign_id, assigned_to, client_since").in("id", ids));
    const campIds = [...new Set(ents.map((e) => e.campaign_id).filter(Boolean))] as string[];
    const userIds = [...new Set(ents.map((e) => e.assigned_to).filter(Boolean))] as string[];
    const [fontes, campanhas, users] = await Promise.all([
      ler(db(sb).from("lead_sources").select("id, name").eq("is_active", true).or(`organization_id.eq.${org},organization_id.is.null`).order("name")),
      campIds.length ? ler(db(sb).from("campaigns").select("id, name, form_id").in("id", campIds)) : Promise.resolve([] as Linha[]),
      userIds.length ? ler(db(sb).from("anew_users").select("id, name").in("id", userIds)) : Promise.resolve([] as Linha[]),
    ]);
    const formIds = [...new Set(campanhas.map((c) => c.form_id).filter(Boolean))] as string[];
    const campos = formIds.length ? await ler(db(sb).from("form_fields").select("form_id, field_key, field_label, sort_order").in("form_id", formIds).order("sort_order")) : [];
    const porPessoa = new Map<string, DadosLead>();
    for (const e of ents) {
      const extra = e.extra && typeof e.extra === "object" && !Array.isArray(e.extra) ? (e.extra as Record<string, unknown>) : {};
      const camp = campanhas.find((c) => c.id === e.campaign_id);
      const doForm = campos.filter((c) => camp && c.form_id === camp.form_id);
      const respostas = doForm
        .filter((c) => !FORA.has(c.field_key) && txt(extra[c.field_key]) !== "")
        .map((c) => ({ k: String(c.field_key), l: String(c.field_label || c.field_key), v: txt(extra[c.field_key]) }));
      porPessoa.set(e.id, {
        entityId: e.id, primeiro: txt(e.first_name), apelido: txt(e.last_name), empresa: txt(extra.company_name), notas: txt(extra.notes),
        fonteId: e.origin_id ?? "", fonte: fontes.find((f) => f.id === e.origin_id)?.name ?? "", campanha: camp?.name ?? "",
        comercialId: e.assigned_to ?? "", comercial: users.find((u) => u.id === e.assigned_to)?.name ?? "", cliente: e.client_since != null,
        respostas, extra,
      });
    }
    return { porPessoa, fontes: fontes.map((f) => ({ id: f.id, name: f.name })) };
  } catch {
    return vazio;
  }
}

/** O que se muda na fase Lead. */
export interface MudancaLead { primeiro: string; apelido: string; empresa: string; notas: string; fonteId: string; comercialId: string; respostas: Record<string, string> }

/** Grava na pessoa (e o comercial por neg_atribuir_pessoa, com as regras de sempre). Devolve o nome novo («Nome Apelido»). */
export async function gravarDadosDaLead(sb: SupabaseClient, org: string, antes: DadosLead, m: MudancaLead): Promise<string> {
  const extra: Record<string, unknown> = { ...antes.extra, ...m.respostas };
  for (const [k, v] of [["company_name", m.empresa], ["notes", m.notas]] as const) { if (v.trim()) extra[k] = v.trim(); else delete extra[k]; }
  const nome = [m.primeiro.trim(), m.apelido.trim()].filter(Boolean).join(" ");
  const { error } = await db(sb).from("anew_entities").update({
    first_name: m.primeiro.trim() || null, last_name: m.apelido.trim() || null, ...(nome ? { display_name: nome } : {}),
    extra, origin_id: m.fonteId || null,
  }).eq("id", antes.entityId);
  if (error) throw new Error(error.message || "Não foi possível gravar os dados da lead.");
  if (m.comercialId !== antes.comercialId) {
    const r = await sb.rpc("neg_atribuir_pessoa" as never, { p_organization_id: org, p_entity_id: antes.entityId, p_assigned_to: m.comercialId || null } as never);
    if (r.error) throw new Error((r.error as { message?: string }).message || "Não foi possível mudar o comercial.");
  }
  return nome;
}
