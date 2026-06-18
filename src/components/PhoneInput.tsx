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
import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";

interface PhoneInputProps {
  label?: string;
  phoneValue: string;
  countryCodeValue: string;
  onPhoneChange: (value: string) => void;
  onCountryCodeChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
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
}: PhoneInputProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredCountries = COUNTRY_CODES.filter(
    (country) =>
      t(`countries.${country.name}`).toLowerCase().includes(searchTerm.toLowerCase()) ||
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
        <Label>
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
          <SelectTrigger className="w-[140px]">
            <SelectValue>
              {COUNTRY_CODES.find(c => c.dialCode === countryCodeValue)?.flag}{" "}
              {countryCodeValue}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <div className="px-2 pb-2">
              <Input
                placeholder={t('common.searchCountry')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8"
              />
            </div>
            {filteredCountries.map((country: CountryCode) => (
              <SelectItem key={country.code} value={country.dialCode}>
                <span className="flex items-center gap-2">
                  <span>{country.flag}</span>
                  <span>{t(`countries.${country.name}`)}</span>
                  <span className="text-muted-foreground">{country.dialCode}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Input
          type="tel"
          value={phoneValue}
          onChange={handlePhoneInput}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className="flex-1"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {t('common.fullNumber')}: {countryCodeValue} {phoneValue}
      </p>
    </div>
  );
}
