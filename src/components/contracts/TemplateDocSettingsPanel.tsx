import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp } from "lucide-react";
import { DocumentHeaderSettings } from "./DocumentHeaderSettings";
import { DocumentFooterSettings } from "./DocumentFooterSettings";
import { DocumentPageSettings } from "./DocumentPageSettings";
import { StylePresetsSelector } from "./StylePresetsSelector";
import {
  DEFAULT_QUOTE_ITEMS_COLUMN_ORDER,
  normalizeColumnOrder,
  type QuoteItemsColumnKey,
} from "./DataTableConfigForm";
import { ColumnOrderList } from "./ColumnOrderList";
import { ManualTablesSection } from "./ManualTablesSection";
import type { DocumentSettings } from "@/hooks/useDocumentSettings";

export type TemplateDocSettings = Partial<DocumentSettings> & {
  show_quote_items?: boolean;
  quote_items_title?: string | null;
  quote_items_description_only?: boolean;
  quote_items_show_quantity?: boolean;
  quote_items_show_unit?: boolean;
  quote_items_show_price?: boolean;
  quote_items_show_total?: boolean;
  quote_items_column_order?: QuoteItemsColumnKey[];
  // Table colors (apply to all data tables in the contract)
  table_header_color?: string | null;
  table_header_text_color?: string | null;
  table_zebra?: boolean;
  table_zebra_color?: string | null;
  table_border_color?: string | null;
};

interface Props {
  orgName?: string;
  value: TemplateDocSettings;
  onChange: (next: TemplateDocSettings) => void;
  bodyHtml?: string;
  onBodyHtmlChange?: (next: string) => void;
}

const COLUMN_LABELS: Record<QuoteItemsColumnKey, string> = {
  description: "Descrição",
  quantity: "Qtd",
  unit: "Un.",
  price: "Preço Unit.",
  total: "Total",
};

export function TemplateDocSettingsPanel({ orgName, value, onChange, bodyHtml, onBodyHtmlChange }: Props) {
  const merged = {
    logo_url: null,
    primary_color: "#7C3AED",
    font_family: "Arial",
    header_layout: "left" as const,
    show_nif: true,
    show_address: true,
    show_phone: true,
    show_email: true,
    show_website: false,
    footer_text: null,
    show_footer: true,
    show_page_numbers: true,
    margin_top: 20,
    margin_bottom: 20,
    margin_left: 20,
    margin_right: 20,
    page_size: "A4",
    page_orientation: "portrait",
    header_show_separator: true,
    company_name_override: null,
    company_website: null,
    organization_id: "",
    ...value,
  } as DocumentSettings;

  const handleChange = (overrides: Partial<DocumentSettings>) => {
    onChange({ ...value, ...overrides });
  };

  const primary = merged.primary_color || "#7C3AED";
  const order = normalizeColumnOrder(value.quote_items_column_order);
  const moveCol = (idx: number, dir: -1 | 1) => {
    const next = [...order];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange({ ...value, quote_items_column_order: next });
  };

  const isShown = (k: QuoteItemsColumnKey): boolean => {
    if (k === "description") return true;
    if (k === "quantity") return value.quote_items_show_quantity !== false;
    if (k === "unit")     return value.quote_items_show_unit     !== false;
    if (k === "price")    return value.quote_items_show_price    !== false;
    if (k === "total")    return value.quote_items_show_total    !== false;
    return false;
  };
  const toggleCol = (k: QuoteItemsColumnKey, v: boolean) => {
    if (k === "description") return;
    const key =
      k === "quantity" ? "quote_items_show_quantity" :
      k === "unit"     ? "quote_items_show_unit"     :
      k === "price"    ? "quote_items_show_price"    :
                         "quote_items_show_total";
    onChange({ ...value, [key]: v });
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-4">
        <StylePresetsSelector onSelect={handleChange} currentSettings={merged} />
        <Separator />
        <DocumentHeaderSettings settings={merged} onChange={handleChange} orgName={orgName} />
        <Separator />
        <DocumentFooterSettings settings={merged} onChange={handleChange} />
        <Separator />
        <DocumentPageSettings settings={merged} onChange={handleChange} />
        <Separator />
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Lista de Artigos</Label>
              <p className="text-xs text-muted-foreground">Incluir tabela de artigos do orçamento na minuta</p>
            </div>
            <Switch
              checked={value.show_quote_items === true}
              onCheckedChange={(v) => onChange({ ...value, show_quote_items: v })}
            />
          </div>
          {value.show_quote_items && (
            <div className="space-y-4 pl-2 border-l-2 border-muted">
              <div className="space-y-1">
                <Label className="text-xs">Título da secção</Label>
                <Input
                  value={value.quote_items_title ?? ""}
                  placeholder="Artigos do Orçamento"
                  onChange={(e) => onChange({ ...value, quote_items_title: e.target.value })}
                />
              </div>

              <div className="flex items-center justify-between text-sm">
                <div>
                  <span>Mostrar apenas descrição</span>
                  <p className="text-[11px] text-muted-foreground">Oculta Qtd, Un., Preço e Total — só a coluna Descrição.</p>
                </div>
                <Switch
                  checked={value.quote_items_description_only === true}
                  onCheckedChange={(v) => onChange({ ...value, quote_items_description_only: v })}
                />
              </div>

              {value.quote_items_description_only !== true && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Colunas (arraste para reordenar)</Label>
                  <ColumnOrderList
                    order={order}
                    isShown={isShown}
                    onReorder={(next) => onChange({ ...value, quote_items_column_order: next })}
                    onToggle={(k, v) => toggleCol(k, v)}
                  />
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <Label className="text-xs font-medium">Cores da tabela</Label>

                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Fundo do cabeçalho</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="h-8 w-12 rounded border cursor-pointer"
                      value={value.table_header_color || primary}
                      onChange={(e) => onChange({ ...value, table_header_color: e.target.value })}
                    />
                    <Input
                      value={value.table_header_color || ""}
                      placeholder={primary}
                      onChange={(e) => onChange({ ...value, table_header_color: e.target.value || null })}
                      className="h-8 text-xs flex-1"
                    />
                    {value.table_header_color && (
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs"
                        onClick={() => onChange({ ...value, table_header_color: null })}>
                        Repor
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Texto do cabeçalho</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="h-8 w-12 rounded border cursor-pointer"
                      value={value.table_header_text_color || "#ffffff"}
                      onChange={(e) => onChange({ ...value, table_header_text_color: e.target.value })}
                    />
                    <Input
                      value={value.table_header_text_color || ""}
                      placeholder="#ffffff"
                      onChange={(e) => onChange({ ...value, table_header_text_color: e.target.value || null })}
                      className="h-8 text-xs flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Cor da borda</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="h-8 w-12 rounded border cursor-pointer"
                      value={value.table_border_color || "#d1d5db"}
                      onChange={(e) => onChange({ ...value, table_border_color: e.target.value })}
                    />
                    <Input
                      value={value.table_border_color || ""}
                      placeholder="#d1d5db"
                      onChange={(e) => onChange({ ...value, table_border_color: e.target.value || null })}
                      className="h-8 text-xs flex-1"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm pt-1">
                  <span>Linhas alternadas (zebra)</span>
                  <Switch
                    checked={value.table_zebra === true}
                    onCheckedChange={(v) => onChange({ ...value, table_zebra: v })}
                  />
                </div>

                {value.table_zebra && (
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Cor da linha alternada</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="h-8 w-12 rounded border cursor-pointer"
                        value={value.table_zebra_color || "#f9fafb"}
                        onChange={(e) => onChange({ ...value, table_zebra_color: e.target.value })}
                      />
                      <Input
                        value={value.table_zebra_color || ""}
                        placeholder="#f9fafb"
                        onChange={(e) => onChange({ ...value, table_zebra_color: e.target.value || null })}
                        className="h-8 text-xs flex-1"
                      />
                    </div>
                  </div>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground">
                A tabela aparece como bloco visível no editor da minuta. Título, colunas e cores atualizam o bloco automaticamente.
              </p>
            </div>
          )}
        </div>

        {bodyHtml !== undefined && onBodyHtmlChange && (
          <>
            <Separator />
            <ManualTablesSection bodyHtml={bodyHtml} onBodyHtmlChange={onBodyHtmlChange} />
          </>
        )}
      </div>
    </ScrollArea>
  );
}
