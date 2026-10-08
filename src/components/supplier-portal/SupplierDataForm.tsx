import { useState, type FormEvent } from "react";
import { Info, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PhoneInput } from "@/components/PhoneInput";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  getSpHint,
  spErrorMessage,
  spUpdateMySupplierData,
  type SpMySupplierData,
  type SpUpdateMySupplierDataResult,
} from "@/lib/supplierPortal/spRpc";
import {
  joinCompanyNames,
  toFormValues,
  validateSupplierData,
  type SupplierDataErrors,
  type SupplierDataField,
  type SupplierDataFormValues,
} from "@/lib/supplierPortal/supplierDataForm";

interface SupplierDataFormProps {
  /** Resultado de sp_get_my_supplier_data. */
  initial: SpMySupplierData;
  submitLabel: string;
  /** Prefixo dos ids dos campos (o modal e a página podem coexistir). */
  idPrefix: string;
  onSaved: (result: SpUpdateMySupplierDataResult, values: SupplierDataFormValues) => void;
  /** no_supplier_access: o acesso caiu entretanto. */
  onNoAccess?: () => void;
  className?: string;
}

/**
 * Formulário dos dados da empresa no Portal do Fornecedor, partilhado pelo
 * passo obrigatório "Confirme os seus dados" e pela página "Os meus dados".
 * Com can_edit=false (utilizador de consulta) fica só de leitura.
 */
export function SupplierDataForm({ initial, submitLabel, idPrefix, onSaved, onNoAccess, className }: SupplierDataFormProps) {
  const { toast } = useToast();
  const [values, setValues] = useState<SupplierDataFormValues>(() => toFormValues(initial.data));
  // Base de comparação do payload (só vai o que mudou). Passa a ser o que se
  // gravou, para que um segundo "Guardar" sem remontar não reenvie o mesmo.
  const [baseline, setBaseline] = useState<SupplierDataFormValues>(() => toFormValues(initial.data));
  const [errors, setErrors] = useState<SupplierDataErrors>({});
  const [saving, setSaving] = useState(false);
  const readOnly = !initial.can_edit;
  const companiesLabel = joinCompanyNames(initial.companies.map((c) => c.name));
  const manyCompanies = initial.companies.length > 1;

  const set = (field: SupplierDataField) => (value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (readOnly || saving) return;
    const result = validateSupplierData(values, baseline);
    // "in" e não !result.ok: sem strictNullChecks o TS não estreita pelo literal.
    if ("errors" in result) {
      setErrors(result.errors);
      const first: string | undefined = Object.values(result.errors).find((m): m is string => !!m);
      toast({ title: "Verifique os dados", description: first || "Há campos inválidos.", variant: "destructive" });
      return;
    }
    setErrors({});
    setValues(result.values);
    setSaving(true);
    try {
      const saved = await spUpdateMySupplierData(result.payload);
      setBaseline(result.values);
      onSaved(saved, result.values);
    } catch (err) {
      if (getSpHint(err) === "no_supplier_access") onNoAccess?.();
      toast({ title: "Não foi possível guardar", description: spErrorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const id = (field: string) => `${idPrefix}-${field}`;

  const textField = (
    field: SupplierDataField,
    label: string,
    opts: { type?: string; autoComplete?: string; placeholder?: string; required?: boolean; maxLength?: number; className?: string } = {},
  ) => {
    const error = errors[field];
    return (
      <div className={cn("space-y-1.5", opts.className)}>
        <Label htmlFor={id(field)}>
          {label}
          {opts.required && <span className="text-destructive ml-1" aria-hidden="true">*</span>}
        </Label>
        <Input
          id={id(field)}
          type={opts.type ?? "text"}
          value={values[field]}
          onChange={(e) => set(field)(e.target.value)}
          autoComplete={opts.autoComplete}
          placeholder={opts.placeholder}
          maxLength={opts.maxLength}
          required={opts.required}
          disabled={readOnly || saving}
          aria-invalid={!!error}
          aria-describedby={error ? id(`${field}-error`) : undefined}
          className={cn("h-11", error && "border-destructive")}
        />
        {error && (
          <p id={id(`${field}-error`)} className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} noValidate className={cn("space-y-5", className)}>
      {readOnly && (
        <Alert>
          <Lock className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>Só o utilizador principal da conta pode alterar estes dados.</AlertDescription>
        </Alert>
      )}
      {!readOnly && manyCompanies && (
        <Alert>
          <Info className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>
            Estes dados ficam atualizados em todas as empresas com que trabalha: {companiesLabel}
          </AlertDescription>
        </Alert>
      )}

      <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-4" disabled={readOnly || saving}>
        <legend className="sr-only">Empresa e contacto</legend>
        {textField("name", "Nome da empresa", { required: true, autoComplete: "organization", maxLength: 200, className: "sm:col-span-2" })}

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={id("tax_id")}>NIF</Label>
          <Input id={id("tax_id")} value={initial.data.tax_id ?? ""} readOnly disabled className="h-11 font-mono" />
          <p className="text-xs text-muted-foreground">Para alterar o NIF contacte a empresa.</p>
        </div>

        {textField("contact_person", "Pessoa de contacto", { autoComplete: "name", maxLength: 200 })}
        {textField("email", "Email", { type: "email", autoComplete: "email", placeholder: "geral@empresa.pt", maxLength: 255 })}

        <div className="sm:col-span-2 space-y-1.5">
          <PhoneInput
            label="Telefone"
            phoneValue={values.phone}
            countryCodeValue={values.phone_country_code}
            onPhoneChange={set("phone")}
            onCountryCodeChange={set("phone_country_code")}
            disabled={readOnly || saving}
          />
          {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-4" disabled={readOnly || saving}>
        <legend className="text-sm font-medium text-foreground mb-2">Morada</legend>
        {textField("address", "Morada", { autoComplete: "street-address", maxLength: 255, className: "sm:col-span-2" })}
        {textField("postal_code", "Código postal", { autoComplete: "postal-code", placeholder: "0000-000", maxLength: 20 })}
        {textField("city", "Cidade", { autoComplete: "address-level2", maxLength: 100 })}
        {textField("country", "País", { autoComplete: "country-name", placeholder: "Portugal", maxLength: 100 })}
        {textField("website", "Website", { type: "url", autoComplete: "url", placeholder: "www.empresa.pt", maxLength: 255 })}
      </fieldset>

      {!readOnly && (
        <div className="flex justify-end">
          <Button type="submit" className="h-11 w-full sm:w-auto gap-2" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {saving ? "A guardar…" : submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
