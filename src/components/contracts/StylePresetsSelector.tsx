import { useState } from "react";
import { Sparkles, Check } from "lucide-react";
import type { DocumentSettings } from "@/hooks/useDocumentSettings";

interface Props {
  onSelect: (overrides: Partial<DocumentSettings>) => void;
  currentSettings?: Partial<DocumentSettings> | null;
}

const PRESETS = [
  {
    id: "classic",
    name: "Clássico",
    description: "Sóbrio, Times New Roman, linhas finas, sem cor",
    icon: "📜",
    overrides: {
      font_family: "Times New Roman",
      primary_color: "#374151",
      header_layout: "center" as const,
      header_show_separator: true,
    },
  },
  {
    id: "modern",
    name: "Moderno",
    description: "Clean, sans-serif, linha colorida, logo à esquerda",
    icon: "✨",
    overrides: {
      font_family: "Arial",
      primary_color: "#7C3AED",
      header_layout: "left" as const,
      header_show_separator: true,
    },
  },
  {
    id: "corporate",
    name: "Corporativo",
    description: "Logo centrado grande, cores da empresa, header com fundo",
    icon: "🏢",
    overrides: {
      font_family: "Calibri",
      primary_color: "#1e40af",
      header_layout: "center" as const,
      header_show_separator: false,
    },
  },
];

function detectActivePreset(settings?: Partial<DocumentSettings> | null): string | null {
  if (!settings) return null;
  for (const preset of PRESETS) {
    const match = Object.entries(preset.overrides).every(
      ([key, val]) => (settings as any)[key] === val
    );
    if (match) return preset.id;
  }
  return null;
}

export function StylePresetsSelector({ onSelect, currentSettings }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(() => detectActivePreset(currentSettings));

  const handleSelect = (preset: typeof PRESETS[number]) => {
    setSelectedId(preset.id);
    onSelect(preset.overrides);
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <Sparkles className="h-4 w-4" /> Estilos Predefinidos
      </h4>
      <div className="grid grid-cols-3 gap-2">
        {PRESETS.map((preset) => {
          const isActive = selectedId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelect(preset)}
              className={`relative border-2 rounded-lg p-3 text-center transition-all cursor-pointer ${
                isActive
                  ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                  : "border-muted hover:border-primary/50 hover:bg-primary/5"
              }`}
            >
              {isActive && (
                <span className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full p-0.5">
                  <Check className="h-3 w-3" />
                </span>
              )}
              <span className="text-2xl block mb-1">{preset.icon}</span>
              <p className="font-semibold text-xs">{preset.name}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{preset.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
