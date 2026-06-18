import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Palette,
  Highlighter,
  Type,
  Image,
  PenTool,
  SeparatorHorizontal,
} from "lucide-react";
import { TableInsertPopover } from "./TableInsertPopover";
import { FormulaInsertPopover } from "./FormulaInsertPopover";

interface Props {
  onExecCommand: (cmd: string, value?: string) => void;
}

const FONT_SIZES = [
  { value: "1", label: "10px" },
  { value: "2", label: "11px" },
  { value: "3", label: "12px" },
  { value: "4", label: "14px" },
  { value: "5", label: "18px" },
  { value: "6", label: "24px" },
];

const FONT_FAMILIES = [
  "Arial",
  "Times New Roman",
  "Calibri",
  "Open Sans",
  "Roboto",
  "Georgia",
  "Courier New",
];

const COLORS = [
  "#000000", "#374151", "#6b7280", "#991b1b", "#dc2626", "#ea580c",
  "#ca8a04", "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#c026d3",
];

export function EnhancedToolbarButtons({ onExecCommand }: Props) {
  const [textColor, setTextColor] = useState("#000000");
  const [bgColor, setBgColor] = useState("#fef08a");
  const savedRangeRef = useRef<Range | null>(null);

  const captureSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    let node: Node | null = range.startContainer;
    while (node) {
      if (node.nodeType === 1) {
        const el = node as HTMLElement;
        if (el.getAttribute && el.getAttribute("contenteditable") === "true") {
          savedRangeRef.current = range.cloneRange();
          return;
        }
      }
      node = node.parentNode;
    }
  }, []);

  const restoreSelection = useCallback(() => {
    const range = savedRangeRef.current;
    if (!range) return false;
    let node: Node | null = range.startContainer;
    let editable: HTMLElement | null = null;
    while (node) {
      if (node.nodeType === 1) {
        const el = node as HTMLElement;
        if (el.getAttribute && el.getAttribute("contenteditable") === "true") {
          editable = el;
          break;
        }
      }
      node = node.parentNode;
    }
    if (!editable || !editable.isConnected) return false;
    editable.focus();
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }, []);

  const insertHtml = useCallback((html: string) => {
    restoreSelection();
    document.execCommand("insertHTML", false, html);
  }, [restoreSelection]);

  const insertSignatureBlock = useCallback(() => {
    const html = `<br/><div style="margin-top:40px;">
      <div style="display:flex;justify-content:space-between;gap:60px;">
        <div style="flex:1;text-align:center;">
          <div style="border-bottom:1px solid #000;margin-bottom:8px;height:40px;"></div>
          <p style="font-size:12px;"><strong>A PRIMEIRA CONTRATANTE</strong></p>
          <p style="font-size:11px;color:#666;">(Nome / Carimbo)</p>
        </div>
        <div style="flex:1;text-align:center;">
          <div style="border-bottom:1px solid #000;margin-bottom:8px;height:40px;"></div>
          <p style="font-size:12px;"><strong>O SEGUNDO CONTRATANTE</strong></p>
          <p style="font-size:11px;color:#666;">(Nome / Assinatura)</p>
        </div>
      </div>
    </div><br/>`;
    document.execCommand("insertHTML", false, html);
  }, []);

  const insertPageBreak = useCallback(() => {
    const html = `<div style="page-break-after:always;border-top:2px dashed #d1d5db;margin:20px 0;padding-top:4px;text-align:center;"><span style="font-size:10px;color:#9ca3af;">— quebra de página —</span></div>`;
    document.execCommand("insertHTML", false, html);
  }, []);

  const handleInsertImage = useCallback(() => {
    const url = prompt("URL da imagem:");
    if (url) {
      const html = `<img src="${url}" alt="Imagem" style="max-width:100%;height:auto;margin:8px 0;border-radius:4px;" />`;
      document.execCommand("insertHTML", false, html);
    }
  }, []);

  return (
    <>
      <Separator orientation="vertical" className="h-5 mx-1" />

      {/* Font family */}
      <Select onValueChange={(v) => onExecCommand("fontName", v)}>
        <SelectTrigger className="h-7 w-[110px] text-[11px] border-0 bg-transparent hover:bg-muted">
          <SelectValue placeholder="Fonte" />
        </SelectTrigger>
        <SelectContent className="z-[650]">
          {FONT_FAMILIES.map((f) => (
            <SelectItem key={f} value={f} className="text-xs" style={{ fontFamily: f }}>{f}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Font size */}
      <Select onValueChange={(v) => onExecCommand("fontSize", v)}>
        <SelectTrigger className="h-7 w-[70px] text-[11px] border-0 bg-transparent hover:bg-muted">
          <SelectValue placeholder="Tam." />
        </SelectTrigger>
        <SelectContent className="z-[650]">
          {FONT_SIZES.map((s) => (
            <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Separator orientation="vertical" className="h-5 mx-1" />

      {/* Text color */}
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 relative" title="Cor do texto">
            <Palette className="h-3.5 w-3.5" />
            <span className="absolute bottom-0.5 left-1.5 right-1.5 h-0.5 rounded" style={{ backgroundColor: textColor }} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2 z-[650]" align="start">
          <div className="grid grid-cols-6 gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="w-6 h-6 rounded border hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
                onClick={() => { setTextColor(c); onExecCommand("foreColor", c); }}
              />
            ))}
          </div>
          <div className="flex items-center gap-1 mt-2">
            <input type="color" value={textColor} onChange={(e) => { setTextColor(e.target.value); onExecCommand("foreColor", e.target.value); }} className="w-6 h-6 rounded cursor-pointer" />
            <span className="text-[10px] text-muted-foreground">Personalizar</span>
          </div>
        </PopoverContent>
      </Popover>

      {/* Highlight / background color */}
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 relative" title="Cor de destaque">
            <Highlighter className="h-3.5 w-3.5" />
            <span className="absolute bottom-0.5 left-1.5 right-1.5 h-0.5 rounded" style={{ backgroundColor: bgColor }} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2 z-[650]" align="start">
          <div className="grid grid-cols-6 gap-1">
            {["#fef08a", "#bbf7d0", "#bfdbfe", "#e9d5ff", "#fecdd3", "#fed7aa", "#ffffff", "#f3f4f6", "#e5e7eb", "#d1d5db", "#9ca3af", "#6b7280"].map((c) => (
              <button
                key={c}
                type="button"
                className="w-6 h-6 rounded border hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
                onClick={() => { setBgColor(c); onExecCommand("hiliteColor", c); }}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="h-5 mx-1" />

      {/* Insert image */}
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={handleInsertImage} title="Inserir imagem">
        <Image className="h-3.5 w-3.5" />
      </Button>

      {/* Insert table (manual or data-bound) */}
      <TableInsertPopover onInsertHtml={insertHtml} onBeforeOpen={captureSelection} />

      {/* Insert formula chip (Corte 2C) — % do valor do contrato, etc. */}
      <FormulaInsertPopover onInsertHtml={insertHtml} onBeforeOpen={captureSelection} />



      {/* Signature block */}
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={insertSignatureBlock} title="Espaço para assinatura">
        <PenTool className="h-3.5 w-3.5" />
      </Button>

      {/* Page break */}
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={insertPageBreak} title="Quebra de página">
        <SeparatorHorizontal className="h-3.5 w-3.5" />
      </Button>
    </>
  );
}
