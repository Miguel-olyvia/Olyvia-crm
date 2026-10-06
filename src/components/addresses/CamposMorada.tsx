import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import {
  normalizarCodigoPostal,
  type CampoMorada,
  type ErrosMorada,
  type MoradaCampos,
} from "@/lib/addresses/validarMorada";

interface CamposMoradaProps {
  valor: MoradaCampos;
  onChange: (valor: MoradaCampos) => void;
  erros?: ErrosMorada;
  // Prefixo dos ids dos campos (têm de ser únicos na página).
  idPrefix: string;
  disabled?: boolean;
}

/**
 * Campos de uma morada (rua, número, andar, fração, código postal,
 * localidade) — a mesma estrutura em todo o CRM: morada de entrega e morada
 * principal do cliente. Controlado: o pai guarda o valor e os erros (ver
 * validarMorada). O código postal é normalizado ao sair do campo
 * ("1000001" → "1000-001").
 */
export const CamposMorada = ({ valor, onChange, erros, idPrefix, disabled }: CamposMoradaProps) => {
  const { t } = useTranslation();

  const setCampo = (campo: CampoMorada, texto: string) => onChange({ ...valor, [campo]: texto });

  const handleBlurCodigoPostal = () => {
    const normalizado = normalizarCodigoPostal(valor.postal_code);
    if (normalizado !== valor.postal_code) setCampo("postal_code", normalizado);
  };

  const campo = (
    nome: CampoMorada,
    label: string,
    extra?: { placeholder?: string; required?: boolean; onBlur?: () => void; inputMode?: "numeric" },
  ) => {
    const id = `${idPrefix}_${nome}`;
    const erro = erros?.[nome];
    return (
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs">
          {label}{extra?.required ? " *" : ""}
        </Label>
        <Input
          id={id}
          value={valor[nome]}
          onChange={(e) => setCampo(nome, e.target.value)}
          onBlur={extra?.onBlur}
          placeholder={extra?.placeholder}
          inputMode={extra?.inputMode}
          disabled={disabled}
          aria-invalid={!!erro}
          aria-describedby={erro ? `${id}_erro` : undefined}
          className={erro ? "border-destructive focus-visible:ring-destructive" : undefined}
        />
        {erro && (
          <p id={`${id}_erro`} className="text-xs text-destructive">
            {erro}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="sm:col-span-3">{campo("street", t("deliveryAddresses.fields.street"), { required: true })}</div>
        {campo("number", t("deliveryAddresses.fields.number"))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {campo("floor", t("deliveryAddresses.fields.floor"), { placeholder: "3º" })}
        {campo("unit", t("deliveryAddresses.fields.unit"), { placeholder: "Esq" })}
        {campo("postal_code", t("deliveryAddresses.fields.postalCode"), {
          placeholder: "1000-001",
          required: true,
          onBlur: handleBlurCodigoPostal,
          inputMode: "numeric",
        })}
        {campo("city", t("deliveryAddresses.fields.city"), { required: true })}
      </div>
    </div>
  );
};
