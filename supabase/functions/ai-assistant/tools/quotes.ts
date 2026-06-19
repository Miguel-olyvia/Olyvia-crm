// Quote tools — extracted verbatim from index.ts.

import { requireWrite, requireActionPermission, requirePermission } from "../shared/authz.ts";

// Estados em que um orçamento aceita escrita populadora (linhas, descontos, fees básicos).
// Fonte: schema `quotes.estado` — apenas 'rascunho' é mutável sem efeito externo.
const QUOTE_MUTABLE_STATUSES = ["rascunho"] as const;
import type { Handler, ToolDef, ToolResult } from "../shared/types.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function calcBundleComponentPrice(comp: any, bundle: any): number {
  const basePrice = Number(
    comp.products?.product_prices?.find((p: any) => p.price_type === "retail")?.price ??
    comp.services?.service_prices?.find((p: any) => p.price_type === "retail")?.price ??
    0,
  );

  if (comp.pricing_mode === "custom_price") return Number(comp.custom_price ?? basePrice);
  if (comp.pricing_mode === "custom_discount_percent") return basePrice * (1 - Number(comp.custom_discount_percent ?? 0) / 100);
  if (comp.pricing_mode === "custom_discount_fixed") return Math.max(0, basePrice - Number(comp.custom_discount_fixed ?? 0));
  if (bundle.pricing_type === "percentage_discount") return basePrice * (1 - Number(bundle.discount_percent ?? 0) / 100);
  return basePrice;
}

function calcBundleComponentVat(comp: any): number {
  const vat = comp.products?.product_prices?.find((p: any) => p.price_type === "retail")?.vat_rate ??
    comp.services?.service_prices?.find((p: any) => p.price_type === "retail")?.vat_rate;
  const n = Number(vat);
  return Number.isFinite(n) ? n : 23;
}

async function invokeFn(authHeader: string, name: string, body: any): Promise<{ ok: boolean; status: number; json: any }> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": authHeader, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, json };
}

export const createQuoteDef: ToolDef = {
  type: "function",
  function: {
    name: "create_quote",
    description: "Cria um Orçamento (O) numa única chamada. Aceita opcionalmente items[] (products/services/bundles, mesmo schema de add_quote_items), template_id (layout de PDF, UUID via list_quote_templates), modelo_base (codigo do modelo rápido, via list_quote_models) e desconto_global_percent (0-100). Items inline só são inseridos no orçamento recém-criado — nunca actuam sobre orçamentos existentes (para isso usa add_quote_items). Requer cliente, contacto ou lead activo nesta organização.",
    parameters: {
      type: "object",
      properties: {
        client_name: { type: "string", description: "Nome de cliente, contacto ou lead activo na organização activa." },
        title: { type: "string" },
        client_notes: { type: "string" },
        validade_dias: { type: "number" },
        template_id: { type: "string", description: "UUID de proposal_templates (template_type='quote', is_active=true) da org. Layout do PDF. Opcional." },
        modelo_base: { type: "string", description: "Codigo do modelo rápido (quote_templates.codigo, active=true) da org. Opcional. Não popula items automaticamente." },
        desconto_global_percent: { type: "number", description: "0-100. Opcional." },
        items: {
          type: "array",
          description: "Linhas a inserir imediatamente. Mesmo schema de add_quote_items.items.",
          items: {
            type: "object",
            properties: {
              product_id: { type: "string" },
              service_id: { type: "string" },
              bundle_id: { type: "string" },
              qt: { type: "number" },
              unit_price: { type: "number" },
              discount_percent: { type: "number" },
              section_name: { type: "string" },
              item_description: { type: "string" },
            },
          },
        },
      },
      required: ["client_name", "title"],
    },
  },
};

export const setQuoteTemplateDef: ToolDef = {
  type: "function",
  function: {
    name: "set_quote_template",
    description: "Associa um LAYOUT DE PDF (proposal_templates, template_type='quote') a um orçamento em rascunho. Para modelos rápidos (que pré-preenchem items no builder) usa set_quote_model. Em alternativa, podes passar template_id directamente a create_quote.",
    parameters: {
      type: "object",
      properties: {
        quote_id: { type: "string" },
        template_id: { type: "string", description: "UUID de proposal_templates (is_active=true, template_type='quote') da org. Usa null para remover." },
      },
      required: ["quote_id", "template_id"],
    },
  },
};

export const listQuoteTemplatesDef: ToolDef = {
  type: "function",
  function: {
    name: "list_quote_templates",
    description: "Lista LAYOUTS DE PDF de orçamento (proposal_templates com template_type='quote', is_active=true) disponíveis na org activa. NÃO confundir com modelos rápidos (estes são pré-preenchimentos de items — usa list_quote_models). Usa antes de criar/alterar um orçamento para apresentar opções concretas de layout ao utilizador.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Filtro parcial em name. Opcional." },
        limit: { type: "number", description: "Default 50, máx 50." },
      },
    },
  },
};

export const listQuoteModelsDef: ToolDef = {
  type: "function",
  function: {
    name: "list_quote_models",
    description: "Lista MODELOS RÁPIDOS de orçamento (quote_templates, active=true) disponíveis na org activa. Modelos rápidos são presets de items (produtos/serviços/bundles) que o builder usa para arrancar um orçamento. NÃO são layouts de PDF (para isso usa list_quote_templates).",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Filtro parcial em name/codigo. Opcional." },
        limit: { type: "number", description: "Default 50, máx 50." },
      },
    },
  },
};

export const setQuoteModelDef: ToolDef = {
  type: "function",
  function: {
    name: "set_quote_model",
    description: "Associa um MODELO RÁPIDO (quote_templates) a um orçamento em rascunho, gravando o codigo em quotes.modelo_base. NÃO popula items automaticamente — equivale a escolher o modelo no dropdown sem aplicar. Para itens usa add_quote_items.",
    parameters: {
      type: "object",
      properties: {
        quote_id: { type: "string" },
        modelo_base: { type: "string", description: "Codigo do modelo rápido (quote_templates.codigo). Usa '0' ou string vazia para limpar (default)." },
      },
      required: ["quote_id", "modelo_base"],
    },
  },
};


export const listQuotesDef: ToolDef = {
  type: "function",
  function: {
    name: "list_quotes",
    description: "Lista orçamentos da organização activa. Combina filtros (AND): client_name, quote_number, title, estado, date_from/date_to.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number" },
        estado: { type: "string" },
        client_name: { type: "string", description: "Nome (parcial) de cliente, contacto ou lead da org. NÃO usar para número do orçamento." },
        quote_number: { type: "string", description: "Número (parcial) do orçamento. Ex.: 'Q-2026-0649' ou '0649'." },
        title: { type: "string", description: "Título (parcial) do orçamento." },
        date_from: { type: "string", description: "Data ISO inicial (created_at >=)." },
        date_to: { type: "string", description: "Data ISO final (created_at <=)." },
      },
    },
  },
};


const createQuote: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, businessUserId, organizationId } = ctx;
  const createdBy = businessUserId || null;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const permQ = requireWrite(ctx, "quotes.create", "criar orçamentos");
  if (permQ) return permQ;

  // Resolve client/contact/lead — org-scoped, active only.
  const term = `%${args.client_name}%`;
  let entityId: string | null = null;
  let displayName: string | null = null;
  let origin: "client" | "contact" | "lead" | null = null;

  {
    const { data, error } = await supabase
      .from("anew_clients")
      .select("entity_id, anew_entities!inner(id, display_name)")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .is("deleted_at", null)
      .ilike("anew_entities.display_name", term)
      .limit(1);
    if (error) throw error;
    if (data && data.length) {
      entityId = (data[0] as any).entity_id;
      displayName = (data[0] as any).anew_entities?.display_name ?? null;
      origin = "client";
    }
  }
  if (!entityId) {
    const { data, error } = await supabase
      .from("anew_contacts")
      .select("entity_id, anew_entities!inner(id, display_name)")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .is("deleted_at", null)
      .ilike("anew_entities.display_name", term)
      .limit(1);
    if (error) throw error;
    if (data && data.length) {
      entityId = (data[0] as any).entity_id;
      displayName = (data[0] as any).anew_entities?.display_name ?? null;
      origin = "contact";
    }
  }
  if (!entityId) {
    const { data, error } = await supabase
      .from("anew_leads")
      .select("entity_id, anew_entities!inner(id, display_name)")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .not("status", "in", "(converted,lost,rejected)")
      .ilike("anew_entities.display_name", term)
      .limit(1);
    if (error) throw error;
    if (data && data.length) {
      entityId = (data[0] as any).entity_id;
      displayName = (data[0] as any).anew_entities?.display_name ?? null;
      origin = "lead";
    }
  }

  if (!entityId) {
    return {
      success: false,
      message: `Sem cliente, contacto ou lead activo nesta organização com "${args.client_name}". Cria o registo primeiro.`,
    };
  }

  // Optional template_id — layout de PDF (proposal_templates, template_type='quote', is_active=true).
  let templateId: string | null = null;
  if (args.template_id !== undefined && args.template_id !== null && String(args.template_id).length > 0) {
    const tid = String(args.template_id);
    if (!UUID_RE.test(tid)) return { success: false, message: "template_id inválido." };
    const { data: tpl } = await supabase
      .from("proposal_templates")
      .select("id")
      .eq("id", tid)
      .eq("organization_id", organizationId)
      .eq("template_type", "quote")
      .eq("is_active", true)
      .maybeSingle();
    if (!tpl) return { success: false, message: "Layout de PDF não encontrado, fora da organização ou inactivo. Usa list_quote_templates para ver opções." };
    templateId = tid;
  }

  // Optional modelo_base — quote_templates.codigo (modelo rápido).
  let modeloBase = "0";
  if (args.modelo_base !== undefined && args.modelo_base !== null && String(args.modelo_base).length > 0 && String(args.modelo_base) !== "0") {
    const codigo = String(args.modelo_base);
    const { data: model } = await supabase
      .from("quote_templates")
      .select("codigo")
      .eq("codigo", codigo)
      .eq("organization_id", organizationId)
      .eq("active", true)
      .maybeSingle();
    if (!model) return { success: false, message: "Modelo rápido não encontrado, fora da organização ou inactivo. Usa list_quote_models para ver opções." };
    modeloBase = codigo;
  }

  // Optional desconto_global_percent.
  let descontoGlobal = 0;
  if (args.desconto_global_percent !== undefined && args.desconto_global_percent !== null) {
    const d = Number(args.desconto_global_percent);
    if (!Number.isFinite(d) || d < 0 || d > 100) {
      return { success: false, message: "desconto_global_percent deve estar entre 0 e 100." };
    }
    descontoGlobal = d;
  }

  // Optional inline items — validação leve antes do insert da quote.
  const inlineItems: any[] = Array.isArray(args.items) ? args.items : [];
  if (inlineItems.length > 50) return { success: false, message: "Máximo 50 itens por chamada." };

  const insertPayload: Record<string, any> = {
    entity_id: entityId,
    title: args.title,
    client_notes: args.client_notes || null,
    validade_dias: args.validade_dias ?? 30,
    estado: "rascunho",
    modelo_base: modeloBase,
    organization_id: organizationId,
    root_organization_id: organizationId,
    created_by: createdBy,
    desconto_global_percent: descontoGlobal,
  };

  if (templateId) insertPayload.template_id = templateId;

  const { data, error } = await supabase
    .from("quotes")
    .insert(insertPayload)
    .select("id, quote_number")
    .single();

  if (error) throw error;

  // Insere linhas inline contra o quote_id RECÉM-CRIADO. Nunca aceita quote_id de input.
  let added = 0;
  let skipped: Array<{ item: any; reason: string }> = [];
  if (inlineItems.length > 0) {
    const res = await resolveAndInsertQuoteLines(supabase, organizationId, data.id, inlineItems);
    added = res.added;
    skipped = res.skipped;
  }

  const msgBits = [`Orçamento ${data.quote_number || data.id} criado para ${displayName ?? args.client_name} (${origin})`];
  if (templateId) msgBits.push("com layout de PDF");
  if (modeloBase !== "0") msgBits.push(`modelo rápido '${modeloBase}'`);
  if (added > 0) msgBits.push(`${added} linha(s) adicionada(s)`);
  if (skipped.length > 0) {
    const firstReason = skipped[0]?.reason ? ` (motivo: ${skipped[0].reason})` : "";
    msgBits.push(`${skipped.length} linha(s) NÃO adicionada(s)${firstReason}`);
  }
  if (inlineItems.length > 0 && added === 0) {
    msgBits.push("nenhuma das linhas pedidas foi inserida");
  }

  return {
    success: true,
    message: msgBits.join(", ") + ".",
    data: { id: data.id, link: `/quotes?open=${data.id}`, added, skipped, items_requested: inlineItems.length },
  };
};

const QUOTE_NUMBER_RE = /^Q-\d{4}-\d+$/i;

const listQuotes: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const limit = args?.limit ?? 10;

  let clientName: string | undefined = args?.client_name?.trim();
  let quoteNumber: string | undefined = args?.quote_number?.trim();
  const title: string | undefined = args?.title?.trim();
  const dateFrom: string | undefined = args?.date_from?.trim();
  const dateTo: string | undefined = args?.date_to?.trim();

  // Fallback: utilizador/modelo passou um quote_number no campo client_name.
  let reinterpretedNote: string | null = null;
  if (clientName && !quoteNumber && QUOTE_NUMBER_RE.test(clientName)) {
    quoteNumber = clientName;
    reinterpretedNote = `Interpretei "${clientName}" como quote_number (não como nome de cliente).`;
    clientName = undefined;
  }

  // Optional client_name → resolve to entity_id(s) on the active org.
  let entityIds: string[] | null = null;
  if (clientName && clientName.length > 1) {
    const term = `%${clientName}%`;
    const ids = new Set<string>();
    const lookups = await Promise.all([
      supabase.from("anew_clients")
        .select("entity_id, anew_entities!inner(id, display_name)")
        .eq("organization_id", organizationId).is("deleted_at", null)
        .ilike("anew_entities.display_name", term).limit(20),
      supabase.from("anew_contacts")
        .select("entity_id, anew_entities!inner(id, display_name)")
        .eq("organization_id", organizationId).is("deleted_at", null)
        .ilike("anew_entities.display_name", term).limit(20),
      supabase.from("anew_leads")
        .select("entity_id, anew_entities!inner(id, display_name)")
        .eq("organization_id", organizationId).is("deleted_at", null)
        .ilike("anew_entities.display_name", term).limit(20),
    ]);
    for (const r of lookups) {
      if (r.error) throw r.error;
      for (const row of (r.data ?? []) as any[]) {
        if (row?.entity_id) ids.add(row.entity_id);
      }
    }
    if (ids.size === 0) {
      return {
        success: true,
        message: `Sem cliente, contacto ou lead nesta organização com "${clientName}".`,
        data: [],
      };
    }
    entityIds = Array.from(ids);
  }

  let q = supabase
    .from("quotes")
    .select("id, quote_number, estado, total, title, entity_id, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (args?.estado) q = q.eq("estado", args.estado);
  if (entityIds) q = q.in("entity_id", entityIds);
  if (quoteNumber) q = q.ilike("quote_number", `%${quoteNumber}%`);
  if (title) q = q.ilike("title", `%${title}%`);
  if (dateFrom) q = q.gte("created_at", dateFrom);
  if (dateTo) q = q.lte("created_at", dateTo);
  const { data, error } = await q;
  if (error) throw error;
  const baseMsg = `${data?.length || 0} orçamento(s).`;
  const message = reinterpretedNote ? `${reinterpretedNote} ${baseMsg}` : baseMsg;
  return { success: true, message, data: data || [] };
};


export const sendQuoteDef: ToolDef = {
  type: "function",
  function: {
    name: "send_quote",
    description: "Envia um orçamento por email via send-quote-email.",
    parameters: {
      type: "object",
      properties: {
        quote_id: { type: "string" },
        recipient_email: { type: "string" },
        recipient_name: { type: "string" },
        recipients: { type: "array", items: { type: "string" } },
        cc: { type: "array", items: { type: "string" } },
        subject: { type: "string" },
        message: { type: "string" },
      },
      required: ["quote_id", "recipient_email"],
    },
  },
};

export const duplicateQuoteDef: ToolDef = {
  type: "function",
  function: {
    name: "duplicate_quote",
    description: "Duplica um orçamento. Permite sufixo de título e desconto global (0-100%).",
    parameters: {
      type: "object",
      properties: {
        quote_id: { type: "string" },
        title_suffix: { type: "string", description: "Sufixo aplicado ao título (máx 50 chars)" },
        apply_discount_percent: { type: "number", description: "0 a 100" },
      },
      required: ["quote_id"],
    },
  },
};

const sendQuote: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId, authHeader } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const perm = requireWrite(ctx, "quotes.edit", "enviar orçamentos");
  if (perm) return perm;
  if (!args?.quote_id || !UUID_RE.test(String(args.quote_id))) return { success: false, message: "quote_id inválido." };
  const recipient = String(args.recipient_email || "").trim();
  if (!EMAIL_RE.test(recipient)) return { success: false, message: "recipient_email inválido." };

  const { data: q } = await supabase
    .from("quotes")
    .select("id")
    .eq("id", args.quote_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!q) return { success: false, message: "Orçamento não encontrado ou fora de scope." };

  if (!authHeader) return { success: false, message: "Sessão sem token — não é possível invocar send-quote-email." };
  const body: Record<string, any> = { quote_id: args.quote_id, recipient_email: recipient };
  if (args.recipient_name) body.recipient_name = String(args.recipient_name);
  if (Array.isArray(args.recipients)) body.recipients = args.recipients;
  if (Array.isArray(args.cc)) body.cc = args.cc;
  if (args.subject) body.subject = String(args.subject);
  if (args.message) body.message = String(args.message);

  const { ok, status, json } = await invokeFn(authHeader, "send-quote-email", body);
  if (!ok) return { success: false, message: `Falha no envio (${status}): ${json?.error || json?.message || "erro desconhecido"}` };
  return { success: true, message: "Orçamento enviado.", data: json };
};

const duplicateQuote: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId, authHeader } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const perm = requireWrite(ctx, "quotes.create", "duplicar orçamentos");
  if (perm) return perm;
  if (!args?.quote_id || !UUID_RE.test(String(args.quote_id))) return { success: false, message: "quote_id inválido." };

  const { data: q } = await supabase
    .from("quotes")
    .select("id")
    .eq("id", args.quote_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!q) return { success: false, message: "Orçamento não encontrado ou fora de scope." };

  const body: Record<string, any> = { quote_id: args.quote_id };
  if (args.title_suffix !== undefined) {
    const s = String(args.title_suffix);
    if (s.length > 50) return { success: false, message: "title_suffix excede 50 chars." };
    body.title_suffix = s;
  }
  if (args.apply_discount_percent !== undefined) {
    const d = Number(args.apply_discount_percent);
    if (!Number.isFinite(d) || d < 0 || d > 100) return { success: false, message: "apply_discount_percent deve estar entre 0 e 100." };
    body.apply_discount_percent = d;
  }

  if (!authHeader) return { success: false, message: "Sessão sem token — não é possível invocar duplicate-quote." };
  const { ok, status, json } = await invokeFn(authHeader, "duplicate-quote", body);
  if (!ok) return { success: false, message: `Falha ao duplicar (${status}): ${json?.error || json?.message || "erro desconhecido"}` };
  return { success: true, message: "Orçamento duplicado.", data: json };
};

export const addQuoteItemsDef: ToolDef = {
  type: "function",
  function: {
    name: "add_quote_items",
    description: "Adiciona linhas (produtos, serviços ou bundles) a um orçamento em rascunho. Resolve preço e IVA do catálogo automaticamente. Bundles são adicionados como linha única com snapshot dos componentes obrigatórios/seleccionados por defeito. Limitações: sem selecção manual de atributos/opções; bundles que exigem escolha manual complexa devem ser abertos no builder.",
    parameters: {
      type: "object",
      properties: {
        quote_id: { type: "string", description: "UUID do orçamento (estado='rascunho')." },
        items: {
          type: "array",
          description: "Lista de itens. Cada item deve ter exactamente um de product_id/service_id/bundle_id.",
          items: {
            type: "object",
            properties: {
              product_id: { type: "string" },
              service_id: { type: "string" },
              bundle_id: { type: "string" },
              qt: { type: "number", description: "Quantidade (default 1)." },
              unit_price: { type: "number", description: "Override; se omitido lê do catálogo." },
              discount_percent: { type: "number", description: "0-100 (default 0)." },
              section_name: { type: "string", description: "Default 'Geral'." },
              item_description: { type: "string" },
            },
          },
        },
      },
      required: ["quote_id", "items"],
    },
  },
};

/**
 * resolveAndInsertQuoteLines — helper partilhado entre `add_quote_items` e
 * `create_quote` (modo inline). Resolve products/services/bundles do catálogo,
 * insere as linhas e actualiza subtotal/total da quote. Idêntico ao corpo
 * anterior de `addQuoteItems` (validações, snapshot de bundle, skipped[]).
 *
 * NÃO faz authz nem valida estado/scope da quote — quem chama é responsável
 * por isso (add_quote_items valida; create_quote acabou de criar a quote).
 */
export async function resolveAndInsertQuoteLines(
  supabase: any,
  organizationId: string,
  quoteId: string,
  items: any[],
): Promise<{ added: number; skipped: Array<{ item: any; reason: string }> }> {
  const { data: ordRow } = await supabase
    .from("quote_lines")
    .select("ordem")
    .eq("quote_id", quoteId)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextOrdem = ((ordRow?.ordem as number) ?? 0) + 1;

  const skipped: Array<{ item: any; reason: string }> = [];
  const linesToInsert: any[] = [];

  for (const raw of items) {
    // Detecta IDs passados como texto (nome do catálogo em vez de UUID) para devolver
    // um motivo claro ao modelo, evitando "ignorado" silencioso.
    const rawProduct = raw?.product_id != null ? String(raw.product_id) : "";
    const rawService = raw?.service_id != null ? String(raw.service_id) : "";
    const rawBundle = raw?.bundle_id != null ? String(raw.bundle_id) : "";
    const nonUuidGiven: string[] = [];
    if (rawProduct && !UUID_RE.test(rawProduct)) nonUuidGiven.push(`product_id="${rawProduct}"`);
    if (rawService && !UUID_RE.test(rawService)) nonUuidGiven.push(`service_id="${rawService}"`);
    if (rawBundle && !UUID_RE.test(rawBundle)) nonUuidGiven.push(`bundle_id="${rawBundle}"`);
    if (nonUuidGiven.length > 0) {
      const kindHint = rawBundle && !UUID_RE.test(rawBundle)
        ? "bundle"
        : rawService && !UUID_RE.test(rawService)
          ? "service"
          : "product";
      const textValue = rawBundle && !UUID_RE.test(rawBundle)
        ? rawBundle
        : rawService && !UUID_RE.test(rawService)
          ? rawService
          : rawProduct;
      skipped.push({
        item: raw,
        reason: `Fluxo incorrecto: chamaste add_quote_items/create_quote(items[]) sem fazeres search_products antes (${nonUuidGiven.join(", ")}). Corre search_products({query:"${textValue}", kind:"${kindHint}"}) primeiro, escolhe o UUID devolvido, e só depois volta a chamar a mutação. NÃO digas ao utilizador que o item não existe — ainda não verificaste.`,
      });
      continue;
    }
    const productId = rawProduct && UUID_RE.test(rawProduct) ? rawProduct : null;
    const serviceId = rawService && UUID_RE.test(rawService) ? rawService : null;
    const bundleId = rawBundle && UUID_RE.test(rawBundle) ? rawBundle : null;
    const ids = [productId, serviceId, bundleId].filter(Boolean);
    if (ids.length !== 1) {
      skipped.push({ item: raw, reason: "Deve fornecer exactamente um de product_id, service_id ou bundle_id (UUID)." });
      continue;
    }
    const qt = Number(raw?.qt ?? 1);
    if (!Number.isFinite(qt) || qt <= 0) { skipped.push({ item: raw, reason: "qt inválido." }); continue; }
    const discountPercent = Number(raw?.discount_percent ?? 0);
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      skipped.push({ item: raw, reason: "discount_percent deve estar entre 0 e 100." }); continue;
    }

    let unitPrice = raw?.unit_price !== undefined ? Number(raw.unit_price) : NaN;
    let vatRate = 23;
    let descricao = "";
    let categoria = "Geral";
    let selectedAttributes: Record<string, any> = {};

    if (productId) {
      const { data: p } = await supabase
        .from("products")
        .select("id, name, category_id, categories:product_categories(name)")
        .eq("id", productId).maybeSingle();
      if (!p) { skipped.push({ item: raw, reason: `Produto não encontrado (id=${productId}). Resolve o id via search_products({kind:'product'}) antes de chamar add_quote_items — não inventes UUIDs.` }); continue; }
      descricao = (p as any).name ?? "";
      categoria = ((p as any).categories?.name) ?? "Geral";
      if (!Number.isFinite(unitPrice)) {
        const { data: pr } = await supabase
          .from("product_prices")
          .select("price, vat_rate")
          .eq("product_id", productId)
          .eq("price_type", "retail")
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        if (!pr) { skipped.push({ item: raw, reason: "Produto sem preço retail no catálogo." }); continue; }
        unitPrice = Number(pr.price);
        vatRate = pr.vat_rate != null ? Number(pr.vat_rate) : 23;
      }
    } else if (serviceId) {
      const { data: s } = await supabase
        .from("services")
        .select("id, name, category_id, categories:service_categories(name)")
        .eq("id", serviceId).maybeSingle();
      if (!s) { skipped.push({ item: raw, reason: `Serviço não encontrado (id=${serviceId}). Resolve o id via search_products({kind:'service'}) antes de chamar add_quote_items — não inventes UUIDs.` }); continue; }
      descricao = (s as any).name ?? "";
      categoria = ((s as any).categories?.name) ?? "Geral";
      if (!Number.isFinite(unitPrice)) {
        const { data: pr } = await supabase
          .from("service_prices")
          .select("price, vat_rate")
          .eq("service_id", serviceId)
          .eq("price_type", "retail")
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        if (!pr) { skipped.push({ item: raw, reason: "Serviço sem preço retail no catálogo." }); continue; }
        unitPrice = Number(pr.price);
        vatRate = pr.vat_rate != null ? Number(pr.vat_rate) : 23;
      }
    } else if (bundleId) {
      const { data: b } = await supabase
        .from("bundles")
        .select(`
          id, name, description, sku, pricing_type, fixed_price, discount_percent, discount_fixed,
          bundle_components (
            id, product_id, service_id, quantity, is_optional,
            pricing_mode, custom_price, custom_discount_percent, custom_discount_fixed,
            choice_group_id, sort_order,
            products:product_id (id, name, sku, product_prices (price, vat_rate, price_type)),
            services:service_id (id, name, sku, service_prices (price, vat_rate, price_type))
          ),
          bundle_choice_groups (id, min_selections, sort_order)
        `)
        .eq("id", bundleId)
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .eq("status", "active")
        .is("deleted_at", null)
        .maybeSingle();
      if (!b) { skipped.push({ item: raw, reason: `Bundle não encontrado (id=${bundleId}). Resolve o id via search_products({kind:'bundle'}) antes de chamar add_quote_items — não inventes UUIDs.` }); continue; }
      descricao = (b as any).name ?? "";
      categoria = "Bundles";
      if (!Number.isFinite(unitPrice)) {
        const components = (((b as any).bundle_components ?? []) as any[])
          .slice()
          .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
        if (components.length === 0) { skipped.push({ item: raw, reason: "Bundle sem componentes." }); continue; }

        const selectedComponents: any[] = [
          ...components.filter((c) => !c.choice_group_id),
        ];
        const groups = (((b as any).bundle_choice_groups ?? []) as any[])
          .slice()
          .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
        for (const group of groups) {
          const min = Math.max(0, Number(group.min_selections ?? 0));
          if (min <= 0) continue;
          selectedComponents.push(...components.filter((c) => c.choice_group_id === group.id).slice(0, min));
        }
        if (selectedComponents.length === 0) { skipped.push({ item: raw, reason: "Bundle requer escolhas manuais no builder." }); continue; }

        const originalTotal = selectedComponents.reduce((sum, comp) => {
          const basePrice = Number(
            comp.products?.product_prices?.find((p: any) => p.price_type === "retail")?.price ??
            comp.services?.service_prices?.find((p: any) => p.price_type === "retail")?.price ??
            0,
          );
          return sum + basePrice * Number(comp.quantity ?? 1);
        }, 0);

        const bundleComponents = selectedComponents.map((comp) => {
          const isProduct = !!comp.product_id;
          const item = isProduct ? comp.products : comp.services;
          const basePrice = Number(
            comp.products?.product_prices?.find((p: any) => p.price_type === "retail")?.price ??
            comp.services?.service_prices?.find((p: any) => p.price_type === "retail")?.price ??
            0,
          );
          let componentUnitPrice = calcBundleComponentPrice(comp, b);
          if ((b as any).pricing_type === "fixed_price" && originalTotal > 0) {
            componentUnitPrice = Number((b as any).fixed_price ?? 0) * (basePrice / originalTotal);
          } else if ((b as any).pricing_type === "fixed_discount" && originalTotal > 0) {
            componentUnitPrice = Math.max(0, basePrice - Number((b as any).discount_fixed ?? 0) * (basePrice / originalTotal));
          }
          return {
            id: `${bundleId}_${comp.id}`,
            name: item?.name ?? "",
            sku: item?.sku ?? null,
            type: isProduct ? "product" : "service",
            source_id: isProduct ? comp.product_id : comp.service_id,
            quantity: Number(comp.quantity ?? 1),
            unit_price: Number(componentUnitPrice.toFixed(4)),
            vat_rate: calcBundleComponentVat(comp),
            choice_group_id: comp.choice_group_id ?? null,
          };
        }).filter((c) => c.source_id);

        unitPrice = bundleComponents.reduce((sum, comp) => sum + Number(comp.unit_price || 0) * Number(comp.quantity || 0), 0);
        selectedAttributes = { bundle_components: bundleComponents };
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          skipped.push({ item: raw, reason: "Bundle sem preço calculável." }); continue;
        }
      }
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      skipped.push({ item: raw, reason: "unit_price inválido." }); continue;
    }

    const totalSemIva = qt * unitPrice;
    const bundleComponents = Array.isArray(selectedAttributes.bundle_components) ? selectedAttributes.bundle_components : [];
    const componentsTotal = bundleComponents.reduce((s: number, c: any) => s + Number(c.unit_price || 0) * Number(c.quantity || 0), 0);
    const ivaValor = componentsTotal > 0
      ? bundleComponents.reduce((s: number, c: any) => {
        const share = (Number(c.unit_price || 0) * Number(c.quantity || 0)) / componentsTotal;
        return s + totalSemIva * share * (Number(c.vat_rate ?? 23) / 100);
      }, 0)
      : totalSemIva * (vatRate / 100);
    const totalComIva = totalSemIva + ivaValor;
    const totalComDesconto = totalComIva * (1 - discountPercent / 100);

    linesToInsert.push({
      quote_id: quoteId,
      product_id: productId,
      service_id: serviceId,
      bundle_id: bundleId,
      selected_attributes: selectedAttributes,
      categoria,
      descricao_snapshot: descricao,
      qt,
      custo_material_unit: unitPrice,
      custo_mao_obra_unit: 0,
      margem_percent: 0,
      iva_percent: vatRate,
      int_percent: 0,
      discount_percent: discountPercent,
      total_sem_iva: Number(totalSemIva.toFixed(2)),
      total_com_iva: Number(totalComIva.toFixed(2)),
      total_com_desconto: Number(totalComDesconto.toFixed(2)),
      ordem: nextOrdem++,
      section_name: raw?.section_name ? String(raw.section_name) : "Geral",
      item_description: raw?.item_description ? String(raw.item_description) : null,
    });
  }

  let added = 0;
  if (linesToInsert.length > 0) {
    const { error: insErr } = await supabase.from("quote_lines").insert(linesToInsert);
    if (insErr) throw insErr;
    added = linesToInsert.length;

    await recalcQuoteTotals(supabase, quoteId);
  }

  return { added, skipped };
}

/**
 * recalcQuoteTotals — recalcula subtotal/total da quote a partir das linhas
 * actuais. Partilhado por resolveAndInsertQuoteLines e pelas tools de
 * remoção/edição de linhas e header.
 */
async function recalcQuoteTotals(supabase: any, quoteId: string): Promise<void> {
  const { data: quoteAggr } = await supabase
    .from("quotes")
    .select("desconto_global_percent, total_fees")
    .eq("id", quoteId)
    .maybeSingle();
  const { data: allLines } = await supabase
    .from("quote_lines")
    .select("total_com_desconto")
    .eq("quote_id", quoteId);
  const subtotal = (allLines ?? []).reduce((s: number, l: any) => s + Number(l.total_com_desconto || 0), 0);
  const globalDisc = Number(quoteAggr?.desconto_global_percent ?? 0);
  const fees = Number(quoteAggr?.total_fees ?? 0);
  const total = subtotal * (1 - globalDisc / 100) + fees;
  await supabase
    .from("quotes")
    .update({ subtotal: Number(subtotal.toFixed(2)), total: Number(total.toFixed(2)) })
    .eq("id", quoteId);
}

const addQuoteItems: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.quote_id || !UUID_RE.test(String(args.quote_id))) {
    return { success: false, message: "quote_id inválido." };
  }
  const items = Array.isArray(args?.items) ? args.items : [];
  if (items.length === 0) return { success: false, message: "items vazio." };
  if (items.length > 50) return { success: false, message: "Máximo 50 itens por chamada." };

  // Carrega quote ANTES da decisão de permissão — herança populate precisa
  // de created_by + estado. Sem isso o helper degrada para edit-strict.
  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select("id, estado, created_by")
    .eq("id", args.quote_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (qErr) throw qErr;
  if (!quote) return { success: false, message: "Orçamento não encontrado ou fora de scope." };

  // Sub-acção populadora: quotes.create chega se for o próprio dono e em rascunho.
  const perm = requireActionPermission(ctx, {
    action: "adicionar linhas a orçamentos",
    mode: "populate",
    basePermission: "quotes.edit",
    inheritFrom: "quotes.create",
    record: { created_by: quote.created_by, status: quote.estado },
    mutableStatuses: QUOTE_MUTABLE_STATUSES,
  });
  if (perm) return perm;

  if (quote.estado !== "rascunho") {
    return { success: false, message: `Orçamento está em estado '${quote.estado}'. Só rascunhos aceitam novas linhas — usa duplicate_quote para criar uma cópia editável.` };
  }

  const { added, skipped } = await resolveAndInsertQuoteLines(supabase, organizationId, args.quote_id, items);
  const firstReason = skipped[0]?.reason ? ` Motivo: ${skipped[0].reason}` : "";
  if (added === 0) {
    return {
      success: false,
      message: `Nenhuma linha foi adicionada ao orçamento (${skipped.length} ignorada(s)).${firstReason}`,
      data: { added: 0, skipped, link: `/quotes?open=${args.quote_id}` },
    };
  }
  const msg = `${added} linha(s) adicionada(s)${skipped.length ? `, ${skipped.length} ignorada(s).${firstReason}` : "."}`;
  return {
    success: true,
    message: msg,
    data: { added, skipped, link: `/quotes?open=${args.quote_id}` },
  };
};

const setQuoteTemplate: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.quote_id || !UUID_RE.test(String(args.quote_id))) {
    return { success: false, message: "quote_id inválido." };
  }
  const rawTpl = args.template_id;
  let templateId: string | null = null;
  if (rawTpl !== null && rawTpl !== undefined && String(rawTpl).length > 0) {
    if (!UUID_RE.test(String(rawTpl))) return { success: false, message: "template_id inválido." };
    templateId = String(rawTpl);
  }

  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select("id, estado, created_by")
    .eq("id", args.quote_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (qErr) throw qErr;
  if (!quote) return { success: false, message: "Orçamento não encontrado ou fora de scope." };

  const perm = requireActionPermission(ctx, {
    action: "associar layout de PDF a orçamentos",
    mode: "populate",
    basePermission: "quotes.edit",
    inheritFrom: "quotes.create",
    record: { created_by: quote.created_by, status: quote.estado },
    mutableStatuses: QUOTE_MUTABLE_STATUSES,
  });
  if (perm) return perm;

  if (quote.estado !== "rascunho") {
    return { success: false, message: `Orçamento está em estado '${quote.estado}'. Só rascunhos aceitam mudança de layout.` };
  }

  if (templateId) {
    const { data: tpl } = await supabase
      .from("proposal_templates")
      .select("id")
      .eq("id", templateId)
      .eq("organization_id", organizationId)
      .eq("template_type", "quote")
      .eq("is_active", true)
      .maybeSingle();
    if (!tpl) return { success: false, message: "Layout de PDF não encontrado, fora da organização ou inactivo." };
  }

  const { error: upErr } = await supabase
    .from("quotes")
    .update({ template_id: templateId })
    .eq("id", args.quote_id);
  if (upErr) throw upErr;

  return {
    success: true,
    message: templateId ? "Layout de PDF associado ao orçamento." : "Layout de PDF removido do orçamento.",
    data: { id: args.quote_id, template_id: templateId, link: `/quotes?open=${args.quote_id}` },
  };
};

const listQuoteTemplates: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  // Layouts de PDF vivem em proposal_templates (template_type='quote').
  // A página /quote-templates é guardada por `proposals.manage`; espelha-se aqui.
  const perm = requirePermission(ctx, "proposals.manage", "listar layouts de PDF de orçamento");
  if (perm) return perm;

  const limit = Math.min(Math.max(Number(args?.limit ?? 50) || 50, 1), 50);
  let q = supabase
    .from("proposal_templates")
    .select("id, name, description, is_default")
    .eq("organization_id", organizationId)
    .eq("template_type", "quote")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(limit);
  if (args?.search && typeof args.search === "string" && args.search.trim().length > 0) {
    const term = `%${args.search.trim()}%`;
    q = q.ilike("name", term);
  }
  const { data, error } = await q;
  if (error) throw error;
  return {
    success: true,
    message: `${data?.length || 0} layout(s) de PDF disponível(is).`,
    data: data || [],
  };
};

const listQuoteModels: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const perm = requirePermission(ctx, "quote_templates.view", "listar modelos rápidos de orçamento");
  if (perm) return perm;

  const limit = Math.min(Math.max(Number(args?.limit ?? 50) || 50, 1), 50);
  let q = supabase
    .from("quote_templates")
    .select("id, codigo, name, description")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .order("name", { ascending: true })
    .limit(limit);
  if (args?.search && typeof args.search === "string" && args.search.trim().length > 0) {
    const term = `%${args.search.trim()}%`;
    q = q.or(`name.ilike.${term},codigo.ilike.${term}`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return {
    success: true,
    message: `${data?.length || 0} modelo(s) rápido(s) disponível(is).`,
    data: data || [],
  };
};

const setQuoteModel: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.quote_id || !UUID_RE.test(String(args.quote_id))) {
    return { success: false, message: "quote_id inválido." };
  }
  const raw = args.modelo_base;
  const codigoIn = raw === null || raw === undefined ? "" : String(raw);
  const clear = codigoIn.length === 0 || codigoIn === "0";
  const codigo = clear ? "0" : codigoIn;

  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select("id, estado, created_by")
    .eq("id", args.quote_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (qErr) throw qErr;
  if (!quote) return { success: false, message: "Orçamento não encontrado ou fora de scope." };

  const perm = requireActionPermission(ctx, {
    action: "associar modelo rápido a orçamentos",
    mode: "populate",
    basePermission: "quotes.edit",
    inheritFrom: "quotes.create",
    record: { created_by: quote.created_by, status: quote.estado },
    mutableStatuses: QUOTE_MUTABLE_STATUSES,
  });
  if (perm) return perm;

  if (quote.estado !== "rascunho") {
    return { success: false, message: `Orçamento está em estado '${quote.estado}'. Só rascunhos aceitam mudança de modelo.` };
  }

  if (!clear) {
    const { data: model } = await supabase
      .from("quote_templates")
      .select("codigo")
      .eq("codigo", codigo)
      .eq("organization_id", organizationId)
      .eq("active", true)
      .maybeSingle();
    if (!model) return { success: false, message: "Modelo rápido não encontrado, fora da organização ou inactivo. Usa list_quote_models." };
  }

  const { error: upErr } = await supabase
    .from("quotes")
    .update({ modelo_base: codigo })
    .eq("id", args.quote_id);
  if (upErr) throw upErr;

  return {
    success: true,
    message: clear ? "Modelo rápido removido do orçamento." : `Modelo rápido '${codigo}' associado. Não foram inseridos items — usa add_quote_items se quiseres pré-popular.`,
    data: { id: args.quote_id, modelo_base: codigo, link: `/quotes?open=${args.quote_id}` },
  };
};

// =================================================================
// Fase 1 — Leitura e edição de orçamentos via Olyvia
// =================================================================

export const getQuoteDetailsDef: ToolDef = {
  type: "function",
  function: {
    name: "get_quote_details",
    description: "Devolve detalhes completos de um orçamento (header + linhas + totais). Usa antes de remover/alterar linhas para confirmar conteúdo com o utilizador. Sem mutação.",
    parameters: {
      type: "object",
      properties: {
        quote_id: { type: "string", description: "UUID do orçamento. Aceita também quote_number (Q-AAAA-NNNN) — o servidor resolve." },
      },
      required: ["quote_id"],
    },
  },
};

export const removeQuoteLinesDef: ToolDef = {
  type: "function",
  function: {
    name: "remove_quote_lines",
    description: "Remove uma ou mais linhas de um orçamento em rascunho. Os line_id obtêm-se via get_quote_details. Recalcula totais.",
    parameters: {
      type: "object",
      properties: {
        quote_id: { type: "string" },
        line_ids: {
          type: "array",
          description: "UUIDs das linhas a remover (quote_lines.id).",
          items: { type: "string" },
        },
      },
      required: ["quote_id", "line_ids"],
    },
  },
};

export const updateQuoteLineDef: ToolDef = {
  type: "function",
  function: {
    name: "update_quote_line",
    description: "Altera campos editáveis de uma linha de um orçamento em rascunho (qt, unit_price, discount_percent, section_name, item_description). Recalcula totais da linha e do orçamento. Não muda o produto/serviço/bundle subjacente.",
    parameters: {
      type: "object",
      properties: {
        quote_id: { type: "string" },
        line_id: { type: "string", description: "UUID da linha (quote_lines.id)." },
        qt: { type: "number" },
        unit_price: { type: "number", description: "Preço unitário sem IVA. Opcional." },
        discount_percent: { type: "number", description: "0-100." },
        section_name: { type: "string" },
        item_description: { type: "string" },
      },
      required: ["quote_id", "line_id"],
    },
  },
};

export const updateQuoteDef: ToolDef = {
  type: "function",
  function: {
    name: "update_quote",
    description: "Altera campos editáveis do header de um orçamento em rascunho (title, client_notes, validade_dias, desconto_global_percent). Recalcula total quando desconto_global_percent muda. Não altera linhas — para isso usa update_quote_line/remove_quote_lines/add_quote_items.",
    parameters: {
      type: "object",
      properties: {
        quote_id: { type: "string" },
        title: { type: "string" },
        client_notes: { type: "string" },
        validade_dias: { type: "number" },
        desconto_global_percent: { type: "number", description: "0-100." },
      },
      required: ["quote_id"],
    },
  },
};

async function loadMutableQuote(
  supabase: any,
  organizationId: string,
  quoteId: string,
): Promise<{ error?: ToolResult; quote?: any }> {
  const { data: quote, error } = await supabase
    .from("quotes")
    .select("id, estado, created_by")
    .eq("id", quoteId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!quote) return { error: { success: false, message: "Orçamento não encontrado ou fora de scope." } };
  if (quote.estado !== "rascunho") {
    return { error: { success: false, message: `Orçamento está em estado '${quote.estado}'. Só rascunhos aceitam alterações.` } };
  }
  return { quote };
}

const getQuoteDetails: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const perm = requirePermission(ctx, "quotes.view", "ver orçamentos");
  if (perm) return perm;
  if (!args?.quote_id || !UUID_RE.test(String(args.quote_id))) {
    return { success: false, message: "quote_id inválido." };
  }

  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select("id, quote_number, title, estado, entity_id, client_notes, validade_dias, desconto_global_percent, total_fees, subtotal, total, modelo_base, template_id, created_at, created_by")
    .eq("id", args.quote_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (qErr) throw qErr;
  if (!quote) return { success: false, message: "Orçamento não encontrado ou fora de scope." };

  const { data: client } = await supabase
    .from("anew_entities")
    .select("id, display_name")
    .eq("id", quote.entity_id)
    .maybeSingle();

  const { data: lines, error: lErr } = await supabase
    .from("quote_lines")
    .select("id, ordem, section_name, descricao_snapshot, item_description, qt, custo_material_unit, discount_percent, iva_percent, total_sem_iva, total_com_iva, total_com_desconto, product_id, service_id, bundle_id, categoria")
    .eq("quote_id", args.quote_id)
    .order("ordem", { ascending: true });
  if (lErr) throw lErr;

  // Fees: snapshot bruto de quote_fees + current_config do service_fee_types.
  // Totais lidos directamente de quotes (verdade histórica) — nunca recalcular.
  const { data: feeRows } = await supabase
    .from("quote_fees")
    .select(`
      id, fee_type_id, base_amount, calculated_value, vat_rate, vat_amount,
      fee_type:service_fee_types!quote_fees_fee_type_id_fkey(
        id, name, calculation_type, percentage, fixed_amount, application_mode, apply_vat, vat_rate, is_active
      )
    `)
    .eq("quote_id", args.quote_id);

  const fees = (feeRows ?? []).map((r: any) => ({
    fee_id: r.id,
    fee_type_id: r.fee_type_id,
    name: r.fee_type?.name ?? null,
    snapshot: {
      base_amount: Number(r.base_amount),
      calculated_value: Number(r.calculated_value),
      vat_rate: Number(r.vat_rate),
      vat_amount: Number(r.vat_amount),
    },
    current_config: r.fee_type
      ? {
        calculation_type: r.fee_type.calculation_type,
        percentage: r.fee_type.percentage,
        fixed_amount: r.fee_type.fixed_amount,
        application_mode: r.fee_type.application_mode,
        apply_vat: r.fee_type.apply_vat,
        vat_rate: r.fee_type.vat_rate,
        is_active: r.fee_type.is_active,
      }
      : null,
  }));

  const linesView = (lines ?? []).map((l: any) => ({
    line_id: l.id,
    ordem: l.ordem,
    section_name: l.section_name,
    categoria: l.categoria,
    descricao: l.descricao_snapshot,
    item_description: l.item_description,
    qt: Number(l.qt),
    unit_price: Number(l.custo_material_unit),
    discount_percent: Number(l.discount_percent),
    iva_percent: Number(l.iva_percent),
    total_sem_iva: Number(l.total_sem_iva),
    total_com_iva: Number(l.total_com_iva),
    total_com_desconto: Number(l.total_com_desconto),
    product_id: l.product_id,
    service_id: l.service_id,
    bundle_id: l.bundle_id,
  }));

  return {
    success: true,
    message: `Orçamento ${quote.quote_number ?? quote.id} com ${linesView.length} linha(s) e ${fees.length} taxa(s).`,
    data: {
      id: quote.id,
      quote_number: quote.quote_number,
      title: quote.title,
      estado: quote.estado,
      client: client ? { id: client.id, name: client.display_name } : null,
      client_notes: quote.client_notes,
      validade_dias: quote.validade_dias,
      desconto_global_percent: Number(quote.desconto_global_percent ?? 0),
      total_fees: Number(quote.total_fees ?? 0),
      subtotal: Number(quote.subtotal ?? 0),
      total: Number(quote.total ?? 0),
      modelo_base: quote.modelo_base,
      template_id: quote.template_id,
      created_at: quote.created_at,
      lines: linesView,
      fees,
      link: `/quotes?open=${quote.id}`,
    },
  };
};

const removeQuoteLines: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.quote_id || !UUID_RE.test(String(args.quote_id))) {
    return { success: false, message: "quote_id inválido." };
  }
  const lineIds: string[] = Array.isArray(args?.line_ids) ? args.line_ids.map(String) : [];
  if (lineIds.length === 0) return { success: false, message: "line_ids vazio." };
  if (lineIds.length > 50) return { success: false, message: "Máximo 50 linhas por chamada." };
  if (lineIds.some((id) => !UUID_RE.test(id))) {
    return { success: false, message: "line_ids inválido — usa get_quote_details para obter os UUIDs das linhas." };
  }

  const { error: loadErr, quote } = await loadMutableQuote(supabase, organizationId, args.quote_id);
  if (loadErr) return loadErr;

  const perm = requireActionPermission(ctx, {
    action: "remover linhas de orçamentos",
    mode: "populate",
    basePermission: "quotes.edit",
    inheritFrom: "quotes.create",
    record: { created_by: quote.created_by, status: quote.estado },
    mutableStatuses: QUOTE_MUTABLE_STATUSES,
  });
  if (perm) return perm;

  // Confirma que todas as linhas pertencem ao orçamento (defesa em profundidade).
  const { data: owned } = await supabase
    .from("quote_lines")
    .select("id")
    .eq("quote_id", args.quote_id)
    .in("id", lineIds);
  const ownedIds = new Set((owned ?? []).map((r: any) => r.id));
  const foreign = lineIds.filter((id) => !ownedIds.has(id));
  if (foreign.length > 0) {
    return { success: false, message: `${foreign.length} line_id(s) não pertencem a este orçamento.` };
  }

  const { error: delErr } = await supabase
    .from("quote_lines")
    .delete()
    .eq("quote_id", args.quote_id)
    .in("id", lineIds);
  if (delErr) throw delErr;

  await recalcQuoteTotals(supabase, args.quote_id);

  return {
    success: true,
    message: `${lineIds.length} linha(s) removida(s).`,
    data: { removed: lineIds.length, link: `/quotes?open=${args.quote_id}` },
  };
};

function recomputeLineTotals(line: any, patch: any): { total_sem_iva: number; total_com_iva: number; total_com_desconto: number } {
  const qt = patch.qt !== undefined ? Number(patch.qt) : Number(line.qt);
  const unitPrice = patch.custo_material_unit !== undefined ? Number(patch.custo_material_unit) : Number(line.custo_material_unit);
  const discount = patch.discount_percent !== undefined ? Number(patch.discount_percent) : Number(line.discount_percent ?? 0);
  const vatRate = Number(line.iva_percent ?? 23);
  const totalSemIva = qt * unitPrice;

  const bundleComponents = Array.isArray(line.selected_attributes?.bundle_components) ? line.selected_attributes.bundle_components : [];
  const componentsTotal = bundleComponents.reduce((s: number, c: any) => s + Number(c.unit_price || 0) * Number(c.quantity || 0), 0);
  const ivaValor = componentsTotal > 0
    ? bundleComponents.reduce((s: number, c: any) => {
      const share = (Number(c.unit_price || 0) * Number(c.quantity || 0)) / componentsTotal;
      return s + totalSemIva * share * (Number(c.vat_rate ?? 23) / 100);
    }, 0)
    : totalSemIva * (vatRate / 100);
  const totalComIva = totalSemIva + ivaValor;
  const totalComDesconto = totalComIva * (1 - discount / 100);
  return {
    total_sem_iva: Number(totalSemIva.toFixed(2)),
    total_com_iva: Number(totalComIva.toFixed(2)),
    total_com_desconto: Number(totalComDesconto.toFixed(2)),
  };
}

const updateQuoteLine: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.quote_id || !UUID_RE.test(String(args.quote_id))) {
    return { success: false, message: "quote_id inválido." };
  }
  if (!args?.line_id || !UUID_RE.test(String(args.line_id))) {
    return { success: false, message: "line_id inválido — usa get_quote_details para obter os UUIDs." };
  }

  const { error: loadErr, quote } = await loadMutableQuote(supabase, organizationId, args.quote_id);
  if (loadErr) return loadErr;

  const perm = requireActionPermission(ctx, {
    action: "alterar linhas de orçamentos",
    mode: "populate",
    basePermission: "quotes.edit",
    inheritFrom: "quotes.create",
    record: { created_by: quote.created_by, status: quote.estado },
    mutableStatuses: QUOTE_MUTABLE_STATUSES,
  });
  if (perm) return perm;

  const { data: line, error: lErr } = await supabase
    .from("quote_lines")
    .select("id, qt, custo_material_unit, discount_percent, iva_percent, selected_attributes, section_name, item_description")
    .eq("id", args.line_id)
    .eq("quote_id", args.quote_id)
    .maybeSingle();
  if (lErr) throw lErr;
  if (!line) return { success: false, message: "Linha não encontrada neste orçamento." };

  const patch: Record<string, any> = {};
  if (args.qt !== undefined) {
    const v = Number(args.qt);
    if (!Number.isFinite(v) || v <= 0) return { success: false, message: "qt inválido." };
    patch.qt = v;
  }
  if (args.unit_price !== undefined) {
    const v = Number(args.unit_price);
    if (!Number.isFinite(v) || v < 0) return { success: false, message: "unit_price inválido." };
    patch.custo_material_unit = v;
  }
  if (args.discount_percent !== undefined) {
    const v = Number(args.discount_percent);
    if (!Number.isFinite(v) || v < 0 || v > 100) return { success: false, message: "discount_percent deve estar entre 0 e 100." };
    patch.discount_percent = v;
  }
  if (args.section_name !== undefined) patch.section_name = String(args.section_name);
  if (args.item_description !== undefined) patch.item_description = args.item_description === null ? null : String(args.item_description);

  if (Object.keys(patch).length === 0) {
    return { success: false, message: "Nada para actualizar — passa pelo menos um campo." };
  }

  const totals = recomputeLineTotals(line, patch);
  Object.assign(patch, totals);

  const { error: upErr } = await supabase
    .from("quote_lines")
    .update(patch)
    .eq("id", args.line_id);
  if (upErr) throw upErr;

  await recalcQuoteTotals(supabase, args.quote_id);

  return {
    success: true,
    message: "Linha actualizada.",
    data: { line_id: args.line_id, link: `/quotes?open=${args.quote_id}`, totals },
  };
};

const updateQuote: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.quote_id || !UUID_RE.test(String(args.quote_id))) {
    return { success: false, message: "quote_id inválido." };
  }

  const { error: loadErr, quote } = await loadMutableQuote(supabase, organizationId, args.quote_id);
  if (loadErr) return loadErr;

  const perm = requireActionPermission(ctx, {
    action: "alterar orçamentos",
    mode: "populate",
    basePermission: "quotes.edit",
    inheritFrom: "quotes.create",
    record: { created_by: quote.created_by, status: quote.estado },
    mutableStatuses: QUOTE_MUTABLE_STATUSES,
  });
  if (perm) return perm;

  const patch: Record<string, any> = {};
  if (args.title !== undefined) {
    const v = String(args.title).trim();
    if (!v) return { success: false, message: "title vazio." };
    patch.title = v;
  }
  if (args.client_notes !== undefined) patch.client_notes = args.client_notes === null ? null : String(args.client_notes);
  if (args.validade_dias !== undefined) {
    const v = Number(args.validade_dias);
    if (!Number.isFinite(v) || v < 0 || v > 365) return { success: false, message: "validade_dias inválido (0-365)." };
    patch.validade_dias = v;
  }
  let recalc = false;
  if (args.desconto_global_percent !== undefined) {
    const v = Number(args.desconto_global_percent);
    if (!Number.isFinite(v) || v < 0 || v > 100) return { success: false, message: "desconto_global_percent deve estar entre 0 e 100." };
    patch.desconto_global_percent = v;
    recalc = true;
  }

  if (Object.keys(patch).length === 0) {
    return { success: false, message: "Nada para actualizar — passa pelo menos um campo." };
  }

  const { error: upErr } = await supabase
    .from("quotes")
    .update(patch)
    .eq("id", args.quote_id);
  if (upErr) throw upErr;

  if (recalc) await recalcQuoteTotals(supabase, args.quote_id);

  return {
    success: true,
    message: "Orçamento actualizado.",
    data: { id: args.quote_id, updated_fields: Object.keys(patch), link: `/quotes?open=${args.quote_id}` },
  };
};

export const deleteQuoteDef: ToolDef = {
  type: "function",
  function: {
    name: "delete_quote",
    description: "Cancela (soft delete) um orçamento. Acção TERMINAL — pedir confirmação explícita ao utilizador antes de chamar com confirm=true. Bloqueado se estado for 'aceite' ou 'finalizado'.",
    parameters: {
      type: "object",
      properties: {
        quote_id: { type: "string", description: "UUID, quote_number (Q-AAAA-NNNN) ou título parcial — o servidor resolve." },
        confirm: { type: "boolean", description: "Tem de ser true. Não envies sem o utilizador confirmar." },
      },
      required: ["quote_id", "confirm"],
    },
  },
};

const deleteQuote: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.quote_id || !UUID_RE.test(String(args.quote_id))) {
    return { success: false, message: "quote_id inválido." };
  }
  if (args?.confirm !== true) {
    return { success: false, message: "Confirmação obrigatória — pede ao utilizador para confirmar e volta a chamar com confirm=true." };
  }
  const perm = requireWrite(ctx, "quotes.edit", "cancelar orçamentos");
  if (perm) return perm;

  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select("id, quote_number, estado")
    .eq("id", args.quote_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (qErr) throw qErr;
  if (!quote) return { success: false, message: "Orçamento não encontrado ou fora de scope." };
  if (quote.estado === "aceite" || quote.estado === "finalizado") {
    return { success: false, message: `Não posso cancelar orçamento ${quote.quote_number ?? quote.id} — está em estado '${quote.estado}'.` };
  }

  const { error: rpcErr } = await supabase.rpc("soft_delete_business_entity", {
    p_kind: "quote",
    p_id: args.quote_id,
  });
  if (rpcErr) return { success: false, message: `Falha ao cancelar: ${rpcErr.message}` };

  return {
    success: true,
    message: `Orçamento ${quote.quote_number ?? quote.id} cancelado.`,
    data: { id: args.quote_id, quote_number: quote.quote_number, link: "/quotes" },
  };
};

// ============================================================================
// Taxas de serviço (quote_fees) — Fase 4.L
// ============================================================================
//
// LIMITAÇÃO TÉCNICA (NÃO expor ao utilizador em fluxo normal):
// A persistência abaixo (DELETE + INSERT em `quote_fees` + UPDATE `quotes`)
// NÃO é atómica — `quote_fees` não tem unique `(quote_id, fee_type_id)` e não
// existe RPC transacional. Implementamos snapshot+rollback best-effort: em
// caso de falha do INSERT/UPDATE, tentamos restaurar o snapshot anterior.
// Mesmo assim existe uma janela curta em que o orçamento pode ficar sem fees
// se ambos os passos falharem (catch + rollbackErr → mensagem explícita).
// Dívida técnica registada: criar RPC `replace_quote_fees(quote_id, fees[])`.
//
// PARIDADE COM UI: `list_service_fees` filtra APENAS por `organization_id`
// (sem globais), tal como o QuoteBuilder (linha 1448 do componente). Não
// expandir sem decisão de produto explícita.

import { calculateQuoteFees, roundCurrency, type FeeForCalc, type LineForFees } from "../../_shared/calculateQuoteFees.ts";

export const listServiceFeesDef: ToolDef = {
  type: "function",
  function: {
    name: "list_service_fees",
    description:
      "Lista as taxas de serviço (service_fee_types) disponíveis nesta organização. Paridade exacta com o QuoteBuilder — globais NÃO são incluídas. Usar antes de add_quote_fee para resolver o fee_type_id correcto.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Filtro parcial sobre name (opcional)." },
        only_active: { type: "boolean", description: "Default true." },
        limit: { type: "number", description: "1-50, default 25." },
      },
    },
  },
};

const listServiceFees: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const perm = requirePermission(ctx, "service_fees.view", "listar taxas de serviço");
  if (perm) return perm;
  const limit = Math.min(Math.max(Number(args?.limit ?? 25) || 25, 1), 50);
  const onlyActive = args?.only_active !== false;

  let q = supabase
    .from("service_fee_types")
    .select("id, name, description, calculation_type, percentage, fixed_amount, application_mode, apply_vat, vat_rate, is_active")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true })
    .limit(limit);
  if (onlyActive) q = q.eq("is_active", true);
  if (args?.query && typeof args.query === "string" && args.query.trim().length > 0) {
    q = q.ilike("name", `%${args.query.trim()}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return {
    success: true,
    message: `${data?.length || 0} taxa(s) de serviço disponível(is).`,
    data: { items: data ?? [], count: data?.length ?? 0 },
  };
};

export const listQuoteFeesDef: ToolDef = {
  type: "function",
  function: {
    name: "list_quote_fees",
    description:
      "Lista as taxas actualmente persistidas num orçamento (snapshot histórico em quote_fees). Inclui também current_config do service_fee_types — a configuração no catálogo pode ter mudado desde o snapshot.",
    parameters: {
      type: "object",
      properties: { quote_id: { type: "string" } },
      required: ["quote_id"],
    },
  },
};

const listQuoteFees: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  const perm = requirePermission(ctx, "quotes.view", "ver taxas de orçamentos");
  if (perm) return perm;
  if (!args?.quote_id || !UUID_RE.test(String(args.quote_id))) {
    return { success: false, message: "quote_id inválido." };
  }
  // Confirma scope
  const { data: quote } = await supabase
    .from("quotes")
    .select("id, quote_number, total_fees, total")
    .eq("id", args.quote_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!quote) return { success: false, message: "Orçamento não encontrado ou fora de scope." };

  const { data: fees, error } = await supabase
    .from("quote_fees")
    .select(`
      id, fee_type_id, base_amount, calculated_value, vat_rate, vat_amount, created_at,
      fee_type:service_fee_types!quote_fees_fee_type_id_fkey(
        id, name, calculation_type, percentage, fixed_amount, application_mode, apply_vat, vat_rate, is_active
      )
    `)
    .eq("quote_id", args.quote_id);
  if (error) throw error;

  const items = (fees ?? []).map((r: any) => ({
    fee_id: r.id,
    fee_type_id: r.fee_type_id,
    name: r.fee_type?.name ?? null,
    snapshot: {
      base_amount: Number(r.base_amount),
      calculated_value: Number(r.calculated_value),
      vat_rate: Number(r.vat_rate),
      vat_amount: Number(r.vat_amount),
    },
    current_config: r.fee_type
      ? {
        calculation_type: r.fee_type.calculation_type,
        percentage: r.fee_type.percentage,
        fixed_amount: r.fee_type.fixed_amount,
        application_mode: r.fee_type.application_mode,
        apply_vat: r.fee_type.apply_vat,
        vat_rate: r.fee_type.vat_rate,
        is_active: r.fee_type.is_active,
      }
      : null,
  }));

  return {
    success: true,
    message: `${items.length} taxa(s) no orçamento ${quote.quote_number ?? quote.id}.`,
    data: {
      fees: items,
      totals: {
        total_fees: Number(quote.total_fees ?? 0),
        total: Number(quote.total ?? 0),
      },
      link: `/quotes?open=${quote.id}`,
    },
  };
};

// Carrega contexto necessário para recalcular fees: linhas (forma LineForFees)
// + fees actualmente seleccionadas + overrides historicamente persistidos.
async function loadFeeCalcContext(
  supabase: any,
  organizationId: string,
  quoteId: string,
): Promise<{
  feeLines: LineForFees[];
  currentFees: Array<{ id: string; fee_type_id: string; vat_rate: number }>;
  feeTypes: Map<string, FeeForCalc>;
}> {
  const { data: lines } = await supabase
    .from("quote_lines")
    .select("qt, custo_material_unit, custo_mao_obra_unit, retail_price_unit, margem_percent, int_percent, discount_percent, selected_attributes, product_id, service_id, bundle_id, total_sem_iva")
    .eq("quote_id", quoteId);

  const feeLines: LineForFees[] = (lines ?? [])
    .filter((l: any) => Number(l.qt || 0) > 0)
    .map((l: any) => {
      // Reconstituir precoSemIva 1:1 com QuoteBuilder:
      // precoSemIvaBase = unitPrice * qt; precoSemIva = base * (1 - lineDiscount/100).
      // Em DB, total_sem_iva = qt * custo_material_unit (recomputeLineTotals).
      // Para preservar paridade com a UI usamos o cálculo da UI:
      const custoUnit = Number(l.custo_material_unit || 0) + Number(l.custo_mao_obra_unit || 0);
      const isManual = custoUnit === 0 && l.retail_price_unit !== null && l.retail_price_unit !== undefined;
      const unitPrice = isManual
        ? Number(l.retail_price_unit || 0)
        : custoUnit * (1 + Number(l.margem_percent || 0) / 100) * (1 + Number(l.int_percent || 0) / 100);
      const precoSemIvaBase = unitPrice * Number(l.qt || 0);
      const precoSemIva = precoSemIvaBase * (1 - Number(l.discount_percent || 0) / 100);
      return {
        precoSemIva,
        isService: !!l.service_id && !l.product_id && !l.bundle_id,
        riskFeePercent: l.selected_attributes?.risk_fee_percent,
      };
    });

  const { data: currentFees } = await supabase
    .from("quote_fees")
    .select("id, fee_type_id, vat_rate")
    .eq("quote_id", quoteId);

  const feeTypeIds = Array.from(new Set((currentFees ?? []).map((f: any) => f.fee_type_id)));
  const feeTypesMap = new Map<string, FeeForCalc>();
  if (feeTypeIds.length > 0) {
    const { data: ft } = await supabase
      .from("service_fee_types")
      .select("id, name, calculation_type, percentage, fixed_amount, application_mode, apply_vat, vat_rate")
      .in("id", feeTypeIds);
    for (const f of ft ?? []) feeTypesMap.set(f.id, f as FeeForCalc);
  }

  return {
    feeLines,
    currentFees: (currentFees ?? []).map((f: any) => ({
      id: f.id,
      fee_type_id: f.fee_type_id,
      vat_rate: Number(f.vat_rate),
    })),
    feeTypes: feeTypesMap,
  };
}

// Persiste a nova selecção de fees com snapshot+rollback (não-atómico).
async function replaceQuoteFees(
  supabase: any,
  quoteId: string,
  newSelection: FeeForCalc[],
  feeVatOverrides: Record<string, number>,
  feeLines: LineForFees[],
): Promise<{ success: true; totals: { total_fees: number; total: number }; perFee: any[] } | { success: false; message: string; details?: any }> {
  // Snapshot
  const { data: snapshotRows } = await supabase
    .from("quote_fees")
    .select("quote_id, fee_type_id, base_amount, calculated_value, vat_rate, vat_amount")
    .eq("quote_id", quoteId);
  const snapshot = snapshotRows ?? [];
  const { data: quoteSnap } = await supabase
    .from("quotes")
    .select("total_fees, total")
    .eq("id", quoteId)
    .maybeSingle();
  const snapshotTotals = {
    total_fees: Number(quoteSnap?.total_fees ?? 0),
    total: Number(quoteSnap?.total ?? 0),
  };

  // Recalcular
  const result = calculateQuoteFees({
    lines: feeLines,
    selectedFeeTypes: newSelection,
    feeVatOverrides,
  });
  const rowsToInsert = result.perFee.map((f) => ({
    quote_id: quoteId,
    fee_type_id: f.feeId,
    base_amount: roundCurrency(f.baseAmount),
    calculated_value: roundCurrency(f.calculatedValue),
    vat_rate: roundCurrency(f.vatRate),
    vat_amount: roundCurrency(f.vatAmount),
  }));
  const newTotalFees = roundCurrency(result.totalFeesWithVat);

  try {
    // DELETE
    const { error: delErr } = await supabase.from("quote_fees").delete().eq("quote_id", quoteId);
    if (delErr) throw delErr;

    // INSERT (se houver)
    if (rowsToInsert.length > 0) {
      const { error: insErr } = await supabase.from("quote_fees").insert(rowsToInsert);
      if (insErr) throw insErr;
    }

    // UPDATE total_fees + recalc subtotal/total
    const { error: upTotalFeesErr } = await supabase
      .from("quotes")
      .update({ total_fees: newTotalFees })
      .eq("id", quoteId);
    if (upTotalFeesErr) throw upTotalFeesErr;

    await recalcQuoteTotals(supabase, quoteId);

    const { data: finalQuote } = await supabase
      .from("quotes")
      .select("total_fees, total")
      .eq("id", quoteId)
      .maybeSingle();
    return {
      success: true,
      totals: {
        total_fees: Number(finalQuote?.total_fees ?? newTotalFees),
        total: Number(finalQuote?.total ?? 0),
      },
      perFee: result.perFee,
    };
  } catch (err: any) {
    // Rollback best-effort
    try {
      await supabase.from("quote_fees").delete().eq("quote_id", quoteId);
      if (snapshot.length > 0) {
        await supabase.from("quote_fees").insert(snapshot);
      }
      await supabase
        .from("quotes")
        .update({ total_fees: snapshotTotals.total_fees, total: snapshotTotals.total })
        .eq("id", quoteId);
      return {
        success: false,
        message: `Não foi possível actualizar as taxas (${err?.message ?? "erro desconhecido"}). Estado anterior restaurado.`,
      };
    } catch (rollbackErr: any) {
      return {
        success: false,
        message: "Falha crítica nas taxas e o estado anterior não pôde ser restaurado. Reveja o orçamento manualmente.",
        details: { original_error: err?.message, rollback_error: rollbackErr?.message },
      };
    }
  }
}

export const addQuoteFeeDef: ToolDef = {
  type: "function",
  function: {
    name: "add_quote_fee",
    description:
      "Adiciona uma taxa de serviço (service_fee_types) a um orçamento em rascunho. Recalcula todas as taxas via cálculo canónico partilhado com o QuoteBuilder. Rejeita duplicação (mesmo fee_type_id já presente) e segunda fee LINE_PERCENTAGE.",
    parameters: {
      type: "object",
      properties: {
        quote_id: { type: "string" },
        fee_type_id: { type: "string", description: "UUID via list_service_fees." },
      },
      required: ["quote_id", "fee_type_id"],
    },
  },
};

const addQuoteFee: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.quote_id || !UUID_RE.test(String(args.quote_id))) {
    return { success: false, message: "quote_id inválido." };
  }
  if (!args?.fee_type_id || !UUID_RE.test(String(args.fee_type_id))) {
    return { success: false, message: "fee_type_id inválido — usa list_service_fees." };
  }

  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select("id, estado, created_by, quote_number")
    .eq("id", args.quote_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (qErr) throw qErr;
  if (!quote) return { success: false, message: "Orçamento não encontrado ou fora de scope." };

  const perm = requireActionPermission(ctx, {
    action: "adicionar taxas a orçamentos",
    mode: "populate",
    basePermission: "quotes.edit",
    inheritFrom: "quotes.create",
    record: { created_by: quote.created_by, status: quote.estado },
    mutableStatuses: QUOTE_MUTABLE_STATUSES,
  });
  if (perm) return perm;

  if (quote.estado !== "rascunho") {
    return { success: false, message: `Orçamento está em estado '${quote.estado}'. Só rascunhos aceitam alteração de taxas.` };
  }

  // Resolve fee_type — tem de ser da mesma org (paridade UI, sem globais).
  const { data: feeType } = await supabase
    .from("service_fee_types")
    .select("id, name, calculation_type, percentage, fixed_amount, application_mode, apply_vat, vat_rate, is_active, organization_id")
    .eq("id", args.fee_type_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!feeType) return { success: false, message: "Taxa não encontrada nesta organização." };
  if (!feeType.is_active) return { success: false, message: "Taxa está inactiva." };

  const ctxCalc = await loadFeeCalcContext(supabase, organizationId, args.quote_id);

  // Já adicionada?
  if (ctxCalc.currentFees.some((f) => f.fee_type_id === args.fee_type_id)) {
    return { success: false, message: "Esta taxa já está aplicada ao orçamento." };
  }

  // Construir nova selecção (todas as fees actuais + nova).
  const newSelection: FeeForCalc[] = [];
  const overrides: Record<string, number> = {};
  for (const cur of ctxCalc.currentFees) {
    const ft = ctxCalc.feeTypes.get(cur.fee_type_id);
    if (ft) {
      newSelection.push(ft);
      // VAT historicamente persistido pode diferir do current_config — preserva.
      if (typeof cur.vat_rate === "number") overrides[ft.id] = cur.vat_rate;
    }
  }
  newSelection.push(feeType as FeeForCalc);

  // Rejeitar 2.ª LINE_PERCENTAGE (regra UI + reforço; DB já tem unique parcial nos tipos activos).
  const linePctCount = newSelection.filter((f) => f.application_mode === "LINE_PERCENTAGE").length;
  if (linePctCount > 1) {
    return { success: false, message: "Já existe uma taxa LINE_PERCENTAGE no orçamento. Remove a anterior antes de adicionar outra." };
  }

  const res = await replaceQuoteFees(supabase, args.quote_id, newSelection, overrides, ctxCalc.feeLines);
  if (!res.success) return res;

  return {
    success: true,
    message: `Taxa "${feeType.name}" adicionada ao orçamento ${quote.quote_number ?? quote.id}.`,
    data: {
      quote_id: args.quote_id,
      added_fee_type_id: feeType.id,
      totals: res.totals,
      link: `/quotes?open=${args.quote_id}`,
    },
  };
};

export const removeQuoteFeeDef: ToolDef = {
  type: "function",
  function: {
    name: "remove_quote_fee",
    description:
      "Remove uma taxa de um orçamento em rascunho. O fee_id obtém-se via list_quote_fees (é o `fee_id`, NÃO o `fee_type_id`). Recalcula totais via cálculo canónico.",
    parameters: {
      type: "object",
      properties: {
        quote_id: { type: "string" },
        fee_id: { type: "string", description: "UUID da linha em quote_fees (via list_quote_fees → items[].fee_id)." },
      },
      required: ["quote_id", "fee_id"],
    },
  },
};

const removeQuoteFee: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };
  if (!args?.quote_id || !UUID_RE.test(String(args.quote_id))) {
    return { success: false, message: "quote_id inválido." };
  }
  if (!args?.fee_id || !UUID_RE.test(String(args.fee_id))) {
    return { success: false, message: "fee_id inválido — usa list_quote_fees." };
  }

  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select("id, estado, created_by, quote_number")
    .eq("id", args.quote_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (qErr) throw qErr;
  if (!quote) return { success: false, message: "Orçamento não encontrado ou fora de scope." };

  const perm = requireActionPermission(ctx, {
    action: "remover taxas de orçamentos",
    mode: "populate",
    basePermission: "quotes.edit",
    inheritFrom: "quotes.create",
    record: { created_by: quote.created_by, status: quote.estado },
    mutableStatuses: QUOTE_MUTABLE_STATUSES,
  });
  if (perm) return perm;

  if (quote.estado !== "rascunho") {
    return { success: false, message: `Orçamento está em estado '${quote.estado}'. Só rascunhos aceitam alteração de taxas.` };
  }

  const ctxCalc = await loadFeeCalcContext(supabase, organizationId, args.quote_id);
  const target = ctxCalc.currentFees.find((f) => f.id === args.fee_id);
  if (!target) {
    return { success: false, message: "Taxa não encontrada neste orçamento — usa list_quote_fees para obter o fee_id correcto." };
  }

  // Nova selecção: todas excepto a removida.
  const newSelection: FeeForCalc[] = [];
  const overrides: Record<string, number> = {};
  for (const cur of ctxCalc.currentFees) {
    if (cur.id === args.fee_id) continue;
    const ft = ctxCalc.feeTypes.get(cur.fee_type_id);
    if (ft) {
      newSelection.push(ft);
      if (typeof cur.vat_rate === "number") overrides[ft.id] = cur.vat_rate;
    }
  }

  const res = await replaceQuoteFees(supabase, args.quote_id, newSelection, overrides, ctxCalc.feeLines);
  if (!res.success) return res;

  return {
    success: true,
    message: `Taxa removida do orçamento ${quote.quote_number ?? quote.id}.`,
    data: {
      quote_id: args.quote_id,
      removed_fee_id: args.fee_id,
      totals: res.totals,
      link: `/quotes?open=${args.quote_id}`,
    },
  };
};

export const handlers: Record<string, Handler> = {
  create_quote: createQuote,
  list_quotes: listQuotes,
  send_quote: sendQuote,
  duplicate_quote: duplicateQuote,
  add_quote_items: addQuoteItems,
  set_quote_template: setQuoteTemplate,
  list_quote_templates: listQuoteTemplates,
  list_quote_models: listQuoteModels,
  set_quote_model: setQuoteModel,
  get_quote_details: getQuoteDetails,
  remove_quote_lines: removeQuoteLines,
  update_quote_line: updateQuoteLine,
  update_quote: updateQuote,
  delete_quote: deleteQuote,
  list_service_fees: listServiceFees,
  list_quote_fees: listQuoteFees,
  add_quote_fee: addQuoteFee,
  remove_quote_fee: removeQuoteFee,
};




