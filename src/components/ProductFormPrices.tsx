import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { TrendingUp, TrendingDown, DollarSign, AlertTriangle, Ruler } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface PriceFormData {
  purchase: number;
  retail: number;
  wholesale: number;
  distributor: number;
  currency: string;
  vat_rate: number;
  uom_id: string;
}

interface UOM {
  id: string;
  code: string;
  description: string | null;
  is_active: boolean;
}

interface ProductFormPricesProps {
  prices: PriceFormData;
  onChange: (prices: PriceFormData) => void;
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

export default function ProductFormPrices({ prices, onChange }: ProductFormPricesProps) {
  const { t } = useTranslation();
  const [uomList, setUomList] = useState<UOM[]>([]);
  const margin = calculateMargin(prices.purchase, prices.retail);
  const marginInfo = formatMarginBadge(margin);

  useEffect(() => {
    const fetchUomList = async () => {
      const { data } = await supabase
        .from("uom")
        .select("id, code, description, is_active")
        .eq("is_active", true)
        .order("code");
      setUomList(data || []);
    };
    fetchUomList();
  }, []);

  return (
    <div className="space-y-4 border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          {t('products.form.prices')}
        </h3>
      </div>

      

      {/* Margin Display */}
      {prices.purchase > 0 && prices.retail > 0 && (
        <div className="p-3 bg-muted rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm">{t('productPrices.profitMargin')}</span>
            <Badge variant={marginInfo.variant as any}>{marginInfo.label}</Badge>
          </div>
          {margin < 10 && (
            <div className="mt-2 flex items-start gap-2 text-xs text-destructive">
              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>{t('productPrices.lowMarginWarning')}</span>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>{t('productPrices.currency')}</Label>
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
          <Label>{t('productPrices.vatRate')}</Label>
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
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Ruler className="w-3 h-3" />
            {t('uom.title')}
          </Label>
          <Select
            value={prices.uom_id || ""}
            onValueChange={(value) => onChange({ ...prices, uom_id: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('common.select')} />
            </SelectTrigger>
            <SelectContent>
              {uomList.map((uom) => (
                <SelectItem key={uom.id} value={uom.id}>
                  {uom.code} {uom.description ? `- ${uom.description}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <TrendingDown className="w-3 h-3 text-destructive" />
            {t('productPrices.purchasePrice')}
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
            {t('productPrices.retailPrice')}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('productPrices.wholesalePrice')}</Label>
          <Input
            type="number"
            step="0.01"
            value={prices.wholesale || ''}
            onChange={(e) => onChange({ ...prices, wholesale: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-2">
          <Label>{t('productPrices.distributorPrice')}</Label>
          <Input
            type="number"
            step="0.01"
            value={prices.distributor || ''}
            onChange={(e) => onChange({ ...prices, distributor: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
          />
        </div>
      </div>
    </div>
  );
}
