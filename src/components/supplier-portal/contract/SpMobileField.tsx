import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface SpMobileFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  hint?: string;
  autoFocus?: boolean;
  className?: string;
}

/**
 * Telemóvel pessoal do utilizador do portal (supplier_portal_users.phone, via
 * sp_set_my_phone). É para onde segue o código SMS da assinatura do contrato.
 * Aceita 912 345 678 (Portugal) ou o número internacional com +indicativo.
 */
export function SpMobileField({
  id,
  value,
  onChange,
  error,
  disabled,
  required,
  label = "O seu telemóvel",
  hint = "É para este número que enviamos o código SMS quando assinar um contrato.",
  autoFocus,
  className,
}: SpMobileFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive ml-1" aria-hidden="true">*</span>}
      </Label>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="912 345 678 ou +34 600 000 000"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d\s+()./-]/g, ""))}
        maxLength={25}
        disabled={disabled}
        required={required}
        autoFocus={autoFocus}
        aria-invalid={!!error}
        aria-describedby={error ? `${errorId} ${hintId}` : hintId}
        className={cn("h-11", error && "border-destructive")}
      />
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
      <p id={hintId} className="text-xs text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}
