import { useId } from "react";
import { Building2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EntityKind } from "@/lib/entityKind";

interface EntityKindSelectorProps {
  value: EntityKind;
  onChange: (kind: EntityKind) => void;
  disabled?: boolean;
  className?: string;
}

const OPTIONS: { value: EntityKind; label: string; Icon: typeof User }[] = [
  { value: "person", label: "Pessoa", Icon: User },
  { value: "organization", label: "Empresa", Icon: Building2 },
];

/**
 * Pessoa | Empresa. Radios nativos (Tab entra no grupo, as setas mudam de
 * opcao, o espaco escolhe), alvos de 44 px, escolha marcada com contorno e
 * texto (nao so com cor), tema escuro e ecras estreitos.
 */
export function EntityKindSelector({ value, onChange, disabled = false, className }: EntityKindSelectorProps) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label="Tipo de ficha" className={cn("grid grid-cols-2 gap-2", className)}>
      {OPTIONS.map(({ value: optionValue, label, Icon }) => {
        const checked = value === optionValue;
        return (
          <label
            key={optionValue}
            className={cn(
              "relative flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
              "border-input bg-background text-foreground hover:bg-accent dark:bg-input/30 dark:hover:bg-accent/60",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2",
              checked && "border-primary bg-primary/10 text-primary ring-1 ring-primary dark:bg-primary/20",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="radio"
              name={name}
              value={optionValue}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(optionValue)}
              className="peer sr-only"
            />
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{label}</span>
          </label>
        );
      })}
    </div>
  );
}
