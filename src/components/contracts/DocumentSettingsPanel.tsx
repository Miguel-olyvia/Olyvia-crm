import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DocumentHeaderSettings } from "./DocumentHeaderSettings";
import { DocumentFooterSettings } from "./DocumentFooterSettings";
import { DocumentPageSettings } from "./DocumentPageSettings";
import { StylePresetsSelector } from "./StylePresetsSelector";
import { useDocumentSettings, type DocumentSettings } from "@/hooks/useDocumentSettings";

interface Props {
  orgName?: string;
  onSettingsChange?: (settings: DocumentSettings) => void;
}

export function DocumentSettingsPanel({ orgName, onSettingsChange }: Props) {
  const { settings, isLoading, save, isSaving } = useDocumentSettings();
  const [local, setLocal] = useState<DocumentSettings | null>(null);

  useEffect(() => {
    if (settings) setLocal({ ...settings });
  }, [settings]);

  useEffect(() => {
    if (local && onSettingsChange) onSettingsChange(local);
  }, [local, onSettingsChange]);

  if (isLoading || !local) return null;

  const handleChange = (overrides: Partial<DocumentSettings>) => {
    setLocal((prev) => prev ? { ...prev, ...overrides } : prev);
  };

  const handleSave = () => {
    if (!local) return;
    save(local, {
      onSuccess: () => toast.success("Configurações do documento guardadas"),
      onError: (e: any) => toast.error("Erro: " + e.message),
    });
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-4">
        <StylePresetsSelector onSelect={handleChange} currentSettings={local} />
        <Separator />
        <DocumentHeaderSettings settings={local} onChange={handleChange} orgName={orgName} />
        <Separator />
        <DocumentFooterSettings settings={local} onChange={handleChange} />
        <Separator />
        <DocumentPageSettings settings={local} onChange={handleChange} />
        <Separator />
        <Button onClick={handleSave} disabled={isSaving} className="w-full gap-2">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar Configurações
        </Button>
      </div>
    </ScrollArea>
  );
}
