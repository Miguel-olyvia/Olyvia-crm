import { useState, useEffect } from "react";
import { z } from "zod";
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
import {
  MAX_PACK_QTY,
  effectivePackQtys,
  formatPackMoney,
  normalizePackQty,
  packPriceFromUnit,
  packUnitCostRounding,
} from "@/utils/products/productPacks";

export interface PriceFormData {
  purchase: number;
  retail: number;
  wholesale: number;
  distributor: number;
  currency: string;
  vat_rate: number;
  uom_id: string;
  /**
   * "Compra-se em N": quando N ≥ 2, `purchase` é o preço do PACK de N
   * unidades de stock (o custo unitário é purchase / N). Omisso = 1.
   */
  purchase_pack_qty?: number;
  /** "Vende-se em N": unidade de venda por omissão. `retail` é sempre unitário. Omisso = 1. */
  sale_pack_qty?: number;
}

interface UOM {
  id: string;
  code: string;
  description: string | null;
  is_active: boolean;
  base_uom_id: string | null;
}

interface ProductFormPricesProps {
  prices: PriceFormData;
  onChange: (prices: PriceFormData) => void;
  /**
   * Há fornecedor preferido (na criação: o fornecedor escolhido; na edição: a
   * ligação preferida ativa). Sem ele a compra em pack fica desativada.
   * Omisso = true (retrocompatível).
   */
  hasPreferredSupplier?: boolean;
  /**
   * O utilizador pode ver/alterar o custo da ligação ao fornecedor
   * (products.view_cost). Sem isso a compra em pack fica desativada. Omisso = true.
   */
  canEditPurchasePack?: boolean;
  /**
   * Os packs só se definem na empresa principal do produto. Quando a empresa
   * principal (seleção) ≠ empresa ativa, os dois campos ficam só de leitura com
   * as quantidades com que a ficha abriu, e mostra-se esta nota.
   */
  packsLockedNote?: string | null;
  /** Erros de validação vindos do submit (ex. quantidade do pack vazia). */
  submitErrors?: Record<string, string>;
}

// Validates the per-UOM pricing fields (financially sensitive business data).
// Ran on every change so the profit-margin calculation and the persisted
// prices are always derived from sane, non-negative values.
const productPricesSchema = z.object({
  purchase: z.number().min(0, "O preço de compra deve ser positivo").max(9999999, "O preço de compra é demasiado elevado"),
  retail: z.number().min(0, "O preço de venda deve ser positivo").max(9999999, "O preço de venda é demasiado elevado"),
  wholesale: z.number().min(0, "O preço grossista deve ser positivo").max(9999999, "O preço grossista é demasiado elevado"),
  distributor: z.number().min(0, "O preço de distribuidor deve ser positivo").max(9999999, "O preço de distribuidor é demasiado elevado"),
  currency: z.enum(["EUR", "USD", "GBP"], { errorMap: () => ({ message: "Moeda inválida" }) }),
  vat_rate: z.number().min(0, "A taxa de IVA deve ser pelo menos 0").max(100, "A taxa de IVA deve ser no máximo 100"),
  uom_id: z.string().trim().max(100).optional().or(z.literal("")),
  purchase_pack_qty: z.number().int("A quantidade deve ser um número inteiro").min(1, "Indique a quantidade (1 = à unidade)").max(MAX_PACK_QTY, "A quantidade é demasiado elevada").optional(),
  sale_pack_qty: z.number().int("A quantidade deve ser um número inteiro").min(1, "Indique a quantidade (1 = à unidade)").max(MAX_PACK_QTY, "A quantidade é demasiado elevada").optional(),
});

function calculateMargin(purchase: number, retail: number): number {
  if (!purchase || !retail || purchase <= 0) return 0;
  return ((retail - purchase) / retail) * 100;
}

function formatMarginBadge(margin: number): { label: string; variant: string } {
  if (margin < 10) return { label: `${margin.toFixed(1)}%`, variant: "destructive" };
  if (margin < 20) return { label: `${margin.toFixed(1)}%`, variant: "secondary" };
  return { label: `${margin.toFixed(1)}%`, variant: "default" };
}

export default function ProductFormPrices({
  prices,
  onChange,
  hasPreferredSupplier = true,
  canEditPurchasePack = true,
  packsLockedNote = null,
  submitErrors,
}: ProductFormPricesProps) {
  const { t } = useTranslation();
  const [uomList, setUomList] = useState<UOM[]>([]);
  const [localFieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Erros do submit só aparecem enquanto o campo não tiver erro "ao vivo".
  const fieldErrors: Record<string, string> = { ...(submitErrors || {}), ...localFieldErrors };

  // Packs: só existem sobre uma unidade de stock; a compra em pack precisa de
  // um fornecedor preferido (é lá que fica a unidade de compra e o preço do pack).
  const packsLocked = !!packsLockedNote;
  const hasStockUom = !!prices.uom_id;
  const stockUomCode = uomList.find((u) => u.id === prices.uom_id)?.code || "un";
  const purchasePackEnabled = !packsLocked && hasStockUom && hasPreferredSupplier && canEditPurchasePack;
  const salePackEnabled = !packsLocked && hasStockUom;
  const effective = effectivePackQtys({
    purchaseQty: prices.purchase_pack_qty,
    saleQty: prices.sale_pack_qty,
    hasStockUom,
    purchaseEnabled: purchasePackEnabled,
  });
  // Bloqueado (outra empresa principal): mantém-se a leitura com que a ficha
  // abriu — o preço de compra mostrado continua a ser o desse pack.
  const purchaseQty = packsLocked ? normalizePackQty(prices.purchase_pack_qty) : effective.purchaseQty;
  const saleQty = packsLocked ? normalizePackQty(prices.sale_pack_qty) : effective.saleQty;
  const purchaseDisabledNote = packsLocked
    ? null
    : !hasStockUom
      ? "Defina a unidade de stock"
      : !hasPreferredSupplier
        ? "Escolha um fornecedor"
        : !canEditPurchasePack
          ? "Sem permissão para alterar o custo do fornecedor"
          : null;
  const rounding = packUnitCostRounding(prices.purchase, purchaseQty);

  // A margem compara sempre valores unitários: custo = preço escrito / N.
  const unitPurchase = purchaseQty >= 2 ? (prices.purchase || 0) / purchaseQty : prices.purchase;
  const margin = calculateMargin(unitPurchase, prices.retail);
  const marginInfo = formatMarginBadge(margin);

  // Mostra-se o valor escrito; 0 = campo vazio (a validação do submit bloqueia).
  // Desativado => a quantidade efetiva (1, ou a que abriu se bloqueado).
  const packInputValue = (raw: number | undefined, enabled: boolean, effectiveQty: number): number | "" => {
    if (!enabled) return effectiveQty;
    if (raw === undefined) return 1;
    return raw === 0 ? "" : raw;
  };
  // Sem parseInt: "2.5" tem de chegar à validação (inteiro), não virar 2.
  const parsePackInput = (value: string): number => {
    if (value.trim() === "") return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  // Validates the next price state on every change and surfaces per-field
  // errors, while still propagating the value upward so typing behavior
  // (e.g. clearing a field to type a new value) is not interrupted.
  const handlePricesChange = (next: PriceFormData) => {
    const validation = productPricesSchema.safeParse(next);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.errors.forEach((err) => { if (err.path[0]) errors[err.path[0].toString()] = err.message; });
      setFieldErrors(errors);
    } else {
      setFieldErrors({});
    }
    onChange(next);
  };

  useEffect(() => {
    const fetchUomList = async () => {
      const { data } = await supabase
        .from("uom")
        .select("id, code, description, is_active, base_uom_id")
        .eq("is_active", true)
        .order("code");
      setUomList((data || []) as UOM[]);
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
      {unitPurchase > 0 && prices.retail > 0 && (
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
            onChange={(e) => handlePricesChange({ ...prices, currency: e.target.value })}
          >
            <option value="EUR">EUR (€)</option>
            <option value="USD">USD ($)</option>
            <option value="GBP">GBP (£)</option>
          </select>
          {fieldErrors.currency && <p className="text-xs text-destructive">{fieldErrors.currency}</p>}
        </div>
        <div className="space-y-2">
          <Label>{t('productPrices.vatRate')}</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={prices.vat_rate || ''}
            onChange={(e) => handlePricesChange({ ...prices, vat_rate: parseFloat(e.target.value) || 0 })}
            placeholder="23"
            className={fieldErrors.vat_rate ? "border-destructive" : ""}
          />
          {fieldErrors.vat_rate && <p className="text-xs text-destructive">{fieldErrors.vat_rate}</p>}
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Ruler className="w-3 h-3" />
            Unidade de stock
          </Label>
          <Select
            value={prices.uom_id || ""}
            onValueChange={(value) => handlePricesChange({ ...prices, uom_id: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('common.select')} />
            </SelectTrigger>
            <SelectContent>
              {/* Os packs (uoms com base) não são unidade de stock — escolhem-se
                  em "Compra-se em" / "Vende-se em". Mantém-se a uom já gravada
                  mesmo que seja um pack, para não esvaziar o seletor. */}
              {uomList.filter((uom) => !uom.base_uom_id || uom.id === prices.uom_id).map((uom) => (
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
            onChange={(e) => handlePricesChange({ ...prices, purchase: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
            className={fieldErrors.purchase ? "border-destructive" : ""}
          />
          {fieldErrors.purchase && <p className="text-xs text-destructive">{fieldErrors.purchase}</p>}
          <div className="flex items-center gap-2 text-sm">
            <Label htmlFor="purchase_pack_qty" className="font-normal text-muted-foreground whitespace-nowrap">
              Compra-se em:
            </Label>
            <Input
              id="purchase_pack_qty"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              className={`h-8 w-20 ${fieldErrors.purchase_pack_qty ? "border-destructive" : ""}`}
              disabled={!purchasePackEnabled}
              value={packInputValue(prices.purchase_pack_qty, purchasePackEnabled, purchaseQty)}
              onChange={(e) => handlePricesChange({ ...prices, purchase_pack_qty: parsePackInput(e.target.value) })}
              aria-describedby="purchase_pack_qty_hint"
              aria-invalid={!!fieldErrors.purchase_pack_qty}
            />
            <span className="text-muted-foreground">{stockUomCode}</span>
          </div>
          {(purchaseDisabledNote || purchaseQty >= 2) && (
            <p id="purchase_pack_qty_hint" className="text-xs text-muted-foreground">
              {purchaseDisabledNote
                ?? `= ${formatPackMoney(unitPurchase)} € / ${stockUomCode} (o preço acima é do pack de ${purchaseQty})`}
            </p>
          )}
          {rounding.warning && (
            <p className="text-xs text-amber-600 flex items-start gap-1" role="status">
              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>{rounding.warning}</span>
            </p>
          )}
          {fieldErrors.purchase_pack_qty && <p className="text-xs text-destructive">{fieldErrors.purchase_pack_qty}</p>}
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
            onChange={(e) => handlePricesChange({ ...prices, retail: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
            className={fieldErrors.retail ? "border-destructive" : ""}
          />
          {fieldErrors.retail && <p className="text-xs text-destructive">{fieldErrors.retail}</p>}
          <div className="flex items-center gap-2 text-sm">
            <Label htmlFor="sale_pack_qty" className="font-normal text-muted-foreground whitespace-nowrap">
              Vende-se em:
            </Label>
            <Input
              id="sale_pack_qty"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              className={`h-8 w-20 ${fieldErrors.sale_pack_qty ? "border-destructive" : ""}`}
              disabled={!salePackEnabled}
              value={packInputValue(prices.sale_pack_qty, salePackEnabled, saleQty)}
              onChange={(e) => handlePricesChange({ ...prices, sale_pack_qty: parsePackInput(e.target.value) })}
              aria-describedby="sale_pack_qty_hint"
              aria-invalid={!!fieldErrors.sale_pack_qty}
            />
            <span className="text-muted-foreground">{stockUomCode}</span>
          </div>
          {((!packsLocked && !hasStockUom) || saleQty >= 2) && (
            <p id="sale_pack_qty_hint" className="text-xs text-muted-foreground">
              {!packsLocked && !hasStockUom
                ? "Defina a unidade de stock"
                : `= ${formatPackMoney(packPriceFromUnit(prices.retail, saleQty))} € por pack de ${saleQty} (o preço acima é por ${stockUomCode})`}
            </p>
          )}
          {fieldErrors.sale_pack_qty && <p className="text-xs text-destructive">{fieldErrors.sale_pack_qty}</p>}
        </div>
      </div>
      {packsLockedNote && (
        <p className="text-xs text-muted-foreground" role="note">{packsLockedNote}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('productPrices.wholesalePrice')}</Label>
          <Input
            type="number"
            step="0.01"
            value={prices.wholesale || ''}
            onChange={(e) => handlePricesChange({ ...prices, wholesale: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
            className={fieldErrors.wholesale ? "border-destructive" : ""}
          />
          {fieldErrors.wholesale && <p className="text-xs text-destructive">{fieldErrors.wholesale}</p>}
        </div>
        <div className="space-y-2">
          <Label>{t('productPrices.distributorPrice')}</Label>
          <Input
            type="number"
            step="0.01"
            value={prices.distributor || ''}
            onChange={(e) => handlePricesChange({ ...prices, distributor: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
            className={fieldErrors.distributor ? "border-destructive" : ""}
          />
          {fieldErrors.distributor && <p className="text-xs text-destructive">{fieldErrors.distributor}</p>}
        </div>
      </div>
    </div>
  );
}
