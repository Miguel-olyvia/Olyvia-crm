import { useState } from "react";
import { PhoneInput } from "@/components/PhoneInput";
import {
  DEFAULT_DIAL_CODE,
  joinInternationalPhone,
  splitInternationalPhone,
} from "@/lib/phone/splitInternationalPhone";

interface LeadPhoneFieldProps {
  label?: string;
  value: unknown;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  /** aria-invalid no campo do numero (ex.: a ficha recusou o telefone). */
  invalid?: boolean;
  /** Id do elemento que explica o erro (aria-describedby no campo do numero). */
  describedBy?: string;
}

/**
 * Telefone de uma lead com o seletor de indicativo sempre visível.
 * O valor guardado continua a ser uma só string "+<indicativo><dígitos>".
 *
 * Enquanto não há dígitos, o valor guardado é vazio e não pode transportar o
 * indicativo; por isso a escolha fica em estado local até haver número.
 */
export function LeadPhoneField({ label, value, onChange, required, placeholder, invalid, describedBy }: LeadPhoneFieldProps) {
  const [pickedDialCode, setPickedDialCode] = useState(DEFAULT_DIAL_CODE);
  const parsed = splitInternationalPhone(value);
  const hasValue = parsed.digits !== "";
  const dialCode = hasValue ? parsed.dialCode : pickedDialCode;

  return (
    <PhoneInput
      label={label}
      required={required}
      placeholder={placeholder}
      invalid={invalid}
      describedBy={describedBy}
      phoneValue={parsed.digits}
      countryCodeValue={dialCode}
      onCountryCodeChange={(newCode) => {
        setPickedDialCode(newCode);
        onChange(joinInternationalPhone(newCode, parsed.digits));
      }}
      onPhoneChange={(newDigits) => onChange(joinInternationalPhone(dialCode, newDigits))}
    />
  );
}
