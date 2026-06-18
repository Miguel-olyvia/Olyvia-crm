import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Search, User, Building, Crosshair, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";

export interface EntitySearchResult {
  type: "lead" | "client" | "contact";
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
  searchTypes?: ("lead" | "client" | "contact")[];
  placeholder?: string;
  disabled?: boolean;
}

const typeConfig = {
  lead: { label: "Lead", icon: Crosshair, color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  client: { label: "Cliente", icon: Building, color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" },
  contact: { label: "Contacto", icon: User, color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
};

export function EntitySearchInput({
  value,
  onChange,
  error,
  searchTypes = ["lead", "client", "contact"],
  placeholder,
  disabled = false,
}: EntitySearchInputProps) {
  const { t } = useTranslation();
  const { activeCompany } = useCompany();
  const { isSystemAdmin } = usePermissions();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EntitySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

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
      if (term.length < 2) {
        setResults([]);
        setOpen(false);
        return;
      }

      setLoading(true);
      const searchLower = term.toLowerCase();
      const allResults: EntitySearchResult[] = [];

      try {
        const { data: { user } } = await supabase.auth.getUser();
        const isAdmin = isSystemAdmin;
        const orgId = activeCompany?.id;

        // Contacts/clients: scoped strictly to the active organization and active status.
        const rpcEntityTypes = searchTypes.filter((type) => type === "contact" || type === "client");
        let rpcCoveredTypes: ("contact" | "client")[] = [];
        if (rpcEntityTypes.length > 0 && orgId) {
          const { data: scopedResults, error: scopedError } = await (supabase as any).rpc("search_proposal_entities", {
            p_search: term,
            p_limit: 50,
            p_organization_id: orgId,
          });
          if (scopedError) {
            console.error("Entity scoped search error, falling back to direct query:", scopedError);
          } else {
            rpcCoveredTypes = rpcEntityTypes as ("contact" | "client")[];
            (scopedResults || []).forEach((row: any) => {
              if (!rpcEntityTypes.includes(row.type)) return;
              allResults.push({
                type: row.type,
                id: row.id,
                name: row.name || `${typeConfig[row.type as keyof typeof typeConfig]?.label || "Contacto"} #${String(row.id).slice(0, 8)}`,
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
        // Fallback for clients/contacts (only used when RPC failed) must also match by entity id.
        const needsContactClientFallback =
          (searchTypes.includes("client") && !rpcCoveredTypes.includes("client")) ||
          (searchTypes.includes("contact") && !rpcCoveredTypes.includes("contact"));
        let matchedEntityIds: string[] = [];
        let orgIds: string[] = orgId ? [orgId] : [];
        if (needsLeads || needsContactClientFallback) {
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
          ].filter(Boolean))) as string[];
        }

        // Helper: process rows of leads/clients/contacts and collect matching results.
        const collectFromRows = async (
          rows: any[] | null | undefined,
          type: "lead" | "client" | "contact",
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
            if (
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
        if (searchTypes.includes("lead") && matchedEntityIds.length > 0) {
          // Resolve auth UUID to anew_users.id for assigned_to filter
          let anewUserId: string | null = null;
          if (!isAdmin && user?.id) {
            const { data: anewUser } = await supabase.from("anew_users").select("id").eq("auth_user_id", user.id).maybeSingle();
            anewUserId = anewUser?.id || null;
          }
          let q = (supabase.from("anew_leads") as any).select("id, entity_id, assigned_to, status").in("entity_id", matchedEntityIds).is("deleted_at", null).limit(50);
          if (orgIds.length > 0) q = q.in("organization_id", orgIds);
          if (!isAdmin && anewUserId) q = q.eq("assigned_to", anewUserId);
          q = q.not("status", "eq", "converted");
          const { data: leads } = await q;
          await collectFromRows(leads, "lead", "Lead");
        }

        // ── Fallback Search Clients (only when RPC failed) ──
        if (searchTypes.includes("client") && !rpcCoveredTypes.includes("client") && matchedEntityIds.length > 0 && orgId) {
          const { data: clients } = await (supabase as any)
            .from("anew_clients")
            .select("id, entity_id, status")
            .in("entity_id", matchedEntityIds)
            .is("deleted_at", null)
            .eq("status", "active")
            .eq("organization_id", orgId)
            .limit(50);
          await collectFromRows(clients, "client", "Cliente");
        }

        // ── Fallback Search Contacts (only when RPC failed) ──
        if (searchTypes.includes("contact") && !rpcCoveredTypes.includes("contact") && matchedEntityIds.length > 0 && orgId) {
          const { data: contacts } = await (supabase as any)
            .from("anew_contacts")
            .select("id, entity_id, status")
            .in("entity_id", matchedEntityIds)
            .is("deleted_at", null)
            .is("converted_to_client_id", null)
            .eq("status", "active")
            .eq("organization_id", orgId)
            .limit(50);
          await collectFromRows(contacts, "contact", "Contacto");
        }

        // Dedupe by type+id (RPC + fallback could overlap in rare cases)
        const seen = new Set<string>();
        const deduped = allResults.filter(r => {
          const key = `${r.type}-${r.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setResults(deduped.slice(0, 50));
        setOpen(true);

      } catch (err) {
        console.error("Entity search error:", err);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    },
    [activeCompany?.id, isSystemAdmin, searchTypes]
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
    const cfg = typeConfig[value.type];
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
          placeholder={placeholder || t("deals.form.searchEntityPlaceholder") || "Pesquisar lead, cliente ou contacto..."}
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
              const cfg = typeConfig[type as keyof typeof typeConfig];
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
        {t("deals.form.searchEntityHint") || "Digite pelo menos 2 caracteres para pesquisar em leads, clientes e contactos"}
      </p>
    </div>
  );
}
