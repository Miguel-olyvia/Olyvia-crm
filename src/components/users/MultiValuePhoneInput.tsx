import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X, Phone, Star } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { COUNTRY_CODES, CountryCode } from "@/constants/countryCodes";

export interface PhoneEntry {
  phone_number: string;
  country_code: string;
  phone_type: string;
  is_primary: boolean;
}

interface MultiValuePhoneInputProps {
  phones: PhoneEntry[];
  onChange: (phones: PhoneEntry[]) => void;
  disabled?: boolean;
}

export function MultiValuePhoneInput({
  phones,
  onChange,
  disabled = false,
}: MultiValuePhoneInputProps) {
  const { t } = useTranslation();
  const [newPhone, setNewPhone] = useState("");
  const [newCountryCode, setNewCountryCode] = useState("+351");
  const [newType, setNewType] = useState("mobile");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredCountries = COUNTRY_CODES.filter(
    (country) =>
      t(`countries.${country.name}`).toLowerCase().includes(searchTerm.toLowerCase()) ||
      country.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      country.dialCode.includes(searchTerm) ||
      country.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddPhone = () => {
    if (!newPhone.trim()) return;
    const cleanPhone = newPhone.replace(/[^\d\s]/g, '').trim();
    if (!cleanPhone) return;

    const isPrimary = phones.length === 0;
    onChange([
      ...phones,
      { phone_number: cleanPhone, country_code: newCountryCode, phone_type: newType, is_primary: isPrimary },
    ]);
    setNewPhone("");
    setNewType("mobile");
  };

  const handleRemovePhone = (index: number) => {
    const updated = phones.filter((_, i) => i !== index);
    if (updated.length > 0 && !updated.some(p => p.is_primary)) {
      updated[0].is_primary = true;
    }
    onChange(updated);
  };

  const handleSetPrimary = (index: number) => {
    const updated = phones.map((phone, i) => ({
      ...phone,
      is_primary: i === index,
    }));
    onChange(updated);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddPhone();
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "mobile": return t("users.phoneMobile");
      case "home": return t("users.phoneHome");
      case "work": return t("users.phoneWork");
      case "other": return t("users.phoneOther");
      default: return type;
    }
  };

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2">
        <Phone className="w-4 h-4 text-muted-foreground" />
        {t("users.phones")}
      </Label>
      
      {phones.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {phones.map((entry, index) => (
            <Badge key={index} variant={entry.is_primary ? "default" : "secondary"} className="flex items-center gap-1.5 py-1.5 px-3">
              {entry.is_primary && <Star className="w-3 h-3 fill-current" />}
              <span>{entry.country_code} {entry.phone_number}</span>
              <span className="text-xs opacity-70">({getTypeLabel(entry.phone_type)})</span>
              {!entry.is_primary && (
                <Button type="button" variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-transparent" onClick={() => handleSetPrimary(index)} disabled={disabled}>
                  <Star className="w-3 h-3" />
                </Button>
              )}
              <Button type="button" variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-transparent" onClick={() => handleRemovePhone(index)} disabled={disabled}>
                <X className="w-3 h-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Select value={newCountryCode} onValueChange={setNewCountryCode} disabled={disabled}>
          <SelectTrigger className="w-[120px]">
            <SelectValue>
              {COUNTRY_CODES.find(c => c.dialCode === newCountryCode)?.flag}{" "}
              {newCountryCode}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <div className="px-2 pb-2">
              <Input placeholder={t('common.searchCountry')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="h-8" />
            </div>
            {filteredCountries.map((country: CountryCode) => (
              <SelectItem key={country.code} value={country.dialCode}>
                <span className="flex items-center gap-2">
                  <span>{country.flag}</span>
                  <span className="text-muted-foreground">{country.dialCode}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Input type="tel" placeholder="912 345 678" value={newPhone} onChange={(e) => setNewPhone(e.target.value.replace(/[^\d\s]/g, ''))} onKeyDown={handleKeyDown} onBlur={() => { if (newPhone.trim()) handleAddPhone(); }} disabled={disabled} className="flex-1" />
        
        <Select value={newType} onValueChange={setNewType} disabled={disabled}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="mobile">{t("users.phoneMobile")}</SelectItem>
            <SelectItem value="home">{t("users.phoneHome")}</SelectItem>
            <SelectItem value="work">{t("users.phoneWork")}</SelectItem>
            <SelectItem value="other">{t("users.phoneOther")}</SelectItem>
          </SelectContent>
        </Select>
        
        <Button type="button" variant="outline" size="icon" onClick={handleAddPhone} disabled={disabled || !newPhone.trim()}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}