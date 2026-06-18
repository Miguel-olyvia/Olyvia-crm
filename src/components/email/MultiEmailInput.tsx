import { useState, KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface MultiEmailInputProps {
  values: string[];
  onChange: (next: string[]) => void;
  /** Email that must always be present and cannot be removed (lead/contact/client). */
  primaryEmail?: string;
  placeholder?: string;
  max?: number;
  id?: string;
  /** When true, the primary email chip can be removed (default false). */
  allowRemovePrimary?: boolean;
}

/**
 * Multi-value email input (chips). The primary email (lead/contacto/cliente) is
 * marked as "Principal" and não pode ser removido — só esse conta para tracking
 * de estado nos módulos de envio.
 */
export function MultiEmailInput({
  values,
  onChange,
  primaryEmail,
  placeholder = "email@exemplo.com",
  max = 10,
  id,
  allowRemovePrimary = false,
}: MultiEmailInputProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const tryAdd = (raw: string) => {
    const candidates = raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!candidates.length) return;
    const next = [...values];
    let invalid: string | null = null;
    for (const c of candidates) {
      if (next.length >= max) break;
      if (!EMAIL_RE.test(c)) {
        invalid = c;
        continue;
      }
      const lower = c.toLowerCase();
      if (next.some((v) => v.toLowerCase() === lower)) continue;
      next.push(c);
    }
    if (invalid) setError(`Email inválido: ${invalid}`);
    else setError(null);
    onChange(next);
    setDraft("");
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === ";" || e.key === "Tab") {
      if (draft.trim()) {
        e.preventDefault();
        tryAdd(draft);
      }
    } else if (e.key === "Backspace" && !draft && values.length) {
      const last = values[values.length - 1];
      if (!allowRemovePrimary && primaryEmail && last.toLowerCase() === primaryEmail.toLowerCase()) return;
      onChange(values.slice(0, -1));
    }
  };

  const remove = (email: string) => {
    if (!allowRemovePrimary && primaryEmail && email.toLowerCase() === primaryEmail.toLowerCase()) return;
    onChange(values.filter((v) => v !== email));
  };

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 min-h-[42px] focus-within:ring-1 focus-within:ring-ring">
        {values.map((email) => {
          const isPrimary = primaryEmail && email.toLowerCase() === primaryEmail.toLowerCase();
          const canRemove = allowRemovePrimary || !isPrimary;
          return (
            <Badge
              key={email}
              variant={isPrimary ? "default" : "secondary"}
              className="gap-1 pr-1 font-normal"
            >
              <span className="truncate max-w-[220px]">{email}</span>
              {isPrimary && (
                <span className="text-[10px] uppercase opacity-80 ml-1">Principal</span>
              )}
              {canRemove && (
                <button
                  type="button"
                  onClick={() => remove(email)}
                  className="ml-0.5 rounded-full hover:bg-background/30 p-0.5"
                  aria-label={`Remover ${email}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          );
        })}
        <Input
          id={id}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKey}
          onBlur={() => draft.trim() && tryAdd(draft)}
          placeholder={values.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[140px] h-7 border-0 shadow-none focus-visible:ring-0 px-1 text-sm"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
