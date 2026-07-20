import { useEffect, useState, useCallback } from "react";
import { Trash2, RotateCcw, User, Briefcase, AlertTriangle, ArrowLeft, Handshake, FileText, FileSignature, FileCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { usePermissionScope } from "@/hooks/usePermissionScope";
import { usePermissions } from "@/hooks/usePermissions";
import { getContactScopeUserIds, buildContactScopeOrFilter } from "@/lib/contacts/scope";
import { getLeadScopeUserIds } from "@/pages/anewLeadsHelpers";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

type Kind = "clients" | "leads" | "deals" | "quotes" | "proposals" | "contracts";

type Row = {
  id: string;
  entity_id: string | null;
  display_name: string;
  subtitle?: string | null;
  deleted_at: string | null;
  deleted_by_name: string | null;
  created_at: string;
};

const ENTITY_KINDS: Record<"clients" | "leads", "client" | "lead"> = {
  clients: "client", leads: "lead",
};
const BUSINESS_KINDS: Record<"deals" | "quotes" | "proposals" | "contracts", "deal" | "quote" | "proposal" | "contract"> = {
  deals: "deal", quotes: "quote", proposals: "proposal", contracts: "contract",
};
const isBusiness = (k: Kind): k is keyof typeof BUSINESS_KINDS => k in BUSINESS_KINDS;

// Permission required to actually purge (RPC-level, "Sem permissao" check) per
// tab, confirmed against the live purge_business_entity / purge_entity_facet
// function bodies (supabase/migrations/20260818010000_fix_anon_exposed_destructive_functions_record.sql,
// unchanged by later migrations). Each RPC checks a single fixed permission
// code regardless of p_kind — not a per-entity-type code:
//   purge_business_entity (deal/quote/proposal/contract) -> 'deals.delete'
//   purge_entity_facet (lead/contact/client)              -> 'organizations.delete'
// This must stay in lockstep with those RPCs; if they ever add per-kind
// checks, update this map to match.
const PURGE_PERMISSION: Record<Kind, string> = {
  clients: "organizations.delete",
  leads: "organizations.delete",
  deals: "deals.delete",
  quotes: "deals.delete",
  proposals: "deals.delete",
  contracts: "deals.delete",
};

type DataState = Record<Kind, Row[]>;
const EMPTY_DATA: DataState = { clients: [], leads: [], deals: [], quotes: [], proposals: [], contracts: [] };

export default function Trash() {
  const navigate = useNavigate();
  const { activeCompany } = useCompany();
  const { toast } = useToast();
  const [tab, setTab] = useState<Kind>("clients");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DataState>(EMPTY_DATA);
  const [purgeTarget, setPurgeTarget] = useState<{ kind: Kind; id: string; name: string } | null>(null);

  const {
    getPermissionScope,
    anewUserId: scopeAnewUserId,
    authUserId: scopeAuthUserId,
    teamMemberIds,
    loading: scopeLoading,
  } = usePermissionScope();
  const { hasPermission } = usePermissions();

  const orgId = activeCompany?.id;

  const load = useCallback(async () => {
    if (!orgId) return;
    // Permission scope hasn't resolved yet — fail closed instead of risking
    // an unscoped query. useEffect below re-runs load() once scopeLoading
    // flips (it's a dependency of this callback).
    if (scopeLoading) { setLoading(true); return; }
    setLoading(true);
    try {
      const facetSelect = "id, entity_id, deleted_at, deleted_by, created_at, assigned_to, created_by";

      // SECURITY: every query below must apply the exact same
      // clients.view / leads.view / deals.view / quotes.view / proposals.view /
      // client_contracts.view scope (ORG/TEAM/OWNED) that the corresponding
      // main list page (AnewClients.tsx, AnewLeads.tsx, Deals.tsx, Quotes.tsx,
      // Proposals.tsx, ClientContracts.tsx) already applies — never a bespoke
      // "trash is org-wide" rule. Otherwise a scope-restricted viewer could
      // use the Lixo screen to see deleted records (names, emails, deletion
      // metadata) belonging to other teams/owners that never appear in their
      // own list. ORG scope keeps today's behaviour (see everything);
      // TEAM/OWNED/NONE are newly restricted here.
      const clientsScope = getPermissionScope("clients.view");
      const leadsScope = getPermissionScope("leads.view");
      const dealsScope = getPermissionScope("deals.view");
      const quotesScope = getPermissionScope("quotes.view");
      const proposalsScope = getPermissionScope("proposals.view");
      const contractsScope = getPermissionScope("client_contracts.view");

      // ── Clients (anew_clients facet) — mirrors AnewClients.tsx ──
      const clientScopedUserIds = getContactScopeUserIds(clientsScope, scopeAnewUserId, scopeAuthUserId, teamMemberIds);
      let clientsQuery: any = clientsScope === "NONE" ? null : (supabase as any)
        .from("anew_clients").select(facetSelect).eq("organization_id", orgId)
        .not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(500);
      if (clientsQuery && clientsScope !== "ORG") {
        const orFilter = buildContactScopeOrFilter(clientsScope, clientScopedUserIds);
        clientsQuery = orFilter ? clientsQuery.or(orFilter) : clientsQuery.eq("id", ZERO_UUID);
      }

      // ── Leads (anew_leads facet) — mirrors AnewLeads.tsx ──
      const leadScopedUserIds = getLeadScopeUserIds(scopeAnewUserId, scopeAuthUserId, leadsScope === "TEAM" ? teamMemberIds : []);
      let leadsQuery: any = leadsScope === "NONE" ? null : (supabase as any)
        .from("anew_leads").select(facetSelect).eq("organization_id", orgId)
        .not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(500);
      if (leadsQuery && leadsScope !== "ORG") {
        leadsQuery = leadScopedUserIds.length > 0
          ? leadsQuery.or(`assigned_to.in.(${leadScopedUserIds.join(",")}),created_by.in.(${leadScopedUserIds.join(",")})`)
          : leadsQuery.eq("id", ZERO_UUID);
      }

      // ── Deals — mirrors the OWNED/TEAM ownership filter in Deals.tsx ──
      const dealScopedUserIds = new Set<string>();
      if (scopeAnewUserId) dealScopedUserIds.add(scopeAnewUserId);
      if (dealsScope === "TEAM") teamMemberIds.forEach((id) => dealScopedUserIds.add(id));
      let dealsQuery: any = dealsScope === "NONE" ? null : (supabase as any)
        .from("deals").select("id, title, deleted_at, deleted_by, created_at, assigned_to, created_by").eq("organization_id", orgId)
        .not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(500);
      if (dealsQuery && dealsScope !== "ORG") {
        const ids = Array.from(dealScopedUserIds);
        dealsQuery = ids.length > 0
          ? dealsQuery.or(`assigned_to.in.(${ids.join(",")}),created_by.in.(${ids.join(",")})`)
          : dealsQuery.eq("id", ZERO_UUID);
      }

      // ── Quotes — mirrors the direct-ownership branch in Quotes.tsx ──
      // (Quotes.tsx also widens TEAM/OWNED visibility to quotes reached via
      // owned deals/leads; the trash view intentionally only covers direct
      // quotes.created_by/assigned_to ownership, a strict subset — it can
      // under-show some edge cases but never over-shows.)
      const quoteScopedUserIds = new Set<string>();
      if (scopeAnewUserId) quoteScopedUserIds.add(scopeAnewUserId);
      if (quotesScope === "TEAM") teamMemberIds.forEach((id) => quoteScopedUserIds.add(id));
      let quotesQuery: any = quotesScope === "NONE" ? null : (supabase as any)
        .from("quotes").select("id, title, quote_number, deleted_at, deleted_by, created_at, assigned_to, created_by").eq("organization_id", orgId)
        .not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(500);
      if (quotesQuery && quotesScope !== "ORG") {
        const ids = Array.from(quoteScopedUserIds);
        quotesQuery = ids.length > 0
          ? quotesQuery.or(`assigned_to.in.(${ids.join(",")}),created_by.in.(${ids.join(",")})`)
          : quotesQuery.eq("id", ZERO_UUID);
      }

      // ── Contracts (client_contracts) — mirrors ClientContracts.tsx (created_by only, no assigned_to column) ──
      const contractScopedUserIds = new Set<string>();
      if (scopeAnewUserId) contractScopedUserIds.add(scopeAnewUserId);
      if (contractsScope === "TEAM") teamMemberIds.forEach((id) => contractScopedUserIds.add(id));
      let contractsQuery: any = contractsScope === "NONE" ? null : (supabase as any)
        .from("client_contracts").select("id, contract_number, deleted_at, deleted_by, created_at, created_by").eq("organization_id", orgId)
        .not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(500);
      if (contractsQuery && contractsScope !== "ORG") {
        const ids = Array.from(contractScopedUserIds);
        contractsQuery = ids.length > 0 ? contractsQuery.in("created_by", ids) : contractsQuery.eq("id", ZERO_UUID);
      }

      // ── Proposals — mirrors the lead→deal→proposal traversal reused in
      // ClientContracts.tsx's "proposals-for-contracts" scoped query ──
      const buildProposalsQuery = async () => {
        if (proposalsScope === "NONE") return { data: [] as any[] };
        let q: any = (supabase as any)
          .from("proposals").select("id, title, proposal_number, deleted_at, deleted_by, created_at, deal_id, created_by")
          .eq("organization_id", orgId)
          .not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(500);
        if (proposalsScope !== "ORG") {
          const allowedUserIds = new Set<string>();
          if (scopeAnewUserId) allowedUserIds.add(scopeAnewUserId);
          if (proposalsScope === "TEAM") teamMemberIds.forEach((id) => allowedUserIds.add(id));
          if (allowedUserIds.size === 0) return { data: [] as any[] };
          const allowedArr = Array.from(allowedUserIds);
          const { data: userLeads } = await supabase
            .from("anew_leads").select("id").eq("organization_id", orgId).in("assigned_to", allowedArr);
          const leadIds = (userLeads || []).map((l: any) => l.id);
          let dealIds: string[] = [];
          if (leadIds.length > 0) {
            const { data: userDeals } = await supabase
              .from("deals").select("id").eq("organization_id", orgId).in("lead_id", leadIds);
            dealIds = (userDeals || []).map((dl: any) => dl.id);
          }
          const orClauses = [`created_by.in.(${allowedArr.join(",")})`];
          if (dealIds.length > 0) orClauses.push(`deal_id.in.(${dealIds.join(",")})`);
          q = q.or(orClauses.join(","));
        }
        return q;
      };

      const [c, l, d, q, p, k] = await Promise.all([
        clientsQuery ?? Promise.resolve({ data: [] as any[] }),
        leadsQuery ?? Promise.resolve({ data: [] as any[] }),
        dealsQuery ?? Promise.resolve({ data: [] as any[] }),
        quotesQuery ?? Promise.resolve({ data: [] as any[] }),
        buildProposalsQuery(),
        contractsQuery ?? Promise.resolve({ data: [] as any[] }),
      ]);

      const facetRows = [...(c.data || []), ...(l.data || [])];
      const businessRows = [...(d.data || []), ...(q.data || []), ...(p.data || []), ...(k.data || [])];

      const allEntityIds = Array.from(new Set(facetRows.map((r: any) => r.entity_id).filter(Boolean)));
      const allUserIds = Array.from(new Set([...facetRows, ...businessRows].map((r: any) => r.deleted_by).filter(Boolean)));

      const nameMap = new Map<string, string>();
      const userMap = new Map<string, string>();
      const promises: Promise<void>[] = [];
      if (allEntityIds.length) {
        promises.push((async () => {
          const { data } = await supabase.from("anew_entities").select("id, display_name").in("id", allEntityIds);
          (data || []).forEach((e: any) => nameMap.set(e.id, e.display_name || "—"));
        })());
      }
      if (allUserIds.length) {
        promises.push((async () => {
          const { data } = await (supabase as any)
            .from("anew_users")
            .select("id, auth_user_id, name")
            .or(`id.in.(${allUserIds.join(",")}),auth_user_id.in.(${allUserIds.join(",")})`);
          (data || []).forEach((u: any) => {
            const label = u.name || "—";
            if (u.id) userMap.set(u.id, label);
            if (u.auth_user_id) userMap.set(u.auth_user_id, label);
          });
        })());
      }
      await Promise.all(promises);

      const mapFacet = (rows: any[]): Row[] => (rows || []).map((r) => ({
        id: r.id,
        entity_id: r.entity_id,
        display_name: r.entity_id ? (nameMap.get(r.entity_id) || "—") : "—",
        deleted_at: r.deleted_at,
        deleted_by_name: r.deleted_by ? (userMap.get(r.deleted_by) || "—") : null,
        created_at: r.created_at,
      }));

      const mapBusiness = (rows: any[]): Row[] => (rows || []).map((r) => {
        const subtitle = r.quote_number || r.proposal_number || r.contract_number || null;
        const display_name = r.title || subtitle || r.id;
        return {
          id: r.id,
          entity_id: null,
          display_name,
          subtitle,
          deleted_at: r.deleted_at,
          deleted_by_name: r.deleted_by ? (userMap.get(r.deleted_by) || "—") : null,
          created_at: r.created_at,
        };
      });

      setData({
        clients: mapFacet(c.data || []),
        leads: mapFacet(l.data || []),
        deals: mapBusiness(d.data || []),
        quotes: mapBusiness(q.data || []),
        proposals: mapBusiness(p.data || []),
        contracts: mapBusiness(k.data || []),
      });
    } catch (e: any) {
      toast({ title: "Erro a carregar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [orgId, toast, scopeLoading, getPermissionScope, scopeAnewUserId, scopeAuthUserId, teamMemberIds]);

  useEffect(() => { load(); }, [load]);

  const restore = async (kind: Kind, id: string) => {
    try {
      const { error } = isBusiness(kind)
        ? await (supabase as any).rpc("restore_business_entity", { p_kind: BUSINESS_KINDS[kind], p_id: id })
        : await (supabase as any).rpc("restore_entity_facet", { p_kind: ENTITY_KINDS[kind as "clients" | "leads"], p_id: id });
      if (error) throw error;
      toast({ title: "Restaurado", description: "Registo restaurado com sucesso." });
      load();
    } catch (e: any) {
      toast({ title: "Erro a restaurar", description: e.message, variant: "destructive" });
    }
  };

  const purge = async () => {
    if (!purgeTarget) return;
    const { kind, id } = purgeTarget;
    try {
      const { error } = isBusiness(kind)
        ? await (supabase as any).rpc("purge_business_entity", { p_kind: BUSINESS_KINDS[kind], p_id: id })
        : await (supabase as any).rpc("purge_entity_facet", { p_kind: ENTITY_KINDS[kind as "clients" | "leads"], p_id: id });
      if (error) throw error;
      toast({ title: "Eliminado definitivamente" });
      setPurgeTarget(null);
      load();
    } catch (e: any) {
      toast({ title: "Erro a eliminar", description: e.message, variant: "destructive" });
    }
  };

  const renderTable = (kind: Kind, rows: Row[], showSubtitle = false) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nome</TableHead>
          {showSubtitle && <TableHead>Nº</TableHead>}
          <TableHead>Eliminado em</TableHead>
          <TableHead>Eliminado por</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow><TableCell colSpan={showSubtitle ? 5 : 4} className="text-center text-muted-foreground py-8">Sem registos no lixo.</TableCell></TableRow>
        ) : rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-medium">{r.display_name}</TableCell>
            {showSubtitle && <TableCell className="text-muted-foreground">{r.subtitle || "—"}</TableCell>}
            <TableCell>{r.deleted_at ? format(new Date(r.deleted_at), "dd/MM/yyyy HH:mm", { locale: pt }) : "—"}</TableCell>
            <TableCell className="text-muted-foreground">{r.deleted_by_name || "—"}</TableCell>
            <TableCell className="text-right space-x-2">
              <Button size="sm" variant="outline" onClick={() => restore(kind, r.id)}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restaurar
              </Button>
              {hasPermission(PURGE_PERMISSION[kind]) && (
                <Button size="sm" variant="destructive" onClick={() => setPurgeTarget({ kind, id: r.id, name: r.display_name })}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar definitivamente
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
      </Button>
      <div className="flex items-center gap-3">
        <Trash2 className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Lixo</h1>
          <p className="text-sm text-muted-foreground">Registos eliminados. Pode restaurar ou eliminar definitivamente.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registos eliminados</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Kind)}>
            <div className="space-y-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">CRM</p>
                <TabsList>
                  <TabsTrigger value="clients"><Briefcase className="h-3.5 w-3.5 mr-1" />Clientes <Badge variant="secondary" className="ml-2">{data.clients.length}</Badge></TabsTrigger>
                  <TabsTrigger value="leads"><User className="h-3.5 w-3.5 mr-1" />Leads <Badge variant="secondary" className="ml-2">{data.leads.length}</Badge></TabsTrigger>
                </TabsList>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Comercial</p>
                <TabsList>
                  <TabsTrigger value="deals"><Handshake className="h-3.5 w-3.5 mr-1" />Negócios <Badge variant="secondary" className="ml-2">{data.deals.length}</Badge></TabsTrigger>
                  <TabsTrigger value="quotes"><FileText className="h-3.5 w-3.5 mr-1" />Orçamentos <Badge variant="secondary" className="ml-2">{data.quotes.length}</Badge></TabsTrigger>
                  <TabsTrigger value="proposals"><FileSignature className="h-3.5 w-3.5 mr-1" />Propostas <Badge variant="secondary" className="ml-2">{data.proposals.length}</Badge></TabsTrigger>
                  <TabsTrigger value="contracts"><FileCheck className="h-3.5 w-3.5 mr-1" />Contratos <Badge variant="secondary" className="ml-2">{data.contracts.length}</Badge></TabsTrigger>
                </TabsList>
              </div>
            </div>

            {(["clients", "leads"] as const).map((k) => (
              <TabsContent key={k} value={k} className="mt-4">
                {loading ? <div className="text-center py-8 text-muted-foreground">A carregar…</div> : renderTable(k, data[k])}
              </TabsContent>
            ))}
            <TabsContent value="deals" className="mt-4">{loading ? <div className="text-center py-8 text-muted-foreground">A carregar…</div> : renderTable("deals", data.deals)}</TabsContent>
            {(["quotes", "proposals", "contracts"] as const).map((k) => (
              <TabsContent key={k} value={k} className="mt-4">
                {loading ? <div className="text-center py-8 text-muted-foreground">A carregar…</div> : renderTable(k, data[k], true)}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <AlertDialog open={!!purgeTarget} onOpenChange={(o) => !o && setPurgeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Eliminar definitivamente?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acção é irreversível. <strong>{purgeTarget?.name}</strong> será removido permanentemente da base de dados.
              {purgeTarget?.kind === "deals" && (
                <span className="block mt-2 text-amber-600 dark:text-amber-400">
                  Negócios só podem ser eliminados definitivamente se não tiverem orçamentos, propostas ou contratos vivos associados.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={purge} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
