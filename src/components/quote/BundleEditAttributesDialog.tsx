import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Package, Check, ChevronsUpDown } from "lucide-react";
import LineAttributesDialog from "@/components/LineAttributesDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn, formatCurrency } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface BundleComponent {
  id?: string;
  product_id?: string | null;
  source_id?: string | null;
  type?: "product" | "service";
  product_name?: string;
  name?: string;
  sku?: string | null;
  quantity?: number;
  unit_price?: number;
  vat_rate?: number;
  choice_group_id?: string | null;
  selected_attributes?: Record<string, any>;
}

interface ChoiceOption {
  id: string;
  type: "product" | "service";
  source_id: string;
  name: string;
  sku: string | null;
  unit_price: number;
  vat_rate: number;
  choice_group_id: string;
  quantity: number;
}

interface BundleEditAttributesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bundleName: string;
  bundleId?: string | null;
  components: BundleComponent[];
  onSaveComponent: (componentIndex: number, attributes: Record<string, any>) => void;
  onReplaceWithChoiceOption?: (componentIndex: number, option: ChoiceOption) => void;
  onChangeComponentVat?: (componentIndex: number, vatRate: number | null) => void;
}

export function BundleEditAttributesDialog({
  open,
  onOpenChange,
  bundleName,
  bundleId,
  components,
  onSaveComponent,
  onReplaceWithChoiceOption,
  onChangeComponentVat,
}: BundleEditAttributesDialogProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [openCombobox, setOpenCombobox] = useState<number | null>(null);
  const [choiceOptionsByGroup, setChoiceOptionsByGroup] = useState<Record<string, ChoiceOption[]>>({});

  const editing = editingIdx !== null ? components[editingIdx] : null;
  const editingProductId = editing?.product_id || (editing?.type === "product" ? editing?.source_id : null);

  // Fetch choice group options for this bundle
  useEffect(() => {
    if (!open || !bundleId) return;
    const groupIds = Array.from(new Set(components.map(c => c.choice_group_id).filter(Boolean) as string[]));
    if (groupIds.length === 0) return;

    (async () => {
      const { data: comps } = await supabase
        .from("bundle_components")
        .select(`
          id, choice_group_id, quantity, product_id, service_id,
          products:product_id (id, name, sku, product_prices (price, vat_rate, price_type)),
          services:service_id (id, name, sku, service_prices (price, vat_rate, price_type))
        `)
        .eq("bundle_id", bundleId)
        .in("choice_group_id", groupIds);

      const byGroup: Record<string, ChoiceOption[]> = {};
      (comps || []).forEach((c: any) => {
        const gid = c.choice_group_id;
        if (!gid) return;
        const isProduct = !!c.products;
        const ent = c.products || c.services;
        if (!ent) return;
        const prices = c.products ? (c.products.product_prices || []) : (c.services.service_prices || []);
        const retail = prices.find((p: any) => p.price_type === "retail") || prices[0];
        const opt: ChoiceOption = {
          id: c.id,
          type: isProduct ? "product" : "service",
          source_id: ent.id,
          name: ent.name,
          sku: ent.sku ?? null,
          unit_price: Number(retail?.price ?? 0),
          vat_rate: Number(retail?.vat_rate ?? 23),
          choice_group_id: gid,
          quantity: Number(c.quantity ?? 1),
        };
        byGroup[gid] = byGroup[gid] || [];
        byGroup[gid].push(opt);
      });
      setChoiceOptionsByGroup(byGroup);
    })();
  }, [open, bundleId, components]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Editar bundle: {bundleName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Troque a opção escolhida ou edite os atributos de cada componente.
            </p>
            {components.length === 0 && (
              <p className="text-sm italic text-muted-foreground py-4 text-center">
                Este bundle não tem componentes configuráveis.
              </p>
            )}
            {components.map((c, idx) => {
              const filledCount = c.selected_attributes
                ? Object.values(c.selected_attributes).filter((a: any) => {
                    const v = a?.value ?? a?.option_label;
                    return v !== undefined && v !== null && v !== "";
                  }).length
                : 0;
              const componentProductId = c.product_id || (c.type === "product" ? c.source_id : null);
              const canEditAttrs = !!componentProductId;
              const groupId = c.choice_group_id;
              const groupOptions = groupId ? (choiceOptionsByGroup[groupId] || []) : [];
              const hasChoices = groupOptions.length > 1;
              const currentSourceId = c.source_id || c.product_id;

              return (
                <div key={idx} className="p-3 rounded-lg border space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{c.product_name || c.name || "Componente"}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {c.quantity != null && (
                          <span className="text-xs text-muted-foreground">QTD: {c.quantity}</span>
                        )}
                        {filledCount > 0 ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {filledCount} atributo{filledCount > 1 ? "s" : ""} preenchido{filledCount > 1 ? "s" : ""}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">Sem atributos</Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canEditAttrs}
                      onClick={() => setEditingIdx(idx)}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Atributos
                    </Button>
                  </div>

                  {hasChoices && onReplaceWithChoiceOption && (
                    <Popover open={openCombobox === idx} onOpenChange={(o) => setOpenCombobox(o ? idx : null)}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full justify-between font-normal text-xs">
                          <span className="truncate">Trocar opção do bundle…</span>
                          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-60" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[28rem] p-0 z-[700]" align="start">
                        <Command>
                          <CommandInput placeholder="Pesquisar componente..." />
                          <CommandList className="max-h-72 overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
                            <CommandEmpty>Sem opções disponíveis.</CommandEmpty>
                            <CommandGroup>
                              {groupOptions.map((opt) => {
                                const isSel = opt.source_id === currentSourceId;
                                const label = `${opt.name} ${opt.sku || ""} ${opt.unit_price}`;
                                return (
                                  <CommandItem
                                    key={opt.id}
                                    value={label}
                                    onSelect={() => {
                                      onReplaceWithChoiceOption(idx, opt);
                                      setOpenCombobox(null);
                                    }}
                                    className="gap-2 text-xs"
                                  >
                                    <Check className={cn("h-3.5 w-3.5 shrink-0", isSel ? "opacity-100" : "opacity-0")} />
                                    <span className="flex-1 truncate">{opt.name}</span>
                                    <span className="shrink-0 tabular-nums text-muted-foreground">{formatCurrency(opt.unit_price * opt.quantity)}</span>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                  {onChangeComponentVat && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">IVA (%)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={c.vat_rate ?? ""}
                        placeholder="23"
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") {
                            onChangeComponentVat(idx, null);
                          } else {
                            const num = Math.max(0, Math.min(100, Number(raw)));
                            onChangeComponentVat(idx, num);
                          }
                        }}
                        className="h-7 w-20 text-xs"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {editing && editingProductId && (
        <LineAttributesDialog
          open={editingIdx !== null}
          onOpenChange={(o) => { if (!o) setEditingIdx(null); }}
          productId={editingProductId}
          productName={editing.product_name || editing.name || "Componente"}
          currentAttributes={editing.selected_attributes || {}}
          onSave={(attributes) => {
            if (editingIdx !== null) {
              onSaveComponent(editingIdx, attributes);
              setEditingIdx(null);
            }
          }}
          priceContext="bundle"
        />
      )}
    </>
  );
}
