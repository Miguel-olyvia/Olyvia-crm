import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { searchEntityIdsByNif } from "@/lib/clientSearch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Search, Building, Crosshair, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissionScope } from "@/hooks/usePermissionScope";
import { getContactScopeUserIds, buildContactScopeOrFilter } from "@/lib/contacts/scope";
import { getLeadScopeUserIds } from "@/pages/anewLeadsHelpers";
import { useTranslation } from "@/hooks/useTranslation";

export interface EntitySearchResult {
  type: "lead" | "client";
  id: string;
  name: string;
  email?: string;
  phone?: string;
  entityId?: string;
  status?: string;
}

interface EntitySearchInputProps {
  value: EntitySearchResult | null;
  onChange: (entity: EntitySearchResult | null) => void;
  error?: string;
  /** Which entity types to search. Default: all */
  searchTypes?: ("lead" | "client")[];
  placeholder?: string;
  disabled?: boolean;
}

const typeConfig = {
  lead: { label: "Lead", icon: Crosshair, color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  client: { label: "Cliente", icon: Building, color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" },
};

const getTypeConfig = (type: string) => typeConfig[type as keyof typeof typeConfig] || typeConfig.lead;

export function EntitySearchInput({
  value,
  onChange,
  error,
  searchTypes = ["lead", "client"],
  placeholder,
  disabled = false,
}: EntitySearchInputProps) {
  const { t } = useTranslation();
  const { activeCompany } = useCompany();
  const {
    getPermissionScope,
    anewUserId: scopeAnewUserId,
    authUserId: scopeAuthUserId,
    teamMemberIds,
    loading: scopeLoading,
  } = usePermissionScope();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EntitySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  // Monotonically increasing id for the in-flight search request. `search()`
  // does several sequential/parallel network round-trips, so overlapping
  // calls (fired by fast re-typing before an older call has resolved) are
  // expected. Without this guard, whichever call happens to resolve LAST
  // wins the final setResults/setOpen/setLoading — even if it's for a term
  // the user already changed away from — which is exactly what produced the
  // "spinner never clears" / "results never render" symptom: a slow, stale
  // response clobbering (or redundantly re-triggering) state after a newer,
  // faster response already rendered correctly.
  const latestRequestIdRef = useRef(0);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = useCallback(
    async (term: string) => {
      // Claim this call as the latest. Any earlier call that resolves after
      // this point will see its own id no longer match and must not touch
      // state (see guards below and in the finally block).
      const requestId = ++latestRequestIdRef.current;

      if (term.length < 2) {
        setResults([]);
        setOpen(false);
        setLoading(false);
        return;
      }

      if (scopeLoading) {
        // Permission scope hasn't resolved yet. Fail closed instead of
        // risking a query that skips the OWNED/TEAM restriction below.
        setResults([]);
        setOpen(true);
        return;
      }

      setLoading(true);
      const searchLower = term.toLowerCase();
      const allResults: EntitySearchResult[] = [];

      try {
        const { data: { user } } = await supabase.auth.getUser();
        const orgId = activeCompany?.id;

        // SECURITY: these must mirror the exact same leads.view / clients.view
        // scope (ORG/TEAM/OWNED) that AnewLeads.tsx and AnewClients.tsx apply
        // to their main lists — never a bespoke admin-only check. Otherwise a
        // scope-restricted viewer could use this search box to discover
        // records (name/email/phone, and financial data downstream) that
        // don't appear in their own Leads/Clients list.
        const leadsScope = getPermissionScope("leads.view");
        const clientsScope = getPermissionScope("clients.view");
        const leadScopeUserIds = getLeadScopeUserIds(
          scopeAnewUserId,
          scopeAuthUserId,
          leadsScope === "TEAM" ? teamMemberIds : [],
        );
        const clientScopeUserIds = getContactScopeUserIds(
          clientsScope,
          scopeAnewUserId,
          scopeAuthUserId,
          teamMemberIds,
        );

        // Clients: scoped strictly to the active organization and active
        // status, via the optimized RPC (name/email/phone match server-side).
        // Fallback to a direct query only when the RPC fails or for the "lead"
        // type in isolation (leads aren't covered by this RPC).
        const rpcEntityTypes = searchTypes.filter((type) => type === "client");
        let rpcCoveredTypes: ("client")[] = [];

        // NIF matching runs in parallel with the RPC, via the search-entities
        // Edge Function, which never exposes plaintext NIF/hash to the client
        // (unlike the legacy `pf.nif ILIKE` branch still present inside the
        // search_proposal_entities RPC itself for name/email/phone/nif combined).
        const [rpcOutcome, nifEntityIds] = await Promise.all([
          rpcEntityTypes.length > 0 && orgId
            ? (supabase as any).rpc("search_proposal_entities", {
                p_search: term,
                p_limit: 50,
                p_organization_id: orgId,
              })
            : Promise.resolve({ data: null, error: null }),
          searchEntityIdsByNif(term, 100),
        ]);
        const nifMatchedEntityIds = new Set<string>(nifEntityIds);

        if (rpcEntityTypes.length > 0 && orgId && clientsScope !== "NONE") {
          const { data: scopedResults, error: scopedError } = rpcOutcome;
          if (scopedError) {
            console.error("Entity scoped search error, falling back to direct query:", scopedError);
          } else {
            rpcCoveredTypes = rpcEntityTypes as ("client")[];
            const candidateRows = (scopedResults || []).filter((row: any) => rpcEntityTypes.includes(row.type));

            // SECURITY: search_proposal_entities (the RPC above) only enforces
            // ORG-level visibility (get_user_visible_org_ids) — it has no
            // notion of the clients.view permission scope. Re-check every
            // candidate row against the same OWNED/TEAM restriction
            // AnewClients.tsx applies via buildContactScopeOrFilter before
            // surfacing it here.
            let allowedClientIds: Set<string> | null = null;
            if (clientsScope !== "ORG" && candidateRows.length > 0) {
              const orFilter = buildContactScopeOrFilter(clientsScope, clientScopeUserIds);
              if (!orFilter) {
                allowedClientIds = new Set();
              } else {
                const { data: scopedClients } = await (supabase as any)
                  .from("anew_clients")
                  .select("id")
                  .in("id", candidateRows.map((r: any) => r.id))
                  .or(orFilter);
                allowedClientIds = new Set((scopedClients || []).map((c: any) => c.id));
              }
            }

            candidateRows.forEach((row: any) => {
              if (allowedClientIds && !allowedClientIds.has(row.id)) return;
              allResults.push({
                type: row.type,
                id: row.id,
                name: row.name || `${getTypeConfig(row.type).label} #${String(row.id).slice(0, 8)}`,
                email: row.email || undefined,
                phone: row.phone || undefined,
                entityId: row.entity_id || undefined,
                status: row.status || undefined,
              });
            });
          }
        }

        // Leads still need entity-id matching across the visible org scope.
        const needsLeads = searchTypes.includes("lead");
        // Fallback for clients (only used when RPC failed) must also match by entity id.
        // Also re-run when the RPC succeeded but a NIF match exists: an entity found
        // only via NIF (not by name/email/phone) must still surface even though the
        // RPC already covers that type — union NIF matches with the RPC results.
        const needsClientFallback =
          searchTypes.includes("client") && (!rpcCoveredTypes.includes("client") || nifMatchedEntityIds.size > 0);
        let matchedEntityIds: string[] = [];
        let orgIds: string[] = orgId ? [orgId] : [];
        if (needsLeads || needsClientFallback) {
          if (needsLeads && user?.id) {
            const { data: visibleOrgIds } = await (supabase as any).rpc("get_user_visible_org_ids", { _auth_uid: user.id });
            orgIds = Array.from(new Set([...(orgIds || []), ...((visibleOrgIds || []) as string[])]));
          }
          const like = `%${term.trim()}%`;
          const [nameMatches, emailMatches, phoneMatches] = await Promise.all([
            supabase
              .from("anew_entities")
              .select("id")
              .or(`display_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`)
              .limit(100),
            supabase.from("anew_entity_emails").select("entity_id").ilike("email", like).limit(100),
            supabase.from("anew_entity_phones").select("entity_id").ilike("phone_number", like).limit(100),
          ]);
          matchedEntityIds = Array.from(new Set([
            ...(nameMatches.data || []).map((r: any) => r.id),
            ...(emailMatches.data || []).map((r: any) => r.entity_id),
            ...(phoneMatches.data || []).map((r: any) => r.entity_id),
            ...nifEntityIds,
          ].filter(Boolean))) as string[];
        }

        // Helper: process rows of leads/clients and collect matching results.
        const collectFromRows = async (
          rows: any[] | null | undefined,
          type: "lead" | "client",
          idLabel: string,
        ) => {
          if (!rows?.length) return;
          const eIds = Array.from(new Set(rows.map((r) => r.entity_id).filter(Boolean))) as string[];
          if (!eIds.length) return;
          const [ents, emails, phones] = await Promise.all([
            supabase.from("anew_entities").select("id, display_name, first_name, last_name").in("id", eIds),
            supabase.from("anew_entity_emails").select("entity_id, email").in("entity_id", eIds).eq("is_primary", true),
            supabase.from("anew_entity_phones").select("entity_id, phone_number").in("entity_id", eIds).eq("is_primary", true),
          ]);
          const nm = new Map((ents.data || []).map((e: any) => [
            e.id,
            e.display_name || [e.first_name, e.last_name].filter(Boolean).join(" ").trim() || null,
          ]));
          const em = new Map((emails.data || []).map((e: any) => [e.entity_id, e.email]));
          const ph = new Map((phones.data || []).map((p: any) => [p.entity_id, p.phone_number]));

          rows.forEach((row: any) => {
            const name = (row.entity_id ? nm.get(row.entity_id) : null) || `${idLabel} #${row.id.slice(0, 8)}`;
            const email = row.entity_id ? em.get(row.entity_id) : undefined;
            const phone = row.entity_id ? ph.get(row.entity_id) : undefined;
            // NIF matches are already confirmed server-side (search-entities);
            // they don't need to also match name/email/phone substrings.
            const matchedByNif = Boolean(row.entity_id && nifMatchedEntityIds.has(row.entity_id));
            if (
              matchedByNif ||
              (name && name.toLowerCase().includes(searchLower)) ||
              (email && email.toLowerCase().includes(searchLower)) ||
              (phone && phone.includes(searchLower))
            ) {
              allResults.push({
                type,
                id: row.id,
                name: name || `${idLabel} #${row.id.slice(0, 8)}`,
                email: email || undefined,
                phone: phone || undefined,
                entityId: row.entity_id || undefined,
                status: row.status || undefined,
              });
            }
          });
        };

        // ── Search Leads ──
        if (searchTypes.includes("lead") && matchedEntityIds.length > 0 && leadsScope !== "NONE") {
          let q = (supabase.from("anew_leads") as any).select("id, entity_id, assigned_to, status").in("entity_id", matchedEntityIds).is("deleted_at", null).limit(50);
          if (orgIds.length > 0) q = q.in("organization_id", orgIds);
          if (leadsScope !== "ORG") {
            if (leadScopeUserIds.length === 0) {
              // No resolvable owner ids for a non-ORG scope: fail closed
              // instead of returning unscoped results.
              q = q.eq("id", "00000000-0000-0000-0000-000000000000");
            } else {
              q = q.or(`assigned_to.in.(${leadScopeUserIds.join(",")}),created_by.in.(${leadScopeUserIds.join(",")})`);
            }
          }
          q = q.not("status", "eq", "converted");
          const { data: leads } = await q;
          await collectFromRows(leads, "lead", "Lead");
        }

        // ── Search Clients (fallback when RPC failed, or to union NIF-only matches) ──
        if (
          searchTypes.includes("client") &&
          (!rpcCoveredTypes.includes("client") || nifMatchedEntityIds.size > 0) &&
          matchedEntityIds.length > 0 &&
          orgId &&
          clientsScope !== "NONE"
        ) {
          let clientsQuery = (supabase as any)
            .from("anew_clients")
            .select("id, entity_id, status")
            .in("entity_id", matchedEntityIds)
            .is("deleted_at", null)
            .eq("status", "active")
            .eq("organization_id", orgId)
            .limit(50);
          if (clientsScope !== "ORG") {
            const orFilter = buildContactScopeOrFilter(clientsScope, clientScopeUserIds);
            if (!orFilter) {
              // No resolvable owner ids for a non-ORG scope: fail closed.
              clientsQuery = clientsQuery.eq("id", "00000000-0000-0000-0000-000000000000");
            } else {
              clientsQuery = clientsQuery.or(orFilter);
            }
          }
          const { data: clients } = await clientsQuery;
          await collectFromRows(clients, "client", "Cliente");
        }

        // Dedupe by type+id (RPC + fallback could overlap in rare cases)
        const seen = new Set<string>();
        const deduped = allResults.filter(r => {
          const key = `${r.type}-${r.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        // Stale guard: a newer search() call may have already started (and
        // possibly already resolved) while this one was awaiting its
        // network round-trips. Only the latest call is allowed to write
        // results/open state — otherwise a slow, superseded response for an
        // old search term could overwrite the correct, already-rendered
        // results for the current term.
        if (requestId !== latestRequestIdRef.current) return;
        setResults(deduped.slice(0, 50));
        setOpen(true);

      } catch (err) {
        if (requestId !== latestRequestIdRef.current) return;
        console.error("Entity search error:", err);
        setOpen(true);
      } finally {
        // Only the latest call may clear (or set) the loading flag. If this
        // call is stale, a newer call either already cleared it after
        // rendering its own results, or is still in flight and owns the
        // flag — either way this stale call must not touch it, which is
        // what previously allowed the spinner to get stuck or clear at the
        // wrong time depending on resolution order.
        if (requestId === latestRequestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [
      activeCompany?.id,
      searchTypes,
      scopeLoading,
      getPermissionScope,
      scopeAnewUserId,
      scopeAuthUserId,
      teamMemberIds,
    ]
  );

  const handleInputChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  const handleSelect = (entity: EntitySearchResult) => {
    onChange(entity);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setQuery("");
    setResults([]);
  };

  // Group results by type
  const grouped = searchTypes.reduce<Record<string, EntitySearchResult[]>>((acc, type) => {
    const items = results.filter((r) => r.type === type);
    if (items.length) acc[type] = items;
    return acc;
  }, {});

  if (value) {
    const cfg = getTypeConfig(value.type);
    const Icon = cfg.icon;
    return (
      <div className={cn("flex items-center gap-2 p-3 border rounded-lg bg-muted/20 transition-colors", error && "border-destructive")}>
        <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium shrink-0", cfg.color)}>
          <Icon className="h-3 w-3" />
          {cfg.label}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{value.name}</p>
          {(value.email || value.phone) && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {value.email && <span className="truncate">{value.email}</span>}
              {value.phone && <span className="shrink-0">{value.phone}</span>}
            </div>
          )}
        </div>
        {!disabled && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleClear}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
        <Input
          ref={inputRef}
          placeholder={placeholder || t("deals.form.searchEntityPlaceholder") || "Pesquisar lead ou cliente..."}
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          className={cn("pl-9 pr-9", error && "border-destructive")}
          disabled={disabled}
        />
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-xl z-50 animate-in fade-in-0 zoom-in-95 duration-150">
          <div className="max-h-[320px] overflow-y-auto">
            {Object.entries(grouped).map(([type, items]) => {
              const cfg = getTypeConfig(type);
              const Icon = cfg.icon;
              return (
                <div key={type}>
                  <div className="px-3 py-1.5 bg-muted/40 flex items-center gap-2 sticky top-0">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {cfg.label}s ({items.length})
                    </span>
                  </div>
                  {items.map((item) => (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      className="w-full px-3 py-2.5 text-left hover:bg-accent/50 flex items-center gap-3 transition-colors"
                      onClick={() => handleSelect(item)}
                    >
                      <div className={cn("flex items-center justify-center h-8 w-8 rounded-full shrink-0", cfg.color)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {item.email && <span className="truncate">{item.email}</span>}
                          {item.phone && <span className="shrink-0">· {item.phone}</span>}
                        </div>
                      </div>
                      {item.status && (
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {item.status}
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
            {results.length === 0 && query.length >= 2 && !loading && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {t("common.noResults") || "Sem resultados"}
              </div>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
      <p className="text-xs text-muted-foreground mt-1">
        {t("deals.form.searchEntityHint") || "Digite pelo menos 2 caracteres para pesquisar em leads e clientes"}
      </p>
    </div>
  );
}
