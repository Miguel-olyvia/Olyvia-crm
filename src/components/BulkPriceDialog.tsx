import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { withAuditContext } from "@/utils/auditContext";

interface BulkPriceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedProductIds: string[];
  onSuccess: () => void;
}

type PriceType = 'purchase' | 'retail' | 'wholesale' | 'distributor';
type ActionType = 'set' | 'increase_percent' | 'decrease_percent' | 'increase_value' | 'decrease_value';

export function BulkPriceDialog({
  open,
  onOpenChange,
  selectedProductIds,
  onSuccess,
}: BulkPriceDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [priceType, setPriceType] = useState<PriceType>('retail');
  const [actionType, setActionType] = useState<ActionType>('set');
  const [value, setValue] = useState<string>("");

  const handleSubmit = async () => {
    if (!value || selectedProductIds.length === 0) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Perfil de utilizador não encontrado.");

      const numValue = parseFloat(value);
      if (isNaN(numValue)) throw new Error("Invalid value");

      // Get existing prices for the selected price type
      const { data: existingPrices, error: fetchError } = await supabase
        .from("product_prices")
        .select("id, product_id, price, vat_rate")
        .eq("price_type", priceType)
        .in("product_id", selectedProductIds);

      if (fetchError) throw fetchError;

      // Calculate new prices based on action type
      const updates: Array<{ id: string; price: number }> = [];
      const inserts: Array<{
        product_id: string;
        price_type: PriceType;
        price: number;
        vat_rate: number | null;
        created_by: string;
      }> = [];

      type ExistingPrice = { id: string; product_id: string; price: number; vat_rate: number | null };

      for (const productId of selectedProductIds) {
        const existingPrice = existingPrices?.find(
          (p: ExistingPrice) => p.product_id === productId
        ) as ExistingPrice | undefined;
        const currentPrice = existingPrice?.price ?? 0;

        let newPrice = numValue;
        switch (actionType) {
          case "set":
            newPrice = numValue;
            break;
          case "increase_percent":
            newPrice = currentPrice * (1 + numValue / 100);
            break;
          case "decrease_percent":
            newPrice = currentPrice * (1 - numValue / 100);
            break;
          case "increase_value":
            newPrice = currentPrice + numValue;
            break;
          case "decrease_value":
            newPrice = Math.max(0, currentPrice - numValue);
            break;
        }

        const rounded = Math.round(newPrice * 100) / 100;

        if (existingPrice?.id) {
          updates.push({ id: existingPrice.id, price: rounded });
        } else {
          inserts.push({
            product_id: productId,
            price_type: priceType,
            price: rounded,
            vat_rate: existingPrice?.vat_rate ?? null,
            created_by: businessUserId,
          });
        }
      }

      await withAuditContext(supabase, businessUserId, async () => {
        if (updates.length > 0) {
          const updateResults = await Promise.all(
            updates.map((u) =>
              supabase.from("product_prices").update({ price: u.price }).eq("id", u.id)
            )
          );
          const firstError = updateResults.find((r) => r.error)?.error;
          if (firstError) throw firstError;
        }

        if (inserts.length > 0) {
          const { error } = await supabase.from("product_prices").insert(inserts);
          if (error) throw error;
        }
      });

      toast({
        title: t('bulkPrice.success'),
        description: t('bulkPrice.successDesc', { count: selectedProductIds.length }),
      });

      onOpenChange(false);
      onSuccess();
    } catch (error: unknown) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('bulkPrice.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            {t('bulkPrice.description', { count: selectedProductIds.length })}
          </p>

          <div className="space-y-2">
            <Label>{t('bulkPrice.priceType')}</Label>
            <Select value={priceType} onValueChange={(v) => setPriceType(v as PriceType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background z-[9999] border shadow-lg">
                <SelectItem value="purchase">{t('bulkPrice.purchase')}</SelectItem>
                <SelectItem value="retail">{t('bulkPrice.retail')}</SelectItem>
                <SelectItem value="wholesale">{t('bulkPrice.wholesale')}</SelectItem>
                <SelectItem value="distributor">{t('bulkPrice.distributor')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('bulkPrice.action')}</Label>
            <Select value={actionType} onValueChange={(v) => setActionType(v as ActionType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background z-[9999] border shadow-lg">
                <SelectItem value="set">{t('bulkPrice.actionSet')}</SelectItem>
                <SelectItem value="increase_percent">{t('bulkPrice.actionIncreasePercent')}</SelectItem>
                <SelectItem value="decrease_percent">{t('bulkPrice.actionDecreasePercent')}</SelectItem>
                <SelectItem value="increase_value">{t('bulkPrice.actionIncreaseValue')}</SelectItem>
                <SelectItem value="decrease_value">{t('bulkPrice.actionDecreaseValue')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>
              {actionType.includes('percent') ? t('bulkPrice.percentValue') : t('bulkPrice.priceValue')}
            </Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={actionType.includes('percent') ? "10" : "0.00"}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !value}>
            {loading ? t('common.processing') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
