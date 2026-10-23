import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  spCatalogUpsertItem,
  spErrorMessage,
  isNoSupplierAccess,
  type SpCatalogItem,
  type SpCatalogRowInput,
} from "@/lib/supplierPortal/spRpc";

interface SupplierCatalogItemDialogProps {
  open: boolean;
  /** null = criar artigo novo. */
  item: SpCatalogItem | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (item: SpCatalogItem, created: boolean) => void;
  onNoAccess: () => void;
}

interface FormState {
  supplier_ref: string;
  name: string;
  barcode: string;
  brand: string;
  description: string;
  unit_label: string;
  units_per_pack: string;
  base_price: string;
  currency: string;
  moq: string;
  lead_time_days: string;
  is_active: boolean;
}

const numToText = (n: number | null | undefined): string =>
  n === null || n === undefined ? "" : String(n).replace(".", ",");

function toForm(item: SpCatalogItem | null): FormState {
  return {
    supplier_ref: item?.supplier_ref ?? "",
    name: item?.name ?? "",
    barcode: item?.barcode ?? "",
    brand: item?.brand ?? "",
    description: item?.description ?? "",
    unit_label: item?.unit_label ?? "",
    units_per_pack: numToText(item?.units_per_pack),
    base_price: numToText(item?.base_price),
    currency: item?.currency ?? "EUR",
    moq: numToText(item?.moq),
    lead_time_days: item?.lead_time_days === null || item?.lead_time_days === undefined ? "" : String(item.lead_time_days),
    is_active: item?.is_active ?? true,
  };
}

const TEXT_FIELDS = [
  "supplier_ref", "name", "barcode", "brand", "description", "unit_label",
  "units_per_pack", "base_price", "currency", "moq", "lead_time_days",
] as const;

/** Criar/editar um artigo (sp_catalog_upsert_item). Só para o owner. */
export function SupplierCatalogItemDialog({ open, item, onOpenChange, onSaved, onNoAccess }: SupplierCatalogItemDialogProps) {
  const [form, setForm] = useState<FormState>(() => toForm(item));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!item;

  useEffect(() => {
    if (open) {
      setForm(toForm(item));
      setError(null);
    }
  }, [open, item]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.supplier_ref.trim() || !form.name.trim()) {
      setError("A referência e o nome são obrigatórios.");
      return;
    }

    // Editar: envia todas as chaves (vazio = limpar). Criar: só as preenchidas.
    const payload: SpCatalogRowInput & { id?: string } = {};
    for (const k of TEXT_FIELDS) {
      const v = form[k].trim();
      if (isEdit || v !== "") payload[k] = v;
    }
    if (isEdit) {
      payload.id = item!.id;
      payload.is_active = form.is_active;
    }

    setSaving(true);
    try {
      const res = await spCatalogUpsertItem(payload);
      onSaved(res.item, res.created);
    } catch (err) {
      if (isNoSupplierAccess(err)) {
        onNoAccess();
        return;
      }
      setError(spErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar artigo" : "Novo artigo"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Altere os dados do artigo. Campos vazios ficam sem valor." : "Preencha pelo menos a referência e o nome."}
          </DialogDescription>
        </DialogHeader>

        <form id="sp-item-form" onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <Field id="sp-ref" label="Referência *">
            <Input id="sp-ref" className="h-11" maxLength={100} value={form.supplier_ref}
              onChange={(e) => set("supplier_ref", e.target.value)} required autoComplete="off" />
          </Field>
          <Field id="sp-barcode" label="Código de barras" hint="8 a 14 dígitos">
            <Input id="sp-barcode" className="h-11" inputMode="numeric" maxLength={20} value={form.barcode}
              onChange={(e) => set("barcode", e.target.value)} autoComplete="off" />
          </Field>
          <Field id="sp-name" label="Nome *" className="sm:col-span-2">
            <Input id="sp-name" className="h-11" maxLength={300} value={form.name}
              onChange={(e) => set("name", e.target.value)} required />
          </Field>
          <Field id="sp-desc" label="Descrição" className="sm:col-span-2">
            <Textarea id="sp-desc" rows={3} maxLength={2000} value={form.description}
              onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field id="sp-brand" label="Marca">
            <Input id="sp-brand" className="h-11" maxLength={100} value={form.brand}
              onChange={(e) => set("brand", e.target.value)} />
          </Field>
          <Field id="sp-unit" label="Unidade" hint="ex.: un, cx, m, kg">
            <Input id="sp-unit" className="h-11" maxLength={30} value={form.unit_label}
              onChange={(e) => set("unit_label", e.target.value)} />
          </Field>
          <Field id="sp-upp" label="Unidades por embalagem">
            <Input id="sp-upp" className="h-11" inputMode="decimal" value={form.units_per_pack}
              onChange={(e) => set("units_per_pack", e.target.value)} />
          </Field>
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <Field id="sp-price" label="Preço (sem IVA)">
              <Input id="sp-price" className="h-11" inputMode="decimal" value={form.base_price}
                onChange={(e) => set("base_price", e.target.value)} />
            </Field>
            <Field id="sp-currency" label="Moeda">
              <Input id="sp-currency" className="h-11 uppercase" maxLength={3} value={form.currency}
                onChange={(e) => set("currency", e.target.value.toUpperCase())} />
            </Field>
          </div>
          <Field id="sp-moq" label="Quantidade mínima">
            <Input id="sp-moq" className="h-11" inputMode="decimal" value={form.moq}
              onChange={(e) => set("moq", e.target.value)} />
          </Field>
          <Field id="sp-lead" label="Prazo de entrega (dias)">
            <Input id="sp-lead" className="h-11" inputMode="numeric" value={form.lead_time_days}
              onChange={(e) => set("lead_time_days", e.target.value)} />
          </Field>
          {isEdit && (
            <div className="sm:col-span-2 flex items-center justify-between rounded-md border p-3 min-h-11">
              <Label htmlFor="sp-active" className="cursor-pointer">Artigo ativo</Label>
              <Switch id="sp-active" checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
            </div>
          )}
        </form>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="sp-item-form" className="h-11" disabled={saving}>
            {saving ? "A guardar..." : isEdit ? "Guardar alterações" : "Criar artigo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ id, label, hint, className, children }: {
  id: string;
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className ? `space-y-1.5 ${className}` : "space-y-1.5"}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
