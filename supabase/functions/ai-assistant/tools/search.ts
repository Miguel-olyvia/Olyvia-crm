// Fase 4.E — search_entities (pesquisa global cross-kind)
// Devolve uma mistura de leads/contacts/clients/deals/quotes/proposals/contracts
// num único payload, evitando ter de chamar 7 tools distintas.
// Read-only; RLS controla visibilidade. Org-scoping via <table>.organization_id directo.

import type { Handler, ToolDef, ToolResult } from "../shared/types.ts";

type Kind = "lead" | "contact" | "client" | "deal" | "quote" | "proposal" | "contract";

const ALL_KINDS: Kind[] = ["lead", "contact", "client", "deal", "quote", "proposal", "contract"];

type Item = {
  kind: Kind;
  id: string;
  label: string;
  secondary?: string | null;
  link: string;
};

export const searchEntitiesDef: ToolDef = {
  type: "function",
  function: {
    name: "search_entities",
    description:
      "Pesquisa global numa organização: devolve leads, contactos, clientes, PPs (deals), orçamentos, propostas e contratos que combinem com `query` (nome, título ou número canónico tipo Q-/P-/C-). Mínimo 2 caracteres. Use isto quando o utilizador disser 'abre/encontra/onde está X' sem indicar o tipo exacto. Para listar sem termo de pesquisa, usar as tools list_* dedicadas.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Texto de pesquisa (min 2 chars)." },
        kinds: {
          type: "array",
          items: { type: "string", enum: ALL_KINDS as unknown as string[] },
          description: "Subset de kinds a pesquisar. Default: todos.",
        },
        limit: { type: "number", description: "1..25 por kind (default 10)." },
      },
      required: ["query"],
    },
  },
};

function escapeIlike(q: string): string {
  return q.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function scoreLabel(label: string, qLower: string): number {
  const l = (label || "").toLowerCase();
  if (l === qLower) return 3;
  if (l.startsWith(qLower)) return 2;
  if (l.includes(qLower)) return 1;
  return 0;
}

const search_entities: Handler = async (ctx, args): Promise<ToolResult> => {
  const { supabase, organizationId } = ctx;
  if (!organizationId) return { success: false, message: "Organização não definida." };

  const rawQuery = typeof args?.query === "string" ? args.query.trim() : "";
  if (rawQuery.length < 2) {
    return { success: false, message: "query precisa de ≥2 caracteres." };
  }

  const limit = Math.max(1, Math.min(25, Number(args?.limit) || 10));

  let kinds: Kind[] = ALL_KINDS;
  if (Array.isArray(args?.kinds) && args.kinds.length > 0) {
    const requested = (args.kinds as string[]).filter((k) => (ALL_KINDS as string[]).includes(k));
    if (requested.length > 0) kinds = requested as Kind[];
  }

  const pattern = `%${escapeIlike(rawQuery)}%`;
  const PER = limit;

  const tasks: Promise<Item[]>[] = [];

  if (kinds.includes("lead")) {
    tasks.push(
      supabase
        .from("anew_leads")
        .select("id, status, anew_entities!inner(display_name)")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .ilike("anew_entities.display_name", pattern)
        .limit(PER)
        .then((r: any) =>
          (r.data ?? []).map((row: any): Item => ({
            kind: "lead",
            id: row.id,
            label: row.anew_entities?.display_name ?? "(sem nome)",
            secondary: row.status ?? null,
            link: `/leads?open=${row.id}`,
          })),
        ),
    );
  }

  if (kinds.includes("contact")) {
    tasks.push(
      supabase
        .from("anew_contacts")
        .select("id, position, anew_entities!inner(display_name)")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .ilike("anew_entities.display_name", pattern)
        .limit(PER)
        .then((r: any) =>
          (r.data ?? []).map((row: any): Item => ({
            kind: "contact",
            id: row.id,
            label: row.anew_entities?.display_name ?? "(sem nome)",
            secondary: row.position ?? null,
            link: `/contacts?open=${row.id}`,
          })),
        ),
    );
  }

  if (kinds.includes("client")) {
    tasks.push(
      supabase
        .from("anew_clients")
        .select("id, anew_entities!inner(display_name)")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .ilike("anew_entities.display_name", pattern)
        .limit(PER)
        .then((r: any) =>
          (r.data ?? []).map((row: any): Item => ({
            kind: "client",
            id: row.id,
            label: row.anew_entities?.display_name ?? "(sem nome)",
            secondary: null,
            link: `/clients?open=${row.id}`,
          })),
        ),
    );
  }

  if (kinds.includes("deal")) {
    tasks.push(
      supabase
        .from("deals")
        .select("id, title, value")
        .eq("organization_id", organizationId)
        .ilike("title", pattern)
        .limit(PER)
        .then((r: any) =>
          (r.data ?? []).map((row: any): Item => ({
            kind: "deal",
            id: row.id,
            label: row.title ?? "(sem título)",
            secondary: row.value != null ? `${row.value} €` : null,
            link: `/deals?open=${row.id}`,
          })),
        ),
    );
  }

  if (kinds.includes("quote")) {
    // Quotes: title OU quote_number. Duas queries paralelas, dedupe por id.
    const quoteSel = "id, quote_number, title, estado";
    tasks.push(
      Promise.all([
        supabase.from("quotes").select(quoteSel).eq("organization_id", organizationId).ilike("title", pattern).limit(PER),
        supabase.from("quotes").select(quoteSel).eq("organization_id", organizationId).ilike("quote_number", pattern).limit(PER),
      ]).then(([a, b]: any[]) => {
        const seen = new Set<string>();
        const out: Item[] = [];
        for (const row of [...((a.data ?? []) as any[]), ...((b.data ?? []) as any[])]) {
          if (!row?.id || seen.has(row.id)) continue;
          seen.add(row.id);
          out.push({
            kind: "quote",
            id: row.id,
            label: row.quote_number || row.title || "(sem número)",
            secondary: row.title && row.quote_number ? row.title : row.estado ?? null,
            link: `/quotes?open=${row.id}`,
          });
        }
        return out;
      }),
    );
  }

  if (kinds.includes("proposal")) {
    const propSel = "id, proposal_number, title, status";
    tasks.push(
      Promise.all([
        supabase.from("proposals").select(propSel).eq("organization_id", organizationId).ilike("title", pattern).limit(PER),
        supabase.from("proposals").select(propSel).eq("organization_id", organizationId).ilike("proposal_number", pattern).limit(PER),
      ]).then(([a, b]: any[]) => {
        const seen = new Set<string>();
        const out: Item[] = [];
        for (const row of [...((a.data ?? []) as any[]), ...((b.data ?? []) as any[])]) {
          if (!row?.id || seen.has(row.id)) continue;
          seen.add(row.id);
          out.push({
            kind: "proposal",
            id: row.id,
            label: row.proposal_number || row.title || "(sem número)",
            secondary: row.title && row.proposal_number ? row.title : row.status ?? null,
            link: `/proposals?open=${row.id}`,
          });
        }
        return out;
      }),
    );
  }

  if (kinds.includes("contract")) {
    tasks.push(
      supabase
        .from("client_contracts")
        .select("id, contract_number, status")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .ilike("contract_number", pattern)
        .limit(PER)
        .then((r: any) =>
          (r.data ?? []).map((row: any): Item => ({
            kind: "contract",
            id: row.id,
            label: row.contract_number ?? row.id,
            secondary: row.status ?? null,
            link: `/contracts?open=${row.id}`,
          })),
        ),
    );
  }

  const groups = await Promise.all(tasks);
  const qLower = rawQuery.toLowerCase();

  const items: Item[] = ([] as Item[])
    .concat(...groups)
    .map((it) => ({ it, score: scoreLabel(it.label, qLower) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.it.label || "").localeCompare(b.it.label || "");
    })
    .map((x) => x.it);

  const counts: Record<Kind, number> = {
    lead: 0, contact: 0, client: 0, deal: 0, quote: 0, proposal: 0, contract: 0,
  };
  for (const it of items) counts[it.kind] += 1;

  return {
    success: true,
    message: `${items.length} resultado(s) para "${rawQuery}".`,
    data: { items, counts, query: rawQuery, kinds_searched: kinds },
  };
};

export const handlers: Record<string, Handler> = {
  search_entities,
};
