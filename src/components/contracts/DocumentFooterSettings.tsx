import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FileText } from "lucide-react";
import type { DocumentSettings } from "@/hooks/useDocumentSettings";

interface Props {
  settings: DocumentSettings;
  onChange: (s: Partial<DocumentSettings>) => void;
}

export function DocumentFooterSettings({ settings, onChange }: Props) {
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <FileText className="h-4 w-4" /> Rodapé do Documento
      </h4>

      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <Switch
          checked={settings.show_footer}
          onCheckedChange={(v) => onChange({ show_footer: v })}
          className="h-4 w-7 [&>span]:h-3 [&>span]:w-3"
        />
        Mostrar rodapé
      </label>

      {settings.show_footer && (
        <>
          <div className="space-y-1">
            <Label className="text-xs">Texto do rodapé</Label>
            <Textarea
              value={settings.footer_text || ""}
              onChange={(e) => onChange({ footer_text: e.target.value || null })}
              placeholder="Ex: Documento gerado automaticamente pelo sistema Olyvia"
              className="text-sm min-h-[60px]"
              rows={2}
            />
          </div>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Switch
              checked={settings.show_page_numbers}
              onCheckedChange={(v) => onChange({ show_page_numbers: v })}
              className="h-4 w-7 [&>span]:h-3 [&>span]:w-3"
            />
            Número de página automático (Página X de Y)
          </label>

          <div className="space-y-2">
            <Label className="text-xs">Dados da empresa no rodapé</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: "show_nif" as const, label: "NIF" },
                { key: "show_address" as const, label: "Morada" },
                { key: "show_phone" as const, label: "Telefone" },
                { key: "show_email" as const, label: "Email" },
              ].map(({ key, label }) => (
                <label key={`footer-${key}`} className="flex items-center gap-2 text-xs cursor-pointer text-muted-foreground">
                  <input type="checkbox" className="rounded" checked={settings[key]} onChange={(e) => onChange({ [key]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
