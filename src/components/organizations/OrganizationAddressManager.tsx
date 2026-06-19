import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Trash2, MapPin, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/useTranslation';
import { useCountries } from '@/hooks/useCountries';
import { useAdministrativeDivisions } from '@/hooks/useAdministrativeDivisions';
import { resolveBusinessUserId } from '@/lib/identity/resolveBusinessUserId';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface AddressFormData {
  id?: string;
  link_id?: string; // anew_org_addresses.id
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
  isNew?: boolean;
}

const emptyAddress: AddressFormData = {
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
  isNew: true,
};

interface Props {
  orgId: string;
}

export function OrganizationAddressManager({ orgId }: Props) {
  const { t } = useTranslation();
  const { countries } = useCountries();
  const [addresses, setAddresses] = useState<AddressFormData[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string | null>(null);

  const { districts, municipalities, fetchMunicipalities } = useAdministrativeDivisions(
    addresses[expandedIndex ?? 0]?.country || 'PT'
  );

  // Load existing addresses
  const fetchAddresses = useCallback(async () => {
    setLoading(true);

    const { data: linkData, error: linkError } = await (supabase as any)
      .from("anew_org_addresses")
      .select("id, address_id, is_fiscal, valid_from, valid_to")
      .eq("org_id", orgId)
      .is("valid_to", null)
      .order("is_fiscal", { ascending: false });

    if (linkError) {
      console.error("Error fetching organization address links:", linkError);
      setLoading(false);
      return;
    }

    const addressIds = (linkData || []).map((item: any) => item.address_id).filter(Boolean);
    let addressData: any[] = [];

    if (addressIds.length > 0) {
      const { data, error } = await (supabase as any)
        .from("anew_addresses")
        .select("id, street, number, floor, unit, postal_code, city, district, country, extra")
        .in("id", addressIds);

      if (error) {
        console.error("Error fetching addresses:", error);
        setLoading(false);
        return;
      }

      addressData = data || [];
    }

    const addressMap = new Map(addressData.map((item: any) => [item.id, item]));

    const formattedAddresses: AddressFormData[] = (linkData || []).map((item: any) => {
      const address = addressMap.get(item.address_id);
      return {
        id: address?.id,
        link_id: item.id,
        street: address?.street || '',
        number: address?.number || '',
        floor: address?.floor || '',
        unit: address?.unit || '',
        postal_code: address?.postal_code || '',
        city: address?.city || '',
        city_id: '',
        district: address?.district || '',
        district_id: '',
        country: address?.country || 'PT',
        extra: address?.extra || '',
        isFiscal: item.is_fiscal,
        isNew: false,
      };
    });

    setAddresses(formattedAddresses);
    setExpandedIndex(null);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    if (orgId) {
      fetchAddresses();
    }
  }, [orgId, fetchAddresses]);

  // Resolve district_id from district name when districts or addresses change
  useEffect(() => {
    if (districts.length === 0 || addresses.length === 0) return;

    let needsUpdate = false;
    const updatedAddresses = addresses.map((addr, idx) => {
      if (addr.district && !addr.district_id) {
        const foundDistrict = districts.find(d =>
          d.name.toLowerCase() === addr.district.toLowerCase()
        );
        if (foundDistrict) {
          needsUpdate = true;
          // If this is the expanded address, trigger municipality loading
          if (expandedIndex === idx) {
            setSelectedDistrictId(foundDistrict.id);
          }
          return { ...addr, district_id: foundDistrict.id };
        }
      }
      return addr;
    });

    if (needsUpdate) {
      setAddresses(updatedAddresses);
    }
  }, [districts, addresses.length, expandedIndex]);

  // Trigger municipality loading when expanding an address with district_id
  useEffect(() => {
    if (expandedIndex !== null && addresses[expandedIndex]) {
      const addr = addresses[expandedIndex];
      if (addr.district_id && addr.district_id !== selectedDistrictId) {
        setSelectedDistrictId(addr.district_id);
      }
    }
  }, [expandedIndex, addresses, selectedDistrictId]);

  // Resolve city_id from city name when municipalities load
  useEffect(() => {
    if (municipalities.length === 0 || addresses.length === 0 || expandedIndex === null) return;

    const addr = addresses[expandedIndex];
    if (addr?.city && !addr.city_id) {
      const foundCity = municipalities.find(m =>
        m.name.toLowerCase() === addr.city.toLowerCase()
      );
      if (foundCity) {
        setAddresses(prev => prev.map((a, i) =>
          i === expandedIndex ? { ...a, city_id: foundCity.id } : a
        ));
      }
    }
  }, [municipalities, expandedIndex, addresses]);

  // Load municipalities when district changes
  useEffect(() => {
    if (selectedDistrictId) {
      fetchMunicipalities(selectedDistrictId);
    }
  }, [selectedDistrictId, fetchMunicipalities]);

  const addAddress = () => {
    const newAddress = { ...emptyAddress, isFiscal: addresses.length === 0 };
    const newAddresses = [...addresses, newAddress];
    setAddresses(newAddresses);
    setExpandedIndex(newAddresses.length - 1);
  };

  const handleDeleteClick = (index: number) => {
    const addr = addresses[index];

    // For new addresses (not yet saved), remove directly without confirmation
    if (addr.isNew || !addr.link_id) {
      const newAddresses = addresses.filter((_, i) => i !== index);
      setAddresses(newAddresses);

      if (expandedIndex === index) {
        setExpandedIndex(newAddresses.length > 0 ? 0 : null);
      } else if (expandedIndex !== null && expandedIndex > index) {
        setExpandedIndex(expandedIndex - 1);
      }
      return;
    }

    // For saved addresses, show confirmation dialog
    setDeleteIndex(index);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (deleteIndex === null) return;

    const addr = addresses[deleteIndex];

    if (addr.link_id) {
      // Soft delete - set valid_to
      const { error } = await (supabase as any)
        .from("anew_org_addresses")
        .update({ valid_to: new Date().toISOString() })
        .eq("id", addr.link_id);

      if (error) {
        toast.error(error.message);
        setDeleteDialogOpen(false);
        return;
      }
    }

    const newAddresses = addresses.filter((_, i) => i !== deleteIndex);
    setAddresses(newAddresses);
    
    if (expandedIndex === deleteIndex) {
      setExpandedIndex(newAddresses.length > 0 ? 0 : null);
    } else if (expandedIndex !== null && expandedIndex > deleteIndex) {
      setExpandedIndex(expandedIndex - 1);
    }

    toast.success(t("common.deleted"));
    setDeleteDialogOpen(false);
    setDeleteIndex(null);
  };

  const updateAddress = (index: number, field: keyof AddressFormData, value: string | boolean) => {
    // IMPORTANT: use functional updates so multiple consecutive calls (e.g. in handleDistrictChange)
    // don't overwrite each other due to stale closures.
    setAddresses((prev) =>
      prev.map((addr, i) => {
        // If setting isFiscal to true, unset it from all others
        if (field === 'isFiscal' && value === true) {
          return { ...addr, isFiscal: i === index };
        }

        if (i === index) {
          return { ...addr, [field]: value };
        }

        return addr;
      })
    );
  };

  const handleDistrictChange = (index: number, districtId: string) => {
    const district = districts.find(d => d.id === districtId);
    updateAddress(index, 'district_id', districtId);
    updateAddress(index, 'district', district?.name || '');
    updateAddress(index, 'city_id', '');
    updateAddress(index, 'city', '');
    setSelectedDistrictId(districtId || null);
  };

  const handleCityChange = (index: number, cityId: string) => {
    const city = municipalities.find(m => m.id === cityId);
    updateAddress(index, 'city_id', cityId);
    updateAddress(index, 'city', city?.name || '');
  };

  const handleCountryChange = (index: number, countryCode: string) => {
    updateAddress(index, 'country', countryCode);
    updateAddress(index, 'district_id', '');
    updateAddress(index, 'district', '');
    updateAddress(index, 'city_id', '');
    updateAddress(index, 'city', '');
  };

  const saveAddress = async (index: number) => {
    const addr = addresses[index];
    
    if (!addr.street || !addr.number || !addr.city || !addr.postal_code) {
      toast.error(t("common.required"));
      return;
    }

    setSaving(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const businessUserId = await resolveBusinessUserId(userData.user?.id);

      // Check for duplicate address (same street, number, postal_code, city, floor, unit) if it's a new address
      if (!addr.id) {
        const duplicateIndex = addresses.findIndex((a, i) => 
          i !== index && 
          a.id && // Only check against saved addresses
          a.street?.toLowerCase().trim() === addr.street?.toLowerCase().trim() &&
          a.number?.toLowerCase().trim() === addr.number?.toLowerCase().trim() &&
          a.postal_code?.replace(/\s/g, '') === addr.postal_code?.replace(/\s/g, '') &&
          a.city?.toLowerCase().trim() === addr.city?.toLowerCase().trim() &&
          (a.floor || '').toLowerCase().trim() === (addr.floor || '').toLowerCase().trim() &&
          (a.unit || '').toLowerCase().trim() === (addr.unit || '').toLowerCase().trim()
        );

        if (duplicateIndex !== -1) {
          toast.error(t("addresses.duplicateError") || "Esta morada já existe para esta organização");
          setSaving(false);
          return;
        }
      }

      // Call RPC to assign/update address
      const { error } = await (supabase as any).rpc('assign_address_to_org', {
        p_org_id: orgId,
        p_street: addr.street,
        p_number: addr.number,
        p_floor: addr.floor || null,
        p_unit: addr.unit || null,
        p_postal_code: addr.postal_code,
        p_city: addr.city,
        p_district: addr.district || null,
        p_country: addr.country,
        p_extra: addr.extra || null,
        p_is_fiscal: addr.isFiscal,
        p_created_by: businessUserId,
        p_existing_address_id: addr.id || null,
        p_existing_link_id: addr.link_id || null,
      });

      if (error) throw error;

      toast.success(t("common.saved"));
      await fetchAddresses();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const getAddressSummary = (addr: AddressFormData) => {
    const parts = [addr.street, addr.number, addr.postal_code, addr.city].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : t('addresses.newAddress');
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <>
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
                key={addr.link_id || `new-${index}`}
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
                          {addr.isNew ? t('addresses.newAddress') : getAddressSummary(addr)}
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
                            handleDeleteClick(index);
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
                          <Label className="text-xs">{t('addresses.street')} <span className="text-destructive">*</span></Label>
                          <Input
                            value={addr.street}
                            onChange={(e) => updateAddress(index, 'street', e.target.value)}
                            placeholder={t('addresses.streetPlaceholder')}
                            className="h-9"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">{t('addresses.number')} <span className="text-destructive">*</span></Label>
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
                              value={addr.district_id || '__none__'}
                              onValueChange={(value) => handleDistrictChange(index, value === '__none__' ? '' : value)}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder={t('addresses.selectDistrict')}>
                                  {addr.district_id 
                                    ? districts.find(d => d.id === addr.district_id)?.name || t('common.select')
                                    : t('common.select')}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">{t('common.select')}</SelectItem>
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
                          <Label className="text-xs">{t('addresses.city')} <span className="text-destructive">*</span></Label>
                          {municipalities.length > 0 ? (
                            <Select
                              value={addr.city_id || '__none__'}
                              onValueChange={(value) => handleCityChange(index, value === '__none__' ? '' : value)}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder={t('addresses.selectCity')}>
                                  {addr.city_id 
                                    ? municipalities.find(m => m.id === addr.city_id)?.name || t('common.select')
                                    : t('common.select')}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">{t('common.select')}</SelectItem>
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
                          <Label className="text-xs">{t('addresses.postalCode')} <span className="text-destructive">*</span></Label>
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

                      {/* Save button for new/changed addresses */}
                      <div className="pt-2 border-t">
                        <Button 
                          size="sm" 
                          onClick={() => saveAddress(index)}
                          disabled={saving}
                          className="w-full"
                        >
                          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          {t('common.save')}
                        </Button>
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.confirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("addresses.deleteConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
