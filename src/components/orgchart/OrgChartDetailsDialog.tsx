import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { Globe, Mail, Phone, MapPin } from "lucide-react";

interface OrgChartDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
}

interface OrgDetails {
  name: string;
  type: string;
  description?: string | null;
  status: string;
  sector?: string | null;
  metadata?: any;
  emails: string[];
  phones: string[];
  addresses: string[];
}

export function OrgChartDetailsDialog({
  open,
  onOpenChange,
  entityId,
}: OrgChartDetailsDialogProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<OrgDetails | null>(null);

  useEffect(() => {
    if (open && entityId) {
      loadDetails();
    }
  }, [open, entityId]);

  const loadDetails = async () => {
    setLoading(true);
    try {
      // Load org
      const { data: org } = await (supabase as any)
        .from("anew_organizations")
        .select("name, type, description, status, sector, metadata, entity_id")
        .eq("id", entityId)
        .single();

      if (!org) {
        setDetails(null);
        return;
      }

      let emails: string[] = [];
      let phones: string[] = [];
      let addresses: string[] = [];

      // Load contact info from entity if available
      if (org.entity_id) {
        const [emailsRes, phonesRes, addressesRes] = await Promise.all([
          (supabase as any).from("anew_entity_emails").select("email").eq("entity_id", org.entity_id),
          (supabase as any).from("anew_entity_phones").select("phone_number, country_code").eq("entity_id", org.entity_id),
          (supabase as any).from("anew_entity_addresses")
            .select("address_id")
            .eq("entity_id", org.entity_id)
            .then(async (res: any) => {
              if (!res.data?.length) return { data: [] };
              const ids = res.data.map((a: any) => a.address_id);
              return (supabase as any).from("anew_addresses").select("street, number, city, postal_code").in("id", ids);
            }),
        ]);

        emails = (emailsRes.data || []).map((e: any) => e.email);
        phones = (phonesRes.data || []).map((p: any) => `${p.country_code || ''}${p.phone_number}`);
        addresses = (addressesRes.data || []).map((a: any) =>
          [a.street, a.number, a.postal_code, a.city].filter(Boolean).join(", ")
        );
      }

      setDetails({
        name: org.name,
        type: org.type,
        description: org.description,
        status: org.status,
        sector: org.sector,
        metadata: org.metadata,
        emails,
        phones,
        addresses,
      });
    } catch (error) {
      console.error("Error loading details:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {t('orgChart.organization')}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : details ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">{details.name}</h3>
              <div className="flex gap-2 mt-1">
                <Badge variant="outline">{details.type}</Badge>
                <Badge variant={details.status === 'active' ? "default" : "secondary"}>
                  {details.status === 'active' ? t('common.active') : t('common.inactive')}
                </Badge>
              </div>
            </div>

            {details.description && (
              <p className="text-sm text-muted-foreground">{details.description}</p>
            )}

            {details.sector && (
              <p className="text-sm"><span className="font-medium">{t('organizations.sector')}:</span> {details.sector}</p>
            )}

            <div className="space-y-2 text-sm">
              {details.emails.map((email, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{email}</span>
                </div>
              ))}
              {details.phones.map((phone, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{phone}</span>
                </div>
              ))}
              {details.addresses.map((addr, i) => (
                <div key={i} className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{addr}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">{t('common.noResults')}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
