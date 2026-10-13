// Separador "Dados" da ficha do fornecedor (FornecedorDados do protótipo): os
// mesmos campos, validação e gravação de sempre (o submit continua em
// Suppliers.tsx); só muda o arranjo. O botão "Guardar" está no rodapé da folha
// e submete este formulário pelo atributo form={formId}.
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OrganizationFormSection, type OrganizationSelection } from "@/components/OrganizationFormSection";

export interface SupplierFormData {
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  tax_id: string;
  delivery_sla_days: string | number;
  website: string;
  notes: string;
  is_active: boolean;
}

interface SupplierDataFormProps {
  formId: string;
  formData: SupplierFormData;
  setFormData: Dispatch<SetStateAction<SupplierFormData>>;
  fieldErrors: Record<string, string>;
  organizationSelection: OrganizationSelection;
  onOrganizationChange: (v: OrganizationSelection) => void;
  onSubmit: (e: FormEvent) => void;
  t: (key: string) => string;
  /** Portal ligado (ativo ou convidado): a BD recusa mudar NIF e empresa. */
  portalLinked?: boolean;
  /** Leva ao separador Portal (onde se revoga o acesso). */
  onGoToPortal?: () => void;
}

type TextField = Exclude<keyof SupplierFormData, "is_active">;

export function SupplierDataForm({
  formId,
  formData,
  setFormData,
  fieldErrors,
  organizationSelection,
  onOrganizationChange,
  onSubmit,
  t,
  portalLinked = false,
  onGoToPortal,
}: SupplierDataFormProps) {
  const field = (
    key: TextField,
    label: string,
    opts: { required?: boolean; type?: string; span2?: boolean; hint?: string; inputProps?: Record<string, unknown> } = {},
  ) => {
    const err = fieldErrors[key];
    const hintId = opts.hint ? `${formId}-${key}-hint` : undefined;
    const errId = err ? `${formId}-${key}-err` : undefined;
    return (
      <div className={cn("space-y-1.5", opts.span2 && "sm:col-span-2")}>
        <Label htmlFor={`${formId}-${key}`}>
          {label}
          {opts.required ? " *" : ""}
        </Label>
        <Input
          id={`${formId}-${key}`}
          type={opts.type ?? "text"}
          value={formData[key]}
          onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))}
          required={opts.required}
          aria-invalid={!!err}
          aria-describedby={[hintId, errId].filter(Boolean).join(" ") || undefined}
          className={err ? "border-destructive" : ""}
          {...opts.inputProps}
        />
        {opts.hint && !err ? (
          <p id={hintId} className="text-xs text-muted-foreground">
            {opts.hint}
          </p>
        ) : null}
        {err ? (
          <p id={errId} className="text-sm text-destructive" role="alert">
            {err}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <form id={formId} onSubmit={onSubmit} className="space-y-4">
      {portalLinked && (
        <div
          role="note"
          className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-3 text-sm text-amber-900 dark:text-warning"
        >
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="space-y-2">
            <p>
              NIF e empresa ficam bloqueados enquanto o portal estiver ligado (o fornecedor confirmou estes dados). Para os
              mudar, revogue primeiro o acesso no separador Portal.
            </p>
            {onGoToPortal && (
              <Button type="button" variant="outline" size="sm" className="h-7" onClick={onGoToPortal}>
                <Lock className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Ir para o Portal
              </Button>
            )}
          </div>
        </div>
      )}

      <OrganizationFormSection
        value={organizationSelection}
        onChange={onOrganizationChange}
        showSecondaryCompanies={false}
        multiSelectCompanies={true}
      />
      {fieldErrors.organization_id && (
        <p className="text-sm text-destructive" role="alert">
          {fieldErrors.organization_id}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {field("name", t("suppliers.form.name"), { required: true, span2: true })}
        {field("contact_person", t("suppliers.form.contactPerson"))}
        {field("email", t("suppliers.form.email"), { type: "email" })}
        {field("phone", t("suppliers.form.phone"), { type: "tel" })}
        {field("tax_id", t("suppliers.form.taxId"), {
          hint: "Obrigatório e válido para convidar para o portal.",
          inputProps: { inputMode: "text", autoComplete: "off" },
        })}
        {field("delivery_sla_days", t("suppliers.form.deliverySlaDays"), {
          type: "number",
          inputProps: { min: "1", step: "1" },
        })}
        {field("address", t("suppliers.form.address"), { span2: true })}
        {field("city", t("suppliers.form.city"))}
        {field("postal_code", t("suppliers.form.postalCode"), { inputProps: { placeholder: "0000-000" } })}
        {field("country", t("suppliers.form.country"))}
        {field("website", t("suppliers.form.website"), { type: "url" })}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${formId}-notes`}>{t("suppliers.form.notes")}</Label>
          <Textarea
            id={`${formId}-notes`}
            value={formData.notes}
            onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
            rows={3}
            aria-invalid={!!fieldErrors.notes}
            className={fieldErrors.notes ? "border-destructive" : ""}
          />
          {fieldErrors.notes && (
            <p className="text-sm text-destructive" role="alert">
              {fieldErrors.notes}
            </p>
          )}
        </div>
        <div className="flex min-h-6 items-center gap-2 sm:col-span-2">
          <Switch
            id={`${formId}-is_active`}
            checked={formData.is_active}
            onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, is_active: !!checked }))}
          />
          <Label htmlFor={`${formId}-is_active`} className="cursor-pointer">
            {t("suppliers.form.active")}
          </Label>
        </div>
      </div>
    </form>
  );
}
