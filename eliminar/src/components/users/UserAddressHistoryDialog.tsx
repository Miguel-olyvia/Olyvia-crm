import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Loader2, MapPin } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface UserAddressHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
}

interface AddressHistoryEntry {
  id: string;
  address_id: string;
  address_type: string | null;
  is_primary: boolean | null;
  valid_from: string | null;
  valid_to: string | null;
  created_at: string | null;
  address: {
    street: string;
    number: string;
    postal_code: string;
    city: string;
    country: string;
  } | null;
}

export default function UserAddressHistoryDialog({
  open,
  onOpenChange,
  userId,
  userName,
}: UserAddressHistoryDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<AddressHistoryEntry[]>([]);

  useEffect(() => {
    if (open && userId) {
      loadHistory();
    }
  }, [open, userId]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("anew_entity_addresses")
        .select(`
          id,
          address_id,
          address_type,
          is_primary,
          valid_from,
          valid_to,
          created_at,
          anew_addresses:anew_addresses!anew_entity_addresses_address_id_fkey (
            street,
            number,
            postal_code,
            city,
            country
          )
        `)
        .eq("entity_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const formattedHistory = (data || []).map((item: any) => ({
        id: item.id,
        address_id: item.address_id,
        address_type: item.address_type,
        is_primary: item.is_primary,
        valid_from: item.valid_from,
        valid_to: item.valid_to,
        created_at: item.created_at,
        address: item.anew_addresses,
      }));

      setHistory(formattedHistory);
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatAddress = (address: AddressHistoryEntry['address']) => {
    if (!address) return t('addresses.noAddress');
    const parts = [
      address.street,
      address.number,
      address.postal_code,
      address.city,
      address.country,
    ].filter(Boolean);
    return parts.join(', ') || t('addresses.noAddress');
  };

  const getAddressTypeLabel = (type: string | null) => {
    if (!type) return '-';
    const key = `addresses.types.${type}`;
    const translated = t(key);
    return translated !== key ? translated : type;
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    try {
      return format(new Date(date), "dd/MM/yyyy");
    } catch {
      return '-';
    }
  };

  const isActive = (entry: AddressHistoryEntry) => {
    return !entry.valid_to || new Date(entry.valid_to) > new Date();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            {t('addresses.history.title', { name: userName })}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {t('addresses.history.noHistory')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('addresses.history.address')}</TableHead>
                <TableHead>{t('addresses.type')}</TableHead>
                <TableHead>{t('addresses.history.validFrom')}</TableHead>
                <TableHead>{t('addresses.history.validTo')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium max-w-xs truncate">
                    {formatAddress(item.address)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {getAddressTypeLabel(item.address_type)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {formatDate(item.valid_from)}
                  </TableCell>
                  <TableCell>
                    {formatDate(item.valid_to)}
                  </TableCell>
                  <TableCell>
                    {isActive(item) ? (
                      <Badge variant="default" className="bg-green-600">
                        {t('common.active')}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        {t('addresses.history.expired')}
                      </Badge>
                    )}
                    {item.is_primary && (
                      <Badge variant="outline" className="ml-1">
                        {t('addresses.primary')}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
