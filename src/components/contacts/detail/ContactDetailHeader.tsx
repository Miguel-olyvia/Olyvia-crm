import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Briefcase, Mail, Phone, MessageCircle, X } from "lucide-react";
import { calculateHealthScore, type HealthScore } from "@/hooks/useContactHealthScore";
import { PhoneCallDropdown } from "@/components/shared/PhoneCallDropdown";

interface ContactDetailHeaderProps {
  contact: any;
  healthScore: HealthScore;
  tags: { id: string; tag: string; color: string | null }[];
  onCreateDeal: () => void;
  onEmail: () => void;
  onCall: () => void;
  onWhatsApp: () => void;
  onClose: () => void;
}

const HEALTH_COLORS: Record<string, string> = {
  excellent: "bg-green-500",
  good: "bg-blue-500",
  attention: "bg-yellow-500",
  at_risk: "bg-orange-500",
  critical: "bg-red-500",
};

export function ContactDetailHeader({
  contact, healthScore, tags, onCreateDeal, onEmail, onCall, onWhatsApp, onClose,
}: ContactDetailHeaderProps) {
  const initials = [contact.first_name?.[0], contact.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?";
  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "—";

  return (
    <div className="flex items-start gap-4 pb-4">
      {/* Avatar */}
      <div className="h-14 w-14 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-lg font-bold shrink-0">
        {initials}
      </div>

      {/* Name & badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl font-bold truncate">{fullName}</h2>
          {contact.company_name && (
            <span className="text-sm text-muted-foreground">{contact.company_name}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <Badge variant="outline" className={
            contact.status === "active" ? "border-green-500 text-green-600" :
            contact.status === "inactive" ? "border-muted-foreground text-muted-foreground" :
            "border-primary text-primary"
          }>
            {contact.status === "active" ? "Activo" : contact.status || "—"}
          </Badge>
          <Badge variant="secondary" className="text-xs">Contacto</Badge>
          {tags.map(t => (
            <Badge key={t.id} variant="outline" className="text-xs" style={t.color ? { borderColor: t.color, color: t.color } : undefined}>
              {t.tag}
            </Badge>
          ))}
        </div>
      </div>

      {/* Health score circle */}
      <div className="flex items-center gap-2 shrink-0">
        <div className={`h-12 w-12 rounded-full flex items-center justify-center text-white text-sm font-bold ${HEALTH_COLORS[healthScore.level]}`}>
          {healthScore.score}
        </div>
        <div className="text-xs">
          <p className="font-semibold">{healthScore.label}</p>
          <p className="text-muted-foreground">{healthScore.score}/100</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 shrink-0">
        <Button size="sm" variant="default" onClick={onCreateDeal} className="gap-1">
          <Briefcase className="h-3.5 w-3.5" /> Novo Pedido
        </Button>
        <Button size="sm" variant="outline" onClick={onEmail}>
          <Mail className="h-3.5 w-3.5" />
        </Button>
        <PhoneCallDropdown
          phoneNumber={contact.phone}
          phoneCountryCode={contact.phone_country_code}
          onRegisterActivity={onCall}
          buttonVariant="outline"
          buttonSize="sm"
        />
        <Button size="sm" variant="outline" onClick={onWhatsApp}>
          <MessageCircle className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onClose} className="ml-1">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
