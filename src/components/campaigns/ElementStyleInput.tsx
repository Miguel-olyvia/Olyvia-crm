import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Extended color palette with more options
const colorPalette = [
  // Brand colors
  "#85D3BE", "#A8D8CB", "#10B981", "#059669", "#047857", "#34D399",
  // Blues
  "#3B82F6", "#2563EB", "#1D4ED8", "#60A5FA", "#93C5FD", "#BFDBFE",
  // Purples
  "#8B5CF6", "#7C3AED", "#6D28D9", "#A78BFA", "#C4B5FD", "#6366F1",
  // Pinks/Reds
  "#EC4899", "#DB2777", "#F472B6", "#EF4444", "#DC2626", "#F87171",
  // Oranges/Yellows
  "#F97316", "#EA580C", "#F59E0B", "#FBBF24", "#FCD34D", "#FDE68A",
  // Neutrals - expanded
  "#FFFFFF", "#F9FAFB", "#F3F4F6", "#E5E7EB", "#D1D5DB", "#9CA3AF",
  "#6B7280", "#4B5563", "#374151", "#1F2937", "#111827", "#000000",
];

interface ColorPickerInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  showPreview?: boolean;
}

export function ColorPickerInput({ label, value, onChange, showPreview = true }: ColorPickerInputProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-start gap-2 h-9 px-3 hover:bg-muted/50"
          >
            <div
              className="w-5 h-5 rounded-md border shadow-sm shrink-0"
              style={{ backgroundColor: value || "#ffffff" }}
            />
            <span className="text-xs font-mono truncate flex-1 text-left">{value || "Selecionar"}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start">
          <div className="space-y-3">
            <div className="grid grid-cols-6 gap-1">
              {colorPalette.map((color) => (
                <button
                  key={color}
                  className={cn(
                    "w-9 h-9 rounded-lg border-2 transition-all hover:scale-110 hover:shadow-md",
                    value?.toLowerCase() === color.toLowerCase() ? "border-primary ring-2 ring-primary/30 scale-105" : "border-transparent hover:border-muted-foreground/30"
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    onChange(color);
                    setOpen(false);
                  }}
                />
              ))}
            </div>
            <div className="flex gap-2 pt-2 border-t">
              <div className="relative">
                <Input
                  type="color"
                  value={value || "#ffffff"}
                  onChange={(e) => onChange(e.target.value)}
                  className="w-10 h-9 p-0.5 cursor-pointer border-2"
                />
              </div>
              <Input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="#000000"
                className="flex-1 h-9 text-xs font-mono"
              />
              {value && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 px-2 text-xs"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  Limpar
                </Button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface SliderInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export function SliderInput({ 
  label, 
  value, 
  onChange, 
  min = 0, 
  max = 50, 
  step = 1,
  unit = "px" 
}: SliderInputProps) {
  const numericValue = parseInt(value) || min;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={numericValue}
            onChange={(e) => onChange(`${e.target.value}${unit}`)}
            className="w-14 h-6 text-xs text-center p-1"
            min={min}
            max={max}
          />
          <span className="text-xs text-muted-foreground w-5">{unit}</span>
        </div>
      </div>
      <Slider
        value={[numericValue]}
        onValueChange={([val]) => onChange(`${val}${unit}`)}
        min={min}
        max={max}
        step={step}
        className="cursor-pointer"
      />
    </div>
  );
}

// Padding input with support for multi-value padding
interface PaddingInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function PaddingInput({ label, value, onChange }: PaddingInputProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="12px 16px"
        className="h-8 text-xs font-mono"
      />
      <p className="text-[10px] text-muted-foreground">Ex: 12px 16px (vertical horizontal)</p>
    </div>
  );
}

// Helper function to safely get string value
const getStyle = (styles: Record<string, unknown>, key: string, fallback: string): string => {
  const val = styles[key];
  return typeof val === 'string' ? val : fallback;
};

interface ElementPreviewProps {
  type: "input" | "card" | "radio" | "checkbox" | "button" | "nav-button" | "step-container" | "progress-bar" | "info-block" | "select";
  styles: Record<string, unknown>;
  primaryColor?: string;
  textColor?: string;
}

export function ElementPreview({ type, styles, primaryColor = "#85D3BE", textColor = "#1F2937" }: ElementPreviewProps) {
  if (type === "input") {
    return (
      <div className="p-4 bg-gradient-to-br from-muted/30 to-muted/50 rounded-xl border">
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">Preview</Label>
        <input
          type="text"
          placeholder="Exemplo de input"
          className="w-full transition-all outline-none"
          style={{
            borderRadius: getStyle(styles, "input_border_radius", "10px"),
            borderWidth: getStyle(styles, "input_border_width", "1px"),
            borderColor: getStyle(styles, "input_border_color", "#e5e7eb"),
            borderStyle: "solid",
            padding: getStyle(styles, "input_padding", "12px 14px"),
            fontSize: getStyle(styles, "input_font_size", "15px"),
            backgroundColor: getStyle(styles, "input_background_color", "white") || "white",
            color: textColor,
          }}
        />
      </div>
    );
  }

  if (type === "card") {
    return (
      <div className="p-4 bg-gradient-to-br from-muted/30 to-muted/50 rounded-xl border">
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">Preview</Label>
        <div className="flex gap-3">
          <div
            className="flex-1 flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-[1.02]"
            style={{
              borderRadius: getStyle(styles, "card_border_radius", "16px"),
              borderWidth: getStyle(styles, "card_border_width", "2px"),
              borderColor: getStyle(styles, "card_border_color", "#e5e7eb"),
              borderStyle: "solid",
              padding: getStyle(styles, "card_padding", "20px 12px"),
              minHeight: getStyle(styles, "card_min_height", "80px"),
              backgroundColor: "white",
            }}
          >
            <div
              className="flex items-center justify-center mb-2"
              style={{
                width: getStyle(styles, "card_icon_size", "40px"),
                height: getStyle(styles, "card_icon_size", "40px"),
                borderRadius: getStyle(styles, "card_icon_border_radius", "14px"),
                backgroundColor: `${primaryColor}20`,
              }}
            >
              <span className="text-base">🏠</span>
            </div>
            <span className="text-xs font-medium" style={{ color: textColor }}>Opção 1</span>
          </div>
          <div
            className="flex-1 flex flex-col items-center justify-center cursor-pointer transition-all"
            style={{
              borderRadius: getStyle(styles, "card_border_radius", "16px"),
              borderWidth: getStyle(styles, "card_border_width", "2px"),
              borderColor: primaryColor,
              borderStyle: "solid",
              padding: getStyle(styles, "card_padding", "20px 12px"),
              minHeight: getStyle(styles, "card_min_height", "80px"),
              backgroundColor: `${primaryColor}10`,
            }}
          >
            <div
              className="flex items-center justify-center mb-2"
              style={{
                width: getStyle(styles, "card_icon_size", "40px"),
                height: getStyle(styles, "card_icon_size", "40px"),
                borderRadius: getStyle(styles, "card_icon_border_radius", "14px"),
                backgroundColor: `${primaryColor}30`,
              }}
            >
              <span className="text-base">🏢</span>
            </div>
            <span className="text-xs font-medium" style={{ color: textColor }}>Opção 2</span>
          </div>
        </div>
      </div>
    );
  }

  if (type === "radio") {
    const radioColor = getStyle(styles, "radio_button_color", primaryColor);
    return (
      <div className="p-4 bg-gradient-to-br from-muted/30 to-muted/50 rounded-xl border">
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">Preview</Label>
        <div className="space-y-2">
          <div
            className="flex items-center gap-3 cursor-pointer transition-all"
            style={{
              borderRadius: getStyle(styles, "radio_border_radius", "12px"),
              borderWidth: getStyle(styles, "radio_border_width", "2px"),
              borderColor: "#e5e7eb",
              borderStyle: "solid",
              padding: getStyle(styles, "radio_padding", "12px 14px"),
              backgroundColor: "white",
            }}
          >
            <div
              className="shrink-0 flex items-center justify-center"
              style={{
                width: getStyle(styles, "radio_circle_size", "20px"),
                height: getStyle(styles, "radio_circle_size", "20px"),
                borderRadius: "50%",
                borderWidth: "2px",
                borderStyle: "solid",
                borderColor: "#d1d5db",
              }}
            />
            <span className="text-sm" style={{ color: textColor }}>Não selecionada</span>
          </div>
          <div
            className="flex items-center gap-3 cursor-pointer transition-all"
            style={{
              borderRadius: getStyle(styles, "radio_border_radius", "12px"),
              borderWidth: getStyle(styles, "radio_border_width", "2px"),
              borderColor: radioColor,
              borderStyle: "solid",
              padding: getStyle(styles, "radio_padding", "12px 14px"),
              backgroundColor: `${radioColor}10`,
            }}
          >
            <div
              className="shrink-0 flex items-center justify-center"
              style={{
                width: getStyle(styles, "radio_circle_size", "20px"),
                height: getStyle(styles, "radio_circle_size", "20px"),
                borderRadius: "50%",
                borderWidth: "2px",
                borderStyle: "solid",
                borderColor: radioColor,
                backgroundColor: radioColor,
              }}
            >
              <div
                style={{
                  width: getStyle(styles, "radio_inner_size", "10px"),
                  height: getStyle(styles, "radio_inner_size", "10px"),
                  borderRadius: "50%",
                  backgroundColor: "white",
                }}
              />
            </div>
            <span className="text-sm font-medium" style={{ color: textColor }}>Selecionada</span>
          </div>
        </div>
      </div>
    );
  }

  if (type === "checkbox") {
    return (
      <div className="p-4 bg-gradient-to-br from-muted/30 to-muted/50 rounded-xl border">
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">Preview</Label>
        <div className="space-y-2">
          <div
            className="flex items-center gap-3 cursor-pointer"
            style={{
              borderRadius: getStyle(styles, "checkbox_border_radius", "10px"),
              borderWidth: getStyle(styles, "checkbox_border_width", "1px"),
              borderColor: "#e5e7eb",
              borderStyle: "solid",
              padding: getStyle(styles, "checkbox_padding", "12px 14px"),
              backgroundColor: "white",
            }}
          >
            <div
              className="shrink-0 flex items-center justify-center"
              style={{
                width: getStyle(styles, "checkbox_size", "20px"),
                height: getStyle(styles, "checkbox_size", "20px"),
                borderRadius: "4px",
                borderWidth: "2px",
                borderStyle: "solid",
                borderColor: "#d1d5db",
              }}
            />
            <span className="text-sm" style={{ color: textColor }}>Não selecionado</span>
          </div>
          <div
            className="flex items-center gap-3 cursor-pointer"
            style={{
              borderRadius: getStyle(styles, "checkbox_border_radius", "10px"),
              borderWidth: getStyle(styles, "checkbox_border_width", "1px"),
              borderColor: primaryColor,
              borderStyle: "solid",
              padding: getStyle(styles, "checkbox_padding", "12px 14px"),
              backgroundColor: `${primaryColor}10`,
            }}
          >
            <div
              className="shrink-0 flex items-center justify-center"
              style={{
                width: getStyle(styles, "checkbox_size", "20px"),
                height: getStyle(styles, "checkbox_size", "20px"),
                borderRadius: "4px",
                backgroundColor: primaryColor,
              }}
            >
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
              </svg>
            </div>
            <span className="text-sm font-medium" style={{ color: textColor }}>Selecionado</span>
          </div>
        </div>
      </div>
    );
  }

  if (type === "button") {
    return (
      <div className="p-4 bg-gradient-to-br from-muted/30 to-muted/50 rounded-xl border">
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">Preview</Label>
        <div className="flex gap-2">
          <button
            className="flex-1 text-center font-medium transition-all"
            style={{
              borderRadius: getStyle(styles, "button_option_border_radius", "12px"),
              borderWidth: getStyle(styles, "button_option_border_width", "2px"),
              borderColor: "#e5e7eb",
              borderStyle: "solid",
              padding: getStyle(styles, "button_option_padding", "12px"),
              backgroundColor: "white",
              color: textColor,
              fontSize: "13px",
            }}
          >
            Opção A
          </button>
          <button
            className="flex-1 text-center font-medium transition-all"
            style={{
              borderRadius: getStyle(styles, "button_option_border_radius", "12px"),
              borderWidth: getStyle(styles, "button_option_border_width", "2px"),
              borderColor: primaryColor,
              borderStyle: "solid",
              padding: getStyle(styles, "button_option_padding", "12px"),
              backgroundColor: `${primaryColor}10`,
              color: textColor,
              fontSize: "13px",
            }}
          >
            Opção B
          </button>
        </div>
      </div>
    );
  }

  if (type === "nav-button") {
    return (
      <div className="p-4 bg-gradient-to-br from-muted/30 to-muted/50 rounded-xl border">
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">Preview</Label>
        <div className="flex gap-2">
          <button
            className="flex-1 text-center font-medium transition-all border-2"
            style={{
              borderRadius: getStyle(styles, "nav_button_border_radius", "10px"),
              padding: getStyle(styles, "nav_button_padding", "12px 20px"),
              fontSize: getStyle(styles, "nav_button_font_size", "15px"),
              backgroundColor: "transparent",
              borderColor: primaryColor,
              color: primaryColor,
            }}
          >
            ← Anterior
          </button>
          <button
            className="flex-1 text-center font-medium transition-all"
            style={{
              borderRadius: getStyle(styles, "nav_button_border_radius", "10px"),
              padding: getStyle(styles, "nav_button_padding", "12px 20px"),
              fontSize: getStyle(styles, "nav_button_font_size", "15px"),
              backgroundColor: primaryColor,
              color: "white",
            }}
          >
            Próximo →
          </button>
        </div>
      </div>
    );
  }

  if (type === "step-container") {
    return (
      <div className="p-4 bg-gradient-to-br from-muted/30 to-muted/50 rounded-xl border">
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">Preview</Label>
        <div
          style={{
            borderRadius: getStyle(styles, "step_border_radius", "16px"),
            borderWidth: getStyle(styles, "step_border_width", "1px"),
            borderColor: getStyle(styles, "step_border_color", "#e5e7eb"),
            borderStyle: "solid",
            padding: getStyle(styles, "step_padding", "24px"),
            backgroundColor: "white",
            boxShadow: getStyle(styles, "step_shadow", "0 1px 3px 0 rgb(0 0 0 / 0.1)"),
          }}
        >
          <h4 className="font-medium text-sm mb-1" style={{ color: textColor }}>Título do Passo</h4>
          <p className="text-xs text-muted-foreground">Descrição do passo...</p>
        </div>
      </div>
    );
  }

  if (type === "progress-bar") {
    return (
      <div className="p-4 bg-gradient-to-br from-muted/30 to-muted/50 rounded-xl border">
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">Preview</Label>
        <div className="space-y-2">
          <div
            className="w-full bg-muted"
            style={{
              height: getStyle(styles, "progress_bar_height", "6px"),
              borderRadius: getStyle(styles, "progress_bar_border_radius", "3px"),
            }}
          >
            <div
              style={{
                width: "60%",
                height: "100%",
                backgroundColor: primaryColor,
                borderRadius: getStyle(styles, "progress_bar_border_radius", "3px"),
              }}
            />
          </div>
          <p className="text-xs text-center text-muted-foreground">Passo 2 de 3</p>
        </div>
      </div>
    );
  }

  if (type === "info-block") {
    const opacity = parseInt(getStyle(styles, "info_block_background_opacity", "15")) / 100;
    return (
      <div className="p-4 bg-gradient-to-br from-muted/30 to-muted/50 rounded-xl border">
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">Preview</Label>
        <div
          className="flex items-start gap-3"
          style={{
            borderRadius: getStyle(styles, "info_block_border_radius", "12px"),
            padding: getStyle(styles, "info_block_padding", "16px 20px"),
            backgroundColor: `${primaryColor}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`,
          }}
        >
          <span className="text-lg">💡</span>
          <div>
            <h5 className="font-medium text-sm" style={{ color: textColor }}>Informação</h5>
            <p className="text-xs text-muted-foreground">Bloco de informação adicional</p>
          </div>
        </div>
      </div>
    );
  }

  if (type === "select") {
    return (
      <div className="p-4 bg-gradient-to-br from-muted/30 to-muted/50 rounded-xl border">
        <Label className="text-xs font-medium text-muted-foreground mb-2 block">Preview</Label>
        <div
          className="flex items-center justify-between cursor-pointer"
          style={{
            borderRadius: getStyle(styles, "select_border_radius", "10px"),
            borderWidth: getStyle(styles, "select_border_width", "1px"),
            borderColor: "#e5e7eb",
            borderStyle: "solid",
            padding: "10px 14px",
            backgroundColor: "white",
          }}
        >
          <span className="text-sm text-muted-foreground">Selecione uma opção</span>
          <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    );
  }

  return null;
}
