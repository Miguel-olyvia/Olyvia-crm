import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Briefcase, Mail, Phone, MessageCircle, Pencil, X, MoreHorizontal, Undo2 } from "lucide-react";
import { PhoneCallDropdown } from "@/components/shared/PhoneCallDropdown";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { type HealthScore } from "@/hooks/useContactHealthScore";
import { formatPhoneNumber } from "@/constants/countryCodes";
import { PermissionGate } from "@/components/PermissionGate";

interface ClientDetailHeaderProps {
  client: any;
  healthScore: HealthScore;
  tags: { id: string; tag: string; color: string | null }[];
  onCreateDeal: () => void;
  onEmail: () => void;
  onCall: () => void;
  onWhatsApp: () => void;
  onEdit: () => void;
  onClose: () => void;
  onRevertToContact?: () => void;
  canRevert?: boolean;
}

const HEALTH_COLORS: Record<string, string> = {
  excellent: "bg-green-500",
  good: "bg-blue-500",
  attention: "bg-yellow-500",
  at_risk: "bg-orange-500",
  critical: "bg-red-500",
};

export function ClientDetailHeader({
  client, healthScore, tags, onCreateDeal, onEmail, onCall, onWhatsApp, onEdit, onClose, onRevertToContact, canRevert,
}: ClientDetailHeaderProps) {
  const initials = [client.first_name?.[0], client.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?";
  const fullName = [client.first_name, client.last_name].filter(Boolean).join(" ") || "—";
  const phone = client.phone ? formatPhoneNumber(client.phone, client.phone_country_code) : null;

  return (
    <div className="flex items-start gap-4 pb-4">
      {/* Avatar */}
      <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xl font-bold shrink-0">
        {initials}
      </div>

      {/* Name, company, contact info & badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl font-bold truncate">{fullName}</h2>
          {client.company_name && (
            <span className="text-sm text-muted-foreground">{client.company_name}</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
          {client.email && (
            <button onClick={onEmail} className="flex items-center gap-1 hover:text-primary transition-colors">
              <Mail className="h-3.5 w-3.5" />
              <span>{client.email}</span>
            </button>
          )}
          {phone && (
            <a href={`tel:${client.phone_country_code || '+351'}${client.phone}`} className="flex items-center gap-1 hover:text-primary transition-colors">
              <Phone className="h-3.5 w-3.5" />
              <span>{phone}</span>
            </a>
          )}
          {client.phone && (
            <button onClick={onWhatsApp} className="flex items-center gap-1 hover:text-green-600 transition-colors">
              <MessageCircle className="h-3.5 w-3.5" />
              <span>WhatsApp</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <Badge variant="outline" className={
            client.status === "customer" ? "border-green-500 text-green-600" :
            client.status === "prospect" ? "border-blue-500 text-blue-600" :
            client.status === "lead" ? "border-amber-500 text-amber-600" :
            client.status === "partner" ? "border-purple-500 text-purple-600" :
            "border-primary text-primary"
          }>
            {client.status === "customer" ? "Cliente" : client.status === "prospect" ? "Prospect" : client.status === "lead" ? "Lead" : client.status === "partner" ? "Parceiro" : client.status || "—"}
          </Badge>
          <Badge variant="secondary" className="text-xs">Cliente</Badge>
          {tags.map(t => (
            <Badge key={t.id} variant="outline" className="text-xs" style={t.color ? { borderColor: t.color, color: t.color } : undefined}>
              {t.tag}
            </Badge>
          ))}
        </div>
      </div>

      {/* Health score circle */}
      <div className="flex items-center gap-2 shrink-0">
        <div className={`h-14 w-14 rounded-full flex items-center justify-center text-white text-lg font-bold ${HEALTH_COLORS[healthScore.level]}`}>
          {healthScore.score}
        </div>
        <div className="text-xs">
          <p className="font-semibold">{healthScore.label}</p>
          <p className="text-muted-foreground">Saúde: {healthScore.score}/100</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 shrink-0">
        <Button size="sm" onClick={onCreateDeal} className="gap-1">
          <Briefcase className="h-3.5 w-3.5" />
          Novo Pedido
        </Button>
        <Button size="sm" variant="outline" onClick={onEmail} className="gap-1">
          <Mail className="h-3.5 w-3.5" /> Email
        </Button>
        <PhoneCallDropdown
          phoneNumber={client.phone}
          phoneCountryCode={client.phone_country_code}
          onRegisterActivity={onCall}
          buttonVariant="outline"
          buttonSize="sm"
          label="Ligar"
        />
        <Button size="sm" variant="outline" onClick={onWhatsApp} className="gap-1">
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </Button>
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canRevert && onRevertToContact && (
              <PermissionGate permission="clients.edit">
                <DropdownMenuItem onClick={onRevertToContact}>
                  <Undo2 className="w-3.5 h-3.5 mr-2" />
                  Reverter para Contacto
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </PermissionGate>
            )}
            <DropdownMenuItem onClick={onClose}>Fechar</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
