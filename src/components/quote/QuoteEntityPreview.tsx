import { useEffect, useState } from "react";
import { Phone, Mail, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface EntityInfo {
  name: string;
  email: string;
  phone: string;
  location: string;
}

export function QuoteEntityPreview({ entityId }: { entityId: string | null | undefined }) {
  const [info, setInfo] = useState<EntityInfo | null>(null);

  useEffect(() => {
    if (!entityId) { setInfo(null); return; }
    let cancelled = false;
    (async () => {
      const [entityRes, emailsRes, phonesRes, addrRes] = await Promise.all([
        (supabase as any).from("anew_entities").select("display_name").eq("id", entityId).single(),
        (supabase as any).from("anew_entity_emails").select("email").eq("entity_id", entityId).eq("is_primary", true).limit(1),
        (supabase as any).from("anew_entity_phones").select("phone_number").eq("entity_id", entityId).eq("is_primary", true).limit(1),
        (supabase as any).from("anew_entity_addresses").select("is_primary, anew_addresses(city)").eq("entity_id", entityId).limit(1),
      ]);
      if (cancelled) return;
      setInfo({
        name: entityRes.data?.display_name || "",
        email: emailsRes.data?.[0]?.email || "",
        phone: phonesRes.data?.[0]?.phone_number || "",
        location: addrRes.data?.[0]?.anew_addresses?.city || "",
      });
    })();
    return () => { cancelled = true; };
  }, [entityId]);

  if (!info || !info.name) return null;

  const initials = info.name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase();

  return (
    <div className="border rounded-lg p-4 bg-background">
      <p className="text-xs text-muted-foreground mb-2">Os dados preencheram automaticamente os campos abaixo</p>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm">{info.name}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {info.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{info.phone}</span>}
            {info.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{info.email}</span>}
            {info.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{info.location}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
