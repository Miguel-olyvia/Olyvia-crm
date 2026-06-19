import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { AdministrativeDivision } from '@/hooks/useAdministrativeDivisions';

export interface AddressFormData {
  id?: string;
  street: string;
  number: string;
  floor: string;
  unit: string;
  postal_code: string;
  city: string;
  city_id: string;
  district: string;
  district_id: string;
  country: string;
  extra: string;
  isFiscal: boolean;
}

export const emptyAddress: AddressFormData = {
  street: '',
  number: '',
  floor: '',
  unit: '',
  postal_code: '',
  city: '',
  city_id: '',
  district: '',
  district_id: '',
  country: 'PT',
  extra: '',
  isFiscal: false,
};

interface MultiAddressFormProps {
  addresses: AddressFormData[];
  onChange: (addresses: AddressFormData[]) => void;
  countries: { code: string; name: string }[];
  districts: AdministrativeDivision[];
  municipalities: AdministrativeDivision[];
  onDistrictChange: (index: number, districtId: string | null) => void;
  t: (key: string) => string;
}

export function MultiAddressForm({
  addresses,
  onChange,
  countries,
  districts,
  municipalities,
  onDistrictChange,
  t,
}: MultiAddressFormProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Sync expandedIndex when addresses change
  useEffect(() => {
    if (addresses.length > 0 && expandedIndex === null) {
      setExpandedIndex(0);
    } else if (addresses.length === 0) {
      setExpandedIndex(null);
    }
  }, [addresses.length]);
  const addAddress = () => {
    const newAddress = { ...emptyAddress, isFiscal: addresses.length === 0 };
    const newAddresses = [...addresses, newAddress];
    onChange(newAddresses);
    setExpandedIndex(newAddresses.length - 1);
  };

  const removeAddress = (index: number) => {
    const newAddresses = addresses.filter((_, i) => i !== index);
    onChange(newAddresses);
    if (expandedIndex === index) {
      setExpandedIndex(newAddresses.length > 0 ? 0 : null);
    } else if (expandedIndex !== null && expandedIndex > index) {
      setExpandedIndex(expandedIndex - 1);
    }
  };

  const updateAddress = (index: number, field: keyof AddressFormData, value: string | boolean) => {
    const newAddresses = addresses.map((addr, i) => {
      if (i === index) {
        // If setting isFiscal to true, unset it from all others
        if (field === 'isFiscal' && value === true) {
          return { ...addr, isFiscal: true };
        }
        return { ...addr, [field]: value };
      }
      // If another address is being set as fiscal, unset this one
      if (field === 'isFiscal' && value === true) {
        return { ...addr, isFiscal: false };
      }
      return addr;
    });
    onChange(newAddresses);
  };

  const handleDistrictChange = (index: number, districtId: string) => {
    const district = districts.find(d => d.id === districtId);
    const newAddresses = addresses.map((addr, i) => {
      if (i === index) {
        return {
          ...addr,
          district_id: districtId,
          district: district?.name || '',
          city_id: '',
          city: '',
        };
      }
      return addr;
    });
    onChange(newAddresses);
    onDistrictChange(index, districtId || null);
  };

  const handleCityChange = (index: number, cityId: string) => {
    const city = municipalities.find(m => m.id === cityId);
    const newAddresses = addresses.map((addr, i) => {
      if (i === index) {
        return {
          ...addr,
          city_id: cityId,
          city: city?.name || '',
        };
      }
      return addr;
    });
    onChange(newAddresses);
  };

  const handleCountryChange = (index: number, countryCode: string) => {
    const newAddresses = addresses.map((addr, i) => {
      if (i === index) {
        return {
          ...addr,
          country: countryCode,
          district_id: '',
          district: '',
          city_id: '',
          city: '',
        };
      }
      return addr;
    });
    onChange(newAddresses);
  };

  const getAddressSummary = (addr: AddressFormData) => {
    const parts = [addr.street, addr.number, addr.postal_code, addr.city].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : t('addresses.newAddress');
  };

  return (
    <div className="space-y-3">
      {addresses.length === 0 ? (
        <div className="text-center py-6 border rounded-lg border-dashed">
          <MapPin className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground mb-3">{t('addresses.noAddresses')}</p>
          <Button variant="outline" size="sm" onClick={addAddress}>
            <Plus className="h-4 w-4 mr-2" />
            {t('addresses.add')}
          </Button>
        </div>
      ) : (
        <>
          {addresses.map((addr, index) => (
            <Collapsible
              key={index}
              open={expandedIndex === index}
              onOpenChange={(open) => setExpandedIndex(open ? index : null)}
            >
              <Card className={cn(
                "overflow-hidden transition-colors",
                addr.isFiscal && "border-primary/50 bg-primary/5"
              )}>
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium truncate">
                        {getAddressSummary(addr)}
                      </span>
                      {addr.isFiscal && (
                        <Badge variant="default" className="shrink-0">
                          {t('addresses.fiscal')}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeAddress(index);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      {expandedIndex === index ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="p-3 pt-0 space-y-3 border-t">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <Label className="text-xs">{t('addresses.street')}</Label>
                        <Input
                          value={addr.street}
                          onChange={(e) => updateAddress(index, 'street', e.target.value)}
                          placeholder={t('addresses.streetPlaceholder')}
                          className="h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">{t('addresses.number')}</Label>
                        <Input
                          value={addr.number}
                          onChange={(e) => updateAddress(index, 'number', e.target.value)}
                          placeholder="10B"
                          className="h-9"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">{t('addresses.floor')}</Label>
                        <Input
                          value={addr.floor}
                          onChange={(e) => updateAddress(index, 'floor', e.target.value)}
                          placeholder="3º"
                          className="h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">{t('addresses.unit')}</Label>
                        <Input
                          value={addr.unit}
                          onChange={(e) => updateAddress(index, 'unit', e.target.value)}
                          placeholder="Esq."
                          className="h-9"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">{t('addresses.country')}</Label>
                        <Select
                          value={addr.country}
                          onValueChange={(value) => handleCountryChange(index, value)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder={t('addresses.selectCountry')} />
                          </SelectTrigger>
                          <SelectContent>
                            {countries.map((country) => (
                              <SelectItem key={country.code} value={country.code}>
                                {country.name} ({country.code})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">{t('addresses.district')}</Label>
                        {districts.length > 0 ? (
                          <Select
                            value={addr.district_id || ''}
                            onValueChange={(value) => handleDistrictChange(index, value)}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder={t('common.select')} />
                            </SelectTrigger>
                            <SelectContent>
                              {districts.map((district) => (
                                <SelectItem key={district.id} value={district.id}>
                                  {district.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={addr.district}
                            onChange={(e) => updateAddress(index, 'district', e.target.value)}
                            placeholder={t('addresses.districtPlaceholder')}
                            className="h-9"
                          />
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">{t('addresses.city')}</Label>
                        {municipalities.length > 0 ? (
                          <Select
                            value={addr.city_id || ''}
                            onValueChange={(value) => handleCityChange(index, value)}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder={t('common.select')} />
                            </SelectTrigger>
                            <SelectContent>
                              {municipalities.map((city) => (
                                <SelectItem key={city.id} value={city.id}>
                                  {city.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={addr.city}
                            onChange={(e) => updateAddress(index, 'city', e.target.value)}
                            placeholder="Lisboa"
                            className="h-9"
                          />
                        )}
                      </div>
                      <div>
                        <Label className="text-xs">{t('addresses.postalCode')}</Label>
                        <Input
                          value={addr.postal_code}
                          onChange={(e) => updateAddress(index, 'postal_code', e.target.value)}
                          placeholder="1000-001"
                          className="h-9"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs">{t('addresses.extra')}</Label>
                      <Textarea
                        value={addr.extra}
                        onChange={(e) => updateAddress(index, 'extra', e.target.value)}
                        placeholder={t('addresses.extraPlaceholder')}
                        rows={2}
                        className="resize-none"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Checkbox
                        id={`fiscal-${index}`}
                        checked={addr.isFiscal}
                        onCheckedChange={(checked) => updateAddress(index, 'isFiscal', !!checked)}
                      />
                      <Label htmlFor={`fiscal-${index}`} className="text-sm font-normal cursor-pointer">
                        {t('addresses.setAsFiscal')}
                      </Label>
                    </div>
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}

          <Button variant="outline" size="sm" onClick={addAddress} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            {t('addresses.addAnother')}
          </Button>
        </>
      )}
    </div>
  );
}
