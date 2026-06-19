import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table as TableIcon, Database, Lock } from "lucide-react";
import {
  DataTableConfigForm,
  DEFAULT_QUOTE_ITEMS_CONFIG,
  DEFAULT_SIGNATORIES_CONFIG,
  normalizeColumnOrder,
  type QuoteItemsChipConfig,
  type QuoteItemsColumnKey,
  type SignatoriesChipConfig,
} from "./DataTableConfigForm";

const MAX_GRID = 8;
const MAX_INPUT = 20;

/* ---------------- helpers ---------------- */

function genTableId(): string {
  return "mt_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function buildManualTableHtml(
  rows: number,
  cols: number,
  withHeader: boolean,
  equalWidths: boolean,
  headerBg: string = "#f3f4f6",
  borderColor: string = "#d1d5db",
  name?: string,
): string {
  const colWidth = equalWidths ? `${(100 / cols).toFixed(2)}%` : "auto";
  const cellStyle = `border:1px solid ${borderColor};padding:8px;vertical-align:top;`;
  const headStyle = `${cellStyle}background-color:${headerBg};font-weight:600;text-align:left;`;

  const bodyRows: string[] = [];
  const dataRows = withHeader ? rows - 1 : rows;
  for (let r = 0; r < dataRows; r++) {
    const cells = Array.from({ length: cols }, () => `<td style="${cellStyle}">&nbsp;</td>`).join("");
    bodyRows.push(`<tr>${cells}</tr>`);
  }

  const headHtml = withHeader
    ? `<thead><tr>${Array.from({ length: cols }, () => `<th style="${headStyle}width:${colWidth};">&nbsp;</th>`).join("")}</tr></thead>`
    : "";

  const id = genTableId();
  const tableName = (name || "Tabela").replace(/"/g, "&quot;");
  return `<table data-contract-manual-table="true" data-manual-table-id="${id}" data-manual-table-name="${tableName}" style="width:100%;border-collapse:collapse;margin:8px 0;">${headHtml}<tbody>${bodyRows.join("")}</tbody></table><p>&nbsp;</p>`;
}

function encodeConfig(config: object): string {
  return window.btoa(unescape(encodeURIComponent(JSON.stringify(config))));
}

function escapeAttr(v: string): string {
  return String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildQuoteItemsChipHtml(config: QuoteItemsChipConfig): string {
  const encoded = encodeConfig(config);
  const title = escapeAttr(config.title || "Artigos do Orçamento");

  const headerBg    = config.headerBg    || "#7c3aed";
  const headerColor = config.headerColor || "#ffffff";
  const borderColor = config.borderColor || "#e5e7eb";
  const zebraOn     = config.zebra === true;
  const zebraColor  = config.zebraColor || "#f9fafb";

  const order = normalizeColumnOrder(config.columnOrder);

  type Col = { key: QuoteItemsColumnKey; label: string; align: "left" | "center" | "right"; samples: [string, string] };
  const allCols: Record<QuoteItemsColumnKey, Col> = {
    description: { key: "description", label: "Descrição",  align: "left",   samples: ["Artigo exemplo A", "Artigo exemplo B"] },
    quantity:    { key: "quantity",    label: "Qtd",        align: "center", samples: ["2", "1"] },
    unit:        { key: "unit",        label: "Un.",        align: "center", samples: ["un", "un"] },
    price:       { key: "price",       label: "Preço Unit.",align: "right",  samples: ["€100,00", "€250,00"] },
    total:       { key: "total",       label: "Total",      align: "right",  samples: ["€200,00", "€250,00"] },
  };
  const visibleKeys = order.filter(k => {
    if (k === "description") return true;
    if (k === "quantity") return config.showQuantity !== false;
    if (k === "unit")     return config.showUnit     !== false;
    if (k === "price")    return config.showPrice    !== false;
    if (k === "total")    return config.showTotal    !== false;
    return false;
  });
  const cols = visibleKeys.map(k => allCols[k]);

  const headCells = cols.map(c =>
    `<th style="border:1px solid ${borderColor};padding:6px 8px;text-align:${c.align};color:${headerColor};background:${headerBg};font-size:11px;font-weight:600;">${c.label}</th>`
  ).join("");
  const rowsHtml = [0, 1].map(i => {
    const rowBg = zebraOn && i % 2 === 1 ? `background:${zebraColor};` : "";
    return `<tr style="${rowBg}">${cols.map(c => `<td style="border:1px solid ${borderColor};padding:6px 8px;text-align:${c.align};color:#6b7280;font-size:11px;">${c.samples[i]}</td>`).join("")}</tr>`;
  }).join("");

  // NOTE: outer is a single <div>. Inner content MUST NOT contain other <div> or <span>
  // tags, because the parser in contractDocument.ts matches the chip via a lazy
  // </(?:span|div)> close. Only <p>, <table>, <thead>, <tbody>, <tr>, <th>, <td> are used.
  // The legacy {{tabela_artigos}} token is kept INSIDE a hidden <p> as a fallback for
  // older render paths, but is not shown to the user in the editor.
  return `<div data-contract-table="quote_items" data-config="${encoded}" contenteditable="false" class="contract-data-table-chip" style="display:block;border:2px dashed #c4b5fd;background:#faf5ff;border-radius:8px;padding:12px;margin:12px 0;cursor:pointer;user-select:none;">` +
    `<p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.6px;">📊 Bloco dinâmico · Artigos do Orçamento</p>` +
    `<p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#1f2937;">${title}</p>` +
    `<table style="width:100%;border-collapse:collapse;background:#fff;">` +
      `<thead><tr>${headCells}</tr></thead><tbody>${rowsHtml}</tbody>` +
    `</table>` +
    `<p style="margin:8px 0 0;font-size:11px;color:#6b7280;font-style:italic;">Preenchido automaticamente com os artigos do orçamento associado ao contrato. Edite título, ordem das colunas e cores no painel "Lista de Artigos".</p>` +
    `<p style="display:none">{{tabela_artigos}}</p>` +
  `</div>`;
}

/**
 * Upserts (or removes) the quote_items table block inside a body_html string.
 * - If `enabled` and no block exists, appends a new one with `cfg`.
 * - If `enabled` and a block exists, rewrites its config (preserves position).
 * - If not `enabled`, removes every quote_items block (and any leftover legacy token).
 * Also migrates raw {{orcamento_itens}} / {{tabela_artigos}} tokens to a block on enable.
 */
export function upsertQuoteItemsChipInHtml(
  bodyHtml: string,
  cfg: QuoteItemsChipConfig,
  enabled: boolean,
): string {
  const blockRe = /<(?:div|span)\b[^>]*\bdata-contract-table\s*=\s*"quote_items"[^>]*>[\s\S]*?<\/(?:div|span)>(?:\s*\{\{tabela_artigos\}\})?/gi;
  const tokenRe = /\{\{(orcamento_itens|tabela_artigos)\}\}/gi;
  let html = bodyHtml || "";

  if (!enabled) {
    html = html.replace(blockRe, "");
    html = html.replace(tokenRe, "");
    return html;
  }

  const newChip = buildQuoteItemsChipHtml(cfg);
  const blockCount = (html.match(blockRe) || []).length;

  if (blockCount > 0) {
    // Replace first with newChip, drop any duplicates.
    let first = true;
    html = html.replace(blockRe, () => {
      if (first) { first = false; return newChip; }
      return "";
    });
    // Conservative cleanup: chip exists, so stray legacy tokens outside it are noise.
    html = html.replace(tokenRe, "");
    return html;
  }

  // Migrate legacy raw token if present (first becomes the chip; others removed)
  if (tokenRe.test(html)) {
    tokenRe.lastIndex = 0;
    let first = true;
    html = html.replace(tokenRe, () => {
      if (first) { first = false; return newChip; }
      return "";
    });
    return html;
  }

  // No block, no token → append at the end.
  return `${html}<p>&nbsp;</p>${newChip}<p>&nbsp;</p>`;
}

/**
 * Reads the current QuoteItemsChipConfig from the first block in bodyHtml, if any.
 */
export function readQuoteItemsChipConfig(bodyHtml: string): QuoteItemsChipConfig | null {
  if (!bodyHtml) return null;
  const m = /<(?:div|span)\b[^>]*\bdata-contract-table\s*=\s*"quote_items"[^>]*\bdata-config\s*=\s*"([^"]*)"/i.exec(bodyHtml);
  if (!m) return null;
  try {
    const cfg = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    return { ...DEFAULT_QUOTE_ITEMS_CONFIG, ...cfg } as QuoteItemsChipConfig;
  } catch {
    return null;
  }
}

export function buildSignatoriesChipHtml(config: SignatoriesChipConfig): string {
  const encoded = encodeConfig(config);
  return `<span data-contract-table="signatories" data-config="${encoded}" contenteditable="false" class="contract-data-table-chip" style="display:inline-block;padding:4px 10px;margin:2px;border-radius:6px;background:#dcfce7;color:#166534;font-size:12px;font-weight:500;border:1px solid #86efac;cursor:pointer;user-select:none;">✍️ Tabela: ${escapeAttr(config.title || "Signatários")}</span>{{tabela_signatarios}}<br/>`;
}

/* ---------------- component ---------------- */

interface Props {
  onInsertHtml: (html: string) => void;
  onBeforeOpen?: () => void;
}

export function TableInsertPopover({ onInsertHtml, onBeforeOpen }: Props) {
  const [open, setOpen] = useState(false);
  const [hoverRow, setHoverRow] = useState(0);
  const [hoverCol, setHoverCol] = useState(0);
  const [customRows, setCustomRows] = useState(3);
  const [customCols, setCustomCols] = useState(4);
  const [withHeader, setWithHeader] = useState(true);
  const [equalWidths, setEqualWidths] = useState(true);
  const [headerBg, setHeaderBg] = useState("#f3f4f6");
  const [borderColor, setBorderColor] = useState("#d1d5db");

  const insertManual = useCallback((rows: number, cols: number) => {
    const r = Math.max(1, Math.min(MAX_INPUT, rows));
    const c = Math.max(1, Math.min(MAX_INPUT, cols));
    onInsertHtml(buildManualTableHtml(r, c, withHeader, equalWidths, headerBg, borderColor));
    setOpen(false);
  }, [onInsertHtml, withHeader, equalWidths, headerBg, borderColor]);

  const insertQuoteItemsChip = useCallback((cfg: QuoteItemsChipConfig) => {
    onInsertHtml(buildQuoteItemsChipHtml(cfg));
    setOpen(false);
  }, [onInsertHtml]);

  const insertSignatoriesChip = useCallback((cfg: SignatoriesChipConfig) => {
    onInsertHtml(buildSignatoriesChipHtml(cfg));
    setOpen(false);
  }, [onInsertHtml]);

  return (
    <Popover open={open} onOpenChange={(o) => { if (o) onBeforeOpen?.(); setOpen(o); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Inserir tabela">
          <TableIcon className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0 z-[650]" align="start">
        <Tabs defaultValue="manual" className="w-full">
          <TabsList className="grid grid-cols-2 m-2">
            <TabsTrigger value="manual" className="text-xs gap-1.5">
              <TableIcon className="h-3 w-3" /> Em branco
            </TabsTrigger>
            <TabsTrigger value="data" className="text-xs gap-1.5">
              <Database className="h-3 w-3" /> De dados
            </TabsTrigger>
          </TabsList>

          {/* ---- Manual tab ---- */}
          <TabsContent value="manual" className="p-3 pt-0 space-y-3 m-0">
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">
                {hoverRow > 0 && hoverCol > 0
                  ? `${hoverRow} × ${hoverCol}`
                  : "Escolha o tamanho"}
              </div>
              <div
                className="inline-grid gap-0.5 p-1 rounded border bg-muted/30"
                style={{ gridTemplateColumns: `repeat(${MAX_GRID}, 18px)` }}
                onMouseLeave={() => { setHoverRow(0); setHoverCol(0); }}
              >
                {Array.from({ length: MAX_GRID * MAX_GRID }).map((_, idx) => {
                  const r = Math.floor(idx / MAX_GRID) + 1;
                  const c = (idx % MAX_GRID) + 1;
                  const active = r <= hoverRow && c <= hoverCol;
                  return (
                    <button
                      key={idx}
                      type="button"
                      className={`h-[18px] w-[18px] rounded-sm border transition-colors ${active ? "bg-primary border-primary" : "bg-background border-border hover:bg-muted"}`}
                      onMouseEnter={() => { setHoverRow(r); setHoverCol(c); }}
                      onClick={() => insertManual(r, c)}
                    />
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">Linhas</Label>
                <Input
                  type="number" min={1} max={MAX_INPUT}
                  value={customRows}
                  onChange={e => setCustomRows(Math.max(1, Math.min(MAX_INPUT, Number(e.target.value) || 1)))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">Colunas</Label>
                <Input
                  type="number" min={1} max={MAX_INPUT}
                  value={customCols}
                  onChange={e => setCustomCols(Math.max(1, Math.min(MAX_INPUT, Number(e.target.value) || 1)))}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center justify-between text-xs">
                <span>Com cabeçalho</span>
                <Switch checked={withHeader} onCheckedChange={setWithHeader} />
              </label>
              <label className="flex items-center justify-between text-xs">
                <span>Larguras iguais</span>
                <Switch checked={equalWidths} onCheckedChange={setEqualWidths} />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">Cor cabeçalho</Label>
                <div className="flex items-center gap-1.5">
                  <input type="color" value={headerBg} onChange={e => setHeaderBg(e.target.value)} className="h-8 w-8 rounded border cursor-pointer" />
                  <Input value={headerBg} onChange={e => setHeaderBg(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">Cor borda</Label>
                <div className="flex items-center gap-1.5">
                  <input type="color" value={borderColor} onChange={e => setBorderColor(e.target.value)} className="h-8 w-8 rounded border cursor-pointer" />
                  <Input value={borderColor} onChange={e => setBorderColor(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>
            </div>

            <Button type="button" size="sm" className="w-full" onClick={() => insertManual(customRows, customCols)}>
              Inserir {customRows}×{customCols}
            </Button>
          </TabsContent>

          {/* ---- Data tab ---- */}
          <TabsContent value="data" className="p-3 pt-0 space-y-3 m-0">
            <div className="text-xs text-muted-foreground">
              Escolha a fonte. A tabela é gerada automaticamente quando o contrato for emitido.
            </div>

            <DataSourceCard active label="Artigos do orçamento" hint="Linhas do orçamento aceite">
              <DataTableConfigForm
                initial={DEFAULT_QUOTE_ITEMS_CONFIG}
                onInsert={insertQuoteItemsChip}
                insertLabel="Inserir tabela"
              />
            </DataSourceCard>

            <DataSourceCard active label="Signatários" hint="Quem assina o contrato (client_contract_parties)">
              <DataTableConfigForm
                initial={DEFAULT_SIGNATORIES_CONFIG}
                onInsert={insertSignatoriesChip}
                insertLabel="Inserir tabela"
              />
            </DataSourceCard>

            <DataSourceCard label="Componentes de bundles" hint="Em breve" />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

function DataSourceCard({
  active = false,
  label,
  hint,
  children,
}: {
  active?: boolean;
  label: string;
  hint: string;
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!active) {
    return (
      <div className="flex items-center gap-2 rounded border border-dashed p-2 opacity-60">
        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="flex-1">
          <div className="text-xs font-medium">{label}</div>
          <div className="text-[10px] text-muted-foreground">{hint}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded border">
      <button
        type="button"
        className="w-full flex items-center gap-2 p-2 hover:bg-muted/50 text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <Database className="h-3.5 w-3.5 text-primary" />
        <div className="flex-1">
          <div className="text-xs font-medium">{label}</div>
          <div className="text-[10px] text-muted-foreground">{hint}</div>
        </div>
        <span className="text-[10px] text-muted-foreground">{expanded ? "−" : "+"}</span>
      </button>
      {expanded && <div className="border-t p-2">{children}</div>}
    </div>
  );
}
