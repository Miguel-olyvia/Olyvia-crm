/**
 * FormLocalesConfig
 *
 * Dialog to configure which languages a form supports.
 *
 * Persists into `forms.settings.i18n` ({ default_locale, enabled_locales })
 * via persistI18nConfig — preserving any existing translation `content`
 * and any unrelated keys in `settings`.
 *
 * Notes:
 *  - The default locale always writes to base columns (form_steps/fields/branding).
 *  - Secondary locales become available for translation in the future translations panel.
 *  - The public FormLocaleSwitcher only renders when ≥ 2 locales are configured.
 */
import { useEffect, useMemo, useState } from "react";
import { Globe, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LANGUAGES } from "@/constants/languages";
import {
  DEFAULT_FORM_LOCALE,
  persistI18nConfig,
  readI18nConfig,
} from "@/lib/formI18n";

interface FormLocalesConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
  formName: string;
  onSave?: () => void;
}

export function FormLocalesConfig({
  open,
  onOpenChange,
  formId,
  formName,
  onSave,
}: FormLocalesConfigProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [defaultLocale, setDefaultLocale] = useState<string>(DEFAULT_FORM_LOCALE);
  const [enabledLocales, setEnabledLocales] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !formId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("forms")
          .select("settings")
          .eq("id", formId)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        const cfg = readI18nConfig(data?.settings);
        setDefaultLocale(cfg.default_locale || DEFAULT_FORM_LOCALE);
        setEnabledLocales(
          (cfg.enabled_locales || []).filter((l) => l && l !== cfg.default_locale),
        );
      } catch (err) {
        console.error("[FormLocalesConfig] load failed", err);
        toast.error("Não foi possível carregar a configuração de idiomas.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, formId]);

  const secondaryOptions = useMemo(
    () => LANGUAGES.filter((l) => l.code !== defaultLocale),
    [defaultLocale],
  );

  const toggleLocale = (code: string, checked: boolean) => {
    setEnabledLocales((prev) => {
      if (checked) return prev.includes(code) ? prev : [...prev, code];
      return prev.filter((c) => c !== code);
    });
  };

  const handleDefaultChange = (next: string) => {
    setDefaultLocale(next);
    // Drop the new default from secondary list if it was there.
    setEnabledLocales((prev) => prev.filter((c) => c !== next));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Read existing config so we preserve translation `content`.
      const { data, error } = await supabase
        .from("forms")
        .select("settings")
        .eq("id", formId)
        .maybeSingle();
      if (error) throw error;
      const current = readI18nConfig(data?.settings);

      await persistI18nConfig(formId, {
        default_locale: defaultLocale,
        enabled_locales: enabledLocales.filter((c) => c && c !== defaultLocale),
        content: current.content || {},
      });

      toast.success("Idiomas atualizados.");
      onSave?.();
      onOpenChange(false);
    } catch (err) {
      console.error("[FormLocalesConfig] save failed", err);
      toast.error("Não foi possível guardar os idiomas.");
    } finally {
      setSaving(false);
    }
  };

  const totalLocales = 1 + enabledLocales.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Idiomas do formulário
          </DialogTitle>
          <DialogDescription>
            Configure o idioma principal e os idiomas adicionais disponíveis em{" "}
            <span className="font-medium">{formName}</span>. O seletor público só aparece
            quando existirem 2 ou mais idiomas.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="default-locale">Idioma principal</Label>
              <Select value={defaultLocale} onValueChange={handleDefaultChange}>
                <SelectTrigger id="default-locale">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.name}{" "}
                      <span className="text-muted-foreground">({l.code.toUpperCase()})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Os textos do idioma principal são guardados nas colunas base do formulário.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Idiomas adicionais</Label>
                <Badge variant="secondary">{totalLocales} ativo(s)</Badge>
              </div>
              <ScrollArea className="h-56 rounded-md border p-2">
                <div className="space-y-1">
                  {secondaryOptions.map((l) => {
                    const checked = enabledLocales.includes(l.code);
                    return (
                      <label
                        key={l.code}
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => toggleLocale(l.code, v === true)}
                        />
                        <span className="flex-1 text-sm">{l.name}</span>
                        <span className="text-xs uppercase text-muted-foreground">
                          {l.code}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
              <p className="text-xs text-muted-foreground">
                As traduções para idiomas adicionais ficam guardadas separadamente — não
                substituem nem alteram o conteúdo no idioma principal.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
