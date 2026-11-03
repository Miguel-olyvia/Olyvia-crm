// Campos das condições comerciais estruturadas de um rascunho de contrato de
// fornecedor (as chaves de fn_sc_aplicar_condicoes + validade). Só
// apresentação: o estado e a gravação estão em SupplierContractDraftEditor.
import type { Dispatch, SetStateAction } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  SHIPPING_TERMS,
  SHIPPING_TERMS_LABEL,
  type ConditionsFormValues,
  type PaymentMethod,
  type ShippingTerms,
} from "@/lib/supplierContracts/tipos";

const NONE = "__none__";

interface Props {
  idPrefix: string;
  values: ConditionsFormValues;
  setValues: Dispatch<SetStateAction<ConditionsFormValues>>;
  errors: Partial<Record<keyof ConditionsFormValues, string>>;
  disabled?: boolean;
}

export function SupplierContractConditionsFields({ idPrefix, values, setValues, errors, disabled = false }: Props) {
  const set = <K extends keyof ConditionsFormValues>(k: K, v: ConditionsFormValues[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  const field = (
    k: keyof ConditionsFormValues,
    label: string,
    opts: { type?: string; suffix?: string; required?: boolean; inputMode?: "numeric" | "decimal"; span2?: boolean } = {},
  ) => {
    const id = `${idPrefix}-${k}`;
    const err = errors[k];
    return (
      <div className={cn("space-y-1.5", opts.span2 && "sm:col-span-2")}>
        <Label htmlFor={id}>
          {label}
          {opts.required ? " *" : ""}
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type={opts.type ?? "text"}
            inputMode={opts.inputMode}
            value={values[k] as string}
            onChange={(e) => set(k, e.target.value as never)}
            disabled={disabled}
            aria-invalid={!!err}
            aria-describedby={err ? `${id}-err` : undefined}
            className={cn("h-9", err && "border-destructive")}
          />
          {opts.suffix ? <span className="shrink-0 text-sm text-muted-foreground">{opts.suffix}</span> : null}
        </div>
        {err ? (
          <p id={`${id}-err`} className="text-xs text-destructive" role="alert">
            {err}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {field("payment_terms_days", "Prazo de pagamento", { suffix: "dias", inputMode: "numeric", required: true })}

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-payment_method`}>Forma de pagamento *</Label>
        <Select
          value={values.payment_method || NONE}
          onValueChange={(v) => set("payment_method", v === NONE ? "" : (v as PaymentMethod))}
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-payment_method`} className="h-9">
            <SelectValue placeholder="Escolher" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {PAYMENT_METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {PAYMENT_METHOD_LABEL[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {field("delivery_sla_days", "Prazo de entrega", { suffix: "dias", inputMode: "numeric" })}

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-shipping_terms`}>Portes</Label>
        <Select
          value={values.shipping_terms || NONE}
          onValueChange={(v) => set("shipping_terms", v === NONE ? "" : (v as ShippingTerms))}
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-shipping_terms`} className="h-9">
            <SelectValue placeholder="Escolher" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {SHIPPING_TERMS.map((m) => (
              <SelectItem key={m} value={m}>
                {SHIPPING_TERMS_LABEL[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {values.shipping_terms === "gratis_acima_minimo" &&
        field("shipping_free_from", "Portes grátis a partir de", { suffix: "€", inputMode: "decimal", required: true })}
      {field("discount_percent", "Desconto", { suffix: "%", inputMode: "decimal" })}
      {field("min_order_value", "Encomenda mínima", { suffix: "€", inputMode: "decimal" })}

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-returns_accepted`}>Devoluções aceites</Label>
        <Select
          value={values.returns_accepted || NONE}
          onValueChange={(v) => set("returns_accepted", v === NONE ? "" : (v as "sim" | "nao"))}
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-returns_accepted`} className="h-9">
            <SelectValue placeholder="Escolher" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            <SelectItem value="sim">Sim</SelectItem>
            <SelectItem value="nao">Não</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {values.returns_accepted === "sim" && field("returns_days", "Prazo de devolução", { suffix: "dias", inputMode: "numeric" })}

      {values.returns_accepted === "sim" && (
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-returns_notes`}>Condições de devolução</Label>
          <Textarea
            id={`${idPrefix}-returns_notes`}
            rows={2}
            value={values.returns_notes}
            onChange={(e) => set("returns_notes", e.target.value)}
            disabled={disabled}
            aria-invalid={!!errors.returns_notes}
          />
          {errors.returns_notes ? <p className="text-xs text-destructive">{errors.returns_notes}</p> : null}
        </div>
      )}

      {field("valid_from", "Início da validade", { type: "date" })}
      {field("valid_until", "Fim da validade", { type: "date" })}

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-conditions_notes`}>Observações</Label>
        <Textarea
          id={`${idPrefix}-conditions_notes`}
          rows={3}
          value={values.conditions_notes}
          onChange={(e) => set("conditions_notes", e.target.value)}
          disabled={disabled}
          aria-invalid={!!errors.conditions_notes}
        />
        {errors.conditions_notes ? <p className="text-xs text-destructive">{errors.conditions_notes}</p> : null}
      </div>
    </div>
  );
}
