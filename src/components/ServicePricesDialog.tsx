import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, DollarSign, AlertTriangle, Percent } from "lucide-react";
import { calculateMargin, formatMarginBadge } from "@/utils/productsExportImport";

interface ServicePricesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceId: string;
  serviceName: string;
}

interface PriceData {
  purchase: number;
  retail: number;
  promotional: number;
  promo_from: string;
  promo_to: string;
  currency: string;
  vat_rate: number;
}

export default function ServicePricesDialog({
  open,
  onOpenChange,
  serviceId,
  serviceName
}: ServicePricesDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [promoType, setPromoType] = useState<'value' | 'percentage'>('value');
  const [promoPercentage, setPromoPercentage] = useState<number>(0);
  const [prices, setPrices] = useState<PriceData>({
    purchase: 0,
    retail: 0,
    promotional: 0,
    promo_from: '',
    promo_to: '',
    currency: 'EUR',
    vat_rate: 23
  });
  const [existingPriceIds, setExistingPriceIds] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && serviceId) {
      loadPrices();
    }
  }, [open, serviceId]);

  const loadPrices = async () => {
    try {
      const { data, error } = await supabase
        .from('service_prices')
        .select('id, price_type, price, currency, valid_from, valid_to, vat_rate')
        .eq('service_id', serviceId);

      if (error) throw error;

      const priceMap: any = {
        purchase: 0,
        retail: 0,
        promotional: 0,
        promo_from: '',
        promo_to: '',
        currency: 'EUR',
        vat_rate: 23
      };

      const idMap: Record<string, string> = {};

      data?.forEach(price => {
        priceMap[price.price_type] = price.price;
        idMap[price.price_type] = price.id;
        
        if (price.price_type === 'promotional') {
          priceMap.promo_from = price.valid_from || '';
          priceMap.promo_to = price.valid_to || '';
        }
        
        if (!priceMap.currency && price.currency) {
          priceMap.currency = price.currency;
        }
        
        if (price.vat_rate !== null && price.vat_rate !== undefined) {
          priceMap.vat_rate = price.vat_rate;
        }
      });

      setPrices(priceMap);
      setExistingPriceIds(idMap);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar preços",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Utilizador não autenticado");

      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) {
        toast({ title: "Erro de identidade", description: "Sessão inválida.", variant: "destructive" });
        setLoading(false);
        return;
      }

      // Calculate promotional price if using percentage
      const finalPromotionalPrice = promoType === 'percentage' && promoPercentage > 0 
        ? prices.retail * (1 - promoPercentage / 100)
        : prices.promotional;

      const priceTypes = [
        { type: 'purchase', value: prices.purchase },
        { type: 'retail', value: prices.retail },
        { type: 'promotional', value: finalPromotionalPrice }
      ];

      for (const { type, value } of priceTypes) {
        if (value && value > 0) {
          const priceData: any = {
            service_id: serviceId,
            price_type: type,
            price: value,
            currency: prices.currency,
            vat_rate: prices.vat_rate,
            created_by: businessUserId
          };

          if (type === 'promotional') {
            if (prices.promo_from) priceData.valid_from = prices.promo_from;
            if (prices.promo_to) priceData.valid_to = prices.promo_to;
          }

          if (existingPriceIds[type]) {
            // Update existing price
            const { error } = await supabase
              .from('service_prices')
              .update(priceData)
              .eq('id', existingPriceIds[type]);
            
            if (error) throw error;
          } else {
            // Insert new price
            const { error } = await supabase
              .from('service_prices')
              .insert(priceData);
            
            if (error) throw error;
          }
        }
      }

      toast({
        title: "Preços atualizados com sucesso!"
      });
      
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar preços",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const margin = calculateMargin(prices.purchase, prices.retail);
  const marginInfo = formatMarginBadge(margin);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerir Preços - {serviceName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Margin Display */}
          {prices.purchase > 0 && prices.retail > 0 && (
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-primary" />
                  <span className="font-semibold">Margem de Lucro:</span>
                </div>
                <Badge variant={marginInfo.variant as any}>
                  {marginInfo.label}
                </Badge>
              </div>
              {margin < 10 && (
                <div className="mt-2 flex items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Margem abaixo do recomendado. Considere ajustar os preços.</span>
                </div>
              )}
            </div>
          )}

          {/* Currency Selection */}
          <div className="space-y-2">
            <Label>Moeda</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3"
              value={prices.currency}
              onChange={(e) => setPrices({ ...prices, currency: e.target.value })}
            >
              <option value="EUR">EUR (€)</option>
              <option value="USD">USD ($)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>

          {/* VAT Rate */}
          <div className="space-y-2">
            <Label htmlFor="vat_rate">Taxa de IVA (%)</Label>
            <Input
              id="vat_rate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={prices.vat_rate || ''}
              onChange={(e) => setPrices({ ...prices, vat_rate: parseFloat(e.target.value) || 0 })}
              placeholder="23"
            />
            <p className="text-xs text-muted-foreground">
              Taxa padrão: 23% (Portugal)
            </p>
          </div>

          <Separator />

          {/* Purchase Price */}
          <div className="space-y-2">
            <Label htmlFor="purchase_price">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-destructive" />
                Preço de Custo
              </div>
            </Label>
            <Input
              id="purchase_price"
              type="number"
              step="0.01"
              value={prices.purchase || ''}
              onChange={(e) => setPrices({ ...prices, purchase: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
            />
          </div>

          {/* Retail Price */}
          <div className="space-y-2">
            <Label htmlFor="retail_price">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Preço de Venda
              </div>
            </Label>
            <Input
              id="retail_price"
              type="number"
              step="0.01"
              value={prices.retail || ''}
              onChange={(e) => setPrices({ ...prices, retail: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
            />
          </div>

          <Separator />

          {/* Promotional Price */}
          <div className="space-y-4">
            <Label>Preço Promocional</Label>
            <div className="space-y-4 pl-4 border-l-2 border-primary/20">
              <div className="space-y-2">
                <Label htmlFor="promo_type">Tipo de Desconto</Label>
                <Select value={promoType} onValueChange={(value: 'value' | 'percentage') => setPromoType(value)}>
                  <SelectTrigger id="promo_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="value">Valor Fixo</SelectItem>
                    <SelectItem value="percentage">Percentagem</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {promoType === 'value' ? (
                <div className="space-y-2">
                  <Label htmlFor="promotional_price">Preço em Promoção</Label>
                  <Input
                    id="promotional_price"
                    type="number"
                    step="0.01"
                    value={prices.promotional || ''}
                    onChange={(e) => setPrices({ ...prices, promotional: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="promo_percentage" className="flex items-center gap-2">
                    <Percent className="w-4 h-4" />
                    Desconto (%)
                  </Label>
                  <Input
                    id="promo_percentage"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={promoPercentage || ''}
                    onChange={(e) => setPromoPercentage(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                  />
                  {prices.retail > 0 && promoPercentage > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Preço calculado: {prices.currency} {(prices.retail * (1 - promoPercentage / 100)).toFixed(2)}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="promo_from">Válido de</Label>
                  <Input
                    id="promo_from"
                    type="date"
                    value={prices.promo_from}
                    onChange={(e) => setPrices({ ...prices, promo_from: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="promo_to">Válido até</Label>
                  <Input
                    id="promo_to"
                    type="date"
                    value={prices.promo_to}
                    onChange={(e) => setPrices({ ...prices, promo_to: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSave} disabled={loading}>
              {loading ? "A guardar..." : "Guardar Preços"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
