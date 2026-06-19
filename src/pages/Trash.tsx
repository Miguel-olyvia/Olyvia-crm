import { useEffect, useState, useCallback } from "react";
import { Trash2, RotateCcw, User, Users, Briefcase, AlertTriangle, ArrowLeft, Handshake, FileText, FileSignature, FileCheck } from "lucide-react";
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

type Kind = "clients" | "contacts" | "leads" | "deals" | "quotes" | "proposals" | "contracts";

type Row = {
  id: string;
  entity_id: string | null;
  display_name: string;
  subtitle?: string | null;
  deleted_at: string | null;
  deleted_by_name: string | null;
  created_at: string;
};

const ENTITY_KINDS: Record<"clients" | "contacts" | "leads", "client" | "contact" | "lead"> = {
  clients: "client", contacts: "contact", leads: "lead",
};
const BUSINESS_KINDS: Record<"deals" | "quotes" | "proposals" | "contracts", "deal" | "quote" | "proposal" | "contract"> = {
  deals: "deal", quotes: "quote", proposals: "proposal", contracts: "contract",
};
const isBusiness = (k: Kind): k is keyof typeof BUSINESS_KINDS => k in BUSINESS_KINDS;

type DataState = Record<Kind, Row[]>;
const EMPTY_DATA: DataState = { clients: [], contacts: [], leads: [], deals: [], quotes: [], proposals: [], contracts: [] };

export default function Trash() {
  const navigate = useNavigate();
  const { activeCompany } = useCompany();
  const { toast } = useToast();
  const [tab, setTab] = useState<Kind>("clients");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DataState>(EMPTY_DATA);
  const [purgeTarget, setPurgeTarget] = useState<{ kind: Kind; id: string; name: string } | null>(null);

  const orgId = activeCompany?.id;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const facetSelect = "id, entity_id, deleted_at, deleted_by, created_at";
      const [c, ct, l, d, q, p, k] = await Promise.all([
        (supabase as any).from("anew_clients").select(facetSelect).eq("organization_id", orgId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(500),
        (supabase as any).from("anew_contacts").select(facetSelect).eq("organization_id", orgId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(500),
        (supabase as any).from("anew_leads").select(facetSelect).eq("organization_id", orgId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(500),
        (supabase as any).from("deals").select("id, title, deleted_at, deleted_by, created_at").eq("organization_id", orgId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(500),
        (supabase as any).from("quotes").select("id, title, quote_number, deleted_at, deleted_by, created_at").eq("organization_id", orgId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(500),
        (supabase as any).from("proposals").select("id, title, proposal_number, deleted_at, deleted_by, created_at").eq("organization_id", orgId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(500),
        (supabase as any).from("client_contracts").select("id, contract_number, deleted_at, deleted_by, created_at").eq("organization_id", orgId).not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(500),
      ]);

      const facetRows = [...(c.data || []), ...(ct.data || []), ...(l.data || [])];
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
        contacts: mapFacet(ct.data || []),
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
  }, [orgId, toast]);

  useEffect(() => { load(); }, [load]);

  const restore = async (kind: Kind, id: string) => {
    try {
      const { error } = isBusiness(kind)
        ? await (supabase as any).rpc("restore_business_entity", { p_kind: BUSINESS_KINDS[kind], p_id: id })
        : await (supabase as any).rpc("restore_entity_facet", { p_kind: ENTITY_KINDS[kind as "clients" | "contacts" | "leads"], p_id: id });
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
        : await (supabase as any).rpc("purge_entity_facet", { p_kind: ENTITY_KINDS[kind as "clients" | "contacts" | "leads"], p_id: id });
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
              <Button size="sm" variant="destructive" onClick={() => setPurgeTarget({ kind, id: r.id, name: r.display_name })}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar definitivamente
              </Button>
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
                  <TabsTrigger value="contacts"><Users className="h-3.5 w-3.5 mr-1" />Contactos <Badge variant="secondary" className="ml-2">{data.contacts.length}</Badge></TabsTrigger>
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

            {(["clients", "contacts", "leads"] as const).map((k) => (
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
