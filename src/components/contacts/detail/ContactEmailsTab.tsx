import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, ChevronDown, ChevronRight, Send, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import DOMPurify from "dompurify";
import { useEntitySendEvents } from "@/hooks/useEntitySendEvents";

interface ContactEmailsTabProps {
  entityId: string;
}

const CHANNEL_CONFIG: Record<string, { label: string; color: string; icon: typeof Mail }> = {
  email: { label: "Email", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: Mail },
  whatsapp: { label: "WhatsApp", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: MessageSquare },
  portal: { label: "Portal Cliente", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", icon: Send },
  manual: { label: "Envio Manual", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: Send },
};

const DOC_LABELS: Record<string, string> = {
  proposal: "Proposta",
  quote: "Orçamento",
  contract: "Contrato",
};

export function ContactEmailsTab({ entityId }: ContactEmailsTabProps) {
  const { events, loading } = useEntitySendEvents(entityId);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-8 mt-4">
        <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">Sem envios registados</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 mt-4">
      {events.map(ev => {
        const cfg = CHANNEL_CONFIG[ev.channel] || CHANNEL_CONFIG.email;
        const Icon = cfg.icon;
        const canExpand = !!ev.bodyHtml;
        const isOpen = expandedId === ev.id;
        const docLabel = ev.docType ? DOC_LABELS[ev.docType] : null;
        return (
          <div key={ev.id} className="border rounded-lg overflow-hidden">
            <button
              className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors"
              onClick={() => canExpand && setExpandedId(isOpen ? null : ev.id)}
            >
              <Icon className={`h-4 w-4 shrink-0 ${cfg.color.split(" ").find(c => c.startsWith("text-")) || ""}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{ev.subject || "(sem assunto)"}</p>
                <p className="text-[10px] text-muted-foreground">
                  {ev.recipient ? `${ev.recipient} · ` : ""}
                  {format(new Date(ev.sentAt), "dd/MM/yyyy HH:mm", { locale: pt })}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {docLabel && (
                  <Badge variant="outline" className="text-[10px]">{docLabel}</Badge>
                )}
                <Badge className={`text-[10px] ${cfg.color}`}>
                  {cfg.label}
                </Badge>
                {ev.openedCount > 0 && (
                  <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    Aberto {ev.openedCount}x
                  </Badge>
                )}
              </div>
              {canExpand && (
                isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </button>
            {isOpen && ev.bodyHtml && (
              <div className="px-4 pb-3 border-t">
                <div className="text-sm prose prose-sm max-w-none mt-2" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(ev.bodyHtml) }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
