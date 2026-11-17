import { useId } from "react";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface SmsVariable {
  key: string;
  label: string;
}

/** Variáveis que o SMS de confirmação aceita (as mesmas que o book-slot substitui; sem aliases). */
const SMS_VARIABLES: SmsVariable[] = [
  { key: "lead_name", label: "Nome do cliente" },
  { key: "meeting_date", label: "Data e hora da visita" },
  { key: "technician_name", label: "Técnico" },
  { key: "location", label: "Morada da visita" },
  { key: "company_name", label: "Empresa" },
  { key: "lead_phone", label: "Telefone do cliente" },
  { key: "lead_email", label: "Email do cliente" },
];

const SMS_LINK_VARIABLE: SmsVariable = { key: "cancel_url", label: "Link gerir/cancelar" };

interface SmsVariableButtonsProps {
  /** Só com o link ligado é que `cancel_url` sai preenchido; desligado, sai vazio. */
  includeLink: boolean;
  onInsert: (key: string) => void;
}

/** Botões que inserem `{{variavel}}` na mensagem do SMS. */
export function SmsVariableButtons({ includeLink, onInsert }: SmsVariableButtonsProps) {
  const variables = [...SMS_VARIABLES, SMS_LINK_VARIABLE];
  const labelId = useId();
  const hintId = useId();
  return (
    <div className="space-y-1">
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground" id={labelId}>Inserir variável:</span>
        {variables.map((v) => {
          const disabled = v.key === SMS_LINK_VARIABLE.key && !includeLink;
          return (
            <button
              key={v.key}
              type="button"
              aria-disabled={disabled || undefined}
              aria-label={`Inserir variável ${v.label} {{${v.key}}}`}
              aria-describedby={disabled ? hintId : undefined}
              onClick={() => {
                if (!disabled) onInsert(v.key);
              }}
              className={cn(
                badgeVariants({ variant: "outline" }),
                "gap-1.5 font-normal cursor-pointer hover:bg-muted aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent",
              )}
            >
              <span>{v.label}</span>
              <code className="font-mono text-[10px] text-muted-foreground">{`{{${v.key}}}`}</code>
            </button>
          );
        })}
      </div>
      {!includeLink && (
        <p id={hintId} className="text-[10px] text-muted-foreground">
          «Link gerir/cancelar» só fica ativo com a opção «Incluir link de gerir/cancelar no SMS» ligada; desligada, sai vazio.
        </p>
      )}
    </div>
  );
}
