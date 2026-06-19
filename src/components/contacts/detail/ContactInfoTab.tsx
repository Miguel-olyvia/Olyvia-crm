import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Mail, Phone, FileText, Briefcase, MapPin, Calendar, User, Tag, Heart,
  Rocket, Plus, AlertTriangle, Clock, ExternalLink, PhoneCall, StickyNote, Users,
} from "lucide-react";
import { formatPhoneNumber } from "@/constants/countryCodes";
import { differenceInDays, format } from "date-fns";
import { pt } from "date-fns/locale";

const ACTION_LABELS: Record<string, string> = {
  follow_up: "Follow-up",
  send_proposal: "Enviar proposta",
  schedule_meeting: "Agendar reunião",
  send_info: "Enviar informação",
  send_contract: "Enviar contrato",
  close_deal: "Fechar negócio",
  none: "Nenhuma",
};

interface Deal {
  id: string;
  title: string;
  value: number;
  stage_id: string;
  probability?: number;
  created_at?: string;
  assigned_to?: string;
  stages: { name: string; color: string } | null;
}

interface Proposal {
  id: string;
  title: string;
  value: number;
  status: string;
  valid_until: string;
  created_at?: string;
  deals: { title: string } | null;
}

interface Interaction {
  id: string;
  interaction_type: string;
  subject: string | null;
  notes: string | null;
  sentiment: string | null;
  interaction_at: string;
  duration_minutes: number | null;
  created_by: string | null;
  result: string | null;
}

interface ContactInfoTabProps {
  contact: any;
  deals: Deal[];
  proposals: Proposal[];
  interactions: Interaction[];
  tags: { id: string; tag: string; color: string | null }[];
  addresses: any[];
  assignedUserName: string | null;
  sourceLead: { id: string; campaign?: string; source_type?: string } | null;
  lastSentiment: { sentiment: string; date: string } | null;
  nextAction: { id?: string; description: string; date: string } | null;
  userMap: Record<string, string>;
  onCreateDeal: () => void;
  onRegisterCall: () => void;
  onAddTag: () => void;
  onScheduleAction?: () => void;
  onEditAction?: () => void;
}

const INTERACTION_ICONS: Record<string, { icon: typeof Phone; color: string }> = {
  call: { icon: PhoneCall, color: "text-green-600 bg-green-100 dark:bg-green-900/30" },
  email: { icon: Mail, color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30" },
  meeting: { icon: Users, color: "text-orange-600 bg-orange-100 dark:bg-orange-900/30" },
  note: { icon: StickyNote, color: "text-muted-foreground bg-muted" },
  whatsapp: { icon: Phone, color: "text-green-600 bg-green-100 dark:bg-green-900/30" },
};

const SENTIMENT_EMOJI: Record<string, string> = {
  positive: "😊",
  neutral: "😐",
  negative: "😟",
};

export function ContactInfoTab({
  contact, deals, proposals, interactions, tags, addresses,
  assignedUserName, sourceLead, lastSentiment, nextAction, userMap,
  onCreateDeal, onRegisterCall, onAddTag, onScheduleAction, onEditAction,
}: ContactInfoTabProps) {
  return (
    <div className="space-y-5">
      {/* Existing fields: email, phone, status, date, position, vat, notes */}
      <div className="grid grid-cols-2 gap-4">
        {contact.email && (
          <div className="space-y-1">
            <Label className="text-muted-foreground flex items-center gap-2 text-xs">
              <Mail className="w-3.5 h-3.5" /> Email
            </Label>
            <p className="font-medium text-sm text-primary">{contact.email}</p>
          </div>
        )}
        {contact.phone && (
          <div className="space-y-1">
            <Label className="text-muted-foreground flex items-center gap-2 text-xs">
              <Phone className="w-3.5 h-3.5" /> Telefone
            </Label>
            <a href={`tel:${contact.phone_country_code || '+351'}${contact.phone}`} className="font-medium text-sm hover:text-primary transition-colors">{formatPhoneNumber(contact.phone, contact.phone_country_code)}</a>
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs">Estado</Label>
          <div>
            <Badge className={
              contact.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
              "bg-muted text-muted-foreground"
            }>
              {contact.status || "—"}
            </Badge>
          </div>
        </div>
        {contact.created_at && (
          <div className="space-y-1">
            <Label className="text-muted-foreground flex items-center gap-2 text-xs">
              <Calendar className="w-3.5 h-3.5" /> Data de Criação
            </Label>
            <p className="font-medium text-sm">{new Date(contact.created_at).toLocaleDateString("pt-PT")}</p>
          </div>
        )}

        {/* New fields */}
        {assignedUserName && (
          <div className="space-y-1">
            <Label className="text-muted-foreground flex items-center gap-2 text-xs">
              <User className="w-3.5 h-3.5" /> Resp. Comercial
            </Label>
            <p className="font-medium text-sm">{assignedUserName}</p>
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-muted-foreground flex items-center gap-2 text-xs">
            <Tag className="w-3.5 h-3.5" /> Tags
          </Label>
          <div className="flex items-center gap-1 flex-wrap">
            {tags.map(t => (
              <Badge key={t.id} variant="outline" className="text-xs" style={t.color ? { borderColor: t.color, color: t.color } : undefined}>
                {t.tag}
              </Badge>
            ))}
            <button onClick={onAddTag} className="text-xs text-muted-foreground hover:text-foreground">+ tag</button>
          </div>
        </div>
        {lastSentiment && (
          <div className="space-y-1">
            <Label className="text-muted-foreground flex items-center gap-2 text-xs">
              <Heart className="w-3.5 h-3.5" /> Sentimento (última interacção)
            </Label>
            <p className="font-medium text-sm">
              {SENTIMENT_EMOJI[lastSentiment.sentiment] || "—"} {lastSentiment.sentiment === "positive" ? "Positivo" : lastSentiment.sentiment === "neutral" ? "Neutro" : "Negativo"} · {format(new Date(lastSentiment.date), "dd/MM", { locale: pt })}
            </p>
          </div>
        )}
        {sourceLead && (
          <div className="space-y-1">
            <Label className="text-muted-foreground flex items-center gap-2 text-xs">
              <Rocket className="w-3.5 h-3.5" /> Lead de Origem
            </Label>
            <p className="font-medium text-sm">
              <span className="text-primary">Lead de Origem</span>
              {sourceLead.campaign && <span className="text-muted-foreground"> · Campanha: {sourceLead.campaign}</span>}
            </p>
          </div>
        )}
      </div>

      {contact.vat && (
        <div className="space-y-1">
          <Label className="text-muted-foreground flex items-center gap-2 text-xs">
            <FileText className="w-3.5 h-3.5" /> NIF
          </Label>
          <p className="font-medium text-sm">{contact.vat}</p>
        </div>
      )}

      {contact.position && (
        <div className="space-y-1">
          <Label className="text-muted-foreground flex items-center gap-2 text-xs">
            <Briefcase className="w-3.5 h-3.5" /> Cargo
          </Label>
          <p className="font-medium text-sm">{contact.position}</p>
        </div>
      )}

      {contact.notes && (
        <>
          <Separator />
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Notas</Label>
            <p className="text-sm">{contact.notes}</p>
          </div>
        </>
      )}

      {/* Addresses */}
      {addresses.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <Label className="text-muted-foreground flex items-center gap-2 text-xs uppercase tracking-wider">
              <MapPin className="w-3.5 h-3.5" /> Moradas
            </Label>
            {addresses.map((addr: any) => (
              <Card key={addr.id} className="border-dashed">
                <CardContent className="py-2.5 px-3">
                  {addr.is_primary && <Badge variant="outline" className="text-[10px] mb-1 border-green-500 text-green-600">Principal</Badge>}
                  <p className="text-sm">{[addr.street, addr.number, addr.floor].filter(Boolean).join(", ")}</p>
                  <p className="text-sm text-muted-foreground">{[addr.postal_code, addr.city].filter(Boolean).join(" ")}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Active Deals section */}
      <Separator />
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-muted-foreground flex items-center gap-2 text-xs uppercase tracking-wider">
            📋 Negócios Activos
          </Label>
          <Badge variant="secondary" className="text-[10px]">{deals.length}</Badge>
        </div>
        {deals.length > 0 ? (
          <div className="space-y-2">
            {deals.slice(0, 3).map(deal => (
              <Card key={deal.id} className="border-l-4" style={{ borderLeftColor: deal.stages?.color || "hsl(var(--primary))" }}>
                <CardContent className="py-2.5 px-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{deal.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {deal.stages && <Badge variant="outline" className="text-[10px]" style={{ borderColor: deal.stages.color, color: deal.stages.color }}>{deal.stages.name}</Badge>}
                      {deal.created_at && <span className="text-[10px] text-muted-foreground">Criado {format(new Date(deal.created_at), "dd/MM", { locale: pt })}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-600">€{deal.value?.toLocaleString("pt-PT")}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}
      </div>

      {/* Proposals section */}
      {proposals.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-muted-foreground flex items-center gap-2 text-xs uppercase tracking-wider">
                📄 Propostas
              </Label>
              <Badge variant="secondary" className="text-[10px]">{proposals.length}</Badge>
            </div>
            {proposals.slice(0, 3).map(p => (
              <Card key={p.id}>
                <CardContent className="py-2.5 px-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                      <p className="text-sm font-medium">{p.title}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px]">
                        {p.status === "sent" ? "Enviada" : p.status === "accepted" ? "Aceite" : p.status === "draft" ? "Rascunho" : p.status}
                      </Badge>
                      {p.created_at && <span className="text-[10px] text-muted-foreground">{format(new Date(p.created_at), "dd/MM", { locale: pt })}</span>}
                    </div>
                  </div>
                  <p className="text-sm font-bold">€{p.value?.toLocaleString("pt-PT")}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Next Actions */}
      <Separator />
      <div className="space-y-2">
        <Label className="text-muted-foreground flex items-center gap-2 text-xs uppercase tracking-wider">
          📅 Próximas Acções
        </Label>
        {nextAction ? (
          <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={onEditAction}>
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

      {/* Recent Activity */}
      <Separator />
      <div className="space-y-2">
        <Label className="text-muted-foreground flex items-center gap-2 text-xs uppercase tracking-wider">
          📜 Actividade Recente
        </Label>
        {interactions.length > 0 ? (
          <div className="space-y-2">
            {interactions.slice(0, 5).map(i => {
              const cfg = INTERACTION_ICONS[i.interaction_type] || INTERACTION_ICONS.note;
              const Icon = cfg.icon;
              return (
                <div key={i.id} className="flex items-start gap-3 py-1.5">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${cfg.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {i.interaction_type === "call" ? "Chamada realizada" : i.interaction_type === "email" ? "Email enviado" : i.interaction_type === "meeting" ? "Reunião" : "Nota"}
                      {i.sentiment && <span className="ml-1">{SENTIMENT_EMOJI[i.sentiment]}</span>}
                    </p>
                    {(i.subject || i.notes) && (
                      <p className="text-xs text-muted-foreground truncate">{i.subject || i.notes}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(i.interaction_at), "dd/MM", { locale: pt })}
                      {i.created_by && userMap[i.created_by] && ` · ${userMap[i.created_by]}`}
                      {i.duration_minutes && ` · ${i.duration_minutes} min`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">Sem actividade registada</p>
        )}
        <div className="border border-dashed rounded-md py-2 text-center">
          <button onClick={onRegisterCall} className="text-xs text-muted-foreground hover:text-foreground">
            + Registar actividade (📞 Chamada · 📝 Nota · 📅 Reunião · ✉️ Email)
          </button>
        </div>
      </div>
    </div>
  );
}
