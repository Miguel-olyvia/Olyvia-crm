import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, X, Phone, Mail, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DealInfo {
  id: string;
  title: string;
  entity_id?: string | null;
  organization_id: string | null;
}

interface EntityInfo {
  name: string;
  email: string;
  phone: string;
  location: string;
}

interface QuoteDealCardProps {
  deal: DealInfo;
  onUnlink: () => void;
}

export function QuoteDealCard({ deal, onUnlink }: QuoteDealCardProps) {
  const [entityInfo, setEntityInfo] = useState<EntityInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadInfo = async () => {
      // Resolve entity_id: prefer prop; else look up via deal -> lead/contact/client
      let entityId = deal.entity_id || null;

      if (!entityId) {
        const { data: dealRow } = await (supabase as any)
          .from("deals")
          .select("entity_id, lead_id, contact_id, client_id")
          .eq("id", deal.id)
          .maybeSingle();

        entityId = dealRow?.entity_id || null;

        if (!entityId && dealRow?.lead_id) {
          const { data } = await (supabase as any).from("anew_leads").select("entity_id").eq("id", dealRow.lead_id).maybeSingle();
          entityId = data?.entity_id || null;
        }
        if (!entityId && dealRow?.contact_id) {
          const { data } = await (supabase as any).from("anew_contacts").select("entity_id").eq("id", dealRow.contact_id).maybeSingle();
          entityId = data?.entity_id || null;
        }
        if (!entityId && dealRow?.client_id) {
          const { data } = await (supabase as any).from("anew_clients").select("entity_id").eq("id", dealRow.client_id).maybeSingle();
          entityId = data?.entity_id || null;
        }
      }

      if (!entityId) { if (!cancelled) setEntityInfo({ name: "", email: "", phone: "", location: "" }); return; }

      const [entityRes, emailsRes, phonesRes, addrRes] = await Promise.all([
        (supabase as any).from("anew_entities").select("display_name").eq("id", entityId).maybeSingle(),
        (supabase as any).from("anew_entity_emails").select("email").eq("entity_id", entityId).eq("is_primary", true).limit(1),
        (supabase as any).from("anew_entity_phones").select("phone_number").eq("entity_id", entityId).eq("is_primary", true).limit(1),
        (supabase as any).from("anew_entity_addresses").select("is_primary, anew_addresses(city)").eq("entity_id", entityId).limit(1),
      ]);

      if (cancelled) return;
      setEntityInfo({
        name: entityRes.data?.display_name || "",
        email: emailsRes.data?.[0]?.email || "",
        phone: phonesRes.data?.[0]?.phone_number || "",
        location: addrRes.data?.[0]?.anew_addresses?.city || "",
      });
    };
    loadInfo();
    return () => { cancelled = true; };
  }, [deal.id, deal.entity_id]);

  const initials = entityInfo?.name
    ? entityInfo.name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()
    : "?";

  return (
    <div className="space-y-3">
      {/* Deal Card */}
      <div className="border rounded-lg p-4 bg-muted/20">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary/10 rounded-lg shrink-0">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-primary truncate">{deal.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Pedido de proposta ligado</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="default" className="bg-green-600 text-xs">✅ Ligado</Badge>
            <Button variant="ghost" size="sm" className="text-destructive h-7 px-2 text-xs" onClick={onUnlink}>
              <X className="h-3 w-3 mr-1" /> Desligar
            </Button>
          </div>
        </div>
      </div>

      {/* Entity Preview */}
      {entityInfo && entityInfo.name && (
        <div className="border rounded-lg p-4 bg-background">
          <p className="text-xs text-muted-foreground mb-2">Os dados do pedido preencheram automaticamente os campos abaixo</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm">{entityInfo.name}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {entityInfo.phone && (
                  <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{entityInfo.phone}</span>
                )}
                {entityInfo.email && (
                  <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{entityInfo.email}</span>
                )}
                {entityInfo.location && (
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{entityInfo.location}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
