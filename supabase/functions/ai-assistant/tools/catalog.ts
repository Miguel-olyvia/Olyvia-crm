// Fase 4 — search_products
// Procura products/services/bundles na org actual, sem SQL raw e sem .or().
// Para cada kind: 2 queries (.ilike em name, .ilike em sku), união + dedupe por id em TS,
// ranking simples (starts-with > contains), corte para `limit`.

import type { ExecCtx, Handler, ToolDef, ToolResult } from "../shared/types.ts";
import { canAny } from "../shared/authz.ts";

type Kind = "product" | "service" | "bundle";

// Permissões de leitura do catálogo. A edge corre com service role (bypassa RLS),
// por isso o gate é aplicado aqui. Além da permissão de ver o catálogo (products.view
// — também usada pelo ecrã /bundles — e services.view), quem monta orçamentos,
// propostas, vendas directas ou encomendas de cliente precisa de pesquisar artigos
// no seletor desses ecrãs, por isso essas permissões de criação/edição também dão acesso.
const CATALOG_BUILDER_PERMISSIONS = [
  "quotes.create",
  "quotes.edit",
  "proposals.create",
  "proposals.edit",
  "direct_sales.create",
  "direct_sales.edit",
  "client_orders.create",
  "client_orders.edit",
] as const;

const KIND_VIEW_PERMISSIONS: Record<Kind, readonly string[]> = {
  product: ["products.view", ...CATALOG_BUILDER_PERMISSIONS],
  service: ["services.view", ...CATALOG_BUILDER_PERMISSIONS],
  bundle: ["products.view", ...CATALOG_BUILDER_PERMISSIONS],
};

function canReadKind(ctx: ExecCtx, kind: Kind): boolean {
  return canAny(ctx, KIND_VIEW_PERMISSIONS[kind]);
}

function catalogForbidden(kind: Kind | "all"): ToolResult {
  const primary = kind === "service" ? "services.view" : "products.view";
  return {
    success: false,
    code: "forbidden",
    missing_permission: primary,
    message: `Não tens permissão para ver o catálogo (falta: ${
      kind === "all" ? "products.view ou services.view" : primary
    }, ou permissão de criar orçamentos/propostas/vendas/encomendas).`,
  };
}
type Item = {
  kind: Kind;
  id: string;
  name: string;
  sku: string | null;
  fixed_price?: number | null;
};

export const searchProductsDef: ToolDef = {
  type: "function",
  function: {
    name: "search_products",
    description:
      "Procura products, services e bundles da organização actual por name ou sku. Mínimo 2 caracteres. Por defeito devolve só itens activos (sem drafts, descontinuados ou soft-deleted).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Texto de pesquisa (min 2 chars). Aplica-se a name e sku." },
        kind: { type: "string", enum: ["product", "service", "bundle", "all"], description: "Default 'all'." },
        limit: { type: "number", description: "Entre 1 e 25 (default 10)." },
        only_active: { type: "boolean", description: "Default true. Soft-delete continua a ser sempre escondido." },
      },
      required: ["query"],
    },
  },
};

function escapeIlike(q: string): string {
  return q.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function scoreItem(it: Item, qLower: string): number {
  const name = (it.name || "").toLowerCase();
  const sku = (it.sku || "").toLowerCase();
  if (name.startsWith(qLower) || sku.startsWith(qLower)) return 2;
  if (name.includes(qLower) || sku.includes(qLower)) return 1;
  return 0;
}

const search_products: Handler = async (ctx, args): Promise<ToolResult> => {
  const supabase = ctx.supabase;
  const orgId = ctx.organizationId;
  if (!orgId) return { success: false, message: "organização não definida no contexto" };

  const rawQuery = typeof args?.query === "string" ? args.query.trim() : "";
  if (rawQuery.length < 2) {
    return { success: false, message: "query precisa de ≥2 caracteres" };
  }

  const onlyActive = args?.only_active !== false; // default true
  const limit = Math.max(1, Math.min(25, Number(args?.limit) || 10));
  const kindArg: "product" | "service" | "bundle" | "all" =
    args?.kind && ["product", "service", "bundle", "all"].includes(args.kind) ? args.kind : "all";

  const requestedKinds: Kind[] =
    kindArg === "all" ? ["product", "service", "bundle"] : [kindArg as Kind];
  // Só pesquisa os kinds que o utilizador pode ver; sem nenhum → forbidden.
  const kinds = requestedKinds.filter((k) => canReadKind(ctx, k));
  if (kinds.length === 0) return catalogForbidden(kindArg);
  const skippedKinds = requestedKinds.filter((k) => !kinds.includes(k));

  const pattern = `%${escapeIlike(rawQuery)}%`;
  const PER_QUERY_LIMIT = 50;

  function baseProducts() {
    let q = supabase
      .from("products")
      .select("id, name, sku")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .eq("is_deleted", false);
    if (onlyActive) q = q.eq("is_active", true).eq("status", "active");
    return q.limit(PER_QUERY_LIMIT);
  }
  function baseServices() {
    let q = supabase
      .from("services")
      .select("id, name, sku")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .eq("is_deleted", false);
    if (onlyActive) q = q.eq("is_active", true);
    return q.limit(PER_QUERY_LIMIT);
  }
  function baseBundles() {
    let q = supabase
      .from("bundles")
      .select("id, name, sku, fixed_price")
      .eq("organization_id", orgId)
      .is("deleted_at", null);
    if (onlyActive) q = q.eq("is_active", true).eq("status", "active");
    return q.limit(PER_QUERY_LIMIT);
  }

  const tasks: Promise<{ kind: Kind; rows: any[] }>[] = [];

  if (kinds.includes("product")) {
    tasks.push(baseProducts().ilike("name", pattern).then((r: any) => ({ kind: "product" as Kind, rows: r.data || [] })));
    tasks.push(baseProducts().ilike("sku", pattern).then((r: any) => ({ kind: "product" as Kind, rows: r.data || [] })));
  }
  if (kinds.includes("service")) {
    tasks.push(baseServices().ilike("name", pattern).then((r: any) => ({ kind: "service" as Kind, rows: r.data || [] })));
    tasks.push(baseServices().ilike("sku", pattern).then((r: any) => ({ kind: "service" as Kind, rows: r.data || [] })));
  }
  if (kinds.includes("bundle")) {
    tasks.push(baseBundles().ilike("name", pattern).then((r: any) => ({ kind: "bundle" as Kind, rows: r.data || [] })));
    tasks.push(baseBundles().ilike("sku", pattern).then((r: any) => ({ kind: "bundle" as Kind, rows: r.data || [] })));
  }

  const results = await Promise.all(tasks);

  const byId = new Map<string, Item>();
  for (const { kind, rows } of results) {
    for (const r of rows) {
      if (!r?.id || byId.has(r.id)) continue;
      const item: Item = {
        kind,
        id: r.id,
        name: r.name,
        sku: r.sku ?? null,
      };
      if (kind === "bundle") item.fixed_price = r.fixed_price ?? null;
      byId.set(r.id, item);
    }
  }

  const qLower = rawQuery.toLowerCase();
  const items = Array.from(byId.values())
    .map((it) => ({ it, score: scoreItem(it, qLower) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.it.name || "").localeCompare(b.it.name || "");
    })
    .slice(0, limit)
    .map((x) => x.it);

  const counts = { product: 0, service: 0, bundle: 0 };
  for (const it of items) counts[it.kind] += 1;

  return {
    success: true,
    ...(skippedKinds.length > 0 ? { message: `Sem permissão para pesquisar: ${skippedKinds.join(", ")}.` } : {}),
    data: {
      items,
      counts,
      query: rawQuery,
      ...(skippedKinds.length > 0 ? { kinds_skipped_forbidden: skippedKinds } : {}),
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Fase 4.E — browse sem query (list_products / list_services / list_bundles)
// ─────────────────────────────────────────────────────────────────────────────

function makeListDef(name: string, label: string, withCategory: boolean): ToolDef {
  const props: Record<string, any> = {
    is_active: { type: "boolean", description: "Default true." },
    limit: { type: "number", description: "1..50 (default 25)." },
  };
  if (withCategory) {
    props.category_id = { type: "string", description: "UUID de categoria; opcional." };
  }
  return {
    type: "function",
    function: {
      name,
      description: `Lista ${label} da organização actual (sem termo de pesquisa). Exclui drafts e soft-deleted. Use para 'que ${label} tenho' / 'mostra o catálogo'. Para procurar por nome ou SKU use search_products.`,
      parameters: { type: "object", properties: props, required: [] },
    },
  };
}

export const listProductsDef = makeListDef("list_products", "produtos", true);
export const listServicesDef = makeListDef("list_services", "serviços", true);
export const listBundlesDef = makeListDef("list_bundles", "bundles", false);

function clampListLimit(n: any): number {
  return Math.max(1, Math.min(50, Number(n) || 25));
}

const list_products: Handler = async (ctx, args): Promise<ToolResult> => {
  const orgId = ctx.organizationId;
  if (!orgId) return { success: false, message: "Organização não definida." };
  if (!canReadKind(ctx, "product")) return catalogForbidden("product");
  const onlyActive = args?.is_active !== false;
  const limit = clampListLimit(args?.limit);
  let q = ctx.supabase
    .from("products")
    .select("id, name, sku, is_active, status, category_id")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .eq("is_deleted", false)
    .order("name", { ascending: true })
    .limit(limit);
  if (onlyActive) q = q.eq("is_active", true).eq("status", "active");
  if (args?.category_id) q = q.eq("category_id", args.category_id);
  const { data, error } = await q;
  if (error) throw error;
  return { success: true, message: `${data?.length ?? 0} produto(s).`, data: data ?? [] };
};

const list_services: Handler = async (ctx, args): Promise<ToolResult> => {
  const orgId = ctx.organizationId;
  if (!orgId) return { success: false, message: "Organização não definida." };
  if (!canReadKind(ctx, "service")) return catalogForbidden("service");
  const onlyActive = args?.is_active !== false;
  const limit = clampListLimit(args?.limit);
  let q = ctx.supabase
    .from("services")
    .select("id, name, sku, is_active, category_id")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .eq("is_deleted", false)
    .order("name", { ascending: true })
    .limit(limit);
  if (onlyActive) q = q.eq("is_active", true);
  if (args?.category_id) q = q.eq("category_id", args.category_id);
  const { data, error } = await q;
  if (error) throw error;
  return { success: true, message: `${data?.length ?? 0} serviço(s).`, data: data ?? [] };
};

const list_bundles: Handler = async (ctx, args): Promise<ToolResult> => {
  const orgId = ctx.organizationId;
  if (!orgId) return { success: false, message: "Organização não definida." };
  if (!canReadKind(ctx, "bundle")) return catalogForbidden("bundle");
  const onlyActive = args?.is_active !== false;
  const limit = clampListLimit(args?.limit);
  let q = ctx.supabase
    .from("bundles")
    .select("id, name, sku, fixed_price, is_active, status")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(limit);
  if (onlyActive) q = q.eq("is_active", true).eq("status", "active");
  const { data, error } = await q;
  if (error) throw error;
  return { success: true, message: `${data?.length ?? 0} bundle(s).`, data: data ?? [] };
};

export const handlers: Record<string, Handler> = {
  search_products,
  list_products,
  list_services,
  list_bundles,
};
