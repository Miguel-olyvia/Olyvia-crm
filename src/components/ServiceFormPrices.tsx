import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { TrendingUp, TrendingDown, DollarSign, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/hooks/useTranslation";

export interface ServicePriceFormData {
  purchase: number;
  retail: number;
  currency: string;
  vat_rate: number;
}

interface ServiceFormPricesProps {
  prices: ServicePriceFormData;
  onChange: (prices: ServicePriceFormData) => void;
}

function calculateMargin(purchase: number, retail: number): number {
  if (!purchase || !retail || purchase <= 0) return 0;
  return ((retail - purchase) / retail) * 100;
}

function formatMarginBadge(margin: number): { label: string; variant: string } {
  if (margin < 10) return { label: `${margin.toFixed(1)}%`, variant: "destructive" };
  if (margin < 20) return { label: `${margin.toFixed(1)}%`, variant: "secondary" };
  return { label: `${margin.toFixed(1)}%`, variant: "default" };
}

export default function ServiceFormPrices({ prices, onChange }: ServiceFormPricesProps) {
  const { t } = useTranslation();
  const margin = calculateMargin(prices.purchase, prices.retail);
  const marginInfo = formatMarginBadge(margin);

  return (
    <div className="space-y-4 border rounded-lg p-4">
      <h3 className="font-medium flex items-center gap-2">
        <DollarSign className="w-4 h-4" />
        {t('services.form.prices') || 'Preços'}
      </h3>

      {/* Margin Display */}
      {prices.purchase > 0 && prices.retail > 0 && (
        <div className="p-3 bg-muted rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm">{t('productPrices.profitMargin') || 'Margem de Lucro'}</span>
            <Badge variant={marginInfo.variant as any}>{marginInfo.label}</Badge>
          </div>
          {margin < 10 && (
            <div className="mt-2 flex items-start gap-2 text-xs text-destructive">
              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>{t('productPrices.lowMarginWarning') || 'Margem abaixo do recomendado'}</span>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('productPrices.currency') || 'Moeda'}</Label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={prices.currency}
            onChange={(e) => onChange({ ...prices, currency: e.target.value })}
          >
            <option value="EUR">EUR (€)</option>
            <option value="USD">USD ($)</option>
            <option value="GBP">GBP (£)</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>{t('productPrices.vatRate') || 'Taxa de IVA (%)'}</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={prices.vat_rate || ''}
            onChange={(e) => onChange({ ...prices, vat_rate: parseFloat(e.target.value) || 0 })}
            placeholder="23"
          />
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <TrendingDown className="w-3 h-3 text-destructive" />
            {t('productPrices.purchasePrice') || 'Preço de Custo'}
          </Label>
          <Input
            type="number"
            step="0.01"
            value={prices.purchase || ''}
            onChange={(e) => onChange({ ...prices, purchase: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <TrendingUp className="w-3 h-3 text-primary" />
            {t('productPrices.retailPrice') || 'Preço de Venda'}
          </Label>
          <Input
            type="number"
            step="0.01"
            value={prices.retail || ''}
            onChange={(e) => onChange({ ...prices, retail: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
          />
        </div>
      </div>
    </div>
  );
}
