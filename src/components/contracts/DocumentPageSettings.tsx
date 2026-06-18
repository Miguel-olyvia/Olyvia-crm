import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings2 } from "lucide-react";
import type { DocumentSettings } from "@/hooks/useDocumentSettings";

interface Props {
  settings: DocumentSettings;
  onChange: (s: Partial<DocumentSettings>) => void;
}

export function DocumentPageSettings({ settings, onChange }: Props) {
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <Settings2 className="h-4 w-4" /> Configurações da Página
      </h4>

      {/* Margins */}
      <div className="space-y-2">
        <Label className="text-xs">Margens (mm)</Label>
        <div className="grid grid-cols-4 gap-2">
          {([
            { key: "margin_top" as const, label: "Topo" },
            { key: "margin_bottom" as const, label: "Base" },
            { key: "margin_left" as const, label: "Esq." },
            { key: "margin_right" as const, label: "Dir." },
          ]).map(({ key, label }) => (
            <div key={key} className="space-y-1">
              <span className="text-[10px] text-muted-foreground">{label}</span>
              <Input
                type="number"
                min={5}
                max={50}
                value={settings[key]}
                onChange={(e) => onChange({ [key]: parseInt(e.target.value) || 20 })}
                className="h-7 text-xs text-center"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Orientation */}
      <div className="space-y-2">
        <Label className="text-xs">Orientação</Label>
        <Select value={settings.page_orientation} onValueChange={(v) => onChange({ page_orientation: v })}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="portrait">Retrato (vertical)</SelectItem>
            <SelectItem value="landscape">Paisagem (horizontal)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Page size */}
      <div className="space-y-2">
        <Label className="text-xs">Tamanho</Label>
        <Select value={settings.page_size} onValueChange={(v) => onChange({ page_size: v })}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="A4">A4 (210 × 297 mm)</SelectItem>
            <SelectItem value="A3">A3 (297 × 420 mm)</SelectItem>
            <SelectItem value="Letter">Letter (216 × 279 mm)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Font family */}
      <div className="space-y-2">
        <Label className="text-xs">Tipo de letra padrão</Label>
        <Select value={settings.font_family} onValueChange={(v) => onChange({ font_family: v })}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Arial">Arial</SelectItem>
            <SelectItem value="Times New Roman">Times New Roman</SelectItem>
            <SelectItem value="Calibri">Calibri</SelectItem>
            <SelectItem value="Open Sans">Open Sans</SelectItem>
            <SelectItem value="Roboto">Roboto</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
