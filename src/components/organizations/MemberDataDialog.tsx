import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeFieldValue } from "@/utils/sanitize";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatCurrency } from "@/lib/utils";
import { FileDown, Briefcase, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";

interface MemberDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string; // anew_users.id
  memberName: string;
  authUserId: string | null;
  orgIds: string[]; // all org IDs in scope
  initialTab?: "leads" | "deals";
}

interface LeadRow {
  id: string;
  status: string;
  source: string | null;
  created_at: string;
  field_values: any;
  last_contact_result: string | null;
  contact_attempts: number;
}

interface DealRow {
  id: string;
  title: string;
  value: number | null;
  lost_reason: string | null;
  created_at: string;
}

const statusColors: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-700 border-blue-200",
  contacted: "bg-amber-500/10 text-amber-700 border-amber-200",
  qualified: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  visit_scheduled: "bg-violet-500/10 text-violet-700 border-violet-200",
  converted: "bg-green-500/10 text-green-700 border-green-200",
  lost: "bg-destructive/10 text-destructive border-destructive/20",
  no_answer: "bg-muted text-muted-foreground border-border",
};

const dealStatusColors: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-700 border-blue-200",
  won: "bg-green-500/10 text-green-700 border-green-200",
  lost: "bg-destructive/10 text-destructive border-destructive/20",
  negotiation: "bg-amber-500/10 text-amber-700 border-amber-200",
};

function getLeadName(fv: any): string {
  if (!fv) return "Sem nome";
  const first = sanitizeFieldValue(fv.first_name || fv.nome || "");
  const last = sanitizeFieldValue(fv.last_name || fv.apelido || "");
  const full = `${first} ${last}`.trim();
  return full || sanitizeFieldValue(fv.email || fv.phone || "") || "Sem nome";
}

export function MemberDataDialog({
  open, onOpenChange, memberId, memberName, authUserId, orgIds, initialTab = "leads",
}: MemberDataDialogProps) {
  const [tab, setTab] = useState(initialTab);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [loadingDeals, setLoadingDeals] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
  }, [open, initialTab]);

  // Fetch leads
  useEffect(() => {
    if (!open || !memberId || orgIds.length === 0) return;
    setLoadingLeads(true);
    (async () => {
      const { data } = await (supabase as any)
        .from("anew_leads")
        .select("id, status, source, created_at, field_values, last_contact_result, contact_attempts")
        .eq("assigned_to", memberId)
        .in("organization_id", orgIds)
        .order("created_at", { ascending: false })
        .limit(200);
      setLeads(data || []);
      setLoadingLeads(false);
    })();
  }, [open, memberId, orgIds]);

  // Fetch deals
  useEffect(() => {
    if (!open || orgIds.length === 0) return;
    setLoadingDeals(true);
    (async () => {
      // Deals use authUserId or memberId for assigned_to
      const assignedId = authUserId || memberId;
      const { data } = await (supabase as any)
        .from("deals")
        .select("id, title, value, lost_reason, created_at")
        .eq("assigned_to", assignedId)
        .in("organization_id", orgIds)
        .order("created_at", { ascending: false })
        .limit(200);
      setDeals(data || []);
      setLoadingDeals(false);
    })();
  }, [open, authUserId, memberId, orgIds]);

  // Group leads by status
  const leadsByStatus = leads.reduce<Record<string, LeadRow[]>>((acc, l) => {
    const s = l.status || "new";
    if (!acc[s]) acc[s] = [];
    acc[s].push(l);
    return acc;
  }, {});

  const fmtCurrency = (v: number | null) =>
    v != null ? formatCurrency(v) : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            {memberName}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="leads" className="gap-1.5">
              <FileDown className="h-3.5 w-3.5" />
              Leads ({leads.length})
            </TabsTrigger>
            <TabsTrigger value="deals" className="gap-1.5">
              <Briefcase className="h-3.5 w-3.5" />
              Deals ({deals.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="leads" className="flex-1 min-h-0 mt-3">
            <ScrollArea className="h-[55vh]">
              {loadingLeads ? (
                <div className="space-y-2 p-1">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : leads.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma lead atribuída a este membro.
                </p>
              ) : (
                <div className="space-y-4 p-1">
                  {Object.entries(leadsByStatus).map(([status, items]) => (
                    <div key={status}>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className={cn("text-xs capitalize", statusColors[status])}>
                          {status.replace(/_/g, " ")}
                        </Badge>
                        <span className="text-xs text-muted-foreground">({items.length})</span>
                      </div>
                      <div className="space-y-1.5">
                        {items.map((lead) => (
                          <div
                            key={lead.id}
                            className="flex items-center justify-between rounded-lg border p-2.5 hover:bg-muted/50 transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">
                                {getLeadName(lead.field_values)}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                {lead.source && <span>{lead.source}</span>}
                                <span>
                                  {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true, locale: pt })}
                                </span>
                              </div>
                            </div>
                            <div className="text-right shrink-0 ml-3">
                              <div className="text-xs text-muted-foreground">
                                {lead.contact_attempts || 0} tentativas
                              </div>
                              {lead.last_contact_result && (
                                <div className="text-xs text-muted-foreground">
                                  {lead.last_contact_result.replace(/_/g, " ")}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="deals" className="flex-1 min-h-0 mt-3">
            <ScrollArea className="h-[55vh]">
              {loadingDeals ? (
                <div className="space-y-2 p-1">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : deals.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum deal atribuído a este membro.
                </p>
              ) : (
                <div className="space-y-1.5 p-1">
                  {deals.map((deal) => (
                    <div
                      key={deal.id}
                      className="flex items-center justify-between rounded-lg border p-2.5 hover:bg-muted/50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{deal.title || "Sem título"}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {deal.lost_reason ? (
                            <Badge variant="outline" className={cn("text-[10px]", dealStatusColors["lost"])}>
                              perdido
                            </Badge>
                          ) : (
                            <Badge variant="outline" className={cn("text-[10px]", dealStatusColors["open"])}>
                              ativo
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(deal.created_at), { addSuffix: true, locale: pt })}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-sm font-semibold text-primary">
                          {formatCurrency(deal.value)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
