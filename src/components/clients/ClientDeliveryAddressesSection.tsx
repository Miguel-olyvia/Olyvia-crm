import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { Loader2, Trash2, Truck } from "lucide-react";
import { DeliveryAddressForm } from "@/components/clients/DeliveryAddressForm";
import {
  fetchEntityDeliveryAddresses,
  formatDeliveryAddress,
  removeEntityDeliveryAddress,
  type EntityDeliveryAddress,
} from "@/lib/addresses/entityDeliveryAddresses";

interface ClientDeliveryAddressesSectionProps {
  entityId: string;
}

/**
 * Secção "Moradas de entrega" da ficha do cliente. Independente do botão
 * Guardar da ficha: acrescentar e remover gravam logo, por RPC. Não toca na
 * morada principal (essa continua a ser gravada pelo rpc_update_client).
 */
export const ClientDeliveryAddressesSection = ({ entityId }: ClientDeliveryAddressesSectionProps) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [addresses, setAddresses] = useState<EntityDeliveryAddress[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<EntityDeliveryAddress | null>(null);
  const [removing, setRemoving] = useState(false);
  // Último entityId pedido, para ignorar respostas fora de ordem.
  const requestRef = useRef<string | null>(null);

  const loadAddresses = useCallback(async () => {
    requestRef.current = entityId;
    setLoading(true);
    try {
      const rows = await fetchEntityDeliveryAddresses(entityId);
      if (requestRef.current !== entityId) return;
      setAddresses(rows);
    } catch (error: any) {
      if (requestRef.current !== entityId) return;
      console.error("[ClientDeliveryAddressesSection] load failed:", error, { entityId });
      toast({ title: t('deliveryAddresses.toast.loadError'), description: error?.message, variant: "destructive" });
    } finally {
      if (requestRef.current === entityId) setLoading(false);
    }
  }, [entityId, t, toast]);

  useEffect(() => {
    setAddresses([]);
    void loadAddresses();
  }, [loadAddresses]);

  const handleConfirmRemove = async () => {
    if (!pendingRemoval || removing) return;
    setRemoving(true);
    try {
      await removeEntityDeliveryAddress(pendingRemoval.entity_address_id);
      toast({ title: t('deliveryAddresses.toast.removed') });
      setPendingRemoval(null);
      await loadAddresses();
    } catch (error: any) {
      toast({ title: t('deliveryAddresses.toast.removeError'), description: error?.message, variant: "destructive" });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="pt-4 border-t">
      <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
        <Truck className="w-4 h-4" />{t('deliveryAddresses.title')}
        {loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
      </h4>

      {!loading && addresses.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-3">{t('deliveryAddresses.empty')}</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {addresses.map((address) => {
            const text = formatDeliveryAddress(address) || address.formatted || '—';
            return (
              <li key={address.entity_address_id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <span className="text-sm break-words">{text}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={() => setPendingRemoval(address)}
                  title={t('deliveryAddresses.remove')}
                  aria-label={`${t('deliveryAddresses.remove')}: ${text}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs font-medium text-muted-foreground mb-2">{t('deliveryAddresses.newTitle')}</p>
      <DeliveryAddressForm
        entityId={entityId}
        idPrefix="client_delivery_address"
        onAdded={loadAddresses}
      />

      <AlertDialog
        open={!!pendingRemoval}
        onOpenChange={(isOpen) => { if (!isOpen && !removing) setPendingRemoval(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deliveryAddresses.removeConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deliveryAddresses.removeConfirmDescription', {
                address: pendingRemoval ? (formatDeliveryAddress(pendingRemoval) || pendingRemoval.formatted || '') : '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>{t('deliveryAddresses.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleConfirmRemove(); }}
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('deliveryAddresses.removeConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
