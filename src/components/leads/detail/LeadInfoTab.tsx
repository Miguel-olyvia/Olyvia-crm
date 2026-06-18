import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Phone, MapPin, Calendar, Tag, Briefcase, Link, Unlink, Building2, AlertTriangle, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

interface LeadInfoTabProps {
  lead: any;
  fieldDefs: any[];
  fieldValues: Record<string, any>;
  leadName: string | null;
  leadEmail: string | null;
  leadPhone: string | null;
  leadAddress: string | null;
  status: string;
  source: string | null;
  assignedUserName: string | null;
  resolveFieldValue: (key: string, value: any) => any;
  deals: any[];
  nextAction: { description: string; date: string } | null;
  // Associations
  contactAssociation: any;
  clientAssociation: any;
  getIdentity: (entityId: string) => any;
  onCreateDeal: () => void;
  onScheduleAction: () => void;
  // Association handlers
  contactOptions: any[];
  clientOptions: any[];
  searchingContacts: boolean;
  searchingClients: boolean;
  onSearchContacts: (term: string) => void;
  onSearchClients: (term: string) => void;
  onAssociateContact: (leadId: string, contactId: string | null) => void;
  onAssociateClient: (leadId: string, clientId: string | null) => void;
  leadId: string;
}

const ACTION_LABELS: Record<string, string> = {
  follow_up: "Follow-up",
  send_proposal: "Enviar proposta",
  schedule_meeting: "Agendar reunião",
  send_info: "Enviar informação",
  send_contract: "Enviar contrato",
  close_deal: "Fechar negócio",
  none: "Nenhuma",
};

export function LeadInfoTab({
  lead, fieldDefs, fieldValues, leadName, leadEmail, leadPhone, leadAddress,
  status, source, assignedUserName, resolveFieldValue, deals, nextAction,
  contactAssociation, clientAssociation, getIdentity,
  onCreateDeal, onScheduleAction,
  contactOptions, clientOptions, searchingContacts, searchingClients,
  onSearchContacts, onSearchClients, onAssociateContact, onAssociateClient, leadId,
}: LeadInfoTabProps) {
  const [visitDate, setVisitDate] = useState<string | null>(null);

  useEffect(() => {
    const fetchVisit = async () => {
      if (!lead.scheduled_visit_id) { setVisitDate(null); return; }
      const { data } = await (supabase as any)
        .from("schedule_items")
        .select("start_datetime")
        .eq("id", lead.scheduled_visit_id)
        .maybeSingle();
      setVisitDate(data?.start_datetime || null);
    };
    fetchVisit();
  }, [lead.scheduled_visit_id]);

  return (
    <div className="space-y-5">
      {/* Lead basic data */}
      <div className="p-4 bg-muted/50 rounded-lg">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <User className="w-4 h-4" />
          Dados da Lead
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Nome</p>
            <p className="text-sm font-medium">{leadName || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="text-sm font-medium text-primary">{leadEmail || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Telefone</p>
            <p className="text-sm font-medium text-primary">{leadPhone || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Morada</p>
            <p className="text-sm font-medium">{leadAddress || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Estado</p>
            <Badge variant="outline" className="text-xs mt-0.5">{status}</Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Resp. Comercial</p>
            <p className="text-sm font-medium">{assignedUserName || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tags</p>
            <div className="flex items-center gap-1 flex-wrap mt-0.5">
              {lead.tags?.map((tag: string, i: number) => (
                <Badge key={i} variant="outline" className="text-xs">{tag}</Badge>
              )) || <span className="text-sm text-muted-foreground">—</span>}
              <button className="text-xs text-muted-foreground hover:text-foreground">+ tag</button>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Criada</p>
            <p className="text-sm font-medium">{format(new Date(lead.created_at), "dd/MM/yyyy · HH:mm", { locale: pt })}</p>
          </div>
          {visitDate && (
            <div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarCheck className="w-3 h-3" />
                Visita Agendada
              </p>
              <p className="text-sm font-medium text-primary">
                {format(new Date(visitDate), "dd/MM/yyyy · HH:mm", { locale: pt })}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Campaign Form Fields */}
      {fieldDefs.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            📋 Campos do Formulário
          </h4>
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
            {fieldDefs.map(field => (
              <div key={field.field_key}>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {field.field_label}
                </p>
                <p className="text-sm font-medium mt-0.5">
                  {resolveFieldValue(field.field_key, fieldValues?.[field.field_key]) || "—"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Associations */}
      <Separator />
      <div>
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Link className="w-4 h-4" />
          Associações
        </h4>
        <div className="grid grid-cols-2 gap-4">
          {/* Contact */}
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Contacto</span>
            </div>
            {contactAssociation ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {getIdentity(contactAssociation.entity_id)?.display_name || "Contacto"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {getIdentity(contactAssociation.entity_id)?.email || "-"}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => onAssociateContact(leadId, null)} title="Remover">
                  <Unlink className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Não convertida</p>
            )}
          </Card>

          {/* Client */}
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Cliente</span>
            </div>
            {clientAssociation ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {getIdentity(clientAssociation.entity_id)?.display_name || "Cliente"}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => onAssociateClient(leadId, null)} title="Remover">
                  <Unlink className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Não convertida</p>
            )}
          </Card>
        </div>
      </div>

      {/* Active Deals */}
      <Separator />
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-muted-foreground flex items-center gap-2 text-xs uppercase tracking-wider">
            📋 Negócios <Badge variant="secondary" className="text-[10px]">{deals.length}</Badge>
          </Label>
        </div>
        {deals.length > 0 ? (
          <div className="space-y-2">
            {deals.map((deal: any) => (
              <Card key={deal.id} className="border-l-4" style={{ borderLeftColor: deal.stages?.color || "hsl(var(--primary))" }}>
                <CardContent className="py-2.5 px-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{deal.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {deal.stages && (
                        <Badge variant="outline" className="text-[10px]" style={{ borderColor: deal.stages.color, color: deal.stages.color }}>
                          {deal.stages.name}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-bold text-green-600">€{deal.value?.toLocaleString("pt-PT")}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">Sem pedidos de proposta</p>
        )}
        <button onClick={onCreateDeal} className="w-full text-center text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-md py-2">
          + Novo Pedido de Proposta
        </button>
      </div>

      {/* Next Actions */}
      <Separator />
      <div className="space-y-2">
        <Label className="text-muted-foreground flex items-center gap-2 text-xs uppercase tracking-wider">
          📅 Próximas Acções
        </Label>
        {nextAction ? (
          <Card>
            <CardContent className="py-2.5 px-3">
              <p className="text-sm">{ACTION_LABELS[nextAction.description] || nextAction.description}</p>
              <p className="text-xs text-muted-foreground">{format(new Date(nextAction.date), "dd/MM/yyyy HH:mm", { locale: pt })}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <span className="text-sm text-destructive">Sem acção planeada</span>
            <button onClick={onScheduleAction} className="text-sm text-primary cursor-pointer hover:underline ml-1">— Agendar agora</button>
          </div>
        )}
      </div>
    </div>
  );
}
