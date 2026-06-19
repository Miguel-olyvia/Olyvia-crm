import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Building2, Plus, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface OrgAddress {
  id: string;
  org_id: string;
  address_id: string;
  is_fiscal: boolean;
  valid_from: string;
  valid_to: string | null;
  address?: {
    id: string;
    street: string;
    number: string;
    floor: string | null;
    unit: string | null;
    postal_code: string;
    city: string;
    district: string | null;
    country: string;
    extra: string | null;
  };
}

interface Props {
  orgId: string;
  onAddClick: () => void;
}

export function OrganizationAddressList({ orgId, onAddClick }: Props) {
  const { t } = useTranslation();
  const [addresses, setAddresses] = useState<OrgAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);

  useEffect(() => {
    if (orgId) {
      fetchAddresses();
    }
  }, [orgId]);

  const fetchAddresses = async () => {
    setLoading(true);

    const { data, error } = await (supabase as any)
      .from("anew_org_addresses")
      .select(`
        id,
        org_id,
        address_id,
        is_fiscal,
        valid_from,
        valid_to,
        address:anew_addresses!anew_org_addresses_address_id_fkey(
          id, street, number, floor, unit, postal_code, city, district, country, extra
        )
      `)
      .eq("org_id", orgId)
      .is("valid_to", null)
      .order("is_fiscal", { ascending: false });

    if (!error && data) {
      setAddresses(data);
    }
    setLoading(false);
  };

  const handleDeleteClick = (id: string) => {
    setDeleteItemId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteItemId) return;

    const { error } = await (supabase as any)
      .from("anew_org_addresses")
      .update({ valid_to: new Date().toISOString() })
      .eq("id", deleteItemId);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t("common.deleted"));
      fetchAddresses();
    }

    setDeleteDialogOpen(false);
    setDeleteItemId(null);
  };

  const formatAddress = (addr: OrgAddress["address"]) => {
    if (!addr) return "-";
    const parts = [
      `${addr.street}, ${addr.number}`,
      addr.floor && `${t("addresses.floor")} ${addr.floor}`,
      addr.unit && `${t("addresses.unit")} ${addr.unit}`,
    ].filter(Boolean);
    
    const location = [
      addr.postal_code,
      addr.city,
      addr.district,
      addr.country,
    ].filter(Boolean).join(", ");

    return `${parts.join(" • ")} — ${location}`;
  };

  if (loading) {
    return (
      <p className="text-muted-foreground text-center py-8">{t("common.loading")}</p>
    );
  }

  if (addresses.length === 0) {
    return (
      <div className="text-center py-8">
        <MapPin className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground mb-4">{t("addresses.noAddresses")}</p>
        <Button onClick={onAddClick}>
          <Plus className="w-4 h-4 mr-2" />
          {t("addresses.add")}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {addresses.map((item) => (
          <div
            key={item.id}
            className="flex items-start justify-between p-4 border rounded-lg"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                {item.is_fiscal && (
                  <Badge variant="default" className="gap-1">
                    <Building2 className="w-3 h-3" />
                    {t("addresses.fiscal")}
                  </Badge>
                )}
                {!item.is_fiscal && (
                  <Badge variant="outline">{t("addresses.other")}</Badge>
                )}
              </div>
              <p className="text-sm">{formatAddress(item.address)}</p>
              {item.address?.extra && (
                <p className="text-xs text-muted-foreground mt-1">{item.address.extra}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDeleteClick(item.id)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.confirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("addresses.deleteConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
