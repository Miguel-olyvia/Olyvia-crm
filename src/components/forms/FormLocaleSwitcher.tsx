/**
 * Discreet language dropdown for public forms.
 *
 * Renders only when the form has more than one locale configured
 * (default_locale + at least one in enabled_locales). Updates the
 * `?lang=` query param and persists the choice in localStorage so the
 * visitor sees the same language on return.
 *
 * Selecting a new locale calls `onChange(locale)` — the host component
 * decides how to refetch (typically: refetch get-form-data with the
 * new lang while keeping in-memory answers intact).
 */
import { useMemo } from "react";
import { Globe } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGES } from "@/constants/languages";

const STORAGE_KEY = "form_locale_preference";

interface FormLocaleSwitcherProps {
  defaultLocale?: string | null;
  enabledLocales?: string[] | null;
  currentLocale?: string | null;
  onChange: (locale: string) => void;
  className?: string;
}

export function FormLocaleSwitcher({
  defaultLocale,
  enabledLocales,
  currentLocale,
  onChange,
  className,
}: FormLocaleSwitcherProps) {
  const locales = useMemo(() => {
    const def = (defaultLocale || "").toLowerCase();
    const extras = (enabledLocales || [])
      .map((l) => String(l).toLowerCase())
      .filter((l) => l && l !== def);
    return def ? [def, ...extras] : extras;
  }, [defaultLocale, enabledLocales]);

  // Hide entirely for monolingual forms — preserves prior visual behavior.
  if (locales.length < 2) return null;

  const active = (currentLocale || defaultLocale || locales[0] || "").toLowerCase();

  const handleChange = (next: string) => {
    if (!next || next === active) return;
    try {
      localStorage.setItem(STORAGE_KEY, next);
      const url = new URL(window.location.href);
      url.searchParams.set("lang", next);
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* ignore */
    }
    onChange(next);
  };

  return (
    <div className={className}>
      <Select value={active} onValueChange={handleChange}>
        <SelectTrigger
          className="h-8 w-auto gap-1.5 border-none bg-background/70 px-2 text-xs font-medium uppercase backdrop-blur"
          aria-label="Select language"
        >
          <Globe className="h-3.5 w-3.5" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {locales.map((code) => {
            const meta = LANGUAGES.find((l) => l.code === code);
            return (
              <SelectItem key={code} value={code} className="text-sm">
                {meta?.name || code.toUpperCase()}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

export function readStoredFormLocale(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
