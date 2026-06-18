import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ColumnOrderList } from "./ColumnOrderList";

export type QuoteItemsColumnKey = "description" | "quantity" | "unit" | "price" | "total";

export const DEFAULT_QUOTE_ITEMS_COLUMN_ORDER: QuoteItemsColumnKey[] = [
  "description", "quantity", "unit", "price", "total",
];

export type QuoteItemsChipConfig = {
  source: "quote_items";
  title: string;
  columnOrder?: QuoteItemsColumnKey[];
  showQuantity: boolean;
  showUnit: boolean;
  showPrice: boolean;
  showTotal: boolean;
  showTotalsRow: boolean;
  // Filtros por tipo de item (default: todos true)
  showProducts?: boolean;
  showServices?: boolean;
  showBundles?: boolean;
  showManual?: boolean;
  // Mostrar componentes do bundle (default: false)
  showBundleComponents?: boolean;
  // Optional inline colors (mirrors doc_settings, used to render mini-preview in chip)
  headerBg?: string | null;
  headerColor?: string | null;
  zebra?: boolean;
  zebraColor?: string | null;
  borderColor?: string | null;
};

export type SignatoriesChipConfig = {
  source: "signatories";
  title: string;
  showName: boolean;
  showEmail: boolean;
  showRole: boolean;
  showOrder: boolean;
};

export type DataTableChipConfig = QuoteItemsChipConfig | SignatoriesChipConfig;

export const DEFAULT_QUOTE_ITEMS_CONFIG: QuoteItemsChipConfig = {
  source: "quote_items",
  title: "Artigos do Orçamento",
  columnOrder: [...DEFAULT_QUOTE_ITEMS_COLUMN_ORDER],
  showQuantity: true,
  showUnit: true,
  showPrice: true,
  showTotal: true,
  showTotalsRow: true,
  showProducts: true,
  showServices: true,
  showBundles: true,
  showManual: true,
  showBundleComponents: false,
};

export const DEFAULT_SIGNATORIES_CONFIG: SignatoriesChipConfig = {
  source: "signatories",
  title: "Signatários",
  showName: true,
  showEmail: true,
  showRole: true,
  showOrder: false,
};

const COLUMN_LABELS: Record<QuoteItemsColumnKey, string> = {
  description: "Descrição",
  quantity: "Qtd",
  unit: "Un.",
  price: "Preço Unit.",
  total: "Total",
};

const SHOW_KEY: Record<Exclude<QuoteItemsColumnKey, "description">, keyof QuoteItemsChipConfig> = {
  quantity: "showQuantity",
  unit: "showUnit",
  price: "showPrice",
  total: "showTotal",
};

export function normalizeColumnOrder(order?: QuoteItemsColumnKey[]): QuoteItemsColumnKey[] {
  const valid: QuoteItemsColumnKey[] = ["description", "quantity", "unit", "price", "total"];
  const seen = new Set<QuoteItemsColumnKey>();
  const out: QuoteItemsColumnKey[] = [];
  (order || []).forEach(k => {
    if (valid.includes(k) && !seen.has(k)) { seen.add(k); out.push(k); }
  });
  // Append any missing in default order; ensure description present.
  valid.forEach(k => { if (!seen.has(k)) out.push(k); });
  // Ensure description exists
  if (!out.includes("description")) out.unshift("description");
  return out;
}

interface Props<T extends DataTableChipConfig> {
  initial: T;
  onInsert: (config: T) => void;
  onCancel?: () => void;
  insertLabel?: string;
}

export function DataTableConfigForm<T extends DataTableChipConfig>({
  initial,
  onInsert,
  onCancel,
  insertLabel = "Inserir",
}: Props<T>) {
  const [cfg, setCfg] = useState<T>(() => {
    if (initial.source === "quote_items") {
      const q = initial as unknown as QuoteItemsChipConfig;
      return { ...q, columnOrder: normalizeColumnOrder(q.columnOrder) } as unknown as T;
    }
    return initial;
  });

  const set = <K extends keyof T>(k: K, v: T[K]) =>
    setCfg(prev => ({ ...prev, [k]: v }));

  if (cfg.source === "quote_items") {
    const q = cfg as unknown as QuoteItemsChipConfig;
    const order = normalizeColumnOrder(q.columnOrder);
    const isShown = (k: QuoteItemsColumnKey) =>
      k === "description" ? true : (q as any)[SHOW_KEY[k as Exclude<QuoteItemsColumnKey, "description">]] !== false;

    const move = (idx: number, dir: -1 | 1) => {
      const next = [...order];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return;
      [next[idx], next[j]] = [next[j], next[idx]];
      set("columnOrder" as keyof T, next as any);
    };
    const toggle = (k: Exclude<QuoteItemsColumnKey, "description">, v: boolean) => {
      set(SHOW_KEY[k] as keyof T, v as any);
    };

    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Título da tabela</Label>
          <Input
            value={(cfg as any).title}
            onChange={e => set("title" as keyof T, e.target.value as any)}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Colunas (arraste para reordenar)</Label>
          <ColumnOrderList
            order={order}
            isShown={isShown}
            onReorder={(next) => set("columnOrder" as keyof T, next as any)}
            onToggle={(k, v) => {
              if (k === "description") return;
              toggle(k as Exclude<QuoteItemsColumnKey, "description">, v);
            }}
          />
        </div>

        <div className="space-y-2 rounded border p-2">
          <Label className="text-xs font-medium">Tipos de item a mostrar</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { key: "showProducts", label: "Produtos" },
              { key: "showServices", label: "Serviços" },
              { key: "showBundles", label: "Bundles" },
              { key: "showManual", label: "Manuais" },
            ].map(opt => (
              <label key={opt.key} className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={(cfg as any)[opt.key] !== false}
                  onCheckedChange={v => set(opt.key as keyof T, (v === true) as any)}
                />
                {opt.label}
              </label>
            ))}
          </div>
          {(cfg as any).showBundles !== false && (
            <div className="flex items-center justify-between pt-1.5 border-t">
              <Label className="text-xs cursor-pointer">Mostrar componentes do bundle</Label>
              <Switch
                checked={(cfg as any).showBundleComponents === true}
                onCheckedChange={v => set("showBundleComponents" as keyof T, v as any)}
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded border p-2">
          <Label className="text-xs cursor-pointer">Mostrar linha de totais</Label>
          <Switch
            checked={(cfg as any).showTotalsRow === true}
            onCheckedChange={v => set("showTotalsRow" as keyof T, v as any)}
          />
        </div>


        <div className="flex justify-end gap-2 pt-1">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
          )}
          <Button type="button" size="sm" onClick={() => onInsert(cfg)}>{insertLabel}</Button>
        </div>
      </div>
    );
  }

  // Signatories
  const columns = [
    { key: "showOrder" as keyof T, label: "Ordem" },
    { key: "showName"  as keyof T, label: "Nome" },
    { key: "showRole"  as keyof T, label: "Papel" },
    { key: "showEmail" as keyof T, label: "Email" },
  ];

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Título da tabela</Label>
        <Input
          value={(cfg as any).title}
          onChange={e => set("title" as keyof T, e.target.value as any)}
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Colunas</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {columns.map(opt => (
            <label key={String(opt.key)} className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={(cfg as any)[opt.key] === true}
                onCheckedChange={v => set(opt.key, (v === true) as any)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        )}
        <Button type="button" size="sm" onClick={() => onInsert(cfg)}>{insertLabel}</Button>
      </div>
    </div>
  );
}
