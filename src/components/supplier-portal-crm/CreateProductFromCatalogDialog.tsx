import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { formatMoney, type CrmCatalogItem } from "./types";
import {
  BARCODE_MAX,
  DESCRIPTION_MAX,
  NAME_MAX,
  SKU_MAX,
  applyCatalogPriceOnLink,
  catalogCurrency,
  catalogUnitCost,
  createProductFromCatalog,
  linkPriceKeepsWrittenCost,
  findTakenSkus,
  loadCreateMeta,
  matchBrand,
  matchUom,
  normalizeSkuBase,
  parseMoneyInput,
  pickFreeSku,
  skuCandidates,
  validateName,
  validateSku,
  type CreateMeta,
  type CreateOutcome,
  type ProductStatus,
  type ProductTypeValue,
} from "./catalogProductCreate";

export interface CreatedProductInfo {
  productId: string;
  name: string;
  sku: string;
  barcode: string | null;
}

interface CreateProductFromCatalogDialogProps {
  item: CrmCatalogItem | null;
  supplierId: string;
  organizationId: string | null;
  canViewPricing: boolean;
  /** products.manage_prices: sem ela a ligação nunca usa o preço do catálogo. */
  canManagePrices?: boolean;
  onClose: () => void;
  /** Chamado quando o produto foi criado (ligado ou não). Erros ficam no diálogo. */
  onDone: (
    item: CrmCatalogItem,
    outcome: Exclude<CreateOutcome, { status: "error" }>,
    product: CreatedProductInfo,
  ) => void;
}

const STATUS_OPTIONS: { value: ProductStatus; label: string }[] = [
  { value: "active", label: "Ativo" },
  { value: "draft", label: "Rascunho" },
  { value: "discontinued", label: "Descontinuado" },
];

const TYPE_OPTIONS: { value: ProductTypeValue; label: string }[] = [
  { value: "both", label: "Compra e venda" },
  { value: "purchase", label: "Só compra" },
  { value: "sale", label: "Só venda" },
];

interface FormState {
  sku: string;
  name: string;
  description: string;
  barcode: string;
  brandId: string;
  categoryId: string;
  subcategoryId: string;
  uomId: string;
  status: ProductStatus;
  productType: ProductTypeValue;
  purchasePrice: string;
  salePrice: string;
  vatRate: string;
}

const priceText = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));

// Criar um produto novo a partir de um artigo "Por ligar" do catálogo do
// fornecedor, pré-preenchido com os dados do artigo, e ligá-lo logo a ele.
export default function CreateProductFromCatalogDialog({
  item,
  supplierId,
  organizationId,
  canViewPricing,
  canManagePrices = false,
  onClose,
  onDone,
}: CreateProductFromCatalogDialogProps) {
  const [meta, setMeta] = useState<CreateMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState | "general", string>>>({});
  const [saving, setSaving] = useState(false);
  const [skuTaken, setSkuTaken] = useState(false);

  // Cópia do artigo tirada ao abrir. Ao fechar, o pai passa item=null mas o
  // Radix mantém o conteúdo montado durante a animação de saída (e o form só
  // seria limpo no efeito seguinte): o render nunca pode depender do item vivo.
  const [shownItem, setShownItem] = useState<CrmCatalogItem | null>(item);
  const [prevItem, setPrevItem] = useState<CrmCatalogItem | null>(item);
  if (item !== prevItem) {
    setPrevItem(item);
    if (item) {
      // Abrir (ou reabrir, mesmo que seja o mesmo artigo): começa limpo.
      setShownItem(item);
      setForm(null);
      setErrors({});
      setSkuTaken(false);
    }
  }
  const current = item ?? shownItem;

  // Abrir com um artigo: carrega unidades/marcas/categorias e pré-preenche.
  // Ao fechar não se limpa nada (o conteúdo ainda está a desaparecer); a
  // reposição é feita acima, ao abrir.
  useEffect(() => {
    if (!item || !organizationId) return;
    let cancelled = false;
    (async () => {
      setPreparing(true);
      setErrors({});
      setSkuTaken(false);
      const { meta: m, error } = await loadCreateMeta(organizationId);
      const base = normalizeSkuBase(item.supplier_ref);
      const { taken } = await findTakenSkus(organizationId, skuCandidates(base));
      if (cancelled) return;
      setPreparing(false);
      setMeta(m);
      setMetaError(error);
      const uom = m ? matchUom(item, m.uoms) : null;
      const brand = m ? matchBrand(item.brand, m.brands) : null;
      const sku = base ? pickFreeSku(base, taken) : "";
      setSkuTaken(!!sku && taken.has(sku));
      setForm({
        sku,
        name: (item.name ?? "").slice(0, NAME_MAX),
        description: (item.description ?? "").slice(0, DESCRIPTION_MAX),
        barcode: (item.barcode ?? "").slice(0, BARCODE_MAX),
        brandId: brand?.id ?? "",
        categoryId: "",
        subcategoryId: "",
        uomId: uom?.id ?? "",
        status: "active",
        productType: "both",
        purchasePrice: canViewPricing ? priceText(catalogUnitCost(item)) : "",
        salePrice: "",
        vatRate: "23",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [item, organizationId, canViewPricing]);

  // Verificação do SKU enquanto se escreve (a gravação volta a verificar).
  const currentSku = form?.sku.trim() ?? "";
  useEffect(() => {
    if (!item) return;
    if (!organizationId || !currentSku) {
      setSkuTaken(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { taken, error } = await findTakenSkus(organizationId, [currentSku]);
      if (!cancelled && !error) setSkuTaken(taken.has(currentSku));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [currentSku, item, organizationId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setErrors((e) => ({ ...e, [key]: undefined, general: undefined }));
  };

  const topCategories = useMemo(() => (meta?.categories ?? []).filter((c) => !c.parent_id), [meta]);
  const subcategories = useMemo(
    () => (meta?.categories ?? []).filter((c) => form?.categoryId && c.parent_id === form.categoryId),
    [meta, form?.categoryId],
  );

  const isPack = (current?.units_per_pack ?? 0) > 1;
  const applyPrice = current ? applyCatalogPriceOnLink(current, canViewPricing, canManagePrices) : false;
  // O preço escrito é o do catálogo? Só então a ligação leva o preço (e grava
  // o mesmo custo); senão liga sem preço para não substituir o custo escrito.
  const writtenPurchase = form && canViewPricing ? parseMoneyInput(form.purchasePrice) : null;
  const linkTakesPrice =
    applyPrice && !!current && writtenPurchase != null && !Number.isNaN(writtenPurchase)
    && linkPriceKeepsWrittenCost(current, writtenPurchase);
  const unmatchedUnit = !!current && !!form && !form.uomId && !!current.unit_label && !isPack;

  const handleSave = async () => {
    // Só grava com o diálogo aberto (item vivo), mas usa a cópia tirada ao abrir.
    if (!item || !current || !form || !organizationId) return;
    const next: typeof errors = {};
    const skuErr = validateSku(form.sku);
    if (skuErr) next.sku = skuErr;
    else if (skuTaken) next.sku = `Já existe um produto com o SKU «${form.sku.trim()}» nesta empresa.`;
    const nameErr = validateName(form.name);
    if (nameErr) next.name = nameErr;
    if (form.description.trim().length > DESCRIPTION_MAX) next.description = `A descrição deve ter menos de ${DESCRIPTION_MAX} caracteres.`;
    if (form.barcode.trim().length > BARCODE_MAX) next.barcode = `O código de barras deve ter menos de ${BARCODE_MAX} caracteres.`;
    const purchase = canViewPricing ? parseMoneyInput(form.purchasePrice) : null;
    if (purchase != null && (Number.isNaN(purchase) || purchase < 0)) next.purchasePrice = "Preço inválido.";
    const sale = parseMoneyInput(form.salePrice);
    if (sale != null && (Number.isNaN(sale) || sale < 0)) next.salePrice = "Preço inválido.";
    const vat = parseMoneyInput(form.vatRate);
    if (vat == null || Number.isNaN(vat) || vat < 0 || vat > 100) next.vatRate = "IVA inválido (0 a 100).";
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    setSaving(true);
    const outcome = await createProductFromCatalog({
      organizationId,
      supplierId,
      item: current,
      sku: form.sku,
      name: form.name,
      description: form.description,
      barcode: form.barcode,
      brandId: form.brandId || null,
      categoryId: form.categoryId || null,
      subcategoryId: form.subcategoryId || null,
      uomId: form.uomId || null,
      status: form.status,
      productType: form.productType,
      purchasePrice: purchase,
      salePrice: sale,
      currency: catalogCurrency(current),
      vatRate: vat ?? 23,
      applyCatalogPrice: applyPrice,
    });
    setSaving(false);
    if (outcome.status === "error") {
      setErrors(outcome.field ? { [outcome.field]: outcome.message } : { general: outcome.message });
      if (outcome.field === "sku") setSkuTaken(true);
      return;
    }
    onDone(current, outcome, {
      productId: outcome.productId,
      name: form.name.trim(),
      sku: form.sku.trim(),
      barcode: form.barcode.trim() || null,
    });
  };

  const fieldError = (key: keyof FormState) =>
    errors[key] ? (
      <p id={`cpfc-${key}-error`} className="text-xs text-destructive">{errors[key]}</p>
    ) : null;

  const uomOptions = [
    { value: "", label: "Sem unidade" },
    ...(meta?.uoms ?? []).map((u) => ({ value: u.id, label: u.description ? `${u.code} — ${u.description}` : u.code })),
  ];

  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v && !saving) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar produto a partir do catálogo</DialogTitle>
          <DialogDescription>
            {current && (
              <>
                <span className="font-mono">{current.supplier_ref}</span> — {current.name}
                {canViewPricing && current.base_price != null ? ` · ${formatMoney(current.base_price, current.currency)}` : ""}
                {isPack ? ` · ${current.unit_label ?? "embalagem"} de ${current.units_per_pack}` : ""}
                . O produto é criado e fica logo ligado a este artigo.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {!organizationId ? (
          <p className="text-sm text-destructive">O fornecedor não tem empresa definida — não é possível criar produtos.</p>
        ) : preparing || !form || !current ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" aria-label="A preparar" /></div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); void handleSave(); }}
            noValidate
          >
            {metaError && (
              <p className="text-xs text-destructive">Não foi possível carregar unidades, marcas e categorias: {metaError}</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cpfc-sku">SKU *</Label>
                <Input
                  id="cpfc-sku"
                  value={form.sku}
                  maxLength={SKU_MAX}
                  onChange={(e) => set("sku", e.target.value)}
                  aria-invalid={!!errors.sku || skuTaken}
                  aria-describedby="cpfc-sku-hint"
                  className="font-mono"
                  required
                />
                {errors.sku ? (
                  <p id="cpfc-sku-hint" className="text-xs text-destructive">{errors.sku}</p>
                ) : skuTaken ? (
                  <p id="cpfc-sku-hint" className="text-xs text-destructive">Este SKU já existe nesta empresa.</p>
                ) : (
                  <p id="cpfc-sku-hint" className="text-xs text-muted-foreground">Sugerido a partir da ref. do fornecedor. Podes alterar.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cpfc-barcode">Código de barras</Label>
                <Input
                  id="cpfc-barcode"
                  value={form.barcode}
                  maxLength={BARCODE_MAX}
                  onChange={(e) => set("barcode", e.target.value)}
                  aria-invalid={!!errors.barcode}
                  aria-describedby={errors.barcode ? "cpfc-barcode-error" : undefined}
                />
                {fieldError("barcode")}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cpfc-name">Nome *</Label>
              <Input
                id="cpfc-name"
                value={form.name}
                maxLength={NAME_MAX}
                onChange={(e) => set("name", e.target.value)}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "cpfc-name-error" : undefined}
                required
              />
              {fieldError("name")}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cpfc-description">Descrição</Label>
              <Textarea
                id="cpfc-description"
                value={form.description}
                maxLength={DESCRIPTION_MAX}
                rows={3}
                onChange={(e) => set("description", e.target.value)}
              />
              {fieldError("description")}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cpfc-brand">Marca</Label>
                <NativeSelect
                  id="cpfc-brand"
                  value={form.brandId}
                  onValueChange={(v) => set("brandId", v)}
                  options={[{ value: "", label: "Sem marca" }, ...(meta?.brands ?? []).map((b) => ({ value: b.id, label: b.name }))]}
                />
                {current.brand && !form.brandId && (
                  <p className="text-xs text-muted-foreground">Marca do catálogo «{current.brand}» sem correspondência nas marcas da empresa.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cpfc-uom">Unidade</Label>
                <NativeSelect id="cpfc-uom" value={form.uomId} onValueChange={(v) => set("uomId", v)} options={uomOptions} />
                {isPack ? (
                  <p className="text-xs text-muted-foreground">
                    O fornecedor vende em {current.unit_label ?? "embalagem"} de {current.units_per_pack}: o produto conta-se à unidade.
                    A embalagem pode ser configurada depois na ficha do produto.
                  </p>
                ) : unmatchedUnit ? (
                  <p className="text-xs text-muted-foreground">Unidade do catálogo «{current.unit_label}» sem correspondência.</p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cpfc-category">Categoria</Label>
                <NativeSelect
                  id="cpfc-category"
                  value={form.categoryId}
                  onValueChange={(v) => { set("categoryId", v); set("subcategoryId", ""); }}
                  options={[{ value: "", label: "Sem categoria" }, ...topCategories.map((c) => ({ value: c.id, label: c.name }))]}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cpfc-subcategory">Subcategoria</Label>
                <NativeSelect
                  id="cpfc-subcategory"
                  value={form.subcategoryId}
                  onValueChange={(v) => set("subcategoryId", v)}
                  disabled={!form.categoryId || subcategories.length === 0}
                  options={[{ value: "", label: form.categoryId ? "Sem subcategoria" : "Escolhe primeiro a categoria" }, ...subcategories.map((c) => ({ value: c.id, label: c.name }))]}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cpfc-type">Tipo *</Label>
                <NativeSelect
                  id="cpfc-type"
                  value={form.productType}
                  onValueChange={(v) => set("productType", v as ProductTypeValue)}
                  options={TYPE_OPTIONS}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cpfc-status">Estado *</Label>
                <NativeSelect
                  id="cpfc-status"
                  value={form.status}
                  onValueChange={(v) => set("status", v as ProductStatus)}
                  options={STATUS_OPTIONS}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {canViewPricing && (
                <div className="space-y-1.5">
                  <Label htmlFor="cpfc-purchase">Preço de compra ({catalogCurrency(current)})</Label>
                  <Input
                    id="cpfc-purchase"
                    inputMode="decimal"
                    value={form.purchasePrice}
                    onChange={(e) => set("purchasePrice", e.target.value)}
                    aria-invalid={!!errors.purchasePrice}
                    aria-describedby={errors.purchasePrice ? "cpfc-purchasePrice-error" : "cpfc-purchase-hint"}
                  />
                  {errors.purchasePrice ? fieldError("purchasePrice") : (
                    <p id="cpfc-purchase-hint" className="text-xs text-muted-foreground">
                      {isPack ? "Por unidade (preço do catálogo ÷ embalagem)." : "Do catálogo do fornecedor."}
                    </p>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="cpfc-sale">Preço de venda</Label>
                <Input
                  id="cpfc-sale"
                  inputMode="decimal"
                  value={form.salePrice}
                  placeholder="Opcional"
                  onChange={(e) => set("salePrice", e.target.value)}
                  aria-invalid={!!errors.salePrice}
                  aria-describedby={errors.salePrice ? "cpfc-salePrice-error" : undefined}
                />
                {fieldError("salePrice")}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cpfc-vat">IVA (%)</Label>
                <Input
                  id="cpfc-vat"
                  inputMode="decimal"
                  value={form.vatRate}
                  onChange={(e) => set("vatRate", e.target.value)}
                  aria-invalid={!!errors.vatRate}
                  aria-describedby={errors.vatRate ? "cpfc-vatRate-error" : undefined}
                />
                {fieldError("vatRate")}
              </div>
            </div>
            {canViewPricing && isPack && (
              <p className="text-xs text-muted-foreground">
                Artigo vendido em embalagem: a ligação ao fornecedor fica sem preço de compra (o preço do catálogo é da embalagem).
              </p>
            )}
            {canViewPricing && !isPack && current.base_price != null && (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {!canManagePrices
                  ? "Sem permissão para gerir preços: a ligação ao fornecedor fica sem preço; o custo do produto é o preço de compra acima."
                  : linkTakesPrice
                    ? `A ligação ao fornecedor fica com o preço do catálogo (${formatMoney(current.base_price, current.currency)}), igual ao custo do produto.`
                    : "O preço de compra é diferente do catálogo: a ligação ao fornecedor fica sem preço, para não mudar o custo que escreveste."}
              </p>
            )}

            {errors.general && <p className="text-sm text-destructive" role="alert">{errors.general}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Criar e ligar
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
