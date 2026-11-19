import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Info, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PhoneInput, type PhoneInputLabels } from "@/components/PhoneInput";
import { translations } from "@/translations/index";
import { useToast } from "@/hooks/use-toast";
import { seVazio, useMoradaPorCodigoPostal } from "@/hooks/useMoradaPorCodigoPostal";
import { ehPortugal } from "@/lib/addresses/procurarCodigoPostal";
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
  supplierDataMessages,
  toFormValues,
  validateSupplierData,
  type SupplierDataErrors,
  type SupplierDataField,
  type SupplierDataFormValues,
} from "@/lib/supplierPortal/supplierDataForm";
import { marcarMensagem, resolverMensagemMarcada, usePortalT } from "@/portal-i18n";

/** Nome de um país (chave em inglês) no idioma do portal; sem tradução fica o nome em inglês. */
function nomeDoPais(nome: string, idioma: string): string {
  const doIdioma = (translations as unknown as Record<string, Record<string, string> | undefined>)[idioma];
  return doIdioma?.[`countries.${nome}`] ?? nome;
}

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
  /** Campos extra no fim do formulário (p.ex. o telemóvel pessoal no passo "Confirme os seus dados"). */
  extraFields?: ReactNode;
  /** Corre depois da validação e antes de gravar; false = não gravar (o próprio mostra o erro). */
  beforeSave?: () => Promise<boolean>;
}

/**
 * Formulário dos dados da empresa no Portal do Fornecedor, partilhado pelo
 * passo obrigatório "Confirme os seus dados" e pela página "Os meus dados".
 * Com can_edit=false (utilizador de consulta) fica só de leitura.
 *
 * O PhoneInput é do CRM: o portal passa-lhe os textos (rótulo, indicativo, pesquisa, nota e nomes dos países)
 * no idioma do portal; sem eles ele usaria o idioma do CRM.
 */
export function SupplierDataForm({ initial, submitLabel, idPrefix, onSaved, onNoAccess, className, extraFields, beforeSave }: SupplierDataFormProps) {
  const { toast } = useToast();
  const { t, idioma } = usePortalT();
  // Os erros por campo ficam em estado como mensagens com a CHAVE (marcadas) e traduzem-se ao mostrar:
  // mudar de idioma com o erro visível muda também o erro.
  const messages = useMemo(() => supplierDataMessages(marcarMensagem), []);
  // O PhoneInput é do CRM: o portal dá-lhe os textos no idioma do portal (incluindo os nomes dos países).
  const phoneLabels = useMemo<PhoneInputLabels>(
    () => ({
      pesquisar: t("sp.dados.form.pesquisarPais"),
      numeroCompleto: t("sp.dados.form.numeroCompleto"),
      indicativo: t("sp.dados.form.indicativo"),
      telefone: t("sp.dados.form.telefoneCampo"),
      nomesDosPaises: (nome: string) => nomeDoPais(nome, idioma),
    }),
    [t, idioma],
  );
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
  // Código postal completo: procura a rua e a cidade e preenche o que está vazio (reunião de 30/10).
  useMoradaPorCodigoPostal(values.postal_code, (m) => setValues((v) => ({
    ...v, address: seVazio(v.address, m.rua), city: seVazio(v.city, m.localidade),
  })), ehPortugal(values.country));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (readOnly || saving) return;
    const result = validateSupplierData(values, baseline, messages);
    // "in" e não !result.ok: sem strictNullChecks o TS não estreita pelo literal.
    if ("errors" in result) {
      setErrors(result.errors);
      const first: string | undefined = Object.values(result.errors).find((m): m is string => !!m);
      toast({
        title: t("sp.dados.aviso.verifique"),
        description: first ? resolverMensagemMarcada(first, idioma) : t("sp.dados.aviso.camposInvalidos"),
        variant: "destructive",
      });
      return;
    }
    setErrors({});
    setValues(result.values);
    setSaving(true);
    try {
      if (beforeSave && !(await beforeSave())) return;
      const saved = await spUpdateMySupplierData(result.payload);
      setBaseline(result.values);
      onSaved(saved, result.values);
    } catch (err) {
      if (getSpHint(err) === "no_supplier_access") onNoAccess?.();
      toast({ title: t("sp.dados.aviso.naoGuardou"), description: spErrorMessage(err), variant: "destructive" });
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
            {resolverMensagemMarcada(error, idioma)}
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
          <AlertDescription>{t("sp.dados.form.soLeitura")}</AlertDescription>
        </Alert>
      )}
      {!readOnly && manyCompanies && (
        <Alert>
          <Info className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{t("sp.dados.form.varias", { empresas: companiesLabel })}</AlertDescription>
        </Alert>
      )}

      <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-4" disabled={readOnly || saving}>
        <legend className="sr-only">{t("sp.dados.form.empresaContacto")}</legend>
        {textField("name", t("sp.dados.form.nome"), { required: true, autoComplete: "organization", maxLength: 200, className: "sm:col-span-2" })}

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={id("tax_id")}>{t("sp.dados.form.nif")}</Label>
          <Input id={id("tax_id")} value={initial.data.tax_id ?? ""} readOnly disabled className="h-11 font-mono" />
          <p className="text-xs text-muted-foreground">{t("sp.dados.form.nifNota")}</p>
        </div>

        {textField("contact_person", t("sp.dados.form.pessoaContacto"), { autoComplete: "name", maxLength: 200 })}
        {textField("email", t("sp.dados.form.email"), {
          type: "email",
          autoComplete: "email",
          placeholder: t("sp.dados.form.emailExemplo"),
          maxLength: 255,
        })}

        <div className="sm:col-span-2 space-y-1.5">
          <PhoneInput
            label={t("sp.dados.form.telefone")}
            labels={phoneLabels}
            phoneValue={values.phone}
            countryCodeValue={values.phone_country_code}
            onPhoneChange={set("phone")}
            onCountryCodeChange={set("phone_country_code")}
            disabled={readOnly || saving}
          />
          {errors.phone && <p className="text-sm text-destructive">{resolverMensagemMarcada(errors.phone, idioma)}</p>}
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-4" disabled={readOnly || saving}>
        <legend className="text-sm font-medium text-foreground mb-2">{t("sp.dados.form.moradaGrupo")}</legend>
        {textField("address", t("sp.dados.form.morada"), { autoComplete: "street-address", maxLength: 255, className: "sm:col-span-2" })}
        {textField("postal_code", t("sp.dados.form.codigoPostal"), {
          autoComplete: "postal-code",
          placeholder: t("sp.dados.form.codigoPostalExemplo"),
          maxLength: 20,
        })}
        {textField("city", t("sp.dados.form.cidade"), { autoComplete: "address-level2", maxLength: 100 })}
        {textField("country", t("sp.dados.form.pais"), {
          autoComplete: "country-name",
          placeholder: t("sp.dados.form.paisExemplo"),
          maxLength: 100,
        })}
        {textField("website", t("sp.dados.form.website"), {
          type: "url",
          autoComplete: "url",
          placeholder: t("sp.dados.form.websiteExemplo"),
          maxLength: 255,
        })}
      </fieldset>

      {extraFields}

      {!readOnly && (
        <div className="flex justify-end">
          <Button type="submit" className="h-11 w-full sm:w-auto gap-2" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {saving ? t("sp.dados.form.aGuardar") : submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
