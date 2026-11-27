import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRY_CODES, CountryCode } from "@/constants/countryCodes";
import { useId, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Textos dados por quem usa o componente fora do CRM (o portal, no idioma dele). Sem isto, o PhoneInput usa o
 * t() do CRM, como sempre.
 */
export interface PhoneInputLabels {
  /** Placeholder e nome acessível da caixa de pesquisa de países. */
  pesquisar: string;
  /** «Número completo» (a nota por baixo do campo). */
  numeroCompleto: string;
  /** Nome acessível do seletor do indicativo. */
  indicativo: string;
  /** Nome acessível do campo do telefone quando não há `label` visível. */
  telefone: string;
  /** Nome de um país (chave em inglês de COUNTRY_CODES) no idioma de quem usa; sem isto, o t() do CRM. */
  nomesDosPaises?: (nome: string) => string;
}

interface PhoneInputProps {
  label?: string;
  phoneValue: string;
  countryCodeValue: string;
  onPhoneChange: (value: string) => void;
  onCountryCodeChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  labels?: PhoneInputLabels;
  /** Marca o campo do numero como invalido para quem usa leitor de ecra (aria-invalid). */
  invalid?: boolean;
  /** Id do elemento que explica o erro do campo do numero (aria-describedby). */
  describedBy?: string;
}

export function PhoneInput({
  label,
  phoneValue,
  countryCodeValue,
  onPhoneChange,
  onCountryCodeChange,
  required = false,
  disabled = false,
  placeholder = "912 345 678",
  labels,
  invalid,
  describedBy,
}: PhoneInputProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const phoneId = useId();
  const countryName = (name: string): string => labels?.nomesDosPaises?.(name) ?? t(`countries.${name}`);
  const searchText = labels?.pesquisar ?? t('common.searchCountry');
  const fullNumberText = labels?.numeroCompleto ?? t('common.fullNumber');

  const filteredCountries = COUNTRY_CODES.filter(
    (country) =>
      countryName(country.name).toLowerCase().includes(searchTerm.toLowerCase()) ||
      country.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      country.dialCode.includes(searchTerm) ||
      country.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handlePhoneInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow only numbers and spaces
    const value = e.target.value.replace(/[^\d\s]/g, '');
    onPhoneChange(value);
  };

  return (
    <div className="space-y-2">
      {label && (
        <Label htmlFor={phoneId}>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}
      <div className="flex gap-2">
        <Select
          value={countryCodeValue}
          onValueChange={onCountryCodeChange}
          disabled={disabled}
        >
          <SelectTrigger className="w-[140px]" aria-label={labels?.indicativo}>
            <SelectValue>
              {COUNTRY_CODES.find(c => c.dialCode === countryCodeValue)?.flag}{" "}
              {countryCodeValue}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <div className="px-2 pb-2">
              <Input
                placeholder={searchText}
                aria-label={labels ? searchText : undefined}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8"
              />
            </div>
            {filteredCountries.map((country: CountryCode) => (
              <SelectItem key={country.code} value={country.dialCode}>
                <span className="flex items-center gap-2">
                  <span>{country.flag}</span>
                  <span>{countryName(country.name)}</span>
                  <span className="text-muted-foreground">{country.dialCode}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Input
          id={phoneId}
          type="tel"
          aria-label={!label ? labels?.telefone : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          value={phoneValue}
          onChange={handlePhoneInput}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className="flex-1"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {fullNumberText}: {countryCodeValue} {phoneValue}
      </p>
    </div>
  );
}
