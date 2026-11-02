import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  spCatalogCategorias,
  spCatalogClassificarItem,
  spCatalogUpsertItem,
  spErrorMessage,
  isNoSupplierAccess,
  type SpCatalogItem,
  type SpCatalogRowInput,
  type SpCategoria,
} from "@/lib/supplierPortal/spRpc";
import { skuPrevisto } from "@/lib/supplierPortal/skuPortal";
import { CORES, corCanonica, UNIDADES } from "@/lib/supplierPortal/listasArtigo";
import { UNIDADES_SERVICO, kindOf, useDistritos, type ItemKind } from "@/lib/supplierPortal/servicoCatalogo";

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
  // 29/10: a classificação que dá o SKU (categoria-subcategoria-medida-cor)
  categoria_id: string;
  subcategoria_id: string;
  medida: string;
  cor: string;
  // Fase 5: produto | serviço (subempreitada)
  item_kind: ItemKind;
  service_districts: string[];
  mobilization_days: string;
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
    categoria_id: item?.categoria_id ?? "",
    subcategoria_id: item?.subcategoria_id ?? "",
    medida: item?.medida ?? "",
    cor: item?.cor ?? "",
    item_kind: item ? kindOf(item) : "produto",
    service_districts: item?.service_districts ?? [],
    mobilization_days: item?.mobilization_days === null || item?.mobilization_days === undefined ? "" : String(item.mobilization_days),
  };
}

const SELECT = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50";

const TEXT_FIELDS = [
  "supplier_ref", "name", "barcode", "brand", "description", "unit_label",
  "units_per_pack", "base_price", "currency", "moq", "lead_time_days",
] as const;

// Serviço: sem código de barras, marca, embalagem, mínimo nem prazo de entrega (tem prazo de mobilização).
const SERVICE_TEXT_FIELDS = ["supplier_ref", "name", "description", "unit_label", "base_price", "currency", "mobilization_days"] as const;

/** Criar/editar um artigo (sp_catalog_upsert_item). Só para o owner. */
export function SupplierCatalogItemDialog({ open, item, onOpenChange, onSaved, onNoAccess }: SupplierCatalogItemDialogProps) {
  const [form, setForm] = useState<FormState>(() => toForm(item));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!item;
  // null: a lista ainda não veio ou a base não a tem (migration por aplicar): o formulário fica como antes, sem SKU
  const [categorias, setCategorias] = useState<SpCategoria[] | null>(null);

  useEffect(() => {
    if (open) {
      setForm(toForm(item));
      setError(null);
    }
  }, [open, item]);
  useEffect(() => {
    if (!open || categorias) return;
    let vivo = true;
    spCatalogCategorias().then((c) => { if (vivo) setCategorias(c.length ? c : null); }).catch(() => { /* sem a lista, sem SKU */ });
    return () => { vivo = false; };
  }, [open, categorias]);

  const categoria = categorias?.find((c) => c.id === form.categoria_id);
  const subcategoria = categoria?.subcategorias.find((s) => s.id === form.subcategoria_id);
  const skuVisto = skuPrevisto(categoria?.codigo, subcategoria?.codigo, form.medida, form.cor, item?.sku,
    !!item && item.categoria_id === form.categoria_id && (item.subcategoria_id ?? null) === (form.subcategoria_id || null));

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const isService = form.item_kind === "servico";
  const unidades = isService ? UNIDADES_SERVICO : UNIDADES;
  const { distritos, erro: distritosErro } = useDistritos(open && isService);

  // Mudar o tipo: a unidade só fica se existir na lista do outro tipo.
  const setKind = (kind: ItemKind) =>
    setForm((f) => {
      if (f.item_kind === kind) return f;
      const lista = kind === "servico" ? UNIDADES_SERVICO : UNIDADES;
      return { ...f, item_kind: kind, unit_label: lista.some(([v]) => v === f.unit_label) ? f.unit_label : "" };
    });
  const toggleDistrito = (code: string, on: boolean) =>
    setForm((f) => ({
      ...f,
      service_districts: on ? [...new Set([...f.service_districts, code])] : f.service_districts.filter((c) => c !== code),
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.supplier_ref.trim() || !form.name.trim()) {
      setError("A referência e o nome são obrigatórios.");
      return;
    }
    if (isService) {
      if (!form.unit_label) {
        setError("Escolha a unidade do serviço.");
        return;
      }
      if (form.service_districts.length === 0) {
        setError("Escolha pelo menos um distrito na zona de atuação.");
        return;
      }
    } else {
      if (categorias && !categoria) {
        setError("Escolha a categoria. O SKU faz-se com ela.");
        return;
      }
      if (categorias && categoria && categoria.subcategorias.length && !subcategoria) {
        setError("Escolha a subcategoria. O SKU faz-se com ela.");
        return;
      }
    }

    // Editar: envia todas as chaves (vazio = limpar). Criar: só as preenchidas.
    const payload: SpCatalogRowInput & { id?: string } = { item_kind: form.item_kind };
    for (const k of isService ? SERVICE_TEXT_FIELDS : TEXT_FIELDS) {
      const v = form[k].trim();
      if (isEdit || v !== "") payload[k] = v;
    }
    if (isService) payload.service_districts = form.service_districts;
    if (isEdit) {
      payload.id = item!.id;
      payload.is_active = form.is_active;
    }

    setSaving(true);
    try {
      const res = await spCatalogUpsertItem(payload);
      let saved = res.item;
      // 29/10: a classificação grava-se a seguir; a base gera o SKU e devolve o artigo com ele
      if (!isService && categorias && categoria) {
        try {
          saved = (await spCatalogClassificarItem(saved.id, {
            categoria_id: categoria.id, subcategoria_id: subcategoria?.id ?? null, medida: form.medida.trim(), cor: form.cor.trim(),
          })).item;
        } catch (err) {
          if (isNoSupplierAccess(err)) { onNoAccess(); return; }
          // o artigo ficou gravado; falta a classificação
          setError(`O artigo foi gravado, mas a categoria não: ${spErrorMessage(err)}`);
          onSaved(saved, res.created);
          return;
        }
      }
      onSaved(saved, res.created);
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
          <DialogTitle>{isEdit ? (isService ? "Editar serviço" : "Editar artigo") : isService ? "Novo serviço" : "Novo artigo"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Altere os dados do artigo. Campos vazios ficam sem valor."
              : isService
                ? "Preencha a referência, o nome, a unidade e a zona de atuação."
                : "Preencha pelo menos a referência e o nome."}
          </DialogDescription>
        </DialogHeader>

        <form id="sp-item-form" onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label id="sp-kind-label">Tipo</Label>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="sp-kind-label">
              {(["produto", "servico"] as const).map((k) => (
                <Button key={k} type="button" role="radio" aria-checked={form.item_kind === k} className="h-11"
                  variant={form.item_kind === k ? "default" : "outline"} onClick={() => setKind(k)}>
                  {k === "produto" ? "Produto" : "Serviço"}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {isService ? "Mão de obra ou subempreitada (ex.: eletricista, canalizador)." : "Material que vende e entrega."}
            </p>
          </div>
          <Field id="sp-ref" label="Referência *">
            <Input id="sp-ref" className="h-11" maxLength={100} value={form.supplier_ref}
              onChange={(e) => set("supplier_ref", e.target.value)} required autoComplete="off" />
          </Field>
          {isService ? (
            <div className="hidden sm:block" aria-hidden="true" />
          ) : (
            <Field id="sp-barcode" label="Código de barras" hint="8 a 14 dígitos">
              <Input id="sp-barcode" className="h-11" inputMode="numeric" maxLength={20} value={form.barcode}
                onChange={(e) => set("barcode", e.target.value)} autoComplete="off" />
            </Field>
          )}
          <Field id="sp-name" label="Nome *" className="sm:col-span-2">
            <Input id="sp-name" className="h-11" maxLength={300} value={form.name}
              onChange={(e) => set("name", e.target.value)} required />
          </Field>
          <Field id="sp-desc" label="Descrição" className="sm:col-span-2">
            <Textarea id="sp-desc" rows={3} maxLength={2000} value={form.description}
              onChange={(e) => set("description", e.target.value)} />
          </Field>
          {!isService && (
            <Field id="sp-brand" label="Marca">
              <Input id="sp-brand" className="h-11" maxLength={100} value={form.brand}
                onChange={(e) => set("brand", e.target.value)} />
            </Field>
          )}
          <Field id="sp-unit" label={isService ? "Unidade *" : "Unidade"}>
            <select id="sp-unit" className={SELECT} value={form.unit_label}
              onChange={(e) => set("unit_label", e.target.value)}>
              <option value="">Escolha a unidade</option>
              {form.unit_label && !unidades.some(([v]) => v === form.unit_label) && <option value={form.unit_label}>{form.unit_label}</option>}
              {unidades.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </Field>
          {isService ? (
            <Field id="sp-mob" label="Prazo de mobilização (dias)" hint="Dias até poder começar a obra">
              <Input id="sp-mob" className="h-11" inputMode="numeric" value={form.mobilization_days}
                onChange={(e) => set("mobilization_days", e.target.value)} />
            </Field>
          ) : (
            <Field id="sp-upp" label="Unidades por embalagem">
              <Input id="sp-upp" className="h-11" inputMode="decimal" value={form.units_per_pack}
                onChange={(e) => set("units_per_pack", e.target.value)} />
            </Field>
          )}
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
          {isService && (
            <fieldset className="sm:col-span-2 space-y-1.5">
              <legend className="text-sm font-medium leading-none">Zona de atuação *</legend>
              <p className="text-xs text-muted-foreground">Os distritos onde faz este serviço.</p>
              {distritosErro ? (
                <p className="text-sm text-destructive">{distritosErro}</p>
              ) : !distritos ? (
                <p className="text-sm text-muted-foreground">A carregar os distritos…</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-9"
                      onClick={() => set("service_districts", distritos.map((d) => d.code))}>
                      Todos
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-9" disabled={form.service_districts.length === 0}
                      onClick={() => set("service_districts", [])}>
                      Limpar
                    </Button>
                    <span className="text-xs text-muted-foreground self-center">{form.service_districts.length} escolhido(s)</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 rounded-md border p-3 max-h-56 overflow-y-auto">
                    {distritos.map((d) => (
                      <label key={d.code} className="flex items-center gap-2 min-h-9 text-sm cursor-pointer">
                        <Checkbox checked={form.service_districts.includes(d.code)}
                          onCheckedChange={(v) => toggleDistrito(d.code, v === true)} aria-label={d.name} />
                        {d.name}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </fieldset>
          )}
          {!isService && (
            <>
              <Field id="sp-moq" label="Quantidade mínima">
                <Input id="sp-moq" className="h-11" inputMode="decimal" value={form.moq}
                  onChange={(e) => set("moq", e.target.value)} />
              </Field>
              <Field id="sp-lead" label="Prazo de entrega (dias)">
                <Input id="sp-lead" className="h-11" inputMode="numeric" value={form.lead_time_days}
                  onChange={(e) => set("lead_time_days", e.target.value)} />
              </Field>
            </>
          )}
          {categorias && !isService && (
            <>
              <Field id="sp-cat" label="Categoria *">
                <select id="sp-cat" className={SELECT} value={form.categoria_id}
                  onChange={(e) => setForm((f) => ({ ...f, categoria_id: e.target.value, subcategoria_id: "" }))}>
                  <option value="">Escolha a categoria</option>
                  {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Field>
              <Field id="sp-subcat" label={categoria?.subcategorias.length ? "Subcategoria *" : "Subcategoria"}>
                <select id="sp-subcat" className={SELECT} value={form.subcategoria_id} disabled={!categoria?.subcategorias.length}
                  onChange={(e) => set("subcategoria_id", e.target.value)}>
                  <option value="">{categoria && !categoria.subcategorias.length ? "Esta categoria não tem" : "Escolha a subcategoria"}</option>
                  {categoria?.subcategorias.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </Field>
              <Field id="sp-medida" label="Medida" hint="ex.: 30x60, 80x120, 1,5">
                <Input id="sp-medida" className="h-11" maxLength={40} value={form.medida}
                  onChange={(e) => set("medida", e.target.value)} autoComplete="off" />
              </Field>
              <Field id="sp-cor" label="Cor" hint="Escolha da lista ou escreva uma cor nova">
                <Input id="sp-cor" className="h-11" maxLength={40} value={form.cor} list="sp-cores"
                  onChange={(e) => set("cor", e.target.value)} onBlur={() => set("cor", corCanonica(form.cor))} autoComplete="off" />
                <datalist id="sp-cores">{CORES.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <div className="sm:col-span-2 rounded-md border bg-muted/40 p-3" aria-live="polite">
                <p className="text-sm text-muted-foreground">SKU</p>
                <p className="font-mono text-base">
                  {skuVisto ?? "Escolha a categoria"}
                </p>
                <p className="text-xs text-muted-foreground">Gera-se ao gravar. O número de 4 algarismos é o seguinte desta subcategoria.</p>
              </div>
            </>
          )}
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
